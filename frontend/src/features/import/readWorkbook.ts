// Reads an Excel, OpenDocument or CSV file into the cell grids sheetImport.ts works on. The SheetJS
// module is passed in, so the app loads it only when someone imports and tests can pass their own.

import type * as XLSXModule from 'xlsx';
import { MAX_IMPORT_ROWS, type SheetCell, type SheetGrid } from './sheetImport';

type XLSX = typeof XLSXModule;
const MAX_COLUMNS = 60;
const pad = (n: number) => String(n).padStart(2, '0');

export function sheetToGrid(xlsx: XLSX, sheet: XLSXModule.WorkSheet, name: string): SheetGrid {
  const ref = sheet['!ref'];
  if (!ref) return { name, rows: [] };
  const range = xlsx.utils.decode_range(ref);
  const lastRow = Math.min(range.e.r, range.s.r + MAX_IMPORT_ROWS + 100);
  const lastCol = Math.min(range.e.c, range.s.c + MAX_COLUMNS - 1);
  const rows: SheetCell[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    const row: SheetCell[] = [];
    for (let c = 0; c <= lastCol; c++) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) { row.push({ raw: null, text: '' }); continue; }
      const raw = cell.v instanceof Date ? cell.v.toISOString() : (cell.v as string | number | boolean);
      const text = (cell.w ?? String(cell.v)).trim();
      let date: string | undefined;
      // A date-formatted number is a day count; read its parts with SheetJS so no time zone shifts it.
      if (cell.t === 'n' && typeof cell.v === 'number' && cell.z && xlsx.SSF.is_date(String(cell.z))) {
        const parts = xlsx.SSF.parse_date_code(cell.v);
        if (parts && parts.y >= 1990 && parts.y <= 2100) date = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`;
      } else if (cell.t === 'd' && cell.v instanceof Date) {
        date = `${cell.v.getFullYear()}-${pad(cell.v.getMonth() + 1)}-${pad(cell.v.getDate())}`;
      }
      row.push(date ? { raw, text, date } : { raw, text });
    }
    rows.push(row);
  }
  return { name, rows };
}

/** Text of a CSV file: UTF-8, or the Thai Windows encoding older Excel versions save. */
export function decodeCsv(data: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(data);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('windows-874').decode(data); } catch { return utf8; }
}

/**
 * What the file really is, from its first bytes rather than its name: Excel 2007+ / OpenDocument /
 * Numbers are zip archives, Excel 97-2003 is an OLE file, and a CSV is text with no NUL bytes.
 * A renamed program or image is refused before SheetJS reads it.
 */
export function fileKind(data: ArrayBuffer, fileName: string): 'zip' | 'ole' | 'text' | null {
  const head = new Uint8Array(data.slice(0, 4096));
  const starts = (...bytes: number[]) => bytes.every((byte, i) => head[i] === byte);
  const isText = /\.(csv|txt|tsv)$/i.test(fileName);
  if (isText) return head.includes(0) ? null : 'text';
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'zip';
  if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'ole';
  return null;
}

/** SHA-256 of the file, so the same file is recognised when it is imported again. */
export async function fileFingerprint(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function readWorkbook(xlsx: XLSX, data: ArrayBuffer, fileName: string): SheetGrid[] {
  const isCsv = /\.(csv|txt|tsv)$/i.test(fileName);
  // Only the values the file saved are read: formulas are not parsed or run, macros are never
  // loaded, and each tab is read only as far as the import can use.
  const limits = { sheetRows: MAX_IMPORT_ROWS + 200, cellFormula: false, cellHTML: false, bookVBA: false } as const;
  // CSV values stay text, so Thai dates such as 15/10/2567 are read by sheetImport, not guessed here.
  const book = isCsv
    ? xlsx.read(decodeCsv(data), { type: 'string', raw: true, cellText: true, ...limits })
    : xlsx.read(data, { type: 'array', cellDates: false, cellNF: true, cellText: true, ...limits });
  return book.SheetNames.map(name => {
    const grid = sheetToGrid(xlsx, book.Sheets[name], isCsv ? fileName.replace(/\.[^.]+$/, '') : name);
    return isCsv ? { ...grid, fromFileName: true } : grid;
  });
}

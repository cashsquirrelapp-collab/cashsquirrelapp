import { unzipSync, strFromU8 } from 'fflate';
import { maskTable } from './privacyMask.js';

// A spreadsheet sent in the LINE chat (owner, 2026-11-13: "รับไฟล์ Excel ทางแชท"), read on the server into the same text the
// app's chat makes on the person's device (frontend/src/features/assistant/fileText.ts): each tab as CSV with personal data
// masked and the totals of its number columns, at most 3,000 rows a tab and 30,000 characters. Only .xlsx (and .xlsm) and
// CSV/TSV: the zip is opened with fflate (already in the Worker), only the parts that hold values are read, nothing in the
// file is run (no formulas, no macros: a formula cell gives the value Excel saved).

export const SHEET_TEXT_MAX_CHARS = 30_000;
const SHEET_MAX_ROWS = 3000;
const UNZIPPED_MAX_BYTES = 40 * 1024 * 1024;
const TOTAL_COLUMNS_MAX = 12;

export type SheetFileKind = 'xlsx' | 'csv' | 'old';
/** What a file name says it is: an .xlsx or CSV we read, an older spreadsheet we ask to save again, or neither. */
export function sheetFileKind(name: string): SheetFileKind | null {
  if (/\.(xlsx|xlsm|xltx|xltm)$/i.test(name)) return 'xlsx';
  if (/\.(csv|tsv)$/i.test(name)) return 'csv';
  if (/\.(xls|xlsb|ods|fods|numbers)$/i.test(name)) return 'old';
  return null;
}

export class SheetFileError extends Error {
  constructor(public code: 'type' | 'empty' | 'big') { super(code); }
}

/** Text of a CSV: UTF-8 (or UTF-16 with its mark), else the Thai Windows encoding older programs save. */
export function decodeSheetText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); } catch { /* not UTF-8 */ }
  try { return new TextDecoder('windows-874').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

/** CSV / TSV rows (quotes, doubled quotes, line breaks inside quotes); the separator is the one the first line uses most. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = [',', '\t', ';'].map(sep => ({ sep, count: first.split(sep).length })).sort((a, b) => b.count - a.count)[0].sep;
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === separator) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
      if (rows.length > SHEET_MAX_ROWS + 1) break;
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map(cells => cells.map(value => value.trim()));
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) =>
  (code[0] === '#' ? String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ENTITIES[code.toLowerCase()] ?? ''));
/** The words of a shared string or an inline string: every <t>, without the phonetic guide. */
const runText = (xml: string) => unescape([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''));
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const columnIndex = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
// Built-in date formats (14–22, 45–47 and the Asian ones) or a format code with a day or a year in it.
const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateCode = (code: string) => /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
const isoOf = (serial: number) => new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000)).toISOString().slice(0, 10);
const plainNumber = (value: number) => String(Number(value.toFixed(6)));

export interface SheetGridTab { name: string; rows: string[][]; numbers: (number | null)[][]; fullRows: number }

/** The visible tabs of an .xlsx as text cells (dates as YYYY-MM-DD) and the number behind each numeric cell. */
export function readXlsxTabs(bytes: Uint8Array): SheetGridTab[] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: file => {
      const wanted = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(file.name);
      if (wanted) total += file.originalSize;
      return wanted && total <= UNZIPPED_MAX_BYTES;
    } });
  } catch { throw new SheetFileError('type'); }
  if (total > UNZIPPED_MAX_BYTES) throw new SheetFileError('big');
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new SheetFileError('type');
  const targets = new Map([...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(m => [attr(m[0], 'Id') ?? '', (attr(m[0], 'Target') ?? '').replace(/^\/?(xl\/)?/, 'xl/')]));
  const strings = [...read('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => runText(m[1]));
  const styles = read('xl/styles.xml');
  const codes = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map(m => [Number(attr(m[0], 'numFmtId')), unescape(attr(m[0], 'formatCode') ?? '')]));
  const xfs = [...(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(/<xf\b[^>]*>/g)].map(m => Number(attr(m[0], 'numFmtId') ?? 0));
  const dateStyle = xfs.map(id => BUILT_IN_DATES.has(id) || (codes.has(id) && isDateCode(codes.get(id)!)));

  const tabs: SheetGridTab[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    if (/state="(hidden|veryHidden)"/.test(sheet[0])) continue;
    const name = unescape(attr(sheet[0], 'name') ?? 'Sheet');
    const xml = read(targets.get(attr(sheet[0], 'r:id') ?? '') ?? '');
    if (!xml) continue;
    const rows: string[][] = []; const numbers: (number | null)[][] = [];
    let fullRows = 0; let next = 0;
    for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attr(row[1], 'r') ?? next + 1) - 1;
      next = r + 1;
      fullRows = Math.max(fullRows, r + 1);
      if (r >= SHEET_MAX_ROWS || !row[2]) continue;
      const cells: string[] = []; const values: (number | null)[] = [];
      let at = 0;
      for (const cell of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(cell[1], 'r');
        const c = ref ? columnIndex(ref) : at;
        at = c + 1;
        if (c < 0 || c > 200) continue;
        const type = attr(cell[1], 't') ?? 'n';
        const body = cell[2] ?? '';
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let text = ''; let number: number | null = null;
        if (type === 's' && raw !== undefined) text = strings[Number(raw)] ?? '';
        else if (type === 'inlineStr') text = runText(body);
        else if (type === 'str' && raw !== undefined) text = unescape(raw);
        else if (type === 'b' && raw !== undefined) text = raw === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'n' && raw !== undefined && raw !== '') {
          const value = Number(raw);
          if (Number.isFinite(value)) {
            const date = dateStyle[Number(attr(cell[1], 's') ?? 0)];
            text = date ? isoOf(value) : plainNumber(value);
            number = date ? null : value;
          }
        }
        cells[c] = text.trim(); values[c] = number;
      }
      rows[r] = Array.from({ length: cells.length }, (_, i) => cells[i] ?? '');
      numbers[r] = Array.from({ length: values.length }, (_, i) => values[i] ?? null);
    }
    tabs.push({ name, rows: Array.from({ length: rows.length }, (_, i) => rows[i] ?? []), numbers: Array.from({ length: numbers.length }, (_, i) => numbers[i] ?? []), fullRows });
  }
  return tabs;
}

// The column totals, as in the app's chat: rows that say รวม left out; IDs, phones, rates and day counts are not money.
const TOTAL_ROW = /^(รวม|ยอดรวม|total|grand total|subtotal|sum)(?![a-z])/i;
const NOT_AMOUNT = /(ลำดับ|^no\.?$|^#$|^เลข|รหัส|โทร|เบอร์|ผู้เสียภาษี|tax ?id|phone|^id$|^ปี(ที่)?$|^year$|account no|%|เปอร์เซ็นต์|ร้อยละ|อัตรา|percent|rate|\(วัน\)|จำนวนวัน|เครดิต|credit|days?\b)/i;
const textNumber = (text: string) => {
  const plain = text.trim().replace(/^฿|บาท$/g, '').replace(/[,\s]/g, '');
  return /^-?\d+(\.\d+)?$/.test(plain) && !/^-?\d{10,}$/.test(plain) ? Number(plain) : null;
};
function columnTotals(rows: string[][], numbers: (number | null)[][]): string {
  const head = rows.findIndex(row => row.some(cell => cell));
  if (head < 0) return '';
  const width = Math.max(...rows.map(row => row.length));
  const totals: string[] = [];
  for (let c = 0; c < width && totals.length < TOTAL_COLUMNS_MAX; c += 1) {
    const heading = rows[head][c] || `คอลัมน์ ${c + 1}`;
    if (NOT_AMOUNT.test(heading)) continue;
    let sum = 0; let count = 0;
    for (let r = head + 1; r < rows.length; r += 1) {
      if (rows[r].slice(0, 4).some(value => TOTAL_ROW.test(value))) continue;
      const known = numbers[r]?.[c];
      const value = known === undefined || known === null ? textNumber(rows[r][c] ?? '') : (Number.isInteger(known) && Math.abs(known) >= 1e9 ? null : known);
      if (value !== null) { sum += value; count += 1; }
    }
    if (count >= 2) totals.push(`${heading} = ${(Math.round(sum * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} (${count} แถว)`);
  }
  return totals.join(' · ');
}
const csvLine = (row: string[]) => { const cells = [...row]; while (cells.length && !cells[cells.length - 1]) cells.pop(); return cells.map(cell => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','); };

export interface SheetFileText { text: string; tabs: number; dataRows: number }
/** The file's text as เลขา gets it, framed with its name; throws SheetFileError('type' | 'empty' | 'big'). */
export function spreadsheetText(name: string, bytes: Uint8Array): SheetFileText {
  const kind = sheetFileKind(name);
  if (kind !== 'xlsx' && kind !== 'csv') throw new SheetFileError('type');
  const tabs: SheetGridTab[] = kind === 'csv'
    ? [(() => { const rows = parseCsv(decodeSheetText(bytes)); return { name: name.replace(/\.[^.]+$/, ''), rows: rows.slice(0, SHEET_MAX_ROWS), numbers: [], fullRows: rows.length }; })()]
    : readXlsxTabs(bytes);
  const parts: string[] = [];
  let dataRows = 0;
  for (const tab of tabs) {
    const masked = maskTable(tab.rows.map(row => row.map(cell => cell ?? '')));
    const lines = masked.map(csvLine).filter(line => line.replace(/,/g, '').trim());
    if (!lines.length) continue;
    const cut = tab.fullRows > SHEET_MAX_ROWS ? ` (แสดง ${SHEET_MAX_ROWS.toLocaleString('en-US')} แถวแรกจาก ${tab.fullRows.toLocaleString('en-US')} แถว)` : '';
    const totals = columnTotals(tab.rows, tab.numbers);
    dataRows += Math.max(0, lines.length - 1);
    parts.push(`แท็บ "${tab.name}" · ${lines.length} แถว${cut}\n${lines.join('\n')}${totals ? `\nผลรวมที่คำนวณจากไฟล์ (ทุกแถวที่เป็นตัวเลข ไม่นับแถวที่เขียนว่ารวม): ${totals}` : ''}`);
  }
  if (!parts.length) throw new SheetFileError('empty');
  let body = parts.join('\n\n');
  const chars = body.length;
  if (chars > SHEET_TEXT_MAX_CHARS) body = `${body.slice(0, SHEET_TEXT_MAX_CHARS)}\n…(ตัดเหลือ ${SHEET_TEXT_MAX_CHARS.toLocaleString('en-US')} ตัวอักษรแรก จากทั้งหมด ${chars.toLocaleString('en-US')} ตัวอักษร)`;
  return { text: `ไฟล์ "${name}" (${kind === 'csv' ? 'CSV' : 'Excel'} ที่ส่งมาในแชท LINE อ่านออกมาเป็นข้อความ)\n${body}`, tabs: parts.length, dataRows };
}

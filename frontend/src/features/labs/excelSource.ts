import type * as XLSXModule from 'xlsx';
import type { LiveCell, LiveTab, SheetMap } from '../../../../shared/googleSheets';
import { LIVE_READ } from '../../../../shared/googleSheets';
import { MAX_IMPORT_ROWS } from '../import/sheetImport';
import { decodeCsv, fileKind, sheetToGrid } from '../import/readWorkbook';

// เชื่อมไฟล์ Excel (ฟีเจอร์ทดลอง, plan phase 4 step 1; owner, 2026-11-12: "อยากให้สามารถเชื่อมกับ Excel ได้ด้วย"). The person
// picks an Excel, OpenDocument or CSV file on their own device; it is read right there with the same reader the Excel
// import uses (readWorkbook.ts) and never leaves the device. Formula cells are marked (their formulas are read as text,
// never run; macros are never loaded), so the sheet map shows them as never to be written into, as for Google Sheets.
// The confirmed map is kept on this device, so choosing the same file again reads it the same way.

type XLSX = typeof XLSXModule;
export const EXCEL_ACCEPT = '.xlsx,.xlsm,.xls,.csv,.ods';
export const EXCEL_MAX_BYTES = 15 * 1024 * 1024;

export class ExcelReadError extends Error {
  constructor(public code: 'type' | 'size' | 'empty' | 'unreadable') { super(code); this.name = 'ExcelReadError'; }
}

/** The visible tabs of a workbook as LiveTabs (the same shape a Google Sheet is read into), formula cells marked. */
export function excelTabs(xlsx: XLSX, data: ArrayBuffer, fileName: string): LiveTab[] {
  const kind = fileKind(data, fileName);
  if (!kind) throw new ExcelReadError('type');
  const isCsv = kind === 'text';
  // sheetStubs: a formula cell with no saved value (our own template before Excel has opened it) is still a cell.
  const limits = { sheetRows: MAX_IMPORT_ROWS, cellFormula: !isCsv, sheetStubs: !isCsv, cellHTML: false, bookVBA: false } as const;
  let book: XLSXModule.WorkBook;
  try {
    book = isCsv
      ? xlsx.read(decodeCsv(data), { type: 'string', raw: true, cellText: true, ...limits })
      : xlsx.read(data, { type: 'array', cellDates: false, cellNF: true, cellText: true, ...limits });
  } catch { throw new ExcelReadError('unreadable'); }
  const hidden = new Set((book.Workbook?.Sheets || []).filter(sheet => sheet.Hidden).map(sheet => sheet.name));
  const tabs = book.SheetNames.filter(name => !hidden.has(name)).slice(0, LIVE_READ.tabs).map(name => {
    const sheet = book.Sheets[name];
    const grid = sheetToGrid(xlsx, sheet, isCsv ? fileName.replace(/\.[^.]+$/, '') : name);
    const rows: LiveCell[][] = grid.rows.slice(0, MAX_IMPORT_ROWS).map((row, r) => row.slice(0, LIVE_READ.columns).map((cell, c) => {
      const source = sheet[xlsx.utils.encode_cell({ r, c })] as XLSXModule.CellObject | undefined;
      return source?.f ? { ...cell, formula: true as const } : cell;
    }));
    for (const row of rows) while (row.length && row[row.length - 1].text === '' && !row[row.length - 1].formula) row.pop();
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    const full = sheet['!fullref'] ? xlsx.utils.decode_range(String(sheet['!fullref'])) : null;
    return { name: grid.name, rows, truncated: Boolean(full && full.e.r + 1 > MAX_IMPORT_ROWS) };
  }).filter(tab => tab.rows.some(row => row.some(cell => cell.text || cell.formula)));
  if (!tabs.length) throw new ExcelReadError('empty');
  return tabs;
}

/** Reads a chosen file on the device. SheetJS loads only now, the first time a file is chosen. */
export async function readExcelFile(file: File): Promise<LiveTab[]> {
  if (!/\.(xlsx|xlsm|xls|csv|ods)$/i.test(file.name)) throw new ExcelReadError('type');
  if (file.size > EXCEL_MAX_BYTES) throw new ExcelReadError('size');
  const [data, xlsx] = await Promise.all([file.arrayBuffer(), import('xlsx')]);
  return excelTabs(xlsx, data, file.name);
}

// The maps confirmed for Excel files, on this device (the file itself is never kept). By file name; a file saved under a
// new name each month finds the map of a file with the same tabs.
const MAPS_KEY = 'krarok_excel_maps';
const MAPS_MAX = 10;
interface KeptMap { name: string; tabs: string[]; map: SheetMap }

function keptMaps(): KeptMap[] {
  try {
    const value = JSON.parse(localStorage.getItem(MAPS_KEY) || '[]') as unknown;
    return Array.isArray(value) ? value.filter((item): item is KeptMap => Boolean(item && typeof item === 'object' && typeof (item as KeptMap).name === 'string' && Array.isArray((item as KeptMap).tabs) && (item as KeptMap).map && Array.isArray((item as KeptMap).map.tabs))) : [];
  } catch { return []; }
}

export function excelMapFor(fileName: string, tabs: LiveTab[]): SheetMap | null {
  const names = tabs.map(tab => tab.name).sort().join('\n');
  const maps = keptMaps();
  return (maps.find(item => item.name === fileName) ?? maps.find(item => [...item.tabs].sort().join('\n') === names))?.map ?? null;
}

export function keepExcelMap(fileName: string, map: SheetMap): boolean {
  try {
    const next = [{ name: fileName, tabs: map.tabs.map(tab => tab.name), map }, ...keptMaps().filter(item => item.name !== fileName)].slice(0, MAPS_MAX);
    localStorage.setItem(MAPS_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

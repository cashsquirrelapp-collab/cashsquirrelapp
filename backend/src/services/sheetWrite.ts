import { UNDO_MS, type GoogleRecord, type SheetMap, type SheetWrite } from '../../../shared/googleSheets.js';
import { chooseTab, dataColumns, displayValue, letter, rowCells, type RowCell, type RowKind } from '../../../shared/sheetRow.js';
import { loadGoogle, saveGoogle } from '../repositories/google.js';
import { GoogleError, accessToken, decryptToken, googleConfigured, googleOps, type SheetOps } from './googleSheets.js';

// บันทึกลงชีตของคุณ (ฟีเจอร์ทดลอง sheetWrite, plan phase 3). A job or expense confirmed in เลขา's chat (web or LINE) is also
// written as one new row of the customer's connected sheet, laid out by their confirmed sheet map (shared/sheetRow.ts).
// The row goes under the last row that has data in the mapped columns (rows the sheet's formulas fill in advance do not
// count); formula columns are never typed into, and a formula the new row lacks is copied from the row above. The chat
// card shows that row before ยืนยัน (preview) and offers ย้อนกลับ for 30 minutes after (undo). A failed sheet write never
// costs the app's save: it is reported on the card.

export interface RowPlan {
  tab: string;
  /** The new row's number, as the sheet shows it. */
  row: number;
  headerRow: number | null;
  cells: RowCell[];
  /** The last rows already in the sheet (up to two), as the sheet shows them, for the preview. */
  before: { row: number; cells: Record<number, string> }[];
  header: Record<number, string>;
}

/** Where the record goes and what it writes, read from the sheet as it is now. */
export async function planRow(ops: SheetOps, map: SheetMap, kind: RowKind, record: Record<string, unknown>): Promise<RowPlan | null> {
  const tab = chooseTab(map, kind);
  if (!tab) return null;
  const headerRow = tab.headerRow === null ? null : tab.headerRow + 1;
  const last = Math.max(headerRow ?? 0, await ops.lastRow(tab.name, dataColumns(tab)));
  const lastColumn = Math.max(0, ...tab.columns.map(column => column.index));
  const from = Math.max((headerRow ?? 0) + 1, last - 29);
  const recent = last >= from ? await ops.readRows(tab.name, from, last, lastColumn) : [];
  const samples: Record<number, string[]> = {};
  for (const column of tab.columns) samples[column.index] = recent.map(row => row[column.index] ?? '').filter(Boolean);
  const pick = (cells: string[]) => Object.fromEntries(tab.columns.map(column => [column.index, cells[column.index] ?? '']));
  return {
    tab: tab.name,
    row: last + 1,
    headerRow,
    cells: rowCells(tab, kind, record, samples),
    before: recent.slice(-2).map((cells, index, list) => ({ row: last - list.length + 1 + index, cells: pick(cells) })),
    header: Object.fromEntries(tab.columns.map(column => [column.index, column.header])),
  };
}

/** Writes the planned row. Returns the cells it wrote or gave a formula (undo empties exactly these). */
export async function writeRow(ops: SheetOps, plan: RowPlan): Promise<string[]> {
  const formulaColumns = plan.cells.filter(cell => cell.formula).map(cell => cell.index);
  const copied: string[] = [];
  if (formulaColumns.length && plan.row - 1 > (plan.headerRow ?? 0)) {
    const present = await ops.formulaColumns(plan.tab, plan.row, formulaColumns);
    const missing = formulaColumns.filter(column => !present.has(column));
    const above = await ops.formulaColumns(plan.tab, plan.row - 1, missing);
    copied.push(...await ops.copyFormulas(plan.tab, plan.row - 1, plan.row, missing.filter(column => above.has(column))));
  }
  const values = plan.cells.filter((cell): cell is RowCell & { value: string | number } => !cell.formula && cell.value !== null).map(cell => ({ index: cell.index, value: cell.value }));
  const written = await ops.write(plan.tab, plan.row, values);
  return [...written, ...copied];
}

/** The preview the chat card shows: columns with their letters and headers, the last rows, and the new row. */
export function previewOf(plan: RowPlan, file: { name: string; url: string }) {
  return {
    file: file.name,
    url: file.url,
    tab: plan.tab,
    row: plan.row,
    columns: plan.cells.map(cell => ({ index: cell.index, letter: letter(cell.index), header: cell.header, formula: cell.formula })),
    before: plan.before.map(item => ({ row: item.row, cells: plan.cells.map(cell => item.cells[cell.index] ?? '') })),
    cells: plan.cells.map(cell => (cell.formula ? null : displayValue(cell.value))),
  };
}
export type SheetPreview = ReturnType<typeof previewOf>;

export type SheetWriteResult =
  | { status: 'written'; file: string; url: string; tab: string; row: number }
  | { status: 'failed'; error: string };

/** The account's sheet, ready to write: connected, a picked file, a confirmed map. Null when any is missing. */
export async function sheetContext(userId: string, known?: GoogleRecord | null): Promise<{ record: GoogleRecord; ops: SheetOps } | null> {
  if (!googleConfigured()) return null;
  const record = known === undefined ? await loadGoogle(userId) : known;
  if (!record?.file || !record.map || record.map.fileId !== record.file.id) return null;
  const refresh = decryptToken(record.enc);
  if (!refresh) return null;
  const { token } = await accessToken(refresh);
  return { record, ops: googleOps(token, record.file.id) };
}

const ERRORS: Record<GoogleError['code'], string> = {
  reconnect: 'การเชื่อม Google หมดอายุ กรุณาเชื่อมใหม่ที่ ตั้งค่า › ฟีเจอร์ทดลอง',
  scope: 'ยังไม่ได้อนุญาตให้เขียนไฟล์ใน Google Drive',
  notFound: 'ไม่พบไฟล์หรือแท็บในชีต อาจถูกลบหรือเปลี่ยนชื่อ',
  denied: 'ไม่มีสิทธิ์เขียนไฟล์นี้',
  notSheet: 'ไฟล์นี้ไม่ใช่ Google Sheets',
  failed: 'Google ไม่ตอบกลับ',
};

/** Called after the app saved a confirmed job or expense: writes the same record into the sheet, keeps what was written
 *  for the card and for undo. Null when the account has no sheet ready (nothing is said then). */
export async function writeRecordToSheet(userId: string, proposalId: string, kind: RowKind, record: Record<string, unknown>, now = new Date()): Promise<SheetWriteResult | null> {
  let context: Awaited<ReturnType<typeof sheetContext>>;
  try {
    const known = await loadGoogle(userId);
    // Connected with a file but no confirmed map yet: say so rather than guess the columns.
    if (known?.file && (!known.map || known.map.fileId !== known.file.id)) return { status: 'failed', error: 'ยังไม่ได้บันทึกแผนที่ชีต กรุณาตรวจและบันทึกแผนที่ที่ ตั้งค่า › ฟีเจอร์ทดลอง' };
    context = await sheetContext(userId, known);
  }
  catch (error) {
    const message = error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed;
    await keepWrite(userId, { proposalId, at: now.toISOString(), ok: false, error: message }).catch(() => undefined);
    return { status: 'failed', error: message };
  }
  if (!context) return null;
  const { record: google, ops } = context;
  try {
    const plan = await planRow(ops, google.map!, kind, record);
    if (!plan) return { status: 'failed', error: kind === 'expense' ? 'แผนที่ชีตยังไม่มีแท็บรายจ่าย' : 'แผนที่ชีตยังไม่มีแท็บรายรับหรืองาน' };
    const cells = await writeRow(ops, plan);
    await saveGoogle(userId, { ...google, lastWrite: { proposalId, at: now.toISOString(), ok: true, fileId: google.file!.id, tab: plan.tab, row: plan.row, cells } });
    return { status: 'written', file: google.file!.name, url: google.file!.url, tab: plan.tab, row: plan.row };
  } catch (error) {
    const message = error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed;
    await saveGoogle(userId, { ...google, lastWrite: { proposalId, at: now.toISOString(), ok: false, error: message } }).catch(() => undefined);
    return { status: 'failed', error: message };
  }
}

async function keepWrite(userId: string, write: SheetWrite) {
  const record = await loadGoogle(userId);
  if (record) await saveGoogle(userId, { ...record, lastWrite: write });
}

/** What became of the sheet write for this card (the card asks after ยืนยัน). */
export function writeFor(record: GoogleRecord | null, proposalId: string, now = Date.now()) {
  const write = record?.lastWrite;
  if (!write || write.proposalId !== proposalId) return null;
  if (!write.ok) return { status: 'failed' as const, error: write.error ?? ERRORS.failed };
  return {
    status: write.undone ? 'undone' as const : 'written' as const,
    file: record?.file?.id === write.fileId ? record?.file?.name ?? '' : '',
    url: record?.file?.id === write.fileId ? record?.file?.url ?? '' : '',
    tab: write.tab ?? '', row: write.row ?? 0,
    canUndo: !write.undone && now - Date.parse(write.at) < UNDO_MS && record?.file?.id === write.fileId,
  };
}

/** ย้อนกลับ: empties the cells of the last write, within 30 minutes, if it is still the connected file. */
export async function undoWrite(userId: string, proposalId: string, now = Date.now()): Promise<boolean> {
  const context = await sheetContext(userId);
  const write = context?.record.lastWrite;
  if (!context || !write?.ok || write.undone || write.proposalId !== proposalId || write.fileId !== context.record.file?.id || now - Date.parse(write.at) >= UNDO_MS) return false;
  await context.ops.clear(write.tab ?? '', write.cells ?? []);
  await saveGoogle(userId, { ...context.record, lastWrite: { ...write, undone: true } });
  return true;
}

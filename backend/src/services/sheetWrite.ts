import { UNDO_MS, sheetRowUrl, type GoogleRecord, type SheetMap, type SheetWrite } from '../../../shared/googleSheets.js';
import { chooseTab, dataColumns, displayValue, letter, rowCells, valueFor, type RowCell, type RowKind } from '../../../shared/sheetRow.js';
import { evaluateRow, shiftFormula } from '../../../shared/sheetFormula.js';
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
  /** What the customer's own formulas will make of the new row (null where the reader cannot tell). */
  computed?: Record<number, number | null>;
  /** Formula columns that will come out different from the app's own figure for the same thing. */
  differs?: { index: number; header: string; sheet: number; app: number }[];
}

const MONEY_TARGETS = new Set(['value', 'amount', 'income', 'expense', 'received', 'pending', 'whtAmount']);
const asNumber = (value: string | number | null): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?[\d,]+(?:\.\d+)?$/.test(value.trim())) return Number(value.replace(/,/g, ''));
  return null;
};

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
  const row = last + 1;
  const cells = rowCells(tab, kind, record, samples);
  // The customer's formulas for the new row: its own (a row filled in advance) or the row above's, copied down as the
  // write will copy them. Read by the fixed formula reader; a formula it cannot read stays "คำนวณเอง".
  const formulaColumns = cells.filter(cell => cell.formula).map(cell => cell.index);
  let computed: Record<number, number | null> | undefined;
  const differs: NonNullable<RowPlan['differs']> = [];
  if (formulaColumns.length) {
    const own = await ops.formulaTexts(tab.name, row, formulaColumns).catch(() => ({} as Record<number, string>));
    const missing = formulaColumns.filter(column => !own[column]);
    const above = missing.length && last > (headerRow ?? 0) ? await ops.formulaTexts(tab.name, last, missing).catch(() => ({} as Record<number, string>)) : {};
    const formulas: Record<number, string> = { ...Object.fromEntries(Object.entries(above).map(([column, formula]) => [column, shiftFormula(formula, last, row)])), ...own };
    const typed = Object.fromEntries(cells.filter(cell => !cell.formula && cell.value !== null).map(cell => [cell.index, asNumber(cell.value)]));
    computed = evaluateRow(formulas, row, typed);
    // Where the sheet's formula and the app count the same thing differently (a 3% the app does not withhold).
    for (const cell of cells) {
      const sheet = computed[cell.index];
      if (!cell.formula || sheet === null || sheet === undefined || !MONEY_TARGETS.has(cell.target)) continue;
      const column = tab.columns.find(item => item.index === cell.index)!;
      const app = asNumber(valueFor({ ...column, formula: false }, kind, record, samples[cell.index] ?? [], tab.kind === 'mixed')) ?? 0;
      if (Math.abs(sheet - app) >= 0.01) differs.push({ index: cell.index, header: cell.header, sheet, app });
    }
  }
  return {
    tab: tab.name,
    row,
    headerRow,
    cells,
    before: recent.slice(-2).map((cells, index, list) => ({ row: last - list.length + 1 + index, cells: pick(cells) })),
    header: Object.fromEntries(tab.columns.map(column => [column.index, column.header])),
    ...(computed ? { computed } : {}),
    ...(differs.length ? { differs } : {}),
  };
}

/** A figure the way the column shows its money: two decimals when the rows above have them. */
const moneyLike = (value: number, shown: string[]) => value.toLocaleString('en-US', shown.some(text => /\.\d{2}$/.test(text.trim()))
  ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });

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
    /** What the sheet's formulas will show in the formula cells ("2,910.00"), or null: "คำนวณเอง". */
    computed: plan.cells.map(cell => {
      const value = cell.formula ? plan.computed?.[cell.index] : null;
      return value === null || value === undefined ? null : moneyLike(value, plan.before.map(item => item.cells[cell.index] ?? ''));
    }),
    differs: (plan.differs ?? []).map(item => {
      const shown = plan.before.map(row => row.cells[item.index] ?? '');
      return { header: item.header, sheet: moneyLike(item.sheet, shown), app: moneyLike(item.app, shown) };
    }),
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
    // ดูในชีต on the card opens this very row: the tab's id, and the row across the mapped columns.
    const gid = await ops.tabId(plan.tab).catch(() => undefined);
    const span = Math.max(0, ...plan.cells.map(cell => cell.index));
    // What the customer's formulas actually showed, read back from the sheet (the card says "ชีตคิดได้ …").
    const back = plan.cells.some(cell => cell.formula) ? (await ops.readRows(plan.tab, plan.row, plan.row, span).catch(() => [] as string[][]))[0] ?? [] : [];
    const sheetValues = plan.cells.filter(cell => cell.formula && (back[cell.index] ?? '').trim()).slice(0, 10)
      .map(cell => ({ header: cell.header.slice(0, 200), text: String(back[cell.index]).trim().slice(0, 100) }));
    await saveGoogle(userId, { ...google, lastWrite: { proposalId, at: now.toISOString(), ok: true, fileId: google.file!.id, tab: plan.tab, row: plan.row, cells, ...(gid === undefined ? {} : { gid }), span, ...(sheetValues.length ? { sheetValues } : {}) } });
    return { status: 'written', file: google.file!.name, url: gid === undefined ? google.file!.url : sheetRowUrl(google.file!.id, gid, plan.row, span), tab: plan.tab, row: plan.row };
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
    url: record?.file?.id === write.fileId ? (write.gid === undefined ? record?.file?.url ?? '' : sheetRowUrl(write.fileId!, write.gid, write.row, write.span ?? 0)) : '',
    tab: write.tab ?? '', row: write.row ?? 0,
    canUndo: !write.undone && now - Date.parse(write.at) < UNDO_MS && record?.file?.id === write.fileId,
    ...(write.sheetValues?.length ? { values: write.sheetValues } : {}),
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

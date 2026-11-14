import { UNDO_MS, sheetRowUrl, type GoogleRecord, type SheetMap, type SheetWrite } from '../../../shared/googleSheets.js';
import { chooseTab, dataColumns, displayValue, letter, rowCells, valueFor, type RowCell, type RowKind } from '../../../shared/sheetRow.js';
import { evaluateRow, shiftFormula } from '../../../shared/sheetFormula.js';
import { isValidWhtRate, roundMoney, whtAmountFor } from '../../../shared/wht.js';
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
  /** The amount before withholding, when the typed amount may be what came in after it (grossOffer). */
  gross?: GrossOffer;
}

/**
 * ยอดสุทธิ → ยอดก่อนหัก (owner's plan for the customer's formulas, 2026-11-14: "ลูกค้าพิมพ์ในแชทว่า ได้โอนมา 9,700 แต่ชีตเขา
 * กรอกค่าจ้างก่อนหัก → เลขาคิดย้อนให้ว่าค่าจ้างคือ 10,000 แล้วถามก่อน"; asked to build it 2026-11-15). When the customer's own
 * formulas withhold from the amount (a withholding column of 3% of it, or a "transferred" column of 97% of it) and the app's
 * record withholds nothing, the card asks whether the amount typed is what came in after withholding, and offers the amount
 * before it. The figure comes from the formula, read by the fixed reader (shared/sheetFormula.ts) and checked both ways:
 * the app's own withholding of it leaves exactly the typed amount, and the sheet's formulas are worked out again with it.
 * Only a formula proportional to the amount counts (no fixed part, no threshold); otherwise nothing is offered.
 */
export interface GrossOffer {
  /** The amount before withholding, and the app's rate and withholding for it. */
  value: number; rate: number; wht: number;
  /** The amount typed, which is what is left after withholding. */
  net: number;
  valueIndex: number; valueHeader: string;
  /** The sheet's own "transferred" and withholding columns, with what they show for the new amount. */
  netColumn?: { index: number; header: string; sheet: number };
  whtColumn?: { index: number; header: string; sheet: number };
}

const AMOUNT_TARGETS = new Set(['value', 'amount', 'income']);

export function grossOffer(input: { cells: RowCell[]; formulas: Record<number, string>; row: number; typed: Record<number, number | null>; record: Record<string, unknown> }): GrossOffer | null {
  const { cells, formulas, row, typed, record } = input;
  if (Number(record.whtRate) > 0 || Number(record.whtAmount) > 0) return null;
  // An installment plan is checked against the amount; it is changed in the app, not from here.
  if (Array.isArray(record.installments) && record.installments.length) return null;
  const amounts = cells.filter(cell => !cell.formula && AMOUNT_TARGETS.has(cell.target));
  if (amounts.length !== 1) return null;
  const amount = amounts[0];
  const net = asNumber(amount.value);
  if (!net || net <= 0) return null;
  const at = (value: number) => evaluateRow(formulas, row, { ...typed, [amount.index]: value });
  const zero = at(0), probe = at(1000), double = at(2000);
  let whtRate: number | null = null, netRate: number | null = null;
  let whtCell: RowCell | undefined, netCell: RowCell | undefined;
  for (const cell of cells) {
    if (!cell.formula) continue;
    const a = zero[cell.index], b = probe[cell.index], c = double[cell.index];
    if (a === null || a === undefined || b === null || b === undefined || c === null || c === undefined) continue;
    // Proportional to the amount: nothing at 0, twice as much at twice the amount.
    if (Math.abs(a) > 0.005 || Math.abs(c - 2 * b) > 0.01) continue;
    const share = b / 1000;
    if (cell.target === 'whtAmount' && share > 0 && share <= 0.15 && !whtCell) { whtRate = share; whtCell = cell; }
    else if (share >= 0.85 && share < 1 - 1e-9 && !netCell) { netRate = 1 - share; netCell = cell; }
  }
  const share = whtRate ?? netRate;
  if (share === null || (whtRate !== null && netRate !== null && Math.abs(whtRate - netRate) > 1e-6)) return null;
  const rate = Math.round(share * 10000) / 100;
  if (Math.abs(share * 100 - rate) > 1e-6 || !isValidWhtRate(rate) || rate <= 0) return null;
  // The amount whose withholding, as the app works it out, leaves exactly what was typed.
  const first = roundMoney(net / (1 - rate / 100));
  const value = [0, -0.01, 0.01, -0.02, 0.02].map(step => roundMoney(first + step)).find(candidate => roundMoney(candidate - whtAmountFor(candidate, rate)) === net);
  if (value === undefined) return null;
  const sheet = at(value);
  const shown = (cell: RowCell | undefined) => (cell && typeof sheet[cell.index] === 'number' ? { index: cell.index, header: cell.header, sheet: sheet[cell.index]! } : undefined);
  const netColumn = shown(netCell), whtColumn = shown(whtCell);
  // The sheet must come out the same with the new amount: what came in, and the app's own withholding (a threshold the
  // probes missed, such as "3% from 1,000 up", shows here).
  if (netColumn && Math.abs(netColumn.sheet - net) > 0.011) return null;
  if (whtColumn && Math.abs(whtColumn.sheet - whtAmountFor(value, rate)) > 0.011) return null;
  return { value, rate, wht: whtAmountFor(value, rate), net, valueIndex: amount.index, valueHeader: amount.header,
    ...(netColumn ? { netColumn } : {}), ...(whtColumn ? { whtColumn } : {}) };
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
  let gross: GrossOffer | null = null;
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
    if (kind === 'job') gross = grossOffer({ cells, formulas, row, typed, record });
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
    ...(gross ? { gross } : {}),
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
    /** ยอดก่อนหัก: the amount before withholding, as the card offers it (the edit it makes: value + wht_rate). */
    ...(plan.gross ? { gross: grossShown(plan, plan.gross) } : {}),
  };
}

function grossShown(plan: RowPlan, gross: GrossOffer) {
  const style = (index: number, value: number) => moneyLike(value, plan.before.map(row => row.cells[index] ?? ''));
  return {
    value: gross.value, rate: gross.rate,
    valueText: style(gross.valueIndex, gross.value), netText: style(gross.valueIndex, gross.net), whtText: style(gross.valueIndex, gross.wht),
    valueHeader: gross.valueHeader,
    ...(gross.netColumn ? { netHeader: gross.netColumn.header, sheetNet: style(gross.netColumn.index, gross.netColumn.sheet) } : {}),
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

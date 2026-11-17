import { KEPT_WRITES, UNDO_MS, sheetRowUrl, type GoogleRecord, type SheetMap, type SheetWrite } from '../../../shared/googleSheets.js';
import { chooseTab, dataColumns, displayValue, letter, rowCells, valueFor, type DeletedRecordRow, type RowCell, type RowKind } from '../../../shared/sheetRow.js';
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
/** One read of a tab, shared by the rows of several cards going into it (a paste of many records). */
export type TabRead = { last: number; recent: string[][] };

/**
 * Where the record goes and what it writes, read from the sheet as it is now. `offset`: how many rows other cards of the same
 * answer take before this one (owner, 2026-11-16: "อยู่ลำดับที่ 6 แล้วอันต่อไปเป็นพรีวิวก็จะเป็นลำดับที่ 7 ลำดับที่ 8 ไม่ต้อง
 * เป็นลำดับ 6 ซ้ำกัน"); `reads` keeps each tab's read for them.
 */
export async function planRow(ops: SheetOps, map: SheetMap, kind: RowKind, record: Record<string, unknown>,
  options: { offset?: number; reads?: Map<string, TabRead> } = {}): Promise<RowPlan | null> {
  const tab = chooseTab(map, kind);
  if (!tab) return null;
  const headerRow = tab.headerRow === null ? null : tab.headerRow + 1;
  const lastColumn = Math.max(0, ...tab.columns.map(column => column.index));
  let read = options.reads?.get(tab.name);
  if (!read) {
    const lastRow = Math.max(headerRow ?? 0, await ops.lastRow(tab.name, dataColumns(tab)));
    const start = Math.max((headerRow ?? 0) + 1, lastRow - 29);
    read = { last: lastRow, recent: lastRow >= start ? await ops.readRows(tab.name, start, lastRow, lastColumn) : [] };
    options.reads?.set(tab.name, read);
  }
  const { last, recent } = read;
  const samples: Record<number, string[]> = {};
  for (const column of tab.columns) samples[column.index] = recent.map(row => row[column.index] ?? '').filter(Boolean);
  const pick = (cells: string[]) => Object.fromEntries(tab.columns.map(column => [column.index, cells[column.index] ?? '']));
  const row = last + 1 + Math.max(0, options.offset ?? 0);
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
    await saveGoogle(userId, withWrite(google, { proposalId, at: now.toISOString(), ok: true, fileId: google.file!.id, tab: plan.tab, row: plan.row, cells, ...(gid === undefined ? {} : { gid }), span, ...(sheetValues.length ? { sheetValues } : {}) }));
    return { status: 'written', file: google.file!.name, url: gid === undefined ? google.file!.url : sheetRowUrl(google.file!.id, gid, plan.row, span), tab: plan.tab, row: plan.row };
  } catch (error) {
    const message = error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed;
    await saveGoogle(userId, withWrite(google, { proposalId, at: now.toISOString(), ok: false, error: message })).catch(() => undefined);
    return { status: 'failed', error: message };
  }
}

/** The record with this write kept: the last one, and in the recent list (one per card). */
export function withWrite(record: GoogleRecord, write: SheetWrite): GoogleRecord {
  return { ...record, lastWrite: write, writes: [...(record.writes ?? []).filter(item => item.proposalId !== write.proposalId), write].slice(-KEPT_WRITES) };
}
const writeOf = (record: GoogleRecord | null | undefined, proposalId: string) =>
  record?.writes?.find(item => item.proposalId === proposalId) ?? (record?.lastWrite?.proposalId === proposalId ? record.lastWrite : null);

async function keepWrite(userId: string, write: SheetWrite) {
  const record = await loadGoogle(userId);
  if (record) await saveGoogle(userId, withWrite(record, write));
}

/** What became of the sheet write for this card (the card asks after ยืนยัน). */
export function writeFor(record: GoogleRecord | null, proposalId: string, now = Date.now()) {
  const write = writeOf(record, proposalId);
  if (!write) return null;
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

// Deleted in the app, deleted in the sheet (owner, 2026-11-17: "ถ้ากูลบโปรเจกต์นั้นออกแล้วใน Google Sheet ก็ต้องลบออกด้วยดิ"):
// a job or an expense taken from the connected sheet (its sheetLink) is deleted there too, the whole row. Rows move (a row
// inserted above, a sort), so the row is checked before it goes: the linked row when it still has the record's name and
// amount; otherwise the row of the same tab with the same name and amount nearest to it; otherwise nothing is deleted. A header
// row is never touched. Google keeps the sheet's version history, so a row deleted by mistake can be brought back there.
export type { DeletedRecordRow };
export interface DeleteRowsResult { deleted: number; notFound: number; error?: string }
const MAX_DELETE_SCAN = 3000;
const plainText = (text: unknown) => String(text ?? '').toLowerCase().replace(/\s+/g, '');
const moneyIn = (text: string) => { const cleaned = String(text).replace(/[^0-9.-]/g, ''); const value = cleaned ? Number(cleaned) : NaN; return Number.isFinite(value) ? value : NaN; };

type TabRows = { first: number; rows: string[][] };

/** Where each record's row is now: { tab, row } or null. The tabs read on the way are kept in `reads` (from the first data row). */
async function locateRecordRows(ops: SheetOps, map: SheetMap, rows: DeletedRecordRow[], reads = new Map<string, TabRows>()) {
  const chosen = new Map<string, Set<number>>();
  const found: ({ tab: string; row: number } | null)[] = [];
  for (const item of rows) {
    const tab = map.tabs.find(candidate => candidate.name === item.tab);
    const nameColumns = tab?.columns.filter(column => column.target === 'name' || (item.kind === 'job' && column.target === 'project')).map(column => column.index) ?? [];
    const moneyTargets = item.kind === 'job' ? ['value', 'amount', 'income'] : ['amount', 'expense'];
    const moneyColumns = tab?.columns.filter(column => moneyTargets.includes(column.target)).map(column => column.index) ?? [];
    if (!tab || !nameColumns.length || !plainText(item.name)) { found.push(null); continue; }
    const first = (tab.headerRow === null ? 0 : tab.headerRow + 1) + 1;
    let read = reads.get(tab.name);
    if (!read) {
      const last = Math.min(await ops.lastRow(tab.name, dataColumns(tab)), first + MAX_DELETE_SCAN);
      const lastColumn = Math.max(0, ...tab.columns.map(column => column.index));
      read = { first, rows: last >= first ? await ops.readRows(tab.name, first, last, lastColumn) : [] };
      reads.set(tab.name, read);
    }
    const sameName = (cells: string[]) => nameColumns.some(index => plainText(cells[index]) === plainText(item.name));
    const sameMoney = (cells: string[]) => !moneyColumns.length || moneyColumns.some(index => Math.abs(moneyIn(cells[index] ?? '') - item.amount) < 0.005);
    const taken = chosen.get(tab.name) ?? new Set<number>();
    const cellsAt = (row: number) => read!.rows[row - read!.first] ?? [];
    let row: number | null = item.row >= first && !taken.has(item.row) && sameName(cellsAt(item.row)) && sameMoney(cellsAt(item.row)) ? item.row : null;
    if (row === null) {
      let nearest = Infinity;
      read.rows.forEach((cells, index) => {
        const candidate = read!.first + index;
        if (!taken.has(candidate) && sameName(cells) && sameMoney(cells) && Math.abs(candidate - item.row) < nearest) { nearest = Math.abs(candidate - item.row); row = candidate; }
      });
    }
    if (row === null) { found.push(null); continue; }
    taken.add(row);
    chosen.set(tab.name, taken);
    found.push({ tab: tab.name, row });
  }
  return { found, reads };
}

/** Finds each deleted record's row in the sheet and deletes those rows; what could not be found is counted. */
export async function deleteRecordRows(ops: SheetOps, map: SheetMap, rows: DeletedRecordRow[]): Promise<DeleteRowsResult> {
  const { found } = await locateRecordRows(ops, map, rows);
  const byTab = new Map<string, number[]>();
  for (const spot of found) if (spot) byTab.set(spot.tab, [...(byTab.get(spot.tab) ?? []), spot.row]);
  let deleted = 0;
  for (const [tab, picked] of byTab) { await ops.deleteRows(tab, picked); deleted += picked.length; }
  return { deleted, notFound: found.filter(spot => !spot).length };
}

// Added or changed in the app, the same in the sheet (owner, 2026-11-18: "ค่าใน Google Sheet กับค่าในโปรแกรมกูมันทำไมไม่
// เหมือนกัน ... กูอยากทำให้มันแบบเหมือนกัน"): a job or an expense saved from the app's own forms goes into the connected sheet
// as well. A new one becomes a new row under the last, written as เลขา's cards write (planRow, writeRow); a changed one is
// written over its own row, found the way a delete finds it (by the name and amount it had before), the customer's formula
// columns never touched. Where its row cannot be found, nothing is written.
export type AppRowResult = { status: 'written'; fileId: string; tab: string; row: number; gid?: number } | { status: 'notFound' } | { status: 'failed'; error: string };

/** Writes a record saved in the app into its row of the given tab (an existing row: formulas and kept columns left as they are). */
export async function writeOverRow(ops: SheetOps, map: SheetMap, kind: RowKind, record: Record<string, unknown>, spot: { tab: string; row: number }, read: TabRows | undefined): Promise<string[]> {
  const tab = map.tabs.find(candidate => candidate.name === spot.tab);
  if (!tab) return [];
  const near = (read?.rows ?? []).slice(Math.max(0, spot.row - read!.first - 15), Math.max(0, spot.row - read!.first + 15));
  const samples: Record<number, string[]> = {};
  for (const column of tab.columns) samples[column.index] = near.map(cells => cells[column.index] ?? '').filter(Boolean);
  const values = rowCells(tab, kind, record, samples)
    .filter((cell): cell is RowCell & { value: string | number } => !cell.formula && cell.value !== null).map(cell => ({ index: cell.index, value: cell.value }));
  return ops.write(tab.name, spot.row, values);
}

export async function saveAppRecord(userId: string, input: { kind: RowKind; record: Record<string, unknown>; before?: DeletedRecordRow | null }): Promise<AppRowResult | null> {
  let context: Awaited<ReturnType<typeof sheetContext>>;
  try { context = await sheetContext(userId); }
  catch (error) { return { status: 'failed', error: error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed }; }
  if (!context) return null;
  const { record: google, ops } = context;
  const fileId = google.file!.id;
  try {
    if (input.before) {
      if (input.before.fileId !== fileId) return { status: 'notFound' };
      const { found: [spot], reads } = await locateRecordRows(ops, google.map!, [input.before]);
      if (!spot) return { status: 'notFound' };
      await writeOverRow(ops, google.map!, input.kind, input.record, spot, reads.get(spot.tab));
      const gid = await ops.tabId(spot.tab).catch(() => undefined);
      return { status: 'written', fileId, tab: spot.tab, row: spot.row, ...(gid === undefined ? {} : { gid }) };
    }
    const plan = await planRow(ops, google.map!, input.kind, input.record);
    if (!plan) return { status: 'failed', error: input.kind === 'expense' ? 'แผนที่ชีตยังไม่มีแท็บรายจ่าย' : 'แผนที่ชีตยังไม่มีแท็บรายรับหรืองาน' };
    await writeRow(ops, plan);
    const gid = await ops.tabId(plan.tab).catch(() => undefined);
    return { status: 'written', fileId, tab: plan.tab, row: plan.row, ...(gid === undefined ? {} : { gid }) };
  } catch (error) {
    return { status: 'failed', error: error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed };
  }
}

/** The account's connected sheet: deletes the rows of records deleted in the app. Null when no sheet is ready; never throws. */
export async function deleteSheetRows(userId: string, rows: DeletedRecordRow[]): Promise<DeleteRowsResult | null> {
  let context: Awaited<ReturnType<typeof sheetContext>>;
  try { context = await sheetContext(userId); }
  catch (error) { return { deleted: 0, notFound: 0, error: error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed }; }
  if (!context) return null;
  const mine = rows.filter(row => row.fileId === context!.record.file!.id);
  if (!mine.length) return { deleted: 0, notFound: rows.length };
  try { return await deleteRecordRows(context.ops, context.record.map!, mine); }
  catch (error) { return { deleted: 0, notFound: 0, error: error instanceof GoogleError ? ERRORS[error.code] : ERRORS.failed }; }
}

/** ย้อนกลับ: empties the cells of the last write, within 30 minutes, if it is still the connected file. */
export async function undoWrite(userId: string, proposalId: string, now = Date.now()): Promise<boolean> {
  const context = await sheetContext(userId);
  const write = writeOf(context?.record, proposalId);
  if (!context || !write?.ok || write.undone || write.fileId !== context.record.file?.id || now - Date.parse(write.at) >= UNDO_MS) return false;
  await context.ops.clear(write.tab ?? '', write.cells ?? []);
  const undone = { ...write, undone: true };
  const record = withWrite(context.record, undone);
  await saveGoogle(userId, context.record.lastWrite?.proposalId === proposalId ? record : { ...record, lastWrite: context.record.lastWrite });
  return true;
}

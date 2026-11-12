import type { SheetMap, SheetMapColumn, SheetMapTab } from './googleSheets.js';

// บันทึกลงชีตของคุณ (ฟีเจอร์ทดลอง sheetWrite, plan phase 3; owner, 2026-11-12: "อยากทำให้มันสามารถแก้ได้ โดยที่เราบันทึกผ่าน
// เลขากระรอกแชท ในไลน์ได้ ในแชทกระรอกในเว็บได้"). A job or an expense เลขา prepared becomes one new row of the customer's
// own sheet, laid out by the sheet map the customer confirmed: each mapped column gets its value, formula columns are
// left to the sheet ("คำนวณเอง"), columns the map does not use stay empty. Shared by the server (it writes) and the chat
// card (it shows the row before ยืนยัน). Owner's choice the same day: the record is saved in the app as well.

export type RowKind = 'job' | 'expense';

export interface RowCell {
  index: number;
  header: string;
  target: string;
  /** Worked out by the sheet's formula: never written. */
  formula: boolean;
  /** What is written (a number, or text as typed), or null for nothing. */
  value: string | number | null;
}

/** The tab a record goes into: the first counted tab of its kind, else the first counted tab that mixes both. */
export function chooseTab(map: SheetMap | null | undefined, kind: RowKind): SheetMapTab | null {
  const tabs = (map?.tabs ?? []).filter(tab => tab.use && tab.columns.some(column => column.target !== 'keep' && column.target !== 'ignore'));
  return tabs.find(tab => tab.kind === (kind === 'job' ? 'jobs' : 'expenses')) ?? tabs.find(tab => tab.kind === 'mixed') ?? null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
const money = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) / 100 : null; };
const isoDate = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

/** A date in the way the column already writes its dates: Thai Buddhist-year text (15/10/2569) stays text, anything
 *  else is typed as an ISO date, which the sheet turns into a real date. */
export function dateFor(iso: string, samples: string[]): string {
  const [y, m, d] = iso.split('-').map(Number);
  const buddhistText = samples.some(sample => /^\d{1,2}\/\d{1,2}\/25\d\d$/.test(sample.trim()));
  return buddhistText ? `'${d}/${m}/${y + 543}` : iso;
}

/** The word the column already uses for this payment state ("ได้รับเงินแล้ว", "Paid" …), else the app's own. */
export function statusFor(paid: 'paid' | 'partial' | 'unpaid', samples: string[]): string {
  const words: Record<typeof paid, RegExp> = {
    paid: /(ได้รับ|รับแล้ว|จ่ายแล้ว|ครบ|ชำระแล้ว|โอนแล้ว|paid|done|received|complete)/i,
    partial: /(มัดจำ|บางส่วน|partial|deposit)/i,
    unpaid: /(ยังไม่|ค้าง|รอ|pending|unpaid|due|outstanding)/i,
  };
  const found = samples.map(sample => sample.trim()).find(sample => sample && words[paid].test(sample) && !(paid === 'paid' && words.unpaid.test(sample)));
  return found ?? (paid === 'paid' ? 'ได้รับเงินแล้ว' : paid === 'partial' ? 'มัดจำแล้ว' : 'ยังไม่จ่าย');
}

function paymentOf(record: Record<string, unknown>): 'paid' | 'partial' | 'unpaid' {
  const value = money(record.value) ?? 0;
  const received = money(record.received) ?? 0;
  const status = text(record.paymentStatus) || text(record.status);
  if (status === 'done' || status === 'paid' || (value > 0 && received >= value)) return 'paid';
  if (status === 'partial' || received > 0) return 'partial';
  return 'unpaid';
}

/** The value one mapped column gets for this record, before any formatting to the column's own style. */
function valueFor(column: SheetMapColumn, kind: RowKind, record: Record<string, unknown>, samples: string[], mixed: boolean): string | number | null {
  const target = column.target;
  if (kind === 'expense') {
    switch (target) {
      case 'name': return text(record.name) || null;
      case 'category': return text(record.category) || null;
      case 'amount': case 'expense': return money(record.amount);
      case 'date': { const date = isoDate(record.date); return date ? dateFor(date, samples) : null; }
      case 'note': return text(record.note) || null;
      case 'kind': return mixed ? (samples.find(sample => /(จ่าย|expense|out)/i.test(sample)) ?? 'รายจ่าย') : null;
      default: return null;
    }
  }
  const rate = money(record.whtRate) ?? 0;
  const value = money(record.value);
  switch (target) {
    case 'name': return text(record.name) || null;
    case 'client': return text(record.client) || null;
    case 'type': return text(record.type) || null;
    case 'value': case 'amount': case 'income': return value;
    case 'received': return money(record.received);
    case 'pending': return money(record.pending);
    case 'whtRate': return rate ? (samples.some(sample => sample.includes('%')) ? `${rate}%` : rate) : null;
    case 'whtAmount': return rate && value ? Math.round(value * rate) / 100 : null;
    case 'status': return statusFor(paymentOf(record), samples);
    case 'creditTerm': { const days = money(record.creditTerm); return days ? days : null; }
    case 'date': case 'postDate': { const date = isoDate(target === 'date' ? (record.postDate ?? record.payDate) : record.postDate); return date ? dateFor(date, samples) : null; }
    case 'dueDate': { const date = isoDate(record.dueDate ?? record.payDate); return date && paymentOf(record) !== 'paid' ? dateFor(date, samples) : null; }
    case 'paidDate': { const date = isoDate(record.payDate); return date && paymentOf(record) === 'paid' ? dateFor(date, samples) : null; }
    case 'note': return text(record.note) || null;
    case 'kind': return mixed ? (samples.find(sample => /(รับ|income|in\b)/i.test(sample)) ?? 'รายรับ') : null;
    default: return null;
  }
}

/** The new row for this record in this tab: one cell per mapped column, in column order. `samples` are the values the
 *  column already holds (its status words and date style are followed). */
export function rowCells(tab: SheetMapTab, kind: RowKind, record: Record<string, unknown>, samples: Record<number, string[]> = {}): RowCell[] {
  return tab.columns.slice().sort((a, b) => a.index - b.index).map(column => {
    const formula = Boolean(column.formula);
    const value = formula || column.target === 'keep' || column.target === 'ignore' ? null : valueFor(column, kind, record, samples[column.index] ?? [], tab.kind === 'mixed');
    return { index: column.index, header: column.header, target: column.target, formula, value: value === '' ? null : value };
  });
}

/** The columns a row's data lives in (mapped, not formulas): the next empty row is found from these. */
export const dataColumns = (tab: SheetMapTab) => tab.columns.filter(column => !column.formula && column.target !== 'keep' && column.target !== 'ignore').map(column => column.index);

/** A1 column letters. */
export const letter = (index: number): string => { let s = '', n = index + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** What the chat card shows in a new cell: money with separators, Thai dates, text as typed (no leading '). */
export function displayValue(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (value.startsWith("'")) return value.slice(1);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return iso ? `${Number(iso[3])}/${Number(iso[2])}/${Number(iso[1]) + 543}` : value;
}

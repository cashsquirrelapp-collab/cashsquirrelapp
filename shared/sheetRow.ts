import type { SheetMap, SheetMapColumn, SheetMapTab } from './googleSheets.js';

// บันทึกลงชีตของคุณ (ฟีเจอร์ทดลอง sheetWrite, plan phase 3; owner, 2026-11-12: "อยากทำให้มันสามารถแก้ได้ โดยที่เราบันทึกผ่าน
// เลขากระรอกแชท ในไลน์ได้ ในแชทกระรอกในเว็บได้"). A job or an expense เลขา prepared becomes one new row of the customer's
// own sheet, laid out by the sheet map the customer confirmed: each mapped column gets its value, formula columns are
// left to the sheet ("คำนวณเอง"), columns the map does not use stay empty. Shared by the server (it writes) and the chat
// card (it shows the row before ยืนยัน). Owner's choice the same day: the record is saved in the app as well.

export type RowKind = 'job' | 'expense';

/** The template's example rows (workbooks made before 2026-11-18) end an invented name with "(ตัวอย่าง)": "บริษัท ตัวอย่างมีเดีย
 *  จำกัด (ตัวอย่าง)". A note that only mentions a sample ("ส่ง (ตัวอย่าง) ให้ลูกค้า") is not one, nor a formula's result. */
export const EXAMPLE_MARK = /\(ตัวอย่าง\)\s*$/;
export const isExampleText = (...texts: unknown[]) => texts.some(text => EXAMPLE_MARK.test(String(text ?? '')));
/** The rows of a tab read from the sheet (row numbers as the sheet shows them) that are the template's example rows. */
// A few example rows of the older agency and production workbooks carried no "(ตัวอย่าง)" (a budget line, a bill): they are
// known by two of their own texts together, the sample code and the sample item, never by a code alone (a real first
// project may well be PRJ-2569-001).
const UNMARKED_EXAMPLES: [string, string][] = [
  ['PRJ-2569-001', 'ถ่ายวิดีโอ 1 วัน'], ['PRJ-2569-001', 'อินฟลูเอนเซอร์ 3 คน'],
  ['MV-2569-001', 'ช่างภาพ + ผู้ช่วย'], ['MV-2569-001', 'เช่ากล้องและไฟ'], ['MV-2569-001', 'อาหารกอง'],
  ['INV-2569-001', 'PRJ-2569-001'], ['INV-2569-001', 'MV-2569-001'],
];
export function exampleRowsOf(rows: { text?: string; raw?: unknown; formula?: true }[][]): number[] {
  const found: number[] = [];
  rows.forEach((cells, index) => {
    const typed = cells.filter(cell => cell && !cell.formula).map(cell => String(cell.text ?? cell.raw ?? '').trim());
    if (typed.some(text => isExampleText(text)) || UNMARKED_EXAMPLES.some(([a, b]) => typed.includes(a) && typed.includes(b))) found.push(index + 1);
  });
  return found;
}

/** A job or an expense deleted in the app, and the sheet row it was taken from (owner, 2026-11-17: deleted in the app,
 *  deleted in the sheet; backend/src/services/sheetWrite.ts deleteRecordRows). */
export interface DeletedRecordRow { kind: RowKind; fileId: string; tab: string; row: number; name: string; amount: number }

/** The row of a record taken from the connected sheet (its sheetLink), or null: never one marked missing. */
export function deletedRowOf(kind: RowKind, item: unknown): DeletedRecordRow | null {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : null;
  const link = record?.sheetLink && typeof record.sheetLink === 'object' ? record.sheetLink as Record<string, unknown> : null;
  if (!link || link.missing || typeof link.fileId !== 'string' || typeof link.tab !== 'string' || !Number.isInteger(link.row) || (link.row as number) < 1) return null;
  return { kind, fileId: link.fileId.slice(0, 200), tab: link.tab.slice(0, 200), row: link.row as number, name: String(record!.name ?? '').slice(0, 500),
    amount: Number(kind === 'job' ? record!.value : record!.amount) || 0 };
}
/** The same, read back from a delete card's record ({ sheetRow }): only a well-formed row. */
export function deletedRowFromCard(record: unknown): DeletedRecordRow | null {
  const row = record && typeof record === 'object' ? (record as { sheetRow?: unknown }).sheetRow : null;
  if (!row || typeof row !== 'object') return null;
  const value = row as Record<string, unknown>;
  if ((value.kind !== 'job' && value.kind !== 'expense') || typeof value.name !== 'string') return null;
  return deletedRowOf(value.kind, { sheetLink: { fileId: value.fileId, tab: value.tab, row: value.row }, name: value.name, value: value.amount, amount: value.amount });
}

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

// The app's expense categories in the words of a sheet's own drop-down (owner, 2026-11-13): the item's name speaks first
// ("ค่ากาแฟ" is food), then the app's category; the first rule whose choice the sheet has wins, else its "อื่น ๆ".
const CATEGORY_RULES: [RegExp, string[]][] = [
  [/kol|อินฟลู|influencer|รีวิวสินค้า/i, ['KOL']],
  [/โฆษณา|ยิงแอด|\bads?\b|บูสต์|boost/i, ['ค่าสื่อแทนจ่าย']],
  [/ตัดต่อ|คัลเลอร์|edit|color/i, ['ตัดต่อ']],
  [/นักแสดง|นายแบบ|นางแบบ|talent|actor/i, ['นักแสดง']],
  [/อาหาร|ข้าว|กาแฟ|เครื่องดื่ม|ขนม|รับรอง|catering|food/i, ['อาหาร']],
  [/ไฟฟ้า|ประปา|สาธารณูปโภค|utility/i, ['อื่น ๆ']],
  [/เดินทาง|น้ำมัน|แท็กซี่|taxi|grab|ทางด่วน|ตั๋ว|ที่จอด|travel/i, ['เดินทาง']],
  [/สถานที่|โลเคชัน|location|สตูดิโอ|studio|ค่าเช่าที่/i, ['สถานที่', 'ค่าสถานที่']],
  [/โทรศัพท์|ค่าโทร|มือถือ|เน็ต|internet/i, ['โทรศัพท์-เน็ต']],
  [/จ้าง|outsource|ฟรีแลนซ์|ทีมงาน|ช่าง|crew/i, ['ค่าจ้างช่วง', 'ทีมงาน']],
  [/อุปกรณ์|กล้อง|เลนส์|ไมค์|ไมโครโฟน|ขาตั้ง|ไฟ|คอมพิวเตอร์|equipment|camera/i, ['อุปกรณ์']],
  [/ซอฟต์แวร์|โปรแกรม|software|subscription|adobe|canva|โดเมน|โฮสต์/i, ['ซอฟต์แวร์']],
  [/ซื้อสินค้า|สินค้า|วัตถุดิบ|stock/i, ['ซื้อสินค้า']],
  [/อีเวนต์|event/i, ['อีเวนต์']],
  [/อาร์ต|พร็อพ|prop/i, ['อาร์ต']],
  [/ครีเอทีฟ|กลยุทธ์|creative|strategy/i, ['กลยุทธ์-ครีเอทีฟ']],
  [/ถ่าย|โปรดักชัน|production|shoot/i, ['โปรดักชัน']],
];
const squash = (value: string) => value.replace(/\s+/g, '').toLowerCase();
/** One of the sheet's choices for this expense. */
export function chooseCategory(category: string, name: string, choices: string[]): string {
  const exact = choices.find(choice => squash(choice) === squash(category));
  // "อื่นๆ" in the app says nothing: the item's name may still find a better choice.
  if (exact && !/^อื่น/.test(exact)) return exact;
  for (const source of [name, category]) {
    for (const [pattern, wanted] of CATEGORY_RULES) {
      if (!pattern.test(source)) continue;
      const found = wanted.find(choice => choices.includes(choice));
      if (found) return found;
    }
  }
  return choices.find(choice => /^อื่น/.test(choice)) ?? category;
}

/** The value one mapped column gets for this record, before any formatting to the column's own style. */
export function valueFor(column: SheetMapColumn, kind: RowKind, record: Record<string, unknown>, samples: string[], mixed: boolean): string | number | null {
  const target = column.target;
  if (kind === 'expense') {
    switch (target) {
      case 'name': return text(record.name) || null;
      case 'category': {
        const category = text(record.category);
        return column.choices?.length ? chooseCategory(category, text(record.name), column.choices) : category || null;
      }
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
    // A paid record with no payment date (2026-11-18) still gets a date in the row: its delivery date, else its start.
    case 'paidDate': { const date = isoDate(record.payDate) ?? isoDate(record.postDate) ?? isoDate(record.startDate); return date && paymentOf(record) === 'paid' ? dateFor(date, samples) : null; }
    case 'note': return text(record.note) || null;
    case 'kind': return mixed ? (samples.find(sample => /(รับ|income|in\b)/i.test(sample)) ?? 'รายรับ') : null;
    default: return null;
  }
}

/** The new row for this record in this tab: one cell per mapped column, in column order. `samples` are the values the
 *  column already holds (its status words and date style are followed). */
// The workbook's ประเภทเงินได้ column (owner, 2026-11-18: "ทุกอย่างตรงใช่ไหม" — the reports showed no income at all): รายงาน
// เงินสดรับ-จ่าย and สรุปภาษีรายปี add income up by it, so a row without one counted nowhere. A job's row gets the type the
// column itself uses most, else 40(2) (hired work, the usual freelance income); the person changes it in the sheet's own
// drop-down, and the app never writes over one already there (services/sheetWrite.ts writeOverRow).
const INCOME_TYPES = ['40(1)', '40(2)', '40(3)', '40(4)', '40(5)', '40(6)', '40(7)', '40(8)', 'อื่น ๆ'];
export const isIncomeTypeColumn = (column: SheetMapColumn) => column.target === 'keep' && !column.formula && /ประเภทเงินได้/.test(column.header);
export function incomeTypeFor(values: string[], choices?: string[]): string {
  const known = new Set([...INCOME_TYPES, ...(choices ?? [])]);
  const counts = new Map<string, number>();
  for (const value of values) { const text = value.trim(); if (known.has(text)) counts.set(text, (counts.get(text) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '40(2)';
}

export function rowCells(tab: SheetMapTab, kind: RowKind, record: Record<string, unknown>, samples: Record<number, string[]> = {}): RowCell[] {
  return tab.columns.slice().sort((a, b) => a.index - b.index).map(column => {
    const formula = Boolean(column.formula);
    if (kind === 'job' && isIncomeTypeColumn(column)) return { index: column.index, header: column.header, target: column.target, formula: false, value: incomeTypeFor(samples[column.index] ?? [], column.choices) };
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

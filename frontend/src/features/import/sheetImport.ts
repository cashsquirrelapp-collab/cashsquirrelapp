// Import from Excel / CSV (owner, 2026-10-22: free for every account): people who already keep a
// sheet of their jobs bring months of work in without typing it again. This file has no React and no
// file reading: it takes a sheet as a grid of cells, finds the header row, guesses what each column
// is, reads Thai and English dates, amounts and statuses, and builds jobs and expenses the same way
// the job and expense forms do. Every row comes back with what the person should check.

import type { Expense, Job, StatusOption } from '../../../../shared/types';
import { calculatePayDate } from '../../../../shared/calendar';
import { roundMoney, whtAmountFor } from '../../../../shared/wht';

// ---------------------------------------------------------------------------------------------
// Input

export interface SheetCell {
  /** The cell value as the file stores it. */
  raw: string | number | boolean | null;
  /** What the person sees in the cell. */
  text: string;
  /** YYYY-MM-DD when the cell is a real date in the file (date-formatted). */
  date?: string;
}

export interface SheetGrid {
  name: string;
  rows: SheetCell[][];
  /** True when the name is a file name (a CSV), not a tab someone named. */
  fromFileName?: boolean;
}

// One import saves at most this many rows, so the save stays within the server's request size.
export const MAX_IMPORT_ROWS = 2000;

// ---------------------------------------------------------------------------------------------
// Fields

export type Field =
  | 'name' | 'client' | 'type' | 'category'
  | 'value' | 'amount' | 'received' | 'pending' | 'income' | 'expense'
  | 'whtRate' | 'whtAmount' | 'status' | 'kind'
  | 'date' | 'postDate' | 'dueDate' | 'paidDate' | 'creditTerm' | 'note'
  /** The project or job a ledger row belongs to ("Project / Area"), when another column has the description. */
  | 'project'
  /** One payment of a job paid in parts: its label ("งวดที่ 2", "Phase 1") and its own status. */
  | 'installment' | 'installmentStatus'
  /** Business or personal ("Use: Business", "ธุรกิจ / ส่วนตัว"); "Transfer" makes the row a transfer. */
  | 'use';

/** keep: not one of our fields; its text goes into the note with its header so nothing is lost. */
export type ColumnTarget = Field | 'keep' | 'ignore';
export type DataKind = 'jobs' | 'expenses' | 'mixed';

const MONEY_FIELDS: Field[] = ['value', 'amount', 'received', 'pending', 'income', 'expense', 'whtAmount'];
const DATE_FIELDS: Field[] = ['date', 'postDate', 'dueDate', 'paidDate'];
const TEXT_FIELDS: Field[] = ['name', 'client', 'type', 'category', 'note', 'project', 'installment', 'installmentStatus'];

/** Header words for each field, Thai and English, written as they are compared (see normalize). */
const HEADER_WORDS: Record<Field, string[]> = {
  name: ['ชื่องาน', 'งาน', 'ชื่อโปรเจกต์', 'โปรเจกต์', 'โปรเจค', 'ชื่อโปรเจค', 'โครงการ', 'ชื่อโครงการ', 'รายการ', 'ชื่อรายการ', 'รายละเอียด', 'รายละเอียดงาน', 'ดีล', 'ชื่อดีล', 'งานที่ทำ', 'job', 'jobname', 'project', 'projectname', 'task', 'item', 'description', 'details', 'deal', 'title', 'work'],
  client: ['ลูกค้า', 'ชื่อลูกค้า', 'แบรนด์', 'บริษัท', 'ผู้ว่าจ้าง', 'ผู้จ้าง', 'เอเจนซี่', 'เอเจนซี', 'ผู้จ่าย', 'ผู้จ่ายเงิน', 'ลูกค้าผู้จ่าย', 'client', 'clientname', 'customer', 'brand', 'company', 'agency', 'payer', 'buyer'],
  type: ['ประเภทงาน', 'ประเภท', 'ชนิดงาน', 'หมวดงาน', 'แพลตฟอร์ม', 'type', 'jobtype', 'worktype', 'platform', 'service'],
  category: ['หมวดหมู่', 'หมวด', 'ประเภทรายจ่าย', 'หมวดค่าใช้จ่าย', 'หมวดรายจ่าย', 'category', 'expensecategory', 'expensetype'],
  value: ['มูลค่างาน', 'มูลค่า', 'มูลค่ารวม', 'ราคา', 'ราคางาน', 'ค่าจ้าง', 'ค่างาน', 'ค่าตัว', 'เรท', 'ยอดก่อนหัก', 'ยอดก่อนภาษี', 'รายได้', 'value', 'price', 'fee', 'rate', 'gross', 'budget', 'revenue', 'contractvalue', 'jobvalue', 'invoiced', 'invoiceamount', 'invoicetotal', 'billed', 'amountbilled', 'ยอดวางบิล', 'ยอดออกใบแจ้งหนี้', 'ยอดตามใบแจ้งหนี้'],
  amount: ['จำนวนเงิน', 'ยอดเงิน', 'ยอด', 'ยอดรวม', 'เงิน', 'amount', 'total', 'sum'],
  received: ['รับแล้ว', 'ได้รับแล้ว', 'จ่ายแล้ว', 'ชำระแล้ว', 'ยอดที่จ่าย', 'ยอดชำระ', 'cashreceived', 'ยอดที่ได้รับ', 'ยอดได้รับแล้ว', 'ยอดรับ', 'รับจริง', 'เงินที่ได้รับ', 'ได้รับ', 'ยอดที่รับ', 'มัดจำ', 'received', 'paid', 'amountreceived', 'paidamount', 'amountpaid', 'collected'],
  pending: ['ค้างรับ', 'คงค้าง', 'ค้างจ่าย', 'ค้างชำระ', 'ยอดค้าง', 'ยอดค้างชำระ', 'ยอดค้างรับ', 'ยังไม่ได้รับ', 'รอรับ', 'คงเหลือ', 'ยอดคงเหลือ', 'outstanding', 'balance', 'pending', 'remaining', 'unpaid', 'balancedue'],
  income: ['รายรับ', 'เงินเข้า', 'รับเงิน', 'ฝาก', 'เงินฝาก', 'ฝากเงิน', 'income', 'moneyin', 'inflow', 'deposit', 'deposits', 'paidin'],
  expense: ['รายจ่าย', 'เงินออก', 'ค่าใช้จ่าย', 'จ่ายเงิน', 'ถอน', 'ถอนเงิน', 'expense', 'expenses', 'moneyout', 'debit', 'outflow', 'spent', 'cost', 'withdrawal', 'withdrawals', 'paidout'],
  whtRate: ['หักณที่จ่าย%', '%หักณที่จ่าย', 'อัตราหักณที่จ่าย', 'อัตราหัก', 'หัก%', '%หัก', 'ภาษี%', 'wht%', 'whtrate', 'withholding%', 'withholdingrate', 'taxrate'],
  whtAmount: ['ยอดหักณที่จ่าย', 'จำนวนภาษีหักณที่จ่าย', 'ภาษีหักณที่จ่าย', 'หักณที่จ่าย', 'ภาษีที่ถูกหัก', 'หักภาษี', 'wht', 'whtamount', 'withholding', 'withholdingtax', 'withholdingamount', 'taxwithheld'],
  status: ['สถานะ', 'สถานะโครงการ', 'สถานะโปรเจกต์', 'projectstatus', 'jobstatus', 'สถานะการจ่าย', 'สถานะการชำระ', 'สถานะการรับเงิน', 'สถานะเงิน', 'สถานะงาน', 'การชำระ', 'การจ่าย', 'จ่ายแล้ว', 'จ่ายยัง', 'ได้เงินยัง', 'ชำระแล้ว', 'โอนแล้ว', 'status', 'paymentstatus', 'paid', 'state'],
  kind: ['ประเภทรายการ', 'รับจ่าย', 'รายรับรายจ่าย', 'เข้าออก', 'inout', 'direction', 'kind', 'transactiontype'],
  date: ['วันที่', 'วัน', 'วันที่ทำรายการ', 'วันเดือนปี', 'เดือน', 'งวดเดือน', 'วันออกใบแจ้งหนี้', 'วันที่ออก', 'วันวางบิล', 'date', 'day', 'transactiondate', 'month', 'period', 'issued', 'issuedate', 'dateissued', 'invoicedate', 'billingdate'],
  postDate: ['วันส่งงาน', 'วันที่ส่งงาน', 'ส่งงาน', 'วันลงงาน', 'วันที่ลงงาน', 'วันโพสต์', 'วันเผยแพร่', 'วันดีล', 'วันจบงาน', 'วันที่ให้บริการ', 'วันให้บริการ', 'deliverydate', 'delivered', 'postdate', 'publishdate', 'livedate', 'completeddate', 'enddate', 'servicedate'],
  dueDate: ['กำหนดชำระ', 'วันครบกำหนด', 'ครบกำหนด', 'กำหนดรับเงิน', 'วันครบกำหนดชำระ', 'วันนัดจ่าย', 'กำหนดจ่าย', 'วันที่ต้องได้รับ', 'duedate', 'due', 'paymentdue', 'dueon'],
  paidDate: ['วันที่รับเงิน', 'วันรับเงิน', 'วันที่ได้รับเงิน', 'วันที่โอน', 'วันโอน', 'วันที่จ่าย', 'วันจ่าย', 'วันที่ชำระ', 'วันรับเงินจริง', 'วันที่รับเงินจริง', 'paiddate', 'paymentdate', 'datepaid', 'receiveddate', 'paidon', 'datereceived'],
  creditTerm: ['เครดิต', 'เครดิตเทอม', 'เทอม', 'ระยะเวลาเครดิต', 'creditterm', 'credit', 'terms', 'paymentterms', 'paymentterm'],
  installment: ['งวด', 'งวดชำระ', 'งวดที่', 'งวดงาน', 'งวดการชำระ', 'installment', 'milestone', 'paymentmilestone'],
  installmentStatus: ['สถานะงวด', 'installmentstatus', 'milestonestatus'],
  use: ['ใช้สำหรับ', 'การใช้', 'ประเภทการใช้', 'ใช้ในงาน', 'ธุรกิจส่วนตัว', 'ธุรกิจหรือส่วนตัว', 'use', 'usage', 'purpose', 'businesspersonal', 'businessorpersonal'],
  project: ['โปรเจกต์', 'โปรเจค', 'โครงการ', 'งานที่เกี่ยวข้อง', 'ของงาน', 'project', 'projectarea', 'relatedproject', 'forproject', 'area'],
  note: ['หมายเหตุ', 'โน้ต', 'บันทึก', 'รายละเอียดเพิ่มเติม', 'note', 'notes', 'remark', 'remarks', 'comment', 'comments', 'memo'],
};

const UNIT_WORDS = /(บาท|thb|baht|฿)$/;

/** Header text as it is compared: lower case, no spaces or punctuation, no unit at the end. */
export function normalizeHeader(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[\s()[\]{}.:/\\\-_,'"#*?!|]+/g, '').replace(UNIT_WORDS, '');
}

const HEADER_INDEX = Object.entries(HEADER_WORDS).map(([field, words]) => ({ field: field as Field, words: words.map(normalizeHeader) }));

/** How well a header names a field, 0..1. */
export function headerScore(header: string, field: Field): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const word of HEADER_INDEX.find(entry => entry.field === field)!.words) {
    if (h === word) return 1;
    if (word.length >= 3 && h.includes(word)) best = Math.max(best, 0.6 + 0.35 * (word.length / h.length));
    else if (h.length >= 3 && word.includes(h)) best = Math.max(best, 0.5 + 0.3 * (h.length / word.length));
  }
  return Math.min(best, 0.95);
}

// A column of codes ("Client ID", "Expense ID", "Invoice No.", "รหัสลูกค้า", "เลขที่"): never an amount or
// a date. "Client ID" and "Project ID" still say whose job a row is, through the tab that names each code.
const ID_WORD = /(^|[\s_\-.(/])(id|no\.?|#|ref\.?)($|[\s_\-.)/:])|reference|\bcode\b|รหัส|เลขที่|หมายเลข/i;
const CAMEL_ID = /[a-z](ID|Id)$/;
export const isIdHeader = (header: string) => ID_WORD.test(header.trim()) || CAMEL_ID.test(header.trim());
/** "Client ID" -> "Client", "รหัสลูกค้า" -> "ลูกค้า". */
const idBase = (header: string) => header.trim().replace(/(ID|Id)$/, '').replace(/\b(id|no\.?|ref\.?|code|number)\b|#|reference|รหัส|เลขที่|หมายเลข/gi, '').trim();
/** A code as files write them: P001, C-12, INV-2609-001, TX0001. */
const CODE = /^[A-Za-z]{1,8}[-_/]?\d{1,10}(?:[-_/]\d{1,10})*$/;

// ---------------------------------------------------------------------------------------------
// Reading values

const THAI_MONTHS = [
  ['มกราคม', 'มค', 'ม.ค'], ['กุมภาพันธ์', 'กพ', 'ก.พ'], ['มีนาคม', 'มีค', 'มี.ค'], ['เมษายน', 'เมย', 'เม.ย'],
  ['พฤษภาคม', 'พค', 'พ.ค'], ['มิถุนายน', 'มิย', 'มิ.ย'], ['กรกฎาคม', 'กค', 'ก.ค'], ['สิงหาคม', 'สค', 'ส.ค'],
  ['กันยายน', 'กย', 'ก.ย'], ['ตุลาคม', 'ตค', 'ต.ค'], ['พฤศจิกายน', 'พย', 'พ.ย'], ['ธันวาคม', 'ธค', 'ธ.ค'],
];
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n: number) => String(n).padStart(2, '0');
const validDate = (y: number, m: number, d: number) => {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > last ? null : `${y}-${pad(m)}-${pad(d)}`;
};

/** A year as written: Buddhist Era (2567, or 67 for 43..99) becomes Gregorian; 24 is 2024. */
export function fullYear(year: number): number {
  if (year >= 2400) return year - 543;
  if (year >= 1000) return year;
  if (year >= 43) return 2500 + year - 543;
  return 2000 + year;
}

/** Excel's day number (days since 1899-12-30) as YYYY-MM-DD, for 2000..2100. */
export function excelSerialDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 36526 || serial > 73051) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
}

function monthFromWord(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  const th = THAI_MONTHS.findIndex(names => names.some(name => w === name || w === name.replace(/\./g, '')));
  if (th >= 0) return th + 1;
  // "Oct", "Sept", "October": a start of the month's name, at least three letters ("Nova" is not November).
  const en = EN_MONTHS.findIndex(name => w.length >= 3 && name.startsWith(w));
  return en >= 0 ? en + 1 : null;
}

export type DayOrder = 'dmy' | 'mdy';

/** Reads a date written as text. Day first unless the column shows month first. */
export function parseDateText(input: string, order: DayOrder = 'dmy'): string | null {
  const text = input.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(text);
  if (m) return validDate(fullYear(+m[1]), +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?: .*)?$/.exec(text);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    return order === 'mdy' ? validDate(y, a, b) : validDate(y, b, a);
  }
  // 15 ต.ค. 67 / 15 ตุลาคม 2567 / 15 Oct 2024 / 15-Oct-24
  m = /^(\d{1,2})[ \-]*([ก-๙a-zA-Z.]+)[ \-,]*(\d{2,4})$/.exec(text);
  if (m) { const month = monthFromWord(m[2]); return month ? validDate(fullYear(+m[3]), month, +m[1]) : null; }
  // Oct 15, 2024
  m = /^([a-zA-Z.]+) (\d{1,2}),? (\d{2,4})$/.exec(text);
  if (m) { const month = monthFromWord(m[1]); return month ? validDate(fullYear(+m[3]), month, +m[2]) : null; }
  return null;
}

/** A month named in a sheet tab or heading ("ต.ค. 67", "ตุลาคม 2567", "Oct 2024", "10-2024"): YYYY-MM. */
export function monthFromName(name: string, fallbackYear?: number): string | null {
  const text = name.trim();
  let m = /(\d{1,2})[-/.](\d{4})/.exec(text);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${fullYear(+m[2])}-${pad(+m[1])}`;
  m = /(\d{4})[-/.](\d{1,2})(?!\d)/.exec(text);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${fullYear(+m[1])}-${pad(+m[2])}`;
  for (const token of text.split(/[\s_\-]+/)) {
    const month = monthFromWord(token);
    if (!month) continue;
    const year = /(\d{4}|\d{2})(?!\d)/.exec(text.replace(token, ''));
    const y = year ? fullYear(+year[1]) : fallbackYear;
    return y ? `${y}-${pad(month)}` : null;
  }
  return null;
}

/** Reads an amount: 12000, "฿12,000", "12,000.-", "(500)", "12k", "1.2 หมื่น". */
export function parseMoney(cell: SheetCell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.raw === 'number') return Number.isFinite(cell.raw) ? cell.raw : null;
  let text = String(cell.raw ?? cell.text ?? '').trim();
  if (!text) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(text)) { sign = -1; text = text.slice(1, -1); }
  text = text.replace(/[฿$€£¥,\s]|บาท|thb|baht|usd|eur/gi, '').replace(/\.-$/, '').replace(/-$/, '');
  if (text.startsWith('-')) { sign *= -1; text = text.slice(1); }
  if (text.startsWith('+')) text = text.slice(1);
  const unit = /^(\d+(?:\.\d+)?)(k|m|พัน|หมื่น|แสน|ล้าน)$/i.exec(text);
  if (unit) {
    const times: Record<string, number> = { k: 1e3, m: 1e6, พัน: 1e3, หมื่น: 1e4, แสน: 1e5, ล้าน: 1e6 };
    return sign * roundMoney(+unit[1] * times[unit[2].toLowerCase()]);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return sign * Number(text);
}

/** A WHT rate: "3%", 3, 0.03 -> 3. */
export function parseRate(cell: SheetCell | undefined): number | null {
  if (!cell) return null;
  const percent = /%/.test(cell.text);
  const value = parseMoney({ ...cell, raw: typeof cell.raw === 'string' ? cell.raw.replace('%', '') : cell.raw, text: cell.text.replace('%', '') });
  if (value === null || value < 0) return null;
  const rate = !percent && value > 0 && value < 1 ? value * 100 : value;
  return rate <= 100 ? Math.round(rate * 100) / 100 : null;
}

/** Credit term in days: 30, "30 วัน", "Net 30", "1 เดือน", "เงินสด" -> 0. */
export function parseCreditTerm(cell: SheetCell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.raw === 'number') return cell.raw >= 0 && cell.raw <= 3650 ? Math.round(cell.raw) : null;
  const text = cell.text.trim().toLowerCase();
  if (!text) return null;
  if (/เงินสด|cash|cod|ทันที|immediate/.test(text)) return 0;
  const months = /(\d+)\s*(เดือน|month)/.exec(text);
  if (months) return +months[1] * 30;
  const days = /(\d+)/.exec(text);
  return days && +days[1] <= 3650 ? +days[1] : null;
}

export type PaymentWord = 'paid' | 'partial' | 'unpaid';
export interface StatusReading { payment?: PaymentWord; delivered?: boolean }

const PAID_WORDS = /(^|[^ม])จ่ายแล้ว|ได้รับแล้ว|ได้รับเงินแล้ว|รับแล้ว|รับเงินแล้ว|รับครบ|ได้เงินแล้ว|ได้แล้ว|โอนแล้ว|ชำระแล้ว|เคลียร์แล้ว|ปิดยอด|^paid|fullypaid|received|settled|^done$|^yes$|^y$|^true$|^✓|^✔|^☑|^✅|^ใช่$/
const PARTIAL_WORDS = /มัดจำ|บางส่วน|แบ่งจ่าย|แบ่งชำระ|แบ่งงวด|partial|deposit|installment/;
const UNPAID_WORDS = /ยังไม่|ค้าง|รอโอน|รอจ่าย|รอรับ|รอชำระ|^รอ|unpaid|notpaid|pending|outstanding|overdue|^no$|^n$|^false$|^ไม่$|^✗|^✕|^❌|^⏳|^x$/;
const DELIVERED_WORDS = /ส่งงานแล้ว|ส่งแล้ว|เสร็จแล้ว|ลงแล้ว|โพสต์แล้ว|delivered|posted|completed|^done$/;
const WORKING_WORDS = /กำลังทำ|ยังไม่ส่ง|ยังไม่เสร็จ|inprogress|working|ongoing|todo/;

/** What a status cell says about payment and delivery. TRUE/FALSE checkboxes count as paid/unpaid. */
export function parseStatus(cell: SheetCell | undefined): StatusReading {
  if (!cell) return {};
  if (typeof cell.raw === 'boolean') return { payment: cell.raw ? 'paid' : 'unpaid' };
  const text = cell.text.toLowerCase().replace(/\s+/g, '');
  if (!text) return {};
  const reading: StatusReading = {};
  if (PARTIAL_WORDS.test(text)) reading.payment = 'partial';
  else if (UNPAID_WORDS.test(text)) reading.payment = 'unpaid';
  else if (PAID_WORDS.test(text)) reading.payment = 'paid';
  if (DELIVERED_WORDS.test(text)) reading.delivered = true;
  else if (WORKING_WORDS.test(text)) reading.delivered = false;
  return reading;
}

type RowKind = 'income' | 'expense' | 'transfer';
const INCOME_WORDS = /^(รายรับ|รับ|รายได้|เงินเข้า|income|in|revenue|credit)$/;
const EXPENSE_WORDS = /^(รายจ่าย|จ่าย|ค่าใช้จ่าย|เงินออก|expense|expenses|out|cost|debit)$/;
// Money moved between the person's own accounts (savings, tax pot): neither income nor an expense.
const TRANSFER_WORDS = /^(transfer|transfers|internaltransfer|โอน|โอนเงิน|ย้ายเงิน|โอนระหว่างบัญชี|โอนเข้าบัญชีออม|ออม|ออมเงิน|เงินออม|savings?)$/;

export type Use = 'business' | 'personal' | 'transfer';
const BUSINESS_WORDS = /^(business|work|company|ธุรกิจ|งาน|ใช้ในงาน|บริษัท|กิจการ)$/;
const PERSONAL_WORDS = /^(personal|private|household|home|family|ส่วนตัว|ใช้ส่วนตัว|บ้าน|ครอบครัว)$/;
/** Business or personal, from a "Use" cell (or a category that only says which). */
export function parseUse(cell: SheetCell | undefined): Use | null {
  const text = (cell?.text || '').toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  if (BUSINESS_WORDS.test(text)) return 'business';
  if (PERSONAL_WORDS.test(text)) return 'personal';
  if (TRANSFER_WORDS.test(text)) return 'transfer';
  return null;
}

export function parseKind(cell: SheetCell | undefined): RowKind | null {
  const text = (cell?.text || '').toLowerCase().replace(/\s+/g, '');
  if (!text) return null;
  if (INCOME_WORDS.test(text)) return 'income';
  if (EXPENSE_WORDS.test(text)) return 'expense';
  if (TRANSFER_WORDS.test(text)) return 'transfer';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Looking at a sheet

const TOTAL_EXACT = new Set(['รวม', 'ยอดรวม', 'รวมทั้งหมด', 'รวมทั้งสิ้น', 'รวมยอด', 'รวมเงิน', 'รวมรายรับ', 'รวมรายจ่าย', 'สรุป', 'สรุปยอด', 'total', 'grandtotal', 'subtotal', 'sum', 'totals']);
/** A total row: "รวม" alone, or a short "รวม…" line with no date (a job named "รวมคลิป…" has one). */
const isTotalText = (text: string, rowHasDate: boolean) => TOTAL_EXACT.has(text) || (/^(รวม|total|subtotal|สรุป)/.test(text) && !rowHasDate && text.length <= 24);

const cellAt = (row: SheetCell[] | undefined, col: number): SheetCell | undefined => row?.[col];
/** A "รวม" / "Total" row: left out of the import, and of the samples used to guess columns. */
function isTotalRow(row: SheetCell[], order: DayOrder): boolean {
  const firstText = row.map(cell => cell?.text?.trim() || '').find(text => text && !/^[\d.,\s฿-]+$/.test(text)) || '';
  const hasDate = row.some(cell => cell && (cell.date || (typeof cell.raw === 'string' && parseDateText(cell.raw, order))));
  return isTotalText(normalizeHeader(firstText), hasDate);
}
// "-", "ไม่ระบุ" and the like are placeholders, not values (our own CSV export writes "-").
const PLACEHOLDER = /^(-|–|—|n\/?a|null|none|ไม่ระบุ|ไม่มี)$/i;
const isEmpty = (cell: SheetCell | undefined) => !cell || ((cell.raw === null || cell.raw === '') && !cell.text.trim()) || (typeof cell.raw === 'string' && PLACEHOLDER.test(cell.raw.trim()));
const isNumberLike = (cell: SheetCell) => typeof cell.raw === 'number' || parseMoney(cell) !== null;
const isDateLike = (cell: SheetCell, order: DayOrder) => Boolean(cell.date) || (typeof cell.raw === 'string' && (parseDateText(cell.raw, order) !== null || (cell.raw.length <= 20 && monthFromName(cell.raw) !== null)));

export interface ColumnGuess {
  index: number;
  header: string;
  target: ColumnTarget;
  /** 0..1: how sure the guess is. */
  confidence: number;
  /** A few values from the column, as shown in the file. */
  samples: string[];
  /**
   * Why the column has its target: header (the header names the field), headerPartial (part of it
   * does), code (a code column: Client ID), valuesStrong (its values say so: Income/Expense),
   * values (guessed from the values alone: confirmed by the person before money is read from it),
   * person (chosen by the person), remembered (chosen last time for the same headers), none (kept).
   */
  reason?: 'header' | 'headerPartial' | 'code' | 'valuesStrong' | 'values' | 'person' | 'remembered' | 'none';
}

// Money, dates and payment words read from a column guessed by its values alone could be wrong:
// the person confirms such a column before the review (owner's brief, 2026-10-22: no guessing).
const CONFIRM_TARGETS: ColumnTarget[] = ['value', 'amount', 'received', 'pending', 'income', 'expense', 'whtAmount', 'whtRate', 'date', 'postDate', 'dueDate', 'paidDate', 'status', 'kind', 'use'];
export const needsConfirmation = (column: ColumnGuess) => column.reason === 'values' && CONFIRM_TARGETS.includes(column.target);

export interface SheetAnalysis {
  name: string;
  /** Zero-based row of the headers, or null when the sheet has no header row. */
  headerRow: number | null;
  columns: ColumnGuess[];
  kind: DataKind;
  dayOrder: DayOrder;
  /** Month taken from the sheet name, used for rows without a date. */
  sheetMonth: string | null;
  /** Rows of data under the header (zero-based), without blank rows. */
  dataRows: number[];
  /** True for a summary laid out with months across the columns: no rows to import. */
  monthsAcross: boolean;
  /**
   * summary: a dashboard, read-me or totals-by-category table rather than one row per job or
   * expense. Left out by default (the person can still tick it); see defaultIncluded.
   * lookup: a list that names codes (Clients: C001 = Northstar Ltd.) and has no amounts. The import
   * uses it to show names instead of codes in the other tabs, and leaves it out itself.
   */
  role: 'data' | 'summary' | 'lookup';
  /** A column of codes that names each row (Invoice ID, Reference ID, เลขที่): kept with the saved row. */
  refColumn: number | null;
}

/** Whether the import window ticks a sheet at first. */
export function defaultIncluded(analysis: SheetAnalysis): boolean {
  return analysis.role === 'data' && !analysis.monthsAcross && analysis.dataRows.length > 0;
}

// Tabs that describe or summarise the rest of the file: dashboards, read-me pages, the export notes
// Numbers adds, how-to pages (our own template has one).
const SUMMARY_SHEET = /dashboard|summary|overview|readme|starthere|cover|instruction|howto|guide|about|chart|graph|สรุป|ภาพรวม|แดชบอร์ด|คำอธิบาย|วิธีใช้|วิธีกรอก|อ่านก่อน|เริ่มต้น|คู่มือ|หน้าปก|กราฟ/;

interface ColumnProfile { dates: number; numbers: number; negatives: number; small: number; percents: number; statuses: number; kinds: number; uses: number; codes: number; texts: number; total: number; distinct: number; avgLength: number }

function profileColumn(rows: SheetCell[][], col: number, order: DayOrder): ColumnProfile {
  const p: ColumnProfile = { dates: 0, numbers: 0, negatives: 0, small: 0, percents: 0, statuses: 0, kinds: 0, uses: 0, codes: 0, texts: 0, total: 0, distinct: 0, avgLength: 0 };
  const seen = new Set<string>();
  let length = 0;
  for (const row of rows.slice(0, 80)) {
    const cell = cellAt(row, col);
    if (isEmpty(cell)) continue;
    p.total++;
    seen.add(cell!.text);
    length += cell!.text.length;
    if (isDateLike(cell!, order)) { p.dates++; continue; }
    if (/%/.test(cell!.text)) p.percents++;
    if (isNumberLike(cell!)) {
      p.numbers++;
      const n = parseMoney(cell) ?? 0;
      if (n < 0) p.negatives++;
      if (n >= 0 && n <= 15) p.small++;
      continue;
    }
    if (typeof cell!.raw === 'boolean' || parseStatus(cell).payment || parseStatus(cell).delivered !== undefined) p.statuses++;
    if (parseKind(cell)) p.kinds++;
    if (parseUse(cell)) p.uses++;
    if (CODE.test(cell!.text.trim())) p.codes++;
    p.texts++;
  }
  p.distinct = seen.size;
  p.avgLength = p.total ? length / p.total : 0;
  return p;
}

/** How well a column's values fit a field, 0..1. */
function valueFit(field: Field, p: ColumnProfile): number {
  if (!p.total) return 0.3;
  const share = (n: number) => n / p.total;
  if (DATE_FIELDS.includes(field)) return share(p.dates) >= 0.6 ? 1 : share(p.dates) >= 0.3 ? 0.6 : 0.15;
  if (field === 'whtRate') return share(p.numbers + p.percents) >= 0.6 && (share(p.small) >= 0.6 || share(p.percents) >= 0.5) ? 1 : 0.2;
  if (field === 'creditTerm') return share(p.numbers) + share(p.texts) * 0.5 >= 0.6 ? 0.9 : 0.3;
  if (MONEY_FIELDS.includes(field)) return share(p.numbers) >= 0.6 ? 1 : share(p.numbers) >= 0.3 ? 0.55 : 0.15;
  if (field === 'status') return share(p.statuses) >= 0.5 ? 1 : 0.3;
  if (field === 'kind') return share(p.kinds) >= 0.6 ? 1 : 0.1;
  if (field === 'use') return share(p.uses) >= 0.6 ? 1 : 0.1;
  if (TEXT_FIELDS.includes(field)) return share(p.texts) >= 0.5 ? 1 : 0.25;
  return 0.5;
}

function chooseDayOrder(rows: SheetCell[][]): DayOrder {
  let dayFirst = 0, monthFirst = 0;
  for (const row of rows.slice(0, 200)) for (const cell of row) {
    if (!cell || typeof cell.raw !== 'string') continue;
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(cell.raw.trim());
    if (!m) continue;
    if (+m[1] > 12) dayFirst++;
    if (+m[2] > 12) monthFirst++;
  }
  return monthFirst > dayFirst ? 'mdy' : 'dmy';
}

function findHeaderRow(rows: SheetCell[][]): number | null {
  let best: { row: number; score: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = rows[r] || [];
    const filled = cells.filter(cell => !isEmpty(cell));
    if (filled.length < 2) continue;
    const texts = filled.filter(cell => typeof cell.raw === 'string' && !isNumberLike(cell) && !cell.date);
    const matched = texts.filter(cell => HEADER_INDEX.some(entry => headerScore(cell.text, entry.field) >= 0.7)).length;
    if (!matched && texts.length < 2) continue;
    // Headers are words. A row with an amount or a date in it is data, unless several cells name our
    // fields: "ออกแบบโลโก้ | ลูกค้าตัวอย่าง | 5000 | 05/10/2569" is a job, though it contains "ลูกค้า".
    const valued = filled.some(cell => typeof cell.raw === 'number' || cell.date || (typeof cell.raw === 'string' && parseDateText(cell.raw) !== null));
    if (valued && matched < 2) continue;
    const next = rows.slice(r + 1, r + 6).find(row => row && row.some(cell => !isEmpty(cell)));
    const dataLike = next ? next.some(cell => cell && (isNumberLike(cell) || cell.date)) : false;
    const score = matched * 3 + texts.length * 0.5 + (dataLike ? 2 : 0) - r * 0.05;
    if (matched >= 1 && (!best || score > best.score)) best = { row: r, score };
  }
  return best ? best.row : null;
}

function guessKind(name: string, targets: ColumnTarget[], dataRows: SheetCell[][], columns: ColumnGuess[], signedAmounts = false): DataKind {
  const has = (field: Field) => targets.includes(field);
  if (has('income') && has('expense')) return 'mixed';
  // One amount column with money in as + and money out as - (accounting and bank exports).
  if (signedAmounts && !has('received') && !has('pending') && !has('status')) return 'mixed';
  const kindCol = columns.find(c => c.target === 'kind');
  if (kindCol) {
    const kinds = new Set(dataRows.map(row => parseKind(cellAt(row, kindCol.index))).filter(Boolean));
    if (kinds.has('income') && kinds.has('expense')) return 'mixed';
    if (kinds.has('expense') || kinds.has('transfer')) return kinds.has('income') ? 'mixed' : 'expenses';
  }
  const sheet = normalizeHeader(name);
  if (/รายจ่าย|ค่าใช้จ่าย|expense|cost|spend/.test(sheet)) return 'expenses';
  if (/รายรับ|รายได้|เงินเข้า|income|revenue|deposit/.test(sheet)) return 'jobs';
  if (has('expense') && !has('client') && !has('received') && !has('status')) return 'expenses';
  if (has('category') && !has('client') && !has('received') && !has('pending') && !has('status') && !has('type')) return 'expenses';
  return 'jobs';
}

/**
 * Some templates put two tables side by side on one tab, with an empty column between them (Google
 * Sheets' monthly budget: Expenses on the left, Income on the right). Each becomes its own sheet,
 * named after the title above it, so each is matched and imported on its own.
 */
export function splitSideBySide(grid: SheetGrid): SheetGrid[] {
  const rows = grid.rows.slice(0, MAX_IMPORT_ROWS + 100);
  const width = Math.max(0, ...rows.map(row => row?.length || 0));
  const filled = (col: number) => rows.some(row => !isEmpty(row?.[col]));
  const blocks: number[][] = [];
  let current: number[] = [];
  for (let col = 0; col < width; col++) {
    if (filled(col)) current.push(col);
    else if (current.length) { blocks.push(current); current = []; }
  }
  if (current.length) blocks.push(current);
  const tables = blocks.filter(block => block.length >= 2);
  if (tables.length < 2) return [grid];
  const parts = tables.map(block => ({ block, rows: grid.rows.map(row => block.map(col => row?.[col] ?? { raw: null, text: '' })) }));
  const headers = parts.map(part => findHeaderRow(part.rows));
  if (headers.some(header => header === null)) return [grid];
  return parts.map((part, i) => {
    const titleRow = part.rows.slice(0, headers[i]!).reverse().find(row => row.some(cell => !isEmpty(cell)));
    const title = titleRow?.find(cell => !isEmpty(cell))?.text.trim();
    return { name: `${grid.name} · ${title || i + 1}`, rows: part.rows };
  });
}

/**
 * The month a tab is about, from a name like "ต.ค. 67" or "Oct 2024". Not from a CSV's file name, and
 * not from a name with a full date in it: "รายรับ_2026-10-22.csv" was exported that day, its rows
 * are not all from October (owner, 2026-10-22: a re-import gave undated rows 1 Oct 2026).
 */
function sheetMonthOf(grid: SheetGrid): string | null {
  if (grid.fromFileName) return null;
  if (/\d{4}[-/._]\d{1,2}[-/._]\d{1,2}|\d{1,2}[-/._]\d{1,2}[-/._]\d{4}/.test(grid.name)) return null;
  return monthFromName(grid.name);
}

/**
 * Codes a tab names: a column of distinct codes with an ID header ("Client ID") next to a name column
 * ("Client Name"). Workbooks that keep clients and projects in their own tabs refer to them by code
 * everywhere else (owner's test file, 2026-10-22: invoices list "P001" and "C001").
 */
export function codeNamesOf(grid: SheetGrid): Map<string, string> {
  const names = new Map<string, string>();
  const headerRow = findHeaderRow(grid.rows);
  if (headerRow === null) return names;
  const headers = (grid.rows[headerRow] || []).map(cell => cell?.text?.trim() || '');
  const body = grid.rows.slice(headerRow + 1, headerRow + 1 + MAX_IMPORT_ROWS).filter(row => row?.some(cell => !isEmpty(cell)));
  headers.forEach((header, col) => {
    if (!header || !isIdHeader(header)) return;
    const values = body.map(row => cellAt(row, col)?.text?.trim() || '').filter(Boolean);
    if (values.length < 2 || new Set(values).size !== values.length || values.filter(v => CODE.test(v)).length < values.length * 0.8) return;
    const base = normalizeHeader(idBase(header));
    const nameCols = headers.map((h, i) => ({ h: normalizeHeader(h), i })).filter(({ h, i }) => i !== col && h && /name|ชื่อ/.test(h) && !isIdHeader(headers[i]));
    // "Client ID" goes with "Client Name"; a lone ID column ("ID", "Customer ID") with the tab's one name
    // column. A Projects tab's "Client ID" does not take the project's name.
    const idCount = headers.filter(h => h && isIdHeader(h)).length;
    const nameCol = (nameCols.find(({ h }) => base && h.includes(base)) ?? (!base || idCount === 1 ? nameCols[0] : undefined))?.i;
    if (nameCol === undefined) return;
    for (const row of body) {
      const code = cellAt(row, col)?.text?.trim(), name = cellAt(row, nameCol)?.text?.trim();
      if (code && name && CODE.test(code) && !CODE.test(name)) names.set(code, name);
    }
  });
  return names;
}

/** Codes named anywhere in the file; a code two tabs name differently is left as it is. */
export function codeNames(grids: SheetGrid[]): Map<string, string> {
  const all = new Map<string, string>();
  const clash = new Set<string>();
  for (const grid of grids) for (const [code, name] of codeNamesOf(grid)) {
    if (all.has(code) && all.get(code) !== name) clash.add(code);
    else all.set(code, name);
  }
  for (const code of clash) all.delete(code);
  return all;
}

/** Reads a sheet and guesses where the header is, what each column is and what the rows are. */
export function analyzeSheet(grid: SheetGrid, override: { headerRow?: number | null } = {}): SheetAnalysis {
  const rows = grid.rows;
  const dayOrder = chooseDayOrder(rows);
  // The person can point at another header row when the guess is wrong.
  const headerRow = 'headerRow' in override ? override.headerRow ?? null : findHeaderRow(rows);
  const start = headerRow === null ? 0 : headerRow + 1;
  const headerCells = headerRow === null ? [] : rows[headerRow] || [];
  const width = Math.max(0, ...rows.slice(0, 200).map(row => row?.length || 0));
  const body = rows.slice(start);
  const dataRows: number[] = [];
  body.forEach((row, i) => { if (row && row.some(cell => !isEmpty(cell))) dataRows.push(start + i); });
  const dataCells = dataRows.map(r => rows[r]).filter(row => !isTotalRow(row, dayOrder));

  // Score every column against every field, by header and by values, then assign best-first.
  const candidates: { col: number; field: Field; score: number; reason: NonNullable<ColumnGuess['reason']> }[] = [];
  const profiles: ColumnProfile[] = [];
  const idCols = new Set<number>();
  for (let col = 0; col < width; col++) {
    const profile = profileColumn(dataCells, col, dayOrder);
    profiles[col] = profile;
    const header = headerCells[col]?.text || '';
    // A code column: its header says so ("Client ID", "เลขที่"), or nearly every value is a code
    // ("Invoice": INV-2609-001), whatever the header says.
    if (header && (isIdHeader(header) || (profile.total >= 2 && profile.codes >= profile.total * 0.8))) {
      // "Client ID" is the client and "Project ID" the project (named through their own tab); a
      // name-like header beats it ("Client Name"). Other codes stay in the note.
      idCols.add(col);
      const base = idBase(header);
      if (base && headerScore(base, 'client') >= 0.9) candidates.push({ col, field: 'client', score: 0.7, reason: 'code' });
      else if (base && Math.max(headerScore(base, 'project'), headerScore(base, 'name')) >= 0.9) candidates.push({ col, field: 'project', score: 0.7, reason: 'code' });
      continue;
    }
    for (const { field } of HEADER_INDEX) {
      const byHeader = headerScore(header, field);
      const fit = valueFit(field, profile);
      // An exact header word counts more than its values; a partial match leans on the values.
      const score = byHeader >= 1 ? 0.75 + 0.25 * fit : byHeader > 0 ? byHeader * (0.45 + 0.55 * fit) : 0;
      if (score > 0.3) candidates.push({ col, field, score, reason: byHeader >= 1 ? 'header' : 'headerPartial' });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  // A column whose header named something (even a field already taken) is not guessed from values.
  const headerMatched = new Set(candidates.map(c => c.col));
  const targetOf = new Map<number, { field: Field; score: number; reason: NonNullable<ColumnGuess['reason']> }>();
  const used = new Set<Field>();
  for (const c of candidates) {
    if (targetOf.has(c.col) || used.has(c.field)) continue;
    targetOf.set(c.col, { field: c.field, score: c.score, reason: c.reason });
    used.add(c.field);
  }
  // A column of income/expense words is the kind of each row, whatever its header says ("Type").
  for (let col = 0; col < width; col++) {
    const p = profiles[col];
    if (p.total && p.kinds / p.total >= 0.8 && targetOf.get(col)?.field !== 'kind' && !used.has('kind')) {
      const before = targetOf.get(col);
      if (before) used.delete(before.field);
      targetOf.set(col, { field: 'kind', score: 0.9, reason: 'valuesStrong' });
      used.add('kind');
    }
  }
  // A withholding column holds rates (3%, 0.03) or amounts (300): follow the values, not the header.
  for (const [col, guess] of targetOf) {
    const p = profiles[col], share = (n: number) => (p.total ? n / p.total : 0);
    const looksLikeRates = share(p.percents) >= 0.5 || (share(p.numbers) >= 0.6 && share(p.small) >= 0.8);
    if (guess.field === 'whtAmount' && looksLikeRates && !used.has('whtRate')) { targetOf.set(col, { field: 'whtRate', score: guess.score, reason: 'valuesStrong' }); used.delete('whtAmount'); used.add('whtRate'); }
    else if (guess.field === 'whtRate' && !looksLikeRates && share(p.numbers) >= 0.6 && !used.has('whtAmount')) { targetOf.set(col, { field: 'whtAmount', score: guess.score, reason: 'valuesStrong' }); used.delete('whtRate'); used.add('whtAmount'); }
  }
  // Columns no header named: guess from the values alone (sheets without headers, or odd headers).
  const free = (field: Field) => !used.has(field);
  for (let col = 0; col < width; col++) {
    if (targetOf.has(col) || !profiles[col].total || headerMatched.has(col) || idCols.has(col)) continue;
    const p = profiles[col], share = (n: number) => n / p.total;
    // Emails, web addresses and phone numbers are kept in the note, never guessed as a name.
    const contacts = dataCells.filter(row => /^\S+@\S+\.\S+$|^https?:\/\/|^www\.|^\+?[\d\s()-]{9,}$/.test(cellAt(row, col)?.text?.trim() || '')).length;
    if (contacts >= p.total * 0.6) continue;
    let field: Field | null = null;
    if (share(p.dates) >= 0.8) field = free('date') ? 'date' : free('paidDate') ? 'paidDate' : null;
    else if (share(p.numbers) >= 0.8 && share(p.negatives) < 0.5) field = free('amount') && free('value') ? 'amount' : null;
    else if (share(p.statuses) >= 0.7) field = free('status') ? 'status' : null;
    else if (share(p.uses) >= 0.8) field = free('use') ? 'use' : null;
    // A client is only guessed from values when the sheet has no header row; with headers, an unknown
    // text column (payment method, account) is kept in the note instead.
    else if (share(p.texts) >= 0.8 && p.avgLength >= 3) field = free('name') ? 'name' : headerRow === null && free('client') && p.distinct < p.total ? 'client' : null;
    if (field) { targetOf.set(col, { field, score: 0.45, reason: 'values' }); used.add(field); }
  }

  const columns: ColumnGuess[] = [];
  for (let col = 0; col < width; col++) {
    const header = headerCells[col]?.text?.trim() || '';
    const guess = targetOf.get(col);
    if (!header && !profiles[col].total) continue;
    columns.push({
      index: col,
      header,
      target: guess ? guess.field : 'keep',
      confidence: guess ? Math.round(guess.score * 100) / 100 : 0.4,
      samples: dataCells.map(row => cellAt(row, col)?.text?.trim() || '').filter(Boolean).slice(0, 3),
      reason: guess ? guess.reason : 'none',
    });
  }

  // A summary with month names across the header (ม.ค. ก.พ. มี.ค. ...) has totals, not rows.
  const monthHeaders = headerCells.filter(cell => cell && monthFromWord(cell.text.trim().split(/\s+/)[0] || '')).length;
  const monthsAcross = monthHeaders >= 4;
  const amountCol = columns.find(c => c.target === 'amount' || c.target === 'value');
  const amountProfile = amountCol ? profiles[amountCol.index] : null;
  const signedAmounts = Boolean(amountProfile && amountProfile.numbers >= 2 && amountProfile.negatives > 0 && amountProfile.negatives < amountProfile.numbers);
  const kind = guessKind(grid.name, columns.map(c => c.target), dataCells, columns, signedAmounts);
  // A summary: the tab's name says so, or the table has no date and nothing naming a job, client or
  // project (totals by category, a metrics panel).
  const targets = new Set(columns.map(c => c.target));
  const named = targets.has('name') || targets.has('client') || targets.has('project');
  const dated = DATE_FIELDS.some(field => targets.has(field));
  const hasMoney = MONEY_FIELDS.some(field => targets.has(field));
  const role: SheetAnalysis['role'] = SUMMARY_SHEET.test(normalizeHeader(grid.name)) || (!named && !dated) ? 'summary'
    : !hasMoney && !dated ? (codeNamesOf(grid).size ? 'lookup' : 'summary') : 'data';
  // The row's own code: an ID column that is not the client or project and is (nearly) unique.
  const refColumn = [...idCols].find(col => !targetOf.has(col) && profiles[col].total > 0 && profiles[col].distinct >= profiles[col].total * 0.9) ?? null;
  return { name: grid.name, headerRow, columns, kind, dayOrder, sheetMonth: sheetMonthOf(grid), dataRows, monthsAcross, role, refColumn };
}

// ---------------------------------------------------------------------------------------------
// Building jobs and expenses

/** Why a row needs a look. The screen shows each in the app language. */
export type IssueCode =
  | 'noName' | 'noAmount' | 'negative' | 'noDate' | 'dateFromSheet' | 'dateUnreadable' | 'amountUnreadable'
  | 'transfer' | 'merged' | 'sameNameOtherSheet' | 'monthOnly' | 'paidDateFromDate'
  | 'valueFromParts' | 'paidWithoutDate' | 'statusConflict' | 'partialNoAmount' | 'duplicate' | 'duplicateInFile' | 'total' | 'repeatedHeader' | 'blank'
  /** The amount is in another currency ($, USD, €): read as written, so it must be checked. */
  | 'foreignCurrency'
  /** The same file's same row was imported before: never imported twice. */
  | 'alreadyImported'
  /** A row already in the app (same code, or same job) with different amounts or payment: offered as an update. */
  | 'changedInFile'
  /** That row was created or edited in the app after it came in: updating it would replace those edits. */
  | 'editedInApp';

export interface ImportOptions {
  /** True when the sheet's amounts are already after withholding tax. */
  amountsAreNet: boolean;
  /** Today, YYYY-MM-DD (passed in so tests are stable). */
  today: string;
  /** The file being imported: its name and SHA-256, kept with each row so the same file is not imported twice. */
  source?: { fileName: string; fingerprint: string };
}

/** Where a saved row came from (kept on the row as importSource). */
export interface ImportSource { file?: string; fingerprint?: string; sheet: string; row: number; ref?: string }

/** A row already in the app that the file changes: what it is now and what the file says. */
export interface RowUpdate {
  id: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** The row was made in the app, or edited there after it was imported. */
  origin: 'import' | 'app';
  editedSinceImport: boolean;
}

export interface ImportContext {
  statuses: StatusOption[];
  jobTypes: string[];
  existingJobs: Job[];
  existingExpenses: Expense[];
}

export type ImportedJob = Omit<Job, 'id'>;
export type ImportedExpense = Omit<Expense, 'id'>;

export interface ImportRow {
  key: string;
  sheet: string;
  /** Row number as Excel shows it (1-based). */
  rowNumber: number;
  kind: 'job' | 'expense' | 'skip';
  /**
   * ready: import as is. check: imported, with something to look at. confirm: something in it is a
   * guess or may count money twice; left out until the person ticks it. skip: left out unless ticked.
   */
  state: 'ready' | 'check' | 'confirm' | 'skip';
  issues: IssueCode[];
  job?: ImportedJob;
  expense?: ImportedExpense;
  /** For a row folded into a job from another tab: "Projects 3", shown in the review. */
  mergedInto?: string;
  /** For a job that took payments or invoices from other tabs: how many rows. */
  mergedCount?: number;
  /** Those rows: "Transactions 21", "Projects 2". */
  mergedFrom?: string[];
  /** The cells the row was read from, each with the field it went to and why. */
  source?: ImportSource & { cells: { header: string; text: string; target: ColumnTarget; reason: NonNullable<ColumnGuess['reason']> }[] };
  /** Business or personal, when the file says. */
  use?: 'business' | 'personal';
  /** Set when the row changes something already in the app instead of adding a new one. */
  update?: RowUpdate;
  /** Matching across tabs: the job's name as compared, whether it came from a ledger, and when it was paid. */
  link?: {
    key: string; ledger: boolean; paidOn: string | null;
    part?: { label: string; amount: number; due: string | null; paidOn: string | null; paid: boolean };
    /** False for a list with values only (a project list without received, outstanding, status or paid date). */
    paymentKnown?: boolean;
    /** What the row's status said about the work being done ("Completed", "In Progress"). */
    delivered?: boolean;
  };
}

export interface ImportPlan {
  rows: ImportRow[];
  /** Job types the import adds to the account's list. */
  newJobTypes: string[];
  /** Totals the file states in its own "รวม" rows, per field, to compare with the import. */
  fileTotals: Partial<Record<'value' | 'received' | 'pending' | 'amount' | 'expense' | 'income', number>>;
  /** Each tab's own total row against the sum of the rows read from that tab: does the reading add up? */
  checks: { sheet: string; field: TotalField; fileTotal: number; rowsTotal: number; ok: boolean }[];
  /** Figures a dashboard or summary tab states ("Cash received 84,000"), to compare with what is imported. */
  metrics: FileMetric[];
  /** Money moved between the person's own accounts, found in the file (not imported). */
  transfersTotal: number;
}

export type MetricField = 'received' | 'pending' | 'value' | 'expense' | 'expenseBusiness' | 'expensePersonal' | 'transfers' | 'jobs';
export interface FileMetric { sheet: string; label: string; field: MetricField; value: number }

type TotalField = 'value' | 'received' | 'pending' | 'amount' | 'expense' | 'income';
const TOTAL_FIELDS: TotalField[] = ['value', 'amount', 'received', 'pending', 'income', 'expense'];

const statusIdFor = (payment: PaymentWord, statuses: StatusOption[]) => {
  const behavior = payment === 'paid' ? 'done' : payment === 'partial' ? 'partial' : 'pending';
  const builtIn = statuses.find(s => s.id === behavior && s.behavior === behavior);
  return builtIn?.id ?? statuses.find(s => s.behavior === behavior && s.id !== 'installment')?.id ?? behavior;
};

const PRESET_RATES = [1, 1.5, 2, 3, 5, 10, 15];
const snapRate = (rate: number) => PRESET_RATES.find(preset => Math.abs(preset - rate) <= 0.05) ?? Math.round(rate * 100) / 100;

const keyOf = (...parts: (string | number | null | undefined)[]) => parts.map(p => String(p ?? '').toLowerCase().replace(/\s+/g, '')).join('|');
export const jobDuplicateKey = (job: { name: string; client?: string; value: number; postDate?: string | null; payDate?: string | null }) =>
  keyOf(job.name, job.client, Math.round(job.value), job.postDate || job.payDate);
export const expenseDuplicateKey = (expense: { name: string; amount: number; date: string }) => keyOf(expense.name, Math.round(expense.amount * 100), expense.date);

/** Expense categories the app offers, and words in a sheet that mean each. Unknown ones stay as typed. */
const CATEGORY_WORDS: [string, RegExp][] = [
  ['ค่าอุปกรณ์/ซอฟต์แวร์', /อุปกรณ์|ซอฟต์แวร์|โปรแกรม|โฮสติ้ง|โดเมน|software|equipment|hardware|adobe|canva|subscription|app|hosting|domain|cloud|server/i],
  ['ค่าโฆษณา/ยิงแอด', /โฆษณา|ยิงแอด|แอด|ads?\b|marketing|boost|facebookads/i],
  ['ค่าเดินทาง/น้ำมัน', /เดินทาง|น้ำมัน|แท็กซี่|รถ|ขนส่ง|grab|bolt|taxi|travel|transport|ride|metro|fuel|bts|mrt|ทางด่วน|parking|จอดรถ/i],
  ['อาหาร/รับรองลูกค้า', /อาหาร|รับรอง|กาแฟ|food|meal|lunch|dinner|coffee/i],
  ['จ้างงานต่อ (Outsource)', /จ้าง|outsource|freelance|ฟรีแลนซ์|ผู้ช่วย|assistant|contractor|subcontract/i],
  ['ภาษี/ธรรมเนียม', /ภาษี|ธรรมเนียม|ค่าธรรมเนียม|tax|fee|bank/i],
  ['ค่าบริการ/สาธารณูปโภค', /ค่าน้ำ|ค่าไฟ|อินเทอร์เน็ต|เน็ต|โทรศัพท์|internet|utility|utilities|electric|water|phone|ค่าเช่า|rent/i],
];
/** The app's category for a sheet's category text, trying the item's description when the category says nothing we know. */
export function mapCategory(text: string, known: string[], description = ''): string {
  const value = text.trim();
  const exact = value && known.find(k => k.toLowerCase() === value.toLowerCase());
  if (exact) return exact;
  const byCategory = value ? CATEGORY_WORDS.find(([, words]) => words.test(value))?.[0] : undefined;
  if (byCategory) return byCategory;
  const byDescription = description ? CATEGORY_WORDS.find(([, words]) => words.test(description))?.[0] : undefined;
  return byDescription ?? (value || 'อื่นๆ');
}

export const EXPENSE_CATEGORY_LIST = [...CATEGORY_WORDS.map(([name]) => name), 'อื่นๆ'];

interface Cells { get: (field: Field) => SheetCell | undefined; text: (field: Field) => string; code: (field: Field) => string; header: (field: Field) => string; notes: string[] }

const NAMED_BY_CODE: Field[] = ['name', 'client', 'project'];

function rowCells(row: SheetCell[], columns: ColumnGuess[], codes: Map<string, string>): Cells {
  const byField = new Map<Field, SheetCell>();
  const headers = new Map<Field, string>();
  const notes: string[] = [];
  for (const column of columns) {
    const cell = cellAt(row, column.index);
    if (column.target === 'ignore' || isEmpty(cell)) continue;
    if (column.target === 'keep') { notes.push(column.header ? `${column.header}: ${cell!.text.trim()}` : cell!.text.trim()); continue; }
    if (column.target === 'note' && byField.has('note')) { notes.push(cell!.text.trim()); continue; }
    if (!byField.has(column.target)) { byField.set(column.target, cell!); headers.set(column.target, column.header); }
  }
  const code = (field: Field) => (byField.get(field)?.text || '').trim();
  const text = (field: Field) => { const value = code(field); return (NAMED_BY_CODE.includes(field) && codes.get(value)) || value; };
  return { get: field => byField.get(field), text, code, header: field => headers.get(field) || '', notes };
}

function readDate(cell: SheetCell | undefined, order: DayOrder, sheetMonth: string | null): { date: string | null; unreadable: boolean; monthOnly?: boolean } {
  if (isEmpty(cell)) return { date: null, unreadable: false };
  if (cell!.date) return { date: cell!.date, unreadable: false };
  // Only the day ("5") in a tab named after the month.
  const day = typeof cell!.raw === 'number' ? cell!.raw : /^\d{1,2}$/.test(cell!.text.trim()) ? Number(cell!.text) : NaN;
  if (sheetMonth && Number.isInteger(day) && day >= 1 && day <= 31) {
    const date = validDate(Number(sheetMonth.slice(0, 4)), Number(sheetMonth.slice(5, 7)), day);
    if (date) return { date, unreadable: false };
  }
  if (typeof cell!.raw === 'number') { const date = excelSerialDate(cell!.raw); return { date, unreadable: !date }; }
  const date = parseDateText(cell!.text, order);
  if (date) return { date, unreadable: false };
  // Only a month ("ต.ค. 67", "October 2026"): the first of that month, flagged for a look.
  const month = monthFromName(cell!.text, sheetMonth ? Number(sheetMonth.slice(0, 4)) : undefined);
  return month ? { date: `${month}-01`, unreadable: false, monthOnly: true } : { date: null, unreadable: true };
}

/**
 * Turns the analysed sheets into jobs and expenses for the review table. Nothing is saved here.
 */
export function buildImportPlan(sheets: { grid: SheetGrid; analysis: SheetAnalysis }[], options: ImportOptions, context: ImportContext, allGrids?: SheetGrid[]): ImportPlan {
  const rows: ImportRow[] = [];
  // Codes are named from every tab in the file, ticked or not (a Clients tab is not imported itself).
  const codes = codeNames(allGrids ?? sheets.map(sheet => sheet.grid));
  const expenseSeen = new Map<string, { sheet: string; rowNumber: number }>();
  const newJobTypes: string[] = [];
  const fileTotals: ImportPlan['fileTotals'] = {};
  const existingJobKeys = new Set(context.existingJobs.map(jobDuplicateKey));
  const existingExpenseKeys = new Set(context.existingExpenses.map(expenseDuplicateKey));
  const fileKeys = new Set<string>();
  const knownTypes = new Map(context.jobTypes.map(type => [type.toLowerCase(), type]));
  const checks: ImportPlan['checks'] = [];

  for (const { grid, analysis } of sheets) {
    if (analysis.monthsAcross) continue;
    const headerTexts = analysis.headerRow === null ? [] : (grid.rows[analysis.headerRow] || []).map(c => normalizeHeader(c?.text || ''));
    const sheetSums: Partial<Record<TotalField, number>> = {};
    const sheetTotals: Partial<Record<TotalField, number>> = {};
    // A list of money received ("Income", "รายรับ") with no status, received or due columns: each row was paid on its date.
    const targets = new Set(analysis.columns.map(col => col.target));
    const receivedList = analysis.kind === 'jobs' && /รายรับ|รายได้|เงินเข้า|income|revenue|received|deposit/.test(normalizeHeader(analysis.name))
      && !(['status', 'received', 'pending', 'dueDate', 'creditTerm'] as Field[]).some(field => targets.has(field));
    for (const r of analysis.dataRows) {
      if (rows.length >= MAX_IMPORT_ROWS) break;
      const row = grid.rows[r] || [];
      const base = { key: `${analysis.name}:${r}`, sheet: analysis.name, rowNumber: r + 1 };
      const c = rowCells(row, analysis.columns, codes);
      // Where the row comes from, kept with it: the file, tab, row, its own code, and each cell read.
      const ref = analysis.refColumn !== null ? (cellAt(row, analysis.refColumn)?.text || '').trim().slice(0, 100) || undefined : undefined;
      const source: NonNullable<ImportRow['source']> = {
        ...(options.source ? { file: options.source.fileName.slice(0, 200), fingerprint: options.source.fingerprint } : {}),
        sheet: analysis.name, row: r + 1, ...(ref ? { ref } : {}),
        cells: analysis.columns.filter(col => !isEmpty(cellAt(row, col.index))).map(col => ({
          header: col.header || columnName(col.index), text: cellAt(row, col.index)!.text.trim().slice(0, 300), target: col.target, reason: col.reason ?? 'none',
        })),
      };

      // Total rows and repeated headers are left out; a total row's numbers are kept to compare.
      if (isTotalRow(row, analysis.dayOrder)) {
        for (const field of TOTAL_FIELDS) {
          const n = parseMoney(c.get(field));
          if (n !== null) { fileTotals[field] = (fileTotals[field] || 0) + n; sheetTotals[field] = (sheetTotals[field] || 0) + n; }
        }
        rows.push({ ...base, kind: 'skip', state: 'skip', issues: ['total'] });
        continue;
      }
      const texts = row.map(cell => normalizeHeader(cell?.text || '')).filter(Boolean);
      if (headerTexts.length && texts.length && texts.filter(t => headerTexts.includes(t)).length >= Math.max(2, texts.length * 0.6)) {
        rows.push({ ...base, kind: 'skip', state: 'skip', issues: ['repeatedHeader'] });
        continue;
      }

      for (const field of TOTAL_FIELDS) { const n = parseMoney(c.get(field)); if (n !== null && !isEmpty(c.get(field))) sheetSums[field] = (sheetSums[field] || 0) + n; }
      // Which kind of row: the sheet's kind, or per row in a ledger of money in and out.
      let rowKind: 'income' | 'expense' | 'transfer' = analysis.kind === 'expenses' ? 'expense' : 'income';
      let foreign = false;
      let ledgerAmount: number | null = null;
      if (analysis.kind === 'mixed') {
        for (const field of ['income', 'expense', 'amount', 'value'] as Field[]) if (FOREIGN_CURRENCY.test(c.get(field)?.text || '') || (c.get(field) && FOREIGN_CURRENCY.test(c.header(field)))) foreign = true;
        const kind = parseKind(c.get('kind'));
        const income = parseMoney(c.get('income')), expense = parseMoney(c.get('expense'));
        const amount = parseMoney(c.get('amount')) ?? parseMoney(c.get('value'));
        if (kind) { rowKind = kind; ledgerAmount = amount ?? (kind === 'income' ? income : expense ?? income); }
        else if (income && !expense) { rowKind = 'income'; ledgerAmount = income; }
        else if (expense && !income) { rowKind = 'expense'; ledgerAmount = expense; }
        else if (amount !== null) { rowKind = amount < 0 ? 'expense' : 'income'; ledgerAmount = amount; }
        if (ledgerAmount !== null) ledgerAmount = Math.abs(ledgerAmount);
      }
      // "Use: Transfer" is money between the person's own accounts; Business / Personal is kept.
      const useCell = parseUse(c.get('use'));
      if (useCell === 'transfer' && rowKind === 'expense') rowKind = 'transfer';

      const issues: IssueCode[] = foreign ? ['foreignCurrency'] : [];
      const order = analysis.dayOrder;
      const date = (field: Field) => { const read = readDate(c.get(field), order, analysis.sheetMonth); if (read.unreadable) issues.push('dateUnreadable'); if (read.monthOnly) issues.push('monthOnly'); return read.date; };
      const money = (field: Field) => {
        const cell = c.get(field); const n = parseMoney(cell);
        if (cell && !isEmpty(cell) && n === null) issues.push('amountUnreadable');
        // The app keeps baht. An amount marked as another currency is never converted silently.
        if (n !== null && (FOREIGN_CURRENCY.test(cell!.text) || FOREIGN_CURRENCY.test(c.header(field)))) issues.push('foreignCurrency');
        return n;
      };
      // A code keeps its code in the note, with the name when the file gives one: "Project ID: P001 (Brand Refresh)".
      const labelled = (field: Field) => (c.code(field) ? `${c.header(field) || field}: ${c.code(field)}${c.text(field) !== c.code(field) ? ` (${c.text(field)})` : ''}` : '');
      const project = c.text('project');

      if (rowKind === 'expense' || rowKind === 'transfer') {
        // A transfer to the person's own savings or tax pot is not spent money: shown, not imported.
        if (rowKind === 'transfer') issues.push('transfer');
        const note = [c.text('note'), labelled('project'), labelled('use'), ...c.notes].filter(Boolean).join(' · ').slice(0, 10000);
        let amount = ledgerAmount ?? money('amount') ?? money('expense') ?? money('value');
        if (amount !== null && amount < 0) { amount = -amount; issues.push('negative'); }
        let when = date('date') ?? date('paidDate') ?? date('postDate');
        if (!when && analysis.sheetMonth) { when = `${analysis.sheetMonth}-01`; issues.push('dateFromSheet'); }
        const name = c.text('name') || c.text('category') || c.text('note');
        if (!name && amount === null) { rows.push({ ...base, kind: 'skip', state: 'skip', issues: ['blank'] }); continue; }
        if (!name) issues.push('noName');
        if (!amount) issues.push('noAmount');
        if (!when) issues.push('noDate');
        const expense: ImportedExpense = {
          name: (name || `#${base.rowNumber}`).slice(0, 500),
          amount: roundMoney(amount || 0),
          category: mapCategory(c.text('category') || c.text('type'), EXPENSE_CATEGORY_LIST, name),
          date: when || '',
          note,
        };
        const key = expenseDuplicateKey(expense);
        // The same expense in two tabs (a bank ledger and an expense list): counted once, from the first.
        const twin = expenseSeen.get(key);
        let mergedInto: string | undefined;
        if (existingExpenseKeys.has(key)) issues.push('duplicate');
        else if (twin && twin.sheet !== analysis.name) { issues.push('merged'); mergedInto = `${twin.sheet} ${twin.rowNumber}`; }
        else if (twin) issues.push('duplicateInFile');
        if (!twin) expenseSeen.set(key, { sheet: analysis.name, rowNumber: base.rowNumber });
        // Business or personal: the Use column, or a category that only says which ("Personal").
        const use = useCell === 'business' || useCell === 'personal' ? useCell : parseUse(c.get('category'));
        rows.push({ ...base, kind: 'expense', expense, ...stateOf(issues), ...(mergedInto ? { mergedInto } : {}), source, ...(use === 'business' || use === 'personal' ? { use } : {}) });
        continue;
      }

      // Money in from a ledger is named after its project when the ledger has one ("Project / Area").
      const description = c.text('name');
      const ledgerProject = analysis.kind === 'mixed' && project && !/^(personal|other|ส่วนตัว|อื่นๆ|อื่น ๆ|ทั่วไป|general)$/i.test(project) ? project : '';
      const note = [c.text('note'), ledgerProject && description && description !== ledgerProject ? description : '', !ledgerProject ? labelled('project') : '',
        analysis.kind === 'jobs' ? labelled('expense') : '', labelled('use'), ...c.notes].filter(Boolean).join(' · ').slice(0, 10000);

      // A job (or money in from a ledger, which is a job that has been paid).
      const name = ledgerProject || description || c.text('project') || c.text('client') || c.text('type');
      let value = ledgerAmount ?? money('value') ?? money('amount') ?? money('income');
      let received = analysis.kind === 'mixed' ? ledgerAmount : money('received');
      const pendingCell = money('pending');
      if (!name && value === null && received === null && pendingCell === null) { rows.push({ ...base, kind: 'skip', state: 'skip', issues: ['blank'] }); continue; }
      if (value !== null && value < 0) { value = -value; issues.push('negative'); }
      if (received !== null && received < 0) { received = -received; issues.push('negative'); }

      let whtRate = parseRate(c.get('whtRate')) ?? 0;
      const whtGiven = money('whtAmount');
      if (value === null && (received !== null || pendingCell !== null)) {
        value = (received || 0) + (pendingCell || 0);
        issues.push('valueFromParts');
      }
      if (!whtRate && whtGiven && value) whtRate = snapRate((whtGiven / value) * 100);
      if (whtRate > 100) whtRate = 0;
      // Amounts already after withholding: the job value is what was billed before it.
      if (options.amountsAreNet && whtRate > 0 && value) value = roundMoney(value / (1 - whtRate / 100));
      const gross = roundMoney(value || 0);
      const whtAmount = whtAmountFor(gross, whtRate);
      const net = roundMoney(gross - whtAmount);

      const status = parseStatus(c.get('status'));
      const paidDate = date('paidDate');
      const dueDate = date('dueDate');
      let postDate = date('postDate') ?? date('date');
      if (!postDate && analysis.sheetMonth && !paidDate) { postDate = `${analysis.sheetMonth}-01`; issues.push('dateFromSheet'); }

      // Payment: from the amounts first, then the status words, then a payment date.
      let payment: PaymentWord = 'unpaid';
      let receivedFinal = 0;
      if (analysis.kind === 'mixed' || receivedList) { payment = 'paid'; receivedFinal = net; }
      else if (received !== null) {
        receivedFinal = Math.min(received, net);
        payment = received >= net && net > 0 ? 'paid' : received > 0 ? 'partial' : 'unpaid';
        if (status.payment && status.payment !== payment && !(status.payment === 'partial' && payment !== 'unpaid')) issues.push('statusConflict');
      } else if (pendingCell !== null) {
        receivedFinal = Math.max(0, net - pendingCell);
        payment = pendingCell <= 0 ? 'paid' : receivedFinal > 0 ? 'partial' : 'unpaid';
      } else if (status.payment === 'paid' || (!status.payment && paidDate)) { payment = 'paid'; receivedFinal = net; }
      else if (status.payment === 'partial') issues.push('partialNoAmount');
      if (payment === 'paid') receivedFinal = net;

      const creditFromCell = parseCreditTerm(c.get('creditTerm'));
      const creditTerm = creditFromCell ?? (postDate && dueDate && dueDate >= postDate
        ? Math.round((Date.parse(dueDate) - Date.parse(postDate)) / 86400000) : 0);
      // A ledger's or income list's date is when the money came in; a job list's date may be the job's,
      // so using it as the payment date is flagged for a look.
      const dateIsPayment = analysis.kind === 'mixed' || receivedList;
      let paidOn = paidDate ?? (payment === 'paid' && dateIsPayment ? postDate : null);
      if (!paidOn && payment === 'paid') { paidOn = date('date') || null; if (paidOn) issues.push('paidDateFromDate'); }
      if (payment === 'paid' && !paidOn) issues.push('paidWithoutDate');
      if (!postDate && !paidOn && !dueDate) issues.push('noDate');
      if (!name) issues.push('noName');
      if (!gross) issues.push('noAmount');

      const delivered = status.delivered ?? (payment !== 'unpaid' || Boolean(postDate && postDate <= options.today));
      const typeText = c.text('type') || (analysis.kind === 'jobs' ? c.text('category') : '');
      let type = 'ยังไม่ระบุ';
      if (typeText) {
        const known = knownTypes.get(typeText.toLowerCase());
        type = known ?? typeText.slice(0, 500);
        if (!known) { knownTypes.set(typeText.toLowerCase(), type); newJobTypes.push(type); }
      }
      const pending = Math.max(0, roundMoney(net - receivedFinal));
      const payDate = payment === 'paid' ? paidOn : dueDate ?? calculatePayDate(postDate, creditTerm, false);
      const job: ImportedJob = {
        name: (name || `#${base.rowNumber}`).slice(0, 500),
        type,
        client: c.text('client').slice(0, 10000),
        value: gross,
        received: roundMoney(receivedFinal),
        pending,
        status: statusIdFor(payment, context.statuses),
        paymentStatus: payment === 'paid' ? 'paid' : payment === 'partial' ? 'partial' : 'unpaid',
        creditTerm: Math.min(Math.max(0, creditTerm), 3650),
        postDate: postDate || undefined,
        startDate: postDate || paidOn || undefined,
        isPosted: delivered,
        payDate: payDate || null,
        note,
        whtRate,
        whtAmount,
        excludeHolidays: false,
        installments: [],
        ...(payment === 'partial' && receivedFinal > 0 ? { depositDate: paidOn, depositAmount: roundMoney(receivedFinal) } : {}),
      };
      const key = jobDuplicateKey(job);
      if (existingJobKeys.has(key)) issues.push('duplicate');
      else if (fileKeys.has(`j:${key}`)) issues.push('duplicateInFile');
      fileKeys.add(`j:${key}`);
      // A row that is one installment of a job (our own CSV export writes one row per installment).
      const partLabel = c.text('installment');
      const partStatus = parseStatus(c.get('installmentStatus')).payment;
      const part = partLabel ? {
        label: partLabel.slice(0, 100),
        amount: roundMoney((received ?? 0) + (pendingCell ?? 0) || net),
        due: dueDate,
        paidOn: paidDate,
        paid: partStatus ? partStatus === 'paid' : (received ?? 0) > 0 && !pendingCell,
      } : undefined;
      const paymentKnown = analysis.kind === 'mixed' || receivedList || received !== null || pendingCell !== null || Boolean(status.payment) || Boolean(paidDate);
      rows.push({ ...base, kind: 'job', job, ...stateOf(issues), source, link: { key: matchKey(job.name), ledger: analysis.kind === 'mixed', paidOn, part, paymentKnown, delivered: status.delivered } });
    }
    for (const field of TOTAL_FIELDS) {
      if (sheetTotals[field] === undefined) continue;
      const fileTotal = roundMoney(sheetTotals[field]!), rowsTotal = roundMoney(sheetSums[field] || 0);
      checks.push({ sheet: analysis.name, field, fileTotal, rowsTotal, ok: sameMoney(fileTotal, rowsTotal) });
    }
  }
  groupInstallments(rows, options, context);
  reconcileAcrossSheets(rows, options, context);
  matchExisting(rows, context);
  const included = new Set(sheets.map(sheet => sheet.grid));
  const metrics = fileMetrics((allGrids ?? []).filter(grid => !included.has(grid)));
  const transfersTotal = toBaht(rows.filter(row => row.issues.includes('transfer') && row.expense).reduce((sum, row) => sum + toSatang(row.expense!.amount), 0));
  return { rows, newJobTypes, fileTotals, checks, metrics, transfersTotal };
}

const FOREIGN_CURRENCY = /\$|\busd\b|€|\beur\b|£|\bgbp\b|¥|\bjpy\b|\bsgd\b|\baud\b|\bcny\b|\brmb\b|ดอลลาร์|ยูโร/i;

// Money is compared and added in satang (whole numbers), so 0.1 + 0.2 never drifts.
const toSatang = (baht: number) => Math.round(baht * 100);
const toBaht = (satang: number) => satang / 100;
const sameMoney = (a: number, b: number) => toSatang(a) === toSatang(b);
const columnName = (index: number) => { let name = '', n = index + 1; while (n > 0) { const m = (n - 1) % 26; name = String.fromCharCode(65 + m) + name; n = Math.floor((n - 1) / 26); } return name; };

// ---------------------------------------------------------------------------------------------
// Rows already in the app

const sourceOf = (item: object) => (item as { importSource?: ImportSource }).importSource;
const blank = (value: unknown) => (value === undefined || value === '' ? null : value);
const sameField = (a: unknown, b: unknown) => (typeof a === 'number' || typeof b === 'number' ? toSatang(Number(a) || 0) === toSatang(Number(b) || 0) : blank(a) === blank(b));
const installmentsKey = (list?: Job['installments']) => JSON.stringify((list || []).map(i => [toSatang(i.amount), i.status, i.dueDate || null, i.paidAt || null]));
const JOB_UPDATE_FIELDS = ['value', 'whtRate', 'whtAmount', 'received', 'pending', 'payDate', 'depositDate', 'depositAmount', 'creditTerm'] as const;
const EXPENSE_UPDATE_FIELDS = ['name', 'amount', 'date', 'category'] as const;

/** What the file changes in a row already in the app: amounts, payment, dates. Nothing else is touched. */
function changesOf(existing: Record<string, unknown>, incoming: Record<string, unknown>, fields: readonly string[], installments: boolean) {
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const field of fields) if (!sameField(existing[field], incoming[field])) { before[field] = existing[field] ?? null; after[field] = incoming[field] ?? null; }
  if (installments && installmentsKey(existing.installments as Job['installments']) !== installmentsKey(incoming.installments as Job['installments'])) {
    before.installments = existing.installments || []; after.installments = incoming.installments || [];
  }
  if (!Object.keys(after).length) return null;
  if (installments) { before.status = existing.status; after.status = incoming.status; before.paymentStatus = existing.paymentStatus ?? null; after.paymentStatus = incoming.paymentStatus; }
  return { before, after };
}

/**
 * Rows the app already has. The same row of the same file (same fingerprint, tab and row) is never
 * imported again. A row with the same code (INV-2609-005) or the same job that the file now shows
 * differently (paid since) is offered as an update of that row, left out until the person ticks it.
 */
function matchExisting(rows: ImportRow[], context: ImportContext) {
  type Existing = { kind: 'job' | 'expense'; item: Job | Expense };
  const bySource = new Map<string, Existing>(), byRef = new Map<string, Existing>(), jobsByKey = new Map<string, Job>();
  const add = (kind: Existing['kind'], item: Job | Expense) => {
    const s = sourceOf(item);
    if (!s) return;
    if (s.fingerprint) bySource.set(`${s.fingerprint}|${s.sheet}|${s.row}`, { kind, item });
    if (s.ref) byRef.set(`${kind}|${normalizeHeader(s.sheet)}|${s.ref}`, { kind, item });
  };
  for (const job of context.existingJobs) { add('job', job); jobsByKey.set(jobDuplicateKey(job), job); }
  for (const expense of context.existingExpenses) add('expense', expense);
  for (const row of rows) {
    if (!row.source || !(row.job || row.expense) || row.issues.some(issue => (['merged', 'transfer', 'noAmount'] as IssueCode[]).includes(issue))) continue;
    const kind = row.job ? 'job' : 'expense';
    const s = row.source;
    const sameRow = s.fingerprint ? bySource.get(`${s.fingerprint}|${s.sheet}|${s.row}`) : undefined;
    if (sameRow && sameRow.kind === kind) { Object.assign(row, stateOf(['alreadyImported'])); continue; }
    const byCode = s.ref ? byRef.get(`${kind}|${normalizeHeader(s.sheet)}|${s.ref}`) : undefined;
    const target = byCode && byCode.kind === kind ? byCode.item : row.job && row.issues.includes('duplicate') ? jobsByKey.get(jobDuplicateKey(row.job)) : undefined;
    if (!target) continue;
    const change = row.job
      ? changesOf(target as unknown as Record<string, unknown>, row.job as unknown as Record<string, unknown>, JOB_UPDATE_FIELDS, true)
      : changesOf(target as unknown as Record<string, unknown>, row.expense as unknown as Record<string, unknown>, EXPENSE_UPDATE_FIELDS, false);
    const others = row.issues.filter(issue => issue !== 'duplicate');
    if (!change) { Object.assign(row, stateOf([...others, byCode ? 'alreadyImported' : 'duplicate'])); continue; }
    const meta = target as { importBatchId?: string; importedAt?: string; lastActivityAt?: string };
    const imported = Boolean(sourceOf(target) || meta.importBatchId);
    const editedSinceImport = imported && Boolean(meta.importedAt && meta.lastActivityAt && meta.lastActivityAt > meta.importedAt);
    row.update = { id: target.id, before: change.before, after: change.after, origin: imported ? 'import' : 'app', editedSinceImport };
    Object.assign(row, stateOf([...others, 'changedInFile', ...(!imported || editedSinceImport ? ['editedInApp' as const] : [])]));
  }
}

// ---------------------------------------------------------------------------------------------
// Figures a dashboard states

const METRIC_LABELS: [MetricField, RegExp][] = [
  ['received', /^(cashreceived|totalreceived|received|cashincome|incomereceived|moneyreceived|totalcashreceived|รับแล้ว|รับเงินแล้ว|เงินรับจริง|รายรับที่ได้รับ|ยอดรับเงิน|เงินเข้าจริง)$/],
  ['pending', /^(receivablesoutstanding|outstandingreceivables|outstanding|outstandinginvoices|accountsreceivable|receivables|unpaidinvoices|ค้างรับ|ยอดค้างรับ|ลูกหนี้คงค้าง|ใบแจ้งหนี้ค้างชำระ)$/],
  ['value', /^(totalinvoicesissued|totalinvoiced|invoicedtotal|totalcontractvalue|contractvalue|totalprojectvalue|มูลค่างานรวม|ยอดออกใบแจ้งหนี้)$/],
  ['expense', /^(totalexpenses?|expensestotal|totalspent|รายจ่ายรวม|ค่าใช้จ่ายรวม|รวมรายจ่าย)$/],
  ['expenseBusiness', /^(businessexpenses?(paid)?|businesscosts|ค่าใช้จ่ายธุรกิจ|รายจ่ายธุรกิจ)$/],
  ['expensePersonal', /^(personalexpenses?(paid)?|personalspending|ค่าใช้จ่ายส่วนตัว|รายจ่ายส่วนตัว)$/],
  ['transfers', /^(ownertransfersout|ownertransfers|savings(and|&)?taxtransfers|savingstransfers|transferstosavings|โอนเข้าเงินออม|เงินโอนออม)$/],
  ['jobs', /^(totalprojects|projectcount|numberofprojects|totaljobs|จำนวนงาน|จำนวนโปรเจกต์|จำนวนโครงการ)$/],
];

/** Label / number pairs on summary tabs that name a figure the import can be compared with. */
export function fileMetrics(grids: SheetGrid[]): FileMetric[] {
  const found: FileMetric[] = [];
  for (const grid of grids) {
    if (analyzeSheet(grid).role !== 'summary') continue;
    const seen = new Set<MetricField>();
    for (const row of grid.rows.slice(0, 200)) {
      for (let col = 0; col < (row?.length || 0) - 1; col++) {
        const label = row[col];
        if (!label || typeof label.raw !== 'string' || isNumberLike(label)) continue;
        const valueCell = [row[col + 1], row[col + 2]].find(cell => !isEmpty(cell));
        const value = valueCell && isNumberLike(valueCell) ? parseMoney(valueCell) : null;
        if (value === null) continue;
        const field = METRIC_LABELS.find(([, words]) => words.test(normalizeHeader(label.text)))?.[0];
        if (!field || seen.has(field)) continue;
        seen.add(field);
        found.push({ sheet: grid.name, label: label.text.trim(), field, value });
      }
    }
  }
  return found;
}

export interface MetricCheck { sheet: string; label: string; field: MetricField; fileValue: number; importValue: number; ok: boolean }

/** Each stated figure against what the import adds (live: follows what the person ticks). */
export function compareMetrics(metrics: FileMetric[], totals: ReturnType<typeof planTotals>, details: ReturnType<typeof planDetails>, transfersTotal: number): MetricCheck[] {
  const checks: MetricCheck[] = [];
  const add = (metric: FileMetric | { sheet: string; label: string; field: MetricField; value: number }, importValue: number) =>
    checks.push({ sheet: metric.sheet, label: metric.label, field: metric.field, fileValue: metric.value, importValue, ok: metric.field === 'jobs' ? metric.value === importValue : sameMoney(metric.value, importValue) });
  const business = metrics.find(m => m.field === 'expenseBusiness'), personal = metrics.find(m => m.field === 'expensePersonal');
  for (const metric of metrics) {
    if (metric.field === 'received') add(metric, totals.received);
    else if (metric.field === 'pending') add(metric, totals.pending);
    else if (metric.field === 'value') add(metric, totals.value);
    else if (metric.field === 'expense') add(metric, totals.expenseAmount);
    else if (metric.field === 'transfers') add(metric, transfersTotal);
    else if (metric.field === 'jobs') add(metric, totals.jobs);
  }
  if (!metrics.some(m => m.field === 'expense') && (business || personal)) {
    // Each part on its own when every expense says business or personal; otherwise their sum.
    if (details.expenseNoUse === 0 && (business || personal)) {
      if (business) add(business, details.expenseBusiness);
      if (personal) add(personal, details.expensePersonal);
    } else {
      add({ sheet: (business ?? personal)!.sheet, label: [business?.label, personal?.label].filter(Boolean).join(' + '), field: 'expense', value: toBaht(toSatang(business?.value ?? 0) + toSatang(personal?.value ?? 0)) }, totals.expenseAmount);
    }
  }
  return checks;
}

/** Rows that are installments of one job (same tab, same job name, an installment label) become that one job. */
function groupInstallments(rows: ImportRow[], options: ImportOptions, context: ImportContext) {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) if (row.job && row.link?.part) { const key = `${row.sheet}|${row.link.key}`; (groups.get(key) ?? groups.set(key, []).get(key)!).push(row); }
  for (const group of groups.values()) {
    const [anchor, ...rest] = group;
    const value = Math.max(...group.map(r => r.job!.value));
    const parts = group.map(r => r.link!.part!);
    const base = { ...anchor.job!, value, whtAmount: whtAmountFor(value, anchor.job!.whtRate || 0) };
    anchor.job = scheduledJob(base,
      parts.filter(p => p.paid).map(p => ({ amount: p.amount, date: p.paidOn ?? p.due, label: p.label })),
      parts.filter(p => !p.paid).map(p => ({ amount: p.amount, date: p.due, label: p.label })),
      rest.map(r => r.job!), options, context, true);
    anchor.mergedCount = rest.length || undefined;
    if (rest.length) anchor.mergedFrom = rest.map(r => `${r.sheet} ${r.rowNumber}`);
    anchor.link = { ...anchor.link!, part: undefined };
    Object.assign(anchor, stateOf(anchor.issues.filter(issue => issue !== 'duplicateInFile')));
    for (const r of rest) { r.state = 'skip'; r.issues = ['merged']; r.mergedInto = `${anchor.sheet} ${anchor.rowNumber}`; }
  }
}

const matchKey = (name: string) => name.toLowerCase().normalize('NFC').replace(/[\s\-–—_.,:/()]+/g, '');

/**
 * Many workbooks record one job in several tabs: a project list (value, received, outstanding), a
 * ledger with each payment, and an invoice list with what is still due. Importing all three would
 * count the money two or three times. When the payments in other tabs add up to what the project
 * list says was received, or the unpaid invoices add up to what it says is outstanding, they are
 * folded into that one job (its payment dates, due dates and invoice notes) and left out themselves.
 */
function reconcileAcrossSheets(rows: ImportRow[], options: ImportOptions, context: ImportContext) {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) if (row.job && row.link && row.link.key) (groups.get(row.link.key) ?? groups.set(row.link.key, []).get(row.link.key)!).push(row);
  for (const all of groups.values()) {
    if (new Set(all.map(r => r.sheet)).size < 2) continue;
    foldProjectList(all, options, context);
    const group = all.filter(r => !r.issues.includes('merged'));
    if (new Set(group.map(r => r.sheet)).size < 2) continue;
    const anchor = group.filter(r => !r.link!.ledger && (r.job!.received > 0 || r.job!.pending > 0))
      .sort((a, b) => b.job!.value - a.job!.value)[0];
    if (!anchor) continue;
    const job = anchor.job!;
    const others = group.filter(r => r !== anchor && r.sheet !== anchor.sheet);
    const payments = others.filter(r => r.link!.ledger && r.job!.paymentStatus === 'paid');
    const dues = others.filter(r => !r.link!.ledger && r.job!.paymentStatus === 'unpaid' && r.job!.value > 0);
    const sum = (list: ImportRow[]) => toBaht(list.reduce((total, r) => total + toSatang(r.job!.value), 0));
    const paidMatches = payments.length > 0 && sameMoney(sum(payments), job.received);
    const duesMatch = dues.length > 0 && sameMoney(sum(dues), job.pending);
    if (!paidMatches && !duesMatch) {
      for (const r of others) if (!r.issues.includes('sameNameOtherSheet')) Object.assign(r, stateOf([...r.issues, 'sameNameOtherSheet']));
      continue;
    }
    const merged = [...(paidMatches ? payments : []), ...(duesMatch ? dues : [])];
    // A job already split into installments by its invoices: the ledger's payments only confirm them.
    anchor.mergedFrom = [...(anchor.mergedFrom || []), ...merged.map(r => `${r.sheet} ${r.rowNumber}`)];
    if (job.installments?.length) {
      anchor.mergedCount = (anchor.mergedCount || 0) + merged.length;
      for (const r of merged) { r.state = 'skip'; r.issues = ['merged']; r.mergedInto = `${anchor.sheet} ${anchor.rowNumber}`; }
      for (const r of others) if (!merged.includes(r)) Object.assign(r, stateOf([...r.issues, 'sameNameOtherSheet']));
      continue;
    }
    const paid = paidMatches
      ? payments.map(r => ({ amount: r.job!.value, date: r.link!.paidOn })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      : job.received > 0 ? [{ amount: job.received, date: job.depositDate ?? (job.pending <= 0 ? job.payDate : null) }] : [];
    const due = duesMatch
      ? dues.map(r => ({ amount: r.job!.value, date: r.job!.payDate })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
      : job.pending > 0 ? [{ amount: job.pending, date: job.payDate }] : [];
    anchor.job = scheduledJob(job, paid, due, merged.map(r => r.job!), options, context);
    anchor.mergedCount = (anchor.mergedCount || 0) + merged.length;
    anchor.issues = anchor.issues.filter(issue => !(['noDate', 'paidWithoutDate'] as IssueCode[]).includes(issue) || !(anchor.job!.postDate || anchor.job!.payDate));
    Object.assign(anchor, stateOf(anchor.issues));
    for (const r of merged) { r.state = 'skip'; r.issues = ['merged']; r.mergedInto = `${anchor.sheet} ${anchor.rowNumber}`; }
    for (const r of others) if (!merged.includes(r)) Object.assign(r, stateOf([...r.issues, 'sameNameOtherSheet']));
  }
}

/**
 * A project list with each job's value but nothing about payment ("Contract Value", "Status:
 * Completed"), and an invoice list with what was billed, received and is outstanding, for the same
 * jobs. When a project's invoices add up to its value they are one job: one invoice keeps its row with
 * the project's name, delivery status and notes; several become the project's installments.
 */
function foldProjectList(group: ImportRow[], options: ImportOptions, context: ImportContext) {
  const plain = group.filter(r => !r.link!.ledger && r.link!.paymentKnown === false && r.job!.value > 0);
  if (plain.length !== 1) return;
  const [project] = plain;
  const invoices = group.filter(r => !r.link!.ledger && r.link!.paymentKnown && r.sheet !== project.sheet && r.job!.value > 0)
    .sort((a, b) => String(a.job!.postDate).localeCompare(String(b.job!.postDate)));
  if (!invoices.length || !sameMoney(toBaht(invoices.reduce((total, r) => total + toSatang(r.job!.value), 0)), project.job!.value)) return;
  const p = project.job!;
  const delivered = project.link!.delivered;
  const fold = (rowsIn: ImportRow[], anchor: ImportRow) => {
    anchor.mergedCount = (anchor.mergedCount || 0) + rowsIn.length;
    anchor.mergedFrom = [...(anchor.mergedFrom || []), ...rowsIn.map(r => `${r.sheet} ${r.rowNumber}`)];
    for (const r of rowsIn) { r.state = 'skip'; r.issues = ['merged']; r.mergedInto = `${anchor.sheet} ${anchor.rowNumber}`; }
  };
  if (invoices.length === 1) {
    const [invoice] = invoices;
    const j = invoice.job!;
    invoice.job = {
      ...j, name: p.name, client: j.client || p.client, type: j.type === 'ยังไม่ระบุ' ? p.type : j.type,
      isPosted: delivered ?? j.isPosted, note: joinNotes([j.note, p.note]),
    };
    fold([project], invoice);
    return;
  }
  const whtRate = p.whtRate || invoices[0].job!.whtRate || 0;
  const paid = invoices.filter(r => r.job!.received > 0).map(r => ({ amount: r.job!.received, date: r.link!.paidOn ?? r.job!.depositDate ?? r.job!.payDate ?? null }));
  const due = invoices.filter(r => r.job!.pending > 0).map(r => ({ amount: r.job!.pending, date: r.job!.payDate ?? null }));
  project.job = scheduledJob({ ...p, client: p.client || invoices[0].job!.client, whtRate, whtAmount: whtAmountFor(p.value, whtRate) }, paid, due, invoices.map(r => r.job!), options, context, true);
  project.job.isPosted = delivered ?? project.job.isPosted;
  Object.assign(project, stateOf(project.issues.filter(issue => issue !== 'noDate')));
  fold(invoices, project);
}

/** Notes of rows folded together, each part once ("Project ID: P001" is in both the project and its invoice). */
const joinNotes = (notes: (string | undefined)[]) => [...new Set(notes.flatMap(note => (note || '').split(' · ')).map(part => part.trim()).filter(Boolean))].join(' · ').slice(0, 10000);

/** A job with its payments and amounts due spelled out, the way the job form saves deposits and installments. */
function scheduledJob(job: ImportedJob, paid: { amount: number; date: string | null; label?: string }[], due: { amount: number; date: string | null; label?: string }[], from: ImportedJob[], options: ImportOptions, context: ImportContext, asInstallments = false): ImportedJob {
  const net = roundMoney(job.value - (job.whtAmount || 0));
  const received = roundMoney(Math.min(net, paid.reduce((total, p) => total + p.amount, 0)));
  const pending = Math.max(0, roundMoney(net - received));
  const firstDate = [...paid.map(p => p.date), ...from.map(j => j.postDate || null)].filter(Boolean).sort()[0] as string | undefined;
  const postDate = job.postDate || firstDate;
  const notes = [job.note, ...from.filter(j => j.paymentStatus === 'unpaid').map(j => j.note)].filter(Boolean);
  const base: ImportedJob = { ...job, received, pending, postDate, startDate: job.startDate || postDate, isPosted: job.isPosted || received > 0 || Boolean(postDate && postDate <= options.today), note: joinNotes(notes) };
  delete base.depositDate; delete base.depositAmount;
  const nextDue = due.map(d => d.date).filter(Boolean).sort()[0] ?? null;
  if (!asInstallments && paid.length <= 1 && due.length <= 1) {
    const payment: PaymentWord = pending <= 0 && net > 0 ? 'paid' : received > 0 ? 'partial' : 'unpaid';
    return {
      ...base, installments: [],
      status: statusIdFor(payment, context.statuses), paymentStatus: payment,
      payDate: payment === 'paid' ? paid[0]?.date ?? job.payDate : nextDue ?? job.payDate,
      ...(payment === 'partial' ? { depositDate: paid[0]?.date ?? null, depositAmount: received } : {}),
    };
  }
  // Two or more payments, or several amounts due: installments, as the job form makes them.
  const installments = [
    ...paid.map(p => ({ label: p.label, amount: p.amount, dueDate: p.date, paidAt: p.date, status: 'paid' as const })),
    ...due.map(d => ({ label: d.label, amount: d.amount, dueDate: d.date, paidAt: null, status: 'pending' as const })),
  ].map(({ label, ...row }, index) => ({ id: `import-${index}-${Math.random().toString(36).slice(2, 8)}`, label: label || `งวดที่ ${index + 1}`, ...row }));
  return { ...base, installments, status: 'installment', paymentStatus: pending <= 0 ? 'paid' : received > 0 ? 'partial' : 'unpaid', payDate: nextDue ?? job.payDate };
}

const SKIP_ISSUES: IssueCode[] = ['duplicate', 'alreadyImported', 'noAmount', 'transfer', 'merged'];
/**
 * Issues where the app had to guess, or where money might count twice or replace something in the
 * app: the row waits for the person to tick it (owner's brief, 2026-10-22).
 */
export const CONFIRM_ISSUES: IssueCode[] = ['foreignCurrency', 'sameNameOtherSheet', 'duplicateInFile', 'statusConflict', 'partialNoAmount', 'amountUnreadable', 'dateUnreadable', 'negative', 'paidDateFromDate', 'monthOnly', 'dateFromSheet', 'changedInFile', 'editedInApp'];
export function stateOf(issues: IssueCode[]): { state: ImportRow['state']; issues: IssueCode[] } {
  const unique = [...new Set(issues)];
  if (unique.some(issue => SKIP_ISSUES.includes(issue))) return { state: 'skip', issues: unique };
  if (unique.some(issue => CONFIRM_ISSUES.includes(issue))) return { state: 'confirm', issues: unique };
  return { state: unique.length ? 'check' : 'ready', issues: unique };
}

/** What the import adds as new rows, for the summary above the review table (updates are counted apart). */
export function planTotals(rows: ImportRow[], included: (row: ImportRow) => boolean) {
  const totals = { jobs: 0, expenses: 0, value: 0, received: 0, pending: 0, expenseAmount: 0 };
  for (const row of rows) {
    if (!included(row) || row.update) continue;
    if (row.job) { totals.jobs++; totals.value += toSatang(row.job.value); totals.received += toSatang(row.job.received); totals.pending += toSatang(row.job.pending); }
    if (row.expense) { totals.expenses++; totals.expenseAmount += toSatang(row.expense.amount); }
  }
  for (const key of ['value', 'received', 'pending', 'expenseAmount'] as const) totals[key] = toBaht(totals[key]);
  return totals;
}

/** Updates, and new expenses split by business / personal. */
export function planDetails(rows: ImportRow[], included: (row: ImportRow) => boolean) {
  let updates = 0, business = 0, personal = 0, noUse = 0;
  for (const row of rows) {
    if (!included(row)) continue;
    if (row.update) { updates++; continue; }
    if (!row.expense) continue;
    if (row.use === 'personal') personal += toSatang(row.expense.amount);
    else { business += toSatang(row.expense.amount); if (!row.use) noUse++; }
  }
  return { updates, expenseBusiness: toBaht(business), expensePersonal: toBaht(personal), expenseNoUse: noUse };
}

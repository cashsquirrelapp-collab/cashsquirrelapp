import { guessExpenseCategory } from '../../../shared/expenseCategory.js';
import { addDays, EXPENSE_CATEGORIES, parseThaiDate, thaiDayText } from '../services/lineJobQuestions.js';

// Many records pasted at once (owner, 2026-11-16: "ถ้าสมมติบันทึกประมาณ 10 ถึง 20 ถึง 30 งาน ... ยังไม่แม่นยำ ... มันนับเอาแค่อันที่
// มันมีวันที่ ... ไอ้ที่ไม่มีวันที่ข้างบนอ่ะ มันไม่นับ ... มึงก็ต้องถามเขาก่อน ... ก่อนที่มึงจะบันทึกอะไรสักอย่าง"). The model was
// given the whole paste and its job tool refused lines that lacked a detail, so it left them out without saying so. Here every
// line is read by rules, one line one record: nothing is dropped, "วันนี้" and "เมื่อวาน" become the real day, and what a line
// does not say is asked (one question at a time, with taps) before any card is made. No model call and no tokens.

export type EntryKind = 'income' | 'expense' | 'job';
export type EntryField = 'kind' | 'amount' | 'date' | 'deposit' | 'match' | 'delivered' | 'credit' | 'category';

export interface Entry {
  /** The line's place in what was pasted (1 = the first record line). */
  line: number;
  /** The line as it was written, for the questions and the cards. */
  text: string;
  kind: EntryKind | null;
  name: string;
  amount: number | null;
  /** The day it happened (income/expense) or the job was taken on: YYYY-MM-DD. */
  date: string | null;
  /** The client as written; '' when the line names none. */
  client: string;
  creditDays: number | null;
  /** Withholding tax said on the line; 0 when not said (the app's job form default). */
  whtRate: number;
  /** "มัดจำ": money received before the work is done. */
  deposit: boolean;
  /** A deposit's whole job value, when the person gives it. */
  total: number | null;
  delivered: boolean | null;
  deliveredOn: string | null;
  category: string | null;
  /** Income for a job already waiting for payment in the account (asked, never guessed). */
  jobId: string | null;
  /** Questions already settled for this line (an answer that leaves the value empty, such as "เป็นรายรับใหม่"). */
  settled: EntryField[];
  /** "ไม่บันทึกรายการนี้". */
  skip: boolean;
  /** Details the rules filled in themselves, said on the card so the person can check them. */
  assumed: string[];
}

export interface EntryBatch {
  id: string;
  createdAt: string;
  /** Today in Bangkok when it was pasted, for every relative day. */
  today: string;
  entries: Entry[];
  /** Lines that were not records (a heading day, a greeting), kept to say how the paste was read. */
  ignored: number;
  /** The days question goes item by item instead of one answer for all. */
  oneByOne?: boolean;
  /** The questions waiting for their answers (LINE asks one at a time, the app's card several at once). */
  asking?: { field: EntryField; lines: number[] }[] | null;
}

/** An unpaid job the money may belong to (from the account, matched by amount or by name). */
export interface OpenJob { id: string; name: string; client?: string; pending: number; value: number }

export const MAX_ENTRIES = 40;
export const KIND_WORDS: Record<EntryKind, string> = { income: 'รายรับ', expense: 'รายจ่าย', job: 'งานรอรับเงิน' };

const THAI_DIGIT = /[๐-๙]/g;
const tidy = (text: string) => text.normalize('NFC').replace(THAI_DIGIT, digit => String(digit.charCodeAt(0) - 0x0E50))
  .replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();
const BULLET = /^(?:[-–—•*·▪●○◦➖➤►✅✔☑️✓]+\s*|\(?\d{1,3}[.)](?=\s|\D)\s*)/u;
const QUESTION = /[?？]|ไหม|มั้ย|หรือเปล่า|รึเปล่า|เท่าไหร่|เท่าไร|กี่บาท|อะไรบ้าง|ทำไม|อย่างไร|ยังไง|ได้ไหม|ช่วยดู|สรุป/;
const DOCUMENT = /ใบเสนอราคา|ใบแจ้งหนี้|ใบวางบิล|ใบกำกับ|ออกใบเสร็จ|ทำใบเสร็จ/;
const EDIT = /^(?:แก้|ลบ|เปลี่ยน|ย้าย|ยกเลิก|เลื่อน|ค้นหา|หา|ดู)/;
const CLOSING = /^(?:ขอบคุณ|ขอบใจ|ครับ|ค่ะ|คะ|จ้า|ตามนี้|แค่นี้|ประมาณนี้|เท่านี้)/;
const PARTICLE = /\s*(?:นะ(?:ครับ|คะ|คับ)?|ครับ|ค่ะ|คะ|จ้า|จ้ะ|คับ|ด้วย|หน่อย)\s*$/;

const MONTHS = ['มกราคม|ม\\.?ค\\.?', 'กุมภาพันธ์|ก\\.?พ\\.?', 'มีนาคม|มี\\.?ค\\.?', 'เมษายน|เม\\.?ย\\.?', 'พฤษภาคม|พ\\.?ค\\.?',
  'มิถุนายน|มิ\\.?ย\\.?', 'กรกฎาคม|ก\\.?ค\\.?', 'สิงหาคม|ส\\.?ค\\.?', 'กันยายน|ก\\.?ย\\.?', 'ตุลาคม|ต\\.?ค\\.?', 'พฤศจิกายน|พ\\.?ย\\.?', 'ธันวาคม|ธ\\.?ค\\.?'];
const MONTH_DATE = new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${MONTHS.join('|')})\\s*(?:(?:พ\\.?ศ\\.?|ค\\.?ศ\\.?)\\s*)?((?:25|20)?\\d{2}(?!\\d))?`, 'u');
const SLASH_DATE = /(?:วันที่\s*)?(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?!\d)/;
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;
const DAY_ONLY = /วันที่\s*(\d{1,2})(?!\d|\s*(?:บาท|฿|\/|-|\.|,))/;
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี|พฤหัส', 'ศุกร์', 'เสาร์'];
const WEEKDAY = new RegExp(`วัน(${WEEKDAYS.join('|')})(ที่แล้ว|ก่อน)?`, 'u');
const RELATIVE: [RegExp, number][] = [
  [/เมื่อวานซืน|วานซืน/, -2],
  [/เมื่อวานนี้|เมื่อวาน|วานนี้|เมื่อคืน(?:นี้)?/, -1],
  [/วันนี้|เมื่อกี้|เมื่อกี๊|ตะกี้|เมื่อเช้า|เช้านี้|บ่ายนี้|เย็นนี้|คืนนี้/, 0],
];

/** A day found in the line, and the line without it. Days without a year are this year's, or last year's if that is ahead. */
export function takeDate(text: string, today: string): { date: string | null; rest: string } {
  for (const [rule, offset] of RELATIVE) {
    const match = rule.exec(text);
    if (match) return { date: addDays(today, offset), rest: cut(text, match) };
  }
  const iso = ISO_DATE.exec(text);
  if (iso) return { date: parseThaiDate(iso[0], today), rest: cut(text, iso) };
  const named = MONTH_DATE.exec(text);
  if (named) {
    const date = parseThaiDate(`${named[1]} ${named[2]}${named[3] ? ` ${named[3]}` : ''}`, today);
    if (date) return { date: named[3] ? date : pastYear(date, today), rest: cut(text, named) };
  }
  const slash = SLASH_DATE.exec(text);
  if (slash) {
    const date = parseThaiDate(`${slash[1]}/${slash[2]}${slash[3] ? `/${slash[3]}` : ''}`, today);
    if (date) return { date: slash[3] ? date : pastYear(date, today), rest: cut(text, slash) };
  }
  const day = DAY_ONLY.exec(text);
  if (day) {
    const date = parseThaiDate(day[1], today);
    // A day of the month ahead of today means last month's.
    if (date) return { date: date > today ? lastMonth(date) : date, rest: cut(text, day) };
  }
  const weekday = WEEKDAY.exec(text);
  if (weekday) {
    const index = WEEKDAYS.findIndex(names => new RegExp(`^(?:${names})$`, 'u').test(weekday[1]));
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    let back = (now - index + 7) % 7;
    if (weekday[2] && back === 0) back = 7;
    return { date: addDays(today, -back), rest: cut(text, weekday) };
  }
  return { date: null, rest: text };
}
const cut = (text: string, match: RegExpExecArray) => `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, ' ').trim();
function pastYear(date: string, today: string): string {
  const ahead = (Date.parse(date) - Date.parse(today)) / 86_400_000;
  return ahead > 31 ? `${Number(date.slice(0, 4)) - 1}${date.slice(4)}` : date;
}
function lastMonth(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() - 1);
  return day.getUTCDate() === Number(date.slice(8, 10)) ? day.toISOString().slice(0, 10) : date;
}

// Numbers that count something other than baht ("5 คลิป", "2 แก้ว", "3 วัน"): never the amount unless marked as baht.
const UNIT_AFTER = /^\s*(?:คลิป|ชิ้น|วัน|ครั้ง|คน|ชม\.?|ชั่วโมง|เดือน|ปี|%|งวด|รูป|ภาพ|ตัว|อัน|แก้ว|กล่อง|ขวด|ห่อ|จาน|ที่|ลิตร|กม\.?|กิโล|โมง|นาที|ตอน|เรื่อง|บท|หน้า|ไฟล์|โพสต์|สตอรี่|แผ่น|ใบ|ชุด|คัน|ห้อง|เครื่อง|เพลง|ข้อ|รอบ|คอร์ส|คาบ|วิดีโอ|วีดีโอ|รีล|ep\b|reel|post|story|x\b|×)/i;
const NUMBER = /(฿\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(k|K|พัน|หมื่น|แสน)?(?![\d.])(\s*(?:บาท|บ\.|฿|\.-))?/g;
const SCALE: Record<string, number> = { k: 1000, K: 1000, พัน: 1000, หมื่น: 10_000, แสน: 100_000 };

/** The amount in baht and the line without it: a number marked as baht wins, else the last number that counts no unit. */
export function takeAmount(text: string): { amount: number | null; rest: string } {
  const found: { value: number; marked: boolean; index: number; length: number }[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const index = match.index ?? 0;
    const after = text.slice(index + match[0].length);
    const marked = Boolean(match[1] || match[5]);
    if (!marked && !match[4] && UNIT_AFTER.test(after)) continue;
    const value = Number(`${match[2].replace(/,/g, '')}${match[3] ?? ''}`) * (match[4] ? SCALE[match[4]] : 1);
    if (!Number.isFinite(value) || value <= 0) continue;
    found.push({ value: Math.round(value * 100) / 100, marked, index, length: match[0].length });
  }
  const pick = [...found].reverse().find(item => item.marked) ?? found.at(-1);
  if (!pick) return { amount: null, rest: text };
  return { amount: pick.value, rest: `${text.slice(0, pick.index)} ${text.slice(pick.index + pick.length)}`.replace(/\s+/g, ' ').trim() };
}

const EXPENSE_START = /^(?:จ่าย|ซื้อ|เสีย|โอนให้|โอนค่า|ชำระค่า|เติม|ผ่อน|สั่งซื้อ|สั่ง|จ้างงานต่อ|จ้างฟรีแลนซ์|จ้างช่าง|จ้างคน)/;
const INCOME_START = /^(?:รับเงิน|ได้รับเงิน|ได้รับ|ได้เงิน|เงินเข้า|รับโอน|โอนเข้า|รับค่า|รับมัดจำ|รับชำระ|ขายได้|ขาย)/;
const PAYER = /^(ลูกค้า\S*?|คุณ\S+|พี่\S+|น้อง\S+|บริษัท\s?\S+|บจก\.?\s?\S+|หจก\.?\s?\S+|ร้าน\S+)\s*(?:โอน(?:เงิน)?(?:มา|ให้)?|จ่าย(?:เงิน)?(?:มา|ให้)?|ชำระ(?:เงิน)?)(?:แล้ว)?/;
const UNPAID = /ยังไม่(?:ได้)?(?:จ่าย|โอน|ชำระ|รับเงิน)|ค้าง(?:จ่าย|รับ|ชำระ)|รอรับเงิน|รอโอน|วางบิล|เครดิต/;
const HIRED = /^(.*?)(?:จ้าง|ว่าจ้าง)(?!งานต่อ)\s*(.*)$/;
const GOT_JOB = /^(?:ได้งาน|รับงาน|รับจ้าง|งานใหม่)\s*/;
const INCOME_ANY = /รับเงิน|ได้รับ|ได้เงิน|เงินเข้า|รายรับ|รายได้|รับโอน|โอนเข้า|มัดจำ|รับชำระ|ขายได้/;
const EXPENSE_ANY = /จ่าย|ซื้อ|เสียค่า|รายจ่าย/;
const DELIVERED = /ส่งงานแล้ว|ส่งแล้ว|เสร็จแล้ว|ปิดงานแล้ว|ทำเสร็จแล้ว/;
const NOT_DELIVERED = /กำลังทำ|ยังไม่ส่ง|ยังทำอยู่|ยังไม่เสร็จ|จะส่ง/;
const PARTY = /^(?:ลูกค้า|คุณ|พี่|น้อง|บริษัท|บจก|หจก|ร้าน|บ\.)/;

const clean = (text: string) => text.replace(PARTICLE, '').replace(/^[\s,:;·\-–—]+|[\s,:;·\-–—]+$/g, '').replace(/\s+/g, ' ').trim();
/** "จากลูกค้า", "จากคุณเอ", "ให้บริษัท X": the client; "จากงานรีวิว" is the name, not a client. */
function splitFrom(text: string): { name: string; client: string } {
  const match = /\s*(?:จาก|ของ)\s*(.+)$/.exec(text);
  if (!match) return { name: text, client: '' };
  const before = clean(text.slice(0, match.index));
  const after = clean(match[1]);
  if (PARTY.test(after)) return { name: before, client: clean(after.replace(/^ลูกค้า\s*/, '')) };
  return { name: before && !/^(?:เงิน|ค่า)$/.test(before) ? `${before} ${after}` : after, client: '' };
}

/** One record line read by the rules (the day of a heading line above it when the line says none). */
export function readEntry(raw: string, line: number, today: string, headingDay: string | null): Entry {
  const text = tidy(raw).replace(BULLET, '');
  const assumed: string[] = [];
  let { date, rest } = takeDate(text, today);
  if (!date && headingDay) date = headingDay;
  let creditDays: number | null = null;
  const credit = /เครดิต\s*(?:เทอม)?\s*(\d{1,3})\s*วัน/.exec(rest);
  if (credit) { creditDays = Number(credit[1]); rest = cut(rest, credit); }
  if (/ไม่มีเครดิต|จ่ายทันที|ชำระทันที/.test(rest)) creditDays = 0;
  let whtRate = 0;
  const wht = /หัก\s*(?:ณ\s*ที่\s*จ่าย|ภาษี|ภาษี\s*ณ\s*ที่จ่าย)?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/.exec(rest);
  if (wht) { whtRate = Number(wht[1]); rest = cut(rest, wht); }
  const { amount, rest: words } = takeAmount(rest);
  rest = clean(words);

  let kind: EntryKind | null = null;
  let name = rest;
  let client = '';
  let deposit = false;
  let delivered: boolean | null = null;
  const payer = PAYER.exec(rest);
  if (/^ลูกค้า\S*\s*ยังไม่/.test(rest)) kind = 'job';
  else if (payer) {
    kind = 'income';
    client = /^ลูกค้า/.test(payer[1]) ? '' : payer[1];
    name = clean(rest.slice(payer[0].length));
  } else if (EXPENSE_START.test(rest)) {
    kind = 'expense';
    name = clean(rest.replace(/^(?:จ่าย(?:เงิน)?|ซื้อ|เสีย|โอนให้|โอน|ชำระ|สั่งซื้อ|สั่ง)\s*/, ''));
  } else if (INCOME_START.test(rest)) {
    kind = 'income';
    name = clean(rest.replace(/^(?:รับเงิน|ได้รับเงิน|ได้รับ|ได้เงิน|เงินเข้า|รับโอน|โอนเข้า|รับชำระ|รับ|ขายได้)\s*/, ''));
  } else if (HIRED.test(rest) || GOT_JOB.test(rest) || UNPAID.test(rest) || creditDays !== null) {
    kind = 'job';
  } else if (INCOME_ANY.test(rest)) {
    kind = 'income';
  } else if (EXPENSE_ANY.test(rest) || (/^ค่า/.test(rest) && guessExpenseCategory(rest))) {
    kind = 'expense';
    name = clean(rest.replace(/^(?:จ่าย(?:เงิน)?|ซื้อ|เสีย)\s*/, ''));
  }

  if (kind === 'income') {
    if (/มัดจำ/.test(name)) { deposit = true; name = clean(name.replace(/(?:เงิน)?มัดจำ\s*/, '')); }
    const from = splitFrom(name);
    name = from.name;
    client ||= from.client;
  }
  if (kind === 'job') {
    if (DELIVERED.test(name)) delivered = true;
    else if (NOT_DELIVERED.test(name)) delivered = false;
    name = clean(name.replace(DELIVERED, '').replace(NOT_DELIVERED, '').replace(UNPAID, '').replace(/ยังไม่(?:ได้)?/, ''));
    const hired = HIRED.exec(name);
    if (hired) {
      const who = clean(hired[1]);
      client = /^ลูกค้า$/.test(who) ? '' : clean(who.replace(/^ลูกค้า\s*/, ''));
      name = clean(hired[2]);
    } else {
      name = clean(name.replace(GOT_JOB, ''));
      const from = splitFrom(name);
      name = from.name;
      client = from.client;
    }
    if (/^ลูกค้า\S*$/.test(name)) name = '';
  }
  if (kind === 'expense') name = clean(name.replace(/^ค่า\s*$/, ''));
  if (!name) name = clean(rest) || text;
  const category = kind === 'expense' ? guessExpenseCategory(name) : null;
  if (kind !== 'expense' && !client) assumed.push('ไม่ระบุลูกค้า');
  if (kind !== 'expense' && !wht) assumed.push('ไม่หัก ณ ที่จ่าย');
  return { line, text, kind, name: name.slice(0, 200), amount, date, client: client.slice(0, 200), creditDays, whtRate, deposit, total: null,
    delivered, deliveredOn: null, category, jobId: null, settled: [], skip: false, assumed };
}

const isDateLine = (text: string, today: string) => {
  const bare = text.replace(/[:：]\s*$/, '').trim();
  return parseThaiDate(bare, today) ?? (takeDate(bare, today).rest === '' ? takeDate(bare, today).date : null);
};

/**
 * Several record lines pasted at once, or null for anything else (one record, a question, a document, an edit): those go
 * on as before. At least two lines with an amount; a line with a day only sets the day of the lines under it.
 */
export function parseEntries(input: string, today: string, now = new Date()): EntryBatch | null {
  const lines = input.split(/\r?\n/).map(line => tidy(line).replace(BULLET, '')).filter(Boolean);
  if (lines.length < 2) return null;
  if (lines.some(line => QUESTION.test(line) || DOCUMENT.test(line) || EDIT.test(line))) return null;
  const withAmount = lines.filter(line => takeAmount(takeDate(line, today).rest).amount !== null).length;
  if (withAmount < 2) return null;
  const entries: Entry[] = [];
  let heading: string | null = null;
  let ignored = 0;
  lines.forEach((text, index) => {
    const hasAmount = takeAmount(takeDate(text, today).rest).amount !== null;
    if (!hasAmount) {
      const day = isDateLine(text, today);
      // "วันที่ 14 พ.ย.", "เมื่อวาน": the day of the lines under it. The first line ("ฝากบันทึกหน่อย", "รายการวันนี้") and a
      // closing word are not records; a day said in the first line counts for every line under it.
      if (day) { heading = day; ignored += 1; return; }
      if (index === 0 || (index === lines.length - 1 && CLOSING.test(text)) || CLOSING.test(text)) {
        const said = takeDate(text, today).date;
        if (index === 0 && said) heading = said;
        ignored += 1;
        return;
      }
    }
    entries.push(readEntry(text, entries.length + 1, today, heading));
  });
  if (entries.length < 2) return null;
  return { id: `b${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`, createdAt: now.toISOString(), today, entries: entries.slice(0, MAX_ENTRIES), ignored };
}

/** Unpaid jobs this money may be for: the same amount still owed, or a name that shares a word. At most three. */
export function openJobsFor(entry: Entry, jobs: OpenJob[]): OpenJob[] {
  if (entry.kind !== 'income' || entry.amount === null || entry.deposit) return [];
  const words = `${entry.name} ${entry.client}`.split(/\s+/).map(word => word.replace(/^(?:งาน|ค่า)/, '')).filter(word => word.length >= 3);
  return jobs.filter(job => job.pending > 0 && (Math.abs(job.pending - entry.amount!) < 0.01
    || words.some(word => `${job.name} ${job.client ?? ''}`.includes(word)))).slice(0, 3);
}

/** What still has to be asked about one line, in the order asked. */
export function missingOf(entry: Entry, jobs: OpenJob[] = []): EntryField[] {
  if (entry.skip) return [];
  const out: EntryField[] = [];
  const open = (field: EntryField) => !entry.settled.includes(field);
  if (!entry.kind) out.push('kind');
  if (entry.amount === null) out.push('amount');
  if (entry.kind === 'income' && open('match') && !entry.jobId && openJobsFor(entry, jobs).length) out.push('match');
  if (entry.kind === 'income' && entry.deposit && entry.total === null && open('deposit') && !entry.jobId) out.push('deposit');
  if (!entry.date) out.push('date');
  if (entry.kind === 'job' && entry.delivered === null) out.push('delivered');
  if (entry.kind === 'job' && entry.creditDays === null) out.push('credit');
  if (entry.kind === 'expense' && !entry.category) out.push('category');
  return out;
}

export interface EntryQuestion {
  field: EntryField; lines: number[];
  /** What is asked, in full (which line, and the question), for LINE. */
  text: string;
  /** The same on one line, for the app's question card (its answer comes back as "<label>: <answer>"). */
  label: string;
  /** Taps; `date` adds a calendar. */
  options: string[];
  date?: boolean;
  /** Where the person may type the answer instead (an amount, a total). */
  typed?: boolean;
}

const quote = (entry: Entry) => `“${entry.text.length > 70 ? `${entry.text.slice(0, 69)}…` : entry.text}”`;
const named = (entry: Entry) => (entry.name || entry.text).slice(0, 60);
export const SKIP_WORD = 'ไม่บันทึกรายการนี้';
export const STOP_WORD = 'ยกเลิกทั้งหมด';

/** How many questions are still to come, counting every line's missing details (the days question counts once). */
export function questionsLeft(batch: EntryBatch, jobs: OpenJob[] = []): number {
  const live = batch.entries.filter(entry => !entry.skip);
  const undated = live.filter(entry => missingOf(entry, jobs).includes('date')).length;
  const all = live.reduce((sum, entry) => sum + missingOf(entry, jobs).length, 0);
  return undated >= 2 && !batch.oneByOne ? all - undated + 1 : all;
}

function questionFor(batch: EntryBatch, entry: Entry, field: EntryField, jobs: OpenJob[]): EntryQuestion {
  const head = `ข้อ ${entry.line} ${quote(entry)}`;
  const base = { field, lines: [entry.line] };
  const one = (ask: string) => `ข้อ ${entry.line} ${named(entry)}${entry.amount !== null ? ` ${baht(entry.amount)}` : ''} · ${ask}`;
  if (field === 'kind') return { ...base, text: `${head}\nเป็นรายรับ รายจ่าย หรืองานที่ยังรอรับเงินครับ`, label: one('เป็นรายรับ รายจ่าย หรืองานรอรับเงิน'), options: ['รายรับ', 'รายจ่าย', 'งานรอรับเงิน', SKIP_WORD] };
  if (field === 'amount') return { ...base, typed: true, text: `${head}\nยอดเงินเท่าไรครับ พิมพ์ตัวเลขมาได้เลย`, label: one('ยอดเงินเท่าไร'), options: [SKIP_WORD] };
  if (field === 'match') {
    const jobsFor = openJobsFor(entry, jobs);
    const list = jobsFor.map((job, at) => `${at + 1}. ${job.name}${job.client ? ` · ${job.client}` : ''} ค้าง ${baht(job.pending)}`);
    return { ...base, text: `${head}\nเป็นเงินของงานที่รอรับเงินอยู่ไหมครับ\n${list.join('\n')}`, label: one('เป็นเงินของงานที่รอรับอยู่ไหม'),
      options: [...jobsFor.map((job, at) => `งานที่ ${at + 1} ${job.name}`.slice(0, 40)), 'เป็นรายรับใหม่'] };
  }
  if (field === 'deposit') return { ...base, typed: true, text: `${head}\nมัดจำ ${baht(entry.amount ?? 0)} นี้ ของงานมูลค่าเต็มเท่าไรครับ พิมพ์ยอดเต็มมาได้เลย หรือบันทึกเป็นรายรับอย่างเดียว`,
    label: one('มัดจำนี้ของงานมูลค่าเต็มเท่าไร'), options: ['บันทึกเป็นรายรับอย่างเดียว', SKIP_WORD] };
  if (field === 'date') return { ...base, date: true, text: `${head}\nเป็นรายการวันไหนครับ`, label: one('เป็นรายการวันไหน'), options: ['วันนี้', 'เมื่อวาน', SKIP_WORD] };
  if (field === 'delivered') {
    const on = entry.date ? thaiDayText(entry.date, batch.today) : '';
    return { ...base, date: true, text: `${head}\nส่งงานแล้วหรือยังครับ`, label: one('ส่งงานแล้วหรือยัง'), options: [on ? `ส่งแล้ว ${on}` : 'ส่งแล้ววันนี้', 'ยังทำอยู่', SKIP_WORD] };
  }
  if (field === 'credit') return { ...base, typed: true, text: `${head}\nลูกค้าจ่ายภายในกี่วันหลังส่งงานครับ (เครดิตเทอม)`, label: one('ลูกค้าจ่ายภายในกี่วันหลังส่งงาน'),
    options: ['ไม่มีเครดิต', '7 วัน', '15 วัน', '30 วัน', '45 วัน', '60 วัน'] };
  return { ...base, text: `${head}\nอยู่หมวดไหนครับ`, label: one('อยู่หมวดไหน'), options: [...EXPENSE_CATEGORIES] };
}

/**
 * The next questions, at most `max` (LINE asks one, the app's card up to five), or [] when every line is complete. Several
 * lines without a day are asked about together first ("วันนี้ทั้งหมด"); then each line's first missing detail, in order.
 */
export function questionsFor(batch: EntryBatch, jobs: OpenJob[] = [], max = 1): EntryQuestion[] {
  const live = batch.entries.filter(entry => !entry.skip);
  const out: EntryQuestion[] = [];
  const undated = live.filter(entry => missingOf(entry, jobs).includes('date'));
  const together = undated.length >= 2 && !batch.oneByOne;
  if (together) {
    const list = undated.slice(0, 8).map(entry => `• ข้อ ${entry.line} ${named(entry)}`).join('\n');
    out.push({ field: 'date', lines: undated.map(entry => entry.line), date: true,
      text: `${undated.length} รายการไม่ได้บอกวันที่\n${list}${undated.length > 8 ? `\nและอีก ${undated.length - 8} รายการ` : ''}\nทั้งหมดเป็นวันไหนครับ`,
      label: `ข้อ ${undated.map(entry => entry.line).join(', ')} ไม่ได้บอกวันที่ · ทั้งหมดเป็นวันไหน`,
      options: ['วันนี้ทั้งหมด', 'เมื่อวานทั้งหมด', 'ถามทีละรายการ'] });
  }
  for (const entry of live) {
    if (out.length >= max) break;
    const field = missingOf(entry, jobs).find(item => !(together && item === 'date'));
    // A line whose kind is not known yet is asked only that first; its other details depend on the answer.
    if (field) out.push(questionFor(batch, entry, field, jobs));
  }
  return out.slice(0, max);
}

const baht = (value: number) => `฿${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const ANSWER_SPLIT = /^.*[:：]\s*/s;
/** "15 พ.ย. 2569 (2026-11-15)" from the app's calendar, "วันที่ 2026-11-15" from LINE's. */
const isoIn = (text: string) => /(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null;

/**
 * The answer to the question waiting, or null when the message is not an answer (it goes on as a new message). "ไม่บันทึก
 * รายการนี้" leaves the line out (said so on the cards); "ยกเลิกทั้งหมด" is handled by the caller.
 */
export function answerQuestion(batch: EntryBatch, question: EntryQuestion, input: string, jobs: OpenJob[] = []): EntryBatch | null {
  // The app's question card sends "<question>: <answer>"; LINE sends the tap itself.
  const said = tidy(/[:：]/.test(input) ? input.replace(ANSWER_SPLIT, '') : input);
  if (!said || said.length > 120) return null;
  const entries = batch.entries.map(entry => ({ ...entry, settled: [...entry.settled], assumed: [...entry.assumed] }));
  const targets = entries.filter(entry => question.lines.includes(entry.line));
  if (!targets.length) return null;
  const next = { ...batch, entries };
  if (said === SKIP_WORD || /^ข้าม/.test(said)) { targets.forEach(entry => { entry.skip = true; }); return next; }
  const today = batch.today;
  switch (question.field) {
    case 'kind': {
      const kind: EntryKind | null = /งาน|รอรับ/.test(said) ? 'job' : /รายรับ|^รับ/.test(said) ? 'income' : /รายจ่าย|^จ่าย/.test(said) ? 'expense' : null;
      if (!kind) return null;
      for (const entry of targets) {
        const reread = readEntry(`${kind === 'income' ? 'รับเงิน ' : kind === 'expense' ? 'จ่าย ' : 'ลูกค้าจ้าง '}${entry.text}`, entry.line, today, entry.date);
        Object.assign(entry, { ...reread, text: entry.text, kind, amount: entry.amount ?? reread.amount, date: entry.date ?? reread.date });
      }
      return next;
    }
    case 'amount': {
      const { amount } = takeAmount(said);
      if (amount === null) return null;
      targets.forEach(entry => { entry.amount = amount; });
      return next;
    }
    case 'match': {
      const pick = /^(?:งานที่\s*)?(\d)/.exec(said);
      const options = openJobsFor(targets[0], jobs);
      if (/ใหม่|ไม่ใช่/.test(said)) { targets[0].settled.push('match'); return next; }
      // "งานที่ 2 <name>": the number of the job in the list.
      const job = pick ? options[Number(pick[1]) - 1] : undefined;
      if (!job) return null;
      targets[0].jobId = job.id;
      targets[0].name = job.name;
      targets[0].client = job.client ?? '';
      targets[0].assumed = [];
      return next;
    }
    case 'deposit': {
      if (/รายรับอย่างเดียว|รายรับ/.test(said)) { targets[0].settled.push('deposit'); targets[0].deposit = false; return next; }
      const { amount } = takeAmount(said);
      if (amount === null || amount <= (targets[0].amount ?? 0)) return null;
      targets[0].total = amount;
      return next;
    }
    case 'date': {
      if (/ทีละ/.test(said)) return { ...next, oneByOne: true };
      const day = isoIn(said) ?? (/วันนี้/.test(said) ? today : /เมื่อวาน/.test(said) ? addDays(today, -1) : parseThaiDate(said.replace(/ทั้งหมด$/, '').trim(), today));
      if (!day) return null;
      targets.forEach(entry => { entry.date = day; });
      return next;
    }
    case 'delivered': {
      if (/ยัง/.test(said)) { targets.forEach(entry => { entry.delivered = false; }); return next; }
      const day = isoIn(said) ?? (/^ส่งแล้ว$/.test(said) ? targets[0].date ?? today : parseThaiDate(said.replace(/^ส่งแล้ว\s*/, '').trim(), today));
      if (!day && !/ส่ง/.test(said)) return null;
      targets.forEach(entry => { entry.delivered = true; entry.deliveredOn = day ?? entry.date ?? today; });
      return next;
    }
    case 'credit': {
      const days = /ไม่มี|ทันที/.test(said) ? 0 : (/^(\d{1,3})\s*(?:วัน)?$/.exec(said) ? Number(/^(\d{1,3})/.exec(said)![1]) : null);
      if (days === null) return null;
      targets.forEach(entry => { entry.creditDays = days; });
      return next;
    }
    case 'category': {
      const category = EXPENSE_CATEGORIES.find(item => item === said) ?? EXPENSE_CATEGORIES.find(item => item.includes(said) || said.includes(item.split('/')[0]))
        ?? guessExpenseCategory(said);
      if (!category) return null;
      targets.forEach(entry => { entry.category = category; });
      return next;
    }
  }
  return null;
}

/**
 * The answers to the questions asked: LINE's one tap is the whole message; the app's card sends one line per question,
 * "<label>: <answer>". Null when nothing in the message answers them (it goes on as a new message).
 */
export function answerQuestions(batch: EntryBatch, questions: EntryQuestion[], input: string, jobs: OpenJob[] = []): EntryBatch | null {
  if (!questions.length) return null;
  if (questions.length === 1 && !input.includes('\n')) {
    const label = questions[0].label;
    return answerQuestion(batch, questions[0], input.startsWith(`${label}:`) ? input.slice(label.length + 1) : input, jobs);
  }
  let current: EntryBatch | null = null;
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const question of questions) {
    const line = lines.find(item => item.startsWith(`${question.label}:`));
    if (!line) continue;
    const next = answerQuestion(current ?? batch, question, line.slice(question.label.length + 1), jobs);
    if (next) current = next;
  }
  return current;
}

/** The assistant tool that prepares each complete line's card, with the same checks as a card from เลขา. */
export function entryCall(entry: Entry, jobs: OpenJob[] = []): { name: string; args: Record<string, unknown> } | null {
  if (entry.skip || !entry.kind || entry.amount === null || !entry.date) return null;
  const client = entry.client || 'ไม่ระบุ';
  if (entry.kind === 'expense') return { name: 'propose_add_expense', args: { name: entry.name, amount: entry.amount, category: entry.category, date: entry.date } };
  if (entry.kind === 'income' && entry.jobId) {
    // Less than the job still owes: received in part, the amount said; otherwise the rest of it.
    const job = jobs.find(item => item.id === entry.jobId);
    const part = job && entry.amount + 0.01 < job.pending;
    return { name: 'propose_record_payment', args: { job_id: entry.jobId, mode: part ? 'partial' : 'full', ...(part ? { amount: entry.amount } : {}), date: entry.date } };
  }
  if (entry.kind === 'income' && entry.deposit && entry.total) {
    return { name: 'propose_add_job', args: { name: entry.name, value: entry.total, client, delivered: false, payment_status: 'partial', received_amount: entry.amount,
      paid_date: entry.date, start_date: entry.date, credit_term_days: 0, wht_rate: entry.whtRate } };
  }
  if (entry.kind === 'income') {
    return { name: 'propose_add_job', args: { name: entry.name, value: entry.amount, client, delivered: true, delivery_date: entry.date, payment_status: 'paid',
      paid_date: entry.date, start_date: entry.date, wht_rate: entry.whtRate } };
  }
  return { name: 'propose_add_job', args: { name: entry.name, value: entry.amount, client, delivered: entry.delivered === true,
    ...(entry.delivered ? { delivery_date: entry.deliveredOn ?? entry.date } : {}), payment_status: 'unpaid', credit_term_days: entry.creditDays ?? 0,
    start_date: entry.date, wht_rate: entry.whtRate } };
}

/** One line's place in the summary: its kind, what the card shows and what the rules filled in. */
export interface PreparedEntry { entry: Entry; proposalId: string | null; problem: string | null }

/** The totals for the summary above the cards: how the paste was read, by kind. */
export function entryTotals(prepared: PreparedEntry[]) {
  const ready = prepared.filter(item => item.proposalId && item.entry.kind);
  const by = (kind: EntryKind) => ready.filter(item => item.entry.kind === kind);
  return (['income', 'expense', 'job'] as const).map(kind => ({ kind, count: by(kind).length, total: by(kind).reduce((sum, item) => sum + (item.entry.amount ?? 0), 0) }))
    .filter(row => row.count > 0);
}

/** The words above the cards (owner, 2026-11-16: "สรุปให้เขาก่อน ... เราบันทึกอะไรไป มีอะไรบ้างที่ยังไม่เคลียร์ แล้วก็ค่อยให้การ์ดมา"). */
export function entrySummary(batch: EntryBatch, prepared: PreparedEntry[]): string {
  const total = batch.entries.length;
  const ready = prepared.filter(item => item.proposalId);
  const skipped = batch.entries.filter(entry => entry.skip);
  const failed = prepared.filter(item => !item.proposalId && !item.entry.skip);
  const lines = [ready.length === total ? `อ่านครบ ${total} จาก ${total} รายการครับ` : `เตรียมได้ ${ready.length} จาก ${total} รายการครับ`];
  for (const row of entryTotals(prepared)) lines.push(`• ${KIND_WORDS[row.kind]} ${row.count} รายการ รวม ${baht(row.total)}`);
  const unnamed = ready.filter(item => item.entry.kind !== 'expense' && !item.entry.client && !item.entry.jobId).map(item => item.entry.line);
  if (unnamed.length) lines.push(`ข้อ ${unnamed.join(', ')} ไม่ได้บอกชื่อลูกค้า จะบันทึกเป็น “ไม่ระบุ”`);
  if (skipped.length) lines.push(`ไม่บันทึกตามที่เลือก: ข้อ ${skipped.map(entry => entry.line).join(', ')}`);
  for (const item of failed) lines.push(`ข้อ ${item.entry.line} ยังเตรียมไม่ได้: ${item.problem ?? 'ข้อมูลไม่ครบ'}`);
  lines.push(ready.length ? 'ยังไม่ได้บันทึกนะครับ ตรวจในการ์ดด้านล่าง แล้วกดยืนยันทีละกลุ่มหรือยืนยันทั้งหมด' : 'ยังไม่มีรายการที่พร้อมบันทึกครับ');
  return lines.join('\n');
}

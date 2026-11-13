import type { ExpenseDraft, JobDraft } from './lineAssistant.js';
import type { LineMessage } from './line.js';
import { isValidWhtRate, roundMoney, whtAmountFor } from '../../../shared/wht.js';
import { LINE_MONEY, readMoney } from './lineDocumentDraft.js';

// Recording a job or an expense in the LINE chat asks what is still missing one short question at a time, each with taps,
// and shows the card once (owner, 2026-11-14: "กูไม่ชอบลักษณะการถามเลย" about a numbered list of questions; then "ตั้งชื่อ
// โปรเจกต์ ... แล้วค่อยลูกค้าคือใคร"; then "หักเปอร์เซ็นต์ ... รับบางส่วน ... รับเป็นงวด ... ทำให้มัน cover ตัวแอปทั้งหมด").
// The questions follow the app's job form (JobFormDrawer.tsx): the project, its value, the client, withholding, how it is
// paid (in full and when, part and when the rest comes, in instalments and when the first is due, or not yet), and for a
// job not paid yet whether the work is delivered, when it will be, and when the money is due. Everything here is rules,
// no model: no tokens. A question the message already answered is never asked; every optional one can be skipped; the
// form behind กรอกในฟอร์ม holds every field (start date, notes, other rates) for anything else.

export type JobQuestion = 'name' | 'project' | 'value' | 'client' | 'wht' | 'payment' | 'paidDate' | 'partialAmount'
  | 'remainingDate' | 'installmentCount' | 'installmentFirst' | 'workStatus' | 'deliveryDate' | 'payWhen';
export type ExpenseQuestion = 'name' | 'amount' | 'category';

export interface QuestionContext {
  /** Today in Bangkok, YYYY-MM-DD. */
  today: string;
  /** The account's jobs, for the clients it already has and the rate each one withholds. */
  jobs?: ReadonlyArray<{ client?: string; whtRate?: number; postDate?: string; lastActivityAt?: string }>;
  /** The draft's form (กรอกในฟอร์ม), when LINE's form is set up. */
  editUrl?: string;
}

/** The data of the date picker tap; the webhook turns it into the text "วันที่ YYYY-MM-DD". */
export const QUESTION_DATE_DATA = 'qd:date';
export const EXPENSE_CATEGORIES = ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ค่าโฆษณา/ยิงแอด', 'ค่าเดินทาง/น้ำมัน', 'อาหาร/รับรองลูกค้า', 'จ้างงานต่อ (Outsource)', 'ภาษี/ธรรมเนียม', 'ค่าบริการ/สาธารณูปโภค', 'อื่นๆ'];
const CATEGORY_LABELS: Record<string, string> = { 'จ้างงานต่อ (Outsource)': 'จ้างงานต่อ', 'ค่าบริการ/สาธารณูปโภค': 'ค่าบริการ/น้ำไฟเน็ต' };

const baht = (value: number) => `฿${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const clip = (text: string, size: number) => ([...text].length > size ? `${[...text].slice(0, size - 1).join('')}…` : text);
const tidy = (text: string) => text.replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50)).trim()
  .replace(/\s*(?:ครับ|คับ|ค่ะ|คะ|จ้า|นะ)+$/u, '').trim();
const net = (draft: JobDraft) => Math.max(0, roundMoney((draft.value || 0) - whtAmountFor(draft.value || 0, draft.whtRate || 0)));

// ---- dates -------------------------------------------------------------------------------------------------------

const MONTHS = ['มกราคม|ม\\.?ค\\.?', 'กุมภาพันธ์|ก\\.?พ\\.?', 'มีนาคม|มี\\.?ค\\.?', 'เมษายน|เม\\.?ย\\.?', 'พฤษภาคม|พ\\.?ค\\.?',
  'มิถุนายน|มิ\\.?ย\\.?', 'กรกฎาคม|ก\\.?ค\\.?', 'สิงหาคม|ส\\.?ค\\.?', 'กันยายน|ก\\.?ย\\.?', 'ตุลาคม|ต\\.?ค\\.?', 'พฤศจิกายน|พ\\.?ย\\.?', 'ธันวาคม|ธ\\.?ค\\.?'];
const iso = (date: Date) => date.toISOString().slice(0, 10);
const at = (today: string) => new Date(`${today}T00:00:00Z`);
export const addDays = (today: string, days: number) => { const date = at(today); date.setUTCDate(date.getUTCDate() + days); return iso(date); };
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))));
}
const real = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? iso(date) : null;
};
const fullYear = (text: string | undefined, today: string) => {
  if (!text) return Number(today.slice(0, 4));
  const n = Number(text);
  if (text.length === 4) return n > 2400 ? n - 543 : n;
  return n >= 40 ? 2500 + n - 543 : 2000 + n; // "68" is พ.ศ. 2568
};

/** A day as people type it in Thai: วันนี้, เมื่อวาน, พรุ่งนี้, อีก 7 วัน, สิ้นเดือน, 15 พ.ย., 15/11/68, or the picker's date. */
export function parseThaiDate(input: string, today: string): string | null {
  const text = tidy(input).replace(/^(?:วันที่|ภายในวันที่|ภายใน|ก่อนวันที่|ก่อน)\s*/u, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const picked = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (picked) return real(Number(picked[1]), Number(picked[2]), Number(picked[3]));
  if (/^วันนี้$/.test(text)) return today;
  if (/^(?:เมื่อวาน|เมื่อวานนี้|วานนี้)$/.test(text)) return addDays(today, -1);
  if (/^เมื่อวานซืน$/.test(text)) return addDays(today, -2);
  if (/^พรุ่งนี้$/.test(text)) return addDays(today, 1);
  if (/^มะรืน(?:นี้)?$/.test(text)) return addDays(today, 2);
  const ahead = /^อีก\s*(\d{1,3})\s*(วัน|สัปดาห์|อาทิตย์|เดือน)$/.exec(text);
  if (ahead) return ahead[2] === 'เดือน' ? addMonths(today, Number(ahead[1])) : addDays(today, Number(ahead[1]) * (ahead[2] === 'วัน' ? 1 : 7));
  const ago = /^(\d{1,3})\s*(วัน|สัปดาห์|อาทิตย์)(?:ก่อน|ที่แล้ว)$/.exec(text);
  if (ago) return addDays(today, -Number(ago[1]) * (ago[2] === 'วัน' ? 1 : 7));
  if (/^(?:สิ้นเดือน|สิ้นเดือนนี้|ปลายเดือน|ปลายเดือนนี้)$/.test(text)) return addDays(addMonths(`${today.slice(0, 7)}-01`, 1), -1);
  if (/^(?:สิ้นเดือนหน้า|ปลายเดือนหน้า)$/.test(text)) return addDays(addMonths(`${today.slice(0, 7)}-01`, 2), -1);
  if (/^ต้นเดือนหน้า$/.test(text)) return addMonths(`${today.slice(0, 7)}-01`, 1);
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(text);
  if (numeric) return real(fullYear(numeric[3], today), Number(numeric[2]), Number(numeric[1]));
  for (let index = 0; index < MONTHS.length; index += 1) {
    const named = new RegExp(`^(\\d{1,2})\\s*(?:${MONTHS[index]})\\s*(?:(?:พ\\.?ศ\\.?|ค\\.?ศ\\.?)\\s*)?(\\d{2}|\\d{4})?$`, 'u').exec(text);
    if (named) return real(fullYear(named[2], today), index + 1, Number(named[1]));
  }
  const day = /^(\d{1,2})$/.exec(text);
  if (day) return real(Number(today.slice(0, 4)), Number(today.slice(5, 7)), Number(day[1]));
  return null;
}

/** The day said in words, for the card: "วันนี้", "พรุ่งนี้", "15 พ.ย. 2568". */
export function thaiDayText(day: string, today: string): string {
  if (day === today) return 'วันนี้';
  if (day === addDays(today, -1)) return 'เมื่อวาน';
  if (day === addDays(today, 1)) return 'พรุ่งนี้';
  const short = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${Number(day.slice(8, 10))} ${short[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(0, 4)) + 543}`;
}

// ---- the job -----------------------------------------------------------------------------------------------------

// The kind of work alone ("งานตัดต่อ", "ถ่ายรูป"), not a project: the project is asked for (owner: "ตั้งชื่อโปรเจกต์").
const GENERIC_WORK = /^(?:งาน)?\s*(?:ตัดต่อ(?:วิดีโอ|วีดีโอ|คลิป)?|ถ่าย(?:รูป|ภาพ|วิดีโอ|วีดีโอ|คลิป)|ออกแบบ|กราฟิก|รีวิว|โพสต์|สอน|แปล|เขียน(?:บทความ|คอนเทนต์|บท)?|ที่ปรึกษา|คอนซัลต์|ฟรีแลนซ์|พิธีกร|MC|ร้องเพลง|แต่งหน้า|ทำเว็บ|เว็บไซต์|ไลฟ์(?:สด)?|ยิงแอด|แอดมิน|ทั่วไป|ใหม่|ตัดต่อและถ่าย)$/iu;
export const isGenericWork = (name: string | undefined) => !!name && GENERIC_WORK.test(name.trim());
const workName = (name: string) => (name.trim().startsWith('งาน') ? name.trim() : `งาน${name.trim()}`);

const SKIP = /^(?:ข้าม|ไม่ระบุ|ไม่มี|ไม่ต้อง|ไม่ใส่|ไม่รู้|ยังไม่รู้|ยังไม่แน่ใจ|ไม่แน่ใจ|ยังไม่กำหนด|ไม่กำหนด|-|ไว้ก่อน|ทีหลัง)$/u;
/** Words that begin a command or a new record: never taken as a name, a client or a project. */
const NOT_AN_ANSWER = /^(?:บันทึก|เพิ่ม|จด|ลง|ยืนยัน|ยกเลิก|สรุป|รอรับเงิน|งานเดือนนี้|กำลังดำเนิน|เมนู|ช่วย|ขอ|ดู|เปิด|แก้|ลบ|ทำไม|อะไร|ยังไง|อย่างไร|สวัสดี|หวัดดี|ขอบคุณ|โอเค|ok)|[?？\n]|ไหม$|มั้ย$|%|^หัก|^เครดิต|^ยอด|^\d[\d,.]*\s*(?:บาท)?$/iu;
const plainAnswer = (text: string, max: number) => text.length > 0 && [...text].length <= max && !NOT_AN_ANSWER.test(text);
const sameClient = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The account's clients, newest first, for the client question's taps. */
export function recentClients(context: QuestionContext, limit = 4): string[] {
  const jobs = [...(context.jobs ?? [])].filter(job => job.client?.trim())
    .sort((a, b) => (b.lastActivityAt || b.postDate || '').localeCompare(a.lastActivityAt || a.postDate || ''));
  const seen: string[] = [];
  for (const job of jobs) if (!seen.some(name => sameClient(name, job.client!))) seen.push(job.client!.trim());
  return seen.slice(0, limit);
}

/** What the draft takes from the account before asking: the rate this client withheld on its latest job. */
export function prefillJob(draft: JobDraft, context: QuestionContext): JobDraft {
  if (draft.whtRate !== undefined || !draft.client?.trim()) return draft;
  const last = [...(context.jobs ?? [])].filter(job => job.client && sameClient(job.client, draft.client!) && typeof job.whtRate === 'number')
    .sort((a, b) => (b.lastActivityAt || b.postDate || '').localeCompare(a.lastActivityAt || a.postDate || ''))[0];
  return last ? { ...draft, whtRate: last.whtRate } : draft;
}

/** The next thing to ask about the job, or null when the card can be shown. */
export function nextJobQuestion(draft: JobDraft): JobQuestion | null {
  const skipped = new Set(draft.skipped ?? []);
  if (!draft.name?.trim()) return 'name';
  if (isGenericWork(draft.name) && !skipped.has('project')) return 'project';
  if (!(Number(draft.value) > 0)) return 'value';
  if (draft.client === undefined && !skipped.has('client')) return 'client';
  if (draft.whtRate === undefined && draft.client?.trim() && !skipped.has('wht')) return 'wht';
  if (!draft.paymentStatus) return 'payment';
  if (draft.paymentStatus === 'paid') return draft.paidDate ? null : 'paidDate';
  if (draft.paymentStatus === 'partial') {
    if (!(Number(draft.receivedAmount) > 0)) return 'partialAmount';
    return draft.dueDate === undefined && draft.creditTerm === undefined ? 'remainingDate' : null;
  }
  if (draft.paymentStatus === 'installment') {
    if (!draft.installmentCount) return 'installmentCount';
    return draft.installmentFirstDue === undefined && !draft.installmentFirstPaid ? 'installmentFirst' : null;
  }
  if (!draft.workStatus) return 'workStatus';
  if (draft.workStatus === 'wip' && draft.deliveryDate === undefined) return 'deliveryDate';
  return draft.dueDate === undefined && draft.creditTerm === undefined ? 'payWhen' : null;
}

const skip = (draft: JobDraft, question: JobQuestion) => ({ skipped: [...new Set([...(draft.skipped ?? []), question])] });

/** The answer to the question waiting, as fields of the draft; null when the text does not answer it. */
export function answerJobQuestion(question: JobQuestion, input: string, draft: JobDraft, context: QuestionContext): Partial<JobDraft> | null {
  const text = tidy(input);
  if (!text || text.length > 300) return null;
  const date = () => parseThaiDate(text, context.today);
  switch (question) {
    case 'name':
      return plainAnswer(text, 120) ? { name: text } : null;
    case 'project': {
      if (/^ใช้ชื่อ/.test(text) || SKIP.test(text)) return { name: workName(draft.name || ''), ...skip(draft, 'project') };
      return plainAnswer(text, 120) ? { name: text, ...skip(draft, 'project') } : null;
    }
    case 'value': {
      const match = new RegExp(`^(?:ค่าจ้าง|ค่างาน|มูลค่า(?:งาน)?|ราคา|ยอด)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท|\\.-)?$`, 'u').exec(text);
      const value = match ? readMoney(match[1]) : null;
      return value && value > 0 ? { value } : null;
    }
    case 'client': {
      if (SKIP.test(text)) return { client: '', ...skip(draft, 'client') };
      const name = text.replace(/^(?:ชื่อ|ลูกค้า(?:คือ|ชื่อ)?|ให้|ผู้จ่าย(?:คือ)?)\s*/u, '').trim();
      return plainAnswer(name, 200) ? { client: name } : null;
    }
    case 'wht': {
      if (/^(?:ไม่หัก|ไม่มีหัก|ไม่มี|ไม่ได้หัก|0\s*%?)$|^(?:ข้าม)$/u.test(text)) return { whtRate: 0 };
      const match = /^(?:หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*)?(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|เปอร์เซ็นต์)?$/u.exec(text);
      const rate = match ? Number(match[1]) : NaN;
      return Number.isFinite(rate) && rate > 0 && rate <= 15 && isValidWhtRate(rate) ? { whtRate: rate } : null;
    }
    case 'payment': {
      if (/^(?:ยังไม่(?:ได้)?(?:รับ|ได้)(?:เงิน)?|ยังไม่จ่าย|ยังไม่โอน|รอรับ(?:เงิน)?|ยัง)$/u.test(text)) return { paymentStatus: 'pending' };
      if (/^(?:รับ(?:เงิน)?ครบ(?:แล้ว)?|ได้รับ(?:เงิน)?ครบ(?:แล้ว)?|จ่ายครบ(?:แล้ว)?|โอน(?:มา)?(?:ครบ)?แล้ว|ได้เงินแล้ว|รับแล้ว|ได้แล้ว)$/u.test(text)) return { paymentStatus: 'paid' };
      const deposit = new RegExp(`^(?:รับ(?:มัดจำ)?บางส่วน(?:แล้ว)?|(?:ได้|รับ)?มัดจำ(?:มา)?|บางส่วน)\\s*(?:(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?)?(?:แล้ว)?$`, 'u').exec(text);
      if (deposit) {
        const received = deposit[1] ? readMoney(deposit[1]) : null;
        return received && received < net(draft) ? { paymentStatus: 'partial', receivedAmount: received } : { paymentStatus: 'partial' };
      }
      const parts = /^(?:แบ่ง(?:จ่าย|ชำระ)?\s*(?:เป็น)?\s*(\d{1,2})?\s*งวด|แบ่งจ่าย|แบ่งชำระ|ผ่อน(?:จ่าย)?|จ่ายเป็นงวด|เป็นงวด)$/u.exec(text);
      if (parts) {
        const count = parts[1] ? Number(parts[1]) : 0;
        return { paymentStatus: 'installment', ...(count >= 2 && count <= 24 ? { installmentCount: count } : {}) };
      }
      return null;
    }
    case 'paidDate': {
      const day = date();
      return day ? { paidDate: day } : null;
    }
    case 'partialAmount': {
      const whole = net(draft);
      if (/^ครึ่ง/.test(text)) return { receivedAmount: roundMoney(whole / 2) };
      const match = new RegExp(`^(?:รับ(?:มา)?(?:แล้ว)?|ได้(?:มา)?|มัดจำ)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?(?:\\s*\\(.*\\))?$`, 'u').exec(text);
      const received = match ? readMoney(match[1]) : null;
      return received && received > 0 && received < whole ? { receivedAmount: received } : null;
    }
    case 'remainingDate':
    case 'payWhen': {
      if (SKIP.test(text)) return { creditTerm: 0, dueDate: null };
      if (question === 'payWhen' && /^(?:ไม่มีเครดิต(?:เทอม)?|จ่ายวันส่งงาน|จ่ายทันที|ทันที|จ่ายเลย)$/u.test(text)) return { creditTerm: 0 };
      const credit = /^(?:เครดิต(?:เทอม)?\s*)?(\d{1,3})\s*วัน$/u.exec(text);
      if (credit) return question === 'payWhen' ? { creditTerm: Number(credit[1]) } : { dueDate: addDays(context.today, Number(credit[1])) };
      const day = date();
      return day ? { dueDate: day } : null;
    }
    case 'installmentCount': {
      const match = /^(?:แบ่ง\s*)?(\d{1,2})\s*(?:งวด)?$/u.exec(text);
      const count = match ? Number(match[1]) : 0;
      return count >= 2 && count <= 24 ? { installmentCount: count } : null;
    }
    case 'installmentFirst': {
      if (/^(?:รับงวดแรกแล้ว|งวดแรกรับแล้ว|รับแล้ว|ได้แล้ว|วันนี้\s*\(?รับแล้ว\)?)$/u.test(text)) return { installmentFirstPaid: true, installmentFirstDue: context.today };
      if (SKIP.test(text)) return { installmentFirstDue: null };
      const day = date();
      return day ? { installmentFirstDue: day } : null;
    }
    case 'workStatus': {
      if (/^(?:ส่งงานแล้ว|ส่งแล้ว|เสร็จแล้ว|ทำเสร็จแล้ว|ส่งมอบแล้ว|ให้บริการแล้ว)$/u.test(text)) return { workStatus: 'delivered' };
      if (/^(?:กำลังทำ|ยังไม่(?:ได้)?ส่ง(?:งาน)?|ยังไม่เสร็จ|กำลังดำเนินการ|ยังทำอยู่)$/u.test(text)) return { workStatus: 'wip' };
      return null;
    }
    case 'deliveryDate': {
      if (SKIP.test(text)) return { deliveryDate: null };
      const day = date();
      return day ? { deliveryDate: day } : null;
    }
  }
}

type Tap = { type: 'action'; action: Record<string, unknown> };
const say = (label: string, text = label): Tap => ({ type: 'action', action: { type: 'message', label: clip(label, 20), text: text.slice(0, 300) } });
const pickDate = (context: QuestionContext): Tap => ({ type: 'action', action: { type: 'datetimepicker', label: 'เลือกวันที่', data: QUESTION_DATE_DATA, mode: 'date', initial: context.today } });
const form = (context: QuestionContext): Tap[] => (context.editUrl ? [{ type: 'action', action: { type: 'uri', label: 'กรอกในฟอร์ม', uri: context.editUrl } }] : []);
const ask = (text: string, taps: Tap[]): LineMessage => ({ type: 'text', text, quickReply: { items: taps.slice(0, 13) } } as LineMessage);

/** The question as a short line with its taps. `first`: the opening question, which says back what was understood. */
export function jobQuestionMessage(question: JobQuestion, draft: JobDraft, context: QuestionContext, first = false): LineMessage {
  const said = [draft.name?.trim() && !isGenericWork(draft.name) ? draft.name.trim() : draft.name?.trim() ? workName(draft.name) : '',
    Number(draft.value) > 0 ? baht(draft.value!) : ''].filter(Boolean).join(' ');
  const lead = first && said && question !== 'project' ? `${said} ครับ ` : '';
  const whole = net(draft);
  switch (question) {
    case 'name':
      return ask('งานนี้ชื่ออะไรครับ ใส่ชื่อโปรเจกต์ได้เลย เช่น ตัดต่อคลิปรีวิว ร้านกาแฟ', form(context));
    case 'project': {
      const keep = workName(draft.name || '');
      return ask(`${said ? `${said} ครับ ` : ''}เป็นโปรเจกต์อะไรครับ\nเช่น ตัดต่อคลิปรีวิว ร้านกาแฟ`,
        [say([...`ใช้ชื่อ “${keep}”`].length <= 20 ? `ใช้ชื่อ “${keep}”` : 'ใช้ชื่อนี้', `ใช้ชื่อ ${keep}`), ...form(context)]);
    }
    case 'value':
      return ask(`“${clip(draft.name || '', 60)}” ค่าจ้างเท่าไรครับ (ยอดก่อนหัก ณ ที่จ่าย)`, form(context));
    case 'client':
      return ask(`${lead}ลูกค้าคือใครครับ`, [say('ข้าม'), ...recentClients(context).map(name => say(name)), ...form(context)]);
    case 'wht':
      return ask(`${lead}ลูกค้าหัก ณ ที่จ่ายไหมครับ`, [say('ไม่หัก'), say('หัก 1%'), say('หัก 2%'), say('หัก 3%'), say('หัก 5%'), ...form(context)]);
    case 'payment':
      return ask(`${lead}ได้รับเงินแล้วหรือยังครับ`, [say('ยังไม่ได้รับ'), say('รับครบแล้ว'), say('รับบางส่วน'), say('แบ่งงวด'), ...form(context)]);
    case 'paidDate':
      return ask(`${lead}รับเงินวันไหนครับ`, [say('วันนี้'), say('เมื่อวาน'), pickDate(context), ...form(context)]);
    case 'partialAmount': {
      const half = roundMoney(whole / 2);
      return ask(`${lead}รับมาแล้วเท่าไรครับ${draft.whtRate ? ` (ยอดหลังหักภาษี ${baht(whole)})` : ''}`,
        [...(half > 0 ? [say(`ครึ่งหนึ่ง ${baht(half)}`, String(half))] : []), ...form(context)]);
    }
    case 'remainingDate':
      return ask(`ยอดที่เหลือ ${baht(roundMoney(whole - (draft.receivedAmount || 0)))} จะได้วันไหนครับ`,
        [say('ยังไม่รู้'), say('อีก 7 วัน'), say('อีก 30 วัน'), say('สิ้นเดือนนี้'), pickDate(context), ...form(context)]);
    case 'installmentCount':
      return ask(`${lead}แบ่งกี่งวดครับ${draft.whtRate ? ` (ยอดหลังหักภาษี ${baht(whole)})` : ''}`,
        [say('2 งวด'), say('3 งวด'), say('4 งวด'), say('6 งวด'), ...form(context)]);
    case 'installmentFirst': {
      const count = draft.installmentCount || 2;
      const each = Math.floor((whole / count) * 100) / 100;
      return ask(`${count} งวด งวดละ ${baht(each)} ครับ งวดแรกครบกำหนดวันไหนครับ\nงวดต่อไปนับต่อเดือนละงวด`,
        [say('รับงวดแรกแล้ว'), say('สิ้นเดือนนี้'), say('อีก 30 วัน'), pickDate(context), say('ยังไม่รู้'), ...form(context)]);
    }
    case 'workStatus':
      return ask(`${lead}ส่งงานแล้วหรือยังครับ`, [say('ส่งงานแล้ว'), say('กำลังทำ'), ...form(context)]);
    case 'deliveryDate':
      return ask('จะส่งงานวันไหนครับ', [say('พรุ่งนี้'), say('อีก 7 วัน'), pickDate(context), say('ยังไม่กำหนด'), ...form(context)]);
    case 'payWhen':
      return ask(draft.workStatus === 'wip' ? 'ส่งงานแล้วลูกค้าจะจ่ายภายในกี่วันครับ' : 'ลูกค้าจะจ่ายเมื่อไหร่ครับ',
        [say(draft.workStatus === 'wip' ? 'จ่ายวันส่งงาน' : 'ไม่มีเครดิต'), say('เครดิต 15 วัน'), say('เครดิต 30 วัน'), say('เครดิต 45 วัน'), say('เครดิต 60 วัน'),
          ...(draft.workStatus === 'wip' ? [] : [pickDate(context)]), say('ยังไม่รู้'), ...form(context)]);
  }
}

// ---- the expense -------------------------------------------------------------------------------------------------

export function nextExpenseQuestion(draft: ExpenseDraft): ExpenseQuestion | null {
  if (!draft.name?.trim()) return 'name';
  if (!(Number(draft.amount) > 0)) return 'amount';
  if (!draft.category && !(draft.skipped ?? []).includes('category')) return 'category';
  return null;
}

export function answerExpenseQuestion(question: ExpenseQuestion, input: string, draft: ExpenseDraft): Partial<ExpenseDraft> | null {
  const text = tidy(input);
  if (!text || text.length > 300) return null;
  if (question === 'name') return plainAnswer(text, 120) ? { name: text } : null;
  if (question === 'amount') {
    const match = new RegExp(`^(?:ยอด|จำนวน(?:เงิน)?|ราคา)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท|\\.-)?$`, 'u').exec(text);
    const amount = match ? readMoney(match[1]) : null;
    return amount && amount > 0 ? { amount } : null;
  }
  if (SKIP.test(text)) return { category: 'อื่นๆ', skipped: [...new Set([...(draft.skipped ?? []), 'category'])] };
  const name = text.replace(/^หมวด\s*/u, '').trim();
  const category = EXPENSE_CATEGORIES.find(item => item === name || CATEGORY_LABELS[item] === name);
  return category ? { category } : null;
}

export function expenseQuestionMessage(question: ExpenseQuestion, draft: ExpenseDraft, context: QuestionContext): LineMessage {
  if (question === 'name') return ask('จ่ายค่าอะไรครับ พิมพ์มาได้เลย เช่น ค่ากาแฟ', form(context));
  if (question === 'amount') return ask(`“${clip(draft.name || '', 60)}” จ่ายไปเท่าไรครับ`, form(context));
  return ask(`${clip(draft.name || '', 60)} ${baht(draft.amount || 0)} ครับ อยู่หมวดไหนครับ`,
    [...EXPENSE_CATEGORIES.map(category => say(CATEGORY_LABELS[category] ?? category, `หมวด ${category}`)), ...form(context)]);
}

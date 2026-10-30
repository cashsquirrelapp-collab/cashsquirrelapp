import { validateChanges } from '../../../shared/validation.js';
import { roundMoney, whtAmountFor } from '../../../shared/wht.js';
import type { ClassifyResult, ExpenseDraft, JobDraft } from './lineAssistant.js';
import { LINE_MONEY, normalizeLineText, readMoney, splitClientWork } from './lineDocumentDraft.js';

export interface LineQuickDraftContext {
  // The caller supplies only drafts that have passed its existing expiry/access checks.
  pendingJob?: JobDraft;
  pendingExpense?: ExpenseDraft;
}
export type LineQuickDraftResult = ClassifyResult & { freshDraft: boolean };

const MONEY = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
// An expense in everyday words (owner, 2026-10-30: "ทั้งหมดเลยที่เป็นคำสั่งให้เพิ่ม ต้องเพิ่มการ์ดมา"): บันทึก / เพิ่ม / จด /
// ลง / มี + รายจ่าย or ค่าใช้จ่าย, or จ่าย…; "ซื้อ…" and "เสียค่า…" only with an amount. The bare request is the empty card.
const expensePrefix = /^(?:(?:ช่วย|รบกวน|ขอ)\s*)?(?:(?:(?:บันทึก|เพิ่ม|จด|ลง|มี)\s*)?(?:รายจ่าย|ค่าใช้จ่าย)(?:ใหม่)?|จ่าย)\s*/;
const boughtPrefix = /^(?:(?:ช่วย|รบกวน|ขอ)\s*)?(?:(?:บันทึก|จด|ลง)\s*)?(?:เสีย(?=ค่า)|(?=ซื้อ))/;
const REQUEST_FILLER = /^(?:ให้\s*)?(?:หน่อย|ด้วย|ที|นะ|ครับ|ค่ะ|คะ)?$/;
/** "รายจ่ายเดือนนี้", "ค่าใช้จ่ายประจำ", "รายจ่ายทั้งหมด": a question or a setting, not an expense to record. */
const EXPENSE_LOOKUP = /^(?:เดือน|วันนี้|ปีนี้|ปี|สัปดาห์|อาทิตย์|ล่าสุด|ทั้งหมด|สรุป|ดู|บ้าง|ของ(?:เดือน|ปี|วัน)|ประจำ|รวม|ย้อนหลัง|เก่า|ที่ผ่านมา|แล้ว)/;
const jobPrefix = /^(?:บันทึกงาน|เพิ่มงาน|รายรับ|รายได้)\s*/;
const namedAmount = new RegExp(`^(.+?)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?$`);
const jobAmount = new RegExp(`^(.+?)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?\\s*(.*)$`);
const jobNamedAmount = new RegExp(`^(.+?)\\s*ยอด\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?\\s*(.*)$`);
const amountOnly = new RegExp(`^(?:ยอด\\s*)?(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?$`);
const amountField = new RegExp(`^(?:ยอด|จำนวน|จำนวนเงิน)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?$`);
const depositStatus = new RegExp(`^(?:ได้รับมัดจำ|รับมัดจำ|ได้มัดจำ)\\s*(?:฿\\s*)?(${MONEY})\\s*(?:บาท)?(?:แล้ว)?$`);
const unsupported = /[?？\r\n%=$€¥]|ไหม|มั้ย|หรือ|เท่าไหร่|เท่าไร|กี่|อะไร|ทำไม|อย่างไร|ยังไง|ถ้า|หาก|สมมติ|ตัวอย่าง|พรุ่งนี้|มะรืน|เมื่อวาน|เมื่อคืน|วานนี้|วันที่|สัปดาห์หน้า|อาทิตย์หน้า|เดือนหน้า|ปีหน้า|เดือนที่แล้ว|ไม่ต้อง|ไม่ใช่|ไม่เคย|อย่า|ยกเลิก|ยังไม่จ่าย|ยังไม่ได้จ่าย|ไม่ได้จ่าย|จะจ่าย|กำลังจะ|ต้องจ่าย|คืนเงิน|ขอคืน|ประมาณ|ราวๆ|เกือบ|อย่างน้อย|ไม่เกิน|มากกว่า|น้อยกว่า|คนละ|ต่อคน|เครดิต|กำหนด|ภาษี|หัก\s*ณ|ก่อนหัก|หลังหัก|ทวิ|ดอลลาร์|(?:\b(?:USD|USDT|EUR|AUD|SGD|JPY|VAT|WHT)(?=\s*\d|\b))/i;

// Suggested categories use the app's existing vocabulary. Only these exact common
// expense names can omit an intent prefix; unfamiliar bare names never imply a write type.
const categoryNames = ['ค่าอุปกรณ์/ซอฟต์แวร์', 'ค่าโฆษณา/ยิงแอด', 'ค่าเดินทาง/น้ำมัน', 'อาหาร/รับรองลูกค้า', 'จ้างงานต่อ (Outsource)', 'ภาษี/ธรรมเนียม', 'ค่าบริการ/สาธารณูปโภค', 'อื่นๆ'];
const expenseKeywords: Record<string, string> = Object.fromEntries([
  [['กาแฟ', 'ค่ากาแฟ', 'อาหาร', 'ค่าอาหาร', 'ข้าว', 'ค่าข้าว', 'ขนม', 'ค่าขนม'], 'อาหาร/รับรองลูกค้า'],
  [['เดินทาง', 'ค่าเดินทาง', 'ค่ารถ', 'แท็กซี่', 'ค่าแท็กซี่', 'รถไฟฟ้า', 'ค่ารถไฟฟ้า', 'น้ำมัน', 'ค่าน้ำมัน'], 'ค่าเดินทาง/น้ำมัน'],
  [['อุปกรณ์', 'ค่าอุปกรณ์', 'ซอฟต์แวร์', 'ค่าซอฟต์แวร์'], 'ค่าอุปกรณ์/ซอฟต์แวร์'],
  [['โฆษณา', 'ค่าโฆษณา', 'ยิงแอด', 'ค่ายิงแอด'], 'ค่าโฆษณา/ยิงแอด'],
  [['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'ค่าอินเทอร์เน็ต', 'ค่าโทรศัพท์'], 'ค่าบริการ/สาธารณูปโภค'],
  [['จ้างงานต่อ'], 'จ้างงานต่อ (Outsource)'],
].flatMap(([names, category]) => (names as string[]).map(name => [name, category as string])));

function safeName(name: string): boolean {
  return name.length > 0 && name.length <= 500 && !/[\d.,+\-−*/฿]|ไม่|ยัง|รับเงิน|มัดจำ|จะ|รวม|เหลือ|บาท|ยอด/.test(name);
}

function expenseResult(name: string, value: number | undefined, context: LineQuickDraftContext): LineQuickDraftResult | null {
  if (!safeName(name)) return null;
  const category = Object.prototype.hasOwnProperty.call(expenseKeywords, name) ? expenseKeywords[name] : undefined;
  return validated({ intent: 'add_expense', expenseName: name,
    ...(value !== undefined ? { expenseAmount: value } : {}),
    ...(category ? { expenseCategory: category } : {}), freshDraft: true }, context);
}

function amount(text: string): number | null {
  const value = Number(text.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 && value <= 1_000_000_000_000 ? value : null;
}

function payment(text: string, value?: number): Pick<ClassifyResult, 'jobPaymentStatus' | 'jobReceivedAmount'> | null {
  if (/^(?:ยังไม่ได้รับเงิน|ยังไม่รับเงิน|ยังไม่ได้เงิน|รอรับเงิน|ยังไม่ได้)$/.test(text)) return { jobPaymentStatus: 'pending' };
  if (/^(?:รับเงินครบแล้ว|ได้รับเงินครบแล้ว|รับครบแล้ว|จ่ายครบแล้ว)$/.test(text)) return { jobPaymentStatus: 'paid' };
  const match = text.match(depositStatus);
  if (!match) return null;
  const received = amount(match[1]);
  // A deposit needs a known contract value; equality is full payment, so ask for
  // clearer wording rather than silently changing the user's stated payment type.
  return received !== null && value !== undefined && received < value
    ? { jobPaymentStatus: 'partial', jobReceivedAmount: received }
    : null;
}

function validated(result: LineQuickDraftResult, context: LineQuickDraftContext): LineQuickDraftResult | null {
  // Reuse the write boundary's field/range validation. These zero/date/id values
  // are validation scaffolding only: they never enter the returned draft or storage.
  try {
    if (result.intent === 'add_expense') {
      const previous = result.freshDraft ? undefined : context.pendingExpense;
      validateChanges([{ table: 'cashflow_expenses', id: 'line-draft-check', op: 'set', version: null, data: {
        id: 'line-draft-check', name: result.expenseName ?? previous?.name ?? '',
        amount: result.expenseAmount ?? previous?.amount ?? 0,
        category: '', date: '',
      } }]);
    } else {
      const previous = result.freshDraft ? undefined : context.pendingJob;
      const value = result.jobValue ?? previous?.value;
      const received = result.jobReceivedAmount ?? previous?.receivedAmount;
      const status = result.jobPaymentStatus ?? previous?.paymentStatus;
      if (status === 'partial' && value !== undefined && received !== undefined
        && received >= roundMoney(value - whtAmountFor(value, previous?.whtRate || 0))) return null;
      validateChanges([{ table: 'cashflow_jobs', id: 'line-draft-check', op: 'set', version: null, data: {
        id: 'line-draft-check', name: result.jobName ?? previous?.name ?? '',
        value: result.jobValue ?? previous?.value ?? 0, received: 0, pending: 0,
        client: result.jobClient ?? previous?.client ?? '', type: '', status: '',
        creditTerm: previous?.creditTerm ?? 0, note: '', payDate: null,
      } }]);
    }
    return result;
  } catch { return null; }
}

/** Recognizes a small, explicit Thai command grammar without AI or side effects.
 * Null means unsupported/ambiguous, never permission to guess. The caller must
 * display a draft and require its existing explicit confirmation before writing.
 */
export function parseLineQuickDraft(input: string, context: LineQuickDraftContext = {}): LineQuickDraftResult | null {
  if (input.length > 1500 || /[\r\n]/.test(input)) return null;
  const text = input.replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50))
    .trim().replace(/\s*(?:ครับ|ค่ะ|คะ)$/, '').trim();
  // An exact category selection is safe even when the category itself names tax.
  const category = /^หมวด\s*(.+)$/.exec(text)?.[1];
  if (context.pendingExpense && !context.pendingJob && category && categoryNames.includes(category)) {
    return validated({ intent: 'add_expense', expenseCategory: category, freshDraft: false }, context);
  }
  // Details typed for the job being recorded (owner, 2026-10-30: "ถ้าเขาอยากพิมพ์ลงในแชทเอง ข้อมูลในส่วนนั้นมึงก็เอาไป
  // กรอกให้เขาโดยอัตโนมัติ"): credit days, withholding, the client, a deposit. Read before the general refusals below,
  // which keep tax and credit words away from new records.
  if (context.pendingJob && !context.pendingExpense) {
    const credit = /^(?:เครดิต|เครดิตเทอม)\s*(\d{1,4})\s*วัน$/.exec(text);
    if (credit) return validated({ intent: 'add_job', jobCreditTerm: Math.min(3650, Number(credit[1])), freshDraft: false }, context);
    if (/^ไม่มีเครดิต(?:เทอม)?$/.test(text)) return validated({ intent: 'add_job', jobCreditTerm: 0, freshDraft: false }, context);
    const wht = /^หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*([1-5])\s*%$/.exec(text);
    if (wht && [1, 2, 3, 5].includes(Number(wht[1]))) return validated({ intent: 'add_job', jobWhtRate: Number(wht[1]), freshDraft: false }, context);
    if (/^ไม่(?:มี)?หัก(?:\s*ณ\s*ที่\s*จ่าย)?$/.test(text)) return validated({ intent: 'add_job', jobWhtRate: 0, freshDraft: false }, context);
    const client = /^(?:ให้|ลูกค้า(?:คือ|ชื่อ)?)\s*(.{1,200})$/.exec(text);
    if (client && !/\d/.test(client[1])) return validated({ intent: 'add_job', jobClient: client[1].trim(), freshDraft: false }, context);
    // "ยอด 6000 ยังไม่ได้รับเงิน": the amount and the payment in one line.
    const both = new RegExp(`^(?:ยอด|ราคา|มูลค่า)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?\\s+(.+)$`).exec(text);
    const bothValue = both ? amount(both[1]) : null;
    const bothStatus = both && bothValue !== null ? payment(both[2].trim(), bothValue) : null;
    if (bothValue !== null && bothStatus) return validated({ intent: 'add_job', jobValue: bothValue, ...bothStatus, freshDraft: false }, context);
    const deposit = new RegExp(`^(?:ได้|รับ)?มัดจำ(?:มา)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?(?:แล้ว)?$`).exec(text);
    const received = deposit ? amount(deposit[1]) : null;
    if (received !== null && context.pendingJob.value && received < context.pendingJob.value) {
      return validated({ intent: 'add_job', jobPaymentStatus: 'partial', jobReceivedAmount: received, freshDraft: false }, context);
    }
  }
  if (unsupported.test(text)) return null;
  if (expensePrefix.test(text)) {
    const body = text.replace(expensePrefix, '').replace(/\s*(?:ให้หน่อย|หน่อย|ด้วย)$/, '').trim();
    // "บันทึกรายจ่าย" / "เพิ่มรายจ่ายหน่อย" alone: the empty card and its form, never an expense named หน่อย.
    if (REQUEST_FILLER.test(body)) return { intent: 'add_expense', freshDraft: true };
    if (EXPENSE_LOOKUP.test(body)) return null;
    const match = body.match(namedAmount);
    if (!match) return safeName(body) ? expenseResult(body, undefined, context) : null;
    const value = amount(match[2]);
    return value === null ? null : expenseResult(match[1].trim(), value, context);
  }
  if (boughtPrefix.test(text)) {
    const match = text.replace(boughtPrefix, '').match(namedAmount);
    const value = match ? amount(match[2]) : null;
    if (match && value !== null) return expenseResult(match[1].trim(), value, context);
  }
  if (jobPrefix.test(text)) {
    const body = text.replace(jobPrefix, '').replace(/^(?:ให้\s*)?(?:หน่อย|ด้วย|ที)$/, '');
    // "บันทึกงาน" alone: the empty draft card, its form for everything (never questions).
    if (!body) return { intent: 'add_job', freshDraft: true };
    const explicitTotal = body.includes('ยอด');
    const job = body.match(explicitTotal ? jobNamedAmount : jobAmount);
    if (!job) return safeName(body) ? validated({ intent: 'add_job', jobName: body, freshDraft: true }, context) : null;
    const value = amount(job[2]);
    if (value === null || /ยอด|[+*/฿]|บาท|\b\d+(?:[,.]\d+)*\b/.test(job[1]) || (!explicitTotal && /[\d.,\-−]/.test(job[1]))) return null;
    const parties = job[1].trim().split(/\s+ให้\s*/);
    if (parties.length > 2 || !parties[0] || (parties.length === 2 && !parties[1])) return null;
    const status = job[3] ? payment(job[3].trim(), value) : {};
    if (!status) return null;
    return validated({ intent: 'add_job', jobName: parties[0].trim(),
      ...(parties[1] ? { jobClient: parties[1].trim() } : {}), jobValue: value, ...status, freshDraft: true }, context);
  }
  const bare = text.match(namedAmount);
  if (bare && Object.prototype.hasOwnProperty.call(expenseKeywords, bare[1].trim())) {
    const value = amount(bare[2]);
    return value === null ? null : expenseResult(bare[1].trim(), value, context);
  }
  if (Object.prototype.hasOwnProperty.call(expenseKeywords, text)) return expenseResult(text, undefined, context);
  // A short answer is meaningful only with one active draft of the matching type.
  if (context.pendingJob && !context.pendingExpense) {
    const status = payment(text, context.pendingJob.value);
    if (status) return validated({ intent: 'add_job', ...status, freshDraft: false }, context);
    const field = /^(ชื่อ|ชื่องาน|ลูกค้า)\s+(.+)$/.exec(text);
    if (field && safeName(field[2])) return validated({ intent: 'add_job',
      ...(field[1] === 'ลูกค้า' ? { jobClient: field[2] } : { jobName: field[2] }), freshDraft: false }, context);
    const match = text.match(amountField) || (!context.pendingJob.value && text.match(amountOnly));
    const value = match ? amount(match[1]) : null;
    if (value !== null) return validated({ intent: 'add_job', jobValue: value, freshDraft: false }, context);
  }
  if (context.pendingExpense && !context.pendingJob) {
    const name = /^(?:ชื่อ|ชื่อรายการ)\s+(.+)$/.exec(text)?.[1];
    if (name && safeName(name)) return validated({ intent: 'add_expense', expenseName: name, freshDraft: false }, context);
    const match = text.match(amountField) || (!context.pendingExpense.amount && text.match(amountOnly));
    const value = match ? amount(match[1]) : null;
    if (value !== null) return validated({ intent: 'add_expense', expenseAmount: value, freshDraft: false }, context);
  }
  return null;
}

// Recording a job in everyday words (owner, 2026-10-30: "เวลาบันทึกงานก็ให้การ์ดมาเหมือนกัน ... ถ้าไม่ครบ ... ไม่ต้องถาม
// ให้เขากรอกให้ครบ"): "บันทึกงาน ถ่ายรูปให้ร้านบี 8,000 เครดิต 30 วัน หัก 3%", "มีงานใหม่ ตัดต่อวิดีโอ ให้คุณบี",
// "รับงาน ออกแบบโลโก้ 5 ชิ้น ชิ้นละ 1,500 ยังไม่ได้รับเงิน". It always becomes the draft card (ยืนยันบันทึก even when
// everything is there; the form for whatever is missing), never questions. Several jobs or a date in one message
// stay with เลขา, which can record them all and their dates.
const JOB_START = /^(?:(?:ช่วย|รบกวน|ขอ)\s*)?(?:(?:บันทึก|เพิ่ม|จด|ลง)\s*(?:งาน|โปรเจกต์|โปรเจ็กต์|โปรเจค)(?:ใหม่)?|(?:มี|รับ|ได้)\s*(?:งาน|โปรเจกต์|โปรเจ็กต์|โปรเจค)(?:ใหม่)?|งานใหม่)\s*(?:ให้หน่อย|หน่อย)?\s*/u;
const SEVERAL_OR_DATED = /งานละ|กับงาน|และงาน|อีกงาน|\d+\s*งาน(?:\s|$)|พรุ่งนี้|มะรืน|เมื่อวาน|วันนี้|วันที่|สัปดาห์|อาทิตย์|เดือนหน้า|ปีหน้า|เมื่อไร|เมื่อไหร่|[?？]|ไหม|มั้ย|เท่าไร|เท่าไหร่/u;
const JOB_FILLER = /(?:\s*(?:ให้หน่อย|หน่อย|ด้วย|นะ|น้า|จ้า|ครับ|คับ|ค่ะ|คะ))+$/u;

export function parseLineJobRequest(input: string): LineQuickDraftResult | null {
  if (input.length > 600) return null;
  const text = normalizeLineText(input).replace(JOB_FILLER, '').trim();
  const start = JOB_START.exec(text);
  if (!start) return null;
  let rest = text.slice(start[0].length).trim();
  if (SEVERAL_OR_DATED.test(rest)) return null;
  const result: LineQuickDraftResult = { intent: 'add_job', freshDraft: true };
  // Payment first, so "ยังไม่ได้รับเงิน" or "มัดจำ 2,000" never becomes part of the work's name or its amount.
  const deposit = new RegExp(`(?:ได้|รับ)?มัดจำ(?:มา)?\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?(?:แล้ว)?`, 'u').exec(rest);
  if (deposit) { result.jobReceivedAmount = readMoney(deposit[1]) ?? undefined; rest = rest.replace(deposit[0], ' '); }
  const pending = /ยังไม่(?:ได้)?(?:รับ|ได้)(?:เงิน)?|ยังไม่จ่าย|ยังไม่โอน|รอรับ(?:เงิน)?|ค้าง(?:จ่าย|รับ)(?:อยู่)?/u.exec(rest);
  const paid = /(?:ได้รับ(?:เงิน)?|รับเงิน|ได้เงิน|ลูกค้าโอน(?:มา)?|โอน(?:มา)?|จ่าย(?:มา)?)(?:ครบ)?แล้ว|รับครบแล้ว/u.exec(rest);
  if (pending) { result.jobPaymentStatus = 'pending'; rest = rest.replace(pending[0], ' '); }
  else if (paid) { result.jobPaymentStatus = 'paid'; rest = rest.replace(paid[0], ' '); }
  const credit = /เครดิต(?:เทอม)?\s*(\d{1,4})\s*วัน/u.exec(rest);
  if (credit) { result.jobCreditTerm = Math.min(3650, Number(credit[1])); rest = rest.replace(credit[0], ' '); }
  const wht = /หัก\s*(?:ณ\s*ที่\s*จ่าย)?\s*([1-5])\s*%/u.exec(rest);
  if (wht && [1, 2, 3, 5].includes(Number(wht[1]))) { result.jobWhtRate = Number(wht[1]); rest = rest.replace(wht[0], ' '); }
  // "5 ชิ้น ชิ้นละ 1,500": the job's value is the whole, the units stay in its name.
  const each = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*([ก-๛A-Za-z]{1,12}?)\\s*(?:\\2)?\\s*ละ\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท)?`, 'u').exec(rest);
  if (each) {
    const unitPrice = readMoney(each[3]);
    if (unitPrice !== null) result.jobValue = Math.round(Number(each[1]) * unitPrice * 100) / 100;
    rest = rest.replace(each[0], ` ${each[1]} ${each[2]} `);
  } else {
    const named = new RegExp(`(?:ยอด|ราคา|ค่าจ้าง|มูลค่า|รวม)\\s*(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท|\\.-)?`, 'u').exec(rest);
    const plain = [...rest.matchAll(new RegExp(`(?:^|\\s)(?:฿\\s*)?(${LINE_MONEY})\\s*(?:บาท|\\.-)?(?=\\s|$)`, 'gu'))].at(-1);
    const found = named ?? plain;
    if (found) { result.jobValue = readMoney(found[1]) ?? undefined; rest = rest.replace(found[0], ' '); }
  }
  if (result.jobReceivedAmount !== undefined) {
    // A deposit is part paid only when it is less than the whole; otherwise the words are unclear: ask through the card.
    if (result.jobValue && result.jobReceivedAmount < result.jobValue) result.jobPaymentStatus = 'partial';
    else delete result.jobReceivedAmount;
  }
  const { client, work } = splitClientWork(rest);
  if (work) result.jobName = work.replace(/^งาน\s+/u, '').slice(0, 500);
  if (client) result.jobClient = client.slice(0, 500);
  return validated(result, {});
}

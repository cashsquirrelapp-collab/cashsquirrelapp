import type { Job, StatusOption } from '../../../shared/types.js';
import { isValidDateKey } from '../../../shared/incomeExport.js';
import { isValidWhtRate, jobWhtAmount, roundMoney, whtAmountFor } from '../../../shared/wht.js';

type FinancialJob = Pick<Job, 'value' | 'received'> &
  Partial<Pick<Job, 'pending' | 'status' | 'payDate' | 'whtRate' | 'whtAmount' | 'paymentStatus' | 'dueDate' | 'depositDate' | 'depositAmount' | 'installments'>>;
export type JobFinancialEditResult =
  | { ok: true; patch: Partial<Job>; changes: { label: string; value: string }[] }
  | { ok: false; error: string; missing?: string[] };
const KEYS = ['value', 'wht_rate', 'payment_status', 'received_amount', 'paid_date'];
const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
const date = (value: unknown): value is string => typeof value === 'string' && isValidDateKey(value) && value >= '1900-01-01' && value <= '2200-12-31';
const baht = (value: number) => `฿${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fail = (error: string, missing?: string[]): JobFinancialEditResult => ({ ok: false, error, ...(missing ? { missing } : {}) });
const behavior = (id: string | undefined, statuses: readonly StatusOption[]) => statuses.find(item => item.id === id)?.behavior
  ?? (id === 'done' ? 'done' : id === 'partial' || id === 'installment' ? 'partial' : 'pending');
const statusFor = (job: FinancialJob, statuses: readonly StatusOption[], target: StatusOption['behavior']) =>
  job.status && job.status !== 'installment' && behavior(job.status, statuses) === target ? job.status
    : statuses.find(item => item.id === target && item.behavior === target)?.id
      ?? statuses.find(item => item.behavior === target && item.id !== 'installment')?.id ?? target;

/** Compute one reviewed replacement from an authenticated snapshot; never writes or changes delivery state.
 * received_amount is the total received so far, not an additional transfer. Multiple dated partial
 * receipts need the installment editor: the single-deposit schema cannot preserve that history.
 */
export function calculateJobFinancialEdit(
  job: FinancialJob, statuses: readonly StatusOption[], args: Record<string, unknown>, today: string,
): JobFinancialEditResult {
  const supplied = (key: string) => args[key] !== undefined;
  if (!KEYS.some(supplied)) return { ok: true, patch: {}, changes: [] };
  if (!date(today)) return fail('วันที่ปัจจุบันไม่ถูกต้อง กรุณาลองใหม่');
  if (job.installments?.length || job.status === 'installment') {
    return fail('งานนี้แบ่งชำระเป็นงวด ต้องตรวจยอดสุทธิ ยอดแต่ละงวด และวันที่รับจริงในหน้าแก้ไขงานก่อนเปลี่ยนข้อมูลการเงิน เพื่อรักษาประวัติรับเงินเดิม');
  }
  if (!money(job.value) || !money(job.received) || (job.pending !== undefined && !money(job.pending)) || !isValidWhtRate(job.whtRate ?? 0)
    || (job.whtAmount !== undefined && !money(job.whtAmount))) return fail('ข้อมูลการเงินเดิมของงานไม่ครบหรือไม่ถูกต้อง กรุณาตรวจในหน้าแก้ไขงาน');
  if (supplied('value') && (!money(args.value) || args.value <= 0)) return fail('มูลค่างานต้องมากกว่า 0 และไม่เกิน 1 ล้านล้านบาท');
  if (supplied('wht_rate') && (typeof args.wht_rate !== 'number' || !isValidWhtRate(args.wht_rate))) return fail('อัตราหัก ณ ที่จ่ายต้องเป็น 0–100% และทศนิยมไม่เกิน 2 ตำแหน่ง');
  const payment = args.payment_status;
  if (supplied('payment_status') && (typeof payment !== 'string' || !['paid', 'partial', 'unpaid'].includes(payment))) return fail('สถานะการชำระต้องเป็น paid, partial หรือ unpaid');
  if (supplied('received_amount') && payment !== 'partial') return fail('ยอดรับสะสมใช้กับสถานะรับบางส่วนเท่านั้น ถ้ารับครบระบบจะคำนวณจากยอดสุทธิ');
  if (supplied('paid_date') && payment !== 'paid' && payment !== 'partial') return fail('ระบุสถานะรับครบหรือรับบางส่วนพร้อมวันที่รับเงินจริง', ['สถานะการชำระ']);
  if (supplied('paid_date') && (!date(args.paid_date) || args.paid_date > today)) return fail('วันที่รับเงินต้องเป็นวันที่จริง YYYY-MM-DD และไม่เกินวันนี้');

  const value = supplied('value') ? roundMoney(args.value as number) : job.value;
  if (supplied('value') && value <= 0) return fail('มูลค่างานต้องมากกว่า 0 หลังปัดเป็นสตางค์');
  const rate = supplied('wht_rate') ? args.wht_rate as number : job.whtRate ?? 0;
  const oldWht = jobWhtAmount(job);
  const withholding = supplied('value') || supplied('wht_rate') ? whtAmountFor(value, rate) : oldWht;
  if (withholding > value) return fail('ยอดหัก ณ ที่จ่ายเดิมมากกว่ามูลค่างาน กรุณาตรวจอัตราและยอดหักก่อน');
  const net = roundMoney(value - withholding);
  const received = roundMoney(job.received);
  const oldPending = job.pending ?? roundMoney(Math.max(0, job.value - oldWht - received));
  const wasPaid = job.paymentStatus === 'paid' || behavior(job.status, statuses) === 'done' || (received > 0 && oldPending <= 0);
  if (received > net) return fail('ยอดสุทธิใหม่ต่ำกว่ายอดที่รับเงินจริงแล้ว การแก้นี้จะลดยอดรับเดิม กรุณาตรวจและแก้ประวัติในหน้าแก้ไขงาน');

  const patch: Partial<Job> = {};
  const changes: { label: string; value: string }[] = [];
  if (supplied('value')) patch.value = value;
  if (supplied('wht_rate')) patch.whtRate = rate;
  if (supplied('value') || supplied('wht_rate')) patch.whtAmount = withholding;
  if (supplied('value')) changes.push({ label: 'มูลค่างาน', value: `${baht(job.value)} → ${baht(value)}` });
  if (supplied('wht_rate') || oldWht !== withholding) changes.push({ label: 'หัก ณ ที่จ่าย', value: `${job.whtRate ?? 0}% (${baht(oldWht)}) → ${rate}% (${baht(withholding)})` });
  changes.push({ label: 'ยอดรับสุทธิทั้งงาน', value: `${baht(roundMoney(job.value - oldWht))} → ${baht(net)}` });

  let finalReceived = received;
  if (payment === 'unpaid') {
    if (received > 0 || wasPaid || (job.depositAmount ?? 0) > 0 || job.depositDate) return fail('งานนี้มีประวัติรับเงินแล้ว จึงเปลี่ยนเป็นยังไม่จ่ายโดยล้างประวัติไม่ได้ กรุณาตรวจในหน้าแก้ไขงาน');
    Object.assign(patch, { status: statusFor(job, statuses, 'pending'), paymentStatus: 'unpaid' });
  } else if (payment === 'paid' || payment === 'partial') {
    const oldReceiptDate = wasPaid ? job.payDate || job.dueDate : job.depositDate;
    if (payment === 'partial') {
      if (!supplied('received_amount')) return fail('ระบุยอดรวมที่รับเงินจริงแล้ว เพื่อคำนวณยอดคงเหลือ', ['ยอดรับสะสมทั้งหมด']);
      if (!money(args.received_amount) || args.received_amount <= 0 || roundMoney(args.received_amount) >= net) return fail('ยอดรับบางส่วนต้องมากกว่า 0 และน้อยกว่ายอดสุทธิ ถ้ารับครบให้ใช้สถานะ paid');
      finalReceived = roundMoney(args.received_amount);
      if (finalReceived < received) return fail('ยอดรับสะสมใหม่น้อยกว่ายอดที่บันทึกไว้ การแก้นี้จะลบประวัติรับเงิน กรุณาตรวจในหน้าแก้ไขงาน');
      if (wasPaid) return fail('งานนี้เคยบันทึกรับครบแล้ว การเปิดยอดค้างใหม่ต้องตรวจวันที่รับเงินและกำหนดชำระในหน้าแก้ไขงาน');
    } else finalReceived = net;

    // Once there is a dated deposit, preserve its amount before increasing aggregate received.
    // Leaving depositAmount undefined would make the shared receipt helper move the NEW total
    // onto the old deposit date. An undated old receipt cannot be silently moved onto today.
    if (received > 0 && !wasPaid && payment === 'paid'
      && (!date(job.depositDate) || (job.depositAmount !== undefined && roundMoney(job.depositAmount) !== received))) {
      return fail('งานนี้มีเงินรับก่อนหน้าแต่วันที่หรือยอดมัดจำไม่ครบ กรุณาตรวจประวัติรับเงินเดิมในหน้าแก้ไขงานก่อนบันทึกรับครบ');
    }
    if (job.depositDate && (!date(job.depositDate) || job.depositDate > today || (job.depositAmount !== undefined && (!money(job.depositAmount) || job.depositAmount > received)))) {
      return fail('วันที่หรือยอดมัดจำเดิมไม่ถูกต้อง กรุณาตรวจประวัติรับเงินในหน้าแก้ไขงาน');
    }
    const receiptDate = supplied('paid_date') ? args.paid_date as string
      : wasPaid || (payment === 'partial' && finalReceived === received) ? oldReceiptDate : today;
    if (!date(receiptDate) || receiptDate > today) return fail('ระบุวันที่รับเงินจริงของยอดเดิม เพื่อไม่ย้ายรายรับไปวันนี้', ['วันที่รับเงินจริง']);
    if (payment === 'partial' && received > 0) {
      if (job.depositAmount !== undefined && roundMoney(job.depositAmount) !== received) return fail('ยอดรับเดิมมีหลายส่วน กรุณาตรวจประวัติและวันที่รับในหน้าแก้ไขงาน');
      if (finalReceived > received && (!date(job.depositDate) || receiptDate !== job.depositDate)) return fail('เงินรับเดิมกับยอดเพิ่มอยู่คนละวันหรือวันที่เดิมไม่ครบ ต้องบันทึกแยกงวดในหน้าแก้ไขงานเพื่อรักษาประวัติรายรับ');
    }
    if (payment === 'paid' && date(job.depositDate) && receiptDate < job.depositDate) return fail('วันที่รับยอดครบต้องไม่ก่อนวันที่รับมัดจำเดิม');
    if (payment === 'paid') {
      Object.assign(patch, { status: statusFor(job, statuses, 'done'), paymentStatus: 'paid', payDate: receiptDate });
      if (date(job.depositDate) && job.depositAmount === undefined) patch.depositAmount = received;
      if (date(job.depositDate) && received > 0) changes.push({ label: 'มัดจำเดิมที่เก็บไว้', value: `${baht(job.depositAmount ?? received)} · ${job.depositDate}` });
    } else {
      Object.assign(patch, { status: statusFor(job, statuses, 'partial'), paymentStatus: 'partial', depositDate: receiptDate, depositAmount: finalReceived });
    }
    const previousDateForReview = payment === 'paid' && !wasPaid ? undefined : oldReceiptDate;
    changes.push({ label: payment === 'paid' ? 'วันที่รับยอดครบ' : 'วันที่รับบางส่วน', value: previousDateForReview && previousDateForReview !== receiptDate ? `${previousDateForReview} → ${receiptDate}` : receiptDate });
  } else {
    // Changing a contract or tax rate alone must not invent a new receipt, reverse a paid
    // status, or silently mark an outstanding payment as complete.
    if ((wasPaid && net !== received) || (!wasPaid && received > 0 && net === received)) {
      return fail('ยอดสุทธิใหม่ทำให้สถานะการชำระเปลี่ยน กรุณาระบุว่ารับครบหรือรับบางส่วนด้วย', ['สถานะการชำระ']);
    }
  }
  patch.pending = roundMoney(net - finalReceived);
  if (payment !== undefined) {
    patch.received = finalReceived;
    changes.push({ label: 'สถานะการชำระ', value: payment === 'paid' ? 'รับครบแล้ว' : payment === 'partial' ? 'รับบางส่วน' : 'ยังไม่จ่าย' });
  }
  changes.push({ label: 'ยอดรับสะสม', value: `${baht(received)} → ${baht(finalReceived)}` }, { label: 'ยอดคงค้าง', value: `${baht(oldPending)} → ${baht(patch.pending)}` });
  return { ok: true, patch, changes };
}

import { createHash } from 'node:crypto';
import type { Job } from '../../../shared/types.js';
import { jobNetReceivable, roundMoney } from '../../../shared/wht.js';
import { validateChanges } from '../../../shared/validation.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineValueRow } from './lineCards.js';

// One-tap answers to the 08:00 reminder (owner, 2026-10-22): under each job that is due today or
// overdue the card offers ได้รับแล้ว / ยังไม่ได้ / ได้ไม่ครบ. A tap records the payment the same way
// the app's payment dialogs do (JobPaymentDialog, the Jobs page's per-instalment payment), through
// the same versioned save as the app (cashflow_apply_changes), so an edit made elsewhere is never
// overwritten. "ได้ไม่ครบ" opens the keyboard with "รับเงินบางส่วน #REF ยอด " filled in; the amount
// typed after it is read here, with no conversation state to remember.

export type DueKind = 'paid' | 'later' | 'partial';
export type DueRef = { jobId: string; installmentId?: string };
export type DueAction = { kind: DueKind; ref: DueRef };

const ID = '[A-Za-z0-9_.-]{1,128}';
const ID_RE = new RegExp(`^${ID}$`);
const ACTION_RE = new RegExp(`^due:(paid|later|partial):(${ID})(?::(${ID}))?$`);
const PARTIAL_TEXT_RE = /^รับเงิน(?:บางส่วน|ไม่ครบ)\s*#([0-9A-F]{6})\s*(?:ยอด)?\s*[:：]?\s*฿?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/i;

export function encodeDueAction(kind: DueKind, ref: DueRef): string | null {
  if (!ID_RE.test(ref.jobId) || (ref.installmentId !== undefined && !ID_RE.test(ref.installmentId))) return null;
  const data = `due:${kind}:${ref.jobId}${ref.installmentId ? `:${ref.installmentId}` : ''}`;
  return data.length <= 300 ? data : null;
}

export function decodeDueAction(data: string): DueAction | null {
  const match = ACTION_RE.exec(data.trim());
  if (!match) return null;
  return { kind: match[1] as DueKind, ref: { jobId: match[2], ...(match[3] ? { installmentId: match[3] } : {}) } };
}

/** The digest lists an instalment as `jobId:installmentId`; a plain job keeps its own id. */
export function dueRefFromDigestId(id: string): DueRef | null {
  const [jobId, installmentId, extra] = id.split(':');
  if (extra !== undefined || !jobId) return null;
  return installmentId ? { jobId, installmentId } : { jobId };
}

/** A short, stable code for the typed amount ("รับเงินบางส่วน #3F2A9C ยอด 5000"). */
export function dueShortRef(ref: DueRef): string {
  return createHash('sha256').update(`${ref.jobId}|${ref.installmentId ?? ''}`).digest('hex').slice(0, 6).toUpperCase();
}

export function partialPrompt(ref: DueRef): string {
  return `รับเงินบางส่วน #${dueShortRef(ref)} ยอด `;
}

export function parsePartialText(text: string): { shortRef: string; amount: number } | null {
  const match = PARTIAL_TEXT_RE.exec(text.trim());
  if (!match) return null;
  const amount = Number(match[2].replace(/,/g, ''));
  return Number.isFinite(amount) ? { shortRef: match[1].toUpperCase(), amount } : null;
}

type Applied = { job: Job; amount: number; full: boolean; installmentLabel?: string };
type Refused = { error: 'already_paid' | 'missing_installment' | 'installments' | 'already_partial' | 'invalid_amount' };

/** "ได้รับแล้ว": the same fields the app saves when the rest of the money arrives. */
export function applyFullPayment(job: Job, installmentId: string | undefined, today: string, nowIso: string): Applied | Refused {
  if (job.installments?.length) {
    const row = installmentId ? job.installments.find(item => item.id === installmentId) : undefined;
    if (!row) return { error: 'missing_installment' };
    if (row.status === 'paid') return { error: 'already_paid' };
    const installments = job.installments.map(item => (item.id === row.id ? { ...item, status: 'paid' as const, paidAt: today } : item));
    const received = installments.filter(item => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0);
    const net = jobNetReceivable(job);
    const next = installments.filter(item => item.status !== 'paid' && item.dueDate).sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
    const isPaid = received >= net || installments.every(item => item.status === 'paid');
    return {
      job: { ...job, installments, received, pending: Math.max(0, net - received), paymentStatus: isPaid ? 'paid' : 'partial', payDate: isPaid ? today : (next[0]?.dueDate || null), lastActivityAt: nowIso },
      amount: row.amount, full: isPaid, installmentLabel: row.label,
    };
  }
  if (installmentId) return { error: 'missing_installment' };
  if (job.paymentStatus === 'paid' || (job.pending || 0) <= 0) return { error: 'already_paid' };
  const net = jobNetReceivable(job);
  const amount = roundMoney(Math.max(0, net - (job.received || 0)));
  return {
    job: { ...job, status: 'done', received: net, pending: 0, paymentStatus: 'paid', payDate: today, lastActivityAt: nowIso },
    amount, full: true,
  };
}

/** "ได้ไม่ครบ": a first deposit, as the app's payment dialog records it; the whole rest counts as paid in full. */
export function applyPartialPayment(job: Job, amount: number, today: string, nowIso: string): Applied | Refused {
  if (job.installments?.length) return { error: 'installments' };
  if (job.paymentStatus === 'paid' || (job.pending || 0) <= 0) return { error: 'already_paid' };
  if (!(amount > 0)) return { error: 'invalid_amount' };
  const net = jobNetReceivable(job);
  const remaining = roundMoney(Math.max(0, net - (job.received || 0)));
  if (amount >= remaining) return applyFullPayment(job, undefined, today, nowIso);
  if ((job.received || 0) > 0) return { error: 'already_partial' };
  const received = roundMoney(amount);
  return {
    job: { ...job, status: 'partial', received, pending: roundMoney(Math.max(0, net - received)), paymentStatus: 'partial', depositDate: today, depositAmount: received, lastActivityAt: nowIso },
    amount: received, full: false,
  };
}

// ── Saving and replying ─────────────────────────────────────────────────────────────────────────

export interface DuePaymentDependencies {
  loadJob(userId: string, jobId: string): Promise<{ data: Job; version: number } | null>;
  /** False when the job changed since it was read (another device saved first). */
  saveJob(userId: string, jobId: string, version: number, data: Job): Promise<boolean>;
  today(): string;
  now(): Date;
}

function bangkokToday(now: Date): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const duePaymentDependencies: DuePaymentDependencies = {
  async loadJob(userId, jobId) {
    const result = await getSupabaseAdmin().from('cashflow_jobs').select('data,version').eq('user_id', userId).eq('id', jobId).maybeSingle();
    if (result.error) throw result.error;
    return result.data ? { data: result.data.data as Job, version: Number(result.data.version) } : null;
  },
  async saveJob(userId, jobId, version, data) {
    const changes = validateChanges([{ table: 'cashflow_jobs', id: jobId, op: 'set', version, data }]);
    const result = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: userId, p_changes: changes });
    if (result.error) throw result.error;
    return result.data !== false;
  },
  today: () => bangkokToday(new Date()),
  now: () => new Date(),
};

const baht = (amount: number) => `฿ ${amount.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
const text = (value: string): LineMessage => ({ type: 'text', text: value });
const isSample = (ref: DueRef) => ref.jobId.startsWith('demo-');

function receipt(job: Job, applied: Applied): LineMessage {
  const pending = job.pending || 0;
  return lineCard({
    compact: true, character: 'received', title: applied.full ? 'บันทึกรับเงินแล้ว' : 'บันทึกรับเงินบางส่วนแล้ว',
    subtitle: 'จากปุ่มในแจ้งเตือน',
    metric: { label: job.name || 'งาน', value: baht(applied.amount), color: C.positive },
    body: [
      ...(job.client ? [lineValueRow('ลูกค้า', job.client, { bold: false })] : []),
      ...(applied.installmentLabel ? [lineValueRow('งวด', applied.installmentLabel, { bold: false })] : []),
      lineValueRow('ยังค้างรับ', pending > 0 ? baht(pending) : 'ไม่มี รับครบแล้ว', { color: pending > 0 ? C.text : C.positive }),
    ],
    note: 'กดผิดหรือยอดไม่ตรง แก้ไขได้ในแอป',
    footer: lineAppLink('/jobs', 'ดูงานในแอป'),
    altText: `${applied.full ? 'บันทึกรับเงินแล้ว' : 'บันทึกรับเงินบางส่วนแล้ว'} ${baht(applied.amount)} · ${job.name || 'งาน'}`,
  });
}

function refusal(job: Job, refused: Refused): LineMessage {
  const name = job.name || 'งานนี้';
  switch (refused.error) {
    case 'already_paid': return text(`"${name}" บันทึกรับเงินครบไว้แล้วครับ ไม่ต้องทำอะไรเพิ่ม`);
    case 'missing_installment': return text(`ไม่พบงวดนี้ใน "${name}" แล้วครับ อาจมีการแก้ตารางงวดในแอป กรุณาบันทึกรับเงินในแอปครับ`);
    case 'installments': return text(`"${name}" แบ่งรับเป็นงวด กด "ได้รับแล้ว" ทีละงวด หรือแก้ยอดในแอปได้ครับ`);
    case 'already_partial': return text(`"${name}" รับเงินบางส่วนไว้แล้ว ถ้าได้รับส่วนที่เหลือครบ กด "ได้รับแล้ว" ครับ ถ้ายังไม่ครบ แก้ยอดในแอปได้ครับ`);
    default: return text('ยอดเงินไม่ถูกต้องครับ พิมพ์เป็นตัวเลข เช่น รับเงินบางส่วน #ABC123 ยอด 5000');
  }
}

/** Load, apply, save; one retry when another device saved the same job in between. */
async function record(userId: string, ref: DueRef, apply: (job: Job) => Applied | Refused, deps: DuePaymentDependencies): Promise<LineMessage> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await deps.loadJob(userId, ref.jobId);
    if (!row) return text('ไม่พบงานนี้แล้วครับ อาจถูกลบหรือย้ายไปแล้ว ดูรายการล่าสุดในแอปได้ครับ');
    const result = apply(row.data);
    if ('error' in result) return refusal(row.data, result);
    if (await deps.saveJob(userId, ref.jobId, row.version, result.job)) return receipt(result.job, result);
  }
  return text('งานนี้เพิ่งถูกแก้จากอีกเครื่องครับ กรุณากดอีกครั้ง หรือบันทึกในแอป');
}

export async function handleDueAction(user: { user_id: string }, action: DueAction, deps: DuePaymentDependencies = duePaymentDependencies): Promise<LineMessage> {
  if (isSample(action.ref)) return text('นี่คือแจ้งเตือนตัวอย่างครับ ในแจ้งเตือนจริง ปุ่มนี้จะบันทึกรับเงินของงานนั้นให้ทันที');
  if (action.kind === 'later') {
    const row = await deps.loadJob(user.user_id, action.ref.jobId);
    const name = row?.data.name || 'งานนี้';
    return text(`รับทราบครับ ยังไม่บันทึกรับเงิน "${name}" ถ้ายังไม่ได้รับ พรุ่งนี้ 08:00 กระรอกจะเตือนอีกครั้ง`);
  }
  if (action.kind === 'partial') {
    if (action.ref.installmentId) return text('งานแบ่งงวดบันทึกทีละงวดครับ กด "ได้รับแล้ว" ของงวดนั้น หรือแก้ยอดในแอป');
    return text(`พิมพ์ยอดที่ได้รับต่อท้ายข้อความนี้แล้วกดส่งครับ\n${partialPrompt(action.ref)}5000`);
  }
  const today = deps.today();
  const nowIso = deps.now().toISOString();
  return record(user.user_id, action.ref, job => applyFullPayment(job, action.ref.installmentId, today, nowIso), deps);
}

/** The amount typed after "ได้ไม่ครบ": matched to the job by its short code among unpaid jobs. */
export async function handleDuePartialText(
  user: { user_id: string; jobs?: { id: string; pending?: number; installments?: unknown[] }[] },
  message: string,
  deps: DuePaymentDependencies = duePaymentDependencies,
): Promise<LineMessage | null> {
  const parsed = parsePartialText(message);
  if (!parsed) return null;
  const matches = (user.jobs || []).filter(job => (job.pending || 0) > 0 && !job.installments?.length && dueShortRef({ jobId: job.id }) === parsed.shortRef);
  if (matches.length !== 1) return text('ไม่พบงานที่ตรงกับรหัสนี้ครับ กดปุ่ม "ได้ไม่ครบ" ในแจ้งเตือนอีกครั้ง หรือบันทึกในแอป');
  const today = deps.today();
  const nowIso = deps.now().toISOString();
  return record(user.user_id, { jobId: matches[0].id }, job => applyPartialPayment(job, parsed.amount, today, nowIso), deps);
}

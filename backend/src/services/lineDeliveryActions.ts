import type { Job } from '../../../shared/types.js';
import { jobNetReceivable, roundMoney } from '../../../shared/wht.js';
import type { LineMessage } from './line.js';
import { duePaymentDependencies, type DuePaymentDependencies } from './lineDuePayments.js';

// ส่งแล้ว / ยังไม่ส่ง under each เตือนส่งงาน message (owner, 2026-11-15: "ส่งแล้วก็แค่ให้กูทักไปบอกมึงให้มึงเปลี่ยนให้ หรือแบบว่าให้มี
// ปุ่มกดยืนยัน"). ส่งแล้ว does what the Jobs page's ส่งงานแล้ว does (JobsTab markPosted): the job is delivered on its own
// delivery date, and what is still owed is worked out again. Saved through the same versioned save as the payment buttons
// (lineDuePayments.ts), so an edit made elsewhere is never overwritten. No model, no tokens.

export type DeliverKind = 'done' | 'later';
export type DeliverAction = { kind: DeliverKind; jobId: string };

const ID = '[A-Za-z0-9_.-]{1,128}';
const ACTION_RE = new RegExp(`^deliver:(done|later):(${ID})$`);

export function encodeDeliverAction(kind: DeliverKind, jobId: string): string | null {
  return new RegExp(`^${ID}$`).test(jobId) ? `deliver:${kind}:${jobId}` : null;
}

export function decodeDeliverAction(data: string): DeliverAction | null {
  const match = ACTION_RE.exec(data.trim());
  return match ? { kind: match[1] as DeliverKind, jobId: match[2] } : null;
}

type Refused = { error: 'already_delivered' };

/** "ส่งแล้ว": the fields the Jobs page saves when work is marked delivered. */
export function applyDelivered(job: Job, nowIso: string): Job | Refused {
  if (job.isPosted !== false) return { error: 'already_delivered' };
  // Recomputed on delivery, as the app does: jobs saved while in progress by older versions can carry pending 0.
  const pending = job.status === 'done' ? 0 : Math.max(0, roundMoney(jobNetReceivable(job) - (Number(job.received) || 0)));
  return { ...job, isPosted: true, pending, lastActivityAt: nowIso };
}

const baht = (amount: number) => `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
const text = (value: string): LineMessage => ({ type: 'text', text: value });

/** What a ส่งแล้ว / ยังไม่ส่ง button did, as เลขา's short reply. */
export async function handleDeliverAction(user: { user_id: string }, action: DeliverAction, deps: DuePaymentDependencies = duePaymentDependencies): Promise<LineMessage> {
  if (action.jobId.startsWith('demo-')) return text('นี่คือแจ้งเตือนตัวอย่างครับ ในแจ้งเตือนจริง ปุ่มนี้จะเปลี่ยนงานเป็นส่งแล้วให้ทันที');
  if (action.kind === 'later') return text('รับทราบครับ ถ้ายังไม่ได้ส่ง พรุ่งนี้ 08:00 ผมจะเตือนอีกครั้ง');
  const nowIso = deps.now().toISOString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await deps.loadJob(user.user_id, action.jobId);
    if (!row) return text('ไม่พบงานนี้แล้วครับ อาจถูกลบหรือย้ายไปแล้ว ดูรายการล่าสุดในแอปได้ครับ');
    const name = row.data.name || 'งานนี้';
    const result = applyDelivered(row.data, nowIso);
    if ('error' in result) return text(`"${name}" เปลี่ยนเป็นส่งแล้วไว้ก่อนแล้วครับ`);
    if (await deps.saveJob(user.user_id, action.jobId, row.version, result)) {
      return text(`เรียบร้อยครับ เปลี่ยน "${name}" เป็นส่งแล้ว${result.pending > 0 ? `\nยอดรอรับ ${baht(result.pending)} ถึงวันรับเงินแล้วผมจะเตือนให้ครับ` : ''}`);
    }
  }
  return text('งานนี้เพิ่งถูกแก้จากอีกเครื่องครับ กรุณากดอีกครั้ง หรือเปลี่ยนในแอป');
}

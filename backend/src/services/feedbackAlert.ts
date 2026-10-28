import type { FeedbackCategory } from '../../../shared/feedback.js';
import { appOrigin } from '../config/env.js';
import type { LineMessage } from './line.js';
import { adminRecipients, retryKey, type DeliveryDeps } from './adminProfitReportRun.js';

// บอกเรา (owner, 2026-10-27: "เวลาที่คนพิมพ์มามันดันไม่แจ้งเข้าระบบของแอดมินเลย"): a message only went into the
// database, and nobody was told. Now the system admins who linked LINE hear about it, the same delivery as the owner's
// other alerts, at most once an hour per conversation (a burst of replies is one message), so LINE's quota holds.

const CATEGORY: Record<FeedbackCategory, string> = { bug: 'แจ้งปัญหา', idea: 'เสนอไอเดีย', other: 'ทั่วไป' };
const PREVIEW = 120;

export interface FeedbackAlert {
  threadId: string;
  action: 'create' | 'reply';
  body: string;
  category?: FeedbackCategory;
  /** Written from an admin account: the inbox files it under ตอบแล้ว, not รอตอบ (the database's rule). */
  fromAdmin: boolean;
  now?: Date;
}

export function feedbackAlertText(alert: FeedbackAlert, origin: string): string {
  const said = alert.body.replace(/\s+/g, ' ').trim();
  const preview = said.length > PREVIEW ? `${said.slice(0, PREVIEW)}…` : said;
  return [
    alert.action === 'create' ? `แจ้งปัญหา · เรื่องใหม่${alert.category ? ` (${CATEGORY[alert.category]})` : ''}` : 'แจ้งปัญหา · ผู้ใช้ตอบกลับในเรื่องเดิม',
    `“${preview}”`,
    alert.fromAdmin ? 'ส่งจากบัญชีแอดมิน จึงอยู่ในกล่อง ตอบแล้ว' : 'อ่านและตอบได้ที่ แอดมิน › ข้อความจากผู้ใช้ › รอตอบ',
    `${origin}/adminDashboard?view=feedback`,
  ].join('\n');
}

const bangkokHour = (at: Date) => new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 13);

/** Tell the admins; never throws, never sends the same conversation twice in an hour. */
export async function alertFeedback(alert: FeedbackAlert, deps: DeliveryDeps): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const key = `feedback-alert:${alert.threadId}:${bangkokHour(alert.now ?? deps.now ?? new Date())}`;
    const recipients = await adminRecipients(deps);
    if (!recipients.length || !deps.token || !(await deps.claim(key))) return 'skipped';
    const message: LineMessage = { type: 'text', text: feedbackAlertText(alert, appOrigin()) };
    const outcomes = await Promise.all(recipients.map(recipient => deps.push(recipient.lineUserId, message, retryKey(key, recipient.userId)).catch(() => 'failed' as const)));
    return outcomes.some(outcome => outcome === 'accepted') ? 'sent' : 'failed';
  } catch (error) {
    console.warn('feedback: admin alert not sent', (error as Error)?.message);
    return 'failed';
  }
}

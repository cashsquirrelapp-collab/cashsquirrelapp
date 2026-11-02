import { appOrigin } from '../config/env.js';
import type { LineMessage } from './line.js';
import { adminRecipients, retryKey, type DeliveryDeps } from './adminProfitReportRun.js';

// Answers to a message sent to everyone (shared/broadcast.ts): the admins who linked LINE hear that answers are coming in,
// at most once every 3 hours per message, so dozens of answers cost a few LINE messages, not dozens.

const PREVIEW = 120;
const WINDOW_HOURS = 3;

export interface BroadcastAnswerAlert { broadcastId: string; reply: string; rating?: number; now?: Date }

export function broadcastAlertText(alert: BroadcastAnswerAlert, origin: string): string {
  const said = alert.reply.replace(/\s+/g, ' ').trim();
  return [
    'ข้อความถึงผู้ใช้ทุกคน · มีคำตอบใหม่',
    ...(alert.rating ? [`ให้คะแนนแอป ${alert.rating} จาก 5`] : []),
    ...(said ? [`“${said.length > PREVIEW ? `${said.slice(0, PREVIEW)}…` : said}”`] : []),
    'ดูคำตอบทั้งหมดได้ที่ แอดมิน › ส่งข้อความถึงผู้ใช้',
    `${origin}/adminDashboard?view=broadcast`,
  ].join('\n');
}

const windowKey = (at: Date) => {
  const bangkok = new Date(at.getTime() + 7 * 3600_000);
  return `${bangkok.toISOString().slice(0, 10)}T${Math.floor(bangkok.getUTCHours() / WINDOW_HOURS)}`;
};

/** Tell the admins; never throws. */
export async function alertBroadcastAnswer(alert: BroadcastAnswerAlert, deps: DeliveryDeps): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const key = `broadcast-alert:${alert.broadcastId}:${windowKey(alert.now ?? deps.now ?? new Date())}`;
    const recipients = await adminRecipients(deps);
    if (!recipients.length || !deps.token || !(await deps.claim(key))) return 'skipped';
    const message: LineMessage = { type: 'text', text: broadcastAlertText(alert, appOrigin()) };
    const outcomes = await Promise.all(recipients.map(recipient => deps.push(recipient.lineUserId, message, retryKey(key, recipient.userId)).catch(() => 'failed' as const)));
    return outcomes.some(outcome => outcome === 'accepted') ? 'sent' : 'failed';
  } catch (error) {
    console.warn('broadcast: admin alert not sent', (error as Error)?.message);
    return 'failed';
  }
}

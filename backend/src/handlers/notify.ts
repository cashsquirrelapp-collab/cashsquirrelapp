import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { HttpError } from '../http/guard.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { supabaseAdmin } from '../config/supabase.js';
import { sendLineMessagePayload } from '../services/line.js';
import { buildLineDisconnected } from '../services/lineLinkCards.js';
import { buildReminderTestMessage } from '../services/lineReminders.js';
import { hasProAccess } from '../services/vault.js';

// Authenticated notifications go only to the verified account's server-managed LINE link.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  const userId = user.id;
  const event = typeof req.body?.event === 'string' ? req.body.event : '';
  // Cached web clients may still request these receipts. Acknowledge without looking up
  // a recipient or calling LINE; chat and LIFF acknowledgements use their own verified routes.
  if (['record-added', 'record-edited', 'record-deleted', 'goal-event'].includes(event)) {
    res.status(200).json({ ok: true, skipped: 'web_record_notifications_disabled' });
    return;
  }
  await rateLimit('notify', userId, 60, 60);
  if (event === 'reminder-test') {
    // Keep test sends bounded and scoped to the authenticated account, never a body recipient.
    await rateLimit('line-reminder-test', userId, 1, 60);
    if (!(await hasProAccess(user))) throw new HttpError(402, 'การแจ้งเตือนเป็นฟีเจอร์สำหรับสมาชิก Pro', 'pro_required');
  }

  try {
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('cashflow_account_snapshot')
      .select('notif_settings')
      .eq('user_id', userId)
      .maybeSingle();
    if (rowErr) throw rowErr;

    const lineUserId = row?.notif_settings?.lineUserId as string | undefined;
    if (!lineUserId) {
      if (event === 'reminder-test') {
        res.status(409).json({ error: 'กรุณาเชื่อมต่อ LINE ของบัญชีนี้ก่อนทดสอบ' });
        return;
      }
      res.status(200).json({ ok: true, skipped: 'not_linked' });
      return;
    }

    if (event === 'reminder-test') {
      const sent = await sendLineMessagePayload(lineUserId, buildReminderTestMessage());
      res.status(sent ? 200 : 502).json(sent ? { ok: true, test: true } : { error: 'ส่งไม่สำเร็จ กรุณาตรวจว่าเพิ่มเพื่อนและไม่ได้บล็อก LINE กระรอกตุนเงิน' });
      return;
    }

    if (event === 'line-disconnected') {
      // Older clients may still ask for this; the disconnect itself now sends the same card.
      const sent = await sendLineMessagePayload(lineUserId, buildLineDisconnected());
      res.status(sent ? 200 : 502).json(sent ? { ok: true } : { error: 'LINE rejected the notification' });
      return;
    }

    res.status(400).json({ error: 'Unknown event' });
  } catch (err: any) {
    console.error('Notification failed', { event, type: err instanceof Error ? err.name : 'UnknownError' });
    res.status(500).json({ error: 'แจ้งเตือนไม่สำเร็จ กรุณาลองใหม่' });
  }
}

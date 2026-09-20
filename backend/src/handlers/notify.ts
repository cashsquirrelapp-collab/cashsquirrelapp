import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { supabaseAdmin } from '../config/supabase.js';
import {
  buildGoalCreatedMessage,
  buildGoalTransactionMessage,
  buildGoalTransactionDeletedMessage,
  buildJobSavedMessage,
  buildExpenseSavedMessage,
  buildJobDeletedMessage,
  buildExpenseDeletedMessage,
  buildJobEditedMessage,
  JobCardData,
} from '../services/lineAssistant.js';
import { sendLineMessage, sendLineMessagePayload } from '../services/line.js';
import type { Expense } from '../../../shared/types.js';

// Authenticated notifications go only to the verified account's server-managed LINE link.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await requireUser(req, res);
  const userId = user.id;
  await rateLimit('notify', userId, 60, 60);

  const event = typeof req.body?.event === 'string' ? req.body.event : '';

  try {
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('cashflow_account_snapshot')
      .select('notif_settings')
      .eq('user_id', userId)
      .maybeSingle();
    if (rowErr) throw rowErr;

    const lineUserId = row?.notif_settings?.lineUserId as string | undefined;
    if (!lineUserId) {
      res.status(200).json({ ok: true, skipped: 'not_linked' });
      return;
    }

    const body = req.body || {};

    if (event === 'line-disconnected') {
      const sent = await sendLineMessage(
        lineUserId,
        '🔌 ยกเลิกการเชื่อมต่อ LINE กับกระรอกตุนเงินแล้วครับ\nจะไม่มีการแจ้งเตือนส่งเข้าช่องทางนี้อีก หากต้องการเชื่อมต่อใหม่ ไปที่หน้าตั้งค่าในแอปได้เลยครับ'
      );
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'goal-event') {
      let message;
      if (body.kind === 'created' && body.goal && typeof body.goal.name === 'string') {
        message = buildGoalCreatedMessage(body.goal);
      } else if ((body.kind === 'deposit' || body.kind === 'withdraw') && body.goal && body.tx) {
        message = buildGoalTransactionMessage(body.goal, { ...body.tx, type: body.kind });
      } else if (body.kind === 'transaction-deleted' && body.goal && body.tx) {
        message = buildGoalTransactionDeletedMessage(body.goal, body.tx);
      } else {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'record-added') {
      const monthNet = typeof body.monthNet === 'number' ? body.monthNet : undefined;
      let message;
      if (body.kind === 'expense' && body.record) {
        message = buildExpenseSavedMessage(body.record as Expense, monthNet);
      } else if (body.kind === 'job' && body.record) {
        message = buildJobSavedMessage(body.record as JobCardData, monthNet);
      } else {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'record-edited') {
      const monthNet = typeof body.monthNet === 'number' ? body.monthNet : undefined;
      if (body.kind !== 'job' || !body.record || typeof body.record.name !== 'string') {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const message = buildJobEditedMessage(body.record as JobCardData, monthNet);
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'record-deleted') {
      const monthNet = typeof body.monthNet === 'number' ? body.monthNet : undefined;
      let message;
      if (body.kind === 'expense' && body.record && typeof body.record.name === 'string') {
        message = buildExpenseDeletedMessage(body.record, monthNet);
      } else if (body.kind === 'job' && body.record && typeof body.record.name === 'string') {
        message = buildJobDeletedMessage(body.record, monthNet);
      } else {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    res.status(400).json({ error: 'Unknown event' });
  } catch (err: any) {
    console.error('Notification failed', { event, type: err instanceof Error ? err.name : 'UnknownError' });
    res.status(500).json({ error: 'แจ้งเตือนไม่สำเร็จ กรุณาลองใหม่' });
  }
}

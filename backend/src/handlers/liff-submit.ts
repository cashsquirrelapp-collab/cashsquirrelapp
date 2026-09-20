import { z } from 'zod';
import { isProUser } from '../services/lineAssistant.js';
import { rateLimit } from '../security/rateLimit.js';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import {
  findUserByLineId,
  buildJobFromDraft,
  persistJob,
  buildJobSavedMessage,
  buildExpenseFromDraft,
  persistExpense,
  buildExpenseSavedMessage,
  computeMonthNetForUser,
  JobDraft,
  ExpenseDraft,
} from '../services/lineAssistant.js';
import { sendLineMessagePayload } from '../services/line.js';

// Verifies the ID token the LIFF page got from liff.getIDToken() against LINE's own endpoint --
// never trust a userId sent directly by the client, since anyone could just type a different one
// into the request body. The signature check + audience (client_id) match here is what proves
// this request really came from that LINE user's LIFF session.
async function verifyLiffIdToken(idToken: string): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) return null;
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) {
      console.error('LINE token verification rejected', { status: res.status });
      return null;
    }
    const data = await res.json();
    return typeof data.sub === 'string' ? data.sub : null;
  } catch (err) {
    console.error('verifyLiffIdToken error:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!idToken || idToken.length > 8192) {
    res.status(400).json({ error: 'ไม่พบข้อมูลยืนยันตัวตนจาก LINE' });
    return;
  }

  const lineUserId = await verifyLiffIdToken(idToken);
  if (!lineUserId) {
    res.status(401).json({ error: 'ยืนยันตัวตนไม่สำเร็จ กรุณาลองเปิดฟอร์มใหม่อีกครั้ง' });
    return;
  }

  let user;
  try {
    user = await findUserByLineId(lineUserId);
  } catch (err) {
    console.error('liff-submit: findUserByLineId failed:', err);
    res.status(500).json({ error: 'ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้งครับ' });
    return;
  }
  if (!user) {
    res.status(404).json({ error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับแอปกระรอกตุนเงิน กรุณาเชื่อมต่อในแอปก่อน' });
    return;
  }

  try {
    const requestId=z.uuid().safeParse(body.requestId);
    if(!requestId.success){res.status(400).json({error:'รหัสคำขอไม่ถูกต้อง กรุณาเปิดฟอร์มใหม่'});return;}
    user.operationId=requestId.data;
    await rateLimit('liff-submit', user.user_id, 30, 60);
    if (!await isProUser(user.user_id)) { res.status(403).json({ error: 'ฟีเจอร์นี้ต้องใช้แพ็กเกจ Pro หรือช่วงทดลองใช้งาน' }); return; }
    if (!['job','expense'].includes(body.kind)) { res.status(400).json({ error: 'ประเภทข้อมูลไม่ถูกต้อง' }); return; }
    if (body.kind === 'expense') {
      const draft: ExpenseDraft = {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        category: typeof body.category === 'string' ? body.category : '',
        amount: Number(body.amount) || 0,
      };
      if (!draft.name || !Number.isFinite(draft.amount) || (draft.amount ?? 0) <= 0 || draft.name.length > 500) {
        res.status(400).json({ error: 'กรุณากรอกชื่อรายการและจำนวนเงินให้ครบถ้วน' });
        return;
      }
      const expense = buildExpenseFromDraft(draft);
      const ok = await persistExpense(user, expense);
      if (!ok) {
        res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
        return;
      }
      await sendLineMessagePayload(lineUserId, buildExpenseSavedMessage(expense, computeMonthNetForUser(user, undefined, expense)));
      res.status(200).json({ ok: true });
      return;
    }

    const draft: JobDraft = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      client: typeof body.client === 'string' ? body.client.trim() : '',
      type: typeof body.type === 'string' ? body.type : undefined,
      value: Number(body.value) || 0,
      creditTerm: Number(body.creditTerm) || 0,
      whtRate: Number(body.whtRate) || 0,
      paymentStatus: typeof body.paymentStatus === 'string' ? body.paymentStatus : 'pending',
      receivedAmount: body.receivedAmount != null ? Number(body.receivedAmount) : undefined,
    };
    if (!draft.name || !Number.isFinite(draft.value) || (draft.value ?? 0) <= 0 || draft.name.length > 500) {
      res.status(400).json({ error: 'กรุณากรอกชื่องานและมูลค่างานให้ครบถ้วน' });
      return;
    }
    if (!Number.isInteger(draft.creditTerm) || (draft.creditTerm ?? 0) < 0 || (draft.creditTerm ?? 0) > 3650 || !Number.isFinite(draft.whtRate) || (draft.whtRate ?? 0) < 0 || (draft.whtRate ?? 0) > 100 || (draft.receivedAmount != null && (!Number.isFinite(draft.receivedAmount) || draft.receivedAmount < 0 || draft.receivedAmount > (draft.value ?? 0)))) {res.status(400).json({error:'จำนวนเงิน ภาษี หรือเครดิตเทอมไม่ถูกต้อง'});return;}
    const job = buildJobFromDraft(draft);
    const ok = await persistJob(user, job);
    if (!ok) {
      res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return;
    }
    await sendLineMessagePayload(lineUserId, buildJobSavedMessage(job, computeMonthNetForUser(user, job)));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('liff-submit handler error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ' });
  }
}

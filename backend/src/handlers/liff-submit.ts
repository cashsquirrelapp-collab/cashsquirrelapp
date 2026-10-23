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
  UserRow,
  clearJobDraft,
  clearExpenseDraft,
} from '../services/lineAssistant.js';
import { sendLineMessagePayload } from '../services/line.js';
import { checkLinkedAccountWriteAccess } from '../services/linkedAccountAccess.js';
import { lineDraftKey, lineDraftOperationId } from '../services/lineDraftReview.js';
import { isActiveLineDraft } from '../services/lineDraftState.js';
import { isValidWhtRate, roundMoney, whtAmountFor } from '../../../shared/wht.js';

import { verifyLiffIdToken } from '../security/lineIdentity.js';

export interface LiffSubmitDependencies {
  verifyLiffIdToken: typeof verifyLiffIdToken;
  findUserByLineId: typeof findUserByLineId;
  checkLinkedAccountWriteAccess: typeof checkLinkedAccountWriteAccess;
  rateLimit: typeof rateLimit;
  isProUser: typeof isProUser;
  buildJobFromDraft: typeof buildJobFromDraft;
  persistJob: typeof persistJob;
  buildJobSavedMessage: typeof buildJobSavedMessage;
  buildExpenseFromDraft: typeof buildExpenseFromDraft;
  persistExpense: typeof persistExpense;
  buildExpenseSavedMessage: typeof buildExpenseSavedMessage;
  computeMonthNetForUser: typeof computeMonthNetForUser;
  sendLineMessagePayload: typeof sendLineMessagePayload;
  clearJobDraft?: typeof clearJobDraft;
  clearExpenseDraft?: typeof clearExpenseDraft;
}

const defaultDependencies: LiffSubmitDependencies = {
  verifyLiffIdToken,
  findUserByLineId,
  checkLinkedAccountWriteAccess,
  rateLimit,
  isProUser,
  buildJobFromDraft,
  persistJob,
  buildJobSavedMessage,
  buildExpenseFromDraft,
  persistExpense,
  buildExpenseSavedMessage,
  computeMonthNetForUser,
  sendLineMessagePayload,
  clearJobDraft,
  clearExpenseDraft,
};

const editedNumber = (schema: z.ZodType<number>) => z.preprocess(value => {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return value;
}, schema);
const cents = (value: number) => value === roundMoney(value);
const editedMoney = editedNumber(z.number().finite().positive().max(1_000_000_000_000).refine(cents));
const editedName = z.string().trim().min(1).max(500);
const editedText = z.string().max(10000);
const editedExpense = z.object({
  name: editedName, amount: editedMoney, category: editedText.optional(), note: editedText.optional(),
});
const editedJob = z.object({
  name: editedName, value: editedMoney, client: editedText.transform(value => value.trim()).optional(),
  type: editedText.optional(), note: editedText.optional(),
  creditTerm: editedNumber(z.number().finite().int().min(0).max(3650)).default(0),
  whtRate: editedNumber(z.number().finite().refine(isValidWhtRate)).default(0),
  paymentStatus: z.enum(['pending', 'paid', 'partial']),
  receivedAmount: editedNumber(z.number().finite().min(0).max(1_000_000_000_000).refine(cents)).optional(),
}).superRefine((draft, context) => {
  const net = Math.max(0, roundMoney(draft.value - whtAmountFor(draft.value, draft.whtRate)));
  if (draft.paymentStatus === 'partial'
    && (draft.receivedAmount === undefined || draft.receivedAmount <= 0 || draft.receivedAmount >= net)) {
    context.addIssue({ code: 'custom', path: ['receivedAmount'], message: 'มัดจำต้องมากกว่า 0 และน้อยกว่ายอดสุทธิหลังหักภาษี' });
  }
  if (draft.receivedAmount !== undefined && draft.receivedAmount > net) {
    context.addIssue({ code: 'custom', path: ['receivedAmount'], message: 'ยอดที่ได้รับเกินยอดสุทธิหลังหักภาษี' });
  }
  if (draft.paymentStatus === 'pending' && (draft.receivedAmount || 0) !== 0) {
    context.addIssue({ code: 'custom', path: ['receivedAmount'], message: 'สถานะยังไม่ได้รับเงินต้องไม่มียอดรับแล้ว' });
  }
});

async function handleDraftEditor(
  body: Record<string, unknown>, user: UserRow, lineUserId: string,
  res: VercelResponse, dependencies: LiffSubmitDependencies,
): Promise<void> {
  const kind = body.draftKind;
  const key = body.draftKey;
  if ((kind !== 'job' && kind !== 'expense') || typeof key !== 'string' || !/^[a-f0-9]{16}$/.test(key)) {
    res.status(409).json({ error: 'รายการนี้ไม่พร้อมแก้ไข กรุณาเปิดจากการ์ดล่าสุด' }); return;
  }
  const state = user.notif_settings || {};
  const stored = kind === 'job' ? state.pendingJobDraft : state.pendingExpenseDraft;
  if (!stored || !isActiveLineDraft(kind, stored, state) || lineDraftKey(kind, stored) !== key) {
    res.status(409).json({ error: 'รายการนี้หมดอายุ บันทึกแล้ว หรือมีร่างใหม่ กรุณาเปิดจากการ์ดล่าสุด' }); return;
  }
  if (body.action === 'load-draft') {
    res.status(200).json({ ok: true, kind, draft: stored.draft, createdAt: stored.createdAt }); return;
  }
  if (body.kind !== kind) {
    res.status(400).json({ error: 'ไม่สามารถเปลี่ยนประเภทรายการของร่างนี้ได้' }); return;
  }
  if (!z.uuid().safeParse(body.requestId).success) {
    res.status(400).json({ error: 'รหัสคำขอไม่ถูกต้อง กรุณาเปิดฟอร์มใหม่' }); return;
  }
  // Omitted optional fields retain the reviewed draft, while only schema-approved fields
  // enter the financial record. Identity/ownership always come from the verified LINE user.
  const parsed = (kind === 'job' ? editedJob : editedExpense).safeParse({ ...stored.draft, ...body });
  if (!parsed.success) {
    res.status(400).json({ error: 'กรุณาตรวจชื่อรายการ จำนวนเงิน สถานะการรับเงิน ภาษี และเครดิตเทอม' }); return;
  }
  user.operationId = lineDraftOperationId(kind, stored);
  user.lastWriteWasDuplicate = false;
  const record = kind === 'job'
    ? dependencies.buildJobFromDraft(parsed.data as JobDraft)
    : dependencies.buildExpenseFromDraft(parsed.data as ExpenseDraft);
  const saved = kind === 'job'
    ? await dependencies.persistJob(user, record as ReturnType<typeof buildJobFromDraft>)
    : await dependencies.persistExpense(user, record as ReturnType<typeof buildExpenseFromDraft>);
  if (!saved) {
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' }); return;
  }

  // Saving the record is the commit point. Resolution and notifications must never report
  // a save failure afterwards, because retrying with a new request could mislead the user.
  try {
    if (kind === 'job') await (dependencies.clearJobDraft ?? clearJobDraft)(user);
    else await (dependencies.clearExpenseDraft ?? clearExpenseDraft)(user);
  } catch { console.error('liff-submit: saved draft resolution failed'); }
  const duplicate = Boolean(user.lastWriteWasDuplicate);
  let notificationSent = false;
  if (!duplicate) {
    try {
      const message = kind === 'job'
        ? dependencies.buildJobSavedMessage(record as ReturnType<typeof buildJobFromDraft>, dependencies.computeMonthNetForUser(user, record as ReturnType<typeof buildJobFromDraft>))
        : dependencies.buildExpenseSavedMessage(record as ReturnType<typeof buildExpenseFromDraft>, dependencies.computeMonthNetForUser(user, undefined, record as ReturnType<typeof buildExpenseFromDraft>));
      notificationSent = await dependencies.sendLineMessagePayload(lineUserId, message);
    } catch { console.error('liff-submit: saved draft notification failed'); }
  }
  res.status(200).json({ ok: true, ...(duplicate ? { duplicate: true } : {}), notificationSent });
}

export async function handleLiffSubmit(
  req: VercelRequest,
  res: VercelResponse,
  dependencies: LiffSubmitDependencies = defaultDependencies,
) {
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

  const lineUserId = await dependencies.verifyLiffIdToken(idToken);
  if (!lineUserId) {
    res.status(401).json({ error: 'ยืนยันตัวตนไม่สำเร็จ กรุณาลองเปิดฟอร์มใหม่อีกครั้ง' });
    return;
  }

  let user;
  try {
    user = await dependencies.findUserByLineId(lineUserId);
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
    const access = await dependencies.checkLinkedAccountWriteAccess(user.user_id);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
  } catch (err) {
    console.error('liff-submit: account lifecycle lookup failed:', err);
    res.status(503).json({ error: 'ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่อีกครั้ง' });
    return;
  }

  try {
    if (body.action !== undefined) {
      if (body.action !== 'load-draft' && body.action !== 'confirm-draft') {
        res.status(400).json({ error: 'คำสั่งไม่ถูกต้อง' }); return;
      }
      await dependencies.rateLimit('liff-submit', user.user_id, 30, 60);
      if (!await dependencies.isProUser(user.user_id)) {
        res.status(403).json({ error: 'ฟีเจอร์นี้ต้องใช้แพ็กเกจ Pro หรือช่วงทดลองใช้งาน' }); return;
      }
      await handleDraftEditor(body, user, lineUserId, res, dependencies);
      return;
    }
    const requestId=z.uuid().safeParse(body.requestId);
    if(!requestId.success){res.status(400).json({error:'รหัสคำขอไม่ถูกต้อง กรุณาเปิดฟอร์มใหม่'});return;}
    user.operationId=requestId.data;
    await dependencies.rateLimit('liff-submit', user.user_id, 30, 60);
    if (!await dependencies.isProUser(user.user_id)) { res.status(403).json({ error: 'ฟีเจอร์นี้ต้องใช้แพ็กเกจ Pro หรือช่วงทดลองใช้งาน' }); return; }
    if (!['job','expense'].includes(body.kind)) { res.status(400).json({ error: 'ประเภทข้อมูลไม่ถูกต้อง' }); return; }
    if (body.kind === 'expense') {
      const draft: ExpenseDraft = {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        category: typeof body.category === 'string' ? body.category : '',
        amount: Number(body.amount) || 0,
        note: typeof body.note === 'string' ? body.note : '',
      };
      if (!draft.name || !Number.isFinite(draft.amount) || (draft.amount ?? 0) <= 0 || draft.name.length > 500) {
        res.status(400).json({ error: 'กรุณากรอกชื่อรายการและจำนวนเงินให้ครบถ้วน' });
        return;
      }
      const expense = dependencies.buildExpenseFromDraft(draft);
      const ok = await dependencies.persistExpense(user, expense);
      if (!ok) {
        res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
        return;
      }
      await dependencies.sendLineMessagePayload(lineUserId, dependencies.buildExpenseSavedMessage(expense, dependencies.computeMonthNetForUser(user, undefined, expense)));
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
      note: typeof body.note === 'string' ? body.note : '',
    };
    if (!draft.name || !Number.isFinite(draft.value) || (draft.value ?? 0) <= 0 || draft.name.length > 500) {
      res.status(400).json({ error: 'กรุณากรอกชื่องานและมูลค่างานให้ครบถ้วน' });
      return;
    }
    if (!Number.isInteger(draft.creditTerm) || (draft.creditTerm ?? 0) < 0 || (draft.creditTerm ?? 0) > 3650 || !Number.isFinite(draft.whtRate) || (draft.whtRate ?? 0) < 0 || (draft.whtRate ?? 0) > 100 || (draft.receivedAmount != null && (!Number.isFinite(draft.receivedAmount) || draft.receivedAmount < 0 || draft.receivedAmount > (draft.value ?? 0)))) {res.status(400).json({error:'จำนวนเงิน ภาษี หรือเครดิตเทอมไม่ถูกต้อง'});return;}
    const job = dependencies.buildJobFromDraft(draft);
    const ok = await dependencies.persistJob(user, job);
    if (!ok) {
      res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return;
    }
    await dependencies.sendLineMessagePayload(lineUserId, dependencies.buildJobSavedMessage(job, dependencies.computeMonthNetForUser(user, job)));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('liff-submit handler error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ' });
  }
}

export function createLiffSubmitHandler(overrides: Partial<LiffSubmitDependencies> = {}) {
  const dependencies: LiffSubmitDependencies = { ...defaultDependencies, ...overrides };
  return (req: VercelRequest, res: VercelResponse) => handleLiffSubmit(req, res, dependencies);
}

export default createLiffSubmitHandler();

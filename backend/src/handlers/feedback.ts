import { z } from 'zod';
import {
  feedbackActionSchema, feedbackBoxSchema, feedbackKindSchema, feedbackStatusSchema,
  type FeedbackAdminListResponse, type FeedbackOwnerPlan,
} from '../../../shared/feedback.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';

const pageSchema = z.coerce.number().int().min(0).max(10000).default(0);
const listSchema = z.object({
  route: z.literal('feedback').optional(),
  scope: z.enum(['mine', 'admin']).default('mine'),
  status: feedbackStatusSchema.optional(),
  page: pageSchema,
}).strict();
const detailSchema = z.object({ route: z.literal('feedback').optional(), threadId: z.uuid(), page: pageSchema }).strict();
const adminListSchema = z.object({
  route: z.literal('feedback').optional(),
  scope: z.literal('admin'),
  box: feedbackBoxSchema,
  category: feedbackKindSchema.optional(),
  page: pageSchema,
}).strict();

const FREE_TRIAL_DAYS = 14;
type SubscriptionRow = { user_id: string; status: string | null; plan: string | null; current_period_end: string | null };
/** The same plan rule as the admin accounts list (handlers/admin-users.ts). */
function ownerPlan(subscription: SubscriptionRow | undefined, createdAt: string | null | undefined, now: number): FeedbackOwnerPlan {
  if (['admin_revoked', 'admin_removed'].includes(subscription?.plan || '')) return 'revoked';
  if (subscription?.status === 'active' && subscription.plan === 'admin_grant') return 'admin';
  if (subscription?.status === 'active' && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now) return 'paid';
  if (createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > now) return 'trial';
  return 'none';
}

export function feedbackDbError(error: { code?: string; message?: string }): never {
  if (error.code === '42501') throw new HttpError(403, 'คุณไม่มีสิทธิ์ทำรายการนี้');
  // PostgREST: the function does not exist yet (database/feedback_admin_inbox.sql was not run).
  if (error.code === 'PGRST202') throw new HttpError(503, 'กล่องข้อความแบบใหม่ต้องอัปเดตฐานข้อมูลก่อน (feedback_admin_inbox.sql)');
  if (error.code === 'P0002') throw new HttpError(404, 'ไม่พบข้อความที่เข้าถึงได้');
  if (error.code === '22023' || error.code === '23514' || error.code === '22P02') {
    throw new HttpError(400, 'ข้อมูลข้อความไม่ถูกต้อง');
  }
  if (error.code === 'P0001') {
    if (['feedback_create_rate_limit', 'feedback_message_rate_limit'].includes(error.message || '')) {
      throw new HttpError(429, 'ส่งข้อความบ่อยเกินไป กรุณารอสักครู่');
    }
    if (error.message === 'feedback_thread_limit') throw new HttpError(409, 'ถึงจำนวนเรื่องสูงสุดแล้ว กรุณาตอบกลับเรื่องเดิม');
    if (error.message === 'feedback_message_limit') throw new HttpError(409, 'เรื่องนี้มีข้อความครบจำนวนแล้ว กรุณาสร้างเรื่องใหม่');
  }
  throw error;
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const db = getSupabaseAdmin();

  if (req.method === 'GET') {
    await rateLimit('feedback-read', user.id, 90, 60);
    if (req.query.threadId !== undefined) {
      const query = detailSchema.safeParse(req.query);
      if (!query.success) throw new HttpError(400, 'รหัสเรื่องหรือหน้าข้อความไม่ถูกต้อง');
      const result = await db.rpc('cashflow_feedback_detail', {
        p_actor: user.id, p_thread_id: query.data.threadId, p_page: query.data.page,
      });
      if (result.error) feedbackDbError(result.error);
      res.json(result.data);
      return;
    }
    if (req.query.box !== undefined) {
      const query = adminListSchema.safeParse(req.query);
      if (!query.success) throw new HttpError(400, 'ตัวกรองข้อความไม่ถูกต้อง');
      if (await systemRole(user.id) !== 'admin') throw new HttpError(403, 'เฉพาะแอดมินเท่านั้น');
      const result = await db.rpc('cashflow_feedback_admin_list', {
        p_actor: user.id, p_box: query.data.box, p_category: query.data.category ?? null, p_page: query.data.page,
      });
      if (result.error) feedbackDbError(result.error);
      const inbox = result.data as FeedbackAdminListResponse;
      const ownerIds = [...new Set(inbox.threads.map(thread => thread.ownerId))];
      let plans = new Map<string, FeedbackOwnerPlan>();
      if (ownerIds.length) {
        const [profiles, subscriptions] = await Promise.all([
          db.from('cashflow_profiles').select('user_id,created_at').in('user_id', ownerIds),
          db.from('subscriptions').select('user_id,status,plan,current_period_end').in('user_id', ownerIds),
        ]);
        // The plan is context only: if it cannot be read, the inbox still loads without it.
        if (!profiles.error && !subscriptions.error) {
          const created = new Map((profiles.data || []).map(row => [row.user_id as string, row.created_at as string | null]));
          const subs = new Map((subscriptions.data as SubscriptionRow[] || []).map(row => [row.user_id, row]));
          const now = Date.now();
          plans = new Map(ownerIds.map(id => [id, ownerPlan(subs.get(id), created.get(id), now)]));
        }
      }
      res.json({ ...inbox, threads: inbox.threads.map(thread => ({ ...thread, ownerPlan: plans.get(thread.ownerId) ?? null })) });
      return;
    }
    const query = listSchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'ตัวกรองข้อความไม่ถูกต้อง');
    if (query.data.scope === 'admin' && await systemRole(user.id) !== 'admin') {
      throw new HttpError(403, 'เฉพาะแอดมินเท่านั้น');
    }
    const result = await db.rpc('cashflow_feedback_list', {
      p_actor: user.id, p_scope: query.data.scope, p_status: query.data.status ?? null, p_page: query.data.page,
    });
    if (result.error) feedbackDbError(result.error);
    res.json(result.data);
    return;
  }

  const parsed = feedbackActionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณากรอกข้อความ 1–4,000 ตัวอักษรและข้อมูลให้ถูกต้อง');
  const { action, ...input } = parsed.data;
  if (action === 'status' && await systemRole(user.id) !== 'admin') {
    throw new HttpError(403, 'เฉพาะแอดมินเท่านั้น');
  }
  await rateLimit('feedback-write', user.id, 30, 60);
  if (action === 'create') await rateLimit('feedback-create', user.id, 10, 3600);
  if (action === 'create' || action === 'reply') await rateLimit('feedback-message', user.id, 60, 3600);
  // Both ownership and current admin role are checked again inside the SQL RPC.
  // Actor and sender role can never come from browser-supplied data.
  const result = await db.rpc('cashflow_feedback_mutate', {
    p_actor: user.id, p_action: action, p_input: input,
  });
  if (result.error) feedbackDbError(result.error);
  res.status(action === 'create' ? 201 : 200).json(result.data);
}, { csrf: true });

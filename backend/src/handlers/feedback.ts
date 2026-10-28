import { inFreeTrial } from '../../../shared/trial.js';
import { z } from 'zod';
import {
  feedbackActionSchema, feedbackBoxSchema, feedbackKindSchema, feedbackStatusSchema,
  type FeedbackAdminListResponse, type FeedbackAdminThread, type FeedbackBox, type FeedbackKind, type FeedbackOwnerPlan,
} from '../../../shared/feedback.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { alertFeedback } from '../services/feedbackAlert.js';
import { ownerDeliveryDeps } from '../services/ownerAlerts.js';

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

type SubscriptionRow = { user_id: string; status: string | null; plan: string | null; current_period_end: string | null };
/** The same plan rule as the admin accounts list (handlers/admin-users.ts). */
function ownerPlan(subscription: SubscriptionRow | undefined, createdAt: string | null | undefined, now: number): FeedbackOwnerPlan {
  if (['admin_revoked', 'admin_removed'].includes(subscription?.plan || '')) return 'revoked';
  if (subscription?.status === 'active' && subscription.plan === 'admin_grant') return 'admin';
  if (subscription?.status === 'active' && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now) return 'paid';
  if (inFreeTrial(createdAt, now)) return 'trial';
  return 'none';
}

// The admin inbox without database/feedback_admin_inbox.sql (owner, 2026-10-28: the users' messages did not show).
// That file only adds cashflow_feedback_admin_list; until it runs, the same list is worked out here from the tables
// feedback_phase_one.sql made, with the same boxes, order and page size. Admin role is checked before this is called.
export type InboxThreadRow = { id: string; owner_id: string; category: string | null; status: string; preview: string; created_at: string; updated_at: string;
  last_message_at: string; last_sender_role: string; message_count: number };
export type InboxMessageRow = { thread_id: string; sender_role: string; created_at: string };
const INBOX_PAGE = 20;
export function adminInboxFromRows(threads: InboxThreadRow[], messages: InboxMessageRow[], profiles: { user_id: string; display_name: string | null; public_id: string | null }[],
  box: FeedbackBox, category: FeedbackKind | null, page: number): Omit<FeedbackAdminListResponse, 'threads'> & { threads: Omit<FeedbackAdminThread, 'ownerPlan'>[] } {
  const boxOf = (row: InboxThreadRow): FeedbackBox => (row.status === 'resolved' ? 'resolved' : row.last_sender_role === 'user' ? 'waiting' : 'replied');
  const kindOf = (row: InboxThreadRow): FeedbackKind => (row.category === 'bug' || row.category === 'idea' ? row.category : 'general');
  const inBox = threads.filter(row => boxOf(row) === box);
  const filtered = inBox.filter(row => !category || kindOf(row) === category);
  // How long the user has waited: their first message after the team's latest reply.
  const waitingSince = (row: InboxThreadRow): string | null => {
    if (box !== 'waiting') return null;
    const own = messages.filter(message => message.thread_id === row.id);
    const lastAdmin = own.filter(message => message.sender_role === 'admin').map(message => message.created_at).sort().at(-1) ?? '';
    return own.filter(message => message.sender_role === 'user' && message.created_at > lastAdmin).map(message => message.created_at).sort()[0] ?? row.last_message_at;
  };
  const time = (value: string | null) => (value ? Date.parse(value) : 0);
  const ranked = filtered.map(row => ({ row, since: waitingSince(row) })).sort((a, b) => box === 'resolved'
    ? time(b.row.last_message_at) - time(a.row.last_message_at) || a.row.id.localeCompare(b.row.id)
    : time(a.since ?? a.row.last_message_at) - time(b.since ?? b.row.last_message_at) || a.row.id.localeCompare(b.row.id));
  const names = new Map(profiles.map(profile => [profile.user_id, profile]));
  const perOwner = new Map<string, number>();
  for (const row of threads) perOwner.set(row.owner_id, (perOwner.get(row.owner_id) ?? 0) + 1);
  const count = <T extends string>(rows: InboxThreadRow[], of: (row: InboxThreadRow) => T, keys: T[]) =>
    Object.fromEntries(keys.map(key => [key, rows.filter(row => of(row) === key).length])) as Record<T, number>;
  return {
    threads: ranked.slice(page * INBOX_PAGE, page * INBOX_PAGE + INBOX_PAGE).map(({ row, since }) => ({
      id: row.id, ownerId: row.owner_id, ownerName: names.get(row.owner_id)?.display_name ?? null, ownerPublicId: names.get(row.owner_id)?.public_id ?? null,
      category: row.category as FeedbackAdminThread['category'], status: row.status as FeedbackAdminThread['status'], preview: row.preview,
      createdAt: row.created_at, updatedAt: row.updated_at, lastMessageAt: row.last_message_at, lastSenderRole: row.last_sender_role as FeedbackAdminThread['lastSenderRole'],
      messageCount: row.message_count, waitingSince: since, ownerThreadCount: perOwner.get(row.owner_id) ?? 1,
    })),
    hasMore: ranked.length > page * INBOX_PAGE + INBOX_PAGE, page, pageSize: INBOX_PAGE,
    counts: count(threads, boxOf, ['waiting', 'replied', 'resolved']),
    kinds: count(inBox, kindOf, ['bug', 'idea', 'general']),
  };
}

async function adminInboxWithoutFunction(db: ReturnType<typeof getSupabaseAdmin>, box: FeedbackBox, category: FeedbackKind | null, page: number) {
  const threads = await db.from('cashflow_feedback_threads')
    .select('id,owner_id,category,status,preview,created_at,updated_at,last_message_at,last_sender_role,message_count').limit(5000);
  if (threads.error) throw threads.error;
  const rows = (threads.data ?? []) as InboxThreadRow[];
  const waitingIds = box === 'waiting' ? rows.filter(row => row.status !== 'resolved' && row.last_sender_role === 'user').map(row => row.id) : [];
  const messages: InboxMessageRow[] = [];
  for (let at = 0; at < waitingIds.length; at += 200) {
    const part = await db.from('cashflow_feedback_messages').select('thread_id,sender_role,created_at').in('thread_id', waitingIds.slice(at, at + 200)).limit(20000);
    if (part.error) throw part.error;
    messages.push(...((part.data ?? []) as InboxMessageRow[]));
  }
  const ownerIds = [...new Set(rows.map(row => row.owner_id))];
  const profiles = ownerIds.length ? await db.from('cashflow_profiles').select('user_id,display_name,public_id').in('user_id', ownerIds.slice(0, 1000)) : { data: [], error: null };
  return adminInboxFromRows(rows, messages, profiles.error ? [] : (profiles.data ?? []) as { user_id: string; display_name: string | null; public_id: string | null }[], box, category, page);
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
      // Without the inbox function (feedback_admin_inbox.sql not run yet) the same list comes from the tables.
      if (result.error && result.error.code !== 'PGRST202') feedbackDbError(result.error);
      const inbox = (result.error
        ? await adminInboxWithoutFunction(db, query.data.box, query.data.category ?? null, query.data.page)
        : result.data) as FeedbackAdminListResponse;
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
  // The admins hear about a new message (owner, 2026-10-27): a new conversation from anyone, or a reply from its owner;
  // an admin answering a member is the team's own word. Waited for briefly, and never fails the message.
  if (action === 'create' || action === 'reply') {
    const fromAdmin = await systemRole(user.id).then(role => role === 'admin').catch(() => false);
    if (action === 'create' || !fromAdmin) {
      const threadId = (result.data as { threadId?: string } | null)?.threadId ?? ('threadId' in input ? String(input.threadId) : '');
      const body = 'body' in input ? input.body : '';
      if (threadId && body) {
        const alert = alertFeedback({ threadId, action, body, ...('category' in input && input.category ? { category: input.category } : {}), fromAdmin }, ownerDeliveryDeps());
        await Promise.race([alert, new Promise(resolve => setTimeout(resolve, 2500))]);
      }
    }
  }
  res.status(action === 'create' ? 201 : 200).json(result.data);
}, { csrf: true });

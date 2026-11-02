import { randomUUID } from 'node:crypto';
import {
  activeBroadcast, broadcastAdminActionSchema, broadcastFor, broadcastReplyBody, broadcastResult, broadcastUserActionSchema,
  readAnswers, readBroadcasts, withAnswer, withEndedBroadcast, withNewBroadcast,
  type AdminBroadcastResponse, type Broadcast, type BroadcastAnswer,
} from '../../../shared/broadcast.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { patchPrivate } from '../repositories/accounts.js';
import { systemRole } from '../repositories/roles.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { alertBroadcastAnswer } from '../services/broadcastAlert.js';
import { ownerDeliveryDeps } from '../services/ownerAlerts.js';

// A message from the team to everyone, and the answers (shared/broadcast.ts). GET: the message this account should see
// (or, with ?scope=admin, every message sent with its answers, for the owner). POST: seen / dismiss / answer from an
// account; send / end from the owner.

type Db = ReturnType<typeof getSupabaseAdmin>;

// Every app start asks; the list changes only when the owner sends or stops one, so it is kept briefly in memory.
let cached: { at: number; list: Broadcast[] } | null = null;
const CACHE_MS = 30_000;

async function sentBroadcasts(db: Db, fresh = false): Promise<Broadcast[]> {
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.list;
  const roles = await db.from('cashflow_user_roles').select('user_id').eq('role', 'admin');
  if (roles.error) throw roles.error;
  const ids = ((roles.data ?? []) as { user_id: string }[]).map(row => row.user_id);
  let list: Broadcast[] = [];
  if (ids.length) {
    const states = await db.from('cashflow_private_state').select('user_id,broadcasts:data->broadcasts').in('user_id', ids);
    if (states.error) throw states.error;
    list = readBroadcasts(((states.data ?? []) as { broadcasts?: unknown }[]).flatMap(row => (Array.isArray(row.broadcasts) ? row.broadcasts : [])));
  }
  cached = { at: Date.now(), list };
  return list;
}

async function privateValue(db: Db, userId: string, key: 'broadcasts' | 'broadcastAnswers'): Promise<unknown> {
  const result = await db.from('cashflow_private_state').select(`value:data->${key}`).eq('user_id', userId).maybeSingle();
  if (result.error) throw result.error;
  return (result.data as { value?: unknown } | null)?.value;
}

async function adminResults(db: Db): Promise<AdminBroadcastResponse> {
  const list = await sentBroadcasts(db, true);
  if (!list.length) return { results: [] };
  type Profile = { user_id: string; public_id: string; display_name: string; created_at: string };
  const [profiles, roles, answers] = await Promise.all([
    db.from('cashflow_profiles').select('user_id,public_id,display_name,created_at').limit(10_000),
    db.from('cashflow_user_roles').select('user_id').eq('role', 'admin'),
    db.from('cashflow_private_state').select('user_id,answers:data->broadcastAnswers').not('data->broadcastAnswers', 'is', null).limit(10_000),
  ]);
  for (const result of [profiles, roles, answers]) if (result.error) throw result.error;
  const admins = new Set(((roles.data ?? []) as { user_id: string }[]).map(row => row.user_id));
  const accounts = ((profiles.data ?? []) as Profile[]).map(row => ({ userId: row.user_id, name: row.display_name, publicId: row.public_id, createdAt: row.created_at, admin: admins.has(row.user_id) }));
  const answersBy = new Map(((answers.data ?? []) as { user_id: string; answers: unknown }[]).map(row => [row.user_id, readAnswers(row.answers)] as const));
  return { results: list.map(broadcast => broadcastResult(broadcast, accounts, answersBy)) };
}

export default withGuard(async (req, res) => {
  if (!['GET', 'POST'].includes(req.method || '')) throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  const db = getSupabaseAdmin();
  const owner = async () => {
    if (!canViewAdminAnalytics(user, await systemRole(user.id))) throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  };

  if (req.method === 'GET') {
    if (req.query.scope === 'admin') {
      await owner();
      await rateLimit('broadcast-admin', user.id, 30, 60);
      res.json(await adminResults(db));
      return;
    }
    await rateLimit('broadcast-read', user.id, 30, 60);
    const list = await sentBroadcasts(db);
    // The team sends these; an admin account is never asked to answer its own message.
    if (!activeBroadcast(list) || await systemRole(user.id) === 'admin') { res.json({ broadcast: null }); return; }
    res.json({ broadcast: broadcastFor(list, { createdAt: user.created_at }, readAnswers(await privateValue(db, user.id, 'broadcastAnswers'))) });
    return;
  }

  const admin = broadcastAdminActionSchema.safeParse(req.body);
  if (admin.success) {
    await owner();
    await rateLimit('broadcast-send', user.id, 20, 3600);
    const own = readBroadcasts(await privateValue(db, user.id, 'broadcasts'));
    const now = new Date().toISOString();
    if (admin.data.action === 'send') {
      const id = randomUUID();
      await patchPrivate(user.id, { broadcasts: withNewBroadcast(own, { id, body: admin.data.body, askRating: admin.data.askRating, createdAt: now }) });
      cached = null;
      res.status(201).json({ ok: true, id });
      return;
    }
    const { id } = admin.data;
    if (!own.some(item => item.id === id)) throw new HttpError(404, 'ไม่พบข้อความนี้');
    await patchPrivate(user.id, { broadcasts: withEndedBroadcast(own, id, now) });
    cached = null;
    res.json({ ok: true });
    return;
  }

  const parsed = broadcastUserActionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'กรุณาให้คะแนนหรือพิมพ์คำตอบไม่เกิน 1,000 ตัวอักษร');
  await rateLimit('broadcast-answer', user.id, 20, 60);
  const action = parsed.data;
  const broadcast = (await sentBroadcasts(db, true)).find(item => item.id === action.id);
  if (!broadcast) throw new HttpError(404, 'ไม่พบข้อความนี้แล้ว');
  const answers = readAnswers(await privateValue(db, user.id, 'broadcastAnswers'));
  const at = new Date().toISOString();
  if (action.action !== 'answer') {
    const status: BroadcastAnswer['status'] = action.action === 'seen' ? 'seen' : 'dismissed';
    if (answers[action.id]?.status !== 'answered') await patchPrivate(user.id, { broadcastAnswers: withAnswer(answers, action.id, { status, at }) });
    res.json({ ok: true });
    return;
  }
  // Answered already (a second tap, another tab): the first answer stands.
  if (answers[action.id]?.status === 'answered') { res.json({ ok: true, threadId: answers[action.id].threadId ?? null }); return; }
  let threadId: string | undefined;
  if (action.reply) {
    // A written answer is a แจ้งปัญหา conversation from this account (the same rules and limits as one it starts itself).
    const created = await db.rpc('cashflow_feedback_mutate', {
      p_actor: user.id, p_action: 'create', p_input: { body: broadcastReplyBody(broadcast, action.reply, action.rating), category: 'other' },
    });
    if (created.error) console.warn('broadcast: answer kept without a conversation', created.error.code);
    else threadId = (created.data as { threadId?: string } | null)?.threadId;
  }
  await patchPrivate(user.id, { broadcastAnswers: withAnswer(answers, action.id, {
    status: 'answered', at, ...(action.rating ? { rating: action.rating } : {}), ...(action.reply ? { reply: action.reply } : {}), ...(threadId ? { threadId } : {}),
  }) });
  const alert = alertBroadcastAnswer({ broadcastId: action.id, reply: action.reply, ...(action.rating ? { rating: action.rating } : {}) }, ownerDeliveryDeps());
  await Promise.race([alert, new Promise(resolve => setTimeout(resolve, 2500))]);
  res.json({ ok: true, threadId: threadId ?? null });
}, { csrf: true });

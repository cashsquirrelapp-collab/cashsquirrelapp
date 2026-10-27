import { inFreeTrial } from '../../../shared/trial.js';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import { accountSnapshot } from '../repositories/accounts.js';
import { systemRole } from '../repositories/roles.js';
import type { UserRow } from '../services/lineAssistant.js';
import { listVaultFiles, hasProAccess } from '../services/vault.js';
import type { AssistantDb, PlanInfo, StoredProposal } from './service.js';
import { MEMORY_LIMIT, type MemoryRow } from './memory.js';
import { claimDocumentSlots, releaseDocumentSlots } from '../services/documentQuota.js';
import { proTokenLimits } from '../services/proTokens.js';
import { applyWithDocumentQuota } from './documentQuota.js';
import { inboxConversationId } from './conversations.js';
import type { ChannelTurn } from './crossChannel.js';

// AssistantDb on Supabase, using database/ai_secretary.sql (tables cashflow_ai_*). Until the owner runs that file,
// every call here answers 503 with a plain message instead of failing silently.


/** The history of a memory (review and rollback); before the migration runs there is none, and nothing fails. */
async function memoryEvents(userId: string, rows: { memory_id: string | null; action: 'created' | 'updated' | 'deleted' | 'expired'; kind: string; old_value: string | null; new_value: string | null; channel: 'app' | 'line' | 'system' }[]) {
  if (!rows.length) return;
  await getSupabaseAdmin().from('cashflow_ai_memory_events').insert(rows.map(row => ({ user_id: userId, ...row }))).then(() => undefined, () => undefined);
}

function dbError(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  // PostgREST: table or function missing (database/ai_secretary.sql not run yet).
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code || '')) {
    throw new HttpError(503, 'เลขากระรอกต้องอัปเดตฐานข้อมูลก่อน (ai_secretary.sql)', 'ai_db_missing');
  }
  throw error;
}

/** Same rule as hasProAccess (services/vault.ts) with the trial and admins told apart. Fails closed. */
export async function assistantPlan(user: User, now = Date.now()): Promise<PlanInfo> {
  const [{ data: sub, error }, role] = await Promise.all([
    getSupabaseAdmin().from('subscriptions').select('status, plan, current_period_end, pro_access_reset_at').eq('user_id', user.id).maybeSingle(),
    systemRole(user.id),
  ]);
  if (error) throw error;
  if (role === 'admin') return { plan: 'admin' };
  if (sub?.plan === 'admin_revoked' || sub?.plan === 'admin_removed') return { plan: 'none' };
  if (sub?.status === 'active' && sub.plan === 'admin_grant') return { plan: 'pro' };
  // Paid Pro: tokens renew monthly on the renewal day of current_period_end.
  if (sub?.status === 'active' && sub.current_period_end && new Date(sub.current_period_end).getTime() > now) {
    return { plan: 'pro', periodEnd: sub.current_period_end, tokens: sub.plan === 'pro_prepaid' ? await paidPlanTokens(user.id, now, sub.pro_access_reset_at) : undefined };
  }
  const trial = inFreeTrial(user.created_at, now);
  return { plan: trial ? 'trial' : 'none' };
}

/**
 * Tokens a month for the plan this account paid for (shared/proTokens.ts). Pro given by the owner (manual or admin grant)
 * and older Stripe subscriptions keep the default allowance. If the orders cannot be read, the default allowance too:
 * a member is never refused for a read error.
 */
async function paidPlanTokens(userId: string, now: number, resetAt: string | null | undefined): Promise<number | undefined> {
  try {
    const since = resetAt ? new Map([[userId, Date.parse(resetAt)]]) : undefined;
    return (await proTokenLimits(getSupabaseAdmin(), new Date(now), [userId], since)).get(userId);
  } catch (error) {
    console.warn('ai: plan tokens unreadable, default allowance', { code: (error as { code?: string })?.code });
    return undefined;
  }
}

/** The plan for a LINE user (no session there): the auth record gives the creation date the trial counts from. Fails closed. */
export async function assistantPlanForUserId(userId: string): Promise<PlanInfo & { email: string | null }> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
  if (error || !data?.user) throw error ?? new Error('auth user missing');
  return { ...(await assistantPlan(data.user)), email: data.user.email ?? null };
}

type ProposalRow = { id: string; user_id: string; kind: StoredProposal['kind']; job_id: string; record: Record<string, unknown> | null; base_version: number | null; title: string; changes: StoredProposal['changes']; created_at: string;
  tool?: string | null; args?: Record<string, unknown> | null };
const fromRow = (row: ProposalRow): StoredProposal => ({
  id: row.id, userId: row.user_id, kind: row.kind, jobId: row.job_id, record: row.record, baseVersion: row.base_version,
  title: row.title, changes: row.changes, createdAt: new Date(row.created_at).getTime(),
});

export const supabaseAssistantDb: AssistantDb = {
  listVaultFiles: userId => listVaultFiles({ kind: 'user', id: userId }),
  async loadAccount(userId) {
    const snapshot = await accountSnapshot(userId);
    const versions = { ...(snapshot.versions?.cashflow_jobs || {}) } as Record<string, number>;
    for (const [table, records] of Object.entries(snapshot.versions || {})) {
      if (records && typeof records === 'object') for (const [id, version] of Object.entries(records)) {
        if (typeof version === 'number') versions[`${table}:${id}`] = version;
      }
    }
    const documentVersions = snapshot.versions?.cashflow_documents;
    const absentRecords = documentVersions && typeof documentVersions === 'object'
      ? ['settings', 'issuer_profile', 'notif_settings'].filter(id => !Object.prototype.hasOwnProperty.call(documentVersions, id)).map(id => `cashflow_documents:${id}`)
      : [];
    return { user: snapshot as unknown as UserRow, versions, absentRecords };
  },
  async reserve(input) {
    const { data, error } = await getSupabaseAdmin().rpc('cashflow_ai_reserve', {
      p_user_id: input.userId, p_cycle: input.cycle, p_request_id: input.requestId, p_tokens: input.tokens,
      p_token_limit: input.tokenLimit, p_request_limit: input.requestLimit, p_daily_cap_usd: input.dailyCapUsd,
    });
    dbError(error);
    const result = data as { ok: boolean; reason?: 'tokens' | 'requests' | 'daily_cap'; used_tokens?: number; used_requests?: number; spent_today_usd?: number | string; smart_last_hour?: number | string };
    const spent = result.spent_today_usd === undefined || result.spent_today_usd === null ? undefined : Number(result.spent_today_usd);
    const smart = result.smart_last_hour === undefined || result.smart_last_hour === null ? undefined : Number(result.smart_last_hour);
    return result.ok
      ? { ok: true, usedTokens: Number(result.used_tokens || 0), usedRequests: Number(result.used_requests || 0), ...(Number.isFinite(spent) ? { spentTodayUsd: spent } : {}),
        ...(Number.isFinite(smart) ? { smartLastHour: smart } : {}) }
      : { ok: false, reason: result.reason || 'tokens' };
  },
  async settle(input) {
    // After 20261025150000_ai_cost_accounting.sql: settle and cap at what the account has left, atomically.
    if (input.cycle) {
      const capped = await getSupabaseAdmin().rpc('cashflow_ai_settle_capped', {
        p_user_id: input.userId, p_cycle: input.cycle, p_request_id: input.requestId, p_tokens: input.tokens, p_cost_usd: input.costUsd,
        p_model: input.model, p_route: input.route, p_prompt_version: input.promptVersion, p_release: input.release, p_token_limit: input.tokenLimit ?? null,
      });
      if (!capped.error && typeof capped.data === 'number') return capped.data;
      if (!capped.error && capped.data !== null && Number.isFinite(Number(capped.data))) return Number(capped.data);
      // Before the migration the function does not exist (PostgREST PGRST202): settle the earlier way below.
      if (capped.error && capped.error.code !== 'PGRST202' && !/cashflow_ai_settle_capped/.test(capped.error.message || '')) dbError(capped.error);
    }
    const { error } = await getSupabaseAdmin().rpc('cashflow_ai_settle', {
      p_user_id: input.userId, p_request_id: input.requestId, p_tokens: input.tokens, p_cost_usd: input.costUsd,
      p_model: input.model, p_route: input.route, p_prompt_version: input.promptVersion, p_release: input.release,
    });
    dbError(error);
  },
  async saveRouting(userId, requestId, routing) {
    // Routing V2: codes, model names, counts, tool names and card ids only. Before the migration adds the column this
    // fails and the service ignores it; the charge was already settled.
    const { error } = await getSupabaseAdmin().from('cashflow_ai_usage').update({ routing }).eq('request_id', requestId).eq('user_id', userId);
    if (error) throw new Error('routing_log_unavailable');
  },
  async usage(userId, cycle) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_usage').select('tokens')
      .eq('user_id', userId).eq('cycle_key', cycle).in('status', ['reserved', 'settled']);
    dbError(error);
    const rows = (data || []) as { tokens: number }[];
    return { tokens: rows.reduce((sum, row) => sum + Number(row.tokens || 0), 0), requests: rows.length };
  },
  async saveProposal(proposal) {
    const row = {
      id: proposal.id, user_id: proposal.userId, kind: proposal.kind, job_id: proposal.jobId, record: proposal.record,
      base_version: proposal.baseVersion, title: proposal.title, changes: proposal.changes,
    };
    // tool/args (editable cards, 2026-10-24) need supabase/migrations/20261024120000_ai_proposal_args.sql. Until it
    // runs, the card is saved without them and simply cannot be edited.
    const { error } = await getSupabaseAdmin().from('cashflow_ai_proposals').insert({ ...row, tool: proposal.tool ?? null, args: proposal.args ?? null });
    if (error && /\b(tool|args)\b/.test(`${error.message} ${(error as { details?: string }).details ?? ''}`)) {
      const retry = await getSupabaseAdmin().from('cashflow_ai_proposals').insert(row);
      dbError(retry.error);
      return;
    }
    dbError(error);
  },
  async recentAppTurns(userId, sinceIso) {
    // Package E: the app chat's latest turns of one conversation (the newest), never the notifications thread.
    const inbox = await inboxConversationId(userId);
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_messages').select('conversation_id,role,text,cards,attachment,created_at')
      .eq('user_id', userId).neq('conversation_id', inbox).gte('created_at', sinceIso).order('id', { ascending: false }).limit(6);
    if (error || !data?.length) return { turns: [], lastAt: null };
    const latest = data[0].conversation_id;
    const rows = data.filter(row => row.conversation_id === latest).reverse();
    return { lastAt: Date.parse(data[0].created_at) || null,
      turns: rows.map(row => ({ role: row.role, text: String(row.text || ''), cards: Array.isArray(row.cards) ? row.cards : [], attachment: row.attachment ?? null }) as ChannelTurn) };
  },
  async accountName(userId) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_profiles').select('display_name').eq('user_id', userId).maybeSingle();
    if (error || !data) return null;
    const name = String((data as { display_name?: unknown }).display_name ?? '').trim();
    return name || null;
  },
  async pendingProposals(userId, sinceIso) {
    // Package E: cards still waiting for this account, newest first, to show again in the channel the user is in.
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_proposals').select('id,user_id,kind,job_id,record,base_version,title,changes,created_at,status,expires_at,tool,args')
      .eq('user_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(5);
    if (error || !data) return [];
    return (data as (ProposalRow & { tool: string | null; args: Record<string, unknown> | null })[]).map(row => ({ ...fromRow(row), tool: row.tool ?? undefined, args: row.args ?? undefined }));
  },
  async getProposal(userId, id) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_proposals').select('id,user_id,kind,job_id,record,base_version,title,changes,created_at,status,expires_at,tool,args')
      .eq('id', id).eq('user_id', userId).maybeSingle();
    if (error) return null; // before the migration the columns do not exist: not editable
    const row = data as (ProposalRow & { status: string; expires_at: string; tool: string | null; args: Record<string, unknown> | null }) | null;
    if (!row || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now()) return null;
    return { ...fromRow(row), tool: row.tool ?? undefined, args: row.args ?? undefined };
  },
  async claimProposal(userId, id) {
    const { data, error } = await getSupabaseAdmin().rpc('cashflow_ai_claim_proposal', { p_user_id: userId, p_id: id });
    dbError(error);
    const rows = (data || []) as ProposalRow[];
    // With the call that prepared it, so a confirmed correction can be learned (package B).
    return rows[0] ? { ...fromRow(rows[0]), tool: rows[0].tool ?? undefined, args: rows[0].args ?? undefined } : null;
  },
  async finishProposal(userId, id, status) {
    const { error } = await getSupabaseAdmin().from('cashflow_ai_proposals')
      .update({ status, ...(status === 'applied' ? { applied_at: new Date().toISOString() } : {}) })
      .eq('id', id).eq('user_id', userId).eq('status', 'applying');
    dbError(error);
  },
  async cancelProposal(userId, id) {
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_proposals').update({ status: 'cancelled' })
      .eq('id', id).eq('user_id', userId).eq('status', 'pending').select('id');
    dbError(error);
    return Boolean(data?.length);
  },
  async applyChanges(userId, changes) {
    return applyWithDocumentQuota(userId, changes, {
      unlimited: async owner => {
        const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(owner);
        if (error || !data?.user || data.user.id !== owner) throw error ?? new Error('auth user missing');
        return hasProAccess(data.user);
      },
      claim: claimDocumentSlots,
      release: releaseDocumentSlots,
      apply: async (owner, validated) => {
        // A pending goal proposal cannot outlive the account's verified admin feature access.
        if (validated.some(change => change.table === 'cashflow_goals') && await systemRole(owner) !== 'admin') {
          throw new HttpError(403, 'ฟีเจอร์เป้าหมายยังไม่เปิดให้บัญชีนี้ใช้งาน', 'ai_feature_unavailable');
        }
        const { data, error } = await getSupabaseAdmin().rpc('cashflow_apply_changes', { p_user_id: owner, p_changes: validated });
        if (error?.code === '40001') return false;
        dbError(error);
        // false = stale version; null supports the older SQL function returning void.
        return data !== false;
      },
    });
  },
  async memories(userId) {
    // Memory is a nicety: if it cannot be read, the assistant still answers. Before 20261025090000_ai_learning.sql
    // runs, the new columns are missing and the old ones are read.
    const db = getSupabaseAdmin();
    let read = await db.from('cashflow_ai_memories').select('id, kind, value, source, created_at, updated_at, last_used_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(MEMORY_LIMIT + 10);
    if (read.error) read = await db.from('cashflow_ai_memories').select('id, kind, value, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20) as typeof read;
    if (read.error) return [];
    return (read.data || []) as MemoryRow[];
  },
  async remember(userId, kind, value, limit) {
    const db = getSupabaseAdmin();
    if (kind === 'preferred_name' || kind === 'tone') {
      const removed = await db.from('cashflow_ai_memories').delete().eq('user_id', userId).eq('kind', kind);
      dbError(removed.error);
    }
    const inserted = await db.from('cashflow_ai_memories').insert({ user_id: userId, kind, value });
    dbError(inserted.error);
    const { data } = await db.from('cashflow_ai_memories').select('id').eq('user_id', userId).order('created_at', { ascending: false });
    const extra = (data || []).slice(limit).map(row => row.id as string);
    if (extra.length) await db.from('cashflow_ai_memories').delete().in('id', extra);
  },
  async saveMemory(userId, input) {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();
    let memoryId = input.replace?.id;
    if (input.replace) {
      const updated = await db.from('cashflow_ai_memories').update({ value: input.value, source: input.source, version: (input.replace.version ?? 1) + 1, updated_at: now })
        .eq('id', input.replace.id).eq('user_id', userId);
      dbError(updated.error);
    } else {
      const inserted = await db.from('cashflow_ai_memories').insert({ user_id: userId, kind: input.kind, value: input.value, source: input.source, updated_at: now }).select('id').single();
      dbError(inserted.error);
      memoryId = inserted.data?.id as string | undefined;
    }
    await memoryEvents(userId, [{ memory_id: memoryId ?? null, action: input.replace ? 'updated' : 'created', kind: input.kind,
      old_value: input.replace?.value ?? null, new_value: input.value, channel: input.channel }]);
    // Over the limit, the least recently used go (never the communication preferences).
    for (const row of input.evict ?? []) {
      const removed = await db.from('cashflow_ai_memories').delete().eq('id', row.id).eq('user_id', userId);
      if (!removed.error) await memoryEvents(userId, [{ memory_id: row.id, action: 'expired', kind: row.kind, old_value: null, new_value: null, channel: input.channel }]);
    }
    return memoryId ?? null;
  },
  async forgetMemories(userId, rows, channel) {
    if (!rows.length) return 0;
    const db = getSupabaseAdmin();
    const ids = rows.map(row => row.id);
    const removed = await db.from('cashflow_ai_memories').delete().eq('user_id', userId).in('id', ids);
    dbError(removed.error);
    // The user asked to forget: earlier versions of these memories lose their text too.
    await db.from('cashflow_ai_memory_events').update({ old_value: null, new_value: null }).eq('user_id', userId).in('memory_id', ids);
    await memoryEvents(userId, rows.map(row => ({ memory_id: row.id, action: 'deleted' as const, kind: row.kind, old_value: null, new_value: null, channel })));
    return ids.length;
  },
  async saveCorrection(userId, input) {
    await getSupabaseAdmin().from('cashflow_ai_corrections').insert({ user_id: userId, domain: input.domain, subject: input.subject.slice(0, 120),
      before_value: input.before?.slice(0, 200) ?? null, after_value: input.after.slice(0, 200), proposal_id: input.proposalId, memory_id: input.memoryId })
      .then(() => undefined, () => undefined);
  },
  async recentCorrections(userId, domain, subject) {
    const since = new Date(Date.now() - 60 * 86400_000).toISOString();
    const { data, error } = await getSupabaseAdmin().from('cashflow_ai_corrections').select('after_value').eq('user_id', userId).eq('domain', domain)
      .eq('subject', subject.slice(0, 120)).gte('created_at', since).order('created_at', { ascending: false }).limit(5);
    return error ? [] : (data || []).map(row => String(row.after_value));
  },
  async saveSignals(userId, signals, channel, promptVersion) {
    if (!signals.length) return;
    await getSupabaseAdmin().from('cashflow_ai_knowledge_signals').insert(signals.map(signal => ({ user_id: userId, kind: signal.kind,
      feature_id: signal.feature_id?.slice(0, 60) ?? null, question: signal.question?.slice(0, 200) ?? null, channel, prompt_version: promptVersion.slice(0, 40) })))
      .then(() => undefined, () => undefined);
  },
  async touchMemories(userId, ids) {
    if (!ids.length) return;
    await getSupabaseAdmin().rpc('cashflow_ai_memories_touch', { p_user_id: userId, p_ids: ids }).then(() => undefined, () => undefined);
  },
};

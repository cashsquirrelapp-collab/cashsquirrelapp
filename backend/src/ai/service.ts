import { randomUUID } from 'node:crypto';
import { HttpError } from '../http/guard.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { AiConfig } from './config.js';
import { AiUnavailableError, failedRouting, runAssistant, type AssistantReply } from './gateway.js';
import { decideRoute, routingRecord, type RoutingRecord } from './routingPolicy.js';
import { CARD_AGAIN, CONTINUE_WINDOW_MS, continuationTurns, EXPLICIT_GO_AHEAD, GO_AHEAD, goAheadFits, mentionsCard, PENDING_WINDOW_MS, type ChannelTurn } from './crossChannel.js';
import { PROMPT_VERSION } from './prompt.js';
import { quickAnswer, quickKind } from './quickAnswers.js';
import { autoSaveCards, autoSaveText, wantsSaveNow } from './autoSave.js';
import type { PromptSlots } from './prompt.js';
import { applyCardEdit, cardForStoredProposal, cardValue, createToolbox, EDITABLE_FIELDS, type MemoryStore, type Proposal, type ProposalStore } from './tools.js';
import { learnedPairs, learnFromConfirmed, mergePairs, pairFromCardEdit, type CorrectionDomain, type LearnPair } from './learning.js';
import type { KnowledgeSignal } from './signals.js';
import { ProviderError, type AssistantCard, type ChatTurn, type Provider, type ProviderName } from './types.js';
import type { VaultFile } from '../../../shared/vault.js';
import { bulkDeleteChanges, isDeleteAll, proposalBaseVersion, proposalChanges, proposalTarget } from './proposals.js';
import { documentPath } from './documentActions.js';
import { MEMORY_LIMIT, overLimit, replacedMemory, selectMemories, type MemoryKind, type MemoryRow } from './memory.js';

// What one เลขากระรอก request does around the model: who may use it, how many Krarok Tokens are left, charging the
// real cost after the answer, and applying a proposal when the user presses confirm. The database sits behind
// AssistantDb so the rules can be tested without one (the Supabase version is in supabaseDb.ts).

/** 'lapsed': Pro has ended, but tokens are left from its last month; เลขา chats until they run out (owner, 2026-10-28). */
export type AssistantPlan = 'pro' | 'trial' | 'admin' | 'lapsed' | 'none';
/** Tokens held while the model runs; the real cost replaces it afterwards (a request costs about 2). */
export const RESERVE_TOKENS = 5;

export interface StoredProposal extends Proposal { baseVersion: number | null }
export type ReserveResult =
  /** spentTodayUsd: the whole app's real AI spend today (20261025150000_ai_cost_accounting.sql; absent before it runs). */
  | { ok: true; usedTokens: number; usedRequests: number; spentTodayUsd?: number; smartLastHour?: number }
  | { ok: false; reason: 'tokens' | 'requests' | 'daily_cap' };

export interface AssistantDb {
  loadAccount(userId: string): Promise<{ user: UserRow; versions: Record<string, number>; absentRecords?: string[] }>;
  /** Read metadata only. Called lazily with the authenticated ID, never a model-supplied scope. */
  listVaultFiles?(userId: string): Promise<VaultFile[]>;
  reserve(input: { userId: string; cycle: string; requestId: string; tokens: number; tokenLimit: number | null; requestLimit: number | null; dailyCapUsd: number }): Promise<ReserveResult>;
  /**
   * Replace the reservation with what the request cost: tokens charged and the real spend (also when released, so the
   * daily cap counts a failed request's finished rounds). With cycle and tokenLimit, the database never charges more
   * than the account has left (cashflow_ai_settle_capped) and returns what it charged.
   */
  settle(input: { userId: string; requestId: string; tokens: number; costUsd: number; model: string | null; route: string | null; promptVersion: string | null; release: boolean; cycle?: string; tokenLimit?: number | null }): Promise<number | void>;
  usage(userId: string, cycle: string): Promise<{ tokens: number; requests: number }>;
  saveProposal(proposal: StoredProposal): Promise<void>;
  claimProposal(userId: string, id: string): Promise<StoredProposal | null>;
  finishProposal(userId: string, id: string, status: 'applied' | 'pending' | 'cancelled' | 'stale'): Promise<void>;
  cancelProposal(userId: string, id: string): Promise<boolean>;
  /** A pending, unexpired proposal of this user, with the tool call that prepared it (null when not editable). */
  getProposal?(userId: string, id: string): Promise<StoredProposal | null>;
  /** The app's own save (cashflow_apply_changes): false when the job changed since the version given. */
  applyChanges(userId: string, changes: unknown[]): Promise<boolean>;
  memories(userId: string): Promise<MemoryRow[]>;
  remember(userId: string, kind: string, value: string, limit: number): Promise<void>;
  /** Memory v2 (20261025090000_ai_learning.sql): save or replace one memory with its history; evict the given rows. */
  saveMemory?(userId: string, input: { kind: string; value: string; source: 'explicit' | 'correction'; channel: 'app' | 'line'; replace?: MemoryRow & { version?: number }; evict?: MemoryRow[] }): Promise<string | null>;
  /** Delete these memories of this user (the user asked), with their history's text. Returns how many. */
  forgetMemories?(userId: string, rows: MemoryRow[], channel: 'app' | 'line'): Promise<number>;
  /** The memories one message used: last used now (retention, least used go first). */
  touchMemories?(userId: string, ids: string[]): Promise<void>;
  /** A correction the user confirmed, for the account's correction history (package B). */
  saveCorrection?(userId: string, input: LearnPair & { proposalId: string; memoryId: string | null }): Promise<void>;
  /** The answers this subject was corrected to in the last 60 days, newest first. */
  recentCorrections?(userId: string, domain: CorrectionDomain, subject: string): Promise<string[]>;
  /** Feature knowledge signals for the owner's report (package D). */
  saveSignals?(userId: string, signals: KnowledgeSignal[], channel: 'app' | 'line', promptVersion: string): Promise<void>;
  /** Why the request went to which model, per-model cost and the outcome, on its usage row (routing V2). */
  saveRouting?(userId: string, requestId: string, routing: RoutingRecord): Promise<void>;
  /** The app chat's latest turns since then, from one conversation, newest last (package E). */
  recentAppTurns?(userId: string, sinceIso: string): Promise<{ turns: ChannelTurn[]; lastAt: number | null }>;
  /** This account's cards still waiting for confirmation, prepared since then (package E). */
  pendingProposals?(userId: string, sinceIso: string): Promise<StoredProposal[]>;
  /** The name on the account (its profile), the name เลขา calls the user by (owner, 2026-10-27). */
  accountName?(userId: string): Promise<string | null>;
}

/** 'YYYY-MM' in Bangkok: the calendar month, for admins and Pro granted by an admin (no renewal date). */
export const tokenCycle = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 7);

const BANGKOK = 7 * 3600_000;
/** The same day of the month as the anchor, `months` later (31 Jan + 1 month = 28/29 Feb). Bangkok dates. */
function shiftMonths(anchor: { y: number; m: number; d: number }, months: number) {
  const first = new Date(Date.UTC(anchor.y, anchor.m + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(anchor.d, last)) - BANGKOK);
}

/**
 * Pro tokens renew every month on the renewal day (owner's choice, 2026-10-24): a plan renewing on the 15th resets
 * on the 15th of every month, also for 6-month and yearly plans. Returns the cycle's start date (Bangkok, the key
 * the usage rows are filed under) and when the next one starts.
 */
export function renewalCycle(periodEnd: string, now = new Date()): { cycle: string; resetsAt: Date } {
  const end = new Date(new Date(periodEnd).getTime() + BANGKOK);
  const anchor = { y: end.getUTCFullYear(), m: end.getUTCMonth(), d: end.getUTCDate() };
  // Months from the anchor back (negative) or forward to the cycle that contains now.
  let k = (now.getUTCFullYear() - anchor.y) * 12 + (now.getUTCMonth() - anchor.m) + 1;
  while (shiftMonths(anchor, k).getTime() > now.getTime()) k -= 1;
  while (shiftMonths(anchor, k + 1).getTime() <= now.getTime()) k += 1;
  const start = shiftMonths(anchor, k);
  return { cycle: new Date(start.getTime() + BANGKOK).toISOString().slice(0, 10), resetsAt: shiftMonths(anchor, k + 1) };
}

/**
 * The last renewal month a Pro period paid for: the one that ends on the day the period ends. Tokens renew at 00:00
 * Bangkok on the renewal day, so the moment just before the period's end can already sit in a month it never paid for.
 */
export function lastPaidCycle(periodEnd: string): string {
  const local = new Date(Date.parse(periodEnd) + BANGKOK);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BANGKOK;
  return renewalCycle(periodEnd, new Date(dayStart - 1)).cycle;
}

export interface PlanInfo {
  plan: AssistantPlan; periodEnd?: string | null;
  /** Tokens a month for the plan this account paid for (shared/proTokens.ts); none = the default allowance. */
  tokens?: number;
}
const asPlan = (value: AssistantPlan | PlanInfo): PlanInfo => (typeof value === 'string' ? { plan: value } : value);

/**
 * Limits for a plan: Pro has a monthly token allowance (by the plan paid for, else the default), the trial one small
 * allowance for the whole trial. Admins get the default Pro allowance for the calendar month (owner, 2026-10-27:
 * "จำกัดโทเค็นแอดมิน ... เอาเท่ากับยูเซอร์"), so using เลขา costs them what it costs a member and shows whether it is enough.
 */
export function allowance(value: AssistantPlan | PlanInfo, config: AiConfig, now = new Date()) {
  const { plan, periodEnd, tokens } = asPlan(value);
  if (plan === 'trial') return { cycle: 'trial', resetsAt: null, tokenLimit: config.trialTokens, requestLimit: null };
  if (plan === 'lapsed') {
    // Pro has ended (owner, 2026-10-28: "ถ้าหมดโปรไป เขายังเหลือ 500 โทเค็น ให้เขาใช้จนหมดก่อน"): the last paid month's
    // allowance, with what was used in it; nothing renews until Pro does.
    const ended = periodEnd ? Date.parse(periodEnd) : NaN;
    if (!Number.isFinite(ended)) return { cycle: 'lapsed', resetsAt: null, tokenLimit: 0, requestLimit: null };
    return { cycle: lastPaidCycle(periodEnd!), resetsAt: null, tokenLimit: tokens ?? config.proTokensPerCycle, requestLimit: null };
  }
  const month = () => {
    const local = new Date(now.getTime() + BANGKOK);
    return { cycle: tokenCycle(now), resetsAt: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - BANGKOK) };
  };
  const period = plan === 'pro' && periodEnd ? renewalCycle(periodEnd, now) : month();
  if (plan === 'admin') return { ...period, tokenLimit: config.proTokensPerCycle, requestLimit: null };
  return { ...period, tokenLimit: tokens ?? config.proTokensPerCycle, requestLimit: null };
}

export const thaiDay = (date: Date) => {
  const local = new Date(date.getTime() + BANGKOK);
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear() + 543}`;
};

const NO_ACCESS = 'เลขากระรอกเป็นสิทธิ์ของสมาชิก Pro';
export function refuse(reason: 'tokens' | 'requests' | 'daily_cap', resetsAt: Date | null, trial = false, lapsed = false): never {
  if (reason === 'requests' || (reason === 'tokens' && trial)) throw new HttpError(402, 'สิทธิ์ทดลองใช้เลขากระรอกครบแล้ว อัปเกรดเป็น Pro เพื่อใช้งานต่อ', 'ai_trial_used');
  if (reason === 'tokens' && lapsed) throw new HttpError(402, 'โทเคนที่เหลือจาก Pro หมดแล้ว ต่ออายุ Pro เพื่อรับโทเคนใหม่ทุกเดือน', 'ai_tokens_used');
  if (reason === 'tokens') throw new HttpError(402, `โทเคนของรอบนี้หมดแล้ว จะได้รับใหม่วันที่ ${resetsAt ? thaiDay(resetsAt) : 'รอบถัดไป'}`, 'ai_tokens_used');
  throw new HttpError(503, 'เลขากระรอกพักการใช้งานชั่วคราว กรุณาลองใหม่ภายหลัง', 'ai_daily_cap');
}

/** One burst limit per account for เลขา messages, shared by the app and LINE (same scope and key). */
export const MESSAGE_RATE = { scope: 'assistant-message', limit: 20, seconds: 60 } as const;

export interface UsageStatus { enabled: boolean; plan: AssistantPlan; tokensLeft: number | null; trialLeft: number | null; resetsAt: string | null; tokenLimit: number | null; requestLimit: number | null }
export async function usageStatus(db: AssistantDb, config: AiConfig, userId: string, value: AssistantPlan | PlanInfo, now = new Date()): Promise<UsageStatus> {
  const { plan } = asPlan(value);
  if (!config.enabled || plan === 'none') return { enabled: config.enabled, plan, tokensLeft: null, trialLeft: null, resetsAt: null, tokenLimit: null, requestLimit: null };
  const limits = allowance(value, config, now);
  const used = await db.usage(userId, limits.cycle);
  const left = limits.tokenLimit === null ? null : Math.max(0, limits.tokenLimit - used.tokens);
  // Pro ended and its last month's tokens are gone: an ordinary account again, as far as the app's screens go.
  if (plan === 'lapsed' && !left) return { enabled: true, plan: 'none', tokensLeft: null, trialLeft: null, resetsAt: null, tokenLimit: null, requestLimit: null };
  return {
    enabled: true, plan,
    tokensLeft: left,
    trialLeft: limits.requestLimit === null ? null : Math.max(0, limits.requestLimit - used.requests),
    resetsAt: limits.resetsAt ? limits.resetsAt.toISOString() : null,
    tokenLimit: limits.tokenLimit, requestLimit: limits.requestLimit,
  };
}

export interface MessageInput { text: string; history?: ChatTurn[]; pageName?: string; channel?: 'app' | 'line'; attachment?: { name: string; mimeType: string; data: string } }
export interface MessageDeps {
  config: AiConfig; providers?: Partial<Record<ProviderName, Provider>>; fetchImpl?: typeof fetch; now?: Date; signal?: AbortSignal;
  /** A provider answered with a billing problem (out of credit, billing, over quota): tell the owner at once. Best effort. */
  onBillingIssue?: (issues: NonNullable<RoutingRecord['billing']>) => Promise<unknown>;
}
export interface MessageResult extends Pick<AssistantReply, 'text' | 'cards' | 'route' | 'tokens' | 'memo'> { tokensLeft: number | null; trialLeft: number | null }

export async function handleMessage(db: AssistantDb, deps: MessageDeps, userId: string, value: AssistantPlan | PlanInfo, input: MessageInput): Promise<MessageResult> {
  const { config } = deps;
  const { plan } = asPlan(value);
  if (!config.enabled) throw new HttpError(503, 'เลขากระรอกยังไม่เปิดให้ใช้งาน', 'ai_disabled');
  if (plan === 'none') throw new HttpError(403, NO_ACCESS, 'ai_pro_only');
  const limits = allowance(value, config, deps.now);
  const requestId = randomUUID();
  const reserved = await db.reserve({ userId, cycle: limits.cycle, requestId, tokens: limits.requestLimit !== null ? 0 : RESERVE_TOKENS,
    tokenLimit: limits.tokenLimit, requestLimit: limits.requestLimit, dailyCapUsd: config.dailyCostCapUsd });
  if (!reserved.ok) refuse(reserved.reason, limits.resetsAt, plan === 'trial', plan === 'lapsed');
  // Hard stop before the start (cost brief, phase 4/7): a request that could take the app past its daily cap is refused
  // now, instead of being started and cut off. Sonnet requests can reach about $0.12 (a first-of-the-hour cache write).
  if (reserved.spentTodayUsd !== undefined && config.dailyCostCapUsd > 0) {
    const smartPossible = Boolean(config.smartModel && config.anthropicKey)
      && decideRoute({ text: input.text, history: input.history, hasAttachment: Boolean(input.attachment) }, config.routingPolicy ?? 'v2').tier === 'smart';
    const worst = smartPossible ? 0.12 : 0.02;
    if (reserved.spentTodayUsd + worst > config.dailyCostCapUsd) {
      await db.settle({ userId, requestId, tokens: 0, costUsd: 0, model: null, route: null, promptVersion: null, release: true }).catch(() => undefined);
      console.warn('ai: daily cap reached before start', { spentTodayUsd: reserved.spentTodayUsd, capUsd: config.dailyCostCapUsd });
      refuse('daily_cap', limits.resetsAt);
    }
    if (reserved.spentTodayUsd >= config.dailyCostCapUsd * (config.softBudgetShare ?? 0.8)) {
      // Soft alert in the Worker logs; the gateway also stops optional Sonnet use for this request.
      console.warn('ai: daily spend past the soft budget', { spentTodayUsd: reserved.spentTodayUsd, capUsd: config.dailyCostCapUsd });
    }
  }

  let reply: AssistantReply;
  let selected: ReturnType<typeof selectMemories> | undefined;
  const started = Date.now();
  // The kind each card of this answer was prepared as, so what is being recorded is saved at once when the user says so.
  const preparedKinds = new Map<string, Proposal['kind']>();
  const channel = input.channel === 'line' ? 'line' as const : 'app' as const;
  try {
    const nowMs = (deps.now ?? new Date()).getTime();
    const [{ user, versions, absentRecords }, memories, appRecent, accountName] = await Promise.all([db.loadAccount(userId), db.memories(userId),
      db.recentAppTurns ? db.recentAppTurns(userId, new Date(nowMs - CONTINUE_WINDOW_MS).toISOString()).catch(() => undefined) : Promise.resolve(undefined),
      db.accountName ? db.accountName(userId).catch(() => null) : Promise.resolve(null)]);
    if (user.user_id !== userId) throw new HttpError(403, 'ข้อมูลบัญชีไม่ตรงกับผู้ใช้งาน', 'ai_account_mismatch');
    const proposals: ProposalStore = { save: proposal => {
      preparedKinds.set(proposal.id, proposal.kind);
      return db.saveProposal({ ...proposal, baseVersion: proposalBaseVersion(proposal, versions, absentRecords) });
    } };
    // Memory v2 (owner, 2026-10-25): the same thing said again replaces the old one, over 40 the least used go, and
    // every change is kept in the memory's history. Before the migration runs, the old save is used.
    let current: MemoryRow[] = memories;
    const memory: MemoryStore = {
      remember: async (owner, kind, value) => {
        if (!db.saveMemory) { await db.remember(owner, kind, value, MEMORY_LIMIT); return { ok: true }; }
        const replace = replacedMemory(current, kind as MemoryKind, value);
        const stamp = new Date().toISOString();
        const next = replace ? current.map(row => (row.id === replace.id ? { ...row, value, updated_at: stamp } : row)) : [{ id: 'new', kind, value, updated_at: stamp }, ...current];
        const evict = overLimit(next).filter(row => row.id !== 'new');
        const id = await db.saveMemory(owner, { kind, value, source: 'explicit', channel, ...(replace ? { replace } : {}), ...(evict.length ? { evict } : {}) });
        current = next.filter(row => !evict.includes(row)).map(row => (row.id === 'new' ? { ...row, id: id ?? 'new' } : row));
        return { ok: true, replaced: Boolean(replace) };
      },
      list: async () => current.filter(row => row.id !== 'new'),
      forget: async (owner, rows) => {
        if (!db.forgetMemories) return 0;
        const count = await db.forgetMemories(owner, rows, channel);
        current = current.filter(row => !rows.some(gone => gone.id === row.id));
        return count;
      },
    };
    selected = selectMemories(memories, input.text, undefined, { hasAttachment: Boolean(input.attachment) });
    // Package E: a task left unfinished in the other channel continues here (crossChannel.ts).
    const lineState = user.notif_settings as { chatHistory?: { role: 'user' | 'assistant'; text: string }[]; chatHistoryUpdatedAt?: string } | undefined;
    const lineTurns = (lineState?.chatHistory ?? []).map(turn => ({ role: turn.role, text: String(turn.text || '') }));
    const appTurns = appRecent?.turns ?? [];
    const goAhead = GO_AHEAD.test(input.text.trim()) && !input.attachment;
    const askAgain = !goAhead && CARD_AGAIN.test(input.text.trim()) && !input.attachment;
    // The cards still waiting, read only when they matter: for a typed go-ahead, a "send the card again", or when the
    // other channel ended on a card.
    const pending = db.pendingProposals && (goAhead || askAgain || mentionsCard((channel === 'line' ? appTurns : lineTurns).at(-1)))
      ? await db.pendingProposals(userId, new Date(nowMs - PENDING_WINDOW_MS).toISOString()).catch(() => undefined) : undefined;
    const carried = continuationTurns({ channel, appTurns, appAt: appRecent?.lastAt ?? null, lineTurns,
      lineAt: lineState?.chatHistoryUpdatedAt ? Date.parse(lineState.chatHistoryUpdatedAt) || null : null, now: nowMs,
      waitingIds: pending ? new Set(pending.map(proposal => proposal.id)) : undefined });
    const history = carried ? [...(input.history ?? []), ...carried.turns] : input.history;
    // "ยืนยัน" with cards still waiting (from either channel): show them here to confirm, without a model call. Not when
    // เลขา's last word was a question: then "ใช่" is an answer for เลขา.
    const ownLast = [...(input.history ?? [])].reverse().find(turn => turn.role === 'assistant');
    const lastSeen = carried ? carried.last : ownLast ? { role: 'assistant' as const, text: ownLast.text } : undefined;
    // A confirm in so many words always applies (owner, 2026-10-28: "ไม่ใช่มาถามกูหรือวนมาถามกูอีกรอบ"); a bare "ใช่" or
    // "ได้เลย" only when เลขา's last word was not a question.
    const waiting = goAhead && pending?.length && (EXPLICIT_GO_AHEAD.test(input.text.trim()) || goAheadFits(lastSeen)) ? pending : [];
    if (askAgain && pending?.length) {
      // "ขอการ์ดอีกรอบ", "การ์ดไม่ขึ้น": the same cards again, no model call, no tokens.
      const cards = pending.map(proposal => cardForStoredProposal(proposal, user));
      reply = { route: 'chat', handedOff: false, cards, calls: [], costUsd: 0, billableUsd: 0, overheadUsd: 0, tokens: 0, promptVersion: PROMPT_VERSION,
        text: cards.length === 1 ? 'ส่งการ์ดให้อีกครั้งครับ ตรวจรายละเอียดแล้วกดยืนยัน หรือพิมพ์ "ยืนยัน" ได้เลย'
          : `ส่งการ์ดให้อีกครั้ง ${cards.length} ใบครับ ตรวจรายละเอียดแล้วกดยืนยันทั้งหมด หรือพิมพ์ "ยืนยันทั้งหมด" ได้เลย`,
        routing: routingRecord(decideRoute({ text: input.text }, config.routingPolicy ?? 'v2'), { tier: 'direct', reason: 'cards_again', outcome: 'direct', proposal_ids: cards.map(card => (card as { id: string }).id) }) };
    } else if (waiting.length) {
      // The typed go-ahead is the permission itself, in the app and in LINE (owner, 2026-10-28: "แค่อนุญาตในแชทก็
      // สามารถดำเนินการได้เลย", then "ทำให้ LINE พิมพ์ยืนยันทั้งหมดได้ด้วย"): every card still waiting is applied through the
      // same confirm as a tap, no model call, no tokens. LINE gets the list in words (its cards carry buttons).
      const cards = waiting.map(proposal => cardForStoredProposal(proposal, user));
      const doneTitles: string[] = [];
      let failed = 0;
      for (const card of cards) {
        if (card.kind !== 'confirm') continue;
        try {
          const applied = await confirmProposal(db, userId, card.id, { channel });
          card.status = 'applied';
          if (applied.path) card.path = applied.path;
          doneTitles.push(card.title);
        } catch { failed += 1; }
      }
      const done = doneTitles.length;
      const list = channel === 'line' && done ? `\n${doneTitles.slice(0, 10).map(title => `• ${title}`).join('\n')}${done > 10 ? `\nและอีก ${done - 10} รายการ` : ''}` : '';
      reply = { route: 'chat', handedOff: false, cards: channel === 'app' ? cards : [], calls: [], costUsd: 0, billableUsd: 0, overheadUsd: 0, tokens: 0, promptVersion: PROMPT_VERSION,
        text: done ? `ทำรายการให้แล้ว ${done} รายการครับ${list}${failed ? `\nอีก ${failed} รายการยังทำไม่ได้ ตรวจรายละเอียดบนการ์ดแล้วกดยืนยันได้เลย` : ''}`
          : 'รายการที่รอยืนยันทำต่อไม่ได้แล้วครับ ขอให้เลขาเตรียมใหม่ได้เลย',
        routing: routingRecord(decideRoute({ text: input.text }, config.routingPolicy ?? 'v2'), { tier: 'direct', reason: 'go_ahead_applied', outcome: 'direct', proposal_ids: cards.map(card => (card as { id: string }).id) }) };
    } else if (channel === 'app' && !input.attachment && quickKind(input.text, input.history)) {
      // "กำลังดำเนินการ" / "รอรับเงิน" (the window's buttons, or typed in the app; LINE has its own quick replies): the
      // list from the account's jobs, no model, no tokens.
      const kind = quickKind(input.text, input.history)!;
      reply = { route: 'chat', handedOff: false, cards: [], calls: [], costUsd: 0, billableUsd: 0, overheadUsd: 0, tokens: 0, promptVersion: PROMPT_VERSION,
        text: quickAnswer(kind, user),
        routing: routingRecord(decideRoute({ text: input.text }, config.routingPolicy ?? 'v2'), { tier: 'direct', reason: `quick_${kind}`, outcome: 'direct' }) };
    } else {
    const tokensLeft = limits.tokenLimit === null ? undefined : Math.max(0, limits.tokenLimit - reserved.usedTokens + RESERVE_TOKENS);
    reply = await runAssistant({
      user, plan, text: input.text, history, pageName: input.pageName, channel: input.channel, attachment: input.attachment,
      // The account's name, never a remembered nickname: an old "เรียกผมว่า…" kept winning over a newer one.
      accountName: accountName ?? undefined, communicationProfile: selected.communicationProfile, memories: selected.memories,
      trialLeft: limits.requestLimit === null ? undefined : Math.max(0, limits.requestLimit - reserved.usedRequests),
      tokensLeft,
      access: { period_end: asPlan(value).periodEnd ?? null, tokens_reset_at: limits.resetsAt?.toISOString() ?? null, token_limit: limits.tokenLimit },
      ...(reserved.spentTodayUsd !== undefined ? { budget: { spentTodayUsd: reserved.spentTodayUsd, capUsd: config.dailyCostCapUsd } } : {}),
      // The 1-hour cache for the shared rules pays off only when Sonnet answers twice or more an hour (cost brief,
      // 2026-10-25): the last hour's count picks it; while Sonnet is quiet, the 5-minute cache costs less.
      ...(reserved.smartLastHour !== undefined ? { cacheHint: reserved.smartLastHour >= 2 ? '1h' as const : '5m' as const } : {}),
    }, { config, proposals, memory, providers: deps.providers, fetchImpl: deps.fetchImpl, now: deps.now, signal: deps.signal,
      loadVaultFiles: db.listVaultFiles ? () => db.listVaultFiles!(userId) : undefined });
    if (carried && reply.routing) reply.routing = { ...reply.routing, continued_from: carried.from };
    }
  } catch (error) {
    // A failed answer costs the user nothing. Its finished rounds still cost the app real money: they stay on the row
    // (cost_usd), so the daily cap and the reports count them.
    let failed: ReturnType<typeof failedRouting> | undefined;
    try { failed = { ...failedRouting(input, config, error, Date.now() - started), channel }; } catch { failed = undefined; }
    await db.settle({ userId, requestId, tokens: 0, costUsd: failed?.cost?.actual_usd ?? 0, model: null, route: null, promptVersion: null, release: true }).catch(() => undefined);
    // Which route the failed request had, and how it failed (no user words); best effort like the release above.
    if (failed) await db.saveRouting?.(userId, requestId, failed).catch(() => undefined);
    // Out of credit or over quota: the owner hears at once, and the user is told plainly that it is paused (no tokens).
    if (failed?.error?.startsWith('billing_')) {
      await deps.onBillingIssue?.([failed.error.slice(8) as NonNullable<RoutingRecord['billing']>[number]])?.catch(() => undefined);
      throw new HttpError(503, 'เลขากระรอกพักให้บริการชั่วคราว ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่ภายหลัง ไม่มีการหักโทเคน', 'ai_paused');
    }
    if (error instanceof AiUnavailableError) throw new HttpError(503, 'เลขากระรอกยังไม่พร้อมใช้งาน', 'ai_unavailable');
    if (error instanceof ProviderError || (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') {
      throw new HttpError(503, 'เลขากระรอกตอบไม่ทันในตอนนี้ กรุณาลองใหม่อีกครั้ง', 'ai_provider');
    }
    throw error;
  }

  // "บันทึกให้หน่อย" (owner, 2026-10-28): the new jobs, money received and expenses this answer prepared are saved now,
  // through the same confirm as a tap, with every check it runs. A card that does not pass stays to confirm by hand.
  if (channel === 'app' && reply.cards?.length && wantsSaveNow(input.text, input.history)) {
    const { save, others } = autoSaveCards(reply.cards, preparedKinds);
    let saved = 0;
    let failed = 0;
    for (const card of save) {
      try {
        const done = await confirmProposal(db, userId, card.id, { channel });
        card.status = 'applied';
        if (done.path) card.path = done.path;
        saved += 1;
      } catch { failed += 1; }
    }
    if (saved) reply = { ...reply, text: autoSaveText({ saved, failed, waiting: others }) };
  }

  // Pro and the trial pay what the request cost them in Krarok Tokens (a request-count limit, if set, charges nothing),
  // never more than the account has left this cycle: the last message of a cycle cannot take it past its allowance;
  // the app pays that rest (quota_overrun_usd). The database caps it again under the account's lock.
  const reservedTokens = limits.requestLimit !== null ? 0 : RESERVE_TOKENS;
  const leftBefore = limits.tokenLimit === null ? Infinity : Math.max(0, limits.tokenLimit - (reserved.usedTokens - reservedTokens));
  const wanted = limits.requestLimit !== null ? 0 : reply.tokens;
  const last = reply.calls.filter(call => !call.failed).at(-1) ?? reply.calls.at(-1);
  const settled = await db.settle({ userId, requestId, tokens: Math.min(wanted, leftBefore), costUsd: reply.costUsd, model: last?.model ?? null, route: reply.route,
    promptVersion: reply.promptVersion, release: false, cycle: limits.cycle, tokenLimit: limits.tokenLimit });
  const charged = typeof settled === 'number' ? settled : Math.min(wanted, leftBefore);
  // The routing log rides on the same usage row, written separately so that it can never block the charge above
  // (before 20261025130000_ai_routing_log.sql runs, the column is missing and this does nothing).
  // The bookkeeping after the charge goes together (one wait, not four), so the answer reaches the user sooner; each
  // one is best effort and never blocks or fails the answer.
  const bookkeeping: Promise<unknown>[] = [];
  if (reply.routing) {
    const overrun = Math.max(0, wanted - charged) * config.tokenUsd;
    const cost = reply.routing.cost ? { ...reply.routing.cost, quota_overrun_usd: Number(overrun.toFixed(6)) } : undefined;
    bookkeeping.push(db.saveRouting?.(userId, requestId, { ...reply.routing, channel, ...(cost ? { cost } : {}) })?.catch(() => undefined) ?? Promise.resolve());
    if (reply.routing.billing?.length) bookkeeping.push(deps.onBillingIssue?.(reply.routing.billing)?.catch(() => undefined) ?? Promise.resolve());
  }
  // The memories this answer used stay fresh (unused ones expire after 12 months); a failure here costs nothing.
  const used = (selected?.rows ?? []).map(row => row.id).filter(id => /^[0-9a-f-]{36}$/.test(id));
  if (used.length) bookkeeping.push(db.touchMemories?.(userId, used)?.catch(() => undefined) ?? Promise.resolve());
  // What the feature knowledge missed, for the owner's weekly report (package D); never charged, never blocks.
  if (reply.signals?.length) bookkeeping.push(db.saveSignals?.(userId, reply.signals, input.channel === 'line' ? 'line' : 'app', reply.promptVersion)?.catch(() => undefined) ?? Promise.resolve());
  await Promise.all(bookkeeping);
  return {
    text: reply.text, cards: reply.cards, route: reply.route, tokens: charged, ...(reply.memo ? { memo: reply.memo } : {}),
    tokensLeft: limits.tokenLimit === null ? null : Math.max(0, limits.tokenLimit - (reserved.usedTokens - RESERVE_TOKENS + charged)),
    trialLeft: limits.requestLimit === null ? null : Math.max(0, limits.requestLimit - reserved.usedRequests),
  };
}

/**
 * The user changed fields on a confirmation card (owner, 2026-10-24: "แก้ไขยอดได้ในแชทเลย"). The same tool prepares
 * the card again from the original call with those fields changed, with every check it always runs; no model call,
 * no tokens. The new card replaces the old one, which is cancelled.
 */
export async function reviseProposal(db: AssistantDb, userId: string, proposalId: string, edits: Record<string, string | number>, options: { isAdmin?: boolean } = {}): Promise<{ card: AssistantCard }> {
  const stored = await db.getProposal?.(userId, proposalId);
  const allowed = stored?.tool ? EDITABLE_FIELDS[stored.tool] : undefined;
  if (!stored || stored.userId !== userId || !stored.tool || !stored.args || !allowed) {
    throw new HttpError(409, 'รายการนี้แก้ในการ์ดไม่ได้แล้ว บอกเลขาได้ว่าจะแก้อะไร', 'ai_revise_unavailable');
  }
  const args: Record<string, unknown> = { ...stored.args };
  const earlier = learnedPairs(stored.args);
  delete args.__learn;
  const was: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(edits)) {
    if (!allowed.includes(field)) throw new HttpError(400, 'แก้ช่องนี้ในการ์ดไม่ได้', 'ai_revise_field');
    was[field] = cardValue(stored.tool, args, stored.record as Record<string, unknown> | null, field);
    applyCardEdit(stored.tool, args, field, String(raw ?? '').trim().slice(0, 200));
  }
  // What the user changed on เลขา's card is a lesson, learned only if they then confirm it (package B).
  const lessons = mergePairs(earlier, Object.keys(edits).map(field => pairFromCardEdit(stored.tool!, field, was[field], cardValue(stored.tool!, args, null, field), args))
    .filter((pair): pair is LearnPair => Boolean(pair)));
  // An edited quotation keeps its number (the old card is cancelled, so the number was never used).
  const number = (stored.record as { documentNo?: unknown } | null)?.documentNo;
  if (stored.tool === 'propose_add_document' && typeof number === 'string' && number && !args.document_no) args.document_no = number;
  const { user, versions, absentRecords } = await db.loadAccount(userId);
  if (user.user_id !== userId) throw new HttpError(403, 'ข้อมูลบัญชีไม่ตรงกับผู้ใช้งาน', 'ai_account_mismatch');
  const proposals: ProposalStore = { save: proposal => db.saveProposal({ ...proposal, baseVersion: proposalBaseVersion(proposal, versions, absentRecords) }) };
  const toolbox = createToolbox({ user, proposals, memory: { remember: async () => undefined }, isAdmin: options.isAdmin, learn: lessons });
  const outcome = await toolbox({ id: 'revise', name: stored.tool, args });
  if (outcome.card?.kind !== 'confirm') {
    const result = outcome.result as { error?: string; missing?: string[] } | null;
    throw new HttpError(422, result?.error || (result?.missing?.length ? `ยังขาด: ${result.missing.join(', ')}` : 'แก้รายการนี้ไม่สำเร็จ'), 'ai_revise_invalid');
  }
  await db.cancelProposal(userId, proposalId).catch(() => false);
  return { card: outcome.card };
}

export type ConfirmResult = { status: 'applied'; kind: Proposal['kind']; jobId?: string; recordId?: string; documentId?: string; path?: string; allJobs?: true; count?: number };

/** Where a saved job opens: the jobs page with that job's form (a deleted one has none to open). */
export const jobPath = (kind: Proposal['kind'], jobId: string) => (proposalTarget(kind).op === 'delete' ? '/jobs' : `/jobs?job=${encodeURIComponent(jobId)}`);

/**
 * Delete every job a delete-all card counted, with the versions the account has now, in one save (all or nothing).
 * The user's go-ahead in the chat is enough (owner, 2026-10-28: "ไม่จำเป็นต้องใส่รหัสแล้ว แค่อนุญาตในแชท"). A job edited
 * between reading and saving gets one retry.
 */
async function applyDeleteAll(db: AssistantDb, userId: string, proposal: StoredProposal): Promise<ConfirmResult> {
  let deleted = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let changes;
    try {
      const { user, versions } = await db.loadAccount(userId);
      if (user.user_id !== userId) throw new HttpError(403, 'ข้อมูลบัญชีไม่ตรงกับผู้ใช้งาน', 'ai_account_mismatch');
      changes = bulkDeleteChanges(proposal, versions);
    } catch (error) {
      await db.finishProposal(userId, proposal.id, 'pending').catch(() => undefined);
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, 'ข้อมูลที่เตรียมไว้ไม่ผ่านการตรวจของแอป กรุณาขอให้เลขาเตรียมใหม่', 'ai_proposal_invalid');
    }
    deleted = changes.length;
    if (!changes.length) break;
    let applied: boolean;
    try { applied = await db.applyChanges(userId, changes); }
    catch (error) { await db.finishProposal(userId, proposal.id, 'pending').catch(() => undefined); throw error; }
    if (applied) break;
    if (attempt === 1) {
      await db.finishProposal(userId, proposal.id, 'pending').catch(() => undefined);
      throw new HttpError(409, 'มีการแก้ไขงานระหว่างลบ กรุณากดลบอีกครั้ง', 'ai_proposal_stale');
    }
  }
  await db.finishProposal(userId, proposal.id, 'applied');
  return { status: 'applied', kind: proposal.kind, allJobs: true, count: deleted, path: '/jobs' };
}

/** Apply a proposal the user confirmed, through the app's own save with the version the AI read. */
export async function confirmProposal(db: AssistantDb, userId: string, proposalId: string, options: { channel?: 'app' | 'line' } = {}): Promise<ConfirmResult> {
  const proposal = await db.claimProposal(userId, proposalId);
  if (!proposal) throw new HttpError(409, 'รายการนี้ยืนยันไปแล้วหรือหมดเวลา กรุณาขอให้เลขาเตรียมใหม่', 'ai_proposal_gone');
  if (proposal.userId !== userId) throw new HttpError(403, 'ข้อมูลบัญชีไม่ตรงกับผู้ใช้งาน', 'ai_account_mismatch');
  if (isDeleteAll(proposal)) return applyDeleteAll(db, userId, proposal);
  let changes;
  try {
    changes = proposalChanges(proposal, proposal.baseVersion);
  } catch {
    await db.finishProposal(userId, proposalId, 'stale');
    throw new HttpError(409, 'ข้อมูลที่เตรียมไว้ไม่ผ่านการตรวจของแอป กรุณาขอให้เลขาเตรียมใหม่', 'ai_proposal_invalid');
  }
  let applied: boolean;
  try { applied = await db.applyChanges(userId, changes); }
  catch (error) {
    // Not applied: the user may press confirm again.
    await db.finishProposal(userId, proposalId, 'pending').catch(() => undefined);
    throw error;
  }
  if (!applied) {
    await db.finishProposal(userId, proposalId, 'stale');
    throw new HttpError(409, 'รายการนี้ถูกแก้ไขจากอีกช่องทางหลังเลขาเตรียมไว้ กรุณาขอให้เลขาเตรียมใหม่', 'ai_proposal_stale');
  }
  await db.finishProposal(userId, proposalId, 'applied');
  // A confirmed correction becomes this account's rule (package B); learning never costs the confirmation.
  await learnFromConfirmed(db, userId, proposal, options.channel ?? 'app').catch(() => console.warn('assistant: correction not learned'));
  const target = proposalTarget(proposal.kind);
  if (target.table === 'cashflow_jobs') return { status: 'applied', kind: proposal.kind, jobId: proposal.jobId, path: jobPath(proposal.kind, proposal.jobId) };
  const path = target.table === 'cashflow_invoices' ? (target.op === 'delete' ? '/invoice' : documentPath({ id: proposal.jobId, documentType: proposal.record!.documentType as 'quotation' | 'invoice' }))
    : target.table === 'cashflow_expenses' ? '/incomeExpense' : target.table === 'cashflow_goals' ? '/split' : proposal.kind === 'edit_issuer_profile' ? '/invoice' : '/settings';
  return { status: 'applied', kind: proposal.kind, recordId: proposal.jobId, path,
    ...(target.table === 'cashflow_invoices' && target.op !== 'delete' ? { documentId: proposal.jobId } : {}) };
}

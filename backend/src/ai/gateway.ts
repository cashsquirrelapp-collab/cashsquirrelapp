import { randomUUID } from 'node:crypto';
import type { UserRow } from '../services/lineAssistant.js';
import type { AiConfig } from './config.js';
import { costSplit, costUsd, krarokTokens } from './cost.js';
import { cleanAnswerText } from './moneyChart.js';
import { guardReply, type GuardHit } from './confidentiality.js';
import { billingIssueOf, type BillingIssue } from './billing.js';
import { confidentialAnswer, founderAnswer, founderBlock, founderTopic, mentionsFounder, techQuestion } from './founderKnowledge.js';
import { detectSignals, lookupSignal, type KnowledgeSignal } from './signals.js';
import { knowledgeSnippets, lookupKnowledge } from './knowledge.js';
import { PROMPT_VERSION, bangkokNow, buildSystemPrompt, type PromptSlots } from './prompt.js';
import { geminiProvider } from './providers/gemini.js';
import { openaiProvider } from './providers/openai.js';
import { anthropicProvider } from './providers/anthropic.js';
import { featureNavigation } from './navigation.js';
import { clearMemoryCommand, decideRoute, routingRecord, wherePage, type Direct, type RoutingOutcome, type RoutingRecord } from './routingPolicy.js';
import { accountContext, createToolbox, toolsFor, type MemoryStore, type ProposalStore } from './tools.js';
import { emptyUsage, partialUsageOf, ProviderError, subtractUsage, withPartialUsage, type AssistantCard, type ChatTurn, type Effort, type Provider, type ProviderName, type ProviderResult, type Route, type ToolCall, type ToolOutcome, type Usage } from './types.js';
import type { VaultLoader } from './vaultQueries.js';
import { offerLine, offerState } from './bridge.js';
import { styleReply } from './replyStyle.js';

// One request to เลขากระรอก: pick the model (routingPolicy.ts), build the prompt, run the model with the account's tools,
// and hand over from the chat model to the action model when the user wants something done. Returns the reply,
// the cards to draw and what it cost. Nothing is saved here except what the user asked to be remembered;
// changes come back as proposals the user confirms.

const MAX_HISTORY_TURNS = 12;
const MAX_TURN_CHARS = 2000;
/** The message being answered may be long (a pasted list, owner 2026-10-24); earlier turns stay short. */
export const MAX_MESSAGE_CHARS = 6000;

export class AiUnavailableError extends Error {
  constructor(readonly reason: 'disabled' | 'missing_key') { super(`AI unavailable: ${reason}`); }
}

export interface AssistantRequest {
  user: UserRow;
  plan: PromptSlots['plan'];
  text: string;
  /** Earlier turns of this conversation, oldest first (the gateway keeps only the most recent ones). */
  history?: ChatTurn[];
  hasAttachment?: boolean;
  /** A picture or PDF with this message (checked by attachment.ts); it goes to the action model. */
  attachment?: { name: string; mimeType: string; data: string };
  pendingConfirmation?: boolean;
  pageName?: string;
  channel?: 'app' | 'line';
  preferredName?: string;
  communicationProfile?: string;
  memories?: string[];
  trialLeft?: number;
  tokensLeft?: number;
  /** Verified subscription/token-cycle metadata, supplied by the server, never by a chat body. */
  access?: { period_end: string | null; tokens_reset_at: string | null; token_limit: number | null };
  /** Skip the router (the model comparison runs each case on a fixed route). */
  forceRoute?: Route;
  /** The app's spend today and its daily cap, from the reservation (server data); drives the soft budget. */
  budget?: { spentTodayUsd: number; capUsd: number };
  /** Which cache the shared rules get on Claude: '1h' while Sonnet is busy, '5m' while it is quiet (from the reservation). */
  cacheHint?: '1h' | '5m';
}

export interface AssistantDependencies {
  config: AiConfig;
  proposals: ProposalStore;
  memory: MemoryStore;
  loadVaultFiles?: VaultLoader;
  providers?: Partial<Record<ProviderName, Provider>>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: Date;
  /** Sees every tool call and its result (the model comparison uses it to check figures against the data). */
  observe?: (call: ToolCall, outcome: ToolOutcome) => void;
  /** Claude prompt cache mode, for the cost comparison only (production: request.cacheHint, else '1h'). */
  claudeCache?: '1h' | '5m' | 'auto' | 'off';
}

export interface ModelCall {
  route: Route;
  provider: ProviderName;
  model: string;
  usage: Usage;
  /** Real provider spend of this call. */
  costUsd: number;
  /** What the user pays for it (costSplit): the shared rules' cache write priced as a read; 0 for a failed attempt. */
  billableUsd: number;
  /** The app's own share: the shared cache write, or the whole of a failed attempt. */
  overheadUsd: number;
  cacheSavedUsd: number;
  steps: number;
  toolCalls: { name: string; args: unknown }[];
  stoppedAt?: ProviderResult['stoppedAt'];
  /** A smart-model attempt that failed after these rounds; the request went on without it. */
  failed?: boolean;
}

export interface AssistantReply {
  route: Route;
  handedOff: boolean;
  text: string;
  cards: AssistantCard[];
  calls: ModelCall[];
  /** Real provider spend of the whole request (every call, failed attempts included). */
  costUsd: number;
  /** What the user pays (Krarok Tokens come from this) and the app's own share of costUsd. */
  billableUsd: number;
  overheadUsd: number;
  /** Krarok Tokens to charge for this request. */
  tokens: number;
  promptVersion: string;
  /** What an attached file shows (note_from_file), for the chat to send with its later messages. */
  memo?: string;
  /** Feature knowledge signals of this message (signals.ts), for the owner's report; never charged. */
  signals?: KnowledgeSignal[];
  /** Why this model, what each model cost, escalations and the outcome (cashflow_ai_usage.routing); no user words. */
  routing?: RoutingRecord;
}

const providerFor = (model: string): ProviderName => (/^gemini/i.test(model) ? 'gemini' : /^claude/i.test(model) ? 'anthropic' : 'openai');

const FALLBACK_TEXT = {
  // Never ask the owner to send it one step at a time (owner, 2026-10-24: "บอกทีละขั้นตอน ... มันก็เสียเวลา").
  max_steps: 'ขออภัยครับ คำขอนี้ยังทำไม่เสร็จในรอบเดียว ลองบอกชื่องานหรือลูกค้าให้ชัดขึ้นอีกนิดได้ไหมครับ',
  proposal_at_limit: 'เตรียมรายการที่แสดงบนการ์ดให้ตรวจแล้วครับ ยังไม่ได้บันทึก กรุณาตรวจรายละเอียดก่อนกดยืนยัน หากขอหลายอย่าง ให้ตรวจว่าการ์ดครอบคลุมครบก่อนครับ',
  empty: 'ขออภัยครับ ตอนนี้ยังตอบไม่ได้ ลองพิมพ์ใหม่อีกครั้งนะครับ',
  // A questions card with no words from the model (it ends the turn).
  questions: 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ',
  // Sonnet failed on a change the light model must not take over (owner's brief, 2026-10-25, phase 5).
  blocked: 'ขออภัยครับ ตอนนี้ระบบที่ใช้ทำงานนี้ขัดข้องชั่วคราว จึงยังไม่ได้เตรียมหรือแก้รายการใด กรุณาลองใหม่อีกครั้งในอีกสักครู่ครับ',
};
// Tools whose success leaves something behind (a saved proposal or memory). After one ran, the request is never
// answered again by the other model, so nothing is prepared twice (brief: no repeated tool action on a model switch).
const LASTING = /^(?:propose_|remember$|forget_memory$)/;

function trimHistory(history: ChatTurn[] = []): ChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map(turn => ({ role: turn.role, text: turn.text.slice(0, MAX_TURN_CHARS) }));
}

/** A file was sent earlier in the chat (routingPolicy.ts keeps the rule; exported here for earlier importers). */
export { FILE_MARK } from './routingPolicy.js';

export async function runAssistant(request: AssistantRequest, deps: AssistantDependencies): Promise<AssistantReply> {
  const started = Date.now();
  const { config } = deps;
  if (!config.enabled) throw new AiUnavailableError('disabled');

  const providers: Record<ProviderName, Provider> = { gemini: geminiProvider, openai: openaiProvider, anthropic: anthropicProvider, ...deps.providers };
  const keys: Record<ProviderName, string | undefined> = { gemini: config.geminiKey, openai: config.openaiKey, anthropic: config.anthropicKey };
  // Which model and tools (routingPolicy.ts, version 2 unless AI_ROUTING_POLICY=v1): Sonnet for documents, deletes,
  // important edits, complex changes, files, long texts and analysis when it is set and its key exists; everything
  // else, and every request while the key is missing, stays light. A reply to the smart model's own question stays
  // with it (2026-10-24: the owner's address and tax ID, sent after Sonnet asked for the quotation's issuer, went to
  // Gemini and came back empty).
  const policy = config.routingPolicy ?? 'v2';
  const hasFile = request.hasAttachment || Boolean(request.attachment);
  const decision = decideRoute({ text: request.text, history: request.history, hasAttachment: hasFile, pendingConfirmation: request.pendingConfirmation }, policy);
  const smartReady = Boolean(config.smartModel && keys[providerFor(config.smartModel)]);
  // Soft budget (cost brief, phase 7): past this share of the app's daily cap nothing optional calls Sonnet: no step
  // up from Gemini, and analysis or a long text that Sonnet would only do better stays light. Documents, deletes and
  // important edits still go to Sonnet; the cap itself stops everything (cashflow_ai_reserve).
  const soft = Boolean(request.budget && request.budget.capUsd > 0 && request.budget.spentTodayUsd >= request.budget.capUsd * (config.softBudgetShare ?? 0.8));
  let smart = smartReady && decision.tier === 'smart' && !(soft && !decision.smartRequired) ? config.smartModel : undefined;
  let required = decision.smartRequired;
  const lightModel = (route: Route) => route === 'chat' ? config.chatModel : config.actionModel;
  const modelFor = (route: Route) => smart ?? lightModel(route);
  const firstRoute = request.forceRoute ?? decision.tools;
  // Both keys are checked up front: a chat request can hand over to the action model mid-request. The light
  // models are the ones checked, because a hard request falls back to them when the smart model fails.
  for (const route of firstRoute === 'chat' ? ['chat', 'action'] as const : ['action'] as const) {
    if (!keys[providerFor(lightModel(route))]) throw new AiUnavailableError('missing_key');
  }

  const toolbox = createToolbox({ user: request.user, proposals: deps.proposals, memory: deps.memory, loadVaultFiles: deps.loadVaultFiles, now: deps.now,
    isAdmin: request.plan === 'admin', requestText: request.text, hasAttachment: Boolean(request.attachment) });
  const memos: string[] = [];
  const signals: KnowledgeSignal[] = detectSignals(request.text, request.history);
  const calls: ModelCall[] = [];
  const cards: AssistantCard[] = [];
  // For the routing log: what happened besides the first model's answer.
  const escalations: string[] = [];
  const toolNames: string[] = [];
  let fallback: 'light' | 'blocked' | null = null;
  let providerRetries = 0;
  let lasting = 0;
  let failedWrites = 0;
  let directUsed = false;
  const guardHits: GuardHit[] = [];
  const billing: BillingIssue[] = [];

  const reply = (text: string, handedOff: boolean, outcome: RoutingOutcome): AssistantReply => {
    const sum = (pick: (call: ModelCall) => number) => calls.reduce((total, call) => total + pick(call), 0);
    const total = sum(call => call.costUsd);
    const billable = sum(call => call.billableUsd);
    const round = (value: number) => Number(value.toFixed(6));
    const routing = routingRecord(decision, {
      ...(decision.direct && !directUsed ? { tier: decision.tier, reason: `${decision.reason}_declined` } : {}),
      tools_first: firstRoute, handed_off: handedOff, escalations, fallback, provider_retries: providerRetries,
      calls: calls.map(call => ({ provider: call.provider, model: call.model, route: call.route, usd: round(call.costUsd), billable_usd: round(call.billableUsd),
        input: call.usage.inputTokens, cached: call.usage.cachedInputTokens, write: call.usage.cacheWriteTokens || 0, write_1h: call.usage.cacheWrite1hTokens || 0,
        output: call.usage.outputTokens, thinking: call.usage.thinkingTokens, steps: call.steps, ...(call.failed ? { failed: true } : {}) })),
      tool_calls: toolNames.slice(0, 30), latency_ms: Math.max(0, Date.now() - started), outcome,
      proposal_ids: cards.flatMap(card => (card.kind === 'confirm' ? [card.id] : [])).slice(0, 20),
      cost: { actual_usd: round(total), billable_usd: round(billable), cache_overhead_usd: round(sum(call => (call.failed ? 0 : call.overheadUsd))),
        failed_attempt_usd: round(sum(call => (call.failed ? call.costUsd : 0))), quota_overrun_usd: 0, cache_saved_usd: round(sum(call => call.cacheSavedUsd)) },
      ...(soft ? { budget: 'soft' as const } : {}),
      ...(guardHits.length ? { guard: guardHits } : {}),
      ...(billing.length ? { billing } : {}),
      ...(calls.some(call => call.provider === 'anthropic') ? { claude_cache: deps.claudeCache ?? request.cacheHint ?? '1h' } : {}),
    });
    return {
      route: handedOff ? 'action' : firstRoute, handedOff, text, cards, calls,
      // Krarok Tokens come from what the user pays, never from the shared cache write or a failed attempt. A rare
      // message that still ends above the ceiling (its last round) is charged the ceiling; the app pays the rest.
      // Nothing is charged when no model answered (an exact answer, or a change held back while Sonnet is down).
      costUsd: total, billableUsd: billable, overheadUsd: Math.max(0, total - billable),
      tokens: billable > 0 ? Math.min(krarokTokens(billable, config.tokenUsd), config.messageTokenCap) : 0, promptVersion: PROMPT_VERSION,
      routing,
      ...(memos.length ? { memo: memos.join('\n').slice(0, 1500) } : {}),
      ...(signals.length ? { signals: signals.slice(0, 3) } : {}),
    };
  };

  // Exact questions need no model (brief, phase 2): where a page is, a plain "call me …" / "no emoji", who made
  // Krarok and why, and what AI is behind เลขา. Anything the rule cannot answer goes on to the model as usual.
  const answerDirectly = async (kind: Direct): Promise<{ text: string; cards: AssistantCard[] } | undefined> => {
    if (kind === 'founder') {
      const topic = founderTopic(request.text);
      return topic ? { text: founderAnswer(topic, request.text), cards: [] } : undefined;
    }
    if (kind === 'confidential') {
      const asked = techQuestion(request.text);
      return asked ? { text: confidentialAnswer(asked, request.text), cards: [] } : undefined;
    }
    if (kind === 'knowledge') {
      const page = wherePage(request.text);
      const card = page ? featureNavigation(page, { isAdmin: request.plan === 'admin', requestText: request.text }, true) : undefined;
      return card?.kind === 'navigation' ? { text: `อยู่ที่หน้า **${card.label}** ครับ กดปุ่มด้านล่างเพื่อเปิดได้เลย`, cards: [card] } : undefined;
    }
    const memory = clearMemoryCommand(request.text);
    if (!memory) return undefined;
    toolNames.push('remember');
    const outcome = await toolbox({ id: 'direct-memory', name: 'remember', args: { ...memory } });
    if ((outcome.result as { ok?: unknown } | null)?.ok !== true) return undefined;
    return { text: memory.kind === 'emoji' ? 'รับทราบครับ ต่อไปจะไม่ใช้อีโมจิ' : `รับทราบครับ ต่อไปจะเรียกว่า “${memory.value}”`, cards: [] };
  };
  if (decision.direct && !request.forceRoute) {
    const direct = await answerDirectly(decision.direct);
    if (direct) {
      directUsed = true;
      cards.push(...direct.cards);
      return reply(direct.text, false, 'direct');
    }
  }

  const knowledge = knowledgeSnippets(lookupKnowledge(request.text, 3));
  // The founder's approved text, only for a message about the founder (or a follow-up to one), never every message.
  const founder = [request.text, ...(request.history ?? []).slice(-2).map(turn => turn.text)].some(mentionsFounder) ? founderBlock() : undefined;
  const context = accountContext(request.user, deps.now, request.access);
  const turns: ChatTurn[] = [...trimHistory(request.history), { role: 'user', text: request.text.slice(0, MAX_MESSAGE_CHARS), ...(request.attachment ? { attachment: request.attachment } : {}) }];

  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;

  let lastEditError: string | undefined;
  // Per-message ceiling (owner, 2026-10-24: 100 Krarok Tokens a message). Before each further tool round the loop
  // stops if the cost so far plus one more round like the last would pass it; the cards prepared so far stay.
  // The ceiling counts what the user pays (the shared cache write is the app's, cost brief phase 4); the request's own
  // safety limit counts the real spend. Either one stops before another paid round, never in the middle of one.
  const ceilingUsd = config.messageTokenCap * config.tokenUsd;
  const billableBefore = () => calls.reduce((sum, call) => sum + call.billableUsd, 0);
  const actualBefore = () => calls.reduce((sum, call) => sum + call.costUsd, 0);
  const record = (route: Route, name: ProviderName, model: string, usage: Usage, steps: number, extra: Partial<ModelCall> = {}) => {
    const split = costSplit(name, model, usage);
    const failed = extra.failed === true;
    calls.push({ route, provider: name, model, usage, costUsd: split.actual, billableUsd: failed ? 0 : split.billable,
      overheadUsd: failed ? split.actual : split.cacheOverhead, cacheSavedUsd: split.cacheSaved, steps, toolCalls: [], ...extra });
  };
  /** A failed attempt's finished rounds still cost real money: counted, never charged to the user. */
  const noteFailed = (route: Route, error: unknown) => {
    const issue = billingIssueOf(error);
    if (issue && !billing.includes(issue)) billing.push(issue);
    const partial = partialUsageOf(error);
    if (partial && (partial.usage.inputTokens || partial.usage.outputTokens)) record(route, partial.provider, partial.model, partial.usage, 0, { failed: true });
  };

  const run = async (route: Route, handoff?: string): Promise<ProviderResult> => {
    lastEditError = undefined;
    const availableTools = toolsFor(route);
    const allowed = new Set(availableTools.map(tool => tool.name));
    // What this run prepared, kept here so a provider failure after it cannot lose a saved card (cost brief, phase 4).
    const prepared: AssistantCard[] = [];
    let lastingHere = 0;
    const execute = async (call: ToolCall) => {
      const permitted = allowed.has(call.name);
      const outcome = permitted ? await toolbox(call) : { result: { ok: false, error: 'เครื่องมือนี้ไม่เปิดให้ใช้ในคำขอนี้' } };
      toolNames.push(call.name);
      const succeeded = permitted && (outcome.result as { ok?: unknown } | null)?.ok !== false;
      if (succeeded && LASTING.test(call.name)) { lasting += 1; lastingHere += 1; }
      if ('card' in outcome && outcome.card) prepared.push(outcome.card);
      if ('extraCards' in outcome && outcome.extraCards) prepared.push(...outcome.extraCards);
      if (/^propose_/.test(call.name) && !succeeded) failedWrites += 1;
      if ('memo' in outcome && outcome.memo && !memos.includes(outcome.memo)) memos.push(outcome.memo);
      if (call.name === 'feature_lookup') {
        const missed = lookupSignal(String((call.args as { query?: unknown } | undefined)?.query ?? ''));
        if (missed && !signals.some(signal => signal.kind === 'not_found')) signals.push(missed);
      }
      // This edit tool returns local validation messages, never provider text or raw service errors.
      // Preserve the last actionable failure at the budget boundary without buying another turn.
      // A later tool result clears it, so an earlier, already-resolved failure cannot leak through.
      const validation = outcome.result as { ok?: unknown; error?: unknown } | null;
      lastEditError = permitted && call.name === 'propose_edit_job'
        && validation?.ok === false && typeof validation.error === 'string'
        ? validation.error.slice(0, 1200) : undefined;
      deps.observe?.(call, outcome);
      return outcome;
    };
    const model = modelFor(route);
    const name = providerFor(model);
    const system = buildSystemPrompt({
      route, plan: request.plan, trialLeft: request.trialLeft, tokensLeft: request.tokensLeft,
      preferredName: request.preferredName, communicationProfile: request.communicationProfile, memories: request.memories,
      nowLocal: bangkokNow(deps.now), pageName: request.pageName, channel: request.channel, knowledge, founder, accountContext: context,
      offer: offerLine(offerState(request.text, request.history)),
    }) + (handoff ? `\n\nHANDOVER FROM THE CONVERSATION ASSISTANT: ${handoff}` : '');
    // Gemini Flash-Lite thinks least by default; the action model reasons a little before changing data.
    // Claude reasons more on changes (medium) and answers questions at low effort.
    const effort: Effort = name === 'anthropic' ? (route === 'chat' ? 'low' : 'medium') : route === 'chat' && name === 'gemini' ? 'minimal' : 'low';
    // The next round is estimated from the last one with its cache writes priced as reads: the shared rules are
    // written once (the first request of an hour) and read on every round after it.
    let previous = emptyUsage();
    const overBudget = (usage: Usage) => {
      const last = subtractUsage(usage, previous);
      previous = usage;
      const next = costUsd(name, model, { ...last, cachedInputTokens: last.cachedInputTokens + (last.cacheWriteTokens || 0), cacheWriteTokens: 0, cacheWrite1hTokens: 0 });
      const now = costSplit(name, model, usage);
      return billableBefore() + now.billable + next > ceilingUsd || actualBefore() + now.actual + next > (config.requestCostLimitUsd ?? 0.3);
    };
    let result: ProviderResult;
    try {
      result = await providers[name].run({
        apiKey: keys[name]!, model, system, turns, tools: availableTools,
        maxOutputTokens: config.maxOutputTokens[route], effort, execute,
        maxSteps: config.maxToolSteps, signal, fetchImpl: deps.fetchImpl, overBudget,
        onRetry: () => { providerRetries += 1; }, ...(deps.claudeCache ?? request.cacheHint ? { cacheMode: deps.claudeCache ?? request.cacheHint } : {}),
      });
    } catch (error) {
      // A card was prepared and saved before the provider failed (a timeout on the closing line, an outage): keep it,
      // so the user can confirm it instead of asking again and getting it prepared twice.
      if (!(lastingHere > 0 && prepared.some(card => card.kind === 'confirm' || card.kind === 'questions'))) throw withPartialUsage(error, { usage: previous, provider: name, model });
      result = { provider: name, model, text: '', usage: previous, toolCalls: [], cards: prepared, steps: 0, stoppedAt: 'interrupted' };
    }
    record(route, name, result.model || model, result.usage, result.steps, { toolCalls: result.toolCalls, ...(result.stoppedAt ? { stoppedAt: result.stoppedAt } : {}) });
    cards.push(...result.cards);
    return result;
  };
  const held = (route: Route): ProviderResult => ({ provider: providerFor(lightModel(route)), model: '', text: FALLBACK_TEXT.blocked, usage: emptyUsage(), toolCalls: [], cards: [], steps: 0 });

  // The smart model failing (credit used up, a wrong key, an outage) never stops เลขา: while time is left, the same
  // request is answered again by the light model. Cards from the failed attempt are dropped with it; their saved
  // proposals expire unconfirmed after 30 minutes. Version 2 holds back a document, delete, important edit or complex
  // change instead (the light model must not make those for Sonnet), and anything after a saved proposal or memory.
  const attempt = async (route: Route, handoff?: string): Promise<ProviderResult> => {
    if (!smart) return run(route, handoff);
    try { return await run(route, handoff); }
    catch (error) {
      if (!(error instanceof ProviderError) || signal.aborted) throw error;
      console.warn('ai: smart model failed', { model: smart, status: error.status });
      noteFailed(route, error);
      smart = undefined;
      if (policy === 'v2' && ((required && !config.lightFallbackWrites) || lasting > 0)) { fallback = 'blocked'; return held(route); }
      fallback = 'light';
      return run(route, handoff);
    }
  };

  let result = await attempt(firstRoute);
  let handedOff = false;
  if (firstRoute === 'chat' && result.handoff !== undefined) {
    handedOff = true;
    const summary = result.handoff || request.text;
    // The conversation model handed over a change Sonnet makes (a document, a delete, an important edit): the action
    // model is Sonnet then (brief, phase 5). Plain changes stay with the light action model.
    if (policy === 'v2' && !smart && smartReady && !fallback && !soft) {
      const next = decideRoute({ text: `${summary}\n${request.text}` }, 'v2');
      if (next.tier === 'smart' && next.smartRequired) {
        escalations.push(`handoff_${next.reason}`);
        smart = config.smartModel;
        required = true;
      }
    }
    result = await attempt('action', summary);
  }
  const lastRoute: Route = handedOff ? 'action' : firstRoute;
  const again = handedOff ? request.text : undefined;
  if (policy === 'v1') {
    // The light model sometimes ends with no text and no card. While time is left, the smart model answers once more
    // instead of the user seeing "ตอนนี้ยังตอบไม่ได้".
    if (!result.text.trim() && !cards.length && !result.stoppedAt && !smart && smartReady && !soft && !signal.aborted) {
      escalations.push('empty_answer');
      smart = config.smartModel;
      result = await attempt(lastRoute, again);
    }
  } else if (!cards.length && !smart && smartReady && !soft && !fallback && !escalations.length && !lasting && !signal.aborted && billableBefore() < ceilingUsd / 2) {
    // One step up at most, only when the light model could not finish and left nothing behind: no answer, stuck in
    // tool calls, or its change kept failing the tool's checks. If Sonnet then fails, the light answer stands.
    const reason = !result.text.trim() && !result.stoppedAt ? 'empty_answer'
      : result.stoppedAt === 'max_steps' ? 'max_steps' : failedWrites >= 3 ? 'tool_errors' : undefined;
    if (reason) {
      escalations.push(reason);
      smart = config.smartModel;
      const light = result;
      try { result = await run(lastRoute, again); }
      catch (error) {
        if (!(error instanceof ProviderError) || signal.aborted) throw error;
        console.warn('ai: smart model failed after the light answer', { model: smart, status: error.status });
        noteFailed(lastRoute, error);
        smart = undefined;
        fallback = 'light';
        result = light;
      }
    }
  }

  // Same response contract for Gemini and Sonnet: no character-drawn charts, no table repeating a money card. Then the
  // confidentiality check (Master Backlog Part 3): no AI provider or model names, internals or keys, for every account.
  // House style (replyStyle.ts): no emoji unless the user used them, no made-up tool links.
  const styled = styleReply(cleanAnswerText(result.text, cards), { userText: request.text, preferences: [request.communicationProfile, ...(request.memories ?? [])] });
  const checked = guardReply(styled, { userText: request.text, userData: () => JSON.stringify(request.user) });
  guardHits.push(...checked.hits);
  const answer = checked.text;
  const hasConfirm = cards.some(card => card.kind === 'confirm');
  const text = answer
    || (hasConfirm && result.stoppedAt ? FALLBACK_TEXT.proposal_at_limit
      // Questions shown: say so, never "could not finish" (2026-10-25: a first-of-the-hour Sonnet request).
      : cards.some(card => card.kind === 'questions') ? FALLBACK_TEXT.questions
      : result.stoppedAt ? lastEditError || FALLBACK_TEXT.max_steps
      : cards.length ? '' : FALLBACK_TEXT.empty);
  // (fallback is set inside attempt(); TypeScript does not see that.)
  const outcome: RoutingOutcome = (fallback as typeof fallback | 'blocked') === 'blocked' ? 'blocked'
    : cards.some(card => card.kind === 'confirm') ? 'card'
    : cards.some(card => card.kind === 'questions') ? 'questions'
    : result.stoppedAt ?? (answer || cards.length ? 'answer' : 'empty');
  return reply(text, handedOff, outcome);
}

/** The routing log of a request that failed before an answer (the service saves it with the released usage row). */
export function failedRouting(request: Pick<AssistantRequest, 'text' | 'history' | 'hasAttachment' | 'attachment' | 'pendingConfirmation'>, config: AiConfig, error: unknown, latencyMs: number): RoutingRecord {
  const decision = decideRoute({ text: request.text, history: request.history, hasAttachment: request.hasAttachment || Boolean(request.attachment), pendingConfirmation: request.pendingConfirmation }, config.routingPolicy ?? 'v2');
  const name = (error as Error | undefined)?.name;
  const issue = billingIssueOf(error);
  const kind = issue ? `billing_${issue}` : error instanceof AiUnavailableError ? `unavailable_${error.reason}`
    : error instanceof ProviderError ? `provider_${error.provider}_${error.status}`
    : name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'other';
  // The rounds that finished before the failure still cost real money: logged as the app's, never charged.
  const partial = partialUsageOf(error);
  const actual = partial ? costUsd(partial.provider, partial.model, partial.usage) : 0;
  return routingRecord(decision, { outcome: 'error', error: kind, latency_ms: Math.max(0, latencyMs),
    ...(partial && actual > 0 ? {
      calls: [{ provider: partial.provider, model: partial.model, route: decision.tools, usd: Number(actual.toFixed(6)), billable_usd: 0, input: partial.usage.inputTokens,
        cached: partial.usage.cachedInputTokens, write: partial.usage.cacheWriteTokens || 0, write_1h: partial.usage.cacheWrite1hTokens || 0,
        output: partial.usage.outputTokens, thinking: partial.usage.thinkingTokens, steps: 0, failed: true }],
      cost: { actual_usd: Number(actual.toFixed(6)), billable_usd: 0, cache_overhead_usd: 0, failed_attempt_usd: Number(actual.toFixed(6)), quota_overrun_usd: 0, cache_saved_usd: 0 },
    } : {}) });
}

/** Proposals and memories kept in memory: for tests and the model comparison (the handler uses the database). */
export function memoryStores() {
  const proposals = new Map<string, import('./tools.js').Proposal>();
  const remembered: { id: string; userId: string; kind: string; value: string }[] = [];
  return {
    proposals: { async save(proposal) { proposals.set(proposal.id, proposal); } } as ProposalStore,
    memory: {
      async remember(userId, kind, value) { remembered.push({ id: randomUUID(), userId, kind, value }); },
      async list(userId) { return remembered.filter(row => row.userId === userId).map(({ id, kind, value }) => ({ id, kind, value })); },
      async forget(userId, rows) {
        const ids = new Set(rows.map(row => row.id));
        const before = remembered.length;
        for (let index = remembered.length - 1; index >= 0; index--) if (remembered[index].userId === userId && ids.has(remembered[index].id)) remembered.splice(index, 1);
        return before - remembered.length;
      },
    } as MemoryStore,
    saved: proposals,
    remembered,
  };
}

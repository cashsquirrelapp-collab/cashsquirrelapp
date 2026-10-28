import type { MoneyChartCard } from './moneyChart.js';
import type { AskQuestion } from '../../../shared/askQuestions.js';
// เลขากระรอก AI Gateway: the shapes every part of the gateway shares. Nothing here calls a provider.

export type Route = 'chat' | 'action';
export type ProviderName = 'gemini' | 'openai' | 'anthropic';
export type Effort = 'minimal' | 'low' | 'medium';

/** `attachment`: a picture or PDF sent with this one user turn (never stored). */
export interface ChatTurn { role: 'user' | 'assistant'; text: string; attachment?: { name: string; mimeType: string; data: string } }

/** A tool as the models see it: a name, what it is for, and a JSON-Schema object for its arguments. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolCall { id: string; name: string; args: Record<string, unknown> }

/** What a tool hands back: the data the model reads, plus anything the chat screen should draw. */
export interface ToolOutcome {
  result: unknown;
  /** note_from_file: what an attached file shows, carried into later messages (the file is not sent again). */
  memo?: string;
  /** A card for the chat (same kinds the screen already draws: summary, project, document, confirm). */
  card?: AssistantCard;
  /** More cards from the same tool call (several documents found). */
  extraCards?: AssistantCard[];
  /** Set by route_to_action: the chat model asks the gateway to hand the request to the action model. */
  handoff?: string;
  /**
   * The turn ends after this tool round (ask_user: the user answers next). The model's own words from the same
   * response are the reply; no further paid round only to write a lead-in line (cost brief, 2026-10-25).
   */
  endTurn?: boolean;
  /**
   * A card was prepared (owner, 2026-10-28: fewer tokens). When every call of a step closes it, the turn ends there:
   * the gateway shows the lines the model put in the call's say field, with no paid round only to write them.
   */
  closesTurn?: boolean;
}

/** A field the user may change on a confirmation card before confirming (owner, 2026-10-24: "แก้ไขยอดได้ในแชทเลย"). */
export interface EditField { field: string; label: string; type: 'text' | 'money' | 'date' | 'choice'; value: string; options?: string[] }
export type AssistantCard =
  | { kind: 'summary'; period: string; income: string; expense: string; balance: string;
      /** The money left against the month before (this month only): "+฿2,100 จากเดือนก่อน" (owner's design A, 2026-10-27). */
      previous?: { change: string; direction: 'up' | 'down' | 'same' };
      /** The part of the income spent, 0 and up (above 1 when more went out than came in); absent without income. */
      spentShare?: number }
  | { kind: 'project'; name: string; client: string; amount: string; status: string }
  | { kind: 'document'; docType: string; number: string; client: string; amount: string; path: string }
  | { kind: 'navigation'; label: string; path: string; autoOpen: boolean }
  | { kind: 'confirm'; id: string; title: string; changes: { label: string; value: string }[]; edit?: EditField[];
      /** Set when a stored chat is opened again, or when the app saved it at once (the user said to save): what became
       * of the proposal since. */
      status?: 'pending' | 'applied' | 'cancelled' | 'stale' | 'expired';
      /** Where the saved record opens in the app (a saved job opens in its form). */
      path?: string }
  /** Tap-to-answer questions (owner, 2026-10-24: tick the answers instead of typing them), with a calendar, when the
   * client pays and a party's details where needed (shared/askQuestions.ts, 2026-10-25). */
  | { kind: 'questions'; id: string; questions: AskQuestion[] }
  /** Several months of money (financial_summary), drawn as a chart from the tool's own figures (moneyChart.ts). */
  | MoneyChartCard
  /** An official website (accounting/officialLinks.ts): chosen by id from a fixed list, never a URL from a model. */
  | { kind: 'official_link'; id: string; org: string; title: string; description: string; todo: string; url: string }
  /** Changing the account's name (owner, 2026-10-27: "อิงชื่อตามชื่อ account ... ให้มันเอาการ์ดมาแล้วก็ให้กรอกชื่อใหม่"): the user
   *  types or checks the name and saves it themselves through the profile API; เลขา only shows the card. */
  | { kind: 'rename'; current: string; suggested: string };

/**
 * cacheWriteTokens: Claude's prompt-cache writes, part of inputTokens, billed at 1.25× the input price for 5 minutes;
 * cacheWrite1hTokens: the part of them kept for an hour, billed at 2×.
 */
export interface Usage { inputTokens: number; cachedInputTokens: number; outputTokens: number; thinkingTokens: number; cacheWriteTokens?: number; cacheWrite1hTokens?: number;
  /** Of the 5-minute writes, the shared rules' part (estimated from their size; the 5-minute cache mode only). */
  sharedWrite5mTokens?: number }

export interface ProviderRequest {
  apiKey: string;
  model: string;
  system: string;
  turns: ChatTurn[];
  tools: ToolSpec[];
  maxOutputTokens: number;
  effort?: Effort;
  execute: (call: ToolCall) => Promise<ToolOutcome>;
  /** Tool rounds before the gateway stops the loop (each round is one more paid call). */
  maxSteps?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** One model call that takes longer than this is abandoned and tried once more (default 12 s). */
  stallMs?: number;
  /** Called with the usage so far after each tool round: true stops before another paid call (per-message ceiling). */
  overBudget?: (usage: Usage) => boolean;
  /** Called each time the adapter sends the same call again (a stall or a busy answer), for the routing log. */
  onRetry?: () => void;
  /**
   * Claude prompt cache for the shared rules: '1h' (default) an hour, '5m' five minutes (cheaper to write; the gateway
   * picks it while Sonnet is quiet); the rest of the prompt always 5 minutes. 'auto' and 'off' are for the cost
   * comparison only (no shared breakpoint; no cache at all).
   */
  cacheMode?: '1h' | '5m' | 'auto' | 'off';
}

export interface ProviderResult {
  provider: ProviderName;
  model: string;
  text: string;
  usage: Usage;
  toolCalls: { name: string; args: unknown }[];
  cards: AssistantCard[];
  handoff?: string;
  steps: number;
  /** interrupted: the provider failed after a card was prepared; the gateway kept the card (no action repeated). */
  stoppedAt?: 'max_steps' | 'budget' | 'interrupted';
  /** Every call of the last step prepared its card, so the turn ended there (ToolOutcome.closesTurn). */
  closed?: boolean;
}

export interface Provider {
  name: ProviderName;
  run(request: ProviderRequest): Promise<ProviderResult>;
}

/** A provider answered with an error the gateway should surface as "try again" (never a success). */
export class ProviderError extends Error {
  constructor(message: string, readonly status: number, readonly provider: ProviderName, readonly retryable: boolean) { super(message); }
}

/**
 * What a provider call had already used when it failed (the rounds that finished), carried on the error so the real
 * spend is still counted (cost brief: real API cost never disappears from the reports).
 */
export interface PartialUsage { usage: Usage; provider: ProviderName; model: string }
export function withPartialUsage(error: unknown, partial: PartialUsage): unknown {
  if (error && typeof error === 'object' && !('partialUsage' in error)) {
    Object.defineProperty(error, 'partialUsage', { value: partial, enumerable: false });
  }
  return error;
}
export function partialUsageOf(error: unknown): PartialUsage | undefined {
  return error && typeof error === 'object' ? (error as { partialUsage?: PartialUsage }).partialUsage : undefined;
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, thinkingTokens: 0 });
/** What one round added: running usage after it minus the running usage before it. */
export const subtractUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens - b.inputTokens, cachedInputTokens: a.cachedInputTokens - b.cachedInputTokens,
  outputTokens: a.outputTokens - b.outputTokens, thinkingTokens: a.thinkingTokens - b.thinkingTokens,
  cacheWriteTokens: (a.cacheWriteTokens || 0) - (b.cacheWriteTokens || 0), cacheWrite1hTokens: (a.cacheWrite1hTokens || 0) - (b.cacheWrite1hTokens || 0),
  sharedWrite5mTokens: (a.sharedWrite5mTokens || 0) - (b.sharedWrite5mTokens || 0),
});
export const addUsage = (a: Usage, b: Usage): Usage => {
  const cacheWriteTokens = (a.cacheWriteTokens || 0) + (b.cacheWriteTokens || 0);
  const cacheWrite1hTokens = (a.cacheWrite1hTokens || 0) + (b.cacheWrite1hTokens || 0);
  const sharedWrite5mTokens = (a.sharedWrite5mTokens || 0) + (b.sharedWrite5mTokens || 0);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    thinkingTokens: a.thinkingTokens + b.thinkingTokens,
    // Only Claude writes to its cache; other providers' usage keeps its four fields.
    ...(cacheWriteTokens ? { cacheWriteTokens } : {}),
    ...(cacheWrite1hTokens ? { cacheWrite1hTokens } : {}),
    ...(sharedWrite5mTokens ? { sharedWrite5mTokens } : {}),
  };
};

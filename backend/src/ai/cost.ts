import type { ProviderName, Usage } from './types.js';

// Real API cost per request, from the providers' published prices (checked 2026-10-24; see
// artifacts/ai-secretary/06-api-research.md). USD per 1M tokens. A model not listed here is charged at the
// most expensive listed rate, so an unknown model can never look cheaper than it is.
export const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, cachedInput: 0.025, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, cachedInput: 0.03, output: 2.5 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  // Anthropic first-party price (platform.claude.com/docs pricing, checked 2026-10-24): cache reads 0.05× input,
  // 5-minute cache writes 1.25×, 1-hour writes 2×. The owner chose Sonnet 5.5 for hard requests and no Haiku (2026-10-24).
  'claude-sonnet-5-5': { input: 2, cachedInput: 0.1, output: 10 },
};
const FALLBACK = { input: 2.5, cachedInput: 0.25, output: 15 };

/**
 * Gemini reports thinking separately from the answer (both billed as output); OpenAI's output count already
 * includes its reasoning tokens. Cached input is part of the input count for both.
 */
export function costUsd(provider: ProviderName, model: string, usage: Usage): number {
  const price = PRICES[model] ?? FALLBACK;
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const output = provider === 'gemini' ? usage.outputTokens + usage.thinkingTokens : usage.outputTokens;
  // Claude bills the tokens written to its prompt cache at 1.25× input for 5 minutes and 2× for an hour (the 1× is
  // already in `fresh`).
  const cacheWrite = (usage.cacheWriteTokens || 0) * price.input * 0.25 + (usage.cacheWrite1hTokens || 0) * price.input * 0.75;
  return (fresh * price.input + usage.cachedInputTokens * price.cachedInput + output * price.output + cacheWrite) / 1_000_000;
}

/** Krarok Tokens for a request: its real cost divided by the configured rate, rounded up, at least 1. */
export function krarokTokens(cost: number, tokenUsd: number): number {
  return Math.max(1, Math.ceil(cost / tokenUsd - 1e-9));
}

/**
 * What one model call cost, split three ways (owner's cost brief, 2026-10-25, phase 3):
 * - actual: everything the provider bills (input, output, cache writes and reads). This is what the daily cap and the
 *   reports count, so real spend never disappears.
 * - billable: what the user pays in Krarok Tokens. The shared rules' 1-hour cache write (the same prefix for every
 *   account, written by whoever asks first after it expired) is priced as a cache read, as if the cache had been warm.
 * - cacheOverhead: the difference, the app's own platform cost.
 * - cacheSaved: what cache reads saved against paying full input price for them.
 */
export interface CostSplit { actual: number; billable: number; cacheOverhead: number; cacheSaved: number }
export function costSplit(provider: ProviderName, model: string, usage: Usage): CostSplit {
  const actual = costUsd(provider, model, usage);
  const price = PRICES[model] ?? FALLBACK;
  const cacheSaved = (usage.cachedInputTokens * Math.max(0, price.input - price.cachedInput)) / 1_000_000;
  // The shared rules are written for an hour (exact, from the provider) or, while Sonnet is quiet, for 5 minutes
  // (their part of the 5-minute writes, estimated from their size by the adapter).
  const written = usage.cacheWriteTokens || 0;
  const shared1h = Math.min(usage.cacheWrite1hTokens || 0, written);
  const shared5m = Math.min(usage.sharedWrite5mTokens || 0, Math.max(0, written - (usage.cacheWrite1hTokens || 0)));
  const shared = shared1h + shared5m;
  if (!shared) return { actual, billable: actual, cacheOverhead: 0, cacheSaved };
  const billable = costUsd(provider, model, { ...usage, cachedInputTokens: usage.cachedInputTokens + shared,
    cacheWriteTokens: Math.max(0, written - shared), cacheWrite1hTokens: Math.max(0, (usage.cacheWrite1hTokens || 0) - shared1h) });
  return { actual, billable, cacheOverhead: Math.max(0, actual - billable), cacheSaved };
}

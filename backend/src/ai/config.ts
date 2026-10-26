// เลขากระรอก AI Gateway settings. Keys are Wrangler secrets (GEMINI_API_KEY, OPENAI_API_KEY) and never reach the
// browser, logs or the repository. Everything else is a plain variable so it can be changed without a release.
// The gateway is off unless AI_ENABLED is exactly "true".

export interface AiConfig {
  enabled: boolean;
  /** Rollout switch: false opens eligible Pro/trial plans; true retains the admin/email exception rollout. */
  adminsOnly: boolean;
  /** While adminsOnly is on, these accounts (emails, a Worker secret, never in the repository) may use it too. */
  allowedEmails: string[];
  chatModel: string;
  /** The smart model for hard requests (difficulty.ts), e.g. claude-sonnet-5-5; off when unset or its key is missing. */
  smartModel?: string;
  actionModel: string;
  /** Dictation (transcription.ts): a Gemini model that hears Thai well; AI_VOICE_MODEL changes it. */
  voiceModel: string;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  /** 1 Krarok Token = this much real API cost, in US dollars. */
  tokenUsd: number;
  proTokensPerCycle: number;
  /** Krarok Tokens for the whole free trial (owner, 2026-10-24: about 10 ordinary messages; heavy work uses more). */
  trialTokens: number;
  dailyCostCapUsd: number;
  maxOutputTokens: { chat: number; action: number };
  maxToolSteps: number;
  /** Most Krarok Tokens one message may cost the user (owner, 2026-10-24: 100). */
  messageTokenCap: number;
  timeoutMs: number;
  /** Model routing (routingPolicy.ts): v2 by default (owner's brief, 2026-10-25); AI_ROUTING_POLICY=v1 rolls back. */
  routingPolicy: 'v1' | 'v2';
  /**
   * When Sonnet fails at run time, may Gemini take over a document, delete, important edit or complex change? Off unless
   * AI_LIGHT_FALLBACK_WRITES is exactly "true" (brief: only after it was tested and allowed explicitly).
   */
  lightFallbackWrites: boolean;
  /**
   * The real spend one message may reach before no further paid round starts (cost brief, phase 4), separate from the
   * user's 100-token charge ceiling, which counts only what the user pays.
   */
  requestCostLimitUsd: number;
  /** Share of dailyCostCapUsd after which optional Sonnet use stops (soft alert); the cap itself is the hard stop. */
  softBudgetShare: number;
  /** Accounting Brain & Tax Navigator (ai/accounting): 'admin' while it is checked (default), 'all' or 'off'. */
  accounting?: 'off' | 'admin' | 'all';
}

const num = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = value?.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/** The plan must come from the server's subscription/role lookup, never request data. */
export function assistantEnabledForPlan(config: AiConfig, plan: string, email?: string | null): boolean {
  if (!config.enabled) return false;
  if (plan === 'admin') return true;
  // The existing free Pro trial keeps its own small token allowance; expired/free accounts have plan none.
  if (plan !== 'pro' && plan !== 'trial') return false;
  return !config.adminsOnly || Boolean(email && config.allowedEmails.includes(email.trim().toLowerCase()));
}

export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    enabled: env.AI_ENABLED?.trim().toLowerCase() === 'true',
    // Open Pro access by explicitly deploying AI_ADMINS_ONLY=false. Missing/invalid values fail closed.
    adminsOnly: env.AI_ADMINS_ONLY?.trim().toLowerCase() !== 'false',
    allowedEmails: (env.AI_ALLOWED_EMAILS || '').split(/[,\s]+/).map(email => email.trim().toLowerCase()).filter(email => email.includes('@')),
    // Owner's choice 2026-10-24: Gemini only for now (no OpenAI account yet). 3.5 Flash-Lite is Google's pick for new
    // projects; 3.1 Flash-Lite may be retired from 7 May 2027. Set AI_ACTION_MODEL=gpt-5.4-mini to bring GPT back.
    chatModel: env.AI_CHAT_MODEL?.trim() || 'gemini-3.5-flash-lite',
    actionModel: env.AI_ACTION_MODEL?.trim() || 'gemini-3.5-flash-lite',
    smartModel: env.AI_SMART_MODEL?.trim() || undefined,
    // Owner, 2026-10-26: dictation must be accurate. In the before/after check (artifacts/ai-secretary/eval/voice-1),
    // Gemini 3.8 Flash wrote all 10 noisy clips without a mistake; Flash-Lite with the same spelling lists got every name
    // and amount but still misheard a few words. AI_VOICE_MODEL=gemini-3.5-flash-lite costs about half.
    voiceModel: env.AI_VOICE_MODEL?.trim() || 'gemini-3.8-flash',
    geminiKey: env.GEMINI_API_KEY?.trim() || undefined,
    openaiKey: env.OPENAI_API_KEY?.trim() || undefined,
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    tokenUsd: num(env.AI_TOKEN_USD, 0.001, 0.00001, 1),
    // Owner, 2026-10-25: 1,650 a month for every Pro account, paid or given (was 2,500 from 2026-10-24).
    proTokensPerCycle: num(env.AI_PRO_TOKENS_PER_CYCLE, 1650, 0, 1_000_000),
    trialTokens: num(env.AI_TRIAL_TOKENS, 25, 0, 100_000),
    dailyCostCapUsd: num(env.AI_DAILY_COST_CAP_USD, 5, 0, 10_000),
    maxOutputTokens: { chat: num(env.AI_MAX_OUTPUT_CHAT, 600, 64, 8192), action: num(env.AI_MAX_OUTPUT_ACTION, 1200, 64, 16384) },
    // 8 (owner, 2026-10-24: complex requests stopped halfway): find → read → one card per job → answer, also after
    // the conversation model hands over. Each extra step is paid from the same token pool.
    maxToolSteps: Math.floor(num(env.AI_MAX_TOOL_STEPS, 8, 1, 12)),
    messageTokenCap: Math.floor(num(env.AI_MESSAGE_TOKEN_CAP, 100, 10, 10_000)),
    timeoutMs: num(env.AI_TIMEOUT_MS, 30000, 3000, 120000),
    routingPolicy: env.AI_ROUTING_POLICY?.trim().toLowerCase() === 'v1' ? 'v1' : 'v2',
    lightFallbackWrites: env.AI_LIGHT_FALLBACK_WRITES?.trim().toLowerCase() === 'true',
    requestCostLimitUsd: num(env.AI_REQUEST_COST_LIMIT_USD, 0.3, 0.05, 5),
    softBudgetShare: num(env.AI_SOFT_BUDGET_SHARE, 0.8, 0.1, 1),
    accounting: (['off', 'admin', 'all'] as const).find(mode => mode === env.AI_ACCOUNTING?.trim().toLowerCase()) ?? 'admin',
  };
}

/** Preserve the existing email rollout exception, using only the verified account email and server plan. */
export function aiAllowedFor(config: AiConfig, plan: string, email: string | null | undefined): boolean {
  return assistantEnabledForPlan(config, plan, email);
}

/** Scope the policy to one request; an admitted account still keeps its plan and token allowance. */
export function aiConfigFor(config: AiConfig, plan: string, email: string | null | undefined): AiConfig {
  return aiAllowedFor(config, plan, email) ? { ...config, adminsOnly: false } : { ...config, enabled: false };
}

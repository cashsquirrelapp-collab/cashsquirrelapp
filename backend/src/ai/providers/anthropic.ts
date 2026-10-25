import Anthropic from '@anthropic-ai/sdk';
import { addUsage, emptyUsage, ProviderError, type AssistantCard, type Provider, type ProviderRequest, type ProviderResult } from '../types.js';

// Claude through Anthropic's official SDK, for the model comparison the owner asked for (2026-10-24: "ลองเทียบให้ดู").
// Production stays on Gemini until the owner chooses a model (AI_CHAT_MODEL / AI_ACTION_MODEL).
//
// Claude Sonnet 5.5 (the owner's choice for hard requests, 2026-10-24): adaptive thinking is on by default (no thinking parameter is sent), effort
// sets its depth, and forced tool_choice is not supported, so the model chooses its tools (auto). The shared part
// of the system prompt (everything before USER) is the same for every account, so it is cached; thinking blocks go
// back to the API unchanged with the rest of each answer.

const EFFORT = { minimal: 'low', low: 'low', medium: 'medium' } as const;
// Thinking counts toward max_tokens, so the answer gets four times the light model's visible-text cap (chat 600 →
// 2,400, action 1,200 → 4,800; the longest answer measured on 2026-10-24 used 1,261). One call can no longer write
// 8,000 tokens ($0.08), which the per-message ceiling could not stop.
const maxTokensFor = (visibleCap: number) => Math.min(8000, Math.max(2000, visibleCap * 4));

type Block = Anthropic.Beta.BetaContentBlockParam;

function userContent(turn: ProviderRequest['turns'][number]): string | Block[] {
  if (!turn.attachment) return turn.text;
  const file: Block = turn.attachment.mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: turn.attachment.data } }
    : { type: 'image', source: { type: 'base64', media_type: turn.attachment.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: turn.attachment.data } };
  return [file, { type: 'text', text: turn.text }];
}

export const anthropicProvider: Provider = {
  name: 'anthropic',
  async run(request: ProviderRequest): Promise<ProviderResult> {
    const client = new Anthropic({
      apiKey: request.apiKey, maxRetries: 1, timeout: 30_000,
      ...(request.fetchImpl ? { fetch: request.fetchImpl as unknown as typeof fetch } : {}),
    });
    // The shared rules (everything before USER, with the tools before them) are the same for every account, so they
    // are kept for an hour (owner, 2026-10-24: cheaper hard requests). A cache read refreshes the hour; with requests
    // 5–60 minutes apart, the hour costs one 2× write instead of a 1.25× write on every request. The per-account part
    // and the conversation keep the 5-minute cache (top-level), which may follow a 1-hour entry.
    const at = request.system.indexOf('\n\nUSER\n\n');
    // Cost brief (2026-10-25): the shared rules cost one 2x write per hour on the 1-hour cache, which only pays off when
    // Sonnet answers at least twice an hour; while it is quiet the gateway asks for the 5-minute cache (a 1.25x write).
    // The cost comparison (scripts/ai-eval) can also switch the shared breakpoint off ('auto') or caching off ('off').
    const mode = request.cacheMode ?? '1h';
    const shared: Anthropic.Beta.BetaCacheControlEphemeral | undefined = mode === '1h' ? { type: 'ephemeral', ttl: '1h' } : mode === '5m' ? { type: 'ephemeral' } : undefined;
    // In 5-minute mode the provider reports the shared rules' write together with the rest, so their part is estimated
    // from their size (2.6 characters a token, measured on 2026-10-25: 55,223 characters were 21,217 tokens).
    const sharedEstimate = mode === '5m' ? Math.round(((at > 0 ? at : request.system.length) + JSON.stringify(request.tools).length) / 2.6) : 0;
    const system: Anthropic.Beta.BetaTextBlockParam[] = at > 0
      ? [{ type: 'text', text: request.system.slice(0, at), ...(shared ? { cache_control: shared } : {}) }, { type: 'text', text: request.system.slice(at) }]
      : [{ type: 'text', text: request.system, ...(shared ? { cache_control: shared } : {}) }];
    const tools: Anthropic.Beta.BetaTool[] = request.tools.map(tool => ({
      name: tool.name, description: tool.description, input_schema: tool.parameters as unknown as Anthropic.Beta.BetaTool.InputSchema,
    }));
    const messages: Anthropic.Beta.BetaMessageParam[] = request.turns.map(turn => (
      turn.role === 'user' ? { role: 'user', content: userContent(turn) } : { role: 'assistant', content: turn.text }
    ));
    // Sonnet 5.5 can hand a declined request to another model inside the same call (server-side fallback).
    const fallback = /sonnet/i.test(request.model);
    let usage = emptyUsage();
    const toolCalls: ProviderResult['toolCalls'] = [];
    const cards: AssistantCard[] = [];
    let handoff: string | undefined;
    const maxSteps = request.maxSteps ?? 4;
    // The model that actually answered, as Anthropic reports it (a declined request can be finished by a fallback).
    let answeredBy = request.model;
    const done = (text: string, steps: number, stoppedAt?: 'max_steps' | 'budget'): ProviderResult =>
      ({ provider: 'anthropic', model: answeredBy, text, usage, toolCalls, cards, handoff, steps, ...(stoppedAt ? { stoppedAt } : {}) });

    for (let step = 1; ; step += 1) {
      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await client.beta.messages.create({
          model: request.model, max_tokens: maxTokensFor(request.maxOutputTokens), system, tools, messages,
          output_config: { effort: EFFORT[request.effort ?? 'low'] },
          ...(mode === 'off' ? {} : { cache_control: { type: 'ephemeral' as const } }),
          ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }, { signal: request.signal });
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          const status = error.status ?? 502;
          throw new ProviderError(error.message, status, 'anthropic', status === 429 || status >= 500);
        }
        throw error;
      }
      if (response.model) answeredBy = response.model;
      const u = response.usage;
      usage = addUsage(usage, {
        inputTokens: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
        cachedInputTokens: u.cache_read_input_tokens || 0,
        outputTokens: u.output_tokens || 0, // thinking included
        thinkingTokens: 0,
        cacheWriteTokens: u.cache_creation_input_tokens || 0,
        cacheWrite1hTokens: u.cache_creation?.ephemeral_1h_input_tokens || 0,
        // The shared rules were written (not read) this round: their part of the 5-minute write.
        ...(sharedEstimate && (u.cache_read_input_tokens || 0) < sharedEstimate / 2
          ? { sharedWrite5mTokens: Math.min(sharedEstimate, u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens || 0) - (u.cache_creation?.ephemeral_1h_input_tokens || 0))) } : {}),
      });
      if (response.stop_reason === 'refusal') return done('ขออภัยครับ เรื่องนี้ผมช่วยไม่ได้', step);
      messages.push({ role: 'assistant', content: response.content as unknown as Block[] });
      const calls = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
      if (!calls.length || handoff) {
        const text = response.content.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text').map(block => block.text).join('').trim();
        return done(text, step);
      }
      // Every tool result goes back in one user message, so the model keeps calling tools together.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      let ended = false;
      for (const call of calls) {
        const args = (call.input && typeof call.input === 'object' ? call.input : {}) as Record<string, unknown>;
        toolCalls.push({ name: call.name, args });
        const outcome = await request.execute({ id: call.id, name: call.name, args });
        if (outcome.card) cards.push(outcome.card);
        if (outcome.extraCards) cards.push(...outcome.extraCards);
        if (outcome.handoff) handoff = outcome.handoff;
        if (outcome.endTurn) ended = true;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(outcome.result ?? null) });
      }
      messages.push({ role: 'user', content: results });
      if (handoff) return done('', step);
      // Questions for the user: the turn ends here with the words Claude wrote alongside them.
      if (ended) return done(response.content.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text').map(block => block.text).join('').trim(), step);
      if (step >= maxSteps) return done('', step, 'max_steps');
      if (request.overBudget?.(usage)) return done('', step, 'budget');
    }
  },
};

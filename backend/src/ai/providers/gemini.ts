import { ProviderError, addUsage, emptyUsage, type AssistantCard, type Provider, type ProviderRequest, type ProviderResult, type ToolSpec } from '../types.js';

// Gemini through its REST API with fetch (no SDK, so the Worker bundle stays small).
// POST /v1beta/models/{model}:generateContent, key in the x-goog-api-key header.
// Gemini 3 notes (ai.google.dev, checked 2026-10-24): keep temperature at its default 1.0; thinking is set with
// generationConfig.thinkingConfig.thinkingLevel (minimal | low | medium | high; Flash-Lite defaults to minimal);
// thought signatures ride on the parts the model returns and must be sent back unchanged, so each model turn is
// kept exactly as received.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

type Part = { text?: string; inlineData?: { mimeType: string; data: string }; thought?: boolean; thoughtSignature?: string; functionCall?: { name: string; args?: Record<string, unknown>; id?: string }; functionResponse?: unknown };
type Content = { role: 'user' | 'model'; parts: Part[] };

const declaration = (tool: ToolSpec) => ({ name: tool.name, description: tool.description, parameters: tool.parameters });

const CALL_STALL_MS = 12_000;

export const geminiProvider: Provider = {
  name: 'gemini',
  async run(request: ProviderRequest): Promise<ProviderResult> {
    const fetchImpl = request.fetchImpl ?? fetch;
    const contents: Content[] = request.turns.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      // A picture or PDF goes first as inline data, then the words about it.
      parts: [...(turn.attachment ? [{ inlineData: { mimeType: turn.attachment.mimeType, data: turn.attachment.data } }] : []), { text: turn.text }],
    }));
    let usage = emptyUsage();
    const toolCalls: ProviderResult['toolCalls'] = [];
    const cards: AssistantCard[] = [];
    let handoff: string | undefined;
    let thinking = request.effort;
    const maxSteps = request.maxSteps ?? 4;

    for (let step = 1; ; step += 1) {
      const body = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents,
        ...(request.tools.length ? { tools: [{ functionDeclarations: request.tools.map(declaration) }] } : {}),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
        },
      };
      // Gemini now and then hangs on one call for the whole 30 s (2 of ~25 test runs, 2026-10-24) while the same
      // call normally takes 1–3 s: a call that stalls, or answers busy (429/5xx), is tried once more while the
      // request still has time.
      let response!: Response;
      let data: any;
      for (let attempt = 1; ; attempt += 1) {
        const stall = AbortSignal.timeout(request.stallMs ?? CALL_STALL_MS);
        const signal = request.signal ? AbortSignal.any([request.signal, stall]) : stall;
        try {
          response = await fetchImpl(`${ENDPOINT}${encodeURIComponent(request.model)}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
            body: JSON.stringify(body),
            signal,
          });
          data = await response.json().catch(() => ({}));
        } catch (error) {
          if (attempt === 1 && stall.aborted && !request.signal?.aborted) { request.onRetry?.(); continue; }
          throw error;
        }
        if (attempt === 1 && (response.status === 429 || response.status >= 500) && !request.signal?.aborted) {
          request.onRetry?.();
          await new Promise(resolve => setTimeout(resolve, 400));
          continue;
        }
        break;
      }
      if (!response.ok) {
        const message = String(data?.error?.message || `Gemini HTTP ${response.status}`);
        // If this model does not accept the thinking setting, try once more without it rather than failing.
        if (response.status === 400 && thinking && /thinking/i.test(message)) { thinking = undefined; step -= 1; continue; }
        throw new ProviderError(message, response.status, 'gemini', response.status === 429 || response.status >= 500);
      }
      const meta = data.usageMetadata || {};
      usage = addUsage(usage, {
        inputTokens: Number(meta.promptTokenCount || 0),
        cachedInputTokens: Number(meta.cachedContentTokenCount || 0),
        outputTokens: Number(meta.candidatesTokenCount || 0),
        thinkingTokens: Number(meta.thoughtsTokenCount || 0),
      });
      const candidate = data.candidates?.[0];
      const parts: Part[] = candidate?.content?.parts || [];
      if (!candidate) throw new ProviderError(`Gemini returned no answer${data.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}`, 502, 'gemini', true);
      contents.push({ role: 'model', parts }); // as received: thought signatures included
      const calls = parts.filter(part => part.functionCall);
      if (!calls.length || handoff) {
        const text = parts.filter(part => part.text && !part.thought).map(part => part.text).join('').trim();
        return { provider: 'gemini', model: request.model, text, usage, toolCalls, cards, handoff, steps: step };
      }
      const replies: Part[] = [];
      let ended = false;
      for (const [index, part] of calls.entries()) {
        const call = part.functionCall!;
        const args = call.args || {};
        toolCalls.push({ name: call.name, args });
        const outcome = await request.execute({ id: call.id || `${step}-${index}`, name: call.name, args });
        if (outcome.card) cards.push(outcome.card);
        if (outcome.extraCards) cards.push(...outcome.extraCards);
        if (outcome.handoff) handoff = outcome.handoff;
        if (outcome.endTurn) ended = true;
        replies.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: { result: outcome.result } } });
      }
      contents.push({ role: 'user', parts: replies });
      if (handoff) return { provider: 'gemini', model: request.model, text: '', usage, toolCalls, cards, handoff, steps: step };
      // Questions for the user: the turn ends here. Gemini's words written next to a tool call came out garbled in the
      // 2026-10-25 test ("…ครับผม 🙂ชำระ"), so the gateway shows its standard lead-in line instead.
      if (ended) return { provider: 'gemini', model: request.model, text: '', usage, toolCalls, cards, steps: step };
      // The model response has already been paid for. Its final tool batch still runs through the
      // validated toolbox; the budget prevents another model request, not returning a prepared card.
      if (step >= maxSteps || request.overBudget?.(usage)) {
        return { provider: 'gemini', model: request.model, text: '', usage, toolCalls, cards, steps: step, stoppedAt: step >= maxSteps ? 'max_steps' : 'budget' };
      }
    }
  },
};

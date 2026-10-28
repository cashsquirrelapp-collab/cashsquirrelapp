import { ProviderError, addUsage, emptyUsage, type AssistantCard, type Provider, type ProviderRequest, type ProviderResult } from '../types.js';

// OpenAI through the Responses API with fetch (no SDK). store: false, so OpenAI keeps no conversation state
// (our own database holds the history); include reasoning.encrypted_content so the model's reasoning can be
// handed back between tool rounds without storing it at OpenAI.

const ENDPOINT = 'https://api.openai.com/v1/responses';

export const openaiProvider: Provider = {
  name: 'openai',
  async run(request: ProviderRequest): Promise<ProviderResult> {
    const fetchImpl = request.fetchImpl ?? fetch;
    const input: unknown[] = request.turns.map(turn => (turn.attachment && turn.role === 'user'
      ? { role: 'user', content: [
        turn.attachment.mimeType === 'application/pdf'
          ? { type: 'input_file', filename: turn.attachment.name, file_data: `data:application/pdf;base64,${turn.attachment.data}` }
          : { type: 'input_image', image_url: `data:${turn.attachment.mimeType};base64,${turn.attachment.data}` },
        { type: 'input_text', text: turn.text },
      ] }
      : { role: turn.role, content: turn.text }));
    let usage = emptyUsage();
    const toolCalls: ProviderResult['toolCalls'] = [];
    const cards: AssistantCard[] = [];
    const maxSteps = request.maxSteps ?? 4;
    let handoff: string | undefined;

    for (let step = 1; ; step += 1) {
      const body = {
        model: request.model,
        instructions: request.system,
        input,
        ...(request.tools.length ? { tools: request.tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters, strict: false })) } : {}),
        max_output_tokens: request.maxOutputTokens,
        ...(request.effort ? { reasoning: { effort: request.effort } } : {}),
        store: false,
        include: ['reasoning.encrypted_content'],
      };
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${request.apiKey}` },
        body: JSON.stringify(body),
        signal: request.signal,
      });
      const data = await response.json().catch(() => ({})) as any;
      if (!response.ok) {
        throw new ProviderError(String(data?.error?.message || `OpenAI HTTP ${response.status}`), response.status, 'openai', response.status === 429 || response.status >= 500);
      }
      const used = data.usage || {};
      usage = addUsage(usage, {
        inputTokens: Number(used.input_tokens || 0),
        cachedInputTokens: Number(used.input_tokens_details?.cached_tokens || 0),
        outputTokens: Number(used.output_tokens || 0), // includes reasoning tokens
        thinkingTokens: Number(used.output_tokens_details?.reasoning_tokens || 0),
      });
      const output: any[] = Array.isArray(data.output) ? data.output : [];
      input.push(...output); // reasoning items (encrypted) and function calls go back as they came
      const calls = output.filter(item => item.type === 'function_call');
      if (!calls.length) {
        const text = output.filter(item => item.type === 'message')
          .flatMap(item => item.content || []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text).join('').trim();
        return { provider: 'openai', model: request.model, text, usage, toolCalls, cards, steps: step };
      }
      let ended = false;
      let closing = true;
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try { args = call.arguments ? JSON.parse(call.arguments) : {}; } catch { args = {}; }
        toolCalls.push({ name: call.name, args });
        const outcome = await request.execute({ id: call.call_id, name: call.name, args });
        if (outcome.card) cards.push(outcome.card);
        if (outcome.extraCards) cards.push(...outcome.extraCards);
        if (outcome.handoff) handoff = outcome.handoff;
        if (outcome.endTurn) ended = true;
        if (!outcome.closesTurn) closing = false;
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(outcome.result ?? null) });
      }
      // The chat model asked to hand over: stop here and let the gateway run the action model.
      if (handoff) return { provider: 'openai', model: request.model, text: '', usage, toolCalls, cards, handoff, steps: step };
      // Questions for the user: the turn ends here with the words the model wrote alongside them.
      if (ended) {
        const text = output.filter(item => item.type === 'message')
          .flatMap(item => item.content || []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text).join('').trim();
        return { provider: 'openai', model: request.model, text, usage, toolCalls, cards, steps: step };
      }
      // Every call of this step prepared its card: the turn ends here (the gateway shows the say lines).
      if (closing) return { provider: 'openai', model: request.model, text: '', usage, toolCalls, cards, steps: step, closed: true };
      // Execute this already-paid response's validated tools before stopping. No extra provider
      // request is needed to deliver its confirmation card to the user.
      if (step >= maxSteps || request.overBudget?.(usage)) {
        return { provider: 'openai', model: request.model, text: '', usage, toolCalls, cards, steps: step, stoppedAt: step >= maxSteps ? 'max_steps' : 'budget' };
      }
    }
  },
};

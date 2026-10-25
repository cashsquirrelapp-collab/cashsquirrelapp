import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { anthropicProvider } from '../backend/src/ai/providers/anthropic';

// Owner, 2026-10-24: one message costs the user at most 100 Krarok Tokens; a Pro month holds 1,650 (2026-10-25, was 2,500).

const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// Each Gemini round reads 100,000 prompt tokens: $0.03 at $0.30 / MTok.
const call = (name: string) => ({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args: {}, id: `c-${name}` }, thoughtSignature: 'sig' }] } }], usageMetadata: { promptTokenCount: 100_000, candidatesTokenCount: 0 } });
const text = (value: string, promptTokenCount = 1000) => ({ candidates: [{ content: { role: 'model', parts: [{ text: value }] } }], usageMetadata: { promptTokenCount, candidatesTokenCount: 0 } });

test('the loop stops before a further round would pass the per-message ceiling', async () => {
  const replies = [call('receivables'), call('receivables'), call('receivables'), call('receivables'), text('ตอบแล้วครับ')];
  let asked = 0;
  const fetchImpl = (async () => { asked += 1; return json(replies.shift()); }) as unknown as typeof fetch;
  const reply = await runAssistant({ user, plan: 'pro', text: 'ใครค้างจ่ายบ้าง' }, {
    config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl,
  });
  // $0.03 + $0.03 → a third round still fits under $0.10 (0.06 + 0.03); after it, a fourth would not (0.09 + 0.03).
  assert.equal(asked, 3);
  assert.equal(reply.calls[0].stoppedAt, 'budget');
  assert.ok(reply.tokens <= 100 && reply.tokens >= 89, String(reply.tokens));
  assert.doesNotMatch(reply.text, /ทีละ/);
});

test('a message that still ends above the ceiling is charged the ceiling', async () => {
  const fetchImpl = (async () => json(text('ตอบแล้วครับ', 100_000))) as unknown as typeof fetch;
  const reply = await runAssistant({ user, plan: 'pro', text: 'สวัสดี' }, {
    config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', AI_MESSAGE_TOKEN_CAP: '10' }), ...memoryStores(), fetchImpl,
  });
  assert.ok(reply.costUsd > 0.029);
  assert.equal(reply.tokens, 10);
});

test('Pro gets 1,650 tokens a month and a 100-token ceiling by default', () => {
  const config = aiConfig({ AI_ENABLED: 'true' });
  assert.equal(config.proTokensPerCycle, 1650);
  assert.equal(config.messageTokenCap, 100);
});

test('Claude answers within four times the light model cap, never 8,000 tokens a call', async () => {
  const sent: any[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return json({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ตอบแล้วครับ' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } });
  }) as unknown as typeof fetch;
  for (const maxOutputTokens of [600, 1200]) {
    await anthropicProvider.run({ apiKey: 'k', model: 'claude-sonnet-5-5', system: 'S', turns: [{ role: 'user', text: 'สวัสดี' }], tools: [],
      maxOutputTokens, execute: async () => ({ result: null }), fetchImpl });
  }
  assert.deepEqual(sent.map(body => body.max_tokens), [2400, 4800]);
});

// 2026-10-24 real run: the first request of an hour writes the shared rules (about $0.06); the rounds after it read them.
test('a costly first round that wrote the cache does not stop a cheap next round', async () => {
  const { anthropicProvider: provider } = await import('../backend/src/ai/providers/anthropic');
  const replies = [
    { id: 'm1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: 't1', name: 'receivables', input: {} }], stop_reason: 'tool_use', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 15000, cache_creation: { ephemeral_1h_input_tokens: 15000, ephemeral_5m_input_tokens: 0 } } },
    { id: 'm2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'วิเคราะห์แล้วครับ' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 800, cache_read_input_tokens: 15000, cache_creation_input_tokens: 500 } },
  ];
  let asked = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (!String(input).includes('anthropic')) throw new Error('only Claude in this test');
    asked += 1; return json(replies.shift());
  }) as unknown as typeof fetch;
  const reply = await runAssistant({ user, plan: 'pro', text: 'วิเคราะห์ภาพรวมเดือนนี้ให้หน่อย' }, {
    config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' }),
    ...memoryStores(), fetchImpl, providers: { anthropic: provider } as any,
  });
  assert.equal(asked, 2);
  assert.equal(reply.text, 'วิเคราะห์แล้วครับ');
  assert.equal(reply.calls[0].stoppedAt, undefined);
  // Owner's cost brief (2026-10-25): the shared rules' 1-hour cache write is the app's cost, not the user's. The user
  // pays as if the cache had been warm (14 tokens); the real spend (about $0.07) is still counted, its overhead apart.
  assert.equal(reply.tokens, 14);
  assert.ok(reply.costUsd > 0.065 && reply.costUsd < 0.075, String(reply.costUsd));
  assert.ok(Math.abs(reply.overheadUsd - (reply.costUsd - reply.billableUsd)) < 1e-9 && reply.overheadUsd > 0.055);
  assert.equal(reply.routing?.cost?.cache_overhead_usd, Number(reply.overheadUsd.toFixed(6)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicProvider } from '../backend/src/ai/providers/anthropic';
import { costUsd } from '../backend/src/ai/cost';

// Claude for the model comparison (owner, 2026-10-24): the official SDK with a fake Anthropic server, no key, no cost.

type Sent = { url: string; headers: Headers; body: any };
function fakeAnthropic(replies: unknown[], sent: Sent[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
}
const message = (content: unknown[], stop: string, usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 }) =>
  ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, stop_sequence: null, usage });

const system = 'SHARED RULES '.repeat(50) + '\n\nUSER\n\nPLAN: pro\nNOW: 24 ต.ค. 2569 10:00';

test('Claude: tools run through our toolbox, the shared prompt is cached, thinking goes back unchanged, Sonnet has the fallback', async () => {
  const sent: Sent[] = [];
  const executed: string[] = [];
  const thinking = { type: 'thinking', thinking: '', signature: 'sig-1' };
  const result = await anthropicProvider.run({
    apiKey: 'test-key', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'ใครค้างจ่ายบ้าง' }],
    tools: [{ name: 'receivables', description: 'Money owed', parameters: { type: 'object', properties: {} } }],
    maxOutputTokens: 600, effort: 'low', maxSteps: 4,
    execute: async call => { executed.push(call.name); return { result: { ok: true, total_owed: 47100 } }; },
    fetchImpl: fakeAnthropic([
      message([thinking, { type: 'tool_use', id: 'toolu_1', name: 'receivables', input: {} }], 'tool_use', { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 9000 }),
      message([{ type: 'text', text: 'ค้างรับ 5 งาน รวม ฿47,100 ครับ' }], 'end_turn'),
    ], sent),
  });
  assert.equal(result.text, 'ค้างรับ 5 งาน รวม ฿47,100 ครับ');
  assert.deepEqual(executed, ['receivables']);
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.steps, 2);
  const first = sent[0].body;
  assert.match(sent[0].url, /\/v1\/messages/);
  assert.equal(first.model, 'claude-sonnet-5-5');
  assert.equal(first.thinking, undefined, 'adaptive thinking is the default; nothing is sent');
  assert.equal(first.tool_choice, undefined, 'forced tool use is not supported on these models');
  assert.deepEqual(first.output_config, { effort: 'low' });
  assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral', ttl: '1h' }, 'the shared rules are kept for an hour');
  assert.deepEqual(first.cache_control, { type: 'ephemeral' }, 'the per-account part and the conversation keep 5 minutes');
  assert.ok(first.system[0].text.startsWith('SHARED RULES') && !first.system[0].text.includes('NOW:'), 'only the part shared by every account is cached');
  assert.equal(first.fallbacks, 'default');
  assert.match(sent[0].headers.get('anthropic-beta') || '', /server-side-fallback-2026-07-01/);
  assert.equal(first.temperature, undefined);
  // The second request carries the first answer unchanged (thinking block and signature) and one tool_result message.
  const second = sent[1].body.messages;
  assert.deepEqual(second[1].content[0], thinking);
  assert.equal(second[2].content[0].type, 'tool_result');
  assert.equal(second[2].content[0].tool_use_id, 'toolu_1');
  // Usage and cost: cache writes at 1.25× input, reads at 0.05× on Sonnet 5.5 ($0.10 / MTok).
  assert.deepEqual([result.usage.inputTokens, result.usage.cachedInputTokens, result.usage.cacheWriteTokens, result.usage.outputTokens], [18200, 9000, 9000, 90]);
  const cost = costUsd('anthropic', 'claude-sonnet-5-5', result.usage);
  assert.equal(Math.round(cost * 1e6), Math.round((200 * 2 + 9000 * 2 * 1.25 + 9000 * 0.1 + 90 * 10)));
});

test('Claude: a refusal answers politely instead of failing', async () => {
  const sent: Sent[] = [];
  const result = await anthropicProvider.run({
    apiKey: 'test-key', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'สวัสดี' }], tools: [],
    maxOutputTokens: 600, effort: 'medium', execute: async () => ({ result: null }),
    fetchImpl: fakeAnthropic([message([], 'refusal')], sent),
  });
  assert.equal(sent[0].body.output_config.effort, 'medium');
  assert.match(result.text, /ช่วยไม่ได้/);
});

// Owner, 2026-10-24: the smart model only for hard requests; it switches on with the key and never blocks without it.
test('hard requests go to the smart model, everyday ones stay light; no key means everything stays light', async () => {
  const { needsSmartModel } = await import('../backend/src/ai/difficulty');
  // Owner, 2026-10-24: plain changes stay light even when there are several (Gemini prepared these cards correctly).
  for (const easy of ['สวัสดี', 'ลูกค้าคนไหนยังไม่จ่ายบ้าง', 'ใบ 50 ทวิ ติดตามได้ไหม', 'เพิ่มงานออกแบบโลโก้ 5000', 'บันทึกรับเงินงานโลโก้ครบแล้ว', 'สรุปเงินเดือนนี้ให้หน่อย', 'รายจ่ายประจำอยู่ตรงไหน', 'หัก ณ ที่จ่าย 3% ใส่ตรงไหน', 'รายได้เดือนนี้เท่าไหร่',
    'พอดีว่างานเว็บไซต์ของลูกค้าบริษัท ตัวอย่าง จำกัด ชำระมาในราคาเต็ม ช่วยแก้งานนี้ที่หัก 3% ให้เป็นไม่หัก แล้วก็ทำการจ่ายแล้วด้วย',
    'ร้านกาแฟโอนมาครบทั้งสองงานแล้ว บันทึกให้หน่อย', 'งานตัดต่อวิดีโอ ส่งงานแล้ววันนี้ เครดิต 15 วัน หัก 3%', 'เพิ่มงาน\n1) โปสเตอร์\n2) วิดีโอ', 'ออกใบเสนอราคางานเว็บไซต์ให้หน่อย']) {
    assert.equal(needsSmartModel(easy), false, easy);
  }
  for (const hard of [
    'วิเคราะห์รายได้ปีนี้ให้หน่อย', 'ทำไมเดือนนี้กำไรน้อย', 'ช่วยร่างข้อความทวงเงินร้านกาแฟแบบสุภาพ',
    'ลูกค้าคนไหนสำคัญกับรายได้ของฉันที่สุด แล้วคนไหนจ่ายช้าบ้าง', 'ถ้าเดือนหน้าอยากมีกำไรเพิ่มขึ้น 20% ต้องทำยังไง',
    'งานประเภทไหนทำเงินเยอะที่สุด ขอเป็นกราฟ', 'เพิ่มงานโลโก้ 5000 แล้วออกใบแจ้งหนี้ให้ด้วย', 'แก้ยอดงานเว็บเป็น 30000 จากนั้นบันทึกว่ารับมัดจำ 10000',
    'ก'.repeat(600),
  ]) assert.equal(needsSmartModel(hard), true, hard.slice(0, 40));
  assert.equal(needsSmartModel('ดูสลิปนี้ให้หน่อย', { hasAttachment: true }), true);

  const { aiConfig } = await import('../backend/src/ai/config');
  const { memoryStores, runAssistant } = await import('../backend/src/ai/gateway');
  const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
  const models: string[] = [];
  const seen = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('anthropic')) { models.push(JSON.parse(String(init?.body)).model); return new Response(JSON.stringify(message([{ type: 'text', text: 'วิเคราะห์แล้วครับ' }], 'end_turn')), { status: 200, headers: { 'content-type': 'application/json' } }); }
    models.push(/models\/([^:]+)/.exec(url)?.[1] || url);
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'ตอบแล้วครับ' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', AI_SMART_MODEL: 'claude-sonnet-5-5' };
  await runAssistant({ user, plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: aiConfig({ ...env, ANTHROPIC_API_KEY: 'a' }), ...memoryStores(), fetchImpl: seen });
  await runAssistant({ user, plan: 'pro', text: 'สวัสดี' }, { config: aiConfig({ ...env, ANTHROPIC_API_KEY: 'a' }), ...memoryStores(), fetchImpl: seen });
  await runAssistant({ user, plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: aiConfig(env), ...memoryStores(), fetchImpl: seen });
  assert.deepEqual(models, ['claude-sonnet-5-5', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']);
});

test('hidden goals never reach the model: no goal money in the cash balance, no goal settings, no goals domain', async () => {
  const { createToolbox } = await import('../backend/src/ai/tools');
  const { memoryStores } = await import('../backend/src/ai/gateway');
  const { isPhaseOneFeatureAvailable } = await import('../shared/featureAvailability');
  if (isPhaseOneFeatureAvailable('split', false)) return;
  const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], expenses: [], jobs: [],
    goals: [{ id: 'g1', name: 'เงินสำรอง', current: 18000, target: 60000 }],
    settings: { monthlyRevenueGoal: 50000, savingsPercentage: 10, goalsFeatureEnabled: true, cashOpening: { amount: 1000 } } } as any;
  const execute = createToolbox({ user, ...memoryStores() });
  const cash = (await execute({ id: 'c', name: 'cash_position', args: {} })).result as any;
  assert.equal(cash.inGoals, 0);
  assert.equal(cash.readyToSpend, cash.balance);
  const settings = (await execute({ id: 's', name: 'account_data', args: { domain: 'settings' } })).result as any;
  for (const field of ['monthly_revenue_goal', 'savings_percentage', 'goals_enabled']) assert.ok(!(field in settings.settings), field);
  assert.equal(((await execute({ id: 'g', name: 'account_data', args: { domain: 'goals' } })).result as any).ok, false);
});

// Prepaid Anthropic credit can run out (auto-reload is off) or the key can be wrong: the hard request is answered by
// Gemini instead of failing, and the answer is recorded as Gemini's.
test('the smart model failing falls back to the light model in the same request', async () => {
  const { aiConfig } = await import('../backend/src/ai/config');
  const { memoryStores, runAssistant } = await import('../backend/src/ai/gateway');
  const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
  const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
  for (const [status, type, text] of [[400, 'invalid_request_error', 'Your credit balance is too low'], [401, 'authentication_error', 'invalid x-api-key']] as const) {
    const asked: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('anthropic')) { asked.push('claude'); return new Response(JSON.stringify({ type: 'error', error: { type, message: text } }), { status, headers: { 'content-type': 'application/json' } }); }
      asked.push('gemini');
      return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'วิเคราะห์แล้วครับ' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const warn = console.warn; console.warn = () => undefined;
    try {
      const reply = await runAssistant({ user, plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: aiConfig(env), ...memoryStores(), fetchImpl });
      assert.equal(reply.text, 'วิเคราะห์แล้วครับ', String(status));
      assert.deepEqual(asked, ['claude', 'gemini'], String(status));
      assert.deepEqual(reply.calls.map(call => call.provider), ['gemini']);
    } finally { console.warn = warn; }
  }
});

// The shared rules are written to the cache for an hour at 2× input; the user is charged that real cost.
test('a 1-hour cache write is priced at 2× input', async () => {
  const sent: Sent[] = [];
  const result = await anthropicProvider.run({
    apiKey: 'test-key', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'สวัสดี' }], tools: [],
    maxOutputTokens: 600, effort: 'low', execute: async () => ({ result: null }),
    fetchImpl: fakeAnthropic([message([{ type: 'text', text: 'สวัสดีครับ' }], 'end_turn',
      { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 10000, cache_creation: { ephemeral_1h_input_tokens: 9000, ephemeral_5m_input_tokens: 1000 } } as any)], sent),
  });
  assert.deepEqual([result.usage.cacheWriteTokens, result.usage.cacheWrite1hTokens], [10000, 9000]);
  const cost = costUsd('anthropic', 'claude-sonnet-5-5', result.usage);
  // 100 fresh at 1×, 1,000 written for 5 minutes at 1.25×, 9,000 written for an hour at 2×, 10 output at $10.
  assert.equal(Math.round(cost * 1e6), Math.round(100 * 2 + 1000 * 2 * 1.25 + 9000 * 2 * 2 + 10 * 10));
});

// 2026-10-24 production: Sonnet asked for the quotation's issuer; the owner's reply (address and tax ID) went to Gemini,
// which came back empty, and the user saw "ตอนนี้ยังตอบไม่ได้".
test('a reply to the smart model\'s question stays with it, and an empty light answer is answered again by the smart model', async () => {
  const { aiConfig } = await import('../backend/src/ai/config');
  const { memoryStores, runAssistant } = await import('../backend/src/ai/gateway');
  const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
  const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
  const asked: string[] = [];
  const fetchWith = (geminiText: string) => (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('anthropic')) { asked.push('claude'); return new Response(JSON.stringify(message([{ type: 'text', text: 'รับทราบครับ ขอชื่อผู้ออกเอกสารด้วยครับ' }], 'end_turn')), { status: 200, headers: { 'content-type': 'application/json' } }); }
    asked.push('gemini');
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: geminiText }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const history = [
    { role: 'user' as const, text: 'มูลค่า 3,000 บาท ลูกค้ายังไม่จ่าย ช่วยทำใบเสนอราคาให้ด้วย' },
    { role: 'assistant' as const, text: 'ยังไม่มีชื่อผู้ออกเอกสารในโปรไฟล์ รบกวนขอชื่อ-นามสกุลหรือชื่อร้านด้วยครับ' },
  ];
  const followUp = await runAssistant({ user, plan: 'pro', text: '99/9 ถนนตัวอย่าง อ.เมือง จังหวัดขอนแก่น 1234567890121', history }, { config: aiConfig(env), ...memoryStores(), fetchImpl: fetchWith('ตอบแล้วครับ') });
  assert.deepEqual(asked.splice(0), ['claude']);
  assert.equal(followUp.calls[0].provider, 'anthropic');
  // A plain greeting after an answer that asked nothing stays light.
  await runAssistant({ user, plan: 'pro', text: 'ขอบคุณครับ', history: [history[0], { role: 'assistant', text: 'สรุปให้แล้วครับ' }] }, { config: aiConfig(env), ...memoryStores(), fetchImpl: fetchWith('ยินดีครับ') });
  assert.deepEqual(asked.splice(0), ['gemini']);
  // Empty light answer: the smart model answers once more.
  const empty = await runAssistant({ user, plan: 'pro', text: 'สวัสดีครับ' }, { config: aiConfig(env), ...memoryStores(), fetchImpl: fetchWith('') });
  assert.deepEqual(asked.splice(0), ['gemini', 'claude']);
  assert.match(empty.text, /รับทราบครับ/);
  // Without the smart key the empty answer keeps the polite fallback.
  const plain = await runAssistant({ user, plan: 'pro', text: 'สวัสดีครับ' }, { config: aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g' }), ...memoryStores(), fetchImpl: fetchWith('') });
  assert.deepEqual(asked.splice(0), ['gemini']);
  assert.match(plain.text, /ตอนนี้ยังตอบไม่ได้/);
});

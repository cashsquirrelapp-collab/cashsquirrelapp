import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { costUsd, krarokTokens } from '../backend/src/ai/cost';
import { AiUnavailableError, memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { lookupKnowledge } from '../backend/src/ai/knowledge';
import { launched } from '../backend/src/ai/knowledgeBase';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { geminiProvider } from '../backend/src/ai/providers/gemini';
import { openaiProvider } from '../backend/src/ai/providers/openai';
import { routeMessage } from '../backend/src/ai/router';
import { createToolbox, toolsFor } from '../backend/src/ai/tools';
import type { UserRow } from '../backend/src/services/lineAssistant';

// เลขากระรอก AI Gateway with fake provider responses: no network, no keys, no cost.

const day = (offset: number) => new Date(Date.now() + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const fixture = (): UserRow => ({
  user_id: '22222222-2222-4222-8222-222222222222',
  statuses: [], goals: [], expenses: [], settings: {},
  jobs: [
    { id: 'job-logo', name: 'ออกแบบโลโก้ ตัวอย่าง', client: 'ร้านตัวอย่าง', value: 12000, received: 0, pending: 12000, status: 'pending', creditTerm: 30, postDate: day(-40), payDate: day(-10), isPosted: true },
    { id: 'job-web', name: 'เว็บไซต์ตัวอย่าง', client: 'บริษัท ตัวอย่าง จำกัด', value: 30000, received: 10000, pending: 19700, status: 'partial', whtRate: 1, whtAmount: 300, creditTerm: 30, postDate: day(-5), payDate: day(3), isPosted: true },
    { id: 'job-video', name: 'ตัดต่อวิดีโอ', client: 'ร้านตัวอย่าง', value: 5000, received: 0, pending: 5000, status: 'pending', creditTerm: 0, payDate: null, isPosted: false },
    { id: 'job-done', name: 'ถ่ายภาพสินค้า', client: 'ลูกค้าตัวอย่าง', value: 8000, received: 8000, pending: 0, status: 'done', creditTerm: 0, postDate: day(-2), payDate: day(-2), isPosted: true },
  ],
});
const config = (over: Record<string, string> = {}) => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'test-gemini', OPENAI_API_KEY: 'test-openai', AI_ACTION_MODEL: 'gpt-5.4-mini', ...over });

type Sent = { url: string; headers: Record<string, string>; body: any };
function fakeFetch(replies: unknown[], sent: Sent[], status = 200): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    const reply = next as { status?: number; json: unknown };
    return new Response(JSON.stringify(reply.json), { status: reply.status ?? status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}
const geminiText = (text: string, usage = { promptTokenCount: 1000, candidatesTokenCount: 40, thoughtsTokenCount: 10 }) =>
  ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: usage } });
const geminiCall = (name: string, args: Record<string, unknown>) =>
  ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args, id: `c-${name}` }, thoughtSignature: 'sig-1' }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 20 } } });
const openaiCall = (name: string, args: Record<string, unknown>) =>
  ({ json: { output: [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'x' }, { type: 'function_call', call_id: `call-${name}`, name, arguments: JSON.stringify(args) }], usage: { input_tokens: 1500, output_tokens: 60, input_tokens_details: { cached_tokens: 1000 }, output_tokens_details: { reasoning_tokens: 30 } } } });
const openaiText = (text: string) =>
  ({ json: { output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 1700, output_tokens: 50 } } });

test('router: questions stay on the chat model, requests to change data go to the action model', () => {
  assert.equal(routeMessage({ text: 'เดือนนี้ได้เงินเท่าไหร่แล้ว' }), 'chat');
  assert.equal(routeMessage({ text: 'ลบงานยังไง' }), 'chat');
  assert.equal(routeMessage({ text: 'ออกใบแจ้งหนี้ได้ไหม' }), 'chat');
  assert.equal(routeMessage({ text: 'มีฟีเจอร์ออกใบกำกับภาษีไหม' }), 'chat');
  assert.equal(routeMessage({ text: 'บัญชีฟรีออกเอกสารได้กี่ใบ' }), 'chat');
  assert.equal(routeMessage({ text: 'เพิ่มงานออกแบบโลโก้ 5000' }), 'action');
  assert.equal(routeMessage({ text: 'ร้านตัวอย่างโอนมาแล้ว รับเงินครบแล้ว' }), 'action');
  assert.equal(routeMessage({ text: 'ทำใบเสนอราคาให้หน่อย' }), 'action');
  assert.equal(routeMessage({ text: 'สวัสดี', hasAttachment: true }), 'action');
  assert.equal(routeMessage({ text: 'ยืนยัน', pendingConfirmation: true }), 'action');
});

test('cost: Gemini thinking is billed as output, OpenAI cached input is cheaper, unknown models cost the most', () => {
  const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, thinkingTokens: 1_000_000 };
  assert.equal(costUsd('gemini', 'gemini-3.1-flash-lite', usage), 0.25 + 1.5 * 2);
  assert.equal(costUsd('openai', 'gpt-5.4-mini', { ...usage, cachedInputTokens: 500_000 }), 0.5 * 0.75 + 0.5 * 0.075 + 4.5);
  assert.ok(costUsd('openai', 'some-new-model', usage) > costUsd('openai', 'gpt-5.4-mini', usage));
  assert.equal(krarokTokens(0.0000001, 0.001), 1);
  assert.equal(krarokTokens(0.0021, 0.001), 3);
  assert.equal(krarokTokens(0.002, 0.001), 2);
});

test('config: off unless AI_ENABLED is exactly true, limits clamped', () => {
  assert.equal(aiConfig({}).enabled, false);
  assert.equal(aiConfig({ AI_ENABLED: 'yes' }).enabled, false);
  assert.equal(aiConfig({ AI_ENABLED: 'TRUE' }).enabled, true);
  assert.equal(aiConfig({}).adminsOnly, true, 'admins only until switched to everyone');
  assert.equal(aiConfig({ AI_ADMINS_ONLY: 'false' }).adminsOnly, false);
  assert.equal(aiConfig({ AI_MAX_TOOL_STEPS: '99' }).maxToolSteps, 12);
  // 8 by default (owner, 2026-10-24): complex requests (find, read, one card per job, answer) stopped halfway at 4.
  assert.equal(aiConfig({}).maxToolSteps, 8);
  assert.equal(aiConfig({ AI_MAX_TOOL_STEPS: '2.9' }).maxToolSteps, 2, 'the provider request budget is an integer');
  assert.deepEqual([aiConfig({}).chatModel, aiConfig({}).actionModel], ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite'], 'Gemini only by default');
});

test('knowledge: a question finds the matching app feature', () => {
  assert.ok(lookupKnowledge('ใบเสนอราคาอยู่ตรงไหน').features.some(feature => feature.id === 'documents'));
  // 50 ทวิ is not open to every account yet: เลขา only says so (owner, 2026-10-24), until the area launches.
  const wht = lookupKnowledge('50 ทวิ คืออะไร');
  if (launched('wht50')) assert.ok(wht.features.some(feature => feature.id === 'wht50'));
  else assert.ok(!wht.features.some(feature => feature.id === 'wht50') && wht.missing.some(item => item.ask === 'ติดตามใบ 50 ทวิ'));
});

test('prompt: the shared part comes first and is the same for every user (so providers can cache it)', () => {
  const base = { route: 'chat' as const, plan: 'pro' as const, nowLocal: '24 ต.ค. 2569 10:00', knowledge: '-', accountContext: '{}' };
  const a = buildSystemPrompt({ ...base, preferredName: 'ก' });
  const b = buildSystemPrompt({ ...base, preferredName: 'ข', plan: 'trial', trialLeft: 2 });
  const shared = a.slice(0, a.indexOf('\n\nUSER'));
  assert.ok(shared.length > 1500);
  assert.ok(b.startsWith(shared));
  assert.match(b, /AI requests left: 2/);
});

test('tools: the chat model cannot propose changes, the action model can', () => {
  const chat = toolsFor('chat').map(tool => tool.name);
  const action = toolsFor('action').map(tool => tool.name);
  assert.ok(chat.includes('route_to_action') && !chat.some(name => name.startsWith('propose_')));
  assert.ok(action.includes('propose_add_job') && !action.includes('route_to_action'));
  for (const tool of [...toolsFor('chat'), ...toolsFor('action')]) assert.equal(tool.parameters.type, 'object');
});

test('tools: reads use the account data, lists are capped and never include other accounts', async () => {
  const stores = memoryStores();
  const execute = createToolbox({ user: fixture(), ...stores });
  const owed = await execute({ id: '1', name: 'receivables', args: {} }) as { result: any };
  assert.equal(owed.result.all_unpaid.total, 3);
  assert.equal(owed.result.overdue.rows[0].name, 'ออกแบบโลโก้ ตัวอย่าง');
  const working = await execute({ id: '2', name: 'search_jobs', args: { status: 'working' } }) as { result: any };
  assert.deepEqual(working.result.rows.map((row: any) => row.job_id), ['job-video']);
  const byClient = await execute({ id: '3', name: 'search_jobs', args: { query: 'ร้านตัวอย่าง' } }) as { result: any };
  assert.equal(byClient.result.total, 2);
  const missing = await execute({ id: '4', name: 'get_job', args: { job_id: 'someone-elses-job' } }) as { result: any };
  assert.equal(missing.result.ok, false);
});

test('annual income is available through the normal Gemini tool round with only own saved data', async () => {
  const sent: Sent[] = [];
  const user = fixture();
  user.jobs = [{ id: 'paid', name: 'งานปีนี้', client: 'ลูกค้า A', value: 10000, received: 9700, pending: 0, whtRate: 3, paymentStatus: 'paid', status: 'done', payDate: '2026-02-03' }] as any;
  (user as any).notif_settings = { lineLinkCode: 'PRIVATE-LINK-CODE' };
  (user as any).avatar_data_url = 'PRIVATE-AVATAR';
  const outcomes: any[] = [];
  await runAssistant({ user, plan: 'admin', text: 'ยอดรายได้รวมทั้งปี 2569 เท่าไหร่' }, {
    config: config(), ...memoryStores(), now: new Date('2026-10-24T04:00:00Z'),
    fetchImpl: fakeFetch([geminiCall('financial_summary', { year: 2569 }), geminiText('รับเงินจริงปี 2569 จำนวน 9,700 บาทครับ')], sent),
    observe: (_call, outcome) => outcomes.push(outcome.result),
  });
  assert.equal(outcomes[0].ok, true);
  assert.equal(outcomes[0].period.year_ce, 2026);
  assert.match(JSON.stringify(outcomes[0]), /9700/);
  assert.doesNotMatch(JSON.stringify(sent.map(item => item.body)), /PRIVATE-LINK-CODE|PRIVATE-AVATAR/);
  assert.equal(sent.length, 2, 'one tool round; no separate training or evaluation calls');
});

test('route tool allowlist rejects a proposal called directly by the chat model', async () => {
  const stores = memoryStores();
  const outcomes: any[] = [];
  await runAssistant({ user: fixture(), plan: 'admin', text: 'ช่วยดูงาน', forceRoute: 'chat' }, {
    config: config(), ...stores,
    fetchImpl: fakeFetch([geminiCall('propose_delete_job', { job_id: 'job-logo' }), geminiText('ยังไม่ได้เปลี่ยนข้อมูลครับ')], []),
    observe: (_call, outcome) => outcomes.push(outcome.result),
  });
  assert.equal(outcomes[0].ok, false);
  assert.equal(stores.saved.size, 0);
});

test('old list tools expose further pages without changing full-match totals', async () => {
  const user = fixture();
  user.jobs = Array.from({ length: 13 }, (_, index) => ({ ...user.jobs![0], id: `job-${index}` }));
  const execute = createToolbox({ user, ...memoryStores(), now: new Date('2026-10-24T04:00:00Z') });
  const first = (await execute({ id: 'a', name: 'search_jobs', args: {} })).result as any;
  const next = (await execute({ id: 'b', name: 'search_jobs', args: { offset: first.next_offset } })).result as any;
  assert.equal(first.total, 13);
  assert.equal(next.rows.length, 3);
  assert.equal(next.total_value, first.total_value);
  assert.equal(((await execute({ id: 'c', name: 'money_summary', args: { year: 2569 } })).result as any).ok, false);
  assert.equal(((await execute({ id: 'd', name: 'money_summary', args: { month: '2026-01' } })).result as any).ok, false);
  assert.equal(((await execute({ id: 'e', name: 'search_jobs', args: { user_id: 'another-user' } })).result as any).ok, false);
});

test('tools: proposals are validated and saved as proposals only, with a confirmation card', async () => {
  const stores = memoryStores();
  const user = fixture();
  const execute = createToolbox({ user, ...stores });
  assert.equal(((await execute({ id: '1', name: 'propose_add_job', args: { name: 'งานใหม่' } })).result as any).ok, false);
  const FULL = { client: 'ลูกค้าตัวอย่าง', delivered: true, delivery_date: '2026-10-24', payment_status: 'unpaid', credit_term_days: 30, wht_rate: 3 };
  assert.equal(((await execute({ id: '2', name: 'propose_add_job', args: { ...FULL, name: 'งานใหม่', value: 1000, wht_rate: 150 } })).result as any).ok, false);
  const added = await execute({ id: '3', name: 'propose_add_job', args: { ...FULL, name: 'แปลเอกสาร', value: 4000 } });
  assert.equal(added.card?.kind, 'confirm');
  assert.equal((added.result as any).saved, false);
  const proposal = stores.saved.get((added.result as any).proposal_id)!;
  assert.equal(proposal.kind, 'add_job');
  assert.equal(proposal.record!.pending, 3880);
  assert.equal(proposal.record!.whtAmount, 120);
  assert.deepEqual([proposal.record!.isPosted, proposal.record!.postDate, proposal.record!.creditTerm, proposal.record!.payDate, proposal.record!.status],
    [true, '2026-10-24', 30, '2026-11-23', 'pending'], 'due 30 days after delivery, like the app form');
  assert.equal(user.jobs!.length, 4, 'nothing is written to the account');

  const full = await execute({ id: '4', name: 'propose_record_payment', args: { job_id: 'job-web', mode: 'full', date: '2026-10-24' } });
  const fullRecord = stores.saved.get((full.result as any).proposal_id)!.record!;
  assert.deepEqual([fullRecord.status, fullRecord.received, fullRecord.pending, fullRecord.payDate], ['done', 29700, 0, '2026-10-24']);
  assert.equal(((await execute({ id: '5', name: 'propose_record_payment', args: { job_id: 'job-web', mode: 'partial', amount: 29700 } })).result as any).ok, false);
  assert.equal(((await execute({ id: '6', name: 'propose_record_payment', args: { job_id: 'job-done', mode: 'full' } })).result as any).ok, false);
  const partial = await execute({ id: '7', name: 'propose_record_payment', args: { job_id: 'job-logo', mode: 'partial', amount: 2000, date: '2026-10-24' } });
  const partialRecord = stores.saved.get((partial.result as any).proposal_id)!.record!;
  assert.deepEqual([partialRecord.status, partialRecord.received, partialRecord.pending], ['partial', 2000, 10000]);

  const removed = await execute({ id: '8', name: 'propose_delete_job', args: { job_id: 'job-video' } });
  assert.equal(stores.saved.get((removed.result as any).proposal_id)!.record, null);
  assert.equal(((await execute({ id: '9', name: 'propose_edit_job', args: { job_id: 'job-web', value: 5000 } })).result as any).ok, false, 'value below what was already received');
});

test('Gemini adapter: key in the header, thinking level set, tool results sent back with the model turn unchanged', async () => {
  const sent: Sent[] = [];
  const stores = memoryStores();
  const result = await geminiProvider.run({
    apiKey: 'test-gemini', model: 'gemini-3.1-flash-lite', system: 'SYSTEM', turns: [{ role: 'user', text: 'เดือนนี้ได้เงินเท่าไหร่' }],
    tools: toolsFor('chat'), maxOutputTokens: 600, effort: 'minimal', execute: createToolbox({ user: fixture(), ...stores }),
    fetchImpl: fakeFetch([geminiCall('money_summary', { month: 'this' }), geminiText('เดือนนี้รับแล้ว ฿8,000 ครับ')], sent),
  });
  assert.equal(result.text, 'เดือนนี้รับแล้ว ฿8,000 ครับ');
  assert.equal(sent[0].headers['x-goog-api-key'], 'test-gemini');
  assert.ok(!sent[0].url.includes('test-gemini'), 'the key never goes in the URL');
  assert.equal(sent[0].body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  const second = sent[1].body.contents;
  assert.equal(second[1].parts[0].thoughtSignature, 'sig-1');
  assert.equal(second[2].parts[0].functionResponse.name, 'money_summary');
  assert.equal(second[2].parts[0].functionResponse.id, 'c-money_summary');
  assert.deepEqual(result.usage, { inputTokens: 1900, cachedInputTokens: 0, outputTokens: 60, thinkingTokens: 10 });
});

test('Gemini adapter: a model that rejects the thinking setting is retried once without it', async () => {
  const sent: Sent[] = [];
  const result = await geminiProvider.run({
    apiKey: 'k', model: 'gemini-x', system: 'S', turns: [{ role: 'user', text: 'hi' }], tools: [], maxOutputTokens: 100, effort: 'minimal',
    execute: async () => ({ result: null }),
    fetchImpl: fakeFetch([{ status: 400, json: { error: { message: 'thinking_level is not supported' } } }, geminiText('hello')], sent),
  });
  assert.equal(result.text, 'hello');
  assert.equal(sent[1].body.generationConfig.thinkingConfig, undefined);
});

test('OpenAI adapter: nothing stored at OpenAI, reasoning handed back, tool output by call id', async () => {
  const sent: Sent[] = [];
  const stores = memoryStores();
  const result = await openaiProvider.run({
    apiKey: 'test-openai', model: 'gpt-5.4-mini', system: 'SYSTEM', turns: [{ role: 'user', text: 'งานไหนยังไม่ส่ง' }],
    tools: toolsFor('action'), maxOutputTokens: 1200, effort: 'low', execute: createToolbox({ user: fixture(), ...stores }),
    fetchImpl: fakeFetch([openaiCall('search_jobs', { status: 'working' }), openaiText('ยังไม่ส่ง 1 งานครับ')], sent),
  });
  assert.equal(result.text, 'ยังไม่ส่ง 1 งานครับ');
  assert.equal(sent[0].headers.authorization, 'Bearer test-openai');
  assert.equal(sent[0].body.store, false);
  assert.deepEqual(sent[0].body.include, ['reasoning.encrypted_content']);
  const input = sent[1].body.input;
  assert.equal(input[1].type, 'reasoning');
  assert.equal(input[3].type, 'function_call_output');
  assert.equal(input[3].call_id, 'call-search_jobs');
  assert.equal(JSON.parse(input[3].output).rows[0].job_id, 'job-video');
});

test('gateway: off by default, and a missing key stops it before any call', async () => {
  const stores = memoryStores();
  const request = { user: fixture(), plan: 'pro' as const, text: 'สวัสดี' };
  await assert.rejects(runAssistant(request, { config: aiConfig({}), ...stores }), (error: unknown) => error instanceof AiUnavailableError && error.reason === 'disabled');
  const sent: Sent[] = [];
  await assert.rejects(runAssistant(request, { config: config({ OPENAI_API_KEY: '' }), ...stores, fetchImpl: fakeFetch([], sent) }), (error: unknown) => error instanceof AiUnavailableError && error.reason === 'missing_key');
  await assert.rejects(runAssistant(request, { config: aiConfig({ AI_ENABLED: 'true' }), ...stores, fetchImpl: fakeFetch([], sent) }), (error: unknown) => error instanceof AiUnavailableError && error.reason === 'missing_key');
  assert.equal(sent.length, 0);
});

test('gateway: the chat model hands a change to the action model, which returns a card; cost covers both', async () => {
  const sent: Sent[] = [];
  const stores = memoryStores();
  const user = fixture();
  // Routing V2 sends a clear change ("ช่วยจดงาน… 4,000 บาท") straight to the action tools; a statement like this one
  // starts as conversation and is handed over.
  const reply = await runAssistant({ user, plan: 'pro', text: 'ลูกค้าตัวอย่างจ้างแปลเอกสาร 4,000 บาท' }, {
    config: config(), ...stores,
    fetchImpl: fakeFetch([
      geminiCall('route_to_action', { summary: 'เพิ่มงานแปลเอกสาร 4,000 บาท ลูกค้าตัวอย่าง' }),
      openaiCall('propose_add_job', { name: 'แปลเอกสาร', value: 4000, client: 'ลูกค้าตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }),
      openaiText('เตรียมงานแปลเอกสาร ฿4,000 ไว้แล้ว กดยืนยันบนการ์ดเพื่อบันทึกครับ'),
    ], sent),
  });
  assert.equal(reply.route, 'action');
  assert.equal(reply.handedOff, true);
  assert.deepEqual(reply.calls.map(call => call.provider), ['gemini', 'openai']);
  assert.equal(reply.cards[0].kind, 'confirm');
  assert.match(sent[1].body.instructions, /HANDOVER FROM THE CONVERSATION ASSISTANT: เพิ่มงานแปลเอกสาร/);
  assert.ok(reply.costUsd > 0 && reply.tokens >= 1);
  assert.equal(user.jobs!.length, 4, 'nothing saved before the user confirms');
  assert.equal(stores.saved.size, 1);
});

test('gateway: a model stuck in tool calls stops at the step limit with a polite reply', async () => {
  const stores = memoryStores();
  const sent: Sent[] = [];
  let executed = 0;
  const loops = Array.from({ length: 4 }, () => geminiCall('receivables', {}));
  const reply = await runAssistant({ user: fixture(), plan: 'pro', text: 'ใครค้างจ่ายบ้าง' }, {
    config: config({ AI_MAX_TOOL_STEPS: '4' }), ...stores, fetchImpl: fakeFetch(loops, sent), observe: () => { executed += 1; },
  });
  assert.equal(reply.calls[0].stoppedAt, 'max_steps');
  assert.match(reply.text, /ยังทำไม่เสร็จในรอบเดียว/);
  assert.doesNotMatch(reply.text, /ทีละเรื่อง/, 'never asks the owner to send it one step at a time');
  assert.equal(sent.length, 4, 'the step limit still bounds paid model requests');
  assert.equal(executed, 4, 'tools in the final already-paid response are not discarded');
  assert.equal(reply.calls[0].usage.inputTokens, 3600);
});

test('gateway: the final validated edit clarification is useful without an extra paid turn, and a later result clears it', async () => {
  for (const laterRead of [false, true]) {
    const stores = memoryStores();
    const sent: Sent[] = [];
    const user = fixture();
    user.jobs!.find(job => job.id === 'job-done')!.payDate = null;
    const reply = await runAssistant({ user, plan: 'pro', text: 'แก้งานถ่ายภาพสินค้าเป็นไม่หักภาษีและรับครบแล้ว', forceRoute: 'action' }, {
      config: config({ AI_ACTION_MODEL: 'gemini-3.5-flash-lite', AI_MAX_TOOL_STEPS: laterRead ? '2' : '1' }), ...stores,
      fetchImpl: fakeFetch([
        geminiCall('propose_edit_job', { job_id: 'job-done', wht_rate: 0, payment_status: 'paid' }),
        ...(laterRead ? [geminiCall('receivables', {})] : []),
      ], sent),
    });
    assert.equal(reply.calls[0].stoppedAt, 'max_steps');
    assert.equal(sent.length, laterRead ? 2 : 1);
    assert.equal(reply.calls[0].usage.inputTokens, sent.length * 900);
    assert.ok(reply.costUsd > 0 && reply.tokens >= 1, 'every paid response remains accounted for');
    assert.equal(reply.cards.filter(card => card.kind === 'confirm').length, 0);
    assert.equal(stores.saved.size, 0);
    if (laterRead) {
      assert.match(reply.text, /ยังทำไม่เสร็จในรอบเดียว/);
      assert.doesNotMatch(reply.text, /ทีละเรื่อง/, 'never asks to send it one step at a time');
      assert.doesNotMatch(reply.text, /ระบุวันที่รับเงินจริงของยอดเดิม/);
    } else {
      assert.equal(reply.text, 'ระบุวันที่รับเงินจริงของยอดเดิม เพื่อไม่ย้ายรายรับไปวันนี้');
      assert.doesNotMatch(reply.text, /แยกเป็นคำขอ|กดยืนยัน|บันทึกแล้ว/);
    }
  }
});

for (const provider of ['gemini', 'openai'] as const) {
  test(`gateway: ${provider} returns the valid proposal from the last budgeted response and accounts for every call`, async () => {
    const call = provider === 'gemini' ? geminiCall : openaiCall;
    const sent: Sent[] = [];
    const stores = memoryStores();
    const user = fixture();
    const before = structuredClone(user.jobs);
    const outcomes: any[] = [];
    const cfg = config({ AI_ACTION_MODEL: provider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-5.4-mini', AI_MAX_TOOL_STEPS: '4' });
    const reply = await runAssistant({ user, plan: 'pro', text: 'แก้ชื่องานโลโก้เป็น โลโก้ฉบับแก้ไข', forceRoute: 'action' }, {
      config: cfg, ...stores,
      fetchImpl: fakeFetch([
        call('search_jobs', { query: 'โลโก้' }),
        call('get_job', { job_id: 'job-logo' }),
        call('feature_lookup', { question: 'แก้ไขงาน' }),
        call('propose_edit_job', { job_id: 'job-logo', name: 'โลโก้ฉบับแก้ไข' }),
      ], sent),
      observe: (_call, outcome) => outcomes.push(outcome.result),
    });
    assert.equal(sent.length, 4, 'no extra model call is made to describe the confirmation');
    assert.equal(reply.calls[0].steps, 4);
    assert.equal(reply.calls[0].stoppedAt, 'max_steps');
    assert.equal(reply.calls[0].toolCalls.length, 4);
    assert.equal(outcomes.at(-1).ok, true);
    assert.equal(stores.saved.size, 1);
    const proposal = [...stores.saved.values()][0];
    assert.equal(proposal.userId, user.user_id);
    assert.equal(proposal.record?.name, 'โลโก้ฉบับแก้ไข');
    assert.deepEqual(user.jobs, before, 'a proposal does not mutate the account');
    assert.equal(reply.cards.filter(card => card.kind === 'confirm').length, 1);
    assert.match(reply.text, /ยังไม่ได้บันทึก/);
    assert.match(reply.text, /กดยืนยัน/);
    assert.doesNotMatch(reply.text, /หลายขั้นตอนเกิน|แยกเป็นคำขอ/);
    const expected = provider === 'gemini'
      ? { inputTokens: 3600, cachedInputTokens: 0, outputTokens: 80, thinkingTokens: 0 }
      : { inputTokens: 6000, cachedInputTokens: 4000, outputTokens: 240, thinkingTokens: 120 };
    assert.deepEqual(reply.calls[0].usage, expected);
    assert.equal(reply.costUsd, costUsd(provider, cfg.actionModel, expected));
    assert.equal(reply.tokens, krarokTokens(reply.costUsd, cfg.tokenUsd));
  });
}

test('gateway: a final-step invalid or out-of-route proposal is rejected without claiming it was prepared', async () => {
  for (const forceRoute of ['chat', 'action'] as const) {
    const sent: Sent[] = [];
    const stores = memoryStores();
    const cfg = config({ AI_MAX_TOOL_STEPS: '1', AI_ACTION_MODEL: 'gemini-3.5-flash-lite' });
    const reply = await runAssistant({ user: fixture(), plan: 'pro', text: 'ช่วยดูงาน', forceRoute }, {
      config: cfg, ...stores,
      fetchImpl: fakeFetch([geminiCall('propose_delete_job', { job_id: forceRoute === 'chat' ? 'job-logo' : 'foreign-job' })], sent),
    });
    assert.equal(sent.length, 1);
    assert.equal(stores.saved.size, 0);
    assert.equal(reply.cards.some(card => card.kind === 'confirm'), false);
    assert.doesNotMatch(reply.text, /เตรียมรายการที่แสดงบนการ์ด/);
    assert.equal(reply.calls[0].usage.inputTokens, 900);
  }
});

test('gateway: final-step handoff and final-step action each stay within their own budget and both are charged', async () => {
  const sent: Sent[] = [];
  const stores = memoryStores();
  const cfg = config({ AI_MAX_TOOL_STEPS: '1' });
  const reply = await runAssistant({ user: fixture(), plan: 'pro', text: 'ช่วยจัดการงานโลโก้', forceRoute: 'chat' }, {
    config: cfg, ...stores,
    fetchImpl: fakeFetch([
      geminiCall('route_to_action', { summary: 'แก้ชื่องานโลโก้เป็น โลโก้ฉบับแก้ไข' }),
      openaiCall('propose_edit_job', { job_id: 'job-logo', name: 'โลโก้ฉบับแก้ไข' }),
    ], sent),
  });
  assert.equal(sent.length, 2);
  assert.equal(reply.handedOff, true);
  assert.equal(stores.saved.size, 1);
  assert.deepEqual(reply.calls.map(call => call.steps), [1, 1]);
  assert.deepEqual(reply.calls.map(call => call.usage.inputTokens), [900, 1500]);
  assert.equal(reply.costUsd, reply.calls.reduce((sum, call) => sum + call.costUsd, 0));
  assert.equal(reply.tokens, krarokTokens(reply.costUsd, cfg.tokenUsd));
  assert.match(reply.text, /ยังไม่ได้บันทึก/);
});

test('attachments: only real pictures and PDFs up to 4 MB, checked by their first bytes', async () => {
  const { checkAttachment, ATTACHMENT_MAX_BYTES } = await import('../backend/src/ai/attachment');
  const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
  const jpeg = b64([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
  assert.equal(checkAttachment({ name: 'สลิป.jpg', mimeType: 'image/jpeg', data: jpeg }).mimeType, 'image/jpeg');
  assert.equal(checkAttachment({ name: 'quote.pdf', mimeType: 'application/pdf', data: b64([...Buffer.from('%PDF-1.7 ...')]) }).mimeType, 'application/pdf');
  const refused = (input: { name: string; mimeType: string; data: string }, status: number) =>
    assert.throws(() => checkAttachment(input), (error: any) => error.status === status);
  refused({ name: 'x.jpg', mimeType: 'image/jpeg', data: b64([...Buffer.from('<html>not a picture</html>')]) }, 400);
  refused({ name: 'x.pdf', mimeType: 'application/pdf', data: jpeg }, 400);
  refused({ name: 'x.jpg', mimeType: 'image/jpeg', data: 'not base64!' }, 400);
  refused({ name: 'x.jpg', mimeType: 'image/jpeg', data: Buffer.alloc(ATTACHMENT_MAX_BYTES + 3, 0xff).toString('base64') }, 413);
  assert.equal(checkAttachment({ name: 'a\u0000b\u001f.jpg', mimeType: 'image/jpeg', data: jpeg }).name, 'ab.jpg');
});

test('a picture goes to Gemini as inline data before the words, and the request is routed to the action model', async () => {
  const sent: Sent[] = [];
  const stores = memoryStores();
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]).toString('base64');
  await runAssistant({ user: fixture(), plan: 'pro', text: 'สลิปนี้ของงานไหน', attachment: { name: 'slip.jpg', mimeType: 'image/jpeg', data } },
    { config: config({ AI_ACTION_MODEL: 'gemini-3.5-flash-lite' }), ...stores, fetchImpl: fakeFetch([geminiText('สลิปนี้ ฿3,500 ครับ')], sent) });
  const last = sent[0].body.contents.at(-1);
  assert.deepEqual(last.parts[0], { inlineData: { mimeType: 'image/jpeg', data } });
  assert.equal(last.parts[1].text, 'สลิปนี้ของงานไหน');
  assert.match(sent[0].body.systemInstruction.parts[0].text, /MODE: action/);
  assert.match(sent[0].body.systemInstruction.parts[0].text, /ATTACHMENTS:/);
});

test('add job: nothing is prepared until the key details are given; the tool says exactly what to ask', async () => {
  const stores = memoryStores();
  const execute = createToolbox({ user: fixture(), ...stores });
  const first = (await execute({ id: '1', name: 'propose_add_job', args: { name: 'ออกแบบโลโก้', value: 5000 } })).result as any;
  assert.equal(first.ok, false);
  assert.deepEqual(first.missing, ['ลูกค้า (หรือ "ไม่ระบุ")', 'ส่งงานแล้วหรือยังกำลังทำ', 'สถานะการชำระ (ยังไม่จ่าย / จ่ายบางส่วน / จ่ายครบแล้ว / แบ่งงวด)', 'เครดิตเทอม (กี่วันหลังส่งงาน) หรือวันครบกำหนดรับเงิน', 'หัก ณ ที่จ่ายกี่ % (ไม่มีก็ได้)']);
  assert.equal(stores.saved.size, 0);
  const delivered = (await execute({ id: '2', name: 'propose_add_job', args: { name: 'ออกแบบโลโก้', value: 5000, client: 'ร้านตัวอย่าง', delivered: true, payment_status: 'partial', wht_rate: 0, credit_term_days: 7 } })).result as any;
  assert.deepEqual(delivered.missing, ['วันที่ส่งงาน', 'ยอดที่ได้รับแล้ว']);
  // Fully paid needs no credit term; in progress needs no delivery date (and has no due date yet).
  const paid = await execute({ id: '3', name: 'propose_add_job', args: { name: 'ถ่ายภาพ', value: 3000, client: 'ไม่ระบุ', delivered: true, delivery_date: '2026-10-20', payment_status: 'paid', paid_date: '2026-10-22', wht_rate: 0 } });
  const paidJob = stores.saved.get((paid.result as any).proposal_id)!.record!;
  assert.deepEqual([paidJob.client, paidJob.received, paidJob.pending, paidJob.payDate, paidJob.status, paidJob.paymentStatus], ['', 3000, 0, '2026-10-22', 'done', 'paid']);
  const working = await execute({ id: '4', name: 'propose_add_job', args: { name: 'ตัดต่อวิดีโอ', value: 8000, client: 'แบรนด์ตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 30, wht_rate: 0 } });
  const workingJob = stores.saved.get((working.result as any).proposal_id)!.record!;
  assert.deepEqual([workingJob.isPosted, workingJob.postDate, workingJob.payDate, workingJob.creditTerm], [false, '', null, 30]);
  assert.ok(working.card?.kind === 'confirm' && working.card.changes.some(row => row.label === 'ครบกำหนดรับเงิน' && row.value === 'เครดิต 30 วันหลังส่งงาน'));
  // A due date instead of a credit term: the term is worked out from the delivery day.
  const dated = await execute({ id: '5', name: 'propose_add_job', args: { name: 'แปลเอกสาร', value: 2000, client: 'ลูกค้าตัวอย่าง', delivered: true, delivery_date: '2026-10-24', payment_status: 'unpaid', pay_date: '2026-11-08', wht_rate: 0 } });
  const datedJob = stores.saved.get((dated.result as any).proposal_id)!.record!;
  assert.deepEqual([datedJob.payDate, datedJob.creditTerm], ['2026-11-08', 15]);
});

test('money summary comes with the summary card the chat already draws', async () => {
  const stores = memoryStores();
  const execute = createToolbox({ user: fixture(), ...stores });
  const outcome = await execute({ id: '1', name: 'money_summary', args: { month: 'this' } });
  assert.equal(outcome.card?.kind, 'summary');
  const card = outcome.card as { period: string; income: string; expense: string; balance: string };
  assert.match(card.period, /^\S+ 25\d\d$/);
  assert.match(card.income, /^฿/);
});

test('documents: found by client or number, newest first, with the same total as the documents page and open links', async () => {
  const stores = memoryStores();
  const user = { ...fixture(), invoices: [
    { id: 'doc-1', documentType: 'quotation', documentNo: 'QT-2569-007', createdDate: '2026-10-01', client: { name: 'บริษัท ตัวอย่าง จำกัด' }, items: [{ quantity: 2, price: 5000, discount: 0 }], vatRate: 7 },
    { id: 'doc-2', documentType: 'quotation', documentNo: 'QT-2569-008', createdDate: '2026-10-20', client: { name: 'บริษัท ตัวอย่าง จำกัด' }, items: [{ quantity: 1, price: 12000, discount: 0 }], vatRate: 0 },
    { id: 'doc-3', documentType: 'invoice', documentNo: 'INV-2569-003', createdDate: '2026-10-22', client: { name: 'ร้านตัวอย่าง' }, items: [{ quantity: 1, price: 3500 }], vatRate: 0 },
  ] } as any;
  const execute = createToolbox({ user, ...stores });
  const found = await execute({ id: '1', name: 'search_documents', args: { query: 'บริษัท ตัวอย่าง', type: 'quotation' } });
  const result = found.result as any;
  assert.deepEqual(result.rows.map((row: any) => [row.number, row.amount]), [['QT-2569-008', '฿12,000'], ['QT-2569-007', '฿10,700']]);
  assert.equal(found.card?.kind, 'document');
  assert.deepEqual(found.card, { kind: 'document', docType: 'ใบเสนอราคา', number: 'QT-2569-008', client: 'บริษัท ตัวอย่าง จำกัด', amount: '฿12,000', path: '/invoice?type=quotation&document=doc-2' });
  assert.equal(found.extraCards?.length, 1);
  const none = await execute({ id: '2', name: 'search_documents', args: { query: 'ไม่มีลูกค้านี้' } });
  assert.equal((none.result as any).total, 0);
  assert.equal(none.card, undefined);
});

test('who gets the real เลขา while it is admins-only: admins and the allowed emails (a Worker secret), then everyone', async () => {
  const { aiAllowedFor } = await import('../backend/src/ai/config');
  const testing = aiConfig({ AI_ENABLED: 'true', AI_ALLOWED_EMAILS: ' Owner@Example.com, second@example.com ' });
  assert.equal(aiAllowedFor(testing, 'admin', 'someone@example.com'), true);
  assert.equal(aiAllowedFor(testing, 'pro', 'owner@example.com'), true, 'case and spaces do not matter');
  assert.equal(aiAllowedFor(testing, 'pro', 'customer@example.com'), false);
  assert.equal(aiAllowedFor(testing, 'pro', null), false);
  assert.equal(aiAllowedFor(aiConfig({ AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false' }), 'pro', 'customer@example.com'), true);
  assert.equal(aiAllowedFor(aiConfig({ AI_ENABLED: 'false', AI_ALLOWED_EMAILS: 'owner@example.com' }), 'admin', 'owner@example.com'), false);
});

test('Gemini adapter: a call that stalls or answers busy is tried once more; a second stall still fails', { timeout: 5000 }, async (t) => {
  // AbortSignal.timeout does not keep Node alive, and the fake fetch below has no socket to do so.
  // Keep this test alive until its assertions finish (or its bounded timeout fires), then always clean up.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));
  const run = (fetchImpl: typeof fetch) => geminiProvider.run({
    apiKey: 'k', model: 'gemini-x', system: 'S', turns: [{ role: 'user', text: 'hi' }], tools: [], maxOutputTokens: 100,
    execute: async () => ({ result: null }), fetchImpl, stallMs: 50,
  });
  // Hangs until the per-call timer gives up on it, like the 30 s stalls seen on 2026-10-24.
  const hang = (_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)));
  let calls = 0;
  const stallThenAnswer = (async (url: string, init: RequestInit) => (++calls === 1 ? hang(url, init) : new Response(JSON.stringify(geminiText('hello').json), { status: 200 }))) as unknown as typeof fetch;
  assert.equal((await run(stallThenAnswer)).text, 'hello');
  assert.equal(calls, 2);
  const sent: Sent[] = [];
  assert.equal((await run(fakeFetch([{ status: 503, json: { error: { message: 'overloaded' } } }, geminiText('hello')], sent))).text, 'hello');
  assert.equal(sent.length, 2);
  await assert.rejects(run(((url: string, init: RequestInit) => hang(url, init)) as unknown as typeof fetch));
});

test('a long message or pasted list reaches the model whole (6,000 characters), earlier turns stay short', async () => {
  const { MAX_MESSAGE_CHARS } = await import('../backend/src/ai/gateway');
  assert.equal(MAX_MESSAGE_CHARS, 6000);
  const sent: Sent[] = [];
  const long = 'เพิ่มงาน '.repeat(600);
  await runAssistant({ user: fixture(), plan: 'pro', text: long, forceRoute: 'chat', history: [{ role: 'user', text: 'ก'.repeat(5000) }] },
    { config: config(), ...memoryStores(), fetchImpl: fakeFetch([geminiText('รับทราบครับ')], sent) });
  const contents = sent[0].body.contents;
  assert.equal(contents.at(-1).parts.at(-1).text.length, Math.min(long.length, 6000));
  assert.equal(contents[0].parts.at(-1).text.length, 2000);
  const { buildSystemPrompt } = await import('../backend/src/ai/prompt');
  const prompt = buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '{}' });
  assert.match(prompt, /prepare one card per job or item in the same turn/);
  assert.match(prompt, /Never ask the user to send the steps one at a time/);
});

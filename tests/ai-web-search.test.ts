import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { costUsd, WEB_SEARCH_USD } from '../backend/src/ai/cost';
import { memoryStores, runAssistant, webSources } from '../backend/src/ai/gateway';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';
import { anthropicProvider } from '../backend/src/ai/providers/anthropic';
import { assessMessage, decideRoute, webResearch } from '../backend/src/ai/routingPolicy';

// Owner, 2026-11-01: "เพิ่มความสามารถน้อง ค้นหาข้อมูลด้านนอกได้ ... แปะลิงก์อ้างอิงช่วงท้าย". Facts outside the app go to
// Sonnet with Anthropic's web search; the pages it cites come back as a sources card. Fake Anthropic server, no cost.

type Sent = { url: string; body: any };
function fakeAnthropic(replies: unknown[], sent: Sent[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const next = replies.shift();
    if (!next) throw new Error('no more fake replies');
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
}
const usage = (searches = 0) => ({ input_tokens: 2000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: searches } });
const message = (content: unknown[], stop: string, searches = 0) =>
  ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, stop_sequence: null, usage: usage(searches) });
const cite = (url: string, title: string | null) => ({ type: 'web_search_result_location', url, title, cited_text: 'ข้อความที่อ้างอิง', encrypted_index: 'idx' });
const answer = [
  { type: 'text', text: 'ค่าลดหย่อนส่วนตัว ' },
  { type: 'text', text: '60,000 บาท', citations: [cite('https://www.rd.go.th/59670.html', 'ค่าลดหย่อน | กรมสรรพากร')] },
  { type: 'text', text: ' และประกันสังคมตามที่จ่ายจริง', citations: [cite('https://www.rd.go.th/59670.html', 'ซ้ำ'), cite('https://www.sso.go.th/x', null), cite('javascript:alert(1)', 'bad')] },
];
const system = 'SHARED RULES '.repeat(50) + '\n\nUSER\n\nPLAN: pro';

test('routing: outside tax and money facts go to the smart model with web search; the user\'s own records and changes do not', () => {
  const web = (text: string) => decideRoute({ text }).web === true;
  for (const text of ['ฟรีแลนซ์ลดหย่อนภาษีอะไรได้บ้าง', 'ยื่นภาษีออนไลน์ปีนี้ถึงวันไหน', 'ภ.ง.ด.90 ต่างจาก 94 ยังไง', 'อัตราภาษีขั้นบันไดปี 2568',
    'ค่าประกันสังคมมาตรา 40 จ่ายเท่าไหร่', 'ช่วยหาข้อมูลเรื่องจด vat ให้หน่อย', 'ถ้ารายได้ปีละ 500,000 ต้องเสียภาษีเท่าไหร่', 'กองทุน SSF ลดหย่อนได้เท่าไหร่']) {
    assert.ok(web(text), text);
    assert.equal(decideRoute({ text }).tier, 'smart', text);
    assert.equal(decideRoute({ text }).reason, 'web_research', text);
  }
  for (const text of ['งานนี้หักภาษีเท่าไร', 'เพิ่มงานรีวิว 5000 หัก 3%', 'สวัสดี', 'สรุปเดือนนี้', 'ภาษีหัก ณ ที่จ่ายอยู่หน้าไหน', 'ลดหย่อนภาษีในแอปดูตรงไหน',
    'วันนี้รับเงินค่ารีวิว 5000 แล้ว', 'จ่ายประกันสังคมแล้ว 750', 'แนะนำหนังหน่อย', 'บันทึกค่าประกันสังคม 750']) {
    assert.ok(!web(text), text);
  }
  // A reply that confirms a pending card is never sent to search.
  assert.equal(decideRoute({ text: 'ลดหย่อนภาษียังไง', pendingConfirmation: true }).web, undefined);
  assert.equal(webResearch('ลบงานภาษีเงินได้', assessMessage({ text: 'ลบงานภาษีเงินได้' })), false);
});

test('Claude: web search is offered only when asked, on Bangkok time, capped; cited pages come back once each; searches are billed', async () => {
  const sent: Sent[] = [];
  const result = await anthropicProvider.run({
    apiKey: 'k', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'ลดหย่อนภาษีอะไรได้บ้าง' }],
    tools: [{ name: 'feature_lookup', description: 'App knowledge', parameters: { type: 'object', properties: {} } }],
    maxOutputTokens: 600, effort: 'low', maxSteps: 4, execute: async () => ({ result: { ok: true } }),
    webSearch: { maxUses: 2 },
    fetchImpl: fakeAnthropic([message(answer, 'end_turn', 2)], sent),
  });
  const tools = sent[0].body.tools;
  assert.equal(tools.length, 2);
  assert.equal(tools[0].name, 'feature_lookup', 'the client tools stay first, so their part of the cache reads the same');
  assert.deepEqual(tools[1], { type: 'web_search_20260318', name: 'web_search', max_uses: 2, allowed_callers: ['direct'],
    user_location: { type: 'approximate', timezone: 'Asia/Bangkok' } });
  assert.equal(result.text, 'ค่าลดหย่อนส่วนตัว 60,000 บาท และประกันสังคมตามที่จ่ายจริง');
  assert.deepEqual(result.sources, [
    { title: 'ค่าลดหย่อน | กรมสรรพากร', url: 'https://www.rd.go.th/59670.html' },
    { title: 'www.sso.go.th', url: 'https://www.sso.go.th/x' },
  ]);
  assert.equal(result.usage.webSearches, 2);
  const tokensOnly = costUsd('anthropic', 'claude-sonnet-5-5', { ...result.usage, webSearches: 0 });
  assert.equal(Number((costUsd('anthropic', 'claude-sonnet-5-5', result.usage) - tokensOnly).toFixed(6)), 2 * WEB_SEARCH_USD);

  const plain: Sent[] = [];
  await anthropicProvider.run({ apiKey: 'k', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'สวัสดี' }], tools: [], maxOutputTokens: 600,
    execute: async () => ({ result: null }), fetchImpl: fakeAnthropic([message([{ type: 'text', text: 'สวัสดีครับ' }], 'end_turn')], plain) });
  assert.ok(!plain[0].body.tools.some((tool: { type?: string }) => tool.type?.startsWith('web_search')), 'no search unless the gateway asks for it');
});

test('Claude: with web search, only the text after the last search result is the answer', async () => {
  const content = [
    { type: 'text', text: 'ขอค้นข้อมูลก่อนนะครับ' },
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'กำหนดยื่นภาษี 2568' } },
    { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.rd.go.th/1.html', title: 'กรมสรรพากร', encrypted_content: 'e', page_age: null }] },
    ...answer,
  ];
  const result = await anthropicProvider.run({ apiKey: 'k', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'ยื่นภาษีถึงวันไหน' }], tools: [], maxOutputTokens: 600,
    execute: async () => ({ result: null }), webSearch: { maxUses: 2 }, fetchImpl: fakeAnthropic([message(content, 'end_turn', 1)], []) });
  assert.equal(result.text, 'ค่าลดหย่อนส่วนตัว 60,000 บาท และประกันสังคมตามที่จ่ายจริง');
});

test('Claude: a paused search turn is resumed with the paused answer as the last message, no extra user message', async () => {
  const sent: Sent[] = [];
  const paused = [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'ลดหย่อนภาษี 2568' } }];
  const result = await anthropicProvider.run({
    apiKey: 'k', model: 'claude-sonnet-5-5', system, turns: [{ role: 'user', text: 'ลดหย่อนภาษีอะไรได้บ้าง' }], tools: [], maxOutputTokens: 600, maxSteps: 4,
    execute: async () => ({ result: null }), webSearch: { maxUses: 2 },
    fetchImpl: fakeAnthropic([message(paused, 'pause_turn', 1), message(answer, 'end_turn', 1)], sent),
  });
  assert.equal(sent.length, 2);
  const again = sent[1].body.messages;
  assert.equal(again.length, 2);
  assert.equal(again[1].role, 'assistant');
  assert.deepEqual(again[1].content, paused);
  assert.equal(result.usage.webSearches, 2);
  assert.equal(result.sources?.length, 2);
});

test('gateway: an outside-facts question runs Sonnet with web search and the web rules; its citations become a sources card', async () => {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(message(answer, 'end_turn', 1)), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const user = { user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as any;
  const env = { AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' };
  const reply = await runAssistant({ user, plan: 'pro', text: 'ฟรีแลนซ์ลดหย่อนภาษีอะไรได้บ้าง' }, { config: aiConfig(env), ...memoryStores(), fetchImpl });
  assert.match(sent[0].url, /anthropic/);
  assert.ok(sent[0].body.tools.some((tool: { type?: string; max_uses?: number }) => tool.type === 'web_search_20260318' && tool.max_uses === 2));
  assert.match(JSON.stringify(sent[0].body.system), /WEB SEARCH THIS TURN/);
  const card = reply.cards.find(item => item.kind === 'sources');
  assert.deepEqual(card, { kind: 'sources', items: [
    { title: 'ค่าลดหย่อน | กรมสรรพากร', url: 'https://www.rd.go.th/59670.html' },
    { title: 'www.sso.go.th', url: 'https://www.sso.go.th/x' },
  ] });
  assert.ok(!/https?:\/\//.test(reply.text), 'the links are in the card, not the text');
  assert.deepEqual(reply.routing?.web, { searches: 1, sources: 2 });
  assert.equal(reply.routing?.reason, 'web_research');

  // LINE: one search (a 20-second deadline), and the sources as a text message LINE links by itself.
  sent.length = 0;
  const line = await runAssistant({ user, plan: 'pro', text: 'ยื่นภาษีออนไลน์ปีนี้ถึงวันไหน', channel: 'line' }, { config: aiConfig(env), ...memoryStores(), fetchImpl });
  assert.ok(sent[0].body.tools.some((tool: { type?: string; max_uses?: number }) => tool.type === 'web_search_20260318' && tool.max_uses === 1));
  const text = lineAssistantReply(line.text, line.cards).map(item => (item as { text?: string }).text ?? '').join('\n');
  assert.match(text, /แหล่งอ้างอิง\n1\. ค่าลดหย่อน \| กรมสรรพากร\nhttps:\/\/www\.rd\.go\.th\/59670\.html/);

  // Turned off by setting: no search tool, no rules, no card.
  sent.length = 0;
  const off = await runAssistant({ user, plan: 'pro', text: 'ฟรีแลนซ์ลดหย่อนภาษีอะไรได้บ้าง' }, { config: aiConfig({ ...env, AI_WEB_SEARCH_MAX_USES: '0' }), ...memoryStores(), fetchImpl });
  assert.ok(!sent[0].body.tools.some((tool: { type?: string }) => tool.type?.startsWith('web_search')));
  assert.ok(!off.cards.some(item => item.kind === 'sources'));

  // An ordinary question never gets the search tool.
  sent.length = 0;
  await runAssistant({ user, plan: 'pro', text: 'วิเคราะห์รายได้ปีนี้ให้หน่อย' }, { config: aiConfig(env), ...memoryStores(), fetchImpl });
  assert.ok(!sent[0].body.tools.some((tool: { type?: string }) => tool.type?.startsWith('web_search')));
});

test('sources: only http(s) addresses without credentials, each once, five at most, short titles', () => {
  const pages = webSources([
    { title: 'a', url: 'https://example.com/1' }, { title: 'dup', url: 'https://example.com/1' }, { title: 'x', url: 'ftp://example.com' },
    { title: 'y', url: 'https://user:pw@example.com' }, { title: 'z', url: 'not a url' }, { title: '', url: 'http://b.example/2' },
    { title: 'ก'.repeat(300), url: 'https://c.example' }, { title: 'd', url: 'https://d.example' }, { title: 'e', url: 'https://e.example' }, { title: 'f', url: 'https://f.example' },
  ]);
  assert.equal(pages.length, 5);
  assert.deepEqual(pages.slice(0, 2), [{ title: 'a', url: 'https://example.com/1' }, { title: 'b.example', url: 'http://b.example/2' }]);
  assert.equal(pages[2].title.length, 140);
});

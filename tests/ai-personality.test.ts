import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { offerLine, offerState, type OfferState } from '../backend/src/ai/bridge';
import { memoryStores, runAssistant } from '../backend/src/ai/gateway';
import { PROMPT_VERSION, buildSystemPrompt } from '../backend/src/ai/prompt';
import { decideRoute } from '../backend/src/ai/routingPolicy';
import { styleReply } from '../backend/src/ai/replyStyle';
import type { ChatTurn } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Owner's brief "KRAROK AI — EXTROVERT PERSONALITY & NATURAL FINANCIAL ENGAGEMENT" (2026-10-25), phase 9: the Thai
// conversations it lists, with a fake Gemini server (no network, no keys, no cost) and a synthetic account. What the
// model then says is checked by the real-model run (scripts/ai-eval, approved budget); here: the rules it is given,
// the history it sees, the model it goes to, one model call per message, and when an offer is allowed.

const A = '55555555-5555-4555-8555-555555555555';
const account = (): UserRow => ({ user_id: A, statuses: [], goals: [], expenses: [], settings: {}, jobs: [] } as unknown as UserRow);
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });
const user = (text: string): ChatTurn => ({ role: 'user', text });
const bot = (text: string): ChatTurn => ({ role: 'assistant', text });

function fakeGemini(reply: string) {
  const requests: { system: string; contents: { role: string; parts: { text?: string }[] }[] }[] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    requests.push({ system: body.systemInstruction?.parts?.[0]?.text ?? '', contents: body.contents ?? [] });
    const json = { candidates: [{ content: { role: 'model', parts: [{ text: reply }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } };
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { requests, fetchImpl };
}

interface Scenario { name: string; history?: ChatTurn[]; text: string; tier: 'light' | 'smart'; tools: 'chat' | 'action'; offer: OfferState }
const FOOD = [user('วันนี้ทำไรกินดี'), bot('ถ้าอยากทำง่าย ๆ ลองไข่เจียวหมูสับไหม ใช้ของไม่เยอะ ทำเร็วด้วย')];
const SMALL_TALK = [
  user('ช่วงนี้อยากหางานอดิเรกทำ'), bot('ลองวาดรูปไหม เริ่มง่าย ใช้ของไม่เยอะ'),
  user('วาดไม่เป็นเลย'), bot('ไม่เป็นไร เริ่มจากวาดเส้นง่าย ๆ ก่อนก็ได้'),
  user('แล้วใช้ไอแพดดีไหม'), bot('ถ้ามีอยู่แล้วก็ดีเลย แอปฟรีก็มีหลายตัว'),
  user('เดี๋ยวลองดู'), bot('ลองดูนะ วาดเสร็จส่งมาอวดได้'),
];
const SCENARIOS: Scenario[] = [
  { name: '1 a dish, then how to make it', history: FOOD, text: 'ขอวิธีทำหน่อย', tier: 'light', tools: 'chat', offer: 'unrelated' },
  { name: '2 everyday talk over many messages', history: SMALL_TALK, text: 'แล้วควรเริ่มวาดอะไรก่อนดี', tier: 'light', tools: 'chat', offer: 'unrelated' },
  { name: '3 chatting like a friend', text: 'เฮ้ย เบื่อว่ะ วันนี้ไม่มีไรทำ', tier: 'light', tools: 'chat', offer: 'unrelated' },
  { name: '4 the CEO calling the secretary', text: 'เลขา สรุปงานที่ต้องจัดการวันนี้ให้หน่อย', tier: 'light', tools: 'chat', offer: 'allowed' },
  { name: '5 from small talk to adding a job', history: FOOD, text: 'เออ เพิ่มงานตัดต่อ 5000 ให้แบรนด์เอหน่อย', tier: 'light', tools: 'action', offer: 'allowed' },
  { name: '6 got paid', text: 'ลูกค้าโอนมาแล้วเว้ย', tier: 'light', tools: 'action', offer: 'allowed' },
  { name: '7 tired, no mood for work', text: 'วันนี้เหนื่อยชิบหาย ไม่อยากทำงานเลย', tier: 'light', tools: 'chat', offer: 'allowed' },
  { name: '8 an offer passed over', history: [user('เดือนนี้รับงานเยอะมาก'), bot('เดือนนี้น่าจะวุ่นน่าดูเลย ถ้ามีงานที่ยังไม่ได้ลงระบบ ส่งรายละเอียดมาได้ เดี๋ยวช่วยบันทึกให้')],
    text: 'อืม ไว้ก่อน ว่าแต่ดูหนังอะไรดี', tier: 'light', tools: 'chat', offer: 'declined' },
  { name: '9 asked to stop offering', history: [user('ลูกค้าเข้ามาอีกสองเจ้าเลย'), bot('โห งานเข้าแบบของจริง'), user('ไม่ต้องชวนบันทึกงานอีกนะ'), bot('ได้เลย')],
    text: 'วันนี้ได้งานใหม่อีกแล้ว', tier: 'light', tools: 'chat', offer: 'off' },
  { name: '10 personal life', text: 'ช่วงนี้ทะเลาะกับแฟนบ่อยมาก เครียดเลย', tier: 'light', tools: 'chat', offer: 'sensitive' },
  { name: '11 something vague', history: [user('ใบเสนอราคาแบบสั้นกับแบบละเอียดต่างกันยังไง'), bot('แบบสั้นมีแค่รายการกับยอด แบบละเอียดมีรายละเอียดงานและเงื่อนไข')],
    text: 'เอาแบบนั้นแหละ', tier: 'light', tools: 'chat', offer: 'unrelated' },
  { name: '12 quick topic changes', history: [...FOOD, user('ว่าแต่ งานค้างรับมีกี่งาน'), bot('ตอนนี้ค้างรับ 2 งาน')], text: 'แล้วหนังเรื่องไหนน่าดู', tier: 'light', tools: 'chat', offer: 'unrelated' },
  { name: '13 how a feature works', text: 'ออกใบเสนอราคายังไง', tier: 'light', tools: 'chat', offer: 'allowed' },
  { name: '14 making a document', text: 'ทำใบเสนอราคาให้ลูกค้าปล่อยจอย งานตัดต่อ 3000', tier: 'smart', tools: 'action', offer: 'allowed' },
  { name: '15 serious money work', text: 'เดือนนี้รายรับเท่าไหร่', tier: 'light', tools: 'chat', offer: 'allowed' },
];

test('the 15 conversations: the model, the tools and whether an offer fits, by rules alone', () => {
  for (const scenario of SCENARIOS) {
    const decision = decideRoute({ text: scenario.text, history: scenario.history });
    assert.deepEqual([decision.tier, decision.tools], [scenario.tier, scenario.tools], scenario.name);
    assert.equal(offerState(scenario.text, scenario.history), scenario.offer, scenario.name);
  }
});

test('everyday conversations go to the light model once each, with the whole thread and the offer rule of the turn', async () => {
  for (const scenario of SCENARIOS.filter(item => item.tier === 'light' && item.tools === 'chat')) {
    const fake = fakeGemini('ได้เลย');
    const reply = await runAssistant({ user: account(), plan: 'pro', text: scenario.text, history: scenario.history },
      { config: config(), fetchImpl: fake.fetchImpl, ...memoryStores() });
    assert.equal(fake.requests.length, 1, `${scenario.name}: one model call, no extra one to pick an offer`);
    assert.ok(reply.calls.every(call => call.provider === 'gemini'), scenario.name);
    const { system, contents } = fake.requests[0];
    assert.match(system, /EVERYDAY TALK/, scenario.name);
    assert.ok(system.includes(offerLine(scenario.offer)), `${scenario.name}: ${offerLine(scenario.offer)}`);
    // The earlier turns reach the model, so a follow-up ("ขอวิธีทำหน่อย") means the dish just discussed.
    const said = contents.map(turn => turn.parts.map(part => part.text ?? '').join('')).join('\n');
    for (const turn of scenario.history ?? []) assert.ok(said.includes(turn.text), `${scenario.name}: ${turn.text}`);
    assert.ok(said.includes(scenario.text), scenario.name);
  }
});

test('offers: unrelated topics, a recent offer, a refusal, a request to stop and personal troubles each mean none', () => {
  // Work or money in the message allows one; food, rest, films, hobbies and a wedding do not.
  for (const text of ['ลูกค้าเข้ามาอีกสองเจ้าเลย', 'วันนี้ซื้อของทำงานไป 2,500', 'เดือนนี้รับงานเยอะมาก', 'เหนื่อยจะตาย วันนี้งานเยอะ', 'ทวงเงินลูกค้าจนเหนื่อย']) {
    assert.equal(offerState(text), 'allowed', text);
  }
  for (const text of ['วันนี้กินไรดี', 'วันนี้อยากนอนเฉย ๆ', 'หนังเรื่องไหนน่าดู', 'ช่วงนี้ชอบงานอดิเรกใหม่', 'เมื่อวานไปงานแต่งเพื่อนมา', 'เฮ้ย ขอวิธีมีชู้หน่อยดิ']) {
    assert.equal(offerState(text), 'unrelated', text);
  }
  const offered = [user('งานเข้า'), bot('เยี่ยมเลย ถ้าอยากให้ช่วยลงงานไว้ก่อนก็บอก เดี๋ยวจัดให้')];
  assert.equal(offerState('ไม่ต้อง ๆ', offered), 'declined');
  assert.equal(offerState('ลูกค้าอีกเจ้าก็จะจ่ายพรุ่งนี้', offered), 'recent', 'one offer is enough for a while');
  assert.equal(offerState('งานเข้าอีกแล้ว', [...offered, user('อืม'), bot('โอเค'), user('ว่าแต่'), bot('ว่ามา'), user('ช่างเถอะ'), bot('ได้')]), 'allowed', 'three answers later it may come back');
  assert.equal(offerState('งานเข้าอีกแล้ว', [user('หยุดชวนได้แล้ว'), bot('ได้เลย')]), 'off');
  assert.equal(offerState('stop offering things please'), 'off');
  for (const text of ['แม่ป่วยเข้าโรงพยาบาล', 'เครียดเรื่องงานมาก', 'รู้สึกเหงา ๆ', 'ไม่อยากอยู่แล้ว']) assert.equal(offerState(text), 'sensitive', text);
  assert.match(offerLine('allowed'), /At most one short line/);
  assert.match(offerLine('sensitive'), /listen and support/);
});

test('the prompt: everyday talk allowed, the old refusal gone, personality and adapting, money work stays exact', () => {
  assert.equal(PROMPT_VERSION, 'secretary-v21');
  for (const route of ['chat', 'action'] as const) {
    const prompt = buildSystemPrompt({ route, plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-', offer: offerLine('unrelated') });
    assert.doesNotMatch(prompt, /You are not a general chatbot/, 'the line that made เลขา refuse food talk is gone');
    assert.match(prompt, /Never refuse or steer away from a topic only because it is not about\s+money/);
    assert.match(prompt, /a recipe gets the recipe/);
    assert.match(prompt, /a follow-up \("ขอวิธีทำหน่อย"/);
    assert.match(prompt, /friendly, playful, quick-witted/);
    assert.match(prompt, /One message never overrides a long-term\s+preference/);
    assert.match(prompt, /Never mirror profanity, insulting pronouns \(กู\/มึง\)/, 'courtesy kept');
    assert.match(prompt, /This limits what you say about the app, not everyday conversation/);
    assert.match(prompt, /Most messages get no offer/);
    assert.match(prompt, /An offer states no amounts, job status or records/);
    assert.match(prompt, /Humour never changes a figure, a date, a status or a confirmation step/);
    assert.match(prompt, /สายด่วนสุขภาพจิต 1323/);
    assert.match(prompt, /OFFER THIS TURN: none\. This message is not about the user's work or money/);
    // Still no provider names anywhere (confidentiality).
    assert.doesNotMatch(prompt, /gemini|claude|anthropic|openai|sonnet|gpt/i);
  }
  assert.match(buildSystemPrompt({ route: 'action', plan: 'pro', nowLocal: 'x', knowledge: '-', accountContext: '-' }), /News without the details a card needs/);
});

test('every answer: no emoji unless the user used them or asked for none, and no made-up tool links', async () => {
  assert.equal(styleReply('ได้เลยครับ 😆 ไปที่ [เปิดหน้าเอกสาร](default_api:navigate_to_feature?feature=quotation) ได้เลย 👍🏽', { userText: 'ขอหน่อย' }),
    'ได้เลยครับ ไปที่ เปิดหน้าเอกสาร ได้เลย');
  assert.equal(styleReply('สู้ ๆ นะ 😊', { userText: 'เหนื่อยจัง 😭' }), 'สู้ ๆ นะ 😊', 'the user used one');
  assert.equal(styleReply('สู้ ๆ นะ 😊 ดู [นโยบาย](/privacy)', { userText: 'เหนื่อยจัง 😭', preferences: [undefined, 'ไม่ใช้อีโมจิ'] }), 'สู้ ๆ นะ ดู [นโยบาย](/privacy)', 'a saved "no emoji" wins');
  assert.equal(styleReply('ราคา ฿3,000 · 1 ม.ค. 2570', { userText: 'x' }), 'ราคา ฿3,000 · 1 ม.ค. 2570', 'baht and dots stay');
  // Through the gateway: the model's emoji never reaches a user who used none.
  const fake = fakeGemini('ไปกินชาบูกัน 😆🍲');
  const reply = await runAssistant({ user: account(), plan: 'pro', text: 'วันนี้กินไรดี' }, { config: config(), fetchImpl: fake.fetchImpl, ...memoryStores() });
  assert.equal(reply.text, 'ไปกินชาบูกัน');
});

test('a drawing app or a film is everyday talk; analysis of money, clients or this app still gets the careful model', () => {
  for (const text of ['มีแอปวาดรูปฟรีแนะนำไหม', 'แนะนำหนังหน่อย', 'ทำไมฟ้าถึงสีฟ้า', 'วางแผนเที่ยวปีใหม่หน่อย', 'แล้วควรเริ่มวาดอะไรก่อนดี']) {
    assert.equal(decideRoute({ text }).tier, 'light', text);
  }
  for (const text of ['วิเคราะห์รายรับ 6 เดือนล่าสุด', 'ลูกค้าไหนสำคัญที่สุด', 'ทำไมลูกค้าจ่ายช้า', 'แนะนำวิธีลดรายจ่ายหน่อย', 'เทียบรายได้เดือนนี้กับเดือนที่แล้ว', 'แนะนำฟีเจอร์ในแอปหน่อย']) {
    assert.equal(decideRoute({ text }).tier, 'smart', text);
  }
  // A short follow-up keeps the money question it follows.
  assert.equal(decideRoute({ text: 'แล้วทำไมล่ะ', history: [user('เทียบรายได้เดือนนี้กับเดือนที่แล้ว'), bot('เดือนนี้น้อยกว่า 10%')] }).tier, 'smart');
});

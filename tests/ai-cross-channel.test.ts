import test from 'node:test';
import assert from 'node:assert/strict';
import { aiConfig } from '../backend/src/ai/config';
import { CONTINUE_WINDOW_MS, continuationTurns, GO_AHEAD, goAheadFits, leftUnfinished, lineHistoryText, type ChannelTurn } from '../backend/src/ai/crossChannel';
import { lineAssistantAnswer } from '../backend/src/ai/lineBridge';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';
import type { RoutingRecord } from '../backend/src/ai/routingPolicy';
import { confirmProposal, handleMessage, type AssistantDb, type StoredProposal } from '../backend/src/ai/service';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Package E (owner, 2026-10-25: "ทำเลย"): a task started in the app continues in LINE, and the other way round, without
// telling เลขา again. Fake Gemini and Claude servers and an in-memory database: no network, no keys, no cost.

const A = '55555555-5555-4555-8555-555555555555';
const B = '66666666-6666-4666-8666-666666666666';
const MIN = 60_000;
const now = Date.parse('2026-10-25T10:00:00Z');

const quote: ChannelTurn[] = [
  { role: 'user', text: 'ทำใบเสนอราคาออกแบบโลโก้ให้ร้านกาแฟหน่อย' },
  { role: 'assistant', text: 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ', cards: [{ kind: 'questions', questions: [{ text: 'ราคาเท่าไหร่' }, { text: 'ส่งงานวันไหน' }] }] },
];
const lineAsked: ChannelTurn[] = [
  { role: 'user', text: 'เพิ่มงานตัดคลิปให้ลูกค้าตัวอย่าง' },
  { role: 'assistant', text: 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ\n- ราคาเท่าไหร่' },
];

// ---------- which turns are carried ----------
test('cross-channel: the other channel\'s unfinished exchange joins this message, oldest first, marked where it was said', () => {
  const toLine = continuationTurns({ channel: 'line', appTurns: quote, appAt: now - 12 * MIN, lineTurns: [], lineAt: null, now });
  assert.equal(toLine?.from, 'app');
  assert.deepEqual(toLine?.turns, [
    { role: 'user', text: '(ต่อจากที่คุยในแอป เมื่อ 12 นาทีก่อน) ทำใบเสนอราคาออกแบบโลโก้ให้ร้านกาแฟหน่อย' },
    // The questions card reaches the history as "- question" lines, as the app writes them, so routing sees the work.
    { role: 'assistant', text: '(ในแอป) รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ\n- ราคาเท่าไหร่\n- ส่งงานวันไหน' },
  ]);
  const toApp = continuationTurns({ channel: 'app', appTurns: [], appAt: now - 90 * MIN, lineTurns: lineAsked, lineAt: now - 5 * MIN, now });
  assert.equal(toApp?.from, 'line');
  assert.deepEqual(toApp?.turns.map(turn => turn.text), ['(ต่อจากที่คุยใน LINE เมื่อ 5 นาทีก่อน) เพิ่มงานตัดคลิปให้ลูกค้าตัวอย่าง', '(ใน LINE) รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ\n- ราคาเท่าไหร่']);
});

test('cross-channel: nothing is carried when this channel spoke last, after two hours, or when the work was finished', () => {
  const carry = (over: Partial<Parameters<typeof continuationTurns>[0]>) => continuationTurns({ channel: 'line', appTurns: quote, appAt: now - 12 * MIN, lineTurns: [], lineAt: null, now, ...over });
  assert.equal(carry({ lineAt: now - 1 * MIN }), undefined, 'LINE is newer: its own history is the conversation');
  assert.equal(carry({ lineAt: now - 12 * MIN }), undefined, 'the same moment counts as this channel');
  assert.equal(carry({ appAt: now - CONTINUE_WINDOW_MS - 1 }), undefined, 'older than two hours');
  assert.ok(carry({ appAt: now - CONTINUE_WINDOW_MS + MIN }), 'inside two hours');
  assert.equal(carry({ appTurns: [] }), undefined);
  assert.equal(carry({ appTurns: [quote[0]] }), undefined, 'the user spoke last: nothing was left waiting for them');
  // Finished work, with the polite closers that ask nothing about it.
  for (const done of ['เพิ่มงานเรียบร้อยแล้วครับ มีอะไรให้ช่วยเพิ่มเติมไหมครับ', 'บันทึกแล้วครับ หากต้องการแก้ไขแจ้งได้เลยครับ', 'เดือนนี้รับเงินแล้ว 12,000 บาทครับ']) {
    assert.equal(carry({ appTurns: [quote[0], { role: 'assistant', text: done }] }), undefined, done);
  }
  // A question in words, without a card.
  assert.ok(carry({ appTurns: [quote[0], { role: 'assistant', text: 'ต้องการหัก ณ ที่จ่าย 3% ด้วยไหมครับ' }] }));
});

test('cross-channel: a card counts only while it still waits; LINE keeps its mark of one', () => {
  const card: ChannelTurn = { role: 'assistant', text: 'เตรียมรายการไว้แล้วครับ หากต้องการแก้ไขแจ้งได้เลย', cards: [{ kind: 'confirm', id: 'p_1', title: 'เพิ่มงาน ตัดคลิป' }] };
  const turns = [{ role: 'user' as const, text: 'เพิ่มงานตัดคลิป 2,000' }, card];
  assert.equal(leftUnfinished(turns, new Set()), false, 'confirmed or expired: done, even though its text says "แจ้ง"');
  assert.equal(leftUnfinished(turns, new Set(['p_other'])), false, 'another card waiting does not make this one wait');
  assert.equal(leftUnfinished(turns, new Set(['p_1'])), true);
  assert.equal(leftUnfinished(turns), true, 'without the list, a card counts as waiting');
  const carried = continuationTurns({ channel: 'line', appTurns: turns, appAt: now - 3 * MIN, lineTurns: [], lineAt: null, now, waitingIds: new Set(['p_1']) });
  assert.match(carried!.turns[1].text, /\n\[การ์ดรอยืนยัน: เพิ่มงาน ตัดคลิป\]$/);
  // LINE's short history is text only: the mark has no id, so any card still waiting for the account counts.
  const line = [{ role: 'user' as const, text: 'เพิ่มงานตัดคลิป 2,000' }, { role: 'assistant' as const, text: lineHistoryText(card.text, card.cards) }];
  assert.equal(line[1].text, 'เตรียมรายการไว้แล้วครับ หากต้องการแก้ไขแจ้งได้เลย\n[การ์ดรอยืนยัน: เพิ่มงาน ตัดคลิป]');
  assert.equal(leftUnfinished(line, new Set()), false);
  assert.equal(leftUnfinished(line, new Set(['p_1'])), true);
});

test('cross-channel: a file note stays first; at most the last 4 turns of 600 characters', () => {
  const turns: ChannelTurn[] = [
    { role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'สวัสดีครับ' },
    { role: 'user', text: 'ทำใบเสนอราคาจากรูปนี้', attachment: { name: 'quote.jpg' } },
    { role: 'assistant', text: 'ขอข้อมูลเพิ่มครับ', cards: [{ kind: 'memo', text: 'ร้านกาแฟ ค่าออกแบบ 12,000' }, { kind: 'questions', questions: [{ text: 'ส่งงานวันไหน' }] }] },
    { role: 'user', text: 'ก'.repeat(900) },
    { role: 'assistant', text: 'รบกวนระบุวันที่ส่งงานด้วยครับ' },
  ];
  const carried = continuationTurns({ channel: 'line', appTurns: turns, appAt: now - 20 * MIN, lineTurns: [], lineAt: null, now })!;
  assert.equal(carried.turns.length, 4);
  assert.equal(carried.turns[0].text, '(ต่อจากที่คุยในแอป เมื่อ 20 นาทีก่อน) ทำใบเสนอราคาจากรูปนี้ [แนบไฟล์: quote.jpg]');
  assert.equal(carried.turns[1].text, '[อ่านจากไฟล์ที่แนบ: ร้านกาแฟ ค่าออกแบบ 12,000]\n(ในแอป) ขอข้อมูลเพิ่มครับ\n- ส่งงานวันไหน');
  assert.ok(carried.turns.every(turn => turn.text.length <= 600 + 40));
});

test('cross-channel: a typed go-ahead shows the waiting cards only when เลขา\'s last word was not a question', () => {
  for (const yes of ['ยืนยัน', 'ยืนยันครับ', 'ยืนยันรายการ', 'ตกลงค่ะ', 'โอเค', 'OK', 'ได้เลยครับ', 'ใช่ครับ', 'เอาเลย!']) assert.ok(GO_AHEAD.test(yes), yes);
  for (const other of ['ยืนยันแต่แก้ยอดเป็น 5000', 'ไม่ยืนยัน', 'ตกลงเพิ่มงานใหม่ 3000', 'ใช่ ลูกค้าคนเดิม', 'ยกเลิก']) assert.equal(GO_AHEAD.test(other), false, other);
  assert.equal(goAheadFits(undefined), true, 'a new chat: the cards waiting for the account');
  assert.equal(goAheadFits({ role: 'assistant', text: 'เตรียมรายการไว้แล้วครับ กรุณาตรวจก่อนกดยืนยัน' }), true);
  assert.equal(goAheadFits({ role: 'assistant', text: 'เตรียมไว้แล้วครับ แก้ไขอะไรไหม\n[การ์ดรอยืนยัน: เพิ่มงาน]' }), true, 'a card is on screen');
  assert.equal(goAheadFits({ role: 'assistant', text: 'ต้องการหัก ณ ที่จ่าย 3% ไหมครับ' }), false, '"ใช่" answers this question');
  assert.equal(goAheadFits({ role: 'assistant', text: 'ขอข้อมูลเพิ่มครับ\n- ราคาเท่าไหร่' }), false);
});

// ---------- the service, end to end with fake models ----------
type Reply = { status?: number; json: unknown };
const gText = (text: string): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } } });
const gCall = (name: string, args: Record<string, unknown>): Reply => ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args, id: `c-${name}` }, thoughtSignature: 's' }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } } });
const cText = (text: string): Reply => ({ json: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
  usage: { input_tokens: 60, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });

function providers(gemini: Reply[], anthropic: Reply[] = []) {
  const asked: string[] = [];
  const bodies: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const isClaude = String(input).includes('anthropic');
    asked.push(isClaude ? 'claude' : 'gemini');
    const body = JSON.parse(String(init?.body || '{}'));
    bodies.push(JSON.stringify(isClaude ? body.messages : body.contents));
    const next = (isClaude ? anthropic : gemini).shift();
    if (!next) throw new Error(`no more fake ${isClaude ? 'Claude' : 'Gemini'} replies`);
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
  }) as unknown as typeof fetch;
  return { asked, bodies, fetchImpl };
}
const noModel = (() => { throw new Error('must not call a model'); }) as unknown as typeof fetch;
const config = () => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', AI_SMART_MODEL: 'claude-sonnet-5-5' });
const day = (offset: number) => new Date(now + 7 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const account = (userId: string, notif?: Record<string, unknown>): UserRow => ({
  user_id: userId, statuses: [], goals: [], expenses: [], settings: {}, ...(notif ? { notif_settings: notif } : {}),
  jobs: [{ id: 'job-logo', name: 'ออกแบบโลโก้', client: 'ร้านตัวอย่าง', value: 12000, received: 0, pending: 12000, status: 'pending', creditTerm: 30, postDate: day(-40), payDate: day(-10), isPosted: true }] as any,
} as UserRow);

/** One database for both accounts: proposals and usage keyed by account, the app's chat turns and LINE's history per account. */
function fakeDb() {
  const proposals = new Map<string, StoredProposal & { status: string }>();
  const routing: RoutingRecord[] = [];
  const usage: { userId: string; requestId: string; tokens: number; status: string }[] = [];
  const reads: string[] = [];
  const app = new Map<string, { turns: ChannelTurn[]; lastAt: number | null }>();
  const line = new Map<string, Record<string, unknown>>();
  const db: AssistantDb = {
    async loadAccount(userId) { return { user: account(userId, line.get(userId)), versions: {} }; },
    async reserve(input) { usage.push({ userId: input.userId, requestId: input.requestId, tokens: input.tokens, status: 'reserved' }); return { ok: true, usedTokens: input.tokens, usedRequests: 1 }; },
    async settle(input) { const row = usage.find(item => item.requestId === input.requestId); if (row) Object.assign(row, { tokens: input.release ? 0 : input.tokens, status: input.release ? 'released' : 'settled' }); },
    async usage() { return { tokens: 0, requests: 0 }; },
    async saveProposal(proposal) { proposals.set(proposal.id, { ...proposal, status: 'pending' }); },
    async claimProposal(userId, id) { const row = proposals.get(id); if (!row || row.userId !== userId || row.status !== 'pending') return null; row.status = 'applying'; return row; },
    async finishProposal(_, id, status) { const row = proposals.get(id); if (row) row.status = status; },
    async cancelProposal() { return false; },
    async applyChanges() { return true; },
    async memories() { return []; },
    async remember() {},
    async saveRouting(_, __, record) { routing.push(record); },
    async recentAppTurns(userId) { reads.push(`app:${userId}`); return app.get(userId) ?? { turns: [], lastAt: null }; },
    async pendingProposals(userId, sinceIso) {
      reads.push(`pending:${userId}`);
      return [...proposals.values()].filter(row => row.userId === userId && row.status === 'pending' && row.createdAt >= Date.parse(sinceIso)).reverse();
    },
  };
  return { db, proposals, routing, usage, reads, app, line };
}
const at = (ms: number) => new Date(ms);

test('cross-channel service: LINE continues a quotation started in the app; Sonnet answers with the app\'s turns', async () => {
  const state = fakeDb();
  state.app.set(A, { turns: quote, lastAt: now - 10 * MIN });
  const model = providers([], [cText('รับทราบครับ ราคา 12,000 บาท ส่งงาน 30 ต.ค.')]);
  const reply = await handleMessage(state.db, { config: config(), fetchImpl: model.fetchImpl, now: at(now) }, A, 'pro', { text: 'ราคา 12,000 ส่งงาน 30 ต.ค.', history: [], channel: 'line' });
  assert.equal(reply.text, 'รับทราบครับ ราคา 12,000 บาท ส่งงาน 30 ต.ค.');
  // The reply to a quotation's questions stays with Sonnet, as it would in the app.
  assert.deepEqual(model.asked, ['claude']);
  assert.match(model.bodies[0], /\(ต่อจากที่คุยในแอป เมื่อ 10 นาทีก่อน\) ทำใบเสนอราคาออกแบบโลโก้ให้ร้านกาแฟหน่อย/);
  assert.match(model.bodies[0], /- ราคาเท่าไหร่/);
  assert.deepEqual([state.routing[0].continued_from, state.routing[0].channel, state.routing[0].tier], ['app', 'line', 'smart']);
  assert.deepEqual(state.reads, [`app:${A}`], 'only the signed-in account, and no card list when no card was left');
  // The log keeps where it came from, never the words.
  assert.equal(JSON.stringify(state.routing[0]).includes('ร้านกาแฟ'), false);
});

test('cross-channel service: the app continues what LINE left, and leaves it when the app spoke last', async () => {
  const state = fakeDb();
  state.line.set(A, { chatHistory: lineAsked, chatHistoryUpdatedAt: at(now - 5 * MIN).toISOString() });
  state.app.set(A, { turns: [{ role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'สวัสดีครับ' }], lastAt: now - 60 * MIN });
  const model = providers([gText('รับทราบครับ'), gText('สวัสดีครับ')]);
  await handleMessage(state.db, { config: config(), fetchImpl: model.fetchImpl, now: at(now) }, A, 'pro', { text: '2,000 บาท', history: [] });
  assert.match(model.bodies[0], /\(ต่อจากที่คุยใน LINE เมื่อ 5 นาทีก่อน\) เพิ่มงานตัดคลิปให้ลูกค้าตัวอย่าง/);
  assert.equal(state.routing[0].continued_from, 'line');
  // The app's own chat is newer than LINE: nothing is added.
  state.app.set(A, { turns: [{ role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'สวัสดีครับ' }], lastAt: now - 1 * MIN });
  await handleMessage(state.db, { config: config(), fetchImpl: model.fetchImpl, now: at(now) }, A, 'pro', { text: 'วันนี้เป็นไงบ้าง', history: [] });
  assert.equal(model.bodies[1].includes('ต่อจากที่คุย'), false);
  assert.equal(state.routing[1].continued_from, undefined);
});

test('cross-channel service: a card prepared in the app is confirmed from LINE by typing ยืนยัน, with no model call and no tokens', async () => {
  const state = fakeDb();
  const prepare = providers([gCall('propose_add_job', { name: 'ตัดคลิป', value: 2000, client: 'ลูกค้าตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }), gText('เตรียมงานไว้แล้วครับ กดยืนยันบนการ์ด')]);
  const inApp = await handleMessage(state.db, { config: config(), fetchImpl: prepare.fetchImpl, now: at(now) }, A, 'pro', { text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง', history: [] });
  const card = inApp.cards[0] as { kind: string; id: string; title: string; changes: unknown; edit?: { field: string }[] };
  assert.equal(card.kind, 'confirm');
  state.app.set(A, { turns: [{ role: 'user', text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง' }, { role: 'assistant', text: inApp.text, cards: inApp.cards as ChannelTurn['cards'] }], lastAt: now - 2 * MIN });

  const inLine = await handleMessage(state.db, { config: config(), fetchImpl: noModel, now: at(now) }, A, 'pro', { text: 'ยืนยันครับ', history: [], channel: 'line' });
  assert.equal(inLine.text, 'รายการนี้ยังรอยืนยันอยู่ครับ ตรวจรายละเอียดแล้วกดยืนยันบนการ์ดได้เลย');
  const again = inLine.cards[0] as typeof card;
  assert.deepEqual([again.kind, again.id, again.title, again.changes], [card.kind, card.id, card.title, card.changes], 'the same card, nothing prepared again');
  assert.deepEqual(again.edit?.map(field => field.field), card.edit?.map(field => field.field), 'still editable');
  assert.equal(inLine.tokens, 0);
  assert.deepEqual(state.usage.at(-1)!.tokens, 0);
  const log = state.routing.at(-1)!;
  assert.deepEqual([log.tier, log.reason, log.outcome, log.proposal_ids, log.channel], ['direct', 'waiting_cards', 'direct', [card.id], 'line']);
  // LINE shows its ยืนยัน button for the same card (the postback LINE already handles).
  assert.match(JSON.stringify(lineAssistantReply(inLine.text, inLine.cards)), new RegExp(`ai:confirm:${card.id}`));
  // Nothing is saved until the button: the card is still waiting, then the button confirms it once.
  assert.equal(state.proposals.get(card.id)!.status, 'pending');
  await confirmProposal(state.db, A, card.id);
  assert.equal(state.proposals.get(card.id)!.status, 'applied');

  // Once confirmed, "ยืนยัน" goes to เลขา as an ordinary message.
  const after = providers([gText('ไม่มีรายการที่รอยืนยันครับ')]);
  await handleMessage(state.db, { config: config(), fetchImpl: after.fetchImpl, now: at(now) }, A, 'pro', { text: 'ยืนยัน', history: [], channel: 'line' });
  assert.deepEqual(after.asked, ['gemini']);
});

test('cross-channel service: "ใช่" that answers a question goes to เลขา; another account never sees the card', async () => {
  const state = fakeDb();
  const prepare = providers([gCall('propose_add_job', { name: 'ตัดคลิป', value: 2000, client: 'ลูกค้าตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }), gText('เตรียมงานไว้แล้วครับ')]);
  await handleMessage(state.db, { config: config(), fetchImpl: prepare.fetchImpl, now: at(now) }, A, 'pro', { text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง', history: [] });

  const answer = providers([gText('รับทราบครับ หัก 3%')]);
  await handleMessage(state.db, { config: config(), fetchImpl: answer.fetchImpl, now: at(now) }, A, 'pro', { text: 'ใช่ครับ', history: [{ role: 'assistant', text: 'ต้องการหัก ณ ที่จ่าย 3% ไหมครับ' }] });
  assert.deepEqual(answer.asked, ['gemini'], 'an answer to the question, not the card');

  const other = providers([gText('ไม่มีรายการที่รอยืนยันครับ')]);
  const reply = await handleMessage(state.db, { config: config(), fetchImpl: other.fetchImpl, now: at(now) }, B, 'pro', { text: 'ยืนยัน', history: [], channel: 'line' });
  assert.deepEqual(other.asked, ['gemini']);
  assert.deepEqual(reply.cards, []);
  assert.ok(state.reads.filter(read => read.endsWith(B)).length > 0 && state.reads.filter(read => read.endsWith(B)).every(read => !read.endsWith(A)));
});

test('cross-channel service: a card the app shows is carried into LINE only while it waits', async () => {
  const state = fakeDb();
  const prepare = providers([gCall('propose_add_job', { name: 'ตัดคลิป', value: 2000, client: 'ลูกค้าตัวอย่าง', delivered: false, payment_status: 'unpaid', credit_term_days: 15, wht_rate: 0 }), gText('เตรียมงานไว้แล้วครับ หากต้องการแก้ไขแจ้งได้เลย')]);
  const inApp = await handleMessage(state.db, { config: config(), fetchImpl: prepare.fetchImpl, now: at(now) }, A, 'pro', { text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง', history: [] });
  state.app.set(A, { turns: [{ role: 'user', text: 'เพิ่มงานตัดคลิป 2,000 ลูกค้าตัวอย่าง' }, { role: 'assistant', text: inApp.text, cards: inApp.cards as ChannelTurn['cards'] }], lastAt: now - 2 * MIN });
  const waiting = providers([gText('ได้ครับ')], [cText('ได้ครับ')]);
  await handleMessage(state.db, { config: config(), fetchImpl: waiting.fetchImpl, now: at(now) }, A, 'pro', { text: 'เปลี่ยนเครดิตเป็น 30 วัน', history: [], channel: 'line' });
  assert.match(waiting.bodies[0], /การ์ดรอยืนยัน: /);
  assert.equal(state.routing.at(-1)!.continued_from, 'app');

  await confirmProposal(state.db, A, (inApp.cards[0] as { id: string }).id);
  const done = providers([gText('ได้ครับ')]);
  await handleMessage(state.db, { config: config(), fetchImpl: done.fetchImpl, now: at(now) }, A, 'pro', { text: 'สรุปเดือนนี้', history: [], channel: 'line' });
  assert.equal(done.bodies[0].includes('ต่อจากที่คุย'), false, 'confirmed: the app\'s exchange is finished');
});

test('cross-channel LINE: the short history keeps เลขา\'s questions and cards, so the app can continue from them', async () => {
  const cards = [{ kind: 'questions', questions: [{ id: 'q1', text: 'ราคาเท่าไหร่', options: ['2,000 บาท', '3,000 บาท'], allowText: true }] }];
  const reply = await lineAssistantAnswer({ user_id: A } as UserRow, 'เพิ่มงานตัดคลิป', [], {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'g' }, db: fakeDb().db,
    plan: async () => ({ plan: 'pro' as const, email: null }), rateLimit: async () => undefined,
    run: (async () => ({ text: 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ', cards, route: 'chat', tokens: 3, tokensLeft: 900, trialLeft: null })) as unknown as typeof handleMessage,
  });
  assert.equal(reply!.text, 'รบกวนตอบคำถามด้านล่างเพื่อให้ผมทำต่อได้ครับ\n- ราคาเท่าไหร่');
  assert.equal(leftUnfinished([{ role: 'user', text: 'เพิ่มงานตัดคลิป' }, { role: 'assistant', text: reply!.text }]), true);
});

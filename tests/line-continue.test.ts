import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { AssistantCard } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';
import type { StoredContinue } from '../backend/src/ai/lineContinue';

// ทำต่อในแอป (owner's plan, item 4, 2026-11-14): an answer LINE cannot give complete (cards it has no room for, a card too
// long to confirm in LINE, analysis such as tax planning) keeps the conversation and adds the button; the link opens one chat
// in the app with the same turns and cards, the same chat on every open, and nothing at all once it is old or replaced.

const saved = { APP_URL: process.env.APP_URL, LIFF_ID: process.env.LIFF_ID };
process.env.APP_URL = 'https://krarok.example';
process.env.LIFF_ID = '2012039027-test';
after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

const USER = '11111111-1111-4111-8111-111111111111';
const confirm = (n: number, rows = 3): AssistantCard => ({ kind: 'confirm', id: `p_${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`, title: 'เพิ่มรายจ่าย',
  changes: Array.from({ length: rows }, (_, at) => ({ label: at === 0 ? 'รายการ' : `ช่อง ${at}`, value: at === 0 ? `ค่ากาแฟ ${n}` : `${n * 10} บาท` })) });
const flat = (value: unknown) => JSON.stringify(value);
const uriOf = (message: unknown) => (flat(message).match(/"uri":"([^"]+)"/) ?? [])[1];

test('why an answer goes on in the app: cards that do not fit or are too long, or analysis; never while เลขา asks', async () => {
  const { continueWhy } = await import('../backend/src/ai/lineContinue');
  const base = { history: [], asking: false, left: 0, oversized: false };
  assert.equal(continueWhy({ ...base, text: 'ค่ากาแฟ 60', left: 3 }), 'cards');
  assert.equal(continueWhy({ ...base, text: 'ค่ากาแฟ 60', oversized: true }), 'cards');
  assert.equal(continueWhy({ ...base, text: 'วางแผนภาษีปีนี้ให้หน่อย' }), 'detail');
  assert.equal(continueWhy({ ...base, text: 'เปรียบเทียบรายได้กับปีที่แล้ว' }), 'detail');
  assert.equal(continueWhy({ ...base, text: 'เดือนนี้ได้เงินเท่าไหร่' }), null);
  assert.equal(continueWhy({ ...base, text: 'สวัสดีครับ' }), null);
  assert.equal(continueWhy({ ...base, text: 'วางแผนภาษีปีนี้ให้หน่อย', left: 2, asking: true }), null, 'a question in LINE is answered in LINE');
});

test('the chat opens with LINE\'s earlier turns (no card marks), this message with its file, and the whole answer with its cards', async () => {
  const { continueTurns } = await import('../backend/src/ai/lineContinue');
  const cards = [confirm(1), confirm(2)];
  const turns = continueTurns(
    [{ role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'สวัสดีครับ มีอะไรให้ช่วย\n[การ์ดรอยืนยัน: เพิ่มงาน]' }],
    'บันทึกตามบิลนี้', [{ name: 'บิล.pdf', mimeType: 'application/pdf' }], { text: 'เตรียมให้ 2 รายการครับ', cards });
  assert.deepEqual(turns, [
    { role: 'user', text: 'สวัสดี' },
    { role: 'assistant', text: 'สวัสดีครับ มีอะไรให้ช่วย' },
    { role: 'user', text: 'บันทึกตามบิลนี้', attachment: { name: 'บิล.pdf', kind: 'pdf' } },
    { role: 'assistant', text: 'เตรียมให้ 2 รายการครับ', cards },
  ]);
  // At most four earlier exchanges come along.
  const long = continueTurns(Array.from({ length: 20 }, (_, at) => ({ role: at % 2 ? 'assistant' as const : 'user' as const, text: `ข้อความ ${at}` })), 'ต่อ', [], { text: 'ได้ครับ', cards: [] });
  assert.equal(long.length, 10);
  assert.equal(long[0].text, 'ข้อความ 12');
});

function memoryStore(now: number) {
  const state: { stored: unknown; appended: { id: string; turns: unknown[]; title?: string }[]; time: number } = { stored: null, appended: [], time: now };
  const deps = {
    load: async () => state.stored,
    save: async (_user: string, value: StoredContinue) => { state.stored = value; },
    append: async (_user: string, id: string, turns: unknown[], options: { title?: string } = {}) => { state.appended.push({ id, turns, title: options.title }); },
    open: async (_user: string, id: string) => (state.appended.some(entry => entry.id === id)
      ? [{ id: 'm-1', role: 'user' as const, text: 'บันทึกตามบิลนี้', at: new Date(now).toISOString() }] : null),
    now: () => state.time,
  };
  return { state, deps };
}

test('the link opens one chat in the app (the same chat when opened again), and nothing when it is old, replaced or made up', async () => {
  const { keepForApp, openInApp, CONTINUE_ID } = await import('../backend/src/ai/lineContinue');
  const start = Date.parse('2026-11-14T10:00:00Z');
  const { state, deps } = memoryStore(start);
  const turns = [{ role: 'user' as const, text: 'วางแผนภาษีปีนี้ให้หน่อย' }, { role: 'assistant' as const, text: 'ปีนี้ประมาณ 12,000 บาทครับ' }];
  const id = await keepForApp(USER, 'detail', turns, deps);
  assert.match(id, CONTINUE_ID);

  const first = await openInApp(USER, id, deps);
  assert.ok(first);
  assert.match(first.conversationId, /^c_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.title, 'ต่อจาก LINE · วางแผนภาษีปีนี้ให้หน่อย');
  assert.equal(first.why, 'detail');
  assert.deepEqual(state.appended, [{ id: first.conversationId, turns, title: first.title }]);

  const again = await openInApp(USER, id, deps);
  assert.equal(again?.conversationId, first.conversationId, 'a second tap opens the same chat');
  assert.equal(state.appended.length, 1, 'and makes no other');

  assert.equal(await openInApp(USER, 'A'.repeat(22), deps), null, 'another id opens nothing');
  assert.equal(await openInApp(USER, 'not an id', deps), null);
  state.time = start + 2 * 3600_000 + 1;
  assert.equal(await openInApp(USER, id, deps), null, 'after two hours the link is gone');

  // A newer answer replaces the kept conversation: the older link opens nothing.
  state.time = start;
  const newer = await keepForApp(USER, 'cards', turns, deps);
  assert.notEqual(newer, id);
  assert.equal(await openInApp(USER, id, deps), null);
});

test('LINE: more cards than fit end with ทำต่อในแอป instead of "มีอีก N รายการ", and the link opens the assistant through LINE', async () => {
  const { shapeLineReply } = await import('../backend/src/ai/lineFormat');
  const cards = Array.from({ length: 45 }, (_, at) => confirm(at + 1));
  const plain = shapeLineReply('เตรียมให้ 45 รายการครับ', cards);
  assert.ok(plain.left > 0);
  assert.match(flat(plain.messages.at(-1)), /มีอีก \d+ รายการ เปิดดูในเลขาในแอปได้ครับ/);

  const link = { label: 'ทำต่อในแอป', uri: 'https://liff.line.me/2012039027-test?openPath=%2Fassistant%3Fcontinue%3Dabc' };
  const shaped = shapeLineReply('เตรียมให้ 45 รายการครับ', cards, undefined, { continueLink: link, why: 'cards' });
  assert.equal(shaped.left, plain.left);
  assert.ok(shaped.messages.length <= 5);
  const last = flat(shaped.messages.at(-1));
  assert.match(last, /ทำต่อในแอป/);
  assert.match(last, new RegExp(`อีก ${plain.left} รายการอยู่ในแชทเดียวกันในแอป`));
  assert.equal(uriOf(shaped.messages.at(-1)), link.uri);
  assert.doesNotMatch(flat(shaped.messages), /มีอีก \d+ รายการ เปิดดูในเลขาในแอปได้ครับ/);
});

test('LINE: a card too long to confirm there carries ทำต่อในแอป in its own footer (no second card); analysis gets one card under it', async () => {
  const { shapeLineReply } = await import('../backend/src/ai/lineFormat');
  const link = { label: 'ทำต่อในแอป', uri: 'https://liff.line.me/2012039027-test?openPath=x' };
  const long = shapeLineReply('เตรียมใบเสนอราคาให้ครับ', [confirm(1, 40)], undefined, { continueLink: link, why: 'cards' });
  assert.equal(long.oversized, true);
  assert.equal(long.messages.length, 2);
  assert.match(flat(long.messages[1]), /กด “ทำต่อในแอป” เพื่อเปิดแชทนี้ในแอป ตรวจรายละเอียดครบ แล้วยืนยันได้ที่นั่น/);
  assert.equal(uriOf(long.messages[1]), link.uri);
  // Without a link (kept nowhere) the card says what it said before.
  assert.match(flat(shapeLineReply('เตรียมให้ครับ', [confirm(1, 40)]).messages), /เปิดเลขาในแอปแล้วขอให้เตรียมรายการใหม่/);

  const detail = shapeLineReply('ปีนี้ภาษีประมาณ 12,000 บาทครับ\n\nลดหย่อนเพิ่มได้จากประกันสังคมและกองทุนครับ', [], undefined, { continueLink: link, why: 'detail' });
  assert.match(flat(detail.messages.at(-1)), /เปิดแชทนี้ต่อในแอป พร้อมเรื่องที่คุยไว้ ดูแบบละเอียด/);
  assert.equal(uriOf(detail.messages.at(-1)), link.uri);
  assert.ok(detail.messages.length <= 5);
});

test('lineAssistantAnswer keeps the conversation and adds the button; a store that fails leaves the answer as it was', async () => {
  const { lineAssistantAnswer } = await import('../backend/src/ai/lineBridge');
  const cards = Array.from({ length: 45 }, (_, at) => confirm(at + 1));
  const kept: { why: string; turns: unknown[] }[] = [];
  const deps = {
    env: { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'test-gemini' },
    db: {} as never,
    plan: async () => ({ plan: 'pro' as const, email: null }),
    rateLimit: async () => undefined,
    consented: async () => true,
    run: (async () => ({ text: 'เตรียมให้ 45 รายการครับ', cards, route: 'action', tokens: 20, tokensLeft: 900, trialLeft: null })) as never,
    keepForApp: async (_user: string, why: 'cards' | 'detail', turns: unknown[]) => { kept.push({ why, turns }); return 'Abcdefghijklmnopqrstuv'; },
  };
  const answer = await lineAssistantAnswer({ user_id: USER } as UserRow, 'บันทึก 45 รายการนี้', [{ role: 'user', text: 'สวัสดี' }, { role: 'assistant', text: 'สวัสดีครับ' }], deps);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].why, 'cards');
  assert.equal(kept[0].turns.length, 4);
  const button = uriOf(answer!.messages.at(-1));
  assert.ok(button, 'the last message has the button');
  const { safeLineDestination } = await import('../shared/lineDestination');
  assert.equal(decodeURIComponent(new URL(button).searchParams.get('openPath')!), '/assistant?continue=Abcdefghijklmnopqrstuv&from=line');

  const failing = await lineAssistantAnswer({ user_id: USER } as UserRow, 'บันทึก 45 รายการนี้', [], { ...deps, keepForApp: async () => { throw new Error('store down'); } });
  assert.match(flat(failing!.messages.at(-1)), /มีอีก \d+ รายการ เปิดดูในเลขาในแอปได้ครับ/);

  // A short everyday answer has no button and keeps nothing.
  kept.length = 0;
  const everyday = await lineAssistantAnswer({ user_id: USER } as UserRow, 'สวัสดีครับ', [], { ...deps, run: (async () => ({ text: 'สวัสดีครับ', cards: [], route: 'chat', tokens: 2, tokensLeft: 900, trialLeft: null })) as never });
  assert.equal(kept.length, 0);
  assert.doesNotMatch(flat(everyday!.messages), /ทำต่อในแอป/);

  // The LINE page signs in and opens the chat with the id; another id shape never passes.
  assert.equal(safeLineDestination('/assistant?continue=Abcdefghijklmnopqrstuv'), '/assistant?continue=Abcdefghijklmnopqrstuv&from=line');
  assert.equal(safeLineDestination('/assistant?continue=../../x'), '/assistant?from=line');
  assert.equal(safeLineDestination('/assistant?continue=Abcdefghijklmnopqrstuv&evil=1'), '/assistant?continue=Abcdefghijklmnopqrstuv&from=line');
});

test('the app\'s API opens the kept conversation with no model call; the chat keeps the id before the address changes', async () => {
  const fs = await import('node:fs');
  const handler = fs.readFileSync(new URL('../backend/src/handlers/assistant.ts', import.meta.url), 'utf8');
  assert.match(handler, /action: z\.literal\('continue-line'\), id: z\.string\(\)\.regex\(CONTINUE_ID\)/);
  assert.match(handler, /const opened = await openInApp\(user\.id, body\.id\)/);
  const app = fs.readFileSync(new URL('../frontend/src/app/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /if \(typeof window !== 'undefined'\) rememberLineContinue\(\);/);
});

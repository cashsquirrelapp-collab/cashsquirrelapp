import test from 'node:test';
import { statSync } from 'node:fs';
import assert from 'node:assert/strict';
import { HttpError } from '../backend/src/http/guard';
import { lineAssistantAnswer } from '../backend/src/ai/lineBridge';
import type { AssistantDb, handleMessage } from '../backend/src/ai/service';
import { buildLineFeatureShortcut, isLineFeatureShortcut } from '../backend/src/services/lineFeatureShortcuts';
import { buildLineProPoster, buildLineUpgradeCard, buildLineUpgradeMessages, PRO_POSTER, UPGRADE_EVERY_MS } from '../backend/src/services/lineUpgrade';
import type { UserRow } from '../backend/src/services/lineAssistant';
import { safeLineDestination } from '../shared/lineDestination';

// Plus and Pro in LINE (owner, 2026-11-16: "เอาโฆษณาแบบพวกการเติมโปรเนี่ยลงในไลน์ด้วยนะ ... ให้มันสมัครง่ายมากขึ้น"; chose
// "ตอนโทเคนหมด + ในเมนู"). One card, a button per plan into the plans page in LINE; only in replies, at most weekly under answers.

process.env.APP_URL = 'https://krarok.com';
process.env.LIFF_ID = '1234567890-abcdEFGH';
const A = '77777777-7777-4777-8777-777777777777';
const NOW = new Date('2026-11-20T05:00:00Z');
const env = { AI_ENABLED: 'true', AI_ADMINS_ONLY: 'false', GEMINI_API_KEY: 'g' };

const json = (message: unknown) => JSON.stringify(message);
const buttons = (message: unknown) => [...json(message).matchAll(/"label":"(สมัคร [^"]+)","uri":"([^"]+)"/g)].map(m => [m[1], decodeURIComponent(m[2])]);

test('the card: Plus and Pro with today\'s prices and a button each into the plans page in LINE', () => {
  const card = buildLineUpgradeCard('menu', NOW);
  assert.equal((card as { type: string }).type, 'flex');
  // Three cards side by side, Pro first (owner, 2026-11-16, after another LINE assistant's plan cards).
  const bubbles = (card as unknown as { contents: { type: string; contents: unknown[] } }).contents;
  assert.equal(bubbles.type, 'carousel');
  assert.deepEqual(bubbles.contents.map(bubble => (json(bubble).match(/"text":"(Pro|Plus|Free)"/) || [])[1]), ['Pro', 'Plus', 'Free']);
  assert.match(json(bubbles.contents[0]), /"text":"฿169"/);
  assert.match(json(bubbles.contents[1]), /"text":"฿99"/);
  assert.match(json(bubbles.contents[1]), /"text":"650\/เดือน"/);
  // Every row says what it counts (owner, 2026-11-16: "ไม่ค่อยเคลียร์").
  for (const words of ['ใช้ตอนคุยหรือสั่งงานเลขา ในแอปและ LINE', 'ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ในแอปหรือผ่านเลขา', 'สลิป บิล ใบ 50 ทวิ', 'ในแอป ไม่ใช้โทเคน'])
    assert.match(json(bubbles.contents[2]), new RegExp(words));
  assert.match(json(card), /ราคายังไม่รวมค่าธรรมเนียมชำระเงิน/);
  assert.match(json(card), /mascot-v6-guide\.png/, 'official poses, never redrawn');
  assert.doesNotMatch(json(card), /gradient/i);
  assert.deepEqual(buttons(card).map(([label, uri]) => [label, uri.replace(/^https:\/\/liff\.line\.me\/[^?]+\?openPath=/, '')]),
    [['สมัคร Pro ฿169', '/plans?tier=pro&from=line'], ['สมัคร Plus ฿99', '/plans?tier=plus&from=line']]);
  // Before the sale ended (16 Nov 2569 03:00 Bangkok) Pro was ฿159, with ฿169 struck.
  const before = json(buildLineUpgradeCard('menu', new Date('2026-11-15T19:00:00Z')));
  assert.match(before, /"text":"฿159"/);
  assert.match(before, /"text":"฿169","size":"sm","color":"[^"]+","decoration":"line-through"/);
  // The plans page is a LINE destination, with only plus or pro kept.
  assert.equal(safeLineDestination('/plans?tier=plus'), '/plans?tier=plus&from=line');
  assert.equal(safeLineDestination('/plans?tier=gold'), '/plans?from=line');
});

test('typing แพ็กเกจ (or pressing it in เมนูเพิ่มเติม) shows the card; เมนูเพิ่มเติม has the button', () => {
  for (const word of ['แพ็กเกจ', 'สมัคร Pro', 'สมัครPlus', 'อัปเกรด', 'สมัครสมาชิก']) {
    assert.equal(isLineFeatureShortcut(word), true, word);
    assert.match(json(buildLineFeatureShortcut(word, [], NOW)), /สมัคร Plus ฿99/, word);
  }
  assert.match(json(buildLineFeatureShortcut('เมนูเพิ่มเติม', [], NOW)), /"label":"ดูแพ็กเกจ Plus \/ Pro","text":"แพ็กเกจ"/);
});

test('asked in a sentence ("การ์ดแพ็กเกจ", "แพ็กเกจมีอะไรบ้าง", "Pro ราคาเท่าไหร่") the cards come too; records, other packages and own-plan questions go on to เลขา', () => {
  for (const word of ['การ์ดแพ็กเกจ', 'ขอการ์ดแพ็กเกจหน่อยครับ', 'แพ็กเกจมีอะไรบ้าง', 'มีแพ็คเกจอะไรบ้าง', 'แพ็กเกจราคาเท่าไหร่', 'ราคา', 'ดูราคา',
    'Pro', 'โปร', 'pro ราคาเท่าไหร่', 'โปรกับพลัสต่างกันยังไง', 'แพ็กเกจทั้งหมด', 'เมนูแพ็กเกจ', 'อยากได้ Pro']) {
    assert.equal(isLineFeatureShortcut(word), true, word);
    assert.match(json(buildLineFeatureShortcut(word, [], NOW)), /สมัคร Plus ฿99/, word);
  }
  for (const word of ['ค่าแพ็กเกจเน็ต 599', 'ค่าแพ็คเกจมือถือ', 'แพ็กเกจถ่ายรูปรับปริญญา', 'โปรโมชั่น', 'โปรเจกต์ลูกค้าเอ', 'โปรแกรมนี้ใช้ยังไง',
    'งานโปรดักชั่นเอ', 'Pro ของฉันหมดเมื่อไหร่', 'ยกเลิกแพ็กเกจ', 'ตอนนี้ใช้แพ็กเกจอะไรอยู่', 'สมัคร', 'approve']) {
    assert.equal(isLineFeatureShortcut(word), false, word);
  }
});

const reply = { text: 'สรุปเดือนนี้ รายรับ 12,000 บาท', cards: [], route: 'chat', tokens: 3, tokensLeft: 80, trialLeft: null };
function answer(plan: 'trial' | 'pro' | 'lapsed', opts: { due?: boolean; left?: number; fail?: Error } = {}) {
  const marked: string[] = [];
  const run = (async () => { if (opts.fail) throw opts.fail; return { ...reply, tokensLeft: opts.left ?? 80 }; }) as unknown as typeof handleMessage;
  return lineAssistantAnswer({ user_id: A } as UserRow, 'สรุปเดือนนี้', [], {
    env, db: {} as AssistantDb, now: NOW, run,
    plan: async () => ({ plan, email: null, ...(plan === 'trial' ? { tokens: 100, free: true } : {}) }) as never,
    rateLimit: async () => undefined, consented: async () => true,
    upgradeDue: async () => opts.due ?? false, markUpgrade: async () => { marked.push('shown'); },
  }).then(result => ({ result: result!, marked }));
}

test('under an answer: once a week for an account without a paid plan (low tokens say so); never for a paid plan', async () => {
  const weekly = await answer('trial', { due: true });
  assert.match(json(weekly.result.messages.at(-1)), /"altText":"ใช้เลขาได้มากขึ้นกับ Plus และ Pro/);
  assert.deepEqual(weekly.marked, ['shown']);
  const low = await answer('trial', { due: true, left: 5 });
  assert.match(json(low.result.messages.at(-1)), /"altText":"โทเคนเลขาใกล้หมดแล้ว/);
  const notDue = await answer('trial', { due: false });
  assert.doesNotMatch(json(notDue.result.messages), /สมัคร Plus/);
  assert.deepEqual(notDue.marked, []);
  const paid = await answer('pro', { due: true });
  assert.doesNotMatch(json(paid.result.messages), /สมัคร Plus/, 'Plus and Pro members never get it');
  assert.ok(UPGRADE_EVERY_MS === 7 * 86_400_000);
});

test('out of tokens: the message, then the card for an account without a paid plan; a paid plan gets the message only', async () => {
  const out = new HttpError(402, 'โทเคนเลขาของรอบนี้ใช้ครบแล้ว อัปเกรดเป็น Pro เพื่อใช้เลขากระรอกต่อ', 'ai_tokens_used');
  const free = await answer('trial', { fail: out });
  assert.equal(free.result.messages.length, 3, 'the message, the Pro poster, the plans');
  assert.match(json(free.result.messages[0]), /ใช้ครบแล้ว/);
  assert.match(json(free.result.messages[1]), /pro-kv-v1\.jpg/);
  assert.match(json(free.result.messages[2]), /"altText":"โทเคนเลขาเดือนนี้หมดแล้ว/);
  assert.match(json(free.result.messages[2]), /สมัคร Pro ฿169/);
  const lapsed = await answer('lapsed', { fail: out });
  assert.equal(lapsed.result.messages.length, 3);
  const paid = await answer('pro', { fail: out });
  assert.equal(paid.result.messages.length, 1);
});

test('the Pro poster: the app\'s own invitation as one picture, tapped (or its button) into the plans page with Pro chosen', () => {
  const poster = buildLineProPoster(NOW) as unknown as { altText: string; contents: { size: string; hero: { url: string; aspectRatio: string; action: { uri: string } }; footer: unknown } };
  assert.ok(poster);
  assert.equal(poster.contents.size, 'mega');
  assert.match(poster.contents.hero.url, /^https:\/\/krarok\.com\/line\/pro-kv-v1\.jpg$/);
  assert.equal(poster.contents.hero.aspectRatio, PRO_POSTER.ratio);
  assert.match(decodeURIComponent(poster.contents.hero.action.uri), /openPath=\/plans\?tier=pro&from=line/);
  assert.match(json(poster.contents.footer), /"label":"สมัคร Pro ฿169\/เดือน"/);
  assert.match(json(poster.contents.footer), /ราคายังไม่รวมค่าธรรมเนียมชำระเงิน/);
  assert.match(poster.altText, /วันละไม่ถึง ฿6/);
  // The picture says ฿169: at another price (the ฿159 sale before 16 Nov 2569 03:00) it is not sent, the plans come alone.
  assert.equal(buildLineProPoster(new Date('2026-11-15T19:00:00Z')), null);
  assert.equal(buildLineUpgradeMessages('menu', new Date('2026-11-15T19:00:00Z')).length, 1);
  // First the poster, then the plans; with room for one message only, the plans.
  assert.deepEqual(buildLineUpgradeMessages('menu', NOW).map(message => (json(message).includes('pro-kv-v1') ? 'poster' : 'plans')), ['poster', 'plans']);
  assert.equal(buildLineUpgradeMessages('weekly', NOW, 1).length, 1);
  // The picture is in the app's public files, under LINE's 10 MB.
  assert.ok(statSync(new URL('../frontend/public/line/pro-kv-v1.jpg', import.meta.url)).size < 1_000_000);
});

// Owner, 2026-11-18: "กูยังพิมพ์ไม่เจอเลย": only แพ็กเกจ spelt with ก brought the plans; most people type it otherwise.
test('the plans come however the request is spelt; a sentence about something else still goes to เลขา', () => {
  for (const text of ['แพ็คเกจ', 'แพคเกจ', 'แพ็คเก็จ', 'แพกเกจ', 'Package', 'ดูแพ็คเกจ', 'ขอดูแพ็คเกจหน่อยครับ', 'สมัครโปร', 'สมัคร Plus', 'แพ็กเกจ Pro', 'แพ็คเกจโปร', 'อัปเกรดเป็นโปร', 'ราคาแพ็คเกจ']) {
    assert.equal(isLineFeatureShortcut(text), true, text);
    assert.ok(buildLineFeatureShortcut(text, [], new Date('2026-11-18T03:00:00Z')), text);
  }
  for (const text of ['โปรเจกต์', 'แพ็คเกจนี้ดีไหม', 'บันทึกค่าแพ็คเกจเน็ต 500', 'ค่าแพ็คเกจมือถือ 399']) {
    assert.equal(isLineFeatureShortcut(text), false, text);
  }
});

// Owner, 2026-11-18, a screenshot: "มันขึ้นแบบนี้แทน": asked in words only เลขา understood, the answer came with two
// "อัปเกรด Pro · เปิดหน้าในแอป" link cards and no plan cards.
test('เลขา\'s link to the plans page comes in LINE as the Pro poster and the plan cards, once, under its answer', async () => {
  const plansLink = { kind: 'navigation', label: 'อัปเกรด Pro', path: '/plans', autoOpen: false };
  for (const plan of ['pro', 'trial'] as const) {
    const run = (async () => ({ ...reply, text: 'Pro ตอนนี้เปิดขายเฉพาะรายเดือนครับ', cards: [plansLink, { ...plansLink }] })) as unknown as typeof handleMessage;
    const result = await lineAssistantAnswer({ user_id: A } as UserRow, 'การ์ดแพ็กเกจที่เราทำไว้ ส่งมาให้ดูหน่อยสิ', [], {
      env, db: {} as AssistantDb, now: NOW, run,
      plan: async () => ({ plan, email: null, ...(plan === 'trial' ? { tokens: 100, free: true } : {}) }) as never,
      rateLimit: async () => undefined, consented: async () => true, upgradeDue: async () => true, markUpgrade: async () => undefined,
    });
    const kinds = result!.messages.map(message => (json(message).includes('pro-kv-v1') ? 'poster' : /สมัคร Plus ฿99/.test(json(message)) ? 'plans' : message.type));
    assert.deepEqual(kinds, ['text', 'poster', 'plans'], plan);
    assert.doesNotMatch(json(result!.messages), /เปิดหน้าในแอป/, plan);
  }
});

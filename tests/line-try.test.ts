import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTryChat, buildTryPreview, buildTryPrompt, buildTryWelcome, buildTryWelcomeBack, decodeTry, encodeTry, parseTry, TRY_CHAT, TRY_POSTBACK } from '../backend/src/services/lineTry.js';
import { lineEventCommand } from '../backend/src/handlers/line-webhook.js';
import { settingsFor } from '../backend/src/services/lineSignup.js';

// The first minute in LINE (owner, 2026-11-13: "ใช้ง่าย เข้าใจได้รวดเร็ว สะดวก", unlike the competitor): one question, try a
// record before signing up, keep it with one tap. No AI for people without an account; nothing stored before sign-up.

test('a typed record is read without AI: a name and an amount, money in by its words, a category when it is plain', () => {
  assert.deepEqual(parseTry('ข้าวมันไก่ 50'), { kind: 'expense', name: 'ข้าวมันไก่', amount: 50, category: 'อาหาร/รับรองลูกค้า' });
  assert.deepEqual(parseTry('ค่าเช่ากล้อง 1,200 บาท'), { kind: 'expense', name: 'ค่าเช่ากล้อง', amount: 1200, category: 'ค่าอุปกรณ์/ซอฟต์แวร์' });
  assert.deepEqual(parseTry('งานถ่ายรูป 5000'), { kind: 'income', name: 'งานถ่ายรูป', amount: 5000 });
  assert.deepEqual(parseTry('ได้เงินค่าจ้าง ฿3,500.50'), { kind: 'income', name: 'ได้เงินค่าจ้าง', amount: 3500.5 });
  assert.deepEqual(parseTry('ซื้อของ 99'), { kind: 'expense', name: 'ซื้อของ', amount: 99 });
  for (const text of ['สวัสดี', '50', 'ค่ากาแฟ', 'ค่ากาแฟ 0', 'ข้าว 99999999', '123 456']) assert.equal(parseTry(text), null, text);
});

test('the tried record rides in the link and comes back checked; a changed or made-up one is refused', () => {
  const draft = { kind: 'expense' as const, name: 'ข้าวมันไก่', amount: 50, category: 'อาหาร/รับรองลูกค้า' };
  assert.deepEqual(decodeTry(encodeTry(draft)), draft);
  assert.equal(decodeTry('not-base64-json'), null);
  assert.equal(decodeTry(Buffer.from(JSON.stringify({ k: 'e', n: 'x', a: -5 })).toString('base64url')), null);
  assert.equal(decodeTry(Buffer.from(JSON.stringify({ k: 'e', n: 'x', a: 5, c: 'made up' })).toString('base64url'))?.category, undefined);
  assert.equal(decodeTry('x'.repeat(700)), null);
});

// The greeting card (owner, 2026-11-13: design C of four, with office buildings as props behind the official mascot, and
// a newcomer told an existing sheet or Excel file can be connected).
test('follow: the greeting card with the city and the mascot, three steps, ใช้แบบไหน as three choices; a pick gets an example', () => {
  process.env.APP_URL = 'https://staging.krarok.com';
  const messages = buildTryWelcome() as any[];
  assert.equal(messages.length, 1, 'one card, nothing else');
  const card = messages[0];
  const text = JSON.stringify(card);
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /^ยินดีที่ได้รู้จักครับ ผมเลขากระรอก/);
  assert.ok(text.includes('/line/greeting-city-v1.png') && text.includes('/line/mascot-v6-review.png'), 'the buildings and the official mascot');
  assert.ok(!text.includes('linearGradient'), 'flat brick, no gradient');
  for (const step of ['พิมพ์บอก', 'ตรวจแล้วกดยืนยัน', 'ดูสรุปเมื่อไหร่ก็ได้']) assert.ok(text.includes(step), step);
  assert.ok(!text.includes('มีชีตหรือ Excel อยู่แล้ว?'), 'no sheet line where the Sheets features are not shown');
  assert.ok(JSON.stringify(buildTryWelcome({ sheets: true })).includes('มีชีตหรือ Excel อยู่แล้ว?'));
  const picks = [...text.matchAll(/"data":"(try:use:[a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(picks, ['try:use:personal', 'try:use:business', 'try:use:company']);
  for (const data of ['try:use:personal', 'try:use:company']) {
    assert.ok(TRY_POSTBACK.test(data));
    assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data } }), data);
  }
  assert.match((buildTryPrompt('personal') as any).text, /ข้าวมันไก่ 50/);
  assert.match((buildTryPrompt('business') as any).text, /งานถ่ายรูป 5000/);
});

test('the preview says it is not saved and keeps it with one tap at sign-up', () => {
  const card = buildTryPreview({ kind: 'expense', name: 'ข้าวมันไก่', amount: 50 }, 'personal', 'LIFF-1') as any;
  const text = JSON.stringify(card);
  assert.ok(text.includes('ตัวอย่าง · ยังไม่บันทึก') && text.includes('−฿50') && text.includes('ข้าวมันไก่'));
  const uri = new URL(card.contents.footer.contents[0].action.uri);
  assert.equal(uri.origin + uri.pathname, 'https://liff.line.me/LIFF-1');
  assert.equal(uri.searchParams.get('start'), '1');
  assert.equal(uri.searchParams.get('use'), 'personal');
  assert.deepEqual(decodeTry(uri.searchParams.get('keep')), { kind: 'expense', name: 'ข้าวมันไก่', amount: 50 });
});

test('after one tap: the tried record saved and one line on what next, with buttons for the first things people do', () => {
  const [saved, next] = buildTryWelcomeBack({ kind: 'expense', name: 'ข้าวมันไก่', amount: 50 }, 'ปาร์ค') as any[];
  assert.ok(JSON.stringify(saved).includes('บันทึกแล้ว'));
  assert.match(next.text, /^เรียบร้อยครับ/);
  assert.deepEqual(next.quickReply.items.map((item: any) => item.action.label), ['สรุปเดือนนี้', 'ส่งรูปสลิป', 'เชื่อมชีต']);
  const [only] = buildTryWelcomeBack(null, 'ปาร์ค') as any[];
  assert.match(only.text, /^ยินดีต้อนรับครับ คุณปาร์ค/);
});

test('the use picked is kept with the welcome answers and chooses the app menu until a work type is known', () => {
  const personal = settingsFor({ use: 'personal', skippedAtStep: 2 }, new Date('2026-11-13T05:00:00Z'));
  assert.equal(personal.onboarding?.use, 'personal');
  assert.equal(personal.onboarding?.status, 'SKIPPED');
  assert.equal(personal.userPersona, 'employee');
  assert.equal(settingsFor({ use: 'company', skippedAtStep: 2 }, new Date()).userPersona, 'freelance');
  assert.equal(settingsFor({ use: 'personal', workType: 'student' }, new Date()).userPersona, 'university');
});

test('คุยกับเลขา on the guest menu: what to type, and every example sentence comes back as a card to keep', () => {
  const message = buildTryChat() as any;
  assert.equal(TRY_CHAT, 'คุยกับเลขา');
  assert.match(message.text, /ชื่อรายการกับจำนวนเงิน/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(message.text));
  const examples = message.quickReply.items.map((item: any) => item.action.text);
  assert.ok(examples.length >= 3);
  for (const text of examples) assert.ok(parseTry(text), text);
  assert.equal(parseTry('ได้เงินค่าสอน 1500')?.kind, 'income');
});

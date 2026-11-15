import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTryWelcomeBack, decodeTry, encodeTry, parseTry, TRY_POSTBACK } from '../backend/src/services/lineTry.js';
import { buildConnectFirst, buildLineHello } from '../backend/src/services/lineLinkCards.js';
import { connectFirstFor, lineEventCommand } from '../backend/src/handlers/line-webhook.js';
import { settingsFor } from '../backend/src/services/lineSignup.js';

// The first minute in LINE (owner, 2026-11-13: "ใช้ง่าย เข้าใจได้รวดเร็ว สะดวก"; 2026-11-15: "ขึ้นข้อความทักหาเขาว่าเราคืออะไร
// ... สอนวิธีการล็อกอิน ... เวลาเขาทักไปไม่ว่าจะเป็นอะไร ... ให้เขาเชื่อมต่อก่อน"): adding the OA brings what Krarok is and how to
// connect; anything sent before connecting brings the connect-first card, and a typed record rides along to be saved at
// sign-up. No AI for people without an account; nothing stored before sign-up.

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

// The greeting's look stays (owner, 2026-11-13: design C, office buildings behind the official mascot, and the sheet line
// for newcomers); since 2026-11-15 it says what Krarok is and teaches connecting, step by step.
test('follow: what Krarok is, the steps to connect, and the buttons for a new account and an existing one', () => {
  process.env.APP_URL = 'https://staging.krarok.com';
  const card = buildLineHello({ liffId: '2012039027-neCxHo9L', signup: true }) as any;
  const text = JSON.stringify(card);
  assert.equal(card.type, 'flex');
  assert.match(card.altText, /^ยินดีที่ได้รู้จักครับ ผมคือเลขากระรอก/);
  assert.ok(text.includes('/line/greeting-city-v1.png') && text.includes('/line/mascot-v6-review.png'), 'the buildings and the official mascot');
  assert.ok(!text.includes('linearGradient'), 'flat brick, no gradient');
  assert.ok(text.includes('กระรอกตุนเงินช่วยจดรายรับ รายจ่าย และงานที่รอรับเงิน'), 'what Krarok is');
  for (const step of ['พิมพ์บอกหรือส่งรูปสลิป', 'ตรวจแล้วกดยืนยัน', 'ดูสรุปเมื่อไหร่ก็ได้', 'เริ่มใช้งาน 2 ขั้นตอน', 'กด เริ่มใช้งาน ด้านล่าง', 'ใส่ชื่อและประเภทงาน', 'มีบัญชีอยู่แล้ว แล้วเข้าสู่ระบบด้วยอีเมลและรหัสผ่านเดิม', 'ตั้งค่า › เชื่อมต่อ LINE']) assert.ok(text.includes(step), step);
  assert.ok(!text.includes('try:use:'), 'no ใช้แบบไหน question any more: the steps instead');
  const [start, existing] = card.contents.footer.contents;
  assert.deepEqual([start.style, start.action.label, start.action.uri], ['primary', 'เริ่มใช้งาน', 'https://liff.line.me/2012039027-neCxHo9L?start=1']);
  assert.deepEqual([existing.style, existing.action.label, existing.action.uri], ['secondary', 'มีบัญชีอยู่แล้ว · เข้าสู่ระบบ', 'https://liff.line.me/2012039027-neCxHo9L?start=1&link=1']);
  assert.ok(!text.includes('มีชีตหรือ Excel อยู่แล้ว?'), 'no sheet line where the Sheets features are not shown');
  assert.ok(JSON.stringify(buildLineHello({ liffId: 'L', signup: true, sheets: true })).includes('มีชีตหรือ Excel อยู่แล้ว?'));
  // Without sign-up in LINE (the real site today): the website and the 16-character code, in three steps.
  const web = buildLineHello({ liffId: 'L', signup: false }) as any;
  const webText = JSON.stringify(web);
  for (const step of ['เชื่อมต่อ 3 ขั้นตอน', 'สมัครหรือเข้าสู่ระบบบนเว็บ', 'ไปที่ ตั้งค่า › เชื่อมต่อ LINE', 'ส่งรหัสมาที่แชทนี้']) assert.ok(webText.includes(step), step);
  assert.equal(web.contents.footer.contents.length, 1);
  assert.equal(web.contents.footer.contents[0].action.uri, 'https://staging.krarok.com/login');
});

test('anything before connecting: the connect-first card; a typed record rides along to be saved at sign-up', () => {
  process.env.APP_URL = 'https://staging.krarok.com';
  const plain = buildConnectFirst({ liffId: 'LIFF-1', signup: true }) as any;
  const plainText = JSON.stringify(plain);
  assert.match(plain.altText, /^เชื่อมต่อบัญชีก่อนครับ/);
  assert.ok(plainText.includes('LINE นี้ยังไม่ได้เชื่อมกับบัญชีกระรอกตุนเงิน') && plainText.includes('กด เริ่มใช้งาน ด้านล่าง'));
  assert.deepEqual(plain.contents.footer.contents.map((button: any) => button.action.label), ['เริ่มใช้งาน', 'มีบัญชีอยู่แล้ว · เข้าสู่ระบบ']);
  const tried = buildConnectFirst({ liffId: 'LIFF-1', signup: true, tried: { kind: 'expense', name: 'ข้าวมันไก่', amount: 50 }, use: 'personal' }) as any;
  const triedText = JSON.stringify(tried);
  assert.ok(triedText.includes('รายจ่ายที่พิมพ์มา') && triedText.includes('−฿50') && triedText.includes('บันทึกให้ทันทีเมื่อเริ่มใช้งานเสร็จ'));
  const uri = new URL(tried.contents.footer.contents[0].action.uri);
  assert.equal(uri.origin + uri.pathname, 'https://liff.line.me/LIFF-1');
  assert.equal(uri.searchParams.get('start'), '1');
  assert.equal(uri.searchParams.get('use'), 'personal');
  assert.deepEqual(decodeTry(uri.searchParams.get('keep')), { kind: 'expense', name: 'ข้าวมันไก่', amount: 50 });
  // Without sign-up in LINE, nothing rides along: the website and the code.
  const web = buildConnectFirst({ liffId: 'LIFF-1', signup: false, tried: { kind: 'expense', name: 'ข้าวมันไก่', amount: 50 } }) as any;
  assert.ok(!JSON.stringify(web).includes('รายจ่ายที่พิมพ์มา'));
  assert.equal(web.contents.footer.contents[0].action.uri, 'https://staging.krarok.com/login');
  // The webhook's own choice: words, an old ใช้แบบไหน tap, a sticker (no words) all get it.
  process.env.LINE_SIGNUP = 'enabled'; process.env.LIFF_ID = 'LIFF-1';
  try {
    assert.ok(JSON.stringify(connectFirstFor('ข้าวมันไก่ 50')).includes('−฿50'));
    assert.equal(new URL((connectFirstFor('try:use:company') as any).contents.footer.contents[0].action.uri).searchParams.get('use'), 'company');
    assert.ok(JSON.stringify(connectFirstFor('สวัสดี')).includes('เชื่อมต่อบัญชีก่อนครับ'));
    assert.ok(JSON.stringify(connectFirstFor(null)).includes('เชื่อมต่อบัญชีก่อนครับ'));
  } finally { delete process.env.LINE_SIGNUP; delete process.env.LIFF_ID; }
  for (const data of ['try:use:personal', 'try:use:company']) {
    assert.ok(TRY_POSTBACK.test(data));
    assert.equal(lineEventCommand({ type: 'postback', source: { type: 'user', userId: 'U1' }, postback: { data } }), data);
  }
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

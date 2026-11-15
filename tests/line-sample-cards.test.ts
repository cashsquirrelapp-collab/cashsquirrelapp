import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-11-03: a button on the admin page sends every LINE card a Pro account receives, from sample data, to the
// owner's own LINE. The cards come from the real builders; their buttons must not touch any account's data.
process.env.APP_URL ??= 'https://krarok.example.test';

test('the intro and the samples (the 08:00 push as one message per job), in three pushes, each card within LINE’s size limit', async () => {
  const { buildLineSampleCards, LINE_SAMPLE_INTRO } = await import('../backend/src/services/lineSampleCards.js');
  const messages = await buildLineSampleCards(new Date('2026-11-04T01:00:00Z'));
  assert.equal(messages.length, 11); // the intro, the welcome, 5 morning messages, the payment reply and 3 cards
  assert.deepEqual(messages[0], { type: 'text', text: LINE_SAMPLE_INTRO });
  assert.deepEqual(messages.slice(2, 7).map(message => (message as { altText: string }).altText.split('\n')[0]), [
    'คุณปาร์ค ตัดต่อคลิปรีวิว ร้านตัวอย่าง ให้ลูกค้าตัวอย่าง D เลยกำหนดส่งมา 1 วันแล้วนะครับ',
    'วันนี้ต้องส่ง ถ่ายภาพเมนูใหม่ ให้ลูกค้าตัวอย่าง E นะครับ',
    'ยังไม่ได้รับเงิน ถ่ายภาพสินค้า ร้านตัวอย่าง จากลูกค้าตัวอย่าง A ฿4,500 เลยกำหนดมา 3 วันแล้วนะครับ',
    'วันนี้ครบกำหนดรับเงิน ออกแบบโลโก้ ร้านตัวอย่าง จากลูกค้าตัวอย่าง B ฿9,700 นะครับ',
    'เลขาชวนดูครับ งานส่งแล้ว 1 งาน ยังไม่ได้ออกใบแจ้งหนี้',
  ]);
  assert.ok(JSON.stringify(messages).includes('"data":"deliver:done:demo-late"'), 'ส่งแล้ว on the sample, which only answers that it is a sample');
  for (const message of messages.slice(1)) {
    assert.equal(message.type, 'flex');
    assert.ok(Buffer.byteLength(JSON.stringify(message)) < 30_000, 'LINE refuses a bubble over 30 KB');
  }
  assert.equal(Math.ceil(messages.length / 5), 3);
});

test('every payment button on the sample cards points at a sample job, which only answers that it is a sample', async () => {
  const { buildLineSampleCards } = await import('../backend/src/services/lineSampleCards.js');
  const { dueActionOutcome } = await import('../backend/src/services/lineDuePayments.js');
  const json = JSON.stringify(await buildLineSampleCards(new Date('2026-11-04T01:00:00Z')));
  const actions = [...json.matchAll(/"data":"(due:[^"]+)"/g)].map(match => match[1]);
  assert.ok(actions.length >= 4, 'the 08:00 card carries its buttons');
  for (const action of actions) assert.match(action, /^due:(paid|later|partial):demo-/);
  const touched: string[] = [];
  const deps = { loadJob: async () => { touched.push('load'); return null; }, saveJob: async () => { touched.push('save'); return true; }, today: () => '2026-11-04', now: () => new Date() };
  const outcome = await dueActionOutcome({ user_id: 'owner' }, { kind: 'paid', ref: { jobId: 'demo-today' } }, deps as never);
  assert.equal(outcome.kind, 'text');
  assert.deepEqual(touched, []);
});

test('only the owner’s account can send them, checked before anything is built or sent', () => {
  const source = readFileSync(new URL('../backend/src/handlers/notify.ts', import.meta.url), 'utf8');
  const guard = source.indexOf("if (event === 'admin-line-samples') {\n    if (!canViewAdminAnalytics(user, await systemRole(userId)))");
  assert.ok(guard > 0, 'owner check on the event');
  assert.ok(guard < source.indexOf('buildLineSampleCards()'), 'checked before the cards are built');
  assert.ok(source.indexOf("rateLimit('line-samples', userId, 1, 60)") > guard, 'once a minute');
});

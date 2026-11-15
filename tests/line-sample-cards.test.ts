import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-11-03: a button on the admin page sends every LINE card a Pro account receives, from sample data, to the
// owner's own LINE. The cards come from the real builders; their buttons must not touch any account's data.
process.env.APP_URL ??= 'https://krarok.example.test';

test('the intro and 8 samples (เตือนส่งงาน as one message per job), in three pushes, each card within LINE’s size limit', async () => {
  const { buildLineSampleCards, LINE_SAMPLE_INTRO } = await import('../backend/src/services/lineSampleCards.js');
  const messages = await buildLineSampleCards(new Date('2026-11-04T01:00:00Z'));
  assert.equal(messages.length, 11); // the intro, 7 cards, and เตือนส่งงาน as 3 messages, one per job
  assert.deepEqual(messages[0], { type: 'text', text: LINE_SAMPLE_INTRO });
  assert.equal((messages[2] as { altText: string }).altText, 'คุณปาร์ค ตัดต่อคลิปรีวิว ร้านตัวอย่าง ให้ลูกค้าตัวอย่าง D เลยกำหนดส่งมา 1 วันแล้วนะครับ');
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

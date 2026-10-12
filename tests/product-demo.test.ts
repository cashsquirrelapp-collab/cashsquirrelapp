import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoState, FOCUS_JOB_ID } from '../frontend/src/features/marketing/landing/demo/demoData';
import { DURATION, KEYS, SCENES, frameAt, keyIndexAt, sceneStill } from '../frontend/src/features/marketing/landing/demo/demoScript';

test('the demo job reads 6,000 / 2,000 / 4,000, and recording 1,000 makes it 3,000 / 3,000', () => {
  const before = demoState(false).focus, after = demoState(true).focus;
  assert.deepEqual([before.value, before.received, before.remaining], [6000, 2000, 4000]);
  assert.deepEqual([after.value, after.received, after.remaining], [6000, 3000, 3000]);
  assert.equal(before.id, FOCUS_JOB_ID);
});

test('every total on screen comes from the same rows, before and after the payment', () => {
  for (const paid of [false, true]) {
    const s = demoState(paid);
    assert.equal(s.workValue, s.jobs.reduce((n, j) => n + j.value, 0));
    assert.equal(s.received + s.pending, s.workValue); // nothing counted twice or lost
    assert.equal(s.received, s.payments.reduce((n, p) => n + p.amount, 0)); // the chart and the total agree
    assert.equal(s.pending, s.followUps.reduce((n, f) => n + f.amount, 0)); // the follow-up list and รอรับเงิน agree
    for (const job of s.jobs.filter(j => j.installments)) assert.equal(job.received, job.installments!.filter(r => r.paid).reduce((n, r) => n + r.amount, 0));
  }
});

test('recording the payment moves 1,000 from pending to received and changes nothing else', () => {
  const a = demoState(false), b = demoState(true);
  assert.equal(b.received - a.received, 1000);
  assert.equal(a.pending - b.pending, 1000);
  assert.equal(b.workValue, a.workValue); // not a new job, not extra income
  assert.equal(b.jobs.length, a.jobs.length);
  assert.equal(b.spent, a.spent);
});

test('the script is four scenes in order, about 20 seconds, and ends on the result', () => {
  assert.equal(SCENES.length, 4);
  assert.ok(DURATION >= 18000 && DURATION <= 22000);
  KEYS.forEach((key, i) => { if (i) assert.ok(key.t >= KEYS[i - 1].t, 'keyframes are in time order'); });
  SCENES.forEach((scene, i) => assert.equal(frameAt(keyIndexAt(scene.start)).scene, i));
  const last = frameAt(KEYS.length - 1);
  assert.deepEqual([last.scene, last.view, last.paid, last.sheet, last.menu, last.cursor], [3, 'dashboard', true, false, false, null]);
});

test('playback is repeatable: the same time always gives the same frame, and a replay starts unpaid', () => {
  for (const ms of [0, 2500, 6000, 10100, 12600, 13800, 18000, DURATION]) assert.deepEqual(frameAt(keyIndexAt(ms)), frameAt(keyIndexAt(ms)));
  assert.equal(frameAt(keyIndexAt(DURATION)).paid, true);
  assert.equal(frameAt(keyIndexAt(0)).paid, false); // nothing accumulates across replays
  assert.equal(frameAt(keyIndexAt(13699)).paid, false);
  assert.equal(frameAt(keyIndexAt(13700)).paid, true);
});

test('each scene has a settled still for reduced motion, with no pointer or open dialog', () => {
  SCENES.forEach((_, i) => {
    const still = sceneStill(i);
    assert.equal(still.scene, i);
    assert.deepEqual([still.cursor, still.menu, still.sheet, still.toast], [null, false, false, false]);
  });
  assert.equal(sceneStill(1).callout, true);
  assert.equal(sceneStill(2).paid, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { afterReply, isPendingConfirm, poseFor, statusFor, type ChatCard, type ConfirmCard } from '../frontend/src/features/assistant/assistantMock.ts';
import { climbFor } from '../frontend/src/features/assistant/buddyClimb.ts';

// Living mascot (owner's brief "KRAROK — LIVING AI MASCOT SYSTEM", 2026-10-26): an answer that has arrived is not a job
// done, and the corner squirrel climbs out of its ring only for real events.

const card = (status?: ConfirmCard['status']): ConfirmCard => ({ kind: 'confirm', id: 'c1', title: 'เพิ่มงานใหม่ 1 งาน', changes: [], ...(status ? { status } : {}) });
const summary: ChatCard = { kind: 'summary', period: 'ต.ค.', income: '1', expense: '0', balance: '1' };

test('an answer with a card to confirm waits for the yes; the proud squirrel is kept for a confirmed save', () => {
  assert.equal(afterReply([summary, card()]), 'awaiting');
  assert.equal(afterReply([card('pending')]), 'awaiting');
  assert.equal(afterReply([summary]), 'answered');
  assert.equal(afterReply(undefined), 'answered');
  assert.equal(afterReply([card('applied')]), 'answered');
  assert.equal(afterReply([card('cancelled')]), 'answered');
  assert.deepEqual(poseFor('answered'), { mood: 'happy', action: 'idle' });
  assert.deepEqual(poseFor('awaiting'), { mood: 'checking', action: 'hold-document' });
  assert.deepEqual(poseFor('done'), { mood: 'proud', action: 'idle' });
  assert.deepEqual(poseFor('failed'), { mood: 'worried', action: 'idle' });
  assert.equal(statusFor('answered'), 'ตอบแล้ว');
  assert.equal(statusFor('awaiting'), 'รอคุณยืนยัน');
  assert.equal(statusFor('done'), 'บันทึกเรียบร้อยแล้ว');
});

test('a card stops waiting once it is confirmed, cancelled, failed or expired', () => {
  assert.equal(isPendingConfirm(card()), true);
  assert.equal(isPendingConfirm(card(), 'pending'), true);
  for (const state of ['working', 'done', 'failed', 'cancelled', 'expired']) assert.equal(isPendingConfirm(card(), state), false, state);
  assert.equal(isPendingConfirm(card('stale')), false);
  assert.equal(isPendingConfirm(summary), false);
});

test('the squirrel climbs out for what is happening now first, then failures, a card, a save, an unread answer, a hello', () => {
  const base = { mode: 'awake' as const, pending: false, news: null, hover: false };
  assert.equal(climbFor(base), null);
  assert.equal(climbFor({ ...base, hover: true })?.kind, 'hello');
  assert.equal(climbFor({ ...base, news: 'answered', hover: true })?.kind, 'answered');
  assert.equal(climbFor({ ...base, news: 'done' })?.kind, 'done');
  assert.equal(climbFor({ ...base, news: 'done', pending: true })?.kind, 'awaiting');
  assert.equal(climbFor({ ...base, news: 'failed', pending: true })?.kind, 'failed');
  assert.equal(climbFor({ ...base, mode: 'thinking', news: 'failed' })?.kind, 'thinking');
  assert.equal(climbFor({ ...base, mode: 'working' })?.kind, 'working');
  // Words are fixed and formal, the mood is one of the squirrel's own.
  assert.deepEqual(climbFor({ ...base, mode: 'thinking' }), { kind: 'thinking', mood: 'thinking', words: 'กำลังคิด', dots: true });
  assert.deepEqual(climbFor({ ...base, pending: true }), { kind: 'awaiting', mood: 'checking', words: 'ร่างเสร็จแล้ว กรุณาตรวจก่อนยืนยัน' });
  assert.deepEqual(climbFor({ ...base, news: 'done' }), { kind: 'done', mood: 'proud', words: 'บันทึกเรียบร้อยแล้ว' });
  assert.deepEqual(climbFor({ ...base, news: 'failed' }), { kind: 'failed', mood: 'worried', words: 'ยังไม่สำเร็จ ดูรายละเอียดในแชต' });
  assert.deepEqual(climbFor({ ...base, news: 'answered' }), { kind: 'answered', mood: 'happy', words: 'คำตอบพร้อมแล้ว' });
});

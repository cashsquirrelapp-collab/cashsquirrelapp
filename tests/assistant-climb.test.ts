import test from 'node:test';
import assert from 'node:assert/strict';
import { afterReply, isPendingConfirm, poseFor, statusFor, type ChatCard, type ConfirmCard } from '../frontend/src/features/assistant/assistantMock.ts';
import { cardSpeech, climbFor, speechPreview } from '../frontend/src/features/assistant/buddyClimb.ts';

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

test('an answer is said in the squirrel\'s own words: the reply itself, when there is one', () => {
  const base = { mode: 'awake' as const, pending: false, news: null, hover: false };
  const reply = 'เดือนนี้รับเงินแล้ว ฿12,000 ครับ';
  assert.deepEqual(climbFor({ ...base, news: 'answered', reply }), { kind: 'answered', mood: 'happy', words: reply, said: true });
  assert.deepEqual(climbFor({ ...base, pending: true, reply }), { kind: 'awaiting', mood: 'checking', words: reply, said: true });
  assert.deepEqual(climbFor({ ...base, mode: 'working', reply }), { kind: 'working', mood: 'happy', words: reply, said: true });
  // Still thinking, a failure and a save keep their fixed lines; no reply text falls back to the fixed line.
  assert.equal(climbFor({ ...base, mode: 'thinking', reply })?.said, undefined);
  assert.equal(climbFor({ ...base, news: 'failed', reply })?.words, 'ยังไม่สำเร็จ ดูรายละเอียดในแชต');
  assert.equal(climbFor({ ...base, news: 'done', reply })?.words, 'บันทึกเรียบร้อยแล้ว');
  assert.equal(climbFor({ ...base, news: 'answered', reply: '  ' })?.words, 'คำตอบพร้อมแล้ว');
});

test('the bubble gets one plain short sentence: no Markdown or tables, cut at a word with "…"', () => {
  assert.equal(speechPreview('วันนี้มี **3 งาน** ที่ต้องติดตามครับ\n\n| งาน | ลูกค้า |\n|---|---|\n| ถ่ายภาพ | บริษัท |\n\nดูทั้งหมดได้ที่ [หน้างาน](/jobs)'),
    'วันนี้มี 3 งาน ที่ต้องติดตามครับ ดูทั้งหมดได้ที่ หน้างาน');
  assert.equal(speechPreview('# หัวข้อ\n1. ไปที่หน้างาน\n- กด `เพิ่มงาน`\n> หมายเหตุ'), 'หัวข้อ ไปที่หน้างาน กด เพิ่มงาน หมายเหตุ');
  const long = 'หน้างานใช้ดูงานทั้งหมด สถานะ และการรับเงินของแต่ละงานครับ ติดตรงไหนถามได้เลย หรือพิมพ์ให้ผมช่วยทำแทนก็ได้ ถ้าอยากให้ช่วยอะไรอีกบอกได้';
  const cut = speechPreview(long);
  assert.ok(cut.endsWith('…'), cut);
  assert.ok(long.startsWith(cut.slice(0, -1).trimEnd()), cut);
  assert.ok([...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(cut)].length <= 85, cut);
  // A whole word: the cut never stops inside one.
  const words = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(long)].map(part => part.segment);
  let joined = ''; const ends = new Set<number>(); for (const word of words) { joined += word; ends.add(joined.length); }
  assert.ok(ends.has(cut.slice(0, -1).trimEnd().length) || ends.has(cut.slice(0, -1).length), cut);
  assert.equal(speechPreview('สั้น ๆ ครับ'), 'สั้น ๆ ครับ');
  // Amounts never split across lines.
  assert.equal(speechPreview('สรุปเดือนนี้ · กำไรสุทธิ ฿ 18,450'), 'สรุปเดือนนี้ · กำไรสุทธิ ฿18,450');
  assert.equal(speechPreview('รายจ่าย -฿1,990'), 'รายจ่าย -\u2060฿1,990');
});

test('an answer that is only a card is said from the card', () => {
  assert.equal(cardSpeech([summary]), 'ต.ค. รายรับ 1 รายจ่าย 0 คงเหลือ 1');
  assert.equal(cardSpeech([{ kind: 'navigation', label: 'หน้างาน', path: '/jobs', autoOpen: false }, card()]), 'เพิ่มงานใหม่ 1 งาน');
  assert.equal(cardSpeech([{ kind: 'line', card: { category: 'summary', title: 'สรุปเดือนนี้', blocks: [], alt: 'ต.ค. รับแล้ว ฿12,000' } } as unknown as ChatCard]), 'ต.ค. รับแล้ว ฿12,000');
  assert.equal(cardSpeech([{ kind: 'document', docType: 'ใบแจ้งหนี้', number: 'INV-001', client: 'บริษัท ตัวอย่าง', amount: '฿1', path: '/invoice' }]), 'ใบแจ้งหนี้ · INV-001 · บริษัท ตัวอย่าง');
  assert.equal(cardSpeech(undefined), '');
});

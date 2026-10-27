import test from 'node:test';
import assert from 'node:assert/strict';
import { counted, greetingFor, habitOfPage, habitOfText, timeGreeting, topHabit, type HabitLog } from '../frontend/src/features/assistant/greeting.ts';

// Owner, 2026-10-27: no "สวัสดีครับ คุณ…" on every open; greet for the time of day and ask about what the person does
// most ("วันนี้มีเรื่องภาษีมาให้คำนวณอีกหรือเปล่า"), so เลขา reads as if it cares.

test('the time of day, on the person own clock', () => {
  assert.equal(timeGreeting(7), 'สวัสดีตอนเช้าครับ');
  assert.equal(timeGreeting(11), 'สวัสดีตอนเช้าครับ');
  assert.equal(timeGreeting(12), 'สวัสดีตอนบ่ายครับ');
  assert.equal(timeGreeting(18), 'สวัสดีตอนเย็นครับ');
  assert.equal(timeGreeting(22), 'สวัสดีตอนค่ำครับ');
  assert.equal(timeGreeting(2), 'ทำงานดึกเลยนะครับ');
});

test('what a page and a question are about', () => {
  assert.equal(habitOfPage('tax'), 'tax'); assert.equal(habitOfPage('wht50'), 'tax');
  assert.equal(habitOfPage('invoice'), 'documents'); assert.equal(habitOfPage('dashboard'), null); assert.equal(habitOfPage('assistant'), null);
  assert.equal(habitOfText('ช่วยคำนวณภาษีเดือนนี้หน่อย'), 'tax');
  assert.equal(habitOfText('ออกใบเสนอราคาให้ลูกค้า ก.'), 'documents');
  assert.equal(habitOfText('งานไหนยังไม่ได้รับเงินบ้าง'), 'receivables');
  assert.equal(habitOfText('เพิ่มงานใหม่ให้หน่อย'), 'jobs');
  assert.equal(habitOfText('ขอบคุณครับ'), null);
});

test('the habit is what was counted most in the last 30 days, once it has been counted a few times', () => {
  let log: HabitLog = {};
  log = counted(log, '2026-10-20', 'jobs');
  log = counted(log, '2026-10-21', 'jobs');
  assert.equal(topHabit(log, '2026-10-27'), null); // twice is not a habit yet
  log = counted(log, '2026-10-27', 'tax', 2);
  log = counted(log, '2026-10-27', 'tax', 2);
  assert.equal(topHabit(log, '2026-10-27'), 'tax');
  // Older than 30 days: dropped from the log and not counted.
  const old = counted({ '2026-09-01': { jobs: 50 } }, '2026-10-27', 'tax', 1);
  assert.deepEqual(Object.keys(old), ['2026-10-27']);
});

test('the greeting asks about the habit, else about the page, else what to help with; the words vary', () => {
  const tax = greetingFor({ hour: 14, habit: 'tax', page: 'jobs', seed: 0 });
  assert.deepEqual(tax, { title: 'สวัสดีตอนบ่ายครับ', line: 'วันนี้มีเรื่องภาษีให้ช่วยคำนวณอีกไหมครับ' });
  assert.notEqual(greetingFor({ hour: 14, habit: 'tax', seed: 1 }).line, tax.line);
  assert.equal(greetingFor({ hour: 9, habit: null, page: 'jobs', seed: 0 }).line, 'วันนี้มีงานไหนอยากอัปเดตไหมครับ');
  assert.equal(greetingFor({ hour: 9, habit: null, page: null, seed: 3 }).line, 'วันนี้อยากให้เลขากระรอกช่วยอะไรครับ');
  // Never the name, never "สวัสดีครับ คุณ…".
  for (let hour = 0; hour < 24; hour += 1) assert.doesNotMatch(greetingFor({ hour, habit: null, seed: hour }).title, /คุณ/);
});

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { answerQuestions, entryCall, missingOf, parseEntries, questionsFor, takeAmount, takeDate } from '../backend/src/ai/batchEntries';
import { entryTurn, ENTRY_BATCH_KEY } from '../backend/src/ai/batchTurn';
import type { AssistantCard, ToolCall } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';

// Many records pasted at once (owner, 2026-11-16): "ถ้าสมมติบันทึกประมาณ 10 ถึง 20 ถึง 30 งาน ... ยังไม่แม่นยำ ... มันนับเอาแค่
// อันที่มันมีวันที่ ... ไอ้ที่ไม่มีวันที่ข้างบนอ่ะ มันไม่นับ ... มึงก็ต้องถามเขาก่อน ... ก่อนที่มึงจะบันทึกอะไรสักอย่าง"; "อันไหน
// ที่เป็นรายจ่ายกับรายรับอ่ะมึงแยกกันหน่อย"; "สรุปให้เขาก่อน ... แล้วก็ค่อยให้การ์ดมา ... ชีตควรที่จะอยู่ด้านล่างสุด";
// "ลำดับที่ 6 แล้วอันต่อไป ... 7 ... 8 ไม่ต้องเป็นลำดับ 6 ซ้ำกัน".

const saved = { APP_URL: process.env.APP_URL, LIFF_ID: process.env.LIFF_ID };
process.env.APP_URL = 'https://krarok.example';
process.env.LIFF_ID = '2012039027-test';
after(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

const TODAY = '2026-11-16';
const NOW = new Date('2026-11-16T05:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
// The owner's own paste, exactly.
const PASTE = `วันนี้รับเงินค่าตัดต่อคลิปจากลูกค้า 3500 บาท
เมื่อวานจ่ายค่าอาหาร 120 บาท
วันที่ 14 พฤศจิกายน ซื้อกาแฟ 85 บาท
วันที่ 14 พฤศจิกายน รับเงินมัดจำงานตัดต่อ 2000 บาท
วันที่ 13 พฤศจิกายน จ่ายค่าเดินทาง 60 บาท
วันที่ 13 พฤศจิกายน ซื้ออุปกรณ์ถ่ายคลิป 890 บาท
วันที่ 12 พฤศจิกายน รับเงินจากงานรีวิว TikTok 4500 บาท
วันที่ 12 พฤศจิกายน จ่ายค่าอินเทอร์เน็ต 599 บาท
วันที่ 11 พฤศจิกายน ลูกค้าจ้างตัดต่อ 5 คลิป 3500 บาท เครดิต 30 วัน
วันที่ 10 พฤศจิกายน จ่ายค่าฟิตเนส 1200 บาท`;

test('the owner\'s paste: every one of the ten lines is a record, "วันนี้" and "เมื่อวาน" are real days, kinds apart', () => {
  const batch = parseEntries(PASTE, TODAY, NOW)!;
  assert.equal(batch.entries.length, 10, 'nothing dropped, the lines without a written date included');
  const rows = batch.entries.map(entry => [entry.kind, entry.name, entry.amount, entry.date]);
  assert.deepEqual(rows, [
    ['income', 'ค่าตัดต่อคลิป', 3500, '2026-11-16'],
    ['expense', 'ค่าอาหาร', 120, '2026-11-15'],
    ['expense', 'กาแฟ', 85, '2026-11-14'],
    ['income', 'งานตัดต่อ', 2000, '2026-11-14'],
    ['expense', 'ค่าเดินทาง', 60, '2026-11-13'],
    ['expense', 'อุปกรณ์ถ่ายคลิป', 890, '2026-11-13'],
    ['income', 'งานรีวิว TikTok', 4500, '2026-11-12'],
    ['expense', 'ค่าอินเทอร์เน็ต', 599, '2026-11-12'],
    ['job', 'ตัดต่อ 5 คลิป', 3500, '2026-11-11'],
    ['expense', 'ค่าฟิตเนส', 1200, '2026-11-10'],
  ]);
  assert.equal(batch.entries[3].deposit, true, 'มัดจำ');
  assert.equal(batch.entries[8].creditDays, 30);
  assert.equal(batch.entries[1].category, 'อาหาร/รับรองลูกค้า');
  assert.equal(batch.entries[9].category, null, 'a name no rule knows is asked, never guessed');
  // Only what the lines do not say is asked: the deposit's job value, whether the job is delivered, the fitness category.
  assert.deepEqual(batch.entries.map(entry => missingOf(entry)).filter(list => list.length), [['deposit'], ['delivered'], ['category']]);
});

test('the app\'s card asks them all at once; LINE asks one; the answers fill the lines and every line gets its tool', () => {
  const batch = parseEntries(PASTE, TODAY, NOW)!;
  assert.equal(questionsFor(batch, [], 1).length, 1);
  const asked = questionsFor(batch, [], 5);
  assert.deepEqual(asked.map(question => [question.field, question.lines]), [['deposit', [4]], ['delivered', [9]], ['category', [10]]]);
  for (const question of asked) assert.doesNotMatch(question.label, /[:\n]/, 'one line without a colon: the app sends "<label>: <answer>"');
  // The app's question card answers on one line each.
  const typed = [`${asked[0].label}: 10000`, `${asked[1].label}: ยังทำอยู่`, `${asked[2].label}: อื่นๆ`].join('\n');
  const done = answerQuestions(batch, asked, typed)!;
  assert.deepEqual(done.entries.flatMap(entry => missingOf(entry)), []);
  assert.equal(done.entries[3].total, 10000);
  assert.equal(done.entries[8].delivered, false);
  assert.equal(done.entries[9].category, 'อื่นๆ');
  assert.deepEqual(entryCall(done.entries[0]), { name: 'propose_add_job', args: { name: 'ค่าตัดต่อคลิป', value: 3500, client: 'ไม่ระบุ', delivered: true, delivery_date: '2026-11-16',
    payment_status: 'paid', paid_date: '2026-11-16', start_date: '2026-11-16', wht_rate: 0 } });
  assert.deepEqual(entryCall(done.entries[1]), { name: 'propose_add_expense', args: { name: 'ค่าอาหาร', amount: 120, category: 'อาหาร/รับรองลูกค้า', date: '2026-11-15' } });
  assert.deepEqual(entryCall(done.entries[3])?.args, { name: 'งานตัดต่อ', value: 10000, client: 'ไม่ระบุ', delivered: false, payment_status: 'partial', received_amount: 2000,
    paid_date: '2026-11-14', start_date: '2026-11-14', credit_term_days: 0, wht_rate: 0 });
  assert.deepEqual(entryCall(done.entries[8])?.args, { name: 'ตัดต่อ 5 คลิป', value: 3500, client: 'ไม่ระบุ', delivered: false, payment_status: 'unpaid', credit_term_days: 30,
    start_date: '2026-11-11', wht_rate: 0 });
});

test('lines without a day are asked about together ("วันนี้ทั้งหมด"), or one by one; a calendar day works', () => {
  const batch = parseEntries('ฝากบันทึกหน่อย\nซื้อกาแฟ 2 แก้ว 170\nค่าแท็กซี่ 120 บาท\nคุณเอโอนค่าออกแบบโลโก้ 5,000 หัก 3%\nขอบคุณครับ', TODAY, NOW)!;
  assert.equal(batch.entries.length, 3, 'the first line and the thank-you are not records');
  assert.equal(batch.entries[0].amount, 170, '"2 แก้ว" counts cups, not baht');
  assert.deepEqual([batch.entries[2].kind, batch.entries[2].client, batch.entries[2].whtRate, batch.entries[2].amount], ['income', 'คุณเอ', 3, 5000]);
  const [question] = questionsFor(batch, [], 5);
  assert.equal(question.field, 'date');
  assert.deepEqual(question.lines, [1, 2, 3]);
  assert.deepEqual(question.options, ['วันนี้ทั้งหมด', 'เมื่อวานทั้งหมด', 'ถามทีละรายการ']);
  const all = answerQuestions(batch, [question], 'เมื่อวานทั้งหมด')!;
  assert.deepEqual(all.entries.map(entry => entry.date), ['2026-11-15', '2026-11-15', '2026-11-15']);
  const apart = answerQuestions(batch, [question], 'ถามทีละรายการ')!;
  const first = questionsFor(apart, [], 1)[0];
  assert.deepEqual([first.field, first.lines], ['date', [1]]);
  assert.equal(answerQuestions(apart, [first], 'วันที่ 2026-11-03')!.entries[0].date, '2026-11-03', 'LINE\'s calendar');
  assert.equal(answerQuestions(apart, [first], `${first.label}: 3 พ.ย. 2569 (2026-11-03)`)!.entries[0].date, '2026-11-03', 'the app\'s calendar');
  // A heading day counts for the lines under it.
  const headed = parseEntries('วันที่ 12 พ.ย.\nซื้อกาแฟ 60\nค่ารถ 40\nเมื่อวาน\nจ่ายค่าไฟ 900', TODAY, NOW)!;
  assert.deepEqual(headed.entries.map(entry => entry.date), ['2026-11-12', '2026-11-12', '2026-11-15']);
});

test('only pastes of records: a question, a document, an edit or one line goes on to เลขา as before', () => {
  assert.equal(parseEntries('งาน A 3000\nงาน B 5000\nรวมเท่าไร', TODAY, NOW), null);
  assert.equal(parseEntries('ทำใบเสนอราคา คุณเอ\nค่าตัดต่อ 3000\nค่าถ่าย 5000', TODAY, NOW), null);
  assert.equal(parseEntries('แก้งาน A เป็น 3000\nแก้งาน B เป็น 5000', TODAY, NOW), null);
  assert.equal(parseEntries('ซื้อกาแฟ 60', TODAY, NOW), null);
  assert.equal(parseEntries('สวัสดีครับ\nวันนี้ว่างไหม', TODAY, NOW), null);
  assert.deepEqual(takeAmount('ซื้อของ 3.5k'), { amount: 3500, rest: 'ซื้อของ' });
  assert.equal(takeDate('วันที่ 20 ธ.ค. จ่ายค่าเช่า', TODAY).date, '2025-12-20', 'a day far ahead without a year is last year\'s');
  assert.equal(takeDate('วันที่ 20 จ่ายค่าเช่า', TODAY).date, '2026-10-20', 'a day of the month ahead is last month\'s');
});

test('money for a job already waiting is asked about, then recorded on that job (in part when it is less)', () => {
  const jobs = [{ id: 'job-a', name: 'ตัดต่อคลิปรีวิว', client: 'คุณบี', pending: 5000, value: 5000 }];
  const batch = parseEntries('วันนี้รับเงินค่าตัดต่อคลิปรีวิว 3000\nเมื่อวานซื้อกาแฟ 60', TODAY, NOW)!;
  const [question] = questionsFor(batch, jobs, 5);
  assert.equal(question.field, 'match');
  assert.match(question.text, /ตัดต่อคลิปรีวิว · คุณบี ค้าง ฿5,000/);
  const matched = answerQuestions(batch, [question], `${question.options[0]}`, jobs)!;
  assert.equal(matched.entries[0].jobId, 'job-a');
  assert.deepEqual(entryCall(matched.entries[0], jobs), { name: 'propose_record_payment', args: { job_id: 'job-a', mode: 'partial', amount: 3000, date: '2026-11-16' } });
  const fresh = answerQuestions(batch, [question], 'เป็นรายรับใหม่', jobs)!;
  assert.deepEqual(missingOf(fresh.entries[0], jobs), []);
  assert.equal(entryCall(fresh.entries[0], jobs)?.name, 'propose_add_job');
});

function userWith(state?: unknown): UserRow {
  return { user_id: USER, jobs: [], expenses: [], statuses: [], notif_settings: state ? { [ENTRY_BATCH_KEY]: state } as never : {} } as UserRow;
}
const card = (call: ToolCall, n: number): AssistantCard => ({ kind: 'confirm', id: `p_${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`, title: call.name, changes: [{ label: 'จำนวนเงิน', value: '฿1' }] });

test('the turn: questions first, then a card per line tagged with its kind, and a summary that counts every line', async () => {
  const calls: ToolCall[] = [];
  const execute = async (call: ToolCall) => { calls.push(call); return { result: { ok: true }, card: card(call, calls.length) }; };
  const first = await entryTurn({ text: PASTE, user: userWith(), now: NOW, channel: 'app', execute });
  assert.ok(first && !('cleared' in first));
  assert.match(first.text, /อ่านได้ 10 รายการครับ ก่อนเตรียมการ์ดขอถาม 3 ข้อ/);
  assert.equal(first.cards[0].kind, 'questions');
  assert.equal(calls.length, 0, 'no card before the questions are answered');
  const questions = (first.cards[0] as Extract<AssistantCard, { kind: 'questions' }>).questions;
  const answer = [`${questions[0].text}: บันทึกเป็นรายรับอย่างเดียว`, `${questions[1].text}: ยังทำอยู่`, `${questions[2].text}: อื่นๆ`].join('\n');
  const second = await entryTurn({ text: answer, user: userWith(first.state), now: NOW, channel: 'app', execute });
  assert.ok(second && !('cleared' in second));
  assert.equal(second.state, null);
  assert.equal(calls.length, 10, 'a card for every line');
  assert.deepEqual(second.cards.map(item => (item as { entry?: { kind: string } }).entry?.kind),
    ['income', 'expense', 'expense', 'income', 'expense', 'expense', 'income', 'expense', 'job', 'expense']);
  assert.match(second.text, /^อ่านครบ 10 จาก 10 รายการครับ/);
  assert.match(second.text, /รายรับ 3 รายการ รวม ฿10,000/);
  assert.match(second.text, /รายจ่าย 6 รายการ รวม ฿2,954/);
  assert.match(second.text, /งานรอรับเงิน 1 รายการ รวม ฿3,500/);
  assert.match(second.text, /ไม่ได้บอกชื่อลูกค้า/);
  // A line a tool refuses is said, never dropped.
  let n = 0;
  const refusing = async (call: ToolCall) => (++n === 2 ? { result: { ok: false, error: 'ข้อมูลไม่ผ่านการตรวจของแอป' } } : { result: { ok: true }, card: card(call, n) });
  const third = await entryTurn({ text: answer, user: userWith(first.state), now: NOW, channel: 'app', execute: refusing });
  assert.ok(third && !('cleared' in third));
  assert.match(third.text, /^เตรียมได้ 9 จาก 10 รายการครับ/);
  assert.match(third.text, /ข้อ 2 ยังเตรียมไม่ได้: ข้อมูลไม่ผ่านการตรวจของแอป/);
  // ยกเลิกทั้งหมด drops it; a message that is not an answer goes on to เลขา.
  assert.deepEqual(await entryTurn({ text: 'ยกเลิกทั้งหมด', user: userWith(first.state), now: NOW, channel: 'app', execute }), { cleared: true, text: 'ยกเลิกรายการที่วางมาแล้วครับ ยังไม่ได้บันทึกอะไร' });
  assert.equal(await entryTurn({ text: 'สรุปเดือนนี้ให้หน่อย', user: userWith(first.state), now: NOW, channel: 'app', execute }), null);
});

test('LINE: one question at a time with taps, then the summary, one card per kind with its own ยืนยัน, and ยืนยันทั้งหมด', async () => {
  const { lineEntryTurn } = await import('../backend/src/ai/lineBridge');
  let state: unknown = null;
  const groups: { id: string; group: { cards: unknown[]; kinds?: Record<string, string> } }[] = [];
  let saved = 0;
  const db = {
    loadAccount: async () => ({ user: userWith(), versions: {}, absentRecords: [] }),
    saveProposal: async () => { saved += 1; },
    saveEntryBatch: async (_user: string, batch: unknown) => { state = batch; },
  } as never;
  const deps = { db, now: NOW, saveGroup: async (_user: string, id: string, group: { cards: unknown[]; kinds?: Record<string, string> }) => { groups.push({ id, group }); } };
  const first = (await lineEntryTurn(userWith(), PASTE, deps))!;
  assert.equal(first.messages.length, 2);
  assert.match(JSON.stringify(first.messages[0]), /อ่านได้ 10 รายการครับ ขอถาม 3 ข้อก่อนเตรียมการ์ด/);
  const ask = first.messages[1] as { text: string; quickReply: { items: { action: { label: string; text?: string; type: string } }[] } };
  assert.match(ask.text, /ข้อ 4/);
  assert.ok(ask.quickReply.items.every(item => item.action.label.length <= 20), 'LINE takes labels of 20 characters at most');
  assert.ok(ask.quickReply.items.some(item => item.action.text === 'ยกเลิกทั้งหมด'));
  assert.ok(state, 'the batch waits for the answer');
  const second = (await lineEntryTurn(userWith(state), 'บันทึกเป็นรายรับอย่างเดียว', deps))!;
  const delivered = second.messages.at(-1) as { text: string; quickReply: { items: { action: { type: string } }[] } };
  assert.match(delivered.text, /ข้อ 9[\s\S]*ส่งงานแล้วหรือยัง/);
  assert.ok(delivered.quickReply.items.some(item => item.action.type === 'datetimepicker'), 'a calendar for the day it was delivered');
  const third = (await lineEntryTurn(userWith(state), 'ยังทำอยู่', deps))!;
  assert.match(JSON.stringify(third.messages.at(-1)), /ข้อ 10[\s\S]*อยู่หมวดไหน/);
  const last = (await lineEntryTurn(userWith(state), 'อื่นๆ', deps))!;
  assert.equal(state, null, 'answered: nothing waits any more');
  assert.equal(saved, 10, 'a waiting card for every line');
  assert.equal(last.messages.length, 3, 'the summary, the cards by kind, ยืนยันทั้งหมด');
  assert.match(JSON.stringify(last.messages[0]), /อ่านครบ 10 จาก 10 รายการครับ/);
  const carousel = JSON.stringify(last.messages[1]);
  const groupId = groups[0].id;
  for (const kind of ['income', 'expense', 'job']) assert.ok(carousel.includes(`ai:confirmkind:${groupId}:${kind}`), kind);
  assert.match(carousel, /ยืนยันรายรับ 3 รายการ/);
  assert.match(carousel, /ยืนยันรายจ่าย 6 รายการ/);
  assert.match(carousel, /"text":"1. ค่าตัดต่อคลิป"/);
  assert.match(carousel, /ยังไม่ส่งงาน · เครดิต 30 วัน/);
  assert.match(carousel, /"text":"฿2,954"/, 'each kind\'s total');
  assert.match(JSON.stringify(last.messages[2]), new RegExp(`ai:confirmall:${groupId}`));
  assert.match(JSON.stringify(last.messages[2]), new RegExp(`ai:showall:${groupId}`), 'ดูและแก้ทีละใบ');
  assert.equal(Object.values(groups[0].group.kinds ?? {}).filter(kind => kind === 'expense').length, 6);
  // The webhook turns the kind button into the chat's command.
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../backend/src/handlers/line-webhook.ts', import.meta.url), 'utf8'), /ai:confirmkind:\(g\[A-Za-z0-9\]\{6,40\}\):\(income\|expense\|job\)/);
});

test('LINE: ยืนยันรายรับ saves only that kind and keeps the rest waiting; the answer says the rows in the sheet and opens them selected', async () => {
  const { lineGroupCommand } = await import('../backend/src/ai/lineBridge');
  const ids = [1, 2, 3].map(n => `p_${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`);
  const cards = ids.map((id, at) => ({ kind: 'confirm', id, title: at === 2 ? 'เพิ่มรายจ่าย' : 'เพิ่มงานใหม่ 1 งาน', changes: [{ label: 'งาน', value: `รายการ ${at + 1}` }] }));
  const user = { user_id: USER, notif_settings: { 'lineCardGroup:gabcdef123456': { cards, files: 0, at: NOW.toISOString(), kinds: { [ids[0]]: 'income', [ids[1]]: 'income', [ids[2]]: 'expense' } } } } as unknown as UserRow;
  const confirmed: string[] = [];
  let dropped = false;
  const messages = await lineGroupCommand(user, { action: 'confirm', groupId: 'gabcdef123456', kind: 'income' }, {
    now: NOW, drop: async () => { dropped = true; },
    confirm: async (_user, id) => { confirmed.push(id); const row = 6 + confirmed.length - 1;
      return { kind: 'add_job', sheet: { status: 'written', file: 'บัญชีร้าน', tab: 'รายรับ', row, url: `https://docs.google.com/spreadsheets/d/f/edit#gid=0&range=A${row}:H${row}` } }; },
  });
  assert.deepEqual(confirmed, ids.slice(0, 2), 'only the income cards');
  assert.equal(dropped, false, 'the expense still waits in the group');
  const text = JSON.stringify(messages);
  assert.match(text, /บันทึกรายรับแล้ว 2 รายการ/);
  assert.match(text, /ลงชีต บัญชีร้าน แท็บ รายรับ แถว 6–7/);
  assert.match(text, /"label":"ดูในชีต","uri":"https:\/\/docs.google.com\/spreadsheets\/d\/f\/edit#gid=0&range=A6:H7"/, 'the new rows open selected');
});

test('sheet: cards of one answer take rows one after another, each keeps its own write, and a range opens selected', async () => {
  process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret-not-real';
  const { planRow, withWrite, writeFor } = await import('../backend/src/services/sheetWrite');
  const { sheetRowUrl } = await import('../shared/googleSheets');
  const tab = { name: 'รายจ่าย', headerRow: 0, kind: 'expenses' as const, use: true, columns: [
    { index: 0, header: 'วันที่', target: 'date' as const }, { index: 1, header: 'รายการ', target: 'name' as const }, { index: 3, header: 'ยอดเงิน', target: 'amount' as const }] };
  const map = { fileId: 'file-12345678', at: '2026-11-12T03:00:00.000Z', tabs: [tab] };
  const sheet = [['วันที่', 'รายการ', '', 'ยอดเงิน'], ['1/11', 'กาแฟ', '', '60'], ['2/11', 'ค่ารถ', '', '40'], ['3/11', 'ค่าไฟ', '', '900'], ['4/11', 'ข้าว', '', '50']];
  let reads = 0;
  const ops = {
    async lastRow() { reads += 1; return sheet.length; },
    async readRows(_tab: string, from: number, to: number) { return sheet.slice(from - 1, to); },
    async formulaTexts() { return {}; }, async formulaColumns() { return new Set<number>(); },
  } as never;
  const shared = new Map();
  const rows = [];
  for (let at = 0; at < 3; at += 1) rows.push((await planRow(ops, map, 'expense', { name: `รายการ ${at}`, amount: 10, category: 'อื่นๆ', date: '2026-11-16' }, { offset: at, reads: shared }))!.row);
  assert.deepEqual(rows, [6, 7, 8], 'never row 6 three times');
  assert.equal(reads, 1, 'the tab is read once for all of them');
  let record = { email: 'a@b.c', enc: 'x'.repeat(30), at: NOW.toISOString(), file: { id: 'file-12345678', name: 'บัญชีร้าน', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' } } as Parameters<typeof withWrite>[0];
  for (const [at, id] of ['p_a', 'p_b', 'p_c'].entries()) record = withWrite(record, { proposalId: id, at: NOW.toISOString(), ok: true, fileId: 'file-12345678', tab: 'รายจ่าย', row: 6 + at, cells: [], gid: 7, span: 3 });
  assert.equal((writeFor(record, 'p_a', NOW.getTime()) as { row: number }).row, 6, 'the first card still knows its row after two more');
  assert.equal((writeFor(record, 'p_c', NOW.getTime()) as { row: number }).row, 8);
  assert.equal(sheetRowUrl('file-12345678', 7, 6, 3, 8), 'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=7&range=A6:D8');
});

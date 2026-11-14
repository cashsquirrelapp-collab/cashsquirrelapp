import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveCell, LiveTab } from '../shared/googleSheets';

// เลขาถามเรื่องชีตในแชท (owner, 2026-11-14: "ย้ายคำถามไปขึ้นในหน้าแชทเลขาเลย"): what เลขา says in its web chat after a sheet
// is picked, the tap-to-answer steps, and the hand-over from the Settings window (once, same account, two minutes).

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), {}),
  sessionStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); }, removeItem: (key: string) => { store.delete(key); } },
});

const { readTabs } = await import('../frontend/src/features/labs/sheetMap');
const { sheetSetupOf } = await import('../frontend/src/features/labs/sheetQuestions');
const { sheetIntroText, questionCard, chooseCard, cardQuestion, cardOptions, requestSheetAsk, takeSheetAsk, onSheetAsk } = await import('../frontend/src/features/labs/sheetAsk');

const cell = (text: string, extra: Partial<LiveCell> = {}): LiveCell => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text, text, ...extra });
const odd: LiveTab = { name: 'Income', truncated: false, rows: [
  [cell('วันที่โอน'), cell('Client'), cell('งาน'), cell('ค่าจ้าง (ก่อนหัก)'), cell('ภาษี 3%'), cell('โอนจริง'), cell('ZZ')],
  [cell('2/11/2569', { date: '2026-11-02' }), cell('บริษัท โกลว์อัพ จำกัด'), cell('ที่ปรึกษาคอนเทนต์'), cell('20,000'), cell('600', { formula: true }), cell('19,400', { formula: true }), cell('1/11/2569', { date: '2026-11-01' })],
] };
const plain: LiveTab = { name: 'รายจ่าย', truncated: false, rows: [
  [cell('วันที่'), cell('รายการ'), cell('หมวดหมู่'), cell('ยอดเงิน')],
  [cell('5/10/2569', { date: '2026-10-05' }), cell('ค่าเช่ากล้อง'), cell('อุปกรณ์'), cell('1,200')],
] };

test('sheet ask: เลขา says what it read, names the formula columns, then asks one question with ใช่ / ไม่ใช่', () => {
  const setup = sheetSetupOf(readTabs([odd]));
  assert.equal(sheetIntroText('งานลูกค้า 2569', setup), [
    'อ่านชีต **งานลูกค้า 2569** แล้วครับ เข้าใจเกือบหมด',
    'แท็บ Income เป็นงานและรายรับ',
    'ช่อง **ภาษี 3%** กับ **โอนจริง** ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้',
    'ขอถามข้อเดียวครับ',
  ].join('\n\n'));
  const card = questionCard('c_1', setup, 0, 'sheet-1')!;
  assert.equal(card.phase, 'confirm');
  assert.equal(cardQuestion(card), 'ช่อง "ZZ" คือวันที่ ใช่ไหมครับ');
  assert.deepEqual(cardOptions(card).map(option => option.label), ['ใช่', 'ไม่ใช่']);
  assert.equal(cardOptions(card)[0].target, 'date');
  // ไม่ใช่: the same column, asked what it is instead (ไม่ใช้ among the choices, never the guess again).
  const choose = chooseCard(card, 'sheet-2');
  assert.equal(cardQuestion(choose), 'แล้วช่อง "ZZ" คืออะไรครับ');
  const labels = cardOptions(choose).map(option => option.label);
  assert.ok(labels.includes('ไม่ใช้'));
  assert.ok(!cardOptions(choose).some(option => option.target === 'date'));
  assert.equal(questionCard('c_1', setup, 1, 'sheet-3')?.phase, 'go', 'after the last question nothing else is asked');
});

test('sheet ask: a sheet understood in full gets one ใช้ตามนี้; names cannot add Markdown of their own', () => {
  const setup = sheetSetupOf(readTabs([plain]));
  assert.match(sheetIntroText('บัญชี **ร้าน** [x](/jobs)', setup), /^อ่านชีต \*\*บัญชี ร้าน x \(\/jobs\)\*\* แล้วครับ เข้าใจทั้งหมด/);
  assert.match(sheetIntroText('บัญชี', setup), /ถ้าถูกต้อง กดใช้ตามนี้ได้เลยครับ$/);
  assert.match(sheetIntroText('ชีตบัญชี_ฟรีแลนซ์_2569', setup), /^อ่านชีต \*\*ชีตบัญชี_ฟรีแลนซ์_2569\*\* /, 'a file name keeps its underscores');
  const card = questionCard('c_2', setup, 0, 'sheet-1')!;
  assert.equal(card.phase, 'go');
  assert.deepEqual(cardOptions(card).map(option => option.label), ['ใช้ตามนี้']);
  assert.equal(questionCard('c_3', sheetSetupOf([]), 0, 'sheet-1'), null, 'no tab to read: no card, เลขา says where to choose');
});

test('sheet ask: the window hands over once, to the same account, within two minutes', () => {
  let heard = 0;
  const stop = onSheetAsk(() => { heard += 1; });
  requestSheetAsk('account-a', 'งานลูกค้า 2569');
  assert.equal(heard, 1, 'a chat already open hears it at once');
  assert.equal(takeSheetAsk('account-b'), null, 'another account never takes it');
  assert.deepEqual(takeSheetAsk('account-a'), { fileName: 'งานลูกค้า 2569' });
  assert.equal(takeSheetAsk('account-a'), null, 'taken once');
  requestSheetAsk('account-a', 'old');
  assert.equal(takeSheetAsk('account-a', Date.now() + 3 * 60_000), null, 'a stale hand-over is ignored');
  stop();
});

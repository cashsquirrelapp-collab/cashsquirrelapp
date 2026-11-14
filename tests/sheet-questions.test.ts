import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveCell, LiveTab } from '../shared/googleSheets';

// เลขาถามเรื่องชีต (owner, 2026-11-14: the column table was "ดูยาก"; approved: one line on the columns the sheet works out
// by itself, then only the questions เลขา is not sure of, ใช่ / ไม่ใช่; nothing asked when it understands everything).

const { readTabs, mapOf } = await import('../frontend/src/features/labs/sheetMap');
const { sheetSetupOf, answerColumn, OTHER_TARGETS } = await import('../frontend/src/features/labs/sheetQuestions');
const { headerScore } = await import('../frontend/src/features/import/sheetImport');

const cell = (text: string, extra: Partial<LiveCell> = {}): LiveCell => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text, text, ...extra });
const odd: LiveTab = { name: 'Income', truncated: false, rows: [
  [cell('วันที่โอน'), cell('Client'), cell('งาน'), cell('ค่าจ้าง (ก่อนหัก)'), cell('ภาษี 3%'), cell('โอนจริง'), cell('ZZ')],
  [cell('2/11/2569', { date: '2026-11-02' }), cell('บริษัท โกลว์อัพ จำกัด'), cell('ที่ปรึกษาคอนเทนต์'), cell('20,000'), cell('600', { formula: true }), cell('19,400', { formula: true }), cell('1/11/2569', { date: '2026-11-01' })],
  [cell('5/11/2569', { date: '2026-11-05' }), cell('คาเฟ่ลูมิน'), cell('ออกแบบโลโก้'), cell('5,000'), cell('0', { formula: true }), cell('5,000', { formula: true }), cell('3/11/2569', { date: '2026-11-03' })],
] };

test('sheet questions: the formula columns are named, only the column guessed from its values is asked', () => {
  const readings = readTabs([odd]);
  const setup = sheetSetupOf(readings);
  assert.deepEqual(setup.tabs, [{ name: 'Income', kind: 'jobs' }]);
  assert.deepEqual(setup.formulas, ['ภาษี 3%', 'โอนจริง']);
  assert.deepEqual(setup.questions.map(question => [question.header, question.target]), [['ZZ', 'date']]);
  // ไม่ใช่ → ไม่ใช้: saved as not used; the formula column stays marked.
  const answered = answerColumn(readings, setup.questions[0], 'ignore');
  const map = mapOf('file-12345678', answered);
  assert.equal(map.tabs[0].columns[6].target, 'ignore');
  assert.equal(map.tabs[0].columns[5].formula, true);
  assert.equal(sheetSetupOf(answered).questions.length, 0, 'an answered column is not asked again');
  assert.ok(OTHER_TARGETS.jobs.includes('ignore'));
});

test('sheet questions: a sheet read with confidence asks nothing; a saved map asks nothing', () => {
  const plain: LiveTab = { name: 'รายจ่าย', truncated: false, rows: [
    [cell('วันที่'), cell('รายการ'), cell('หมวดหมู่'), cell('ยอดเงิน')],
    [cell('5/10/2569', { date: '2026-10-05' }), cell('ค่าเช่ากล้อง'), cell('อุปกรณ์'), cell('1,200')],
  ] };
  assert.equal(sheetSetupOf(readTabs([plain])).questions.length, 0);
  const saved = mapOf('file-12345678', readTabs([odd]));
  assert.equal(sheetSetupOf(readTabs([odd], saved)).questions.length, 0, 'the person\'s saved map is not asked about');
});

test('a header with the rate in it ("ภาษี 3%", "หัก 3%", "WHT 3%") is the tax withheld', () => {
  for (const header of ['ภาษี 3%', 'หัก 3%', 'WHT 3%', 'หัก ณ ที่จ่าย 1.5%']) {
    assert.equal(headerScore(header, 'whtAmount'), 0.9, header);
    assert.equal(headerScore(header, 'whtRate'), 0, header);
  }
  assert.equal(headerScore('หัก ณ ที่จ่าย', 'whtAmount'), 1, 'the plain header is unchanged');
});

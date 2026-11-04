import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { addProgress, finishWork, progressLabel, startWork } from '../frontend/src/features/assistant/workSteps';
import { checkForAssistant, checkGrids, checkSpreadsheet, checkTables } from '../frontend/src/features/assistant/fileCheck';
import { templateRows } from '../frontend/src/features/import/importTemplate';
import { isAssistantProgress } from '../shared/assistantProgress';
import type { PreparedFile } from '../frontend/src/features/assistant/voice';

// The live steps (owner, 2026-11-04: "อยากให้มีสถานะบอกว่ากำลังทำไรด้วย แบบของ Claude หรือ GPT") and the file check
// ("ตรวจเช็คว่ามันถูกต้องไหม ... แม่นยำ 100%"): the check uses the import's own rules, so its figures are the ones the
// import saves. Synthetic files only.

test('the steps say what happens: the device reading the files first, then each step the server reports', () => {
  const sheet = { name: 'บัญชี.xlsx', kind: 'text', summary: 'Excel · 26 แถว', check: {} } as unknown as PreparedFile;
  const work = startWork([sheet, { name: 'สลิป.jpg', kind: 'image' } as PreparedFile], 1000);
  assert.deepEqual(work.steps.map(step => [step.label, step.done]), [
    ['อ่านไฟล์ บัญชี.xlsx · Excel · 26 แถว', true], ['ตรวจตัวเลขและเทียบยอดกับไฟล์', true], ['ดูรูป สลิป.jpg', true], ['ส่งให้เลขากระรอกวิเคราะห์', false]]);
  let next = addProgress(work, { kind: 'model', route: 'chat', round: 0, files: 2, web: false });
  next = addProgress(next, { kind: 'tool', name: 'search_jobs' });
  next = addProgress(next, { kind: 'tool', name: 'propose_add_job' });
  next = addProgress(next, { kind: 'tool', name: 'propose_add_job' });
  next = addProgress(next, { kind: 'tool', name: 'propose_add_job' });
  assert.deepEqual(next.steps.slice(4).map(step => [step.label, step.done, step.count]), [
    ['อ่านไฟล์และวิเคราะห์', true, 1], ['ค้นงานในบัญชี', true, 1], ['เตรียมการ์ดเพิ่มงาน', false, 3]]);
  assert.deepEqual(finishWork(next, 13_500), { steps: next.steps.map(step => ({ label: step.label, count: step.count })), ms: 12_500 });
  // Steps are shown only for heavy work (owner, 2026-11-04): files, cards being prepared, a web search, a hand-over.
  assert.equal(work.heavy, true);
  const quick = addProgress(addProgress(startWork([], 0), { kind: 'model', route: 'chat', round: 0, files: 0, web: false }), { kind: 'tool', name: 'search_jobs' });
  assert.equal(quick.heavy, false);
  assert.equal(addProgress(quick, { kind: 'tool', name: 'propose_add_job' }).heavy, true);
  assert.equal(addProgress(quick, { kind: 'model', route: 'chat', round: 0, files: 0, web: true }).heavy, true);
  assert.equal(addProgress(quick, { kind: 'model', route: 'action', round: 1, files: 0, web: false }).heavy, true);
  // Without files: the question goes over, then the analysis; a web search and a second look say so.
  assert.equal(startWork([]).steps[0].label, 'ส่งคำถามให้เลขากระรอก');
  assert.equal(progressLabel({ kind: 'model', route: 'chat', round: 0, files: 0, web: false }), 'วิเคราะห์คำถาม');
  assert.equal(progressLabel({ kind: 'model', route: 'chat', round: 0, files: 0, web: true }), 'ค้นข้อมูลจากเว็บไซต์ที่เชื่อถือได้');
  assert.equal(progressLabel({ kind: 'model', route: 'action', round: 1, files: 0, web: false }), 'เตรียมรายการที่จะบันทึก');
  assert.equal(progressLabel({ kind: 'tool', name: 'something_new' }), 'ดูข้อมูลในบัญชี');
  // What the server may send is checked before it is shown.
  assert.equal(isAssistantProgress({ kind: 'tool', name: 'search_jobs' }), true);
  assert.equal(isAssistantProgress({ kind: 'tool', name: '<script>' }), false);
  assert.equal(isAssistantProgress({ kind: 'model', route: 'chat', round: 0, files: 0 }), false);
});

function template(): { file: File; data: ArrayBuffer } {
  const { jobs, expenses, help } = templateRows();
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(jobs), 'งาน');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(expenses), 'รายจ่าย');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(help), 'วิธีกรอก');
  const out = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { file: new File([out], 'ไฟล์ตัวอย่างนำเข้า_กระรอก.xlsx'), data: out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer };
}

test('the app\'s own sample file: the import\'s figures, paid / not due / overdue, and the file itself to import', () => {
  const { file, data } = template();
  const check = checkSpreadsheet(XLSX, data, file, '2026-11-04')!;
  // The file as read goes with the check, for the review in the chat to plan against the account's own rows.
  assert.deepEqual([check.source!.fileName, check.source!.grids.map(grid => grid.name)], ['ไฟล์ตัวอย่างนำเข้า_กระรอก.xlsx', ['งาน', 'รายจ่าย', 'วิธีกรอก']]);
  assert.deepEqual({ ...check, importFile: check.importFile?.name, source: undefined }, { source: undefined,
    tabs: 2, rows: 5, columns: 16, jobs: 3, value: 25_000, received: 7_850, pending: 16_760, paid: 1, notDue: 0, overdue: 2,
    expenses: 2, expenseTotal: 2_290, toLook: 0, totals: { compared: 0, agree: 0 }, importFile: 'ไฟล์ตัวอย่างนำเข้า_กระรอก.xlsx' });
  const words = checkForAssistant(check);
  assert.match(words, /^แอปตรวจไฟล์นี้ด้วยระบบนำเข้าแล้ว: งาน 3 รายการ มูลค่ารวม 25,000 บาท รับแล้ว 7,850 ค้างรับ 16,760 \(รับครบ 1 · ยังไม่ถึงกำหนด 0 · เกินกำหนด 2\) · รายจ่าย 2 รายการ รวม 2,290 บาท/);
  assert.match(words, /การ์ด "ตรวจไฟล์"[^]*กด "บันทึก" ในแชตได้เลย[^]*ห้ามแนะนำให้ไปหน้าอื่น/);
});

test('a tab\'s own total row is compared with the rows read', () => {
  const grid = (total: number) => ({ name: 'งาน', rows: [['ชื่องาน', 'ลูกค้า', 'มูลค่างาน', 'สถานะ'], ['ออกแบบ', 'ร้าน ก', '5000', 'จ่ายแล้ว'], ['ตัดต่อ', 'ร้าน ข', '3000', 'ยังไม่จ่าย'], ['รวม', '', String(total), '']]
    .map(row => row.map(text => ({ raw: text, text }))) });
  assert.deepEqual(checkGrids([grid(8000)], '2026-11-04')!.totals, { compared: 1, agree: 1 });
  assert.deepEqual(checkGrids([grid(9000)], '2026-11-04')!.totals, { compared: 1, agree: 0 });
});

test('a Word table that lists jobs is checked and goes to the import as a CSV; other files get no check', () => {
  const check = checkTables([[['สรุป'], ['x']], [['รายการ', 'ลูกค้า', 'ยอดเงิน', 'สถานะ'], ['ออกแบบโลโก้', 'ร้าน ก', '5,000', 'จ่ายแล้ว'], ['ตัดต่อ', 'ร้าน ข', '3,000', 'ยังไม่จ่าย']]], 'บันทึก.docx', '2026-11-04')!;
  assert.equal(check.jobs, 2);
  assert.equal(check.value, 8_000);
  assert.equal(check.importFile!.name, 'บันทึก (ตาราง).csv');
  assert.equal(checkTables([[['ชื่อ', 'เบอร์'], ['ก', '1']]], 'a.docx', '2026-11-04'), undefined);
  const notes = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(notes, XLSX.utils.aoa_to_sheet([['หัวข้อประชุม'], ['คุยเรื่องแผนงาน'], ['สรุปงานเดือนหน้า']]), 'บันทึก');
  const out = XLSX.write(notes, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  assert.equal(checkSpreadsheet(XLSX, out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer, new File([out], 'notes.xlsx'), '2026-11-04'), undefined);
});

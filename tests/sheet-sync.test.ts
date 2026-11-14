import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveCell, LiveTab } from '../shared/googleSheets';
import { sheetRowUrl } from '../shared/googleSheets';
import type { Job, StatusOption } from '../shared/types';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs; owner, 2026-11-14: the sheet is the database, "ทำเลย ตามแผนทั้งหมด"): each job row
// of the customer's sheet becomes a job in the app linked to its row; rows that move stay the same job; a job เลขา already
// saved in the app is linked, never added twice; only what the sheet says is taken from it; nothing is deleted.

const { readTabs, mapOf } = await import('../frontend/src/features/labs/sheetMap');
const { planSheetSync } = await import('../frontend/src/features/labs/sheetSync');

const cell = (text: string, extra: Partial<LiveCell> = {}): LiveCell => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text || null, text, ...extra });
const day = (text: string, iso: string) => cell(text, { date: iso });
const HEAD = ['วันที่ส่งงาน', 'ชื่อโปรเจกต์', 'ลูกค้า', 'ค่าจ้าง', 'หัก ณ ที่จ่าย', 'รับแล้ว', 'วันที่โอน', 'หมายเหตุ'].map(text => cell(text));
const ROWS: LiveCell[][] = [
  [day('20/10/2569', '2026-10-20'), cell('ถ่ายภาพงานแต่ง'), cell('คุณมายด์'), cell('15,000'), cell('0'), cell('0'), cell(''), cell('ลูกค้าขอเลื่อนโอน')],
  [day('3/11/2569', '2026-11-03'), cell('ออกแบบโลโก้ร้านกาแฟ'), cell('คาเฟ่ลูมิน'), cell('5,000'), cell('0'), cell('5,000'), day('5/11/2569', '2026-11-05'), cell('')],
  [day('10/11/2569', '2026-11-10'), cell('ตัดต่อคลิปรีวิวคาเฟ่ EP.3'), cell('คุณยอร์ช'), cell('3,000'), cell('0'), cell('0'), cell(''), cell('')],
];
const TOTAL = [cell('รวม'), cell(''), cell(''), cell('23,000'), cell('0'), cell('5,000'), cell(''), cell('')];
const tab = (rows: LiveCell[][]): LiveTab => ({ name: 'รายรับ', gid: 812, truncated: false, rows: [HEAD, ...rows] });
const FILE = 'file-12345678';
const STATUSES: StatusOption[] = [
  { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
  { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
  { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
];
const map = mapOf(FILE, readTabs([tab(ROWS)]));
const sync = (jobs: Job[], rows: LiveCell[][]) => planSheetSync({ jobs, tabs: [tab(rows)], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14' });
let next = 0;
const apply = (jobs: Job[], changes: ReturnType<typeof sync>): Job[] => {
  const updates = new Map(changes.update.map(update => [update.id, update.fields]));
  return [...changes.add.map(job => ({ ...job, id: `j${++next}` }) as Job), ...jobs.map(job => (updates.has(job.id) ? { ...job, ...updates.get(job.id) } : job))];
};

test('sheet sync: the map reads the sheet; each job row becomes a job linked to its row, the total row is left out', () => {
  const targets = map.tabs[0].columns.map(column => column.target);
  assert.deepEqual(targets.slice(1, 4), ['name', 'client', 'value']);
  assert.equal(map.tabs[0].gid, 812, 'the tab id is kept in the map');
  const first = sync([], [...ROWS, TOTAL]);
  assert.equal(first.rows, 3);
  assert.equal(first.add.length, 3);
  assert.deepEqual(first.add.map(job => [job.name, job.sheetLink?.row, job.sheetLink?.gid]), [
    ['ถ่ายภาพงานแต่ง', 2, 812], ['ออกแบบโลโก้ร้านกาแฟ', 3, 812], ['ตัดต่อคลิปรีวิวคาเฟ่ EP.3', 4, 812],
  ]);
  const logo = first.add[1];
  assert.equal(logo.value, 5000);
  assert.equal(logo.received, 5000, 'รับแล้ว read as received');
});

test('sheet sync: read again, nothing changes; a row inserted above moves the links, never adds the jobs again', () => {
  const jobs = apply([], sync([], ROWS));
  const again = sync(jobs, ROWS);
  assert.deepEqual([again.add.length, again.update.length], [0, 0], 'same sheet, same jobs');
  const inserted = [[day('1/10/2569', '2026-10-01'), cell('งานเก่าที่เพิ่งใส่'), cell('ร้านเอ'), cell('1,000'), cell('0'), cell('1,000'), day('1/10/2569', '2026-10-01'), cell('')], ...ROWS];
  const moved = sync(jobs, inserted);
  assert.equal(moved.add.length, 1, 'only the new row is new');
  assert.equal(moved.add[0].name, 'งานเก่าที่เพิ่งใส่');
  assert.deepEqual(moved.update.map(update => [jobs.find(job => job.id === update.id)!.name, update.fields.sheetLink?.row]), [
    ['ถ่ายภาพงานแต่ง', 3], ['ออกแบบโลโก้ร้านกาแฟ', 4], ['ตัดต่อคลิปรีวิวคาเฟ่ EP.3', 5],
  ]);
});

test('sheet sync: an amount edited in the sheet updates the job; a job saved by เลขา is linked, not added twice', () => {
  const jobs = apply([], sync([], ROWS));
  const edited = ROWS.map((row, index) => (index === 2 ? [row[0], row[1], row[2], cell('3,500'), ...row.slice(4)] : row));
  const changes = sync(jobs, edited);
  assert.equal(changes.add.length, 0);
  assert.equal(changes.update.length, 1);
  assert.equal(changes.update[0].fields.value, 3500);

  const saved: Job = { id: 'chat-1', name: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3', client: 'คุณยอร์ช', value: 3000, received: 0, pending: 3000, status: 'pending', type: '', creditTerm: 30, note: '', payDate: '2026-12-10' };
  const linked = sync([saved], ROWS);
  assert.equal(linked.add.length, 2, 'the other two rows are new');
  const link = linked.update.find(update => update.id === 'chat-1')!;
  assert.deepEqual(link.fields.sheetLink, { fileId: FILE, tab: 'รายรับ', row: 4, gid: 812 });
  assert.equal(link.fields.payDate, undefined, 'the sheet has no due date column: the app keeps its own');
});

test('sheet sync: a row deleted from the sheet marks its job missing; the job stays in the app', () => {
  const jobs = apply([], sync([], ROWS));
  const changes = sync(jobs, ROWS.slice(0, 2));
  assert.equal(changes.missing, 1);
  assert.equal(changes.add.length, 0);
  const gone = changes.update.find(update => update.fields.sheetLink?.missing)!;
  assert.equal(jobs.find(job => job.id === gone.id)!.name, 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3');
  const after = apply(jobs, changes);
  assert.equal(after.length, 3, 'nothing deleted');
  assert.equal(sync(after, ROWS.slice(0, 2)).update.length, 0, 'marked once');
});

test('sheet sync: a sheet without payment columns leaves payment as the app has it', () => {
  const head = ['วันที่', 'งาน', 'ลูกค้า', 'ราคา'].map(text => cell(text));
  const plain: LiveTab = { name: 'Jobs', gid: 0, truncated: false, rows: [head, [day('2/11/2569', '2026-11-02'), cell('โมชันกราฟิก'), cell('ซันเดย์'), cell('12,000')]] };
  const plainMap = mapOf(FILE, readTabs([plain]));
  const run = (jobs: Job[], value = '12,000') => planSheetSync({ jobs, tabs: [{ ...plain, rows: [head, [plain.rows[1][0], plain.rows[1][1], plain.rows[1][2], cell(value)]] }], map: plainMap, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14' });
  const [job] = apply([], run([]));
  const paidInApp = { ...job, received: 6000, pending: 6000, status: 'partial', paymentStatus: 'partial' };
  assert.equal(run([paidInApp]).update.length, 0, 'the received 6,000 recorded in the app is not undone');
  const raised = run([paidInApp], '14,000').update[0].fields;
  assert.equal(raised.value, 14000);
  assert.equal(raised.pending, 8000, 'still owed follows the new amount');
  assert.equal(raised.received, undefined);
});

test('ดูในชีต: the address opens the tab with the row selected', () => {
  assert.equal(sheetRowUrl(FILE, 812, 4, 7), 'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=812&range=A4:H4');
  assert.equal(sheetRowUrl(FILE, 0), 'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=0');
  assert.equal(sheetRowUrl(FILE, undefined, 4), 'https://docs.google.com/spreadsheets/d/file-12345678/edit');
});

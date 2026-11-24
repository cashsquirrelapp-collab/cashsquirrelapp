import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveCell, LiveTab } from '../shared/googleSheets';
import { sheetRowUrl } from '../shared/googleSheets';
import type { Job, SheetSeen, StatusOption } from '../shared/types';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs; owner, 2026-11-14: the sheet is the database, "ทำเลย ตามแผนทั้งหมด"): each job row
// of the customer's sheet becomes a job in the app linked to its row; rows that move stay the same job; a job เลขา already
// saved in the app is linked, never added twice; only what the sheet says is taken from it; nothing is deleted.

const { readTabs, mapOf } = await import('../frontend/src/features/labs/sheetMap');
const { planSheetSync, writtenSig } = await import('../frontend/src/features/labs/sheetSync');

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
const sync = (jobs: Job[], rows: LiveCell[][], seen?: SheetSeen) => planSheetSync({ jobs, tabs: [tab(rows)], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14', seen });
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
  assert.deepEqual({ ...link.fields.sheetLink, sig: undefined }, { fileId: FILE, tab: 'รายรับ', row: 4, gid: 812, sig: undefined });
  assert.equal(link.fields.payDate, undefined, 'the sheet has no due date column: the app keeps its own');
});

// Owner, 2026-11-18: "ถ้ากูลบใน Google Sheet ออก ยอดในโปรแกรมก็ต้องออก".
test('sheet sync: a row deleted from the sheet deletes its job in the app; many gone at once wait for the person; rows past a long read are never gone', () => {
  const jobs = apply([], sync([], ROWS));
  const changes = sync(jobs, ROWS.slice(0, 2));
  assert.deepEqual([changes.gone, changes.remove.length, changes.held.length, changes.missing, changes.add.length], [1, 1, 0, 0, 0]);
  assert.equal(jobs.find(job => job.id === changes.remove[0])!.name, 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3');
  // Eleven of twelve rows gone at one reading (a tab cleared by mistake, a read gone wrong): nothing removed, they wait.
  const many = Array.from({ length: 12 }, (_, i) => [day('1/11/2569', '2026-11-01'), cell(`งานที่ ${i + 1}`), cell('ร้านเอ'), cell(String(1000 + i)), cell('0'), cell('0'), cell(''), cell('')]);
  const lots = apply([], sync([], many));
  const cleared = sync(lots, many.slice(0, 1));
  assert.deepEqual([cleared.remove.length, cleared.gone, cleared.held.length, cleared.missing], [0, 0, 11, 11]);
  assert.equal(cleared.update.filter(update => update.fields.sheetLink?.missing).length, 11, 'marked, so the line can ask');
  // A long tab read only in part: the jobs of rows past the part read are not gone.
  const part = planSheetSync({ jobs, tabs: [{ ...tab(ROWS.slice(0, 1)), truncated: true }], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14' });
  assert.deepEqual([part.remove.length, part.held.length, part.missing], [0, 0, 0]);
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

// Owner, 2026-11-17: "ทำไมยอดเงินกูมันขึ้นมาเหมือนเดิมอีกแล้ว ... กูไม่ได้กรอกแล้วมันดันขึ้นมาเอง": a job deleted in the app
// came back from its row at the next reading, so the totals came back.
test('sheet sync: a job deleted in the app is never taken back from its row, on any device; a new row with the same words still is', () => {
  const first = sync([], ROWS);
  assert.ok(first.seen, 'the rows taken are counted');
  const seen: SheetSeen = { fileId: FILE, jobs: first.seen! };
  const jobs = apply([], first);
  const deleted = jobs.filter(job => job.name !== 'ออกแบบโลโก้ร้านกาแฟ');
  const again = sync(deleted, ROWS, seen);
  assert.deepEqual([again.add.length, again.skipped, again.seen], [0, 1, null], 'the deleted job stays deleted, nothing to save');
  // The same job twice in the sheet (a monthly retainer): the second row is new, and is taken.
  const twice = sync(deleted, [...ROWS, ROWS[1]], seen);
  assert.deepEqual([twice.add.length, twice.skipped], [1, 1]);
  assert.equal(twice.add[0].sheetLink?.row, 5, 'the new row, not the deleted one');
  // Changed in the sheet afterwards: the sheet says something new, so it is taken.
  const edited = ROWS.map(row => (row[1].text === 'ออกแบบโลโก้ร้านกาแฟ' ? [row[0], row[1], row[2], cell('6,500'), ...row.slice(4)] : row));
  assert.equal(sync(deleted, edited, seen).add.length, 1);
  // Another sheet connected: its own counts.
  assert.equal(sync(deleted, ROWS, { fileId: 'another-file', jobs: first.seen! }).add.length, 1);
});

test('sheet sync: the template\'s example rows are never taken; a job taken from one before is removed; a note mentioning a sample is not an example', () => {
  const example = [day('5/2/2569', '2026-02-05'), cell('รีวิวสินค้า 2 คลิป'), cell('บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)'), cell('40,000'), cell('1,200'), cell('38,800'), cell(''), cell('')];
  const withExample = [...ROWS, example];
  const first = sync([], withExample);
  assert.deepEqual([first.add.length, first.rows], [3, 3]);
  assert.ok(!first.add.some(job => job.name === 'รีวิวสินค้า 2 คลิป'));
  const jobs = apply([], first);
  const takenBefore = { ...jobs[0], id: 'old-example', name: 'รีวิวสินค้า 2 คลิป', client: 'บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)', value: 40000, sheetLink: { fileId: FILE, tab: 'รายรับ', row: 5, gid: 812 } } as Job;
  const cleaned = sync([...jobs, takenBefore], withExample);
  assert.deepEqual(cleaned.remove, ['old-example']);
  assert.equal(cleaned.missing, 0, 'removed, not marked missing');
  // The example row deleted from the sheet already: the job taken from it still goes.
  assert.deepEqual(sync([...jobs, takenBefore], ROWS).remove, ['old-example']);
  const noted = [...ROWS, [day('12/11/2569', '2026-11-12'), cell('ถ่ายรูปเมนูใหม่'), cell('คาเฟ่ลูมิน'), cell('2,000'), cell('0'), cell('0'), cell(''), cell('ส่ง (ตัวอย่าง) ให้ลูกค้าดูก่อน')]];
  assert.equal(sync(jobs, noted).add.length, 1);
});

test('sheet sync: a row the app wrote a moment ago is never added; it is linked once its record arrives, and counted only then', () => {
  const jobs = apply([], sync([], ROWS.slice(0, 2)));
  // Row 4 was just written for a job saved in LINE that has not reached this screen yet.
  const early = planSheetSync({ jobs, tabs: [tab(ROWS)], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14', recentRows: [{ tab: 'รายรับ', row: 4 }] });
  assert.deepEqual([early.add.length, early.skipped], [0, 0], 'not added, not counted as deleted in the app');
  // The record arrives (not linked yet): the row is linked to it, not added beside it.
  const arrived = { ...jobs[0], id: 'from-line', name: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3', client: 'คุณยอร์ช', value: 3000, sheetLink: undefined } as Job;
  const later = planSheetSync({ jobs: [...jobs, arrived], tabs: [tab(ROWS)], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14',
    seen: early.seen ? { fileId: FILE, jobs: early.seen } : undefined, recentRows: [{ tab: 'รายรับ', row: 4 }] });
  assert.equal(later.add.length, 0);
  assert.equal(later.update.find(update => update.id === 'from-line')?.fields.sheetLink?.row, 4);
  // Never arrived and three minutes passed: the row is taken like any new row.
  const orphan = planSheetSync({ jobs, tabs: [tab(ROWS)], map, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-14', seen: early.seen ? { fileId: FILE, jobs: early.seen } : undefined });
  assert.equal(orphan.add.length, 1);
});

// Owner, 2026-11-18: "อัปเดตให้หมดด้วยให้มันทุกตรงทุกละเอียดทุกนิ้วให้มันตรง": the sheet won every reading, so a job paid
// through LINE went back to unpaid. Each linked job keeps a fingerprint of what the two last agreed on.
test('sheet sync: whichever side changed since they last agreed wins; the app\'s change is written over the row, never undone', () => {
  const first = apply([], sync([], ROWS));
  const signed = apply(first, sync(first, ROWS));
  const logo = signed.find(job => job.name === 'ออกแบบโลโก้ร้านกาแฟ')!;
  assert.ok(logo.sheetLink?.sig, 'agreed: fingerprinted');
  assert.deepEqual(sync(signed, ROWS).update, [], 'nothing changed anywhere: nothing to do');
  // Changed in the app only (the amount, from LINE): pushed to its row, not taken back from the sheet.
  const edited = signed.map(job => (job.id === logo.id ? { ...job, value: 6500, pending: 6500 } : job));
  const pushed = sync(edited, ROWS);
  assert.deepEqual(pushed.push, [{ id: logo.id, before: { kind: 'job', fileId: FILE, tab: 'รายรับ', row: 3, name: 'ออกแบบโลโก้ร้านกาแฟ', amount: 5000 } }]);
  assert.equal(pushed.update.find(update => update.id === logo.id)?.fields.value, undefined, 'the app keeps 6,500');
  // Changed in the sheet only: the app takes it.
  const sheetEdited = ROWS.map(row => (row[1].text === 'ออกแบบโลโก้ร้านกาแฟ' ? [row[0], row[1], row[2], cell('7,000'), ...row.slice(4)] : row));
  const pulled = sync(signed, sheetEdited);
  assert.equal(pulled.update.find(update => update.id === logo.id)?.fields.value, 7000);
  assert.deepEqual(pulled.push, []);
  // Both changed: the sheet, the master, wins.
  assert.equal(sync(edited, sheetEdited).update.find(update => update.id === logo.id)?.fields.value, 7000);
  // Linked before fingerprints: the sheet's values once, as before.
  const legacy = edited.map(job => (job.id === logo.id ? { ...job, sheetLink: { ...job.sheetLink!, sig: undefined } } : job));
  assert.equal(sync(legacy, ROWS).update.find(update => update.id === logo.id)?.fields.value, 5000);
});

// Owner, 2026-11-24: "แก้ไขในเว็บหรือชีต … ลิ้งกันโดยไม่เด้งกลับ". A write from the app left the link with no fingerprint, so a
// change made again before the next reading (in LINE, on another device) was undone by the sheet's older values.
test('sheet sync: after the app wrote a row, a later change in the app is written again, never undone; agreeing signs the link', () => {
  const first = apply([], sync([], ROWS));
  const signed = apply(first, sync(first, ROWS));
  const logo = signed.find(job => job.name === 'ออกแบบโลโก้ร้านกาแฟ')!;
  // The web form changed the amount to 6,500 and wrote it over row 3 (App.tsx writeToSheet): the link keeps what it wrote.
  const written = { ...logo, value: 6500, pending: 1500 };
  const afterWrite = signed.map(job => (job.id === logo.id ? { ...written, sheetLink: { fileId: FILE, tab: 'รายรับ', row: 3, gid: 812, wrote: writtenSig('job', written) } } : job));
  const sheetWritten = ROWS.map(row => (row[1].text === 'ออกแบบโลโก้ร้านกาแฟ' ? [row[0], row[1], row[2], cell('6,500'), ...row.slice(4)] : row));
  // Then LINE changed it to 8,000 before any reading, and the reading still sees 6,500 in the row: the app's 8,000 is written.
  const again = afterWrite.map(job => (job.id === logo.id ? { ...job, value: 8000, pending: 3000 } : job));
  const plan = sync(again, sheetWritten);
  assert.equal(plan.push.find(item => item.id === logo.id)?.before.amount, 6500, 'the app\'s 8,000 goes over the row');
  const update = plan.update.find(item => item.id === logo.id);
  assert.equal(update?.fields.value, undefined, 'the app keeps 8,000');
  assert.equal(update?.fields.sheetLink?.wrote ?? afterWrite.find(job => job.id === logo.id)!.sheetLink!.wrote, writtenSig('job', written), 'still waiting for its write');
  // Nothing changed since the write and the row agrees: signed with a fingerprint, the wait is over.
  const agreed = sync(afterWrite, sheetWritten).update.find(item => item.id === logo.id)!;
  assert.ok(agreed.fields.sheetLink?.sig);
  assert.equal(agreed.fields.sheetLink?.wrote, undefined);
  // Nothing changed in the app since its write but someone edited the row afterwards: the sheet's value is taken.
  const sheetLater = ROWS.map(row => (row[1].text === 'ออกแบบโลโก้ร้านกาแฟ' ? [row[0], row[1], row[2], cell('9,000'), ...row.slice(4)] : row));
  assert.equal(sync(afterWrite, sheetLater).update.find(item => item.id === logo.id)?.fields.value, 9000);
});

// Owner, 2026-11-18: "ยอดเป็นไรทำไมไม่ตรงกันอีก": งานของ กยศ, received 3,000, had its payment date cleared by a reading of a
// row whose วันที่รับเงิน was empty, so the overview counted it in no month.
test('sheet sync: a paid row with no payment date never clears the app\'s date; a paid job with none takes its delivery date, written into the row', () => {
  const head = ['วันที่รับเงิน', 'ผู้จ่ายเงิน', 'รายการ', 'ยอดก่อนหัก', 'เงินเข้าจริง (คำนวณ)'].map(text => cell(text));
  const income = (rows: LiveCell[][]): LiveTab => ({ name: 'รายรับ', gid: 9, truncated: false, rows: [head, ...rows] });
  const row = (date: string) => [date ? day(date, date.split('/').reverse().join('-')) : cell(''), cell('กยศ'), cell('งานของ กยศ'), cell('3,000'), cell('3,000', { formula: true })];
  const plainMap = mapOf(FILE, readTabs([income([row('18/11/2026')])]));
  const run = (jobs: Job[], date: string) => planSheetSync({ jobs, tabs: [income([row(date)])], map: plainMap, fileId: FILE, statuses: STATUSES, jobTypes: [], today: '2026-11-18' });
  const base = { id: 'kys', name: 'งานของ กยศ', client: 'กยศ', type: 'ยังไม่ระบุ', note: '', value: 3000, received: 3000, pending: 0, status: 'done', paymentStatus: 'paid', creditTerm: 0,
    postDate: '2026-11-18', sheetLink: { fileId: FILE, tab: 'รายรับ', row: 2, gid: 9 } } as unknown as Job;
  // The app knows when it was paid; the row is empty there: the app's date stays, and is written into the row.
  const dated = run([{ ...base, payDate: '2026-11-16' }], '');
  const kept = dated.update.find(update => update.id === 'kys')?.fields ?? {};
  if ((dated.add.length) === 0) assert.ok(!('payDate' in kept) || kept.payDate === '2026-11-16', 'never cleared');
  assert.deepEqual(dated.push.map(item => item.id), ['kys'], 'the row gets the date');
  // No date anywhere (as in the owner's account): the delivery date, so the money lands in November.
  const none = run([{ ...base, payDate: null } as unknown as Job], '');
  assert.equal(none.update.find(update => update.id === 'kys')?.fields.payDate, '2026-11-18');
  assert.deepEqual(none.push.map(item => item.id), ['kys']);
  // A new row typed into the sheet paid but undated: dated the day the app first sees it.
  assert.equal(run([], '').add[0].payDate, '2026-11-18');
  // The row has its date: nothing to repair, nothing to write.
  const fine = run([{ ...base, payDate: '2026-11-18' }], '18/11/2026');
  assert.deepEqual(fine.push, []);
  assert.equal(fine.update.find(update => update.id === 'kys')?.fields.payDate, undefined);
});

test('ดูในชีต: the address opens the tab with the row selected', () => {
  assert.equal(sheetRowUrl(FILE, 812, 4, 7), 'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=812&range=A4:H4');
  assert.equal(sheetRowUrl(FILE, 0), 'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=0');
  assert.equal(sheetRowUrl(FILE, undefined, 4), 'https://docs.google.com/spreadsheets/d/file-12345678/edit');
});

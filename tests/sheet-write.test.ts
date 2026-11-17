import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { SheetMap, SheetMapTab } from '../shared/googleSheets';
import { chooseTab, dataColumns, dateFor, displayValue, rowCells, statusFor } from '../shared/sheetRow';

// บันทึกลงชีตของคุณ (ฟีเจอร์ทดลอง sheetWrite, owner 2026-11-12: "บันทึกผ่านเลขากระรอกแชท ในไลน์ได้ ในแชทกระรอกในเว็บได้";
// "ลงชีต + ในแอปด้วย"). A confirmed job or expense becomes one row of the customer's sheet, by the confirmed sheet map:
// formula columns are left to the sheet, the next empty row is found from the data columns, a missing formula is copied
// from the row above, and a sheet problem never costs the app's save.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-not-real';
process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');

const { planRow, writeRow, previewOf, writeFor, deleteRecordRows, writeRowsBatch, writeOverRow, recentRowsOf } = await import('../backend/src/services/sheetWrite');
const { googleOps } = await import('../backend/src/services/googleSheets');
const { confirmProposal } = await import('../backend/src/ai/service');
type SheetOps = import('../backend/src/services/googleSheets').SheetOps;

const INCOME: SheetMapTab = { name: 'รายรับ', headerRow: 2, kind: 'jobs', use: true, columns: [
  { index: 0, header: 'วันที่', target: 'date' },
  { index: 1, header: 'ลูกค้า', target: 'client' },
  { index: 2, header: 'รายการ', target: 'name' },
  { index: 3, header: 'ยอดก่อนหัก', target: 'value' },
  { index: 4, header: 'หัก %', target: 'whtRate' },
  { index: 5, header: 'ภาษีหัก', target: 'whtAmount', formula: true },
  { index: 6, header: 'สถานะ', target: 'status' },
  { index: 7, header: 'หมายเหตุ', target: 'keep' },
] };
const SPENT: SheetMapTab = { name: 'รายจ่าย', headerRow: 0, kind: 'expenses', use: true, columns: [
  { index: 0, header: 'วันที่', target: 'date' }, { index: 1, header: 'รายการ', target: 'name' },
  { index: 2, header: 'หมวด', target: 'category' }, { index: 3, header: 'ยอดเงิน', target: 'amount' },
] };
const MAP: SheetMap = { fileId: 'file-12345678', at: '2026-11-12T03:00:00.000Z', tabs: [INCOME, { ...SPENT, use: false }, SPENT] };
const JOB = { id: 'job-1', name: 'ถ่ายรูปสินค้า', client: 'บริษัท ก', type: 'ถ่ายภาพ', value: 10000, received: 0, pending: 9700, status: 'pending', creditTerm: 30, postDate: '2026-11-12', payDate: '2026-12-12', whtRate: 3, note: '' };
const EXPENSE = { id: 'exp-1', name: 'ค่าเช่ากล้อง', category: 'ค่าอุปกรณ์/ซอฟต์แวร์', amount: 1200, date: '2026-11-12' };

test('sheet row: the tab is the first counted one of the kind; mapped columns get values, formulas and kept columns none', () => {
  assert.equal(chooseTab(MAP, 'job')?.name, 'รายรับ');
  assert.equal(chooseTab(MAP, 'expense')?.name, 'รายจ่าย');
  assert.equal(chooseTab({ ...MAP, tabs: [INCOME] }, 'expense'), null);
  assert.equal(chooseTab({ ...MAP, tabs: [{ ...SPENT, kind: 'mixed' }] }, 'job')?.name, 'รายจ่าย', 'a mixed tab takes both');
  const cells = rowCells(INCOME, 'job', JOB, { 4: ['3%'], 6: ['ได้รับเงินแล้ว', 'รอโอน'] });
  assert.deepEqual(cells.map(cell => cell.value), ['2026-11-12', 'บริษัท ก', 'ถ่ายรูปสินค้า', 10000, '3%', null, 'รอโอน', null]);
  assert.equal(cells[5].formula, true);
  assert.deepEqual(dataColumns(INCOME), [0, 1, 2, 3, 4, 6]);
  assert.deepEqual(rowCells(SPENT, 'expense', EXPENSE).map(cell => cell.value), ['2026-11-12', 'ค่าเช่ากล้อง', 'ค่าอุปกรณ์/ซอฟต์แวร์', 1200]);
});

test('sheet row: dates follow the column (Thai Buddhist-year text stays text), status words follow the column', () => {
  assert.equal(dateFor('2026-11-12', ['3/10/2569']), "'12/11/2569");
  assert.equal(dateFor('2026-11-12', ['03/10/2026', '']), '2026-11-12');
  assert.equal(statusFor('paid', ['Paid', 'Unpaid']), 'Paid');
  assert.equal(statusFor('unpaid', ['Paid', 'Unpaid']), 'Unpaid');
  assert.equal(statusFor('partial', []), 'มัดจำแล้ว');
  assert.equal(displayValue("'12/11/2569"), '12/11/2569');
  assert.equal(displayValue('2026-11-12'), '12/11/2569');
  assert.equal(displayValue(1234.5), '1,234.5');
  assert.equal(displayValue(null), '');
});

function fakeOps(sheet: Record<string, string[][]>, formulas: Record<string, Set<string>> = {}, formulaText: Record<string, Record<string, string>> = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const ops: SheetOps = {
    async lastRow(tab, columns) { calls.push({ op: 'lastRow', args: [tab, columns] }); const rows = sheet[tab]; let last = 0; rows.forEach((row, index) => { if (columns.some(column => (row[column] ?? '') !== '')) last = index + 1; }); return last; },
    async readRows(tab, from, to) { calls.push({ op: 'readRows', args: [tab, from, to] }); return sheet[tab].slice(from - 1, to); },
    async formulaColumns(tab, row, columns) { return new Set(columns.filter(column => formulas[tab]?.has(`${row}:${column}`))); },
    async write(tab, row, cells) { calls.push({ op: 'write', args: [tab, row, cells] }); return cells.map(cell => `${tab}!${cell.index}${row}`); },
    async copyFormulas(tab, from, to, columns) { calls.push({ op: 'copy', args: [tab, from, to, columns] }); return columns.map(column => `${tab}!${column}${to}`); },
    async clear(tab, cells) { calls.push({ op: 'clear', args: [tab, cells] }); },
    async deleteRows(tab, rows) { calls.push({ op: 'deleteRows', args: [tab, rows] }); },
    async writeMany(tab, cells) { calls.push({ op: 'writeMany', args: [tab, cells] }); return cells.map(cell => `${tab}!${cell.index}${cell.row}`); },
    async copyFormulasDown(tab, from, first, last, columns) { calls.push({ op: 'copyDown', args: [tab, from, first, last, columns] }); },
    async tabId(tab) { return tab === 'รายจ่าย' ? 7 : 0; },
    async formulaTexts(tab, row, columns) { return Object.fromEntries(columns.filter(column => formulas[tab]?.has(`${row}:${column}`)).map(column => [column, formulaText[tab]?.[`${row}:${column}`] ?? '=1'])); },
  };
  return { ops, calls };
}

test('sheet write: the row goes under the last data row (formula-only rows do not count), formulas are copied when missing', async () => {
  const sheet = { รายรับ: [
    ['รายรับปี 2569'], [], ['วันที่', 'ลูกค้า', 'รายการ', 'ยอดก่อนหัก', 'หัก %', 'ภาษีหัก', 'สถานะ'],
    ['3/10/2569', 'บริษัท ข', 'ตัดต่อ', '5,000', '3%', '150', 'ได้รับเงินแล้ว'],
    ['', '', '', '', '', '0', ''], // a row only the sheet's formulas fill
  ] };
  const { ops, calls } = fakeOps(sheet, { รายรับ: new Set(['4:5']) });
  const plan = (await planRow(ops, MAP, 'job', JOB))!;
  assert.equal(plan.tab, 'รายรับ');
  assert.equal(plan.row, 5, 'row 5: under row 4, the last with data');
  assert.equal(plan.cells[0].value, "'12/11/2569", 'the column writes Buddhist-year text');
  assert.deepEqual(plan.before.map(item => item.row), [4]);
  const cells = await writeRow(ops, plan);
  const copy = calls.find(call => call.op === 'copy')!;
  assert.deepEqual(copy.args, ['รายรับ', 4, 5, [5]], 'the withholding formula copied from row 4');
  const write = calls.find(call => call.op === 'write')!;
  assert.deepEqual((write.args[2] as { index: number }[]).map(cell => cell.index), [0, 1, 2, 3, 4, 6], 'never the formula column, never the kept one');
  assert.ok(cells.includes('รายรับ!55'), 'undo knows the copied formula too');
  const preview = previewOf(plan, { name: 'บัญชีร้าน', url: 'https://docs.google.com/spreadsheets/d/x/edit' });
  assert.equal(preview.cells[5], null);
  assert.equal(preview.columns[5].letter, 'F');
  assert.equal(preview.cells[0], '12/11/2569');
});

test('สูตรของลูกค้า: the preview shows what the sheet\'s formula will make of the new row, and where it differs from the app', async () => {
  const sheet = { รายรับ: [
    ['รายรับปี 2569'], [], ['วันที่', 'ลูกค้า', 'รายการ', 'ยอดก่อนหัก', 'หัก %', 'ภาษีหัก', 'สถานะ'],
    ['3/10/2569', 'บริษัท ข', 'ตัดต่อ', '5,000.00', '3%', '150.00', 'ได้รับเงินแล้ว'],
  ] };
  // F4 holds =D4*3% (the rate written into the formula, not read from E): copied down it becomes =D5*3%.
  const { ops } = fakeOps(sheet, { รายรับ: new Set(['4:5']) }, { รายรับ: { '4:5': '=D4*3%' } });
  const plan = (await planRow(ops, MAP, 'job', JOB))!;
  assert.deepEqual(plan.computed, { 5: 300 });
  const preview = previewOf(plan, { name: 'บัญชีร้าน', url: 'https://docs.google.com/spreadsheets/d/x/edit' });
  assert.equal(preview.cells[5], null, 'never typed');
  assert.equal(preview.computed[5], '300.00', 'shown the way the column shows money');
  assert.deepEqual(preview.differs, [], 'the app withholds 3% too: nothing to say');
  // A job the app does not withhold on: the sheet\'s formula still takes 3%, and the card says so.
  const noWht = (await planRow(ops, MAP, 'job', { ...JOB, whtRate: 0 }))!;
  assert.deepEqual(previewOf(noWht, { name: 'บัญชีร้าน', url: 'x' }).differs, [{ header: 'ภาษีหัก', sheet: '300.00', app: '0.00' }]);
  // A formula the reader cannot follow stays "คำนวณเอง".
  const lookup = fakeOps(sheet, { รายรับ: new Set(['4:5']) }, { รายรับ: { '4:5': "=VLOOKUP(B4,'ลูกค้า'!A:C,3,FALSE)*D4" } });
  const unknown = (await planRow(lookup.ops, MAP, 'job', JOB))!;
  assert.equal(previewOf(unknown, { name: 'บัญชีร้าน', url: 'x' }).computed[5], null);
});

test('sheet write: an empty tab starts right under the header; a map without a tab for the record writes nothing', async () => {
  const { ops } = fakeOps({ รายจ่าย: [['วันที่', 'รายการ', 'หมวด', 'ยอดเงิน']] });
  assert.equal((await planRow(ops, MAP, 'expense', EXPENSE))!.row, 2);
  assert.equal(await planRow(ops, { ...MAP, tabs: [SPENT] }, 'job', JOB), null);
});

test('google: the row is typed as a person would, formulas copied with the sheet tool, cells cleared on undo', async () => {
  const calls: { url: string; body?: unknown }[] = [];
  const original = globalThis.fetch;
  const answers: unknown[] = [
    { valueRanges: [{ values: [['หัว', 'a', 'b', '']] }, { values: [['หัว', 'x']] }] },
    { spreadsheetId: 'x' },
    { sheets: [{ properties: { sheetId: 77, title: 'รายรับ' } }] },
    {},
    {},
  ];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(answers.shift() ?? {}), { status: 200 });
  }) as typeof fetch;
  try {
    const ops = googleOps('tok', 'file-12345678');
    assert.equal(await ops.lastRow('รายรับ', [0, 1]), 3);
    assert.match(decodeURIComponent(calls[0].url), /majorDimension=COLUMNS/);
    assert.deepEqual(await ops.write('รายรับ', 5, [{ index: 0, value: '2026-11-12' }, { index: 3, value: 10000 }]), ["'รายรับ'!A5", "'รายรับ'!D5"]);
    assert.deepEqual(calls[1].body, { valueInputOption: 'USER_ENTERED', data: [{ range: "'รายรับ'!A5", values: [['2026-11-12']] }, { range: "'รายรับ'!D5", values: [[10000]] }] });
    await ops.copyFormulas('รายรับ', 4, 5, [5]);
    assert.deepEqual((calls[3].body as { requests: unknown[] }).requests[0], { copyPaste: {
      source: { sheetId: 77, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 5, endColumnIndex: 6 },
      destination: { sheetId: 77, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 5, endColumnIndex: 6 }, pasteType: 'PASTE_FORMULA' } });
    await ops.clear('รายรับ', ["'รายรับ'!A5"]);
    assert.match(calls[4].url, /values:batchClear$/);
  } finally { globalThis.fetch = original; }
});

test('the card after ยืนยัน: written, failed, or another card\'s write; undo only within 30 minutes and on the same file', () => {
  const file = { id: 'file-12345678', name: 'บัญชีร้าน', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
  const at = '2026-11-12T03:00:00.000Z';
  const record = { email: 'a@example.com', enc: 'x'.repeat(40), at, file, map: MAP, lastWrite: { proposalId: 'p_1', at, ok: true, fileId: file.id, tab: 'รายรับ', row: 5, cells: ['A5'] } };
  assert.deepEqual(writeFor(record, 'p_1', Date.parse(at) + 60_000), { status: 'written', file: 'บัญชีร้าน', url: file.url, tab: 'รายรับ', row: 5, canUndo: true });
  // Kept with the tab's id and the last column: ดูในชีต opens the tab with the very row selected.
  const deep = { ...record, lastWrite: { ...record.lastWrite!, gid: 7, span: 6 } };
  assert.equal(writeFor(deep, 'p_1', Date.parse(at) + 60_000)!.status === 'written' && (writeFor(deep, 'p_1', Date.parse(at) + 60_000) as { url: string }).url,
    'https://docs.google.com/spreadsheets/d/file-12345678/edit#gid=7&range=A5:G5');
  assert.equal(writeFor(record, 'p_1', Date.parse(at) + 31 * 60_000)!.status === 'written' && (writeFor(record, 'p_1', Date.parse(at) + 31 * 60_000) as { canUndo: boolean }).canUndo, false);
  assert.equal(writeFor(record, 'p_2'), null);
  assert.deepEqual(writeFor({ ...record, lastWrite: { proposalId: 'p_1', at, ok: false, error: 'Google ไม่ตอบกลับ' } }, 'p_1'), { status: 'failed', error: 'Google ไม่ตอบกลับ' });
  assert.equal((writeFor({ ...record, file: { ...file, id: 'other-file-1234' } }, 'p_1', Date.parse(at)) as { canUndo: boolean }).canUndo, false);
});

const USER = '44444444-4444-4444-8444-444444444444';
function confirmDb(writeSheet?: (...args: unknown[]) => Promise<unknown>) {
  const proposals = new Map<string, Record<string, unknown>>();
  const sheetCalls: unknown[][] = [];
  const db = {
    async claimProposal(_: string, id: string) { const row = proposals.get(id); if (!row || row.status !== 'pending') return null; row.status = 'applying'; return row; },
    async finishProposal(_: string, id: string, status: string) { const row = proposals.get(id); if (row) row.status = status; },
    async applyChanges() { return true; },
    async memories() { return []; },
    async remember() {},
    ...(writeSheet ? { writeSheet: async (...args: unknown[]) => { sheetCalls.push(args); return writeSheet(...args); } } : {}),
  };
  const add = (id: string, kind: string, record: Record<string, unknown> | null, jobId = 'exp-1') => proposals.set(id, { id, userId: USER, kind, jobId, record, title: 'เพิ่มรายจ่าย', changes: [], createdAt: Date.now(), baseVersion: null, status: 'pending' });
  return { db: db as never, add, sheetCalls };
}

test('confirm: a new expense goes into the app and the sheet; a sheet failure keeps the app save; edits never touch the sheet', async () => {
  const written = { status: 'written', file: 'บัญชีร้าน', url: 'https://docs.google.com/x', tab: 'รายจ่าย', row: 2 };
  const ok = confirmDb(async () => written);
  ok.add('p_00000000-0000-4000-8000-000000000001', 'add_expense', EXPENSE);
  const done = await confirmProposal(ok.db, USER, 'p_00000000-0000-4000-8000-000000000001');
  assert.equal(done.status, 'applied');
  assert.deepEqual(done.sheet, written);
  assert.deepEqual(ok.sheetCalls[0], [USER, 'p_00000000-0000-4000-8000-000000000001', 'expense', EXPENSE]);

  const broken = confirmDb(async () => { throw new Error('google down'); });
  broken.add('p_00000000-0000-4000-8000-000000000002', 'add_expense', EXPENSE);
  const kept = await confirmProposal(broken.db, USER, 'p_00000000-0000-4000-8000-000000000002');
  assert.equal(kept.status, 'applied', 'the app save stands');
  assert.equal(kept.sheet, undefined);

  const edit = confirmDb(async () => written);
  edit.add('p_00000000-0000-4000-8000-000000000003', 'edit_expense', EXPENSE);
  await confirmProposal(edit.db, USER, 'p_00000000-0000-4000-8000-000000000003').catch(() => undefined);
  assert.equal(edit.sheetCalls.length, 0);

  const off = confirmDb();
  off.add('p_00000000-0000-4000-8000-000000000004', 'add_expense', EXPENSE);
  assert.equal((await confirmProposal(off.db, USER, 'p_00000000-0000-4000-8000-000000000004')).sheet, undefined, 'no sheet ready: nothing said');
});

// Owner, 2026-11-17: "ถ้ากูลบโปรเจกต์นั้นออกแล้วใน Google Sheet ก็ต้องลบออกด้วยดิ".
test('deleted in the app, deleted in the sheet: the linked row when it still is the record, else the moved row nearest it; never a header, never a guess', async () => {
  const sheet = { รายรับ: [
    ['รายรับปี 2569'], [], ['วันที่', 'ลูกค้า', 'รายการ', 'ยอดก่อนหัก', 'หัก %', 'ภาษีหัก', 'สถานะ'],
    ['3/10/2569', 'บริษัท ข', 'ตัดต่อ', '5,000', '3%', '150', 'ได้รับเงินแล้ว'],
    ['5/10/2569', 'บริษัท ค', 'ถ่ายรูปสินค้า', '฿12,000.00', '3%', '360', 'รอโอน'],
    ['7/10/2569', 'บริษัท ง', 'ตัดต่อ', '8,000', '3%', '240', 'รอโอน'],
  ], รายจ่าย: [['วันที่', 'รายการ', 'หมวด', 'ยอดเงิน'], ['1/11/2569', 'ค่าเช่ากล้อง', 'อุปกรณ์', '1,200']] };
  const row = (over: Partial<{ kind: 'job' | 'expense'; tab: string; row: number; name: string; amount: number }>) =>
    ({ kind: 'job' as const, fileId: MAP.fileId, tab: 'รายรับ', row: 5, name: 'ถ่ายรูปสินค้า', amount: 12000, ...over });
  // Where it was linked.
  let { ops, calls } = fakeOps(sheet);
  assert.deepEqual(await deleteRecordRows(ops, MAP, [row({})]), { deleted: 1, notFound: 0 });
  assert.deepEqual(calls.find(call => call.op === 'deleteRows')!.args, ['รายรับ', [5]]);
  // A row was inserted above since: the same name and amount one row down.
  ({ ops, calls } = fakeOps(sheet));
  assert.deepEqual(await deleteRecordRows(ops, MAP, [row({ row: 4, name: 'ตัดต่อ', amount: 8000 })]), { deleted: 1, notFound: 0 });
  assert.deepEqual(calls.find(call => call.op === 'deleteRows')!.args, ['รายรับ', [6]], 'row 4 is ตัดต่อ 5,000, not this one: the 8,000 one');
  // Same name, other amount, nowhere else: nothing is deleted.
  ({ ops, calls } = fakeOps(sheet));
  assert.deepEqual(await deleteRecordRows(ops, MAP, [row({ row: 9, name: 'ตัดต่อ', amount: 999 })]), { deleted: 0, notFound: 1 });
  assert.equal(calls.some(call => call.op === 'deleteRows'), false);
  // The header row is never a record row, even when named like one.
  ({ ops, calls } = fakeOps(sheet));
  assert.deepEqual(await deleteRecordRows(ops, MAP, [row({ row: 3, name: 'รายการ', amount: 0 })]), { deleted: 0, notFound: 1 });
  // Two at once, an expense too: each tab once, its own rows.
  ({ ops, calls } = fakeOps(sheet));
  const both = await deleteRecordRows(ops, MAP, [row({}), row({ row: 6, name: 'ตัดต่อ', amount: 8000 }), row({ kind: 'expense', tab: 'รายจ่าย', row: 2, name: 'ค่าเช่ากล้อง', amount: 1200 })]);
  assert.deepEqual(both, { deleted: 3, notFound: 0 });
  assert.deepEqual(calls.filter(call => call.op === 'deleteRows').map(call => call.args), [['รายรับ', [5, 6]], ['รายจ่าย', [2]]]);
});

test('confirm: a delete card of a record taken from the sheet deletes its row too; a sheet failure keeps the delete; other cards never delete rows', async () => {
  const { deletedRowOf } = await import('../shared/sheetRow');
  const job = { id: 'job-7', name: 'ถ่ายรูปสินค้า', value: 12000, sheetLink: { fileId: MAP.fileId, tab: 'รายรับ', row: 5, gid: 0 } };
  const sheetRow = deletedRowOf('job', job)!;
  assert.deepEqual(sheetRow, { kind: 'job', fileId: MAP.fileId, tab: 'รายรับ', row: 5, name: 'ถ่ายรูปสินค้า', amount: 12000 });
  assert.equal(deletedRowOf('job', { ...job, sheetLink: { ...job.sheetLink, missing: true } }), null, 'a row already gone is not looked for');
  assert.equal(deletedRowOf('expense', { id: 'e', name: 'x', amount: 1 }), null);
  const run = async (kind: string, record: Record<string, unknown> | null, deleteSheetRows?: (...args: unknown[]) => Promise<unknown>) => {
    const calls: unknown[][] = [];
    const proposal = { id: 'p_00000000-0000-4000-8000-000000000009', userId: USER, kind, jobId: 'job-7', record, title: 'ลบงาน 1 งาน', changes: [], createdAt: Date.now(), baseVersion: 3, status: 'pending' };
    const db = {
      async claimProposal() { return proposal.status === 'pending' ? (proposal.status = 'applying', proposal) : null; },
      async finishProposal(_: string, __: string, status: string) { proposal.status = status; },
      async applyChanges() { return true; }, async memories() { return []; }, async remember() {},
      ...(deleteSheetRows ? { deleteSheetRows: async (...args: unknown[]) => { calls.push(args); return deleteSheetRows(...args); } } : {}),
    };
    const result = await confirmProposal(db as never, USER, proposal.id);
    return { result, calls };
  };
  const ok = await run('delete_job', { sheetRow }, async () => ({ deleted: 1, notFound: 0 }));
  assert.equal(ok.result.status, 'applied');
  assert.deepEqual(ok.calls, [[USER, [sheetRow]]]);
  const broken = await run('delete_job', { sheetRow }, async () => { throw new Error('google down'); });
  assert.equal(broken.result.status, 'applied', 'the delete in the app stands');
  assert.equal((await run('delete_job', null, async () => ({ deleted: 1, notFound: 0 }))).calls.length, 0, 'not from the sheet: no row');
  assert.equal((await run('delete_job', { sheetRow: { ...sheetRow, row: 'five' } }, async () => ({ deleted: 1, notFound: 0 }))).calls.length, 0, 'a malformed row is never used');
});

// Owner, 2026-11-18: older records copied into the sheet, an Excel import's too, in one go.
test('many records in one go: under the last data row, every value in one write, the formula columns copied down once', async () => {
  const sheet = { รายรับ: [
    ['รายรับปี 2569'], [], ['วันที่', 'ลูกค้า', 'รายการ', 'ยอดก่อนหัก', 'หัก %', 'ภาษีหัก', 'สถานะ'],
    ['3/10/2569', 'บริษัท ข', 'ตัดต่อ', '5,000', '3%', '150', 'ได้รับเงินแล้ว'],
  ] };
  const { ops, calls } = fakeOps(sheet, { รายรับ: new Set(['4:5']) });
  const second = { ...JOB, name: 'ออกแบบโปสเตอร์', value: 3000 };
  const written = await writeRowsBatch(ops, MAP, 'job', [JOB, second]);
  assert.deepEqual(written, { tab: 'รายรับ', rows: [5, 6] });
  assert.deepEqual(calls.find(call => call.op === 'copyDown')!.args, ['รายรับ', 4, 5, 6, [5]], 'the withholding formula from row 4 down over 5 and 6');
  const many = calls.filter(call => call.op === 'writeMany');
  assert.equal(many.length, 1, 'one write for every value');
  const cells = many[0].args[1] as { row: number; index: number; value: unknown }[];
  assert.deepEqual([...new Set(cells.map(cell => cell.row))], [5, 6]);
  assert.ok(!cells.some(cell => cell.index === 5 || cell.index === 7), 'never the formula column, never the kept one');
  assert.equal(cells.find(cell => cell.row === 6 && cell.index === 2)!.value, 'ออกแบบโปสเตอร์');
  assert.equal(calls.filter(call => call.op === 'write' || call.op === 'copy').length, 0, 'no row-by-row requests');
  assert.equal(await writeRowsBatch(ops, { ...MAP, tabs: [INCOME] }, 'expense', [EXPENSE]), null, 'no tab for expenses: nothing written');
});

test('a changed record over its own row: the values the sheet keeps, never its formulas; recent rows of this file only', async () => {
  const sheet = { รายรับ: [
    ['รายรับปี 2569'], [], ['วันที่', 'ลูกค้า', 'รายการ', 'ยอดก่อนหัก', 'หัก %', 'ภาษีหัก', 'สถานะ'],
    ['3/10/2569', 'บริษัท ข', 'ตัดต่อ', '5,000', '3%', '150', 'ได้รับเงินแล้ว'],
  ] };
  const { ops, calls } = fakeOps(sheet);
  await writeOverRow(ops, MAP, 'job', { ...JOB, name: 'ตัดต่อ', value: 5500 }, { tab: 'รายรับ', row: 4 }, { first: 4, rows: sheet.รายรับ.slice(3) });
  const write = calls.find(call => call.op === 'write')!;
  assert.equal(write.args[1], 4);
  const cells = write.args[2] as { index: number; value: unknown }[];
  assert.ok(cells.some(cell => cell.index === 3 && cell.value === 5500));
  assert.ok(!cells.some(cell => cell.index === 5), 'the formula column is left to the sheet');
  const now = Date.parse('2026-11-18T03:00:00Z');
  const record = { email: 'x', enc: 'y'.repeat(20), at: '', file: { id: 'file-1', name: 'n', url: 'https://docs.google.com/x' }, recentRows: [
    { fileId: 'file-1', tab: 'รายรับ', row: 9, at: '2026-11-18T02:59:00Z' },
    { fileId: 'file-1', tab: 'รายรับ', row: 3, at: '2026-11-18T02:50:00Z' },
    { fileId: 'file-2', tab: 'รายรับ', row: 4, at: '2026-11-18T02:59:30Z' },
  ] };
  assert.deepEqual(recentRowsOf(record as never, now), [{ tab: 'รายรับ', row: 9 }], 'the last three minutes, this file');
});

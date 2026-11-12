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

const { planRow, writeRow, previewOf, writeFor } = await import('../backend/src/services/sheetWrite');
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

function fakeOps(sheet: Record<string, string[][]>, formulas: Record<string, Set<string>> = {}) {
  const calls: { op: string; args: unknown[] }[] = [];
  const ops: SheetOps = {
    async lastRow(tab, columns) { calls.push({ op: 'lastRow', args: [tab, columns] }); const rows = sheet[tab]; let last = 0; rows.forEach((row, index) => { if (columns.some(column => (row[column] ?? '') !== '')) last = index + 1; }); return last; },
    async readRows(tab, from, to) { calls.push({ op: 'readRows', args: [tab, from, to] }); return sheet[tab].slice(from - 1, to); },
    async formulaColumns(tab, row, columns) { return new Set(columns.filter(column => formulas[tab]?.has(`${row}:${column}`))); },
    async write(tab, row, cells) { calls.push({ op: 'write', args: [tab, row, cells] }); return cells.map(cell => `${tab}!${cell.index}${row}`); },
    async copyFormulas(tab, from, to, columns) { calls.push({ op: 'copy', args: [tab, from, to, columns] }); return columns.map(column => `${tab}!${column}${to}`); },
    async clear(tab, cells) { calls.push({ op: 'clear', args: [tab, cells] }); },
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

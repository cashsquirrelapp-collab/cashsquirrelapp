import test from 'node:test';
import assert from 'node:assert/strict';
import type { LiveCell, LiveTab } from '../shared/googleSheets';
import type { Expense } from '../shared/types';

// รายจ่ายจากชีต (owner, 2026-11-14: "ทำดึงรายจ่ายจากชีตต่อเลย"), the same way as the jobs: each expense row of the sheet's
// expense tab becomes an expense in the app linked to its row; rows that move stay the same expense; an expense เลขา already
// saved (and wrote to the sheet) is linked, never added twice; only what the tab has a column for is taken; rows the import
// leaves out (no amount, the total) and rows the sheet marks personal stay out; nothing is deleted.

const { readTabs, mapOf } = await import('../frontend/src/features/labs/sheetMap');
const { planSheetExpenseSync, planSheetSync } = await import('../frontend/src/features/labs/sheetSync');

const cell = (text: string, extra: Partial<LiveCell> = {}): LiveCell => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : text || null, text, ...extra });
const day = (text: string, iso: string) => cell(text, { date: iso });
const HEAD = ['วันที่', 'รายการ', 'หมวดหมู่', 'จำนวนเงิน', 'หมายเหตุ'].map(text => cell(text));
const ROWS: LiveCell[][] = [
  [day('2/11/2569', '2026-11-02'), cell('ค่าเช่าอุปกรณ์ถ่ายทำ'), cell('อุปกรณ์'), cell('3,500'), cell('กล้องและไฟ')],
  [day('5/11/2569', '2026-11-05'), cell('ค่าเดินทางไปกองถ่าย'), cell('เดินทาง'), cell('420'), cell('')],
  [day('9/11/2569', '2026-11-09'), cell('ค่าโฆษณาเพจ'), cell('การตลาด'), cell('1,200'), cell('')],
];
const TOTAL = [cell(''), cell('รวม'), cell(''), cell('5,120'), cell('')];
const expenseTab = (rows: LiveCell[][]): LiveTab => ({ name: 'รายจ่าย', gid: 905, truncated: false, rows: [HEAD, ...rows] });
const FILE = 'file-12345678';
const map = mapOf(FILE, readTabs([expenseTab(ROWS)]));
const sync = (expenses: Expense[], rows: LiveCell[][]) => planSheetExpenseSync({ expenses, tabs: [expenseTab(rows)], map, fileId: FILE, today: '2026-11-14' });
let next = 0;
const apply = (expenses: Expense[], changes: ReturnType<typeof sync>): Expense[] => {
  const updates = new Map(changes.update.map(update => [update.id, update.fields]));
  return [...changes.add.map(expense => ({ ...expense, id: `e${++next}` }) as Expense), ...expenses.map(expense => (updates.has(expense.id) ? { ...expense, ...updates.get(expense.id) } : expense))];
};

test('expense sync: the map reads the expense tab; each row becomes an expense linked to its row, the total row is left out', () => {
  assert.equal(map.tabs[0].kind, 'expenses');
  const first = sync([], [...ROWS, TOTAL]);
  assert.equal(first.rows, 3);
  assert.deepEqual(first.add.map(expense => [expense.name, expense.amount, expense.date, expense.sheetLink?.row, expense.sheetLink?.gid]), [
    ['ค่าเช่าอุปกรณ์ถ่ายทำ', 3500, '2026-11-02', 2, 905], ['ค่าเดินทางไปกองถ่าย', 420, '2026-11-05', 3, 905], ['ค่าโฆษณาเพจ', 1200, '2026-11-09', 4, 905],
  ]);
  assert.equal(first.add[0].note, 'กล้องและไฟ');
  // The jobs reading leaves an expense tab alone (each page reads its own rows).
  assert.equal(planSheetSync({ jobs: [], tabs: [expenseTab(ROWS)], map, fileId: FILE, statuses: [], jobTypes: [], today: '2026-11-14' }).rows, 0);
});

test('expense sync: read again, nothing changes; a row inserted above moves the links, never adds them again', () => {
  const expenses = apply([], sync([], ROWS));
  const again = sync(expenses, ROWS);
  assert.deepEqual([again.add.length, again.update.length], [0, 0]);
  const inserted = [[day('1/11/2569', '2026-11-01'), cell('ค่าอินเทอร์เน็ต'), cell('ค่าใช้จ่ายประจำ'), cell('599'), cell('')], ...ROWS];
  const moved = sync(expenses, inserted);
  assert.equal(moved.add.length, 1);
  assert.equal(moved.add[0].name, 'ค่าอินเทอร์เน็ต');
  assert.deepEqual(moved.update.map(update => update.fields.sheetLink?.row), [3, 4, 5], 'the three expenses follow their rows');
});

test('expense sync: a change in the sheet changes the expense; one เลขา saved is linked, not added twice', () => {
  const expenses = apply([], sync([], ROWS));
  const edited = ROWS.map((row, at) => (at === 1 ? [row[0], row[1], row[2], cell('480'), row[4]] : row));
  const change = sync(expenses, edited);
  assert.equal(change.add.length, 0);
  assert.deepEqual(change.update.map(update => update.fields), [{ amount: 480 }]);

  // Saved in เลขา's chat (and written to the sheet): the same name and amount, no link yet.
  const saved: Expense = { id: 'from-chat', name: 'ค่าโฆษณาเพจ', category: 'Marketing', amount: 1200, date: '2026-11-09' };
  const linked = sync([saved], ROWS.slice(2));
  assert.equal(linked.add.length, 0, 'never added twice');
  assert.equal(linked.update[0].id, 'from-chat');
  assert.deepEqual(linked.update[0].fields.sheetLink, { fileId: FILE, tab: 'รายจ่าย', row: 2, gid: 905 });
});

test('expense sync: without a category or date column the app keeps its own; a row gone is marked, never deleted', () => {
  const head = ['รายการ', 'จำนวนเงิน'].map(text => cell(text));
  const plain: LiveTab = { name: 'ค่าใช้จ่าย', gid: 7, truncated: false, rows: [head, [cell('ค่ากาแฟลูกค้า'), cell('180')], [cell('ค่าหมึกพิมพ์'), cell('350')]] };
  const plainMap = mapOf(FILE, readTabs([plain]));
  const mine: Expense = { id: 'mine', name: 'ค่ากาแฟลูกค้า', category: 'Other', amount: 180, date: '2026-11-03', sheetLink: { fileId: FILE, tab: 'ค่าใช้จ่าย', row: 2, gid: 7 } };
  const read = planSheetExpenseSync({ expenses: [mine], tabs: [plain], map: plainMap, fileId: FILE, today: '2026-11-14' });
  assert.equal(read.update.length, 0, 'the app\'s category and date stay');
  assert.equal(read.add.length, 1);

  const expenses = apply([], sync([], ROWS));
  const gone = sync(expenses, ROWS.slice(0, 2));
  assert.equal(gone.missing, 1);
  assert.deepEqual(gone.update.map(update => update.fields.sheetLink?.missing), [true]);
  assert.equal(apply(expenses, gone).length, 3, 'nothing is deleted on the app\'s side');
});

test('expense sync: rows the sheet marks personal and rows with no amount stay out', () => {
  const head = ['วันที่', 'รายการ', 'จำนวนเงิน', 'ธุรกิจ/ส่วนตัว'].map(text => cell(text));
  const tab: LiveTab = { name: 'รายจ่าย', gid: 905, truncated: false, rows: [head,
    [day('2/11/2569', '2026-11-02'), cell('ค่าเช่าสตูดิโอ'), cell('2,000'), cell('ธุรกิจ')],
    [day('3/11/2569', '2026-11-03'), cell('ค่าข้าวครอบครัว'), cell('650'), cell('ส่วนตัว')],
    [day('4/11/2569', '2026-11-04'), cell('ค่าที่จอดรถ'), cell(''), cell('ธุรกิจ')],
  ] };
  const tabMap = mapOf(FILE, readTabs([tab]));
  const read = planSheetExpenseSync({ expenses: [], tabs: [tab], map: tabMap, fileId: FILE, today: '2026-11-14' });
  assert.deepEqual(read.add.map(expense => expense.name), ['ค่าเช่าสตูดิโอ']);
  assert.equal(read.add[0].note, '', 'the business / personal column is not written into the note');
});

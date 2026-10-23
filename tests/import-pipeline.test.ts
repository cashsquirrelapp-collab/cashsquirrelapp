import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  analyzeSheet, buildImportPlan, compareMetrics, defaultIncluded, needsConfirmation, planDetails, planTotals, splitSideBySide,
  type ImportPlan, type ImportRow, type SheetCell, type SheetGrid,
} from '../frontend/src/features/import/sheetImport.ts';
import { fileFingerprint, fileKind, readWorkbook } from '../frontend/src/features/import/readWorkbook.ts';
import { applyFields, carriesBatch, recentImports, undoUpdate } from '../frontend/src/features/import/importBatches.ts';
import { csvCell, jobsCsvText } from '../frontend/src/utils.ts';
import { validateChanges } from '../shared/validation.ts';
import type { Expense, Job } from '../shared/types.ts';

// The import pipeline end to end on the owner's two test workbooks (2026-10-22; every person, company
// and amount in them is fictional): read -> match -> reconcile -> commit -> re-import -> export.
// The files' own Dashboards are the reference; nothing here adjusts an amount to make a test pass.

const statuses = [
  { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' as const },
  { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' as const },
  { id: 'installment', label: 'แบ่งชำระเป็นงวด', behavior: 'partial' as const },
  { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' as const },
];
const today = '2026-10-22';
const SOLO = 'solo_freelancer_september_2026.xlsx';
const PERSONAL = 'personal_finance_september_2026.xlsx';

const bytesOf = (file: string) => { const b = readFileSync(new URL(`./fixtures/import/${file}`, import.meta.url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const gridsOf = (data: ArrayBuffer, name: string) => readWorkbook(XLSX, data, name).filter(g => g.rows.some(r => r.some(c => c.text))).flatMap(splitSideBySide);
const on = (row: ImportRow) => row.kind !== 'skip' && (row.state === 'ready' || row.state === 'check');

/** Runs the import as the window does: default tabs ticked, only rows that need no confirmation. */
function plan(grids: SheetGrid[], fingerprint: string, existing: { jobs: Job[]; expenses: Expense[] } = { jobs: [], expenses: [] }, fileName = SOLO) {
  const sheets = grids.map(grid => ({ grid, analysis: analyzeSheet(grid) })).filter(s => defaultIncluded(s.analysis));
  const result = buildImportPlan(sheets, { amountsAreNet: false, today, source: { fileName, fingerprint } },
    { statuses, jobTypes: [], existingJobs: existing.jobs, existingExpenses: existing.expenses }, grids);
  return { result, totals: planTotals(result.rows, on), details: planDetails(result.rows, on) };
}

/** What the app saves for the chosen rows: ids, the batch and where each row came from. */
function save(result: ImportPlan, batchId = 'batch-1', at = '2026-10-22T10:00:00.000Z') {
  const link = (row: ImportRow) => { const { cells: _cells, ...source } = row.source!; return source; };
  const chosen = result.rows.filter(row => on(row) && !row.update);
  return {
    jobs: chosen.filter(r => r.job).map((r, i) => ({ ...r.job!, id: `${batchId}-j${i}`, importBatchId: batchId, importedAt: at, lastActivityAt: at, importSource: link(r) }) as unknown as Job),
    expenses: chosen.filter(r => r.expense).map((r, i) => ({ ...r.expense!, id: `${batchId}-e${i}`, importBatchId: batchId, importedAt: at, importSource: link(r) }) as unknown as Expense),
  };
}

const sheetRows = (grids: SheetGrid[], name: string) => {
  const grid = grids.find(g => g.name === name)!;
  const [header, ...body] = grid.rows;
  return body.filter(row => row.some(c => c.text)).map(row => Object.fromEntries(header.map((h, i) => [h.text, row[i]])) as Record<string, SheetCell>);
};
const money = (cell: SheetCell) => Number(String(cell.raw).replace(/,/g, ''));
const day = (cell: SheetCell) => cell.date || cell.text || null;

test('reference: the solo freelancer workbook imports exactly what its own Dashboard states', async () => {
  const data = bytesOf(SOLO);
  const grids = gridsOf(data, SOLO);
  const { result, totals, details } = plan(grids, await fileFingerprint(data));
  // 8 projects / invoices, ฿167,000 invoiced, ฿84,000 received (not ฿168,000), ฿83,000 outstanding.
  assert.deepEqual(totals, { jobs: 8, expenses: 30, value: 167000, received: 84000, pending: 83000, expenseAmount: 39382 });
  assert.deepEqual([details.expenseBusiness, details.expensePersonal], [31742, 7640]);
  assert.equal(result.transfersTotal, 15000);
  assert.equal(result.rows.filter(r => r.state === 'confirm').length, 0, 'nothing in the reference file needs a guess');
  const jobs = result.rows.filter(r => on(r) && r.job);
  assert.equal(new Set(jobs.map(r => r.job!.client)).size, 6, 'six clients, named from the Clients tab');
  // Each job is one invoice, checked field by field against the Invoices, Projects and Clients tabs.
  const projects = new Map(sheetRows(grids, 'Projects').map(p => [p['Project ID'].text, p]));
  const clients = new Map(sheetRows(grids, 'Clients').map(c => [c['Client ID'].text, c['Client Name'].text]));
  const invoices = sheetRows(grids, 'Invoices');
  assert.equal(invoices.length, 8);
  for (const invoice of invoices) {
    const row = jobs.find(r => r.source!.ref === invoice['Invoice ID'].text);
    assert.ok(row, `invoice ${invoice['Invoice ID'].text} imported`);
    const job = row!.job!;
    const project = projects.get(invoice['Project ID'].text)!;
    assert.equal(job.name, project['Project Name'].text);
    assert.equal(job.client, clients.get(invoice['Client ID'].text));
    assert.equal(job.value, money(invoice['Invoiced (THB)']));
    assert.equal(job.received, money(invoice['Received (THB)']));
    assert.equal(job.pending, money(invoice['Outstanding (THB)']));
    assert.equal(job.postDate, day(invoice['Issue Date']));
    const paid = invoice['Payment Status'].text === 'Paid';
    assert.equal(job.payDate, paid ? day(invoice['Last Payment Date']) : day(invoice['Due Date']));
    if (invoice['Payment Status'].text === 'Partially Paid') assert.equal(job.depositDate, day(invoice['Last Payment Date']));
    assert.equal(job.isPosted, project['Project Status'].text === 'Completed' || job.received > 0);
  }
  // The four client payments in Transactions are the same money as the invoices: folded, not added.
  const payments = result.rows.filter(r => r.sheet === 'Transactions' && r.job);
  assert.equal(payments.length, 4);
  assert.ok(payments.every(r => r.issues.includes('merged') && !on(r)));
  // Every expense in the register is imported once, from the ledger or the register, never both.
  const expenses = result.rows.filter(r => on(r) && r.expense).map(r => r.expense!);
  for (const item of sheetRows(grids, 'Expenses')) {
    const same = expenses.filter(e => e.name === item['Description'].text && e.amount === money(item['Amount (THB)']) && e.date === day(item['Date']));
    assert.equal(same.length, 1, `${item['Expense ID'].text} imported once`);
  }
  // The Dashboard's own figures, all matched.
  const checks = compareMetrics(result.metrics, totals, details, result.transfersTotal);
  assert.deepEqual(checks.map(c => [c.label, c.fileValue, c.ok]), [
    ['Cash received', 84000, true], ['Owner transfers out', 15000, true], ['Total invoices issued', 167000, true],
    ['Receivables outstanding', 83000, true], ['Total projects', 8, true], ['Business expenses paid', 31742, true], ['Personal expenses paid', 7640, true],
  ]);
});

test('reference: the personal finance workbook matches its Dashboard, transfers left out', async () => {
  const data = bytesOf(PERSONAL);
  const { result, totals, details } = plan(gridsOf(data, PERSONAL), await fileFingerprint(data), undefined, PERSONAL);
  assert.deepEqual(totals, { jobs: 6, expenses: 27, value: 199300, received: 137300, pending: 62000, expenseAmount: 63440 });
  assert.equal(result.transfersTotal, 14000);
  assert.ok(result.checks.every(check => check.ok));
  const checks = compareMetrics(result.metrics, totals, details, result.transfersTotal);
  assert.ok(checks.length >= 4 && checks.every(check => check.ok), JSON.stringify(checks));
  assert.equal(result.rows.filter(r => r.job && on(r) && /transfer/i.test(r.job.name)).length, 0, 'savings and tax transfers are not income');
});

test('import -> export -> import again gives the same jobs, one by one', async () => {
  const data = bytesOf(SOLO);
  const first = plan(gridsOf(data, SOLO), await fileFingerprint(data));
  const saved = save(first.result).jobs;
  const csv = jobsCsvText(saved);
  const encoded = new TextEncoder().encode(csv);
  const exported = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
  const again = plan(gridsOf(exported, 'export.csv'), await fileFingerprint(exported), undefined, 'export.csv');
  assert.deepEqual(again.totals, { ...first.totals, expenses: 0, expenseAmount: 0 });
  const back = again.result.rows.filter(r => on(r) && r.job).map(r => r.job!);
  for (const job of saved) {
    const twin = back.find(j => j.name === job.name);
    assert.ok(twin, job.name);
    for (const field of ['client', 'value', 'received', 'pending', 'payDate', 'postDate', 'depositDate'] as const) assert.equal(twin![field] ?? null, job[field] ?? null, `${job.name} ${field}`);
  }
});

test('importing the same file again adds nothing, even after the jobs were edited in the app', async () => {
  const data = bytesOf(SOLO);
  const fingerprint = await fileFingerprint(data);
  const first = plan(gridsOf(data, SOLO), fingerprint);
  const saved = save(first.result);
  saved.jobs[0] = { ...saved.jobs[0], name: 'Renamed in the app', lastActivityAt: '2026-10-23T09:00:00.000Z' };
  const again = plan(gridsOf(data, SOLO), fingerprint, saved);
  assert.deepEqual(again.totals, { jobs: 0, expenses: 0, value: 0, received: 0, pending: 0, expenseAmount: 0 });
  assert.equal(again.result.rows.filter(r => r.issues.includes('alreadyImported')).length, 38);
});

test('an updated version of the file updates the one job it changes and can be undone', async () => {
  const data = bytesOf(SOLO);
  const fingerprint = await fileFingerprint(data);
  const saved = save(plan(gridsOf(data, SOLO), fingerprint).result);
  // The next month's file: INV-2609-005 has been paid.
  const updated = gridsOf(data, SOLO).map(grid => grid.name !== 'Invoices' ? grid : {
    ...grid, rows: grid.rows.map(row => row[0]?.text !== 'INV-2609-005' ? row : row.map((cell, i) =>
      i === 6 ? { raw: 16000, text: '16,000.00' } : i === 7 ? { raw: 'Paid', text: 'Paid' } : i === 8 ? { raw: 46305, text: '2026-10-10', date: '2026-10-10' } : i === 9 ? { raw: 0, text: '0.00' } : cell)),
  });
  const next = plan(updated, 'second-version', saved);
  assert.deepEqual(next.totals, { jobs: 0, expenses: 0, value: 0, received: 0, pending: 0, expenseAmount: 0 }, 'nothing is added again');
  const changes = next.result.rows.filter(r => r.update);
  assert.equal(changes.length, 1);
  const [change] = changes;
  const target = saved.jobs.find(j => j.id === change.update!.id)!;
  assert.equal(target.name, 'Website UX Audit');
  assert.equal(change.state, 'confirm', 'an update waits for the person');
  assert.deepEqual([change.update!.before.received, change.update!.after.received, change.update!.after.pending, change.update!.after.payDate], [0, 16000, 0, '2026-10-10']);
  // Applied as the app applies it, then undone: the job is exactly as it was.
  const applied = { ...applyFields(target, change.update!.after), importUpdate: { batchId: 'batch-2', at: '2026-11-01T00:00:00.000Z', before: change.update!.before } } as Job;
  assert.equal(applied.received, 16000);
  assert.equal(applied.status, 'done');
  assert.deepEqual(undoUpdate(applied, 'batch-2'), target);
  assert.deepEqual(recentImports([applied], [], Date.parse('2026-11-02')).map(b => [b.id, b.updates]), [['batch-2', 1]]);
  assert.equal(carriesBatch({ jobs: [applied] }, 'batch-2'), true);
  // A job edited in the app after its import is flagged before its update is offered.
  const edited = { ...saved, jobs: saved.jobs.map(j => j.id === target.id ? { ...j, lastActivityAt: '2026-10-25T00:00:00.000Z' } : j) };
  assert.ok(plan(updated, 'second-version', edited).result.rows.find(r => r.update)!.issues.includes('editedInApp'));
});

test('jobs already in the app from before (no import record) are recognised, not added twice', async () => {
  const data = bytesOf(SOLO);
  const saved = save(plan(gridsOf(data, SOLO), await fileFingerprint(data)).result);
  const typedByHand = saved.jobs.map(({ importSource: _s, importBatchId: _b, importedAt: _a, ...job }: any) => job as Job);
  const again = plan(gridsOf(data, SOLO), 'another-copy', { jobs: typedByHand, expenses: saved.expenses });
  assert.equal(again.totals.jobs, 0);
  assert.equal(again.result.rows.filter(r => r.job && r.issues.includes('duplicate')).length, 8);
});

test('a column guessed from its values alone is confirmed before money is read from it', () => {
  const headerless: SheetGrid = { name: 'Sheet1', rows: [['Logo design', 'Example Co.', 5000], ['Poster', 'Sample Ltd.', 3000]].map(r => r.map(v => ({ raw: v, text: String(v) }))) };
  const analysis = analyzeSheet(headerless);
  const amount = analysis.columns.find(c => c.index === 2)!;
  assert.equal(amount.target, 'amount');
  assert.equal(needsConfirmation(amount), true);
  const named: SheetGrid = { name: 'Jobs', rows: [['Job', 'Client', 'Amount (THB)'], ['Logo design', 'Example Co.', 5000]].map(r => r.map(v => ({ raw: v, text: String(v) }))) };
  assert.equal(analyzeSheet(named).columns.some(needsConfirmation), false);
});

test('rows the app had to guess wait for confirmation and are left out until ticked', () => {
  const cells = (rows: unknown[][]) => rows.map(r => r.map(v => ({ raw: v as string | number, text: String(v ?? '') })));
  const jobs: SheetGrid = { name: 'Jobs', rows: cells([['ชื่องาน', 'ราคา', 'วันที่', 'สถานะ'], ['งาน A', 5000, 'ไม่รู้วัน', 'ยังไม่จ่าย'], ['งาน B', 3000, 'ต.ค. 69', 'ยังไม่จ่าย'], ['งาน C', 2000, '05/10/2569', 'ยังไม่จ่าย']]) };
  const spend: SheetGrid = { name: 'รายจ่าย', rows: cells([['วันที่', 'รายการ', 'จำนวนเงิน'], ['01/10/2569', 'คืนเงินค่าโปรแกรม', -790]]) };
  const result = buildImportPlan([jobs, spend].map(grid => ({ grid, analysis: analyzeSheet(grid) })), { amountsAreNet: false, today }, { statuses, jobTypes: [], existingJobs: [], existingExpenses: [] });
  const byName = (name: string) => result.rows.find(r => (r.job?.name ?? r.expense?.name) === name)!;
  assert.deepEqual([byName('งาน A').state, byName('งาน A').issues.includes('dateUnreadable')], ['confirm', true]);
  assert.deepEqual([byName('งาน B').state, byName('งาน B').issues.includes('monthOnly')], ['confirm', true]);
  assert.equal(byName('งาน C').state, 'ready');
  assert.deepEqual([byName('คืนเงินค่าโปรแกรม').state, byName('คืนเงินค่าโปรแกรม').issues.includes('negative')], ['confirm', true]);
  assert.deepEqual(planTotals(result.rows, on), { jobs: 1, expenses: 0, value: 2000, received: 0, pending: 2000, expenseAmount: 0 });
});

test('files: only saved values are read, never formulas; renamed or binary files are refused', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['ชื่องาน', 'ราคา'], ['งาน A', 0]]);
  sheet.B2 = { t: 'n', v: 4500, f: 'SUM(1500,3000)' };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'งาน');
  const file = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  assert.equal(fileKind(file, 'jobs.xlsx'), 'zip');
  const [grid] = readWorkbook(XLSX, file, 'jobs.xlsx');
  assert.equal(grid.rows[1][1].raw, 4500);
  assert.ok(!JSON.stringify(grid).includes('SUM('), 'the formula itself is not read');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  assert.equal(fileKind(png, 'renamed.xlsx'), null);
  assert.equal(fileKind(new Uint8Array([0x61, 0x00, 0x62]).buffer, 'data.csv'), null);
  assert.equal(fileKind(new TextEncoder().encode('a,b\n1,2').buffer as ArrayBuffer, 'data.csv'), 'text');
  // A name that looks like a formula is exported as text, so Excel or Sheets never runs it.
  assert.equal(csvCell('=HYPERLINK("https://example.com")'), `"'=HYPERLINK(""https://example.com"")"`);
  assert.equal(csvCell('@SUM(A1)'), `'@SUM(A1)`);
  assert.equal(csvCell('-'), '-');
  assert.equal(csvCell('-500'), '-500');
  const line = jobsCsvText([{ id: 'x', name: '=1+1', value: 100, received: 0, pending: 100, client: '+cmd', type: 'Sponsored Post', status: 'pending', creditTerm: 0, note: '', payDate: null } as Job]).split('\n')[1];
  assert.ok(line.startsWith(`'=1+1,`) && line.includes(`,'+cmd,`), line);
});

test('commit: an imported batch is validated whole, with its source links, and a bad row stops all of it', async () => {
  const data = bytesOf(SOLO);
  const saved = save(plan(gridsOf(data, SOLO), await fileFingerprint(data)).result);
  const changes = [
    ...saved.jobs.map(job => ({ table: 'cashflow_jobs' as const, id: job.id, op: 'set' as const, version: null, data: job })),
    ...saved.expenses.map(expense => ({ table: 'cashflow_expenses' as const, id: expense.id, op: 'set' as const, version: null, data: expense })),
  ];
  const valid = validateChanges(changes);
  assert.equal(valid.length, 38);
  assert.equal((valid[0].data as any).importSource.ref, 'INV-2609-001');
  const broken = [...changes.slice(0, 5), { ...changes[5], data: { ...changes[5].data, value: -1 } }, ...changes.slice(6)];
  assert.throws(() => validateChanges(broken));
  // An update never sends null into a number field: it removes the field instead.
  const cleared = applyFields(saved.jobs[0], { depositAmount: null, depositDate: null });
  assert.equal('depositAmount' in cleared, false);
  assert.equal(cleared.depositDate, null);
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_jobs', id: cleared.id, op: 'set', version: 1, data: cleared }]));
});

test('a sheet without headers keeps its first row as data, even when a name contains a header word', () => {
  const rows = [['ออกแบบโลโก้', 'ลูกค้าตัวอย่าง', 5000, '05/10/2569'], ['โปสเตอร์', 'บริษัท ตัวอย่าง', 3000, '06/10/2569']];
  const grid: SheetGrid = { name: 'Sheet1', rows: rows.map(r => r.map(v => ({ raw: v, text: String(v) }))) };
  const analysis = analyzeSheet(grid);
  assert.equal(analysis.headerRow, null);
  assert.deepEqual(analysis.dataRows, [0, 1]);
  assert.ok(analysis.columns.filter(needsConfirmation).length >= 2, 'the amount and date columns are guesses to confirm');
});

test('an amount in another currency is never imported as baht without the person confirming it', () => {
  const cells = (rows: unknown[][]) => rows.map(r => r.map(v => ({ raw: v as string | number, text: String(v ?? '') })));
  const usdColumn: SheetGrid = { name: 'Jobs', rows: cells([['Job', 'Client', 'Amount (USD)', 'Date'], ['Logo', 'Example Co.', 1200, '2026-10-05']]) };
  const dollarCell: SheetGrid = { name: 'Jobs2', rows: cells([['Job', 'Client', 'Amount', 'Date'], ['Poster', 'Sample Ltd.', '$300', '2026-10-06'], ['Banner', 'Sample Ltd.', '฿900', '2026-10-07']]) };
  const result = buildImportPlan([usdColumn, dollarCell].map(grid => ({ grid, analysis: analyzeSheet(grid) })), { amountsAreNet: false, today }, { statuses, jobTypes: [], existingJobs: [], existingExpenses: [] });
  const byName = (name: string) => result.rows.find(r => r.job?.name === name)!;
  assert.deepEqual([byName('Logo').state, byName('Logo').issues.includes('foreignCurrency')], ['confirm', true]);
  assert.deepEqual([byName('Poster').state, byName('Poster').issues.includes('foreignCurrency')], ['confirm', true]);
  assert.equal(byName('Banner').state, 'ready');
});

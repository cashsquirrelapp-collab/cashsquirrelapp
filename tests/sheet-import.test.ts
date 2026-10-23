import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  analyzeSheet, buildImportPlan, excelSerialDate, fullYear, mapCategory, monthFromName, parseCreditTerm, parseDateText,
  parseMoney, parseRate, parseStatus, planTotals, type SheetCell, type SheetGrid,
} from '../frontend/src/features/import/sheetImport.ts';
import type { Expense, Job } from '../shared/types.ts';
import { readWorkbook } from '../frontend/src/features/import/readWorkbook.ts';

// Import from Excel (owner, 2026-10-22): the sheets people already keep come in many layouts. Each
// test is one layout seen in practice, with example data, and checks what the import makes of it.

const cell = (value: unknown): SheetCell =>
  value === null || value === undefined ? { raw: null, text: '' }
    : typeof value === 'object' && value && 'date' in (value as object) ? value as SheetCell
      : { raw: value as string | number | boolean, text: typeof value === 'number' ? value.toLocaleString('en-US') : String(value) };
const grid = (name: string, rows: unknown[][]): SheetGrid => ({ name, rows: rows.map(row => row.map(cell)) });
const date = (iso: string): SheetCell => ({ raw: 45000, text: iso, date: iso });
const statuses = [
  { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' as const },
  { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' as const },
  { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' as const },
];
const context = { statuses, jobTypes: ['Sponsored Post'], existingJobs: [] as Job[], existingExpenses: [] as Expense[] };
const options = { amountsAreNet: false, today: '2026-10-22' };
const plan = (sheets: SheetGrid[], opts = options, ctx: typeof context = context) =>
  buildImportPlan(sheets.map(g => ({ grid: g, analysis: analyzeSheet(g) })), opts, ctx);
const targets = (g: SheetGrid) => Object.fromEntries(analyzeSheet(g).columns.map(c => [c.header || `#${c.index}`, c.target]));

test('reading values: dates in Thai and English, Buddhist years, Excel day numbers', () => {
  assert.equal(parseDateText('15/10/2567'), '2024-10-15');
  assert.equal(parseDateText('15/10/67'), '2024-10-15');
  assert.equal(parseDateText('15/10/24'), '2024-10-15');
  assert.equal(parseDateText('2024-10-15'), '2024-10-15');
  assert.equal(parseDateText('15 ต.ค. 67'), '2024-10-15');
  assert.equal(parseDateText('15 ตุลาคม 2567'), '2024-10-15');
  assert.equal(parseDateText('15 Oct 2024'), '2024-10-15');
  assert.equal(parseDateText('Oct 15, 2024'), '2024-10-15');
  assert.equal(parseDateText('10/15/2024', 'mdy'), '2024-10-15');
  assert.equal(parseDateText('31/02/2024'), null);
  assert.equal(parseDateText('ยังไม่กำหนด'), null);
  assert.equal(excelSerialDate(45580), '2024-10-15');
  assert.equal(fullYear(2567), 2024);
  assert.equal(monthFromName('ต.ค. 67'), '2024-10');
  assert.equal(monthFromName('ตุลาคม 2567'), '2024-10');
  assert.equal(monthFromName('Oct 2024'), '2024-10');
  assert.equal(monthFromName('10-2024'), '2024-10');
  assert.equal(monthFromName('สรุป'), null);
});

test('reading values: amounts, rates, credit terms and status words', () => {
  for (const [text, value] of [['฿12,000', 12000], ['12,000.-', 12000], ['12,000 บาท', 12000], ['(500)', -500], ['12k', 12000], ['1.5 หมื่น', 15000], ['-300', -300]] as const) {
    assert.equal(parseMoney({ raw: text, text }), value, text);
  }
  assert.equal(parseMoney({ raw: 'รอยืนยัน', text: 'รอยืนยัน' }), null);
  assert.equal(parseRate({ raw: '3%', text: '3%' }), 3);
  assert.equal(parseRate({ raw: 0.03, text: '0.03' }), 3);
  assert.equal(parseRate({ raw: 1.5, text: '1.5' }), 1.5);
  assert.equal(parseCreditTerm({ raw: '30 วัน', text: '30 วัน' }), 30);
  assert.equal(parseCreditTerm({ raw: 'Net 45', text: 'Net 45' }), 45);
  assert.equal(parseCreditTerm({ raw: 'เงินสด', text: 'เงินสด' }), 0);
  assert.equal(parseStatus({ raw: 'จ่ายแล้ว', text: 'จ่ายแล้ว' }).payment, 'paid');
  assert.equal(parseStatus({ raw: 'โอนแล้ว', text: 'โอนแล้ว' }).payment, 'paid');
  assert.equal(parseStatus({ raw: 'ยังไม่จ่าย', text: 'ยังไม่จ่าย' }).payment, 'unpaid');
  assert.equal(parseStatus({ raw: 'รอโอน', text: 'รอโอน' }).payment, 'unpaid');
  assert.equal(parseStatus({ raw: 'มัดจำ 50%', text: 'มัดจำ 50%' }).payment, 'partial');
  assert.equal(parseStatus({ raw: '✓', text: '✓' }).payment, 'paid');
  assert.equal(parseStatus({ raw: true, text: 'TRUE' }).payment, 'paid');
  assert.equal(parseStatus({ raw: 'กำลังทำ', text: 'กำลังทำ' }).delivered, false);
  assert.equal(parseStatus({ raw: 'ส่งงานแล้ว', text: 'ส่งงานแล้ว' }).delivered, true);
  assert.equal(mapCategory('ค่าแท็กซี่', []), 'ค่าเดินทาง/น้ำมัน');
  assert.equal(mapCategory('Adobe CC', []), 'ค่าอุปกรณ์/ซอฟต์แวร์');
  assert.equal(mapCategory('ค่าจ้างช่างภาพ', []), 'จ้างงานต่อ (Outsource)');
});

test('layout 1: a Thai job sheet with a title, a blank row, Buddhist dates, WHT % and a total row', () => {
  const sheet = grid('งานปี 2567', [
    ['บัญชีงานรับจ้าง ปี 2567'],
    [],
    ['ลำดับ', 'วันที่', 'ชื่องาน', 'ลูกค้า', 'ประเภท', 'ราคา', 'หัก ณ ที่จ่าย', 'สถานะ', 'วันที่รับเงิน', 'หมายเหตุ'],
    [1, '15/10/2567', 'รีวิวครีมกันแดด', 'แบรนด์ตัวอย่าง A', 'Sponsored Post', '12,000', '3%', 'จ่ายแล้ว', '30/10/2567', 'คลิป 60 วิ'],
    [2, '20/10/2567', 'ถ่ายภาพแคมเปญ', 'บริษัท ตัวอย่าง จำกัด', 'ถ่ายภาพ', '8,000', '3%', 'ยังไม่จ่าย', '', ''],
    [3, '01/11/2567', 'ออกแบบโลโก้', 'ร้านตัวอย่าง', 'ออกแบบ', '5,000', '', 'มัดจำ', '', ''],
    ['', '', 'รวม', '', '', '25,000', '', '', '', ''],
  ]);
  const analysis = analyzeSheet(sheet);
  assert.equal(analysis.headerRow, 2);
  assert.equal(analysis.kind, 'jobs');
  assert.deepEqual(targets(sheet), { 'ลำดับ': 'keep', 'วันที่': 'date', 'ชื่องาน': 'name', 'ลูกค้า': 'client', 'ประเภท': 'type', 'ราคา': 'value', 'หัก ณ ที่จ่าย': 'whtRate', 'สถานะ': 'status', 'วันที่รับเงิน': 'paidDate', 'หมายเหตุ': 'note' });
  const result = plan([sheet]);
  const jobs = result.rows.filter(r => r.job);
  assert.equal(jobs.length, 3);
  const [paid, unpaid, deposit] = jobs.map(r => r.job!);
  assert.equal(paid.value, 12000); assert.equal(paid.whtAmount, 360); assert.equal(paid.received, 11640); assert.equal(paid.pending, 0);
  assert.equal(paid.status, 'done'); assert.equal(paid.postDate, '2024-10-15'); assert.equal(paid.payDate, '2024-10-30');
  assert.equal(paid.note, 'คลิป 60 วิ · ลำดับ: 1');
  assert.equal(jobs[0].state, 'ready');
  assert.equal(unpaid.status, 'pending'); assert.equal(unpaid.pending, 7760); assert.equal(unpaid.received, 0);
  assert.deepEqual(jobs[2].issues, ['partialNoAmount']);
  assert.equal(deposit.received, 0);
  assert.deepEqual(result.newJobTypes, ['ถ่ายภาพ', 'ออกแบบ']);
  assert.equal(result.rows.at(-1)!.issues[0], 'total');
  assert.equal(result.fileTotals.value, 25000);
  assert.equal(planTotals(result.rows, r => r.state !== 'skip').value, 25000);
});

test('layout 2: an English sheet with real date cells and TRUE/FALSE checkboxes', () => {
  const sheet = grid('Jobs', [
    ['Date', 'Client', 'Project', 'Amount', 'Paid?', 'Paid on'],
    [date('2024-10-03'), 'Example Studio', 'Product video', 18000, true, date('2024-10-20')],
    [date('2024-10-10'), 'Example Brand', 'Photo set', 9500, false, null],
  ]);
  assert.deepEqual(targets(sheet), { Date: 'date', Client: 'client', Project: 'name', Amount: 'amount', 'Paid?': 'status', 'Paid on': 'paidDate' });
  const [a, b] = plan([sheet]).rows.map(r => r.job!);
  assert.equal(a.status, 'done'); assert.equal(a.received, 18000); assert.equal(a.payDate, '2024-10-20');
  assert.equal(b.status, 'pending'); assert.equal(b.pending, 9500); assert.equal(b.postDate, '2024-10-10');
});

test('layout 3: received and outstanding columns decide partly paid jobs', () => {
  const sheet = grid('Sheet1', [
    ['ชื่องาน', 'ลูกค้า', 'มูลค่ารวม (บาท)', 'ยอดได้รับแล้ว (บาท)', 'ยอดค้างชำระ (บาท)', 'กำหนดชำระเงิน'],
    ['ตัดต่อวิดีโอ', 'ลูกค้า A', 30000, 10000, 20000, '15/11/2024'],
    ['เขียนบทความ', 'ลูกค้า B', 4000, 4000, 0, ''],
  ]);
  const [partial, paid] = plan([sheet]).rows;
  assert.equal(partial.job!.status, 'partial'); assert.equal(partial.job!.received, 10000); assert.equal(partial.job!.pending, 20000);
  assert.equal(partial.job!.payDate, '2024-11-15');
  assert.equal(paid.job!.status, 'done');
  assert.deepEqual(paid.issues, ['paidWithoutDate', 'noDate']);
});

test('layout 4: a sheet with no header row is read from its values', () => {
  const sheet = grid('Sheet1', [
    ['03/10/2024', 'รีวิวสินค้า', 15000],
    ['10/10/2024', 'ถ่ายภาพสินค้า', 6000],
    ['21/10/2024', 'ไลฟ์ขายของ', 4500],
  ]);
  const analysis = analyzeSheet(sheet);
  assert.equal(analysis.headerRow, null);
  assert.deepEqual(analysis.columns.map(c => c.target), ['date', 'name', 'amount']);
  const rows = plan([sheet]).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[2].job!.value, 4500);
  assert.equal(rows[0].job!.postDate, '2024-10-03');
});

test('layout 5: monthly tabs without dates take the month from the tab name', () => {
  const oct = grid('ต.ค. 67', [['งาน', 'ลูกค้า', 'ค่าจ้าง', 'สถานะ'], ['งาน A', 'ลูกค้า A', 5000, 'โอนแล้ว']]);
  const nov = grid('พ.ย. 67', [['งาน', 'ลูกค้า', 'ค่าจ้าง', 'สถานะ'], ['งาน B', 'ลูกค้า B', 7000, 'รอโอน']]);
  const rows = plan([oct, nov]).rows;
  assert.equal(rows[0].job!.postDate, '2024-10-01');
  assert.ok(rows[0].issues.includes('dateFromSheet'));
  assert.equal(rows[1].job!.postDate, '2024-11-01');
  assert.equal(rows[1].job!.status, 'pending');
});

test('layout 6: a ledger with income and expense columns splits into paid jobs and expenses', () => {
  const sheet = grid('บัญชีรายรับรายจ่าย', [
    ['วันที่', 'รายการ', 'รายรับ', 'รายจ่าย', 'หมายเหตุ'],
    ['01/10/2024', 'ค่าจ้างรีวิว แบรนด์ A', 12000, '', ''],
    ['02/10/2024', 'ค่าแท็กซี่ไปกองถ่าย', '', 250, ''],
    ['05/10/2024', 'ค่า Adobe', '', 790, 'รายเดือน'],
  ]);
  assert.equal(analyzeSheet(sheet).kind, 'mixed');
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].kind, 'job');
  assert.equal(rows[0].job!.status, 'done'); assert.equal(rows[0].job!.received, 12000); assert.equal(rows[0].job!.payDate, '2024-10-01');
  assert.equal(rows[1].expense!.category, 'ค่าเดินทาง/น้ำมัน'); assert.equal(rows[1].expense!.amount, 250); assert.equal(rows[1].expense!.date, '2024-10-02');
  assert.equal(rows[2].expense!.category, 'ค่าอุปกรณ์/ซอฟต์แวร์'); assert.equal(rows[2].expense!.note, 'รายเดือน');
});

test('layout 7: a ledger with a type column (income / expense)', () => {
  const sheet = grid('2024', [
    ['Date', 'Type', 'Description', 'Amount'],
    ['2024-10-01', 'Income', 'Logo design for Example Co.', 8000],
    ['2024-10-03', 'Expense', 'Stock photos', 450],
  ]);
  const analysis = analyzeSheet(sheet);
  assert.equal(analysis.kind, 'mixed');
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].job!.value, 8000);
  assert.equal(rows[1].expense!.amount, 450);
});

test('layout 8: a ledger with signed amounts treats negatives as expenses', () => {
  const sheet = grid('เงินเข้าออก', [
    ['วันที่', 'รายการ', 'จำนวนเงิน', 'ประเภทรายการ'],
    ['01/10/2024', 'ค่าจ้างงาน A', 10000, 'รายรับ'],
    ['03/10/2024', 'ค่าน้ำมัน', -800, 'รายจ่าย'],
  ]);
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].kind, 'job');
  assert.equal(rows[1].kind, 'expense');
  assert.equal(rows[1].expense!.amount, 800);
});

test('layout 9: a sheet named รายจ่าย becomes expenses with mapped categories', () => {
  const sheet = grid('รายจ่าย', [
    ['วันที่', 'รายการ', 'หมวด', 'จำนวน'],
    ['01/10/2567', 'ค่าอินเทอร์เน็ต', 'ค่าเน็ต', 599],
    ['', 'ค่าอาหารประชุมลูกค้า', 'อาหาร', 180],
  ]);
  const analysis = analyzeSheet(sheet);
  assert.equal(analysis.kind, 'expenses');
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].expense!.category, 'ค่าบริการ/สาธารณูปโภค');
  assert.equal(rows[0].expense!.date, '2024-10-01');
  assert.equal(rows[1].expense!.category, 'อาหาร/รับรองลูกค้า');
  assert.deepEqual(rows[1].issues, ['noDate']);
  assert.equal(rows[1].state, 'check');
});

test('layout 10: a withholding amount column gives the rate', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ราคา', 'ภาษีหัก ณ ที่จ่าย', 'วันที่'], ['งาน A', 10000, 300, '01/10/2024']]);
  const job = plan([sheet]).rows[0].job!;
  assert.equal(job.whtRate, 3);
  assert.equal(job.whtAmount, 300);
});

test('layout 11: amounts written after withholding are turned back into the job value', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ยอดเงิน', 'หัก ณ ที่จ่าย', 'วันที่'], ['งาน A', 9700, '3%', '01/10/2024']]);
  const job = plan([sheet], { ...options, amountsAreNet: true }).rows[0].job!;
  assert.equal(job.value, 10000);
  assert.equal(job.whtAmount, 300);
  assert.equal(job.pending, 9700);
});

test('layout 12: jobs already in the account are left out unless the person ticks them', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ลูกค้า', 'ราคา', 'วันที่'], ['งาน A', 'ลูกค้า A', 5000, '01/10/2024'], ['งาน A', 'ลูกค้า A', 5000, '01/10/2024']]);
  const existing = { ...plan([sheet]).rows[0].job!, id: 'x' };
  const rows = plan([sheet], options, { ...context, existingJobs: [existing] }).rows;
  assert.equal(rows[0].state, 'skip');
  assert.deepEqual(rows[0].issues, ['duplicate']);
  // The same job twice in one tab may be two jobs or one typed twice: it waits for the person.
  const fresh = plan([sheet]).rows;
  assert.equal(fresh[1].state, 'confirm');
  assert.deepEqual(fresh[1].issues, ['duplicateInFile']);
});

test('layout 13: a column of month-first dates is read month first', () => {
  const sheet = grid('Sheet1', [['Date', 'Project', 'Amount'], ['10/15/2024', 'A', 100], ['11/03/2024', 'B', 200]]);
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].job!.postDate, '2024-10-15');
  assert.equal(rows[1].job!.postDate, '2024-11-03');
});

test('layout 14: credit terms give the due date', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ราคา', 'วันส่งงาน', 'เครดิต'], ['งาน A', 5000, '01/10/2024', '30 วัน'], ['งาน B', 5000, '01/10/2024', 'Net 45']]);
  const [a, b] = plan([sheet]).rows.map(r => r.job!);
  assert.equal(a.creditTerm, 30); assert.equal(a.payDate, '2024-10-31');
  assert.equal(b.creditTerm, 45); assert.equal(b.payDate, '2024-11-15');
});

test('layout 15: a summary with months across the top is recognised and not imported', () => {
  const sheet = grid('สรุป', [['รายการ', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.'], ['รายรับ', 10000, 12000, 9000, 15000, 8000]]);
  assert.equal(analyzeSheet(sheet).monthsAcross, true);
  assert.equal(plan([sheet]).rows.length, 0);
});

test('layout 16: columns that are not ours are kept in the note with their header', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ช่องทาง', 'ราคา', 'วันที่'], ['รีวิว', 'TikTok', 5000, '01/10/2024']]);
  assert.equal(plan([sheet]).rows[0].job!.note, 'ช่องทาง: TikTok');
});

test('layout 17: a job named "รวม…" with a date is a job, not a total', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ราคา', 'วันที่'], ['รวมคลิปไฮไลต์', 7000, '01/10/2024'], ['รวม', 7000, '']]);
  const rows = plan([sheet]).rows;
  assert.equal(rows[0].kind, 'job');
  assert.deepEqual(rows[1].issues, ['total']);
});

test('layout 18: status words mark delivery as well as payment', () => {
  const sheet = grid('Sheet1', [['ชื่องาน', 'ราคา', 'วันที่', 'สถานะ'], ['งาน A', 5000, '01/12/2026', 'กำลังทำ'], ['งาน B', 5000, '01/10/2026', 'ส่งงานแล้ว รอโอน']]);
  const [a, b] = plan([sheet]).rows.map(r => r.job!);
  assert.equal(a.isPosted, false);
  assert.equal(b.isPosted, true); assert.equal(b.status, 'pending');
});

test('layout 19: a real .xlsx with date cells, a title row and Thai text reads the same', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['สรุปงานเดือนตุลาคม'],
    ['วันที่', 'ชื่องาน', 'ลูกค้า', 'ค่าจ้าง', 'จ่ายแล้ว'],
    [new Date(Date.UTC(2024, 9, 15)), 'รีวิวสินค้า', 'แบรนด์ A', 12000, 12000],
    [new Date(Date.UTC(2024, 9, 18)), 'ถ่ายภาพ', 'แบรนด์ B', 8000, 0],
  ], { cellDates: true });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'ต.ค.');
  const file = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const [read] = readWorkbook(XLSX, file, 'งาน.xlsx');
  assert.equal(read.rows[2][0].date, '2024-10-15');
  const rows = plan([read]).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].job!.postDate, '2024-10-15');
  assert.equal(rows[0].job!.status, 'done');
  assert.equal(rows[1].job!.status, 'pending');
});

test('layout 20: a CSV saved by Thai Excel (Windows-874) is decoded', () => {
  const thai = 'ชื่องาน,ราคา,วันที่\nรีวิว,5000,15/10/2567\n';
  // Encode as TIS-620/Windows-874: Thai letters are U+0E01..U+0E5B -> 0xA1..0xFB.
  const bytes = Uint8Array.from([...thai].map(ch => { const code = ch.charCodeAt(0); return code >= 0x0E01 && code <= 0x0E5B ? code - 0x0E01 + 0xA1 : code; }));
  const [read] = readWorkbook(XLSX, bytes.buffer, 'jobs.csv');
  const rows = plan([read]).rows;
  assert.equal(rows[0].job!.name, 'รีวิว');
  assert.equal(rows[0].job!.postDate, '2024-10-15');
  assert.equal(rows[0].job!.value, 5000);
});

test('imported jobs pass the same checks as jobs saved from the form', async () => {
  const { validateChanges } = await import('../shared/validation.ts');
  const sheet = grid('Sheet1', [['ชื่องาน', 'ลูกค้า', 'ราคา', 'หัก ณ ที่จ่าย', 'วันที่', 'สถานะ'], ['งาน A', 'ลูกค้า A', 12345.67, '3%', '01/10/2024', 'มัดจำ'], ['งาน B', '', 5000, '', '', 'จ่ายแล้ว']]);
  const changes = plan([sheet]).rows.filter(r => r.job).map((r, i) => ({ table: 'cashflow_jobs', id: `j${i}`, op: 'set', version: null, data: { ...r.job, id: `j${i}` } }));
  assert.doesNotThrow(() => validateChanges(changes));
});

test('our template imports without any column matching, in Thai and in English', async () => {
  const { templateRows } = await import('../frontend/src/features/import/importTemplate.ts');
  const { setCurrentLanguage } = await import('../frontend/src/i18n/currentLanguage.ts');
  for (const language of ['th', 'en'] as const) {
    setCurrentLanguage(language);
    const { jobs, expenses } = templateRows();
    const jobSheet = grid(language === 'en' ? 'Jobs' : 'งาน', jobs);
    const expenseSheet = grid(language === 'en' ? 'Expenses' : 'รายจ่าย', expenses);
    assert.ok(analyzeSheet(jobSheet).columns.every(c => c.target !== 'keep'), `${language}: every template column is recognised`);
    assert.equal(analyzeSheet(expenseSheet).kind, 'expenses', language);
    const rows = plan([jobSheet, expenseSheet]).rows;
    const made = rows.filter(r => r.job).map(r => r.job!);
    assert.deepEqual(made.map(j => j.paymentStatus), ['paid', 'partial', 'unpaid'], language);
    assert.equal(made[0].whtAmount, 150, language);
    assert.equal(made[1].received, 3000, language);
    assert.equal(made[2].payDate, '2024-12-01', language);
    assert.equal(rows.filter(r => r.expense).length, 2, language);
  }
  setCurrentLanguage('th');
});

// ---------------------------------------------------------------------------------------------
// Whole workbooks (owner, 2026-10-22: a sample personal-finance workbook made in Numbers).

const sheetsIncluded = (grids: SheetGrid[]) => {
  const { defaultIncluded, splitSideBySide } = imp;
  return grids.flatMap(splitSideBySide).map(g => ({ grid: g, analysis: analyzeSheet(g) })).filter(s => defaultIncluded(s.analysis));
};
import * as imp from '../frontend/src/features/import/sheetImport.ts';

test('workbook: dashboard, transactions ledger, projects and invoices count each job once', () => {
  const book = [
    grid('สรุปการส่งออก', [['เอกสารนี้ได้ส่งออกจาก Numbers'], [], ['ชื่อแผ่นงาน Numbers', 'ชื่อตาราง Numbers', 'ชื่อแผ่นงาน Excel'], ['Projects', 'ตาราง 1', 'Projects']]),
    grid('Dashboard', [['PERSONAL FINANCE'], [], ['Expense Category', 'Amount (THB)', 'Income Source', 'Received (THB)'], ['Housing', '16,320.00', 'Brand Identity — Nova', '28,500.00'], ['Food', '12,530.00', 'Website — Aster', '56,000.00']]),
    grid('Transactions', [
      ['Transaction ID', 'Date', 'Type', 'Category', 'Description', 'Project / Area', 'Payment Method', 'Account', 'Amount (THB)', 'Status', 'Cash Flow (THB)'],
      ['TX-0007', '01 Sep 2026', 'Expense', 'Housing', 'Rent', 'Personal', 'Bank Transfer', 'Operating', '14,500.00', 'Completed', '(14,500.00)'],
      ['TX-0001', '05 Sep 2026', 'Income', 'Client payment', 'Brand Identity — Nova', 'Brand Identity — Nova', 'Bank Transfer', 'Operating', '28,500.00', 'Completed', '28,500.00'],
      ['TX-0014', '08 Sep 2026', 'Expense', 'Business', 'Cloud hosting', 'Website — Aster', 'Bank Transfer', 'Operating', '1,250.00', 'Completed', '(1,250.00)'],
      ['TX-0002', '09 Sep 2026', 'Income', 'Client payment', 'Website — Aster', 'Website — Aster', 'Bank Transfer', 'Operating', '42,000.00', 'Completed', '42,000.00'],
      ['TX-0016', '10 Sep 2026', 'Expense', 'Business', 'Freelance designer', 'Website — Aster', 'Bank Transfer', 'Operating', '9,200.00', 'Completed', '(9,200.00)'],
      ['TX-0030', '25 Sep 2026', 'Transfer', 'Savings', 'Emergency fund transfer', 'Personal', 'Bank Transfer', 'Savings / Tax', '7,500.00', 'Completed', '(7,500.00)'],
      ['TX-0005', '26 Sep 2026', 'Income', 'Client payment', 'Website — Aster', 'Website — Aster', 'Bank Transfer', 'Operating', '14,000.00', 'Completed', '14,000.00'],
      ['TX-0006', '29 Sep 2026', 'Income', 'Other income', 'Referral bonus', 'Other', 'Bank Transfer', 'Operating', '2,300.00', 'Completed', '2,300.00'],
    ]),
    grid('Projects', [
      ['Project', 'Client', 'Contract Value', 'Cash Received', 'Direct Costs', 'Cash Profit'],
      ['Brand Identity — Nova', 'Nova Studio', '35,000.00', '28,500.00', '1,680.00', '26,820.00'],
      ['Website — Aster', 'Aster Labs', '68,000.00', '56,000.00', '11,340.00', '44,660.00'],
      ['UX Audit — Meridian', 'Meridian Co.', '22,000.00', '0.00', '2,800.00', '(2,800.00)'],
      ['TOTAL', '', '125,000.00', '84,500.00', '15,820.00', '68,680.00'],
    ]),
    grid('Invoices', [
      ['Invoice', 'Project', 'Client', 'Issued', 'Due Date', 'Amount', 'Status', 'Notes'],
      ['INV-2609-001', 'Brand Identity — Nova', 'Nova Studio', '03 Sep 2026', '04 Oct 2026', '6,500.00', 'Unpaid', 'Final milestone'],
      ['INV-2609-002', 'Website — Aster', 'Aster Labs', '26 Sep 2026', '26 Oct 2026', '12,000.00', 'Unpaid', 'Remaining phase 2'],
      ['INV-2609-005', 'UX Audit — Meridian', 'Meridian Co.', '28 Sep 2026', '28 Oct 2026', '22,000.00', 'Unpaid', 'Awaiting kickoff payment'],
      ['', '', '', '', 'TOTAL UNPAID', '40,500.00', '', ''],
    ]),
    grid('Read Me', [['SAMPLE PERSONAL FINANCE WORKBOOK'], ['Owner', 'Alex Morgan (fictional)'], ['Period', 'September 2026']]),
  ];
  const included = sheetsIncluded(book);
  assert.deepEqual(included.map(s => s.grid.name), ['Transactions', 'Projects', 'Invoices'], 'summaries and read-me pages are left out');
  const result = buildImportPlan(included, options, context);
  const jobs = result.rows.filter(r => r.job && r.state !== 'skip').map(r => r.job!);
  assert.deepEqual(jobs.map(j => j.name), ['Referral bonus', 'Brand Identity — Nova', 'Website — Aster', 'UX Audit — Meridian']);
  const [referral, nova, aster, meridian] = jobs;
  assert.equal(referral.status, 'done'); assert.equal(referral.client, ''); assert.equal(referral.payDate, '2026-09-29');
  assert.equal(nova.client, 'Nova Studio'); assert.equal(nova.received, 28500); assert.equal(nova.depositDate, '2026-09-05'); assert.equal(nova.payDate, '2026-10-04'); assert.equal(nova.postDate, '2026-09-03');
  assert.match(nova.note, /Final milestone/);
  assert.equal(aster.status, 'installment');
  assert.deepEqual(aster.installments!.map(i => [i.amount, i.status, i.paidAt ?? i.dueDate]), [[42000, 'paid', '2026-09-09'], [14000, 'paid', '2026-09-26'], [12000, 'pending', '2026-10-26']]);
  assert.equal(meridian.pending, 22000); assert.equal(meridian.payDate, '2026-10-28');
  const totals = planTotals(result.rows, r => r.state !== 'skip' && r.kind !== 'skip');
  assert.deepEqual([totals.value, totals.received, totals.pending], [127300, 86800, 40500]);
  const transfer = result.rows.find(r => r.expense?.name === 'Emergency fund transfer')!;
  assert.equal(transfer.state, 'skip'); assert.deepEqual(transfer.issues, ['transfer']);
  const expenses = result.rows.filter(r => r.expense && r.state !== 'skip').map(r => r.expense!);
  assert.deepEqual(expenses.map(e => [e.name, e.category]), [['Rent', 'ค่าบริการ/สาธารณูปโภค'], ['Cloud hosting', 'ค่าอุปกรณ์/ซอฟต์แวร์'], ['Freelance designer', 'จ้างงานต่อ (Outsource)']]);
  assert.match(expenses[1].note!, /Project \/ Area: Website — Aster/);
  assert.equal(result.rows.filter(r => r.issues.includes('merged')).length, 6);
  // Each tab's total row is checked against its own rows, not against the whole import.
  assert.deepEqual(result.checks.map(c => [c.sheet, c.field, c.ok]), [['Projects', 'value', true], ['Projects', 'received', true], ['Projects', 'expense', true], ['Invoices', 'amount', true]]);
});

test('workbook: payments that do not add up are flagged, not merged', () => {
  const ledger = grid('Ledger', [['Date', 'Type', 'Description', 'Amount'], ['2026-09-05', 'Income', 'Website — Aster', 10000]]);
  const projects = grid('Projects', [['Project', 'Client', 'Contract Value', 'Cash Received'], ['Website — Aster', 'Aster Labs', 68000, 56000]]);
  const rows = buildImportPlan(sheetsIncluded([ledger, projects]), options, context).rows;
  assert.deepEqual(rows[0].issues, ['sameNameOtherSheet']);
  // Could be the same money twice: left out until the person ticks it.
  assert.equal(rows[0].state, 'confirm');
  assert.equal(rows[1].job!.received, 56000);
});

test('an invoice list on its own becomes unpaid jobs with their due dates', () => {
  const invoices = grid('Invoices', [['Invoice #', 'Client', 'Project', 'Issued', 'Due', 'Amount', 'Paid'], ['INV-1', 'Example Co.', 'Logo design', '01/10/2026', '31/10/2026', 9000, 'No'], ['INV-2', 'Example Co.', 'Brochure', '02/10/2026', '01/11/2026', 4000, 'Yes']]);
  const [a, b] = buildImportPlan(sheetsIncluded([invoices]), options, context).rows.map(r => r.job!);
  assert.equal(a.name, 'Logo design'); assert.equal(a.status, 'pending'); assert.equal(a.payDate, '2026-10-31');
  assert.equal(b.status, 'done');
});

test('Google Sheets monthly budget: expenses and income side by side become two tables', () => {
  const sheet = grid('Transactions', [
    ['', 'Monthly budget'],
    [],
    ['', 'Expenses', '', '', '', '', 'Income'],
    ['', 'Date', 'Amount', 'Description', 'Category', '', 'Date', 'Amount', 'Description', 'Category'],
    ['', '10/1/2026', '$790', 'Editing software', 'Software', '', '10/5/2026', '$5,000', 'Logo design', 'Paycheck'],
    ['', '10/3/2026', '$120', 'Taxi', 'Transportation', '', '10/20/2026', '$8,000', 'Video edit', 'Paycheck'],
    ['', '10/13/2026', '$45', 'Printing', 'Other', '', '', '', '', ''],
  ]);
  const parts = imp.splitSideBySide(sheet);
  assert.deepEqual(parts.map(p => p.name), ['Transactions · Expenses', 'Transactions · Income']);
  const rows = buildImportPlan(sheetsIncluded([sheet]), options, context).rows;
  const expenses = rows.filter(r => r.expense).map(r => r.expense!);
  assert.deepEqual(expenses.map(e => [e.name, e.amount, e.date]), [['Editing software', 790, '2026-10-01'], ['Taxi', 120, '2026-10-03'], ['Printing', 45, '2026-10-13']]);
  const jobs = rows.filter(r => r.job).map(r => r.job!);
  assert.deepEqual(jobs.map(j => [j.name, j.value, j.status, j.payDate]), [['Logo design', 5000, 'done', '2026-10-05'], ['Video edit', 8000, 'done', '2026-10-20']]);
});

test('a Thai bank statement: deposits are money in, withdrawals are expenses, the balance is ignored', () => {
  const sheet = grid('statement', [
    ['วันที่', 'รายการ', 'ถอน', 'ฝาก', 'คงเหลือ'],
    ['01/10/2569', 'รับโอนจาก บริษัท ตัวอย่าง', '', '15,000.00', '45,000.00'],
    ['03/10/2569', 'ชำระค่าไฟฟ้า', '1,250.00', '', '43,750.00'],
  ]);
  assert.equal(analyzeSheet(sheet).kind, 'mixed');
  const [income, expense] = buildImportPlan(sheetsIncluded([sheet]), options, context).rows;
  assert.equal(income.job!.value, 15000); assert.equal(income.job!.status, 'done'); assert.equal(income.job!.payDate, '2026-10-01');
  assert.equal(expense.expense!.amount, 1250); assert.equal(expense.expense!.category, 'ค่าบริการ/สาธารณูปโภค');
});

test('a month instead of a date, or only the day in a monthly tab', () => {
  const months = grid('งาน', [['เดือน', 'ชื่องาน', 'ค่าจ้าง', 'สถานะ'], ['ต.ค. 69', 'งาน A', 5000, '✅'], ['พ.ย. 69', 'งาน B', 3000, '❌']]);
  const [a, b] = buildImportPlan(sheetsIncluded([months]), options, context).rows;
  assert.equal(a.job!.postDate, '2026-10-01'); assert.ok(a.issues.includes('monthOnly')); assert.equal(a.job!.status, 'done');
  assert.equal(b.job!.postDate, '2026-11-01'); assert.equal(b.job!.status, 'pending');
  const days = grid('ต.ค. 69', [['วันที่', 'รายการ', 'จำนวนเงิน', 'หมวด'], [5, 'ค่าโปรแกรมตัดต่อ', 790, 'ซอฟต์แวร์']]);
  const [d] = buildImportPlan(sheetsIncluded([days]), options, context).rows;
  assert.equal(d.expense!.date, '2026-10-05');
});

test('our own CSV export imports back as the same jobs, installments included', () => {
  const header = ['ชื่อโปรเจกต์', 'ประเภทงาน', 'ลูกค้า', 'มูลค่ารวม (บาท)', 'หัก ณ ที่จ่าย (%)', 'จำนวนภาษีหัก ณ ที่จ่าย (บาท)', 'ยอดได้รับแล้ว (บาท)', 'ยอดค้างชำระ (บาท)', 'สถานะโครงการ', 'เครดิตเทอม (วัน)', 'วันเริ่มงาน', 'วันดีล/วันเผยแพร่', 'กำหนดชำระเงิน', 'งวดชำระ', 'สถานะงวด', 'วันรับเงินจริง', 'หมายเหตุ'];
  const csv = grid('โปรเจกต์รายรับ', [
    header,
    ['รีวิวสินค้า', 'Sponsored Post', 'แบรนด์ A', 12000, 3, 360, 11640, 0, 'จ่ายแล้ว', 0, '2026-10-01', '2026-10-01', '2026-10-01', '-', '-', '2026-10-01', ''],
    ['ตัดต่อวิดีโอ', 'Video Production', 'ลูกค้า B', 30000, 0, 0, 10000, 0, 'แบ่งชำระเป็นงวด', 0, '-', '2026-09-20', '2026-09-30', 'งวดที่ 1', 'รับแล้ว', '2026-09-30', ''],
    ['ตัดต่อวิดีโอ', 'Video Production', 'ลูกค้า B', 0, 0, 0, 0, 20000, 'แบ่งชำระเป็นงวด', 0, '-', '2026-09-20', '2026-10-31', 'งวดที่ 2', 'รอชำระ', '-', ''],
  ]);
  const analysis = analyzeSheet(csv);
  assert.equal(analysis.columns.find(c => c.header === 'สถานะโครงการ')!.target, 'status');
  const rows = buildImportPlan([{ grid: csv, analysis }], options, context).rows.filter(r => r.state !== 'skip');
  assert.equal(rows.length, 2);
  const [review, video] = rows.map(r => r.job!);
  assert.equal(review.whtAmount, 360); assert.equal(review.received, 11640); assert.equal(review.payDate, '2026-10-01'); assert.equal(review.client, 'แบรนด์ A');
  assert.equal(video.value, 30000); assert.equal(video.status, 'installment');
  assert.deepEqual(video.installments!.map(i => [i.label, i.amount, i.status, i.paidAt ?? i.dueDate]), [['งวดที่ 1', 10000, 'paid', '2026-09-30'], ['งวดที่ 2', 20000, 'pending', '2026-10-31']]);
});

test('a date in a file or tab name is not used as the month of undated rows', () => {
  const rows = [['ชื่องาน', 'ราคา', 'วันเริ่มงาน'], ['งาน A', 5000, '-']];
  const exported = grid('โปรเจกต์รายรับ_กระรอกตุนเสบียง_2026-10-22', rows);
  const [a] = buildImportPlan([{ grid: exported, analysis: analyzeSheet(exported) }], options, context).rows;
  assert.equal(a.job!.postDate, undefined);
  assert.ok(!a.issues.includes('dateFromSheet'));
  const csv = { ...grid('ต.ค. 69', rows), fromFileName: true };
  assert.equal(analyzeSheet(csv).sheetMonth, null);
  assert.equal(analyzeSheet(grid('ต.ค. 69', rows)).sheetMonth, '2026-10');
});


// A workbook that keeps clients and projects in their own tabs and refers to them by code elsewhere,
// with a bank ledger and an expense register that list the same expenses (owner's test file, 2026-10-22).
const codedWorkbook = () => [
  grid('START HERE', [['Section', 'Details'], ['Purpose', 'Example bookkeeping'], ['Import testing', 'Do not import both expense lists']]),
  grid('Transactions', [
    ['Date', 'Type', 'Reference ID', 'Project ID', 'Client ID', 'Description', 'Category', 'Money In (THB)', 'Money Out (THB)', 'Use'],
    [date('2026-09-01'), 'Expense', 'E001', '', '', 'Design software', 'Software & Subscriptions', 0, 1599, 'Business'],
    [date('2026-09-03'), 'Expense', 'E002', 'P001', '', 'Freelance retoucher', 'Contractors', 0, 2000, 'Business'],
    [date('2026-09-18'), 'Income', 'INV-01', 'P001', 'C001', 'Client payment for INV-01', 'Client Payments', 30000, 0, 'Business'],
    [date('2026-09-19'), 'Transfer', 'TRF-01', '', '', 'Transfer to savings', 'Owner Transfer', 0, 5000, 'Transfer'],
    [date('2026-09-26'), 'Income', 'INV-02', 'P002', 'C002', 'Client payment for INV-02', 'Client Payments', 5000, 0, 'Business'],
  ]),
  grid('Invoices', [
    ['Invoice ID', 'Project ID', 'Client ID', 'Issue Date', 'Due Date', 'Invoiced (THB)', 'Received (THB)', 'Payment Status', 'Last Payment Date', 'Outstanding (THB)'],
    ['INV-01', 'P001', 'C001', date('2026-09-02'), date('2026-10-02'), 30000, 30000, 'Paid', date('2026-09-18'), 0],
    ['INV-02', 'P002', 'C002', date('2026-09-10'), date('2026-10-10'), 8000, 5000, 'Partially Paid', date('2026-09-26'), 3000],
    ['INV-03', 'P002', 'C002', date('2026-09-20'), date('2026-10-20'), 4000, 0, 'Unpaid', '', 4000],
  ]),
  grid('Projects', [
    ['Project ID', 'Project Name', 'Client ID', 'Contract Value (THB)', 'Project Status'],
    ['P001', 'Brand Refresh', 'C001', 30000, 'Completed'],
    ['P002', 'Video Package', 'C002', 12000, 'In Progress'],
  ]),
  grid('Clients', [['Client ID', 'Client Name', 'Email', 'Payment Terms'], ['C001', 'Example Studio Ltd.', 'hello@example.com', 'Net 30'], ['C002', 'Sample Co.', 'pay@example.com', 'Net 15']]),
  grid('Expenses', [
    ['Date', 'Expense ID', 'Category', 'Description', 'Project ID', 'Amount (THB)'],
    [date('2026-09-01'), 'E001', 'Software & Subscriptions', 'Design software', '', 1599],
    [date('2026-09-03'), 'E002', 'Contractors', 'Freelance retoucher', 'P001', 2000],
  ]),
];

test('codes: names come from the Clients and Projects tabs; code columns are never amounts', () => {
  const [, ledger, invoices, , clients, expenses] = codedWorkbook();
  assert.equal(analyzeSheet(clients).role, 'lookup');
  assert.equal(analyzeSheet(codedWorkbook()[0]).role, 'summary');
  assert.equal(targets(expenses)['Expense ID'], 'keep');
  assert.equal(targets(ledger)['Reference ID'], 'keep');
  assert.equal(targets(invoices)['Client ID'], 'client');
  assert.equal(targets(grid('Jobs', [['ID', 'Job', 'Price'], [1, 'Logo', 5000], [2, 'Poster', 3000]]))['ID'], 'keep');
});

test('codes: a project list, its invoices, the ledger and the expense register count everything once', () => {
  const sheets = codedWorkbook();
  const result = buildImportPlan(sheets.filter(g => !['START HERE', 'Clients'].includes(g.name)).map(g => ({ grid: g, analysis: analyzeSheet(g) })), options, context, sheets);
  const on = (r: { state: string; kind: string }) => r.state !== 'skip' && r.kind !== 'skip';
  assert.deepEqual(planTotals(result.rows, on), { jobs: 2, expenses: 2, value: 42000, received: 35000, pending: 7000, expenseAmount: 3599 });
  const jobs = result.rows.filter(r => r.job && on(r)).map(r => r.job!);
  const brand = jobs.find(j => j.name === 'Brand Refresh')!;
  assert.equal(brand.client, 'Example Studio Ltd.');
  assert.equal(brand.postDate, '2026-09-02');
  assert.equal(brand.payDate, '2026-09-18');
  assert.equal(brand.status, 'done');
  assert.match(brand.note!, /Invoice ID: INV-01/);
  // Two invoices for one project: the project, with each invoice as an installment.
  const video = jobs.find(j => j.name === 'Video Package')!;
  assert.equal(video.client, 'Sample Co.');
  assert.equal(video.isPosted, false);
  assert.deepEqual(video.installments!.map(i => [i.amount, i.status, i.dueDate]), [[5000, 'paid', '2026-09-26'], [3000, 'pending', '2026-10-10'], [4000, 'pending', '2026-10-20']]);
  // The same expense in the ledger and the register is imported once; the transfer not at all.
  const expenses = result.rows.filter(r => r.expense);
  assert.equal(expenses.filter(on).length, 2);
  assert.equal(expenses.find(r => r.sheet === 'Expenses' && r.rowNumber === 2)!.mergedInto, 'Transactions 2');
  assert.equal(expenses.filter(on).find(r => r.expense!.name === 'Freelance retoucher')!.expense!.category, 'จ้างงานต่อ (Outsource)');
  assert.ok(expenses.find(r => r.expense!.name === 'Transfer to savings')!.issues.includes('transfer'));
});

test('an email column is kept in the note, not taken as the job name', () => {
  const g = grid('Clients', [['Client', 'Email', 'Fee'], ['Example Studio', 'hello@example.com', 5000], ['Sample Co.', 'pay@example.com', 3000]]);
  assert.equal(targets(g)['Email'], 'keep');
});

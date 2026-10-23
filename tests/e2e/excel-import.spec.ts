import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

// Import from Excel (owner, 2026-10-22, free for every account): a sheet people already keep comes
// in through column matching and a review table, is saved with a batch tag, and can be undone.
// Computers and iPads have the button; the phone layout is unchanged.

test.use({ serviceWorkers: 'block' });

const user = { id: '44444444-4444-4444-8444-444444444444', email: 'excel-import@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = {
  jobs: [], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};

function sheetFile(): Buffer {
  const rows = [
    ['บัญชีงานปี 2567'],
    [],
    ['วันที่', 'ชื่องาน', 'ลูกค้า', 'ราคา', 'หัก ณ ที่จ่าย', 'สถานะ', 'วันที่รับเงิน', 'ช่องทาง'],
    ['15/10/2567', 'รีวิวสินค้า', 'แบรนด์ตัวอย่าง A', 12000, '3%', 'จ่ายแล้ว', '30/10/2567', 'TikTok'],
    ['20/10/2567', 'ถ่ายภาพแคมเปญ', 'บริษัท ตัวอย่าง จำกัด', 8000, '3%', 'ยังไม่จ่าย', '', 'IG'],
    ['', 'รวม', '', 20000, '', '', '', ''],
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'งาน');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['วันที่', 'รายการ', 'หมวด', 'จำนวนเงิน'], ['05/10/2567', 'ค่าโปรแกรมตัดต่อ', 'ซอฟต์แวร์', 790]]), 'รายจ่าย');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

async function open(page: Page, width: number, path: string, language: 'th' | 'en' = 'th') {
  const saved: any[] = [];
  await page.addInitScript((lang) => {
    localStorage.setItem('cashflow_language', lang);
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, language);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-4444444444', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', async route => {
    if (route.request().method() === 'POST') { saved.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, versions: {} } }); }
    return route.fulfill({ json: { snapshot, versions: { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } }, subscription: null } });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(path);
  return saved;
}

test('computer: a sheet is matched, reviewed, imported with a batch tag and can be undone', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  await page.getByTestId('jobs-import-button').click();
  const wizard = page.getByTestId('import-wizard');
  await wizard.locator('#import-sheet-file').setInputFiles({ name: 'งานของฉัน.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: sheetFile() });

  // Column matching: guessed from the headers, and the extra column is kept in the note.
  await expect(wizard.getByRole('heading', { name: 'จับคู่คอลัมน์' })).toBeVisible();
  await expect(wizard.getByRole('combobox', { name: 'ใช้คอลัมน์ ชื่องาน เป็น' })).toHaveValue('name');
  await expect(wizard.getByRole('combobox', { name: 'ใช้คอลัมน์ ราคา เป็น' })).toHaveValue('value');
  await expect(wizard.getByRole('combobox', { name: 'ใช้คอลัมน์ หัก ณ ที่จ่าย เป็น' })).toHaveValue('whtRate');
  await expect(wizard.getByRole('combobox', { name: 'ใช้คอลัมน์ ช่องทาง เป็น' })).toHaveValue('keep');
  await wizard.getByRole('button', { name: 'ตรวจทานข้อมูล' }).click();

  // Review: two jobs and one expense; the file's total matches; the total row is not imported.
  await expect(wizard.getByTestId('import-job-count')).toHaveText('2 งาน');
  await expect(wizard.getByTestId('import-expense-count')).toHaveText('1 รายการ');
  await expect(wizard.getByText('ตรงกัน ฿20,000')).toBeVisible();
  await expect(wizard.getByText('แถวรวมยอด')).toBeVisible();
  await wizard.getByRole('textbox', { name: 'ชื่อแถว 5' }).fill('ถ่ายภาพแคมเปญ ปีใหม่');
  await wizard.getByTestId('import-commit').click();

  await expect(wizard.getByRole('heading', { name: 'นำเข้าเรียบร้อย' })).toBeVisible();
  await expect.poll(() => saved.flatMap(body => body?.changes || []).filter((c: any) => c.data?.importBatchId).length).toBe(3);
  const jobsSaved = saved.flatMap(body => body?.changes || []).filter((c: any) => c.table === 'cashflow_jobs' && c.data?.importBatchId).map((c: any) => c.data);
  const paid = jobsSaved.find((j: any) => j.name === 'รีวิวสินค้า');
  expect(paid).toMatchObject({ value: 12000, whtRate: 3, whtAmount: 360, received: 11640, pending: 0, status: 'done', payDate: '2024-10-30', postDate: '2024-10-15', note: 'ช่องทาง: TikTok' });
  expect(jobsSaved.some((j: any) => j.name === 'ถ่ายภาพแคมเปญ ปีใหม่')).toBe(true);

  // Undo removes everything this import added.
  await wizard.getByRole('button', { name: 'ยกเลิกการนำเข้านี้' }).click();
  await expect(wizard.getByRole('heading', { name: 'ยกเลิกการนำเข้าแล้ว' })).toBeVisible();
  await expect.poll(() => saved.flatMap(body => body?.changes || []).filter((c: any) => c.op === 'delete').length).toBe(3);
  await wizard.getByRole('button', { name: 'ปิด', exact: true }).last().click();
  await expect(page.locator('table tbody tr')).toHaveCount(0);
});

test('settings: one import on a computer takes Excel and the .json backup, which still asks before replacing data', async ({ page }) => {
  await open(page, 1280, '/settings');
  // The browser tab shows the English name, in Thai mode too (owner, 2026-10-23).
  await expect(page).toHaveTitle('Krarok Tunngern');
  await page.getByRole('button', { name: /สำรอง & นำเข้าข้อมูล/ }).click();
  await expect(page.getByTestId('settings-import-button')).toBeVisible();
  // One import card (owner, 2026-10-23): the separate .json drop zone is gone on computers.
  await expect(page.locator('#json-settings-uploader')).toHaveCount(0);
  await page.getByTestId('settings-import-button').click();
  const backup = JSON.stringify({ jobs: [], expenses: [], goals: [] });
  await page.getByTestId('import-wizard').locator('#import-sheet-file').setInputFiles({ name: 'krarok-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByText('นำเข้าข้อมูลจากไฟล์สำรอง')).toBeVisible();
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
});

test('phone: the jobs page and settings stay as they were, with no import button', async ({ page }) => {
  await open(page, 390, '/jobs');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await expect(page.getByTestId('jobs-import-button')).toHaveCount(0);
  await page.goto('/settings');
  await page.getByRole('button', { name: /สำรอง & นำเข้าข้อมูล/ }).click();
  await expect(page.getByTestId('settings-import-button')).toHaveCount(0);
  // The phone keeps its .json restore card as it was.
  await expect(page.locator('#json-settings-uploader')).toHaveCount(1);
  await expect(page.getByText('ลากไฟล์ .json มาวางที่นี่')).toBeVisible();
});

test('English: the import reads in English from start to finish', async ({ page }) => {
  await open(page, 1280, '/jobs', 'en');
  await page.getByTestId('jobs-import-button').click();
  const wizard = page.getByTestId('import-wizard');
  const thai = /[ก-ฺเ-๛]/;
  // Text from the person's file is Thai on purpose; the app's own words must not be.
  const appText = async () => (await wizard.evaluate(el => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('td:nth-child(2), td:nth-child(4), td:nth-child(5), option, input, [title]').forEach(n => n.remove());
    return clone.innerText;
  })).split('\n').filter(line => thai.test(line));
  expect(await appText()).toEqual([]);
  await wizard.locator('#import-sheet-file').setInputFiles({ name: 'jobs.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: sheetFile() });
  await expect(wizard.getByRole('heading', { name: 'Match columns' })).toBeVisible();
  await wizard.getByRole('button', { name: 'Review the data' }).click();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('2 jobs');
  await expect(wizard.getByText('Total row', { exact: true })).toBeVisible();
});

const soloFile = () => ({ name: 'solo_freelancer_september_2026.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: readFileSync('tests/fixtures/import/solo_freelancer_september_2026.xlsx') });
const savedRows = (saved: any[], table: string) => saved.flatMap(body => body?.changes || []).filter((c: any) => c.table === table && c.op === 'set' && c.data?.importBatchId).map((c: any) => c.data);

test('computer: the owner\'s code-linked workbook matches its Dashboard, saves with source links, and is not imported twice', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  await page.getByTestId('jobs-import-button').click();
  const wizard = page.getByTestId('import-wizard');
  await wizard.locator('#import-sheet-file').setInputFiles(soloFile());
  await wizard.getByRole('tab', { name: 'Clients' }).click();
  await expect(wizard.getByText('แท็บนี้เป็นรายชื่อสำหรับแปลงรหัส เช่น C001 คือ Northstar Creative Ltd.', { exact: false })).toBeVisible();
  await wizard.getByRole('button', { name: 'ตรวจทานข้อมูล' }).click();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('8 งาน');
  await expect(wizard.getByTestId('import-expense-count')).toHaveText('30 รายการ');
  await expect(wizard.getByText('มูลค่า ฿167,000 · รับแล้ว ฿84,000 · ค้างรับ ฿83,000')).toBeVisible();
  await expect(wizard.getByTestId('import-total-check')).toHaveText('ตรงกับยอดในไฟล์ทุกตัว (7 ยอด)');
  // Where a row comes from: the file's cells, the field each went to, and why.
  await wizard.getByRole('button', { name: 'ดูที่มาของแถว 2' }).first().click();
  await expect(wizard.getByTestId('import-row-detail')).toContainText('ในไฟล์ · แท็บ');
  await wizard.getByTestId('import-commit').click();
  await expect(wizard.getByRole('heading', { name: 'นำเข้าเรียบร้อย' })).toBeVisible();
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(8);
  const jobsSaved = savedRows(saved, 'cashflow_jobs');
  expect(jobsSaved.map((j: any) => j.importSource.ref).sort()).toEqual(['INV-2609-001', 'INV-2609-002', 'INV-2609-003', 'INV-2609-004', 'INV-2609-005', 'INV-2609-006', 'INV-2609-007', 'INV-2609-008']);
  expect(jobsSaved.reduce((sum: number, j: any) => sum + j.received, 0)).toBe(84000);
  expect(savedRows(saved, 'cashflow_expenses')).toHaveLength(30);
  expect(jobsSaved.every((j: any) => /^[0-9a-f]{64}$/.test(j.importSource.fingerprint))).toBe(true);
  await wizard.getByRole('button', { name: 'ปิด', exact: true }).last().click();

  // The same file again: recognised, nothing to add.
  await page.getByTestId('jobs-import-button').click();
  await wizard.locator('#import-sheet-file').setInputFiles(soloFile());
  await expect(wizard.getByTestId('import-seen-before')).toBeVisible();
  await wizard.getByRole('button', { name: 'ตรวจทานข้อมูล' }).click();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('0 งาน');
  await expect(wizard.getByTestId('import-expense-count')).toHaveText('0 รายการ');
  await expect(wizard.getByTestId('import-commit')).toBeDisabled();
});

test('computer: rows that need a guess wait to be confirmed; a failed save can be tried again', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['ชื่องาน', 'ลูกค้า', 'ราคา', 'วันที่', 'สถานะ'],
    ['ออกแบบโลโก้', 'ลูกค้าตัวอย่าง', 5000, '05/10/2569', 'ยังไม่จ่าย'],
    ['ถ่ายสินค้า', 'ลูกค้าตัวอย่าง', 3000, 'ยังไม่ได้นัด', 'ยังไม่จ่าย'],
    ['ตัดต่อคลิป', 'ลูกค้าตัวอย่าง', 4000, '08/10/2569', 'จ่ายแล้ว'],
  ]), 'งาน');
  await page.getByTestId('jobs-import-button').click();
  const wizard = page.getByTestId('import-wizard');
  await wizard.locator('#import-sheet-file').setInputFiles({ name: 'jobs.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })) });
  await wizard.getByRole('button', { name: 'ตรวจทานข้อมูล' }).click();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('1 งาน');
  // An unreadable date, and a paid date taken from the job's own date: both wait for the person.
  await expect(wizard.getByTestId('import-confirm-count')).toHaveText('อีก 2 แถวรอคุณยืนยัน ยังไม่นำเข้า');
  await wizard.getByRole('checkbox', { name: 'ยืนยันและนำเข้าแถว 3' }).check();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('2 งาน');
  await wizard.getByTestId('import-confirm-groups').getByRole('button', { name: 'ยืนยันทั้ง 1 แถว' }).click();
  await expect(wizard.getByTestId('import-job-count')).toHaveText('3 งาน');
  await expect(wizard.getByTestId('import-confirm-groups')).toHaveCount(0);

  // The server refuses the first save: the window says so and offers to try again.
  let fail = true;
  await page.route('**/api/data*', async route => {
    if (route.request().method() === 'POST' && fail) return route.fulfill({ status: 503, json: { error: 'ระบบไม่พร้อมชั่วคราว' } });
    return route.fallback();
  });
  await wizard.getByTestId('import-commit').click();
  await expect(wizard.getByRole('heading', { name: 'บันทึกขึ้นระบบไม่สำเร็จ' })).toBeVisible({ timeout: 15000 });
  fail = false;
  await wizard.getByRole('button', { name: 'ลองบันทึกอีกครั้ง' }).click();
  await expect(wizard.getByRole('heading', { name: 'นำเข้าเรียบร้อย' })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(3);
});

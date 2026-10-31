import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

// Bringing data in as a chat with เลขากระรอก (owner, 2026-10-31; the import itself since 2026-10-22, free for every account):
// a file dropped in the chat is read by the import's rules; the chat says which columns matched, which it guessed, which the
// app has no field for, and which rows need a decision, each with fixes; typing to เลขา is free with caps; nothing is saved
// until นำเข้า, and the whole import can be undone. Computers, iPads and phones (owner: "ทำมือถือด้วยเลย").

test.use({ serviceWorkers: 'block' });

const user = { id: '44444444-4444-4444-8444-444444444444', email: 'excel-import@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = {
  jobs: [], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
  job_types: ['Sponsored Post'], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
const bookFile = (name: string, rows: (string | number)[][], tab = 'งาน') => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), tab);
  return { name, mimeType: XLSX_TYPE, buffer: Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })) };
};

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
  await page.goto(noRadar(path));
  return saved;
}
const changes = (saved: any[]) => saved.flatMap(body => body?.changes || []);
const savedRows = (saved: any[], table: string) => changes(saved).filter((c: any) => c.table === table && c.op === 'set' && c.data?.importBatchId).map((c: any) => c.data);

test('computer: the chat reads the file, says what matched and what has no field, and imports a batch that can be undone', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  await expect(chat.getByRole('heading', { name: 'ย้ายข้อมูลเข้าแอป' })).toBeVisible();
  await chat.locator('#import-sheet-file').setInputFiles({ name: 'งานของฉัน.xlsx', mimeType: XLSX_TYPE, buffer: sheetFile() });

  // เลขา's reading: the file as the person's message, the tabs, the matched columns, the one the app has no field for.
  await expect(chat.getByText('งานของฉัน.xlsx')).toBeVisible();
  const read = chat.getByTestId('import-read');
  await expect(read).toContainText('อ่านไฟล์แล้วครับ');
  // Three rows in the tab: two jobs and the total row, which is skipped and said so below.
  await expect(read).toContainText('แท็บ “งาน” มี 3 แถว');
  const columns = read.getByTestId('import-columns').first();
  await expect(columns).toContainText('ชื่องาน');
  await expect(columns).toContainText('→ มูลค่างาน');
  await expect(columns).toContainText('→ หัก ณ ที่จ่าย (%)');
  await expect(read.getByTestId('import-columns-kept').first()).toContainText('ยังไม่มีช่องในแอปสำหรับ “ช่องทาง”');
  await expect(chat.getByTestId('import-quiet')).toContainText('แถวรวมยอด 1');

  // The summary: two jobs and one expense; the file's own total matches.
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 งาน');
  await expect(chat.getByTestId('import-expense-count')).toHaveText('1 รายการ');
  await expect(chat.getByTestId('import-total-check')).toHaveText('ตรงกับยอดในไฟล์ ฿20,000');
  await chat.getByRole('button', { name: 'ดูทุกแถวก่อน' }).click();
  await chat.getByRole('textbox', { name: 'ชื่อแถว 5' }).fill('ถ่ายภาพแคมเปญ ปีใหม่');
  await chat.getByTestId('import-commit').click();

  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'saved');
  await expect(chat.getByText('นำเข้าเรียบร้อยครับ')).toBeVisible();
  await expect.poll(() => changes(saved).filter((c: any) => c.data?.importBatchId).length).toBe(3);
  const jobsSaved = savedRows(saved, 'cashflow_jobs');
  expect(jobsSaved.find((j: any) => j.name === 'รีวิวสินค้า')).toMatchObject({ value: 12000, whtRate: 3, whtAmount: 360, received: 11640, pending: 0, status: 'done', payDate: '2024-10-30', postDate: '2024-10-15', note: 'ช่องทาง: TikTok' });
  expect(jobsSaved.some((j: any) => j.name === 'ถ่ายภาพแคมเปญ ปีใหม่')).toBe(true);

  // Undo removes everything this import added.
  await chat.getByRole('button', { name: 'ยกเลิกการนำเข้านี้' }).click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'undone');
  await expect.poll(() => changes(saved).filter((c: any) => c.op === 'delete').length).toBe(3);
  await chat.getByRole('button', { name: 'ปิด', exact: true }).last().click();
  await expect(page.locator('table tbody tr')).toHaveCount(0);
});

test('settings: one import takes Excel and the .json backup, which still asks before replacing data', async ({ page }) => {
  await open(page, 1280, '/settings');
  await expect(page).toHaveTitle('Krarok Tunngern');
  await page.getByRole('button', { name: /สำรอง & นำเข้าข้อมูล/ }).click();
  await expect(page.getByTestId('settings-import-button')).toBeVisible();
  await expect(page.locator('#json-settings-uploader')).toHaveCount(0);
  await page.getByTestId('settings-import-button').click();
  const backup = JSON.stringify({ jobs: [], expenses: [], goals: [] });
  await page.getByTestId('import-wizard').locator('#import-sheet-file').setInputFiles({ name: 'krarok-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByText('นำเข้าข้อมูลจากไฟล์สำรอง')).toBeVisible();
  await expect(page.getByTestId('import-wizard')).toHaveCount(0);
});

test('phone: the jobs page tools and settings open the chat as a sheet; it imports, fits the screen, nothing overlaps', async ({ page }) => {
  const saved = await open(page, 390, '/jobs');
  await expect(page.getByTestId('jobs-import-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'ตัวกรองและเครื่องมืองาน' }).click();
  await page.getByTestId('jobs-import-button-phone').click();
  const chat = page.getByTestId('import-wizard');
  await expect(chat.getByText('แตะเพื่อเลือกไฟล์')).toBeVisible();
  await chat.locator('#import-sheet-file').setInputFiles({ name: 'jobs.xlsx', mimeType: XLSX_TYPE, buffer: sheetFile() });
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 งาน');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = (await chat.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  for (const at of [0, 0.5, 1]) {
    await chat.locator('.ic-scroll').evaluate((el, share) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * share; }, at);
    await page.waitForTimeout(150);
    expect(await textOverlapIssues(page), `at ${at}`).toEqual([]);
  }
  await chat.getByRole('button', { name: 'ดูทุกแถวก่อน' }).click();
  await expect(chat.getByTestId('import-review').locator('li')).not.toHaveCount(0);
  await chat.getByTestId('import-commit').click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'saved');
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(2);
  await chat.getByRole('button', { name: 'ปิด', exact: true }).last().click();

  await page.goto(noRadar('/settings'));
  await page.getByRole('button', { name: /สำรอง & นำเข้าข้อมูล/ }).click();
  await expect(page.getByTestId('settings-import-button')).toBeVisible();
});

test('English: the chat reads in English from start to finish', async ({ page }) => {
  await open(page, 1280, '/jobs', 'en');
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  const thai = /[ก-ฺเ-๛]/;
  // Text from the person's file is Thai on purpose; the app's own words must not be.
  const appText = async () => (await chat.evaluate(el => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.ic-matched li span.truncate, .ic-ask b:first-child, .ic-ask .text-brand-muted, .ic-row.is-me, option, input, [title], .ic-issue-rows, .ic-note-row p, .ic-columns b, .ic-card-title').forEach(n => n.remove());
    return clone.innerText;
  })).split('\n').filter(line => thai.test(line));
  expect(await appText()).toEqual([]);
  await chat.locator('#import-sheet-file').setInputFiles({ name: 'jobs.xlsx', mimeType: XLSX_TYPE, buffer: sheetFile() });
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 jobs');
  await expect(chat.getByText('I have read the file.')).toBeVisible();
});

const soloFile = () => ({ name: 'solo_freelancer_september_2026.xlsx', mimeType: XLSX_TYPE, buffer: readFileSync('tests/fixtures/import/solo_freelancer_september_2026.xlsx') });

test('computer: the owner\'s code-linked workbook matches its Dashboard, saves with source links, and is not imported twice', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  await chat.locator('#import-sheet-file').setInputFiles(soloFile());
  await expect(chat.getByTestId('import-tab-left').filter({ hasText: 'Clients' })).toContainText('รายชื่อสำหรับแปลงรหัส');
  await expect(chat.getByTestId('import-job-count')).toHaveText('8 งาน');
  await expect(chat.getByTestId('import-expense-count')).toHaveText('30 รายการ');
  await expect(chat.getByTestId('import-total-check')).toHaveText('ตรงกับยอดในไฟล์ทุกตัว (7 ยอด)');
  await chat.getByRole('button', { name: 'ดูทุกแถวก่อน' }).click();
  await chat.getByRole('button', { name: 'ดูที่มาของแถว 2' }).first().click();
  await expect(chat.getByTestId('import-row-detail')).toContainText('ในไฟล์ · แท็บ');
  await chat.getByTestId('import-commit').click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'saved');
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(8);
  const jobsSaved = savedRows(saved, 'cashflow_jobs');
  expect(jobsSaved.map((j: any) => j.importSource.ref).sort()).toEqual(['INV-2609-001', 'INV-2609-002', 'INV-2609-003', 'INV-2609-004', 'INV-2609-005', 'INV-2609-006', 'INV-2609-007', 'INV-2609-008']);
  expect(jobsSaved.reduce((sum: number, j: any) => sum + j.received, 0)).toBe(84000);
  expect(savedRows(saved, 'cashflow_expenses')).toHaveLength(30);
  expect(jobsSaved.every((j: any) => /^[0-9a-f]{64}$/.test(j.importSource.fingerprint))).toBe(true);
  await chat.getByRole('button', { name: 'ปิด', exact: true }).last().click();

  // The same file again: recognised, nothing to add.
  await page.getByTestId('jobs-import-button').click();
  await chat.locator('#import-sheet-file').setInputFiles(soloFile());
  await expect(chat.getByTestId('import-seen-before')).toBeVisible();
  await expect(chat.getByTestId('import-job-count')).toHaveText('0 งาน');
  await expect(chat.getByTestId('import-expense-count')).toHaveText('0 รายการ');
  await expect(chat.getByTestId('import-commit')).toBeDisabled();
});

test('computer: rows that need a decision are grouped with fixes; tapping one decides the group; a failed save can be tried again', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  await chat.locator('#import-sheet-file').setInputFiles(bookFile('jobs.xlsx', [
    ['ชื่องาน', 'ลูกค้า', 'ราคา', 'วันที่', 'สถานะ'],
    ['ออกแบบโลโก้', 'ลูกค้าตัวอย่าง', 5000, '05/10/2569', 'ยังไม่จ่าย'],
    ['ถ่ายสินค้า', 'ลูกค้าตัวอย่าง', 3000, 'ยังไม่ได้นัด', 'ยังไม่จ่าย'],
    ['ตัดต่อคลิป', 'ลูกค้าตัวอย่าง', 4000, '08/10/2569', 'จ่ายแล้ว'],
  ]));
  await expect(chat.getByTestId('import-job-count')).toHaveText('1 งาน');
  // An unreadable date, and a paid date taken from the job's own date: two groups waiting for the person.
  const unreadable = chat.locator('[data-issue="dateUnreadable"]');
  await expect(unreadable).toContainText('แถว 3');
  await unreadable.getByRole('button', { name: 'ใช้วันนี้' }).click();
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 งาน');
  await expect(chat.locator('[data-issue="dateUnreadable"]')).toHaveCount(0);
  await chat.locator('[data-issue="paidDateFromDate"]').getByRole('button', { name: 'นำเข้าตามที่อ่านได้' }).click();
  await expect(chat.getByTestId('import-job-count')).toHaveText('3 งาน');
  // เปลี่ยนกลับ takes the last fix back.
  await chat.getByRole('button', { name: 'เปลี่ยนกลับการแก้ล่าสุด' }).click();
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 งาน');
  await chat.locator('[data-issue="paidDateFromDate"]').getByRole('button', { name: 'นำเข้าตามที่อ่านได้' }).click();
  await expect(chat.getByTestId('import-job-count')).toHaveText('3 งาน');

  // The server refuses the first save: the chat says so and offers to try again.
  let fail = true;
  await page.route('**/api/data*', async route => {
    if (route.request().method() === 'POST' && fail) return route.fulfill({ status: 503, json: { error: 'ระบบไม่พร้อมชั่วคราว' } });
    return route.fallback();
  });
  await chat.getByTestId('import-commit').click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'failed', { timeout: 15000 });
  fail = false;
  await chat.getByRole('button', { name: 'ลองบันทึกอีกครั้ง' }).click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'saved', { timeout: 15000 });
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(3);
});

// A file from another app (owner, 2026-10-30): the columns the rules do not know are sent to เลขากระรอก (headers and a few
// samples only), its suggestions wait for ใช่, and nothing is read from them until the person confirms.
test('computer: unknown columns get เลขากระรอก suggestions to confirm; only their headers and samples are sent', async ({ page }) => {
  const saved = await open(page, 1280, '/jobs');
  const asked: any[] = [];
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    if (body?.action !== 'map-columns') return route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } });
    asked.push(body);
    await new Promise(resolve => setTimeout(resolve, 300));
    const byHeader = Object.fromEntries(body.columns.map((c: any) => [c.header, c.index]));
    return route.fulfill({ json: { available: true, columns: [{ index: byHeader['Bill to'], field: 'client' }, { index: byHeader['ช่องทาง'], field: 'type' }] } });
  });
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  await chat.locator('#import-sheet-file').setInputFiles(bookFile('other-app.xlsx', [['Project', 'Bill to', 'Fee THB', 'Collected', 'ช่องทาง'], ['รีวิวสินค้า', 'ร้านบี', 12000, 12000, 'TikTok'], ['ถ่ายภาพแคมเปญ', 'บริษัท เอ', 8000, 0, 'IG']], 'Export'));
  await expect(chat.getByTestId('import-column-ask')).toHaveCount(2);
  expect(asked).toHaveLength(1);
  expect(asked[0].columns.map((c: any) => c.header)).toEqual(['Bill to', 'ช่องทาง']);
  expect(asked[0].columns[0].samples).toEqual(['ร้านบี', 'บริษัท เอ']);
  expect(asked[0].taken).toEqual(expect.arrayContaining(['name', 'value', 'received']));
  await expect(chat.getByTestId('import-column-ask').first()).toContainText('เลขาแนะนำ');
  // Not importable until both are confirmed.
  await expect(chat.getByTestId('import-commit')).toBeDisabled();
  await expect(chat.getByTestId('import-columns-to-confirm')).toContainText('Bill to');
  await chat.getByRole('button', { name: 'ยืนยันว่าคอลัมน์ Bill to คือ ลูกค้า' }).click();
  await chat.getByRole('button', { name: 'ยืนยันว่าคอลัมน์ ช่องทาง คือ ประเภทงาน' }).click();
  await expect(chat.getByTestId('import-column-ask')).toHaveCount(0);
  await expect(chat.getByTestId('import-job-count')).toHaveText('2 งาน');
  await chat.getByTestId('import-commit').click();
  await expect(chat.getByTestId('import-save-state')).toHaveAttribute('data-state', 'saved');
  await expect.poll(() => savedRows(saved, 'cashflow_jobs').length).toBe(2);
  expect(savedRows(saved, 'cashflow_jobs').map((job: any) => [job.name, job.client, job.type, job.value])).toEqual(expect.arrayContaining([['รีวิวสินค้า', 'ร้านบี', 'TikTok', 12000], ['ถ่ายภาพแคมเปญ', 'บริษัท เอ', 'IG', 8000]]));
});

// Typing to เลขา (owner, 2026-10-31: free for every account, 10 a file, 3 files a day): only headers, fields, 3 samples and
// problem counts are sent; the reply's actions are applied by the app's rules and can be taken back.
test('computer: a typed message is answered with fixes the app applies; the rows themselves are never sent; เปลี่ยนกลับ restores', async ({ page }) => {
  await open(page, 1280, '/jobs');
  const asked: any[] = [];
  await page.route('**/api/assistant', async route => {
    const body = route.request().postDataJSON();
    if (body?.action === 'map-columns') return route.fulfill({ json: { available: true, columns: [] } });
    if (body?.action !== 'import-chat') return route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } });
    asked.push(body);
    return route.fulfill({ json: { available: true, reply: 'ใส่วันสิ้นเดือนให้ 2 แถวแล้วครับ', actions: [{ type: 'fillDate', issue: 'noDate', mode: 'monthEnd' }] } });
  });
  await page.getByTestId('jobs-import-button').click();
  const chat = page.getByTestId('import-wizard');
  await chat.locator('#import-sheet-file').setInputFiles(bookFile('jobs.xlsx', [
    ['ชื่องาน', 'ลูกค้า', 'ราคา', 'วันที่'],
    ['ออกแบบโลโก้', 'ร้านเอ', 5000, '05/10/2569'],
    ['ถ่ายสินค้า', 'ร้านบี', 3000, ''],
    ['ตัดต่อคลิป', 'ร้านซี', 4000, ''],
  ]));
  await expect(chat.locator('[data-issue="noDate"]')).toContainText('2 แถวไม่มีวันที่');
  await expect(chat.getByTestId('import-chat-left')).toHaveText('คุยเรื่องไฟล์นี้ได้อีก 10 ข้อความ');
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('แถวที่ไม่มีวันที่ ใช้วันสุดท้ายของเดือนแทน');
  await chat.getByRole('button', { name: 'ส่งข้อความ' }).click();
  await expect(chat.getByTestId('import-chat-reply').last()).toHaveText('ใส่วันสิ้นเดือนให้ 2 แถวแล้วครับ');
  await expect(chat.locator('[data-issue="noDate"]')).toHaveCount(0);
  await expect(chat.getByTestId('import-chat-left')).toHaveText('คุยเรื่องไฟล์นี้ได้อีก 9 ข้อความ');
  // What went out: the message, the tab, its columns with short samples and the problem counts; no row as a whole.
  expect(asked).toHaveLength(1);
  expect(asked[0].text).toBe('แถวที่ไม่มีวันที่ ใช้วันสุดท้ายของเดือนแทน');
  expect(asked[0].issues).toEqual([{ code: 'noDate', count: 2 }]);
  expect(asked[0].sheets[0].columns.every((c: any) => c.samples.length <= 3)).toBe(true);
  expect(JSON.stringify(asked[0])).not.toContain('rowNumber');
  await chat.getByRole('button', { name: 'เปลี่ยนกลับ', exact: true }).click();
  await expect(chat.locator('[data-issue="noDate"]')).toContainText('2 แถวไม่มีวันที่');
  // At the cap the box says so and the buttons still work.
  await page.unroute('**/api/assistant');
  await page.route('**/api/assistant', route => route.fulfill({ status: 429, json: { error: 'ทำรายการบ่อยเกินไป กรุณารอสักครู่' } }));
  await chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' }).fill('ข้ามแถวที่ไม่มีวันที่');
  await chat.getByRole('button', { name: 'ส่งข้อความ' }).click();
  await expect(chat.getByTestId('import-chat-reply').last()).toContainText('คุยเรื่องไฟล์นี้ครบแล้วสำหรับวันนี้');
  await expect(chat.getByRole('textbox', { name: 'ข้อความถึงเลขากระรอก' })).toBeDisabled();
  await chat.locator('[data-issue="noDate"]').getByRole('button', { name: 'ใช้วันนี้' }).click();
  await expect(chat.locator('[data-issue="noDate"]')).toHaveCount(0);
});

test('computer and iPad: the chat fits, nothing overlaps while it scrolls', async ({ page }) => {
  for (const width of [1280, 1024, 768]) {
    await open(page, width, '/jobs');
    await page.getByTestId('jobs-import-button').click();
    const chat = page.getByTestId('import-wizard');
    await chat.locator('#import-sheet-file').setInputFiles(soloFile());
    await expect(chat.getByTestId('import-job-count')).toHaveText('8 งาน');
    for (const at of [0, 0.5, 1]) {
      await chat.locator('.ic-scroll').evaluate((el, share) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * share; }, at);
      await page.waitForTimeout(150);
      expect(await textOverlapIssues(page), `${width}px at ${at}`).toEqual([]);
    }
    await page.keyboard.press('Escape');
    await expect(chat).toHaveCount(0);
  }
});

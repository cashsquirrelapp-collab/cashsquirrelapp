import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// รายจ่ายจากชีต (owner, 2026-11-14: "ทำดึงรายจ่ายจากชีตต่อเลย"), the same as the jobs page: the expenses page as it is with
// one line on top, ข้อมูลจากชีต <file> · อัปเดต 09:12 · เปิดชีต (the expense tab); the sheet's expense rows become expenses
// (the one เลขา already saved is linked, not added twice; the total row and a personal row stay out); an expense's details
// say its tab and row, with ดูในชีต opening that very row. Google and the backend are mocked.

test.use({ serviceWorkers: 'block' });

const user = { id: '66666666-6666-4666-8666-666666666667', email: 'sync-expenses@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const FILE = { id: 'file-12345678', name: 'บัญชีร้าน 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
const col = (index: number, header: string, target: string) => ({ index, header, target });
const MAP = { fileId: FILE.id, at: '2026-11-14T02:00:00.000Z', tabs: [
  { name: 'รายรับ', gid: 812, headerRow: 0, kind: 'jobs', use: true, columns: [col(0, 'วันที่', 'postDate'), col(1, 'ชื่องาน', 'name'), col(2, 'ค่าจ้าง', 'value')] },
  { name: 'รายจ่าย', gid: 905, headerRow: 0, kind: 'expenses', use: true, columns: [
    col(0, 'วันที่', 'date'), col(1, 'รายการ', 'name'), col(2, 'หมวดหมู่', 'category'), col(3, 'จำนวนเงิน', 'amount'), col(4, 'ธุรกิจ/ส่วนตัว', 'use'), col(5, 'หมายเหตุ', 'note')] },
] };
const c = (text: string, extra: Record<string, unknown> = {}) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : (text || null), text, ...extra });
const d = (text: string, iso: string) => c(text, { date: iso });
const JOB_ROWS = [['วันที่', 'ชื่องาน', 'ค่าจ้าง'].map(t => c(t))];
const EXPENSE_ROWS = [
  ['วันที่', 'รายการ', 'หมวดหมู่', 'จำนวนเงิน', 'ธุรกิจ/ส่วนตัว', 'หมายเหตุ'].map(t => c(t)),
  [d('2/11/2569', '2026-11-02'), c('ค่าเช่าอุปกรณ์ถ่ายทำ'), c('อุปกรณ์'), c('3,500'), c('ธุรกิจ'), c('กล้องและไฟ')],
  [d('5/11/2569', '2026-11-05'), c('ค่าเดินทางไปกองถ่าย'), c('เดินทาง'), c('420'), c('ธุรกิจ'), c('')],
  [d('7/11/2569', '2026-11-07'), c('ค่าข้าวครอบครัว'), c('อื่นๆ'), c('650'), c('ส่วนตัว'), c('')],
  [d('9/11/2569', '2026-11-09'), c('ค่าโฆษณาเพจ'), c('การตลาด'), c('1,200'), c('ธุรกิจ'), c('')],
  [c(''), c('รวม'), c(''), c('5,770'), c(''), c('')],
];
// Saved from เลขา's chat before the page read the sheet: linked to row 5, never added again.
const chatExpense = { id: 'chat-expense-1', name: 'ค่าโฆษณาเพจ', category: 'Marketing', amount: 1200, date: '2026-11-09', note: '' };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 40000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: { 'chat-expense-1': 1 }, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, size: { width: number; height: number }, labsOn: string[]) {
  const posts: unknown[] = [];
  let reads = 0;
  await page.clock.setFixedTime(new Date('2026-11-14T09:12:00+07:00'));
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_theme_pref', JSON.stringify({ mode: 'light', asked: true })); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-6666666667', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot: { jobs: [], expenses: [chatExpense], goals: [], invoices: [], settings, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: labsOn } } }));
  await page.route('**/api/google', route => {
    const status = { google: { configured: true, connected: true, email: 'mew@example.com', file: FILE, map: MAP } };
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === 'read') {
      reads += 1;
      return route.fulfill({ json: { ...status, tabs: [{ name: 'รายรับ', gid: 812, truncated: false, rows: JOB_ROWS }, { name: 'รายจ่าย', gid: 905, truncated: false, rows: EXPENSE_ROWS }], readAt: '2026-11-14T02:12:00.000Z' } });
    }
    return route.fulfill({ json: status });
  });
  await page.setViewportSize(size);
  await page.goto(noRadar('/incomeExpense'));
  await loadLayoutFonts(page);
  return { posts, reads: () => reads };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the expenses page on the ${device.name} keeps a copy of the sheet's expenses; an expense says its row and ดูในชีต opens it`, async ({ page }) => {
    const { posts, reads } = await open(page, device, ['sheets', 'sheetMap', 'sheetJobs']);
    const line = page.getByTestId('sheet-expenses-line');
    await expect(line).toContainText('ข้อมูลจากชีต บัญชีร้าน 2569');
    await expect(line).toContainText('อัปเดต 09:12');
    await expect(line.getByRole('link', { name: 'เปิดชีต' })).toHaveAttribute('href', `${FILE.url}#gid=905`);
    // Four rows, the personal row and the total row left out, the chat's expense linked: three expenses, not four.
    const rows = device.name === 'computer' ? page.locator('table tbody tr[data-expense-id]') : page.locator('.ksm-moneylist [data-expense-id]');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'ค่าข้าวครอบครัว' })).toHaveCount(0);
    await expect.poll(() => JSON.stringify(posts)).toContain('"sheetLink":{"fileId":"file-12345678","tab":"รายจ่าย","row":5,"gid":905}');
    expect(reads()).toBe(1);
    await page.waitForTimeout(400);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheet-expenses-${device.name}.png` });

    await rows.filter({ hasText: 'ค่าเช่าอุปกรณ์ถ่ายทำ' }).first().click();
    if (device.name === 'phone') await page.getByRole('menuitem', { name: 'แก้ไข' }).click();
    const row = page.getByTestId('sheet-row-line');
    await expect(row).toContainText('อยู่ในชีต บัญชีร้าน 2569');
    await expect(row).toContainText('แท็บ รายจ่าย · แถว 2');
    await expect(row.getByRole('link', { name: 'ดูในชีต' })).toHaveAttribute('href', `${FILE.url}#gid=905&range=A2:F2`);
    await page.waitForTimeout(500);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheet-expenses-detail-${device.name}.png` });
  });
}

test('without the feature the expenses page is as before and the sheet is never read', async ({ page }) => {
  const { reads } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap']);
  await expect(page.locator('table tbody tr[data-expense-id]')).toHaveCount(1);
  await expect(page.getByTestId('sheet-expenses-line')).toHaveCount(0);
  await page.locator('table tbody tr[data-expense-id]').first().click();
  await expect(page.getByText('รายละเอียดรายจ่าย')).toBeVisible();
  await expect(page.getByTestId('sheet-row-line')).toHaveCount(0);
  expect(reads()).toBe(0);
});

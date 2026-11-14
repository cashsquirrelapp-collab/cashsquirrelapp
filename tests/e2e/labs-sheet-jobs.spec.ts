import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs; owner, 2026-11-14: the sheet is the database, "โอเคนะ" to the mocks, "ทำเลย"): the
// Jobs page as it is with one line on top, ข้อมูลจากชีต <file> · อัปเดต 09:12 · เปิดชีต; the sheet's job rows become jobs
// (the one เลขา already saved is linked, not added twice); a job's details say its tab and row, with ดูในชีต opening that
// very row. Google and the backend are mocked.

test.use({ serviceWorkers: 'block' });

const user = { id: '66666666-6666-4666-8666-666666666666', email: 'sync@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const FILE = { id: 'file-12345678', name: 'งานลูกค้า 2569', url: 'https://docs.google.com/spreadsheets/d/file-12345678/edit' };
const col = (index: number, header: string, target: string, extra: Record<string, unknown> = {}) => ({ index, header, target, ...extra });
const MAP = { fileId: FILE.id, at: '2026-11-14T02:00:00.000Z', tabs: [{ name: 'รายรับ', gid: 812, headerRow: 0, kind: 'jobs', use: true, columns: [
  col(0, 'วันที่ส่งงาน', 'postDate'), col(1, 'ชื่อโปรเจกต์', 'name'), col(2, 'ลูกค้า', 'client'), col(3, 'ค่าจ้าง', 'value'), col(4, 'หัก ณ ที่จ่าย', 'whtAmount'),
  col(5, 'ยอดโอนจริง', 'keep', { formula: true }), col(6, 'รับแล้ว', 'received'), col(7, 'วันที่โอน', 'paidDate'), col(8, 'หมายเหตุ', 'note')] }] };
const c = (text: string, extra: Record<string, unknown> = {}) => ({ raw: /^[\d,.]+$/.test(text) ? Number(text.replace(/,/g, '')) : (text || null), text, ...extra });
const d = (text: string, iso: string) => c(text, { date: iso });
const ROWS = [
  ['วันที่ส่งงาน', 'ชื่อโปรเจกต์', 'ลูกค้า', 'ค่าจ้าง', 'หัก ณ ที่จ่าย', 'ยอดโอนจริง', 'รับแล้ว', 'วันที่โอน', 'หมายเหตุ'].map(t => c(t)),
  [d('31/10/2569', '2026-10-31'), c('ที่ปรึกษาคอนเทนต์ เดือน ต.ค.'), c('บริษัท โกลว์อัพ จำกัด'), c('20,000'), c('600'), c('19,400', { formula: true }), c('19,400'), d('2/11/2569', '2026-11-02'), c('ได้ 50 ทวิ แล้ว')],
  [d('3/11/2569', '2026-11-03'), c('ออกแบบโลโก้ร้านกาแฟ'), c('คาเฟ่ลูมิน'), c('5,000'), c('0'), c('5,000', { formula: true }), c('5,000'), d('5/11/2569', '2026-11-05'), c('')],
  [d('10/11/2569', '2026-11-10'), c('ตัดต่อคลิปรีวิวคาเฟ่ EP.3'), c('คุณยอร์ช'), c('3,000'), c('0'), c('3,000', { formula: true }), c('0'), c(''), c('')],
  [c('รวม'), c(''), c(''), c('28,000'), c('600'), c('27,400', { formula: true }), c('24,400'), c(''), c('')],
];
// Saved from เลขา's chat before the page read the sheet: linked to row 4, never added again.
const chatJob = { id: 'chat-job-1', name: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3', client: 'คุณยอร์ช', value: 3000, received: 0, pending: 3000, status: 'pending', paymentStatus: 'unpaid', type: '', creditTerm: 10, note: '', isPosted: true, postDate: '2026-11-10', payDate: '2026-11-20' };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 40000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: { 'chat-job-1': 1 }, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, size: { width: number; height: number }, labsOn: string[]) {
  const posts: unknown[] = [];
  let reads = 0;
  await page.clock.setFixedTime(new Date('2026-11-14T09:12:00+07:00'));
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_theme_pref', JSON.stringify({ mode: 'light', asked: true })); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-6666666666', displayName: 'ผู้ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot: { jobs: [chatJob], expenses: [], goals: [], invoices: [], settings, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.route('**/api/labs', route => route.fulfill({ json: { labs: { tester: true, on: labsOn } } }));
  await page.route('**/api/google', route => {
    const status = { google: { configured: true, connected: true, email: 'mew@example.com', file: FILE, map: MAP } };
    if (route.request().method() === 'GET') return route.fulfill({ json: status });
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === 'read') { reads += 1; return route.fulfill({ json: { ...status, tabs: [{ name: 'รายรับ', gid: 812, truncated: false, rows: ROWS }], readAt: '2026-11-14T02:12:00.000Z' } }); }
    return route.fulfill({ json: status });
  });
  await page.setViewportSize(size);
  await page.goto(noRadar('/jobs'));
  await loadLayoutFonts(page);
  return { posts, reads: () => reads };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the jobs page on the ${device.name} keeps a copy of the sheet; a job says its row and ดูในชีต opens it`, async ({ page }) => {
    const { posts, reads } = await open(page, device, ['sheets', 'sheetMap', 'sheetJobs']);
    const line = page.getByTestId('sheet-jobs-line');
    await expect(line).toContainText('ข้อมูลจากชีต งานลูกค้า 2569');
    await expect(line).toContainText('อัปเดต 09:12');
    await expect(line.getByRole('link', { name: 'เปิดชีต' })).toHaveAttribute('href', `${FILE.url}#gid=812`);
    // Three rows, the total row left out, the chat's job linked: three jobs, not four.
    const titles = device.name === 'computer' ? page.locator('table tbody tr td:first-child p:first-child') : page.locator('.ksm-jobtitle');
    await expect(titles).toHaveCount(3);
    await expect(titles).toContainText(['ตัดต่อคลิปรีวิวคาเฟ่ EP.3']);
    await expect.poll(() => JSON.stringify(posts)).toContain('"sheetLink":{"fileId":"file-12345678","tab":"รายรับ","row":4,"gid":812}');
    expect(reads()).toBe(1);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/labs-sheet-jobs-${device.name}.png` });

    await titles.filter({ hasText: 'ตัดต่อคลิปรีวิวคาเฟ่ EP.3' }).first().click();
    const row = page.getByTestId('sheet-row-line');
    await expect(row).toContainText('อยู่ในชีต งานลูกค้า 2569');
    await expect(row).toContainText('แท็บ รายรับ · แถว 4');
    await expect(row.getByRole('link', { name: 'ดูในชีต' })).toHaveAttribute('href', `${FILE.url}#gid=812&range=A4:I4`);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/labs-sheet-jobs-detail-${device.name}.png` });
  });
}

test('without the feature the jobs page is as before and the sheet is never read', async ({ page }) => {
  const { reads } = await open(page, { width: 1440, height: 900 }, ['sheets', 'sheetMap']);
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('sheet-jobs-line')).toHaveCount(0);
  await page.locator('table tbody tr').first().click();
  await expect(page.getByRole('heading', { name: 'แก้ไขงาน' })).toBeVisible();
  await expect(page.getByTestId('sheet-row-line')).toHaveCount(0);
  expect(reads()).toBe(0);
});

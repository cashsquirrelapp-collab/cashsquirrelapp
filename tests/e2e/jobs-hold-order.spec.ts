import { expect, test, type Page } from '@playwright/test';
import { noRadar } from './radarVisit';

// Owner, 2026-10-24 ("เวลากดรับเงินทำไมมันเด้งขึ้นด้านบน แก้ด้วย"): recording money from a row of the jobs list
// used to re-sort the list at once. A paid job is dated the day the money arrived, so under "ล่าสุด" it jumped to
// the top, and the page scrolled up after it. Acting on a row now keeps the list in the order it was in; it sorts
// itself again when the view changes.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'jobs@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const today = new Date();
const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() - offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const paid = (n: number) => ({ id: `p${n}`, name: `งานตัวอย่าง ${n}`, client: 'ลูกค้าตัวอย่าง', type: 'Design', creditTerm: 30, note: '', value: 1000 * n, received: 1000 * n, pending: 0, status: 'done', paymentStatus: 'paid', isPosted: true, postDate: day(n), payDate: day(n), whtRate: 0, whtAmount: 0 });
const jobs = [...Array.from({ length: 14 }, (_, n) => paid(n + 1)),
  { id: 'late', name: 'งานค้างจ่ายตัวอย่าง', client: 'ลูกค้าตัวอย่าง', type: 'Design', creditTerm: 30, note: '', value: 6500, received: 0, pending: 6500, status: 'pending', paymentStatus: 'unpaid', isPosted: true, postDate: day(40), payDate: day(20), whtRate: 0, whtAmount: 0 }];
const snapshot = { jobs, expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: null } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(noRadar('/jobs'));
}

const order = (page: Page) => page.locator('[data-job-id]').filter({ visible: true }).evaluateAll(els => els.map(el => el.getAttribute('data-job-id')));
const scrollTop = (page: Page) => page.evaluate(() => (document.querySelector('#main-content') || document.scrollingElement)!.scrollTop);

test('receiving money from a row keeps the row and the page where they were; the list sorts again when the view changes', async ({ page }) => {
  await open(page);
  const row = page.locator('[data-job-id="late"]').filter({ visible: true }).first();
  await row.scrollIntoViewIfNeeded();
  const before = { index: (await order(page)).indexOf('late'), scroll: await scrollTop(page), y: (await row.boundingBox())!.y };
  expect(before.index).toBe((await order(page)).length - 1); // overdue and oldest: the last row
  // Computers and iPads have no receive button in the table since 2026-10-28 (owner: "เอาปุ่มรับเงินออก ... iPad ก็ไม่ต้อง");
  // the row's ⋯ menu takes the money with the same form.
  await row.getByRole('button', { name: 'ตัวเลือกของงาน งานค้างจ่ายตัวอย่าง', exact: true }).click();
  await page.getByRole('menu', { name: 'ตัวเลือกของงาน งานค้างจ่ายตัวอย่าง' }).getByRole('menuitem', { name: 'รับเงินครบ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /บันทึก|ยืนยัน|รับเงินครบ/ }).last().click();
  await expect(page.getByText(/รับเงินครบแล้ว · งานค้างจ่ายตัวอย่าง/)).toBeVisible();
  await expect(row).toContainText('รับครบแล้ว');
  expect((await order(page)).indexOf('late')).toBe(before.index);
  expect(Math.abs((await scrollTop(page)) - before.scroll)).toBeLessThan(2);
  expect(Math.abs((await row.boundingBox())!.y - before.y)).toBeLessThan(2);
  // Changing the view sorts again: paid today, it is now the newest.
  const tabs = page.getByRole('tablist', { name: 'สถานะงาน' }).filter({ visible: true }).first();
  await tabs.getByRole('tab', { name: /รอรับเงิน/ }).click();
  await tabs.getByRole('tab', { name: /ทั้งหมด/ }).click();
  await expect.poll(async () => (await order(page)).indexOf('late')).toBe(0);
});

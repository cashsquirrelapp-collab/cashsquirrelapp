import { test, expect, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Overdue money on computers and iPads opens as a short report (owner, 2026-10-30: "เหมือนกำลังรายงาน CEO ... liquid card
// ภาพรวม"); phones keep their alert.

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
const statuses = [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }];

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const job = (id: string, name: string, client: string, pending: number, late: number) => ({
  id, name, client, value: pending, received: 0, pending, type: 'Sponsored Post', status: 'pending', paymentStatus: 'unpaid', creditTerm: 0, note: '',
  isPosted: true, deliveredOn: daysAgo(late), payDate: daysAgo(late),
});
const jobs = [
  job('j1', 'รีวิวสกินแคร์ 3 คลิป', 'บริษัท ผิวใส จำกัด', 45000, 52),
  job('j2', 'ไลฟ์ขายของ 2 ชั่วโมง', 'ร้านเสื้อผ้า Mint', 18500, 21),
  job('j3', 'ถ่ายภาพสินค้า', 'Brew Days', 9200, 12),
  job('j4', 'โพสต์ IG 1 โพสต์', 'Glow Lab', 6000, 5),
  job('j5', 'คลิป TikTok', 'IzaBelle', 12500, 1),
  job('j6', 'ออกแบบโลโก้', 'สตูดิโอเล็ก', 3500, 3),
  { ...job('j7', 'งานยังไม่ถึงกำหนด', 'ลูกค้าใหม่', 7000, -5) },
];

async function open(page: Page, mode: 'light' | 'dark' = 'light') {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  const snapshot = {
    jobs, expenses: [], goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode, darkFrom: '18:00', lightFrom: '06:00', asked: true } },
    notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
    avatar_data_url: null, issuer_profile: null,
  };
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.goto('/');
}

test('computers: the overdue alert is a report with a glass summary and the largest items', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await expect(report.getByRole('heading', { name: 'เงินค้างรับเลยกำหนด 6 รายการ' })).toBeVisible();
  await expect(report).toContainText('เพิ่งเลยกำหนดวันนี้ 1 รายการ');
  // The total counts up to the six overdue jobs (the job not yet due is left out).
  await expect(report.locator('.odr-total')).toHaveText('฿94,700', { timeout: 3000 });
  await expect(report.locator('.odr-stat-value')).toHaveText('52 วัน');
  await expect(report.locator('.odr-bucket').nth(0)).toContainText('3 รายการ');
  await expect(report.locator('.odr-bucket').nth(1)).toContainText('2 รายการ');
  await expect(report.locator('.odr-bucket').nth(2)).toContainText('1 รายการ');
  const rows = report.locator('.odr-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('รีวิวสกินแคร์ 3 คลิป');
  await expect(rows.first()).toContainText('เลย 52 วัน');
  await expect(report).toContainText('และอีก 1 รายการในหน้าเงินรอรับ');
  await expect(report).not.toContainText('งานยังไม่ถึงกำหนด');
  await page.waitForTimeout(1600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-light.png') });

  await report.getByRole('button', { name: 'ไปที่เงินรอรับ' }).click();
  await expect(report).toBeHidden();
  await expect(page).toHaveURL(/receivables/);
});

test('computers in dark mode: the report reads on the dark surface', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await open(page, 'dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-dark.png') });
  await report.getByRole('button', { name: 'ไว้ทีหลัง' }).click();
  await expect(report).toBeHidden();
});

test('iPad portrait shows the same report', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-ipad.png') });
});

test('phones keep the old alert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByText('ตรวจพบดีลค้างชำระเลยกำหนด!')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('overdue-report')).toHaveCount(0);
});

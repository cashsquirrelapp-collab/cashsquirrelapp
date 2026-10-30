import { test, expect, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Overdue money on iPads opens as a short report (owner, 2026-10-30: "เหมือนกำลังรายงาน CEO ... liquid card ภาพรวม"); phones
// keep their alert; computers open the fullscreen Credit Radar (tests/e2e/credit-radar.spec.ts). These run as touch devices.
test.use({ hasTouch: true, isMobile: true });

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
  isPosted: true, postDate: daysAgo(late + 30), payDate: daysAgo(late),
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

async function open(page: Page, mode: 'light' | 'dark' = 'light', list = jobs) {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  const snapshot = {
    jobs: list, expenses: [], goals: [], invoices: [], statuses, job_types: ['Sponsored Post'],
    settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', theme: { mode, darkFrom: '18:00', lightFrom: '06:00', asked: true } },
    notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null },
    avatar_data_url: null, issuer_profile: null,
  };
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  await page.goto('/');
}

test('iPad landscape: the overdue alert is a hologram stage over a finance backdrop, with the largest jobs around the squirrel', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await expect(report.getByRole('heading', { name: 'เงินค้างรับเลยกำหนด 6 รายการ' })).toBeVisible();
  await expect(report).toContainText('เพิ่งเลยกำหนดวันนี้ 1 รายการ');
  // The total counts up to the six overdue jobs (the job not yet due is left out).
  await expect(report.locator('.odr-total')).toHaveText('฿94,700', { timeout: 4000 });
  await expect(report.locator('.odr-squirrel')).toHaveAttribute('src', '/line/mascot-v6-report.png');
  // The four largest jobs as cards: client, job, how late, amount, sent -> due -> today.
  const cards = report.getByTestId('overdue-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText('บริษัท ผิวใส จำกัด');
  await expect(cards.first()).toContainText('รีวิวสกินแคร์ 3 คลิป');
  await expect(cards.first()).toContainText('เกินกำหนด');
  await expect(cards.first()).toContainText('52 วัน');
  await expect(cards.first()).toContainText('฿45,000');
  await expect(cards.first().locator('.odr-tl-labels')).toContainText('ส่งงาน');
  await expect(cards.first().locator('.odr-tl-labels')).toContainText('ครบกำหนด');
  await expect(cards.first().locator('.odr-tl-labels')).toContainText('วันนี้');
  await expect(cards.nth(2)).toContainText('คลิป TikTok');
  await expect(cards.nth(2)).toContainText('เพิ่งเลยกำหนด');
  await expect(report).toContainText('และอีก 2 รายการในหน้าเงินรอรับ');
  await expect(report).not.toContainText('งานยังไม่ถึงกำหนด');
  // How late, and how many clients, on the orbit.
  const chips = report.locator('.odr-chip-orb');
  await expect(chips).toHaveCount(4);
  await expect(chips.nth(0)).toContainText('1 รายการ');
  await expect(chips.nth(1)).toContainText('2 รายการ');
  await expect(chips.nth(2)).toContainText('3 รายการ');
  await expect(chips.nth(3)).toContainText('6 ราย');
  // The short summary, one row.
  const brief = report.locator('.odr-brief');
  await expect(brief).toContainText('฿94,700 · 6 รายการ');
  await expect(brief).toContainText('บริษัท ผิวใส จำกัด · ฿45,000');
  await expect(brief).toContainText('รีวิวสกินแคร์ 3 คลิป · 52 วัน');
  await expect(brief).toContainText('ควรติดตาม บริษัท ผิวใส จำกัด ก่อน ยอด ฿45,000 เลยกำหนดมา 52 วัน');
  // The whole report fits the window without scrolling.
  expect(await report.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await page.waitForTimeout(2600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-light.png') });

  await report.getByRole('button', { name: 'ไปที่เงินรอรับ' }).click();
  await expect(report).toBeHidden();
  await expect(page).toHaveURL(/receivables/);
});

test('iPad landscape in dark mode: the report reads on the dark surface', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page, 'dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-dark.png') });
  await report.getByRole('button', { name: 'ไว้ทีหลัง' }).click();
  await expect(report).toBeHidden();
});

test('iPad portrait shows the same stage, narrower: no orbit chips, the summary counts how late instead', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await open(page);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  await expect(report.getByTestId('overdue-card')).toHaveCount(4);
  await expect(report.locator('.odr-chip-orb')).toHaveCount(0);
  await expect(report.locator('.odr-brief')).toContainText('เลยมาเกิน 30 วัน');
  await expect(report.locator('.odr-brief')).toContainText('฿22,000 · 3 รายการ');
  await page.waitForTimeout(2600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('overdue-report-ipad.png') });
});

test('phones keep the old alert', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByText('ตรวจพบดีลค้างชำระเลยกำหนด!')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('overdue-report')).toHaveCount(0);
});

test('iPad landscape: the motion plays once, frames while it opens', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page);
  const report = page.getByTestId('overdue-report');
  await expect(report).toBeVisible({ timeout: 10_000 });
  for (let n = 0; n < 4; n++) {
    await page.screenshot({ path: test.info().outputPath(`overdue-report-frame-${n}.png`) });
    await page.waitForTimeout(260);
  }
});

test('iPad landscape: a very large total still fits its card, with nothing overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page, 'light', [job('b1', 'งานยอดสูงมาก', 'ลูกค้าใหญ่', 312_327_222, 40), job('b2', 'งานที่สอง', 'ลูกค้าเล็ก', 98_765_432, 10)]);
  const report = page.getByTestId('overdue-report');
  await expect(report.locator('.odr-total')).toHaveText('฿411,092,654', { timeout: 10_000 });
  const fits = await report.locator('.odr-total').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  await page.waitForTimeout(2600);
  expect(await textOverlapIssues(page)).toEqual([]);
});

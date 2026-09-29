import { test, expect } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'modern-ui@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const snapshot = {
  jobs: [],
  expenses: [],
  goals: [],
  invoices: [],
  settings: {
    monthlyExpense: 0,
    monthlyRevenueGoal: 20_000,
    savingsPercentage: 40,
    profileSetupCompleted: true,
    userPersona: 'freelance',
  },
  statuses: [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
  ],
  job_types: ['Sponsored Post'],
  notif_settings: {
    enabled: true,
    alertEmail: user.email,
    serviceType: 'mailto',
    emailjsServiceId: '',
    emailjsTemplateId: '',
    emailjsPublicKey: '',
    pendingQueue: [],
    lineUserId: null,
  },
  avatar_data_url: null,
  issuer_profile: null,
};

const versions = {
  cashflow_jobs: {},
  cashflow_expenses: {},
  cashflow_goals: {},
  cashflow_invoices: {},
  cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({
    json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Modern UI' },
  }));
  await page.route('**/api/groups?*', route => route.fulfill({
    json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 },
  }));
  await page.route('**/api/data*', route => route.fulfill({
    json: route.request().method() === 'POST'
      ? { ok: true }
      : {
          snapshot,
          versions,
          subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' },
        },
  }));
});

test('modern feature pages remain available without rendering their retired UI', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('.draft10-dashboard')).toBeVisible();
  await expect(page.locator('.dashboard-shell')).toHaveCount(0);

  const sidebar = page.locator('aside');
  const pages = [
    ['ปฏิทิน', '.draft10-calendar'],
    ['รายรับ-รายจ่าย', '.draft10-cash'],
    ['เป้าหมายการเงิน', '.draft10-goals'],
    ['รายงาน', '.draft10-report'],
  ] as const;

  for (const [label, selector] of pages) {
    await sidebar.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator('#main-content')).not.toContainText('โหลดหน้านี้ไม่สำเร็จ');
  }

  expect(errors).toEqual([]);
});

test('modern feature pages stay inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  for (const label of ['ปฏิทิน', 'รายรับ-รายจ่าย', 'เป้าหมายการเงิน', 'รายงาน']) {
    await page.getByRole('button', { name: 'เปิดเมนูหมวดหมู่' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

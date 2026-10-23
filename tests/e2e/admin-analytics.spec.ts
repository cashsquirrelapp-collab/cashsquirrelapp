import { expect, test } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'heidnsko1234@gmail.com',
  role: 'admin',
  canViewAdminAnalytics: true,
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const snapshot = {
  jobs: [], expenses: [], goals: [], invoices: [],
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
  statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null,
};

const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

const finance = {
  range: 30, fromDate: '2026-09-22', toDate: '2026-10-21', timezone: 'Asia/Bangkok',
  generatedAt: '2026-10-21T12:00:00Z', livemode: true, scope: 'stripe_account',
  balance: { status: 'ready', complete: true, error: null, data: { currencies: [{ currency: 'thb', available: -263, pending: 15620 }] } },
  summary: { status: 'ready', complete: true, error: null, data: { currencies: [{ currency: 'thb', gross: 15900, refunds: 0, fees: 280, net: 15620, paymentCount: 1, effectiveFeePercent: 1.761006 }], transactionCount: 1 } },
  payments: { status: 'ready', complete: true, error: null, data: { items: [{ id: 'py_finance_test', paymentIntentId: 'pi_finance_test', createdAt: '2026-10-20T11:00:00Z', amount: 15900, currency: 'thb', amountRefunded: 0, status: 'paid', paymentMethod: 'promptpay', appPayment: true, settlement: { amount: 15900, currency: 'thb', fee: 280, net: 15620, effectiveFeePercent: 1.761006, availableOn: '2026-11-01T17:00:00Z', status: 'pending' } }], hasMore: false } },
  payouts: { status: 'ready', complete: true, error: null, data: { items: [], nextPayouts: [], nextPayoutsComplete: true, hasMore: false } },
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'CEO Park' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ json: finance }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: {
    range: 30,
    fromDate: '2026-09-12',
    toDate: '2026-10-11',
    generatedAt: '2026-10-11T04:00:00Z',
    totals: { accounts: 248, newAccounts: 34, activeUsers: 126, previousActiveUsers: 104, pageViews: 3842, proAccounts: 48, paidProAccounts: 42, trialAccounts: 21, freeAccounts: 179, revenue: 625800, previousRevenue: 491700, paymentCount: 42, conversionRate: 0.169, averageRevenuePerPayer: 14900 },
    daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-${index < 19 ? '09' : '10'}-${String(index < 19 ? index + 12 : index - 18).padStart(2, '0')}`, activeUsers: 12 + index % 17, pageViews: 80 + index * 3, revenue: index % 4 === 0 ? 14900 : 0, payments: index % 4 === 0 ? 1 : 0 })),
    features: [
      { key: 'dashboard', activeUsers: 118, pageViews: 1280, freeUsers: 81, proUsers: 37, freeViews: 830, proViews: 450 },
      { key: 'jobs', activeUsers: 96, pageViews: 940, freeUsers: 66, proUsers: 30, freeViews: 610, proViews: 330 },
      { key: 'invoice', activeUsers: 74, pageViews: 721, freeUsers: 58, proUsers: 16, freeViews: 520, proViews: 201 },
      { key: 'plans', activeUsers: 33, pageViews: 91, freeUsers: 33, proUsers: 0, freeViews: 91, proViews: 0 },
    ],
    personas: [
      { key: 'freelance', accounts: 142, activeUsers: 92, proAccounts: 38, revenue: 506600 },
      { key: 'employee', accounts: 58, activeUsers: 22, proAccounts: 7, revenue: 89400 },
      { key: 'university', accounts: 25, activeUsers: 8, proAccounts: 2, revenue: 14900 },
      { key: 'school', accounts: 8, activeUsers: 2, proAccounts: 0, revenue: 0 },
      { key: 'unknown', accounts: 15, activeUsers: 2, proAccounts: 1, revenue: 14900 },
    ],
    accounts: [
      { userId: '22222222-2222-4222-8222-222222222222', publicId: 'SQ-0000000128', displayName: 'มินตรา ดีไซน์', createdAt: '2026-07-11T09:00:00Z', persona: 'freelance', jobTypes: ['Graphic Design', 'Content'], planStatus: 'pro', plan: 'pro_monthly', currentPeriodEnd: '2026-11-03T09:00:00Z', totalSpent: 44700, paymentCount: 3, lastPaymentAt: '2026-10-04T09:00:00Z', activeDays: 19, pageViews: 287, lastSeenAt: '2026-10-11T03:12:00Z', topFeatures: [{ key: 'jobs', pageViews: 112 }, { key: 'invoice', pageViews: 74 }] },
      { userId: '33333333-3333-4333-8333-333333333333', publicId: 'SQ-0000000217', displayName: 'Than Studio', createdAt: '2026-09-25T09:00:00Z', persona: 'employee', jobTypes: ['Video'], planStatus: 'trial', plan: null, currentPeriodEnd: null, totalSpent: 0, paymentCount: 0, lastPaymentAt: null, activeDays: 6, pageViews: 74, lastSeenAt: '2026-10-10T15:00:00Z', topFeatures: [{ key: 'dashboard', pageViews: 34 }] },
    ],
    payments: [{ id: 'pi_analytics_test', userId: '22222222-2222-4222-8222-222222222222', publicId: 'SQ-0000000128', displayName: 'มินตรา ดีไซน์', amount: 14900, currency: 'thb', paidAt: '2026-10-04T09:00:00Z', refunded: false }],
  } }));
});

test('admin analytics supports product, revenue, and account drill-down', async ({ page }) => {
  await page.goto('/adminDashboard/ceo-park');
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' })).toBeVisible();
  await expect(page.getByText('฿6,258.00', { exact: true })).toBeVisible();
  await expect(page.getByText('สิ่งที่ควรทำต่อ')).toBeVisible();
  if (process.env.ADMIN_ANALYTICS_SCREENSHOT) {
    const lightMode = page.getByRole('button', { name: 'เปลี่ยนเป็นโหมดสว่าง', exact: true });
    if (await lightMode.isVisible()) await lightMode.click();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: process.env.ADMIN_ANALYTICS_SCREENSHOT, fullPage: true, animations: 'disabled' });
  }

  await page.getByRole('button', { name: 'การใช้ฟีเจอร์' }).click();
  await expect(page.getByRole('heading', { name: 'ฟีเจอร์ไหนถูกใช้ และใครเป็นคนใช้' })).toBeVisible();
  await expect(page.getByText('โอกาสวางจุดอัปเกรด').first()).toBeVisible();

  await page.getByRole('button', { name: 'รายบัญชี' }).click();
  await page.getByText('มินตรา ดีไซน์').click();
  await expect(page.getByRole('dialog')).toContainText('ยอดเติมสะสม');
  await expect(page.getByRole('dialog')).toContainText('฿447.00');
  await expect(page.getByRole('dialog')).toContainText('ประวัติการเติม Pro');
});

test('phones get the phone design: revenue in the header, period switch, accounts with a detail sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/adminDashboard/ceo-park');
  await expect(page.getByRole('region', { name: 'สรุปรายได้' })).toContainText('฿6,258');
  await page.getByRole('tab', { name: '7 วัน' }).click();
  await expect(page.getByRole('tab', { name: '7 วัน' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'รายบัญชี', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'รายบัญชี' })).toBeVisible();
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole('button', { name: 'เปิดรายละเอียดบัญชี มินตรา ดีไซน์' }).click();
  await expect(page.getByRole('dialog')).toContainText('ยอดเติมสะสม');
  await expect(page.getByRole('dialog')).toContainText('฿447');
  await page.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('other admins cannot see the menu or fetch analytics through a direct URL', async ({ page }) => {
  let analyticsRequests = 0;
  page.on('request', request => { if (/\/api\/admin-(analytics|stripe-finance)/.test(request.url())) analyticsRequests++; });
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user: {
    ...user, email: 'another-admin@example.com', canViewAdminAnalytics: false,
    user_metadata: { email: user.email, canViewAdminAnalytics: true },
  } } } }));
  await page.goto('/adminDashboard/ceo-park');
  await expect(page.getByRole('alert').filter({ hasText: 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น' })).toBeVisible();
  await expect(page.getByText('฿6,258.00', { exact: true })).toHaveCount(0);
  await expect(page.locator('a[href*="/adminDashboard"]')).toHaveCount(0);
  expect(analyticsRequests).toBe(0);
});

test('permission errors remove previously displayed financial data', async ({ page }) => {
  await page.goto('/adminDashboard/ceo-park');
  await expect(page.getByText('฿6,258.00', { exact: true })).toBeVisible();
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ status: 403, json: { error: 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น' } }));
  await page.getByRole('button', { name: 'อัปเดต', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('เฉพาะเจ้าของระบบ');
  await expect(page.getByText('฿6,258.00', { exact: true })).toHaveCount(0);
});

test('Stripe shows actual fees, pending settlement, and no invented bank date', async ({ page }) => {
  await page.goto('/adminDashboard/ceo-park');
  const stripe = page.getByRole('region', { name: 'เงินรับและการโอนจาก Stripe' });
  await expect(stripe).toContainText('฿2.80');
  await expect(stripe).toContainText('1.76%');
  await expect(stripe).toContainText('฿156.20');
  await expect(stripe).toContainText('-฿2.63');
  await expect(stripe).toContainText('ยังไม่กำหนดวันโอน');
  await expect(stripe).toContainText('ยอดพร้อมใช้ติดลบ');
  await expect(page.getByText('สมัครใหม่ในช่วงนี้', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ดูรายการรับเงินและประวัติการโอน' }).click();
  await expect(page.getByRole('heading', { name: 'รายการรับชำระล่าสุด' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ประวัติการโอนเข้าธนาคาร' })).toBeVisible();
});

test('Stripe works when app analytics fails; parts it cannot read are left out, never shown as zero', async ({ page }) => {
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ status: 503, json: { error: 'สถิติในแอปยังไม่พร้อม' } }));
  await page.goto('/adminDashboard/ceo-park');
  const stripe = page.getByRole('region', { name: 'เงินรับและการโอนจาก Stripe' });
  await expect(stripe).toContainText('฿156.20');
  const unavailable = { status: 'unavailable', complete: false, data: null, error: { code: 'permission_missing', message: 'Unavailable', permission: 'balance_read' } };
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ json: { ...finance, balance: unavailable, summary: unavailable } }));
  await page.getByRole('button', { name: 'อัปเดตข้อมูล Stripe' }).click();
  await expect(stripe).toContainText('รับชำระล่าสุด ฿159.00'); // readable parts stay
  // Owner, 2026-10-22: a part the key cannot read is left out, with no explanation box.
  await expect(stripe).not.toContainText('ต้องเพิ่มสิทธิ์อ่านให้คีย์ Stripe');
  await expect(stripe).not.toContainText('เงินในบัญชี Stripe ตอนนี้');
  await expect(stripe).not.toContainText('ยอดรับและค่าธรรมเนียม');
  await expect(stripe).not.toContainText('฿0.00');
  await expect(stripe).not.toContainText('-฿2.63');
  // Nothing readable: no panel at all.
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ json: { ...finance, balance: unavailable, summary: unavailable, payments: unavailable, payouts: unavailable } }));
  await page.getByRole('button', { name: 'อัปเดตข้อมูล Stripe' }).click();
  await expect(stripe).toHaveCount(0);
  await expect(page.getByText('ต้องเพิ่มสิทธิ์อ่านให้คีย์ Stripe')).toHaveCount(0);
  // A refused request also leaves no panel and no money behind.
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 403, json: { error: 'เฉพาะเจ้าของระบบเท่านั้น' } }));
  await page.getByRole('button', { name: 'อัปเดต', exact: true }).click();
  await expect(stripe).toHaveCount(0);
  await expect(page.getByText('฿159.00')).toHaveCount(0);
});

// Phones have their own admin design without the Stripe panel; the narrowest iPad is the smallest screen with it.
test('Stripe payout estimate stays distinct from settlement and fits the narrowest iPad', async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1024 });
  const payout = { id: 'po_finance_test', createdAt: '2026-11-02T10:00:00Z', arrivalDate: '2026-11-04T00:00:00Z', amount: 15357, currency: 'thb', status: 'in_transit', automatic: true, method: 'standard' };
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ json: { ...finance, payouts: { ...finance.payouts, data: { items: [payout], nextPayouts: [payout], nextPayoutsComplete: true, hasMore: false } } } }));
  await page.goto('/adminDashboard/ceo-park');
  const stripe = page.getByRole('region', { name: 'เงินรับและการโอนจาก Stripe' });
  await expect(stripe).toContainText('คาดว่าจะเข้า 4 พ.ย. 2569');
  await expect(stripe).toContainText('฿153.57');
  await expect(stripe).not.toContainText('ยังไม่กำหนดวันโอน');
  await page.getByRole('button', { name: 'ดูรายการรับเงินและประวัติการโอน' }).click();
  await expect(page.getByRole('heading', { name: 'ประวัติการโอนเข้าธนาคาร' })).toBeVisible();
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  if (process.env.ADMIN_STRIPE_SCREENSHOT) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: process.env.ADMIN_STRIPE_SCREENSHOT, fullPage: true, animations: 'disabled' });
  }
});

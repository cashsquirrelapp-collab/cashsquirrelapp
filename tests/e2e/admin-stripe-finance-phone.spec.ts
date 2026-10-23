import { expect, test, type Page } from '@playwright/test';

// Owner, 2026-10-22: keep Codex's Stripe finance panel on computers and iPads and show each payment's
// bank date. Phones have their own admin design (no Stripe panel). Sample data only.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const analytics = {
  range: 30, fromDate: '2026-09-23', toDate: '2026-10-22', generatedAt: '2026-10-22T04:00:00Z',
  totals: { accounts: 12, newAccounts: 5, activeUsers: 6, previousActiveUsers: 4, pageViews: 300, proAccounts: 2, paidProAccounts: 1, trialAccounts: 3, freeAccounts: 7, revenue: 15950, previousRevenue: 0, paymentCount: 1, conversionRate: 1 / 12, averageRevenuePerPayer: 15950 },
  daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`, activeUsers: 1, pageViews: 10, revenue: 0, payments: 0 })),
  features: [{ key: 'dashboard', activeUsers: 6, pageViews: 120, freeUsers: 4, proUsers: 2, freeViews: 80, proViews: 40 }],
  personas: [{ key: 'freelance', accounts: 12, activeUsers: 6, proAccounts: 2, revenue: 15900 }],
  accounts: [], payments: [{ id: 'pi_example', userId: '22222222-2222-4222-8222-222222222222', publicId: 'SQ-0000000002', displayName: 'ลูกค้าตัวอย่าง', amount: 15950, currency: 'thb', paidAt: '2026-10-21T03:00:00Z', refunded: false }],
};
const settlement = { amount: 15900, currency: 'thb', fee: 646, net: 15254, effectiveFeePercent: 4.06, availableOn: '2026-10-28T00:00:00Z', status: 'pending' };
const payment = (id: string, payout: unknown) => ({ id, paymentIntentId: `pi_${id}`, createdAt: '2026-10-21T03:05:00Z', amount: 15900, currency: 'thb', amountRefunded: 0, status: 'paid', paymentMethod: 'promptpay', appPayment: true, settlement, payout });
const finance = {
  range: 30, fromDate: '2026-09-23', toDate: '2026-10-22', timezone: 'Asia/Bangkok', generatedAt: '2026-10-22T04:00:00Z', livemode: true, scope: 'stripe_account',
  balance: { status: 'ready', complete: true, error: null, data: { currencies: [{ currency: 'thb', available: 0, pending: 15254 }] } },
  summary: { status: 'ready', complete: true, error: null, data: { currencies: [{ currency: 'thb', gross: 31800, refunds: 0, fees: 1292, net: 30508, paymentCount: 2, effectiveFeePercent: 4.06 }], transactionCount: 2 } },
  payments: { status: 'ready', complete: true, error: null, data: { items: [
    payment('py_on_the_way', { id: 'po_transit', arrivalDate: '2026-10-23T00:00:00Z', status: 'in_transit' }),
    payment('py_waiting', null),
  ], hasMore: false } },
  payouts: { status: 'ready', complete: true, error: null, data: { items: [], nextPayouts: [], nextPayoutsComplete: true, hasMore: false } },
};

async function open(page: Page) {
  const calls = { finance: 0 };
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: analytics }));
  await page.route('**/api/admin-stripe-finance?*', route => { calls.finance++; return route.fulfill({ json: finance }); });
  await page.goto('/adminDashboard/owner');
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' }).first()).toBeVisible();
  return calls;
}

test('computer: a payment in a payout shows its bank date; one not yet in a payout shows none', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByText('จะเข้าธนาคารประมาณ 23 ต.ค. 2569').first()).toBeVisible(); // latest payment, overview
  await page.getByRole('button', { name: 'รายได้ / Pro' }).click();
  const list = page.getByRole('region', { name: 'รายการรับชำระล่าสุด' });
  await expect(list.getByRole('article')).toHaveCount(2);
  await expect(list.getByRole('article').nth(0)).toContainText('จะเข้าธนาคารประมาณ 23 ต.ค. 2569');
  await expect(list.getByRole('article').nth(1)).not.toContainText('ธนาคาร');
  await expect(list.getByRole('article').nth(1)).toContainText('พร้อมใช้ใน Stripe ประมาณ 28 ต.ค. 2569');
});

test.describe('phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('phones use the phone design and make no Stripe request', async ({ page }) => {
    const calls = await open(page);
    await expect(page.getByRole('region', { name: 'สรุปรายได้' })).toContainText('฿160'); // 15,950 satang, whole baht on phones
    await expect(page.getByText('บัญชีที่สมัครทั้งหมด')).toBeVisible();
    await expect(page.getByText('เงินรับและการโอนจาก Stripe')).toHaveCount(0);
    await page.getByRole('button', { name: 'รายได้และการชำระเงิน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'รายได้', exact: true })).toBeVisible();
    await expect(page.getByText('เงินรับและการโอนจาก Stripe')).toHaveCount(0);
    expect(calls.finance).toBe(0);
  });
});

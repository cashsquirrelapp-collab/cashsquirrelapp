import { expect, test, type Page } from '@playwright/test';

// Live revenue on the admin page (owner, 2026-10-22, phones included): every 15 seconds while the
// page is open and on screen it asks whether a payment arrived; on a change the numbers update
// without a loading skeleton and a "มีการชำระเงินใหม่" notice appears. Sample data only.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const first = { id: 'pi_first', userId: '22222222-2222-4222-8222-222222222222', publicId: 'SQ-0000000002', displayName: 'ลูกค้าตัวอย่าง', amount: 15900, currency: 'thb', paidAt: '2026-10-21T03:00:00Z', refunded: false };
const second = { id: 'pi_second', userId: '33333333-3333-4333-8333-333333333333', publicId: 'SQ-0000000003', displayName: 'สตูดิโอตัวอย่าง', amount: 84900, currency: 'thb', paidAt: '2026-10-22T03:00:10Z', refunded: false };
const analytics = (payments: typeof first[], liveSignature: string) => ({
  range: 30, fromDate: '2026-09-23', toDate: '2026-10-22', generatedAt: '2026-10-22T03:00:00Z', liveSignature,
  totals: { accounts: 12, newAccounts: 5, activeUsers: 6, previousActiveUsers: 4, pageViews: 300, proAccounts: payments.length + 1, paidProAccounts: payments.length, trialAccounts: 3, freeAccounts: 7, revenue: payments.reduce((sum, item) => sum + item.amount, 0), previousRevenue: 0, paymentCount: payments.length, conversionRate: payments.length / 12, averageRevenuePerPayer: 15900 },
  daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`, activeUsers: 1, pageViews: 10, revenue: 0, payments: 0 })),
  features: [{ key: 'dashboard', activeUsers: 6, pageViews: 120, freeUsers: 4, proUsers: 2, freeViews: 80, proViews: 40 }],
  personas: [{ key: 'freelance', accounts: 12, activeUsers: 6, proAccounts: 2, revenue: 0 }],
  accounts: [], payments,
});

async function open(page: Page) {
  const server = { signature: 'one', payments: [first], pulses: 0, snapshots: 0, pulseStatus: 200, hidden: false };
  await page.clock.install({ time: new Date('2026-10-22T03:00:00Z') });
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => Boolean((window as unknown as { __hidden?: boolean }).__hidden) });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/admin-analytics?*', route => {
    if (new URL(route.request().url()).searchParams.get('pulse') === '1') {
      server.pulses++;
      return server.pulseStatus === 200 ? route.fulfill({ json: { signature: server.signature, checkedAt: new Date().toISOString() } }) : route.fulfill({ status: server.pulseStatus, json: { error: 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น' } });
    }
    server.snapshots++;
    return route.fulfill({ json: analytics(server.payments, server.signature) });
  });
  await page.goto('/adminDashboard/owner');
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' }).first()).toBeVisible();
  return server;
}

async function payAndWait(page: Page, server: Awaited<ReturnType<typeof open>>) {
  server.payments = [second, first];
  server.signature = 'two';
  await page.clock.runFor(15_500);
}

test('computer: a new payment updates revenue by itself and announces who paid', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const server = await open(page);
  await expect(page.getByText('อัปเดตอัตโนมัติ')).toBeVisible();
  await expect(page.getByText('฿159.00', { exact: true }).first()).toBeVisible();
  await page.clock.runFor(15_500);
  await expect.poll(() => server.pulses).toBe(1);
  expect(server.snapshots).toBe(1); // nothing changed: no reload
  await payAndWait(page, server);
  await expect(page.getByText('มีการชำระเงินใหม่', { exact: true })).toBeVisible();
  await expect(page.getByText('สตูดิโอตัวอย่าง · SQ-0000000003')).toBeVisible();
  await expect(page.getByText('+฿849')).toBeVisible();
  await expect(page.getByText('฿1,008.00', { exact: true }).first()).toBeVisible(); // revenue card, no reload of the page
  await expect.poll(() => server.snapshots).toBe(2);
  await page.getByRole('button', { name: 'รายได้ / Pro' }).click();
  await expect(page.getByText('สตูดิโอตัวอย่าง').first()).toBeVisible();
});

test('a hidden tab does not ask; coming back asks at once; losing access clears the money', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const server = await open(page);
  await page.evaluate(() => { (window as unknown as { __hidden: boolean }).__hidden = true; });
  await page.clock.runFor(46_000);
  expect(server.pulses).toBe(0);
  server.payments = [second, first]; server.signature = 'two';
  await page.evaluate(() => { (window as unknown as { __hidden: boolean }).__hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByText('มีการชำระเงินใหม่', { exact: true })).toBeVisible();
  await expect.poll(() => server.pulses).toBe(1);
  server.pulseStatus = 403;
  await page.route('**/api/admin-analytics?range=*', route => route.fulfill({ status: 403, json: { error: 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น' } }));
  await page.clock.runFor(15_500);
  await expect(page.getByRole('alert').filter({ hasText: 'เฉพาะเจ้าของระบบ' })).toBeVisible();
  await expect(page.getByText('฿1,008.00', { exact: true })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('phone: revenue updates live and the notice appears there too', async ({ page }) => {
    const server = await open(page);
    await expect(page.getByText('สด', { exact: true })).toBeVisible();
    await expect(page.getByText('฿159', { exact: true }).first()).toBeVisible();
    await payAndWait(page, server);
    await expect(page.getByText('มีการชำระเงินใหม่', { exact: true })).toBeVisible();
    await expect(page.getByText('฿1,008', { exact: true }).first()).toBeVisible();
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.viewport);
  });
});

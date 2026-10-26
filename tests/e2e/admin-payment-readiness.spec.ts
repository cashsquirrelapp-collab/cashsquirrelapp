import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The admin page's payment check (owner, 2026-10-27: card and PromptPay QR at the new price). Computers and iPads only;
// the phone admin page keeps its own design with no Stripe panel. Sample data only, no real Stripe.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'heidnsko1234@gmail.com', role: 'admin', canViewAdminAnalytics: true, created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const analytics = {
  range: 30, fromDate: '2026-09-28', toDate: '2026-10-27', generatedAt: '2026-10-27T04:00:00Z',
  totals: { accounts: 12, newAccounts: 5, activeUsers: 6, previousActiveUsers: 4, pageViews: 300, proAccounts: 2, paidProAccounts: 1, trialAccounts: 3, freeAccounts: 7, revenue: 17700, previousRevenue: 0, paymentCount: 1, conversionRate: 1 / 12, averageRevenuePerPayer: 17700 },
  daily: Array.from({ length: 30 }, (_, index) => ({ date: `2026-10-${String((index % 27) + 1).padStart(2, '0')}`, activeUsers: 1, pageViews: 10, revenue: 0, payments: 0 })),
  features: [{ key: 'dashboard', activeUsers: 6, pageViews: 120, freeUsers: 4, proUsers: 2, freeViews: 80, proViews: 40 }],
  personas: [{ key: 'freelance', accounts: 12, activeUsers: 6, proAccounts: 2, revenue: 17700 }],
  accounts: [], payments: [],
};
const item = (kind: 'one_time' | 'recurring', later: boolean, current: number | null, state: string) => ({
  kind, period: 'month', from: later ? '2026-12-01' : '2026-11-30', later, expected: later ? 271 : 177, current, state, creatable: state !== 'ok',
});
const blocked = {
  livemode: true, checkedAt: '2026-10-27T05:40:00Z', status: 'blocked', nextPriceReady: false,
  server: { state: 'ok', prepaid: true, publishableKey: true },
  methods: { state: 'ok', card: true, promptpay: true, extra: [] },
  prices: { state: 'problem', items: [item('one_time', false, 159, 'wrong'), item('recurring', false, 159, 'wrong'), item('one_time', true, null, 'missing'), item('recurring', true, null, 'missing')] },
  webhook: { state: 'ok', missingEvents: [], otherHosts: [] },
  creatable: 4,
};
const ready = {
  ...blocked, status: 'ready', nextPriceReady: true, creatable: 0, checkedAt: '2026-10-27T05:41:00Z',
  prices: { state: 'ok', items: [item('one_time', false, 177, 'ok'), item('recurring', false, 177, 'ok'), item('one_time', true, 271, 'ok'), item('recurring', true, 271, 'ok')] },
};

async function open(page: Page, readiness: (method: string, body: string | null) => { status?: number; json: unknown }, dark = false, language = 'th') {
  const calls: { method: string; body: string | null }[] = [];
  await page.addInitScript(([isDark, lang]) => {
    localStorage.setItem('cashflow_language', lang); localStorage.setItem('cashflow_dark_mode', String(isDark));
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, [dark, language] as const);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: dark ? 'dark' : 'light' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-0000000001', displayName: 'Owner' } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: { status: 'active', plan: 'admin_grant', current_period_end: null } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'admin', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/admin-analytics?*', route => route.fulfill({ json: analytics }));
  await page.route('**/api/admin-stripe-finance?*', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.route('**/api/admin-payment-readiness', route => {
    const request = route.request();
    calls.push({ method: request.method(), body: request.postData() });
    const answer = readiness(request.method(), request.postData());
    return route.fulfill({ status: answer.status ?? 200, json: answer.json });
  });
  await page.goto('/adminDashboard/owner');
  await expect(page.getByRole('heading', { name: language === 'th' ? 'แดชบอร์ดแอดมิน' : 'Admin dashboard' }).first()).toBeVisible();
  return calls;
}

test('computer: old prices in Stripe say so, and the owner creates the missing ones after confirming', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await open(page, method => (method === 'POST' ? { json: { ...ready, created: 4 } } : { json: blocked }));
  const card = page.getByTestId('payment-readiness');
  await expect(card).toHaveAttribute('data-status', 'blocked');
  await expect(card).toContainText('ยังรับชำระไม่ได้');
  await expect(card.locator('[data-check="today"]')).toContainText('ชำระครั้งเดียว (QR และบัตร) ฿177 · ใน Stripe ยังเป็น ฿159');
  await expect(card.locator('[data-check="today"]')).toContainText('บัตรต่ออายุอัตโนมัติ ฿177/เดือน · ใน Stripe ยังเป็น ฿159');
  await expect(card.locator('[data-check="later"]')).toContainText('ราคาตั้งแต่ 1 ธ.ค. 2569');
  await expect(card.locator('[data-check="later"]')).toContainText('ยังไม่มีใน Stripe');
  await expect(card.locator('[data-check="methods"]')).toHaveAttribute('data-state', 'ok');
  await expect(card.locator('[data-check="webhook"]')).toHaveAttribute('data-state', 'ok');
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.screenshot({ path: 'test-results/payment-readiness/blocked-light.png' });

  // Nothing is created without the owner's confirmation.
  await card.getByRole('button', { name: 'สร้างราคาที่ขาดใน Stripe (4 รายการ)' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('สร้างราคาใน Stripe');
  await expect(dialog).toContainText('บัญชีจริง 4 รายการ');
  await expect(dialog).toContainText('ราคาเดิมไม่ถูกลบ');
  expect(calls.filter(call => call.method === 'POST')).toHaveLength(0);
  await page.screenshot({ path: 'test-results/payment-readiness/confirm.png' });
  await dialog.getByRole('button', { name: /ยืนยัน|ตกลง/ }).first().click();

  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(card).toContainText('รับชำระได้ทั้งบัตรและ QR');
  await expect(card).toContainText('สร้างราคาใน Stripe แล้ว 4 รายการ');
  await expect(card.getByRole('button', { name: /สร้างราคาที่ขาด/ })).toHaveCount(0);
  // Just created: the rows stay open to show what changed.
  await expect(card.locator('[data-check="today"]')).toContainText('มีใน Stripe แล้ว');
  expect(calls.filter(call => call.method === 'POST').map(call => JSON.parse(call.body!))).toEqual([{ action: 'create_prices' }]);
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.screenshot({ path: 'test-results/payment-readiness/ready-light.png' });
});

test('computer: a webhook still at the old address, PromptPay off, a key that cannot read a part', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await open(page, () => ({ json: { ...ready, status: 'blocked',
    methods: { state: 'problem', card: true, promptpay: false, extra: ['link'] },
    webhook: { state: 'problem', missingEvents: ['checkout.session.completed'], otherHosts: ['cash-squirrel.vercel.app'] },
    server: { state: 'ok', prepaid: true, publishableKey: true } } }), true);
  const card = page.getByTestId('payment-readiness');
  await expect(card.locator('[data-check="methods"]')).toContainText('บัตร เปิด · PromptPay ปิด');
  await expect(card.locator('[data-check="methods"]')).toContainText('link');
  await expect(card.locator('[data-check="methods"]')).toContainText('Stripe Dashboard → Settings → Payment methods');
  await expect(card.locator('[data-check="webhook"]')).toContainText('การชำระด้วยบัตรจะไม่เปิด Pro ให้ลูกค้า');
  await expect(card.locator('[data-check="webhook"]')).toContainText('ตอนนี้ส่งไปที่ cash-squirrel.vercel.app');
  await expect(card.locator('[data-check="webhook"]')).toContainText('/api/stripe-webhook');
  expect(await textOverlapIssues(page)).toEqual([]);
  await card.screenshot({ path: 'test-results/payment-readiness/problems-dark.png' });
});

test('computer: all green folds into one line, the rows a tap away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, () => ({ json: ready }));
  const card = page.getByTestId('payment-readiness');
  await expect(card).toHaveAttribute('data-status', 'ready');
  await expect(card.locator('[data-check]')).toHaveCount(0);
  await card.screenshot({ path: 'test-results/payment-readiness/ready-folded.png' });
  await card.getByRole('button', { name: 'ดูรายละเอียด' }).click();
  await expect(card.locator('[data-check]')).toHaveCount(5);
  await expect(card.locator('[data-state="ok"]')).toHaveCount(5);
  await card.getByRole('button', { name: 'ซ่อนรายละเอียด' }).click();
  await expect(card.locator('[data-check]')).toHaveCount(0);
});

test('computer: a part Stripe will not let the server read is marked, with the permission to add', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, () => ({ json: { ...ready, status: 'unknown', webhook: { state: 'unknown', missingEvents: [], otherHosts: [], permission: 'Webhook Endpoints: Read' } } }));
  const card = page.getByTestId('payment-readiness');
  await expect(card).toContainText('ตรวจได้ไม่ครบ');
  await expect(card.locator('[data-check="webhook"]')).toContainText('ต้องเพิ่มสิทธิ์ Webhook Endpoints: Read');
});

test('computer: when the check cannot load at all, the card is left out and the page still works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const calls = await open(page, () => ({ status: 503, json: { error: 'บริการไม่พร้อมใช้งาน กรุณาลองใหม่' } }));
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  await expect(page.getByTestId('payment-readiness')).toHaveCount(0);
  await expect(page.getByText('รายได้ Pro ที่บันทึกในแอป')).toBeVisible();
  // A reply that is not a check result (an old server) is left out too, never drawn half.
  await page.unroute('**/api/admin-payment-readiness');
  await page.route('**/api/admin-payment-readiness', route => route.fulfill({ json: {} }));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดแอดมิน' }).first()).toBeVisible();
  await expect(page.getByTestId('payment-readiness')).toHaveCount(0);
});

test('computer in English: the card is all English, dates included', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, () => ({ json: blocked }), false, 'en');
  const card = page.getByTestId('payment-readiness');
  await expect(card).toContainText('Payments are not working');
  await expect(card.locator('[data-check="later"]')).toContainText('Prices from 1 Dec 2026');
  await expect(card.locator('[data-check="today"]')).toContainText('One-time (QR and card) ฿177 · Stripe still has ฿159');
  expect(await card.innerText()).not.toMatch(/[\u0E00-\u0E3E\u0E40-\u0E7F]/); // ฿ (U+0E3F) is the currency sign in English too
});

test.describe('phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the phone admin page is unchanged: no payment card, no check request', async ({ page }) => {
    const calls = await open(page, () => ({ json: blocked }));
    await page.getByRole('button', { name: 'รายได้และการชำระเงิน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'รายได้', exact: true })).toBeVisible();
    await expect(page.getByTestId('payment-readiness')).toHaveCount(0);
    expect(calls).toHaveLength(0);
  });
});

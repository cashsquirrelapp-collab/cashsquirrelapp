import { expect, test, type Page } from '@playwright/test';
import { CONSENT_VERSIONS } from '../../shared/consents';

// เลขากระรอก leads the sidebar for every account, the owner's included (owner, 2026-11-05: "ย้ายฟีเจอร์เลขากระรอกไปไว้
// ด้านบนเหมือนแบบยูสเซอร์ทั่วไป"). The backend is mocked; nothing is sent anywhere.

test.use({ serviceWorkers: 'block' });

const id = '22222222-2222-4222-8222-222222222222';
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], jobTypes: [], notifSettings: {} };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, owner: boolean) {
  const user = { id, email: 'sidebar@example.com', role: owner ? 'admin' : 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {}, ...(owner ? { adminLevel: 'owner' } : {}) };
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: id, publicId: 'SQ-2222222222', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: owner ? 'admin' : 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions }
    : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } }));
  const agreed = Object.fromEntries(Object.entries(CONSENT_VERSIONS).map(([key, version]) => [key, { version, at: '2026-11-05T03:00:00.000Z' }]));
  await page.route('**/api/consent', route => route.fulfill({ json: { consents: agreed, versions: CONSENT_VERSIONS } }));
  await page.route('**/api/assistant', route => route.fulfill({ json: { enabled: true, plan: 'pro', tokensLeft: 994, trialLeft: null, resetsAt: '2026-11-15T17:00:00.000Z', tokenLimit: 1000, requestLimit: null } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
}

for (const owner of [true, false]) {
  test(`the sidebar starts with เลขากระรอก, then ภาพรวม (${owner ? 'the owner' : 'a member'})`, async ({ page }) => {
    await open(page, owner);
    const items = page.locator('aside nav button');
    await expect(items.first()).toHaveText('เลขากระรอก');
    await expect(items.nth(1)).toHaveText('ภาพรวม');
    if (owner) await expect(items.nth(2)).toHaveText('แดชบอร์ดแอดมิน');
    await page.screenshot({ path: `test-results/sidebar-${owner ? 'owner' : 'member'}.png` });
  });
}

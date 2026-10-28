import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The plans menu (owner, 2026-10-28): free and trial accounts are asked "อัปเกรด Pro"; members who already pay see the
// plan's name, "แพ็กเกจ Pro", in the sidebar, the account menu and the page title. Phones keep their own "แพ็กเกจ Pro".
test.use({ serviceWorkers: 'block' });

const OLD = '2026-01-01T00:00:00Z';
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const PAID = { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' };

async function open(page: Page, options: { subscription: unknown; createdAt?: string; lang?: 'th' | 'en'; width?: number; height?: number; path?: string }) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'plans@example.com', role: 'user', created_at: options.createdAt ?? OLD, user_metadata: {} };
  await page.addInitScript(lang => {
    localStorage.setItem('cashflow_language', lang); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  }, options.lang ?? 'th');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: options.subscription } }));
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 820 });
  await page.goto(options.path ?? '/plans');
  await expect(page.locator('#main-content')).toBeVisible();
}
const sidebar = (page: Page) => page.locator('.app-sidebar');
async function accountMenuItem(page: Page, name: string) {
  await sidebar(page).getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  return page.getByRole('button', { name, exact: true }).last();
}

test('a paying member sees "แพ็กเกจ Pro" in the sidebar, the account menu and the page title', async ({ page }) => {
  await open(page, { subscription: PAID });
  await expect(page.getByRole('heading', { name: 'แพ็กเกจ Pro', level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'แพ็กเกจ Pro', exact: true })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'อัปเกรด Pro', exact: true })).toHaveCount(0);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('plans-member.png') });
  const item = await accountMenuItem(page, 'แพ็กเกจ Pro');
  await expect(item).toBeVisible();
  await expect(page.getByRole('button', { name: 'อัปเกรด Pro', exact: true })).toHaveCount(0);
});

for (const [label, options] of [['a free account', { subscription: null }], ['an account in its free trial', { subscription: null, createdAt: new Date(Date.now() - 2 * 86400e3).toISOString() }]] as const) {
  test(`${label} is still asked "อัปเกรด Pro"`, async ({ page }) => {
    await open(page, options);
    await expect(page.getByRole('heading', { name: 'อัปเกรด Pro', level: 1 })).toBeVisible();
    await expect(sidebar(page).getByRole('button', { name: 'อัปเกรด Pro', exact: true })).toBeVisible();
    await expect(await accountMenuItem(page, 'อัปเกรด Pro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'แพ็กเกจ Pro', exact: true })).toHaveCount(0);
  });
}

test('English: "Pro plan" for a member, "Upgrade to Pro" otherwise', async ({ page, browser }) => {
  await open(page, { subscription: PAID, lang: 'en' });
  await expect(page.getByRole('heading', { name: 'Pro plan', level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'Pro plan', exact: true })).toBeVisible();
  const other = await browser.newPage();
  await open(other, { subscription: null, lang: 'en' });
  await expect(other.getByRole('heading', { name: 'Upgrade to Pro', level: 1 })).toBeVisible();
  await other.close();
});

test('phones keep their own "แพ็กเกจ Pro" header for everyone', async ({ page }) => {
  await open(page, { subscription: null, width: 390, height: 844 });
  await expect(page.locator('.ksm-toolhero').getByRole('heading', { name: 'แพ็กเกจ Pro', exact: true })).toBeVisible();
});

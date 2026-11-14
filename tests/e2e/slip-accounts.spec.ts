import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// Slips by account (owner, 2026-11-14, item 3): expenses read from slips keep the person's own account (bank + last four
// digits). With two accounts or more, รายจ่าย shows "KBank •1234" with the bank logo on each row, filters by account and
// lets each account be named; with one account nothing of this shows. Computer and phone, no overlapping text.

test.use({ serviceWorkers: 'block' });

const user = { id: '99999999-9999-4999-8999-999999999999', email: 'slips@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const baseSettings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const TWO = [
  { id: 'e1', name: 'ร้านสมาน', amount: 120, category: 'อื่นๆ', date: '2026-11-10', account: { bank: 'KBANK', last4: '1234' }, slipRef: 'KB0001112222' },
  { id: 'e2', name: 'ค่าโฆษณา', amount: 900, category: 'ค่าโฆษณา/ยิงแอด', date: '2026-11-11', account: { bank: 'SCB', last4: '9876' }, slipRef: 'SCB000333444' },
  { id: 'e3', name: 'ค่ากาแฟ', amount: 60, category: 'อาหาร/รับรองลูกค้า', date: '2026-11-12' },
];

async function open(page: Page, size: { width: number; height: number }, expenses = TWO) {
  const posts: string[] = [];
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+07:00'));
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05', line: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-9999999999', displayName: 'ทดสอบ' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') { posts.push(route.request().postData() ?? ''); return route.fulfill({ json: { ok: true, versions } }); }
    return route.fulfill({ json: { snapshot: { jobs: [], expenses, goals: [], invoices: [], settings: baseSettings, statuses: [], jobTypes: [], notifSettings: {} }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize(size);
  await page.goto('/incomeExpense');
  await loadLayoutFonts(page);
  return { posts };
}

test('computer: each row says its account, the list filters by it, and an account can be named', async ({ page }) => {
  const { posts } = await open(page, { width: 1440, height: 900 });
  await expect(page.getByText('ร้านสมาน').first()).toBeVisible();
  const table = page.locator('table');
  await expect(table.getByTestId('account-tag').filter({ hasText: 'KBank •1234' })).toBeVisible();
  await expect(table.getByTestId('account-tag').filter({ hasText: 'SCB •9876' })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/slip-accounts-computer.png' });
  await page.getByTestId('account-filter').last().selectOption('SCB:9876');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('ค่าโฆษณา');
  await page.getByTestId('account-names-open').last().click();
  const dialog = page.getByTestId('account-names');
  await dialog.getByLabel('ชื่อของ SCB •9876').fill('บัญชีธุรกิจ');
  await page.waitForFunction(() => { const box = document.querySelector('[role="dialog"]'); return Boolean(box && getComputedStyle(box).opacity === '1' && getComputedStyle(box.parentElement!).opacity === '1'); });
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/slip-accounts-names.png' });
  await dialog.getByTestId('account-names-save').click();
  await expect(table.getByTestId('account-tag').filter({ hasText: 'บัญชีธุรกิจ' })).toBeVisible();
  await expect.poll(() => posts.some(body => body.includes('"accountNames"') && body.includes('บัญชีธุรกิจ'))).toBe(true);
});

test('phone: the rows say their account, the filter is in the tools sheet', async ({ page }) => {
  await open(page, { width: 390, height: 844 });
  const list = page.locator('.ksm-moneylist');
  await expect(list.getByTestId('account-tag').filter({ hasText: 'KBank •1234' })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/slip-accounts-phone.png' });
});

test('one account: nothing about accounts shows', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, [TWO[0], TWO[2]]);
  await expect(page.getByText('ร้านสมาน').first()).toBeVisible();
  await expect(page.getByTestId('account-tag')).toHaveCount(0);
  await expect(page.getByTestId('account-filter')).toHaveCount(0);
  await expect(page.getByTestId('account-names-open')).toHaveCount(0);
});

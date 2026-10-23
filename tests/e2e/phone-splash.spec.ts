import { expect, test, type Page } from '@playwright/test';

// Phones: opening the app shows the logo with a short animation instead of the grey skeleton
// (owner, 2026-10-22). It hands over once the page under it is ready; computers keep the skeleton.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function open(page: Page, { signedInBefore = true, dataDelay = 1500, path = '/' } = {}) {
  let releaseData: () => void = () => {};
  const dataGate = new Promise<void>(resolve => { releaseData = resolve; });
  await page.addInitScript(before => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    if (before) localStorage.setItem('cashflow_signed_in', '1');
  }, signedInBefore);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) || /fonts\.(googleapis|gstatic)\.com/.test(route.request().url()) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: signedInBefore ? { user } : null } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Owner' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', async route => {
    if (dataDelay) await Promise.race([dataGate, new Promise(resolve => setTimeout(resolve, dataDelay))]);
    return route.fulfill({ json: { snapshot, versions, subscription: null } });
  });
  await page.goto(path);
  return { releaseData };
}

test.describe('phone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the logo shows while the account loads, then hands over to the page (no skeleton in between)', async ({ page }) => {
    await open(page);
    const splash = page.locator('#app-splash');
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute('aria-label', 'กำลังเปิดกระรอกตุนเงิน');
    await expect(page.locator('#root .boot')).toHaveCount(0); // phones get the logo, not the grey skeleton
    await expect(splash.locator('svg.splash-mark')).toBeVisible();
    await expect(splash).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('#root [aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByText('มูลค่างานเดือนนี้').first()).toBeVisible();
  });

  test('it stays long enough to finish its entrance even when the app is ready at once', async ({ page }) => {
    await open(page, { dataDelay: 0 });
    const splash = page.locator('#app-splash');
    const shownAt = Number(await splash.getAttribute('data-shown-at'));
    await expect(splash).toHaveCount(0, { timeout: 8000 });
    const gone = await page.evaluate(() => Date.now());
    expect(gone - shownAt).toBeGreaterThanOrEqual(1100);
  });

  test('no logo on the sign-in page, or for someone who never signed in here', async ({ page }) => {
    await open(page, { signedInBefore: false, path: '/login' });
    await expect(page.locator('#app-splash')).toHaveCount(0);
  });
});

test('computers keep the skeleton and never show the logo screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await expect(page.locator('#app-splash')).toHaveCount(0);
});

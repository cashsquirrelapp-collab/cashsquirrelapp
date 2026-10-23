import { expect, test, type Page } from '@playwright/test';

// After a deploy, someone with the app already open gets the new build without the orange
// "โหลดหน้านี้ไม่สำเร็จ" page and without signing in again (owner, 2026-10-22).
//
// A deploy is acted out on the open tab: from that moment the server no longer has the files of the
// build the tab runs (it answers with the app's page instead, as the live server does), and "/" names
// a newer build. A fresh page load gets working files again.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'update@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const ERROR_TITLE = 'โหลดหน้านี้ไม่สำเร็จ';

async function openApp(page: Page, { authFailures = 0, phone = false } = {}) {
  const state = { deployed: false, outage: false, pageLoads: 0, loadsAfterDeploy: 0, authChecks: 0 };
  const loadedBefore = new Set<string>();
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th');
    localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_signed_in', '1');
    // Report the orange error page if it ever shows, even for a moment.
    new MutationObserver(() => {
      if (document.body?.innerText.includes('โหลดหน้านี้ไม่สำเร็จ')) console.log('ERROR_PAGE_SHOWN');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  page.on('request', request => {
    if (request.resourceType() !== 'document') return;
    state.pageLoads++;
    if (state.deployed) state.loadsAfterDeploy++;
  });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) || /fonts\.(googleapis|gstatic)\.com/.test(route.request().url()) ? route.continue() : route.abort()));
  // Files of the build the tab runs are gone once deployed; a new page load works again (or not, in an outage).
  await page.route('**/assets/**', async route => {
    const url = route.request().url();
    const gone = state.deployed && (state.outage || state.loadsAfterDeploy === 0) && !loadedBefore.has(url);
    if (!state.deployed) loadedBefore.add(url);
    if (!gone) return route.continue();
    const html = await (await fetch(new URL('/', url))).text();
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  // The app's own check for a newer build reads "/".
  await page.route(/^http:\/\/[^/]+\/$/, async route => {
    if (route.request().resourceType() === 'document' || !state.deployed) return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, body: (await response.text()).replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/, '/assets/index-NEWBUILD1.js') });
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => {
    state.authChecks++;
    return state.authChecks <= authFailures ? route.abort('connectionreset') : route.fulfill({ json: { session: { user } } });
  });
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { snapshot, versions, subscription: null } }));
  const errorShown: string[] = [];
  page.on('console', message => { if (message.text() === 'ERROR_PAGE_SHOWN') errorShown.push(page.url()); });
  if (!phone) await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByText('มูลค่างานเดือนนี้').first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard\/[^/]+$/);
  return { state, errorShown, deploy: () => { state.deployed = true; } };
}

// ตั้งค่า: a page with its own code file that the app does not preload at start (งาน, ปฏิทิน and ทีม are).
const pageButton = (page: Page) => page.getByRole('button', { name: /^ตั้งค่า$/ }).first();
const pageHeading = (page: Page) => page.getByRole('heading', { name: /ตั้งค่า/ }).first();

test('a new build found while the app is open: the next page switch opens it, still signed in', async ({ page }) => {
  const { state, errorShown, deploy } = await openApp(page);
  deploy();
  const checked = page.waitForRequest(request => /^http:\/\/[^/]+\/$/.test(request.url()) && request.resourceType() === 'fetch');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // back on screen
  await checked;
  await pageButton(page).click();
  await expect(page).toHaveURL(/\/settings\/[^/]+$/);
  await expect(pageHeading(page)).toBeVisible({ timeout: 15_000 });
  expect(state.loadsAfterDeploy).toBe(1); // opened as a fresh page in the new build
  await expect(page.getByRole('button', { name: /เข้าสู่ระบบ/ })).toHaveCount(0);
  expect(errorShown).toEqual([]);
});

test('old code asked for before any check: the page reloads into the new build instead of the error page', async ({ page }) => {
  const { state, errorShown, deploy } = await openApp(page);
  deploy();
  // A bare click: no hover or focus first, so the page's own load is what finds the files gone.
  await pageButton(page).dispatchEvent('click');
  await expect(page).toHaveURL(/\/settings\/[^/]+$/);
  await expect(pageHeading(page)).toBeVisible({ timeout: 15_000 });
  expect(state.loadsAfterDeploy).toBe(1);
  await expect(page.getByRole('button', { name: /เข้าสู่ระบบ/ })).toHaveCount(0);
  expect(errorShown).toEqual([]);
});

test('hovering a menu item after a deploy does not reload; clicking it opens the new build', async ({ page }) => {
  const { state, errorShown, deploy } = await openApp(page);
  deploy();
  await pageButton(page).hover(); // preloads the page: its file is gone
  await page.waitForTimeout(800);
  expect(state.loadsAfterDeploy).toBe(0);
  await pageButton(page).click();
  await expect(pageHeading(page)).toBeVisible({ timeout: 15_000 });
  expect(state.loadsAfterDeploy).toBe(1);
  expect(errorShown).toEqual([]);
});

test('if the files are still missing after that one reload, the error page shows and nothing loops', async ({ page }) => {
  const { state, deploy } = await openApp(page);
  deploy();
  state.outage = true;
  await pageButton(page).dispatchEvent('click');
  await expect(page.getByRole('heading', { name: ERROR_TITLE })).toBeVisible({ timeout: 15_000 });
  const loads = state.loadsAfterDeploy;
  expect(loads).toBe(1);
  await page.waitForTimeout(3000);
  expect(state.loadsAfterDeploy).toBe(loads);
});

test('the sign-in check fails a few times while opening (a deploy switching over): no sign-in page', async ({ page }) => {
  const { state } = await openApp(page, { authFailures: 5 });
  expect(state.authChecks).toBeGreaterThan(5);
  await expect(page.getByRole('button', { name: /เข้าสู่ระบบ/ })).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a new build found while the app is open: tapping งาน opens it in the new build', async ({ page }) => {
    const { state, errorShown, deploy } = await openApp(page, { phone: true });
    deploy();
    const checked = page.waitForRequest(request => /^http:\/\/[^/]+\/$/.test(request.url()) && request.resourceType() === 'fetch');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await checked;
    await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'งาน', exact: true }).click();
    await expect(page).toHaveURL(/\/jobs\/[^/]+$/);
    await expect.poll(() => state.loadsAfterDeploy).toBe(1);
    await expect(page.locator('.ksm-nav-item[aria-current="page"]')).toContainText('งาน');
    expect(errorShown).toEqual([]);
  });
});

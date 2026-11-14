import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// เข้าสู่ระบบด้วย LINE and one-click เชื่อม LINE (owner, 2026-11-14: "เข้าทางไหนก็ได้"): the login page shows the LINE
// button only when the server says it is on, the button goes to LINE's sign-in, and Settings › LINE connects in one click
// (the code stays as the other way). LINE itself and the server are stood in (tests/line-login.test.ts covers the server).

test.use({ serviceWorkers: 'block' });

const user = { id: '88888888-8888-4888-8888-888888888888', email: 'park@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const LINE_URL = 'https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=2012039027&state=s';

async function open(page: Page, path: string, opts: { signedIn?: boolean; line?: boolean; width?: number } = {}) {
  const calls: { body: Record<string, unknown>; account?: string }[] = [];
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+07:00'));
  await page.addInitScript(id => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    localStorage.setItem('krarok_consent', JSON.stringify({ [id]: { terms: '2026-11-05', ai: '2026-11-05' } }));
    localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: false, at: '2026-11-05T03:00:00.000Z' }));
  }, user.id);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'access.line.me') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>LINE</title><h1>LINE Login</h1>' });
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('providers') === '1') return route.fulfill({ json: { providers: { google: true, facebook: false, line: opts.line ?? true } } });
    return route.fulfill({ json: { session: opts.signedIn ? { user } : null } });
  });
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-8888888888', displayName: 'ปาร์ค' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => (route.request().method() === 'POST'
    ? route.fulfill({ json: { ok: true, versions } })
    : route.fulfill({ json: { snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings, statuses: [], jobTypes: [], notifSettings: {} }, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } })));
  await page.route('**/api/line-login', route => {
    calls.push({ body: route.request().postDataJSON() as Record<string, unknown>, account: route.request().headers()['x-account-id'] });
    return route.fulfill({ json: { url: LINE_URL } });
  });
  await page.setViewportSize({ width: opts.width ?? 1440, height: 900 });
  await page.goto(path);
  await loadLayoutFonts(page);
  return calls;
}

for (const device of [{ name: 'computer', width: 1440 }, { name: 'phone', width: 390 }]) {
  test(`the login page offers ดำเนินการต่อด้วย LINE, which goes to LINE's sign-in (${device.name})`, async ({ page }) => {
    const calls = await open(page, '/login', { width: device.width });
    const chooser = page.getByTestId('auth-method-chooser');
    await expect(chooser.getByTestId('auth-line')).toHaveText('ดำเนินการต่อด้วย LINE');
    await page.waitForTimeout(800);
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/line-login-button-${device.name}.png` });
    await chooser.getByTestId('auth-line').click();
    await page.waitForURL(/access\.line\.me/);
    expect(calls).toEqual([{ body: { purpose: 'signin' }, account: undefined }]);
  });
}

test('without the LINE Login secret on the server, there is no LINE button at all (never "coming soon")', async ({ page }) => {
  await open(page, '/login', { line: false });
  await expect(page.getByTestId('auth-method-chooser')).toBeVisible();
  await expect(page.getByTestId('auth-line')).toHaveCount(0);
});

test('a LINE that is not linked to an account comes back with what to do', async ({ page }) => {
  await open(page, '/login?line=not_linked');
  await expect(page.getByTestId('auth-method-chooser').getByRole('alert')).toContainText('LINE นี้ยังไม่ได้เชื่อมกับบัญชีใด');
  await expect.poll(() => page.url()).not.toContain('line=');
});

test('Settings › LINE connects in one click after the consent, the code stays as the other way, and says when it is done', async ({ page }) => {
  const calls = await open(page, '/settings?line=cancelled', { signedIn: true });
  await expect(page.getByTestId('line-link-result')).toHaveText('ยกเลิกการเชื่อม LINE แล้ว ยังไม่มีการเปลี่ยนแปลง');
  await expect(page.getByTestId('line-connect-code')).toHaveText('หรือเชื่อมด้วยรหัส');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/line-login-settings.png' });
  await page.getByTestId('line-connect').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('กดยืนยันเพื่อยินยอมและไปเข้าสู่ระบบ LINE');
  await dialog.getByRole('button', { name: 'ยืนยัน' }).click();
  await page.waitForURL(/access\.line\.me/);
  expect(calls).toEqual([{ body: { purpose: 'link' }, account: user.id }]);
});

test('Settings › LINE after LINE linked it says so', async ({ page }) => {
  await open(page, '/settings?line=linked', { signedIn: true });
  await expect(page.getByTestId('line-link-result')).toHaveText('เชื่อม LINE แล้ว เปิดแชทกระรอกตุนเงินใน LINE แล้วพิมพ์บอกเลขาได้เลย');
});

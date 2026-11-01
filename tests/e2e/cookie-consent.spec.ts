import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The cookie banner and the loading logo (owner, 2026-11-02): "ทำปุ่มยอมรับคุกกี้" and the waiting squirrel replaced by
// the phone's opening logo on every device.

test.use({ storageState: { cookies: [], origins: [] } });

async function landing(page: Page) {
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: null } }));
  await page.goto('/');
}

for (const size of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`cookie banner: shown on the first visit, gone once chosen, kept after a reload, back from the footer (${size.name})`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await landing(page);
    const banner = page.getByRole('dialog', { name: 'เว็บไซต์นี้ใช้คุกกี้' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('ไม่มีคุกกี้โฆษณาหรือการติดตามข้ามเว็บไซต์');
    await expect(banner.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', '/privacy');
    const box = await banner.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height).toBeTruthy();
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`cookie-banner-${size.name}.png`) });

    await banner.getByRole('button', { name: 'เฉพาะที่จำเป็น' }).click();
    await expect(banner).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('krarok_cookie_consent')))!)).toMatchObject({ v: 1, stats: false });
    await page.reload();
    await expect(page.locator('.ck-banner')).toHaveCount(0);

    await page.getByRole('button', { name: 'ตั้งค่าคุกกี้' }).click();
    await expect(page.getByRole('dialog', { name: 'เว็บไซต์นี้ใช้คุกกี้' })).toBeVisible();
    await page.getByRole('button', { name: 'ยอมรับทั้งหมด' }).click();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('krarok_cookie_consent')))!)).toMatchObject({ v: 1, stats: true });
  });
}

test('cookie banner: English when the page is in English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'en'));
  await landing(page);
  const banner = page.getByRole('dialog', { name: 'This website uses cookies' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Accept all' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Essential only' })).toBeVisible();
});

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com' };
async function signedIn(page: Page, options: { consent?: boolean; slowAuthMs?: number } = {}) {
  const posts: string[] = [];
  await page.addInitScript(consent => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    if (consent !== undefined) localStorage.setItem('krarok_cookie_consent', JSON.stringify({ v: 1, stats: consent, at: '2026-11-02T00:00:00.000Z' }));
  }, options.consent);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', async route => {
    if (options.slowAuthMs) await new Promise(resolve => setTimeout(resolve, options.slowAuthMs));
    return route.fulfill({ json: { session: { user } } });
  });
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'member', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions: {} } : { snapshot: { jobs: [], expenses: [], goals: [], settings: {} }, versions: {} } }));
  await page.route('**/api/usage-analytics*', route => { if (route.request().method() === 'POST') posts.push(route.request().postData() || ''); return route.fulfill({ json: { ok: true } }); });
  return posts;
}

test('essential cookies only: the app sends no usage statistics; with everything accepted it does', async ({ page }) => {
  const off = await signedIn(page, { consent: false });
  await page.goto('/dashboard');
  await page.waitForTimeout(1500);
  await page.goto('/jobs');
  await page.waitForTimeout(1500);
  expect(off).toEqual([]);

  const context = await page.context().browser()!.newContext({ baseURL: page.url().replace(/\/jobs.*$/, ''), storageState: { cookies: [], origins: [] } });
  const other = await context.newPage();
  const on = await signedIn(other, { consent: true });
  await other.goto('/dashboard');
  await expect.poll(() => on.length, { timeout: 8000 }).toBeGreaterThan(0);
  await context.close();
});

test('a slow start shows the logo, not the waiting squirrel, and it fades into the page', async ({ page }) => {
  await signedIn(page, { consent: true, slowAuthMs: 2500 });
  await page.goto('/dashboard');
  const splash = page.locator('#app-splash');
  await expect(splash).toBeVisible({ timeout: 4000 });
  await expect(splash.locator('.splash-mark')).toBeVisible();
  await expect(page.getByText('กำลังโหลดข้อมูล กรุณารอสักครู่', { exact: true })).toHaveCount(0);
  await expect(splash).toHaveCount(0, { timeout: 10000 });
});

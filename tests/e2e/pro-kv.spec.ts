import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The weekly Pro invitation (owner, 2026-10-29): accounts not on Pro see the Gen Z poster (dark rust and gold, เลขากระรอก
// peeking out of the KRAROK PRO box) once a week; ✕ and ไว้ทีหลัง wait for next week; สมัคร Pro เลย opens the plans page.
// Automated browsers see it only with ?kv=auto / ?kv=pro.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'kv@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: true, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const KEY = `krarok.proKv.${user.id}`;

async function open(page: Page, path: string, { width = 1280, height = 820, pro = false, lastShown }: { width?: number; height?: number; pro?: boolean; lastShown?: string } = {}) {
  await page.addInitScript(([key, last]) => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    if (last && !sessionStorage.getItem('kv-seeded')) { localStorage.setItem(key, last); sessionStorage.setItem('kv-seeded', '1'); }
  }, [KEY, lastShown ?? ''] as const);
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: pro ? { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } : null } }));
  await page.setViewportSize({ width, height });
  await page.goto(path);
}
const kv = (page: Page) => page.getByTestId('pro-kv');
const shot = async (page: Page, name: string) => { if (process.env.SHOT_DIR) { await page.waitForTimeout(1200); await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` }); } };

test('a free account gets the invitation once a week; ✕ and ไว้ทีหลัง wait for next week', async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, '/dashboard?kv=auto');
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  // The headline: "จ้างเลขาส่วนตัว วันละไม่ถึง ฿6", the day's price worked out from ฿159 a month.
  await expect(kv(page).getByRole('heading', { name: /จ้างเลขาส่วนตัว\s*วันละไม่ถึง\s*฿6/ })).toBeVisible();
  await expect(page).not.toHaveURL(/kv=/);
  await expect(kv(page).getByTestId('kv-price')).toContainText('฿159');
  await expect(kv(page).getByTestId('kv-price')).toContainText('฿249');
  await expect(kv(page).getByRole('button', { name: 'สมัคร Pro เลย', exact: true })).toBeVisible();
  // เลขากระรอก is the app's own drawing, and what Pro gives is listed.
  await expect(kv(page).locator('.pkv-hero svg').first()).toBeVisible();
  for (const feature of ['เตือนใน LINE', 'แจ้งทางอีเมล', 'เอกสารไม่จำกัด']) await expect(kv(page).getByText(feature, { exact: true })).toBeVisible();
  await expect(kv(page).getByTestId('promo-countdown')).toBeVisible();
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'kv-computer');
  await kv(page).getByRole('button', { name: 'ปิด', exact: true }).click();
  await expect(kv(page)).toHaveCount(0);
  const stamp = await page.evaluate(key => localStorage.getItem(key), KEY);
  expect(Date.now() - Date.parse(stamp!)).toBeLessThan(60_000);
  // Within the week: not again.
  await page.goto('/dashboard?kv=auto');
  await page.waitForTimeout(4000);
  await expect(kv(page)).toHaveCount(0);
  // A week later: again; ไว้ทีหลัง closes it too.
  await page.evaluate(key => localStorage.setItem(key, new Date(Date.now() - 8 * 86_400_000).toISOString()), KEY);
  await page.goto('/dashboard?kv=auto');
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  await kv(page).getByRole('button', { name: 'ไว้ทีหลัง', exact: true }).click();
  await expect(kv(page)).toHaveCount(0);
});

test('Pro accounts never see it, and automated browsers only when asked', async ({ page }) => {
  await open(page, '/dashboard?kv=auto', { pro: true });
  await page.waitForTimeout(4000);
  await expect(kv(page)).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await open(page, '/dashboard');
  await page.waitForTimeout(4000);
  await expect(kv(page)).toHaveCount(0);
});

test('phones: the poster fits the screen; สมัคร Pro เลย opens the plans page', async ({ page }) => {
  await open(page, '/dashboard?kv=pro', { width: 390, height: 844 });
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(700);
  const box = (await kv(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(6);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 6);
  expect(box.y).toBeGreaterThanOrEqual(24);
  // The button and ไว้ทีหลัง below the poster stay on the screen.
  const later = (await kv(page).getByRole('button', { name: 'ไว้ทีหลัง', exact: true }).boundingBox())!;
  expect(later.y + later.height).toBeLessThanOrEqual(844 - 8);
  expect(await textOverlapIssues(page)).toEqual([]);
  await shot(page, 'kv-phone');
  await kv(page).getByRole('button', { name: 'สมัคร Pro เลย', exact: true }).click();
  await expect(kv(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/plans/);
});

test('iPad portrait and a short laptop: the poster fits the screen', async ({ page }) => {
  await open(page, '/dashboard?kv=pro', { width: 820, height: 1180 });
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(700);
  const box = (await kv(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(820 - 12);
  await shot(page, 'kv-ipad');
  // A laptop 700 px high: scaled down so ✕ and ไว้ทีหลัง stay on the screen.
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.waitForTimeout(400);
  const close = (await kv(page).getByRole('button', { name: 'ปิด', exact: true }).boundingBox())!;
  const later = (await kv(page).getByRole('button', { name: 'ไว้ทีหลัง', exact: true }).boundingBox())!;
  expect(close.y).toBeGreaterThanOrEqual(0);
  expect(later.y + later.height).toBeLessThanOrEqual(700);
  await shot(page, 'kv-laptop');
});

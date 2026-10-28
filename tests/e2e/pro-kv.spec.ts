import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The weekly Pro invitation (owner, 2026-10-29): accounts not on Pro see design B with the character clip once a week;
// ✕ and ไว้ทีหลัง wait for next week; สมัคร Pro opens the plans page. Automated browsers see it only with ?kv=auto / ?kv=pro.

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
  await expect(kv(page).getByRole('heading', { name: /พูดภาษาปกติ\s*เลขาจัดการให้/ })).toBeVisible();
  await expect(page).not.toHaveURL(/kv=/);
  await expect(kv(page).getByTestId('kv-price')).toContainText('฿159');
  await expect(kv(page).getByRole('button', { name: 'สมัคร Pro', exact: true })).toBeVisible();
  // The clip is there and its real screens load.
  await expect(kv(page).locator('.cl-stage')).toHaveCount(1);
  expect(await kv(page).locator('.x-state').first().evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  // The offer side reads cleanly (the clip draws over itself by design).
  expect((await textOverlapIssues(page)).filter(issue => !/ปัญหา|งานเยอะ|ส่งงาน|ลูกค้า|ทวงเงิน|ค้างรับ|ออกใบ|พรุ่งนี้|มายด์|บอส|รับงานเอง|ให้เลขา|จดงาน|แจ้งเตือน|รับเงิน|ถามเลขา|ขับรถ|LINE|GMAIL|กระรอกตุนเงิน|เตือนรับเงิน|สรุป|ครีเอเตอร์|ช่างภาพ|ตอนค่ำ|บันทึก|08:00|14:32|15:10|20:05|Aa|วันนี้|\+/.test(`${issue.a} ${issue.b ?? ''}`))).toEqual([]);
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

test('phones: a sheet from the bottom; สมัคร Pro opens the plans page', async ({ page }) => {
  await open(page, '/dashboard?kv=pro', { width: 390, height: 844 });
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(700);
  const box = (await kv(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(6);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 6);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await shot(page, 'kv-phone');
  await kv(page).getByRole('button', { name: 'สมัคร Pro', exact: true }).click();
  await expect(kv(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/plans/);
});

test('iPad portrait: the dialog fits the screen', async ({ page }) => {
  await open(page, '/dashboard?kv=pro', { width: 820, height: 1180 });
  await expect(kv(page)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(700);
  const box = (await kv(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(820 - 12);
  await shot(page, 'kv-ipad');
});

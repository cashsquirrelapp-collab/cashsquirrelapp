import { expect, test, type Page } from '@playwright/test';

// Live across devices (owner, 2026-11-16: "กูลบในคอมไปแล้วใน iPad ไม่หาย ในโทรศัพท์ไม่หาย กูลบในโทรศัพท์ไปแล้วใน iPad ดันยังไม่
// หาย ... ให้มันขึ้นแบบเรียลไทม์ด้วย"): an open app fetches the records again every few seconds and at once when it comes
// back to the screen, so a job deleted on another device leaves this one too; this device's own edit, not yet saved or on
// its way, is never overwritten, and a deleted job never comes back from a stale screen.

test.use({ serviceWorkers: 'block' });

const user = { id: '44444444-4444-4444-8444-444444444444', email: 'live@example.test', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const job = (id: string, name: string) => ({ id, name, client: 'ลูกค้าตัวอย่าง', type: 'ยังไม่ระบุ', note: '', value: 5000, received: 0, pending: 5000, status: 'pending', paymentStatus: 'unpaid',
  creditTerm: 15, isPosted: false, postDate: '2026-11-20', payDate: '2026-12-05', whtRate: 0, whtAmount: 0, startDate: '2026-11-10', excludeHolidays: false, installments: [] });
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' };
const statuses = [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }];
const snapshotOf = (jobs: ReturnType<typeof job>[]) => ({ jobs, expenses: [], goals: [], invoices: [], settings, statuses, job_types: ['ยังไม่ระบุ'],
  notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null });
const versionsOf = (jobs: Record<string, number>) => ({ cashflow_jobs: jobs, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {},
  cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } });

async function open(page: Page) {
  const server = { snapshot: snapshotOf([job('job-a', 'ตัดต่อคลิปรีวิว'), job('job-b', 'ถ่ายภาพสินค้า')]), versions: versionsOf({ 'job-a': 1, 'job-b': 1 }) };
  const posts: any[] = [];
  let reads = 0;
  let holdSave: Promise<void> | null = null;
  // Automated browsers refresh only when asked (App.tsx liveRefreshOn); people always.
  await page.addInitScript(() => { localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false'); localStorage.setItem('krarok.liveRefresh', 'on'); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-4444444444', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      posts.push(...body.changes);
      if (holdSave) await holdSave;
      return route.fulfill({ json: { ok: true } });
    }
    reads += 1;
    return route.fulfill({ json: { snapshot: server.snapshot, versions: server.versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' } } });
  });
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/jobs');
  await expect(page.locator('[data-job-id="job-b"]').filter({ visible: true }).first()).toBeVisible();
  return { server, posts, reads: () => reads, hold: (until: Promise<void> | null) => { holdSave = until; } };
}
const backToScreen = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

test('a job deleted on another device leaves this screen when the app comes back, and is never saved back', async ({ page }) => {
  const mock = await open(page);
  // Deleted on the phone: the server no longer has it.
  mock.server.snapshot = snapshotOf([job('job-a', 'ตัดต่อคลิปรีวิว')]);
  mock.server.versions = versionsOf({ 'job-a': 1 });
  await backToScreen(page);
  await expect(page.locator('[data-job-id="job-b"]')).toHaveCount(0);
  await expect(page.locator('[data-job-id="job-a"]').filter({ visible: true }).first()).toBeVisible();
  await page.waitForTimeout(2500);
  expect(mock.posts.filter(change => change.id === 'job-b')).toEqual([]);
});

test('without coming back, the open screen catches up by itself within seconds', async ({ page }) => {
  test.setTimeout(45_000);
  const mock = await open(page);
  const before = mock.reads();
  mock.server.snapshot = snapshotOf([job('job-a', 'ตัดต่อคลิปรีวิว — แก้จาก iPad'), job('job-b', 'ถ่ายภาพสินค้า')]);
  mock.server.versions = versionsOf({ 'job-a': 2, 'job-b': 1 });
  await expect(page.getByText('ตัดต่อคลิปรีวิว — แก้จาก iPad').first()).toBeVisible({ timeout: 20_000 });
  expect(mock.reads()).toBeGreaterThan(before);
});

test('this device\'s own edit on its way is never overwritten; the other device\'s change comes after it', async ({ page }) => {
  const mock = await open(page);
  // A job deleted here, its save held on the way.
  let release!: () => void;
  mock.hold(new Promise<void>(resolve => { release = resolve; }));
  const row = page.locator('[data-job-id="job-a"]').filter({ visible: true }).first();
  await row.hover();
  await row.getByRole('button', { name: /เมนู|ตัวเลือก|เพิ่มเติม/ }).first().click();
  await page.getByRole('menuitem', { name: 'ลบ' }).click();
  await page.getByRole('dialog', { name: 'ยืนยันการลบงาน' }).getByRole('button', { name: 'ยืนยัน' }).click();
  await expect(page.locator('[data-job-id="job-a"]')).toHaveCount(0);
  // Meanwhile the server (still) has it, with another device's edit to job B.
  mock.server.snapshot = snapshotOf([job('job-a', 'ตัดต่อคลิปรีวิว'), job('job-b', 'ถ่ายภาพสินค้า — แก้จากมือถือ')]);
  mock.server.versions = versionsOf({ 'job-a': 1, 'job-b': 2 });
  await backToScreen(page);
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-job-id="job-a"]'), 'the delete on its way is not undone by the refresh').toHaveCount(0);
  release();
  await expect.poll(() => mock.posts.some(change => change.id === 'job-a' && change.op === 'delete')).toBe(true);
  // Saved: the server now matches, and the other device's edit arrives.
  mock.server.snapshot = snapshotOf([job('job-b', 'ถ่ายภาพสินค้า — แก้จากมือถือ')]);
  mock.server.versions = versionsOf({ 'job-b': 2 });
  await page.waitForTimeout(300);
  await backToScreen(page);
  await expect(page.getByText('ถ่ายภาพสินค้า — แก้จากมือถือ').first()).toBeVisible();
  await expect(page.locator('[data-job-id="job-a"]')).toHaveCount(0);
});

test('automated browsers that did not ask never refresh by themselves (the rest of the suite keeps its fixed servers)', async ({ page }) => {
  const mock = await open(page);
  // Registered after open()'s own script, so it runs after it on the reload: the switch is off.
  await page.addInitScript(() => localStorage.removeItem('krarok.liveRefresh'));
  await page.reload();
  await expect(page.locator('[data-job-id="job-b"]').filter({ visible: true }).first()).toBeVisible();
  const before = mock.reads();
  mock.server.snapshot = snapshotOf([job('job-a', 'ตัดต่อคลิปรีวิว')]);
  mock.server.versions = versionsOf({ 'job-a': 1 });
  await backToScreen(page);
  await page.waitForTimeout(2000);
  expect(mock.reads()).toBe(before);
  await expect(page.locator('[data-job-id="job-b"]').filter({ visible: true }).first()).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { CONSENT_VERSIONS } from '../../shared/consents';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ชวนเพื่อน รับ 200 โทเคน (owner, 2026-11-05: "ทำเป็นปุ่มเล็กๆ ... ไม่ต้องเป็นการ์ดใหญ่"): a small button on the overview that
// opens the window with the account's code (after Fastwork's invite card, no LINE), the friend's code for a new member (opened
// by itself from a shared link), the answers when a code cannot count, and the way there from เลขา's chat. The backend is
// mocked; nothing is sent anywhere.

test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const id = '66666666-6666-4666-8666-666666666666';
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], statuses: [], jobTypes: [], notifSettings: {},
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T09:01:00.000Z' } } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const base = { code: 'SQ-6666AB12CD', rewarded: 1, pending: 0, tokens: 200, perPerson: 2, left: 63, total: 100, canEnter: false, entered: null };

async function open(page: Page, { width = 1440, height = 900, path = '/dashboard', canEnter = false, refuse }: { width?: number; height?: number; path?: string; canEnter?: boolean; refuse?: { error: string; code: string } } = {}) {
  const user = { id, email: 'friend@example.com', role: 'user', created_at: '2026-11-05T10:00:00Z', email_confirmed_at: '2026-11-05T10:00:00Z', user_metadata: {} };
  let status: Record<string, unknown> = { ...base, canEnter };
  const posts: unknown[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
    const opened: string[] = [];
    (window as unknown as { __opened: string[] }).__opened = opened;
    window.open = ((url?: string | URL) => { opened.push(String(url)); return null; }) as typeof window.open;
  });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: id, publicId: 'SQ-6666AB12CD', displayName: 'เพื่อนใหม่' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true, versions } : { snapshot, versions, subscription: null } }));
  const agreed = Object.fromEntries(Object.entries(CONSENT_VERSIONS).map(([key, version]) => [key, { version, at: '2026-11-05T10:00:00.000Z' }]));
  await page.route('**/api/consent', route => route.fulfill({ json: { consents: agreed, versions: CONSENT_VERSIONS } }));
  await page.route('**/api/assistant', route => route.fulfill({ json: { enabled: true, plan: 'none', tokensLeft: null, trialLeft: null, resetsAt: null, tokenLimit: null, requestLimit: null } }));
  await page.route('**/api/referral', route => {
    const request = route.request();
    expect(request.headers()['x-device-id']).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    if (request.method() === 'GET') return route.fulfill({ json: status });
    posts.push(request.postDataJSON());
    if (refuse) return route.fulfill({ status: 409, json: refuse });
    status = { ...status, canEnter: false, entered: { code: 'SQ-1111AB22CD', status: 'pending' } };
    return route.fulfill({ json: status });
  });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await loadLayoutFonts(page);
  return { posts };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'ipad', width: 744, height: 1133 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the ${device.name}: a small button, no card; its window has the code, 2 people a code, rewards left, one copy, no LINE`, async ({ page }) => {
    await open(page, device);
    const button = page.getByTestId('referral-button');
    await expect(button).toContainText('ชวนเพื่อน รับ 200 โทเคน');
    await expect(button).toContainText('สำหรับใช้งานเอเจนต์เลขากระรอก');
    const box = (await button.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(56);
    expect(box.width).toBeLessThan(300);
    await expect(page.getByTestId('referral-dialog')).toHaveCount(0);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.waitForTimeout(400); // the overview's fade-in
    await page.screenshot({ path: `test-results/referral-${device.name}-button.png` });
    await button.click();
    const dialog = page.getByTestId('referral-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('referral-code')).toHaveText('SQ-6666AB12CD');
    await expect(dialog).toContainText('โค้ดนี้ใช้ได้แค่ 2 คน');
    await expect(dialog).toContainText('ใช้แล้ว 1/2 คน');
    await expect(dialog).toContainText('ได้แล้ว 200 โทเคน');
    await expect(dialog).toContainText('แคมเปญเหลือ 63 สิทธิ์');
    await expect(dialog.getByRole('button', { name: /LINE/ })).toHaveCount(0);
    await expect(page.getByTestId('referral-entry')).toHaveCount(0);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/referral-${device.name}.png` });
    await dialog.getByRole('button', { name: 'คัดลอกโค้ด' }).click();
    await expect(page.getByText('คัดลอกโค้ดแล้ว')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SQ-6666AB12CD');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

test('a code used by both people: the window says so and there is nothing to copy', async ({ page }) => {
  await open(page);
  await page.route('**/api/referral', route => route.fulfill({ json: { ...base, rewarded: 1, pending: 1 } }));
  await page.reload();
  await page.getByTestId('referral-button').click();
  const dialog = page.getByTestId('referral-dialog');
  await expect(dialog).toContainText('โค้ดนี้ใช้ครบ 2 คนแล้ว');
  await expect(dialog.getByRole('button', { name: 'คัดลอกโค้ด' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'ปิด' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('referral-button').click();
  await page.mouse.click(20, 20);
  await expect(dialog).toHaveCount(0);
});

test('a new member from a shared link: the window opens once with the friend\'s code; entering it is thanked', async ({ page }) => {
  const mock = await open(page, { path: '/dashboard?ref=sq-1111ab22cd', canEnter: true });
  const entry = page.getByTestId('referral-entry');
  await expect(entry).toBeVisible();
  await expect(page.getByTestId('referral-input')).toHaveValue('SQ-1111AB22CD');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.screenshot({ path: 'test-results/referral-entry.png' });
  await page.getByTestId('referral-submit').click();
  await expect(page.getByText('บันทึกโค้ดของเพื่อนแล้ว')).toBeVisible();
  await expect(page.getByText('เมื่อคุณบันทึกงานหรือรายจ่ายแรก เพื่อนจะได้รับ 200 โทเคน')).toBeVisible();
  expect(mock.posts).toEqual([{ code: 'SQ-1111AB22CD' }]);
  await expect(page.getByTestId('referral-dialog')).toHaveCount(0);
  await page.getByTestId('referral-button').click();
  await expect(page.getByTestId('referral-dialog')).toBeVisible();
  await expect(entry).toHaveCount(0);
});

test('the shared-link window opens only once on this device', async ({ page }) => {
  await open(page, { path: '/dashboard?ref=sq-1111ab22cd', canEnter: true });
  await expect(page.getByTestId('referral-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('referral-button')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('referral-dialog')).toHaveCount(0);
});

test('a code from a device already used: said plainly, nothing counted', async ({ page }) => {
  await open(page, { width: 390, height: 844, canEnter: true, refuse: { error: 'เครื่องนี้ใช้กรอกโค้ดชวนเพื่อนไปแล้ว', code: 'referral_device' } });
  await page.getByTestId('referral-button').click();
  await page.getByTestId('referral-input').fill('SQ-1111AB22CD');
  await page.getByTestId('referral-submit').click();
  await expect(page.getByText('ใช้โค้ดนี้ไม่ได้')).toBeVisible();
  await expect(page.getByText('เครื่องนี้ใช้กรอกโค้ดชวนเพื่อนไปแล้ว')).toBeVisible();
  await expect(page.getByTestId('referral-entry')).toBeVisible();
});

test('เลขา without Pro opens the invite code from the chat', async ({ page }) => {
  await open(page, { path: '/assistant' });
  const line = page.getByTestId('chat-referral');
  await expect(line).toContainText('ชวนเพื่อน 1 คน รับ 200 โทเคน');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.getByTestId('chat-referral-open').click();
  await expect(page.getByTestId('referral-dialog')).toBeVisible();
  await expect(page.getByTestId('referral-code')).toHaveText('SQ-6666AB12CD');
});

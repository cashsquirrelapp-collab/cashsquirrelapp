import { expect, test, type Page } from '@playwright/test';
import { CONSENT_VERSIONS } from '../../shared/consents';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// ใส่โค้ด รับ 200 โทเคน, ส่งต่อให้เพื่อน (owner, 2026-11-05, round 2: "กูอยากให้มันมีปุ่มให้ใส่โค้ด ... โค้ดกูจะได้ประมาณสัก
// 5 สิทธิ์ ... แนะนำกันต่อกันเอง"): an account that may still enter a code has the orange "ใส่โค้ด รับ 200 โทเคน" (and a
// small แนะนำเพื่อนร่วมอาชีพ on computers and iPads); entering gives the tokens at once and leads on to passing the account's own code
// on (5 people a code, the owner's too, no LINE). A shared link opens the window once with the code in it, and
// เลขา's chat offers it to an account without Pro. The backend is mocked; nothing is sent anywhere.

test.use({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });

const id = '66666666-6666-4666-8666-666666666666';
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], statuses: [], jobTypes: [], notifSettings: {},
  settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-05T09:01:00.000Z' },
    // The evening dark-mode tip (from 18:00 for a new account) already answered, so the checks hold at any hour.
    theme: { mode: 'light', darkFrom: '18:00', lightFrom: '06:00', asked: true } } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };
const base = { code: 'SQ-6666AB12CD', used: 1, tokens: 200, perPerson: 5 as number | null, left: 63, total: 100, canEnter: false, entered: null as unknown };

async function open(page: Page, { width = 1440, height = 900, path = '/dashboard', canEnter = false, refuse, status: given, createdAt = '2026-11-05T10:00:00Z' }: { width?: number; height?: number; path?: string; canEnter?: boolean; refuse?: { error: string; code: string }; status?: Partial<typeof base>; createdAt?: string } = {}) {
  const user = { id, email: 'friend@example.com', role: 'user', created_at: createdAt, email_confirmed_at: '2026-11-05T10:00:00Z', user_metadata: {} };
  let status: Record<string, unknown> = { ...base, canEnter, ...given };
  const posts: unknown[] = [];
  const assistantReads: string[] = [];
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
  await page.route('**/api/assistant', route => { if (route.request().method() === 'GET') assistantReads.push(new Date().toISOString()); return route.fulfill({ json: { enabled: true, plan: 'none', tokensLeft: null, trialLeft: null, resetsAt: null, tokenLimit: null, requestLimit: null } }); });
  await page.route('**/api/referral', route => {
    const request = route.request();
    expect(request.headers()['x-device-id']).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    if (request.method() === 'GET') return route.fulfill({ json: status });
    posts.push(request.postDataJSON());
    if (refuse) return route.fulfill({ status: 409, json: refuse });
    status = { ...status, canEnter: false, entered: { code: 'SQ-1111AB22CD', status: 'rewarded' } };
    return route.fulfill({ json: status });
  });
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await loadLayoutFonts(page);
  return { posts, assistantReads };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'laptop', width: 1280, height: 800 }, { name: 'ipad', width: 744, height: 1133 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`the ${device.name}: ใส่โค้ด รับ 200 โทเคน, the tokens at once, then the own code to pass on`, async ({ page }) => {
    const mock = await open(page, { ...device, canEnter: true });
    const button = page.getByTestId('referral-button');
    await expect(button).toContainText('ใส่โค้ด รับ 200 โทเคน');
    await expect(button).toContainText('สำหรับใช้งานเอเจนต์เลขากระรอก');
    const box = (await button.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(56);
    expect(box.width).toBeLessThan(300);
    // Computers and iPads also have a small แนะนำเพื่อนร่วมอาชีพ beside it; phones keep one button.
    await expect(page.getByTestId('referral-share-button')).toHaveCount(device.name === 'phone' ? 0 : 1);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.waitForTimeout(400); // the overview's fade-in
    await page.screenshot({ path: `test-results/referral-${device.name}-button.png` });
    await button.click();
    const dialog = page.getByTestId('referral-dialog');
    await expect(dialog).toHaveAttribute('data-view', 'enter');
    await expect(dialog.getByRole('heading')).toHaveText('ใส่โค้ด รับ 200 โทเคน');
    await expect(dialog).toContainText('แคมเปญเหลือ 63 สิทธิ์');
    // Empty, with the shape of a code as a faint hint; nothing to delete before pasting.
    await expect(page.getByTestId('referral-input')).toHaveValue('');
    await expect(page.getByTestId('referral-input')).toHaveAttribute('placeholder', 'SQ-XXXXXXXXXX');
    await expect(page.getByTestId('referral-submit')).toBeDisabled();
    await page.screenshot({ path: `test-results/referral-${device.name}-empty.png` });
    await page.getByTestId('referral-input').fill('sq-1111ab22cd');
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/referral-${device.name}-enter.png` });
    const readsBefore = mock.assistantReads.length;
    await page.getByTestId('referral-submit').click();
    await expect(dialog).toHaveAttribute('data-view', 'done');
    await expect(dialog.getByRole('heading')).toHaveText('ได้รับ 200 โทเคนแล้ว');
    expect(mock.posts).toEqual([{ code: 'SQ-1111AB22CD' }]);
    // เลขา is asked again at once, so it turns on without a reload.
    await expect.poll(() => mock.assistantReads.length).toBeGreaterThan(readsBefore);
    await page.screenshot({ path: `test-results/referral-${device.name}-done.png` });
    await page.getByTestId('referral-pass-on').click();
    await expect(dialog).toHaveAttribute('data-view', 'share');
    await expect(page.getByTestId('referral-code')).toHaveText('SQ-6666AB12CD');
    await expect(dialog).toContainText('โค้ดนี้ใช้ได้แค่ 5 คน');
    await expect(dialog).toContainText('ใช้แล้ว 1/5 คน');
    await expect(dialog.getByRole('button', { name: /LINE/ })).toHaveCount(0);
    await expect(page.getByTestId('referral-to-enter')).toHaveCount(0);
    await expect(dialog.getByRole('heading')).toHaveText('แนะนำเพื่อนร่วมอาชีพ');
    await expect(page.getByText('ชวนเพื่อน')).toHaveCount(0); // owner: words for people at work, not a social app
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/referral-${device.name}.png` });
    await dialog.getByRole('button', { name: 'คัดลอกโค้ด' }).click();
    await expect(page.getByText('คัดลอกโค้ดแล้ว')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SQ-6666AB12CD');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toContainText('แนะนำเพื่อนร่วมอาชีพ');
    await expect(button).toContainText('ให้ใช้เลขากระรอกฟรี 200 โทเคน');
  });
}

test('an account that has entered a code: the button opens its own code, with no way back to entering one', async ({ page }) => {
  await open(page, { status: { entered: { code: 'SQ-1111AB22CD', status: 'rewarded' } } });
  await expect(page.getByTestId('referral-button')).toContainText('แนะนำเพื่อนร่วมอาชีพ');
  await expect(page.getByTestId('referral-share-button')).toHaveCount(0);
  await page.getByTestId('referral-button').click();
  await expect(page.getByTestId('referral-dialog')).toHaveAttribute('data-view', 'share');
  await expect(page.getByTestId('referral-to-enter')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.close();
});

test('the small แนะนำเพื่อนร่วมอาชีพ opens the own code, and from there the way back to entering one', async ({ page }) => {
  await open(page, { canEnter: true });
  await page.getByTestId('referral-share-button').click();
  const dialog = page.getByTestId('referral-dialog');
  await expect(dialog).toHaveAttribute('data-view', 'share');
  await page.getByTestId('referral-to-enter').click();
  await expect(dialog).toHaveAttribute('data-view', 'enter');
  await page.getByTestId('referral-to-share').click();
  await expect(dialog).toHaveAttribute('data-view', 'share');
});

test('a code used by all 5: the window says so and there is nothing to copy', async ({ page }) => {
  await open(page, { status: { used: 5 } });
  await page.getByTestId('referral-button').click();
  const dialog = page.getByTestId('referral-dialog');
  await expect(dialog).toContainText('โค้ดนี้ใช้ครบ 5 คนแล้ว');
  await expect(dialog.getByRole('button', { name: 'คัดลอกโค้ด' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'ปิด' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId('referral-button').click();
  await page.mouse.click(20, 20);
  await expect(dialog).toHaveCount(0);
});

test('a code without a limit (none today: every code takes 5, the owner\'s too) would say so', async ({ page }) => {
  await open(page, { status: { perPerson: null, used: 12 } });
  await page.getByTestId('referral-button').click();
  const dialog = page.getByTestId('referral-dialog');
  await expect(dialog).toContainText('โค้ดนี้ใช้ได้ไม่จำกัดจำนวน');
  await expect(dialog).toContainText('ใช้แล้ว 12 คน');
  await expect(dialog.getByRole('button', { name: 'คัดลอกโค้ด' })).toBeVisible();
});

test('from a shared link: the window opens once with the friend\'s code in it', async ({ page }) => {
  const mock = await open(page, { path: '/dashboard?ref=sq-1111ab22cd', canEnter: true, createdAt: new Date().toISOString() });
  const dialog = page.getByTestId('referral-dialog');
  await expect(dialog).toHaveAttribute('data-view', 'enter');
  await expect(page.getByTestId('referral-input')).toHaveValue('SQ-1111AB22CD');
  await page.getByTestId('referral-submit').click();
  await expect(dialog).toHaveAttribute('data-view', 'done');
  expect(mock.posts).toEqual([{ code: 'SQ-1111AB22CD' }]);
});

test('an older account is not handed a code a link once left on this device (owner, 2026-11-06)', async ({ page }) => {
  // One kept the old way (no time) is forgotten at once; a link opened by an account made before it fills nothing.
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('krarok_ref', 'SQ-5971AA4D85'); } });
  await open(page, { canEnter: true });
  await page.getByTestId('referral-button').click();
  await expect(page.getByTestId('referral-input')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('krarok_ref'))).toBeNull();
  await page.goto('/dashboard?ref=sq-1111ab22cd');
  await expect(page.getByTestId('referral-button')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('referral-dialog')).toHaveCount(0);
  await page.getByTestId('referral-button').click();
  await expect(page.getByTestId('referral-input')).toHaveValue('');
});

test('a pasted code is cleaned: no doubled SQ-, and the 10 characters alone are enough', async ({ page }) => {
  const mock = await open(page, { canEnter: true });
  await page.getByTestId('referral-button').click();
  const input = page.getByTestId('referral-input');
  await input.focus();
  await page.evaluate(() => navigator.clipboard.writeText('กรอกโค้ด SQ-1111AB22CD รับ 200 โทเคน'));
  await page.keyboard.press('ControlOrMeta+V');
  await expect(input).toHaveValue('SQ-1111AB22CD');
  await input.fill('1111ab22cd');
  await expect(page.getByTestId('referral-submit')).toBeEnabled();
  await page.getByTestId('referral-submit').click();
  await expect(page.getByTestId('referral-dialog')).toHaveAttribute('data-view', 'done');
  expect(mock.posts).toEqual([{ code: 'SQ-1111AB22CD' }]);
});

test('the shared-link window opens only once on this device', async ({ page }) => {
  await open(page, { path: '/dashboard?ref=sq-1111ab22cd', canEnter: true, createdAt: new Date().toISOString() });
  await expect(page.getByTestId('referral-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('referral-button')).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('referral-dialog')).toHaveCount(0);
});

test('a code from a device already used: said plainly, nothing given', async ({ page }) => {
  await open(page, { width: 390, height: 844, canEnter: true, refuse: { error: 'เครื่องนี้ใช้กรอกโค้ดไปแล้ว', code: 'referral_device' } });
  await page.getByTestId('referral-button').click();
  await page.getByTestId('referral-input').fill('SQ-1111AB22CD');
  await page.getByTestId('referral-submit').click();
  await expect(page.getByText('ใช้โค้ดนี้ไม่ได้')).toBeVisible();
  await expect(page.getByText('เครื่องนี้ใช้กรอกโค้ดไปแล้ว')).toBeVisible();
  await expect(page.getByTestId('referral-dialog')).toHaveAttribute('data-view', 'enter');
});

test('เลขา without Pro offers ใส่โค้ด, which opens the window', async ({ page }) => {
  await open(page, { path: '/assistant', canEnter: true });
  const line = page.getByTestId('chat-referral');
  await expect(line).toContainText('มีโค้ดแนะนำ รับ 200 โทเคน');
  expect(await textOverlapIssues(page)).toEqual([]);
  await page.getByTestId('chat-referral-open').click();
  await expect(page.getByTestId('referral-dialog')).toHaveAttribute('data-view', 'enter');
});

test('เลขา says nothing about codes to an account that has already entered one', async ({ page }) => {
  await open(page, { path: '/assistant', status: { entered: { code: 'SQ-1111AB22CD', status: 'rewarded' } } });
  await expect(page.locator('#asx-message, [data-testid="ai-consent"]').first()).toBeAttached();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('chat-referral')).toHaveCount(0);
});

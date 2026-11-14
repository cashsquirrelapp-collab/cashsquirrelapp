import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';
import { loadLayoutFonts } from './testFonts';

// เพิ่มอีเมลและรหัสผ่าน (owner, 2026-11-14: "เข้าทางไหนก็ได้ ... ใช้ในเว็บไซต์ได้เหมือนกัน"): an account made in LINE adds an
// email and a password in Settings › ข้อมูลส่วนตัว; a link goes to the address; opening it comes back to
// /settings?loginEmail=added. Computer and phone, no overlapping text. The server is stood in (tests/account-email.test.ts).

test.use({ serviceWorkers: 'block' });

const user = { id: '77777777-7777-4777-8777-777777777777', email: 'u0123456789abcdef0123456789abcdef@line.krarok.invalid', role: 'user', created_at: '2026-11-13T00:00:00Z', user_metadata: {} };
const settings = { monthlyExpense: 0, monthlyRevenueGoal: 0, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance', onboarding: { completedAt: '2026-11-13T03:00:00.000Z' } };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, size: { width: number; height: number }, path = '/settings') {
  const posts: Record<string, unknown>[] = [];
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
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-7777777777', displayName: 'ปาร์ค' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/data*', route => (route.request().method() === 'POST'
    ? route.fulfill({ json: { ok: true, versions } })
    : route.fulfill({ json: { snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings, statuses: [], jobTypes: [], notifSettings: { lineUserId: 'U0123456789abcdef0123456789abcdef' } }, versions, subscription: null } })));
  await page.route('**/api/account-email', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push({ ...body, account: route.request().headers()['x-account-id'] });
    return body.email === 'taken@example.com'
      ? route.fulfill({ status: 409, json: { error: 'อีเมลนี้ใช้กับบัญชีอื่นอยู่แล้ว ถ้าเป็นบัญชีของคุณ ให้เข้าสู่ระบบด้วยอีเมลนั้น แล้วเชื่อม LINE ที่หน้าตั้งค่าแทน' } })
      : route.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize(size);
  await page.goto(path);
  await loadLayoutFonts(page);
  return { posts };
}

for (const device of [{ name: 'computer', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`a LINE account adds an email and a password on the ${device.name}; a taken address says so`, async ({ page }) => {
    const { posts } = await open(page, device);
    await page.getByRole('button', { name: /^ข้อมูลส่วนตัว/ }).last().click();
    await expect(page.getByText('บัญชี LINE (เข้าใช้ผ่าน LINE)')).toBeVisible();
    await page.getByTestId('login-email-open').click();
    const form = page.getByTestId('login-email-form');
    await form.getByLabel('อีเมล').fill('taken@example.com');
    await form.getByLabel('รหัสผ่าน', { exact: true }).fill('short');
    await expect(page.getByTestId('login-email-send')).toBeDisabled();
    await form.getByLabel('รหัสผ่าน', { exact: true }).fill('krarok2569');
    expect(await textOverlapIssues(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `test-results/settings-login-email-${device.name}.png` });
    await page.getByTestId('login-email-send').click();
    await expect(form.getByRole('alert')).toContainText('อีเมลนี้ใช้กับบัญชีอื่นอยู่แล้ว');
    await form.getByLabel('อีเมล').fill('Park@Example.com');
    await page.getByTestId('login-email-send').click();
    await expect(page.getByRole('status').filter({ hasText: 'ส่งลิงก์ยืนยันไปที่ park@example.com แล้ว' })).toBeVisible();
    expect(posts.at(-1)).toEqual({ email: 'Park@Example.com', password: 'krarok2569', account: user.id });
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.screenshot({ path: `test-results/settings-login-email-sent-${device.name}.png` });
  });
}

test('the link in the email comes back to the profile page, which says the email was added', async ({ page }) => {
  await open(page, { width: 1440, height: 900 }, '/settings?loginEmail=added');
  await expect(page.getByTestId('login-email-result')).toHaveText('เพิ่มอีเมลแล้ว เข้าสู่ระบบบนเว็บด้วยอีเมลนี้และรหัสผ่านที่ตั้งไว้ได้เลย');
  await expect.poll(() => page.url()).not.toContain('loginEmail=');
});

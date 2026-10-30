import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// Light and dark by the clock or by hand, chosen per account (owner, 2026-10-30): accounts from before keep 18:00 / 06:00,
// a new account stays light all night until it chooses, and from 18:00 it gets one tip, asked once for the account.

test.use({ serviceWorkers: 'block' });

const OLD = '2026-01-01T00:00:00Z';
const NEW = '2026-10-30T09:00:00+07:00';
const bangkok = (time: string) => new Date(`2026-10-30T${time}:00+07:00`);

async function open(page: Page, options: { createdAt: string; at: Date; width?: number; height?: number; theme?: Record<string, unknown>; device?: Record<string, string> }) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'theme@example.test', role: 'user', created_at: options.createdAt, user_metadata: {} };
  const settings: Record<string, unknown> = { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance',
    // the welcome questions are answered, so they do not cover the tip
    onboarding: { status: 'COMPLETED', work_type: 'freelance', occupations: [], goals: [], updated_at: NEW, completed_at: NEW },
    ...(options.theme ? { theme: options.theme } : {}) };
  const saved: Record<string, unknown>[] = [];
  await page.clock.setFixedTime(options.at);
  await page.addInitScript(device => {
    localStorage.setItem('cashflow_language', 'th');
    for (const [key, value] of Object.entries(device)) localStorage.setItem(key, value);
  }, options.device ?? {});
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ status: 501, json: { error: 'Unmocked test endpoint' } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { changes?: { table: string; id: string; data: Record<string, unknown> }[] };
      for (const change of body.changes ?? []) if (change.table === 'cashflow_documents' && change.id === 'settings') { saved.push(change.data); Object.assign(settings, change.data); }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {
      snapshot: { jobs: [], expenses: [], goals: [], invoices: [], settings, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null },
      versions: { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } },
      subscription: null,
    } });
  });
  await page.setViewportSize({ width: options.width ?? 1280, height: options.height ?? 800 });
  await page.goto('/dashboard');
  await expect(page.getByText('มูลค่างานเดือนนี้').first()).toBeVisible();
  return { saved, settings };
}
const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const tip = (page: Page) => page.getByRole('dialog', { name: 'ตั้งเวลาโหมดมืดได้' });

test('a new account stays light at night, and from 18:00 gets the tip once: dark at night is kept for the account', async ({ page }) => {
  const mock = await open(page, { createdAt: NEW, at: bangkok('19:30') });
  await expect(tip(page)).toBeVisible();
  expect(await isDark(page)).toBe(false); // light all night until it chooses
  expect(await textOverlapIssues(page)).toEqual([]);
  await tip(page).getByRole('button', { name: 'ใช้โหมดมืดตอนกลางคืน' }).click();
  await expect(tip(page)).toHaveCount(0);
  await expect.poll(() => isDark(page)).toBe(true);
  await expect.poll(() => mock.saved.at(-1)?.theme).toEqual({ mode: 'auto', darkFrom: '18:00', lightFrom: '06:00', asked: true });
  // the next evening, on this device or another: never asked again
  await page.reload();
  await expect(page.getByText('มูลค่างานเดือนนี้').first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(tip(page)).toHaveCount(0);
  expect(await isDark(page)).toBe(true);
});

test('before 18:00 there is no tip; an account from before gets none and keeps the 18:00 / 06:00 clock', async ({ page }) => {
  await open(page, { createdAt: NEW, at: bangkok('17:40') });
  await page.waitForTimeout(800);
  await expect(tip(page)).toHaveCount(0);
  await page.close();
  const other = await page.context().newPage();
  await open(other, { createdAt: OLD, at: bangkok('19:30') });
  await other.waitForTimeout(800);
  await expect(tip(other)).toHaveCount(0);
  await expect.poll(() => isDark(other)).toBe(true); // the usual evening switch, as before
});

test('"ตั้งเวลาเอง" opens the display sheet; the chosen times are saved and followed', async ({ page }) => {
  const mock = await open(page, { createdAt: NEW, at: bangkok('19:30') });
  await tip(page).getByRole('button', { name: 'ตั้งเวลาเอง' }).click();
  await expect(tip(page)).toHaveCount(0);
  const sheet = page.getByRole('radiogroup', { name: 'การแสดงผล' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /สว่างตลอด/ })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => (mock.saved.at(-1)?.theme as { asked?: boolean } | undefined)?.asked).toBe(true);
  await sheet.getByRole('radio', { name: /อัตโนมัติตามเวลา/ }).click();
  await page.getByLabel('เริ่มโหมดมืด').fill('21:00');
  await page.getByLabel('กลับเป็นโหมดสว่าง').fill('07:00');
  await expect(sheet).toContainText('ตอนนี้เป็นโหมดสว่าง · สลับเป็นโหมดมืดตอน 21:00');
  await expect.poll(() => mock.saved.at(-1)?.theme).toEqual({ mode: 'auto', darkFrom: '21:00', lightFrom: '07:00', asked: true });
  expect(await isDark(page)).toBe(false); // 19:30 is before 21:00
  await sheet.getByRole('radio', { name: /มืดตลอด/ }).click();
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('by hand: always dark stays dark in the morning; the sun / moon button changes the choice', async ({ page }) => {
  const mock = await open(page, { createdAt: OLD, at: bangkok('09:00'), theme: { mode: 'dark', darkFrom: '18:00', lightFrom: '06:00', asked: true } });
  await expect.poll(() => isDark(page)).toBe(true);
  await page.getByRole('button', { name: 'เปลี่ยนเป็นโหมดสว่าง' }).first().click();
  await expect.poll(() => isDark(page)).toBe(false);
  await expect.poll(() => (mock.saved.at(-1)?.theme as { mode?: string } | undefined)?.mode).toBe('light');
});

test('phone: the tip sits at the top, clear of the bottom bar and the squirrel; nothing covers its text', async ({ page }) => {
  await open(page, { createdAt: NEW, at: bangkok('20:00'), width: 390, height: 844 });
  await expect(tip(page)).toBeVisible();
  const box = (await tip(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(15);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 15);
  expect(box.y).toBeLessThan(40);
  expect(box.y + box.height).toBeLessThanOrEqual(844 / 2);
  expect(await textOverlapIssues(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tip(page).getByRole('button', { name: 'ใช้โหมดสว่างต่อ' }).click();
  await expect(tip(page)).toHaveCount(0);
  expect(await isDark(page)).toBe(false);
});

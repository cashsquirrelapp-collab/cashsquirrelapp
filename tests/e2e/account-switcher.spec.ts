import { expect, test, type Page } from '@playwright/test';

// Switch accounts like Google or Facebook (owner, 2026-10-21), from the account menu on computers and
// iPads: a ready account switches at once and the page reloads into it; one whose session ended asks
// for its password with the email filled in; "เพิ่มบัญชีอื่น" signs in another account while this one
// stays; an account can be taken off this browser. On phones (owner, 2026-10-23) the profile box on the
// เมนู screen opens the same accounts as a sheet, with the profile and sign-out rows under them.

test.use({ serviceWorkers: 'block' });

const A = { id: '11111111-1111-4111-8111-111111111111', email: 'first@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const B = { id: '22222222-2222-4222-8222-222222222222', email: 'second@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const C = { id: '33333333-3333-4333-8333-333333333333', email: 'third@example.com' };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function open(page: Page, width = 1280, height = 800) {
  const state = { active: A as typeof A, posts: [] as Record<string, unknown>[] };
  await page.addInitScript(() => {
    localStorage.setItem('cashflow_language', 'th'); localStorage.setItem('cashflow_dark_mode', 'false');
    localStorage.setItem('cashflow_theme_auto_period', String(Math.floor((Date.now() + 7 * 3600e3 - 6 * 3600e3) / (12 * 3600e3))));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth*', route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); state.posts.push(body);
      if (body.action === 'switch-account') { state.active = body.accountId === B.id ? B : A; return route.fulfill({ json: { ok: true } }); }
      if (body.action === 'forget-account') return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: { session: null } });
    }
    if (url.searchParams.get('accounts') === '1') {
      const other = state.active.id === A.id ? B : A;
      return route.fulfill({ json: { accounts: [
        { id: state.active.id, email: state.active.email, current: true, ready: true },
        { id: other.id, email: other.email, name: 'บัญชีที่สอง', current: false, ready: true },
        { id: C.id, email: C.email, current: false, ready: false },
      ] } });
    }
    if (url.searchParams.get('providers') === '1') return route.fulfill({ json: { providers: { google: true, facebook: false } } });
    return route.fulfill({ json: { session: { user: state.active } } });
  });
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: state.active.id, publicId: 'SQ-1111111111', displayName: state.active.email.split('@')[0] } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { snapshot, versions, subscription: null } }));
  await page.setViewportSize({ width, height });
  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: /^งาน/ }).first()).toBeVisible();
  return state;
}

async function openSwitcher(page: Page) {
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).first().click();
  await page.getByRole('button', { name: 'สลับบัญชี', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'สลับบัญชี' });
  await expect(dialog.getByRole('list', { name: 'บัญชีในเบราว์เซอร์นี้' }).getByRole('listitem')).toHaveCount(3);
  return dialog;
}

test('computer: the account menu switches to another signed-in account and reloads into it', async ({ page }) => {
  const state = await open(page);
  const dialog = await openSwitcher(page);
  await expect(dialog.getByRole('button', { name: `${A.email} บัญชีที่ใช้อยู่` })).toBeDisabled();
  await dialog.getByRole('button', { name: 'สลับไปใช้ บัญชีที่สอง' }).click();
  await expect.poll(() => state.posts.at(-1)).toEqual({ action: 'switch-account', accountId: B.id });
  await page.waitForURL('**/');
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).first().click();
  await expect(page.getByText('second', { exact: true }).first()).toBeVisible(); // now signed in as the second account
});

test('computer: an account whose session ended asks for its password, email filled in, and cancelling returns', async ({ page }) => {
  await open(page);
  const dialog = await openSwitcher(page);
  await dialog.getByRole('button', { name: `สลับไปใช้ ${C.email}` }).click();
  await expect(page.locator('input[type=email]').first()).toHaveValue(C.email);
  await page.getByRole('button', { name: 'กลับไปบัญชีที่ใช้อยู่' }).click();
  await expect(page.getByRole('heading', { name: /^งาน/ }).first()).toBeVisible(); // still signed in as the first account
});

test('computer: เพิ่มบัญชีอื่น opens sign-in while staying signed in, and an account can be taken off this browser', async ({ page }) => {
  const state = await open(page);
  let dialog = await openSwitcher(page);
  await dialog.getByRole('button', { name: 'เพิ่มบัญชีอื่น' }).click();
  await expect(page.getByTestId('auth-method-chooser')).toBeVisible();
  await page.getByRole('button', { name: 'กลับไปบัญชีที่ใช้อยู่' }).click();
  await expect(page.getByRole('heading', { name: /^งาน/ }).first()).toBeVisible();

  dialog = await openSwitcher(page);
  await dialog.getByRole('button', { name: `นำ ${B.email} ออกจากเบราว์เซอร์นี้` }).click();
  await expect.poll(() => state.posts.at(-1)).toEqual({ action: 'forget-account', accountId: B.id });
  await expect(dialog.getByRole('listitem')).toHaveCount(2);
});

test('iPad 1024: the switcher is in the account menu there too', async ({ page }) => {
  await open(page, 1024, 768);
  await openSwitcher(page);
});

test('phone: the profile box on เมนู opens the account sheet with switch, profile and sign out', async ({ page }) => {
  await open(page, 390, 844);
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('button', { name: 'เมนู' }).click();
  await page.getByRole('button', { name: /สลับบัญชีและออกจากระบบ/ }).click();
  const sheet = page.getByRole('dialog', { name: 'บัญชีของฉัน' });
  await expect(sheet.getByRole('list', { name: 'บัญชีในเบราว์เซอร์นี้' }).getByRole('listitem')).toHaveCount(3);
  await expect(sheet.getByRole('button', { name: 'เพิ่มบัญชีอื่น' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'โปรไฟล์' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('phone-account-sheet.png') });
  await sheet.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?')).toBeVisible();
});

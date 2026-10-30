import { expect, test, type Page } from '@playwright/test';
import { textOverlapIssues } from './textOverlap';

// The sign-in page in the landing's look (owner, 2026-10-30): white, the landing's floating things around a frosted
// card, the waving squirrel standing on the card, the sign-in buttons in their own brands' colours, and no moon or
// language switch (the language is chosen on the landing). Nothing may cover the card, the squirrel or the top bar,
// on any of the page's forms, and the app's own dark or light setting comes back after signing in.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };

async function openLogin(page: Page, { width = 1440, height = 900, lang = 'th', dark = 'false' } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(([l, d]) => { try { localStorage.setItem('cashflow_language', l); localStorage.setItem('cashflow_dark_mode', d); } catch { /* private window */ } }, [lang, dark]);
  await page.route('**/api/auth*', route => new URL(route.request().url()).searchParams.get('providers') === '1'
    ? route.fulfill({ json: { providers: { google: true, facebook: true } } })
    : route.fulfill({ json: { session: null } }));
  await page.setViewportSize({ width, height });
  await page.goto('/login');
  await expect(page.getByTestId('auth-method-chooser')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** What covers what: floating pictures over the card, the squirrel or phone icons over the top bar or each other. */
function collisions(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && getComputedStyle(el).display !== 'none' ? { l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY } : null; };
    type Box = NonNullable<ReturnType<typeof box>>;
    const hit = (a: Box | null, c: Box | null) => !!a && !!c && a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
    const card = box(document.querySelector('.auth-form-card'));
    const perch = box(document.querySelector('.auth-perch'));
    const bar = box(document.querySelector('.auth-topbar'));
    const floats = [...document.querySelectorAll('.auth-float')].map(box).filter(Boolean) as Box[];
    const edgeIcons = [...document.querySelectorAll('.auth-card-icons > span')].map(box).filter(Boolean) as Box[];
    const bad: string[] = [];
    floats.forEach((f, n) => { if (hit(f, card)) bad.push(`float ${n} on the card`); if (hit(f, perch)) bad.push(`float ${n} on the squirrel`); if (bar && f.t < bar.b) bad.push(`float ${n} under the top bar`); });
    edgeIcons.forEach((icon, n) => { if (hit(icon, perch)) bad.push(`edge icon ${n} on the squirrel`); if (bar && icon.t < bar.b) bad.push(`edge icon ${n} under the top bar`); });
    if (bar && perch && perch.t < bar.b) bad.push('the squirrel under the top bar');
    if (document.documentElement.scrollWidth > innerWidth) bad.push('sideways scroll');
    return bad;
  });
}

test('light, with no moon or language switch, and the sign-in buttons in Google’s and Facebook’s own colours', async ({ page }) => {
  await openLogin(page, { dark: 'true' }); // even when the app is set to dark
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await expect(page.locator('.auth-page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByRole('button', { name: /โหมดมืด|โหมดสว่าง|dark mode|light mode|English|ภาษา|language/i })).toHaveCount(0);
  await expect(page.locator('.auth-topbar-btn')).toHaveCount(1); // only the way back to the welcome page
  const google = page.getByRole('button', { name: 'ดำเนินการต่อด้วย Google' });
  await expect(google).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  for (const colour of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) await expect(google.locator(`path[fill="${colour}"]`)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'ดำเนินการต่อด้วย Facebook' })).toHaveCSS('background-color', 'rgb(24, 119, 242)');
  await expect(page.getByRole('button', { name: 'ดำเนินการต่อด้วยอีเมล' })).toHaveCSS('background-color', 'rgb(255, 241, 232)');
  // the waving squirrel stands on the card; the floating things are pictures only
  await expect(page.locator('.auth-form-card').locator('..').locator('.auth-perch')).toHaveCount(1);
  await expect(page.locator('.auth-stage')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.auth-float:visible')).toHaveCount(6);
});

for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [430, 932], [390, 844], [375, 667], [320, 568]] as const) {
  test(`at ${width}×${height} nothing covers the card, the squirrel or the top bar, on every form`, async ({ page }) => {
    await openLogin(page, { width, height });
    if (width < 744) {
      await expect(page.locator('.auth-float:visible')).toHaveCount(0); // phones: LINE and Gmail ride on the card's edge instead
      await expect(page.locator('.auth-card-icons > span')).toHaveCount(2);
    }
    expect(await collisions(page)).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.getByRole('button', { name: 'ดำเนินการต่อด้วยอีเมล' }).click();
    await expect(page.locator('input[type=email]').first()).toBeVisible();
    expect(await collisions(page)).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
    await page.getByRole('button', { name: 'สมัครสมาชิก' }).first().click(); // the tallest form
    await expect(page.locator('input[type=password]')).toHaveCount(2);
    expect(await collisions(page)).toEqual([]);
    expect(await textOverlapIssues(page)).toEqual([]);
  });
}

test('in English the page reads the same, with nothing covered', async ({ page }) => {
  await openLogin(page, { width: 390, height: 844, lang: 'en' });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  expect(await collisions(page)).toEqual([]);
  expect(await textOverlapIssues(page)).toEqual([]);
});

test('after signing in, the app comes back in its own dark or light setting', async ({ page }) => {
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Test user' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' },
    statuses: [{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }],
    job_types: ['Sponsored Post'], notif_settings: { enabled: true, alertEmail: user.email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], lineUserId: null }, avatar_data_url: null, issuer_profile: null };
  const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1, statuses: 1, job_types: 1, notif_settings: 1 } };
  await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { snapshot, versions, subscription: { status: 'active', plan: 'pro_monthly', current_period_end: '2027-01-01T00:00:00Z' } } }));
  // 20:00 Bangkok: the evening, when the app's own setting is dark
  await page.clock.install({ time: new Date('2026-10-30T20:00:00+07:00') });
  await page.clock.resume();
  await openLogin(page, { dark: 'true' });
  let signedIn = false;
  await page.unroute('**/api/auth*');
  await page.route('**/api/auth*', route => { if (route.request().method() === 'POST') signedIn = true; return route.fulfill({ json: { session: signedIn ? { user } : null, user: signedIn ? user : null } }); });
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await page.getByRole('button', { name: 'ดำเนินการต่อด้วยอีเมล' }).click();
  await page.locator('input[type=email]').first().fill(user.email);
  await page.locator('input[type=password]').first().fill('test-password-123');
  await page.locator('form button[type=submit]').first().click();
  await expect(page.locator('#dashboard-top')).toBeVisible();
  // the page's light look ends with it: the app is dark again, as it was set
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  expect(await page.evaluate(() => localStorage.getItem('cashflow_dark_mode'))).toBe('true');
});

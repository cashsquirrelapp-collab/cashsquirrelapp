import { expect, test } from '@playwright/test';

// A slow moment at Supabase makes the session check answer 503. A signed-in person who refreshes then
// must reach their app after the browser asks again, not the login page (owner, 2026-10-21).

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'session-retry@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

for (const failures of [1, 2]) {
  test(`${failures} temporary 503 on the session check: the browser asks again and opens the app`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cashflow_language', 'th'));
    await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    let checks = 0;
    await page.route('**/api/auth', route => (++checks <= failures
      ? route.fulfill({ status: 503, json: { error: 'ระบบตอบช้าชั่วคราว กรุณาลองใหม่อีกครั้ง' } })
      : route.fulfill({ json: { session: { user } } })));
    await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
    await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
    await page.route('**/api/data*', route => route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : { snapshot, versions, subscription: null } }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/jobs');
    await expect(page.getByRole('heading', { name: /^งาน/ }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /เข้าสู่ระบบ/ })).toHaveCount(0);
    expect(checks).toBe(failures + 1);
  });
}

test('the session check gives up after three answers of 503 and shows sign-in', async ({ page }) => {
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  let checks = 0;
  await page.route('**/api/auth', route => { checks++; return route.fulfill({ status: 503, json: { error: 'unavailable' } }); });
  await page.goto('/app');
  await expect.poll(() => checks, { timeout: 10_000 }).toBe(3);
  await page.waitForTimeout(800);
  expect(checks).toBe(3); // no endless loop
});

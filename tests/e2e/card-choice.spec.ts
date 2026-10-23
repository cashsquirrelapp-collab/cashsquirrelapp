import { expect, test, type Page } from '@playwright/test';

// Owner, 2026-10-21: ticking the renewal consent after typing the card reloaded the card fields and
// the card had to be typed again. Card payment is the renewal (one-time purchases are PromptPay QR),
// so the checkbox is only the consent that unlocks payment: ticking it keeps whatever was typed.

test.use({ serviceWorkers: 'block' });

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'card-choice@example.com', role: 'user', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const free = { status: 'free', plan: null, current_period_end: null, cancel_at_period_end: false, stripe_status: null, has_subscription: false, intro_eligible: false, managed: false };
const snapshot = { jobs: [], expenses: [], goals: [], invoices: [], settings: { monthlyExpense: 0, monthlyRevenueGoal: 20000, savingsPercentage: 40, profileSetupCompleted: true, userPersona: 'freelance' }, statuses: [], job_types: [], notif_settings: { enabled: false, pendingQueue: [] }, avatar_data_url: null, issuer_profile: null };
const versions = { cashflow_jobs: {}, cashflow_expenses: {}, cashflow_goals: {}, cashflow_invoices: {}, cashflow_documents: { settings: 1 } };

async function openCard(page: Page) {
  const posts: Record<string, unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('cashflow_language', 'th'));
  await page.route('**/*', route => (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'ผู้ใช้ตัวอย่าง' } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: free } }));
  // A stand-in for Stripe's card fields: "typing" is a change event saying the fields are no longer empty.
  await page.route('https://js.stripe.com/**', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.__mounts = 0;
    window.Stripe = function () { return { initCheckoutElementsSdk: function () { var el, change; return {
      loadActions: async function () { return { type: 'success', actions: { confirm: async function () { return { type: 'success' }; } } }; },
      createPaymentElement: function () { return {
        on: function (event, cb) { if (event === 'ready') setTimeout(cb, 10); if (event === 'change') change = cb; },
        mount: function (root) { el = root; window.__mounts++; root.innerHTML = '<input aria-label="หมายเลขบัตรทดสอบ">';
          root.querySelector('input').addEventListener('input', function (e) { change && change({ empty: !e.target.value }); }); },
        destroy: function () { if (el) el.innerHTML = ''; } }; },
    }; } }; };` }));
  let attempt = 0;
  await page.route('**/api/billing', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { checkout_ready: true, subscription: free } });
    const body = route.request().postDataJSON(); posts.push(body); attempt++;
    return route.fulfill({ json: { destination: 'embedded', customCard: true, autoRenew: body.autoRenew, saveCard: body.saveCard, period: body.period,
      amount: 15900, months: 1, method: 'card', orderId: `order-${attempt}`, clientSecret: `cs_choice_${attempt}`, publishableKey: 'pk_test_choice', expiresAt: new Date(Date.now() + 45 * 60_000).toISOString() } });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/plans');
  await page.getByTestId('pro-card').getByRole('button', { name: 'สมัคร Pro รายเดือน ฿159', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'ชำระด้วยบัตร' });
  await expect(dialog.getByLabel('หมายเลขบัตรทดสอบ')).toBeVisible();
  return { dialog, posts };
}

test('the renewal choice stays under the card fields (the layout the owner prefers)', async ({ page }) => {
  const { dialog } = await openCard(page);
  const consent = (await dialog.getByRole('checkbox', { name: /ยินยอมต่ออายุ/ }).boundingBox())!;
  const card = (await dialog.getByTestId('custom-card-fields').boundingBox())!;
  expect(consent.y).toBeGreaterThan(card.y);
});

test('the card payment opens as the renewal, and payment waits for the consent', async ({ page }) => {
  const { dialog, posts } = await openCard(page);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ autoRenew: true, saveCard: true });
  await expect(dialog.getByRole('checkbox', { name: /ยินยอมต่ออายุ/ })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: /^ยืนยันชำระ/ })).toBeDisabled();
  await expect(dialog.getByText('ติ๊กยินยอมการต่ออายุก่อน จึงจะกดชำระได้')).toBeVisible();
});

test('ticking the consent after typing the card keeps the card and prepares nothing new', async ({ page }) => {
  const { dialog, posts } = await openCard(page);
  await dialog.getByLabel('หมายเลขบัตรทดสอบ').fill('4242 4242');
  const consent = dialog.getByRole('checkbox', { name: /ยินยอมต่ออายุ/ });
  await consent.check();
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(1);
  await expect(dialog.getByLabel('หมายเลขบัตรทดสอบ')).toHaveValue('4242 4242');
  expect(await page.evaluate(() => (window as any).__mounts)).toBe(1);
  await expect(dialog.getByRole('button', { name: /^ยืนยันชำระ/ })).toBeEnabled();
  await consent.uncheck();
  await expect(dialog.getByRole('button', { name: /^ยืนยันชำระ/ })).toBeDisabled();
  await expect(dialog.getByLabel('หมายเลขบัตรทดสอบ')).toHaveValue('4242 4242');
});

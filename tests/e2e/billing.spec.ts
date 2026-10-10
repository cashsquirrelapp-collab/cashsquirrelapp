import { expect, test, type Page, type Request } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'billing@example.com',
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
  user_metadata: {},
};

const snapshot = {
  jobs: [],
  expenses: [],
  goals: [],
  invoices: [],
  settings: {
    monthlyExpense: 0,
    monthlyRevenueGoal: 20_000,
    savingsPercentage: 40,
    profileSetupCompleted: true,
    userPersona: 'freelance',
  },
  statuses: [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
  ],
  job_types: ['Sponsored Post'],
  notif_settings: {
    enabled: true,
    alertEmail: user.email,
    serviceType: 'mailto',
    emailjsServiceId: '',
    emailjsTemplateId: '',
    emailjsPublicKey: '',
    pendingQueue: [],
    lineUserId: null,
  },
  avatar_data_url: null,
  issuer_profile: null,
};

const versions = {
  cashflow_jobs: {},
  cashflow_expenses: {},
  cashflow_goals: {},
  cashflow_invoices: {},
  cashflow_documents: {
    settings: 1,
    statuses: 1,
    job_types: 1,
    notif_settings: 1,
  },
};

type SubscriptionFixture = {
  status: string;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_status: string | null;
  has_subscription: boolean;
  intro_eligible: boolean;
  managed: boolean;
};

async function openPlans(
  page: Page,
  subscription: SubscriptionFixture,
  stripeUrl: string,
): Promise<Request[]> {
  const billingRequests: Request[] = [];

  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({
    json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Billing test user' },
  }));
  await page.route('**/api/groups?*', route => route.fulfill({
    json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 },
  }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account', route => route.fulfill({ json: { backupEmail: null } }));
  await page.route('**/api/data*', route => route.fulfill({
    json: { snapshot, versions, subscription },
  }));
  await page.route('**/api/billing', async route => {
    billingRequests.push(route.request());
    await route.fulfill({ json: { url: stripeUrl } });
  });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<title>Stripe Checkout test destination</title>',
  }));
  await page.route('https://billing.stripe.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<title>Stripe Billing Portal test destination</title>',
  }));

  await page.goto('/plans');
  await expect(page.getByRole('heading', { name: 'อัปเกรด', exact: true })).toBeVisible();
  const promoClose = page.getByRole('button', { name: 'ปิด', exact: true });
  if (await promoClose.isVisible()) {
    await promoClose.click();
    await expect(promoClose).toHaveCount(0);
  }
  return billingRequests;
}

test('an intro-eligible free account chooses Stripe Checkout', async ({ page }) => {
  const stripeUrl = 'https://checkout.stripe.com/c/pay/cs_test_intro';
  const requests = await openPlans(page, {
    status: 'free',
    plan: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_status: null,
    has_subscription: false,
    intro_eligible: true,
    managed: false,
  }, stripeUrl);

  const plans = page.locator('#main-content');
  await expect(plans.getByText(/฿199\s*\/\s*เดือน/).first()).toBeVisible();
  await plans.getByRole('button', { name: 'ตรวจสิทธิ์และสมัคร Pro', exact: true }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].method()).toBe('POST');
  expect(requests[0].headers()['x-csrf-protection']).toBe('1');
  expect(requests[0].postDataJSON()).toEqual({ action: 'checkout' });
  await expect(page).toHaveURL(stripeUrl);
});

test('a managed nonterminal subscription chooses the Stripe Billing Portal', async ({ page }) => {
  const stripeUrl = 'https://billing.stripe.com/p/session/cs_test_managed';
  const requests = await openPlans(page, {
    status: 'past_due',
    plan: 'pro_monthly',
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_status: 'past_due',
    has_subscription: true,
    intro_eligible: false,
    managed: true,
  }, stripeUrl);

  await page.locator('#main-content').getByRole('button', { name: 'จัดการการสมัครสมาชิก', exact: true }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].method()).toBe('POST');
  expect(requests[0].headers()['x-csrf-protection']).toBe('1');
  expect(requests[0].postDataJSON()).toEqual({ action: 'portal' });
  await expect(page).toHaveURL(stripeUrl);
});

test('checkout success keeps polling and keeps its marker until a delayed webhook becomes active', async ({ page }) => {
  test.setTimeout(20_000);
  const free: SubscriptionFixture = {
    status: 'free', plan: null, current_period_end: null, cancel_at_period_end: false,
    stripe_status: null, has_subscription: false, intro_eligible: true, managed: true,
  };
  const active: SubscriptionFixture = {
    status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z', cancel_at_period_end: false,
    stripe_status: 'active', has_subscription: true, intro_eligible: false, managed: true,
  };
  let billingReads = 0;
  let releaseActive!: () => void;
  const activeGate = new Promise<void>(resolve => { releaseActive = resolve; });

  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user } } }));
  await page.route('**/api/profile', route => route.fulfill({ json: { userId: user.id, publicId: 'SQ-1111111111', displayName: 'Billing test user' } }));
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', route => route.fulfill({ json: { snapshot, versions, subscription: free } }));
  await page.route('**/api/billing', async route => {
    billingReads += 1;
    if (billingReads >= 8) await activeGate;
    await route.fulfill({ json: { subscription: billingReads >= 8 ? active : free } });
  });

  await page.goto('/app?checkout=success&session_id=cs_test_delayed&keep=1');
  await expect.poll(() => billingReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(6);
  expect(new URL(page.url()).searchParams.get('checkout')).toBe('success');
  expect(await page.evaluate(() => sessionStorage.getItem('cashflow_checkout_pending_owner'))).toBe(user.id);

  releaseActive();
  await expect.poll(() => billingReads, { timeout: 10_000 }).toBeGreaterThanOrEqual(8);
  await expect(page.getByRole('heading', { name: 'สมัครสมาชิกสำเร็จ!' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('checkout')).toBeNull();
  expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
  expect(new URL(page.url()).searchParams.get('session_id')).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('cashflow_checkout_pending_owner'))).toBeNull();
});

test('a direct account switch clears plan state and rejects the old checkout poll response', async ({ page }) => {
  const accountA = { ...user, email: 'account-a@example.com' };
  const accountB = { ...user, id: '22222222-2222-4222-8222-222222222222', email: 'account-b@example.com' };
  const active: SubscriptionFixture = {
    status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z', cancel_at_period_end: false,
    stripe_status: 'active', has_subscription: true, intro_eligible: false, managed: true,
  };
  const free: SubscriptionFixture = {
    status: 'free', plan: null, current_period_end: null, cancel_at_period_end: false,
    stripe_status: null, has_subscription: false, intro_eligible: true, managed: false,
  };
  let currentUser = accountA;
  let releaseOldBilling!: () => void;
  let releaseAccountB!: () => void;
  const oldBillingGate = new Promise<void>(resolve => { releaseOldBilling = resolve; });
  const accountBGate = new Promise<void>(resolve => { releaseAccountB = resolve; });
  const billingAccounts: string[] = [];

  await page.route('**/api/auth', route => route.fulfill({ json: { session: { user: currentUser } } }));
  await page.route('**/api/profile', route => {
    const accountId = route.request().headers()['x-account-id'];
    return route.fulfill({ json: { userId: accountId, publicId: accountId === accountB.id ? 'SQ-B' : 'SQ-A', displayName: accountId === accountB.id ? 'Account B' : 'Account A' } });
  });
  await page.route('**/api/groups?*', route => route.fulfill({ json: { systemRole: 'user', groups: [], invitations: [], total: 0, page: 0 } }));
  await page.route('**/api/vault', route => route.fulfill({ json: { files: [] } }));
  await page.route('**/api/usage-analytics', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/data*', async route => {
    const accountId = route.request().headers()['x-account-id'];
    if (accountId === accountB.id) await accountBGate;
    await route.fulfill({ json: { snapshot, versions, subscription: accountId === accountB.id ? free : active } });
  });
  await page.route('**/api/billing', async route => {
    billingAccounts.push(route.request().headers()['x-account-id']);
    await oldBillingGate;
    try { await route.fulfill({ json: { subscription: active } }); } catch { /* The fixed client aborts this A request. */ }
  });

  await page.goto('/plans?checkout=success&session_id=cs_test_account_a');
  await expect(page.getByText('Account A', { exact: true }).first()).toBeVisible();
  await expect.poll(() => billingAccounts.length).toBe(1);

  currentUser = accountB;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Account B', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();

  releaseOldBilling();
  await page.waitForTimeout(250);
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();
  expect(billingAccounts).toEqual([accountA.id]);

  releaseAccountB();
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();
});

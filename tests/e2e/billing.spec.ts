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
  billingResponse: Record<string, unknown> = {},
  packageEnabled = false,
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
    json: { snapshot, versions, subscription, package_features: {free_documents: packageEnabled} },
  }));
  await page.route('**/api/billing', async route => {
    billingRequests.push(route.request());
    await route.fulfill({ json: { url: stripeUrl, ...billingResponse } });
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
  // These fresh non-Pro fixtures receive the lazy-loaded daily promo after data
  // hydration. Wait for it instead of racing its arrival with an isVisible check.
  const promoClose = page.getByRole('button', { name: 'ปิด', exact: true });
  await expect(promoClose).toBeVisible();
  await promoClose.click();
  await expect(promoClose).toHaveCount(0);
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
  await expect(plans.getByText('โปรเปิดตัว · ลด ฿50/รอบ', { exact: true })).toBeVisible();
  await expect(plans.getByText(/฿199\s*\/\s*เดือน/).first()).toBeVisible();
  await expect(plans.getByText('จากนั้น ฿249 / เดือน ตั้งแต่รอบบิลที่ 4', { exact: true })).toBeVisible();
  await plans.getByRole('button', { name: 'สมัคร Pro ฿199/เดือน 3 รอบแรก', exact: true }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].method()).toBe('POST');
  expect(requests[0].headers()['x-csrf-protection']).toBe('1');
  expect(requests[0].postDataJSON()).toEqual({ action: 'checkout' });
  await expect(page).toHaveURL(stripeUrl);
});

test('intro offer badge and both billing prices stay readable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openPlans(page, {
    status: 'free',
    plan: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_status: null,
    has_subscription: false,
    intro_eligible: true,
    managed: false,
  }, 'https://checkout.stripe.com/c/pay/cs_test_mobile');

  const plans = page.locator('#main-content');
  await expect(plans.getByRole('heading', { name: 'Free', exact: true })).toBeVisible();
  await expect(plans.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(plans.getByText('โปรเปิดตัว · ลด ฿50/รอบ', { exact: true })).toBeVisible();
  await expect(plans.getByText('฿199 / เดือน เฉพาะ 3 รอบบิลรายเดือนแรก', { exact: true })).toBeVisible();
  await expect(plans.getByText('จากนั้น ฿249 / เดือน ตั้งแต่รอบบิลที่ 4', { exact: true })).toBeVisible();
  await expect(plans.getByRole('heading', { name: 'บัตรเครดิต / เดบิต', exact: true })).toBeVisible();
  await expect(plans.getByRole('heading', { name: 'พร้อมเพย์ QR', exact: true })).toBeVisible();
  await expect(plans.getByText(/ยังไม่รวมในสิทธิ์ปัจจุบัน/)).toBeVisible();
  await expect(plans.getByText(/เป้าหมายคลัง 300 ไฟล์ต่อบัญชี/)).toBeVisible();
  await expect(plans.getByText(/เป้าหมายคลัง 500 ไฟล์/)).toHaveCount(0);
  await expect(plans.getByRole('button', { name: 'สมัคร Pro ฿199/เดือน 3 รอบแรก', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('PromptPay opens a server-expiring QR flow with countdown and manual-renewal guidance', async ({ page }) => {
  const stripeUrl = 'https://checkout.stripe.com/c/pay/cs_test_promptpay';
  const requests = await openPlans(page, {
    status: 'free',
    plan: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_status: null,
    has_subscription: false,
    intro_eligible: true,
    managed: false,
  }, stripeUrl, {
    destination: 'promptpay',
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    amount: 19_900,
  });

  const plans = page.locator('#main-content');
  await plans.getByRole('button', { name: 'จ่ายด้วย QR ฿199 / สิทธิ์ 1 เดือน', exact: true }).click();
  // Status GETs may already have polled by the time the click resolves on a busy host.
  const checkoutRequests = () => requests.filter(request => request.method() === 'POST');
  await expect.poll(() => checkoutRequests().length).toBe(1);
  expect(checkoutRequests()[0].postDataJSON()).toEqual({ action: 'promptpay_checkout' });
  const dialog = page.getByRole('dialog', { name: 'ชำระด้วย QR พร้อมเพย์' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('QR พร้อมเพย์ ฿199', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/ไม่ตัดเงินอัตโนมัติ/)).toBeVisible();
  await expect(dialog.getByText(/บันทึกภาพ QR/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: /เปิด QR ใน Stripe/ })).toHaveAttribute('href', stripeUrl);
  await expect(page).toHaveURL(/\/plans/);
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

test('aligned plans retain the official mascot and return from tap to idle, respecting reduced motion',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},'https://checkout.stripe.com/c/pay/mock');
  // Side by side, the three period cards share rows: prices and buttons line up.
  const cards=page.locator('.period-card');
  await expect(cards).toHaveCount(3);
  const rows=await cards.evaluateAll(nodes=>nodes.map(node=>({price:node.querySelector('.text-5xl')!.getBoundingClientRect().top,button:node.lastElementChild!.getBoundingClientRect().top})));
  for(const row of rows.slice(1)){expect(Math.abs(row.price-rows[0].price)).toBeLessThan(1);expect(Math.abs(row.button-rows[0].button)).toBeLessThan(1);}
  const mascot=page.getByRole('button',{name:'ทักทายน้องกระรอก Pro'});
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','idle');
  await mascot.click();
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','tap');
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','idle',{timeout:3000});
  const palette=await mascot.locator('svg').evaluate(svg=>Array.from(svg.querySelectorAll('[fill]')).map(node=>node.getAttribute('fill')));
  expect(palette).toContain('#C27A3F');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.reload();
  await expect(page.getByRole('button',{name:'ทักทายน้องกระรอก Pro'}).locator('[data-motion]')).toHaveAttribute('data-motion','reduced');
});

test('plans page: three Pro cards; monthly ฿249 struck to ฿199 with "ลดไป 20%", 6-month and yearly (recommended) priced but not for sale yet',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},'https://checkout.stripe.com/c/pay/mock');
  const month=page.locator('[data-period="month"]');
  await expect(month.getByText('ลดไป 20%',{exact:true})).toBeVisible();
  await expect(month.locator('s')).toHaveText(/฿249/);
  await expect(month.getByText('฿199',{exact:true})).toBeVisible();
  await expect(month.getByText('฿199 / เดือน เฉพาะ 3 รอบบิลรายเดือนแรก',{exact:true})).toBeVisible();
  await expect(month.getByRole('button',{name:'สมัคร Pro ฿199/เดือน 3 รอบแรก',exact:true})).toBeEnabled();
  const halfYear=page.locator('[data-period="halfYear"]');
  await expect(halfYear.getByRole('heading',{name:'ราย 6 เดือน'})).toBeVisible();
  await expect(halfYear).toContainText('฿990');
  await expect(halfYear).toContainText('ต่อ 6 เดือน');
  await expect(halfYear).toContainText('เฉลี่ย ฿165/เดือน');
  await expect(halfYear).toContainText('คุ้มกว่า');
  const year=page.locator('[data-period="year"]');
  await expect(year).toHaveAttribute('data-recommended','true');
  await expect(year).toContainText('แนะนำ');
  await expect(year.getByRole('heading',{name:'รายปี'})).toBeVisible();
  await expect(year).toContainText('฿1,790');
  await expect(year).toContainText('ต่อปี');
  await expect(year).toContainText('เฉลี่ย ฿149/เดือน');
  await expect(year).toContainText('ประหยัดที่สุด');
  // nothing to buy for the long plans yet: one disabled "เร็ว ๆ นี้" each
  for(const card of [halfYear,year]){
    await expect(card.getByRole('button',{name:'เร็ว ๆ นี้'})).toBeDisabled();
    await expect(card.getByRole('button',{name:/สมัคร|จ่าย|QR/})).toHaveCount(0);
  }
});

test('plans page: an account past its 3 promo cycles sees ฿249 without the strike or the 20% badge',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false},'https://checkout.stripe.com/c/pay/mock');
  const month=page.locator('[data-period="month"]');
  await expect(month.getByText('฿249',{exact:true})).toBeVisible();
  await expect(month.locator('s')).toHaveCount(0);
  await expect(month.getByText('ลดไป 20%',{exact:true})).toHaveCount(0);
  await expect(page.getByTestId('pro-periods').locator('[data-period]')).toHaveCount(3);
});

test('plans page: Free documents quota is live, LINE and media quotas stay marked as not ready',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},'https://checkout.stripe.com/c/pay/mock',{},true);
  // Since 2026-10-15 the API counts and enforces 10 new documents a month for Free accounts.
  await expect(page.getByText('ออกเอกสารใหม่ 10 ฉบับ/เดือน แก้ไขและดาวน์โหลดซ้ำไม่นับเพิ่ม',{exact:true})).toBeVisible();
  await expect(page.getByText('เร็ว ๆ นี้: ออกเอกสารใหม่ 10 ฉบับ/เดือน',{exact:true})).toHaveCount(0);
  await expect(page.getByText(/ลบเอกสารแล้วไม่คืนโควตา/)).toBeVisible();
  await expect(page.getByText(/โควตา LINE ของ Pro .* ยังไม่เปิดใช้/)).toBeVisible();
  await expect(page.getByText(/ยังไม่พร้อมใช้: อ่านบิล 100 หน้า/)).toBeVisible();
  await expect(page.getByText(/เป้าหมายคลัง 300 ไฟล์ต่อบัญชี/)).toBeVisible();
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

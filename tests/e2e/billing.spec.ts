import { CARD_CONSENT_VERSION } from '../../shared/cardConsent';
import { expect, test, type Page, type Request } from '@playwright/test';
import { PRO_CHECKOUT_OPEN } from '../../shared/proPricing';

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
  custom_card_subscription?: boolean;
};

async function openPlans(
  page: Page,
  subscription: SubscriptionFixture,
  stripeUrl: string,
  billingResponse: Record<string, unknown> = {},
  packageEnabled = false,
  checkoutReady = true,
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
    if (route.request().method() === 'GET') {
      await route.fulfill({json: {checkout_ready: checkoutReady, subscription}});
      return;
    }
    billingRequests.push(route.request());
    const body = route.request().postDataJSON();
    const plan = body.period === 'year' ? {amount:149000,months:12} : body.period === 'halfYear' ? {amount:84900,months:6} : {amount:15900,months:1};
    await route.fulfill({ json: body.action === 'portal' ? {url:stripeUrl,destination:'portal'} : {
      ...billingResponse, ...plan, destination:'embedded',period:body.period,
      method:body.action==='promptpay_checkout'?'promptpay':'card',
      orderId:'order-test',clientSecret:'cs_inline_secret_test',publishableKey:'pk_test_inline',
      expiresAt:new Date(Date.now()+30*60_000).toISOString(),
    } });
  });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<title>Stripe Checkout test destination</title>',
  }));
  await page.route('https://billing.stripe.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<title>Stripe Billing Portal test destination</title>',
  }));

  await page.route('https://js.stripe.com/**', route => route.fulfill({contentType:'application/javascript',body:`
    window.Stripe = function() { return {createEmbeddedCheckoutPage: async function(options) {
      let root;
      return { mount: function(el) { root=el; el.innerHTML='<p>Secure payment form</p><button type="button">Mock payment complete</button>'; el.querySelector('button').onclick=options.onComplete; },
        destroy:function(){if(root)root.innerHTML='';} };
    }};};
  `}));
  await page.goto('/plans');
  // Phones name the page on the terracotta header ("แพ็กเกจ Pro"); wider screens keep the page title.
  await expect(page.getByRole('heading', { name: /^(อัปเกรด|แพ็กเกจ Pro)$/ }).first()).toBeVisible();
  // A fresh non-Pro account may get the daily Pro promo after data loads; close it when it comes.
  const promoClose = page.getByRole('button', { name: 'ปิด', exact: true });
  if (await promoClose.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true, () => false)) {
    await promoClose.click();
    await expect(promoClose).toHaveCount(0);
  }
  return billingRequests;
}

test('abandoned orders never show a cancel banner and a closed form allows another choice',async({page})=>{
  const requests=await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false},'');
  await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
  await expect(page.getByText('Secure payment form')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'ปิด',exact:true}).click();
  await expect(page.getByRole('button',{name:'ยกเลิกรายการที่ยังไม่ชำระ',exact:true})).toHaveCount(0);
  await page.getByRole('radio',{name:'6 เดือน',exact:true}).click();
  await page.getByTestId('pro-card').getByRole('button',{name:/จ่ายด้วย QR/}).click();
  await expect(page.getByRole('dialog',{name:'ชำระด้วย QR พร้อมเพย์'})).toBeVisible();
  await expect(page.getByText('Secure payment form')).toBeVisible();
  expect(requests.map(r=>r.postDataJSON())).toEqual([{action:'checkout',period:'month',autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION},{action:'promptpay_checkout',period:'halfYear'}]);
  await expect(page).toHaveURL(/\/plans/);
});

test('a free account opens an inline card form for the monthly price', async ({ page }) => {
  // The UI submits the selected period; the server fixes price and duration.
  test.fixme(!PRO_CHECKOUT_OPEN.month, 'monthly checkout opens once Stripe and the billing API charge ฿159 (shared/proPricing.ts)');
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
  await plans.getByRole('button', { name: 'สมัคร Pro รายเดือน ฿159', exact: true }).click();

  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].method()).toBe('POST');
  expect(requests[0].headers()['x-csrf-protection']).toBe('1');
  expect(requests[0].postDataJSON()).toMatchObject({ action: 'checkout', period: 'month', autoRenew: true, saveCard: true });
  await expect(page.getByRole('dialog',{name:'ชำระด้วยบัตร'})).toBeVisible();
  await expect(page.getByText('Secure payment form')).toBeVisible();
  await expect(page).toHaveURL(/\/plans/);
});

test('the Pro card and its prices stay readable on mobile', async ({ page }) => {
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
  await expect(plans.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(plans.getByText('เลขาการเงินส่วนตัวของคุณ', { exact: true })).toBeVisible();
  const monthly = page.getByTestId('pro-price').getByText('฿159', { exact: true });
  await expect(monthly).toBeVisible();
  const monthLine = Math.round((await monthly.boundingBox())!.y);
  // phone sizes: the squirrel about 144px, the price 52-64px
  const mascot = (await page.getByRole('button', { name: 'ทักทายน้องกระรอก Pro' }).locator('svg').first().boundingBox())!;
  expect(mascot.width).toBeGreaterThanOrEqual(135);
  expect(mascot.width).toBeLessThanOrEqual(150);
  const size = await monthly.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(52);
  expect(size).toBeLessThanOrEqual(64);
  await page.getByRole('radio', { name: '1 ปี' }).click();
  const yearly = page.getByTestId('pro-price').getByText('฿1,490', { exact: true });
  await expect(yearly).toBeVisible();
  // "คุ้มที่สุด" is in the card's top-right corner, so the price line does not move between periods
  await expect.poll(async () => Math.round((await yearly.boundingBox())!.y)).toBe(monthLine);
  const card = (await page.getByTestId('pro-card').boundingBox())!;
  const badge = (await page.getByTestId('pro-card').getByText('คุ้มที่สุด', { exact: true }).boundingBox())!;
  expect(card.x + card.width - (badge.x + badge.width)).toBeLessThan(40);
  expect(badge.y - card.y).toBeLessThan(40);
  await expect(page.getByTestId('pro-price').getByText('ประหยัด ฿1,498 (50%)')).toBeVisible();
  await expect(plans.getByRole('heading', { name: 'บัตรเครดิต / เดบิต', exact: true })).toBeVisible();
  await expect(plans.getByRole('heading', { name: 'พร้อมเพย์ QR', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('PromptPay opens inside the site with its exact price and one-time payment guidance', async ({ page }) => {
  test.fixme(!PRO_CHECKOUT_OPEN.month, 'PromptPay opens once the billing API charges ฿159 (shared/proPricing.ts)');
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
    amount: 15_900,
  });

  const plans = page.locator('#main-content');
  await plans.getByRole('button', { name: 'จ่ายด้วย QR ฿159', exact: true }).click();
  // Status GETs may already have polled by the time the click resolves on a busy host.
  const checkoutRequests = () => requests.filter(request => request.method() === 'POST');
  await expect.poll(() => checkoutRequests().length).toBe(1);
  expect(checkoutRequests()[0].postDataJSON()).toEqual({ action: 'promptpay_checkout', period: 'month' });
  const dialog = page.getByRole('dialog', { name: 'ชำระด้วย QR พร้อมเพย์' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Pro 1 เดือน · ฿159/)).toBeVisible();
  await expect(dialog.getByText('Secure payment form')).toBeVisible();
  await expect(dialog.getByRole('link',{name:/เปิด QR ใน Stripe/})).toHaveCount(0);
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

test('the official mascot on the Pro card returns from tap to idle and is petted, respecting reduced motion',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},'https://checkout.stripe.com/c/pay/mock');
  await expect(page.getByRole('radio',{name:'รายเดือน'})).toHaveAttribute('aria-checked','true'); // monthly by default
  const mascot=page.getByRole('button',{name:'ทักทายน้องกระรอก Pro'});
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','idle');
  await mascot.click();
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','tap');
  await expect(mascot.locator('[data-motion]')).toHaveAttribute('data-motion','idle',{timeout:3000});
  const palette=await mascot.locator('[data-motion] svg').evaluate(svg=>Array.from(svg.querySelectorAll('[fill]')).map(node=>node.getAttribute('fill')));
  expect(palette).toContain('#C27A3F');
  // rubbing it (the cursor moving across) is petting: it leans in, then settles when left alone
  const box=(await mascot.boundingBox())!;
  for(let i=0;i<=6;i++)await page.mouse.move(box.x+box.width*(0.3+i*0.07),box.y+box.height*0.45);
  await expect(mascot).toHaveAttribute('data-reaction','pet');
  // the hearts stay small next to the squirrel
  const heart=mascot.locator('span[aria-hidden] svg').first();
  await expect(heart).toBeAttached();
  expect(Number(await heart.getAttribute('width'))).toBeLessThanOrEqual(10);
  expect((await heart.boundingBox())!.width).toBeLessThanOrEqual(12);
  // the squirrel's own box is the size it is drawn at, so it stays centred
  const figureBox=(await mascot.locator('[data-motion] > div').first().boundingBox())!;
  const drawn=(await mascot.locator('svg').first().boundingBox())!;
  expect(Math.abs(figureBox.width-drawn.width)).toBeLessThan(2);
  await page.mouse.move(box.x-120,box.y-120);
  await expect(mascot).toHaveAttribute('data-reaction','idle');
  const pettedPalette=await mascot.locator('[data-motion] svg').evaluate(svg=>Array.from(svg.querySelectorAll('[fill]')).map(node=>node.getAttribute('fill')));
  expect(pettedPalette).toContain('#C27A3F'); // the same character and colours
  await page.emulateMedia({reducedMotion:'reduce'}); await page.reload();
  await expect(page.getByRole('button',{name:'ทักทายน้องกระรอก Pro'}).locator('[data-motion]')).toHaveAttribute('data-motion','reduced');
});

test('plans page: Pro only at the owner\'s prices; squirrel and price lead; nothing can be paid at another amount',async({page})=>{
  const requests=await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},'https://checkout.stripe.com/c/pay/mock',{},false,false);
  const card=page.getByTestId('pro-card');
  const price=page.getByTestId('pro-price');
  // the Free card and the Free-versus-Pro lines are gone from this page
  await expect(page.getByTestId('free-card')).toHaveCount(0);
  await expect(page.getByText('฿0',{exact:true})).toHaveCount(0);
  await expect(page.getByText('ทุกอย่างใน Free',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Free',exact:true})).toHaveCount(0);
  // no earlier offer anywhere on the page; ฿249 appears only as the struck regular price
  await expect(page.locator('#main-content').getByText(/฿(199|149)\b/)).toHaveCount(0);
  // a Free account with nothing running has no status line
  await expect(page.getByTestId('plan-status')).toHaveCount(0);
  // on a computer the whole card fits on the first screen (owner, 2026-10-20): the squirrel and the
  // price lead the left side, the benefits sit beside them
  await page.setViewportSize({ width: 1280, height: 720 });
  const cardBox=(await card.boundingBox())!;
  expect(cardBox.y+cardBox.height).toBeLessThanOrEqual(720);
  const hero=(await card.locator('.plan-hero').boundingBox())!;
  const benefitsBox=(await card.getByRole('list',{name:'ทุกรอบชำระได้ Pro ครบเท่ากัน'}).boundingBox())!;
  expect(benefitsBox.x).toBeGreaterThan(hero.x+hero.width-1);
  const mascot=(await card.getByRole('button',{name:'ทักทายน้องกระรอก Pro'}).locator('svg').first().boundingBox())!;
  expect(mascot.width).toBeGreaterThanOrEqual(80);
  expect(mascot.width).toBeLessThanOrEqual(100);
  expect(Math.abs(mascot.x+mascot.width/2-(hero.x+hero.width/2))).toBeLessThan(4);
  const figure=price.getByText('฿159',{exact:true});
  const figureSize=await figure.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(figureSize).toBeGreaterThanOrEqual(52);
  expect(figureSize).toBeLessThanOrEqual(64);
  expect(await figure.evaluate(el=>Number(getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(700);
  const perSize=await price.getByText('/ เดือน',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(perSize).toBeLessThan(figureSize/3);
  const priceRow=(await price.locator('p').first().boundingBox())!;
  expect(Math.abs(priceRow.x+priceRow.width/2-(hero.x+hero.width/2))).toBeLessThan(4);
  const ctaBox=(await page.getByTestId('pro-actions').boundingBox())!;
  expect(ctaBox.y+ctaBox.height).toBeLessThanOrEqual(720);
  const closed=async()=>{
    await expect(card.getByRole('button',{name:'เปิดรับชำระเร็ว ๆ นี้',exact:true})).toBeDisabled();
    await expect(page.getByTestId('pro-actions').getByTestId('checkout-not-open')).toBeVisible();
    await expect(card.getByRole('button',{name:/สมัคร Pro|จ่ายด้วย QR/})).toHaveCount(0);
  };
  // monthly: the regular ฿249 struck, ฿159 as the promotion
  await expect(card).toHaveAttribute('data-period','month');
  await expect(price.locator('s')).toContainText('฿249');
  await expect(price.getByText('ราคาโปรโมชัน',{exact:true})).toBeVisible();
  await expect(price.getByText('ประหยัด ฿90 ทุกเดือน (36%)')).toBeVisible();
  await expect(price.getByText(/คุ้มที่สุด|เฉลี่ย/)).toHaveCount(0);
  await closed();
  // 6 months: the total leads beside the struck regular price, then the average and the saving
  await page.getByRole('radio',{name:'6 เดือน'}).click();
  await expect(card).toHaveAttribute('data-period','halfYear');
  await expect(price.getByText('฿849',{exact:true})).toBeVisible();
  await expect(price.getByText('/ 6 เดือน',{exact:true})).toBeVisible();
  await expect(price.getByText('เฉลี่ย ฿141.50/เดือน',{exact:true})).toBeVisible();
  await expect(price.locator('s',{hasText:'฿1,494'})).toBeVisible();
  await expect(price.getByText('ประหยัด ฿645 (43%)')).toBeVisible();
  await expect(price.getByText('คุ้มที่สุด',{exact:true})).toHaveCount(0);
  const total=await price.getByText('฿849',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const average=await price.getByText('เฉลี่ย ฿141.50/เดือน',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(total).toBeGreaterThan(average*3);
  await closed();
  // 1 year, reached with the arrow key as in any radio group; the one place that says best value
  await page.getByRole('radio',{name:'6 เดือน'}).press('ArrowRight');
  await expect(page.getByRole('radio',{name:'1 ปี'})).toHaveAttribute('aria-checked','true');
  await expect(card).toHaveAttribute('data-period','year');
  await expect(price.getByText('฿1,490',{exact:true})).toBeVisible();
  await expect(price.getByText('/ ปี',{exact:true})).toBeVisible();
  await expect(price.getByText('เฉลี่ย ฿124.17/เดือน',{exact:true})).toBeVisible();
  await expect(price.locator('s',{hasText:'฿2,988'})).toBeVisible();
  await expect(price.getByText('ประหยัด ฿1,498 (50%)')).toBeVisible();
  await expect(page.locator('#main-content').getByText('คุ้มที่สุด',{exact:true})).toHaveCount(1);
  await closed();
  const yearCard=(await card.boundingBox())!;
  expect(yearCard.y+yearCard.height).toBeLessThanOrEqual(720);
  // back to monthly: the other periods' figures fade out and are gone
  await page.getByRole('radio',{name:'รายเดือน'}).click();
  await expect(price.getByText('฿159',{exact:true})).toBeVisible();
  await expect(price.getByText(/เฉลี่ย|คุ้มที่สุด|฿849|฿1,490/)).toHaveCount(0);
  // nothing was sent to checkout
  expect(requests.filter(request=>request.method()==='POST')).toEqual([]);
  // the same four Pro groups whichever period; the AI chat is marked as not live
  const features=card.getByRole('list',{name:'ทุกรอบชำระได้ Pro ครบเท่ากัน'}).getByRole('listitem');
  await expect(features).toHaveCount(4);
  await expect(features.nth(0)).toContainText('LINE AI เลขาการเงินส่วนตัว');
  await expect(features.nth(0)).toContainText('เร็ว ๆ นี้');
  await expect(features.nth(1)).toContainText('แจ้งเตือนอัตโนมัติ');
  await expect(features.nth(2)).toContainText('ออกเอกสารไม่จำกัด');
  await expect(features.nth(2)).not.toContainText('เร็ว ๆ นี้');
  await expect(features.nth(3)).toContainText('สรุปการเงินผ่าน LINE');
});

test('plans page: every account sees the same monthly price, with or without the earlier intro offer',async({page})=>{
  await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false},'https://checkout.stripe.com/c/pay/mock');
  const price=page.getByTestId('pro-price');
  await expect(price.getByText('฿159',{exact:true})).toBeVisible();
  await expect(price.locator('s')).toContainText('฿249');
  await expect(page.getByRole('radio')).toHaveCount(3);
});

test('plans page: an active Pro member sees the status in the card and manages the subscription',async({page})=>{
  const stripeUrl='https://billing.stripe.com/p/session/cs_test_active';
  const requests=await openPlans(page,{status:'active',plan:'pro_monthly',current_period_end:'2099-01-01T00:00:00Z',cancel_at_period_end:false,stripe_status:'active',has_subscription:true,intro_eligible:false,managed:true},stripeUrl);
  const status=page.getByTestId('pro-card').getByTestId('plan-status');
  await expect(status).toContainText('Pro');
  await expect(status).toContainText('ต่ออายุอัตโนมัติ');
  await expect(page.getByTestId('pro-card').getByRole('button',{name:/จ่ายด้วย QR/})).toHaveCount(0);
  await page.getByTestId('pro-card').getByRole('button',{name:'จัดการการสมัครสมาชิก',exact:true}).click();
  await expect.poll(()=>requests.filter(request=>request.method()==='POST').length).toBe(1);
  expect(requests.find(request=>request.method()==='POST')!.postDataJSON()).toEqual({action:'portal'});
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
  await expect.poll(() => billingAccounts.length).toBeGreaterThanOrEqual(1);

  currentUser = accountB;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Account B', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'เปิดเมนูโปรไฟล์' }).click();
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();

  releaseOldBilling();
  await page.waitForTimeout(250);
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();
  expect(billingAccounts.filter(id => id === accountA.id).length).toBeGreaterThanOrEqual(1);

  releaseAccountB();
  await expect(page.getByText('FREE', { exact: true })).toBeVisible();
});

for(const plan of [{period:'halfYear',label:'6 เดือน',months:6,amount:849},{period:'year',label:'1 ปี',months:12,amount:1490}]) {
  for(const method of ['card','promptpay']) {
    test(`prepaid ${plan.period} ${method} sends only the chosen period and shows its duration`,async({page})=>{
      const stripeUrl=`https://checkout.stripe.com/c/pay/cs_test_${plan.period}_${method}`;
      const requests=await openPlans(page,{status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:true,managed:false},stripeUrl,{destination:method==='promptpay'?'promptpay':'checkout',months:plan.months,period:plan.period,amount:plan.amount*100,expiresAt:new Date(Date.now()+30*60_000).toISOString()});
      await page.getByRole('radio',{name:plan.label,exact:true}).click();
      const card=page.getByTestId('pro-card');
      await expect(card.getByText(new RegExp(`ได้ Pro ${plan.months} เดือน`))).toBeVisible();
      await card.getByRole('button',{name:method==='card'?/สมัคร Pro/:/จ่ายด้วย QR/}).click();
      await expect.poll(()=>requests.length).toBe(1);
      expect(requests[0].postDataJSON()).toEqual({action:method==='card'?'checkout':'promptpay_checkout',period:plan.period,...(method==='card'?{autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION}:{})});
      const dialog=page.getByRole('dialog',{name:method==='card'?'ชำระด้วยบัตร':'ชำระด้วย QR พร้อมเพย์'});
      await expect(dialog.getByText(/จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ/)).toBeVisible();
      await expect(dialog.getByText('Secure payment form')).toBeVisible();
      await expect(page).toHaveURL(/\/plans/);
    });
  }
}

test('banned Pro explains admin unlock and offers no purchase button', async ({page}) => {
  const requests=await openPlans(page,{status:'canceled',plan:'admin_revoked',current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false},'https://checkout.stripe.com/blocked',{},false,false);
  await expect(page.getByText('บัญชีนี้ถูกแบน Pro กรุณาติดต่อแอดมินเพื่อปลดแบนก่อนสมัครใหม่')).toBeVisible();
  await expect(page.getByRole('button',{name:/จ่ายด้วย QR|สมัคร Pro/})).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test('embedded completion waits for authoritative payment before showing Pro',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 await page.getByRole('button',{name:'Mock payment complete'}).click();
 await expect(page.getByText('กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ')).toBeVisible();
 await expect(page.getByRole('heading',{name:'สมัครสมาชิกสำเร็จ!'})).toHaveCount(0);
 await page.route('**/api/billing',route=>route.fulfill({json:{checkout_ready:true,subscription:{...free,status:'active',plan:'pro_prepaid',current_period_end:'2099-01-01T00:00:00Z'}}}));
 await expect(page.getByRole('heading',{name:'สมัครสมาชิกสำเร็จ!'})).toBeVisible({timeout:10000});
});

for (const plan of [{period:'month',label:'รายเดือน',months:1,amount:15900},{period:'halfYear',label:'6 เดือน',months:6,amount:84900},{period:'year',label:'1 ปี',months:12,amount:149000}]) {
 test(`direct QR ${plan.period} displays immediately in our modal without a Stripe form or Continue button`,async({page})=>{
  const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
  await openPlans(page,free,'');
  let posted:any;let paymentStatus='pending';let paid=false;
  await page.route('https://qr.stripe.com/test.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/billing?order_id=*',route=>route.fulfill({json:{paymentStatus}}));
  await page.route('**/api/billing',route=>{
    if(route.request().method()==='POST'){posted=route.request().postDataJSON();return route.fulfill({json:{destination:'qr',qrImage:'https://qr.stripe.com/test.png',orderId:'qr-test',period:plan.period,amount:plan.amount,months:plan.months,expiresAt:new Date(Date.now()+45*60_000).toISOString()}});}
    return route.fulfill({json:{checkout_ready:true,subscription:paid?{...free,status:'active',plan:'pro_prepaid',current_period_end:'2099-01-01T00:00:00Z'}:free}});
  });
  await page.getByRole('radio',{name:plan.label,exact:true}).click();
  await page.getByTestId('pro-card').getByRole('button',{name:/จ่ายด้วย QR/}).click();
  const dialog=page.getByRole('dialog',{name:'สแกนเพื่อชำระเงิน'});
  await expect(dialog.getByRole('img',{name:'QR พร้อมเพย์สำหรับชำระแพ็กเกจ Pro'})).toBeVisible();
  await expect(dialog.getByText(`฿${(plan.amount/100).toLocaleString('th-TH')}`,{exact:true})).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveCount(0);await expect(dialog.getByText('Secure payment form')).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:/ดำเนินการต่อ|Continue/})).toHaveCount(0);
  expect(posted).toEqual({action:'promptpay_checkout',period:plan.period});
  await expect(page).toHaveURL(/\/plans/);await expect(page.getByRole('heading',{name:'สมัครสมาชิกสำเร็จ!'})).toHaveCount(0);
  if(plan.period==='month'){
    paymentStatus='paid';await expect(dialog.getByText('รับชำระแล้ว กำลังเปิดสิทธิ์ Pro…')).toBeVisible({timeout:8000});
    await expect(page.getByRole('heading',{name:'สมัครสมาชิกสำเร็จ!'})).toHaveCount(0);
    paid=true;await expect(page.getByRole('heading',{name:'สมัครสมาชิกสำเร็จ!'})).toBeVisible({timeout:12000});
  }else{
    await dialog.getByRole('button',{name:'ปิดหน้าต่าง',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button',{name:'ยกเลิกรายการที่ยังไม่ชำระ',exact:true})).toHaveCount(0);
  }
 });
}

test('custom card uses CI fonts and disclosed button consent without a save checkbox; renewal consent is unticked and gates payment',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 const requests=await openPlans(page,free,'');
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:`
  window.Stripe=function(){return {initCheckoutElementsSdk:function(options){window.__cardAppearance=options.elementsOptions;let el; return {
   loadActions:async()=>({type:'success',actions:{confirm:async(options)=>{window.__cardConfirm=options;return {type:'success'}}}}),
   createPaymentElement:()=>({on:(event,cb)=>{if(event==='ready')setTimeout(cb,10)},mount:root=>{el=root;root.innerHTML='<p>Secure card fields</p>'},destroy:()=>{if(el)el.innerHTML=''}})
  }}}};
 `}));
 let attempt=0;
 await page.route('**/api/billing',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  requests.push(route.request());const body=route.request().postDataJSON();attempt++;
  return route.fulfill({json:{destination:'embedded',customCard:true,autoRenew:body.autoRenew,saveCard:body.saveCard,period:body.period,
   amount:15900,months:1,method:'card',orderId:'test-'+attempt,clientSecret:'cs_card_secret_'+attempt,publishableKey:'pk_test_card',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 await expect(page.getByText('Secure card fields')).toBeVisible();
 const auto=page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/});
 await expect(auto).not.toBeChecked();
 await expect(page.getByRole('checkbox',{name:/จำบัตรไว้ใช้ครั้งหน้า/})).toHaveCount(0);
 await expect(page.getByText(/เมื่อกดยืนยันชำระ คุณยินยอมให้ Stripe บันทึกบัตร/)).toBeVisible();
 const appearance=await page.evaluate(()=> (window as any).__cardAppearance);
 expect(appearance.appearance.variables.fontFamily).toContain('IBM Plex Sans Thai');
 expect(appearance.fonts[0].cssSrc).toContain('IBM+Plex+Sans+Thai');
 expect(await page.evaluate(()=> (window as any).__cardConfirm)).toBeUndefined();
 expect(requests.at(-1)?.postDataJSON()).toMatchObject({autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION});
 const pay=page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true});
 await expect(pay).toBeDisabled(); // nothing is charged before the renewal consent
 await auto.click();await expect(auto).toBeChecked();
 await expect(pay).toBeEnabled();
 await auto.click();await expect(auto).not.toBeChecked();await expect(pay).toBeDisabled();
 await auto.click();
 expect(requests.length).toBe(1); // ticking never prepares another payment, so typed card data stays
 await pay.click();
 await expect(page.getByText('กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ')).toBeVisible();
 expect(await page.evaluate(()=> (window as any).__cardConfirm)).toMatchObject({savePaymentMethod:true});
 await expect(page).toHaveURL(/\/plans/);
});

test('our cancel-renewal control keeps the already-paid end date and confirms cancellation from the server',async({page})=>{
 const subscription={status:'active',plan:'pro_prepaid',current_period_end:'2099-01-01T00:00:00Z',cancel_at_period_end:false,stripe_status:'active',has_subscription:true,intro_eligible:false,managed:true,custom_card_subscription:true};
 await openPlans(page,subscription,'https://billing.stripe.com/p/session/test');
 const writes:any[]=[];
 await page.route('**/api/billing',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription}});
  writes.push(route.request().postDataJSON());subscription.cancel_at_period_end=true;return route.fulfill({json:{canceled:true}});
 });
 await page.getByRole('button',{name:'ปิดการต่ออายุอัตโนมัติ',exact:true}).click();
 await expect(page.getByText('ปิดการต่ออายุแล้ว จะไม่ตัดเงินรอบถัดไป')).toBeVisible();
 expect(writes).toEqual([{action:'stop_auto_renewal'}]);
 expect(subscription.current_period_end).toBe('2099-01-01T00:00:00Z');
});


test('ticking the renewal consent is instant and never prepares another payment',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:`
 window.__mounts=0;
 window.Stripe=function(){return {initCheckoutElementsSdk:function(options){let el;return {
 loadActions:async()=>({type:'success',actions:{confirm:async()=>{window.__confirmedSession=options.clientSecret;return {type:'success'}}}}),
 createPaymentElement:()=>({on:(event,cb)=>{if(event==='ready')setTimeout(cb,10)},mount:root=>{el=root;window.__mounts++;root.innerHTML='<p>Secure card fields</p>'},destroy:()=>{if(el)el.innerHTML=''}})
 }}}};` }));
 const writes:any[]=[];
 await page.route('**/api/billing',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  const body=route.request().postDataJSON();writes.push(body);const attempt=writes.length;
  return route.fulfill({json:{destination:'embedded',customCard:true,autoRenew:body.autoRenew,saveCard:true,period:'month',amount:15900,months:1,method:'card',orderId:'slow-'+attempt,clientSecret:'cs_slow_'+attempt,publishableKey:'pk_test_card',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 await expect(page.getByText('Secure card fields')).toBeVisible();
 const auto=page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/});
 for(let i=0;i<4;i++){await auto.click();}
 await expect(auto).not.toBeChecked();
 await auto.check();await expect(auto).toBeChecked({timeout:250});
 await page.waitForTimeout(500);
 expect(writes.map(w=>w.autoRenew)).toEqual([true]);
 expect(await page.evaluate(()=>(window as any).__mounts)).toBe(1); // the card fields were never rebuilt
 const pay=page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true});
 await expect(pay).toBeEnabled();await pay.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__confirmedSession)).toBe('cs_slow_1');
});

test('failed renewal preparation keeps the choice, blocks payment and reconciles before retry',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:`
 window.Stripe=function(){return {initCheckoutElementsSdk:function(){let el;return {
 loadActions:async()=>({type:'success',actions:{confirm:async()=>({type:'success'})}}),
 createPaymentElement:()=>({on:(event,cb)=>{if(event==='ready')setTimeout(cb,10)},mount:root=>{el=root;root.innerHTML='<p>Secure card fields</p>'},destroy:()=>{if(el)el.innerHTML=''}})
 }}}};` }));
 const writes:any[]=[];
 await page.route('**/api/billing',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  const body=route.request().postDataJSON();writes.push(body);const attempt=writes.length;
  if(attempt===2)return route.fulfill({status:503,json:{error:'Temporary outage'}});
  // The first answer is an older one-time order, which the dialog must turn into the renewal.
  return route.fulfill({json:{destination:'embedded',customCard:true,autoRenew:attempt===1?false:body.autoRenew,saveCard:true,period:'month',amount:15900,months:1,method:'card',orderId:'retry-'+attempt,clientSecret:'cs_retry_'+attempt,publishableKey:'pk_test_card',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 await expect(page.getByText('Secure card fields')).toBeVisible();
 const auto=page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/});
 await expect(page.getByRole('alert')).toContainText('ตัวเลือกของคุณยังอยู่');
 await auto.check();
 await expect(auto).toBeChecked();await expect(auto).toBeEnabled();
 await expect(page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'ลองเตรียมรายการอีกครั้ง',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(3);expect(writes[2].autoRenew).toBe(true);
 await expect(page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true})).toBeEnabled();
 await expect(auto).toBeChecked();
});

test('card SDK loads during server preparation and fields mount before confirmation actions finish',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 let scriptLoaded=false;
 await page.route('https://js.stripe.com/**',route=>{
  scriptLoaded=true;
  return route.fulfill({contentType:'application/javascript',body:`
   window.Stripe=function(){return {initCheckoutElementsSdk:()=>({
    loadActions:()=>new Promise(resolve=>{window.__releaseCardActions=()=>resolve({type:'success',actions:{confirm:async()=>({type:'success'})}})}),
    createPaymentElement:()=>{let ready,el;return {on:(event,cb)=>{if(event==='ready')ready=cb},mount:root=>{el=root;root.innerHTML='<p>Secure card fields</p>';ready()},destroy:()=>{if(el)el.innerHTML=''}}}
   })}};
  `});
 });
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/billing',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  await gate;
  await route.fulfill({json:{destination:'embedded',customCard:true,autoRenew:true,saveCard:true,period:'month',
   amount:15900,months:1,method:'card',orderId:'speed-test',clientSecret:'cs_speed_secret',publishableKey:'pk_test_card',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 try {
  await expect(page.getByRole('dialog',{name:'ชำระด้วยบัตร'})).toBeVisible();
  await expect(page.getByText('กำลังเตรียมช่องกรอกบัตร…',{exact:true})).toBeVisible();
  await expect.poll(()=>scriptLoaded).toBe(true);
 } finally {release();}
 await expect(page.getByText('Secure card fields')).toBeVisible();
 const pay=page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true});
 await expect(pay).toBeDisabled();
 await page.evaluate(()=>(window as any).__releaseCardActions());
 await expect(pay).toBeDisabled(); // ready, but waiting for the renewal consent
 await page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/}).check();
 await expect(pay).toBeEnabled();
});

test('closing the immediate card dialog never reopens it when a delayed server response arrives',async({page})=>{
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:'window.Stripe=function(){return {}};'}));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/billing',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  await gate;
  await route.fulfill({json:{destination:'embedded',customCard:true,autoRenew:true,saveCard:true,period:'month',amount:15900,months:1,method:'card',orderId:'late',clientSecret:'cs_late_secret',publishableKey:'pk_test_card',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'ชำระด้วยบัตร'});
 try {await dialog.getByRole('button',{name:'ปิด',exact:true}).click();} finally {release();}
 await expect(page.getByTestId('pro-card').getByRole('button',{name:'สมัคร Pro รายเดือน ฿159',exact:true})).toBeEnabled();
 await expect(dialog).toHaveCount(0);
});

// Provider boundary simulation: the wallet supplies its own authorization event;
// blank traditional card fields must not be used to confirm this payment.
async function openWalletCheckout(page: Page, period='month') {
 const free={status:'free',plan:null,current_period_end:null,cancel_at_period_end:false,stripe_status:null,has_subscription:false,intro_eligible:false,managed:false};
 await openPlans(page,free,'');
 const writes:any[]=[];
 await page.route('**/api/billing',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{checkout_ready:true,subscription:free}});
  const body=route.request().postDataJSON();writes.push(body);
  const plan=body.period==='year'?{amount:149000,months:12}:body.period==='halfYear'?{amount:84900,months:6}:{amount:15900,months:1};
  return route.fulfill({json:{...plan,destination:'embedded',customCard:true,autoRenew:body.autoRenew,saveCard:true,period:body.period,method:'card',orderId:'wallet-'+writes.length,clientSecret:'cs_wallet_'+writes.length,publishableKey:'pk_test_wallet',expiresAt:new Date(Date.now()+45*60_000).toISOString()}});
 });
 await page.route('https://js.stripe.com/**',route=>route.fulfill({contentType:'application/javascript',body:`
 window.__walletCalls=[];window.__walletFailures=0;window.__walletMode='success';
 window.Stripe=function(){return {initCheckoutElementsSdk:function(options){return {
  loadActions:async()=>({type:'success',actions:{confirm:async(args)=>{
   if(args.expressCheckoutConfirmEvent!==window.__walletEvent)throw Error('Wallet authorization event missing');
   window.__walletCalls.push({secret:options.clientSecret,save:args.savePaymentMethod});
   if(window.__walletMode==='throw')throw Error('Provider error with confidential data: cs_hidden_secret');
   await new Promise(resolve=>setTimeout(resolve,30));return {type:'success'};
  }}}),
  createPaymentElement:()=>{let root,ready;return {on:(e,cb)=>{if(e==='ready')ready=cb},mount:el=>{root=el;el.innerHTML='<p>Blank card form</p>';ready()},destroy:()=>{if(root)root.innerHTML=''}}},
  createExpressCheckoutElement:()=>{let root;const handlers={};return {on:(e,cb)=>{handlers[e]=cb},mount:el=>{
   root=el;el.innerHTML='<button type="button">Google Pay test</button>';
   el.querySelector('button').onclick=()=>{
    const event={expressPaymentType:'google_pay',paymentFailed:()=>{window.__walletFailures++}};
    window.__walletEvent=event;handlers.confirm(event);handlers.confirm(event);
   };
   handlers.ready({availablePaymentMethods:{googlePay:!window.__walletUnavailable}});
  },destroy:()=>{if(root)root.innerHTML=''}}}
 }}}};`}));
 if(period!=='month')await page.getByRole('radio',{name:period==='year'?'1 ปี':'6 เดือน',exact:true}).click();
 await page.getByTestId('pro-card').getByRole('button',{name:/สมัคร Pro/}).click();
 await expect(page.getByText('Blank card form')).toBeVisible();
 return writes;
}
for(const period of ['month','halfYear','year']) {
 test(`wallet waits for the renewal consent, then uses native authorization exactly once for ${period}`,async({page})=>{
  const writes=await openWalletCheckout(page,period);
  const consent=page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/});
  await expect(consent).not.toBeChecked();
  await expect(page.getByTestId('wallet-buttons')).toHaveAttribute('inert','');
  await consent.check();
  await expect(page.getByTestId('wallet-buttons')).not.toHaveAttribute('inert','');
  expect(writes.length).toBe(1);
  await page.getByRole('button',{name:'Google Pay test',exact:true}).click();
  await expect(page.getByText('กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__walletCalls)).toEqual([{secret:'cs_wallet_1',save:true}]);
  expect(writes.at(-1)).toMatchObject({period,autoRenew:true,saveCard:true});
 });
}
test('wallet thrown failure releases the payment control, hides confidential errors and allows retry',async({page})=>{
 await openWalletCheckout(page);
 await page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/}).check();
 await page.evaluate(()=>{(window as any).__walletMode='throw'});
 await page.getByRole('button',{name:'Google Pay test',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('ยืนยันผ่านกระเป๋าเงินไม่สำเร็จ');
 await expect(page.getByRole('alert')).not.toContainText('cs_hidden_secret');
 await expect(page.getByText('กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ')).toHaveCount(0);
 await expect(page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/})).toBeEnabled();
 await page.evaluate(()=>{(window as any).__walletMode='success'});
 await page.getByRole('button',{name:'Google Pay test',exact:true}).click();
 await expect(page.getByText('กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ')).toBeVisible();
});
test('wallet unavailable never presents a blank Google Pay tab and leaves the card path usable',async({page})=>{
 await page.addInitScript(()=>{(window as any).__walletUnavailable=true});
 await openWalletCheckout(page);
 await expect(page.getByTestId('wallet-buttons')).toBeHidden();
 await expect(page.getByText('Google Pay / Apple Pay ยังไม่พร้อมในเบราว์เซอร์นี้ ใช้ช่องกรอกบัตรด้านบนได้')).toBeVisible();
 await page.getByRole('checkbox',{name:/ยินยอมต่ออายุ/}).check();
 await expect(page.getByRole('button',{name:'ยืนยันชำระ ฿159 และบันทึกบัตร',exact:true})).toBeEnabled();
});

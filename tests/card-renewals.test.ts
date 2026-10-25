import test from 'node:test';
import assert from 'node:assert/strict';
import { customCardCheckout, recurringLookup, RECURRING_OFFER, renewalStepOf, validRecurringPrice } from '../backend/src/services/cardPlans.js';
import { assertAutoSubscription, validateAutoInvoice, validateAutoInvoiceCharge } from '../backend/src/services/cardRenewals.js';
import { advanceCardRenewals } from '../backend/src/handlers/advance-card-renewals.js';
import { buildPrepaidCheckout, type PrepaidOrder } from '../backend/src/services/prepaidPlans.js';
import { ACCEPTED_CARD_CONSENT_VERSIONS, CARD_CONSENT_VERSION, CARD_SAVE_DISCLOSURE, CARD_SAVE_DISCLOSURE_VERSION, renewalConsentText } from '../shared/cardConsent.js';
import { PRO_MONTH_REGULAR_FROM, PRO_PERIODS, proPricing } from '../shared/proPricing.js';
const PRO_PRICING = proPricing();
Object.assign(process.env, { STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_only' });
for (const period of PRO_PERIODS) {
 test(`custom card ${period}: saved-only is one-time; recurring requires explicit consent and exact price`, () => {
  const plan = PRO_PRICING[period];
  const order: PrepaidOrder = { id:'order',user_id:'user',period,months:plan.months,amount:plan.total*100,
   price_id:'price_card',method:'card',customer_id:'cus_owner',livemode:false,
   expires_at:new Date(Date.now()+45*60_000).toISOString(),session_id:null,checkout_url:null,request:null,status:'reserved' };
  const base=buildPrepaidCheckout(order,'https://app.test','pmc_card');
  const once=customCardCheckout(order,base,{autoRenew:false,saveCard:true,consentVersion:CARD_CONSENT_VERSION});
  assert.equal(once.mode,'payment'); assert.equal(once.subscription_data,undefined);
  assert.equal(once.metadata?.auto_renew,'false');assert.equal(once.metadata?.save_card,'true');
  assert.equal(once.metadata?.save_disclosure_version,CARD_SAVE_DISCLOSURE_VERSION);
  assert.equal(once.metadata?.save_disclosure_text,CARD_SAVE_DISCLOSURE);
  assert.equal(once.ui_mode,'elements'); assert.equal('payment_method_types' in once,false);
  assert.throws(()=>customCardCheckout(order,base,{autoRenew:true,saveCard:false,consentVersion:CARD_CONSENT_VERSION}));
  assert.throws(()=>customCardCheckout(order,base,{autoRenew:true,saveCard:true,consentVersion:'old'}));
  const auto=customCardCheckout(order,base,{autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION});
  assert.equal(auto.mode,'subscription'); assert.equal(auto.payment_intent_data,undefined);
  assert.equal(auto.subscription_data?.metadata?.consent_version,CARD_CONSENT_VERSION);
  assert.equal(auto.metadata?.consent_text,renewalConsentText(period));
  const price:any={id:'price_card',product:'prod_VTbexQEI6jrH8r',active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',currency:'thb',
   unit_amount:order.amount,lookup_key:recurringLookup(period),recurring:{interval:'month',interval_count:plan.months,usage_type:'licensed'},
   metadata:{offer_version:RECURRING_OFFER,period,months:String(plan.months)}};
  assert.equal(validRecurringPrice(price,period,false),true);
  for(const change of [{unit_amount:1},{currency:'usd'},{livemode:true},{recurring:{...price.recurring,interval_count:plan.months+1}}])
   assert.equal(validRecurringPrice({...price,...change},period,false),false);
  order.request=auto;
  const start=Math.floor(Date.now()/1000);
  const end=start+30*86400*plan.months;
  const sub:any={id:'sub_card',livemode:false,customer:'cus_owner',collection_method:'charge_automatically',discounts:[],
   metadata:auto.subscription_data?.metadata,items:{has_more:false,data:[{quantity:1,price,current_period_end:end}]}};
  assert.doesNotThrow(()=>assertAutoSubscription(sub,order));
  assert.throws(()=>assertAutoSubscription({...sub,metadata:{...sub.metadata,auto_renew:'false'}},order));
  assert.throws(()=>assertAutoSubscription({...sub,customer:'cus_other'},order));
  // A subscription that agreed to the earlier v1 wording keeps renewing; an unknown version does not,
  // and the subscription's version must match its own order.
  const v1={...auto,metadata:{...auto.metadata,consent_version:'krarok-card-20261021-v1'}};
  const v1Sub={...sub,metadata:{...sub.metadata,consent_version:'krarok-card-20261021-v1'}};
  assert.doesNotThrow(()=>assertAutoSubscription(v1Sub,{...order,request:v1}));
  assert.throws(()=>assertAutoSubscription({...sub,metadata:{...sub.metadata,consent_version:'krarok-card-unknown'}},{...order,request:{...auto,metadata:{...auto.metadata,consent_version:'krarok-card-unknown'}}}));
  assert.throws(()=>assertAutoSubscription(v1Sub,order));
  const invoice:any={id:'in_card',livemode:false,customer:'cus_owner',currency:'thb',collection_method:'charge_automatically',
   parent:{subscription_details:{subscription:'sub_card',metadata:sub.metadata}},billing_reason:'subscription_cycle',
   total:order.amount,amount_due:order.amount,discounts:[],lines:{has_more:false,data:[{
    quantity:1,amount:order.amount,currency:'thb',period:{start,end},pricing:{price_details:{price:price.id}},
    parent:{subscription_item_details:{subscription:'sub_card',proration:false}}}]}};
  assert.deepEqual(validateAutoInvoice(invoice,sub,order),{start,end});
  for(const change of [{customer:'other'},{total:1},{billing_reason:'manual'},{amount_due:1},{livemode:true}])
   assert.throws(()=>validateAutoInvoice({...invoice,...change},sub,order));
 });
}

test('the renewal consent names the amount charged, its price and fee, and the step to ฿271 from 1 Dec (v4)', () => {
  // v4 (owner, 2026-10-25): shown ฿249, ฿271 charged with the payment fee from 1 Dec 2569; while the promotion runs a
  // monthly renewal agrees to both amounts. v1–v3 subscriptions keep renewing at what they agreed.
  assert.equal(renewalConsentText('month', new Date('2026-10-24T05:00:00Z')), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿177/เดือน (ราคา ฿159 + ค่าธรรมเนียมชำระเงิน ฿18) ถึงวันที่ 30 พ.ย. 2569 จากนั้น ฿271/เดือน (ราคา ฿249 + ค่าธรรมเนียมชำระเงิน ฿22) จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
  assert.equal(renewalConsentText('month', new Date('2026-11-30T16:59:00Z')), renewalConsentText('month', new Date('2026-10-24T05:00:00Z')));
  assert.equal(renewalConsentText('month', new Date('2026-11-30T17:00:00Z')), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿271/เดือน (ราคา ฿249 + ค่าธรรมเนียมชำระเงิน ฿22) จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
  assert.deepEqual([...ACCEPTED_CARD_CONSENT_VERSIONS], ['krarok-card-20261021-v1', 'krarok-card-20261021-v2', 'krarok-card-20261024-v3', 'krarok-card-20261025-v4']);
  assert.equal(CARD_CONSENT_VERSION, 'krarok-card-20261025-v4');
  assert.equal(renewalConsentText('halfYear'), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿895/6 เดือน (ราคา ฿849 + ค่าธรรมเนียมชำระเงิน ฿46) จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
  assert.equal(renewalConsentText('year'), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿1,562/ปี (ราคา ฿1,490 + ค่าธรรมเนียมชำระเงิน ฿72) จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
});

test('an auto-renewal bought at ฿159 before the payment fee keeps renewing at ฿159; nothing else passes for it', () => {
  // Package 69 (2026-10-25) moved new checkouts to ฿177 and Stripe's lookup key to the new price; existing subscriptions
  // keep the price and amount on their own order, which is what the customer agreed to.
  const now: PrepaidOrder = { id:'order',user_id:'user',period:'month',months:1,amount:PRO_PRICING.month.total*100,
   price_id:'price_new',method:'card',customer_id:'cus_owner',livemode:false,
   expires_at:new Date(Date.now()+45*60_000).toISOString(),session_id:null,checkout_url:null,request:null,status:'reserved' };
  const auto=customCardCheckout(now,buildPrepaidCheckout(now,'https://app.test','pmc_card'),{autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION});
  const earlier: PrepaidOrder = { ...now, amount:15900, price_id:'price_old', request:auto, status:'subscribed' };
  const oldPrice:any={id:'price_old',product:'prod_VTbexQEI6jrH8r',active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',currency:'thb',
   unit_amount:15900,lookup_key:null,recurring:{interval:'month',interval_count:1,usage_type:'licensed'},metadata:{offer:'card'}};
  const sub=(price:any):any=>({id:'sub_card',livemode:false,customer:'cus_owner',collection_method:'charge_automatically',discounts:[],
   metadata:auto.subscription_data?.metadata,items:{has_more:false,data:[{quantity:1,price}]}});
  assert.equal(validRecurringPrice(oldPrice,'month',false),false,'not sold to new customers');
  assert.doesNotThrow(()=>assertAutoSubscription(sub(oldPrice),earlier));
  // Its invoices are checked against the same ฿159.
  const start=Math.floor(Date.now()/1000), end=start+30*86400;
  const invoice:any={id:'in_card',livemode:false,customer:'cus_owner',currency:'thb',collection_method:'charge_automatically',
   parent:{subscription_details:{subscription:'sub_card',metadata:sub(oldPrice).metadata}},billing_reason:'subscription_cycle',
   total:15900,amount_due:15900,discounts:[],lines:{has_more:false,data:[{quantity:1,amount:15900,currency:'thb',period:{start,end},
    pricing:{price_details:{price:'price_old'}},parent:{subscription_item_details:{subscription:'sub_card',proration:false}}}]}};
  assert.deepEqual(validateAutoInvoice(invoice,sub(oldPrice),earlier),{start,end});
  assert.throws(()=>validateAutoInvoice({...invoice,total:17700,amount_due:17700},sub(oldPrice),earlier),'never charged more than agreed');
  // Not passed: a price that differs from the order's, an amount never sold, another price id, another mode or product.
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,unit_amount:17700}),earlier));
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,unit_amount:20000}),{...earlier,amount:20000}));
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,id:'price_other'}),earlier));
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,livemode:true}),earlier));
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,product:'prod_other'}),earlier));
  assert.throws(()=>assertAutoSubscription(sub({...oldPrice,recurring:{...oldPrice.recurring,interval_count:6}}),earlier));
});

// ---------- the step to ฿271 from 1 Dec 2569 (owner, 2026-10-25: "ขึ้นเป็น ฿271 เองตั้งแต่ ธ.ค.") ----------
const NOV = Date.parse('2026-11-10T03:00:00Z');
function promoMonth(at = NOV, id = 'order') {
  const order: PrepaidOrder = { id,user_id:'user',period:'month',months:1,amount:17700,price_id:'price_promo',method:'card',customer_id:'cus_owner',livemode:false,
   expires_at:new Date(at+45*60_000).toISOString(),session_id:null,checkout_url:null,request:null,status:'subscribed' };
  const base = buildPrepaidCheckout({ ...order, expires_at: new Date(Date.now()+45*60_000).toISOString(), amount: proPricing().month.total*100 }, 'https://app.test', 'pmc_card');
  order.request = customCardCheckout(order, { ...base }, { autoRenew:true, saveCard:true, consentVersion:CARD_CONSENT_VERSION }, at);
  return order;
}
const monthPrice = (id: string, amount: number, lookup: string): any => ({ id, product:'prod_VTbexQEI6jrH8r', active:true, livemode:false, type:'recurring', billing_scheme:'per_unit', currency:'thb',
  unit_amount:amount, lookup_key:lookup, recurring:{ interval:'month', interval_count:1, usage_type:'licensed' }, metadata:{ offer:'card' } });
const promoPrice = monthPrice('price_promo', 17700, recurringLookup('month', NOV));
const regularPrice = monthPrice('price_regular', 27100, recurringLookup('month', PRO_MONTH_REGULAR_FROM));
const subWith = (order: PrepaidOrder, price: any, periodEnd: number, over: any = {}): any => ({ id:'sub_card', livemode:false, customer:'cus_owner', collection_method:'charge_automatically', discounts:[],
  status:'active', cancel_at_period_end:false, metadata:order.request!.metadata, items:{ has_more:false, data:[{ id:'si_1', quantity:1, price, current_period_end:Math.floor(periodEnd/1000) }] }, ...over });
const renewal = (order: PrepaidOrder, price: string, amount: number, start: number): any => ({ id:'in_card', livemode:false, customer:'cus_owner', currency:'thb', collection_method:'charge_automatically',
  parent:{ subscription_details:{ subscription:'sub_card', metadata:order.request!.metadata } }, billing_reason:'subscription_cycle', total:amount, amount_due:amount, discounts:[],
  lines:{ has_more:false, data:[{ quantity:1, amount, currency:'thb', period:{ start:Math.floor(start/1000), end:Math.floor(start/1000)+30*86400 },
    pricing:{ price_details:{ price } }, parent:{ subscription_item_details:{ subscription:'sub_card', proration:false } } }] } });

test('a promotion month agreed during the promotion records the step on its order; one made from 1 Dec has none', () => {
  const order = promoMonth();
  assert.deepEqual([order.request!.metadata!.renewal_step_from, order.request!.metadata!.renewal_step_amount], ['2026-12-01', '27100']);
  assert.match(String(order.request!.metadata!.consent_text), /฿177\/เดือน .* จากนั้น ฿271\/เดือน \(ราคา ฿249 \+ ค่าธรรมเนียมชำระเงิน ฿22\)/);
  assert.ok(renewalStepOf(order));
  const december = promoMonth(Date.parse('2026-12-02T03:00:00Z'));
  assert.equal(december.request!.metadata!.renewal_step_amount, undefined);
  assert.equal(renewalStepOf({ ...order, amount: 27100 }), null, 'only a promotion month steps');
  assert.equal(renewalStepOf({ ...order, request: { ...order.request!, metadata: { ...order.request!.metadata, renewal_step_amount: '30000' } } }), null);
});

test('the step: ฿271 accepted only from a period starting 1 Dec, only for an order that agreed; paying less is never refused', () => {
  const order = promoMonth();
  const dec = Date.parse('2026-12-10T03:00:00Z');
  // Moved to the regular price: the subscription still belongs to its order.
  assert.doesNotThrow(() => assertAutoSubscription(subWith(order, regularPrice, dec), order));
  const at = dec + 3600_000; // the renewal is processed on 10 Dec
  assert.deepEqual(validateAutoInvoiceCharge(renewal(order, 'price_regular', 27100, dec), subWith(order, regularPrice, dec + 30 * 86400_000), order, at).amount, 27100);
  // Not moved in time: the old ฿177 is still accepted for December.
  assert.equal(validateAutoInvoiceCharge(renewal(order, 'price_promo', 17700, dec), subWith(order, promoPrice, dec + 30 * 86400_000), order, at).amount, 17700);
  // Never ฿271 for a November period, never another amount, never without the agreement.
  assert.throws(() => validateAutoInvoiceCharge(renewal(order, 'price_regular', 27100, NOV), subWith(order, regularPrice, dec), order, at));
  assert.throws(() => validateAutoInvoiceCharge(renewal(order, 'price_regular', 30000, dec), subWith(order, { ...regularPrice, unit_amount: 30000 }, dec), order, at));
  const plain = { ...order, request: { ...order.request!, metadata: { ...order.request!.metadata, renewal_step_amount: undefined, renewal_step_from: undefined } } } as unknown as PrepaidOrder;
  assert.throws(() => assertAutoSubscription(subWith(plain, regularPrice, dec), plain));
  assert.throws(() => validateAutoInvoiceCharge(renewal(plain, 'price_regular', 27100, dec), subWith(plain, regularPrice, dec), plain, at));
  assert.throws(() => assertAutoSubscription(subWith(order, { ...regularPrice, lookup_key: 'something_else' }, dec), order), 'only the regular price itself');
});

test('the daily job moves a promotion month to ฿271 before its first renewal on or after 1 Dec; nothing else', async () => {
  const order = promoMonth();
  const second = promoMonth(NOV, 'order2');
  const third = promoMonth(NOV, 'order3');
  const plain = { ...third, request: { ...third.request!, metadata: { ...third.request!.metadata, renewal_step_amount: undefined } } } as unknown as PrepaidOrder;
  const dec1 = PRO_MONTH_REGULAR_FROM;
  const subs: Record<string, any> = {
    sub_due: subWith(order, promoPrice, dec1 + 3 * 86400_000, { id: 'sub_due' }),
    sub_early: subWith(second, promoPrice, dec1 - 3600_000, { id: 'sub_early' }),
    sub_plain: subWith(plain, promoPrice, dec1 + 86400_000, { id: 'sub_plain' }),
    sub_stop: subWith(second, promoPrice, dec1 + 86400_000, { id: 'sub_stop', cancel_at_period_end: true }),
    sub_moved: subWith(order, regularPrice, dec1 + 86400_000, { id: 'sub_moved' }),
  };
  const updates: any[] = [];
  const stripe: any = {
    prices: { list: async () => ({ data: [regularPrice] }) },
    subscriptions: { retrieve: async (id: string) => subs[id], update: async (id: string, params: any, options: any) => { updates.push([id, params, options.idempotencyKey]); return subs[id]; } },
  };
  const rows = [
    { subscription_id: 'sub_due', status: 'active', cashflow_prepaid_orders: order },
    { subscription_id: 'sub_early', status: 'active', cashflow_prepaid_orders: second },
    { subscription_id: 'sub_plain', status: 'active', cashflow_prepaid_orders: plain },
    { subscription_id: 'sub_stop', status: 'active', cashflow_prepaid_orders: second },
    { subscription_id: 'sub_moved', status: 'active', cashflow_prepaid_orders: order },
    { subscription_id: 'sub_gone', status: 'canceled', cashflow_prepaid_orders: order },
  ];
  const result = await advanceCardRenewals({ rows: async () => rows, stripe, livemode: false, dryRun: false });
  assert.deepEqual(updates, [['sub_due', { items: [{ id: 'si_1', price: 'price_regular' }], proration_behavior: 'none' }, 'krarok-month-step-20261201:sub_due']]);
  assert.deepEqual([result.processed, result.sent, result.skipped, result.failed], [4, 1, 3, 0], 'the plain one is not in the list; the cancelled one is not processed');
  // Staging never changes Stripe; without the ฿271 price in Stripe, nothing moves and the job says so.
  updates.length = 0;
  assert.equal((await advanceCardRenewals({ rows: async () => rows, stripe, livemode: false, dryRun: true })).sent, 1);
  assert.equal(updates.length, 0);
  const missing = await advanceCardRenewals({ rows: async () => rows, stripe: { ...stripe, prices: { list: async () => ({ data: [] }) } }, livemode: false, dryRun: false });
  assert.deepEqual([missing.failed, missing.reason, updates.length], [4, 'regular_price_missing', 0]);
});

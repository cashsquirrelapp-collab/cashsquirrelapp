import test from 'node:test';
import assert from 'node:assert/strict';
import { customCardCheckout, recurringLookup, RECURRING_OFFER, validRecurringPrice } from '../backend/src/services/cardPlans.js';
import { assertAutoSubscription, validateAutoInvoice } from '../backend/src/services/cardRenewals.js';
import { buildPrepaidCheckout, type PrepaidOrder } from '../backend/src/services/prepaidPlans.js';
import { CARD_CONSENT_VERSION, CARD_SAVE_DISCLOSURE, CARD_SAVE_DISCLOSURE_VERSION, renewalConsentText } from '../shared/cardConsent.js';
import { PRO_PERIODS, PRO_PRICING } from '../shared/proPricing.js';
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

test('the renewal consent uses the owner\'s wording for each period', () => {
  assert.equal(renewalConsentText('month'), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿159/เดือน จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
  assert.equal(renewalConsentText('halfYear'), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿849/6 เดือน จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
  assert.equal(renewalConsentText('year'), 'ยินยอมต่ออายุ Pro อัตโนมัติ ฿1,490/ปี จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก');
});

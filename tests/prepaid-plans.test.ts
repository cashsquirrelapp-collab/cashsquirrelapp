import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { PRO_PERIODS, PRO_PRICING } from '../shared/proPricing.js';
import { buildPrepaidCheckout, prepaidMetadata, validatedPrepaidPayment, validPrepaidPrice,
  prepaidLookup, PREPAID_OFFER, type PrepaidOrder } from '../backend/src/services/prepaidPlans.js';
const order = (period: PrepaidOrder['period']='month', method: PrepaidOrder['method']='card'): PrepaidOrder => ({
  id:'order1',user_id:'11111111-1111-4111-8111-111111111111',period,method,
  months:PRO_PRICING[period].months,amount:PRO_PRICING[period].total*100,price_id:'price1',livemode:false,
  customer_id:'cus1',session_id:'cs1',checkout_url:null,request:null,status:'open',expires_at:'2026-10-20T16:00:00Z',
});
function evidence(o: PrepaidOrder): Stripe.Checkout.Session {
  const metadata=prepaidMetadata(o);
  return { id:'cs1',mode:'payment',livemode:false,status:'complete',payment_status:'paid',
    client_reference_id:o.user_id,customer:'cus1',currency:'thb',amount_total:o.amount,amount_subtotal:o.amount,metadata,
    total_details:{amount_discount:0,amount_tax:0,amount_shipping:0},
    line_items:{has_more:false,data:[{quantity:1,currency:'thb',amount_total:o.amount,amount_subtotal:o.amount,
      price:{id:'price1',unit_amount:o.amount,currency:'thb',type:'one_time',recurring:null}}]},
    payment_intent:{id:'pi1',customer:'cus1',status:'succeeded',livemode:false,currency:'thb',amount:o.amount,
      amount_received:o.amount,amount_capturable:0,metadata,payment_method:{type:o.method},
      latest_charge:{id:'ch1',customer:'cus1',payment_intent:'pi1',status:'succeeded',paid:true,livemode:false,
        currency:'thb',amount:o.amount,created:1792506400,refunded:false,amount_refunded:0,disputed:false,payment_method_details:{type:o.method}}},
  } as unknown as Stripe.Checkout.Session;
}
for(const period of PRO_PERIODS) for(const method of ['card','promptpay'] as const) {
  test(`${period}/${method}: exact price and period survive checkout and fulfillment`,()=>{
    const o=order(period,method);const request=buildPrepaidCheckout(o,'https://krarok.com','pmc_test');
    assert.equal(request.mode,'payment');assert.equal(request.ui_mode,'embedded_page');assert.equal(request.redirect_on_completion,'if_required');assert.equal(request.success_url,undefined);assert.equal(request.cancel_url,undefined);assert.equal(request.metadata?.months,String(o.months));
    assert.deepEqual(request.line_items,[{price:'price1',quantity:1}]);
    assert.equal(request.subscription_data,undefined);assert.equal((request as any).payment_method_types,undefined);
    assert.deepEqual(request.excluded_payment_method_types,[method==='card'?'promptpay':'card']);
    assert.equal(validatedPrepaidPayment(evidence(o),o).refunded,false);
  });
}
test('rejects tampered identity, duration, amount, currency, payment method, quantity, price and unpaid events',()=>{
  const o=order('year','promptpay');
  const mutations: Array<(s:any)=>void> = [s=>s.metadata.period='month',s=>s.metadata.months='1',s=>s.amount_total=15900,
    s=>s.customer='other',s=>s.client_reference_id='other',s=>s.currency='usd',s=>s.livemode=true,
    s=>s.payment_status='unpaid',s=>s.payment_intent.status='processing',s=>s.payment_intent.amount_received=1,
    s=>s.payment_intent.payment_method.type='card',s=>s.payment_intent.latest_charge.paid=false,
    s=>s.line_items.data[0].quantity=2,s=>s.line_items.data[0].price.id='wrong',s=>s.line_items.has_more=true,
    s=>s.total_details.amount_discount=1];
  for(const mutate of mutations){const s=evidence(o);mutate(s);assert.throws(()=>validatedPrepaidPayment(s,o));}
});
test('refunds and disputes are returned as revoked evidence, not a fresh grant',()=>{
  const o=order(); const s:any=evidence(o);s.payment_intent.latest_charge.amount_refunded=1;
  assert.equal(validatedPrepaidPayment(s,o).refunded,true);
  s.payment_intent.latest_charge.amount_refunded=0;s.payment_intent.latest_charge.disputed=true;
  assert.equal(validatedPrepaidPayment(s,o).refunded,true);
});
test('configured price must be fixed one-time and match the server catalog',()=>{
  const price:any={active:true,livemode:false,type:'one_time',recurring:null,currency:'thb',unit_amount:84900,
    billing_scheme:'per_unit',lookup_key:prepaidLookup('halfYear'),metadata:{offer_version:PREPAID_OFFER,period:'halfYear',months:'6'}};
  assert.equal(validPrepaidPrice(price,'halfYear',false),true);
  for(const patch of [{unit_amount:15900},{recurring:{interval:'month'}},{custom_unit_amount:{enabled:true}},{livemode:true},{lookup_key:'old'}])
    assert.equal(validPrepaidPrice({...price,...patch},'halfYear',false),false);
});

import { CARD_CONSENT_VERSION } from '../shared/cardConsent.js';
import { recurringLookup, RECURRING_OFFER } from '../backend/src/services/cardPlans.js';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import Stripe from 'stripe';
import { createApp } from '../backend/src/http/app.js';
import { stripe } from '../backend/src/config/stripe.js';
import { seal } from '../backend/src/security/cookies.js';
import { PREPAID_OFFER, prepaidLookup, prepaidMetadata } from '../backend/src/services/prepaidPlans.js';
import { PRO_PERIODS, PRO_PRICING } from '../shared/proPricing.js';

Object.assign(process.env, {
  VERCEL:'1', APP_URL:'http://127.0.0.1:3000', SUPABASE_URL:'https://prepaid.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'test-key', SUPABASE_SERVICE_ROLE_KEY:'test-admin',
  SESSION_SECRET:'test-only-secret-'.repeat(4), STRIPE_SECRET_KEY:'sk_test_only',
  STRIPE_MODE:'test', STRIPE_PUBLISHABLE_KEY:'pk_test_inline', STRIPE_WEBHOOK_SECRET:'whsec_test', KRAROK_PREPAID_ENABLED:'true',
});
const user={id:'11111111-1111-4111-8111-111111111111',email:'billing@example.test'};
const token=`e30.${Buffer.from(JSON.stringify({sub:user.id,session_id:'33333333-3333-4333-8333-333333333333'})).toString('base64url')}.test`;
const cookie=`cashflow-session=${seal({access_token:token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,issued_at:Date.now()})}`;
const realFetch=globalThis.fetch;
let server:Server, origin:string, order:any, session:any, creates=0, fulfilled:any[]=[], finished:any[]=[], expires=0, expirationFails=false;
let banned=false; let intent:any=null, intentCreates=0, qrCancelFails=false; let unknownQr=false; let qrBodies:any[]=[];
let cardCycles:any[]=[], cardStates:any[]=[], cardSubscription:any=null;
const rateKeys: Array<{p_key:string;p_limit:number}>=[];
before(async()=>{
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(!url.startsWith('https://prepaid.supabase.co/')) return realFetch(input,init);
    const json=(body:any)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
    if(url.includes('/auth/v1/user')) return json(user);
    if(url.includes('/cashflow_rate_limit')) {rateKeys.push(JSON.parse(String(init?.body)));return json(true);}
    if(url.includes('/cashflow_session_active')) return json(true);
    if(url.includes('/cashflow_user_roles')) return json({role:'user'});
    if(url.includes('/cashflow_card_subscriptions')) return json(cardSubscription?{subscription_id:cardSubscription.id,user_id:user.id}:null);
    if(url.includes('/cashflow_sync_card_subscription')) {cardStates.push(JSON.parse(String(init?.body)));return json(null);}
    if(url.includes('/cashflow_record_card_cycle')) {cardCycles.push(JSON.parse(String(init?.body)));return json(null);}
    if(url.includes('/subscriptions')) return json(banned?{plan:'admin_revoked',status:'canceled'}:null);
    if(url.includes('/rest/v1/cashflow_prepaid_orders')) return json(url.includes('status=in.')?(order && ['reserved','open'].includes(order.status)?[order]:[]):order);
    const args=JSON.parse(String(init?.body||'{}'));
    if(url.includes('/cashflow_reserve_prepaid_checkout')) {
      if(!order || order.status==='expired') order={id:args.p_order_id,user_id:user.id,period:args.p_period,
        months:PRO_PRICING[args.p_period as keyof typeof PRO_PRICING].months,
        amount:PRO_PRICING[args.p_period as keyof typeof PRO_PRICING].total*100,
        method:args.p_method,price_id:args.p_price_id,livemode:false,customer_id:'cus_prepaid',
        session_id:null,request:null,checkout_url:null,status:'reserved',expires_at:new Date(Date.now()+45*60_000).toISOString()};
      return json({result:'reserved',order_id:order.id});
    }
    if(url.includes('/cashflow_prepare_direct_qr')) { order.request=args.p_request;return json(args.p_request); }
    if(url.includes('/cashflow_attach_direct_qr')) { order.intent_id=args.p_intent_id;return json(null); }
    if(url.includes('/cashflow_finish_direct_qr')) { finished.push(args);order.status='expired';return json(null); }
    if(url.includes('/cashflow_bind_stripe_customer')) return json(true);
    if(url.includes('/cashflow_prepare_prepaid_checkout')) {
      order.request=args.p_request;return json(args.p_request);
    }
    if(url.includes('/cashflow_attach_prepaid_checkout')) {
      order.session_id=args.p_session_id;order.checkout_url=args.p_url;return json(null);
    }
    if(url.includes('/cashflow_fulfill_prepaid')) {fulfilled.push(args);return json('paid');}
    if(url.includes('/cashflow_finish_prepaid_checkout')) {finished.push(args);order.status='expired';return json(null);}
    throw new Error(`Unexpected mock endpoint ${new URL(url).pathname}`);
  };
  stripe.paymentIntents.create=(async(request:any,options:any)=>{
    intentCreates++; qrBodies.push(structuredClone(request));
    assert.equal(options.idempotencyKey,`krarok-qr:${order.id}`);
    assert.deepEqual(order.request,request,'request persisted before creating payment');
    assert.deepEqual(request.allowed_payment_method_types,['promptpay']);
    assert.equal(request.payment_method_types,undefined);
    intent={id:'pi_direct',status:'requires_action',livemode:false,amount:request.amount,amount_received:0,
      amount_capturable:0,currency:'thb',customer:request.customer,metadata:request.metadata,
      payment_method:{id:'pm_direct',type:'promptpay'},next_action:{type:'promptpay_display_qr_code',
        promptpay_display_qr_code:{data:'test-payload',image_url_png:'https://qr.stripe.com/direct-test.png'}}};
    if(unknownQr) throw new Error('Create timeout');
    return intent;
  }) as any;
  stripe.paymentIntents.retrieve=(async()=>intent || {metadata:{}}) as any;
  stripe.paymentIntents.cancel=(async()=>{if(qrCancelFails)throw new Error('Cancel timeout');intent.status='canceled';return intent;}) as any;
  stripe.prices.list=(async(params:any)=>{
    const recurring=params.lookup_keys[0].startsWith(RECURRING_OFFER);
    const period=PRO_PERIODS.find(p=>(recurring?recurringLookup(p):prepaidLookup(p))===params.lookup_keys[0])!;
    return {data:[{id:`price_${recurring?'auto_':''}${period}`,product:'prod_VTbexQEI6jrH8r',active:true,livemode:false,type:recurring?'recurring':'one_time',recurring:recurring?{interval:'month',interval_count:PRO_PRICING[period].months,usage_type:'licensed'}:null,
      billing_scheme:'per_unit',currency:'thb',unit_amount:PRO_PRICING[period].total*100,
      lookup_key:recurring?recurringLookup(period):prepaidLookup(period),metadata:{offer_version:recurring?RECURRING_OFFER:PREPAID_OFFER,period,months:String(PRO_PRICING[period].months)}}]};
  }) as any;
  stripe.paymentMethodConfigurations.list=(async()=>({data:[{id:'pmc_prepaid',active:true,is_default:true,livemode:false,
    card:{available:true,display_preference:{value:'on'}},promptpay:{available:true,display_preference:{value:'on'}}}]})) as any;
  stripe.customers.retrieve=(async()=>({id:'cus_prepaid',livemode:false,metadata:{app_user_id:user.id,workspace_type:'personal',workspace_id:user.id}})) as any;
  stripe.invoicePayments.list=(async()=>({data:[],has_more:false})) as any;
  stripe.subscriptions.list=(()=>({autoPagingToArray:async()=>[]})) as any;
  stripe.checkout.sessions.create=(async(request:any,options:any)=>{
    creates++;assert.equal(options.idempotencyKey,`krarok-prepaid:${order.id}`);
    assert.deepEqual(request.line_items,[{price:order.price_id,quantity:1}]);
    const metadata=request.metadata;
    session={id:'cs_prepaid',mode:request.mode,status:'open',payment_status:'unpaid',livemode:false,
      customer:order.customer_id,client_reference_id:user.id,metadata,currency:'thb',
      amount_total:order.amount,amount_subtotal:order.amount,expires_at:request.expires_at,
      url:null, ui_mode:request.ui_mode, client_secret:'cs_prepaid_secret_test'};
    return session;
  }) as any;
  stripe.checkout.sessions.retrieve=(async()=>session) as any;
  stripe.checkout.sessions.expire=(async()=>{
    expires++;
    if(expirationFails) throw new Error('Network timeout');
    session={...session,status:'expired'};
    return session;
  }) as any;
  server=await new Promise<Server>(resolve=>{const s=createApp().listen(0,'127.0.0.1',()=>resolve(s));});
  origin=`http://127.0.0.1:${(server.address() as any).port}`;
});
after(async()=>{
  globalThis.fetch=realFetch;
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
});
const headers={cookie,'x-vercel-forwarded-for':'192.0.2.1','x-account-id':user.id,'content-type':'application/json',
  'x-csrf-protection':'1',origin:process.env.APP_URL!};
let testIp=1;beforeEach(()=>{headers['x-vercel-forwarded-for']=`192.0.2.${++testIp}`;});
const checkout=(body:unknown)=>realFetch(origin+'/api/billing',{method:'POST',headers,body:JSON.stringify(body)});
const webhook=async(tamper=false)=>{
  const raw=JSON.stringify({id:'evt_prepaid',type:'checkout.session.completed',livemode:false,data:{object:{id:session.id}}});
  const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_test'});
  return realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':signature,'content-type':'application/json'},body:raw+(tamper?' ':'')});
};
test('checkout requires authentication, CSRF and an allowed period; injected amount or identity cannot reach Stripe',async()=>{
  const before=creates;
  await realFetch(origin+'/api/billing',{headers});
  const readKey=[...rateKeys].reverse().find(key=>key.p_limit===60)?.p_key;
  await checkout({action:'checkout',period:'invalid'});
  const writeKey=[...rateKeys].reverse().find(key=>key.p_limit===12)?.p_key;
  assert.ok(readKey && writeKey);
  assert.notEqual(readKey,writeKey,'status polling cannot exhaust the mutation budget');
  assert.equal((await realFetch(origin+'/api/billing',{method:'POST',headers:{'content-type':'application/json','x-csrf-protection':'1',origin:process.env.APP_URL!},body:'{}'})).status,401);
  assert.equal((await realFetch(origin+'/api/billing',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:'{}'})).status,403);
  for(const body of [{action:'checkout',period:'year',amount:15900},{action:'checkout',period:'year',months:1},
    {action:'checkout',period:'year',user_id:'other'},{action:'checkout',period:'invalid'}]) {
    assert.equal((await checkout(body)).status,400);
  }
  assert.equal(creates,before);
});
for(const period of PRO_PERIODS) for(const method of ['card','promptpay']) {
  test(`HTTP ${period}/${method}: checkout, retry and signed webhook retain exact ownership/amount/months`,async()=>{
    order=null;session=null;fulfilled=[];
    const before=creates;
    const body={action:method==='card'?'checkout':'promptpay_checkout',period};
    const response=await checkout(body);
    assert.equal(response.status,200,await response.clone().text());
    const result:any=await response.json();
    assert.equal(result.destination,'embedded');assert.equal(result.clientSecret,'cs_prepaid_secret_test');assert.equal(result.publishableKey,'pk_test_inline');assert.equal(result.url,undefined);
    assert.equal(result.amount,PRO_PRICING[period].total*100);assert.equal(result.months,PRO_PRICING[period].months);
    assert.equal((await checkout(body)).status,200);assert.equal(creates,before+1);
    assert.equal((await webhook(true)).status,400);assert.equal(fulfilled.length,0);
    // A signed event alone cannot grant access while canonical Stripe state is unpaid.
    assert.equal((await webhook()).status,200);assert.equal(fulfilled.length,0);
    session={...session,status:'complete',payment_status:'paid',
      line_items:{has_more:false,data:[{quantity:1,currency:'thb',amount_total:order.amount,amount_subtotal:order.amount,
        price:{id:order.price_id,unit_amount:order.amount,currency:'thb',type:'one_time',recurring:null}}]},
      payment_intent:{id:'pi_prepaid',status:'succeeded',livemode:false,customer:order.customer_id,
        amount:order.amount,amount_received:order.amount,amount_capturable:0,currency:'thb',
        metadata:prepaidMetadata(order),payment_method:{type:method},
        latest_charge:{id:'ch_prepaid',payment_intent:'pi_prepaid',customer:order.customer_id,status:'succeeded',
          paid:true,livemode:false,amount:order.amount,currency:'thb',created:Math.floor(Date.now()/1000),
          payment_method_details:{type:method},amount_refunded:0,refunded:false,disputed:false}}};
    assert.equal((await webhook()).status,200);
    assert.equal(fulfilled.length,1);assert.equal(fulfilled[0].p_user_id,user.id);
    assert.equal(fulfilled[0].p_amount,PRO_PRICING[period].total*100);
    assert.equal(fulfilled[0].p_months,PRO_PRICING[period].months);
  });
}
test('cancel only the exact owned unpaid checkout; unknown expiration and racing payments never release it',async()=>{
  order=null;session=null;finished=[];fulfilled=[];expirationFails=false;
  assert.equal((await checkout({action:'checkout',period:'month'})).status,200);
  const body={action:'cancel_checkout',order_id:order.id};
  const before=expires;
  order.user_id='22222222-2222-4222-8222-222222222222';
  assert.equal((await checkout(body)).status,404);
  assert.equal(expires,before);
  order.user_id=user.id;
  expirationFails=true;
  assert.equal((await checkout(body)).status,409);
  assert.equal(finished.length,0);
  // A completed asynchronous payment is not safe to cancel even before it is paid.
  session.status='complete';
  assert.equal((await checkout(body)).status,409);
  assert.equal(finished.length,0);
  session.status='open';expirationFails=false;
  assert.equal((await checkout(body)).status,200);
  assert.equal(finished.length,1);
  assert.equal(finished[0].p_order_id,order.id);
  assert.equal(finished[0].p_user_id,user.id);
  assert.equal(finished[0].p_state,'expired');
  const expiredCalls=expires;
  assert.equal((await checkout(body)).status,200);
  assert.equal(expires,expiredCalls);
  assert.equal(fulfilled.length,0);
});

test('banned Pro cannot create either payment method and readiness is closed',async()=>{
  banned=true;const before=creates;
  try {
    const status=await realFetch(origin+'/api/billing',{headers});
    assert.equal((await status.json() as any).checkout_ready,false);
    for(const action of ['checkout','promptpay_checkout'])assert.equal((await checkout({action,period:'month'})).status,403);
    assert.equal(creates,before);
  }finally{banned=false;}
});

test('switching plan/method automatically expires the old unpaid session; same choice resumes',async()=>{
  order=null;session=null;expirationFails=false;
  await checkout({action:'checkout',period:'month'});
  const before=expires;const oldId=order.id;
  const response=await checkout({action:'promptpay_checkout',period:'year'});
  assert.equal(response.status,200,await response.clone().text());
  assert.equal(expires,before+1);assert.notEqual(order.id,oldId);
  assert.equal(order.months,12);assert.equal(order.amount,149000);
  const count=creates;assert.equal((await checkout({action:'promptpay_checkout',period:'year'})).status,200);
  assert.equal(creates,count);assert.equal(expires,before+1);
});
test('legacy hosted sessions are recovered and expired before creating an inline session',async()=>{
  order=null;session=null;expirationFails=false;
  await checkout({action:'checkout',period:'month'});
  order.request={...order.request,ui_mode:undefined};session.ui_mode='hosted_page';
  const before=expires;
  const response=await checkout({action:'checkout',period:'month'});
  assert.equal(response.status,200,await response.clone().text());assert.equal(expires,before+1);
  assert.equal(order.request.ui_mode,'embedded_page');
});
test('a failed expiration cannot create a replacement or expose another payment secret',async()=>{
  order=null;session=null;expirationFails=false;
  await checkout({action:'checkout',period:'month'});
  expirationFails=true;const before=creates;
  const response=await checkout({action:'promptpay_checkout',period:'halfYear'});
  assert.equal(response.status,409);assert.equal(creates,before);expirationFails=false;
});
test('unknown hosted creation is replayed unchanged before replacement; cannot orphan an unpaid charge',async()=>{
  order=null;session=null;expirationFails=false;
  assert.equal((await checkout({action:'checkout',period:'month'})).status,200);
  order.request={...order.request,ui_mode:'hosted_page'};order.session_id=null;
  const stored=JSON.stringify(order.request);const oldId=order.id;const before=creates;
  const create=stripe.checkout.sessions.create;
  let recovered=false;
  stripe.checkout.sessions.create=(async(request:any,options:any)=>{
    if(options.idempotencyKey===`krarok-prepaid:${oldId}`){assert.equal(JSON.stringify(request),stored);recovered=true;}
    return create(request,options);
  }) as any;
  try {
    const response=await checkout({action:'promptpay_checkout',period:'year'});
    assert.equal(response.status,200,await response.clone().text());assert.equal(recovered,true);
    assert.equal(creates,before+2);assert.equal(order.request.ui_mode,'embedded_page');
  }finally{stripe.checkout.sessions.create=create;}
});

const directStart=(period='month')=>checkout({action:'promptpay_checkout',period});
const resetQr=()=>{process.env.KRAROK_DIRECT_QR_ENABLED='true'; order=null; intent=null; banned=false; intentCreates=0; qrBodies=[]; qrCancelFails=false; unknownQr=false;fulfilled=[];finished=[];};
const payQr=()=>{intent.status='succeeded';intent.amount_received=order.amount;intent.latest_charge={id:'ch_qr',status:'succeeded',paid:true,livemode:false,amount:order.amount,currency:'thb',customer:order.customer_id,payment_intent:intent.id,payment_method_details:{type:'promptpay'},created:Math.floor(Date.now()/1000),amount_refunded:0,refunded:false,disputed:false};};
const qrEvent=async(type='payment_intent.succeeded',tamper=false)=>{
 const raw=JSON.stringify({id:'evt_direct',type,livemode:false,data:{object:{id:intent.id}}});
 const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_test'});
 return realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':signature,'content-type':'application/json'},body:raw+(tamper?' ':'')});
};
test('direct QR returns an immediate image for all locked prices with no Checkout Session or client secret',async()=>{
 resetQr();const before=creates;
 for(const period of PRO_PERIODS){
  const response=await directStart(period);assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.destination,'qr');assert.equal(data.qrImage,'https://qr.stripe.com/direct-test.png');
  assert.equal(data.amount,PRO_PRICING[period].total*100);assert.equal(data.months,PRO_PRICING[period].months);
  assert.equal(data.clientSecret,undefined);assert.equal(data.url,undefined);assert.equal(order.session_id,null);
  assert.equal(fulfilled.length,0);
 }
 assert.equal(creates,before);assert.equal(intentCreates,3);
});
test('QR retry reuses its PaymentIntent; changing to card cancels it first',async()=>{
 resetQr();await directStart();await directStart();assert.equal(intentCreates,1);
 const response=await checkout({action:'checkout',period:'year'});assert.equal(response.status,200);
 assert.equal(intent.status,'canceled');assert.equal((await response.json()).destination,'embedded');
});
test('unknown QR creation replays immutable body; failed cancellation blocks replacement; racing paid QR is fulfilled',async()=>{
 resetQr();unknownQr=true;assert.equal((await directStart()).status,500);
 unknownQr=false;assert.equal((await directStart()).status,200);assert.deepEqual(qrBodies[0],qrBodies[1]);
 qrCancelFails=true;assert.equal((await directStart('year')).status,409);assert.equal(intentCreates,2);
 payQr();assert.equal((await directStart('year')).status,409);assert.equal(fulfilled.length,1);assert.equal(fulfilled[0].p_session_id,null);
});
test('direct QR signed webhook and owner polling require exact successful evidence before Pro; wrong identity and amount fail',async()=>{
 resetQr();await directStart();
 assert.equal((await qrEvent()).status,200);assert.equal(fulfilled.length,0);
 assert.equal((await qrEvent('payment_intent.succeeded',true)).status,400);
 payQr();intent.amount_received=100;assert.equal((await qrEvent()).status,500);assert.equal(fulfilled.length,0);
 intent.amount_received=order.amount;intent.metadata.app_user_id='other';assert.equal((await qrEvent()).status,500);
 intent.metadata.app_user_id=user.id;assert.equal((await qrEvent()).status,200);assert.equal(fulfilled[0].p_months,1);
 const status=await realFetch(origin+'/api/billing?order_id='+order.id,{headers});assert.equal(status.status,200);assert.equal((await status.json()).paymentStatus,'paid');
 order.user_id='other';assert.equal((await realFetch(origin+'/api/billing?order_id='+order.id,{headers})).status,404);
});
test('direct QR refund webhook revokes the exact order and cancellation never grants access',async()=>{
 resetQr();await directStart();payQr();intent.latest_charge.amount_refunded=100;
 const raw=JSON.stringify({id:'evt_qr_refund',type:'charge.refunded',livemode:false,data:{object:{payment_intent:intent.id}}});
 const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_test'});
 const res=await realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':signature,'content-type':'application/json'},body:raw});
 assert.equal(res.status,200);assert.equal(fulfilled[0].p_refunded,true);
 resetQr();await directStart();intent.status='canceled';assert.equal((await qrEvent('payment_intent.canceled')).status,200);assert.equal(finished.length,1);assert.equal(fulfilled.length,0);
 delete process.env.KRAROK_DIRECT_QR_ENABLED;
});

test('ingress status polling cannot exhaust the independent purchase budget',async()=>{
 delete process.env.KRAROK_DIRECT_QR_ENABLED;order=null;banned=false;headers['x-vercel-forwarded-for']='192.0.2.240';
 for(let i=0;i<35;i++) assert.equal((await realFetch(origin+'/api/billing',{headers})).status,200);
 assert.equal((await checkout({action:'checkout',period:'month'})).status,200);
});

test('custom card options default to no auto renewal; retries preserve consent; toggling expires the exact old session',async()=>{
 process.env.KRAROK_CUSTOM_CARD_ENABLED='true';order=null;session=null;banned=false;
 try {
  const body={action:'checkout',period:'month',autoRenew:false,saveCard:true,consentVersion:CARD_CONSENT_VERSION};
  for(const invalid of [{...body,autoRenew:'true'},{...body,consentVersion:'old'},{...body,autoRenew:true,saveCard:false}])
   assert.equal((await checkout(invalid)).status,400);
  let r=await checkout(body);assert.equal(r.status,200,await r.clone().text());
  let result:any=await r.json();assert.equal(result.customCard,true);assert.equal(result.autoRenew,false);assert.equal(result.saveCard,true);
  assert.equal(order.request.mode,'payment');assert.equal(order.request.subscription_data,undefined);
  const oldConsent=order.request.metadata.consent_at;const before=expires;
  r=await checkout(body);assert.equal(r.status,200);assert.equal(order.request.metadata.consent_at,oldConsent);
  r=await checkout({...body,autoRenew:true});assert.equal(r.status,200,await r.clone().text());
  result=await r.json();assert.equal(result.autoRenew,true);assert.equal(order.request.mode,'subscription');assert.equal(expires,before+1);
  assert.equal(order.request.subscription_data.metadata.auto_renew,'true');
  r=await checkout(body);assert.equal(r.status,200,await r.clone().text());assert.equal(order.request.mode,'payment');
 } finally {delete process.env.KRAROK_CUSTOM_CARD_ENABLED;}
});

test('signed recurring invoice checks card payment evidence; failed renewal never grants; refunds and owner cancellation use the same subscription',async()=>{
 process.env.KRAROK_CUSTOM_CARD_ENABLED='true'; order=null;session=null;cardCycles=[];cardStates=[];
 const originals={subRetrieve:stripe.subscriptions.retrieve,subUpdate:stripe.subscriptions.update,subCancel:stripe.subscriptions.cancel,invoiceRetrieve:stripe.invoices.retrieve,paymentsList:stripe.invoicePayments.list,piRetrieve:stripe.paymentIntents.retrieve};
 try {
  const r=await checkout({action:'checkout',period:'halfYear',autoRenew:true,saveCard:true,consentVersion:CARD_CONSENT_VERSION});assert.equal(r.status,200,await r.clone().text());
  const start=Math.floor(Date.now()/1000),end=start+183*86400;
  const price:any={id:order.price_id,product:'prod_VTbexQEI6jrH8r',active:true,livemode:false,currency:'thb',unit_amount:84900,type:'recurring',billing_scheme:'per_unit',lookup_key:recurringLookup('halfYear'),recurring:{interval:'month',interval_count:6,usage_type:'licensed'}};
  cardSubscription={id:'sub_card',livemode:false,customer:order.customer_id,collection_method:'charge_automatically',discounts:[],status:'active',created:start,cancel_at_period_end:false,metadata:order.request.subscription_data.metadata,items:{has_more:false,data:[{price,quantity:1,current_period_end:end}]}};
  session={...session,status:'complete',subscription:'sub_card'};
  const invoice:any={id:'in_card',livemode:false,customer:order.customer_id,currency:'thb',status:'open',collection_method:'charge_automatically',billing_reason:'subscription_cycle',parent:{subscription_details:{subscription:'sub_card',metadata:cardSubscription.metadata}},total:84900,amount_due:84900,amount_paid:0,amount_paid_off_stripe:0,amount_remaining:84900,discounts:[],lines:{has_more:false,data:[{quantity:1,amount:84900,currency:'thb',pricing:{price_details:{price:order.price_id}},parent:{subscription_item_details:{subscription:'sub_card',proration:false}},period:{start,end}}]}};
  const pi:any={id:'pi_card',livemode:false,status:'succeeded',amount:84900,amount_received:84900,amount_capturable:0,currency:'thb',customer:order.customer_id,metadata:{},payment_method:{type:'card'},latest_charge:{id:'ch_card',payment_intent:'pi_card',paid:true,status:'succeeded',livemode:false,amount:84900,currency:'thb',customer:order.customer_id,payment_method_details:{type:'card'},amount_refunded:0,refunded:false,disputed:false}};
  stripe.subscriptions.retrieve=(async()=>cardSubscription) as any;
  stripe.invoices.retrieve=(async()=>invoice) as any;
  stripe.invoicePayments.list=(async()=>({has_more:false,data:[{livemode:false,currency:'thb',amount_paid:84900,invoice:'in_card',payment:{type:'payment_intent',payment_intent:'pi_card'}}]})) as any;
  stripe.paymentIntents.retrieve=(async()=>pi) as any;
  const send=async(type:string,object:any)=>{
   const raw=JSON.stringify({id:'evt_card',type,livemode:false,data:{object}});
   return realFetch(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':Stripe.webhooks.generateTestHeaderString({payload:raw,secret:'whsec_test'}),'content-type':'application/json'},body:raw});
  };
  assert.equal((await send('invoice.payment_failed',{id:'in_card'})).status,200);assert.equal(cardCycles.length,0);
  invoice.status='paid';invoice.amount_paid=84900;invoice.amount_remaining=0;
  pi.amount_received=15900;assert.equal((await send('invoice.paid',{id:'in_card'})).status,500);assert.equal(cardCycles.length,0);
  pi.amount_received=84900;assert.equal((await send('invoice.paid',{id:'in_card'})).status,200);
  assert.equal(cardCycles[0].p_user_id,user.id);assert.equal(cardCycles[0].p_amount,84900);assert.equal(cardCycles[0].p_end,new Date(end*1000).toISOString());
  pi.latest_charge.amount_refunded=1;
  assert.equal((await send('charge.refunded',{payment_intent:'pi_card'})).status,200);assert.equal(cardCycles.at(-1).p_refunded,true);
  let updates=0;stripe.subscriptions.update=(async(id:string,args:any)=>{assert.equal(id,'sub_card');assert.deepEqual(args,{cancel_at_period_end:true});updates++;cardSubscription.cancel_at_period_end=true;return cardSubscription;}) as any;
  assert.equal((await checkout({action:'stop_auto_renewal',user_id:'other'})).status,400);assert.equal(updates,0);
  assert.equal((await checkout({action:'stop_auto_renewal'})).status,200);assert.equal(updates,1);assert.equal(cardStates.at(-1).p_cancel,true);
  cardSubscription.status='past_due';cardSubscription.cancel_at_period_end=false;
  let cancels=0;const cycleCount=cardCycles.length;
  stripe.subscriptions.cancel=(async(id:string,args:any)=>{assert.equal(id,'sub_card');assert.deepEqual(args,{invoice_now:false,prorate:false});cancels++;cardSubscription.status='canceled';return cardSubscription;}) as any;
  assert.equal((await checkout({action:'stop_auto_renewal'})).status,200);assert.equal(cancels,1);assert.equal(updates,1);assert.equal(cardCycles.length,cycleCount);
 }finally{delete process.env.KRAROK_CUSTOM_CARD_ENABLED;stripe.subscriptions.retrieve=originals.subRetrieve;stripe.subscriptions.update=originals.subUpdate;stripe.subscriptions.cancel=originals.subCancel;stripe.invoices.retrieve=originals.invoiceRetrieve;stripe.invoicePayments.list=originals.paymentsList;stripe.paymentIntents.retrieve=originals.piRetrieve;}
});

test('existing customer checks overlap without creating a checkout before both checks pass', async()=>{
  order=null;session=null;expirationFails=false;
  delete process.env.KRAROK_CUSTOM_CARD_ENABLED;
  delete process.env.KRAROK_DIRECT_QR_ENABLED;
  const retrieve=stripe.customers.retrieve, list=stripe.subscriptions.list;
  const before=creates;
  let customerStarted=false, subscriptionsStarted=false;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  stripe.customers.retrieve=(async(...args:any[])=>{customerStarted=true;await gate;return (retrieve as any)(...args);}) as any;
  stripe.subscriptions.list=(()=>({autoPagingToArray:async()=>{subscriptionsStarted=true;await gate;return [];}})) as any;
  const response=checkout({action:'checkout',period:'month'});
  try {
    const deadline=Date.now()+2000;
    while((!customerStarted || !subscriptionsStarted) && Date.now()<deadline) await new Promise(r=>setTimeout(r,5));
    assert.ok(customerStarted && subscriptionsStarted,'independent reads must start before either completes');
    assert.equal(creates,before,'an unfinished ownership check cannot create a checkout');
  } finally {release();}
  try {assert.equal((await response).status,200);}
  finally {stripe.customers.retrieve=retrieve;stripe.subscriptions.list=list;}
});

test('successful canonical expiration needs no second Stripe read and never fulfills access',async()=>{
  order=null;session=null;expirationFails=false;fulfilled=[];
  assert.equal((await checkout({action:'checkout',period:'month'})).status,200);
  const retrieve=stripe.checkout.sessions.retrieve;
  let reads=0;
  stripe.checkout.sessions.retrieve=(async(...args:any[])=>{reads++;return (retrieve as any)(...args);}) as any;
  try {
    assert.equal((await checkout({action:'cancel_checkout',order_id:order.id})).status,200);
    assert.equal(reads,1);assert.equal(order.status,'expired');assert.equal(fulfilled.length,0);
  } finally {stripe.checkout.sessions.retrieve=retrieve;}
});

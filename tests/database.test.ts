import { after,before,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import Stripe from 'stripe';
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='44444444-4444-4444-8444-444444444444',d='55555555-5555-4555-8555-555555555555';
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create table public.subscriptions(user_id uuid primary key references auth.users(id),stripe_customer_id text,stripe_subscription_id text,status text,plan text,current_period_end timestamptz,updated_at timestamptz default now());
 alter table public.subscriptions enable row level security;grant select on public.subscriptions to authenticated;
 create policy unsafe_legacy_read on public.subscriptions for select to authenticated using(true);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 insert into auth.users(id,email)values('${a}','a@example.com'),('${b}','b@example.com'),('${c}','c@example.com'),('${d}','d@example.com');
 create table public.user_cashflow_data(user_id uuid primary key,email text,jobs jsonb,expenses jsonb,goals jsonb,settings jsonb,statuses jsonb,job_types jsonb,avatar_data_url text,notif_settings jsonb);
 insert into public.user_cashflow_data values('${a}','spoofed@example.com','[{"id":"legacy-job","name":"Original","value":100}]','[]','[]','{}','[]','[]',null,'{"enabled":true,"lineUserId":"LINE-A","passwordResetCode":{"code":"123456"},"chatHistory":[],"dailyDigestEnabled":true}');`);
 await db.exec(`create schema storage;grant usage on schema storage to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id text primary key,bucket_id text,name text);
 insert into storage.buckets values('monthly-reports','monthly-reports',true,null,null);
 insert into storage.objects values('a','monthly-reports','${a}/2026-09.xlsx'),('b','monthly-reports','${b}/2026-09.xlsx'),('avatar','avatars','public.png');
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
 alter table storage.objects enable row level security;
 create policy unsafe_legacy_storage on storage.objects for all to anon,authenticated using(true) with check(true);
 create function public.legacy_grant_pro(uuid) returns void language sql security definer as $$update public.subscriptions set status='active' where user_id=$1$$;`);
 for(const migration of (await readdir('database/migrations')).filter(name=>/^\d{3}_.+\.sql$/.test(name)).sort()) {
  await db.exec(await readFile(`database/migrations/${migration}`,'utf8'));
 }
});
after(()=>db.close());
async function one(sql:string,params:any[]=[]){return (await db.query<any>(sql,params)).rows[0];}
test('legacy migration preserves entities, uses auth email, separates private fields',async()=>{
 await db.query("insert into subscriptions(user_id,status) values($1,'active')",[a]);
 const row=await one('select * from cashflow_account_snapshot where user_id=$1',[a]);
 assert.equal(row.email,'a@example.com');assert.equal(row.jobs[0].id,'legacy-job');
 const prefs=await one("select data from cashflow_documents where user_id=$1 and id='notif_settings'",[a]);
 assert.equal(prefs.data.lineUserId,undefined);assert.equal(prefs.data.passwordResetCode,undefined);assert.equal(prefs.data.chatHistory,undefined);
 assert.equal((await one('select count(*)::int n from cashflow_challenges')).n,0);
 assert.equal(row.notif_settings.lineUserId,'LINE-A');
});
test('RLS denies other owners, anonymous access, writes, and privileged RPCs',async()=>{
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}';`);
 try {
  assert.equal((await db.query('select * from cashflow_jobs')).rows.length,0);
  assert.equal((await db.query('select * from subscriptions')).rows.length,0);
  await assert.rejects(db.exec(`insert into cashflow_jobs values('${b}','bad','{}',1,now())`),/permission denied/);
  await assert.rejects(db.exec(`select cashflow_apply_changes('${a}','[]')`),/permission denied/);
  await assert.rejects(db.exec('select * from cashflow_private_state'),/permission denied/);
  await assert.rejects(db.exec('select * from cashflow_account_snapshot'),/permission denied/);
  await assert.rejects(db.exec('select * from user_cashflow_data'),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${a}';`);
  assert.equal((await db.query('select * from cashflow_jobs')).rows.length,1);
  await db.exec('set role anon');await assert.rejects(db.exec('select * from cashflow_jobs'),/permission denied/);
 }finally{await db.exec('reset role');}
});
test('hardening blocks legacy privileged RPCs and financial storage despite permissive old policies',async()=>{
 try {
  await db.exec(await readFile('database/security-check.sql','utf8'));
 } catch(error) {
  await db.exec('rollback').catch(()=>undefined);
  throw error;
 }
 const bucket=await one("select public,file_size_limit from storage.buckets where id='monthly-reports'");
 assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),4194304);
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  try {
   await assert.rejects(db.exec(`select public.legacy_grant_pro('${a}')`),/permission denied/);
   const rows=(await db.query<any>('select * from storage.objects')).rows;assert.deepEqual(rows.map(row=>row.id),['avatar']);
   await assert.rejects(db.exec("insert into storage.objects values('forbidden','monthly-reports','other.xlsx')"),/row-level security/);
   assert.equal((await db.query("update storage.objects set name='hacked.xlsx' where bucket_id='monthly-reports' returning id")).rows.length,0);
   assert.equal((await db.query("delete from storage.objects where bucket_id='monthly-reports' returning id")).rows.length,0);
  }finally{await db.exec('reset role');}
 }
 await db.exec('set role service_role');try{assert.equal((await db.query("select * from storage.objects where bucket_id='monthly-reports'")).rows.length,2);}finally{await db.exec('reset role');}
});
test('version conflicts roll back the entire batch, including earlier inserts',async()=>{
 await db.query('select cashflow_apply_changes($1,$2)',[a,JSON.stringify([{table:'cashflow_jobs',id:'cas',op:'set',version:null,data:{id:'cas',name:'v1'}}])]);
 await db.query('select cashflow_apply_changes($1,$2)',[a,JSON.stringify([{table:'cashflow_jobs',id:'cas',op:'set',version:1,data:{id:'cas',name:'v2'}}])]);
 assert.equal((await one('select cashflow_apply_changes($1,$2) ok',[a,JSON.stringify([{table:'cashflow_jobs',id:'rollback',op:'set',version:null,data:{id:'rollback'}},{table:'cashflow_jobs',id:'cas',op:'delete',version:1}])])).ok,false);
 assert.equal((await one("select count(*)::int n from cashflow_jobs where id='rollback'")).n,0);
 assert.equal((await one("select data->>'name' name from cashflow_jobs where id='cas'")).name,'v2');
});
test('an Excel import is one batch per account: another account with the same row ids is untouched',async()=>{
 // Imported rows keep where they came from (importSource) and the batch; ids are only unique per account.
 const row=(id:string,name:string)=>({table:'cashflow_jobs',id,op:'set',version:null,data:{id,name,value:32000,importBatchId:'batch-1',importSource:{sheet:'Invoices',row:2,ref:'INV-2609-001'}}});
 assert.equal((await one('select cashflow_apply_changes($1,$2) ok',[b,JSON.stringify([row('import-1','Brand Identity Refresh'),row('import-2','Landing Page Design')])])).ok,true);
 assert.equal((await one('select cashflow_apply_changes($1,$2) ok',[a,JSON.stringify([row('import-1','Another account')])])).ok,true);
 const mine=(await db.query<any>("select data->>'name' name from cashflow_jobs where user_id=$1 and id like 'import-%' order by id",[b])).rows.map(r=>r.name);
 assert.deepEqual(mine,['Brand Identity Refresh','Landing Page Design']);
 assert.equal((await one("select data->'importSource'->>'ref' ref from cashflow_jobs where user_id=$1 and id='import-1'",[b])).ref,'INV-2609-001');
 assert.equal((await one("select data->>'name' name from cashflow_jobs where user_id=$1 and id='import-1'",[a])).name,'Another account');
 // A batch that fails part-way (a stale version at the end) leaves none of its new rows.
 assert.equal((await one('select cashflow_apply_changes($1,$2) ok',[b,JSON.stringify([row('import-3','Monthly Social Content'),{table:'cashflow_jobs',id:'import-1',op:'delete',version:99}])])).ok,false);
 assert.equal((await one("select count(*)::int n from cashflow_jobs where user_id=$1 and id='import-3'",[b])).n,0);
});
test('reset attempts cannot lose increments; valid codes can be consumed only once',async()=>{
 await db.query("insert into cashflow_challenges values($1,'reset','right',now()+interval '15 minutes',0)",[a]);
 await Promise.all(Array.from({length:20},()=>db.query("select cashflow_consume_challenge($1,'reset','wrong') ok",[a])));
 assert.equal((await one("select attempts from cashflow_challenges where user_id=$1 and purpose='reset'",[a])).attempts,5);
 assert.equal((await one("select cashflow_consume_challenge($1,'reset','right') ok",[a])).ok,false);
 await db.query("update cashflow_challenges set attempts=0 where user_id=$1",[a]);
 const calls=await Promise.all(Array.from({length:10},()=>one("select cashflow_consume_challenge($1,'reset','right') ok",[a])));
 assert.equal(calls.filter(x=>x.ok).length,1);
});
test('database rate limiting and LINE claim enforce limits and one-time ownership',async()=>{
 const calls=await Promise.all(Array.from({length:20},()=>one("select cashflow_rate_limit('test-limit',5,900) ok")));
 assert.equal(calls.filter(x=>x.ok).length,5);
 await db.query("insert into cashflow_challenges values($1,'link','linkhash',now()+interval '15 minutes',0)",[b]);
 assert.equal((await one("select cashflow_claim_line('linkhash','LINE-B') ok")).ok,true);
 assert.equal((await one("select cashflow_claim_line('linkhash','LINE-C') ok")).ok,false);
});
test('payment replay, multiple event IDs and refund-before-payment are idempotent',async()=>{
 const paid=new Date(Date.now()-86400000).toISOString();
 const apply=(event:string,payment:string,refund=false)=>db.query('select cashflow_process_payment($1,$2,$3,14900,\'thb\',$4,$5)',[event,payment,b,paid,refund]);
 await apply('evt-1','pi-1');const first=await one('select current_period_end from subscriptions where user_id=$1',[b]);
 await apply('evt-1','pi-1');await apply('evt-2','pi-1');
 assert.deepEqual((await one('select current_period_end from subscriptions where user_id=$1',[b])).current_period_end,first.current_period_end);
 await apply('evt-refund','pi-1',true);assert.equal((await one('select status from subscriptions where user_id=$1',[b])).status,'canceled');
 await apply('evt-pre-refund','pi-2',true);await apply('evt-late-payment','pi-2');
 assert.equal((await one('select status from subscriptions where user_id=$1',[b])).status,'canceled');
});
test('Stripe subscription events are idempotent, paid-invoice gated, workspace bound and preserve an admin revocation',async()=>{
 const period=new Date(Date.now()+30*86400000).toISOString();
 const periodStart=new Date(Date.now()).toISOString();
 const discountEnd=new Date(Date.now()+90*86400000).toISOString();
 const created=Math.floor(Date.now()/1000)-10;
 await db.query("update subscriptions set stripe_customer_id='cus-pro',stripe_livemode=false where user_id=$1",[b]);
 // This test targets event ordering/state, so seed the offer provenance that a
 // validated Checkout event establishes in production.
 await db.query("insert into cashflow_stripe_offer_windows(subscription_id,user_id,offer_version,discount_start,discount_end) values('sub-pro',$1,'pro_intro_199x3_then_249_v1',$2,$3)",[b,periodStart,discountEnd]);
 const apply=(event:string,status='active',kind='subscription',paid:string|null=null,workspace=b)=>one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,false,false,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,$14,$15,$16,null,null,$17,$18,$19,$20,$21,$22,$23) ok',
  [event,kind==='invoice'?'invoice.paid':'customer.subscription.updated',created,kind,kind==='invoice'?'in-pro':'sub-pro',b,workspace,'cus-pro','sub-pro',created-100,'price-pro',status,period,paid,paid?'paid':null,Boolean(paid),paid?periodStart:null,paid?period:null,paid?'subscription_create':null,paid?'pro_intro_199x3_then_249_v1':null,Boolean(paid),paid?periodStart:null,paid?discountEnd:null],
 );
 assert.equal((await apply('evt-sub-1')).ok,'applied');
 assert.equal((await apply('evt-sub-1')).ok,'duplicate');
 assert.equal((await one('select current_period_end from subscriptions where user_id=$1',[b])).current_period_end,null);
 assert.equal((await apply('evt-invoice-1','active','invoice',period)).ok,'applied');
 let row=await one('select status,plan,workspace_type,workspace_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,current_period_end from subscriptions where user_id=$1',[b]);
 assert.equal(row.status,'active');assert.equal(row.plan,'pro_monthly');assert.equal(row.workspace_type,'personal');assert.equal(row.workspace_id,b);assert.equal(row.stripe_customer_id,'cus-pro');assert.equal(row.stripe_subscription_id,'sub-pro');assert.equal(row.stripe_price_id,'price-pro');assert.ok(row.current_period_end);
 await db.query("update subscriptions set plan='admin_revoked' where user_id=$1",[b]);
 await apply('evt-sub-2','canceled');
 row=await one('select status,plan from subscriptions where user_id=$1',[b]);assert.equal(row.status,'canceled');assert.equal(row.plan,'admin_revoked');
 await assert.rejects(apply('evt-bad','active','subscription',null,a),/invalid_workspace/);
});
test('intro offer pins its Stripe discount window across failed and out-of-order cycles',async()=>{
 await db.query("insert into subscriptions(user_id,status,stripe_customer_id,stripe_livemode) values($1,'inactive','cus-intro',false)",[d]);
 const starts=[0,31,59,90,120].map(days=>new Date(Date.UTC(2026,0,1)+days*86400000).toISOString());
 const discountStart=starts[0],discountEnd=starts[3];
 let created=1_800_000_000;
 await db.query(`update subscriptions set
   stripe_checkout_reservation_id='reservation-intro',stripe_checkout_session_id='cs-intro',
   stripe_checkout_expires_at=now()+interval '45 minutes',stripe_checkout_pending_until=now()+interval '50 minutes',
   stripe_checkout_intro_eligible=true,stripe_checkout_request='{}'::jsonb where user_id=$1`,[d]);
 assert.equal((await one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) result',
  ['evt-intro-checkout','checkout.session.completed',created++,false,false,'checkout','cs-intro',d,d,'cus-intro','sub-intro',
   1_700_000_000,'price-pro','active',starts[1],false,null,null,false,'cs-intro','reservation-intro',null,null,null,
   'pro_intro_199x3_then_249_v1',true,null,null],
 )).result,'applied');
 const apply=(event:string,invoice:string,cycle:number,intro:boolean,reason:'subscription_create'|'subscription_cycle'='subscription_cycle',sub='sub-intro',offer='pro_intro_199x3_then_249_v1')=>one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28) result',
  [event,'invoice.paid',created++,false,false,'invoice',invoice,d,d,'cus-intro',sub,1_700_000_000,
   'price-pro','active',starts[cycle+1],false,starts[cycle+1],'paid',intro,null,null,starts[cycle],starts[cycle+1],
   reason,offer,intro,intro?discountStart:null,intro?discountEnd:null],
 );
 assert.equal((await apply('evt-intro-1','in-intro-1',0,true,'subscription_create')).result,'applied');
 await assert.rejects(apply('evt-intro-offer-mutation','in-intro-2-mutated',1,false,'subscription_cycle','sub-intro','standard_249_v1'),/subscription_offer_version_changed/);
 await assert.rejects(apply('evt-intro-early-full','in-intro-2-bad',1,false),/unexpected_intro_discount_cycle/);
 // A failed/unpaid second cycle does not shift Stripe's three-calendar-period
 // coupon window. Cycle three still receives the intro price.
 assert.equal((await apply('evt-intro-3','in-intro-3',2,true)).result,'applied');
 // A late, out-of-order paid retry for cycle two remains valid inside the
 // immutable original window and cannot change its bounds.
 assert.equal((await apply('evt-intro-2','in-intro-2',1,true)).result,'applied');
 await assert.rejects(apply('evt-intro-late-discount','in-intro-4-bad',3,true),/unexpected_intro_discount_cycle/);
 assert.equal((await apply('evt-intro-4','in-intro-4',3,false)).result,'applied');
 const window=await one("select offer_version,discount_start,discount_end from cashflow_stripe_offer_windows where subscription_id='sub-intro'");
 assert.equal(window.offer_version,'pro_intro_199x3_then_249_v1');
 assert.equal(new Date(window.discount_start).getTime(),new Date(discountStart).getTime());
 assert.equal(new Date(window.discount_end).getTime(),new Date(discountEnd).getTime());
 await db.query(`update subscriptions set
   stripe_checkout_reservation_id='reservation-second',stripe_checkout_session_id='cs-second',
   stripe_checkout_expires_at=now()+interval '45 minutes',stripe_checkout_pending_until=now()+interval '50 minutes',
   stripe_checkout_intro_eligible=false,stripe_checkout_request='{}'::jsonb where user_id=$1`,[d]);
 await assert.rejects(one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)',
  ['evt-second-intro','checkout.session.completed',created++,false,false,'checkout','cs-second',d,d,'cus-intro',
   'sub-second-intro',1_700_000_001,'price-pro','active',starts[1],false,null,null,false,'cs-second','reservation-second',
   null,null,null,'pro_intro_199x3_then_249_v1',true,null,null],
 ),/checkout_offer_reservation_mismatch/);
});
test('Stripe checkout reservation prevents overlap and closure claim blocks webhook persistence',async()=>{
 const expires=new Date(Date.now()+45*60_000).toISOString();
 const pending=new Date(Date.now()+50*60_000).toISOString();
 let result=(await one('select cashflow_reserve_subscription_checkout($1,$2,$3,$4,false) result',[c,'reservation-1',expires,pending])).result;
 assert.equal(result.result,'reserved');assert.equal(result.intro_eligible,true);
 const firstRequest={mode:'subscription',customer:'cus-reserved',expires_at:Math.floor(new Date(expires).getTime()/1000)};
 await db.query("update subscriptions set stripe_customer_id='cus-reserved' where user_id=$1",[c]);
 assert.deepEqual((await one('select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb) request',[c,'reservation-1',JSON.stringify(firstRequest)])).request,firstRequest);
 const laterExpires=new Date(Date.now()+46*60_000).toISOString();
 const laterPending=new Date(Date.now()+51*60_000).toISOString();
 result=(await one('select cashflow_reserve_subscription_checkout($1,$2,$3,$4,false) result',[c,'reservation-2',laterExpires,laterPending])).result;
 assert.equal(result.result,'resumed');assert.equal(result.reservation_id,'reservation-1');
 assert.equal(new Date(result.expires_at).getTime(),new Date(expires).getTime());
 assert.deepEqual((await one('select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb) request',[c,'reservation-1',JSON.stringify({...firstRequest,mode:'payment'})])).request,firstRequest);
 assert.equal((await one('select cashflow_begin_billing_closure($1) ok',[c])).ok,false);
 await db.query('select cashflow_release_subscription_checkout($1,$2)',[c,'reservation-1']);
 await db.query("update subscriptions set stripe_entitled_until=now()+interval '5 days',stripe_subscription_id='sub-old',stripe_subscription_status='canceled' where user_id=$1",[c]);
 result=(await one('select cashflow_reserve_subscription_checkout($1,$2,$3,$4,false) result',[c,'reservation-2',expires,pending])).result;
 assert.equal(result.result,'recurring_access');
 await db.query("update subscriptions set stripe_entitled_until=null,stripe_subscription_id=null,stripe_subscription_status=null where user_id=$1",[c]);
 assert.equal((await one('select cashflow_begin_billing_closure($1) ok',[c])).ok,true);
 const period=new Date(Date.now()+30*86400000).toISOString();
 await assert.rejects(one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,false,false,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,null,null,false,null,null,null,null,null,null,false,null,null)',
  ['evt-closure','customer.subscription.created',Math.floor(Date.now()/1000),'subscription','sub-closure',c,c,'cus-closure','sub-closure',1,'price-pro','active',period],
 ),/billing_closure_in_progress/);
 assert.equal((await one("select count(*)::int n from cashflow_stripe_events where event_id='evt-closure'")).n,0);
 await db.query('update subscriptions set billing_closure_pending_until=null where user_id=$1',[c]);
});
test('PromptPay cycles share the account promotion ledger, stay idempotent, and require manual renewal',async()=>{
 const user='66666666-6666-4666-8666-666666666666';
 await db.query("insert into auth.users(id,email) values($1,'promptpay@example.com')",[user]);
 const reserve=async(id:string,method:'card'|'promptpay')=>one(
  'select cashflow_reserve_billing_checkout($1,$2,$3,$4,$5,false) result',
  [user,id,method,new Date(Date.now()+31*60_000).toISOString(),new Date(Date.now()+36*60_000).toISOString()],
 );
 const first=(await reserve('qr-reservation-1','promptpay')).result;
 assert.equal(first.result,'reserved');assert.equal(first.method,'promptpay');assert.equal(first.intro_cycles_remaining,3);
 await db.query("update subscriptions set stripe_customer_id='cus-qr' where user_id=$1",[user]);
 await db.query('select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb)',[user,'qr-reservation-1',JSON.stringify({mode:'payment'})]);
 assert.equal((await one('select cashflow_attach_billing_checkout($1,$2,$3,$4) ok',[user,'qr-reservation-1','cs-qr-1','https://checkout.stripe.com/c/pay/cs-qr-1'])).ok,true);
 // A monthly PromptPay purchase on January 31 clamps to the last valid day of
 // February instead of silently becoming a fixed 30-day entitlement.
 const paid='2028-01-31T12:00:00.000Z';
 const apply=async(event:string,reservation:string,session:string,payment:string,cycle:number,refund=false)=>one(
  'select cashflow_apply_promptpay_event($1,$2,$3,false,false,$4,$5,$6,$7,$8,$9,\'thb\',$10,$11,$12) result',
  [event,refund?'charge.refunded':'checkout.session.completed',Math.floor(Date.now()/1000),user,'cus-qr',reservation,session,payment,cycle<=3?19900:24900,paid,cycle,refund],
 );
 assert.equal((await apply('evt-qr-1','qr-reservation-1','cs-qr-1','pi-qr-1',1)).result,'applied');
 assert.equal((await apply('evt-qr-1','qr-reservation-1','cs-qr-1','pi-qr-1',1)).result,'duplicate');
 let row=await one('select stripe_intro_paid_cycles,promptpay_entitled_until,status from subscriptions where user_id=$1',[user]);
 assert.equal(row.stripe_intro_paid_cycles,1);assert.equal(row.status,'active');
 assert.equal(new Date(row.promptpay_entitled_until).toISOString(),'2028-02-29T12:00:00.000Z');
 assert.equal((await reserve('qr-too-soon','promptpay')).result.result,'recurring_access');
 await db.query("update subscriptions set promptpay_entitled_until=now()-interval '1 minute' where user_id=$1",[user]);
 const second=(await reserve('qr-reservation-2','promptpay')).result;
 assert.equal(second.intro_cycles_remaining,2);
 await db.query('select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb)',[user,'qr-reservation-2',JSON.stringify({mode:'payment'})]);
 await db.query('select cashflow_attach_billing_checkout($1,$2,$3,$4)',[user,'qr-reservation-2','cs-qr-2','https://checkout.stripe.com/c/pay/cs-qr-2']);
 assert.equal((await apply('evt-qr-2','qr-reservation-2','cs-qr-2','pi-qr-2',2)).result,'applied');
 await db.query("update subscriptions set promptpay_entitled_until=now()-interval '1 minute' where user_id=$1",[user]);
 const card=(await reserve('card-after-qr','card')).result;
 assert.equal(card.intro_cycles_remaining,1);assert.equal(card.method,'card');
 await db.query('select cashflow_release_billing_checkout($1,$2)',[user,'card-after-qr']);
 assert.equal((await apply('evt-qr-refund','qr-reservation-1','cs-qr-1','pi-qr-1',1,true)).result,'refunded');
 row=await one('select stripe_intro_paid_cycles,promptpay_entitled_until from subscriptions where user_id=$1',[user]);
 assert.equal(row.stripe_intro_paid_cycles,2);assert.ok(row.promptpay_entitled_until);
});
test('signed PromptPay webhook validates canonical Stripe data and grants one idempotent calendar month through the real RPC',async()=>{
 const promptpayUser='77777777-7777-4777-8777-777777777777';
 const reservation='integration-reservation';
 const sessionId='cs_test_promptpay_integration';
 const customerId='cus_promptpay_integration';
 const paymentIntentId='pi_promptpay_integration';
 const eventId='evt_promptpay_integration';
 const created=Math.floor(Date.now()/1000);
 process.env.APP_URL='http://127.0.0.1:3000';
 process.env.SUPABASE_URL='https://promptpay-integration.supabase.co';
 process.env.SUPABASE_PUBLISHABLE_KEY='test-publishable-key';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role-key';
 process.env.SESSION_SECRET='test-only-session-secret-'.repeat(3);
 process.env.STRIPE_SECRET_KEY='sk_test_only';
 process.env.STRIPE_MODE='test';
 process.env.STRIPE_WEBHOOK_SECRET='whsec_promptpay_integration';
 process.env.STRIPE_PRO_PRICE_ID='price_test_pro';
 process.env.STRIPE_PRO_INTRO_COUPON_ID='coupon_test_intro';
 process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID='bpc_test_safe';
 await db.query("insert into auth.users(id,email) values($1,'promptpay-integration@example.com')",[promptpayUser]);
 const expires=new Date(Date.now()+30*60_000).toISOString();
 const pending=new Date(Date.now()+35*60_000).toISOString();
 assert.equal((await one(
  'select cashflow_reserve_billing_checkout($1,$2,\'promptpay\',$3,$4,false) result',
  [promptpayUser,reservation,expires,pending],
 )).result.result,'reserved');
 await db.query('update subscriptions set stripe_customer_id=$2 where user_id=$1',[promptpayUser,customerId]);
 const { buildPromptPayCheckoutRequest,PRO_INTRO_TOTAL }=await import('../backend/src/services/stripeSubscriptions.js');
 const request=buildPromptPayCheckoutRequest({
  userId:promptpayUser,customerId,reservationId:reservation,introCycle:1,
  expiresAt:Math.floor(new Date(expires).getTime()/1000),origin:'https://cash-squirrel.example',
 });
 await db.query('select cashflow_prepare_subscription_checkout($1,$2,$3::jsonb)',[promptpayUser,reservation,JSON.stringify(request)]);
 assert.equal((await one(
  'select cashflow_attach_billing_checkout($1,$2,$3,$4) ok',
  [promptpayUser,reservation,sessionId,`https://checkout.stripe.com/c/pay/${sessionId}`],
 )).ok,true);

 const charge={
  id:'ch_promptpay_integration',object:'charge',status:'succeeded',paid:true,refunded:false,
  amount_refunded:0,amount:PRO_INTRO_TOTAL,currency:'thb',customer:customerId,
  payment_intent:paymentIntentId,created,
 } as unknown as Stripe.Charge;
 const paymentIntent={
  id:paymentIntentId,object:'payment_intent',livemode:false,status:'succeeded',customer:customerId,
  currency:'thb',amount:PRO_INTRO_TOTAL,amount_received:PRO_INTRO_TOTAL,amount_capturable:0,
  payment_method_types:['promptpay'],payment_method:{id:'pm_promptpay_integration',object:'payment_method',type:'promptpay'},
  latest_charge:charge,metadata:request.payment_intent_data?.metadata,
 } as unknown as Stripe.PaymentIntent;
 const lineItem={
  id:'li_promptpay_integration',object:'item',quantity:1,currency:'thb',
  amount_subtotal:PRO_INTRO_TOTAL,amount_total:PRO_INTRO_TOTAL,
  price:{active:true,type:'one_time',currency:'thb',unit_amount:PRO_INTRO_TOTAL,recurring:null},
 } as unknown as Stripe.LineItem;
 const session={
  id:sessionId,object:'checkout.session',created,livemode:false,mode:'payment',status:'complete',
  payment_status:'paid',client_reference_id:promptpayUser,customer:customerId,currency:'thb',
  amount_total:PRO_INTRO_TOTAL,payment_intent:paymentIntent,metadata:request.metadata,
  line_items:{object:'list',data:[lineItem],has_more:false,url:`/v1/checkout/sessions/${sessionId}/line_items`},
 } as unknown as Stripe.Checkout.Session;

 const realFetch=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  if(!url.startsWith('https://promptpay-integration.supabase.co/')) return realFetch(input,init);
  if(url.includes('/rpc/cashflow_rate_limit')) return json(true);
  if(url.includes('/rpc/cashflow_apply_promptpay_event')) {
   const body=JSON.parse(String(init?.body));
   try {
    const result=await one(
     'select cashflow_apply_promptpay_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::smallint,$15) result',
     [body.p_event_id,body.p_event_type,body.p_event_created,body.p_event_livemode,body.p_expected_livemode,
      body.p_user_id,body.p_customer_id,body.p_reservation_id,body.p_session_id,body.p_payment_intent_id,
      body.p_amount,body.p_currency,body.p_paid_at,body.p_intro_cycle,body.p_refund],
    );
    return json(result.result);
   } catch(error) {
    return json({message:error instanceof Error?error.message:'RPC failure',code:'P0001'},400);
   }
  }
  throw new Error(`Unexpected integration endpoint: ${url}`);
 };
 let server:Server|undefined;
 const { stripe:stripeClient }=await import('../backend/src/config/stripe.js');
 const sessions=stripeClient.checkout.sessions as unknown as {retrieve:(id:string,options?:unknown)=>Promise<Stripe.Checkout.Session>};
 const retrieve=sessions.retrieve;
 sessions.retrieve=async(id)=>{assert.equal(id,sessionId);return session;};
 try {
  const { createApp }=await import('../backend/src/http/app.js');
  server=await new Promise<Server>(resolve=>{const instance=createApp().listen(0,'127.0.0.1',()=>resolve(instance));});
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const raw=JSON.stringify({
   id:eventId,object:'event',created,livemode:false,type:'checkout.session.completed',
   data:{object:{id:sessionId,object:'checkout.session'}},
  });
  const signature=Stripe.webhooks.generateTestHeaderString({payload:raw,secret:process.env.STRIPE_WEBHOOK_SECRET});
  const deliver=()=>realFetch(`${origin}/api/stripe-webhook`,{
   method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:raw,
  });
  const applied=await deliver();assert.equal(applied.status,200);assert.equal((await applied.json() as {result:string}).result,'applied');
  const duplicate=await deliver();assert.equal(duplicate.status,200);assert.equal((await duplicate.json() as {result:string}).result,'duplicate');
  const subscription=await one(
   `select s.status,s.stripe_intro_paid_cycles,s.promptpay_entitled_until,s.stripe_checkout_reservation_id,
      p.entitled_until=p.paid_at+interval '1 month' calendar_month_ok
    from subscriptions s join cashflow_promptpay_payments p on p.user_id=s.user_id where s.user_id=$1`,
   [promptpayUser],
  );
  assert.equal(subscription.status,'active');assert.equal(subscription.stripe_intro_paid_cycles,1);
  assert.equal(subscription.stripe_checkout_reservation_id,null);
  assert.ok(subscription.promptpay_entitled_until);assert.equal(subscription.calendar_month_ok,true);
  assert.equal((await one('select count(*)::int n from cashflow_promptpay_events where event_id=$1',[eventId])).n,1);
  assert.equal((await one('select count(*)::int n from cashflow_promptpay_payments where payment_intent_id=$1',[paymentIntentId])).n,1);
  assert.equal((await one("select count(*)::int n from cashflow_billing_paid_cycles where source_type='promptpay' and source_id=$1",[paymentIntentId])).n,1);
 } finally {
  sessions.retrieve=retrieve;
  globalThis.fetch=realFetch;
  if(server) await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
 }
});
test('same-second Stripe events reconcile only through the latest serialized event token',async()=>{
 const period=new Date(Date.now()+30*86400000).toISOString();
 const created=Math.floor(Date.now()/1000);
 await db.query("update subscriptions set stripe_customer_id='cus-cas',stripe_livemode=false where user_id=$1",[c]);
 const apply=(event:string,status:string)=>one(
  'select cashflow_apply_stripe_subscription_event($1,$2,$3,false,false,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,null,null,false,null,null,null,null,null,null,false,null,null) result',
  [event,'customer.subscription.updated',created,'subscription','sub-cas',c,c,'cus-cas','sub-cas',created-100,'price-pro',status,period],
 );
 assert.equal((await apply('evt-cas-old','active')).result,'applied');
 assert.equal((await apply('evt-cas-new','canceled')).result,'stale');
 const reconcile=(event:string,status:string)=>one(
  'select cashflow_reconcile_stripe_subscription_state($1,$2,$3,$4,$5,$6,$7,false,$8,$9,false) result',
  [event,c,c,'cus-cas','sub-cas',created-100,'price-pro',status,period],
 );
 assert.equal((await reconcile('evt-cas-new','canceled')).result,'reconciled');
 assert.equal((await reconcile('evt-cas-old','active')).result,'superseded');
 const row=await one('select stripe_subscription_status,stripe_subscription_reconcile_token from subscriptions where user_id=$1',[c]);
 assert.equal(row.stripe_subscription_status,'canceled');assert.equal(row.stripe_subscription_reconcile_token,null);
});
test('session checks reject missing, revoked and different-owner sessions',async()=>{
 const sid='33333333-3333-4333-8333-333333333333';await db.query('insert into auth.sessions values($1,$2)',[sid,a]);
 assert.equal((await one('select cashflow_session_active($1,$2) ok',[a,sid])).ok,true);
 assert.equal((await one('select cashflow_session_active($1,$2) ok',[b,sid])).ok,false);
 await db.query('insert into cashflow_revoked_sessions(session_id,user_id)values($1,$2)',[sid,a]);
 assert.equal((await one('select cashflow_session_active($1,$2) ok',[a,sid])).ok,false);
});

test('webhook lease deduplicates processed events and allows retry after an expired lease',async()=>{
 assert.equal((await one("select cashflow_claim_webhook('line-1') result")).result,'claimed');
 assert.equal((await one("select cashflow_claim_webhook('line-1') result")).result,'busy');
 await db.exec("update cashflow_webhook_events set lease_until=now()-interval '1 second' where key='line-1'");
 assert.equal((await one("select cashflow_claim_webhook('line-1') result")).result,'claimed');
 await db.exec("update cashflow_webhook_events set status='done' where key='line-1'");
 assert.equal((await one("select cashflow_claim_webhook('line-1') result")).result,'done');
});

test('shared finance never reads, moves or modifies the creator personal records',async()=>{
 const group='77777777-7777-4777-8777-777777777777';
 await db.query('select cashflow_group_mutate($1,\'create\',$2::jsonb)',[a,JSON.stringify({groupId:group,name:'Finance test',description:''})]);
 const before=await one('select jobs,settings,notif_settings from cashflow_account_snapshot where user_id=$1',[a]);
 const empty=(await one('select cashflow_group_finance_snapshot($1,$2) result',[a,group])).result;
 assert.deepEqual(empty.snapshot.jobs,[]);assert.equal(empty.snapshot.settings,null);assert.deepEqual(empty.snapshot.notif_settings,{});
 await db.query('select cashflow_group_finance_apply($1,$2,$3::jsonb)',[a,group,JSON.stringify([{table:'cashflow_jobs',id:'legacy-job',op:'set',version:null,data:{id:'legacy-job',name:'Group job',value:999}},{table:'cashflow_documents',id:'settings',op:'set',version:null,data:{monthlyExpense:555}}])]);
 const after=await one('select jobs,settings,notif_settings from cashflow_account_snapshot where user_id=$1',[a]);assert.deepEqual(after,before);
 const shared=(await one('select cashflow_group_finance_snapshot($1,$2) result',[a,group])).result;
 assert.equal(shared.snapshot.jobs[0].name,'Group job');assert.equal(shared.snapshot.settings.monthlyExpense,555);
 await db.query('select cashflow_group_mutate($1,\'delete\',$2::jsonb)',[a,JSON.stringify({groupId:group})]);
 assert.deepEqual(await one('select jobs,settings,notif_settings from cashflow_account_snapshot where user_id=$1',[a]),before);
});

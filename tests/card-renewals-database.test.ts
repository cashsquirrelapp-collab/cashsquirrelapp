import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ACCEPTED_CARD_CONSENT_VERSIONS, CARD_CONSENT_VERSION } from '../shared/cardConsent.js';
const uid='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const paidStart=new Date(Date.now()-5000).toISOString();
const annualEnd=new Date(paidStart); annualEnd.setUTCFullYear(annualEnd.getUTCFullYear()+1);
const paidEnd=annualEnd.toISOString();
const createdBefore=new Date(Date.now()-60000).toISOString();
async function database(legacy=false) {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${uid}'),('${actor}');
    create table cashflow_user_roles(user_id uuid primary key,role text); insert into cashflow_user_roles values('${uid}','user'),('${actor}','admin');
    create table subscriptions(user_id uuid primary key,stripe_customer_id text,stripe_subscription_id text,status text,plan text,current_period_end timestamptz,updated_at timestamptz default now());
    create table cashflow_account_pauses(user_id uuid primary key);
    create table cashflow_payment_events(event_id text primary key,created_at timestamptz);
    create table cashflow_payments(payment_id text primary key,user_id uuid,amount bigint,currency text,paid_at timestamptz,refunded boolean);`);
  for(const name of ['020_stripe_subscriptions.sql','021_secure_stripe_billing_upgrade.sql','022_fix_stripe_checkout_null_legacy.sql','023_preserve_manual_subscription_entitlements.sql','024_promptpay_qr_billing.sql'])
    await db.exec(await readFile(`database/migrations/${name}`,'utf8'));
  await db.exec(await readFile('supabase/migrations/20261020144448_krarok_prepaid_plans.sql','utf8'));
  if(legacy) await db.exec(`insert into subscriptions(user_id,status,plan) values('${uid}','canceled','admin_revoked')`);
  await db.exec(await readFile('supabase/migrations/20261020155537_admin_pro_controls.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261020165518_direct_promptpay.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261020172734_custom_card_renewals.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261022040000_card_consent_v2.sql','utf8'));
  await db.exec('grant usage on schema public to service_role; grant select on cashflow_user_roles,cashflow_account_pauses to service_role; grant select,insert,update on subscriptions to service_role;');
  return db;
}

async function prepared(db:PGlite,auto=true,consentVersion=CARD_CONSENT_VERSION) {
  await db.query(`select cashflow_reserve_prepaid_checkout($1,'order','year','card','price1',false)`,[uid]);
  await db.query(`select cashflow_bind_stripe_customer($1,'order','cus1',false)`,[uid]);
  const metadata={period:'year',months:'12',checkout_reservation_id:'order',auto_renew:String(auto),save_card:'true',consent_version:consentVersion,payment_flow:'custom_card',consent_text:'Explicit customer consent for 1490 baht every twelve months'};
  await db.query(`select cashflow_prepare_prepaid_checkout('order',$1,'cus1',$2)`,[uid,JSON.stringify({mode:auto?'subscription':'payment',customer:'cus1',client_reference_id:uid,metadata,subscription_data:{metadata},line_items:[{price:'price1',quantity:1}]})]);
}
const sync=(db:PGlite,status='active',cancel=false)=>db.query(`select cashflow_sync_card_subscription('order',$1,'sub_card','cus1',false,$2,extract(epoch from now())::bigint,$3,now()+interval '12 months')`,[uid,status,cancel]);
async function cycle(db:PGlite,refund=false,changes:Record<string,any>={}) {
 const a={user:uid,sub:'sub_card',invoice:'in_card',payment:'pi_card',amount:149000,currency:'thb',mode:false,start:paidStart,end:paidEnd,refund,...changes};
 return db.query(`select cashflow_record_card_cycle('order',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,Object.values(a));
}
const state=async(db:PGlite)=>(await db.query<any>('select * from subscriptions where user_id=$1',[uid])).rows[0];
// The database must accept the wording the app shows now, and keep accepting renewals agreed under earlier
// wordings (2026-10-22: the app moved to v2 while the database still accepted only v1, so card renewals failed).
for (const version of ACCEPTED_CARD_CONSENT_VERSIONS) {
  test(`a card renewal agreed under ${version} is prepared and recorded`,async()=>{
   const db=await database();try {
    await prepared(db,true,version);await sync(db);
    assert.equal((await state(db)).stripe_subscription_id,'sub_card');
   }finally{await db.close();}
  });
}
test('the app\'s current consent wording is one the database accepts',()=>{
 assert.ok(ACCEPTED_CARD_CONSENT_VERSIONS.includes(CARD_CONSENT_VERSION));
});
test('a card renewal with an unknown consent wording is refused',async()=>{
 const db=await database();try {
  await assert.rejects(prepared(db,true,'krarok-card-20991231-v9'),/order_request_mismatch/);
 }finally{await db.close();}
});
test('SQL never turns saved-only consent into a subscription; roles cannot forge recurring rights',async()=>{
 const db=await database();try {
  await prepared(db,false); await assert.rejects(sync(db));
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`); await assert.rejects(db.query('select * from cashflow_card_cycles'));
   await assert.rejects(sync(db)); await db.exec('reset role');
  }
 }finally{await db.close();}
});
test('paid recurring invoice grants exactly its period once; failure and cancellation preserve paid access; refund is terminal',async()=>{
 const db=await database();try {
  await prepared(db);await sync(db); assert.notEqual((await state(db)).status,'active');
  await db.query('update cashflow_prepaid_orders set created_at=$1',[createdBefore]);
  for(const mismatch of [{amount:15900},{currency:'usd'},{user:actor},{mode:true},{sub:'sub_other'},{end:'2030-10-20T00:00:00Z'}]) await assert.rejects(cycle(db,false,mismatch));
  await cycle(db);await cycle(db);let s=await state(db);
  assert.equal(s.current_period_end.toISOString(),paidEnd);assert.equal(s.status,'active');
  assert.equal((await db.query<any>('select count(*) n from cashflow_card_cycles')).rows[0].n,1);
  await sync(db,'past_due');assert.equal((await state(db)).current_period_end.toISOString(),s.current_period_end.toISOString());
  await sync(db,'active',true);assert.equal((await state(db)).cancel_at_period_end,true);
  await sync(db,'canceled',true);await sync(db,'active',false);assert.equal((await state(db)).stripe_subscription_status,'canceled');
  await cycle(db,true);await cycle(db,false);assert.equal((await state(db)).current_period_end,null);
 }finally{await db.close();}
});
test('admin ban/revoke require stopping the subscription, then stale invoices cannot restore removed Pro',async()=>{
 const db=await database();try {
  await prepared(db);await sync(db);await db.query('update cashflow_prepaid_orders set created_at=$1',[createdBefore]);await cycle(db);
  const action=async(op:string)=>(await db.query<any>('select cashflow_admin_pro_action($1,$2,$3) r',[actor,uid,op])).rows[0].r.result;
  assert.equal(await action('ban'),'subscription_open');
  await sync(db,'canceled',true);assert.equal(await action('revoke'),'ok');
  await cycle(db);assert.equal((await state(db)).current_period_end,null);
  const r=(await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'new','month','card','price2',false) r`,[uid])).rows[0].r;
  assert.equal(r.result,'reserved');
 }finally{await db.close();}
});

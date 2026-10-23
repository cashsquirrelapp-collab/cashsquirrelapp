import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const uid='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
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
  await db.exec('grant usage on schema public to service_role; grant select on cashflow_user_roles,cashflow_account_pauses to service_role; grant select,insert,update on subscriptions to service_role;');
  return db;
}
async function action(db:PGlite,op:string,by=actor) {
  return (await db.query<any>('select cashflow_admin_pro_action($1,$2,$3) r',[by,uid,op])).rows[0].r.result;
}
async function reserve(db:PGlite,id:string) {
  return (await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,$2,'month','card','price1',false) r`,[uid,id])).rows[0].r;
}
async function prepare(db:PGlite,id:string) {
  assert.equal((await reserve(db,id)).result,'reserved');
  await db.query(`select cashflow_bind_stripe_customer($1,$2,'cus1',false)`,[uid,id]);
  await db.query(`select cashflow_prepare_prepaid_checkout($1,$2,'cus1',$3)`,[id,uid,JSON.stringify({mode:'payment',customer:'cus1',client_reference_id:uid,
    metadata:{period:'month',months:'1',checkout_reservation_id:id},line_items:[{price:'price1',quantity:1}]})]);
}
async function pay(db:PGlite,id:string,paid:string,refund=false) {
  return db.query(`select cashflow_fulfill_prepaid($1,$2,$3,'cus1',$4,false,15900,'thb','month',1::smallint,$5,$6)`,[id,uid,`cs_${id}`,`pi_${id}`,paid,refund]);
}
const state=async(db:PGlite)=>(await db.query<any>('select * from subscriptions where user_id=$1',[uid])).rows[0];
test('revoke permits repurchase; ban requires explicit unban; unban does not grant Pro',async()=>{
 const db=await database();try{
  await db.exec('set role service_role');
  assert.equal(await action(db,'grant'),'ok');assert.equal((await state(db)).status,'active');
  assert.equal(await action(db,'revoke'),'ok');assert.equal((await state(db)).plan,'admin_removed');
  assert.equal((await reserve(db,'new')).result,'reserved');
  await db.query('select cashflow_release_billing_checkout($1,$2)',[uid,'new']);
  assert.equal(await action(db,'ban'),'ok');
  assert.equal((await reserve(db,'blocked')).result,'admin_revoked');
  assert.equal(await action(db,'grant'),'banned');assert.equal(await action(db,'revoke'),'banned');
  assert.equal(await action(db,'unban'),'ok');assert.equal((await state(db)).status,'canceled');
  assert.equal((await reserve(db,'allowed')).result,'reserved');
  assert.equal((await db.query<any>('select count(*)::int n from cashflow_admin_pro_audit')).rows[0].n,4);
 }finally{await db.close();}
});
test('old paid/refund events cannot restore revoked access or extend a subsequent package',async()=>{
 const db=await database();try{
  await prepare(db,'old');const oldPaid=new Date().toISOString();await pay(db,'old',oldPaid);
  assert.equal((await state(db)).status,'active');
  await action(db,'revoke');await pay(db,'old',oldPaid);await db.query('select cashflow_refresh_effective_subscription($1)',[uid]);
  assert.equal((await state(db)).status,'canceled');assert.equal((await state(db)).prepaid_entitled_until,null);
  await prepare(db,'new');const newPaid=new Date().toISOString();await pay(db,'new',newPaid);
  assert.equal((await state(db)).plan,'pro_prepaid');assert.equal((await state(db)).status,'active');
  const end=(await state(db)).current_period_end.toISOString();
  await pay(db,'old',oldPaid,true);assert.equal((await state(db)).current_period_end.toISOString(),end);
  await pay(db,'new',newPaid,true);assert.equal((await state(db)).status,'canceled');
 }finally{await db.close();}
});
test('pending checkout, unknown outcomes and ongoing recurring billing block destructive admin changes',async()=>{
 const db=await database();try{
  await prepare(db,'pending');
  assert.equal(await action(db,'ban'),'checkout_pending');assert.equal(await action(db,'revoke'),'checkout_pending');
  await db.exec("update subscriptions set stripe_checkout_pending_until=now()-interval '1 minute',stripe_checkout_expires_at=now()-interval '6 minutes',stripe_checkout_session_id=null");
  assert.equal(await action(db,'ban'),'checkout_pending');
  await db.query(`select cashflow_finish_prepaid_checkout('pending',$1,'cs_pending','expired')`,[uid]);
  await db.exec("update subscriptions set stripe_subscription_id='sub1',stripe_subscription_status='active'");
  assert.equal(await action(db,'ban'),'subscription_open');
  await db.exec("update subscriptions set stripe_subscription_status='canceled'");
  assert.equal(await action(db,'ban'),'ok');
 }finally{await db.close();}
});
test('only admins may mutate; browser roles cannot execute actions or access audit; old revocations become repurchasable',async()=>{
 const db=await database(true);try{
  assert.equal((await state(db)).plan,'admin_removed');assert.equal((await reserve(db,'new')).result,'reserved');
  await assert.rejects(action(db,'ban',uid),/admin_required/);
  const row=(await db.query<any>(`select has_function_privilege('authenticated','cashflow_admin_pro_action(uuid,uuid,text)','EXECUTE') execute,
    has_table_privilege('anon','cashflow_admin_pro_audit','SELECT') read,
    has_table_privilege('authenticated','cashflow_admin_pro_audit','INSERT') write,
    (select relrowsecurity from pg_class where relname='cashflow_admin_pro_audit') rls`)).rows[0];
  assert.deepEqual(row,{execute:false,read:false,write:false,rls:true});
 }finally{await db.close();}
});

test('audit history does not prevent an account from being deleted',async()=>{
 const db=await database();try{
  await action(db,'grant');await db.query('delete from auth.users where id=$1',[actor]);
  assert.equal((await db.query<any>('select actor_id from cashflow_admin_pro_audit')).rows[0].actor_id,null);
 }finally{await db.close();}
});

test('direct QR fulfillment locks owner/amount/duration and stays compatible with revoke/ban and refunds',async()=>{
 const db=await database();try{
  await db.exec('set role service_role');
  const r=await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'qr','halfYear','promptpay','price_qr',false) r`,[uid]);
  assert.equal(r.rows[0].r.result,'reserved');
  await db.query(`select cashflow_bind_stripe_customer($1,'qr','cus1',false)`,[uid]);
  const request={amount:84900,currency:'thb',customer:'cus1',confirm:true,allowed_payment_method_types:['promptpay'],payment_method_data:{type:'promptpay',billing_details:{email:'test@example.test'}},metadata:{app_user_id:uid,payment_flow:'direct_promptpay',offer_version:'krarok_prepaid_20261020',price_id:'price_qr',period:'halfYear',months:'6',checkout_reservation_id:'qr'}};
  await assert.rejects(db.query(`select cashflow_prepare_direct_qr('qr',$1,'cus1',$2)`,[uid,JSON.stringify({...request,amount:15900})]));
  await db.query(`select cashflow_prepare_direct_qr('qr',$1,'cus1',$2)`,[uid,JSON.stringify(request)]);
  await db.exec("update subscriptions set stripe_checkout_pending_until=now()-interval '1 hour',stripe_checkout_expires_at=now()-interval '65 minutes'");
  assert.equal(await action(db,'ban'),'checkout_pending');
  assert.equal((await db.query<any>('select cashflow_begin_billing_closure($1) ok',[uid])).rows[0].ok,false);
  assert.equal((await reserve(db,'card')).result,'period_mismatch');
  await db.query(`select cashflow_attach_direct_qr('qr',$1,'pi_qr')`,[uid]);
  const paid=new Date().toISOString();
  const fulfill=(session:string|null=null,pi='pi_qr',amount=84900,months=6,refunded=false)=>db.query<any>(`select cashflow_fulfill_prepaid('qr',$1,$2,'cus1',$3,false,$4,'thb','halfYear',$5::smallint,$6,$7) r`,[uid,session,pi,amount,months,paid,refunded]);
  await assert.rejects(fulfill('cs_fake'));await assert.rejects(fulfill(null,'pi_other'));await assert.rejects(fulfill(null,'pi_qr',15900));await assert.rejects(fulfill(null,'pi_qr',84900,1));
  assert.equal((await fulfill()).rows[0].r,'paid');assert.equal((await fulfill()).rows[0].r,'duplicate');
  const order=(await db.query<any>("select * from cashflow_prepaid_orders where id='qr'")).rows[0];
  assert.equal(order.session_id,null);assert.equal(order.intent_id,'pi_qr');assert.equal((await state(db)).status,'active');
  const expected=(await db.query<any>("select (($1::timestamptz at time zone 'Asia/Bangkok')+interval '6 months') at time zone 'Asia/Bangkok' e",[paid])).rows[0].e;
  assert.equal(order.entitled_until.toISOString(),expected.toISOString());
  assert.equal(await action(db,'revoke'),'ok');await fulfill();assert.equal((await state(db)).plan,'admin_removed');
  assert.equal((await fulfill(null,'pi_qr',84900,6,true)).rows[0].r,'refunded');
  await fulfill();assert.equal((await state(db)).status,'canceled');
  assert.equal(await action(db,'ban'),'ok');assert.equal((await reserve(db,'blocked')).result,'admin_revoked');
  const permissions=(await db.query<any>(`select has_function_privilege('authenticated','cashflow_prepare_direct_qr(text,uuid,text,jsonb)','EXECUTE') prepare,has_function_privilege('anon','cashflow_finish_direct_qr(text,uuid,text)','EXECUTE') finish`)).rows[0];
  assert.deepEqual(permissions,{prepare:false,finish:false});
 }finally{await db.close();}
});

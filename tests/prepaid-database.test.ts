import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const uid='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
async function database() {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${uid}'),('${other}');
    create table subscriptions(user_id uuid primary key,stripe_customer_id text,stripe_subscription_id text,
      status text,plan text,current_period_end timestamptz,updated_at timestamptz default now());
    create table cashflow_account_pauses(user_id uuid primary key);
    create table cashflow_payment_events(event_id text primary key,created_at timestamptz);
    create table cashflow_payments(payment_id text primary key,user_id uuid,amount bigint,currency text,paid_at timestamptz,refunded boolean);`);
  for (const name of ['020_stripe_subscriptions.sql','021_secure_stripe_billing_upgrade.sql','022_fix_stripe_checkout_null_legacy.sql','023_preserve_manual_subscription_entitlements.sql','024_promptpay_qr_billing.sql'])
    await db.exec(await readFile(`database/migrations/${name}`,'utf8'));
  await db.exec(await readFile('supabase/migrations/20261020144448_krarok_prepaid_plans.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261020165518_direct_promptpay.sql','utf8'));
  await db.exec('grant usage on schema public to service_role; grant select,insert,update on subscriptions to service_role;');
  return db;
}
async function prepare(db:PGlite,period='month',method='card') {
  const r=await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'ord',$2,$3,'price1',false) r`,[uid,period,method]);
  assert.equal(r.rows[0].r.result,'reserved');
  await db.query(`select cashflow_bind_stripe_customer($1,'ord','cus1',false)`,[uid]);
  const o=(await db.query<any>("select * from cashflow_prepaid_orders where id='ord'")).rows[0];
  await db.query(`select cashflow_prepare_prepaid_checkout('ord',$1,'cus1',$2)`,[uid,JSON.stringify({mode:'payment',customer:'cus1',client_reference_id:uid,
    metadata:{period,months:String(o.months),checkout_reservation_id:'ord'},line_items:[{price:'price1',quantity:1}]})]);
  return o;
}
async function pay(db:PGlite,o:any,changes:Record<string,unknown>={}) {
  const a={user:uid,session:'cs1',customer:'cus1',payment:'pi1',mode:false,amount:Number(o.amount),currency:'thb',period:o.period,months:o.months,paid:new Date().toISOString(),refunded:false,...changes};
  return db.query<any>(`select cashflow_fulfill_prepaid('ord',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r`,Object.values(a));
}
test('SQL enforces amount+duration; duplicate delivery and refund-before-success are idempotent',async()=>{
  const db=await database();try {
    const o=await prepare(db,'halfYear','promptpay');
    for(const change of [{amount:15900},{months:12},{period:'year'},{user:other},{customer:'other'},{mode:true},{currency:'usd'}]) {
      await assert.rejects(pay(db,o,change));
      assert.equal((await db.query<any>("select status from cashflow_prepaid_orders where id='ord'")).rows[0].status,'reserved');
    }
    const paid=new Date().toISOString();
    assert.equal((await pay(db,o,{paid})).rows[0].r,'paid');
    assert.equal((await pay(db,o,{paid})).rows[0].r,'duplicate');
    assert.equal((await db.query<any>('select status from subscriptions')).rows[0].status,'active');
    assert.equal((await pay(db,o,{paid,refunded:true})).rows[0].r,'refunded');
    assert.equal((await pay(db,o,{paid})).rows[0].r,'duplicate');
    assert.equal((await db.query<any>('select prepaid_entitled_until from subscriptions')).rows[0].prepaid_entitled_until,null);
    assert.equal((await db.query<any>('select status from subscriptions')).rows[0].status,'canceled');
  }finally{await db.close();}
});
test('calendar months clamp Jan31 and leap day; prepaid access survives legacy refresh',async()=>{
  const db=await database();try {
    const o=await prepare(db,'year');
    await db.exec("update cashflow_prepaid_orders set created_at='2024-02-29T03:00:00Z'");
    await pay(db,o,{paid:'2024-02-29T03:00:00Z'});
    const end=(await db.query<any>('select entitled_until from cashflow_prepaid_orders')).rows[0].entitled_until;
    assert.equal(new Date(end).toISOString(),'2025-02-28T03:00:00.000Z');
    assert.equal((await db.query<any>("select (('2026-01-31T03:00:00Z'::timestamptz at time zone 'Asia/Bangkok')+make_interval(months=>1)) at time zone 'Asia/Bangkok' e")).rows[0].e.toISOString(),'2026-02-28T03:00:00.000Z');
    await db.exec("update subscriptions set prepaid_entitled_until=now()+interval '6 months',manual_current_period_end=now()+interval '9 months'");
    await db.query('select cashflow_refresh_effective_subscription($1)',[uid]);
    assert.equal((await db.query<any>('select current_period_end=manual_current_period_end ok from subscriptions')).rows[0].ok,true);
  }finally{await db.close();}
});
test('unknown Stripe outcome is resumed after reservation timeout, never replaced; changing period cannot reuse wrong price',async()=>{
  const db=await database();try {
    await prepare(db);
    await db.exec("update subscriptions set stripe_checkout_expires_at=now()-interval '6 minutes',stripe_checkout_pending_until=now()-interval '1 minute'");
    const r=(await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'new','month','card','price1',false) r`,[uid])).rows[0].r;
    assert.equal(r.result,'resumed');assert.equal(r.order_id,'ord');
    assert.equal((await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'new','year','card','price1',false) r`,[uid])).rows[0].r.result,'period_mismatch');
    await db.query(`select cashflow_finish_prepaid_checkout('ord',$1,'cs1','expired')`,[uid]);
    assert.equal((await db.query<any>(`select cashflow_reserve_prepaid_checkout($1,'new','year','card','price2',false) r`,[uid])).rows[0].r.result,'reserved');
  }finally{await db.close();}
});
test('webhook before attach is valid; refunded first stays refunded; SQL denies browser roles',async()=>{
  const db=await database();try {
    const o=await prepare(db);const paid=new Date().toISOString();
    await pay(db,o,{paid,refunded:true});await pay(db,o,{paid});
    assert.equal((await db.query<any>('select status from cashflow_prepaid_orders')).rows[0].status,'refunded');
    const permission=await db.query<any>(`select
      has_table_privilege('anon','cashflow_prepaid_orders','SELECT') a,
      has_table_privilege('authenticated','cashflow_prepaid_orders','UPDATE') b,
      has_function_privilege('authenticated','cashflow_fulfill_prepaid(text,uuid,text,text,text,boolean,bigint,text,text,smallint,timestamptz,boolean)','EXECUTE') c,
      (select relrowsecurity from pg_class where relname='cashflow_prepaid_orders') rls`);
    assert.deepEqual(permission.rows[0],{a:false,b:false,c:false,rls:true});
  }finally{await db.close();}
});

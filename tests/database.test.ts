import { after,before,test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
 create table public.subscriptions(user_id uuid primary key references auth.users(id),stripe_customer_id text,stripe_subscription_id text,status text,plan text,current_period_end timestamptz,updated_at timestamptz default now());
 alter table public.subscriptions enable row level security;grant select on public.subscriptions to authenticated;
 create policy unsafe_legacy_read on public.subscriptions for select to authenticated using(true);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 insert into auth.users(id,email)values('${a}','a@example.com'),('${b}','b@example.com');
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
 await db.exec(await readFile('database/migrations/001_core.sql','utf8'));
 await db.exec(await readFile('database/migrations/002_import_legacy.sql','utf8'));
 await db.exec(await readFile('database/migrations/003_security_hardening.sql','utf8'));
 await db.exec(await readFile('database/migrations/004_roles_groups.sql','utf8'));
 await db.exec(await readFile('database/migrations/005_group_finance.sql','utf8'));
 await db.exec(await readFile('database/migrations/006_public_profiles.sql','utf8'));
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
 await db.exec(await readFile('database/security-check.sql','utf8'));
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
 await assert.rejects(db.query('select cashflow_apply_changes($1,$2)',[a,JSON.stringify([{table:'cashflow_jobs',id:'rollback',op:'set',version:null,data:{id:'rollback'}},{table:'cashflow_jobs',id:'cas',op:'delete',version:1}])]),/version_conflict/);
 assert.equal((await one("select count(*)::int n from cashflow_jobs where id='rollback'")).n,0);
 assert.equal((await one("select data->>'name' name from cashflow_jobs where id='cas'")).name,'v2');
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

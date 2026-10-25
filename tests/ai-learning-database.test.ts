import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// The learning tables (owner, 2026-10-25, package A): the migration runs on top of the existing AI tables, the
// memories saved so far keep working, browsers cannot read anything, retention runs as approved, and everything
// goes with the account.

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');`);
  await db.exec(await readFile('database/ai_secretary.sql', 'utf8'));
  // A memory saved before this release.
  await db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value,created_at) values('${owner}','tone','พูดสั้น ๆ', now() - interval '2 days')`);
  await db.exec(await readFile('supabase/migrations/20261025090000_ai_learning.sql', 'utf8'));
  return db;
}
const count = async (db: PGlite, sql: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`)).rows[0].n;

test('the migration keeps old memories, adds the new kinds, and one value per setting kind', async () => {
  const db = await database();
  const old = await db.query<{ source: string; version: number; age: boolean }>(`select source, version, updated_at < now() - interval '1 day' as age from public.cashflow_ai_memories`);
  assert.deepEqual(old.rows, [{ source: 'explicit', version: 1, age: true }], 'an old memory keeps its real age for retention');
  await db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value) values('${owner}','emoji','ไม่ใช้อีโมจิ'),('${owner}','business','ตัดต่อวิดีโอ'),('${owner}','business','ถ่ายภาพ')`);
  await assert.rejects(db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value) values('${owner}','emoji','ใช้อีโมจิได้')`), 'emoji is one setting');
  await assert.rejects(db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value) values('${owner}','password','x')`));
  await assert.rejects(db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value,source) values('${owner}','context','x','guess')`));
  await db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value) values('${other}','emoji','ใช้ได้')`);
  assert.equal(await count(db, `public.cashflow_ai_memories where kind = 'emoji'`), 2, 'the rule is per account');
});

test('touch marks what a message used; only that account\'s rows change', async () => {
  const db = await database();
  const mine = (await db.query<{ id: string }>(`select id from public.cashflow_ai_memories where user_id = '${owner}'`)).rows[0].id;
  await db.exec(`insert into public.cashflow_ai_memories(user_id,kind,value) values('${other}','tone','ทางการ')`);
  const theirs = (await db.query<{ id: string }>(`select id from public.cashflow_ai_memories where user_id = '${other}'`)).rows[0].id;
  await db.query(`select public.cashflow_ai_memories_touch($1, $2::uuid[])`, [owner, [mine, theirs]]);
  const rows = await db.query<{ user_id: string; use_count: number; used: boolean }>(`select user_id, use_count, last_used_at is not null as used from public.cashflow_ai_memories order by user_id`);
  assert.deepEqual(rows.rows, [{ user_id: owner, use_count: 1, used: true }, { user_id: other, use_count: 0, used: false }]);
});

test('retention: memories unused for 12 months, events and corrections after 12 months, signals after 6', async () => {
  const db = await database();
  await db.exec(`
    insert into public.cashflow_ai_memories(user_id,kind,value,created_at,updated_at,last_used_at) values
      ('${owner}','business','เก่ามาก', now() - interval '20 months', now() - interval '20 months', now() - interval '13 months'),
      ('${owner}','routine','ใช้ล่าสุดเมื่อวาน', now() - interval '20 months', now() - interval '20 months', now() - interval '1 day');
    insert into public.cashflow_ai_memory_events(user_id,action,kind,new_value,channel,created_at) values
      ('${owner}','created','business','เก่ามาก','app', now() - interval '13 months'), ('${owner}','created','routine','ใหม่','app', now());
    insert into public.cashflow_ai_corrections(user_id,domain,subject,after_value,created_at) values
      ('${owner}','expense_category','ร้านตัวอย่าง','ค่าอุปกรณ์/ซอฟต์แวร์', now() - interval '13 months'),
      ('${owner}','expense_category','ร้านตัวอย่าง 2','อื่นๆ', now() - interval '11 months');
    insert into public.cashflow_ai_knowledge_signals(user_id,kind,feature_id,channel,created_at) values
      ('${owner}','not_found','report','app', now() - interval '7 months'), ('${owner}','not_found','report','app', now() - interval '5 months');`);
  const swept = (await db.query<{ r: any }>(`select public.cashflow_ai_learning_sweep() as r`)).rows[0].r;
  assert.deepEqual(swept, { memories_expired: 1, events_removed: 1, corrections_removed: 1, signals_removed: 1 });
  assert.deepEqual((await db.query<{ value: string }>(`select value from public.cashflow_ai_memories where kind in ('business','routine')`)).rows, [{ value: 'ใช้ล่าสุดเมื่อวาน' }]);
  const expired = await db.query<{ action: string; old_value: string | null; channel: string }>(`select action, old_value, channel from public.cashflow_ai_memory_events where action = 'expired'`);
  assert.deepEqual(expired.rows, [{ action: 'expired', old_value: null, channel: 'system' }], 'an expired memory leaves a note without its value');
});

test('browsers have no access; everything goes with the account', async () => {
  const db = await database();
  const grants = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.role_table_grants
    where table_name in ('cashflow_ai_memory_events','cashflow_ai_corrections','cashflow_ai_knowledge_signals') and grantee in ('anon','authenticated')`);
  assert.equal(grants.rows[0].n, 0);
  const rls = await db.query<{ on: boolean }>(`select relrowsecurity as on from pg_class where relname in ('cashflow_ai_memory_events','cashflow_ai_corrections','cashflow_ai_knowledge_signals')`);
  assert.deepEqual(rls.rows.map(row => row.on), [true, true, true]);
  const functions = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.role_routine_grants
    where routine_name in ('cashflow_ai_memories_touch','cashflow_ai_learning_sweep') and grantee in ('anon','authenticated','PUBLIC')`);
  assert.equal(functions.rows[0].n, 0);
  await db.exec(`insert into public.cashflow_ai_memory_events(user_id,action,kind,channel) values('${owner}','created','tone','app');
    insert into public.cashflow_ai_corrections(user_id,domain,subject,after_value) values('${owner}','other','x','y');
    insert into public.cashflow_ai_knowledge_signals(user_id,kind,channel) values('${owner}','feature_request','line');
    delete from auth.users where id = '${owner}';`);
  for (const table of ['cashflow_ai_memories', 'cashflow_ai_memory_events', 'cashflow_ai_corrections', 'cashflow_ai_knowledge_signals']) {
    assert.equal(await count(db, `public.${table} where user_id = '${owner}'`), 0, table);
  }
});

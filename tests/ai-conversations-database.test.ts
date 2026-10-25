import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { BROWSER_CONVERSATION_ID, CONVERSATION_ID, inboxConversationId } from '../backend/src/ai/conversations';

// เลขากระรอก chat history (owner, 2026-10-24: "ทำให้บันทึกประวัติการคุยได้ สำหรับผู้ใช้นั้นๆ"): the migration runs
// as written, browsers cannot read the tables, and a chat goes with its account.

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const chat = 'c_33333333-3333-4333-8333-333333333333';

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${owner}'),('${other}');`);
  await db.exec(await readFile('supabase/migrations/20261024150000_ai_conversations.sql', 'utf8'));
  return db;
}

test('the chat history migration keeps a conversation and its messages, and both go with the account', async () => {
  const db = await database();
  await db.exec(`insert into public.cashflow_ai_conversations(id,user_id,title) values('${chat}','${owner}','เพิ่มงานให้หน่อย');
    insert into public.cashflow_ai_messages(conversation_id,user_id,role,text,cards) values('${chat}','${owner}','user','เพิ่มงานให้หน่อย',null),
      ('${chat}','${owner}','assistant','เตรียมการ์ดให้แล้วครับ','[{"kind":"confirm","id":"p_1","title":"เพิ่มงาน","changes":[]}]');`);
  const found = await db.query<{ n: number }>(`select count(*)::int as n from public.cashflow_ai_messages where conversation_id='${chat}'`);
  assert.equal(found.rows[0].n, 2);
  const contains = await db.query<{ n: number }>(`select count(*)::int as n from public.cashflow_ai_messages where cards @> '[{"id":"p_1"}]'`);
  assert.equal(contains.rows[0].n, 1, 'an edited card is found by its proposal id');
  await db.exec(`delete from auth.users where id='${owner}'`);
  const left = await db.query<{ c: number; m: number }>(`select (select count(*) from public.cashflow_ai_conversations)::int as c, (select count(*) from public.cashflow_ai_messages)::int as m`);
  assert.deepEqual(left.rows[0], { c: 0, m: 0 });
});

test('bad ids, roles and oversized rows are refused; browsers have no access', async () => {
  const db = await database();
  await assert.rejects(db.exec(`insert into public.cashflow_ai_conversations(id,user_id) values('chat-1','${owner}')`));
  await db.exec(`insert into public.cashflow_ai_conversations(id,user_id) values('${chat}','${owner}')`);
  await assert.rejects(db.exec(`insert into public.cashflow_ai_messages(conversation_id,user_id,role,text) values('${chat}','${owner}','system','x')`));
  await assert.rejects(db.exec(`insert into public.cashflow_ai_messages(conversation_id,user_id,role,text) values('${chat}','${owner}','user',repeat('ก', 12001))`));
  const grants = await db.query<{ n: number }>(`select count(*)::int as n from information_schema.role_table_grants
    where table_name in ('cashflow_ai_conversations','cashflow_ai_messages') and grantee in ('anon','authenticated')`);
  assert.equal(grants.rows[0].n, 0);
  const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`select relname, relrowsecurity from pg_class where relname in ('cashflow_ai_conversations','cashflow_ai_messages') order by relname`);
  assert.deepEqual(rls.rows.map(row => row.relrowsecurity), [true, true]);
});

test('the notifications thread id is one per account, fits the table, and is never the shape a browser sends', async () => {
  const mine = await inboxConversationId(owner);
  assert.equal(mine, await inboxConversationId(owner));
  assert.notEqual(mine, await inboxConversationId(other));
  assert.match(mine, CONVERSATION_ID);
  assert.doesNotMatch(mine, BROWSER_CONVERSATION_ID);
  assert.match(`c_${crypto.randomUUID()}`, BROWSER_CONVERSATION_ID);
  const db = await database();
  await db.exec(`insert into public.cashflow_ai_conversations(id,user_id,title) values('${mine}','${owner}','แจ้งเตือนอัตโนมัติ')`);
  const found = await db.query<{ n: number }>(`select count(*)::int as n from public.cashflow_ai_conversations where id='${mine}'`);
  assert.equal(found.rows[0].n, 1);
});

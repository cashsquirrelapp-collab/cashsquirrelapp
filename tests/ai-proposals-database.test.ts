import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PROPOSAL_TARGETS } from '../backend/src/ai/proposals.js';

// Execute the actual migration/RPC in an isolated local database. No Supabase account or network is used.
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${owner}'),('${other}');`);
  for (const table of ['cashflow_jobs', 'cashflow_expenses', 'cashflow_goals', 'cashflow_invoices', 'cashflow_documents']) {
    await db.exec(`create table ${table}(user_id uuid not null references auth.users(id), id text not null, data jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now(), primary key(user_id,id));`);
  }
  await db.exec(await readFile('database/migrations/012_return_personal_save_conflicts.sql', 'utf8'));
  await db.exec(await readFile('database/ai_secretary.sql', 'utf8'));
  const migration = await readFile('database/ai_account_actions.sql', 'utf8');
  await db.exec(migration);
  await db.exec(migration);
});
after(() => db.close());
const apply = async (userId: string, changes: unknown[]) => (await db.query<{ ok: boolean }>('select cashflow_apply_changes($1,$2) ok', [userId, JSON.stringify(changes)])).rows[0].ok;

test('additive proposal migration allows exactly the server kind list and preserves browser denial', async () => {
  let counter = 0;
  for (const kind of Object.keys(PROPOSAL_TARGETS)) {
    const id = `p_00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
    await db.query('insert into cashflow_ai_proposals(id,user_id,kind,job_id,title) values($1,$2,$3,$4,$5)', [id, owner, kind, 'record', 'review']);
  }
  await assert.rejects(db.query('insert into cashflow_ai_proposals(id,user_id,kind,job_id,title) values($1,$2,$3,$4,$5)', ['p_00000000-0000-4000-8000-999999999999', owner, 'arbitrary_table', 'record', 'bad']), /check constraint/);
  try {
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from cashflow_ai_proposals'), /permission denied/);
    await assert.rejects(db.query('select cashflow_ai_claim_proposal($1,$2)', [owner, 'p_00000000-0000-4000-8000-000000000001']), /permission denied/);
  } finally { await db.exec('reset role'); }
});

test('claim RPC keeps new document proposals owner-bound and applies once', async () => {
  const id = 'p_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query('insert into cashflow_ai_proposals(id,user_id,kind,job_id,title) values($1,$2,$3,$4,$5)', [id, owner, 'add_document', 'quote', 'quote']);
  assert.equal((await db.query('select * from cashflow_ai_claim_proposal($1,$2)', [other, id])).rows.length, 0);
  assert.equal((await db.query('select * from cashflow_ai_claim_proposal($1,$2)', [owner, id])).rows.length, 1);
  assert.equal((await db.query('select * from cashflow_ai_claim_proposal($1,$2)', [owner, id])).rows.length, 0);
});

test('confirmed document inserts cannot replay or overwrite another owner, and a stale batch rolls back completely', async () => {
  const insert = { table: 'cashflow_invoices', id: 'quote', op: 'set', version: null, data: { id: 'quote', client: 'owner' } };
  assert.equal(await apply(owner, [insert]), true);
  assert.equal(await apply(owner, [insert]), false);
  assert.equal(await apply(other, [{ ...insert, op: 'set', version: 1, data: { id: 'quote', client: 'other' } }]), false);
  assert.equal(await apply(owner, [{ ...insert, id: 'second', data: { id: 'second' } }, { ...insert, version: 7 }]), false);
  assert.deepEqual((await db.query<{ id: string; data: unknown }>('select id,data from cashflow_invoices')).rows, [{ id: 'quote', data: { id: 'quote', client: 'owner' } }]);
});

test('first-use singleton inserts are safe against another save winning before confirmation', async () => {
  const insert = { table: 'cashflow_documents', id: 'issuer_profile', op: 'set', version: null, data: { name: 'first save' } };
  assert.equal(await apply(owner, [insert]), true);
  assert.equal(await apply(owner, [{ ...insert, data: { name: 'late confirmation' } }]), false);
  const rows = (await db.query<{ data: { name: string }; version: number }>('select data,version from cashflow_documents where user_id=$1 and id=$2', [owner, 'issuer_profile'])).rows;
  assert.equal(rows[0].data.name, 'first save');
  assert.equal(rows[0].version, 1);
});

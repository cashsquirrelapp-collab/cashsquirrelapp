import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const third = '55555555-5555-4555-8555-555555555555';

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.cashflow_user_roles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      role text not null check (role in ('user','admin'))
    );
    create table public.cashflow_profiles(
      user_id uuid primary key references auth.users(id) on delete cascade,
      display_name text,public_id text
    );
    alter table cashflow_user_roles enable row level security;
    alter table cashflow_profiles enable row level security;
    grant select,update on cashflow_user_roles to service_role;
    grant select on cashflow_profiles to service_role;
    insert into auth.users values('${owner}'),('${other}'),('${admin}'),('${third}');
    insert into cashflow_user_roles values('${owner}','user'),('${other}','user'),('${admin}','admin'),('${third}','user');
    insert into cashflow_profiles values('${owner}','Owner','SQ-1111111111'),('${other}','Other','SQ-2222222222');
  `);
  await db.exec(await readFile('database/feedback_phase_one.sql', 'utf8'));
  await db.exec(await readFile('database/feedback_admin_inbox.sql', 'utf8'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec('reset role; truncate cashflow_feedback_threads cascade;');
  await db.query("update cashflow_user_roles set role='admin' where user_id=$1", [admin]);
});

async function one(sql: string, params: unknown[] = []) {
  return (await db.query<Record<string, any>>(sql, params)).rows[0];
}
async function asService<T>(run: () => Promise<T>) {
  await db.exec('set role service_role');
  try { return await run(); } finally { await db.exec('reset role'); }
}
async function mutate(actor: string, action: string, input: Record<string, unknown>) {
  return (await one('select public.cashflow_feedback_mutate($1,$2,$3::jsonb) result', [actor, action, JSON.stringify(input)])).result as { threadId: string };
}
async function inbox(actor: string, box: string | null = 'waiting', category: string | null = null, page = 0) {
  return (await one('select public.cashflow_feedback_admin_list($1,$2,$3,$4) result', [actor, box, category, page])).result;
}
// Real clocks can tie; give each thread its own minute so the order under test is exact.
async function spaceOut(threadIds: string[]) {
  for (const [index, id] of threadIds.entries()) {
    const at = new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString();
    await db.query('update cashflow_feedback_threads set created_at=$2,updated_at=$2,last_message_at=$2 where id=$1', [id, at]);
    await db.query('update cashflow_feedback_messages set created_at=$2 where thread_id=$1', [id, at]);
  }
}
const ids = (result: { threads: Array<{ id: string }> }) => result.threads.map(thread => thread.id);
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, expected);
  return true;
};

test('only a current admin can read the inbox; anon and authenticated cannot call it; bad filters are rejected', async () => {
  await asService(() => mutate(owner, 'create', { body: 'Private' }));
  await asService(async () => {
    await assert.rejects(inbox(owner), code('42501'));
    await assert.rejects(inbox('44444444-4444-4444-8444-444444444444'), code('42501'));
    for (const [box, category, page] of [['all', null, 0], [null, null, 0], ['waiting', 'other', 0], ['waiting', null, -1], ['waiting', null, 10001]] as const) {
      await assert.rejects(inbox(admin, box, category, page), code('22023'));
    }
  });
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(inbox(admin), code('42501')); } finally { await db.exec('reset role'); }
  }
  await db.query("update cashflow_user_roles set role='user' where user_id=$1", [admin]);
  await asService(() => assert.rejects(inbox(admin), code('42501')));
  const fn = await one("select prosecdef from pg_proc where proname='cashflow_feedback_admin_list'");
  assert.equal(fn.prosecdef, false);
});

test('threads fall into waiting, replied and resolved by who wrote last, with counts per box and per type', async () => {
  const [bug, idea, plain, older] = await asService(async () => [
    await mutate(owner, 'create', { body: 'Bug', category: 'bug' }),
    await mutate(other, 'create', { body: 'Idea', category: 'idea' }),
    await mutate(owner, 'create', { body: 'No type' }),
    await mutate(other, 'create', { body: 'Old form other', category: 'other' }),
  ]);
  await spaceOut([bug.threadId, idea.threadId, plain.threadId, older.threadId]);
  await asService(async () => {
    await mutate(admin, 'reply', { threadId: idea.threadId, body: 'Thanks' });
    await mutate(admin, 'status', { threadId: older.threadId, status: 'resolved' });

    const waiting = await inbox(admin, 'waiting');
    assert.deepEqual(ids(waiting), [bug.threadId, plain.threadId]);
    assert.deepEqual(waiting.counts, { waiting: 2, replied: 1, resolved: 1 });
    assert.deepEqual(waiting.kinds, { bug: 1, idea: 0, general: 1 });
    assert.equal(waiting.threads[0].ownerName, 'Owner');
    assert.equal(waiting.threads[0].ownerPublicId, 'SQ-1111111111');
    assert.equal(waiting.threads[0].ownerThreadCount, 2);
    assert.ok(waiting.threads[0].waitingSince);

    const replied = await inbox(admin, 'replied');
    assert.deepEqual(ids(replied), [idea.threadId]);
    assert.equal(replied.threads[0].waitingSince, null);
    assert.deepEqual(replied.kinds, { bug: 0, idea: 1, general: 0 });

    const resolved = await inbox(admin, 'resolved');
    assert.deepEqual(ids(resolved), [older.threadId]);
    // the old form's "other" and no type at all both count as general
    assert.deepEqual(resolved.kinds, { bug: 0, idea: 0, general: 1 });
    assert.deepEqual(ids(await inbox(admin, 'waiting', 'general')), [plain.threadId]);
    assert.deepEqual(ids(await inbox(admin, 'waiting', 'bug')), [bug.threadId]);
    assert.deepEqual(ids(await inbox(admin, 'waiting', 'idea')), []);

    // the user answers the team: back to waiting, timed from that first answer, not the latest
    await mutate(other, 'reply', { threadId: idea.threadId, body: 'One more thing' });
    await mutate(other, 'reply', { threadId: idea.threadId, body: 'And another' });
    const firstAnswer = await one("select created_at from cashflow_feedback_messages where body='One more thing'");
    const back = await inbox(admin, 'waiting');
    const entry = back.threads.find((thread: { id: string }) => thread.id === idea.threadId);
    assert.equal(new Date(entry.waitingSince).getTime(), new Date(firstAnswer.created_at).getTime());
    assert.deepEqual(back.counts, { waiting: 3, replied: 0, resolved: 1 });
  });
});

test('waiting is longest-wait first, resolved is newest first, and pages hold 20', async () => {
  // three accounts, because each may open only 10 threads an hour
  const created = await asService(async () => {
    const threadIds: string[] = [];
    for (let index = 0; index < 22; index += 1) {
      threadIds.push((await mutate([owner, other, third][index % 3], 'create', { body: `Thread ${index}` })).threadId);
    }
    return threadIds;
  });
  await spaceOut(created);
  await asService(async () => {
    // the oldest thread gets a fresh user message: it still waits since its first message
    await mutate(owner, 'reply', { threadId: created[0], body: 'Still waiting' });
    const first = await inbox(admin, 'waiting');
    assert.equal(first.threads.length, 20);
    assert.equal(first.hasMore, true);
    assert.deepEqual(ids(first), created.slice(0, 20));
    const second = await inbox(admin, 'waiting', null, 1);
    assert.deepEqual(ids(second), created.slice(20));
    assert.equal(second.hasMore, false);
    for (const id of created.slice(0, 3)) await mutate(admin, 'status', { threadId: id, status: 'resolved' });
  });
  await db.query("update cashflow_feedback_threads set last_message_at='2026-10-04T00:00:00Z' where id=$1", [created[0]]);
  await db.query("update cashflow_feedback_threads set last_message_at='2026-10-05T00:00:00Z' where id=$1", [created[1]]);
  await asService(async () => {
    assert.deepEqual(ids(await inbox(admin, 'resolved')), [created[1], created[0], created[2]]);
  });
});

test('the inbox never changes data', async () => {
  await asService(async () => {
    const { threadId } = await mutate(owner, 'create', { body: 'Read only' });
    const before = await one('select * from cashflow_feedback_threads where id=$1', [threadId]);
    await inbox(admin, 'waiting');
    await inbox(admin, 'resolved', 'bug');
    assert.deepEqual(await one('select * from cashflow_feedback_threads where id=$1', [threadId]), before);
    assert.equal((await one('select count(*)::int n from cashflow_feedback_messages')).n, 1);
  });
});

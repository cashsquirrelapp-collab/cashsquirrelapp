import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const admin = '33333333-3333-4333-8333-333333333333';
const missing = '44444444-4444-4444-8444-444444444444';

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
    insert into auth.users values('${owner}'),('${other}'),('${admin}');
    insert into cashflow_user_roles values('${owner}','user'),('${other}','user'),('${admin}','admin');
    insert into cashflow_profiles values('${owner}','Owner','SQ-1111111111'),('${other}','Other','SQ-2222222222');
  `);
  await db.exec(await readFile('database/feedback_phase_one.sql', 'utf8'));
});
after(() => db.close());
beforeEach(async () => {
  await db.exec("reset role; truncate cashflow_feedback_threads cascade; update cashflow_user_roles set role='user';");
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
  return (await one('select public.cashflow_feedback_mutate($1,$2,$3::jsonb) result', [actor, action, JSON.stringify(input)])).result;
}
async function list(actor: string, scope = 'mine', status: string | null = null, page = 0) {
  return (await one('select public.cashflow_feedback_list($1,$2,$3,$4) result', [actor, scope, status, page])).result;
}
async function detail(actor: string, threadId: string, page = 0) {
  return (await one('select public.cashflow_feedback_detail($1,$2,$3) result', [actor, threadId, page])).result;
}
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, expected);
  return true;
};

test('feedback tables and all RPCs deny anon/authenticated including spoofed admin actor', async () => {
  const { threadId } = await asService(() => mutate(owner, 'create', { body: 'Private feedback' }));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['cashflow_feedback_threads', 'cashflow_feedback_messages']) {
        await assert.rejects(db.query(`select * from ${table}`), code('42501'));
        await assert.rejects(db.query(`delete from ${table}`), code('42501'));
      }
      await assert.rejects(db.query('insert into cashflow_feedback_messages(thread_id,sender_id,sender_role,body) values($1,$2,\'admin\',\'forged\')', [threadId, admin]), code('42501'));
      await assert.rejects(db.query("update cashflow_feedback_threads set status='resolved' where id=$1", [threadId]), code('42501'));
      await assert.rejects(list(admin, 'admin'), code('42501'));
      await assert.rejects(detail(owner, threadId), code('42501'));
      await assert.rejects(mutate(admin, 'reply', { threadId, body: 'forged' }), code('42501'));
    } finally { await db.exec('reset role'); }
  }
  const protections = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('cashflow_feedback_threads','cashflow_feedback_messages')");
  assert.equal(protections.rows.length, 2);
  assert.ok(protections.rows.every(row => row.relrowsecurity));
  const functions = await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where proname like 'cashflow_feedback_%'");
  assert.equal(functions.rows.length, 3);
  assert.ok(functions.rows.every(row => !row.prosecdef));
});

test('owners see only their conversations; DB admin role controls the inbox and replies', async () => {
  await asService(async () => {
    const first = await mutate(owner, 'create', { body: '  <script>alert(1)</script>\nSafe plain text  ', category: 'bug' });
    const second = await mutate(other, 'create', { body: 'Other account' });
    const mine = await list(owner);
    assert.deepEqual(mine.threads.map((thread: { id: string }) => thread.id), [first.threadId]);
    assert.equal(mine.threads[0].ownerName, 'Owner');
    assert.equal(mine.threads[0].ownerPublicId, 'SQ-1111111111');
    assert.equal(mine.threads[0].category, 'bug');
    assert.equal(mine.threads[0].messageCount, 1);
    assert.equal((await detail(owner, first.threadId)).messages[0].body, '<script>alert(1)</script>\nSafe plain text');
    await assert.rejects(detail(other, first.threadId), code('P0002'));
    await assert.rejects(mutate(other, 'reply', { threadId: first.threadId, body: 'Cross-account' }), code('P0002'));
    await assert.rejects(detail(owner, missing), code('P0002'));
    await assert.rejects(list(owner, 'admin'), code('42501'));
    await assert.rejects(mutate(owner, 'status', { threadId: first.threadId, status: 'resolved' }), code('42501'));
    assert.equal((await list(admin, 'admin')).threads.length, 2);
    assert.equal((await list(admin)).threads.length, 0);
    await mutate(admin, 'reply', { threadId: first.threadId, body: 'Working on this' });
    let thread = await detail(owner, first.threadId);
    assert.equal(thread.thread.status, 'in_progress');
    assert.equal(thread.thread.lastSenderRole, 'admin');
    assert.equal(thread.messages[1].senderId, admin);
    assert.equal(thread.messages[1].senderRole, 'admin');
    await mutate(owner, 'reply', { threadId: first.threadId, body: 'More detail' });
    assert.equal((await detail(owner, first.threadId)).thread.status, 'in_progress');
    await mutate(admin, 'status', { threadId: first.threadId, status: 'resolved' });
    assert.deepEqual((await list(admin, 'admin', 'resolved')).threads.map((entry: { id: string }) => entry.id), [first.threadId]);
    await mutate(owner, 'reply', { threadId: first.threadId, body: 'Still happens' });
    thread = await detail(owner, first.threadId);
    assert.equal(thread.thread.status, 'open');
    assert.equal(thread.thread.messageCount, 4);
    assert.equal(thread.thread.preview, 'Still happens');
    assert.equal((await detail(other, second.threadId)).thread.messageCount, 1);
    await assert.rejects(list(missing), code('42501'));
  });
});

test('admin role revocation is checked on the next list, detail, reply and status operation', async () => {
  const { threadId } = await asService(() => mutate(owner, 'create', { body: 'Role revocation' }));
  await asService(() => detail(admin, threadId));
  await db.query("update cashflow_user_roles set role='user' where user_id=$1", [admin]);
  await asService(async () => {
    await assert.rejects(list(admin, 'admin'), code('42501'));
    await assert.rejects(detail(admin, threadId), code('P0002'));
    await assert.rejects(mutate(admin, 'reply', { threadId, body: 'Revoked' }), code('P0002'));
    await assert.rejects(mutate(admin, 'status', { threadId, status: 'resolved' }), code('42501'));
    assert.equal((await detail(owner, threadId)).thread.messageCount, 1);
  });
});

test('invalid bodies, categories, statuses and spoofed identities cannot write rows', async () => {
  await asService(async () => {
    for (const input of [{ body: '' }, { body: ' \t\r\n' }, { body: 'x'.repeat(4001) }, { body: 42 }, { body: 'Valid', category: 'secret' }, { body: 'Valid', senderRole: 'admin' }, { body: 'Valid', ownerId: other }]) {
      await assert.rejects(mutate(owner, 'create', input), code('22023'));
    }
    const { threadId } = await mutate(owner, 'create', { body: 'v'.repeat(4000), category: null });
    assert.equal((await detail(owner, threadId)).messages[0].body.length, 4000);
    await assert.rejects(mutate(admin, 'status', { threadId, status: 'unknown' }), code('22023'));
    await assert.rejects(mutate(owner, 'reply', { threadId: 'bad-id', body: 'Invalid' }), code('22023'));
    await assert.rejects(mutate(owner, 'reply', { threadId, body: 'Invalid', senderId: admin }), code('22023'));
    await assert.rejects(list(owner, 'mine', null, -1), code('22023'));
    await assert.rejects(list(owner, 'mine', null, 10001), code('22023'));
    await assert.rejects(detail(owner, threadId, 10001), code('22023'));
    assert.equal((await list(owner)).threads.length, 1);
    assert.equal((await detail(owner, threadId)).thread.messageCount, 1);
  });
});

test('message insertion failures roll back both a new thread and existing thread summary', async () => {
  await db.exec(`create function public.feedback_test_reject_message() returns trigger language plpgsql as $$
    begin if new.body='simulate failed insert' then raise exception 'test_insert_failed'; end if; return new; end $$;
    create trigger feedback_test_reject_message before insert on cashflow_feedback_messages
    for each row execute function feedback_test_reject_message();`);
  try {
    await asService(async () => {
      await assert.rejects(mutate(owner, 'create', { body: 'simulate failed insert' }), /test_insert_failed/);
      assert.equal((await list(owner)).threads.length, 0);
      const { threadId } = await mutate(owner, 'create', { body: 'Initial' });
      const before = await detail(owner, threadId);
      await assert.rejects(mutate(owner, 'reply', { threadId, body: 'simulate failed insert' }), /test_insert_failed/);
      assert.deepEqual(await detail(owner, threadId), before);
    });
  } finally {
    await db.exec('drop trigger feedback_test_reject_message on cashflow_feedback_messages; drop function public.feedback_test_reject_message();');
  }
});

test('thread and message pages have bounded sizes, stable chronological order and status filters', async () => {
  await db.query(`insert into cashflow_feedback_threads(id,owner_id,status,preview,last_sender_role,message_count,created_at,last_message_at)
    select ('aaaaaaaa-aaaa-4aaa-8aaa-'||lpad(n::text,12,'0'))::uuid,$1,case when n%2=0 then 'resolved' else 'open' end,'Seed','user',1,now()-interval '2 hours',now()-n*interval '1 minute'
    from generate_series(1,25) n`, [owner]);
  const threadId = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
  await db.query(`insert into cashflow_feedback_messages(thread_id,sender_id,sender_role,body,created_at)
    select $1,$2,'user','Message '||n,now()-interval '2 hours'+n*interval '1 second' from generate_series(1,55) n`, [threadId, owner]);
  await db.query('update cashflow_feedback_threads set message_count=55 where id=$1', [threadId]);
  await asService(async () => {
    const first = await list(owner), second = await list(owner, 'mine', null, 1), empty = await list(owner, 'mine', null, 2);
    assert.equal(first.threads.length, 20); assert.equal(first.hasMore, true); assert.equal(first.pageSize, 20);
    assert.equal(second.threads.length, 5); assert.equal(second.hasMore, false); assert.equal(second.page, 1);
    assert.equal(new Set([...first.threads, ...second.threads].map(thread => thread.id)).size, 25);
    assert.deepEqual(empty.threads, []);
    assert.equal((await list(admin, 'admin', 'resolved')).threads.length, 12);
    const messages = await detail(owner, threadId), next = await detail(owner, threadId, 1);
    assert.equal(messages.messages.length, 50); assert.equal(messages.hasMore, true); assert.equal(messages.pageSize, 50);
    assert.equal(next.messages.length, 5); assert.equal(next.hasMore, false);
    assert.equal(messages.messages[0].body, 'Message 1');
    assert.equal(messages.messages[49].body, 'Message 50');
    assert.equal(next.messages[0].body, 'Message 51');
  });
});

test('rolling create and message quotas reject overflow without partial data', async () => {
  await asService(async () => {
    for (let n = 0; n < 10; n++) await mutate(owner, 'create', { body: `Thread ${n}` });
    await assert.rejects(mutate(owner, 'create', { body: 'Overflow' }), /feedback_create_rate_limit/);
    assert.equal((await list(owner)).threads.length, 10);
    const { threadId } = await mutate(other, 'create', { body: 'Message budget' });
    for (let n = 1; n < 60; n++) await mutate(other, 'reply', { threadId, body: `Reply ${n}` });
    await assert.rejects(mutate(other, 'reply', { threadId, body: 'Overflow' }), /feedback_message_rate_limit/);
    assert.equal((await detail(other, threadId)).thread.messageCount, 60);
    await mutate(admin, 'reply', { threadId, body: 'Separate actor budget' });
    assert.equal((await detail(other, threadId)).thread.messageCount, 61);
  });
});

test('hard storage limits reject new threads and replies at capacity', async () => {
  await db.query(`insert into cashflow_feedback_threads(owner_id,preview,last_sender_role,message_count,created_at,last_message_at)
    select $1,'Old thread','user',1,now()-interval '2 hours',now()-interval '2 hours' from generate_series(1,1000)`, [owner]);
  const { threadId } = await asService(() => mutate(other, 'create', { body: 'Capacity' }));
  await db.query(`insert into cashflow_feedback_messages(thread_id,sender_id,sender_role,body,created_at)
    select $1,$2,'user','Old message',now()-interval '2 hours' from generate_series(1,999)`, [threadId, other]);
  await db.query('update cashflow_feedback_threads set message_count=1000 where id=$1', [threadId]);
  await asService(async () => {
    await assert.rejects(mutate(owner, 'create', { body: 'Overflow' }), /feedback_thread_limit/);
    await assert.rejects(mutate(other, 'reply', { threadId, body: 'Overflow' }), /feedback_message_limit/);
    await assert.rejects(mutate(admin, 'reply', { threadId, body: 'Overflow' }), /feedback_message_limit/);
    assert.equal((await detail(other, threadId)).thread.messageCount, 1000);
  });
});

test('service grants keep message history append-only and owner identity immutable', async () => {
  const { threadId } = await asService(() => mutate(owner, 'create', { body: 'Immutable' }));
  await asService(async () => {
    await assert.rejects(db.query("update cashflow_feedback_messages set body='Changed' where thread_id=$1", [threadId]), code('42501'));
    await assert.rejects(db.query('delete from cashflow_feedback_messages where thread_id=$1', [threadId]), code('42501'));
    await assert.rejects(db.query('update cashflow_feedback_threads set owner_id=$1 where id=$2', [other, threadId]), code('42501'));
    await assert.rejects(db.query('delete from cashflow_feedback_threads where id=$1', [threadId]), code('42501'));
  });
});

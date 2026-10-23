import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { FEEDBACK_MAX_BODY_LENGTH, feedbackActionSchema } from '../shared/feedback.js';

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://feedback-tests.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.SESSION_SECRET = 'feedback-test-only-secret-'.repeat(4);

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const threadA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const threadB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = '2026-10-19T00:00:00.000Z';
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let roleAdmin = true;
let throttleMessages = false;
let missingAdminList = false;
let failPlanLookup = false;
let rpcCalls: { name: string; input: any }[] = [];
let threads: any[];
let messages: any[];

const cookieFor = (id: string) => {
  const jwt = `e30.${Buffer.from(JSON.stringify({ sub: id, session_id: id })).toString('base64url')}.test`;
  return `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
};
function headersFor(id: string) {
  return { cookie: cookieFor(id), 'x-account-id': id };
}
function get(path = '', id = ownerA, overrides: Record<string, string> = {}) {
  return realFetch(`${origin}/api/feedback${path}`, { headers: { ...headersFor(id), ...overrides } });
}
function post(body: unknown, id = ownerA, overrides: Record<string, string> = {}) {
  return realFetch(`${origin}/api/feedback`, { method: 'POST', headers: {
    ...headersFor(id), origin, 'x-csrf-protection': '1', 'content-type': 'application/json', ...overrides,
  }, body: JSON.stringify(body) });
}

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const failure = (code: string, message: string) => json({ code, message }, 400);
    if (url.pathname === '/auth/v1/user') {
      const token = new Headers(init?.headers).get('authorization')!.split(' ')[1];
      const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
      return json({ id, email: `${id}@example.com`, user_metadata: { role: 'admin' }, created_at: now });
    }
    if (url.pathname.endsWith('/rpc/cashflow_session_active')) return json(true);
    if (url.pathname.endsWith('/rpc/cashflow_rate_limit')) {
      const data = JSON.parse(String(init?.body));
      return json(!(throttleMessages && data.p_limit === 60 && data.p_seconds === 3600));
    }
    if (url.pathname.endsWith('/cashflow_user_roles')) {
      return json({ role: url.searchParams.get('user_id') === `eq.${adminId}` && roleAdmin ? 'admin' : 'user' });
    }
    if (url.pathname.endsWith('/cashflow_profiles') || url.pathname.endsWith('/subscriptions')) {
      rpcCalls.push({ name: url.pathname.split('/').at(-1)!, input: url.searchParams.get('user_id') });
      if (failPlanLookup) return json({ code: '42P01', message: 'missing' }, 500);
      return json(url.pathname.endsWith('/cashflow_profiles')
        ? [{ user_id: ownerA, created_at: '2026-01-01T00:00:00Z' }, { user_id: ownerB, created_at: new Date().toISOString() }]
        : [{ user_id: ownerA, status: 'active', plan: 'pro_monthly', current_period_end: '2099-01-01T00:00:00Z' }]);
    }
    const name = url.pathname.split('/').at(-1)!;
    const data = JSON.parse(String(init?.body));
    rpcCalls.push({ name, input: data });
    const isAdmin = data.p_actor === adminId && roleAdmin;
    const accessible = (id: string) => threads.find(t => t.id === id && (t.ownerId === data.p_actor || isAdmin));
    if (name === 'cashflow_feedback_list') {
      if (data.p_scope === 'admin' && !isAdmin) return failure('42501', 'forbidden');
      const selected = threads.filter(t => (data.p_scope === 'admin' || t.ownerId === data.p_actor) && (!data.p_status || t.status === data.p_status));
      return json({ threads: selected, page: data.p_page, pageSize: 20, hasMore: false });
    }
    if (name === 'cashflow_feedback_admin_list') {
      if (missingAdminList) return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
      if (!isAdmin) return failure('42501', 'forbidden');
      const selected = threads.filter(t => data.p_box === 'resolved' ? t.status === 'resolved' : t.status !== 'resolved' && t.lastSenderRole === (data.p_box === 'waiting' ? 'user' : 'admin'));
      return json({ threads: selected.map(t => ({ ...t, waitingSince: data.p_box === 'waiting' ? t.lastMessageAt : null, ownerThreadCount: 1 })),
        page: data.p_page, pageSize: 20, hasMore: false, counts: { waiting: 2, replied: 0, resolved: 0 }, kinds: { bug: 0, idea: 0, general: 2 } });
    }
    if (name === 'cashflow_feedback_detail') {
      const thread = accessible(data.p_thread_id);
      if (!thread) return failure('P0002', 'feedback_not_found');
      return json({ thread, messages: messages.filter(m => m.threadId === thread.id), page: data.p_page, pageSize: 50, hasMore: false });
    }
    if (name === 'cashflow_feedback_mutate') {
      const body = data.p_input;
      if (data.p_action === 'create') {
        const id = randomUUID();
        threads.push({ id, ownerId: data.p_actor, ownerName: null, ownerPublicId: null, category: body.category ?? null,
          status: 'open', preview: body.body.slice(0, 180), createdAt: now, updatedAt: now,
          lastMessageAt: now, lastSenderRole: isAdmin ? 'admin' : 'user', messageCount: 1 });
        messages.push({ id: randomUUID(), threadId: id, senderId: data.p_actor, senderRole: isAdmin ? 'admin' : 'user', body: body.body, createdAt: now });
        return json({ threadId: id });
      }
      const thread = accessible(body.threadId);
      if (!thread) return failure('P0002', 'feedback_not_found');
      if (data.p_action === 'status') {
        if (!isAdmin) return failure('42501', 'forbidden');
        thread.status = body.status;
      } else {
        messages.push({ id: randomUUID(), threadId: thread.id, senderId: data.p_actor, senderRole: isAdmin ? 'admin' : 'user', body: body.body, createdAt: now });
        thread.messageCount++;
        thread.lastSenderRole = isAdmin ? 'admin' : 'user';
        thread.status = isAdmin ? 'in_progress' : thread.status === 'resolved' ? 'open' : thread.status;
      }
      return json({ threadId: thread.id });
    }
    throw new Error(`Unexpected feedback endpoint ${url.pathname}`);
  };
  server = await new Promise<Server>(resolve => {
    const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.APP_URL = origin;
});
beforeEach(() => {
  roleAdmin = true;
  throttleMessages = false;
  missingAdminList = false;
  failPlanLookup = false;
  rpcCalls = [];
  threads = [{ id: threadA, ownerId: ownerA }, { id: threadB, ownerId: ownerB }].map(row => ({
    ...row, ownerName: null, ownerPublicId: null, category: null, status: 'open', preview: row.id,
    createdAt: now, updatedAt: now, lastMessageAt: now, lastSenderRole: 'user', messageCount: 1,
  }));
  messages = threads.map(thread => ({ id: randomUUID(), threadId: thread.id, senderId: thread.ownerId, senderRole: 'user', body: 'ข้อความส่วนตัว', createdAt: now }));
});
after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('feedback requires a verified session and the matching account header', async () => {
  assert.equal((await realFetch(`${origin}/api/feedback`)).status, 401);
  assert.equal((await realFetch(`${origin}/api/feedback`, { headers: { cookie: cookieFor(ownerA) } })).status, 401);
  assert.equal((await get('', ownerA, { 'x-account-id': ownerB })).status, 401);
  assert.equal(rpcCalls.length, 0);
});

test('owners list their conversations and only current admins can open the combined inbox', async () => {
  const mine = await get();
  assert.equal(mine.status, 200);
  assert.equal(mine.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await mine.json()).threads.map((t: any) => t.id), [threadA]);
  assert.equal((await get('?route=feedback')).status, 200);
  assert.equal((await get(`?route=feedback&threadId=${threadA}`)).status, 200);
  assert.deepEqual((await (await get('', ownerB)).json()).threads.map((t: any) => t.id), [threadB]);
  assert.equal((await get('?scope=admin')).status, 403);
  assert.equal((await (await get('?scope=admin', adminId)).json()).threads.length, 2);
  roleAdmin = false;
  assert.equal((await get('?scope=admin', adminId)).status, 403);
});

test('cross-account reads and replies fail without revealing another thread', async () => {
  assert.equal((await get(`?threadId=${threadB}`)).status, 404);
  assert.equal((await post({ action: 'reply', threadId: threadB, body: 'ไม่ควรส่งได้' })).status, 404);
  assert.equal(messages.length, 2);
  assert.ok(rpcCalls.every(call => call.input.p_actor === ownerA));
});

test('sender, owner, and role spoofing are rejected before mutation', async () => {
  for (const extra of [{ ownerId: ownerB }, { senderId: adminId }, { senderRole: 'admin' }, { p_actor: adminId }, { role: 'admin' }]) {
    assert.equal((await post({ action: 'create', body: 'hello', ...extra })).status, 400);
  }
  assert.equal((await post({ action: 'status', threadId: threadA, status: 'resolved' })).status, 403);
  assert.equal(rpcCalls.length, 0);
});

test('create, admin reply, owner follow-up and explicit resolution preserve the trusted actor', async () => {
  const created = await post({ action: 'create', category: 'idea', body: '  อยากให้เพิ่มรายงาน\nขอบคุณครับ  ' });
  assert.equal(created.status, 201);
  const { threadId } = await created.json();
  assert.equal(messages.at(-1).body, 'อยากให้เพิ่มรายงาน\nขอบคุณครับ');
  assert.equal(messages.at(-1).senderId, ownerA);
  assert.equal(threads.at(-1).category, 'idea');
  assert.equal((await post({ action: 'reply', threadId, body: 'รับเรื่องแล้วครับ' }, adminId)).status, 200);
  let detail = await (await get(`?threadId=${threadId}`)).json();
  assert.equal(detail.thread.status, 'in_progress');
  assert.equal(detail.messages.at(-1).senderRole, 'admin');
  assert.equal((await post({ action: 'status', threadId, status: 'resolved' }, adminId)).status, 200);
  assert.equal((await post({ action: 'reply', threadId, body: 'ขอเพิ่มเติมครับ' })).status, 200);
  detail = await (await get(`?threadId=${threadId}`)).json();
  assert.equal(detail.thread.status, 'open');
  assert.equal(detail.messages.at(-1).senderRole, 'user');
  assert.deepEqual(rpcCalls.filter(call => call.name === 'cashflow_feedback_mutate').map(call => call.input.p_actor), [ownerA, adminId, adminId, ownerA]);
});

test('invalid input, status, and unbounded pagination are rejected before SQL', async () => {
  for (const body of ['', '  \n\t ', 'x'.repeat(FEEDBACK_MAX_BODY_LENGTH + 1), 'nul\0byte']) {
    assert.equal((await post({ action: 'create', body })).status, 400);
  }
  for (const body of [{ action: 'create', body: 'hi', category: 'secret' }, { action: 'status', threadId: threadA, status: 'deleted' }, { action: 'reply', threadId: 'invalid', body: 'hi' }]) {
    assert.equal((await post(body, adminId)).status, 400);
  }
  for (const query of ['?page=-1', '?page=10001', '?page=1.5', '?page=1&page=2', '?status=deleted', '?scope=all', '?ownerId=' + ownerB]) {
    assert.equal((await get(query)).status, 400, query);
  }
  assert.equal(rpcCalls.length, 0);
});

test('CSRF and durable per-user rate limits prevent feedback writes', async () => {
  assert.equal((await post({ action: 'create', body: 'hi' }, ownerA, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ action: 'create', body: 'hi' }, ownerA, { 'x-csrf-protection': '' })).status, 403);
  throttleMessages = true;
  const limited = await post({ action: 'create', body: 'hi' });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(rpcCalls.length, 0);
});

test('plain text has a strict size bound and stays text even if it contains HTML-looking content', async () => {
  const literal = '<img src=x onerror=alert(1)>\nตามข้อความนี้';
  assert.equal((await post({ action: 'create', body: literal })).status, 201);
  assert.equal(messages.at(-1).body, literal);
  assert.equal(feedbackActionSchema.safeParse({ action: 'create', body: 'ก'.repeat(FEEDBACK_MAX_BODY_LENGTH) }).success, true);
  assert.equal(feedbackActionSchema.safeParse({ action: 'create', body: 'ก'.repeat(FEEDBACK_MAX_BODY_LENGTH + 1) }).success, false);
});


test('admin inbox boxes: admins only, filters checked before SQL, plan added from the account rule', async () => {
  assert.equal((await get('?scope=admin&box=waiting')).status, 403);
  for (const query of ['?scope=admin&box=all', '?scope=mine&box=waiting', '?box=waiting', '?scope=admin&box=waiting&category=other', '?scope=admin&box=waiting&status=open', '?scope=admin&box=waiting&page=-1']) {
    assert.equal((await get(query, adminId)).status, 400, query);
  }
  assert.equal(rpcCalls.length, 0);
  const response = await get('?scope=admin&box=waiting&category=general', adminId);
  assert.equal(response.status, 200);
  const inbox = await response.json();
  assert.deepEqual(rpcCalls[0], { name: 'cashflow_feedback_admin_list', input: { p_actor: adminId, p_box: 'waiting', p_category: 'general', p_page: 0 } });
  assert.deepEqual(inbox.counts, { waiting: 2, replied: 0, resolved: 0 });
  // ownerA pays until 2099; ownerB signed up today, so is in the 14-day trial
  assert.deepEqual(inbox.threads.map((t: any) => [t.id, t.ownerPlan]), [[threadA, 'paid'], [threadB, 'trial']]);
  roleAdmin = false;
  assert.equal((await get('?scope=admin&box=waiting', adminId)).status, 403);
});

test('admin inbox still loads without the plan, and says plainly when the SQL has not been run', async () => {
  failPlanLookup = true;
  const inbox = await (await get('?scope=admin&box=waiting', adminId)).json();
  assert.deepEqual(inbox.threads.map((t: any) => t.ownerPlan), [null, null]);
  missingAdminList = true;
  const missing = await get('?scope=admin&box=waiting', adminId);
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /feedback_admin_inbox\.sql/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseFetch, planFor, SupabaseTimeoutError, type SupabaseFetchTimeouts } from '../backend/src/config/supabaseFetch.ts';

// Short deadlines so the suite stays fast; the production values are in SUPABASE_TIMEOUTS.
const timeouts: SupabaseFetchTimeouts = { readRpc: 40, read: 60, storageRead: 80, write: 100, storageWrite: 120 };
const SUPA = 'https://example.supabase.co';

/** A fetch that never answers until it is aborted, then rejects with the abort reason (like undici). */
const hang = (calls: string[]) => (input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  calls.push(String(input));
  init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
});

test('plans: reads and read-only functions retry, writes do not, storage waits longer', () => {
  assert.deepEqual(planFor(`${SUPA}/rest/v1/cashflow_account_snapshot?user_id=eq.1`, 'GET', timeouts), { timeoutMs: 60, retry: true, route: '/rest/v1/cashflow_account_snapshot' });
  assert.deepEqual(planFor(`${SUPA}/rest/v1/rpc/cashflow_rate_limit`, 'POST', timeouts), { timeoutMs: 40, retry: true, route: '/rest/v1/rpc/cashflow_rate_limit' });
  assert.deepEqual(planFor(`${SUPA}/auth/v1/user`, 'GET', timeouts), { timeoutMs: 60, retry: true, route: '/auth/v1/user' });
  assert.equal(planFor(`${SUPA}/rest/v1/rpc/cashflow_apply_changes`, 'POST', timeouts).retry, false);
  assert.equal(planFor(`${SUPA}/rest/v1/rpc/cashflow_login_lock_status`, 'POST', timeouts).retry, false); // it writes
  assert.equal(planFor(`${SUPA}/auth/v1/token?grant_type=refresh_token`, 'POST', timeouts).retry, false);
  assert.equal(planFor(`${SUPA}/rest/v1/cashflow_jobs`, 'PATCH', timeouts).timeoutMs, 100);
  const upload = planFor(`${SUPA}/storage/v1/object/monthly-reports/user-1/2026-10.xlsx`, 'POST', timeouts);
  assert.deepEqual(upload, { timeoutMs: 120, retry: false, route: '/storage/v1/object' }); // no object name in logs
  assert.equal(planFor(`${SUPA}/storage/v1/object/authenticated/x/y.xlsx`, 'GET', timeouts).timeoutMs, 80);
});

test('a stalled read is cut at its deadline and sent once more', async () => {
  const calls: string[] = [];
  const stalled = hang(calls);
  let n = 0;
  const base = ((input: RequestInfo | URL, init?: RequestInit) => (n++ === 0 ? stalled(input, init) : Promise.resolve(new Response('{"ok":true}')))) as typeof fetch;
  const started = Date.now();
  const response = await createSupabaseFetch({ base, timeouts })(`${SUPA}/rest/v1/cashflow_account_snapshot`, { method: 'GET' });
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(n, 2);
  assert.ok(Date.now() - started < 500);
});

test('the rate-limit function retries, with its body sent again', async () => {
  const bodies: unknown[] = [];
  let n = 0;
  const base = ((input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(init?.body);
    return n++ === 0 ? hang([])(input, init) : Promise.resolve(new Response('true'));
  }) as typeof fetch;
  const response = await createSupabaseFetch({ base, timeouts })(`${SUPA}/rest/v1/rpc/cashflow_rate_limit`, { method: 'POST', body: '{"p_key":"k"}' });
  assert.equal(await response.text(), 'true');
  assert.deepEqual(bodies, ['{"p_key":"k"}', '{"p_key":"k"}']);
});

test('a stalled write is cut off but never sent twice', async () => {
  const calls: string[] = [];
  const supabaseFetch = createSupabaseFetch({ base: hang(calls) as typeof fetch, timeouts });
  await assert.rejects(supabaseFetch(`${SUPA}/rest/v1/rpc/cashflow_apply_changes`, { method: 'POST', body: '[]' }), (error: unknown) => {
    assert.ok(error instanceof SupabaseTimeoutError);
    assert.equal(error.timeoutMs, 100);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('a read that stalls twice fails with the timeout instead of hanging', async () => {
  const calls: string[] = [];
  await assert.rejects(createSupabaseFetch({ base: hang(calls) as typeof fetch, timeouts })(`${SUPA}/auth/v1/user`), SupabaseTimeoutError);
  assert.equal(calls.length, 2);
});

test('the deadline stops once headers arrive, so a slow body is not cut halfway', async () => {
  const base = (async () => new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(new TextEncoder().encode('part one, '));
      await new Promise(resolve => setTimeout(resolve, 150)); // longer than the 80ms storage deadline
      controller.enqueue(new TextEncoder().encode('part two'));
      controller.close();
    },
  }))) as typeof fetch;
  const response = await createSupabaseFetch({ base, timeouts })(`${SUPA}/storage/v1/object/authenticated/x/y.xlsx`);
  assert.equal(await response.text(), 'part one, part two');
});

test('a caller that gives up is not retried', async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const pending = createSupabaseFetch({ base: hang(calls) as typeof fetch, timeouts })(`${SUPA}/rest/v1/cashflow_jobs`, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error('caller gave up')), 10);
  await assert.rejects(pending, /caller gave up/);
  assert.equal(calls.length, 1);
});

test('a dropped connection on a read is tried once more', async () => {
  let n = 0;
  const base = (async () => { if (n++ === 0) throw new TypeError('fetch failed'); return new Response('ok'); }) as typeof fetch;
  const response = await createSupabaseFetch({ base, timeouts })(`${SUPA}/rest/v1/rpc/cashflow_session_active`, { method: 'POST', body: '{}' });
  assert.equal(await response.text(), 'ok');
  assert.equal(n, 2);
});

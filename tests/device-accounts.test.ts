import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from '../backend/src/security/cookies.js';
import { forgetDeviceAccount, keepCurrentAside, listDeviceAccounts, rememberAccount, signOutDeviceAccounts, switchToAccount } from '../backend/src/security/deviceAccounts.js';
import { HttpError } from '../backend/src/http/guard.js';

// Switch accounts like Google or Facebook (owner, 2026-10-21): other signed-in accounts wait in sealed
// cookies; switching re-checks revocation; signing out ends every session on the browser.
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://device-accounts.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'device-accounts-test-only-secret-'.repeat(4);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
const sid = (id: string) => id.replace(/^./, 'a');
const token = (sub: string, email: string, name?: string) =>
  `e30.${Buffer.from(JSON.stringify({ sub, session_id: sid(sub), email, user_metadata: name ? { full_name: name } : {} })).toString('base64url')}.sig`;
const session = (sub: string, email: string, issuedAgoMs = 0) =>
  ({ access_token: token(sub, email, email.split('@')[0].toUpperCase()), refresh_token: `r-${sub}`, expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() - issuedAgoMs });

/** A cookie jar that applies Set-Cookie headers like a browser (by name; Max-Age=0 deletes). */
function browser() {
  const jar = new Map<string, string>();
  return {
    jar,
    set(name: string, value: unknown) { jar.set(name, seal(value)); },
    req() { return { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, query: {}, body: {} } as any; },
    res() {
      const headers: Record<string, unknown> = {};
      return {
        getHeader: (k: string) => headers[k.toLowerCase()],
        setHeader: (k: string, v: unknown) => { headers[k.toLowerCase()] = v; },
        apply() {
          for (const line of (headers['set-cookie'] as string[] | undefined) || []) {
            const [pair, ...attrs] = line.split('; ');
            const name = pair.slice(0, pair.indexOf('=')); const value = pair.slice(pair.indexOf('=') + 1);
            if (attrs.some(a => a === 'Max-Age=0') || !value) jar.delete(name); else jar.set(name, value);
          }
        },
        headers,
      } as any;
    },
    read<T>(name: string): T | null { const v = jar.get(name); return v ? unseal<T>(v) : null; },
  };
}

const realFetch = globalThis.fetch;
let revoked: string[] = [];
let activeSessions = new Set<string>();
beforeEach(() => {
  revoked = []; activeSessions = new Set([sid(A), sid(B), sid(C), sid(D), sid(E)]);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/rpc/cashflow_session_active')) {
      const body = JSON.parse(String(init?.body)); return json(activeSessions.has(body.p_session_id));
    }
    if (url.pathname.endsWith('/cashflow_revoked_sessions')) { const body = JSON.parse(String(init?.body)); revoked.push(body.session_id); return json([]); }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    throw new Error(`Unexpected ${url.pathname}`);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

test('signing in as another account keeps the current one signed in, and the list shows both', async () => {
  const b = browser();
  b.set('cashflow-session', session(A, 'a@example.com'));
  const res = b.res();
  await keepCurrentAside(b.req(), res, B);
  res.apply();
  b.set('cashflow-session', session(B, 'b@example.com'));
  const res2 = b.res(); rememberAccount(b.req(), res2, { id: B, email: 'b@example.com', name: 'บี' }); res2.apply();
  assert.equal(b.read<any>('cashflow-acct-2')?.refresh_token, `r-${A}`);
  const list = listDeviceAccounts(b.req());
  assert.deepEqual(list.map(x => [x.id, x.email, x.current, x.ready]), [[B, 'b@example.com', true, true], [A, 'a@example.com', false, true]]);
  assert.equal(list[0].name, 'บี');
  // The waiting cookie is scoped to the auth endpoint, so other API calls never carry it.
  assert.match(String((res.headers['set-cookie'] as string[])[0]), /Path=\/api\/auth; HttpOnly; SameSite=Lax/);
});

test('switching makes the waiting account active and puts the previous one in its place', async () => {
  const b = browser();
  b.set('cashflow-session', session(B, 'b@example.com'));
  b.set('cashflow-acct-2', session(A, 'a@example.com'));
  const res = b.res(); await switchToAccount(b.req(), res, A); res.apply();
  assert.equal(b.read<any>('cashflow-session')?.refresh_token, `r-${A}`);
  assert.equal(b.read<any>('cashflow-acct-2')?.refresh_token, `r-${B}`);
});

test('a revoked or unknown waiting account is not switched to, and a revoked one is dropped', async () => {
  const b = browser();
  b.set('cashflow-session', session(B, 'b@example.com'));
  b.set('cashflow-acct-2', session(A, 'a@example.com'));
  activeSessions.delete(sid(A));
  const res = b.res();
  await assert.rejects(switchToAccount(b.req(), res, A), (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'account_signin_required');
  res.apply();
  assert.equal(b.read('cashflow-acct-2'), null);
  assert.equal(b.read<any>('cashflow-session')?.refresh_token, `r-${B}`);
  await assert.rejects(switchToAccount(b.req(), b.res(), C), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('an account whose session ended (30 days unused) stays listed but needs its password again', async () => {
  const b = browser();
  b.set('cashflow-session', session(B, 'b@example.com'));
  b.set('cashflow-acct-2', session(A, 'a@example.com', 31 * 24 * 60 * 60 * 1000));
  b.set('cashflow-known', [{ id: A, email: 'a@example.com', at: Date.now() }]);
  assert.deepEqual(listDeviceAccounts(b.req()).map(x => [x.id, x.ready]), [[B, true], [A, false]]);
  await assert.rejects(switchToAccount(b.req(), b.res(), A), (error: unknown) => error instanceof HttpError && error.status === 409);
});

test('forgetting an account ends its waiting session and removes it; the active one cannot be forgotten here', async () => {
  const b = browser();
  b.set('cashflow-session', session(B, 'b@example.com'));
  b.set('cashflow-acct-3', session(A, 'a@example.com'));
  b.set('cashflow-known', [{ id: B, email: 'b@example.com', at: 2 }, { id: A, email: 'a@example.com', at: 1 }]);
  const res = b.res(); await forgetDeviceAccount(b.req(), res, A); res.apply();
  assert.deepEqual(revoked, [sid(A)]);
  assert.equal(b.read('cashflow-acct-3'), null);
  assert.deepEqual(listDeviceAccounts(b.req()).map(x => x.id), [B]);
  await assert.rejects(forgetDeviceAccount(b.req(), b.res(), B), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test('signing out ends every waiting session on this browser', async () => {
  const b = browser();
  b.set('cashflow-acct-2', session(A, 'a@example.com'));
  b.set('cashflow-acct-4', session(C, 'c@example.com'));
  const res = b.res(); await signOutDeviceAccounts(b.req(), res); res.apply();
  assert.deepEqual(revoked.sort(), [sid(A), sid(C)].sort());
  assert.equal(b.read('cashflow-acct-2'), null);
  assert.equal(b.read('cashflow-acct-4'), null);
});

test('with four accounts already here, a fifth replaces the oldest waiting one and ends it', async () => {
  const b = browser();
  b.set('cashflow-session', session(D, 'd@example.com'));
  b.set('cashflow-acct-2', session(A, 'a@example.com', 3 * 60 * 60 * 1000));
  b.set('cashflow-acct-3', session(B, 'b@example.com', 2 * 60 * 60 * 1000));
  b.set('cashflow-acct-4', session(C, 'c@example.com', 1 * 60 * 60 * 1000));
  const res = b.res(); await keepCurrentAside(b.req(), res, E); res.apply();
  assert.deepEqual(revoked, [sid(A)]);
  assert.equal(b.read<any>('cashflow-acct-2')?.refresh_token, `r-${D}`);
});

test('through the API: the list needs no provider call, and switching only works from our own pages', async () => {
  const { createApp } = await import('../backend/src/http/app.js');
  const server = await new Promise<import('node:http').Server>(resolve => { const s = createApp().listen(0, '127.0.0.1', () => resolve(s)); });
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const cookie = `cashflow-session=${seal(session(B, 'b@example.com'))}; cashflow-acct-2=${seal(session(A, 'a@example.com'))}`;
    const list = await realFetch(`${origin}/api/auth?accounts=1`, { headers: { cookie } });
    assert.equal(list.status, 200);
    assert.deepEqual(((await list.json()) as any).accounts.map((x: any) => [x.email, x.current, x.ready]), [['b@example.com', true, true], ['a@example.com', false, true]]);
    const body = JSON.stringify({ action: 'switch-account', accountId: A });
    const forged = await realFetch(`${origin}/api/auth`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body });
    assert.equal(forged.status, 403); // no origin / CSRF header: refused
    const ok = await realFetch(`${origin}/api/auth`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: process.env.APP_URL!, 'x-csrf-protection': '1' }, body });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.getSetCookie();
    assert.ok(setCookie.some(line => line.startsWith('cashflow-session=') && /HttpOnly/.test(line)));
    assert.ok(setCookie.some(line => line.startsWith('cashflow-acct-2=') && /Path=\/api\/auth/.test(line)));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

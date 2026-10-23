import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';

// When Supabase Auth is slow or briefly down, a signed-in person must stay signed in: the session
// check answers 503 (the browser asks again) instead of clearing the cookie as an expired session.
process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://slow-session.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'slow-session-test-only-secret-'.repeat(4);

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'slow@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const realFetch = globalThis.fetch;
let authAnswer: 'ok' | 'unavailable' | 'invalid' = 'ok';
let server: Server;
let origin: string;

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') {
      if (authAnswer === 'unavailable') return json({ message: 'upstream timeout' }, 503);
      if (authAnswer === 'invalid') return json({ code: 'bad_jwt', message: 'invalid JWT' }, 401);
      return json(user);
    }
    if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role: 'user' });
    if (url.pathname.endsWith('/cashflow_profiles')) return json([{ user_id: user.id, public_id: 'SQ-0000000001', display_name: 'Slow', created_at: user.created_at }]);
    return json([]);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

const sessionCheck = () => realFetch(`${origin}/api/auth`, { headers: { cookie, 'x-csrf-protection': '1' } });
const clearsSession = (response: Response) => (response.headers.get('set-cookie') || '').split(/,(?=\s*[\w-]+=)/).some(part => /^\s*cashflow-session=;/.test(part) || /cashflow-session=[^;]*;.*Max-Age=0/i.test(part));

test('a slow Supabase Auth answers 503 and keeps the session cookie', async () => {
  authAnswer = 'unavailable';
  const response = await sessionCheck();
  assert.equal(response.status, 503);
  assert.equal(clearsSession(response), false);
});

test('a token Supabase rejects still signs the person out, as before', async () => {
  authAnswer = 'invalid';
  const response = await sessionCheck();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { session: null });
  assert.equal(clearsSession(response), true);
});

test('a healthy check returns the session', async () => {
  authAnswer = 'ok';
  const response = await sessionCheck();
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { session: { user: { id: string } } }).session.user.id, user.id);
});

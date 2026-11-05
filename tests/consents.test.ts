import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { CONSENT_VERSIONS, isConsented, readConsents, withConsent } from '../shared/consents';
import { routeHandler } from '../backend/src/http/router';
import { seal } from '../backend/src/security/cookies';

// Owner, 2026-11-05: "อะไรที่มันเป็นข้อมูลที่เซนซิทีฟทุกจุด ... ให้เขายืนยันหรือยินยอมเราก่อน ... ข้อมูลของ AI เองอาจจะมี
// ข้อผิดพลาดในการตอบ ... เขียนแจ้งเตือนหรือให้เขากดยินยอม". The records of what an account agreed to, kept by the server.

test('records: only well-formed entries count; the current version, not withdrawn, is consent', () => {
  const at = '2026-11-05T01:00:00.000Z';
  const records = readConsents({ terms: { version: CONSENT_VERSIONS.terms, at }, ai: { version: 'old', at }, line: { version: CONSENT_VERSIONS.line, at: 'not a date' }, extra: { version: 'x', at } });
  assert.deepEqual(Object.keys(records), ['terms', 'ai']);
  assert.equal(isConsented(records, 'terms'), true);
  assert.equal(isConsented(records, 'ai'), false, 'an older text asks again');
  assert.equal(isConsented(records, 'line'), false);
  for (const raw of [null, undefined, 'yes', [], 42]) assert.deepEqual(readConsents(raw), {});
});

test('agreeing keeps the version and the time; withdrawing keeps the agreement with when it was withdrawn', () => {
  const agreed = withConsent({}, 'ai', true, new Date('2026-11-05T02:00:00Z'));
  assert.deepEqual(agreed.ai, { version: CONSENT_VERSIONS.ai, at: '2026-11-05T02:00:00.000Z' });
  const withdrawn = withConsent(agreed, 'ai', false, new Date('2026-11-06T02:00:00Z'));
  assert.deepEqual(withdrawn.ai, { version: CONSENT_VERSIONS.ai, at: '2026-11-05T02:00:00.000Z', withdrawnAt: '2026-11-06T02:00:00.000Z' });
  assert.equal(isConsented(withdrawn, 'ai'), false);
  assert.equal(isConsented(withConsent(withdrawn, 'ai', true), 'ai'), true, 'agreeing again counts again');
  assert.deepEqual(withConsent({}, 'line', false), {}, 'nothing to withdraw stays nothing');
});

test('the consent route needs the same-origin check, and เลขา and LINE refuse without the record', () => {
  const router = readFileSync(new URL('../backend/src/http/router.ts', import.meta.url), 'utf8');
  assert.match(router, /routes\.consent = consent;/);
  assert.match(router, /'assistant','consent'(,'[a-z-]+')*\]\.includes\(route\)/);
  const assistant = readFileSync(new URL('../backend/src/handlers/assistant.ts', import.meta.url), 'utf8');
  assert.equal((assistant.match(/await requireAiConsent\(user\.id\)/g) ?? []).length, 3, 'chat, voice and the import chat');
  assert.match(assistant, /hasConsent\(user\.id, 'ai'\)\)\) \{ res\.json\(\{ columns: \[\], available: false/);
  const link = readFileSync(new URL('../backend/src/handlers/line-link-code.ts', import.meta.url), 'utf8');
  assert.match(link, /hasConsent\(user\.id,'line'\).*line_consent_required/);
  assert.match(link, /saveConsent\(user\.id,'line',false\)/, 'disconnecting withdraws the LINE consent');
});

// The handler over HTTP, against a stand-in database that keeps one account's private state.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const realFetch = globalThis.fetch;
let stored: Record<string, Record<string, unknown>>;
let patches: { user: string; patch: Record<string, unknown> }[];
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  Object.assign(process.env, {
    APP_URL: 'https://consent.example.test', SUPABASE_URL: 'https://consent.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
    SESSION_SECRET: 'consent-test-only-session-secret-'.repeat(4),
  });
  stored = { [A]: {}, [B]: { consents: { ai: { version: CONSENT_VERSIONS.ai, at: '2026-11-01T00:00:00.000Z' } } } };
  patches = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host !== 'consent.supabase.co') throw new Error('External network disabled');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname === '/auth/v1/user') {
      const bearer = new Headers(init?.headers).get('authorization')!.replace(/^Bearer /, '');
      const id = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      return json({ id, email: `${id.slice(0, 4)}@example.test`, email_confirmed_at: '2020-01-01T00:00:00Z', created_at: '2020-01-01T00:00:00Z' });
    }
    if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/cashflow_private_state') && url.searchParams.get('select') === 'consents:data->consents') {
      const owner = url.searchParams.get('user_id')!.replace(/^eq\./, '');
      return json({ consents: stored[owner]?.consents ?? null });
    }
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      patches.push({ user: body.p_user_id, patch: body.p_patch });
      stored[body.p_user_id] = { ...stored[body.p_user_id], ...body.p_patch };
      return json(null);
    }
    throw new Error(`Unexpected mocked route ${url.pathname}`);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

async function request(owner: string, body?: unknown, headerOwner = owner) {
  const accessToken = `e30.${Buffer.from(JSON.stringify({ sub: owner, session_id: owner.replace(/^./, 'c') })).toString('base64url')}.synthetic`;
  const session = seal({ access_token: accessToken, refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() });
  const raw = Buffer.from(JSON.stringify(body ?? {}));
  const req = Object.assign(Readable.from([raw]), {
    method: body ? 'POST' : 'GET', url: '/api/consent', query: {}, socket: { remoteAddress: '127.0.0.1' },
    headers: { cookie: `__Host-cashflow-session=${session}`, 'x-account-id': headerOwner, origin: process.env.APP_URL!,
      'x-csrf-protection': '1', 'content-type': 'application/json', 'content-length': String(raw.length) },
  });
  const result = { status: 200, body: undefined as any };
  const headers = new Map<string, unknown>();
  const res = {
    headersSent: false,
    setHeader(name: string, value: unknown) { headers.set(name.toLowerCase(), value); },
    getHeader(name: string) { return headers.get(name.toLowerCase()); }, hasHeader(name: string) { return headers.has(name.toLowerCase()); },
    status(status: number) { result.status = status; return this; },
    json(value: unknown) { result.body = value; this.headersSent = true; return this; },
  };
  await routeHandler('consent')(req as any, res as any);
  return result;
}

test('over HTTP: each account reads and writes only its own record; agreeing needs the current words', async () => {
  const first = await request(A);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { consents: {}, versions: CONSENT_VERSIONS });

  const stale = await request(A, { key: 'terms', accepted: true, version: '2020-01-01' });
  assert.deepEqual([stale.status, stale.body.code], [409, 'consent_outdated']);
  const missing = await request(A, { key: 'terms', accepted: true });
  assert.equal(missing.status, 409, 'agreeing without saying which words is refused');
  assert.equal((await request(A, { key: 'terms', accepted: true, version: CONSENT_VERSIONS.terms, extra: 1 })).status, 400, 'nothing else is accepted');

  const agreed = await request(A, { key: 'terms', accepted: true, version: CONSENT_VERSIONS.terms });
  assert.equal(agreed.status, 200);
  assert.equal(agreed.body.consents.terms.version, CONSENT_VERSIONS.terms);
  assert.deepEqual(patches.map(item => item.user), [A], 'written to the signed-in account only');
  assert.deepEqual(Object.keys(stored[B].consents as object), ['ai'], 'the other account is untouched');

  // Someone else's account in the header is refused.
  assert.equal((await request(A, { key: 'ai', accepted: true, version: CONSENT_VERSIONS.ai }, B)).status, 401);

  // เลขา is withdrawn here; the terms end with the account and LINE by disconnecting it.
  const withdrawn = await request(B, { key: 'ai', accepted: false });
  assert.equal(withdrawn.status, 200);
  assert.ok(withdrawn.body.consents.ai.withdrawnAt);
  assert.equal(isConsented(readConsents(stored[B].consents), 'ai'), false);
  assert.equal((await request(A, { key: 'terms', accepted: false })).status, 400);
  assert.equal((await request(A, { key: 'line', accepted: false })).status, 400);
});

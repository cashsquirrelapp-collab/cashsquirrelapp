import { test } from 'node:test';
import assert from 'node:assert/strict';

// เข้าสู่ระบบด้วย LINE and one-click เชื่อม LINE (owner, 2026-11-14: "เข้าทางไหนก็ได้"): LINE Login's web sign-in, the
// LINE user taken only from the ID token LINE checks, state and nonce kept in a sealed cookie, nothing without the secret.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.SESSION_SECRET = 'line-login-test-only-secret-'.repeat(3);
process.env.LINE_CHANNEL_ID = '2012039027';
const { createLineLoginHandler, lineLoginReady, safeReturnTo } = await import('../backend/src/handlers/line-login.js');
type Deps = Parameters<typeof createLineLoginHandler>[0] & object;

const LINE_ID = 'U0123456789abcdef0123456789abcdef';
function fakeResponse() {
  const res: any = { statusCode: 200, headers: {}, body: undefined as unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: unknown) => { res.headers[name.toLowerCase()] = value; };
  res.getHeader = (name: string) => res.headers[name.toLowerCase()];
  res.end = () => res;
  return res;
}
const cookieFrom = (res: any) => (res.headers['set-cookie'] as string[]).find(line => line.includes('cashflow-line-oauth=') && !line.includes('Max-Age=0'))!.split(';')[0];
const post = (body: unknown, account?: string) => ({ method: 'POST', body, headers: { 'x-csrf-protection': '1', origin: 'https://staging.krarok.com', host: 'staging.krarok.com', ...(account ? { 'x-account-id': account } : {}) }, query: {} }) as any;
const back = (cookie: string, query: Record<string, string>) => ({ method: 'GET', headers: { cookie }, query }) as any;

function setup(over: Partial<Deps> = {}) {
  const log: string[] = [];
  let n = 0;
  const deps: Deps = {
    ready: () => true,
    user: async () => ({ id: 'user-1' }),
    consented: async () => true,
    random: () => `rand-${++n}`,
    now: () => Date.parse('2026-11-14T08:00:00Z'),
    identify: async (code, nonce) => (code === 'good-code' && nonce === 'rand-2' ? { sub: LINE_ID } : null),
    allowed: () => true,
    accountOf: async () => 'user-1',
    lineOf: async () => null,
    access: async () => undefined,
    issue: async userId => ({ user: { id: userId } }) as any,
    adopt: async (_req, _res, session) => { log.push(`adopt:${session.user.id}`); },
    link: async (userId, sub) => { log.push(`link:${userId}:${sub === LINE_ID}`); },
    welcome: async () => { log.push('welcome'); },
    ...over,
  };
  return { deps, log };
}

async function start(deps: Deps, body: unknown, account?: string) {
  const res = fakeResponse();
  await createLineLoginHandler(deps)(post(body, account), res);
  return res;
}

test('line login: off without the LINE Login channel secret; the address only ever returns to this app', () => {
  assert.equal(lineLoginReady({ LINE_CHANNEL_ID: '2012039027' }), false);
  assert.equal(lineLoginReady({ LINE_CHANNEL_ID: '2012039027', LINE_LOGIN_CHANNEL_SECRET: 'x'.repeat(32) }), true);
  assert.equal(safeReturnTo('/jobs'), '/jobs');
  for (const bad of ['//evil.example', 'https://evil.example', '/api/auth', 'jobs', 42]) assert.equal(safeReturnTo(bad), '/');
});

test('line login: เข้าสู่ระบบด้วย LINE opens the account linked to that LINE, the open one waits in the switcher', async () => {
  const { deps, log } = setup();
  const res = await start(deps, { purpose: 'signin', returnTo: '/jobs' });
  const url = new URL(res.body.url);
  assert.equal(url.origin + url.pathname, 'https://access.line.me/oauth2/v2.1/authorize');
  assert.equal(url.searchParams.get('client_id'), '2012039027');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://staging.krarok.com/api/line-login');
  assert.equal(url.searchParams.get('scope'), 'openid profile');
  assert.equal(url.searchParams.get('state'), 'rand-1');
  assert.equal(url.searchParams.get('nonce'), 'rand-2');
  const done = fakeResponse();
  await createLineLoginHandler(deps)(back(cookieFrom(res), { code: 'good-code', state: 'rand-1' }), done);
  assert.equal(done.statusCode, 302);
  assert.equal(done.headers.location, 'https://staging.krarok.com/jobs');
  assert.deepEqual(log, ['adopt:user-1']);
});

test('line login: a LINE with no account, a forged state, a refused code, a cancel or a stranger on staging opens nothing', async () => {
  const cases: [Partial<Deps>, Record<string, string>, string][] = [
    [{ accountOf: async () => null }, { code: 'good-code', state: 'rand-1' }, '/login?line=not_linked'],
    [{}, { code: 'good-code', state: 'forged' }, '/login?line=failed'],
    [{}, { code: 'bad-code', state: 'rand-1' }, '/login?line=failed'],
    [{}, { error: 'access_denied', state: 'rand-1' }, '/login?line=cancelled'],
    [{ allowed: () => false }, { code: 'good-code', state: 'rand-1' }, '/login?line=staging'],
  ];
  for (const [over, query, location] of cases) {
    const { deps, log } = setup(over);
    const res = await start(deps, { purpose: 'signin' });
    const done = fakeResponse();
    await createLineLoginHandler(deps)(back(cookieFrom(res), query), done);
    assert.equal(done.headers.location, `https://staging.krarok.com${location}`, JSON.stringify(query));
    assert.deepEqual(log, []);
  }
  // No cookie at all (a link opened in another browser, or after ten minutes).
  const { deps } = setup();
  const lost = fakeResponse();
  await createLineLoginHandler(deps)(back('', { code: 'good-code', state: 'rand-1' }), lost);
  assert.equal(lost.headers.location, 'https://staging.krarok.com/login?line=failed');
});

test('line login: เชื่อม LINE links the signed-in account in one click, after its LINE consent', async () => {
  const { deps, log } = setup({ accountOf: async () => null });
  const res = await start(deps, { purpose: 'link' }, 'user-1');
  const done = fakeResponse();
  await createLineLoginHandler(deps)(back(cookieFrom(res), { code: 'good-code', state: 'rand-1' }), done);
  assert.equal(done.headers.location, 'https://staging.krarok.com/settings?line=linked');
  assert.deepEqual(log, ['link:user-1:true', 'welcome']);

  const noConsent = await start(setup({ consented: async () => false }).deps, { purpose: 'link' }, 'user-1');
  assert.equal(noConsent.statusCode, 428);
  const wrongAccount = await start(setup().deps, { purpose: 'link' }, 'user-9');
  assert.equal(wrongAccount.statusCode, 401);
});

test('line login: a LINE already on another account, or an account already on another LINE, is not linked', async () => {
  const cases: [Partial<Deps>, string][] = [
    [{ accountOf: async () => 'user-2' }, '/settings?line=taken'],
    [{ accountOf: async () => null, lineOf: async () => 'U' + 'f'.repeat(32) }, '/settings?line=other'],
    [{ accountOf: async () => null, user: async () => ({ id: 'user-2' }) }, '/settings?line=failed'],
  ];
  for (const [over, location] of cases) {
    const { deps, log } = setup(over);
    const res = await start({ ...deps, user: async () => ({ id: 'user-1' }) }, { purpose: 'link' }, 'user-1');
    const done = fakeResponse();
    await createLineLoginHandler(deps)(back(cookieFrom(res), { code: 'good-code', state: 'rand-1' }), done);
    assert.equal(done.headers.location, `https://staging.krarok.com${location}`);
    assert.ok(!log.some(line => line.startsWith('link:')));
  }
});

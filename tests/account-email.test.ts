import { test } from 'node:test';
import assert from 'node:assert/strict';

// An account made in LINE adds an email and a password for the website (owner, 2026-11-14: "เข้าทางไหนก็ได้ ... ใช้ใน
// เว็บไซต์ได้เหมือนกัน"): the password is set at once, the address only after the link sent to it is opened.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.SESSION_SECRET = 'account-email-test-only-secret-'.repeat(3);
const { createAccountEmailHandler } = await import('../backend/src/handlers/account-email.js');
type Deps = Parameters<typeof createAccountEmailHandler>[0] & object;

const LINE_EMAIL = 'u0123456789abcdef0123456789abcdef@line.krarok.invalid';
function fakeResponse() {
  const res: any = { statusCode: 200, headers: {}, body: undefined as unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: unknown) => { res.headers[name.toLowerCase()] = value; };
  res.getHeader = (name: string) => res.headers[name.toLowerCase()];
  res.end = () => res;
  return res;
}
const post = (body: unknown, account = 'user-1') => ({ method: 'POST', body, headers: { 'x-csrf-protection': '1', origin: 'https://staging.krarok.com', host: 'staging.krarok.com', 'x-account-id': account }, query: {} }) as any;
const get = (token: string) => ({ method: 'GET', headers: {}, query: { token } }) as any;

function setup(over: Partial<Deps> = {}) {
  const log: string[] = [];
  let email = LINE_EMAIL;
  let link = '';
  const deps: Deps = {
    user: async () => ({ id: 'user-1', email, user_metadata: { display_name: 'ปาร์ค' } }),
    limit: async () => undefined,
    allowed: () => true,
    holder: async address => (address === 'taken@example.com' ? 'user-2' : null),
    setPassword: async (_id, password) => { log.push(`password:${password}`); },
    send: async (to, _name, url) => { log.push(`send:${to}`); link = url; return true; },
    current: async () => email,
    setEmail: async (_id, address) => { if (address === 'raced@example.com') return false; email = address; log.push(`email:${address}`); return true; },
    now: () => Date.parse('2026-11-14T08:00:00Z'),
    ...over,
  };
  return { deps, log, token: () => new URL(link).searchParams.get('token') ?? '', email: () => email };
}

test('add email: the password is set, a link goes to the address, the address is the account\'s only after the link', async () => {
  const run = setup();
  const res = fakeResponse();
  await createAccountEmailHandler(run.deps)(post({ email: ' Park@Example.com ', password: 'krarok2569' }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(run.log, ['password:krarok2569', 'send:park@example.com']);
  assert.equal(run.email(), LINE_EMAIL, 'nothing changes before the link is opened');
  const back = fakeResponse();
  await createAccountEmailHandler(run.deps)(get(run.token()), back);
  assert.equal(back.statusCode, 302);
  assert.equal(back.headers.location, 'https://staging.krarok.com/settings?loginEmail=added');
  assert.equal(run.email(), 'park@example.com');
  // Opened again: still fine, nothing replaced.
  const again = fakeResponse();
  await createAccountEmailHandler(run.deps)(get(run.token()), again);
  assert.equal(again.headers.location, 'https://staging.krarok.com/settings?loginEmail=added');
});

test('add email: refused for an account that already has one, a weak password, an address in use, or another account id', async () => {
  const cases: [unknown, Partial<Deps>, number, string?][] = [
    [{ email: 'a@example.com', password: 'krarok2569' }, { user: async () => ({ id: 'user-1', email: 'me@example.com' }) }, 409],
    [{ email: 'a@example.com', password: 'short1' }, {}, 400, 'รหัสผ่านต้องยาว'],
    [{ email: 'a@example.com', password: 'onlyletters' }, {}, 400],
    [{ email: 'not-an-email', password: 'krarok2569' }, {}, 400],
    [{ email: 'taken@example.com', password: 'krarok2569' }, {}, 409, 'อีเมลนี้ใช้กับบัญชีอื่นอยู่แล้ว'],
    [{ email: 'a@example.com', password: 'krarok2569' }, { allowed: () => false }, 403],
  ];
  for (const [body, over, status, text] of cases) {
    const run = setup(over);
    const res = fakeResponse();
    await createAccountEmailHandler(run.deps)(post(body), res);
    assert.equal(res.statusCode, status, JSON.stringify(body));
    if (text) assert.match(String((res.body as { error?: string }).error), new RegExp(text));
    assert.deepEqual(run.log, [], 'nothing set, nothing sent');
  }
  const run = setup();
  const res = fakeResponse();
  await createAccountEmailHandler(run.deps)(post({ email: 'a@example.com', password: 'krarok2569' }, 'user-9'), res);
  assert.equal(res.statusCode, 401);
});

test('add email: a stale, forged or overtaken link changes nothing', async () => {
  const run = setup();
  await createAccountEmailHandler(run.deps)(post({ email: 'raced@example.com', password: 'krarok2569' }), fakeResponse());
  const raced = fakeResponse();
  await createAccountEmailHandler(run.deps)(get(run.token()), raced);
  assert.equal(raced.headers.location, 'https://staging.krarok.com/settings?loginEmail=taken', 'taken by another account meanwhile');
  const forged = fakeResponse();
  await createAccountEmailHandler(run.deps)(get('not-a-token'), forged);
  assert.equal(forged.headers.location, 'https://staging.krarok.com/settings?loginEmail=expired');
  const late = setup({ now: () => Date.parse('2026-11-14T08:00:00Z') });
  await createAccountEmailHandler(late.deps)(post({ email: 'late@example.com', password: 'krarok2569' }), fakeResponse());
  const lateRes = fakeResponse();
  await createAccountEmailHandler({ ...late.deps, now: () => Date.parse('2026-11-16T08:00:00Z') })(get(late.token()), lateRes);
  assert.equal(lateRes.headers.location, 'https://staging.krarok.com/settings?loginEmail=expired');
  assert.equal(late.email(), LINE_EMAIL);
});

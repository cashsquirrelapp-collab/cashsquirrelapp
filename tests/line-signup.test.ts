import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLineOnlyEmail, LINE_ONLY_DOMAIN } from '../shared/lineAccount.js';
import { freeBucket, freeMonthlyTokens, lineOnlyEmail, lineSignupOn } from '../backend/src/services/lineFirst.js';
import { lineSignupSchema, settingsFor, signUpFromLine, type LineSignupDeps } from '../backend/src/services/lineSignup.js';
import { createLineSignupHandler, type LineSignupHandlerDeps } from '../backend/src/handlers/line-signup.js';
import { buildLineStart } from '../backend/src/services/lineLinkCards.js';
import { validateChanges } from '../shared/validation.js';

// Sign-up inside LINE and the free monthly allowance (owner, 2026-11-13: "แอด LINE แล้วใช้ได้เลย", "ชื่อ + ประเภทงาน",
// "200 โทเคน/เดือน", real site only after Gemini is topped up). Off by default; staging switches it on.

process.env.APP_URL = 'https://staging.krarok.com';
const LINE_ID = 'U0123456789abcdef0123456789abcdef';
const KEY = 'k'.repeat(40);

test('both switches are off unless set, so the real site keeps working as today', () => {
  assert.equal(lineSignupOn({}), false);
  assert.equal(lineSignupOn({ LINE_SIGNUP: 'yes' }), false);
  assert.equal(lineSignupOn({ LINE_SIGNUP: 'enabled' }), true);
  assert.equal(freeMonthlyTokens({}), 0);
  assert.equal(freeMonthlyTokens({ FREE_MONTHLY_TOKENS: '200' }), 200);
  assert.equal(freeMonthlyTokens({ FREE_MONTHLY_TOKENS: 'lots' }), 0);
  assert.equal(freeMonthlyTokens({ FREE_MONTHLY_TOKENS: '-5' }), 0);
  assert.equal(freeMonthlyTokens({ FREE_MONTHLY_TOKENS: '999999' }), 0);
});

test('the free month refills on the 1st, Bangkok time', () => {
  assert.equal(freeBucket(new Date('2026-11-13T05:00:00Z')), '2026-11-01');
  // 31 Oct 18:00 UTC is already 1 Nov in Bangkok.
  assert.equal(freeBucket(new Date('2026-10-31T18:00:00Z')), '2026-11-01');
  assert.equal(freeBucket(new Date('2026-10-31T16:59:00Z')), '2026-10-01');
});

test('a LINE account has a made-up address that can never get mail, the same one on a retry, saying nothing of the LINE ID', () => {
  const email = lineOnlyEmail(LINE_ID, KEY);
  assert.equal(email, lineOnlyEmail(LINE_ID, KEY));
  assert.notEqual(email, lineOnlyEmail('U' + 'f'.repeat(32), KEY));
  assert.ok(email.endsWith(`@${LINE_ONLY_DOMAIN}`));
  assert.ok(!email.includes(LINE_ID.slice(1, 12)));
  assert.equal(isLineOnlyEmail(email), true);
  assert.equal(isLineOnlyEmail('someone@gmail.com'), false);
  assert.throws(() => lineOnlyEmail(LINE_ID, ''));
});

test('the first settings pass the app\'s own checks and record the work type as a finished welcome', () => {
  const settings = settingsFor({ workType: 'business_owner' }, new Date('2026-11-13T05:00:00Z'));
  assert.doesNotThrow(() => validateChanges([{ table: 'cashflow_documents', id: 'settings', op: 'set', version: null, data: settings }]));
  assert.equal(settings.monthlyExpense, 0);
  assert.equal(settings.profileSetupCompleted, true);
  assert.equal(settings.onboarding?.status, 'COMPLETED');
  assert.equal(settings.onboarding?.work_type, 'business_owner');
  assert.equal(settingsFor({ workType: 'other', workTypeOther: 'ร้านขนม' }, new Date()).onboarding?.work_type_other, 'ร้านขนม');
  assert.equal(settingsFor({ workType: 'freelance', workTypeOther: 'ignored' }, new Date()).onboarding?.work_type_other, null);
});

function fakeDeps(over: Partial<LineSignupDeps> = {}) {
  const calls: string[] = [];
  const deps: LineSignupDeps = {
    linked: async () => null,
    createUser: async email => { calls.push(`create:${email.split('@')[1]}`); return 'user-1'; },
    findUser: async () => { calls.push('find'); return 'user-old'; },
    link: async (userId, lineUserId) => { calls.push(`link:${userId}:${lineUserId === LINE_ID}`); },
    consent: async (userId, key) => { calls.push(`consent:${key}`); },
    profile: async (userId, name) => { calls.push(`profile:${name}`); },
    settings: async (userId, settings) => { calls.push(`settings:${settings.onboarding?.work_type}`); },
    key: () => KEY,
    now: () => new Date('2026-11-13T05:00:00Z'),
    ...over,
  };
  return { deps, calls };
}

test('sign-up makes the account, links this LINE, keeps all three agreements, the name and the work type', async () => {
  const { deps, calls } = fakeDeps();
  const result = await signUpFromLine(LINE_ID, { name: 'ปาร์ค', workType: 'freelance' }, deps);
  assert.deepEqual(result, { userId: 'user-1', created: true });
  assert.deepEqual(calls, [`create:${LINE_ONLY_DOMAIN}`, 'link:user-1:true', 'consent:terms', 'consent:ai', 'consent:line', 'profile:ปาร์ค', 'settings:freelance']);
});

test('a LINE chat already linked makes nothing new; a half-finished sign-up is picked up, not doubled', async () => {
  const linked = fakeDeps({ linked: async () => 'web-user' });
  assert.deepEqual(await signUpFromLine(LINE_ID, { name: 'ปาร์ค', workType: 'freelance' }, linked.deps), { userId: 'web-user', created: false });
  assert.deepEqual(linked.calls, []);
  const retry = fakeDeps({ createUser: async () => null });
  assert.deepEqual(await signUpFromLine(LINE_ID, { name: 'ปาร์ค', workType: 'student' }, retry.deps), { userId: 'user-old', created: true });
  assert.equal(retry.calls[0], 'find');
});

test('the form must have a name, a work type and the terms ticked', () => {
  const ok = { idToken: 't', name: 'ปาร์ค', workType: 'freelance', agreed: true };
  assert.equal(lineSignupSchema.safeParse(ok).success, true);
  assert.equal(lineSignupSchema.safeParse({ ...ok, name: 'ก' }).success, false);
  assert.equal(lineSignupSchema.safeParse({ ...ok, workType: 'astronaut' }).success, false);
  assert.equal(lineSignupSchema.safeParse({ ...ok, agreed: false }).success, false);
  assert.equal(lineSignupSchema.safeParse({ ...ok, lineUserId: LINE_ID }).success, false);
});

function fakeResponse() {
  const res: any = { statusCode: 200, headers: {}, body: undefined as unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: unknown) => { res.headers[name.toLowerCase()] = value; };
  res.getHeader = (name: string) => res.headers[name.toLowerCase()];
  res.end = () => res;
  return res;
}
const request = (body: unknown) => ({ method: 'POST', body, headers: { 'x-csrf-protection': '1', origin: 'https://staging.krarok.com', host: 'staging.krarok.com' }, query: {} }) as any;

function handlerDeps(over: Partial<LineSignupHandlerDeps> = {}) {
  const log: string[] = [];
  const deps: LineSignupHandlerDeps = {
    on: () => true,
    verify: async token => (token === 'good' ? LINE_ID : null),
    limit: async () => undefined as any,
    signup: async () => { log.push('signup'); return { userId: 'user-1', created: true }; },
    access: async () => undefined,
    issue: async userId => { log.push('issue'); return { user: { id: userId } } as any; },
    store: () => { log.push('store'); },
    revoke: async () => { log.push('revoke'); },
    welcome: async () => { log.push('welcome'); },
    ...over,
  };
  return { deps, log };
}

test('the sign-up endpoint signs the person in and sends the welcome card, answering with navigation only', async () => {
  const { deps, log } = handlerDeps();
  const res = fakeResponse();
  await createLineSignupHandler(deps)(request({ idToken: 'good', name: 'ปาร์ค', workType: 'freelance', agreed: true }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, created: true, destination: null });
  assert.deepEqual(log, ['signup', 'issue', 'store', 'welcome']);
});

test('the endpoint is closed when switched off, refuses an unverified LINE identity and an unticked form', async () => {
  const off = handlerDeps({ on: () => false });
  const closed = fakeResponse();
  await createLineSignupHandler(off.deps)(request({ idToken: 'good', name: 'ปาร์ค', workType: 'freelance', agreed: true }), closed);
  assert.equal(closed.statusCode, 404);
  const bad = handlerDeps();
  const refused = fakeResponse();
  await createLineSignupHandler(bad.deps)(request({ idToken: 'forged', name: 'ปาร์ค', workType: 'freelance', agreed: true }), refused);
  assert.equal(refused.statusCode, 401);
  const unticked = fakeResponse();
  await createLineSignupHandler(bad.deps)(request({ idToken: 'good', name: 'ปาร์ค', workType: 'freelance', agreed: false }), unticked);
  assert.equal(unticked.statusCode, 400);
  assert.deepEqual(bad.log, []);
});

test('a welcome card that fails to send never fails the sign-up; an existing link gets no second welcome', async () => {
  const failing = handlerDeps({ welcome: async () => { throw new Error('LINE down'); } });
  const res = fakeResponse();
  await createLineSignupHandler(failing.deps)(request({ idToken: 'good', name: 'ปาร์ค', workType: 'freelance', agreed: true }), res);
  assert.equal(res.statusCode, 200);
  const again = handlerDeps({ signup: async () => ({ userId: 'user-1', created: false }) });
  await createLineSignupHandler(again.deps)(request({ idToken: 'good', name: 'ปาร์ค', workType: 'freelance', agreed: true }), fakeResponse());
  assert.equal(again.log.includes('welcome'), false);
});

test('the เริ่มใช้งาน card opens the sign-up page inside LINE', () => {
  const card = buildLineStart('2012039027-neCxHo9L') as any;
  assert.equal(card.contents.footer.contents[0].action.uri, 'https://liff.line.me/2012039027-neCxHo9L?start=1');
  assert.equal(card.contents.footer.contents[0].action.label, 'เริ่มใช้งาน');
  assert.match(card.altText, /เริ่มใช้งาน/);
});

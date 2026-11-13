import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_MS, consumeHandoff, createHandoff, type HandoffDeps } from '../backend/src/services/webHandoff.js';
import { createLineHandoffHandler, type LineHandoffDeps } from '../backend/src/handlers/line-handoff.js';
import { buildLineConnectSheet, buildLineSheetConnected } from '../backend/src/services/lineSheetCards.js';
import { makeState, readState, stateBack } from '../backend/src/services/googleSheets.js';

// เชื่อมชีตจาก LINE (owner, 2026-11-13): Google refuses sign-in inside LINE, so the LINE page asks for a one-use link the
// phone's own browser opens, signed in; Google's sign-in then comes back to /connect-sheets.

process.env.APP_URL = 'https://staging.krarok.com';
process.env.SESSION_SECRET ??= 'test-secret-only-'.repeat(4);
process.env.GOOGLE_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64'); // a test key, 32 bytes as the real one
const USER = '11111111-2222-4333-8444-555555555555';

function memory(now = { at: 1_000_000 }) {
  const kept = new Map<string, unknown>();
  const deps: HandoffDeps = {
    load: async userId => kept.get(userId) ?? null,
    save: async (userId, value) => { kept.set(userId, value); },
    clear: async userId => { kept.delete(userId); },
    now: () => now.at,
  };
  return { deps, kept, now };
}

test('a link opens its account once, within five minutes, for its purpose only', async () => {
  const { deps, kept, now } = memory();
  const token = await createHandoff(USER, 'sheets', deps);
  assert.ok(token.startsWith(`${USER}.`));
  assert.ok(!JSON.stringify(kept.get(USER)).includes(token.split('.')[1]), 'only a hash is kept');
  assert.equal(await consumeHandoff(token, 'sheets', deps), USER);
  assert.equal(await consumeHandoff(token, 'sheets', deps), null, 'used up');
  const late = await createHandoff(USER, 'sheets', deps);
  now.at += HANDOFF_MS + 1;
  assert.equal(await consumeHandoff(late, 'sheets', deps), null, 'too old');
});

test('a guess or a changed link opens nothing and does not cancel the real one; a newer link replaces the older', async () => {
  const { deps } = memory();
  const first = await createHandoff(USER, 'sheets', deps);
  const second = await createHandoff(USER, 'sheets', deps);
  assert.equal(await consumeHandoff(`${USER}.${'A'.repeat(32)}`, 'sheets', deps), null);
  assert.equal(await consumeHandoff('not-a-token', 'sheets', deps), null);
  assert.equal(await consumeHandoff(`${USER}.${second.split('.')[1]}.extra`, 'sheets', deps), null);
  assert.equal(await consumeHandoff(first, 'sheets', deps), null, 'the older link stopped working');
  assert.equal(await consumeHandoff(second, 'sheets', deps), USER, 'the guesses did not cancel it');
});

function response() {
  const res: any = { statusCode: 200, headers: {} as Record<string, unknown>, body: undefined as unknown };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.setHeader = (name: string, value: unknown) => { res.headers[name.toLowerCase()] = value; };
  res.getHeader = (name: string) => res.headers[name.toLowerCase()];
  res.end = () => res;
  return res;
}
const post = (body: unknown) => ({ method: 'POST', body, query: {}, headers: { 'x-csrf-protection': '1', origin: 'https://staging.krarok.com', host: 'staging.krarok.com' } }) as any;
const get = (t: string) => ({ method: 'GET', query: { t }, headers: { host: 'staging.krarok.com' } }) as any;

function handlerDeps(over: Partial<LineHandoffDeps> = {}) {
  const log: string[] = [];
  const deps: LineHandoffDeps = {
    verify: async token => (token === 'good' ? 'Uline' : null),
    linked: async () => USER,
    sheetsOn: async () => true,
    limit: async () => undefined as any,
    create: async () => `${USER}.secret`,
    consume: async t => (t === `${USER}.secret` ? USER : null),
    access: async () => undefined,
    issue: async userId => { log.push('issue'); return { user: { id: userId } } as any; },
    store: () => { log.push('store'); },
    revoke: async () => { log.push('revoke'); },
    origin: () => 'https://staging.krarok.com',
    ...over,
  };
  return { deps, log };
}

test('the LINE page gets a link the phone opens in its own browser, only for a linked account the feature is open to', async () => {
  const ok = response();
  await createLineHandoffHandler(handlerDeps().deps)(post({ idToken: 'good', purpose: 'sheets' }), ok);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.url, `https://staging.krarok.com/api/line-handoff?t=${encodeURIComponent(`${USER}.secret`)}&openExternalBrowser=1`);
  const forged = response();
  await createLineHandoffHandler(handlerDeps().deps)(post({ idToken: 'forged', purpose: 'sheets' }), forged);
  assert.equal(forged.statusCode, 401);
  const unlinked = response();
  await createLineHandoffHandler(handlerDeps({ linked: async () => null }).deps)(post({ idToken: 'good', purpose: 'sheets' }), unlinked);
  assert.equal(unlinked.statusCode, 403);
  assert.equal(unlinked.body.code, 'line_not_linked');
  const closed = response();
  await createLineHandoffHandler(handlerDeps({ sheetsOn: async () => false }).deps)(post({ idToken: 'good', purpose: 'sheets' }), closed);
  assert.equal(closed.statusCode, 403);
  assert.equal(closed.body.code, 'feature_closed');
});

test('opening the link signs the account in and lands on /connect-sheets; a used or old link explains itself there', async () => {
  const { deps, log } = handlerDeps();
  const opened = response();
  await createLineHandoffHandler(deps)(get(`${USER}.secret`), opened);
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, 'https://staging.krarok.com/connect-sheets');
  assert.deepEqual(log, ['issue', 'store']);
  const used = response();
  await createLineHandoffHandler(deps)(get('whatever'), used);
  assert.equal(used.headers.location, 'https://staging.krarok.com/connect-sheets?handoff=expired');
  assert.deepEqual(log, ['issue', 'store'], 'no second sign-in');
});

test('Google\'s sign-in comes back to the LINE page only when a signed state asks for it', () => {
  const connect = makeState(USER, Date.now(), 'connect');
  assert.equal(readState(connect), USER);
  assert.equal(stateBack(connect), 'connect');
  assert.equal(stateBack(makeState(USER)), null);
});

test('สร้างชีตใหม่ให้: the link and Google\'s sign-in both keep the new-sheet mode, and nothing else rides along', async () => {
  const made = response();
  await createLineHandoffHandler(handlerDeps().deps)(post({ idToken: 'good', purpose: 'sheets', mode: 'new' }), made);
  assert.equal(made.body.url, `https://staging.krarok.com/api/line-handoff?t=${encodeURIComponent(`${USER}.secret`)}&new=1&openExternalBrowser=1`);
  const other = response();
  await createLineHandoffHandler(handlerDeps().deps)(post({ idToken: 'good', purpose: 'sheets', mode: '<script>' }), other);
  assert.ok(!String(other.body.url).includes('new=1'));
  const opened = response();
  await createLineHandoffHandler(handlerDeps().deps)({ ...get(`${USER}.secret`), query: { t: `${USER}.secret`, new: '1' } }, opened);
  assert.equal(opened.headers.location, 'https://staging.krarok.com/connect-sheets?new=1');
  const odd = response();
  await createLineHandoffHandler(handlerDeps().deps)({ ...get(`${USER}.secret`), query: { t: `${USER}.secret`, new: 'https://evil.example' } }, odd);
  assert.equal(odd.headers.location, 'https://staging.krarok.com/connect-sheets');
  assert.equal(stateBack(makeState(USER, Date.now(), 'connect_new')), 'connect_new');
});

test('the LINE cards: เชื่อมชีต opens the LINE page, and the done card names the file and its tabs', () => {
  const start = buildLineConnectSheet('2012039027-neCxHo9L') as any;
  assert.equal(start.contents.footer.contents[0].action.uri, 'https://liff.line.me/2012039027-neCxHo9L?connect=sheets');
  const map = { fileId: 'f', at: '2026-11-13T00:00:00Z', tabs: [
    { name: 'รายจ่าย', headerRow: 0, kind: 'expenses', use: true, columns: [{ index: 0, header: 'ยอด', target: 'amount' }] },
    { name: 'รายรับ', headerRow: 0, kind: 'jobs', use: true, columns: [{ index: 0, header: 'ยอด', target: 'value' }] },
  ] } as any;
  const done = JSON.stringify(buildLineSheetConnected({ name: 'บัญชีร้าน', url: 'https://docs.google.com/x' }, map));
  for (const text of ['เชื่อมชีตแล้ว', 'บัญชีร้าน', 'รายจ่าย', 'รายรับ', 'https://docs.google.com/x']) assert.ok(done.includes(text), text);
});

test('both cards show the real Google Sheets icon from the site itself', () => {
  for (const card of [buildLineConnectSheet('x'), buildLineSheetConnected({ name: 'f' }, { fileId: 'f', at: '', tabs: [] } as any)]) {
    assert.ok(JSON.stringify(card).includes('https://staging.krarok.com/brand/partners/google-sheets.png'));
  }
});

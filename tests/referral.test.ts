import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ใส่โค้ด รับ 200 โทเคน (owner, 2026-11-05, round 2): any account with a confirmed email enters a friend's code once and
// gets 200 tokens at once; the friend gets nothing; one code is entered by 5 people (the owner's own code has no limit),
// 100 rewards in the campaign; one device enters a code once and never the code of an account that used that device.
// The database is mocked.

Object.assign(process.env, { SUPABASE_URL: 'https://referral.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' });
const repo = await import('../backend/src/repositories/referral.js');
const { canEnterCode, isReferralCode, normalizeCode, rankEntries, rankRewards, readEntry, REFERRAL_PER_PERSON, shareText } = await import('../shared/referral.js');
// The owner's address as the server knows it (not written out again here).
const OWNER = /OWNER_EMAIL = '([^']+)'/.exec(readFileSync('backend/src/security/adminAnalyticsAccess.ts', 'utf8'))![1];
const { readGrants } = await import('../shared/tokenGrants.js');

const realFetch = globalThis.fetch;
type State = { referral?: unknown; referralDevices?: unknown; aiTokenGrants?: unknown };
let state: Record<string, State> = {};
let profiles: Record<string, string> = {};
let owners = new Set<string>();
/** A reward someone else writes between this account's write and its read-back (two at the same moment). */
let racing: Record<string, unknown> | null = null;

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const code = (n: number) => `SQ-${String(n).padStart(10, '0')}`;

before(() => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const param = (name: string) => url.searchParams.get(name)?.replace(/^eq\./, '');
    if (url.pathname.endsWith('/cashflow_profiles')) {
      if (param('public_id')) { const hit = Object.entries(profiles).find(([, c]) => c === param('public_id')); return json(hit ? { user_id: hit[0] } : null); }
      return json({ public_id: profiles[param('user_id') ?? ''] ?? null });
    }
    const admin = /\/auth\/v1\/admin\/users\/([^/]+)$/.exec(url.pathname);
    if (admin) return json({ id: admin[1], aud: 'authenticated', email: owners.has(admin[1]) ? OWNER : `${admin[1]}@example.com`, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const body = JSON.parse(String(init?.body));
      state[body.p_user_id] = { ...(state[body.p_user_id] ?? {}), ...body.p_patch };
      for (const key of body.p_remove ?? []) delete (state[body.p_user_id] as Record<string, unknown>)[key];
      if (racing && (body.p_patch.referral as { status?: string })?.status === 'rewarded') { Object.entries(racing).forEach(([id, entry]) => { state[id] = { ...(state[id] ?? {}), referral: entry }; }); racing = null; }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith('/cashflow_private_state')) {
      const select = url.searchParams.get('select') ?? '';
      const rows = Object.entries(state);
      const entry = (s: State) => s.referral as Record<string, string> | undefined;
      if (param('data->referral->>device')) return json(rows.filter(([, s]) => entry(s)?.device === param('data->referral->>device')).map(([user_id]) => ({ user_id })));
      if (param('data->referral->>status')) return json(rows.filter(([, s]) => entry(s)?.status === param('data->referral->>status')).map(([user_id, s]) => ({ user_id, entry: s.referral })));
      if (param('data->referral->>referrerId')) return json(rows.filter(([, s]) => entry(s)?.referrerId === param('data->referral->>referrerId')).map(([user_id, s]) => ({ user_id, entry: s.referral })));
      const id = param('user_id') ?? '';
      if (select.startsWith('grants')) return json({ grants: state[id]?.aiTokenGrants ?? null });
      return json({ entry: state[id]?.referral ?? null, devices: state[id]?.referralDevices ?? null });
    }
    return new Response(JSON.stringify({ message: 'not in this test' }), { status: 500 });
  };
});
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { state = {}; profiles = { [uid(1)]: code(1), [uid(2)]: code(2), [uid(3)]: code(3) }; owners = new Set(); racing = null; });

const FRIEND = uid(1);
const NEW = uid(2);
const DEVICE = repo.deviceHash('device-of-the-new-member-0001');
const enter = (userId: string, c: string, device = DEVICE) => repo.enterCode({ userId, code: c, deviceHash: device, entered: readEntry(state[userId]?.referral) }, new Date('2026-11-06T05:00:00Z'));
const codeOf = (error: unknown) => (error as { code?: string }).code;

test('codes and who may enter: SQ codes only; any account with a confirmed email', () => {
  assert.equal(normalizeCode(' sq-8f2a41c9da '), 'SQ-8F2A41C9DA');
  // Pasted over a field that already said SQ-, without its prefix, with spaces, or inside a message: the code itself.
  for (const typed of ['SQ-SQ-8F2A41C9DA', 'sq-sq-8f2a41c9da', '8f2a41c9da', 'SQ8F2A41C9DA', 'SQ- 8F2A 41C9 DA', 'กรอกโค้ด SQ-8F2A41C9DA รับ 200 โทเคน']) {
    assert.equal(normalizeCode(typed), 'SQ-8F2A41C9DA', typed);
    assert.equal(isReferralCode(typed), true, typed);
  }
  for (const bad of ['SQ-', 'SQ-8F2A41C9D', 'SQ-8F2A41C9DA1']) assert.equal(isReferralCode(bad), false, bad);
  assert.equal(isReferralCode('sq-8f2a41c9da'), true);
  assert.equal(isReferralCode('SQ-8F2K41C9DA'), false, 'public IDs are hex');
  for (const bad of ['', 'SQ-123', 'XX-8F2K41C9DA', 'SQ-8F2K41C9DAX']) assert.equal(isReferralCode(bad), false, bad);
  assert.equal(canEnterCode({ email_confirmed_at: '2025-01-01T00:00:00Z' }), true, 'an older account too');
  assert.equal(canEnterCode({ email_confirmed_at: null }), false, 'an unconfirmed email');
  assert.match(shareText('https://krarok.com', 'SQ-8F2A41C9DA'), /SQ-8F2A41C9DA .*200 .*https:\/\/krarok\.com\/\?ref=SQ-8F2A41C9DA$/);
});

const grantsOf = (id: string) => readGrants(state[id]?.aiTokenGrants);

test('entering: unknown, own code and used devices are refused; a good code gives this account 200 tokens at once', async () => {
  await assert.rejects(enter(NEW, code(9)), error => codeOf(error) === 'referral_unknown');
  await assert.rejects(enter(NEW, code(2)), error => codeOf(error) === 'referral_self');
  // The friend has used this device: a second account here can never use the friend's code.
  state[FRIEND] = { referralDevices: [DEVICE] };
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_device');
  state = {};
  const entry = await enter(NEW, code(1));
  assert.equal(entry.status, 'rewarded');
  assert.deepEqual(grantsOf(NEW).map(g => [g.id, g.tokens, g.note]), [[`referral-${NEW.replace(/-/g, '')}`, 200, 'ใส่โค้ดเพื่อน']]);
  assert.deepEqual(grantsOf(FRIEND), [], 'the friend gets nothing: the gift is what they pass on');
  await assert.rejects(enter(NEW, code(3)), error => codeOf(error) === 'referral_entered', 'one code per account');
  assert.equal(grantsOf(NEW).length, 1, 'never twice');
  // Another account on the same device: refused.
  await assert.rejects(enter(uid(3), code(1)), error => codeOf(error) === 'referral_device');
});

test('a first-round entry still waiting is finished the new way: the one who entered gets the tokens, once', async () => {
  const waiting = { code: code(1), referrerId: FRIEND, at: '2026-11-05T09:00:00.000Z', device: 'd-old', status: 'pending' as const };
  state[NEW] = { referral: waiting };
  const done = await repo.finishWaiting(NEW, waiting, new Date('2026-11-06T06:00:00Z'));
  assert.equal(done.status, 'rewarded');
  assert.equal(grantsOf(NEW).length, 1);
  assert.deepEqual(grantsOf(FRIEND), []);
  assert.equal((await repo.finishWaiting(NEW, done)).status, 'rewarded');
  assert.equal(grantsOf(NEW).length, 1, 'never twice');
});

test('one code, 5 people: the sixth is refused, and two at once for the last place never make six', async () => {
  assert.equal(REFERRAL_PER_PERSON, 5);
  const used = (n: number, at: string) => ({ referral: { code: code(1), referrerId: FRIEND, at, device: `d${n}`, status: 'rewarded', rewardedAt: at } });
  const five = () => Object.fromEntries([10, 11, 12, 13, 14].map((n, i) => [uid(n), used(n, `2026-11-06T01:0${i}:00.000Z`)]));
  state = five();
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_referrer_full');
  assert.equal(state[NEW]?.referral, undefined, 'nothing kept for the sixth');
  assert.deepEqual(grantsOf(NEW), []);
  // One place left; another person's entry lands just before this one's read-back: this one is taken out again.
  state = five(); delete state[uid(14)];
  const before = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const reply = await before(input, init);
    if (url.pathname.endsWith('/rpc/cashflow_patch_private') && JSON.parse(String(init?.body)).p_patch.referral?.status === 'pending') state[uid(14)] = used(14, '2026-11-06T04:59:59.000Z');
    return reply;
  };
  try {
    await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_referrer_full');
  } finally { globalThis.fetch = before; }
  assert.equal(state[NEW]?.referral, undefined, 'the late entry is taken out');
  assert.deepEqual(grantsOf(NEW), [], 'and given nothing');
  assert.equal(rankEntries(Object.entries(state).map(([userId, s]) => ({ userId, entry: readEntry(s.referral) }))).length, 5);
});

test('the owner\'s own code has no limit of people (it goes into the clips)', async () => {
  owners.add(FRIEND);
  state = Object.fromEntries([10, 11, 12, 13, 14, 15].map(n => [uid(n), { referral: { code: code(1), referrerId: FRIEND, at: '2026-11-06T01:00:00.000Z', device: `d${n}`, status: 'rewarded', rewardedAt: '2026-11-06T01:00:00.000Z' } }]));
  const entry = await enter(NEW, code(1));
  assert.equal(entry.status, 'rewarded', 'the seventh still counts');
  assert.equal(await repo.codeLimit(FRIEND), null);
  assert.equal(await repo.codeLimit(uid(3)), 5);
  assert.equal(await repo.usedCount(FRIEND), 7);
});

test('the campaign: 100 rewards, and two at the same moment for the last one never make 101', async () => {
  const rewardedBy = (referrerId: string, n: number, offset = 100) => Object.fromEntries(Array.from({ length: n }, (_, i) => [uid(offset + i), {
    referral: { code: code(3), referrerId, at: '2026-11-06T01:00:00.000Z', device: `d${offset + i}`, status: 'rewarded', rewardedAt: `2026-11-06T02:${String(i % 60).padStart(2, '0')}:00.000Z` },
  }]));
  owners.add(uid(3));
  // The campaign has 100: refused at entry.
  state = rewardedBy(uid(3), 100, 200);
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_full');
  // 99 given; another reward takes the last place just before this one's read-back: this one is turned back, no tokens.
  state = rewardedBy(uid(3), 99, 200);
  racing = { [uid(999)]: { code: code(3), referrerId: uid(3), at: '2026-11-06T01:00:00.000Z', device: 'race', status: 'rewarded', rewardedAt: '2026-11-06T04:59:59.000Z' } };
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_full');
  assert.equal(state[NEW]?.referral, undefined, 'the entry is taken out');
  assert.deepEqual(grantsOf(NEW), [], 'no tokens for a turned-back reward');
  assert.equal((await repo.allRewards()).length, 100);
});

test('ranking and stored entries: by reward time then account; broken entries never count', () => {
  const e = (status: string, rewardedAt?: string) => readEntry({ code: code(1), referrerId: FRIEND, at: '2026-11-06T01:00:00Z', device: 'd', status, ...(rewardedAt ? { rewardedAt } : {}) });
  const ranked = rankRewards([
    { userId: 'b', entry: e('rewarded', '2026-11-06T03:00:00Z') }, { userId: 'a', entry: e('rewarded', '2026-11-06T03:00:00Z') },
    { userId: 'c', entry: e('rewarded', '2026-11-06T02:00:00Z') }, { userId: 'd', entry: e('pending') }, { userId: 'e', entry: null },
  ]);
  assert.deepEqual(ranked.map(r => r.userId), ['c', 'a', 'b']);
  for (const bad of [null, { code: 'x' }, { code: code(1), referrerId: FRIEND, at: 'nope', device: 'd', status: 'rewarded' }, { code: code(1), referrerId: FRIEND, at: '2026-11-06T01:00:00Z', device: 'd', status: 'odd' }]) {
    assert.equal(readEntry(bad), null);
  }
});

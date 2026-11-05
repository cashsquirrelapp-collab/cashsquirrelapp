import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

// ชวนเพื่อน รับ 200 โทเคน (owner, 2026-11-05): a new account enters a friend's code once; the friend gets 200 tokens when
// this account records its first job or expense; one code is entered by 2 people at most, 100 rewards in the campaign; one device
// enters a code once and never the code of an account that used that device. The database is mocked.

Object.assign(process.env, { SUPABASE_URL: 'https://referral.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test-admin' });
const repo = await import('../backend/src/repositories/referral.js');
const { isNewMember, isReferralCode, normalizeCode, rankEntries, rankRewards, readEntry, REFERRAL_FROM, REFERRAL_PER_PERSON, shareText } = await import('../shared/referral.js');
const { readGrants } = await import('../shared/tokenGrants.js');

const realFetch = globalThis.fetch;
type State = { referral?: unknown; referralDevices?: unknown; aiTokenGrants?: unknown };
let state: Record<string, State> = {};
let profiles: Record<string, string> = {};
let records: Record<string, number> = {};
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
    if (url.pathname.endsWith('/cashflow_jobs') || url.pathname.endsWith('/cashflow_expenses')) {
      const n = url.pathname.endsWith('/cashflow_jobs') ? records[param('user_id') ?? ''] ?? 0 : 0;
      return new Response(null, { status: 200, headers: { 'content-range': `*/${n}` } });
    }
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const body = JSON.parse(String(init?.body));
      state[body.p_user_id] = { ...(state[body.p_user_id] ?? {}), ...body.p_patch };
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
beforeEach(() => { state = {}; profiles = { [uid(1)]: code(1), [uid(2)]: code(2), [uid(3)]: code(3) }; records = {}; racing = null; });

const FRIEND = uid(1);
const NEW = uid(2);
const DEVICE = repo.deviceHash('device-of-the-new-member-0001');
const enter = (userId: string, c: string, device = DEVICE) => repo.enterCode({ userId, code: c, deviceHash: device, entered: readEntry(state[userId]?.referral) }, new Date('2026-11-06T05:00:00Z'));
const codeOf = (error: unknown) => (error as { code?: string }).code;

test('codes and new members: SQ codes only; made after the campaign began with a confirmed email', () => {
  assert.equal(normalizeCode(' sq-8f2a41c9da '), 'SQ-8F2A41C9DA');
  assert.equal(isReferralCode('sq-8f2a41c9da'), true);
  assert.equal(isReferralCode('SQ-8F2K41C9DA'), false, 'public IDs are hex');
  for (const bad of ['', 'SQ-123', 'XX-8F2K41C9DA', 'SQ-8F2K41C9DAX']) assert.equal(isReferralCode(bad), false, bad);
  const after = new Date(REFERRAL_FROM + 1000).toISOString();
  assert.equal(isNewMember({ created_at: after, email_confirmed_at: after }), true);
  assert.equal(isNewMember({ created_at: after, email_confirmed_at: null }), false, 'an unconfirmed email');
  assert.equal(isNewMember({ created_at: new Date(REFERRAL_FROM - 1000).toISOString(), email_confirmed_at: after }), false, 'made before');
  assert.match(shareText('https://krarok.com', 'SQ-8F2K41C9DA'), /SQ-8F2K41C9DA .*https:\/\/krarok\.com\/\?ref=SQ-8F2K41C9DA$/);
});

test('entering: unknown, own code, a used device and the friend\'s own device are refused; a good code waits for a first record', async () => {
  await assert.rejects(enter(NEW, code(9)), error => codeOf(error) === 'referral_unknown');
  await assert.rejects(enter(NEW, code(2)), error => codeOf(error) === 'referral_self');
  // The friend has used this device: a second account here can never count for the friend.
  state[FRIEND] = { referralDevices: [DEVICE] };
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_device');
  state = {};
  const entry = await enter(NEW, code(1));
  assert.equal(entry.status, 'pending', 'no record yet: nothing given');
  assert.deepEqual(readGrants(state[FRIEND]?.aiTokenGrants), []);
  await assert.rejects(enter(NEW, code(3)), error => codeOf(error) === 'referral_entered', 'one code per account');
  // Another new account on the same device: refused.
  await assert.rejects(enter(uid(3), code(1)), error => codeOf(error) === 'referral_device');
});

test('the reward: 200 tokens to the friend once the new account has its first record, and only once', async () => {
  const entry = await enter(NEW, code(1));
  records[NEW] = 1;
  const rewarded = await repo.rewardIfReady(NEW, entry, new Date('2026-11-06T06:00:00Z'));
  assert.equal(rewarded.status, 'rewarded');
  const grants = readGrants(state[FRIEND]?.aiTokenGrants);
  assert.deepEqual(grants.map(g => [g.tokens, g.note]), [[200, 'ชวนเพื่อน']]);
  assert.equal(grants[0].id, `referral-${NEW.replace(/-/g, '')}`);
  await repo.rewardIfReady(NEW, rewarded);
  assert.equal(readGrants(state[FRIEND]?.aiTokenGrants).length, 1, 'never twice');
  // A first record before entering: the friend is rewarded at once (the code's second and last place).
  records[uid(3)] = 2;
  const at = await enter(uid(3), code(1), repo.deviceHash('another-device-of-someone-0002'));
  assert.equal(at.status, 'rewarded');
  assert.equal(readGrants(state[FRIEND]?.aiTokenGrants).length, 2);
});

test('one code, 2 people: the third is refused, and two at once for the last place never make three', async () => {
  assert.equal(REFERRAL_PER_PERSON, 2);
  const waiting = (n: number, at: string) => ({ referral: { code: code(1), referrerId: FRIEND, at, device: `d${n}`, status: 'pending' } });
  state = { [uid(10)]: waiting(10, '2026-11-06T01:00:00.000Z'), [uid(11)]: waiting(11, '2026-11-06T01:30:00.000Z') };
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_referrer_full');
  assert.equal(state[NEW]?.referral, undefined, 'nothing kept for the third');
  // One place left; another person's entry lands just before this one's read-back: this one is taken out again.
  state = { [uid(10)]: waiting(10, '2026-11-06T01:00:00.000Z') };
  const before = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/rpc/cashflow_patch_private') && JSON.parse(String(init?.body)).p_patch.referral) {
      const reply = await before(input, init);
      state[uid(11)] = waiting(11, '2026-11-06T04:59:59.000Z');
      return reply;
    }
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const body = JSON.parse(String(init?.body));
      for (const key of body.p_remove ?? []) delete (state[body.p_user_id] as Record<string, unknown>)[key];
      return new Response(null, { status: 204 });
    }
    return before(input, init);
  };
  try {
    await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_referrer_full');
  } finally { globalThis.fetch = before; }
  assert.equal(state[NEW]?.referral, undefined, 'the late entry is taken out');
  assert.equal(rankEntries(Object.entries(state).map(([userId, s]) => ({ userId, entry: readEntry(s.referral) }))).length, 2);
});

test('the campaign: 100 rewards, and two at the same moment for the last one never make 101', async () => {
  const rewardedBy = (referrerId: string, n: number, offset = 100) => Object.fromEntries(Array.from({ length: n }, (_, i) => [uid(offset + i), {
    referral: { code: code(1), referrerId, at: '2026-11-06T01:00:00.000Z', device: `d${offset + i}`, status: 'rewarded', rewardedAt: `2026-11-06T02:${String(i % 60).padStart(2, '0')}:00.000Z` },
  }]));
  // The campaign has 100 (from others): refused at entry.
  state = rewardedBy(uid(3), 100, 200);
  await assert.rejects(enter(NEW, code(1)), error => codeOf(error) === 'referral_full');
  // 99 given; this one waits; meanwhile another reward takes the last place just before it: this one is turned back.
  state = rewardedBy(uid(3), 99, 200);
  const entry = await enter(NEW, code(1));
  records[NEW] = 1;
  racing = { [uid(999)]: { code: code(3), referrerId: uid(3), at: '2026-11-06T01:00:00.000Z', device: 'race', status: 'rewarded', rewardedAt: '2026-11-06T05:59:59.000Z' } };
  const outcome = await repo.rewardIfReady(NEW, entry, new Date('2026-11-06T06:00:00Z'));
  assert.deepEqual([outcome.status, outcome.reason], ['refused', 'campaign_full']);
  assert.deepEqual(readGrants(state[FRIEND]?.aiTokenGrants), [], 'no tokens for a turned-back reward');
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

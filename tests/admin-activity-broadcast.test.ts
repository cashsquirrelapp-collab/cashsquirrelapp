import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import {
  heartbeatChangesVisits, readActivity, recordHeartbeat, summarizeActivity, VISIT_GAP_MINUTES, type StoredActivity,
} from '../shared/userActivity.js';
import {
  activeBroadcast, broadcastFor, broadcastReplyBody, broadcastResult, broadcastUserActionSchema, withAnswer, withNewBroadcast, type Broadcast,
} from '../shared/broadcast.js';
import { broadcastAlertText } from '../backend/src/services/broadcastAlert.js';

// The admin page's ผู้ใช้งาน view and the team's message to everyone (owner, 2026-11-03: "อยากเห็นว่าคนนึงเขาไม่ active นาน
// แค่ไหน ... คนมา on กี่ช่วงไหนบ้าง" and "พิมพ์ไปหา user ทุกคนได้ ... ขึ้นหน้าจอในเว็บเขา ... ให้เขาตอบกลับเราได้ด้วย").

const at = (iso: string) => new Date(iso);
const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

test('visits: the first heartbeat starts one, later ones stretch it, a break starts the next; writes only every few minutes', () => {
  assert.equal(heartbeatChangesVisits(null, at('2026-11-03T12:00:00Z')), true, 'the first beat');
  assert.equal(heartbeatChangesVisits('2026-11-03T12:00:05Z', at('2026-11-03T12:00:25Z')), false, 'same 3-minute step');
  assert.equal(heartbeatChangesVisits('2026-11-03T12:02:50Z', at('2026-11-03T12:03:10Z')), true, 'the next step');
  assert.equal(heartbeatChangesVisits('2026-11-03T12:00:00Z', at('2026-11-03T12:20:00Z')), true, 'after a break');

  let stored: StoredActivity = readActivity(undefined);
  stored = recordHeartbeat(stored, at('2026-11-03T12:00:10Z'));
  stored = recordHeartbeat(stored, at('2026-11-03T12:27:40Z'));
  assert.deepEqual(stored.visits, [[minute('2026-11-03T12:00:10Z'), 0], [minute('2026-11-03T12:27:40Z'), 0]], `a break over ${VISIT_GAP_MINUTES} minutes`);
  stored = recordHeartbeat(stored, at('2026-11-03T12:39:00Z'));
  assert.deepEqual(stored.visits.at(-1), [minute('2026-11-03T12:27:40Z'), 12]);
  // Kept 90 days only, and nothing broken is read back.
  const old = recordHeartbeat({ v: 1, visits: [[minute('2026-07-01T00:00:00Z'), 5]] }, at('2026-11-03T12:00:00Z'));
  assert.equal(old.visits.length, 1);
  assert.deepEqual(readActivity({ visits: [[1, 2], ['x', 3], [5, -1], 'bad'] }).visits, [[1, 2]]);
});

test('the admin view: online, today, away for weeks, no data, statistics off; hours from visits and pages opened', () => {
  const profiles = ['on', 'today', 'quiet', 'gone', 'never', 'off'].map((id, index) => ({ user_id: id, public_id: `SQ-${index}`, display_name: `บัญชี ${id}`, created_at: '2026-09-01T00:00:00Z' }));
  const now = at('2026-11-03T13:00:00Z'); // 20:00 in Bangkok, a Tuesday
  const summary = summarizeActivity({
    profiles, plans: new Map([['on', 'pro']]), range: 30, now,
    presence: new Map([['on', '2026-11-03T12:59:40Z'], ['today', '2026-11-03T02:00:00Z']]),
    usage: [
      { user_id: 'quiet', usage_date: '2026-10-20', last_seen_at: '2026-10-20T13:30:00Z' },
      { user_id: 'today', usage_date: '2026-11-03', last_seen_at: '2026-11-03T02:00:00Z' },
    ],
    activity: new Map([['today', { v: 1, visits: [[minute('2026-11-03T01:50:00Z'), 70]] } as StoredActivity]]),
    statsOff: new Set(['off']),
    signIns: new Map([['gone', '2026-09-10T03:00:00Z'], ['off', '2026-11-01T03:00:00Z']]),
  });
  const by = new Map(summary.accounts.map(account => [account.userId, account]));
  assert.equal(by.get('on')!.status, 'online');
  assert.equal(by.get('on')!.plan, 'pro');
  assert.equal(by.get('today')!.status, 'today');
  assert.equal(by.get('quiet')!.status, 'month');
  assert.equal(by.get('quiet')!.daysAway, 14);
  assert.equal(by.get('gone')!.status, 'away', 'only a sign-in, 54 days ago');
  assert.equal(by.get('never')!.status, 'none');
  assert.equal(by.get('off')!.status, 'off');
  assert.equal(summary.accounts[0].userId, 'on', 'online first');
  assert.equal(summary.accounts.at(-1)!.userId, 'never', 'no data last');
  // 08:50–10:00 Bangkok: hours 8, 9 and 10; the page opened at 09:00 is the same day and hour 9.
  const today = by.get('today')!;
  assert.deepEqual([today.hours[8], today.hours[9], today.hours[10]], [1, 1, 1]);
  assert.equal(today.visits, 1);
  assert.equal(today.minutes, 70);
  assert.equal(today.band, 'morning');
  assert.equal(by.get('quiet')!.band, 'evening', '20:30 Bangkok');
  assert.equal(summary.heatmap[1][9], 1, 'Tuesday 09:00');
  assert.equal(summary.heatmap[1][20], 1, 'Tuesday 20 October, 20:00');
  assert.deepEqual({ online: summary.totals.online, today: summary.totals.today, month: summary.totals.month, away: summary.totals.away, none: summary.totals.none, off: summary.totals.off, accounts: summary.totals.accounts },
    { online: 1, today: 1, month: 1, away: 1, none: 1, off: 1, accounts: 6 });
  assert.equal(summary.trackingSince, '2026-11-03T01:50:00.000Z');
});

const sent = (id: string, createdAt: string, over: Partial<Broadcast> = {}): Broadcast => ({ id, body: 'สวัสดีครับ วันนี้เป็นอย่างไรบ้างครับ', askRating: true, createdAt, endedAt: null, ...over });

test('the message: shown once to every account, new ones too; closed or answered, it stays away; 30 days at most', () => {
  const list = [sent('b', '2026-11-03T05:00:00Z')];
  const now = at('2026-11-03T06:00:00Z');
  assert.equal(broadcastFor(list, {}, now)?.id, 'b');
  assert.equal(broadcastFor(list, { b: { status: 'seen', at: now.toISOString() } }, now)?.id, 'b', 'seen but not answered: shown again');
  assert.equal(broadcastFor(list, { b: { status: 'dismissed', at: now.toISOString() } }, now), null);
  assert.equal(broadcastFor(list, { b: { status: 'answered', at: now.toISOString(), rating: 5 } }, now), null);
  assert.equal(activeBroadcast(list, at('2026-12-04T06:00:00Z')), null, 'older than 30 days');
  // A new message stops the one showing.
  const next = withNewBroadcast(list, { id: 'c', body: 'ใหม่', askRating: false, createdAt: '2026-11-04T00:00:00Z' });
  assert.equal(next[0].id, 'c');
  assert.equal(next[1].endedAt, '2026-11-04T00:00:00Z');
  assert.equal(activeBroadcast([{ ...list[0], endedAt: '2026-11-03T07:00:00Z' }], now), null);
  // "seen" never replaces an answer.
  const answered = withAnswer({}, 'b', { status: 'answered', at: '2026-11-03T06:00:00Z', rating: 4 });
  assert.equal(withAnswer(answered, 'b', { status: 'seen', at: '2026-11-03T07:00:00Z' }).b.status, 'answered');
  // An answer needs a score or words; the words are tidied.
  assert.equal(broadcastUserActionSchema.safeParse({ action: 'answer', id: '11111111-1111-4111-8111-111111111111', reply: '   ' }).success, false);
  assert.equal(broadcastReplyBody(list[0], 'ชอบมากครับ', 4), 'ตอบข้อความจากทีมงาน: “สวัสดีครับ วันนี้เป็นอย่างไรบ้างครับ”\nให้คะแนนแอป 4 จาก 5\n\nชอบมากครับ');
});

test('the results: who it reached (admins not counted; accounts made after it stopped neither), seen, answered, closed, the average score', () => {
  const broadcast = sent('b', '2026-11-03T05:00:00Z');
  const accounts = [
    { userId: 'a', name: 'เอ', publicId: 'SQ-1', createdAt: '2026-10-01T00:00:00Z', admin: false },
    { userId: 'b', name: 'บี', publicId: 'SQ-2', createdAt: '2026-10-01T00:00:00Z', admin: false },
    { userId: 'c', name: 'ซี', publicId: 'SQ-3', createdAt: '2026-10-01T00:00:00Z', admin: false },
    { userId: 'admin', name: 'แอดมิน', publicId: 'SQ-4', createdAt: '2026-01-01T00:00:00Z', admin: true },
    { userId: 'new', name: 'ใหม่', publicId: 'SQ-5', createdAt: '2026-11-03T06:00:00Z', admin: false },
  ];
  const answers = new Map([
    ['a', { b: { status: 'answered' as const, at: '2026-11-03T06:00:00Z', rating: 5, reply: 'ดีมาก', threadId: 't1' } }],
    ['b', { b: { status: 'answered' as const, at: '2026-11-03T07:00:00Z', rating: 4 } }],
    ['c', { b: { status: 'dismissed' as const, at: '2026-11-03T06:30:00Z' } }],
  ]);
  const result = broadcastResult(broadcast, accounts, answers);
  assert.deepEqual({ audience: result.audience, seen: result.seen, answered: result.answered, dismissed: result.dismissed, average: result.average, ratings: result.ratings },
    { audience: 4, seen: 3, answered: 2, dismissed: 1, average: 4.5, ratings: [0, 0, 0, 1, 1] });
  assert.equal(broadcastResult({ ...broadcast, endedAt: '2026-11-03T05:30:00Z' }, accounts, answers).audience, 3, 'the newest account came after it stopped');
  assert.equal(result.replies[0].name, 'บี', 'newest first');
  assert.equal(result.replies[1].threadId, 't1');
  assert.match(broadcastAlertText({ broadcastId: 'b', reply: 'ดีมาก', rating: 5 }, 'https://krarok.com'), /ให้คะแนนแอป 5 จาก 5\n“ดีมาก”\nดูคำตอบทั้งหมดได้ที่ แอดมิน › ส่งข้อความถึงผู้ใช้\nhttps:\/\/krarok.com\/adminDashboard\?view=broadcast/);
});

// ── The API, against a fake database ──────────────────────────────────────────────────────────────

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://activity-tests.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.SESSION_SECRET = 'activity-test-only-secret-'.repeat(4);

const OWNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const NEWCOMER = '33333333-3333-4333-8333-333333333333';
// The owner's address, read from the access rule so it is not written out again here.
const ownerEmail = readFileSync(new URL('../backend/src/security/adminAnalyticsAccess.ts', import.meta.url), 'utf8').match(/OWNER_EMAIL = '([^']+@[^']+)'/)![1];
const created: Record<string, string> = { [OWNER]: '2026-01-01T00:00:00Z', [MEMBER]: '2026-10-01T00:00:00Z', [NEWCOMER]: '2099-01-01T00:00:00Z' };
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let privateState: Map<string, Record<string, unknown>>;
let presence: Map<string, string>;
let feedbackCreates: { actor: string; input: any }[];
let failFeedback = false;

const cookieFor = (id: string) => {
  const jwt = `e30.${Buffer.from(JSON.stringify({ sub: id, session_id: id })).toString('base64url')}.test`;
  return `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
};
const get = (path: string, id: string) => realFetch(`${origin}${path}`, { headers: { cookie: cookieFor(id), 'x-account-id': id } });
const post = (path: string, body: unknown, id: string) => realFetch(`${origin}${path}`, { method: 'POST', headers: {
  cookie: cookieFor(id), 'x-account-id': id, origin: process.env.APP_URL!, 'x-csrf-protection': '1', 'content-type': 'application/json',
}, body: JSON.stringify(body) });

/** The select list of a PostgREST request: plain columns, or `alias:data->key` from the private state's JSON. */
function pick(row: Record<string, unknown>, select: string) {
  const out: Record<string, unknown> = {};
  for (const part of select.split(',')) {
    const [alias, path] = part.includes(':') ? part.split(':') : [part, part];
    out[alias] = path.startsWith('data->') ? ((row.data as Record<string, unknown>)?.[path.slice(6)] ?? null) : row[path];
  }
  return out;
}

before(async () => {
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input));
    if (url.origin !== process.env.SUPABASE_URL) return realFetch(input, init);
    const method = init?.method || request?.method || 'GET';
    const headers = new Headers(init?.headers ?? request?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : request && method !== 'GET' ? await request.json().catch(() => ({})) : {};
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    const rows = (list: Record<string, unknown>[]) => {
      const select = url.searchParams.get('select') || '*';
      let found = list;
      for (const [key, value] of url.searchParams) {
        if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset' || key.includes('->')) continue;
        if (value.startsWith('eq.')) found = found.filter(row => String(row[key]) === value.slice(3));
        if (value.startsWith('in.(')) { const ids = value.slice(4, -1).split(','); found = found.filter(row => ids.includes(String(row[key]))); }
      }
      const picked = found.map(row => (select === '*' ? row : pick(row, select)));
      if ((headers.get('accept') || '').includes('vnd.pgrst.object')) return picked.length ? json(picked[0]) : json({ code: 'PGRST116', message: 'none' }, 406);
      return json(picked);
    };
    if (url.pathname === '/auth/v1/user') {
      const token = headers.get('authorization')!.split(' ')[1];
      const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
      return json({ id, email: id === OWNER ? ownerEmail : `${id}@example.com`, email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: {}, created_at: created[id] });
    }
    if (url.pathname === '/auth/v1/admin/users') return json({ users: [{ id: MEMBER, last_sign_in_at: '2026-10-20T03:00:00Z' }], aud: 'authenticated' });
    if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/rpc/cashflow_patch_private')) {
      const current = privateState.get(body.p_user_id) ?? {};
      const next = { ...current, ...body.p_patch };
      for (const key of body.p_remove ?? []) delete next[key];
      privateState.set(body.p_user_id, next);
      return json(null);
    }
    if (url.pathname.endsWith('/rpc/cashflow_feedback_mutate')) {
      if (failFeedback) return json({ code: 'P0001', message: 'feedback_thread_limit' }, 400);
      feedbackCreates.push({ actor: body.p_actor, input: body.p_input });
      return json({ threadId: '99999999-9999-4999-8999-999999999999' });
    }
    if (url.pathname.endsWith('/cashflow_user_roles')) return rows([{ user_id: OWNER, role: 'admin' }]);
    if (url.pathname.endsWith('/cashflow_private_state')) return rows([...privateState].map(([user_id, data]) => ({ user_id, data })));
    if (url.pathname.endsWith('/cashflow_user_presence')) {
      if (method === 'POST') { presence.set(body.user_id, body.last_seen_at); return json(null, 201); }
      return rows([...presence].map(([user_id, last_seen_at]) => ({ user_id, last_seen_at })));
    }
    if (url.pathname.endsWith('/cashflow_profiles')) return rows([OWNER, MEMBER].map((id, index) => ({ user_id: id, public_id: `SQ-${index}`, display_name: id === OWNER ? 'เจ้าของ' : 'สมาชิก', created_at: created[id] })));
    return json([]);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => { privateState = new Map(); presence = new Map(); feedbackCreates = []; failFeedback = false; });
after(async () => { globalThis.fetch = realFetch; await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))); });

test('the heartbeat keeps a visit; essential cookies only removes the visits and marks the account', async () => {
  assert.equal((await post('/api/usage-analytics', { action: 'presence-heartbeat' }, MEMBER)).status, 200);
  const visits = (privateState.get(MEMBER)?.activity as StoredActivity).visits;
  assert.equal(visits.length, 1);
  // A second beat in the same few minutes does not write again.
  const before = JSON.stringify(privateState.get(MEMBER));
  presence.set(MEMBER, new Date().toISOString());
  assert.equal((await post('/api/usage-analytics', { action: 'presence-heartbeat' }, MEMBER)).status, 200);
  assert.equal(JSON.stringify(privateState.get(MEMBER)), before);

  assert.equal((await post('/api/usage-analytics', { action: 'stats-choice', stats: false }, MEMBER)).status, 200);
  assert.deepEqual(privateState.get(MEMBER), { statsOff: true });
  assert.equal((await post('/api/usage-analytics', { action: 'stats-choice', stats: true }, MEMBER)).status, 200);
  assert.deepEqual(privateState.get(MEMBER), {});
});

test('the owner sends a message; an older account sees it, answers with a score and words; the owner sees the answer', async () => {
  assert.equal((await post('/api/broadcast', { action: 'send', body: 'สวัสดีครับ แอปใช้ดีไหมครับ', askRating: true }, MEMBER)).status, 403, 'members cannot send');
  const sentRes = await post('/api/broadcast', { action: 'send', body: '  สวัสดีครับ แอปใช้ดีไหมครับ  ', askRating: true }, OWNER);
  assert.equal(sentRes.status, 201);
  const { id } = await sentRes.json() as { id: string };

  const shown = await (await get('/api/broadcast', MEMBER)).json() as { broadcast: { id: string; body: string; askRating: boolean } | null };
  assert.deepEqual({ id: shown.broadcast?.id, body: shown.broadcast?.body, askRating: shown.broadcast?.askRating }, { id, body: 'สวัสดีครับ แอปใช้ดีไหมครับ', askRating: true });
  assert.equal((await (await get('/api/broadcast', NEWCOMER)).json() as { broadcast: { id: string } | null }).broadcast?.id, id, 'a new account sees it too');
  assert.equal((await (await get('/api/broadcast', OWNER)).json() as { broadcast: unknown }).broadcast, null, 'the sender is not asked');

  assert.equal((await post('/api/broadcast', { action: 'seen', id }, MEMBER)).status, 200);
  assert.equal((await post('/api/broadcast', { action: 'answer', id, reply: '' }, MEMBER)).status, 400, 'a score or words');
  const answered = await post('/api/broadcast', { action: 'answer', id, reply: 'ชอบหน้าปฏิทินครับ', rating: 4 }, MEMBER);
  assert.equal(answered.status, 200);
  assert.equal((await answered.json() as { threadId: string }).threadId, '99999999-9999-4999-8999-999999999999');
  assert.deepEqual(feedbackCreates, [{ actor: MEMBER, input: { body: 'ตอบข้อความจากทีมงาน: “สวัสดีครับ แอปใช้ดีไหมครับ”\nให้คะแนนแอป 4 จาก 5\n\nชอบหน้าปฏิทินครับ', category: 'other' } }]);
  assert.equal((await (await get('/api/broadcast', MEMBER)).json() as { broadcast: unknown }).broadcast, null, 'answered: not shown again');
  // A second tap keeps the first answer and starts no second conversation.
  await post('/api/broadcast', { action: 'answer', id, reply: 'อีกครั้ง', rating: 1 }, MEMBER);
  assert.equal(feedbackCreates.length, 1);

  assert.equal((await get('/api/broadcast?scope=admin', MEMBER)).status, 403);
  const results = await (await get('/api/broadcast?scope=admin', OWNER)).json() as { results: { audience: number; answered: number; average: number; replies: { name: string; reply: string; rating: number }[] }[] };
  assert.equal(results.results[0].audience, 1);
  assert.equal(results.results[0].answered, 1);
  assert.equal(results.results[0].average, 4);
  assert.deepEqual(results.results[0].replies.map(reply => [reply.name, reply.reply, reply.rating]), [['สมาชิก', 'ชอบหน้าปฏิทินครับ', 4]]);

  // Stopped: nobody else sees it.
  assert.equal((await post('/api/broadcast', { action: 'end', id }, OWNER)).status, 200);
  privateState.delete(MEMBER);
  assert.equal((await (await get('/api/broadcast', MEMBER)).json() as { broadcast: unknown }).broadcast, null);
});

test('a written answer is kept even when its conversation cannot be started', async () => {
  const { id } = await (await post('/api/broadcast', { action: 'send', body: 'สวัสดีครับ', askRating: false }, OWNER)).json() as { id: string };
  failFeedback = true;
  const answered = await post('/api/broadcast', { action: 'answer', id, reply: 'ขอบคุณครับ' }, MEMBER);
  assert.equal(answered.status, 200);
  assert.equal((await answered.json() as { threadId: string | null }).threadId, null);
  assert.equal(((privateState.get(MEMBER)?.broadcastAnswers as Record<string, { reply: string }>)[id]).reply, 'ขอบคุณครับ');
});

test('the ผู้ใช้งาน view is for the owner only and reads presence, visits and sign-ins', async () => {
  presence.set(MEMBER, new Date(Date.now() - 20_000).toISOString());
  privateState.set(MEMBER, { activity: { v: 1, visits: [[Math.floor(Date.now() / 60_000) - 30, 25]] } });
  assert.equal((await get('/api/admin-activity?range=30', MEMBER)).status, 403);
  const response = await get('/api/admin-activity?range=30', OWNER);
  assert.equal(response.status, 200);
  const summary = await response.json() as { totals: { online: number; accounts: number }; accounts: { userId: string; status: string; visits: number; minutes: number }[] };
  assert.equal(summary.totals.accounts, 2);
  const member = summary.accounts.find(account => account.userId === MEMBER)!;
  assert.deepEqual([member.status, member.visits, member.minutes], ['online', 1, 25]);
  assert.equal((await get('/api/admin-activity?range=12', OWNER)).status, 400);
});

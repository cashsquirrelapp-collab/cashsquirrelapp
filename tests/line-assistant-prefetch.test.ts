import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAssistantMessage,
  prefetchLinkedContext,
  type LineAssistantDependencies,
  type UserRow,
} from '../backend/src/services/lineAssistant';

const userId = '11111111-1111-4111-8111-111111111111';
const linkedUser: UserRow = { user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [] };
const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://preview.example.test';
after(() => { if (previousAppUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previousAppUrl; });

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function dependencies(calls: string[], over: Partial<{ user: UserRow | null; allowed: boolean; pro: boolean; delay: number; userError: boolean }> = {}): LineAssistantDependencies {
  const { user = { ...linkedUser }, allowed = true, pro = true, delay = 0, userError = false } = over;
  return {
    async findUserByLineId() { calls.push('find'); await wait(delay); if (userError) throw new Error('db down'); return user && { ...user }; },
    async checkLinkedAccountWriteAccess() { calls.push('access'); await wait(delay); return allowed ? { allowed: true as const } : { allowed: false as const, status: 403 as const, error: 'บัญชีนี้พักใช้งานอยู่' }; },
    async isProUser() { calls.push('pro'); await wait(delay); return pro; },
  };
}
const text = (messages: Awaited<ReturnType<typeof handleAssistantMessage>>) => (messages?.[0] as { text?: string } | undefined)?.text || '';

test('prefetched reads are used once: the assistant makes no second lookup', async () => {
  const calls: string[] = [];
  const deps = dependencies(calls);
  const prefetched = prefetchLinkedContext('Uline', deps);
  const reply = await handleAssistantMessage('Uline', 'สรุปเดือนนี้', 'op-1', deps, prefetched);
  assert.ok(reply && reply.length > 0);
  assert.deepEqual(calls.sort(), ['access', 'find', 'pro']);
});

test('the access and Pro checks wait on the network together, not one after the other', async () => {
  const calls: string[] = [];
  const deps = dependencies(calls, { delay: 60 });
  const started = Date.now();
  await prefetchLinkedContext('Uline', deps);
  const took = Date.now() - started;
  // find (60) then access and pro in parallel (60): about 120 ms, where the old order took about 180.
  assert.ok(took < 160, `took ${took} ms`);
});

test('a linked user\'s unrecognised message gets no reply: an empty list, not the link-code null', async () => {
  // Owner, 2026-10-22: the "เลขายังไม่เข้าใจครับ" card was removed; the bot stays quiet instead.
  const deps = dependencies([]);
  for (const message of ['สวัสดี', 'อะไรนะ']) {
    assert.deepEqual(await handleAssistantMessage('Uline', message, `op-quiet-${message}`, deps, prefetchLinkedContext('Uline', deps)), []);
  }
});

test('an unlinked LINE user still gets null (link-code flow) and nothing else is read', async () => {
  const calls: string[] = [];
  const deps = dependencies(calls, { user: null });
  assert.equal(await handleAssistantMessage('Uline', 'สวัสดี', 'op-2', deps, prefetchLinkedContext('Uline', deps)), null);
  assert.deepEqual(calls, ['find']);
});

test('a paused account is stopped before Pro is considered, with the same message as before', async () => {
  const deps = dependencies([], { allowed: false, pro: false });
  const reply = await handleAssistantMessage('Uline', 'สรุปเดือนนี้', 'op-3', deps, prefetchLinkedContext('Uline', deps));
  assert.match(text(reply), /พักใช้งาน/);
});

test('an expired account gets the renewal prompt, not the data', async () => {
  const deps = dependencies([], { pro: false });
  const reply = await handleAssistantMessage('Uline', 'สรุปเดือนนี้', 'op-4', deps, prefetchLinkedContext('Uline', deps));
  assert.match(text(reply), /Pro ของคุณหมดอายุ/);
});

test('a failed user lookup is reported as a temporary problem, never as "not linked"', async () => {
  const deps = dependencies([], { userError: true });
  const reply = await handleAssistantMessage('Uline', 'สรุปเดือนนี้', 'op-5', deps, prefetchLinkedContext('Uline', deps));
  assert.notEqual(reply, null);
  assert.match(text(reply), /ปัญหาชั่วคราว/);
});

test('prefetching never rejects, even when every lookup fails', async () => {
  const failing: LineAssistantDependencies = {
    async findUserByLineId() { throw new Error('x'); },
    async checkLinkedAccountWriteAccess() { throw new Error('y'); },
    async isProUser() { throw new Error('z'); },
  };
  const result = await prefetchLinkedContext('Uline', failing);
  assert.equal(result.user.status, 'rejected');
});

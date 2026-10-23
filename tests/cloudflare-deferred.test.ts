import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithin } from '../cloudflare/deferred';

const ctx = () => { const pending: Promise<unknown>[] = []; return { pending, waitUntil: (p: Promise<unknown>) => { pending.push(p); } }; };
const later = <T,>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));

test('a handler that finishes inside the budget answers with its own response', async () => {
  const c = ctx();
  const res = await answerWithin(later(5, new Response('real', { status: 200 })), 200, c, () => new Response('deferred'));
  assert.equal(await res.text(), 'real');
});

test('a slow handler gets an early answer and still finishes in the background', async () => {
  const c = ctx(); let finished = false;
  const work = later(80, new Response('late')).then(r => { finished = true; return r; });
  const started = Date.now();
  const res = await answerWithin(work, 10, c, () => new Response('deferred', { status: 200 }));
  assert.equal(await res.text(), 'deferred');
  assert.ok(Date.now() - started < 70, 'answered before the handler finished');
  assert.equal(finished, false);
  await Promise.all(c.pending); // what ctx.waitUntil does after the response is sent
  assert.equal(finished, true);
});

test('a quick failure is thrown (so a bad signature is still an error), a late one is reported not thrown', async () => {
  await assert.rejects(answerWithin(Promise.reject(new Error('boom')), 200, ctx(), () => new Response('x')), /boom/);
  const c = ctx(); const seen: unknown[] = [];
  const res = await answerWithin(new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('late')), 40)), 5, c, () => new Response('deferred'), e => seen.push(e));
  assert.equal(await res.text(), 'deferred');
  await Promise.all(c.pending);
  assert.equal(seen.length, 1);
});

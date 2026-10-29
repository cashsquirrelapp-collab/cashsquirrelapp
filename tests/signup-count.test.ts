import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countsAsSignup, isTestEmail, listedExclusions, signupCache } from '../backend/src/services/signupCount.js';

// The landing's "มีผู้สมัครแล้ว {จำนวน} คน" (owner, 2026-10-29): real accounts once each, never the team, tests, guests or
// accounts on their way out; only the total leaves the server, counted at most once a minute.

const confirmed = '2026-10-01T00:00:00Z';
const person = (id: string, email: string, more: Record<string, unknown> = {}) => ({ id, email, email_confirmed_at: confirmed, ...more });

test('an account counts once it is confirmed, and not when it is a guest, a test address or excluded', () => {
  const none = new Set<string>();
  assert.equal(countsAsSignup(person('a', 'somchai@gmail.com'), none), true);
  assert.equal(countsAsSignup(person('b', 'Nok@Hotmail.co.th'), none), true);
  assert.equal(countsAsSignup({ id: 'c', email: 'new@gmail.com' }, none), false); // never confirmed: cannot sign in
  assert.equal(countsAsSignup(person('d', 'guest@gmail.com', { is_anonymous: true }), none), false);
  assert.equal(countsAsSignup(person('e', 'studio@example.test'), none), false);
  assert.equal(countsAsSignup(person('f', 'qa@example.com'), none), false);
  assert.equal(countsAsSignup(person('g', 'dev@krarok.localhost'), none), false);
  assert.equal(countsAsSignup(person('h', ''), none), false);
  // the team: admins and the report inbox come in as ids; the owner's list may name emails too
  assert.equal(countsAsSignup(person('admin-1', 'owner@gmail.com'), new Set(['admin-1'])), false);
  assert.equal(countsAsSignup(person('i', 'Tester@Gmail.com'), new Set(['tester@gmail.com'])), false);
  // real domains that only look like test words are people
  assert.equal(isTestEmail('ploy@testing.co.th'), false);
  assert.equal(isTestEmail('ploy@mytest.com'), false);
  assert.equal(isTestEmail('ploy@shop.test'), true);
});

test("the owner's exclusions and the public report inbox are left out", () => {
  assert.deepEqual(listedExclusions({ SIGNUP_COUNT_EXCLUDE: ' QA@gmail.com, 1111-aaaa ', FEEDBACK_PUBLIC_ACCOUNT_ID: 'ABCD-ef' }), ['qa@gmail.com', '1111-aaaa', 'abcd-ef']);
  assert.deepEqual(listedExclusions({}), []);
});

test('the total is counted at most once a minute, one count at a time; a failure keeps the last real total, never a made-up one', async () => {
  let now = 0, counts = 0, fail = false, total = 41;
  const read = signupCache(async () => { counts++; if (fail) throw new Error('db down'); return total; }, 60_000, () => now);
  // many visitors at once: one count
  const answers = await Promise.all([read(), read(), read()]);
  assert.deepEqual(answers.map(answer => answer.signups), [41, 41, 41]);
  assert.equal(counts, 1);
  now = 59_000; total = 42;
  assert.equal((await read()).signups, 41); // still the kept total
  assert.equal(counts, 1);
  now = 61_000;
  assert.equal((await read()).signups, 42); // a minute on: counted again
  assert.equal(counts, 2);
  // the database fails: the last real total stays (marked not fresh)
  now = 130_000; fail = true;
  const kept = await read();
  assert.equal(kept.signups, 42);
  assert.equal(kept.fresh, false);
  // with no real total ever, nothing is invented
  const empty = signupCache(async () => { throw new Error('db down'); }, 60_000, () => 0);
  await assert.rejects(empty());
});

test('the public route: GET only, only the total, its limit kept in memory (never a database call per visitor)', () => {
  const handler = readFileSync(new URL('../backend/src/handlers/public-stats.ts', import.meta.url), 'utf8');
  assert.match(handler, /json\(\{ signups: result\.signups, countedAt:/);
  // the answer holds the total and when it was counted, nothing else
  assert.equal((handler.match(/\.json\(/g) || []).length, 1);
  const router = readFileSync(new URL('../backend/src/http/router.ts', import.meta.url), 'utf8');
  assert.match(router, /routes\['public-stats'\] = publicStats;/);
  const ingress = readFileSync(new URL('../backend/src/security/ingress.ts', import.meta.url), 'utf8');
  assert.match(ingress, /if \(route === 'public-stats'\) return;/);
  assert.match(ingress, /'public-stats': \{ group: 'public-stats', limit: 30 \}/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeSignups, signupVia } from '../backend/src/services/signupFeed';

// The admin page's live sign-ups (owner, 2026-11-28): totals follow the landing's rule; the list shows the newest, with
// unconfirmed ones marked, and never the team, test addresses or excluded accounts.
test('live sign-ups: landing totals, today in Bangkok, newest first, the team and tests left out', () => {
  const now = new Date('2026-11-28T10:00:00Z'); // 17:00 Bangkok
  const users = [
    { id: 'A', email: 'a@gmail.com', created_at: '2026-11-28T09:50:00Z', email_confirmed_at: '2026-11-28T09:50:00Z', app_metadata: { provider: 'google' } },
    { id: 'B', email: 'b@gmail.com', created_at: '2026-11-27T18:00:00Z', email_confirmed_at: 'x', app_metadata: { provider: 'email', signup_channel: 'line' } }, // 01:00 on the 28th in Bangkok
    { id: 'C', email: 'c@gmail.com', created_at: '2026-11-28T08:00:00Z', app_metadata: { provider: 'email' } }, // not confirmed
    { id: 'D', email: 'd@gmail.com', created_at: '2026-11-20T08:00:00Z', email_confirmed_at: 'x', app_metadata: { provider: 'email' } },
    { id: 'T', email: 'tester@example.com', created_at: '2026-11-28T09:59:00Z', email_confirmed_at: 'x' },
    { id: 'ADMIN', email: 'owner@gmail.com', created_at: '2026-11-28T09:58:00Z', email_confirmed_at: 'x' },
    { id: 'G', email: null, created_at: '2026-11-28T09:57:00Z', is_anonymous: true },
  ];
  const feed = summarizeSignups(users, new Set(['admin']), now);
  assert.equal(feed.total, 3, 'A, B and D: confirmed, not a test, not the team');
  assert.equal(feed.today, 2, 'A and B signed up on 28 Nov in Bangkok');
  assert.deepEqual(feed.latest.map(item => item.userId), ['a', 'c', 'b', 'd']);
  assert.deepEqual(feed.latest.map(item => item.via), ['google', 'email', 'line', 'email']);
  assert.equal(feed.latest[1].confirmed, false);
  assert.equal(signupVia({ id: 'x', app_metadata: {} }), 'other');
});

test('live sign-ups: the Google picture always, the address only for the owner, never a LINE inner address or another host', () => {
  const now = new Date('2026-11-28T10:00:00Z');
  const users = [
    { id: 'G', email: 'g@gmail.com', created_at: '2026-11-28T09:00:00Z', email_confirmed_at: 'x', app_metadata: { provider: 'google' }, user_metadata: { avatar_url: 'https://lh3.googleusercontent.com/a/abc=s96-c' } },
    { id: 'L', email: 'u1@line.krarok.invalid', created_at: '2026-11-28T08:00:00Z', email_confirmed_at: 'x', app_metadata: { signup_channel: 'line' } },
    { id: 'X', email: 'x@gmail.com', created_at: '2026-11-28T07:00:00Z', email_confirmed_at: 'x', user_metadata: { picture: 'http://evil.example/p.png' } },
  ];
  const team = summarizeSignups(users, new Set(), now, 8, false);
  assert.equal(team.total, 3, 'the LINE account counts');
  assert.equal(team.latest[0].avatarUrl, 'https://lh3.googleusercontent.com/a/abc=s96-c');
  assert.ok(team.latest.every(item => item.email === null), 'team admins see no addresses');
  assert.equal(team.latest[2].avatarUrl, null, 'only Google and LINE picture hosts over https');
  const owner = summarizeSignups(users, new Set(), now, 8, true);
  assert.deepEqual(owner.latest.map(item => item.email), ['g@gmail.com', null, 'x@gmail.com']);
});

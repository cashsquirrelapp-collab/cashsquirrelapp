import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceHttps } from '../cloudflare/transport.js';

test('HTTP page requests redirect to the same HTTPS path and query', () => {
  const response = enforceHttps(new Request('http://cash.example.test/login?next=%2Fdashboard'));
  assert.equal(response?.status, 308);
  assert.equal(response?.headers.get('location'), 'https://cash.example.test/login?next=%2Fdashboard');
  assert.equal(response?.headers.get('cache-control'), 'no-store');
});

test('HTTP mutation requests are rejected without replaying credentials or bodies', async () => {
  const response = enforceHttps(new Request('http://cash.example.test/api/auth', {
    method: 'POST', body: JSON.stringify({ email: 'user@example.test', password: 'not-a-real-password' }),
    headers: { 'content-type': 'application/json' },
  }));
  assert.equal(response?.status, 400);
  assert.equal(response?.headers.get('location'), null);
  assert.equal(await response?.text(), 'HTTPS required');
});

test('HTTPS requests continue to the normal Worker and asset routing', () => {
  assert.equal(enforceHttps(new Request('https://cash.example.test/dashboard')), null);
});

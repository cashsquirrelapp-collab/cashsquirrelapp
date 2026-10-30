import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enforceHttps, toMainHost } from '../cloudflare/transport.js';

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

// Owner, 2026-10-31: "ต่อ www.krarok.com ด้วย". One address for the site.
test('www.krarok.com page loads go to krarok.com, same path and query; other hosts and methods are left alone', async () => {
  const page = toMainHost(new Request('https://www.krarok.com/founder?x=1#top'));
  assert.equal(page?.status, 301);
  assert.equal(page?.headers.get('location'), 'https://krarok.com/founder?x=1');
  assert.equal(toMainHost(new Request('https://www.krarok.com/'))?.headers.get('location'), 'https://krarok.com/');
  const post = toMainHost(new Request('https://www.krarok.com/api/auth', { method: 'POST', body: '{}' }));
  assert.equal(post?.status, 421);
  assert.equal(post?.headers.get('location'), null);
  for (const url of ['https://krarok.com/', 'https://kraroktunngern.cashsquirrelapp.workers.dev/app', 'https://www.krarok.com.evil.example/']) {
    assert.equal(toMainHost(new Request(url)), null, url);
  }
});

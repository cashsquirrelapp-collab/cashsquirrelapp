import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { prepaidLookup } from '../backend/src/services/prepaidPlans.js';
import { recurringLookup, recurringProductId } from '../backend/src/services/cardPlans.js';

// /api/admin-payment-readiness (owner, 2026-10-27): owner only, like the Stripe money view. Reading never writes to
// Stripe; the create button is a POST with one field, and nothing secret leaves the server.

process.env.APP_URL = 'http://127.0.0.1:3000';
process.env.SUPABASE_URL = 'https://payment-ready.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin';
process.env.SESSION_SECRET = 'payment-ready-test-only-secret-'.repeat(4);
process.env.STRIPE_SECRET_KEY = 'rk_live_mock_ready_key_not_a_real_secret';
process.env.STRIPE_MODE = 'live';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_mock_publishable';
process.env.KRAROK_PREPAID_ENABLED = 'true';

const ownerEmail = 'heidnsko1234@gmail.com';
const user = { id: '11111111-1111-4111-8111-111111111111', email: ownerEmail, email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', user_metadata: {} };
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: '33333333-3333-4333-8333-333333333333' })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
const headers = { cookie, 'x-account-id': user.id };
const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'content-type': 'application/json', origin: process.env.APP_URL!, 'x-csrf-protection': '1' } });
const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let role: 'admin' | 'user' = 'admin';
let stripeCalls: string[] = [];
let catalog: Record<string, unknown>[] = [];

const price = (lookup: string, amount: number, recurring: boolean) => ({
  id: `price_${lookup}`, object: 'price', active: true, livemode: true, type: recurring ? 'recurring' : 'one_time', currency: 'thb', unit_amount: amount * 100,
  billing_scheme: 'per_unit', lookup_key: lookup, product: recurring ? recurringProductId() : 'prod_prepaid', custom_unit_amount: null, transform_quantity: null,
  tax_behavior: 'unspecified', recurring: recurring ? { interval: 'month', interval_count: 1, usage_type: 'licensed', trial_period_days: null } : null,
  metadata: recurring ? {} : { offer_version: 'krarok_prepaid_20261020', period: 'month', months: '1' },
});

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.origin === process.env.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return json(user);
      if (url.pathname.endsWith('/rpc/cashflow_session_active') || url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
      if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role });
      throw new Error(`Unexpected database read ${url.pathname}`);
    }
    if (url.hostname === 'api.stripe.com') {
      const method = init?.method || 'GET';
      stripeCalls.push(`${method} ${url.pathname}`);
      if (method === 'GET' && url.pathname === '/v1/prices') {
        const keys = [...url.searchParams.entries()].filter(([key]) => key.startsWith('lookup_keys')).map(([, value]) => value);
        return json({ object: 'list', data: catalog.filter(item => keys.includes(item.lookup_key as string)), has_more: false });
      }
      if (method === 'POST' && url.pathname === '/v1/prices') {
        const form = new URLSearchParams(String(init?.body));
        const lookup = form.get('lookup_key')!;
        catalog = catalog.filter(item => item.lookup_key !== lookup);
        const made = price(lookup, Number(form.get('unit_amount')) / 100, form.has('recurring[interval]'));
        catalog.push(made);
        return json(made);
      }
      if (url.pathname === '/v1/payment_method_configurations') return json({ object: 'list', has_more: false, data: [{ id: 'pmc_1', object: 'payment_method_configuration', active: true, is_default: true, livemode: true,
        card: { available: true, display_preference: { value: 'on' } }, promptpay: { available: true, display_preference: { value: 'on' } } }] });
      if (url.pathname === '/v1/webhook_endpoints') return json({ object: 'list', has_more: false, data: [{ id: 'we_1', object: 'webhook_endpoint', url: 'http://127.0.0.1:3000/api/stripe-webhook', enabled_events: ['*'], status: 'enabled', livemode: true }] });
      throw new Error(`Unexpected Stripe call ${method} ${url.pathname}`);
    }
    return realFetch(input, init);
  };
  server = await new Promise<Server>(resolve => { const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

beforeEach(() => {
  role = 'admin';
  stripeCalls = [];
  catalog = [price(prepaidLookup('month'), 159, false), price(recurringLookup('month'), 159, true)];
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('the owner reads it: only reads reach Stripe, and nothing secret comes back', async () => {
  const response = await realFetch(`${origin}/api/admin-payment-readiness`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(body.status, 'blocked');
  assert.equal(body.prices.state, 'problem');
  assert.equal(body.methods.state, 'ok');
  assert.equal(body.webhook.state, 'ok');
  assert.ok(stripeCalls.length > 0 && stripeCalls.every(call => call.startsWith('GET ')), stripeCalls.join(', '));
  assert.doesNotMatch(text, /(sk|rk|pk)_(test|live)_/);
});

test('the owner\'s button creates the missing prices, and the answer after it is ready', async () => {
  const response = await realFetch(`${origin}/api/admin-payment-readiness`, post({ action: 'create_prices' }));
  assert.equal(response.status, 200);
  const body = await response.json() as { status: string; created: number };
  const writes = stripeCalls.filter(call => call.startsWith('POST '));
  assert.equal(body.created, writes.length);
  assert.ok(writes.length >= 2 && writes.every(call => call === 'POST /v1/prices'), writes.join(', '));
  assert.equal(body.status, 'ready');
});

test('anyone else, a wrong action or a crafted body: refused before Stripe is touched', async () => {
  role = 'user';
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, { headers })).status, 403);
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, post({ action: 'create_prices' }))).status, 403);
  role = 'admin';
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, post({ action: 'delete_prices' }))).status, 400);
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, post({ action: 'create_prices', amount: 1 }))).status, 400);
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, { ...post({ action: 'create_prices' }), headers: { ...post({}).headers, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await realFetch(`${origin}/api/admin-payment-readiness`, { headers: { cookie, 'x-account-id': '22222222-2222-4222-8222-222222222222' } })).status, 401);
  assert.deepEqual(stripeCalls, []);
});

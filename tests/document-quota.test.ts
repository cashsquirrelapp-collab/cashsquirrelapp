import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';
import { documentQuotaMonth, FREE_DOCUMENT_LIMIT } from '../backend/src/services/documentQuota.js';

process.env.APP_URL = 'http://127.0.0.1:3000'; process.env.SUPABASE_URL = 'https://project.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin'; process.env.SESSION_SECRET = 'test-only-secret-'.repeat(4);

// An account created long ago, so it is past the 14-day trial.
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', user_metadata: {}, created_at: '2020-01-01T00:00:00Z' };
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'private-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;

const realFetch = globalThis.fetch;
let server: Server; let origin: string;
let pro = false; let conflictNextApply = false;
let claims = new Set<string>();
let documents = new Map<string, number>(); // id -> version, the cashflow_invoices rows
let applyCalls = 0;

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = String(input); const method = (init?.method || 'GET').toUpperCase();
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(body === null && status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    if (!url.startsWith('https://project.supabase.co/')) return realFetch(input, init);
    if (url.includes('/auth/v1/user')) return json(user);
    if (url.includes('/rpc/cashflow_rate_limit') || url.includes('/rpc/cashflow_session_active')) return json(true);
    if (url.includes('/rest/v1/subscriptions')) return json(pro ? { status: 'active', plan: null, current_period_end: '2099-01-01T00:00:00Z' } : null);
    if (url.includes('/rest/v1/cashflow_account_snapshot')) {
      return json({ user_id: user.id, email: user.email, jobs: [], expenses: [], goals: [], invoices: [], notif_settings: {}, versions: { cashflow_invoices: {}, cashflow_documents: {} } });
    }
    if (url.includes('/rest/v1/cashflow_delivery_claims')) {
      const query = new URL(url).searchParams;
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body));
        const key = (Array.isArray(body) ? body[0] : body).key as string;
        if (claims.has(key)) return json({ code: '23505', message: 'duplicate key value' }, 409);
        claims.add(key); return json(null, 201);
      }
      if (method === 'DELETE') { claims.delete(query.get('key')!.replace(/^eq\./, '')); return json(null, 204); }
      const pattern = query.get('key')!.replace(/^like\./, '');
      const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
      const count = [...claims].filter(key => re.test(key)).length;
      return new Response(null, { status: 200, headers: { 'content-range': `*/${count}` } });
    }
    if (url.includes('/rpc/cashflow_apply_changes')) {
      applyCalls += 1;
      if (conflictNextApply) { conflictNextApply = false; return json(false); }
      const { p_changes } = JSON.parse(String(init?.body));
      const next = new Map(documents);
      for (const c of p_changes) {
        if (c.table !== 'cashflow_invoices') continue;
        if (c.op === 'delete') { if (next.get(c.id) !== c.version) return json(false); next.delete(c.id); }
        else if (c.version === null) { if (next.has(c.id)) return json(false); next.set(c.id, 1); }
        else { if (next.get(c.id) !== c.version) return json(false); next.set(c.id, c.version + 1); }
      }
      documents = next; return json(true);
    }
    throw new Error(`Unexpected Supabase call ${method} ${url}`);
  };
  server = createApp().listen(0); await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`; process.env.APP_URL = origin;
});
after(() => { globalThis.fetch = realFetch; server.close(); });
beforeEach(() => { pro = false; conflictNextApply = false; claims = new Set(); documents = new Map(); applyCalls = 0; });

const issuer = { name: 'ร้านตัวอย่าง', address: 'กรุงเทพฯ', phone: '', email: 'shop@example.com', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
const doc = (id: string) => ({ id, documentType: 'invoice', documentNo: `INV-${id}`, createdDate: '2026-10-15', issuer, client: { name: 'ลูกค้าตัวอย่าง', address: '', phone: '', email: '', taxId: '' }, items: [{ id: 'item', description: 'งานตัวอย่าง', quantity: 1, price: 1000 }], vatRate: 0, whtRate: 0 });
const create = (id: string) => ({ table: 'cashflow_invoices', id, op: 'set', version: null, data: doc(id) });
const headers = () => ({ cookie, 'x-account-id': user.id, origin, 'x-csrf-protection': '1', 'content-type': 'application/json' });
const save = (changes: unknown[]) => realFetch(`${origin}/api/data`, { method: 'POST', headers: headers(), body: JSON.stringify({ changes }) });
const read = async () => (await (await realFetch(`${origin}/api/data`, { headers: headers() })).json()) as any;

test('a Free account creates up to 10 documents a month; the 11th is refused by the API with an upgrade code', async () => {
  assert.deepEqual((await read()).document_quota, { used: 0, limit: FREE_DOCUMENT_LIMIT, month: documentQuotaMonth() });
  for (let n = 1; n <= FREE_DOCUMENT_LIMIT; n++) {
    const res = await save([create(`doc-${n}`)]);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).document_quota.used, n);
  }
  const refused = await save([create('doc-11')]);
  assert.equal(refused.status, 402);
  const body = await refused.json();
  assert.equal(body.code, 'document_quota_exceeded');
  assert.match(body.error, /ครบ 10 ฉบับ/);
  assert.equal(documents.has('doc-11'), false);
  assert.equal(applyCalls, FREE_DOCUMENT_LIMIT); // the refused save never reached the database
});

test('deleting documents does not give the quota back, and editing never uses it', async () => {
  for (let n = 1; n <= FREE_DOCUMENT_LIMIT; n++) assert.equal((await save([create(`doc-${n}`)])).status, 200);
  const removed = await save([1, 2, 3].map(n => ({ table: 'cashflow_invoices', id: `doc-${n}`, op: 'delete', version: 1 })));
  assert.equal(removed.status, 200);
  assert.equal(documents.size, FREE_DOCUMENT_LIMIT - 3);
  assert.equal((await read()).document_quota.used, FREE_DOCUMENT_LIMIT);
  assert.equal((await save([create('again')])).status, 402);
  const edited = await save([{ table: 'cashflow_invoices', id: 'doc-4', op: 'set', version: 1, data: { ...doc('doc-4'), documentNo: 'INV-EDITED' } }]);
  assert.equal(edited.status, 200);
});

test('a batch that does not fit is refused whole, and a save that fails gives its slots back', async () => {
  for (let n = 1; n <= 9; n++) assert.equal((await save([create(`doc-${n}`)])).status, 200);
  assert.equal((await save([create('a'), create('b')])).status, 402); // two new documents, one slot left
  assert.equal((await read()).document_quota.used, 9);
  conflictNextApply = true;
  assert.equal((await save([create('c')])).status, 409);
  assert.equal((await read()).document_quota.used, 9);
  assert.equal((await save([create('c')])).status, 200);
  assert.equal((await read()).document_quota.used, 10);
});

test('two saves at the same moment cannot share the last slot', async () => {
  for (let n = 1; n <= 9; n++) assert.equal((await save([create(`doc-${n}`)])).status, 200);
  const statuses = (await Promise.all([save([create('x')]), save([create('y')])])).map(res => res.status).sort();
  assert.deepEqual(statuses, [200, 402]);
  assert.equal(claims.size, FREE_DOCUMENT_LIMIT);
});

test('Pro accounts are not counted and see no quota', async () => {
  pro = true;
  assert.equal((await read()).document_quota, null);
  for (let n = 1; n <= FREE_DOCUMENT_LIMIT + 2; n++) {
    const res = await save([create(`doc-${n}`)]);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).document_quota, undefined);
  }
  assert.equal(claims.size, 0);
});

test('the quota month follows Thai time', () => {
  assert.equal(documentQuotaMonth(new Date('2026-10-31T16:59:00Z')), '2026-10'); // 23:59 in Bangkok
  assert.equal(documentQuotaMonth(new Date('2026-10-31T17:00:00Z')), '2026-11'); // 00:00 on 1 Nov in Bangkok
});

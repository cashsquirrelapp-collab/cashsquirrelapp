import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApp } from '../backend/src/http/app.js';
import { seal } from '../backend/src/security/cookies.js';

process.env.APP_URL = 'http://127.0.0.1:3000'; process.env.SUPABASE_URL = 'https://project.supabase.co'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-admin'; process.env.SESSION_SECRET = 'test-only-secret-'.repeat(4);

const user = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', user_metadata: {}, created_at: '2020-01-01T00:00:00Z' };
const other = '22222222-2222-4222-8222-222222222222';
const group = '44444444-4444-4444-8444-444444444444';
const sessionId = '33333333-3333-4333-8333-333333333333';
const jwt = `e30.${Buffer.from(JSON.stringify({ sub: user.id, session_id: sessionId })).toString('base64url')}.test`;
const cookie = `cashflow-session=${seal({ access_token: jwt, refresh_token: 'private-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;

const realFetch = globalThis.fetch;
let server: Server; let origin: string;
let pro = false; let member = false;
let rows: any[] = [];
let stored: { path: string; bytes: number; contentType: string | null }[] = [];

before(async () => {
  globalThis.fetch = async (input, init) => {
    const url = String(input); const method = (init?.method || 'GET').toUpperCase();
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    if (!url.startsWith('https://project.supabase.co/')) return realFetch(input, init);
    if (url.includes('/auth/v1/user')) return json(user);
    if (url.includes('/rpc/cashflow_rate_limit') || url.includes('/rpc/cashflow_session_active')) return json(true);
    if (url.includes('/rest/v1/subscriptions')) return json(pro ? { status: 'active', current_period_end: '2099-01-01T00:00:00Z' } : null);
    if (url.includes('/rest/v1/cashflow_group_members')) return json(member ? { user_id: user.id } : null);
    if (url.includes('/rest/v1/cashflow_vault_files')) {
      const query = new URL(url).searchParams;
      const match = (row: any) => [...query.entries()].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
      if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${rows.filter(match).length}` } });
      if (method === 'POST') { const row = { ...JSON.parse(String(init?.body)), created_at: '2026-10-06T00:00:00Z' }; rows.push(row); return json(row, 201); }
      if (method === 'DELETE') { rows = rows.filter(row => !match(row)); return json(null, 204); }
      const found = rows.filter(match);
      return new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object') ? json(found[0] ?? null) : json(found);
    }
    if (url.includes('/storage/v1/bucket/document-vault')) return json({ id: 'document-vault', name: 'document-vault' });
    if (url.includes('/storage/v1/object/document-vault/') && method === 'POST') {
      const body = init?.body as any;
      const bytes = body instanceof Uint8Array ? body.length : body instanceof Blob ? body.size : Buffer.byteLength(String(body));
      stored.push({ path: url.split('/storage/v1/object/document-vault/')[1], bytes, contentType: new Headers(init?.headers).get('content-type') });
      return json({ Key: 'ok' });
    }
    if (url.includes('/storage/v1/object/document-vault') && method === 'DELETE') return json([]);
    throw new Error(`Unexpected Supabase call ${method} ${url}`);
  };
  server = createApp().listen(0); await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`; process.env.APP_URL = origin;
});
after(() => { globalThis.fetch = realFetch; server.close(); });
beforeEach(() => { pro = false; member = false; rows = []; stored = []; });

const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 32)]);
const meta = (extra: Record<string, unknown> = {}) => encodeURIComponent(JSON.stringify({ kind: 'wht50', jobId: 'job-1', jobName: 'TikTok Campaign', client: 'Brand A', fileName: '../50Tawi_BrandA.pdf', ...extra }));
const upload = (body: Buffer, headers: Record<string, string> = {}) => realFetch(`${origin}/api/vault-upload`, {
  method: 'POST', body, headers: { origin, 'x-csrf-protection': '1', cookie, 'content-type': 'application/octet-stream', 'x-vault-meta': meta(), ...headers },
});

test('uploading needs a signed-in account and the CSRF header', async () => {
  const anonymous = await realFetch(`${origin}/api/vault-upload`, { method: 'POST', body: pdf, headers: { origin, 'x-csrf-protection': '1', 'content-type': 'application/octet-stream', 'x-vault-meta': meta() } });
  assert.equal(anonymous.status, 401);
  const noCsrf = await realFetch(`${origin}/api/vault-upload`, { method: 'POST', body: pdf, headers: { origin, cookie, 'content-type': 'application/octet-stream', 'x-vault-meta': meta() } });
  assert.equal(noCsrf.status, 403);
  assert.equal(stored.length, 0);
});

test('only Pro accounts can upload, and nothing is stored otherwise', async () => {
  const response = await upload(pdf);
  assert.equal(response.status, 402);
  assert.equal((await response.json()).code, 'pro_required');
  assert.equal(stored.length, 0); assert.equal(rows.length, 0);
});

test('the file type is checked from its bytes: a renamed web page is rejected', async () => {
  pro = true;
  const response = await upload(Buffer.from('<html><script>alert(1)</script></html>'));
  assert.equal(response.status, 415);
  assert.equal(stored.length, 0); assert.equal(rows.length, 0);
});

test('a real PDF is stored privately under the account with a clean name', async () => {
  pro = true;
  const response = await upload(pdf);
  assert.equal(response.status, 201);
  const { file } = await response.json();
  assert.equal(file.fileName, '50Tawi_BrandA.pdf');
  assert.equal(file.kind, 'wht50'); assert.equal(file.jobId, 'job-1'); assert.equal(file.mimeType, 'application/pdf');
  assert.equal(stored.length, 1);
  assert.match(stored[0].path, new RegExp(`^user/${user.id}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(rows[0].user_id, user.id); assert.equal(rows[0].group_id, null); assert.equal(rows[0].uploaded_by, user.id);
});

test('a group workspace is only reachable by its members', async () => {
  pro = true;
  const outsider = await upload(pdf, { 'x-finance-group': group });
  assert.equal(outsider.status, 403);
  assert.equal(stored.length, 0);
  member = true;
  const inside = await upload(pdf, { 'x-finance-group': group });
  assert.equal(inside.status, 201);
  assert.match(stored[0].path, new RegExp(`^group/${group}/`));
  const list = await realFetch(`${origin}/api/vault`, { headers: { cookie, 'x-finance-group': group } });
  assert.equal((await list.json()).files.length, 1);
});

test("another account's file can't be listed, opened or deleted", async () => {
  rows = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', user_id: other, group_id: null, kind: 'other', job_id: null, job_name: null, client: null, file_name: 'secret.pdf', mime_type: 'application/pdf', size_bytes: 10, storage_path: `user/${other}/aaaaaaaa-aaaa-4aaa-8aaa-000000000001.pdf`, created_at: '2026-10-01T00:00:00Z' }];
  const list = await realFetch(`${origin}/api/vault`, { headers: { cookie } });
  assert.deepEqual((await list.json()).files, []);
  const open = await realFetch(`${origin}/api/vault-file?id=aaaaaaaa-aaaa-4aaa-8aaa-000000000001`, { headers: { cookie } });
  assert.equal(open.status, 404);
  const remove = await realFetch(`${origin}/api/vault`, { method: 'POST', body: JSON.stringify({ action: 'delete', id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' }), headers: { origin, 'x-csrf-protection': '1', cookie, 'content-type': 'application/json' } });
  assert.equal(remove.status, 404);
  assert.equal(rows.length, 1);
});

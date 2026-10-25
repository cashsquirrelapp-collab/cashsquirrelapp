import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lineAssistantCommand } from '../backend/src/ai/lineBridge.js';
import type { UserRow } from '../backend/src/services/lineAssistant.js';

// Exercise the real confirmation/adapter path with only in-memory HTTP responses. No LINE send or DB call.
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const proposalId = 'p_0b9d3c1e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const env = { APP_URL: 'https://line-confirm.example.test', SUPABASE_URL: 'https://line-confirm.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role', LIFF_ID: '' };
const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
Object.assign(process.env, env);
after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
const realFetch = globalThis.fetch;
let proposal: Record<string, unknown>;
let writes: any[];
let unknown: string[];
const user = (id: string): UserRow => ({ user_id: id, jobs: [], expenses: [], goals: [], settings: {} });
const profile = { name: 'ร้าน A', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  writes = []; unknown = [];
  proposal = { id: proposalId, user_id: owner, kind: 'edit_document', job_id: 'document-a', base_version: 2,
    record: { id: 'document-a', documentType: 'quotation', documentNo: 'QT-2569-1', createdDate: '2026-10-24', issuer: profile, client: profile,
      items: [{ id: 'line-a', description: 'ออกแบบ', quantity: 1, price: 100 }], vatRate: 0, whtRate: 0 },
    title: 'แก้ไขเอกสาร', changes: [{ label: 'รายการ', value: 'ออกแบบ' }], created_at: '2026-10-24T00:00:00Z' };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.host !== 'line-confirm.supabase.co') { unknown.push(url.origin); throw new Error('External network disabled'); }
    if (url.pathname.endsWith('/rpc/cashflow_ai_claim_proposal')) {
      assert.equal(body.p_id, proposalId);
      return json(body.p_user_id === owner ? [proposal] : []);
    }
    if (url.pathname.endsWith('/rpc/cashflow_apply_changes')) { assert.equal(body.p_user_id, owner); writes.push(body); return json(true); }
    if (url.pathname.endsWith('/cashflow_ai_proposals') && init?.method === 'PATCH') {
      assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
      assert.equal(url.searchParams.get('id'), `eq.${proposalId}`);
      return json(null);
    }
    unknown.push(url.pathname); throw new Error('Unexpected mocked route');
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; assert.deepEqual(unknown, []); });
const uris = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(uris)
  : value && typeof value === 'object' ? [typeof (value as any).uri === 'string' ? (value as any).uri : '', ...Object.values(value).flatMap(uris)].filter(Boolean) : [];

test('confirmed documents and expenses open their trusted saved-record destination, not jobs', async () => {
  const document = await lineAssistantCommand(user(owner), { action: 'confirm', proposalId });
  assert.ok(uris(document).includes('https://line-confirm.example.test/invoice?type=quotation&document=document-a'));
  assert.equal(writes[0].p_changes[0].table, 'cashflow_invoices');
  proposal = { ...proposal, kind: 'edit_expense', job_id: 'expense-a', record: { id: 'expense-a', name: 'เดินทาง', amount: 100, category: 'เดินทาง', date: '2026-10-24' } };
  const expense = await lineAssistantCommand(user(owner), { action: 'confirm', proposalId });
  assert.ok(uris(expense).includes('https://line-confirm.example.test/incomeExpense'));
  assert.ok(!uris(expense).includes('https://line-confirm.example.test/jobs'));
  assert.equal(writes[1].p_changes[0].table, 'cashflow_expenses');
});

test('legacy job confirmations keep the jobs destination and foreign-owner claims never write or receive a destination', async () => {
  proposal = { ...proposal, kind: 'delete_job', job_id: 'job-a', record: null };
  const own = await lineAssistantCommand(user(owner), { action: 'confirm', proposalId });
  assert.ok(uris(own).includes('https://line-confirm.example.test/jobs'));
  const foreign = await lineAssistantCommand(user(other), { action: 'confirm', proposalId });
  assert.equal(writes.length, 1);
  assert.deepEqual(uris(foreign), []);
  assert.ok(JSON.stringify(foreign).includes('หมดเวลา'));
});

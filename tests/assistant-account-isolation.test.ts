import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { seal } from '../backend/src/security/cookies';
import { routeHandler } from '../backend/src/http/router';
import type { UserRow } from '../backend/src/services/lineAssistant';
import { inboxConversationId } from '../backend/src/ai/conversations';
import { createToolbox } from '../backend/src/ai/tools';

// Full router -> session -> repository -> service -> gateway -> tools regression tests.
// Every outgoing request is intercepted. These are synthetic accounts and fake model replies;
// an unrecognised URL throws, so this suite cannot contact a database, Auth or a paid provider.
process.env.APP_URL = 'https://assistant-isolation.example.test';
process.env.SUPABASE_URL = 'https://assistant-isolation.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-publishable';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role';
process.env.SESSION_SECRET = 'assistant-isolation-test-secret-'.repeat(4);
process.env.AI_ENABLED = 'true';
process.env.AI_ADMINS_ONLY = 'false';
// These checks were written for a 1,000-token month; the 2,500 default (owner, 2026-10-24) is tested in ai-message-ceiling.
process.env.AI_PRO_TOKENS_PER_CYCLE = '1000';
process.env.GEMINI_API_KEY = 'synthetic-model-key';
process.env.AI_CHAT_MODEL = 'gemini-3.5-flash-lite';
process.env.AI_ACTION_MODEL = 'gemini-3.5-flash-lite';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const owners = [A, B];
const tag = (id: string) => id === A ? 'ACCOUNT_A_CANARY' : 'ACCOUNT_B_CANARY';
const other = (id: string) => id === A ? B : A;
const sid = (id: string) => id.replace(/^./, 'a');
const token = (id: string) => `e30.${Buffer.from(JSON.stringify({ sub: id, session_id: sid(id) })).toString('base64url')}.synthetic`;
function cookie(id: string) {
  return `__Host-cashflow-session=${seal({ access_token: token(id), refresh_token: `synthetic-${id}`, expires_at: Math.floor(Date.now() / 1000) + 3600, issued_at: Date.now() })}`;
}
function account(id: string): UserRow {
  const amount = id === A ? 1 : 10;
  const job = { id: 'shared-job-id', name: `${tag(id)} JOB`, client: `${tag(id)} CLIENT`, type: 'Design',
    value: 1000 * amount, received: 970 * amount, pending: 0, status: 'done', paymentStatus: 'paid', creditTerm: 0,
    payDate: '2026-01-02', whtRate: 3, whtAmount: 30 * amount, installments: [
      { id: 'previous-year', label: 'First', amount: 485 * amount, status: 'paid', dueDate: '2025-12-01', paidAt: '2025-12-31' },
      { id: 'this-year', label: 'Final', amount: 485 * amount, status: 'paid', dueDate: '2026-01-01', paidAt: '2026-01-02' },
    ] };
  return { user_id: id, jobs: [job, { ...job, id: `only-${id}`, value: 200 * amount, received: 200 * amount,
    whtRate: 0, whtAmount: 0, installments: undefined, payDate: '2026-02-01' }],
    expenses: [{ id: 'shared-expense-id', name: `${tag(id)} EXPENSE`, category: 'Equipment', date: '2026-02-02', amount: 30 * amount, note: `${tag(id)} NOTE` }],
    goals: [], statuses: [], settings: {},
    invoices: [{ id: 'shared-document-id', documentType: 'invoice', documentNo: `${tag(id)}-001`, createdDate: '2026-01-01',
      client: { name: `${tag(id)} CLIENT` }, items: [{ id: 'item', description: `${tag(id)} ITEM`, quantity: 1, price: 200 * amount }], vatRate: 0, whtRate: 0 }],
  } as unknown as UserRow;
}

type Call = { name: string; args: Record<string, unknown> };
type Event = { path: string; owner?: string; body?: any };
const realFetch = globalThis.fetch;
let events: Event[];
let modelBodies: { owner: string; body: any }[];
let modelResults: Map<string, any[]>;
let unknownUrls: string[];
let revoked: Set<string>;
let verifiedOwner: string | undefined;
let snapshotOwner: string | undefined;
let snapshotFails: boolean;
let callsFor: (owner: string) => Call[];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// Chat history tables (2026-10-24), kept in memory and filtered the way PostgREST reads its query string.
let chats: { conversations: any[]; messages: any[]; memories: any[]; memoryEvents: any[] };
let proposalRows: any[];
let touched: { owner: string; ids: string[] }[];
const memoryId = (owner: string, n = 0) => `${owner.slice(0, 8)}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let nextMessage = 1;
function matches(row: any, url: URL) {
  for (const [key, raw] of url.searchParams) {
    if (['select', 'order', 'offset', 'limit'].includes(key)) continue;
    const [op, ...rest] = raw.split('.'); const value = rest.join('.'); const cell = String(row[key]);
    if (op === 'eq' && cell !== value) return false;
    if (op === 'neq' && cell === value) return false;
    if (op === 'lte' && !(Number(row[key]) <= Number(value))) return false;
    if (op === 'in' && !value.replace(/^\(|\)$/g, '').split(',').map(item => item.replace(/^"|"$/g, '')).includes(cell)) return false;
  }
  return true;
}
function chatTable(table: string, method: string, url: URL, body: any, headers = new Headers()) {
  if (table === 'cashflow_ai_proposals') {
    if (method === 'POST') {
      proposalRows.push({ status: 'pending', created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z', ...body });
      return new Response(null, { status: 201 });
    }
    const found = proposalRows.filter(row => matches(row, url));
    if (method === 'PATCH') { for (const row of found) Object.assign(row, body); }
    return json((headers.get('accept') || '').includes('vnd.pgrst.object') ? found[0] ?? null : found);
  }
  const rows = ({ cashflow_ai_conversations: chats.conversations, cashflow_ai_messages: chats.messages, cashflow_ai_memories: chats.memories, cashflow_ai_memory_events: chats.memoryEvents } as Record<string, any[]>)[table];
  if (method === 'POST') {
    const added = [body].flat().map(row => (table === 'cashflow_ai_messages' || table === 'cashflow_ai_memory_events'
      ? { id: nextMessage, created_at: new Date(Date.parse('2026-10-24T00:00:00Z') + nextMessage++ * 1000).toISOString(), ...row }
      : table === 'cashflow_ai_memories' ? { id: memoryId(row.user_id, chats.memories.length + 1), created_at: '2026-10-25T00:00:00Z', ...row }
      : { pinned: false, archived: false, created_at: '2026-10-24T00:00:00Z', updated_at: '2026-10-24T00:00:00Z', ...row }));
    rows.push(...added);
    if (!(headers.get('prefer') || '').includes('return=representation')) return new Response(null, { status: 201 });
    return json((headers.get('accept') || '').includes('vnd.pgrst.object') ? added[0] : added, 201);
  }
  const found = rows.filter(row => matches(row, url));
  if (method === 'PATCH') { for (const row of found) Object.assign(row, body); return new Response(null, { status: 204 }); }
  if (method === 'DELETE') { for (const row of found) rows.splice(rows.indexOf(row), 1); return new Response(null, { status: 204 }); }
  const [column, direction] = (url.searchParams.get('order') ?? 'id.asc').split('.');
  found.sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (direction === 'desc' ? -1 : 1));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  return json(found.slice(offset, url.searchParams.has('limit') ? offset + Number(url.searchParams.get('limit')) : undefined));
}

beforeEach(() => {
  events = []; modelBodies = []; modelResults = new Map(); unknownUrls = []; revoked = new Set(); chats = { conversations: [], messages: [], memories: owners.map(owner => ({ id: memoryId(owner), user_id: owner, kind: 'preferred_name', value: tag(owner), updated_at: '2026-10-20T00:00:00Z' })), memoryEvents: [] }; nextMessage = 1; touched = [];
  verifiedOwner = undefined; snapshotOwner = undefined; snapshotFails = false;
  proposalRows = [];
  callsFor = () => [{ name: 'financial_summary', args: { year: 2569 } }];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.host === 'generativelanguage.googleapis.com') {
      const system = String(body.systemInstruction.parts[0].text);
      const owner = owners.find(id => system.includes(tag(id)));
      assert.ok(owner, 'the model receives this request’s scoped memory');
      assert.equal(system.includes(tag(other(owner))), false);
      modelBodies.push({ owner, body });
      const responses = body.contents.flatMap((turn: any) => turn.parts.flatMap((part: any) => part.functionResponse ? [part.functionResponse] : []));
      if (!responses.length) {
        return json({ candidates: [{ content: { role: 'model', parts: callsFor(owner).map(functionCall => ({ functionCall })) } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 } });
      }
      modelResults.set(owner, responses);
      const summary = responses.find((row: any) => row.name === 'financial_summary')?.response.result;
      const text = summary?.ok ? `ปี 2569 รับจริง ${summary.totals.received} บาท ก่อนหัก ${summary.totals.gross} หัก ณ ที่จ่าย ${summary.totals.wht}` : 'ตรวจเฉพาะบัญชีที่ลงชื่อเข้าใช้แล้ว';
      return json({ candidates: [{ content: { role: 'model', parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1 } });
    }
    if (url.host !== 'assistant-isolation.supabase.co') {
      unknownUrls.push(url.origin + url.pathname); throw new Error('External network disabled in isolation tests');
    }
    if (url.pathname === '/auth/v1/user') {
      const bearer = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '') ?? '';
      const identity = JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).sub;
      events.push({ path: url.pathname, owner: identity });
      return json({ id: verifiedOwner ?? identity, email: 'synthetic@example.test', created_at: '2026-01-01T00:00:00Z', app_metadata: {}, user_metadata: {} });
    }
    const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? body?.p_user_id;
    events.push({ path: url.pathname, owner, body });
    if (url.pathname.endsWith('/rpc/cashflow_rate_limit')) return json(true);
    if (url.pathname.endsWith('/rpc/cashflow_session_active')) return json(!revoked.has(owner));
    if (url.pathname.endsWith('/rpc/cashflow_ai_reserve')) return json({ ok: true, used_tokens: 5, used_requests: 1 });
    if (url.pathname.endsWith('/rpc/cashflow_ai_settle')) return json(null);
    // The database before 20261025150000_ai_cost_accounting.sql: the capped settle does not exist yet (real PostgREST answer).
    if (url.pathname.endsWith('/rpc/cashflow_ai_settle_capped')) return json({ code: 'PGRST202', message: 'Could not find the function public.cashflow_ai_settle_capped in the schema cache' }, 404);
    if (url.pathname.endsWith('/subscriptions')) return json({ status: 'active', plan: 'admin_grant' });
    if (url.pathname.endsWith('/cashflow_user_roles')) return json({ role: 'user' });
    if (url.pathname.endsWith('/cashflow_ai_usage')) return json([{ tokens: owner === A ? 11 : 22 }]);
    if (url.pathname.endsWith('/rpc/cashflow_ai_memories_touch')) { touched.push({ owner: body.p_user_id, ids: body.p_ids }); return json(null); }
    if (url.pathname.endsWith('/cashflow_account_snapshot')) {
      if (snapshotFails) return json({ code: 'XX000', message: `${tag(B)} private database error` }, 500);
      assert.ok(owners.includes(owner!), 'repository must include an authenticated owner filter');
      return json({ ...account(snapshotOwner ?? owner!), versions: { cashflow_jobs: {} } });
    }
    if (url.pathname.endsWith('/cashflow_vault_files')) {
      assert.ok(owners.includes(owner!), 'vault must include a personal owner filter');
      assert.equal(url.searchParams.has('group_id'), false);
      return json([{ id: 'shared-vault-id', user_id: owner, group_id: null, kind: 'other', job_id: 'shared-job-id', job_name: `${tag(owner!)} JOB`,
        client: `${tag(owner!)} CLIENT`, file_name: `${tag(owner!)}.pdf`, mime_type: 'application/pdf', size_bytes: 20,
        storage_path: 'PRIVATE_STORAGE_PATH_MUST_NOT_REACH_MODEL', created_at: '2026-01-01T00:00:00Z' }]);
    }
    // The name เลขา calls the user by (2026-10-27): the account's own profile, read with the authenticated owner only.
    if (url.pathname.endsWith('/cashflow_profiles')) {
      assert.ok(owners.includes(owner!), 'the account name must be read with an authenticated owner filter');
      return json({ display_name: tag(owner!) });
    }
    const table = /\/(cashflow_ai_conversations|cashflow_ai_messages|cashflow_ai_proposals|cashflow_ai_memories|cashflow_ai_memory_events)$/.exec(url.pathname)?.[1];
    if (table) return chatTable(table, init?.method ?? 'GET', url, body, new Headers(init?.headers));
    unknownUrls.push(url.pathname); throw new Error(`Unmocked route ${url.pathname}`);
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; assert.deepEqual(unknownUrls, [], 'no unexpected I/O'); });

async function request(options: { session?: string | null; header?: string | null; method?: string; body?: unknown; headers?: Record<string, string>; query?: Record<string, string> } = {}) {
  const body = options.body ?? { action: 'message', text: 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่' };
  const raw = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = { 'content-type': 'application/json', 'content-length': String(raw.length), origin: process.env.APP_URL!, 'x-csrf-protection': '1', ...options.headers };
  if (options.session !== null) headers.cookie = cookie(options.session ?? A);
  if (options.header !== null) headers['x-account-id'] = options.header ?? A;
  const req = Object.assign(Readable.from([raw]), { method: options.method ?? 'POST', headers, query: options.query ?? {}, url: '/api/assistant', socket: { remoteAddress: '127.0.0.1' } });
  const out = { status: 200, body: undefined as any, headers: new Map<string, unknown>() };
  const res = {
    headersSent: false,
    setHeader(name: string, value: unknown) { out.headers.set(name.toLowerCase(), value); return this; },
    getHeader(name: string) { return out.headers.get(name.toLowerCase()); },
    hasHeader(name: string) { return out.headers.has(name.toLowerCase()); },
    status(status: number) { out.status = status; return this; },
    json(value: unknown) { out.body = value; this.headersSent = true; return this; },
  };
  await routeHandler('assistant')(req as any, res as any);
  assert.equal(out.headers.get('cache-control'), 'no-store');
  return out;
}
const result = (owner: string, name: string, occurrence = 0) => modelResults.get(owner)!.filter(row => row.name === name)[occurrence].response.result;

// A real prepared document, represented as the database row the HTTP handler reads. No model or document write.
async function editableDocument(owner = A) {
  const execute = createToolbox({ user: account(owner), memory: { remember: async () => undefined }, proposals: {
    save: async proposal => { proposalRows.push({ id: proposal.id, user_id: proposal.userId, kind: proposal.kind, job_id: proposal.jobId,
      record: proposal.record, base_version: null, title: proposal.title, changes: proposal.changes, tool: proposal.tool, args: proposal.args,
      status: 'pending', created_at: new Date().toISOString(), expires_at: '2099-01-01T00:00:00Z' }); },
  } });
  const outcome = await execute({ id: 'prepare-document', name: 'propose_add_document', args: {
    document_type: 'quotation', issuer: { name: 'ธุรกิจผู้ออกตัวอย่าง' }, client: { name: 'บริษัทลูกค้าตัวอย่าง' },
    items: Array.from({ length: 5 }, (_, index) => ({ description: `รายการเดิม ${index + 1}`, quantity: 1, price: 100 })),
  } });
  assert.equal(outcome.card?.kind, 'confirm');
  return outcome.card as Extract<NonNullable<typeof outcome.card>, { kind: 'confirm' }>;
}
const partyEdits = {
  issuer_name: 'ชื่อผู้ออกฉบับแก้ไข', issuer_address: 'ที่อยู่ผู้ออก', issuer_phone: '020000001', issuer_email: 'issuer@example.test', issuer_tax_id: '0100000000001',
  client_name: 'ชื่อลูกค้าฉบับแก้ไข', client_address: 'ที่อยู่ลูกค้า', client_phone: '020000002', client_email: 'client@example.test', client_tax_id: '0100000000002',
};

test('HTTP revise accepts all ten party fields and indexed item edits, returning replacement proposals without model calls', async () => {
  const card = await editableDocument();
  const revised = await request({ body: { action: 'revise', proposalId: card.id, edits: partyEdits } });
  assert.equal(revised.status, 200, JSON.stringify(revised.body));
  assert.equal(revised.body.card.kind, 'confirm');
  assert.notEqual(revised.body.card.id, card.id);
  assert.equal(proposalRows.find(row => row.id === card.id).status, 'cancelled');
  const next = proposalRows.find(row => row.id === revised.body.card.id);
  assert.equal(next.user_id, A);
  assert.equal(next.record.issuer.name, partyEdits.issuer_name);
  assert.equal(next.record.issuer.taxId, partyEdits.issuer_tax_id);
  assert.equal(next.record.client.email, partyEdits.client_email);
  assert.equal(next.record.client.address, partyEdits.client_address);

  const item = await request({ body: { action: 'revise', proposalId: next.id, edits: { item_1_price: '250' } } });
  assert.equal(item.status, 200, JSON.stringify(item.body));
  const last = proposalRows.find(row => row.id === item.body.card.id);
  assert.equal(last.record.items[0].price, 250);
  assert.equal(last.record.issuer.name, partyEdits.issuer_name);
  assert.equal(last.record.client.taxId, partyEdits.client_tax_id);
  assert.equal(modelBodies.length, 0);
  assert.equal(events.some(event => /cashflow_apply_changes|cashflow_ai_reserve|cashflow_patch_private/.test(event.path)), false);
});

test('HTTP revise accepts the full 28-field document and rejects 29 fields before proposal access', async () => {
  const card = await editableDocument();
  const edits = { ...partyEdits, ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    [`item_${index + 1}_description`, `รายการใหม่ ${index + 1}`], [`item_${index + 1}_quantity`, '2'], [`item_${index + 1}_price`, '250'],
  ]).flat()), vat_rate: '7', wht_rate: '3', created_date: '2026-10-26' };
  assert.equal(Object.keys(edits).length, 28);
  const reply = await request({ body: { action: 'revise', proposalId: card.id, edits } });
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  const record = proposalRows.find(row => row.id === reply.body.card.id).record;
  assert.equal(record.items[4].price, 250);
  assert.equal(record.items[4].quantity, 2);
  assert.equal(record.vatRate, 7);
  assert.equal(record.whtRate, 3);
  assert.equal(record.createdDate, '2026-10-26');
  events = [];
  const oversized = await request({ body: { action: 'revise', proposalId: reply.body.card.id, edits: { ...edits, note: 'extra field' } } });
  assert.equal(oversized.status, 400);
  assert.equal(events.some(event => event.path.endsWith('/cashflow_ai_proposals')), false);
});

test('HTTP revise still rejects forbidden fields downstream and cannot read another owner\'s proposal', async () => {
  const card = await editableDocument();
  for (const edits of [{ issuer_owner: B }, { issuer_signatureUrl: 'signature' }, { item_6_price: '100' }]) {
    const reply = await request({ body: { action: 'revise', proposalId: card.id, edits } });
    assert.equal(reply.status, 400);
    // Signature key is rejected by the syntax check; syntactically valid keys still reach the strict tool allowlist.
    if (!('issuer_signatureUrl' in edits)) assert.equal(reply.body.code, 'ai_revise_field');
  }
  const foreign = await request({ session: B, header: B, body: { action: 'revise', proposalId: card.id, edits: { client_name: 'foreign edit' } } });
  assert.equal(foreign.status, 409);
  assert.equal(foreign.body.code, 'ai_revise_unavailable');
  assert.equal(proposalRows.length, 1);
  assert.equal(proposalRows[0].status, 'pending');
  assert.equal(modelBodies.length, 0);
});

test('HTTP revise keeps its empty-edit, key-length, value-length and nested-value limits', async () => {
  const card = await editableDocument();
  for (const edits of [{}, { ['x'.repeat(31)]: 'x' }, { 'issuer.name': 'x' }, { issuer_name: 'x'.repeat(201) }, { issuer_name: { name: 'nested' } }]) {
    const reply = await request({ body: { action: 'revise', proposalId: card.id, edits } });
    assert.equal(reply.status, 400);
  }
  assert.equal(events.some(event => event.path.endsWith('/cashflow_ai_proposals')), false);
  assert.equal(proposalRows.length, 1);
});

test('HTTP boundary rejects forged/missing account headers, extra owner/model arguments, group scope and foreign origins before account/model reads', async () => {
  const invalid: { options: Parameters<typeof request>[0]; status: number }[] = [
    { options: { session: null }, status: 401 },
    { options: { header: null }, status: 401 },
    { options: { header: B }, status: 401 },
    { options: { body: { action: 'message', text: 'รายได้', user_id: B } }, status: 400 },
    { options: { body: { action: 'message', text: 'รายได้', account_id: B } }, status: 400 },
    { options: { body: { action: 'message', text: 'รายได้', model: 'untrusted-model' } }, status: 400 },
    { options: { headers: { 'x-finance-group': B } }, status: 400 },
    { options: { headers: { origin: 'https://foreign.example.test' } }, status: 403 },
  ];
  for (const { options, status } of invalid) assert.equal((await request(options)).status, status, JSON.stringify(options));
  assert.equal(modelBodies.length, 0);
  assert.equal(events.some(row => /cashflow_account_snapshot|cashflow_vault_files|cashflow_ai_reserve/.test(row.path)), false);
});

test('revoked sessions and Auth identities that disagree with the sealed session fail closed', async () => {
  revoked.add(A);
  assert.equal((await request()).status, 401);
  revoked.clear(); verifiedOwner = B;
  assert.equal((await request()).status, 401);
  assert.equal(modelBodies.length, 0);
  assert.equal(events.some(row => /cashflow_account_snapshot|cashflow_ai_reserve/.test(row.path)), false);
});

test('concurrent HTTP requests isolate open account data and memories while hidden vault tools cannot load any data', async () => {
  callsFor = () => [
    { name: 'financial_summary', args: { year: 2569 } },
    { name: 'search_receipts', args: { year: 2026, limit: 1 } },
    { name: 'search_receipts', args: { year: 2026, limit: 1, offset: 1 } },
    { name: 'search_documents', args: {} },
    { name: 'account_data', args: { domain: 'documents', id: 'shared-document-id' } },
    { name: 'get_expense', args: { id: 'shared-expense-id' } },
    { name: 'search_vault', args: {} },
    { name: 'search_vault', args: { job_id: 'shared-job-id' } },
  ];
  const replies = await Promise.all(owners.map(owner => request({ session: owner, header: owner })));
  for (const [index, owner] of owners.entries()) {
    assert.equal(replies[index].status, 200);
    const multiplier = owner === A ? 1 : 10;
    const annual = result(owner, 'financial_summary');
    assert.deepEqual([annual.period.year_ce, annual.period.year_be, annual.monthly.rows.length], [2026, 2569, 12]);
    assert.deepEqual([annual.totals.gross, annual.totals.wht, annual.totals.received, annual.totals.actual_expenses], [700, 15, 685, 30].map(value => value * multiplier));
    assert.match(replies[index].body.text, new RegExp(`รับจริง ${685 * multiplier} บาท`));
    const first = result(owner, 'search_receipts'); const second = result(owner, 'search_receipts', 1);
    assert.equal(first.total, 2); assert.equal(first.rows.length, 1); assert.equal(first.next_offset, 1);
    assert.equal(second.rows.length, 1); assert.equal(second.next_offset, null);
    assert.deepEqual(first.totals, second.totals);
    assert.notEqual(first.rows[0].job_id, second.rows[0].job_id);
    for (const name of ['search_documents', 'account_data', 'get_expense']) {
      const detail = JSON.stringify(result(owner, name));
      assert.ok(detail.includes(tag(owner)), `${name} must return this owner’s matching detail`);
      assert.equal(detail.includes(tag(other(owner))), false, name);
    }
    for (const occurrence of [0, 1]) {
      const denied = result(owner, 'search_vault', occurrence);
      assert.equal(denied.ok, false, 'a model-emitted hidden tool must be denied even with an own job ID');
      assert.equal(typeof denied.error, 'string');
      assert.equal(Object.hasOwn(denied, 'rows'), false);
      const detail = JSON.stringify(denied);
      for (const accountId of owners) assert.equal(detail.includes(tag(accountId)), false, 'no account vault metadata enters a denial');
    }
    const payload = JSON.stringify(modelResults.get(owner));
    assert.ok(payload.includes(tag(owner)));
    assert.equal(payload.includes(tag(other(owner))), false);
    assert.equal(payload.includes('PRIVATE_STORAGE_PATH_MUST_NOT_REACH_MODEL'), false);
    assert.equal(events.filter(row => row.path.endsWith('/cashflow_vault_files')).length, 0, 'hidden vault tools must not invoke the repository for either owner');
    for (const path of ['cashflow_account_snapshot', 'cashflow_ai_memories', 'rpc/cashflow_ai_reserve', 'rpc/cashflow_ai_settle']) {
      assert.equal(events.filter(row => row.path.endsWith(`/${path}`) && row.owner === owner).length, 1, path);
    }
  }
  assert.equal(modelBodies.length, 4, 'two fake tool rounds for each request');
  for (const { body } of modelBodies) {
    const declarations = body.tools.flatMap((group: any) => group.functionDeclarations);
    assert.equal(declarations.some((tool: any) => tool.name === 'search_vault'), false, 'the hidden tool is not advertised to either model request');
  }
  // A subsequent request loads A's open data afresh instead of reusing B or an earlier request's snapshot.
  assert.equal((await request()).status, 200);
  assert.equal(events.filter(row => row.path.endsWith('/cashflow_vault_files')).length, 0);
  for (const path of ['cashflow_account_snapshot', 'cashflow_ai_memories', 'rpc/cashflow_ai_reserve', 'rpc/cashflow_ai_settle']) {
    assert.equal(events.filter(row => row.path.endsWith(`/${path}`) && row.owner === A).length, 2, path);
    assert.equal(events.filter(row => row.path.endsWith(`/${path}`) && row.owner === B).length, 1, path);
  }
  assert.equal(result(A, 'financial_summary').totals.received, 685);
  assert.equal(JSON.stringify(modelResults.get(A)).includes(tag(B)), false);
});

test('model owner overrides, foreign record IDs and tools outside the runtime allowlist cannot read another account', async () => {
  callsFor = () => [
    { name: 'financial_summary', args: { year: 2569, user_id: B } },
    { name: 'search_receipts', args: { year: 2569, account_id: B } },
    { name: 'account_data', args: { domain: 'documents', user_id: B } },
    { name: 'search_documents', args: { user_id: B } },
    { name: 'search_vault', args: { user_id: B } },
    { name: 'get_job', args: { job_id: `only-${B}` } },
    { name: 'get_expense', args: { id: 'only-foreign-expense' } },
    { name: 'account_data', args: { domain: 'documents', id: 'only-foreign-document' } },
    { name: 'execute_sql', args: { sql: 'SELECT * FROM cashflow_account_snapshot' } },
    { name: 'propose_delete_job', args: { job_id: 'shared-job-id' } },
  ];
  assert.equal((await request()).status, 200);
  for (const response of modelResults.get(A)!) assert.equal(response.response.result.ok, false, response.name);
  assert.equal(events.some(row => row.owner === B), false);
  assert.equal(events.some(row => row.path.endsWith('/cashflow_vault_files')), false, 'invalid model owner never invokes vault loader');
  assert.equal(JSON.stringify(modelResults.get(A)).includes(tag(B)), false);
});

test('repository ownership mismatch is rejected before model execution and releases only the authenticated reservation', async () => {
  snapshotOwner = B;
  const reply = await request();
  assert.equal(reply.status, 403); assert.equal(reply.body.code, 'ai_account_mismatch');
  assert.equal(modelBodies.length, 0);
  const settled = events.filter(row => row.path.endsWith('/rpc/cashflow_ai_settle'));
  assert.equal(settled.length, 1); assert.equal(settled[0].owner, A); assert.equal(settled[0].body.p_release, true);
  assert.equal(JSON.stringify(reply.body).includes(tag(B)), false);
});

test('status and notification reads bind to the current session, with no shared account cache or model call', async () => {
  for (const owner of [A, B, A]) {
    const status = await request({ method: 'GET', session: owner, header: owner });
    assert.equal(status.status, 200); assert.equal(status.body.tokensLeft, owner === A ? 989 : 978);
    const notices = await request({ method: 'GET', session: owner, header: owner, query: { view: 'line' } });
    assert.equal(notices.status, 200);
    assert.equal(JSON.stringify(notices.body).includes(tag(other(owner))), false);
  }
  assert.equal(modelBodies.length, 0);
  assert.deepEqual(events.filter(row => row.path.endsWith('/cashflow_account_snapshot')).map(row => row.owner), [A, B, A]);
  assert.deepEqual(events.filter(row => row.path.endsWith('/cashflow_ai_usage')).map(row => row.owner), [A, B, A]);
});

test('database failure does not fall back to another snapshot or expose a private error to the client', async () => {
  snapshotFails = true;
  const reply = await request();
  assert.equal(reply.status, 500); assert.equal(modelBodies.length, 0);
  assert.equal(JSON.stringify(reply.body).includes(tag(B)), false);
  assert.equal(events.some(row => row.owner === B), false);
  assert.equal(events.find(row => row.path.endsWith('/rpc/cashflow_ai_settle'))?.body.p_release, true);
});

test('the notifications thread keeps what was tapped and typed, per account, under an id no browser can choose', async () => {
  const quick = await request({ body: { action: 'line-quick', kind: 'month', text: 'สรุปเดือนนี้' } });
  assert.equal(quick.status, 200); assert.equal(quick.body.card.category, 'report');
  const typed = await request({ body: { action: 'message', text: 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่', thread: 'line' } });
  assert.equal(typed.status, 200);
  const partial = await request({ body: { action: 'line-partial', text: 'รับเงินบางส่วน #ABCDEF ยอด 500' } });
  assert.equal(partial.status, 200);
  const thread = await inboxConversationId(A);
  assert.deepEqual(chats.conversations.map(row => [row.id, row.user_id, row.title]), [[thread, A, 'แจ้งเตือนอัตโนมัติ']]);
  assert.ok(chats.messages.every(row => row.user_id === A && row.conversation_id === thread));
  // The card kept is the server's, made from A's own data.
  assert.deepEqual(chats.messages[1].cards.map((card: any) => [card.kind, card.card.title]), [['line', quick.body.card.title]]);
  const mine = await request({ method: 'GET', query: { view: 'line' } });
  assert.deepEqual(mine.body.history.map((row: any) => [row.role, row.text]), [
    ['user', 'สรุปเดือนนี้'], ['assistant', ''], ['user', 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่'], ['assistant', typed.body.text],
    ['user', 'รับเงินบางส่วน #ABCDEF ยอด 500'], ['assistant', partial.body.text]]);
  const theirs = await request({ method: 'GET', session: B, header: B, query: { view: 'line' } });
  assert.deepEqual(theirs.body.history, []);
  assert.equal(JSON.stringify(theirs.body).includes(tag(A)), false);
  // The thread is not one of the chats in the list, and B's thread id cannot be taken from A's browser.
  const list = await request({ method: 'GET', query: { view: 'conversations' } });
  assert.deepEqual(list.body.conversations, []);
  const forged = await request({ body: { action: 'message', text: 'รายได้', conversationId: await inboxConversationId(B) } });
  assert.equal(forged.status, 400);
  assert.equal(chats.conversations.some(row => row.user_id === B), false);
});

test('a chat keeps its latest 400 messages; older ones go, and only from that account\'s chat', async () => {
  const chat = 'c_44444444-4444-4444-8444-444444444444';
  const theirs = 'c_55555555-5555-4555-8555-555555555555';
  chats.conversations.push({ id: chat, user_id: A, title: 'ยาว', pinned: false, archived: false, updated_at: '2026-10-01T00:00:00Z' },
    { id: theirs, user_id: B, title: 'ของ B', pinned: false, archived: false, updated_at: '2026-10-01T00:00:00Z' });
  for (let index = 0; index < 400; index++) chats.messages.push({ id: nextMessage++, conversation_id: chat, user_id: A, role: index % 2 ? 'assistant' : 'user', text: `เก่า ${index}`, created_at: '2026-10-01T00:00:00Z' });
  for (let index = 0; index < 420; index++) chats.messages.push({ id: nextMessage++, conversation_id: theirs, user_id: B, role: 'user', text: `B ${index}`, created_at: '2026-10-01T00:00:00Z' });
  const reply = await request({ body: { action: 'message', text: 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่', conversationId: chat } });
  assert.equal(reply.status, 200);
  const kept = chats.messages.filter(row => row.conversation_id === chat);
  assert.equal(kept.length, 400);
  assert.deepEqual([kept[0].text, kept.at(-2).text], ['เก่า 2', 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่']);
  assert.equal(chats.messages.filter(row => row.conversation_id === theirs).length, 420);
});

test('what a file showed is kept with the answer as a hidden note, and comes back when the chat is opened', async () => {
  callsFor = owner => [{ name: 'note_from_file', args: { facts: `ลูกค้า: ${tag(owner)} FOUNDATION` } }];
  const chat = 'c_66666666-6666-4666-8666-666666666666';
  const reply = await request({ body: { action: 'message', text: 'อันนี้นามลูกค้านะ', conversationId: chat,
    attachment: { name: 'client.png', mimeType: 'image/png', data: 'iVBORw0KGgo=' } } });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.memo, `ลูกค้า: ${tag(A)} FOUNDATION`);
  const stored = chats.messages.filter(row => row.conversation_id === chat);
  assert.deepEqual(stored.map(row => row.role), ['user', 'assistant']);
  assert.deepEqual(stored[0].attachment, { name: 'client.png', kind: 'image' });
  assert.equal(stored[0].text, 'อันนี้นามลูกค้านะ');
  assert.deepEqual(stored[1].cards.at(-1), { kind: 'memo', text: `ลูกค้า: ${tag(A)} FOUNDATION` });
  const opened = await request({ method: 'GET', query: { view: 'conversation', id: chat } });
  assert.deepEqual(opened.body.messages[1].cards.at(-1), { kind: 'memo', text: `ลูกค้า: ${tag(A)} FOUNDATION` });
  // Without a file in the message the note is refused and nothing hidden is kept.
  const plain = 'c_77777777-7777-4777-8777-777777777777';
  const typed = await request({ body: { action: 'message', text: 'รายได้ทั้งปี 2569 รับจริงเท่าไหร่', conversationId: plain } });
  assert.equal(typed.body.memo, undefined);
  assert.equal(chats.messages.filter(row => row.conversation_id === plain).some(row => (row.cards || []).some((card: any) => card.kind === 'memo')), false);
});

test('memory: what A asks to remember is A\'s alone, B never sees it, and only the memories each used are touched', async () => {
  callsFor = owner => owner === A ? [{ name: 'remember', args: { kind: 'emoji', value: 'ไม่ใช้อีโมจิ' } }] : [{ name: 'recall_memories', args: {} }];
  // (A plain "ต่อไปไม่ต้องใช้อีโมจินะ" is saved without the model since routing V2; this wording goes through the model's tool.)
  const saved = await request({ body: { action: 'message', text: 'ต่อไปช่วยตอบแบบไม่ใช้อีโมจินะ' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(result(A, 'remember'), { ok: true, remembered: 'อีโมจิ: ไม่ใช้อีโมจิ', replaced_earlier: false });
  assert.deepEqual(chats.memories.filter(row => row.kind === 'emoji').map(row => [row.user_id, row.value, row.source]), [[A, 'ไม่ใช้อีโมจิ', 'explicit']]);
  assert.deepEqual(chats.memoryEvents.map(row => [row.user_id, row.action, row.kind, row.new_value, row.channel]), [[A, 'created', 'emoji', 'ไม่ใช้อีโมจิ', 'app']]);
  const listed = await request({ session: B, header: B, body: { action: 'message', text: 'จำอะไรเกี่ยวกับฉันบ้าง' } });
  assert.equal(listed.status, 200);
  const theirs = result(B, 'recall_memories');
  assert.deepEqual(theirs.memories.map((item: any) => item.text), [tag(B)]);
  assert.equal(JSON.stringify(theirs).includes('ไม่ใช้อีโมจิ'), false);
  // Each answer touched only its own account's memories.
  assert.ok(touched.length >= 2);
  for (const call of touched) assert.ok(call.ids.every(id => chats.memories.find(row => row.id === id)?.user_id === call.owner), JSON.stringify(call));
  // A forgets: only A's row and A's history text go.
  callsFor = () => [{ name: 'recall_memories', args: {} }];
  await request({ body: { action: 'message', text: 'จำอะไรไว้บ้าง' } });
  const ref = result(A, 'recall_memories').memories.find((item: any) => item.text === 'ไม่ใช้อีโมจิ').ref;
  callsFor = () => [{ name: 'forget_memory', args: { refs: [ref] } }];
  const forgot = await request({ body: { action: 'message', text: 'ลืมเรื่องอีโมจิไปเลย' } });
  assert.equal(forgot.status, 200);
  assert.deepEqual([result(A, 'forget_memory').ok, result(A, 'forget_memory').forgotten], [true, 1]);
  assert.equal(chats.memories.some(row => row.kind === 'emoji'), false);
  assert.deepEqual(chats.memories.map(row => row.user_id).sort(), [A, B].sort(), 'the name settings stay');
  assert.deepEqual(chats.memoryEvents.filter(row => row.kind === 'emoji').map(row => [row.action, row.new_value]), [['created', null], ['deleted', null]], 'the history keeps no text after forgetting');
});

test('package E: the other channel\'s turns and waiting cards are read only for the signed-in account, never from the notifications thread', async () => {
  const { supabaseAssistantDb } = await import('../backend/src/ai/supabaseDb');
  const since = new Date(Date.now() - 2 * 3600_000).toISOString();
  const stamp = new Date().toISOString();
  const chat = 'c_aaaaaaaa-0000-4000-8000-000000000001';
  chats.messages.push(
    { id: 901, user_id: A, conversation_id: chat, role: 'user', text: `${tag(A)} ทำใบเสนอราคา`, cards: [], attachment: null, created_at: stamp },
    { id: 902, user_id: A, conversation_id: chat, role: 'assistant', text: 'ขอข้อมูลเพิ่มครับ', cards: [{ kind: 'questions', id: 'ask_1', questions: [{ id: 'q', text: 'ราคาเท่าไหร่', options: [], allowText: true }] }], attachment: null, created_at: stamp },
    { id: 903, user_id: A, conversation_id: await inboxConversationId(A), role: 'assistant', text: `${tag(A)} แจ้งเตือน`, cards: [], attachment: null, created_at: stamp },
  );
  assert.deepEqual(await supabaseAssistantDb.recentAppTurns!(B, since), { turns: [], lastAt: null }, 'B never reads A\'s chat');
  const own = await supabaseAssistantDb.recentAppTurns!(A, since);
  assert.deepEqual(own.turns.map(turn => [turn.role, turn.text]), [['user', `${tag(A)} ทำใบเสนอราคา`], ['assistant', 'ขอข้อมูลเพิ่มครับ']], 'oldest first, without the notifications thread');
  assert.equal(own.lastAt, Date.parse(stamp));
  assert.deepEqual(await supabaseAssistantDb.pendingProposals!(B, since), []);
  const reads = events.filter(event => /cashflow_ai_(messages|proposals)$/.test(event.path));
  assert.deepEqual(reads.map(event => event.owner), [B, A, B], 'every read carries the signed-in account filter');
});

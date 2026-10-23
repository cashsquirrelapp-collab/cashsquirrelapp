import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiffSubmitHandler } from '../backend/src/handlers/liff-submit';
import {
  checkLinkedAccountWriteAccess,
  type LinkedAccountAccessDependencies,
} from '../backend/src/services/linkedAccountAccess';

const userId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
type Kind = 'job' | 'expense';
type ResponseState = { status: number; body: any; headers: Record<string, unknown> };

function request(kind: Kind) {
  return {
    method: 'POST',
    body: kind === 'job'
      ? { idToken: 'verified-token', requestId, kind, name: 'Campaign', value: 10_000, creditTerm: 0, whtRate: 0, paymentStatus: 'paid' }
      : { idToken: 'verified-token', requestId, kind, name: 'Software', category: 'ค่าอุปกรณ์/ซอฟต์แวร์', amount: 500 },
  } as any;
}

function response(): { res: any; state: ResponseState } {
  const state: ResponseState = { status: 200, body: null, headers: {} };
  const res = {
    setHeader(name: string, value: unknown) { state.headers[name] = value; },
    status(status: number) { state.status = status; return res; },
    json(body: unknown) { state.body = body; return res; },
  };
  return { res, state };
}

function lifecycle(overrides: {
  metadata?: Record<string, unknown>;
  closure?: { closure_kind: 'pause' | 'deletion'; state: string } | null;
  authError?: unknown;
  durableError?: unknown;
  missingUser?: boolean;
} = {}): LinkedAccountAccessDependencies {
  return {
    async readAuthAccount() {
      return {
        user: overrides.missingUser ? null : { app_metadata: overrides.metadata || {} },
        error: overrides.authError || null,
      };
    },
    async readDurableClosure() {
      return { closure: overrides.closure || null, error: overrides.durableError || null };
    },
  };
}

async function submit(kind: Kind, lifecycleDependencies: LinkedAccountAccessDependencies) {
  const calls = { rateLimit: 0, pro: 0, jobs: 0, expenses: 0, sends: 0 };
  const handler = createLiffSubmitHandler({
    verifyLiffIdToken: async () => 'U-line-user',
    findUserByLineId: async () => ({ user_id: userId, jobs: [], goals: [], settings: {}, expenses: [], statuses: [] }),
    checkLinkedAccountWriteAccess: id => checkLinkedAccountWriteAccess(id, lifecycleDependencies),
    rateLimit: async () => { calls.rateLimit += 1; },
    isProUser: async () => { calls.pro += 1; return true; },
    persistJob: async () => { calls.jobs += 1; return true; },
    persistExpense: async () => { calls.expenses += 1; return true; },
    computeMonthNetForUser: () => 0,
    sendLineMessagePayload: async () => { calls.sends += 1; return true; },
  });
  const { res, state } = response();
  await handler(request(kind), res);
  return { state, calls };
}

const blockedScenarios: Array<{ name: string; kind: Kind; dependencies: LinkedAccountAccessDependencies; message: RegExp }> = [
  {
    name: 'job request for Auth-paused account',
    kind: 'job',
    dependencies: lifecycle({ metadata: { account_paused: true, account_closure_kind: 'pause' } }),
    message: /พักใช้งาน/,
  },
  {
    name: 'expense request with durable pause',
    kind: 'expense',
    dependencies: lifecycle({ closure: { closure_kind: 'pause', state: 'paused' } }),
    message: /พักใช้งาน/,
  },
  {
    name: 'job request with durable pending deletion',
    kind: 'job',
    dependencies: lifecycle({ closure: { closure_kind: 'deletion', state: 'paused' } }),
    message: /รอลบ/,
  },
  {
    name: 'expense request with durable pause despite Auth metadata drift',
    kind: 'expense',
    dependencies: lifecycle({ closure: { closure_kind: 'pause', state: 'paused' } }),
    message: /พักใช้งาน/,
  },
  {
    name: 'job request already claimed by the deletion worker',
    kind: 'job',
    dependencies: lifecycle({ closure: { closure_kind: 'deletion', state: 'deleting' } }),
    message: /รอลบ/,
  },
  {
    name: 'expense request for Auth pending-deletion account',
    kind: 'expense',
    dependencies: lifecycle({ metadata: { account_paused: true, account_closure_kind: 'deletion' } }),
    message: /รอลบ/,
  },
];

for (const scenario of blockedScenarios) {
  test(`LIFF rejects ${scenario.name} before any downstream work`, async () => {
    const { state, calls } = await submit(scenario.kind, scenario.dependencies);
    assert.equal(state.status, 403);
    assert.match(state.body.error, scenario.message);
    assert.deepEqual(calls, { rateLimit: 0, pro: 0, jobs: 0, expenses: 0, sends: 0 });
  });
}

const unavailableScenarios: Array<{ name: string; kind: Kind; dependencies: LinkedAccountAccessDependencies }> = [
  { name: 'Auth lookup error', kind: 'job', dependencies: lifecycle({ authError: new Error('auth unavailable') }) },
  { name: 'missing Auth user', kind: 'expense', dependencies: lifecycle({ missingUser: true }) },
  { name: 'durable closure lookup error', kind: 'job', dependencies: lifecycle({ durableError: new Error('database unavailable') }) },
];

for (const scenario of unavailableScenarios) {
  test(`LIFF fails closed on ${scenario.name}`, async () => {
    const previousError = console.error;
    console.error = () => {};
    try {
      const { state, calls } = await submit(scenario.kind, scenario.dependencies);
      assert.equal(state.status, 503);
      assert.match(state.body.error, /ไม่สามารถตรวจสอบสถานะบัญชี/);
      assert.deepEqual(calls, { rateLimit: 0, pro: 0, jobs: 0, expenses: 0, sends: 0 });
    } finally {
      console.error = previousError;
    }
  });
}

for (const kind of ['job', 'expense'] as const) {
  test(`LIFF still persists and confirms an active ${kind} request`, async () => {
    const { state, calls } = await submit(kind, lifecycle());
    assert.equal(state.status, 200);
    assert.deepEqual(state.body, { ok: true });
    assert.equal(calls.rateLimit, 1);
    assert.equal(calls.pro, 1);
    assert.equal(calls.jobs, kind === 'job' ? 1 : 0);
    assert.equal(calls.expenses, kind === 'expense' ? 1 : 0);
    assert.equal(calls.sends, 1);
  });
}

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAssistantMessage,
  type LineAssistantDependencies,
  type UserRow,
} from '../backend/src/services/lineAssistant';
import {
  checkLinkedAccountWriteAccess,
  type LinkedAccountAccessDependencies,
} from '../backend/src/services/linkedAccountAccess';

const userId = '11111111-1111-4111-8111-111111111111';
const linkedUser: UserRow = {
  user_id: userId,
  jobs: [],
  goals: [],
  settings: {},
  expenses: [],
  statuses: [],
};

const previousAppUrl = process.env.APP_URL;
process.env.APP_URL = 'https://preview.example.test';
after(() => {
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

function lifecycle(
  events: string[],
  overrides: {
    metadata?: Record<string, unknown>;
    closure?: { closure_kind: 'pause' | 'deletion'; state: string } | null;
    authError?: unknown;
    durableError?: unknown;
  } = {},
): LinkedAccountAccessDependencies {
  return {
    async readAuthAccount() {
      events.push('auth');
      return { user: { app_metadata: overrides.metadata || {} }, error: overrides.authError || null };
    },
    async readDurableClosure() {
      events.push('durable');
      return { closure: overrides.closure || null, error: overrides.durableError || null };
    },
  };
}

function assistantDependencies(
  events: string[],
  lifecycleDependencies: LinkedAccountAccessDependencies,
  pro = true,
): LineAssistantDependencies {
  return {
    async findUserByLineId() {
      events.push('find');
      return { ...linkedUser };
    },
    async checkLinkedAccountWriteAccess(id) {
      events.push('access');
      return checkLinkedAccountWriteAccess(id, lifecycleDependencies);
    },
    async isProUser() {
      events.push('pro');
      return pro;
    },
  };
}

function firstText(messages: Awaited<ReturnType<typeof handleAssistantMessage>>): string {
  assert.ok(messages);
  assert.equal(messages[0]?.type, 'text');
  return (messages[0] as { type: 'text'; text: string }).text;
}

for (const scenario of [
  {
    name: 'durably paused account',
    closure: { closure_kind: 'pause' as const, state: 'paused' },
    message: /พักใช้งาน/,
  },
  {
    name: 'account claimed by the deletion worker',
    closure: { closure_kind: 'deletion' as const, state: 'deleting' },
    message: /รอลบ/,
  },
]) {
  test(`direct LINE chat blocks a ${scenario.name} before checking Pro`, async () => {
    const events: string[] = [];
    const dependencies = assistantDependencies(events, lifecycle(events, { closure: scenario.closure }));

    const messages = await handleAssistantMessage('U-line-user', 'สรุปเดือนนี้', undefined, dependencies);

    assert.match(firstText(messages), scenario.message);
    assert.deepEqual(events, ['find', 'access', 'auth', 'durable']);
  });
}

test('direct LINE chat fails closed on a durable lifecycle lookup error before checking Pro', async () => {
  const events: string[] = [];
  const dependencies = assistantDependencies(events, lifecycle(events, { durableError: new Error('database unavailable') }));
  const previousError = console.error;
  console.error = () => {};
  try {
    const messages = await handleAssistantMessage('U-line-user', 'งานค้างจ่าย', undefined, dependencies);

    assert.match(firstText(messages), /ไม่สามารถตรวจสอบสถานะบัญชี/);
    assert.deepEqual(events, ['find', 'access', 'auth', 'durable']);
  } finally {
    console.error = previousError;
  }
});

test('direct LINE chat fails closed when the lifecycle checker unexpectedly rejects', async () => {
  const events: string[] = [];
  const dependencies: LineAssistantDependencies = {
    async findUserByLineId() {
      events.push('find');
      return { ...linkedUser };
    },
    async checkLinkedAccountWriteAccess() {
      events.push('access');
      throw new Error('unexpected lifecycle failure');
    },
    async isProUser() {
      events.push('pro');
      return true;
    },
  };
  const previousError = console.error;
  console.error = () => {};
  try {
    const messages = await handleAssistantMessage('U-line-user', 'งานค้างจ่าย', undefined, dependencies);

    assert.match(firstText(messages), /ไม่สามารถตรวจสอบสถานะบัญชี/);
    assert.deepEqual(events, ['find', 'access']);
  } finally {
    console.error = previousError;
  }
});

test('expired direct LINE chat links to the authenticated Plans route after lifecycle access passes', async () => {
  const events: string[] = [];
  const dependencies = assistantDependencies(events, lifecycle(events), false);

  const messages = await handleAssistantMessage('U-line-user', 'ต่ออายุ', undefined, dependencies);

  assert.match(firstText(messages), /https:\/\/preview\.example\.test\/plans(?:\s|$)/);
  assert.deepEqual(events, ['find', 'access', 'auth', 'durable', 'pro']);
});

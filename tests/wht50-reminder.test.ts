import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from '@supabase/supabase-js';
import {
  createWht50ReminderHandler, sendWht50ReminderPayload, WHT50_ACCOUNT_RESERVE,
  type Wht50ReminderAccount, type Wht50ReminderDependencies,
} from '../backend/src/handlers/send-wht50-reminder.js';
import { wht50ReminderOn } from '../shared/notifDefaults.js';
import type { VaultFile } from '../shared/vault.js';

// Owner, 2026-11-03: the monthly 50 ทวิ reminder is on for Pro accounts with LINE linked unless they turned it off
// ("ถ้า user ไม่ต้องการให้เตือน ... เราแค่ไม่ต้องเตือนแค่นั้น"). It runs in its own invocation and keeps to a request budget.
const NOW = new Date('2026-12-01T01:05:00Z'); // 08:05 Bangkok, 1 Dec
const paidJob = (id: string, rate = 3) => ({
  id, name: `งาน ${id}`, client: 'ลูกค้าตัวอย่าง', value: 10000, whtRate: rate, whtAmount: 100 * rate, received: 10000 - 100 * rate,
  pending: 0, status: 'done', paymentStatus: 'paid', payDate: '2026-10-12', depositDate: '2026-10-12',
});
const account = (userId: string, settings: Wht50ReminderAccount['notif_settings'], jobs: unknown[] = [paidJob(`${userId}-job`)]): Wht50ReminderAccount =>
  ({ user_id: userId, jobs: jobs as never, notif_settings: settings });
const certificate = (jobId: string): VaultFile => ({ id: `f-${jobId}`, kind: 'wht50', jobId, jobName: null, client: null, fileName: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: 1, createdAt: '2026-10-20T00:00:00Z' } as VaultFile);

function harness(accounts: Wht50ReminderAccount[], over: Partial<Wht50ReminderDependencies> = {}, options: { pro?: Set<string>; files?: Record<string, VaultFile[]> } = {}) {
  const calls: string[] = [];
  const deps: Wht50ReminderDependencies = {
    now: () => NOW, cronSecret: () => 'secret',
    listAccounts: async () => accounts,
    getUser: async id => { calls.push(`user:${id}`); return { id, app_metadata: {} } as unknown as User; },
    hasPro: async user => { calls.push(`pro:${user.id}`); return options.pro ? options.pro.has(user.id) : true; },
    checkAccess: async id => { calls.push(`access:${id}`); return { allowed: true }; },
    listFiles: async id => { calls.push(`files:${id}`); return options.files?.[id] ?? []; },
    claim: async key => { calls.push(`claim:${key}`); return true; },
    release: async key => { calls.push(`release:${key}`); },
    markSent: async (id, month) => { calls.push(`sent:${id}:${month}`); },
    markChecked: async (id, month) => { calls.push(`checked:${id}:${month}`); },
    send: async lineUserId => { calls.push(`send:${lineUserId}`); return 'accepted'; },
    log: () => {},
    ...over,
  };
  const run = async () => {
    let body: Record<string, unknown> = {};
    const res: any = { setHeader() { return res; }, status() { return res; }, json(value: Record<string, unknown>) { body = value; return res; } };
    await createWht50ReminderHandler(deps)({ method: 'GET', headers: { authorization: 'Bearer secret' } } as never, res);
    return body;
  };
  return { calls, run };
}

test('on unless the account turned it off', () => {
  assert.equal(wht50ReminderOn(undefined), true);
  assert.equal(wht50ReminderOn({}), true);
  assert.equal(wht50ReminderOn({ wht50ReminderEnabled: true }), true);
  assert.equal(wht50ReminderOn({ wht50ReminderEnabled: false }), false);
});

test('a Pro account with LINE that never touched the switch gets the reminder; one that turned it off gets nothing', async () => {
  const { calls, run } = harness([
    account('u-default', { lineUserId: 'U-default' }),
    account('u-off', { lineUserId: 'U-off', wht50ReminderEnabled: false }),
    account('u-on', { lineUserId: 'U-on', wht50ReminderEnabled: true }),
  ]);
  const body = await run();
  assert.equal(body.sent, 2);
  assert.ok(calls.includes('send:U-default') && calls.includes('send:U-on'));
  assert.equal(calls.some(call => call.includes('u-off') || call.includes('U-off')), false, 'turned off: not even looked up');
  assert.ok(calls.includes('sent:u-default:2026-12'));
});

test('accounts without a certificate to wait for cost no request at all', async () => {
  const { calls, run } = harness([
    account('u-none', { lineUserId: 'U-none' }, [paidJob('no-wht', 0)]),
    account('u-ewht', { lineUserId: 'U-ewht' }, [paidJob('ewht', 1)]),
    account('u-done', { lineUserId: 'U-done', lastWht50ReminderMonth: '2026-12' }),
    account('u-checked', { lineUserId: 'U-checked', wht50ReminderCheckedMonth: '2026-12' }),
    account('u-unlinked', { lineUserId: null }),
  ]);
  const body = await run();
  assert.deepEqual(calls, []);
  assert.equal(body.sent, 0);
  assert.equal(body.skipped, 5);
});

test('nothing to send this month is remembered, so the hourly retries skip it for free', async () => {
  const { calls, run } = harness([
    account('u-free', { lineUserId: 'U-free' }),
    account('u-attached', { lineUserId: 'U-attached' }),
  ], {}, { pro: new Set(['u-attached']), files: { 'u-attached': [certificate('u-attached-job')] } });
  const body = await run();
  assert.equal(body.sent, 0);
  assert.ok(calls.includes('checked:u-free:2026-12'), 'not Pro');
  assert.ok(calls.includes('checked:u-attached:2026-12'), 'every certificate attached');
  assert.equal(calls.some(call => call.startsWith('claim:') || call.startsWith('send:')), false);
});

test('the run starts an account only when its most expensive path still fits; the rest wait for the next hour', async () => {
  const accounts = ['a', 'b', 'c'].map(id => account(`u-${id}`, { lineUserId: `U-${id}` }));
  const { calls, run } = harness(accounts, { requestBudget: WHT50_ACCOUNT_RESERVE * 2 });
  const body = await run();
  assert.equal(body.sent, 2);
  assert.equal(body.deferred, 1);
  assert.equal(calls.some(call => call.includes('u-c')), false);
});

test('a send refused for the allowance releases its claim, so a later run sends it', async () => {
  const { calls, run } = harness([account('u-a', { lineUserId: 'U-a' })], {
    send: async () => { throw new Error('Too many subrequests.'); },
  });
  const body = await run();
  assert.equal(body.sent, 0);
  assert.equal(body.failed, 1);
  assert.equal(body.uncertain, 0);
  assert.ok(calls.includes('release:wht50-month:u-a:2026-12'));
});

test('the LINE send treats a refusal for the allowance as not sent, but not after a try that may have got through', async () => {
  const refused = async () => { throw new Error('Too many subrequests.'); };
  assert.equal(await sendWht50ReminderPayload('U-a', { type: 'text', text: 'x' }, 'k', { token: 't', fetcher: refused as never, pause: async () => {} }), 'rejected');
  let tries = 0;
  const timeoutThenRefused = async () => { tries += 1; throw new Error(tries === 1 ? 'The operation timed out' : 'Too many subrequests.'); };
  assert.equal(await sendWht50ReminderPayload('U-a', { type: 'text', text: 'x' }, 'k', { token: 't', fetcher: timeoutThenRefused as never, pause: async () => {} }), 'unknown');
});

test('an account already claimed this month is remembered too, so it is not looked up again every hour', async () => {
  const { calls, run } = harness([account('u-a', { lineUserId: 'U-a' })], { claim: async () => false });
  const body = await run();
  assert.equal(body.sent, 0);
  assert.ok(calls.includes('checked:u-a:2026-12'));
  assert.equal(calls.some(call => call.startsWith('send:')), false);
});

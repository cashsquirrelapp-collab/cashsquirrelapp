import test from 'node:test';
import assert from 'node:assert/strict';
import { CRONS, RESEND_PATH, scheduledPaths } from '../cloudflare/schedule.js';
import { runScheduledJobs } from '../migration/scheduled-runner.js';

// 2026-11-01: every 08:00 job ran in one Worker invocation and shared its 50 outgoing requests (Workers Free); the
// overdue digest used most of them and the four jobs after it failed. Each trigger is now its own invocation, and the
// monthly jobs run hourly on the 1st–3rd, each sending once per account and month.
const MONTHLY = '0,20 1-10 1-3 * *';
const MONTHLY_JOBS = ['/api/send-monthly-report', '/api/send-wht50-reminder'];
const PROFIT = '2 1-10 1-3 * *';

test('the monthly jobs all run even when an earlier one fails', async () => {
  const paths = scheduledPaths(MONTHLY, Date.parse('2026-11-01T01:00:00Z'));
  assert.deepEqual(paths, MONTHLY_JOBS);
  for (const failedPath of MONTHLY_JOBS) {
    const invoked: string[] = [];
    const logs: unknown[] = [];
    await assert.rejects(runScheduledJobs(paths, async path => {
      invoked.push(path);
      return Response.json(path === failedPath
        ? { processed: 2, sent: 1, failed: 1, recipient: 'must-not-enter-logs@example.invalid' }
        : { processed: 1, sent: 1, failed: 0 });
    }, result => logs.push(result)), /Scheduled jobs failed|scheduled jobs failed/);
    assert.deepEqual(invoked, MONTHLY_JOBS);
    assert.equal(JSON.stringify(logs).includes('must-not-enter-logs'), false);
    assert.deepEqual(logs.map(log => (log as { outcome: string }).outcome), paths.map(path => path === failedPath ? 'failed' : 'ok'));
  }
});

test('five triggers: the digest, the AI credit check, the monthly jobs and the profit report each run in an invocation of their own', () => {
  assert.deepEqual(CRONS, ['0 1 * * *', '5 1 * * *', MONTHLY, PROFIT, '0 2 * * *']);
  // The owner's profit report alone at 08:02 on the 1st (2026-11-01: at 13:00 it failed sharing the monthly jobs' 50).
  assert.deepEqual(scheduledPaths(PROFIT, Date.parse('2026-11-01T01:02:00Z')), ['/api/send-admin-profit-report']);
  assert.deepEqual(scheduledPaths(PROFIT, Date.parse('2026-11-04T01:02:00Z')), []);
  for (const date of ['2026-10-31', '2026-11-01', '2026-11-04', '2028-02-29']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)), ['/api/send-overdue-digest']);
    assert.deepEqual(scheduledPaths('5 1 * * *', Date.parse(`${date}T01:05:00Z`)), ['/api/check-ai-credit']);
    assert.deepEqual(scheduledPaths('0 2 * * *', Date.parse(`${date}T02:00:00Z`)), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
  }
  // The monthly jobs: 08:00 Bangkok on the 1st, then hourly to 17:00 and on the 2nd–3rd only for what did not go out
  // (01:00–10:00 UTC, the same date).
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2027-01-01'])
    for (const hour of ['01', '05', '10']) assert.deepEqual(scheduledPaths(MONTHLY, Date.parse(`${date}T${hour}:00:00Z`)), MONTHLY_JOBS);
  // Historical timestamps also represent delayed events; the actual current day is irrelevant. A delayed event past the
  // 3rd sends nothing.
  for (const date of ['2026-11-04', '2026-11-15']) assert.deepEqual(scheduledPaths(MONTHLY, Date.parse(`${date}T01:00:00Z`)), []);
  // No job shares the digest's invocation, and each job has exactly one trigger.
  const all = CRONS.flatMap(cron => scheduledPaths(cron, Date.parse('2026-11-01T01:00:00Z')));
  assert.equal(new Set(all).size, all.length);
  assert.throws(() => scheduledPaths('0 1 * * *', Number.NaN), /Invalid scheduled event time/);
  assert.deepEqual(scheduledPaths('0 1 1 * *', Date.parse('2026-11-01T01:00:00Z')), [], 'A retired trigger runs nothing');
});

test('uncertain delivery and account-reminder failures fail scheduled executions', async () => {
  for (const body of [{ uncertain: 1 }, { markerFailed: 1 }, { reminderFailed: 1 }, { channels: { email: { failed: 1 } } }]) {
    await assert.rejects(runScheduledJobs(['/api/close-expired-accounts'], async () => Response.json(body), () => {}));
  }
});

test('successful scheduled execution accepts zero failures and known cron mapping', async () => {
  const scheduledTime = Date.parse('2026-11-04T01:00:00Z');
  assert.deepEqual(scheduledPaths('0 1 * * *', scheduledTime), ['/api/send-overdue-digest']);
  assert.deepEqual(scheduledPaths('0 2 * * *', scheduledTime), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
  await runScheduledJobs(scheduledPaths('0 1 * * *', scheduledTime), async () => Response.json({ processed: 0, failed: 0, skipped: 0 }), () => {});
});

// 2026-11-01: a send refused by Cloudflare for going over the invocation's 50 requests never left the Worker, so it is
// "rejected" (its claim is released and a later run retries) rather than "unknown" (claim kept, never retried).
test('a request refused for the allowance counts as not sent', async () => {
  const { attemptDelivery, neverSent } = await import('../backend/src/services/notificationOutcome.js');
  assert.equal(neverSent(new Error('Too many subrequests.')), true);
  assert.equal(neverSent(new Error('network connection lost')), false);
  assert.equal(await attemptDelivery(async () => { throw new Error('Too many subrequests.'); }), 'rejected');
  assert.equal(await attemptDelivery(async () => { throw new Error('socket hang up'); }), 'unknown');
});


test('TEMPORARY: the :20 run sends the admin-only resend once, at 14:20 Bangkok on 2026-11-01, and nothing at any other :20', () => {
  assert.deepEqual(scheduledPaths(MONTHLY, Date.parse('2026-11-01T07:20:30Z')), [RESEND_PATH]);
  for (const at of ['2026-11-01T06:20:00Z', '2026-11-01T08:20:00Z', '2026-11-02T07:20:00Z', '2026-12-01T07:20:00Z'])
    assert.deepEqual(scheduledPaths(MONTHLY, Date.parse(at)), [], at);
  assert.match(RESEND_PATH, /resend=admins/);
});

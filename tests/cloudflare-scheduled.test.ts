import test from 'node:test';
import assert from 'node:assert/strict';
import { CRONS, scheduledPaths } from '../cloudflare/schedule.js';
import { runScheduledJobs } from '../migration/scheduled-runner.js';

// 2026-11-01: every 08:00 job ran in one Worker invocation and shared its 50 outgoing requests (Workers Free); the
// overdue digest used most of them and the four jobs after it failed. Each trigger is now its own invocation, and the
// monthly jobs run hourly on the 1st–3rd, each sending once per account and month.
const MONTHLY = '10 1-10 1-3 * *';
const MONTHLY_JOBS = ['/api/send-monthly-report', '/api/send-wht50-reminder', '/api/send-admin-profit-report'];

test('the monthly jobs all run even when an earlier one fails', async () => {
  const paths = scheduledPaths(MONTHLY, Date.parse('2026-11-01T01:10:00Z'));
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

test('four triggers: the digest, the AI credit check and the monthly jobs each run in an invocation of their own', () => {
  assert.deepEqual(CRONS, ['0 1 * * *', '5 1 * * *', MONTHLY, '0 2 * * *']);
  for (const date of ['2026-10-31', '2026-11-01', '2026-11-04', '2028-02-29']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)), ['/api/send-overdue-digest']);
    assert.deepEqual(scheduledPaths('5 1 * * *', Date.parse(`${date}T01:05:00Z`)), ['/api/check-ai-credit']);
    assert.deepEqual(scheduledPaths('0 2 * * *', Date.parse(`${date}T02:00:00Z`)), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
  }
  // The monthly jobs: every hour from 08:10 to 17:10 Bangkok on the 1st–3rd (01:10–10:10 UTC, the same date).
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03', '2027-01-01'])
    for (const hour of ['01', '05', '10']) assert.deepEqual(scheduledPaths(MONTHLY, Date.parse(`${date}T${hour}:10:00Z`)), MONTHLY_JOBS);
  // Historical timestamps also represent delayed events; the actual current day is irrelevant. A delayed event past the
  // 3rd sends nothing.
  for (const date of ['2026-11-04', '2026-11-15']) assert.deepEqual(scheduledPaths(MONTHLY, Date.parse(`${date}T01:10:00Z`)), []);
  // No job shares the digest's invocation, and each job has exactly one trigger.
  const all = CRONS.flatMap(cron => scheduledPaths(cron, Date.parse('2026-11-01T01:10:00Z')));
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

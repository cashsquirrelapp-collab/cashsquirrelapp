import test from 'node:test';
import assert from 'node:assert/strict';
import { CRONS, scheduledPaths } from '../cloudflare/schedule.js';
import { runScheduledJobs } from '../migration/scheduled-runner.js';

// 2026-11-01: every 08:00 job ran in one Worker invocation and shared its 50 outgoing requests (Workers Free); the
// overdue digest used most of them and the four jobs after it failed. Each trigger is now its own invocation, and the
// monthly jobs run hourly on the 1st–3rd, each sending once per account and month.
const MONTHLY = '0 1-10 1-3 * *';
const MONTHLY_JOBS = ['/api/send-monthly-report'];
const PROFIT = '2 1-10 1-3 * *';
// 2026-11-03: the 50 ทวิ reminder is on by default, so it left the monthly report's invocation for one of its own beside
// the light AI credit check (08:05 daily), hourly to 17:05 on the 1st–3rd.
const CREDIT = '5 1-10 * * *';
const CREDIT_AND_WHT50 = ['/api/check-ai-credit', '/api/send-wht50-reminder'];

test('jobs sharing an invocation all run even when an earlier one fails', async () => {
  const paths = scheduledPaths(CREDIT, Date.parse('2026-11-01T01:05:00Z'));
  assert.deepEqual(paths, CREDIT_AND_WHT50);
  for (const failedPath of CREDIT_AND_WHT50) {
    const invoked: string[] = [];
    const logs: unknown[] = [];
    await assert.rejects(runScheduledJobs(paths, async path => {
      invoked.push(path);
      return Response.json(path === failedPath
        ? { processed: 2, sent: 1, failed: 1, recipient: 'must-not-enter-logs@example.invalid' }
        : { processed: 1, sent: 1, failed: 0 });
    }, result => logs.push(result)), /Scheduled jobs failed|scheduled jobs failed/);
    assert.deepEqual(invoked, CREDIT_AND_WHT50);
    assert.equal(JSON.stringify(logs).includes('must-not-enter-logs'), false);
    assert.deepEqual(logs.map(log => (log as { outcome: string }).outcome), paths.map(path => path === failedPath ? 'failed' : 'ok'));
  }
});

test('five triggers: the digest, the AI credit check with the 50 ทวิ reminder, the monthly report and the profit report each run in an invocation of their own', () => {
  assert.deepEqual(CRONS, ['0 1 * * *', CREDIT, MONTHLY, PROFIT, '0 2 * * *']);
  // The credit check once a day at 08:05; the 50 ทวิ reminder hourly 08:05–17:05 on the 1st–3rd only.
  assert.deepEqual(scheduledPaths(CREDIT, Date.parse('2026-11-01T01:05:00Z')), CREDIT_AND_WHT50);
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03'])
    for (const hour of ['02', '06']) assert.deepEqual(scheduledPaths(CREDIT, Date.parse(`${date}T${hour}:05:00Z`)), ['/api/send-wht50-reminder']);
  // The filing-calendar reminder (ฟีเจอร์ทดลอง): 17:05 on the 1st–3rd, after the 50 ทวิ reminder has had the day.
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) assert.deepEqual(scheduledPaths(CREDIT, Date.parse(`${date}T10:05:00Z`)), ['/api/send-wht50-reminder', '/api/send-filing-reminder']);
  for (const hour of ['02', '10']) assert.deepEqual(scheduledPaths(CREDIT, Date.parse(`2026-11-04T${hour}:05:00Z`)), []);
  // The owner's profit report alone at 08:02 on the 1st (2026-11-01: at 13:00 it failed sharing the monthly jobs' 50).
  assert.deepEqual(scheduledPaths(PROFIT, Date.parse('2026-11-01T01:02:00Z')), ['/api/send-admin-profit-report']);
  assert.deepEqual(scheduledPaths(PROFIT, Date.parse('2026-11-04T01:02:00Z')), []);
  for (const date of ['2026-10-31', '2026-11-01', '2026-11-04', '2028-02-29']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)), ['/api/send-overdue-digest']);
    if (!['2026-11-01'].includes(date)) assert.deepEqual(scheduledPaths(CREDIT, Date.parse(`${date}T01:05:00Z`)), ['/api/check-ai-credit', '/api/send-filing-reminder']);
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
  assert.deepEqual(scheduledPaths('5 1 * * *', Date.parse('2026-11-01T01:05:00Z')), [], 'The old 08:05 trigger runs nothing');
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


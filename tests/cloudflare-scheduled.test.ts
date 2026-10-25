import test from 'node:test';
import assert from 'node:assert/strict';
import { CRONS, scheduledPaths } from '../cloudflare/schedule.js';
import { runScheduledJobs } from '../migration/scheduled-runner.js';

test('all first-day jobs run even when a preceding daily or monthly delivery fails', async () => {
  const paths = scheduledPaths('0 1 * * *', Date.parse('2026-11-01T01:00:00Z'));
  for (const failedPath of ['/api/send-overdue-digest', '/api/send-monthly-report', '/api/send-admin-profit-report', '/api/check-ai-credit']) {
    const invoked: string[] = [];
    const logs: unknown[] = [];
    await assert.rejects(runScheduledJobs(paths, async path => {
      invoked.push(path);
      return Response.json(path === failedPath
        ? { processed: 2, sent: 1, failed: 1, recipient: 'must-not-enter-logs@example.invalid' }
        : { processed: 1, sent: 1, failed: 0 });
    }, result => logs.push(result)), /Scheduled jobs failed|scheduled jobs failed/);
    assert.deepEqual(invoked, ['/api/send-overdue-digest', '/api/send-monthly-report', '/api/send-admin-profit-report', '/api/check-ai-credit']);
    assert.equal(JSON.stringify(logs).includes('must-not-enter-logs'), false);
    assert.deepEqual(logs.map(log => (log as { outcome: string }).outcome), paths.map(path => path === failedPath ? 'failed' : 'ok'));
  }
});

test('two triggers preserve daily and first-day jobs using the event timestamp', () => {
  assert.deepEqual(CRONS, ['0 1 * * *', '0 2 * * *']);
  for (const date of ['2026-10-31', '2026-11-04', '2028-02-29']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)), ['/api/send-overdue-digest', '/api/check-ai-credit']);
  }
  // The owner's profit report (2026-10-25): sent on the 1st; the 2nd and 3rd only retry a send that failed. The AI credit
  // check runs every day.
  for (const date of ['2026-11-02', '2026-11-03']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)), ['/api/send-overdue-digest', '/api/send-admin-profit-report', '/api/check-ai-credit']);
  }
  // Historical timestamps also represent delayed events; the actual current day is irrelevant.
  for (const date of ['2020-01-01', '2026-11-01', '2027-01-01']) {
    assert.deepEqual(scheduledPaths('0 1 * * *', Date.parse(`${date}T01:00:00Z`)),
      ['/api/send-overdue-digest', '/api/send-monthly-report', '/api/send-admin-profit-report', '/api/check-ai-credit']);
    assert.deepEqual(scheduledPaths('0 2 * * *', Date.parse(`${date}T02:00:00Z`)), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
  }
  // 50 ทวิ is hidden until the owner launches it (2026-10-22): its reminder is never scheduled.
  for (const cron of CRONS) for (const day of ['2026-11-01', '2026-11-02']) {
    assert.equal(scheduledPaths(cron, Date.parse(`${day}T01:00:00Z`)).includes('/api/send-wht50-reminder'), false);
  }
  assert.throws(() => scheduledPaths('0 1 * * *', Number.NaN), /Invalid scheduled event time/);
  assert.deepEqual(scheduledPaths('0 1 1 * *', Date.parse('2026-11-01T01:00:00Z')), [], 'Retired monthly trigger cannot duplicate the new daily dispatch');
});

test('uncertain delivery and account-reminder failures fail scheduled executions', async () => {
  for (const body of [{ uncertain: 1 }, { markerFailed: 1 }, { reminderFailed: 1 }, { channels: { email: { failed: 1 } } }]) {
    await assert.rejects(runScheduledJobs(['/api/close-expired-accounts'], async () => Response.json(body), () => {}));
  }
});

test('successful scheduled execution accepts zero failures and known cron mapping', async () => {
  const scheduledTime = Date.parse('2026-11-04T01:00:00Z');
  assert.deepEqual(scheduledPaths('0 1 * * *', scheduledTime), ['/api/send-overdue-digest', '/api/check-ai-credit']);
  assert.deepEqual(scheduledPaths('0 2 * * *', scheduledTime), ['/api/close-expired-accounts', '/api/setup-line-richmenu', '/api/advance-card-renewals']);
  await runScheduledJobs(scheduledPaths('0 1 * * *', scheduledTime), async () => Response.json({ processed: 0, failed: 0, skipped: 0 }), () => {});
});

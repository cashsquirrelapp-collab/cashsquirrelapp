import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bucketCheckOnce } from '../backend/src/services/reportStorage';
import { authAccountsFrom } from '../backend/src/handlers/send-monthly-report';

// Owner, 2026-11-01 ("ทำข้อ 1"): Workers Free allows 50 outgoing requests per run, and each account's report took about
// eight, so a run reached about five accounts. The storage bucket is now checked once per run (it was two requests per
// account) and paused accounts come from the account list the run already reads (it was one look-up per account).

test('the report bucket is checked once per run, and checked again after a failure', async () => {
  let checks = 0;
  let fail = true;
  const ensure = bucketCheckOnce(async () => { checks += 1; if (fail) throw new Error('storage unavailable'); });
  await assert.rejects(ensure());
  fail = false;
  await Promise.all([ensure(), ensure(), ensure()]);
  await ensure();
  assert.equal(checks, 2, 'one failed check, then one check shared by every later upload');
  // A new run starts with its own check.
  let fresh = 0;
  const next = bucketCheckOnce(async () => { fresh += 1; });
  await next(); await next();
  assert.equal(fresh, 1);
});

test('paused accounts are known from the account list, without a look-up per account', () => {
  const accounts = authAccountsFrom([
    { id: 'a', created_at: '2026-10-01T00:00:00Z', app_metadata: { account_paused: true } },
    { id: 'b', created_at: '2026-10-02T00:00:00Z', app_metadata: { account_paused: false } },
    { id: 'c', created_at: '2026-10-03T00:00:00Z', app_metadata: null },
  ]);
  assert.deepEqual(accounts.get('a'), { createdAt: '2026-10-01T00:00:00Z', paused: true });
  assert.equal(accounts.get('b')?.paused, false);
  assert.equal(accounts.get('c')?.paused, false);
  assert.equal(accounts.get('missing'), undefined);
});

test('each account\'s report makes at most six outgoing requests', () => {
  const source = fs.readFileSync('backend/src/handlers/send-monthly-report.ts', 'utf8');
  const loop = source.slice(source.indexOf('for (const row of rows || [])'), source.indexOf("res.status(200).json({ processed"));
  assert.ok(loop.length > 0);
  assert.doesNotMatch(loop, /getUserById/, 'no account look-up inside the loop');
  assert.doesNotMatch(source, /ensurePrivateReportBucket\(\)/, 'the bucket is checked through the once-per-run check');
  // claim, email, upload, LINE, mark as sent (+ the release of a claim when nothing went out): within 6.
  const calls = (loop.match(/claimDelivery\(|sendReportEmail\(|uploadReportAndGetLink\(|sendLineMessageToEmailOutcome\(|patchPrivate\(/g) || []).length;
  assert.equal(calls, 5);
});

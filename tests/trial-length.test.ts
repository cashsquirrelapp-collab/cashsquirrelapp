import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, SHORT_TRIAL_FROM, inFreeTrial, trialDays, trialEndsAt } from '../shared/trial';

// Owner, 2026-10-24: new accounts get a 3-day Pro trial; accounts created before 25 Oct 2569 keep their 14 days.

test('accounts created from 25 Oct 2569 (Bangkok midnight) get 3 days, earlier ones keep 14', () => {
  assert.equal(trialDays('2026-10-24T16:59:59Z'), 14, 'one second before midnight in Bangkok');
  assert.equal(trialDays('2026-10-24T17:00:00Z'), 3, 'midnight 25 Oct in Bangkok');
  assert.equal(trialDays('2026-11-02T08:00:00Z'), 3);
  assert.equal(trialDays('2026-09-01T00:00:00Z'), 14);
  assert.equal(SHORT_TRIAL_FROM, Date.parse('2026-10-24T17:00:00Z'));
});

test('a new account is in its trial for exactly 3 days; an older one still finishes its 14', () => {
  const created = Date.parse('2026-11-01T03:00:00Z');
  assert.equal(trialEndsAt(created)!.getTime(), created + 3 * DAY_MS);
  assert.equal(inFreeTrial(created, created + 3 * DAY_MS - 1), true);
  assert.equal(inFreeTrial(created, created + 3 * DAY_MS), false);
  const older = Date.parse('2026-10-20T03:00:00Z');
  assert.equal(inFreeTrial(older, Date.parse('2026-10-30T03:00:00Z')), true, 'day 10 of 14');
  assert.equal(inFreeTrial(older, older + 14 * DAY_MS), false);
});

test('no creation date means no trial', () => {
  assert.equal(trialEndsAt(null), null);
  assert.equal(inFreeTrial(undefined), false);
  assert.equal(inFreeTrial('not a date'), false);
});

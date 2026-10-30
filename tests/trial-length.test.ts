import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, NO_TRIAL_FROM, SHORT_TRIAL_FROM, inFreeTrial, trialDays, trialEndsAt } from '../shared/trial';

// Owner, 2026-10-24: a 3-day Pro trial from 25 Oct 2569; accounts created before keep their 14 days.
// Owner, 2026-10-30: none at all from 30 Oct 2569 09:30 Bangkok (see below).

test('accounts created from 25 Oct 2569 (Bangkok midnight) get 3 days, earlier ones keep 14', () => {
  assert.equal(trialDays('2026-10-24T16:59:59Z'), 14, 'one second before midnight in Bangkok');
  assert.equal(trialDays('2026-10-24T17:00:00Z'), 3, 'midnight 25 Oct in Bangkok');
  assert.equal(trialDays('2026-10-29T08:00:00Z'), 3);
  assert.equal(trialDays('2026-09-01T00:00:00Z'), 14);
  assert.equal(SHORT_TRIAL_FROM, Date.parse('2026-10-24T17:00:00Z'));
});

test('a 25–30 Oct account is in its trial for exactly 3 days; an older one still finishes its 14', () => {
  const created = Date.parse('2026-10-29T03:00:00Z');
  assert.equal(trialEndsAt(created)!.getTime(), created + 3 * DAY_MS);
  assert.equal(inFreeTrial(created, created + 3 * DAY_MS - 1), true);
  assert.equal(inFreeTrial(created, created + 3 * DAY_MS), false);
  const older = Date.parse('2026-10-20T03:00:00Z');
  assert.equal(inFreeTrial(older, Date.parse('2026-10-30T03:00:00Z')), true, 'day 10 of 14');
  assert.equal(inFreeTrial(older, older + 14 * DAY_MS), false);
});

// Owner, 2026-10-30: no free trial any more; accounts created before keep the days they were given.
test('accounts created from 30 Oct 2569 09:30 Bangkok get no trial at all', () => {
  assert.equal(NO_TRIAL_FROM, Date.parse('2026-10-30T02:30:00Z'));
  assert.equal(trialDays(NO_TRIAL_FROM - 1), 3, 'a second before: still 3 days');
  assert.equal(trialDays(NO_TRIAL_FROM), 0);
  assert.equal(trialDays('2026-11-02T08:00:00Z'), 0);
  assert.equal(trialEndsAt(NO_TRIAL_FROM), null);
  assert.equal(inFreeTrial(NO_TRIAL_FROM, NO_TRIAL_FROM + 1000), false);
  // one created just before keeps its 3 days to the end
  assert.equal(inFreeTrial(NO_TRIAL_FROM - 1, NO_TRIAL_FROM + 2 * DAY_MS), true);
  assert.equal(inFreeTrial(NO_TRIAL_FROM - 1, NO_TRIAL_FROM - 1 + 3 * DAY_MS), false);
});

test('no creation date means no trial', () => {
  assert.equal(trialEndsAt(null), null);
  assert.equal(inFreeTrial(undefined), false);
  assert.equal(inFreeTrial('not a date'), false);
});

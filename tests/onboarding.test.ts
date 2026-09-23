import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_SETUP_ROLLOUT_AT,
  isProfileSetupEligibleAccount,
  normalizeProfileSetupSettings,
  shouldShowProfileSetup,
} from '../frontend/src/features/onboarding/profileSetupState.ts';

const baseSettings = { monthlyExpense: 0, monthlyRevenueGoal: 20_000, savingsPercentage: 40 };
const beforeRollout = new Date(PROFILE_SETUP_ROLLOUT_AT - 1).toISOString();
const afterRollout = new Date(PROFILE_SETUP_ROLLOUT_AT + 1).toISOString();

test('only accounts created after the rollout are eligible for first-time onboarding', () => {
  assert.equal(isProfileSetupEligibleAccount(afterRollout), true);
  assert.equal(isProfileSetupEligibleAccount(beforeRollout), false);
  assert.equal(isProfileSetupEligibleAccount(undefined), false);
  assert.equal(isProfileSetupEligibleAccount('invalid'), false);
});

test('new users see onboarding until completion, skip, or dismissal stores the handled flag', () => {
  assert.equal(shouldShowProfileSetup(baseSettings, afterRollout), true);
  const completed = { ...baseSettings, profileSetupCompleted: true };
  assert.equal(shouldShowProfileSetup(completed, afterRollout), false);
  assert.equal(shouldShowProfileSetup(completed, afterRollout), false);
});

test('existing users are normalized as handled and are never prompted retroactively', () => {
  const normalized = normalizeProfileSetupSettings(baseSettings, beforeRollout);
  assert.equal(normalized.profileSetupCompleted, true);
  assert.equal(shouldShowProfileSetup(normalized, beforeRollout), false);
});

test('a persisted handled flag survives reload and a new session', () => {
  const stored = normalizeProfileSetupSettings(
    { ...baseSettings, profileSetupCompleted: true },
    afterRollout,
  );
  const reloaded = structuredClone(stored);
  assert.equal(shouldShowProfileSetup(reloaded, afterRollout), false);
});

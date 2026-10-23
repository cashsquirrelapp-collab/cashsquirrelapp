import type { AppSettings } from '../../../../shared/types';

// Accounts created before this rollout are existing users and must never be prompted
// retroactively. Invalid/missing Auth timestamps also fail closed (no prompt).
export const PROFILE_SETUP_ROLLOUT_AT = Date.parse('2026-09-23T02:00:00.000Z');

export function isProfileSetupEligibleAccount(createdAt?: string): boolean {
  if (!createdAt) return false;
  const createdAtMs = Date.parse(createdAt);
  return Number.isFinite(createdAtMs) && createdAtMs >= PROFILE_SETUP_ROLLOUT_AT;
}

export function normalizeProfileSetupSettings(
  settings: AppSettings,
  createdAt?: string,
): AppSettings {
  if (settings.profileSetupCompleted === true) return settings;
  if (isProfileSetupEligibleAccount(createdAt)) return settings;
  return { ...settings, profileSetupCompleted: true };
}

export function shouldShowProfileSetup(
  settings: AppSettings,
  createdAt?: string,
): boolean {
  return isProfileSetupEligibleAccount(createdAt) && settings.profileSetupCompleted !== true;
}

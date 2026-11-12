import { stagingBaseReady, type StagingEnvironment } from './staging.js';

// The owner's test account on staging.krarok.com gets what the owner's account has on the real site — every feature,
// the admin level and Pro — without any database row or payment (owner, 2026-11-13: "ปรับในเซตติ้งให้มันปลดล็อกทั้งหมด
// ไม่ต้องเติมโปร"). Two Worker settings on the test site only: STAGING_UNLOCK=enabled and STAGING_UNLOCK_USER_ID=<that
// account's id>. It needs the whole test-site setup (its database address, test Stripe, its own web address), so the real
// site can never meet it.

export function stagingUnlocked(userId: unknown, env: StagingEnvironment = process.env): boolean {
  return stagingBaseReady(env) && env.STAGING_UNLOCK === 'enabled' &&
    typeof userId === 'string' && userId.length > 0 && env.STAGING_UNLOCK_USER_ID === userId;
}

/** The subscription row an unlocked test account reads as: an admin-given Pro with no end date. */
export const STAGING_PRO = { status: 'active', plan: 'admin_grant', current_period_end: null } as const;

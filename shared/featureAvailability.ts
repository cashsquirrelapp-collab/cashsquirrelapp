import type { SystemRole } from './groups';

/** Reversible launch policy for the UI. It never changes stored financial data or API permissions. */
const PHASE_ONE_FEATURES = new Set([
  'dashboard', 'incomeExpense', 'jobs', 'calendar', 'invoice', 'feedback',
  // Account controls and existing subscription management remain reachable.
  'settings', 'plans',
  // Released to everyone on 2026-10-20 (owner): money owed, quotations, payment reminders (the bell,
  // overdue prompts, notification settings) and LINE (still needs Pro and a linked account).
  'receivables', 'quotation', 'notifications', 'line',
  // Released to everyone on 2026-10-23 (owner: "เปิดให้สมาชิกทั่วไปเห็นหน้าแชตด้วย"): the เลขากระรอก chat
  // screen. It is still a labelled screen preview (no AI, LINE or billing behind it) and stays Pro-gated.
  'assistant',
  // Released to everyone on 2026-10-31 (owner: "ฝากเอา 2 ฟีเจอร์นี้เข้ามาด้วย ... ฟรีจำกัดได้แค่ 5 เอกสาร ... Pro ใช้ได้ไม่จำกัด"):
  // เอกสาร › คลังเอกสาร and ติดตามใบ 50 ทวิ. Free accounts keep up to VAULT_FREE_FILES files (shared/vault.ts); Pro has
  // no limit. The monthly 50 ทวิ LINE reminder: on for Pro accounts with LINE unless turned off (since 2026-11-03).
  'vault', 'wht50',
]);

/**
 * Everything not released yet: the owner's account only (owner, 2026-11-04: "แอดมินคนอื่นไม่มีสิทธิ์ได้ฟังก์ชันโปรนะเว้ย
 * แค่สามารถใช้ดูหลังบ้านได้แค่นั้นเอง"). A team admin sees what every account sees, plus the admin page.
 */
export function hasFullFeatureAccess(context: {
  isGuest?: boolean;
  userId?: string | null;
  roleUserId?: string | null;
  systemRole?: SystemRole | null;
  /** The server says this is the owner's account (session.user.adminLevel === 'owner'). */
  isOwner?: boolean;
}): boolean {
  return context.isGuest !== true
    && Boolean(context.userId)
    && context.userId === context.roleUserId
    && context.systemRole === 'admin'
    && context.isOwner === true;
}

/** adminPage: the account may open the admin page (the owner or a team admin); it opens nothing else. */
export function isPhaseOneFeatureAvailable(feature: string, fullFeatureAccess: boolean, adminPage = false): boolean {
  return fullFeatureAccess || PHASE_ONE_FEATURES.has(feature) || (adminPage && feature === 'adminDashboard');
}

export function resolvePhaseOneTab<T extends string>(tab: T, fullFeatureAccess: boolean, adminPage = false): T | 'dashboard' {
  return isPhaseOneFeatureAvailable(tab, fullFeatureAccess, adminPage) ? tab : 'dashboard';
}

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
]);

export function hasFullFeatureAccess(context: {
  isGuest?: boolean;
  userId?: string | null;
  roleUserId?: string | null;
  systemRole?: SystemRole | null;
}): boolean {
  return context.isGuest !== true
    && Boolean(context.userId)
    && context.userId === context.roleUserId
    && context.systemRole === 'admin';
}

export function isPhaseOneFeatureAvailable(feature: string, fullFeatureAccess: boolean): boolean {
  return fullFeatureAccess || PHASE_ONE_FEATURES.has(feature);
}

export function resolvePhaseOneTab<T extends string>(tab: T, fullFeatureAccess: boolean): T | 'dashboard' {
  return isPhaseOneFeatureAvailable(tab, fullFeatureAccess) ? tab : 'dashboard';
}

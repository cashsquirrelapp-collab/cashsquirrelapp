/**
 * Who may open the admin page, and how much of it (owner, 2026-11-04): 'owner' = ผู้ดูแล, everything; 'admin' = a team
 * member, without money (revenue, Pro payments, profit and AI cost, the cash overview) and without giving rights or
 * tokens. null = an ordinary account. The server decides it (security/adminAnalyticsAccess.ts); the app only follows.
 */
export type AdminLevel = 'owner' | 'admin' | null;

/** The admin page's sections a team admin opens. The rest are the owner's alone. */
export const TEAM_ADMIN_VIEWS = ['activity', 'product', 'customers', 'onboarding', 'feedback', 'broadcast'] as const;

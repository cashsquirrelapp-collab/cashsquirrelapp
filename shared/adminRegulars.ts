import type { AdminAnalyticsAccount } from './adminAnalytics';
import { GOALS, LEGACY_GOALS, OCCUPATIONS, WORK_TYPES } from './onboarding';

// ผู้ใช้ประจำ, the owner's admin view (owner, 2026-11-10: "ดูได้หน่อยว่าใครแม่งกลับมาใช้ซ้ำบ่อยเป็นอีเมลอะไรชื่ออะไร ... เผื่อแบบ
// บางทีกูส่งข้อมูลส่งอีเมลไปทางอีเมลของคนคนนั้นได้ จะได้เห็นตัวตนด้วยว่าเขาใช้เขาเป็นคนประเภทไหนใช้อะไรมากที่สุด"): the accounts
// that came back on more than one day, most days first, with their email, what they said they do when they signed up,
// the pages they open most, how often they asked เลขากระรอก and whether LINE is linked. Owner only (emails).

/** What the server adds to the admin's account list for this view (admin-users ?action=regulars). */
export interface RegularExtra {
  userId: string;
  email: string | null;
  lastSignInAt: string | null;
  workType: string | null;
  workTypeOther: string;
  occupations: string[];
  occupationOther: string;
  goals: string[];
  /** เลขากระรอก requests in the chosen range. */
  aiRequests: number;
  lineLinked: boolean;
}

export interface RegularAccount extends AdminAnalyticsAccount {
  extra: RegularExtra | null;
}

/** Collect the extras from plain rows (the server's reads), one per account. */
export function regularExtras(input: {
  users: { id: string; email?: string | null; last_sign_in_at?: string | null }[];
  onboarding: { user_id: string; onboarding: unknown }[];
  aiUsage: { user_id: string }[];
  lineLinks: { user_id: string }[];
}): RegularExtra[] {
  const answers = new Map(input.onboarding.map(row => [row.user_id, row.onboarding] as const));
  const ai = new Map<string, number>();
  for (const row of input.aiUsage) ai.set(row.user_id, (ai.get(row.user_id) ?? 0) + 1);
  const line = new Set(input.lineLinks.map(row => row.user_id));
  const text = (value: unknown, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const list = (value: unknown, known: readonly { id: string }[]) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && known.some(item => item.id === id)) : []);
  return input.users.map(user => {
    const record = (answers.get(user.id) && typeof answers.get(user.id) === 'object' ? answers.get(user.id) : {}) as Record<string, unknown>;
    const workType = typeof record.work_type === 'string' && WORK_TYPES.some(item => item.id === record.work_type) ? record.work_type : null;
    return {
      userId: user.id, email: user.email || null, lastSignInAt: user.last_sign_in_at || null,
      workType, workTypeOther: text(record.work_type_other), occupations: list(record.occupations, OCCUPATIONS),
      occupationOther: text(record.occupation_other), goals: list(record.goals, GOALS),
      aiRequests: ai.get(user.id) ?? 0, lineLinked: line.has(user.id),
    };
  });
}

/** "ฟรีแลนซ์ / อาชีพอิสระ · ตัดต่อวิดีโอ / กราฟิก, ช่างภาพ / วิดีโอ", or null when the account never answered. */
export function regularType(extra: RegularExtra | null): string | null {
  if (!extra) return null;
  const work = extra.workType === 'other' ? extra.workTypeOther || 'อื่น ๆ' : WORK_TYPES.find(item => item.id === extra.workType)?.label;
  const jobs = extra.occupations.map(id => (id === 'other' ? extra.occupationOther || 'อื่น ๆ' : OCCUPATIONS.find(item => item.id === id)?.label)).filter(Boolean);
  const parts = [work, jobs.join(', ')].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export interface RegularFilter { minDays: number; plan: 'all' | 'paying' | 'free'; query: string }

/** The accounts that came back, most days first, then most pages, then the latest; with their extras. */
export function regularAccounts(accounts: AdminAnalyticsAccount[], extras: RegularExtra[], filter: RegularFilter): RegularAccount[] {
  const byId = new Map(extras.map(extra => [extra.userId, extra] as const));
  const text = filter.query.trim().toLowerCase();
  return accounts
    .map(account => ({ ...account, extra: byId.get(account.userId) ?? null }))
    .filter(account => account.activeDays >= filter.minDays)
    // Paying: a paid Pro now. Everyone else (free, trial, admin-granted, expired) is "not paying".
    .filter(account => filter.plan === 'all' || (filter.plan === 'paying') === (account.planStatus === 'pro'))
    .filter(account => !text || `${account.displayName} ${account.publicId} ${account.extra?.email ?? ''} ${regularType(account.extra) ?? ''}`.toLowerCase().includes(text))
    .sort((a, b) => b.activeDays - a.activeDays || b.pageViews - a.pageViews || Date.parse(b.lastSeenAt || '0') - Date.parse(a.lastSeenAt || '0'));
}

/** The emails of a list, once each, ready to paste into an email's BCC. */
export function regularEmails(accounts: RegularAccount[]): string[] {
  return [...new Set(accounts.map(account => account.extra?.email).filter((email): email is string => !!email))];
}

/**
 * Which kind of customer comes back (owner, 2026-11-15, from a tester's advice to find the main group first and speak to
 * it): every account that signed up, grouped by its sign-up answer (main work, occupations or what it wants help with),
 * how many came back on 2 days or more in the range, asked เลขา, linked LINE and pay for Pro. Occupations and goals are
 * multiple choice, so one account counts in each it picked. Most came back first; accounts that never answered last.
 */
export type SegmentBy = 'work' | 'occupation' | 'goal';
export interface SegmentRow { key: string; label: string; signups: number; returned: number; ai: number; line: number; paying: number }

export function regularSegments(accounts: AdminAnalyticsAccount[], extras: RegularExtra[], by: SegmentBy, minDays = 2): SegmentRow[] {
  const byId = new Map(extras.map(extra => [extra.userId, extra] as const));
  const known: readonly { id: string; label: string }[] = by === 'work' ? WORK_TYPES : by === 'occupation' ? OCCUPATIONS : [...GOALS, ...LEGACY_GOALS];
  const labelOf = (key: string) => (key === 'none' ? 'ยังไม่ได้ตอบ' : key === 'other' ? 'อื่น ๆ' : known.find(item => item.id === key)?.label ?? key);
  const rows = new Map<string, SegmentRow>();
  for (const account of accounts) {
    const extra = byId.get(account.userId) ?? null;
    const picked = by === 'work' ? (extra?.workType ? [extra.workType] : []) : by === 'occupation' ? extra?.occupations ?? [] : extra?.goals ?? [];
    for (const key of picked.length ? [...new Set(picked)] : ['none']) {
      const row = rows.get(key) ?? { key, label: labelOf(key), signups: 0, returned: 0, ai: 0, line: 0, paying: 0 };
      row.signups += 1;
      if (account.activeDays >= minDays) row.returned += 1;
      if ((extra?.aiRequests ?? 0) > 0) row.ai += 1;
      if (extra?.lineLinked) row.line += 1;
      if (account.planStatus === 'pro') row.paying += 1;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => Number(a.key === 'none') - Number(b.key === 'none') || b.returned - a.returned || b.signups - a.signups || a.label.localeCompare(b.label, 'th'));
}

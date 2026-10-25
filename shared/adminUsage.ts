import type { AdminAnalyticsAccount } from './adminAnalytics.js';
import type { AccountFigures } from './adminProfit.js';

// Usage by account for the admin page (owner, 2026-10-25: "ดูผู้ใช้แต่ละคนได้ไหมว่าคนไหนใช้เยอะใช้น้อย ... เอามาทำ data"):
// the dashboard's account list (app use) joined with the profit report's figures (AI use, cost, money), a usage
// level, and a CSV for analysis. Pure: the screen is frontend/src/features/groups/AdminUsageTable.tsx.
export type UsageLevel = 'heavy' | 'medium' | 'light' | 'none';
export interface UsageRow {
  userId: string;
  who?: AdminAnalyticsAccount;
  fig?: AccountFigures;
  /** Share of the token allowance used this cycle (0–100), when the account has an allowance. */
  quota: number | null;
  level: UsageLevel;
}

/** The AI usage level: by the share of the allowance used, or by requests for accounts without an allowance. */
export function usageLevel(fig: AccountFigures | undefined): { quota: number | null; level: UsageLevel } {
  if (!fig || fig.messages === 0) return { quota: fig && fig.krarokTokensLeft !== null ? 0 : null, level: 'none' };
  const limit = fig.krarokTokensLeft === null ? null : fig.krarokTokens + fig.krarokTokensLeft;
  const quota = limit ? Math.min(100, Math.round((fig.krarokTokens / limit) * 100)) : null;
  if (quota !== null) return { quota, level: quota >= 80 ? 'heavy' : quota >= 30 ? 'medium' : 'light' };
  return { quota, level: fig.messages >= 100 ? 'heavy' : fig.messages >= 20 ? 'medium' : 'light' };
}

/** Every account from both lists, joined by user id. */
export function usageRows(accounts: AdminAnalyticsAccount[] | undefined, figures: AccountFigures[]): UsageRow[] {
  const byId = new Map<string, UsageRow>();
  for (const who of accounts ?? []) byId.set(who.userId, { userId: who.userId, who, ...usageLevel(undefined) });
  for (const fig of figures) byId.set(fig.userId, { ...(byId.get(fig.userId) ?? { userId: fig.userId }), fig, ...usageLevel(fig) });
  return [...byId.values()];
}

/** A CSV cell that a spreadsheet will not run as a formula (names are typed by users). */
const cell = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function usageCsv(rows: UsageRow[], month: string, appDays: number): string {
  const head = ['month', 'public_id', 'display_name', 'plan', `app_active_days_${appDays}d`, `app_page_views_${appDays}d`, 'app_last_seen', 'ai_level', 'ai_requests',
    'gemini_requests', 'claude_requests', 'tokens_used', 'tokens_left', 'quota_used_pct', 'ai_cost_thb', 'ai_cost_usd', 'paid_thb', 'stripe_fee_thb', 'contribution_thb',
    'items_prepared', 'items_confirmed', 'ai_cost_per_confirmed_thb'];
  const baht = (satang: number | null | undefined) => (satang === null || satang === undefined ? null : (satang / 100).toFixed(2));
  const lines = rows.map(({ who, fig, quota, level }) => [month, who?.publicId ?? '', who?.displayName ?? '', fig?.plan ?? who?.planStatus ?? '', who?.activeDays ?? null, who?.pageViews ?? null,
    who?.lastSeenAt ?? '', level, fig?.messages ?? 0, fig?.geminiMessages ?? 0, fig?.claudeMessages ?? 0, fig?.krarokTokens ?? 0, fig?.krarokTokensLeft ?? null, quota,
    baht(fig ? fig.ai : 0), fig ? (fig.aiUsd / 1_000_000).toFixed(6) : '0.000000', baht(fig?.cashRevenue ?? 0), baht(fig?.fee ?? null),
    fig?.plan === 'paid' ? baht(fig.allocatedContribution) : null, fig?.cardsPrepared ?? 0, fig?.cardsConfirmed ?? 0, baht(fig?.costPerConfirmed ?? null)].map(cell).join(','));
  // A byte-order mark so that Excel reads Thai names correctly.
  return `﻿${[head.join(','), ...lines].join('\r\n')}\r\n`;
}


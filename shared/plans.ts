// Free / Plus / Pro (owner, 2026-11-15, after the pricing talk: "ทำ 3 แพ็กเกจ ... ฟรี 100 โทเค็น ... 650 โทเค็น ... 1,650
// โทเค็นก็ 169 บาท", then Plus at ฿99 with "เก็บไฟล์ได้สักแบบ 50 ไฟล์" and "อยากให้มันมีแจ้งเตือน ... ส่งงาน ... รับเงิน").
// What each plan gives, in one place: every check on the server and every screen reads it from here.
//
//   Free   เลขา on the monthly free allowance (FREE_MONTHLY_TOKENS, 100 a month, refilled on the 1st), 10 new documents a
//          month, 5 files in the vault, no reminders.
//   Plus   ฿99 a month (charged ฿115 with the card fee): 650 tokens a month, 30 new documents a month, 50 files, the
//          08:00 reminders (work to deliver and money due, LINE and email). Monthly only.
//   Pro    ฿169 a month from 1 Dec 2569 (฿159 until 30 Nov): 1,650 tokens, documents and files without limit, every
//          reminder (also the monthly summary, 50 ทวิ and tax season), reports and the tax page.
// A trial, an owner's grant and the staging owner count as Pro, as before.

import { VAULT_FREE_FILES, VAULT_MAX_FILES } from './vault.js';

export type PlanTier = 'free' | 'plus' | 'pro';
export type PaidTier = Exclude<PlanTier, 'free'>;
export const PAID_TIERS: readonly PaidTier[] = ['plus', 'pro'];
export const isPaidTier = (value: unknown): value is PaidTier => value === 'plus' || value === 'pro';

/** The name each plan has on screen. */
export const PLAN_NAMES: Record<PlanTier, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' };

export interface PlanLimits {
  /** Krarok Tokens a month for เลขา (Free: the server's FREE_MONTHLY_TOKENS; null here). */
  tokens: number | null;
  /** New documents a month; null = no limit. */
  documentsPerMonth: number | null;
  /** Files kept in the vault. */
  vaultFiles: number;
  /** The 08:00 reminders: work to deliver and money due (LINE and email). */
  dailyReminders: boolean;
  /** The monthly summary email/LINE card, the 50 ทวิ follow-up and the tax-season reminder. */
  proReminders: boolean;
  /** Reports and the tax page. */
  proPages: boolean;
}

export const PLAN_LIMITS: Readonly<Record<PlanTier, PlanLimits>> = {
  free: { tokens: null, documentsPerMonth: 10, vaultFiles: VAULT_FREE_FILES, dailyReminders: false, proReminders: false, proPages: false },
  plus: { tokens: 650, documentsPerMonth: 30, vaultFiles: 50, dailyReminders: true, proReminders: false, proPages: false },
  pro: { tokens: 1650, documentsPerMonth: null, vaultFiles: VAULT_MAX_FILES, dailyReminders: true, proReminders: true, proPages: true },
};

/** The paid plan a subscription row names: 'plus_prepaid' / 'plus_monthly' are Plus, every other paid plan is Pro. */
export function paidTierOfPlan(plan: string | null | undefined): PaidTier {
  return typeof plan === 'string' && plan.startsWith('plus_') ? 'plus' : 'pro';
}

/**
 * The plan an account has now, from its subscription row (the database names the plan: supabase cashflow_refresh_
 * effective_subscription), whether its trial is running, and whether it is the staging owner. The same rule as before
 * for who is paid (active, and an admin grant or an unexpired period); only which paid plan is new.
 */
export function planTierOf(input: {
  sub: { status?: string | null; plan?: string | null; current_period_end?: string | null } | null | undefined;
  trial?: boolean; owner?: boolean; now?: number;
}): PlanTier {
  const { sub, now = Date.now() } = input;
  if (input.owner) return 'pro';
  if (['admin_revoked', 'admin_removed'].includes(String(sub?.plan))) return 'free';
  if (input.trial) return 'pro';
  const active = ['active', 'trialing'].includes(String(sub?.status)) && (
    sub?.plan === 'admin_grant' || (!!sub?.current_period_end && new Date(sub.current_period_end).getTime() > now));
  return active ? paidTierOfPlan(sub?.plan) : 'free';
}

/** Whether a plan reaches another: Pro covers everything Plus has. */
export const tierAtLeast = (tier: PlanTier, wanted: PaidTier) => (wanted === 'plus' ? tier === 'plus' || tier === 'pro' : tier === 'pro');

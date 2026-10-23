import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type {
  AccountPersona,
  AccountPlanStatus,
  AdminAnalyticsAccount,
  AdminAnalyticsPayment,
  AdminAnalyticsSummary,
  AnalyticsRange,
} from '../../../shared/adminAnalytics.js';
import { USAGE_FEATURE_KEYS, type UsageFeatureKey } from '../../../shared/usageAnalytics.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sessionSecret } from '../config/env.js';
import { HttpError, withGuard } from '../http/guard.js';
import { systemRole } from '../repositories/roles.js';
import { rateLimit } from '../security/rateLimit.js';
import { requireUser } from '../security/session.js';
import { canViewAdminAnalytics } from '../security/adminAnalyticsAccess.js';
import { paymentPulse } from '../services/adminPaymentPulse.js';
import {
  analyticsPayments, type AnalyticsPaymentRow, type AnalyticsPromptPayRow, type AnalyticsInvoiceEvent,
  type AnalyticsBillingAccount, type AnalyticsPrepaidOrderRow, type AnalyticsCardCycleRow,
} from '../services/adminAnalyticsPayments.js';

const querySchema = z.object({ range: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30) });
const DAY_MS = 86_400_000;
const TRIAL_DAYS = 14;

type ProfileRow = { user_id: string; public_id: string; display_name: string; created_at: string };
type SubscriptionRow = AnalyticsBillingAccount & { status: string; plan: string | null; current_period_end: string | null };
type PaymentRow = AnalyticsPaymentRow;
type UsageRow = { usage_date: string; user_key: string; user_id?: string | null; feature_key: UsageFeatureKey; view_count: number; last_seen_at: string };
type SettingsRow = { user_id: string; data: Record<string, unknown> | null };

async function loadAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const result = await fetchPage(from, from + 999);
    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error('Analytics data exceeds the complete-report limit');
}

function bangkokDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function personaOf(data: Record<string, unknown> | null | undefined): AccountPersona {
  const value = data?.userPersona;
  return value === 'school' || value === 'university' || value === 'freelance' || value === 'employee'
    ? value
    : 'unknown';
}

function jobTypesOf(data: Record<string, unknown> | null | undefined): string[] {
  return Array.isArray(data?.profileJobTypes)
    ? data.profileJobTypes.filter((value): value is string => typeof value === 'string').slice(0, 8)
    : [];
}

function planStatusOf(profile: ProfileRow, subscription: SubscriptionRow | undefined, now: number): AccountPlanStatus {
  if (subscription?.status === 'active' && subscription.plan === 'admin_grant') return 'admin';
  if (subscription?.status === 'active' && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > now) return 'pro';
  if (subscription && (['admin_revoked', 'admin_removed'].includes(subscription.plan || '') || subscription.current_period_end)) return 'expired';
  if (new Date(profile.created_at).getTime() + TRIAL_DAYS * DAY_MS > now) return 'trial';
  return 'free';
}

export default withGuard(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  const user = await requireUser(req, res);
  if (req.headers['x-account-id'] !== user.id) throw new HttpError(401, 'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  if (!canViewAdminAnalytics(user, await systemRole(user.id))) {
    throw new HttpError(403, 'หน้านี้เข้าถึงได้เฉพาะเจ้าของระบบเท่านั้น');
  }
  if (req.query.pulse === '1') {
    // Live revenue (owner, 2026-10-22): the page asks every 15 seconds while it is open.
    await rateLimit('admin-analytics-pulse', user.id, 20, 60);
    res.json({ signature: await paymentPulse(getSupabaseAdmin()), checkedAt: new Date().toISOString() });
    return;
  }
  await rateLimit('admin-analytics', user.id, 30, 60);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'ช่วงเวลาสถิติไม่ถูกต้อง');

  const range = parsed.data.range as AnalyticsRange;
  const today = bangkokDate(new Date());
  const fromDate = shiftDate(today, -(range - 1));
  const previousFrom = shiftDate(fromDate, -range);
  const previousTo = shiftDate(fromDate, -1);
  const db = getSupabaseAdmin();
  // Taken before the data is read, so a payment landing during the read is caught by the next pulse.
  const liveSignature = await paymentPulse(db).catch(() => undefined);

  const [profiles, subscriptions, legacyPayments, usage, settings, promptPayPayments, invoiceEvents, prepaid, cardCycles] = await Promise.all([
    loadAll<ProfileRow>((from, to) => db.from('cashflow_profiles').select('user_id,public_id,display_name,created_at').order('created_at', { ascending: false }).range(from, to) as never),
    loadAll<SubscriptionRow>((from, to) => db.from('subscriptions').select('user_id,status,plan,current_period_end,stripe_customer_id,stripe_livemode').order('updated_at', { ascending: false }).range(from, to) as never),
    loadAll<PaymentRow>((from, to) => db.from('cashflow_payments').select('payment_id,user_id,amount,currency,paid_at,refunded').order('paid_at', { ascending: false }).range(from, to) as never),
    loadAll<UsageRow>((from, to) => db.from('cashflow_usage_daily').select('usage_date,user_key,feature_key,view_count,last_seen_at').gte('usage_date', previousFrom).lte('usage_date', today).order('usage_date', { ascending: false }).range(from, to) as never),
    loadAll<SettingsRow>((from, to) => db.from('cashflow_documents').select('user_id,data').eq('id', 'settings').range(from, to) as never),
    loadAll<AnalyticsPromptPayRow>((from, to) => db.from('cashflow_promptpay_payments').select('payment_intent_id,user_id,amount,currency,paid_at,refunded,livemode').eq('livemode', true).order('paid_at', { ascending: false }).range(from, to) as never),
    loadAll<AnalyticsInvoiceEvent>((from, to) => db.from('cashflow_stripe_events').select('object_id,livemode').eq('object_kind', 'invoice').eq('event_type', 'invoice.paid').eq('livemode', true).order('event_created', { ascending: false }).range(from, to) as never),
    loadAll<AnalyticsPrepaidOrderRow>((from, to) => db.from('cashflow_prepaid_orders').select('payment_id,user_id,amount,paid_at,status,livemode').eq('livemode', true).in('status', ['paid', 'refunded']).order('paid_at', { ascending: false }).range(from, to) as never),
    loadAll<AnalyticsCardCycleRow>((from, to) => db.from('cashflow_card_cycles').select('invoice_id,payment_id,user_id,refunded,cashflow_prepaid_orders!inner(livemode)').eq('cashflow_prepaid_orders.livemode', true).order('period_start', { ascending: false }).range(from, to) as never),
  ]);
  const payments = await analyticsPayments(legacyPayments, promptPayPayments, invoiceEvents, subscriptions, { prepaid, cardCycles });

  const now = Date.now();
  const profilesById = new Map(profiles.map(profile => [profile.user_id, profile] as const));
  const userIdByUsageKey = new Map(profiles.map(profile => [
    createHmac('sha256', sessionSecret()).update(`usage:${profile.user_id}`).digest('hex'),
    profile.user_id,
  ] as const));
  for (const row of usage) row.user_id = userIdByUsageKey.get(row.user_key) || null;
  const subscriptionById = new Map(subscriptions.map(subscription => [subscription.user_id, subscription] as const));
  const settingsById = new Map(settings.map(setting => [setting.user_id, setting.data] as const));
  const statusById = new Map(profiles.map(profile => [profile.user_id, planStatusOf(profile, subscriptionById.get(profile.user_id), now)] as const));
  const isPro = (userId: string) => ['pro', 'admin'].includes(statusById.get(userId) || 'free');
  const currentUsage = usage.filter(row => row.usage_date >= fromDate && row.usage_date <= today);
  const previousUsage = usage.filter(row => row.usage_date >= previousFrom && row.usage_date <= previousTo);
  const paymentDate = (row: PaymentRow) => bangkokDate(new Date(row.paid_at));
  const currentPayments = payments.filter(row => paymentDate(row) >= fromDate && paymentDate(row) <= today && !row.refunded);
  const previousPayments = payments.filter(row => paymentDate(row) >= previousFrom && paymentDate(row) <= previousTo && !row.refunded);
  const activeIds = new Set(currentUsage.flatMap(row => row.user_id ? [row.user_id] : []));
  const previousActiveIds = new Set(previousUsage.flatMap(row => row.user_id ? [row.user_id] : []));
  const currentPayerIds = new Set(currentPayments.map(payment => payment.user_id));

  const usageByAccount = new Map<string, UsageRow[]>();
  for (const row of currentUsage) {
    if (!row.user_id) continue;
    const bucket = usageByAccount.get(row.user_id) || [];
    bucket.push(row);
    usageByAccount.set(row.user_id, bucket);
  }
  const paymentsByAccount = new Map<string, PaymentRow[]>();
  for (const row of payments) {
    const bucket = paymentsByAccount.get(row.user_id) || [];
    bucket.push(row);
    paymentsByAccount.set(row.user_id, bucket);
  }

  const accounts: AdminAnalyticsAccount[] = profiles.map(profile => {
    const accountUsage = usageByAccount.get(profile.user_id) || [];
    const accountPayments = paymentsByAccount.get(profile.user_id) || [];
    const paid = accountPayments.filter(payment => !payment.refunded);
    const featureViews = new Map<UsageFeatureKey, number>();
    for (const row of accountUsage) featureViews.set(row.feature_key, (featureViews.get(row.feature_key) || 0) + Number(row.view_count));
    const subscription = subscriptionById.get(profile.user_id);
    return {
      userId: profile.user_id,
      publicId: profile.public_id,
      displayName: profile.display_name,
      createdAt: profile.created_at,
      persona: personaOf(settingsById.get(profile.user_id)),
      jobTypes: jobTypesOf(settingsById.get(profile.user_id)),
      planStatus: statusById.get(profile.user_id) || 'free',
      plan: subscription?.plan || null,
      currentPeriodEnd: subscription?.current_period_end || null,
      totalSpent: paid.reduce((sum, payment) => sum + Number(payment.amount), 0),
      paymentCount: paid.length,
      lastPaymentAt: paid[0]?.paid_at || null,
      activeDays: new Set(accountUsage.map(row => row.usage_date)).size,
      pageViews: accountUsage.reduce((sum, row) => sum + Number(row.view_count), 0),
      lastSeenAt: accountUsage.reduce<string | null>((latest, row) => !latest || row.last_seen_at > latest ? row.last_seen_at : latest, null),
      topFeatures: [...featureViews.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, pageViews]) => ({ key, pageViews })),
    };
  }).sort((a, b) => (b.lastSeenAt || b.createdAt).localeCompare(a.lastSeenAt || a.createdAt));

  const featureMap = new Map<UsageFeatureKey, {
    key: UsageFeatureKey;
    activeUsers: Set<string>;
    pageViews: number;
    freeUsers: Set<string>;
    proUsers: Set<string>;
    freeViews: number;
    proViews: number;
  }>(USAGE_FEATURE_KEYS.map(key => [key, {
    key, activeUsers: new Set<string>(), pageViews: 0, freeUsers: new Set<string>(), proUsers: new Set<string>(), freeViews: 0, proViews: 0,
  }]));
  for (const row of currentUsage) {
    if (!row.user_id) continue;
    const feature = featureMap.get(row.feature_key);
    if (!feature) continue;
    const views = Number(row.view_count);
    feature.activeUsers.add(row.user_id);
    feature.pageViews += views;
    if (isPro(row.user_id)) { feature.proUsers.add(row.user_id); feature.proViews += views; }
    else { feature.freeUsers.add(row.user_id); feature.freeViews += views; }
  }
  const features = [...featureMap.values()].map(feature => ({
    key: feature.key, activeUsers: feature.activeUsers.size, pageViews: feature.pageViews,
    freeUsers: feature.freeUsers.size, proUsers: feature.proUsers.size, freeViews: feature.freeViews, proViews: feature.proViews,
  })).sort((a, b) => b.pageViews - a.pageViews);

  const personas: AdminAnalyticsSummary['personas'] = ['freelance', 'employee', 'university', 'school', 'unknown'].map(key => {
    const personaAccounts = accounts.filter(account => account.persona === key);
    const ids = new Set(personaAccounts.map(account => account.userId));
    return {
      key: key as AccountPersona,
      accounts: personaAccounts.length,
      activeUsers: personaAccounts.filter(account => account.activeDays > 0).length,
      proAccounts: personaAccounts.filter(account => ['pro', 'admin'].includes(account.planStatus)).length,
      revenue: currentPayments.filter(payment => ids.has(payment.user_id)).reduce((sum, payment) => sum + Number(payment.amount), 0),
    };
  });

  const daily: AdminAnalyticsSummary['daily'] = Array.from({ length: range }, (_, index) => {
    const date = shiftDate(fromDate, index);
    const dayUsage = currentUsage.filter(row => row.usage_date === date);
    const dayPayments = currentPayments.filter(row => paymentDate(row) === date);
    return {
      date,
      activeUsers: new Set(dayUsage.flatMap(row => row.user_id ? [row.user_id] : [])).size,
      pageViews: dayUsage.reduce((sum, row) => sum + Number(row.view_count), 0),
      revenue: dayPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      payments: dayPayments.length,
    };
  });

  const paymentHistory: AdminAnalyticsPayment[] = payments.slice(0, 200).map(payment => {
    const profile = profilesById.get(payment.user_id);
    return {
      id: payment.payment_id,
      userId: payment.user_id,
      publicId: profile?.public_id || '—',
      displayName: profile?.display_name || 'Unknown account',
      amount: Number(payment.amount),
      currency: payment.currency,
      paidAt: payment.paid_at,
      refunded: payment.refunded,
    };
  });

  const proAccounts = accounts.filter(account => ['pro', 'admin'].includes(account.planStatus)).length;
  const paidProAccounts = accounts.filter(account => account.planStatus === 'pro').length;
  const revenue = currentPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const result: AdminAnalyticsSummary = {
    range, fromDate, toDate: today, generatedAt: new Date().toISOString(), ...(liveSignature ? { liveSignature } : {}),
    totals: {
      accounts: accounts.length,
      newAccounts: profiles.filter(profile => {
        const date = bangkokDate(new Date(profile.created_at));
        return date >= fromDate && date <= today;
      }).length,
      activeUsers: activeIds.size,
      previousActiveUsers: previousActiveIds.size,
      pageViews: currentUsage.reduce((sum, row) => sum + Number(row.view_count), 0),
      proAccounts,
      paidProAccounts,
      trialAccounts: accounts.filter(account => account.planStatus === 'trial').length,
      freeAccounts: accounts.filter(account => ['free', 'expired'].includes(account.planStatus)).length,
      revenue,
      previousRevenue: previousPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
      paymentCount: currentPayments.length,
      conversionRate: accounts.length ? paidProAccounts / accounts.length : 0,
      averageRevenuePerPayer: currentPayerIds.size ? revenue / currentPayerIds.size : 0,
    },
    daily, features, personas, accounts, payments: paymentHistory,
  };
  res.json(result);
});

// Krarok monthly profit report for the owner (brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25).
//
// Every figure is worked out here by code from records, never by a model: money in satang and AI cost in millionths of
// a dollar (integers, no floating-point sums). What is not known is marked, never shown as 0. The report covers one
// Bangkok calendar month [1st 00:00, next 1st 00:00). LINE gets business totals only; per-account figures stay in the
// database for the owner (database/profit_report_accounts.sql).
//
// Money in   Stripe balance transactions (gross, refunds, fees), per payment from the app's verified payments
//            (adminAnalyticsPayments), fees per payment from Stripe charges.
// AI cost    cashflow_ai_usage through cashflow_admin_ai_month (SQL), split into the account's own use and the
//            platform's share (the shared prompt cache written for everyone, failed attempts the app pays).
// Fixed      cashflow_admin_cost_settings, which the owner edits.
import { STRIPE_TH_CARD_FEE } from '../../../shared/proPricing.js';
import type { AccountFigures, AiAccountRow, AiMonth, Change, Completeness, ReportMetrics } from '../../../shared/adminProfit.js';
export type { AccountFigures, AiAccountRow, AiMonth, Change, Completeness, ReportMetrics };

const DAY_MS = 86_400_000;
const BANGKOK_MS = 7 * 3600_000;

// ---------- months ----------
export interface MonthWindow { month: string; start: Date; end: Date }
/** "2026-10" → 1 Oct 2569 00:00 Bangkok up to (not including) 1 Nov 00:00. */
export function monthWindow(month: string): MonthWindow {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid report month');
  const [year, mon] = month.split('-').map(Number);
  return { month, start: new Date(Date.UTC(year, mon - 1, 1) - BANGKOK_MS), end: new Date(Date.UTC(year, mon, 1) - BANGKOK_MS) };
}
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** The Bangkok month of an instant. */
export function bangkokMonth(at: Date): string {
  const local = new Date(at.getTime() + BANGKOK_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const bangkokDay = (at: Date) => new Date(at.getTime() + BANGKOK_MS).getUTCDate();
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiMonth = (month: string) => `${THAI_MONTHS[Number(month.slice(5, 7)) - 1]} ${Number(month.slice(0, 4)) + 543}`;

// ---------- exact amounts ----------
/** "0.123456" (numeric text from Postgres) → 123456 millionths of a dollar, without going through a float. */
export function microUsd(text: string | number | null | undefined): number {
  if (text === null || text === undefined || text === '') return 0;
  const value = String(text).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Invalid amount');
  const fraction = (match[3] ?? '').padEnd(6, '0');
  const extra = fraction.slice(6);
  let micro = Number(match[2]) * 1_000_000 + Number(fraction.slice(0, 6));
  if (extra && Number(extra[0]) >= 5) micro += 1;
  if (!Number.isSafeInteger(micro)) throw new Error('Amount out of range');
  return match[1] ? -micro : micro;
}
/** Baht text ("33.5", "750.0000") → baht × 10,000, exactly. */
function tenThousandths(text: string | number): number {
  const value = String(text).trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error('Invalid setting amount');
  return Number(match[1]) * 10_000 + Number((match[2] ?? '').padEnd(4, '0').slice(0, 4));
}
/** Dollars (millionths) to satang at a rate in baht per dollar × 10,000: rounded once, half up. */
export function satangFromMicroUsd(micro: number, rate4: number): number {
  const product = BigInt(micro) * BigInt(rate4); // 1e-6 USD × 1e-4 THB/USD = 1e-10 THB = 1e-8 satang
  const divisor = 100_000_000n;
  const sign = product < 0n ? -1n : 1n;
  const abs = product < 0n ? -product : product;
  return Number(sign * ((abs + divisor / 2n) / divisor));
}
const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);
/** Percent of a whole, in basis points (1% = 100), or null when there is no whole. */
const basisPoints = (part: number, whole: number) => (whole > 0 ? Math.round(part * 10_000 / whole) : null);

/** Stripe's published domestic-card fee with VAT, in satang: an estimate for a payment Stripe's records did not cover. */
export function estimatedCardFeeSatang(amountSatang: number): number {
  const fee = amountSatang * STRIPE_TH_CARD_FEE.percent / 100 + STRIPE_TH_CARD_FEE.fixedBaht * 100;
  return Math.round(fee * (100 + STRIPE_TH_CARD_FEE.vatPercent) / 100);
}

// ---------- settings ----------
export interface CostSettingRow { key: string; kind: 'fixed_monthly' | 'fixed_yearly' | 'fx_usd_thb'; label: string; amount: string | number; active: boolean }
export interface CostSettings {
  /** Baht per US dollar × 10,000, or null when the owner has not set a rate. */
  rate4: number | null;
  fixedMonthlySatang: number;
  items: { key: string; label: string; kind: string; monthlySatang: number }[];
}
export function costSettings(rows: CostSettingRow[]): CostSettings {
  const active = rows.filter(row => row.active);
  const rate = active.find(row => row.kind === 'fx_usd_thb');
  const items = active.filter(row => row.kind !== 'fx_usd_thb').map(row => {
    const satang10k = tenThousandths(row.amount) * 100; // baht × 10,000 × 100 = satang × 10,000
    return { key: row.key, label: row.label, kind: row.kind, monthlySatang: Math.round(satang10k / (row.kind === 'fixed_yearly' ? 12 : 1) / 10_000) };
  });
  const rate4 = rate ? tenThousandths(rate.amount) : null;
  return { rate4: rate4 && rate4 > 0 ? rate4 : null, fixedMonthlySatang: items.reduce((sum, item) => sum + item.monthlySatang, 0), items };
}

/**
 * Costs the business may have whose real amount is not known yet (owner's Master Backlog, Part 4.4, 2026-10-25). Until
 * the owner adds a row for one in cashflow_admin_cost_settings (0 is a known amount), the report names it as not known
 * and the profit is said to be before it; it is never filled in as 0.
 */
export const EXPECTED_COSTS: readonly { key: string; label: string }[] = [
  { key: 'cloudflare', label: 'Cloudflare' }, { key: 'supabase', label: 'Supabase' }, { key: 'line_oa', label: 'LINE OA' }, { key: 'storage', label: 'พื้นที่เก็บไฟล์' },
];

// ---------- inputs ----------
/** A verified payment with the service period it bought (all months, so a 6-month plan counts in each month it covers). */
export interface PaidPeriod { paymentId: string; userId: string; amountSatang: number; paidAt: string; start: string; end: string; refunded: boolean }
export interface StripeMonth {
  status: 'ready' | 'unavailable' | 'not_live';
  /** Balance transactions in the month, Thai baht (satang). */
  totals?: { gross: number; refunds: number; fees: number; net: number; payments: number; otherCurrencies: boolean;
    /** Card charges that failed in the month (Thai baht), when charges could be read. */
    failed?: { count: number; amount: number } };
  /** Per payment (PaymentIntent id): Stripe's own fee, when charges could be read. */
  feeByPayment?: Map<string, number>;
  /** Per payment: what was refunded in this month. */
  refundByPayment?: Map<string, number>;
  error?: string;
}
export interface MembersInput {
  profiles: { user_id: string; created_at: string }[];
  /** accounts on an admin grant now (not paying). */
  granted: string[];
  /** card renewals set to stop at the end of the paid period. */
  cancelling: number;
  admins: string[];
  inTrial: (createdAt: string, at: number) => boolean;
}
export interface ReportInput {
  window: MonthWindow;
  ai: AiMonth | null;
  aiError?: string;
  periods: PaidPeriod[] | null;
  paymentsError?: string;
  stripe: StripeMonth;
  settings: CostSettings;
  members: MembersInput;
  /** The report's own AI notes written during this month (platform overhead), millionths of a dollar. */
  reportNotesUsd: number;
  previous: ReportMetrics | null;
  generatedAt: Date;
  /** Answers the confidentiality check changed this month (routing.guard), or null when they could not be counted. */
  confidentialBlocked?: number | null;
  /** Tokens a month by the plan each account paid for at the month's end (shared/proTokens.ts); others use the default. */
  tokenLimits?: Map<string, number>;
  /** The trial's allowance, so a trial cycle is never given a plan's. */
  trialTokens?: number;
}

// ---------- output ----------

const worst = (...states: Completeness[]): Completeness =>
  (['FAILED', 'UNRECONCILED', 'PARTIAL', 'COMPLETE'] as const).find(state => states.includes(state)) ?? 'COMPLETE';
function change(current: number | null, previous: number | null | undefined): Change {
  if (current === null || previous === null || previous === undefined) return { current, previous: previous ?? null, change: null, percentBp: null, kind: 'none' };
  if (previous === 0) return { current, previous, change: current, percentBp: null, kind: current === 0 ? 'same' : 'new' };
  return { current, previous, change: current - previous, percentBp: Math.round((current - previous) * 10_000 / Math.abs(previous)), kind: 'compare' };
}
function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}
const overlapMs = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/** The whole report from its records. Pure: the same records always give the same report. */
export function computeReport(input: ReportInput): { metrics: ReportMetrics; accounts: AccountFigures[] } {
  const { window, ai, periods, stripe, settings, members } = input;
  const start = window.start.getTime();
  const end = window.end.getTime();
  const notes = { revenue: [] as string[], ai: [] as string[], profit: [] as string[], comparison: [] as string[] };
  const rate = settings.rate4;
  const thb = (micro: number) => (rate === null ? null : satangFromMicroUsd(micro, rate));

  // ---- members, from what was paid (an admin grant is not a paying member) ----
  const admins = new Set(members.admins);
  const granted = new Set(members.granted);
  const valid = (periods ?? []).filter(period => !period.refunded);
  const covers = (period: PaidPeriod, at: number) => Date.parse(period.start) <= at && at < Date.parse(period.end);
  const paidAtEnd = new Set(valid.filter(period => covers(period, end - 1)).map(period => period.userId));
  const firstPaid = new Map<string, number>();
  for (const period of valid) {
    const paid = Date.parse(period.paidAt);
    if (!firstPaid.has(period.userId) || paid < firstPaid.get(period.userId)!) firstPaid.set(period.userId, paid);
  }
  const newPaying = [...firstPaid.entries()].filter(([, at]) => at >= start && at < end).length;
  const paidDuring = new Set(valid.filter(period => overlapMs(Date.parse(period.start), Date.parse(period.end), start, end) > 0).map(period => period.userId));
  const ended = [...paidDuring].filter(id => !paidAtEnd.has(id)).length;
  const trials = members.profiles.filter(profile => !paidAtEnd.has(profile.user_id) && !granted.has(profile.user_id) && !admins.has(profile.user_id)
    && members.inTrial(profile.created_at, end - 1)).length;
  const trialIds = new Set(members.profiles.filter(profile => members.inTrial(profile.created_at, end - 1)).map(profile => profile.user_id));
  const planOf = (userId: string): AccountFigures['plan'] => admins.has(userId) ? 'admin' : paidAtEnd.has(userId) ? 'paid' : granted.has(userId) ? 'granted'
    : trialIds.has(userId) ? 'trial' : 'free';

  // ---- money in ----
  const inMonth = (periods ?? []).filter(period => { const at = Date.parse(period.paidAt); return at >= start && at < end; });
  const appGross = periods ? inMonth.reduce((sum, period) => sum + period.amountSatang, 0) : null;
  const payers = new Set(inMonth.filter(period => !period.refunded).map(period => period.userId));
  let gross: number | null = null; let refunds: number | null = null; let fees: number | null = null;
  let feesSource: ReportMetrics['revenue']['feesSource'] = null; let stripeGross: number | null = null; let difference: number | null = null;
  let revenueStatus: Completeness = 'COMPLETE';
  if (stripe.status === 'ready' && stripe.totals) {
    stripeGross = stripe.totals.gross; gross = stripe.totals.gross; refunds = stripe.totals.refunds; fees = stripe.totals.fees; feesSource = 'stripe';
    if (stripe.totals.otherCurrencies) { revenueStatus = 'UNRECONCILED'; notes.revenue.push('Stripe มีรายการสกุลเงินอื่นที่ไม่ได้นับรวม'); }
    if (appGross !== null && appGross !== stripe.totals.gross) {
      difference = stripe.totals.gross - appGross; revenueStatus = 'UNRECONCILED';
      notes.revenue.push('ยอดรับชำระในแอปกับ Stripe ไม่ตรงกัน');
    }
    if (appGross === null) { revenueStatus = worst(revenueStatus, 'PARTIAL'); notes.revenue.push(`อ่านรายการชำระในแอปไม่ได้ (${input.paymentsError ?? 'ไม่ทราบสาเหตุ'})`); }
  } else if (appGross !== null) {
    // Without Stripe's records: the app's verified payments, refunds as flagged, fees estimated and labelled so.
    gross = appGross;
    refunds = inMonth.filter(period => period.refunded).reduce((sum, period) => sum + period.amountSatang, 0);
    fees = inMonth.reduce((sum, period) => sum + estimatedCardFeeSatang(period.amountSatang), 0); feesSource = 'estimate';
    revenueStatus = 'PARTIAL';
    notes.revenue.push(stripe.status === 'not_live' ? 'Stripe อยู่ในโหมดทดสอบ จึงใช้รายการในแอป' : 'อ่านข้อมูล Stripe ไม่ได้ จึงใช้รายการในแอป และค่าธรรมเนียมเป็นค่าประมาณ');
  } else {
    revenueStatus = 'FAILED'; notes.revenue.push('อ่านข้อมูลรายรับไม่ได้ทั้งจาก Stripe และในแอป');
  }
  const net = gross !== null && refunds !== null ? gross - refunds : null;
  // Earned (service-period) revenue: each payment spread over the days it bought, this month's share.
  const earned = periods ? valid.reduce((sum, period) => {
    const s = Date.parse(period.start); const e = Date.parse(period.end);
    return e > s ? sum + Math.round(period.amountSatang * overlapMs(s, e, start, end) / (e - s)) : sum;
  }, 0) : null;

  // ---- AI ----
  const rows = ai?.accounts ?? [];
  const usd = { total: 0, gemini: 0, claude: 0, other: 0, platform: 0, cacheShared: 0, failedAttempts: 0, reportNotes: input.reportNotesUsd, direct: 0, quotaOverrun: 0, cacheSaved: 0 };
  for (const row of rows) {
    usd.total += microUsd(row.actual_usd); usd.gemini += microUsd(row.gemini_usd); usd.claude += microUsd(row.claude_usd); usd.other += microUsd(row.other_usd);
    usd.cacheShared += microUsd(row.cache_overhead_usd); usd.failedAttempts += microUsd(row.failed_attempt_usd);
    usd.quotaOverrun += microUsd(row.quota_overrun_usd); usd.cacheSaved += microUsd(row.cache_saved_usd);
  }
  // The platform pays the shared cache, failed attempts and the report's own notes; the rest is each account's own use.
  usd.platform = usd.cacheShared + usd.failedAttempts + usd.reportNotes;
  usd.direct = usd.total - usd.cacheShared - usd.failedAttempts;
  const totalUsd = usd.total + usd.reportNotes;
  let aiStatus: Completeness = ai ? 'COMPLETE' : 'FAILED';
  if (!ai) notes.ai.push(`อ่านข้อมูลค่า AI ไม่ได้ (${input.aiError ?? 'ไม่ทราบสาเหตุ'})`);
  if (ai && rate === null) { aiStatus = 'PARTIAL'; notes.ai.push('ยังไม่ได้ตั้งอัตราแลกเปลี่ยน จึงแสดงค่า AI เป็นดอลลาร์เท่านั้น'); }
  if (ai && microUsd(ai.coverage.cost_without_split_usd) > 0) {
    aiStatus = worst(aiStatus, 'PARTIAL');
    notes.ai.push('บางรายการไม่มีการแยกค่าระบบส่วนกลาง จึงนับเป็นการใช้ของบัญชีนั้นทั้งหมด');
  }
  if (usd.gemini + usd.claude + usd.other !== usd.total && ai) {
    aiStatus = worst(aiStatus, 'UNRECONCILED');
    notes.ai.push('ยอดแยกตามโมเดลไม่เท่ากับยอดรวม');
  }

  // ---- per account ----
  const feeOf = (period: PaidPeriod): { fee: number; source: 'stripe' | 'estimate' } => {
    const known = stripe.feeByPayment?.get(period.paymentId);
    return known !== undefined ? { fee: known, source: 'stripe' } : { fee: estimatedCardFeeSatang(period.amountSatang), source: 'estimate' };
  };
  const ids = new Set<string>([...rows.map(row => row.user_id), ...inMonth.map(period => period.userId), ...paidAtEnd]);
  const payingThisMonth = [...ids].filter(id => (planOf(id) === 'paid' || payers.has(id)) && !admins.has(id));
  const platformThb = ai ? thb(usd.platform) : null;
  const share = platformThb !== null && payingThisMonth.length ? Math.round(platformThb / payingThisMonth.length) : null;
  const accounts: AccountFigures[] = [...ids].sort().map(userId => {
    const row = rows.find(item => item.user_id === userId);
    const own = inMonth.filter(period => period.userId === userId);
    const cashRevenue = own.reduce((sum, period) => sum + period.amountSatang, 0);
    // Refunds made this month, also of an earlier month's payment (Stripe's records); without them, this month's payments marked refunded.
    const refundsOwn = stripe.refundByPayment
      ? (periods ?? []).filter(period => period.userId === userId).reduce((sum, period) => sum + (stripe.refundByPayment!.get(period.paymentId) ?? 0), 0)
      : own.filter(period => period.refunded).reduce((sum, period) => sum + period.amountSatang, 0);
    const feesOwn = own.map(feeOf);
    const fee = feesOwn.length ? feesOwn.reduce((sum, item) => sum + item.fee, 0) : 0;
    const feeSource = feesOwn.length ? (feesOwn.every(item => item.source === 'stripe') ? 'stripe' : 'estimate') : null;
    const earnedOwn = valid.filter(period => period.userId === userId).reduce((sum, period) => {
      const s = Date.parse(period.start); const e = Date.parse(period.end);
      return e > s ? sum + Math.round(period.amountSatang * overlapMs(s, e, start, end) / (e - s)) : sum;
    }, 0);
    const aiUsd = row ? microUsd(row.actual_usd) : 0;
    const ownPlatformUsd = row ? microUsd(row.cache_overhead_usd) + microUsd(row.failed_attempt_usd) : 0;
    const directUsd = aiUsd - ownPlatformUsd;
    const directAi = thb(directUsd);
    const paying = payingThisMonth.includes(userId);
    const contribution = directAi === null ? null : cashRevenue - refundsOwn - fee - directAi;
    // The allowance of the plan paid for (a trial cycle keeps the trial's); the database only knows the default one.
    const planLimit = input.tokenLimits?.get(userId);
    // Admins have the default Pro allowance since 2026-10-27 (ai/service.ts allowance), so their tokens left show too.
    const limit = row?.latest_cycle_limit === null || row?.latest_cycle_limit === undefined ? null
      : planLimit !== undefined && row.latest_cycle_limit !== input.trialTokens ? planLimit : row.latest_cycle_limit;
    const left = limit === null ? null : Math.max(0, limit - (row?.latest_cycle_used ?? 0));
    const usedUp = (row?.tokens_used_up ?? false) || (limit !== null && (row?.latest_cycle_used ?? 0) >= limit);
    return {
      userId, plan: planOf(userId), cashRevenue, refunds: refundsOwn, fee: own.length ? fee : 0, feeSource, earnedRevenue: earnedOwn,
      messages: row?.messages ?? 0, geminiMessages: row?.gemini_messages ?? 0, claudeMessages: row?.claude_messages ?? 0, failedRequests: row?.failed_requests ?? 0,
      inputTokens: row?.input_tokens ?? 0, outputTokens: row?.output_tokens ?? 0, cacheReadTokens: row?.cache_read_tokens ?? 0, cacheWriteTokens: row?.cache_write_tokens ?? 0,
      krarokTokens: row?.krarok_tokens ?? 0, krarokTokensLeft: left, tokensUsedUp: usedUp,
      aiUsd, directUsd, ownPlatformUsd, retryUsd: row ? microUsd(row.failed_attempt_usd) : 0, escalatedUsd: row ? microUsd(row.escalated_usd) : 0,
      billableUsd: row ? microUsd(row.billable_usd) : 0,
      ai: thb(aiUsd), directAi, allocatedPlatform: paying ? share : null,
      contribution, allocatedContribution: contribution !== null && paying && share !== null ? contribution - share : contribution,
      earnedContribution: directAi === null ? null : earnedOwn - fee - directAi,
      cardsPrepared: row?.cards_prepared ?? 0, cardsConfirmed: row?.cards_confirmed ?? 0,
      costPerConfirmed: row && row.cards_confirmed > 0 && directAi !== null ? Math.round(thb(aiUsd)! / row.cards_confirmed) : null,
    };
  });

  const paidRows = accounts.filter(account => account.plan === 'paid');
  const activeRows = accounts.filter(account => account.messages > 0 && account.plan !== 'admin');
  const aiSorted = activeRows.map(account => account.ai).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const requests = rows.reduce((sum, row) => sum + row.messages, 0);
  // Unknown AI cost (its records could not be read) stays unknown: never a profit without its AI cost.
  const totalThb = ai ? thb(totalUsd) : null;
  const prepared = rows.reduce((sum, row) => sum + row.cards_prepared, 0);
  const confirmed = rows.reduce((sum, row) => sum + row.cards_confirmed, 0);

  // ---- profit ----
  const fixed = settings.fixedMonthlySatang;
  const contribution = net !== null && fees !== null && totalThb !== null ? net - fees - totalThb : null;
  const operating = contribution !== null ? contribution - fixed : null;
  const perMember = contribution !== null && payingThisMonth.length ? contribution / payingThisMonth.length : null;
  const breakEven = perMember !== null && perMember >= 1 ? ceilDiv(fixed, Math.floor(perMember)) : null;
  const known = new Set(settings.items.map(item => item.key));
  const unknownCosts = EXPECTED_COSTS.filter(cost => !known.has(cost.key)).map(cost => cost.label);
  const profitStatus = worst(revenueStatus, aiStatus === 'FAILED' ? 'FAILED' : aiStatus, rate === null || unknownCosts.length ? 'PARTIAL' : 'COMPLETE');
  if (fixed === 0) notes.profit.push('ยังไม่มีค่าใช้จ่ายคงที่ในการตั้งค่า');
  if (unknownCosts.length) notes.profit.push(`กำไรยังไม่รวมค่าใช้จ่ายที่ยังไม่ทราบ: ${unknownCosts.join(', ')}`);
  notes.profit.push('กำไรนี้เป็นค่าประมาณก่อนภาษี ไม่ใช่กำไรทางบัญชี');

  // ---- comparison ----
  const prev = input.previous;
  if (!prev) notes.comparison.push('ยังไม่มีรายงานเดือนก่อนให้เทียบ');
  else if (prev.status !== 'COMPLETE') notes.comparison.push('ข้อมูลเดือนก่อนยังไม่ครบ ใช้เทียบอย่างระวัง');
  const comparisonStatus: Completeness = !prev ? 'PARTIAL' : prev.status === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL';

  // Both sources failed: nothing to report. One failed or partly read: PARTIAL. Totals that do not agree: UNRECONCILED.
  const status: Completeness = revenueStatus === 'FAILED' && aiStatus === 'FAILED' ? 'FAILED'
    : revenueStatus === 'UNRECONCILED' || aiStatus === 'UNRECONCILED' ? 'UNRECONCILED'
    : [revenueStatus, aiStatus].some(state => state === 'FAILED' || state === 'PARTIAL') ? 'PARTIAL' : 'COMPLETE';
  const metrics: ReportMetrics = {
    month: window.month, generatedAt: input.generatedAt.toISOString(), status,
    sections: { revenue: { status: revenueStatus, notes: notes.revenue }, ai: { status: aiStatus, notes: notes.ai }, profit: { status: profitStatus, notes: notes.profit }, comparison: { status: comparisonStatus, notes: notes.comparison } },
    members: { paidAtEnd: paidAtEnd.size, newPaying, ended, cancelling: members.cancelling, trials, granted: granted.size, payingThisMonth: payingThisMonth.length,
      total: members.profiles.length, signedUp: members.profiles.filter(profile => { const at = Date.parse(profile.created_at); return at >= start && at < end; }).length },
    revenue: { gross, refunds, net, fees, feesSource, payments: inMonth.length, appGross, stripeGross, difference, earned,
      failedPayments: stripe.status === 'ready' && stripe.totals?.failed ? stripe.totals.failed.count : null,
      failedAmount: stripe.status === 'ready' && stripe.totals?.failed ? stripe.totals.failed.amount : null },
    ai: {
      requests, failedRequests: rows.reduce((sum, row) => sum + row.failed_requests, 0), activeAccounts: rows.filter(row => row.messages > 0).length, usd,
      thb: rate === null || !ai ? null : { total: thb(totalUsd)!, gemini: thb(usd.gemini)!, claude: thb(usd.claude)!, platform: thb(usd.platform)!, direct: thb(usd.direct)! },
      perMessage: totalThb !== null && requests ? Math.round(totalThb / requests) : null,
      perPaidMember: totalThb !== null && paidRows.length ? Math.round(paidRows.reduce((sum, account) => sum + (account.ai ?? 0), 0) / paidRows.length) : null,
      perActiveAccount: totalThb !== null && activeRows.length ? Math.round(activeRows.reduce((sum, account) => sum + (account.ai ?? 0), 0) / activeRows.length) : null,
      accountMax: aiSorted.at(-1) ?? null, accountMedian: quantile(aiSorted, 0.5), accountP90: quantile(aiSorted, 0.9),
      usedUpAccounts: accounts.filter(account => account.tokensUsedUp).length,
      paidMembersWithoutAi: paidRows.filter(account => account.messages === 0).length,
      daysNearCap: ai?.days.near_cap ?? 0, daysAtCap: ai?.days.at_cap ?? 0, coverage: ai?.coverage ?? null,
    },
    quality: { prepared, confirmed, confirmRateBp: basisPoints(confirmed, prepared), corrections: rows.reduce((sum, row) => sum + row.corrections, 0),
      costPerConfirmed: totalThb !== null && confirmed ? Math.round(totalThb / confirmed) : null },
    feedback: {
      by_kind: ai?.feedback.by_kind ?? {}, top_questions: ai?.feedback.top_questions ?? [], requested_features: ai?.feedback.requested_features ?? [],
      unanswered: (ai?.feedback.by_kind.not_found ?? 0) + (ai?.feedback.by_kind.not_available ?? 0),
      requests: ai?.feedback.by_kind.feature_request ?? 0, wrongAnswers: ai?.feedback.by_kind.wrong_answer ?? 0,
    },
    reliability: { ...(ai?.reliability ?? { timeouts: 0, errors: 0, held_for_claude: 0, gemini_took_over: 0, escalations: 0, provider_retries: 0 }),
      geminiFailures: rows.reduce((sum, row) => sum + row.gemini_failed_calls, 0), claudeFailures: rows.reduce((sum, row) => sum + row.claude_failed_calls, 0),
      confidentialBlocked: input.confidentialBlocked ?? null },
    profit: { revenue: net, fees, ai: totalThb, platform: platformThb, fixed, contribution, operating, marginBp: operating !== null && net ? Math.round(operating * 10_000 / net) : null,
      breakEvenMembers: breakEven,
      positiveMembers: accounts.filter(account => account.plan === 'paid' && (account.allocatedContribution ?? 0) > 0).length,
      negativeMembers: accounts.filter(account => account.plan === 'paid' && account.allocatedContribution !== null && account.allocatedContribution < 0).length,
      unknownCosts },
    comparison: {
      gross: change(gross, prev?.revenue.gross), net: change(net, prev?.revenue.net), aiThb: change(totalThb, prev?.ai.thb?.total ?? null),
      contribution: change(contribution, prev?.profit.contribution), operating: change(operating, prev?.profit.operating),
      paidAtEnd: change(paidAtEnd.size, prev?.members.paidAtEnd), requests: change(requests, prev?.ai.requests),
    },
  };
  return { metrics, accounts };
}

// ---------- words ----------
/** ฿1,234 for amounts of ฿100 or more; ฿12.34 below, so small AI costs are not shown as ฿0. */
export function baht(satang: number | null): string {
  if (satang === null) return 'ยังไม่ทราบ';
  if (satang === 0) return '฿0';
  const sign = satang < 0 ? '−' : '';
  const abs = Math.abs(satang);
  return abs >= 10_000 ? `${sign}฿${Math.round(abs / 100).toLocaleString('en-US')}` : `${sign}฿${(abs / 100).toFixed(2)}`;
}
const percent = (bp: number | null) => (bp === null ? 'ยังไม่ทราบ' : `${(bp / 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`);
const count = (n: number) => n.toLocaleString('en-US');
/** A count that may not be known (an older report, or a source that could not be read): never shown as 0. */
const maybe = (n: number | null | undefined) => (n === null || n === undefined ? 'ยังไม่ทราบ' : count(n));
function changeText(item: Change): string {
  if (item.kind === 'none') return 'ไม่มีข้อมูลเทียบ';
  if (item.kind === 'new') return 'เริ่มมีในเดือนนี้';
  if (item.kind === 'same') return 'เท่าเดิม';
  const bp = item.percentBp!;
  return bp === 0 ? 'เท่าเดิม' : `${bp > 0 ? '+' : '−'}${percent(Math.abs(bp))}`;
}
const STATUS_TEXT: Record<Completeness, string> = {
  COMPLETE: 'ข้อมูลครบ', PARTIAL: 'ข้อมูลยังไม่ครบบางส่วน', UNRECONCILED: 'ยอดบางส่วนยังกระทบกันไม่ตรง', FAILED: 'อ่านข้อมูลไม่สำเร็จ',
};

/** The facts the note may use, one per line, with the same wording and numbers as the LINE message. */
export function reportFacts(m: ReportMetrics): string[] {
  const c = m.comparison;
  return [
    `บัญชีทั้งหมด ${maybe(m.members.total)} บัญชี สมัครใช้งานใหม่ ${maybe(m.members.signedUp)} บัญชี`,
    `สมาชิก Pro ณ สิ้นเดือน ${count(m.members.paidAtEnd)} คน สมัครใหม่ ${count(m.members.newPaying)} คน ไม่ต่ออายุ ${count(m.members.ended)} คน`,
    `รับชำระ ${baht(m.revenue.gross)} คืนเงิน ${baht(m.revenue.refunds)} ค่าธรรมเนียม ${baht(m.revenue.fees)} ชำระไม่สำเร็จ ${maybe(m.revenue.failedPayments)} รายการ`,
    `ค่า AI รวม ${baht(m.ai.thb?.total ?? null)} Gemini ${baht(m.ai.thb?.gemini ?? null)} Claude ${baht(m.ai.thb?.claude ?? null)} ค่าระบบส่วนกลาง ${baht(m.ai.thb?.platform ?? null)}`,
    `ข้อความ ${count(m.ai.requests)} จาก ${count(m.ai.activeAccounts)} บัญชี ค่า AI ต่อสมาชิก Pro ${baht(m.ai.perPaidMember)}`,
    `รายการที่เลขาเตรียม ${count(m.quality.prepared)} ยืนยัน ${count(m.quality.confirmed)} (${percent(m.quality.confirmRateBp)})`,
    `กำไรก่อนค่าใช้จ่ายคงที่ ${baht(m.profit.contribution)} กำไรประมาณ ${baht(m.profit.operating)} คุ้มทุนที่สมาชิก ${m.profit.breakEvenMembers === null ? 'ยังไม่ทราบ' : `${count(m.profit.breakEvenMembers)} คน`}`,
    `เทียบเดือนก่อน: รายได้ ${changeText(c.gross)} ค่า AI ${changeText(c.aiThb)} กำไร ${changeText(c.operating)} สมาชิก ${changeText(c.paidAtEnd)}`,
    `ตอบไม่ทัน ${count(m.reliability.timeouts)} ครั้ง Claude ล้มเหลว ${count(m.reliability.claudeFailures)} ครั้ง คำถามที่ตอบไม่ได้ ${count(m.feedback.unanswered)} ครั้ง`,
  ];
}

/** 1–2 sentences by code, used when no AI note is allowed or the AI's note did not pass the check. */
export function fallbackNote(m: ReportMetrics): string {
  const points: string[] = [];
  if (m.profit.operating !== null && m.profit.operating < 0) {
    points.push(m.profit.breakEvenMembers !== null ? `เดือนนี้ยังขาดทุน ต้องมีสมาชิก Pro ประมาณ ${count(m.profit.breakEvenMembers)} คนจึงคุ้มทุน` : 'เดือนนี้ยังขาดทุน');
  }
  const aiChange = m.comparison.aiThb;
  if (aiChange.kind === 'compare' && aiChange.percentBp !== null && Math.abs(aiChange.percentBp) >= 2_000) points.push(`ค่า AI ${changeText(aiChange)} จากเดือนก่อน`);
  if (m.profit.negativeMembers > 0) points.push(`มีสมาชิก ${count(m.profit.negativeMembers)} คนที่ค่า AI สูงกว่ารายได้สุทธิ`);
  if (m.status !== 'COMPLETE') points.push(STATUS_TEXT[m.status]);
  return points.length ? `${points.slice(0, 3).join(' · ')}` : 'ตัวเลขเดือนนี้ไม่มีรายการที่ต้องระวังเป็นพิเศษ';
}

/** The note may only use numbers the facts already say: anything else is treated as made up and the note is dropped. */
export function noteUsesOnlyFacts(note: string, facts: string[]): boolean {
  const known = new Set(facts.join('\n').match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []);
  return (note.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).every(value => known.has(value));
}

/** The LINE message: business totals only, never an account, a name or a chat. Formal Thai. */
export function lineReportText(m: ReportMetrics, note: string): string {
  const c = m.comparison;
  const lines = [
    `รายงานประจำเดือน ${thaiMonth(m.month)}`,
    `สถานะข้อมูล: ${STATUS_TEXT[m.status]}`,
    '',
    'รายได้',
    `• บัญชีทั้งหมด ${maybe(m.members.total)} บัญชี (สมัครใช้งานใหม่เดือนนี้ ${maybe(m.members.signedUp)})`,
    `• สมาชิก Pro ณ สิ้นเดือน ${count(m.members.paidAtEnd)} คน (ใหม่ ${count(m.members.newPaying)} · ไม่ต่ออายุ ${count(m.members.ended)} · ยกเลิกการต่ออายุไว้ ${count(m.members.cancelling)})`,
    `• ทดลองใช้ ${count(m.members.trials)} บัญชี · สิทธิ์ที่แอดมินให้ ${count(m.members.granted)} บัญชี`,
    `• รับชำระ ${baht(m.revenue.gross)} จาก ${count(m.revenue.payments)} รายการ · คืนเงิน ${baht(m.revenue.refunds)}`,
    `• ชำระไม่สำเร็จ ${maybe(m.revenue.failedPayments)} รายการ${m.revenue.failedAmount ? ` (${baht(m.revenue.failedAmount)})` : ''}`,
    `• ค่าธรรมเนียม Stripe ${baht(m.revenue.fees)}${m.revenue.feesSource === 'estimate' ? ' (ประมาณ)' : ''} · รับสุทธิ ${baht(m.revenue.net)}`,
    '',
    'ค่า AI',
    `• ${count(m.ai.requests)} ข้อความ จาก ${count(m.ai.activeAccounts)} บัญชี · ไม่สำเร็จ ${count(m.ai.failedRequests)}`,
    `• Gemini ${baht(m.ai.thb?.gemini ?? null)} · Claude ${baht(m.ai.thb?.claude ?? null)} · ค่าระบบส่วนกลาง ${baht(m.ai.thb?.platform ?? null)}`,
    `• รวม ${baht(m.ai.thb?.total ?? null)} ($${(((m.ai.usd.total + m.ai.usd.reportNotes) / 1_000_000)).toFixed(2)})`,
    `• เฉลี่ย ${baht(m.ai.perMessage)} ต่อข้อความ · ${baht(m.ai.perPaidMember)} ต่อสมาชิก Pro`,
    `• สูงสุดต่อบัญชี ${baht(m.ai.accountMax)} · โทเคนหมด ${count(m.ai.usedUpAccounts)} บัญชี · วันที่ใกล้เพดาน ${count(m.ai.daysNearCap)} วัน`,
    '',
    'คุณภาพของเลขา',
    `• เตรียมรายการ ${count(m.quality.prepared)} · ยืนยัน ${count(m.quality.confirmed)} (${percent(m.quality.confirmRateBp)})`,
    `• ผู้ใช้แก้ก่อนยืนยัน ${count(m.quality.corrections)} ครั้ง · ค่า AI ต่อรายการที่ยืนยัน ${baht(m.quality.costPerConfirmed)}`,
    '',
    'สิ่งที่ผู้ใช้ต้องการ',
    `• ตอบไม่ได้ ${count(m.feedback.unanswered)} · ขอฟีเจอร์ ${count(m.feedback.requests)} · แจ้งว่าตอบผิด ${count(m.feedback.wrongAnswers)}`,
    ...m.feedback.top_questions.slice(0, 5).map(item => `• “${item.question}” ${count(item.times)} ครั้ง`),
    '',
    'ความเสถียร',
    `• ตอบไม่ทัน ${count(m.reliability.timeouts)} · Gemini ล้มเหลว ${count(m.reliability.geminiFailures)} · Claude ล้มเหลว ${count(m.reliability.claudeFailures)}`,
    `• ส่งต่อให้ Claude ${count(m.reliability.escalations)} · Gemini ตอบแทน ${count(m.reliability.gemini_took_over)} · งานที่รอ Claude ${count(m.reliability.held_for_claude)}`,
    `• คำตอบที่ระบบกรองชื่อ AI หรือข้อมูลภายในออก ${maybe(m.reliability.confidentialBlocked)} ครั้ง`,
    '',
    'กำไร',
    `• รับสุทธิ ${baht(m.profit.revenue)} − ค่าธรรมเนียม ${baht(m.profit.fees)} − ค่า AI ${baht(m.profit.ai)} = ${baht(m.profit.contribution)}`,
    `• หักค่าใช้จ่ายคงที่ ${baht(m.profit.fixed)} → กำไรประมาณ ${baht(m.profit.operating)} (${percent(m.profit.marginBp)})`,
    ...(m.profit.unknownCosts?.length ? [`• ยังไม่รวม ${m.profit.unknownCosts.join(', ')} (ยังไม่ทราบตัวเลข)`] : []),
    `• คุ้มทุนที่สมาชิก ${m.profit.breakEvenMembers === null ? 'ยังคำนวณไม่ได้' : `${count(m.profit.breakEvenMembers)} คน`}`,
    `• เทียบเดือนก่อน: รายได้ ${changeText(c.gross)} · ค่า AI ${changeText(c.aiThb)} · กำไร ${changeText(c.operating)}`,
    '',
    `ควรดู: ${note}`,
  ];
  const caveats = [...m.sections.revenue.notes, ...m.sections.ai.notes].slice(0, 3);
  if (caveats.length) lines.push('', ...caveats.map(item => `หมายเหตุ: ${item}`));
  lines.push('', 'ตัวเลขรายบัญชีดูได้ใน Supabase เท่านั้น ไม่ส่งทาง LINE');
  return lines.join('\n').slice(0, 4900);
}

export const reportId = (month: string) => `monthly:${month}`;
export { DAY_MS };

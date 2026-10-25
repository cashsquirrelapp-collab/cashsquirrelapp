// Loading, saving and delivering the owner's monthly profit report (adminProfitReport.ts does the figures).
// Read only on business data: it reads payments, AI usage and settings, and writes only its own report row and the
// delivery claim. LINE gets totals only and goes to system admins who linked LINE.
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { inFreeTrial } from '../../../shared/trial.js';
import { costUsd } from '../ai/cost.js';
import type { AiConfig } from '../ai/config.js';
import { summarizeStripeTransactions } from './adminStripeFinance.js';
import { proTokenLimits } from './proTokens.js';
import {
  analyticsPayments, type AnalyticsCardCycleRow, type AnalyticsInvoiceEvent, type AnalyticsPaymentRow,
  type AnalyticsPrepaidOrderRow, type AnalyticsPromptPayRow,
} from './adminAnalyticsPayments.js';
import {
  computeReport, costSettings, fallbackNote, lineReportText, monthWindow, microUsd, noteUsesOnlyFacts, reportFacts, reportId, shiftMonth,
  type AccountFigures, type AiMonth, type CostSettingRow, type CostSettings, type MonthWindow, type PaidPeriod,
  type ReportMetrics, type StripeMonth,
} from './adminProfitReport.js';
import type { LineMessage } from './line.js';
import type { DeliveryOutcome } from './notificationOutcome.js';

type Db = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };
const PAGE = 1000;
const MAX_ROWS = 20_000;
const STRIPE_PAGES = 10;
const STRIPE_OPTIONS = { timeout: 8_000, maxNetworkRetries: 1 };
export const DELIVERY_DAYS = 3;

async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const result = await page(from, from + PAGE - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < PAGE) return rows;
  }
  throw new Error('Report data exceeds the complete-report limit');
}
const reason = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  return code === 'PGRST202' || code === '42883' ? 'ยังไม่ได้รัน SQL ของรายงาน' : code === '42P01' ? 'ยังไม่มีตารางที่ต้องใช้' : 'อ่านข้อมูลไม่สำเร็จ';
};

// ---------- settings ----------
export async function loadCostSettings(db: Db): Promise<{ rows: CostSettingRow[]; settings: CostSettings }> {
  const result = await db.from('cashflow_admin_cost_settings').select('key,kind,label,amount,active').order('key');
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as CostSettingRow[];
  return { rows, settings: costSettings(rows) };
}

// ---------- AI ----------
export async function loadAiMonth(db: Db, window: MonthWindow, config: Pick<AiConfig, 'dailyCostCapUsd' | 'proTokensPerCycle' | 'trialTokens'>): Promise<AiMonth> {
  const result = await db.rpc('cashflow_admin_ai_month', {
    p_start: window.start.toISOString(), p_end: window.end.toISOString(), p_daily_cap_usd: config.dailyCostCapUsd,
    p_pro_tokens: config.proTokensPerCycle, p_trial_tokens: config.trialTokens,
  });
  if (result.error) throw result.error;
  return result.data as AiMonth;
}

// ---------- payments with the period each one bought ----------
type PrepaidRow = AnalyticsPrepaidOrderRow & { entitled_until: string | null };
type PromptPayRow = AnalyticsPromptPayRow & { entitled_until: string };
type CycleRow = AnalyticsCardCycleRow & { period_start: string; period_end: string };
type SubscriptionRow = { user_id: string; stripe_customer_id: string | null; stripe_livemode: boolean | null; status: string; plan: string | null; current_period_end: string | null };
const addMonth = (iso: string) => { const date = new Date(iso); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString(); };

export async function loadPaidPeriods(db: Db, verify: typeof analyticsPayments = analyticsPayments): Promise<{ periods: PaidPeriod[]; subscriptions: SubscriptionRow[] }> {
  const [subscriptions, legacy, promptPay, invoiceEvents, prepaid, cycles] = await Promise.all([
    loadAll<SubscriptionRow>((from, to) => db.from('subscriptions').select('user_id,status,plan,current_period_end,stripe_customer_id,stripe_livemode').order('user_id').range(from, to)),
    loadAll<AnalyticsPaymentRow>((from, to) => db.from('cashflow_payments').select('payment_id,user_id,amount,currency,paid_at,refunded').order('paid_at').range(from, to)),
    loadAll<PromptPayRow>((from, to) => db.from('cashflow_promptpay_payments').select('payment_intent_id,user_id,amount,currency,paid_at,refunded,livemode,entitled_until').eq('livemode', true).order('paid_at').range(from, to)),
    loadAll<AnalyticsInvoiceEvent>((from, to) => db.from('cashflow_stripe_events').select('object_id,livemode').eq('object_kind', 'invoice').eq('event_type', 'invoice.paid').eq('livemode', true).order('event_created').range(from, to)),
    loadAll<PrepaidRow>((from, to) => db.from('cashflow_prepaid_orders').select('payment_id,user_id,amount,paid_at,status,livemode,entitled_until').eq('livemode', true).in('status', ['paid', 'refunded']).order('paid_at').range(from, to)),
    loadAll<CycleRow>((from, to) => db.from('cashflow_card_cycles').select('invoice_id,payment_id,user_id,refunded,period_start,period_end,cashflow_prepaid_orders!inner(livemode)').eq('cashflow_prepaid_orders.livemode', true).order('period_start').range(from, to)),
  ]);
  // The same verified, de-duplicated payments as the admin dashboard (amounts checked against Stripe's invoices).
  const payments = await verify(legacy, promptPay, invoiceEvents, subscriptions, { prepaid, cardCycles: cycles });
  const periodOf = new Map<string, { start: string; end: string }>();
  for (const order of prepaid) if (order.payment_id && order.paid_at && order.entitled_until) periodOf.set(order.payment_id, { start: order.paid_at, end: order.entitled_until });
  for (const row of promptPay) periodOf.set(row.payment_intent_id, { start: row.paid_at, end: row.entitled_until });
  for (const cycle of cycles) periodOf.set(cycle.payment_id, { start: cycle.period_start, end: cycle.period_end });
  const periods = payments.map(payment => {
    const known = periodOf.get(payment.payment_id);
    // Older one-month payments carry no period of their own: one calendar month from payment.
    return { paymentId: payment.payment_id, userId: payment.user_id, amountSatang: Number(payment.amount), paidAt: payment.paid_at,
      start: known?.start ?? payment.paid_at, end: known?.end ?? addMonth(payment.paid_at), refunded: payment.refunded };
  });
  return { periods, subscriptions };
}

// ---------- Stripe ----------
type StripeReader = Pick<Stripe, 'balanceTransactions' | 'charges' | 'refunds'>;
async function pages<T extends { id: string }>(read: (after?: string) => PromiseLike<{ data: T[]; has_more: boolean }>): Promise<T[]> {
  const rows: T[] = []; let after: string | undefined;
  for (let index = 0; index < STRIPE_PAGES; index++) {
    const page = await read(after);
    rows.push(...page.data);
    if (!page.has_more) return rows;
    after = page.data.at(-1)?.id;
    if (!after) break;
  }
  throw new Error('incomplete');
}
const stripeId = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null);

export async function loadStripeMonth(client: StripeReader | null, window: MonthWindow, livemode: boolean): Promise<StripeMonth> {
  if (!client) return { status: 'unavailable', error: 'no_client' };
  if (!livemode) return { status: 'not_live' };
  const created = { gte: Math.floor(window.start.getTime() / 1000), lt: Math.floor(window.end.getTime() / 1000) };
  try {
    const [transactions, charges, refunds] = await Promise.all([
      pages(after => client.balanceTransactions.list({ limit: 100, created, ...(after ? { starting_after: after } : {}) }, STRIPE_OPTIONS)),
      pages(after => client.charges.list({ limit: 100, created, expand: ['data.balance_transaction'], ...(after ? { starting_after: after } : {}) }, STRIPE_OPTIONS)),
      pages(after => client.refunds.list({ limit: 100, created, ...(after ? { starting_after: after } : {}) }, STRIPE_OPTIONS)),
    ]);
    const summary = summarizeStripeTransactions(transactions);
    const thb = summary.currencies.find(row => row.currency === 'thb');
    const feeByPayment = new Map<string, number>();
    for (const charge of charges) {
      const pi = stripeId(charge.payment_intent);
      const balance = charge.balance_transaction;
      if (pi && charge.status === 'succeeded' && balance && typeof balance !== 'string' && balance.currency === 'thb') feeByPayment.set(pi, (feeByPayment.get(pi) ?? 0) + balance.fee);
    }
    // Failed card charges in the month (owner's Master Backlog, Part 4.1): how many, and how much was not collected.
    const failed = charges.filter(charge => charge.status === 'failed' && charge.currency === 'thb');
    const refundByPayment = new Map<string, number>();
    for (const refund of refunds) {
      const pi = stripeId(refund.payment_intent);
      if (pi && refund.status === 'succeeded' && refund.currency === 'thb') refundByPayment.set(pi, (refundByPayment.get(pi) ?? 0) + refund.amount);
    }
    return {
      status: 'ready', feeByPayment, refundByPayment,
      totals: { gross: thb?.gross ?? 0, refunds: thb?.refunds ?? 0, fees: thb?.fees ?? 0, net: thb?.net ?? 0, payments: thb?.paymentCount ?? 0,
        otherCurrencies: summary.currencies.some(row => row.currency !== 'thb'),
        failed: { count: failed.length, amount: failed.reduce((sum, charge) => sum + charge.amount, 0) } },
    };
  } catch (error) {
    // Never forward Stripe's error text (it can hold account details); a missing read permission is named.
    const permission = (error as { statusCode?: number; type?: string })?.statusCode === 403 || (error as { type?: string })?.type === 'StripePermissionError';
    return { status: 'unavailable', error: permission ? 'stripe_permission' : (error as Error)?.message === 'incomplete' ? 'stripe_incomplete' : 'stripe_unavailable' };
  }
}

// ---------- the note ----------
/**
 * 1–3 sentences from Gemini, from the figures already worked out (the brief's section G). It may use only numbers the
 * facts state; otherwise, or when the AI is off or fails, the note is written by code. The app pays its cost.
 */
export async function writeNote(metrics: ReportMetrics, config: Pick<AiConfig, 'enabled' | 'geminiKey' | 'chatModel' | 'timeoutMs'>, fetchImpl: typeof fetch = fetch): Promise<{ text: string; usd: number; by: 'ai' | 'code' }> {
  const fallback = { text: fallbackNote(metrics), usd: 0, by: 'code' as const };
  if (!config.enabled || !config.geminiKey || !config.chatModel.startsWith('gemini')) return fallback;
  const facts = reportFacts(metrics);
  try {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.chatModel)}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(Math.min(config.timeoutMs, 20_000)),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'คุณสรุปรายงานธุรกิจรายเดือนให้เจ้าของแอป เขียนภาษาไทยแบบทางการ 1 ถึง 3 ประโยค บอกสิ่งที่ควรระวังหรือควรตรวจในเดือนถัดไป ใช้เฉพาะตัวเลขที่อยู่ในข้อมูลที่ให้ ห้ามคำนวณหรือสร้างตัวเลขใหม่ ห้ามแนะนำให้ปรับราคา โควตา หรือการเลือกโมเดลโดยอัตโนมัติ ไม่ใช้อีโมจิ ไม่ใช้หัวข้อหรือรายการ' }] },
        contents: [{ role: 'user', parts: [{ text: facts.join('\n') }] }],
        generationConfig: { maxOutputTokens: 300, thinkingConfig: { thinkingLevel: 'MINIMAL' } },
      }),
    });
    const data = await response.json().catch(() => null) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Record<string, number> } | null;
    const meta = data?.usageMetadata ?? {};
    const usd = Math.round(costUsd('gemini', config.chatModel, { inputTokens: Number(meta.promptTokenCount || 0), cachedInputTokens: Number(meta.cachedContentTokenCount || 0),
      outputTokens: Number(meta.candidatesTokenCount || 0), thinkingTokens: Number(meta.thoughtsTokenCount || 0) }) * 1_000_000);
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map(part => part.text ?? '').join('').replace(/\s+/g, ' ').trim();
    if (!response.ok || !text || text.length > 500 || !noteUsesOnlyFacts(text, facts)) return { ...fallback, usd };
    return { text, usd, by: 'ai' };
  } catch {
    return fallback;
  }
}

// ---------- build and save ----------
export interface ReportDeps {
  db: Db;
  stripe: StripeReader | null;
  stripeLive: boolean;
  ai: Pick<AiConfig, 'enabled' | 'geminiKey' | 'chatModel' | 'timeoutMs' | 'dailyCostCapUsd' | 'proTokensPerCycle' | 'trialTokens'>;
  fetchImpl?: typeof fetch;
  now?: Date;
  verifyPayments?: typeof analyticsPayments;
}
export interface StoredReport { id: string; month: string; status: ReportMetrics['status']; metrics: ReportMetrics; accounts: AccountFigures[]; settings: unknown; note: string | null; note_cost_usd: string | number; delivery: DeliveryState; delivered_at: string | null }
export interface DeliveryState { attempts?: { at: string; day: string; quota: string; results: { recipient: string; outcome: DeliveryOutcome }[] }[]; status?: 'delivered' | 'partial' | 'failed' | 'no_recipients' | 'quota' }

/**
 * Answers the confidentiality check changed in the month (routing.guard, written since package 75). Null when they
 * could not be counted; never 0 for unknown.
 */
export async function loadConfidentialBlocked(db: Db, window: MonthWindow): Promise<number | null> {
  try {
    const result = await db.from('cashflow_ai_usage').select('request_id', { count: 'exact', head: true })
      .gte('created_at', window.start.toISOString()).lt('created_at', window.end.toISOString()).not('routing->guard', 'is', null);
    return result.error || typeof result.count !== 'number' ? null : result.count;
  } catch { return null; }
}

export async function loadStoredReport(db: Db, month: string): Promise<StoredReport | null> {
  const result = await db.from('cashflow_admin_reports').select('*').eq('id', reportId(month)).maybeSingle();
  if (result.error) throw result.error;
  return result.data as StoredReport | null;
}

/** Works the month out from the records (Stripe, payments, AI usage, settings), with last month's report to compare. */
export async function buildReport(month: string, deps: ReportDeps, options: { note?: boolean } = {}) {
  const now = deps.now ?? new Date();
  const window = monthWindow(month);
  // Each account's plan allowance at the month's end (or now, for the month running); unreadable = the default one.
  const limitsAt = new Date(Math.min(now.getTime(), window.end.getTime() - 1));
  const [settingsRead, aiRead, paidRead, stripe, membersRead, previous, notesRead, confidentialBlocked, tokenLimits] = await Promise.all([
    loadCostSettings(deps.db).catch(error => ({ error })),
    loadAiMonth(deps.db, window, deps.ai).catch(error => ({ error })),
    loadPaidPeriods(deps.db, deps.verifyPayments).catch(error => ({ error })),
    loadStripeMonth(deps.stripe, window, deps.stripeLive),
    loadMembers(deps.db).catch(error => ({ error })),
    loadStoredReport(deps.db, shiftMonth(month, -1)).catch(() => null),
    deps.db.from('cashflow_admin_reports').select('note_cost_usd,created_at').gte('created_at', window.start.toISOString()).lt('created_at', window.end.toISOString()),
    loadConfidentialBlocked(deps.db, window),
    proTokenLimits(deps.db, limitsAt).catch(() => undefined),
  ]);
  const settings = 'error' in settingsRead ? costSettings([]) : settingsRead.settings;
  const members = 'error' in membersRead ? { profiles: [], granted: [], cancelling: 0, admins: [] } : membersRead;
  const notesUsd = notesRead?.error ? 0 : ((notesRead?.data ?? []) as { note_cost_usd: string }[]).reduce((sum, row) => sum + microUsd(row.note_cost_usd), 0);
  const { metrics, accounts } = computeReport({
    window, settings, stripe, generatedAt: now, reportNotesUsd: notesUsd, previous: previous?.metrics ?? null, confidentialBlocked,
    tokenLimits, trialTokens: deps.ai.trialTokens,
    ai: 'error' in aiRead ? null : aiRead, aiError: 'error' in aiRead ? reason(aiRead.error) : undefined,
    periods: 'error' in paidRead ? null : paidRead.periods, paymentsError: 'error' in paidRead ? reason(paidRead.error) : undefined,
    members: { ...members, inTrial: (createdAt, at) => inFreeTrial(createdAt, at) },
  });
  if ('error' in settingsRead) metrics.sections.profit.notes.unshift(`อ่านการตั้งค่าค่าใช้จ่ายไม่ได้ (${reason(settingsRead.error)})`);
  const note = options.note === false ? { text: fallbackNote(metrics), usd: 0, by: 'code' as const } : await writeNote(metrics, deps.ai, deps.fetchImpl);
  return { metrics, accounts, note, settings: { items: settings.items, rate4: settings.rate4, fixedMonthlySatang: settings.fixedMonthlySatang } };
}

async function loadMembers(db: Db) {
  const [profiles, subscriptions, cards, roles] = await Promise.all([
    loadAll<{ user_id: string; created_at: string }>((from, to) => db.from('cashflow_profiles').select('user_id,created_at').order('user_id').range(from, to)),
    loadAll<{ user_id: string; status: string; plan: string | null }>((from, to) => db.from('subscriptions').select('user_id,status,plan').eq('plan', 'admin_grant').order('user_id').range(from, to)),
    loadAll<{ user_id: string }>((from, to) => db.from('cashflow_card_subscriptions').select('user_id').eq('status', 'active').eq('cancel_at_period_end', true).order('user_id').range(from, to)),
    loadAll<{ user_id: string }>((from, to) => db.from('cashflow_user_roles').select('user_id').eq('role', 'admin').order('user_id').range(from, to)),
  ]);
  return { profiles, granted: subscriptions.filter(row => row.status === 'active').map(row => row.user_id), cancelling: cards.length, admins: roles.map(row => row.user_id) };
}

export async function saveReport(db: Db, month: string, built: Awaited<ReturnType<typeof buildReport>>): Promise<StoredReport> {
  const row = {
    id: reportId(month), month, status: built.metrics.status, metrics: built.metrics, accounts: built.accounts, settings: built.settings,
    note: built.note.text.slice(0, 600), note_cost_usd: (built.note.usd / 1_000_000).toFixed(6), updated_at: new Date().toISOString(),
  };
  const result = await db.from('cashflow_admin_reports').upsert(row, { onConflict: 'id' }).select('*').single();
  if (result.error) throw result.error;
  return result.data as StoredReport;
}

// ---------- delivery ----------
export interface DeliveryDeps {
  db: Db;
  token?: string;
  fetchImpl?: typeof fetch;
  push: (lineUserId: string, message: LineMessage, retryKey: string) => Promise<DeliveryOutcome>;
  claim: (key: string) => Promise<boolean>;
  /** Optional: only these e-mails among the admins (ADMIN_REPORT_EMAILS); the role is always checked. */
  allowEmails?: string[];
  emailOf?: (userId: string) => Promise<string | null>;
  now?: Date;
}
const hashId = (value: string) => createHash('sha256').update(`krarok-admin-report:${value}`).digest('hex').slice(0, 16);
/** LINE asks for a UUID as the retry key: the same report, recipient and day always give the same key. */
export function retryKey(...parts: string[]): string {
  const hex = createHash('sha256').update(parts.join(':')).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 | (parseInt(hex[16], 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function adminRecipients(deps: Pick<DeliveryDeps, 'db' | 'allowEmails' | 'emailOf'>): Promise<{ userId: string; lineUserId: string }[]> {
  const roles = await deps.db.from('cashflow_user_roles').select('user_id').eq('role', 'admin');
  if (roles.error) throw roles.error;
  const ids = ((roles.data ?? []) as { user_id: string }[]).map(row => row.user_id);
  if (!ids.length) return [];
  const links = await deps.db.from('cashflow_line_links').select('user_id,line_user_id').in('user_id', ids);
  if (links.error) throw links.error;
  const seen = new Set<string>();
  const out: { userId: string; lineUserId: string }[] = [];
  for (const link of (links.data ?? []) as { user_id: string; line_user_id: string }[]) {
    if (!ids.includes(link.user_id) || seen.has(link.line_user_id)) continue;
    if (deps.allowEmails?.length) {
      const email = (await deps.emailOf?.(link.user_id))?.trim().toLowerCase();
      if (!email || !deps.allowEmails.includes(email)) continue;
    }
    seen.add(link.line_user_id);
    out.push({ userId: link.user_id, lineUserId: link.line_user_id });
  }
  return out;
}

/** What LINE still allows this month: null when there is no limit or it could not be read. */
export async function lineQuotaLeft(token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<{ left: number | null; read: 'ok' | 'unlimited' | 'unknown' }> {
  if (!token) return { left: null, read: 'unknown' };
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [quota, used] = await Promise.all([
      fetchImpl('https://api.line.me/v2/bot/message/quota', { headers, signal: AbortSignal.timeout(8_000) }).then(res => (res.ok ? res.json() : null)),
      fetchImpl('https://api.line.me/v2/bot/message/quota/consumption', { headers, signal: AbortSignal.timeout(8_000) }).then(res => (res.ok ? res.json() : null)),
    ]) as [{ type?: string; value?: number } | null, { totalUsage?: number } | null];
    if (quota?.type === 'none') return { left: null, read: 'unlimited' };
    if (quota?.type === 'limited' && typeof quota.value === 'number' && typeof used?.totalUsage === 'number') return { left: Math.max(0, quota.value - used.totalUsage), read: 'ok' };
    return { left: null, read: 'unknown' };
  } catch {
    return { left: null, read: 'unknown' };
  }
}

/** Sends the saved report to the admins once; a failure leaves it saved to send on the next day (up to 3 days). */
export async function deliverReport(report: StoredReport, deps: DeliveryDeps): Promise<DeliveryState['status'] | 'already' | 'claimed'> {
  if (report.delivered_at) return 'already';
  const now = deps.now ?? new Date();
  const day = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  if (!(await deps.claim(`admin-profit-report:${report.month}:${day}`))) return 'claimed';
  const recipients = await adminRecipients(deps);
  const attempts = [...(report.delivery?.attempts ?? [])];
  let status: NonNullable<DeliveryState['status']>;
  const results: { recipient: string; outcome: DeliveryOutcome }[] = [];
  let quotaRead = 'unknown';
  if (!recipients.length) status = 'no_recipients';
  else {
    const quota = await lineQuotaLeft(deps.token, deps.fetchImpl);
    quotaRead = quota.read === 'ok' ? `left:${quota.left}` : quota.read;
    if (quota.left !== null && quota.left < recipients.length) status = 'quota';
    else {
      const message: LineMessage = { type: 'text', text: lineReportText(report.metrics, report.note ?? fallbackNote(report.metrics)) };
      for (const recipient of recipients) {
        const outcome = await deps.push(recipient.lineUserId, message, retryKey(report.id, recipient.lineUserId, day));
        results.push({ recipient: hashId(recipient.userId), outcome });
      }
      const accepted = results.filter(item => item.outcome === 'accepted').length;
      status = accepted === results.length ? 'delivered' : accepted ? 'partial' : 'failed';
    }
  }
  attempts.push({ at: now.toISOString(), day, quota: quotaRead, results });
  const delivery: DeliveryState = { attempts: attempts.slice(-DELIVERY_DAYS * 2), status };
  const update = await deps.db.from('cashflow_admin_reports').update({ delivery, delivered_at: status === 'delivered' || status === 'partial' ? now.toISOString() : null, updated_at: now.toISOString() }).eq('id', report.id);
  if (update.error) throw update.error;
  return status;
}

import type Stripe from 'stripe';
import type { AnalyticsRange } from '../../../shared/adminAnalytics.js';
import type {
  AdminStripeFinance, StripeFinanceBalance, StripeFinanceError, StripeFinancePayment,
  StripeFinancePayout, StripeFinanceSection, StripeFinanceSummary,
} from '../../../shared/adminStripeFinance.js';

type FinanceClient = Pick<Stripe, 'balance' | 'balanceTransactions' | 'charges' | 'payouts'>;
type FinanceOptions = { now?: Date; livemode?: boolean; maxPages?: number };
const REQUEST_OPTIONS = { timeout: 5_000, maxNetworkRetries: 0 };
const MAX_PAGES = 10;
const MAX_SECTION_MS = 15_000;
const RECENT_LIMIT = 20;
const PAYOUTS_TO_MATCH = 6;
const PAYOUT_MATCH_MS = 8_000;
const DAY_MS = 86_400_000;

class IncompleteStripeRead extends Error {}

function integer(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid Stripe money value');
  return value;
}

function currency(value: string): string {
  if (!/^[a-z]{3}$/.test(value)) throw new Error('Invalid Stripe currency');
  return value;
}

function timestamp(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid Stripe timestamp');
  return new Date(value * 1000).toISOString();
}

export function stripeFinancePeriod(range: AnalyticsRange, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const toDate = `${values.year}-${values.month}-${values.day}`;
  const first = new Date(new Date(`${toDate}T00:00:00.000Z`).getTime() - (range - 1) * DAY_MS);
  const fromDate = first.toISOString().slice(0, 10);
  return {
    fromDate, toDate,
    // Include Bangkok calendar days, not UTC days. The upper bound is the snapshot time.
    created: { gte: Math.floor(new Date(`${fromDate}T00:00:00+07:00`).getTime() / 1000), lte: Math.floor(now.getTime() / 1000) },
  };
}

function unavailable<T>(error: StripeFinanceError): StripeFinanceSection<T> {
  return { status: 'unavailable', complete: false, data: null, error };
}

function ready<T>(data: T, complete = true): StripeFinanceSection<T> {
  return { status: 'ready', complete, data, error: null };
}

function permissionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { statusCode?: number; type?: string; code?: string };
  return value.statusCode === 403 || value.type === 'StripePermissionError' || value.code === 'permission_missing';
}

function publicError(error: unknown, permission: string): StripeFinanceError {
  if (permissionFailure(error)) return {
    code: 'permission_missing', permission,
    message: 'Stripe ยังไม่อนุญาตให้อ่านข้อมูลส่วนนี้ กรุณาเพิ่มสิทธิ์อ่านให้คีย์ที่ใช้กับระบบ',
  };
  if (error instanceof IncompleteStripeRead) return {
    code: 'incomplete', message: 'ข้อมูลในช่วงนี้มีจำนวนมากหรืออ่านได้ไม่ครบ จึงยังไม่แสดงยอดรวม กรุณาเลือกช่วงเวลาที่สั้นลงแล้วลองใหม่',
  };
  // Do not forward provider errors: they can contain request credentials, account
  // identifiers or bank/customer details. Failure must never look like a zero balance.
  return { code: 'provider_unavailable', message: 'อ่านข้อมูลจาก Stripe ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
}

async function section<T>(permission: string, read: () => Promise<StripeFinanceSection<T>>): Promise<StripeFinanceSection<T>> {
  try { return await read(); }
  catch (error) { return unavailable(publicError(error, permission)); }
}

type StripePage<T> = { data: T[]; has_more: boolean };

// No auto-pagination: cap both requests and wall time. Deduplicate IDs when a
// provider page overlaps; a repeated cursor/unfinished scan never yields totals.
async function allPages<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => PromiseLike<StripePage<T>>,
  maxPages: number,
  deadline: number,
): Promise<T[]> {
  const rows = new Map<string, T>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    if (Date.now() >= deadline) throw new IncompleteStripeRead();
    const page = await fetchPage(cursor);
    if (!Array.isArray(page.data) || typeof page.has_more !== 'boolean') throw new Error('Invalid Stripe list');
    for (const row of page.data) rows.set(row.id, row);
    if (!page.has_more) return [...rows.values()];
    cursor = page.data.at(-1)?.id;
    if (!cursor || cursors.has(cursor)) throw new IncompleteStripeRead();
    cursors.add(cursor);
  }
  throw new IncompleteStripeRead();
}

function percent(fee: number, gross: number): number | null {
  return gross > 0 ? fee / gross * 100 : null;
}

export function summarizeStripeTransactions(transactions: Stripe.BalanceTransaction[]): StripeFinanceSummary {
  const byCurrency = new Map<string, StripeFinanceSummary['currencies'][number]>();
  const seen = new Set<string>();
  for (const row of transactions) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const category = row.reporting_category;
    // Report payment/refund/fee activity, not transfers or bank payouts. Stripe's
    // reporting category distinguishes partial capture reversals from refunds.
    const charge = category === 'charge';
    const chargeReversal = category === 'charge_failure' || category === 'partial_capture_reversal';
    const refund = category === 'refund' || category === 'refund_failure';
    const standaloneFee = category === 'fee' || row.type === 'stripe_fee' || row.type === 'stripe_fx_fee' || row.type === 'tax_fee';
    if (!charge && !chargeReversal && !refund && !standaloneFee) continue;
    const code = currency(row.currency);
    const amount = integer(row.amount);
    const fee = integer(row.fee);
    const net = integer(row.net);
    if (amount - fee !== net) throw new Error('Inconsistent Stripe balance transaction');
    const totals = byCurrency.get(code) || {
      currency: code, gross: 0, refunds: 0, fees: 0, net: 0, paymentCount: 0, effectiveFeePercent: null,
    };
    if (standaloneFee) totals.fees += -net;
    else {
      totals.fees += fee;
      if (refund) totals.refunds -= amount; // Failed refunds are credits, not another refund.
      else {
        totals.gross += amount;
        if (charge && amount > 0) totals.paymentCount++;
        if (category === 'charge_failure' && amount < 0) totals.paymentCount--;
      }
    }
    totals.net += net;
    byCurrency.set(code, totals);
  }
  for (const row of byCurrency.values()) {
    for (const amount of [row.gross, row.refunds, row.fees, row.net]) integer(amount);
    if (row.net !== row.gross - row.refunds - row.fees) throw new Error('Inconsistent Stripe finance summary');
    row.paymentCount = Math.max(0, row.paymentCount);
    row.effectiveFeePercent = percent(row.fees, row.gross);
  }
  return { currencies: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)), transactionCount: seen.size };
}

function paymentRow(charge: Stripe.Charge): StripeFinancePayment {
  const balance = charge.balance_transaction;
  const settlement = balance && typeof balance !== 'string' ? {
    amount: integer(balance.amount), currency: currency(balance.currency), fee: integer(balance.fee), net: integer(balance.net),
    effectiveFeePercent: percent(balance.fee, balance.amount), availableOn: timestamp(balance.available_on),
    status: balance.status === 'available' ? 'available' as const : 'pending' as const,
  } : null;
  if (settlement && settlement.amount - settlement.fee !== settlement.net) throw new Error('Inconsistent Stripe payment settlement');
  const amountRefunded = integer(charge.amount_refunded);
  return {
    id: charge.id,
    paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id || null,
    createdAt: timestamp(charge.created), amount: integer(charge.amount_captured), currency: currency(charge.currency), amountRefunded,
    status: charge.refunded ? 'refunded' : amountRefunded > 0 ? 'partially_refunded' : 'paid',
    paymentMethod: charge.payment_method_details?.type || null,
    // Informational only. Never use this marker for entitlements or user identity.
    appPayment: /^[0-9a-f-]{36}$/i.test(charge.metadata.app_user_id || '') && (charge.metadata.offer_version || '').startsWith('krarok_'),
    settlement,
  };
}

function payoutRow(payout: Stripe.Payout): StripeFinancePayout {
  const statuses = new Set(['pending', 'in_transit', 'paid', 'failed', 'canceled']);
  return {
    id: payout.id, createdAt: timestamp(payout.created), arrivalDate: timestamp(payout.arrival_date),
    amount: integer(payout.amount), currency: currency(payout.currency),
    status: statuses.has(payout.status) ? payout.status as StripeFinancePayout['status'] : 'unknown',
    automatic: payout.automatic, method: payout.method,
  };
}

// Which recent automatic payout carried each payment to the bank (owner, 2026-10-22: "when does
// the money reach my account"). Stripe lists a payout's balance transactions for automatic payouts.
// Best effort: a payment not found, or any read failure, shows no bank date rather than a guess.
async function attachBankPayouts(
  client: FinanceClient,
  items: StripeFinancePayment[],
  payouts: NonNullable<AdminStripeFinance['payouts']['data']>,
  transactionOf: Map<string, string>,
  maxPages: number,
): Promise<void> {
  const byId = new Map<string, StripeFinancePayout>();
  for (const payout of [...payouts.nextPayouts, ...payouts.items]) byId.set(payout.id, payout);
  const candidates = [...byId.values()]
    .filter(payout => payout.automatic && ['pending', 'in_transit', 'paid'].includes(payout.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, PAYOUTS_TO_MATCH);
  const deadline = Date.now() + PAYOUT_MATCH_MS;
  try {
    const carried = new Map<string, StripeFinancePayout>();
    await Promise.all(candidates.map(async payout => {
      const rows = await allPages(cursor => client.balanceTransactions.list({
        payout: payout.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}),
      }, REQUEST_OPTIONS), maxPages, deadline);
      for (const row of rows) carried.set(row.id, payout);
    }));
    for (const item of items) {
      const transaction = transactionOf.get(item.id);
      const payout = transaction ? carried.get(transaction) : undefined;
      item.payout = payout ? { id: payout.id, arrivalDate: payout.arrivalDate, status: payout.status } : null;
    }
  } catch { /* Bank dates stay unconfirmed; the settlement date is still shown. */ }
}

export async function loadAdminStripeFinance(client: FinanceClient, range: AnalyticsRange, options: FinanceOptions = {}): Promise<AdminStripeFinance> {
  const now = options.now || new Date();
  const livemode = options.livemode ?? true;
  const { fromDate, toDate, created } = stripeFinancePeriod(range, now);
  const base = { range, fromDate, toDate, timezone: 'Asia/Bangkok' as const, generatedAt: now.toISOString(), livemode, scope: 'stripe_account' as const };
  if (!livemode) {
    const error: StripeFinanceError = { code: 'not_live', message: 'ระบบ Stripe อยู่ในโหมดทดสอบ จึงไม่แสดงเป็นรายได้จริง' };
    return { ...base, balance: unavailable(error), summary: unavailable(error), payments: unavailable(error), payouts: unavailable(error) };
  }
  const maxPages = Math.min(MAX_PAGES, Math.max(1, options.maxPages || MAX_PAGES));
  const deadline = Date.now() + MAX_SECTION_MS;
  const transactionOf = new Map<string, string>();
  const [balance, summary, payments, payouts] = await Promise.all([
    section<StripeFinanceBalance>('Balance (Read)', async () => {
      const result = await client.balance.retrieve({}, REQUEST_OPTIONS);
      if (result.livemode !== true) throw new Error('Unexpected Stripe mode');
      const currencies = new Map<string, StripeFinanceBalance['currencies'][number]>();
      for (const [kind, amounts] of [['available', result.available], ['pending', result.pending]] as const) {
        for (const row of amounts) {
          const code = currency(row.currency);
          const totals = currencies.get(code) || { currency: code, available: 0, pending: 0 };
          totals[kind] = integer(totals[kind] + integer(row.amount));
          currencies.set(code, totals);
        }
      }
      return ready({ currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)) });
    }),
    section<StripeFinanceSummary>('Balance (Read)', async () => {
      const rows = await allPages(cursor => client.balanceTransactions.list({
        limit: 100, created, ...(cursor ? { starting_after: cursor } : {}),
      }, REQUEST_OPTIONS), maxPages, deadline);
      return ready(summarizeStripeTransactions(rows));
    }),
    section<NonNullable<AdminStripeFinance['payments']['data']>>('Charges (Read)', async () => {
      const items = new Map<string, StripeFinancePayment>();
      let cursor: string | undefined;
      let expandBalance = true;
      let hasMore = false;
      const cursors = new Set<string>();
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        if (Date.now() >= deadline) { hasMore = true; break; }
        const read = () => client.charges.list({ limit: 100, created, ...(cursor ? { starting_after: cursor } : {}),
          ...(expandBalance ? { expand: ['data.balance_transaction'] } : {}),
        }, REQUEST_OPTIONS);
        let page: Stripe.ApiList<Stripe.Charge>;
        try { page = await read(); }
        catch (error) {
          if (!expandBalance || !permissionFailure(error)) throw error;
          // Balance may be restricted while Charges is readable. Keep actual
          // receipts visible, with unknown settlement values instead of zeros.
          expandBalance = false;
          page = await read();
        }
        for (const charge of page.data) {
          if (charge.livemode !== true) throw new Error('Unexpected Stripe mode');
          if (charge.paid && charge.captured && charge.status === 'succeeded') {
            items.set(charge.id, paymentRow(charge));
            const transaction = typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction?.id;
            if (transaction) transactionOf.set(charge.id, transaction);
          }
        }
        hasMore = page.has_more || items.size > RECENT_LIMIT;
        if (!page.has_more || items.size >= RECENT_LIMIT) break;
        cursor = page.data.at(-1)?.id;
        if (!cursor || cursors.has(cursor)) throw new IncompleteStripeRead();
        cursors.add(cursor);
      }
      return ready({ items: [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_LIMIT), hasMore }, !hasMore);
    }),
    section<NonNullable<AdminStripeFinance['payouts']['data']>>('Payouts (Read)', async () => {
      const [recent, pending, inTransit] = await Promise.all([
        client.payouts.list({ limit: RECENT_LIMIT }, REQUEST_OPTIONS),
        allPages(cursor => client.payouts.list({ limit: 100, status: 'pending', ...(cursor ? { starting_after: cursor } : {}) }, REQUEST_OPTIONS), maxPages, deadline),
        allPages(cursor => client.payouts.list({ limit: 100, status: 'in_transit', ...(cursor ? { starting_after: cursor } : {}) }, REQUEST_OPTIONS), maxPages, deadline),
      ]);
      const all = [...recent.data, ...pending, ...inTransit];
      if (all.some(row => row.livemode !== true)) throw new Error('Unexpected Stripe mode');
      const upcoming = new Map([...pending, ...inTransit].map(row => [row.id, payoutRow(row)]));
      return ready({
        items: recent.data.map(payoutRow),
        nextPayouts: [...upcoming.values()].sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate)),
        nextPayoutsComplete: true, hasMore: recent.has_more,
      }, !recent.has_more);
    }),
  ]);
  if (payments.data && payouts.data) await attachBankPayouts(client, payments.data.items, payouts.data, transactionOf, maxPages);
  return { ...base, balance, summary, payments, payouts };
}

import { PRO_PERIODS, type ProPeriod } from '../../../shared/proPricing.js';
import { coveringStretch, proTokensFor, type PaidStretch } from '../../../shared/proTokens.js';

// Which paid stretch covers a moment, read from the two places Pro is paid for: one-time orders (QR or card,
// cashflow_prepaid_orders) and card renewal cycles (cashflow_card_cycles, with the order they renew). The token rule
// itself is shared/proTokens.ts. Only the server reads these tables (service role).

type Db = { from: (table: string) => any };
type OrderRow = { user_id: string; period: string; amount: number | string; paid_at: string | null; entitled_until: string | null; created_at?: string };
type OrderRef = { period: string; created_at?: string };
type CycleRow = { user_id: string; period_start: string; period_end: string; refunded: boolean; paid_order: OrderRef | OrderRef[] | null };

const isPeriod = (value: unknown): value is ProPeriod => PRO_PERIODS.includes(value as ProPeriod);
const one = <T>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Paid stretches covering `now`, by account. `since` leaves out what was bought before an owner reset Pro access. */
export async function coveringStretches(db: Db, now: Date, userIds?: string[], since?: Map<string, number>): Promise<Map<string, PaidStretch[]>> {
  const at = now.toISOString();
  let orders = db.from('cashflow_prepaid_orders').select('user_id, period, amount, paid_at, entitled_until, created_at')
    .eq('status', 'paid').lte('paid_at', at).gt('entitled_until', at);
  let cycles = db.from('cashflow_card_cycles').select('user_id, period_start, period_end, refunded, paid_order:cashflow_prepaid_orders(period, created_at)')
    .eq('refunded', false).lte('period_start', at).gt('period_end', at);
  if (userIds) { orders = orders.in('user_id', userIds); cycles = cycles.in('user_id', userIds); }
  const [orderRead, cycleRead] = await Promise.all([orders, cycles]);
  if (orderRead.error) throw orderRead.error;
  if (cycleRead.error) throw cycleRead.error;
  const byUser = new Map<string, PaidStretch[]>();
  const add = (userId: string, stretch: PaidStretch, createdAt: string | undefined) => {
    const reset = since?.get(userId);
    if (reset !== undefined && (!createdAt || Date.parse(createdAt) <= reset)) return;
    byUser.set(userId, [...(byUser.get(userId) ?? []), stretch]);
  };
  for (const row of (orderRead.data ?? []) as OrderRow[]) {
    if (!isPeriod(row.period) || !row.paid_at || !row.entitled_until) continue;
    add(row.user_id, { period: row.period, chargedBaht: Number(row.amount) / 100, start: Date.parse(row.paid_at), end: Date.parse(row.entitled_until) }, row.created_at);
  }
  for (const row of (cycleRead.data ?? []) as CycleRow[]) {
    const order = one(row.paid_order);
    if (!order || !isPeriod(order.period)) continue;
    add(row.user_id, { period: order.period, chargedBaht: null, start: Date.parse(row.period_start), end: Date.parse(row.period_end) }, order.created_at);
  }
  return byUser;
}

/** Tokens a month for each account with a paid stretch covering `now`; accounts left out use the default allowance. */
export async function proTokenLimits(db: Db, now: Date, userIds?: string[], since?: Map<string, number>): Promise<Map<string, number>> {
  const limits = new Map<string, number>();
  for (const [userId, stretches] of await coveringStretches(db, now, userIds, since)) {
    const stretch = coveringStretch(stretches, now.getTime());
    if (stretch) limits.set(userId, proTokensFor(stretch));
  }
  return limits;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PRO_MONTH_REGULAR_FROM } from '../shared/proPricing';
import { PRO_PLAN_TOKENS, coveringStretch, proTokenPlan, proTokensFor, proTokensOnSale, type PaidStretch } from '../shared/proTokens';
import { coveringStretches, proTokenLimits } from '../backend/src/services/proTokens';
import { allowance } from '../backend/src/ai/service';
import { aiConfig } from '../backend/src/ai/config';
import { computeReport, costSettings, monthWindow, type AiAccountRow, type ReportInput } from '../backend/src/services/adminProfitReport';

// Tokens a month for paid Pro (owner, 2026-10-25): 1,650 for every plan and every Pro account.
// Synthetic accounts, no network, no keys.

// A moment in the sales phase (27 Oct 2569 01:00 Bangkok).
const CUTOVER = Date.parse('2026-10-26T17:00:00Z');
const AFTER = CUTOVER + 3_600_000;
const day = 86_400_000;
const stretch = (over: Partial<PaidStretch>): PaidStretch => ({ period: 'month', chargedBaht: 177, start: AFTER, end: AFTER + 30 * day, ...over });

test('profit per member: 70% or more on ฿249 at full use, the 54% the owner accepted for the promotion, and every plan the same 1,650', () => {
  // The brief's assumptions: 500 members, ฿33.50 a dollar, 1 token = $0.001, 7% VAT on the AI bills, the last message's
  // overrun (up to 100 tokens), about ฿10.41 a member of running costs.
  const tokenBaht = 0.001 * 33.5 * 1.07;
  const running = 5203.97 / 500;
  const margins = (tokens: number, net: number) => ({
    worst: 1 - ((tokens + 100) * tokenBaht + running) / net,
    half: 1 - ((tokens / 2) * tokenBaht + running) / net,
  });
  const regular = margins(PRO_PLAN_TOKENS.month, 249);
  const promo = margins(PRO_PLAN_TOKENS.monthPromo, 159);
  assert.ok(regular.worst >= 0.70, `฿249 worst ${(regular.worst * 100).toFixed(1)}%`);
  assert.ok(regular.half >= 0.80, `฿249 half ${(regular.half * 100).toFixed(1)}%`);
  assert.ok(promo.worst >= 0.54, `฿159 worst ${(promo.worst * 100).toFixed(1)}% (owner accepted 54%)`);
  assert.ok(promo.half >= 0.745, `฿159 half ${(promo.half * 100).toFixed(1)}%`);
  // Long-plan buyers never get fewer tokens than a month (owner, 2026-10-25).
  assert.deepEqual(PRO_PLAN_TOKENS, { month: 1650, monthPromo: 1650, halfYear: 1650, year: 1650 });
});

test('the plan of a paid stretch: by the amount charged for a one-time month, by the date for a card renewal', () => {
  assert.equal(proTokenPlan(stretch({ chargedBaht: 271 })), 'month');
  assert.equal(proTokenPlan(stretch({ chargedBaht: 177 })), 'monthPromo');
  assert.equal(proTokenPlan(stretch({ chargedBaht: 159 })), 'monthPromo');
  // An order made on 30 Nov at ฿177 and paid just after midnight keeps the promotion it was sold at.
  assert.equal(proTokenPlan(stretch({ chargedBaht: 177, start: PRO_MONTH_REGULAR_FROM + 60_000 })), 'monthPromo');
  assert.equal(proTokenPlan(stretch({ chargedBaht: null, start: PRO_MONTH_REGULAR_FROM - 1 })), 'monthPromo');
  assert.equal(proTokenPlan(stretch({ chargedBaht: null, start: PRO_MONTH_REGULAR_FROM })), 'month', 'renewals charge ฿271 from 1 Dec');
  assert.equal(proTokenPlan(stretch({ period: 'halfYear', chargedBaht: 895 })), 'halfYear');
  assert.equal(proTokenPlan(stretch({ period: 'year', chargedBaht: null })), 'year');
});

test('every paid stretch gets 1,650 a month, also one paid before the change (owner: "ให้ทุกคนได้ 1,650")', () => {
  for (const period of ['month', 'halfYear', 'year'] as const) {
    assert.equal(proTokensFor(stretch({ period, start: CUTOVER - 30 * day })), 1650, `${period} paid earlier`);
    assert.equal(proTokensFor(stretch({ period, chargedBaht: null })), 1650, period);
  }
  assert.equal(proTokensFor(stretch({ chargedBaht: 271, start: PRO_MONTH_REGULAR_FROM + day })), 1650);
});

test('the stretch that covers a moment: the latest one when two overlap, none outside them', () => {
  const old = stretch({ period: 'year', start: AFTER - 300 * day, end: AFTER + 65 * day });
  const renewed = stretch({ start: AFTER - day, end: AFTER + 29 * day });
  assert.equal(coveringStretch([old, renewed], AFTER), renewed);
  assert.equal(coveringStretch([old], AFTER + 65 * day), undefined, 'the end is not covered');
  assert.equal(coveringStretch([], AFTER), undefined);
});

test('the plans page shows what the server gives: 1,650 a month, in the promotion and after it', () => {
  assert.equal(proTokensOnSale('month', PRO_MONTH_REGULAR_FROM - 1), 1650);
  assert.equal(proTokensOnSale('month', PRO_MONTH_REGULAR_FROM), 1650);
  assert.equal(proTokensOnSale('halfYear', AFTER), 1650);
  assert.equal(proTokensOnSale('year', PRO_MONTH_REGULAR_FROM + day), 1650);
});

test('the allowance uses the paid plan\'s tokens; owner grants and older subscriptions get the default, 1,650 too', () => {
  const config = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-never-sent' });
  assert.equal(config.proTokensPerCycle, 1650, 'the default with nothing set');
  const now = new Date('2026-11-10T03:00:00Z');
  assert.equal(allowance({ plan: 'pro', periodEnd: '2027-05-03T00:00:00Z', tokens: 750 }, config, now).tokenLimit, 750);
  assert.equal(allowance({ plan: 'pro', periodEnd: '2026-12-03T00:00:00Z' }, config, now).tokenLimit, 1650);
  assert.equal(allowance({ plan: 'pro' }, config, now).tokenLimit, 1650, 'admin grant: the default tokens');
  assert.equal(allowance({ plan: 'trial', tokens: 900 }, config, now).tokenLimit, config.trialTokens, 'a trial never takes a plan\'s tokens');
  assert.equal(allowance({ plan: 'admin', tokens: 900 }, config, now).tokenLimit, 1650, 'admins: the default Pro allowance, like members (owner, 2026-10-27)');
  assert.equal(allowance({ plan: 'admin' }, config, now).cycle, '2026-11', 'admins: the calendar month');
});

test('an admin token reset starts a fresh bucket from that moment to the month\'s end; members are never touched', () => {
  const reset = aiConfig({ AI_ENABLED: 'true', AI_ADMIN_TOKENS_RESET_AT: '2026-10-29T13:00:00+07:00' });
  const later = new Date('2026-10-30T02:00:00Z');
  const fresh = allowance({ plan: 'admin' }, reset, later);
  assert.equal(fresh.cycle, '2026-10-29', 'named after the Bangkok day of the reset');
  assert.match(fresh.cycle, /^(\d{4}-\d{2}(-\d{2})?|trial)$/, 'the usage table\'s cycle_key check accepts it');
  assert.equal(fresh.tokenLimit, 1650);
  assert.equal(fresh.resetsAt?.toISOString(), '2026-10-31T17:00:00.000Z', 'still renews on the 1st');
  assert.equal(allowance({ plan: 'admin' }, reset, new Date('2026-10-29T05:00:00Z')).cycle, '2026-10', 'before the reset moment');
  assert.equal(allowance({ plan: 'admin' }, reset, new Date('2026-11-02T03:00:00Z')).cycle, '2026-11', 'next month: the calendar month again');
  assert.equal(allowance({ plan: 'pro' }, reset, later).cycle, '2026-10', 'Pro given by hand is not reset either');
  assert.equal(allowance({ plan: 'pro', periodEnd: '2026-12-03T00:00:00Z' }, reset, later).cycle, '2026-10-03', 'nor a paid cycle');
  assert.equal(aiConfig({ AI_ADMIN_TOKENS_RESET_AT: 'soon' }).adminTokensResetAt, undefined, 'an unreadable value: no reset');
  assert.equal(aiConfig({}).adminTokensResetAt, undefined);
});

/** A PostgREST-like query that records its filters and answers with fixed rows. */
function fakeDb(tables: Record<string, unknown[]>, fail?: string) {
  const calls: { table: string; select?: string; filters: string[] }[] = [];
  const db = {
    from(table: string) {
      const call = { table, filters: [] as string[] } as { table: string; select?: string; filters: string[] };
      calls.push(call);
      const query: any = {
        select(columns: string) { call.select = columns; return query; },
        eq(column: string, value: unknown) { call.filters.push(`${column}=eq.${value}`); return query; },
        lte(column: string, value: unknown) { call.filters.push(`${column}=lte.${value}`); return query; },
        gt(column: string, value: unknown) { call.filters.push(`${column}=gt.${value}`); return query; },
        in(column: string, values: unknown[]) { call.filters.push(`${column}=in.${values.join(',')}`); return query; },
        then(resolve: (value: unknown) => void, reject: (error: unknown) => void) {
          return Promise.resolve(fail === table ? { data: null, error: { code: '42P01', message: 'missing' } } : { data: tables[table] ?? [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { db, calls };
}

test('the loader reads paid one-time orders and card cycles covering now, with the order each cycle renews', async () => {
  const now = new Date(AFTER + 10 * day);
  const at = now.toISOString();
  const iso = (ms: number) => new Date(ms).toISOString();
  const { db, calls } = fakeDb({
    cashflow_prepaid_orders: [
      { user_id: 'u-year', period: 'year', amount: 156200, paid_at: iso(AFTER), entitled_until: iso(AFTER + 365 * day), created_at: iso(AFTER - 60_000) },
      { user_id: 'u-old', period: 'halfYear', amount: 89500, paid_at: iso(CUTOVER - day), entitled_until: iso(CUTOVER + 180 * day), created_at: iso(CUTOVER - day) },
      { user_id: 'u-reset', period: 'month', amount: 17700, paid_at: iso(AFTER), entitled_until: iso(AFTER + 30 * day), created_at: iso(AFTER) },
      { user_id: 'u-bad', period: 'week', amount: 100, paid_at: iso(AFTER), entitled_until: iso(AFTER + day), created_at: iso(AFTER) },
    ],
    cashflow_card_cycles: [
      { user_id: 'u-card', period_start: iso(AFTER + 5 * day), period_end: iso(AFTER + 35 * day), refunded: false, paid_order: { period: 'month', created_at: iso(AFTER) } },
      { user_id: 'u-card-array', period_start: iso(PRO_MONTH_REGULAR_FROM), period_end: iso(PRO_MONTH_REGULAR_FROM + 31 * day), refunded: false, paid_order: [{ period: 'month', created_at: iso(AFTER) }] },
    ],
  });
  const reset = new Map([['u-reset', AFTER + 1]]);
  const limits = await proTokenLimits(db, now, undefined, reset);
  assert.equal(limits.get('u-year'), 1650);
  assert.equal(limits.get('u-old'), 1650, 'paid before the change: 1,650 too');
  assert.equal(limits.get('u-card'), 1650, 'a promotion renewal before 1 Dec');
  assert.equal(limits.has('u-reset'), false, 'bought before the owner reset Pro access');
  assert.equal(limits.has('u-bad'), false);
  // The cycle in December was given the regular plan; the loader keeps it as a stretch (the dates are the database's job).
  const stretches = await coveringStretches(db, now);
  assert.deepEqual(stretches.get('u-card-array'), [{ period: 'month', chargedBaht: null, start: PRO_MONTH_REGULAR_FROM, end: PRO_MONTH_REGULAR_FROM + 31 * day }]);
  assert.deepEqual(stretches.get('u-year'), [{ period: 'year', chargedBaht: 1562, start: AFTER, end: AFTER + 365 * day }]);
  const orders = calls.find(call => call.table === 'cashflow_prepaid_orders')!;
  const cycles = calls.find(call => call.table === 'cashflow_card_cycles')!;
  assert.deepEqual(orders.filters, ['status=eq.paid', `paid_at=lte.${at}`, `entitled_until=gt.${at}`]);
  assert.deepEqual(cycles.filters, ['refunded=eq.false', `period_start=lte.${at}`, `period_end=gt.${at}`]);
  assert.match(cycles.select!, /paid_order:cashflow_prepaid_orders\(period, created_at\)/);
  await proTokenLimits(db, now, ['u-year']);
  assert.ok(calls.slice(-2).every(call => call.filters.includes('user_id=in.u-year')), 'one account: filtered by its id');
  await assert.rejects(proTokenLimits(fakeDb({}, 'cashflow_card_cycles').db, now), { code: '42P01' });
});

test('the admin figures use each account\'s plan allowance; a trial cycle keeps the trial\'s', () => {
  const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const row = (userId: string, over: Partial<AiAccountRow>): AiAccountRow => ({ user_id: userId, messages: 10, failed_requests: 0, gemini_messages: 10, claude_messages: 0, krarok_tokens: 10,
    actual_usd: '0.010000', billable_usd: '0.010000', cache_overhead_usd: '0.000000', failed_attempt_usd: '0.000000', quota_overrun_usd: '0.000000',
    cache_saved_usd: '0.000000', escalated_usd: '0.000000', gemini_usd: '0.010000', claude_usd: '0.000000', other_usd: '0.000000',
    gemini_calls: 10, claude_calls: 0, gemini_failed_calls: 0, claude_failed_calls: 0, input_tokens: 1000, output_tokens: 100, cache_read_tokens: 0,
    cache_write_tokens: 0, thinking_tokens: 0, rows_without_cost_split: 0, cards_prepared: 0, cards_confirmed: 0, corrections: 0,
    tokens_used_up: false, latest_cycle_used: 10, latest_cycle_limit: 2500, is_admin: false, ...over });
  const accounts = [row(user(1), { latest_cycle_used: 600 }), row(user(2), { latest_cycle_used: 300 }), row(user(3), { latest_cycle_used: 20, latest_cycle_limit: 25 }), row(user(4), { latest_cycle_used: 900 })];
  const input: ReportInput = {
    window: monthWindow('2026-11'), periods: [], reportNotesUsd: 0, previous: null, generatedAt: new Date('2026-11-20T01:00:00Z'),
    stripe: { status: 'ready', feeByPayment: new Map(), refundByPayment: new Map(), totals: { gross: 0, refunds: 0, fees: 0, net: 0, payments: 0, otherCurrencies: false } },
    settings: costSettings([{ key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true }]),
    members: { profiles: [], granted: [], cancelling: 0, admins: [], inTrial: () => false },
    ai: { accounts, coverage: { rows: 40, with_routing: 0, with_cost_split: 0, cost_without_split_usd: '0.000000' }, days: { active: 1, near_cap: 0, at_cap: 0, max_usd: '0.000000' },
      reliability: { timeouts: 0, errors: 0, held_for_claude: 0, gemini_took_over: 0, escalations: 0, provider_retries: 0 }, feedback: { by_kind: {}, top_questions: [], requested_features: [] } },
    tokenLimits: new Map([[user(1), 600], [user(2), 750], [user(3), 900]]), trialTokens: 25,
  };
  const { metrics, accounts: figures } = computeReport(input);
  const fig = (n: number) => figures.find(item => item.userId === user(n))!;
  assert.deepEqual([fig(1).krarokTokensLeft, fig(1).tokensUsedUp], [0, true], 'a yearly member who used all 600');
  assert.deepEqual([fig(2).krarokTokensLeft, fig(2).tokensUsedUp], [450, false]);
  assert.deepEqual([fig(3).krarokTokensLeft, fig(3).tokensUsedUp], [5, false], 'the trial cycle keeps 25');
  assert.deepEqual([fig(4).krarokTokensLeft, fig(4).tokensUsedUp], [1600, false], 'no paid plan: the default allowance');
  assert.equal(metrics.ai.usedUpAccounts, 1);
});

// Owner, 2026-10-30: paid Pro refills on its renewal day (a new payment gives a new 1,650); admins on the 1st; Pro given
// by hand never refills: one allowance, used up = used up.
test('Pro given by hand is one allowance that never refills; paid Pro and admins keep their cycles', async () => {
  const config = aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-never-sent' });
  const months = ['2026-10-30T03:00:00Z', '2026-11-02T03:00:00Z', '2027-03-15T03:00:00Z'].map(at => allowance({ plan: 'pro' }, config, new Date(at)));
  assert.deepEqual(months.map(item => item.cycle), ['2026-10', '2026-10', '2026-10'], 'the same bucket every month: October\'s use still counts');
  assert.deepEqual(months.map(item => item.resetsAt), [null, null, null], 'no refill date');
  assert.match(months[0].cycle, /^(\d{4}-\d{2}(-\d{2})?|trial)$/, 'the usage table\'s cycle_key check accepts it');
  assert.equal(allowance({ plan: 'admin' }, config, new Date('2026-11-02T03:00:00Z')).cycle, '2026-11', 'admins: still the calendar month');
  const paid = allowance({ plan: 'pro', periodEnd: '2026-11-29T05:00:00Z' }, config, new Date('2026-11-02T03:00:00Z'));
  assert.deepEqual([paid.cycle, paid.resetsAt?.toISOString()], ['2026-10-29', '2026-11-28T17:00:00.000Z'], 'paid Pro: its own month, renewing on the renewal day');
  const { refuse } = await import('../backend/src/ai/service');
  assert.throws(() => refuse('tokens', null), (error: any) => error.status === 402 && /โทเคนที่ได้รับหมดแล้ว/.test(error.message) && !/รอบถัดไป/.test(error.message));
  assert.throws(() => refuse('tokens', new Date('2026-11-28T17:00:00.000Z')), /จะได้รับใหม่วันที่ 29 พ\.ย\. 2569/);
});

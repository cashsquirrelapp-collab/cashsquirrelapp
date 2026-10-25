import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPECTED_COSTS, bangkokMonth, computeReport, costSettings, estimatedCardFeeSatang, lineReportText, microUsd, monthWindow, satangFromMicroUsd, shiftMonth,
  type AiAccountRow, type AiMonth, type PaidPeriod, type ReportInput, type StripeMonth,
} from '../backend/src/services/adminProfitReport';
import { adminRecipients, buildReport, deliverReport, lineQuotaLeft, loadConfidentialBlocked, loadPaidPeriods, loadStripeMonth, retryKey, saveReport, writeNote, type StoredReport } from '../backend/src/services/adminProfitReportRun';
import { analyticsPayments } from '../backend/src/services/adminAnalyticsPayments';

// The owner's monthly profit report (brief "KRAROK AI PROFIT INTELLIGENCE", 2026-10-25), with expected figures worked
// out by hand. Synthetic accounts, no network, no keys.

const OCT = monthWindow('2026-10');
const SETTINGS = costSettings([
  { key: 'domain', kind: 'fixed_yearly', label: 'โดเมน', amount: '350.0000', active: true },
  { key: 'coding_tool', kind: 'fixed_monthly', label: 'เครื่องมือเขียนโค้ด', amount: '750.0000', active: true },
  { key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true },
]);
const user = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const usd = (micro: number) => (micro / 1_000_000).toFixed(6);
function aiRow(userId: string, actual: number, over: Partial<AiAccountRow> = {}): AiAccountRow {
  return { user_id: userId, messages: 10, failed_requests: 0, gemini_messages: 10, claude_messages: 0, krarok_tokens: 10,
    actual_usd: usd(actual), billable_usd: usd(actual), cache_overhead_usd: '0.000000', failed_attempt_usd: '0.000000', quota_overrun_usd: '0.000000',
    cache_saved_usd: '0.000000', escalated_usd: '0.000000', gemini_usd: usd(actual), claude_usd: '0.000000', other_usd: '0.000000',
    gemini_calls: 10, claude_calls: 0, gemini_failed_calls: 0, claude_failed_calls: 0, input_tokens: 1000, output_tokens: 100, cache_read_tokens: 0,
    cache_write_tokens: 0, thinking_tokens: 0, rows_without_cost_split: 0, cards_prepared: 0, cards_confirmed: 0, corrections: 0,
    tokens_used_up: false, latest_cycle_used: 10, latest_cycle_limit: 2500, is_admin: false, ...over };
}
const aiMonth = (accounts: AiAccountRow[], over: Partial<AiMonth> = {}): AiMonth => ({
  accounts, coverage: { rows: accounts.reduce((s, a) => s + a.messages, 0), with_routing: 0, with_cost_split: 0, cost_without_split_usd: '0.000000' },
  days: { active: 1, near_cap: 0, at_cap: 0, max_usd: '0.000000' },
  reliability: { timeouts: 0, errors: 0, held_for_claude: 0, gemini_took_over: 0, escalations: 0, provider_retries: 0 },
  feedback: { by_kind: {}, top_questions: [], requested_features: [] }, ...over });
const period = (userId: string, amount: number, paidAt: string, end: string, over: Partial<PaidPeriod> = {}): PaidPeriod =>
  ({ paymentId: `pi_${userId.slice(-4)}_${paidAt.slice(5, 10)}`, userId, amountSatang: amount, paidAt, start: paidAt, end, refunded: false, ...over });
const stripeReady = (periods: PaidPeriod[], fee = 1800, over: Partial<NonNullable<StripeMonth['totals']>> = {}): StripeMonth => {
  const gross = periods.reduce((s, p) => s + p.amountSatang, 0);
  return { status: 'ready', feeByPayment: new Map(periods.map(p => [p.paymentId, fee])), refundByPayment: new Map(),
    totals: { gross, refunds: 0, fees: fee * periods.length, net: gross - fee * periods.length, payments: periods.length, otherCurrencies: false, ...over } };
};
function input(over: Partial<ReportInput>): ReportInput {
  return { window: OCT, ai: aiMonth([]), periods: [], stripe: stripeReady([]), settings: SETTINGS, reportNotesUsd: 0, previous: null,
    members: { profiles: [], granted: [], cancelling: 0, admins: [], inTrial: () => false }, generatedAt: new Date('2026-11-01T01:00:00Z'), ...over };
}

test('Bangkok months: the 1st 00:00 is in, the next 1st 00:00 is out', () => {
  assert.deepEqual([OCT.start.toISOString(), OCT.end.toISOString()], ['2026-09-30T17:00:00.000Z', '2026-10-31T17:00:00.000Z']);
  assert.deepEqual([bangkokMonth(new Date('2026-10-31T16:59:59Z')), bangkokMonth(new Date('2026-10-31T17:00:00Z'))], ['2026-10', '2026-11']);
  assert.deepEqual([shiftMonth('2026-01', -1), shiftMonth('2026-12', 1)], ['2025-12', '2027-01']);
  assert.throws(() => monthWindow('2026-13'));
});

test('amounts stay exact: millionths of a dollar and satang, rounded once', () => {
  assert.deepEqual([microUsd('0.000001'), microUsd('12.3456785'), microUsd('0'), microUsd(null), microUsd('0.1') + microUsd('0.2')], [1, 12_345_679, 0, 0, 300_000]);
  assert.equal(satangFromMicroUsd(1_000_000, 335_000), 3350, '$1 at ฿33.50');
  assert.equal(satangFromMicroUsd(150, 335_000), 1, 'half a satang rounds up');
  assert.equal(SETTINGS.fixedMonthlySatang, 77_917, '฿750 + ฿350 / 12 = ฿779.17, the brief\'s baseline');
  assert.equal(SETTINGS.rate4, 335_000);
  assert.equal(estimatedCardFeeSatang(17_700), 1761, '(3.65% + ฿10) with 7% VAT on ฿177');
  assert.equal(costSettings([]).rate4, null, 'no rate is not 0');
});

test('0, 5, 10, 15, 30 and 100 paying members: totals, profit and break-even worked out by hand', () => {
  // Each member pays ฿177 on 5 Oct (Stripe fee ฿18) and uses $0.50 of AI; the shared prompt cache costs the app $1.
  const expected: Record<number, { contribution: number; operating: number; breakEven: number | null }> = {
    0: { contribution: 0, operating: -77_917, breakEven: null },
    5: { contribution: 67_775, operating: -10_142, breakEven: 6 },
    10: { contribution: 138_900, operating: 60_983, breakEven: 6 },
    15: { contribution: 210_025, operating: 132_108, breakEven: 6 },
    30: { contribution: 423_400, operating: 345_483, breakEven: 6 },
    100: { contribution: 1_419_150, operating: 1_341_233, breakEven: 6 },
  };
  for (const [n, want] of Object.entries(expected).map(([key, value]) => [Number(key), value] as const)) {
    const ids = Array.from({ length: n }, (_, i) => user(i + 1));
    const periods = ids.map(id => period(id, 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z'));
    const rows = ids.map((id, i) => aiRow(id, 500_000 + (i === 0 ? 1_000_000 : 0), i === 0 ? { cache_overhead_usd: '1.000000' } : {}));
    const { metrics } = computeReport(input({ periods, stripe: stripeReady(periods), ai: aiMonth(rows) }));
    assert.equal(metrics.status, 'COMPLETE', `${n}`);
    assert.deepEqual([metrics.members.paidAtEnd, metrics.members.newPaying, metrics.revenue.gross, metrics.revenue.fees], [n, n, 17_700 * n, 1800 * n], `${n}`);
    assert.equal(metrics.ai.thb?.total ?? 0, n ? 1675 * n + 3350 : 0, `${n} AI in baht`);
    assert.deepEqual([metrics.profit.contribution, metrics.profit.operating, metrics.profit.breakEvenMembers], [want.contribution, want.operating, want.breakEven], `${n}`);
  }
});

test('light, heavy and no-AI members: own use per account, the shared cost split only among paying members, never counted twice', () => {
  const [light, heavy, none, trial, admin] = [1, 2, 3, 4, 5].map(user);
  const periods = [light, heavy, none].map(id => period(id, 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z'));
  const rows = [
    aiRow(light, 100_000),
    aiRow(heavy, 5_300_000, { cache_overhead_usd: '0.300000', claude_usd: '5.000000', gemini_usd: '0.300000', messages: 400, tokens_used_up: true, latest_cycle_used: 2500 }),
    aiRow(trial, 50_000, { latest_cycle_limit: 25, latest_cycle_used: 5 }),
    aiRow(admin, 2_000_000, { is_admin: true, latest_cycle_limit: null }),
  ];
  const { metrics, accounts } = computeReport(input({ periods, stripe: stripeReady(periods), ai: aiMonth(rows),
    members: { profiles: [trial].map(id => ({ user_id: id, created_at: '2026-10-30T00:00:00Z' })), granted: [], cancelling: 0, admins: [admin], inTrial: () => true } }));
  const by = Object.fromEntries(accounts.map(a => [a.userId, a]));
  // Platform: $0.30 shared cache → ฿10.05 = 1005 satang, split across 3 paying members = 335 each.
  assert.equal(metrics.ai.thb?.platform, 1005);
  assert.deepEqual([by[light].allocatedPlatform, by[heavy].allocatedPlatform, by[none].allocatedPlatform, by[trial].allocatedPlatform, by[admin].allocatedPlatform], [335, 335, 335, null, null]);
  assert.equal(metrics.ai.usd.direct + metrics.ai.usd.platform, metrics.ai.usd.total, 'own use + shared = total, once');
  assert.deepEqual([by[heavy].directUsd, by[heavy].ownPlatformUsd, by[heavy].directAi], [5_000_000, 300_000, 16_750]);
  // Heavy: ฿177 − ฿18 − ฿167.50 = −฿8.50, then −฿3.35 shared = −฿11.85.
  assert.deepEqual([by[heavy].contribution, by[heavy].allocatedContribution], [-850, -1185]);
  assert.deepEqual([by[light].contribution, by[none].contribution, by[none].messages], [15_565, 15_900, 0]);
  assert.deepEqual([by[trial].plan, by[admin].plan, by[heavy].plan, by[trial].krarokTokensLeft, by[admin].krarokTokensLeft], ['trial', 'admin', 'paid', 20, null]);
  assert.deepEqual([metrics.profit.negativeMembers, metrics.profit.positiveMembers, metrics.ai.paidMembersWithoutAi, metrics.ai.usedUpAccounts, metrics.members.trials], [1, 2, 1, 1, 1]);
  assert.equal(metrics.members.payingThisMonth, 3, 'the admin and the trial are not paying members');
  assert.deepEqual([metrics.ai.accountMax, metrics.ai.accountMedian], [by[heavy].ai, by[light].ai], 'spread over accounts using AI, admins left out');
});

test('a plan change mid-month, a refund and an unpaid attempt: cash and service-period revenue', () => {
  const [changer, refunded] = [1, 2].map(user);
  const month = period(changer, 17_700, '2026-10-01T17:00:00Z', '2026-11-01T17:00:00Z', { paymentId: 'pi_month' });
  const year = period(changer, 156_200, '2026-10-19T17:00:00Z', '2027-10-19T17:00:00Z', { paymentId: 'pi_year' });
  const back = period(refunded, 17_700, '2026-10-02T17:00:00Z', '2026-11-02T17:00:00Z', { paymentId: 'pi_back', refunded: true });
  const stripe = stripeReady([month, year, back], 1800, { refunds: 17_700 });
  stripe.refundByPayment = new Map([['pi_back', 17_700]]);
  const { metrics, accounts } = computeReport(input({ periods: [month, year, back], stripe, ai: aiMonth([]) }));
  const by = Object.fromEntries(accounts.map(a => [a.userId, a]));
  assert.deepEqual([metrics.revenue.gross, metrics.revenue.refunds, metrics.revenue.net], [191_600, 17_700, 173_900]);
  // Service period: 30 of the month plan's 31 days (17,129) + 12 of the year's 365 days (5,135).
  assert.equal(by[changer].earnedRevenue, 22_264);
  assert.deepEqual([by[changer].cashRevenue, by[refunded].refunds, by[refunded].earnedRevenue], [173_900, 17_700, 0]);
  assert.deepEqual([metrics.members.paidAtEnd, metrics.members.newPaying, metrics.members.ended], [1, 1, 0], 'a refunded purchase is not a member');
});

test('reconciliation: totals that disagree are UNRECONCILED; without Stripe the fees are estimates; with nothing, nothing is shown as 0', () => {
  const p = [period(user(1), 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z')];
  const off = computeReport(input({ periods: p, stripe: stripeReady(p, 1800, { gross: 35_400 }), ai: aiMonth([aiRow(user(1), 100_000)]) })).metrics;
  assert.deepEqual([off.status, off.sections.revenue.status, off.revenue.difference], ['UNRECONCILED', 'UNRECONCILED', 17_700]);
  const noStripe = computeReport(input({ periods: p, stripe: { status: 'unavailable', error: 'stripe_permission' }, ai: aiMonth([]) })).metrics;
  assert.deepEqual([noStripe.status, noStripe.revenue.feesSource, noStripe.revenue.fees, noStripe.revenue.gross], ['PARTIAL', 'estimate', 1761, 17_700]);
  const nothing = computeReport(input({ periods: null, paymentsError: 'อ่านข้อมูลไม่สำเร็จ', stripe: { status: 'unavailable' }, ai: null, aiError: 'ยังไม่ได้รัน SQL ของรายงาน' })).metrics;
  assert.deepEqual([nothing.status, nothing.revenue.gross, nothing.profit.contribution, nothing.profit.operating], ['FAILED', null, null, null]);
  const text = lineReportText(nothing, 'x');
  assert.match(text, /รับชำระ ยังไม่ทราบ/);
  assert.doesNotMatch(text, /รับชำระ ฿0/);
  assert.match(text, /ยังไม่ได้รัน SQL ของรายงาน/);
});

test('no dollar rate: dollars only and PARTIAL; usage without a cost split: PARTIAL; model split that does not add up: UNRECONCILED', () => {
  const noRate = computeReport(input({ settings: { ...SETTINGS, rate4: null }, ai: aiMonth([aiRow(user(1), 100_000)]) })).metrics;
  assert.deepEqual([noRate.sections.ai.status, noRate.ai.thb, noRate.ai.usd.total, noRate.profit.contribution], ['PARTIAL', null, 100_000, null]);
  const unsplit = computeReport(input({ ai: aiMonth([aiRow(user(1), 100_000)], { coverage: { rows: 1, with_routing: 0, with_cost_split: 0, cost_without_split_usd: '0.100000' } }) })).metrics;
  assert.equal(unsplit.sections.ai.status, 'PARTIAL');
  const mismatch = computeReport(input({ ai: aiMonth([aiRow(user(1), 100_000, { gemini_usd: '0.050000' })]) })).metrics;
  assert.equal(mismatch.status, 'UNRECONCILED');
});

test('month over month: no report, from zero, the same, up, and a smaller loss — never divided by zero', () => {
  const p = [period(user(1), 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z')];
  const first = computeReport(input({ periods: p, stripe: stripeReady(p), ai: aiMonth([aiRow(user(1), 100_000)]) })).metrics;
  assert.equal(first.comparison.gross.kind, 'none');
  const fromZero = computeReport(input({ periods: p, stripe: stripeReady(p), previous: { ...first, revenue: { ...first.revenue, gross: 0 } } })).metrics;
  assert.deepEqual([fromZero.comparison.gross.kind, fromZero.comparison.gross.percentBp], ['new', null]);
  const up = computeReport(input({ periods: p, stripe: stripeReady(p), previous: { ...first, revenue: { ...first.revenue, gross: 11_800 } } })).metrics;
  assert.deepEqual([up.comparison.gross.change, up.comparison.gross.percentBp], [5900, 5000]);
  const loss = computeReport(input({ previous: { ...first, profit: { ...first.profit, operating: -155_834 } } })).metrics;
  assert.deepEqual([loss.profit.operating, loss.comparison.operating.percentBp], [-77_917, 5000], 'a loss halved is +50%');
  assert.equal(computeReport(input({ previous: first })).metrics.comparison.paidAtEnd.percentBp, -10_000);
});

test('the note: only numbers already in the facts; a made-up figure is replaced by the code\'s note; its cost is kept', async () => {
  const p = [period(user(1), 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z')];
  const { metrics } = computeReport(input({ periods: p, stripe: stripeReady(p), ai: aiMonth([aiRow(user(1), 100_000)]) }));
  const reply = (text: string): typeof fetch => (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }))) as unknown as typeof fetch;
  const config = { enabled: true, geminiKey: 'g', chatModel: 'gemini-3.5-flash-lite', timeoutMs: 30_000 };
  const good = await writeNote(metrics, config, reply('สมาชิก Pro ณ สิ้นเดือน 1 คน ควรติดตามค่า AI ต่อสมาชิกในเดือนถัดไป'));
  assert.deepEqual([good.by, good.usd], ['ai', 550], '1,000 in + 100 out on Flash-Lite = $0.00055');
  const invented = await writeNote(metrics, config, reply('กำไรจะเพิ่มเป็น ฿99,999 ในเดือนหน้า'));
  assert.deepEqual([invented.by, invented.usd], ['code', 550]);
  let called = false;
  const off = await writeNote(metrics, { ...config, enabled: false }, (async () => { called = true; return new Response('{}'); }) as unknown as typeof fetch);
  assert.deepEqual([off.by, off.usd, called], ['code', 0, false]);
  // The note's cost is the platform's: it counts in the month the note was written.
  const next = computeReport(input({ window: monthWindow('2026-11'), reportNotesUsd: 550, ai: aiMonth([]) })).metrics;
  assert.deepEqual([next.ai.usd.reportNotes, next.ai.usd.platform], [550, 550]);
});

test('the LINE message: business totals only, formal, under LINE\'s limit, no account ids', () => {
  const ids = Array.from({ length: 30 }, (_, i) => user(i + 1));
  const periods = ids.map(id => period(id, 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z'));
  const ai = aiMonth(ids.map(id => aiRow(id, 400_000)), { feedback: { by_kind: { not_available: 3 }, top_questions: [{ question: 'ส่งใบแจ้งหนี้ทางอีเมลได้ไหม', times: 3, accounts: 2 }], requested_features: [] } });
  const { metrics } = computeReport(input({ periods, stripe: stripeReady(periods), ai }));
  const text = lineReportText(metrics, 'ตัวเลขเดือนนี้ไม่มีรายการที่ต้องระวังเป็นพิเศษ');
  assert.ok(text.length < 5000);
  for (const id of ids) assert.equal(text.includes(id), false);
  assert.match(text, /^รายงานประจำเดือน ต\.ค\. 2569\nสถานะข้อมูล: ข้อมูลครบ/);
  assert.match(text, /สมาชิก Pro ณ สิ้นเดือน 30 คน/);
  assert.match(text, /“ส่งใบแจ้งหนี้ทางอีเมลได้ไหม” 3 ครั้ง/);
  assert.match(text, /ตัวเลขรายบัญชีดูได้ใน Supabase เท่านั้น/);
  assert.doesNotMatch(text, /ค้าบ|นะคะ|จ้า|฿0\.00/, 'formal words; a zero is ฿0');
});

// ---------- loading and delivery, with a small in-memory stand-in for Supabase ----------
function fakeDb(tables: Record<string, any[]>) {
  const updates: { table: string; values: any; id?: string }[] = [];
  const get = (row: any, path: string) => path.split('.').reduce((value, key) => value?.[key], row);
  const query = (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    let range: [number, number] | null = null; let single = false; let update: any = null;
    const q: any = {
      select: () => q, order: () => q,
      eq: (c: string, v: unknown) => { filters.push(row => get(row, c) === v); return q; },
      in: (c: string, v: unknown[]) => { filters.push(row => v.includes(get(row, c))); return q; },
      gte: (c: string, v: string) => { filters.push(row => row[c] >= v); return q; },
      lt: (c: string, v: string) => { filters.push(row => row[c] < v); return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      maybeSingle: () => { single = true; return q; },
      update: (values: any) => { update = values; return q; },
      upsert: (row: any) => { const list = (tables[table] ??= []); const at = list.findIndex(item => item.id === row.id); if (at >= 0) list[at] = { ...list[at], ...row }; else list.push({ delivery: {}, delivered_at: null, ...row }); filters.push(item => item.id === row.id); return q; },
      single: () => { single = true; return q; },
      then: (resolve: (value: unknown) => void) => {
        const rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
        if (update) { for (const row of rows) Object.assign(row, update); updates.push({ table, values: update, id: rows[0]?.id }); resolve({ data: null, error: null }); return; }
        const data = range ? rows.slice(range[0], range[1] + 1) : rows;
        resolve({ data: single ? data[0] ?? null : data, error: null });
      },
    };
    return q;
  };
  const calls: { name: string; args: any }[] = [];
  return { from: query, rpc: async (name: string, args: any) => { calls.push({ name, args }); return name === 'cashflow_admin_ai_month' && tables.__ai ? { data: tables.__ai[0], error: null } : { data: null, error: { code: 'PGRST202' } }; }, updates, calls };
}

test('payments: counted once though delivered twice, each with the period it bought; a one-month payment without one gets a month', async () => {
  const [a, b] = [1, 2].map(user);
  const db = fakeDb({
    subscriptions: [{ user_id: a, status: 'active', plan: 'monthly', current_period_end: null, stripe_customer_id: 'cus_a', stripe_livemode: true }],
    cashflow_payments: [{ payment_id: 'pi_legacy', user_id: b, amount: 14_900, currency: 'thb', paid_at: '2026-10-10T00:00:00Z', refunded: false }],
    cashflow_promptpay_payments: [],
    cashflow_stripe_events: [],
    cashflow_prepaid_orders: [
      { payment_id: 'pi_half', user_id: a, amount: 89_500, paid_at: '2026-10-05T00:00:00Z', status: 'paid', livemode: true, entitled_until: '2027-04-05T00:00:00Z' },
      { payment_id: 'pi_test', user_id: a, amount: 17_700, paid_at: '2026-10-06T00:00:00Z', status: 'paid', livemode: false, entitled_until: '2026-11-06T00:00:00Z' },
    ],
    cashflow_card_cycles: [],
  });
  const { periods } = await loadPaidPeriods(db as any, (legacy, promptPay, events, subs, options) => analyticsPayments([...legacy, ...legacy], promptPay, events, subs, { ...options, retrieveInvoice: async () => { throw new Error('no invoices here'); } }));
  assert.deepEqual(periods.map(p => [p.paymentId, p.userId, p.amountSatang, p.start, p.end]).sort(), [
    ['pi_half', a, 89_500, '2026-10-05T00:00:00Z', '2027-04-05T00:00:00Z'],
    ['pi_legacy', b, 14_900, '2026-10-10T00:00:00Z', '2026-11-10T00:00:00.000Z'],
  ], 'test-mode orders are not revenue; the duplicated legacy row is one payment');
});

test('Stripe: totals from balance transactions, the fee and refunds per payment; a missing permission keeps no Stripe text', async () => {
  const list = (data: any[]) => async () => ({ data, has_more: false });
  const client: any = {
    balanceTransactions: { list: list([
      { id: 'txn_1', reporting_category: 'charge', type: 'charge', currency: 'thb', amount: 17_700, fee: 1_761, net: 15_939 },
      { id: 'txn_2', reporting_category: 'refund', type: 'refund', currency: 'thb', amount: -17_700, fee: 0, net: -17_700 },
    ]) },
    charges: { list: list([{ id: 'ch_1', status: 'succeeded', payment_intent: 'pi_1', balance_transaction: { currency: 'thb', fee: 1_761 } }]) },
    refunds: { list: list([{ id: 're_1', status: 'succeeded', currency: 'thb', amount: 17_700, payment_intent: 'pi_0' }]) },
  };
  const month = await loadStripeMonth(client, OCT, true);
  assert.deepEqual([month.status, month.totals?.gross, month.totals?.refunds, month.totals?.fees, month.feeByPayment?.get('pi_1'), month.refundByPayment?.get('pi_0')],
    ['ready', 17_700, 17_700, 1_761, 1_761, 17_700]);
  const denied: any = { ...client, charges: { list: async () => { throw Object.assign(new Error('rk_live_secret acct_123'), { statusCode: 403 }); } } };
  assert.deepEqual(await loadStripeMonth(denied, OCT, true), { status: 'unavailable', error: 'stripe_permission' });
  assert.deepEqual(await loadStripeMonth(client, OCT, false), { status: 'not_live' });
});

test('delivery: system admins who linked LINE only; quota too low keeps it unsent; once a day; never twice; a stable UUID retry key', async () => {
  const [owner, otherAdmin, member] = [1, 2, 3].map(user);
  const tables = {
    cashflow_user_roles: [{ user_id: owner, role: 'admin' }, { user_id: otherAdmin, role: 'admin' }, { user_id: member, role: 'user' }],
    cashflow_line_links: [{ user_id: owner, line_user_id: 'U_owner' }, { user_id: member, line_user_id: 'U_member' }],
    cashflow_admin_reports: [] as any[],
  };
  const db = fakeDb(tables);
  assert.deepEqual(await adminRecipients({ db: db as any }), [{ userId: owner, lineUserId: 'U_owner' }], 'a member with LINE never gets it; an admin without LINE cannot');
  assert.deepEqual(await adminRecipients({ db: db as any, allowEmails: ['someone@example.test'], emailOf: async () => 'owner@example.test' }), []);
  const { metrics, accounts } = computeReport(input({}));
  const report: StoredReport = { id: 'monthly:2026-10', month: '2026-10', status: metrics.status, metrics, accounts, settings: {}, note: 'ทดสอบ', note_cost_usd: '0', delivery: {}, delivered_at: null };
  tables.cashflow_admin_reports.push(report);
  const claims = new Set<string>();
  const claim = async (key: string) => (claims.has(key) ? false : (claims.add(key), true));
  const sent: { to: string; key: string; text: string }[] = [];
  const push = async (to: string, message: any, key: string) => { sent.push({ to, key, text: message.text }); return 'accepted' as const; };
  const quota = (left: number): typeof fetch => (async (url: string) => new Response(JSON.stringify(String(url).endsWith('consumption') ? { totalUsage: 200 - left } : { type: 'limited', value: 200 }))) as unknown as typeof fetch;

  const day1 = new Date('2026-11-01T01:00:00Z');
  assert.equal(await deliverReport(report, { db: db as any, token: 't', fetchImpl: quota(0), push, claim, now: day1 }), 'quota');
  assert.equal(sent.length, 0);
  assert.equal(report.delivered_at, null, 'kept to send again');
  assert.equal(await deliverReport(report, { db: db as any, token: 't', fetchImpl: quota(50), push, claim, now: day1 }), 'claimed', 'one attempt a day');
  const day2 = new Date('2026-11-02T01:00:00Z');
  assert.equal(await deliverReport(report, { db: db as any, token: 't', fetchImpl: quota(50), push, claim, now: day2 }), 'delivered');
  assert.deepEqual(sent.map(s => s.to), ['U_owner']);
  assert.match(sent[0].key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(sent[0].key, retryKey('monthly:2026-10', 'U_owner', '2026-11-02'));
  assert.equal((report.delivery.attempts ?? []).length, 2);
  assert.equal(JSON.stringify(report.delivery).includes('U_owner'), false, 'the delivery log keeps no LINE id');
  assert.equal(await deliverReport(report, { db: db as any, token: 't', fetchImpl: quota(50), push, claim, now: new Date('2026-11-03T01:00:00Z') }), 'already');
  assert.equal(sent.length, 1, 'never sent twice');
  assert.deepEqual(await lineQuotaLeft(undefined), { left: null, read: 'unknown' });
});

test('end to end: records in, report saved with the settings it used; the SQL not yet run shows as a reason, not as zero', async () => {
  const [member, trial] = [1, 2].map(user);
  const tables: Record<string, any[]> = {
    cashflow_admin_cost_settings: [
      { key: 'coding_tool', kind: 'fixed_monthly', label: 'เครื่องมือเขียนโค้ด', amount: '750.0000', active: true },
      { key: 'domain', kind: 'fixed_yearly', label: 'โดเมน', amount: '350.0000', active: true },
      { key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true }],
    subscriptions: [], cashflow_payments: [], cashflow_promptpay_payments: [], cashflow_stripe_events: [], cashflow_card_cycles: [],
    cashflow_prepaid_orders: [{ payment_id: 'pi_m', user_id: member, amount: 17_700, paid_at: '2026-10-05T00:00:00Z', status: 'paid', livemode: true, entitled_until: '2026-11-05T00:00:00Z' }],
    cashflow_profiles: [{ user_id: member, created_at: '2026-10-01T00:00:00Z' }, { user_id: trial, created_at: '2026-10-30T00:00:00Z' }],
    cashflow_card_subscriptions: [], cashflow_user_roles: [], cashflow_admin_reports: [],
    __ai: [aiMonth([aiRow(member, 200_000)])],
  };
  const db = fakeDb(tables);
  const deps = { db: db as any, stripe: null, stripeLive: true, ai: { enabled: false, geminiKey: undefined, chatModel: 'gemini-3.5-flash-lite', timeoutMs: 30_000, dailyCostCapUsd: 5, proTokensPerCycle: 2500, trialTokens: 25 },
    now: new Date('2026-11-01T01:00:00Z'), verifyPayments: ((l: any, p: any, e: any, s: any, o: any) => analyticsPayments(l, p, e, s, { ...o, retrieveInvoice: async () => { throw new Error('none'); } })) as any };
  const built = await buildReport('2026-10', deps);
  assert.deepEqual(db.calls.map(call => [call.name, call.args.p_start, call.args.p_end, call.args.p_pro_tokens]), [['cashflow_admin_ai_month', '2026-09-30T17:00:00.000Z', '2026-10-31T17:00:00.000Z', 2500]]);
  assert.equal(built.metrics.status, 'PARTIAL', 'no Stripe client: the app\'s payments, fees estimated');
  assert.deepEqual([built.metrics.revenue.gross, built.metrics.revenue.fees, built.metrics.ai.thb?.total, built.metrics.members.paidAtEnd, built.metrics.members.trials, built.note.by],
    [17_700, 1761, 670, 1, 1, 'code']);
  const saved = await saveReport(db as any, '2026-10', built);
  assert.deepEqual([saved.id, saved.status, (saved.settings as any).fixedMonthlySatang, saved.note_cost_usd], ['monthly:2026-10', 'PARTIAL', 77_917, '0.000000']);
  // Before the report's SQL runs: the AI part says so; nothing is shown as ฿0.
  delete tables.__ai;
  const before = await buildReport('2026-10', deps);
  assert.deepEqual([before.metrics.sections.ai.status, before.metrics.ai.thb, before.metrics.sections.ai.notes[0]], ['FAILED', null, 'อ่านข้อมูลค่า AI ไม่ได้ (ยังไม่ได้รัน SQL ของรายงาน)']);
  assert.equal(before.metrics.profit.contribution, null);
});

test('the scheduled handler: only with the cron secret, only a past month by hand', async () => {
  process.env.CRON_SECRET = 'cron-secret-for-tests-'.repeat(2);
  const { default: handler } = await import('../backend/src/handlers/send-admin-profit-report');
  const res: any = { setHeader() { return res; }, json() { return res; } };
  const call = (headers: Record<string, string>, query: Record<string, string> = {}) => handler({ method: 'GET', headers, query } as any, res);
  await assert.rejects(call({}), (error: any) => error.status === 401);
  await assert.rejects(call({ authorization: 'Bearer wrong' }), (error: any) => error.status === 401);
  await assert.rejects(call({ authorization: `Bearer ${process.env.CRON_SECRET}` }, { month: '2999-01' }), (error: any) => error.status === 400, 'not a month still running');
  await assert.rejects(call({ authorization: `Bearer ${process.env.CRON_SECRET}` }, { month: 'abc' }), (error: any) => error.status === 400);
  const { routeHandler } = await import('../backend/src/http/router');
  assert.equal(typeof routeHandler, 'function');
  const routerSource = (await import('node:fs')).readFileSync(new URL('../backend/src/http/router.ts', import.meta.url), 'utf8');
  assert.match(routerSource, /'send-admin-profit-report':adminProfitReport/);
});

// ---------- Master Backlog, Part 4–5 gaps (2026-10-25) ----------
test('gaps: every account and new sign-ups, failed card charges, costs not known yet, answers the confidentiality check changed', async () => {
  const [a, b, c] = [1, 2, 3].map(user);
  const periods = [period(a, 17_700, '2026-10-04T17:00:00Z', '2026-11-04T17:00:00Z')];
  const stripe = stripeReady(periods, 1800, { failed: { count: 2, amount: 35_400 } });
  const members = { profiles: [{ user_id: a, created_at: '2026-09-01T00:00:00Z' }, { user_id: b, created_at: '2026-10-10T00:00:00Z' }, { user_id: c, created_at: '2026-10-31T16:59:59Z' }],
    granted: [], cancelling: 0, admins: [], inTrial: () => false };
  const { metrics } = computeReport(input({ periods, stripe, members, confidentialBlocked: 4 }));
  assert.deepEqual([metrics.members.total, metrics.members.signedUp, metrics.revenue.failedPayments, metrics.revenue.failedAmount, metrics.reliability.confidentialBlocked],
    [3, 2, 2, 35_400, 4]);
  // Cloudflare, Supabase, LINE OA and storage have no amount in the settings: named, never filled in as ฿0.
  assert.deepEqual(metrics.profit.unknownCosts, EXPECTED_COSTS.map(cost => cost.label));
  assert.equal(metrics.sections.profit.status, 'PARTIAL');
  assert.match(metrics.sections.profit.notes.join('\n'), /กำไรยังไม่รวมค่าใช้จ่ายที่ยังไม่ทราบ: Cloudflare, Supabase, LINE OA, พื้นที่เก็บไฟล์/);
  const text = lineReportText(metrics, 'x');
  assert.match(text, /• บัญชีทั้งหมด 3 บัญชี \(สมัครใช้งานใหม่เดือนนี้ 2\)/);
  assert.match(text, /• ชำระไม่สำเร็จ 2 รายการ \(฿354\)/);
  assert.match(text, /• ยังไม่รวม Cloudflare, Supabase, LINE OA, พื้นที่เก็บไฟล์ \(ยังไม่ทราบตัวเลข\)/);
  assert.match(text, /• คำตอบที่ระบบกรองชื่อ AI หรือข้อมูลภายในออก 4 ครั้ง/);

  // Once the owner sets them (0 is an amount: a free plan), they count and nothing is listed.
  const all = costSettings([...['cloudflare', 'supabase', 'line_oa', 'storage'].map(key => ({ key, kind: 'fixed_monthly' as const, label: key, amount: '0', active: true })),
    { key: 'usd_thb', kind: 'fx_usd_thb', label: 'อัตรา', amount: '33.5000', active: true }]);
  const set = computeReport(input({ periods, stripe, members, settings: all })).metrics;
  assert.deepEqual([set.profit.unknownCosts, set.sections.profit.status], [[], 'COMPLETE']);
  assert.doesNotMatch(lineReportText(set, 'x'), /ยังไม่รวม/);

  // Unknown stays unknown: Stripe not read, the count not read, an older report without these fields.
  const unread = computeReport(input({ periods, stripe: { status: 'unavailable', error: 'stripe_permission' }, members })).metrics;
  assert.deepEqual([unread.revenue.failedPayments, unread.reliability.confidentialBlocked], [null, null]);
  const words = lineReportText(unread, 'x');
  assert.match(words, /• ชำระไม่สำเร็จ ยังไม่ทราบ รายการ/);
  assert.match(words, /ออก ยังไม่ทราบ ครั้ง/);
  const older = structuredClone(unread) as any;
  delete older.members.total; delete older.members.signedUp; delete older.profit.unknownCosts;
  assert.match(lineReportText(older, 'x'), /• บัญชีทั้งหมด ยังไม่ทราบ บัญชี/);
});

test('gaps: Stripe\'s failed charges are counted in baht; the confidentiality count is a head count of the month, null when unreadable', async () => {
  const list = (data: any[]) => async () => ({ data, has_more: false });
  const client: any = {
    balanceTransactions: { list: list([{ id: 'txn_1', reporting_category: 'charge', type: 'charge', currency: 'thb', amount: 17_700, fee: 1_761, net: 15_939 }]) },
    charges: { list: list([
      { id: 'ch_1', status: 'succeeded', currency: 'thb', amount: 17_700, payment_intent: 'pi_1', balance_transaction: { currency: 'thb', fee: 1_761 } },
      { id: 'ch_2', status: 'failed', currency: 'thb', amount: 17_700, payment_intent: 'pi_2', balance_transaction: null },
      { id: 'ch_3', status: 'failed', currency: 'usd', amount: 500, payment_intent: 'pi_3', balance_transaction: null },
    ]) },
    refunds: { list: list([]) },
  };
  const month = await loadStripeMonth(client, OCT, true);
  assert.deepEqual(month.totals?.failed, { count: 1, amount: 17_700 });

  const asked: string[] = [];
  const counting: any = { from: (table: string) => { const q: any = {
    select: (column: string, options: any) => { asked.push(`${table}:${column}:${options?.count}:${options?.head}`); return q; },
    gte: (c: string, v: string) => { asked.push(`gte ${c} ${v}`); return q; },
    lt: (c: string, v: string) => { asked.push(`lt ${c} ${v}`); return q; },
    not: (c: string, op: string, v: unknown) => { asked.push(`not ${c} ${op} ${v}`); return q; },
    then: (resolve: (value: unknown) => void) => resolve({ data: null, count: 7, error: null }) }; return q; } };
  assert.equal(await loadConfidentialBlocked(counting, OCT), 7);
  assert.deepEqual(asked, ['cashflow_ai_usage:request_id:exact:true', 'gte created_at 2026-09-30T17:00:00.000Z', 'lt created_at 2026-10-31T17:00:00.000Z', 'not routing->guard is null']);
  const failing: any = { from: () => { const q: any = { select: () => q, gte: () => q, lt: () => q, not: () => q, then: (resolve: (value: unknown) => void) => resolve({ data: null, count: null, error: { message: 'x' } }) }; return q; } };
  assert.equal(await loadConfidentialBlocked(failing, OCT), null);
});

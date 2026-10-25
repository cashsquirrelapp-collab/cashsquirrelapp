import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// The monthly profit report's database part (owner's brief, 2026-10-25): the AI cost of one Bangkok month per account,
// read from the usage records, on a real Postgres (PGlite) after the AI migrations the live database has.
// Synthetic accounts and amounts; the expected figures are worked out by hand below.

const A = '11111111-1111-4111-8111-111111111111'; // Pro, light use
const B = '22222222-2222-4222-8222-222222222222'; // Pro, heavy use, used up its tokens
const C = '33333333-3333-4333-8333-333333333333'; // trial
const D = '44444444-4444-4444-8444-444444444444'; // system admin
const START = '2026-09-30T17:00:00Z'; // 1 Oct 2569 00:00 Bangkok
const END = '2026-10-31T17:00:00Z'; // 1 Nov 2569 00:00 Bangkok

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}');
    create table public.cashflow_user_roles(user_id uuid primary key, role text not null);
    insert into public.cashflow_user_roles values('${A}','user'),('${B}','user'),('${C}','user'),('${D}','admin');`);
  await db.exec(await readFile('database/ai_secretary.sql', 'utf8'));
  for (const name of ['20261024120000_ai_proposal_args.sql', '20261025090000_ai_learning.sql', '20261025130000_ai_routing_log.sql', '20261025150000_ai_cost_accounting.sql', '20261025190000_admin_profit_report.sql'])
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'));
  return db;
}

const call = (provider: string, usd: number, extra: Record<string, unknown> = {}) => ({ provider, model: provider === 'anthropic' ? 'claude-sonnet-5-5' : 'gemini-3.5-flash-lite',
  route: 'chat', usd, billable_usd: usd, input: 1000, cached: 200, write: 0, write_1h: 0, output: 50, thinking: 0, steps: 1, ...extra });
const routing = (calls: unknown[], cost: Record<string, number> | null, extra: Record<string, unknown> = {}) => JSON.stringify({ v: 'routing-v2', tier: 'light', outcome: 'answer', calls,
  escalations: [], fallback: null, provider_retries: 0, ...(cost ? { cost } : {}), ...extra });
let n = 0;
async function usage(db: PGlite, user: string, at: string, cost: string, options: { status?: string; tokens?: number; model?: string | null; routing?: string | null; cycle?: string } = {}) {
  n += 1;
  await db.query(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,model,route,created_at,routing)
    values($1,$2,$3,$4,$5,$6,$7,'chat',$8,$9::jsonb)`,
  [`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user, options.cycle ?? '2026-10-01', options.tokens ?? 1, options.status ?? 'settled', cost,
    options.model === undefined ? 'gemini-3.5-flash-lite' : options.model, at, options.routing ?? null]);
}

test('the month\'s AI cost per account: exact amounts, the Bangkok month only, models, cache, failures and tokens', async () => {
  const db = await database();
  try {
    // A: two everyday Gemini answers, and one voice note (no per-call routing).
    await usage(db, A, START, '0.003400', { tokens: 4, routing: routing([call('gemini', 0.0034)], { actual_usd: 0.0034, billable_usd: 0.0034, cache_overhead_usd: 0, failed_attempt_usd: 0, quota_overrun_usd: 0, cache_saved_usd: 0.0001 }) });
    await usage(db, A, '2026-10-15T03:00:00Z', '0.002100', { tokens: 3, routing: routing([call('gemini', 0.0021)], { actual_usd: 0.0021, billable_usd: 0.0021, cache_overhead_usd: 0, failed_attempt_usd: 0, quota_overrun_usd: 0, cache_saved_usd: 0 }) });
    await usage(db, A, '2026-10-16T03:00:00Z', '0.000300', { tokens: 1 });
    // Outside the month: 30 Sep 23:59 and 1 Nov 00:00 Bangkok.
    await usage(db, A, '2026-09-30T16:59:59Z', '9.000000');
    await usage(db, A, END, '9.000000');
    // B: a document on Claude with a cache write the app pays, a failed request that still cost money, and an
    // escalation from Gemini to Claude. Its October cycle reached the 2,500-token allowance.
    await usage(db, B, '2026-10-10T05:00:00Z', '0.112000', { tokens: 30, model: 'claude-sonnet-5-5', routing: routing([call('anthropic', 0.112, { write_1h: 21000 })],
      { actual_usd: 0.112, billable_usd: 0.027, cache_overhead_usd: 0.085, failed_attempt_usd: 0, quota_overrun_usd: 0, cache_saved_usd: 0 }, { tier: 'smart' }) });
    await usage(db, B, '2026-10-11T05:00:00Z', '0.020000', { status: 'released', tokens: 0, model: null, routing: routing([call('anthropic', 0.02, { failed: true })],
      { actual_usd: 0.02, billable_usd: 0, cache_overhead_usd: 0, failed_attempt_usd: 0.02, quota_overrun_usd: 0, cache_saved_usd: 0 }, { outcome: 'error', error: 'timeout' }) });
    await usage(db, B, '2026-10-12T05:00:00Z', '0.030000', { tokens: 2470, model: 'claude-sonnet-5-5', routing: routing([call('gemini', 0.004), call('anthropic', 0.026)],
      { actual_usd: 0.03, billable_usd: 0.03, cache_overhead_usd: 0, failed_attempt_usd: 0, quota_overrun_usd: 0.002, cache_saved_usd: 0.004 }, { escalations: ['handoff_document'] }) });
    // C: the trial, 25 tokens, not used up. D: an admin, unlimited, never "used up".
    await usage(db, C, '2026-10-20T05:00:00Z', '0.005000', { tokens: 6, cycle: 'trial' });
    await usage(db, D, '2026-10-21T05:00:00Z', '0.050000', { tokens: 3000, cycle: '2026-10' });
    // Cards and corrections in the month.
    await db.exec(`insert into public.cashflow_ai_proposals(id,user_id,kind,job_id,title,status,created_at) values
      ('p_00000000-0000-4000-8000-000000000001','${B}','add_job','j1','งาน','applied','2026-10-10T05:00:00Z'),
      ('p_00000000-0000-4000-8000-000000000002','${B}','add_job','j2','งาน','cancelled','2026-10-12T05:00:00Z'),
      ('p_00000000-0000-4000-8000-000000000003','${B}','add_job','j3','งาน','applied','2026-09-12T05:00:00Z');
      insert into public.cashflow_ai_corrections(user_id,domain,subject,after_value,created_at) values('${B}','job_wht','งาน','3','2026-10-10T05:00:00Z');`);
    // Questions: one asked by two accounts is shown; one asked by a single account is only counted.
    await db.exec(`insert into public.cashflow_ai_knowledge_signals(user_id,kind,feature_id,question,channel,created_at) values
      ('${A}','not_available','email_invoice','ส่งใบแจ้งหนี้ทางอีเมลได้ไหม','app','2026-10-05T05:00:00Z'),
      ('${B}','not_available','email_invoice','ส่งใบแจ้งหนี้ทางอีเมลได้ไหม','line','2026-10-06T05:00:00Z'),
      ('${C}','feature_request','bank_feed','ผูกบัญชีธนาคารของฉันได้ไหม','app','2026-10-07T05:00:00Z');`);

    const result = (await db.query<{ r: any }>(`select public.cashflow_admin_ai_month($1,$2,5,2500,25) r`, [START, END])).rows[0].r;
    const by = Object.fromEntries(result.accounts.map((row: any) => [row.user_id, row]));
    assert.deepEqual(Object.keys(by).sort(), [A, B, C, D].sort());
    assert.deepEqual([by[A].messages, by[A].failed_requests, by[A].gemini_messages, by[A].claude_messages, by[A].krarok_tokens, by[A].actual_usd, by[A].gemini_usd, by[A].claude_usd],
      [3, 0, 3, 0, 8, '0.005800', '0.005800', '0.000000'], 'A: two routed answers and the voice note by its model; nothing outside the month');
    assert.deepEqual([by[B].messages, by[B].failed_requests, by[B].claude_messages, by[B].gemini_messages, by[B].actual_usd, by[B].claude_usd, by[B].gemini_usd],
      [2, 1, 2, 1, '0.162000', '0.158000', '0.004000'], 'B: the failed request is counted as a failure but its cost stays');
    assert.deepEqual([by[B].cache_overhead_usd, by[B].failed_attempt_usd, by[B].billable_usd, by[B].quota_overrun_usd, by[B].cache_saved_usd, by[B].escalated_usd],
      ['0.085000', '0.020000', '0.057000', '0.002000', '0.004000', '0.030000']);
    assert.deepEqual([by[B].cards_prepared, by[B].cards_confirmed, by[B].corrections, by[B].claude_failed_calls], [2, 1, 1, 1], 'only cards from this month');
    assert.deepEqual([by[B].tokens_used_up, by[A].tokens_used_up, by[C].tokens_used_up, by[D].tokens_used_up, by[D].is_admin], [true, false, false, false, true]);
    assert.deepEqual([by[B].latest_cycle_used, by[B].latest_cycle_limit, by[C].latest_cycle_limit], [2500, 2500, 25]);
    assert.equal(by[B].cache_write_tokens, 21000);
    assert.equal(by[A].rows_without_cost_split, 1, 'the voice note has no cost split: shown as such, not as zero overhead');
    assert.deepEqual(result.coverage, { rows: 8, with_routing: 5, with_cost_split: 5, cost_without_split_usd: '0.055300' });
    assert.deepEqual(result.reliability, { timeouts: 1, errors: 1, held_for_claude: 0, gemini_took_over: 0, escalations: 1, provider_retries: 0 });
    assert.deepEqual([result.days.active, result.days.near_cap, result.days.at_cap], [8, 0, 0]);
    assert.deepEqual(result.feedback.by_kind, { not_available: 2, feature_request: 1 });
    assert.deepEqual(result.feedback.top_questions, [{ question: 'ส่งใบแจ้งหนี้ทางอีเมลได้ไหม', times: 2, accounts: 2 }]);
    assert.deepEqual(result.feedback.requested_features, [{ feature: 'email_invoice', times: 2, accounts: 2 }]);

    // A quiet month: no rows, nothing invented.
    const empty = (await db.query<{ r: any }>(`select public.cashflow_admin_ai_month('2026-07-31T17:00:00Z','2026-08-31T17:00:00Z',5,2500,25) r`)).rows[0].r;
    assert.deepEqual([empty.accounts, empty.coverage.rows, empty.days.active, empty.feedback.top_questions], [[], 0, 0, []]);
  } finally { await db.close(); }
});

test('the report tables: settings kept on re-run, one report per month, browsers cannot read them', async () => {
  const db = await database();
  try {
    await db.exec(`update public.cashflow_admin_cost_settings set amount = 34 where key = 'usd_thb'`);
    await db.exec(await readFile('supabase/migrations/20261025190000_admin_profit_report.sql', 'utf8'));
    const settings = (await db.query<{ key: string; kind: string; amount: string }>(`select key, kind, amount::text from public.cashflow_admin_cost_settings order by key`)).rows;
    assert.deepEqual(settings, [{ key: 'coding_tool', kind: 'fixed_monthly', amount: '750.0000' }, { key: 'domain', kind: 'fixed_yearly', amount: '350.0000' }, { key: 'usd_thb', kind: 'fx_usd_thb', amount: '34.0000' }],
      'running it again keeps the owner\'s changes');
    await db.exec(`insert into public.cashflow_admin_reports(id,month,status,metrics) values('monthly:2026-10','2026-10','COMPLETE','{}')`);
    await assert.rejects(db.exec(`insert into public.cashflow_admin_reports(id,month,status,metrics) values('monthly:2026-10','2026-10','COMPLETE','{}')`));
    await assert.rejects(db.exec(`insert into public.cashflow_admin_reports(id,month,status,metrics) values('monthly:2026-11','2026-11','DONE','{}')`));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.cashflow_admin_reports'), role);
      await assert.rejects(db.query('select * from public.cashflow_admin_cost_settings'), role);
      await assert.rejects(db.query(`select public.cashflow_admin_ai_month(now(), now(), 5, 2500, 25)`), role);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

test('the owner\'s per-account SQL reads a saved report (read only)', async () => {
  const db = await database();
  try {
    const accounts = [{ userId: A, plan: 'paid', cashRevenue: 17_700, refunds: 0, fee: 1761, feeSource: 'stripe', earnedRevenue: 17_129, messages: 10, geminiMessages: 10,
      claudeMessages: 0, krarokTokens: 12, krarokTokensLeft: 2488, directAi: 670, allocatedPlatform: 335, contribution: 15_269, allocatedContribution: 14_934,
      earnedContribution: 14_698, cardsConfirmed: 1, aiUsd: 200_000 }];
    await db.query(`insert into public.cashflow_admin_reports(id,month,status,metrics,accounts) values('monthly:2026-10','2026-10','COMPLETE','{}',$1::jsonb)`, [JSON.stringify(accounts)]);
    const sql = (await readFile('database/profit_report_accounts.sql', 'utf8')).split('\n').filter(line => !line.startsWith('--')).join('\n');
    const rows = (await db.query<any>(sql)).rows;
    assert.deepEqual([rows.length, rows[0].account, rows[0].paid_baht, rows[0].ai_baht, rows[0].after_shared_baht, rows[0].ai_usd], [1, A, '177.00', '6.70', '149.34', '0.2000']);
  } finally { await db.close(); }
});

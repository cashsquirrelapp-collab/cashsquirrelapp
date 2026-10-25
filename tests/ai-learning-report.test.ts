import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { detectSignals, lookupSignal, redactQuestion } from '../backend/src/ai/signals';

// Package D (owner, 2026-10-25: "ทำชุด D ต่อ"): what the feature knowledge misses is noticed by rules (no model call)
// and kept without numbers; database/ai_learning_report.sql turns it, with cost, cards and corrections, into one
// read-only JSON report the owner runs in Supabase. Synthetic data only.

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('signals: not found, not available, asked for, and a menu answer the user says was wrong', () => {
  assert.deepEqual(detectSignals('ปุ่มสแกนบาร์โค้ดอยู่ตรงไหนในแอป').map(signal => signal.kind), ['not_found']);
  assert.equal(detectSignals('ออกใบทวิ 50 ได้ไหม')[0]?.kind, 'not_available');
  assert.equal(detectSignals('เมนูปฏิทินภาษีอยู่ตรงไหนในแอป')[0]?.kind, 'not_available', 'a feature not open to everyone yet');
  const asked = detectSignals('อยากให้มีระบบเชื่อมบัญชีธนาคาร 1234567890 อัตโนมัติ');
  assert.deepEqual(asked.map(signal => [signal.kind, signal.question]), [['feature_request', 'อยากให้มีระบบเชื่อมบัญชีธนาคาร # อัตโนมัติ']]);
  const wrong = detectSignals('ผิด ไม่มีเมนูนี้', [{ role: 'user', text: 'ใบเสนอราคาอยู่ตรงไหน' }, { role: 'assistant', text: 'อยู่ในเมนูตั้งค่าครับ' }]);
  assert.deepEqual(wrong.map(signal => [signal.kind, signal.question]), [['wrong_answer', 'ใบเสนอราคาอยู่ตรงไหน']]);
  assert.ok(wrong[0].feature_id, 'the feature the question was about');
  // Ordinary money questions and replies to non-app answers are not signals.
  assert.deepEqual(detectSignals('เดือนนี้ได้เงินเท่าไหร่'), []);
  assert.deepEqual(detectSignals('ไม่ใช่ ร้านกาแฟ', [{ role: 'user', text: 'เพิ่มงานโลโก้ 3000' }, { role: 'assistant', text: 'ลูกค้าคือร้านอาหารใช่ไหม' }]), []);
  assert.equal(lookupSignal('จองคิวลูกค้า')?.kind, 'not_found');
  assert.equal(lookupSignal('ปฏิทินภาษีส่วนตัว'), null, 'known to the knowledge, only not open yet');
  assert.equal(lookupSignal('ใบเสนอราคา'), null);
  assert.equal(redactQuestion('ส่งไปที่ boss@example.com โทร 081-234-5678 ยอด 12,500'), 'ส่งไปที่ [อีเมล] โทร # ยอด #');
});

async function database(extra: string[] = []) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}');`);
  for (const file of ['database/ai_secretary.sql', 'database/ai_account_actions.sql', 'supabase/migrations/20261024120000_ai_proposal_args.sql', 'supabase/migrations/20261025090000_ai_learning.sql', ...extra]) {
    await db.exec(await readFile(file, 'utf8'));
  }
  return db;
}

test('the report: cost per message, cards confirmed, corrections per 100, signals, wrong answers per prompt, memories', async () => {
  const db = await database();
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const prop = (n: number, kind: string, status: string, user = A) => `('p_${uuid(n)}','${user}','${kind}','r${n}','t','[]','${status}')`;
  await db.exec(`
    insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,model,route,prompt_version) values
      ('${uuid(1)}','${A}','2026-10',4,'settled',0.004,'gemini-3.5-flash-lite','chat','secretary-v13'),
      ('${uuid(2)}','${A}','2026-10',20,'settled',0.02,'claude-sonnet-5-5','action','secretary-v13'),
      ('${uuid(3)}','${B}','2026-10',6,'settled',0.006,'gemini-3.5-flash-lite','chat','secretary-v13'),
      ('${uuid(4)}','${B}','2026-10',0,'released',0,null,null,null);
    insert into public.cashflow_ai_proposals(id,user_id,kind,job_id,title,changes,status) values
      ${[prop(10, 'add_expense', 'applied'), prop(11, 'add_expense', 'applied'), prop(12, 'add_expense', 'cancelled'), prop(13, 'add_document', 'applied', B), prop(14, 'add_document', 'pending', B)].join(',')};
    insert into public.cashflow_ai_corrections(user_id,domain,subject,after_value) values ('${A}','expense_category','ร้านสมาน','ค่าอุปกรณ์/ซอฟต์แวร์');
    insert into public.cashflow_ai_knowledge_signals(user_id,kind,feature_id,question,channel,prompt_version) values
      ('${A}','not_found',null,'ปฏิทินภาษีอยู่ไหน','app','secretary-v13'), ('${B}','not_found',null,'ปฏิทินภาษีอยู่ไหน','line','secretary-v13'),
      ('${A}','wrong_answer','documents','ใบเสนอราคาอยู่ตรงไหน','app','secretary-v13');
    insert into public.cashflow_ai_memories(user_id,kind,value) values ('${A}','emoji','ไม่ใช้อีโมจิ'),('${A}','correction','x'),('${B}','tone','สั้น ๆ');`);
  const report = (await db.query<{ report: any }>(await readFile('database/ai_learning_report.sql', 'utf8'))).rows[0].report;
  assert.deepEqual(report.cost_7_days, { messages: 3, usd_total: 0.03, usd_per_message: 0.01, tokens_per_message: 10, active_accounts: 2 });
  assert.equal(report.usd_per_active_account_30_days, 0.015);
  assert.deepEqual(report.cost_by_route_7_days.map((row: any) => [row.route, row.messages]), [['chat', 2], ['action', 1]]);
  const cards = Object.fromEntries(report.cards_30_days.map((row: any) => [row.kind, [row.prepared, row.confirmed, row.cancelled]]));
  assert.deepEqual(cards, { add_expense: [3, 2, 1], add_document: [2, 1, 0] });
  assert.equal(report.corrections_per_100_confirmed_cards, 33.3);
  assert.equal(report.expense_category_fixes_per_100_new_expenses, 50);
  assert.deepEqual(report.questions_7_days[0], { kind: 'not_found', question: 'ปฏิทินภาษีอยู่ไหน', times: 2 });
  assert.deepEqual(report.wrong_answers_by_prompt_30_days, [{ prompt_version: 'secretary-v13', wrong_answers: 1, messages: 3 }]);
  assert.deepEqual(report.memories, { accounts: 2, total: 3, by_kind: { emoji: 1, correction: 1, tone: 1 } });
  // Before the routing column exists the report still runs; its routing parts are empty.
  assert.equal(report.routing_7_days.messages_logged, 0);
  assert.deepEqual([report.routing_by_tier_7_days, report.cost_by_provider_7_days], [[], []]);
  // Nothing that identifies an account leaves the report.
  const text = JSON.stringify(report);
  for (const id of [A, B]) assert.equal(text.includes(id), false);
  // Read only.
  assert.doesNotMatch(await readFile('database/ai_learning_report.sql', 'utf8'), /\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i);
});

test('the report with routing V2: Sonnet share, cost per provider and intent, escalations, failed routing, cost per confirmed card', async () => {
  const db = await database(['supabase/migrations/20261025130000_ai_routing_log.sql']);
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const call = (provider: string, usd: number, steps = 1) => ({ provider, model: provider === 'anthropic' ? 'claude-sonnet-5-5' : 'gemini-3.5-flash-lite', route: 'action', usd, input: 100, cached: 0, output: 10, thinking: 0, steps });
  const route = (over: Record<string, unknown>) => JSON.stringify({ v: 'routing-v2', intent: 'read', complexity: 'low', risk: 'read', context: 'short', tier: 'light', reason: 'everyday', tools_first: 'chat',
    handed_off: false, escalations: [], fallback: null, provider_retries: 0, calls: [], tool_calls: [], latency_ms: 1000, outcome: 'answer', proposal_ids: [], channel: 'app', ...over }).replace(/'/g, "''");
  const rows: [number, string, number, string, Record<string, unknown>][] = [
    [1, A, 0.004, 'settled', { calls: [call('gemini', 0.004)] }],
    [2, A, 0.02, 'settled', { intent: 'document', tier: 'smart', reason: 'document', calls: [call('anthropic', 0.02, 2)], outcome: 'card', proposal_ids: [`p_${uuid(20)}`], latency_ms: 4000 }],
    [3, B, 0, 'settled', { intent: 'feature_help', tier: 'direct', reason: 'direct_where', outcome: 'direct', latency_ms: 5 }],
    [4, B, 0.012, 'settled', { intent: 'read', calls: [call('gemini', 0.002), call('anthropic', 0.01, 1)], escalations: ['max_steps'], outcome: 'answer' }],
    [5, A, 0, 'settled', { intent: 'delete', tier: 'smart', reason: 'delete', fallback: 'blocked', outcome: 'blocked' }],
    [6, B, 0, 'released', { outcome: 'error', error: 'timeout', provider_retries: 1 }],
  ];
  await db.exec(rows.map(([n, user, usd, status, over]) => `insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,routing) values ('${uuid(n)}','${user}','2026-10',0,'${status}',${usd},'${route(over)}'::jsonb);`).join('\n')
    + `insert into public.cashflow_ai_proposals(id,user_id,kind,job_id,title,changes,status) values ('p_${uuid(20)}','${A}','add_document','r','t','[]','applied');`);
  const report = (await db.query<{ report: any }>(await readFile('database/ai_learning_report.sql', 'utf8'))).rows[0].report;
  assert.deepEqual(report.routing_7_days, { messages_logged: 6, sonnet_message_share: 0.333, direct_answers: 1, escalation_rate: 0.167, failed_routing_rate: 0.333,
    handed_over: 0, held_back_for_sonnet: 1, light_took_over: 0, errors: 1, provider_retries: 1 });
  assert.deepEqual(report.cost_by_provider_7_days, [{ provider: 'anthropic', calls: 2, usd: 0.03 }, { provider: 'gemini', calls: 2, usd: 0.006 }]);
  assert.deepEqual(report.escalations_7_days, [{ reason: 'max_steps', times: 1, answered_in_one_round: 1 }]);
  assert.deepEqual(report.actions_7_days, { cards_prepared: 1, cards_confirmed: 1, confirmed_share_gemini: null, confirmed_share_sonnet: 1, usd_per_confirmed_card: 0.02 });
  const tiers = Object.fromEntries(report.routing_by_tier_7_days.map((row: any) => [row.tier, row.messages]));
  assert.deepEqual(tiers, { light: 3, smart: 2, direct: 1 });
  const document = report.routing_by_intent_7_days.find((row: any) => row.intent === 'document');
  assert.deepEqual(document, { intent: 'document', messages: 1, sonnet_share: 1, usd_per_message: 0.02 });
  // A routing value that is not an object, or too large, is refused by the column's check.
  await assert.rejects(db.exec(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,routing) values ('${uuid(9)}','${A}','2026-10',0,'settled','[1]'::jsonb);`));
  for (const id of [A, B]) assert.equal(JSON.stringify(report).includes(id), false);
});

test('the report\'s money: spend by day and month, cost per paid account (no ids), trial, platform overhead, Sonnet hours', async () => {
  const db = await database(['supabase/migrations/20261025130000_ai_routing_log.sql']);
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const cost = (actual: number, billable: number, cache: number, failed = 0, overrun = 0) =>
    JSON.stringify({ v: 'routing-v2', tier: 'smart', outcome: 'answer', calls: [], escalations: [], cost: { actual_usd: actual, billable_usd: billable, cache_overhead_usd: cache, failed_attempt_usd: failed, quota_overrun_usd: overrun, cache_saved_usd: 0.01 } });
  // A: two Sonnet messages in the same hour (the 1-hour cache paid off), B: one alone; a trial account; a failed request.
  const rows = [
    `('${uuid(1)}','${A}','2026-10-01',100,'settled',0.1,'claude-sonnet-5-5',date_trunc('hour', now()) + interval '1 minute','${cost(0.1, 0.018, 0.082)}')`,
    `('${uuid(2)}','${A}','2026-10-01',20,'settled',0.02,'claude-sonnet-5-5',date_trunc('hour', now()) + interval '2 minutes','${cost(0.02, 0.02, 0)}')`,
    `('${uuid(3)}','${B}','2026-10-05',4,'settled',0.004,'gemini-3.5-flash-lite',date_trunc('hour', now()) + interval '3 minutes','${cost(0.004, 0.004, 0)}')`,
    `('${uuid(4)}','${B}','2026-10-05',18,'settled',0.1,'claude-sonnet-5-5',date_trunc('hour', now()) - interval '59 minutes','${cost(0.1, 0.018, 0.082, 0, 0.002)}')`,
    `('${uuid(5)}','${B}','trial',6,'settled',0.006,'gemini-3.5-flash-lite',date_trunc('hour', now()) + interval '4 minutes',null)`,
    `('${uuid(6)}','${A}','2026-10-01',0,'released',0.03,null,date_trunc('hour', now()) + interval '5 minutes','${cost(0.03, 0, 0, 0.03)}')`,
  ];
  await db.exec(`insert into public.cashflow_ai_usage(request_id,user_id,cycle_key,tokens,status,cost_usd,model,created_at,routing) values ${rows.join(',')};`);
  const report = (await db.query<{ report: any }>(await readFile('database/ai_learning_report.sql', 'utf8'))).rows[0].report;
  const total = report.spend_by_day_14_days.reduce((sum: number, row: any) => sum + Number(row.usd), 0);
  assert.ok(Math.abs(total - 0.26) < 1e-9, 'every request\'s real spend, the failed one included');
  // (Summed over months: one row sits in the previous hour, which can be last month on the 1st.)
  const months = report.spend_by_month.reduce((sum: any, row: any) => ({ usd: sum.usd + Number(row.usd), requests: sum.requests + row.requests, trial: sum.trial + Number(row.trial_usd || 0) }), { usd: 0, requests: 0, trial: 0 });
  assert.deepEqual([Number(months.usd.toFixed(6)), months.requests, months.trial], [0.26, 6, 0.006]);
  // This month, paid cycles only: A spent 0.15 (the failed request included), the most of any account.
  assert.deepEqual([report.cost_per_paid_account_this_month.accounts, report.cost_per_paid_account_this_month.usd_max], [2, 0.15]);
  assert.deepEqual(report.platform_overhead_7_days, { actual_usd: 0.254, billable_usd: 0.06, shared_cache_write_usd: 0.164, failed_attempts_usd: 0.03,
    quota_overrun_usd: 0.002, cache_read_savings_usd: 0.05, soft_budget_requests: 0 });
  assert.deepEqual(report.sonnet_hours_7_days, { active_hours: 2, hours_with_one: 1, hours_with_two_or_more: 1, messages: 3 });
  for (const id of [A, B]) assert.equal(JSON.stringify(report).includes(id), false);
});

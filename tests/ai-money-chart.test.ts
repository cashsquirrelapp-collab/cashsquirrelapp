import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbox } from '../backend/src/ai/tools';
import { memoryStores } from '../backend/src/ai/gateway';
import { CHART_MONTHS, cleanAnswerText, moneyChartFrom, moneyChartSchema } from '../backend/src/ai/moneyChart';
import { lineAssistantReply } from '../backend/src/ai/lineFormat';
import { buildSystemPrompt } from '../backend/src/ai/prompt';
import { formatTHB } from '../shared/thb';

// Money over several months (owner, 2026-10-25: "2 เดือนที่ผ่านมารายได้กูเป็นไงบ้าง" came back as ASCII bars and a
// Markdown table). The chart card is built from financial_summary's own figures, so the bars, the card's totals, the
// table and any amount the model quotes are the same numbers. Synthetic data only.

const NOW = new Date('2026-10-25T05:00:00Z');
const paid = (id: string, value: number, whtRate: number, payDate: string) => ({ id, name: `งาน ${id}`, client: 'ลูกค้าตัวอย่าง', type: 'ตัดต่อ', value,
  received: Math.round(value * (1 - whtRate / 100) * 100) / 100, pending: 0, status: 'done', paymentStatus: 'paid', creditTerm: 0, payDate, postDate: payDate, isPosted: true, whtRate, whtAmount: Math.round(value * whtRate) / 100 });
const user = {
  user_id: '22222222-2222-4222-8222-222222222222', statuses: [], goals: [], settings: {},
  jobs: [paid('j1', 12000, 3, '2026-09-10'), paid('j2', 5000, 0, '2026-10-05'), paid('j3', 1000.1, 0, '2026-10-20')],
  expenses: [{ id: 'e1', name: 'ไมค์', category: 'ค่าอุปกรณ์/ซอฟต์แวร์', date: '2026-09-15', amount: 1500.25 }, { id: 'e2', name: 'ค่าเน็ต', category: 'ค่าบริการ/สาธารณูปโภค', date: '2026-10-01', amount: 299.99 }],
} as any;
const summary = async (args: Record<string, unknown>) => createToolbox({ user, ...memoryStores(), now: NOW })({ id: 's', name: 'financial_summary', args });

test('two months: a chart card from the same figures as the tool, totals equal the months, the month in progress marked', async () => {
  const outcome = await summary({ start_date: '2026-09-01', end_date: '2026-10-31' });
  const card = outcome.card as any;
  assert.equal(card.kind, 'money_chart');
  assert.ok(moneyChartSchema.safeParse(card).success);
  assert.deepEqual(card.months.map((month: any) => [month.label, month.income, month.expense, month.net, month.partial]), [
    ['ก.ย. 2569', 11640, 1500.25, 10139.75, false],
    ['ต.ค. 2569', 6000.1, 299.99, 5700.11, true],
  ]);
  assert.deepEqual(card.totals, { income: 17640.1, expense: 1800.24, net: 15839.86 });
  const sum = (key: 'income' | 'expense' | 'net') => Math.round(card.months.reduce((total: number, month: any) => total + month[key], 0) * 100) / 100;
  assert.deepEqual([sum('income'), sum('expense'), sum('net')], [card.totals.income, card.totals.expense, card.totals.net]);
  assert.equal(card.period, 'ก.ย.–ต.ค. 2569');
  // What the model may quote is written exactly like the card.
  const result = outcome.result as any;
  assert.deepEqual(result.display.totals, { income: '฿17,640.10', expense: '฿1,800.24', net: '฿15,839.86' });
  assert.deepEqual(result.display.months[1], { month: 'ต.ค. 2569', income: '฿6,000.10', expense: '฿299.99', net: '฿5,700.11', in_progress: true });
  assert.match(result.card_shown, /Never draw a chart with characters/);
  assert.equal(result.totals.received, card.totals.income, 'the card copies the tool, it does not recompute');
});

test('a year leaves out months that have not started; a long period shows the latest 12 with totals for all of it', async () => {
  const year = (await summary({ year: 2569 })).card as any;
  assert.deepEqual(year.months.map((month: any) => month.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(year.omitted, 0);
  const long = (await summary({ start_date: '2025-01-01', end_date: '2026-10-31' })).card as any;
  assert.equal(long.months.length, CHART_MONTHS);
  assert.equal(long.omitted, 10);
  assert.equal(long.months[0].month, '2025-11');
  assert.deepEqual(long.totals, { income: 17640.1, expense: 1800.24, net: 15839.86 }, 'totals cover the whole period asked');
  assert.equal(long.period, 'ม.ค. 2568 – ต.ค. 2569');
});

test('no money in the period: the card still comes, all zero (the app shows its empty state)', async () => {
  const card = (await summary({ start_date: '2025-01-01', end_date: '2025-02-28' })).card as any;
  assert.deepEqual(card.months.map((month: any) => [month.income, month.expense]), [[0, 0], [0, 0]]);
  assert.deepEqual(card.totals, { income: 0, expense: 0, net: 0 });
  assert.equal(moneyChartFrom({ ok: false }), null);
  assert.equal(moneyChartFrom({ ok: true, as_of: '2026-10-25', totals: {}, monthly: { rows: [] } }), null);
});

test('baht written one way: th-TH currency, satang kept, negatives with a minus', () => {
  assert.deepEqual([formatTHB(12500), formatTHB(0.1 + 0.2), formatTHB(-1200.5), formatTHB(1234567.891)], ['฿12,500.00', '฿0.30', '-฿1,200.50', '฿1,234,567.89']);
});

test('the answer text: no character-drawn charts, no table repeating a money card; other tables stay', () => {
  const card = [{ kind: 'money_chart' }];
  const text = 'สองเดือนนี้รายรับดีขึ้นครับ\n```\nก.ย. ████████████ 11,640\nต.ค. ██████░░░░░░ 6,000\n```\n| เดือน | รายรับ | รายจ่าย |\n|---|---|---|\n| ก.ย. | 11,640 | 1,500 |\n\nต.ค. ยังไม่จบเดือนครับ';
  assert.equal(cleanAnswerText(text, card), 'สองเดือนนี้รายรับดีขึ้นครับ\n\nต.ค. ยังไม่จบเดือนครับ');
  const jobs = 'มี 2 งานค้างครับ\n| งาน | ลูกค้า | ยอดค้าง |\n|---|---|---|\n| โลโก้ | ร้าน ก | ฿3,000 |';
  assert.equal(cleanAnswerText(jobs, card), jobs, 'a list of records is not a repeat of the chart');
  const table = '| เดือน | รายรับ |\n|---|---|\n| ก.ย. | 11,640 |';
  assert.equal(cleanAnswerText(table, []), table, 'without a card, a table the user asked for stays');
  assert.equal(cleanAnswerText('▇▇▇▇ ยอดขาย', []), '', 'bars are never drawn with characters');
});

test('LINE gets the months as rows under the totals; the rules tell both models the same contract', async () => {
  const card = (await summary({ start_date: '2026-09-01', end_date: '2026-10-31' })).card as any;
  const messages = lineAssistantReply('รายรับดีขึ้นครับ', [card]);
  const flex = JSON.stringify(messages);
  for (const text of ['รายรับ–รายจ่าย', 'ก.ย.–ต.ค. 2569', '฿15,839.86', '฿17,640.10', 'ต.ค. 2569 (ถึงวันนี้)', 'รับ ฿6,000.10 · จ่าย ฿299.99']) assert.ok(flex.includes(text), text);
  const prompt = buildSystemPrompt({ route: 'chat', plan: 'pro', nowLocal: '25 ต.ค. 2569 10:00' } as any);
  for (const rule of ['call financial_summary once for the whole period', 'Never draw charts, bars or graphs with characters', 'never add a table of the\n  same months']) assert.ok(prompt.includes(rule), rule);
});

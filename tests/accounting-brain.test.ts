import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { aiConfig } from '../backend/src/ai/config';
import { memoryStores, runAssistant, type AssistantRequest } from '../backend/src/ai/gateway';
import { buildSystemPrompt, type PromptSlots } from '../backend/src/ai/prompt';
import { emptyUsage, type AssistantCard, type Provider, type ProviderName, type ProviderRequest, type ToolCall, type ToolOutcome } from '../backend/src/ai/types';
import type { UserRow } from '../backend/src/services/lineAssistant';
import { businessCalc, estimatePersonalIncomeTax, type TaxEstimate } from '../backend/src/ai/accounting/calc';
import { accountingTopics, turnTopics } from '../backend/src/ai/accounting/intent';
import { ACCOUNTING_KNOWLEDGE } from '../backend/src/ai/accounting/knowledge';
import { OFFICIAL_LINKS, isOfficialUrl } from '../backend/src/ai/accounting/officialLinks';
import { accountingEnabled, selectAccountingReference } from '../backend/src/ai/accounting/reference';
import { SOURCES } from '../backend/src/ai/accounting/sources';
import { TAX_RULES, taxYearOf } from '../backend/src/ai/accounting/taxRules';
import { ACCOUNTING_TOOLS, executeAccountingTool } from '../backend/src/ai/accounting/tools';

// Accounting Brain & Tax Navigator (owner's brief, 2026-10-26). Expected tax figures are worked by hand from the
// Revenue Department's ภ.ง.ด.90 guide for tax year 2568 (brackets, expense rates, allowances, the 0.5% minimum tax).

const estimate = (input: Parameters<typeof estimatePersonalIncomeTax>[0]) => {
  const result = estimatePersonalIncomeTax(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result as TaxEstimate;
};

test('tax: a freelancer with business income, flat expenses, allowances and withheld tax gets a refund', () => {
  const result = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(8)', amount: 600_000 }],
    allowances: [{ id: 'social_security', amount: 9_000 }, { id: 'life_insurance', amount: 20_000 }], whtCredit: 18_000 });
  assert.equal(result.expenses, 360_000); // 60% flat
  assert.equal(result.after_expenses, 240_000);
  assert.equal(result.total_allowances, 89_000); // 60,000 + 9,000 + 20,000
  assert.equal(result.net_income, 151_000);
  assert.equal(result.progressive.tax, 50); // 1,000 at 5%
  assert.equal(result.minimum_tax.applies, true);
  assert.equal(result.minimum_tax.amount, 3_000); // 0.5% of 600,000, not over 5,000 so not used
  assert.equal(result.minimum_tax.used, false);
  assert.equal(result.assessed_tax, 50);
  assert.equal(result.overpaid, 17_950);
  assert.equal(result.due, 0);
  assert.equal(result.filing.form, 'ภ.ง.ด.90');
  assert.equal(result.filing.over_threshold, true);
  assert.equal(result.filing.internet_deadline, '8 เมษายน 2569');
});

test('tax: 40(1)+(2) share one 100,000 deduction; progressive brackets add up', () => {
  const result = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(2)', amount: 1_000_000 }] });
  assert.equal(result.expenses, 100_000);
  assert.equal(result.net_income, 840_000);
  assert.equal(result.progressive.tax, 83_000); // 7,500 + 20,000 + 37,500 + 18,000
  assert.equal(result.minimum_tax.amount, 5_000); // exactly 5,000: method 1 applies
  assert.equal(result.assessed_tax, 83_000);
  assert.match(result.filing.installments ?? '', /3 งวด/);
  const both = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(1)', amount: 150_000 }, { type: '40(2)', amount: 150_000 }] });
  assert.equal(both.expenses, 100_000, 'the cap is shared, not 100,000 each');
});

test('tax: the minimum tax wins when actual expenses leave little net income', () => {
  const result = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(8)', amount: 2_000_000, method: 'actual', actualExpense: 1_900_000 }] });
  assert.equal(result.progressive.tax, 0);
  assert.equal(result.minimum_tax.amount, 10_000);
  assert.equal(result.minimum_tax.used, true);
  assert.equal(result.assessed_tax, 10_000);
});

test('tax: wages only file ภ.ง.ด.91; performers, insurance, RMF and donations follow their caps', () => {
  const wages = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(1)', amount: 300_000 }] });
  assert.equal(wages.filing.form, 'ภ.ง.ด.91');
  assert.equal(wages.filing.threshold, 120_000);
  assert.equal(wages.net_income, 140_000);
  assert.equal(wages.assessed_tax, 0);
  assert.equal(wages.minimum_tax.applies, false);
  const performer = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(8)', amount: 1_000_000, kind: 'performer' }] });
  assert.equal(performer.expenses, 460_000); // 60% of 300,000 + 40% of 700,000
  const insured = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(8)', amount: 500_000 }],
    allowances: [{ id: 'life_insurance', amount: 90_000 }, { id: 'health_insurance', amount: 25_000 }, { id: 'rmf', amount: 200_000 }] });
  const allowed = Object.fromEntries(insured.allowances.map(row => [row.id, row.allowed]));
  assert.equal(allowed.life_insurance, 90_000);
  assert.equal(allowed.health_insurance, 10_000, 'life and health together stop at 100,000');
  assert.equal(allowed.rmf, 150_000, '30% of assessable income');
  const donor = estimate({ taxYear: 2568, status: 'single', incomes: [{ type: '40(2)', amount: 320_000 }], donationsGeneral: 20_000 });
  // 320,000 - 100,000 - 60,000 = 160,000; 10% = 16,000
  assert.equal(donor.donations, 16_000);
  assert.equal(donor.net_income, 144_000);
});

test('tax: years are checked, 2569 is carried with its warnings, unknown allowances are not guessed', () => {
  assert.equal(estimatePersonalIncomeTax({ taxYear: 2560, status: 'single', incomes: [{ type: '40(8)', amount: 1 }] }).ok, false);
  assert.equal(estimatePersonalIncomeTax({ taxYear: 2568, status: 'single', incomes: [] }).ok, false);
  const carried = estimate({ taxYear: 2569, status: 'married', incomes: [{ type: '40(8)', amount: 100_000, firstHalf: 50_000 }], allowances: [{ id: 'easy_e_receipt', amount: 50_000 }] });
  assert.equal(carried.rules, 'carried');
  assert.equal(carried.filing.internet_deadline, null);
  assert.equal(carried.filing.over_threshold, 'depends_on_spouse');
  assert.equal(carried.filing.half_year?.required, 'depends_on_spouse');
  assert.ok(carried.not_computed.some(line => line.startsWith('easy_e_receipt')), 'a 2568-only deduction is not applied to 2569');
  assert.ok(carried.warnings.length >= 2);
  assert.equal(taxYearOf(2025), 2568);
  assert.equal(taxYearOf(2569), 2569);
  assert.equal(taxYearOf(undefined, new Date('2026-10-26T00:00:00Z')), 2569);
  assert.equal(taxYearOf(2030), undefined);
});

test('tax rules: brackets rise, every source was read, 2568 is verified', () => {
  for (const rules of Object.values(TAX_RULES)) {
    const tops = rules.brackets.map(bracket => bracket.upTo ?? Infinity);
    assert.deepEqual(tops, [...tops].sort((a, b) => a - b));
    for (const id of rules.sources) assert.ok(SOURCES[id], id);
  }
  assert.equal(TAX_RULES[2568].status, 'verified');
  assert.equal(TAX_RULES[2568].brackets[0].upTo, 150_000);
  assert.equal(TAX_RULES[2568].minimumTax.from, 120_000);
});

test('business arithmetic is exact: margin vs markup, VAT and withholding, break-even, discounts', () => {
  const price = businessCalc({ kind: 'price_for_margin', cost: 7_000, margin_percent: 30, wht_percent: 3, vat: true }) as Record<string, number>;
  assert.equal(price.price_before_vat, 10_000);
  assert.equal(price.markup_percent, 42.86);
  assert.equal(price.vat_7_percent, 700);
  assert.equal(price.withheld_by_client, 300);
  assert.equal(price.cash_received, 10_400);
  const even = businessCalc({ kind: 'break_even', fixed_costs: 30_000, price_per_unit: 1_000, variable_cost_per_unit: 400 }) as Record<string, number>;
  assert.equal(even.units_to_break_even, 50);
  assert.equal(even.revenue_to_break_even, 50_000);
  const discount = businessCalc({ kind: 'discount', price: 10_000, cost: 7_000, discount_percent: 10 }) as Record<string, number>;
  assert.equal(discount.profit_after, 2_000);
  assert.equal(discount.sales_needed_for_same_profit, 1.5);
  assert.equal((businessCalc({ kind: 'break_even', fixed_costs: 1, price_per_unit: 100, variable_cost_per_unit: 100 }) as { ok: boolean }).ok, false);
  assert.equal((businessCalc({ kind: 'price_for_margin', cost: 1, margin_percent: 100 }) as { ok: boolean }).ok, false);
});

test('intent: accounting questions are found; ordinary app work and small talk are not', () => {
  for (const [text, topic] of [
    ['หัก ณ ที่จ่าย 3% คืออะไร', 'wht'], ['50 ทวิใช้ขอคืนภาษีได้ไหม', 'wht'], ['ทำไมเดือนนี้กำไรแต่เงินไม่เหลือเลย', 'cashflow'],
    ['ยื่นภาษีออนไลน์ยังไง', 'filing'], ['ต้องจด VAT ไหม รายได้ 2 ล้าน', 'vat'], ['ควรตั้งราคาเท่าไหร่ถ้าต้นทุน 7000', 'pricing'],
    ['เดบิตเครดิตคืออะไร', 'concepts'], ['ใบเสร็จกับใบกำกับภาษีต่างกันยังไง', 'documents'], ['ช่วยตรวจข้อมูลว่ามีรายการซ้ำไหม', 'audit'],
    ['ขอคืนภาษีได้เมื่อไหร่', 'refund'], ['Do I need to file income tax?', 'pit'],
    ['เดือนหน้าน่าจะมีเงินเข้าเท่าไหร่', 'cashflow'], ['เงินจะเข้าสัปดาห์หน้าเท่าไหร่', 'cashflow'],
  ] as const) assert.ok(accountingTopics(text).includes(topic), `${text} → ${topic}: ${accountingTopics(text)}`);
  for (const text of ['เพิ่มงาน 5,000 บาท หัก 3%', 'ออกใบเสนอราคาให้บริษัท ABC รวม VAT', 'วันนี้กินไรดี', 'สรุปเดือนนี้', 'บันทึกรายจ่ายค่าเน็ต 599']) {
    assert.deepEqual(accountingTopics(text), [], text);
  }
  assert.deepEqual(turnTopics('แล้วถ้าโสดล่ะ', [{ role: 'user', text: 'ต้องยื่นภาษีไหม' }, { role: 'assistant', text: '...' }]).includes('filing'), true);
  assert.deepEqual(turnTopics('ok', []), []);
});

test('reference: only on accounting messages, short, with the guide and sources; on for admins first', () => {
  const selection = selectAccountingReference('50 ทวิคืออะไร ใช้ขอคืนภาษีได้ไหม');
  assert.ok(selection);
  assert.ok(selection.entryIds.includes('m08.wht_50tawi'));
  assert.ok(selection.entryIds.length <= 2);
  assert.match(selection.text, /HOW TO USE/);
  assert.match(selection.text, /กรมสรรพากร/);
  assert.ok(selection.text.length < 4_000, `reference length ${selection.text.length}`);
  assert.equal(selectAccountingReference('สวัสดีครับ'), undefined);
  assert.equal(accountingEnabled('admin', 'admin'), true);
  assert.equal(accountingEnabled('admin', 'pro'), false);
  assert.equal(accountingEnabled(undefined, 'pro'), false);
  assert.equal(accountingEnabled('all', 'pro'), true);
  assert.equal(accountingEnabled('off', 'admin'), false);
  assert.equal(aiConfig({}).accounting, 'admin');
  assert.equal(aiConfig({ AI_ACCOUNTING: 'ALL' }).accounting, 'all');
  assert.equal(aiConfig({ AI_ACCOUNTING: 'nonsense' }).accounting, 'admin');
});

test('knowledge: every entry is sourced, short and Thai-jurisdiction; official links are official', () => {
  const ids = new Set<string>();
  for (const entry of ACCOUNTING_KNOWLEDGE) {
    assert.ok(!ids.has(entry.id), entry.id); ids.add(entry.id);
    assert.ok(entry.sources.length && entry.sources.every(id => SOURCES[id]), entry.id);
    assert.ok(entry.text.length <= 1_400, `${entry.id} ${entry.text.length}`);
    assert.equal(entry.jurisdiction, 'TH');
  }
  for (const link of Object.values(OFFICIAL_LINKS)) assert.ok(isOfficialUrl(link.url), link.id);
  for (const source of Object.values(SOURCES)) assert.match(source.url, /^https:\/\//);
  assert.equal(isOfficialUrl('https://rd.go.th.evil.example/'), false);
  assert.equal(isOfficialUrl('http://www.rd.go.th/'), false);
});

const account = (): UserRow => ({
  user_id: '77777777-7777-4777-8777-777777777777', statuses: [], goals: [], settings: { monthlyExpense: 9_000 } as never,
  expenses: [
    { id: 'e1', name: 'ค่าเน็ต', category: 'Fixed', amount: 599, date: '2026-10-01' },
    { id: 'e2', name: 'ค่าเน็ต', category: 'Fixed', amount: 599, date: '2026-10-01' },
    { id: 'e3', name: 'ค่าเช่า', category: 'Fixed', amount: 5000, date: '2026-12-01' },
  ] as never,
  jobs: [
    { id: 'j1', name: 'ตัดต่อคลิป', client: 'บริษัท ก', value: 10_000, received: 0, pending: 9_700, status: 'pending', creditTerm: 30, payDate: '2026-11-10', startDate: '2026-10-01', whtRate: 3, whtAmount: 300 },
    { id: 'j2', name: 'ตัดต่อคลิป', client: 'บริษัท ก', value: 10_000, received: 0, pending: 9_700, status: 'pending', creditTerm: 30, payDate: '2026-11-10', startDate: '2026-10-02', whtRate: 3, whtAmount: 30 },
    { id: 'j3', name: 'ถ่ายภาพ', client: 'ร้าน ข', value: 5_000, received: 0, pending: 5_000, status: 'pending', creditTerm: 0, payDate: '2026-10-01', startDate: '2026-09-20', whtRate: 0 },
    { id: 'j4', name: 'ออกแบบโลโก้', client: 'คุณ ค', value: 8_000, received: 8_000, pending: 0, status: 'done', creditTerm: 0, payDate: '2025-05-10', whtRate: 0 },
  ] as never,
});
const NOW = new Date('2026-10-26T03:00:00Z');

test('tool schemas: every enum is a list of strings (Gemini refuses numbers in an enum)', () => {
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown>;
    if (Array.isArray(value.enum)) assert.ok(value.enum.every(item => typeof item === 'string'), `${path}.enum`);
    for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
  };
  for (const tool of ACCOUNTING_TOOLS) walk(tool.parameters, tool.name);
});

test('tools: checks, forecast, app receipts and official link cards read only this account', () => {
  const check = executeAccountingTool('accounting_check', {}, account(), NOW).result as { findings: { kind: string; record: string }[] };
  const kinds = check.findings.map(finding => finding.kind);
  assert.ok(kinds.includes('possible_duplicate_job'));
  assert.ok(kinds.includes('wht_mismatch'));
  assert.ok(kinds.includes('possible_duplicate_expense'));
  assert.ok(kinds.includes('expense_in_future'));
  assert.ok(check.findings.every(finding => !/\bj\d\b|\be\d\b/.test(finding.record)), 'names, never record IDs');
  const forecast = executeAccountingTool('cash_forecast', { days: 30 }, account(), NOW).result as Record<string, unknown> & { scenarios: Record<string, { net: number }> };
  assert.equal(forecast.expected_in_window, 19_400); // two jobs due 10 Nov, net of 3%
  assert.equal(forecast.overdue_now, 5_000);
  assert.equal(forecast.budgeted_spending, 9_000);
  assert.equal(forecast.scenarios.base.net, 10_400);
  assert.equal(forecast.scenarios.best.net, 15_400);
  assert.equal(forecast.scenarios.worst.net, 700);
  const receipts = executeAccountingTool('tax_estimate', { tax_year: 2568, use_app_receipts: true }, account(), NOW).result as Record<string, unknown> & { app_receipts: Record<string, number> };
  assert.equal(receipts.ok, false);
  assert.deepEqual(receipts.needs, ['income_type']);
  assert.equal(receipts.app_receipts.gross_before_withholding, 8_000);
  const links = executeAccountingTool('official_link', { ids: ['efiling', 'refund_status', 'nope', 'efiling'] }, account(), NOW);
  assert.deepEqual(links.extraCards?.map(card => (card as { id: string }).id), ['efiling', 'refund_status']);
  assert.ok(links.extraCards?.every(card => card.kind === 'official_link' && isOfficialUrl(card.url)));
  assert.equal((executeAccountingTool('official_link', { ids: ['https://evil.example'] }, account(), NOW).result as { ok: boolean }).ok, false);
});

// The gateway with an offline provider: the reference and tools appear only for an admin's accounting question.
const config = (extra: Record<string, string> = {}) => aiConfig({ AI_ENABLED: 'true', GEMINI_API_KEY: 'offline-gemini', OPENAI_API_KEY: 'offline-openai',
  ANTHROPIC_API_KEY: 'offline-anthropic', AI_SMART_MODEL: 'claude-sonnet-5-5', ...extra });
async function ask(text: string, plan: AssistantRequest['plan'], tool?: ToolCall, extra: Record<string, string> = {}) {
  const sent: ProviderRequest[] = [];
  const outcomes: ToolOutcome[] = [];
  const provider = (name: ProviderName): Provider => ({ name, async run(request) {
    sent.push(request);
    const cards: AssistantCard[] = [];
    if (tool && request.tools.some(item => item.name === tool.name)) {
      const outcome = await request.execute(tool);
      outcomes.push(outcome);
      if (outcome.extraCards) cards.push(...outcome.extraCards);
    }
    return { provider: name, model: request.model, text: 'รับทราบครับ', usage: emptyUsage(), toolCalls: [], cards, steps: 1 };
  } });
  const reply = await runAssistant({ user: account(), plan, text }, {
    config: config(extra), ...memoryStores(), now: NOW,
    providers: { gemini: provider('gemini'), anthropic: provider('anthropic'), openai: provider('openai') },
    fetchImpl: async () => { throw new Error('network access forbidden in accounting wiring tests'); },
  });
  return { reply, sent, outcomes };
}

test('gateway: an admin\'s tax question gets the reference and the tools; a Pro account and small talk do not', async () => {
  const admin = await ask('ปีภาษี 2568 ต้องเสียภาษีเท่าไหร่ ถ้ามีรายได้ฟรีแลนซ์ 600,000', 'admin', { id: 't1', name: 'tax_estimate', args: { tax_year: 2568, incomes: [{ type: '40(8)', amount: 600_000 }] } });
  assert.match(admin.sent[0].system, /ACCOUNTING REFERENCE/);
  assert.ok(admin.sent[0].system.indexOf('ACCOUNTING REFERENCE (') < admin.sent[0].system.indexOf('ACCOUNT CONTEXT (saved data'));
  assert.ok(admin.sent[0].system.indexOf('FOUNDER') < 0 || admin.sent[0].system.indexOf('FOUNDER (') < admin.sent[0].system.indexOf('ACCOUNTING REFERENCE ('));
  assert.ok(admin.sent[0].tools.some(item => item.name === 'tax_estimate'));
  // 600,000 − 60% = 240,000 − 60,000 personal = 180,000 net → 30,000 at 5% = 1,500 (0.5% minimum tax 3,000 ≤ 5,000)
  assert.equal((admin.outcomes[0].result as { assessed_tax: number }).assessed_tax, 1_500);
  const pro = await ask('ปีภาษี 2568 ต้องเสียภาษีเท่าไหร่', 'pro');
  assert.doesNotMatch(pro.sent[0].system, /ACCOUNTING REFERENCE/);
  assert.ok(!pro.sent[0].tools.some(item => ACCOUNTING_TOOLS.some(tool => tool.name === item.name)));
  const smallTalk = await ask('วันนี้อากาศดีจัง', 'admin');
  assert.doesNotMatch(smallTalk.sent[0].system, /ACCOUNTING REFERENCE/);
  assert.ok(!smallTalk.sent[0].tools.some(item => item.name === 'tax_estimate'));
  const opened = await ask('ยื่นภาษีออนไลน์ยังไง', 'pro', { id: 't2', name: 'official_link', args: { ids: ['efiling'] } }, { AI_ACCOUNTING: 'all' });
  const auto = await ask('ขอคืนภาษีต้องทำยังไง', 'admin');
  assert.deepEqual(auto.reply.cards.filter(card => card.kind === 'official_link').map(card => (card as { id: string }).id), ['refund_status'], 'the official site is attached by rule');
  const notAdmin = await ask('ขอคืนภาษีต้องทำยังไง', 'pro');
  assert.equal(notAdmin.reply.cards.filter(card => card.kind === 'official_link').length, 0);
  assert.match(opened.sent[0].system, /ACCOUNTING REFERENCE/);
  assert.ok(opened.reply.cards.some(card => card.kind === 'official_link'));
});

test('prompt: without the accounting slot the prompt is byte-identical to the approved base (v16, v18–v21, then v23)', () => {
  // Captured from the v16 buildSystemPrompt on 2026-10-26 with these exact slots; recaptured for secretary-v18 (owner,
  // 2026-10-27), whose only change is ACCOUNT NAME in place of the remembered PREFERRED NAME, and for secretary-v19
  // (owner, 2026-10-28): DELETING JOBS, SAVING AT ONCE, CARD AGAIN and MANY ITEMS added, and the confirmation rule names the go-ahead;
  // and for secretary-v20 (owner, 2026-10-28, fewer tokens): the rules for preparing changes go with the action route only,
  // the file rules with a file in the chat, and the past_work rule names PAST WORK. No rule removed. And secretary-v21
  // (same day): the document rules with a document in the chat, and the CLOSING LINE rule (a step of cards ends the turn);
  // secretary-v23 (same day): the feedback menu is called แจ้งปัญหา (was บอกเรา).
  const slots: PromptSlots[] = [
    { route: 'chat', plan: 'pro', nowLocal: '26 ต.ค. 2569 10:00', knowledge: 'K', accountContext: '{}', offer: 'O' },
    { route: 'action', plan: 'admin', nowLocal: '26 ต.ค. 2569 10:00', knowledge: 'K', accountContext: '{}', founder: 'F', channel: 'line' },
  ];
  const v23 = ['f48e16428ad405da6dd295d3005a28042c4f3fde04fef21174a5abd2741a9156', 'cd6aa279670121792a720d2c1bf40eec37abfc3a9a2de6b4a61a9184bb9d5267'];
  slots.forEach((slot, index) => assert.equal(createHash('sha256').update(buildSystemPrompt(slot)).digest('hex'), v23[index]));
  const withAccounting = buildSystemPrompt({ ...slots[0], accounting: 'REF' });
  assert.match(withAccounting, /ACCOUNTING REFERENCE \(selected for this message; general information with sources, not a ruling\)\n\nREF\n\nACCOUNT CONTEXT/);
});

test('gateway: a tool call written out as text on an accounting turn steps up once and is never shown', async () => {
  const run = async (smartText: string) => {
    const used: string[] = [];
    const provider = (name: ProviderName): Provider => ({ name, async run(request) {
      used.push(name);
      const text = name === 'gemini' ? 'tax_estimate(incomes:[{amount:500000,type:40(8)}],tax_year:2560)' : smartText;
      return { provider: name, model: request.model, text, usage: emptyUsage(), toolCalls: [], cards: [], steps: 1 };
    } });
    const reply = await runAssistant({ user: account(), plan: 'admin', text: 'คำนวณภาษีปีภาษี 2560 ให้หน่อย รายได้ 500,000' }, {
      config: config(), ...memoryStores(), now: NOW,
      providers: { gemini: provider('gemini'), anthropic: provider('anthropic'), openai: provider('openai') },
      fetchImpl: async () => { throw new Error('network access forbidden'); },
    });
    return { reply, used };
  };
  const stepped = await run('มีตารางกฎของปีภาษี 2568 และ 2569 เท่านั้นครับ');
  assert.deepEqual(stepped.used, ['gemini', 'anthropic']);
  assert.match(stepped.reply.text, /2568/);
  const both = await run('tax_estimate(tax_year:2560)');
  assert.doesNotMatch(both.reply.text, /tax_estimate\(/, 'a printed call is never the answer');
  // The same light answer on a non-accounting turn is left to the existing path (no step-up added there).
  const plain = await runAssistant({ user: account(), plan: 'admin', text: 'สวัสดี' }, {
    config: config(), ...memoryStores(), now: NOW,
    providers: { gemini: { name: 'gemini', async run(request) { return { provider: 'gemini', model: request.model, text: 'สวัสดีครับ', usage: emptyUsage(), toolCalls: [], cards: [], steps: 1 }; } },
      anthropic: { name: 'anthropic', async run() { throw new Error('not called'); } }, openai: { name: 'openai', async run() { throw new Error('not called'); } } },
    fetchImpl: async () => { throw new Error('network access forbidden'); },
  });
  assert.equal(plain.text, 'สวัสดีครับ');
});

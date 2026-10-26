import { taxReceiptSummaryForYear } from '../../../../shared/tax.js';
import type { Job } from '../../../../shared/types.js';
import type { UserRow } from '../../services/lineAssistant.js';
import type { AssistantCard, ToolOutcome, ToolSpec } from '../types.js';
import { accountingCheck, cashForecast } from './accountData.js';
import { businessCalc, estimatePersonalIncomeTax, type AllowanceInput, type BusinessCalc, type IncomeInput } from './calc.js';
import { OFFICIAL_LINKS, OFFICIAL_LINK_IDS } from './officialLinks.js';
import { INCOME_TYPES, SUPPORTED_TAX_YEARS, TAX_RULES, taxYearOf, type IncomeType } from './taxRules.js';

// The accounting tools (brief sections 4–6 and 9): all read only. They compute from the user's words and the account's
// own saved data with the tested functions in this folder; nothing is saved, sent or filed. The gateway offers them
// only on an accounting or tax turn while the feature is on for the account (reference.ts).

const num = (description: string) => ({ type: 'number', description });
const ALLOWANCE_IDS = [...new Set(Object.values(TAX_RULES).flatMap(rules => rules.allowances.map(rule => rule.id)))];

export const ACCOUNTING_TOOLS: ToolSpec[] = [
  { name: 'tax_estimate', description: `Estimate Thai personal income tax for a tax year (${SUPPORTED_TAX_YEARS.join(', ')} BE) with the Revenue Department's rules: expenses per income type, allowances with their caps, progressive rates, the 0.5% minimum-tax comparison, withheld-tax credit, tax due or refund, which return (ภ.ง.ด.90/91/94) and its deadline. Use it for every tax figure. use_app_receipts adds this account's receipts and withheld tax for that year; the income TYPE (section 40) must come from the user, so ask when unknown. An estimate, not a ruling.`,
    parameters: { type: 'object', properties: {
      tax_year: { type: 'integer', description: 'Tax year, BE (2568) or CE (2025)' },
      status: { type: 'string', enum: ['single', 'married'], description: 'Single, or married (thresholds then count both spouses)' },
      incomes: { type: 'array', description: 'Income for the year by type', items: { type: 'object', properties: {
        type: { type: 'string', enum: [...INCOME_TYPES] }, amount: num('Gross amount for the year, baht'),
        method: { type: 'string', enum: ['flat', 'actual'], description: 'Flat-rate (default) or actual expenses' },
        actual_expense: num('Actual expenses, baht (method actual)'),
        kind: { type: 'string', description: '40(5): building | farm_land | other_land | vehicle | other | hire_purchase_breach; 40(6): medicine | other; 40(8): listed | performer | unlisted' },
        first_half: num('Part received January to June, baht (half-year return check)'),
      }, required: ['type', 'amount'] } },
      allowances: { type: 'array', description: 'Allowances the user has (personal is added automatically)', items: { type: 'object', properties: {
        id: { type: 'string', enum: ALLOWANCE_IDS }, amount: num('Amount paid, baht'), count: { type: 'integer', description: 'People, for spouse/child/parent/disabled_care' },
      }, required: ['id'] } },
      later_children_from_2561: { type: 'integer', description: 'Children who are the 2nd or later child and born 2561 or after' },
      donations_general: num('General donations, baht'), donations_double: num('Donations deducted at twice the amount (education, hospitals), baht'),
      wht_credit: num('Tax already withheld for the year, baht (from 50 ทวิ / e-WHT)'),
      use_app_receipts: { type: 'boolean', description: 'Add this account\'s recorded receipts and withheld tax for the year' },
    }, required: ['tax_year'] } },
  { name: 'business_calc', description: 'Exact business arithmetic: price_for_margin (price that reaches a margin, with VAT and the client\'s withholding), margin, break_even, discount (profit before and after, sales needed), tax_reserve (money to set aside). Use it instead of calculating.',
    parameters: { type: 'object', properties: {
      kind: { type: 'string', enum: ['price_for_margin', 'margin', 'break_even', 'discount', 'tax_reserve'] },
      cost: num('Cost, baht'), margin_percent: num('Target margin on price, %'), wht_percent: num('Client withholding, %'), vat: { type: 'boolean', description: 'Add 7% VAT (VAT-registered seller)' },
      revenue: num('Revenue, baht'), fixed_costs: num('Fixed costs for the period, baht'), price_per_unit: num('Price per unit, baht'), variable_cost_per_unit: num('Variable cost per unit, baht'),
      price: num('Price, baht'), discount_percent: num('Discount, %'), income: num('Income, baht'), reserve_percent: num('Share to set aside, %'),
    }, required: ['kind'] } },
  { name: 'cash_forecast', description: 'Money this account expects in the next 30/60/90 days from unpaid jobs and installments by due date, money already overdue, unpaid work that has no due date yet, budgeted monthly spending, and best/base/worst cases with their assumptions. Use it for "how much will come in next week/month". Expected money is not received money.',
    parameters: { type: 'object', properties: { days: { type: 'integer', description: '30, 60 or 90 (default 30)' }, include_budget: { type: 'boolean', description: 'Subtract the monthly spending budget set in the app (default true)' } } } },
  { name: 'accounting_check', description: 'Check this account\'s jobs and expenses with tested rules: possible duplicates, received more than due, withholding not matching its rate, installments not adding up, deposit over value, due date before start, odd expenses. Findings are things to check, not mistakes.',
    parameters: { type: 'object', properties: { scope: { type: 'string', enum: ['all', 'jobs', 'expenses'] } } } },
  { name: 'official_link', description: 'Show official website cards (Revenue Department e-Filing, refund status, guides, VAT, withholding rates, DBD, TFAC) with what to do there. Never write official URLs yourself.',
    parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', enum: OFFICIAL_LINK_IDS }, description: 'Up to 3 sites' } }, required: ['ids'] } },
];

export const isAccountingTool = (name: string) => ACCOUNTING_TOOLS.some(tool => tool.name === name);

const fail = (error: string): ToolOutcome => ({ result: { ok: false, error } });
const number = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Record<string, unknown>[] : []);

export function executeAccountingTool(name: string, args: Record<string, unknown>, user: UserRow, now = new Date()): ToolOutcome {
  switch (name) {
    case 'tax_estimate': {
      const taxYear = taxYearOf(number(args.tax_year), now);
      if (!taxYear) return fail(`มีตารางกฎภาษีของปีภาษี ${SUPPORTED_TAX_YEARS.join(' และ ')} เท่านั้น`);
      const incomes: IncomeInput[] = list(args.incomes).flatMap(item => (INCOME_TYPES.includes(item.type as IncomeType) && number(item.amount) !== undefined ? [{
        type: item.type as IncomeType, amount: number(item.amount)!, method: item.method === 'actual' ? 'actual' as const : 'flat' as const,
        actualExpense: number(item.actual_expense), kind: typeof item.kind === 'string' ? item.kind : undefined, firstHalf: number(item.first_half),
      }] : []));
      const allowances: AllowanceInput[] = list(args.allowances).flatMap(item => (typeof item.id === 'string' ? [{ id: item.id, amount: number(item.amount), count: number(item.count) }] : []));
      let appReceipts: Record<string, unknown> | undefined;
      let whtCredit = number(args.wht_credit);
      if (args.use_app_receipts === true) {
        const summary = taxReceiptSummaryForYear((user.jobs || []) as unknown as Job[], taxYear - 543);
        appReceipts = { year_ce: taxYear - 543, gross_before_withholding: summary.fullYear.gross, withheld: summary.fullYear.wht, received: summary.fullYear.received,
          first_half_gross: summary.firstHalf.gross, receipts: summary.rows.length,
          note: 'ยอดรับเงินที่บันทึกในแอปเท่านั้น (นับตามวันที่เงินเข้า) ประเภทเงินได้ต้องให้ผู้ใช้ยืนยัน และอาจมีเงินได้อื่นนอกแอป' };
        if (whtCredit === undefined && summary.fullYear.wht > 0) whtCredit = summary.fullYear.wht;
      }
      if (!incomes.length) {
        return { result: { ok: false, needs: ['income_type'], ...(appReceipts ? { app_receipts: appReceipts } : {}),
          error: 'ต้องรู้ประเภทเงินได้ตามมาตรา 40 และจำนวนเงินก่อนจึงคำนวณได้ ถามผู้ใช้ด้วย ask_user' } };
      }
      const estimate = estimatePersonalIncomeTax({
        taxYear, status: args.status === 'married' ? 'married' : 'single', incomes, allowances, whtCredit,
        laterChildrenFrom2561: number(args.later_children_from_2561), donationsGeneral: number(args.donations_general), donationsDouble: number(args.donations_double),
      });
      if (!estimate.ok) return { result: estimate };
      return { result: { ...estimate, ...(appReceipts ? { app_receipts: appReceipts } : {}),
        ...(appReceipts && number(args.wht_credit) === undefined && whtCredit ? { credit_note: 'ใช้ยอดภาษีที่ถูกหักจากรายการรับเงินในแอปเป็นเครดิต ตรวจกับ 50 ทวิหรือข้อมูล e-WHT อีกครั้ง' } : {}),
        sources: TAX_RULES[taxYear].sources, disclaimer: 'ประมาณการจากข้อมูลที่ผู้ใช้ให้และที่บันทึกไว้ ไม่ใช่การประเมินภาษีของกรมสรรพากร' } };
    }
    case 'business_calc':
      return { result: businessCalc(args as unknown as BusinessCalc) };
    case 'cash_forecast': {
      const window = args.days === 60 || args.days === 90 ? args.days : 30;
      return { result: cashForecast(user, window, args.include_budget !== false, now) };
    }
    case 'accounting_check': {
      const scope = args.scope === 'jobs' || args.scope === 'expenses' ? args.scope : 'all';
      return { result: accountingCheck(user, scope, now) };
    }
    case 'official_link': {
      const ids = [...new Set((Array.isArray(args.ids) ? args.ids : []).filter((id): id is string => typeof id === 'string' && id in OFFICIAL_LINKS))].slice(0, 3);
      if (!ids.length) return fail(`เลือกได้จาก: ${OFFICIAL_LINK_IDS.join(', ')}`);
      const cards: AssistantCard[] = ids.map(id => ({ kind: 'official_link', ...OFFICIAL_LINKS[id] }));
      return { result: { ok: true, shown: ids.map(id => OFFICIAL_LINKS[id].title), card_shown: 'Link cards with an open button are shown under your answer; do not repeat the URLs. Still answer the user\'s question fully in your own words: the cards only add the official sites.' }, extraCards: cards };
    }
    default:
      return fail('ไม่รู้จักเครื่องมือนี้');
  }
}

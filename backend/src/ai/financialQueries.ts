import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { incomeRows, isValidDateKey, sumIncome, type IncomeRow } from '../../../shared/incomeExport.js';
import { getJobPaymentEntries } from '../../../shared/installmentPayments.js';
import { ownMonthlyExpense } from '../../../shared/monthlySummary.js';
import { currentCash } from '../../../shared/cashBalance.js';
import { settleConfirmedTax } from '../../../shared/tax.js';
import { jobNetReceivable, jobWhtAmount, roundMoney } from '../../../shared/wht.js';
import type { AppSettings, Job, TaxYearInputs } from '../../../shared/types.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { ToolOutcome, ToolSpec } from './types.js';

// Pure, read-only queries over the authenticated caller's snapshot. Never accepts an account ID,
// accesses a database, exposes raw settings/files, or sends data to a provider.
const MAX_MONTHS = 60;
const MAX_ROWS = 25;
const MAX_BREAKDOWN = 20;
const string = (description: string) => ({ type: 'string', description });
const PERIOD_FIELDS = {
  year: { type: 'integer', description: 'Calendar year: Gregorian (2026) or Buddhist (2569). Exactly one period selector.' },
  month: string('Calendar month YYYY-MM (e.g. 2026-01). Exactly one period selector.'),
  period: { type: 'string', enum: ['this_month', 'last_month', 'all_time'], description: 'Exactly one period selector; all_time includes every dated receipt through today.' },
  start_date: string('Inclusive YYYY-MM-DD; must be paired with end_date. Maximum 60 calendar months.'),
  end_date: string('Inclusive YYYY-MM-DD; must be paired with start_date.'),
};
const PAGE_FIELDS = {
  offset: { type: 'integer', minimum: 0, description: 'Zero-based offset; use next_offset from the prior result.' },
  limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS, description: 'Rows per page; default 10, maximum 25. Totals always cover all matches.' },
};
const spec = (name: string, description: string, properties: Record<string, unknown>, required?: string[]): ToolSpec => ({
  name, description, parameters: { type: 'object', properties, ...(required ? { required } : {}) },
});
export const FINANCIAL_TOOLS: ToolSpec[] = [
  spec('financial_summary', 'Actual received gross income, withheld tax, net received, dated expenses and cash surplus for an explicit calendar year, month, date range or all time. Includes monthly buckets and client/type/category breakdowns. Use for annual or historical questions; never sum monthly contract values. Future-dated and undated records are disclosed separately, not counted as actual receipts.', PERIOD_FIELDS),
  spec('search_receipts', 'Search the account\'s individual actual payment/deposit/installment receipts, by period and optional text/client/job type. Totals cover all matching receipts before pagination; receipt dates are never inferred from delivery or an unpaid due date.', {
    ...PERIOD_FIELDS, ...PAGE_FIELDS, query: string('Words in job name, client, type or payment label'), client: string('Client name contains'), job_type: string('Job type contains'),
  }),
  spec('search_expenses', 'Search actual expense records by explicit period and optional text/category. Totals and category breakdown cover all matches before pagination. Recurring budgets and savings transfers are not invented expense records.', {
    ...PERIOD_FIELDS, ...PAGE_FIELDS, query: string('Words in expense name or category'), category: string('Expense category contains'),
  }),
  spec('get_expense', 'Read one expense by its exact expense_id from this account, including its note. Can inspect undated or future records; their status is explicit and does not count them as actual cash through today.', { id: string('Exact expense_id returned by search_expenses') }, ['id']),
  spec('cash_position', 'Current recorded cash balance using the same app helper: opening balance plus recorded receipts minus recorded expenses, and cash held in goals. Separate from a month\'s profit or bank balance. Discloses whether an opening balance exists.', {}),
  spec('tax_year_summary', 'For one calendar year (CE or BE), return received gross/net income and allocated withholding credits, actual expense reference totals, and only safe saved tax-planning fields. Saved assessed-tax confirmation is required for tax due; never treats ledger expenses as automatically deductible.', { year: PERIOD_FIELDS.year }, ['year']),
];
export const isFinancialTool = (name: string) => FINANCIAL_TOOLS.some(tool => tool.name === name);

class QueryError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
interface Period {
  kind: 'year' | 'month' | 'range' | 'all_time';
  start: string | null;
  end: string | null;
  year?: number;
}
type Receipt = IncomeRow & { job_id: string };
type ExpenseRecord = { expense_id: string | null; date: string; name: string; category: string; amount: number };
// The legacy LINE snapshot type predates expense IDs, while saved app expenses include them.
type SnapshotExpense = NonNullable<UserRow['expenses']>[number] & { id?: string };
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const money = (value: unknown) => validNumber(value) ? roundMoney(value) : 0;
const sumExpenses = (rows: ExpenseRecord[]) => roundMoney(rows.reduce((total, row) => total + row.amount, 0));
const norm = (text: string) => text.trim().toLocaleLowerCase();
const dateOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  return isValidDateKey(date) ? date : null;
};
const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
const monthFromIndex = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

function yearValue(value: unknown): number {
  const parsed = typeof value === 'string' && /^\d{4}$/.test(value) ? Number(value) : value;
  if (!validNumber(parsed) || !Number.isInteger(parsed)) throw new QueryError('invalid_period', 'ระบุปี ค.ศ. หรือ พ.ศ. เป็นตัวเลขเต็ม เช่น 2026 หรือ 2569');
  const year = parsed >= 2400 ? parsed - 543 : parsed;
  if (year < 1900 || year > 2200) throw new QueryError('invalid_period', 'ปีอยู่นอกช่วงที่รองรับ (ค.ศ. 1900–2200)');
  return year;
}
function parsePeriod(args: Record<string, unknown>, today: string): Period {
  const selectors = ['year', 'month', 'period'].filter(key => own(args, key)).length + (own(args, 'start_date') || own(args, 'end_date') ? 1 : 0);
  if (selectors !== 1) throw new QueryError('invalid_period', 'ระบุช่วงเวลาอย่างใดอย่างหนึ่ง: ปี, เดือน, เดือนนี้/เดือนก่อน/ทั้งหมด หรือวันเริ่มและวันจบ');
  if (own(args, 'year')) {
    const year = yearValue(args.year);
    return { kind: 'year', year, start: `${year}-01-01`, end: `${year}-12-31` };
  }
  let month: string | undefined;
  if (own(args, 'month')) {
    if (typeof args.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) throw new QueryError('invalid_period', 'เดือนต้องเป็น YYYY-MM ที่มีอยู่จริง');
    const year = yearValue(args.month.slice(0, 4));
    month = `${year}-${args.month.slice(5)}`;
  } else if (own(args, 'period')) {
    if (args.period === 'all_time') return { kind: 'all_time', start: null, end: null };
    if (args.period !== 'this_month' && args.period !== 'last_month') throw new QueryError('invalid_period', 'period ต้องเป็น this_month, last_month หรือ all_time');
    month = monthFromIndex(monthIndex(today) - (args.period === 'last_month' ? 1 : 0));
  }
  if (month) return { kind: 'month', start: `${month}-01`, end: lastDay(Number(month.slice(0, 4)), Number(month.slice(5))) };
  if (typeof args.start_date !== 'string' || typeof args.end_date !== 'string' || !isValidDateKey(args.start_date) || !isValidDateKey(args.end_date)) throw new QueryError('invalid_period', 'วันเริ่มและวันจบต้องเป็น YYYY-MM-DD ที่มีอยู่จริง');
  const start = args.start_date, end = args.end_date;
  // Date keys use Gregorian years; BE is accepted explicitly by the year/month selectors.
  if (Number(start.slice(0, 4)) < 1900 || Number(end.slice(0, 4)) > 2200 || start > end || monthIndex(end) - monthIndex(start) + 1 > MAX_MONTHS) throw new QueryError('invalid_period', 'ช่วงวันที่ต้องเรียงจากก่อนถึงหลัง และยาวไม่เกิน 60 เดือน');
  return { kind: 'range', start, end };
}
const inPeriod = (date: string, period: Period) => (!period.start || date >= period.start) && (!period.end || date <= period.end);
function textArg(args: Record<string, unknown>, key: string): string {
  if (!own(args, key)) return '';
  if (typeof args[key] !== 'string' || args[key].length > 200) throw new QueryError('invalid_arguments', `${key} ต้องเป็นข้อความไม่เกิน 200 ตัวอักษร`);
  return norm(args[key]);
}
function pageArgs(args: Record<string, unknown>) {
  const offset = args.offset ?? 0, limit = args.limit ?? 10;
  if (!validNumber(offset) || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || !validNumber(limit) || !Number.isInteger(limit) || limit < 1 || limit > MAX_ROWS) throw new QueryError('invalid_arguments', 'offset ต้องเป็นจำนวนเต็ม 0–100000 และ limit ต้องเป็น 1–25');
  return { offset, limit };
}
function paginate<T>(rows: T[], args: Record<string, unknown>) {
  const { offset, limit } = pageArgs(args);
  const shown = rows.slice(offset, offset + limit);
  return { total: rows.length, shown: shown.length, offset, limit, next_offset: offset + shown.length < rows.length ? offset + shown.length : null, rows: shown };
}
function receiptsFor(jobs: Job[]): Receipt[] {
  // incomeRows already chooses installments OR the job's aggregate amount; never add both.
  return jobs.flatMap(job => incomeRows([job], () => true).map(row => ({ ...row, job_id: job.id })))
    .sort((a, b) => b.date.localeCompare(a.date) || a.jobName.localeCompare(b.jobName) || a.job_id.localeCompare(b.job_id));
}
function undatedReceipts(jobs: Job[]) {
  let count = 0, received = 0;
  for (const job of jobs) {
    for (const entry of getJobPaymentEntries(job)) {
      if (!dateOf(entry.date)) { count += 1; received += entry.amount; }
    }
    if (!getJobPaymentEntries(job).length && job.value > 0 && jobNetReceivable(job) === 0 && jobWhtAmount(job) > 0 && job.pending <= 0 && job.paymentStatus === 'paid' && !dateOf(job.payDate)) count += 1;
  }
  return { count, net_received: roundMoney(received), period_attribution: 'unknown', note: 'ยอดรับที่ไม่มีวันที่รับจริงหรือวันที่ไม่ถูกต้อง ไม่ถูกนำไปใส่ปี/เดือนใดและไม่รวมในยอดรับตามช่วงเวลา' };
}
function breakdown<T>(rows: T[], key: (row: T) => string, amount: (row: T) => number) {
  const groups = new Map<string, { label: string; count: number; amount: number }>();
  for (const row of rows) {
    const label = key(row).trim() || 'ไม่ระบุ';
    const group = groups.get(label) ?? { label, count: 0, amount: 0 };
    group.count += 1; group.amount += amount(row); groups.set(label, group);
  }
  const all = [...groups.values()].map(group => ({ ...group, amount: roundMoney(group.amount) })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  return { total_groups: all.length, shown: Math.min(all.length, MAX_BREAKDOWN), rows: all.slice(0, MAX_BREAKDOWN), omitted_amount: roundMoney(all.slice(MAX_BREAKDOWN).reduce((sum, group) => sum + group.amount, 0)) };
}
function monthlyBuckets(receipts: Receipt[], expenses: ExpenseRecord[], period: Period, today: string) {
  const dated = [...receipts.map(row => row.date), ...expenses.map(row => row.date)].sort();
  const first = period.start?.slice(0, 7) ?? dated[0]?.slice(0, 7);
  const last = period.end?.slice(0, 7) ?? dated.at(-1)?.slice(0, 7) ?? today.slice(0, 7);
  if (!first) return { total_months: 0, shown: 0, omitted_months: 0, rows: [] };
  const total = Math.max(0, monthIndex(last) - monthIndex(first) + 1);
  const startIndex = Math.max(monthIndex(first), monthIndex(last) - MAX_MONTHS + 1);
  const rows = [];
  for (let index = startIndex; index <= monthIndex(last); index += 1) {
    const month = monthFromIndex(index);
    const revenue = sumIncome(receipts.filter(row => row.date.startsWith(month)));
    const actualExpenses = sumExpenses(expenses.filter(row => row.date.startsWith(month)));
    rows.push({ month, ...revenue, actual_expenses: actualExpenses, net_cash_flow: roundMoney(revenue.received - actualExpenses), future_month: month > today.slice(0, 7) });
  }
  return { total_months: total, shown: rows.length, omitted_months: total - rows.length, rows };
}
function recurringBudget(settings: Partial<AppSettings>) {
  const fixed = Array.isArray(settings.fixedExpenseItems) ? settings.fixedExpenseItems : [];
  return { monthly_configured: fixed.length ? roundMoney(fixed.reduce((sum, item) => sum + money(item.amount), 0)) : money(ownMonthlyExpense(settings.monthlyExpense, fixed)),
    included_in_actual_expenses: false, note: 'งบประจำที่ตั้งไว้ไม่ใช่รายการจ่ายจริง; รายจ่ายจริงนับรายการที่มีวันที่เพียงครั้งเดียว และไม่รวมการย้ายเงินเข้ากระปุก' };
}

const TAX_MONEY_FIELDS = ['firstHalfOtherRevenue', 'secondHalfOtherRevenue', 'firstHalfJobsRevenueOverride', 'secondHalfJobsRevenueOverride', 'firstHalfActualExpenseOverride', 'secondHalfActualExpenseOverride', 'firstHalfWhtCreditOverride', 'fullYearWhtCreditOverride', 'firstHalfAssessedTaxOverride', 'fullYearAssessedTaxOverride', 'pnd93Paid', 'pnd94Paid', 'otherTaxCredits'] as const;
const ALLOWANCE_KEYS = new Set(['life_insurance', 'health_insurance', 'rmf', 'thai_esg', 'social_security', 'child', 'parent']);
const TAX_CHECKLIST_KEYS = ['wht50', 'incomeSummary', 'actualReceipts', 'allowanceDocs', 'idCard', 'bankStatement'] as const;
function safeTaxInputs(settings: Partial<AppSettings>, year: number): TaxYearInputs {
  const saved = settings.taxInputsByYear?.[String(year)] ?? {};
  const safe: TaxYearInputs = {};
  for (const key of TAX_MONEY_FIELDS) if (validNumber(saved[key]) && saved[key]! >= 0) safe[key] = roundMoney(saved[key]!);
  if (saved.deductionMethod === 'เหมา' || saved.deductionMethod === 'ตามจริง') safe.deductionMethod = saved.deductionMethod;
  if (Array.isArray(saved.allowances)) safe.allowances = saved.allowances.slice(0, 20).filter(row => ALLOWANCE_KEYS.has(row.key) && validNumber(row.value) && row.value >= 0).map(row => ({ key: row.key, value: money(row.value), ...(validNumber(row.quantity) && row.quantity >= 0 ? { quantity: row.quantity } : {}) }));
  if (saved.checklist && typeof saved.checklist === 'object') {
    safe.checklist = Object.fromEntries(TAX_CHECKLIST_KEYS.filter(key => typeof saved.checklist?.[key] === 'boolean').map(key => [key, saved.checklist![key]]));
  }
  return safe;
}

export function executeFinancialTool(name: string, args: Record<string, unknown>, user: UserRow, now = new Date()): ToolOutcome {
  try {
    const definition = FINANCIAL_TOOLS.find(tool => tool.name === name);
    if (!definition) throw new QueryError('unknown_tool', 'ไม่พบเครื่องมืออ่านข้อมูลนี้');
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => !own(definition.parameters.properties, key))) throw new QueryError('invalid_arguments', 'มีพารามิเตอร์ที่ไม่รองรับ เครื่องมือนี้อ่านได้เฉพาะบัญชีที่เข้าสู่ระบบอยู่');
    if (!user?.user_id) throw new QueryError('account_required', 'ต้องใช้ข้อมูลบัญชีที่ยืนยันตัวตนแล้ว');
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new QueryError('invalid_period', 'เวลาปัจจุบันไม่ถูกต้อง');
    const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    const jobs = (user.jobs ?? []) as Job[];
    const settings = (user.settings ?? {}) as Partial<AppSettings>;
    const sourceExpenses = (user.expenses ?? []) as SnapshotExpense[];
    if (name === 'get_expense') {
      if (typeof args.id !== 'string' || !args.id.trim() || args.id.length > 200) throw new QueryError('invalid_arguments', 'ระบุ id รายจ่ายที่ถูกต้อง');
      const row = sourceExpenses.find(expense => expense.id === args.id);
      if (!row) throw new QueryError('not_found', 'ไม่พบรายจ่ายนี้ในบัญชีที่เข้าสู่ระบบ');
      const date = dateOf(row.date);
      const note = typeof row.note === 'string' ? row.note : '';
      return { result: { ok: true, currency: 'THB', as_of: today, expense: {
        expense_id: row.id, name: String(row.name ?? '').slice(0, 300), category: String(row.category ?? '').slice(0, 200),
        amount: validNumber(row.amount) ? money(row.amount) : null,
        date, recorded_date: typeof row.date === 'string' ? row.date.slice(0, 40) : null,
        date_status: !row.date ? 'undated' : !date ? 'invalid' : date > today ? 'future' : 'dated',
        counted_in_actual_dated_expenses: !!date && date <= today && validNumber(row.amount),
        note: note.slice(0, 2000), note_truncated: note.length > 2000,
      } } };
    }
    const allReceipts = receiptsFor(jobs);
    const datedExpenses: ExpenseRecord[] = sourceExpenses.flatMap(row => {
      const date = dateOf(row.date);
      return date && validNumber(row.amount) ? [{ expense_id: typeof row.id === 'string' ? row.id : null, date, name: String(row.name ?? ''), category: String(row.category ?? ''), amount: money(row.amount) }] : [];
    }).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    if (name === 'cash_position') {
      const hasOpening = validNumber(settings.cashOpening?.amount);
      return { result: { ok: true, currency: 'THB', as_of: today,
        // Money set aside in goals counts only once goals are open to every account (owner, 2026-10-24: only open areas).
        ...currentCash({ amount: hasOpening ? settings.cashOpening!.amount : 0 }, jobs, sourceExpenses, isPhaseOneFeatureAvailable('split', false) ? user.goals ?? [] : []),
        has_opening_balance: hasOpening, basis: 'app_recorded_balance',
        note: 'ยอดตามรายการทั้งหมดที่บันทึกในแอป ไม่ใช่ยอดจากธนาคารโดยตรง; รวมยอดรับที่ยังไม่มีวันที่ตามกติกาหน้าบัญชี และไม่หักงบประจำที่ยังไม่ได้จ่าย',
        undated_receipts: undatedReceipts(jobs),
        future_dated_receipts: { count: allReceipts.filter(row => row.date > today).length, ...sumIncome(allReceipts.filter(row => row.date > today)) },
        future_dated_expenses: { count: datedExpenses.filter(row => row.date > today).length, amount: sumExpenses(datedExpenses.filter(row => row.date > today)) },
      } };
    }
    const period = parsePeriod(args, today);
    const selectedReceipts = allReceipts.filter(row => inPeriod(row.date, period));
    const selectedExpenses = datedExpenses.filter(row => inPeriod(row.date, period));
    const receipts = selectedReceipts.filter(row => row.date <= today);
    const expenses = selectedExpenses.filter(row => row.date <= today);
    const futureReceipts = selectedReceipts.filter(row => row.date > today);
    const futureExpenses = selectedExpenses.filter(row => row.date > today);
    const meta = { ok: true, currency: 'THB', as_of: today,
      period: { kind: period.kind, start_date: period.start, end_date: period.end, ...(period.year ? { year_ce: period.year, year_be: period.year + 543 } : {}), included_through: period.end && period.end < today ? period.end : today },
      undated_receipts: undatedReceipts(jobs),
      invalid_or_undated_expenses: { count: sourceExpenses.filter(row => !dateOf(row.date) || !validNumber(row.amount)).length },
      future_records_excluded: { receipts: { count: futureReceipts.length, ...sumIncome(futureReceipts) }, expenses: { count: futureExpenses.length, amount: sumExpenses(futureExpenses) } },
    };
    if (name === 'search_receipts') {
      const query = textArg(args, 'query'), client = textArg(args, 'client'), jobType = textArg(args, 'job_type');
      const rows = receipts.filter(row => (!query || norm(`${row.jobName} ${row.client} ${row.type} ${row.label}`).includes(query)) && (!client || norm(row.client).includes(client)) && (!jobType || norm(row.type).includes(jobType)));
      return { result: { ...meta, ...paginate(rows, args), totals: { ...sumIncome(rows), unique_jobs: new Set(rows.map(row => row.job_id)).size }, note: 'Totals cover ALL matching dated receipts, not only this page. A job may have multiple payment rows.' } };
    }
    if (name === 'search_expenses') {
      const query = textArg(args, 'query'), category = textArg(args, 'category');
      const rows = expenses.filter(row => (!query || norm(`${row.name} ${row.category}`).includes(query)) && (!category || norm(row.category).includes(category)));
      return { result: { ...meta, ...paginate(rows, args), totals: { actual_expenses: sumExpenses(rows) }, by_category: breakdown(rows, row => row.category, row => row.amount), recurring_budget: recurringBudget(settings) } };
    }
    const revenue = sumIncome(receipts), actualExpenses = sumExpenses(expenses);
    if (name === 'tax_year_summary') {
      const year = period.year!;
      const saved = safeTaxInputs(settings, year);
      const savedAllowances = settings.taxInputsByYear?.[String(year)]?.allowances;
      const firstHalf = receipts.filter(row => Number(row.date.slice(5, 7)) <= 6);
      const secondHalf = receipts.filter(row => Number(row.date.slice(5, 7)) >= 7);
      const firstHalfTotals = sumIncome(firstHalf), secondHalfTotals = sumIncome(secondHalf);
      return { result: { ...meta, receipts: { first_half: firstHalfTotals, second_half: secondHalfTotals, full_year: revenue },
        expense_reference: { first_half: sumExpenses(expenses.filter(row => Number(row.date.slice(5, 7)) <= 6)), second_half: sumExpenses(expenses.filter(row => Number(row.date.slice(5, 7)) >= 7)), full_year: actualExpenses, automatically_tax_deductible: false },
        saved_inputs: saved,
        saved_fields_projection: { mode: 'allowlisted_tax_planning_fields', file_contents_included: false,
          omitted_allowances: Array.isArray(savedAllowances) ? savedAllowances.length - (saved.allowances?.length ?? 0) : 0,
          note: 'แสดงเฉพาะช่องตัวเลข/วิธีหัก/ค่าลดหย่อนที่รองรับ และสถานะเช็กลิสต์ที่เป็นจริงหรือเท็จ; ไม่อ่านไฟล์หลักฐานหรือข้อมูลที่ไม่รองรับ',
        },
        settlement: {
          first_half: settleConfirmedTax(saved.firstHalfAssessedTaxOverride, { whtCredit: saved.firstHalfWhtCreditOverride ?? firstHalfTotals.wht }),
          full_year: settleConfirmedTax(saved.fullYearAssessedTaxOverride, { whtCredit: saved.fullYearWhtCreditOverride ?? revenue.wht, pnd93Paid: saved.pnd93Paid, pnd94Paid: saved.pnd94Paid, otherTaxCredits: saved.otherTaxCredits }),
        },
        note: 'ยอดหัก ณ ที่จ่ายแบ่งตามสัดส่วนเงินรับ เป็นค่าประมาณสำหรับตรวจทานกับหลักฐาน; ค่าใช้จ่ายในบัญชีไม่ใช่ยอดหักได้ทางภาษีโดยอัตโนมัติ; settlement เป็น null เมื่อยังไม่มีภาษีประเมินที่ผู้ใช้ยืนยัน ห้ามแปลว่าไม่ต้องเสียภาษี',
      } };
    }
    return { result: { ...meta,
      totals: { ...revenue, actual_expenses: actualExpenses, net_cash_flow: roundMoney(revenue.received - actualExpenses), receipt_count: receipts.length, unique_jobs: new Set(receipts.map(row => row.job_id)).size, expense_count: expenses.length },
      monthly: monthlyBuckets(receipts, expenses, period, today),
      by_client: breakdown(receipts, row => row.client, row => row.received),
      by_job_type: breakdown(receipts, row => row.type, row => row.received),
      by_expense_category: breakdown(expenses, row => row.category, row => row.amount),
      recurring_budget: recurringBudget(settings),
      basis: 'actual_dated_receipts_less_actual_dated_expenses',
      note: 'ยอดรับใช้วันที่เงินจริงเข้า (มัดจำ/งวด/รับครบ) และไม่รวมยอดงานที่ยังไม่ได้รับ; net_cash_flow ไม่ใช่กำไรหลังเผื่องบประจำของหน้าภาพรวม ไม่ใช่เงินคงเหลือในธนาคาร และไม่ใช่เงินได้สุทธิทางภาษี',
    } };
  } catch (error) {
    if (error instanceof QueryError) return { result: { ok: false, code: error.code, error: error.message } };
    // Do not leak a malformed snapshot or private values through an exception message.
    return { result: { ok: false, code: 'invalid_account_data', error: 'ข้อมูลบัญชีบางรายการไม่ถูกต้อง กรุณาตรวจข้อมูลก่อนสรุป' } };
  }
}

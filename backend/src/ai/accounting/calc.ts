import { settleTax } from '../../../../shared/tax.js';
import { TAX_RULES, type AllowanceRule, type IncomeType, type TaxYearRules } from './taxRules.js';

// Deterministic money and tax arithmetic for เลขากระรอก (brief section 6, "Calculation Engine"). All sums are done in
// whole satang and rounded once at the end, so the model never does the arithmetic and no float drift leaks into a
// figure. Every result lists its assumptions and what it did not compute, so the reply can say so plainly.

const satang = (baht: number): number => Math.round((Number.isFinite(baht) ? baht : 0) * 100);
const baht = (value: number): number => Math.round(value) / 100;
const pct = (value: number, rate: number): number => Math.round(value * rate);
const nonNegative = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

// ---------------------------------------------------------------------------------------------------------------
// Personal income tax estimate
// ---------------------------------------------------------------------------------------------------------------

export interface IncomeInput {
  type: IncomeType;
  amount: number;
  /** Flat-rate or actual expenses (where the law allows both). Defaults to flat. */
  method?: 'flat' | 'actual';
  actualExpense?: number;
  /** 40(5): building | farm_land | other_land | vehicle | other | hire_purchase_breach; 40(6): medicine | other;
   *  40(8): listed (the 43 types, 60%) | performer | unlisted (actual only). */
  kind?: string;
  /** Part received January to June (for the half-year ภ.ง.ด.94 check). */
  firstHalf?: number;
}

export interface AllowanceInput { id: string; amount?: number; count?: number }

export interface TaxEstimateInput {
  taxYear: number;
  status: 'single' | 'married';
  incomes: IncomeInput[];
  allowances?: AllowanceInput[];
  /** Tax already withheld (from 50 ทวิ and e-WHT records). */
  whtCredit?: number;
  /** Children who are the second or later child and were born in 2561 or after (30,000 baht more each). */
  laterChildrenFrom2561?: number;
  /** Donations: general (capped at 10%) and those deducted at twice the amount (education, hospitals, ...). */
  donationsGeneral?: number;
  donationsDouble?: number;
}

export interface TaxEstimate {
  ok: true;
  tax_year: number;
  rules: 'verified' | 'carried';
  incomes: { type: IncomeType; amount: number; expense: number; method: string; note: string }[];
  gross_income: number;
  expenses: number;
  after_expenses: number;
  allowances: { id: string; label: string; claimed: number; allowed: number; note?: string }[];
  total_allowances: number;
  donations: number;
  net_income: number;
  progressive: { tax: number; brackets: { range: string; rate: string; taxable: number; tax: number }[] };
  minimum_tax: { applies: boolean; base: number; amount: number; used: boolean; note: string };
  assessed_tax: number;
  withheld_credit: number;
  due: number;
  overpaid: number;
  filing: { form: 'ภ.ง.ด.90' | 'ภ.ง.ด.91'; threshold: number; over_threshold: boolean | 'depends_on_spouse'; deadline: string; internet_deadline: string | null;
    installments: string | null; half_year: { required: boolean | 'depends_on_spouse' | 'unknown'; first_half_income: number; threshold: number; deadline: string; internet_deadline: string | null } | null };
  assumptions: string[];
  not_computed: string[];
  warnings: string[];
}

const label = (rule: AllowanceRule | undefined, id: string) => rule?.label ?? id;

function expenseFor(rules: TaxYearRules, type: IncomeType, items: IncomeInput[], notes: string[]): { expense: number; method: string } {
  const rule = rules.expenses[type];
  const gross = items.reduce((sum, item) => sum + satang(nonNegative(item.amount)), 0);
  if (!gross) return { expense: 0, method: '-' };
  const actualItems = items.filter(item => item.method === 'actual');
  if (actualItems.length && !rule.actualAllowed) notes.push(`เงินได้ ${type} หักตามจริงไม่ได้ จึงคิดแบบเหมา`);
  if (rule.actualAllowed && actualItems.length === items.length) {
    const actual = items.reduce((sum, item) => sum + satang(nonNegative(item.actualExpense)), 0);
    return { expense: Math.min(actual, gross), method: 'ตามจริง' };
  }
  if (type === '40(8)') {
    let total = 0;
    for (const item of items) {
      const amount = satang(nonNegative(item.amount));
      if (item.method === 'actual' && rule.actualAllowed) { total += Math.min(satang(nonNegative(item.actualExpense)), amount); continue; }
      if (item.kind === 'unlisted') {
        notes.push('เงินได้ 40(8) ประเภทที่ไม่อยู่ในตารางหักเหมาต้องหักตามจริง จึงยังไม่หักค่าใช้จ่ายให้ ถ้ามีหลักฐานให้ระบุยอดตามจริง');
        continue;
      }
      if (item.kind === 'performer') {
        const first = Math.min(amount, 30_000_000);
        total += Math.min(pct(first, 0.6) + pct(amount - first, 0.4), 60_000_000);
        continue;
      }
      total += pct(amount, rule.flat.default);
    }
    return { expense: total, method: actualItems.length ? 'ผสม' : 'เหมา' };
  }
  let total = 0;
  for (const item of items) {
    const amount = satang(nonNegative(item.amount));
    if (item.method === 'actual' && rule.actualAllowed && item.kind !== 'hire_purchase_breach') { total += Math.min(satang(nonNegative(item.actualExpense)), amount); continue; }
    const rate = rule.flat[item.kind ?? ''] ?? rule.flat.default ?? rule.flat.other ?? 0;
    if ((type === '40(5)' || type === '40(6)') && !(item.kind && item.kind in rule.flat)) {
      notes.push(type === '40(5)' ? 'ไม่ได้ระบุชนิดทรัพย์สินที่ให้เช่า จึงใช้อัตราทรัพย์สินอื่น 10%' : 'ไม่ได้ระบุว่าเป็นการประกอบโรคศิลปะหรือไม่ จึงใช้อัตราวิชาชีพอิสระอื่น 30%');
    }
    total += pct(amount, rate);
  }
  if (rule.cap !== undefined && type !== '40(1)' && type !== '40(2)') total = Math.min(total, satang(rule.cap));
  return { expense: total, method: actualItems.length ? 'ผสม' : 'เหมา' };
}

export function estimatePersonalIncomeTax(input: TaxEstimateInput): TaxEstimate | { ok: false; error: string } {
  const rules = TAX_RULES[input.taxYear];
  if (!rules) return { ok: false, error: `ยังไม่มีตารางกฎภาษีของปีภาษี ${input.taxYear} (มีปี ${Object.keys(TAX_RULES).join(', ')})` };
  const incomes = (input.incomes || []).filter(item => item && nonNegative(item.amount) > 0);
  if (!incomes.length) return { ok: false, error: 'ยังไม่มีเงินได้ที่จะคำนวณ ต้องรู้ประเภทเงินได้ (มาตรา 40) และจำนวนเงินก่อน' };
  const notes: string[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const notComputed: string[] = [];

  // Expenses, per type; 40(1) and 40(2) share one 50% / 100,000 baht deduction.
  const byType = new Map<IncomeType, IncomeInput[]>();
  for (const item of incomes) byType.set(item.type, [...(byType.get(item.type) ?? []), item]);
  const rows: TaxEstimate['incomes'] = [];
  let employment = 0;
  const employmentGross = [...(byType.get('40(1)') ?? []), ...(byType.get('40(2)') ?? [])].reduce((sum, item) => sum + satang(item.amount), 0);
  const employmentDeduction = Math.min(pct(employmentGross, 0.5), satang(rules.employmentCap));
  for (const [type, items] of byType) {
    const amount = items.reduce((sum, item) => sum + satang(item.amount), 0);
    let expense: number; let method: string;
    if (type === '40(1)' || type === '40(2)') {
      // Share the combined deduction in proportion to each type's income.
      expense = employmentGross ? Math.round(employmentDeduction * amount / employmentGross) : 0;
      employment += expense; method = 'เหมา';
      if (items.some(item => item.method === 'actual')) notes.push(`เงินได้ ${type} หักตามจริงไม่ได้ จึงคิดแบบเหมา`);
    } else ({ expense, method } = expenseFor(rules, type, items, notes));
    rows.push({ type, amount: baht(amount), expense: baht(expense), method, note: rules.expenses[type].note });
  }
  // Rounding the shared deduction per type must not change its total.
  const employmentRow = rows.filter(row => row.type === '40(1)' || row.type === '40(2)');
  if (employmentRow.length) employmentRow[employmentRow.length - 1].expense = baht(satang(employmentRow[employmentRow.length - 1].expense) + employmentDeduction - employment);
  rows.sort((a, b) => a.type.localeCompare(b.type));
  const gross = rows.reduce((sum, row) => sum + satang(row.amount), 0);
  const expenses = rows.reduce((sum, row) => sum + satang(row.expense), 0);
  const afterExpenses = Math.max(0, gross - expenses);

  // Allowances, each capped by its rule; the retirement group shares one cap; life and health insurance share one.
  const ruleOf = (id: string) => rules.allowances.find(rule => rule.id === id);
  const claimed = new Map<string, AllowanceInput>();
  for (const item of input.allowances ?? []) if (item?.id) claimed.set(item.id, item);
  const allowanceRows: TaxEstimate['allowances'] = [];
  const add = (id: string, claimedSatang: number, allowedSatang: number, note?: string) =>
    allowanceRows.push({ id, label: label(ruleOf(id), id), claimed: baht(claimedSatang), allowed: baht(Math.max(0, allowedSatang)), ...(note ? { note } : {}) });
  add('personal', satang(60_000), satang(ruleOf('personal')!.cap!));
  assumptions.push('นับค่าลดหย่อนส่วนตัวให้ 60,000 บาท');
  let retirementUsed = 0;
  let insuranceUsed = 0;
  for (const [id, item] of claimed) {
    if (id === 'personal') continue;
    const rule = ruleOf(id);
    if (!rule) { notComputed.push(`${id}: ยังไม่ได้คำนวณ (ไม่มีในตารางกฎปี ${rules.taxYear} หรือมีเงื่อนไขเฉพาะ ให้ตรวจกับคู่มือของกรมสรรพากร)`); continue; }
    const count = Math.max(0, Math.floor(nonNegative(item.count)));
    if (['spouse', 'child', 'parent', 'disabled_care'].includes(id)) {
      const units = id === 'spouse' ? Math.min(count || 1, 1) : id === 'parent' ? Math.min(count, 4) : count;
      if (id === 'spouse' && input.status !== 'married') { add(id, satang(rule.cap!), 0, 'ใช้ได้เมื่อมีคู่สมรสที่ไม่มีเงินได้'); continue; }
      let value = units * satang(rule.cap!);
      if (id === 'child') value += Math.min(Math.floor(nonNegative(input.laterChildrenFrom2561)), units) * satang(30_000);
      add(id, value, value, units ? `${units} คน` : undefined);
      continue;
    }
    const amount = satang(nonNegative(item.amount));
    let allowed = rule.cap === null ? amount : Math.min(amount, satang(rule.cap));
    if (rule.shareOfIncome) allowed = Math.min(allowed, pct(gross, rule.shareOfIncome));
    if (id === 'provident_fund') {
      const wages = (byType.get('40(1)') ?? []).reduce((sum, row) => sum + satang(row.amount), 0);
      if (wages) allowed = Math.min(allowed, pct(wages, 0.15));
      else warnings.push('กองทุนสำรองเลี้ยงชีพลดหย่อนได้จากค่าจ้าง (40(1)) เท่านั้น ตรวจอีกครั้ง');
    }
    if (id === 'life_insurance' || id === 'health_insurance') {
      allowed = Math.min(allowed, satang(100_000) - insuranceUsed);
      insuranceUsed += Math.max(0, allowed);
    }
    if (rule.retirementGroup) {
      allowed = Math.min(allowed, satang(rules.retirementCap) - retirementUsed);
      retirementUsed += Math.max(0, allowed);
    }
    add(id, amount, allowed, rule.note);
  }
  const totalAllowances = allowanceRows.reduce((sum, row) => sum + satang(row.allowed), 0);

  // Donations come off last, each capped at 10% of what is left after expenses and the other allowances.
  let base = Math.max(0, afterExpenses - totalAllowances);
  const double = Math.min(satang(nonNegative(input.donationsDouble)) * 2, pct(base, 0.1));
  base -= double;
  const general = Math.min(satang(nonNegative(input.donationsGeneral)), pct(base, 0.1));
  const donations = double + general;
  const net = Math.max(0, afterExpenses - totalAllowances - donations);

  // Progressive tax on net income.
  const brackets: TaxEstimate['progressive']['brackets'] = [];
  let lower = 0; let progressive = 0;
  for (const bracket of rules.brackets) {
    const upper = bracket.upTo === null ? Infinity : satang(bracket.upTo);
    const taxable = Math.max(0, Math.min(net, upper) - lower);
    if (taxable > 0 || lower === 0) {
      const tax = pct(taxable, bracket.rate);
      progressive += tax;
      brackets.push({ range: bracket.upTo === null ? `เกิน ${(lower / 100).toLocaleString('en-US')}` : `${lower ? (lower / 100 + 1).toLocaleString('en-US') : '0'} - ${bracket.upTo.toLocaleString('en-US')}`,
        rate: `${Math.round(bracket.rate * 100)}%`, taxable: baht(taxable), tax: baht(tax) });
    }
    if (net <= upper) break;
    lower = upper;
  }

  // Minimum tax: 0.5% of assessable income other than 40(1) from 120,000 baht, unless that comes to 5,000 or less.
  const minimumBase = rows.filter(row => row.type !== '40(1)').reduce((sum, row) => sum + satang(row.amount), 0);
  const minimumApplies = minimumBase >= satang(rules.minimumTax.from);
  const minimumAmount = minimumApplies ? pct(minimumBase, rules.minimumTax.rate) : 0;
  const minimumCounts = minimumApplies && minimumAmount > satang(rules.minimumTax.exemptUpTo);
  const assessed = minimumCounts ? Math.max(progressive, minimumAmount) : progressive;
  const settlement = settleTax(baht(assessed), { whtCredit: nonNegative(input.whtCredit) });

  // Which return, and whether the income passes its threshold (married thresholds count both spouses).
  const onlyWages = rows.every(row => row.type === '40(1)');
  const form = onlyWages ? rules.filing.pnd91 : rules.filing.pnd90;
  const threshold = input.status === 'married' ? form.married : form.single;
  const over: boolean | 'depends_on_spouse' = gross > satang(threshold) ? true : input.status === 'married' ? 'depends_on_spouse' : false;
  const halfYearTypes = incomes.filter(item => ['40(5)', '40(6)', '40(7)', '40(8)'].includes(item.type));
  let halfYear: TaxEstimate['filing']['half_year'] = null;
  if (halfYearTypes.length) {
    const known = halfYearTypes.every(item => item.firstHalf !== undefined);
    const firstHalf = halfYearTypes.reduce((sum, item) => sum + satang(nonNegative(item.firstHalf)), 0);
    const halfThreshold = input.status === 'married' ? rules.filing.pnd94.married : rules.filing.pnd94.single;
    halfYear = { required: !known ? 'unknown' : firstHalf > satang(halfThreshold) ? true : input.status === 'married' ? 'depends_on_spouse' : false,
      first_half_income: baht(firstHalf), threshold: halfThreshold, deadline: rules.deadlines.pnd94Paper, internet_deadline: rules.deadlines.pnd94Internet };
  }

  assumptions.push(input.status === 'married' ? 'คำนวณเฉพาะเงินได้ของผู้ใช้ ไม่รวมเงินได้ของคู่สมรส' : 'คำนวณแบบผู้มีเงินได้คนเดียว');
  if (rules.status === 'carried') warnings.push(`ปีภาษี ${rules.taxYear}: ใช้อัตราและเกณฑ์ตามกฎหมายที่ใช้กับปีภาษี 2568 กรมสรรพากรยังไม่ออกคู่มือของปีนี้ ค่าลดหย่อนพิเศษเฉพาะปีจึงยังไม่รวม`);
  if (!rules.deadlines.internet) warnings.push('การขยายเวลายื่นออนไลน์ของปีนี้ยังไม่มีประกาศ ตรวจกับกรมสรรพากรก่อนถึงกำหนด');
  notComputed.push('ค่าลดหย่อนหรือการยกเว้นที่ไม่ได้ระบุมา (เช่น ผู้มีอายุ 65 ปีขึ้นไป ค่าฝากครรภ์ กองทุนการออมแห่งชาติ)');
  return {
    ok: true, tax_year: rules.taxYear, rules: rules.status,
    incomes: rows, gross_income: baht(gross), expenses: baht(expenses), after_expenses: baht(afterExpenses),
    allowances: allowanceRows, total_allowances: baht(totalAllowances), donations: baht(donations), net_income: baht(net),
    progressive: { tax: baht(progressive), brackets },
    minimum_tax: { applies: minimumApplies, base: baht(minimumBase), amount: baht(minimumAmount), used: minimumCounts && minimumAmount > progressive,
      note: !minimumApplies ? 'เงินได้ที่ไม่ใช่ 40(1) ไม่ถึง 120,000 บาท จึงไม่ต้องคำนวณวิธีที่ 2'
        : !minimumCounts ? `วิธีที่ 2 (0.5%) ได้ ${baht(minimumAmount).toLocaleString('en-US')} บาท ไม่เกิน 5,000 บาท จึงไม่ใช้ เสียตามอัตราก้าวหน้า`
        : minimumAmount > progressive ? `วิธีที่ 2 (0.5%) ได้มากกว่า จึงเสียตามวิธีที่ 2` : 'อัตราก้าวหน้าได้มากกว่า จึงเสียตามอัตราก้าวหน้า' },
    assessed_tax: baht(assessed), withheld_credit: settlement.totalCredits, due: settlement.due, overpaid: settlement.overpayment,
    filing: { form: onlyWages ? 'ภ.ง.ด.91' : 'ภ.ง.ด.90', threshold, over_threshold: over, deadline: rules.deadlines.paper, internet_deadline: rules.deadlines.internet,
      installments: settlement.due >= rules.installments.minTax ? `ภาษีตั้งแต่ ${rules.installments.minTax.toLocaleString('en-US')} บาท ผ่อนชำระได้ 3 งวด: ${rules.installments.dates.join(', ')}` : null,
      half_year: halfYear },
    assumptions: [...assumptions, ...notes], not_computed: notComputed, warnings,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Business arithmetic: pricing, margin, break-even, discounts, setting tax aside
// ---------------------------------------------------------------------------------------------------------------

export type BusinessCalc =
  | { kind: 'price_for_margin'; cost: number; margin_percent: number; wht_percent?: number; vat?: boolean }
  | { kind: 'margin'; revenue: number; cost: number }
  | { kind: 'break_even'; fixed_costs: number; price_per_unit: number; variable_cost_per_unit: number }
  | { kind: 'discount'; price: number; cost: number; discount_percent: number }
  | { kind: 'tax_reserve'; income: number; reserve_percent: number };

const ratio = (part: number, whole: number) => (whole ? Math.round((part / whole) * 10_000) / 100 : null);

export function businessCalc(input: BusinessCalc): Record<string, unknown> {
  switch (input.kind) {
    case 'price_for_margin': {
      const cost = satang(nonNegative(input.cost));
      // In basis points, so 30% of 7,000 comes to exactly 10,000 (no float remainder rounding it up a satang).
      const marginBp = Math.round(nonNegative(input.margin_percent) * 100);
      if (marginBp >= 10_000) return { ok: false, error: 'อัตรากำไรต้องน้อยกว่า 100%' };
      const price = Math.ceil((cost * 10_000) / (10_000 - marginBp));
      const wht = input.wht_percent ? pct(price, nonNegative(input.wht_percent) / 100) : 0;
      const vat = input.vat ? pct(price, 0.07) : 0;
      return { ok: true, kind: input.kind, cost: baht(cost), price_before_vat: baht(price), gross_profit: baht(price - cost),
        margin_percent: ratio(price - cost, price), markup_percent: ratio(price - cost, cost),
        ...(input.vat ? { vat_7_percent: baht(vat), price_with_vat: baht(price + vat) } : {}),
        ...(wht ? { withheld_by_client: baht(wht), cash_received: baht(price + vat - wht), wht_note: 'ภาษีหัก ณ ที่จ่ายไม่ใช่ต้นทุน เป็นเครดิตภาษีตอนยื่นแบบ' } : {}),
        assumptions: ['ต้นทุนที่ให้มาคือทั้งหมดของงานนี้ ถ้ายังไม่รวมค่าแรงตัวเอง ค่าเดินทาง หรือค่าซอฟต์แวร์ ราคาจะต่ำเกินไป', 'อัตรากำไรคิดจากราคาขาย (margin) ไม่ใช่จากต้นทุน (markup)'] };
    }
    case 'margin': {
      const revenue = satang(nonNegative(input.revenue)); const cost = satang(nonNegative(input.cost));
      return { ok: true, kind: input.kind, revenue: baht(revenue), cost: baht(cost), gross_profit: baht(revenue - cost),
        margin_percent: ratio(revenue - cost, revenue), markup_percent: ratio(revenue - cost, cost) };
    }
    case 'break_even': {
      const fixed = satang(nonNegative(input.fixed_costs)); const price = satang(nonNegative(input.price_per_unit));
      const variable = satang(nonNegative(input.variable_cost_per_unit));
      const contribution = price - variable;
      if (contribution <= 0) return { ok: false, error: 'ราคาต่อหน่วยต้องมากกว่าต้นทุนผันแปรต่อหน่วย ไม่อย่างนั้นขายเท่าไรก็ไม่คุ้มทุน' };
      const units = Math.ceil(fixed / contribution);
      return { ok: true, kind: input.kind, contribution_per_unit: baht(contribution), contribution_margin_percent: ratio(contribution, price),
        units_to_break_even: units, revenue_to_break_even: baht(units * price) };
    }
    case 'discount': {
      const price = satang(nonNegative(input.price)); const cost = satang(nonNegative(input.cost));
      const discounted = price - pct(price, nonNegative(input.discount_percent) / 100);
      const before = price - cost; const after = discounted - cost;
      return { ok: true, kind: input.kind, price_after_discount: baht(discounted), profit_before: baht(before), profit_after: baht(after),
        margin_before_percent: ratio(before, price), margin_after_percent: ratio(after, discounted),
        sales_needed_for_same_profit: after > 0 && before > 0 ? Math.round((before / after) * 100) / 100 : null,
        note: after <= 0 ? 'ราคาหลังลดไม่พอคลุมต้นทุน' : 'ต้องขายได้มากขึ้นเท่านี้เท่าเพื่อให้ได้กำไรเท่าเดิม' };
    }
    case 'tax_reserve': {
      const income = satang(nonNegative(input.income));
      const reserve = pct(income, nonNegative(input.reserve_percent) / 100);
      return { ok: true, kind: input.kind, income: baht(income), set_aside: baht(reserve), spendable: baht(income - reserve),
        note: 'เป็นเงินกันไว้สำหรับภาษีตามสัดส่วนที่เลือก ไม่ใช่ภาษีที่ต้องเสียจริง ให้ใช้ tax_estimate คำนวณภาษีจริง' };
    }
    default:
      return { ok: false, error: 'ไม่รู้จักการคำนวณนี้' };
  }
}

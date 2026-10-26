// Thai personal income tax rules by tax year (Buddhist Era), as structured data the calculator reads (brief section 6,
// "Tax Rule Engine"). Every figure comes from a source in sources.ts that was read on its `checked` date:
// - 2568 is `verified`: read from the Revenue Department's own ภ.ง.ด.90 / ภ.ง.ด.91 guides for tax year 2568.
// - 2569 is `carried`: the same statute carried forward, because the Revenue Department publishes the 2569 guides only
//   near the filing season. Deductions that belong to one year only (Easy E-Receipt, the 2568 house-building and
//   travel measures) are left out, and the internet filing extension is marked as not yet announced.
// Nothing here is a ruling: the calculator presents it as an estimate from what the user said and saved.

export type IncomeType = '40(1)' | '40(2)' | '40(3)' | '40(4)' | '40(5)' | '40(6)' | '40(7)' | '40(8)';
export const INCOME_TYPES: readonly IncomeType[] = ['40(1)', '40(2)', '40(3)', '40(4)', '40(5)', '40(6)', '40(7)', '40(8)'];

/** How a type of income may deduct its expenses: a flat rate, actual costs, or either. */
export interface ExpenseRule {
  /** Flat rates by kind (40(5) per kind of property, 40(6) medicine vs other professions); `default` when one rate. */
  flat: Record<string, number>;
  /** Cap on the flat deduction in baht, if any. */
  cap?: number;
  actualAllowed: boolean;
  note: string;
}

export interface AllowanceRule {
  id: string;
  label: string;
  /** Cap in baht per unit (per person or per policy); null when "as paid". */
  cap: number | null;
  /** Share of assessable income that also caps it (Thai ESG and RMF 30%, pension insurance 15%). */
  shareOfIncome?: number;
  /** Counts in the 500,000 baht combined cap for retirement savings. */
  retirementGroup?: boolean;
  note?: string;
}

export interface TaxYearRules {
  taxYear: number;
  status: 'verified' | 'carried';
  /** Net income brackets: up to `upTo` baht (null = above the last) at `rate`. The first 150,000 is exempt. */
  brackets: { upTo: number | null; rate: number }[];
  filing: {
    /** Single / married (assessable income, either spouse or both together) thresholds per form. */
    pnd90: { single: number; married: number };
    pnd91: { single: number; married: number };
    pnd94: { single: number; married: number };
  };
  expenses: Record<IncomeType, ExpenseRule>;
  /** 40(1) and 40(2) together: 50% of income, at most this much. */
  employmentCap: number;
  allowances: AllowanceRule[];
  retirementCap: number;
  minimumTax: { from: number; rate: number; exemptUpTo: number };
  deadlines: { paper: string; internet: string | null; pnd94Paper: string; pnd94Internet: string | null };
  installments: { minTax: number; dates: string[] };
  sources: string[];
}

const BRACKETS = [
  { upTo: 150_000, rate: 0 }, { upTo: 300_000, rate: 0.05 }, { upTo: 500_000, rate: 0.10 }, { upTo: 750_000, rate: 0.15 },
  { upTo: 1_000_000, rate: 0.20 }, { upTo: 2_000_000, rate: 0.25 }, { upTo: 5_000_000, rate: 0.30 }, { upTo: null, rate: 0.35 },
];

const EXPENSES: Record<IncomeType, ExpenseRule> = {
  '40(1)': { flat: { default: 0.5 }, cap: 100_000, actualAllowed: false, note: 'เงินเดือน ค่าจ้าง หักเหมา 50% รวมกับ 40(2) ไม่เกิน 100,000 บาท' },
  '40(2)': { flat: { default: 0.5 }, cap: 100_000, actualAllowed: false, note: 'ค่าธรรมเนียม ค่านายหน้า เงินได้จากหน้าที่หรืองานที่รับทำ หักเหมา 50% รวมกับ 40(1) ไม่เกิน 100,000 บาท' },
  '40(3)': { flat: { default: 0.5 }, cap: 100_000, actualAllowed: true, note: 'ค่าลิขสิทธิ์ ค่าแห่งกู๊ดวิลล์ หักเหมา 50% ไม่เกิน 100,000 บาท หรือหักตามจริง' },
  '40(4)': { flat: { default: 0 }, actualAllowed: false, note: 'ดอกเบี้ย เงินปันผล ไม่ให้หักค่าใช้จ่าย' },
  '40(5)': { flat: { building: 0.3, farm_land: 0.2, other_land: 0.15, vehicle: 0.3, other: 0.1, hire_purchase_breach: 0.2 }, actualAllowed: true,
    note: 'ค่าเช่า: บ้าน โรงเรือน แพ 30%, ที่ดินเกษตร 20%, ที่ดินอื่น 15%, ยานพาหนะ 30%, ทรัพย์สินอื่น 10% หรือหักตามจริง (ผิดสัญญาเช่าซื้อหักเหมา 20% วิธีเดียว)' },
  '40(6)': { flat: { medicine: 0.6, other: 0.3 }, actualAllowed: true, note: 'วิชาชีพอิสระ: การประกอบโรคศิลปะ 60%, กฎหมาย วิศวกรรม สถาปัตยกรรม การบัญชี ประณีตศิลปกรรม 30% หรือหักตามจริง' },
  '40(7)': { flat: { default: 0.6 }, actualAllowed: true, note: 'รับเหมาที่ผู้รับเหมาจัดหาสัมภาระสำคัญเอง หักเหมา 60% หรือหักตามจริง' },
  '40(8)': { flat: { default: 0.6, performer: 0.6 }, actualAllowed: true,
    note: 'ธุรกิจ การค้า และเงินได้อื่น: หักเหมา 60% สำหรับ 43 ประเภทในตารางของกรมสรรพากร หรือหักตามจริง; ประเภทที่ไม่อยู่ในตารางหักตามจริงเท่านั้น; นักแสดงและนักกีฬาอาชีพ 60% ของ 300,000 บาทแรก 40% ส่วนที่เกิน รวมไม่เกิน 600,000 บาท' },
};

const CORE_ALLOWANCES: AllowanceRule[] = [
  { id: 'personal', label: 'ผู้มีเงินได้', cap: 60_000 },
  { id: 'spouse', label: 'คู่สมรสที่ไม่มีเงินได้', cap: 60_000 },
  { id: 'child', label: 'บุตร (ต่อคน)', cap: 30_000, note: 'บุตรคนที่สองเป็นต้นไปที่เกิดตั้งแต่ปี 2561 ได้เพิ่มอีกคนละ 30,000 บาท' },
  { id: 'parent', label: 'อุปการะเลี้ยงดูบิดามารดา (ต่อคน อายุ 60 ปีขึ้นไป เงินได้ไม่เกิน 30,000 บาท)', cap: 30_000 },
  { id: 'disabled_care', label: 'อุปการะเลี้ยงดูคนพิการหรือคนทุพพลภาพ (ต่อคน)', cap: 60_000 },
  { id: 'life_insurance', label: 'เบี้ยประกันชีวิต', cap: 100_000, note: 'รวมกับเบี้ยประกันสุขภาพตนเองไม่เกิน 100,000 บาท' },
  { id: 'health_insurance', label: 'เบี้ยประกันสุขภาพตนเอง', cap: 25_000, note: 'รวมกับเบี้ยประกันชีวิตไม่เกิน 100,000 บาท' },
  { id: 'parent_health_insurance', label: 'เบี้ยประกันสุขภาพบิดามารดา', cap: 15_000 },
  { id: 'social_security', label: 'เงินสมทบกองทุนประกันสังคม', cap: null, note: 'ตามที่จ่ายจริง' },
  { id: 'home_loan_interest', label: 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย', cap: 100_000 },
  { id: 'provident_fund', label: 'เงินสะสมกองทุนสำรองเลี้ยงชีพ (ส่วนที่ใช้ลดหย่อนและยกเว้น)', cap: 500_000, retirementGroup: true, note: 'ไม่เกิน 15% ของค่าจ้าง' },
  { id: 'rmf', label: 'ค่าซื้อหน่วยลงทุน RMF', cap: 500_000, shareOfIncome: 0.3, retirementGroup: true },
  { id: 'pension_insurance', label: 'เบี้ยประกันชีวิตแบบบำนาญ', cap: 200_000, shareOfIncome: 0.15, retirementGroup: true },
  { id: 'thai_esg', label: 'ค่าซื้อหน่วยลงทุน Thai ESG', cap: 300_000, shareOfIncome: 0.3, note: 'ซื้อระหว่างปี 2567 ถึง 2569: ไม่เกิน 30% ของเงินได้ และไม่เกิน 300,000 บาท' },
  { id: 'art', label: 'ค่าซื้องานศิลปะ (ปี 2568 ถึง 2570)', cap: 100_000 },
];

export const TAX_RULES: Readonly<Record<number, TaxYearRules>> = {
  2568: {
    taxYear: 2568, status: 'verified', brackets: BRACKETS,
    filing: { pnd90: { single: 60_000, married: 120_000 }, pnd91: { single: 120_000, married: 220_000 }, pnd94: { single: 60_000, married: 120_000 } },
    expenses: EXPENSES, employmentCap: 100_000,
    allowances: [...CORE_ALLOWANCES,
      { id: 'easy_e_receipt', label: 'Easy E-Receipt 2.0 (16 ม.ค. ถึง 28 ก.พ. 2568)', cap: 50_000, note: 'ใบกำกับภาษีอิเล็กทรอนิกส์ 30,000 บาท และสินค้า OTOP หรือวิสาหกิจชุมชนอีก 20,000 บาท' },
      { id: 'house_building', label: 'ค่าจ้างสร้างบ้านใหม่ (สัญญา 9 เม.ย. 2567 ถึง 31 ธ.ค. 2568)', cap: 100_000, note: '10,000 บาทต่อทุก 1,000,000 บาท' },
    ],
    retirementCap: 500_000,
    minimumTax: { from: 120_000, rate: 0.005, exemptUpTo: 5_000 },
    deadlines: { paper: '31 มีนาคม 2569', internet: '8 เมษายน 2569', pnd94Paper: '30 กันยายน 2568', pnd94Internet: '8 ตุลาคม 2568' },
    installments: { minTax: 3_000, dates: ['31 มีนาคม 2569', '30 เมษายน 2569', '31 พฤษภาคม 2569'] },
    sources: ['pnd90_2568', 'pnd91_2568', 'pnd94_info', 'pit_rates'],
  },
  2569: {
    taxYear: 2569, status: 'carried', brackets: BRACKETS,
    filing: { pnd90: { single: 60_000, married: 120_000 }, pnd91: { single: 120_000, married: 220_000 }, pnd94: { single: 60_000, married: 120_000 } },
    expenses: EXPENSES, employmentCap: 100_000,
    allowances: CORE_ALLOWANCES,
    retirementCap: 500_000,
    minimumTax: { from: 120_000, rate: 0.005, exemptUpTo: 5_000 },
    // The 8-day internet extension announced so far covers returns due up to 31 January 2570.
    deadlines: { paper: '31 มีนาคม 2570', internet: null, pnd94Paper: '30 กันยายน 2569', pnd94Internet: '8 ตุลาคม 2569' },
    installments: { minTax: 3_000, dates: ['31 มีนาคม 2570', '30 เมษายน 2570', '31 พฤษภาคม 2570'] },
    sources: ['pnd90_2568', 'pnd91_2568', 'pnd94_info', 'pit_rates'],
  },
};

export const SUPPORTED_TAX_YEARS = Object.keys(TAX_RULES).map(Number).sort();

/** Tax year in BE from a CE or BE number; undefined when it is not one of the supported years. */
export function taxYearOf(year: number | undefined, now = new Date()): number | undefined {
  const be = year === undefined ? now.getUTCFullYear() + 543 : year < 2400 ? year + 543 : year;
  return TAX_RULES[be] ? be : undefined;
}

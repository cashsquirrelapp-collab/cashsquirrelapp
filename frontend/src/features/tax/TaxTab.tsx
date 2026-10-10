import { uiSurface } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import { uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Job, AppSettings, Expense, TaxAllowanceInput, TaxAllowanceKey, TaxYearInputs } from '../../../../shared/types';
import { formatCurrency } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import {
  Trash2,
  Plus,
  X,
  Download,
  Calendar,
  AlertTriangle,
  CheckSquare,
  RefreshCw,
  HelpCircle,
  FileCheck,
  Printer,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import {
  settleConfirmedTax,
  taxExpenseSummaryForYear,
  taxExportRowsForYear,
  taxInputsForYear,
  taxReceiptSummaryForYear,
  withTaxInputsForYear,
} from '../../../../shared/tax';

interface TaxTabProps {
  jobs: Job[];
  expenses?: Expense[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

const DEFAULT_CHECKLIST: Record<string, boolean> = {
  wht50: false,
  incomeSummary: false,
  actualReceipts: false,
  allowanceDocs: false,
  idCard: false,
  bankStatement: false,
};

const amountFromInput = (raw: string) => Math.max(0, Number(raw) || 0);
const optionalAmountFromInput = (raw: string): number | undefined => raw.trim() === '' ? undefined : amountFromInput(raw);

export default function TaxTab({
  jobs,
  expenses = [],
  settings,
  onUpdateSettings,
  triggerAlert
}: TaxTabProps) {
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear());
  const [selectedAllowanceKey, setSelectedAllowanceKey] = useState<string>('');
  const [isShowingPrintModal, setIsShowingPrintModal] = useState(false);
  const [taxStep, setTaxStep] = useState<number>(1);

  const allowanceOptions: Array<{ key: TaxAllowanceKey; label: string; cap: number; type: 'input' | 'quantity'; multiplier?: number }> = [
    { key: 'life_insurance', label: 'ประกันชีวิต (ลดหย่อนได้ไม่เกิน 100,000 บาท)', cap: 100000, type: 'input' },
    { key: 'health_insurance', label: 'ประกันสุขภาพ (ลดหย่อนได้ไม่เกิน 25,000 บาท)', cap: 25000, type: 'input' },
    { key: 'rmf', label: 'กองทุน RMF (ไม่เกิน 30% ของเงินได้ สูงสุด 500,000 บาท)', cap: 500000, type: 'input' },
    { key: 'thai_esg', label: 'กองทุน ThaiESG (ไม่เกิน 30% ของเงินได้ สูงสุด 300,000 บาท)', cap: 300000, type: 'input' },
    { key: 'social_security', label: 'ประกันสังคม (ไม่เกิน 9,000 บาทต่อปี)', cap: 9000, type: 'input' },
    { key: 'child', label: 'ค่าเลี้ยงดูบุตร (30,000 บาทต่อคน)', cap: Infinity, type: 'quantity', multiplier: 30000 },
    { key: 'parent', label: 'ค่าเลี้ยงดูบิดามารดา (30,000 บาทต่อคน)', cap: Infinity, type: 'quantity', multiplier: 30000 }
  ];

  const receiptSummary = useMemo(() => taxReceiptSummaryForYear(jobs, taxYear), [jobs, taxYear]);
  const expenseSummary = useMemo(() => taxExpenseSummaryForYear(expenses, taxYear), [expenses, taxYear]);
  const taxInputs = taxInputsForYear(settings, taxYear);
  const updateTaxInputs = (patch: Partial<TaxYearInputs>) => onUpdateSettings(withTaxInputsForYear(settings, taxYear, patch));

  const firstHalfJobsRevenue = taxInputs.firstHalfJobsRevenueOverride ?? receiptSummary.firstHalf.gross;
  const secondHalfJobsRevenue = taxInputs.secondHalfJobsRevenueOverride ?? receiptSummary.secondHalf.gross;
  const firstHalfOtherRevenue = taxInputs.firstHalfOtherRevenue ?? 0;
  const secondHalfOtherRevenue = taxInputs.secondHalfOtherRevenue ?? 0;
  // Ledger expenses are only a reconciliation reference. Tax deductibility depends
  // on the income category and evidence, so the calculator requires explicit,
  // verified amounts instead of silently deducting every cash-flow expense.
  const firstHalfActualExpense = taxInputs.firstHalfActualExpenseOverride;
  const secondHalfActualExpense = taxInputs.secondHalfActualExpenseOverride;
  const h1ExpenseReady = firstHalfActualExpense !== undefined;
  const fullExpenseReady = h1ExpenseReady && secondHalfActualExpense !== undefined;
  const h1Expense = firstHalfActualExpense ?? 0;
  const fullExpense = h1Expense + (secondHalfActualExpense ?? 0);
  const addedAllowances = taxInputs.allowances ?? [];
  const checklist = { ...DEFAULT_CHECKLIST, ...taxInputs.checklist };

  const handleAutoSync = () => {
    updateTaxInputs({
      firstHalfJobsRevenueOverride: undefined,
      secondHalfJobsRevenueOverride: undefined,
    });
    triggerAlert(
      'ซิงค์ข้อมูลสำเร็จ',
      `ดึงเฉพาะรายรับที่รับจริงในปี ${taxYear}: ครึ่งปีแรก ${receiptSummary.firstHalf.gross.toLocaleString()} บาท ครึ่งปีหลัง ${receiptSummary.secondHalf.gross.toLocaleString()} บาท รายจ่ายในบัญชีจะแสดงเพื่ออ้างอิงและจะไม่ถูกหักภาษีอัตโนมัติ`,
    );
  };

  const handleAddAllowance = () => {
    if (!selectedAllowanceKey) return;
    
    if (addedAllowances.some(item => item.key === selectedAllowanceKey)) {
      triggerAlert('รายการซ้ำ', 'คุณได้เพิ่มหัวข้อค่าลดหย่อนนี้ไปแล้ว สามารถแก้ไขจำนวนเงินหรือจำนวนสิทธิ์ในรายการด้านล่างได้ทันที');
      return;
    }

    const opt = allowanceOptions.find(o => o.key === selectedAllowanceKey);
    if (!opt) return;

    const newItem: TaxAllowanceInput = {
      key: opt.key,
      value: 0,
      quantity: opt.type === 'quantity' ? 1 : undefined
    };

    updateTaxInputs({ allowances: [...addedAllowances, newItem] });
    setSelectedAllowanceKey('');
  };

  const handleUpdateAllowanceValue = (key: TaxAllowanceKey, val: number) => {
    updateTaxInputs({ allowances: addedAllowances.map(item => (item.key === key ? { ...item, value: val } : item)) });
  };

  const handleUpdateAllowanceQuantity = (key: TaxAllowanceKey, qty: number) => {
    updateTaxInputs({ allowances: addedAllowances.map(item => (item.key === key ? { ...item, quantity: Math.max(1, qty) } : item)) });
  };

  const handleRemoveAllowance = (key: TaxAllowanceKey) => {
    updateTaxInputs({ allowances: addedAllowances.filter(item => item.key !== key) });
  };

  const toggleChecklistItem = (key: string) => {
    updateTaxInputs({ checklist: { ...checklist, [key]: !checklist[key] } });
  };

  const h1Revenue = useMemo(() => {
    return firstHalfJobsRevenue + firstHalfOtherRevenue;
  }, [firstHalfJobsRevenue, firstHalfOtherRevenue]);

  const h1PersonalAllowance = 30000;

  const h1OtherAllowances = useMemo(() => {
    let sum = 0;
    addedAllowances.forEach(item => {
      if (item.key === 'child') {
        sum += (item.quantity || 0) * 15000;
      } else if (item.key === 'social_security') {
        sum += Math.min(item.value, 4500);
      }
    });
    return sum;
  }, [addedAllowances]);

  const h1NetIncome = useMemo(() => {
    return Math.max(0, h1Revenue - h1Expense - h1PersonalAllowance - h1OtherAllowances);
  }, [h1Revenue, h1Expense, h1OtherAllowances]);

  const h2Revenue = useMemo(() => {
    return secondHalfJobsRevenue + secondHalfOtherRevenue;
  }, [secondHalfJobsRevenue, secondHalfOtherRevenue]);

  const fullRevenue = useMemo(() => {
    return h1Revenue + h2Revenue;
  }, [h1Revenue, h2Revenue]);

  const fullPersonalAllowance = 60000;

  const fullOtherAllowances = useMemo(() => {
    let sum = 0;
    addedAllowances.forEach(item => {
      if (item.key === 'life_insurance') {
        sum += Math.min(item.value, 100000);
      } else if (item.key === 'health_insurance') {
        sum += Math.min(item.value, 25000);
      } else if (item.key === 'rmf') {
        const cap = Math.min(fullRevenue * 0.3, 500000);
        sum += Math.min(item.value, cap);
      } else if (item.key === 'thai_esg') {
        const cap = Math.min(fullRevenue * 0.3, 300000);
        sum += Math.min(item.value, cap);
      } else if (item.key === 'social_security') {
        sum += Math.min(item.value, 9000);
      } else if (item.key === 'child') {
        sum += (item.quantity || 0) * 30000;
      } else if (item.key === 'parent') {
        sum += (item.quantity || 0) * 30000;
      }
    });
    return sum;
  }, [addedAllowances, fullRevenue]);

  const fullNetIncome = useMemo(() => {
    return Math.max(0, fullRevenue - fullExpense - fullPersonalAllowance - fullOtherAllowances);
  }, [fullRevenue, fullExpense, fullOtherAllowances]);

  const calculateProgressiveTax = (netIncome: number) => {
    if (netIncome <= 0) return { totalTax: 0, breakdown: [] };
    
    const brackets = [
      { size: 150000, rate: 0.00, label: '0 - 150,000' },
      { size: 150000, rate: 0.05, label: '150,001 - 300,000' },
      { size: 200000, rate: 0.10, label: '300,001 - 500,000' },
      { size: 250000, rate: 0.15, label: '500,001 - 750,000' },
      { size: 250000, rate: 0.20, label: '750,001 - 1,000,000' },
      { size: 1000000, rate: 0.25, label: '1,000,001 - 2,000,000' },
      { size: 3000000, rate: 0.30, label: '2,000,001 - 5,000,000' },
      { size: Infinity, rate: 0.35, label: 'มากกว่า 5,000,000' }
    ];

    let remaining = netIncome;
    let totalTax = 0;
    const breakdown: { range: string; taxable: number; rate: number; tax: number }[] = [];

    for (const b of brackets) {
      if (remaining <= 0) break;
      const taxableInBracket = Math.min(remaining, b.size);
      const taxInBracket = taxableInBracket * b.rate;
      totalTax += taxInBracket;
      
      if (taxableInBracket > 0) {
        breakdown.push({
          range: b.label,
          taxable: taxableInBracket,
          rate: b.rate,
          tax: taxInBracket
        });
      }
      remaining -= taxableInBracket;
    }

    return { totalTax, breakdown };
  };

  const h1TaxDetails = useMemo(() => calculateProgressiveTax(h1NetIncome), [h1NetIncome]);
  const fullTaxDetails = useMemo(() => calculateProgressiveTax(fullNetIncome), [fullNetIncome]);

  const derivedFirstHalfWhtCredit = receiptSummary.firstHalf.wht;
  const derivedFullYearWhtCredit = receiptSummary.fullYear.wht;
  const firstHalfWhtCredit = taxInputs.firstHalfWhtCreditOverride ?? derivedFirstHalfWhtCredit;
  const fullYearWhtCredit = taxInputs.fullYearWhtCreditOverride ?? derivedFullYearWhtCredit;
  const pnd93Paid = taxInputs.pnd93Paid ?? 0;
  const pnd94Paid = taxInputs.pnd94Paid ?? 0;
  const otherTaxCredits = taxInputs.otherTaxCredits ?? 0;
  const firstHalfAssessedTax = taxInputs.firstHalfAssessedTaxOverride;
  const fullYearAssessedTax = taxInputs.fullYearAssessedTaxOverride;
  const h1Settlement = useMemo(
    () => settleConfirmedTax(firstHalfAssessedTax, { whtCredit: firstHalfWhtCredit }),
    [firstHalfAssessedTax, firstHalfWhtCredit],
  );
  const fullSettlement = useMemo(
    () => settleConfirmedTax(fullYearAssessedTax, { whtCredit: fullYearWhtCredit, pnd93Paid, pnd94Paid, otherTaxCredits }),
    [fullYearAssessedTax, fullYearWhtCredit, otherTaxCredits, pnd93Paid, pnd94Paid],
  );

  const taxResult = (settlement: typeof fullSettlement, key: 'assessedTax' | 'totalCredits' | 'due' | 'overpayment') =>
    settlement ? settlement[key] : 'ยังไม่คำนวณ';
  const formattedTaxResult = (settlement: typeof fullSettlement, key: 'assessedTax' | 'totalCredits' | 'due' | 'overpayment') =>
    settlement ? formatCurrency(settlement[key]) : 'ยังไม่คำนวณ';

  const h1MaxRate = useMemo(() => {
    if (h1TaxDetails.breakdown.length === 0) return 0;
    return h1TaxDetails.breakdown[h1TaxDetails.breakdown.length - 1].rate * 100;
  }, [h1TaxDetails]);

  const fullMaxRate = useMemo(() => {
    if (fullTaxDetails.breakdown.length === 0) return 0;
    return fullTaxDetails.breakdown[fullTaxDetails.breakdown.length - 1].rate * 100;
  }, [fullTaxDetails]);

  const handleDownloadCSV = () => {
    const csvRows = [
      ['\uFEFFสรุปการประเมินและวางแผนภาษี', 'ครึ่งปีแรก (ภ.ง.ด. 94)', 'ทั้งปี (ภ.ง.ด. 90)'],
      ['ปีภาษี', taxYear, taxYear],
      ['รายได้ดีลงานในระบบ', firstHalfJobsRevenue, firstHalfJobsRevenue + secondHalfJobsRevenue],
      ['รายได้เสริมอื่นๆ', firstHalfOtherRevenue, firstHalfOtherRevenue + secondHalfOtherRevenue],
      ['รายได้รวมทั้งหมด', h1Revenue, fullRevenue],
      ['ค่าใช้จ่ายในบัญชี (เพื่ออ้างอิง)', expenseSummary.firstHalf, expenseSummary.fullYear],
      ['ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว', h1ExpenseReady ? h1Expense : 'ยังไม่กรอก', fullExpenseReady ? fullExpense : 'ยังไม่กรอก'],
      ['หักลดหย่อนส่วนตัว', h1PersonalAllowance, fullPersonalAllowance],
      ['หักลดหย่อนเพิ่มเติมอื่นๆ', h1OtherAllowances, fullOtherAllowances],
      ['เงินได้สุทธิ', h1ExpenseReady ? h1NetIncome : 'ยังไม่คำนวณ', fullExpenseReady ? fullNetIncome : 'ยังไม่คำนวณ'],
      ['อัตราภาษีสูงสุดที่เสีย (%)', h1ExpenseReady ? `${h1MaxRate}%` : 'ยังไม่คำนวณ', fullExpenseReady ? `${fullMaxRate}%` : 'ยังไม่คำนวณ'],
      ['ภาษีตามอัตราก้าวหน้า (ข้อมูลประกอบ ไม่รวมภาษีขั้นต่ำ)', h1ExpenseReady ? h1TaxDetails.totalTax : 'ยังไม่คำนวณ', fullExpenseReady ? fullTaxDetails.totalTax : 'ยังไม่คำนวณ'],
      ['ภาษีประเมินที่ยืนยันจากแบบ/ผู้เชี่ยวชาญ', taxResult(h1Settlement, 'assessedTax'), taxResult(fullSettlement, 'assessedTax')],
      ['เครดิตภาษีหัก ณ ที่จ่าย', firstHalfWhtCredit, fullYearWhtCredit],
      ['ภาษีที่ชำระไว้ตาม ภ.ง.ด.93', 0, pnd93Paid],
      ['ภาษีที่ชำระไว้ตาม ภ.ง.ด.94', 0, pnd94Paid],
      ['เครดิตภาษีอื่น', 0, otherTaxCredits],
      ['รวมเครดิตภาษี', taxResult(h1Settlement, 'totalCredits'), taxResult(fullSettlement, 'totalCredits')],
      ['คาดว่าต้องชำระเพิ่ม', taxResult(h1Settlement, 'due'), taxResult(fullSettlement, 'due')],
      ['คาดว่าชำระไว้เกิน', taxResult(h1Settlement, 'overpayment'), taxResult(fullSettlement, 'overpayment')]
    ];
    
    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ผู้ช่วยภาษี_${taxYear}_รายงานสรุป.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAlert('ดาวน์โหลด CSV สำเร็จ', 'จัดส่งและดาวน์โหลดไฟล์รายงานสรุปเรียบร้อยแล้ว');
  };

  const handleExportExcel = async () => {
    // The spreadsheet writer is much larger than the tax calculator; download it only for export.
    let XLSX: typeof import('xlsx');
    try {
      XLSX = await import('xlsx');
    } catch {
      triggerAlert('ดาวน์โหลด Excel ไม่สำเร็จ', 'โหลดเครื่องมือสร้างไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
      return;
    }
    const bracketRows = (label: string, breakdown: { range: string; taxable: number; rate: number; tax: number }[], ready: boolean) => ready
      ? [
          [`ขั้นบันไดภาษี — ${label} (ข้อมูลประกอบ ไม่รวมภาษีขั้นต่ำ)`, '', '', ''],
          ['ช่วงเงินได้สุทธิ (บาท)', 'ฐานภาษีในช่วงนี้ (บาท)', 'อัตราภาษี (%)', 'ภาษีในช่วงนี้ (บาท)'],
          ...breakdown.map((b) => [b.range, b.taxable, `${b.rate * 100}%`, b.tax]),
          ['', '', '', ''],
        ]
      : [
          [`ขั้นบันไดภาษี — ${label}`, 'ยังไม่คำนวณ: ต้องกรอกค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว', '', ''],
          ['', '', '', ''],
        ];

    const summaryRows: (string | number)[][] = [
      ['สรุปการประเมินและวางแผนภาษี', 'ครึ่งปีแรก (ภ.ง.ด. 94)', 'ทั้งปี (ภ.ง.ด. 90)'],
      ['ปีภาษี', taxYear, taxYear],
      ['รายได้ดีลงานในระบบ', firstHalfJobsRevenue, firstHalfJobsRevenue + secondHalfJobsRevenue],
      ['รายได้เสริมอื่นๆ', firstHalfOtherRevenue, firstHalfOtherRevenue + secondHalfOtherRevenue],
      ['รายได้รวมทั้งหมด', h1Revenue, fullRevenue],
      ['ค่าใช้จ่ายในบัญชี (เพื่ออ้างอิง)', expenseSummary.firstHalf, expenseSummary.fullYear],
      ['ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว', h1ExpenseReady ? h1Expense : 'ยังไม่กรอก', fullExpenseReady ? fullExpense : 'ยังไม่กรอก'],
      ['หักลดหย่อนส่วนตัว', h1PersonalAllowance, fullPersonalAllowance],
      ['หักลดหย่อนเพิ่มเติมอื่นๆ', h1OtherAllowances, fullOtherAllowances],
      ['เงินได้สุทธิ', h1ExpenseReady ? h1NetIncome : 'ยังไม่คำนวณ', fullExpenseReady ? fullNetIncome : 'ยังไม่คำนวณ'],
      ['อัตราภาษีสูงสุดที่เสีย (%)', h1ExpenseReady ? `${h1MaxRate}%` : 'ยังไม่คำนวณ', fullExpenseReady ? `${fullMaxRate}%` : 'ยังไม่คำนวณ'],
      ['ภาษีตามอัตราก้าวหน้า (ข้อมูลประกอบ ไม่รวมภาษีขั้นต่ำ)', h1ExpenseReady ? h1TaxDetails.totalTax : 'ยังไม่คำนวณ', fullExpenseReady ? fullTaxDetails.totalTax : 'ยังไม่คำนวณ'],
      ['ภาษีประเมินที่ยืนยันจากแบบ/ผู้เชี่ยวชาญ', taxResult(h1Settlement, 'assessedTax'), taxResult(fullSettlement, 'assessedTax')],
      ['เครดิตภาษีหัก ณ ที่จ่าย', firstHalfWhtCredit, fullYearWhtCredit],
      ['ภาษีที่ชำระไว้ตาม ภ.ง.ด.93', 0, pnd93Paid],
      ['ภาษีที่ชำระไว้ตาม ภ.ง.ด.94', 0, pnd94Paid],
      ['เครดิตภาษีอื่น', 0, otherTaxCredits],
      ['รวมเครดิตภาษี', taxResult(h1Settlement, 'totalCredits'), taxResult(fullSettlement, 'totalCredits')],
      ['คาดว่าต้องชำระเพิ่ม', taxResult(h1Settlement, 'due'), taxResult(fullSettlement, 'due')],
      ['คาดว่าชำระไว้เกิน', taxResult(h1Settlement, 'overpayment'), taxResult(fullSettlement, 'overpayment')],
      ['', '', ''],
      ...bracketRows('ครึ่งปีแรก (ภ.ง.ด. 94)', h1TaxDetails.breakdown, h1ExpenseReady),
      ...bracketRows('ทั้งปี (ภ.ง.ด. 90)', fullTaxDetails.breakdown, fullExpenseReady)
    ];

    const selectedYearRows = taxExportRowsForYear(jobs, expenses, taxYear);
    const incomeHeaders = [
      'วันรับเงินจริง',
      'ชื่อโปรเจกต์',
      'ประเภทงาน',
      'ลูกค้า',
      'งวดรับเงิน',
      'รายได้ก่อนหัก ณ ที่จ่าย (บาท)',
      'หัก ณ ที่จ่าย (%)',
      'จำนวนภาษีหัก ณ ที่จ่าย (บาท)',
      'ยอดรับสุทธิ (บาท)'
    ];
    const incomeRows = selectedYearRows.incomeRows.map(row => [
      row.date,
      row.jobName,
      row.type || 'ทั่วไป',
      row.client || '-',
      row.label,
      row.gross,
      row.whtRate,
      row.wht,
      row.received,
    ]);

    const expenseHeaders = ['ชื่อรายการ', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'วันที่', 'หมายเหตุ'];
    const expenseRows = selectedYearRows.expenseRows.map((e) => [e.name, e.category, e.amount || 0, e.date || '-', e.note || '']);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'สรุปภาษี');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]), 'รายรับ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]), 'รายจ่าย');

    XLSX.writeFile(wb, `บัญชีภาษี_${taxYear}_กระรอกตุนเงิน.xlsx`);
    triggerAlert('ดาวน์โหลด Excel สำเร็จ', `ไฟล์สรุปปี ${taxYear} รวมเฉพาะรายรับที่รับจริงและรายจ่ายในปีที่เลือก กรุณาตรวจทานกับเอกสารก่อนใช้ยื่นภาษี`);
  };

  return (
    <div className="page-content space-y-6" id="tax-assistant-container">
      
      <PageHeader page="tax">
            {(<>
            <div className="flex items-center gap-1.5 bg-brand-faint dark:bg-neutral-800 p-1 rounded-2xl border border-brand-border/20 dark:border-neutral-850">
              <span className="text-xs font-bold text-brand-muted px-3">ปีภาษี:</span>
              <select
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                className="bg-brand-white dark:bg-neutral-900 border border-brand-border/30 dark:border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-brand-text dark:text-neutral-100 font-extrabold focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value={2026}>2569 (2026)</option>
                <option value={2025}>2568 (2025)</option>
                <option value={2024}>2567 (2024)</option>
              </select>
            </div>

            <button
              onClick={() => setIsShowingPrintModal(true)}
              className={uiSecondaryButton}
            >
              <Printer className="w-4 h-4 text-brand-muted" />
              <span>พิมพ์รายงานสรุป</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className={uiSecondaryButton}
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลด CSV</span>
            </button>

            <button
              onClick={handleExportExcel}
              className={uiPrimaryButton}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลด Excel (.xlsx)</span>
            </button>
            </>)}
      </PageHeader>


      {/* KPI CARDS -- matches the mockup's 5-card row, all full-year figures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'รายได้สะสม', value: formatCurrency(fullRevenue) },
          { label: 'ค่าใช้จ่ายหักได้ที่ตรวจสอบ', value: fullExpenseReady ? formatCurrency(fullExpense) : 'รอกรอกยอด' },
          { label: 'ค่าลดหย่อน', value: formatCurrency(fullPersonalAllowance + fullOtherAllowances) },
          { label: 'รายได้สุทธิแบบก้าวหน้า', value: fullExpenseReady ? formatCurrency(fullNetIncome) : 'รอกรอกค่าใช้จ่าย' },
        ].map(kpi => (
          <div key={kpi.label} className={`${uiSurface} p-[14px]`}>
            <p className="text-[10px] text-brand-muted">{kpi.label}</p>
            <p className="mt-1 text-sm font-semibold text-brand-text dark:text-white">{kpi.value}</p>
          </div>
        ))}
        <div className="rounded-[14px] border border-[#F0997B] bg-[#FFF1E8] dark:bg-[#3A2015] dark:border-[#8A3212] p-[14px]">
          <p className="text-[10px] text-[#8A3212] dark:text-[#F0997B]">คาดว่าต้องชำระเพิ่ม</p>
          <p className="mt-1 text-sm font-semibold text-[#C24A16] dark:text-[#F0997B]">{formattedTaxResult(fullSettlement, 'due')}</p>
        </div>
      </div>

      {/* STEP NAVIGATOR -- matches the mockup's circular numbered steps */}
      <div className="flex items-center">
        {(['รายได้', 'ค่าใช้จ่าย', 'ลดหย่อน', 'ประมาณภาษี'] as const).map((label, i) => {
          const n = i + 1;
          const active = n === taxStep;
          const done = n < taxStep;
          return (
            <div key={label} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setTaxStep(n)}
                className="flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    active || done ? 'bg-[#F36A2D] text-white' : 'bg-brand-faint text-brand-muted'
                  }`}
                >
                  {n}
                </span>
                <span className={`whitespace-nowrap text-[11px] ${active ? 'text-brand-text dark:text-white' : 'text-brand-muted'}`}>{label}</span>
              </button>
              {n < 4 && <div className="mx-2 mb-[18px] h-px flex-1 bg-brand-border dark:bg-neutral-800" />}
            </div>
          );
        })}
      </div>

      {/* STEP CONTENT */}
      <div className={`${uiSurface} p-5 sm:p-6 shadow-sm min-h-[180px]`}>
        {taxStep === 1 && (<>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
              รายได้ทั้งปี
            </h3>

            <button
              onClick={() => handleAutoSync()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-faint dark:bg-neutral-800 hover:bg-brand-border/40 dark:hover:bg-neutral-700 border border-brand-border/40 dark:border-neutral-800 rounded-xl text-xs font-black text-emerald-600 dark:text-emerald-400 transition-all select-none cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>ดึงข้อมูลรายรับรายจ่ายในระบบ</span>
            </button>
          </div>

          <p className="text-[22px] font-semibold text-brand-text dark:text-white mb-1">{formatCurrency(fullRevenue)}</p>
          <p className="text-[11px] text-brand-muted mb-4 leading-relaxed">
            รวมรายได้ก่อนหัก ณ ที่จ่ายตามวันที่รับเงินจริง งานที่ยังไม่ได้รับเงิน งวดที่ยังรอชำระ และรายการรับเงินที่ไม่มีวันที่ใช้งานได้จะไม่ถูกนับ กรุณาตรวจวันที่ของรายการเก่าก่อนนำไปใช้
          </p>

          {/* Income Inputs */}
            <div className="space-y-4 mb-6">
              <div className="bg-brand-faint/30 dark:bg-neutral-800/30 p-4 rounded-2xl border border-brand-border/20 dark:border-neutral-800/40">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-brand-text dark:text-neutral-200 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  รายรับครึ่งปีแรก (ม.ค. - มิ.ย.)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-brand-muted mb-1">รายได้งานดีลในระบบ (Auto-sync)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                      <NumberInput
                        value={firstHalfJobsRevenue || ''}
                        placeholder="0"
                        onChange={(raw) => updateTaxInputs({ firstHalfJobsRevenueOverride: optionalAmountFromInput(raw) })}
                        className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-brand-muted mb-1">รายได้เสริมอื่นภายนอก</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                      <NumberInput
                        value={firstHalfOtherRevenue || ''}
                        placeholder="0"
                        onChange={(raw) => updateTaxInputs({ firstHalfOtherRevenue: amountFromInput(raw) })}
                        className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-brand-faint/30 dark:bg-neutral-800/30 p-4 rounded-2xl border border-brand-border/20 dark:border-neutral-800/40">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-brand-text dark:text-neutral-200 mb-3 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  รายรับครึ่งปีหลัง (ก.ค. - ธ.ค.)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-brand-muted mb-1">รายได้งานดีลในระบบ (Auto-sync)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                      <NumberInput
                        value={secondHalfJobsRevenue || ''}
                        placeholder="0"
                        onChange={(raw) => updateTaxInputs({ secondHalfJobsRevenueOverride: optionalAmountFromInput(raw) })}
                        className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-brand-muted mb-1">รายได้เสริมอื่นภายนอก</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                      <NumberInput
                        value={secondHalfOtherRevenue || ''}
                        placeholder="0"
                        onChange={(raw) => updateTaxInputs({ secondHalfOtherRevenue: amountFromInput(raw) })}
                        className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
        </>)}

        {taxStep === 2 && (<>
            <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
              <span className="w-1.5 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
              ค่าใช้จ่าย
            </h3>
            <p className="text-[22px] font-semibold text-brand-text dark:text-white mb-4">{fullExpenseReady ? formatCurrency(fullExpense) : 'รอกรอกยอดที่ตรวจสอบแล้ว'}</p>
            <div className="space-y-3.5 mb-6">
              <div className="rounded-2xl border border-brand-yellow-acc/30 bg-brand-yellow-bg/30 p-4 text-[11px] leading-relaxed text-brand-muted">
                <p className="font-bold text-brand-text dark:text-white">กรอกเฉพาะค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว</p>
                <p className="mt-1">ระบบไม่เลือกสูตรเหมาและไม่หักรายจ่ายทั้งหมดในบัญชีให้อัตโนมัติ เพราะสิทธิหักค่าใช้จ่ายขึ้นกับประเภทเงินได้ตามมาตรา 40 และหลักฐานของแต่ละรายการ</p>
                <p className="mt-2">รายจ่ายในบัญชีเพื่ออ้างอิง: ครึ่งปีแรก {formatCurrency(expenseSummary.firstHalf)} • ครึ่งปีหลัง {formatCurrency(expenseSummary.secondHalf)} • ทั้งปี {formatCurrency(expenseSummary.fullYear)}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-brand-border/20 bg-brand-faint/30 p-4 dark:border-neutral-800/40 dark:bg-neutral-800/30 sm:grid-cols-2">
                <div>
                  <label className="block text-[10px] font-bold text-brand-muted mb-1">ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว — ครึ่งปีแรก</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                    <NumberInput
                      value={firstHalfActualExpense}
                      placeholder="กรอกจากแบบหรือยอดที่ตรวจสอบแล้ว"
                      onChange={(raw) => updateTaxInputs({ firstHalfActualExpenseOverride: optionalAmountFromInput(raw) })}
                      className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-brand-muted mb-1">ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว — ครึ่งปีหลัง</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                    <NumberInput
                      value={secondHalfActualExpense}
                      placeholder="กรอกจากแบบหรือยอดที่ตรวจสอบแล้ว"
                      onChange={(raw) => updateTaxInputs({ secondHalfActualExpenseOverride: optionalAmountFromInput(raw) })}
                      className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
        </>)}

        {taxStep === 3 && (<>
            <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
              <span className="w-1.5 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
              ค่าลดหย่อน
            </h3>
            <p className="text-[22px] font-semibold text-brand-text dark:text-white mb-4">{formatCurrency(fullPersonalAllowance + fullOtherAllowances)}</p>
            {/* Dynamic Allowances Section */}
            <div className="pt-0 border-t-0">
              <label className="block text-xs font-extrabold text-brand-text dark:text-white mb-2">สิทธิ์ลดหย่อนเพิ่มเติมอื่นๆ</label>
              <div className="flex gap-2 mb-4">
                <select
                  value={selectedAllowanceKey}
                  onChange={(e) => setSelectedAllowanceKey(e.target.value)}
                  className="flex-1 bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs font-semibold text-brand-text dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="">-- เลือกสิทธิ์ลดหย่อนภาษีเพื่อเพิ่ม --</option>
                  {allowanceOptions.map(opt => (
                    <option key={opt.key} value={opt.key} disabled={addedAllowances.some(item => item.key === opt.key)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddAllowance}
                  disabled={!selectedAllowanceKey}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-brand-faint disabled:text-brand-muted disabled:border-transparent border border-transparent text-white font-black rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer select-none"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่ม</span>
                </button>
              </div>

              {/* Added Allowances Fields */}
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto no-scrollbar pr-1">
                {addedAllowances.map(item => {
                  const opt = allowanceOptions.find(o => o.key === item.key)!;
                  return (
                    <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-faint/30 dark:bg-neutral-800/30 border border-brand-border/20 dark:border-neutral-800/40 p-3 rounded-2xl">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          <span className="text-xs font-black text-brand-text dark:text-white">{opt.label.split(' (')[0]}</span>
                        </div>
                        {opt.type === 'input' ? (
                          <span className="text-[10px] text-brand-muted font-semibold mt-0.5 block">
                            สิทธิ์ลดหย่อนสูงสุดไม่เกิน {opt.cap.toLocaleString()} บาท
                          </span>
                        ) : (
                          <span className="text-[10px] text-brand-muted font-semibold mt-0.5 block">
                            ลดหย่อน {opt.multiplier?.toLocaleString()} บาท ต่อหน่วยคน
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        {opt.type === 'input' ? (
                          <div className="relative w-36">
                            <span className="absolute left-2.5 top-1.5 text-xs font-bold text-brand-muted">฿</span>
                            <NumberInput
                              value={item.value || ''}
                              placeholder="0"
                              onChange={(raw) => handleUpdateAllowanceValue(item.key, amountFromInput(raw))}
                              className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-lg pl-6 pr-2 py-1 text-xs font-mono font-bold text-brand-text dark:text-white focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 px-2 py-1 rounded-lg">
                            <span className="text-[10px] font-bold text-brand-muted">จำนวน:</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity || 1}
                              onChange={(e) => handleUpdateAllowanceQuantity(item.key, Number(e.target.value))}
                              className="w-10 bg-transparent text-center text-xs font-mono font-bold text-brand-text dark:text-white focus:outline-none"
                            />
                            <span className="text-[10px] font-bold text-brand-muted">คน</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveAllowance(item.key)}
                          className="p-1.5 bg-brand-white dark:bg-neutral-900 hover:bg-brand-faint dark:hover:bg-neutral-850 border border-brand-border/60 dark:border-neutral-800 hover:border-brand-pink-acc text-brand-muted hover:text-brand-pink-acc rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {addedAllowances.length === 0 && (
                  <div className="text-center py-6 text-brand-muted text-xs border border-dashed border-brand-border/60 dark:border-neutral-800 rounded-2xl font-bold bg-brand-faint/20">
                    ยังไม่มีการเพิ่มลดหย่อนอื่น (คิดเฉพาะสิทธิ์ลดหย่อนส่วนตัวครึ่งปี 30,000 บาท และเต็มปี 60,000 บาท เป็นฐานหลัก)
                  </div>
                )}
              </div>
            </div>
        </>)}

        {taxStep === 4 && (<>
          <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2 mb-1">
            <span className="w-1.5 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
            ผลหลังหักเครดิตจากภาษีที่ยืนยันแล้ว
          </h3>
          <p className="text-[11px] text-brand-muted mb-1">ระบบจะแสดงยอดชำระเพิ่มหรือชำระไว้เกิน เมื่อกรอกภาษีประเมินจากแบบปัจจุบันหรือผู้เชี่ยวชาญแล้วเท่านั้น</p>
          <p className="text-[26px] font-semibold text-[#C24A16] mb-2">{formattedTaxResult(fullSettlement, 'due')}</p>
          {fullSettlement && fullSettlement.overpayment > 0 && <p className="text-sm font-semibold text-emerald-600 mb-2">คาดว่าชำระไว้เกิน {formatCurrency(fullSettlement.overpayment)}</p>}

          <div className="mb-6 rounded-[14px] border border-brand-yellow-acc/30 bg-brand-yellow-bg/30 p-4 text-[11px] leading-relaxed text-brand-muted">
            <p className="font-bold text-brand-text dark:text-white">ยังไม่มีสูตรภาษีอัตโนมัติที่ใช้ยื่นได้</p>
            <p className="mt-1">หน้าที่ยื่น ภ.ง.ด.94 วิธีหักค่าใช้จ่าย และภาษีขั้นต่ำทางเลือกขึ้นกับประเภทเงินได้ตามมาตรา 40 และสถานะผู้เสียภาษี แอปยังไม่รองรับการตัดสินเงื่อนไขเหล่านี้ จึงไม่นำยอดตามอัตราก้าวหน้าด้านล่างไปสรุปเป็นยอดชำระ</p>
          </div>

          <div className="mb-6 rounded-[14px] border border-brand-border/40 dark:border-neutral-800 p-5">
            <h3 className="text-sm font-bold text-brand-text dark:text-white">ภาษีประเมินก่อนเครดิตที่ยืนยันแล้ว</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">คัดลอกยอดจากแบบ ภ.ง.ด.94 / ภ.ง.ด.90 ฉบับปัจจุบัน หรือยอดที่ผู้เชี่ยวชาญยืนยัน เว้นว่างไว้หากยังไม่ได้ตรวจสอบ ระบบจะไม่แทนค่าว่างด้วยศูนย์</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[10px] font-bold text-brand-muted">ภาษีประเมิน — ครึ่งปี (ภ.ง.ด.94)
                <NumberInput value={firstHalfAssessedTax} placeholder="ยังไม่คำนวณ" onChange={(raw) => updateTaxInputs({ firstHalfAssessedTaxOverride: optionalAmountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
              <label className="text-[10px] font-bold text-brand-muted">ภาษีประเมิน — ทั้งปี (ภ.ง.ด.90)
                <NumberInput value={fullYearAssessedTax} placeholder="ยังไม่คำนวณ" onChange={(raw) => updateTaxInputs({ fullYearAssessedTaxOverride: optionalAmountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
            </div>
          </div>

          <div className="mb-6 rounded-[14px] border border-brand-border/40 dark:border-neutral-800 p-5">
            <h3 className="text-sm font-bold text-brand-text dark:text-white">เครดิตภาษีที่จ่ายไว้แล้ว</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">ยอดหัก ณ ที่จ่ายจากรายการรับเงินเป็นเพียงค่าประมาณ เพราะงานหนึ่งมียอดหักรวมเดียว เว้นว่างเพื่อใช้ค่าประมาณ หรือกรอกยอดจริงจากใบ 50 ทวิ</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-[10px] font-bold text-brand-muted">หัก ณ ที่จ่ายจริง — ครึ่งปี
                <NumberInput value={taxInputs.firstHalfWhtCreditOverride} placeholder={`ประมาณ ${derivedFirstHalfWhtCredit.toLocaleString()}`} onChange={(raw) => updateTaxInputs({ firstHalfWhtCreditOverride: optionalAmountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
              <label className="text-[10px] font-bold text-brand-muted">หัก ณ ที่จ่ายจริง — ทั้งปี
                <NumberInput value={taxInputs.fullYearWhtCreditOverride} placeholder={`ประมาณ ${derivedFullYearWhtCredit.toLocaleString()}`} onChange={(raw) => updateTaxInputs({ fullYearWhtCreditOverride: optionalAmountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
              <label className="text-[10px] font-bold text-brand-muted">ชำระไว้ตาม ภ.ง.ด.93
                <NumberInput value={pnd93Paid || ''} placeholder="0" onChange={(raw) => updateTaxInputs({ pnd93Paid: amountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
              <label className="text-[10px] font-bold text-brand-muted">ชำระไว้ตาม ภ.ง.ด.94
                <NumberInput value={pnd94Paid || ''} placeholder="0" onChange={(raw) => updateTaxInputs({ pnd94Paid: amountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
              <label className="text-[10px] font-bold text-brand-muted">เครดิตภาษีอื่นที่ยืนยันได้
                <NumberInput value={otherTaxCredits || ''} placeholder="0" onChange={(raw) => updateTaxInputs({ otherTaxCredits: amountFromInput(raw) })} className="mt-1.5 w-full rounded-xl border border-brand-border/60 bg-brand-white px-3 py-2 text-xs font-mono font-bold text-brand-text focus:outline-none dark:bg-neutral-900" />
              </label>
            </div>
          </div>

          <div className="rounded-[14px] border border-brand-border/40 dark:border-neutral-800 p-5 sm:p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-600/5 rounded-full blur-xl pointer-events-none" />
            <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2 mb-4">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              สรุปตารางประเมินผลภาษีบุคคลธรรมดา
            </h3>

            {/* Side-by-side Table */}
            <div className="overflow-x-auto rounded-2xl border border-brand-border/30 dark:border-neutral-800">
              <table className="w-full text-xs text-left text-brand-muted">
                <thead>
                  <tr className="bg-brand-faint dark:bg-neutral-800 text-[10px] uppercase font-extrabold tracking-wider text-brand-text dark:text-white border-b border-brand-border/30 dark:border-neutral-850">
                    <th className="py-2.5 px-3">หัวข้อหลัก</th>
                    <th className="py-2.5 px-3 text-right">ภ.ง.ด. 94 (ครึ่งปี)</th>
                    <th className="py-2.5 px-3 text-right">ภ.ง.ด. 90 (เต็มปี)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/20 dark:divide-neutral-800/60">
                  <tr className="hover:bg-brand-faint/10">
                    <td className="py-2 px-3 font-semibold text-brand-text dark:text-neutral-200">1. รายรับรวม</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-100">{formatCurrency(h1Revenue)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-100">{formatCurrency(fullRevenue)}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10">
                    <td className="py-2 px-3 font-semibold text-brand-muted">หัก ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-pink-acc">{h1ExpenseReady ? `-${formatCurrency(h1Expense)}` : 'ยังไม่กรอก'}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-pink-acc">{fullExpenseReady ? `-${formatCurrency(fullExpense)}` : 'ยังไม่กรอก'}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10 bg-brand-faint/20 dark:bg-neutral-800/20 font-bold">
                    <td className="py-2 px-3 text-brand-text dark:text-neutral-100">เงินได้หลังหักใช้จ่าย</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{h1ExpenseReady ? formatCurrency(Math.max(0, h1Revenue - h1Expense)) : 'ยังไม่คำนวณ'}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{fullExpenseReady ? formatCurrency(Math.max(0, fullRevenue - fullExpense)) : 'ยังไม่คำนวณ'}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10">
                    <td className="py-2 px-3 font-semibold text-brand-muted">หัก ลดหย่อนส่วนตัว</td>
                    <td className="py-2 px-3 text-right font-mono text-brand-pink-acc">-{formatCurrency(h1PersonalAllowance)}</td>
                    <td className="py-2 px-3 text-right font-mono text-brand-pink-acc">-{formatCurrency(fullPersonalAllowance)}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10">
                    <td className="py-2 px-3 font-semibold text-brand-muted flex items-center gap-1">
                      หัก ลดหย่อนเพิ่มเติม
                      <span title="ตามรายการลดหย่อนที่คุณกำหนดไว้"><HelpCircle className="w-3 h-3 text-brand-muted cursor-help" /></span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-brand-pink-acc">-{formatCurrency(h1OtherAllowances)}</td>
                    <td className="py-2 px-3 text-right font-mono text-brand-pink-acc">-{formatCurrency(fullOtherAllowances)}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10 bg-brand-faint/40 dark:bg-neutral-800/40 font-black border-t border-brand-border/40 dark:border-neutral-800">
                    <td className="py-3 px-3 text-brand-text dark:text-white text-xs">เงินได้สุทธิประเมิน</td>
                    <td className="py-3 px-3 text-right font-mono text-brand-blue-acc dark:text-brand-blue-acc text-sm">{h1ExpenseReady ? formatCurrency(h1NetIncome) : 'ยังไม่คำนวณ'}</td>
                    <td className="py-3 px-3 text-right font-mono text-purple-600 dark:text-purple-400 text-sm">{fullExpenseReady ? formatCurrency(fullNetIncome) : 'ยังไม่คำนวณ'}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10 text-brand-muted">
                    <td className="py-2 px-3">อัตราภาษีสูงสุด (%)</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-200">{h1ExpenseReady ? `${h1MaxRate}%` : '—'}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-200">{fullExpenseReady ? `${fullMaxRate}%` : '—'}</td>
                  </tr>
                  <tr className="border-t-2 border-brand-border dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-semibold text-brand-text dark:text-white">ภาษีประเมินที่ยืนยันจากแบบ/ผู้เชี่ยวชาญ</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-brand-yellow-acc">{formattedTaxResult(h1Settlement, 'assessedTax')}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-brand-yellow-acc">{formattedTaxResult(fullSettlement, 'assessedTax')}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-brand-muted">หัก เครดิตภาษีหัก ณ ที่จ่าย</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600">-{formatCurrency(firstHalfWhtCredit)}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600">-{formatCurrency(fullYearWhtCredit)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 text-brand-muted">หัก ภาษีที่ชำระไว้และเครดิตอื่น</td>
                    <td className="py-2 px-3 text-right font-mono text-brand-muted">—</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600">-{formatCurrency(pnd93Paid + pnd94Paid + otherTaxCredits)}</td>
                  </tr>
                  <tr className="bg-brand-faint/50 dark:bg-neutral-850 font-extrabold">
                    <td className="py-3.5 px-3 text-[#C24A16] dark:text-[#F0997B] text-xs">คาดว่าต้องชำระเพิ่ม</td>
                    <td className="py-3.5 px-3 text-right font-mono text-[#C24A16] dark:text-[#F0997B] text-base">{formattedTaxResult(h1Settlement, 'due')}</td>
                    <td className="py-3.5 px-3 text-right font-mono text-[#C24A16] dark:text-[#F0997B] text-base">{formattedTaxResult(fullSettlement, 'due')}</td>
                  </tr>
                  <tr className="bg-brand-green-bg/30 font-extrabold">
                    <td className="py-3 px-3 text-emerald-700 dark:text-emerald-400 text-xs">คาดว่าชำระไว้เกิน</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">{formattedTaxResult(h1Settlement, 'overpayment')}</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">{formattedTaxResult(fullSettlement, 'overpayment')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Progressive brackets display */}
            <div className="mt-5 space-y-2 bg-brand-faint/30 dark:bg-neutral-850 p-4 rounded-2xl border border-brand-border/20 dark:border-neutral-800/40">
              <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">ข้อมูลประกอบ: อัตราภาษีก้าวหน้า (ยังไม่รวมภาษีขั้นต่ำทางเลือก)</h4>
              {!fullExpenseReady && <p className="text-[10px] font-bold text-brand-yellow-acc">กรอกค่าใช้จ่ายหักได้ที่ตรวจสอบแล้วทั้งสองครึ่งปีก่อนดูตัวอย่างอัตราก้าวหน้า</p>}
              <div className="space-y-1.5 mt-2.5">
                {fullExpenseReady && fullTaxDetails.breakdown.map((b, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-brand-muted font-semibold">{b.range}</span>
                    <span className="text-brand-text dark:text-neutral-200 font-bold">
                      {formatCurrency(b.taxable)} x {b.rate * 100}% = <span className="text-brand-yellow-acc font-black">{formatCurrency(b.tax)}</span>
                    </span>
                  </div>
                ))}
                {fullExpenseReady && fullTaxDetails.breakdown.length === 0 && (
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 py-1">
                    <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>เงินได้สุทธิอยู่ในเกณฑ์ยกเว้นภาษีทั้งหมด</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DOCUMENTS TO PREPARE CARD */}
          <div className="mt-6 rounded-[14px] border border-brand-border/40 dark:border-neutral-800 p-5 sm:p-6">
            <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2 mb-4">
              <FileCheck className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              เช็คลิสต์เตรียมเอกสารที่สำคัญ
            </h3>
            <p className="text-[11px] text-brand-muted leading-relaxed mb-4">
              การเตรียมเอกสารเหล่านี้ไว้ล่วงหน้า จะช่วยให้คุณยื่นแบบภาษีได้อย่างสะดวกรวดเร็วและไม่มีข้อผิดพลาด
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => toggleChecklistItem('wht50')}
                className="w-full text-left flex items-start gap-2.5 p-3 rounded-2xl bg-brand-faint/20 hover:bg-brand-faint/40 dark:bg-neutral-800/20 dark:hover:bg-neutral-800/40 border border-brand-border/20 dark:border-neutral-800 hover:border-brand-border/40 transition-all cursor-pointer group"
              >
                <div className="mt-0.5">
                  {checklist.wht50 ? (
                    <div className="w-4.5 h-4.5 bg-emerald-600 rounded-md flex items-center justify-center border border-emerald-500">
                      <X className="w-3 h-3 text-white font-black" />
                    </div>
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-md border border-brand-border/60 group-hover:border-brand-muted" />
                  )}
                </div>
                <div>
                  <h4 className={`text-xs font-bold leading-tight ${checklist.wht50 ? 'line-through text-brand-muted' : 'text-brand-text dark:text-white'}`}>
                    หนังสือรับรองการหักภาษี ณ ที่จ่าย (ใบ 50 ทวิ)
                  </h4>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    ได้รับจากลูกค้าหรือเอเจนซี่เมื่อได้รับเงิน เป็นเอกสารสำคัญในการเครดิตลดภาษีสะสม
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleChecklistItem('incomeSummary')}
                className="w-full text-left flex items-start gap-2.5 p-3 rounded-2xl bg-brand-faint/20 hover:bg-brand-faint/40 dark:bg-neutral-800/20 dark:hover:bg-neutral-800/40 border border-brand-border/20 dark:border-neutral-800 hover:border-brand-border/40 transition-all cursor-pointer group"
              >
                <div className="mt-0.5">
                  {checklist.incomeSummary ? (
                    <div className="w-4.5 h-4.5 bg-emerald-600 rounded-md flex items-center justify-center border border-emerald-500">
                      <X className="w-3 h-3 text-white font-black" />
                    </div>
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-md border border-brand-border/60 group-hover:border-brand-muted" />
                  )}
                </div>
                <div>
                  <h4 className={`text-xs font-bold leading-tight ${checklist.incomeSummary ? 'line-through text-brand-muted' : 'text-brand-text dark:text-white'}`}>
                    รายงานสรุปรายรับจากบัญชีการดีลและงานจริง
                  </h4>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    ประวัติการรับเงินจริงเพื่อใช้คำนวณฐานรายได้สะสมตลอดทั้งปี
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleChecklistItem('actualReceipts')}
                className="w-full text-left flex items-start gap-2.5 p-3 rounded-2xl bg-brand-faint/20 hover:bg-brand-faint/40 dark:bg-neutral-800/20 dark:hover:bg-neutral-800/40 border border-brand-border/20 dark:border-neutral-800 hover:border-brand-border/40 transition-all cursor-pointer group"
              >
                <div className="mt-0.5">
                  {checklist.actualReceipts ? (
                    <div className="w-4.5 h-4.5 bg-emerald-600 rounded-md flex items-center justify-center border border-emerald-500">
                      <X className="w-3 h-3 text-white font-black" />
                    </div>
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-md border border-brand-border/60 group-hover:border-brand-muted" />
                  )}
                </div>
                <div>
                  <h4 className={`text-xs font-bold leading-tight ${checklist.actualReceipts ? 'line-through text-brand-muted' : 'text-brand-text dark:text-white'}`}>
                    หลักฐานค่าใช้จ่ายจริงในการทำธุรกิจ
                  </h4>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    ใบกำกับภาษีหรือใบเสร็จรับเงินต่างๆ กรณีเลือกคำนวณหักตามความจำเป็นและสมควรตามจริง
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => toggleChecklistItem('allowanceDocs')}
                className="w-full text-left flex items-start gap-2.5 p-3 rounded-2xl bg-brand-faint/20 hover:bg-brand-faint/40 dark:bg-neutral-800/20 dark:hover:bg-neutral-800/40 border border-brand-border/20 dark:border-neutral-800 hover:border-brand-border/40 transition-all cursor-pointer group"
              >
                <div className="mt-0.5">
                  {checklist.allowanceDocs ? (
                    <div className="w-4.5 h-4.5 bg-emerald-600 rounded-md flex items-center justify-center border border-emerald-500">
                      <X className="w-3 h-3 text-white font-black" />
                    </div>
                  ) : (
                    <div className="w-4.5 h-4.5 rounded-md border border-brand-border/60 group-hover:border-brand-muted" />
                  )}
                </div>
                <div>
                  <h4 className={`text-xs font-bold leading-tight ${checklist.allowanceDocs ? 'line-through text-brand-muted' : 'text-brand-text dark:text-white'}`}>
                    เอกสารรับรองสิทธิ์ลดหย่อนเพิ่มเติม
                  </h4>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    เช่น ใบรับรองสิทธิ์การลดหย่อนประกันชีวิต ประกันสังคม หรือหลักฐานสิทธิการเลี้ยงดูและกองทุนต่างๆ
                  </p>
                </div>
              </button>
            </div>
          </div>
        </>)}
      </div>

      {/* STEP NAV BUTTONS */}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => setTaxStep(s => Math.max(1, s - 1))}
          disabled={taxStep === 1}
          className="rounded-xl bg-brand-faint dark:bg-neutral-800 px-[18px] py-2.5 text-[13px] text-brand-muted transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={() => setTaxStep(s => Math.min(4, s + 1))}
          disabled={taxStep === 4}
          className="rounded-xl bg-[#F36A2D] px-[18px] py-2.5 text-[13px] font-medium text-white transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          ถัดไป
        </button>
      </div>

      {/* PRINT PREVIEW / DETAILED PDF MODAL OVERLAY */}
      <AnimatePresence>
        {isShowingPrintModal && (
          <div id="tax-report-print-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto no-scrollbar">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white text-neutral-900 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative border border-slate-200 my-8 print-area"
              id="printable-tax-report-modal"
            >
              <button
                onClick={() => setIsShowingPrintModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer transition-colors print:hidden"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-6 select-text">
                <div className="border-b-2 border-slate-900 pb-5 text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 print:text-emerald-700">เอกสารประเมินประกอบการวางแผนจัดการแบบไม่เป็นทางการ</span>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 mt-1">
                    รายงานสรุปและประเมินภาษีบุคคลธรรมดา
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    จัดทำผ่านแบบระบบผู้ช่วยส่วนบุคคล • รอบปีภาษี {taxYear} (พ.ศ. {taxYear + 543})
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6 text-xs border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">ข้อมูลผู้ยื่นประเมิน</h3>
                    <p className="font-bold text-slate-800">ผู้ใช้งานแอปพลิเคชันหลัก</p>
                    <p className="text-slate-500 mt-0.5">ค่าใช้จ่าย: กรอกยอดหักได้ที่ตรวจสอบแล้วเท่านั้น</p>
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">วันที่ออกเอกสาร</h3>
                    <p className="font-mono text-slate-800 font-semibold">{new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="text-slate-500 mt-0.5">สถานะ: เอกสารประกอบการตรวจสอบก่อนยื่น</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">1. สรุปรายละเอียดรายได้หลัก</h3>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-xs text-left text-slate-700 border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600 border-b border-slate-300">
                        <th className="py-2 px-3">หมวดหมู่รายได้</th>
                        <th className="py-2 px-3 text-right">ครึ่งปีแรก (ภ.ง.ด. 94)</th>
                        <th className="py-2 px-3 text-right">ครึ่งปีหลัง</th>
                        <th className="py-2 px-3 text-right">รวมตลอดทั้งปี (ภ.ง.ด. 90)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 border-b border-slate-200">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">รายได้งานดีลในระบบ</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{formatCurrency(firstHalfJobsRevenue)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{formatCurrency(secondHalfJobsRevenue)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(firstHalfJobsRevenue + secondHalfJobsRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">รายได้เสริมอื่นภายนอก</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{formatCurrency(firstHalfOtherRevenue)}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">{formatCurrency(secondHalfOtherRevenue)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatCurrency(firstHalfOtherRevenue + secondHalfOtherRevenue)}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2.5 px-3 text-slate-900 font-extrabold">รายได้รวมทั้งหมด</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600">{formatCurrency(h1Revenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600">{formatCurrency(h2Revenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-indigo-700 text-sm">{formatCurrency(fullRevenue)}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1">2. ตารางสรุปการประเมินภาษีแบบขั้นบันได</h3>
                  <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-xs text-left text-slate-700 border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-[10px] font-extrabold text-slate-600 border-b border-slate-300">
                        <th className="py-2 px-3">รายการการเงิน</th>
                        <th className="py-2 px-3 text-right">ครึ่งปีแรก (ภ.ง.ด. 94)</th>
                        <th className="py-2 px-3 text-right">ยอดรวมตลอดทั้งปี (ภ.ง.ด. 90)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 px-3 text-slate-800">รายได้รวมสะสมประเมิน</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{formatCurrency(h1Revenue)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">{formatCurrency(fullRevenue)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-500">หัก ค่าใช้จ่ายหักได้ที่ตรวจสอบแล้ว</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">{h1ExpenseReady ? `-${formatCurrency(h1Expense)}` : 'ยังไม่กรอก'}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">{fullExpenseReady ? `-${formatCurrency(fullExpense)}` : 'ยังไม่กรอก'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-500">หัก สิทธิ์ลดหย่อนส่วนตัว</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(h1PersonalAllowance)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(fullPersonalAllowance)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-500">หัก สิทธิ์ลดหย่อนเพิ่มเติมอื่นๆ</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(h1OtherAllowances)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(fullOtherAllowances)}</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold border-t border-slate-300">
                        <td className="py-2.5 px-3 text-slate-900 font-extrabold">เงินได้สุทธิประเมิน</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-600 text-sm">{h1ExpenseReady ? formatCurrency(h1NetIncome) : 'ยังไม่คำนวณ'}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-violet-700 text-sm">{fullExpenseReady ? formatCurrency(fullNetIncome) : 'ยังไม่คำนวณ'}</td>
                      </tr>
                      <tr className="text-slate-500">
                        <td className="py-2 px-3">อัตราภาษีสูงสุดที่ถึง</td>
                        <td className="py-2 px-3 text-right font-mono">{h1ExpenseReady ? `${h1MaxRate}%` : '—'}</td>
                        <td className="py-2 px-3 text-right font-mono">{fullExpenseReady ? `${fullMaxRate}%` : '—'}</td>
                      </tr>
                      <tr className="border-t-2 border-slate-400">
                        <td className="py-2 px-3 text-slate-700">ภาษีประเมินที่ยืนยันจากแบบ/ผู้เชี่ยวชาญ</td>
                        <td className="py-2 px-3 text-right font-mono">{formattedTaxResult(h1Settlement, 'assessedTax')}</td>
                        <td className="py-2 px-3 text-right font-mono">{formattedTaxResult(fullSettlement, 'assessedTax')}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-500">หัก รวมเครดิตภาษี</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">{h1Settlement ? `-${formatCurrency(h1Settlement.totalCredits)}` : 'ยังไม่คำนวณ'}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">{fullSettlement ? `-${formatCurrency(fullSettlement.totalCredits)}` : 'ยังไม่คำนวณ'}</td>
                      </tr>
                      <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                        <td className="py-3 px-3 text-emerald-400">คาดว่าต้องชำระเพิ่ม</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400 text-base">{formattedTaxResult(h1Settlement, 'due')}</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400 text-base">{formattedTaxResult(fullSettlement, 'due')}</td>
                      </tr>
                      <tr className="bg-emerald-50 font-bold">
                        <td className="py-2 px-3 text-emerald-800">คาดว่าชำระไว้เกิน</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-800">{formattedTaxResult(h1Settlement, 'overpayment')}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-800">{formattedTaxResult(fullSettlement, 'overpayment')}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[10px] text-slate-500 leading-relaxed">
                  <p className="font-bold text-slate-800 text-xs mb-1">หมายเหตุประกอบการรายงาน:</p>
                  1. รายงานนับรายได้ก่อนหัก ณ ที่จ่ายตามวันรับเงินจริง และหักเครดิตภาษีที่บันทึกไว้<br />
                  2. รายจ่ายในบัญชีเป็นเพียงข้อมูลอ้างอิง ค่าใช้จ่ายหักได้ต้องกรอกเป็นยอดที่ตรวจสอบแล้ว<br />
                  3. ตัวอย่างอัตราก้าวหน้าไม่รวมภาษีขั้นต่ำทางเลือก ยอดชำระ/ชำระไว้เกินจะแสดงเมื่อกรอกภาษีประเมินจากแบบปัจจุบันหรือผู้เชี่ยวชาญเท่านั้น<br />
                  4. เอกสารนี้มีไว้วางแผนและตรวจสอบก่อนยื่น ไม่แทนแบบหรือคำแนะนำของกรมสรรพากร
                </div>

                <div className="flex justify-end gap-2.5 print:hidden pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setIsShowingPrintModal(false)}
                    className="px-5 py-2.5 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    ปิดหน้าต่าง
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>พิมพ์รายงานสรุป / บันทึก PDF</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-tax-report-modal, #printable-tax-report-modal * {
            visibility: visible;
          }
          /* The modal's backdrop is position:fixed with overflow-y-auto, which browsers
             routinely fail to print (renders blank or clipped) — force it into normal
             document flow so the printable card underneath actually paints on the page. */
          #tax-report-print-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: none !important;
            backdrop-filter: none !important;
            height: auto !important;
          }
          #printable-tax-report-modal {
            position: static !important;
            width: 100%;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

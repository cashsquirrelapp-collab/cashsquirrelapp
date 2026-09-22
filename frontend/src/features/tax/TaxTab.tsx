import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Job, AppSettings, Expense } from '../../../../shared/types';
import { formatCurrency } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import {
  Calculator,
  FileText,
  Trash2,
  Plus,
  X,
  Download,
  Info,
  Calendar,
  AlertTriangle,
  CheckSquare,
  Square,
  RefreshCw,
  HelpCircle,
  FileCheck,
  Printer,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Briefcase,
  FileSpreadsheet
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';

interface TaxTabProps {
  jobs: Job[];
  expenses?: Expense[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

interface AllowanceItem {
  id: string;
  key: 'life_insurance' | 'health_insurance' | 'rmf' | 'thai_esg' | 'social_security' | 'child' | 'parent';
  label: string;
  value: number;
  quantity?: number;
}

export default function TaxTab({
  jobs,
  expenses = [],
  settings,
  onUpdateSettings,
  triggerAlert,
  triggerConfirm
}: TaxTabProps) {
  const [taxYear, setTaxYear] = useState<number>(new Date().getFullYear());

  const [firstHalfJobsRevenue, setFirstHalfJobsRevenue] = useState<number>(0);
  const [firstHalfOtherRevenue, setFirstHalfOtherRevenue] = useState<number>(0);

  const [secondHalfJobsRevenue, setSecondHalfJobsRevenue] = useState<number>(0);
  const [secondHalfOtherRevenue, setSecondHalfOtherRevenue] = useState<number>(0);

  const [deductionMethod, setDeductionMethod] = useState<'เหมา' | 'ตามจริง'>('เหมา');
  const [firstHalfActualExpense, setFirstHalfActualExpense] = useState<number>(0);
  const [secondHalfActualExpense, setSecondHalfActualExpense] = useState<number>(0);

  const [addedAllowances, setAddedAllowances] = useState<AllowanceItem[]>([]);
  const [selectedAllowanceKey, setSelectedAllowanceKey] = useState<string>('');

  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    wht50: false,
    incomeSummary: false,
    actualReceipts: false,
    allowanceDocs: false,
    idCard: false,
    bankStatement: false
  });

  const [isShowingPrintModal, setIsShowingPrintModal] = useState(false);

  const allowanceOptions = [
    { key: 'life_insurance', label: 'ประกันชีวิต (ลดหย่อนได้ไม่เกิน 100,000 บาท)', cap: 100000, type: 'input' },
    { key: 'health_insurance', label: 'ประกันสุขภาพ (ลดหย่อนได้ไม่เกิน 25,000 บาท)', cap: 25000, type: 'input' },
    { key: 'rmf', label: 'กองทุน RMF (ไม่เกิน 30% ของเงินได้ สูงสุด 500,000 บาท)', cap: 500000, type: 'input' },
    { key: 'thai_esg', label: 'กองทุน ThaiESG (ไม่เกิน 30% ของเงินได้ สูงสุด 300,000 บาท)', cap: 300000, type: 'input' },
    { key: 'social_security', label: 'ประกันสังคม (ไม่เกิน 9,000 บาทต่อปี)', cap: 9000, type: 'input' },
    { key: 'child', label: 'ค่าเลี้ยงดูบุตร (30,000 บาทต่อคน)', cap: Infinity, type: 'quantity', multiplier: 30000 },
    { key: 'parent', label: 'ค่าเลี้ยงดูบิดามารดา (30,000 บาทต่อคน)', cap: Infinity, type: 'quantity', multiplier: 30000 }
  ];

  const systemJobsForYear = useMemo(() => {
    return jobs.filter(j => {
      const d = j.payDate || j.postDate || j.startDate;
      if (!d) return false;
      return new Date(d).getFullYear() === taxYear;
    });
  }, [jobs, taxYear]);

  const handleAutoSync = (silent = false) => {
    let firstHalfJobsSum = 0;
    let secondHalfJobsSum = 0;

    systemJobsForYear.forEach(j => {
      const dateStr = j.payDate || j.postDate || j.startDate;
      if (!dateStr) return;
      const date = new Date(dateStr);
      const month = date.getMonth();
      const isFirstHalf = month >= 0 && month <= 5;

      const value = j.received || j.value || 0;

      if (isFirstHalf) {
        firstHalfJobsSum += value;
      } else {
        secondHalfJobsSum += value;
      }
    });

    setFirstHalfJobsRevenue(firstHalfJobsSum);
    setSecondHalfJobsRevenue(secondHalfJobsSum);

    let firstHalfExpSum = 0;
    let secondHalfExpSum = 0;

    if (expenses && expenses.length > 0) {
      expenses.forEach(e => {
        if (!e.date) return;
        const date = new Date(e.date);
        if (date.getFullYear() === taxYear) {
          const month = date.getMonth();
          const isFirstHalf = month >= 0 && month <= 5;
          if (isFirstHalf) {
            firstHalfExpSum += e.amount || 0;
          } else {
            secondHalfExpSum += e.amount || 0;
          }
        }
      });
    }

    setFirstHalfActualExpense(firstHalfExpSum);
    setSecondHalfActualExpense(secondHalfExpSum);

    if (!silent) {
      triggerAlert(
        'ซิงค์ข้อมูลสำเร็จ',
        `ระบบทำการดึงข้อมูลรายรับและรายจ่ายปี ${taxYear} เฉพาะที่คุณบันทึกจริงเสร็จสิ้น ดึงยอดงานดีลครึ่งปีแรกได้ ${firstHalfJobsSum.toLocaleString()} บาท และครึ่งปีหลังได้ ${secondHalfJobsSum.toLocaleString()} บาท พร้อมทั้งดึงยอดรายจ่ายตามจริงเรียบร้อยแล้ว`
      );
    }
  };

  // Auto-pull real job/expense data whenever the tax year changes (including first load),
  // so the summary report is never blank — the manual sync button above still lets the user
  // re-pull after editing the numbers by hand without it being silently overwritten mid-session.
  useEffect(() => {
    handleAutoSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxYear]);

  const handleAddAllowance = () => {
    if (!selectedAllowanceKey) return;
    
    if (addedAllowances.some(item => item.key === selectedAllowanceKey)) {
      triggerAlert('รายการซ้ำ', 'คุณได้เพิ่มหัวข้อค่าลดหย่อนนี้ไปแล้ว สามารถแก้ไขจำนวนเงินหรือจำนวนสิทธิ์ในรายการด้านล่างได้ทันที');
      return;
    }

    const opt = allowanceOptions.find(o => o.key === selectedAllowanceKey);
    if (!opt) return;

    const newItem: AllowanceItem = {
      id: crypto.randomUUID(),
      key: opt.key as any,
      label: opt.label.split(' (')[0],
      value: 0,
      quantity: opt.type === 'quantity' ? 1 : undefined
    };

    setAddedAllowances([...addedAllowances, newItem]);
    setSelectedAllowanceKey('');
  };

  const handleUpdateAllowanceValue = (id: string, val: number) => {
    setAddedAllowances(
      addedAllowances.map(item => (item.id === id ? { ...item, value: val } : item))
    );
  };

  const handleUpdateAllowanceQuantity = (id: string, qty: number) => {
    setAddedAllowances(
      addedAllowances.map(item => (item.id === id ? { ...item, quantity: Math.max(1, qty) } : item))
    );
  };

  const handleRemoveAllowance = (id: string) => {
    setAddedAllowances(addedAllowances.filter(item => item.id !== id));
  };

  const toggleChecklistItem = (key: string) => {
    setChecklist({
      ...checklist,
      [key]: !checklist[key]
    });
  };

  const h1Revenue = useMemo(() => {
    return firstHalfJobsRevenue + firstHalfOtherRevenue;
  }, [firstHalfJobsRevenue, firstHalfOtherRevenue]);

  const h1Expense = useMemo(() => {
    if (deductionMethod === 'เหมา') {
      let exp = 0;
      if (h1Revenue <= 300000) {
        exp = h1Revenue * 0.6;
      } else {
        exp = (300000 * 0.6) + ((h1Revenue - 300000) * 0.4);
      }
      return Math.min(exp, 600000);
    } else {
      return firstHalfActualExpense;
    }
  }, [deductionMethod, h1Revenue, firstHalfActualExpense]);

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

  const fullExpense = useMemo(() => {
    if (deductionMethod === 'เหมา') {
      let exp = 0;
      if (fullRevenue <= 300000) {
        exp = fullRevenue * 0.6;
      } else {
        exp = (300000 * 0.6) + ((fullRevenue - 300000) * 0.4);
      }
      return Math.min(exp, 600000);
    } else {
      return firstHalfActualExpense + secondHalfActualExpense;
    }
  }, [deductionMethod, fullRevenue, firstHalfActualExpense, secondHalfActualExpense]);

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

  const h1MaxRate = useMemo(() => {
    if (h1TaxDetails.breakdown.length === 0) return 0;
    return h1TaxDetails.breakdown[h1TaxDetails.breakdown.length - 1].rate * 100;
  }, [h1TaxDetails]);

  const fullMaxRate = useMemo(() => {
    if (fullTaxDetails.breakdown.length === 0) return 0;
    return fullTaxDetails.breakdown[fullTaxDetails.breakdown.length - 1].rate * 100;
  }, [fullTaxDetails]);

  const isH1FilingRequired = h1Revenue > 60000;
  const isFullFilingRequired = fullRevenue > 60000;

  const handleDownloadCSV = () => {
    const csvRows = [
      ['\uFEFFสรุปการประเมินและวางแผนภาษี', 'ครึ่งปีแรก (ภ.ง.ด. 94)', 'ทั้งปี (ภ.ง.ด. 90)'],
      ['ปีภาษี', taxYear, taxYear],
      ['รายได้ดีลงานในระบบ', firstHalfJobsRevenue, firstHalfJobsRevenue + secondHalfJobsRevenue],
      ['รายได้เสริมอื่นๆ', firstHalfOtherRevenue, firstHalfOtherRevenue + secondHalfOtherRevenue],
      ['รายได้รวมทั้งหมด', h1Revenue, fullRevenue],
      ['วิธีหักค่าใช้จ่าย', deductionMethod, deductionMethod],
      ['หักค่าใช้จ่ายตามเกณฑ์', h1Expense, fullExpense],
      ['หักลดหย่อนส่วนตัว', h1PersonalAllowance, fullPersonalAllowance],
      ['หักลดหย่อนเพิ่มเติมอื่นๆ', h1OtherAllowances, fullOtherAllowances],
      ['เงินได้สุทธิ', h1NetIncome, fullNetIncome],
      ['อัตราภาษีสูงสุดที่เสีย (%)', `${h1MaxRate}%`, `${fullMaxRate}%`],
      ['ประมาณการภาษีที่ต้องชำระ', h1TaxDetails.totalTax, fullTaxDetails.totalTax]
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
    const bracketRows = (label: string, breakdown: { range: string; taxable: number; rate: number; tax: number }[]) => [
      [`ขั้นบันไดภาษี — ${label}`, '', '', ''],
      ['ช่วงเงินได้สุทธิ (บาท)', 'ฐานภาษีในช่วงนี้ (บาท)', 'อัตราภาษี (%)', 'ภาษีในช่วงนี้ (บาท)'],
      ...breakdown.map((b) => [b.range, b.taxable, `${b.rate * 100}%`, b.tax]),
      ['', '', '', '']
    ];

    const summaryRows: (string | number)[][] = [
      ['สรุปการประเมินและวางแผนภาษี', 'ครึ่งปีแรก (ภ.ง.ด. 94)', 'ทั้งปี (ภ.ง.ด. 90)'],
      ['ปีภาษี', taxYear, taxYear],
      ['รายได้ดีลงานในระบบ', firstHalfJobsRevenue, firstHalfJobsRevenue + secondHalfJobsRevenue],
      ['รายได้เสริมอื่นๆ', firstHalfOtherRevenue, firstHalfOtherRevenue + secondHalfOtherRevenue],
      ['รายได้รวมทั้งหมด', h1Revenue, fullRevenue],
      ['วิธีหักค่าใช้จ่าย', deductionMethod, deductionMethod],
      ['หักค่าใช้จ่ายตามเกณฑ์', h1Expense, fullExpense],
      ['หักลดหย่อนส่วนตัว', h1PersonalAllowance, fullPersonalAllowance],
      ['หักลดหย่อนเพิ่มเติมอื่นๆ', h1OtherAllowances, fullOtherAllowances],
      ['เงินได้สุทธิ', h1NetIncome, fullNetIncome],
      ['อัตราภาษีสูงสุดที่เสีย (%)', `${h1MaxRate}%`, `${fullMaxRate}%`],
      ['ประมาณการภาษีที่ต้องชำระ', h1TaxDetails.totalTax, fullTaxDetails.totalTax],
      ['', '', ''],
      ...bracketRows('ครึ่งปีแรก (ภ.ง.ด. 94)', h1TaxDetails.breakdown),
      ...bracketRows('ทั้งปี (ภ.ง.ด. 90)', fullTaxDetails.breakdown)
    ];

    const incomeHeaders = [
      'ชื่อโปรเจกต์',
      'ประเภทงาน',
      'ลูกค้า',
      'มูลค่ารวม (บาท)',
      'หัก ณ ที่จ่าย (%)',
      'จำนวนภาษีหัก ณ ที่จ่าย (บาท)',
      'ยอดได้รับแล้ว (บาท)',
      'ยอดค้างชำระ (บาท)',
      'สถานะโครงการ',
      'เครดิตเทอม (วัน)',
      'วันเริ่มงาน',
      'วันดีล/วันเผยแพร่',
      'กำหนดชำระเงิน',
      'หมายเหตุ'
    ];
    const incomeRows = jobs.map((j) => {
      let statusText = j.status;
      if (j.status === 'done') statusText = 'จ่ายแล้ว';
      else if (j.status === 'partial') statusText = 'มัดจำ/จ่ายบางส่วน';
      else if (j.status === 'pending') statusText = 'ยังไม่จ่าย';
      return [
        j.name,
        j.type || 'ทั่วไป',
        j.client || '-',
        j.value || 0,
        j.whtRate || 0,
        j.whtAmount || 0,
        j.received || 0,
        j.pending || 0,
        statusText,
        j.creditTerm || 0,
        j.startDate || '-',
        j.postDate || '-',
        j.payDate || '-',
        j.note || ''
      ];
    });

    const expenseHeaders = ['ชื่อรายการ', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'วันที่', 'หมายเหตุ'];
    const expenseRows = expenses.map((e) => [e.name, e.category, e.amount || 0, e.date || '-', e.note || '']);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'สรุปภาษี');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]), 'รายรับ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]), 'รายจ่าย');

    XLSX.writeFile(wb, `บัญชีภาษี_${taxYear}_กระรอกตุนเงิน.xlsx`);
    triggerAlert('ดาวน์โหลด Excel สำเร็จ', 'ไฟล์บัญชีพร้อมยื่นภาษี (สรุปภาษี, รายรับ, รายจ่าย) ถูกดาวน์โหลดเรียบร้อยแล้ว ส่งให้นักบัญชีได้เลยครับ');
  };

  return (
    <div className="page-content space-y-6" id="tax-assistant-container">
      
      {/* HEADER SECTION */}
      <div className="bg-brand-white p-6 rounded-3xl border border-brand-border/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-60 h-60 bg-emerald-600/5 dark:bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 relative z-10 font-sans">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-md">
                ระบบคำนวณและประเมินภาษีอัตโนมัติ
              </span>
            </div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-display font-black tracking-tight text-brand-text flex items-center gap-2 leading-snug">
              <Mascot mood="wave" size={38} animated={true} className="shrink-0" />
              <span className="min-w-0">ผู้ช่วยจัดการภาษีบุคคลธรรมดา</span>
            </h2>
            <p className="text-xs text-brand-muted mt-1 max-w-2xl leading-relaxed">
              คำนวณเปรียบเทียบภาษีครึ่งปีแรก (ภ.ง.ด. 94) และภาษีสิ้นปี (ภ.ง.ด. 90) จากข้อมูลงานดีลและค่าใช้จ่ายจริงของคุณ เพื่อวางแผนอย่างเป็นระบบและแม่นยำ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
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
              className="flex items-center gap-1.5 px-4 py-2.5 bg-brand-white dark:bg-neutral-900 border border-brand-border/60 hover:bg-brand-faint dark:hover:bg-neutral-800 dark:border-neutral-800 rounded-2xl text-xs font-extrabold text-brand-text dark:text-neutral-200 transition-all cursor-pointer select-none active:scale-95 shadow-sm"
            >
              <Printer className="w-4 h-4 text-brand-muted" />
              <span>พิมพ์รายงานสรุป</span>
            </button>

            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer select-none active:scale-95 shadow-md shadow-emerald-950/20"
            >
              <Download className="w-4 h-4" />
              <span>ดาวน์โหลด CSV</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer select-none active:scale-95 shadow-md shadow-orange-950/20"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดาวน์โหลด Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* TOP INCOME SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border/40 shadow-sm rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-brand-border transition-all">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-lg pointer-events-none" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/10">ครึ่งปีแรก (ม.ค. - มิ.ย.)</span>
            <p className="text-2xl font-mono font-black text-brand-text dark:text-white mt-2.5">{formatCurrency(h1Revenue)}</p>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-brand-muted">
            <span>รวมรายรับ 6 เดือนแรก</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">ภ.ง.ด. 94</span>
          </div>
        </div>

        <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border/40 shadow-sm rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-brand-border transition-all">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-lg pointer-events-none" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/10">ครึ่งปีหลัง (ก.ค. - ธ.ค.)</span>
            <p className="text-2xl font-mono font-black text-brand-text dark:text-white mt-2.5">{formatCurrency(h2Revenue)}</p>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-brand-muted">
            <span>รวมรายรับ 6 เดือนหลัง</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">สะสมสิ้นปี</span>
          </div>
        </div>

        <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border/40 shadow-sm rounded-3xl p-5 flex flex-col justify-between relative overflow-hidden group hover:border-brand-border transition-all">
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-lg pointer-events-none" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/15">รายได้รวมทั้งปี (12 เดือน)</span>
            <p className="text-2xl sm:text-3xl font-mono font-black text-brand-text dark:text-white mt-2">{formatCurrency(fullRevenue)}</p>
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-brand-muted">
            <span>รายรับรวมประเมินภาษีประจำปี</span>
            <span className="font-black text-purple-600 dark:text-purple-400">ภ.ง.ด. 90</span>
          </div>
        </div>
      </div>

      {/* TAX FORM STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-5 rounded-3xl border ${isH1FilingRequired ? 'bg-brand-yellow-bg/30 border-brand-yellow-acc/20 text-brand-yellow-acc' : 'bg-brand-white dark:bg-neutral-900 border-brand-border/40 text-brand-text'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-extrabold text-brand-text dark:text-white flex items-center gap-1.5">
                <FileCheck className={`w-4 h-4 ${isH1FilingRequired ? 'text-brand-yellow-acc' : 'text-brand-muted'}`} />
                แบบภาษีครึ่งปีแรก (ภ.ง.ด. 94)
              </h4>
              <p className="text-[11px] text-brand-muted mt-1 leading-relaxed">
                ยื่นช่วง ก.ค. - ก.ย. ของปีภาษีปัจจุบัน โดยประเมินฐานรายได้รอบครึ่งปีแรกเพื่อสะสมสิทธิ์และชำระล่วงหน้าบางส่วน
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Mascot mood={isH1FilingRequired ? "alert" : "happy"} size={32} />
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shrink-0 ${isH1FilingRequired ? 'bg-brand-yellow-bg border-brand-yellow-acc/20 text-brand-yellow-acc' : 'bg-brand-green-bg border-brand-green-acc/20 text-brand-green-acc'}`}>
                {isH1FilingRequired ? 'ต้องยื่นแบบภาษี' : 'ยังไม่ต้องยื่น'}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-brand-border/20 flex items-center justify-between text-[11px]">
            <span className="text-brand-muted font-semibold">เกณฑ์ยื่นแบบ: รายได้สะสม ครึ่งปีแรกมากกว่า 60,000 บาท</span>
            <span className={`font-bold ${isH1FilingRequired ? 'text-brand-yellow-acc' : 'text-brand-green-acc'}`}>
              {isH1FilingRequired ? 'แนะนำให้ยื่นภายในกำหนด' : 'รายได้ไม่ถึงเกณฑ์ยื่น'}
            </span>
          </div>
        </div>

        <div className={`p-5 rounded-3xl border ${isFullFilingRequired ? 'bg-brand-yellow-bg/30 border-brand-yellow-acc/20 text-brand-yellow-acc' : 'bg-brand-white dark:bg-neutral-900 border-brand-border/40 text-brand-text'} flex flex-col justify-between shadow-sm`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h4 className="text-sm font-extrabold text-brand-text dark:text-white flex items-center gap-1.5">
                <FileCheck className={`w-4 h-4 ${isFullFilingRequired ? 'text-brand-yellow-acc' : 'text-brand-muted'}`} />
                แบบภาษีเงินได้สิ้นปี (ภ.ง.ด. 90)
              </h4>
              <p className="text-[11px] text-brand-muted mt-1 leading-relaxed">
                ยื่นช่วง ม.ค. - มี.ค. ของปีถัดไป เป็นการนำรายได้สะสมทั้งปีมาหักลดหย่อนเพื่อประมวลผลการคำนวณชำระสุทธิ
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Mascot mood={isFullFilingRequired ? "alert" : "happy"} size={32} />
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border shrink-0 ${isFullFilingRequired ? 'bg-brand-yellow-bg border-brand-yellow-acc/20 text-brand-yellow-acc' : 'bg-brand-green-bg border-brand-green-acc/20 text-brand-green-acc'}`}>
                {isFullFilingRequired ? 'ต้องยื่นแบบภาษี' : 'ยังไม่ต้องยื่น'}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-brand-border/20 flex items-center justify-between text-[11px]">
            <span className="text-brand-muted font-semibold">เกณฑ์ยื่นแบบ: รายได้รวมทั้งปีมากกว่า 60,000 บาท</span>
            <span className={`font-bold ${isFullFilingRequired ? 'text-brand-yellow-acc' : 'text-brand-green-acc'}`}>
              {isFullFilingRequired ? 'แนะนำให้ยื่นภายในกำหนด' : 'รายได้ไม่ถึงเกณฑ์ยื่น'}
            </span>
          </div>
        </div>
      </div>

      {/* INTERACTIVE WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: TAX PARAMETER SETTINGS */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h3 className="font-display font-black text-sm text-brand-text dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-4 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
                ส่วนตั้งค่าข้อมูลภาษีและการประเมินรายรับ
              </h3>
              
              <button
                onClick={() => handleAutoSync()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-faint dark:bg-neutral-800 hover:bg-brand-border/40 dark:hover:bg-neutral-700 border border-brand-border/40 dark:border-neutral-800 rounded-xl text-xs font-black text-emerald-600 dark:text-emerald-400 transition-all select-none cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ดึงข้อมูลรายรับรายจ่ายในระบบ</span>
              </button>
            </div>

            <p className="text-[11px] text-brand-muted mb-4 leading-relaxed">
              * ข้อมูลจะถูกดึงและรวบรวมเฉพาะจากรายการงานดีลและค่าใช้จ่ายจริงที่คุณได้ระบุหรือบันทึกไว้ในแอปพลิเคชันนี้เท่านั้น ไม่มีการสร้างข้อมูลสมมติขึ้นเอง
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
                        onChange={(raw) => setFirstHalfJobsRevenue(Math.max(0, Number(raw)))}
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
                        onChange={(raw) => setFirstHalfOtherRevenue(Math.max(0, Number(raw)))}
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
                        onChange={(raw) => setSecondHalfJobsRevenue(Math.max(0, Number(raw)))}
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
                        onChange={(raw) => setSecondHalfOtherRevenue(Math.max(0, Number(raw)))}
                        className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Expense Deduction Method */}
            <div className="space-y-3.5 mb-6">
              <div>
                <label className="block text-xs font-extrabold text-brand-text dark:text-white mb-2">วิธีการหักค่าใช้จ่าย</label>
                <div className="grid grid-cols-2 gap-2 bg-brand-faint dark:bg-neutral-850 p-1.5 rounded-2xl border border-brand-border/40 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setDeductionMethod('เหมา')}
                    className={`py-2 text-xs font-extrabold rounded-xl transition-all select-none cursor-pointer ${deductionMethod === 'เหมา' ? 'bg-emerald-600 text-white shadow-sm' : 'text-brand-muted hover:text-brand-text'}`}
                  >
                    หักค่าใช้จ่ายแบบเหมา (60%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeductionMethod('ตามจริง')}
                    className={`py-2 text-xs font-extrabold rounded-xl transition-all select-none cursor-pointer ${deductionMethod === 'ตามจริง' ? 'bg-emerald-600 text-white shadow-sm' : 'text-brand-muted hover:text-brand-text'}`}
                  >
                    หักตามจริง (จากบัญชีรายจ่าย)
                  </button>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {deductionMethod === 'เหมา' ? (
                  <motion.div
                    key="standard-exp"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3.5 bg-brand-green-bg border border-brand-green-acc/20 rounded-2xl text-[11px] text-brand-green-acc flex items-start gap-2.5 leading-relaxed"
                  >
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>สูตรหักแบบเหมา:</strong> หัก 60% ของรายได้สูงสุดไม่เกิน 300,000 บาทแรก และบวก 40% ของส่วนเกิน โดยมีเพดานสิทธิ์หักรวมสูงสุดไม่เกิน 600,000 บาท ตามเกณฑ์กลุ่มอาชีพฟรีแลนซ์ทั่วไป
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="custom-exp"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="space-y-3 bg-brand-faint/30 dark:bg-neutral-800/30 p-4 rounded-2xl border border-brand-border/20 dark:border-neutral-800/40"
                  >
                    <p className="text-[11px] text-brand-muted leading-relaxed flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-brand-yellow-acc shrink-0 mt-0.5" />
                      กรณีหักค่าใช้จ่ายตามจริง คุณจำเป็นต้องจัดเตรียมใบเสร็จรับเงินหรือหลักฐานที่ถูกต้องตามกฎหมายเพื่อใช้เป็นหลักฐานแสดงต่อกรมสรรพากรหากมีการเรียกตรวจสอบภายหลัง
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-brand-muted mb-1">ค่าใช้จ่ายจริง ครึ่งปีแรก (ม.ค. - มิ.ย.)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                          <NumberInput
                            value={firstHalfActualExpense || ''}
                            placeholder="ซิงค์จากระบบหรือกรอกเอง"
                            onChange={(raw) => setFirstHalfActualExpense(Math.max(0, Number(raw)))}
                            className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-brand-muted mb-1">ค่าใช้จ่ายจริง ครึ่งปีหลัง (ก.ค. - ธ.ค.)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-xs font-bold text-brand-muted">฿</span>
                          <NumberInput
                            value={secondHalfActualExpense || ''}
                            placeholder="ซิงค์จากระบบหรือกรอกเอง"
                            onChange={(raw) => setSecondHalfActualExpense(Math.max(0, Number(raw)))}
                            className="w-full bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 focus:border-emerald-500 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-brand-text dark:text-white placeholder-brand-muted focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Dynamic Allowances Section */}
            <div className="pt-5 border-t border-brand-border/20">
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
                    <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-faint/30 dark:bg-neutral-800/30 border border-brand-border/20 dark:border-neutral-800/40 p-3 rounded-2xl">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                          <span className="text-xs font-black text-brand-text dark:text-white">{item.label}</span>
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
                              onChange={(raw) => handleUpdateAllowanceValue(item.id, Math.max(0, Number(raw)))}
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
                              onChange={(e) => handleUpdateAllowanceQuantity(item.id, Number(e.target.value))}
                              className="w-10 bg-transparent text-center text-xs font-mono font-bold text-brand-text dark:text-white focus:outline-none"
                            />
                            <span className="text-[10px] font-bold text-brand-muted">คน</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveAllowance(item.id)}
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
          </div>
        </div>

        {/* RIGHT COLUMN: TAX CALCULATION COMPARISON */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="bg-brand-white border border-brand-border/40 rounded-3xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
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
                    <td className="py-2 px-3 font-semibold text-brand-muted">หัก ค่าใช้จ่ายสะสม</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-pink-acc">-{formatCurrency(h1Expense)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-pink-acc">-{formatCurrency(fullExpense)}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10 bg-brand-faint/20 dark:bg-neutral-800/20 font-bold">
                    <td className="py-2 px-3 text-brand-text dark:text-neutral-100">เงินได้หลังหักใช้จ่าย</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(Math.max(0, h1Revenue - h1Expense))}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(Math.max(0, fullRevenue - fullExpense))}</td>
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
                    <td className="py-3 px-3 text-right font-mono text-brand-blue-acc dark:text-brand-blue-acc text-sm">{formatCurrency(h1NetIncome)}</td>
                    <td className="py-3 px-3 text-right font-mono text-purple-600 dark:text-purple-400 text-sm">{formatCurrency(fullNetIncome)}</td>
                  </tr>
                  <tr className="hover:bg-brand-faint/10 text-brand-muted">
                    <td className="py-2 px-3">อัตราภาษีสูงสุด (%)</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-200">{h1MaxRate}%</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-brand-text dark:text-neutral-200">{fullMaxRate}%</td>
                  </tr>
                  <tr className="bg-brand-faint/50 dark:bg-neutral-850 font-extrabold border-t-2 border-brand-border dark:border-neutral-800">
                    <td className="py-3.5 px-3 text-emerald-600 dark:text-emerald-400 text-xs">ภาษีประเมินสุทธิ</td>
                    <td className="py-3.5 px-3 text-right font-mono text-brand-text dark:text-white text-base">
                      {h1TaxDetails.totalTax > 0 ? (
                        <span className="text-brand-yellow-acc">{formatCurrency(h1TaxDetails.totalTax)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">฿0.00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-brand-text dark:text-white text-base">
                      {fullTaxDetails.totalTax > 0 ? (
                        <span className="text-brand-yellow-acc">{formatCurrency(fullTaxDetails.totalTax)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">฿0.00</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Progressive brackets display */}
            <div className="mt-5 space-y-2 bg-brand-faint/30 dark:bg-neutral-850 p-4 rounded-2xl border border-brand-border/20 dark:border-neutral-800/40">
              <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-brand-muted">รายละเอียดอัตราภาษีขั้นบันไดแบบสะสม (ทั้งปี)</h4>
              <div className="space-y-1.5 mt-2.5">
                {fullTaxDetails.breakdown.map((b, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-brand-muted font-semibold">{b.range}</span>
                    <span className="text-brand-text dark:text-neutral-200 font-bold">
                      {formatCurrency(b.taxable)} x {b.rate * 100}% = <span className="text-brand-yellow-acc font-black">{formatCurrency(b.tax)}</span>
                    </span>
                  </div>
                ))}
                {fullTaxDetails.breakdown.length === 0 && (
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 py-1">
                    <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>เงินได้สุทธิอยู่ในเกณฑ์ยกเว้นภาษีทั้งหมด</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* DOCUMENTS TO PREPARE CARD */}
          <div className="bg-brand-white border border-brand-border/40 rounded-3xl p-5 sm:p-6 shadow-sm">
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
        </div>
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
                    <p className="text-slate-500 mt-0.5">ประเภทการหักค่าใช้จ่าย: {deductionMethod === 'เหมา' ? 'หักแบบเหมา 60% ตามสิทธิมาตรฐาน' : 'หักตามความจำเป็นจริง'}</p>
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-1">วันที่ออกเอกสาร</h3>
                    <p className="font-mono text-slate-800 font-semibold">{new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <p className="text-slate-500 mt-0.5">สถานะ: วางแผนเสร็จเรียบร้อย</p>
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
                        <td className="py-2 px-3 text-slate-500">หัก ค่าใช้จ่ายสิทธิ์กฎหมาย ({deductionMethod === 'เหมา' ? 'เหมา 60%' : 'ตามจริง'})</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(h1Expense)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-600">-{formatCurrency(fullExpense)}</td>
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
                        <td className="py-2.5 px-3 text-right font-mono text-blue-600 text-sm">{formatCurrency(h1NetIncome)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-violet-700 text-sm">{formatCurrency(fullNetIncome)}</td>
                      </tr>
                      <tr className="text-slate-500">
                        <td className="py-2 px-3">อัตราภาษีสูงสุดที่ถึง</td>
                        <td className="py-2 px-3 text-right font-mono">{h1MaxRate}%</td>
                        <td className="py-2 px-3 text-right font-mono">{fullMaxRate}%</td>
                      </tr>
                      <tr className="bg-slate-900 text-white font-extrabold border-t-2 border-slate-900">
                        <td className="py-3 px-3 text-emerald-400">ประมาณการยอดภาษีที่ต้องชำระ</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400 text-base">{formatCurrency(h1TaxDetails.totalTax)}</td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-400 text-base">{formatCurrency(fullTaxDetails.totalTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-[10px] text-slate-500 leading-relaxed">
                  <p className="font-bold text-slate-800 text-xs mb-1">หมายเหตุประกอบการรายงาน:</p>
                  1. การวิเคราะห์นี้อิงฐานอัตราการคำนวณขั้นบันไดบุคคลธรรมดาของประเทศไทย และกลุ่มประเภทสิทธิหักเหมาอาชีพอิสระ/งานฟรีแลนซ์ทั่วไปในระบบ<br />
                  2. รายงานเล่มนี้จัดทำขึ้นและแสดงผลโดยเจตนาเพื่ออำนวยความสะดวกในการจัดหมวดหมู่และวางแผนเท่านั้น ไม่รับรองความถูกต้องสมบูรณ์แทนเอกสารของกรมสรรพากร
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

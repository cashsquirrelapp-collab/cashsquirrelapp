import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Job, Goal, AppSettings, Expense, StatusOption } from '../../../../shared/types';
import { formatCurrency, getMonthKey, formatMonthKey, exportJobsToCSV } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { 
  Calendar, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  ArrowUpRight, 
  FileText, 
  AlertCircle,
  PiggyBank,
  ChevronRight,
  RefreshCw,
  Wallet,
  Briefcase,
  HelpCircle,
  Eye,
  ArrowRight,
  Download,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import { fireMascot } from '../../mascotBus';
import { Mascot } from '../../components/mascot/Mascot';
import { IconCheck, IconArrowUp, IconArrowRight } from '../../components/ui/icons';
import { getJobPaymentEntries, getJobPendingEntries, getMonthKeyFromDate, getReceivedForMonth, getPendingForMonth } from '../../../../shared/installmentPayments';

interface SummaryTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  onEditJob: (id: string, updated: Partial<Job>) => void;
  onSwitchTab: (tabId: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  triggerPrompt: (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void,
    onCancel?: () => void
  ) => void;
  expenses: Expense[];
  onImportData: (dataStr: string) => void;
  onExportData: () => void;
  onClearAllData: () => void;
  statuses?: StatusOption[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

export default function SummaryTab({
  jobs,
  goals,
  settings,
  onEditJob,
  onSwitchTab,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  expenses = [],
  onImportData,
  onExportData,
  onClearAllData,
  statuses = [],
  selectedMonth,
  onSelectMonth,
}: SummaryTabProps) {
  const currentMonthKey = useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);
  const [quickReceivedInput, setQuickReceivedInput] = useState<{ [id: string]: string }>({});
  const [showDangerZone, setShowDangerZone] = useState(false);

  // Drag and drop / JSON file uploader state
  const [dragActive, setDragActive] = useState(false);

  const handleExportCSV = () => {
    if (!exportJobsToCSV(jobs)) {
      triggerAlert('ไม่พบข้อมูล', 'คุณยังไม่มีข้อมูลโปรเจกต์งานที่จะส่งออกครับ ลองเพิ่มโปรเจกต์งานก่อนนะครับ');
      return;
    }

    triggerAlert(
      'ส่งออกไฟล์สำเร็จ!',
      'ระบบดาวน์โหลดไฟล์ .csv ของงานดีลทั้งหมดเรียบร้อยแล้ว เปิดด้วย Excel หรือ Google Sheets ได้ทันที เผื่อนำไปทำเอกสารบัญชี/รายงานต่อได้เลยครับ'
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImportData(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImportData(event.target.result as string);
        }
      };
      reader.readAsText(file);
    }
  };

  // Get a comprehensive list of month keys (last 12 months + next 6 months + any month with jobs)
  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    
    // Generate last 12 months and next 6 months relative to current date
    const today = new Date();
    for (let i = -12; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      keys.add(`${y}-${m}`);
    }
    
    // Also add any other months from existing jobs
    jobs.forEach(j => {
      const dateKey = j.payDate || j.postDate;
      if (dateKey) {
        keys.add(getMonthKey(dateKey));
      }
      getJobPaymentEntries(j).forEach((entry) => entry.date && keys.add(getMonthKeyFromDate(entry.date)));
      getJobPendingEntries(j).forEach((entry) => entry.dueDate && keys.add(getMonthKeyFromDate(entry.dueDate)));
    });
    
    return Array.from(keys).sort().reverse(); // Newest first
  }, [jobs, currentMonthKey]);

  // Filter jobs for selected month
  const monthJobs = useMemo(() => {
    return jobs.filter(j => getMonthKey(j.payDate || j.postDate) === selectedMonth || getReceivedForMonth(j, selectedMonth) > 0 || getPendingForMonth(j, selectedMonth) > 0);
  }, [jobs, selectedMonth]);

  // Calculations for selected month
  const metrics = useMemo(() => {
    // Trust the recorded `received` field as-is -- never assume a "done" job's full value was
    // received when that field is still 0/unset, since that shows phantom income the user never
    // actually got and disagrees with the Timeline tab, which only counts received > 0.
    const totalReceived = monthJobs.reduce((sum, j) => sum + getReceivedForMonth(j, selectedMonth), 0);

    // Trust the recorded `pending` field as-is, same reasoning as totalReceived above -- a
    // properly-saved "done" job already has pending forced to 0, so gating on isPaid here was
    // redundant and hid money for any job whose paid flag and pending amount had drifted apart.
    const totalPending = monthJobs.reduce((sum, j) => sum + getPendingForMonth(j, selectedMonth), 0);

    const totalContractVal = monthJobs.reduce((sum, j) => {
      const isPaid = j.status === 'done' || 
                     j.paymentStatus === 'paid' || 
                     statuses.find(s => s.id === j.status)?.behavior === 'done';
      // Total value is received + pending to ensure exact alignment
      return sum + (isPaid ? (j.received || j.value) : j.value);
    }, 0);

    const totalWht = monthJobs.reduce((sum, j) => sum + (j.whtAmount || 0), 0);
    
    // Filter expenses for selected month
    const monthExpenses = expenses.filter(e => getMonthKey(e.date) === selectedMonth);
    const totalVariableExpense = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Money moved into savings goals this month via the deposit modal's "deduct from cash"
    // option. Tracked on the goal transaction itself, never as a fake Expense -- a savings
    // transfer isn't a real expense, so it must stay out of totalVariableExpense/monthExpenses
    // (both shown to the user as "รายจ่ายผันแปร") while still counting against cash-on-hand.
    const goalDeductionsThisMonth = goals.reduce((sum, g) => {
      const monthly = (g.history || [])
        .filter(tx => tx.type === 'deposit' && tx.deductedFromCash && getMonthKey(tx.date) === selectedMonth)
        .reduce((s, tx) => s + tx.amount, 0);
      return sum + monthly;
    }, 0);

    // Fixed Expense
    const fixedExpense = settings.monthlyExpense;

    // Net cash flow received (subtract fixed expenses, variable expenses, and cash-funded goal deposits)
    const netCashReceived = totalReceived - fixedExpense - totalVariableExpense - goalDeductionsThisMonth;
    
    // Suggest allocated to savings target based on goals allocation percentages
    const totalAllocatedPct = goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
    const effectiveSavingsPct = totalAllocatedPct > 0 ? totalAllocatedPct : (settings.savingsPercentage || 40);
    const targetSavings = Math.round(totalReceived * (effectiveSavingsPct / 100));
    
    // Money left for personal/spending inside wallet
    const finalDisposableCash = netCashReceived;

    // Filter jobs with pending payments
    const pendingJobs = monthJobs.filter(j => {
      const isPaid = j.status === 'done' || 
                     j.paymentStatus === 'paid' || 
                     statuses.find(s => s.id === j.status)?.behavior === 'done';
      return !isPaid && j.pending > 0 && j.isPosted !== false;
    });

    return {
      totalContractVal,
      totalReceived,
      totalPending,
      totalWht,
      fixedExpense,
      totalVariableExpense,
      goalDeductionsThisMonth,
      monthExpenses,
      netCashReceived,
      targetSavings,
      finalDisposableCash,
      pendingJobs,
      jobCount: monthJobs.length,
      paidJobCount: monthJobs.filter(j => {
        const isPaid = j.status === 'done' || 
                       j.paymentStatus === 'paid' || 
                       statuses.find(s => s.id === j.status)?.behavior === 'done';
        return isPaid || j.pending === 0;
      }).length,
    };
  }, [monthJobs, settings, expenses, selectedMonth, statuses, goals]);

  // Generate summaries for all available months to display in the beautiful archive
  const monthlySummaries = useMemo(() => {
    return availableMonths
      .map(monthKey => {
        const monthJobs = jobs.filter(j => getMonthKey(j.payDate || j.postDate) === monthKey || getReceivedForMonth(j, monthKey) > 0 || getPendingForMonth(j, monthKey) > 0);
        
        const mReceived = monthJobs.reduce((sum, j) => sum + getReceivedForMonth(j, monthKey), 0);

        const mPending = monthJobs.reduce((sum, j) => sum + getPendingForMonth(j, monthKey), 0);

        const mContract = monthJobs.reduce((sum, j) => {
          const isPaid = j.status === 'done' || 
                         j.paymentStatus === 'paid' || 
                         statuses.find(s => s.id === j.status)?.behavior === 'done';
          return sum + (isPaid ? (j.received || j.value) : j.value);
        }, 0);

        const mWht = monthJobs.reduce((sum, j) => sum + (j.whtAmount || 0), 0);
        
        // Sum up variable expenses for this month
        const mExpenses = expenses.filter(e => getMonthKey(e.date) === monthKey);
        const mVarExpense = mExpenses.reduce((sum, e) => sum + e.amount, 0);

        const mProfit = mReceived - settings.monthlyExpense - mVarExpense;
        const isCurrent = monthKey === currentMonthKey;
        const isSelected = selectedMonth === monthKey;
        
        return {
          monthKey,
          totalContractVal: mContract,
          totalReceived: mReceived,
          totalPending: mPending,
          totalWht: mWht,
          totalVarExpense: mVarExpense,
          profit: mProfit,
          isCurrent,
          isSelected,
          jobCount: monthJobs.length,
        };
      })
      .filter(summary => summary.isCurrent || summary.isSelected || summary.jobCount > 0);
  }, [jobs, availableMonths, settings.monthlyExpense, currentMonthKey, selectedMonth, expenses]);

  const handleCollectPending = (job: Job) => {
    if (job.installments?.length) {
      alert('งานนี้แบ่งชำระเป็นงวด กรุณากด “รับเงินงวดถัดไป” ที่การ์ดงานเพื่อบันทึกงวดและวันที่รับเงินจริง');
      return;
    }
    triggerConfirm(
      'รับเงินส่วนที่เหลือสำเร็จ',
      `คุณต้องการบันทึกว่าได้รับเงินค้างชำระทั้งหมดจำนวน ${formatCurrency(job.pending)} จากงาน "${job.name}" แล้วใช่ไหม?`,
      () => {
        onEditJob(job.id, {
          received: job.value,
          pending: 0,
          status: 'done'
        });
        fireMascot({
          mood: 'celebrate',
          message: `ทวงเงินสำเร็จแล้วค้าบ! ได้เสบียงเพิ่มขึ้นอีก ${formatCurrency(job.pending)} รวมเรียบร้อย!`
        });
      }
    );
  };

  const handleUpdatePartial = (job: Job, amount: number) => {
    if (job.installments?.length) {
      alert('งานนี้แบ่งชำระเป็นงวด กรุณาบันทึกจากรายการงวดเพื่อให้ยอดและรายงานตรงกัน');
      return;
    }
    if (amount <= 0 || amount > job.pending) {
      triggerAlert('จำนวนเงินไม่ถูกต้อง', 'ยอดเงินที่บันทึกต้องมากกว่า 0 และไม่เกินจำนวนยอดที่ยังค้างจ่ายอยู่');
      return;
    }
    const nextReceived = job.received + amount;
    const nextPending = job.value - nextReceived;
    const nextStatus = nextPending <= 0 ? 'done' : 'partial';

    onEditJob(job.id, {
      received: nextReceived,
      pending: Math.max(0, nextPending),
      status: nextStatus
    });

    fireMascot({
      mood: 'celebrate',
      message: `บันทึกรับเงินเรียบร้อยแล้วค้าบ! ได้สะสมลูกนัทเพิ่ม ${formatCurrency(amount)} แล้ว!`
    });
    setQuickReceivedInput(prev => ({ ...prev, [job.id]: '' }));
  };

  return (
    <div className="page-content space-y-6">
      {/* 1. Header Bar with dynamic month switch */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-md">
            FINANCIAL REPORT
          </span>
          <h2 className="text-2xl font-black font-display text-brand-text dark:text-white mt-2 tracking-tight flex items-center gap-2">
            <Mascot mood="happy" size={32} className="shrink-0" />
            สรุปยอดรายรับ & เงินคงเหลือ
          </h2>
          <p className="text-xs text-brand-muted dark:text-neutral-400 mt-0.5">
            สรุปกระแสเงินสดรายรับ ค่าใช้จ่ายคงที่ และเงินหมุนเวียนสุทธิแยกรายเดือน
          </p>
        </div>

        {/* Month Selector dropdown */}
        <div className="flex items-center gap-2 bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 p-2 rounded-2xl shadow-2xs self-start md:self-auto min-w-[220px]">
          <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 ml-1.5" />
          <select
            value={selectedMonth}
            onChange={(e) => onSelectMonth(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none text-xs font-black text-brand-text dark:text-neutral-100 pr-3 cursor-pointer"
          >
            {availableMonths.map(month => (
              <option key={month} value={month} className="dark:bg-neutral-900 dark:text-white">
                {formatMonthKey(month)} {month === currentMonthKey ? ' (เดือนนี้)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1.5 Backup & Export banner */}
      <div className="bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-black text-brand-text dark:text-white">สำรองข้อมูล & Export ไป Excel</h4>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-0.5 leading-relaxed">
              สำรองข้อมูลทั้งหมดเป็นไฟล์ .json หรือดาวน์โหลดงานดีลเป็น .csv เปิดได้ทันทีทั้ง Excel และ Google Sheets เผื่อนำไปทำเอกสารบัญชีหรือรายงานต่อ
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
          <button
            onClick={onExportData}
            className="w-full sm:w-auto px-4 py-2.5 bg-white dark:bg-neutral-900 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-500/20 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> สำรองข้อมูล (.json)
          </button>
          <button
            onClick={handleExportCSV}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export เป็น Excel (.csv)
          </button>
        </div>
      </div>

      {/* 2. Interactive Bento Card Grid layout (Highly responsive for iPad/MacBook columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Metric 1: Total Received vs Contract */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between h-[175px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-wider text-brand-muted dark:text-neutral-400 uppercase">
              ยอดรายรับที่ได้จริงแล้ว
            </span>
            <span className="text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full">
              เงินเข้ากระเป๋าจริง
            </span>
          </div>

          <div className="my-auto">
            <h3 className="text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(metrics.totalReceived)}
            </h3>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-1.5 flex items-center gap-1.5">
              <span>จากมูลค่างานรวมตกลงไว้ {formatCurrency(metrics.totalContractVal)}</span>
            </p>
          </div>

          <div className="w-full bg-brand-faint dark:bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${metrics.totalContractVal > 0 ? (metrics.totalReceived / metrics.totalContractVal) * 100 : 0}%` }}
            />
          </div>
        </motion.div>

        {/* Metric 2: Outstanding Balance / Pending */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between h-[175px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-wider text-brand-muted dark:text-neutral-400 uppercase">
              ยอดคงเหลือค้างรับ
            </span>
            <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${metrics.totalPending > 0 ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
              {metrics.totalPending > 0 ? 'เหลือต้องตามเก็บ' : 'รับครบหมดแล้ว!'}
            </span>
          </div>

          <div className="my-auto">
            <h3 className={`text-2xl font-extrabold font-mono tracking-tight ${metrics.totalPending > 0 ? 'text-amber-600 dark:text-yellow-400' : 'text-brand-text dark:text-neutral-300'}`}>
              {formatCurrency(metrics.totalPending)}
            </h3>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-1.5">
              {metrics.totalPending > 0 ? `ค้างอยู่จากทั้งหมด ${metrics.pendingJobs.length} งานดีล` : 'ไม่มีงานดีลใดติดค้างรายรับในเดือนนี้'}
            </p>
          </div>

          <div className="w-full bg-brand-faint dark:bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${metrics.totalContractVal > 0 ? (metrics.totalPending / metrics.totalContractVal) * 100 : 0}%` }}
            />
          </div>
        </motion.div>

        {/* Metric 3: Variable Expenses (Newly added separate box as requested!) */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between h-[175px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-wider text-brand-muted dark:text-neutral-400 uppercase">
              รายจ่ายแปรผันเดือนนี้
            </span>
            <span className="text-[10px] font-extrabold bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 px-2.5 py-1 rounded-full">
              แปรผันตามจริง
            </span>
          </div>

          <div className="my-auto">
            <h3 className="text-2xl font-extrabold font-mono text-orange-600 dark:text-orange-400 tracking-tight">
              {formatCurrency(metrics.totalVariableExpense)}
            </h3>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-1.5">
              จากบันทึกรายจ่ายผันแปร {metrics.monthExpenses.length} รายการ
            </p>
          </div>

          <div className="w-full bg-brand-faint dark:bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-orange-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${(metrics.fixedExpense + metrics.totalVariableExpense) > 0 ? (metrics.totalVariableExpense / (metrics.fixedExpense + metrics.totalVariableExpense)) * 100 : 0}%` }}
            />
          </div>
        </motion.div>

        {/* Metric 4: Accumulated Withholding Tax (WHT) */}
        <motion.div 
          whileHover={{ y: -3 }}
          className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-5 shadow-2xs relative overflow-hidden flex flex-col justify-between h-[175px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black tracking-wider text-brand-muted dark:text-neutral-400 uppercase">
              ภาษีหัก ณ ที่จ่ายสะสม
            </span>
            <span className="text-[10px] font-extrabold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full">
              ขอคืนเครดิตภาษีได้
            </span>
          </div>

          <div className="my-auto">
            <h3 className="text-2xl font-extrabold font-mono text-amber-600 dark:text-amber-400 tracking-tight">
              {formatCurrency(metrics.totalWht)}
            </h3>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-1.5">
              ยอดสะสมนำมาใช้คำนวณภาษีประจำปีได้
            </p>
          </div>

          <div className="w-full bg-brand-faint dark:bg-neutral-800/80 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-500" 
              style={{ width: `${metrics.totalContractVal > 0 ? (metrics.totalWht / metrics.totalContractVal) * 100 : 0}%` }}
            />
          </div>
        </motion.div>
      </div>

      {/* 3. Detailed Financial Receipt Breakdown (เหลือเท่าไหร่ กันอะไรไปบ้าง) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Flow Receipt - "สรุปกระแสเงินไหลออก" (8 columns on lg) */}
        <div className="lg:col-span-7 bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-2xs space-y-6">
          <div className="flex items-center justify-between border-b border-brand-border/40 pb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                รายละเอียดเงินออมและยอดคงเหลือประจำรอบเดือน
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-brand-muted dark:text-neutral-400">
              #{selectedMonth}-REP
            </span>
          </div>

          {/* Flow receipt visualization */}
          <div className="space-y-4">
            
            {/* Step 1: Received */}
            <div className="flex justify-between items-start">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-brand-text dark:text-neutral-200">1. ยอดรายรับที่โอนเข้ากระเป๋าจริง</span>
                </div>
                <p className="text-[10px] text-brand-muted dark:text-neutral-400 ml-3.5">
                  เงินส่วนที่ลูกค้าชำระมาแล้ว (เงินมัดจำ/เงินก้อนเต็ม)
                </p>
              </div>
              <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                +{formatCurrency(metrics.totalReceived)}
              </span>
            </div>

            {/* Step 2: Total Expenses (Combined in summary as per user feedback, but with separate fields below) */}
            <div className="flex justify-between items-start pl-2 border-l-2 border-rose-200 dark:border-rose-900/40 ml-1 py-1">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-xs font-bold text-brand-text dark:text-neutral-200">2. หัก รายจ่ายทั้งหมดในรอบเดือน (รวมคงที่และแปรผัน)</span>
                </div>
                <p className="text-[10px] text-brand-muted dark:text-neutral-400 ml-3.5">
                  รวมภาระค่าใช้จ่ายคงที่ประจำเดือน ค่าใช้จ่ายผันแปรเสริม และเงินที่ฝากเข้าเป้าหมายออม
                </p>
              </div>
              <span className="text-xs font-black font-mono text-rose-600 dark:text-rose-400">
                -{formatCurrency(metrics.fixedExpense + metrics.totalVariableExpense + metrics.goalDeductionsThisMonth)}
              </span>
            </div>

            {/* Sub-breakdown: Fixed and Variable expenses shown separately as requested! */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-4 pr-3 py-2.5 bg-neutral-50/70 dark:bg-neutral-800/40 rounded-2xl border border-brand-border/40 ml-4">
              {/* Fixed Portion */}
              <div className="space-y-0.5 border-r border-brand-border/30 pr-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-muted dark:text-neutral-400 uppercase tracking-wider">
                    รายจ่ายคงที่
                  </span>
                  <span className="text-xs font-bold font-mono text-neutral-600 dark:text-neutral-300">
                    -{formatCurrency(metrics.fixedExpense)}
                  </span>
                </div>
                <p className="text-[9px] text-brand-muted dark:text-neutral-500">
                  ค่าห้อง ค่าน้ำไฟ และค่าประกันประจำรอบเดือน
                </p>
              </div>

              {/* Variable Portion (Always shown as a separate channel/field!) */}
              <div className="space-y-0.5 pl-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                    รายจ่ายแปรผัน
                  </span>
                  <span className="text-xs font-black font-mono text-orange-600 dark:text-orange-400">
                    -{formatCurrency(metrics.totalVariableExpense)}
                  </span>
                </div>
                <p className="text-[9px] text-brand-muted dark:text-neutral-500">
                  ค่าอุปกรณ์, ค่าโฆษณา, ค่าเดินทาง ({metrics.monthExpenses.length} รายการ)
                </p>
              </div>

              {/* Goal deposits deducted from cash-on-hand -- kept separate from "รายจ่ายผันแปร"
                  since a savings transfer isn't a real expense, only shown when it applies. */}
              {metrics.goalDeductionsThisMonth > 0 && (
                <div className="space-y-0.5 sm:col-span-2 pt-2 border-t border-brand-border/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                      เงินฝากเข้าเป้าหมายออม
                    </span>
                    <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">
                      -{formatCurrency(metrics.goalDeductionsThisMonth)}
                    </span>
                  </div>
                  <p className="text-[9px] text-brand-muted dark:text-neutral-500">
                    เงินที่ดึงเข้าเป้าหมายออมโดยหักจากยอดรายรับ (ไม่ใช่รายจ่าย แค่ย้ายไปเก็บ)
                  </p>
                </div>
              )}
            </div>

            <div className="h-px bg-brand-border/40 dark:bg-neutral-800 my-2" />

            {/* Final Outcome: Spending Cash in hand */}
            <div className="flex justify-between items-center bg-blue-50/50 dark:bg-blue-500/10 p-4 rounded-2xl border border-blue-100/20">
              <div className="space-y-0.5">
                <span className="text-xs font-black text-blue-900 dark:text-blue-300 block">
                  คงเหลือเงินสดสุทธิ (กำไรสะสมพร้อมใช้จ่ายหรือออมอิสระ)
                </span>
                <span className="text-[10px] text-blue-700 dark:text-blue-400 block">
                  นี่คือเงินสดส่วนเกินที่แท้จริงหลังจากหักรายจ่ายคงที่และรายจ่ายผันแปรทั้งหมดแล้ว!
                </span>
              </div>
              <span className={`text-base font-black font-mono ${metrics.netCashReceived >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'} shrink-0`}>
                {formatCurrency(metrics.netCashReceived)}
              </span>
            </div>

          </div>

          <div className="pt-2">
            <button
              onClick={() => onSwitchTab('split')}
              className="w-full py-3 bg-brand-faint hover:bg-brand-border/40 text-brand-text dark:bg-neutral-800 dark:text-neutral-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> ไปห้องแบ่งเงินออมเข้าสู่กระเป๋าเป้าหมาย <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Goal/Settings Progress Bar & Quick Stats (5 columns on lg) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Monthly Revenue Target meter */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-5 shadow-2xs space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black tracking-wider text-brand-muted dark:text-neutral-400 uppercase">
                เป้าหมายรายรับออมรายเดือน
              </span>
              <span className="text-[10px] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold px-2 py-0.5 rounded-md">
                Settings
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted dark:text-neutral-400">เป้าออมรายรับ:</span>
                <span className="font-extrabold text-brand-text dark:text-white">{formatCurrency(settings.monthlyRevenueGoal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted dark:text-neutral-400">รายรับจริงขณะนี้:</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(metrics.totalReceived)}</span>
              </div>
            </div>

            {/* Circular or linear progress meter */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[10px] font-bold text-brand-muted">
                <span>อัตราความสำเร็จ</span>
                <span>{Math.round(metrics.totalReceived >= settings.monthlyRevenueGoal ? 100 : (metrics.totalReceived / settings.monthlyRevenueGoal) * 100 || 0)}%</span>
              </div>
              <div className="w-full bg-brand-faint dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ${
                    metrics.totalReceived >= settings.monthlyRevenueGoal 
                      ? 'bg-emerald-500' 
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, (metrics.totalReceived / settings.monthlyRevenueGoal) * 100 || 0)}%` }}
                />
              </div>
              {metrics.totalReceived >= settings.monthlyRevenueGoal ? (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 pt-1">
                  ผ่านเกณฑ์เป้าหมายรายรับแล้ว ยอดเยี่ยมมาก!
                </p>
              ) : (
                <p className="text-[10px] text-brand-muted dark:text-neutral-400 pt-1">
                  ยังขาดอีก {formatCurrency(Math.max(0, settings.monthlyRevenueGoal - metrics.totalReceived))} เพื่อบรรลุเป้าหมาย
                </p>
              )}
            </div>
          </div>

          {/* Quick tips card */}
          <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100/20 dark:border-emerald-500/10 rounded-3xl p-5 space-y-3">
            <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
              ข้อเสนอแนะทางการเงิน
            </h4>
            <p className="text-xs text-brand-muted dark:text-neutral-400 leading-relaxed">
              {metrics.totalPending > 0 ? (
                `คุณมียอดเงินค้างรับจากลูกค้าอีก ${formatCurrency(metrics.totalPending)} ซึ่งหากตามมาเก็บเพิ่มได้ ยอดเงินสดสำหรับกินใช้ของคุณจะพุ่งสูงถึง ${formatCurrency(metrics.finalDisposableCash + metrics.totalPending)}! แนะนำให้ทยอยตรวจสอบงานที่ส่งมอบแล้วเพื่อขอวางบิล`
              ) : (
                `ยินดีด้วย! เดือนนี้ไม่มีงานดีลใดค้างรับเลย คุณเก็บเงินเสร็จสิ้น 100% แล้ว ช่วยให้กระแสเงินสดของคุณนิ่งและหมุนเวียนได้ดีเยี่ยม`
              )}
            </p>
          </div>
        </div>

      </div>

      {/* 4. "ค้างรับจากงานดีล" - Lists the jobs that still have pending amounts to receive */}
      <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-brand-border/40 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-amber-500" />
            <div>
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                งานดีลที่ค้างชำระ & ติดตามยอด ({metrics.pendingJobs.length} งาน)
              </h3>
              <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-0.5">
                ยอดที่เหลือที่ลูกค้าต้องจ่าย เพื่อเติมเต็มเงินสดเข้ากระเป๋าของคุณ
              </p>
            </div>
          </div>

          <span className="text-[10px] font-black text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 px-2.5 py-1 rounded-md">
            ค้างรวม {formatCurrency(metrics.totalPending)}
          </span>
        </div>

        {metrics.pendingJobs.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h4 className="text-xs font-extrabold text-brand-text dark:text-neutral-200">ไม่มีดีลงานค้างชำระแล้ว!</h4>
            <p className="text-[10px] text-brand-muted dark:text-neutral-400">
              ทุกงานดีลของรอบเดือน {formatMonthKey(selectedMonth)} ชำระเงินมัดจำ/ยอดเต็มครบถ้วนเรียบร้อยแล้ว
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border/30 dark:divide-neutral-800 space-y-3">
            {metrics.pendingJobs.map(j => {
              const inputVal = quickReceivedInput[j.id] || '';
              return (
                <div key={j.id} className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-brand-text dark:text-white">{j.name}</span>
                      <span className="text-[9px] bg-brand-faint dark:bg-neutral-800 text-brand-muted px-2 py-0.5 rounded-md font-bold">
                        {j.client}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-brand-muted dark:text-neutral-400">
                      <span>มูลค่าดีล: <strong className="text-brand-text dark:text-neutral-300 font-mono">{formatCurrency(j.value)}</strong></span>
                      <span>รับมาแล้ว: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(j.received)}</strong></span>
                      <span>ค้างจ่ายอยู่: <strong className="text-rose-600 font-mono">{formatCurrency(j.pending)}</strong></span>
                    </div>
                  </div>

                  {/* Dynamic payment updates */}
                  <div className="flex flex-wrap items-center gap-2">
                    {j.installments?.length ? (
                      <span className="px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                        แบ่งชำระ {j.installments.length} งวด • บันทึกรับเงินจากการ์ดงาน
                      </span>
                    ) : <>
                    {/* Fast payment collection input */}
                    <div className="flex items-center gap-1">
                      <NumberInput
                        placeholder="ระบุส่วนมัดจำเพิ่ม..."
                        value={inputVal}
                        onChange={(raw) => setQuickReceivedInput(prev => ({ ...prev, [j.id]: raw }))}
                        className="w-[120px] bg-brand-faint dark:bg-neutral-800/60 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2 py-1.5 text-[10px] font-semibold outline-none"
                      />
                      <button
                        onClick={() => handleUpdatePartial(j, parseFloat(inputVal) || 0)}
                        className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                      >
                        บันทึกยอด
                      </button>
                    </div>

                    <button
                      onClick={() => handleCollectPending(j)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" /> รับเงินครบแล้ว
                    </button>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Monthly Archives & Reports Summary (Moved from Dashboard for clean-up) */}
      <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-brand-border/40 pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                ประวัติสรุปยอดรายรับรายเดือนย้อนหลัง
              </h3>
              <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-0.5">
                เลือกช่วงรอบเดือนเพื่อตรวจสอบงบดุล รายรับจริง และสถิติความก้าวหน้า
              </p>
            </div>
          </div>
          <span className="text-[10px] text-brand-muted font-bold">
            ({monthlySummaries.length} เดือนที่มีบันทึก)
          </span>
        </div>

        <div className="space-y-3">
          {monthlySummaries.map(summary => {
            const isSelected = selectedMonth === summary.monthKey;
            const isShortfall = summary.totalReceived < settings.monthlyExpense;
            const metGoal = summary.totalReceived >= settings.monthlyRevenueGoal;
            
            return (
              <motion.div
                key={summary.monthKey}
                whileHover={{ y: -2 }}
                onClick={() => {
                  onSelectMonth(summary.monthKey);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`border rounded-[var(--radius-lg)] p-4 transition-all cursor-pointer relative overflow-hidden ${
                  isSelected 
                    ? 'border-emerald-500 dark:border-emerald-500 shadow-md ring-1 ring-emerald-500/20 bg-emerald-50/5 dark:bg-emerald-500/5' 
                    : 'border-brand-border dark:border-stone-800 hover:border-brand-border/80 dark:hover:border-stone-700 shadow-2xs'
                }`}
              >
                {summary.isCurrent && (
                  <div className="absolute top-0 right-0 bg-emerald-600 text-white font-black text-[8px] uppercase tracking-wider px-2 py-1 rounded-bl-lg">
                    เดือนปัจจุบัน
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-brand-text dark:text-white">
                        {formatMonthKey(summary.monthKey)}
                      </span>
                      <span className="text-[10px] bg-brand-faint dark:bg-neutral-800 text-brand-muted dark:text-neutral-400 px-1.5 py-0.5 rounded-md font-bold">
                        {summary.jobCount} งานดีล
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {isShortfall ? (
                        <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-55/10 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-100/15">
                          ยังไม่พอค่าใช้จ่ายคงที่
                        </span>
                      ) : (
                        <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-55/10 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-100/15">
                          ผ่านค่าใช้จ่ายคงที่ (+{formatCurrency(summary.profit)})
                        </span>
                      )}

                      {metGoal && (
                        <span className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-55/10 dark:bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-100/15">
                          ผ่านเป้าหมายรายได้ยอดออม!
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-right bg-brand-faint/40 dark:bg-stone-950/30 p-2.5 rounded-xl border border-brand-border/20 dark:border-stone-800/50 min-w-[280px]">
                    <div>
                      <span className="text-[9px] text-brand-muted dark:text-neutral-400 block uppercase tracking-wider font-semibold">มูลค่างานรวม</span>
                      <span className="text-xs font-bold font-mono text-brand-text dark:text-neutral-200">{formatCurrency(summary.totalContractVal)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-brand-muted dark:text-neutral-400 block uppercase tracking-wider font-semibold">รับแล้วจริง</span>
                      <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.totalReceived)}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-brand-muted dark:text-neutral-400 block uppercase tracking-wider font-semibold">ค้างรับ</span>
                      <span className="text-xs font-bold font-mono text-amber-600">{formatCurrency(summary.totalPending)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-between items-center text-[10px] font-bold text-brand-muted dark:text-neutral-400 pt-2 border-t border-brand-border/30 dark:border-stone-800/40">
                  <span className="inline-flex items-center gap-1">
                    {isSelected ? <IconCheck className="w-2.5 h-2.5" /> : <IconArrowUp className="w-2.5 h-2.5" />}
                    {isSelected ? 'กำลังเลือกแสดงรายละเอียดรายงานของเดือนนี้ด้านบน' : 'คลิกเพื่อดึงยอดและดูสรุปโดยละเอียดของรอบเดือนนี้'}
                  </span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-extrabold flex items-center gap-0.5">
                    {isSelected ? 'เลือกอยู่' : <>สลับข้อมูลเดือนนี้ <IconArrowRight className="w-2.5 h-2.5" /></>}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

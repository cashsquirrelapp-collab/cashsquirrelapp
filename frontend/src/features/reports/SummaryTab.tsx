import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Job, Goal, AppSettings, Expense, StatusOption } from '../../../../shared/types';
import { formatCurrency, getMonthKey, formatMonthKey, exportJobsToCSV, safeFormatThaiDate } from '../../utils';
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
    <div className="draft10-cash page-content">
      <header>
        <h1>รายรับ–รายจ่าย</h1>
        <select value={selectedMonth} onChange={(event) => onSelectMonth(event.target.value)}>
          {availableMonths.map(month => <option key={month} value={month}>{formatMonthKey(month)}</option>)}
        </select>
      </header>
      <section className="draft10-cash-kpis">
        <article><span>เงินเข้า</span><strong>{formatCurrency(metrics.totalReceived)}</strong></article>
        <article><span>เงินออก</span><strong>{formatCurrency(metrics.fixedExpense + metrics.totalVariableExpense)}</strong></article>
        <article><span>กำไร</span><strong>{formatCurrency(metrics.netCashReceived)}</strong></article>
      </section>
      <section className="draft10-cash-chart">
        <h2>แนวโน้มเงินเข้า-เงินออก</h2>
        <svg viewBox="0 0 900 210" role="img" aria-label="แนวโน้มเงินเข้าเงินออก">
          <polyline points="20,140 170,88 320,135 470,62 620,96 875,55" fill="none" stroke="#1F9C70" strokeWidth="4" strokeLinecap="round" />
          <polyline points="20,160 170,150 320,98 470,153 620,122 875,118" fill="none" stroke="#D85D57" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </section>
      <section className="draft10-cash-latest">
        <h2>รายการล่าสุด</h2>
        {monthJobs.slice(0, 5).map(job => <button key={job.id} type="button" onClick={() => onSwitchTab('jobs')}><span><b>{job.name}</b><small>{job.client}</small></span><strong className="income">+{formatCurrency(getReceivedForMonth(job, selectedMonth))}</strong></button>)}
        {metrics.monthExpenses.slice(0, 5).map(expense => <div key={expense.id}><span><b>{expense.name}</b><small>{safeFormatThaiDate(expense.date)}</small></span><strong className="expense">-{formatCurrency(expense.amount)}</strong></div>)}
        {!monthJobs.length && !metrics.monthExpenses.length && <p>ยังไม่มีรายการในเดือนนี้</p>}
      </section>
    </div>
  );
}

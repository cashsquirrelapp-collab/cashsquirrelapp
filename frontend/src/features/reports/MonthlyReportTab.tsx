import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Job, Goal, AppSettings, NotifSettings } from '../../../../shared/types';
import { formatCurrency, getMonthKey, formatMonthKey, getRelativeDaysText } from '../../utils';
import { getJobPaymentEntries, getMonthKeyFromDate } from '../../../../shared/installmentPayments';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { 
  FileText, 
  Mail, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  PiggyBank,
  Send,
  ArrowRight, 
  ShieldCheck,
  Bell,
  Clock,
  Briefcase,
  Calculator,
  Upload,
  Trash2,
  Eye,
  Plus,
  X,
  FileCheck
} from 'lucide-react';
import { TaxEvidence, WhtDocument, Expense } from '../../../../shared/types';
import { Mascot } from '../../components/mascot/Mascot';
import { IconWarning, IconAlertDot, IconCalendar, IconCheck, IconBulb } from '../../components/ui/icons';

interface MonthlyReportTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  userEmail: string;
  notifSettings: NotifSettings;
  onUpdateNotifSettings: (notifSettings: NotifSettings) => void;
  onSwitchTab: (tabId: 'dashboard' | 'jobs' | 'summary' | 'timeline' | 'split' | 'report' | 'plans') => void;
  onViewJob?: (jobId: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  expenses?: Expense[];
}

export default function MonthlyReportTab({
  jobs,
  goals,
  settings,
  onUpdateSettings,
  userEmail,
  notifSettings,
  onUpdateNotifSettings,
  onSwitchTab,
  onViewJob,
  triggerAlert,
  triggerConfirm,
  expenses = []
}: MonthlyReportTabProps) {
  const [reportView, setReportView] = useState<'overview' | 'income' | 'clients' | 'credit'>('overview');
  const [isSendingSimulated, setIsSendingSimulated] = useState(false);
  const [simulationStep, setSimulationStep] = useState(0);

  const [localEmail, setLocalEmail] = useState(notifSettings.alertEmail || userEmail);
  const [localServiceType, setLocalServiceType] = useState(notifSettings.serviceType || 'mailto');
  const [localEnabled, setLocalEnabled] = useState(notifSettings.enabled ?? true);
  const [localServiceId, setLocalServiceId] = useState(notifSettings.emailjsServiceId || '');
  const [localTemplateId, setLocalTemplateId] = useState(notifSettings.emailjsTemplateId || '');
  const [localPublicKey, setLocalPublicKey] = useState(notifSettings.emailjsPublicKey || '');
  const [isSavedText, setIsSavedText] = useState(false);

  const totalAllocatedPct = useMemo(() => {
    return goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
  }, [goals]);
  const displaySavingsPercentage = totalAllocatedPct > 0 ? totalAllocatedPct : (settings.savingsPercentage || 40);



  const handleSaveNotifSettings = () => {
    onUpdateNotifSettings({
      ...notifSettings,
      enabled: localEnabled,
      dailyDigestEnabled: localEnabled,
      alertEmail: localEmail,
      serviceType: localServiceType as 'mailto' | 'emailjs',
      emailjsServiceId: localServiceId,
      emailjsTemplateId: localTemplateId,
      emailjsPublicKey: localPublicKey
    });
    setIsSavedText(true);
    setTimeout(() => {
      setIsSavedText(false);
    }, 3000);
    triggerAlert(
      'บันทึกข้อมูลตั้งค่าสำเร็จ!',
      'ระบบทำการบันทึกช่องทางจัดส่งแจ้งเตือนเข้าคลาวด์ Supabase เรียบร้อยแล้วครับ'
    );
  };

  const handleSendReminder = (reminderId: string) => {
    const q = notifSettings.pendingQueue || [];
    const rem = q.find(r => r.id === reminderId);
    if (!rem) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const recipient = notifSettings.alertEmail || userEmail;

    let bodyText = `เรียนติดตามและสอบถามความคืบหน้าการชำระเงินค่าบริการ:\n\n`;
    bodyText += `โปรเจกต์งาน: ${rem.jobName}\n`;
    bodyText += `ลูกค้า/เอเจนซี่: ${rem.client}\n`;
    bodyText += `ยอดคงค้างจ่าย: ${rem.pendingAmount.toLocaleString()} บาท\n`;
    bodyText += `กำหนดชำระเดิม: ${rem.dueDate || 'ไม่ระบุ'}\n\n`;
    bodyText += `ทางเราขอเรียนสอบถามความคืบหน้าของเอกสารและการโอนชำระยอดดังกล่าว หากโอนชำระเรียบร้อยแล้ว หรือต้องการให้ประสานงานเอกสารใบเสร็จ/ใบกำกับภาษีเพิ่มเติมประการใด สามารถแจ้งกลับได้ทันทีครับ\n\n`;
    bodyText += `ขอแสดงความนับถือ\n`;
    bodyText += `ส่งผ่านโปรแกรมติดตามเครดิตเทอม กระรอกตุนเงิน\n`;
    bodyText += `อีเมลผู้ใช้: ${userEmail}`;

    const subject = `[ติดตามสถานะการชำระเงิน] ชื่องาน: ${rem.jobName} - ลูกค้า: ${rem.client}`;

    if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsTemplateId && notifSettings.emailjsPublicKey) {
      // Send automatically via EmailJS
      fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: notifSettings.emailjsServiceId,
          template_id: notifSettings.emailjsTemplateId,
          user_id: notifSettings.emailjsPublicKey,
          template_params: {
            to_email: recipient,
            subject: subject,
            message: bodyText,
          }
        })
      })
      .then(res => {
        if (res.ok) {
          const updated = q.map(r => r.id === reminderId ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
          onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
          triggerAlert('ส่งอีเมลแจ้งเตือนสำเร็จ!', `ระบบส่งอีเมลตรวจสอบรายการค้างชำระไปที่ ${recipient} เรียบร้อยแล้ว`);
        } else {
          res.text().then(errText => {
            triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `EmailJS แจ้งข้อผิดพลาด: ${errText}\n\nระบบจะเปิดหน้าเมลเพื่อส่งแบบ manual แทนครับ`, () => {
              window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
              const updated = q.map(r => r.id === reminderId ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
              onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
            });
          });
        }
      })
      .catch(err => {
        triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `เชื่อมต่อ EmailJS ผิดพลาด: ${err.message}\n\nระบบจะเปิดหน้าเมลเพื่อให้คุณกดส่งเองแทนครับ`, () => {
          window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
          const updated = q.map(r => r.id === reminderId ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
          onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
        });
      });
    } else {
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      const updated = q.map(r => r.id === reminderId ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
      onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
      triggerAlert('ดำเนินการเปิดเมลสำเร็จ!', 'ระบบเปิดหน้าต่างเขียนอีเมลของคุณเพื่อทวงถามยอดดังกล่าวแล้ว และปรับสถานะในคิวเรียบร้อย');
    }
  };

  const handleSkipReminder = (reminderId: string) => {
    const q = notifSettings.pendingQueue || [];
    const todayStr = new Date().toISOString().split('T')[0];
    const updated = q.map(r => r.id === reminderId ? { ...r, status: 'skipped' as const, sentDate: todayStr } : r);
    onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
  };

  const handleSendAllPendingReminders = () => {
    const q = notifSettings.pendingQueue || [];
    const pending = q.filter(r => r.status === 'pending');
    if (pending.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const recipient = notifSettings.alertEmail || userEmail;

    let bodyText = `แจ้งเตือนรายการดีลงานค้างชำระทั้งหมดรวบยอดประจำวันนี้:\n`;
    bodyText += `-----------------------------------------\n`;
    pending.forEach((rem, idx) => {
      bodyText += `${idx + 1}. ชื่องาน: ${rem.jobName}\n`;
      bodyText += `   • เอเจนซี่/ลูกค้า: ${rem.client}\n`;
      bodyText += `   • วันกำหนดจ่ายเงิน: ${rem.dueDate || 'ไม่ระบุ'}\n`;
      bodyText += `   • ยอดคงค้างจ่าย: ${rem.pendingAmount.toLocaleString()} ฿\n`;
      bodyText += `-----------------------------------------\n`;
    });
    bodyText += `\nกรุณาดำเนินการโทรหรือทักไลน์/อีเมลเอเจนซี่ เพื่อติดตามยอดเงินและอัปเดตระบบแอปพลิเคชัน\n`;

    const subject = `[ด่วน - รวมดีลค้างชำระ] ตรวจพบยอดเงินยังไม่เข้าค้างชำระทั้งหมด (${pending.length} รายการ)`;

    if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsTemplateId && notifSettings.emailjsPublicKey) {
      // Send automatically via EmailJS
      fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: notifSettings.emailjsServiceId,
          template_id: notifSettings.emailjsTemplateId,
          user_id: notifSettings.emailjsPublicKey,
          template_params: {
            to_email: recipient,
            subject: subject,
            message: bodyText,
          }
        })
      })
      .then(res => {
        if (res.ok) {
          const updated = q.map(r => r.status === 'pending' ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
          onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
          triggerAlert('ส่งอีเมลแจ้งเตือนสำเร็จ!', `ส่งข้อมูลทวงถามค้างชำระทั้งหมดรวม ${pending.length} รายการไปที่ ${recipient} เรียบร้อยแล้ว`);
        } else {
          res.text().then(errText => {
            triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `EmailJS แจ้งข้อผิดพลาด: ${errText}\n\nระบบจะเปิดหน้าเมลรวมเพื่อส่งแบบ manual แทนครับ`, () => {
              window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
              const updated = q.map(r => r.status === 'pending' ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
              onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
            });
          });
        }
      })
      .catch(err => {
        triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `เชื่อมต่อ EmailJS ผิดพลาด: ${err.message}\n\nระบบจะเปิดหน้าเมลเพื่อให้คุณส่งเองแทนครับ`, () => {
          window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
          const updated = q.map(r => r.status === 'pending' ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
          onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
        });
      });
    } else {
      window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      const updated = q.map(r => r.status === 'pending' ? { ...r, status: 'sent' as const, sentDate: todayStr } : r);
      onUpdateNotifSettings({ ...notifSettings, pendingQueue: updated });
      triggerAlert('ดำเนินการเปิดเมลรวมสำเร็จ!', 'ระบบได้เปิดหน้าต่างเมลรวมรายการค้างจ่ายทั้งหมดยอดแล้ว');
    }
  };

  const handleClearQueueHistory = () => {
    triggerConfirm(
      'ยืนยันการล้างประวัติคิว?',
      'คุณแน่ใจหรือไม่ว่าต้องการลบประวัติและรายการในคิวทั้งหมด? (รายการดีลที่ค้างชำระจริงจะยังคงอยู่)',
      () => {
        onUpdateNotifSettings({ ...notifSettings, pendingQueue: [] });
      }
    );
  };

  // Extract all available years from jobs and expenses
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    yearsSet.add(new Date().getFullYear()); // Always include current year
    
    jobs.forEach(j => {
      if (j.postDate) {
        const y = new Date(j.postDate).getFullYear();
        if (!isNaN(y)) yearsSet.add(y);
      }
    });

    (expenses || []).forEach(e => {
      if (e.date) {
        const y = new Date(e.date).getFullYear();
        if (!isNaN(y)) yearsSet.add(y);
      }
    });

    return Array.from(yearsSet).sort((a, b) => b - a); // Newest year first
  }, [jobs, expenses]);

  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [includeFullYearFixed, setIncludeFullYearFixed] = useState(true);
  const [showYearlyBreakdownTable, setShowYearlyBreakdownTable] = useState(false);

  const whtPaymentEntries = useMemo(() => jobs.flatMap((job) => {
    const totalWht = Math.max(0, job.whtAmount || 0);
    if (totalWht <= 0) return [];

    if (job.installments?.length) {
      const netTotal = Math.max(1, job.value - totalWht);
      let allocatedBefore = 0;
      return job.installments.flatMap((row, index) => {
        const allocatedWht = index === job.installments!.length - 1
          ? Math.max(0, totalWht - allocatedBefore)
          : Math.round(totalWht * ((row.amount || 0) / netTotal));
        allocatedBefore += allocatedWht;
        if (row.status !== 'paid' || !row.paidAt || allocatedWht <= 0) return [];
        return [{
          id: `${job.id}-${row.id}`,
          jobId: job.id,
          jobName: job.name,
          client: job.client || '-',
          label: row.label || `งวดที่ ${index + 1}`,
          date: row.paidAt,
          amount: allocatedWht,
        }];
      });
    }

    const paidDate = job.payDate || job.postDate || job.startDate;
    if (!paidDate || job.received <= 0) return [];
    return [{
      id: `${job.id}-wht`,
      jobId: job.id,
      jobName: job.name,
      client: job.client || '-',
      label: 'รับเงินครั้งเดียว',
      date: paidDate,
      amount: totalWht,
    }];
  }), [jobs]);

  // Annual financial metrics calculation
  const annualMetrics = useMemo(() => {
    const yearStr = String(selectedYear);

    // Filter jobs for selected year accurately checking postDate or payDate year
    const yearJobs = jobs.filter(j => {
      if (j.postDate) {
        const y = new Date(j.postDate).getFullYear();
        if (y === selectedYear) return true;
      }
      if (j.payDate) {
        const y = new Date(j.payDate).getFullYear();
        if (y === selectedYear) return true;
      }
      return false;
    });
    
    // Total income: contract value and actual received
    const annualContractValue = yearJobs.reduce((sum, j) => sum + j.value, 0);
    const annualReceivedValue = jobs.flatMap(getJobPaymentEntries).reduce((sum, entry) => entry.date?.startsWith(yearStr) ? sum + entry.amount : sum, 0);
    const annualWhtAmount = whtPaymentEntries.reduce((sum, entry) => entry.date.startsWith(yearStr) ? sum + entry.amount : sum, 0);

    // Filter expenses for selected year
    const yearExpenses = (expenses || []).filter(e => {
      if (!e.date) return false;
      const y = new Date(e.date).getFullYear();
      return y === selectedYear;
    });
    const annualVariableExpenses = yearExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Count active months (months where user has either recorded a job or recorded an expense in this year)
    const activeMonths = new Set<string>();
    yearJobs.forEach(j => {
      if (j.postDate) activeMonths.add(j.postDate.substring(0, 7));
      if (j.payDate) activeMonths.add(j.payDate.substring(0, 7));
    });
    jobs.flatMap(getJobPaymentEntries).forEach((entry) => entry.date?.startsWith(yearStr) && activeMonths.add(getMonthKeyFromDate(entry.date)));
    yearExpenses.forEach(e => {
      if (e.date) activeMonths.add(e.date.substring(0, 7));
    });

    const activeMonthsCount = activeMonths.size;

    // Annual fixed expense:
    // If includeFullYearFixed is true, calculate full 12 months (12 * monthlyExpense).
    // Otherwise calculate based on active months (activeMonthsCount * monthlyExpense).
    const annualFixedExpenses = includeFullYearFixed
      ? settings.monthlyExpense * 12
      : settings.monthlyExpense * activeMonthsCount;

    // Total expense (variable + fixed)
    const totalAnnualExpense = annualVariableExpenses + annualFixedExpenses;

    // Net cash balance (Received income - Total expense)
    const netAnnualBalance = annualReceivedValue - totalAnnualExpense;

    return {
      selectedYear,
      annualContractValue,
      annualReceivedValue,
      annualWhtAmount,
      annualVariableExpenses,
      annualFixedExpenses,
      totalAnnualExpense,
      netAnnualBalance,
      jobCount: yearJobs.length,
      expenseCount: yearExpenses.length,
      activeMonthsCount
    };
  }, [jobs, expenses, settings.monthlyExpense, selectedYear, includeFullYearFixed, whtPaymentEntries]);

  // 1. Process 12 calendar months for selectedYear
  const monthlyData = useMemo(() => {
    const dataMap: { 
      [monthKey: string]: { 
        month: string; 
        income: number; 
        received: number; 
        targetRevenue: number; 
        targetSavings: number;
        fixedExpense: number;
        variableExpense: number;
        whtAmount: number;
        netFlow: number;
      } 
    } = {};
    
    const totalAllocatedPct = goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
    const savingsPct = totalAllocatedPct > 0 ? totalAllocatedPct : (settings.savingsPercentage || 40);

    // Generate all 12 calendar months for selectedYear (ม.ค. - ธ.ค.)
    for (let m = 1; m <= 12; m++) {
      const mStr = String(m).padStart(2, '0');
      const key = `${selectedYear}-${mStr}`;
      dataMap[key] = {
        month: key,
        income: 0,
        received: 0,
        targetRevenue: settings.monthlyRevenueGoal,
        targetSavings: Math.round(settings.monthlyRevenueGoal * (savingsPct / 100)),
        fixedExpense: settings.monthlyExpense,
        variableExpense: 0,
        whtAmount: 0,
        netFlow: 0
      };
    }

    // Add actual job metrics
    jobs.forEach(j => {
      const dateKey = j.payDate || j.postDate;
      if (dateKey) {
        const key = getMonthKey(dateKey);
        if (dataMap[key]) {
          dataMap[key].income += j.value;
        }
      }
      getJobPaymentEntries(j).forEach((entry) => {
        const key = getMonthKeyFromDate(entry.date);
        if (dataMap[key]) dataMap[key].received += entry.amount;
      });
    });

    whtPaymentEntries.forEach((entry) => {
      const key = getMonthKeyFromDate(entry.date);
      if (dataMap[key]) dataMap[key].whtAmount += entry.amount;
    });

    // Add variable expenses
    (expenses || []).forEach(e => {
      if (e.date) {
        const key = getMonthKey(e.date);
        if (dataMap[key]) {
          dataMap[key].variableExpense += e.amount;
        }
      }
    });

    // Format for Recharts and table
    return Object.values(dataMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(item => {
        const savingsBase = Math.max(0, item.received - item.variableExpense);
        const actualSavings = Math.round(savingsBase * (savingsPct / 100));
        const fixedExp = includeFullYearFixed 
          ? item.fixedExpense 
          : (item.received > 0 || item.variableExpense > 0 ? item.fixedExpense : 0);
        const netFlow = item.received - fixedExp - item.variableExpense;
        return {
          ...item,
          monthLabel: formatMonthKey(item.month),
          actualSavings,
          fixedExpenseCalculated: fixedExp,
          netFlow
        };
      });
  }, [jobs, expenses, goals, settings, selectedYear, includeFullYearFixed, whtPaymentEntries]);

  // 2. Savings Goals Progress Data
  const goalsData = useMemo(() => {
    return goals.map(g => ({
      name: g.name,
      target: g.target,
      current: g.current,
      emoji: g.emoji,
      percent: Math.min(100, Math.round((g.current / g.target) * 100)),
      color: g.acc
    }));
  }, [goals]);

  // 3. Scan pending credit terms due today, overdue, or upcoming
  const creditTermReport = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00');

    const dueToday: Job[] = [];
    const overdue: Job[] = [];
    const upcoming: Job[] = [];

    jobs.forEach(j => {
      if (j.pending > 0 && j.payDate) {
        const payDate = new Date(j.payDate + 'T00:00:00');
        const diffTime = payDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          dueToday.push(j);
        } else if (diffDays < 0) {
          overdue.push(j);
        } else if (diffDays > 0 && diffDays <= 14) {
          upcoming.push(j);
        }
      }
    });

    // Sort overdue by oldest first, upcoming by earliest first
    overdue.sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));
    upcoming.sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));

    return {
      dueToday,
      overdue,
      upcoming,
      totalPendingCount: dueToday.length + overdue.length + upcoming.length,
      totalPendingValue: [...dueToday, ...overdue, ...upcoming].reduce((sum, j) => sum + j.pending, 0)
    };
  }, [jobs]);

  // Helper to trigger email client and display animated/active feedback
  const handleSendEmailReport = () => {
    const todayThaiStr = new Date().toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const recipient = notifSettings.alertEmail || userEmail;
    const subjectText = `[กระรอกตุนเงิน] รายงานสรุปเงินครบกำหนดดีลเครดิตเทอม - ประจำวันที่ ${todayThaiStr}`;

    let bodyText = `สวัสดีครับคุณผู้ใช้ กระรอกตุนเงิน\n`;
    bodyText += `นี่คือรายงานสรุปยอดดีลงานที่ครบกำหนดชำระเครดิตเทอม ประจำวันที่ ${todayThaiStr}\n`;
    bodyText += `ส่งตรงถึงคุณที่อีเมล: ${recipient}\n\n`;
    bodyText += `=========================================\n`;
    bodyText += `📊 สรุปภาพรวมยอดค้างชำระทั้งหมด: ${formatCurrency(creditTermReport.totalPendingValue)}\n`;
    bodyText += `=========================================\n\n`;

    if (creditTermReport.dueToday.length > 0) {
      bodyText += `🔴 [ครบกำหนดชำระวันนี้ - วันที่ ${todayThaiStr}]\n`;
      creditTermReport.dueToday.forEach((j, i) => {
        bodyText += `${i + 1}. งาน: ${j.name}\n`;
        bodyText += `   ลูกค้า: ${j.client}\n`;
        bodyText += `   ยอดเงินค้างชำระ: ${formatCurrency(j.pending)} (จากมูลค่าเต็ม ${formatCurrency(j.value)})\n`;
        bodyText += `   โน้ต: ${j.note || '-'}\n\n`;
      });
    } else {
      bodyText += `🟢 ไม่มีดีลงานครบกำหนดวันนี้ครับ\n\n`;
    }

    if (creditTermReport.overdue.length > 0) {
      bodyText += `⚠️ [เกินกำหนดชำระค้างส่ง - ด่วน!]\n`;
      creditTermReport.overdue.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. งาน: ${j.name}\n`;
        bodyText += `   ลูกค้า: ${j.client}\n`;
        bodyText += `   ยอดเงินค้างชำระ: ${formatCurrency(j.pending)}\n`;
        bodyText += `   วันครบกำหนดเดิม: ${j.payDate} (${days.text})\n`;
        bodyText += `   โน้ต: ${j.note || '-'}\n\n`;
      });
    }

    if (creditTermReport.upcoming.length > 0) {
      bodyText += `📅 [กำลังจะครบกำหนดเร็วๆ นี้ (ใน 14 วัน)]\n`;
      creditTermReport.upcoming.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. งาน: ${j.name}\n`;
        bodyText += `   ลูกค้า: ${j.client}\n`;
        bodyText += `   ยอดเงินที่จะครบกำหนด: ${formatCurrency(j.pending)}\n`;
        bodyText += `   วันครบกำหนด: ${j.payDate} (${days.text})\n\n`;
      });
    }

    bodyText += `-----------------------------------------\n`;
    bodyText += `ติดตามและบันทึกกระแสเงินสดของคุณอย่างสม่ำเสมอเพื่อสุขภาพทางการเงินที่ดี!\n`;
    bodyText += `จัดทำโดยระบบ กระรอกตุนเงิน (Supabase Client Secured)`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    // 2. Start simulated flow or automatic sending
    setIsSendingSimulated(true);
    setSimulationStep(1);

    setTimeout(() => {
      setSimulationStep(2);
    }, 1000);

    setTimeout(() => {
      if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsTemplateId && notifSettings.emailjsPublicKey) {
        setSimulationStep(3);
        fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: notifSettings.emailjsServiceId,
            template_id: notifSettings.emailjsTemplateId,
            user_id: notifSettings.emailjsPublicKey,
            template_params: {
              to_email: recipient,
              subject: subjectText,
              message: bodyText,
            }
          })
        })
        .then(res => {
          setIsSendingSimulated(false);
          setSimulationStep(0);
          if (res.ok) {
            triggerAlert('ส่งรายงานสำเร็จ!', `ระบบส่งอีเมลสรุปข้อมูลเครดิตเทอมไปที่ ${recipient} เรียบร้อยแล้ว`);
          } else {
            res.text().then(errText => {
              triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `EmailJS รายงานข้อผิดพลาด: ${errText}\n\nระบบเปิดแอปเมลสำรอง (Mailto) แทนเพื่อให้คุณส่งครับ`, () => {
                window.location.href = mailtoUrl;
              });
            });
          }
        })
        .catch(err => {
          setIsSendingSimulated(false);
          setSimulationStep(0);
          triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `เชื่อมต่อ EmailJS ผิดพลาด: ${err.message}\n\nระบบเปิดแอปเมลสำรอง (Mailto) แทนเพื่อให้คุณส่งครับ`, () => {
            window.location.href = mailtoUrl;
          });
        });
      } else {
        setSimulationStep(3);
        // Direct mailto
        window.location.href = mailtoUrl;
        setTimeout(() => {
          setIsSendingSimulated(false);
          setSimulationStep(0);
          triggerAlert(
            'เปิดระบบเมลสำเร็จ!',
            `รายงานจะถูกร่างและเปิดขึ้นบนระบบของคุณเรียบร้อยแล้ว ปลายทางคือ ${recipient}`
          );
        }, 1000);
      }
    }, 2000);
  };

  // Send alert to self via email about unpaid money
  const handleAlertSelfEmail = (job: Job) => {
    const days = getRelativeDaysText(job.payDate);
    let alertStatusText = '';

    if (days.isOverdue) {
      alertStatusText = `เกินกำหนดชำระแล้ว ${Math.abs(days.daysCount)} วัน 🚨`;
    } else if (days.daysCount === 0) {
      alertStatusText = `ครบกำหนดชำระวันนี้! ⏰`;
    } else {
      alertStatusText = `กำลังจะครบกำหนดในอีก ${days.daysCount} วัน 📅`;
    }

    const recipient = notifSettings.alertEmail || userEmail;
    const subjectText = `[แจ้งเตือนกระแสเงินสด] ยอดเงินยังไม่เข้า! ${alertStatusText} - งาน ${job.name}`;

    let bodyText = `แจ้งเตือนความจำถึงตัวเอง (Personal Cashflow Alert):\n`;
    bodyText += `ระบบตรวจพบว่างานนี้ "เงินยังไม่เข้า" หรือยอดชำระยังค้างอยู่!\n\n`;
    bodyText += `-----------------------------------------\n`;
    bodyText += `📌 รายละเอียดงานที่ผิดนัดชำระ/ค้างชำระ:\n`;
    bodyText += `• ชื่องาน/ดีล: ${job.name}\n`;
    bodyText += `• ลูกค้า/ผู้จ้าง: ${job.client}\n`;
    bodyText += `• สถานะเครดิตเทอม: ${alertStatusText}\n`;
    bodyText += `• วันครบกำหนดชำระเงิน: ${job.payDate || 'ไม่ระบุ'}\n`;
    bodyText += `• มูลค่างานทั้งหมด: ${formatCurrency(job.value)}\n`;
    bodyText += `• ยอดคงเหลือค้างจ่าย (Pending): ${formatCurrency(job.pending)}\n`;
    bodyText += `• ยอดที่จ่ายมาแล้ว: ${formatCurrency(job.received)}\n`;
    bodyText += `-----------------------------------------\n\n`;
    bodyText += `💡 คำแนะนำในการดำเนินการต่อไป:\n`;
    bodyText += `1. ตรวจสอบแอปพลิเคชันธนาคาร/รายการเดินบัญชี เพื่อยืนยันว่าไม่มีเงินโอนเข้าจากคุณ "${job.client || 'ลูกค้า'}" จริงๆ\n`;
    bodyText += `2. หากยังไม่ได้รับเงิน ให้จัดทำและส่งใบเตือนยอดหนี้ค้างชำระ หรือโทร/ทักแชตไปสอบถามสถานะกับทางฝั่งลูกค้าทันที\n`;
    bodyText += `3. หากได้รับเงินครบถ้วนแล้ว อย่าลืมกดแก้ไขงานนี้ในหน้า "ดีลงานทั้งหมด" หรือ "ไทม์ไลน์" และเปลี่ยนสถานะเป็น "จ่ายเงินครบแล้ว" เพื่อลบการแจ้งเตือนนี้ออก\n\n`;
    bodyText += `ส่งจากระบบรายงานและติดตามเครดิตเทอม กระรอกตุนเงิน\n`;
    bodyText += `ผู้ใช้: ${userEmail}`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    triggerConfirm(
      'แจ้งเตือนเงินค้างชำระเข้าเมลตัวเอง',
      `คุณต้องการส่งร่างอีเมลแจ้งเตือนถึงตัวเอง เพื่อติดตามงาน "${job.name}" ที่${alertStatusText} หรือไม่? ระบบจะส่งอีเมลหาตัวคุณเองที่ ${recipient}`,
      () => {
        if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsPublicKey) {
          setIsSendingSimulated(true);
          fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: notifSettings.emailjsServiceId,
              template_id: notifSettings.emailjsTemplateId,
              user_id: notifSettings.emailjsPublicKey,
              template_params: {
                to_email: recipient,
                subject: subjectText,
                message: bodyText,
              }
            })
          })
          .then(res => {
            setIsSendingSimulated(false);
            if (res.ok) {
              triggerAlert('ส่งอีเมลแจ้งเตือนสำเร็จ!', `ระบบส่งอีเมลตรวจสอบรายการค้างชำระไปที่ ${recipient} เรียบร้อยแล้ว`);
            } else {
              res.text().then(errText => {
                triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `EmailJS แจ้งข้อผิดพลาด: ${errText}\n\nระบบจะเปิดหน้าเมลสำรอง (Mailto) เพื่อให้คุณส่งแมนนวลแทนครับ`, () => {
                  window.location.href = mailtoUrl;
                });
              });
            }
          })
          .catch(err => {
            setIsSendingSimulated(false);
            triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `เชื่อมต่อ EmailJS ผิดพลาด: ${err.message}\n\nระบบจะเปิดหน้าเมลสำรอง (Mailto) เพื่อให้คุณส่งแมนนวลแทนครับ`, () => {
              window.location.href = mailtoUrl;
            });
          });
        } else {
          window.location.href = mailtoUrl;
        }
      }
    );
  };

  const draft10Clients = Array.from(jobs.reduce((map, job) => {
    const key = job.client || 'ไม่ระบุลูกค้า';
    const current = map.get(key) || { name: key, jobs: 0, received: 0, pending: 0 };
    current.jobs += 1;
    current.received += Math.max(0, job.value - job.pending);
    current.pending += job.pending;
    map.set(key, current);
    return map;
  }, new Map<string, { name: string; jobs: number; received: number; pending: number }>()).values());

  return (
    <div className="draft10-report page-content">
      <h1>รายงาน</h1>
      <nav className="draft10-report-tabs" aria-label="ประเภทรายงาน">
        {([
          ['overview', 'ภาพรวม'],
          ['income', 'รายได้'],
          ['clients', 'ลูกค้า'],
          ['credit', 'Credit Term'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" className={reportView === key ? 'is-active' : ''} onClick={() => setReportView(key)}>{label}</button>
        ))}
      </nav>

      {reportView === 'overview' && <>
        <section className="draft10-report-kpis">
          <article><span>รายรับ</span><strong>{formatCurrency(annualMetrics.annualReceivedValue)}</strong></article>
          <article><span>รายจ่าย</span><strong>{formatCurrency(annualMetrics.totalAnnualExpense)}</strong></article>
          <article><span>กำไร</span><strong>{formatCurrency(Math.max(0, annualMetrics.netAnnualBalance))}</strong></article>
          <article><span>เงินค้างรับ</span><strong>{formatCurrency(jobs.reduce((sum, job) => sum + job.pending, 0))}</strong></article>
        </section>
        <section className="draft10-report-chart">
          <h2>แนวโน้มรายเดือน</h2>
          <svg viewBox="0 0 900 190" role="img" aria-label="แนวโน้มรายได้รายเดือน"><polyline points="20,135 180,100 340,145 500,68 660,92 875,48" fill="none" stroke="#E65F2B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </section>
      </>}

      {reportView === 'income' && <section className="draft10-report-table">
        <h2>รายได้รายเดือน</h2>
        <div className="draft10-report-row is-head"><span>เดือน</span><span>รับเงินจริง</span><span>รายจ่าย</span><span>กำไรสุทธิ</span></div>
        {monthlyData.map(month => <div key={month.month} className="draft10-report-row"><span>{month.monthLabel}</span><span>{formatCurrency(month.received)}</span><span>{formatCurrency(month.fixedExpenseCalculated + month.variableExpense)}</span><span>{formatCurrency(month.netFlow)}</span></div>)}
      </section>}

      {reportView === 'clients' && <section className="draft10-report-table">
        <h2>รายได้ตามลูกค้า</h2>
        <div className="draft10-report-row is-head"><span>ลูกค้า</span><span>จำนวนงาน</span><span>รับแล้ว</span><span>ค้างรับ</span></div>
        {draft10Clients.map(client => <div key={client.name} className="draft10-report-row"><span>{client.name}</span><span>{client.jobs}</span><span>{formatCurrency(client.received)}</span><span>{formatCurrency(client.pending)}</span></div>)}
      </section>}

      {reportView === 'credit' && <section className="draft10-credit-list">
        <h2>ติดตาม Credit Term</h2>
        {[...creditTermReport.overdue, ...creditTermReport.dueToday, ...creditTermReport.upcoming].map(job => <button key={job.id} type="button" onClick={() => onViewJob?.(job.id)}><span><b>{job.name}</b><small>{job.client} · Credit {job.creditTerm} วัน</small></span><strong>{formatCurrency(job.pending)}</strong></button>)}
        {creditTermReport.totalPendingCount === 0 && <p>ไม่มีรายการค้างรับในช่วงนี้</p>}
      </section>}
    </div>
  );
}

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
    const annualWhtAmount = yearJobs.reduce((sum, j) => sum + (j.whtAmount || 0), 0);

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
  }, [jobs, expenses, settings.monthlyExpense, selectedYear, includeFullYearFixed]);

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
  }, [jobs, expenses, goals, settings, selectedYear, includeFullYearFixed]);

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

  return (
    <div className="page-content space-y-6">
      
      {/* Dynamic Header Section */}
      <div className="bg-brand-white p-6 rounded-3xl border border-brand-border/40 shadow-sm relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-60 h-60 bg-emerald-600/5 dark:bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-md">
                สรุปภาพรวมรายเดือน & อีเมลรายงาน
              </span>
              <span className="text-[10px] bg-brand-faint px-2 py-1 rounded-md font-mono text-brand-muted">
                {userEmail}
              </span>
            </div>
            <h2 className="text-xl font-display font-black tracking-tight text-brand-text sm:text-2xl">
              รายงานวิเคราะห์กระแสเงินสดและเงินออม
            </h2>
            <p className="text-xs text-brand-muted mt-1 leading-relaxed">
              เปรียบเทียบความสัมพันธ์ของรายรับเฉลี่ยกับยอดเงินออม และจัดการติดตามดีลเครดิตเทอมเพื่อรักษาความคล่องตัวทางการเงินของคุณ
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-4">
            <Mascot mood="wave" size={72} className="shrink-0 hidden sm:inline-flex" />
            <button
              onClick={handleSendEmailReport}
              disabled={isSendingSimulated}
              className="py-3 px-5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 text-white font-extrabold rounded-2xl text-xs shadow-md shadow-emerald-600/10 dark:shadow-none hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50"
            >
              <Mail className="w-4.5 h-4.5 animate-pulse" />
              <span>ส่งรายงานเครดิตเทอมเข้าอีเมล</span>
            </button>
          </div>
        </div>

      </div>

      {/* Simulated Email Sending Popup Overlay */}
      <AnimatePresence>
        {isSendingSimulated && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-brand-text/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-brand-white dark:bg-neutral-900 border border-brand-border/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-xl relative overflow-hidden"
            >
              {/* Top abstract circle */}
              <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-40 h-40 bg-emerald-600/5 rounded-full blur-xl pointer-events-none" />

              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4 animate-bounce">
                  <Send className="w-8 h-8" />
                </div>

                <h3 className="font-display font-extrabold text-base text-brand-text mb-2">
                  กำลังสร้างรายงานความปลอดภัย...
                </h3>

                <p className="text-xs text-brand-muted px-4 leading-relaxed">
                  ระบบจัดเตรียมรายงานรายได้และสถานะการชำระเงินของลูกค้าเพื่อส่งไปยัง <span className="font-semibold text-brand-text font-mono">{userEmail}</span>
                </p>

                {/* Progress indicators */}
                <div className="w-full mt-6 space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-brand-muted px-1">
                    <span>{simulationStep === 1 ? 'รวบรวมข้อมูลดิวยอดค้างชำระ...' : simulationStep === 2 ? 'จัดทำรูปแบบสรุปเนื้อหา...' : 'เปิดระบบอีเมลภายนอก...'}</span>
                    <span className="font-mono">{simulationStep === 1 ? '35%' : simulationStep === 2 ? '75%' : '100%'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-brand-faint rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ 
                        width: simulationStep === 1 ? '35%' : simulationStep === 2 ? '75%' : '100%' 
                      }}
                      transition={{ duration: 0.8, ease: 'easeInOut' }}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-1.5 text-[9px] text-brand-muted/70 bg-brand-faint/60 px-3 py-1.5 rounded-xl border border-brand-border/20">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>การเชื่อมต่อปลอดภัยผ่านระบบ Supabase</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Annual Financial Summary Section */}
      <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-brand-border/30 dark:border-neutral-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                สรุปงบการเงินและผลประกอบการรายปี
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                ปี ค.ศ. {selectedYear}
              </span>
            </div>
            <p className="text-xs text-brand-muted dark:text-neutral-400 mt-1">
              รวมยอดรายรับสุทธิ รายจ่ายรวม และกระแสเงินสดคงเหลือสะสมตลอดรอบปีปฏิทิน 12 เดือน
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Year selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-brand-muted dark:text-neutral-400">เลือกปีบัญชี:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="py-1.5 px-3 bg-brand-bg dark:bg-neutral-800 border border-brand-border dark:border-neutral-700 text-brand-text dark:text-white rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>ปี ค.ศ. {y} (พ.ศ. {y + 543})</option>
                ))}
              </select>
            </div>

            {/* Mode selector for fixed expenses */}
            <div className="flex items-center bg-brand-bg dark:bg-neutral-800 p-1 rounded-xl border border-brand-border/50 dark:border-neutral-700 text-xs">
              <button
                type="button"
                onClick={() => setIncludeFullYearFixed(true)}
                className={`px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer ${
                  includeFullYearFixed
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-brand-muted hover:text-brand-text dark:hover:text-white'
                }`}
              >
                รายปีเต็ม (12 เดือน)
              </button>
              <button
                type="button"
                onClick={() => setIncludeFullYearFixed(false)}
                className={`px-2.5 py-1 rounded-lg font-extrabold transition-all cursor-pointer ${
                  !includeFullYearFixed
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-brand-muted hover:text-brand-text dark:hover:text-white'
                }`}
              >
                เฉพาะเดือนที่มีบันทึก ({annualMetrics.activeMonthsCount} เดือน)
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Card 1: Annual Income */}
          <div className="relative overflow-hidden bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30 p-5 rounded-2xl flex flex-col justify-between min-h-[140px]">
            <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                รายรับโอนเข้าจริงรวมทั้งปี ({selectedYear})
              </span>
              <TrendingUp className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400 leading-none">
                {formatCurrency(annualMetrics.annualReceivedValue)}
              </p>
              <div className="mt-3 space-y-1.5 border-t border-emerald-500/10 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-brand-muted dark:text-neutral-400 font-medium">มูลค่าสัญญาดีลงานรวมปี:</span>
                  <span className="text-[10px] font-mono font-bold text-brand-text dark:text-white">{formatCurrency(annualMetrics.annualContractValue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">หัก ณ ที่จ่ายรวมรายปี:</span>
                  <span className="text-[10px] font-mono font-black text-amber-700 dark:text-amber-400">{formatCurrency(annualMetrics.annualWhtAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Annual Expense */}
          <div className="relative overflow-hidden bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 dark:border-rose-500/30 p-5 rounded-2xl flex flex-col justify-between min-h-[140px]">
            <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-rose-500/10 dark:bg-rose-500/20 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                รายจ่ายรวมทั้งปี ({selectedYear})
              </span>
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black font-mono text-rose-700 dark:text-rose-400 leading-none">
                {formatCurrency(annualMetrics.totalAnnualExpense)}
              </p>
              <div className="flex justify-between items-center mt-3 pt-2 border-t border-rose-500/10 text-[10px] text-brand-muted dark:text-neutral-400">
                <span>แปรผัน: {formatCurrency(annualMetrics.annualVariableExpenses)}</span>
                <span className="text-brand-muted">|</span>
                <span>
                  คงที่ ({includeFullYearFixed ? '12 เดือน' : `${annualMetrics.activeMonthsCount} เดือน`}): {formatCurrency(annualMetrics.annualFixedExpenses)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Net Cash Balance */}
          <div className="relative overflow-hidden p-5 rounded-2xl flex flex-col justify-between min-h-[140px] border bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20 dark:border-blue-500/30">
            <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                กระแสเงินสดสุทธิคงเหลือรวมปี
              </span>
              <PiggyBank className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="mt-2">
              <p className="text-2xl font-black font-mono leading-none text-blue-700 dark:text-blue-400">
                {formatCurrency(Math.max(0, annualMetrics.netAnnualBalance))}
              </p>
              <div className="flex justify-between items-center mt-3 pt-2 border-t text-[10px] border-blue-500/10 text-blue-700/80 dark:text-blue-400/80">
                <span>คำนวณตลอดปี ค.ศ. {selectedYear}:</span>
                <span className="font-bold">
                  {includeFullYearFixed ? 'เต็ม 12 เดือน' : `${annualMetrics.activeMonthsCount} เดือนที่มีบันทึก`}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Button to toggle 12-Month Table Breakdown */}
        <div className="pt-2 flex justify-between items-center border-t border-brand-border/20">
          <button
            type="button"
            onClick={() => setShowYearlyBreakdownTable(!showYearlyBreakdownTable)}
            className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>{showYearlyBreakdownTable ? 'ซ่อนตารางสรุปรายรับ-รายจ่าย 12 เดือน' : 'ดูตารางสรุปงบการเงินแยกตามเดือน (ม.ค. - ธ.ค. 12 เดือน)'}</span>
          </button>
          
          <span className="text-[11px] text-brand-muted">
            {annualMetrics.jobCount} งานดีล | {annualMetrics.expenseCount} รายการค่าใช้จ่ายแปรผัน
          </span>
        </div>

        {/* 12-Month Annual Breakdown Table */}
        <AnimatePresence>
          {showYearlyBreakdownTable && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 p-4 rounded-2xl bg-brand-bg/50 dark:bg-neutral-800/40 border border-brand-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-brand-text dark:text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    ตารางสรุปงบการเงินรายเดือนตลอดปี ค.ศ. {selectedYear} (12 เดือน)
                  </h4>
                  <span className="text-[10px] text-brand-muted">
                    เกณฑ์ค่าใช้จ่ายคงที่: {formatCurrency(settings.monthlyExpense)} / เดือน
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-brand-border/40 text-[10px] font-bold text-brand-muted uppercase">
                        <th className="py-2 px-3">เดือน</th>
                        <th className="py-2 px-3 text-right">รายรับสัญญา</th>
                        <th className="py-2 px-3 text-right">รายรับโอนเข้าจริง</th>
                        <th className="py-2 px-3 text-right">รายจ่ายคงที่</th>
                        <th className="py-2 px-3 text-right">รายจ่ายแปรผัน</th>
                        <th className="py-2 px-3 text-right">กระแสเงินสดสุทธิ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/20">
                      {monthlyData.map((m) => (
                        <tr key={m.month} className="hover:bg-brand-faint/40 transition-colors">
                          <td className="py-2 px-3 font-bold font-sans text-brand-text dark:text-neutral-200">
                            {m.monthLabel}
                          </td>
                          <td className="py-2 px-3 text-right text-brand-muted">
                            {formatCurrency(m.income)}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(m.received)}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">
                            {formatCurrency(m.fixedExpenseCalculated)}
                          </td>
                          <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">
                            {formatCurrency(m.variableExpense)}
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold text-blue-600 dark:text-blue-400">
                            {formatCurrency(Math.max(0, m.netFlow))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-brand-border font-bold bg-brand-faint/60 dark:bg-neutral-800 text-brand-text dark:text-white">
                        <td className="py-2.5 px-3 font-sans font-extrabold">รวมยอดทั้งปี ({selectedYear})</td>
                        <td className="py-2.5 px-3 text-right">{formatCurrency(annualMetrics.annualContractValue)}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-400 font-black">{formatCurrency(annualMetrics.annualReceivedValue)}</td>
                        <td className="py-2.5 px-3 text-right text-rose-700 dark:text-rose-400">{formatCurrency(annualMetrics.annualFixedExpenses)}</td>
                        <td className="py-2.5 px-3 text-right text-rose-700 dark:text-rose-400">{formatCurrency(annualMetrics.annualVariableExpenses)}</td>
                        <td className="py-2.5 px-3 text-right font-black text-blue-700 dark:text-blue-400">
                          {formatCurrency(Math.max(0, annualMetrics.netAnnualBalance))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Credit Term Overdue and Alerts Board */}
      <div className="bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-pink-bg text-pink-acc border border-pink-acc/10">
            <Bell className="w-5 h-5 animate-swing" />
          </div>
          <div>
            <h3 className="font-display font-extrabold text-sm text-brand-text">
              แดชบอร์ดติดตามทวงถามเครดิตเทอม
            </h3>
            <p className="text-[11px] text-brand-muted">
              วิเคราะห์รายชื่อลูกค้าและจำนวนเงินที่รอคอยการโอนเงินเพื่อช่วยรักษาการติดตามอย่างทันเวลา
            </p>
          </div>
        </div>

        {/* Due Lists */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* Box 1: Overdue */}
          <div className="p-4 rounded-2xl bg-pink-bg/10 border border-pink-acc/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-pink-acc bg-pink-bg px-2.5 py-1 rounded-md flex items-center gap-1">
                  <IconWarning className="w-3 h-3" /> เกินกำหนดชำระแล้ว (OVERDUE)
                </span>
                <span className="font-mono text-xs font-black text-pink-acc">{creditTermReport.overdue.length} ดีล</span>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                {creditTermReport.overdue.map(j => {
                  const days = getRelativeDaysText(j.payDate);
                  return (
                    <div
                      key={j.id}
                      onClick={() => onViewJob?.(j.id)}
                      className={`text-xs p-3 bg-brand-white rounded-xl border border-brand-border/30 shadow-xs ${onViewJob ? 'cursor-pointer hover:border-pink-acc/40 transition-colors' : ''}`}
                    >
                      <p className="font-extrabold text-brand-text leading-tight truncate">{j.name}</p>
                      <p className="text-[10px] text-brand-muted font-semibold mt-0.5">ลูกค้า: {j.client}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-border/20">
                        <span className="font-mono font-black text-pink-acc">{formatCurrency(j.pending)}</span>
                        <span className="text-[9px] bg-pink-bg text-pink-acc font-black px-1.5 py-0.5 rounded-sm">{days.text}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAlertSelfEmail(j); }}
                        className="mt-2 w-full py-1.5 px-2 bg-brand-bg hover:bg-brand-faint dark:bg-neutral-800/40 dark:hover:bg-neutral-800 border border-brand-border/30 text-brand-text font-black rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Mail className="w-3 h-3 text-pink-acc" />
                        <span>แจ้งเตือนเข้าเมลตัวเอง</span>
                      </button>
                    </div>
                  );
                })}

                {creditTermReport.overdue.length === 0 && (
                  <div className="text-center py-8 text-brand-muted text-[11px] font-medium">
                    <span className="inline-flex items-center gap-1"><IconCheck className="w-3 h-3" /> ยอดเยี่ยม! ไม่มีงานเกินกำหนดชำระเลย</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Box 2: Due Today */}
          <div className="p-4 rounded-2xl bg-yellow-bg/15 border border-yellow-acc/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-acc bg-yellow-bg px-2.5 py-1 rounded-md flex items-center gap-1">
                  <IconAlertDot className="w-3 h-3" /> ครบกำหนดชำระวันนี้ (DUE TODAY)
                </span>
                <span className="font-mono text-xs font-black text-yellow-acc">{creditTermReport.dueToday.length} ดีล</span>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                {creditTermReport.dueToday.map(j => {
                  return (
                    <div
                      key={j.id}
                      onClick={() => onViewJob?.(j.id)}
                      className={`text-xs p-3 bg-brand-white rounded-xl border border-brand-border/30 shadow-xs ${onViewJob ? 'cursor-pointer hover:border-yellow-acc/40 transition-colors' : ''}`}
                    >
                      <p className="font-extrabold text-brand-text leading-tight truncate">{j.name}</p>
                      <p className="text-[10px] text-brand-muted font-semibold mt-0.5">ลูกค้า: {j.client}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-border/20">
                        <span className="font-mono font-black text-yellow-acc">{formatCurrency(j.pending)}</span>
                        <span className="text-[9px] bg-yellow-bg text-yellow-acc font-black px-1.5 py-0.5 rounded-sm inline-flex items-center gap-0.5">วันนี้ <IconAlertDot className="w-2.5 h-2.5" /></span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAlertSelfEmail(j); }}
                        className="mt-2 w-full py-1.5 px-2 bg-brand-bg hover:bg-brand-faint dark:bg-neutral-800/40 dark:hover:bg-neutral-800 border border-brand-border/30 text-brand-text font-black rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Mail className="w-3 h-3 text-yellow-acc" />
                        <span>แจ้งเตือนเข้าเมลตัวเอง</span>
                      </button>
                    </div>
                  );
                })}

                {creditTermReport.dueToday.length === 0 && (
                  <div className="text-center py-8 text-brand-muted text-[11px] font-medium">
                    ไม่มีดีลงานครบกำหนดส่งเงินในวันนี้
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Box 3: Upcoming Due */}
          <div className="p-4 rounded-2xl bg-blue-bg/15 border border-blue-acc/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-acc bg-blue-bg px-2.5 py-1 rounded-md flex items-center gap-1">
                  <IconCalendar className="w-3 h-3" /> กำลังจะถึงกำหนด (IN 14 DAYS)
                </span>
                <span className="font-mono text-xs font-black text-blue-acc">{creditTermReport.upcoming.length} ดีล</span>
              </div>

              <div className="space-y-3 max-h-56 overflow-y-auto pr-1 no-scrollbar">
                {creditTermReport.upcoming.map(j => {
                  const days = getRelativeDaysText(j.payDate);
                  return (
                    <div
                      key={j.id}
                      onClick={() => onViewJob?.(j.id)}
                      className={`text-xs p-3 bg-brand-white rounded-xl border border-brand-border/30 shadow-xs ${onViewJob ? 'cursor-pointer hover:border-blue-acc/40 transition-colors' : ''}`}
                    >
                      <p className="font-extrabold text-brand-text leading-tight truncate">{j.name}</p>
                      <p className="text-[10px] text-brand-muted font-semibold mt-0.5">ลูกค้า: {j.client}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-border/20">
                        <span className="font-mono font-black text-blue-acc">{formatCurrency(j.pending)}</span>
                        <span className="text-[9px] bg-blue-bg text-blue-acc font-black px-1.5 py-0.5 rounded-sm">{days.text}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAlertSelfEmail(j); }}
                        className="mt-2 w-full py-1.5 px-2 bg-brand-bg hover:bg-brand-faint dark:bg-neutral-800/40 dark:hover:bg-neutral-800 border border-brand-border/30 text-brand-text font-black rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-all"
                      >
                        <Mail className="w-3 h-3 text-blue-acc" />
                        <span>แจ้งเตือนเข้าเมลตัวเอง</span>
                      </button>
                    </div>
                  );
                })}

                {creditTermReport.upcoming.length === 0 && (
                  <div className="text-center py-8 text-brand-muted text-[11px] font-medium">
                    ไม่มีรายการครบกำหนดชำระใน 14 วันนี้
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Dynamic callout summary */}
        <div className="mt-5 p-4 rounded-2xl bg-brand-faint/40 border border-brand-border/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-start gap-2 text-xs leading-relaxed text-brand-muted">
            <AlertCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>ยอดค้างจ่ายจากดิวมัดจำและเครดิตเทอมทั้งหมดรวมกันจำนวน <span className="font-extrabold text-brand-text font-mono">{formatCurrency(creditTermReport.totalPendingValue)}</span> จากดีลทั้งหมด <span className="font-extrabold text-brand-text font-mono">{creditTermReport.totalPendingCount}</span> รายการ</span>
          </div>

          <button
            onClick={handleSendEmailReport}
            className="w-full sm:w-auto py-2.5 px-4 bg-brand-text hover:bg-brand-muted text-brand-white font-extrabold rounded-xl text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>ส่งรายงานสรุปยอดค้างจ่ายทั้งหมดเข้าเมลตนเอง</span>
          </button>
        </div>
      </div>

      {/* Grid: Bar Chart + Savings Goals progress */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Monthly Income vs Savings Goals Bar Chart */}
        <div className="xl:col-span-2 bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <h3 className="font-display font-extrabold text-sm text-brand-text flex items-center gap-2">
                <TrendingUp className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
                เปรียบเทียบ รายรับรายเดือน vs. เป้าหมายเงินออม (40%)
              </h3>
              <p className="text-[11px] text-brand-muted mt-0.5">
                กราฟแท่งแสดงรายรับที่ทำได้จริง เปรียบเทียบกับสัดส่วนเป้าหมายการจัดเก็บเงินออมสะสม
              </p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-brand-muted">
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[var(--chart-income-met)]" />
                  <span>รายรับสุทธิ (Income)</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-[var(--chart-savings-met)]" />
                  <span>ยอดออมสะสม (Savings)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-72 w-full text-xs font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} vertical={false} />
                <XAxis 
                  dataKey="monthLabel" 
                  stroke="#4f5350" 
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                />
                <YAxis 
                  stroke="#4f5350"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(18, 84, 66, 0.03)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[180px]">
                          <p className="text-xs font-black text-brand-text mb-1 border-b border-brand-border/40 pb-1">{data.monthLabel}</p>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-brand-muted font-bold">รายรับจริง:</span>
                            <span className="font-extrabold text-brand-text font-mono">{formatCurrency(data.received)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-brand-muted font-bold">รายรับที่ตั้งเป้า:</span>
                            <span className="font-extrabold text-brand-text font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(data.targetRevenue)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-brand-border/20">
                            <span className="text-[#C96B5A] dark:text-[#F4AE91] font-bold">เงินออมสะสมจริง:</span>
                            <span className="font-extrabold text-[#C96B5A] dark:text-[#F4AE91] font-mono">{formatCurrency(data.actualSavings)}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-brand-muted font-bold">เป้าออมที่ควรได้:</span>
                            <span className="font-extrabold text-brand-text font-mono">{formatCurrency(data.targetSavings)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="received"
                  name="รายรับจริง"
                  fill="var(--chart-income-met)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={30}
                />
                <Bar
                  dataKey="actualSavings"
                  name="เงินออมจริง"
                  fill="var(--chart-savings-met)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={30}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-4 pt-3.5 border-t border-brand-border/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px] text-brand-muted leading-relaxed">
            <div className="flex items-center gap-1.5">
              <span>คิดสัดส่วนเงินออม <span className="font-bold text-brand-text">{displaySavingsPercentage}%</span> จากรายรับที่โอนเข้าบัญชีสำเร็จแล้วเท่านั้น</span>
            </div>
            <button 
              onClick={() => triggerAlert('คำแนะนำทางการเงิน', 'ในเดือนที่รายรับเข้ามาต่ำกว่าเป้าหมาย ควรลดรายจ่ายฟุ่มเฟือยลง แต่รักษาอัตราส่วนเงินออมไว้ เพื่อความปลอดภัยของแผนกระแสเงินสดในระยะยาว')}
              className="text-emerald-600 dark:text-emerald-400 font-extrabold hover:underline inline-flex items-center gap-1"
            >
              ดูแนวทางจัดสรร <IconBulb className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right 1 Col: Savings Target list and progress */}
        <div className="bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-display font-extrabold text-sm text-brand-text flex items-center gap-2">
                <PiggyBank className="w-4.5 h-4.5 text-purple-600 dark:text-purple-400" />
                เป้าหมายเงินออมสะสมสะท้อนในพอร์ต
              </h3>
              <Mascot mood="proud" size={44} animated={false} className="shrink-0" />
            </div>

            <div className="space-y-4 max-h-76 overflow-y-auto pr-1 no-scrollbar">
              {goalsData.map((g, index) => (
                <div key={index} className="space-y-1.5 p-3.5 rounded-2xl bg-brand-bg/40 dark:bg-neutral-800/20 border border-brand-border/10">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-brand-text flex items-center gap-1.5">
                      <span className="text-base">{g.emoji}</span>
                      {g.name}
                    </span>
                    <span className="font-mono font-extrabold text-brand-text">{g.percent}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-brand-faint rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${g.percent}%`,
                        backgroundColor: g.color || '#125442'
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] text-brand-muted font-bold">
                    <span>สะสม: {formatCurrency(g.current)}</span>
                    <span>เป้าหมาย: {formatCurrency(g.target)}</span>
                  </div>
                </div>
              ))}

              {goalsData.length === 0 && (
                <div className="text-center py-8 text-brand-muted text-xs">
                  ไม่มีข้อมูลเป้าหมายเงินออมขณะนี้
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-brand-border/40">
            <button
              onClick={() => onSwitchTab('split')}
              className="w-full py-2.5 bg-brand-faint hover:bg-brand-border/40 text-brand-text font-extrabold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5 border border-brand-border/20"
            >
              <span>จัดการเป้าหมายออมเงินทั้งหมด</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>





    </div>
  );
}

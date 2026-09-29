import React from 'react';
import { createPortal } from 'react-dom';
import { Job, Goal, AppSettings, StatusOption, NotifSettings, Expense } from '../../../../shared/types';
import { formatCurrency, getForecastMonths, formatMonthKey, getRelativeDaysText, getMonthKey, safeFormatThaiDate } from '../../utils';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconArrowUpRight, IconBolt, IconCoin } from '../../components/ui/icons';
import { VineDivider } from '../../components/mascot/VineDivider';
import { useLanguage } from '../../i18n/LanguageContext';
import { getJobPaymentEntries, getJobPendingEntries, getMonthKeyFromDate, getOutstandingAmount } from '../../../../shared/installmentPayments';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  CheckCircle,
  ChevronRight, 
  Plus,
  Search,
  Check,
  Copy,
  MessageSquare,
  Flame,
  Bell,
  Mail,
  AlertCircle,
  Send,
  PiggyBank,
  CalendarDays,
  FileText
} from 'lucide-react';

interface DashboardTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  expenses: Expense[];
  onUpdateSettings?: (settings: AppSettings) => void;
  onSwitchTab: (tabId: string) => void;
  onOpenAddGoal: () => void;
  onOpenGoalDetail: (goalId: string) => void;
  statuses?: StatusOption[];
  selectedMonthKey: string;
  onEditJob?: (id: string, updated: Partial<Job>) => void;
  onViewJob?: (jobId: string) => void;
  userEmail: string;
  notifSettings: NotifSettings;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  onQuickRecord?: (mode: 'income' | 'expense') => void;
}

const formatAbbreviatedTarget = (value: number): string => {
  if (value >= 1000000) {
    const m = value / 1000000;
    return (m % 1 === 0 ? m : m.toFixed(1).replace(/\.0$/, '')) + 'M';
  } else {
    const k = value / 1000;
    return (k % 1 === 0 ? k : k.toFixed(1).replace(/\.0$/, '')) + 'k';
  }
};

export default function DashboardTab({
  jobs,
  goals,
  settings,
  expenses,
  onUpdateSettings,
  onSwitchTab,
  onOpenAddGoal,
  onOpenGoalDetail,
  statuses = [],
  selectedMonthKey,
  onEditJob,
  onViewJob,
  userEmail,
  notifSettings,
  triggerAlert,
  triggerConfirm,
  onQuickRecord,
}: DashboardTabProps) {
  const { t } = useLanguage();
  const [isAlertExpanded, setIsAlertExpanded] = React.useState(false);
  // Which hero-card figure's job breakdown is currently open ('contract' | 'received' | 'pending'),
  // or null when closed. Each row in the breakdown links out to the shared JobDetailModal via onViewJob.
  const [breakdownFilter, setBreakdownFilter] = React.useState<'contract' | 'received' | 'pending' | 'profit' | null>(null);
  const [quickSearch, setQuickSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(3);
  const [isQuickPayExpanded, setIsQuickPayExpanded] = React.useState(false);
  const [isSendingSimulated, setIsSendingSimulated] = React.useState(false);

  // Credit Term Report for the 3-box dashboard
  const creditTermReport = React.useMemo(() => {
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

  // Helper to trigger email client and display animated/active feedback
  const handleSendEmailReport = () => {
    const todayThaiStr = new Date().toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const recipient = notifSettings.alertEmail || userEmail;
    const subjectText = `[รายงานสรุป] ยอดหนี้เครดิตเทอมและเงินค้างชำระ - ข้อมูล ณ วันที่ ${todayThaiStr}`;

    let bodyText = `เรียนผู้ใช้งาน กระรอกตุนเงิน (คุณ ${userEmail})\n\n`;
    bodyText += `ระบบสรุปสถานะเครดิตเทอมของดิวดังต่อไปนี้ ประจำวันที่ ${todayThaiStr}:\n\n`;
    bodyText += `=========================================\n`;
    bodyText += `📊 สรุปภาพรวมยอดค้างชำระทั้งหมด: ${formatCurrency(creditTermReport.totalPendingValue)}\n`;
    bodyText += `=========================================\n\n`;

    if (creditTermReport.dueToday.length > 0) {
      bodyText += `🔴 [ครบกำหนดชำระวันนี้ - วันที่ ${todayThaiStr}]\n`;
      creditTermReport.dueToday.forEach((j, i) => {
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (มูลค่างาน: ${formatCurrency(j.value)})\n`;
      });
      bodyText += `\n`;
    }

    if (creditTermReport.overdue.length > 0) {
      bodyText += `⚠️ [เกินกำหนดชำระแล้ว - OVERDUE]\n`;
      creditTermReport.overdue.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (${days.text})\n`;
      });
      bodyText += `\n`;
    }

    if (creditTermReport.upcoming.length > 0) {
      bodyText += `📅 [กำลังจะครบกำหนดใน 14 วัน - UPCOMING]\n`;
      creditTermReport.upcoming.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (${days.text})\n`;
      });
      bodyText += `\n`;
    }

    bodyText += `-----------------------------------------\n`;
    bodyText += `💡 คำแนะนำ:\n`;
    bodyText += `• กรุณาตรวจสอบกระแสเงินสดและทวงถามกับฝ่ายบัญชีของลูกค้าตามรายการด้านบน\n`;
    bodyText += `• สามารถคัดลอกร่างข้อความทวงเงินอัจฉริยะ (1-Click Templates) ได้ในแถบเมนูของแอปพลิเคชัน\n\n`;
    bodyText += `ขอแสดงความนับถือ\n`;
    bodyText += `ระบบติดตามเครดิตเทอมอัตโนมัติ กระรอกตุนเงิน`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    triggerConfirm(
      'ส่งอีเมลรายงานสรุปยอดค้างจ่าย',
      `ระบบจะทำการสร้างร่างรายงานสรุปยอดค้างจ่ายทั้งหมดจำนวน ${formatCurrency(creditTermReport.totalPendingValue)} และเปิดช่องทางจัดส่งไปที่เมล ${recipient} ของคุณ เพื่อช่วยเก็บประวัติ`,
      () => {
        if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsPublicKey) {
          setIsSendingSimulated(true);
          
          // Show quick simulation flow
          triggerAlert('กำลังส่งรายงานผ่าน EmailJS...', 'กรุณารอระบบประมวลผลสักครู่เดียวครับ');
          
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
              triggerAlert(
                'ส่งอีเมลรายงานสำเร็จ!',
                `ระบบได้ส่งรายงานวิเคราะห์ยอดค้างรับไปยังอีเมล ${recipient} เรียบร้อยแล้วครับ`
              );
            } else {
              res.text().then(errText => {
                triggerAlert(
                  'ส่งผ่าน EmailJS ไม่สำเร็จ',
                  `ตรวจพบข้อผิดพลาด: ${errText}\n\nระบบจะสลับไปทำงานผ่านระบบเมลสำรอง (Mailto Link) แทนเพื่อเปิดแอปพลิเคชันอีเมลของคุณ`,
                  () => {
                    window.location.href = mailtoUrl;
                  }
                );
              });
            }
          })
          .catch(err => {
            setIsSendingSimulated(false);
            triggerAlert(
              'เกิดข้อผิดพลาดในการเชื่อมต่อ',
              `ไม่สามารถเชื่อมต่ออีเมลเซิร์ฟเวอร์ได้: ${err.message}\n\nระบบจะเปลี่ยนไปส่งผ่านเมลสำรองของคุณแทนครับ`,
              () => {
                window.location.href = mailtoUrl;
              }
            );
          });
        } else {
          // Fallback to mailto link immediately
          setIsSendingSimulated(true);
          setTimeout(() => {
            setIsSendingSimulated(false);
            window.location.href = mailtoUrl;
            
            setTimeout(() => {
              triggerAlert(
                'เปิดระบบเมลสำเร็จ!',
                `รายงานจะถูกร่างและเปิดขึ้นบนระบบของคุณเรียบร้อยแล้ว ปลายทางคือ ${recipient}`
              );
            }, 1000);
          }
          , 2000);
        }
      }
    );
  };

  // Credit term dashboard states
  const [creditFilter, setCreditFilter] = React.useState<'all' | 'overdue' | 'dueSoon' | 'onTrack'>('all');
  const [expandedJobId, setExpandedJobId] = React.useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = React.useState<string | null>(null);
  const [followUpStyle, setFollowUpStyle] = React.useState<'polite' | 'cute' | 'urgent'>('polite');

  const unpaidJobs = React.useMemo<Job[]>(() => {
    return jobs.flatMap((job) => {
      const pendingEntries = getJobPendingEntries(job);
      const outstandingAmount = getOutstandingAmount(job);
      if (outstandingAmount <= 0) return [];

      // A workflow status can be edited independently from the money received. The quick-pay
      // list therefore follows the real outstanding entries, including installments in future
      // months, and only uses the nearest unpaid due date for sorting/display.
      const nextDueDate = pendingEntries
        .map((entry) => entry.dueDate)
        .filter((date): date is string => Boolean(date))
        .sort()[0];

      return [{
        ...job,
        pending: outstandingAmount,
        payDate: nextDueDate || job.payDate,
      }];
    });
  }, [jobs]);

  const filteredUnpaidJobs = React.useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) {
      return unpaidJobs
        .map(j => {
          const rel = getRelativeDaysText(j.payDate || j.postDate);
          return {
            ...j,
            daysText: rel.text,
            isOverdue: rel.isOverdue,
            daysCount: rel.daysCount,
          };
        })
        .sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          return a.daysCount - b.daysCount;
        });
    }
    return unpaidJobs
      .filter(j => 
        j.name.toLowerCase().includes(q) || 
        (j.client && j.client.toLowerCase().includes(q))
      )
      .map(j => {
        const rel = getRelativeDaysText(j.payDate || j.postDate);
        return {
          ...j,
          daysText: rel.text,
          isOverdue: rel.isOverdue,
          daysCount: rel.daysCount,
        };
      });
  }, [unpaidJobs, quickSearch]);

  // Calculations for Credit Term tracking dashboard
  const creditStats = React.useMemo(() => {
    let totalUnpaid = 0;
    let totalOverdue = 0;
    let totalDueSoon = 0;
    let totalOnTrack = 0;

    let overdueCount = 0;
    let dueSoonCount = 0;
    let onTrackCount = 0;

    const mapped = unpaidJobs.map(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      const isOverdue = rel.isOverdue;
      const isDueSoon = !isOverdue && rel.daysCount >= 0 && rel.daysCount <= 7;
      const isOnTrack = !isOverdue && !isDueSoon;

      totalUnpaid += j.pending;
      if (isOverdue) {
        totalOverdue += j.pending;
        overdueCount++;
      } else if (isDueSoon) {
        totalDueSoon += j.pending;
        dueSoonCount++;
      } else {
        totalOnTrack += j.pending;
        onTrackCount++;
      }

      return {
        ...j,
        daysText: rel.text,
        isOverdue,
        isDueSoon,
        isOnTrack,
        daysCount: rel.daysCount
      };
    });

    return {
      mapped,
      totalUnpaid,
      totalOverdue,
      totalDueSoon,
      totalOnTrack,
      overdueCount,
      dueSoonCount,
      onTrackCount,
      totalCount: mapped.length
    };
  }, [unpaidJobs]);

  const filteredUnpaidJobsByTabAndSearch = React.useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    
    // First apply search
    let list = creditStats.mapped;
    if (q) {
      list = list.filter(j => 
        j.name.toLowerCase().includes(q) || 
        (j.client && j.client.toLowerCase().includes(q))
      );
    }

    // Then apply credit term status tab filter
    if (creditFilter === 'overdue') {
      list = list.filter(j => j.isOverdue);
    } else if (creditFilter === 'dueSoon') {
      list = list.filter(j => j.isDueSoon);
    } else if (creditFilter === 'onTrack') {
      list = list.filter(j => j.isOnTrack);
    }

    // Sort: overdue first, then by daysCount ascending
    return list.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysCount - b.daysCount;
    });
  }, [creditStats, quickSearch, creditFilter]);

  const generateFollowUpMessage = (j: any, style: 'polite' | 'cute' | 'urgent') => {
    const clientName = j.client || 'คุณลูกค้า';
    const projectName = j.name;
    const valueStr = formatCurrency(j.pending);
    const dateStr = safeFormatThaiDate(j.payDate || j.postDate);
    const creditStr = j.creditTerm ? `${j.creditTerm} วัน` : 'ไม่ระบุ';

    if (style === 'polite') {
      return `เรียน คุณลูกค้า/ผู้ติดต่อจากแบรนด์ ${clientName}\n\n` +
             `ขออนุญาตติดตามสถานะและการดำเนินการตั้งเบิกสำหรับโปรเจกต์ "${projectName}" ` +
             `ซึ่งมียอดค้างชำระจำนวน ${valueStr} บาท (กำหนดชำระเมื่อวันที่ ${dateStr} ตามเงื่อนไขเครดิตเทอม ${creditStr} ครับ)\n\n` +
             `หากท่านได้ทำการโอนชำระเงินเข้ามาแล้ว หรือหากต้องการเอกสาร/ใบเสร็จเพิ่มเติมประการใด ` +
             `สามารถแจ้งกระผมทราบได้ทันทีนะครับ ขอบพระคุณสำหรับความร่วมมือและขออภัยที่ส่งข้อความมาติดตามครับ 🙏💼\n\n` +
             `ขอแสดงความนับถือ,\n[ชื่อของคุณ]`;
    } else if (style === 'cute') {
      return `สวัสดีค่าแบรนด์ ${clientName} ที่น่ารัก 🐿️💖\n\n` +
             `วันนี้นัททิเจ้ากระรอกน้อย ขออนุญาตแวะมาสะกิดติดตามเรื่องคลังเสบียงของโปรเจกต์ "${projectName}" น้าค้า ` +
             `มียอดค้างโอนอยู่จำนวน ${valueStr} บาท (เลยกำหนดกำหนดส่งมอบและเครดิตเทอมวันที่ ${dateStr} แย้วงับ 🥺)\n\n` +
             `คุณลูกค้าโอนเข้าโพรงไม้เรียบร้อยแล้วแจ้งนัททิได้น้า หรือถ้าติดขั้นตอนตรงไหนปรึกษาบอกได้เลยงับ! ` +
             `ขอขอบพระคุณที่น่ารักและคอยดูแลนัททิตลอดมาน้าค้า รักเลยยยย 🥜✨`;
    } else {
      return `⚠️ [ติดตามด่วน - ยอดเลยกำหนดชำระเครดิตเทอม]\n\n` +
             `เรียน ฝ่ายบัญชี/ผู้ดูแลแบรนด์ ${clientName}\n\n` +
             `อ้างอิงถึงการส่งมอบงานโครงการ "${projectName}" ยอดเงินค้างชำระคงเหลือสุทธิจำนวน ${valueStr} บาท ซึ่งครบกำหนดรับเงินตั้งแต่วันที่ ${dateStr} แล้วนั้น\n\n` +
             `เนื่องจากยอดนี้เลยดีลการชำระเงินตามสัญญามาแล้ว รบกวนช่วยเร่งตรวจสอบกับทางฝ่ายที่เกี่ยวข้อง ` +
             `และขอความกรุณาช่วยแจ้งวันที่ยอดเงินจะเข้าบัญชี หรือส่งหลักฐานการโอนกลับมาที่ช่องทางนี้โดยด่วนที่สุดครับ\n\n` +
             `หากต้องการให้จัดส่งเอกสารใบเสร็จ/ใบกำกับภาษีเพิ่มเติม กรุณาแจ้งให้ทราบทันทีครับ\n\n` +
             `ขอบคุณครับ,\n[ชื่อของคุณ]`;
    }
  };

  const handleCopyMessage = (j: any) => {
    const text = generateFollowUpMessage(j, followUpStyle);
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedJobId(j.id);
        setTimeout(() => setCopiedJobId(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  const handleMarkFollowUp = (j: any) => {
    if (onEditJob) {
      onEditJob(j.id, {
        followUpCount: (j.followUpCount || 0) + 1,
        lastFollowUpDate: new Date().toISOString().split('T')[0]
      });
      
      // Play sound effect
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        }
      } catch (e) {}
    }
  };

  const currentMonthKey = React.useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);
  
  const receivedEntriesForMonth = React.useMemo(
    () => jobs.flatMap(getJobPaymentEntries).filter((entry) => getMonthKeyFromDate(entry.date) === selectedMonthKey),
    [jobs, selectedMonthKey],
  );
  const pendingEntriesForMonth = React.useMemo(
    () => jobs.flatMap((job) => job.isPosted === false ? [] : getJobPendingEntries(job)).filter((entry) => getMonthKeyFromDate(entry.dueDate) === selectedMonthKey),
    [jobs, selectedMonthKey],
  );
  const selectedMonthJobs = React.useMemo(
    () => jobs.filter(j => getMonthKey(j.payDate || j.postDate) === selectedMonthKey || receivedEntriesForMonth.some((entry) => entry.jobId === j.id) || pendingEntriesForMonth.some((entry) => entry.jobId === j.id)),
    [jobs, selectedMonthKey, receivedEntriesForMonth, pendingEntriesForMonth],
  );
  
  // Trust the recorded `received` field as-is -- never assume a "done" job's full value was
  // received when that field is still 0/unset, since that shows phantom income the user never
  // actually got and disagrees with the Timeline tab, which only counts received > 0.
  const totalReceived = receivedEntriesForMonth.reduce((sum, entry) => sum + entry.amount, 0);

  // Trust the recorded `pending` field as-is, the same way totalReceived trusts `received` --
  // don't also gate on isPaid. A properly-saved "done" job already has pending forced to 0
  // (see JobsTab's save/quick-collect handlers), so this isPaid check was always redundant for
  // well-formed data and actively hid money for any job whose paid flag and pending amount had
  // drifted out of sync, disagreeing with the Timeline tab (which never checks isPaid here) and
  // making dashboard money vanish from both totals at once.
  const totalPending = pendingEntriesForMonth.reduce((sum, entry) => sum + entry.amount, 0);

  // Must equal totalReceived + totalPending, not a separately-derived sum -- otherwise it
  // silently drifts from the rest of the app (e.g. the Timeline tab's monthly total), which
  // already nets out WHT and excludes not-yet-posted WIP jobs from the pending side.
  const totalContractVal = totalReceived + totalPending;

  // Ad-hoc variable expenses logged for the selected month (equipment, outsourcing, etc.)
  // -- must be netted out here too, or this stat silently ignores anything logged through
  // the variable-expense tracker and never moves when the user records a new one. Kept as the
  // itemized list (not just the sum) so the "กำไรสุทธิ" breakdown popup can show exactly which
  // records ate into the total, not just a number the user has to take on faith.
  const monthVariableExpenses = React.useMemo(
    () => expenses.filter(e => getMonthKey(e.date) === selectedMonthKey),
    [expenses, selectedMonthKey],
  );
  const variableExpenseThisMonth = monthVariableExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Money moved into savings goals this month via the deposit modal's "deduct from cash"
  // option. Tracked on the goal transaction itself, never as a fake Expense -- a savings
  // transfer isn't a real expense and would wrongly show up in tax/expense reports otherwise.
  const monthGoalDeductions = React.useMemo(
    () => goals.flatMap(g => (g.history || [])
      .filter(tx => tx.type === 'deposit' && tx.deductedFromCash && getMonthKey(tx.date) === selectedMonthKey)
      .map(tx => ({ ...tx, goalName: g.name, goalEmoji: g.emoji }))
    ),
    [goals, selectedMonthKey],
  );
  const goalDeductionsThisMonth = monthGoalDeductions.reduce((sum, tx) => sum + tx.amount, 0);

  const totalCashOutThisMonth = variableExpenseThisMonth + goalDeductionsThisMonth;

  const profit = totalReceived - settings.monthlyExpense - totalCashOutThisMonth;
  // What's actually left in hand right now: money already received minus money already spent
  // on logged variable expenses and cash-funded goal deposits. Deliberately excludes the
  // fixed-expense budget line (that's what `profit` above is for) since fixed bills haven't
  // necessarily left the wallet yet.
  const receivedAfterVariableExpense = Math.max(0, totalReceived - totalCashOutThisMonth);

  // Month-over-month comparison for the hero card
  const prevMonthKey = React.useMemo(() => {
    const [y, m] = selectedMonthKey.split('-').map(Number);
    const d = new Date(y, m - 1 - 1, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, [selectedMonthKey]);

  const prevMonthReceived = React.useMemo(
    () => jobs.flatMap(getJobPaymentEntries).reduce((sum, entry) => getMonthKeyFromDate(entry.date) === prevMonthKey ? sum + entry.amount : sum, 0),
    [jobs, prevMonthKey],
  );

  const receivedChangePct = prevMonthReceived > 0
    ? Math.round(((totalReceived - prevMonthReceived) / prevMonthReceived) * 100)
    : null;

  let alertStatus: 'danger' | 'warning' | 'success' = 'success';
  let alertHeadline = '';
  let alertFullMessage = '';
  const monthName = formatMonthKey(selectedMonthKey);

  if (selectedMonthJobs.length === 0) {
    alertStatus = 'warning';
    alertHeadline = t('dash.noRecordsThisMonth', { month: monthName });
    alertFullMessage = t('dash.noRecordsThisMonthFull', { month: monthName });
  } else if (profit < 0) {
    alertStatus = 'danger';
    alertHeadline = t('dash.crisisHeadline', { amount: formatCurrency(Math.abs(profit)) });
    alertFullMessage = t('dash.crisisFull', {
      month: monthName,
      received: formatCurrency(totalReceived),
      fixed: formatCurrency(settings.monthlyExpense),
      variable: variableExpenseThisMonth > 0 ? t('dash.crisisVariablePart', { amount: formatCurrency(variableExpenseThisMonth) }) : '',
      goal: goalDeductionsThisMonth > 0 ? t('dash.crisisGoalPart', { amount: formatCurrency(goalDeductionsThisMonth) }) : '',
      short: formatCurrency(Math.abs(profit)),
    });
  } else if (profit >= 0 && profit < 5000) {
    alertStatus = 'warning';
    alertHeadline = t('dash.lowHeadline', { month: monthName, amount: formatCurrency(profit) });
    alertFullMessage = t('dash.lowFull', { month: monthName, amount: formatCurrency(profit) });
  } else {
    alertStatus = 'success';
    alertHeadline = t('dash.goodHeadline', { amount: formatCurrency(profit) });
    alertFullMessage = t('dash.goodFull', { month: monthName, amount: formatCurrency(profit) });
  }

  const fixedItemsBase = settings.fixedExpenseItems && settings.fixedExpenseItems.length > 0
    ? settings.fixedExpenseItems
    : (settings.monthlyExpense > 0 ? [{ id: 'legacy-total', name: t('dash.legacyFixedExpenseName'), amount: settings.monthlyExpense }] : []);
  let fixedItemsCumulative = 0;
  const fixedItemsCoverage = fixedItemsBase.map(item => {
    fixedItemsCumulative += item.amount;
    return { ...item, covered: totalReceived >= fixedItemsCumulative };
  });
  const fixedItemsCoveredCount = fixedItemsCoverage.filter(i => i.covered).length;

  const playHapticAndSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(329.63, now);
        osc2.frequency.exponentialRampToValueAtTime(523.25, now + 0.15);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.25);
        osc2.stop(now + 0.25);
      }
    } catch (e) {
      console.log("Audio feedback error", e);
    }
    if (navigator.vibrate) {
      navigator.vibrate([40, 30, 40]);
    }
  };

  const projectedMonthsData = React.useMemo(() => {
    const forecastMonthsList = getForecastMonths();
    const totals = new Map(forecastMonthsList.map(monthKey => [monthKey, {
      confirmed: 0,
      pending: 0,
      variableExpense: 0,
    }]));

    jobs.forEach(j => {
      getJobPaymentEntries(j).forEach((entry) => {
        const month = totals.get(getMonthKeyFromDate(entry.date));
        if (month) month.confirmed += entry.amount;
      });
      if (j.isPosted !== false) getJobPendingEntries(j).forEach((entry) => {
        const month = totals.get(getMonthKeyFromDate(entry.dueDate));
        if (month) month.pending += entry.amount;
      });
    });
    expenses.forEach(e => {
      const month = totals.get(getMonthKey(e.date));
      if (month) month.variableExpense += e.amount;
    });

    return forecastMonthsList.map(monthKey => {
      const month = totals.get(monthKey)!;
      const totalIncome = month.confirmed + month.pending;
      const totalExpense = settings.monthlyExpense + month.variableExpense;
      return {
        monthKey,
        totalIncome,
        totalExpense,
        isSufficient: totalIncome >= totalExpense,
        balance: totalIncome - totalExpense,
      };
    });
  }, [jobs, expenses, settings.monthlyExpense]);

  const upcomingPayments = React.useMemo(() => jobs
    .filter(j => j.pending > 0 && j.isPosted !== false)
    .map(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      return {
        ...j,
        daysText: rel.text,
        isOverdue: rel.isOverdue,
        daysCount: rel.daysCount,
      };
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysCount - b.daysCount;
    })
    .slice(0, 4), [jobs]);

  const dashboardName = userEmail.split('@')[0] || 'คุณ';

  return (
    <div id="dashboard-top" className="draft10-dashboard text-brand-text">
      <div className="draft10-dashboard-topbar">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input
            value={quickSearch}
            onChange={(event) => setQuickSearch(event.target.value)}
            placeholder="ค้นหางาน ลูกค้า หรือเอกสาร..."
            className="h-11 w-full rounded-xl border border-brand-border bg-brand-white pl-11 pr-4 text-sm outline-none transition-colors focus:border-[#F46A2A]/50"
          />
        </div>
        <Bell className="h-5 w-5 text-brand-muted" />
        <button type="button" onClick={() => onQuickRecord?.('income')} className="draft10-primary-button">
          <Plus className="h-4 w-4" /> เพิ่มงาน
        </button>
      </div>

      <section className="draft10-dashboard-greeting">
        <Mascot mood="wave" size={48} />
        <div>
          <h1>สวัสดีครับ {dashboardName}</h1>
          <p>ตอนนี้มี {upcomingPayments.length} รายการที่ต้องติดตาม และมีเงินรอรับ {formatCurrency(totalPending)}</p>
        </div>
      </section>

      <section className="draft10-kpi-grid">
        <button type="button" onClick={() => setBreakdownFilter('received')}>
          <span>รับเงินจริงเดือนนี้</span>
          <strong>{formatCurrency(totalReceived)}</strong>
        </button>
        <button type="button" onClick={() => setBreakdownFilter('pending')} className="is-pending">
          <span>รอรับเงิน</span>
          <strong>{formatCurrency(totalPending)}</strong>
        </button>
        <button type="button" onClick={() => onQuickRecord?.('expense')}>
          <span>รายจ่ายเดือนนี้</span>
          <strong>{formatCurrency(settings.monthlyExpense + totalCashOutThisMonth)}</strong>
        </button>
        <button type="button" onClick={() => setBreakdownFilter('profit')} className="is-profit">
          <span>กำไรสุทธิ</span>
          <strong>{formatCurrency(profit)}</strong>
          <small><TrendingUp className="h-3.5 w-3.5" /> ภาพรวมเดือนนี้</small>
        </button>
      </section>

      <p className="draft10-kpi-note">{jobs.length} งานทั้งหมด · {creditTermReport.overdue.length} รายการเกินกำหนด</p>

      <section className="draft10-quick-grid" aria-label="ทางลัด">
        <button type="button" className="is-active" onClick={() => onSwitchTab('jobs')}><Coins />รับเงินด่วน</button>
        <button type="button" onClick={() => onQuickRecord?.('income')}><TrendingUp />เพิ่มรายรับ</button>
        <button type="button" onClick={() => onSwitchTab('invoice')}><FileText />ออกเอกสาร</button>
        <button type="button" onClick={() => onSwitchTab('jobs')}><span className="draft10-more-icon">•••</span>เพิ่มเติม</button>
      </section>

      <section className="draft10-dashboard-main-grid">
        <article className="draft10-chart-card">
          <div className="draft10-card-heading">
            <h2>กระแสเงินสด 12 เดือน</h2>
            <div><span className="legend-bar" />รับเงินจริง <span className="legend-line" />กำไรสุทธิ</div>
          </div>
          <div className="draft10-chart" aria-label="กราฟกระแสเงินสด 12 เดือน">
            {[42,58,35,74,49,66,41,83,55,70,46,62].map((height, index) => <span key={index} style={{height: `${height}%`}} />)}
            <svg viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
              <polyline points="10,185 95,135 180,220 265,88 350,155 435,105 520,175 605,74 690,135 775,55 860,112 990,80" />
            </svg>
          </div>
        </article>

        <aside className="draft10-followup-card">
          <div className="draft10-followup-heading">
            <Mascot mood={upcomingPayments.some(job => job.isOverdue) ? 'alert' : 'happy'} size={38} />
            <div><h2>เงินที่ต้องติดตาม</h2><p>เรียงจากเร่งด่วนที่สุดก่อน</p></div>
          </div>
          <div className="draft10-followup-list">
            {upcomingPayments.length ? upcomingPayments.map((job) => (
              <button key={job.id} type="button" onClick={() => onViewJob?.(job.id)} className={job.isOverdue ? 'is-overdue' : job.daysCount <= 3 ? 'is-soon' : ''}>
                <div><strong>{job.name}</strong><span>{job.client}{job.creditTerm ? ` · Credit ${job.creditTerm} วัน` : ''}</span><em>{job.daysText}</em></div>
                <b>{formatCurrency(job.pending)}</b>
              </button>
            )) : <div className="draft10-empty-followup"><Mascot mood="happy" size={54} /><p>ยังไม่มีเงินที่ต้องติดตาม</p></div>}
          </div>
        </aside>
      </section>

      <section className="draft10-dashboard-bottom-grid">
        <article className="draft10-bottom-card">
          <div className="draft10-bottom-heading"><h2>รายการล่าสุด</h2><button type="button" onClick={() => onSwitchTab('jobs')}>ดูทั้งหมด →</button></div>
          <div className="draft10-recent-list">
            {jobs.slice(0, 3).map((job) => (
              <button key={job.id} type="button" onClick={() => onViewJob?.(job.id)}>
                <div><strong>{job.name}</strong><span>{job.client}</span></div>
                <b>{formatCurrency(job.value)}</b>
              </button>
            ))}
          </div>
        </article>
        <article className="draft10-bottom-card">
          <div className="draft10-bottom-heading"><h2>ปฏิทินการเงิน</h2><CalendarDays className="h-4 w-4 text-brand-muted" /></div>
          <div className="draft10-mini-calendar">
            {['อา','จ','อ','พ','พฤ','ศ','ส'].map(day => <span key={day} className="is-day">{day}</span>)}
            {Array.from({length: 14}, (_, index) => index + 1).map(day => (
              <button key={day} type="button" className={day === 3 || day === 9 ? 'has-event' : ''}>{day}</button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

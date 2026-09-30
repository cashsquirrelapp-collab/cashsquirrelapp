import React from 'react';
import { createPortal } from 'react-dom';
import { Job, Goal, AppSettings, StatusOption, NotifSettings, Expense } from '../../../../shared/types';
import { formatCurrency, formatMonthKey, getRelativeDaysText, getMonthKey, safeFormatThaiDate } from '../../utils';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { MonthlyWorkValueBanner } from './MonthlyWorkValueBanner';
import { Mascot } from '../../components/mascot/Mascot';
import { IconArrowUpRight } from '../../components/ui/icons';
import { VineDivider } from '../../components/mascot/VineDivider';
import { useLanguage } from '../../i18n/LanguageContext';
import { getJobPaymentEntries, getJobPendingEntries, getMonthKeyFromDate, getOutstandingAmount } from '../../../../shared/installmentPayments';
import { fixedExpenseForMonth, workValueRowsForMonth } from '../../../../shared/monthlySummary';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Clock, 
  ChevronRight, 
  Search,
  Check,
  Copy,
  MessageSquare,
  Flame,
  Bell,
  Mail,
  Send,
  PiggyBank,
  CalendarDays
} from 'lucide-react';

interface DashboardTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  expenses: Expense[];
  onUpdateSettings?: (settings: AppSettings) => void;
  onSwitchTab: (tabId: string) => void;
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

export default function DashboardTab({
  jobs,
  goals,
  settings,
  expenses,
  onUpdateSettings,
  onSwitchTab,
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
  // Which hero-card figure's job breakdown is currently open ('contract' | 'received' | 'pending'),
  // or null when closed. Each row in the breakdown links out to the shared JobDetailModal via onViewJob.
  const [breakdownFilter, setBreakdownFilter] = React.useState<'contract' | 'received' | 'pending' | 'profit' | 'expense' | 'workValue' | null>(null);
  const [quickSearch, setQuickSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(3);
  const [isQuickPayExpanded, setIsQuickPayExpanded] = React.useState(false);
  const [isSendingSimulated, setIsSendingSimulated] = React.useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = React.useState(false);

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
  const fixedExpenseThisMonth = fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, monthVariableExpenses.map(e => e.name));

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

  // Savings-goal transfers are an allocation of what's left, not an expense, so they stay out of
  // profit (matching the 12-month chart and the Split tab) and only reduce cash-in-hand below.
  const profit = totalReceived - fixedExpenseThisMonth - variableExpenseThisMonth;
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

  // The trend line sits under "กำไรสุทธิ", so it compares profit (same formula as `profit`), not received.
  const prevMonthProfit = React.useMemo(() => {
    const prevExpenses = expenses.filter(e => getMonthKey(e.date) === prevMonthKey);
    const prevVariable = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
    return prevMonthReceived - fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, prevExpenses.map(e => e.name)) - prevVariable;
  }, [expenses, prevMonthKey, prevMonthReceived, settings.monthlyExpense, settings.fixedExpenseItems]);
  const profitChangePct = prevMonthProfit > 0
    ? Math.round(((profit - prevMonthProfit) / prevMonthProfit) * 100)
    : null;

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

  const recentActivity = React.useMemo(() => {
    const paymentEvents = jobs.flatMap(j => getJobPaymentEntries(j).map(entry => ({
      key: entry.id,
      date: entry.date || '',
      label: `รับเงิน ${entry.client || entry.jobName}`,
      sub: 'เงินเข้า',
      amount: `+${formatCurrency(entry.amount)}`,
      isIncome: true,
    })));
    const expenseEvents = expenses.map(e => ({
      key: e.id,
      date: e.date,
      label: e.name,
      sub: 'รายจ่าย',
      amount: `-${formatCurrency(e.amount)}`,
      isIncome: false,
    }));
    return [...paymentEvents, ...expenseEvents]
      .filter(ev => ev.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [jobs, expenses]);

  const currentMonthKeyForCalendar = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const miniCalendarDays = React.useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const todayKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dayColor = new Map<string, { bg: string; color: string }>();
    jobs.forEach(j => {
      const dueDate = j.payDate || j.dueDate;
      if (dueDate && j.isPosted !== false) {
        const key = dueDate.slice(0, 10);
        const isPaid = j.pending <= 0;
        const isOverdue = !isPaid && key < todayKey;
        const isDueSoon = !isPaid && !isOverdue && key <= todayKey.slice(0, 8) + String(now.getDate() + 7).padStart(2, '0');
        dayColor.set(key, isPaid
          ? { bg: '#E9F8F1', color: '#18A66A' }
          : isOverdue
          ? { bg: '#FFF0F0', color: '#C43A3A' }
          : isDueSoon
          ? { bg: '#FAEEDA', color: '#8A5A0B' }
          : { bg: 'transparent', color: 'inherit' });
      }
    });

    const cells: { n: number | null; bg: string; color: string }[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ n: null, bg: 'transparent', color: 'inherit' });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = key === todayKey;
      const style = dayColor.get(key);
      cells.push(isToday
        ? { n: d, bg: '#E65F2B', color: '#ffffff' }
        : { n: d, ...(style || { bg: 'transparent', color: 'inherit' }) });
    }
    return cells;
  }, [jobs]);

  return (
    <div id="dashboard-top" className="dashboard-shell flex flex-col gap-6 scroll-mt-6 text-brand-text">
      
      {/* 1. Greeting + KPI cards -- share order-1 so this block never collides with the
          pre-existing Alert Zone below, which already owns order-2. */}
      <div className="order-1 flex flex-col gap-5">
      <MonthlyWorkValueBanner jobs={jobs} monthKey={selectedMonthKey} onOpenDetails={() => setBreakdownFilter('workValue')} />

      <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setBreakdownFilter('received')}
          className="flex flex-col items-start justify-start rounded-[14px] border border-brand-border bg-brand-white p-[18px] text-left cursor-pointer"
        >
          <p className="text-xs text-brand-muted">รับเงินจริงเดือนนี้</p>
          <p className="mt-1 text-xl leading-7 font-semibold font-mono text-brand-text">{formatCurrency(totalReceived)}</p>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFilter('pending')}
          className="flex flex-col items-start justify-start rounded-[14px] border border-brand-border bg-brand-white p-[18px] text-left cursor-pointer"
        >
          <p className="text-xs text-brand-muted">รอรับเงิน</p>
          <p className="mt-1 text-xl leading-7 font-semibold font-mono text-[#E65F2B]">{formatCurrency(totalPending)}</p>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFilter('expense')}
          className="flex flex-col items-start justify-start rounded-[14px] border border-brand-border bg-brand-white p-[18px] text-left cursor-pointer"
        >
          <p className="text-xs text-brand-muted">รายจ่ายเดือนนี้</p>
          <p className="mt-1 text-xl leading-7 font-semibold font-mono text-brand-text">{formatCurrency(fixedExpenseThisMonth + variableExpenseThisMonth)}</p>
        </button>
        <button
          type="button"
          onClick={() => setBreakdownFilter('profit')}
          className="flex flex-col items-start justify-start rounded-[14px] border border-brand-border bg-brand-white p-[18px] text-left cursor-pointer"
        >
          <p className="text-xs text-brand-muted">กำไรสุทธิ</p>
          <p className={`mt-1 text-[22px] leading-7 font-bold font-mono ${profit >= 0 ? 'text-[#18A66A]' : 'text-rose-600'}`}>{formatCurrency(profit)}</p>
          {profitChangePct !== null && (
            <p className={`mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium ${profitChangePct >= 0 ? 'text-[#18A66A]' : 'text-rose-500'}`}>
              {profitChangePct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {profitChangePct >= 0 ? '↑ ' : '↓ '}{Math.abs(profitChangePct)}% จากเดือนก่อน
            </p>
          )}
        </button>
      </div>
      <p className="mt-[10px] text-[11px] text-brand-muted">{jobs.length} งานทั้งหมด · {jobs.filter(j => j.pending > 0 && getRelativeDaysText(j.payDate || j.postDate).isOverdue).length} รายการเกินกำหนด</p>
      </div>
      </div>

      {/* Shortcuts deliberately reuse existing routes/record modes; no separate state or API. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.1 }}
        aria-label="ทางลัด"
        className="order-3 relative -mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        <button
          type="button"
          onClick={() => setIsQuickPayExpanded(true)}
          className="flex items-center gap-2.5 rounded-xl border border-[#F8D6C2] bg-[#FFF1E8] px-3.5 py-3 text-left cursor-pointer"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-white">
            <Coins className="h-4 w-4 text-[#E65F2B]" />
          </span>
          <span className="text-xs font-semibold text-[#E65F2B]">รับเงินด่วน</span>
        </button>
        <button
          type="button"
          onClick={() => onQuickRecord?.('income')}
          className="flex items-center gap-2.5 rounded-xl border border-brand-border bg-brand-white px-3.5 py-3 text-left cursor-pointer"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[#E9F8F1]">
            <TrendingUp className="h-4 w-4 text-[#4E9D78]" />
          </span>
          <span className="text-xs font-medium text-brand-text">เพิ่มรายรับ</span>
        </button>
        <button
          type="button"
          onClick={() => onQuickRecord?.('expense')}
          className="flex items-center gap-2.5 rounded-xl border border-brand-border bg-brand-white px-3.5 py-3 text-left cursor-pointer"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[#FFF0F0]">
            <TrendingDown className="h-4 w-4 text-[#C43A3A]" />
          </span>
          <span className="text-xs font-medium text-brand-text">เพิ่มรายจ่าย</span>
        </button>
        <button
          type="button"
          onClick={() => setIsMoreMenuOpen(v => !v)}
          className="flex items-center gap-2.5 rounded-xl border border-brand-border bg-brand-white px-3.5 py-3 text-left cursor-pointer"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-faint">
            <span className="text-brand-muted">•••</span>
          </span>
          <span className="text-xs font-medium text-brand-text">เพิ่มเติม</span>
        </button>

        {isMoreMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 top-[calc(100%+8px)] z-20 w-52 rounded-2xl border border-brand-border bg-brand-white p-1.5 shadow-lg"
          >
            {[
              { label: 'ออกเอกสาร', icon: IconArrowUpRight, action: () => onSwitchTab('invoice') },
              { label: 'เป้าหมายออม', icon: PiggyBank, action: () => onSwitchTab('split') },
              { label: 'ปฏิทิน', icon: CalendarDays, action: () => onSwitchTab('calendar') },
              { label: 'ลูกค้า', icon: Coins, action: () => onSwitchTab('clients') },
            ].map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                onClick={() => { action(); setIsMoreMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
              >
                <Icon className="h-4 w-4 text-brand-muted" />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </motion.section>

      {/* Income/expense chart next to the receivables watchlist. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.12 }}
        className="order-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]"
      >
        <IncomeExpenseChart jobs={jobs} expenses={expenses} settings={settings} />

        {upcomingPayments.length > 0 && (
          <div className="bg-brand-white border border-brand-border rounded-[14px] p-[18px]">
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#FFF1E8]">
                <Mascot mood="thinking" size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-medium text-brand-text">เงินที่ต้องติดตาม</h4>
                <p className="text-[11px] text-brand-muted">เรียงจากเร่งด่วนที่สุดก่อน</p>
              </div>
              <button
                type="button"
                onClick={() => onSwitchTab('jobs')}
                className="shrink-0 text-[11px] text-brand-muted hover:text-[#E65F2B] cursor-pointer"
              >
                ดูทั้งหมด
              </button>
            </div>
            {upcomingPayments.map(payment => {
              const badge = payment.isOverdue
                ? { bg: '#FFF0F0', text: '#C43A3A', strip: '#E95454', label: `เกินกำหนด ${Math.abs(payment.daysCount)} วัน` }
                : payment.daysCount === 0
                ? { bg: '#FAEEDA', text: '#8A5A0B', strip: '#F2A93B', label: 'ครบกำหนดวันนี้' }
                : payment.daysCount <= 7
                ? { bg: '#FFF1E8', text: '#C24A16', strip: '#E65F2B', label: `อีก ${payment.daysCount} วัน` }
                : { bg: '#F2F3F5', text: '#7D7772', strip: '#D8D4CE', label: 'รอรับปกติ' };
              return (
                <div key={payment.id} className="border-t border-brand-border py-2.5 pl-2.5 first:pt-2.5" style={{ borderLeft: `3px solid ${badge.strip}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-brand-text truncate">{payment.name}</p>
                      <p className="mt-0.5 text-[11px] text-brand-muted truncate">
                        {payment.client || 'ไม่ระบุลูกค้า'} · {payment.daysText}
                      </p>
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-text">
                      {formatCurrency(payment.pending)}
                    </p>
                  </div>
                  <span
                    className="mt-1.5 inline-block rounded-md px-2 py-[3px] text-[10px]"
                    style={{ background: badge.bg, color: badge.text }}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Recent activity + mini financial calendar, matching the mockup's second row below
          the chart/watchlist row. */}
      <div className="order-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="bg-brand-white border border-brand-border rounded-[14px] p-[18px]">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-[13px] font-medium text-brand-text">รายการล่าสุด</h4>
            <button type="button" onClick={() => onSwitchTab('jobs')} className="text-[11px] text-brand-muted hover:text-[#E65F2B] cursor-pointer">
              ดูทั้งหมด →
            </button>
          </div>
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-xs text-brand-muted">ยังไม่มีรายการล่าสุด</p>
          ) : recentActivity.map(ev => (
            <div key={ev.key} className="flex items-center justify-between border-t border-brand-border py-2">
              <div>
                <p className="text-xs text-brand-text">{ev.label}</p>
                <p className="mt-0.5 text-[10px] text-brand-muted">{ev.sub}</p>
              </div>
              <p className={`text-xs font-medium ${ev.isIncome ? 'text-[#18A66A]' : 'text-brand-text'}`}>{ev.amount}</p>
            </div>
          ))}
        </div>

        <div className="bg-brand-white border border-brand-border rounded-[14px] p-[18px]">
          <div className="mb-0.5 flex items-center justify-between">
            <h4 className="text-[13px] font-medium text-brand-text">ปฏิทินการเงิน</h4>
            <CalendarDays className="h-4 w-4 text-brand-muted" />
          </div>
          <p className="mb-2.5 text-[11px] text-brand-muted">{formatMonthKey(currentMonthKeyForCalendar)}</p>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-brand-muted">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(w => <div key={w}>{w}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[11px]">
            {miniCalendarDays.map((cell, i) => (
              <div key={i} className="rounded-md py-1" style={{ background: cell.bg, color: cell.color }}>
                {cell.n ?? ''}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5 text-[9px] text-brand-muted">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#378ADD]" />นัดหมาย</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F36A2D]" />Credit Term</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F2A93B]" />ใกล้ครบ</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#18A66A]" />เงินเข้า</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E95454]" />เกินกำหนด</span>
          </div>
        </div>
      </div>

      <div className="order-8"><VineDivider /></div>

      {/* Quick payment stays out of the overview until the shortcut is used. */}
      {isQuickPayExpanded && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,29,26,0.35)] p-4" onClick={() => setIsQuickPayExpanded(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-pay-title"
            className="flex w-full max-w-md max-h-[85vh] flex-col rounded-2xl border border-brand-border bg-brand-white p-[22px] shadow-[0_12px_32px_rgba(33,29,26,0.18)] dark:bg-stone-900"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <div>
                <h4 id="quick-pay-title" className="text-[15px] font-semibold text-brand-text">{t('dash.quickPayTitle')}</h4>
                <p className="mt-0.5 text-xs text-brand-muted">{t('dash.quickPaySubtitle')}</p>
              </div>
              <button type="button" onClick={() => setIsQuickPayExpanded(false)} aria-label="ปิดหน้าต่างรับเงินด่วน" className="rounded-md p-1 text-brand-muted hover:text-brand-text cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                className="w-full rounded-[10px] border border-brand-border bg-brand-white py-2.5 pl-9 pr-14 text-[13px] text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B] dark:bg-neutral-950"
                placeholder={t('dash.searchPlaceholder')}
              />
              {quickSearch && (
                <button
                  type="button"
                  onClick={() => setQuickSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-brand-muted hover:text-brand-text cursor-pointer"
                >
                  {t('dash.clear')}
                </button>
              )}
            </div>

            {creditTermReport.overdue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  playHapticAndSound();
                  setIsQuickPayExpanded(false);
                  onSwitchTab('receivables');
                }}
                className="mb-3 flex w-full items-center gap-2.5 rounded-[10px] bg-[#FFF0F0] px-3 py-2 text-left text-xs text-[#C43A3A] transition-colors hover:bg-[#FFE6E6] dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 cursor-pointer"
              >
                <Mascot mood="alert" size={24} />
                <span className="flex-1">{t('dash.overdueAlert')}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}

            <p className="mb-2 text-xs text-brand-muted">รับเงินจากงานไหน?</p>
            <div className="-mx-1 flex-1 space-y-2 overflow-y-auto px-1">
              {filteredUnpaidJobs.slice(0, visibleCount).map((j: any) => {
                const isOverdue = j.isOverdue;
                return (
                  <div key={j.id} className="flex flex-col gap-2 rounded-[10px] border border-brand-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[13px] font-medium text-brand-text">{j.name}</p>
                        {isOverdue && (
                          <span className="shrink-0 rounded-md bg-[#FFF0F0] px-1.5 py-px text-[10px] text-[#C43A3A] dark:bg-rose-950/40 dark:text-rose-300">{t('dash.overdueTag')}</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-brand-muted">
                        {j.client || t('dash.noClientSpecified')}
                        <span className={isOverdue ? 'text-[#C43A3A] dark:text-rose-300' : ''}> · {j.daysText || t('dash.noDateSpecified')}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2.5 sm:justify-end">
                      <span className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(j.pending)}</span>
                      {j.installments?.length ? (
                        <button
                          type="button"
                          onClick={() => onViewJob?.(j.id)}
                          className="rounded-lg border border-[#E65F2B] px-2.5 py-1.5 text-[11px] font-medium text-[#E65F2B] transition-colors hover:bg-[#FFF1E8] cursor-pointer"
                        >
                          รับเงินรายงวด
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const today = new Date();
                            const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            triggerConfirm(
                              t('dash.confirmFullPaymentTitle'),
                              t('dash.confirmFullPaymentBody', { amount: formatCurrency(j.pending), name: j.name }),
                              () => {
                                if (onEditJob) {
                                  onEditJob(j.id, {
                                    status: 'done',
                                    received: j.value - Math.round(j.value * ((j.whtRate || 0) / 100)),
                                    pending: 0,
                                    paymentStatus: 'paid',
                                    payDate: localDateStr,
                                    // The quick list includes undelivered WIP jobs too; paying one
                                    // must also mark it delivered, like the same action in JobsTab.
                                    isPosted: true
                                  });
                                }
                              }
                            );
                          }}
                          className="rounded-lg bg-[#E65F2B] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#D85723] cursor-pointer"
                        >
                          {t('dash.fullyPaidButton')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredUnpaidJobs.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-brand-border py-8 text-xs text-brand-muted">
                  <Mascot mood="happy" size={36} />
                  <span>{t('dash.noUnpaidDeals')}</span>
                </div>
              )}
            </div>

            {filteredUnpaidJobs.length > 0 && (
              <div className="mt-3.5 flex flex-col items-stretch gap-2 sm:flex-row">
                {filteredUnpaidJobs.length > visibleCount ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(prev => prev + 3)}
                    className="flex-1 rounded-[10px] bg-brand-faint px-4 py-2.5 text-xs font-medium text-brand-text transition-colors hover:bg-brand-border/40 cursor-pointer"
                  >
                    {t('dash.showMore', { count: filteredUnpaidJobs.length - visibleCount, remaining: unpaidJobs.length - visibleCount })}
                  </button>
                ) : visibleCount > 3 ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(3)}
                    className="flex-1 rounded-[10px] bg-brand-faint px-4 py-2.5 text-xs font-medium text-brand-text transition-colors hover:bg-brand-border/40 cursor-pointer"
                  >
                    {t('dash.collapseList')}
                  </button>
                ) : (
                  <div className="hidden flex-1 sm:block" />
                )}
                <button
                  type="button"
                  onClick={() => onSwitchTab('jobs')}
                  className="flex items-center justify-center gap-1 rounded-[10px] border border-brand-border px-4 py-2.5 text-xs font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
                >
                  {t('dash.manageAllDeals')}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Breakdown popup: which jobs (or, for "กำไรสุทธิ", which deductions) make up the clicked
          hero-card figure */}
      {breakdownFilter && (() => {
          const breakdownJobs =
            breakdownFilter === 'contract' ? selectedMonthJobs :
            breakdownFilter === 'received' ? selectedMonthJobs.filter(j => receivedEntriesForMonth.some((entry) => entry.jobId === j.id)) :
            breakdownFilter === 'pending' ? selectedMonthJobs.filter(j => j.isPosted !== false && j.pending > 0) :
            [];
          const breakdownItems = breakdownFilter === 'received'
            ? receivedEntriesForMonth.map((entry) => ({ id: entry.id, jobId: entry.jobId, name: entry.jobName, client: entry.client, detail: entry.kind === 'installment' ? entry.label : '', amount: entry.amount }))
            : breakdownFilter === 'pending'
            ? pendingEntriesForMonth.map((entry) => ({ id: entry.id, jobId: entry.jobId, name: entry.jobName, client: entry.client, detail: entry.kind === 'installment' ? entry.label : '', amount: entry.amount }))
            : breakdownJobs.map((job) => ({ id: job.id, jobId: job.id, name: job.name, client: job.client, detail: '', amount: job.value }));
          const loggedExpenseNames = new Set(monthVariableExpenses.map(e => e.name.trim().toLowerCase()));
          const fixedRows = settings.fixedExpenseItems && settings.fixedExpenseItems.length > 0
            ? settings.fixedExpenseItems.map(item => ({ id: item.id, name: item.name, amount: item.amount, covered: loggedExpenseNames.has(item.name.trim().toLowerCase()) }))
            : settings.monthlyExpense > 0 ? [{ id: 'legacy-total', name: 'ค่าใช้จ่ายคงที่รายเดือน', amount: settings.monthlyExpense, covered: false }] : [];
          const workRows = breakdownFilter === 'workValue' ? workValueRowsForMonth(jobs, selectedMonthKey) : [];
          const workTotals = workRows.reduce((acc, row) => ({
            value: acc.value + row.value, received: acc.received + row.received, pending: acc.pending + row.pending,
            otherMonths: acc.otherMonths + row.otherMonths, wht: acc.wht + row.wht, grossValue: acc.grossValue + row.grossValue,
          }), { value: 0, received: 0, pending: 0, otherMonths: 0, wht: 0, grossValue: 0 });
          const summaryRow = (label: string, amount: number, tone = 'text-brand-text dark:text-white', sign = '') => (
            <div className="flex justify-between gap-3">
              <span className="text-brand-muted">{label}</span>
              <span className={`font-mono font-bold ${tone}`}>{sign}{formatCurrency(amount)}</span>
            </div>
          );
          return createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50" onClick={() => setBreakdownFilter(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 relative max-h-[80vh] flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => setBreakdownFilter(null)}
                  className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div>
                  <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                    {breakdownFilter === 'contract' && t('dash.breakdownAllJobsTitle', { month: formatMonthKey(selectedMonthKey) })}
                    {breakdownFilter === 'received' && t('dash.breakdownReceivedTitle')}
                    {breakdownFilter === 'pending' && t('dash.breakdownPendingTitle')}
                    {breakdownFilter === 'profit' && t('dash.breakdownProfitTitle')}
                    {breakdownFilter === 'expense' && 'รายจ่ายเดือนนี้มาจากอะไรบ้าง'}
                    {breakdownFilter === 'workValue' && 'มูลค่างานเดือนนี้มาจากงานไหนบ้าง'}
                  </h3>
                  {breakdownFilter === 'expense' && (
                    <p className="text-xs text-brand-muted mt-0.5">{formatCurrency(fixedExpenseThisMonth + variableExpenseThisMonth)}</p>
                  )}
                  {breakdownFilter === 'workValue' && (
                    <p className="text-xs text-brand-muted mt-0.5">{formatCurrency(workTotals.value)} จาก {workRows.length} งาน (หลังหัก ณ ที่จ่าย)</p>
                  )}
                  {(breakdownFilter === 'contract' || breakdownFilter === 'received' || breakdownFilter === 'pending') && (
                    <p className="text-xs text-brand-muted mt-0.5">
                      {breakdownFilter === 'contract' && formatCurrency(totalContractVal)}
                      {breakdownFilter === 'received' && formatCurrency(totalReceived)}
                      {breakdownFilter === 'pending' && formatCurrency(totalPending)}
                      {t('dash.breakdownTotalFrom', { count: breakdownItems.length })}
                    </p>
                  )}
                </div>

                {breakdownFilter === 'expense' ? (
                  <div className="overflow-y-auto space-y-3 -mx-1 px-1">
                    <div className="space-y-1.5 p-3 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                      {summaryRow('ค่าใช้จ่ายคงที่รายเดือน', fixedExpenseThisMonth)}
                      {summaryRow(`รายจ่ายที่บันทึก (${monthVariableExpenses.length} รายการ)`, variableExpenseThisMonth, 'text-brand-text dark:text-white', '+ ')}
                      <div className="h-px bg-brand-border/50 dark:bg-neutral-700 my-1" />
                      <div className="flex justify-between gap-3">
                        <span className="font-bold text-brand-text dark:text-white">= รายจ่ายเดือนนี้</span>
                        <span className="font-mono font-black text-brand-text dark:text-white">{formatCurrency(fixedExpenseThisMonth + variableExpenseThisMonth)}</span>
                      </div>
                    </div>

                    {fixedRows.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">ค่าใช้จ่ายคงที่</p>
                        <div className="space-y-1.5">
                          {fixedRows.map(item => (
                            <div key={item.id} className="flex items-center justify-between gap-2 p-2.5 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                              <div className="min-w-0">
                                <p className={`truncate ${item.covered ? 'text-brand-muted' : 'text-brand-text dark:text-white'}`}>{item.name}</p>
                                {item.covered && <p className="text-[10px] text-brand-muted">บันทึกจ่ายเดือนนี้แล้ว นับจากรายการที่บันทึกด้านล่าง</p>}
                              </div>
                              <span className={`font-mono font-bold shrink-0 ${item.covered ? 'text-brand-muted line-through' : 'text-brand-text dark:text-white'}`}>{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">รายจ่ายที่บันทึกเดือนนี้</p>
                      {monthVariableExpenses.length > 0 ? (
                        <div className="space-y-1.5">
                          {monthVariableExpenses.map(e => (
                            <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                              <div className="min-w-0">
                                <p className="text-brand-text dark:text-white truncate">{e.name}</p>
                                <p className="text-[10px] text-brand-muted">{safeFormatThaiDate(e.date)}</p>
                              </div>
                              <span className="font-mono font-bold text-brand-text dark:text-white shrink-0">{formatCurrency(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="py-3 text-center text-xs text-brand-muted">ยังไม่มีรายจ่ายที่บันทึกในเดือนนี้</p>
                      )}
                    </div>
                  </div>
                ) : breakdownFilter === 'workValue' ? (
                  <div className="overflow-y-auto space-y-3 -mx-1 px-1">
                    <div className="space-y-1.5 p-3 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                      {summaryRow('รับแล้วเดือนนี้', workTotals.received)}
                      {summaryRow('รอรับเดือนนี้', workTotals.pending, 'text-brand-text dark:text-white', '+ ')}
                      {workTotals.otherMonths !== 0 && summaryRow('รับก่อนหน้า / ครบกำหนดเดือนอื่น', workTotals.otherMonths, 'text-brand-text dark:text-white', '+ ')}
                      <div className="h-px bg-brand-border/50 dark:bg-neutral-700 my-1" />
                      <div className="flex justify-between gap-3">
                        <span className="font-bold text-brand-text dark:text-white">= มูลค่างานเดือนนี้</span>
                        <span className="font-mono font-black text-brand-text dark:text-white">{formatCurrency(workTotals.value)}</span>
                      </div>
                      {workTotals.wht > 0 && (
                        <p className="pt-1 text-[11px] text-brand-muted">หัก ณ ที่จ่ายให้แล้ว {formatCurrency(workTotals.wht)} (ก่อนหัก {formatCurrency(workTotals.grossValue)})</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {workRows.map(row => {
                        const parts = [
                          row.received > 0 ? `รับแล้ว ${formatCurrency(row.received)}` : '',
                          row.pending > 0 ? `รอรับ ${formatCurrency(row.pending)}` : '',
                          row.otherMonths !== 0 ? `เดือนอื่น ${formatCurrency(row.otherMonths)}` : '',
                          row.wht > 0 ? `หัก ณ ที่จ่าย ${formatCurrency(row.wht)}` : '',
                        ].filter(Boolean).join(' · ');
                        return (
                          <button
                            key={row.jobId}
                            type="button"
                            onClick={() => { setBreakdownFilter(null); onViewJob?.(row.jobId); }}
                            className="w-full flex items-center justify-between gap-2 p-3 bg-brand-faint/60 hover:bg-brand-faint dark:bg-neutral-800/60 dark:hover:bg-neutral-800 rounded-xl text-left transition-all cursor-pointer"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-brand-text dark:text-white truncate">{row.name}</p>
                              <p className="text-[10px] text-brand-muted truncate">{row.client || t('dash.noClientListed')}</p>
                              {parts && <p className="text-[10px] text-brand-muted">{parts}</p>}
                            </div>
                            <span className="text-xs font-mono font-black text-brand-text dark:text-white shrink-0">{formatCurrency(row.value)}</span>
                          </button>
                        );
                      })}
                      {workRows.length === 0 && (
                        <p className="text-xs text-brand-muted text-center py-6">ยังไม่มีงานที่มีเงินเข้าหรือครบกำหนดในเดือนนี้</p>
                      )}
                    </div>
                  </div>
                ) : breakdownFilter === 'profit' ? (
                  <div className="overflow-y-auto space-y-3 -mx-1 px-1">
                    {/* Calculation steps */}
                    <div className="space-y-1.5 p-3 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownReceivedRow')}</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(totalReceived)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownFixedExpenseRow')}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(fixedExpenseThisMonth)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownVariableExpenseRow', { count: monthVariableExpenses.length })}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(variableExpenseThisMonth)}</span>
                      </div>
                      <div className="h-px bg-brand-border/50 dark:bg-neutral-700 my-1" />
                      <div className="flex justify-between">
                        <span className="font-bold text-brand-text dark:text-white">{t('dash.breakdownNetProfitRow')}</span>
                        <span className={`font-mono font-black ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
                      {goalDeductionsThisMonth > 0 && (
                        <>
                          <div className="flex justify-between pt-1">
                            <span className="text-brand-muted">{t('dash.breakdownGoalDeductionRow', { count: monthGoalDeductions.length })}</span>
                            <span className="font-mono font-bold text-brand-muted">-{formatCurrency(goalDeductionsThisMonth)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-brand-muted">คงเหลือหลังโอนเข้าเป้าหมายออม</span>
                            <span className="font-mono font-bold text-brand-text dark:text-white">{formatCurrency(profit - goalDeductionsThisMonth)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Itemized variable expenses */}
                    {monthVariableExpenses.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">{t('dash.breakdownVariableExpenseHeader')}</p>
                        <div className="space-y-1.5">
                          {monthVariableExpenses.map(e => (
                            <div key={e.id} className="flex items-center justify-between gap-2 p-2.5 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                              <span className="text-brand-text dark:text-white truncate">{e.name}</span>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">-{formatCurrency(e.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Itemized goal deductions */}
                    {monthGoalDeductions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">{t('dash.breakdownGoalDeductionHeader')}</p>
                        <div className="space-y-1.5">
                          {monthGoalDeductions.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between gap-2 p-2.5 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                              <span className="text-brand-text dark:text-white truncate">{tx.goalEmoji} {tx.goalName}</span>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">-{formatCurrency(tx.amount)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-y-auto space-y-2 -mx-1 px-1">
                    {breakdownItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setBreakdownFilter(null);
                          onViewJob?.(item.jobId);
                        }}
                        className="w-full flex items-center justify-between gap-2 p-3 bg-brand-faint/60 hover:bg-brand-faint dark:bg-neutral-800/60 dark:hover:bg-neutral-800 rounded-xl text-left transition-all cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand-text dark:text-white truncate">{item.name}</p>
                          <p className="text-[10px] text-brand-muted truncate">{item.detail ? `${item.detail} • ` : ''}{item.client || t('dash.noClientListed')}</p>
                        </div>
                        <span className="text-xs font-mono font-black text-brand-text dark:text-white shrink-0">
                          {formatCurrency(item.amount)}
                        </span>
                      </button>
                    ))}

                    {breakdownItems.length === 0 && (
                      <p className="text-xs text-brand-muted text-center py-6">{t('dash.noJobsThisCategory')}</p>
                    )}
                  </div>
                )}
              </motion.div>
            </div>,
            document.body
          );
        })()}

    </div>
  );
}

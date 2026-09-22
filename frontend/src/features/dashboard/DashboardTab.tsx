import React from 'react';
import { Job, Goal, AppSettings, StatusOption, NotifSettings, Expense } from '../../../../shared/types';
import { formatCurrency, getForecastMonths, formatMonthKey, getRelativeDaysText, getMonthKey, safeFormatThaiDate } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconArrowUpRight, IconBolt, IconCoin } from '../../components/ui/icons';
import { VineDivider } from '../../components/mascot/VineDivider';
import { useLanguage } from '../../i18n/LanguageContext';
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
  Calendar,
  Flame,
  Bell,
  ChevronDown,
  ChevronUp,
  Mail,
  AlertCircle,
  Send,
  ReceiptText,
  PiggyBank
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
  const [isRadarExpanded, setIsRadarExpanded] = React.useState(false);
  // Which hero-card figure's job breakdown is currently open ('contract' | 'received' | 'pending'),
  // or null when closed. Each row in the breakdown links out to the shared JobDetailModal via onViewJob.
  const [breakdownFilter, setBreakdownFilter] = React.useState<'contract' | 'received' | 'pending' | 'profit' | null>(null);
  const [quickSearch, setQuickSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(4);
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

  const unpaidJobs = React.useMemo(() => {
    return jobs.filter(j => {
      const isPaid = j.status === 'done' || 
                      j.paymentStatus === 'paid' || 
                      (statuses && statuses.find(s => s.id === j.status)?.behavior === 'done');
      return !isPaid;
    });
  }, [jobs, statuses]);

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
  
  const selectedMonthJobs = React.useMemo(
    () => jobs.filter(j => getMonthKey(j.payDate || j.postDate) === selectedMonthKey),
    [jobs, selectedMonthKey],
  );
  
  // Trust the recorded `received` field as-is -- never assume a "done" job's full value was
  // received when that field is still 0/unset, since that shows phantom income the user never
  // actually got and disagrees with the Timeline tab, which only counts received > 0.
  const totalReceived = selectedMonthJobs.reduce((sum, j) => sum + (j.received || 0), 0);

  // Trust the recorded `pending` field as-is, the same way totalReceived trusts `received` --
  // don't also gate on isPaid. A properly-saved "done" job already has pending forced to 0
  // (see JobsTab's save/quick-collect handlers), so this isPaid check was always redundant for
  // well-formed data and actively hid money for any job whose paid flag and pending amount had
  // drifted out of sync, disagreeing with the Timeline tab (which never checks isPaid here) and
  // making dashboard money vanish from both totals at once.
  const totalPending = selectedMonthJobs.reduce((sum, j) => {
    // WIP jobs (not yet posted/delivered) aren't expected income yet, so they don't count
    // toward the pending-receivable total shown on the dashboard.
    if (j.isPosted === false) return sum;
    return sum + j.pending;
  }, 0);

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
    () => jobs.reduce((sum, j) => getMonthKey(j.payDate || j.postDate) === prevMonthKey
      ? sum + (j.received || 0)
      : sum, 0),
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
      const month = totals.get(getMonthKey(j.payDate || j.postDate));
      if (!month) return;
      if (j.received > 0) month.confirmed += j.received;
      if (j.pending > 0 && j.isPosted !== false) month.pending += j.pending;
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

  const greeting = new Date().getHours() < 12 ? 'สวัสดีตอนเช้า' : new Date().getHours() < 18 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  const summaryCards = [
    {
      label: 'รายรับที่ได้รับ',
      value: totalReceived,
      detail: receivedChangePct === null ? 'เริ่มบันทึกรายรับเพื่อเห็นแนวโน้ม' : `${receivedChangePct >= 0 ? '↑' : '↓'} ${Math.abs(receivedChangePct)}% จากเดือนก่อน`,
      tone: 'income',
      icon: TrendingUp,
    },
    {
      label: 'รายจ่ายเดือนนี้',
      value: totalCashOutThisMonth,
      detail: `${monthVariableExpenses.length} รายการที่บันทึกแล้ว`,
      tone: 'expense',
      icon: TrendingDown,
    },
    {
      label: 'เงินออมสุทธิ',
      value: Math.max(0, profit),
      detail: profit >= 0 ? 'พร้อมตุนไว้สำหรับเป้าหมาย' : `ขาดอีก ${formatCurrency(Math.abs(profit))}`,
      tone: 'saving',
      icon: PiggyBank,
    },
  ];

  return (
    <div id="dashboard-top" className="dashboard-shell space-y-6 scroll-mt-6 text-brand-text">
      
      {/* Dashboard greeting -- keeps the month selector and all existing navigation in App.tsx. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="dashboard-greeting flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="text-sm font-bold text-[#A66A43] dark:text-[#F2B76B]">{greeting} ☀️</p>
          <h2 className="mt-1 text-3xl font-black font-display tracking-tight text-brand-text sm:text-4xl">ยินดีต้อนรับกลับมา!</h2>
          <p className="mt-1 text-sm text-brand-muted">วันนี้ก็เป็นอีกวันที่ดีในการเก็บออม 🌱</p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-border/70 bg-brand-white/80 px-3 py-2 text-xs font-semibold text-brand-muted shadow-sm">
          <Calendar className="h-3.5 w-3.5 text-[#C17817]" />
          {formatMonthKey(selectedMonthKey)}
        </div>
      </motion.div>

      {/* 2. Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.05 }}
        className="dashboard-balance-card relative overflow-hidden rounded-[26px] border border-[#3A2418] p-6 text-white shadow-[0_18px_42px_rgba(67,42,25,0.18)] sm:p-7"
      >
        <div className="dashboard-balance-orb dashboard-balance-orb-one" aria-hidden="true" />
        <div className="dashboard-balance-orb dashboard-balance-orb-two" aria-hidden="true" />
        <div className="relative space-y-5">
          <div className="flex justify-between items-start">
            <button
              type="button"
              onClick={() => setBreakdownFilter('contract')}
              className="text-left cursor-pointer group"
              title={t('dash.contractValueTooltip')}
            >
              <p className="text-xs font-medium text-white/60 tracking-wider uppercase group-hover:text-white/80" title={t('dash.contractValueFullTooltip')}>
                {t('dash.contractValueLabel', { month: formatMonthKey(selectedMonthKey) })}
              </p>
              <h3 className="mt-1.5 text-4xl font-extrabold font-mono tracking-tight text-[#FFD2A7] sm:text-5xl group-hover:underline decoration-2 underline-offset-4">
                {formatCurrency(totalContractVal)}
              </h3>
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white/65">
                <TrendingUp className="h-3.5 w-3.5 text-[#A9E0BC]" />
                {receivedChangePct === null ? 'เริ่มสะสมข้อมูลในเดือนนี้' : `${receivedChangePct >= 0 ? '+' : ''}${receivedChangePct}% จากเดือนที่แล้ว`}
              </p>
            </button>
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.15 }}
              className="dashboard-mascot-float shrink-0 rounded-2xl bg-white/10 p-2 backdrop-blur-sm"
            >
              <Mascot mood={totalReceived > 0 ? 'celebrate' : 'happy'} size={58} />
            </motion.div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => setBreakdownFilter('received')}
              className="text-left cursor-pointer group"
              title={t('dash.receivedTooltip')}
            >
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase flex items-center gap-1.5 group-hover:text-white/80">
                <span>{t('dash.received')}</span>
                {receivedChangePct !== null && receivedChangePct !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-black normal-case ${
                    receivedChangePct > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {receivedChangePct > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {receivedChangePct > 0 ? '+' : ''}{receivedChangePct}%
                  </span>
                )}
              </p>
              <p className="text-lg font-black font-mono text-white mt-0.5 group-hover:underline decoration-2 underline-offset-4">
                {formatCurrency(totalReceived)}
              </p>
              {totalCashOutThisMonth > 0 && (
                <p className="text-[9px] font-bold text-white/50 mt-0.5" title={t('dash.afterExpenseTooltip')}>
                  {t('dash.afterExpense', { amount: formatCurrency(receivedAfterVariableExpense) })}
                </p>
              )}
            </button>
            <button
              type="button"
              onClick={() => setBreakdownFilter('pending')}
              className="text-left cursor-pointer group"
              title={t('dash.pendingTooltip')}
            >
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase group-hover:text-white/80" title={t('dash.pendingSubTooltip')}>
                {t('dash.pending')}
              </p>
              <p className="text-lg font-black font-mono text-white mt-0.5 group-hover:underline decoration-2 underline-offset-4">
                {formatCurrency(totalPending)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setBreakdownFilter('profit')}
              className="text-left cursor-pointer group"
              title={t('dash.netProfitTooltip')}
            >
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase group-hover:text-white/80" title={t('dash.netProfitSubTooltip')}>
                {t('dash.netProfit')}
              </p>
              <p className="text-lg font-black font-mono mt-0.5 text-[#E65F2B] group-hover:underline decoration-2 underline-offset-4">
                {formatCurrency(Math.max(0, profit))}
              </p>
              {profit < 0 && (
                <p className="text-[9px] font-bold text-rose-400 mt-0.5">
                  {t('dash.stillShort', { amount: formatCurrency(Math.abs(profit)) })}
                </p>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Shortcuts deliberately reuse existing routes/record modes; no separate state or API. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.1 }}
        aria-label="ทางลัด"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { label: 'เพิ่มรายรับ', icon: TrendingUp, tone: 'quick-income', action: () => onQuickRecord?.('income') },
          { label: 'เพิ่มรายจ่าย', icon: TrendingDown, tone: 'quick-expense', action: () => onQuickRecord?.('expense') },
          { label: 'เป้าหมายออม', icon: PiggyBank, tone: 'quick-goal', action: () => onSwitchTab('split') },
          { label: 'ดูรายการ', icon: ReceiptText, tone: 'quick-list', action: () => onSwitchTab('jobs') },
        ].map(({ label, icon: Icon, tone, action }) => (
          <button key={label} type="button" onClick={action} className={`dashboard-quick-action ${tone}`}>
            <span className="dashboard-quick-icon"><Icon className="h-5 w-5" /></span>
            <span>{label}</span>
          </button>
        ))}
      </motion.section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="สรุปยอดเดือนนี้">
        {summaryCards.map(({ label, value, detail, tone, icon: Icon }, index) => (
          <motion.button
            type="button"
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 + index * 0.06 }}
            onClick={() => setBreakdownFilter(index === 0 ? 'received' : index === 1 ? 'profit' : 'profit')}
            className={`dashboard-summary-card dashboard-summary-${tone} text-left`}
          >
            <span className="dashboard-summary-icon"><Icon className="h-4 w-4" /></span>
            <span className="mt-4 block text-xs font-bold text-brand-muted">{label}</span>
            <strong className="mt-1 block text-2xl font-black font-mono tracking-tight text-brand-text">{formatCurrency(value)}</strong>
            <span className="mt-2 block text-[11px] font-semibold text-brand-muted">{detail}</span>
          </motion.button>
        ))}
      </section>

      {/* 3. Alert Zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-4 rounded-2xl border border-l-4 bg-brand-white flex flex-col gap-2 transition-all ${
          alertStatus === 'danger'
            ? 'border-brand-border border-l-[#A63F1B]'
            : alertStatus === 'warning'
            ? 'border-brand-border border-l-[#D98324]'
            : 'border-brand-border border-l-[#125442]'
        }`}
      >
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">
              {alertStatus === 'danger' ? (
                <AlertTriangle className="w-5 h-5 text-[#A63F1B] dark:text-[#FA7E52]" />
              ) : alertStatus === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-[#D98324] dark:text-[#F2B76B]" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#125442] dark:text-[#4ade80]" />
              )}
            </div>
            <h4 className="text-xs font-black tracking-tight font-sans text-brand-text">
              {alertHeadline}
            </h4>
          </div>
          <button
            onClick={() => setIsAlertExpanded(!isAlertExpanded)}
            className="text-[10px] font-black underline shrink-0 px-2.5 py-1 rounded-lg text-brand-muted hover:bg-brand-faint transition-colors cursor-pointer"
          >
            {isAlertExpanded ? t('dash.hideDetails') : t('dash.viewDetails')}
          </button>
        </div>

        {isAlertExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-2 border-t border-brand-border/40 text-[11px] leading-relaxed font-medium text-brand-muted"
          >
            {alertFullMessage}

            {fixedItemsCoverage.length > 0 && (
              <div className="mt-3 pt-3 border-t border-brand-border/30 space-y-1.5">
                <p className="text-[10px] font-black text-brand-muted uppercase tracking-wide">
                  {t('dash.fixedExpenseHeader', { amount: formatCurrency(settings.monthlyExpense) })}
                </p>
                {fixedItemsCoverage.map(item => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {item.covered ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#125442] dark:text-[#4ade80] shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-brand-muted shrink-0" />
                      )}
                      <span className={`font-semibold truncate ${item.covered ? 'text-brand-text' : 'text-brand-muted'}`}>
                        {item.name}
                      </span>
                    </div>
                    <span className={`font-mono font-bold shrink-0 ${item.covered ? 'text-brand-text' : 'text-brand-muted'}`}>
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
                <p className="text-[9px] text-brand-muted/80 pt-1">
                  {t('dash.fixedExpenseCoverage', { received: formatCurrency(totalReceived), covered: fixedItemsCoveredCount, total: fixedItemsCoverage.length })}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* 4-Month Cash Flow Projections: กราฟแสดงโพรงไม้แบบใหม่ (Acorn Hollows) */}
      <motion.div layout className="space-y-3 bg-brand-white border border-brand-border rounded-3xl p-4 shadow-sm transition-all">
        <div 
          onClick={() => setIsRadarExpanded(!isRadarExpanded)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <div>
              <h4 className="text-xs font-black tracking-wider text-brand-muted uppercase" title={t('dash.radarTitleTooltip')}>
                {t('dash.radarTitle')}
              </h4>
              <p className="text-[10px] text-brand-muted mt-0.5">
                {isRadarExpanded
                  ? t('dash.radarExpandedSubtitle')
                  : t('dash.radarCollapsedSubtitle', { count: projectedMonthsData.filter(m => m.isSufficient).length })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-brand-muted bg-brand-faint px-2 py-0.5 rounded-full uppercase tracking-wider">
              {isRadarExpanded ? t('dash.radarCollapseButton') : t('dash.radarExpandButton')}
            </span>
          </div>
        </div>

        {isRadarExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-3 border-t border-brand-border/40 space-y-3"
          >
            <div className="flex justify-between items-center text-[10px] text-brand-muted">
              <span>{t('dash.radarFootnote', { amount: formatCurrency(settings.monthlyExpense) })}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {projectedMonthsData.map((m, idx) => {
                const isCurrent = m.monthKey === currentMonthKey;
                const fillPercentage = Math.min(100, (m.totalIncome / Math.max(1, m.totalExpense)) * 100);
                
                return (
                  <motion.div
                    key={m.monthKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-4 rounded-3xl border border-brand-border flex flex-col justify-between space-y-4 transition-all bg-brand-white"
                  >
                    {/* ด้านบนการ์ด: ข้อมูลเดือนและสถานะความอุดมสมบูรณ์ */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-stone-900 dark:text-white">
                            {formatMonthKey(m.monthKey)}
                          </span>
                          {isCurrent && (
                            <span className="text-[8px] bg-brand-text text-brand-bg px-1.5 py-0.2 rounded font-black uppercase">
                              {t('dash.thisSeason')}
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-brand-muted">{t('dash.expectedYield')}</p>
                      </div>

                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-brand-faint border border-brand-border/40">
                        <Mascot mood={m.isSufficient ? "celebrate" : "sleepy"} size={32} />
                      </div>
                    </div>

                    {/* ส่วนกลางการ์ด: ดีไซน์รูปทรงกราฟิกโพรงไม้เก็บลูกนัทโอ๊ค (Acorn Hollows Visual) */}
                    <div className="relative w-full h-20 bg-brand-faint rounded-2xl border border-brand-border flex items-end overflow-hidden">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${fillPercentage}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1 }}
                        className={`w-full transition-all rounded-b-xl ${
                          m.isSufficient ? 'bg-[#E65F2B]' : 'bg-[#A63F1B]'
                        }`}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
                        <span className="text-xs font-mono font-black text-stone-950 dark:text-stone-100">
                          {formatCurrency(m.totalIncome)}
                        </span>
                        <span className="text-[8px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">
                          {t('dash.percentOfNest', { pct: fillPercentage.toFixed(0) })}
                        </span>
                      </div>
                    </div>

                    {/* ด้านล่างการ์ด: ข้อมูลดุลบัญชีเสบียงประจำเดือน */}
                    <div className="pt-2 border-t border-brand-border/40 space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-brand-muted">{t('dash.surplus')}</span>
                        <span className={`font-mono text-xs font-black ${m.isSufficient ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#A63F1B] dark:text-[#FA7E52]'}`}>
                          {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                        </span>
                      </div>
                      {!m.isSufficient && (
                        <p className="text-[9px] text-[#A63F1B] dark:text-[#FA7E52] font-black leading-normal animate-pulse">
                          {t('dash.stillShortSurvive', { amount: formatCurrency(Math.abs(m.balance)) })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 4. Financial Goals Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h4 className="text-xs font-black tracking-widest text-brand-muted uppercase" title={t('dash.savingsGoalsTooltip')}>
              {t('dash.savingsGoalsTitle')}
            </h4>
          </div>
          <button
            onClick={() => onSwitchTab('split')}
            className="text-xs font-black text-[#E65F2B] dark:text-[#FFA473] hover:text-[#D98324] flex items-center gap-0.5"
          >
            {t('dash.goToVault')} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
          {goals.map(g => {
            const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
            return (
              <motion.div
                key={g.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenGoalDetail(g.id)}
                className="w-40 shrink-0 bg-brand-white border border-brand-border rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 shadow-inner overflow-hidden border border-brand-border/40"
                  style={{ backgroundColor: g.bg || 'var(--faint)' }}
                >
                  {g.imageUrl ? (
                    <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : g.emoji ? (
                    g.emoji
                  ) : (
                    <IconCoin className="w-6 h-6 text-[#E65F2B]" />
                  )}
                </div>
                <h5 className="text-sm font-bold text-brand-text truncate">{g.name}</h5>
                <p className="text-[10px] text-brand-muted mt-0.5">
                  {t('dash.accumulated')} <span className="font-extrabold text-stone-950 dark:text-white font-mono text-xs">{formatCurrency(g.current)}</span>
                </p>
                <div className="w-full h-1.5 bg-brand-faint rounded-full overflow-hidden mt-3 mb-1">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: '#E65F2B' }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-semibold text-brand-muted">
                  <span className="text-[#E65F2B] dark:text-[#FFA473] font-black text-xs">{pct.toFixed(0)}%</span>
                  <span>{t('dash.target')} <span className="font-extrabold text-stone-900 dark:text-stone-100 font-mono">{formatAbbreviatedTarget(g.target)}</span></span>
                </div>
              </motion.div>
            );
          })}
          
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenAddGoal}
            className="w-36 shrink-0 bg-brand-white/40 dark:bg-stone-800/20 border-2 border-dashed border-brand-border rounded-2xl flex flex-col items-center justify-center gap-2 text-brand-muted hover:text-[#E65F2B] dark:hover:text-[#FFA473] hover:border-[#E65F2B]/40 hover:bg-brand-faint transition-all p-4"
          >
            <div className="w-10 h-10 rounded-full bg-brand-white border border-brand-border flex items-center justify-center text-brand-muted">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">{t('dash.digNewGoal')}</span>
          </motion.button>
        </div>
      </div>

      <VineDivider />

      {/* 4.5 บันทึกรับเงินด่วน (Quick Payment Recorder) */}
      <div className="bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h4 className="text-base font-extrabold font-display text-brand-text flex items-center gap-1.5">
              {t('dash.quickPayTitle')} <IconBolt className="w-3.5 h-3.5" />
            </h4>
            <p className="text-[11px] text-brand-muted">
              {t('dash.quickPaySubtitle')}
            </p>
          </div>
          <span className="self-start sm:self-center text-[11px] font-extrabold text-brand-text bg-brand-faint px-3 py-1 rounded-full uppercase tracking-wider">
            {t('dash.pendingDealsCount', { count: unpaidJobs.length })}
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            className="w-full bg-brand-white border border-brand-border/60 hover:border-brand-border focus:border-[#E65F2B] rounded-2xl py-3 pl-10 pr-4 text-xs font-semibold text-brand-text placeholder-brand-muted/70 outline-none transition-all"
            placeholder={t('dash.searchPlaceholder')}
          />
          {quickSearch && (
            <button
              onClick={() => setQuickSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-muted hover:text-brand-text"
            >
              {t('dash.clear')}
            </button>
          )}
        </div>

        {/* Alert bar with Mascot inside */}
        {creditTermReport.overdue.length > 0 && (
          <div 
            onClick={() => {
              playHapticAndSound();
              if (onSwitchTab) {
                onSwitchTab('report');
              }
            }}
            className="bg-brand-white border border-l-4 border-brand-border border-l-[#A63F1B] rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-brand-faint/60 transition-all group"
          >
            <div className="w-10 h-10 bg-brand-faint border border-brand-border/40 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              <Mascot mood="alert" size={32} className="animate-wiggle" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-brand-text group-hover:underline">
                {t('dash.overdueAlert')} <IconArrowUpRight className="w-3 h-3 inline-block align-middle" />
              </p>
            </div>
          </div>
        )}

        {/* Card list */}
        <div className="space-y-2.5">
          {filteredUnpaidJobs.slice(0, visibleCount).map((j: any) => {
            const isOverdue = j.isOverdue;

            return (
              <motion.div
                key={j.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-brand-white hover:border-brand-border/75 border border-brand-border/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Coin icon circle */}
                  <div className="w-10 h-10 rounded-full bg-brand-faint flex items-center justify-center text-brand-muted border border-brand-border/30 shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  
                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs text-brand-text truncate block max-w-[200px] sm:max-w-xs">
                        {j.name}
                      </span>
                      {isOverdue && (
                        <span className="text-[9px] font-extrabold text-pink-acc bg-pink-bg px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shrink-0">
                          {t('dash.overdueTag')}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-brand-muted font-semibold truncate block mt-0.5">
                      {j.client || t('dash.noClientSpecified')}
                    </span>
                  </div>
                </div>

                {/* Right actions and money */}
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-3 sm:pt-0 border-t sm:border-0 border-brand-border/20">
                  <div className="text-left sm:text-right">
                    <span className="font-mono font-black text-sm text-[#E65F2B] block">
                      {formatCurrency(j.pending)}
                    </span>
                    <span className={`text-[10px] font-bold block mt-0.5 ${isOverdue ? 'text-pink-acc' : 'text-brand-muted'}`}>
                      {j.daysText || t('dash.noDateSpecified')}
                    </span>
                  </div>

                  <button
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
                              // This quick-list includes WIP/stock jobs too (unpaidJobs isn't
                              // filtered by isPosted) -- without this, marking one paid from here
                              // left it stuck flagged as "not yet delivered" even though it's now
                              // fully paid, unlike the equivalent button in JobsTab.
                              isPosted: true
                            });
                          }
                        }
                      );
                    }}
                    className="py-1.5 px-3.5 bg-brand-text hover:bg-brand-muted text-brand-white text-[10px] font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{t('dash.fullyPaidButton')}</span>
                  </button>
                </div>
              </motion.div>
            );
          })}

          {filteredUnpaidJobs.length === 0 && (
            <div className="text-center py-10 bg-brand-white/40 border border-dashed border-brand-border rounded-2xl text-xs text-brand-muted font-medium flex flex-col items-center gap-1.5">
              <IconCoin className="w-5 h-5" />
              <span>{t('dash.noUnpaidDeals')}</span>
            </div>
          )}
        </div>

        {/* Load more / Actions bottom bar */}
        {filteredUnpaidJobs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            {filteredUnpaidJobs.length > visibleCount ? (
              <button
                onClick={() => setVisibleCount(prev => prev + 4)}
                className="w-full sm:w-auto py-2.5 px-6 bg-brand-faint hover:bg-brand-border/30 text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer border border-brand-border/40 text-center flex-1"
              >
                {t('dash.showMore', { count: filteredUnpaidJobs.length - visibleCount, remaining: unpaidJobs.length - visibleCount })}
              </button>
            ) : visibleCount > 4 ? (
              <button
                onClick={() => setVisibleCount(4)}
                className="w-full sm:w-auto py-2.5 px-6 bg-brand-faint hover:bg-brand-border/30 text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer border border-brand-border/40 text-center flex-1"
              >
                {t('dash.collapseList')}
              </button>
            ) : (
              <div className="flex-1" />
            )}

            <button
              onClick={() => onSwitchTab('jobs')}
              className="w-full sm:w-auto py-2.5 px-5 bg-brand-white hover:bg-brand-faint border border-brand-border text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <span>{t('dash.manageAllDeals')}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Breakdown popup: which jobs (or, for "กำไรสุทธิ", which deductions) make up the clicked
          hero-card figure */}
      <AnimatePresence>
        {breakdownFilter && (() => {
          const breakdownJobs =
            breakdownFilter === 'contract' ? selectedMonthJobs :
            breakdownFilter === 'received' ? selectedMonthJobs.filter(j => (j.received || 0) > 0) :
            breakdownFilter === 'pending' ? selectedMonthJobs.filter(j => j.isPosted !== false && j.pending > 0) :
            [];
          return (
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
                  </h3>
                  {breakdownFilter !== 'profit' && (
                    <p className="text-xs text-brand-muted mt-0.5">
                      {breakdownFilter === 'contract' && formatCurrency(totalContractVal)}
                      {breakdownFilter === 'received' && formatCurrency(totalReceived)}
                      {breakdownFilter === 'pending' && formatCurrency(totalPending)}
                      {t('dash.breakdownTotalFrom', { count: breakdownJobs.length })}
                    </p>
                  )}
                </div>

                {breakdownFilter === 'profit' ? (
                  <div className="overflow-y-auto space-y-3 -mx-1 px-1">
                    {/* Calculation steps */}
                    <div className="space-y-1.5 p-3 bg-brand-faint/60 dark:bg-neutral-800/60 rounded-xl text-xs">
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownReceivedRow')}</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(totalReceived)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownFixedExpenseRow')}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(settings.monthlyExpense)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-brand-muted">{t('dash.breakdownVariableExpenseRow', { count: monthVariableExpenses.length })}</span>
                        <span className="font-mono font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(variableExpenseThisMonth)}</span>
                      </div>
                      {goalDeductionsThisMonth > 0 && (
                        <div className="flex justify-between">
                          <span className="text-brand-muted">{t('dash.breakdownGoalDeductionRow', { count: monthGoalDeductions.length })}</span>
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">-{formatCurrency(goalDeductionsThisMonth)}</span>
                        </div>
                      )}
                      <div className="h-px bg-brand-border/50 dark:bg-neutral-700 my-1" />
                      <div className="flex justify-between">
                        <span className="font-bold text-brand-text dark:text-white">{t('dash.breakdownNetProfitRow')}</span>
                        <span className={`font-mono font-black ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
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
                    {breakdownJobs.map(j => (
                      <button
                        key={j.id}
                        type="button"
                        onClick={() => {
                          setBreakdownFilter(null);
                          onViewJob?.(j.id);
                        }}
                        className="w-full flex items-center justify-between gap-2 p-3 bg-brand-faint/60 hover:bg-brand-faint dark:bg-neutral-800/60 dark:hover:bg-neutral-800 rounded-xl text-left transition-all cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand-text dark:text-white truncate">{j.name}</p>
                          <p className="text-[10px] text-brand-muted truncate">{j.client || t('dash.noClientListed')}</p>
                        </div>
                        <span className="text-xs font-mono font-black text-brand-text dark:text-white shrink-0">
                          {formatCurrency(
                            breakdownFilter === 'contract' ? j.value :
                            breakdownFilter === 'received' ? (j.received || 0) :
                            j.pending
                          )}
                        </span>
                      </button>
                    ))}

                    {breakdownJobs.length === 0 && (
                      <p className="text-xs text-brand-muted text-center py-6">{t('dash.noJobsThisCategory')}</p>
                    )}
                  </div>
                )}
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

    </div>
  );
}

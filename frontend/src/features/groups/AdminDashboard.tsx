import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BriefcaseBusiness,
  CalendarClock,
  Crown,
  Eye,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundX,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  AdminDashboardDetails,
  AdminDashboardSection,
  AdminDashboardStats,
} from '../../../../shared/groups';
import { USAGE_FEATURE_KEYS, type UsageFeatureKey } from '../../../../shared/usageAnalytics';
import { groupApi } from '../../services/groups';
import { usageAnalyticsApi } from '../../services/usageAnalytics';
import { getCurrentAccount } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Pagination, panel, secondary, type Confirm } from './groupUi';

const AdminUsersPanel = lazy(() => import('./AdminUsersPanel'));
const GroupsTab = lazy(() => import('./GroupsTab'));

type DashboardPanel = AdminDashboardSection | 'manageUsers' | 'manageGroups';

type DashboardCard = {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  section: AdminDashboardSection;
  highlight?: boolean;
};

export default function AdminDashboard({
  userId,
  triggerConfirm,
}: {
  userId: string;
  triggerConfirm: Confirm;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof usageAnalyticsApi.adminSnapshot>> | null>(null);
  const [selectedUsageDate, setSelectedUsageDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [activePanel, setActivePanel] = useState<DashboardPanel | null>(null);
  const [detail, setDetail] = useState<AdminDashboardDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailPage, setDetailPage] = useState(0);
  const [proActionUserId, setProActionUserId] = useState<string | null>(null);
  const proActionInFlight = useRef(false);
  const detailPanelRef = useRef<HTMLElement>(null);
  const openPanel = (panelName: DashboardPanel) => {
    setActivePanel(panelName);
    setDetailPage(0);
    setDetailError('');
  };

  useEffect(() => {
    if (!activePanel) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = detailPanelRef.current;
      const scroller = document.getElementById('main-content');
      if (!panel || !scroller) return;
      const top = scroller.scrollTop + panel.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
      scroller.scrollTo({
        top,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePanel]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    groupApi.adminDashboard(userId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && getCurrentAccount() === userId)
          setStats(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setUsageLoading(true);
    setUsageError('');
    usageAnalyticsApi.adminSnapshot(userId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && getCurrentAccount() === userId) setUsage(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setUsageError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsageLoading(false);
      });
    return () => controller.abort();
  }, [userId, revision]);

  useEffect(() => {
    if (!activePanel || activePanel === 'manageUsers' || activePanel === 'manageGroups') {
      setDetail(null);
      setDetailLoading(false);
      setDetailError('');
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    groupApi.adminDashboardDetails(userId, activePanel, detailPage, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && getCurrentAccount() === userId) setDetail(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setDetailError((cause as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [userId, activePanel, detailPage, revision]);

  useEffect(() => {
    if (activePanel !== 'accounts' && activePanel !== 'admins' && activePanel !== 'pro') return;
    const controller = new AbortController();
    let inFlight = false;
    const refreshPresence = () => {
      if (inFlight || document.visibilityState !== 'visible' || getCurrentAccount() !== userId) return;
      inFlight = true;
      void groupApi.adminDashboardDetails(userId, activePanel, detailPage, controller.signal)
        .then(result => {
          if (!controller.signal.aborted && getCurrentAccount() === userId) setDetail(result);
        })
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };
    const interval = window.setInterval(refreshPresence, 10_000);
    document.addEventListener('visibilitychange', refreshPresence);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshPresence);
    };
  }, [userId, activePanel, detailPage]);

  const cards: DashboardCard[] = stats ? [
    {
      label: copy('บัญชีทั้งหมด', 'Total accounts'),
      value: stats.totalAccounts,
      icon: UserRound,
      color: 'text-brand-text',
      section: 'accounts',
    },
    {
      label: 'Admin',
      value: stats.adminAccounts,
      icon: ShieldCheck,
      color: 'text-brand-blue-acc',
      section: 'admins',
    },
    {
      label: copy('กลุ่มทั้งหมด', 'Total groups'),
      value: stats.totalGroups,
      icon: BriefcaseBusiness,
      color: 'text-brand-text',
      section: 'groups',
    },
    {
      label: copy('Pro ที่ชำระเงินหรือแอดมินมอบให้', 'Paid or admin-granted Pro'),
      value: stats.proAccounts,
      icon: Crown,
      color: 'text-amber-600',
      section: 'pro',
    },
    {
      label: copy('คำเชิญที่ยังไม่หมดอายุ', 'Open invitations'),
      value: stats.pendingInvitations,
      icon: Mail,
      color: 'text-brand-blue-acc',
      section: 'invitations',
    },
    {
      label: copy('พักบัญชีอยู่', 'Temporarily paused'),
      value: stats.pausedAccounts,
      icon: UserRound,
      color: 'text-brand-muted',
      section: 'paused',
    },
    {
      label: copy('รอลบบัญชีถาวร', 'Pending permanent deletion'),
      value: stats.pendingDeletions,
      icon: UserRoundX,
      color: stats.pendingDeletions ? 'text-orange-600' : 'text-brand-muted',
      section: 'deletions',
      highlight: stats.pendingDeletions > 0,
    },
  ] : [];
  const displayCards: (DashboardCard | { skeleton: true; key: number })[] =
    loading && !stats
      ? Array.from({ length: 7 }, (_, key) => ({ skeleton: true as const, key }))
      : cards;
  const activeMetric = activePanel && activePanel !== 'manageUsers' && activePanel !== 'manageGroups'
    ? activePanel
    : null;
  const currentDetail = detail?.section === activeMetric ? detail : null;
  const detailTitle = activePanel === 'manageUsers'
    ? copy('จัดการผู้ใช้', 'Manage users')
    : activePanel === 'manageGroups'
      ? copy('จัดการทุกกลุ่ม', 'Manage all groups')
      : activePanel === 'accounts'
        ? copy('บัญชีทั้งหมด', 'All accounts')
        : activePanel === 'admins'
          ? copy('บัญชีผู้ดูแลระบบ', 'Admin accounts')
          : activePanel === 'groups'
            ? copy('กลุ่มทั้งหมด', 'All groups')
            : activePanel === 'pro'
              ? copy('บัญชี Pro ที่ชำระเงินหรือแอดมินมอบให้', 'Paid or admin-granted Pro accounts')
              : activePanel === 'invitations'
                ? copy('คำเชิญที่ยังไม่หมดอายุ', 'Open invitations')
                : activePanel === 'paused'
                  ? copy('บัญชีที่พักชั่วคราว', 'Temporarily paused accounts')
                  : activePanel === 'deletions'
                    ? copy('บัญชีที่รอลบถาวร', 'Accounts pending permanent deletion')
                    : '';

  const formatDate = (value?: string | null) => value
    ? new Date(value).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', {
      timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
    })
    : '—';

  const featureLabels: Record<UsageFeatureKey, [string, string]> = {
    dashboard: ['ภาพรวมกระแสเงินสด', 'Cash flow overview'],
    adminDashboard: ['แดชบอร์ดแอดมิน', 'Admin dashboard'],
    jobs: ['งาน', 'Jobs'],
    tax: ['ภาษี', 'Tax'],
    split: ['จัดสรรเงินและเป้าหมาย', 'Splits and goals'],
    report: ['รายงาน', 'Reports'],
    settings: ['ตั้งค่า', 'Settings'],
    invoice: ['เอกสารและใบแจ้งหนี้', 'Documents and invoices'],
    insight: ['วิเคราะห์รายได้', 'Income insights'],
    plans: ['แพ็กเกจ', 'Plans'],
    groups: ['กลุ่มและสมาชิก', 'Groups and members'],
    clients: ['ลูกค้า', 'Clients'],
    calendar: ['ปฏิทินงาน', 'Calendar'],
    receivables: ['รายการรอรับเงิน', 'Receivables'],
    incomeExpense: ['รายรับและรายจ่าย', 'Income and expenses'],
  };
  const dailyByDate = new Map((usage?.daily || []).map(day => [day.date, day] as const));
  const dailyChart = usage ? Array.from({ length: 30 }, (_, index) => {
    const day = new Date(`${usage.fromDate}T00:00:00.000Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    return dailyByDate.get(date) || { date, activeUsers: 0, pageViews: 0 };
  }) : [];
  const maxDailyUsers = Math.max(1, ...dailyChart.map(day => day.activeUsers));
  const selectedDay = selectedUsageDate
    ? dailyByDate.get(selectedUsageDate) || { date: selectedUsageDate, activeUsers: 0, pageViews: 0 }
    : null;
  const selectedDayFeatures = selectedUsageDate
    ? (usage?.dailyFeatures || [])
      .filter(feature => feature.date === selectedUsageDate)
      .sort((a, b) => b.pageViews - a.pageViews)
    : [];
  const featureStats = USAGE_FEATURE_KEYS.map(key => ({
    key,
    ...(usage?.features.find(feature => feature.key === key) || { activeUsers: 0, pageViews: 0 }),
  })).sort((a, b) => b.pageViews - a.pageViews);
  const maxFeatureViews = Math.max(1, ...featureStats.map(feature => feature.pageViews));
  const formatMetric = (value: number) => value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US');
  const setProAccess = async (targetUserId: string, enabled: boolean) => {
    if (proActionInFlight.current || getCurrentAccount() !== userId) return;
    proActionInFlight.current = true;
    setProActionUserId(targetUserId);
    setDetailError('');
    try {
      await groupApi.setProAccess(userId, targetUserId, enabled);
      if (getCurrentAccount() === userId) setRevision(value => value + 1);
    } catch (cause) {
      setDetailError((cause as Error).message);
    } finally {
      proActionInFlight.current = false;
      setProActionUserId(null);
    }
  };

  return (
    <section aria-labelledby="admin-dashboard-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue-acc">
            ADMIN OVERVIEW
          </p>
          <h2 id="admin-dashboard-title" className="mt-1 text-2xl font-display font-extrabold">
            {copy('ภาพรวมระบบ', 'System overview')}
          </h2>
          <p className="mt-1 text-sm text-brand-muted">
            {copy('สรุปสถานะบัญชี กลุ่ม และรายการที่ต้องติดตาม', 'A summary of accounts, groups, and items that need attention.')}
          </p>
        </div>
        <button
          type="button"
          className={secondary}
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
          aria-label={copy('รีเฟรชข้อมูลแอดมิน', 'Refresh admin overview')}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {copy('รีเฟรช', 'Refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-300/60 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {displayCards.map((card) => {
          if ('skeleton' in card) {
            return (
              <div key={card.key} className={`${panel} min-h-32 animate-pulse`} aria-hidden="true">
                <div className="h-3 w-28 rounded bg-brand-faint" />
                <div className="mt-5 h-8 w-16 rounded bg-brand-faint" />
              </div>
            );
          }
          const Icon = card.icon;
          const selected = activePanel === card.section;
          const className = `${panel} min-h-32 w-full text-left transition-colors hover:border-brand-blue-acc/50 hover:bg-brand-faint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-acc ${selected ? 'border-brand-blue-acc/70 bg-brand-faint/50' : ''} ${card.highlight ? 'border-orange-300/70 bg-orange-50/60 dark:bg-orange-950/10' : ''}`;
          return (
            <button
              key={card.label}
              type="button"
              className={className}
              onClick={() => openPanel(card.section)}
              aria-controls="admin-dashboard-detail"
              aria-expanded={selected}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-brand-muted">{card.label}</p>
                <Icon size={18} className={`${card.color} shrink-0`} />
              </div>
              <p className={`mt-4 text-3xl font-display font-extrabold tabular-nums ${card.color}`}>
                {card.value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
              </p>
            </button>
          );
        })}
      </div>

      <section className={`${panel} space-y-5`} aria-labelledby="usage-analytics-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-brand-blue-acc">
              <Activity size={15} /> {copy('สถิติการใช้งาน', 'Usage analytics')}
            </p>
            <h2 id="usage-analytics-title" className="mt-1 text-xl font-display font-extrabold">
              {copy('การเข้าใช้งานเว็บไซต์', 'Website usage')}
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              {copy('สรุป 30 วันล่าสุด · นับเฉพาะบัญชีที่ลงชื่อเข้าใช้', 'Last 30 days · signed-in accounts only')}
            </p>
          </div>
          {usage?.fromDate && usage.toDate && (
            <p className="text-xs font-medium text-brand-muted">
              {new Date(`${usage.fromDate}T12:00:00+07:00`).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })}
              {' – '}
              {new Date(`${usage.toDate}T12:00:00+07:00`).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>

        {usageError && (
          <p role="alert" className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
            {usageError}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: copy('ผู้ใช้ไม่ซ้ำ · 30 วัน', 'Unique users · 30 days'), value: usage?.totals.activeUsers, icon: UsersRound, color: 'text-brand-blue-acc' },
            { label: copy('ผู้ใช้งานวันนี้', 'Active users today'), value: usage?.totals.activeUsersToday, icon: UserRound, color: 'text-emerald-600' },
            { label: copy('จำนวนเปิดหน้า · 30 วัน', 'Page views · 30 days'), value: usage?.totals.pageViews, icon: Eye, color: 'text-orange-600' },
          ].map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="rounded-2xl border border-brand-border/50 bg-brand-bg/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-brand-muted">{metric.label}</p>
                  <Icon size={16} className={metric.color} />
                </div>
                <p className={`mt-3 text-2xl font-display font-extrabold tabular-nums ${metric.color}`}>
                  {usage ? formatMetric(metric.value || 0) : '—'}
                </p>
                {metric.label === copy('จำนวนเปิดหน้า · 30 วัน', 'Page views · 30 days') && usage && (
                  <p className="mt-1 text-[11px] text-brand-muted">
                    {copy('วันนี้', 'Today')}: {formatMetric(usage.totals.pageViewsToday)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="min-w-0 rounded-2xl border border-brand-border/50 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">{copy('ผู้ใช้งานรายวัน', 'Daily active users')}</h3>
              <span className="text-xs text-brand-muted">{copy('แยกตามวัน', 'By day')}</span>
            </div>
            <div
              className="mt-5 grid h-32 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1 sm:gap-1.5"
              role="group"
              aria-label={copy('กราฟจำนวนผู้ใช้งานรายวันใน 30 วันที่ผ่านมา', 'Daily active users over the last 30 days')}
            >
              {dailyChart.map(day => {
                const selected = selectedUsageDate === day.date;
                const label = `${day.date}: ${formatMetric(day.activeUsers)} ${copy('คน', 'users')} · ${formatMetric(day.pageViews)} ${copy('ครั้ง', 'views')}`;
                return (
                  <button
                    key={day.date}
                    type="button"
                    className={`group flex h-full min-w-0 items-end rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-white dark:focus-visible:ring-offset-stone-900 ${selected ? 'ring-2 ring-orange-400 ring-offset-1 ring-offset-brand-white dark:ring-offset-stone-900' : ''}`}
                    onClick={() => setSelectedUsageDate(day.date)}
                    aria-label={`${label}. ${copy('กดเพื่อดูรายละเอียดของวันดังกล่าว', 'Select to view this day’s details')}`}
                    aria-pressed={selected}
                    title={`${label} · ${copy('กดเพื่อดูรายละเอียด', 'Click to view details')}`}
                  >
                    <div className="flex h-full w-full items-end overflow-hidden rounded-t-sm bg-brand-faint/70">
                      <div
                        className={`w-full rounded-t-sm transition-[height,background-color] duration-300 group-hover:bg-orange-500 ${selected ? 'bg-orange-500' : 'bg-brand-blue-acc'}`}
                        style={{ height: `${day.activeUsers ? Math.max(8, (day.activeUsers / maxDailyUsers) * 100) : 3}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-brand-muted">
              <span>{usage?.fromDate || '—'}</span>
              <span>{usage?.toDate || '—'}</span>
            </div>
            {usageLoading && !usage && <p className="mt-3 text-xs text-brand-muted">{copy('กำลังโหลดสถิติ…', 'Loading analytics…')}</p>}
          </div>

          <div className="min-w-0 rounded-2xl border border-brand-border/50 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">{copy('เมนูที่ถูกเปิด', 'Most viewed features')}</h3>
              <span className="text-xs text-brand-muted">{copy('30 วัน', '30 days')}</span>
            </div>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
              {featureStats.map(feature => (
                <div key={feature.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
                  <p className="truncate text-xs font-semibold" title={feature.key}>
                    {featureLabels[feature.key][language === 'th' ? 0 : 1]}
                  </p>
                  <p className="text-right text-[11px] tabular-nums text-brand-muted">
                    {formatMetric(feature.pageViews)} {copy('ครั้ง', 'views')} · {formatMetric(feature.activeUsers)} {copy('คน', 'users')}
                  </p>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-brand-faint">
                    <div className="h-full rounded-full bg-orange-500 transition-[width] duration-300" style={{ width: `${feature.pageViews ? Math.max(2, (feature.pageViews / maxFeatureViews) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedUsageDate && selectedDay && (
          <section className="rounded-2xl border border-brand-border/50 bg-brand-bg/55 p-4 sm:p-5" aria-live="polite" aria-labelledby="usage-day-detail-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-blue-acc">
                  {copy('รายละเอียดรายวัน', 'Daily details')}
                </p>
                <h3 id="usage-day-detail-title" className="mt-1 text-lg font-display font-extrabold">
                  {new Date(`${selectedUsageDate}T12:00:00+07:00`).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', {
                    timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </h3>
              </div>
              <button
                type="button"
                className={secondary}
                onClick={() => setSelectedUsageDate(null)}
                aria-label={copy('ปิดรายละเอียดรายวัน', 'Close daily details')}
              >
                <X size={15} /> {copy('ปิด', 'Close')}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-brand-border/40 bg-brand-white p-4 dark:bg-stone-900">
                <p className="text-xs font-semibold text-brand-muted">{copy('ผู้ใช้ไม่ซ้ำ', 'Unique users')}</p>
                <p className="mt-1 text-2xl font-display font-extrabold text-brand-blue-acc">{formatMetric(selectedDay.activeUsers)} {copy('คน', 'users')}</p>
              </div>
              <div className="rounded-xl border border-brand-border/40 bg-brand-white p-4 dark:bg-stone-900">
                <p className="text-xs font-semibold text-brand-muted">{copy('จำนวนเปิดหน้า', 'Page views')}</p>
                <p className="mt-1 text-2xl font-display font-extrabold text-orange-600">{formatMetric(selectedDay.pageViews)} {copy('ครั้ง', 'views')}</p>
              </div>
            </div>

            <div className="mt-5">
              <h4 className="font-bold">{copy('เมนูที่มีการใช้งานในวันนี้', 'Features used on this day')}</h4>
              {selectedDayFeatures.length ? (
                <div className="mt-2 divide-y divide-brand-border/40">
                  {selectedDayFeatures.map(feature => (
                    <div key={feature.key} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-2">
                      <span className="text-sm font-semibold">{featureLabels[feature.key][language === 'th' ? 0 : 1]}</span>
                      <span className="text-xs tabular-nums text-brand-muted">
                        {formatMetric(feature.activeUsers)} {copy('คน', 'users')} · {formatMetric(feature.pageViews)} {copy('ครั้ง', 'views')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-xl bg-brand-white/70 px-4 py-5 text-center text-sm text-brand-muted dark:bg-stone-900/70">
                  {copy('ไม่มีการเข้าใช้งานที่บันทึกไว้ในวันนี้', 'No usage was recorded on this day.')}
                </p>
              )}
            </div>
          </section>
        )}
        <p className="text-[11px] leading-relaxed text-brand-muted">
          {copy('เก็บยอดเปิดเมนูรายวันและรหัสนิรนามสำหรับนับผู้ใช้ ไม่เก็บอีเมล, URL, ข้อมูลที่กรอก หรือข้อมูลการเงิน', 'Only daily feature counts and pseudonymous keys for unique-user totals are stored. Emails, URLs, entered content, and financial data are never recorded.')}
        </p>
      </section>

      <div className={`${panel} flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="font-bold">{copy('จัดการต่อ', 'Continue managing')}</p>
          <p className="mt-1 text-sm text-brand-muted">
            {copy('เลือกดูบัญชีผู้ใช้หรือกลุ่ม โดยข้อมูลการเงินส่วนตัวจะไม่แสดงในหน้านี้', 'Open user or group management. Personal financial data is not shown here.')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => openPanel('manageUsers')} aria-controls="admin-dashboard-detail" aria-expanded={activePanel === 'manageUsers'}>{copy('จัดการผู้ใช้', 'Manage users')}</button>
          <button type="button" className={secondary} onClick={() => openPanel('manageGroups')} aria-controls="admin-dashboard-detail" aria-expanded={activePanel === 'manageGroups'}>{copy('ดูทุกกลุ่ม', 'View groups')}</button>
        </div>
      </div>

      {activePanel && (
        <section id="admin-dashboard-detail" ref={detailPanelRef} className="app-tab-enter space-y-4 scroll-mt-4" aria-labelledby="admin-dashboard-detail-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="admin-dashboard-detail-title" className="text-xl font-display font-extrabold">
              {detailTitle}
            </h2>
            <button
              type="button"
              className={secondary}
              onClick={() => setActivePanel(null)}
              aria-label={copy('ปิดส่วนจัดการ', 'Close details')}
            >
              <X size={16} />
              {copy('ปิด', 'Close')}
            </button>
          </div>

          {activePanel === 'manageUsers' ? (
            <Suspense fallback={<div className={`${panel} h-40 animate-pulse`} aria-label={copy('กำลังโหลด', 'Loading')} />}>
              <AdminUsersPanel
                userId={userId}
                triggerConfirm={triggerConfirm}
                onRoleChanged={async () => setRevision(value => value + 1)}
              />
            </Suspense>
          ) : activePanel === 'manageGroups' ? (
            <Suspense fallback={<div className={`${panel} h-40 animate-pulse`} aria-label={copy('กำลังโหลด', 'Loading')} />}>
              <GroupsTab
                userId={userId}
                isGuest={false}
                triggerConfirm={triggerConfirm}
                initialScope="all"
                embedded
              />
            </Suspense>
          ) : (
            <div className={`${panel} min-w-0`} aria-live="polite">
              {detailError && <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-300">{detailError}</p>}
              {detailLoading ? (
                <div className="space-y-3" aria-label={copy('กำลังโหลดรายการ', 'Loading records')}>
                  <div className="h-12 animate-pulse rounded-xl bg-brand-faint" />
                  <div className="h-12 animate-pulse rounded-xl bg-brand-faint" />
                  <div className="h-12 animate-pulse rounded-xl bg-brand-faint" />
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-brand-muted">
                      {currentDetail?.total.toLocaleString(language === 'th' ? 'th-TH' : 'en-US') || '0'} {copy('รายการ', 'records')}
                    </p>
                  </div>
                  {activePanel === 'groups' ? (
                    <div className="divide-y divide-brand-border/40">
                      {currentDetail?.groups?.map(group => (
                        <article key={group.id} className="py-4 first:pt-1 last:pb-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-bold break-words">{group.name}</h3>
                              <p className="mt-1 text-sm text-brand-muted break-words">{group.description || copy('ไม่มีคำอธิบาย', 'No description')}</p>
                              <p className="mt-2 text-xs text-brand-muted">{copy('สร้างเมื่อ', 'Created')} {formatDate(group.createdAt)}</p>
                            </div>
                            <div className="flex shrink-0 gap-2 text-xs">
                              <span className="rounded-full bg-brand-faint px-3 py-1.5">{group.memberCount} {copy('สมาชิก', 'members')}</span>
                              <span className="rounded-full bg-brand-faint px-3 py-1.5">{group.leaderCount} {copy('ผู้ดูแล', 'leaders')}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : activePanel === 'invitations' ? (
                    <div className="divide-y divide-brand-border/40">
                      {currentDetail?.invitations?.map(invitation => (
                        <article key={invitation.id} className="py-4 first:pt-1 last:pb-1">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-bold break-words">{invitation.groupName}</h3>
                              <p className="mt-1 text-sm text-brand-muted break-all">{invitation.email}</p>
                              <p className="mt-2 text-xs text-brand-muted">{copy('ส่งเมื่อ', 'Sent')} {formatDate(invitation.createdAt)}</p>
                            </div>
                            <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">{copy('หมดอายุ', 'Expires')} {formatDate(invitation.expiresAt)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-brand-border/40">
                      {currentDetail?.accounts?.map(account => (
                        <article key={account.userId} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-1 last:pb-1">
                          <div className="min-w-0">
                            <h3 className="font-bold break-words">{account.displayName}</h3>
                            <p className="mt-1 text-xs text-brand-muted font-mono">{account.publicId} · {account.role === 'admin' ? 'Admin' : copy('ผู้ใช้', 'User')}</p>
                            <p className="mt-2 text-xs text-brand-muted">{copy('สมัครเมื่อ', 'Joined')} {formatDate(account.createdAt)}</p>
                            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs">
                              <span className={`size-2 rounded-full ${account.isOnline ? 'bg-emerald-500' : 'bg-stone-400'}`} aria-hidden="true" />
                              <span className={account.isOnline ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-brand-muted'}>
                                {account.isOnline ? copy('ออนไลน์', 'Online') : copy('ออฟไลน์', 'Offline')}
                              </span>
                              {account.lastSeenAt && <span className="text-brand-muted">· {copy('ใช้งานล่าสุด', 'Last seen')} {formatDate(account.lastSeenAt)}</span>}
                            </p>
                          </div>
                          {activePanel === 'pro' || activePanel === 'accounts' ? (
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className={`rounded-full px-3 py-1.5 text-xs ${['admin', 'paid', 'trial'].includes(account.proStatus || 'none') ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : account.proStatus === 'revoked' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-brand-faint text-brand-muted'}`}>
                                {activePanel === 'pro'
                                  ? account.plan === 'admin_grant'
                                    ? copy('Pro · แอดมินให้ (ไม่หมดอายุ)', 'Pro · Admin grant (no expiry)')
                                    : `${account.plan || 'Pro'} · ${copy('หมดอายุ', 'Expires')} ${formatDate(account.currentPeriodEnd)}`
                                  : account.proStatus === 'admin'
                                    ? copy('Pro · แอดมินให้', 'Pro · Admin grant')
                                    : account.proStatus === 'paid'
                                      ? copy('Pro · ชำระแล้ว', 'Pro · Paid')
                                      : account.proStatus === 'trial'
                                        ? copy('Pro · ทดลองใช้', 'Pro · Trial')
                                        : account.proStatus === 'revoked'
                                          ? copy('ปิด Pro โดยแอดมิน', 'Pro disabled by admin')
                                          : copy('Free', 'Free')}
                              </span>
                              <button
                                type="button"
                                className={['admin', 'paid', 'trial'].includes(account.proStatus || 'none') ? secondary : 'inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50'}
                                disabled={proActionUserId !== null}
                                onClick={() => {
                                  const currentlyPro = ['admin', 'paid', 'trial'].includes(account.proStatus || 'none');
                                  triggerConfirm(
                                    currentlyPro ? copy('ยกเลิก Pro', 'Revoke Pro access') : copy('ให้สิทธิ์ Pro', 'Grant Pro access'),
                                    currentlyPro
                                      ? copy(`ปิดสิทธิ์ Pro ของ ${account.displayName} ทันที การดำเนินการนี้ไม่ได้ยกเลิกการเรียกเก็บเงินผ่าน Stripe`, `Immediately revoke Pro access for ${account.displayName}. This does not cancel Stripe billing.`)
                                      : copy(`ให้ ${account.displayName} ใช้ Pro ได้จนกว่าแอดมินจะยกเลิก`, `Grant Pro to ${account.displayName} until an admin revokes it.`),
                                    () => { void setProAccess(account.userId, !currentlyPro); },
                                  );
                                }}
                              >
                                {proActionUserId === account.userId
                                  ? copy('กำลังบันทึก…', 'Saving…')
                                  : ['admin', 'paid', 'trial'].includes(account.proStatus || 'none')
                                    ? copy('ยกเลิก Pro', 'Revoke Pro')
                                    : copy('ให้ Pro', 'Grant Pro')}
                              </button>
                            </div>
                          ) : activePanel === 'paused' || activePanel === 'deletions' ? (
                            <div className="text-right text-xs text-brand-muted">
                              <p className="inline-flex items-center gap-1"><CalendarClock size={14} /> {copy('เริ่มเมื่อ', 'Started')} {formatDate(account.pausedAt)}</p>
                              <p className="mt-1">{activePanel === 'deletions' ? <Trash2 size={13} className="mr-1 inline" /> : <UsersRound size={13} className="mr-1 inline" />}{copy('กำหนดถึง', 'Scheduled until')} {formatDate(account.deleteAfter)}</p>
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  )}
                  {currentDetail && currentDetail.total === 0 && (
                    <p className="py-8 text-center text-sm text-brand-muted">{copy('ยังไม่มีรายการในหมวดนี้', 'No records in this category yet.')}</p>
                  )}
                  {currentDetail && (
                    <Pagination
                      page={detailPage}
                      total={currentDetail.total}
                      size={currentDetail.pageSize}
                      onChange={setDetailPage}
                      disabled={detailLoading}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

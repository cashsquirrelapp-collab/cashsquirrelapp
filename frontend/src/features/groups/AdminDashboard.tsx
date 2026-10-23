import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Search,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  AccountPersona,
  AccountPlanStatus,
  AdminAnalyticsAccount,
  AdminAnalyticsSummary,
  AnalyticsRange,
} from '../../../../shared/adminAnalytics';
import type { UsageFeatureKey } from '../../../../shared/usageAnalytics';
import PageHeader from '../../components/ui/PageHeader';
import { uiSurface } from '../../components/ui/uiStyles';
import { AdminUsersLoadingSkeleton, GroupsLoadingSkeleton, SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { useLanguage } from '../../i18n/LanguageContext';
import { adminAnalyticsApi } from '../../services/adminAnalytics';
import { fireMascot } from '../../mascotBus';
import { featureLabels, personaLabels, planLabels } from './adminLabels';
import { secondary, type Confirm } from './groupUi';

import { tr } from '../../i18n/tr';
const AdminUsersPanel = lazy(() => import('./AdminUsersPanel'));
const GroupsTab = lazy(() => import('./GroupsTab'));
const AdminFeedbackInbox = lazy(() => import('../feedback/AdminFeedbackInbox'));
const AdminStripeFinance = lazy(() => import('./AdminStripeFinance'));
const AdminDashboardPhone = lazy(() => import('./AdminDashboardPhone'));

type View = 'overview' | 'product' | 'revenue' | 'customers' | 'feedback' | 'operations';
type OperationsPanel = 'users' | 'groups' | null;

const surface = uiSurface;
const tabButton = 'inline-flex items-center gap-2 border-b-2 px-3 py-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-acc';

function percent(value: number) {
  return `${(value * 100).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;
}

function delta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

function KpiCard({
  label, value, detail, change,
}: {
  label: string; value: string; detail: string; change?: number | null;
}) {
  return (
    <article className={`${surface} min-w-0 p-4 sm:p-5`}>
      <p className="text-[13px] text-brand-muted">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-brand-text">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs">
        {change !== undefined && change !== null && (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${change >= 0 ? 'text-brand-green-acc' : 'text-brand-pink-acc'}`}>
            {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(change * 100).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%
          </span>
        )}
        <span className="truncate text-brand-muted">{detail}</span>
      </div>
    </article>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className={`${surface} p-5`}><SkeletonBlock className="h-4 w-24" /><SkeletonBlock className="mt-5 h-9 w-32" /><SkeletonBlock className="mt-3 h-3 w-40" /></div>)}
      </div>
      <div className={`${surface} p-5`}><SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="mt-6 h-56 w-full" /></div>
    </div>
  );
}

function TrendChart({ data, formatDate }: { data: AdminAnalyticsSummary['daily']; formatDate: (value: string, compact?: boolean) => string }) {
  const maxUsers = Math.max(1, ...data.map(day => day.activeUsers));
  const maxRevenue = Math.max(1, ...data.map(day => day.revenue));
  const visible = data.length > 30 ? data.filter((_, index) => index % 3 === 0 || index === data.length - 1) : data;
  return (
    <div className="mt-6">
      <div className="flex h-56 items-end gap-1 sm:gap-1.5" role="img" aria-label={tr("กราฟผู้ใช้งานและรายได้รายวัน")}>
        {visible.map(day => (
          <div key={day.date} className="group relative flex h-full min-w-0 flex-1 items-end gap-px" title={`${formatDate(day.date)} · ${day.activeUsers} users`}>
            <div className="w-1/2 rounded-t-sm bg-brand-blue-acc/75 transition-colors group-hover:bg-brand-blue-acc" style={{ height: `${day.activeUsers ? Math.max(4, day.activeUsers / maxUsers * 100) : 1}%` }} />
            <div className="w-1/2 rounded-t-sm bg-stone-400/60 transition-colors group-hover:bg-stone-400" style={{ height: `${day.revenue ? Math.max(4, day.revenue / maxRevenue * 100) : 1}%` }} />
            <div className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-xl bg-stone-950 px-3 py-2 text-xs text-white opacity-0 shadow-xl group-hover:visible group-hover:opacity-100">
              <p className="font-semibold">{formatDate(day.date)}</p>
              <p className="mt-1">{tr("ผู้ใช้ {0} คน", day.activeUsers.toLocaleString('th-TH'))}</p>
              <p>{tr("รายได้ {0} บาท", (day.revenue / 100).toLocaleString('th-TH'))}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-brand-muted">
        <span>{formatDate(data[0]?.date || '', true)}</span>
        <span className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-brand-blue-acc" />{tr("ผู้ใช้")}</span><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-stone-400" />{tr("รายได้")}</span></span>
        <span>{formatDate(data.at(-1)?.date || '', true)}</span>
      </div>
    </div>
  );
}

function PlanBadge({ status, language }: { status: AccountPlanStatus; language: 'th' | 'en' }) {
  const style = status === 'pro' || status === 'admin' ? 'bg-brand-blue-bg text-brand-blue-acc'
      : status === 'trial' ? 'bg-brand-faint text-brand-text'
        : status === 'expired' ? 'bg-red-500/10 text-red-700 dark:text-red-300'
          : 'bg-brand-faint text-brand-muted';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${style}`}>{planLabels[status][language === 'th' ? 0 : 1]}</span>;
}

function AccountDrawer({
  account, data, language, onClose, formatDate, formatMoney,
}: {
  account: AdminAnalyticsAccount; data: AdminAnalyticsSummary; language: 'th' | 'en'; onClose: () => void;
  formatDate: (value: string, compact?: boolean) => string; formatMoney: (value: number) => string;
}) {
  const payments = data.payments.filter(payment => payment.userId === account.userId);
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[12000] flex justify-end bg-stone-950/45 backdrop-blur-[2px]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-brand-border bg-brand-bg p-5 shadow-2xl sm:p-7" role="dialog" aria-modal="true" aria-labelledby="account-detail-title">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-brand-muted">{copy('บัญชีลูกค้า', 'Customer account')}</p>
            <h2 id="account-detail-title" className="mt-1 truncate text-xl font-semibold">{account.displayName}</h2>
            <p className="mt-1 font-mono text-xs text-brand-muted">{account.publicId}</p>
          </div>
          <button type="button" className={secondary} onClick={onClose} aria-label={copy('ปิด', 'Close')}><X size={16} /></button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2"><PlanBadge status={account.planStatus} language={language} /><span className="rounded-full bg-brand-faint px-2.5 py-1 text-[11px] font-semibold text-brand-muted">{personaLabels[account.persona][language === 'th' ? 0 : 1]}</span></div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            [copy('ยอดเติมสะสม', 'Lifetime spend'), formatMoney(account.totalSpent)],
            [copy('จำนวนครั้งที่เติม', 'Payments'), account.paymentCount.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')],
            [copy('วันที่ใช้งาน', 'Active days'), `${account.activeDays} ${copy('วัน', 'days')}`],
            [copy('เปิดฟีเจอร์', 'Feature views'), account.pageViews.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')],
          ].map(([label, value]) => <div key={label} className={`${surface} p-4`}><p className="text-xs text-brand-muted">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
        </div>

        <section className={`${surface} mt-4 p-5`}>
          <h3 className="font-semibold">{copy('ข้อมูลบัญชี', 'Account profile')}</h3>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-brand-muted">{copy('สมัครเมื่อ', 'Joined')}</dt><dd className="text-right font-medium">{formatDate(account.createdAt)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-brand-muted">{copy('ใช้งานล่าสุด', 'Last active')}</dt><dd className="text-right font-medium">{account.lastSeenAt ? formatDate(account.lastSeenAt) : '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-brand-muted">{copy('Pro ถึง', 'Pro until')}</dt><dd className="text-right font-medium">{account.currentPeriodEnd ? formatDate(account.currentPeriodEnd) : '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-brand-muted">{copy('ประเภทงาน', 'Work type')}</dt><dd className="text-right font-medium">{account.jobTypes.length ? account.jobTypes.join(', ') : '—'}</dd></div>
          </dl>
        </section>

        <section className={`${surface} mt-4 p-5`}>
          <h3 className="font-semibold">{copy('ฟีเจอร์ที่ใช้บ่อย', 'Most-used features')}</h3>
          <div className="mt-3 space-y-3">
            {account.topFeatures.length ? account.topFeatures.map((feature, index) => (
              <div key={feature.key} className="flex items-center justify-between gap-3 text-sm"><span><b className="mr-2 text-brand-muted">{index + 1}</b>{featureLabels[feature.key][language === 'th' ? 0 : 1]}</span><span className="tabular-nums text-brand-muted">{feature.pageViews.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}</span></div>
            )) : <p className="text-sm text-brand-muted">{copy('ยังไม่มีข้อมูลในช่วงเวลานี้', 'No activity in this period')}</p>}
          </div>
        </section>

        <section className={`${surface} mt-4 p-5`}>
          <h3 className="font-semibold">{copy('ประวัติการเติม Pro', 'Payment history')}</h3>
          <div className="mt-3 divide-y divide-brand-border/60">
            {payments.length ? payments.map(payment => (
              <div key={payment.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{formatDate(payment.paidAt)}</p><p className="mt-0.5 text-xs font-mono text-brand-muted">{payment.id.slice(0, 18)}</p></div><div className="text-right"><p className={`font-semibold tabular-nums ${payment.refunded ? 'text-brand-pink-acc line-through' : 'text-brand-green-acc'}`}>{formatMoney(payment.amount)}</p>{payment.refunded && <p className="text-[11px] text-brand-pink-acc">Refunded</p>}</div></div>
            )) : <p className="py-4 text-center text-sm text-brand-muted">{copy('ยังไม่มีประวัติการชำระเงิน', 'No payment history')}</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}

const LIVE_CHECK_MS = 15_000;

/** Announces payments that appeared since the last snapshot (refunds are not announced). */
function announceNewPayments(before: AdminAnalyticsSummary | null, next: AdminAnalyticsSummary, copy: (th: string, en: string) => string) {
  if (!before) return;
  const known = new Set(before.payments.map(payment => payment.id));
  const fresh = next.payments.filter(payment => !known.has(payment.id) && !payment.refunded);
  if (!fresh.length) return;
  const total = fresh.reduce((sum, payment) => sum + payment.amount, 0);
  fireMascot({
    mood: 'celebrate', tone: 'success', duration: 6000, amount: total / 100,
    title: fresh.length === 1 ? copy('มีการชำระเงินใหม่', 'New payment') : copy(`มีการชำระเงินใหม่ ${fresh.length} รายการ`, `${fresh.length} new payments`),
    message: fresh.length === 1 ? `${fresh[0].displayName} · ${fresh[0].publicId}` : copy(`ล่าสุดจาก ${fresh[0].displayName}`, `Latest from ${fresh[0].displayName}`),
  });
}

export default function AdminDashboard({ userId, triggerConfirm, mobile = false, onMobileBack }: {
  userId: string; triggerConfirm: Confirm;
  /** Phones (the app's phone layout): the page is drawn in the phone design instead. */
  mobile?: boolean;
  onMobileBack?: () => void;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  const [range, setRange] = useState<AnalyticsRange>(30);
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<AdminAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<AccountPlanStatus | 'all'>('all');
  const [personaFilter, setPersonaFilter] = useState<AccountPersona | 'all'>('all');
  const [selectedAccount, setSelectedAccount] = useState<AdminAnalyticsAccount | null>(null);
  const [operationsPanel, setOperationsPanel] = useState<OperationsPanel>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    setSelectedAccount(null);
    adminAnalyticsApi.snapshot(userId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, range, revision]);

  // Live revenue (owner, 2026-10-22, phones included): while the page is open and on screen, ask every
  // 15 seconds whether a payment arrived or was refunded. On a change, reload the numbers quietly
  // (no skeleton) and announce new payments. Hidden tabs do not ask; returning to the tab asks at once.
  const [live, setLive] = useState(false);
  const [liveTick, setLiveTick] = useState(0);
  const dataRef = useRef<AdminAnalyticsSummary | null>(null);
  dataRef.current = data;
  const hasData = Boolean(data);
  useEffect(() => {
    if (!hasData) { setLive(false); return; }
    let stopped = false;
    let busy = false;
    let baseline = dataRef.current?.liveSignature ?? null;
    setLive(baseline !== null);
    const controller = new AbortController();
    const check = async () => {
      if (stopped || busy || document.hidden) return;
      busy = true;
      try {
        const { signature } = await adminAnalyticsApi.pulse(userId, controller.signal);
        if (stopped) return;
        setLive(true);
        if (baseline === null) { baseline = signature; return; }
        if (signature === baseline) return;
        const before = dataRef.current;
        const next = await adminAnalyticsApi.snapshot(userId, range, controller.signal);
        if (stopped) return;
        baseline = next.liveSignature ?? signature;
        setData(next);
        setLiveTick(value => value + 1);
        announceNewPayments(before, next, copy);
      } catch (cause) {
        if (stopped) return;
        setLive(false);
        // Access changed (signed out, or no longer the owner): a full reload clears the money shown.
        if ([401, 403].includes(Number((cause as { status?: number }).status))) setRevision(value => value + 1);
      } finally { busy = false; }
    };
    const timer = window.setInterval(() => { void check(); }, LIVE_CHECK_MS);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    if (baseline === null) void check();
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, userId, range]);

  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const formatMoney = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'THB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  const formatDate = (value: string, compact = false) => value ? new Date(value.includes('T') ? value : `${value}T12:00:00+07:00`).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', ...(compact ? {} : { year: 'numeric' }) }) : '—';
  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.accounts || []).filter(account => {
      const matchesQuery = !normalized || `${account.displayName} ${account.publicId} ${account.jobTypes.join(' ')}`.toLowerCase().includes(normalized);
      return matchesQuery && (planFilter === 'all' || account.planStatus === planFilter) && (personaFilter === 'all' || account.persona === personaFilter);
    });
  }, [data?.accounts, query, planFilter, personaFilter]);

  const views: { key: View; label: string; icon: LucideIcon }[] = [
    { key: 'overview', label: copy('ภาพรวม', 'Overview'), icon: BarChart3 },
    { key: 'product', label: copy('การใช้ฟีเจอร์', 'Product usage'), icon: Activity },
    { key: 'revenue', label: copy('รายได้ / Pro', 'Revenue / Pro'), icon: CircleDollarSign },
    { key: 'customers', label: copy('รายบัญชี', 'Customers'), icon: UsersRound },
    { key: 'feedback', label: copy('ข้อความจากผู้ใช้', 'User feedback'), icon: MessageSquare },
    { key: 'operations', label: copy('จัดการระบบ', 'Operations'), icon: BriefcaseBusiness },
  ];

  const bestFeature = data?.features.find(feature => feature.activeUsers > 0);
  const upgradeFeature = data?.features.filter(feature => feature.key !== 'plans' && feature.freeUsers > 0).sort((a, b) => b.freeUsers - a.freeUsers)[0];
  const strongestPersona = data?.personas.filter(persona => persona.accounts > 0).sort((a, b) => (b.proAccounts / b.accounts) - (a.proAccounts / a.accounts))[0];

  if (mobile) {
    return (
      <Suspense fallback={null}>
        <AdminDashboardPhone userId={userId} triggerConfirm={triggerConfirm} data={data} loading={loading} error={error} range={range}
          onRange={setRange} onRefresh={() => setRevision(value => value + 1)} live={live} onBack={onMobileBack}
          onRoleChanged={async () => setRevision(value => value + 1)} language={language} />
      </Suspense>
    );
  }

  return (
    <section aria-labelledby="admin-dashboard-title" className="space-y-5 pb-8">
      <PageHeader page="adminDashboard" id="admin-dashboard-title">
        {view !== 'feedback' && <div className="flex flex-wrap items-center gap-2">
          <select className="ui-input !w-auto" aria-label={copy('เลือกช่วงเวลา', 'Select date range')} value={range} onChange={event => setRange(Number(event.target.value) as AnalyticsRange)}>
            {([7, 30, 90] as AnalyticsRange[]).map(days => <option key={days} value={days}>{copy(`${days} วันล่าสุด`, `Last ${days} days`)}</option>)}
          </select>
          {live && <span className="inline-flex items-center gap-1.5 px-1 text-[12px] font-medium text-brand-muted" title={copy('ยอดรายได้อัปเดตเองทุก 15 วินาทีขณะเปิดหน้านี้', 'Revenue updates by itself every 15 seconds while this page is open')}><span className="h-2 w-2 rounded-full bg-brand-green-acc" aria-hidden="true" />{copy('อัปเดตอัตโนมัติ', 'Live updates')}</span>}
          <button type="button" className={secondary} onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{copy('อัปเดต', 'Refresh')}</button>
        </div>}
      </PageHeader>

      <div className="overflow-x-auto border-b border-brand-border">
        <nav className="flex min-w-max gap-1" aria-label={copy('หมวดการวิเคราะห์', 'Analytics sections')}>
          {views.map(item => <button key={item.key} type="button" onClick={() => setView(item.key)} className={`${tabButton} ${view === item.key ? 'border-brand-blue-acc text-brand-blue-acc' : 'border-transparent text-brand-muted hover:text-brand-text'}`} aria-current={view === item.key ? 'page' : undefined}>{item.label}</button>)}
        </nav>
      </div>

      {(view === 'overview' || view === 'revenue') && <Suspense fallback={null}><AdminStripeFinance userId={userId} range={range} revision={revision} liveTick={liveTick} detailed={view === 'revenue'} onViewDetails={() => setView('revenue')} /></Suspense>}
      {view === 'feedback' && <Suspense fallback={<div className={`${surface} p-6`}><SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="mt-5 h-44 w-full" /></div>}><AdminFeedbackInbox userId={userId} /></Suspense>}
      {view !== 'feedback' && error && <div role="alert" className="rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
      {view !== 'feedback' && (loading && !data ? <AnalyticsSkeleton /> : data && (
        <>
          {view === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label={copy('รายได้ Pro ที่บันทึกในแอป', 'Recorded app Pro revenue')} value={formatMoney(data.totals.revenue)} detail={copy(`${data.totals.paymentCount} รายการชำระเงิน`, `${data.totals.paymentCount} payments`)} change={delta(data.totals.revenue, data.totals.previousRevenue)} /><KpiCard label={copy('บัญชีที่สมัครทั้งหมด', 'Registered accounts')} value={data.totals.accounts.toLocaleString(locale)} detail={copy(`ใช้งานในช่วงนี้ ${data.totals.activeUsers.toLocaleString(locale)} คน`, `${data.totals.activeUsers.toLocaleString(locale)} active in this period`)} />
                <KpiCard label={copy('สมาชิก Pro', 'Pro members')} value={data.totals.proAccounts.toLocaleString(locale)} detail={copy(`${data.totals.paidProAccounts} จ่ายเอง · ${data.totals.proAccounts - data.totals.paidProAccounts} แอดมินให้`, `${data.totals.paidProAccounts} paid · ${data.totals.proAccounts - data.totals.paidProAccounts} granted`)} />
                <KpiCard label={copy('สมัครใหม่ในช่วงนี้', 'New registrations')} value={data.totals.newAccounts.toLocaleString(locale)} detail={copy(`${range} วันล่าสุด · ${data.totals.trialAccounts} บัญชีกำลังทดลอง`, `Last ${range} days · ${data.totals.trialAccounts} in trial`)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
                <section className={`${surface} p-5 sm:p-6`}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="mt-1 text-[15px] font-semibold">{copy('ผู้ใช้งานและรายได้รายวัน', 'Daily activity and revenue')}</h2></div><p className="text-xs text-brand-muted">{formatDate(data.fromDate)} – {formatDate(data.toDate)}</p></div>
                  <TrendChart data={data.daily} formatDate={formatDate} />
                </section>

                <section className={`${surface} p-5 sm:p-6`}>
                  <h2 className="text-[15px] font-semibold">{copy('สิ่งที่ควรทำต่อ', 'What to do next')}</h2>
                  <div className="mt-4 divide-y divide-brand-border">
                    {[
                      { title: copy('ใช้ฟีเจอร์ที่มีแรงส่งพาคนไป Pro', 'Use the strongest feature to drive upgrades'), body: bestFeature ? copy(`${featureLabels[bestFeature.key][0]} มีผู้ใช้สูงสุด ${bestFeature.activeUsers} คน`, `${featureLabels[bestFeature.key][1]} leads with ${bestFeature.activeUsers} users`) : copy('รอข้อมูลการใช้งานเพิ่ม', 'Waiting for more usage data') },
                      { title: copy('วาง CTA อัปเกรดในจุดที่ Free ใช้เยอะ', 'Place upgrade prompts where free usage is high'), body: upgradeFeature ? copy(`${featureLabels[upgradeFeature.key][0]} มีผู้ใช้ Free ${upgradeFeature.freeUsers} คน`, `${featureLabels[upgradeFeature.key][1]} has ${upgradeFeature.freeUsers} free users`) : copy('ยังไม่มีสัญญาณเพียงพอ', 'Not enough signal yet') },
                      { title: copy('โฟกัสกลุ่มที่เปลี่ยนเป็น Pro ได้ดีที่สุด', 'Focus on the highest-converting persona'), body: strongestPersona ? `${personaLabels[strongestPersona.key][language === 'th' ? 0 : 1]} · ${percent(strongestPersona.proAccounts / strongestPersona.accounts)}` : copy('ยังไม่มีข้อมูล Persona', 'No persona data yet') },
                    ].map(insight => <div key={insight.title} className="py-3 first:pt-0 last:pb-0"><p className="text-[13px] font-medium">{insight.title}</p><p className="mt-1 text-xs leading-relaxed text-brand-muted">{insight.body}</p></div>)}
                  </div>
                </section>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className={`${surface} p-5 sm:p-6`}>
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">{copy('เส้นทางลูกค้า', 'Customer lifecycle')}</h2><span className="text-xs text-brand-muted">{range} {copy('วัน', 'days')}</span></div>
                  <div className="mt-5 space-y-4">
                    {[
                      [copy('บัญชีทั้งหมด', 'All accounts'), data.totals.accounts, 'bg-brand-blue-acc/70'],
                      [copy('ใช้งานในช่วงนี้', 'Active in period'), data.totals.activeUsers, 'bg-brand-blue-acc'],
                      [copy('กำลังทดลอง', 'In trial'), data.totals.trialAccounts, 'bg-brand-blue-acc/40'],
                      [copy('Pro แบบชำระเงิน', 'Paid Pro'), data.totals.paidProAccounts, 'bg-brand-blue-acc'],
                    ].map(([label, value, color]) => { const amount = Number(value); return <div key={String(label)}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{label}</span><span className="font-semibold tabular-nums">{amount.toLocaleString(locale)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-brand-faint"><div className={`h-full rounded-full ${color}`} style={{ width: `${data.totals.accounts ? Math.max(amount ? 3 : 0, amount / data.totals.accounts * 100) : 0}%` }} /></div></div>; })}
                  </div>
                </section>
                <section className={`${surface} p-5 sm:p-6`}>
                  <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold">{copy('กลุ่มผู้ใช้', 'User personas')}</h2><button type="button" onClick={() => setView('customers')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue-acc">{copy('ดูรายบัญชี', 'View accounts')}<ArrowRight size={14} /></button></div>
                  <div className="mt-4 divide-y divide-brand-border/60">
                    {data.personas.map(persona => <div key={persona.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-sm font-semibold">{personaLabels[persona.key][language === 'th' ? 0 : 1]}</p><p className="mt-0.5 text-xs text-brand-muted">{persona.activeUsers} {copy('คนใช้งาน', 'active')}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{persona.accounts}</p><p className="text-[11px] text-brand-muted">{copy('บัญชี', 'accounts')}</p></div><div className="w-16 text-right"><p className="text-sm font-semibold tabular-nums text-brand-green-acc">{persona.accounts ? percent(persona.proAccounts / persona.accounts) : '0%'}</p><p className="text-[11px] text-brand-muted">Pro</p></div></div>)}
                  </div>
                </section>
              </div>
            </div>
          )}

          {view === 'product' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3"><KpiCard label={copy('จำนวนเปิดฟีเจอร์', 'Feature views')} value={data.totals.pageViews.toLocaleString(locale)} detail={`${range} ${copy('วันที่ผ่านมา', 'days')}`} /><KpiCard label={copy('ผู้ใช้ไม่ซ้ำ', 'Unique users')} value={data.totals.activeUsers.toLocaleString(locale)} detail={copy('เชื่อมกับบัญชีแล้ว', 'Account-linked')} /><KpiCard label={copy('เฉลี่ยต่อผู้ใช้', 'Views per user')} value={(data.totals.activeUsers ? data.totals.pageViews / data.totals.activeUsers : 0).toLocaleString(locale, { maximumFractionDigits: 1 })} detail={copy('ครั้งต่อคน', 'views per user')} /></div>
              <section className={`${surface} overflow-hidden`}>
                <div className="border-b border-brand-border/60 p-5 sm:p-6"><h2 className="mt-1 text-base font-semibold">{copy('ฟีเจอร์ไหนถูกใช้ และใครเป็นคนใช้', 'Which features are used, and by whom')}</h2><p className="mt-1 text-sm text-brand-muted">{copy('เปรียบเทียบผู้ใช้ Free กับบัญชีที่มีสิทธิ์ Pro ในช่วงเวลาที่เลือก', 'Current Free vs Pro account usage in the selected period')}</p></div>
                <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-brand-bg/70 text-xs text-brand-muted"><tr><th className="px-5 py-3 font-semibold">{copy('ฟีเจอร์', 'Feature')}</th><th className="px-4 py-3 text-right font-semibold">{copy('ผู้ใช้', 'Users')}</th><th className="px-4 py-3 text-right font-semibold">{copy('เปิดทั้งหมด', 'Views')}</th><th className="px-4 py-3 font-semibold">Free / Pro</th><th className="px-5 py-3 font-semibold">{copy('สัญญาณ', 'Signal')}</th></tr></thead><tbody className="divide-y divide-brand-border/50">{data.features.map(feature => { const total = feature.freeViews + feature.proViews; const freeShare = total ? feature.freeViews / total : 0; return <tr key={feature.key} className="hover:bg-brand-bg/45"><td className="px-5 py-4"><p className="font-semibold">{featureLabels[feature.key][language === 'th' ? 0 : 1]}</p><p className="mt-0.5 font-mono text-[11px] text-brand-muted">{feature.key}</p></td><td className="px-4 py-4 text-right font-semibold tabular-nums">{feature.activeUsers.toLocaleString(locale)}</td><td className="px-4 py-4 text-right tabular-nums text-brand-muted">{feature.pageViews.toLocaleString(locale)}</td><td className="px-4 py-4"><div className="flex h-2 w-36 overflow-hidden rounded-full bg-brand-faint"><div className="bg-stone-400" style={{ width: `${freeShare * 100}%` }} /><div className="bg-brand-blue-acc" style={{ width: `${(1 - freeShare) * 100}%` }} /></div><p className="mt-1.5 text-[11px] text-brand-muted">{feature.freeUsers} Free · {feature.proUsers} Pro</p></td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${feature.freeUsers > feature.proUsers * 2 && feature.freeUsers >= 3 ? 'bg-brand-blue-bg text-brand-blue-acc' : feature.proUsers > 0 ? 'bg-brand-faint text-brand-muted' : 'bg-brand-faint text-brand-muted'}`}>{feature.freeUsers > feature.proUsers * 2 && feature.freeUsers >= 3 ? copy('โอกาสวางจุดอัปเกรด', 'Upgrade opportunity') : feature.proUsers > 0 ? copy('Pro ใช้งานจริง', 'Used by Pro') : copy('รอข้อมูลเพิ่ม', 'More data needed')}</span></td></tr>; })}</tbody></table></div>
              </section>
              <p className="px-1 text-[11px] leading-relaxed text-brand-muted">{copy('หมายเหตุ: การแยก Free/Pro อ้างอิงสิทธิ์ปัจจุบันของบัญชี ระบบจับคู่รหัสการใช้งานแบบนิรนามเฉพาะใน API หลังบ้าน และไม่เก็บอีเมล, URL หรือข้อมูลที่กรอก', 'Note: Free/Pro segmentation uses each account’s current access. Pseudonymous usage keys are resolved only inside the private admin API; emails, URLs, and entered content are not recorded.')}</p>
            </div>
          )}

          {view === 'revenue' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label={copy('รายได้ Pro ที่บันทึกในแอป', 'Recorded app Pro revenue')} value={formatMoney(data.totals.revenue)} detail={`${range} ${copy('วัน', 'days')}`} change={delta(data.totals.revenue, data.totals.previousRevenue)} /><KpiCard label={copy('รายการชำระเงิน', 'Payments')} value={data.totals.paymentCount.toLocaleString(locale)} detail={copy('ไม่รวมรายการคืนเงิน', 'Excludes refunds')} /><KpiCard label={copy('รายได้ต่อผู้จ่าย', 'Revenue per payer')} value={formatMoney(data.totals.averageRevenuePerPayer)} detail={copy('ในช่วงเวลานี้', 'In selected period')} /><KpiCard label={copy('สมาชิก Pro ที่จ่ายเอง', 'Paid Pro accounts')} value={data.totals.paidProAccounts.toLocaleString(locale)} detail={percent(data.totals.conversionRate)} /></div>
              <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
                <section className={`${surface} p-5 sm:p-6`}><h2 className="text-[15px] font-semibold">{copy('รายได้ Pro รายวันในแอป', 'Daily recorded Pro revenue')}</h2><TrendChart data={data.daily} formatDate={formatDate} /></section>
                <section className={`${surface} overflow-hidden`}><div className="flex items-center justify-between gap-3 border-b border-brand-border/60 p-5"><div><h2 className="text-[15px] font-semibold">{copy('ประวัติการเติม Pro', 'Pro payment ledger')}</h2><p className="mt-1 text-xs text-brand-muted">{copy('ล่าสุด 200 รายการ รวมรายการคืนเงิน', 'Latest 200 records, including refunds')}</p></div><CircleDollarSign size={20} className="text-brand-green-acc" /></div><div className="max-h-[480px] overflow-auto divide-y divide-brand-border/50">{data.payments.length ? data.payments.map(payment => <button key={payment.id} type="button" className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-brand-bg/60" onClick={() => { const account = data.accounts.find(item => item.userId === payment.userId); if (account) setSelectedAccount(account); }}><div className="min-w-0"><p className="truncate text-sm font-semibold">{payment.displayName}</p><p className="mt-0.5 text-xs text-brand-muted">{payment.publicId} · {formatDate(payment.paidAt)}</p></div><div className="shrink-0 text-right"><p className={`font-semibold tabular-nums ${payment.refunded ? 'text-brand-pink-acc line-through' : 'text-brand-green-acc'}`}>{formatMoney(payment.amount)}</p><p className="mt-0.5 text-[11px] uppercase text-brand-muted">{payment.refunded ? 'Refunded' : payment.currency}</p></div></button>) : <p className="p-8 text-center text-sm text-brand-muted">{copy('ยังไม่มีประวัติการชำระเงิน', 'No payment history yet')}</p>}</div></section>
              </div>
            </div>
          )}

          {view === 'customers' && (
            <section className={`${surface} overflow-hidden`}>
              <div className="border-b border-brand-border/60 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="mt-1 text-base font-semibold">{copy('พฤติกรรมและมูลค่ารายบัญชี', 'Account behavior and value')}</h2><p className="mt-1 text-sm text-brand-muted">{filteredAccounts.length.toLocaleString(locale)} {copy('บัญชีที่ตรงกับตัวกรอง', 'matching accounts')}</p></div></div><div className="mt-5 grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_180px]"><label className="relative"><span className="sr-only">{copy('ค้นหาบัญชี', 'Search accounts')}</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy('ค้นหาชื่อ, Public ID, ประเภทงาน', 'Search name, public ID, work type')} className="ui-input pl-9" /></label><select aria-label={copy('กรองตามแพ็กเกจ', 'Filter by plan')} className="ui-input" value={planFilter} onChange={event => setPlanFilter(event.target.value as AccountPlanStatus | 'all')}><option value="all">{copy('ทุกแพ็กเกจ', 'All plans')}</option>{Object.entries(planLabels).map(([key, labels]) => <option key={key} value={key}>{labels[language === 'th' ? 0 : 1]}</option>)}</select><select aria-label={copy('กรองตามกลุ่มผู้ใช้', 'Filter by persona')} className="ui-input" value={personaFilter} onChange={event => setPersonaFilter(event.target.value as AccountPersona | 'all')}><option value="all">{copy('ทุกกลุ่มผู้ใช้', 'All personas')}</option>{Object.entries(personaLabels).map(([key, labels]) => <option key={key} value={key}>{labels[language === 'th' ? 0 : 1]}</option>)}</select></div></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-brand-bg/70 text-xs text-brand-muted"><tr><th className="px-5 py-3 font-semibold">{copy('บัญชี', 'Account')}</th><th className="px-4 py-3 font-semibold">{copy('ประเภท', 'Persona')}</th><th className="px-4 py-3 font-semibold">{copy('แพ็กเกจ', 'Plan')}</th><th className="px-4 py-3 text-right font-semibold">{copy('ใช้งาน', 'Usage')}</th><th className="px-4 py-3 text-right font-semibold">{copy('ยอดเติมสะสม', 'Lifetime spend')}</th><th className="px-5 py-3 text-right font-semibold">{copy('ล่าสุด', 'Last active')}</th></tr></thead><tbody className="divide-y divide-brand-border/50">{filteredAccounts.map(account => <tr key={account.userId} className="group cursor-pointer hover:bg-brand-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-acc" onClick={() => setSelectedAccount(account)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAccount(account); } }} tabIndex={0} aria-label={`${copy('เปิดรายละเอียดบัญชี', 'Open account details')} ${account.displayName}`}><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-faint font-semibold text-brand-text dark:text-white">{account.displayName.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-semibold">{account.displayName}</p><p className="mt-0.5 font-mono text-[11px] text-brand-muted">{account.publicId}</p></div></div></td><td className="px-4 py-4"><p className="font-semibold">{personaLabels[account.persona][language === 'th' ? 0 : 1]}</p><p className="mt-0.5 max-w-40 truncate text-[11px] text-brand-muted">{account.jobTypes.join(', ') || '—'}</p></td><td className="px-4 py-4"><PlanBadge status={account.planStatus} language={language} /></td><td className="px-4 py-4 text-right"><p className="font-semibold tabular-nums">{account.activeDays} {copy('วัน', 'days')}</p><p className="text-[11px] text-brand-muted">{account.pageViews.toLocaleString(locale)} views</p></td><td className="px-4 py-4 text-right font-semibold tabular-nums">{formatMoney(account.totalSpent)}</td><td className="px-5 py-4 text-right"><span className="inline-flex items-center gap-2 text-xs text-brand-muted">{account.lastSeenAt ? formatDate(account.lastSeenAt, true) : '—'}<ChevronRight size={14} className="transition group-hover:translate-x-0.5" /></span></td></tr>)}</tbody></table>{!filteredAccounts.length && <p className="p-10 text-center text-sm text-brand-muted">{copy('ไม่พบบัญชีที่ตรงกับตัวกรอง', 'No accounts match these filters')}</p>}</div>
            </section>
          )}

          {view === 'operations' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><button type="button" onClick={() => setOperationsPanel('users')} className={`${surface} p-6 text-left transition hover:border-brand-blue-acc/60 hover:bg-brand-faint/30`}><div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand-faint text-brand-muted"><UsersRound size={21} /></span><ArrowRight size={18} className="text-brand-muted" /></div><h2 className="mt-5 text-[15px] font-semibold">{copy('จัดการผู้ใช้', 'Manage users')}</h2><p className="mt-1 text-sm leading-relaxed text-brand-muted">{copy('ค้นหาบัญชี เปลี่ยนสิทธิ์ Admin ให้หรือยกเลิก Pro', 'Search accounts, change admin roles, grant or revoke Pro')}</p></button><button type="button" onClick={() => setOperationsPanel('groups')} className={`${surface} p-6 text-left transition hover:border-brand-blue-acc/60 hover:bg-brand-faint/30`}><div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand-blue-bg text-brand-blue-acc"><BriefcaseBusiness size={21} /></span><ArrowRight size={18} className="text-brand-muted" /></div><h2 className="mt-5 text-[15px] font-semibold">{copy('จัดการทีม', 'Manage groups')}</h2><p className="mt-1 text-sm leading-relaxed text-brand-muted">{copy('ดูทีม สมาชิก คำเชิญ และบทบาทภายในทีม', 'Review groups, members, invitations, and team roles')}</p></button></div>
              {operationsPanel && <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{operationsPanel === 'users' ? copy('จัดการผู้ใช้', 'Manage users') : copy('จัดการทุกทีม', 'Manage all groups')}</h2><button type="button" className={secondary} onClick={() => setOperationsPanel(null)}><X size={16} />{copy('ปิด', 'Close')}</button></div>{operationsPanel === 'users' ? <Suspense fallback={<AdminUsersLoadingSkeleton />}><AdminUsersPanel userId={userId} triggerConfirm={triggerConfirm} onRoleChanged={async () => setRevision(value => value + 1)} /></Suspense> : <Suspense fallback={<GroupsLoadingSkeleton />}><GroupsTab userId={userId} isGuest={false} triggerConfirm={triggerConfirm} initialScope="all" embedded /></Suspense>}</section>}
            </div>
          )}
        </>
      ))}

      {selectedAccount && data && <AccountDrawer account={selectedAccount} data={data} language={language} onClose={() => setSelectedAccount(null)} formatDate={formatDate} formatMoney={formatMoney} />}
      {view !== 'feedback' && <div className="flex items-start gap-2 rounded-xl border border-brand-border/50 bg-brand-bg/50 px-4 py-3 text-[11px] leading-relaxed text-brand-muted"><Lightbulb size={14} className="mt-0.5 shrink-0 text-brand-muted" /><p>{copy('Analytics นี้แสดงเฉพาะข้อมูลเพื่อบริหารผลิตภัณฑ์และรายได้ ไม่แสดงรายละเอียดกระแสเงินสด งาน ลูกค้า หรือเอกสารทางการเงินส่วนตัวของผู้ใช้', 'This analytics workspace is limited to product and revenue operations. It does not expose users’ private cash flow, jobs, clients, or financial documents.')}</p></div>}
    </section>
  );
}

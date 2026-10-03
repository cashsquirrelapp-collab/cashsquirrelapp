import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  Crown,
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
import { groupApi } from '../../services/groups';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [activePanel, setActivePanel] = useState<DashboardPanel | null>(null);
  const [detail, setDetail] = useState<AdminDashboardDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailPage, setDetailPage] = useState(0);
  const detailPanelRef = useRef<HTMLElement>(null);
  const openPanel = (panelName: DashboardPanel) => {
    setActivePanel(panelName);
    setDetailPage(0);
    setDetailError('');
  };

  useEffect(() => {
    if (!activePanel) return;
    detailPanelRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
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
      label: copy('Pro แบบชำระเงิน', 'Paid Pro accounts'),
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
              ? copy('บัญชี Pro แบบชำระเงิน', 'Paid Pro accounts')
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
                          </div>
                          {activePanel === 'pro' ? (
                            <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                              {account.plan || 'Pro'} · {copy('หมดอายุ', 'Expires')} {formatDate(account.currentPeriodEnd)}
                            </span>
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

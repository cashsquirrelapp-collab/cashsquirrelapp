import { useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  Crown,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UserRoundX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AdminDashboardStats } from '../../../../shared/groups';
import { groupApi } from '../../services/groups';
import { getCurrentAccount } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { panel, secondary } from './groupUi';

type DashboardCard = {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  action?: () => void;
  highlight?: boolean;
};

export default function AdminDashboard({
  userId,
  onOpenUsers,
  onOpenGroups,
}: {
  userId: string;
  onOpenUsers: () => void;
  onOpenGroups: () => void;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

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

  const cards: DashboardCard[] = stats ? [
    {
      label: copy('บัญชีทั้งหมด', 'Total accounts'),
      value: stats.totalAccounts,
      icon: UserRound,
      color: 'text-brand-text',
    },
    {
      label: 'Admin',
      value: stats.adminAccounts,
      icon: ShieldCheck,
      color: 'text-brand-blue-acc',
      action: onOpenUsers,
    },
    {
      label: copy('กลุ่มทั้งหมด', 'Total groups'),
      value: stats.totalGroups,
      icon: BriefcaseBusiness,
      color: 'text-brand-text',
      action: onOpenGroups,
    },
    {
      label: copy('Pro แบบชำระเงิน', 'Paid Pro accounts'),
      value: stats.proAccounts,
      icon: Crown,
      color: 'text-amber-600',
      action: onOpenUsers,
    },
    {
      label: copy('คำเชิญที่ยังไม่หมดอายุ', 'Open invitations'),
      value: stats.pendingInvitations,
      icon: Mail,
      color: 'text-brand-blue-acc',
      action: onOpenGroups,
    },
    {
      label: copy('พักบัญชีอยู่', 'Temporarily paused'),
      value: stats.pausedAccounts,
      icon: UserRound,
      color: 'text-brand-muted',
      action: onOpenUsers,
    },
    {
      label: copy('รอลบบัญชีถาวร', 'Pending permanent deletion'),
      value: stats.pendingDeletions,
      icon: UserRoundX,
      color: stats.pendingDeletions ? 'text-orange-600' : 'text-brand-muted',
      action: onOpenUsers,
      highlight: stats.pendingDeletions > 0,
    },
  ] : [];
  const displayCards: (DashboardCard | { skeleton: true; key: number })[] =
    loading && !stats
      ? Array.from({ length: 7 }, (_, key) => ({ skeleton: true as const, key }))
      : cards;

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
          const className = `${panel} min-h-32 text-left transition-colors ${card.highlight ? 'border-orange-300/70 bg-orange-50/60 dark:bg-orange-950/10' : ''} ${card.action ? 'hover:border-brand-blue-acc/50 hover:bg-brand-faint/40' : ''}`;
          const content = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-brand-muted">{card.label}</p>
                <Icon size={18} className={`${card.color} shrink-0`} />
              </div>
              <p className={`mt-4 text-3xl font-display font-extrabold tabular-nums ${card.color}`}>
                {card.value.toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}
              </p>
            </>
          );
          return card.action
            ? (
              <button key={card.label} type="button" className={className} onClick={card.action}>
                {content}
              </button>
            )
            : <div key={card.label} className={className}>{content}</div>;
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
          <button type="button" className={secondary} onClick={onOpenUsers}>{copy('จัดการผู้ใช้', 'Manage users')}</button>
          <button type="button" className={secondary} onClick={onOpenGroups}>{copy('ดูทุกกลุ่ม', 'View groups')}</button>
        </div>
      </div>
    </section>
  );
}

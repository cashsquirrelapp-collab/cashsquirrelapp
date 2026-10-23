import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AccountPersona, AccountPlanStatus, AdminAnalyticsAccount, AdminAnalyticsSummary, AnalyticsRange } from '../../../../shared/adminAnalytics';
import { MobilePageHero } from '../mobile/MobilePageHero';
import { MobileSheet } from '../mobile/MobileHome';
import { KsIcon, type KsIconName } from '../mobile/icons';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { formatCurrency } from '../../utils';
import { featureLabels, personaLabels, planLabels } from './adminLabels';
import type { Confirm } from './groupUi';

// The admin dashboard on phones, in the phone app's own design (owner, 2026-10-22: "อิงตามแบบมือถือ
// ... ไม่ต้องเอาเหมือนในคอม"): the terracotta header carries the period's revenue, the figures sit in
// the phone's metric cards, and every other part opens as its own page from a list, as in the menu.
// Same data and actions as the computer layout; styles are the shared .ksm classes in mobile.css.

const AdminUsersPanel = lazy(() => import('./AdminUsersPanel'));
const GroupsTab = lazy(() => import('./GroupsTab'));
const AdminFeedbackInbox = lazy(() => import('../feedback/AdminFeedbackInbox'));

type Page = 'payments' | 'accounts' | 'features' | 'feedback' | 'users' | 'groups';
type Copy = (th: string, en: string) => string;

const baht = (minor: number) => formatCurrency(minor / 100);
const RANGES: AnalyticsRange[] = [7, 30, 90];

function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}
function percent(value: number) {
  return `${(value * 100).toLocaleString('th-TH', { maximumFractionDigits: 1 })}%`;
}

/** Daily bars: a quiet chart that fits a phone card. */
function Bars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="ksm-admin-bars" role="img" aria-label={label}>
      {values.map((value, index) => <i key={index} className={value ? 'is-on' : undefined} style={{ height: `${value ? Math.max(8, (value / max) * 100) : 4}%` }} />)}
    </div>
  );
}

export default function AdminDashboardPhone({
  userId, triggerConfirm, data, loading, error, range, onRange, onRefresh, live, onBack, onRoleChanged, language,
}: {
  userId: string;
  triggerConfirm: Confirm;
  data: AdminAnalyticsSummary | null;
  loading: boolean;
  error: string;
  range: AnalyticsRange;
  onRange: (range: AnalyticsRange) => void;
  onRefresh: () => void;
  /** Revenue updates by itself (the dashboard's 15-second check). */
  live: boolean;
  /** Back to the phone menu. */
  onBack?: () => void;
  onRoleChanged: () => Promise<void>;
  language: 'th' | 'en';
}) {
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const lang = language === 'th' ? 0 : 1;
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const [page, setPage] = useState<Page | null>(null);
  const [account, setAccount] = useState<AdminAnalyticsAccount | null>(null);
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<AccountPlanStatus | 'all'>('all');
  const [persona, setPersona] = useState<AccountPersona | 'all'>('all');

  const go = (next: Page | null) => {
    setPage(next);
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  };
  const day = (value: string | null) => (value ? new Date(value.includes('T') ? value : `${value}T12:00:00+07:00`).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const openAccount = (id: string) => { const found = data?.accounts.find(item => item.userId === id); if (found) setAccount(found); };

  const accounts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (data?.accounts || []).filter(item => (!text || `${item.displayName} ${item.publicId} ${item.jobTypes.join(' ')}`.toLowerCase().includes(text))
      && (plan === 'all' || item.planStatus === plan) && (persona === 'all' || item.persona === persona));
  }, [data?.accounts, query, plan, persona]);

  const actions = (
    <>
      {live && <span className="ksm-admin-live" title={copy('ยอดรายได้อัปเดตเองทุก 15 วินาทีขณะเปิดหน้านี้', 'Revenue updates by itself every 15 seconds')}><i aria-hidden="true" />{copy('สด', 'Live')}</span>}
      <button type="button" className="ksm-toolbtn" onClick={onRefresh} disabled={loading} aria-label={copy('อัปเดต', 'Refresh')}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
    </>
  );
  const back = { onBack: () => go(null), backLabel: copy('แดชบอร์ด', 'Dashboard') };
  const totals = data?.totals;
  const revenueChange = totals ? change(totals.revenue, totals.previousRevenue) : null;
  // The header measures its box once, when it first draws (useCollapsingCard): every page that has a box
  // draws it from the start, with a dash until the figures arrive, and never swaps a tappable box for a
  // plain one (that swaps the measured element).
  const pending = <p>{loading ? copy('กำลังโหลดตัวเลข…', 'Loading figures…') : copy('ยังโหลดตัวเลขไม่ได้', 'Figures unavailable')}</p>;
  const revenueBox = {
    label: copy(`รายได้ Pro · ${range} วันล่าสุด`, `Pro revenue · last ${range} days`),
    icon: 'wallet' as KsIconName,
    amount: totals ? baht(totals.revenue) : '—',
    region: copy('สรุปรายได้', 'Revenue summary'),
    detail: totals ? <p>{copy(`${totals.paymentCount} รายการชำระเงิน`, `${totals.paymentCount} payments`)}{revenueChange !== null && <> · {revenueChange >= 0 ? '+' : '−'}{percent(Math.abs(revenueChange))} {copy('จากช่วงก่อน', 'vs previous')}</>}</p> : pending,
  };

  const rangeSwitch = (
    <div className="ksm-scope" role="tablist" aria-label={copy('ช่วงเวลา', 'Period')}>
      {RANGES.map(days => <button key={days} type="button" role="tab" aria-selected={range === days} onClick={() => onRange(days)}>{copy(`${days} วัน`, `${days} days`)}</button>)}
    </div>
  );
  const failed = error && <div className="ksm-empty ksm-admin-error" role="alert"><h3>{copy('โหลดสถิติไม่สำเร็จ', 'Could not load statistics')}</h3><p>{error}</p><button type="button" className="ksm-link" onClick={onRefresh}>{copy('ลองใหม่', 'Try again')}</button></div>;
  const waiting = loading && !data && (
    <div className="ksm-admin-loading" aria-hidden="true">
      <div className="ksm-metrics">{[0, 1, 2, 3].map(item => <div key={item} className="ksm-metric"><SkeletonBlock className="h-3 w-20" /><SkeletonBlock className="mt-3 h-7 w-16" /></div>)}</div>
      <SkeletonBlock className="mt-3 h-40 w-full rounded-2xl" />
    </div>
  );

  const paymentRow = (payment: AdminAnalyticsSummary['payments'][number]) => (
    <button key={payment.id} type="button" onClick={() => openAccount(payment.userId)} aria-label={`${payment.displayName} ${baht(payment.amount)}${payment.refunded ? ` ${copy('คืนเงินแล้ว', 'refunded')}` : ''}`}>
      <span className={`ksm-list-icon${payment.refunded ? ' is-neutral' : ''}`}><KsIcon name="receive" /></span>
      <span className="ksm-grow"><b>{payment.displayName}</b><p>{payment.publicId} · {day(payment.paidAt)}</p></span>
      <strong className={payment.refunded ? 'ksm-admin-refunded' : 'ksm-admin-paid'}>{baht(payment.amount)}</strong>
    </button>
  );

  // ── Pages opened from the dashboard ───────────────────────────────────────────────────────────
  let body: ReactNode;
  if (page === 'payments') {
    body = (
      <>
        <MobilePageHero key="payments" title={copy('รายได้', 'Revenue')} {...back} actions={actions} box={{ ...revenueBox, detail: totals ? <p>{copy(`${totals.paymentCount} รายการ · เฉลี่ย ${baht(totals.averageRevenuePerPayer)} ต่อผู้จ่าย`, `${totals.paymentCount} payments · ${baht(totals.averageRevenuePerPayer)} per payer`)}</p> : pending }} />
        {rangeSwitch}
        {failed}
        {data && (
          <>
            <section className="ksm-panel ksm-admin-card" aria-label={copy('รายได้รายวัน', 'Daily revenue')}>
              <div className="ksm-admin-cardhead"><b>{copy('รายได้รายวัน', 'Daily revenue')}</b><small>{day(data.fromDate)} – {day(data.toDate)}</small></div>
              <Bars values={data.daily.map(item => item.revenue)} label={copy('กราฟรายได้รายวัน', 'Daily revenue chart')} />
            </section>
            <div className="ksm-group-title"><h3>{copy('ประวัติการเติม Pro', 'Pro payments')}</h3><span>{data.payments.length.toLocaleString(locale)}</span></div>
            {data.payments.length
              ? <div className="ksm-list ksm-moneylist" style={{ marginTop: 0 }}>{data.payments.map(paymentRow)}</div>
              : <div className="ksm-empty"><h3>{copy('ยังไม่มีประวัติการชำระเงิน', 'No payments yet')}</h3></div>}
            <p className="ksm-micro">{copy('ล่าสุด 200 รายการ รวมรายการคืนเงิน · แตะเพื่อดูบัญชี', 'Latest 200, refunds included · tap to open the account')}</p>
          </>
        )}
      </>
    );
  } else if (page === 'accounts') {
    body = (
      <>
        <MobilePageHero key="accounts" title={copy('รายบัญชี', 'Accounts')} {...back} actions={actions} box={{
          label: copy('บัญชีที่สมัครทั้งหมด', 'Registered accounts'), icon: 'users', amount: totals ? totals.accounts.toLocaleString(locale) : '—', region: copy('สรุปบัญชี', 'Accounts summary'),
          detail: totals ? <p>{copy(`Pro ${totals.proAccounts} · ทดลอง ${totals.trialAccounts} · Free ${totals.freeAccounts}`, `Pro ${totals.proAccounts} · trial ${totals.trialAccounts} · free ${totals.freeAccounts}`)}</p> : pending,
        }} />
        {failed}
        {data && (
          <>
            <div className="ksm-search">
              <KsIcon name="search" />
              <input type="text" inputMode="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy('ค้นหาชื่อ, Public ID, ประเภทงาน', 'Search name, public ID, work type')} aria-label={copy('ค้นหาบัญชี', 'Search accounts')} enterKeyHint="search" />
              {query && <button type="button" className="ksm-search-clear" onClick={() => setQuery('')} aria-label={copy('ล้างคำค้น', 'Clear search')}><KsIcon name="close" size={17} /></button>}
            </div>
            <div className="ksm-chips ksm-admin-chips" role="tablist" aria-label={copy('กรองตามแพ็กเกจ', 'Filter by plan')}>
              {(['all', 'pro', 'admin', 'trial', 'free', 'expired'] as const).map(key => (
                <button key={key} type="button" role="tab" aria-selected={plan === key} onClick={() => setPlan(key)}>{key === 'all' ? copy('ทุกแพ็กเกจ', 'All plans') : planLabels[key][lang]}</button>
              ))}
            </div>
            <div className="ksm-selects">
              <label><span>{copy('กลุ่มผู้ใช้', 'Persona')}</span>
                <select value={persona} onChange={event => setPersona(event.target.value as AccountPersona | 'all')} aria-label={copy('กรองตามกลุ่มผู้ใช้', 'Filter by persona')}>
                  <option value="all">{copy('ทุกกลุ่มผู้ใช้', 'All personas')}</option>
                  {Object.entries(personaLabels).map(([key, labels]) => <option key={key} value={key}>{labels[lang]}</option>)}
                </select>
              </label>
            </div>
            <p className="ksm-count ksm-admin-count">{copy(`พบ ${accounts.length.toLocaleString(locale)} บัญชี`, `${accounts.length} accounts`)}</p>
            {accounts.length ? (
              <div className="ksm-list ksm-moneylist" style={{ marginTop: 0 }}>
                {accounts.map(item => (
                  <button key={item.userId} type="button" onClick={() => setAccount(item)} aria-label={`${copy('เปิดรายละเอียดบัญชี', 'Open account')} ${item.displayName}`}>
                    <span className={`ksm-list-icon ksm-admin-initial${['pro', 'admin'].includes(item.planStatus) ? '' : ' is-neutral'}`} aria-hidden="true">{item.displayName.slice(0, 1).toUpperCase()}</span>
                    <span className="ksm-grow"><b>{item.displayName}</b><p>{planLabels[item.planStatus][lang]} · {personaLabels[item.persona][lang]}</p></span>
                    <span className="ksm-admin-side"><strong>{baht(item.totalSpent)}</strong><small>{item.lastSeenAt ? day(item.lastSeenAt) : copy('ยังไม่ใช้งาน', 'Not active')}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className="ksm-empty"><h3>{copy('ไม่พบบัญชีที่ตรงกับตัวกรอง', 'No accounts match')}</h3>{(query || plan !== 'all' || persona !== 'all') && <button type="button" className="ksm-link" onClick={() => { setQuery(''); setPlan('all'); setPersona('all'); }}>{copy('ล้างตัวกรอง', 'Clear filters')}</button>}</div>}
            <p className="ksm-micro">{copy(`ใช้งาน · ยอดเติม ใน ${range} วันล่าสุด · ไม่แสดงข้อมูลการเงินส่วนตัวของผู้ใช้`, `Usage and spend in the last ${range} days · no private finances are shown`)}</p>
          </>
        )}
      </>
    );
  } else if (page === 'features') {
    body = (
      <>
        <MobilePageHero key="features" title={copy('การใช้ฟีเจอร์', 'Feature usage')} {...back} actions={actions} box={{
          label: copy(`เปิดฟีเจอร์ · ${range} วันล่าสุด`, `Feature views · last ${range} days`), icon: 'chart', amount: totals ? totals.pageViews.toLocaleString(locale) : '—', region: copy('สรุปการใช้ฟีเจอร์', 'Feature usage summary'),
          detail: !totals ? pending : <p>{copy(`${totals.activeUsers} คนใช้งาน · เฉลี่ย ${(totals.activeUsers ? totals.pageViews / totals.activeUsers : 0).toLocaleString(locale, { maximumFractionDigits: 1 })} ครั้งต่อคน`, `${totals.activeUsers} active · ${(totals.activeUsers ? totals.pageViews / totals.activeUsers : 0).toFixed(1)} views each`)}</p>,
        }} />
        {rangeSwitch}
        {failed}
        {data && (
          <>
            <div className="ksm-panel ksm-admin-features">
              {data.features.map(feature => {
                const total = feature.freeViews + feature.proViews;
                const free = total ? feature.freeViews / total : 0;
                const opportunity = feature.freeUsers > feature.proUsers * 2 && feature.freeUsers >= 3;
                return (
                  <div key={feature.key} className="ksm-admin-feature">
                    <div className="ksm-admin-feature-top">
                      <b>{featureLabels[feature.key][lang]}</b>
                      <strong>{feature.activeUsers.toLocaleString(locale)} <small>{copy('คน', 'users')}</small></strong>
                    </div>
                    <div className="ksm-admin-split" aria-hidden="true"><i style={{ width: `${free * 100}%` }} /><i style={{ width: `${(1 - free) * 100}%` }} /></div>
                    <p>{feature.freeUsers} Free · {feature.proUsers} Pro · {feature.pageViews.toLocaleString(locale)} {copy('ครั้ง', 'views')}{opportunity && <span className="ksm-badge is-emphasis">{copy('โอกาสวางจุดอัปเกรด', 'Upgrade opportunity')}</span>}</p>
                  </div>
                );
              })}
            </div>
            <p className="ksm-micro">{copy('Free/Pro อ้างอิงสิทธิ์ปัจจุบันของบัญชี · ไม่เก็บอีเมล URL หรือข้อมูลที่กรอก', 'Free/Pro uses each account’s current access · no emails, URLs or entered content are recorded')}</p>
          </>
        )}
      </>
    );
  } else if (page === 'feedback' || page === 'users' || page === 'groups') {
    const titles: Record<'feedback' | 'users' | 'groups', string> = {
      feedback: copy('ข้อความจากผู้ใช้', 'User feedback'), users: copy('จัดการผู้ใช้', 'Manage users'), groups: copy('จัดการทีม', 'Manage groups'),
    };
    body = (
      <>
        <MobilePageHero key={page} title={titles[page]} {...back} />
        <div className="ksm-admin-embed">
          <Suspense fallback={<SkeletonBlock className="mt-3 h-48 w-full rounded-2xl" />}>
            {page === 'feedback' ? <AdminFeedbackInbox userId={userId} />
              : page === 'users' ? <AdminUsersPanel userId={userId} triggerConfirm={triggerConfirm} onRoleChanged={onRoleChanged} />
                : <GroupsTab userId={userId} isGuest={false} triggerConfirm={triggerConfirm} initialScope="all" embedded />}
          </Suspense>
        </div>
      </>
    );
  } else {
    // ── The dashboard itself ────────────────────────────────────────────────────────────────────
    const activeChange = totals ? change(totals.activeUsers, totals.previousActiveUsers) : null;
    const bestFeature = data?.features.find(feature => feature.activeUsers > 0);
    const upgradeFeature = data?.features.filter(feature => feature.key !== 'plans' && feature.freeUsers > 0).sort((a, b) => b.freeUsers - a.freeUsers)[0];
    const strongestPersona = data?.personas.filter(item => item.accounts > 0).sort((a, b) => (b.proAccounts / b.accounts) - (a.proAccounts / a.accounts))[0];
    const tools: { key: Page; icon: KsIconName; title: string; sub: string; needsData?: boolean }[] = [
      { key: 'payments', icon: 'receive', title: copy('รายได้และการชำระเงิน', 'Revenue and payments'), sub: copy('รายได้รายวัน · ประวัติการเติม Pro', 'Daily revenue · Pro payments'), needsData: true },
      { key: 'accounts', icon: 'users', title: copy('รายบัญชี', 'Accounts'), sub: totals ? copy(`${totals.accounts} บัญชี · ค้นหาและกรอง`, `${totals.accounts} accounts · search and filter`) : copy('ค้นหาและกรอง', 'Search and filter'), needsData: true },
      { key: 'features', icon: 'chart', title: copy('การใช้ฟีเจอร์', 'Feature usage'), sub: bestFeature ? copy(`${featureLabels[bestFeature.key][0]} ใช้มากสุด ${bestFeature.activeUsers} คน`, `${featureLabels[bestFeature.key][1]} leads with ${bestFeature.activeUsers}`) : copy('Free และ Pro ใช้อะไร', 'What Free and Pro use'), needsData: true },
      { key: 'feedback', icon: 'chat', title: copy('ข้อความจากผู้ใช้', 'User feedback'), sub: copy('อ่านและตอบเรื่องที่ผู้ใช้ส่งมา', 'Read and answer what users sent') },
      { key: 'users', icon: 'shield', title: copy('จัดการผู้ใช้', 'Manage users'), sub: copy('สิทธิ์แอดมิน · ให้หรือยกเลิก Pro', 'Admin roles · grant or revoke Pro') },
      { key: 'groups', icon: 'briefcase', title: copy('จัดการทีม', 'Manage groups'), sub: copy('ทีม สมาชิก คำเชิญ และบทบาท', 'Groups, members, invitations, roles') },
    ];
    body = (
      <>
        <MobilePageHero key="home" title={copy('แดชบอร์ดแอดมิน', 'Admin dashboard')} onBack={onBack} actions={actions} box={{ ...revenueBox, onOpen: () => go('payments'), openLabel: copy('ดูรายได้และการชำระเงิน', 'Open revenue and payments') }} />
        {rangeSwitch}
        {failed}
        {waiting}
        {totals && (
          <section className="ksm-metrics" aria-label={copy('ภาพรวมบัญชี', 'Accounts overview')}>
            <div className="ksm-metric"><small>{copy('บัญชีที่สมัครทั้งหมด', 'Registered accounts')}</small><b>{totals.accounts.toLocaleString(locale)}</b><p>{copy(`ใหม่ ${totals.newAccounts} ใน ${range} วัน`, `${totals.newAccounts} new in ${range} days`)}</p></div>
            <div className="ksm-metric"><small>{copy('ใช้งานในช่วงนี้', 'Active in period')}</small><b>{totals.activeUsers.toLocaleString(locale)}</b><p>{activeChange === null ? copy('ยังไม่มีช่วงก่อนให้เทียบ', 'No previous period') : copy(`${activeChange >= 0 ? '+' : '−'}${percent(Math.abs(activeChange))} จากช่วงก่อน`, `${activeChange >= 0 ? '+' : '−'}${percent(Math.abs(activeChange))} vs previous`)}</p></div>
            <div className="ksm-metric"><small>{copy('สมาชิก Pro', 'Pro members')}</small><b>{totals.proAccounts.toLocaleString(locale)}</b><p>{copy(`จ่ายเอง ${totals.paidProAccounts} · แอดมินให้ ${totals.proAccounts - totals.paidProAccounts}`, `${totals.paidProAccounts} paid · ${totals.proAccounts - totals.paidProAccounts} granted`)}</p></div>
            <div className="ksm-metric"><small>{copy('อัตราเปลี่ยนเป็น Pro', 'Paid conversion')}</small><b>{percent(totals.conversionRate)}</b><p>{copy(`กำลังทดลอง ${totals.trialAccounts} บัญชี`, `${totals.trialAccounts} in trial`)}</p></div>
          </section>
        )}
        {data && (
          <section className="ksm-panel ksm-admin-card" aria-label={copy('ผู้ใช้งานรายวัน', 'Daily active users')}>
            <div className="ksm-admin-cardhead"><b>{copy('ผู้ใช้งานรายวัน', 'Daily active users')}</b><small>{day(data.fromDate)} – {day(data.toDate)}</small></div>
            <Bars values={data.daily.map(item => item.activeUsers)} label={copy('กราฟผู้ใช้งานรายวัน', 'Daily active users chart')} />
          </section>
        )}
        {data && (
          <>
            <div className="ksm-group-title"><h3>{copy('ชำระเงินล่าสุด', 'Latest payments')}</h3>{data.payments.length > 0 && <button type="button" className="ksm-link" onClick={() => go('payments')}>{copy('ดูทั้งหมด', 'See all')}</button>}</div>
            {data.payments.length
              ? <div className="ksm-list ksm-moneylist" style={{ marginTop: 0 }}>{data.payments.slice(0, 4).map(paymentRow)}</div>
              : <div className="ksm-empty" style={{ marginTop: 0 }}><h3>{copy('ยังไม่มีการชำระเงิน', 'No payments yet')}</h3><p>{copy('เมื่อมีคนชำระ รายการจะขึ้นที่นี่เอง', 'Payments appear here by themselves')}</p></div>}
          </>
        )}
        <div className="ksm-group-title"><h3>{copy('เครื่องมือแอดมิน', 'Admin tools')}</h3></div>
        <div className="ksm-list" style={{ marginTop: 0 }}>
          {tools.filter(tool => !tool.needsData || data).map(tool => (
            <button key={tool.key} type="button" onClick={() => go(tool.key)} aria-label={tool.title}>
              <span className="ksm-list-icon"><KsIcon name={tool.icon} /></span>
              <span className="ksm-grow"><b>{tool.title}</b><p>{tool.sub}</p></span>
              <KsIcon name="chevron" size={16} />
            </button>
          ))}
        </div>
        {data && (
          <>
            <div className="ksm-group-title"><h3>{copy('สิ่งที่ควรทำต่อ', 'What to do next')}</h3></div>
            <div className="ksm-panel ksm-admin-tips">
              <p><b>{copy('ใช้ฟีเจอร์ที่มีแรงส่งพาคนไป Pro', 'Use the strongest feature to drive upgrades')}</b>{bestFeature ? copy(`${featureLabels[bestFeature.key][0]} มีผู้ใช้สูงสุด ${bestFeature.activeUsers} คน`, `${featureLabels[bestFeature.key][1]} leads with ${bestFeature.activeUsers} users`) : copy('รอข้อมูลการใช้งานเพิ่ม', 'Waiting for more usage data')}</p>
              <p><b>{copy('วางจุดอัปเกรดในที่ที่ Free ใช้เยอะ', 'Place upgrade prompts where free usage is high')}</b>{upgradeFeature ? copy(`${featureLabels[upgradeFeature.key][0]} มีผู้ใช้ Free ${upgradeFeature.freeUsers} คน`, `${featureLabels[upgradeFeature.key][1]} has ${upgradeFeature.freeUsers} free users`) : copy('ยังไม่มีสัญญาณเพียงพอ', 'Not enough signal yet')}</p>
              <p><b>{copy('โฟกัสกลุ่มที่เปลี่ยนเป็น Pro ได้ดีที่สุด', 'Focus on the highest-converting persona')}</b>{strongestPersona ? `${personaLabels[strongestPersona.key][lang]} · ${percent(strongestPersona.proAccounts / strongestPersona.accounts)}` : copy('ยังไม่มีข้อมูลกลุ่มผู้ใช้', 'No persona data yet')}</p>
            </div>
            <div className="ksm-group-title"><h3>{copy('กลุ่มผู้ใช้', 'User personas')}</h3></div>
            <div className="ksm-panel ksm-admin-personas">
              {data.personas.map(item => (
                <button key={item.key} type="button" onClick={() => { setPersona(item.key); setPlan('all'); setQuery(''); go('accounts'); }} aria-label={`${personaLabels[item.key][lang]} ${item.accounts} ${copy('บัญชี', 'accounts')}`}>
                  <span className="ksm-grow"><b>{personaLabels[item.key][lang]}</b><small>{copy(`${item.activeUsers} คนใช้งาน`, `${item.activeUsers} active`)}</small></span>
                  <span className="ksm-admin-side"><strong>{item.accounts}</strong><small>{item.accounts ? `Pro ${percent(item.proAccounts / item.accounts)}` : 'Pro 0%'}</small></span>
                  <KsIcon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </>
        )}
        <p className="ksm-micro">{copy('แสดงเฉพาะข้อมูลเพื่อบริหารผลิตภัณฑ์และรายได้ ไม่แสดงกระแสเงินสด งาน ลูกค้า หรือเอกสารส่วนตัวของผู้ใช้', 'Product and revenue operations only; users’ private cash flow, jobs, clients and documents are not shown')}</p>
      </>
    );
  }

  return (
    <div className="page-content ksm ksm-screen ksm-admin">
      {body}
      {account && data && (
        <MobileSheet title={account.displayName} onClose={() => setAccount(null)}>
          <div className="ksm-admin-sheethead">
            <span className={`ksm-badge${['pro', 'admin'].includes(account.planStatus) ? ' is-emphasis' : ''}`}>{planLabels[account.planStatus][lang]}</span>
            <span className="ksm-badge">{personaLabels[account.persona][lang]}</span>
            <small>{account.publicId}</small>
          </div>
          <div className="ksm-metrics">
            <div className="ksm-metric"><small>{copy('ยอดเติมสะสม', 'Lifetime spend')}</small><b>{baht(account.totalSpent)}</b></div>
            <div className="ksm-metric"><small>{copy('จำนวนครั้งที่เติม', 'Payments')}</small><b>{account.paymentCount.toLocaleString(locale)}</b></div>
            <div className="ksm-metric"><small>{copy('วันที่ใช้งาน', 'Active days')}</small><b>{account.activeDays}</b></div>
            <div className="ksm-metric"><small>{copy('เปิดฟีเจอร์', 'Feature views')}</small><b>{account.pageViews.toLocaleString(locale)}</b></div>
          </div>
          <dl className="ksm-admin-facts">
            <div><dt>{copy('สมัครเมื่อ', 'Joined')}</dt><dd>{day(account.createdAt)}</dd></div>
            <div><dt>{copy('ใช้งานล่าสุด', 'Last active')}</dt><dd>{day(account.lastSeenAt)}</dd></div>
            <div><dt>{copy('Pro ถึง', 'Pro until')}</dt><dd>{day(account.currentPeriodEnd)}</dd></div>
            <div><dt>{copy('ประเภทงาน', 'Work type')}</dt><dd>{account.jobTypes.length ? account.jobTypes.join(', ') : '—'}</dd></div>
          </dl>
          <div className="ksm-group-title"><h3>{copy('ฟีเจอร์ที่ใช้บ่อย', 'Most-used features')}</h3></div>
          {account.topFeatures.length
            ? <div className="ksm-panel ksm-admin-tops">{account.topFeatures.map((feature, index) => <p key={feature.key}><i>{index + 1}</i><span className="ksm-grow">{featureLabels[feature.key][lang]}</span><span>{feature.pageViews.toLocaleString(locale)}</span></p>)}</div>
            : <p className="ksm-caption">{copy('ยังไม่มีข้อมูลในช่วงเวลานี้', 'No activity in this period')}</p>}
          <div className="ksm-group-title"><h3>{copy('ประวัติการเติม Pro', 'Payment history')}</h3></div>
          {(() => {
            const own = data.payments.filter(payment => payment.userId === account.userId);
            return own.length
              ? <div className="ksm-panel ksm-admin-tops">{own.map(payment => <p key={payment.id}><span className="ksm-grow">{day(payment.paidAt)}</span><span className={payment.refunded ? 'ksm-admin-refunded' : 'ksm-admin-paid'}>{baht(payment.amount)}{payment.refunded ? ` · ${copy('คืนเงินแล้ว', 'refunded')}` : ''}</span></p>)}</div>
              : <p className="ksm-caption">{copy('ยังไม่มีประวัติการชำระเงิน', 'No payment history')}</p>;
          })()}
        </MobileSheet>
      )}
    </div>
  );
}

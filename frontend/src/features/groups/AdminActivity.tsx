import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { AnalyticsRange } from '../../../../shared/adminAnalytics';
import { type ActivityAccount, type ActivityStatus, type AdminActivitySummary, type DayBand } from '../../../../shared/userActivity';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { adminActivityApi } from '../../services/broadcast';
import { MobileSheet } from '../mobile/MobileHome';
import { KsIcon } from '../mobile/icons';
import { planLabels } from './adminLabels';
import './adminActivity.css';

// The admin page's ผู้ใช้งาน view (owner, 2026-11-03: "ดู user active ... คนนึงเขาไม่ active นานแค่ไหน ... คนมา on กี่ช่วงไหนบ้าง").
// Who is on now, how long each account has been away, and when people use the app, by day of the week and hour.
// Computers and iPads get a table and a side panel; phones the phone design's cards, list and sheet.

type Copy = (th: string, en: string) => string;
type Filter = ActivityStatus | 'all';

const STATUS: Record<ActivityStatus, [string, string]> = {
  online: ['ออนไลน์อยู่', 'Online now'], today: ['ใช้วันนี้', 'Used today'], week: ['ใช้ใน 7 วัน', 'Within 7 days'],
  month: ['ห่างหาย 8–30 วัน', 'Away 8–30 days'], away: ['หายไปเกิน 30 วัน', 'Away 30+ days'], none: ['ยังไม่มีข้อมูลการใช้', 'No activity yet'],
  off: ['ปิดสถิติการใช้งาน', 'Statistics off'],
};
const BANDS: Record<DayBand, [string, string]> = {
  morning: ['ช่วงเช้า 06–11 น.', 'Morning 06–11'], midday: ['ช่วงเที่ยง 11–14 น.', 'Midday 11–14'], afternoon: ['ช่วงบ่าย 14–18 น.', 'Afternoon 14–18'],
  evening: ['ช่วงเย็น 18–22 น.', 'Evening 18–22'], night: ['ช่วงดึก 22–06 น.', 'Night 22–06'],
};
const WEEKDAYS: [string, string][] = [['จ.', 'Mon'], ['อ.', 'Tue'], ['พ.', 'Wed'], ['พฤ.', 'Thu'], ['ศ.', 'Fri'], ['ส.', 'Sat'], ['อา.', 'Sun']];
const WEEKDAY_NAMES: [string, string][] = [['วันจันทร์', 'Monday'], ['วันอังคาร', 'Tuesday'], ['วันพุธ', 'Wednesday'], ['วันพฤหัสบดี', 'Thursday'], ['วันศุกร์', 'Friday'], ['วันเสาร์', 'Saturday'], ['วันอาทิตย์', 'Sunday']];
const FILTERS: Filter[] = ['all', 'online', 'today', 'week', 'month', 'away', 'none', 'off'];

const hh = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`;

function relative(at: string | null, now: number, copy: Copy, locale: string): string {
  if (!at) return copy('ยังไม่มีข้อมูล', 'No data');
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (minutes < 2) return copy('เมื่อสักครู่', 'Just now');
  if (minutes < 60) return copy(`${minutes} นาทีที่แล้ว`, `${minutes} min ago`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return copy(`${hours} ชั่วโมงที่แล้ว`, `${hours} h ago`);
  const days = Math.round(hours / 24);
  if (days === 1) return copy('เมื่อวาน', 'Yesterday');
  return copy(`${days.toLocaleString(locale)} วันที่แล้ว`, `${days} days ago`);
}

function duration(minutes: number, copy: Copy): string {
  if (minutes < 1) return copy('ไม่ถึง 1 นาที', 'Under a minute');
  if (minutes < 60) return copy(`${minutes} นาที`, `${minutes} min`);
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return copy(`${hours} ชม.${rest ? ` ${rest} นาที` : ''}`, `${hours} h${rest ? ` ${rest} min` : ''}`);
}

/** Days of the week down, hours across: how often accounts were on, in one hue from light to dark. */
function Heatmap({ grid, copy, lang, compact = false }: { grid: number[][]; copy: Copy; lang: 0 | 1; compact?: boolean }) {
  const max = Math.max(0, ...grid.flat());
  const level = (value: number) => (!value || !max ? 0 : Math.min(4, Math.ceil((value / max) * 4)));
  return (
    <div className={`aact-heat${compact ? ' is-compact' : ''}`}>
      <div className="aact-heat-grid" role="table" aria-label={copy('ช่วงเวลาที่คนเข้าใช้ ตามวันและชั่วโมง', 'When people use the app, by day and hour')}>
        <div className="aact-heat-row is-hours" role="row" aria-hidden="true">
          <span className="aact-heat-day" />
          {Array.from({ length: 24 }, (_, hour) => <span key={hour} className="aact-heat-hour">{hour % (compact ? 6 : 3) === 0 ? String(hour).padStart(2, '0') : ''}</span>)}
        </div>
        {grid.map((row, day) => (
          <div key={day} className="aact-heat-row" role="row">
            <span className="aact-heat-day" role="rowheader">{WEEKDAYS[day][lang]}</span>
            {row.map((value, hour) => (
              <span key={hour} role="cell" className={`aact-heat-cell is-l${level(value)}`}
                title={copy(`${WEEKDAY_NAMES[day][0]} ${hh(hour)}–${hh(hour + 1)} · ${value} ครั้ง`, `${WEEKDAY_NAMES[day][1]} ${hh(hour)}–${hh(hour + 1)} · ${value}`)}
                aria-label={copy(`${WEEKDAY_NAMES[day][0]} ${hh(hour)} ${value} ครั้ง`, `${WEEKDAY_NAMES[day][1]} ${hh(hour)} ${value}`)} />
            ))}
          </div>
        ))}
      </div>
      <div className="aact-heat-legend" aria-hidden="true">
        <span>{copy('น้อย', 'Fewer')}</span>{[0, 1, 2, 3, 4].map(step => <i key={step} className={`aact-heat-cell is-l${step}`} />)}<span>{copy('มาก', 'More')}</span>
      </div>
    </div>
  );
}

/** The busiest hours and day, in words, so the chart is never the only way to read it. */
function busiest(grid: number[][], copy: Copy): string | null {
  const hours = Array.from({ length: 24 }, (_, hour) => grid.reduce((sum, row) => sum + row[hour], 0));
  const days = grid.map(row => row.reduce((sum, value) => sum + value, 0));
  const total = hours.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  // The best two hours next to each other.
  let best = 0;
  for (let hour = 1; hour < 24; hour += 1) if (hours[hour] + hours[(hour + 1) % 24] > hours[best] + hours[(best + 1) % 24]) best = hour;
  const day = days.indexOf(Math.max(...days));
  return copy(`คนเข้าใช้มากที่สุดช่วง ${hh(best)}–${hh(best + 2)} น. และ${WEEKDAY_NAMES[day][0]}เป็นวันที่เข้ามากที่สุด`,
    `Busiest hours: ${hh(best)}–${hh(best + 2)}. Busiest day: ${WEEKDAY_NAMES[day][1]}.`);
}

function StatusChip({ status, copy }: { status: ActivityStatus; copy: Copy }) {
  return <span className={`aact-status is-${status}`}><i aria-hidden="true" />{copy(...STATUS[status])}</span>;
}

function DaysStrip({ account, range, toDate, copy, locale }: { account: ActivityAccount; range: AnalyticsRange; toDate: string; copy: Copy; locale: string }) {
  const days = Array.from({ length: range }, (_, index) => { const value = new Date(`${toDate}T00:00:00Z`); value.setUTCDate(value.getUTCDate() - (range - 1 - index)); return value.toISOString().slice(0, 10); });
  const used = new Set(account.days);
  return (
    <div className={`aact-days${range > 30 ? ' is-long' : ''}`} role="img" aria-label={copy(`ใช้งาน ${account.activeDays} จาก ${range} วัน`, `Active ${account.activeDays} of ${range} days`)}>
      {days.map(day => <i key={day} className={used.has(day) ? 'is-on' : ''} title={new Date(`${day}T12:00:00+07:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} />)}
    </div>
  );
}

function HourBars({ hours, copy }: { hours: number[]; copy: Copy }) {
  const max = Math.max(1, ...hours);
  return (
    <div className="aact-hours" role="img" aria-label={copy('ชั่วโมงที่ใช้บ่อย', 'Hours used most')}>
      <div className="aact-hours-bars">{hours.map((value, hour) => <i key={hour} style={{ height: `${value ? Math.max(8, (value / max) * 100) : 2}%` }} title={`${hh(hour)} · ${value}`} />)}</div>
      <div className="aact-hours-axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </div>
  );
}

function AccountDetail({ account, data, copy, lang, locale, now }: { account: ActivityAccount; data: AdminActivitySummary; copy: Copy; lang: 0 | 1; locale: string; now: number }) {
  const when = (at: string) => new Date(at).toLocaleString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const day = (at: string) => new Date(at).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
  const time = (ms: number) => new Date(ms).toLocaleTimeString(locale, { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="aact-detail">
      <div className="aact-detail-tags"><StatusChip status={account.status} copy={copy} /><span className="aact-plan">{planLabels[account.plan][lang]}</span><small>{account.publicId}</small></div>
      <dl className="aact-facts">
        <div><dt>{copy('ใช้งานล่าสุด', 'Last active')}</dt><dd>{account.lastActiveAt ? `${when(account.lastActiveAt)} · ${relative(account.lastActiveAt, now, copy, locale)}` : copy('ยังไม่มีข้อมูล', 'No data')}</dd></div>
        <div><dt>{copy('สมัครเมื่อ', 'Joined')}</dt><dd>{day(account.createdAt)}</dd></div>
        <div><dt>{copy(`ใน ${data.range} วันล่าสุด`, `Last ${data.range} days`)}</dt><dd>{copy(`ใช้ ${account.activeDays} วัน · ${account.visits} ครั้ง · รวม ${duration(account.minutes, copy)}`, `${account.activeDays} days · ${account.visits} visits · ${duration(account.minutes, copy)}`)}</dd></div>
        <div><dt>{copy('ช่วงที่ใช้บ่อย', 'Usual time')}</dt><dd>{account.band ? copy(...BANDS[account.band]) : '—'}</dd></div>
      </dl>
      {account.statsOff && <p className="aact-note">{copy('บัญชีนี้เลือก “เฉพาะที่จำเป็น” ที่แถบคุกกี้ จึงไม่มีสถิติการใช้งานจากเบราว์เซอร์นั้น เวลาใช้งานล่าสุดอาจมาจากการเข้าสู่ระบบ', 'This account chose “Essential only” in the cookie banner, so that browser sends no usage statistics. The last-active time may come from a sign-in.')}</p>}
      <h3 className="aact-subhead">{copy('วันที่ใช้งาน', 'Days used')}</h3>
      <DaysStrip account={account} range={data.range} toDate={data.toDate} copy={copy} locale={locale} />
      <h3 className="aact-subhead">{copy('ชั่วโมงที่ใช้', 'Hours used')}</h3>
      <HourBars hours={account.hours} copy={copy} />
      <h3 className="aact-subhead">{copy('การเข้าใช้ล่าสุด', 'Latest visits')}</h3>
      {account.recent.length ? (
        <ul className="aact-visits">
          {account.recent.map(visit => {
            const start = Date.parse(visit.start);
            return <li key={visit.start}><span>{day(visit.start)}</span><span>{time(start)}–{time(start + visit.minutes * 60_000)}</span><b>{duration(visit.minutes, copy)}</b></li>;
          })}
        </ul>
      ) : <p className="aact-note">{data.trackingSince ? copy('ยังไม่มีการเข้าใช้ที่บันทึกไว้', 'No visits recorded yet') : copy('เริ่มบันทึกการเข้าใช้แต่ละครั้งตั้งแต่วันนี้ ข้อมูลจะขึ้นเมื่อบัญชีนี้เปิดแอปครั้งถัดไป', 'Visits are recorded from today and show once this account opens the app again.')}</p>}
    </div>
  );
}

export default function AdminActivity({ userId, range, revision = 0, language, mobile = false }: {
  userId: string; range: AnalyticsRange; revision?: number; language: 'th' | 'en'; mobile?: boolean;
}) {
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const lang: 0 | 1 = language === 'th' ? 0 : 1;
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const [data, setData] = useState<AdminActivitySummary | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    adminActivityApi.summary(userId, range, controller.signal)
      .then(result => { if (!controller.signal.aborted) { setData(result); setNow(Date.now()); } })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    return () => controller.abort();
  }, [userId, range, revision]);

  const accounts = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (data?.accounts ?? []).filter(account => (filter === 'all' || account.status === filter) && (!text || `${account.displayName} ${account.publicId}`.toLowerCase().includes(text)));
  }, [data, filter, query]);
  const account = data?.accounts.find(item => item.userId === selected) ?? null;
  const summaryLine = data ? busiest(data.heatmap, copy) : null;
  const sinceNote = data?.trackingSince
    ? copy(`เวลาเข้าใช้แต่ละครั้งเริ่มบันทึกเมื่อ ${new Date(data.trackingSince).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })} ก่อนหน้านั้นนับจากเวลาที่เปิดหน้าในแอป`, `Visit times are recorded from ${new Date(data.trackingSince).toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}; before that, from pages opened.`)
    : copy('เวลาเข้าใช้แต่ละครั้งเริ่มบันทึกตั้งแต่วันนี้ ตอนนี้นับจากเวลาที่เปิดหน้าในแอป', 'Visit times are recorded from today; until then the chart counts pages opened.');
  const privacyNote = copy('นับเฉพาะเบราว์เซอร์ที่อนุญาตสถิติการใช้งาน ไม่เก็บว่าทำหรือดูอะไรในแอป', 'Only browsers that allow usage statistics are counted. What people do or see in the app is not kept.');
  const tiles: { key: ActivityStatus; th: string; en: string }[] = [
    { key: 'online', th: 'ออนไลน์ตอนนี้', en: 'Online now' }, { key: 'today', th: 'ใช้วันนี้', en: 'Used today' },
    { key: 'week', th: 'ใช้ใน 7 วัน', en: 'Within 7 days' }, { key: 'month', th: 'ห่างหาย 8–30 วัน', en: 'Away 8–30 days' },
    { key: 'away', th: 'หายไปเกิน 30 วัน', en: 'Away 30+ days' }, { key: 'none', th: 'ยังไม่มีข้อมูล', en: 'No activity yet' },
  ];
  const filterLabel = (key: Filter) => (key === 'all' ? copy(`ทั้งหมด ${data?.totals.accounts ?? ''}`.trim(), `All ${data?.totals.accounts ?? ''}`.trim()) : `${copy(...STATUS[key])} ${data?.totals[key] ?? ''}`.trim());
  const failed = error && <div role="alert" className={mobile ? 'ksm-empty ksm-admin-error' : 'rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300'}>{mobile ? <><h3>{copy('โหลดข้อมูลผู้ใช้งานไม่สำเร็จ', 'Could not load activity')}</h3><p>{error}</p></> : error}</div>;

  if (mobile) {
    return (
      <div className="aact is-mobile">
        {failed}
        {!data && !error && <SkeletonBlock className="mt-3 h-48 w-full rounded-2xl" />}
        {data && (
          <>
            <section className="ksm-metrics" aria-label={copy('สรุปผู้ใช้งาน', 'Activity summary')}>
              {tiles.filter(tile => tile.key !== 'none').slice(0, 4).map(tile => (
                <button key={tile.key} type="button" className="ksm-metric aact-tile" onClick={() => setFilter(tile.key)} aria-label={`${copy(tile.th, tile.en)} ${data.totals[tile.key]}`}>
                  <small>{copy(tile.th, tile.en)}</small><b>{data.totals[tile.key].toLocaleString(locale)}</b>
                </button>
              ))}
            </section>
            <section className="ksm-panel ksm-admin-card" aria-label={copy('ช่วงเวลาที่คนเข้าใช้', 'When people use the app')}>
              <div className="ksm-admin-cardhead"><b>{copy('ช่วงเวลาที่คนเข้าใช้', 'When people use the app')}</b><small>{copy(`${data.range} วันล่าสุด`, `Last ${data.range} days`)}</small></div>
              <Heatmap grid={data.heatmap} copy={copy} lang={lang} compact />
              {summaryLine && <p className="aact-summary">{summaryLine}</p>}
            </section>
            <div className="ksm-search">
              <KsIcon name="search" />
              <input type="text" inputMode="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy('ค้นหาชื่อหรือ Public ID', 'Search name or public ID')} aria-label={copy('ค้นหาบัญชี', 'Search accounts')} />
              {query && <button type="button" className="ksm-search-clear" onClick={() => setQuery('')} aria-label={copy('ล้างคำค้น', 'Clear search')}><KsIcon name="close" size={17} /></button>}
            </div>
            <div className="ksm-chips ksm-admin-chips" role="tablist" aria-label={copy('กรองตามการใช้งาน', 'Filter by activity')}>
              {FILTERS.filter(key => key === 'all' || data.totals[key] > 0 || key === filter).map(key => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>{filterLabel(key)}</button>)}
            </div>
            {accounts.length ? (
              <div className="ksm-list ksm-moneylist" style={{ marginTop: 0 }}>
                {accounts.map(item => (
                  <button key={item.userId} type="button" onClick={() => setSelected(item.userId)} aria-label={`${item.displayName} ${copy(...STATUS[item.status])}`}>
                    <span className={`ksm-list-icon ksm-admin-initial aact-initial is-${item.status}`} aria-hidden="true">{item.displayName.slice(0, 1).toUpperCase()}</span>
                    <span className="ksm-grow"><b>{item.displayName}</b><p>{item.status === 'online' ? copy('ออนไลน์อยู่ตอนนี้', 'Online now') : relative(item.lastActiveAt, now, copy, locale)}{item.band ? ` · ${copy(...BANDS[item.band]).split(' ')[0]}` : ''}</p></span>
                    <span className="ksm-admin-side"><strong>{copy(`${item.activeDays} วัน`, `${item.activeDays} d`)}</strong><small>{copy(`ใน ${data.range} วัน`, `in ${data.range} d`)}</small></span>
                  </button>
                ))}
              </div>
            ) : <div className="ksm-empty"><h3>{copy('ไม่มีบัญชีในกลุ่มนี้', 'No accounts here')}</h3></div>}
            <p className="ksm-micro">{sinceNote} · {privacyNote}</p>
          </>
        )}
        {account && data && (
          <MobileSheet title={account.displayName} onClose={() => setSelected(null)}>
            <AccountDetail account={account} data={data} copy={copy} lang={lang} locale={locale} now={now} />
          </MobileSheet>
        )}
      </div>
    );
  }

  return (
    <div className="aact space-y-4">
      {failed}
      {!data && !error && <div className={`${uiSurface} p-5`}><SkeletonBlock className="h-5 w-48" /><SkeletonBlock className="mt-6 h-56 w-full" /></div>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map(tile => (
              <button key={tile.key} type="button" onClick={() => setFilter(filter === tile.key ? 'all' : tile.key)} aria-pressed={filter === tile.key}
                className={`${uiSurface} aact-kpi min-w-0 p-4 text-left transition hover:border-brand-blue-acc/60 ${filter === tile.key ? 'is-picked' : ''}`}>
                <span className="flex items-center gap-2 text-[13px] text-brand-muted"><i className={`aact-dot is-${tile.key}`} aria-hidden="true" />{copy(tile.th, tile.en)}</span>
                <span className="mt-2 block text-2xl font-semibold tabular-nums text-brand-text">{data.totals[tile.key].toLocaleString(locale)}</span>
              </button>
            ))}
          </div>

          <section className={`${uiSurface} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-[15px] font-semibold">{copy('ช่วงเวลาที่คนเข้าใช้', 'When people use the app')}</h2><p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy(`${data.range} วันล่าสุด · แต่ละช่องคือจำนวนครั้งที่มีบัญชีเปิดแอปในชั่วโมงนั้น`, `Last ${data.range} days · each cell counts accounts on in that hour`)}</p></div>
            </div>
            <Heatmap grid={data.heatmap} copy={copy} lang={lang} />
            {summaryLine && <p className="aact-summary">{summaryLine}</p>}
            <p className="mt-2 text-[11px] leading-relaxed text-brand-muted">{sinceNote}</p>
          </section>

          <section className={`${uiSurface} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 p-5">
              <div><h2 className="text-[15px] font-semibold">{copy('รายบัญชี', 'Accounts')}</h2><p className="mt-1 text-xs text-brand-muted">{copy(`พบ ${accounts.length.toLocaleString(locale)} บัญชี · เรียงจากที่ใช้ล่าสุด`, `${accounts.length} accounts · most recent first`)}</p></div>
              <label className="relative block w-full sm:w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
                <input className="ui-input !pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy('ค้นหาชื่อหรือ Public ID', 'Search name or public ID')} aria-label={copy('ค้นหาบัญชี', 'Search accounts')} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-b border-brand-border/60 px-5 py-3" role="tablist" aria-label={copy('กรองตามการใช้งาน', 'Filter by activity')}>
              {FILTERS.filter(key => key === 'all' || data.totals[key] > 0 || key === filter).map(key => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`aact-chip ${filter === key ? 'is-picked' : ''}`}>{filterLabel(key)}</button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                <thead className="bg-brand-bg/70 text-xs text-brand-muted">
                  <tr>
                    <th className="w-[24%] px-5 py-3 font-semibold">{copy('บัญชี', 'Account')}</th>
                    <th className="w-[19%] px-3 py-3 font-semibold">{copy('สถานะ', 'Status')}</th>
                    <th className="w-[16%] px-3 py-3 font-semibold">{copy('ใช้งานล่าสุด', 'Last active')}</th>
                    <th className="w-[12%] px-3 py-3 text-right font-semibold">{copy('วันที่ใช้', 'Days used')}</th>
                    <th className="w-[13%] px-3 py-3 text-right font-semibold">{copy('ครั้ง · เวลารวม', 'Visits · time')}</th>
                    <th className="w-[16%] px-5 py-3 font-semibold">{copy('ช่วงที่ใช้บ่อย', 'Usual time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(item => (
                    <tr key={item.userId} onClick={() => setSelected(item.userId)} className={`cursor-pointer border-t border-brand-border/60 transition-colors hover:bg-brand-faint/60 ${selected === item.userId ? 'bg-brand-faint/70' : ''}`}>
                      <td className="px-5 py-3"><button type="button" className="block w-full min-w-0 text-left" onClick={event => { event.stopPropagation(); setSelected(item.userId); }}><span className="block truncate font-medium text-brand-text">{item.displayName}</span><span className="mt-0.5 block truncate text-[11px] text-brand-muted">{item.publicId} · {planLabels[item.plan][lang]}</span></button></td>
                      <td className="px-3 py-3"><StatusChip status={item.status} copy={copy} /></td>
                      <td className="truncate px-3 py-3 text-brand-muted">{item.status === 'online' ? copy('ตอนนี้', 'Now') : relative(item.lastActiveAt, now, copy, locale)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.activeDays}<span className="text-brand-muted">/{data.range}</span></td>
                      <td className="px-3 py-3 text-right tabular-nums">{item.visits ? `${item.visits} · ${duration(item.minutes, copy)}` : '—'}</td>
                      <td className="truncate px-5 py-3 text-brand-muted">{item.band ? copy(...BANDS[item.band]) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!accounts.length && <p className="px-5 py-8 text-center text-sm text-brand-muted">{copy('ไม่มีบัญชีในกลุ่มนี้', 'No accounts here')}</p>}
            </div>
            <p className="border-t border-brand-border/60 px-5 py-3 text-[11px] leading-relaxed text-brand-muted">{privacyNote}</p>
          </section>
        </>
      )}

      {account && data && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[1px]" onClick={() => setSelected(null)}>
          <aside role="dialog" aria-modal="true" aria-label={account.displayName} onClick={event => event.stopPropagation()}
            className="aact-panel h-full w-full max-w-[420px] overflow-y-auto border-l border-brand-border bg-brand-white p-6 shadow-2xl dark:bg-[#141414]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="min-w-0 truncate text-lg font-semibold">{account.displayName}</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label={copy('ปิด', 'Close')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.12)] text-brand-text/70 hover:bg-[rgba(118,118,128,0.2)]"><X size={16} /></button>
            </div>
            <AccountDetail account={account} data={data} copy={copy} lang={lang} locale={locale} now={now} />
          </aside>
        </div>
      )}
    </div>
  );
}


import { uiSurface } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppSettings, Expense, Job } from '../../../../shared/types';
import { dateLocale, formatCurrency } from '../../utils';
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { TimelineView } from './TimelineView';
import { MonthMoneySummary } from './MonthMoneySummary';
import { buildCalendarEvents, type CalendarDayEvent, type CalendarEventKind } from './calendarEvents';
import { JobPeekSheet } from './JobPeekSheet';
import { DashboardPeriodPicker } from '../dashboard/DashboardPeriodPicker';
import { KsIcon } from '../mobile/icons';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { MobilePageHero } from '../mobile/MobilePageHero';

import { tr, T } from '../../i18n/tr';
type PageView = 'calendar' | 'timeline';
const VIEW_STORAGE_KEY = 'cashsquirrel_calendar_view';

// ?view= wins (shareable link), then the last view used on this device, then the calendar.
const initialPageView = (forceCalendar: boolean, linkedView?: PageView | null): PageView => {
  if (forceCalendar) return 'calendar';
  if (linkedView) return linkedView;
  const fromUrl = new URLSearchParams(window.location.search).get('view');
  if (fromUrl === 'timeline' || fromUrl === 'calendar') return fromUrl;
  try { return localStorage.getItem(VIEW_STORAGE_KEY) === 'timeline' ? 'timeline' : 'calendar'; } catch { return 'calendar'; }
};

interface CalendarTabProps {
  fullFeatureAccess?: boolean;
  /** The receivables page is open to this account. Defaults to fullFeatureAccess. */
  receivablesAccess?: boolean;
  jobs: Job[];
  expenses: Expense[];
  settings: AppSettings;
  onSwitchTab: (id: string) => void;
  /** Jump to a job (same behaviour as the dashboard's job links). */
  onViewJob: (jobId: string) => void;
  onEditJob: (jobId: string) => void;
  onDeleteJob: (jobId: string) => void;
  onAddJob: () => void;
  /** YYYY-MM-DD to open on (e.g. a day clicked in the dashboard's mini calendar). */
  initialDateKey?: string | null;
  onInitialDateHandled?: () => void;
  /** View requested by the link the app was opened with (e.g. the retired /timeline URL). */
  linkedView?: PageView | null;
}

type CalendarView = 'month' | 'week';

// Colors match the Draft 10 mockup source (Calendar.dc.html) exactly, not the brand accent
// palette -- this legend is its own fixed 5-color system independent of light/dark theme.
const EVENT_STYLES: Record<CalendarEventKind, { dot: string; text: string; bg: string }> = {
  post: { dot: '#378ADD', text: '#185FA5', bg: '#E6F1FB' },
  creditTerm: { dot: '#F36A2D', text: '#C24A16', bg: '#FFF1E8' },
  dueSoon: { dot: '#F2A93B', text: '#8A5A0B', bg: '#FAEEDA' },
  paid: { dot: '#18A66A', text: '#12724A', bg: '#E9F8F1' },
  overdue: { dot: '#E95454', text: '#C43A3A', bg: '#FFF0F0' },
};

const EVENT_LEGEND: { kind: CalendarEventKind; label: string }[] = [
  { kind: 'post', label: T("งาน/นัดหมาย") },
  { kind: 'creditTerm', label: T("ครบกำหนดชำระ") },
  { kind: 'dueSoon', label: T("ใกล้ครบกำหนดชำระ") },
  { kind: 'paid', label: T("ได้รับเงินแล้ว") },
  { kind: 'overdue', label: T("เกินกำหนดชำระ") },
];

const WEEKDAYS_TH = [T("อา"), T("จ"), T("อ"), T("พ"), T("พฤ"), T("ศ"), T("ส")];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

export default function CalendarTab({ fullFeatureAccess = false, receivablesAccess = fullFeatureAccess, jobs, expenses, settings, onSwitchTab, onViewJob, onEditJob, onDeleteJob, onAddJob, initialDateKey, onInitialDateHandled, linkedView }: CalendarTabProps) {
  const startKey = initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey) ? initialDateKey : null;
  // A specific day was requested (dashboard mini calendar), so that always opens the calendar.
  const [pageView, setPageView] = useState<PageView>(() => initialPageView(Boolean(startKey), linkedView));
  const [timelineMonth, setTimelineMonth] = useState<string | undefined>(undefined);
  const switchView = (next: PageView) => {
    setPageView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* private mode: just don't remember */ }
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const [viewDate, setViewDate] = useState(() => (startKey ? fromDateKey(startKey) : new Date()));
  const [selectedKey, setSelectedKey] = useState<string>(() => startKey ?? toDateKey(new Date()));
  // The requested date is only a starting point; clear it so a later visit opens on today.
  React.useEffect(() => { if (initialDateKey) onInitialDateHandled?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const mobile = useMobileLayout();
  // Phones: the job a timeline row was tapped for (same peek card the desktop timeline opens).
  const [peekId, setPeekId] = useState<string | null>(null);
  const todayKey = toDateKey(new Date());
  const eventsByDay = useMemo(() => buildCalendarEvents(jobs, todayKey), [jobs, todayKey]);

  const gridDays = useMemo(() => {
    if (calendarView === 'week') {
      const firstDay = startOfWeek(viewDate);
      return Array.from({ length: 7 }, (_, index) => ({
        date: addDays(firstDay, index),
        inMonth: true,
      }));
    }

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ date: new Date(year, month, i - startOffset + 1), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return cells;
  }, [calendarView, viewDate]);

  const selectedEvents = eventsByDay.get(selectedKey) || [];
  const monthLabel = viewDate.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  const selectedDateLabel = fromDateKey(selectedKey).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
  const weekStart = startOfWeek(viewDate);
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${weekStart.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const headingLabel = calendarView === 'month' ? monthLabel : weekLabel;

  const movePeriod = (direction: -1 | 1) => {
    if (calendarView === 'week') {
      const nextDate = addDays(viewDate, direction * 7);
      setViewDate(nextDate);
      setSelectedKey(toDateKey(nextDate));
      return;
    }

    const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + direction, 1);
    setViewDate(nextDate);
    setSelectedKey(toDateKey(nextDate));
  };

  const changeView = (nextView: CalendarView) => {
    const selectedDate = fromDateKey(selectedKey);
    setCalendarView(nextView);
    setViewDate(selectedDate);
  };

  // iOS segmented control (index.css .ios-seg); the chosen option is styled from aria-selected.
  const segment = (_active: boolean) => 'ios-seg-item h-8 gap-1.5 px-3 text-xs';

  // Phones: one small box on the terracotta, the month's money still to receive (owner, 2026-10-20:
  // "เหลือแค่ช่องเดียวก็คือเงินที่รอรับ"). The month's due amounts, the same figure as the เงินรอรับ page.
  const mobileMonthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
  const mobileOwed = useMemo(() => Array.from(eventsByDay.entries())
    .filter(([key]) => key.startsWith(mobileMonthKey))
    .flatMap(([, list]) => list)
    .filter(event => event.kind === 'creditTerm' || event.kind === 'dueSoon' || event.kind === 'overdue')
    .reduce((sum, event) => sum + event.amount, 0), [eventsByDay, mobileMonthKey]);

  // Phones: the mobile design's calendar and timeline. Both read the same events as the desktop
  // views (buildCalendarEvents), so a date shows the same jobs and amounts everywhere.
  if (mobile) {
    const monthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`;
    const setMonth = (key: string) => {
      const [year, month] = key.split('-').map(Number);
      const first = new Date(year, month - 1, 1);
      setViewDate(first);
      setSelectedKey(key === todayKey.slice(0, 7) ? todayKey : toDateKey(first));
    };
    const tone = (event: CalendarDayEvent) => (event.kind === 'paid' ? 'paid' : event.kind === 'overdue' ? 'overdue' : 'due');
    const shortDate = (key: string) => fromDateKey(key).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const monthShort = (key: string) => fromDateKey(key).toLocaleDateString(dateLocale(), { month: 'short' });
    const offset = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const monthEvents = Array.from(eventsByDay.entries())
      .filter(([key]) => key.startsWith(monthKey))
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, list]) => list);
    const peekJob = peekId ? jobs.find(job => job.id === peekId) || null : null;
    const KIND_LABEL: Record<CalendarEventKind, string> = { post: T("ส่งงาน"), creditTerm: T("ครบกำหนดรับเงิน"), dueSoon: T("ใกล้ครบกำหนด"), paid: T("รับเงินแล้ว"), overdue: T("เลยกำหนดรับเงิน") };
    // One event: what kind it is, who or what it is for, and the money on the right (deliveries have none).
    const eventCard = (event: CalendarDayEvent, onOpen: () => void) => {
      const money = event.kind !== 'post';
      const title = money ? event.client || event.jobName : event.jobName;
      const detail = money ? (event.client ? event.jobName : '') : event.client;
      return (
        <button key={event.id} type="button" className={`ksm-tl-event is-${event.kind}`} onClick={onOpen}
          aria-label={`${tr(KIND_LABEL[event.kind])} ${title}${money ? ` ${formatCurrency(event.amount)}` : ''}`}>
          <span className="ksm-grow">
            <span className="ksm-tl-kind"><i aria-hidden="true" />{tr(KIND_LABEL[event.kind])}</span>
            <b>{title}</b>
            {detail && <p>{detail}</p>}
          </span>
          {money
            ? <strong className="ksm-tl-amount">{event.kind === 'paid' ? '+' : ''}{formatCurrency(event.amount)}</strong>
            : <KsIcon name="chevron" size={16} />}
        </button>
      );
    };
    const monthDays = Array.from(new Set(monthEvents.map(event => event.date)));
    const monthLabelShort = viewDate.toLocaleDateString(dateLocale(), { month: 'short', year: 'numeric' });
    // In the current month a quiet "วันนี้" mark sits on the rail where today falls when today has nothing.
    const nowAt = monthKey === todayKey.slice(0, 7) && !monthDays.includes(todayKey)
      ? monthDays.findIndex(day => day > todayKey) : -2;
    const nowMark = <li key="now" className="ksm-tl-now"><span>{tr("วันนี้ · {0}", shortDate(todayKey))}</span></li>;
    const viewSwitch = (
      <div className="ksm-viewswitch" role="group" aria-label={tr("มุมมอง")}>
        <button type="button" aria-pressed={pageView === 'calendar'} onClick={() => switchView('calendar')}>{tr("ปฏิทิน")}</button>
        <button type="button" aria-pressed={pageView === 'timeline'} onClick={() => switchView('timeline')}>{tr("ไทม์ไลน์")}</button>
      </div>
    );
    return (
      <div className="page-content ksm ksm-screen">
        {/* The same header as the overview, งาน and every page (owner, 2026-10-20): scrolling fades the title and
            leaves only the เงินรอรับ box pinned under the top bar. */}
        <MobilePageHero title={pageView === 'timeline' ? tr("ไทม์ไลน์") : tr("ปฏิทิน")} actions={viewSwitch} box={{
          label: tr("เงินรอรับ · {0}", monthLabelShort),
          icon: 'calendar',
          amount: formatCurrency(mobileOwed),
          onOpen: () => onSwitchTab(receivablesAccess ? 'receivables' : 'jobs'),
          openLabel: tr("เงินรอรับ {0} {1} · ดูรายการ", monthLabelShort, formatCurrency(mobileOwed)),
        }} />

        {pageView === 'calendar' ? (
          <>
            <div className="ksm-row-between">
              <DashboardPeriodPicker monthKey={monthKey} onChange={setMonth} compact />
              <button type="button" className="ksm-link" onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey); }}>{tr("วันนี้")}</button>
            </div>
            <div className="ksm-calendar">
              <div className="ksm-weekdays" aria-hidden="true">{[tr("อา."), tr("จ."), tr("อ."), tr("พ."), tr("พฤ."), tr("ศ."), tr("ส.")].map(day => <span key={day}>{day}</span>)}</div>
              <div className="ksm-calgrid">
                {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const key = `${monthKey}-${String(i + 1).padStart(2, '0')}`;
                  const events = eventsByDay.get(key) || [];
                  const hasOverdue = events.some(event => event.kind === 'overdue');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedKey(key)}
                      aria-pressed={key === selectedKey}
                      aria-label={tr("{0} {1} รายการ{2}", shortDate(key), events.length, hasOverdue ? tr(" มีเงินเกินกำหนด") : '')}
                      className={`${key === selectedKey ? 'is-selected' : ''} ${key === todayKey ? 'is-today' : ''} ${hasOverdue ? 'has-overdue' : ''}`}
                    >
                      {i + 1}
                      <span className="ksm-daydots">{events.slice(0, 3).map(event => <i key={event.id} className={`is-${tone(event)}`} />)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="ksm-legend">
              <span><i className="is-neutral" />{tr("งาน / กำหนดรับ")}</span>
              <span><i className="is-overdue" />{tr("เกินกำหนด")}</span>
              <span><i className="is-paid" />{tr("รับแล้ว")}</span>
            </div>
            <div className="ksm-daytitle"><h3>{shortDate(selectedKey)}</h3><small>{tr("{0} รายการ", selectedEvents.length)}</small></div>
            {selectedEvents.length > 0 ? (
              <div className="ksm-tl-events ksm-daylist">{selectedEvents.map(event => eventCard(event, () => onViewJob(event.jobId)))}</div>
            ) : (
              <div className="ksm-empty"><h3>{tr("วันนี้ไม่มีรายการ")}</h3><p>{tr("แตะวันที่ที่มีจุด เพื่อดูรายการ")}</p></div>
            )}
          </>
        ) : (
          <>
            <DashboardPeriodPicker monthKey={monthKey} onChange={setMonth} compact />
            {monthEvents.length > 0 ? (
              <ol className="ksm-tl" aria-label={tr("รายการตามวัน")}>
                {monthDays.map((day, index) => (
                  <React.Fragment key={day}>
                    {index === nowAt && nowMark}
                    <li className={`ksm-tl-day${day === todayKey ? ' is-today' : day < todayKey ? ' is-past' : ''}`}>
                      <span className="ksm-tl-date" aria-label={shortDate(day)}><b>{Number(day.slice(8))}</b><small>{day === todayKey ? tr("วันนี้") : monthShort(day)}</small></span>
                      <div className="ksm-tl-events">{(eventsByDay.get(day) || []).map(event => eventCard(event, () => setPeekId(event.jobId)))}</div>
                    </li>
                  </React.Fragment>
                ))}
                {nowAt === -1 && nowMark}
              </ol>
            ) : (
              <div className="ksm-empty" style={{ marginTop: 8 }}><h3>{tr("เดือนนี้ยังไม่มีรายการ")}</h3><p>{tr("ลองเลือกเดือนอื่น")}</p></div>
            )}
            <p className="ksm-caption">{tr("รายการค้างรับอาจเปลี่ยนเมื่อบันทึกรับเงินจริง")}</p>
            <JobPeekSheet
              job={peekJob}
              onClose={() => setPeekId(null)}
              onOpenInJobs={job => { setPeekId(null); onViewJob(job.id); }}
              onEdit={job => { setPeekId(null); onEditJob(job.id); }}
              onDelete={job => { setPeekId(null); onDeleteJob(job.id); }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-content space-y-4">
      <PageHeader page="calendar">
        <div className="ios-seg flex w-fit items-center" role="tablist" aria-label={tr("มุมมองปฏิทิน")}>
          <button type="button" role="tab" aria-selected={pageView === 'calendar'} onClick={() => switchView('calendar')} className={segment(pageView === 'calendar')}>
            <CalendarDays className="h-4 w-4" /> {tr("ปฏิทิน")}</button>
          <button type="button" role="tab" aria-selected={pageView === 'timeline'} onClick={() => { setTimelineMonth(undefined); switchView('timeline'); }} className={segment(pageView === 'timeline')}>
            <List className="h-4 w-4" /> {tr("ไทม์ไลน์")}</button>
        </div>
      </PageHeader>

      <AnimatePresence mode="wait" initial={false}>
      {pageView === 'timeline' ? (
        <motion.div key="timeline" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
          <TimelineView jobs={jobs} expenses={expenses} settings={settings} onViewJob={onViewJob} onEditJob={onEditJob} onDeleteJob={onDeleteJob} onAddJob={onAddJob} initialMonth={timelineMonth} />
        </motion.div>
      ) : (
      <motion.div key="calendar" className="space-y-4" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.18 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[19px] font-semibold text-brand-text">{headingLabel}</h2>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => movePeriod(-1)}
              aria-label={calendarView === 'month' ? tr("เดือนก่อนหน้า") : tr("สัปดาห์ก่อนหน้า")}
              className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey); }}
              className="rounded-lg border border-brand-border px-2.5 py-1.5 text-[11px] font-medium text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              {tr("วันนี้")}</button>
            <button
              type="button"
              onClick={() => movePeriod(1)}
              aria-label={calendarView === 'month' ? tr("เดือนถัดไป") : tr("สัปดาห์ถัดไป")}
              className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="ios-seg flex w-fit items-center">
            <button
              type="button"
              onClick={() => changeView('month')}
              aria-pressed={calendarView === 'month'}
              className="ios-seg-item h-8 px-3.5 text-xs"
            >{tr("เดือน")}</button>
            <button
              type="button"
              onClick={() => changeView('week')}
              aria-pressed={calendarView === 'week'}
              className="ios-seg-item h-8 px-3.5 text-xs"
            >{tr("สัปดาห์")}</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3.5 text-[11px] text-brand-muted">
        {EVENT_LEGEND.map(({ kind, label }) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: EVENT_STYLES[kind].dot }} />
            {tr(label)}
          </span>
        ))}
      </div>

      {/* Desktop: calendar on the left, month money + selected day on the right.
          Phones: month money first, then the calendar, then the day. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px] lg:grid-rows-[auto_1fr]">
        <MonthMoneySummary
          jobs={jobs}
          monthKey={toDateKey(viewDate).slice(0, 7)}
          onOpenTimeline={() => { setTimelineMonth(toDateKey(viewDate).slice(0, 7)); switchView('timeline'); }}
          className="lg:col-start-2 lg:row-start-1"
        />
        <div className="overflow-x-auto pb-1 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div className={calendarView === 'week' ? 'min-w-[680px]' : ''} data-calendar-view={calendarView}>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-brand-muted mb-1.5">
              {WEEKDAYS_TH.map(w => <div key={w}>{tr(w)}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
            {gridDays.map(({ date, inMonth }) => {
              const key = toDateKey(date);
              const events = eventsByDay.get(key) || [];
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              const visibleEventLimit = calendarView === 'week' ? 6 : 2;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  aria-label={date.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  className={`flex flex-col items-start gap-0.5 rounded-[10px] border bg-brand-white p-1.5 text-left transition-colors cursor-pointer ${calendarView === 'week' ? 'min-h-[240px]' : 'min-h-[78px]'} ${
                    isSelected ? 'border-[#F36A2D]' : 'border-brand-border hover:bg-brand-faint'
                  } ${!inMonth ? 'opacity-35' : ''}`}
                >
                  <span className={`text-[11px] font-medium ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-[#E65F2B] text-white' : 'text-brand-text'}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex w-full flex-col gap-0.5">
                    {events.slice(0, visibleEventLimit).map((e) => (
                      <span
                        key={e.id}
                        className="block w-full truncate rounded px-1 py-0.5 text-[9px]"
                        style={{ background: EVENT_STYLES[e.kind].bg, color: EVENT_STYLES[e.kind].text }}
                      >
                        {tr(e.label)}
                      </span>
                    ))}
                    {events.length > visibleEventLimit && (
                      <span className="text-[9px] text-brand-muted">+{events.length - visibleEventLimit}</span>
                    )}
                  </div>
                </button>
              );
            })}
            </div>
          </div>
        </div>

        <div className={`${uiSurface} self-start p-[18px] lg:col-start-2 lg:row-start-2`}>
          <h4 className="mb-3 text-[13px] font-medium text-brand-text">{tr("รายการ{0}", selectedDateLabel)}</h4>
          {selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-brand-muted">{tr("ไม่มีรายการในวันนี้")}</p>
          ) : (
            selectedEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onViewJob(e.jobId)}
                className="flex w-full items-start gap-2 border-t border-brand-border py-2 text-left first:border-t-0 cursor-pointer"
              >
                <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_STYLES[e.kind].dot }} />
                <span className="text-xs text-brand-text">{tr(e.label)}</span>
              </button>
            ))
          )}
        </div>
      </div>
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

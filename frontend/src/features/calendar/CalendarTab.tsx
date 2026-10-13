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
import '../mobile/mobile.css';

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
  { kind: 'post', label: 'งาน/นัดหมาย' },
  { kind: 'creditTerm', label: 'ครบกำหนดชำระ' },
  { kind: 'dueSoon', label: 'ใกล้ครบกำหนดชำระ' },
  { kind: 'paid', label: 'ได้รับเงินแล้ว' },
  { kind: 'overdue', label: 'เกินกำหนดชำระ' },
];

const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

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

export default function CalendarTab({ jobs, expenses, settings, onSwitchTab, onViewJob, onEditJob, onDeleteJob, onAddJob, initialDateKey, onInitialDateHandled, linkedView }: CalendarTabProps) {
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

  const segment = (active: boolean) =>
    `flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-xs font-medium transition-colors cursor-pointer ${active
      ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300'
      : 'text-brand-muted hover:text-brand-text'}`;

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
    const describe = (event: CalendarDayEvent) => event.kind === 'post'
      ? { title: event.jobName, sub: 'กำหนดส่งงาน' }
      : event.kind === 'paid'
        ? { title: event.client || event.jobName, sub: `รับเงิน ${formatCurrency(event.amount)}` }
        : { title: event.client || event.jobName, sub: `รอรับ ${formatCurrency(event.amount)}` };
    const shortDate = (key: string) => fromDateKey(key).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const monthShort = (key: string) => fromDateKey(key).toLocaleDateString(dateLocale(), { month: 'short' });
    const offset = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const monthEvents = Array.from(eventsByDay.entries())
      .filter(([key]) => key.startsWith(monthKey))
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, list]) => list);
    // Money that was due before this month and is still not in.
    const carried = Array.from(eventsByDay.entries())
      .filter(([key]) => key < `${monthKey}-01`)
      .flatMap(([, list]) => list)
      .filter(event => event.kind === 'overdue')
      .reduce((sum, event) => sum + event.amount, 0);
    const peekJob = peekId ? jobs.find(job => job.id === peekId) || null : null;
    return (
      <div className="page-content ksm ksm-screen">
        <div className="ksm-pagetitle">
          <div>
            <h2>{pageView === 'timeline' ? 'ไทม์ไลน์' : 'ปฏิทิน'}</h2>
            <p>{pageView === 'timeline' ? 'วันส่งงานและวันรับเงินจริง' : 'กำหนดงาน และวันรับเงิน'}</p>
          </div>
          <button type="button" className="ksm-btn-secondary" onClick={() => switchView(pageView === 'timeline' ? 'calendar' : 'timeline')}>
            {pageView === 'timeline' ? 'ปฏิทิน' : 'ไทม์ไลน์'}
          </button>
        </div>

        {pageView === 'calendar' ? (
          <>
            <div className="ksm-row-between">
              <DashboardPeriodPicker monthKey={monthKey} onChange={setMonth} compact />
              <button type="button" className="ksm-link" onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey); }}>วันนี้</button>
            </div>
            <div className="ksm-calendar">
              <div className="ksm-weekdays" aria-hidden="true">{['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'].map(day => <span key={day}>{day}</span>)}</div>
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
                      aria-label={`${shortDate(key)} ${events.length} รายการ${hasOverdue ? ' มีเงินเกินกำหนด' : ''}`}
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
              <span><i className="is-neutral" />งาน / กำหนดรับ</span>
              <span><i className="is-overdue" />เกินกำหนด</span>
              <span><i className="is-paid" />รับแล้ว</span>
            </div>
            <div className="ksm-daytitle"><h3>{shortDate(selectedKey)}</h3><small>{selectedEvents.length} รายการ</small></div>
            {selectedEvents.length > 0 ? (
              <div className="ksm-list ksm-eventlist">
                {selectedEvents.map(event => {
                  const text = describe(event);
                  return (
                    <button key={event.id} type="button" onClick={() => onViewJob(event.jobId)}>
                      <i className={`ksm-eventbar is-${tone(event)}`} aria-hidden="true" />
                      <span className="ksm-grow"><b>{text.title}</b><p>{text.sub}{event.kind === 'overdue' ? ' · เกินกำหนด' : ''}</p></span>
                      <KsIcon name="chevron" size={16} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="ksm-empty"><h3>วันนี้ไม่มีรายการ</h3><p>แตะวันที่ที่มีจุด เพื่อดูรายการ</p></div>
            )}
          </>
        ) : (
          <>
            <DashboardPeriodPicker monthKey={monthKey} onChange={setMonth} compact />
            {carried > 0 && (
              <div className="ksm-info">
                <span>ค้างจากเดือนก่อน {formatCurrency(carried)}</span>
                <button type="button" className="ksm-btn is-soft" onClick={() => onSwitchTab('receivables')}>ดูรายการ</button>
              </div>
            )}
            {monthEvents.length > 0 ? monthEvents.map(event => {
              const text = describe(event);
              return (
                <button key={event.id} type="button" className={`ksm-timeline-row is-${tone(event)}`} onClick={() => setPeekId(event.jobId)}>
                  <span className="ksm-date"><b>{Number(event.date.slice(8))}</b><small>{monthShort(event.date)}</small></span>
                  <span className="ksm-grow"><b>{text.title}</b><p>{text.sub}</p></span>
                  <i className="ksm-statusdot" aria-hidden="true" />
                </button>
              );
            }) : (
              <div className="ksm-empty" style={{ marginTop: 8 }}><h3>เดือนนี้ยังไม่มีรายการ</h3><p>ลองเลือกเดือนอื่น</p></div>
            )}
            <p className="ksm-caption">รายการค้างรับอาจเปลี่ยนเมื่อบันทึกรับเงินจริง</p>
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
        <div className="flex items-center gap-1 rounded-xl border border-brand-border bg-brand-white p-0.5" role="tablist" aria-label="มุมมองปฏิทิน">
          <button type="button" role="tab" aria-selected={pageView === 'calendar'} onClick={() => switchView('calendar')} className={segment(pageView === 'calendar')}>
            <CalendarDays className="h-4 w-4" /> ปฏิทิน
          </button>
          <button type="button" role="tab" aria-selected={pageView === 'timeline'} onClick={() => { setTimelineMonth(undefined); switchView('timeline'); }} className={segment(pageView === 'timeline')}>
            <List className="h-4 w-4" /> ไทม์ไลน์
          </button>
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
              aria-label={calendarView === 'month' ? 'เดือนก่อนหน้า' : 'สัปดาห์ก่อนหน้า'}
              className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey); }}
              className="rounded-lg border border-brand-border px-2.5 py-1.5 text-[11px] font-medium text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => movePeriod(1)}
              aria-label={calendarView === 'month' ? 'เดือนถัดไป' : 'สัปดาห์ถัดไป'}
              className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => changeView('month')}
              aria-pressed={calendarView === 'month'}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${calendarView === 'month' ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'bg-brand-faint text-brand-muted hover:text-brand-text'}`}
            >เดือน</button>
            <button
              type="button"
              onClick={() => changeView('week')}
              aria-pressed={calendarView === 'week'}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${calendarView === 'week' ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'bg-brand-faint text-brand-muted hover:text-brand-text'}`}
            >สัปดาห์</button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3.5 text-[11px] text-brand-muted">
        {EVENT_LEGEND.map(({ kind, label }) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: EVENT_STYLES[kind].dot }} />
            {label}
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
              {WEEKDAYS_TH.map(w => <div key={w}>{w}</div>)}
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
                        {e.label}
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
          <h4 className="mb-3 text-[13px] font-medium text-brand-text">รายการ{selectedDateLabel}</h4>
          {selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-brand-muted">ไม่มีรายการในวันนี้</p>
          ) : (
            selectedEvents.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onViewJob(e.jobId)}
                className="flex w-full items-start gap-2 border-t border-brand-border py-2 text-left first:border-t-0 cursor-pointer"
              >
                <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_STYLES[e.kind].dot }} />
                <span className="text-xs text-brand-text">{e.label}</span>
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

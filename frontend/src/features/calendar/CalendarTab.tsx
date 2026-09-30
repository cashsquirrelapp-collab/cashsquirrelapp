import React, { useMemo, useState } from 'react';
import { Job } from '../../../../shared/types';
import { formatCurrency, dateLocale } from '../../utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarTabProps {
  jobs: Job[];
  onSwitchTab: (id: string) => void;
  /** YYYY-MM-DD to open on (e.g. a day clicked in the dashboard's mini calendar). */
  initialDateKey?: string | null;
  onInitialDateHandled?: () => void;
}

type EventKind = 'post' | 'creditTerm' | 'dueSoon' | 'paid' | 'overdue';
type CalendarView = 'month' | 'week';

interface DayEvent {
  jobId: string;
  jobName: string;
  client: string;
  amount: number;
  kind: EventKind;
  label: string;
}

// Colors match the Draft 10 mockup source (Calendar.dc.html) exactly, not the brand accent
// palette -- this legend is its own fixed 5-color system independent of light/dark theme.
const EVENT_STYLES: Record<EventKind, { dot: string; text: string; bg: string }> = {
  post: { dot: '#378ADD', text: '#185FA5', bg: '#E6F1FB' },
  creditTerm: { dot: '#F36A2D', text: '#C24A16', bg: '#FFF1E8' },
  dueSoon: { dot: '#F2A93B', text: '#8A5A0B', bg: '#FAEEDA' },
  paid: { dot: '#18A66A', text: '#12724A', bg: '#E9F8F1' },
  overdue: { dot: '#E95454', text: '#C43A3A', bg: '#FFF0F0' },
};

const EVENT_LEGEND: { kind: EventKind; label: string }[] = [
  { kind: 'post', label: 'งาน/นัดหมาย' },
  { kind: 'creditTerm', label: 'Credit Term' },
  { kind: 'dueSoon', label: 'ใกล้ครบกำหนด' },
  { kind: 'paid', label: 'เงินเข้า' },
  { kind: 'overdue', label: 'เกินกำหนด' },
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

export default function CalendarTab({ jobs, onSwitchTab, initialDateKey, onInitialDateHandled }: CalendarTabProps) {
  const startKey = initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey) ? initialDateKey : null;
  const [viewDate, setViewDate] = useState(() => (startKey ? fromDateKey(startKey) : new Date()));
  const [selectedKey, setSelectedKey] = useState<string>(() => startKey ?? toDateKey(new Date()));
  // The requested date is only a starting point; clear it so a later visit opens on today.
  React.useEffect(() => { if (initialDateKey) onInitialDateHandled?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [calendarView, setCalendarView] = useState<CalendarView>('month');

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    const push = (dateStr: string | null | undefined, event: DayEvent) => {
      if (!dateStr) return;
      const key = dateStr.slice(0, 10);
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    };

    const todayKey = toDateKey(new Date());
    const dueSoonCutoff = toDateKey(new Date(Date.now() + 7 * 86400000));
    jobs.forEach(job => {
      if (job.postDate) {
        push(job.postDate, {
          jobId: job.id, jobName: job.name, client: job.client, amount: job.value,
          kind: 'post', label: `ส่งงาน/นัดหมาย ${job.name}`,
        });
      }
      const dueDate = job.payDate || job.dueDate;
      if (dueDate && job.isPosted !== false) {
        const key = dueDate.slice(0, 10);
        const isPaid = job.pending <= 0;
        const isOverdue = !isPaid && key < todayKey;
        const isDueSoon = !isPaid && !isOverdue && key <= dueSoonCutoff;
        const kind: EventKind = isPaid ? 'paid' : isOverdue ? 'overdue' : isDueSoon ? 'dueSoon' : 'creditTerm';
        const label = isPaid
          ? `รับเงิน ${job.client || job.name} ${formatCurrency(job.pending || job.value)}`
          : isOverdue
          ? `เกินกำหนด ${job.name}`
          : isDueSoon
          ? `ใกล้ครบกำหนด ${job.name}`
          : `ครบกำหนด ${job.name}`;
        push(dueDate, { jobId: job.id, jobName: job.name, client: job.client, amount: job.pending || job.value, kind, label });
      }
    });
    return map;
  }, [jobs]);

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
  const todayKey = toDateKey(new Date());
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

  return (
    <div className="page-content space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[19px] font-semibold text-brand-text">ปฏิทิน · {headingLabel}</h2>
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
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${calendarView === 'month' ? 'bg-[#FFF1E8] text-[#C24A16]' : 'bg-brand-faint text-brand-muted hover:text-brand-text'}`}
            >เดือน</button>
            <button
              type="button"
              onClick={() => changeView('week')}
              aria-pressed={calendarView === 'week'}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${calendarView === 'week' ? 'bg-[#FFF1E8] text-[#C24A16]' : 'bg-brand-faint text-brand-muted hover:text-brand-text'}`}
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

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="overflow-x-auto pb-1">
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
                    {events.slice(0, visibleEventLimit).map((e, i) => (
                      <span
                        key={i}
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

        <div className="rounded-[14px] border border-brand-border bg-brand-white p-[18px]">
          <h4 className="mb-3 text-[13px] font-medium text-brand-text">รายการ{selectedDateLabel}</h4>
          {selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-brand-muted">ไม่มีรายการในวันนี้</p>
          ) : (
            selectedEvents.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSwitchTab('jobs')}
                className="flex w-full items-start gap-2 border-t border-brand-border py-2 text-left first:border-t-0 cursor-pointer"
              >
                <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_STYLES[e.kind].dot }} />
                <span className="text-xs text-brand-text">{e.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

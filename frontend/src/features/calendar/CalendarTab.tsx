import React, { useMemo, useState } from 'react';
import { Job } from '../../../../shared/types';
import { formatCurrency, dateLocale } from '../../utils';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface CalendarTabProps {
  jobs: Job[];
  onSwitchTab: (id: string) => void;
}

type EventKind = 'post' | 'paid' | 'overdue' | 'dueSoon' | 'upcoming';

interface DayEvent {
  jobId: string;
  jobName: string;
  client: string;
  amount: number;
  kind: EventKind;
  label: string;
}

const EVENT_STYLES: Record<EventKind, { dot: string; text: string; bg: string }> = {
  post: { dot: 'bg-[#4A78C9]', text: 'text-[#4A78C9]', bg: 'bg-[#EAF1FB]' },
  paid: { dot: 'bg-[#18A66A]', text: 'text-[#18A66A]', bg: 'bg-[#E8F8F0]' },
  overdue: { dot: 'bg-[#A63F1B]', text: 'text-[#A63F1B]', bg: 'bg-[#FAECE8]' },
  dueSoon: { dot: 'bg-[#C17817]', text: 'text-[#C17817]', bg: 'bg-[#FDF6EC]' },
  upcoming: { dot: 'bg-[#8A6F5C]', text: 'text-[#8A6F5C]', bg: 'bg-brand-faint' },
};

const EVENT_LEGEND: { kind: EventKind; label: string }[] = [
  { kind: 'post', label: 'งาน/นัดหมาย' },
  { kind: 'dueSoon', label: 'ใกล้ครบกำหนด' },
  { kind: 'paid', label: 'เงินเข้าแล้ว' },
  { kind: 'overdue', label: 'เกินกำหนด' },
];

const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CalendarTab({ jobs, onSwitchTab }: CalendarTabProps) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedKey, setSelectedKey] = useState<string>(() => toDateKey(new Date()));

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
    jobs.forEach(job => {
      if (job.postDate) {
        push(job.postDate, {
          jobId: job.id, jobName: job.name, client: job.client, amount: job.value,
          kind: 'post', label: 'ส่งงาน/นัดหมาย',
        });
      }
      const dueDate = job.payDate || job.dueDate;
      if (dueDate && job.isPosted !== false) {
        const key = dueDate.slice(0, 10);
        const isPaid = job.pending <= 0;
        const isOverdue = !isPaid && key < todayKey;
        const isDueSoon = !isPaid && !isOverdue && key <= toDateKey(new Date(Date.now() + 7 * 86400000));
        push(dueDate, {
          jobId: job.id, jobName: job.name, client: job.client, amount: job.pending || job.value,
          kind: isPaid ? 'paid' : isOverdue ? 'overdue' : isDueSoon ? 'dueSoon' : 'upcoming',
          label: isPaid ? 'ครบกำหนด (จ่ายแล้ว)' : isOverdue ? 'เกินกำหนดชำระ' : 'ครบกำหนดชำระ',
        });
      }
    });
    return map;
  }, [jobs]);

  const gridDays = useMemo(() => {
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
  }, [viewDate]);

  const selectedEvents = eventsByDay.get(selectedKey) || [];
  const monthLabel = viewDate.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  const todayKey = toDateKey(new Date());

  return (
    <div className="page-content space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E65F2B]/10">
            <CalendarDays className="h-4.5 w-4.5 text-[#E65F2B]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-brand-text">ปฏิทิน</h2>
            <p className="text-xs text-brand-muted">งาน นัดหมาย และวันครบกำหนดชำระ รวมจากงานที่บันทึกไว้</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-brand-border bg-brand-white px-4 py-3">
        {EVENT_LEGEND.map(({ kind, label }) => (
          <span key={kind} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-muted">
            <span className={`h-2 w-2 rounded-full ${EVENT_STYLES[kind].dot}`} />
            {label}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-3xl border border-brand-border bg-brand-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black text-brand-text">{monthLabel}</h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => { setViewDate(new Date()); setSelectedKey(todayKey); }}
                className="rounded-lg border border-brand-border px-2.5 py-1.5 text-[10px] font-black text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="rounded-lg border border-brand-border p-1.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-black uppercase tracking-wide text-brand-muted">
            {WEEKDAYS_TH.map(w => <div key={w} className="py-1.5">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {gridDays.map(({ date, inMonth }) => {
              const key = toDateKey(date);
              const events = eventsByDay.get(key) || [];
              const isSelected = key === selectedKey;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`flex min-h-[64px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition-colors cursor-pointer ${
                    isSelected ? 'border-[#E65F2B] bg-[#FAECE8]' : 'border-brand-border/60 hover:bg-brand-faint'
                  } ${!inMonth ? 'opacity-35' : ''}`}
                >
                  <span className={`text-[11px] font-bold ${isToday ? 'flex h-5 w-5 items-center justify-center rounded-full bg-[#E65F2B] text-white' : isSelected ? 'text-[#2B1B0F]' : 'text-brand-text'}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex flex-wrap gap-0.5">
                    {events.slice(0, 3).map((e, i) => (
                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${EVENT_STYLES[e.kind].dot}`} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-brand-border bg-brand-white p-4 shadow-sm sm:p-5">
          <h4 className="mb-3 text-xs font-black text-brand-muted uppercase tracking-wide">
            รายการวัน{new Date(selectedKey).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}
          </h4>
          {selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-xs text-brand-muted">ไม่มีรายการในวันนี้</p>
          ) : (
            <div className="space-y-2.5">
              {selectedEvents.map((e, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSwitchTab('jobs')}
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${EVENT_STYLES[e.kind].bg}`}
                >
                  <p className={`text-[10px] font-black ${EVENT_STYLES[e.kind].text}`}>{e.label}</p>
                  <p className="mt-0.5 text-xs font-bold text-[#2B1B0F] truncate">{e.jobName}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-[#8A6F5C] truncate">{e.client || 'ไม่ระบุลูกค้า'}</span>
                    <span className="text-xs font-mono font-black text-[#2B1B0F] shrink-0">{formatCurrency(e.amount)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

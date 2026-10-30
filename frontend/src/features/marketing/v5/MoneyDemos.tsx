import React from 'react';
import { CalendarDays, Check, Clock3, List, Plus, Receipt } from 'lucide-react';
import { CalendarDemo } from '../v4/Demos';
import { tr, T } from '../../../i18n/tr';
import './money.css';

// Two free features on the landing (owner, 2026-10-29: "อยากเอาฟีเจอร์ฟรีอ่ะใส่ให้มันด้วยนะ ... รายจ่าย ... ไทม์ไลน์อ่ะ
// เราใส่แบบ 2 แบบเลยนะ ก็คือแบบปฏิทินกับแบบที่เป็นไทม์ไลน์ ... โปรเจกต์เรียงลงมา"). Both are drawn in the app's own look
// with the page's one set of example numbers: October 2569, today the 13th, ฿13,000 received from two jobs, three more
// still to come (the calendar), ฿1,200 spent and ฿11,800 left (as เลขา's monthly summary in the chat above says).

type View = 'calendar' | 'timeline';
/** How long each view stays before the other one is shown (the calendar's paydays have all landed by 4.7 s). */
const SHOW_MS: Record<View, number> = { calendar: 9000, timeline: 9500 };

function useReducedMotion() {
  const [still, setStill] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return still;
}

function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [seen, setSeen] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return seen;
}

/**
 * The calendar section's two views, as in the app's ปฏิทิน page: the month on a calendar, and the timeline that lists
 * the jobs down the months their money comes in. While the section is on screen the views take turns, each starting its
 * motion again; pressing one keeps it. The calendar sets the height, so nothing below moves when the view changes.
 */
export function CalendarViews() {
  const [view, setView] = React.useState<View>('calendar');
  const [round, setRound] = React.useState(0);
  const [auto, setAuto] = React.useState(true);
  const box = React.useRef<HTMLDivElement>(null);
  const seen = useOnScreen(box);
  const still = useReducedMotion();

  // Back on screen: the shown view starts again, so its motion and the turn begin together.
  React.useEffect(() => { if (seen) setRound(r => r + 1); }, [seen]);
  React.useEffect(() => {
    if (!auto || !seen || still) return;
    const timer = window.setTimeout(() => { setView(v => (v === 'calendar' ? 'timeline' : 'calendar')); setRound(r => r + 1); }, SHOW_MS[view]);
    return () => window.clearTimeout(timer);
  }, [auto, seen, still, view, round]);

  const choose = (next: View) => {
    setAuto(false);
    if (next !== view) { setView(next); setRound(r => r + 1); }
  };

  return (
    <div className="cl-views" ref={box} data-view={view}>
      <div className="cl-seg" role="group" aria-label={tr('มุมมองปฏิทิน')}>
        <span className="cl-seg-thumb" aria-hidden="true" />
        <button type="button" aria-pressed={view === 'calendar'} onClick={() => choose('calendar')}><CalendarDays size={16} aria-hidden="true" />{tr('ปฏิทิน')}</button>
        <button type="button" aria-pressed={view === 'timeline'} onClick={() => choose('timeline')}><List size={16} aria-hidden="true" />{tr('ไทม์ไลน์')}</button>
      </div>
      <div className="cl-views-stage">
        <div className={`cl-view is-calendar${view === 'calendar' ? ' is-shown' : ''}`} aria-hidden={view !== 'calendar'}>
          <CalendarDemo key={view === 'calendar' ? `calendar-${round}` : 'calendar'} />
        </div>
        <div className={`cl-view is-timeline${view === 'timeline' ? ' is-shown' : ''}`} aria-hidden={view !== 'timeline'}>
          <TimelineDemo key={view === 'timeline' ? `timeline-${round}` : 'timeline'} />
        </div>
      </div>
    </div>
  );
}

type Status = 'received' | 'dueSoon' | 'expected';
type Row = { job: string; client: string; day: number; amount: string; status: Status };
type Month = { label: string; current?: boolean; total: string; received: string; expected: string; rows: Row[]; monthTh: 'oct' | 'nov' };

const TODAY = 13;
// The app's own order (cashTimeline.ts): due soon, then still to come, then received, each by date.
const MONTHS: Month[] = [
  { label: T('ตุลาคม 2569'), current: true, total: '฿38,500', received: '฿13,000', expected: '฿25,500', monthTh: 'oct', rows: [
    { job: T('ตัดต่อวิดีโอ'), client: T('แบรนด์เอ'), day: 16, amount: '฿12,500', status: 'dueSoon' },
    { job: T('ออกแบบโลโก้'), client: T('คาเฟ่ซี'), day: 22, amount: '฿7,500', status: 'expected' },
    { job: T('ถ่ายงานอีเวนต์'), client: T('บริษัทดี'), day: 30, amount: '฿5,500', status: 'expected' },
    { job: T('รีวิวสินค้า'), client: T('คุณเอ'), day: 3, amount: '฿5,000', status: 'received' },
    { job: T('ถ่ายรูปสินค้า'), client: T('ร้านบี'), day: 10, amount: '฿8,000', status: 'received' },
  ] },
  { label: T('พฤศจิกายน 2569'), total: '฿14,000', received: '฿0', expected: '฿14,000', monthTh: 'nov', rows: [
    { job: T('ถ่ายรูปแคตตาล็อก'), client: T('ร้านบี'), day: 3, amount: '฿9,000', status: 'expected' },
    { job: T('รีวิวสินค้า'), client: T('คุณเอ'), day: 9, amount: '฿5,000', status: 'expected' },
  ] },
];

const dayText = (month: Month['monthTh'], day: number) => month === 'oct' ? tr('{0} ต.ค.', day) : tr('{0} พ.ย.', day);
const statusText = (month: Month, row: Row) => {
  if (row.status === 'received') return tr('รับแล้ว ✓ {0}', dayText(month.monthTh, row.day));
  const days = month.monthTh === 'oct' ? row.day - TODAY : 31 - TODAY + row.day;
  return tr('ครบกำหนดชำระอีก {0} วัน', days);
};

/** The timeline: each month with what is expected, then its jobs listed down, the way the app's ไทม์ไลน์ shows them. */
function TimelineDemo() {
  const frame_ = React.useRef<HTMLDivElement>(null);
  const track = React.useRef<HTMLDivElement>(null);
  // How far the list moves up to bring November in: measured, as the rows wrap differently on each width.
  React.useLayoutEffect(() => {
    const frame = frame_.current, list = track.current;
    if (!frame || !list) return;
    // It stops with a row's top edge just inside the top, never with half a row cut off there.
    const measure = () => {
      const room = Math.max(0, list.scrollHeight - frame.clientHeight);
      // Layout positions, not drawn ones: the rows are still rising (moved down) when this first runs.
      const topIn = (el: HTMLElement) => { let y = 0; for (let e: HTMLElement | null = el; e && e !== list; e = e.offsetParent as HTMLElement | null) y += e.offsetTop; return y; };
      const edges = Array.from(list.querySelectorAll<HTMLElement>('.gl-tl-row, .gl-tl-month > h4'), el => topIn(el) - 3);
      // The edge nearest the end of the list: just past it only when that leaves little empty room below (phones
      // otherwise showed a blank stretch under November), else just before it, the last row going under the fade.
      const after = edges.filter(edge => edge >= room).sort((a, b) => a - b)[0];
      const before = edges.filter(edge => edge <= room).sort((a, b) => b - a)[0];
      const shift = after !== undefined && (after - room <= 24 || before === undefined) ? after : before ?? room;
      list.style.setProperty('--tl-shift', `${Math.round(Math.max(0, shift))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(list); // the type arriving can change how the rows wrap
    return () => observer.disconnect();
  }, []);

  let at = 0;
  return (
    <div className="gl-demo gl-tl" role="img" aria-label={tr('ตัวอย่าง: ไทม์ไลน์ที่เรียงงานลงมาตามเดือนที่เงินจะเข้า บอกว่าแต่ละงานได้เงินเมื่อไร')}>
      <div className="gl-tl-window" ref={frame_} aria-hidden="true">
        <div className="gl-tl-track" ref={track}>
          {MONTHS.map((month, m) => (
            <section key={month.label} className={`gl-tl-month is-${m + 1}${month.current ? ' is-current' : ''}`}>
              <span className="gl-tl-node" />
              <h4>{tr(month.label)}{month.current && <small>{tr('เดือนนี้')}</small>}</h4>
              <div className="gl-tl-sum">
                <span><small>{month.current ? tr('คาดว่าจะเข้าเดือนนี้') : tr('คาดว่าจะเข้า')}</small><b className="gl-num">{month.total}</b><small>{tr('{0} รายการ', month.rows.length)}</small></span>
                <span className="gl-tl-split"><small>{tr('รับแล้ว')} <b className="gl-num">{month.received}</b></small><small>{tr('รอรับ')} <b className="gl-num">{month.expected}</b></small></span>
              </div>
              {month.rows.map(row => {
                const n = at++;
                return (
                  <div key={`${row.job}-${row.day}`} className={`gl-tl-row is-${row.status}`} style={{ '--i': n } as React.CSSProperties}>
                    <i className="gl-tl-dot" />
                    <span className="gl-tl-main"><b>{tr(row.job)}</b><small>{tr(row.client)} · {dayText(month.monthTh, row.day)}</small></span>
                    <span className="gl-tl-end"><b className="gl-num">{row.amount}</b><em>{statusText(month, row)}</em></span>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A month of spending: three costs are added one after another, the total rolls up, and the month's net profit shows. */
export function ExpensesDemo() {
  const rows = [
    { name: T('ค่าอินเทอร์เน็ต'), fixed: true, day: 1, category: T('ค่าบริการ/สาธารณูปโภค'), amount: '฿590' },
    { name: T('ค่าแท็กซี่ไปถ่ายงาน'), fixed: false, day: 6, category: T('ค่าเดินทาง/น้ำมัน'), amount: '฿360' },
    { name: T('กาแฟคุยงานกับลูกค้า'), fixed: false, day: 11, category: T('อาหาร/รับรองลูกค้า'), amount: '฿250' },
  ];
  return (
    <div className="gl-demo gl-exp" role="img" aria-label={tr('ตัวอย่าง: จดรายจ่ายเดือนตุลาคม 3 รายการ รวม ฿1,200 แล้วเห็นกำไรสุทธิ ฿11,800')}>
      <div className="gl-exp-head" aria-hidden="true">
        <span><b>{tr('รายจ่าย')}</b><small>{tr('ตุลาคม 2569')}</small></span>
        <span className="gl-exp-add"><Plus size={16} strokeWidth={2.4} />{tr('เพิ่มรายจ่าย')}<span className="gl-exp-tap" /></span>
      </div>
      <div className="gl-exp-total" aria-hidden="true">
        <small>{tr('รายจ่ายรวม')}</small>
        <span className="gl-exp-sum gl-num">{['฿0', '฿590', '฿950', '฿1,200'].map((value, n) => <i key={value} className={`is-${n + 1}`}>{value}</i>)}</span>
      </div>
      <ul className="gl-exp-rows" aria-hidden="true">
        {rows.map((row, n) => (
          <li key={row.name} className={`is-${n + 1}`}>
            <span className={`gl-exp-icon${row.fixed ? ' is-fixed' : ''}`}>{row.fixed ? <Clock3 size={18} /> : <Receipt size={18} />}</span>
            <span className="gl-exp-main">
              <b>{tr(row.name)}</b>
              <small><em className={row.fixed ? 'is-fixed' : ''}>{row.fixed ? tr('ประจำ') : tr('ทั่วไป')}</em>{tr('{0} ต.ค.', row.day)} · {tr(row.category)}</small>
            </span>
            <strong className="gl-num">{row.amount}</strong>
          </li>
        ))}
      </ul>
      <div className="gl-exp-profit" aria-hidden="true">
        <span><small>{tr('รับเงินจริง')}</small><b className="gl-num">฿13,000</b></span>
        <span><small>{tr('รายจ่ายรวม')}</small><b className="gl-num">฿1,200</b></span>
        <span className="is-profit"><small>{tr('กำไรสุทธิ')}</small><b className="gl-num"><Check size={15} strokeWidth={3} />฿11,800</b></span>
      </div>
    </div>
  );
}

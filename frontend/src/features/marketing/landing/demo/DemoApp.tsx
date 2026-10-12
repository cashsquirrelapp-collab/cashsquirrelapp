import React from 'react';
import { Bell, Briefcase, Calculator, CalendarDays, Check, CheckCircle, ChevronDown, Download, FileText, Home, Menu, MoreHorizontal, Plus, Receipt, Search, Target, TrendingUp, User } from 'lucide-react';
import { BrandLockup } from '../../../../components/brand/BrandLogo';
import { Mascot } from '../../../../components/mascot/Mascot';
import { DEMO_MONTH, DEMO_MONTH_LONG, FOCUS_JOB_ID, NEXT_INSTALLMENT_ID, baht, type DemoJob, type DemoState } from './demoData';
import type { DemoFrame } from './demoScript';

// The app as the demo shows it: ภาพรวม and งาน, drawn from props only. Nothing here loads data,
// reads a session or calls an API. Labels, columns, the การชำระ menu, the "รับเงินเป็นงวด" sheet and
// the toast are the app's own wording (DashboardTab, JobsTab), in the app's light theme.
//
// `data-frame` marks regions the camera can frame; `data-cur` marks where the pointer rests.
// On a tall stage the app is drawn at tablet width (no sidebar, client under the job name), the
// same way the real app lays out at that width.

export const CANVAS = { wide: { w: 1200, h: 750 }, compact: { w: 720, h: 900 } } as const;

const NAV = [
  { key: 'dashboard', label: 'ภาพรวม', icon: Home },
  { key: 'jobs', label: 'งาน', icon: Briefcase },
  { key: 'calendar', label: 'ปฏิทิน', icon: CalendarDays },
  { key: 'expenses', label: 'รายจ่าย', icon: Receipt },
  { key: 'goals', label: 'เป้าหมาย', icon: Target },
  { key: 'report', label: 'รายงาน', icon: TrendingUp },
  { key: 'tax', label: 'ภาษี', icon: Calculator },
  { key: 'docs', label: 'เอกสาร', icon: FileText },
];

const card = 'rounded-[14px] border border-[#E7E4DF] bg-white shadow-[0_1px_3px_rgba(60,40,28,0.06),0_8px_22px_rgba(60,40,28,0.07)]';
const num = 'font-mono tabular-nums';

function PageHead({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[#ECE9E5] pb-4">
      <div className="min-w-0">
        <p className="text-[24px] font-semibold leading-tight text-[#1C1917]">{title}</p>
        <p className="mt-1 truncate text-[13px] text-[#77716B]">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

const AddJob = () => <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white"><Plus className="h-4 w-4" />เพิ่มงาน</span>;

function Kpi({ label, value, tone = 'text-[#1C1917]', marked }: { label: string; value: number; tone?: string; marked: boolean }) {
  return (
    <div className={`${card} p-[18px] transition-shadow duration-500 ${marked ? 'ring-2 ring-[#E65F2B]/45' : ''}`}>
      <p className="text-[13px] text-[#77716B]">{label}</p>
      <p key={value} className={`pd-swap mt-1 text-[22px] font-semibold leading-7 ${num} ${tone}`}>{baht(value)}</p>
    </div>
  );
}

function Dashboard({ state, frame, compact }: { state: DemoState; frame: DemoFrame; compact: boolean }) {
  const days = Array.from({ length: state.today }, (_, i) => i + 1);
  const max = Math.max(...state.payments.map(p => p.amount), ...state.expenses.map(e => e.amount));
  const barH = (amount: number) => Math.max(4, Math.round((amount / max) * 96));
  return (
    <div className="space-y-5">
      <PageHead title="ภาพรวม" sub="สรุปรายรับ รายจ่าย และเงินค้างรับของคุณ">
        <span className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E7E4DF] bg-white px-4 text-[13px] font-medium text-[#1C1917]"><CalendarDays className="h-4 w-4 text-[#77716B]" />{DEMO_MONTH}<ChevronDown className="h-3.5 w-3.5 text-[#77716B]" /></span>
        {!compact && <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E7E4DF] bg-white"><Bell className="h-4 w-4 text-[#57514B]" /></span>}
        <AddJob />
      </PageHead>

      <div data-frame="summary" className="space-y-3">
        <div className={`${card} flex items-center gap-4 px-6 py-5`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF1E8]"><Briefcase className="h-5 w-5 text-[#E65F2B]" /></span>
          <div>
            <p className="text-[13px] text-[#77716B]">มูลค่างานเดือนนี้</p>
            <p className={`text-[28px] font-semibold leading-tight text-[#1C1917] ${num}`}>{baht(state.workValue)}</p>
            <p className="text-[13px] text-[#77716B]">{state.jobs.length} งาน</p>
          </div>
        </div>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <div data-frame="kpi" className="grid grid-cols-2 gap-3">
            <Kpi label="รับเงินจริงเดือนนี้" value={state.received} marked={frame.kpiMark} />
            <Kpi label="รอรับเงิน" value={state.pending} tone="text-[#E65F2B]" marked={frame.kpiMark} />
          </div>
          <Kpi label="รายจ่ายเดือนนี้" value={state.spent} marked={false} />
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? '' : 'grid-cols-[minmax(0,1fr)_320px]'}`}>
        <div className={`${card} p-5`}>
          <p className="text-[15px] font-semibold text-[#1C1917]">รายรับ-รายจ่าย</p>
          <p className="text-[12px] text-[#77716B]">{DEMO_MONTH_LONG}</p>
          <div className="mt-4 flex h-[112px] items-end gap-2 border-b border-[#ECE9E5]">
            {days.map(day => {
              const income = state.payments.filter(p => p.day === day).reduce((s, p) => s + p.amount, 0);
              const spend = state.expenses.filter(e => e.day === day).reduce((s, e) => s + e.amount, 0);
              return (
                <div key={day} className="flex flex-1 items-end justify-center gap-1">
                  {income > 0 && <span className="pd-grow w-1/3 rounded-t-[4px] bg-[#F6B48F]" style={{ height: barH(income) }} />}
                  {spend > 0 && <span className="w-1/3 rounded-t-[4px] bg-[#F2A3A3]" style={{ height: barH(spend) }} />}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-2">{days.map(day => <span key={day} className="flex-1 text-center text-[10.5px] text-[#A39D96]">{day}</span>)}</div>
          <div className="mt-3 flex gap-4 text-[12px] text-[#57514B]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F6B48F]" />รายรับ</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#F2A3A3]" />รายจ่าย</span>
          </div>
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center gap-3 border-b border-[#ECE9E5] pb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF1E8]"><Mascot mood="happy" size={30} animated={false} /></span>
            <div className="min-w-0"><p className="text-[14px] font-semibold text-[#1C1917]">เงินที่ต้องติดตาม</p><p className="text-[12px] text-[#77716B]">เรียงจากเร่งด่วนที่สุดก่อน</p></div>
          </div>
          <ul>
            {state.followUps.map(item => (
              <li key={item.id} data-cur={item.id === FOCUS_JOB_ID ? 'follow-video' : undefined} className="flex items-start justify-between gap-3 border-b border-[#F1EEEA] py-3 last:border-b-0">
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-medium text-[#1C1917]">{item.name}</span><span className="block truncate text-[12px] text-[#77716B]">{item.client} · {item.dueShort}</span></span>
                <span key={item.amount} className={`pd-swap shrink-0 text-[13.5px] font-semibold text-[#1C1917] ${num}`}>{baht(item.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const stageTone = (stage: DemoJob['stage']) => (stage === 'เสร็จแล้ว' ? 'bg-[#E9F7F0] text-[#12804F]' : 'bg-[#F3F2F0] text-[#77716B]');
const payTone = (payment: DemoJob['payment']) => (payment === 'รับครบแล้ว' ? 'bg-[#E9F7F0] text-[#12804F]' : payment === 'แบ่งงวด' ? 'bg-[#F3F2F0] text-[#1C1917]' : 'bg-[#FFF1E8] text-[#C24A16]');
const badge = 'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium';

function Jobs({ state, frame, compact }: { state: DemoState; frame: DemoFrame; compact: boolean }) {
  // Two halves per row, so a tall stage can frame the job (start) and its money (end) one at a time.
  const start = compact ? 'grid grid-cols-[minmax(0,1fr)_92px]' : 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_112px]';
  const end = compact ? 'grid grid-cols-[minmax(0,1fr)_88px_32px]' : 'grid grid-cols-[96px_112px_minmax(0,1fr)_36px]';
  const halves = compact ? 'grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]' : 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]';
  const chips = [
    { label: 'ทั้งหมด', value: String(state.counts.all), active: true },
    { label: 'กำลังทำ', value: '0' },
    { label: 'รอรับเงิน', value: `${state.counts.waiting} · ${baht(state.pending)}` },
    { label: 'ปิดงานแล้ว', value: String(state.counts.closed) },
  ];
  return (
    <div className="space-y-4">
      <PageHead title="งาน" sub="จัดการงานและติดตามการรับเงินตั้งแต่เริ่มจนจบ">
        {!compact && <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E7E4DF] bg-white px-3.5 text-[13px] font-medium text-[#1C1917]"><Download className="h-4 w-4" />ส่งออก</span>}
        <AddJob />
      </PageHead>
      <div className="flex gap-2">
        {chips.map(chip => (
          <span key={chip.label} className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] ${chip.active ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16]' : 'border-[#E7E4DF] bg-white text-[#57514B]'}`}>
            {chip.label}<span key={chip.value} className={`pd-swap font-medium ${num}`}>{chip.value}</span>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <span className="flex h-10 flex-1 items-center gap-2 rounded-full border border-[#E7E4DF] bg-white px-4 text-[13px] text-[#A39D96]"><Search className="h-4 w-4" />ค้นหาชื่องาน ลูกค้า หรือแบรนด์...</span>
        <span className="inline-flex h-10 items-center gap-2 rounded-full border border-[#F3B08C] bg-white px-4 text-[13px] font-medium text-[#C24A16]"><CalendarDays className="h-4 w-4" />เดือนนี้<ChevronDown className="h-3.5 w-3.5" /></span>
      </div>

      <div className={card}>
        <div className={`${halves} border-b border-[#ECE9E5] px-4 py-2.5 text-[12px] text-[#77716B]`}>
          <div className={start}><span>งาน / แหล่งรายได้</span>{!compact && <span>ลูกค้า / ผู้จ่าย</span>}<span>กำหนด</span></div>
          <div className={end}>{compact ? <span>สถานะ</span> : <><span>สถานะงาน</span><span>การชำระ</span></>}<span className="text-right">จำนวนเงิน</span><span /></div>
        </div>
        {state.jobs.map(job => {
          const focus = job.id === FOCUS_JOB_ID;
          const pay = (
            <span className="relative inline-flex">
              <span data-cur={focus ? 'pay-badge' : undefined} className={`${badge} ${payTone(job.payment)}`}>{job.payment}<ChevronDown className="-mr-0.5 h-3 w-3 opacity-70" /></span>
              {focus && frame.menu && (
                <span className="pd-pop absolute left-0 top-[calc(100%+6px)] z-10 block w-[200px] rounded-xl border border-[#E7E4DF] bg-white p-1.5 shadow-[0_12px_28px_rgba(60,40,28,0.16)]">
                  <span data-cur="menu-next" className="block rounded-lg bg-[#F6F4F1] px-3 py-2 text-[13px] text-[#1C1917]">รับเงินงวดถัดไป</span>
                </span>
              )}
            </span>
          );
          return (
            <div key={job.id} data-frame={focus ? 'row' : undefined}
              className={`${halves} items-center border-b border-[#ECE9E5] px-4 py-3 last:border-b-0 ${focus && frame.spotlight ? 'job-spotlight' : ''}`}>
              <div data-frame={focus ? 'row-start' : undefined} className={`${start} items-center`}>
                <span className="min-w-0 pr-3">
                  <span className="block truncate text-[14px] font-medium text-[#1C1917]">{job.name}</span>
                  <span className="block truncate text-[12px] text-[#77716B]">{compact ? `${job.client} · ${job.type}` : job.type}</span>
                </span>
                {!compact && <span className="truncate text-[13px] text-[#77716B]">{job.client}</span>}
                <span key={job.due} className="pd-swap whitespace-nowrap text-[13px] text-[#57514B]">{job.due}</span>
              </div>
              <div data-frame={focus ? 'row-end' : undefined} className={`${end} items-center`}>
                {compact
                  ? <span className="flex flex-wrap gap-1"><span className={`${badge} ${stageTone(job.stage)}`}>{job.stage}</span>{pay}</span>
                  : <><span><span className={`${badge} ${stageTone(job.stage)}`}>{job.stage}</span></span><span>{pay}</span></>}
                <span className={`text-right text-[14px] font-semibold text-[#1C1917] ${num}`}>{baht(job.value)}</span>
                <span className="flex justify-end"><MoreHorizontal className="h-4 w-4 text-[#77716B]" /></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "รับเงินเป็นงวด": the app's own sheet for recording an installment. */
function InstallmentSheet({ job, picked }: { job: DemoJob; picked: boolean }) {
  const pending = (job.installments || []).filter(row => !row.paid);
  return (
    <>
      <div className="pd-fade absolute inset-0 z-20 bg-black/40" />
      <div data-frame="sheet" className="pd-rise absolute inset-x-0 bottom-4 z-30 mx-auto w-[448px] space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-[#E65F2B]">รับเงินเป็นงวด</p>
            <p className="mt-1 text-[18px] font-bold text-[#1C1917]">{job.name}</p>
            <p className="mt-1 text-[12px] text-[#77716B]">เลือกเฉพาะงวดที่ได้รับเงินแล้ว ระบบจะคำนวณยอดค้างและงวดถัดไปให้</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F2F0] text-[20px] leading-none text-[#77716B]">×</span>
        </div>
        <div className="space-y-2">
          {pending.map(row => {
            const next = row.id === NEXT_INSTALLMENT_ID;
            return (
              <div key={row.id} data-cur={next ? 'inst-next' : undefined}
                className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors duration-200 ${next && picked ? 'border-[#E65F2B] bg-[#FFF5EE]' : 'border-[#ECE9E5] bg-[#F8F6F3]'}`}>
                <div><p className="text-[13px] font-bold text-[#1C1917]">{row.label}</p><p className="mt-0.5 text-[11.5px] text-[#77716B]">ครบกำหนด {row.due}</p></div>
                <p className={`text-[15px] font-bold text-[#E65F2B] ${num}`}>{baht(row.amount)}</p>
              </div>
            );
          })}
        </div>
        <div>
          <p className="mb-1.5 text-[11.5px] font-bold text-[#77716B]">วันที่รับเงินจริง</p>
          <p className="rounded-xl border border-[#ECE9E5] bg-[#F8F6F3] p-3 text-[14px] font-semibold text-[#1C1917]">09/10/2569</p>
        </div>
        <div data-cur="confirm" className={`flex items-center justify-center gap-2 rounded-xl bg-[#E65F2B] py-3.5 text-[14px] font-bold text-white transition-opacity duration-200 ${picked ? '' : 'opacity-40'}`}>
          <CheckCircle className="h-4 w-4" /> ยืนยันรับเงินงวดนี้
        </div>
      </div>
    </>
  );
}

export function DemoApp({ state, frame, compact }: { state: DemoState; frame: DemoFrame; compact: boolean }) {
  const size = compact ? CANVAS.compact : CANVAS.wide;
  const paidRow = state.focus.installments?.find(row => row.id === NEXT_INSTALLMENT_ID);
  return (
    <div className="relative flex overflow-hidden bg-[#FAFAF9] text-left" style={{ width: size.w, height: size.h, fontFamily: 'var(--font-sans)' }}>
      {!compact && (
        <aside className="flex w-[216px] shrink-0 flex-col border-r border-[#ECE9E5] bg-white px-4 py-5">
          <div className="px-2"><BrandLockup size={28} /></div>
          <nav className="mt-7 space-y-1">
            {NAV.map(item => (
              <span key={item.key} className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors duration-300 ${item.key === frame.view ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'text-[#57514B]'}`}>
                <item.icon className="h-[18px] w-[18px]" />{item.label}
              </span>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 rounded-2xl border border-[#ECE9E5] p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F2F0]"><User className="h-4 w-4 text-[#77716B]" /></span>
            <span className="text-[13px] font-medium text-[#1C1917]">ผู้ใช้ตัวอย่าง</span>
          </div>
        </aside>
      )}
      <div className={`relative min-w-0 flex-1 ${compact ? 'px-5 pb-5 pt-4' : 'px-8 py-7'}`}>
        {compact && (
          <div className="mb-4 flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E7E4DF] bg-white"><Menu className="h-4 w-4 text-[#E65F2B]" /></span>
            <BrandLockup size={26} />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E65F2B]"><User className="h-4 w-4 text-white" /></span>
          </div>
        )}
        <div key={frame.view} className="pd-view">
          {frame.view === 'dashboard' ? <Dashboard state={state} frame={frame} compact={compact} /> : <Jobs state={state} frame={frame} compact={compact} />}
        </div>
        {frame.toast && paidRow && (
          <div className="pd-rise absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4 whitespace-nowrap rounded-xl bg-[#1C1917] px-4 py-2.5 text-[13px] text-white shadow-lg">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-[#7FD8AE]" />รับเงิน {paidRow.label}</span>
            <span className="font-medium text-[#FFB48F]">เลิกทำ</span>
          </div>
        )}
      </div>
      {frame.sheet && <InstallmentSheet job={state.focus} picked={frame.picked} />}
    </div>
  );
}

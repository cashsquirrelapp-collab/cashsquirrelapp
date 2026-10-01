import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Download, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { AppSettings, Expense, Job } from '../../../../shared/types';
import { getOutstandingAmount } from '../../../../shared/installmentPayments';
import { currentMonthKeyNow, exportJobsToCSV, formatCurrency, formatMonthKey, safeFormatThaiDate } from '../../utils';
import { DashboardPeriodPicker } from '../dashboard/DashboardPeriodPicker';
import JobPaymentDialog from '../jobs/JobPaymentDialog';
import { useQuickUndo } from '../jobs/useQuickUndo';
import ExpenseDrawer, { EXPENSE_CATEGORIES, categoryLabel } from './ExpenseDrawer';
import { buildFinanceMonth, type FinanceExpenseRow, type FinanceJobRow, type JobPayState } from './financeMonth';

// การเงิน: a monthly statement, not a second dashboard. Two inputs only -- jobs (money counts
// once it was actually received) and expenses (recurring or general) -- organised by month.

type View = 'overview' | 'jobs' | 'expenses';
type JobFilter = 'all' | 'received' | 'pending' | 'partial' | 'installment';
type ExpenseFilter = 'all' | 'recurring' | 'general';

const STATE_BADGE: Record<JobPayState, { label: string; className: string }> = {
  paid: { label: 'รับครบแล้ว', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  partial: { label: 'รับบางส่วน', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  installment: { label: 'แบ่งงวด', className: 'bg-brand-faint text-brand-text' },
  unpaid: { label: 'ยังไม่จ่าย', className: 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' },
};

const shortDate = (date: string | null) => date ? safeFormatThaiDate(date, { day: 'numeric', month: 'short' }) : '—';
const money = (value: number) => formatCurrency(value);

interface IncomeExpenseTabProps {
  jobs: Job[];
  expenses: Expense[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onEditExpense: (id: string, updated: Partial<Expense>) => void;
  onDeleteExpense: (id: string) => void;
  onEditJob: (id: string, updated: Partial<Job>) => void;
  onViewJob: (jobId: string) => void;
  onSwitchTab: (tab: string) => void;
  onExportData: () => void;
  triggerAlert: (title: string, message: string) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void) => void;
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
  scrollToExpenseId?: string | null;
  onScrollToExpenseHandled?: () => void;
}

export default function IncomeExpenseTab(props: IncomeExpenseTabProps) {
  const { jobs, expenses, settings, onEditJob, onViewJob, triggerAlert, triggerConfirm } = props;
  const currentMonth = currentMonthKeyNow();
  const [monthKey, setMonthKey] = React.useState(currentMonth);
  const [view, setView] = React.useState<View>('overview');
  const [jobFilter, setJobFilter] = React.useState<JobFilter>('all');
  const [expenseFilter, setExpenseFilter] = React.useState<ExpenseFilter>('all');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [expenseSearch, setExpenseSearch] = React.useState('');
  const [drawer, setDrawer] = React.useState<{ expense: Expense | null } | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [payingJob, setPayingJob] = React.useState<Job | null>(null);
  const [menu, setMenu] = React.useState<{ key: string; top: number; left: number; up: boolean; items: { label: string; run: () => void; danger?: boolean }[] } | null>(null);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);
  const { apply: applyQuickChange, bar: undoBar } = useQuickUndo(onEditJob);

  const month = React.useMemo(
    () => buildFinanceMonth(jobs, expenses, settings, monthKey, currentMonth),
    [jobs, expenses, settings, monthKey, currentMonth],
  );
  const monthLabel = formatMonthKey(monthKey);
  const isPastMonth = monthKey < currentMonth;

  // Entry points from elsewhere: the dashboard's "เพิ่มรายจ่าย", and LINE's saved-expense link.
  React.useEffect(() => {
    if (!props.autoOpenAdd) return;
    setDrawer({ expense: null });
    props.onAutoOpenAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoOpenAdd]);
  React.useEffect(() => {
    const id = props.scrollToExpenseId;
    if (!id) return;
    const target = expenses.find(e => e.id === id);
    props.onScrollToExpenseHandled?.();
    if (!target) return;
    setMonthKey(target.date.slice(0, 7));
    setView('expenses');
    setExpenseFilter('all'); setCategoryFilter('all'); setExpenseSearch('');
    setHighlightId(id);
    const scroll = window.setTimeout(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-expense-id="${id}"]`)).find(node => node.offsetParent !== null);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clear = window.setTimeout(() => setHighlightId(null), 2600);
    return () => { window.clearTimeout(scroll); window.clearTimeout(clear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scrollToExpenseId]);

  // One floating ⋯ menu for every row.
  React.useEffect(() => {
    if (!menu && !exportOpen) return;
    const close = () => { setMenu(null); setExportOpen(false); };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.('[data-finance-menu]') || target.closest?.('[aria-haspopup="menu"]')) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [menu, exportOpen]);
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, key: string, items: { label: string; run: () => void; danger?: boolean }[]) => {
    event.stopPropagation();
    if (menu?.key === key) { setMenu(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const up = rect.bottom + 180 > window.innerHeight;
    setMenu({ key, items, up, left: Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208)), top: up ? rect.top - 4 : rect.bottom + 4 });
  };

  const jobById = React.useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const startPayment = (jobId: string) => {
    const job = jobById.get(jobId);
    if (!job) return;
    if (job.installments?.length) { onViewJob(jobId); return; } // installments are paid per row on the job
    setPayingJob(job);
  };
  const jobMenu = (row: FinanceJobRow) => [
    { label: 'ดูงาน', run: () => onViewJob(row.jobId) },
    ...(row.state !== 'paid' ? [{ label: row.hasInstallments ? 'รับเงินงวด' : 'รับเงิน', run: () => startPayment(row.jobId) }] : []),
  ];
  const expenseMenu = (row: FinanceExpenseRow) => row.fromSettings
    ? [{ label: 'แก้ไขในตั้งค่า', run: () => props.onSwitchTab('settings') }]
    : [
        { label: 'แก้ไข', run: () => setDrawer({ expense: expenses.find(e => e.id === row.id) || null }) },
        { label: 'ลบ', danger: true, run: () => triggerConfirm('ยืนยันการลบรายจ่าย', `คุณต้องการลบรายการรายจ่าย "${row.name}" จำนวนเงิน ${money(row.amount)} ใช่หรือไม่?`, () => props.onDeleteExpense(row.id)) },
      ];

  const jobRows = month.jobRows.filter(r =>
    jobFilter === 'all' || (jobFilter === 'received' ? r.received > 0 : jobFilter === 'pending' ? r.pending > 0 : r.state === jobFilter));
  const query = expenseSearch.trim().toLowerCase();
  const expenseRows = month.expenseRows.filter(r =>
    (expenseFilter === 'all' || (expenseFilter === 'recurring' ? r.recurring : !r.recurring))
    && (categoryFilter === 'all' || categoryLabel(r.category) === categoryFilter)
    && (!query || r.name.toLowerCase().includes(query) || (r.note || '').toLowerCase().includes(query)));
  const categoryOptions = Array.from(new Set([...EXPENSE_CATEGORIES, ...month.expenseRows.filter(r => r.category).map(r => categoryLabel(r.category))]));

  const segment = (active: boolean) =>
    `flex h-9 items-center whitespace-nowrap rounded-[10px] px-3.5 text-xs font-medium transition-colors cursor-pointer ${active
      ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300'
      : 'text-brand-muted hover:text-brand-text'}`;
  const chip = (active: boolean) =>
    `h-8 whitespace-nowrap rounded-full border px-3 text-xs transition-colors cursor-pointer ${active
      ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
      : 'border-brand-border text-brand-text hover:bg-brand-faint'}`;
  const card = 'rounded-[14px] border border-brand-border bg-brand-white';
  const remainderClass = month.remainder >= 0 ? 'text-[#18A66A]' : 'text-[#C43A3A] dark:text-rose-300';
  const menuButton = (key: string, items: { label: string; run: () => void; danger?: boolean }[], label: string) => (
    <button type="button" onClick={(e) => openMenu(e, key, items)} aria-label={label} aria-haspopup="menu" aria-expanded={menu?.key === key}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
  const pendingNote = isPastMonth ? 'ยอดค้างปัจจุบันของงานที่ครบกำหนดเดือนนี้' : 'ครบกำหนดเดือนนี้ ยังไม่ได้รับ';

  return (
    <div className="page-content space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-brand-border/30 pb-3.5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-brand-text lg:text-[26px]">การเงิน</h1>
          <p className="mt-0.5 text-[13px] text-brand-muted">ดูเงินจากงานและค่าใช้จ่ายของคุณแบบรายเดือน</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" data-finance-menu>
            <button type="button" onClick={() => setExportOpen(v => !v)} aria-haspopup="menu" aria-expanded={exportOpen}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
              <Download className="h-4 w-4" /> ส่งออก <ChevronDown className="h-3.5 w-3.5 text-brand-muted" />
            </button>
            {exportOpen && (
              <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-52 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900">
                <button type="button" role="menuitem" onClick={() => {
                  setExportOpen(false);
                  if (!exportJobsToCSV(jobs)) triggerAlert('ไม่พบข้อมูล', 'ยังไม่มีข้อมูลงานสำหรับส่งออก');
                  else triggerAlert('ส่งออกสำเร็จ', 'ดาวน์โหลดไฟล์ CSV สำหรับ Excel และ Google Sheets แล้ว');
                }} className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">ส่งออก CSV</button>
                <button type="button" role="menuitem" onClick={() => { setExportOpen(false); props.onExportData(); }}
                  className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">สำรองข้อมูล JSON</button>
              </div>
            )}
          </div>
          <button type="button" onClick={() => setDrawer({ expense: null })}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer">
            <Plus className="h-4 w-4" /> เพิ่มรายจ่าย
          </button>
        </div>
      </div>

      {/* Period + views */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DashboardPeriodPicker monthKey={monthKey} onChange={setMonthKey} />
        <div className="no-scrollbar -mx-1 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-brand-border bg-brand-white p-0.5" role="tablist" aria-label="มุมมองการเงิน">
          {([['overview', 'ภาพรวมเดือน'], ['jobs', 'เงินจากงาน'], ['expenses', 'รายจ่าย']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={segment(view === key)}>{label}</button>
          ))}
        </div>
      </div>

      {/* One compact statement bar */}
      <section aria-label={`สรุป ${monthLabel}`} className={`${card} px-4 py-3`}>
        <p className="mb-2 text-xs font-medium text-brand-muted">{monthLabel}</p>
        <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x sm:divide-brand-border">
          <div className="pr-3"><dt className="text-[11px] text-brand-muted">รับจากงาน</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text">{money(month.received)}</dd></div>
          <div className="sm:px-4"><dt className="text-[11px] text-brand-muted" title={pendingNote}>รอรับ</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text">{money(month.pending)}</dd></div>
          <div className="pr-3 sm:px-4"><dt className="text-[11px] text-brand-muted">รายจ่าย</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text">{money(month.expenseTotal)}</dd></div>
          <div className="sm:pl-4"><dt className="text-[11px] text-brand-muted">เหลือหลังหักรายจ่าย</dt><dd className={`mt-0.5 font-mono text-lg font-semibold ${remainderClass}`}>{month.remainder < 0 ? '-' : ''}{money(Math.abs(month.remainder))}</dd></div>
        </dl>
        {isPastMonth && month.pending > 0 && <p className="mt-2 text-[11px] text-brand-muted">รอรับ = {pendingNote}</p>}
      </section>

      {view === 'overview' && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${card} p-4`} aria-label="เงินจากงาน">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-brand-text">เงินจากงาน · {monthLabel}</h2>
              </div>
              <p className="mt-1 text-xs text-brand-muted">รับแล้ว <span className="font-mono text-brand-text">{money(month.received)}</span> · รอรับ <span className="font-mono text-brand-text">{money(month.pending)}</span></p>
              <ul className="mt-3 divide-y divide-brand-border">
                {month.jobRows.slice(0, 5).map(row => (
                  <li key={row.jobId}>
                    <button type="button" onClick={() => onViewJob(row.jobId)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-brand-faint/50 cursor-pointer">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-brand-text">{row.name}</span>
                        <span className="block truncate text-[11px] text-brand-muted">{row.received > 0 ? `รับเงิน ${shortDate(row.date)}` : `ครบกำหนด ${shortDate(row.date)}`}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {row.received > 0 && <span className="block font-mono text-[13px] font-semibold text-brand-text">+{money(row.received)}</span>}
                        {row.pending > 0 && <span className="block text-[11px] text-brand-muted">{row.received > 0 ? 'เหลือ ' : 'รอรับ '}{money(row.pending)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {month.jobRows.length === 0
                ? <p className="py-6 text-center text-xs text-brand-muted">ยังไม่มีเงินจากงานในเดือนนี้</p>
                : <button type="button" onClick={() => setView('jobs')} className="mt-2 inline-flex items-center gap-1 text-xs text-brand-muted hover:text-[#E65F2B] cursor-pointer">ดูเงินจากงานทั้งหมด <ChevronRight className="h-3.5 w-3.5" /></button>}
            </section>

            <section className={`${card} p-4`} aria-label="รายจ่าย">
              <h2 className="text-[14px] font-semibold text-brand-text">รายจ่าย · {monthLabel}</h2>
              <p className="mt-1 text-xs text-brand-muted">ประจำ <span className="font-mono text-brand-text">{money(month.recurringTotal)}</span> · ทั่วไป <span className="font-mono text-brand-text">{money(month.generalTotal)}</span></p>
              <ul className="mt-3 divide-y divide-brand-border">
                {month.expenseRows.slice(0, 5).map(row => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-brand-text">{row.name}</span>
                      <span className="block truncate text-[11px] text-brand-muted">{row.fromSettings ? 'ทุกเดือน (ตั้งไว้)' : shortDate(row.date)}</span>
                    </span>
                    <ExpenseTypeBadge recurring={row.recurring} />
                    <span className="w-24 shrink-0 text-right font-mono text-[13px] font-semibold text-brand-text">-{money(row.amount)}</span>
                  </li>
                ))}
              </ul>
              {month.expenseRows.length === 0
                ? <EmptyExpenses onAdd={() => setDrawer({ expense: null })} />
                : <button type="button" onClick={() => setView('expenses')} className="mt-2 inline-flex items-center gap-1 text-xs text-brand-muted hover:text-[#E65F2B] cursor-pointer">ดูรายจ่ายทั้งหมด <ChevronRight className="h-3.5 w-3.5" /></button>}
            </section>
          </div>

          {/* Month-end statement */}
          <section className={`${card} max-w-xl p-4`} aria-label={`สรุปเดือน ${monthLabel}`}>
            <h2 className="mb-2 text-[14px] font-semibold text-brand-text">สรุปเดือน {monthLabel}</h2>
            <dl className="space-y-1 text-[13px]">
              <div className="flex justify-between"><dt className="text-brand-muted">รับเงินจริงจากงาน</dt><dd className="font-mono text-brand-text">{money(month.received)}</dd></div>
              <div className="flex justify-between"><dt className="text-brand-muted">รายจ่ายประจำ</dt><dd className="font-mono text-brand-text">{month.recurringTotal > 0 ? '-' : ''}{money(month.recurringTotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-brand-muted">รายจ่ายทั่วไป</dt><dd className="font-mono text-brand-text">{month.generalTotal > 0 ? '-' : ''}{money(month.generalTotal)}</dd></div>
              <div className="flex justify-between border-t border-brand-border pt-1.5 font-semibold"><dt className="text-brand-text">เหลือหลังหักรายจ่าย</dt><dd className={`font-mono ${remainderClass}`}>{month.remainder < 0 ? '-' : ''}{money(Math.abs(month.remainder))}</dd></div>
            </dl>
            <button type="button" onClick={() => props.onSwitchTab('report')} className="mt-3 inline-flex items-center gap-1 text-xs text-brand-muted hover:text-[#E65F2B] cursor-pointer">ดูแนวโน้มย้อนหลัง <ChevronRight className="h-3.5 w-3.5" /></button>
          </section>
        </>
      )}

      {view === 'jobs' && (
        <section aria-label="เงินจากงาน" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-brand-text">เงินจากงาน · {monthLabel}</h2>
              <p className="mt-0.5 text-xs text-brand-muted">
                มูลค่างาน <span className="font-mono text-brand-text">{money(month.workValue)}</span> · รับแล้ว <span className="font-mono text-brand-text">{money(month.received)}</span> · รอรับ <span className="font-mono text-brand-text">{money(month.pending)}</span>
              </p>
            </div>
            <button type="button" onClick={() => setPickerOpen(true)} className="flex h-9 items-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3 text-xs font-medium text-brand-text transition-colors hover:border-[#F3B08C] hover:bg-[#FFF1E8] hover:text-[#C24A16] cursor-pointer">
              รับเงินจากงาน
            </button>
          </div>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {([['all', 'ทั้งหมด'], ['received', 'รับแล้ว'], ['pending', 'รอรับ'], ['partial', 'รับบางส่วน'], ['installment', 'แบ่งงวด']] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={jobFilter === key} onClick={() => setJobFilter(key)} className={chip(jobFilter === key)}>{label}</button>
            ))}
          </div>
          {jobRows.length === 0 ? (
            <div className={`${card} px-6 py-10 text-center text-xs text-brand-muted`}>{month.jobRows.length === 0 ? 'ยังไม่มีเงินจากงานในเดือนนี้' : 'ไม่มีรายการตามตัวกรองนี้'}</div>
          ) : (
            <>
              <div className={`${card} hidden overflow-hidden sm:block`}>
                <table className="w-full table-fixed text-left text-[13px]">
                  <thead><tr className="border-b border-brand-border text-xs text-brand-muted">
                    <th className="w-[26%] px-4 py-2.5 font-medium">งาน</th>
                    <th className="hidden px-3 py-2.5 font-medium lg:table-cell">ลูกค้า</th>
                    <th className="px-3 py-2.5 text-right font-medium">มูลค่างาน</th>
                    <th className="px-3 py-2.5 text-right font-medium">รับแล้ว</th>
                    <th className="px-3 py-2.5 text-right font-medium">รอรับ</th>
                    <th className="px-3 py-2.5 font-medium">วันที่รับ / กำหนด</th>
                    <th className="px-3 py-2.5 font-medium" title="สถานะการชำระของงานตอนนี้">สถานะ</th>
                    <th className="w-12 px-2 py-2.5"><span className="sr-only">การดำเนินการ</span></th>
                  </tr></thead>
                  <tbody>
                    {jobRows.map(row => (
                      <tr key={row.jobId} className="border-b border-brand-border last:border-b-0">
                        <td className="truncate px-4 py-2.5 font-medium text-brand-text">{row.name}<span className="block truncate text-[11px] font-normal text-brand-muted lg:hidden">{row.client || '—'}</span></td>
                        <td className="hidden truncate px-3 py-2.5 text-brand-muted lg:table-cell">{row.client || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-brand-text">{money(row.value)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-brand-text">{money(row.received)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-brand-text">{money(row.pending)}</td>
                        <td className="px-3 py-2.5 text-brand-muted">{shortDate(row.date)}</td>
                        <td className="px-3 py-2.5"><StateBadge state={row.state} /></td>
                        <td className="px-2 py-2.5 text-right">{menuButton(`job-${row.jobId}`, jobMenu(row), `ตัวเลือกของงาน ${row.name}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 sm:hidden">
                {jobRows.map(row => (
                  <li key={row.jobId} className={`${card} px-4 py-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-brand-text">{row.name}</p><p className="truncate text-xs text-brand-muted">{row.client || '—'} · {shortDate(row.date)}</p></div>
                      <p className="shrink-0 text-right font-mono text-sm font-semibold text-brand-text">+{money(row.received)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] text-brand-muted"><StateBadge state={row.state} />{row.pending > 0 && <span>รอรับ {money(row.pending)}</span>}</div>
                      {menuButton(`job-m-${row.jobId}`, jobMenu(row), `ตัวเลือกของงาน ${row.name}`)}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {view === 'expenses' && (
        <section aria-label="รายจ่าย" className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold text-brand-text">รายจ่าย · {monthLabel}</h2>
            <p className="mt-0.5 text-xs text-brand-muted">
              รวม <span className="font-mono text-brand-text">{money(month.expenseTotal)}</span> · ประจำ <span className="font-mono text-brand-text">{money(month.recurringTotal)}</span> · ทั่วไป <span className="font-mono text-brand-text">{money(month.generalTotal)}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-1.5">
              {([['all', 'ทั้งหมด'], ['recurring', 'ประจำ'], ['general', 'ทั่วไป']] as const).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={expenseFilter === key} onClick={() => setExpenseFilter(key)} className={chip(expenseFilter === key)}>{label}</button>
              ))}
            </div>
            <div className="flex flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                <input type="text" value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder="ค้นหารายจ่าย..." aria-label="ค้นหารายจ่าย"
                  className="h-9 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-8 text-[13px] text-brand-text placeholder:text-brand-muted outline-none focus:border-[#E65F2B]" />
                {expenseSearch && <button type="button" onClick={() => setExpenseSearch('')} aria-label="ล้างคำค้นหา" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-muted hover:text-brand-text cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <div className="relative">
                <select aria-label="หมวดหมู่" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 max-w-[160px] appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-8 text-xs text-brand-text outline-none focus:border-[#E65F2B] cursor-pointer">
                  <option value="all">ทุกหมวดหมู่</option>
                  {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
              </div>
            </div>
          </div>
          {expenseRows.length === 0 ? (
            month.expenseRows.length === 0
              ? <div className={card}><EmptyExpenses onAdd={() => setDrawer({ expense: null })} /></div>
              : <div className={`${card} px-6 py-10 text-center text-xs text-brand-muted`}>ไม่มีรายการตามตัวกรองนี้</div>
          ) : (
            <>
              <div className={`${card} hidden overflow-hidden sm:block`}>
                <table className="w-full table-fixed text-left text-[13px]">
                  <thead><tr className="border-b border-brand-border text-xs text-brand-muted">
                    <th className="w-[30%] px-4 py-2.5 font-medium">รายการ</th>
                    <th className="px-3 py-2.5 font-medium">วันที่</th>
                    <th className="px-3 py-2.5 font-medium">ประเภท</th>
                    <th className="hidden px-3 py-2.5 font-medium lg:table-cell">หมวดหมู่</th>
                    <th className="px-3 py-2.5 text-right font-medium">จำนวนเงิน</th>
                    <th className="w-12 px-2 py-2.5"><span className="sr-only">การดำเนินการ</span></th>
                  </tr></thead>
                  <tbody>
                    {expenseRows.map(row => (
                      <tr key={row.id} data-expense-id={row.id} className={`border-b border-brand-border transition-colors last:border-b-0 ${highlightId === row.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''}`}>
                        <td className="truncate px-4 py-2.5 font-medium text-brand-text">{row.name}{row.note && <span className="block truncate text-[11px] font-normal text-brand-muted">{row.note}</span>}</td>
                        <td className="px-3 py-2.5 text-brand-muted">{row.fromSettings ? 'ทุกเดือน' : shortDate(row.date)}</td>
                        <td className="px-3 py-2.5"><ExpenseTypeBadge recurring={row.recurring} /></td>
                        <td className="hidden truncate px-3 py-2.5 text-brand-muted lg:table-cell">{row.fromSettings ? 'ตั้งไว้ในหน้าตั้งค่า' : categoryLabel(row.category)}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-brand-text">{money(row.amount)}</td>
                        <td className="px-2 py-2.5 text-right">{menuButton(`exp-${row.id}`, expenseMenu(row), `ตัวเลือกของรายจ่าย ${row.name}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 sm:hidden">
                {expenseRows.map(row => (
                  <li key={row.id} data-expense-id={row.id} className={`${card} flex items-center gap-3 px-4 py-3 ${highlightId === row.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-text">{row.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-brand-muted"><ExpenseTypeBadge recurring={row.recurring} />{row.fromSettings ? 'ทุกเดือน' : `${shortDate(row.date)} · ${categoryLabel(row.category)}`}</p>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold text-brand-text">{money(row.amount)}</p>
                    {menuButton(`exp-m-${row.id}`, expenseMenu(row), `ตัวเลือกของรายจ่าย ${row.name}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {menu && createPortal(
        <div role="menu" data-finance-menu className="fixed z-[150] w-[200px] rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900"
          style={{ top: menu.top, left: menu.left, transform: menu.up ? 'translateY(-100%)' : undefined }}>
          {menu.items.map(item => (
            <button key={item.label} type="button" role="menuitem" onClick={() => { setMenu(null); item.run(); }}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${item.danger ? 'text-[#C43A3A] hover:bg-[#FFF0F0] dark:text-rose-300 dark:hover:bg-rose-950/40' : 'text-brand-text hover:bg-brand-faint'}`}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {pickerOpen && (
        <JobPicker jobs={jobs} onClose={() => setPickerOpen(false)} onPick={(jobId) => { setPickerOpen(false); startPayment(jobId); }} />
      )}
      <JobPaymentDialog
        job={payingJob}
        initialMode="full"
        allowPartial={Boolean(payingJob && !(payingJob.received > 0) && !payingJob.installments?.length)}
        onClose={() => setPayingJob(null)}
        onConfirm={(updated, message) => { if (payingJob) applyQuickChange(payingJob, updated, message); setPayingJob(null); }}
      />
      {undoBar}

      <ExpenseDrawer
        open={drawer !== null}
        expense={drawer?.expense ?? null}
        settings={settings}
        onUpdateSettings={props.onUpdateSettings}
        onAdd={props.onAddExpense}
        onEdit={props.onEditExpense}
        onClose={() => setDrawer(null)}
        triggerAlert={triggerAlert}
      />
    </div>
  );
}

function StateBadge({ state }: { state: JobPayState }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${STATE_BADGE[state].className}`}>{STATE_BADGE[state].label}</span>;
}

function ExpenseTypeBadge({ recurring }: { recurring: boolean }) {
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-md px-1.5 py-px text-[11px] ${recurring ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'bg-brand-faint text-brand-muted'}`}>
      {recurring ? 'ประจำ' : 'ทั่วไป'}
    </span>
  );
}

function EmptyExpenses({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <p className="text-xs text-brand-muted">ยังไม่มีรายจ่ายในเดือนนี้</p>
      <button type="button" onClick={onAdd} className="flex h-9 items-center gap-1 rounded-xl bg-[#E65F2B] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer">
        <Plus className="h-3.5 w-3.5" /> เพิ่มรายจ่าย
      </button>
    </div>
  );
}

// "รับเงินจากงาน": choose a job that still has money owed, then the shared payment dialog.
function JobPicker({ jobs, onPick, onClose }: { jobs: Job[]; onPick: (jobId: string) => void; onClose: () => void }) {
  const [query, setQuery] = React.useState('');
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const q = query.trim().toLowerCase();
  const owed = jobs
    .map(job => ({ job, amount: getOutstandingAmount(job) }))
    .filter(({ job, amount }) => amount > 0 && (!q || job.name.toLowerCase().includes(q) || (job.client || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.job.payDate || '9999').localeCompare(b.job.payDate || '9999'));
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="job-picker-title" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-brand-border bg-brand-white shadow-xl dark:bg-stone-900 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-brand-border px-5 py-4">
          <div>
            <h3 id="job-picker-title" className="text-base font-semibold text-brand-text">รับเงินจากงาน</h3>
            <p className="mt-0.5 text-xs text-brand-muted">เลือกงานที่ยังมียอดค้าง แล้วบันทึกรับเงินในงานนั้น</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input type="text" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่องานหรือลูกค้า" aria-label="ค้นหางาน"
              className="h-10 w-full rounded-[10px] border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text placeholder:text-brand-muted outline-none focus:border-[#E65F2B] dark:bg-neutral-950" />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {owed.length === 0 && <li className="py-8 text-center text-xs text-brand-muted">{q ? 'ไม่พบงานที่ค้นหา' : 'ไม่มีงานที่มียอดค้าง'}</li>}
          {owed.map(({ job, amount }) => (
            <li key={job.id}>
              <button type="button" onClick={() => onPick(job.id)} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-brand-faint cursor-pointer">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-brand-text">{job.name}</span>
                  <span className="block truncate text-[11px] text-brand-muted">{job.client || '—'}{job.payDate ? ` · ครบกำหนด ${shortDate(job.payDate)}` : ''}{job.installments?.length ? ' · แบ่งงวด' : ''}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] font-semibold text-brand-text">{money(amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

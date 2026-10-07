import PageHeader from '../../components/ui/PageHeader';
import { uiInput, uiPrimaryButton, uiSecondaryButton, uiSurface } from '../../components/ui/uiStyles';
import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Download, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react';
import { AppSettings, Expense, FixedExpenseItem, Job } from '../../../../shared/types';
import { currentMonthKeyNow, exportJobsToCSV, formatCurrency, formatMonthKey, safeFormatThaiDate, sumFixedExpenseItems } from '../../utils';
import { Mascot } from '../../components/mascot/Mascot';
import NumberInput from '../../components/ui/NumberInput';
import { DashboardPeriodPicker } from '../dashboard/DashboardPeriodPicker';
import ExpenseDrawer, { EXPENSE_CATEGORIES, categoryLabel } from './ExpenseDrawer';
import { LEGACY_FIXED_NAME, buildExpenseMonth, sortExpenseRows, type ExpenseRow, type ExpenseSort } from './expenseMonth';
import { IncomeExportDialog } from '../report/IncomeExport';
import { ExpenseSlipMark, ExpenseSlips } from '../vault/ExpenseSlips';
import { useVault } from '../vault/VaultProvider';

// รายจ่าย: the one place to record and review spending. Expenses only -- money from jobs lives
// in Jobs / Dashboard. Two user-facing types: ประจำ (linked by name to the fixed monthly lines in
// Settings) and ทั่วไป (everything else, formerly "รายจ่ายผันแปร").

type TypeFilter = 'all' | 'recurring' | 'general';
type MenuItem = { label: string; run: () => void; danger?: boolean };

const SORTS: { key: ExpenseSort; label: string }[] = [
  { key: 'recent', label: 'ล่าสุด' },
  { key: 'oldest', label: 'เก่าสุด' },
  { key: 'amountDesc', label: 'จำนวนเงินสูงสุด' },
  { key: 'amountAsc', label: 'จำนวนเงินต่ำสุด' },
];

const fullDate = (date: string) => safeFormatThaiDate(date, { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = (date: string) => safeFormatThaiDate(date, { day: 'numeric', month: 'short' });

function exportExpensesCSV(rows: ExpenseRow[], monthKey: string): boolean {
  if (rows.length === 0) return false;
  const cell = (value: unknown) => {
    const text = String(value ?? '').replace(/"/g, '""');
    return /[",\n]/.test(text) ? `"${text}"` : text;
  };
  const lines = [
    ['รายการ', 'วันที่', 'ประเภท', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'หมายเหตุ'].join(','),
    ...rows.map(r => [
      cell(r.name), cell(r.date || 'ทุกเดือน (ตั้งไว้)'), cell(r.recurring ? 'ประจำ' : 'ทั่วไป'),
      cell(r.fromSettings ? '' : categoryLabel(r.category)), r.amount, cell(r.note || ''),
    ].join(',')),
  ];
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `รายจ่าย_${monthKey}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

interface IncomeExpenseTabProps {
  jobs: Job[];
  expenses: Expense[];
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onEditExpense: (id: string, updated: Partial<Expense>) => void;
  onDeleteExpense: (id: string) => void;
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
  const { jobs, expenses, settings, triggerAlert, triggerConfirm } = props;
  const vault = useVault();
  const currentMonth = currentMonthKeyNow();
  const [monthKey, setMonthKey] = React.useState(currentMonth);
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all');
  const [category, setCategory] = React.useState('all');
  const [sort, setSort] = React.useState<ExpenseSort>('recent');
  const [search, setSearch] = React.useState('');
  const [drawer, setDrawer] = React.useState<{ expense: Expense | null; preset?: { name: string; amount: number; recurring: boolean } } | null>(null);
  const [detail, setDetail] = React.useState<ExpenseRow | null>(null);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [incomeExportOpen, setIncomeExportOpen] = React.useState(false);
  const [menu, setMenu] = React.useState<{ key: string; top: number; left: number; up: boolean; items: MenuItem[] } | null>(null);
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  const month = React.useMemo(
    () => buildExpenseMonth(jobs, expenses, settings, monthKey, currentMonth),
    [jobs, expenses, settings, monthKey, currentMonth],
  );
  const monthLabel = formatMonthKey(monthKey);
  const query = search.trim().toLowerCase();
  const rows = sortExpenseRows(month.rows.filter(r =>
    (typeFilter === 'all' || (typeFilter === 'recurring' ? r.recurring : !r.recurring))
    && (category === 'all' || (!r.fromSettings && categoryLabel(r.category) === category))
    && (!query || r.name.toLowerCase().includes(query) || (r.note || '').toLowerCase().includes(query))), sort);
  // Only real production categories (plus any historical label still in use this month).
  const categoryOptions = Array.from(new Set([...EXPENSE_CATEGORIES, ...month.rows.filter(r => r.category).map(r => categoryLabel(r.category))]));
  const filtersActive = typeFilter !== 'all' || category !== 'all' || Boolean(query);

  const openAdd = (preset?: { name: string; amount: number; recurring: boolean }) => setDrawer({ expense: null, preset });
  const openEdit = (id: string) => { const expense = expenses.find(e => e.id === id); if (expense) setDrawer({ expense }); };
  const confirmDelete = (row: ExpenseRow) =>
    triggerConfirm('ยืนยันการลบรายจ่าย', `คุณต้องการลบรายการรายจ่าย "${row.name}" จำนวนเงิน ${formatCurrency(row.amount)} ใช่หรือไม่?`, () => props.onDeleteExpense(row.id));
  const rowMenu = (row: ExpenseRow): MenuItem[] => row.fromSettings
    ? [
        { label: 'ดูรายละเอียด', run: () => setDetail(row) },
        { label: 'บันทึกว่าจ่ายแล้วเดือนนี้', run: () => openAdd({ name: row.name, amount: row.amount, recurring: true }) },
        { label: 'จัดการรายจ่ายประจำ', run: () => setManageOpen(true) },
      ]
    : [
        { label: 'ดูรายละเอียด', run: () => setDetail(row) },
        { label: 'แก้ไข', run: () => openEdit(row.id) },
        ...(vault.available ? [{ label: 'แนบสลิป / ใบเสร็จ', run: () => { const expense = expenses.find(e => e.id === row.id); if (expense) vault.openUpload({ kind: 'expense', expense }); } }] : []),
        { label: 'ลบ', danger: true, run: () => confirmDelete(row) },
      ];

  // Entry points from elsewhere: the dashboard's "เพิ่มรายจ่าย", and LINE's saved-expense link.
  React.useEffect(() => {
    if (!props.autoOpenAdd) return;
    openAdd();
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
    setTypeFilter('all'); setCategory('all'); setSearch('');
    setHighlightId(id);
    const scroll = window.setTimeout(() => {
      Array.from(document.querySelectorAll<HTMLElement>(`[data-expense-id="${id}"]`)).find(n => n.offsetParent !== null)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    const clear = window.setTimeout(() => setHighlightId(null), 2600);
    return () => { window.clearTimeout(scroll); window.clearTimeout(clear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scrollToExpenseId]);

  React.useEffect(() => {
    if (!menu && !exportOpen) return;
    const close = () => { setMenu(null); setExportOpen(false); };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest?.('[data-expense-menu]') || target.closest?.('[aria-haspopup="menu"]')) return;
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
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>, row: ExpenseRow) => {
    event.stopPropagation();
    if (menu?.key === row.id) { setMenu(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const up = rect.bottom + 160 > window.innerHeight;
    setMenu({ key: row.id, items: rowMenu(row), up, left: Math.max(8, Math.min(rect.right - 210, window.innerWidth - 218)), top: up ? rect.top - 4 : rect.bottom + 4 });
  };

  const card = uiSurface;
  const select = 'h-10 appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-8 text-xs text-brand-text outline-none transition-colors hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer';
  const menuButton = (row: ExpenseRow) => (
    <button type="button" onClick={(e) => openMenu(e, row)} aria-label={`ตัวเลือกของรายจ่าย ${row.name}`} aria-haspopup="menu" aria-expanded={menu?.key === row.id}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
  const dateText = (row: ExpenseRow, short = false) => row.date ? (short ? shortDate(row.date) : fullDate(row.date)) : 'ทุกเดือน';

  return (
    <div className="page-content space-y-4">
      {/* Header */}
      <PageHeader page="incomeExpense">
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative" data-expense-menu>
            <button type="button" onClick={() => setExportOpen(v => !v)} aria-haspopup="menu" aria-expanded={exportOpen} aria-label="ส่งออก"
              className={uiSecondaryButton}>
              <Download className="h-4 w-4" /><span>ส่งออก</span><ChevronDown className="h-3.5 w-3.5 text-brand-muted" />
            </button>
            {exportOpen && (
              <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-60 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900 sm:left-auto sm:right-0">
                {[
                  { label: `รายรับ ${monthLabel} (Excel)`, run: () => setIncomeExportOpen(true) },
                  { label: `รายจ่าย ${monthLabel} (CSV)`, run: () => { if (!exportExpensesCSV(month.rows, monthKey)) triggerAlert('ไม่พบข้อมูล', 'ยังไม่มีรายจ่ายในเดือนนี้'); } },
                  { label: 'ข้อมูลงานทั้งหมด (CSV)', run: () => { if (!exportJobsToCSV(jobs)) triggerAlert('ไม่พบข้อมูล', 'ยังไม่มีข้อมูลงานสำหรับส่งออก'); else triggerAlert('ส่งออกสำเร็จ', 'ดาวน์โหลดไฟล์ CSV สำหรับ Excel และ Google Sheets แล้ว'); } },
                  { label: 'สำรองข้อมูลทั้งหมด (JSON)', run: props.onExportData },
                ].map(item => (
                  <button key={item.label} type="button" role="menuitem" onClick={() => { setExportOpen(false); item.run(); }}
                    className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">{item.label}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => openAdd()}
            className={uiPrimaryButton}>
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">เพิ่มรายจ่าย</span><span className="sm:hidden">เพิ่ม</span>
          </button>
        </div>
      </PageHeader>
      <IncomeExportDialog open={incomeExportOpen} jobs={jobs} initialMonth={monthKey} onClose={() => setIncomeExportOpen(false)} notify={triggerAlert} />

      <DashboardPeriodPicker monthKey={monthKey} onChange={setMonthKey} />

      {/* Three calm numbers */}
      <section aria-label={`สรุปรายจ่าย ${monthLabel}`} className={`${card} px-4 py-3`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-brand-muted">{monthLabel}</p>
          <button type="button" onClick={() => setManageOpen(true)} className="inline-flex items-center gap-0.5 text-xs text-brand-muted hover:text-[#E65F2B] cursor-pointer">
            จัดการรายจ่ายประจำ <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-brand-border">
          <div className="pr-3"><dt className="text-[11px] text-brand-muted">รายจ่ายทั้งหมด</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text sm:text-xl">{formatCurrency(month.total)}</dd></div>
          <div className="px-3 sm:px-4"><dt className="text-[11px] text-brand-muted">ประจำ</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text sm:text-xl">{formatCurrency(month.recurringTotal)}</dd></div>
          <div className="pl-3 sm:pl-4"><dt className="text-[11px] text-brand-muted">ทั่วไป</dt><dd className="mt-0.5 font-mono text-lg font-semibold text-brand-text sm:text-xl">{formatCurrency(month.generalTotal)}</dd></div>
        </dl>
      </section>

      {/* Type tabs + toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex w-fit items-center gap-1 rounded-xl border border-brand-border bg-brand-white p-0.5" role="tablist" aria-label="ประเภทรายจ่าย">
          {([['all', 'ทั้งหมด'], ['recurring', 'ประจำ'], ['general', 'ทั่วไป']] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={typeFilter === key} onClick={() => setTypeFilter(key)}
              className={`flex h-9 items-center rounded-[10px] px-3.5 text-xs font-medium transition-colors cursor-pointer ${typeFilter === key
                ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'text-brand-muted hover:text-brand-text'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2 sm:flex-nowrap">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารายจ่าย..." aria-label="ค้นหารายจ่าย"
              className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-8 text-[13px] text-brand-text placeholder:text-brand-muted outline-none focus:border-[#E65F2B]" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="ล้างคำค้นหา" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-muted hover:text-brand-text cursor-pointer"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <select aria-label="หมวดหมู่" value={category} onChange={(e) => setCategory(e.target.value)} className={`${select} w-full sm:w-auto sm:max-w-[200px]`}>
              <option value="all">หมวดหมู่: ทั้งหมด</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
          </div>
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <select aria-label="เรียงตาม" value={sort} onChange={(e) => setSort(e.target.value as ExpenseSort)} className={`${select} w-full sm:w-auto`}>
              {SORTS.map(s => <option key={s.key} value={s.key}>เรียงตาม: {s.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
          </div>
        </div>
      </div>

      {/* The list is the page */}
      {rows.length === 0 ? (
        <div className={`${card} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
          {month.rows.length === 0 ? (
            <>
              <Mascot mood="happy" size={56} />
              <p className="mt-1 text-sm font-medium text-brand-text">ยังไม่มีรายจ่ายในเดือนนี้</p>
              <p className="max-w-xs text-xs text-brand-muted">เพิ่มรายจ่ายเพื่อดูว่าค่าใช้จ่ายของคุณไปอยู่ที่ไหนบ้าง</p>
              <button type="button" onClick={() => openAdd()} className="mt-2 flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer">
                <Plus className="h-4 w-4" /> เพิ่มรายจ่าย
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-brand-muted">ไม่มีรายจ่ายที่ตรงกับตัวกรองนี้</p>
              {filtersActive && <button type="button" onClick={() => { setTypeFilter('all'); setCategory('all'); setSearch(''); }} className="h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text hover:bg-brand-faint cursor-pointer">ล้างตัวกรอง</button>}
            </>
          )}
        </div>
      ) : (
        <>
          <div className={`${card} hidden overflow-hidden sm:block`}>
            <table className="w-full table-fixed text-left text-[13px]">
              <thead><tr className="border-b border-brand-border text-xs text-brand-muted">
                <th className="w-[34%] px-4 py-2.5 font-medium">รายการ</th>
                <th className="px-3 py-2.5 font-medium">วันที่</th>
                <th className="px-3 py-2.5 font-medium">ประเภท</th>
                <th className="px-3 py-2.5 font-medium">หมวดหมู่</th>
                <th className="px-3 py-2.5 text-right font-medium">จำนวนเงิน</th>
                <th className="w-12 px-2 py-2.5"><span className="sr-only">การดำเนินการ</span></th>
              </tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} data-expense-id={row.id} onClick={() => setDetail(row)}
                    className={`cursor-pointer border-b border-brand-border transition-colors last:border-b-0 hover:bg-brand-faint/60 ${highlightId === row.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''}`}>
                    <td className="truncate px-4 py-2.5 font-medium text-brand-text">{row.name}{!row.fromSettings && <ExpenseSlipMark expenseId={row.id} />}{row.note && <span className="block truncate text-[11px] font-normal text-brand-muted">{row.note}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-brand-muted">{dateText(row)}</td>
                    <td className="px-3 py-2.5"><TypeBadge recurring={row.recurring} /></td>
                    <td className="truncate px-3 py-2.5 text-brand-muted">{row.fromSettings ? 'ตั้งไว้ทุกเดือน' : categoryLabel(row.category)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold text-brand-text">{formatCurrency(row.amount)}</td>
                    <td className="px-2 py-2.5 text-right">{menuButton(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">
            {rows.map(row => (
              <li key={row.id} data-expense-id={row.id} onClick={() => setDetail(row)}
                className={`${card} cursor-pointer px-4 py-3 ${highlightId === row.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium text-brand-text">{row.name}{!row.fromSettings && <ExpenseSlipMark expenseId={row.id} />}</p>
                  <p className="shrink-0 font-mono text-sm font-semibold text-brand-text">{formatCurrency(row.amount)}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-brand-muted">{dateText(row, true)} · {row.fromSettings ? 'ตั้งไว้ทุกเดือน' : categoryLabel(row.category)}</p>
                <div className="mt-1.5 flex items-center justify-between"><TypeBadge recurring={row.recurring} />{menuButton(row)}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" onClick={() => props.onSwitchTab('report')} className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-[#E65F2B] cursor-pointer">
        ดูรายงานรายจ่าย <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {menu && createPortal(
        <div role="menu" data-expense-menu className="fixed z-[150] w-[210px] rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900"
          style={{ top: menu.top, left: menu.left, transform: menu.up ? 'translateY(-100%)' : undefined }}>
          {menu.items.map(item => (
            <button key={item.label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); item.run(); }}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${item.danger ? 'text-[#C43A3A] hover:bg-[#FFF0F0] dark:text-rose-300 dark:hover:bg-rose-950/40' : 'text-brand-text hover:bg-brand-faint'}`}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {detail && (
        <ExpenseDetail
          row={detail}
          expense={detail.fromSettings ? null : expenses.find(e => e.id === detail.id) || null}
          onClose={() => setDetail(null)}
          onEdit={() => { setDetail(null); openEdit(detail.id); }}
          onDelete={() => { setDetail(null); confirmDelete(detail); }}
          onRecordPaid={() => { setDetail(null); openAdd({ name: detail.name, amount: detail.amount, recurring: true }); }}
          onManage={() => { setDetail(null); setManageOpen(true); }}
        />
      )}
      {manageOpen && <RecurringManager settings={settings} onUpdateSettings={props.onUpdateSettings} onClose={() => setManageOpen(false)} />}
      <ExpenseDrawer
        open={drawer !== null}
        expense={drawer?.expense ?? null}
        preset={drawer?.preset ?? null}
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

function TypeBadge({ recurring }: { recurring: boolean }) {
  return (
    <span className={`inline-flex shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${recurring ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300' : 'bg-brand-faint text-brand-muted'}`}>
      {recurring ? 'ประจำ' : 'ทั่วไป'}
    </span>
  );
}

function useEscape(onClose: () => void) {
  const ref = React.useRef(onClose);
  ref.current = onClose;
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') ref.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

function SidePanel({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEscape(onClose);
  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-[rgba(33,29,26,0.35)]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(33,29,26,0.18)] sm:max-w-[460px] dark:bg-stone-900">
        <div className="flex items-start justify-between gap-3 border-b border-brand-border px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-brand-text">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-brand-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex gap-3 border-t border-brand-border px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function ExpenseDetail({ row, expense, onClose, onEdit, onDelete, onRecordPaid, onManage }: {
  row: ExpenseRow; expense: Expense | null; onClose: () => void; onEdit: () => void; onDelete: () => void; onRecordPaid: () => void; onManage: () => void;
}) {
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-brand-border py-2.5 last:border-b-0">
      <dt className="text-[13px] text-brand-muted">{label}</dt><dd className="text-right text-[13px] text-brand-text">{value}</dd>
    </div>
  );
  return (
    <SidePanel
      title={row.name}
      subtitle={row.fromSettings ? 'รายจ่ายประจำที่ตั้งไว้ ยังไม่ได้บันทึกจ่ายเดือนนี้' : 'รายละเอียดรายจ่าย'}
      onClose={onClose}
      footer={row.fromSettings ? (
        <>
          <button type="button" onClick={onManage} className="h-11 rounded-xl border border-brand-border px-4 text-sm text-brand-text hover:bg-brand-faint cursor-pointer">จัดการรายจ่ายประจำ</button>
          <button type="button" onClick={onRecordPaid} className="h-11 flex-1 rounded-xl bg-[#E65F2B] text-sm font-semibold text-white hover:bg-[#D85723] cursor-pointer">บันทึกว่าจ่ายแล้ว</button>
        </>
      ) : (
        <>
          <button type="button" onClick={onDelete} className="flex h-11 items-center gap-1.5 rounded-xl border border-brand-border px-4 text-sm text-[#C43A3A] hover:bg-[#FFF0F0] cursor-pointer dark:text-rose-300 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /> ลบ</button>
          <button type="button" onClick={onEdit} className="h-11 flex-1 rounded-xl bg-[#E65F2B] text-sm font-semibold text-white hover:bg-[#D85723] cursor-pointer">แก้ไข</button>
        </>
      )}
    >
      <p className="font-mono text-2xl font-semibold text-brand-text">{formatCurrency(row.amount)}</p>
      <dl className="mt-4">
        {field('วันที่', row.date ? fullDate(row.date) : 'ทุกเดือน')}
        {field('ประเภท', <TypeBadge recurring={row.recurring} />)}
        {!row.fromSettings && field('หมวดหมู่', categoryLabel(row.category))}
        {!row.fromSettings && field('หมายเหตุ', row.note || '—')}
      </dl>
      {expense && <ExpenseSlips expense={expense} />}
      {row.fromSettings && (
        <p className="mt-4 rounded-[10px] bg-brand-faint px-3 py-2.5 text-xs leading-relaxed text-brand-muted">
          ยอดนี้นับเป็นรายจ่ายของทุกเดือนอยู่แล้ว เมื่อบันทึกว่าจ่ายแล้ว รายการที่บันทึกจะแทนยอดนี้ในเดือนนั้น ไม่นับซ้ำ
        </p>
      )}
    </SidePanel>
  );
}

// Itemised fixed monthly costs (settings.fixedExpenseItems) -- the same data and update rules as
// the editor in Settings, so both stay in sync.
function RecurringManager({ settings, onUpdateSettings, onClose }: { settings: AppSettings; onUpdateSettings: (s: AppSettings) => void; onClose: () => void }) {
  const items = settings.fixedExpenseItems || [];
  const [newName, setNewName] = React.useState('');
  const [newAmount, setNewAmount] = React.useState('');
  const save = (updated: FixedExpenseItem[]) => onUpdateSettings({ ...settings, fixedExpenseItems: updated, monthlyExpense: sumFixedExpenseItems(updated) });
  // An account that only has the old lump-sum total keeps it as its own editable item.
  const base = (): FixedExpenseItem[] => items.length === 0 && settings.monthlyExpense > 0
    ? [{ id: crypto.randomUUID(), name: LEGACY_FIXED_NAME, amount: settings.monthlyExpense }]
    : items;
  const add = () => {
    const amount = parseFloat(newAmount);
    if (!newName.trim() || Number.isNaN(amount) || amount < 0) return;
    save([...base(), { id: crypto.randomUUID(), name: newName.trim(), amount }]);
    setNewName(''); setNewAmount('');
  };
  const update = (id: string, patch: Partial<FixedExpenseItem>) => save(items.map(item => item.id === id ? { ...item, ...patch } : item));
  const input = uiInput;
  const legacyOnly = items.length === 0 && settings.monthlyExpense > 0;

  return (
    <SidePanel title="จัดการรายจ่ายประจำ" subtitle="ค่าใช้จ่ายที่นับทุกเดือน เช่น ค่าห้อง อินเทอร์เน็ต ค่าสมาชิก" onClose={onClose}>
      <ul className="space-y-2">
        {legacyOnly && (
          <li className="rounded-[10px] border border-brand-border px-3 py-2.5 text-[13px]">
            <div className="flex justify-between"><span className="text-brand-text">{LEGACY_FIXED_NAME}</span><span className="font-mono text-brand-text">{formatCurrency(settings.monthlyExpense)}</span></div>
            <p className="mt-1 text-[11px] text-brand-muted">เพิ่มรายการแรกด้านล่าง ยอดเดิมจะถูกแยกเป็นรายการที่แก้ชื่อได้</p>
          </li>
        )}
        {items.map(item => (
          <li key={item.id} className="flex items-center gap-2">
            <input aria-label="ชื่อรายจ่ายประจำ" defaultValue={item.name} onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== item.name) update(item.id, { name }); }} className={`${input} min-w-0 flex-1`} />
            <div className="relative w-28 shrink-0">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
              <NumberInput aria-label={`ยอดของ ${item.name}`} value={String(item.amount)} onChange={(raw) => update(item.id, { amount: parseFloat(raw) || 0 })} className={`${input} w-full pl-6 font-mono`} />
            </div>
            <button type="button" onClick={() => save(items.filter(i => i.id !== item.id))} aria-label={`เอา ${item.name} ออก`} className="rounded-lg p-2 text-brand-muted hover:bg-[#FFF0F0] hover:text-[#C43A3A] cursor-pointer dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {items.length === 0 && !legacyOnly && <li className="py-4 text-center text-xs text-brand-muted">ยังไม่มีรายจ่ายประจำ</li>}
      </ul>
      <div className="mt-4 flex gap-2 border-t border-brand-border pt-4">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เพิ่มรายการ เช่น ค่าห้อง" aria-label="ชื่อรายจ่ายประจำใหม่" className={`${input} min-w-0 flex-1`} />
        <div className="relative w-28 shrink-0">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
          <NumberInput aria-label="ยอดรายจ่ายประจำใหม่" value={newAmount} onChange={setNewAmount} placeholder="0" className={`${input} w-full pl-6 font-mono`} />
        </div>
        <button type="button" onClick={add} disabled={!newName.trim() || !newAmount} className="h-10 shrink-0 rounded-[10px] bg-[#E65F2B] px-3 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer">เพิ่ม</button>
      </div>
      <div className="mt-4 flex justify-between rounded-[10px] bg-brand-faint px-3 py-2.5 text-[13px]">
        <span className="text-brand-muted">รวมต่อเดือน</span>
        <span className="font-mono font-semibold text-brand-text">{formatCurrency(items.length ? sumFixedExpenseItems(items) : settings.monthlyExpense || 0)}</span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">ยอดเหล่านี้นับเป็นรายจ่ายทุกเดือนโดยอัตโนมัติ ถ้าเดือนไหนบันทึกจ่ายรายการชื่อเดียวกัน ระบบใช้ยอดที่บันทึกแทน ไม่นับซ้ำ</p>
    </SidePanel>
  );
}

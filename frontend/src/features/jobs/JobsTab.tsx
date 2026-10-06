import PageHeader from '../../components/ui/PageHeader';
import { uiPrimaryButton } from '../../components/ui/uiStyles';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Job, StatusOption } from '../../../../shared/types';
import { formatCurrency, calculatePayDate, getRelativeDaysText, safeFormatThaiDate, dateLocale } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import JobFormDrawer from './JobFormDrawer';
import JobPaymentDialog, { type PaymentMode } from './JobPaymentDialog';
import { useQuickUndo } from './useQuickUndo';
import { jobNetReceivable } from '../../../../shared/wht';
import { sortJobs, matchesPeriod, periodMonths, monthKeyOf, type JobSort, type JobPeriod } from './jobSort';
import {
  Search,
  Filter,
  CheckCircle,
  ChevronDown,
  Clock,
  Plus,
  MoreHorizontal,
  CalendarDays,
  Check,
  X
} from 'lucide-react';

// Local (not UTC) YYYY-MM-DD -- avoids the date shifting by a day near midnight in UTC+7,
// same convention already used inline elsewhere in this file's quick-action handlers.
function getLocalDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type JobStage = 'working' | 'awaiting' | 'closed';
type DueTone = 'overdue' | 'today' | 'soon' | 'normal';
type PaymentLabel = 'ยังไม่จ่าย' | 'รับบางส่วน' | 'แบ่งงวด' | 'รับครบแล้ว';
const STAGE_FILTERS: { key: JobStage; label: string }[] = [
  { key: 'working', label: 'กำลังทำ' },
  { key: 'awaiting', label: 'เสร็จแล้ว' },
  { key: 'closed', label: 'ปิดงานแล้ว' },
];
const PAYMENT_FILTERS: PaymentLabel[] = ['ยังไม่จ่าย', 'รับบางส่วน', 'แบ่งงวด', 'รับครบแล้ว'];
const SORT_OPTIONS: { key: JobSort; label: string; waitingLabel?: string }[] = [
  { key: 'recent', label: 'ล่าสุด', waitingLabel: 'ด่วนที่สุด' },
  { key: 'oldest', label: 'เก่าสุด', waitingLabel: 'ครบกำหนดไกลสุด' },
  { key: 'amountDesc', label: 'มูลค่าสูงสุด' },
  { key: 'amountAsc', label: 'มูลค่าต่ำสุด' },
];

interface JobsTabProps {
  jobs: Job[];
  onAddJob: (job: Omit<Job, 'id'>) => void;
  onEditJob: (id: string, updated: Partial<Job>) => void;
  onDeleteJob: (id: string) => void;
  isAddJobOpen: boolean;
  onOpenAddJob: () => void;
  onCloseAddJob: () => void;
  statuses: StatusOption[];
  setStatuses: React.Dispatch<React.SetStateAction<StatusOption[]>>;
  jobTypes: string[];
  setJobTypes: React.Dispatch<React.SetStateAction<string[]>>;
  onRenameJobType: (from: string, to: string) => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  triggerPrompt: (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void,
    onCancel?: () => void
  ) => void;
  // Deep-link that scrolls straight to a job's card in the list and briefly highlights it,
  // instead of opening the edit form -- used by the credit-term board and Dashboard's summary
  // breakdown so clicking a job jumps to the exact "paid in full / partial deposit" quick-action row.
  scrollToJobId?: string | null;
  onScrollToJobHandled?: () => void;
}

export default function JobsTab({
  jobs,
  onAddJob,
  onEditJob,
  onDeleteJob,
  isAddJobOpen,
  onOpenAddJob,
  onCloseAddJob,
  statuses,
  setStatuses,
  jobTypes,
  setJobTypes,
  onRenameJobType,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  scrollToJobId,
  onScrollToJobHandled,
}: JobsTabProps) {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!scrollToJobId) return;
    const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-job-id="${scrollToJobId}"]`))
      .find(node => node.offsetParent !== null);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedJobId(scrollToJobId);
      const timer = setTimeout(() => setHighlightedJobId(null), 2500);
      onScrollToJobHandled?.();
      return () => clearTimeout(timer);
    }
    // Job isn't in the currently filtered/visible list (search/status/type filter excludes it) --
    // nothing to scroll to, still consume the request so it doesn't fire again on next render.
    onScrollToJobHandled?.();
  }, [scrollToJobId, onScrollToJobHandled]);
  // Filter panel values; the panel edits a draft copy and only "ใช้ตัวกรอง" applies it.
  type JobFilters = { stages: JobStage[]; payments: PaymentLabel[]; types: string[] };
  const emptyFilters: JobFilters = { stages: [], payments: [], types: [] };
  const [filters, setFilters] = useState<JobFilters>(emptyFilters);
  const [period, setPeriod] = useState<JobPeriod>(() => ({ kind: 'month', month: monthKeyOf() }));
  const [subTab, setSubTab] = useState<'all' | 'working' | 'waiting_payment' | 'closed'>('all');
  const [sortBy, setSortBy] = useState<JobSort>('recent');
  // One popover for the row's ⋯ menu and for the clickable stage/payment badges.
  type MenuKind = 'actions' | 'stage' | 'payment';
  const [actionMenu, setActionMenu] = useState<{ job: Job; kind: MenuKind; top: number; left: number; up: boolean } | null>(null);
  const actionMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // The ⋯ trigger toggles the menu itself on click; closing here first would reopen it.
      if (actionMenuRef.current?.contains(target) || target.closest?.('[aria-haspopup="menu"]')) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [actionMenu]);
  
  // Editing logic (optional but amazing!)
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // Delivery-date/credit-term prompt shown when marking a WIP job as delivered without a
  // postDate already on it (see the actionMarkPosted button below) -- a lightweight modal
  // instead of routing through the full multi-step edit form, so its own save doesn't fire a
  // second, redundant "แก้ไขงาน" LINE notification on top of this action's own "ดีลงาน" card.
  const [deliveryPromptJob, setDeliveryPromptJob] = useState<Job | null>(null);
  const [deliveryPostDate, setDeliveryPostDate] = useState('');
  const [deliveryCreditTerm, setDeliveryCreditTerm] = useState(0);
  const [deliveryExcludeHolidays, setDeliveryExcludeHolidays] = useState(false);
  const [installmentPaymentJob, setInstallmentPaymentJob] = useState<Job | null>(null);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');
  const [installmentPaidDate, setInstallmentPaidDate] = useState(getLocalDateStr());

  const openInstallmentPayment = (job: Job) => {
    const pendingRows = (job.installments || [])
      .filter((row) => row.status !== 'paid')
      .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
    setInstallmentPaymentJob(job);
    setSelectedInstallmentId(pendingRows[0]?.id || '');
    setInstallmentPaidDate(getLocalDateStr());
  };

  const confirmInstallmentPayment = () => {
    if (!installmentPaymentJob || !selectedInstallmentId || !installmentPaidDate) return;
    const installments = (installmentPaymentJob.installments || []).map((row) =>
      row.id === selectedInstallmentId
        ? { ...row, status: 'paid' as const, paidAt: installmentPaidDate }
        : row
    );
    const received = installments
      .filter((row) => row.status === 'paid')
      .reduce((sum, row) => sum + row.amount, 0);
    const netReceivable = jobNetReceivable(installmentPaymentJob);
    const pendingRows = installments
      .filter((row) => row.status !== 'paid' && row.dueDate)
      .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
    const isPaid = received >= netReceivable || installments.every((row) => row.status === 'paid');
    const paidRow = installments.find(row => row.id === selectedInstallmentId);
    applyQuickChange(installmentPaymentJob, {
      installments,
      received,
      pending: Math.max(0, netReceivable - received),
      paymentStatus: isPaid ? 'paid' : 'partial',
      payDate: isPaid ? installmentPaidDate : (pendingRows[0]?.dueDate || null),
    }, isPaid ? 'รับเงินครบแล้ว' : `รับเงิน${paidRow?.label ? ` ${paidRow.label}` : 'งวดนี้'}`);
    setInstallmentPaymentJob(null);
    setSelectedInstallmentId('');
  };

  // Helper to get status information
  const getStatusDisplay = (statusId: string) => {
    const s = statuses.find(opt => opt.id === statusId);
    if (!s) {
      if (statusId === 'unspecified') return { label: t('jobs.statusUnspecifiedLabel'), behavior: 'pending' as const };
      if (statusId === 'done') return { label: t('jobs.statusDoneLabel'), behavior: 'done' as const };
      if (statusId === 'partial') return { label: t('jobs.statusPartialLabel'), behavior: 'partial' as const };
      return { label: t('jobs.statusPendingLabel'), behavior: 'pending' as const };
    }
    return { label: s.label, behavior: s.behavior };
  };

  // Stages: in progress (not delivered yet) -> awaiting payment (delivered, money outstanding) -> closed.
  const isWorking = (j: Job) => j.isPosted === false;
  const isAwaitingPayment = (j: Job) => j.isPosted !== false && j.pending > 0;
  const isClosed = (j: Job) => j.isPosted !== false && j.pending <= 0;
  const awaitingJobs = jobs.filter(isAwaitingPayment);
  const tabs = [
    { key: 'all' as const, label: 'ทั้งหมด', count: jobs.length },
    { key: 'working' as const, label: 'กำลังทำ', count: jobs.filter(isWorking).length },
    { key: 'waiting_payment' as const, label: 'รอรับเงิน', count: awaitingJobs.length, amount: awaitingJobs.reduce((sum, j) => sum + j.pending, 0) },
    { key: 'closed' as const, label: 'ปิดงานแล้ว', count: jobs.filter(isClosed).length },
  ];

  // Stage and payment as shown on the row badges; the filter panel filters on these same values.
  const stageOf = (j: Job): JobStage => isWorking(j) ? 'working' : isClosed(j) ? 'closed' : 'awaiting';
  const paymentOf = (j: Job): PaymentLabel => {
    const isInstallment = j.status === 'installment' && Boolean(j.installments?.length);
    return isInstallment && j.pending > 0 ? 'แบ่งงวด'
      : j.pending <= 0 && (j.received > 0 || getStatusDisplay(j.status).behavior === 'done') ? 'รับครบแล้ว'
      : j.received > 0 ? 'รับบางส่วน'
      : 'ยังไม่จ่าย';
  };

  // filter -> sort pipeline, recomputed only when an input changes.
  const sortedJobs = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const inTab = (j: Job) => subTab === 'all'
      || (subTab === 'working' && isWorking(j))
      || (subTab === 'waiting_payment' && isAwaitingPayment(j))
      || (subTab === 'closed' && isClosed(j));
    const filtered = jobs.filter(j =>
      inTab(j)
      && matchesPeriod(j, period, subTab)
      && (!query
        || j.name.toLowerCase().includes(query)
        || (j.client || '').toLowerCase().includes(query)
        || (j.type || '').toLowerCase().includes(query))
      && (filters.stages.length === 0 || filters.stages.includes(stageOf(j)))
      && (filters.payments.length === 0 || filters.payments.includes(paymentOf(j)))
      && (filters.types.length === 0 || filters.types.includes(j.type || 'ยังไม่ระบุ')));
    return sortJobs(filtered, sortBy, subTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, statuses, searchTerm, subTab, period, filters, sortBy]);

  const activeFilterCount = filters.stages.length + filters.payments.length + filters.types.length;
  const currentMonth = monthKeyOf();
  const monthOptions = React.useMemo(() => periodMonths(jobs, subTab, currentMonth), [jobs, subTab, currentMonth]);
  const typeOptions = React.useMemo(
    () => Array.from(new Set(jobs.map(j => j.type || 'ยังไม่ระบุ'))).sort((a, b) =>
      a === 'ยังไม่ระบุ' ? 1 : b === 'ยังไม่ระบุ' ? -1 : a.localeCompare(b, 'th')),
    [jobs]
  );

  const clearFilters = () => {
    setSearchTerm('');
    setFilters(emptyFilters);
    setPeriod({ kind: 'all' });
    setSubTab('all');
  };

  // Month / filter panel: a popover under its button on desktop, a bottom sheet on phones.
  const [panel, setPanel] = useState<{ kind: 'month' | 'filter'; top: number; left: number; width: number; sheet: boolean } | null>(null);
  const [draftFilters, setDraftFilters] = useState<JobFilters>(emptyFilters);
  const [draftSort, setDraftSort] = useState<JobSort>('recent');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const openPanel = (event: React.MouseEvent<HTMLButtonElement>, kind: 'month' | 'filter') => {
    if (panel?.kind === kind) { setPanel(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = kind === 'month' ? 280 : 360;
    const anchor = kind === 'month' ? rect.left : rect.right - width;
    setPanel({
      kind,
      width,
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(anchor, window.innerWidth - width - 8)),
      sheet: window.innerWidth < 640,
    });
    if (kind === 'filter') {
      setDraftFilters(filters);
      setDraftSort(sortBy);
    } else {
      setRangeOpen(period.kind === 'range');
      setRangeFrom(period.kind === 'range' ? period.from : '');
      setRangeTo(period.kind === 'range' ? period.to : '');
    }
  };

  React.useEffect(() => {
    if (!panel) return;
    const close = () => setPanel(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [panel]);

  const choosePeriod = (next: JobPeriod) => { setPeriod(next); setPanel(null); };
  const applyRange = () => {
    if (!rangeFrom && !rangeTo) return;
    const [from, to] = rangeFrom && rangeTo && rangeFrom > rangeTo ? [rangeTo, rangeFrom] : [rangeFrom, rangeTo];
    choosePeriod({ kind: 'range', from, to });
  };
  const applyFilters = () => { setFilters(draftFilters); setSortBy(draftSort); setPanel(null); };
  const toggleDraft = <K extends keyof JobFilters>(key: K, value: JobFilters[K][number]) =>
    setDraftFilters(current => {
      const list = current[key] as string[];
      return { ...current, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });

  const monthName = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  };
  const shortDate = (date: string) => safeFormatThaiDate(date, { day: 'numeric', month: 'short', year: '2-digit' });
  const periodLabel = (value: JobPeriod) =>
    value.kind === 'all' ? 'เดือนทั้งหมด'
      : value.kind === 'month' ? (value.month === currentMonth ? 'เดือนนี้' : monthName(value.month))
      : value.from && value.to ? `${shortDate(value.from)} – ${shortDate(value.to)}`
      : value.from ? `ตั้งแต่ ${shortDate(value.from)}` : `ถึง ${shortDate(value.to)}`;
  const sortLabel = (option: (typeof SORT_OPTIONS)[number]) =>
    subTab === 'waiting_payment' && option.waitingLabel ? option.waitingLabel : option.label;

  const openAddJobForm = () => {
    setEditingJob(null);
    onOpenAddJob();
  };

  const closeJobForm = React.useCallback(() => {
    setEditingJob(null);
    onCloseAddJob();
  }, [onCloseAddJob]);

  // Quick status changes (badges, ⋯ menu, delivery/payment prompts) go through here so each one
  // can be taken back from the undo bar: it restores exactly the fields the change touched.
  const { apply: applyQuickChange, bar: undoBar } = useQuickUndo(onEditJob);

  // Net amount the client actually pays (value minus withholding tax).
  const netReceivable = (j: Job) => jobNetReceivable(j);

  // Recomputed on delivery: jobs saved while in progress by older versions can carry pending 0,
  // which would wrongly land an unpaid job in "ปิดงานแล้ว".
  const outstanding = (j: Job) =>
    getStatusDisplay(j.status).behavior === 'done' ? 0 : Math.max(0, netReceivable(j) - (j.received || 0));

  const markPosted = (j: Job) => {
    if (j.postDate) {
      applyQuickChange(j, { isPosted: true, pending: outstanding(j) }, 'ส่งงานแล้ว');
      return;
    }
    setDeliveryPostDate(j.postDate || getLocalDateStr());
    setDeliveryCreditTerm(j.creditTerm || 0);
    setDeliveryExcludeHolidays(j.excludeHolidays || false);
    setDeliveryPromptJob(j);
  };

  const deliveryPaid = Boolean(deliveryPromptJob && getStatusDisplay(deliveryPromptJob.status).behavior === 'done');
  const markWorking = (j: Job) => applyQuickChange(j, { isPosted: false }, 'กลับเป็นกำลังทำ');

  // Recording money needs a date (and an amount for a deposit) -- it moves the dashboard's
  // monthly totals, so it is never changed with a single click.
  const [paymentForm, setPaymentForm] = useState<{ job: Job; mode: PaymentMode } | null>(null);
  const markPaidFull = (j: Job) => setPaymentForm({ job: j, mode: 'full' });
  const promptPartial = (j: Job) => setPaymentForm({ job: j, mode: 'partial' });

  const describeJob = (j: Job) => {
    const statusInfo = getStatusDisplay(j.status);
    const isInstallment = j.status === 'installment' && Boolean(j.installments?.length);
    const stage = stageOf(j);
    const dateStr = stage === 'working' ? j.postDate : (j.payDate || j.postDate);
    let dueText = 'ยังไม่ระบุ';
    let dueTone: DueTone = 'normal';
    if (dateStr) {
      const longDate = safeFormatThaiDate(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
      if (stage === 'closed') {
        dueText = longDate;
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86400000);
        dueText = diff === 0 ? 'วันนี้' : diff === 1 ? 'พรุ่งนี้' : diff < 0 ? `เกินกำหนด ${-diff} วัน` : diff <= 14 ? `อีก ${diff} วัน` : longDate;
        // Delivery deadlines (in progress) and payment due dates (awaiting) both need attention.
        dueTone = diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff <= 3 ? 'soon' : 'normal';
      }
    }
    const payment = paymentOf(j);
    return { statusInfo, isInstallment, stage, dueText, dueTone, payment };
  };

  type MenuAction = { label: string; run: () => void; danger?: boolean };

  // Work stage: forward to delivered, or back to in progress while no money is closed out.
  const stageActions = (j: Job): MenuAction[] => {
    const { stage } = describeJob(j);
    if (stage === 'working') return [{ label: 'ส่งงานแล้ว', run: () => markPosted(j) }];
    if (stage === 'awaiting') return [{ label: 'กลับเป็นกำลังทำ', run: () => markWorking(j) }];
    return [];
  };

  // Payment only moves forward here; taking money back out stays in the edit form.
  const paymentActions = (j: Job): MenuAction[] => {
    const { statusInfo, isInstallment } = describeJob(j);
    const hasPendingInstallment = (j.installments || []).some(row => row.status !== 'paid');
    const actions: MenuAction[] = [];
    if (isInstallment && hasPendingInstallment) actions.push({ label: 'รับเงินงวดถัดไป', run: () => openInstallmentPayment(j) });
    // Clients sometimes pay in full before the work is delivered, so this is offered while in progress too.
    if (statusInfo.behavior !== 'done' && !isInstallment) actions.push({ label: 'รับเงินครบ', run: () => markPaidFull(j) });
    if (statusInfo.behavior === 'pending' && !isInstallment) actions.push({ label: 'รับมัดจำ / บางส่วน', run: () => promptPartial(j) });
    return actions;
  };

  const jobActions = (j: Job): MenuAction[] => {
    return [
      { label: 'ดูและแก้ไขรายละเอียด', run: () => setEditingJob(j) },
      ...stageActions(j),
      ...paymentActions(j),
      { label: 'ลบงาน', run: () => onDeleteJob(j.id), danger: true },
    ];
  };

  const menuActions = (menu: { job: Job; kind: MenuKind }) =>
    menu.kind === 'stage' ? stageActions(menu.job) : menu.kind === 'payment' ? paymentActions(menu.job) : jobActions(menu.job);

  const openActionMenu = (event: React.MouseEvent<HTMLButtonElement>, job: Job, kind: MenuKind = 'actions') => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = kind === 'actions' ? 224 : 200;
    const up = rect.bottom + (kind === 'actions' ? 280 : 140) > window.innerHeight;
    // The ⋯ menu hangs off the button's right edge; badge menus open under the badge itself.
    const anchor = kind === 'actions' ? rect.right - width : rect.left;
    setActionMenu(current => current?.job.id === job.id && current.kind === kind ? null : {
      job,
      kind,
      left: Math.max(8, Math.min(anchor, window.innerWidth - width - 8)),
      top: up ? rect.top - 4 : rect.bottom + 4,
      up,
    });
  };

  // A badge becomes a small dropdown trigger when there is something it can change to.
  const badgeMenu = (j: Job, kind: 'stage' | 'payment', badge: (interactive: boolean) => React.ReactNode, label: string) => {
    const options = kind === 'stage' ? stageActions(j) : paymentActions(j);
    if (options.length === 0) return badge(false);
    const open = actionMenu?.job.id === j.id && actionMenu.kind === kind;
    return (
      <button
        type="button"
        onClick={(event) => openActionMenu(event, j, kind)}
        aria-label={`เปลี่ยน${label}ของงาน ${j.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`group -my-1.5 inline-flex items-center rounded-lg py-1.5 transition-opacity cursor-pointer ${open ? '' : 'hover:opacity-80'}`}
      >
        {badge(true)}
      </button>
    );
  };

  const stageBadge = (stage: string, interactive = false) => (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${
      stage === 'working'
        ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
        : stage === 'awaiting'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'bg-brand-faint text-brand-muted'
    }`}>
      {stage === 'working' ? 'กำลังทำ' : stage === 'awaiting' ? 'เสร็จแล้ว' : 'ปิดงานแล้ว'}
      {interactive && <ChevronDown className="-mr-0.5 h-3 w-3 opacity-70" aria-hidden="true" />}
    </span>
  );

  // One colour per payment state, always. Lateness is shown by the red due date and the row's
  // left accent, so the badge doesn't also turn red (that made "ยังไม่จ่าย" look like two states).
  const paymentBadge = (payment: string, interactive = false) => (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${
      payment === 'รับครบแล้ว'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : payment === 'รับบางส่วน'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : payment === 'แบ่งงวด'
        ? 'bg-brand-faint text-brand-text'
        : 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300'
    }`}>
      {payment}
      {interactive && <ChevronDown className="-mr-0.5 h-3 w-3 opacity-70" aria-hidden="true" />}
    </span>
  );

  const dueClass = (tone: DueTone) =>
    tone === 'overdue' ? 'font-medium text-[#C43A3A] dark:text-rose-300'
      : tone === 'today' ? 'font-medium text-[#C24A16] dark:text-orange-300'
      : tone === 'soon' ? 'font-medium text-amber-700 dark:text-amber-300'
      : 'text-brand-muted';

  // Thin left accent only on rows that need attention; the row itself is never tinted.
  const accentShadow = (tone: DueTone) =>
    tone === 'overdue' ? 'shadow-[inset_3px_0_0_#E95454]' : tone === 'today' || tone === 'soon' ? 'shadow-[inset_3px_0_0_#F08A4B]' : '';

  const typeLabel = (j: Job) => (j.type && j.type !== 'ยังไม่ระบุ' ? j.type : '');

  return (
    <div className="page-content">
      {/* Page header */}
      <PageHeader page="jobs" className="mb-5">
        <button
          type="button"
          onClick={openAddJobForm}
          aria-label="เพิ่มงาน"
          className={uiPrimaryButton}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">เพิ่มงาน</span>
          <span className="sm:hidden">เพิ่ม</span>
        </button>
      </PageHeader>

      {/* Stage tabs */}
      <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1" role="tablist" aria-label="สถานะงาน">
        {tabs.map(tab => {
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.key)}
              className={`flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-4 text-[13px] transition-colors cursor-pointer ${
                active
                  ? 'border-[#F3B08C] bg-[#FFF1E8] font-semibold text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
                  : 'border-brand-border bg-brand-white text-brand-muted hover:text-brand-text'
              }`}
            >
              {tab.label}
              <span className={active ? '' : 'text-brand-text'}>{tab.count}</span>
              {tab.amount !== undefined && tab.amount > 0 && (
                <span className={active ? 'font-normal' : 'text-brand-muted'}>· {formatCurrency(tab.amount)}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search, month, sort and filter: one row on wide screens, search above the controls otherwise */}
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 lg:flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <input
            type="text"
            placeholder="ค้นหาชื่องาน ลูกค้า หรือแบรนด์..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => openPanel(event, 'month')}
            aria-haspopup="dialog"
            aria-expanded={panel?.kind === 'month'}
            aria-label={`ช่วงเวลา: ${periodLabel(period)}`}
            className={`flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-brand-white px-3 text-xs transition-colors hover:bg-brand-faint cursor-pointer sm:flex-none sm:min-w-[150px] ${
              period.kind !== 'all' ? 'border-[#F3B08C] font-medium text-[#C24A16] dark:border-orange-400/40 dark:text-orange-300' : 'border-brand-border text-brand-text'
            }`}
          >
            <CalendarDays className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate text-left">{periodLabel(period)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-brand-muted" />
          </button>
          {/* On phones sorting lives inside the filter sheet. */}
          <div className="relative hidden shrink-0 sm:block">
            <select
              aria-label="เรียงตาม"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as JobSort)}
              className="h-10 appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-8 text-xs text-brand-text outline-none transition-colors hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>เรียงตาม: {sortLabel(option)}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
          </div>
          <button
            type="button"
            onClick={(event) => openPanel(event, 'filter')}
            aria-haspopup="dialog"
            aria-expanded={panel?.kind === 'filter'}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border bg-brand-white px-3 text-xs transition-colors hover:bg-brand-faint cursor-pointer ${
              activeFilterCount > 0 ? 'border-[#F3B08C] font-medium text-[#C24A16] dark:border-orange-400/40 dark:text-orange-300' : 'border-brand-border text-brand-text'
            }`}
          >
            <Filter className="h-4 w-4" />
            ตัวกรอง
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#FFF1E8] px-1.5 text-[11px] leading-[18px] text-[#C24A16] dark:bg-orange-500/15 dark:text-orange-300">{activeFilterCount}</span>
            )}
            {/* Phones sort from inside this sheet, so flag a non-default sort here. */}
            {activeFilterCount === 0 && sortBy !== 'recent' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#E65F2B] sm:hidden" aria-label="เปลี่ยนการเรียงแล้ว" />
            )}
          </button>
        </div>
      </div>

      {/* Jobs list: table from sm up, compact cards on phones */}
      <div>
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-white px-6 py-10 text-center">
          <Mascot mood="happy" size={72} />
          <p className="mt-1 text-sm font-semibold text-brand-text">ยังไม่มีงาน</p>
          <p className="max-w-sm text-xs text-brand-muted">เริ่มเพิ่มงานแรกของคุณ แล้วกระรอกจะช่วยติดตามจนถึงวันที่รับเงินจริง</p>
          <button
            type="button"
            onClick={openAddJobForm}
            className="mt-2 flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> เพิ่มงาน
          </button>
        </div>
      ) : sortedJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-white px-6 py-10 text-center">
          <Mascot mood="thinking" size={56} />
          {period.kind !== 'all' && !searchTerm.trim() && activeFilterCount === 0 ? (
            <>
              <p className="mt-1 text-sm font-medium text-brand-text">
                {period.kind === 'range' ? 'ยังไม่มีงานในช่วงเวลานี้' : 'ยังไม่มีงานในเดือนนี้'}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPeriod({ kind: 'all' })}
                  className="h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
                >
                  ล้างตัวกรองเดือน
                </button>
                <button
                  type="button"
                  onClick={openAddJobForm}
                  className="flex h-9 items-center gap-1 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> เพิ่มงาน
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-brand-text">ไม่พบงานที่ตรงกับตัวกรองนี้</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
              >
                ล้างตัวกรอง
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="hidden overflow-clip rounded-[14px] border border-brand-border bg-brand-white sm:block">
            <table className="w-full table-fixed text-left text-[13px]">
              {/* Sticks while a long list scrolls (desktop shell only; the phone/tablet top bar would cover it). */}
              {/* -top-8 cancels the content panel's lg:pt-8 so the header meets the panel's top edge. */}
              <thead className="lg:sticky lg:-top-8 lg:z-10">
                <tr className="border-b border-brand-border [&>th]:bg-brand-white [&>th]:shadow-[inset_0_-1px_0_var(--color-brand-border)]">
                  <th className="w-[34%] px-4 py-2.5 text-xs font-medium text-brand-muted lg:w-[26%]">งาน / แหล่งรายได้</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-brand-muted lg:table-cell">ลูกค้า / ผู้จ่าย</th>
                  <th className="w-[136px] px-3 py-2.5 text-xs font-medium text-brand-muted">กำหนด</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-brand-muted">สถานะงาน</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-brand-muted lg:table-cell">การชำระ</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-brand-muted">จำนวนเงิน</th>
                  <th className="w-12 px-2 py-2.5"><span className="sr-only">การดำเนินการ</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((j) => {
                  const info = describeJob(j);
                  return (
                    <tr
                      key={j.id}
                      data-job-id={j.id}
                      onClick={() => setEditingJob(j)}
                      className={`cursor-pointer border-b border-brand-border last:border-b-0 transition-colors hover:bg-brand-faint/60 ${
                        highlightedJobId === j.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''
                      }`}
                    >
                      <td className={`px-4 py-3 ${accentShadow(info.dueTone)}`}>
                        <p className="truncate font-medium text-brand-text">{j.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-brand-muted">
                          <span className="lg:hidden">{j.client || '—'}{typeLabel(j) ? ' · ' : ''}</span>
                          {typeLabel(j)}
                        </p>
                      </td>
                      <td className="hidden truncate px-3 py-3 text-brand-muted lg:table-cell">{j.client || '—'}</td>
                      <td className={`truncate whitespace-nowrap px-3 py-3 ${dueClass(info.dueTone)}`} title={info.dueText}>{info.dueText}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {badgeMenu(j, 'stage', i => stageBadge(info.stage, i), 'สถานะงาน')}
                          <span className="lg:hidden">{badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), 'การชำระ')}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">{badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), 'การชำระ')}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold text-brand-text">{formatCurrency(j.value)}</td>
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={(event) => openActionMenu(event, j)}
                          aria-label={`ตัวเลือกของงาน ${j.name}`}
                          aria-haspopup="menu"
                          aria-expanded={actionMenu?.job.id === j.id}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {sortedJobs.map((j) => {
              const info = describeJob(j);
              return (
                <div
                  key={j.id}
                  data-job-id={j.id}
                  onClick={() => setEditingJob(j)}
                  className={`cursor-pointer overflow-hidden rounded-[14px] border border-brand-border bg-brand-white px-4 py-3 ${accentShadow(info.dueTone)} ${
                    highlightedJobId === j.id ? 'bg-[#FFF1E8] dark:bg-orange-500/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-brand-text">{j.name}</p>
                      <p className="mt-0.5 truncate text-xs text-brand-muted">{j.client || '—'}{typeLabel(j) ? ` · ${typeLabel(j)}` : ''}</p>
                    </div>
                    <p className="shrink-0 font-mono text-sm font-semibold text-brand-text">{formatCurrency(j.value)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {badgeMenu(j, 'stage', i => stageBadge(info.stage, i), 'สถานะงาน')}
                      {badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), 'การชำระ')}
                      <span className={`text-[11px] ${dueClass(info.dueTone)}`}>{info.dueText}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => openActionMenu(event, j)}
                      aria-label={`ตัวเลือกของงาน ${j.name}`}
                      aria-haspopup="menu"
                      aria-expanded={actionMenu?.job.id === j.id}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      </div>

      {panel && createPortal(
        <div className="fixed inset-0 z-[150]">
          <div className={`absolute inset-0 ${panel.sheet ? 'bg-black/40' : ''}`} onClick={() => setPanel(null)} />
          <div
            role="dialog"
            aria-label={panel.kind === 'month' ? 'เลือกช่วงเวลา' : 'ตัวกรอง'}
            className={panel.sheet
              ? 'absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-brand-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:bg-stone-900'
              : 'absolute max-h-[70vh] overflow-y-auto rounded-xl border border-brand-border bg-brand-white shadow-lg dark:bg-stone-900'}
            style={panel.sheet ? undefined : { top: panel.top, left: panel.left, width: panel.width }}
          >
            {panel.sheet && (
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[15px] font-semibold text-brand-text">{panel.kind === 'month' ? 'เลือกเดือน' : 'ตัวกรอง'}</p>
                <button type="button" onClick={() => setPanel(null)} aria-label="ปิด" className="rounded-lg p-2 text-brand-muted hover:bg-brand-faint cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {panel.kind === 'month' ? (
              <div className={panel.sheet ? '' : 'p-1.5'}>
                {[
                  { key: 'all', label: 'เดือนทั้งหมด', value: { kind: 'all' } as JobPeriod },
                  { key: currentMonth, label: 'เดือนนี้', secondary: monthName(currentMonth), value: { kind: 'month', month: currentMonth } as JobPeriod },
                  ...monthOptions.map(month => ({ key: month, label: monthName(month), value: { kind: 'month', month } as JobPeriod })),
                ].map(option => {
                  const active = option.value.kind === 'all'
                    ? period.kind === 'all'
                    : period.kind === 'month' && option.value.kind === 'month' && period.month === option.value.month;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => choosePeriod(option.value)}
                      aria-pressed={active}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] transition-colors hover:bg-brand-faint cursor-pointer ${panel.sheet ? 'min-h-11' : 'min-h-9'} ${active ? 'font-medium text-[#C24A16] dark:text-orange-300' : 'text-brand-text'}`}
                    >
                      <span className="min-w-0 flex-1">
                        {option.label}
                        {'secondary' in option && <span className="ml-1.5 text-xs font-normal text-brand-muted">{option.secondary}</span>}
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  );
                })}
                <div className="my-1.5 border-t border-brand-border" />
                <button
                  type="button"
                  onClick={() => setRangeOpen(v => !v)}
                  aria-expanded={rangeOpen}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 text-left text-[13px] transition-colors hover:bg-brand-faint cursor-pointer ${panel.sheet ? 'min-h-11' : 'min-h-9'} ${period.kind === 'range' ? 'font-medium text-[#C24A16] dark:text-orange-300' : 'text-brand-text'}`}
                >
                  <span className="min-w-0 flex-1">เลือกช่วงเวลา</span>
                  {period.kind === 'range' ? <Check className="h-4 w-4 shrink-0" /> : <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-brand-muted transition-transform ${rangeOpen ? 'rotate-180' : ''}`} />}
                </button>
                {rangeOpen && (
                  <div className="space-y-2.5 px-3 pb-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs text-brand-muted">
                        จาก
                        <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-brand-border bg-brand-white px-2 text-xs text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950" />
                      </label>
                      <label className="block text-xs text-brand-muted">
                        ถึง
                        <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-brand-border bg-brand-white px-2 text-xs text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950" />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={applyRange}
                      disabled={!rangeFrom && !rangeTo}
                      className="h-10 w-full rounded-lg bg-[#E65F2B] text-xs font-semibold text-white transition-colors hover:bg-[#D85723] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                      ใช้ช่วงเวลานี้
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={panel.sheet ? 'space-y-4 pt-1' : 'space-y-4 p-4'}>
                {[
                  // Sorting sits in this sheet on phones, where there is no room for its own dropdown.
                  ...(panel.sheet ? [{
                    title: 'เรียงตาม',
                    options: SORT_OPTIONS.map(option => ({ key: option.key, label: sortLabel(option), active: draftSort === option.key, toggle: () => setDraftSort(option.key) })),
                  }] : []),
                  {
                    title: 'สถานะงาน',
                    options: STAGE_FILTERS.map(option => ({ key: option.key, label: option.label, active: draftFilters.stages.includes(option.key), toggle: () => toggleDraft('stages', option.key) })),
                  },
                  {
                    title: 'การชำระ',
                    options: PAYMENT_FILTERS.map(label => ({ key: label, label, active: draftFilters.payments.includes(label), toggle: () => toggleDraft('payments', label) })),
                  },
                  {
                    title: 'ประเภทงาน',
                    options: typeOptions.map(type => ({ key: type, label: type, active: draftFilters.types.includes(type), toggle: () => toggleDraft('types', type) })),
                  },
                ].map(group => (
                  <fieldset key={group.title}>
                    <legend className="mb-2 text-xs font-medium text-brand-muted">{group.title}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {group.options.map(option => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={option.toggle}
                          aria-pressed={option.active}
                          className={`h-8 max-w-full truncate rounded-full border px-3 text-xs transition-colors cursor-pointer ${option.active
                            ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
                            : 'border-brand-border text-brand-text hover:bg-brand-faint'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <div className="flex gap-2 border-t border-brand-border pt-3">
                  <button
                    type="button"
                    onClick={() => setDraftFilters(emptyFilters)}
                    className="h-10 flex-1 rounded-xl border border-brand-border text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
                  >
                    ล้างตัวกรอง
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="h-10 flex-[2] rounded-xl bg-[#E65F2B] text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
                  >
                    ใช้ตัวกรอง
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {actionMenu && createPortal(
        <div
          ref={actionMenuRef}
          role="menu"
          aria-label={actionMenu.kind === 'stage' ? `เปลี่ยนสถานะงาน ${actionMenu.job.name}` : actionMenu.kind === 'payment' ? `บันทึกการชำระ ${actionMenu.job.name}` : `ตัวเลือกของงาน ${actionMenu.job.name}`}
          className={`fixed z-[150] ${actionMenu.kind === 'actions' ? 'w-56' : 'w-[200px]'} rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900`}
          style={{ top: actionMenu.top, left: actionMenu.left, transform: actionMenu.up ? 'translateY(-100%)' : undefined }}
        >
          {actionMenu.kind !== 'actions' && (
            <p className="px-3 pb-1 pt-1.5 text-[11px] text-brand-muted">{actionMenu.kind === 'stage' ? 'เปลี่ยนสถานะงานเป็น' : 'บันทึกการรับเงิน'}</p>
          )}
          {menuActions(actionMenu).map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => { setActionMenu(null); action.run(); }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                action.danger ? 'text-[#C43A3A] hover:bg-[#FFF0F0] dark:text-rose-300 dark:hover:bg-rose-950/40' : 'text-brand-text hover:bg-brand-faint'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {installmentPaymentJob && (
            <div className="fixed inset-0 z-210">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setInstallmentPaymentJob(null)}
                className="absolute inset-0 bg-black/45 backdrop-blur-xs"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="absolute bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 p-4"
              >
                <div className="max-h-[85vh] space-y-4 overflow-y-auto rounded-3xl bg-brand-white p-5 shadow-2xl dark:bg-stone-900">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#E65F2B]">รับเงินเป็นงวด</p>
                      <h3 className="mt-1 text-lg font-black text-brand-text dark:text-white">{installmentPaymentJob.name}</h3>
                      <p className="mt-1 text-[11px] font-semibold text-brand-muted">เลือกเฉพาะงวดที่ได้รับเงินแล้ว ระบบจะคำนวณยอดค้างและงวดถัดไปให้</p>
                    </div>
                    <button type="button" onClick={() => setInstallmentPaymentJob(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-faint text-xl text-brand-muted">×</button>
                  </div>

                  <div className="space-y-2">
                    {(installmentPaymentJob.installments || []).filter((row) => row.status !== 'paid').map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedInstallmentId(row.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors ${selectedInstallmentId === row.id ? 'border-[#E65F2B] bg-orange-50/70' : 'border-brand-border/60 bg-brand-faint/50'}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-brand-text">{row.label}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-brand-muted">{row.dueDate ? `ครบกำหนด ${safeFormatThaiDate(row.dueDate)}` : 'ยังไม่ระบุวันครบกำหนด'}</p>
                        </div>
                        <p className="shrink-0 font-mono text-sm font-black text-[#E65F2B]">{formatCurrency(row.amount)}</p>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-brand-muted">วันที่รับเงินจริง</label>
                    <input type="date" value={installmentPaidDate} onChange={(event) => setInstallmentPaidDate(event.target.value)} className="w-full rounded-xl border border-brand-border/60 bg-brand-faint p-3 text-sm font-bold outline-none focus:border-[#E65F2B]" />
                  </div>

                  <button
                    type="button"
                    onClick={confirmInstallmentPayment}
                    disabled={!selectedInstallmentId || !installmentPaidDate}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E65F2B] py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle className="h-4 w-4" /> ยืนยันรับเงินงวดนี้
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <JobPaymentDialog
        job={paymentForm?.job ?? null}
        initialMode={paymentForm?.mode ?? 'full'}
        allowPartial={Boolean(paymentForm && getStatusDisplay(paymentForm.job.status).behavior === 'pending' && !describeJob(paymentForm.job).isInstallment)}
        allowFull={Boolean(paymentForm && getStatusDisplay(paymentForm.job.status).behavior !== 'done')}
        onClose={() => setPaymentForm(null)}
        onConfirm={(updated, message) => {
          if (paymentForm) applyQuickChange(paymentForm.job, updated, message);
          setPaymentForm(null);
        }}
      />

      {undoBar}

      <JobFormDrawer
        open={isAddJobOpen || Boolean(editingJob)}
        job={editingJob}
        statuses={statuses}
        jobTypes={jobTypes}
        setJobTypes={setJobTypes}
        jobs={jobs}
        onRenameJobType={onRenameJobType}
        onClose={closeJobForm}
        onAdd={onAddJob}
        onEdit={onEditJob}
      />

      {/* Delivery-date / credit-term prompt for marking a WIP job as delivered when it has no
          postDate yet -- same date field + credit-term picker markup as the edit form's own
          "posted" step, driven by separate delivery* state so its Save doesn't route through
          the full edit form (and its own second LINE notification). */}
      {createPortal(<AnimatePresence>
        {deliveryPromptJob && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-brand-border/40 dark:border-neutral-800"
            >
              <h3 className="text-sm font-black text-brand-text dark:text-white">{t('jobs.deliveryPromptTitle')}</h3>

              {/* วันส่งมอบงาน */}
              <div className="space-y-2 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 dark:bg-indigo-500/5 dark:border-indigo-500/15 shadow-2xs overflow-hidden">
                <label className="text-indigo-900 dark:text-indigo-300 font-extrabold block text-[11px] uppercase tracking-wider">{t('jobs.deliveryDateLabel')}</label>
                <input
                  type="date"
                  value={deliveryPostDate}
                  onChange={(e) => setDeliveryPostDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch (err) {
                      console.log(err);
                    }
                  }}
                  className="w-full min-w-0 max-w-full bg-brand-white dark:bg-stone-900 text-xs text-brand-text dark:text-white rounded-xl p-3 outline-none border border-brand-border/40 focus:border-indigo-500 font-semibold cursor-pointer transition-all"
                />

                {!deliveryPaid && deliveryPostDate && deliveryCreditTerm > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-brand-white dark:bg-stone-850 border border-brand-border/50 text-[11px] space-y-2 shadow-2xs">
                    <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                      <span className="font-bold">{t('jobs.dueDateLabel')}</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                        {safeFormatThaiDate(calculatePayDate(deliveryPostDate, deliveryCreditTerm, deliveryExcludeHolidays))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                      <span className="font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-500" /> {t('jobs.timeUntilDueColon')}
                      </span>
                      {(() => {
                        const payDateVal = calculatePayDate(deliveryPostDate, deliveryCreditTerm, deliveryExcludeHolidays);
                        const rel = getRelativeDaysText(payDateVal);
                        return (
                          <span className={`font-black px-2 py-0.5 rounded text-[10px] border ${
                            rel.isOverdue
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                          }`}>
                            {rel.text}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Credit Term Selection -- not needed once the job is already paid in full */}
              {deliveryPaid ? (
                <p className="rounded-xl bg-[#E9F7F0] px-4 py-3 text-xs text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]">งานนี้รับเงินครบแล้ว ส่งงานแล้วจะย้ายไปปิดงานทันที</p>
              ) : (
              <div className="space-y-2.5 p-4 rounded-2xl bg-[#E65F2B]/5 border border-[#E65F2B]/20 dark:bg-[#E65F2B]/5 dark:border-[#E65F2B]/15 shadow-2xs">
                <div className="flex items-center justify-between">
                  <label className="text-[#E65F2B] dark:text-[#FFA473] font-extrabold block text-[11px] uppercase tracking-wider">
                    {t('jobs.creditTermLabel')}
                  </label>
                  <span className="text-[10px] text-[#E65F2B] dark:text-[#FFA473] font-bold">
                    {t('jobs.autoCalculated')}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { value: 0, label: t('jobs.creditNow') },
                    { value: 30, label: t('jobs.creditDaysOpt', { n: 30 }) },
                    { value: 45, label: t('jobs.creditDaysOpt', { n: 45 }) },
                    { value: 60, label: t('jobs.creditDaysOpt', { n: 60 }) },
                    { value: 90, label: t('jobs.creditDaysOpt', { n: 90 }) },
                  ].map((opt) => {
                    const isSelected = deliveryCreditTerm === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDeliveryCreditTerm(opt.value)}
                        className={`py-2.5 px-0.5 rounded-xl border text-center text-[10px] font-black transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#E65F2B] border-[#E65F2B] text-white shadow-xs scale-102'
                            : 'bg-brand-white dark:bg-stone-800 border-brand-border/60 text-brand-text dark:text-neutral-300 hover:border-brand-text/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {deliveryCreditTerm > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#E65F2B]/10 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={deliveryExcludeHolidays}
                        onChange={(e) => setDeliveryExcludeHolidays(e.target.checked)}
                        className="w-4 h-4 rounded border-[#E65F2B]/30 text-[#E65F2B] focus:ring-[#E65F2B] accent-[#E65F2B] cursor-pointer"
                      />
                      <span className="text-[10px] font-bold text-[#E65F2B] dark:text-[#FFA473]">
                        {t('jobs.excludeHolidaysLabel')}
                      </span>
                    </label>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#E65F2B]/10 text-[#E65F2B] dark:text-[#FFA473] font-bold">
                      {t('jobs.businessDaysOnly')}
                    </span>
                  </div>
                )}
              </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDeliveryPromptJob(null)}
                  className="flex-1 py-3 bg-brand-faint dark:bg-stone-800 hover:bg-brand-border/40 text-brand-text dark:text-neutral-200 border border-brand-border/60 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  {t('jobs.deliveryPromptCancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const job = deliveryPromptJob;
                    if (!job || !deliveryPostDate) return;
                    applyQuickChange(job, {
                      isPosted: true,
                      pending: outstanding(job),
                      postDate: deliveryPostDate,
                      creditTerm: deliveryCreditTerm,
                      excludeHolidays: deliveryExcludeHolidays,
                      // A job paid in full before delivery keeps its real payment date.
                      payDate: getStatusDisplay(job.status).behavior === 'done' && job.payDate
                        ? job.payDate
                        : calculatePayDate(deliveryPostDate, deliveryCreditTerm, deliveryExcludeHolidays)
                    }, 'ส่งงานแล้ว');
                    setDeliveryPromptJob(null);
                  }}
                  disabled={!deliveryPostDate}
                  className={`flex-2 py-3 text-white rounded-xl text-xs font-black transition-all text-center shadow-sm ${
                    deliveryPostDate
                      ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                      : 'bg-indigo-600/50 cursor-not-allowed opacity-75'
                  }`}
                >
                  {t('jobs.deliveryPromptSave')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}

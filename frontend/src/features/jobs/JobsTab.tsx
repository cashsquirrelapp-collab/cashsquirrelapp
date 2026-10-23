import PageHeader from '../../components/ui/PageHeader';
import { uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { IncomeExportDialog } from '../report/IncomeExport';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Job, StatusOption } from '../../../../shared/types';
import { isPhaseOneFeatureAvailable } from '../../../../shared/featureAvailability';
import { installmentLabel, formatCurrency, calculatePayDate, safeFormatThaiDate, dateLocale, exportJobsToCSV } from '../../utils';
import { motion, AnimatePresence, useTransform } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import JobFormDrawer from './JobFormDrawer';
import { KsIcon } from '../mobile/icons';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { useFitFigures } from '../mobile/useFitFigures';
import { useCollapsingCard, useScrollTop } from '../mobile/useCollapsingCard';
import JobPaymentDialog, { type PaymentMode } from './JobPaymentDialog';
import { JobDeliveryDialog } from './JobDeliveryDialog';
import { Wht50Chip } from '../vault/VaultProvider';
import { useQuickUndo } from './useQuickUndo';
import { jobNetReceivable, jobWhtAmount } from '../../../../shared/wht';
import { sortJobs, matchesPeriod, periodMonths, monthKeyOf, type JobSort, type JobPeriod } from './jobSort';
import {
  Search,
  Filter,
  CheckCircle,
  ChevronDown,
  Download,
  Plus,
  MoreHorizontal,
  Banknote,
  CalendarDays,
  Check,
  FileSpreadsheet,
  X
} from 'lucide-react';

import { tr, T } from '../../i18n/tr';
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
  { key: 'working', label: T("กำลังทำ") },
  { key: 'awaiting', label: T("เสร็จแล้ว") },
  { key: 'closed', label: T("ปิดงานแล้ว") },
];
const PAYMENT_FILTERS: PaymentLabel[] = ['ยังไม่จ่าย', 'รับบางส่วน', 'แบ่งงวด', 'รับครบแล้ว'];
const SORT_OPTIONS: { key: JobSort; label: string; waitingLabel?: string }[] = [
  { key: 'recent', label: T("ล่าสุด"), waitingLabel: T("ด่วนที่สุด") },
  { key: 'oldest', label: T("เก่าสุด"), waitingLabel: T("ครบกำหนดไกลสุด") },
  { key: 'amountDesc', label: T("มูลค่าสูงสุด") },
  { key: 'amountAsc', label: T("มูลค่าต่ำสุด") },
];

interface JobsTabProps {
  jobs: Job[];
  fullFeatureAccess?: boolean;
  /** May return the new job's id, so the row can be lit up once it is saved. */
  onAddJob: (job: Omit<Job, 'id'>) => string | void;
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
  /** Open this job's edit form on arrival (e.g. "แก้ไข" on a job opened from the timeline). */
  editJobId?: string | null;
  onEditJobHandled?: () => void;
  /** Opens the Excel import (computer and iPad header only). */
  onOpenImport?: () => void;
}

export default function JobsTab({
  jobs,
  fullFeatureAccess = false,
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
  editJobId,
  onEditJobHandled,
  onOpenImport,
}: JobsTabProps) {
  const { t } = useLanguage();
  const mobile = useMobileLayout();
  const showWht50 = isPhaseOneFeatureAvailable('wht50', fullFeatureAccess);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);

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
    // A scroll that is still settling when the menu opens (momentum, the summary card snapping) must
    // not close it straight away; a real scroll afterwards still does.
    const openedAt = performance.now();
    const onScroll = () => { if (performance.now() - openedAt > 450) close(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [actionMenu]);
  
  // Editing logic (optional but amazing!)
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  React.useEffect(() => {
    if (!editJobId) return;
    const job = jobs.find(j => j.id === editJobId);
    if (job) setEditingJob(job);
    onEditJobHandled?.();
  }, [editJobId, jobs, onEditJobHandled]);

  // Delivery-date/credit-term prompt shown when marking a WIP job as delivered without a
  // postDate already on it (see the actionMarkPosted button below) -- a lightweight modal
  // instead of routing through the full multi-step edit form, so its own save doesn't fire a
  // second, redundant "แก้ไขงาน" LINE notification on top of this action's own "ดีลงาน" card.
  const [deliveryPromptJob, setDeliveryPromptJob] = useState<Job | null>(null);
  // ส่งออก: income as Excel (month or year) or every job as CSV.
  const [exportOpen, setExportOpen] = useState(false);
  const [incomeExportOpen, setIncomeExportOpen] = useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!exportOpen) return;
    const onDown = (e: MouseEvent) => { if (!exportMenuRef.current?.contains(e.target as Node)) setExportOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [exportOpen]);
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
    }, isPaid ? tr("รับเงินครบแล้ว") : tr("รับเงิน{0}", paidRow?.label ? ` ${installmentLabel(paidRow.label)}` : tr("งวดนี้")));
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
    return { label: tr(s.label), behavior: s.behavior };
  };

  // Stages: in progress (not delivered yet) -> awaiting payment (delivered, money outstanding) -> closed.
  const isWorking = (j: Job) => j.isPosted === false;
  const isAwaitingPayment = (j: Job) => j.isPosted !== false && j.pending > 0;
  const isClosed = (j: Job) => j.isPosted !== false && j.pending <= 0;
  const awaitingJobs = jobs.filter(isAwaitingPayment);
  const tabs = [
    { key: 'all' as const, label: tr("ทั้งหมด"), count: jobs.length },
    { key: 'working' as const, label: tr("กำลังทำ"), count: jobs.filter(isWorking).length },
    { key: 'waiting_payment' as const, label: tr("รอรับเงิน"), count: awaitingJobs.length, amount: awaitingJobs.reduce((sum, j) => sum + j.pending, 0) },
    { key: 'closed' as const, label: tr("ปิดงานแล้ว"), count: jobs.filter(isClosed).length },
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

  // The search box and the filter panel, without the stage tab or the period.
  const matchesSearchAndFilters = (j: Job, query: string) =>
    (!query
      || j.name.toLowerCase().includes(query)
      || (j.client || '').toLowerCase().includes(query)
      || (j.type || '').toLowerCase().includes(query)
      || (mobile && (j.note || '').toLowerCase().includes(query)))
    && (filters.stages.length === 0 || filters.stages.includes(stageOf(j)))
    && (filters.payments.length === 0 || filters.payments.includes(paymentOf(j)))
    && (filters.types.length === 0 || filters.types.includes(j.type || 'ยังไม่ระบุ'));

  // filter -> sort pipeline, recomputed only when an input changes.
  const sortedJobs = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const inTab = (j: Job) => subTab === 'all'
      || (subTab === 'working' && isWorking(j))
      || (subTab === 'waiting_payment' && isAwaitingPayment(j))
      || (subTab === 'closed' && isClosed(j));
    const filtered = jobs.filter(j => inTab(j) && matchesPeriod(j, period, subTab) && matchesSearchAndFilters(j, query));
    return sortJobs(filtered, sortBy, subTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, statuses, searchTerm, subTab, period, filters, sortBy, mobile]);

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

  // Arriving for one job (from the calendar, dashboard, timeline…): make sure it is in the list --
  // whatever month / tab / search was on -- then scroll to it and spotlight it so it stands out.
  const [spotlightTarget, setSpotlightTarget] = useState<string | null>(null);
  // A row just saved from the form is usually on screen already: only scroll if it is not.
  const spotlightNearest = React.useRef(false);
  const spotlightSaved = (id: string) => { spotlightNearest.current = true; setSpotlightTarget(id); };
  React.useEffect(() => {
    if (!scrollToJobId) return;
    if (jobs.some(j => j.id === scrollToJobId) && !sortedJobs.some(j => j.id === scrollToJobId)) clearFilters();
    setSpotlightTarget(scrollToJobId);
    onScrollToJobHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToJobId]);
  React.useEffect(() => {
    if (!spotlightTarget) return;
    let frame = 0; let tries = 0;
    const find = () => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(`[data-job-id="${CSS.escape(spotlightTarget)}"]`)).find(node => node.offsetParent !== null);
      if (!el) { if (++tries < 40) frame = requestAnimationFrame(find); else setSpotlightTarget(null); return; }
      el.scrollIntoView({ behavior: 'smooth', block: spotlightNearest.current ? 'nearest' : 'center' });
      spotlightNearest.current = false;
      setHighlightedJobId(spotlightTarget);
      setSpotlightTarget(null);
    };
    frame = requestAnimationFrame(find);
    return () => { cancelAnimationFrame(frame); };
  }, [spotlightTarget, sortedJobs]);
  // The spotlight ends after a while, or as soon as the user taps anywhere.
  React.useEffect(() => {
    if (!highlightedJobId) return;
    const timer = window.setTimeout(() => setHighlightedJobId(null), 7000); // 3 slow blinks, then lit a moment
    const clear = () => setHighlightedJobId(null);
    const arm = window.setTimeout(() => document.addEventListener('pointerdown', clear, { once: true }), 400);
    return () => { window.clearTimeout(timer); window.clearTimeout(arm); document.removeEventListener('pointerdown', clear); };
  }, [highlightedJobId]);

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
    value.kind === 'all' ? tr("เดือนทั้งหมด")
      : value.kind === 'month' ? (value.month === currentMonth ? tr("เดือนนี้") : monthName(value.month))
      : value.from && value.to ? `${shortDate(value.from)} – ${shortDate(value.to)}`
      : value.from ? tr("ตั้งแต่ {0}", shortDate(value.from)) : tr("ถึง {0}", shortDate(value.to));
  const sortLabel = (option: (typeof SORT_OPTIONS)[number]) =>
    tr(subTab === 'waiting_payment' && option.waitingLabel ? option.waitingLabel : option.label);

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
  // The amount a job brings in: after withholding tax when there is some, with the gross and the
  // rate underneath so the deduction is still visible.
  const amountCell = (j: Job, align: 'right' | 'left' = 'right') => {
    const wht = jobWhtAmount(j);
    return wht > 0 ? (
      <span className={`inline-flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
        <span>{formatCurrency(jobNetReceivable(j))}</span>
        <span className="font-sans text-[10.5px] font-normal text-brand-muted">{tr("หัก")}{' '}{j.whtRate}{tr("% จาก {0}", formatCurrency(j.value))}</span>
      </span>
    ) : formatCurrency(j.value);
  };

  // Recomputed on delivery: jobs saved while in progress by older versions can carry pending 0,
  // which would wrongly land an unpaid job in "ปิดงานแล้ว".
  const outstanding = (j: Job) =>
    getStatusDisplay(j.status).behavior === 'done' ? 0 : Math.max(0, netReceivable(j) - (j.received || 0));

  const markPosted = (j: Job) => {
    if (j.postDate) {
      applyQuickChange(j, { isPosted: true, pending: outstanding(j) }, tr("ส่งงานแล้ว"));
      return;
    }
    setDeliveryPromptJob(j);
  };

  const deliveryPaid = Boolean(deliveryPromptJob && getStatusDisplay(deliveryPromptJob.status).behavior === 'done');
  const markWorking = (j: Job) => applyQuickChange(j, { isPosted: false }, tr("กลับเป็นกำลังทำ"));

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
    let dueText = tr("ยังไม่ระบุ");
    let dueTone: DueTone = 'normal';
    if (dateStr) {
      const longDate = safeFormatThaiDate(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
      if (stage === 'closed') {
        dueText = longDate;
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86400000);
        dueText = diff === 0 ? tr("วันนี้") : diff === 1 ? tr("พรุ่งนี้") : diff < 0 ? tr("เกินกำหนด {0} วัน", -diff) : diff <= 14 ? tr("อีก {0} วัน", diff) : longDate;
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
    if (stage === 'working') return [{ label: tr("ส่งงานแล้ว"), run: () => markPosted(j) }];
    if (stage === 'awaiting') return [{ label: tr("กลับเป็นกำลังทำ"), run: () => markWorking(j) }];
    return [];
  };

  // Payment only moves forward here; taking money back out stays in the edit form.
  const paymentActions = (j: Job): MenuAction[] => {
    const { statusInfo, isInstallment } = describeJob(j);
    const hasPendingInstallment = (j.installments || []).some(row => row.status !== 'paid');
    const actions: MenuAction[] = [];
    if (isInstallment && hasPendingInstallment) actions.push({ label: tr("รับเงินงวดถัดไป"), run: () => openInstallmentPayment(j) });
    // Clients sometimes pay in full before the work is delivered, so this is offered while in progress too.
    if (statusInfo.behavior !== 'done' && !isInstallment) actions.push({ label: tr("รับเงินครบ"), run: () => markPaidFull(j) });
    if (statusInfo.behavior === 'pending' && !isInstallment) actions.push({ label: tr("รับมัดจำ / บางส่วน"), run: () => promptPartial(j) });
    return actions;
  };

  const jobActions = (j: Job): MenuAction[] => {
    return [
      { label: tr("ดูและแก้ไขรายละเอียด"), run: () => setEditingJob(j) },
      ...stageActions(j),
      ...paymentActions(j),
      { label: tr("ลบงาน"), run: () => onDeleteJob(j.id), danger: true },
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
        aria-label={tr("เปลี่ยน{0}ของงาน {1}", label, j.name)}
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
      {stage === 'working' ? tr("กำลังทำ") : stage === 'awaiting' ? tr("เสร็จแล้ว") : tr("ปิดงานแล้ว")}
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
      {tr(payment)}
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

  const typeLabel = (j: Job) => (j.type && j.type !== 'ยังไม่ระบุ' ? tr(j.type) : '');

  const exportItems = [
    { label: tr("รายรับรายเดือน / ทั้งปี (Excel)"), run: () => setIncomeExportOpen(true) },
    { label: tr("ข้อมูลงานทั้งหมด (CSV)"), run: () => { if (!exportJobsToCSV(jobs)) triggerAlert(tr("ไม่พบข้อมูล"), tr("ยังไม่มีข้อมูลงานสำหรับส่งออก")); } },
  ];

  // Phones: the terracotta summary at the top of งาน (owner, 2026-10-20: layered like the overview).
  // Each stage adds up exactly the jobs its tab lists for the chosen period, search and filters, with
  // the amounts their cards show: still to receive (net) while working or awaiting payment, received
  // once closed. Tapping a stage opens its tab.
  const STAGE_TAB = { working: 'working', awaiting: 'waiting_payment', closed: 'closed' } as const;
  const mobileSummary = React.useMemo(() => {
    const sum = { working: 0, awaiting: 0, closed: 0, overdue: 0 };
    if (!mobile) return sum;
    const query = searchTerm.trim().toLowerCase();
    for (const j of jobs) {
      const stage = stageOf(j);
      if (!matchesPeriod(j, period, STAGE_TAB[stage]) || !matchesSearchAndFilters(j, query)) continue;
      if (stage === 'closed') { sum.closed += j.received || netReceivable(j); continue; }
      sum[stage] += outstanding(j);
      if (describeJob(j).dueTone === 'overdue') sum.overdue += 1;
    }
    return sum;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, statuses, searchTerm, period, filters, mobile]);
  const summaryRef = React.useRef<HTMLDivElement>(null);
  useFitFigures(summaryRef, [mobile, mobileSummary.working, mobileSummary.awaiting, mobileSummary.closed, mobileSummary.overdue].join('|'));
  // The card closes into a bar as the list scrolls, exactly like the overview's (same hook, same timings).
  const card = useCollapsingCard<HTMLDivElement>();
  const summaryMetrics = useTransform(card.progress, [0, 0.45], [1, 0]);
  const summaryMetricsY = useTransform(card.progress, [0, 1], [0, -12]);
  const summaryTrend = useTransform(card.progress, [0, 0.3], [1, 0]);
  const summaryFade = useTransform(card.progress, [0.25, 0.6], [1, 0]);
  const summaryPointer = useTransform(card.progress, p => (p > 0.4 ? 'none' : 'auto'));
  const summaryRadius = useTransform(card.progress, [0, 1], [22, 18]);
  // Ends 74px above the open card's bottom; reaches 14px below the bar once closed (as on the overview).
  const summaryBackdrop = useTransform([card.height, card.progress, card.leadValue], ([h, p, before]: number[]) => before + 8 + h - (74 - 88 * p));
  // The title fades out before it reaches the top bar, so the bar's edge never cuts through it (owner, 2026-10-20).
  const pageScroll = useScrollTop();
  const titleOpacity = useTransform([pageScroll, card.leadValue], ([y, lead]: number[]) => (lead ? Math.max(0, 1 - y / (lead * 0.6)) : 1));

  // Phones: money in straight from the card (owner, 2026-10-20: "ตอนนี้กดรับเงินยากมาก"). One tap opens
  // the same payment forms as the ⋯ menu: the next instalment; the rest after a deposit; for a job with
  // nothing received, the deposit while the work is in progress, or the full amount once delivered
  // (each form can still switch between full and deposit where the menu offers both).
  const receiveAction = (j: Job, info: ReturnType<typeof describeJob>) => {
    if (info.stage === 'closed' || info.statusInfo.behavior === 'done' || outstanding(j) <= 0) return null;
    if (info.isInstallment) return (j.installments || []).some(row => row.status !== 'paid') ? { label: tr("รับงวดถัดไป"), run: () => openInstallmentPayment(j) } : null;
    if (info.statusInfo.behavior === 'pending') return info.stage === 'working'
      ? { label: tr("รับมัดจำ"), run: () => promptPartial(j) }
      : { label: tr("รับเงิน"), run: () => markPaidFull(j) };
    return { label: tr("รับส่วนที่เหลือ"), run: () => markPaidFull(j) };
  };

  // Phones: the design's job card. Tapping it opens the job; the chevron opens the same actions as the table's ⋯.
  const mobileJobCard = (j: Job) => {
    const info = describeJob(j);
    const owed = info.stage === 'closed' ? 0 : outstanding(j);
    const urgent = info.dueTone === 'overdue';
    const tone = info.stage === 'closed' ? 'is-paid'
      : info.stage === 'awaiting' && urgent ? 'is-overdue'
      : info.stage === 'awaiting' && info.dueTone !== 'normal' ? 'is-due-soon' : '';
    const dateStr = info.stage === 'working' ? j.postDate : (j.payDate || j.postDate);
    const shortDate = dateStr ? safeFormatThaiDate(dateStr, { day: 'numeric', month: 'short' }) : '';
    const deadline = info.stage === 'closed' || !dateStr ? null
      : info.stage === 'working' ? { icon: 'calendar' as const, text: urgent ? tr("เลยกำหนดส่งงาน") : tr("กำหนดส่งงาน"), tone: urgent ? 'is-urgent' : '', right: shortDate }
      : urgent ? { icon: 'alert' as const, text: info.dueText, tone: 'is-urgent', right: tr("ครบ {0}", shortDate) }
      : { icon: 'clock' as const, text: info.dueTone === 'today' ? tr("ครบกำหนดวันนี้") : info.dueTone === 'soon' ? tr("ใกล้ครบกำหนด") : tr("กำหนดรับเงิน"), tone: info.dueTone === 'normal' ? '' : 'is-soon', right: shortDate };
    const paymentTone = info.payment === 'รับครบแล้ว' ? 'is-success' : info.payment === 'ยังไม่จ่าย' ? '' : 'is-emphasis';
    const receive = receiveAction(j, info);
    return (
      <div
        key={j.id}
        data-job-id={j.id}
        role="button"
        tabIndex={0}
        onClick={() => setEditingJob(j)}
        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setEditingJob(j); } }}
        className={`ksm-jobcard ${tone} ${highlightedJobId === j.id ? 'job-spotlight' : ''}`}
      >
        <div className="ksm-jobcard-top">
          <div className="ksm-grow">
            <p className="ksm-jobclient">{j.client || tr("ไม่ระบุลูกค้า")}{typeLabel(j) ? ` · ${typeLabel(j)}` : ''}</p>
            <p className="ksm-jobtitle">{j.name}</p>
          </div>
          <div className="ksm-jobmoney">
            <small>{owed > 0 ? tr("รอรับสุทธิ") : tr("รับแล้ว")}</small>
            <strong>{formatCurrency(owed > 0 ? owed : (j.received || netReceivable(j)))}</strong>
          </div>
        </div>
        <div className="ksm-jobstatus">
          <span className="ksm-workstate">
            <KsIcon name={info.stage === 'working' ? 'briefcase' : 'check'} size={17} />
            {info.stage === 'working' ? tr("กำลังทำ") : tr("ส่งงานแล้ว")}
          </span>
          <span className={`ksm-badge ${paymentTone}`}>
            {info.payment === 'รับครบแล้ว' && <KsIcon name="check" size={14} />}
            {info.payment === 'ยังไม่จ่าย' ? tr("ยังไม่รับเงิน") : tr(info.payment)}
          </span>
          {showWht50 && <Wht50Chip job={j} />}
          <span className="ksm-spacer" />
          <button
            type="button"
            className="ksm-cardmenu"
            onClick={(event) => openActionMenu(event, j)}
            aria-label={tr("ตัวเลือกของงาน {0}", j.name)}
            aria-haspopup="menu"
            aria-expanded={actionMenu?.job.id === j.id}
          >
            <KsIcon name="chevron" size={17} />
          </button>
        </div>
        {(deadline || receive) && (
          <div className={`ksm-jobfoot${deadline?.tone === 'is-urgent' ? ' is-urgent' : ''}`}>
            {deadline
              ? <div className={`ksm-deadline ${deadline.tone}`}><KsIcon name={deadline.icon} size={14} /><span>{tr(deadline.text)}</span><span>{deadline.right}</span></div>
              : <span className="ksm-grow" />}
            {receive && (
              <button type="button" className={`ksm-btn ksm-receive ${urgent && info.stage === 'awaiting' ? 'is-primary' : 'is-soft'}`}
                onClick={(event) => { event.stopPropagation(); receive.run(); }} aria-label={`${tr(receive.label)} · ${j.name}`}>
                <KsIcon name="receive" size={16} />{tr(receive.label)}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={mobile ? 'page-content ksm ksm-screen' : 'page-content'} ref={mobile ? card.rootRef : undefined}>
      {/* Page header */}
      {mobile ? (
        <section className="ksm-summary ksm-pagehero" aria-labelledby="jobs-title"
          style={card.expanded ? { height: card.lead + 8 + card.expanded + 18, top: -(10 + card.lead) } : undefined}>
          {/* The terracotta of the top bar runs on behind the title and the card's upper part, as on the overview. */}
          <motion.div className="ksm-hero-backdrop" aria-hidden="true" style={{ height: summaryBackdrop }} />
          <motion.div className="ksm-pagehero-title" ref={card.leadRef} style={{ opacity: titleOpacity }}>
            {/* The original mascot as a faint white shape, as on the overview's header. */}
            <span className="ksm-pagehero-mascot" aria-hidden="true"><Mascot mood="happy" action="hold-baht" animated={false} size={48} /></span>
            <h2 id="jobs-title">{tr("งานของฉัน")}</h2>
            <button
              type="button"
              className={`ksm-toolbtn${activeFilterCount > 0 || sortBy !== 'recent' ? ' is-active' : ''}`}
              onClick={(event) => openPanel(event, 'filter')}
              aria-haspopup="dialog"
              aria-expanded={panel?.kind === 'filter'}
              aria-label={tr("ตัวกรองและเครื่องมืองาน")}
            >
              <KsIcon name="filter" />
              {(activeFilterCount > 0 || sortBy !== 'recent') && <i aria-hidden="true" />}
            </button>
          </motion.div>
          {/* Shrinks into a one-line bar as the list scrolls, like the overview's card (useCollapsingCard). */}
          <div className="ksm-hero" ref={summaryRef} role="group" aria-label={tr("สรุปงาน")} style={{ top: card.lead + 8 }}>
            <motion.div className="ksm-hero-clip" style={{ height: card.expanded ? card.height : undefined, borderRadius: summaryRadius }}
              onClick={event => { if (card.progress.get() > 0.5 && !(event.target as HTMLElement).closest('button')) card.open(); }}>
              <div className="ksm-hero-inner" ref={card.innerRef}>
                <div className="ksm-hero-row" ref={card.labelRef}>
                  <div className="ksm-hero-label"><KsIcon name="coins" size={17} /><span>{tr("รอรับสุทธิ")}</span></div>
                  <motion.button type="button" className="ksm-hero-pill" onClick={(event) => openPanel(event, 'month')}
                    style={{ opacity: summaryFade, pointerEvents: summaryPointer }}
                    aria-haspopup="dialog" aria-expanded={panel?.kind === 'month'} aria-label={tr("ช่วงเวลา: {0}", periodLabel(period))}>
                    <span>{periodLabel(period)}</span><KsIcon name="down" size={15} />
                  </motion.button>
                </div>
                <div className="ksm-hero-figure">
                  <motion.div ref={card.amountRef} className="ksm-net" style={{ x: card.amountX, y: card.amountY, scale: card.amountScale, transformOrigin: '0 0' }}>
                    <strong data-metric="work" key={mobileSummary.working + mobileSummary.awaiting}>{formatCurrency(mobileSummary.working + mobileSummary.awaiting)}</strong>
                  </motion.div>
                  <motion.span className={`ksm-trend ${mobileSummary.overdue ? 'is-down' : 'is-plain'}`} style={{ opacity: summaryTrend }}>
                    {mobileSummary.overdue ? tr("เลยกำหนด {0} งาน", mobileSummary.overdue) : tr("ไม่มีงานเลยกำหนด")}
                  </motion.span>
                </div>
                <motion.div className="ksm-hero-metrics" style={{ opacity: summaryMetrics, y: summaryMetricsY, pointerEvents: summaryPointer }}>
                  {([
                    { tab: 'working', label: tr("กำลังทำ"), value: mobileSummary.working },
                    { tab: 'waiting_payment', label: tr("รอรับเงิน"), value: mobileSummary.awaiting },
                    { tab: 'closed', label: tr("ปิดงานแล้ว"), value: mobileSummary.closed },
                  ] as const).map(metric => (
                    <button key={metric.tab} type="button" aria-pressed={subTab === metric.tab}
                      onClick={() => setSubTab(subTab === metric.tab ? 'all' : metric.tab)}
                      aria-label={tr("{0} {1} · แสดงงาน{2}", tr(metric.label), formatCurrency(metric.value), tr(metric.label))}>
                      <span>{tr(metric.label)}</span>
                      <b data-metric={metric.tab} key={metric.value}>{formatCurrency(metric.value)}</b>
                    </button>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>
      ) : (
      <PageHeader page="jobs" className="mb-5">
        {onOpenImport && (
          <button type="button" onClick={onOpenImport} className={uiSecondaryButton} data-testid="jobs-import-button">
            <FileSpreadsheet className="h-4 w-4" /><span>{tr("นำเข้าจาก Excel")}</span>
          </button>
        )}
        <div className="relative" ref={exportMenuRef}>
          <button type="button" onClick={() => setExportOpen(v => !v)} aria-haspopup="menu" aria-expanded={exportOpen} aria-label={tr("ส่งออก")} className={uiSecondaryButton}>
            <Download className="h-4 w-4" /><span>{tr("ส่งออก")}</span><ChevronDown className="h-3.5 w-3.5 text-brand-muted" />
          </button>
          {exportOpen && (
            <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 lg-glass is-menu rounded-[20px] p-1.5 sm:left-auto sm:right-0">
              {exportItems.map(item => (
                <button key={tr(item.label)} type="button" role="menuitem" onClick={() => { setExportOpen(false); item.run(); }}
                  className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">{tr(item.label)}</button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={openAddJobForm}
          aria-label={tr("เพิ่มงาน")}
          className={uiPrimaryButton}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{tr("เพิ่มงาน")}</span>
          <span className="sm:hidden">{tr("เพิ่ม")}</span>
        </button>
      </PageHeader>
      )}
      <IncomeExportDialog open={incomeExportOpen} jobs={jobs} onClose={() => setIncomeExportOpen(false)} notify={triggerAlert} />

      {mobile ? (
        <>
          <div className="ksm-search">
            <KsIcon name="search" />
            <input type="text" inputMode="search" placeholder={tr("ค้นหางาน ลูกค้า หรือบันทึก")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label={tr("ค้นหางาน")} enterKeyHint="search" />
          </div>
          <div className="ksm-tabs" role="tablist" aria-label={tr("สถานะงาน")}>
            {tabs.map(tab => (
              <button key={tab.key} type="button" role="tab" aria-selected={subTab === tab.key} onClick={() => setSubTab(tab.key)}>
                {tab.key === 'waiting_payment' ? tr("รอรับ") : tab.key === 'closed' ? tr("ปิดงาน") : tr(tab.label)}<span className="ksm-count">{tab.count}</span>
              </button>
            ))}
          </div>
          {(activeFilterCount > 0 || searchTerm.trim() !== '') && (
            <div className="ksm-filter-note">
              <button type="button" onClick={(event) => openPanel(event, 'month')} aria-haspopup="dialog" aria-expanded={panel?.kind === 'month'} aria-label={tr("ช่วงเวลา: {0}", periodLabel(period))}>
                {tr("กรอง:")}{' '}{activeFilterCount > 0 ? tr("{0} ตัวกรอง", activeFilterCount) : tr("ทุกประเภท")} · {period.kind === 'all' ? tr("ทุกเดือน") : periodLabel(period)}
              </button>
              <button type="button" className="ksm-link" onClick={clearFilters}>{tr("ล้าง")}</button>
            </div>
          )}
        </>
      ) : (<>
      {/* Stage tabs */}
      <div className="ios-seg no-scrollbar mb-4 flex w-fit max-w-full overflow-x-auto" role="tablist" aria-label={tr("สถานะงาน")}>
        {tabs.map(tab => {
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.key)}
              className="ios-seg-item h-9 shrink-0 text-[13px]"
            >
              {tr(tab.label)}
              <span>{tab.count}</span>
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
            placeholder={tr("ค้นหาชื่องาน ลูกค้า หรือแบรนด์...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ios-search h-10 w-full rounded-xl border pl-9 pr-3 text-[13px] text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B] focus:bg-brand-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => openPanel(event, 'month')}
            aria-haspopup="dialog"
            aria-expanded={panel?.kind === 'month'}
            aria-label={tr("ช่วงเวลา: {0}", periodLabel(period))}
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
              aria-label={tr("เรียงตาม")}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as JobSort)}
              className="h-10 appearance-none rounded-xl border border-brand-border bg-brand-white pl-3 pr-8 text-xs text-brand-text outline-none transition-colors hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer"
            >
              {SORT_OPTIONS.map(option => (
                <option key={option.key} value={option.key}>{tr("เรียงตาม: {0}", sortLabel(option))}</option>
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
            {tr("ตัวกรอง")}{activeFilterCount > 0 && (
              <span className="rounded-full bg-[#FFF1E8] px-1.5 text-[11px] leading-[18px] text-[#C24A16] dark:bg-orange-500/15 dark:text-orange-300">{activeFilterCount}</span>
            )}
            {/* Phones sort from inside this sheet, so flag a non-default sort here. */}
            {activeFilterCount === 0 && sortBy !== 'recent' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[#E65F2B] sm:hidden" aria-label={tr("เปลี่ยนการเรียงแล้ว")} />
            )}
          </button>
        </div>
      </div>

      </>)}

      {/* Jobs list: table from sm up, compact cards on phones */}
      <div>
      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-white px-6 py-10 text-center">
          <Mascot mood="happy" size={72} />
          <p className="mt-1 text-sm font-semibold text-brand-text">{tr("ยังไม่มีงาน")}</p>
          <p className="max-w-sm text-xs text-brand-muted">{tr("เริ่มเพิ่มงานแรกของคุณ แล้วกระรอกจะช่วยติดตามจนถึงวันที่รับเงินจริง")}</p>
          <button
            type="button"
            onClick={openAddJobForm}
            className="mt-2 flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> {tr("เพิ่มงาน")}</button>
        </div>
      ) : sortedJobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-brand-border bg-brand-white px-6 py-10 text-center">
          <Mascot mood="thinking" size={56} />
          {period.kind !== 'all' && !searchTerm.trim() && activeFilterCount === 0 ? (
            <>
              <p className="mt-1 text-sm font-medium text-brand-text">
                {period.kind === 'range' ? tr("ยังไม่มีงานในช่วงเวลานี้") : tr("ยังไม่มีงานในเดือนนี้")}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPeriod({ kind: 'all' })}
                  className="h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
                >
                  {tr("ล้างตัวกรองเดือน")}</button>
                <button
                  type="button"
                  onClick={openAddJobForm}
                  className="flex h-9 items-center gap-1 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> {tr("เพิ่มงาน")}</button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-brand-text">{tr("ไม่พบงานที่ตรงกับตัวกรองนี้")}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-1 h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
              >
                {tr("ล้างตัวกรอง")}</button>
            </>
          )}
        </div>
      ) : (
        <>
          {!mobile && (
          <div className="hidden overflow-clip rounded-[14px] border border-brand-border bg-brand-white sm:block">
            <table className="w-full table-fixed text-left text-[13px]">
              {/* Sticks while a long list scrolls (desktop shell only; the phone/tablet top bar would cover it). */}
              {/* -top-8 cancels the content panel's lg:pt-8 so the header meets the panel's top edge. */}
              <thead className="lg:sticky lg:-top-8 lg:z-10">
                <tr className="border-b border-brand-border [&>th]:bg-brand-white [&>th]:shadow-[inset_0_-1px_0_var(--color-brand-border)]">
                  <th className="w-[34%] px-4 py-2.5 text-xs font-medium text-brand-muted md:w-[30%] xl:w-[23%]">{tr("งาน / แหล่งรายได้")}</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-brand-muted xl:table-cell">{tr("ลูกค้า / ผู้จ่าย")}</th>
                  <th className="w-[136px] px-3 py-2.5 text-xs font-medium text-brand-muted">{tr("กำหนด")}</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-brand-muted xl:w-[104px]">{tr("สถานะงาน")}</th>
                  <th className="hidden w-[108px] px-3 py-2.5 text-xs font-medium text-brand-muted xl:table-cell">{tr("การชำระ")}</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-brand-muted xl:w-[112px]">{tr("จำนวนเงิน")}</th>
                  <th className="w-[92px] px-2 py-2.5 md:w-[150px]"><span className="sr-only">{tr("การดำเนินการ")}</span></th>
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
                        highlightedJobId === j.id ? 'job-spotlight' : ''
                      }`}
                    >
                      <td className={`px-4 py-3 ${accentShadow(info.dueTone)}`}>
                        <p className="truncate font-medium text-brand-text">{j.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-brand-muted">
                          <span className="xl:hidden">{j.client || '—'}{typeLabel(j) ? ' · ' : ''}</span>
                          {typeLabel(j)}
                        </p>
                      </td>
                      <td className="hidden truncate px-3 py-3 text-brand-muted xl:table-cell">{j.client || '—'}</td>
                      <td className={`truncate whitespace-nowrap px-3 py-3 ${dueClass(info.dueTone)}`} title={info.dueText}>{info.dueText}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {badgeMenu(j, 'stage', i => stageBadge(info.stage, i), tr("สถานะงาน"))}
                          <span className="xl:hidden">{badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), tr("การชำระ"))}</span>
                          {showWht50 && <span className="hidden lg:inline xl:hidden"><Wht50Chip job={j} /></span>}
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 xl:table-cell"><div className="flex flex-col items-start gap-1">{badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), tr("การชำระ"))}{showWht50 && <Wht50Chip job={j} />}</div></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold text-brand-text">{amountCell(j)}</td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Money in with one click, the same forms as the ⋯ menu (owner, 2026-10-21: computers get
                              the receive button the phone has, in the table's own style). */}
                          {(() => {
                            const receive = receiveAction(j, info);
                            if (!receive) return null;
                            const late = info.stage === 'awaiting' && info.dueTone === 'overdue';
                            return (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); receive.run(); }}
                                aria-label={`${tr(receive.label)} · ${j.name}`}
                                title={tr(receive.label)}
                                className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12px] font-semibold transition-colors cursor-pointer md:px-2.5 ${late
                                  ? 'bg-gradient-to-b from-[#E8672F] to-[#CF5420] text-white hover:from-[#DE5D27] hover:to-[#C24A16]'
                                  : 'bg-[#FFF1E8] text-[#C24A16] hover:bg-[#FFE4D4] dark:bg-[#E65F2B]/15 dark:text-[#FFA473] dark:hover:bg-[#E65F2B]/25'}`}
                              >
                                <Banknote className="h-4 w-4 shrink-0" aria-hidden />
                                <span className="hidden md:inline">{receive.label === 'รับมัดจำ' ? tr("รับมัดจำ") : tr("รับเงิน")}</span>
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={(event) => openActionMenu(event, j)}
                            aria-label={tr("ตัวเลือกของงาน {0}", j.name)}
                            aria-haspopup="menu"
                            aria-expanded={actionMenu?.job.id === j.id}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(118,118,128,0.12)] text-brand-text/75 transition-colors hover:bg-[rgba(118,118,128,0.2)] hover:text-brand-text aria-expanded:bg-[var(--glass-active)] aria-expanded:text-[#C24A16] dark:aria-expanded:text-[#FFA473] cursor-pointer"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {mobile ? (
            <div className="ksm-joblist">{sortedJobs.map(mobileJobCard)}</div>
          ) : (
          <div className="space-y-2 sm:hidden">
            {sortedJobs.map((j) => {
              const info = describeJob(j);
              return (
                <div
                  key={j.id}
                  data-job-id={j.id}
                  onClick={() => setEditingJob(j)}
                  className={`cursor-pointer overflow-hidden rounded-[14px] border border-brand-border bg-brand-white px-4 py-3 ${accentShadow(info.dueTone)} ${
                    highlightedJobId === j.id ? 'job-spotlight' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-brand-text">{j.name}</p>
                      <p className="mt-0.5 truncate text-xs text-brand-muted">{j.client || '—'}{typeLabel(j) ? ` · ${typeLabel(j)}` : ''}</p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-sm font-semibold text-brand-text">{amountCell(j)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {badgeMenu(j, 'stage', i => stageBadge(info.stage, i), tr("สถานะงาน"))}
                      {badgeMenu(j, 'payment', i => paymentBadge(info.payment, i), tr("การชำระ"))}
                      {showWht50 && <Wht50Chip job={j} />}
                      <span className={`text-[11px] ${dueClass(info.dueTone)}`}>{info.dueText}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => openActionMenu(event, j)}
                      aria-label={tr("ตัวเลือกของงาน {0}", j.name)}
                      aria-haspopup="menu"
                      aria-expanded={actionMenu?.job.id === j.id}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.12)] text-brand-text/75 hover:bg-[rgba(118,118,128,0.2)] hover:text-brand-text aria-expanded:bg-[var(--glass-active)] aria-expanded:text-[#C24A16] dark:aria-expanded:text-[#FFA473] cursor-pointer"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}
      </div>

      {panel && createPortal(
        <div className="fixed inset-0 z-[150]">
          <div className={`absolute inset-0 ${panel.sheet ? 'bg-black/40' : ''}`} onClick={() => setPanel(null)} />
          <div
            role="dialog"
            aria-label={panel.kind === 'month' ? tr("เลือกช่วงเวลา") : tr("ตัวกรอง")}
            className={panel.sheet
              ? 'absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-brand-border bg-brand-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:bg-stone-900'
              : 'absolute max-h-[70vh] overflow-y-auto rounded-xl border border-brand-border bg-brand-white shadow-lg dark:bg-stone-900'}
            style={panel.sheet ? undefined : { top: panel.top, left: panel.left, width: panel.width }}
          >
            {panel.sheet && (
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[15px] font-semibold text-brand-text">{panel.kind === 'month' ? tr("เลือกเดือน") : tr("ตัวกรอง")}</p>
                <button type="button" onClick={() => setPanel(null)} aria-label={tr("ปิด")} className="rounded-lg p-2 text-brand-muted hover:bg-brand-faint cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {panel.kind === 'month' ? (
              <div className={panel.sheet ? '' : 'p-1.5'}>
                {[
                  { key: 'all', label: tr("เดือนทั้งหมด"), value: { kind: 'all' } as JobPeriod },
                  { key: currentMonth, label: tr("เดือนนี้"), secondary: monthName(currentMonth), value: { kind: 'month', month: currentMonth } as JobPeriod },
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
                        {tr(option.label)}
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
                  <span className="min-w-0 flex-1">{tr("เลือกช่วงเวลา")}</span>
                  {period.kind === 'range' ? <Check className="h-4 w-4 shrink-0" /> : <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-brand-muted transition-transform ${rangeOpen ? 'rotate-180' : ''}`} />}
                </button>
                {rangeOpen && (
                  <div className="space-y-2.5 px-3 pb-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs text-brand-muted">
                        {tr("จาก")}<input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-brand-border bg-brand-white px-2 text-xs text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950" />
                      </label>
                      <label className="block text-xs text-brand-muted">
                        {tr("ถึง")}<input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-brand-border bg-brand-white px-2 text-xs text-brand-text outline-none focus:border-[#E65F2B] dark:bg-neutral-950" />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={applyRange}
                      disabled={!rangeFrom && !rangeTo}
                      className="h-10 w-full rounded-lg bg-[#E65F2B] text-xs font-semibold text-white transition-colors hover:bg-[#D85723] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                      {tr("ใช้ช่วงเวลานี้")}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className={panel.sheet ? 'space-y-4 pt-1' : 'space-y-4 p-4'}>
                {[
                  // Sorting sits in this sheet on phones, where there is no room for its own dropdown.
                  ...(panel.sheet ? [{
                    title: tr("เรียงตาม"),
                    options: SORT_OPTIONS.map(option => ({ key: option.key, label: sortLabel(option), active: draftSort === option.key, toggle: () => setDraftSort(option.key) })),
                  }] : []),
                  {
                    title: tr("สถานะงาน"),
                    options: STAGE_FILTERS.map(option => ({ key: option.key, label: tr(option.label), active: draftFilters.stages.includes(option.key), toggle: () => toggleDraft('stages', option.key) })),
                  },
                  {
                    title: tr("การชำระ"),
                    options: PAYMENT_FILTERS.map(label => ({ key: label, label: tr(label), active: draftFilters.payments.includes(label), toggle: () => toggleDraft('payments', label) })),
                  },
                  {
                    title: tr("ประเภทงาน"),
                    options: typeOptions.map(type => ({ key: type, label: tr(type), active: draftFilters.types.includes(type), toggle: () => toggleDraft('types', type) })),
                  },
                ].map(group => (
                  <fieldset key={tr(group.title)}>
                    <legend className="mb-2 text-xs font-medium text-brand-muted">{tr(group.title)}</legend>
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
                          {tr(option.label)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
                {mobile && (
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-brand-muted">{tr("ส่งออก")}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {exportItems.map(item => (
                        <button key={tr(item.label)} type="button" onClick={() => { setPanel(null); item.run(); }}
                          className="inline-flex h-8 max-w-full items-center gap-1.5 truncate rounded-full border border-brand-border px-3 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
                          <KsIcon name="download" size={14} />{tr(item.label)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="flex gap-2 border-t border-brand-border pt-3">
                  <button
                    type="button"
                    onClick={() => setDraftFilters(emptyFilters)}
                    className="h-10 flex-1 rounded-xl border border-brand-border text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
                  >
                    {tr("ล้างตัวกรอง")}</button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="h-10 flex-[2] rounded-xl bg-[#E65F2B] text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
                  >
                    {tr("ใช้ตัวกรอง")}</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {actionMenu && createPortal(
        <>
        {mobile && <div className="ksm-sheet-backdrop" style={{ zIndex: 149 }} aria-hidden="true" />}
        <div
          ref={actionMenuRef}
          role="menu"
          aria-label={actionMenu.kind === 'stage' ? tr("เปลี่ยนสถานะงาน {0}", actionMenu.job.name) : actionMenu.kind === 'payment' ? tr("บันทึกการชำระ {0}", actionMenu.job.name) : tr("ตัวเลือกของงาน {0}", actionMenu.job.name)}
          className={mobile ? 'ksm ksm-actionsheet' : `lg-glass is-menu fixed z-[150] ${actionMenu.kind === 'actions' ? 'w-56' : 'w-[200px]'} rounded-[20px] p-1.5`}
          style={mobile ? undefined : { top: actionMenu.top, left: actionMenu.left, transform: actionMenu.up ? 'translateY(-100%)' : undefined }}
        >
          {mobile && (
            <>
              <div className="ksm-sheet-grip" aria-hidden="true" />
              <p className="ksm-actionsheet-title">{actionMenu.job.name}</p>
            </>
          )}
          {actionMenu.kind !== 'actions' && (
            <p className="px-3 pb-1 pt-1.5 text-[11px] text-brand-muted">{actionMenu.kind === 'stage' ? tr("เปลี่ยนสถานะงานเป็น") : tr("บันทึกการรับเงิน")}</p>
          )}
          {menuActions(actionMenu).map(action => (
            <button
              key={tr(action.label)}
              type="button"
              role="menuitem"
              onClick={() => { setActionMenu(null); action.run(); }}
              className={`flex w-full items-center rounded-[14px] px-3 py-2 text-left text-[13px] leading-5 transition-colors cursor-pointer ${
                action.danger ? 'text-[#C43A3A] hover:bg-[#C43A3A]/[0.08] dark:text-rose-300 dark:hover:bg-rose-950/40' : 'text-brand-text hover:bg-black/[0.05] dark:hover:bg-white/[0.07]'
              }`}
            >
              {tr(action.label)}
            </button>
          ))}
        </div>
        </>,
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#E65F2B]">{tr("รับเงินเป็นงวด")}</p>
                      <h3 className="mt-1 text-lg font-black text-brand-text dark:text-white">{installmentPaymentJob.name}</h3>
                      <p className="mt-1 text-[11px] font-semibold text-brand-muted">{tr("เลือกเฉพาะงวดที่ได้รับเงินแล้ว ระบบจะคำนวณยอดค้างและงวดถัดไปให้")}</p>
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
                          <p className="truncate text-xs font-black text-brand-text">{installmentLabel(row.label)}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-brand-muted">{row.dueDate ? tr("ครบกำหนด {0}", safeFormatThaiDate(row.dueDate)) : tr("ยังไม่ระบุวันครบกำหนด")}</p>
                        </div>
                        <p className="shrink-0 font-mono text-sm font-black text-[#E65F2B]">{formatCurrency(row.amount)}</p>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-brand-muted">{tr("วันที่รับเงินจริง")}</label>
                    <input type="date" value={installmentPaidDate} onChange={(event) => setInstallmentPaidDate(event.target.value)} className="w-full rounded-xl border border-brand-border/60 bg-brand-faint p-3 text-sm font-bold outline-none focus:border-[#E65F2B]" />
                  </div>

                  <button
                    type="button"
                    onClick={confirmInstallmentPayment}
                    disabled={!selectedInstallmentId || !installmentPaidDate}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E65F2B] py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <CheckCircle className="h-4 w-4" /> {tr("ยืนยันรับเงินงวดนี้")}</button>
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
        onAdd={job => { const id = onAddJob(job); if (id) spotlightSaved(id); }}
        onEdit={(id, updated) => { onEditJob(id, updated); spotlightSaved(id); }}
      />

      {/* Delivery-date / credit-term prompt for marking a WIP job as delivered when it has no
          postDate yet -- same date field + credit-term picker markup as the edit form's own
          "posted" step, driven by separate delivery* state so its Save doesn't route through
          the full edit form (and its own second LINE notification). */}
      <JobDeliveryDialog
        job={deliveryPromptJob}
        defaultDate={getLocalDateStr()}
        paidInFull={deliveryPaid}
        onClose={() => setDeliveryPromptJob(null)}
        onSave={({ postDate, creditTerm, excludeHolidays }) => {
          const job = deliveryPromptJob;
          if (!job) return;
          applyQuickChange(job, {
            isPosted: true,
            pending: outstanding(job),
            postDate,
            creditTerm,
            excludeHolidays,
            // A job paid in full before delivery keeps its real payment date.
            payDate: getStatusDisplay(job.status).behavior === 'done' && job.payDate
              ? job.payDate
              : calculatePayDate(postDate, creditTerm, excludeHolidays)
          }, tr("ส่งงานแล้ว"));
          setDeliveryPromptJob(null);
        }}
      />
    </div>
  );
}

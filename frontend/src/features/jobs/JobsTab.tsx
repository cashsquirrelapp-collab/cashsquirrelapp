import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Job, StatusOption } from '../../../../shared/types';
import { formatCurrency, calculatePayDate, getRelativeDaysText, safeFormatThaiDate, dateLocale } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import JobFormDrawer from './JobFormDrawer';
import { sortJobs, groupsByMonth, jobSortDate, type JobSort } from './jobSort';
import {
  Search,
  Filter,
  CheckCircle,
  ChevronDown,
  Clock,
  Plus,
  MoreHorizontal,
  ArrowUpDown
} from 'lucide-react';

// Local (not UTC) YYYY-MM-DD -- avoids the date shifting by a day near midnight in UTC+7,
// same convention already used inline elsewhere in this file's quick-action handlers.
function getLocalDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [subTab, setSubTab] = useState<'all' | 'working' | 'waiting_payment' | 'closed'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<JobSort>('recent');
  const [actionMenu, setActionMenu] = useState<{ job: Job; top: number; left: number; up: boolean } | null>(null);
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
    const netReceivable = Math.max(0, installmentPaymentJob.value - (installmentPaymentJob.whtAmount || 0));
    const pendingRows = installments
      .filter((row) => row.status !== 'paid' && row.dueDate)
      .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
    const isPaid = received >= netReceivable || installments.every((row) => row.status === 'paid');
    onEditJob(installmentPaymentJob.id, {
      installments,
      received,
      pending: Math.max(0, netReceivable - received),
      paymentStatus: isPaid ? 'paid' : 'partial',
      payDate: isPaid ? installmentPaidDate : (pendingRows[0]?.dueDate || null),
    });
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

  // Unique job categories in current list for secondary filter
  const uniqueTypes = Array.from(new Set(jobs.map(j => j.type)));

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

  const query = searchTerm.trim().toLowerCase();
  const filteredJobs = jobs.filter(j => {
    const matchesSearch = !query
      || j.name.toLowerCase().includes(query)
      || (j.client || '').toLowerCase().includes(query)
      || (j.type || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
    const matchesType = typeFilter === 'all' || j.type === typeFilter;
    const matchesSubTab = subTab === 'all' ||
                          (subTab === 'working' && isWorking(j)) ||
                          (subTab === 'waiting_payment' && isAwaitingPayment(j)) ||
                          (subTab === 'closed' && isClosed(j));
    return matchesSearch && matchesStatus && matchesType && matchesSubTab;
  });
  const sortedJobs = sortJobs(filteredJobs, sortBy, subTab);
  const showMonthLabels = groupsByMonth(sortBy, subTab);
  const monthLabel = (j: Job) => {
    const date = jobSortDate(j, subTab);
    if (!date) return 'ไม่ระบุวันที่';
    const [y, m] = date.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  };
  const startsMonth = (index: number) =>
    showMonthLabels && (index === 0 || monthLabel(sortedJobs[index - 1]) !== monthLabel(sortedJobs[index]));
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSubTab('all');
  };

  const openAddJobForm = () => {
    setEditingJob(null);
    onOpenAddJob();
  };

  const closeJobForm = React.useCallback(() => {
    setEditingJob(null);
    onCloseAddJob();
  }, [onCloseAddJob]);

  const markPosted = (j: Job) => {
    if (j.postDate) {
      onEditJob(j.id, { isPosted: true });
      return;
    }
    setDeliveryPostDate(j.postDate || getLocalDateStr());
    setDeliveryCreditTerm(j.creditTerm || 0);
    setDeliveryExcludeHolidays(j.excludeHolidays || false);
    setDeliveryPromptJob(j);
  };

  const markPaidFull = (j: Job) => {
    onEditJob(j.id, {
      status: 'done',
      received: j.value - Math.round(j.value * ((j.whtRate || 0) / 100)),
      pending: 0,
      paymentStatus: 'paid',
      payDate: getLocalDateStr(),
      isPosted: true
    });
  };

  const promptPartial = (j: Job) => {
    const partialVal = Math.round(j.value * 0.3);
    triggerPrompt(
      t('jobs.partialPromptTitle'),
      t('jobs.partialPromptMessage', { name: j.name, amount: partialVal.toLocaleString() }),
      String(partialVal),
      t('jobs.enterAmountPlaceholder'),
      'number',
      (val) => {
        const amt = parseFloat(val) || 0;
        if (amt > 0) {
          const localDateStr = getLocalDateStr();
          onEditJob(j.id, {
            status: 'partial',
            received: amt,
            pending: Math.max(0, (j.value - Math.round(j.value * ((j.whtRate || 0) / 100))) - amt),
            paymentStatus: 'partial',
            depositDate: localDateStr,
            depositAmount: amt
          });
        }
      }
    );
  };

  const describeJob = (j: Job) => {
    const statusInfo = getStatusDisplay(j.status);
    const isInstallment = j.status === 'installment' && Boolean(j.installments?.length);
    const stage = isWorking(j) ? 'working' : isClosed(j) ? 'closed' : 'awaiting';
    const dateStr = stage === 'working' ? j.postDate : (j.payDate || j.postDate);
    let dueText = 'ยังไม่ระบุ';
    let dueTone: 'overdue' | 'soon' | 'normal' = 'normal';
    if (dateStr) {
      const longDate = safeFormatThaiDate(dateStr, { day: 'numeric', month: 'short', year: 'numeric' });
      if (stage === 'closed') {
        dueText = longDate;
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(`${dateStr}T00:00:00`).getTime() - today.getTime()) / 86400000);
        dueText = diff === 0 ? 'วันนี้' : diff === 1 ? 'พรุ่งนี้' : diff < 0 ? `เกินกำหนด ${-diff} วัน` : diff <= 14 ? `อีก ${diff} วัน` : longDate;
        if (stage === 'awaiting') dueTone = diff < 0 ? 'overdue' : diff <= 3 ? 'soon' : 'normal';
      }
    }
    const payment = isInstallment && j.pending > 0 ? 'แบ่งงวด'
      : j.pending <= 0 && (j.received > 0 || statusInfo.behavior === 'done') ? 'รับครบแล้ว'
      : j.received > 0 ? 'รับบางส่วน'
      : 'ยังไม่จ่าย';
    return { statusInfo, isInstallment, stage, dueText, dueTone, payment };
  };

  const jobActions = (j: Job) => {
    const { statusInfo, isInstallment } = describeJob(j);
    const hasPendingInstallment = (j.installments || []).some(row => row.status !== 'paid');
    const actions: { label: string; run: () => void; danger?: boolean }[] = [
      { label: 'ดูและแก้ไขรายละเอียด', run: () => setEditingJob(j) },
    ];
    if (j.isPosted === false) actions.push({ label: 'ส่งมอบงานแล้ว', run: () => markPosted(j) });
    if (isInstallment && hasPendingInstallment) actions.push({ label: 'รับเงินงวดถัดไป', run: () => openInstallmentPayment(j) });
    if (statusInfo.behavior !== 'done' && !isInstallment && j.isPosted !== false) actions.push({ label: 'บันทึกรับเงินครบ', run: () => markPaidFull(j) });
    if (statusInfo.behavior === 'pending' && !isInstallment) actions.push({ label: 'บันทึกรับมัดจำ / บางส่วน', run: () => promptPartial(j) });
    actions.push({ label: 'ลบงาน', run: () => onDeleteJob(j.id), danger: true });
    return actions;
  };

  const openActionMenu = (event: React.MouseEvent<HTMLButtonElement>, job: Job) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 224;
    const up = rect.bottom + 280 > window.innerHeight;
    setActionMenu(current => current?.job.id === job.id ? null : {
      job,
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: up ? rect.top - 4 : rect.bottom + 4,
      up,
    });
  };

  const stageBadge = (stage: string) => (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${
      stage === 'working'
        ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
        : stage === 'awaiting'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : 'bg-brand-faint text-brand-muted'
    }`}>
      {stage === 'working' ? 'กำลังทำ' : stage === 'awaiting' ? 'เสร็จแล้ว' : 'ปิดงานแล้ว'}
    </span>
  );

  const paymentBadge = (payment: string, overdue: boolean) => (
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ${
      payment === 'รับครบแล้ว'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : overdue
        ? 'bg-[#FFF0F0] text-[#C43A3A] dark:bg-rose-950/40 dark:text-rose-300'
        : payment === 'รับบางส่วน'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : payment === 'แบ่งงวด'
        ? 'bg-brand-faint text-brand-text'
        : 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-orange-300'
    }`}>
      {payment}
    </span>
  );

  const dueClass = (tone: 'overdue' | 'soon' | 'normal') =>
    tone === 'overdue' ? 'font-medium text-[#C43A3A] dark:text-rose-300' : tone === 'soon' ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-brand-muted';

  const accentShadow = (tone: 'overdue' | 'soon' | 'normal') =>
    tone === 'overdue' ? 'shadow-[inset_3px_0_0_#E95454]' : tone === 'soon' ? 'shadow-[inset_3px_0_0_#F2A93B]' : '';

  const typeLabel = (j: Job) => (j.type && j.type !== 'ยังไม่ระบุ' ? j.type : '');

  return (
    <div className="page-content">
      {/* Page header */}
      <div className="mb-5 flex items-end justify-between gap-3 border-b border-brand-border/30 pb-3.5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-brand-text lg:text-[26px]">งาน</h1>
          <p className="mt-0.5 text-[13px] text-brand-muted">
            <span className="hidden sm:inline">ติดตามงานตั้งแต่รับงาน จนถึงวันที่เงินจริงเข้ามา</span>
            <span className="sm:hidden">ติดตามงานตั้งแต่รับงานจนถึงรับเงินจริง</span>
          </p>
        </div>
        <button
          type="button"
          onClick={openAddJobForm}
          aria-label="เพิ่มงาน"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#D85723] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">เพิ่มงาน</span>
          <span className="sm:hidden">เพิ่ม</span>
        </button>
      </div>

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

      {/* Search, sort and filter */}
      <div className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="ค้นหาชื่องาน ลูกค้า หรือแบรนด์..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B]"
            />
          </div>
          <div className="relative shrink-0">
            {/* Icon-only on phones; the native picker still shows the option labels. */}
            <ArrowUpDown className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-brand-text sm:hidden" />
            <select
              aria-label="เรียงตาม"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-10 w-10 appearance-none rounded-xl border border-brand-border bg-brand-white text-xs text-transparent outline-none transition-colors hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer sm:w-auto sm:pl-3 sm:pr-8 sm:text-brand-text"
            >
              <option className="text-brand-text" value="recent">เรียงตาม: {subTab === 'waiting_payment' ? 'ด่วนที่สุด' : 'ล่าสุด'}</option>
              <option className="text-brand-text" value="oldest">เรียงตาม: {subTab === 'waiting_payment' ? 'ครบกำหนดไกลสุด' : 'เก่าสุด'}</option>
              <option className="text-brand-text" value="amountDesc">เรียงตาม: มูลค่าสูงสุด</option>
              <option className="text-brand-text" value="amountAsc">เรียงตาม: มูลค่าต่ำสุด</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-brand-muted sm:block" />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(value => !value)}
            aria-expanded={showFilters}
            aria-label="ตัวกรอง"
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs transition-colors cursor-pointer ${
              showFilters || statusFilter !== 'all' || typeFilter !== 'all'
                ? 'border-[#F3B08C] bg-[#FFF1E8] text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
                : 'border-brand-border bg-brand-white text-brand-text hover:bg-brand-faint'
            }`}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">ตัวกรอง</span>
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              aria-label="กรองตามสถานะการชำระ"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-brand-border bg-brand-white px-3 text-xs text-brand-text outline-none focus:border-[#E65F2B] cursor-pointer"
            >
              <option value="all">{t('jobs.filterStatusAll')}</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <select
              aria-label="กรองตามประเภทงาน"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 rounded-xl border border-brand-border bg-brand-white px-3 text-xs text-brand-text outline-none focus:border-[#E65F2B] cursor-pointer"
            >
              <option value="all">{t('jobs.filterTypeAll')}</option>
              {Array.from(new Set(jobTypes)).filter(Boolean).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
              {uniqueTypes.filter(ut => !jobTypes.includes(ut)).map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        )}
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
          <p className="mt-1 text-sm font-medium text-brand-text">ไม่พบงานที่ตรงกับตัวกรองนี้</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-1 h-9 rounded-xl border border-brand-border px-4 text-xs text-brand-text transition-colors hover:bg-brand-faint cursor-pointer"
          >
            ล้างตัวกรอง
          </button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[14px] border border-brand-border bg-brand-white sm:block">
            <table className="w-full table-fixed text-left text-[13px]">
              <thead>
                <tr className="border-b border-brand-border">
                  <th className="w-[34%] px-4 py-2.5 text-xs font-medium text-brand-muted lg:w-[26%]">งาน / แหล่งรายได้</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-brand-muted lg:table-cell">ลูกค้า / ผู้จ่าย</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-brand-muted">กำหนด</th>
                  <th className="px-3 py-2.5 text-xs font-medium text-brand-muted">สถานะงาน</th>
                  <th className="hidden px-3 py-2.5 text-xs font-medium text-brand-muted lg:table-cell">การชำระ</th>
                  <th className="px-3 py-2.5 text-right text-xs font-medium text-brand-muted">จำนวนเงิน</th>
                  <th className="w-12 px-2 py-2.5"><span className="sr-only">การดำเนินการ</span></th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((j, index) => {
                  const info = describeJob(j);
                  const overdue = info.dueTone === 'overdue';
                  return (
                    <React.Fragment key={j.id}>
                    {startsMonth(index) && (
                      <tr className="border-b border-brand-border">
                        <th colSpan={7} scope="rowgroup" className="px-4 pb-1.5 pt-4 text-left text-xs font-medium text-brand-muted">{monthLabel(j)}</th>
                      </tr>
                    )}
                    <tr
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
                      <td className={`whitespace-nowrap px-3 py-3 ${dueClass(info.dueTone)}`}>{info.dueText}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {stageBadge(info.stage)}
                          <span className="lg:hidden">{paymentBadge(info.payment, overdue)}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">{paymentBadge(info.payment, overdue)}</td>
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
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {sortedJobs.map((j, index) => {
              const info = describeJob(j);
              return (
                <React.Fragment key={j.id}>
                {startsMonth(index) && (
                  <p className="px-1 pt-2 text-xs font-medium text-brand-muted">{monthLabel(j)}</p>
                )}
                <div
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
                      {stageBadge(info.stage)}
                      {paymentBadge(info.payment, info.dueTone === 'overdue')}
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
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
      </div>

      {actionMenu && createPortal(
        <div
          ref={actionMenuRef}
          role="menu"
          aria-label={`ตัวเลือกของงาน ${actionMenu.job.name}`}
          className="fixed z-[150] w-56 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-stone-900"
          style={{ top: actionMenu.top, left: actionMenu.left, transform: actionMenu.up ? 'translateY(-100%)' : undefined }}
        >
          {jobActions(actionMenu.job).map(action => (
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

      <JobFormDrawer
        open={isAddJobOpen || Boolean(editingJob)}
        job={editingJob}
        statuses={statuses}
        jobTypes={jobTypes}
        setJobTypes={setJobTypes}
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

                {deliveryPostDate && deliveryCreditTerm > 0 && (
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

              {/* Credit Term Selection */}
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
                    onEditJob(job.id, {
                      isPosted: true,
                      postDate: deliveryPostDate,
                      creditTerm: deliveryCreditTerm,
                      excludeHolidays: deliveryExcludeHolidays,
                      payDate: calculatePayDate(deliveryPostDate, deliveryCreditTerm, deliveryExcludeHolidays)
                    });
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

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Job, JobInstallment, StatusOption } from '../../../../shared/types';
import { formatCurrency, calculatePayDate, getRelativeDaysText, safeFormatThaiDate, DEFAULT_JOB_TYPES } from '../../utils';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import NumberInput from '../../components/ui/NumberInput';
import JobTypeSelector from './JobTypeSelector';
import WithholdingTaxSelector from './WithholdingTaxSelector';
import WorkStageSelector from './WorkStageSelector';
import InstallmentPlanner from './InstallmentPlanner';
import { IconCheck, IconClose, IconCalendar, IconHourglass, IconNote, IconArrowLeft, IconArrowRight } from '../../components/ui/icons';
import {
  Briefcase,
  Search,
  Filter,
  Trash2,
  CheckCircle,
  ChevronDown,
  User,
  FileText,
  Clock,
  ExternalLink,
  Edit2,
  Send,
  WalletCards
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
    const el = document.getElementById(`job-card-${scrollToJobId}`);
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
  const [subTab, setSubTab] = useState<'all' | 'wip' | 'posted'>('all');
  const [showFilters, setShowFilters] = useState(false);
  
  // Local form states for adding a job
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('ยังไม่ระบุ');
  const [formClient, setFormClient] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formReceived, setFormReceived] = useState('');
  const [formHoursSpent, setFormHoursSpent] = useState('');
  const [formStatus, setFormStatus] = useState<string>('pending');
  const [formCreditTerm, setFormCreditTerm] = useState<number>(0);
  // Unlike formStartDate (WIP), this one is left blank by default -- it's the actual delivery/
  // on-air date for an already-posted job, which is rarely "today" and shouldn't be assumed.
  const [formPostDate, setFormPostDate] = useState('');
  const [formStartDate, setFormStartDate] = useState(getLocalDateStr());
  const [formIsPosted, setFormIsPosted] = useState(false);
  const [formNote, setFormNote] = useState('');
  const [formWhtRate, setFormWhtRate] = useState<number>(0); // หัก ณ ที่จ่าย %
  const [formExcludeHolidays, setFormExcludeHolidays] = useState(false); // ไม่นับเสาร์อาทิตย์และวันหยุดข้าราชการ
  const [formInstallments, setFormInstallments] = useState<JobInstallment[]>([]);

  // 🌰 Wizard/Step form state
  const [formStep, setFormStep] = useState(1);
  const [canSubmit, setCanSubmit] = useState(false);

  React.useEffect(() => {
    if (isAddJobOpen) {
      setFormStep(1);
      setCanSubmit(false);
    }
  }, [isAddJobOpen]);

  React.useEffect(() => {
    if (formStep === 3) {
      setCanSubmit(false);
      const timer = setTimeout(() => {
        setCanSubmit(true);
      }, 500); // 500ms debounce to prevent accidental double-click / click carry-over
      return () => clearTimeout(timer);
    } else {
      setCanSubmit(false);
    }
  }, [formStep]);

  // States for custom entry on-the-fly
  const [customTypeInput, setCustomTypeInput] = useState('');
  const [customStatusLabelInput, setCustomStatusLabelInput] = useState('');
  const [customStatusBehavior, setCustomStatusBehavior] = useState<'pending' | 'partial' | 'done'>('pending');

  // States for Manage Expandable Panel
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [quickTypeInput, setQuickTypeInput] = useState('');
  const [quickStatusLabel, setQuickStatusLabel] = useState('');
  const [quickStatusBehavior, setQuickStatusBehavior] = useState<'pending' | 'partial' | 'done'>('pending');

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

  // Edit form states
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editReceived, setEditReceived] = useState('');
  const [editHoursSpent, setEditHoursSpent] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editCreditTerm, setEditCreditTerm] = useState<number>(0);
  const [editPostDate, setEditPostDate] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editIsPosted, setEditIsPosted] = useState(true);
  const [editNote, setEditNote] = useState('');
  const [editWhtRate, setEditWhtRate] = useState<number>(0); // หัก ณ ที่จ่าย %
  const [editExcludeHolidays, setEditExcludeHolidays] = useState(false); // ไม่นับเสาร์อาทิตย์และวันหยุดข้าราชการ
  const [editInstallments, setEditInstallments] = useState<JobInstallment[]>([]);

  // States for custom entry inside Edit Form
  const [editCustomTypeInput, setEditCustomTypeInput] = useState('');
  const [editCustomStatusLabelInput, setEditCustomStatusLabelInput] = useState('');
  const [editCustomStatusBehavior, setEditCustomStatusBehavior] = useState<'pending' | 'partial' | 'done'>('pending');

  // 🌰 Edit Wizard/Step form state
  const [editFormStep, setEditFormStep] = useState(1);
  const [editCanSubmit, setEditCanSubmit] = useState(false);

  React.useEffect(() => {
    if (editingJob) {
      setEditName(editingJob.name);
      setEditType(editingJob.type);
      setEditClient(editingJob.client || '');
      setEditValue(String(editingJob.value));
      setEditReceived(String(editingJob.received));
      setEditHoursSpent(editingJob.hoursSpent ? String(editingJob.hoursSpent) : '');
      setEditStatus(editingJob.status);
      setEditCreditTerm(editingJob.creditTerm);
      setEditPostDate(editingJob.postDate || getLocalDateStr());
      setEditStartDate(editingJob.startDate || getLocalDateStr());
      setEditIsPosted(editingJob.isPosted !== false);
      setEditNote(editingJob.note || '');
      setEditWhtRate(editingJob.whtRate || 0);
      setEditExcludeHolidays(editingJob.excludeHolidays || false);
      setEditInstallments(editingJob.installments || []);
      setEditCustomTypeInput('');
      setEditCustomStatusLabelInput('');
      setEditCustomStatusBehavior('pending');
      setEditFormStep(1);
      setEditCanSubmit(false);
    }
  }, [editingJob]);

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

  React.useEffect(() => {
    if (editFormStep === 3) {
      setEditCanSubmit(false);
      const timer = setTimeout(() => {
        setEditCanSubmit(true);
      }, 500); // 500ms debounce to prevent accidental double-click / click carry-over
      return () => clearTimeout(timer);
    } else {
      setEditCanSubmit(false);
    }
  }, [editFormStep]);

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Intercept submit keypresses for multi-step flow
    if (editFormStep < 3) {
      if (editFormStep === 1) {
        if (!editName.trim()) {
          triggerAlert(t('jobs.alertNameRequiredTitle'), t('jobs.alertNameRequiredMsg'));
          return;
        }
      }
      if (editFormStep === 2) {
        const val = parseFloat(editValue);
        if (!editValue.trim() || isNaN(val) || val < 0) {
          triggerAlert(t('jobs.alertValueRequiredTitle'), t('jobs.alertValueRequiredMsg'));
          return;
        }
      }
      setEditFormStep(prev => prev + 1);
      return;
    }

    // Block submission if step 3 is not yet ready (debounce)
    if (editFormStep === 3 && !editCanSubmit) {
      return;
    }

    if (!editingJob || !editName.trim()) return;

    let finalType = editType;
    if (editType === '__custom__') {
      const trimmed = editCustomTypeInput.trim();
      if (!trimmed) {
        triggerAlert(t('jobs.alertTypeRequiredTitle'), t('jobs.alertTypeRequiredMsg'));
        return;
      }
      finalType = trimmed;
      if (!jobTypes.includes(trimmed)) {
        setJobTypes(prev => [...prev, trimmed]);
      }
    }

    let finalStatus = editStatus;
    let behavior: 'done' | 'partial' | 'pending' = 'pending';
    if (editStatus === '__custom__') {
      const labelTrimmed = editCustomStatusLabelInput.trim();
      if (!labelTrimmed) {
        triggerAlert(t('jobs.alertStatusNameRequiredTitle'), t('jobs.alertStatusNameRequiredMsg'));
        return;
      }
      finalStatus = `status-${Date.now()}`;
      behavior = editCustomStatusBehavior;
      const newStatusOpt: StatusOption = {
        id: finalStatus,
        label: labelTrimmed,
        behavior: editCustomStatusBehavior
      };
      setStatuses(prev => [...prev, newStatusOpt]);
    } else {
      const matched = statuses.find(s => s.id === editStatus);
      behavior = matched ? matched.behavior : 'pending';
    }

    const valueNum = parseFloat(editValue) || 0;
    const whtAmountNum = Math.round(valueNum * (editWhtRate / 100));
    const netReceivable = valueNum - whtAmountNum;
    const normalizedEditInstallments = editStatus === 'installment' ? editInstallments.map((row, index) => ({
      ...row,
      label: row.label.trim() || `งวดที่ ${index + 1}`,
      amount: Number(row.amount) || 0,
    })) : [];
    if (editStatus === 'installment') {
      const installmentTotal = normalizedEditInstallments.reduce((sum, row) => sum + row.amount, 0);
      if (normalizedEditInstallments.length === 0 || Math.abs(installmentTotal - netReceivable) > 0.01) {
        triggerAlert('ยอดแบ่งชำระยังไม่ตรง', `ยอดรวมทุกงวดต้องเท่ากับยอดรับสุทธิ ${formatCurrency(netReceivable)}`);
        return;
      }
    }
    let receivedNum = 0;

    if (behavior === 'done') {
      receivedNum = netReceivable;
    } else if (behavior === 'partial') {
      receivedNum = editStatus === 'installment'
        ? normalizedEditInstallments.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0)
        : parseFloat(editReceived) || 0;
    } else {
      receivedNum = 0; // pending/unspecified
    }
    const pendingNum = Math.max(0, netReceivable - receivedNum);

    const nextInstallmentDue = normalizedEditInstallments
      .filter((row) => row.status !== 'paid' && row.dueDate)
      .map((row) => row.dueDate as string)
      .sort()[0];
    const calculatedPay = editStatus === 'installment'
      ? (nextInstallmentDue || null)
      : calculatePayDate(editPostDate, editCreditTerm, editExcludeHolidays);

    // The quick "ได้เงินครบแล้ว" actions stamp paymentStatus:'paid', and Dashboard's quick-pay list
    // treats that flag as paid regardless of status -- so editing such a job back to unpaid/partial
    // here has to move the flag with it, or it silently vanishes from that list. Only touched when
    // an existing flag would disagree with the chosen status, so ordinary edits of untouched jobs
    // don't emit a spurious "paid" change (which would fire a LINE notification).
    const derivedPaymentStatus = behavior === 'done' || (netReceivable > 0 && receivedNum >= netReceivable)
      ? 'paid'
      : behavior === 'partial' && receivedNum > 0 ? 'partial' : 'unpaid';
    const paymentStatusPatch = editingJob.paymentStatus && editingJob.paymentStatus !== derivedPaymentStatus
      ? { paymentStatus: derivedPaymentStatus }
      : {};

    onEditJob(editingJob.id, {
      ...paymentStatusPatch,
      name: editName,
      type: finalType,
      client: editClient,
      value: valueNum,
      received: receivedNum,
      pending: pendingNum,
      status: finalStatus,
      creditTerm: editCreditTerm,
      postDate: editPostDate,
      startDate: editStartDate,
      isPosted: editIsPosted,
      payDate: calculatedPay,
      note: editNote,
      hoursSpent: editHoursSpent.trim() ? parseFloat(editHoursSpent) : undefined,
      whtRate: editWhtRate,
      whtAmount: whtAmountNum,
      excludeHolidays: editExcludeHolidays,
      installments: normalizedEditInstallments
    });

    triggerAlert(t('jobs.alertEditSuccessTitle'), t('jobs.alertEditSuccessMsg'));
    setEditingJob(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Intercept submit keypresses for multi-step flow
    if (formStep < 3) {
      if (formStep === 1) {
        if (!formName.trim()) {
          triggerAlert(t('jobs.alertNameRequiredTitle'), t('jobs.alertNameRequiredMsg'));
          return;
        }
      }
      if (formStep === 2) {
        const val = parseFloat(formValue);
        if (!formValue.trim() || isNaN(val) || val < 0) {
          triggerAlert(t('jobs.alertValueRequiredTitle'), t('jobs.alertValueRequiredMsg'));
          return;
        }
      }
      setFormStep(prev => prev + 1);
      return;
    }

    // Block submission if step 3 is not yet ready (debounce)
    if (formStep === 3 && !canSubmit) {
      return;
    }

    if (!formName.trim()) {
      triggerAlert(t('jobs.alertNameRequiredTitle'), t('jobs.alertNameRequiredMsgFinal'));
      return;
    }

    // formPostDate starts blank on purpose (see its useState comment) -- for a posted job it
    // feeds payDate/monthly reporting directly, so it can't be left empty like formStartDate can.
    if (formIsPosted && !formPostDate) {
      triggerAlert(t('jobs.alertPostDateRequiredTitle'), t('jobs.alertPostDateRequiredMsg'));
      return;
    }

    let finalType = formType;
    if (formType === '__custom__') {
      const trimmed = customTypeInput.trim();
      if (!trimmed) {
        triggerAlert(t('jobs.alertTypeRequiredTitle'), t('jobs.alertTypeRequiredMsg'));
        return;
      }
      finalType = trimmed;
      if (!jobTypes.includes(trimmed)) {
        setJobTypes(prev => [...prev, trimmed]);
      }
    }

    let finalStatus = formStatus;
    let behavior: 'done' | 'partial' | 'pending' = 'pending';
    if (formStatus === '__custom__') {
      const labelTrimmed = customStatusLabelInput.trim();
      if (!labelTrimmed) {
        triggerAlert(t('jobs.alertStatusNameRequiredTitle'), t('jobs.alertStatusNameRequiredMsg'));
        return;
      }
      finalStatus = `status-${Date.now()}`;
      behavior = customStatusBehavior;
      const newStatusOpt: StatusOption = {
        id: finalStatus,
        label: labelTrimmed,
        behavior: customStatusBehavior
      };
      setStatuses(prev => [...prev, newStatusOpt]);
    } else {
      const matched = statuses.find(s => s.id === formStatus);
      behavior = matched ? matched.behavior : 'pending';
    }

    const valueNum = parseFloat(formValue) || 0;
    const whtAmountNum = Math.round(valueNum * (formWhtRate / 100));
    const netReceivable = valueNum - whtAmountNum;
    const normalizedInstallments = formStatus === 'installment' ? formInstallments.map((row, index) => ({
      ...row,
      label: row.label.trim() || `งวดที่ ${index + 1}`,
      amount: Number(row.amount) || 0,
    })) : [];
    if (formStatus === 'installment') {
      const installmentTotal = normalizedInstallments.reduce((sum, row) => sum + row.amount, 0);
      if (normalizedInstallments.length === 0 || Math.abs(installmentTotal - netReceivable) > 0.01) {
        triggerAlert('ยอดแบ่งชำระยังไม่ตรง', `ยอดรวมทุกงวดต้องเท่ากับยอดรับสุทธิ ${formatCurrency(netReceivable)}`);
        return;
      }
    }
    let receivedNum = 0;
    if (behavior === 'done') {
      receivedNum = netReceivable;
    } else if (behavior === 'partial') {
      receivedNum = formStatus === 'installment'
        ? normalizedInstallments.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0)
        : parseFloat(formReceived) || 0;
    } else {
      receivedNum = 0; // pending/unspecified
    }
    const pendingNum = Math.max(0, netReceivable - receivedNum);

    const nextInstallmentDue = normalizedInstallments
      .filter((row) => row.status !== 'paid' && row.dueDate)
      .map((row) => row.dueDate as string)
      .sort()[0];
    const payDateCalculated = formStatus === 'installment'
      ? (nextInstallmentDue || null)
      : calculatePayDate(formPostDate, formCreditTerm, formExcludeHolidays);
    const derivedPaymentStatus = behavior === 'done' || (netReceivable > 0 && receivedNum >= netReceivable)
      ? 'paid'
      : behavior === 'partial' && receivedNum > 0 ? 'partial' : 'unpaid';

    onAddJob({
      name: formName,
      type: finalType,
      client: formClient,
      value: valueNum,
      received: receivedNum,
      pending: pendingNum,
      status: finalStatus,
      creditTerm: formCreditTerm,
      postDate: formPostDate,
      startDate: formStartDate,
      isPosted: formIsPosted,
      payDate: payDateCalculated,
      paymentStatus: derivedPaymentStatus,
      note: formNote,
      hoursSpent: formHoursSpent.trim() ? parseFloat(formHoursSpent) : undefined,
      whtRate: formWhtRate,
      whtAmount: whtAmountNum,
      excludeHolidays: formExcludeHolidays,
      installments: normalizedInstallments
    });

    // Reset Form
    setFormName('');
    setFormClient('');
    setFormValue('');
    setFormReceived('');
    setFormHoursSpent('');
    setFormStatus('pending');
    setFormType('ยังไม่ระบุ');
    setCustomTypeInput('');
    setCustomStatusLabelInput('');
    setCustomStatusBehavior('pending');
    setFormCreditTerm(0);
    setFormPostDate('');
    setFormStartDate(getLocalDateStr());
    setFormIsPosted(false);
    setFormNote('');
    setFormWhtRate(0);
    setFormExcludeHolidays(false);
    setFormInstallments([]);
    setFormStep(1);
    onCloseAddJob();
  };

  // Helper to get category tag color
  const getCategoryColor = (type: string) => {
    switch (type) {
      case 'Sponsored':
      case 'Sponsored Post':
        return { bg: 'bg-indigo-50 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-300', dot: 'bg-indigo-600' };
      case 'Video Production':
        return { bg: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-300', dot: 'bg-emerald-600' };
      case 'Digital Product':
        return { bg: 'bg-purple-50 border-purple-100 dark:bg-purple-500/10 dark:border-purple-500/20', text: 'text-purple-600 dark:text-purple-300', dot: 'bg-purple-600' };
      case 'Consulting':
      case 'Consulting / Advisory':
        return { bg: 'bg-amber-50 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20', text: 'text-amber-600 dark:text-amber-300', dot: 'bg-amber-600' };
      default:
        return { bg: 'bg-cyan-50 border-cyan-100 dark:bg-cyan-500/10 dark:border-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-300', dot: 'bg-cyan-600' };
    }
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

  // Counts for each sub-tab
  const totalCount = jobs.length;
  const wipCount = jobs.filter(j => j.isPosted === false).length;
  const postedCount = jobs.filter(j => j.isPosted !== false).length;

  // Filter & Search Jobs logic
  const filteredJobs = jobs.filter(j => {
    const matchesSearch = j.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          j.client.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || j.status === statusFilter;
    const matchesType = typeFilter === 'all' || j.type === typeFilter;
    const matchesSubTab = subTab === 'all' || 
                          (subTab === 'wip' && j.isPosted === false) || 
                          (subTab === 'posted' && j.isPosted !== false);
    return matchesSearch && matchesStatus && matchesType && matchesSubTab;
  });

  return (
    <div className="page-content space-y-6">
      {/* Primary action: the page title and mode switch live in App.tsx. */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-bold text-brand-text">งานดีลทั้งหมด <span className="text-brand-muted">({jobs.length})</span></p>
        <div className="flex items-center gap-2 shrink-0">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              // Ensure form values are clean
              setFormName('');
              setFormClient('');
              setFormValue('');
              setFormReceived('');
              setFormStatus('pending');
              setFormType('ยังไม่ระบุ');
              setCustomTypeInput('');
              setCustomStatusLabelInput('');
              setCustomStatusBehavior('pending');
              setFormCreditTerm(0);
              setFormPostDate('');
              setFormStartDate(getLocalDateStr());
              setFormIsPosted(false);
              setFormNote('');
              setFormWhtRate(0);
              setFormStep(1);
              onOpenAddJob();
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Briefcase className="w-3.5 h-3.5" /> {t('jobs.addNew')}
          </motion.button>
        </div>
      </div>

      {/* 2. Search & Filters Bar */}
      <div className="space-y-3 bg-brand-white border border-brand-border rounded-[var(--radius-lg)] p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            placeholder={t('jobs.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-brand-faint text-xs text-brand-text placeholder-brand-muted rounded-xl pl-10 pr-4 py-3 outline-none border border-transparent focus:border-emerald-500/50 transition-all font-medium"
          />
          </div>
          <button type="button" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters} className={`shrink-0 rounded-xl border px-3 py-3 text-xs font-bold transition-colors ${showFilters || statusFilter !== 'all' || typeFilter !== 'all' ? 'border-[#D98324]/40 bg-[#D98324]/10 text-[#9A541C]' : 'border-brand-border bg-brand-white text-brand-muted hover:bg-brand-faint'}`}>
            <Filter className="inline h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">ตัวกรอง</span>
          </button>
        </div>

        {showFilters && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-brand-faint px-3 py-2 rounded-xl border border-brand-border/40">
            <Filter className="w-3.5 h-3.5 text-brand-muted shrink-0" />
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="w-full bg-transparent text-xs font-semibold text-brand-text outline-none cursor-pointer"
            >
              <option value="all">{t('jobs.filterStatusAll')}</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 bg-brand-faint px-3 py-2 rounded-xl border border-brand-border/40">
            <Briefcase className="w-3.5 h-3.5 text-brand-muted shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full bg-transparent text-xs font-semibold text-brand-text outline-none cursor-pointer"
            >
              <option value="all">{t('jobs.filterTypeAll')}</option>
              {Array.from(new Set(jobTypes)).filter(Boolean).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              {uniqueTypes.filter(ut => !jobTypes.includes(ut)).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>}
      </div>



      {/* Sub-tab Navigation Selector */}
      <div className="flex flex-col sm:flex-row bg-brand-white border border-brand-border rounded-2xl p-1.5 gap-1.5 shadow-2xs">
        <button
          onClick={() => setSubTab('all')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
            subTab === 'all'
              ? 'bg-brand-faint border border-brand-border/40 text-brand-text shadow-3xs'
              : 'text-brand-muted hover:text-brand-text'
          }`}
        >
          {t('jobs.tabAll', { count: totalCount })}
        </button>
        <button
          onClick={() => setSubTab('wip')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
            subTab === 'wip'
              ? 'bg-brand-faint border border-brand-border/40 text-brand-text shadow-3xs'
              : 'text-brand-muted hover:text-brand-text'
          }`}
        >
          {t('jobs.tabWip', { count: wipCount })}
        </button>
        <button
          onClick={() => setSubTab('posted')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl text-xs font-black transition-all cursor-pointer select-none ${
            subTab === 'posted'
              ? 'bg-brand-faint border border-brand-border/40 text-brand-text shadow-3xs'
              : 'text-brand-muted hover:text-brand-text'
          }`}
        >
          {t('jobs.tabPosted', { count: postedCount })}
        </button>
      </div>

      {/* 3. Jobs List */}
      <div className="space-y-3">
        {filteredJobs.length === 0 ? (
          <div className="bg-brand-white border border-brand-border rounded-[var(--radius-lg)] p-10 text-center text-brand-muted flex flex-col items-center justify-center gap-3">
            <Mascot mood="sleepy" size={100} />
            <div>
              <p className="text-xs font-semibold text-brand-text">{t('jobs.emptyTitle')}</p>
              <p className="text-[10px] mt-1">{t('jobs.emptyHint')}</p>
            </div>
          </div>
        ) : (
          filteredJobs.map(j => {
            const catColors = getCategoryColor(j.type);
            const relText = getRelativeDaysText(j.payDate || j.postDate);
            const showPayCountdown = j.pending > 0 && j.payDate && j.isPosted !== false;

            return (
              <motion.div
                key={j.id}
                id={`job-card-${j.id}`}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`bg-brand-white border rounded-[var(--radius-lg)] p-5 space-y-4 hover:shadow-md transition-shadow relative overflow-hidden ${
                  highlightedJobId === j.id
                    ? 'border-[#E65F2B] ring-2 ring-[#E65F2B]/40'
                    : 'border-brand-border'
                }`}
              >
                {/* Visual Accent bar on the left */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${catColors.dot}`} />

                {/* Job Info Header — name + amount are the two things that should read first */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-lg font-extrabold text-brand-text leading-snug truncate">
                      {j.name}
                    </h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-brand-muted font-medium flex-wrap">
                      <span>{j.type}</span>
                      {j.client && (
                        <>
                          <span className="opacity-40">•</span>
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{j.client}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-2xl font-black font-mono text-brand-text">
                      {formatCurrency(j.value)}
                    </p>
                  </div>
                </div>

                {/* Status badges — the one row that says what state this job is in */}
                <div className="flex items-center gap-2 flex-wrap">
                  {j.isPosted === false && (
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-brand-faint text-brand-muted">
                      {t('jobs.badgeWip')}
                    </span>
                  )}
                  {(() => {
                    const statusInfo = getStatusDisplay(j.status);
                    const isDone = statusInfo.behavior === 'done';
                    const isPartial = statusInfo.behavior === 'partial';
                    return (
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                        isDone
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                          : isPartial
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                      }`}>
                        {statusInfo.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Dates & Credit Terms or WIP section — one quiet line, not a boxed grid */}
                {j.isPosted === false ? (
                  <div className="flex items-center gap-2 text-[11px] text-brand-muted font-medium border-t border-brand-faint pt-3 flex-wrap">
                    <span>{t('jobs.startedOn', { date: safeFormatThaiDate(j.startDate || j.postDate, { day: 'numeric', month: 'short' }) })}</span>
                    <span className="opacity-40">|</span>
                    <span>{j.postDate ? t('jobs.targetOnAir', { date: safeFormatThaiDate(j.postDate, { day: 'numeric', month: 'short' }) }) : t('jobs.statusUnspecifiedLabel')}</span>
                    <span className="opacity-40">|</span>
                    <span className="font-bold">
                      {t('jobs.creditColon', { text: j.creditTerm === 0 ? t('jobs.creditImmediate') : t('jobs.creditDaysSuffix', { n: j.creditTerm }) })}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-brand-muted font-medium border-t border-brand-faint pt-3 flex-wrap">
                    <span>{t('jobs.dealDate', { date: safeFormatThaiDate(j.postDate) })}</span>
                    <span className="opacity-40">|</span>
                    {j.creditTerm === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('jobs.noCreditLabel')}</span>
                    ) : (
                      <>
                        <span className="font-bold">{t('jobs.creditDaysLabel', { n: j.creditTerm })}</span>
                        {j.payDate && (
                          <span>{t('jobs.dueDateParen', { date: safeFormatThaiDate(j.payDate, { day: 'numeric', month: 'short' }) })}</span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Financial breakdown — full value is already shown up top, so only the two numbers that move */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-brand-faint p-2.5 rounded-xl">
                    <span className="text-[9px] text-brand-muted uppercase font-extrabold tracking-wider block">{t('jobs.received')}</span>
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">{formatCurrency(j.received)}</span>
                  </div>
                  <div className={`p-2.5 rounded-xl ${j.pending > 0 ? 'bg-amber-500/10' : 'bg-brand-faint'}`}>
                    <span className={`text-[9px] uppercase font-extrabold tracking-wider block ${j.pending > 0 ? 'text-amber-600 dark:text-amber-400/80' : 'text-brand-muted'}`}>{t('jobs.pendingAmount')}</span>
                    <span className={`font-extrabold font-mono text-sm ${j.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-muted'}`}>
                      {formatCurrency(j.pending)}
                    </span>
                  </div>
                </div>

                {j.whtRate && j.whtRate > 0 ? (
                  <div className="flex items-center justify-between text-[10px] bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl text-amber-800 dark:text-amber-400 font-bold leading-none select-none">
                    <span className="flex items-center gap-1">{t('jobs.whtDeducted', { rate: j.whtRate })}</span>
                    <span className="font-mono">-{formatCurrency(j.whtAmount || 0)}</span>
                  </div>
                ) : null}

                {/* Pay date countdown badge */}
                {showPayCountdown && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between font-semibold border ${
                    relText.isOverdue
                      ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-100/40 dark:border-rose-500/10'
                      : 'bg-amber-50/50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-100/40 dark:border-amber-500/10'
                  }`}>
                    <span className="flex items-center gap-1">
                      <Clock className={`w-4 h-4 shrink-0 ${relText.isOverdue ? 'text-rose-500' : 'text-amber-500'}`} /> {t('jobs.timeUntilDue')}
                    </span>
                    <span className="font-black">{relText.text}</span>
                  </div>
                )}

                {/* WIP countdown badge */}
                {j.isPosted === false && j.postDate && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between font-semibold border ${
                    getRelativeDaysText(j.postDate).isOverdue
                      ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-100/40 dark:border-rose-500/10'
                      : 'bg-brand-faint text-brand-text border-brand-border/40'
                  }`}>
                    <span className="flex items-center gap-1">
                      <Clock className={`w-4 h-4 shrink-0 ${getRelativeDaysText(j.postDate).isOverdue ? 'text-rose-500' : 'text-brand-muted'}`} /> {t('jobs.productionTimeLeft')}
                    </span>
                    <span className="font-black">{getRelativeDaysText(j.postDate).text}</span>
                  </div>
                )}

                {j.note && (
                  <p className="text-xs text-brand-muted bg-brand-faint p-2.5 rounded-xl border border-brand-border/40 italic">
                    {t('jobs.noteLabel', { note: j.note })}
                  </p>
                )}

                {/* Mini Interaction row */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const statusInfo = getStatusDisplay(j.status);
                      const isDone = statusInfo.behavior === 'done';
                      const isPending = statusInfo.behavior === 'pending';
                      const isInstallment = j.status === 'installment' && Boolean(j.installments?.length);
                      const pendingInstallments = (j.installments || []).filter((row) => row.status !== 'paid');
                      return (
                        <>
                          {j.isPosted === false && (
                            <button
                              onClick={() => {
                                // A single direct save, no detour through the edit modal -- that
                                // used to open straight into step 3 to let the user fill in the
                                // delivery date, but its own "บันทึกข้อมูลดีลงาน" save fired a
                                // second, redundant "แก้ไขงาน" LINE notification on top of this
                                // click's own "ดีลงาน" card. Already told us the on-air date when
                                // this job was set up as WIP -- don't ask again or clobber it with
                                // today's date; otherwise default to today (editable later same as
                                // any other field).
                                if (j.postDate) {
                                  onEditJob(j.id, { isPosted: true });
                                  return;
                                }
                                // No postDate captured at WIP creation -- ask for it (and the
                                // credit term) now instead of silently defaulting to today with
                                // no credit term, same single-save path as above (no edit-modal
                                // detour, no second LINE notification).
                                const today = new Date();
                                const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                setDeliveryPostDate(j.postDate || localDateStr);
                                setDeliveryCreditTerm(j.creditTerm || 0);
                                setDeliveryExcludeHolidays(j.excludeHolidays || false);
                                setDeliveryPromptJob(j);
                              }}
                              className="text-xs font-bold text-white bg-[#E65F2B] hover:bg-[#D8551F] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" /> {t('jobs.actionMarkPosted')}
                            </button>
                          )}
                          {isInstallment && pendingInstallments.length > 0 && (
                            <button
                              onClick={() => openInstallmentPayment(j)}
                              className="flex items-center gap-1 rounded-lg bg-[#E65F2B] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#D8551F]"
                            >
                              <WalletCards className="h-3.5 w-3.5" />
                              รับเงินงวดถัดไป
                            </button>
                          )}
                          {isInstallment && pendingInstallments.length === 0 && (
                            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                              <CheckCircle className="h-3.5 w-3.5" /> รับครบทุกงวดแล้ว
                            </span>
                          )}
                          {!isDone && !isInstallment && (
                            <button
                              onClick={() => {
                                const today = new Date();
                                const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                onEditJob(j.id, {
                                  status: 'done',
                                  received: j.value - Math.round(j.value * ((j.whtRate || 0) / 100)),
                                  pending: 0,
                                  paymentStatus: 'paid',
                                  payDate: localDateStr,
                                  isPosted: true
                                });
                              }}
                              className={
                                j.isPosted === false
                                  ? "text-xs font-bold text-brand-muted hover:text-emerald-600 dark:hover:text-emerald-300 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border border-brand-border cursor-pointer"
                                  : "text-xs font-bold text-white bg-[#E65F2B] hover:bg-[#D8551F] px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              }
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> {t('jobs.actionMarkPaidFull')}
                            </button>
                          )}
                          {isPending && !isInstallment && (
                            <button
                              onClick={() => {
                                const partialVal = Math.round(j.value * 0.3); // suggest 30% deposit
                                triggerPrompt(
                                  t('jobs.partialPromptTitle'),
                                  t('jobs.partialPromptMessage', { name: j.name, amount: partialVal.toLocaleString() }),
                                  String(partialVal),
                                  t('jobs.enterAmountPlaceholder'),
                                  'number',
                                  (val) => {
                                    const amt = parseFloat(val) || 0;
                                    if (amt > 0) {
                                      const today = new Date();
                                      const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                      onEditJob(j.id, {
                                        status: 'partial',
                                        received: amt,
                                        pending: Math.max(0, (j.value - Math.round(j.value * ((j.whtRate || 0) / 100))) - amt),
                                        paymentStatus: 'partial',
                                        payDate: localDateStr
                                      });
                                    }
                                  }
                                );
                              }}
                              className="text-xs font-bold text-brand-muted hover:text-amber-600 dark:hover:text-amber-300 px-2.5 py-1.5 rounded-lg transition-colors border border-brand-border cursor-pointer"
                            >
                              {t('jobs.actionMarkPartial')}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingJob(j)}
                      className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 rounded-lg transition-colors cursor-pointer"
                      title={t('jobs.editTooltip')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeleteJob(j.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                      title={t('jobs.deleteTooltip')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

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

      {/* 4. Sliding Bottom Sheet Modal for Adding Job */}
      {createPortal(<AnimatePresence>
        {isAddJobOpen && (
          <div className="fixed inset-0 z-200">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseAddJob}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            />

            {/* Content sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4 font-sans border-t border-brand-border/40"
            >
              {/* Drag indicator */}
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-1 shrink-0" />

              <div className="flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[9px] font-black tracking-wider text-[#E65F2B] dark:text-[#FFA473] uppercase">
                    {t('jobs.stepOf', { step: formStep })}
                  </span>
                  <h3 className="text-lg font-black text-brand-text dark:text-white font-display mt-0.5">
                    {t('jobs.addModalTitle')}
                  </h3>
                </div>
                <button 
                  onClick={onCloseAddJob} 
                  className="w-8 h-8 rounded-full bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-xl text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Progress Stepper Indicator */}
              <div className="flex items-center justify-between py-2 border-b border-brand-border/30 shrink-0">
                {[
                  { step: 1, name: t('jobs.stepDealInfo') },
                  { step: 2, name: t('jobs.stepMoneyTax') },
                  { step: 3, name: t('jobs.stepDelivery') },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                        formStep === s.step
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : formStep > s.step
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-brand-faint dark:bg-stone-850 border border-brand-border/60 text-brand-muted'
                      }`}
                    >
                      {formStep > s.step ? <IconCheck className="w-3 h-3" /> : s.step}
                    </div>
                    <span
                      className={`text-[10px] font-black transition-all ${
                        formStep === s.step
                          ? 'text-brand-text dark:text-white'
                          : 'text-brand-muted'
                      }`}
                    >
                      {s.name}
                    </span>
                    {s.step < 3 && <div className="w-4 h-[1px] bg-brand-border/30 hidden sm:block" />}
                  </div>
                ))}
              </div>

              {/* Guideline / Mascot Advice Balloon */}
              <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/10 border border-emerald-500/15 rounded-2xl p-3.5 flex gap-3 items-start animate-fade-in shrink-0">
                <div className="shrink-0 pt-0.5">
                  <Mascot mood="happy" size={38} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-[10px] font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
                    {t('jobs.mascotAdviceTitle')}
                  </h4>
                  <p className="text-[11px] text-brand-text/80 dark:text-neutral-200 font-medium leading-relaxed">
                    {formStep === 1 && t('jobs.addAdviceStep1')}
                    {formStep === 2 && t('jobs.addAdviceStep2')}
                    {formStep === 3 && t('jobs.addAdviceStep3')}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold flex-1">
                <AnimatePresence mode="wait">
                  {/* STEP 1: Basic Project Info */}
                  {formStep === 1 && (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      {/* Name */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldName')} <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          required
                          placeholder={t('jobs.fieldNamePlaceholder')}
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 transition-all font-medium"
                        />
                      </div>

                      {/* Brand Client */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldClient')}</label>
                        <input
                          type="text"
                          placeholder={t('jobs.fieldClientPlaceholder')}
                          value={formClient}
                          onChange={(e) => setFormClient(e.target.value)}
                          className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 transition-all font-medium"
                        />
                      </div>

                      <JobTypeSelector
                        value={formType}
                        onChange={(value) => {
                          setFormType(value);
                          if (value !== '__custom__') setCustomTypeInput('');
                        }}
                        customInput={customTypeInput}
                        onCustomInputChange={setCustomTypeInput}
                        jobTypes={jobTypes}
                        setJobTypes={setJobTypes}
                      />

                      {/* Legacy category controls retained for data compatibility; replaced by the organized selector above. */}
                      <div className="hidden">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldType')}</label>

                        <div className="space-y-2.5">
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-extrabold text-brand-muted uppercase tracking-wider">{t('jobs.typeBasicLabel')}</p>
                            <div className="p-3 bg-brand-white dark:bg-stone-800 border border-brand-border/50 rounded-2xl flex flex-wrap gap-1.5">
                              {['ยังไม่ระบุ', ...DEFAULT_JOB_TYPES].map(t => {
                                const isSelected = formType === t;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                      setFormType(t);
                                      setCustomTypeInput('');
                                    }}
                                    className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                                      isSelected
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                                        : 'bg-brand-faint dark:bg-stone-900 border-brand-border/50 hover:border-brand-text/30 text-brand-text dark:text-neutral-300'
                                    }`}
                                  >
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {(() => {
                            const customTypes = Array.from(new Set(jobTypes)).filter(t => t && !DEFAULT_JOB_TYPES.includes(t));
                            return customTypes.length > 0 ? (
                              <div className="space-y-1.5">
                                <p className="text-[9px] font-extrabold text-brand-muted uppercase tracking-wider">{t('jobs.typeCustomLabel')}</p>
                                <div className="p-3 bg-brand-white dark:bg-stone-800 border border-brand-border/50 rounded-2xl flex flex-wrap gap-1.5">
                                  {customTypes.map(tp => {
                                    const isSelected = formType === tp;
                                    return (
                                      <span
                                        key={tp}
                                        className={`pl-3 pr-1.5 py-1 rounded-xl text-[11px] font-black transition-all border flex items-center gap-1 ${
                                          isSelected
                                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                            : 'bg-brand-faint dark:bg-stone-900 border-brand-border/50 text-brand-text dark:text-neutral-300'
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFormType(tp);
                                            setCustomTypeInput('');
                                          }}
                                          className="cursor-pointer"
                                        >
                                          {tp}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setJobTypes(prev => prev.filter(x => x !== tp));
                                            if (formType === tp) setFormType('ยังไม่ระบุ');
                                          }}
                                          className={`p-0.5 rounded-full cursor-pointer transition-colors ${isSelected ? 'hover:bg-white/20' : 'text-brand-muted hover:bg-rose-500/10 hover:text-rose-600'}`}
                                          title={t('jobs.removeTypeTooltip')}
                                        >
                                          <IconClose className="w-2.5 h-2.5" />
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          <button
                            type="button"
                            onClick={() => {
                              setFormType('__custom__');
                            }}
                            className={`px-3 py-2.5 rounded-2xl text-[11px] font-black transition-all cursor-pointer border flex items-center justify-center gap-1 border-dashed w-full ${
                              formType === '__custom__'
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                : 'bg-brand-white dark:bg-stone-800 border-brand-border/60 hover:border-brand-text/30 text-brand-text dark:text-neutral-300'
                            }`}
                          >
                            {t('jobs.addCustomType')}
                          </button>
                        </div>

                        {formType === '__custom__' && (
                          <div className="animate-fade-in space-y-2 bg-emerald-500/5 dark:bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/15">
                            <label className="text-[10px] text-emerald-800 dark:text-emerald-400 font-extrabold uppercase block">{t('jobs.customTypeNameLabel')}</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder={t('jobs.customTypePlaceholder')}
                                value={customTypeInput}
                                onChange={(e) => setCustomTypeInput(e.target.value)}
                                className="flex-1 bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-semibold"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = customTypeInput.trim();
                                  if (trimmed) {
                                    if (!jobTypes.includes(trimmed)) {
                                      setJobTypes(prev => [...prev, trimmed]);
                                    }
                                    setFormType(trimmed);
                                    setCustomTypeInput('');
                                  }
                                }}
                                className="px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black cursor-pointer transition-colors"
                              >
                                {t('jobs.confirmOk')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 2: Money, Taxes, Progress, Terms, and Notes */}
                  {formStep === 2 && (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {/* Contract value */}
                        <div className="space-y-1.5 col-span-2">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldValue')} <span className="text-rose-500">*</span></label>
                          <NumberInput
                            required
                            placeholder={t('jobs.fieldValuePlaceholder')}
                            value={formValue}
                            onChange={setFormValue}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm font-black text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                          />
                        </div>

                        {/* Hours spent (optional, for ฿/hour insight) */}
                        <div className="space-y-1.5 col-span-2">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldHours')}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder={t('jobs.fieldHoursPlaceholder')}
                            value={formHoursSpent}
                            onChange={(e) => setFormHoursSpent(e.target.value)}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm font-black text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                          />
                        </div>
                      </div>

                      <WithholdingTaxSelector rate={formWhtRate} onChange={setFormWhtRate} value={formValue} />

                      {/* Legacy tax controls are kept hidden while saved records remain compatible. */}
                      <div className="hidden">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">
                          {t('jobs.fieldWht')}
                        </label>
                        <div className="relative">
                          <select
                            value={formWhtRate}
                            onChange={(e) => setFormWhtRate(Number(e.target.value))}
                            className="w-full appearance-none bg-brand-white dark:bg-stone-900 text-sm font-bold text-brand-text dark:text-white rounded-xl py-3.5 pl-3.5 pr-10 outline-none border border-brand-border/50 focus:border-emerald-500 cursor-pointer transition-colors"
                          >
                            <option value={0}>{t('jobs.wht0')}</option>
                            <option value={1}>{t('jobs.wht1')}</option>
                            <option value={3}>{t('jobs.wht3')}</option>
                            <option value={5}>{t('jobs.wht5')}</option>
                          </select>
                          <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      {/* Project Status -- one segmented control instead of a card grid, with
                          "other" pulled out as its own subtle radio rather than another segment */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">
                          {t('jobs.fieldProjectStatus')} <span className="text-rose-500">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-faint p-1 dark:bg-stone-850 sm:grid-cols-4">
                          {statuses.map(s => {
                            const isSelected = formStatus === s.id;
                            const activeColor =
                              s.behavior === 'done'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : s.behavior === 'partial'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400';
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setFormStatus(s.id);
                                  if (s.behavior === 'done') {
                                    setFormReceived(formValue);
                                  } else if (s.behavior === 'partial') {
                                    if (parseFloat(formReceived) === parseFloat(formValue)) {
                                      setFormReceived('');
                                    }
                                  } else {
                                    setFormReceived('0');
                                  }
                                }}
                                className={`min-w-0 py-2.5 px-1.5 rounded-lg text-center text-[11px] font-black transition-all cursor-pointer truncate ${
                                  isSelected ? `${activeColor} shadow-xs` : 'text-brand-muted hover:text-brand-text'
                                }`}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                        <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            checked={formStatus === '__custom__'}
                            onChange={() => setFormStatus('__custom__')}
                            className="w-3.5 h-3.5 accent-[#E65F2B] cursor-pointer"
                          />
                          <span className={`text-[11px] font-bold ${formStatus === '__custom__' ? 'text-[#E65F2B]' : 'text-brand-muted'}`}>
                            {t('jobs.customStatusOption')}
                          </span>
                        </label>
                      </div>

                      {/* Live calculated mockup tax receipt */}
                      <div className="hidden">
                        <div className="flex items-center justify-between text-[10px] text-brand-muted dark:text-neutral-400 font-black uppercase">
                          <span>{t('jobs.taxReceiptTitle')}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.grossValueLabel')}</div>
                          <div className="text-right font-black font-mono dark:text-white">฿{(parseFloat(formValue) || 0).toLocaleString()}</div>
                          
                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.whtDeductedLabel', { rate: formWhtRate })}</div>
                          <div className="text-right font-black font-mono text-amber-600 dark:text-amber-400">- ฿{Math.round((parseFloat(formValue) || 0) * (formWhtRate / 100)).toLocaleString()}</div>

                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.netAfterTaxLabel')}</div>
                          <div className="text-right font-black font-mono text-emerald-600 dark:text-emerald-400">
                            ฿{( (parseFloat(formValue) || 0) - Math.round((parseFloat(formValue) || 0) * (formWhtRate / 100)) ).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Custom Status Setup */}
                      {formStatus === '__custom__' && (
                        <div className="bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/15 rounded-2xl p-3.5 space-y-3 animate-fade-in mt-2">
                          <div>
                            <label className="text-[10px] text-purple-800 dark:text-purple-400 font-extrabold uppercase block mb-1">{t('jobs.customStatusNameLabelAdd')}</label>
                            <input
                              type="text"
                              required
                              placeholder={t('jobs.customStatusNamePlaceholderAdd')}
                              value={customStatusLabelInput}
                              onChange={(e) => setCustomStatusLabelInput(e.target.value)}
                              className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-purple-800 dark:text-purple-400 font-extrabold uppercase block mb-1">{t('jobs.customStatusBehaviorLabelAdd')}</label>
                            <select
                              value={customStatusBehavior}
                              onChange={(e: any) => {
                                const b = e.target.value;
                                setCustomStatusBehavior(b);
                                if (b === 'done') {
                                  setFormReceived(formValue);
                                } else if (b === 'partial') {
                                  if (parseFloat(formReceived) === parseFloat(formValue)) {
                                    setFormReceived('');
                                  }
                                } else {
                                  setFormReceived('0');
                                }
                              }}
                              className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white rounded-xl p-2.5 outline-none border border-brand-border/40 cursor-pointer font-semibold"
                            >
                              <option value="pending">{t('jobs.statusOptPending')}</option>
                              <option value="partial">{t('jobs.statusOptPartialAdd')}</option>
                              <option value="done">{t('jobs.statusOptDoneAdd')}</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Received Deposit input - shown only if status is "partial" */}
                      {formStatus !== 'installment' && (formStatus === 'partial' ||
                        (formStatus !== '__custom__' && statuses.find(s => s.id === formStatus)?.behavior === 'partial') ||
                        (formStatus === '__custom__' && customStatusBehavior === 'partial')) && (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{formStatus === 'installment' ? 'ยอดที่ได้รับแล้วจากทุกงวด (฿)' : t('jobs.fieldReceivedNow')}</label>
                          <NumberInput
                            placeholder={formStatus === 'installment' ? 'เช่น 15000' : t('jobs.fieldReceivedNowPlaceholder')}
                            value={formReceived}
                            onChange={setFormReceived}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                          />
                        </div>
                      )}

                      {formStatus === 'installment' && (
                        <InstallmentPlanner
                          installments={formInstallments}
                          onChange={setFormInstallments}
                          targetAmount={Math.max(0, (parseFloat(formValue) || 0) - Math.round((parseFloat(formValue) || 0) * (formWhtRate / 100)))}
                        />
                      )}
                    </motion.div>
                  )}

                  {/* STEP 3: Timeline & Terms & Notes */}
                  {formStep === 3 && (
                    <motion.div
                      key="step3"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      <WorkStageSelector isPosted={formIsPosted} onChange={setFormIsPosted} />

                      {/* Legacy WIP vs Posted control retained hidden for state compatibility.
                          highlight instead of two separate boxes, so it reads as a single
                          switch rather than two things to compare and read. */}
                      <div className="hidden">
                        <label className="text-[10px] text-brand-muted dark:text-neutral-400 uppercase tracking-widest font-black block">{t('jobs.currentStatusLabel')}</label>
                        <div className="relative flex bg-brand-faint dark:bg-stone-850 border border-brand-border/60 rounded-2xl p-1">
                          <button
                            type="button"
                            onClick={() => setFormIsPosted(false)}
                            className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                          >
                            {!formIsPosted && (
                              <motion.div
                                layoutId="wip-toggle-add"
                                className="absolute inset-0 bg-amber-500 rounded-xl"
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                              />
                            )}
                            <span className={`relative z-10 text-xs font-black block ${!formIsPosted ? 'text-white' : 'text-brand-text dark:text-neutral-300'}`}>{t('jobs.wipShort')}</span>
                            <span className={`relative z-10 text-[9px] font-bold ${!formIsPosted ? 'text-white/80' : 'text-brand-muted'}`}>{t('jobs.wipSub')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormIsPosted(true)}
                            className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                          >
                            {formIsPosted && (
                              <motion.div
                                layoutId="wip-toggle-add"
                                className="absolute inset-0 bg-emerald-500 rounded-xl"
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                              />
                            )}
                            <span className={`relative z-10 text-xs font-black block ${formIsPosted ? 'text-white' : 'text-brand-text dark:text-neutral-300'}`}>{t('jobs.postedShort')}</span>
                            <span className={`relative z-10 text-[9px] font-bold ${formIsPosted ? 'text-white/80' : 'text-brand-muted'}`}>{t('jobs.postedSub')}</span>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {!formIsPosted ? (
                          <motion.div
                            key="wip-fields"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-4"
                          >
                            {/* วันเริ่มดีลงาน */}
                            <div className="space-y-2 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/15 shadow-2xs overflow-hidden">
                              <div className="flex items-center justify-between">
                                <label className="text-amber-900 dark:text-amber-300 font-extrabold flex items-center gap-1 text-[11px] uppercase tracking-wider"><IconCalendar className="w-3 h-3" /> {t('jobs.startDateLabel')}</label>
                                {formStartDate && (
                                  <button 
                                    type="button"
                                    onClick={() => setFormStartDate('')}
                                    className="text-[10px] font-black text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer flex items-center gap-0.5 transition-colors"
                                  >
                                    <IconClose className="w-2.5 h-2.5" /> {t('jobs.clearDate')}
                                  </button>
                                )}
                              </div>
                              <input
                                type="date"
                                value={formStartDate}
                                onChange={(e) => setFormStartDate(e.target.value)}
                                onClick={(e) => {
                                  try {
                                    e.currentTarget.showPicker();
                                  } catch (err) {
                                    console.log(err);
                                  }
                                }}
                                className="w-full min-w-0 max-w-full bg-brand-white dark:bg-stone-900 text-xs text-brand-text dark:text-white rounded-xl p-3 outline-none border border-brand-border/40 focus:border-amber-500 font-semibold cursor-pointer transition-all"
                              />
                              <p className="text-[10px] text-amber-800/80 dark:text-amber-400/80 leading-relaxed font-medium">
                                {t('jobs.startDateHint')}
                              </p>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-brand-muted dark:text-neutral-300 uppercase tracking-widest font-black flex items-center gap-1"><IconNote className="w-2.5 h-2.5" /> {t('jobs.noteFieldLabel')}</label>
                              <textarea
                                placeholder={t('jobs.noteWipPlaceholder')}
                                rows={3}
                                value={formNote}
                                onChange={(e) => setFormNote(e.target.value)}
                                className="w-full bg-brand-faint dark:bg-stone-850 text-xs text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-amber-500 font-medium leading-relaxed transition-all"
                              />
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="posted-fields"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-4"
                          >
                            {/* วันส่งมอบงาน */}
                            <div className="space-y-2 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/15 shadow-2xs overflow-hidden">
                              <div className="flex items-center justify-between">
                                <label className="text-emerald-900 dark:text-emerald-300 font-extrabold flex items-center gap-1 text-[11px] uppercase tracking-wider"><IconCalendar className="w-3 h-3" /> {t('jobs.deliveryDateLabel')}</label>
                                {formPostDate && (
                                  <button
                                    type="button"
                                    onClick={() => setFormPostDate('')}
                                    className="text-[10px] font-black text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer flex items-center gap-0.5 transition-colors"
                                  >
                                    <IconClose className="w-2.5 h-2.5" /> {t('jobs.clearDate')}
                                  </button>
                                )}
                              </div>
                              <input
                                type="date"
                                value={formPostDate}
                                onChange={(e) => setFormPostDate(e.target.value)}
                                onClick={(e) => {
                                  try {
                                    e.currentTarget.showPicker();
                                  } catch (err) {
                                    console.log(err);
                                  }
                                }}
                                className="w-full min-w-0 max-w-full bg-brand-white dark:bg-stone-900 text-xs text-brand-text dark:text-white rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 font-semibold cursor-pointer transition-all"
                              />

                              {/* Live calculation of Due date and remaining days */}
                              {formPostDate && formCreditTerm > 0 && (
                                <div className="mt-3 p-3 rounded-xl bg-brand-white dark:bg-stone-850 border border-brand-border/50 text-[11px] space-y-2 shadow-2xs">
                                  <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                                    <span className="font-bold inline-flex items-center gap-1"><IconCalendar className="w-3 h-3" /> {t('jobs.dueDateLabel')}</span>
                                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                                      {safeFormatThaiDate(calculatePayDate(formPostDate, formCreditTerm, formExcludeHolidays))}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                                    <span className="font-bold flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-amber-500" /> {t('jobs.timeUntilDueColon')}
                                    </span>
                                    {(() => {
                                      const payDateVal = calculatePayDate(formPostDate, formCreditTerm, formExcludeHolidays);
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
                            <div className="space-y-2.5 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/15 shadow-2xs">
                              <div className="flex items-center justify-between">
                                <label className="text-emerald-900 dark:text-emerald-300 font-extrabold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                                  <IconHourglass className="w-3 h-3" /> {t('jobs.creditTermLabel')}
                                </label>
                                <span className="text-[10px] text-emerald-800 dark:text-emerald-400 font-bold">
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
                                  const isSelected = formCreditTerm === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setFormCreditTerm(opt.value)}
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

                              {formCreditTerm > 0 && (
                                <div className="mt-2.5 pt-2.5 border-t border-emerald-500/10 flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={formExcludeHolidays}
                                      onChange={(e) => setFormExcludeHolidays(e.target.checked)}
                                      className="w-4 h-4 rounded border-brand-border/60 text-[#E65F2B] focus:ring-[#E65F2B] accent-[#E65F2B] cursor-pointer"
                                    />
                                    <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400">
                                      {t('jobs.excludeHolidaysLabel')}
                                    </span>
                                  </label>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold">
                                    {t('jobs.businessDaysOnly')}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-brand-muted dark:text-neutral-300 uppercase tracking-widest font-black flex items-center gap-1"><IconNote className="w-2.5 h-2.5" /> {t('jobs.noteFieldLabel')}</label>
                              <textarea
                                placeholder={t('jobs.notePostedPlaceholder')}
                                rows={3}
                                value={formNote}
                                onChange={(e) => setFormNote(e.target.value)}
                                className="w-full bg-brand-faint dark:bg-stone-850 text-xs text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-medium leading-relaxed transition-all"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom Navigation buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-brand-border/30 shrink-0">
                  {formStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormStep(prev => prev - 1)}
                      className="flex-1 py-3 bg-brand-faint dark:bg-stone-800 hover:bg-brand-border/40 text-brand-text dark:text-neutral-200 border border-brand-border/60 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <IconArrowLeft className="w-3 h-3" /> {t('jobs.back')}
                    </button>
                  )}
                  
                  {formStep < 3 ? (
                    <button
                      key="btn-next"
                      type="button"
                      onClick={() => {
                        if (formStep === 1) {
                          if (!formName.trim()) {
                            triggerAlert(t('jobs.alertNameRequiredTitle'), t('jobs.alertNameRequiredMsg'));
                            return;
                          }
                        }
                        if (formStep === 2) {
                          const val = parseFloat(formValue);
                          if (!formValue.trim() || isNaN(val) || val < 0) {
                            triggerAlert(t('jobs.alertValueRequiredTitle'), t('jobs.alertValueRequiredMsg'));
                            return;
                          }
                        }
                        setFormStep(prev => prev + 1);
                      }}
                      className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      {t('jobs.next')} <IconArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      key="btn-submit"
                      type="submit"
                      disabled={!canSubmit}
                      className={`flex-2 py-3 text-white rounded-xl text-xs font-black transition-all text-center shadow-sm ${
                        canSubmit 
                          ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer' 
                          : 'bg-emerald-600/50 cursor-not-allowed opacity-75'
                      }`}
                    >
                      {t('jobs.saveNewJob')}
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}

      {/* 5. Sliding Bottom Sheet Modal for Editing Job */}
      {createPortal(<AnimatePresence>
        {editingJob && (
          <div className="fixed inset-0 z-200">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingJob(null)}
              className="absolute inset-0 bg-black/45 backdrop-blur-xs"
            />

            {/* Content sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4 font-sans border-t border-brand-border/40"
            >
              {/* Drag indicator */}
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-1 shrink-0" />

              <div className="flex justify-between items-center shrink-0">
                <div>
                  <span className="text-[9px] font-black tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                    {t('jobs.stepOf', { step: editFormStep })}
                  </span>
                  <h3 className="text-lg font-black text-brand-text dark:text-white font-display mt-0.5">
                    {t('jobs.editModalTitle')}
                  </h3>
                </div>
                <button 
                  onClick={() => setEditingJob(null)} 
                  className="w-8 h-8 rounded-full bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-xl text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors cursor-pointer"
                >
                  ×
                </button>
              </div>

              {/* Progress Stepper Indicator */}
              <div className="flex items-center justify-between py-2 border-b border-brand-border/30 shrink-0">
                {[
                  { step: 1, name: t('jobs.stepDealInfo') },
                  { step: 2, name: t('jobs.stepMoneyTax') },
                  { step: 3, name: t('jobs.stepDelivery') },
                ].map((s) => (
                  <div key={s.step} className="flex items-center gap-2">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                        editFormStep === s.step
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : editFormStep > s.step
                          ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                          : 'bg-brand-faint dark:bg-stone-850 border border-brand-border/60 text-brand-muted'
                      }`}
                    >
                      {editFormStep > s.step ? <IconCheck className="w-3 h-3" /> : s.step}
                    </div>
                    <span
                      className={`text-[10px] font-black transition-all ${
                        editFormStep === s.step
                          ? 'text-brand-text dark:text-white'
                          : 'text-brand-muted'
                      }`}
                    >
                      {s.name}
                    </span>
                    {s.step < 3 && <div className="w-4 h-[1px] bg-brand-border/30 hidden sm:block" />}
                  </div>
                ))}
              </div>

              {/* Guideline / Mascot Advice Balloon */}
              <div className="bg-gradient-to-r from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-500/15 rounded-2xl p-3.5 flex gap-3 items-start animate-fade-in shrink-0">
                <div className="shrink-0 pt-0.5">
                  <Mascot mood="happy" size={38} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-[10px] font-black text-indigo-800 dark:text-indigo-400 uppercase tracking-wider">
                    {t('jobs.mascotAdviceTitle')}
                  </h4>
                  <p className="text-[11px] text-brand-text/80 dark:text-neutral-200 font-medium leading-relaxed">
                    {editFormStep === 1 && t('jobs.editAdviceStep1')}
                    {editFormStep === 2 && t('jobs.editAdviceStep2')}
                    {editFormStep === 3 && t('jobs.editAdviceStep3')}
                  </p>
                </div>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 text-xs font-semibold flex-1">
                <AnimatePresence mode="wait">
                  {/* STEP 1: Basic Project Info */}
                  {editFormStep === 1 && (
                    <motion.div
                      key="edit-step1"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      {/* Name */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldName')} <span className="text-rose-500">*</span></label>
                        <input
                          type="text"
                          required
                          placeholder={t('jobs.fieldNamePlaceholder')}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 transition-all font-medium"
                        />
                      </div>

                      {/* Brand Client */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldClient')}</label>
                        <input
                          type="text"
                          placeholder={t('jobs.fieldClientPlaceholder')}
                          value={editClient}
                          onChange={(e) => setEditClient(e.target.value)}
                          className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 transition-all font-medium"
                        />
                      </div>

                      <JobTypeSelector
                        value={editType}
                        onChange={(value) => {
                          setEditType(value);
                          if (value !== '__custom__') setEditCustomTypeInput('');
                        }}
                        customInput={editCustomTypeInput}
                        onCustomInputChange={setEditCustomTypeInput}
                        jobTypes={jobTypes}
                        setJobTypes={setJobTypes}
                        accent="indigo"
                      />

                      {/* Legacy category controls retained for data compatibility; replaced by the organized selector above. */}
                      <div className="hidden">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldType')}</label>

                        <div className="space-y-2.5">
                          <div className="space-y-1.5">
                            <p className="text-[9px] font-extrabold text-brand-muted uppercase tracking-wider">{t('jobs.typeBasicLabel')}</p>
                            <div className="p-3 bg-brand-white dark:bg-stone-800 border border-brand-border/50 rounded-2xl flex flex-wrap gap-1.5">
                              {['ยังไม่ระบุ', ...DEFAULT_JOB_TYPES].map(t => {
                                const isSelected = editType === t;
                                return (
                                  <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                      setEditType(t);
                                      setEditCustomTypeInput('');
                                    }}
                                    className={`px-3 py-2 rounded-xl text-[11px] font-black transition-all cursor-pointer border ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                                        : 'bg-brand-faint dark:bg-stone-900 border-brand-border/50 hover:border-brand-text/30 text-brand-text dark:text-neutral-300'
                                    }`}
                                  >
                                    {t}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {(() => {
                            const customTypes = Array.from(new Set(jobTypes)).filter(t => t && !DEFAULT_JOB_TYPES.includes(t));
                            return customTypes.length > 0 ? (
                              <div className="space-y-1.5">
                                <p className="text-[9px] font-extrabold text-brand-muted uppercase tracking-wider">{t('jobs.typeCustomLabel')}</p>
                                <div className="p-3 bg-brand-white dark:bg-stone-800 border border-brand-border/50 rounded-2xl flex flex-wrap gap-1.5">
                                  {customTypes.map(tp => {
                                    const isSelected = editType === tp;
                                    return (
                                      <span
                                        key={tp}
                                        className={`pl-3 pr-1.5 py-1 rounded-xl text-[11px] font-black transition-all border flex items-center gap-1 ${
                                          isSelected
                                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                            : 'bg-brand-faint dark:bg-stone-900 border-brand-border/50 text-brand-text dark:text-neutral-300'
                                        }`}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditType(tp);
                                            setEditCustomTypeInput('');
                                          }}
                                          className="cursor-pointer"
                                        >
                                          {tp}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setJobTypes(prev => prev.filter(x => x !== tp));
                                            if (editType === tp) setEditType('ยังไม่ระบุ');
                                          }}
                                          className={`p-0.5 rounded-full cursor-pointer transition-colors ${isSelected ? 'hover:bg-white/20' : 'text-brand-muted hover:bg-rose-500/10 hover:text-rose-600'}`}
                                          title={t('jobs.removeTypeTooltip')}
                                        >
                                          <IconClose className="w-2.5 h-2.5" />
                                        </button>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          <button
                            type="button"
                            onClick={() => {
                              setEditType('__custom__');
                            }}
                            className={`px-3 py-2.5 rounded-2xl text-[11px] font-black transition-all cursor-pointer border flex items-center justify-center gap-1 border-dashed w-full ${
                              editType === '__custom__'
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                                : 'bg-brand-white dark:bg-stone-800 border-brand-border/60 hover:border-brand-text/30 text-brand-text dark:text-neutral-300'
                            }`}
                          >
                            {t('jobs.addCustomType')}
                          </button>
                        </div>

                        {editType === '__custom__' && (
                          <div className="animate-fade-in space-y-2 bg-indigo-500/5 dark:bg-indigo-500/10 p-3 rounded-2xl border border-indigo-500/15">
                            <label className="text-[10px] text-indigo-800 dark:text-indigo-400 font-extrabold uppercase block">{t('jobs.customTypeNameLabel')}</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder={t('jobs.customTypePlaceholder')}
                                value={editCustomTypeInput}
                                onChange={(e) => setEditCustomTypeInput(e.target.value)}
                                className="flex-1 bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-semibold"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const trimmed = editCustomTypeInput.trim();
                                  if (trimmed) {
                                    if (!jobTypes.includes(trimmed)) {
                                      setJobTypes(prev => [...prev, trimmed]);
                                    }
                                    setEditType(trimmed);
                                    setEditCustomTypeInput('');
                                  }
                                }}
                                className="px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black cursor-pointer transition-colors"
                              >
                                {t('jobs.confirmOk')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 2: Money, Taxes, Progress, Terms, and Notes */}
                  {editFormStep === 2 && (
                    <motion.div
                      key="edit-step2"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {/* Contract value */}
                        <div className="space-y-1.5 col-span-2">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldValue')} <span className="text-rose-500">*</span></label>
                          <NumberInput
                            required
                            placeholder={t('jobs.fieldValuePlaceholder')}
                            value={editValue}
                            onChange={setEditValue}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm font-black text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-mono"
                          />
                        </div>

                        {/* Hours spent (optional, for ฿/hour insight) */}
                        <div className="space-y-1.5 col-span-2">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldHours')}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            placeholder={t('jobs.fieldHoursPlaceholder')}
                            value={editHoursSpent}
                            onChange={(e) => setEditHoursSpent(e.target.value)}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm font-black text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Status Selection -- segmented control, matching the add-job flow */}
                      <div className="space-y-1.5">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{t('jobs.fieldProjectStatus')}</label>
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-faint p-1 dark:bg-stone-850 sm:grid-cols-4">
                          {[{ id: 'unspecified', label: t('jobs.statusUnspecifiedLabel'), behavior: 'pending' as const }, ...statuses].map(s => {
                            const isSelected = editStatus === s.id;
                            const activeColor =
                              s.behavior === 'done'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : s.behavior === 'partial'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400';
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setEditStatus(s.id);
                                  if (s.behavior === 'done') {
                                    setEditReceived(editValue);
                                  } else if (s.behavior === 'partial') {
                                    if (parseFloat(editReceived) === parseFloat(editValue)) {
                                      setEditReceived('');
                                    }
                                  } else {
                                    setEditReceived('0');
                                  }
                                }}
                                className={`min-w-0 py-2.5 px-1.5 rounded-lg text-center text-[11px] font-black transition-all cursor-pointer truncate ${
                                  isSelected ? `${activeColor} shadow-xs` : 'text-brand-muted hover:text-brand-text'
                                }`}
                              >
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                        <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
                          <input
                            type="radio"
                            checked={editStatus === '__custom__'}
                            onChange={() => setEditStatus('__custom__')}
                            className="w-3.5 h-3.5 accent-[#E65F2B] cursor-pointer"
                          />
                          <span className={`text-[11px] font-bold ${editStatus === '__custom__' ? 'text-[#E65F2B]' : 'text-brand-muted'}`}>
                            {t('jobs.customStatusOption')}
                          </span>
                        </label>

                        {editStatus === '__custom__' && (
                          <div className="bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/15 rounded-2xl p-3.5 space-y-3 animate-fade-in mt-2">
                            <div>
                              <label className="text-[10px] text-purple-800 dark:text-purple-400 font-extrabold uppercase block mb-1">{t('jobs.customStatusNameLabelAdd')}</label>
                              <input
                                type="text"
                                required
                                placeholder={t('jobs.customStatusNamePlaceholderEdit')}
                                value={editCustomStatusLabelInput}
                                onChange={(e) => setEditCustomStatusLabelInput(e.target.value)}
                                className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 font-semibold"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-purple-800 dark:text-purple-400 font-extrabold uppercase block mb-1">{t('jobs.customStatusBehaviorLabelEdit')}</label>
                              <select
                                value={editCustomStatusBehavior}
                                onChange={(e: any) => {
                                  const b = e.target.value;
                                  setEditCustomStatusBehavior(b);
                                  if (b === 'done') {
                                    setEditReceived(editValue);
                                  } else if (b === 'partial') {
                                    if (parseFloat(editReceived) === parseFloat(editValue)) {
                                      setEditReceived('');
                                    }
                                  } else {
                                    setEditReceived('0');
                                  }
                                }}
                                className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text dark:text-white rounded-xl p-2.5 outline-none border border-brand-border/40 cursor-pointer font-semibold"
                              >
                                <option value="pending">{t('jobs.statusOptPending')}</option>
                                <option value="partial">{t('jobs.statusOptPartialEdit')}</option>
                                <option value="done">{t('jobs.statusOptDoneEdit')}</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Received Deposit input - shown only if status is "partial" */}
                      {editStatus !== 'installment' && (editStatus === 'partial' ||
                        (editStatus !== '__custom__' && statuses.find(s => s.id === editStatus)?.behavior === 'partial') ||
                        (editStatus === '__custom__' && editCustomStatusBehavior === 'partial')) && (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{editStatus === 'installment' ? 'ยอดที่ได้รับแล้วจากทุกงวด (฿)' : t('jobs.fieldReceivedNow')}</label>
                          <NumberInput
                            placeholder={editStatus === 'installment' ? 'เช่น 15000' : t('jobs.fieldReceivedNowPlaceholder')}
                            value={editReceived}
                            onChange={setEditReceived}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-mono"
                          />
                        </div>
                      )}

                      {editStatus === 'installment' && (
                        <InstallmentPlanner
                          installments={editInstallments}
                          onChange={setEditInstallments}
                          targetAmount={Math.max(0, (parseFloat(editValue) || 0) - Math.round((parseFloat(editValue) || 0) * (editWhtRate / 100)))}
                          accent="indigo"
                        />
                      )}

                      <WithholdingTaxSelector rate={editWhtRate} onChange={setEditWhtRate} value={editValue} accent="indigo" />

                      {/* Legacy tax controls are kept hidden while saved records remain compatible. */}
                      <div className="hidden">
                        <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">
                          {t('jobs.fieldWht')}
                        </label>
                        <div className="relative">
                          <select
                            value={editWhtRate}
                            onChange={(e) => setEditWhtRate(Number(e.target.value))}
                            className="w-full appearance-none bg-brand-white dark:bg-stone-900 text-sm font-bold text-brand-text dark:text-white rounded-xl py-3.5 pl-3.5 pr-10 outline-none border border-brand-border/50 focus:border-indigo-500 cursor-pointer transition-colors"
                          >
                            <option value={0}>{t('jobs.wht0')}</option>
                            <option value={1}>{t('jobs.wht1')}</option>
                            <option value={3}>{t('jobs.wht3')}</option>
                            <option value={5}>{t('jobs.wht5')}</option>
                          </select>
                          <ChevronDown className="w-4 h-4 text-brand-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      {/* Live calculated mockup tax receipt */}
                      <div className="hidden">
                        <div className="flex items-center justify-between text-[10px] text-brand-muted dark:text-neutral-400 font-black uppercase">
                          <span>{t('jobs.taxReceiptTitleEdit')}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.grossValueLabel')}</div>
                          <div className="text-right font-black font-mono dark:text-white">฿{(parseFloat(editValue) || 0).toLocaleString()}</div>

                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.whtDeductedLabel', { rate: editWhtRate })}</div>
                          <div className="text-right font-black font-mono text-amber-600 dark:text-amber-400">- ฿{Math.round((parseFloat(editValue) || 0) * (editWhtRate / 100)).toLocaleString()}</div>

                          <div className="text-brand-muted dark:text-neutral-400 font-bold">{t('jobs.netAfterTaxLabel')}</div>
                          <div className="text-right font-black font-mono text-emerald-600 dark:text-emerald-400">
                            ฿{((parseFloat(editValue) || 0) - Math.round((parseFloat(editValue) || 0) * (editWhtRate / 100))).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 3: Delivery Timeline & Notes */}
                  {editFormStep === 3 && (
                    <motion.div
                      key="edit-step3"
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      className="space-y-4"
                    >
                      <WorkStageSelector isPosted={editIsPosted} onChange={setEditIsPosted} accent="indigo" />

                      {/* Legacy WIP vs Posted control retained hidden for state compatibility.
                          highlight instead of two separate boxes, so it reads as a single
                          switch rather than two things to compare and read. */}
                      <div className="hidden">
                        <label className="text-[10px] text-brand-muted dark:text-neutral-400 uppercase tracking-widest font-black block">{t('jobs.currentStatusLabel')}</label>
                        <div className="relative flex bg-brand-faint dark:bg-stone-850 border border-brand-border/60 rounded-2xl p-1">
                          <button
                            type="button"
                            onClick={() => setEditIsPosted(false)}
                            className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                          >
                            {!editIsPosted && (
                              <motion.div
                                layoutId="wip-toggle-edit"
                                className="absolute inset-0 bg-amber-500 rounded-xl"
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                              />
                            )}
                            <span className={`relative z-10 text-xs font-black block ${!editIsPosted ? 'text-white' : 'text-brand-text dark:text-neutral-300'}`}>{t('jobs.wipShort')}</span>
                            <span className={`relative z-10 text-[9px] font-bold ${!editIsPosted ? 'text-white/80' : 'text-brand-muted'}`}>{t('jobs.wipSub')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditIsPosted(true)}
                            className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                          >
                            {editIsPosted && (
                              <motion.div
                                layoutId="wip-toggle-edit"
                                className="absolute inset-0 bg-emerald-500 rounded-xl"
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                              />
                            )}
                            <span className={`relative z-10 text-xs font-black block ${editIsPosted ? 'text-white' : 'text-brand-text dark:text-neutral-300'}`}>{t('jobs.postedShort')}</span>
                            <span className={`relative z-10 text-[9px] font-bold ${editIsPosted ? 'text-white/80' : 'text-brand-muted'}`}>{t('jobs.postedSub')}</span>
                          </button>
                        </div>
                      </div>

                      <AnimatePresence mode="wait">
                        {!editIsPosted ? (
                          <motion.div
                            key="edit-wip-fields"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-4"
                          >
                            {/* วันเริ่มดีลงาน */}
                            <div className="space-y-2 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/15 shadow-2xs overflow-hidden">
                              <div className="flex items-center justify-between">
                                <label className="text-amber-900 dark:text-amber-300 font-extrabold block text-[11px] uppercase tracking-wider">{t('jobs.startDateLabel')}</label>
                                {editStartDate && (
                                  <button 
                                    type="button"
                                    onClick={() => setEditStartDate('')}
                                    className="text-[10px] font-black text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer flex items-center gap-0.5 transition-colors"
                                  >
                                    {t('jobs.clearDate')}
                                  </button>
                                )}
                              </div>
                              <input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                onClick={(e) => {
                                  try {
                                    e.currentTarget.showPicker();
                                  } catch (err) {
                                    console.log(err);
                                  }
                                }}
                                className="w-full min-w-0 max-w-full bg-brand-white dark:bg-stone-900 text-xs text-brand-text dark:text-white rounded-xl p-3 outline-none border border-brand-border/40 focus:border-amber-500 font-semibold cursor-pointer transition-all"
                              />
                              <p className="text-[10px] text-amber-800/80 dark:text-amber-400/80 leading-relaxed font-medium">
                                {t('jobs.startDateHint')}
                              </p>
                            </div>

                            {/* Notes */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-brand-muted dark:text-neutral-300 uppercase tracking-widest font-black block">{t('jobs.noteFieldLabel')}</label>
                              <textarea
                                placeholder={t('jobs.noteWipPlaceholder')}
                                rows={3}
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                className="w-full bg-brand-faint dark:bg-stone-850 text-xs text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-medium leading-relaxed transition-all"
                              />
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="edit-posted-fields"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-4"
                          >
                            {/* วันส่งมอบงาน */}
                            <div className="space-y-2 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 dark:bg-indigo-500/5 dark:border-indigo-500/15 shadow-2xs overflow-hidden">
                              <div className="flex items-center justify-between">
                                <label className="text-indigo-900 dark:text-indigo-300 font-extrabold block text-[11px] uppercase tracking-wider">{t('jobs.deliveryDateLabel')}</label>
                                {editPostDate && (
                                  <button
                                    type="button"
                                    onClick={() => setEditPostDate('')}
                                    className="text-[10px] font-black text-rose-500 hover:text-rose-600 dark:text-rose-400 cursor-pointer flex items-center gap-0.5 transition-colors"
                                  >
                                    {t('jobs.clearDate')}
                                  </button>
                                )}
                              </div>
                              <input
                                type="date"
                                value={editPostDate}
                                onChange={(e) => setEditPostDate(e.target.value)}
                                onClick={(e) => {
                                  try {
                                    e.currentTarget.showPicker();
                                  } catch (err) {
                                    console.log(err);
                                  }
                                }}
                                className="w-full min-w-0 max-w-full bg-brand-white dark:bg-stone-900 text-xs text-brand-text dark:text-white rounded-xl p-3 outline-none border border-brand-border/40 focus:border-indigo-500 font-semibold cursor-pointer transition-all"
                              />

                              {/* Live calculation of Due date and remaining days */}
                              {editPostDate && editCreditTerm > 0 && (
                                <div className="mt-3 p-3 rounded-xl bg-brand-white dark:bg-stone-850 border border-brand-border/50 text-[11px] space-y-2 shadow-2xs">
                                  <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                                    <span className="font-bold">{t('jobs.dueDateLabel')}</span>
                                    <span className="font-extrabold text-indigo-600 dark:text-indigo-400">
                                      {safeFormatThaiDate(calculatePayDate(editPostDate, editCreditTerm, editExcludeHolidays))}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-brand-text dark:text-neutral-200">
                                    <span className="font-bold flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 text-amber-500" /> {t('jobs.timeUntilDueColon')}
                                    </span>
                                    {(() => {
                                      const payDateVal = calculatePayDate(editPostDate, editCreditTerm, editExcludeHolidays);
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
                                  const isSelected = editCreditTerm === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => setEditCreditTerm(opt.value)}
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

                              {editCreditTerm > 0 && (
                                <div className="mt-2.5 pt-2.5 border-t border-[#E65F2B]/10 flex items-center justify-between">
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={editExcludeHolidays}
                                      onChange={(e) => setEditExcludeHolidays(e.target.checked)}
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

                            {/* Notes */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] text-brand-muted dark:text-neutral-300 uppercase tracking-widest font-black block">{t('jobs.noteFieldLabel')}</label>
                              <textarea
                                placeholder={t('jobs.notePostedPlaceholder')}
                                rows={3}
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                                className="w-full bg-brand-faint dark:bg-stone-850 text-xs text-brand-text dark:text-white placeholder-brand-muted dark:placeholder-neutral-500 rounded-2xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-medium leading-relaxed transition-all"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom Navigation buttons */}
                <div className="flex items-center gap-3 pt-3 border-t border-brand-border/30 shrink-0">
                  {editFormStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setEditFormStep(prev => prev - 1)}
                      className="flex-1 py-3 bg-brand-faint dark:bg-stone-800 hover:bg-brand-border/40 text-brand-text dark:text-neutral-200 border border-brand-border/60 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1"
                    >
                      <IconArrowLeft className="w-3 h-3" /> {t('jobs.back')}
                    </button>
                  )}
                  
                  {editFormStep < 3 ? (
                    <button
                      key="edit-btn-next"
                      type="button"
                      onClick={() => {
                        if (editFormStep === 1) {
                          if (!editName.trim()) {
                            triggerAlert(t('jobs.alertNameRequiredTitle'), t('jobs.alertNameRequiredMsg'));
                            return;
                          }
                        }
                        if (editFormStep === 2) {
                          const val = parseFloat(editValue);
                          if (!editValue.trim() || isNaN(val) || val < 0) {
                            triggerAlert(t('jobs.alertValueRequiredTitle'), t('jobs.alertValueRequiredMsg'));
                            return;
                          }
                        }
                        setEditFormStep(prev => prev + 1);
                      }}
                      className="flex-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      {t('jobs.next')} <IconArrowRight className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      key="edit-btn-submit"
                      type="submit"
                      disabled={!editCanSubmit}
                      className={`flex-2 py-3 text-white rounded-xl text-xs font-black transition-all text-center shadow-sm ${
                        editCanSubmit 
                          ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer' 
                          : 'bg-indigo-600/50 cursor-not-allowed opacity-75'
                      }`}
                    >
                      {t('jobs.saveEditJob')}
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>, document.body)}

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

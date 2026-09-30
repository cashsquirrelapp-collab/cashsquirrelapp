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
  const [sortBy, setSortBy] = useState<'recent' | 'due' | 'amount' | 'name'>('recent');
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
  
  // Local form states for adding a job
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('ยังไม่ระบุ');
  const [formClient, setFormClient] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formReceived, setFormReceived] = useState('');
  const [formDepositDate, setFormDepositDate] = useState(getLocalDateStr());
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
    if (isAddJobOpen && formStep === 3) {
      setCanSubmit(false);
      const timer = setTimeout(() => {
        setCanSubmit(true);
      }, 500); // 500ms debounce to prevent accidental double-click / click carry-over
      return () => clearTimeout(timer);
    } else {
      setCanSubmit(false);
    }
  }, [formStep, isAddJobOpen]);

  // States for custom entry on-the-fly
  const [customTypeInput, setCustomTypeInput] = useState('');

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
  const [editDepositDate, setEditDepositDate] = useState(getLocalDateStr());
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
      setEditDepositDate(editingJob.depositDate || getLocalDateStr());
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
        if (editStatus === 'installment') {
          const target = val - Math.round(val * (editWhtRate / 100));
          const total = editInstallments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
          if (editInstallments.length === 0 || editInstallments.some((row) => !Number.isFinite(row.amount) || row.amount <= 0) || Math.abs(total - target) > 0.01) {
            const difference = target - total;
            triggerAlert('ตรวจสอบยอดแต่ละงวด', difference > 0 ? `ยอดรวมยังขาด ${formatCurrency(difference)} กรุณาเพิ่มหรือแก้ไขงวดให้ครบก่อนไปขั้นตอนที่ 3` : difference < 0 ? `ยอดรวมเกิน ${formatCurrency(Math.abs(difference))} กรุณาแก้ไขก่อนไปขั้นตอนที่ 3` : 'ทุกงวดต้องมียอดมากกว่า 0 บาท');
            return;
          }
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

    const finalStatus = editStatus;
    const matchedStatus = statuses.find(s => s.id === editStatus);
    const behavior: 'done' | 'partial' | 'pending' = matchedStatus ? matchedStatus.behavior : 'pending';

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
    // A fully-paid edit keeps the recorded deposit so it still counts in the month it arrived.
    const depositPatch = editStatus !== 'installment' && behavior === 'partial' && receivedNum > 0
      ? { depositDate: editDepositDate || getLocalDateStr(), depositAmount: receivedNum }
      : receivedNum > 0 ? {} : { depositDate: null, depositAmount: 0 };

    onEditJob(editingJob.id, {
      ...paymentStatusPatch,
      ...depositPatch,
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
        if (formStatus === 'installment') {
          const target = val - Math.round(val * (formWhtRate / 100));
          const total = formInstallments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
          if (formInstallments.length === 0 || formInstallments.some((row) => !Number.isFinite(row.amount) || row.amount <= 0) || Math.abs(total - target) > 0.01) {
            const difference = target - total;
            triggerAlert('ตรวจสอบยอดแต่ละงวด', difference > 0 ? `ยอดรวมยังขาด ${formatCurrency(difference)} กรุณาเพิ่มหรือแก้ไขงวดให้ครบก่อนไปขั้นตอนที่ 3` : difference < 0 ? `ยอดรวมเกิน ${formatCurrency(Math.abs(difference))} กรุณาแก้ไขก่อนไปขั้นตอนที่ 3` : 'ทุกงวดต้องมียอดมากกว่า 0 บาท');
            return;
          }
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

    const enteredValue = parseFloat(formValue);
    if (!formValue.trim() || isNaN(enteredValue) || enteredValue < 0) {
      triggerAlert(t('jobs.alertValueRequiredTitle'), t('jobs.alertValueRequiredMsg'));
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

    const finalStatus = formStatus;
    const matchedStatus = statuses.find(s => s.id === formStatus);
    const behavior: 'done' | 'partial' | 'pending' = matchedStatus ? matchedStatus.behavior : 'pending';

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
      ...(formStatus !== 'installment' && behavior === 'partial' && receivedNum > 0
        ? { depositDate: formDepositDate || getLocalDateStr(), depositAmount: receivedNum }
        : {}),
      note: formNote,
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
    setFormDepositDate(getLocalDateStr());
    setFormStatus('pending');
    setFormType('ยังไม่ระบุ');
    setCustomTypeInput('');
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
  const dueKey = (j: Job) => (isWorking(j) ? j.postDate : j.payDate || j.postDate) || '9999-12-31';
  const sortedJobs = sortBy === 'recent' ? filteredJobs : [...filteredJobs].sort((a, b) =>
    sortBy === 'due' ? dueKey(a).localeCompare(dueKey(b))
      : sortBy === 'amount' ? (b.value || 0) - (a.value || 0)
      : a.name.localeCompare(b.name, 'th'));
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSubTab('all');
  };

  const openAddJobForm = () => {
    // Ensure form values are clean
    setFormName('');
    setFormClient('');
    setFormValue('');
    setFormReceived('');
    setFormDepositDate(getLocalDateStr());
    setFormStatus('pending');
    setFormType('ยังไม่ระบุ');
    setCustomTypeInput('');
    setFormCreditTerm(0);
    setFormPostDate('');
    setFormStartDate(getLocalDateStr());
    setFormIsPosted(false);
    setFormNote('');
    setFormWhtRate(0);
    setFormStep(1);
    onOpenAddJob();
  };

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
              <option className="text-brand-text" value="recent">เรียงตาม: ล่าสุด</option>
              <option className="text-brand-text" value="due">เรียงตาม: ใกล้กำหนด</option>
              <option className="text-brand-text" value="amount">เรียงตาม: ยอดเงินสูงสุด</option>
              <option className="text-brand-text" value="name">เรียงตาม: ชื่อ ก–ฮ</option>
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
                {sortedJobs.map(j => {
                  const info = describeJob(j);
                  const overdue = info.dueTone === 'overdue';
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 sm:hidden">
            {sortedJobs.map(j => {
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

                      {/* Project Status */}
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

                      {/* Received Deposit input - shown only if status is "partial" */}
                      {formStatus !== 'installment' && (formStatus === 'partial' ||
                        statuses.find(s => s.id === formStatus)?.behavior === 'partial') && (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{formStatus === 'installment' ? 'ยอดที่ได้รับแล้วจากทุกงวด (฿)' : t('jobs.fieldReceivedNow')}</label>
                          <NumberInput
                            placeholder={formStatus === 'installment' ? 'เช่น 15000' : t('jobs.fieldReceivedNowPlaceholder')}
                            value={formReceived}
                            onChange={setFormReceived}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                          />
                          <label htmlFor="form-deposit-date" className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block pt-1.5">วันที่รับมัดจำ</label>
                          <input
                            id="form-deposit-date"
                            type="date"
                            value={formDepositDate}
                            max={getLocalDateStr()}
                            onChange={(e) => setFormDepositDate(e.target.value)}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-emerald-500"
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
                      </div>

                      {/* Received Deposit input - shown only if status is "partial" */}
                      {editStatus !== 'installment' && (editStatus === 'partial' ||
                        statuses.find(s => s.id === editStatus)?.behavior === 'partial') && (
                        <div className="space-y-1.5 animate-fade-in">
                          <label className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block">{editStatus === 'installment' ? 'ยอดที่ได้รับแล้วจากทุกงวด (฿)' : t('jobs.fieldReceivedNow')}</label>
                          <NumberInput
                            placeholder={editStatus === 'installment' ? 'เช่น 15000' : t('jobs.fieldReceivedNowPlaceholder')}
                            value={editReceived}
                            onChange={setEditReceived}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white placeholder-brand-muted rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500 font-mono"
                          />
                          <label htmlFor="edit-deposit-date" className="text-brand-muted dark:text-neutral-300 uppercase tracking-wider block pt-1.5">วันที่รับมัดจำ</label>
                          <input
                            id="edit-deposit-date"
                            type="date"
                            value={editDepositDate}
                            max={getLocalDateStr()}
                            onChange={(e) => setEditDepositDate(e.target.value)}
                            className="w-full bg-brand-faint dark:bg-stone-850 text-sm text-brand-text dark:text-white rounded-xl p-3.5 outline-none border border-brand-border/40 focus:border-indigo-500"
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

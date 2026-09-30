import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Job, JobInstallment, StatusOption } from '../../../../shared/types';
import { calculatePayDate, formatCurrency, safeFormatThaiDate, DEFAULT_JOB_TYPES } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import InstallmentPlanner from './InstallmentPlanner';

type Payment = 'unpaid' | 'paid' | 'partial' | 'installment';
type FieldKey = 'name' | 'value' | 'postDate' | 'received' | 'installments' | 'type';

const PAYMENT_OPTIONS: { key: Payment; label: string }[] = [
  { key: 'unpaid', label: 'ยังไม่จ่าย' },
  { key: 'paid', label: 'รับครบแล้ว' },
  { key: 'partial', label: 'รับบางส่วน' },
  { key: 'installment', label: 'แบ่งงวด' },
];
const CREDIT_TERMS = [0, 30, 45, 60, 90];
const WHT_RATES = [0, 1, 3, 5];
const CUSTOM_TYPE = '__custom__';

const todayStr = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const behaviorOf = (statusId: string, statuses: StatusOption[]) =>
  statuses.find(s => s.id === statusId)?.behavior
    ?? (statusId === 'done' ? 'done' : statusId === 'partial' || statusId === 'installment' ? 'partial' : 'pending');

const paymentOf = (statusId: string, statuses: StatusOption[]): Payment => {
  if (statusId === 'installment') return 'installment';
  const behavior = behaviorOf(statusId, statuses);
  return behavior === 'done' ? 'paid' : behavior === 'partial' ? 'partial' : 'unpaid';
};

// Saved jobs keep their exact status id (including legacy/custom ones) unless the user picks a
// different payment option; a new choice maps to the built-in status with that behavior.
const statusIdFor = (payment: Payment, statuses: StatusOption[]) => {
  if (payment === 'installment') return 'installment';
  const behavior = payment === 'paid' ? 'done' : payment === 'partial' ? 'partial' : 'pending';
  const builtIn = statuses.find(s => s.id === behavior && s.behavior === behavior);
  return builtIn?.id ?? statuses.find(s => s.behavior === behavior && s.id !== 'installment')?.id ?? behavior;
};

interface JobFormDrawerProps {
  open: boolean;
  job: Job | null;
  statuses: StatusOption[];
  jobTypes: string[];
  setJobTypes: React.Dispatch<React.SetStateAction<string[]>>;
  onClose: () => void;
  onAdd: (job: Omit<Job, 'id'>) => void;
  onEdit: (id: string, updated: Partial<Job>) => void;
}

export default function JobFormDrawer({ open, job, statuses, jobTypes, setJobTypes, onClose, onAdd, onEdit }: JobFormDrawerProps) {
  const isEdit = Boolean(job);
  const [name, setName] = React.useState('');
  const [client, setClient] = React.useState('');
  const [value, setValue] = React.useState('');
  const [postDate, setPostDate] = React.useState('');
  const [payment, setPayment] = React.useState<Payment>('unpaid');
  const [originalStatus, setOriginalStatus] = React.useState<string | null>(null);
  const [received, setReceived] = React.useState('');
  const [depositDate, setDepositDate] = React.useState(todayStr());
  const [paidDate, setPaidDate] = React.useState(todayStr());
  const [creditTerm, setCreditTerm] = React.useState(0);
  const [excludeHolidays, setExcludeHolidays] = React.useState(false);
  const [installments, setInstallments] = React.useState<JobInstallment[]>([]);
  const [isPosted, setIsPosted] = React.useState(false);
  const [startDate, setStartDate] = React.useState(todayStr());
  const [whtRate, setWhtRate] = React.useState(0);
  const [type, setType] = React.useState('ยังไม่ระบุ');
  const [customType, setCustomType] = React.useState('');
  const [note, setNote] = React.useState('');
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [creditOptionsOpen, setCreditOptionsOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<FieldKey, string>>>({});

  React.useEffect(() => {
    if (!open) return;
    const status = job?.status ?? statusIdFor('unpaid', statuses);
    setName(job?.name ?? '');
    setClient(job?.client ?? '');
    setValue(job ? String(job.value) : '');
    setPostDate(job?.postDate ?? '');
    setPayment(job ? paymentOf(job.status, statuses) : 'unpaid');
    setOriginalStatus(job ? status : null);
    setReceived(job && job.received ? String(job.received) : '');
    setDepositDate(job?.depositDate || todayStr());
    setPaidDate(job && behaviorOf(job.status, statuses) === 'done' && job.payDate ? job.payDate : todayStr());
    setCreditTerm(job?.creditTerm ?? 0);
    setExcludeHolidays(job?.excludeHolidays ?? false);
    setInstallments(job?.installments ?? []);
    setIsPosted(job ? job.isPosted !== false : false);
    setStartDate(job ? job.startDate ?? '' : todayStr());
    setWhtRate(job?.whtRate ?? 0);
    setType(job?.type || 'ยังไม่ระบุ');
    setCustomType('');
    setNote(job?.note ?? '');
    setErrors({});
    setAdvancedOpen(false);
    setCreditOptionsOpen(Boolean(job?.excludeHolidays));
  }, [open, job, statuses]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const gross = Math.max(0, parseFloat(value) || 0);
  const whtAmount = Math.round(gross * (whtRate / 100));
  const net = gross - whtAmount;
  const receivedNum = parseFloat(received) || 0;
  const installmentTotal = installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const installmentsMatch = installments.length > 0 && installments.every(row => Number(row.amount) > 0) && Math.abs(installmentTotal - net) <= 0.01;
  const expectedPayDate = postDate ? calculatePayDate(postDate, creditTerm, excludeHolidays) : null;
  const customTypes = Array.from(new Set(jobTypes)).filter(t => t && !DEFAULT_JOB_TYPES.includes(t));
  const typeOptions = Array.from(new Set(['ยังไม่ระบุ', ...DEFAULT_JOB_TYPES, ...customTypes, ...(type !== CUSTOM_TYPE ? [type] : [])]));

  const summaryReceived = payment === 'paid' ? net
    : payment === 'partial' ? receivedNum
    : payment === 'installment' ? installments.filter(row => row.status === 'paid').reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    : 0;
  const showSummary = gross > 0 && (payment === 'partial' || payment === 'installment' || whtRate > 0);

  const clearError = (key: FieldKey) => setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const saveCustomType = () => {
    const trimmed = customType.trim();
    if (!trimmed) return;
    if (!jobTypes.includes(trimmed)) setJobTypes(prev => [...prev, trimmed]);
    setType(trimmed);
    setCustomType('');
    clearError('type');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) next.name = 'กรุณาระบุชื่องาน';
    if (!value.trim() || Number.isNaN(parseFloat(value)) || parseFloat(value) < 0) next.value = 'กรุณาระบุมูลค่างาน';
    if (isPosted && !postDate) next.postDate = 'กรุณาเลือกวันที่ส่งงาน';
    if (payment === 'partial' && (receivedNum <= 0 || receivedNum > net)) next.received = receivedNum <= 0 ? 'กรุณาระบุยอดที่รับแล้ว' : 'ยอดที่รับแล้วต้องไม่เกินยอดรับสุทธิ';
    if (payment === 'installment' && !installmentsMatch) {
      const diff = net - installmentTotal;
      next.installments = installments.length === 0 || installments.some(row => !(Number(row.amount) > 0))
        ? 'เลือกจำนวนงวด และทุกงวดต้องมียอดมากกว่า 0 บาท'
        : diff > 0 ? `ยอดรวมทุกงวดยังขาด ${formatCurrency(diff)}` : `ยอดรวมทุกงวดเกิน ${formatCurrency(Math.abs(diff))}`;
    }
    const finalType = type === CUSTOM_TYPE ? customType.trim() : type;
    if (type === CUSTOM_TYPE && !finalType) next.type = 'กรุณาระบุชื่อประเภทงาน';
    setErrors(next);
    const firstInvalid = (['name', 'value', 'postDate', 'received', 'installments', 'type'] as FieldKey[]).find(key => next[key]);
    if (firstInvalid) {
      if (firstInvalid === 'type') setAdvancedOpen(true);
      requestAnimationFrame(() => {
        const el = document.getElementById(`job-form-${firstInvalid}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el?.querySelector('input, textarea, select, button') as HTMLElement | null)?.focus?.();
        if (el instanceof HTMLInputElement) el.focus();
      });
      return;
    }
    if (type === CUSTOM_TYPE && !jobTypes.includes(finalType)) setJobTypes(prev => [...prev, finalType]);

    const status = originalStatus && paymentOf(originalStatus, statuses) === payment ? originalStatus : statusIdFor(payment, statuses);
    const behavior = behaviorOf(status, statuses);
    const normalizedInstallments = payment === 'installment'
      ? installments.map((row, index) => ({ ...row, label: row.label.trim() || `งวดที่ ${index + 1}`, amount: Number(row.amount) || 0 }))
      : [];
    const receivedFinal = payment === 'paid' ? net
      : payment === 'partial' ? receivedNum
      : payment === 'installment' ? normalizedInstallments.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amount, 0)
      : 0;
    const pendingFinal = Math.max(0, net - receivedFinal);
    const nextInstallmentDue = normalizedInstallments.filter(row => row.status !== 'paid' && row.dueDate).map(row => row.dueDate as string).sort()[0];
    const payDate = payment === 'installment'
      ? (nextInstallmentDue || null)
      : payment === 'paid'
      ? paidDate || todayStr()
      : calculatePayDate(postDate, creditTerm, excludeHolidays);
    const derivedPaymentStatus = behavior === 'done' || (net > 0 && receivedFinal >= net)
      ? 'paid'
      : behavior === 'partial' && receivedFinal > 0 ? 'partial' : 'unpaid';

    const fields = {
      name: name.trim(),
      type: finalType,
      client: client.trim(),
      value: gross,
      received: receivedFinal,
      pending: pendingFinal,
      status,
      creditTerm,
      postDate,
      startDate,
      isPosted,
      payDate,
      note,
      whtRate,
      whtAmount,
      excludeHolidays,
      installments: normalizedInstallments,
    };

    if (job) {
      // Only move paymentStatus when an existing flag would disagree, so untouched jobs don't emit
      // a spurious "paid" change (which fires a LINE notification).
      const paymentStatusPatch = job.paymentStatus && job.paymentStatus !== derivedPaymentStatus ? { paymentStatus: derivedPaymentStatus } : {};
      // A fully-paid edit keeps the recorded deposit so it still counts in the month it arrived.
      const depositPatch = payment === 'partial' && receivedFinal > 0
        ? { depositDate: depositDate || todayStr(), depositAmount: receivedFinal }
        : receivedFinal > 0 ? {} : { depositDate: null, depositAmount: 0 };
      onEdit(job.id, { ...paymentStatusPatch, ...depositPatch, ...fields });
    } else {
      onAdd({
        ...fields,
        paymentStatus: derivedPaymentStatus,
        ...(payment === 'partial' && receivedFinal > 0 ? { depositDate: depositDate || todayStr(), depositAmount: receivedFinal } : {}),
      });
    }
    onClose();
  };

  const labelClass = 'mb-1.5 block text-[13px] font-medium text-brand-text';
  const inputClass = (error?: string) =>
    `h-11 w-full rounded-[10px] border bg-brand-white px-3 text-sm text-brand-text placeholder:text-brand-muted outline-none transition-colors focus:border-[#E65F2B] dark:bg-neutral-950 ${error ? 'border-[#E95454]' : 'border-brand-border'}`;
  const errorText = (key: FieldKey) => errors[key] ? <p className="mt-1 text-xs text-[#C43A3A] dark:text-rose-300">{errors[key]}</p> : null;
  const segment = (active: boolean) =>
    `h-10 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${active
      ? 'border-[#F3B08C] bg-[#FFF1E8] font-semibold text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
      : 'border-brand-border bg-brand-white text-brand-text hover:bg-brand-faint'}`;
  const dateInput = (id: string, dateValue: string, onChange: (v: string) => void, error?: string) => (
    <div className="relative">
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
      <input
        id={id}
        type="date"
        value={dateValue}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass(error)} pl-9`}
      />
    </div>
  );

  const creditTermBlock = (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-brand-text">{payment === 'partial' ? 'Credit Term ของยอดคงเหลือ' : 'Credit Term'}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {CREDIT_TERMS.map(days => (
          <button key={days} type="button" onClick={() => setCreditTerm(days)} className={segment(creditTerm === days)}>
            {days === 0 ? '0 วัน' : days}
          </button>
        ))}
      </div>
      <div className="rounded-[10px] bg-[#FFF7F1] px-3 py-2 text-[13px] dark:bg-orange-500/10">
        {expectedPayDate
          ? <span className="text-brand-text">คาดว่าจะได้รับเงิน <strong className="font-semibold">{safeFormatThaiDate(expectedPayDate)}</strong></span>
          : <span className="text-brand-muted">ใส่วันส่งงานด้านบน แล้วจะคำนวณวันที่ได้รับเงินให้</span>}
      </div>
      {creditTerm > 0 && (
        <div>
          <button type="button" onClick={() => setCreditOptionsOpen(v => !v)} className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-text cursor-pointer" aria-expanded={creditOptionsOpen}>
            {creditOptionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            ตัวเลือก Credit Term เพิ่มเติม
          </button>
          {creditOptionsOpen && (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-brand-text">
              <input type="checkbox" checked={excludeHolidays} onChange={(e) => setExcludeHolidays(e.target.checked)} className="h-4 w-4 accent-[#E65F2B]" />
              ไม่นับวันเสาร์–อาทิตย์และวันหยุด
            </label>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(33,29,26,0.35)]"
          />
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-form-title"
            onSubmit={submit}
            noValidate
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(33,29,26,0.18)] sm:max-w-[540px] dark:bg-stone-900"
          >
            <div className="flex items-start justify-between gap-3 border-b border-brand-border px-6 py-5">
              <div>
                <h2 id="job-form-title" className="text-lg font-semibold text-brand-text">{isEdit ? 'แก้ไขงาน' : 'เพิ่มงาน'}</h2>
                <p className="mt-0.5 text-[13px] text-brand-muted">
                  {isEdit ? 'ปรับข้อมูลงานนี้ แล้วกดบันทึก' : 'กรอกข้อมูลหลักก่อน รายละเอียดอื่นเพิ่มภายหลังได้'}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
              {/* A. ข้อมูลงาน */}
              <section className="space-y-4" aria-label="ข้อมูลงาน">
                <div>
                  <label htmlFor="job-form-name" className={labelClass}>ชื่องาน / โปรเจกต์ <span className="text-[#C43A3A]">*</span></label>
                  <input
                    id="job-form-name"
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError('name'); }}
                    placeholder="เช่น รีวิวสกินแคร์ / ออกแบบเว็บไซต์ / สอนขับรถ"
                    className={inputClass(errors.name)}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errorText('name')}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="job-form-client" className={labelClass}>ลูกค้า / ผู้จ่าย</label>
                    <input
                      id="job-form-client"
                      type="text"
                      value={client}
                      onChange={(e) => setClient(e.target.value)}
                      placeholder="เช่น Skinness"
                      className={inputClass()}
                    />
                  </div>
                  <div id="job-form-value">
                    <label htmlFor="job-form-value-input" className={labelClass}>มูลค่างาน <span className="text-[#C43A3A]">*</span></label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
                      <NumberInput
                        id="job-form-value-input"
                        value={value}
                        onChange={(raw) => { setValue(raw); clearError('value'); }}
                        placeholder="0"
                        className={`${inputClass(errors.value)} pl-7 font-mono`}
                        aria-invalid={Boolean(errors.value)}
                      />
                    </div>
                    {errorText('value')}
                  </div>
                </div>
              </section>

              <div className="border-t border-brand-border" />

              {/* B. สถานะงาน + วันส่งงาน -- asked together so the date always has one clear meaning */}
              <section className="space-y-4" aria-label="สถานะงาน">
                <div>
                  <h3 className="text-[15px] font-semibold text-brand-text">งานนี้ถึงไหนแล้ว?</h3>
                  <p className="mt-0.5 text-xs text-brand-muted">ใช้คำนวณว่าจะได้รับเงินวันไหน</p>
                </div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="สถานะงาน">
                  {[
                    { posted: false, title: 'กำลังทำ', hint: 'ยังไม่ได้ส่งงาน' },
                    { posted: true, title: 'ส่งงานแล้ว', hint: 'ส่งงาน / ให้บริการเสร็จแล้ว' },
                  ].map(option => {
                    const active = isPosted === option.posted;
                    return (
                      <button
                        key={option.title}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setIsPosted(option.posted);
                          clearError('postDate');
                          // Delivered work almost always went out today; saves a trip to the date picker.
                          if (option.posted && !postDate) setPostDate(todayStr());
                        }}
                        className={`rounded-[10px] border px-3 py-2.5 text-left transition-colors cursor-pointer ${active
                          ? 'border-[#F3B08C] bg-[#FFF1E8] dark:border-orange-400/40 dark:bg-orange-500/10'
                          : 'border-brand-border bg-brand-white hover:bg-brand-faint'}`}
                      >
                        <span className={`block text-[13px] ${active ? 'font-semibold text-[#C24A16] dark:text-orange-300' : 'font-medium text-brand-text'}`}>{option.title}</span>
                        <span className="mt-0.5 block text-[11px] text-brand-muted">{option.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div id="job-form-postDate">
                  <label htmlFor="job-form-postDate-input" className={labelClass}>
                    {isPosted
                      ? <>ส่งงานวันไหน? <span className="text-[#C43A3A]">*</span></>
                      : <>จะส่งงานวันไหน? <span className="font-normal text-brand-muted">(ไม่บังคับ)</span></>}
                  </label>
                  {dateInput('job-form-postDate-input', postDate, (v) => { setPostDate(v); clearError('postDate'); }, errors.postDate)}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(isPosted
                      ? [{ label: 'วันนี้', date: todayStr() }, { label: 'เมื่อวาน', date: todayStr(-1) }]
                      : [{ label: 'วันนี้', date: todayStr() }, { label: 'พรุ่งนี้', date: todayStr(1) }, { label: 'อีก 7 วัน', date: todayStr(7) }]
                    ).map(chip => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => { setPostDate(chip.date); clearError('postDate'); }}
                        className={`h-8 rounded-full border px-3 text-xs transition-colors cursor-pointer ${postDate === chip.date
                          ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16] dark:border-orange-400/40 dark:bg-orange-500/10 dark:text-orange-300'
                          : 'border-brand-border text-brand-text hover:bg-brand-faint'}`}
                      >
                        {chip.label}
                      </button>
                    ))}
                    {!isPosted && postDate && (
                      <button type="button" onClick={() => setPostDate('')} className="h-8 px-2 text-xs text-brand-muted hover:text-brand-text cursor-pointer">
                        ยังไม่กำหนด
                      </button>
                    )}
                  </div>
                  {errorText('postDate')}
                  {!errors.postDate && (
                    <p className="mt-1.5 text-xs text-brand-muted">
                      {isPosted
                        ? 'Credit Term จะเริ่มนับจากวันส่งงาน'
                        : postDate ? 'ถ้าส่งงานจริงคนละวัน ค่อยมาแก้ตอนส่งงานได้' : 'ยังไม่รู้ก็เว้นไว้ได้ ค่อยใส่ตอนส่งงาน'}
                    </p>
                  )}
                </div>
              </section>

              <div className="border-t border-brand-border" />

              {/* C. การรับเงิน */}
              <section className="space-y-4" aria-label="การรับเงิน">
                <div>
                  <h3 className="text-[15px] font-semibold text-brand-text">การรับเงิน</h3>
                  <p className="mt-0.5 text-xs text-brand-muted">ตอนนี้ลูกค้าจ่ายถึงไหนแล้ว?</p>
                </div>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="สถานะการรับเงิน">
                  {PAYMENT_OPTIONS.map(option => (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={payment === option.key}
                      onClick={() => { setPayment(option.key); clearError('received'); clearError('installments'); }}
                      className={segment(payment === option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {payment === 'unpaid' && creditTermBlock}

                {payment === 'paid' && (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="job-form-paidDate" className={labelClass}>วันที่รับเงิน</label>
                      {dateInput('job-form-paidDate', paidDate, setPaidDate)}
                    </div>
                    {gross > 0 && (
                      <p className="text-[13px] text-brand-muted">ยอดรับสุทธิ <span className="font-mono font-semibold text-brand-text">{formatCurrency(net)}</span></p>
                    )}
                  </div>
                )}

                {payment === 'partial' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div id="job-form-received">
                        <label htmlFor="job-form-received-input" className={labelClass}>รับแล้ว</label>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
                          <NumberInput
                            id="job-form-received-input"
                            value={received}
                            onChange={(raw) => { setReceived(raw); clearError('received'); }}
                            placeholder="0"
                            className={`${inputClass(errors.received)} pl-7 font-mono`}
                            aria-invalid={Boolean(errors.received)}
                          />
                        </div>
                        {errorText('received')}
                      </div>
                      <div>
                        <label htmlFor="job-form-depositDate" className={labelClass}>วันที่รับ</label>
                        {dateInput('job-form-depositDate', depositDate, setDepositDate)}
                      </div>
                    </div>
                    {creditTermBlock}
                  </div>
                )}

                {payment === 'installment' && (
                  <div id="job-form-installments" className="space-y-2">
                    <InstallmentPlanner
                      installments={installments}
                      onChange={(rows) => { setInstallments(rows); clearError('installments'); }}
                      targetAmount={net}
                    />
                    {errorText('installments')}
                  </div>
                )}

                {whtRate > 0 && gross > 0 && (
                  <p className="text-xs text-brand-muted">หัก ณ ที่จ่าย {whtRate}% ({formatCurrency(whtAmount)}) · รับสุทธิ {formatCurrency(net)}</p>
                )}
              </section>

              <div className="border-t border-brand-border" />

              {/* D. รายละเอียดเพิ่มเติม */}
              <section aria-label="รายละเอียดเพิ่มเติม">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(v => !v)}
                  aria-expanded={advancedOpen}
                  className="flex w-full items-center justify-between text-left cursor-pointer"
                >
                  <span className="text-[15px] font-semibold text-brand-text">รายละเอียดเพิ่มเติม</span>
                  <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </button>
                {!advancedOpen && (
                  <p className="mt-0.5 text-xs text-brand-muted">ประเภทงาน หัก ณ ที่จ่าย วันที่เริ่มงาน และโน้ต</p>
                )}
                {advancedOpen && (
                  <div className="mt-4 space-y-5">
                    <div id="job-form-type">
                      <label htmlFor="job-form-type-select" className={labelClass}>ประเภทงาน</label>
                      <div className="relative">
                        <select
                          id="job-form-type-select"
                          value={type}
                          onChange={(e) => { setType(e.target.value); clearError('type'); }}
                          className={`${inputClass(errors.type)} appearance-none pr-9 cursor-pointer`}
                        >
                          {typeOptions.map(option => <option key={option} value={option}>{option}</option>)}
                          <option value={CUSTOM_TYPE}>+ สร้างประเภทเอง…</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                      </div>
                      {type === CUSTOM_TYPE && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            autoFocus
                            value={customType}
                            onChange={(e) => { setCustomType(e.target.value); clearError('type'); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCustomType(); } }}
                            placeholder="ชื่อประเภทงาน"
                            className={inputClass(errors.type)}
                          />
                          <button
                            type="button"
                            onClick={saveCustomType}
                            disabled={!customType.trim()}
                            className="h-11 shrink-0 rounded-[10px] border border-brand-border px-4 text-[13px] text-brand-text hover:bg-brand-faint disabled:opacity-40 cursor-pointer"
                          >
                            เพิ่ม
                          </button>
                        </div>
                      )}
                      {customTypes.includes(type) && (
                        <button
                          type="button"
                          onClick={() => { setJobTypes(prev => prev.filter(t => t !== type)); setType('ยังไม่ระบุ'); }}
                          className="mt-1 text-xs text-[#C43A3A] hover:underline cursor-pointer"
                        >
                          ลบประเภท "{type}" ออกจากรายการ
                        </button>
                      )}
                      {errorText('type')}
                    </div>

                    <div>
                      <p className={labelClass}>หัก ณ ที่จ่าย</p>
                      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="อัตราหัก ณ ที่จ่าย">
                        {WHT_RATES.map(rate => (
                          <button key={rate} type="button" role="radio" aria-checked={whtRate === rate} onClick={() => setWhtRate(rate)} className={segment(whtRate === rate)}>
                            {rate}%
                          </button>
                        ))}
                      </div>
                      {whtRate > 0 && gross > 0 && (
                        <dl className="mt-2 space-y-1 rounded-[10px] bg-brand-faint px-3 py-2.5 text-[13px]">
                          <div className="flex justify-between"><dt className="text-brand-muted">มูลค่างาน</dt><dd className="font-mono">{formatCurrency(gross)}</dd></div>
                          <div className="flex justify-between"><dt className="text-brand-muted">หัก ณ ที่จ่าย {whtRate}%</dt><dd className="font-mono">-{formatCurrency(whtAmount)}</dd></div>
                          <div className="flex justify-between border-t border-brand-border pt-1 font-semibold"><dt>รับสุทธิ</dt><dd className="font-mono">{formatCurrency(net)}</dd></div>
                        </dl>
                      )}
                    </div>

                    <div>
                      <label htmlFor="job-form-startDate" className={labelClass}>วันที่เริ่มงาน</label>
                      {dateInput('job-form-startDate', startDate, setStartDate)}
                    </div>

                    <div>
                      <label htmlFor="job-form-note" className={labelClass}>โน้ต</label>
                      <textarea
                        id="job-form-note"
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม ลิงก์ หรือเงื่อนไขของงาน..."
                        className="w-full rounded-[10px] border border-brand-border bg-brand-white px-3 py-2.5 text-sm text-brand-text placeholder:text-brand-muted outline-none focus:border-[#E65F2B] dark:bg-neutral-950"
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="border-t border-brand-border px-6 py-4">
              {showSummary && (
                <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div><dt className="text-[11px] text-brand-muted">มูลค่างาน</dt><dd className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(gross)}</dd></div>
                  <div><dt className="text-[11px] text-brand-muted">รับแล้ว</dt><dd className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(summaryReceived)}</dd></div>
                  <div><dt className="text-[11px] text-brand-muted">รอรับ</dt><dd className="font-mono text-[13px] font-semibold text-brand-text">{formatCurrency(Math.max(0, net - summaryReceived))}</dd></div>
                </dl>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="h-12 rounded-xl border border-brand-border px-5 text-sm text-brand-text hover:bg-brand-faint cursor-pointer">
                  ยกเลิก
                </button>
                <button type="submit" className="h-12 flex-1 rounded-xl bg-[#E65F2B] text-sm font-semibold text-white hover:bg-[#D85723] cursor-pointer">
                  บันทึกงาน
                </button>
              </div>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

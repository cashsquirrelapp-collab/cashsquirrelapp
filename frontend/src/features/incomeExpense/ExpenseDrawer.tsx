import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { ownMonthlyExpense } from '../../../../shared/monthlySummary';
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, FileText, Paperclip, Upload, X } from 'lucide-react';
import { AppSettings, Expense } from '../../../../shared/types';
import { sumFixedExpenseItems, toLocalDateKey } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { LEGACY_FIXED_NAME } from './expenseMonth';
import { isVaultFileType, useVaultMaybe } from '../vault/VaultProvider';
import { expenseFiles } from '../vault/vaultStatus';
import { VAULT_ACCEPT, VAULT_MAX_BYTES, formatFileSize } from '../../../../shared/vault';

import { tr, T } from '../../i18n/tr';
export const EXPENSE_CATEGORIES = [
  T("ค่าอุปกรณ์/ซอฟต์แวร์"),
  T("ค่าโฆษณา/ยิงแอด"),
  T("ค่าเดินทาง/น้ำมัน"),
  T("อาหาร/รับรองลูกค้า"),
  T("จ้างงานต่อ (Outsource)"),
  T("ภาษี/ธรรมเนียม"),
  T("ค่าบริการ/สาธารณูปโภค"),
  T("อื่นๆ"),
];
const OTHER_CATEGORY = T("อื่นๆ");

// Records saved before the Thai category list stored English keys.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  Equipment: T("ค่าอุปกรณ์/ซอฟต์แวร์"),
  Marketing: T("ค่าโฆษณา/ยิงแอด"),
  Travel: T("ค่าเดินทาง/น้ำมัน"),
  Tax: T("ภาษี/ธรรมเนียม"),
  Fixed: T("ค่าบริการ/สาธารณูปโภค"),
  Other: T("อื่นๆ"),
};
export const categoryLabel = (category: string) => LEGACY_CATEGORY_LABELS[category] || category;
// The saved category stays Thai (it is data); this is how it reads in the app language.
export const categoryText = (category: string) => tr(categoryLabel(category));

interface ExpenseDrawerProps {
  open: boolean;
  expense: Expense | null;
  /** Pre-filled values for a new expense (e.g. recording a fixed monthly line as paid). */
  preset?: { name: string; amount: number; recurring: boolean } | null;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  /** A new expense may bring its own id (so its slips can be kept with it at once). */
  onAdd: (expense: Omit<Expense, 'id'> & { id?: string }) => void;
  onEdit: (id: string, updated: Partial<Expense>) => void;
  onClose: () => void;
  triggerAlert: (title: string, message: string) => void;
  /** Slips in the form itself: admins only for now (owner, 2026-10-29: "แค่เฉพาะเมนูแอดมิน ... เดี๋ยวฟีเจอร์นี้จะปล่อย"). */
  slips?: boolean;
}

type PickedSlip = { key: string; file: File; preview: string | null; error: string };

/**
 * Add/edit one expense. "ประจำ" keeps the existing behaviour: it adds (or refreshes the amount
 * of) a matching line in Settings' fixed monthly costs, and never removes one on its own --
 * that stays a deliberate action in Settings.
 */
export default function ExpenseDrawer({ open, expense, preset, settings, onUpdateSettings, onAdd, onEdit, onClose, triggerAlert, slips = false }: ExpenseDrawerProps) {
  const vault = useVaultMaybe();
  const slipsOn = slips && Boolean(vault?.available);
  const [picked, setPicked] = React.useState<PickedSlip[]>([]);
  const [uploading, setUploading] = React.useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const previews = React.useRef<string[]>([]);
  const releasePreviews = () => { previews.current.forEach(url => URL.revokeObjectURL(url)); previews.current = []; };
  const addSlips = (list: FileList | File[] | null) => {
    if (!list) return;
    const next = Array.from(list).map((file, i): PickedSlip => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      if (preview) previews.current.push(preview);
      return { key: `${Date.now()}-${i}-${file.name}`, file, preview,
        error: !isVaultFileType(file) ? tr("รองรับเฉพาะ PDF, JPG, PNG, WEBP") : file.size > VAULT_MAX_BYTES ? tr("ไฟล์ใหญ่เกิน 10 MB") : '' };
    });
    setPicked(current => [...current, ...next]);
  };
  const keptSlips = slipsOn && expense && vault ? expenseFiles(expense, vault.files).length : 0;
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(toLocalDateKey());
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = React.useState('');
  const [note, setNote] = React.useState('');
  const [recurring, setRecurring] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; amount?: string; date?: string }>({});

  const fixedItems = settings.fixedExpenseItems || [];
  const legacyLump = fixedItems.length === 0 && ownMonthlyExpense(settings.monthlyExpense, fixedItems) > 0;
  const findFixedItem = (value: string) => fixedItems.find(item => item.name.trim().toLowerCase() === value.trim().toLowerCase());

  React.useEffect(() => {
    if (!open) return;
    setName(expense?.name ?? preset?.name ?? '');
    setAmount(expense ? String(expense.amount) : preset ? String(preset.amount) : '');
    setDate(expense?.date ?? toLocalDateKey());
    const savedCategory = expense ? categoryLabel(expense.category) : EXPENSE_CATEGORIES[0];
    if (EXPENSE_CATEGORIES.includes(savedCategory)) {
      setCategory(savedCategory);
      setCustomCategory('');
    } else {
      // Custom categories are edited through "อื่นๆ" while preserving their real saved name.
      setCategory(OTHER_CATEGORY);
      setCustomCategory(savedCategory);
    }
    setNote(expense?.note ?? '');
    // Pre-selected when this record's name already matches a fixed line in Settings.
    setRecurring(expense ? Boolean(findFixedItem(expense.name)) : Boolean(preset?.recurring));
    setErrors({});
    setPicked([]); setUploading(null); setDragging(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); releasePreviews(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id, preset?.name]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    const value = parseFloat(amount) || 0;
    const next = {
      name: name.trim() ? undefined : tr("กรุณาระบุชื่อรายการ"),
      amount: value > 0 ? undefined : tr("กรุณาระบุจำนวนเงิน"),
      date: date ? undefined : tr("กรุณาเลือกวันที่"),
    };
    setErrors(next);
    if (next.name || next.amount || next.date) return;

    const finalCategory = category === OTHER_CATEGORY ? customCategory.trim() || OTHER_CATEGORY : category;
    const payload = { name: name.trim(), amount: value, category: finalCategory, date, note };
    const id = expense?.id ?? crypto.randomUUID();
    if (expense) onEdit(expense.id, payload); else onAdd({ ...payload, id });

    let fixedNote = '';
    if (recurring) {
      // An account that only has the old lump-sum total keeps it as its own item -- and the match
      // is looked up in that list, so recording the lump itself updates it instead of adding a twin.
      const baseItems = fixedItems.length === 0 && ownMonthlyExpense(settings.monthlyExpense, fixedItems) > 0
        ? [{ id: crypto.randomUUID(), name: LEGACY_FIXED_NAME, amount: settings.monthlyExpense }]
        : fixedItems;
      const existing = baseItems.find(item => item.name.trim().toLowerCase() === payload.name.trim().toLowerCase());
      const updatedItems = existing
        ? baseItems.map(item => item.id === existing.id ? { ...item, amount: payload.amount } : item)
        : [...baseItems, { id: crypto.randomUUID(), name: payload.name, amount: payload.amount }];
      onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
      fixedNote = existing ? tr(" และอัปเดตยอดในรายจ่ายประจำให้แล้ว") : tr(" และเพิ่มเป็นรายจ่ายประจำทุกเดือนให้แล้ว");
    }
    // The expense is saved first; its slips follow (the form waits, so nothing is left half-done).
    const ready = slipsOn && vault ? picked.filter(item => !item.error) : [];
    let slipNote = '';
    if (ready.length && vault) {
      setUploading({ done: 0, total: ready.length });
      const result = await vault.attachToExpense({ id, name: payload.name }, ready.map(item => item.file), (done, total) => setUploading({ done, total }));
      setUploading(null);
      if (result.proRequired) slipNote = tr(" แต่ยังแนบสลิปไม่ได้ คลังเอกสารใช้ได้กับสมาชิก Pro");
      else if (result.failed.length) slipNote = tr(" แนบสลิปได้ {0} จาก {1} ไฟล์ แนบไฟล์ที่เหลือได้ที่รายละเอียดรายจ่าย", String(result.saved), String(ready.length));
      else slipNote = tr(" พร้อมสลิป {0} ไฟล์", String(result.saved));
    }
    triggerAlert(expense ? tr("แก้ไขรายจ่ายสำเร็จ") : tr("บันทึกรายจ่ายสำเร็จ"), `${expense ? tr("อัปเดตข้อมูลรายจ่ายเรียบร้อยแล้ว") : tr("บันทึกรายจ่ายเรียบร้อยแล้ว")}${slipNote}${fixedNote}`);
    onClose();
  };

  const label = 'mb-1.5 block text-[13px] font-medium text-brand-text';
  const input = (error?: string) =>
    `${uiInput} h-11 ${error ? 'border-[#E95454]' : 'border-brand-border'}`;
  const errorText = (error?: string) => error ? <p className="mt-1 text-xs text-[#C43A3A] dark:text-rose-300">{error}</p> : null;
  const segment = (active: boolean) =>
    `rounded-[10px] border px-3 py-2.5 text-left transition-colors cursor-pointer ${active
      ? 'border-[#F3B08C] bg-[#FFF1E8] dark:border-orange-400/40 dark:bg-orange-500/10'
      : 'border-brand-border bg-brand-white hover:bg-brand-faint'}`;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-[rgba(33,29,26,0.35)]" />
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-drawer-title"
            onSubmit={submit}
            noValidate
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(33,29,26,0.18)] sm:max-w-[460px] dark:bg-stone-900"
          >
            <div className="flex items-start justify-between gap-3 border-b border-brand-border px-6 py-5">
              <div>
                <h2 id="expense-drawer-title" className="text-lg font-semibold text-brand-text">{expense ? tr("แก้ไขรายจ่าย") : tr("เพิ่มรายจ่าย")}</h2>
                <p className="mt-0.5 text-[13px] text-brand-muted">{tr("บันทึกค่าใช้จ่ายที่เกิดขึ้นจริง")}</p>
              </div>
              <button type="button" onClick={onClose} aria-label={tr("ปิด")} className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <div>
                <label htmlFor="expense-name" className={label}>{tr("รายการ")}{' '}<span className="text-[#C43A3A]">*</span></label>
                <input id="expense-name" type="text" autoFocus value={name} onChange={(e) => { setName(e.target.value); setErrors(v => ({ ...v, name: undefined })); }} placeholder={tr("เช่น ค่าเช่าห้อง, ค่าเดินทาง")} className={input(errors.name)} />
                {errorText(errors.name)}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="expense-amount" className={label}>{tr("จำนวนเงิน")}{' '}<span className="text-[#C43A3A]">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">{tr("฿")}</span>
                    <NumberInput id="expense-amount" value={amount} onChange={(raw) => { setAmount(raw); setErrors(v => ({ ...v, amount: undefined })); }} placeholder="0" className={`${input(errors.amount)} pl-7 font-mono`} />
                  </div>
                  {errorText(errors.amount)}
                </div>
                <div>
                  <label htmlFor="expense-date" className={label}>{tr("วันที่")}{' '}<span className="text-[#C43A3A]">*</span></label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                    <input id="expense-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors(v => ({ ...v, date: undefined })); }} className={`${input(errors.date)} pl-9`} />
                  </div>
                  {errorText(errors.date)}
                </div>
              </div>
              <div>
                <label htmlFor="expense-category" className={label}>{tr("หมวดหมู่")}{' '}<span className="text-[#C43A3A]">*</span></label>
                <select id="expense-category" value={category} onChange={(e) => { setCategory(e.target.value); if (e.target.value !== OTHER_CATEGORY) setCustomCategory(''); }} className={`${input()} cursor-pointer`}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{tr(c)}</option>)}
                </select>
                {category === OTHER_CATEGORY && (
                  <div className="mt-2 rounded-[10px] bg-brand-faint/70 p-3">
                    <label htmlFor="expense-custom-category" className={label}>{tr("ระบุหมวดหมู่เอง")}</label>
                    <input
                      id="expense-custom-category"
                      type="text"
                      autoFocus
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder={tr("เช่น ค่าดูแลสัตว์เลี้ยง")}
                      className={input()}
                    />
                    <p className="mt-1 text-xs text-brand-muted">{tr("เว้นว่างได้ หากต้องการใช้หมวด “อื่นๆ”")}</p>
                  </div>
                )}
              </div>
              <fieldset>
                <legend className={label}>{tr("ประเภท")}</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  <button type="button" role="radio" aria-checked={!recurring} onClick={() => setRecurring(false)} className={segment(!recurring)}>
                    <span className={`block text-[13px] ${!recurring ? 'font-semibold text-[#C24A16] dark:text-orange-300' : 'font-medium text-brand-text'}`}>{tr("รายจ่ายทั่วไป")}</span>
                    <span className="mt-0.5 block text-[11px] text-brand-muted">{tr("จ่ายครั้งนี้ครั้งเดียว")}</span>
                  </button>
                  <button type="button" role="radio" aria-checked={recurring} onClick={() => setRecurring(true)} className={segment(recurring)}>
                    <span className={`block text-[13px] ${recurring ? 'font-semibold text-[#C24A16] dark:text-orange-300' : 'font-medium text-brand-text'}`}>{tr("รายจ่ายประจำ")}</span>
                    <span className="mt-0.5 block text-[11px] text-brand-muted">{tr("จ่ายทุกเดือน เช่น ค่าห้อง ค่าเน็ต")}</span>
                  </button>
                </div>
                {recurring && (
                  <div className="mt-2 rounded-[10px] bg-brand-faint px-3 py-2.5 text-xs leading-relaxed text-brand-muted">
                    <p>{tr("ใช้สำหรับค่าใช้จ่ายที่เกิดซ้ำเป็นประจำ เช่น อินเทอร์เน็ต ค่าบริการ หรือค่าสมาชิก")}</p>
                    <p className="mt-1 text-brand-text">
                      {findFixedItem(name) || (legacyLump && name.trim() === LEGACY_FIXED_NAME) ? tr("อัปเดตยอด \"{0}\" ในรายจ่ายประจำทุกเดือน", name.trim()) : tr("เพิ่มรายการนี้เข้ารายจ่ายประจำทุกเดือน แก้หรือเอาออกได้ที่ \"จัดการรายจ่ายประจำ\"")}
                    </p>
                  </div>
                )}
              </fieldset>
              <div>
                <label htmlFor="expense-note" className={label}>{tr("หมายเหตุ")}</label>
                <input id="expense-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("เช่น ใบเสร็จอยู่ในอีเมล")} className={input()} />
              </div>
              {slipsOn && (
                <div data-testid="expense-form-slips"
                  onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
                  onDrop={(e) => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); setDragging(false); addSlips(e.dataTransfer.files); }}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={label.replace('mb-1.5 ', '')}>{tr("สลิป / ใบเสร็จ")}</span>
                    <span className="rounded-full bg-brand-faint px-2 py-px text-[11px] font-semibold text-brand-muted">{tr("เฉพาะแอดมิน")}</span>
                    {keptSlips > 0 && <span className="ml-auto text-xs text-brand-muted">{tr("มีสลิปแล้ว {0} ไฟล์", String(keptSlips))}</span>}
                  </div>
                  <input ref={fileInput} type="file" accept={VAULT_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden="true"
                    onChange={(e) => { addSlips(e.target.files); e.target.value = ''; }} />
                  {picked.length > 0 && (
                    <ul className="mb-2 divide-y divide-brand-border rounded-[10px] border border-brand-border">
                      {picked.map(item => (
                        <li key={item.key} className="flex items-center gap-3 px-3 py-2">
                          {item.preview
                            ? <img src={item.preview} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                            : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-faint text-brand-muted"><FileText className="h-5 w-5" /></span>}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-brand-text">{item.file.name}</span>
                            <span className={`block text-xs ${item.error ? 'text-[#C43A3A] dark:text-rose-300' : 'text-brand-muted'}`}>{item.error || formatFileSize(item.file.size)}</span>
                          </span>
                          <button type="button" onClick={() => setPicked(list => list.filter(p => p.key !== item.key))} disabled={Boolean(uploading)}
                            aria-label={tr("เอาไฟล์ออก")} title={tr("เอาไฟล์ออก")} className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text disabled:opacity-40 cursor-pointer"><X className="h-4 w-4" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => fileInput.current?.click()} disabled={Boolean(uploading)}
                    className={`flex w-full items-center gap-3 rounded-[10px] border border-dashed px-3 py-3 text-left transition-colors cursor-pointer disabled:opacity-50 ${dragging ? 'border-[#E65F2B] bg-[#FFF5EE] dark:bg-[#E65F2B]/10' : 'border-brand-border hover:bg-brand-faint'}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]">{picked.length ? <Paperclip className="h-4 w-4" /> : <Upload className="h-4 w-4" />}</span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-brand-text">{dragging ? tr("วางไฟล์ที่นี่") : picked.length ? tr("แนบเพิ่ม") : tr("แนบสลิปโอนเงินหรือใบเสร็จ")}</span>
                      <span className="block text-xs text-brand-muted">{tr("ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์ / ถ่ายรูป")}</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-brand-border px-6 py-4">
              <button type="button" onClick={onClose} className={`${uiSecondaryButton} h-12`}>{tr("ยกเลิก")}</button>
              <button type="submit" disabled={Boolean(uploading)} className={`${uiPrimaryButton} h-12 flex-1 disabled:opacity-70`}>
                {uploading ? tr("กำลังแนบสลิป {0}/{1}…", String(uploading.done), String(uploading.total)) : tr("บันทึกรายจ่าย")}
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

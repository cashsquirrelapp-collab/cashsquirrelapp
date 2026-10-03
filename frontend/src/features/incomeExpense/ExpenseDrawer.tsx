import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, X } from 'lucide-react';
import { AppSettings, Expense } from '../../../../shared/types';
import { sumFixedExpenseItems, toLocalDateKey } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { LEGACY_FIXED_NAME } from './expenseMonth';

export const EXPENSE_CATEGORIES = [
  'ค่าอุปกรณ์/ซอฟต์แวร์',
  'ค่าโฆษณา/ยิงแอด',
  'ค่าเดินทาง/น้ำมัน',
  'อาหาร/รับรองลูกค้า',
  'จ้างงานต่อ (Outsource)',
  'ภาษี/ธรรมเนียม',
  'ค่าบริการ/สาธารณูปโภค',
  'อื่นๆ',
];

// Records saved before the Thai category list stored English keys.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  Equipment: 'ค่าอุปกรณ์/ซอฟต์แวร์',
  Marketing: 'ค่าโฆษณา/ยิงแอด',
  Travel: 'ค่าเดินทาง/น้ำมัน',
  Tax: 'ภาษี/ธรรมเนียม',
  Fixed: 'ค่าบริการ/สาธารณูปโภค',
  Other: 'อื่นๆ',
};
export const categoryLabel = (category: string) => LEGACY_CATEGORY_LABELS[category] || category;

interface ExpenseDrawerProps {
  open: boolean;
  expense: Expense | null;
  /** Pre-filled values for a new expense (e.g. recording a fixed monthly line as paid). */
  preset?: { name: string; amount: number; recurring: boolean } | null;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onAdd: (expense: Omit<Expense, 'id'>) => void;
  onEdit: (id: string, updated: Partial<Expense>) => void;
  onClose: () => void;
  triggerAlert: (title: string, message: string) => void;
}

/**
 * Add/edit one expense. "ประจำ" keeps the existing behaviour: it adds (or refreshes the amount
 * of) a matching line in Settings' fixed monthly costs, and never removes one on its own --
 * that stays a deliberate action in Settings.
 */
export default function ExpenseDrawer({ open, expense, preset, settings, onUpdateSettings, onAdd, onEdit, onClose, triggerAlert }: ExpenseDrawerProps) {
  const [name, setName] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(toLocalDateKey());
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = React.useState('');
  const [recurring, setRecurring] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; amount?: string; date?: string }>({});

  const fixedItems = settings.fixedExpenseItems || [];
  const legacyLump = fixedItems.length === 0 && settings.monthlyExpense > 0;
  const findFixedItem = (value: string) => fixedItems.find(item => item.name.trim().toLowerCase() === value.trim().toLowerCase());

  React.useEffect(() => {
    if (!open) return;
    setName(expense?.name ?? preset?.name ?? '');
    setAmount(expense ? String(expense.amount) : preset ? String(preset.amount) : '');
    setDate(expense?.date ?? toLocalDateKey());
    setCategory(expense ? categoryLabel(expense.category) : EXPENSE_CATEGORIES[0]);
    setNote(expense?.note ?? '');
    // Pre-selected when this record's name already matches a fixed line in Settings.
    setRecurring(expense ? Boolean(findFixedItem(expense.name)) : Boolean(preset?.recurring));
    setErrors({});
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id, preset?.name]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = parseFloat(amount) || 0;
    const next = {
      name: name.trim() ? undefined : 'กรุณาระบุชื่อรายการ',
      amount: value > 0 ? undefined : 'กรุณาระบุจำนวนเงิน',
      date: date ? undefined : 'กรุณาเลือกวันที่',
    };
    setErrors(next);
    if (next.name || next.amount || next.date) return;

    const payload = { name: name.trim(), amount: value, category, date, note };
    if (expense) onEdit(expense.id, payload); else onAdd(payload);

    let fixedNote = '';
    if (recurring) {
      // An account that only has the old lump-sum total keeps it as its own item -- and the match
      // is looked up in that list, so recording the lump itself updates it instead of adding a twin.
      const baseItems = fixedItems.length === 0 && settings.monthlyExpense > 0
        ? [{ id: crypto.randomUUID(), name: LEGACY_FIXED_NAME, amount: settings.monthlyExpense }]
        : fixedItems;
      const existing = baseItems.find(item => item.name.trim().toLowerCase() === payload.name.trim().toLowerCase());
      const updatedItems = existing
        ? baseItems.map(item => item.id === existing.id ? { ...item, amount: payload.amount } : item)
        : [...baseItems, { id: crypto.randomUUID(), name: payload.name, amount: payload.amount }];
      onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
      fixedNote = existing ? ' และอัปเดตยอดในรายจ่ายประจำให้แล้ว' : ' และเพิ่มเป็นรายจ่ายประจำทุกเดือนให้แล้ว';
    }
    triggerAlert(expense ? 'แก้ไขรายจ่ายสำเร็จ' : 'บันทึกรายจ่ายสำเร็จ', `${expense ? 'อัปเดตข้อมูลรายจ่ายเรียบร้อยแล้ว' : 'บันทึกรายจ่ายเรียบร้อยแล้ว'}${fixedNote}`);
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
                <h2 id="expense-drawer-title" className="text-lg font-semibold text-brand-text">{expense ? 'แก้ไขรายจ่าย' : 'เพิ่มรายจ่าย'}</h2>
                <p className="mt-0.5 text-[13px] text-brand-muted">บันทึกค่าใช้จ่ายที่เกิดขึ้นจริง</p>
              </div>
              <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <div>
                <label htmlFor="expense-name" className={label}>รายการ <span className="text-[#C43A3A]">*</span></label>
                <input id="expense-name" type="text" autoFocus value={name} onChange={(e) => { setName(e.target.value); setErrors(v => ({ ...v, name: undefined })); }} placeholder="เช่น ค่าเช่าห้อง, ค่าเดินทาง" className={input(errors.name)} />
                {errorText(errors.name)}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="expense-amount" className={label}>จำนวนเงิน <span className="text-[#C43A3A]">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">฿</span>
                    <NumberInput id="expense-amount" value={amount} onChange={(raw) => { setAmount(raw); setErrors(v => ({ ...v, amount: undefined })); }} placeholder="0" className={`${input(errors.amount)} pl-7 font-mono`} />
                  </div>
                  {errorText(errors.amount)}
                </div>
                <div>
                  <label htmlFor="expense-date" className={label}>วันที่ <span className="text-[#C43A3A]">*</span></label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                    <input id="expense-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors(v => ({ ...v, date: undefined })); }} className={`${input(errors.date)} pl-9`} />
                  </div>
                  {errorText(errors.date)}
                </div>
              </div>
              <div>
                <label htmlFor="expense-category" className={label}>หมวดหมู่ <span className="text-[#C43A3A]">*</span></label>
                <select id="expense-category" value={category} onChange={(e) => setCategory(e.target.value)} className={`${input()} cursor-pointer`}>
                  {/* A historical category that is no longer in the list stays selectable as-is. */}
                  {[...EXPENSE_CATEGORIES, ...(EXPENSE_CATEGORIES.includes(category) ? [] : [category])].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <fieldset>
                <legend className={label}>ประเภท</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup">
                  <button type="button" role="radio" aria-checked={!recurring} onClick={() => setRecurring(false)} className={segment(!recurring)}>
                    <span className={`block text-[13px] ${!recurring ? 'font-semibold text-[#C24A16] dark:text-orange-300' : 'font-medium text-brand-text'}`}>รายจ่ายทั่วไป</span>
                    <span className="mt-0.5 block text-[11px] text-brand-muted">จ่ายครั้งนี้ครั้งเดียว</span>
                  </button>
                  <button type="button" role="radio" aria-checked={recurring} onClick={() => setRecurring(true)} className={segment(recurring)}>
                    <span className={`block text-[13px] ${recurring ? 'font-semibold text-[#C24A16] dark:text-orange-300' : 'font-medium text-brand-text'}`}>รายจ่ายประจำ</span>
                    <span className="mt-0.5 block text-[11px] text-brand-muted">จ่ายทุกเดือน เช่น ค่าห้อง ค่าเน็ต</span>
                  </button>
                </div>
                {recurring && (
                  <div className="mt-2 rounded-[10px] bg-brand-faint px-3 py-2.5 text-xs leading-relaxed text-brand-muted">
                    <p>ใช้สำหรับค่าใช้จ่ายที่เกิดซ้ำเป็นประจำ เช่น อินเทอร์เน็ต ค่าบริการ หรือค่าสมาชิก</p>
                    <p className="mt-1 text-brand-text">
                      {findFixedItem(name) || (legacyLump && name.trim() === LEGACY_FIXED_NAME) ? `อัปเดตยอด "${name.trim()}" ในรายจ่ายประจำทุกเดือน` : 'เพิ่มรายการนี้เข้ารายจ่ายประจำทุกเดือน แก้หรือเอาออกได้ที่ "จัดการรายจ่ายประจำ"'}
                    </p>
                  </div>
                )}
              </fieldset>
              <div>
                <label htmlFor="expense-note" className={label}>หมายเหตุ</label>
                <input id="expense-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ใบเสร็จอยู่ในอีเมล" className={input()} />
              </div>
            </div>

            <div className="flex gap-3 border-t border-brand-border px-6 py-4">
              <button type="button" onClick={onClose} className={`${uiSecondaryButton} h-12`}>ยกเลิก</button>
              <button type="submit" className={`${uiPrimaryButton} h-12 flex-1`}>บันทึกรายจ่าย</button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

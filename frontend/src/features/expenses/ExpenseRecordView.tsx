import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Expense } from '../../../../shared/types';
import { formatCurrency, getMonthKey, formatMonthKey } from '../../utils';
import { Plus, Trash2, Receipt, Pencil } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import NumberInput from '../../components/ui/NumberInput';

interface ExpenseRecordViewProps {
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  onEditExpense: (id: string, updated: Partial<Expense>) => void;
  onDeleteExpense: (id: string) => void;
  selectedMonth: string;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  autoOpenAdd?: boolean;
  onAutoOpenAddHandled?: () => void;
  scrollToExpenseId?: string | null;
  onScrollToExpenseHandled?: () => void;
}

const EXPENSE_CATEGORIES = [
  'ค่าอุปกรณ์/ซอฟต์แวร์',
  'ค่าโฆษณา/ยิงแอด',
  'ค่าเดินทาง/น้ำมัน',
  'อาหาร/รับรองลูกค้า',
  'จ้างงานต่อ (Outsource)',
  'ภาษี/ธรรมเนียม',
  'ค่าบริการ/สาธารณูปโภค',
  'อื่นๆ'
];

// The "รายจ่าย" half of the บันทึกรายรับ-รายจ่าย umbrella tab -- lives alongside JobsTab
// (the "รายรับ" half) instead of buried inside the Summary tab, so recording either an
// income or an expense starts from the same obvious place.
export default function ExpenseRecordView({
  expenses,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  selectedMonth,
  triggerAlert,
  triggerConfirm,
  autoOpenAdd,
  onAutoOpenAddHandled,
  scrollToExpenseId,
  onScrollToExpenseHandled,
}: ExpenseRecordViewProps) {
  // One shared bottom-sheet form for both add and edit -- `formMode` picks which action submit
  // takes, `editingId` carries which record is being edited (null while adding).
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expName, setExpName] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expDate, setExpDate] = useState(new Date().toISOString().split('T')[0]);
  const [expNote, setExpNote] = useState('');
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);

  const openAddForm = () => {
    setExpName('');
    setExpAmount('');
    setExpCategory(EXPENSE_CATEGORIES[0]);
    setExpDate(new Date().toISOString().split('T')[0]);
    setExpNote('');
    setEditingId(null);
    setFormMode('add');
  };

  const openEditForm = (expense: Expense) => {
    setExpName(expense.name);
    setExpAmount(String(expense.amount));
    setExpCategory(expense.category);
    setExpDate(expense.date);
    setExpNote(expense.note || '');
    setEditingId(expense.id);
    setFormMode('edit');
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
  };

  React.useEffect(() => {
    if (!autoOpenAdd) return;
    openAddForm();
    onAutoOpenAddHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd, onAutoOpenAddHandled]);

  // Same scroll-to-and-highlight-real-row pattern as JobsTab's scrollToJobId -- shared by every
  // clickable expense reference outside this view (currently the LINE assistant's "เปิดแอป"
  // button on a saved-expense card), so tapping it lands on the actual row instead of just the
  // top of the tab.
  React.useEffect(() => {
    if (!scrollToExpenseId) return;
    const el = document.getElementById(`expense-card-${scrollToExpenseId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedExpenseId(scrollToExpenseId);
      const timer = setTimeout(() => setHighlightedExpenseId(null), 2500);
      onScrollToExpenseHandled?.();
      return () => clearTimeout(timer);
    }
    // Expense isn't in the currently visible month's list -- nothing to scroll to, still consume
    // the request so it doesn't fire again on next render.
    onScrollToExpenseHandled?.();
  }, [scrollToExpenseId, onScrollToExpenseHandled]);

  const monthExpenses = useMemo(
    () => expenses.filter(e => getMonthKey(e.date) === selectedMonth).sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, selectedMonth]
  );
  const totalVariableExpense = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expName.trim() || !expAmount) {
      triggerAlert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อรายการและจำนวนเงินของค่าใช้จ่ายให้ครบถ้วน');
      return;
    }
    const payload = {
      name: expName,
      amount: parseFloat(expAmount) || 0,
      category: expCategory,
      date: expDate,
      note: expNote
    };
    if (formMode === 'edit' && editingId) {
      onEditExpense(editingId, payload);
      triggerAlert('แก้ไขรายจ่ายสำเร็จ!', 'อัปเดตข้อมูลรายจ่ายเรียบร้อยแล้ว');
    } else {
      onAddExpense(payload);
      triggerAlert('บันทึกรายจ่ายสำเร็จ!', 'บันทึกข้อมูลรายจ่ายผันแปรของคุณเรียบร้อยแล้ว');
    }
    closeForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-1">
        <div>
          <span className="text-xs font-semibold tracking-wider text-brand-muted uppercase">
            ผู้ช่วยจัดการรายจ่าย
          </span>
          <h2 className="text-3xl font-bold font-display text-brand-text tracking-tight mt-0.5">
            รายจ่ายผันแปร ({monthExpenses.length})
          </h2>
        </div>
      </div>

      <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-brand-border/40 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4.5 h-4.5 text-orange-500" />
            <div>
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                บันทึกรายจ่ายผันแปรเสริมประจำเดือน
              </h3>
              <p className="text-[10px] text-brand-muted dark:text-neutral-400 mt-0.5">
                บันทึกรายจ่ายเพิ่มเติมในรอบเดือนนี้ (ค่าอุปกรณ์, ค่าแอด, ค่าเดินทาง ฯลฯ)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-orange-700 bg-orange-50 dark:bg-orange-500/10 dark:text-orange-400 px-2.5 py-1 rounded-md font-mono">
              จ่ายเพิ่มรวม {formatCurrency(totalVariableExpense)}
            </span>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={openAddForm}
              className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> บันทึกรายจ่าย
            </motion.button>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] font-bold text-brand-text dark:text-neutral-300 uppercase tracking-wide">
            รายละเอียดรายจ่ายประจำเดือน {formatMonthKey(selectedMonth)} ({monthExpenses.length} รายการ)
          </h4>

          {monthExpenses.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-brand-border dark:border-neutral-800 rounded-2xl bg-brand-faint/10 flex flex-col items-center gap-2">
              <Mascot mood="sleepy" size={56} />
              <p className="text-xs font-semibold text-brand-muted">ไม่มีบันทึกรายจ่ายผันแปรเสริมสำหรับเดือนนี้</p>
              <p className="text-[9px] text-brand-muted/80">เงินสดไหลคงเหลือเต็มเม็ดเต็มหน่วย</p>
            </div>
          ) : (
            <div className="space-y-2 divide-y divide-brand-border/20 dark:divide-neutral-800">
              {monthExpenses.map(e => (
                <div
                  key={e.id}
                  id={`expense-card-${e.id}`}
                  className={`pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs rounded-xl transition-colors duration-500 ${
                    highlightedExpenseId === e.id ? 'bg-orange-50 dark:bg-orange-500/10 -mx-2 px-2' : ''
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-brand-text dark:text-white">{e.name}</span>
                      <span className="text-[8px] bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold px-1.5 py-0.5 rounded-sm">
                        {e.category}
                      </span>
                      {e.note && (
                        <span className="text-[9px] text-brand-muted italic">({e.note})</span>
                      )}
                    </div>
                    <p className="text-[9px] text-brand-muted font-mono">{e.date}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold font-mono text-rose-600">
                      -{formatCurrency(e.amount)}
                    </span>
                    <button
                      onClick={() => openEditForm(e)}
                      className="p-1 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-muted hover:text-brand-text rounded-md transition-colors cursor-pointer"
                      title="แก้ไขรายจ่ายนี้"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        triggerConfirm(
                          'ยืนยันการลบรายจ่าย',
                          `คุณต้องการลบรายการรายจ่าย "${e.name}" จำนวนเงิน ${formatCurrency(e.amount)} ใช่หรือไม่?`,
                          () => onDeleteExpense(e.id)
                        );
                      }}
                      className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-brand-muted hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                      title="ลบรายจ่ายนี้"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sliding Bottom Sheet Modal for Adding/Editing a Variable Expense */}
      <AnimatePresence>
        {formMode !== null && (
          <div className="fixed inset-0 z-200">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeForm}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4 font-sans border-t border-brand-border/40"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-1 shrink-0" />

              <div className="flex justify-between items-center shrink-0">
                <h3 className="text-lg font-black text-brand-text dark:text-white font-display">
                  {formMode === 'edit' ? 'แก้ไขรายจ่าย' : 'บันทึกค่าใช้จ่ายใหม่'}
                </h3>
                <button
                  onClick={closeForm}
                  className="w-8 h-8 rounded-full bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-xl text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors cursor-pointer"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleExpenseSubmit} className="space-y-3 text-xs font-semibold">
                <div>
                  <label className="text-[9px] font-bold text-brand-muted block mb-1">ชื่อรายการรายจ่าย</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="เช่น ซื้อจอมอนิเตอร์, ค่าส่งของลูกค้า"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    className="w-full bg-brand-white dark:bg-neutral-800 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2.5 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-bold text-brand-muted block mb-1">จำนวนเงิน (บาท)</label>
                  <NumberInput
                    placeholder="เช่น 1500"
                    value={expAmount}
                    onChange={setExpAmount}
                    className="w-full bg-brand-white dark:bg-neutral-800 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2.5 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-orange-500/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-brand-muted block mb-1">หมวดหมู่</label>
                    <select
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="w-full bg-brand-white dark:bg-neutral-800 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2 py-2 text-xs font-semibold outline-none cursor-pointer"
                    >
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-brand-muted block mb-1">วันที่ทำรายการ</label>
                    <input
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                      className="w-full bg-brand-white dark:bg-neutral-800 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2 py-2 text-xs font-semibold outline-none cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-brand-muted block mb-1">หมายเหตุ / โน้ตย่อ</label>
                  <input
                    type="text"
                    placeholder="เช่น ใบเสร็จอยู่ในเครื่อง..."
                    value={expNote}
                    onChange={(e) => setExpNote(e.target.value)}
                    className="w-full bg-brand-white dark:bg-neutral-800 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-lg px-2.5 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-orange-500/30"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {formMode === 'edit' ? (
                    <>
                      <Pencil className="w-3.5 h-3.5" /> บันทึกการแก้ไข
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> บันทึกจ่ายออกผันแปร
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

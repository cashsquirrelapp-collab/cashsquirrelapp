import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Target, Check, Plus, Backpack, GraduationCap, Laptop, Briefcase } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconCamera, IconLaptop, IconGraduation, IconBag, IconPencil, IconClose } from '../../components/ui/icons';
import { AppSettings, Goal, FixedExpenseItem } from '../../../../shared/types';
import { formatCurrency, formatNumberWithCommas, stripNumberInput, sumFixedExpenseItems } from '../../utils';

// Drives the default nav grouping in App.tsx (see PERSONA_CORE_KEYS there) -- picking one
// here doesn't lock anything away, it just changes what shows up in the main menu by
// default vs the collapsible "เครื่องมือเพิ่มเติม" section.
const PERSONA_OPTIONS: { id: NonNullable<AppSettings['userPersona']>; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'school', label: 'นักเรียน', description: 'เก็บเงินค่าขนม บันทึกรายรับ-รายจ่ายง่ายๆ', icon: Backpack },
  { id: 'university', label: 'นักศึกษา', description: 'มีรายได้พิเศษบ้าง อยากตั้งเป้าออมด้วย', icon: GraduationCap },
  { id: 'freelance', label: 'ฟรีแลนซ์', description: 'รับงานเป็นชิ้น ต้องตามเครดิตเทอม ออกบิล', icon: Laptop },
  { id: 'employee', label: 'วัยทำงาน', description: 'เงินเดือนประจำ อยากคุมรายจ่ายและออมเงิน', icon: Briefcase },
];

interface ProfileSetupWizardProps {
  isOpen: boolean;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onAddJobTypes: (types: string[]) => void;
  onComplete: () => void;
  /** True when reopened from Settings for a preview, rather than a real first-time signup. */
  isPreview?: boolean;
}

// jobTypeLabel is what actually gets added to the real "เลือกประเภทงาน" picker options —
// answering this question needs to actually change what shows up there later, not just sit
// unused as profile metadata.
const JOB_TYPE_OPTIONS = [
  { id: 'sponsor', label: 'รับงานสปอนเซอร์ / รีวิวคอนเทนต์', jobTypeLabel: 'Sponsored Post', icon: IconCamera },
  { id: 'freelance', label: 'รับงานฟรีแลนซ์ทั่วไป (ออกแบบ/เขียน/ตัดต่อ ฯลฯ)', jobTypeLabel: 'งานฟรีแลนซ์ทั่วไป', icon: IconLaptop },
  { id: 'consulting', label: 'รับงานที่ปรึกษา / สอนพิเศษ', jobTypeLabel: 'Consulting / Advisory', icon: IconGraduation },
  { id: 'selling', label: 'ขายสินค้า / บริการส่วนตัว', jobTypeLabel: 'ขายสินค้า / บริการส่วนตัว', icon: IconBag },
  { id: 'other', label: 'อื่นๆ', jobTypeLabel: null, icon: IconPencil },
];

const STEP_TITLES = [
  'คุณคือใคร?',
  'คุณรับงานแบบไหนบ้าง?',
  'ค่าใช้จ่ายคงที่ต่อเดือนของคุณ',
  'อยากตั้งเป้าหมายเก็บเงินไว้เลยไหม?',
];

const STEP_DESCRIPTIONS = [
  'ใช้จัดเมนูหลักให้เหมาะกับคุณ ไม่บังคับ เปลี่ยนทีหลังได้เสมอ',
  'เลือกได้มากกว่า 1 ข้อ ใช้ทำโปรไฟล์ของคุณเท่านั้น',
  'ระบบใช้ยอดนี้คำนวณกำไรสุทธิและแจ้งเตือนให้คุณทุกเดือน',
  'ไม่บังคับ ตั้งเพิ่มทีหลังได้ในหน้าจัดสรรเงิน',
];

export const ProfileSetupWizard: React.FC<ProfileSetupWizardProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onAddGoal,
  onAddJobTypes,
  onComplete,
  isPreview = false,
}) => {
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<AppSettings['userPersona']>(settings.userPersona);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [jobTypeOther, setJobTypeOther] = useState('');
  const [fixedExpenseItems, setFixedExpenseItems] = useState<FixedExpenseItem[]>(settings.fixedExpenseItems || []);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');

  // Always start from step 0 with fresh values whenever the wizard is (re)opened
  React.useEffect(() => {
    if (isOpen) {
      setStep(0);
      setPersona(settings.userPersona);
      setFixedExpenseItems(settings.fixedExpenseItems || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const totalSteps = 4;

  const toggleJobType = (id: string) => {
    setJobTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const handleAddExpenseItem = () => {
    const amount = parseFloat(newExpenseAmount);
    if (!newExpenseName.trim() || isNaN(amount) || amount < 0) return;
    setFixedExpenseItems(prev => [...prev, { id: crypto.randomUUID(), name: newExpenseName.trim(), amount }]);
    setNewExpenseName('');
    setNewExpenseAmount('');
  };

  const handleRemoveExpenseItem = (id: string) => {
    setFixedExpenseItems(prev => prev.filter(item => item.id !== id));
  };

  const expenseTotal = sumFixedExpenseItems(fixedExpenseItems);

  const finishSetup = () => {
    onUpdateSettings({
      ...settings,
      fixedExpenseItems: fixedExpenseItems.length > 0 ? fixedExpenseItems : settings.fixedExpenseItems,
      monthlyExpense: fixedExpenseItems.length > 0 ? expenseTotal : settings.monthlyExpense,
      profileJobTypes: jobTypes,
      profileJobTypeOther: jobTypeOther.trim() || undefined,
      profileSetupCompleted: true,
      userPersona: persona,
    });

    // Actually wire the answer into the real "เลือกประเภทงาน" picker options — otherwise
    // asking the question is pointless.
    const newJobTypeLabels = jobTypes
      .map(id => JOB_TYPE_OPTIONS.find(o => o.id === id)?.jobTypeLabel)
      .filter((label): label is string => !!label);
    const trimmedOther = jobTypeOther.trim();
    if (jobTypes.includes('other') && trimmedOther) {
      newJobTypeLabels.push(trimmedOther);
    }
    if (newJobTypeLabels.length > 0) {
      onAddJobTypes(newJobTypeLabels);
    }

    const targetValue = parseFloat(goalTarget);
    if (goalName.trim() && !isNaN(targetValue) && targetValue > 0) {
      onAddGoal({
        name: goalName.trim(),
        type: 'save',
        target: targetValue,
        current: 0,
        deadline: new Date().toISOString().split('T')[0],
        emoji: '🎯',
        bg: '#ECFDF5',
        acc: '#059669',
      });
    }

    onComplete();
  };

  const goNext = () => step === totalSteps - 1 ? finishSetup() : setStep(s => s + 1);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm select-none">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="relative bg-brand-white dark:bg-stone-900 rounded-[28px] p-7 shadow-[0_24px_60px_-15px_rgba(166,63,27,0.25)] max-w-md w-full max-h-[90vh] overflow-y-auto no-scrollbar"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[#E65F2B]/15 blur-2xl rounded-full scale-125" />
              <Mascot mood="wave" size={60} className="relative drop-shadow-sm" />
            </div>

            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ width: i === step ? 22 : 6 }}
                  transition={{ duration: 0.25 }}
                  className={`h-1.5 rounded-full ${
                    i === step ? 'bg-[#E65F2B]' : i < step ? 'bg-[#E65F2B]/40' : 'bg-brand-faint dark:bg-neutral-800'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-black text-lg text-brand-text dark:text-white tracking-tight">
                {STEP_TITLES[step]}
              </h3>
              <p className="text-xs leading-relaxed text-brand-muted max-w-[280px] mx-auto">
                {STEP_DESCRIPTIONS[step]}
              </p>
            </div>
          </div>

          {/* Step content */}
          <div className="mt-6 min-h-[190px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-persona"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  {PERSONA_OPTIONS.map(opt => {
                    const selected = persona === opt.id;
                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setPersona(opt.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? 'border-[#E65F2B] bg-[#FDF3EC] dark:bg-[#352115] text-brand-text shadow-sm'
                            : 'border-brand-border/50 text-brand-text hover:border-brand-border hover:bg-brand-faint/50'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 transition-colors ${
                          selected ? 'bg-white dark:bg-stone-900' : 'bg-brand-faint dark:bg-neutral-800'
                        }`}>
                          <opt.icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1">
                          <span className="block">{opt.label}</span>
                          <span className="block text-[10px] font-medium text-brand-muted mt-0.5">{opt.description}</span>
                        </span>
                        <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                          selected ? 'bg-[#E65F2B] border-[#E65F2B]' : 'border-brand-border/60'
                        }`}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  {JOB_TYPE_OPTIONS.map(opt => {
                    const selected = jobTypes.includes(opt.id);
                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleJobType(opt.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? 'border-[#E65F2B] bg-[#FDF3EC] dark:bg-[#352115] text-brand-text shadow-sm'
                            : 'border-brand-border/50 text-brand-text hover:border-brand-border hover:bg-brand-faint/50'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 transition-colors ${
                          selected ? 'bg-white dark:bg-stone-900' : 'bg-brand-faint dark:bg-neutral-800'
                        }`}>
                          <opt.icon className="w-4 h-4" />
                        </span>
                        <span className="flex-1">{opt.label}</span>
                        <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                          selected ? 'bg-[#E65F2B] border-[#E65F2B]' : 'border-brand-border/60'
                        }`}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </motion.button>
                    );
                  })}
                  {jobTypes.includes('other') && (
                    <input
                      type="text"
                      value={jobTypeOther}
                      onChange={(e) => setJobTypeOther(e.target.value)}
                      placeholder="ระบุประเภทงานของคุณ..."
                      className="w-full bg-brand-faint text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                    />
                  )}
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="relative flex flex-col gap-3 bg-gradient-to-b from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-[24px] p-5"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                      รวมค่าใช้จ่ายคงที่ต่อเดือน
                    </span>
                    <span className="text-3xl font-black font-mono text-[#E65F2B]">{formatCurrency(expenseTotal)}</span>
                  </div>

                  {fixedExpenseItems.length > 0 && (
                    <div className="space-y-1.5">
                      {fixedExpenseItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between gap-2 bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-xl px-3 py-2">
                          <span className="text-xs font-bold text-brand-text dark:text-neutral-200 truncate">{item.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-black text-brand-text dark:text-white">{formatCurrency(item.amount)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveExpenseItem(item.id)}
                              className="text-neutral-400 hover:text-rose-600 cursor-pointer transition-colors"
                              title="ลบรายการนี้"
                            >
                              <IconClose className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newExpenseName}
                      onChange={(e) => setNewExpenseName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddExpenseItem(); } }}
                      placeholder="เช่น ค่าห้อง, ค่ารถ, ค่าเน็ต"
                      className="flex-1 min-w-0 bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatNumberWithCommas(newExpenseAmount)}
                      onChange={(e) => setNewExpenseAmount(stripNumberInput(e.target.value))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddExpenseItem(); } }}
                      placeholder="บาท"
                      className="w-20 shrink-0 bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-xl px-2.5 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                    />
                    <button
                      type="button"
                      onClick={handleAddExpenseItem}
                      className="shrink-0 p-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white rounded-xl transition-all cursor-pointer"
                      title="เพิ่มรายการ"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[10px] text-brand-muted text-center">ไม่มีค่าใช้จ่ายคงที่? ข้ามขั้นตอนนี้ไปได้เลย</p>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2.5 bg-brand-faint/50 dark:bg-neutral-800/40 rounded-[24px] p-5"
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#E65F2B] shrink-0" />
                    <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                      เป้าหมายแรกของคุณ (ไม่บังคับ)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="เช่น กล้องตัวใหม่, เงินสำรองฉุกเฉิน"
                    className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatNumberWithCommas(goalTarget)}
                    onChange={(e) => setGoalTarget(stripNumberInput(e.target.value))}
                    placeholder="ยอดเป้าหมาย (฿) เช่น 50,000"
                    className="w-full bg-brand-white dark:bg-stone-800 text-xs font-mono text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-5 border-t border-brand-border/40 dark:border-neutral-800 flex items-center justify-between gap-3">
            {step > 0 ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setStep(s => s - 1)}
                className="px-3.5 py-2.5 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-text border border-brand-border/60 dark:border-neutral-700 rounded-xl text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ย้อนกลับ</span>
              </motion.button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                onClick={goNext}
                className="px-3.5 py-2.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-neutral-800 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
              >
                ข้าม
              </button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={goNext}
                className="px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span>{step === totalSteps - 1 ? 'เริ่มใช้งานเลย!' : 'ถัดไป'}</span>
                {step !== totalSteps - 1 && <ChevronRight className="w-3.5 h-3.5" />}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

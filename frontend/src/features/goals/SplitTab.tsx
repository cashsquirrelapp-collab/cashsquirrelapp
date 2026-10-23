import { uiSurface } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import { KsIcon } from '../mobile/icons';
import { MobileSheet } from '../mobile/MobileHome';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { MobilePageHero } from '../mobile/MobilePageHero';
import { imageFileToDataUrl } from '../../services/images';
import React, { useState, useMemo, useEffect } from 'react';
import { Job, Goal, AppSettings, GoalTransaction, Expense } from '../../../../shared/types';
import { formatCurrency, getMonthKey, dateLocale, currentMonthKeyNow } from '../../utils';
import { DashboardPeriodPicker } from '../dashboard/DashboardPeriodPicker';
import { GOAL_ICONS, goalIconKey } from './goalIcons';
import { stripEmoji, Drawer, GoalAvatar, ProgressBar, goalPct, pctText, field, label, primaryBtn, secondaryBtn } from './SplitParts';
import { getReceivedForMonth } from '../../../../shared/installmentPayments';
import { fixedExpenseForMonth } from '../../../../shared/monthlySummary';
import { canDeleteGoalTransactionHistoryOnly } from '../../../../shared/goalLedger';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PiggyBank, 
  TrendingUp, 
  Coins, 
  Layers, 
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  Calendar,
  Settings,
  DollarSign,
  Download,
  Upload,
  RefreshCcw,
  Award,
  CircleAlert,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  History,
  Search,
  FileText,
  Tag,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { Mascot, type MascotMood, type MascotAction } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import NumberInput from '../../components/ui/NumberInput';
import {
  IconTarget,
  IconWarning,
  IconAlertDot,
  IconGem,
  IconCoin,
  IconCoinOut,
  IconCheck,
  IconBolt,
  IconRocket,
  IconLoop,
  IconPencil,
  IconPalette,
  IconGraduation,
  IconGift,
  IconCamera,
  IconTool,
  IconBarChart,
  IconClear,
  IconScale,
  IconDot,
} from '../../components/ui/icons';

import { tr } from '../../i18n/tr';
interface SplitTabProps {
  jobs: Job[];
  goals: Goal[];
  expenses: Expense[];
  settings: AppSettings;
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onDeleteGoal: (id: string) => boolean;
  onUpdateGoalProgress: (id: string, amount: number, reason?: string, date?: string, deductFromCash?: boolean) => boolean;
  onDeleteGoalTransaction?: (goalId: string, txId: string, revertBalance?: boolean) => void;
  onTransferBetweenGoals: (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => boolean;
  onUpdateGoal: (id: string, updatedFields: Partial<Goal>) => void;
  onAllocateSavingsToGoal: (goalId: string, amount: number) => void;
  onAllocateMultipleSavings: (allocations: Record<string, number>, settingsUpdate?: Partial<AppSettings>) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onSwitchTab: (tabId: string) => void;
  onImportData: (data: string) => void;
  onExportData: () => void;
  onClearAllData: () => void;
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
  initialSelectedGoalId?: string | null;
  onClearInitialGoalId?: () => void;
  selectedMonthKey: string;
  /** Phones: back to the menu, drawn in this page's own terracotta header. */
  onMobileBack?: () => void;
}

/**
 * Allocate each configured percentage as an absolute share of the available money. The shares
 * are rounded to whole baht with a deterministic largest-remainder pass, so e.g. 25% + 15% of
 * ฿5,150 allocates exactly 40% (฿2,060), not the whole ฿5,150. A full goal never makes another
 * goal exceed its configured share; money that is not allocated remains available.
 */
export function proportionalSplit(goals: Goal[], totalToSplit: number): { allocations: Record<string, number>; remainder: number } {
  const total = Number.isFinite(totalToSplit) ? Math.max(0, totalToSplit) : 0;
  const allocations = Object.fromEntries(goals.map(g => [g.id, 0])) as Record<string, number>;
  const candidates = goals.map(g => ({
    goal: g,
    pct: Math.min(100, Math.max(0, Number(g.allocatedPercentage) || 0)),
    capacity: Math.max(0, Number(g.target) - Number(g.current)),
  })).filter(row => row.pct > 0 && row.capacity > 0);

  const configuredPct = candidates.reduce((sum, row) => sum + row.pct, 0);
  if (total <= 0 || configuredPct <= 0) return { allocations, remainder: total };

  // The editor prevents totals over 100%; the scale is a final safety net for imported legacy
  // data so this helper can never allocate more money than is actually available.
  const scale = configuredPct > 100 ? 100 / configuredPct : 1;
  const plannedTotal = Math.floor((total * Math.min(100, configuredPct)) / 100 + Number.EPSILON);
  const shares = candidates.map(row => {
    const exact = total * ((row.pct * scale) / 100);
    const floored = Math.floor(exact + Number.EPSILON);
    return { ...row, exact, floored, fraction: exact - floored };
  });

  // First place each whole-baht quota. Target caps reduce that goal only; they do not silently
  // inflate another goal beyond its configured percentage.
  shares.forEach(row => {
    allocations[row.goal.id] = Math.min(row.capacity, row.floored);
  });

  // Whole-baht rounding can leave at most one baht per goal. Award those baht deterministically
  // by fractional remainder, then percentage and id so reordering the goals cannot change money.
  let roundingBaht = Math.max(0, plannedTotal - shares.reduce((sum, row) => sum + row.floored, 0));
  const roundingOrder = [...shares].sort((a, b) =>
    (b.fraction - a.fraction) || (b.pct - a.pct) || a.goal.id.localeCompare(b.goal.id)
  );
  for (const row of roundingOrder) {
    if (roundingBaht <= 0) break;
    if (row.fraction > 0 && row.capacity - allocations[row.goal.id] >= 1) {
      allocations[row.goal.id] += 1;
      roundingBaht -= 1;
    }
  }

  const allocated = Object.values(allocations).reduce((sum, amount) => sum + amount, 0);
  return { allocations, remainder: Math.max(0, total - allocated) };
}

/**
 * `accumulatedRemainder` used to mirror money that is now already present in live net profit.
 * Keep the legacy argument explicit so old snapshots are demonstrably ignored, not added twice.
 */
export function percentageAllocationPool(netProfit: number, _legacyAccumulatedRemainder = 0): number {
  return Number.isFinite(netProfit) ? Math.max(0, netProfit) : 0;
}

/** Final guard for editable allocation inputs, including imported legacy ratios over 100%. */
export function allocationsFitAvailable(allocations: Record<string, number>, available: number): boolean {
  if (!Number.isFinite(available) || available < 0) return false;
  const amounts = Object.values(allocations);
  if (amounts.some(amount => !Number.isFinite(amount) || amount < 0)) return false;
  return amounts.reduce((sum, amount) => sum + amount, 0) <= available + 0.001;
}

export default function SplitTab({
  jobs,
  goals,
  expenses,
  settings,
  onAddGoal,
  onDeleteGoal,
  onUpdateGoalProgress,
  onDeleteGoalTransaction,
  onTransferBetweenGoals,
  onUpdateGoal,
  onAllocateSavingsToGoal,
  onAllocateMultipleSavings,
  onUpdateSettings,
  onSwitchTab,
  onImportData,
  onExportData,
  onClearAllData,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  initialSelectedGoalId,
  onClearInitialGoalId,
  selectedMonthKey,
  onMobileBack,
}: SplitTabProps) {
  const { t, language } = useLanguage();
  // The page browses months on its own; App's selectedMonthKey is only the starting point.
  const [viewMonth, setViewMonth] = useState(selectedMonthKey);
  const currentMonthKey = viewMonth;
  // Allocations are recorded with today's date, so they only make sense for the current month.
  const isCurrentMonth = viewMonth === currentMonthKeyNow();

  // 1. Calculate Received This Month (Confirmed Income)
  const receivedThisMonth = jobs
    .reduce((sum, j) => sum + getReceivedForMonth(j, currentMonthKey), 0);

  // 2. Net Profit calculation (Received - fixed monthly expense - this month's logged variable
  // expenses) -- previously only subtracted the fixed monthly expense, so a month with real
  // logged expenses (DashboardTab's "กำไรสุทธิ" breakdown already accounts for these) could show
  // an overstated profit here that didn't match Dashboard's figure at all.
  const monthExpenses = expenses.filter(e => getMonthKey(e.date) === currentMonthKey);
  const variableExpenseThisMonth = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const fixedExpenseThisMonth = fixedExpenseForMonth(settings.monthlyExpense, settings.fixedExpenseItems, monthExpenses.map(e => e.name));
  const rawNetProfit = Math.max(0, receivedThisMonth - fixedExpenseThisMonth - variableExpenseThisMonth);
  // Derived live from goal deposit history (deductedFromCash deposits this month), same source
  // DashboardTab's own "กำไรสุทธิ" breakdown uses -- previously this read a separately
  // incrementally-updated settings.allocatedMonths counter, which drifted out of sync with the
  // real transaction history (a deposit made before a given fix shipped never got counted, a
  // deleted deposit needed its own manual reversal, etc). Deriving it live here means both
  // figures always agree, and deleting a transaction just works with no bookkeeping needed.
  const alreadyAllocatedThisMonth = goals.reduce((sum, g) => {
    const monthDeposits = (g.history || []).filter(
      tx => tx.type === 'deposit' && tx.deductedFromCash && getMonthKey(tx.date) === currentMonthKey
    );
    return sum + monthDeposits.reduce((s, tx) => s + tx.amount, 0);
  }, 0);
  const netProfit = Math.max(0, rawNetProfit - alreadyAllocatedThisMonth);
  // What the "หักออกจากยอดรายรับ" deposit check validates against -- deliberately NOT netProfit.
  // netProfit already nets out fixed/variable expenses, which is right for "how much is free to
  // allocate to savings" but wrong for "do I actually have this money" -- expenses get paid from
  // the same received income, they don't make already-received money not exist. This is just
  // received income minus whatever's already been moved into a goal this month.
  const availableFromReceivedThisMonth = Math.max(0, receivedThisMonth - alreadyAllocatedThisMonth);

  // 3. Split calculations based on individual goal's allocatedPercentage
  const totalAllocatedPct = goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);

  // 5. Breakeven revenue calculations
  // To cover both expenses and reach the monthly revenue goal

  // State for dynamic profit allocation values
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});
  const [showDangerZone, setShowDangerZone] = useState(false);

  // Initialize custom allocations map to automatically calculated amounts based on each goal's custom percentage quota!
  useEffect(() => {
    setCustomAllocations(proportionalSplit(goals, netProfit).allocations);
  }, [goals, netProfit]);

  const totalCustomAllocated = useMemo(() => {
    return (Object.values(customAllocations) as number[]).reduce((sum, val) => sum + val, 0);
  }, [customAllocations]);

  const remainingNetProfit = Math.max(0, netProfit - totalCustomAllocated);

  const handleApplyPresetSplit = () => {
    // This is now "Auto Allocation based on custom goal percentages"
    setCustomAllocations(proportionalSplit(goals, netProfit).allocations);
  };

  const handleApplyEqualSplit = () => {
    const next: Record<string, number> = {};
    if (goals.length === 0) return;
    const perGoal = Math.floor(netProfit / goals.length);
    goals.forEach(g => {
      next[g.id] = Math.min(g.target - g.current, perGoal);
    });
    setCustomAllocations(next);
  };

  const handleResetAllocations = () => {
    const next: Record<string, number> = {};
    goals.forEach(g => {
      next[g.id] = 0;
    });
    setCustomAllocations(next);
  };

  const handleConfirmAllocations = () => {
    if (!allocationsFitAvailable(customAllocations, netProfit)) {
      triggerAlert(
        t('split.insufficientFundsTitle'),
        language === 'en'
          ? `The total allocation cannot exceed this month's available ${formatCurrency(netProfit)}.`
          : `ยอดจัดสรรรวมต้องไม่เกินเงินพร้อมจัดสรรเดือนนี้ ${formatCurrency(netProfit)}`
      );
      return;
    }
    let allocatedCount = 0;
    const currentAllocationsRecord: Record<string, number> = {};
    (Object.entries(customAllocations) as [string, number][]).forEach(([goalId, amount]) => {
      if (amount > 0) {
        currentAllocationsRecord[goalId] = amount;
        allocatedCount++;
      }
    });

    if (allocatedCount > 0) {
      // netProfit above is derived live from deductedFromCash deposit history, so no separate
      // settings bookkeeping is needed here -- handleAllocateMultipleSavings marks the goal
      // transactions it creates as deductedFromCash itself.
      onAllocateMultipleSavings(currentAllocationsRecord, { accumulatedRemainder: 0 });

      triggerAlert(
        t('split.allocateSuccessTitle'),
        t('split.allocateSuccessMsg', { amount: formatCurrency(totalCustomAllocated) })
      );
      handleResetAllocations();
    } else {
      triggerAlert(t('split.allocateFailTitle'), t('split.allocateFailMsg'));
    }
  };

  const handleQuickProportionalAllocation = () => {
    // A configured percentage applies only to this month's live remaining profit. The legacy
    // accumulatedRemainder field mirrors that same cash, so percentageAllocationPool ignores it.
    const totalToSplit = percentageAllocationPool(netProfit, settings.accumulatedRemainder);

    if (totalToSplit <= 0) {
      triggerAlert(
        t('split.noProfitLeftTitle'),
        t('split.noProfitLeftMsg')
      );
      return;
    }

    const activeGoals = goals.filter(g => (g.allocatedPercentage || 0) > 0 && g.current < g.target);

    if (activeGoals.length === 0) {
      triggerAlert(
        t('split.setRatioFirstTitle'),
        t('split.setRatioFirstMsg')
      );
      return;
    }

    const { allocations, remainder: finalRemainder } = proportionalSplit(goals, totalToSplit);
    const totalAllocatedToGoals = Object.values(allocations).reduce((sum, amount) => sum + amount, 0);

    if (totalAllocatedToGoals <= 0) {
      triggerAlert(
        t('split.goalsFullTitle'),
        t('split.goalsFullMsg')
      );
      return;
    }

    const allocationsListText = activeGoals
      .filter(g => allocations[g.id] > 0)
      .map(g => t('split.allocationListItem', { emoji: g.emoji || '🎯', name: g.name, amount: formatCurrency(allocations[g.id]), pct: g.allocatedPercentage ?? 0 }))
      .join('\n');

    const messageHtml = language === 'en'
      ? `You are about to allocate ${formatCurrency(totalAllocatedToGoals)} from this month's available ${formatCurrency(netProfit)}:\n\n${allocationsListText}\n\nThe unallocated ${formatCurrency(finalRemainder)} will remain available this month. Confirm this allocation?`
      : `คุณกำลังจะจัดสรร ${formatCurrency(totalAllocatedToGoals)} จากเงินพร้อมจัดสรรเดือนนี้ ${formatCurrency(netProfit)}:\n\n${allocationsListText}\n\nเงินที่ยังไม่จัดสรร ${formatCurrency(finalRemainder)} จะยังคงอยู่ในยอดพร้อมจัดสรรเดือนนี้ ยืนยันการจัดสรรหรือไม่?`;

    triggerConfirm(
      t('split.quickAllocateConfirmTitle'),
      messageHtml,
      () => {
        // netProfit above is derived live from deductedFromCash deposit history -- see the
        // comment on handleConfirmAllocations above for why no allocatedMonths bookkeeping
        // belongs here anymore.
        // The unassigned share stays in netProfit, so persisting it as accumulatedRemainder would
        // add the same cash a second time on the next render.
        // Writing zero retires stale bookkeeping from older snapshots on the next allocation.
        onAllocateMultipleSavings(allocations, { accumulatedRemainder: 0 });

        triggerAlert(
          t('split.deductSuccessTitle'),
          language === 'en'
            ? `${formatCurrency(totalAllocatedToGoals)} was added to your goals. ${formatCurrency(finalRemainder)} remains available this month.`
            : `จัดสรร ${formatCurrency(totalAllocatedToGoals)} เข้าเป้าหมายแล้ว และยังเหลือเงินพร้อมจัดสรรเดือนนี้ ${formatCurrency(finalRemainder)}`
        );
      }
    );
  };

  // Page UI state (layout only)
  const [goalSort, setGoalSort] = useState<'ratio' | 'progress' | 'name'>('ratio');
  const mobile = useMobileLayout();
  const [manageSheetOpen, setManageSheetOpen] = useState(false);
  const [ratioEditorOpen, setRatioEditorOpen] = useState(false);
  const [ratioDraft, setRatioDraft] = useState<Record<string, number>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [txMenuId, setTxMenuId] = useState<string | null>(null);
  const [formAdvancedOpen, setFormAdvancedOpen] = useState(false);

  // Add Goal local form states (for local Add Goal sheet)
  const [isAddGoalLocalOpen, setIsAddGoalLocalOpen] = useState(false);
  const [isEditGoalLocalOpen, setIsEditGoalLocalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'save' | 'invest' | 'emergency' | 'buy'>('save');
  const [formTarget, setFormTarget] = useState('');
  const [formCurrent, setFormCurrent] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formEmoji, setFormEmoji] = useState('🎯'); // kept only so editing an old goal never drops its stored emoji
  const [formIcon, setFormIcon] = useState('target');
  const [formBg, setFormBg] = useState('#ECFDF5');
  const [formAcc, setFormAcc] = useState('#059669');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAllocatedPercentage, setFormAllocatedPercentage] = useState('0');

  // Selected goal detail modal local state
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  // Goal transaction modal state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txGoal, setTxGoal] = useState<Goal | null>(null);
  const [txType, setTxType] = useState<'deposit' | 'withdraw'>('deposit');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txReason, setTxReason] = useState('');
  const [txDeductFromCash, setTxDeductFromCash] = useState(false);

  // History list filter state inside goal detail modal
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposit' | 'withdraw'>('all');

  // Transfer-between-goals modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromGoal, setTransferFromGoal] = useState<Goal | null>(null);
  const [transferToGoalId, setTransferToGoalId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferReason, setTransferReason] = useState('');

  // Keep selectedGoal in sync with goals state updates
  useEffect(() => {
    if (selectedGoal) {
      const updated = goals.find(x => x.id === selectedGoal.id);
      if (updated) {
        setSelectedGoal(updated);
      }
    }
  }, [goals]);

  const openTxModal = (goal: Goal, type: 'deposit' | 'withdraw') => {
    setTxGoal(goal);
    setTxType(type);
    setTxAmount('');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxReason('');
    setTxDeductFromCash(false);
    setIsTxModalOpen(true);
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txGoal) return;
    const amount = parseFloat(txAmount) || 0;
    if (amount <= 0) {
      triggerAlert(t('split.amountRequiredTitle'), t('split.amountMustBePositive'));
      return;
    }

    const latestGoal = goals.find(goal => goal.id === txGoal.id) || txGoal;
    if (txType === 'withdraw' && amount > latestGoal.current) {
      triggerAlert(
        t('split.insufficientBalanceTitle'),
        language === 'en'
          ? `"${latestGoal.name}" only has ${formatCurrency(latestGoal.current)} available, so ${formatCurrency(amount)} cannot be withdrawn.`
          : `เป้าหมาย "${latestGoal.name}" มียอดคงเหลือ ${formatCurrency(latestGoal.current)} จึงไม่สามารถถอน ${formatCurrency(amount)} ได้`
      );
      return;
    }

    // "หักออกจากยอดรายรับ" says this money is coming out of income already received this month --
    // it can't exceed what's actually been received (minus whatever's already gone into a goal),
    // or the deposit would be funded by money that doesn't exist. Deliberately checked against
    // received income, not netProfit -- netProfit also nets out fixed/variable expenses, which
    // matters for "how much is free to allocate" but not for "do I actually have this money":
    // expenses get paid out of the same received income, they don't erase it.
    if (txType === 'deposit' && txDeductFromCash && amount > availableFromReceivedThisMonth) {
      triggerAlert(
        t('split.insufficientFundsTitle'),
        t('split.insufficientFundsMsg', { received: formatCurrency(receivedThisMonth), available: formatCurrency(availableFromReceivedThisMonth), amount: formatCurrency(amount) })
      );
      return;
    }

    const signedAmount = txType === 'deposit' ? amount : -amount;
    const defaultReason = txType === 'deposit' ? t('split.depositDefaultReason') : t('split.withdrawDefaultReason');
    const finalReason = txReason.trim() || defaultReason;

    const saved = onUpdateGoalProgress(txGoal.id, signedAmount, finalReason, txDate, txType === 'deposit' && txDeductFromCash);
    if (!saved) return;
    setIsTxModalOpen(false);

    triggerAlert(
      t('split.historySavedTitle'),
      t('split.historySavedMsg', { action: txType === 'deposit' ? t('split.actionTransferIn') : t('split.actionWithdraw'), amount: formatCurrency(amount), reason: finalReason })
    );
  };

  const openTransferModal = (goal: Goal) => {
    const firstOtherGoal = goals.find(g => g.id !== goal.id);
    setTransferFromGoal(goal);
    setTransferToGoalId(firstOtherGoal?.id || '');
    setTransferAmount('');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferReason('');
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromGoal) return;

    if (!transferToGoalId) {
      triggerAlert(t('split.selectDestGoalTitle'), t('split.selectDestGoalMsg'));
      return;
    }

    const toGoal = goals.find(g => g.id === transferToGoalId);
    if (!toGoal) return;

    const amount = parseFloat(transferAmount) || 0;
    if (amount <= 0) {
      triggerAlert(t('split.amountRequiredTitle'), t('split.amountMustBePositive'));
      return;
    }

    const latestFromGoal = goals.find(g => g.id === transferFromGoal.id);
    if (!latestFromGoal) {
      triggerAlert(t('split.invalidDataTitle'), t('split.invalidDataMsg'));
      return;
    }
    if (amount > latestFromGoal.current) {
      triggerAlert(
        t('split.insufficientBalanceTitle'),
        t('split.insufficientBalanceMsg', { name: latestFromGoal.name, balance: formatCurrency(latestFromGoal.current), amount: formatCurrency(amount) })
      );
      return;
    }

    const saved = onTransferBetweenGoals(latestFromGoal.id, toGoal.id, amount, transferReason.trim() || undefined, transferDate);
    if (!saved) return;
    setIsTransferModalOpen(false);
  };

  useEffect(() => {
    if (initialSelectedGoalId === 'ADD_NEW_GOAL') {
      openAddGoal();
      if (onClearInitialGoalId) {
        onClearInitialGoalId();
      }
    } else if (initialSelectedGoalId && goals.length > 0) {
      const g = goals.find(x => x.id === initialSelectedGoalId);
      if (g) {
        setSelectedGoal(g);
      }
      if (onClearInitialGoalId) {
        onClearInitialGoalId();
      }
    }
  }, [initialSelectedGoalId, goals, onClearInitialGoalId]);

  // A fresh form every time, so values from a goal edited earlier never leak into a new one.
  const openAddGoal = () => {
    setFormName(''); setFormType('save'); setFormTarget(''); setFormCurrent(''); setFormDeadline('');
    setFormEmoji('🎯'); setFormIcon('target'); setFormBg('#ECFDF5'); setFormAcc('#059669'); setFormImageUrl(''); setFormAllocatedPercentage('0');
    setFormAdvancedOpen(true); // picking an icon or photo is part of making a goal
    setIsAddGoalLocalOpen(true);
  };

  const openEditGoalForm = (g: Goal) => {
    setFormName(g.name);
    setFormType(g.type);
    setFormTarget(String(g.target));
    setFormCurrent(String(g.current));
    setFormDeadline(g.deadline || '');
    setFormEmoji(g.emoji || '🎯');
    setFormIcon(goalIconKey(g));
    setFormBg(g.bg || '#ECFDF5');
    setFormAcc(g.acc || '#059669');
    setFormImageUrl(g.imageUrl || '');
    setFormAllocatedPercentage(String(g.allocatedPercentage || 0));
    setIsEditGoalLocalOpen(true);
  };

  const handleEditGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !formName.trim()) return;

    const updatedFields = {
      name: formName,
      type: formType,
      target: parseFloat(formTarget) || 0,
      current: parseFloat(formCurrent) || 0,
      deadline: formDeadline || '',
      emoji: formEmoji,
      icon: formIcon,
      bg: formBg,
      acc: formAcc,
      imageUrl: formImageUrl.trim() || undefined,
      allocatedPercentage: parseFloat(formAllocatedPercentage) || 0,
    };

    onUpdateGoal(selectedGoal.id, updatedFields);
    setSelectedGoal({
      ...selectedGoal,
      ...updatedFields,
    });

    setIsEditGoalLocalOpen(false);
    triggerAlert(t('split.updateSuccessTitle'), t('split.goalUpdatedMsg'));
  };

  // Preset arrays for targets
  const colorPresets = [
    { bg: '#ECFDF5', acc: '#059669', name: 'Emerald' },
    { bg: '#EFF6FF', acc: '#2563EB', name: 'Blue' },
    { bg: '#FEF2F2', acc: '#DC2626', name: 'Rose' },
    { bg: '#FFFBEB', acc: '#D97706', name: 'Amber' },
    { bg: '#FAF5FF', acc: '#7C3AED', name: 'Purple' },
    { bg: '#F5F5F4', acc: '#57534E', name: 'Stone' },
  ];

  const handleAddGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    onAddGoal({
      name: formName,
      type: formType,
      target: parseFloat(formTarget) || 0,
      current: parseFloat(formCurrent) || 0,
      deadline: formDeadline || new Date().toISOString().split('T')[0],
      emoji: '',
      icon: formIcon,
      bg: formBg,
      acc: formAcc,
      imageUrl: formImageUrl.trim() || undefined,
      allocatedPercentage: parseFloat(formAllocatedPercentage) || 0,
    });

    // Reset Form
    setFormName('');
    setFormTarget('');
    setFormCurrent('');
    setFormDeadline('');
    setFormEmoji('🎯');
    setFormBg('#ECFDF5');
    setFormAcc('#059669');
    setFormImageUrl('');
    setFormAllocatedPercentage('0');
    setIsAddGoalLocalOpen(false);

    triggerAlert(t('split.updateSuccessTitle'), t('split.goalCreatedMsg'));
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>, isForExistingGoal: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerAlert(t('split.imageOnlyErrorTitle'), t('split.imageOnlyErrorMsg'));
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      triggerAlert(t('split.fileTooLargeTitle'), t('split.fileTooLargeMsg'));
      return;
    }

    imageFileToDataUrl(file, { maxSide: 256 }).then(base64String => {
      if (base64String) {
        if (isForExistingGoal && selectedGoal) {
          onUpdateGoal(selectedGoal.id, { imageUrl: base64String });
          setSelectedGoal(prev => prev ? { ...prev, imageUrl: base64String } : null);
          triggerAlert(t('split.imageUploadedTitle'), t('split.imageUploadedMsg'));
        } else {
          setFormImageUrl(base64String);
          triggerAlert(t('split.imageReadyTitle'), t('split.imageReadyMsg'));
        }
      }
    }).catch(error=>triggerAlert(tr("อัปโหลดภาพไม่สำเร็จ"),error.message));
  };

  const handleImportBackupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        try {
          const str = evt.target.result as string;
          onImportData(str);
          triggerAlert(tr("นำเข้าสำเร็จ"), tr("ดึงข้อมูลงานและเป้าหมายจากไฟล์สำรองเข้าสู่ระบบเรียบร้อยแล้ว!"));
        } catch (err) {
          triggerAlert(tr("เกิดข้อผิดพลาด"), tr("รูปแบบไฟล์สำรองไม่ถูกต้อง กรุณาเลือกไฟล์ .json ที่ถูกต้อง"));
        }
      }
    };
    reader.readAsText(file);
  };

  // ---------- derived view data (display only; every number comes from the logic above) ----------
  const totalExpense = fixedExpenseThisMonth + variableExpenseThisMonth;
  const totalToSplit = percentageAllocationPool(netProfit, settings.accumulatedRemainder);
  // The same split the "จัดสรร" button performs, so the preview always matches what it will do.
  const preview = isCurrentMonth && totalToSplit > 0 ? proportionalSplit(goals, totalToSplit) : null;
  const previewAllocated = preview ? Object.values(preview.allocations).reduce((sum, amount) => sum + amount, 0) : 0;
  const unassignedPct = Math.max(0, 100 - totalAllocatedPct);
  const sortedGoals = useMemo(() => {
    const list = [...goals];
    if (goalSort === 'ratio') list.sort((a, b) => (b.allocatedPercentage || 0) - (a.allocatedPercentage || 0));
    if (goalSort === 'progress') list.sort((a, b) => goalPct(b) - goalPct(a));
    if (goalSort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return list;
  }, [goals, goalSort]);
  const typeLabel = (type: Goal['type']) => type === 'save' ? t('split.typeSavingsAccount') : type === 'invest' ? t('split.typeInvestment') : type === 'emergency' ? t('split.typeEmergencyFund') : t('split.typeBuy');
  const todayKey = new Date().toISOString().split('T')[0];
  const deadlineText = (g: Goal) => g.deadline ? new Date(g.deadline).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const deadlinePassed = (g: Goal) => Boolean(g.deadline) && g.deadline < todayKey && g.current < g.target;
  const emptyReason = receivedThisMonth <= 0
    ? tr("ยังไม่มีเงินรับจริงในเดือนนี้")
    : totalExpense > receivedThisMonth
      ? tr("รายจ่ายสูงกว่าเงินรับจริง {0}", formatCurrency(totalExpense - receivedThisMonth))
      : alreadyAllocatedThisMonth > 0 ? tr("แบ่งเงินของเดือนนี้เข้าเป้าหมายครบแล้ว") : tr("เงินรับจริงเท่ากับรายจ่ายพอดี");
  const recommendedFor = (g: Goal) => preview?.allocations[g.id] || 0;

  const editRatio = (goal: Goal) => {
    const otherGoalsTotalPct = totalAllocatedPct - (goal.allocatedPercentage || 0);
    const maxPctForThisGoal = Math.max(0, 100 - otherGoalsTotalPct);
    triggerPrompt(
      t('split.editRatioPromptTitle'),
      t('split.editRatioPromptMsg', { name: goal.name, max: maxPctForThisGoal, otherTotal: otherGoalsTotalPct }),
      String(goal.allocatedPercentage ?? 0),
      t('split.enterPctPlaceholder'),
      'number',
      (val) => {
        const pct = Math.min(maxPctForThisGoal, Math.max(0, parseFloat(val) || 0));
        onUpdateGoal(goal.id, { allocatedPercentage: pct });
        setSelectedGoal(prev => prev ? { ...prev, allocatedPercentage: pct } : null);
        triggerAlert(t('split.ratioUpdatedTitle'), t('split.ratioUpdatedMsg', { name: goal.name, pct }));
      }
    );
  };

  const ratioDraftTotal = (Object.values(ratioDraft) as number[]).reduce((s, v) => s + (v || 0), 0);
  const openRatioEditor = () => {
    const draft: Record<string, number> = {};
    goals.forEach(g => { draft[g.id] = g.allocatedPercentage || 0; });
    setRatioDraft(draft);
    setRatioEditorOpen(true);
  };
  const saveRatios = () => {
    if (ratioDraftTotal > 100) return;
    goals.forEach(g => {
      const next = ratioDraft[g.id] ?? 0;
      if (next !== (g.allocatedPercentage || 0)) onUpdateGoal(g.id, { allocatedPercentage: next });
    });
    setRatioEditorOpen(false);
  };

  const historyGroups = useMemo(() => {
    if (!selectedGoal) return [] as { day: string; items: GoalTransaction[] }[];
    const items = (selectedGoal.history || [])
      .filter(tx => historyFilter === 'all' || tx.type === historyFilter)
      .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
    const groups: { day: string; items: GoalTransaction[] }[] = [];
    items.forEach(tx => {
      const last = groups[groups.length - 1];
      if (last && last.day === tx.date) last.items.push(tx); else groups.push({ day: tx.date, items: [tx] });
    });
    return groups;
  }, [selectedGoal, historyFilter]);
  const dayLabel = (day: string) => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    if (day === todayKey) return tr("วันนี้");
    if (day === yesterday.toISOString().split('T')[0]) return tr("เมื่อวาน");
    return new Date(`${day}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const timeLabel = (tx: GoalTransaction) => tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) : '';

  const isEditForm = isEditGoalLocalOpen;
  const formMaxPct = isEditForm ? Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0))) : Math.max(0, 100 - totalAllocatedPct);
  const goalFormOpen = isAddGoalLocalOpen || isEditGoalLocalOpen;
  const closeGoalForm = () => { setIsAddGoalLocalOpen(false); setIsEditGoalLocalOpen(false); setFormAdvancedOpen(false); };

  const card = `${uiSurface}`;

  // Side-panel content, most specific first: the first open one is what the panel shows.
  type Sheet = { key: string; title: string; width: number; footer?: React.ReactNode; body: React.ReactNode; back?: () => void };
  const sheets: (Sheet | false)[] = [
    (isTxModalOpen && Boolean(txGoal)) && {
      key: 'tx', title: txType === 'deposit' ? tr("ฝากเงิน") : tr("ถอนเงิน"), width: 460, back: (selectedGoal || manualOpen) ? () => setIsTxModalOpen(false) : undefined,
      footer: <div className="flex gap-3">
            <button type="button" onClick={() => setIsTxModalOpen(false)} className={`${secondaryBtn} flex-1`}>{t('split.cancel')}</button>
            <button type="submit" form="goal-tx-form" className={`${txType === 'deposit' ? primaryBtn : 'inline-flex h-11 items-center justify-center rounded-xl bg-brand-text px-4 text-sm font-semibold text-brand-white transition-opacity hover:opacity-90 cursor-pointer'} flex-[2]`}>
              {txType === 'deposit' ? t('split.confirmDepositBtn') : t('split.confirmWithdrawBtn')}
            </button>
          </div>,
      body: (<>
        {txGoal && (
          <form id="goal-tx-form" onSubmit={handleTxSubmit} className="space-y-5">
            <div className="flex items-center gap-3"><GoalAvatar goal={txGoal} size={40} /><div><p className="text-sm font-medium text-brand-text">{txGoal.name}</p><p className="text-xs text-brand-muted">{tr("ยอดสะสม {0}", formatCurrency(txGoal.current))}</p></div></div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-brand-faint p-1" role="radiogroup" aria-label={tr("ประเภทรายการ")}>
              {(['deposit', 'withdraw'] as const).map(type => (
                <button key={type} type="button" role="radio" aria-checked={txType === type} onClick={() => setTxType(type)}
                  className={`h-9 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${txType === type ? 'bg-brand-white text-brand-text shadow-sm dark:bg-[#2A2B2F]' : 'text-brand-muted'}`}>
                  {type === 'deposit' ? tr("ฝากเข้า") : tr("ถอนออก")}
                </button>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className={label} htmlFor="goal-tx-amount">{t('split.amountBahtRequired')}</label>
                {txType === 'withdraw' && txGoal.current > 0 && (
                  <button type="button" onClick={() => setTxAmount(String(txGoal.current))} className="mb-1.5 text-xs font-medium text-[#C24A16] hover:underline cursor-pointer dark:text-[#FF9A6B]">{tr("ถอนทั้งหมด {0}", formatCurrency(txGoal.current))}</button>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-brand-muted">{tr("฿")}</span>
                <NumberInput id="goal-tx-amount" required value={txAmount} onChange={setTxAmount} placeholder={t('split.amountPlaceholder')} className={`${field} pl-8 font-mono`} />
              </div>
            </div>
            {txType === 'deposit' && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-border px-3.5 py-3">
                <input type="checkbox" checked={txDeductFromCash} onChange={(e) => setTxDeductFromCash(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#E65F2B] cursor-pointer" />
                <span><span className="block text-[13px] font-medium text-brand-text">{t('split.deductFromIncomeLabel')}</span><span className="mt-0.5 block text-xs leading-relaxed text-brand-muted">{t('split.deductFromIncomeDesc')}</span></span>
              </label>
            )}
            <div>
              <label className={label} htmlFor="goal-tx-date">{t('split.transactionDateLabel')}</label>
              <input id="goal-tx-date" type="date" required value={txDate} onChange={(e) => setTxDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="goal-tx-reason">{t('split.reasonNoteLabel')}</label>
              <input id="goal-tx-reason" type="text" value={txReason} onChange={(e) => setTxReason(e.target.value)} placeholder={txType === 'deposit' ? t('split.reasonPlaceholderDeposit') : t('split.reasonPlaceholderWithdraw')} className={field} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(txType === 'deposit'
                  ? [t('split.chipMonthlyDeposit'), t('split.chipSponsorIncome'), t('split.chipBonusTip'), t('split.chipAllocateProfit')]
                  : [t('split.chipEquipment'), t('split.chipMaintenance'), t('split.chipEmergency'), t('split.chipTuition'), t('split.chipTransferAccount')]
                ).map(chip => (
                  <button key={chip} type="button" onClick={() => setTxReason(chip)} className="rounded-lg border border-brand-border px-2.5 py-1 text-xs text-brand-text hover:bg-brand-faint cursor-pointer">{chip}</button>
                ))}
              </div>
            </div>
          </form>
        )}
      </>),
    },
    (isTransferModalOpen && Boolean(transferFromGoal)) && {
      key: 'transfer', title: tr("โอนไปเป้าหมายอื่น"), width: 460, back: selectedGoal ? () => setIsTransferModalOpen(false) : undefined,
      footer: <div className="flex gap-3">
            <button type="button" onClick={() => setIsTransferModalOpen(false)} className={`${secondaryBtn} flex-1`}>{t('split.cancel')}</button>
            <button type="submit" form="goal-transfer-form" className={`${primaryBtn} flex-[2]`}>{t('split.confirmTransferBtn')}</button>
          </div>,
      body: (<>
        {transferFromGoal && (
          <form id="goal-transfer-form" onSubmit={handleTransferSubmit} className="space-y-5">
            <div className="flex items-center gap-3"><GoalAvatar goal={transferFromGoal} size={40} /><div><p className="text-xs text-brand-muted">{t('split.sourceColon')}</p><p className="text-sm font-medium text-brand-text">{transferFromGoal.name} · {formatCurrency(transferFromGoal.current)}</p></div></div>
            <div>
              <label className={label} htmlFor="goal-transfer-to">{t('split.transferToLabel')}</label>
              <select id="goal-transfer-to" required value={transferToGoalId} onChange={(e) => setTransferToGoalId(e.target.value)} className={`${field} cursor-pointer`}>
                {goals.filter(g => g.id !== transferFromGoal.id).map(g => (
                  <option key={g.id} value={g.id}>{t('split.transferOptionLine', { emoji: g.emoji, name: g.name, current: formatCurrency(g.current), target: formatCurrency(g.target) })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="goal-transfer-amount">{t('split.amountBahtRequired')}</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-brand-muted">{tr("฿")}</span>
                <NumberInput id="goal-transfer-amount" required value={transferAmount} onChange={setTransferAmount} placeholder={t('split.amountPlaceholder')} className={`${field} pl-8 font-mono`} />
              </div>
              <p className="mt-1.5 text-xs text-brand-muted">{t('split.sourceBalanceLine', { amount: formatCurrency(transferFromGoal.current) })}</p>
            </div>
            <div>
              <label className={label} htmlFor="goal-transfer-date">{t('split.transactionDateLabel')}</label>
              <input id="goal-transfer-date" type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="goal-transfer-reason">{t('split.reasonOptionalLabel')}</label>
              <input id="goal-transfer-reason" type="text" value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder={t('split.transferReasonPlaceholder')} className={field} />
            </div>
          </form>
        )}
      </>),
    },
    (goalFormOpen) && {
      key: 'form', title: isEditForm ? tr("แก้ไขเป้าหมาย") : tr("สร้างเป้าหมาย"), width: 500, back: isEditForm ? closeGoalForm : undefined,
      footer: <div className="flex gap-3">
            <button type="button" onClick={closeGoalForm} className={`${secondaryBtn} flex-1`}>{t('split.cancel')}</button>
            <button type="submit" form="goal-form" className={`${primaryBtn} flex-[2]`}>{isEditForm ? tr("บันทึกการแก้ไข") : tr("สร้างเป้าหมาย")}</button>
          </div>,
      body: (<>
        <form id="goal-form" onSubmit={isEditForm ? handleEditGoalSubmit : handleAddGoalSubmit} className="space-y-5">
          <div>
            <label className={label} htmlFor="goal-name">{tr("ชื่อเป้าหมาย")}{' '}<span className="text-[#C24A16]">*</span></label>
            <input id="goal-name" type="text" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t('split.goalNamePlaceholder')} className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="goal-target">{t('split.targetAmountLabel')} <span className="text-[#C24A16]">*</span></label>
              <NumberInput id="goal-target" required value={formTarget} onChange={setFormTarget} placeholder={t('split.targetAmountPlaceholder')} className={`${field} font-mono`} />
            </div>
            <div>
              <label className={label} htmlFor="goal-current">{isEditForm ? tr("ยอดสะสมตอนนี้") : t('split.startingAmountLabel')}</label>
              <NumberInput id="goal-current" value={formCurrent} onChange={setFormCurrent} placeholder="0" className={`${field} font-mono`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="goal-type">{t('split.typeLabel')}</label>
              <select id="goal-type" value={formType} onChange={(e) => setFormType(e.target.value as typeof formType)} className={`${field} cursor-pointer`}>
                <option value="save">{t('split.typeSavingsAccount')}</option>
                <option value="invest">{t('split.typeInvestment')}</option>
                <option value="emergency">{t('split.typeEmergencyFund')}</option>
                <option value="buy">{t('split.typeBuy')}</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="goal-deadline">{t('split.deadlineLabel')}</label>
              <input id="goal-deadline" type="date" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} className={`${field} cursor-pointer`} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className={label} htmlFor="goal-pct">{tr("สัดส่วนจากเงินที่จัดสรร")}</label>
              <span className="mb-1.5 text-[13px] font-semibold text-brand-text">{formAllocatedPercentage}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max={formMaxPct} step="5" value={formAllocatedPercentage} onChange={(e) => setFormAllocatedPercentage(e.target.value)} aria-label={tr("สัดส่วน (เลื่อน)")} className="flex-1 accent-[#E65F2B] cursor-pointer" />
              <input id="goal-pct" type="number" min="0" max={formMaxPct} value={formAllocatedPercentage}
                onChange={(e) => setFormAllocatedPercentage(String(Math.min(formMaxPct, Math.max(0, parseInt(e.target.value) || 0))))}
                className={`${field.replace('w-full', '')} h-10 w-20 shrink-0 text-center font-mono`} />
            </div>
            <p className="mt-1.5 text-xs text-brand-muted">{tr("ตั้งได้สูงสุด {0}% (เป้าหมายอื่นใช้ไปแล้ว {1}%)", formMaxPct, isEditForm ? totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0) : totalAllocatedPct)}</p>
          </div>

          <div className="border-t border-brand-border pt-4">
            <button type="button" onClick={() => setFormAdvancedOpen(v => !v)} aria-expanded={formAdvancedOpen} className="flex w-full items-center justify-between text-[13px] font-medium text-brand-text cursor-pointer">
              <span className="flex items-center gap-2"><GoalAvatar goal={{ imageUrl: formImageUrl, icon: formIcon, type: formType, bg: formBg, acc: formAcc }} size={28} />{tr("ไอคอน รูป และสี")}</span>
              <ChevronDown className={`h-4 w-4 text-brand-muted transition-transform ${formAdvancedOpen ? 'rotate-180' : ''}`} />
            </button>
            {formAdvancedOpen && (
              <div className="mt-4 space-y-4">
                <div>
                  <span className={label}>{tr("ไอคอน")}</span>
                  <div className="grid grid-cols-6 gap-2 sm:grid-cols-7" role="radiogroup" aria-label={tr("ไอคอนเป้าหมาย")}>
                    {GOAL_ICONS.map(({ key, label, Icon }) => { const name = tr(label);
                      const on = formIcon === key && !formImageUrl;
                      return (
                        <button key={key} type="button" role="radio" aria-checked={on} aria-label={name} title={name} onClick={() => { setFormIcon(key); setFormImageUrl(''); }}
                          className={`flex aspect-square items-center justify-center rounded-xl border transition-colors cursor-pointer ${on ? 'border-[#E65F2B] bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'border-brand-border text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>
                          <Icon className="h-5 w-5" strokeWidth={1.8} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <span className={label}>{tr("หรือใช้รูปของคุณเอง")}</span>
                  <input type="file" id="goal-image-gallery" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleGalleryUpload(e, false)} className="hidden" />
                  <label htmlFor="goal-image-gallery" className={`${secondaryBtn} w-full`}><Upload className="h-4 w-4" /> {formImageUrl ? tr("เปลี่ยนรูป") : tr("เพิ่มรูปจากเครื่อง")}</label>
                  <p className="mt-1.5 text-xs text-brand-muted">{tr("PNG, JPG หรือ WebP ไม่เกิน 3MB")}</p>
                </div>
                {formImageUrl && (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-faint px-3 py-2.5">
                    <span className="flex items-center gap-2 text-[13px] text-brand-text"><img src={formImageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />{t('split.imageSelected')}</span>
                    <button type="button" onClick={() => setFormImageUrl('')} className="text-[13px] text-brand-muted hover:text-brand-text cursor-pointer">{t('split.removeImage')}</button>
                  </div>
                )}
                <div>
                  <span className={label}>{t('split.chooseColorTheme')}</span>
                  <div className="flex gap-3">
                    {colorPresets.map(preset => (
                      <button key={preset.name} type="button" aria-label={preset.name} onClick={() => { setFormBg(preset.bg); setFormAcc(preset.acc); }}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 cursor-pointer ${formBg === preset.bg ? 'border-brand-text' : 'border-transparent'}`} style={{ backgroundColor: preset.bg }}>
                        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: preset.acc }} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>
      </>),
    },
    (ratioEditorOpen) && {
      key: 'ratio', title: tr("ปรับสัดส่วน"), width: 480, back: undefined,
      footer: <div className="flex gap-3">
            <button type="button" onClick={() => setRatioEditorOpen(false)} className={`${secondaryBtn} flex-1`}>{t('split.cancel')}</button>
            <button type="button" onClick={saveRatios} disabled={ratioDraftTotal > 100} className={`${primaryBtn} flex-[2]`}>{tr("บันทึกสัดส่วน")}</button>
          </div>,
      body: (<>
        <p className="text-[13px] text-brand-muted">{tr("เมื่อมีเงินพร้อมจัดสรร ระบบจะแบ่งเข้าแต่ละเป้าหมายตามสัดส่วนนี้ รวมกันได้ไม่เกิน 100%")}</p>
        <ul className="mt-5 divide-y divide-brand-border">
          {goals.map(g => (
            <li key={g.id} className="flex items-center gap-3 py-3">
              <GoalAvatar goal={g} size={36} />
              <span className="min-w-0 flex-1 truncate text-sm text-brand-text">{g.name}</span>
              <div className="relative w-24">
                <input type="number" min="0" max="100" aria-label={tr("สัดส่วนของ {0}", g.name)} value={ratioDraft[g.id] ?? 0}
                  onChange={(e) => setRatioDraft(prev => ({ ...prev, [g.id]: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) }))}
                  className={`${field} h-10 pr-7 text-right font-mono`} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">%</span>
              </div>
            </li>
          ))}
        </ul>
        <div className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-[13px] ${ratioDraftTotal > 100 ? 'bg-[#FDEEEE] text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]' : 'bg-brand-faint text-brand-text'}`}>
          <span>{tr("รวม")}</span>
          <span className="font-semibold">{ratioDraftTotal}%{ratioDraftTotal > 100 ? tr(" · เกิน 100%") : ratioDraftTotal < 100 ? tr(" · เหลืออีก {0}%", 100 - ratioDraftTotal) : ''}</span>
        </div>
      </>),
    },
    (manualOpen) && {
      key: 'manual', title: tr("ฝากเงินเข้าเป้าหมายเอง"), width: 540, back: undefined,
      footer: isCurrentMonth && netProfit > 0 ? (
          <button type="button" onClick={() => { handleConfirmAllocations(); setManualOpen(false); }} disabled={totalCustomAllocated <= 0} className={`${primaryBtn} w-full`}>
            {tr("แบ่งเงิน {0} เข้าเป้าหมาย", formatCurrency(totalCustomAllocated))}</button>
        ) : undefined,
      body: (<>
        {isCurrentMonth && netProfit > 0 ? (
          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-brand-text">{tr("แบ่งเงินที่พร้อมจัดสรรเอง")}</h3>
                <p className="mt-0.5 text-[13px] text-brand-muted">{tr("พร้อมจัดสรร {0} · ยังแบ่งได้อีก", formatCurrency(netProfit))}{' '}<span className="font-medium text-brand-text">{formatCurrency(remainingNetProfit)}</span></p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleApplyPresetSplit} className={`${secondaryBtn} h-8 px-3 text-xs`}>{t('split.setSlidersByRatio')}</button>
              <button type="button" onClick={handleApplyEqualSplit} className={`${secondaryBtn} h-8 px-3 text-xs`}>{t('split.splitEqually')}</button>
              <button type="button" onClick={handleResetAllocations} className={`${secondaryBtn} h-8 px-3 text-xs`}>{t('split.clearAllSliders')}</button>
            </div>
            <ul className="mt-4 divide-y divide-brand-border">
              {goals.map(g => {
                const currentAllocated = customAllocations[g.id] || 0;
                const maxAllowed = Math.max(0, Math.min(g.target - g.current, remainingNetProfit + currentAllocated));
                const trackMax = Math.max(1, Math.min(g.target - g.current, netProfit));
                const set = (v: number) => setCustomAllocations(prev => ({ ...prev, [g.id]: Math.max(0, Math.min(v, maxAllowed)) }));
                return (
                  <li key={g.id} className="py-3.5">
                    <div className="flex items-center gap-3">
                      <GoalAvatar goal={g} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-brand-text">{g.name}</p>
                        <p className="text-xs text-brand-muted">{formatCurrency(g.current)} / {formatCurrency(g.target)}</p>
                      </div>
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-brand-muted">{tr("฿")}</span>
                        <NumberInput aria-label={tr("จำนวนเงินเข้า {0}", g.name)} value={currentAllocated || ''} onChange={(raw) => set(parseFloat(raw) || 0)} placeholder="0" className={`${field} h-10 pl-7 text-right font-mono`} />
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3 pl-12">
                      <input type="range" min="0" max={trackMax} value={currentAllocated} onChange={(e) => set(parseFloat(e.target.value) || 0)} disabled={maxAllowed <= 0} aria-label={tr("เลื่อนจำนวนเงินเข้า {0}", g.name)} className="flex-1 accent-[#E65F2B] cursor-pointer disabled:opacity-30" />
                      <button type="button" onClick={() => set(maxAllowed)} disabled={maxAllowed <= currentAllocated} className="text-xs font-medium text-[#C24A16] disabled:opacity-40 cursor-pointer dark:text-[#FF9A6B]">{tr("ใส่ทั้งหมด")}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p className="rounded-xl bg-brand-faint px-4 py-3 text-[13px] text-brand-muted">
            {isCurrentMonth ? tr("ตอนนี้ยังไม่มีเงินพร้อมจัดสรรให้แบ่ง แต่ยังฝากเงินจากที่อื่นเข้าเป้าหมายได้") : tr("แบ่งเงินพร้อมจัดสรรได้เฉพาะเดือนปัจจุบัน แต่ยังฝากเงินจากที่อื่นเข้าเป้าหมายได้")}
          </p>
        )}
        <section className="mt-6 border-t border-brand-border pt-5">
          <h3 className="text-[15px] font-semibold text-brand-text">{tr("ฝากเงินจากที่อื่น")}</h3>
          <p className="mt-0.5 text-[13px] text-brand-muted">{tr("เช่น เงินเก็บเดิม โบนัส หรือเงินที่ไม่ได้มาจากงาน")}</p>
          <ul className="mt-3 divide-y divide-brand-border">
            {goals.map(g => (
              <li key={g.id} className="flex items-center gap-3 py-3">
                <GoalAvatar goal={g} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm text-brand-text">{g.name}</span>
                <button type="button" onClick={() => openTxModal(g, 'deposit')} className={`${secondaryBtn} h-9 px-3 text-[13px]`}><Plus className="h-3.5 w-3.5" /> {tr("ฝาก")}</button>
              </li>
            ))}
          </ul>
        </section>
      </>),
    },
    (Boolean(selectedGoal)) && {
      key: 'goal', title: tr("เป้าหมาย"), width: 520, back: undefined,
      footer: selectedGoal ? (
          <div className="space-y-2.5">
            <button type="button" onClick={() => openTxModal(selectedGoal, 'deposit')} className={`${primaryBtn} w-full`}><Plus className="h-4 w-4" /> {tr("ฝากเงิน")}</button>
            <div className={`grid gap-2.5 ${goals.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button type="button" onClick={() => openTxModal(selectedGoal, 'withdraw')} className={secondaryBtn}><ArrowUpRight className="h-4 w-4" /> {tr("ถอนเงิน")}</button>
              {goals.length > 1 && <button type="button" onClick={() => openTransferModal(selectedGoal)} className={secondaryBtn}><RefreshCcw className="h-4 w-4" /> {tr("โอนไปเป้าหมายอื่น")}</button>}
            </div>
          </div>
        ) : undefined,
      body: (<>
        {selectedGoal && (() => {
          const g = selectedGoal;
          const pct = goalPct(g);
          const done = g.current >= g.target && g.target > 0;
          return (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <label htmlFor="edit-goal-image-gallery" className="group relative shrink-0 cursor-pointer" title={t('split.uploadNewImageTooltip')}>
                  <GoalAvatar goal={g} size={60} />
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">{t('split.changeImage')}</span>
                </label>
                <input type="file" id="edit-goal-image-gallery" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleGalleryUpload(e, true)} className="hidden" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xl font-semibold text-brand-text">{g.name}</h3>
                  <p className="mt-0.5 text-[13px] text-brand-muted">{typeLabel(g.type)}{g.deadline && <> · <span className={deadlinePassed(g) ? 'text-[#C43A3A] dark:text-[#F19A9A]' : ''}>{deadlinePassed(g) ? tr("เลยกำหนด ") : tr("ภายใน ")}{deadlineText(g)}</span></>}</p>
                  <button type="button" onClick={() => openEditGoalForm(g)} className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-border px-3 text-xs font-medium text-brand-text hover:bg-brand-faint cursor-pointer">
                    <IconPencil className="h-3.5 w-3.5" /> {tr("แก้ไขเป้าหมาย")}</button>
                </div>
              </div>

              <div>
                <p className="text-[13px] text-brand-muted">{tr("ความคืบหน้า")}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-brand-text">{formatCurrency(g.current)}</p>
                <p className="mt-0.5 text-[13px] text-brand-muted">{tr("จากเป้าหมาย {0}", formatCurrency(g.target))}</p>
                <div className="mt-3"><ProgressBar pct={pct} done={done} height={8} /></div>
                <p className={`mt-2 text-[13px] ${done ? 'font-medium text-[#12804F] dark:text-[#6FD3A3]' : 'text-brand-muted'}`}>{done ? tr("ถึงเป้าหมายแล้ว") : tr("{0} ของเป้าหมาย", pctText(pct))}</p>
              </div>

              <dl className="rounded-xl border border-brand-border text-[13px]">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-brand-muted">{tr("สัดส่วนจากเงินที่จัดสรร")}</dt>
                  <dd className="flex items-center gap-2"><span className="font-semibold text-brand-text">{g.allocatedPercentage ?? 0}%</span>
                    <button type="button" onClick={() => editRatio(g)} className="text-xs font-medium text-[#C24A16] hover:underline cursor-pointer dark:text-[#FF9A6B]">{tr("ปรับ")}</button></dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-brand-border px-4 py-3">
                  <dt className="text-brand-muted">{tr("เงินที่แนะนำให้แบ่งรอบนี้")}</dt>
                  <dd className="font-mono font-semibold text-brand-text">{formatCurrency(recommendedFor(g))}</dd>
                </div>
              </dl>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[15px] font-semibold text-brand-text">{tr("ประวัติ")}</h4>
                  <div className="relative">
                    <select aria-label={tr("กรองประวัติ")} value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}
                      className="h-8 appearance-none rounded-lg border border-brand-border bg-brand-white pl-2.5 pr-7 text-xs text-brand-text outline-none cursor-pointer dark:bg-transparent">
                      <option value="all">{tr("ทั้งหมด")}</option>
                      <option value="deposit">{tr("ฝากเข้า")}</option>
                      <option value="withdraw">{tr("ถอนออก")}</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" />
                  </div>
                </div>
                {historyGroups.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-brand-muted">{t('split.noHistoryInCategory')}</p>
                ) : historyGroups.map(group => (
                  <div key={group.day} className="mt-3">
                    <p className="pb-1 text-xs font-medium text-brand-muted">{dayLabel(group.day)}</p>
                    <ul className="divide-y divide-brand-border">
                      {group.items.map(tx => {
                        const isDeposit = tx.type === 'deposit';
                        const isTransfer = Boolean(tx.relatedGoalId);
                        return (
                          <li key={tx.id} className="flex items-center gap-3 py-2.5">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isTransfer ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/10 dark:text-[#FF9A6B]' : isDeposit ? 'bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]' : 'bg-brand-faint text-brand-muted'}`}>
                              {isTransfer ? <RefreshCcw className="h-3.5 w-3.5" /> : isDeposit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] text-brand-text">{tr(stripEmoji(tx.reason || '')) || (isDeposit ? t('split.depositEntryFallback') : t('split.withdrawEntryFallback'))}</p>
                              <p className="truncate text-[11px] text-brand-muted">
                                {[timeLabel(tx), isTransfer ? `${isDeposit ? t('split.fromGoal') : t('split.toGoal')} ${stripEmoji(tx.relatedGoalName || '') || '—'}` : '', tx.deductedFromCash ? tr("หักจากเงินรับจริง") : '', stripEmoji(tx.note || '')].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <span className={`shrink-0 font-mono text-[13px] font-medium ${isDeposit ? 'text-[#12804F] dark:text-[#6FD3A3]' : 'text-brand-text'}`}>{isDeposit ? '+' : '−'}{formatCurrency(tx.amount)}</span>
                            {onDeleteGoalTransaction && (
                              <div className="relative shrink-0">
                                <button type="button" aria-label={tr("ตัวเลือกรายการ")} aria-haspopup="menu" aria-expanded={txMenuId === tx.id}
                                  onClick={() => setTxMenuId(id => id === tx.id ? null : tx.id)}
                                  className="rounded-lg p-1.5 text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer"><MoreHorizontal className="h-4 w-4" /></button>
                                {txMenuId === tx.id && (
                                  <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-52 lg-glass is-menu rounded-[20px] p-1.5">
                                    <button type="button" role="menuitem" onClick={() => {
                                      setTxMenuId(null);
                                      triggerConfirm(t('split.deleteHistoryConfirmTitle'), t('split.deleteHistoryConfirmMsg', { reason: tr(stripEmoji(tx.reason || '')), amount: formatCurrency(tx.amount) }), () => onDeleteGoalTransaction(g.id, tx.id, true));
                                    }} className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-[#C43A3A] hover:bg-[#FDEEEE] cursor-pointer dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10">{tr("ลบรายการและคืนยอด")}</button>
                                    {canDeleteGoalTransactionHistoryOnly(goals, g.id, tx.id) && <button type="button" role="menuitem" onClick={() => {
                                      setTxMenuId(null);
                                      triggerConfirm(
                                        tr("ลบเฉพาะประวัติ"),
                                        tr("ลบรายการ {0} ออกจากประวัติโดยไม่เปลี่ยนยอดเงินปัจจุบันใช่หรือไม่?", formatCurrency(tx.amount)),
                                        () => onDeleteGoalTransaction(g.id, tx.id, false)
                                      );
                                    }} className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">{tr("ลบเฉพาะประวัติ (ไม่คืนยอด)")}</button>}
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <button type="button" onClick={() => triggerConfirm(t('split.deleteGoalConfirmTitle'), t('split.deleteGoalConfirmMsg', { name: g.name }), () => { if (onDeleteGoal(g.id)) setSelectedGoal(null); })}
                className="inline-flex items-center gap-1.5 text-[13px] text-brand-muted hover:text-[#C43A3A] cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> {t('split.deleteThisGoalBtn')}
              </button>
            </div>
          );
        })()}
      </>),
    },
  ];
  const activeSheet = sheets.find((x): x is Sheet => Boolean(x));
  const closeAllSheets = () => {
    setIsTxModalOpen(false); setIsTransferModalOpen(false); closeGoalForm();
    setRatioEditorOpen(false); setManualOpen(false); setSelectedGoal(null);
  };


  const sidePanel = (
    <>
      {/* One side panel for the whole page. Opening something from inside it (deposit from a goal,
          edit, transfer) swaps the panel's content, with a back arrow, instead of stacking panels. */}
      <Drawer open={Boolean(activeSheet)} title={activeSheet?.title ?? ''} onClose={closeAllSheets} onBack={activeSheet?.back}
        width={activeSheet?.width} footer={activeSheet?.footer} viewKey={activeSheet?.key}>
        {activeSheet?.body}
      </Drawer>
    </>
  );

  // Phones: the mobile design's goals page. The amounts, the proportional split and every goal
  // action are this page's own; ratios, manual split and sorting sit behind "จัดการ".
  if (mobile) {
    const canAllocate = Boolean(preview && previewAllocated > 0 && totalAllocatedPct <= 100);
    return (
      <div className="page-content ksm ksm-screen">
        <MobilePageHero title={tr("เป้าหมาย")} sub={tr("ค่อย ๆ ตุน ให้ถึงสิ่งที่ตั้งใจ")} onBack={onMobileBack}
          actions={<button type="button" className="ksm-toolbtn" onClick={openAddGoal} aria-label={tr("เพิ่มเป้าหมาย")}><KsIcon name="plus" /></button>}
          box={{
            label: tr("เงินพร้อมจัดสรร"),
            icon: 'target',
            amount: formatCurrency(netProfit),
            region: tr("เงินพร้อมจัดสรร"),
            detail: <p>{tr("การแบ่งเข้ากล่องเป้าหมายไม่ใช่รายจ่าย")}</p>,
            aside: <DashboardPeriodPicker monthKey={viewMonth} onChange={setViewMonth} compact labelOnly />,
          }} />
        {netProfit <= 0 && (
          <div className="ksm-info"><span><b>{tr("เดือนนี้ยังไม่มีเงินเหลือสำหรับจัดสรร")}</b><br />{emptyReason}</span></div>
        )}
        <button type="button" className="ksm-primary ksm-primary-wide" onClick={handleQuickProportionalAllocation} disabled={!canAllocate}>
          <KsIcon name="coins" size={19} />{canAllocate ? tr("แบ่งเงินตามสัดส่วน {0}", formatCurrency(previewAllocated)) : tr("แบ่งเงินตามสัดส่วน")}
        </button>
        <div className="ksm-row-between">
          <p className="ksm-caption" style={{ marginTop: 0 }}>
            {totalAllocatedPct > 100 ? tr("สัดส่วนรวม {0}% · เกิน 100% ลดสัดส่วนก่อนจัดสรร", totalAllocatedPct) : tr("สัดส่วนรวม {0}% · ไม่เกิน 100%", totalAllocatedPct)}
          </p>
          <button type="button" className="ksm-link" onClick={() => setManageSheetOpen(true)} disabled={goals.length === 0}>{tr("จัดการ")}{' '}<KsIcon name="chevron" size={17} /></button>
        </div>
        {goals.length === 0 ? (
          <div className="ksm-empty" style={{ marginTop: 12 }}>
            <h3>{tr("เริ่มตุนเงินให้เป้าหมายแรก")}</h3>
            <p>{tr("ตั้งชื่อ จำนวนเงิน และสัดส่วนที่อยากแบ่งให้")}</p>
            <button type="button" className="ksm-btn is-primary" style={{ marginTop: 14 }} onClick={openAddGoal}>{tr("สร้างเป้าหมาย")}</button>
          </div>
        ) : sortedGoals.map(g => {
          const pct = goalPct(g);
          const done = g.current >= g.target && g.target > 0;
          return (
            <article key={g.id} className="ksm-goal">
              <div className="ksm-goal-header">
                <GoalAvatar goal={g} size={32} />
                <div className="ksm-grow">
                  <h3>{g.name}</h3>
                  <p className={deadlinePassed(g) ? 'is-late' : undefined}>{tr("สัดส่วน {0}%", g.allocatedPercentage || 0)}{g.deadline ? ` · ${deadlinePassed(g) ? tr("เลยกำหนด ") : ''}${deadlineText(g)}` : ''}</p>
                </div>
                <button type="button" className="ksm-plainbtn" onClick={() => setSelectedGoal(g)} aria-label={tr("รายละเอียดและแก้ไข {0}", g.name)}><KsIcon name="more" /></button>
              </div>
              <p className="ksm-goal-amount">{formatCurrency(g.current)} <span>/ {formatCurrency(g.target)}</span></p>
              <div className={`ksm-progress${done ? ' is-done' : ''}`} role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="ksm-progress-label"><span>{done ? tr("ถึงเป้าแล้ว") : tr("ตุนแล้ว")}</span><span>{pctText(pct)}</span></div>
              <details className="ksm-goal-more">
                <summary><b>{tr("จัดการเงินในเป้าหมาย")}</b><KsIcon name="down" size={17} /></summary>
                <div className="ksm-button-row">
                  <button type="button" className="ksm-btn is-soft" onClick={() => openTxModal(g, 'deposit')}><KsIcon name="plus" size={17} />{tr("ฝาก")}</button>
                  <button type="button" className="ksm-btn is-outline" onClick={() => openTxModal(g, 'withdraw')}><KsIcon name="receive" size={17} />{tr("ถอน")}</button>
                  <button type="button" className="ksm-btn is-outline" onClick={() => openTransferModal(g)} disabled={goals.length < 2}><KsIcon name="transfer" size={17} />{tr("โอน")}</button>
                </div>
              </details>
            </article>
          );
        })}

        {manageSheetOpen && (
          <MobileSheet title={tr("จัดการเป้าหมาย")} onClose={() => setManageSheetOpen(false)}>
            <div className="ksm-list" style={{ marginTop: 14 }}>
              <button type="button" onClick={() => { setManageSheetOpen(false); openRatioEditor(); }}>
                <span className="ksm-list-icon"><KsIcon name="chart" /></span>
                <span className="ksm-grow"><b>{tr("ปรับสัดส่วน")}</b><p>{tr("กำหนดว่าเงินเหลือจะแบ่งเข้าเป้าหมายไหนกี่เปอร์เซ็นต์")}</p></span>
                <KsIcon name="chevron" size={16} />
              </button>
              <button type="button" onClick={() => { setManageSheetOpen(false); setManualOpen(true); }}>
                <span className="ksm-list-icon"><KsIcon name="coins" /></span>
                <span className="ksm-grow"><b>{tr("ฝากเงินเข้าเป้าหมายเอง")}</b><p>{tr("ใส่ยอดของแต่ละเป้าหมายด้วยตัวเอง")}</p></span>
                <KsIcon name="chevron" size={16} />
              </button>
            </div>
            <div className="ksm-selects" style={{ gridTemplateColumns: '1fr' }}>
              <label><span>{tr("เรียงเป้าหมาย")}</span>
                <select value={goalSort} onChange={(e) => setGoalSort(e.target.value as typeof goalSort)}>
                  <option value="ratio">{tr("สัดส่วน")}</option>
                  <option value="progress">{tr("ความคืบหน้า")}</option>
                  <option value="name">{tr("ชื่อ")}</option>
                </select>
              </label>
            </div>
          </MobileSheet>
        )}
        {sidePanel}
      </div>
    );
  }

  return (
    <div className="page-content space-y-6">
      <PageHeader page="split">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <DashboardPeriodPicker monthKey={viewMonth} onChange={setViewMonth} />
          <button type="button" onClick={openAddGoal} className={`${primaryBtn} h-10 shrink-0`}>
            <Plus className="h-4 w-4" /> {tr("สร้างเป้าหมาย")}</button>
        </div>
      </PageHeader>

      {/* Summary strip */}
      <dl className={`${card} grid grid-cols-2 gap-y-4 px-4 py-4 sm:px-0 lg:grid-cols-4 lg:divide-x lg:divide-brand-border`}>
        {[
          { label: tr("เงินรับจริง"), value: receivedThisMonth, tone: 'text-brand-text', dot: receivedThisMonth > 0 },
          { label: tr("รายจ่ายรวม"), value: totalExpense, tone: 'text-brand-text' },
          { label: tr("พร้อมจัดสรร"), value: netProfit, tone: 'text-[#C24A16] dark:text-[#FF9A6B]' },
          { label: tr("จัดสรรแล้ว"), value: alreadyAllocatedThisMonth, tone: 'text-brand-text' },
        ].map(item => (
          <div key={item.label} className="min-w-0 sm:px-6">
            <dt className="flex items-center gap-1.5 text-[13px] text-brand-muted">{item.dot && <span className="h-1.5 w-1.5 rounded-full bg-[#18A66A]" />}{item.label}</dt>
            <dd className={`mt-1 truncate font-mono text-xl font-semibold tracking-tight sm:text-2xl ${item.tone}`}>{formatCurrency(item.value)}</dd>
          </div>
        ))}
      </dl>

      {/* Computers and iPads: the vault card in "Liquid Amber" (owner, 2026-10-21; styles in goalsAmber.css,
          ga-* classes only, so the phone branch above is untouched). Every action and figure is the one the
          page already had; only the layout and look changed. */}
      <div className="grid gap-5 min-[1440px]:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <section className="ga-vault p-6 sm:p-7" aria-labelledby="split-available">
          <div className="ga-liquid" aria-hidden="true">
            <svg viewBox="0 0 800 500" preserveAspectRatio="none">
              <ellipse cx="650" cy="80" rx="240" ry="130" fill="rgba(255,236,214,0.16)" />
              <path className="ga-wave-a" d="M0,320 C150,240 270,410 430,322 C570,246 670,298 800,232 L800,500 L0,500 Z" fill="rgba(255,255,255,0.14)" />
              <path className="ga-wave-b" d="M0,402 C170,330 305,470 470,392 C612,326 702,380 800,338 L800,500 L0,500 Z" fill="rgba(255,255,255,0.16)" />
              <path className="ga-shine" d="M-20,452 C150,372 300,470 470,402 C620,344 720,372 822,320" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
              <path className="ga-shine" d="M420,-10 C520,60 640,30 822,110" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="ga-vault-grid">
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-3">
                <span className="ga-mark" aria-hidden="true"><img src="/brand/logo01-v1/symbol-ci.svg" width={28} height={28} alt="" /></span>
                <div className="min-w-0">
                  <h2 id="split-available" className="text-[19px] font-semibold leading-tight">{tr("คลังเงินพร้อมจัดสรร")}</h2>
                  <p className="mt-0.5 text-[13px] text-white/80">{tr("เงินที่เหลือจากงาน แบ่งเข้าเป้าหมายตามสัดส่วนที่ตั้งไว้")}</p>
                </div>
              </div>
              <p className="mt-7 text-[15px] font-medium text-white/90">{tr("เงินที่พร้อมจัดสรรเดือนนี้")}</p>
              <p className={`ga-amount mt-2 font-mono${formatCurrency(netProfit).length > 9 ? ' is-long' : ''}`}>{formatCurrency(netProfit)}</p>
              <div className="ga-breakdown mt-4 space-y-0.5 text-[13px] text-white/90">
                <p>{tr("จากเงินรับจริง")}{' '}<span className="font-mono font-medium text-white">{formatCurrency(receivedThisMonth)}</span></p>
                <p>{tr("หักรายจ่าย")}{' '}<span className="font-mono font-medium text-white">{formatCurrency(totalExpense)}</span></p>
                {alreadyAllocatedThisMonth > 0 && <p>{tr("แบ่งไปแล้ว")}{' '}<span className="font-mono font-medium text-white">{formatCurrency(alreadyAllocatedThisMonth)}</span></p>}
              </div>
            </div>

            <div className="ga-glass flex min-w-0 flex-col p-4">
              <div className="flex items-start justify-between gap-3 px-1.5">
                <h3 id="split-plan" className="text-[15px] font-semibold">{tr("แผนแบ่งเงิน")}</h3>
                <div className="shrink-0 text-right text-[12.5px]">
                  <p className={totalAllocatedPct > 100 ? 'font-semibold text-[#C43A3A] dark:text-[#F19A9A]' : 'font-medium'}>{tr("สัดส่วนที่ตั้งไว้ {0}%", totalAllocatedPct)}</p>
                  {totalAllocatedPct <= 100 && unassignedPct > 0 && <p className="ga-muted">{tr("เหลืออีก {0}%", unassignedPct)}</p>}
                </div>
              </div>
              {totalAllocatedPct > 100 && (
                <p className="mx-1.5 mt-3 rounded-xl bg-[#FDEEEE] px-3 py-2 text-[12.5px] text-[#B83434] dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]">{tr("สัดส่วนรวมเกิน 100% ลดเปอร์เซ็นต์ของบางเป้าหมายก่อนแบ่งเงิน")}</p>
              )}
              {goals.length === 0 ? (
                <p className="ga-muted mt-5 px-1.5 text-[13px]">{tr("ยังไม่มีเป้าหมาย สร้างเป้าหมายก่อนแล้วค่อยตั้งสัดส่วน")}</p>
              ) : (
                <ul className="mt-2.5 space-y-0.5">
                  {sortedGoals.map(g => {
                    const pct = g.allocatedPercentage || 0;
                    const amount = preview?.allocations[g.id] || 0;
                    return (
                      <li key={g.id}>
                        <button type="button" onClick={() => setSelectedGoal(g)} aria-label={tr("{0} สัดส่วน {1}%", g.name, pct)}
                          className="ga-plan-row grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-1.5 py-2 text-left cursor-pointer">
                          <GoalAvatar goal={g} size={34} />
                          <span className="min-w-0">
                            <span className="flex items-baseline justify-between gap-2 text-[13.5px]">
                              <span className="truncate font-medium">{g.name}</span>
                              {preview && <span className="ga-muted shrink-0 font-mono text-[12px]">{formatCurrency(amount)}</span>}
                            </span>
                            <span className="ga-track mt-1.5 block"><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
                          </span>
                          <span className="w-10 text-right text-[13.5px] font-semibold">{pct}%</span>
                          <ChevronRight className="ga-muted h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                  {unassignedPct > 0 && totalAllocatedPct <= 100 && (
                    <li className="grid grid-cols-[34px_minmax(0,1fr)_auto_16px] items-center gap-x-3 px-1.5 py-2 text-[13px]">
                      <span aria-hidden />
                      <span className="min-w-0"><span className="ga-muted block">{tr("ยังไม่กำหนด")}</span><span className="ga-track mt-1.5 block"><span className="is-unset" style={{ width: `${unassignedPct}%` }} /></span></span>
                      <span className="ga-muted w-10 text-right">{unassignedPct}%</span>
                      <span aria-hidden />
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {preview && previewAllocated > 0 && totalAllocatedPct <= 100 && (
              <button type="button" onClick={handleQuickProportionalAllocation} className="ga-pill is-strong">{tr("จัดสรร {0}", formatCurrency(previewAllocated))}</button>
            )}
            <button type="button" onClick={() => setManualOpen(true)} disabled={goals.length === 0} className="ga-pill is-accent">
              <PlusCircle className="h-4 w-4" /> {tr("ฝากเงินเข้าเป้าหมายเอง")}</button>
            <button type="button" onClick={openRatioEditor} disabled={goals.length === 0} className="ga-pill">
              <Settings className="h-4 w-4" /> {tr("ปรับสัดส่วน")}</button>
          </div>
        </section>

        {/* What this month's money means, beside the vault: the reason there is nothing to split, or what
            the allocation will do. The mascot is the official one; only its mood and pose change. */}
        <section className={`${card} ga-status flex flex-col p-6`} aria-label={tr("สถานะการจัดสรรเดือนนี้")}>
          {(() => {
            const ready = preview && previewAllocated > 0 && totalAllocatedPct <= 100;
            const doneThisMonth = netProfit <= 0 && alreadyAllocatedThisMonth > 0 && receivedThisMonth > 0 && totalExpense <= receivedThisMonth;
            const pose: { mood: MascotMood; action: MascotAction } = ready ? { mood: 'happy', action: 'hold-coin' }
              : doneThisMonth ? { mood: 'proud', action: 'celebrate' }
              : netProfit <= 0 ? { mood: 'sleepy', action: 'sleep' }
              : { mood: 'thinking', action: 'idle' };
            const heading = ready ? tr("พร้อมแบ่ง {0}", formatCurrency(previewAllocated))
              : !isCurrentMonth ? tr("ดูย้อนหลังเท่านั้น")
              : goals.length === 0 ? tr("ยังไม่มีเป้าหมาย")
              : doneThisMonth ? tr("แบ่งครบแล้วเดือนนี้")
              : netProfit <= 0 ? tr("ยังไม่มีเงินให้แบ่ง")
              : totalAllocatedPct > 100 ? tr("สัดส่วนรวมเกิน 100%")
              : tr("ยังไม่ได้ตั้งสัดส่วน");
            const body = ready ? tr("กดจัดสรรครั้งเดียว ระบบจะแบ่งเข้าเป้าหมายตามสัดส่วนที่ตั้งไว้")
              : !isCurrentMonth ? tr("จัดสรรได้เฉพาะเดือนปัจจุบัน")
              : goals.length === 0 ? tr("สร้างเป้าหมายก่อนแล้วค่อยตั้งสัดส่วน")
              : doneThisMonth ? tr("เงินที่เหลือของเดือนนี้ถูกแบ่งเข้าเป้าหมายแล้ว")
              : netProfit <= 0 ? tr("เมื่อเงินรับจริงมากกว่ารายจ่าย กดจัดสรรครั้งเดียว ระบบจะแบ่งเข้าเป้าหมายตามสัดส่วนที่ตั้งไว้")
              : totalAllocatedPct > 100 ? tr("ลดเปอร์เซ็นต์ของบางเป้าหมายก่อนแบ่งเงิน")
              : tr("ตั้งสัดส่วนให้เป้าหมายก่อน แล้วระบบจะแบ่งให้ตามนี้");
            return <>
              {netProfit <= 0 && !doneThisMonth && (
                <div className="ga-note flex items-start gap-2.5 px-4 py-3 text-[13px]">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{tr("เดือนนี้ยังไม่มีเงินเหลือสำหรับจัดสรร")}</p>
                    <p className="mt-0.5 opacity-90">{emptyReason}</p>
                  </div>
                </div>
              )}
              <div className="ga-status-body">
                <span className="shrink-0" aria-hidden="true"><Mascot mood={pose.mood} action={pose.action} size={112} /></span>
                <div className="flex flex-col items-center">
                  <p className="mt-3 text-[17px] font-semibold text-brand-text">{heading}</p>
                  <p className="mt-1 max-w-[24rem] text-[13px] leading-relaxed text-brand-muted">{body}</p>
                  {ready && preview && preview.remainder > 0 && <p className="mt-2 text-[12.5px] text-brand-muted">{tr("ยังไม่จัดสรร {0}", formatCurrency(preview.remainder))}</p>}
                </div>
              </div>
            </>;
          })()}
        </section>
      </div>

      {/* Goals */}
      <section aria-labelledby="split-goals">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="split-goals" className="text-[19px] font-semibold text-brand-text">{tr("เป้าหมายของคุณ")}</h2>
            {goals.length > 0 && <p className="mt-0.5 text-[13px] text-brand-muted">{tr("{0} เป้าหมาย · จัดสรรรวม {1}%", goals.length, totalAllocatedPct)}</p>}
          </div>
          {goals.length > 1 && (
            <div className="relative">
              <select aria-label={tr("เรียงเป้าหมาย")} value={goalSort} onChange={(e) => setGoalSort(e.target.value as typeof goalSort)}
                className="h-10 appearance-none rounded-full border border-brand-border bg-brand-white pl-4 pr-9 text-[13px] text-brand-text outline-none hover:bg-brand-faint focus:border-[#E65F2B] cursor-pointer">
                <option value="ratio">{tr("เรียงตาม: สัดส่วน")}</option>
                <option value="progress">{tr("เรียงตาม: ความคืบหน้า")}</option>
                <option value="name">{tr("เรียงตาม: ชื่อ")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            </div>
          )}
        </div>
        {goals.length === 0 ? (
          <div className={`${card} flex flex-col items-center gap-2 rounded-[24px] px-6 py-12 text-center`}>
            <Mascot mood="thinking" size={64} />
            <p className="mt-1 text-[15px] font-medium text-brand-text">{tr("ยังไม่มีเป้าหมาย")}</p>
            <p className="text-[13px] text-brand-muted">{tr("เริ่มจากสิ่งที่อยากเก็บเงินให้ก่อน")}</p>
            <button type="button" onClick={openAddGoal} className={`${primaryBtn} mt-3 h-10`}><Plus className="h-4 w-4" /> {tr("สร้างเป้าหมาย")}</button>
          </div>
        ) : (
          <ul className={`${card} divide-y divide-brand-border overflow-hidden rounded-[24px]`}>
            {sortedGoals.map(g => {
              const pct = goalPct(g);
              const done = g.current >= g.target && g.target > 0;
              return (
                <li key={g.id}>
                  <button type="button" onClick={() => setSelectedGoal(g)}
                    className="ga-goal-row grid w-full grid-cols-[auto_minmax(0,12.5rem)_minmax(0,1fr)_7.5rem_auto] items-center gap-x-5 px-5 py-4 text-left cursor-pointer">
                    <GoalAvatar goal={g} size={48} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="truncate text-[15px] font-semibold text-brand-text">{g.name}</span>
                        <span className="text-xs text-brand-muted">{typeLabel(g.type)}</span>
                      </span>
                      <span className="mt-1 block font-mono text-[13px] text-brand-text">{formatCurrency(g.current)} <span className="text-brand-muted">/ {formatCurrency(g.target)}</span></span>
                    </span>
                    <span className="min-w-0">
                      <ProgressBar pct={pct} done={done} />
                      <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-brand-muted">
                        <span>{tr("สัดส่วน {0}%", g.allocatedPercentage || 0)}</span>
                        {g.deadline && <span className={deadlinePassed(g) ? 'text-[#C43A3A] dark:text-[#F19A9A]' : ''}>{deadlinePassed(g) ? tr("เลยกำหนด ") : tr("ภายใน ")}{deadlineText(g)}</span>}
                      </span>
                    </span>
                    <span className={`text-right text-[13px] ${done ? 'font-medium text-[#12804F] dark:text-[#6FD3A3]' : 'text-brand-muted'}`}>{done ? tr("ถึงเป้าแล้ว") : tr("{0} ของเป้าหมาย", pctText(pct))}</span>
                    <ChevronRight className="h-5 w-5 text-brand-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sidePanel}
    </div>
  );
}

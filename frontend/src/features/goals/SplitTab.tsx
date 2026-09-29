import { imageFileToDataUrl } from '../../services/images';
import React, { useState, useMemo, useEffect } from 'react';
import { Job, Goal, AppSettings, GoalTransaction, Expense } from '../../../../shared/types';
import { formatCurrency, getMonthKey, dateLocale } from '../../utils';
import { getReceivedForMonth } from '../../../../shared/installmentPayments';
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
  Tag
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
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

interface SplitTabProps {
  jobs: Job[];
  goals: Goal[];
  expenses: Expense[];
  settings: AppSettings;
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onDeleteGoal: (id: string) => void;
  onUpdateGoalProgress: (id: string, amount: number, reason?: string, date?: string, deductFromCash?: boolean) => void;
  onDeleteGoalTransaction?: (goalId: string, txId: string, revertBalance?: boolean) => void;
  onTransferBetweenGoals: (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => void;
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
}: SplitTabProps) {
  const { t } = useLanguage();
  const currentMonthKey = selectedMonthKey;

  // 1. Calculate Received This Month (Confirmed Income)
  const receivedThisMonth = jobs
    .reduce((sum, j) => sum + getReceivedForMonth(j, currentMonthKey), 0);

  // 2. Net Profit calculation (Received - fixed monthly expense - this month's logged variable
  // expenses) -- previously only subtracted the fixed monthly expense, so a month with real
  // logged expenses (DashboardTab's "กำไรสุทธิ" breakdown already accounts for these) could show
  // an overstated profit here that didn't match Dashboard's figure at all.
  const variableExpenseThisMonth = expenses
    .filter(e => getMonthKey(e.date) === currentMonthKey)
    .reduce((sum, e) => sum + e.amount, 0);
  const rawNetProfit = Math.max(0, receivedThisMonth - settings.monthlyExpense - variableExpenseThisMonth);
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

  // Calculate segment breakdown for visual representation based on rawNetProfit (planned target quota)
  const goalSegments = goals.map(g => {
    const pct = g.allocatedPercentage || 0;
    const amt = Math.min(g.target - g.current, Math.floor(rawNetProfit * (pct / 100)));
    const pctOfTotal = receivedThisMonth > 0 ? (amt / receivedThisMonth) * 100 : 0;
    return {
      id: g.id,
      name: g.name,
      color: g.acc,
      pctOfTotal,
      amt,
    };
  }).filter(s => s.pctOfTotal > 0);

  const totalSegmentPct = goalSegments.reduce((sum, s) => sum + s.pctOfTotal, 0);
  const expensePercent = Math.min(100, ((settings.monthlyExpense + variableExpenseThisMonth) / Math.max(1, receivedThisMonth)) * 100);
  const remainingProfitPct = Math.max(0, 100 - expensePercent - totalSegmentPct);
  const donutGradient = useMemo(() => {
    if (receivedThisMonth <= 0) return 'conic-gradient(#E8DFD3 0deg 360deg)';
    let cursor = 0;
    const parts: string[] = [];
    const addPart = (color: string, percent: number) => {
      const start = cursor;
      cursor = Math.min(100, cursor + Math.max(0, percent));
      if (cursor > start) parts.push(`${color} ${start * 3.6}deg ${cursor * 3.6}deg`);
    };
    addPart('#E65F2B', expensePercent);
    goalSegments.forEach((segment) => addPart(segment.color || '#059669', segment.pctOfTotal));
    addPart('#E8DFD3', Math.max(0, 100 - cursor));
    return `conic-gradient(${parts.join(', ')})`;
  }, [receivedThisMonth, expensePercent, goalSegments]);

  // 5. Breakeven revenue calculations
  // To cover both expenses and reach the monthly revenue goal

  // State for dynamic profit allocation values
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});
  const [showDangerZone, setShowDangerZone] = useState(false);

  // Initialize custom allocations map to automatically calculated amounts based on each goal's custom percentage quota!
  useEffect(() => {
    const initial: Record<string, number> = {};
    goals.forEach(g => {
      const pct = g.allocatedPercentage || 0;
      const autoAmt = Math.min(g.target - g.current, Math.floor(netProfit * (pct / 100)));
      initial[g.id] = Math.max(0, autoAmt);
    });
    setCustomAllocations(initial);
  }, [goals, netProfit]);

  const totalCustomAllocated = useMemo(() => {
    return (Object.values(customAllocations) as number[]).reduce((sum, val) => sum + val, 0);
  }, [customAllocations]);

  const remainingNetProfit = Math.max(0, netProfit - totalCustomAllocated);

  const handleApplyPresetSplit = () => {
    // This is now "Auto Allocation based on custom goal percentages"
    const next: Record<string, number> = {};
    goals.forEach(g => {
      const pct = g.allocatedPercentage || 0;
      const autoAmt = Math.min(g.target - g.current, Math.floor(netProfit * (pct / 100)));
      next[g.id] = Math.max(0, autoAmt);
    });
    setCustomAllocations(next);
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
      onAllocateMultipleSavings(currentAllocationsRecord);

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
    const accumulatedRemainder = settings.accumulatedRemainder || 0;
    const totalToSplit = netProfit + accumulatedRemainder;

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

    let remainingToDistribute = totalToSplit;
    const allocations: Record<string, number> = {};
    goals.forEach(g => { allocations[g.id] = 0; });

    let changed = true;
    while (changed && remainingToDistribute > 0) {
      changed = false;
      const nonCappedActiveGoals = activeGoals.filter(g => {
        const currentAlloc = allocations[g.id] || 0;
        return (g.current + currentAlloc) < g.target;
      });

      if (nonCappedActiveGoals.length === 0) break;

      const activeTotalPct = nonCappedActiveGoals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
      
      for (const g of nonCappedActiveGoals) {
        if (remainingToDistribute <= 0) break;
        const pct = g.allocatedPercentage || 0;
        const share = pct / activeTotalPct;
        const amountToGive = Math.min(
          g.target - (g.current + allocations[g.id]),
          Math.floor(remainingToDistribute * share)
        );
        if (amountToGive > 0) {
          allocations[g.id] += amountToGive;
          remainingToDistribute -= amountToGive;
          changed = true;
        }
      }

      if (!changed && remainingToDistribute > 0) {
        for (const g of nonCappedActiveGoals) {
          if (remainingToDistribute <= 0) break;
          allocations[g.id] += 1;
          remainingToDistribute -= 1;
          changed = true;
        }
      }
    }

    const finalRemainder = remainingToDistribute;
    const totalAllocatedToGoals = totalToSplit - finalRemainder;

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

    const messageHtml = t('split.quickAllocateConfirmMsg', {
      total: formatCurrency(totalToSplit),
      netProfit: formatCurrency(netProfit),
      remainder: formatCurrency(accumulatedRemainder),
      list: allocationsListText,
      finalRemainder: formatCurrency(finalRemainder),
    });

    triggerConfirm(
      t('split.quickAllocateConfirmTitle'),
      messageHtml,
      () => {
        // netProfit above is derived live from deductedFromCash deposit history -- see the
        // comment on handleConfirmAllocations above for why no allocatedMonths bookkeeping
        // belongs here anymore.
        onAllocateMultipleSavings(allocations, {
          accumulatedRemainder: finalRemainder
        });

        triggerAlert(
          t('split.deductSuccessTitle'),
          t('split.deductSuccessMsg', { amount: formatCurrency(totalAllocatedToGoals), remainder: formatCurrency(finalRemainder) })
        );
      }
    );
  };

  const handleAllocateRemainderToAnyGoal = () => {
    const remainder = settings.accumulatedRemainder || 0;
    if (remainder <= 0) return;

    const nonFullGoals = goals.filter(g => g.current < g.target);
    if (nonFullGoals.length === 0) {
      triggerAlert(t('split.allGoalsFullErrorTitle'), t('split.allGoalsFullErrorMsg'));
      return;
    }

    const optionsText = nonFullGoals
      .map((g, idx) => t('split.optionLine', { idx: idx + 1, name: g.name, amount: formatCurrency(g.target - g.current) }))
      .join('\n');

    triggerPrompt(
      t('split.dropRemainderPromptTitle', { amount: formatCurrency(remainder) }),
      t('split.dropRemainderPromptMsg', { options: optionsText }),
      '1',
      t('split.typeNumberPlaceholder'),
      'number',
      (val) => {
        const idx = parseInt(val) - 1;
        if (isNaN(idx) || idx < 0 || idx >= nonFullGoals.length) {
          triggerAlert(t('split.invalidDataTitle'), t('split.invalidDataMsg'));
          return;
        }

        const selected = nonFullGoals[idx];
        const nextAllocations = { [selected.id]: remainder };

        onAllocateMultipleSavings(nextAllocations, {
          accumulatedRemainder: 0
        });

        triggerAlert(
          t('split.remainderDepositedTitle'),
          t('split.remainderDepositedMsg', { amount: formatCurrency(remainder), name: selected.name })
        );
      }
    );
  };

  // Add Goal local form states (for local Add Goal sheet)
  const [isAddGoalLocalOpen, setIsAddGoalLocalOpen] = useState(false);
  const [isEditGoalLocalOpen, setIsEditGoalLocalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'save' | 'invest' | 'emergency' | 'buy'>('save');
  const [formTarget, setFormTarget] = useState('');
  const [formCurrent, setFormCurrent] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formEmoji, setFormEmoji] = useState('🎯');
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

    onUpdateGoalProgress(txGoal.id, signedAmount, finalReason, txDate, txType === 'deposit' && txDeductFromCash);
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

    if (amount > transferFromGoal.current) {
      triggerAlert(
        t('split.insufficientBalanceTitle'),
        t('split.insufficientBalanceMsg', { name: transferFromGoal.name, balance: formatCurrency(transferFromGoal.current), amount: formatCurrency(amount) })
      );
      return;
    }

    onTransferBetweenGoals(transferFromGoal.id, toGoal.id, amount, transferReason.trim() || undefined, transferDate);
    setIsTransferModalOpen(false);
  };

  useEffect(() => {
    if (initialSelectedGoalId === 'ADD_NEW_GOAL') {
      setIsAddGoalLocalOpen(true);
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

  const openEditGoalForm = (g: Goal) => {
    setFormName(g.name);
    setFormType(g.type);
    setFormTarget(String(g.target));
    setFormCurrent(String(g.current));
    setFormDeadline(g.deadline || '');
    setFormEmoji(g.emoji || '🎯');
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
  const emojiPresets = ['🎯', '📷', '💻', '✈️', '🏕️', '🚨', '🐷', '📈', '🎸', '🏠', '🎓', '💍', '🚗', '💰'];
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
      emoji: formEmoji,
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

    imageFileToDataUrl(file).then(base64String => {
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
    }).catch(error=>triggerAlert('อัปโหลดภาพไม่สำเร็จ',error.message));
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
          triggerAlert('นำเข้าสำเร็จ', 'ดึงข้อมูลงานและเป้าหมายจากไฟล์สำรองเข้าสู่ระบบเรียบร้อยแล้ว!');
        } catch (err) {
          triggerAlert('เกิดข้อผิดพลาด', 'รูปแบบไฟล์สำรองไม่ถูกต้อง กรุณาเลือกไฟล์ .json ที่ถูกต้อง');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleQuickAddGoal = () => {
    triggerPrompt('เพิ่มเป้าหมายการเงิน', 'ตั้งชื่อเป้าหมายใหม่', '', 'เช่น เงินฉุกเฉิน', 'text', name => {
      if (!name.trim()) return;
      triggerPrompt('ยอดเป้าหมาย', `ต้องการเก็บเงินสำหรับ “${name.trim()}” เท่าไร`, '', 'เช่น 50000', 'number', value => {
        const target = Number(value);
        if (!Number.isFinite(target) || target <= 0) {
          triggerAlert('ยอดไม่ถูกต้อง', 'กรุณาระบุยอดเป้าหมายมากกว่า 0 บาท');
          return;
        }
        onAddGoal({
          name: name.trim(),
          type: 'save',
          target,
          current: 0,
          deadline: new Date().toISOString().split('T')[0],
          emoji: '🎯',
          bg: '#FFF0E8',
          acc: '#E65F2B',
          allocatedPercentage: 0,
          history: [],
        });
      });
    });
  };

  return (
    <div className="draft10-goals page-content">
      <header className="draft10-goals-heading">
        <h1>เป้าหมายการเงิน</h1>
        <button type="button" onClick={handleQuickAddGoal}><Plus />เพิ่มเป้าหมาย</button>
      </header>
      <section className="draft10-goals-summary">
        <div><span>รายรับ</span><strong>{formatCurrency(receivedThisMonth)}</strong></div>
        <div><span>รายจ่าย</span><strong>{formatCurrency(Math.max(0, receivedThisMonth - rawNetProfit))}</strong></div>
        <div className="profit"><span>กำไรสุทธิ</span><strong>{formatCurrency(rawNetProfit)}</strong></div>
        <div><span>จัดสรรแล้ว</span><strong>{formatCurrency(alreadyAllocatedThisMonth)}</strong></div>
        <div className="available"><span>พร้อมจัดสรร</span><strong>{formatCurrency(netProfit)}</strong></div>
      </section>
      <p className="draft10-goals-note">เงินที่จัดสรรเข้าเป้าหมายยังเป็นเงินของคุณ ไม่บันทึกเป็นรายจ่าย</p>
      <section className="draft10-goals-list">
        {goals.map(goal => {
          const percent = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0;
          return <article key={goal.id}>
            <header>
              <span className="icon">{goal.emoji || '◎'}</span><h2>{goal.name}</h2>
              <div className="draft10-goal-actions">
                <button type="button" onClick={() => triggerPrompt('แก้ไขชื่อเป้าหมาย', 'ระบุชื่อใหม่', goal.name, 'ชื่อเป้าหมาย', 'text', value => value.trim() && onUpdateGoal(goal.id, { name: value.trim() }))}>แก้ไข</button>
                <button type="button" onClick={() => triggerConfirm('ลบเป้าหมาย', `ต้องการลบ “${goal.name}” ใช่ไหม`, () => onDeleteGoal(goal.id))}>ลบ</button>
                <button type="button" className="is-primary" onClick={() => triggerPrompt('จัดสรรเงิน', `เพิ่มเงินเข้าเป้าหมาย ${goal.name}`, '', 'จำนวนเงิน', 'number', value => onUpdateGoalProgress(goal.id, Number(value) || 0, 'จัดสรรเงิน', undefined, true))}>จัดสรรเงิน</button>
              </div>
            </header>
            <div className="amount"><span>{formatCurrency(goal.current)} / {formatCurrency(goal.target)}</span><b>{percent}%</b></div>
            <div className="track"><i style={{ width: `${percent}%` }} /></div>
          </article>;
        })}
        {!goals.length && <div className="empty">ยังไม่มีเป้าหมายการเงิน</div>}
      </section>
    </div>
  );
}

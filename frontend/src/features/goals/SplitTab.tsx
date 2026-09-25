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

  return (
    <div className="page-content space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[28px] bg-[#3D2314] px-6 py-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-black tracking-wider text-[#F4C99E] uppercase">
            <PiggyBank className="h-4 w-4" /> วางแผนเงินให้ทุกบาทมีเป้าหมาย
          </span>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            {t('split.title')}
          </h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#E8D7C5]">ดูเงินคงเหลือ วางสัดส่วน และเติมเป้าหมายออมได้จากหน้าเดียว โดยระบบจะไม่ให้แบ่งเกินเงินที่มีจริง</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
          <Mascot mood="wave" size={52} className="shrink-0" />
          <div><span className="block text-[9px] font-bold text-[#E8D7C5]">พร้อมจัดสรร</span><strong className="font-mono text-lg text-white">{formatCurrency(netProfit)}</strong></div>
        </div>
      </div>

      {/* Overview: answer the three questions a first-time user has before asking them to allocate. */}
      <section className="overflow-hidden rounded-[28px] border border-brand-border bg-brand-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-brand-border/50 bg-gradient-to-r from-[#FFF8EE] to-white px-5 py-5 dark:from-neutral-900 dark:to-neutral-900 sm:px-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#9A541C]">
                <IconBarChart className="h-4 w-4" /> ภาพรวมเงินเดือนนี้
              </div>
              <h3 className="mt-1 text-xl font-black text-brand-text dark:text-white">เงินของคุณถูกแบ่งไปทางไหนบ้าง</h3>
              <p className="mt-1 text-xs text-brand-muted">เริ่มจากเงินที่รับจริง หักค่าใช้จ่าย แล้วค่อยจัดเงินที่เหลือเข้าเป้าหมาย</p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1.5 text-[11px] font-black ${totalAllocatedPct > 100 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              สัดส่วนเป้าหมายรวม {totalAllocatedPct}%
            </span>
          </div>
        </div>

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col items-center justify-center">
            <div className="relative h-56 w-56 rounded-full shadow-inner" style={{ background: donutGradient }} aria-label="แผนภูมิสัดส่วนเงินเดือนนี้">
              <div className="absolute inset-[25px] flex flex-col items-center justify-center rounded-full border border-brand-border/50 bg-white text-center shadow-sm dark:bg-neutral-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">จัดสรรได้ตอนนี้</span>
                <strong className="mt-1 font-mono text-2xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(netProfit)}</strong>
                <span className="mt-1 text-[10px] text-brand-muted">หลังหักรายจ่ายแล้ว</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[10px] font-bold text-brand-muted">
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#E65F2B]" />ค่าใช้จ่าย {expensePercent.toFixed(0)}%</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-600" />เป้าหมาย {totalSegmentPct.toFixed(0)}%</span>
              <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#E8DFD3]" />ยังไม่จัดสรร {remainingProfitPct.toFixed(0)}%</span>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-700"><Coins className="h-4 w-4" />เงินรับจริง</div>
                <p className="mt-2 font-mono text-xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(receivedThisMonth)}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/20 dark:bg-rose-500/10">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-rose-700"><TrendingDown className="h-4 w-4" />รายจ่ายรวม</div>
                <p className="mt-2 font-mono text-xl font-black text-rose-700 dark:text-rose-400">{formatCurrency(settings.monthlyExpense + variableExpenseThisMonth)}</p>
                <p className="mt-1 text-[9px] text-brand-muted">คงที่ {formatCurrency(settings.monthlyExpense)} · แปรผัน {formatCurrency(variableExpenseThisMonth)}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-700"><PiggyBank className="h-4 w-4" />แบ่งไปแล้ว</div>
                <p className="mt-2 font-mono text-xl font-black text-amber-700 dark:text-amber-400">{formatCurrency(alreadyAllocatedThisMonth)}</p>
              </div>
            </div>

            {totalAllocatedPct > 100 && (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                <IconWarning className="mt-0.5 h-4 w-4 shrink-0" /> สัดส่วนเป้าหมายรวมเกิน 100% กรุณาลดเปอร์เซ็นต์ก่อนยืนยันการแบ่งเงิน
              </div>
            )}

            <div className="rounded-2xl border border-brand-border/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-brand-text dark:text-white">แผนจัดสรรตามเป้าหมาย</h4>
                  <p className="text-[10px] text-brand-muted">จำนวนที่ระบบแนะนำจากเงินที่จัดสรรได้ในเดือนนี้</p>
                </div>
                <button type="button" onClick={handleQuickProportionalAllocation} className="rounded-xl bg-brand-text px-3 py-2 text-[10px] font-black text-white transition hover:opacity-90 disabled:opacity-40" disabled={netProfit <= 0 || goals.length === 0}>
                  แบ่งตามสัดส่วนทันที
                </button>
              </div>
              {goals.length === 0 ? (
                <button type="button" onClick={() => setIsAddGoalLocalOpen(true)} className="w-full rounded-xl border border-dashed border-brand-border p-5 text-xs font-bold text-[#9A541C] hover:bg-brand-faint">+ สร้างเป้าหมายแรก</button>
              ) : (
                <div className="space-y-3">
                  {goals.map((goal) => {
                    const pct = goal.allocatedPercentage || 0;
                    const suggested = Math.min(Math.max(0, goal.target - goal.current), Math.floor(netProfit * pct / 100));
                    const progress = goal.target > 0 ? Math.min(100, goal.current / goal.target * 100) : 0;
                    return (
                      <button key={goal.id} type="button" onClick={() => setSelectedGoal(goal)} className="grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-xl p-2 text-left transition hover:bg-brand-faint">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg text-base" style={{ backgroundColor: goal.bg }}>{goal.imageUrl ? <img src={goal.imageUrl} alt="" className="h-full w-full object-cover" /> : goal.emoji}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3"><span className="truncate text-xs font-black text-brand-text dark:text-white">{goal.name}</span><span className="text-[10px] font-black" style={{ color: goal.acc }}>{pct}%</span></div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-faint"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: goal.acc }} /></div>
                              <p className="mt-1 text-[9px] text-brand-muted">สะสมแล้ว {formatCurrency(goal.current)} จาก {formatCurrency(goal.target)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right"><span className="block text-[9px] text-brand-muted">แนะนำเดือนนี้</span><strong className="font-mono text-xs text-brand-text dark:text-white">{formatCurrency(suggested)}</strong></div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Dynamic Profit Allocation Manager */}
      <section className="rounded-[28px] border border-brand-border bg-brand-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-7">
        <div className="mb-6 flex flex-col gap-3 border-b border-brand-border/50 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#E65F2B]">ขั้นตอนที่ 2</span>
            <h3 className="mt-1 text-xl font-black text-brand-text dark:text-white">กำหนดจำนวนเงินที่จะใส่แต่ละเป้าหมาย</h3>
            <p className="mt-1 text-xs text-brand-muted">พิมพ์จำนวนเงินหรือเลื่อนแถบ ระบบจะคุมยอดรวมไม่ให้เกินเงินที่จัดสรรได้</p>
          </div>
          <div className="rounded-xl bg-brand-faint px-4 py-2 text-right"><span className="block text-[9px] font-bold text-brand-muted">ยังแบ่งได้อีก</span><strong className="font-mono text-base text-[#9A541C]">{formatCurrency(remainingNetProfit)}</strong></div>
        </div>

        {(netProfit > 0 || (settings.accumulatedRemainder || 0) > 0) ? (
          <div className="space-y-6">
            {/* 4 Allocation Info Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-brand-border/60 bg-brand-faint/70 p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">{t('split.netProfitThisMonth')}</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-black font-mono text-emerald-600">{formatCurrency(netProfit)}</span>
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">{t('split.fullProfit', { amount: formatCurrency(rawNetProfit) })}</span>
              </div>
              <div className="rounded-2xl border border-brand-border/60 bg-brand-faint/70 p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">{t('split.accumulatedRemainder')}</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-black font-mono text-indigo-600">{formatCurrency(settings.accumulatedRemainder || 0)}</span>
                  {(settings.accumulatedRemainder || 0) > 0 && (
                    <button
                      onClick={handleAllocateRemainderToAnyGoal}
                      className="text-[9px] font-extrabold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded cursor-pointer"
                      title={t('split.dropIntoGoalTooltip')}
                    >
                      {t('split.dropIntoGoal')}
                    </button>
                  )}
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">{t('split.remainderDesc')}</span>
              </div>
              <div className="rounded-2xl border border-brand-border/60 bg-brand-faint/70 p-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">ยอดที่เลือกแบ่งรอบนี้</span>
                <span className="text-lg font-black font-mono text-purple-600 mt-1">{formatCurrency(totalCustomAllocated)}</span>
                <span className="text-[9px] text-brand-muted mt-0.5">{t('split.sliderSetAmount')}</span>
              </div>
              <div className={`border rounded-2xl p-4 flex flex-col justify-between transition-all ${
                remainingNetProfit > 0 
                  ? 'bg-amber-500/5 border-amber-300 dark:border-amber-500/30' 
                  : 'bg-emerald-500/5 border-emerald-300 dark:border-emerald-500/30'
              }`}>
                <span className="text-[10px] font-bold text-brand-muted uppercase">{t('split.remainingToSlide')}</span>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-lg font-black font-mono ${remainingNetProfit > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(remainingNetProfit)}
                  </span>
                  {remainingNetProfit === 0 && (
                    <span className="text-[9px] font-extrabold bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase inline-flex items-center gap-0.5">
                      {t('split.done')} <IconCheck className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">{t('split.remainingSliderDesc')}</span>
              </div>
            </div>

            {/* Presets Row */}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-border/50 bg-brand-faint/40 p-3">
              <span className="mr-1 text-[10px] font-black text-brand-muted uppercase">ตัวช่วยแบ่งเงิน</span>
              
              <button
                onClick={handleQuickProportionalAllocation}
                className="px-3 py-2 bg-brand-text hover:opacity-90 text-white rounded-xl text-[10px] font-extrabold shadow-sm flex items-center gap-1 transition-all cursor-pointer"
                title={t('split.quickProportionalTooltip')}
              >
                <Zap className="w-3 h-3 text-white" /> {t('split.quickProportionalBtn')}
              </button>

              <button
                onClick={handleApplyPresetSplit}
                className="px-3 py-2 bg-white border border-brand-border hover:bg-brand-faint text-brand-text rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconTarget className="w-3 h-3" /> {t('split.setSlidersByRatio')}
              </button>

              <button
                onClick={handleApplyEqualSplit}
                className="px-3 py-2 bg-white border border-brand-border hover:bg-brand-faint text-brand-text rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconScale className="w-3 h-3" /> {t('split.splitEqually')}
              </button>

              <button
                onClick={handleResetAllocations}
                className="px-3 py-2 bg-white border border-brand-border hover:bg-brand-faint text-brand-muted rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconClear className="w-3 h-3" /> {t('split.clearAllSliders')}
              </button>
            </div>

            {/* List of Goals with Custom Controls */}
            <div className="grid gap-4 lg:grid-cols-2">
              {goals.map(g => {
                const currentAllocated = customAllocations[g.id] || 0;
                const remainingToGoalLimit = g.target - g.current;
                const maxAllowedForThisGoal = Math.min(remainingToGoalLimit, remainingNetProfit + currentAllocated);
                // Stable ceiling for the slider track (doesn't shift when OTHER goals' sliders move),
                // so the fill position only changes when this goal's own value changes.
                const sliderTrackMax = Math.max(1, Math.min(remainingToGoalLimit, netProfit));
                const pctOfGoal = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;

                const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  const allowed = Math.min(val, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleInputChange = (raw: string) => {
                  const val = parseFloat(raw) || 0;
                  const allowed = Math.min(val, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleAddAmount = (amt: number) => {
                  const nextVal = currentAllocated + amt;
                  const allowed = Math.min(nextVal, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleSetMax = () => {
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, maxAllowedForThisGoal)
                  }));
                };

                return (
                  <div 
                    key={g.id}
                    className="space-y-4 rounded-2xl border border-brand-border/70 bg-white p-5 shadow-xs transition-all hover:border-[#D98324]/50 dark:bg-neutral-900"
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner overflow-hidden border border-brand-border/20 shrink-0"
                          style={{ backgroundColor: g.bg || 'var(--faint)' }}
                        >
                          {g.imageUrl ? (
                            <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            g.emoji
                          )}
                        </div>
                        <div>
                          <h5 className="text-xs font-extrabold text-brand-text dark:text-white flex items-center gap-1.5">
                            <span>{g.name}</span>
                            <span 
                              className="text-[8px] font-black uppercase px-2 py-0.2 rounded-full border"
                              style={{ color: g.acc, borderColor: `${g.acc}40`, backgroundColor: `${g.acc}08` }}
                            >
                              {g.type === 'save' ? t('split.goalTypeSave') : g.type === 'invest' ? t('split.goalTypeInvest') : t('split.goalTypeGeneral')}
                            </span>
                          </h5>
                          <p className="text-[10px] text-brand-muted mt-0.5">
                            {t('split.cumulativeProgress', { current: formatCurrency(g.current), target: formatCurrency(g.target), pct: pctOfGoal.toFixed(0) })}
                          </p>
                        </div>
                      </div>

                      {/* Right-side value input box */}
                      <div className="flex items-center gap-1 bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 w-28 shrink-0">
                        <span className="text-[10px] font-extrabold text-brand-muted">฿</span>
                        <NumberInput
                           value={currentAllocated || ''}
                           onChange={handleInputChange}
                           className="w-full bg-transparent text-xs font-extrabold font-mono text-brand-text dark:text-neutral-100 outline-none text-right"
                           placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Slider & Quick increments row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max={sliderTrackMax}
                        value={currentAllocated}
                        onChange={handleSliderChange}
                        disabled={maxAllowedForThisGoal <= 0}
                        className="flex-1 accent-emerald-600 dark:accent-emerald-400 h-1 bg-brand-faint dark:bg-neutral-800 rounded-lg cursor-pointer disabled:opacity-30"
                      />

                      <div className="flex gap-1 shrink-0 justify-end">
                        <button
                          onClick={() => handleAddAmount(100)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +100
                        </button>
                        <button
                          onClick={() => handleAddAmount(500)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +500
                        </button>
                        <button
                          onClick={() => handleAddAmount(1000)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +1k
                        </button>
                        <button
                          onClick={handleSetMax}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2.5 py-1 bg-emerald-500 text-white rounded-md text-[9px] font-black hover:bg-emerald-600 transition-all disabled:opacity-40 cursor-pointer"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confirm button */}
            <div className="pt-4">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleConfirmAllocations}
                disabled={totalCustomAllocated <= 0}
                className="w-full py-4 bg-[#3D2314] hover:bg-[#5A3420] text-white font-black text-xs rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:bg-stone-300 dark:disabled:bg-stone-800 disabled:text-stone-500 dark:disabled:text-stone-600 disabled:shadow-none cursor-pointer"
              >
                <span>{t('split.confirmAllocateBtn', { amount: formatCurrency(totalCustomAllocated) })}</span>
                <IconRocket className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-amber-500/5 border border-dashed border-amber-500/20 rounded-2xl text-center space-y-2">
            <IconWarning className="w-6 h-6 mx-auto text-amber-600 dark:text-amber-400" />
            <h5 className="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              {t('split.noProfitTitle')}
            </h5>
            <p className="text-[10px] text-brand-muted max-w-md mx-auto leading-relaxed">
              {t('split.noProfitDesc')}
            </p>
          </div>
        )}
      </section>

      {/* Section 3: Savings Targets Cards Grid (Merged TargetTab) */}
      <section className="space-y-5 rounded-[28px] border border-brand-border bg-brand-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#E65F2B]">ขั้นตอนที่ 3</span>
            <h3 className="mt-1 text-xl font-black text-brand-text dark:text-white">ติดตามเป้าหมายทั้งหมด</h3>
            <p className="mt-1 text-xs text-brand-muted">กดการ์ดเพื่อฝาก ถอน โอนเงิน หรือแก้ไขรายละเอียดเป้าหมาย</p>
          </div>
          <button
            onClick={() => setIsAddGoalLocalOpen(true)}
            className="flex w-fit items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 py-2.5 text-[11px] font-black text-white shadow-sm transition-all hover:bg-[#C94E20]"
          >
            <Plus className="w-3.5 h-3.5" /> {t('split.createNewGoal')}
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-brand-border bg-brand-faint/40 p-12 text-center text-brand-muted">
            <Mascot mood="sleepy" size={100} />
            <div>
              <p className="text-xs font-semibold text-brand-text">{t('split.noGoalsTitle')}</p>
              <p className="text-[10px] mt-1">{t('split.noGoalsDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {goals.map(g => {
              const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
              return (
                <motion.div
                  key={g.id}
                  whileHover={{ scale: 1.015 }}
                  onClick={() => setSelectedGoal(g)}
                  className="relative flex min-h-[190px] cursor-pointer select-none flex-col justify-between overflow-hidden rounded-2xl border border-brand-border/80 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-[#D98324]/50 hover:shadow-lg dark:bg-neutral-900"
                >
                  <div>
                    <div 
                      className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-brand-border/20 text-xl shadow-inner"
                      style={{ backgroundColor: g.bg }}
                    >
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        g.emoji
                      )}
                    </div>

                    <h4 className="truncate text-sm font-black leading-tight text-brand-text">{g.name}</h4>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <p className="text-[9px] text-brand-muted font-bold uppercase tracking-wider">
                        {g.type === 'save' ? t('split.goalTypeSaveShort') : g.type === 'invest' ? t('split.goalTypeInvestShort') : g.type === 'emergency' ? t('split.goalTypeEmergencyShort') : t('split.goalTypeGeneral')}
                      </p>
                      {g.allocatedPercentage !== undefined && g.allocatedPercentage > 0 && (
                        <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded-md">
                          {t('split.ratioBadge', { pct: g.allocatedPercentage ?? 0 })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress and values */}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="font-mono text-base font-black text-brand-text">{formatCurrency(g.current)}</span>
                      <span className="text-[9px] text-brand-muted">/ {formatCurrency(g.target)}</span>
                    </div>

                    <div className="w-full h-1.5 bg-brand-faint rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: g.acc }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[8px] font-semibold">
                      <span style={{ color: g.acc }}>{t('split.pctSuccess', { pct: pct.toFixed(0) })}</span>
                      {g.deadline && (
                        <span className="text-brand-muted">
                          {t('split.dueAbbrev', { date: new Date(g.deadline).toLocaleDateString(dateLocale(), { month: 'short', year: '2-digit' }) })}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* Merged TargetTab Modal: Add Goal Bottom Sheet */}
      <AnimatePresence>
        {isAddGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddGoalLocalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden" />

              <div className="flex justify-between items-center border-b border-brand-faint pb-3">
                <h3 className="text-lg font-bold font-display text-brand-text dark:text-white">{t('split.createGoalTitle')}</h3>
                <button onClick={() => setIsAddGoalLocalOpen(false)} className="text-2xl text-brand-muted hover:text-brand-text leading-none">&times;</button>
              </div>

              <form onSubmit={handleAddGoalSubmit} className="space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">{t('split.goalNameLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('split.goalNamePlaceholder')}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.typeLabel')}</label>
                    <select
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      className="w-full bg-brand-faint text-sm text-brand-text rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="save">{t('split.typeSavingsAccount')}</option>
                      <option value="invest">{t('split.typeInvestment')}</option>
                      <option value="emergency">{t('split.typeEmergencyFund')}</option>
                      <option value="buy">{t('split.typeBuy')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.deadlineLabel')}</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                      className="w-full bg-brand-faint text-sm text-brand-text rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.targetAmountLabel')}</label>
                    <NumberInput
                      required
                      placeholder={t('split.targetAmountPlaceholder')}
                      value={formTarget}
                      onChange={setFormTarget}
                      className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.startingAmountLabel')}</label>
                    <NumberInput
                      placeholder="0"
                      value={formCurrent}
                      onChange={setFormCurrent}
                      className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 p-3.5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block text-[11px] font-black">
                      {t('split.monthlyAllocRatioLabel')}
                    </label>
                    <span className="text-xs font-black font-mono text-emerald-600">{formAllocatedPercentage}%</span>
                  </div>
                  <p className="text-[10px] text-brand-muted mb-2 leading-relaxed">
                    {t('split.monthlyAllocRatioDesc', { pct: Math.max(0, 100 - totalAllocatedPct) })}
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, 100 - totalAllocatedPct)}
                      step="5"
                      value={formAllocatedPercentage}
                      onChange={(e) => setFormAllocatedPercentage(e.target.value)}
                      className="flex-1 accent-emerald-600 h-1.5 bg-brand-faint rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, 100 - totalAllocatedPct)}
                      value={formAllocatedPercentage}
                      onChange={(e) => {
                        const val = Math.min(Math.max(0, 100 - totalAllocatedPct), Math.max(0, parseInt(e.target.value) || 0));
                        setFormAllocatedPercentage(String(val));
                      }}
                      className="bg-brand-white dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 w-16 text-center"
                    />
                  </div>
                </div>

                {/* Emoji presets selection & Free input */}
                <div className="space-y-2">
                  <label className="text-brand-muted uppercase tracking-wider flex items-center gap-1">{t('split.chooseSymbolLabel')} <IconPalette className="w-3 h-3" /></label>
                  
                  {/* Preset list */}
                  <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                    {emojiPresets.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setFormEmoji(emoji);
                          setFormImageUrl('');
                        }}
                        className={`w-10 h-10 rounded-xl text-lg shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
                          formEmoji === emoji && !formImageUrl
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-105 font-bold' 
                            : 'bg-brand-faint border-brand-border/40 text-brand-text hover:bg-brand-border/40 dark:bg-stone-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Free-form Inputs with Gallery Upload */}
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">{t('split.customEmojiLabel')}</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder={t('split.customEmojiPlaceholder')}
                          value={formEmoji}
                          onChange={(e) => {
                            setFormEmoji(e.target.value);
                            setFormImageUrl('');
                          }}
                          className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-emerald-500 text-center font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">{t('split.uploadGalleryLabel')}</label>
                        <div className="relative">
                          <input
                            type="file"
                            id="goal-image-gallery"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => handleGalleryUpload(e, false)}
                            className="hidden"
                          />
                          <label
                            htmlFor="goal-image-gallery"
                            className="w-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/25 border border-dashed border-emerald-500/30 hover:border-emerald-500 text-emerald-700 dark:text-emerald-400 rounded-xl p-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <span>{t('split.chooseFromDevice')}</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Image Preview */}
                    {formImageUrl && (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <img 
                            src={formImageUrl} 
                            alt="Preview" 
                            className="w-10 h-10 rounded-lg object-cover border border-emerald-500/20"
                          />
                          <div>
                            <span className="text-[10px] font-bold text-brand-text block">{t('split.imageSelected')}</span>
                            <span className="text-[8px] text-brand-muted font-mono truncate block max-w-[180px]">
                              {t('split.uploadSuccess')}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormImageUrl('')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          {t('split.removeImage')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Color presets selection */}
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">{t('split.chooseColorTheme')}</label>
                  <div className="flex gap-3 py-1">
                    {colorPresets.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setFormBg(preset.bg);
                          setFormAcc(preset.acc);
                        }}
                        className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border-2 ${
                          formBg === preset.bg ? 'border-brand-text scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.acc }}
                        title={preset.name}
                      >
                        {formBg === preset.bg && <IconCheck className="w-2.5 h-2.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                >
                  {t('split.saveGoalBtn')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Merged TargetTab Modal: Edit Goal Bottom Sheet */}
      <AnimatePresence>
        {isEditGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditGoalLocalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden mb-1" />

              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-black text-brand-text dark:text-white flex items-center gap-1.5">
                    {t('split.editGoalTitle')} <IconPencil className="w-3.5 h-3.5" />
                  </h3>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    {t('split.editGoalDesc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditGoalLocalOpen(false)}
                  className="p-1 bg-brand-faint hover:bg-brand-border dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditGoalSubmit} className="space-y-4 text-xs">
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-brand-muted uppercase tracking-wider block">{t('split.goalNameRequiredLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('split.goalNamePlaceholder2')}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold text-brand-text outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Grid Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Type Selection */}
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.accountTypeLabel')}</label>
                    <select
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-xs font-bold text-brand-text outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="save">{t('split.typeSavingsAccount2')}</option>
                      <option value="invest">{t('split.typeInvestmentFund')}</option>
                      <option value="emergency">{t('split.typeEmergencyFund')}</option>
                      <option value="buy">{t('split.typeBigPurchase')}</option>
                    </select>
                  </div>

                  {/* Deadline date */}
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.goalDeadlineLabel')}</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Target & Current Values */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.targetToSaveLabel')}</label>
                    <NumberInput
                      required
                      placeholder={t('split.targetPlaceholder2')}
                      value={formTarget}
                      onChange={setFormTarget}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold font-mono text-brand-text outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">{t('split.currentAmountLabel')}</label>
                    <NumberInput
                      required
                      placeholder={t('split.currentAmountPlaceholder')}
                      value={formCurrent}
                      onChange={setFormCurrent}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold font-mono text-brand-text outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Profit Split slider input */}
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-brand-border/60 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block">{t('split.monthlyDividendPct')}</span>
                    <span className="text-[9px] text-brand-muted leading-relaxed block mt-0.5">
                      {t('split.monthlyDividendDesc', { pct: Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0))) })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0)))}
                      value={formAllocatedPercentage}
                      onChange={(e) => {
                        const maxPct = Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0)));
                        const val = Math.min(maxPct, Math.max(0, parseInt(e.target.value) || 0));
                        setFormAllocatedPercentage(String(val));
                      }}
                      className="bg-brand-white dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 w-16 text-center"
                    />
                  </div>
                </div>

                {/* Emoji presets selection & Free input */}
                <div className="space-y-2">
                  <label className="text-brand-muted uppercase tracking-wider flex items-center gap-1">{t('split.chooseSymbolLabel')} <IconPalette className="w-3 h-3" /></label>
                  
                  {/* Preset list */}
                  <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                    {emojiPresets.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setFormEmoji(emoji);
                          setFormImageUrl('');
                        }}
                        className={`w-10 h-10 rounded-xl text-lg shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
                          formEmoji === emoji && !formImageUrl
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-105 font-bold' 
                            : 'bg-brand-faint border-brand-border/40 text-brand-text hover:bg-brand-border/40 dark:bg-stone-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Free-form Inputs with Gallery Upload */}
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">{t('split.customEmojiLabel')}</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder={t('split.customEmojiPlaceholder')}
                          value={formEmoji}
                          onChange={(e) => {
                            setFormEmoji(e.target.value);
                            setFormImageUrl('');
                          }}
                          className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-emerald-500 text-center font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">{t('split.uploadGalleryLabel')}</label>
                        <div className="relative">
                          <input
                            type="file"
                            id="edit-goal-image-gallery-form"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => handleGalleryUpload(e, false)}
                            className="hidden"
                          />
                          <label
                            htmlFor="edit-goal-image-gallery-form"
                            className="w-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/25 border border-dashed border-emerald-500/30 hover:border-emerald-500 text-emerald-700 dark:text-emerald-400 rounded-xl p-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <span>{t('split.chooseFromDevice')}</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Image Preview */}
                    {formImageUrl && (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <img 
                            src={formImageUrl} 
                            alt="Preview" 
                            className="w-10 h-10 rounded-lg object-cover border border-emerald-500/20"
                          />
                          <div>
                            <span className="text-[10px] font-bold text-brand-text block">{t('split.imageSelected')}</span>
                            <span className="text-[8px] text-brand-muted font-mono truncate block max-w-[180px]">
                              {t('split.uploadSuccess')}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormImageUrl('')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          {t('split.removeImage')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Color presets selection */}
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">{t('split.chooseColorTheme')}</label>
                  <div className="flex gap-3 py-1">
                    {colorPresets.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setFormBg(preset.bg);
                          setFormAcc(preset.acc);
                        }}
                        className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border-2 ${
                          formBg === preset.bg ? 'border-brand-text scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.acc }}
                        title={preset.name}
                      >
                        {formBg === preset.bg && <IconCheck className="w-2.5 h-2.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                >
                  {t('split.saveEditGoalBtn')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Merged TargetTab Modal: Detail bottom sheet */}
      <AnimatePresence>
        {selectedGoal && !isEditGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedGoal(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden mb-2" />

              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-4">
                <div className="relative group shrink-0">
                  <input
                    type="file"
                    id="edit-goal-image-gallery"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => handleGalleryUpload(e, true)}
                    className="hidden"
                  />
                  <label 
                    htmlFor="edit-goal-image-gallery"
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-brand-border/30 overflow-hidden cursor-pointer relative transition-all hover:brightness-95 block bg-neutral-100 dark:bg-stone-800"
                    style={{ backgroundColor: selectedGoal.bg }}
                    title={t('split.uploadNewImageTooltip')}
                  >
                    {selectedGoal.imageUrl ? (
                      <img src={selectedGoal.imageUrl} alt={selectedGoal.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      selectedGoal.emoji
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                      {t('split.changeImage')}
                    </div>
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold font-display text-brand-text dark:text-white leading-tight truncate">{selectedGoal.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-xs text-brand-muted font-bold uppercase shrink-0">
                      {selectedGoal.type === 'save' ? t('split.savingsAccountLabel') : t('split.investmentFundLabel')}
                    </p>
                    <span className="text-neutral-300 dark:text-neutral-700">•</span>
                    <label 
                      htmlFor="edit-goal-image-gallery"
                      className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      {t('split.uploadSelfieOrGallery')}
                    </label>
                  </div>
                </div>
              </div>

              {/* Stats detail */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block">{t('split.progressLabel')}</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-3xl font-extrabold font-mono text-brand-text dark:text-white">{formatCurrency(selectedGoal.current)}</span>
                  <span className="text-xs text-brand-muted font-bold">{t('split.fromTarget', { target: formatCurrency(selectedGoal.target) })}</span>
                </div>

                <div className="w-full h-3 bg-brand-faint dark:bg-neutral-800 rounded-full overflow-hidden mt-3">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(100, (selectedGoal.current / selectedGoal.target) * 100)}%`, 
                      backgroundColor: selectedGoal.acc 
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="font-extrabold" style={{ color: selectedGoal.acc }}>
                    {t('split.pctAchieved', { pct: ((selectedGoal.current / selectedGoal.target) * 100).toFixed(1) })}
                  </span>
                  {selectedGoal.deadline && (
                    <span className="text-brand-muted">
                      {t('split.deadlineDue', { date: new Date(selectedGoal.deadline).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) })}
                    </span>
                  )}
                </div>
              </div>

              {/* Allocation ratio card inside detail modal */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 border border-brand-border/60 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block">{t('split.monthlyAllocRatio')}</span>
                  <span className="text-xs font-black font-mono text-emerald-600">{t('split.pctOfNetProfit', { pct: (selectedGoal.allocatedPercentage ?? 0) })}</span>
                </div>
                <p className="text-[10px] text-brand-muted leading-relaxed">
                  {t('split.monthlyAutoAllocDesc', { pct: selectedGoal.allocatedPercentage ?? 0 })}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const otherGoalsTotalPct = totalAllocatedPct - (selectedGoal.allocatedPercentage || 0);
                    const maxPctForThisGoal = Math.max(0, 100 - otherGoalsTotalPct);
                    triggerPrompt(
                      t('split.editRatioPromptTitle'),
                      t('split.editRatioPromptMsg', { name: selectedGoal.name, max: maxPctForThisGoal, otherTotal: otherGoalsTotalPct }),
                      String(selectedGoal.allocatedPercentage ?? 0),
                      t('split.enterPctPlaceholder'),
                      'number',
                      (val) => {
                        const pct = Math.min(maxPctForThisGoal, Math.max(0, parseFloat(val) || 0));
                        onUpdateGoal(selectedGoal.id, { allocatedPercentage: pct });
                        setSelectedGoal(prev => prev ? { ...prev, allocatedPercentage: pct } : null);
                        triggerAlert(t('split.ratioUpdatedTitle'), t('split.ratioUpdatedMsg', { name: selectedGoal.name, pct }));
                      }
                    );
                  }}
                  className="w-full py-1.5 bg-white dark:bg-stone-800 hover:bg-neutral-100 dark:hover:bg-stone-700 border border-brand-border text-brand-text dark:text-neutral-200 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <IconTarget className="w-3 h-3" /> {t('split.editRatioBtn')}
                </button>
              </div>

              {/* Action buttons on Goal */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openTxModal(selectedGoal, 'deposit')}
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 p-3 rounded-xl font-bold transition-all cursor-pointer border-none shadow-sm"
                  >
                    <IconCoin className="w-4 h-4" /> {t('split.depositMore')}
                  </button>

                  <button
                    type="button"
                    onClick={() => openTxModal(selectedGoal, 'withdraw')}
                    className="flex items-center justify-center gap-1.5 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/10 dark:text-rose-400 dark:border-rose-900/30 hover:bg-rose-100 p-3 rounded-xl font-bold transition-all cursor-pointer shadow-xs"
                  >
                    <IconCoinOut className="w-4 h-4" /> {t('split.withdrawMoney')}
                  </button>
                </div>

                {goals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => openTransferModal(selectedGoal)}
                    className="w-full flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/30 p-3 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    <IconLoop className="w-4 h-4" /> {t('split.transferToOtherGoal')}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openEditGoalForm(selectedGoal)}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 p-3 rounded-xl font-bold transition-all cursor-pointer"
                >
                  <IconPencil className="w-3.5 h-3.5" /> {t('split.editGoalInfo')}
                </button>
              </div>

              {/* Transaction History Section */}
              <div className="pt-4 border-t border-brand-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand-text dark:text-white" />
                    <h4 className="text-xs font-extrabold text-brand-text dark:text-white">
                      {t('split.historyTitle')}
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-brand-muted bg-brand-faint dark:bg-neutral-800 px-2 py-0.5 rounded-md">
                    {t('split.itemsCount', { count: (selectedGoal.history || []).length })}
                  </span>
                </div>

                {/* History Stats Summary Bar */}
                {selectedGoal.history && selectedGoal.history.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">{t('split.totalDepositsIn')}</span>
                      <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                        +{formatCurrency(selectedGoal.history.filter(h => h.type === 'deposit').reduce((sum, h) => sum + h.amount, 0))}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">{t('split.totalWithdrawnOut')}</span>
                      <span className="font-mono font-extrabold text-rose-700 dark:text-rose-400">
                        -{formatCurrency(selectedGoal.history.filter(h => h.type === 'withdraw').reduce((sum, h) => sum + h.amount, 0))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Filter Pills */}
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                  <div className="flex items-center gap-1 bg-brand-faint dark:bg-neutral-800 p-1 rounded-xl w-full justify-between">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('all')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'all' ? 'bg-white dark:bg-stone-700 text-brand-text dark:text-white shadow-xs font-black' : 'text-brand-muted hover:text-brand-text'}`}
                    >
                      {t('split.filterAll', { count: selectedGoal.history?.length || 0 })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('deposit')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'deposit' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                    >
                      <IconDot className="w-2 h-2 text-emerald-500 inline-block" /> {t('split.filterDeposit', { count: selectedGoal.history?.filter(h => h.type === 'deposit').length || 0 })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('withdraw')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'withdraw' ? 'bg-rose-600 text-white shadow-xs font-black' : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}
                    >
                      <IconDot className="w-2 h-2 text-rose-500 inline-block" /> {t('split.filterWithdraw', { count: selectedGoal.history?.filter(h => h.type === 'withdraw').length || 0 })}
                    </button>
                  </div>
                </div>

                {/* History Items List */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 no-scrollbar">
                  {(() => {
                    const filtered = (selectedGoal.history || []).filter(item => {
                      if (historyFilter === 'deposit' && item.type !== 'deposit') return false;
                      if (historyFilter === 'withdraw' && item.type !== 'withdraw') return false;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-6 text-center bg-brand-faint/50 dark:bg-neutral-800/40 rounded-2xl border border-dashed border-brand-border/40">
                          <Mascot mood="happy" size={40} className="mx-auto mb-1.5 opacity-80" />
                          <p className="text-xs font-bold text-brand-text dark:text-neutral-300">{t('split.noHistoryInCategory')}</p>
                          <p className="text-[10px] text-brand-muted mt-0.5">
                            {t('split.noHistoryHintPrefix')} <span className="text-emerald-600 font-bold">{t('split.depositMore')}</span> {t('split.noHistoryHintOr')} <span className="text-rose-600 font-bold">{t('split.withdrawMoney')}</span> {t('split.noHistoryHintSuffix')}
                          </p>
                        </div>
                      );
                    }

                    return filtered.map((tx) => {
                      const isDeposit = tx.type === 'deposit';
                      const formattedDate = new Date(tx.date).toLocaleDateString(dateLocale(), {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });

                      return (
                        <div
                          key={tx.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs transition-all ${
                            isDeposit 
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-900/30' 
                              : 'bg-rose-50/40 dark:bg-rose-950/10 border-rose-200/50 dark:border-rose-900/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                              isDeposit 
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' 
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                            }`}>
                              {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-brand-text dark:text-white truncate leading-tight">
                                {tx.reason || (isDeposit ? t('split.depositEntryFallback') : t('split.withdrawEntryFallback'))}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-muted flex-wrap">
                                <span className="font-medium">{formattedDate}</span>
                                {tx.note && <span className="truncate">({tx.note})</span>}
                                {tx.relatedGoalId && (
                                  <span className="flex items-center gap-0.5 font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.2 rounded-md">
                                    <RefreshCcw className="w-2.5 h-2.5" />
                                    {isDeposit ? t('split.fromGoal') : t('split.toGoal')} {tx.relatedGoalName || '—'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-mono font-extrabold ${
                              isDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {isDeposit ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>

                            {onDeleteGoalTransaction && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerConfirm(
                                    t('split.deleteHistoryConfirmTitle'),
                                    t('split.deleteHistoryConfirmMsg', { reason: tx.reason, amount: formatCurrency(tx.amount) }),
                                    () => {
                                      onDeleteGoalTransaction(selectedGoal.id, tx.id, true);
                                    }
                                  );
                                }}
                                className="p-1 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                                title={t('split.deleteHistoryEntryTooltip')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Delete Goal Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerConfirm(
                      t('split.deleteGoalConfirmTitle'),
                      t('split.deleteGoalConfirmMsg', { name: selectedGoal.name }),
                      () => {
                        onDeleteGoal(selectedGoal.id);
                        setSelectedGoal(null);
                      }
                    );
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-none"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t('split.deleteThisGoalBtn')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Modal (Deposit / Withdraw with Reasons) */}
      <AnimatePresence>
        {isTxModalOpen && txGoal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 relative"
            >
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${
                  txType === 'deposit' 
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' 
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                }`}>
                  {txType === 'deposit' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                    {txType === 'deposit' ? t('split.depositMoreTitle') : t('split.withdrawMoneyTitle')}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    {t('split.goalColon')} <span className="font-bold text-brand-text dark:text-white">{txGoal.emoji} {txGoal.name}</span>
                  </p>
                </div>
              </div>

              <form onSubmit={handleTxSubmit} className="space-y-4 pt-1">
                {/* Transaction type switcher inside modal */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-brand-faint dark:bg-stone-800 rounded-2xl text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setTxType('deposit')}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'deposit' 
                        ? 'bg-emerald-600 text-white shadow-xs' 
                        : 'text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" /> {t('split.transferIn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('withdraw')}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'withdraw' 
                        ? 'bg-rose-600 text-white shadow-xs' 
                        : 'text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" /> {t('split.withdrawOut')}
                  </button>
                </div>

                {/* Amount input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                      {t('split.amountBahtRequired')} <span className="text-rose-500">*</span>
                    </label>
                    {txType === 'withdraw' && txGoal.current > 0 && (
                      <button
                        type="button"
                        onClick={() => setTxAmount(String(txGoal.current))}
                        className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        {t('split.withdrawAllPct', { amount: formatCurrency(txGoal.current) })}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <NumberInput
                      required
                      value={txAmount}
                      onChange={setTxAmount}
                      placeholder={t('split.amountPlaceholder')}
                      className="w-full pl-9 pr-4 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-sm font-mono font-extrabold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute left-3 top-2.5 text-brand-muted font-bold text-xs">฿</span>
                  </div>
                </div>

                {/* Deduct-from-cash toggle -- only relevant for deposits. Lets money go into a
                    goal before it's technically "net profit" yet, but still marks it as spent
                    out of tracked income so cash-on-hand totals elsewhere reflect it. */}
                {txType === 'deposit' && (
                  <label className="flex items-start gap-2.5 p-3 bg-brand-faint/60 dark:bg-stone-800/60 border border-brand-border/60 dark:border-neutral-700 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={txDeductFromCash}
                      onChange={(e) => setTxDeductFromCash(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-brand-text dark:text-neutral-200 block">
                        {t('split.deductFromIncomeLabel')}
                      </span>
                      <p className="text-[10px] text-brand-muted leading-relaxed">
{t('split.deductFromIncomeDesc')}
                      </p>
                    </div>
                  </label>
                )}

                {/* Date input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.transactionDateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Reason / Details input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.reasonNoteLabel')}
                  </label>
                  <input
                    type="text"
                    value={txReason}
                    onChange={(e) => setTxReason(e.target.value)}
                    placeholder={txType === 'deposit' ? t('split.reasonPlaceholderDeposit') : t('split.reasonPlaceholderWithdraw')}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />

                  {/* Reason Quick Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(txType === 'deposit'
                      ? [
                          { icon: IconCoin, label: t('split.chipMonthlyDeposit') },
                          { icon: IconGift, label: t('split.chipSponsorIncome') },
                          { icon: IconGem, label: t('split.chipBonusTip') },
                          { icon: IconBolt, label: t('split.chipAllocateProfit') },
                        ]
                      : [
                          { icon: IconCamera, label: t('split.chipEquipment') },
                          { icon: IconTool, label: t('split.chipMaintenance') },
                          { icon: IconAlertDot, label: t('split.chipEmergency') },
                          { icon: IconGraduation, label: t('split.chipTuition') },
                          { icon: IconLoop, label: t('split.chipTransferAccount') },
                        ]
                    ).map(({ icon: PresetIcon, label }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setTxReason(label)}
                        className="px-2.5 py-1 bg-brand-faint hover:bg-brand-border/30 dark:bg-stone-800 text-[10px] font-bold text-brand-text dark:text-neutral-200 rounded-lg border border-brand-border/40 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <PresetIcon className="w-3 h-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTxModalOpen(false)}
                    className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-brand-text dark:text-neutral-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {t('split.cancel')}
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-2.5 font-extrabold text-xs text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {txType === 'deposit' ? <IconCoin className="w-3.5 h-3.5" /> : <IconCoinOut className="w-3.5 h-3.5" />}
                    {txType === 'deposit' ? t('split.confirmDepositBtn') : t('split.confirmWithdrawBtn')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Modal (Move money from one goal to another) */}
      <AnimatePresence>
        {isTransferModalOpen && transferFromGoal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 relative"
            >
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <RefreshCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                    {t('split.transferBetweenGoalsTitle')}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    {t('split.sourceColon')} <span className="font-bold text-brand-text dark:text-white">{transferFromGoal.emoji} {transferFromGoal.name}</span>
                  </p>
                </div>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-4 pt-1">
                {/* Destination goal select */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.transferToLabel')} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={transferToGoalId}
                    onChange={(e) => setTransferToGoalId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {goals.filter(g => g.id !== transferFromGoal.id).map(g => (
                      <option key={g.id} value={g.id}>
                        {t('split.transferOptionLine', { emoji: g.emoji, name: g.name, current: formatCurrency(g.current), target: formatCurrency(g.target) })}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.amountBahtRequired')} <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <NumberInput
                      required
                      value={transferAmount}
                      onChange={setTransferAmount}
                      placeholder={t('split.amountPlaceholder')}
                      className="w-full pl-9 pr-4 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-sm font-mono font-extrabold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute left-3 top-2.5 text-brand-muted font-bold text-xs">฿</span>
                  </div>
                  <p className="text-[10px] text-brand-muted">
                    {t('split.sourceBalanceLine', { amount: formatCurrency(transferFromGoal.current) })}
                  </p>
                </div>

                {/* Date input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.transactionDateLabel')}
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Reason / Details input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    {t('split.reasonOptionalLabel')}
                  </label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder={t('split.transferReasonPlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-brand-text dark:text-neutral-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    {t('split.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 font-extrabold text-xs text-white rounded-xl shadow-sm transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-1.5"
                  >
                    <IconLoop className="w-3.5 h-3.5" /> {t('split.confirmTransferBtn')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

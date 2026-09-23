import { privateCache } from '../services/privateCache';
import { validateChanges, notificationPreferences } from '../../../shared/validation';
import React, { useState, useEffect, useRef, lazy, Suspense, startTransition } from 'react';
import { Job, Goal, AppSettings, StatusOption, CustomDialogState, NotifSettings, Expense, GoalTransaction } from '../../../shared/types';
import { defaultSettings, defaultJobs, defaultGoals, buildSampleData } from '../sampleData';
import { getMonthKey, formatMonthKey, DEFAULT_JOB_TYPES, dateLocale } from '../utils';

const loadDashboardTab = () => import('../features/dashboard/DashboardTab');
const loadJobsTab = () => import('../features/jobs/JobsTab');
const loadExpenseRecordView = () => import('../features/expenses/ExpenseRecordView');
const loadTimelineTab = () => import('../features/reports/TimelineTab');
const loadSplitTab = () => import('../features/goals/SplitTab');
const loadSummaryTab = () => import('../features/reports/SummaryTab');
const loadMonthlyReportTab = () => import('../features/reports/MonthlyReportTab');
const loadTaxTab = () => import('../features/tax/TaxTab');
const loadSettingsTab = () => import('../features/settings/SettingsTab').then(module => ({ default: module.SettingsTab }));
const loadInvoiceTab = () => import('../features/invoices/InvoiceTab').then(module => ({ default: module.InvoiceTab }));
const loadInsightTab = () => import('../features/reports/InsightTab').then(module => ({ default: module.InsightTab }));
const loadPlansTab = () => import('../features/billing/PlansTab').then(module => ({ default: module.PlansTab }));
const loadGroupsTab = () => import('../features/groups/GroupsTab');
const JobsTab = lazy(loadJobsTab);
const DashboardTab = lazy(loadDashboardTab);
const ExpenseRecordView = lazy(loadExpenseRecordView);
const TimelineTab = lazy(loadTimelineTab);
const SplitTab = lazy(loadSplitTab);
const SummaryTab = lazy(loadSummaryTab);
import CustomDialog from '../components/ui/CustomDialog';
import Login from '../features/auth/Login';
const MonthlyReportTab = lazy(loadMonthlyReportTab);
const TaxTab = lazy(loadTaxTab);
const SettingsTab = lazy(loadSettingsTab);
const InvoiceTab = lazy(loadInvoiceTab);
const InsightTab = lazy(loadInsightTab);
const PlansTab = lazy(loadPlansTab);
const GroupsTab = lazy(loadGroupsTab);
import FinanceWorkspacePicker from '../features/groups/FinanceWorkspacePicker';
import { financeKey, setFinanceWorkspace, assertFinanceWorkspace } from '../services/financeWorkspace';
import { authClient } from '../services/auth';
import { apiFetch, apiJson } from '../services/api';
import { readCloud, saveCloud, saveAppCloud, clearCloud, exportCloud, flushCloud } from '../services/cloud';
import { useLanguage } from '../i18n/LanguageContext';
// Aliased: this file already has its own local `currentMonthKey` (a memoized string further
// down, computed from local machine time) -- importing the same name here would silently shadow
// it, and calling the shadowed string as a function is exactly the "Je is not a function" bug
// that made the LINE-notify balance figure fail (found via a decoded production sourcemap).
import { computeMonthlySummary, currentMonthKey as getCurrentMonthKeyBkk, nowInBangkok } from '../../../shared/monthlySummary';
import { Mascot } from '../components/mascot/Mascot';
import { MascotToast } from '../components/mascot/MascotToast';
const ProfileSetupWizard = lazy(() => import('../features/onboarding/ProfileSetupWizard').then(module => ({ default: module.ProfileSetupWizard })));
import { normalizeProfileSetupSettings, shouldShowProfileSetup } from '../features/onboarding/profileSetupState';
import { PremiumUpsell } from '../features/billing/PremiumUpsell';
const ProPromoModal = lazy(() => import('../features/billing/ProPromoModal').then(module => ({ default: module.ProPromoModal })));
import { fireMascot } from '../mascotBus';
import { leafBus } from '../leafBus';
import { IconCrown, IconPalette } from '../components/ui/icons';

import { 
  Home, 
  Settings,
  Briefcase, 
  Calendar, 
  Percent, 
  Target,
  Sun,
  Moon,
  Wallet,
  LogOut,
  User,
  Users,
  TrendingUp,
  Menu,
  X,
  Download,
  Cloud,
  Calculator,
  Database,
  Terminal,
  Check,
  Copy,
  ShieldAlert,
  Leaf,
  FileText,
  Smartphone,
  ChevronDown,
  Wrench,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TabKey = 'dashboard' | 'jobs' | 'tax' | 'summary' | 'timeline' | 'split' | 'report' | 'settings' | 'invoice' | 'insight' | 'plans' | 'groups';

// Fetch a feature's code before navigation when the user shows intent to open it. Dynamic
// imports are cached by the browser, so React.lazy reuses the same download on selection.
const FEATURE_LOADERS: Partial<Record<TabKey, () => Promise<unknown>>> = {
  jobs: loadJobsTab,
  timeline: loadTimelineTab,
  groups: loadGroupsTab,
  summary: loadSummaryTab,
  split: loadSplitTab,
  report: loadMonthlyReportTab,
  insight: loadInsightTab,
  tax: loadTaxTab,
  invoice: loadInvoiceTab,
  plans: loadPlansTab,
  settings: loadSettingsTab,
};
const prefetchFeature = (tab: TabKey) => { void FEATURE_LOADERS[tab]?.().catch(() => {}); };

// Core items stay visible at all times; "more" items are grouped under a
// collapsible section so first-time users see a simpler menu by default.
// This is the freelance-persona grouping -- also the fallback when no persona is set
// (existing accounts, or the setup wizard's persona step was skipped).
// label is a translation key (resolved via t() at render time), not display text -- this array
// is a module-level constant built once at load, before any component (and its language context)
// exists, so it can't call t() itself.
const NAV_ITEMS: { key: TabKey; labelKey: string; icon: React.ComponentType<{ className?: string }>; group: 'core' | 'more' | 'bottom' }[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: Home, group: 'core' },
  { key: 'jobs', labelKey: 'nav.jobs', icon: Briefcase, group: 'core' },
  { key: 'timeline', labelKey: 'nav.timeline', icon: Calendar, group: 'core' },
  { key: 'groups', labelKey: 'nav.groups', icon: Users, group: 'core' },
  { key: 'summary', labelKey: 'nav.summary', icon: Wallet, group: 'more' },
  { key: 'split', labelKey: 'nav.split', icon: Percent, group: 'more' },
  { key: 'report', labelKey: 'nav.report', icon: TrendingUp, group: 'more' },
  { key: 'insight', labelKey: 'nav.insight', icon: BarChart3, group: 'more' },
  { key: 'tax', labelKey: 'nav.tax', icon: Calculator, group: 'more' },
  { key: 'invoice', labelKey: 'nav.invoice', icon: FileText, group: 'more' },
  { key: 'plans', labelKey: 'nav.plans', icon: IconCrown, group: 'bottom' },
  { key: 'settings', labelKey: 'nav.settings', icon: Settings, group: 'bottom' },
];

// Every feature stays reachable regardless of persona -- these lists only decide which
// tabs default to the always-visible "core" row vs the collapsible "more" section.
// dashboard/jobs/settings/plans aren't listed because they're always core/bottom
// (handled separately below) for every persona.
const PERSONA_CORE_KEYS: Record<'school' | 'university' | 'employee', TabKey[]> = {
  school: ['split'],
  university: ['split', 'summary'],
  employee: ['split', 'summary'],
};

const cleanStatuses = (arr: any[]): StatusOption[] => {
  if (!Array.isArray(arr)) return [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
  ];

  let cleaned = arr.map(s => {
    let label = (s.label || '').trim();
    const compacted = label.replace(/\s+/g, '');
    if (
      compacted === 'ยังไม่จ่ายเลย' || 
      compacted === 'ยังไม่จ่ายเงินเลย' || 
      compacted === 'ยังไม่จ่ายเงิน' || 
      compacted === 'ยังไม่ไม่จ่าย' ||
      compacted === 'ยังไม่จ่าย'
    ) {
      label = 'ยังไม่จ่าย';
    }
    return {
      id: s.id,
      label: label,
      behavior: s.behavior || 'pending'
    };
  });

  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();
  return cleaned.filter(s => {
    if (!s.id || !s.label) return false;
    const key = s.label.toLowerCase().trim().replace(/\s+/g, '');
    if (seenIds.has(s.id) || seenLabels.has(key)) {
      return false;
    }
    seenIds.add(s.id);
    seenLabels.add(key);
    return true;
  });
};

const cleanJobType = (t: any): string => {
  return String(t || '')
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|📢|🎬|📦|💡|💼/g, "")
    .trim();
};

const cleanJobTypes = (arr: any[]): string[] => {
  if (!Array.isArray(arr)) return DEFAULT_JOB_TYPES;

  return Array.from(new Set(arr.map(cleanJobType))).filter(Boolean);
};

const cleanJobs = (arr: any[]): Job[] => {
  if (!Array.isArray(arr)) return [];
  return arr.map(j => ({
    ...j,
    type: cleanJobType(j.type) || 'ยังไม่ระบุ'
  }));
};

// A delete needs to survive not just this session's in-memory deletedJobIdsRef/deletedExpenseIdsRef
// guard (which only protects saveCloudData's own merge step) but also a *reload*: loadCloudData
// blindly trusts whatever the server currently has, and every edit -- including a delete -- has to
// round-trip a SELECT, then an UPSERT of the *entire* jobs/expenses array, then an RPC call before
// it actually lands, since this app stores them as one JSON blob per user rather than real rows.
// That's easily a few hundred ms, plenty of time to hit reload right after confirming a delete and
// have it pull the "deleted" record right back in from the still-stale server copy (a real report:
// deleting 6 WIP jobs then reloading brought all 6 back). A short-lived list of just-deleted ids in
// localStorage survives a full page reload (unlike a React ref), so both loadCloudData and this
// device's own next save-merge can filter the stale record out regardless of how fast the reload was.
const RECENTLY_DELETED_TTL_MS = 10 * 60 * 1000; // far more than any realistic reload delay

// Returns the raw {id, ts} entries, ts preserved from when each was actually deleted -- callers
// that only need membership should use readRecentlyDeletedIds below instead of re-deriving this.
const readRecentlyDeletedEntries = (storageKey: string): { id: string; ts: number }[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const fresh = parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.ts === 'number' && now - entry.ts < RECENTLY_DELETED_TTL_MS);
    // Piggyback the read with cleanup so this doesn't grow forever on an account that deletes often.
    if (fresh.length !== parsed.length) {
      localStorage.setItem(storageKey, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return [];
  }
};

const readRecentlyDeletedIds = (storageKey: string): Set<string> => {
  return new Set(readRecentlyDeletedEntries(storageKey).map((entry) => entry.id));
};

const markRecentlyDeleted = (storageKey: string, id: string) => {
  try {
    const entries = readRecentlyDeletedEntries(storageKey);
    entries.push({ id, ts: Date.now() });
    localStorage.setItem(storageKey, JSON.stringify(entries.slice(-200)));
  } catch {
    // localStorage can throw (private mode, quota) -- the in-memory ref guard still covers this
    // session, it's only the cross-reload protection that's lost.
  }
};

export default function App() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);

  const navigateTab = (tab: TabKey) => {
    prefetchFeature(tab);
    startTransition(() => setActiveTab(tab));
  };

  const renderNavButton = (item: typeof NAV_ITEMS[number], closeMobileOnClick: boolean) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        aria-current={activeTab === item.key ? 'page' : undefined}
        onPointerEnter={() => prefetchFeature(item.key)}
        onFocus={() => prefetchFeature(item.key)}
        onTouchStart={() => prefetchFeature(item.key)}
        onClick={() => {
          navigateTab(item.key);
          if (closeMobileOnClick) setIsMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-bold transition-all cursor-pointer ${
          activeTab === item.key
            ? 'bg-blue-acc/10 text-[#E65F2B] dark:text-[#FFA473] font-black border-l-4 border-[#E65F2B]'
            : 'text-brand-muted hover:bg-brand-faint/60 dark:hover:bg-neutral-800/60 hover:text-brand-text'
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
        <span>{t(item.labelKey)}</span>
      </button>
    );
  };

  const renderMoreToggle = () => (
    <button
      type="button"
      onClick={() => setMoreNavOpen(open => !open)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-[13px] font-bold text-brand-muted hover:bg-brand-faint/60 dark:hover:bg-neutral-800/60 hover:text-brand-text transition-all cursor-pointer"
    >
      <span className="flex items-center gap-3">
        <Wrench className="w-4.5 h-4.5" />
        <span>{t('nav.moreTools')}</span>
      </span>
      <ChevronDown className={`w-4 h-4 transition-transform ${showMoreNavItems ? 'rotate-180' : ''}`} />
    </button>
  );

  const [isSetupWizardPreview, setIsSetupWizardPreview] = useState(false);

  // Authentication State
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [financeSelection, setFinanceSelection] = useState<{account:string;groupId?:string;name?:string}>({account:''});
  const [switchingFinance, setSwitchingFinance] = useState(false);
  const financeGroupId = financeSelection.account === session?.user?.id ? financeSelection.groupId : undefined;
  const financeOwner = session?.user?.id ? financeKey(session.user.id, financeGroupId) : '';
  const financeOwnerRef = useRef(financeOwner);
  financeOwnerRef.current = financeOwner;
  setFinanceWorkspace(financeOwner || undefined);
  const loadedWorkspaceRef = useRef('');
  const loadRequestRef = useRef(0);
  const financeConflictRef = useRef(false);
  const [loadedFinanceOwner,setLoadedFinanceOwner]=useState('');
  const switchingFinanceRef=useRef(false);

  useEffect(() => {
    if (!session?.user?.id || (!session.isGuest && loadedFinanceOwner !== financeOwner)) return;
    // Warm only the primary routes after the account is usable. Loading every feature at once
    // competes with the first dashboard render, especially on slower phones.
    const timer = window.setTimeout(() => {
      for (const tab of ['jobs', 'timeline', 'groups'] as const) {
        prefetchFeature(tab);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [session?.user?.id, session?.isGuest, loadedFinanceOwner, financeOwner]);

  useEffect(() => {
    if (session?.user?.id) void loadDashboardTab().catch(() => {});
  }, [session?.user?.id]);

  // Dark Mode reactive state & local storage synchronization
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('cashflow_dark_mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('cashflow_dark_mode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auto-switch to dark mode ("โหมดตอนเย็น") in the evening and back to light in the morning,
  // Bangkok time. Boundaries are 12-hour blocks starting 06:00 (light) / 18:00 (dark), tracked as
  // a period id so a manual toggle mid-period is respected until the next boundary is crossed.
  useEffect(() => {
    const getAutoThemePeriod = () => {
      const bkkMs = nowInBangkok().getTime();
      const sixAmEpochMs = Date.UTC(1970, 0, 1, 6, 0, 0, 0);
      const periodId = Math.floor((bkkMs - sixAmEpochMs) / (12 * 60 * 60 * 1000));
      return { isDark: periodId % 2 !== 0, periodId };
    };
    const applyAutoThemeIfNeeded = () => {
      const { isDark, periodId } = getAutoThemePeriod();
      const lastAppliedRaw = localStorage.getItem('cashflow_theme_auto_period');
      const lastApplied = lastAppliedRaw !== null ? Number(lastAppliedRaw) : null;
      if (lastApplied !== periodId) {
        localStorage.setItem('cashflow_theme_auto_period', String(periodId));
        setDarkMode(isDark);
      }
    };
    applyAutoThemeIfNeeded();
    const interval = setInterval(applyAutoThemeIfNeeded, 60 * 1000);
    document.addEventListener('visibilitychange', applyAutoThemeIfNeeded);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', applyAutoThemeIfNeeded);
    };
  }, []);

  // Auth session listener
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await authClient.auth.getSession();
        if (session) {
          localStorage.removeItem('cashflow_guest_session');
          setSession(session);
        } else {
          const sg = localStorage.getItem('cashflow_guest_session');
          if (sg) {
            setSession(JSON.parse(sg));
          } else {
            setSession(null);
          }
        }
      } catch (e) {
        console.error(e);
        const sg = localStorage.getItem('cashflow_guest_session');
        if (sg) setSession(JSON.parse(sg));
      } finally {
        setLoadingSession(false);
      }
    };

    checkSession();
    const recheck = () => { if(document.visibilityState==='visible')void authClient.auth.getSession(); };
    window.addEventListener('focus',recheck);document.addEventListener('visibilitychange',recheck);
    const sessionTimer=window.setInterval(recheck,60000);

    const { data: { subscription } } = authClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        setSession(session);
        localStorage.removeItem('cashflow_guest_session');
      } else {
        const sg = localStorage.getItem('cashflow_guest_session');
        if (sg) {
          setSession(JSON.parse(sg));
        } else {
          setSession(null);
        }
      }
      setLoadingSession(false);
    });

    return () => { subscription.unsubscribe();window.removeEventListener('focus',recheck);document.removeEventListener('visibilitychange',recheck);window.clearInterval(sessionTimer); };
  }, []);

  const handleGuestLogin = (guestEmail: string) => {
    const guestSessionObj = {
      user: {
        email: guestEmail,
        id: 'guest-' + Date.now()
      },
      isGuest: true
    };
    localStorage.setItem('cashflow_guest_session', JSON.stringify(guestSessionObj));
    setSession(guestSessionObj);
  };

  const handleSignOut = async () => {
    if (!session?.isGuest) {
      const result = await authClient.auth.signOut();
      if (result.error) { triggerAlert('ออกจากระบบไม่สำเร็จ', result.error.message); return; }
    }
    clearCloud(); privateCache.clear(); cloudReadyRef.current = null;
    const ownerEmail = session?.user?.email;
    for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.startsWith('cashflow_') && (key.includes(ownerEmail || 'never-match') || key.includes(session?.user?.id || 'never-match'))) storage.removeItem(key);
    localStorage.removeItem('cashflow_guest_session');
    setSession(null);
  };

  // Private report links resume after login with a real account.
  useEffect(() => {
    if(!session?.user?.id || session.isGuest)return;
    const params=new URLSearchParams(window.location.search);
    const month=params.get('report');if(!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
    const download=new URLSearchParams({month});const account=params.get('account');
    if(account)download.set('account',account);
    params.delete('report');params.delete('account');
    window.history.replaceState(null,'',`${window.location.pathname}${params.size?'?'+params:''}`);
    window.location.assign(`/api/download-report?${download}`);
  },[session]);

  // Load working state from defaults, then the authenticated cloud snapshot.
  const [jobs, setJobs] = useState<Job[]>(cleanJobs(defaultJobs));

  const [goals, setGoals] = useState<Goal[]>(defaultGoals);

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  // Persona-adjusted nav grouping -- everything stays reachable, this just decides what
  // shows up in the always-visible row by default (see PERSONA_CORE_KEYS above).
  const navItems = React.useMemo(() => {
    const persona = settings.userPersona;
    if (!persona || persona === 'freelance') return NAV_ITEMS;
    const coreKeys = PERSONA_CORE_KEYS[persona];
    return NAV_ITEMS.map(item =>
      item.group === 'bottom' || item.key === 'dashboard' || item.key === 'jobs' || item.key === 'groups'
        ? item
        : { ...item, group: coreKeys.includes(item.key) ? 'core' as const : 'more' as const }
    );
  }, [settings.userPersona]);
  const isMoreTabActive = navItems.some(item => item.group === 'more' && item.key === activeTab);
  const showMoreNavItems = moreNavOpen || isMoreTabActive;

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(() => {
    return {
      enabled: true,
      alertEmail: '',
      serviceType: 'mailto',
      emailjsServiceId: '',
      emailjsTemplateId: '',
      emailjsPublicKey: '',
      pendingQueue: []
    };
  });

  // Dynamic list of custom statuses
  const [statuses, setStatuses] = useState<StatusOption[]>(() => {
    return [
      { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
      { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
      { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
    ];
  });

  // Dynamic list of custom job types
  const [jobTypes, setJobTypes] = useState<string[]>(() => {
    return DEFAULT_JOB_TYPES;
  });

  // Dynamic list of expenses
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // User profile avatar image (base64 data URL). Synced to a per-user document in
  // Supabase so it follows the account across devices; the working copy remains only in React memory.
  const [userAvatar, setUserAvatar] = useState<string>('');

  const handleUpdateUserAvatar = (newAvatar: string) => {
    if(financeGroupId){triggerAlert('รูปบัญชีส่วนตัว','เลือกบัญชีการเงินส่วนตัวก่อนเปลี่ยนรูปบัญชี');return;}
    setUserAvatar(newAvatar);
    const email = session?.user?.email;
    if (!email) return;
    const currentUser = session?.user;
    if (currentUser && !session?.isGuest) {
      saveCloud(currentUser.id, { avatar_data_url: newAvatar || null }).catch(error => triggerAlert('บันทึกรูปไม่สำเร็จ', error.message));
    }
  };

  // Track loaded state for the current logged-in user email
  const [isLoadedForUser, setIsLoadedForUser] = useState<string | null>(null);

  // Cloud Sync states
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'pending' | 'failed' | 'not_setup'>('not_setup');
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);

  // Jobs/expenses this tab has explicitly deleted this session -- see saveCloudData's merge step
  // for why: a job/expense added from another channel (LINE chat-add, the LIFF form) while this
  // tab is open wouldn't be in its in-memory `jobs`/`expenses`, so a blind overwrite on the next
  // autosave would silently erase it. The merge step re-adds anything present server-side but
  // missing locally -- except ids in these sets, which really were deleted on purpose.
  const deletedJobIdsRef = useRef<Set<string>>(new Set());
  const deletedExpenseIdsRef = useRef<Set<string>>(new Set());
  // Guards saveCloudData against overlapping calls -- see its own comment for why that matters.
  const cloudSaveInFlightRef = useRef(false);
  const cloudSavePendingRef = useRef<{ email: string; payload: any } | null>(null);
  const [isProPromoOpen, setIsProPromoOpen] = useState(false);
  const [lastCloudError, setLastCloudError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null>(null);

  // First 14 days after signup are free automatically, based on the account's real creation
  // date from Supabase Auth (not something the client can fake). No Stripe interaction needed.
  const FREE_TRIAL_DAYS = 14;
  const trialEndsAt = React.useMemo(() => {
    const createdAt = session?.user?.created_at;
    if (!createdAt || session?.isGuest) return null;
    return new Date(new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }, [session?.user?.created_at, session?.isGuest]);
  const isInFreeTrial = !!trialEndsAt && trialEndsAt.getTime() > Date.now();

  // Paid access: an 'active' one-time payment that hasn't expired yet (renewed monthly by hand)
  const isPaidActive =
    subscription?.status === 'active' &&
    !!subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd).getTime() > Date.now();

  const isPro = isInFreeTrial || isPaidActive;

  // 🌰 Global Month Exploration (สำรวจฤดูกาลเก็บเกี่ยว)
  const currentMonthKey = React.useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);

  const availableMonthKeys = React.useMemo(() => {
    const keys = new Set<string>();
    const today = new Date();
    for (let i = -12; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      keys.add(`${y}-${m}`);
    }
    jobs.forEach(j => {
      const dateKey = j.payDate || j.postDate;
      if (dateKey) {
        keys.add(getMonthKey(dateKey));
      }
    });
    return Array.from(keys).sort();
  }, [jobs]);

  useEffect(() => {
    if (!availableMonthKeys.includes(selectedMonthKey)) {
      setSelectedMonthKey(currentMonthKey);
    }
  }, [availableMonthKeys, selectedMonthKey, currentMonthKey]);

  // Format generic error helper
  const formatError = (err: any): string => {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    return err.message || JSON.stringify(err);
  };

  const loadSubscriptionData = async (userId: string) => {
    try {
      const result = await apiJson<any>('/api/data', { headers: { 'X-Account-ID': userId } });
      if (sessionRef.current?.user?.id !== userId) return;
      const data = result.subscription;

      if (data) {
        setSubscription({
          status: data.status || 'free',
          plan: data.plan || null,
          currentPeriodEnd: data.current_period_end || null
        });
      } else {
        setSubscription({ status: 'free', plan: null, currentPeriodEnd: null });
      }
    } catch (err) {
      console.log('Catch subscription load error, defaulting to free:', err);
      setSubscription({ status: 'free', plan: null, currentPeriodEnd: null });
    }
  };

  // Stripe Payment Link for the Pro plan -- one-time ฿149 THB price (not a Stripe subscription),
  // matching how stripe-webhook.ts actually grants access (checkout.session.completed with
  // mode==='payment', extending current_period_end by 30 days). Card + PromptPay both enabled on
  // this link. Appending client_reference_id lets the webhook know which app user just paid,
  // without needing a server-created Checkout Session.
  const PRO_PAYMENT_LINK = import.meta.env.VITE_PRO_PAYMENT_URL as string | undefined;

  // The webhook extends access by setting current_period_end to (now + 30 days) rather than
  // adding onto the existing period, since this is a manual monthly payment, not an auto-charging
  // Stripe subscription. Paying again while still well within an active period would therefore
  // just discard the remaining paid days instead of stacking them -- so only let people through to
  // pay once they're close to (or past) their current expiry date.
  const RENEWAL_GRACE_DAYS = 3;

  const handleUpgrade = () => {
    const currentUser = session?.user;
    if (!currentUser || session?.isGuest) {
      triggerAlert('ต้องสมัครสมาชิกก่อนครับ', 'กรุณาสมัครบัญชีจริงด้วยอีเมล (ไม่ใช่โหมดทดลองใช้งานฟรี) ก่อนอัปเกรดเป็นสมาชิกรายเดือนครับ');
      return;
    }

    if (isPaidActive && subscription?.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysRemaining > RENEWAL_GRACE_DAYS) {
        triggerAlert(
          'ยังไม่ต้องต่ออายุตอนนี้ครับ',
          `แพ็กเกจ Pro ของคุณยังใช้งานได้ถึงวันที่ ${periodEnd.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} (เหลืออีก ${daysRemaining} วัน) เนื่องจากระบบต่ออายุแบบจ่ายเองรายเดือน การจ่ายซ้ำตอนนี้จะทำให้วันที่เหลืออยู่หายไปฟรีๆ ระบบจะเปิดให้ต่ออายุอีกครั้งเมื่อใกล้ครบกำหนด (ประมาณ ${RENEWAL_GRACE_DAYS} วันก่อนหมดอายุ) หรือหลังจากหมดอายุแล้วครับ`
        );
        return;
      }
    }

    if (!PRO_PAYMENT_LINK || !PRO_PAYMENT_LINK.startsWith('https://buy.stripe.com/')) { triggerAlert('ยังไม่พร้อมรับชำระเงิน', 'กรุณาติดต่อผู้ดูแลระบบ'); return; }
    const url = new URL(PRO_PAYMENT_LINK);
    url.searchParams.set('client_reference_id', currentUser.id);
    if (currentUser.email) url.searchParams.set('prefilled_email', currentUser.email);
    window.location.href = url.toString();
  };

  // Handle redirect back from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    if (checkoutResult && session?.user?.id) {
      if (checkoutResult === 'success') {
        loadSubscriptionData(session.user.id);
        triggerAlert('สมัครสมาชิกสำเร็จ!', 'ขอบคุณที่สนับสนุนกระรอกตุนเงินนะครับ!');
      }
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, financeOwner]);

  // Domain state stays in the UI; persistence is handled by the cloud service.
  const cloudReadyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const loadCloudData = async (_email: string) => {
    const user = sessionRef.current?.user;
    if (!user || sessionRef.current?.isGuest) return false;
    const owner=financeOwnerRef.current;
    const request=++loadRequestRef.current;
    cloudReadyRef.current = null;
    setCloudSyncStatus('pending');
    try {
      const result = await readCloud(owner);
      if (sessionRef.current?.user?.id !== user.id || financeOwnerRef.current!==owner || request!==loadRequestRef.current) return false;
      const data = result.snapshot;
      setJobs(cleanJobs(data.jobs || [])); setGoals(data.goals || []); setExpenses(data.expenses || []);
      const loadedSettings = data.settings || defaultSettings;
      setSettings(financeGroupId
        ? { ...loadedSettings, profileSetupCompleted: true }
        : normalizeProfileSetupSettings(loadedSettings, user.created_at));
      setStatuses(data.statuses ? cleanStatuses(data.statuses) : [{id:'done',label:'จ่ายเงินครบแล้ว',behavior:'done'},{id:'partial',label:'มัดจำแล้ว',behavior:'partial'},{id:'pending',label:'ยังไม่จ่าย',behavior:'pending'}]);
      setJobTypes(data.job_types ? cleanJobTypes(data.job_types) : DEFAULT_JOB_TYPES);
      setNotifSettings({ enabled: true, alertEmail: user.email || '', serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], ...data.notif_settings });
      if(!financeGroupId)setUserAvatar(data.avatar_data_url || '');
      const sub = result.subscription;
      setSubscription({ status: sub?.status || 'free', plan: sub?.plan || null, currentPeriodEnd: sub?.current_period_end || null });
      cloudReadyRef.current = owner;
      financeConflictRef.current=false;setLoadedFinanceOwner(owner);
      setLastCloudError(null); setCloudSyncStatus('synced'); return true;
    } catch (error: any) {
      if (sessionRef.current?.user?.id === user.id && financeOwnerRef.current===owner && request===loadRequestRef.current) { setLastCloudError(formatError(error)); setCloudSyncStatus('failed'); }
      return false;
    }
  };
  const saveCloudData = async (email: string, payload: any) => {
    const user = sessionRef.current?.user;
    const owner=financeOwner;
    if (!user || sessionRef.current?.isGuest || user.email !== email || financeOwnerRef.current!==owner || cloudReadyRef.current !== owner) return;
    try {
      await saveAppCloud(owner, payload);
      if (sessionRef.current?.user?.id === user.id && financeOwnerRef.current===owner) { setLastCloudError(null); setCloudSyncStatus('synced'); }
    } catch (error: any) {
      if (sessionRef.current?.user?.id !== user.id || financeOwnerRef.current!==owner) return;
      if (error.status === 409) {cloudReadyRef.current = null;financeConflictRef.current=true;}
      setLastCloudError(formatError(error)); setCloudSyncStatus('failed');
      fireMascot({ mood: 'alert', message: `บันทึกไม่สำเร็จ: ${formatError(error)} ข้อมูลยังอยู่ในหน้านี้ กรุณาสำรองก่อนโหลดใหม่หรือปิดหน้าเว็บ` });
    }
  };

  const switchFinance = async (groupId?:string,name?:string) => {
    if(switchingFinanceRef.current || groupId===financeGroupId || !session?.user?.id)return;
    switchingFinanceRef.current=true;
    setSwitchingFinance(true);
    try {
      if(cloudReadyRef.current===financeOwner) {
        await flushCloud(financeOwner);
        await saveAppCloud(financeOwner,{jobs,expenses,goals,settings,statuses,jobTypes,notifSettings});
      } else if(financeConflictRef.current) {
        throw new Error('กรุณาสำรองข้อมูลและโหลดข้อมูลล่าสุดก่อนเปลี่ยนบัญชี');
      }
      assertFinanceWorkspace(financeOwner);
      cloudReadyRef.current=null;
      clearCloud();privateCache.clear();
      const next=financeKey(session.user.id,groupId);
      financeOwnerRef.current=next;setFinanceWorkspace(next);
      setFinanceSelection({account:session.user.id,groupId,name});
      setIsLoadedForUser(null);setCloudSyncStatus('pending');
      setLoadedFinanceOwner('');financeConflictRef.current=false;
      setJobs([]);setExpenses([]);setGoals([]);
      setSettings({...defaultSettings,profileSetupCompleted:!!groupId});
      setIsAddJobOpen(false);setInitialSelectedGoalId(null);setScrollToJobId(null);setScrollToExpenseId(null);setAutoOpenAddExpense(false);
      setIsSetupWizardPreview(false);
    } catch(error:any) {triggerAlert('เปลี่ยนบัญชีการเงินไม่สำเร็จ',error.message);}
    finally {switchingFinanceRef.current=false;setSwitchingFinance(false);}
  };

  // Load user data whenever session changes
  useEffect(() => {
    if (session?.user?.email) {
      const email = session.user.email;
      if (isLoadedForUser === email && loadedWorkspaceRef.current===financeOwner) return;
      loadedWorkspaceRef.current=financeOwner;
      setLoadedFinanceOwner('');

      if (session.isGuest) {
        // "ทดลองใช้งานระบบฟรี" -- always seeds the same fresh sample scenario, never whatever a
        // previous demo visit left behind. Nothing from a guest session is read from or written
        // to browser storage, so there is no previous financial cache to load.
        const sample = buildSampleData();
        setJobs(cleanJobs(sample.jobs));
        setGoals(sample.goals);
        setSettings(sample.settings);
        setExpenses(sample.expenses);
        setNotifSettings({
          enabled: true,
          alertEmail: email,
          serviceType: 'mailto',
          emailjsServiceId: '',
          emailjsTemplateId: '',
          emailjsPublicKey: '',
          pendingQueue: []
        });
        setStatuses([
          { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
          { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
          { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
        ]);
        setJobTypes(DEFAULT_JOB_TYPES);
        setUserAvatar('');
        setIsLoadedForUser(email);
        return;
      }

      setJobs(cleanJobs(defaultJobs));
      setGoals(defaultGoals);
      setSettings(defaultSettings);
      setExpenses([]);
      setNotifSettings({ enabled: true, alertEmail: email, serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [] });
      setStatuses([{ id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' }, { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' }, { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' }]);
      setJobTypes(DEFAULT_JOB_TYPES);
      setUserAvatar('');

      setIsLoadedForUser(email);
      // Trigger Cloud sync loading
      loadCloudData(email);
    } else {
      loadedWorkspaceRef.current='';setLoadedFinanceOwner('');financeConflictRef.current=false;
      setIsLoadedForUser(null);
      setUserAvatar('');
      setSubscription(null);
      setJobs(cleanJobs(defaultJobs));
      setGoals(defaultGoals);
      setSettings(defaultSettings);
      setExpenses([]);
      setStatuses([
        { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
        { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
        { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
      ]);
      setJobTypes(DEFAULT_JOB_TYPES);
      setNotifSettings({
        enabled: true,
        alertEmail: '',
        serviceType: 'mailto',
        emailjsServiceId: '',
        emailjsTemplateId: '',
        emailjsPublicKey: '',
        pendingQueue: []
      });
      setCloudSyncStatus('not_setup');
    }
  }, [session, isLoadedForUser, financeOwner]);

  // 🎉 Promote the Pro plan once per calendar day to logged-in, non-guest, non-Pro users after
  // their data has loaded. Dismissible; marks today as "shown" the moment it opens so closing it
  // (or just not acting on it) never brings it back again the same day.
  //
  // Gated on `subscription !== null`, not just isLoadedForUser: isPro depends on subscription
  // state, which starts null and is only set once loadSubscriptionData's async fetch resolves.
  // isLoadedForUser can go true first, so without this, a real Pro user briefly reads as
  // isPro:false during that load window and gets shown this popup incorrectly (confirmed --
  // that stale false also leaked into every other isPro-gated UI element until a full reload).
  useEffect(() => {
    if (!isLoadedForUser || session?.isGuest || subscription === null || isPro) return;
    const todayKey = new Date().toISOString().split('T')[0];
    const storageKey = `cashflow_promo_last_shown_${isLoadedForUser}`;
    if (localStorage.getItem(storageKey) === todayKey) return;
    localStorage.setItem(storageKey, todayKey);
    setIsProPromoOpen(true);
  }, [isLoadedForUser, session?.isGuest, subscription, isPro]);

  // Safety net regardless of the above: if isPro ever flips true while the promo is open (this
  // race condition or any other), close it immediately rather than leaving a Pro user stuck
  // looking at an upgrade prompt for a plan they already have.
  useEffect(() => {
    if (isPro && isProPromoOpen) setIsProPromoOpen(false);
  }, [isPro, isProPromoOpen]);

  // Second, independent trigger for the same popup: at most once every 7 days (elapsed time, not
  // calendar-day/week boundaries -- doesn't matter what day of the week someone first sees it).
  // Reuses isProPromoOpen/ProPromoModal itself rather than a separate banner -- a free user should
  // see the same closeable popup either way, just on two different cadences that can both apply.
  useEffect(() => {
    if (!isLoadedForUser || session?.isGuest || subscription === null || isPro) return;
    const storageKey = `cashflow_pro_banner_last_shown_${isLoadedForUser}`;
    const lastShown = Number(localStorage.getItem(storageKey) || 0);
    if (Date.now() - lastShown < 7 * 24 * 60 * 60 * 1000) return;
    localStorage.setItem(storageKey, String(Date.now()));
    setIsProPromoOpen(true);
  }, [isLoadedForUser, session?.isGuest, subscription, isPro]);

  // Modal Control States
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState(false);
  const [initialSelectedGoalId, setInitialSelectedGoalId] = useState<string | null>(null);
  // Deep-link that scrolls the Jobs tab list to a specific job and briefly highlights it --
  // used by clickable summary figures/lists across other tabs (Dashboard's hero card, the
  // credit-term board, the LINE bot's "เปิดแอป" button on a saved-job card) so clicking/tapping
  // a job jumps straight to its "ได้เงินครบแล้ว/ได้มัดจำ" quick-action row in the real list,
  // instead of opening a separate read-only popup or leaving the user to scroll through however
  // many jobs they've recorded to find it themselves.
  const [scrollToJobId, setScrollToJobId] = useState<string | null>(null);
  const [scrollToExpenseId, setScrollToExpenseId] = useState<string | null>(null);
  const [autoOpenAddExpense, setAutoOpenAddExpense] = useState(false);
  // Umbrella "บันทึกรายรับ-รายจ่าย" tab: income (jobs) and expense are sub-modes of the
  // same place instead of living in two disconnected tabs.
  const [recordMode, setRecordMode] = useState<'income' | 'expense'>('income');

  // Deep links from the LINE assistant's Quick Reply buttons: once this user's data has loaded,
  // jump straight to the relevant spot in the Jobs tab and strip the param from the URL.
  // ?job=<id> / ?expense=<id> opens that record; ?openAddJob=1 / ?openAddExpense=1 pop the real
  // add-job/add-expense form straight open (reusing the actual in-app modal, not a separate
  // bare-bones page).
  useEffect(() => {
    if (!(session?.user?.email && isLoadedForUser === session.user.email)) return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('job');
    const expenseId = params.get('expense');
    const openAddJob = params.get('openAddJob');
    const openAddExpense = params.get('openAddExpense');
    if (!jobId && !expenseId && !openAddJob && !openAddExpense) return;

    if (jobId) {
      setRecordMode('income');
      setScrollToJobId(jobId);
    }
    if (expenseId) {
      setRecordMode('expense');
      setScrollToExpenseId(expenseId);
    }
    if (openAddJob) {
      setRecordMode('income');
      setIsAddJobOpen(true);
    }
    if (openAddExpense) {
      setRecordMode('expense');
      setAutoOpenAddExpense(true);
    }
    navigateTab('jobs');

    params.delete('job');
    params.delete('expense');
    params.delete('openAddJob');
    params.delete('openAddExpense');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  }, [session, isLoadedForUser]);

  // Custom Dialog state for elegant, non-blocking prompts/alerts
  const [dialog, setDialog] = useState<CustomDialogState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Confirmation text and callbacks belong to the account that opened them.
  useEffect(() => {
    setDialog({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: () => {} });
  }, [session?.user?.id, financeOwner]);

  const triggerAlert = (title: string, message: string, onConfirm?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'alert',
      title,
      message,
      onConfirm: () => {
        if (onConfirm) onConfirm();
      }
    });
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: () => {
        onConfirm();
      },
      onCancel
    });
  };

  const triggerPrompt = (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void,
    onCancel?: () => void
  ) => {
    setDialog({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      placeholder,
      defaultValue,
      inputType,
      onConfirm: (val) => {
        onConfirm(val || '');
      },
      onCancel
    });
  };






  // Debounced save to Supabase Cloud DB on changes
  useEffect(() => {
    // Also retry from 'failed', not just 'synced' -- gating strictly on 'synced' meant that once
    // any single save failed (a transient network blip, anything), every autosave effect below
    // stopped firing for the rest of the session (cloudSyncStatus only leaves 'failed' on a save
    // actually succeeding again, which this same gate was preventing from ever being attempted) --
    // edits, including deletes, would silently stop reaching the server at all until the next
    // full reload gave loadCloudData a fresh chance to set 'synced'.
    if (session?.user?.email && isLoadedForUser === session.user.email && (cloudSyncStatus === 'synced' || cloudSyncStatus === 'failed')) {
      const email = session.user.email;
      const timer = setTimeout(() => {
        saveCloudData(email, {
          jobs,
          goals,
          statuses,
          jobTypes,
          settings,
          notifSettings,
          expenses
        });
      }, 1500); // 1.5s debounce to bundle fast consecutive changes
      return () => clearTimeout(timer);
    }
  }, [jobs, goals, statuses, jobTypes, settings, notifSettings, expenses, session, isLoadedForUser, cloudSyncStatus, financeOwner]);

  // The debounce above has a real data-loss window: if the user closes the tab, backgrounds
  // the app, or navigates away within that 1.5s, the pending setTimeout never fires and the
  // edit (e.g. a newly-added job) never reaches Supabase — the next load then overwrites it
  // with the stale cloud copy. Flush immediately (no debounce) the moment the page starts
  // hiding, using both visibilitychange and pagehide since neither fires reliably alone across
  // every browser (pagehide is the one that actually fires on iOS Safari tab close).
  useEffect(() => {
    if (!(session?.user?.email && isLoadedForUser === session.user.email && (cloudSyncStatus === 'synced' || cloudSyncStatus === 'failed'))) return;
    const email = session.user.email;
    const flush = () => {
      saveCloudData(email, {
        jobs,
        goals,
        statuses,
        jobTypes,
        settings,
        notifSettings,
        expenses
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [jobs, goals, statuses, jobTypes, settings, notifSettings, expenses, session, isLoadedForUser, cloudSyncStatus, financeOwner]);

  // Check for overdue credit terms on login/data load
  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email && jobs.length > 0) {
      const email = session.user.email;
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Prevent multiple prompts in a single session for today
      const sessionKey = `cashflow_queue_checked_${email}_${todayStr}`;
      if (sessionStorage.getItem(sessionKey)) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter jobs that are unpaid and overdue by 1+ days
      const overdueJobs = jobs.filter(j => {
        // Unpaid check: status behavior is not 'done' and pending is > 0 (or paymentStatus !== 'paid')
        const statusOpt = statuses.find(s => s.id === j.status);
        const behavior = statusOpt ? statusOpt.behavior : 'pending';
        const isUnpaid = behavior !== 'done' && j.pending > 0 && j.paymentStatus !== 'paid';
        
        const targetDateStr = j.dueDate || j.payDate;
        if (!isUnpaid || !targetDateStr) return false;
        
        const targetDate = new Date(targetDateStr + 'T00:00:00');
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // At least 1 day overdue (diffDays <= -1)
        return diffDays <= -1;
      });

      if (overdueJobs.length > 0 && notifSettings.enabled) {
        // Mark session as checked first
        sessionStorage.setItem(sessionKey, 'true');

        const currentQueue = notifSettings.pendingQueue || [];
        let queueUpdated = false;
        const updatedQueue = [...currentQueue];

        overdueJobs.forEach(j => {
          const alreadyInQueueToday = currentQueue.some(
            r => r.jobId === j.id && r.detectedDate === todayStr
          );

          if (!alreadyInQueueToday) {
            const targetDateStr = j.dueDate || j.payDate || '';
            updatedQueue.push({
              id: `rem-${j.id}-${todayStr}`,
              jobId: j.id,
              jobName: j.name,
              client: j.client || 'ไม่ระบุ',
              pendingAmount: j.pending,
              dueDate: targetDateStr,
              detectedDate: todayStr,
              status: 'pending'
            });
            queueUpdated = true;
          }
        });

        if (queueUpdated) {
          setNotifSettings(prev => ({
            ...prev,
            pendingQueue: updatedQueue
          }));

          const newCount = updatedQueue.filter(r => r.detectedDate === todayStr && r.status === 'pending').length;
          
          setTimeout(() => {
            triggerConfirm(
              'ตรวจพบดีลค้างชำระเลยกำหนด!',
              `ระบบตรวจพบดีลงานเลยกำหนดเครดิตเทอมใหม่วันนี้ (จำนวน ${newCount} รายการ)\n\nคุณต้องการไปที่ "แดชบอร์ดติดตามทวงถามเครดิตเทอม" เพื่อตรวจสอบคิวทวงหนี้และกดส่งอีเมลทวงถามเลยไหมครับ?`,
              () => {
                navigateTab('report');
              }
            );
          }, 1500);
        }
      }
    }
  }, [session, isLoadedForUser, jobs, statuses, notifSettings.enabled]);

  // Best-effort push to LINE (if linked) whenever a job/expense is added straight through the
  // web app -- mirrors the same "bank app" receipt the LINE bot/LIFF form already send, so
  // recording something here pings LINE too instead of only when added from there. Never blocks
  // or surfaces an error to the user; a failed/skipped push is silently fine.
  const notifyLineRecordAdded = (kind: 'job' | 'expense', record: Job | Expense, monthNet: number | undefined) => {
    if (!session?.user?.email || session.isGuest || financeGroupId) return;
    (async () => {
      try {
        await apiFetch('/api/notify', {
          method: 'POST',
          headers: { 'X-Account-ID': session.user.id },
          body: JSON.stringify({ event: 'record-added', kind, record, monthNet }),
        });
      } catch (err) {
        console.warn('notifyLineRecordAdded failed:', err);
      }
    })();
  };

  // Job edits that aren't a full payment completion (that case reuses notifyLineRecordAdded's
  // "รับเงิน" card via handleEditJob's wasCompleted branch) previously sent no LINE notification
  // at all -- editing a job's name/client/value/status through JobsTab's edit form landed
  // silently. This covers that gap with its own "แก้ไขงาน" card.
  const notifyLineRecordEdited = (record: Job, monthNet: number | undefined) => {
    if (!session?.user?.email || session.isGuest || financeGroupId) return;
    (async () => {
      try {
        await apiFetch('/api/notify', {
          method: 'POST',
          headers: { 'X-Account-ID': session.user.id },
          body: JSON.stringify({ event: 'record-edited', kind: 'job', record, monthNet }),
        });
      } catch (err) {
        console.warn('notifyLineRecordEdited failed:', err);
      }
    })();
  };

  // LINE has no API to delete/unsend a previously-sent message, so deleting a job or expense
  // here can't remove its old "บันทึกสำเร็จ" card from the chat -- this pushes a follow-up
  // "ยกเลิก/ลบ" card instead, so the chat at least shows it was voided.
  const notifyLineRecordDeleted = (kind: 'job' | 'expense', record: Job | Expense, monthNet: number | undefined) => {
    if (!session?.user?.email || session.isGuest || financeGroupId) return;
    (async () => {
      try {
        const body = kind === 'job'
          ? { kind, record: { name: (record as Job).name, client: (record as Job).client, value: (record as Job).value, isPosted: (record as Job).isPosted }, monthNet }
          : { kind, record: { name: (record as Expense).name, category: (record as Expense).category, amount: (record as Expense).amount }, monthNet };
        await apiFetch('/api/notify', {
          method: 'POST',
          headers: { 'X-Account-ID': session.user.id },
          body: JSON.stringify({ event: 'record-deleted', ...body }),
        });
      } catch (err) {
        console.warn('notifyLineRecordDeleted failed:', err);
      }
    })();
  };

  // Same best-effort push pattern for savings-goal events -- creating a goal, or a deposit/
  // withdraw transaction against one (mirrors handleAddGoal / handleUpdateGoalProgress).
  const notifyLineGoalEvent = (
    kind: 'created' | 'deposit' | 'withdraw' | 'transaction-deleted',
    goal: { name: string; target: number; current: number; deadline?: string },
    tx?: { amount: number; reason?: string; type?: 'deposit' | 'withdraw' }
  ) => {
    if (!session?.user?.email || session.isGuest || financeGroupId) return;
    (async () => {
      try {
        const body = kind === 'created'
          ? { kind, goal: { name: goal.name, target: goal.target, deadline: goal.deadline } }
          : { kind, goal: { name: goal.name, target: goal.target, current: goal.current }, tx };
        await apiFetch('/api/notify', {
          method: 'POST',
          headers: { 'X-Account-ID': session.user.id },
          body: JSON.stringify({ event: 'goal-event', ...body }),
        });
      } catch (err) {
        console.warn('notifyLineGoalEvent failed:', err);
      }
    })();
  };

  // computeMonthlySummary is only for the LINE card's "คงเหลือเดือนนี้" line -- never let it (or
  // anything else) block the notify call itself, since a thrown error here would silently
  // swallow the whole notification before the fetch even happens. Uses receivedAfterVariableExpense
  // (not netFlow) so this matches the Dashboard's "คงเหลือหลังหักรายจ่าย" figure the user actually
  // watches -- netFlow also nets out the fixed-expense budget line, which isn't what "how much do
  // I have left right now" means to them.
  //
  // Takes the jobs/expenses arrays explicitly rather than reading the `jobs`/`expenses` closures
  // itself -- callers must pass the array returned from their own setJobs/setExpenses functional
  // updater (see handleAddJob etc. below), not the plain state variable. Two edits fired back to
  // back (e.g. marking two jobs paid in quick succession) can both run before React re-renders,
  // so both would close over the same pre-edit `jobs`/`expenses` and each notification would show
  // a running balance that doesn't account for the other edit -- the exact "balances swapped"
  // report this was fixed for.
  const monthNetSafe = (jobsList: Job[], expensesList: Expense[]): number | undefined => {
    try {
      return computeMonthlySummary(
        jobsList,
        expensesList,
        goals,
        settings,
        getCurrentMonthKeyBkk()
      ).receivedAfterVariableExpense;
    } catch (err) {
      console.warn('computeMonthlySummary failed for LINE notify:', err);
      return undefined;
    }
  };

  // Core functions
  const handleAddJob = (newJob: Omit<Job, 'id'>) => {
    const jobWithId: Job = {
      ...newJob,
      id: crypto.randomUUID(),
    };
    let freshJobs: Job[] = jobs;
    setJobs(prev => {
      freshJobs = [jobWithId, ...prev];
      return freshJobs;
    });
    fireMascot({
      mood: 'celebrate',
      message: `เพิ่มงาน "${newJob.name}" ชิ้นใหม่เรียบร้อยแล้วค้าบ! สู้ๆ น้าเจ้ากระรอก!`
    });
    // Trigger a celebratory green leaves shower!
    leafBus.trigger({ count: 16, type: 'green', durationMs: 3500 });

    notifyLineRecordAdded('job', jobWithId, monthNetSafe(freshJobs, expenses));
  };

  // Jumps to the Jobs tab and scrolls straight to one job's card, briefly highlighted --
  // shared by every clickable job reference outside the Jobs tab itself (Dashboard's hero
  // card breakdown, the credit-term board) so they all land on the same quick-action row.
  const handleViewJob = (id: string) => {
    setScrollToJobId(id);
    navigateTab('jobs');
  };

  const handleEditJob = (id: string, updated: Partial<Job>) => {
    // Read oldJob and build the post-edit array from `prev` inside the functional updater, not
    // from the `jobs` closure -- two edits fired back to back (e.g. marking two jobs paid within
    // the same tick, before React re-renders between clicks) would otherwise both close over the
    // same pre-edit `jobs`, so the second edit's LINE notification balance wouldn't account for
    // the first edit at all. setJobs's functional form always sees the true latest pending state.
    let oldJob: Job | undefined;
    let freshJobs: Job[] = jobs;
    setJobs(prev => {
      oldJob = prev.find(j => j.id === id);
      freshJobs = prev.map(j => j.id === id ? { ...j, ...updated } : j);
      return freshJobs;
    });

    // If job was completed or fully paid, trigger a massive celebration! Checked three ways, not
    // just the status/paymentStatus string fields -- those can drift out of sync with reality
    // (e.g. a job still showing in Dashboard's "unpaid" quick-list, which is driven by
    // pending > 0, while status already happens to read 'done' for an unrelated reason), which
    // was silently swallowing both the celebration and the LINE notification. `pending` hitting
    // exactly 0 is the one signal every other part of the app already treats as the source of
    // truth for "fully paid", so it's included as its own, independent trigger here too.
    const wasCompleted = (updated.status === 'done' && oldJob?.status !== 'done') ||
                         (updated.paymentStatus === 'paid' && oldJob?.paymentStatus !== 'paid') ||
                         (updated.pending === 0 && (oldJob?.pending ?? 0) > 0);

    // A WIP job flipping to isPosted (the "ส่งงานแล้ว รอรับเงิน" quick action, or the same toggle
    // inside the full edit form) is its own distinct moment -- the deal is delivered, but no money
    // has necessarily landed yet. Before this check existed, that save fell through to the generic
    // "แก้ไขงาน" branch below and sent a plain "job edited" LINE card, which reads as a random field
    // tweak rather than what actually happened. buildJobSavedMessage already renders the correct
    // "ดีลงาน" vs "รับเงินแล้ว" badge for a posted job based on its payment status, so reusing the
    // same notifyLineRecordAdded call here (like wasCompleted does) gives this its own accurate card.
    const wasDelivered = !wasCompleted && updated.isPosted === true && oldJob?.isPosted === false;

    // A deposit (the "ได้มัดจำ" quick action) used to send no LINE card at all -- per feedback, a
    // partial payment landing is worth its own notification, distinct from a full payment (its own
    // amber "ได้รับมัดจำ" badge in buildJobSavedMessage, not the green "รับเงินแล้ว" one).
    const wasPartialPayment = !wasCompleted && !wasDelivered && updated.status === 'partial';

    if (wasCompleted) {
      fireMascot({
        mood: 'celebrate',
        message: `ยินดีด้วยค้าบ! งานนี้ปิดดีลรับเงินเข้าคลังกระรอกเรียบร้อยแล้ว! อู้ฟู่สุดๆ!`
      });
      leafBus.trigger({ count: 28, type: 'mixed', durationMs: 5000 });
      // Same "รับเงิน" LINE card as a brand-new fully-paid job -- this is a payment landing on an
      // existing project, so it should read the same way ("ได้รับยอดของโปรเจกต์นี้แล้ว เท่าไหร่").
      if (oldJob) {
        const mergedJob = { ...oldJob, ...updated };
        notifyLineRecordAdded('job', mergedJob, monthNetSafe(freshJobs, expenses));
      }
    } else if (wasDelivered) {
      fireMascot({
        mood: 'happy',
        message: `ส่งมอบงานเรียบร้อยแล้วค้าบ! เหลือแค่รอเงินโอนเข้าคลังกระรอกเท่านั้น!`
      });
      if (oldJob) {
        const mergedJob = { ...oldJob, ...updated };
        notifyLineRecordAdded('job', mergedJob, monthNetSafe(freshJobs, expenses));
      }
    } else if (wasPartialPayment) {
      fireMascot({
        mood: 'happy',
        message: `บันทึกมัดจำเรียบร้อยแล้วค้าบ! มีเงินเข้าคลังกระรอกมาบางส่วนแล้วนะ!`
      });
      leafBus.trigger({ count: 14, type: 'mixed', durationMs: 3000 });
      if (oldJob) {
        const mergedJob = { ...oldJob, ...updated };
        notifyLineRecordAdded('job', mergedJob, monthNetSafe(freshJobs, expenses));
      }
    } else {
      fireMascot({
        mood: 'happy',
        message: `อัปเดตข้อมูลดีลเรียบร้อยแล้วค้าบ! ข้อมูลถูกต้องแม่นยำร้อยเปอร์เซ็นต์!`
      });
      // `updated.name` is only ever present on JobsTab's real edit-form save (see its onEditJob
      // call) -- every other onEditJob caller (a lone isPosted toggle, etc.) only ever touches a
      // couple of narrow fields and never `name`, so gating on it here is what keeps this from
      // firing a LINE card on every one of those.
      if (oldJob && updated.name !== undefined) {
        const mergedJob = { ...oldJob, ...updated };
        notifyLineRecordEdited(mergedJob, monthNetSafe(freshJobs, expenses));
      }
    }
  };

  const handleDeleteJob = (id: string) => {
    triggerConfirm(
      'ยืนยันการลบงานดีล',
      'คุณแน่ใจหรือไม่ว่าต้องการลบดีลงานชิ้นนี้? ข้อมูลรายรับที่เกี่ยวข้องจะหายไปด้วย',
      () => {
        const jobToDelete = jobs.find(j => j.id === id);
        deletedJobIdsRef.current.add(id);
        if (session?.user?.email) {
          markRecentlyDeleted(`cashflow_deleted_job_ids_${session.user.email}`, id);
        }
        let freshJobs: Job[] = jobs;
        setJobs(prev => {
          freshJobs = prev.filter(j => j.id !== id);
          return freshJobs;
        });
        fireMascot({
          mood: 'alert',
          message: `ลบดีลงานเรียบร้อยแล้วนะค้าบ หวังว่าดีลใหม่จะงอกเร็วๆ น้า!`
        });
        if (jobToDelete) {
          notifyLineRecordDeleted('job', jobToDelete, monthNetSafe(freshJobs, expenses));
        }
        // Don't wait for the 1.5s debounced autosave -- a job the user just confirmed deleting
        // reappearing in the stock list (a real report) is exactly what happens if the tab closes
        // or the app backgrounds inside that window before the debounced save fires: the delete
        // never reaches Supabase, so the next load pulls the "deleted" job right back in from the
        // server. Push it immediately instead; the debounced effect firing again 1.5s later with
        // the same jobs array is a harmless no-op.
        if (session?.user?.email && isLoadedForUser === session.user.email && !session?.isGuest) {
          saveCloudData(session.user.email, {
            jobs: freshJobs,
            goals,
            statuses,
            jobTypes,
            settings,
            notifSettings,
            expenses
          });
        }
      }
    );
  };

  const handleAddGoal = (newGoal: Omit<Goal, 'id'>) => {
    const goalWithId: Goal = {
      ...newGoal,
      id: crypto.randomUUID(),
    };
    setGoals(prev => [...prev, goalWithId]);
    leafBus.trigger({ count: 12, type: 'mixed', durationMs: 3000 });
    notifyLineGoalEvent('created', goalWithId);
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const handleUpdateGoalProgress = (id: string, amount: number, reason?: string, date?: string, deductFromCash?: boolean) => {
    const g = goals.find(x => x.id === id);
    if (!g) return;

    const todayStr = date || new Date().toISOString().split('T')[0];
    const defaultReason = amount >= 0 ? 'โอนเงินเข้าฝากออมเพิ่ม' : 'ดึงเงินออก / หักค่าใช้จ่าย';
    // Never cap at g.target -- a deposit that overshoots the goal is still real money that
    // landed in it (the UI already shows that as >100% progress, e.g. "1014.0% สำเร็จแล้ว").
    // Capping here silently discarded the excess, and then made handleDeleteGoalTransaction's
    // revert math wrong too: reverting a capped deposit subtracted the FULL original amount from
    // the capped current, which could wipe out money that was already in the goal before it.
    const nextVal = Math.max(0, g.current + amount);
    const newTx: GoalTransaction = {
      id: crypto.randomUUID(),
      type: (amount >= 0 ? 'deposit' : 'withdraw') as 'deposit' | 'withdraw',
      amount: Math.abs(amount),
      date: todayStr,
      reason: reason?.trim() || defaultReason,
      createdAt: new Date().toISOString(),
      // A savings transfer is not an Expense -- it must never land in the `expenses` array,
      // since tax reports, monthly summaries, and CSV exports all sum that array and would
      // wrongly treat money moved into savings as a deductible business expense. Cash-on-hand
      // totals (Dashboard/SummaryTab) read this flag directly off the goal's own history instead.
      ...(amount > 0 && deductFromCash ? { deductedFromCash: true } : {}),
    };

    // Ticking "หักออกจากยอดรายรับ" (deductedFromCash, set on newTx above) is what makes this
    // deposit count toward SplitTab's "กำไรสุทธิคงเหลือเพื่อจัดสรร" -- that figure derives live
    // from deductedFromCash deposit history, so setting the flag on newTx is all that's needed;
    // no separate settings bookkeeping here, and nothing to reverse on delete either.

    if (nextVal >= g.target && g.current < g.target) {
      // Goal completed! Massive leaf party!
      fireMascot({
        mood: 'celebrate',
        message: `ว้าววว! คุณทำเป้าหมายออมเงิน "${g.name}" สำเร็จครบ 100% แล้ว! ยอดเยี่ยมที่สุดเลยค้าบเจ้ากระรอก!`
      });
      leafBus.trigger({ count: 32, type: 'mixed', durationMs: 6500 });
    } else if (amount > 0) {
      // Saving money, drop some green leaves!
      leafBus.trigger({ count: 10, type: 'green', durationMs: 2500 });
    }
    notifyLineGoalEvent(newTx.type, { name: g.name, target: g.target, current: nextVal }, { amount: newTx.amount, reason: newTx.reason });

    setGoals(prev => prev.map(goal => (
      goal.id === id
        ? { ...goal, current: nextVal, history: [newTx, ...(goal.history || [])] }
        : goal
    )));
  };

  const handleDeleteGoalTransaction = (goalId: string, txId: string, revertBalance: boolean = true) => {
    const g = goals.find(x => x.id === goalId);
    if (!g || !g.history) return;
    const targetTx = g.history.find(t => t.id === txId);
    if (!targetTx) return;

    // setGoals's functional form always sees the true latest current/history, same reasoning as
    // handleEditJob's oldJob/freshJobs capture -- and its eager-state computation runs
    // synchronously, so nextCurrentForNotify is populated before it's read just below.
    let nextCurrentForNotify = g.current;
    setGoals(prev => prev.map(goal => {
      if (goal.id !== goalId || !goal.history) return goal;
      const newHistory = goal.history.filter(t => t.id !== txId);
      let nextCurrent = goal.current;
      if (revertBalance) {
        // No target cap here either -- see the comment on handleUpdateGoalProgress's nextVal.
        nextCurrent = targetTx.type === 'deposit'
          ? Math.max(0, goal.current - targetTx.amount)
          : goal.current + targetTx.amount;
      }
      nextCurrentForNotify = nextCurrent;
      return { ...goal, current: nextCurrent, history: newHistory };
    }));

    notifyLineGoalEvent(
      'transaction-deleted',
      { name: g.name, target: g.target, current: nextCurrentForNotify },
      { amount: targetTx.amount, reason: targetTx.reason, type: targetTx.type }
    );

    // No settings bookkeeping needed here -- SplitTab's "กำไรสุทธิคงเหลือเพื่อจัดสรร" derives
    // live from deductedFromCash deposits still present in goal history, so removing the
    // transaction above (when revertBalance is true) already un-counts it automatically.
  };

  const handleTransferBetweenGoals = (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => {
    if (fromGoalId === toGoalId || amount <= 0) return;
    const fromGoal = goals.find(g => g.id === fromGoalId);
    const toGoal = goals.find(g => g.id === toGoalId);
    if (!fromGoal || !toGoal) return;

    const transferAmount = Math.min(amount, fromGoal.current);
    if (transferAmount <= 0) return;

    const todayStr = date || new Date().toISOString().split('T')[0];
    const createdAt = new Date().toISOString();
    const finalReason = reason?.trim();

    setGoals(prev => prev.map(g => {
      if (g.id === fromGoalId) {
        const newTx = {
          id: crypto.randomUUID(),
          type: 'withdraw' as const,
          amount: transferAmount,
          date: todayStr,
          reason: finalReason || `โอนย้ายไปเป้าหมาย "${toGoal.name}"`,
          relatedGoalId: toGoalId,
          relatedGoalName: toGoal.name,
          createdAt
        };
        return {
          ...g,
          current: Math.max(0, g.current - transferAmount),
          history: [newTx, ...(g.history || [])]
        };
      }
      if (g.id === toGoalId) {
        const newTx = {
          id: crypto.randomUUID(),
          type: 'deposit' as const,
          amount: transferAmount,
          date: todayStr,
          reason: finalReason || `โอนย้ายมาจากเป้าหมาย "${fromGoal.name}"`,
          relatedGoalId: fromGoalId,
          relatedGoalName: fromGoal.name,
          createdAt
        };
        return {
          ...g,
          // No target cap -- see the comment on handleUpdateGoalProgress's nextVal.
          current: g.current + transferAmount,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));

    leafBus.trigger({ count: 14, type: 'mixed', durationMs: 3000 });
    triggerAlert(
      'โอนย้ายเงินสำเร็จ!',
      `โอนย้ายเงินจำนวน ${transferAmount.toLocaleString()} ฿ จากเป้าหมาย "${fromGoal.name}" ไปยัง "${toGoal.name}" เรียบร้อยแล้ว`
    );
  };

  const handleUpdateGoal = (id: string, updatedFields: Partial<Goal>) => {
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        return { ...g, ...updatedFields };
      }
      return g;
    }));
  };

  // Dedicated Allocate Saving money from the Split Pool to any Target Goal
  const handleAllocateSavingsToGoal = (goalId: string, amount: number, reason?: string) => {
    let goalName = '';
    const todayStr = new Date().toISOString().split('T')[0];
    setGoals(prev => prev.map(g => {
      if (g.id === goalId) {
        goalName = g.name;
        // No target cap -- see the comment on handleUpdateGoalProgress's nextVal.
        const nextVal = g.current + amount;
        const newTx = {
          id: crypto.randomUUID(),
          type: 'deposit' as const,
          amount,
          date: todayStr,
          reason: reason || 'จัดสรรกำไรสุทธิประจำเดือน',
          createdAt: new Date().toISOString()
        };
        return {
          ...g,
          current: nextVal,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));
    if (goalName) {
      triggerAlert(
        'ฝากเงินสำเร็จ!',
        `โอนเงิน ${amount.toLocaleString()} ฿ เข้าสู่เป้าหมาย "${goalName}" เรียบร้อยแล้ว`
      );
    }
  };

  const handleAllocateMultipleSavings = (allocations: Record<string, number>, settingsUpdate?: Partial<AppSettings>) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setGoals(prev => prev.map(g => {
      const amount = allocations[g.id];
      if (amount && amount > 0) {
        // No target cap -- see the comment on handleUpdateGoalProgress's nextVal.
        const nextVal = g.current + amount;
        const newTx = {
          id: crypto.randomUUID(),
          type: 'deposit' as const,
          amount,
          date: todayStr,
          reason: 'จัดสรรกำไรสุทธิประจำเดือน',
          createdAt: new Date().toISOString(),
          // This money is, by definition, this month's net profit -- SplitTab's
          // "กำไรสุทธิคงเหลือเพื่อจัดสรร" derives live from deductedFromCash deposits, so this has
          // to be marked the same way a manual deposit would be for that figure to account for it.
          deductedFromCash: true,
        };
        return {
          ...g,
          current: nextVal,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));
    if (settingsUpdate) {
      setSettings(prev => ({ ...prev, ...settingsUpdate }));
    }
  };

  const handleAddExpense = (newExp: Omit<Expense, 'id'>) => {
    const expWithId: Expense = {
      ...newExp,
      id: crypto.randomUUID()
    };
    let freshExpenses: Expense[] = expenses;
    setExpenses(prev => {
      freshExpenses = [expWithId, ...prev];
      return freshExpenses;
    });

    notifyLineRecordAdded('expense', expWithId, monthNetSafe(jobs, freshExpenses));
  };

  const handleEditExpense = (id: string, updated: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
  };

  const handleDeleteExpense = (id: string) => {
    const expenseToDelete = expenses.find(e => e.id === id);
    deletedExpenseIdsRef.current.add(id);
    if (session?.user?.email) {
      markRecentlyDeleted(`cashflow_deleted_expense_ids_${session.user.email}`, id);
    }
    let freshExpenses: Expense[] = expenses;
    setExpenses(prev => {
      freshExpenses = prev.filter(e => e.id !== id);
      return freshExpenses;
    });
    if (expenseToDelete) {
      notifyLineRecordDeleted('expense', expenseToDelete, monthNetSafe(jobs, freshExpenses));
    }
    // Same immediate-flush reasoning as handleDeleteJob -- don't leave a delete sitting in the
    // 1.5s debounce window where closing/backgrounding the app can lose it and bring the
    // "deleted" expense right back on the next load.
    if (session?.user?.email && isLoadedForUser === session.user.email && !session?.isGuest) {
      saveCloudData(session.user.email, {
        jobs,
        goals,
        statuses,
        jobTypes,
        settings,
        notifSettings,
        expenses: freshExpenses
      });
    }
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  const handleProfileSetupSettings = async (newSettings: AppSettings) => {
    if (!session?.user?.id || session.isGuest || financeGroupId || cloudReadyRef.current !== financeOwner) return;
    try {
      await saveCloud(financeOwner, { settings: newSettings });
      setSettings(newSettings);
      setLastCloudError(null);
      setCloudSyncStatus('synced');
    } catch (error: any) {
      setLastCloudError(formatError(error));
      setCloudSyncStatus('failed');
      fireMascot({ mood: 'alert', message: `บันทึกสถานะแบบสอบถามไม่สำเร็จ: ${formatError(error)}` });
      throw error;
    }
  };

  const shouldShowSetupWizard = !session?.isGuest && shouldShowProfileSetup(settings, session?.user?.created_at);

  // Backup and Restore Management
  const handleExportData = async () => {
    let cloud: any = { invoices: JSON.parse(privateCache.getItem('cashflow_invoices_guest') || '[]'), issuer_profile: JSON.parse(privateCache.getItem('cashflow_issuer_guest') || 'null') };
    try { if (session?.user?.id && !session.isGuest) cloud = await exportCloud(financeOwner); }
    catch (error: any) { triggerAlert('ส่งออกข้อมูลไม่สำเร็จ', error.message); return; }
    const data = { 
      jobs, 
      goals, 
      settings, 
      statuses, 
      jobTypes, 
      notifSettings, 
      expenses,
      invoices: cloud.invoices || [],
      issuerProfile: cloud.issuer_profile || null,
      schemaVersion: 3,
      workspace: {kind:financeGroupId?'group':'personal',groupId:financeGroupId || null,name:financeSelection.name || 'ส่วนตัว'}
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cashflow-backup-${financeGroupId ? 'group-'+financeGroupId : 'personal'}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    fireMascot({
      mood: 'celebrate',
      message: 'ส่งออกข้อมูลเสบียงเรียบร้อยแล้วค้าบ! เก็บไฟล์นี้ไว้อย่างดีน้า'
    });
  };

  const handleImportData = async (jsonData: string) => {
    try {
      if (jsonData.length > 8 * 1024 * 1024) throw new Error('ไฟล์มีขนาดใหญ่เกินไป');
      const parsed = JSON.parse(jsonData);
      const validations: any[] = [];
      for (const field of ['jobs','expenses','goals','invoices']) if (parsed[field]) {
        if (!Array.isArray(parsed[field])) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
        validations.push(...parsed[field].map((row: any) => ({table:`cashflow_${field}`,id:row.id,op:'set',version:null,data:row})));
      }
      for (const [field, id] of Object.entries({settings:'settings',statuses:'statuses',jobTypes:'job_types',notifSettings:'notif_settings',issuerProfile:'issuer_profile'})) if (parsed[field]) validations.push({table:'cashflow_documents',id,op:'set',version:null,data:parsed[field]});
      validateChanges(validations);
      if (session?.user?.id && !session.isGuest && (parsed.invoices || parsed.issuerProfile)) await saveCloud(financeOwner,{invoices:parsed.invoices,issuer_profile:parsed.issuerProfile || undefined});
      if (session?.isGuest) { if(parsed.invoices)privateCache.setItem('cashflow_invoices_guest',JSON.stringify(parsed.invoices)); if(parsed.issuerProfile)privateCache.setItem('cashflow_issuer_guest',JSON.stringify(parsed.issuerProfile)); }
      if (parsed.jobs) setJobs(cleanJobs(parsed.jobs));
      if (parsed.goals) setGoals(parsed.goals);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.statuses) setStatuses(cleanStatuses(parsed.statuses));
      if (parsed.jobTypes) {
        setJobTypes(cleanJobTypes(parsed.jobTypes));
      }
      if (parsed.notifSettings) setNotifSettings(prev => ({...prev,...notificationPreferences.parse(parsed.notifSettings)}));
      if (parsed.expenses) setExpenses(parsed.expenses);
      
      fireMascot({
        mood: 'celebrate',
        message: 'นำเข้าข้อมูลและคืนชีพคลังเสบียงกระรอกเรียบร้อยแล้วค้าบ!'
      });
    } catch (err) {
      fireMascot({
        mood: 'alert',
        message: 'นำเข้าข้อมูลไม่สำเร็จค้าบ ไฟล์อาจเสียหายหรือรูปแบบผิดพลาด!'
      });
    }
  };


  const handleClearAllData = () => {
    setJobs([]);
    setGoals([]);
    setExpenses([]);
    setSettings(defaultSettings);
    
    if (session?.user?.email) {
      const email = session.user.email;
      localStorage.removeItem(`cashflow_jobs_${email}`);
      localStorage.removeItem(`cashflow_goals_${email}`);
      localStorage.removeItem(`cashflow_settings_${email}`);
      localStorage.removeItem(`cashflow_expenses_${email}`);
      localStorage.removeItem(`cashflow_statuses_${email}`);
      localStorage.removeItem(`cashflow_job_types_${email}`);
      localStorage.removeItem(`cashflow_notif_settings_${email}`);
    } else {
      localStorage.removeItem('cashflow_jobs');
      localStorage.removeItem('cashflow_goals');
      localStorage.removeItem('cashflow_settings');
      localStorage.removeItem('cashflow_expenses');
    }
  };

  if (loadingSession) {
    // Skeleton of the app shell itself (sidebar + dashboard) instead of a spinner -- shows the
    // layout that's about to load so the wait reads as "getting there" rather than a blank pause.
    const bar = (extra = '') => `bg-brand-border dark:bg-neutral-700 rounded-full ${extra}`;
    const card = 'rounded-[var(--radius-lg)] bg-brand-faint dark:bg-neutral-800/60 border border-brand-border/70 dark:border-neutral-700/60';
    return (
      <div className="app-shell h-screen bg-brand-bg flex lg:flex-row flex-col overflow-hidden select-none" aria-busy="true" aria-label="กำลังโหลด">
        <div className="hidden lg:flex flex-col w-68 bg-brand-white border-r border-brand-border/40 shrink-0 p-6 animate-pulse">
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <div className={bar('w-9 h-9 shrink-0')} />
            <div className="space-y-1.5">
              <div className={bar('w-24 h-2.5')} />
              <div className={bar('w-16 h-2')} />
            </div>
          </div>
          <div className="space-y-1.5 flex-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                <div className={bar('w-4 h-4 shrink-0')} />
                <div className={bar(`h-2.5 ${i === 0 ? 'w-28' : 'w-20'}`)} />
              </div>
            ))}
          </div>
          <div className={`p-3 flex items-center gap-2 ${card}`}>
            <div className={bar('w-7 h-7 shrink-0')} />
            <div className={bar('w-24 h-2.5')} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
          <div className="flex items-center justify-between">
            <div className={bar('w-40 h-4')} />
            <div className={bar('w-8 h-8 shrink-0')} />
          </div>

          <div className={`p-6 space-y-3 ${card}`}>
            <div className={bar('w-56 h-5')} />
            <div className={bar('w-full max-w-md h-2.5')} />
            <div className="flex gap-2 pt-1">
              <div className={bar('w-28 h-8')} />
              <div className={bar('w-28 h-8')} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`p-4 space-y-2.5 ${card}`}>
                <div className={bar('w-16 h-2.5')} />
                <div className={bar('w-20 h-4')} />
              </div>
            ))}
          </div>

          <div className={`h-40 ${card}`} />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin} />
      </>
    );
  }

  return (
    <div className="app-shell h-screen bg-brand-bg flex lg:flex-row flex-col overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-xl focus:bg-white focus:p-3 focus:text-stone-900">ข้ามไปเนื้อหา</a>

      {/* 💻 iPad / MacBook / PC Desktop Sidebar (Hidden on mobile devices) -- own scroll region so
          it stays put while the main content (e.g. a 100-job list) scrolls independently */}
      <aside className="app-sidebar hidden lg:flex flex-col w-68 bg-brand-white border-r border-brand-border/40 shrink-0 select-none p-6 relative overflow-y-auto no-scrollbar">
        <button
          type="button"
          onClick={() => navigateTab('dashboard')}
          className="flex items-center gap-2.5 mb-8 px-2 cursor-pointer text-left hover:opacity-80 transition-opacity"
          title={t("nav.backToDashboard")}
        >
          <div className="shrink-0">
            <Mascot mood="happy" size={36} />
          </div>
          <div>
            <h1 className="font-display font-black text-sm tracking-tight text-brand-text">
              กระรอกตุนเงิน
            </h1>
            <p className="text-[9px] text-[#E65F2B] dark:text-[#FFA473] font-black uppercase tracking-wider">
              คลังกระรอกตุนเสบียง
            </p>
          </div>
        </button>

        {/* Desktop Sidebar Navigation List */}
        <nav className="space-y-1.5 flex-1">
          {navItems.filter(item => item.group === 'core').map(item => renderNavButton(item, false))}

          {renderMoreToggle()}
          <AnimatePresence initial={false}>
            {showMoreNavItems && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5 overflow-hidden"
              >
                {navItems.filter(item => item.group === 'more').map(item => renderNavButton(item, false))}
              </motion.div>
            )}
          </AnimatePresence>

          {navItems.filter(item => item.group === 'bottom').map(item => renderNavButton(item, false))}
        </nav>

        {/* User profile & signout container */}
        <div className="mb-4 p-3 rounded-2xl bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold text-xs shrink-0 overflow-hidden">
              {userAvatar ? (
                <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
              ) : (
                <User className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-brand-muted truncate font-extrabold" title={session?.user?.email}>
                {session?.user?.email}
              </p>
            </div>
          </div>

          {session && !session.isGuest && (
            <button
              type="button"
              onClick={() => navigateTab('plans')}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 bg-brand-bg border border-brand-border/40 hover:border-brand-border transition-colors cursor-pointer"
            >
              {isPaidActive ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-display font-black inline-flex items-center gap-1">PRO</span>
                  {subscription?.currentPeriodEnd && (
                    <span className="text-[9px] text-brand-muted ml-auto font-mono">
                      {t('sidebar.until', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) })}
                    </span>
                  )}
                </>
              ) : isInFreeTrial ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                  <span className="text-indigo-600 dark:text-indigo-400 font-display font-black inline-flex items-center gap-1">{t('plans.freeTrialBadge')}</span>
                  {trialEndsAt && (
                    <span className="text-[9px] text-brand-muted ml-auto font-mono">
                      {t('sidebar.until', { date: trialEndsAt.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) })}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#E65F2B] shrink-0" />
                  <span className="text-brand-muted">FREE</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={() => {
              triggerConfirm(
                'ออกจากระบบ',
                'คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?',
                async () => {
                  await handleSignOut();
                }
              );
            }}
            className="w-full py-1.5 px-3 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/10 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3 h-3" />
            <span>ออกจากระบบ</span>
          </button>
        </div>

        {/* Desktop bottom status/theme bar */}
        <div className="pt-4 border-t border-brand-border/40 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-brand-muted font-bold inline-flex items-center gap-1">โหมดธีมสว่าง/มืด <IconPalette className="w-2.5 h-2.5" /></span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-brand-faint hover:bg-brand-border/40 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border/20 cursor-pointer"
              title={darkMode ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-500 fill-amber-500/10" />
              ) : (
                <Moon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-600/10" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* 📱 Mobile Sidebar Slide-out Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[999] lg:hidden"
            />

            {/* Sidebar content */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-72 bg-brand-white dark:bg-stone-900 border-r border-brand-border/40 dark:border-neutral-800 z-[1000] p-6 flex flex-col justify-between shadow-2xl lg:hidden select-none"
            >
              <div className="space-y-6">
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-4 border-b border-brand-border/20">
                  <button
                    type="button"
                    onClick={() => {
                      navigateTab('dashboard');
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2.5 cursor-pointer text-left"
                    title={t("nav.backToDashboard")}
                  >
                    <div className="shrink-0">
                      <Mascot mood="happy" size={36} />
                    </div>
                    <div>
                      <h1 className="font-display font-black text-xs tracking-tight text-brand-text">
                        กระรอกตุนเงิน
                      </h1>
                      <p className="text-[9px] text-[#E65F2B] dark:text-[#FFA473] font-black uppercase tracking-wider">
                        คลังกระรอกตุนเสบียง
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-xl bg-brand-faint hover:bg-brand-border/30 text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Navigation Links inside Drawer */}
                <nav className="space-y-1.5">
                  {navItems.filter(item => item.group === 'core').map(item => renderNavButton(item, true))}

                  {renderMoreToggle()}
                  <AnimatePresence initial={false}>
                    {showMoreNavItems && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        {navItems.filter(item => item.group === 'more').map(item => renderNavButton(item, true))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {navItems.filter(item => item.group === 'bottom').map(item => renderNavButton(item, true))}
                </nav>
              </div>

              <div className="space-y-4">
                {/* User profile inside Drawer */}
                <div className="p-3 rounded-2xl bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold text-xs shrink-0 overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
                      ) : (
                        <User className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-brand-muted truncate font-extrabold">
                        {session?.user?.email}
                      </p>
                    </div>
                  </div>

                  {session && !session.isGuest && (
                    <button
                      type="button"
                      onClick={() => { navigateTab('plans'); setIsMobileMenuOpen(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 bg-brand-bg border border-brand-border/40 hover:border-brand-border transition-colors cursor-pointer"
                    >
                      {isPaidActive ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-display font-black inline-flex items-center gap-1">PRO</span>
                          {subscription?.currentPeriodEnd && (
                            <span className="text-[9px] text-brand-muted ml-auto font-mono">
                              {t('sidebar.until', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) })}
                            </span>
                          )}
                        </>
                      ) : isInFreeTrial ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                          <span className="text-indigo-600 dark:text-indigo-400 font-display font-black inline-flex items-center gap-1">{t('plans.freeTrialBadge')}</span>
                          {trialEndsAt && (
                            <span className="text-[9px] text-brand-muted ml-auto font-mono">
                              {t('sidebar.until', { date: trialEndsAt.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) })}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#E65F2B] shrink-0" />
                          <span className="text-brand-muted">FREE</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      triggerConfirm(
                        'ออกจากระบบ',
                        'คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?',
                        async () => {
                          await handleSignOut();
                        }
                      );
                    }}
                    className="w-full py-1.5 px-3 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/10 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>

                {/* Theme Controls on Mobile */}
                <div className="pt-2 border-t border-brand-border/20">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-brand-muted font-bold inline-flex items-center gap-1">ธีมสว่าง/มืด <IconPalette className="w-2.5 h-2.5" /></span>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className="p-2 rounded-xl bg-brand-faint hover:bg-brand-border/40 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center gap-1.5 border border-brand-border/20 cursor-pointer text-xs font-bold w-full"
                    >
                      {darkMode ? (
                        <>
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>สว่าง</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-3.5 h-3.5 text-emerald-500" />
                          <span>มืด</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 📱 / 💻 Main Section: Handles responsive paddings & maximum constraints */}
      <div className="flex-1 flex flex-col h-screen relative overflow-hidden bg-brand-bg pb-6 lg:pb-6">
        
        {/* Top Header Bar with branding & Dark Mode toggle (Sticky on mobile, simple title on desktop) */}
        <div className={`app-topbar flex justify-between items-center px-5 py-4 bg-brand-white border-b border-brand-border/40 select-none shrink-0 lg:px-8 ${['dashboard', 'jobs'].includes(activeTab) ? 'lg:hidden' : ''}`}>
          <div className="flex items-center gap-3">
            {/* Hamburger button for Mobile Drawer Menu */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-xl bg-brand-faint hover:bg-brand-border/30 text-brand-muted hover:text-brand-text transition-all cursor-pointer lg:hidden flex items-center justify-center border border-brand-border/10"
              title={t('header.openMenu')}
            >
              <Menu className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
            </button>

            {activeTab === 'settings' ? (
              <div className="flex items-center gap-2.5">
                <Mascot mood="happy" size={32} className="shrink-0" />
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-base sm:text-xl tracking-tight text-brand-text leading-tight">
                    {t('header.settingsTitle')}
                  </span>
                  <span className="text-xs text-brand-muted dark:text-neutral-400 font-medium leading-relaxed mt-1 hidden sm:inline">
                    {t('header.settingsSubtitle')}
                  </span>
                </div>
              </div>
            ) : (
              <span className="font-display font-extrabold text-base sm:text-xl tracking-tight text-brand-text">
                {activeTab === 'dashboard' && t('header.dashboard')}
                {activeTab === 'jobs' && t('header.jobs')}
                {activeTab === 'tax' && t('header.tax')}
                {activeTab === 'invoice' && t('header.invoice')}
                {activeTab === 'summary' && t('header.summary')}
                {activeTab === 'timeline' && t('header.timeline')}
                {activeTab === 'split' && t('header.split')}
                {activeTab === 'report' && t('header.report')}
                {activeTab === 'insight' && t('header.insight')}
                {activeTab === 'plans' && t('header.plans')}
                {activeTab === 'groups' && t('header.groups')}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {!session.isGuest && (cloudSyncStatus === 'failed' || cloudSyncStatus === 'pending') && <button type="button" onClick={() => navigateTab('settings')} className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${cloudSyncStatus === 'failed' ? 'border-red-300 bg-red-50 text-red-700' : 'border-brand-border/50 bg-brand-bg text-brand-muted'}`} aria-label="ดูสถานะการบันทึกข้อมูล">
              <span className={`h-1.5 w-1.5 rounded-full ${cloudSyncStatus === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
              {cloudSyncStatus === 'failed' ? 'บันทึกไม่สำเร็จ' : 'กำลังโหลด'}
            </button>}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="group h-10 w-10 rounded-2xl bg-brand-white hover:bg-brand-faint text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border shadow-sm hover:shadow-md cursor-pointer lg:hidden"
              title={darkMode ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {darkMode ? (
                <Sun className="w-4.5 h-4.5 text-[#D98324] fill-[#D98324]/15 transition-transform group-hover:rotate-12" />
              ) : (
                <Moon className="w-4.5 h-4.5 text-[#6F4932] fill-[#6F4932]/10 transition-transform group-hover:-rotate-12" />
              )}
            </button>
          </div>
        </div>

        {/* Scrollable Container with responsive max widths */}
        {!session.isGuest && <FinanceWorkspacePicker account={session.user.id} groupId={financeGroupId} busy={switchingFinance} onChange={switchFinance}/>}
        <div id="main-content" role="main" inert={switchingFinance} className="app-content-panel flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 no-scrollbar bg-brand-bg text-brand-text w-full max-w-7xl mx-auto">
          <Suspense fallback={null}>
          <div key={`${financeOwner}:${activeTab}`} className={activeTab === 'invoice' ? undefined : 'app-tab-enter'}>
          {activeTab === 'dashboard' && (
            <section className="mb-4 flex items-center justify-end gap-3 lg:justify-between" aria-labelledby="dashboard-title">
              <div className="hidden lg:block">
                <h1 id="dashboard-title" className="text-3xl font-black tracking-tight text-brand-text">
                  ภาพรวมกระแสเงินสด
                </h1>
                <p className="mt-1 text-sm text-brand-muted">ยอดรับ รายจ่าย และเงินคงเหลือของเดือนที่เลือก</p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="dashboard-month" className="text-xs font-bold text-brand-muted">{t('header.monthPickerLabel')}</label>
                <select
                  id="dashboard-month"
                  value={selectedMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="min-w-[150px] cursor-pointer rounded-xl border border-brand-border bg-brand-white px-3 py-2 text-sm font-bold text-brand-text outline-none focus:border-[#E65F2B]"
                >
                  {availableMonthKeys.map(key => (
                    <option key={key} value={key}>
                      {formatMonthKey(key)} {key === currentMonthKey ? t('header.currentMonthSuffix') : ''}
                    </option>
                  ))}
                </select>
                {selectedMonthKey !== currentMonthKey && (
                  <button
                    onClick={() => setSelectedMonthKey(currentMonthKey)}
                    className="cursor-pointer rounded-xl px-3 py-2 text-xs font-bold text-[#E65F2B] hover:bg-[#E65F2B]/10"
                  >
                    {t('header.backToCurrent')}
                  </button>
                )}
              </div>
            </section>
          )}

          {!session.isGuest && loadedFinanceOwner!==financeOwner && !['groups','plans'].includes(activeTab) ? (
            <div role="status" className="rounded-3xl border border-brand-border bg-brand-white p-8 text-center">
              <p className="font-bold text-brand-text">{cloudSyncStatus==='failed' ? 'โหลดบัญชีการเงินไม่สำเร็จ' : 'กำลังโหลดบัญชีการเงิน…'}</p>
              {lastCloudError && <p role="alert" className="mt-3 text-sm text-red-600">{lastCloudError}</p>}
              {cloudSyncStatus==='failed' && <button className="mt-4 rounded-xl bg-brand-green-acc px-4 py-2 font-bold" onClick={()=>void loadCloudData(session.user.email)}>ลองโหลดอีกครั้ง</button>}
            </div>
          ) : <div>
              {activeTab === 'dashboard' && (
                <DashboardTab
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  expenses={expenses}
                  onUpdateSettings={handleUpdateSettings}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onOpenAddGoal={() => {
                    setInitialSelectedGoalId('ADD_NEW_GOAL');
                    navigateTab('split');
                  }}
                  onOpenGoalDetail={(id) => {
                    setInitialSelectedGoalId(id);
                    navigateTab('split');
                  }}
                  statuses={statuses}
                  selectedMonthKey={selectedMonthKey}
                  onEditJob={handleEditJob}
                  onViewJob={handleViewJob}
                  userEmail={session?.user?.email || 'user@example.com'}
                  notifSettings={notifSettings}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  onQuickRecord={(mode) => {
                    setRecordMode(mode);
                    navigateTab('jobs');
                  }}
                />
              )}

              {activeTab === 'jobs' && (
                <div className="space-y-6">
                  <section className="flex flex-col gap-4 rounded-3xl border border-brand-border bg-brand-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div>
                      <h1 className="text-2xl font-black tracking-tight text-brand-text">บันทึกรายรับ–รายจ่าย</h1>
                      <p className="mt-1 text-xs text-brand-muted">เลือกประเภทที่ต้องการ แล้วจัดการเฉพาะข้อมูลที่เกี่ยวข้อง</p>
                    </div>
                  <div className="relative flex w-full bg-brand-faint border border-brand-border/60 rounded-2xl p-1 sm:w-auto sm:min-w-[260px]">
                    <button
                      onClick={() => startTransition(() => setRecordMode('income'))}
                      className="relative flex-1 px-4 py-2.5 rounded-xl text-center cursor-pointer overflow-hidden"
                    >
                      {recordMode === 'income' && (
                        <motion.div
                          layoutId="record-mode-toggle"
                          className="absolute inset-0 bg-brand-white border border-brand-border rounded-xl shadow-sm"
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                      <span className={`relative z-10 text-xs font-black ${recordMode === 'income' ? 'text-brand-text' : 'text-brand-muted'}`}>
                        รายรับ
                      </span>
                    </button>
                    <button
                      onClick={() => startTransition(() => setRecordMode('expense'))}
                      className="relative flex-1 px-4 py-2.5 rounded-xl text-center cursor-pointer overflow-hidden"
                    >
                      {recordMode === 'expense' && (
                        <motion.div
                          layoutId="record-mode-toggle"
                          className="absolute inset-0 bg-brand-white border border-brand-border rounded-xl shadow-sm"
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                      <span className={`relative z-10 text-xs font-black ${recordMode === 'expense' ? 'text-brand-text' : 'text-brand-muted'}`}>
                        รายจ่าย
                      </span>
                    </button>
                  </div>
                  </section>

                  {recordMode === 'income' ? (
                    <JobsTab
                      jobs={jobs}
                      onAddJob={handleAddJob}
                      onEditJob={handleEditJob}
                      onDeleteJob={handleDeleteJob}
                      isAddJobOpen={isAddJobOpen}
                      onOpenAddJob={() => setIsAddJobOpen(true)}
                      onCloseAddJob={() => setIsAddJobOpen(false)}
                      statuses={statuses}
                      setStatuses={setStatuses}
                      jobTypes={jobTypes}
                      setJobTypes={setJobTypes}
                      triggerAlert={triggerAlert}
                      triggerConfirm={triggerConfirm}
                      triggerPrompt={triggerPrompt}
                      scrollToJobId={scrollToJobId}
                      onScrollToJobHandled={() => setScrollToJobId(null)}
                    />
                  ) : (
                    <ExpenseRecordView
                      expenses={expenses}
                      onAddExpense={handleAddExpense}
                      onEditExpense={handleEditExpense}
                      onDeleteExpense={handleDeleteExpense}
                      selectedMonth={selectedMonthKey}
                      triggerAlert={triggerAlert}
                      triggerConfirm={triggerConfirm}
                      autoOpenAdd={autoOpenAddExpense}
                      onAutoOpenAddHandled={() => setAutoOpenAddExpense(false)}
                      scrollToExpenseId={scrollToExpenseId}
                      onScrollToExpenseHandled={() => setScrollToExpenseId(null)}
                    />
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <SummaryTab
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  onEditJob={handleEditJob}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  expenses={expenses}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
                  onClearAllData={handleClearAllData}
                  statuses={statuses}
                  selectedMonth={selectedMonthKey}
                  onSelectMonth={setSelectedMonthKey}
                />
              )}

              {activeTab === 'timeline' && (
                <TimelineTab
                  jobs={jobs}
                  settings={settings}
                  statuses={statuses}
                  onEditJob={(jobId) => {
                    setScrollToJobId(jobId);
                    navigateTab('jobs');
                  }}
                  onDeleteJob={handleDeleteJob}
                />
              )}

              {activeTab === 'split' && (
                <SplitTab
                  jobs={jobs}
                  goals={goals}
                  expenses={expenses}
                  settings={settings}
                  onAddGoal={handleAddGoal}
                  onDeleteGoal={handleDeleteGoal}
                  onUpdateGoalProgress={handleUpdateGoalProgress}
                  onDeleteGoalTransaction={handleDeleteGoalTransaction}
                  onTransferBetweenGoals={handleTransferBetweenGoals}
                  onUpdateGoal={handleUpdateGoal}
                  onAllocateSavingsToGoal={handleAllocateSavingsToGoal}
                  onAllocateMultipleSavings={handleAllocateMultipleSavings}
                  onUpdateSettings={handleUpdateSettings}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
                  onClearAllData={handleClearAllData}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  initialSelectedGoalId={initialSelectedGoalId}
                  onClearInitialGoalId={() => setInitialSelectedGoalId(null)}
                  selectedMonthKey={selectedMonthKey}
                />
              )}

              {activeTab === 'tax' && (
                isPro ? (
                  <TaxTab
                    jobs={jobs}
                    expenses={expenses}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    triggerAlert={triggerAlert}
                    triggerConfirm={triggerConfirm}
                  />
                ) : (
                  <PremiumUpsell
                    feature={t('premium.taxFeature')}
                    description={t('premium.taxDesc')}
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {activeTab === 'invoice' && (
                isPro ? (
                  <InvoiceTab
                    key={financeOwner || 'guest'}
                    ownerId={session?.isGuest ? undefined : financeOwner}
                    jobs={jobs}
                    triggerAlert={triggerAlert}
                    triggerConfirm={triggerConfirm}
                  />
                ) : (
                  <div className="app-tab-enter">
                    <PremiumUpsell
                      feature={t('premium.invoiceFeature')}
                      description={t('premium.invoiceDesc')}
                      onUpgrade={handleUpgrade}
                    />
                  </div>
                )
              )}

              {activeTab === 'report' && (
                <MonthlyReportTab
                  jobs={jobs}
                  goals={goals}
                  expenses={expenses}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  userEmail={session?.user?.email || 'user@example.com'}
                  notifSettings={notifSettings}
                  onUpdateNotifSettings={setNotifSettings}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onViewJob={handleViewJob}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                />
              )}

              {activeTab === 'insight' && (
                isPro ? (
                  <InsightTab jobs={jobs} onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }} />
                ) : (
                  <PremiumUpsell
                    feature={t('premium.insightFeature')}
                    description={t('premium.insightDesc')}
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {activeTab === 'groups' && (
                <GroupsTab key={session.user.id} userId={session.user.id} isGuest={!!session.isGuest} triggerConfirm={triggerConfirm} />
              )}
              {activeTab === 'plans' && (
                <PlansTab
                  isPro={isPro}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  subscription={subscription}
                  onUpgrade={handleUpgrade}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  key={financeOwner}
                  isGroupFinance={!!financeGroupId}
                  settings={settings}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onUpdateSettings={handleUpdateSettings}
                  onImportData={handleImportData}
                  onClearAllData={handleClearAllData}
                  cloudSyncStatus={cloudSyncStatus}
                  loadCloudData={loadCloudData}
                  onOpenCloudModal={() => setIsCloudModalOpen(true)}
                  session={session}
                  onSignOut={handleSignOut}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  userAvatar={userAvatar}
                  onUpdateUserAvatar={handleUpdateUserAvatar}
                  onReplaySetupWizard={() => {
                    setIsSetupWizardPreview(true);
                  }}
                  subscription={subscription}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  notifSettings={notifSettings}
                  onUpdateNotifSettings={setNotifSettings}
                  isPro={isPro}
                />
              )}
            </div>}
          </div>
          </Suspense>
        </div>

        {/* Custom Dialog overlay */}
        <CustomDialog
          dialog={dialog}
          onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
        />

        {/* 🎉 Pro plan promo, shown once/day to non-Pro users */}
        <AnimatePresence>
          {isProPromoOpen && (
            <Suspense fallback={null}><ProPromoModal
              onUpgrade={() => {
                setIsProPromoOpen(false);
                handleUpgrade();
              }}
              onClose={() => setIsProPromoOpen(false)}
            /></Suspense>
          )}
        </AnimatePresence>

        {/* ☁️ Supabase Cloud Sync Setup Guide Modal */}
        <AnimatePresence>
          {isCloudModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="bg-brand-white rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-brand-border/40 dark:border-neutral-800 text-brand-text max-h-[85vh] overflow-y-auto no-scrollbar"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <h3 className="font-display font-extrabold text-base tracking-tight text-brand-text">
                        เปิดใช้งานระบบคลาวด์ซิงค์ (Cloud Sync)
                      </h3>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wide">
                        ซิงค์ข้อมูลระหว่างคอมและมือถืออัตโนมัติ
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCloudModalOpen(false)}
                    className="p-1 px-2.5 rounded-lg bg-brand-faint hover:bg-brand-border/40 text-brand-muted text-xs font-bold cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>

                <div className="space-y-4 text-xs leading-relaxed text-brand-muted dark:text-neutral-300 mt-4">
                  {lastCloudError && (
                    <div className="p-3.5 bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl flex flex-col gap-1.5 text-[11px] leading-relaxed select-text">
                      <div className="flex gap-1.5 items-center font-extrabold text-red-800 dark:text-red-300">
                        <span>Found Sync Error:</span>
                        <span>มีปัญหาในการซิงค์ข้อมูล</span>
                      </div>
                      <p className="font-mono bg-black/5 dark:bg-black/25 p-2 rounded-xl mt-0.5 text-[10px] break-all border border-red-500/10">
                        {lastCloudError}
                      </p>
                    </div>
                  )}

                  <p>
                    ยินดีต้อนรับสู่ระบบ <strong className="text-brand-text">กระรอกตุนเงิน Cloud Sync</strong>! ข้อมูลทั้งหมดของคุณจะถูกบันทึกและซิงค์อย่างปลอดภัยโดยอัตโนมัติบนระบบคลาวด์แบบ Realtime เพื่อให้คุณสามารถใช้งานแอปพลิเคชันจากหลายอุปกรณ์พร้อมกันได้ทันทีอย่างไร้รอยต่อ
                  </p>

                  <div className="bg-brand-faint p-4 rounded-2xl border border-brand-border/30 space-y-3">
                    <h4 className="font-extrabold text-brand-text flex items-center gap-1.5">
                      ความปลอดภัยและการเก็บข้อมูล:
                    </h4>
                    <ul className="list-disc list-inside space-y-1.5 pl-1 font-medium text-brand-muted dark:text-neutral-300">
                      <li><strong>แยกพื้นที่ข้อมูลส่วนบุคคล:</strong> มีระบบรักษาความปลอดภัยที่แข็งแกร่ง ป้องกันไม่ให้ผู้อื่นเข้าถึงข้อมูลของคุณได้อย่างเด็ดขาด</li>
                      <li><strong>ซิงค์อัตโนมัติในเบื้องหลัง:</strong> เมื่อมีการแก้ไขข้อมูลใดๆ ระบบจะทำการบันทึกลงสู่เซิร์ฟเวอร์แบบดีเลย์ (Debounced Save) ทันทีเพื่อประหยัดพลังงานอินเทอร์เน็ต</li>
                      <li><strong>รองรับโหมดออฟไลน์:</strong> ทำงานได้ดีแม้สัญญานอินเทอร์เน็ตขาดหาย และจะซิงค์ข้อมูลล่าสุดเมื่อกลับมาเชื่อมต่ออีกครั้ง</li>
                    </ul>
                  </div>

                </div>

                <div className="mt-5 pt-3 border-t border-brand-border/40 flex justify-end">
                  <button
                    onClick={() => setIsCloudModalOpen(false)}
                    className="py-2.5 px-6 bg-brand-primary text-brand-secondary rounded-2xl text-xs font-extrabold tracking-wide shadow-md hover:shadow-lg transition-all cursor-pointer border border-brand-secondary"
                  >
                    รับทราบและปิดหน้านี้
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {!financeGroupId && !!isLoadedForUser && (shouldShowSetupWizard || isSetupWizardPreview) && <Suspense fallback={null}><ProfileSetupWizard
          isOpen={true}
          settings={settings}
          onUpdateSettings={handleProfileSetupSettings}
          onAddGoal={handleAddGoal}
          onAddJobTypes={(types) => setJobTypes(prev => Array.from(new Set([...prev, ...types])))}
          isPreview={isSetupWizardPreview}
          onComplete={() => {
            setIsSetupWizardPreview(false);
          }}
          onDismiss={async () => {
            await handleProfileSetupSettings({ ...settings, profileSetupCompleted: true });
            setIsSetupWizardPreview(false);
          }}
        /></Suspense>}

        <MascotToast />
      </div>
    </div>
  );
}

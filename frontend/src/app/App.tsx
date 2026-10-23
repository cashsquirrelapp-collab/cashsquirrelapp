import { CardPaymentModal, PreparingCardModal } from '../features/billing/CardPaymentModal';
import { CARD_CONSENT_VERSION, type CardOptions } from '../../../shared/cardConsent';
import { PRO_PRICING, type ProPeriod } from '../../../shared/proPricing';
import PageHeader from '../components/ui/PageHeader';
import { uiPrimaryButton } from '../components/ui/uiStyles';
import { shrinkImageDataUrl } from '../services/images';
// The goals page's computer/iPad look; loaded here because unit tests import SplitTab and Node cannot load CSS.
import '../features/goals/goalsAmber.css';
import { AccountSwitcher } from '../components/account/AccountSwitcher';
import { NavGlyph } from '../components/ui/NavGlyph';
import { privateCache } from '../services/privateCache';
import { validateChanges, notificationPreferences } from '../../../shared/validation';
import { safeDocumentReturnPath } from '../../../shared/documentReturnPath';
import { hasFullFeatureAccess, isPhaseOneFeatureAvailable, resolvePhaseOneTab } from '../../../shared/featureAvailability';
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, lazy, Suspense, startTransition } from 'react';
import { Job, Goal, AppSettings, StatusOption, CustomDialogState, NotifSettings, Expense, GoalTransaction } from '../../../shared/types';
import { defaultSettings, defaultJobs, defaultGoals, buildSampleData } from '../sampleData';
import { getMonthKey, DEFAULT_JOB_TYPES, dateLocale, formatCurrency, isReminderDue, toLocalDateKey } from '../utils';
import DashboardTab from '../features/dashboard/DashboardTab';
import JobsTab from '../features/jobs/JobsTab';
import CalendarTab from '../features/calendar/CalendarTab';
import IncomeExpenseTab from '../features/incomeExpense/IncomeExpenseTab';

const loadFeedbackPage = () => import('../features/feedback/FeedbackPage');
const FeedbackPage = lazy(loadFeedbackPage);
const loadAssistantChat = () => import('../features/assistant/AssistantChat');
const AssistantChat = lazy(loadAssistantChat);
// เลขากระรอกติดตัว: the squirrel at the corner of every page for Pro accounts (owner, 2026-10-23).
const AssistantBuddy = lazy(() => import('../features/assistant/AssistantBuddy'));
// The squirrel's arrival: only right after a payment for Pro is confirmed (owner, 2026-10-23: "ขึ้นเฉพาะตอนที่เพิ่งเติมโปรเสร็จ").
const AssistantBirth = lazy(() => import('../features/assistant/AssistantBirth'));
const loadDashboardTab = () => import('../features/dashboard/DashboardTab');
const loadAdminDashboardTab = () => import('../features/groups/AdminDashboard');
const loadJobsTab = () => import('../features/jobs/JobsTab');
const loadSplitTab = () => import('../features/goals/SplitTab');
const loadTaxTab = () => import('../features/tax/TaxTab');
const loadSettingsTab = () => import('../features/settings/SettingsTab').then(module => ({ default: module.SettingsTab }));
const loadInvoiceTab = () => import('../features/invoices/InvoiceTab').then(module => ({ default: module.InvoiceTab }));
const loadPlansTab = () => import('../features/billing/PlansTab').then(module => ({ default: module.PlansTab }));
const loadGroupsTab = () => import('../features/groups/GroupsTab');
const loadReceivablesTab = () => import('../features/receivables/ReceivablesTab');
const loadVaultPage = () => import('../features/vault/VaultPage');
const loadWht50Page = () => import('../features/vault/Wht50Page');
const loadIncomeExpenseTab = () => import('../features/incomeExpense/IncomeExpenseTab');
const loadReportOverviewTab = () => import('../features/report/ReportTab');
const loadCalendarTab = () => import('../features/calendar/CalendarTab');
const ReceivablesTab = lazy(loadReceivablesTab);
const VaultPage = lazy(loadVaultPage);
const Wht50Page = lazy(loadWht50Page);
const LineDocumentsPage = lazy(() => import('../features/vault/LineDocumentsPage'));
const ReportOverviewTab = lazy(loadReportOverviewTab);
const AdminDashboardTab = lazy(loadAdminDashboardTab);
const SplitTab = lazy(loadSplitTab);
import CustomDialog from '../components/ui/CustomDialog';
import { AppShellSkeleton, ContentLoadingSkeleton } from '../components/ui/AppLoadingSkeleton';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { useDelayedLoader } from '../hooks/useDelayedLoader';
import Login from '../features/auth/Login';
import LandingPage from '../features/marketing/LandingPage';
import { MobileBottomNav, MobileHeader, MobileMenuPage, type MobileTool, type MobileToolGroup } from '../features/mobile/MobileChrome';
import { ADVANCED_MOBILE_TOOLS, MOBILE_MENU_SECTIONS, type MobileMenuSectionId } from '../features/mobile/mobileNavigation';
import { applyFields, carriesBatch, recentImports, undoUpdate } from '../features/import/importBatches';
import type { ImportCommit, ImportResult, SaveOutcome } from '../features/import/ImportWizard';
import type { SettingsView } from '../features/settings/SettingsTab';
import { KsIcon, type KsIconName } from '../features/mobile/icons';
import { useMobileLayout } from '../features/mobile/useMobileLayout';
import { hideSplash } from './splash';
import { isUpdateReady, reloadForUpdate, setUpdateGuard } from './appUpdate';
import { MobilePageHero } from '../features/mobile/MobilePageHero';
import { LineLogo } from '../components/ui/LineLogo';
const TaxTab = lazy(loadTaxTab);
const SettingsTab = lazy(loadSettingsTab);
const InvoiceTab = lazy(loadInvoiceTab);
const PlansTab = lazy(loadPlansTab);
const GroupsTab = lazy(loadGroupsTab);
import FinanceWorkspacePicker from '../features/groups/FinanceWorkspacePicker';
import { VaultProvider } from '../features/vault/VaultProvider';
import { financeKey, setFinanceWorkspace, assertFinanceWorkspace } from '../services/financeWorkspace';
import { groupApi } from '../services/groups';
import { usageAnalyticsApi } from '../services/usageAnalytics';
import { authClient } from '../services/auth';
import { apiFetch, apiJson } from '../services/api';
import { readCloud, saveCloud, saveAppCloud, clearCloud, exportCloud, flushCloud } from '../services/cloud';
import { useLanguage } from '../i18n/LanguageContext';
// Aliased: this file already has its own local `currentMonthKey` (a memoized string further
// down, computed from local machine time) -- importing the same name here would silently shadow
// it, and calling the shadowed string as a function is exactly the "Je is not a function" bug
// that made the LINE-notify balance figure fail (found via a decoded production sourcemap).
import { nowInBangkok } from '../../../shared/monthlySummary';
import { Mascot } from '../components/mascot/Mascot';
import { MascotToast } from '../components/mascot/MascotToast';
import { normalizeProfileSetupSettings } from '../features/onboarding/profileSetupState';
import { PremiumUpsell } from '../features/billing/PremiumUpsell';
import { DirectQrModal, type DirectQrPayment } from '../features/billing/DirectQrModal';
import { EmbeddedPaymentModal, type EmbeddedPayment } from '../features/billing/EmbeddedPaymentModal';
const ProPromoModal = lazy(() => import('../features/billing/ProPromoModal').then(module => ({ default: module.ProPromoModal })));
const ImportWizard = lazy(() => import('../features/import/ImportWizard').then(module => ({ default: module.ImportWizard })));
// Development only: the study of the landing reference's motion. Left out of production builds.
const MotionStudy = import.meta.env.DEV ? lazy(() => import('../features/marketing/landing/study/MotionStudy')) : null;
import { fireMascot } from '../mascotBus';
import { leafBus } from '../leafBus';
import { DashboardPeriodPicker } from '../features/dashboard/DashboardPeriodPicker';
import { BrandLockup } from '../components/brand/BrandLogo';
import type { GroupSummary, PublicProfile, SystemRole } from '../../../shared/groups';
import { applyGoalTransaction, applyGoalTransfer, hasLinkedGoalTransactions, undoGoalTransaction } from '../../../shared/goalLedger';

import { 
  Home, 
  LayoutDashboard,
  Settings,
  Briefcase, 
  Target,
  ShoppingBag,
  Sparkles,
  MoreHorizontal,
  Sun,
  Moon,
  LogOut,
  ArrowLeftRight,
  User,
  Users,
  TrendingUp,
  Menu,
  X,
  Cloud,
  Calculator,
  Database,
  Terminal,
  Check,
  Copy,
  ShieldAlert,
  Leaf,
  FileText,
  FolderOpen,
  FileCheck2,
  Smartphone,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Bell,
  Plus,
  Clock,
  Receipt,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { tr, T } from '../i18n/tr';
type TabKey = 'dashboard' | 'adminDashboard' | 'jobs' | 'tax' | 'split' | 'report' | 'settings' | 'invoice' | 'insight' | 'plans' | 'groups' | 'calendar' | 'receivables' | 'incomeExpense' | 'vault' | 'wht50' | 'feedback' | 'assistant';

type BillingStatus = 'free' | 'incomplete' | 'incomplete_expired' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
type StripeSubscriptionStatus = Exclude<BillingStatus, 'free'>;
type BillingSubscription = {
  status: BillingStatus;
  plan: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeStatus: StripeSubscriptionStatus | null;
  hasSubscription: boolean;
  customCardSubscription?: boolean;
  introEligible: boolean;
  managed: boolean;
  introPaidCycles: number;
};

const CHECKOUT_PENDING_OWNER_KEY = 'cashflow_checkout_pending_owner';

function checkoutPendingOwner(): string | null {
  try { return sessionStorage.getItem(CHECKOUT_PENDING_OWNER_KEY); }
  catch { return null; }
}

function markCheckoutPending(userId: string): void {
  try { sessionStorage.setItem(CHECKOUT_PENDING_OWNER_KEY, userId); }
  catch { /* The live effect still polls; only reload recovery is unavailable. */ }
}

function clearCheckoutPending(userId?: string): void {
  try {
    if (!userId || sessionStorage.getItem(CHECKOUT_PENDING_OWNER_KEY) === userId) {
      sessionStorage.removeItem(CHECKOUT_PENDING_OWNER_KEY);
    }
  } catch { /* Storage can be unavailable in a restricted browser context. */ }
}

function billingSubscription(data: any, introEligibleWhenMissing: boolean): BillingSubscription {
  return {
    status: data?.status || 'free',
    plan: data?.plan || null,
    currentPeriodEnd: data?.current_period_end || null,
    cancelAtPeriodEnd: data?.cancel_at_period_end === true,
    stripeStatus: data?.stripe_status || null,
    hasSubscription: data?.has_subscription === true,
    customCardSubscription: data?.custom_card_subscription === true,
    introEligible: data ? data.intro_eligible === true : introEligibleWhenMissing,
    managed: data?.managed === true,
    introPaidCycles: Number.isInteger(data?.intro_paid_cycles) ? data.intro_paid_cycles : 0,
  };
}

function isConfirmedCheckoutSubscription(subscription: BillingSubscription, now = Date.now()): boolean {
  return ['active', 'trialing'].includes(subscription.status)
    && !['admin_revoked', 'admin_removed'].includes(subscription.plan || '')
    && !!subscription.currentPeriodEnd
    && new Date(subscription.currentPeriodEnd).getTime() > now;
}

const TAB_KEYS: TabKey[] = ['dashboard', 'adminDashboard', 'jobs', 'tax', 'split', 'report', 'settings', 'invoice', 'insight', 'plans', 'groups', 'calendar', 'receivables', 'incomeExpense', 'vault', 'wht50', 'feedback', 'assistant'];
const ROOT_RESERVED_SLUGS = new Set(['login', 'app', 'privacy', 'terms', 'api', 'line-documents']);
// The ลูกค้า page was removed; its per-client numbers live in รายงาน › ลูกค้า (the insight alias).
const RETIRED_TAB_ALIASES: Record<string, TabKey> = { timeline: 'calendar', summary: 'incomeExpense', clients: 'insight' };

function isTabKey(value: string | undefined): value is TabKey {
  return !!value && TAB_KEYS.includes(value as TabKey);
}

function workspaceSlug(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function parseWorkspaceRoute(pathname: string): { tab: TabKey; workspaceSlug: string | null } {
  let segments: string[];
  try { segments = pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment)); }
  catch { segments = []; }
  if (segments[0] && RETIRED_TAB_ALIASES[segments[0]]) {
    return { tab: RETIRED_TAB_ALIASES[segments[0]], workspaceSlug: segments[1] ? workspaceSlug(segments[1]) || null : null };
  }
  if (segments.length >= 2 && isTabKey(segments[0])) {
    return { tab: segments[0], workspaceSlug: workspaceSlug(segments[1]) || null };
  }
  if (segments.length === 1 && isTabKey(segments[0])) return { tab: segments[0], workspaceSlug: null };
  if (segments.length === 1) {
    const slug = workspaceSlug(segments[0]);
    if (ROOT_RESERVED_SLUGS.has(slug)) return { tab: 'dashboard', workspaceSlug: null };
    return { tab: 'dashboard', workspaceSlug: slug || null };
  }
  return { tab: 'dashboard', workspaceSlug: null };
}

function workspaceRoutePath(tab: TabKey, slug: string): string {
  return `/${tab}/${encodeURIComponent(slug)}`;
}

// Set while a real (non-guest) session is open, so the next page load can show the app's skeleton
// before the session check finishes. Holds no account data; index.html reads it too.
const SIGNED_IN_HINT = 'cashflow_signed_in';
function hadSessionBefore(): boolean {
  try { return localStorage.getItem(SIGNED_IN_HINT) === '1'; } catch { return false; }
}

function personalWorkspaceSlug(profile: Pick<PublicProfile, 'displayName' | 'publicId' | 'userId'>): string {
  return workspaceSlug(profile.displayName) || workspaceSlug(profile.publicId) || 'account';
}

function groupWorkspaceSlug(group: GroupSummary, groups: GroupSummary[], personalSlug: string): string {
  const slug = workspaceSlug(group.name) || 'group';
  const duplicateName = groups.filter(candidate => workspaceSlug(candidate.name) === slug).length > 1;
  return slug === personalSlug || duplicateName
    ? `${slug}-${group.id.replace(/-/g, '').slice(0, 8).toLowerCase()}`
    : slug;
}

// Fetch a feature's code before navigation when the user shows intent to open it. Dynamic
// imports are cached by the browser, so React.lazy reuses the same download on selection.
const FEATURE_LOADERS: Partial<Record<TabKey, () => Promise<unknown>>> = {
  adminDashboard: loadAdminDashboardTab,
  jobs: loadJobsTab,
  groups: loadGroupsTab,
  split: loadSplitTab,
  report: loadReportOverviewTab,
  tax: loadTaxTab,
  invoice: loadInvoiceTab,
  plans: loadPlansTab,
  settings: loadSettingsTab,
  receivables: loadReceivablesTab,
  vault: loadVaultPage,
  wht50: loadWht50Page,
  calendar: loadCalendarTab,
  incomeExpense: loadIncomeExpenseTab,
  feedback: loadFeedbackPage,
  assistant: loadAssistantChat,
};
const prefetchFeature = (tab: TabKey) => { void FEATURE_LOADERS[tab]?.().catch(() => {}); };

// Core items stay visible at all times; "more" items are grouped under a
// collapsible section so first-time users see a simpler menu by default.
// This is the freelance-persona grouping -- also the fallback when no persona is set
// (existing accounts, or the setup wizard's persona step was skipped).
// label is a translation key (resolved via t() at render time), not display text -- this array
// is a module-level constant built once at load, before any component (and its language context)
// exists, so it can't call t() itself.
const NAV_ITEMS: { key: TabKey; labelKey: string; icon: React.ComponentType<{ className?: string }>; group: 'core' | 'more' | 'bottom' | 'sub'; parent?: TabKey }[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: Home, group: 'core' },
  { key: 'adminDashboard', labelKey: 'nav.adminDashboard', icon: LayoutDashboard, group: 'core' },
  { key: 'jobs', labelKey: 'nav.jobs', icon: Briefcase, group: 'core' },
  { key: 'calendar', labelKey: 'nav.calendar', icon: CalendarDays, group: 'core' },
  // Money still owed follows the payment calendar, so it opens as a sub-item under ปฏิทิน.
  { key: 'receivables', labelKey: 'nav.receivables', icon: Clock, group: 'sub', parent: 'calendar' },
  // Recording an expense is a primary action, so รายจ่าย is always in the main row.
  { key: 'incomeExpense', labelKey: 'nav.incomeExpense', icon: Receipt, group: 'core' },
  { key: 'split', labelKey: 'nav.split', icon: Target, group: 'more' },
  { key: 'report', labelKey: 'nav.report', icon: TrendingUp, group: 'more' },
  { key: 'tax', labelKey: 'nav.tax', icon: Calculator, group: 'more' },
  { key: 'invoice', labelKey: 'nav.invoice', icon: FileText, group: 'more' },
  // Kept files (50 ทวิ, contracts / POs) open as a sub-item under เอกสาร.
  { key: 'vault', labelKey: 'nav.vault', icon: FolderOpen, group: 'sub', parent: 'invoice' },
  { key: 'wht50', labelKey: 'nav.wht50', icon: FileCheck2, group: 'sub', parent: 'invoice' },
  { key: 'groups', labelKey: 'nav.groups', icon: Users, group: 'more' },
  // เลขากระรอก, the chat assistant (owner, 2026-10-23): a Pro screen preview, open to every member since pkg41.
  { key: 'assistant', labelKey: 'nav.assistant', icon: Sparkles, group: 'core' },
  { key: 'feedback', labelKey: 'nav.feedback', icon: MessageSquare, group: 'core' },
  { key: 'plans', labelKey: 'nav.plans', icon: ShoppingBag, group: 'bottom' },
  { key: 'settings', labelKey: 'nav.settings', icon: Settings, group: 'bottom' },
];

// Every feature stays reachable regardless of persona -- these lists only decide which
// tabs default to the always-visible "core" row vs the collapsible "more" section.
// dashboard/jobs/settings/plans aren't listed because they're always core/bottom
// (handled separately below) for every persona.
const PERSONA_CORE_KEYS: Record<'school' | 'university' | 'employee', TabKey[]> = {
  school: ['split'],
  university: ['split', 'incomeExpense'],
  employee: ['split', 'incomeExpense'],
};

const cleanStatuses = (arr: any[]): StatusOption[] => {
  if (!Array.isArray(arr)) return [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'installment', label: 'แบ่งชำระเป็นงวด', behavior: 'partial' },
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
  cleaned = cleaned.filter(s => {
    if (!s.id || !s.label) return false;
    const key = s.label.toLowerCase().trim().replace(/\s+/g, '');
    if (seenIds.has(s.id) || seenLabels.has(key)) {
      return false;
    }
    seenIds.add(s.id);
    seenLabels.add(key);
    return true;
  });
  if (!cleaned.some((status) => status.id === 'installment')) {
    cleaned.splice(Math.min(2, cleaned.length), 0, { id: 'installment', label: 'แบ่งชำระเป็นงวด', behavior: 'partial' });
  }
  return cleaned;
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

// Phones: tool pages that draw their own terracotta header (it holds their summary box), and the
// names the header shows where the sidebar's label is not the one the phone menu uses.
const PHONE_OWN_HEADER: string[] = ['incomeExpense', 'receivables', 'split', 'wht50', 'settings', 'adminDashboard'];
const PHONE_PAGE_TITLES: Partial<Record<string, string>> = { plans: T("แพ็กเกจ Pro"), receivables: T("เงินรอรับ") };

export default function App() {
  const { t, language, toggleLanguage } = useLanguage();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const navigatePath = (path: string, replace = false, preserveSearch = false) => {
    const search = preserveSearch ? window.location.search : '';
    const nextUrl = `${path}${search}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== nextUrl) window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    setPathname(path);
  };
  useEffect(() => {
    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener('cash-squirrel:navigate', syncPath);
    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener('cash-squirrel:navigate', syncPath);
    };
  }, []);

  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [routeContext, setRouteContext] = useState<{
    userId: string;
    profile: PublicProfile;
    groups: GroupSummary[];
    groupsLoaded: boolean;
    systemRole: SystemRole | null;
  } | null>(null);
  const fullFeatureAccess = hasFullFeatureAccess({
    isGuest: session?.isGuest,
    userId: session?.user?.id,
    roleUserId: routeContext?.userId,
    systemRole: routeContext?.systemRole,
  });
  // Features released to everyone are read from the launch policy one by one; fullFeatureAccess still
  // covers what is not released yet (goals, reports, tax, vault, 50 ทวิ, teams).
  const receivablesAccess = isPhaseOneFeatureAvailable('receivables', fullFeatureAccess);
  const quotationAccess = isPhaseOneFeatureAvailable('quotation', fullFeatureAccess);
  const notificationsAccess = isPhaseOneFeatureAvailable('notifications', fullFeatureAccess);

  // Resolve deep links before the first render so Suspense and cloud-loading
  // placeholders match the requested page instead of flashing the dashboard.
  const [requestedActiveTab, setActiveTab] = useState<TabKey>(() => parseWorkspaceRoute(window.location.pathname).tab);
  // Render the safe tab immediately; async role lookup can never flash a hidden page.
  const activeTab: TabKey = resolvePhaseOneTab(requestedActiveTab, fullFeatureAccess);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // The settings page a phone-menu entry asked for; `n` remounts the page when asked again.
  const [settingsEntry, setSettingsEntry] = useState<{ view: SettingsView; n: number }>({ view: 'home', n: 0 });
  // Once the settings page is left, the next visit opens on its overview again. Only on leaving: the
  // tab switch runs in a transition, so the page asked for is not yet the active one when the entry is set.
  const lastTabRef = React.useRef(activeTab);
  useEffect(() => {
    if (lastTabRef.current === 'settings' && activeTab !== 'settings') setSettingsEntry(entry => (entry.view === 'home' ? entry : { ...entry, view: 'home' }));
    lastTabRef.current = activeTab;
  }, [activeTab]);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  // Switching between accounts signed in on this browser (owner, 2026-10-21). Adding one shows the
  // sign-in page while the current account stays signed in; the page reloads once the new one is in.
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [addingAccount, setAddingAccount] = useState<{ email?: string; from: string } | null>(null);
  // The account corner lives in the desktop sidebar and in the floating top bar on smaller screens;
  // only one is rendered so there is a single profile menu and workspace picker on the page.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  // Phones only get the mobile design; tablets and computers keep the layout they always had.
  const isPhone = useMobileLayout();
  const openPhoneMenu = React.useCallback(() => setIsMobileMenuOpen(true), []);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  // Only very wide screens leave room for the docked เลขากระรอก panel beside the page (the page keeps 1,000px+, as
  // its tables need at these widths). Narrower computers get the panel as a side sheet over a dimmed page.
  const [isWideForPanel, setIsWideForPanel] = useState(() => window.matchMedia('(min-width: 1720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1720px)');
    const update = () => setIsWideForPanel(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // เลขากระรอก on computers (owner, 2026-10-23, option ข.): the app's sidebar folds away so only the chat's
  // own history sidebar is on screen, and "กลับ" returns to the page the person came from.
  const chatFocus = activeTab === 'assistant' && isDesktop;
  const chatReturnTab = React.useRef<TabKey>('dashboard');
  useEffect(() => { if (activeTab !== 'assistant') chatReturnTab.current = activeTab; }, [activeTab]);

  const navigateTab = (requestedTab: TabKey) => {
    const tab: TabKey = resolvePhaseOneTab(requestedTab, fullFeatureAccess);
    const workspace = parseWorkspaceRoute(window.location.pathname).workspaceSlug;
    // A newer build is out (app/appUpdate.ts): open the next page in it, as a normal page load, so the
    // new features arrive without an error page; the person stays signed in (owner, 2026-10-22).
    if (workspace && isUpdateReady() && reloadForUpdate(workspaceRoutePath(tab, workspace))) return;
    prefetchFeature(tab);
    startTransition(() => setActiveTab(tab));
    if (workspace) navigatePath(workspaceRoutePath(tab, workspace));
  };
  // Old links to the vault (/invoice?area=vault) open its own page now.
  useEffect(() => {
    if (!fullFeatureAccess || activeTab !== 'invoice' || new URLSearchParams(window.location.search).get('area') !== 'vault') return;
    const workspace = parseWorkspaceRoute(window.location.pathname).workspaceSlug;
    if (!workspace) return; // wait until the address carries the workspace
    window.history.replaceState(window.history.state, '', window.location.pathname);
    navigateTab('vault');
  }, [activeTab, pathname, fullFeatureAccess]); // eslint-disable-line react-hooks/exhaustive-deps
  // Old links to the 50 ทวิ tab on the tax page (/tax?view=wht50) open its page under เอกสาร.
  useEffect(() => {
    if (!fullFeatureAccess || activeTab !== 'tax' || new URLSearchParams(window.location.search).get('view') !== 'wht50') return;
    const workspace = parseWorkspaceRoute(window.location.pathname).workspaceSlug;
    if (!workspace) return;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    navigateTab('wht50');
  }, [activeTab, pathname, fullFeatureAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const profileMenuItem = 'flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2.5 text-left text-[13px] font-medium text-brand-text transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07] cursor-pointer';
  // The phone's "เมนู" screen: five numbered sections and, for admins, one group of tools not released to
  // everyone yet (layout in features/mobile/mobileNavigation.ts). An entry appears only when the launch
  // policy lets this account open it (`has`, the same list the sidebar uses); what is not open yet in
  // a section shows "เร็ว ๆ นี้" instead of a link.
  const renderMobileMenu = () => {
    const has = (key: TabKey) => navItems.some(item => item.key === key);
    const go = (tab: TabKey, before?: () => void) => () => { before?.(); setIsMobileMenuOpen(false); navigateTab(tab); };
    const openSettings = (view: SettingsView) => go('settings', () => setSettingsEntry(entry => ({ view, n: entry.n + 1 })));
    const tool = (key: TabKey, title: string, description: string, icon: KsIconName, search = '', before?: () => void, id: string = key): MobileTool[] =>
      has(key) ? [{ key: id, title, description, icon, search, onOpen: go(key, before) }] : [];
    const soon = (key: string, title: string, description: string, icon: KsIconName, search = ''): MobileTool => ({ key, title, description, icon, search, soon: true, onOpen: () => {} });
    const hasPro = isPaidActive || isInFreeTrial;
    const plan = isGuestProPreview ? t('plans.guestPreviewBadge') : isPaidActive ? 'PRO' : isInFreeTrial ? t('plans.freeTrialBadge') : 'FREE';
    const lineLinked = Boolean(notifSettings.lineUserId);
    const lineAvailable = isPhaseOneFeatureAvailable('line', fullFeatureAccess) && has('settings');
    const notificationsAvailable = notificationsAccess;
    const hasOldNotifications = !session?.isGuest && !financeGroupId && Boolean(notifSettings.lineUserId || notifSettings.monthlyReportEnabled || notifSettings.dailyDigestEnabled || notifSettings.wht50ReminderEnabled);
    const entries: Record<MobileMenuSectionId, MobileTool[]> = {
      // Off the bottom bar since 2026-10-20 (owner), so it leads the menu; the page itself is unchanged.
      receivables: tool('receivables', tr("เงินรอรับ"), tr("ยอดตามวันครบกำหนด ยอดค้างจากเดือนก่อน และเตือนตามเงิน"), 'wallet', "รอรับ ค้างรับ ตามเงิน เตือน ลูกหนี้"),
      expenses: tool('incomeExpense', tr("รายจ่าย"), tr("บันทึกและดูรายการรายจ่าย"), 'expense', "ค่าใช้จ่าย บันทึก รายรับ รายการประจำ"),
      documents: tool('invoice', tr("เอกสาร"), quotationAccess ? tr("ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี") : tr("ใบแจ้งหนี้ ใบเสร็จ และใบกำกับภาษี"), 'document', "invoice quotation receipt pdf ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี ดาวน์โหลด"),
      // The package page, as in the desktop sidebar (owner, 2026-10-20: upgrading was only on computers
      // and iPads), then LINE, which needs Pro (or the Pro trial) and a linked account.
      line: [
        // เลขากระรอก wears the squirrel itself, like LINE wears its logo.
        ...tool('assistant', tr("เลขากระรอก"), tr("นักบัญชีส่วนตัวในแชท · ตัวอย่างหน้าจอ"), 'chat', "ai แชท ผู้ช่วย กระรอก bot เลขา นักบัญชี").map(item => ({ ...item, mark: (
          <span className="grid h-[30px] w-[30px] place-items-center overflow-hidden rounded-[8px] bg-[#FFF1E8] dark:bg-[#E65F2B]/15" aria-hidden="true"><Mascot mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
        ) })),
        ...tool('plans', tr("แพ็กเกจ Pro"), hasPro ? tr("สถานะ การต่ออายุ และการชำระเงิน") : tr("ดูราคาและอัปเกรดเป็น Pro"), 'shield', "Pro สมัคร อัปเกรด ชำระเงิน แพ็กเกจ ราคา").map(item => ({ ...item, value: plan })),
        lineAvailable
          ? { key: 'line', title: tr("เชื่อมต่อ LINE"), description: tr("ผู้ช่วยการเงินผ่าน LINE"), icon: 'chat', mark: <LineLogo size={30} />, search: "line ไลน์ ผู้ช่วย ai", value: !hasPro ? tr("ต้องใช้ Pro") : lineLinked ? tr("เชื่อมต่อแล้ว") : tr("ยังไม่เชื่อมต่อ"), onOpen: openSettings('line') }
          : { ...soon('line', tr("เชื่อมต่อ LINE"), tr("ผู้ช่วยการเงินผ่าน LINE"), 'chat', "line ไลน์ ผู้ช่วย ai"), mark: <LineLogo size={30} /> },
        // Reminders are Pro too (owner, 2026-10-21): the monthly summary, credit-term and 50 ทวิ jobs only
        // send to Pro accounts, the trial and admin grants, so they sit with the package and LINE.
        notificationsAvailable && has('settings')
          ? { key: 'notif', title: tr("การแจ้งเตือน"), description: fullFeatureAccess ? tr("สรุปรายเดือน เตือนครบกำหนดรับเงิน และใบ 50 ทวิ") : tr("สรุปรายเดือน และเตือนครบกำหนดรับเงิน"), icon: 'bell', search: "แจ้งเตือน เตือน สรุป เครดิตเทอม", value: hasPro ? undefined : tr("ต้องใช้ Pro"), onOpen: openSettings('notif') }
          : hasOldNotifications && has('settings')
            ? { key: 'notif', title: tr("จัดการการแจ้งเตือนเดิม"), description: tr("ปิดการแจ้งเตือนหรือช่องทางที่เคยเปิดไว้"), icon: 'bell', search: "แจ้งเตือน เตือน", onOpen: openSettings('notif') }
            : soon('notif', tr("การแจ้งเตือน"), fullFeatureAccess ? tr("สรุปรายเดือน เตือนครบกำหนดรับเงิน และใบ 50 ทวิ") : tr("สรุปรายเดือน และเตือนครบกำหนดรับเงิน"), 'bell', "แจ้งเตือน เตือน"),
      ],
      account: [
        ...(has('settings') ? [{ key: 'profile', title: tr("โปรไฟล์"), description: tr("ชื่อ รูป และข้อมูลบัญชี"), icon: 'users' as const, search: "ชื่อ รูปโปรไฟล์ อีเมล", onOpen: openSettings('profile') }] : []),
        { key: 'theme', title: tr("โหมดสว่างและมืด"), description: '', icon: darkMode ? 'moon' : 'sun', search: "มืด สว่าง ธีม dark", value: darkMode ? tr("มืด") : tr("สว่าง"), onOpen: () => setDarkMode(!darkMode) },
        { key: 'language', title: tr("ภาษา"), description: '', icon: 'globe', search: "ภาษา language english ไทย", value: language === 'th' ? tr("ไทย") : 'English', onOpen: toggleLanguage },
        ...tool('settings', tr("ตั้งค่าทั้งหมด"), tr("ผู้ออกเอกสาร สำรองข้อมูล และอื่น ๆ"), 'settings', "นำเข้า เป้ารายรับ สำรอง ผู้ออกเอกสาร"),
        ...tool('feedback', tr("บอกเรา"), tr("แจ้งปัญหา เสนอไอเดีย หรือคุยกับทีม"), 'chat', "feedback ข้อเสนอแนะ ติดต่อ แจ้งปัญหา ไอเดีย"),
        { key: 'logout', title: tr("ออกจากระบบ"), description: '', icon: 'logout', search: 'logout ออก', onOpen: () => {
          setIsMobileMenuOpen(false);
          triggerConfirm(tr("ออกจากระบบ"), tr("คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?"), async () => { await handleSignOut(); });
        } },
      ],
    };
    const advanced = ADVANCED_MOBILE_TOOLS.flatMap(item => tool(item.key, tr(item.title), tr(item.description), item.icon, item.search));
    const groups: MobileToolGroup[] = [
      // LINE AI Pro wears the LINE logo (owner, 2026-10-21); the logo keeps its official colours.
      ...MOBILE_MENU_SECTIONS.map(section => ({ ...section, name: tr(section.name), sub: tr(section.sub), items: entries[section.id], mark: section.id === 'line' ? <LineLogo size={36} /> : undefined })),
      { id: 'advanced', name: tr("เครื่องมือขั้นสูง"), sub: tr("เฉพาะผู้ดูแล · ยังไม่เปิดให้ผู้ใช้ทั่วไป"), icon: 'grid' as const, items: advanced },
    ].filter(group => group.items.length > 0);
    const name = routeContext?.profile.displayName || session?.user?.email?.split('@')[0] || tr("บัญชีของฉัน");
    return (
      <MobileMenuPage
        groups={groups}
        // Signed-in accounts: the profile box opens the account sheet (switch, add, profile, sign out), owner 2026-10-23.
        account={session && !session.isGuest
          ? { name, detail: tr("สลับบัญชีและออกจากระบบ"), plan, avatarUrl: userAvatar || undefined, onOpen: () => setAccountSwitcherOpen(true) }
          : { name, detail: tr("โปรไฟล์ของฉัน"), plan, avatarUrl: userAvatar || undefined, onOpen: has('settings') ? openSettings('profile') : go('dashboard') }}
        workspace={fullFeatureAccess && session && !session.isGuest ? <FinanceWorkspacePicker account={session.user.id} groupId={financeGroupId} busy={switchingFinance} onChange={switchFinance}/> : undefined}
      />
    );
  };

  const renderProfileMenu = (position: string) => (
    <AnimatePresence>
      {isProfileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className={`lg-glass is-menu absolute ${position} z-[120] overflow-hidden rounded-[22px] p-1.5`}
        >

          {/* Who is signed in, and on which plan */}
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-faint text-brand-muted">
              {userAvatar ? <img src={userAvatar} className="h-full w-full object-cover" alt="" /> : <User className="h-4.5 w-4.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-brand-text">{routeContext?.profile.displayName || session?.user?.email?.split('@')[0] || tr("บัญชีผู้ใช้")}</span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${isPaidActive || isGuestProPreview ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'bg-brand-faint text-brand-muted'}`}>
                  {isGuestProPreview ? t('plans.guestPreviewBadge') : isPaidActive ? 'PRO' : isInFreeTrial ? t('plans.freeTrialBadge') : 'FREE'}
                </span>
              </span>
            </span>
          </div>
          <div className="border-t border-brand-border pt-1.5">
            {session && !session.isGuest && (
              <button type="button" onClick={() => { setIsProfileMenuOpen(false); setAccountSwitcherOpen(true); }} className={profileMenuItem}>
                <ArrowLeftRight className="h-4 w-4 text-brand-muted" />{tr("สลับบัญชี")}</button>
            )}
            <button type="button" onClick={() => { setIsProfileMenuOpen(false); navigateTab('plans'); }} className={profileMenuItem}>
              <ShoppingBag className="h-4 w-4 text-brand-muted" />{fullFeatureAccess ? tr("อัปเกรด") : tr("จัดการการสมัครสมาชิก")}
            </button>
            <button type="button" onClick={() => { setIsProfileMenuOpen(false); navigateTab('settings'); }} className={profileMenuItem}>
              <Settings className="h-4 w-4 text-brand-muted" />{tr("ตั้งค่า")}</button>
            <button type="button" role="switch" aria-checked={darkMode} onClick={() => setDarkMode(!darkMode)} className={profileMenuItem}>
              <Moon className="h-4 w-4 text-brand-muted" />
              <span className="flex-1">{tr("โหมดมืด")}</span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${darkMode ? 'bg-[#E65F2B]' : 'bg-[#D9D4CE] dark:bg-[#3A3B40]'}`}>
                <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${darkMode ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
          </div>
          <div className="mt-1.5 border-t border-brand-border pt-1.5">
            <button type="button" onClick={() => { setIsProfileMenuOpen(false); triggerConfirm(tr("ออกจากระบบ"), tr("คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?"), async () => { await handleSignOut(); }); }}
              className={`${profileMenuItem} !text-[#C43A3A] hover:!bg-[#FDEEEE] dark:!text-[#F19A9A] dark:hover:!bg-[#F19A9A]/10`}>
              <LogOut className="h-4 w-4" />{tr("ออกจากระบบ")}</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderNavButton = (item: typeof NAV_ITEMS[number], closeMobileOnClick: boolean, subsOpen?: boolean) => {
    const Icon = item.icon;
    const firstPathSegment = pathname.split('/').filter(Boolean)[0];
    const routeHasExplicitTab = isTabKey(firstPathSegment) || !!(firstPathSegment && RETIRED_TAB_ALIASES[firstPathSegment]);
    const navActiveTab = resolvePhaseOneTab(routeHasExplicitTab ? parseWorkspaceRoute(pathname).tab : activeTab, fullFeatureAccess);
    const isActive = navActiveTab === item.key;
    return (
      <button
        key={item.key}
        aria-current={isActive ? 'page' : undefined}
        onPointerEnter={() => prefetchFeature(item.key)}
        onFocus={() => prefetchFeature(item.key)}
        onTouchStart={() => prefetchFeature(item.key)}
        onClick={() => {
          navigateTab(item.key);
          if (closeMobileOnClick) setIsMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 rounded-full font-semibold transition-all cursor-pointer ${item.group === 'sub' ? 'px-3 py-2 text-[12.5px]' : 'px-3 py-2.5 text-[13px]'} ${
          isActive
            ? 'bg-[var(--glass-active)] text-[#C24A16] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] [--nav-glyph-cut:#FBE6DB] dark:text-[#FFA473] dark:shadow-none dark:[--nav-glyph-cut:#3B2B23] font-bold'
            : 'text-brand-muted hover:bg-black/[0.04] hover:text-brand-text dark:hover:bg-white/[0.06]'
        }`}
      >
        <span className="inline-flex shrink-0">
          <NavGlyph tab={item.key} active={isActive} outline={Icon} className={item.group === 'sub' ? 'w-4 h-4' : 'w-[19px] h-[19px]'} />
        </span>
        <span>{item.key === 'feedback' ? (language === 'th' ? 'บอกเรา' : 'Tell us') : item.key === 'plans' && !fullFeatureAccess ? (language === 'th' ? 'การสมัครสมาชิก' : 'Subscription') : t(item.labelKey)}</span>
        {subsOpen !== undefined && (
          <ChevronDown aria-hidden className={`ml-auto h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${subsOpen ? 'rotate-180' : ''}`} />
        )}
        {item.key === 'groups' && teamIsPreview && (
          <span className="ml-auto rounded-full bg-[#FFF1E8] px-1.5 py-px text-[10px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]">{tr("เร็วๆ นี้")}</span>
        )}
      </button>
    );
  };

  // Core items, each followed by its sub-items. Sub-items appear (indented on a guide line)
  // only while their parent or one of them is the open page.
  const renderNavGroup = (group: 'core' | 'more', closeMobileOnClick: boolean) => navItems.filter(item => item.group === group).map(item => {
    const subs = navItems.filter(sub => sub.group === 'sub' && sub.parent === item.key);
    if (!subs.length) return renderNavButton(item, closeMobileOnClick);
    const open = activeTab === item.key || subs.some(sub => sub.key === activeTab);
    return (
      <React.Fragment key={item.key}>
        {renderNavButton(item, closeMobileOnClick, open)}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="ml-[21px] mt-1 space-y-1 border-l border-brand-border pl-2">
                {subs.map(sub => renderNavButton(sub, closeMobileOnClick))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </React.Fragment>
    );
  });



  // Authentication State
  const lastTrackedUsageRef = useRef('');
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || session?.isGuest || loadingSession) return;

    let inFlight = false;
    const heartbeat = () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      void usageAnalyticsApi.presenceHeartbeat(userId)
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 20_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadingSession, session?.isGuest, session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || session?.isGuest || loadingSession) {
      lastTrackedUsageRef.current = '';
      return;
    }
    const isWorkspaceRoot = pathname === '/' || pathname === '/app' || pathname === '/login';
    const tab = resolvePhaseOneTab(isWorkspaceRoot ? activeTab : parseWorkspaceRoute(pathname).tab, fullFeatureAccess);
    // The usage counters only know the original pages; the chat preview is not counted.
    if (tab === 'feedback' || tab === 'assistant') return;
    // The vault is counted as part of เอกสาร (the usage counters only know the original pages).
    const feature = tab === 'vault' || tab === 'wht50' ? 'invoice' : tab;
    const viewKey = `${userId}:${feature}`;
    // React StrictMode replays effects in development; count a tab transition only once.
    if (lastTrackedUsageRef.current === viewKey) return;
    lastTrackedUsageRef.current = viewKey;
    void usageAnalyticsApi.recordFeatureView(userId, feature).catch(() => {
      // Usage metrics are optional and must never delay or interrupt navigation.
    });
  }, [activeTab, loadingSession, pathname, session?.isGuest, session?.user?.id, fullFeatureAccess]);
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
  // Skip full-page loaders for fast operations. Keep auth loading steady, while workspace
  // switches can finish as soon as their data is ready without an extra long hold.
  const showSessionLoader = useDelayedLoader(loadingSession);
  useEffect(() => {
    if (loadingSession) return;
    try {
      if (session && !session.isGuest) localStorage.setItem(SIGNED_IN_HINT, '1');
      else localStorage.removeItem(SIGNED_IN_HINT);
    } catch { /* storage blocked: no hint, the plain loader shows */ }
  }, [loadingSession, session]);
  const showFinanceSwitchLoader = useDelayedLoader(switchingFinance, { minVisible: 120 });

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const profile = (event as CustomEvent<PublicProfile>).detail;
      if (!profile || !routeContext || routeContext.userId !== profile.userId) return;
      const next = { ...routeContext, profile };
      setRouteContext(next);
      const personalSlug = personalWorkspaceSlug(profile);
      const selectedGroup = financeGroupId ? routeContext.groups.find(group => group.id === financeGroupId) : undefined;
      const slug = selectedGroup ? groupWorkspaceSlug(selectedGroup, routeContext.groups, personalSlug) : personalSlug;
      navigatePath(workspaceRoutePath(activeTab, slug), true, true);
    };
    const onGroupRenamed = (event: Event) => {
      const detail = (event as CustomEvent<{ groupId: string; name: string }>).detail;
      if (!detail?.groupId || !detail.name || !routeContext || routeContext.userId !== session?.user?.id) return;
      const groups = routeContext.groups.map(group => group.id === detail.groupId ? { ...group, name: detail.name } : group);
      setRouteContext({ ...routeContext, groups });
      if (financeGroupId) {
        const selectedGroup = groups.find(group => group.id === financeGroupId);
        if (selectedGroup) {
          const personalSlug = personalWorkspaceSlug(routeContext.profile);
          navigatePath(workspaceRoutePath(activeTab, groupWorkspaceSlug(selectedGroup, groups, personalSlug)), true, true);
        }
      }
    };
    const onGroupsChanged = () => {
      const userId = session?.user?.id;
      if (!userId || session?.isGuest) return;
      const controller = new AbortController();
      void (async () => {
        try {
          const first = await groupApi.snapshot(userId, 'mine', 0, controller.signal);
          const groups = first.groups.filter(group => !!group.myRole);
          for (let page = 1; page < Math.min(10, Math.ceil(first.total / 20)); page++) {
            const result = await groupApi.snapshot(userId, 'mine', page, controller.signal);
            groups.push(...result.groups.filter(group => !!group.myRole));
          }
          if (controller.signal.aborted) return;
          setRouteContext(current => {
            if (!current || current.userId !== userId) return current;
            return {
              userId: current.userId,
              profile: current.profile,
              groups,
              groupsLoaded: true,
              systemRole: first.systemRole,
            };
          });
        } catch {
          // Keep the last known group routes if refresh fails; the normal picker reports its own errors.
        }
      })();
    };
    window.addEventListener('cash-squirrel:profile-updated', onProfileUpdated);
    window.addEventListener('cash-squirrel:group-renamed', onGroupRenamed);
    window.addEventListener('cash-squirrel:groups-changed', onGroupsChanged);
    return () => {
      window.removeEventListener('cash-squirrel:profile-updated', onProfileUpdated);
      window.removeEventListener('cash-squirrel:group-renamed', onGroupRenamed);
      window.removeEventListener('cash-squirrel:groups-changed', onGroupsChanged);
    };
  }, [activeTab, financeGroupId, routeContext, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id || (!session.isGuest && loadedFinanceOwner !== financeOwner)) return;
    // Warm only the primary routes after the account is usable. Loading every feature at once
    // competes with the first dashboard render, especially on slower phones.
    const timer = window.setTimeout(() => {
      for (const tab of ['jobs', 'calendar', 'groups'] as const) {
        prefetchFeature(tab);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [session?.user?.id, session?.isGuest, loadedFinanceOwner, financeOwner]);

  useEffect(() => {
    if (session?.user?.id) void loadDashboardTab().catch(() => {});
  }, [session?.user?.id]);

  useEffect(() => {
    if (addingAccount && session?.user?.id && !session.isGuest && session.user.id !== addingAccount.from) window.location.assign('/');
  }, [addingAccount, session?.user?.id, session?.isGuest]);

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
    // A private document link must show sign-in instead of silently restoring a previous
    // demo session. Keep the original URL so OAuth returns to the requested document.
    const savedGuestSession = () => safeDocumentReturnPath(`${window.location.pathname}${window.location.search}`)
      ? null : localStorage.getItem('cashflow_guest_session');
    let sessionAttempts = 0;
    const checkSession = async () => {
      let retrying = false;
      try {
        const { data: { session }, error } = await authClient.auth.getSession();
        // The server did not answer (a deploy switching over, a slow network): someone who was signed
        // in here is not sent to the sign-in page; keep the loading screen and ask again shortly.
        if (!session && error && hadSessionBefore() && sessionAttempts < 10) {
          sessionAttempts += 1;
          retrying = true;
          window.setTimeout(() => { void checkSession(); }, 2000);
          return;
        }
        if (session) {
          localStorage.removeItem('cashflow_guest_session');
          setSession(session);
        } else {
          const sg = savedGuestSession();
          if (sg) {
            setSession(JSON.parse(sg));
          } else {
            setSession(null);
          }
        }
      } catch (e) {
        console.error(e);
        const sg = savedGuestSession();
        setSession(sg ? JSON.parse(sg) : null);
      } finally {
        if (!retrying) setLoadingSession(false);
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
        const sg = savedGuestSession();
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

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || session?.isGuest) {
      setRouteContext(null);
      return;
    }
    const controller = new AbortController();
    setRouteContext(null);
    void (async () => {
      const profileFallback: PublicProfile = {
        userId,
        publicId: String(session.user.user_metadata?.public_id || userId.slice(0, 8)),
        displayName: String(session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || tr("บัญชีของฉัน")),
      };
      const [profileResult, groupsResult] = await Promise.allSettled([
        apiJson<PublicProfile>('/api/profile', { signal: controller.signal, headers: { 'X-Account-ID': userId } }),
        groupApi.snapshot(userId, 'mine', 0, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      let groups: GroupSummary[] = [];
      let groupsLoaded = groupsResult.status === 'fulfilled';
      if (groupsResult.status === 'fulfilled') {
        groups = groupsResult.value.groups.filter(group => !!group.myRole);
        const totalPages = Math.min(10, Math.ceil(groupsResult.value.total / 20));
        try {
          for (let page = 1; page < totalPages; page++) {
            const result = await groupApi.snapshot(userId, 'mine', page, controller.signal);
            groups.push(...result.groups.filter(group => !!group.myRole));
          }
        } catch {
          groupsLoaded = false;
        }
      }
      setRouteContext({
        userId,
        profile: profileResult.status === 'fulfilled' ? profileResult.value : profileFallback,
        groups,
        groupsLoaded,
        systemRole: groupsResult.status === 'fulfilled' ? groupsResult.value.systemRole : null,
      });
    })();
    return () => controller.abort();
  }, [session?.user?.id, session?.isGuest]);

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
      if (result.error) { triggerAlert(tr("ออกจากระบบไม่สำเร็จ"), result.error.message); return; }
    }
    clearCloud(); privateCache.clear(); cloudReadyRef.current = null;
    const ownerEmail = session?.user?.email;
    for (const storage of [localStorage, sessionStorage]) for (const key of Object.keys(storage)) if (key.startsWith('cashflow_') && (key.includes(ownerEmail || 'never-match') || key.includes(session?.user?.id || 'never-match'))) storage.removeItem(key);
    localStorage.removeItem('cashflow_guest_session');
    setSession(null);
    navigatePath('/login', true);
  };

  // Private report links resume after login with a real account.
  useEffect(() => {
    if(!session?.user?.id || session.isGuest || !fullFeatureAccess)return;
    const params=new URLSearchParams(window.location.search);
    const month=params.get('report');if(!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
    const download=new URLSearchParams({month});const account=params.get('account');
    if(account)download.set('account',account);
    params.delete('report');params.delete('account');
    window.history.replaceState(null,'',`${window.location.pathname}${params.size?'?'+params:''}`);
    window.location.assign(`/api/download-report?${download}`);
  },[session, fullFeatureAccess]);

  // Load working state from defaults, then the authenticated cloud snapshot.
  const [jobs, setJobs] = useState<Job[]>(cleanJobs(defaultJobs));

  const [goals, setGoals] = useState<Goal[]>(defaultGoals);

  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  // Persona-adjusted nav grouping -- everything stays reachable, this just decides what
  // shows up in the always-visible row by default (see PERSONA_CORE_KEYS above).
  const canViewAdminAnalytics = !session?.isGuest
    && session?.user?.canViewAdminAnalytics === true
    && routeContext?.userId === session?.user?.id
    && routeContext?.systemRole === 'admin';
  const navItems = React.useMemo(() => {
    const base = NAV_ITEMS.filter(item =>
      isPhaseOneFeatureAvailable(item.key, fullFeatureAccess) &&
      (settings.goalsFeatureEnabled !== false || item.key !== 'split') &&
      (item.key !== 'adminDashboard' || canViewAdminAnalytics)
    );
    if (!fullFeatureAccess) {
      // Same order as the full sidebar (owner, 2026-10-20): ภาพรวม · งาน · ปฏิทิน with เงินค้างรับ under it ·
      // รายจ่าย · เอกสาร · แจ้งปัญหา. Sub-items stay under their parent.
      const order: TabKey[] = ['dashboard', 'jobs', 'calendar', 'receivables', 'incomeExpense', 'invoice', 'feedback', 'plans', 'settings'];
      return base.map(item => item.group === 'bottom' || item.group === 'sub' ? item : { ...item, group: 'core' as const })
        .sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
    }
    const persona = settings.userPersona;
    if (!persona || persona === 'freelance') return base;
    const coreKeys = PERSONA_CORE_KEYS[persona];
    return base.map(item =>
      item.group === 'bottom' || item.group === 'sub' || item.key === 'dashboard' || item.key === 'adminDashboard' || item.key === 'jobs' || item.key === 'incomeExpense' || item.key === 'groups'
        ? item
        : { ...item, group: coreKeys.includes(item.key) ? 'core' as const : 'more' as const }
    );
  }, [settings.userPersona, settings.goalsFeatureEnabled, canViewAdminAnalytics, fullFeatureAccess]);
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
      { id: 'installment', label: 'แบ่งชำระเป็นงวด', behavior: 'partial' },
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
  // The Team feature is not launched yet: everyone but system admins sees a preview of it.
  const teamIsPreview = !!session?.isGuest || routeContext?.systemRole !== 'admin';

  const handleUpdateUserAvatar = (newAvatar: string) => {
    if(financeGroupId){triggerAlert(tr("รูปบัญชีส่วนตัว"),tr("เลือกบัญชีการเงินส่วนตัวก่อนเปลี่ยนรูปบัญชี"));return;}
    setUserAvatar(newAvatar);
    const email = session?.user?.email;
    if (!email) return;
    const currentUser = session?.user;
    if (currentUser && !session?.isGuest) {
      saveCloud(currentUser.id, { avatar_data_url: newAvatar || null }).catch(error => triggerAlert(tr("บันทึกรูปไม่สำเร็จ"), error.message));
    }
  };

  // Track loaded state for the current logged-in user email
  const [isLoadedForUser, setIsLoadedForUser] = useState<string | null>(null);

  // Cloud Sync states
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'pending' | 'failed' | 'not_setup'>('not_setup');
  // A new build only opens once nothing is waiting to be saved (app/appUpdate.ts).
  const cloudSyncStatusRef = React.useRef(cloudSyncStatus);
  cloudSyncStatusRef.current = cloudSyncStatus;
  useEffect(() => { setUpdateGuard(() => cloudSyncStatusRef.current !== 'pending'); }, []);
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);

  // Jobs/expenses this tab has explicitly deleted this session -- see saveCloudData's merge step
  // for why: a job/expense added from another channel (LINE chat-add, the LIFF form) while this
  // tab is open wouldn't be in its in-memory `jobs`/`expenses`, so a blind overwrite on the next
  // autosave would silently erase it. The merge step re-adds anything present server-side but
  // missing locally -- except ids in these sets, which really were deleted on purpose.
  const deletedJobIdsRef = useRef<Set<string>>(new Set());
  // The save that carries an import: the import window says "done" only once it has reached the server.
  const importSaveRef = useRef<{ batchId: string; resolve: (outcome: SaveOutcome) => void } | null>(null);
  const deletedExpenseIdsRef = useRef<Set<string>>(new Set());
  // Guards saveCloudData against overlapping calls -- see its own comment for why that matters.
  const cloudSaveInFlightRef = useRef(false);
  const cloudSavePendingRef = useRef<{ email: string; payload: any } | null>(null);
  const [isProPromoOpen, setIsProPromoOpen] = useState(false);
  // Why the upgrade dialog opened, when a feature asked for it (e.g. the month's free documents are used).
  const [proPromoNotice, setProPromoNotice] = useState<string | null>(null);
  const openProPromo = React.useCallback((notice: string) => {
    if (!fullFeatureAccess) { navigateTab('plans'); return; }
    setProPromoNotice(notice); setIsProPromoOpen(true);
  }, [fullFeatureAccess]);
  const [lastCloudError, setLastCloudError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [checkoutReady, setCheckoutReady] = useState(false);
  useEffect(() => {
    if (billingBusy) return;
    setCheckoutReady(false);
    if (!session?.user || session.isGuest || activeTab !== 'plans') return;
    const controller = new AbortController();
    void apiJson<any>('/api/billing', { signal: controller.signal, headers: { 'X-Account-ID': session.user.id } })
      .then(result => { if (!controller.signal.aborted) {
        setCheckoutReady(result.checkout_ready === true);
      } })
      .catch(() => { /* Checkout remains closed when readiness cannot be checked. */ });
    return () => controller.abort();
  }, [session?.user?.id, session?.isGuest, activeTab, billingBusy]);
  const [qrPayment, setQrPayment] = useState<{ period: ProPeriod; checkout: DirectQrPayment | null; status: 'loading' | 'pending' | 'paid' | 'expired'; error?: string } | null>(null);
  const qrAttempt = React.useRef(0);
  const [preparingCard, setPreparingCard] = useState<ProPeriod | null>(null);
  const [embeddedPayment, setEmbeddedPayment] = useState<EmbeddedPayment | null>(null);
  const [billingPollVersion, setBillingPollVersion] = useState(0);
  const billingUserId = session?.isGuest ? null : session?.user?.id || null;
  const billingUserRef = useRef<string | null>(billingUserId);
  const subscriptionOwnerRef = useRef<string | null>(null);
  const billingRequestRef = useRef(0);
  billingUserRef.current = billingUserId;

  // Billing belongs to the authenticated person, not the selected finance workspace. Clear it
  // before paint on an A -> B session switch so B never inherits A's plan or a disabled CTA.
  useLayoutEffect(() => {
    if (subscriptionOwnerRef.current === billingUserId) return;
    subscriptionOwnerRef.current = billingUserId;
    billingRequestRef.current += 1;
    setSubscription(null);
    setBillingBusy(false);
    setEmbeddedPayment(null); setPreparingCard(null);
    setQrPayment(null); qrAttempt.current++;
    setIsProPromoOpen(false);
  }, [billingUserId]);

  // First 14 days after signup are free automatically, based on the account's real creation
  // date from Supabase Auth (not something the client can fake). No Stripe interaction needed.
  const FREE_TRIAL_DAYS = 14;
  const trialEndsAt = React.useMemo(() => {
    const createdAt = session?.user?.created_at;
    if (!createdAt || session?.isGuest) return null;
    return new Date(new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }, [session?.user?.created_at, session?.isGuest]);
  const isAdminProRevoked = ['admin_revoked', 'admin_removed'].includes(subscription?.plan || '');
  const isInFreeTrial = !isAdminProRevoked && !!trialEndsAt && trialEndsAt.getTime() > Date.now();

  // Stripe subscription access follows verified webhook state; an admin grant stays active until revoked.
  const isPaidActive = !isAdminProRevoked && !!subscription && ['active', 'trialing'].includes(subscription.status) && (
    subscription.plan === 'admin_grant' ||
    (!!subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd).getTime() > Date.now())
  );
  const hasOpenStripeSubscription = Boolean(
    subscription?.hasSubscription
    && !['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );

  // Guest mode previews local Pro tools with sample data. Server-side Pro access
  // still requires a real account and is checked independently by the API.
  const isGuestProPreview = session?.isGuest === true;
  const isPro = isGuestProPreview || isInFreeTrial || isPaidActive;
  // The floating squirrel follows Pro accounts to every page but the chat itself (and steps aside for เมนู on phones).
  const showBuddy = isPro && activeTab !== 'assistant' && isPhaseOneFeatureAvailable('assistant', fullFeatureAccess) && !(isPhone && isMobileMenuOpen);
  const [buddyPanelOpen, setBuddyPanelOpen] = useState(false);
  const [birthOpen, setBirthOpen] = useState(false);
  const [buddyArrival, setBuddyArrival] = useState(0);
  // Only right after paying: set when the server confirms the payment, played once its "สมัครสมาชิกสำเร็จ!" message
  // is closed, so the two never sit on top of each other. Ordinary visits, the trial and renewals never play it.
  const birthAfterPayRef = useRef(false);
  // The team's preview (เลขากระรอก ⋯ → ดูตอนน้องเกิดอีกครั้ง) and the tests open it with ?hello=krarok.
  const birthPreviewRef = useRef(false);
  useEffect(() => {
    if (!showBuddy || birthOpen) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('hello') === 'krarok') {
      params.delete('hello');
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
      birthPreviewRef.current = true;
    }
    if (!birthPreviewRef.current) return;
    // On a fresh load phones still show the opening logo (splash.ts); the squirrel waits until it has gone.
    let timer: number | undefined;
    const started = Date.now();
    const play = () => {
      if (document.getElementById('app-splash') && Date.now() - started < 5000) { timer = window.setTimeout(play, 120); return; }
      birthPreviewRef.current = false;
      setBirthOpen(true);
    };
    play();
    return () => window.clearTimeout(timer);
  }, [showBuddy, birthOpen]);
  const finishBirth = React.useCallback(() => {
    setBirthOpen(false);
    setBuddyArrival(value => value + 1);
  }, []);

  // 🌰 Global Month Exploration (สำรวจฤดูกาลเก็บเกี่ยว)
  const currentMonthKey = React.useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);
  // The dashboard's own period (header picker). Kept apart from selectedMonthKey, which other
  // pages read without showing any month control of their own.
  const [dashboardMonthKey, setDashboardMonthKey] = useState<string>(currentMonthKey);

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

  const handleStopRenewal = async () => {
    if (billingBusy || !session?.user) return;
    const userId = session.user.id;
    setBillingBusy(true);
    try {
      await apiJson('/api/billing', { method: 'POST', headers: { 'X-Account-ID': userId }, body: JSON.stringify({ action: 'stop_auto_renewal' }) });
      const state = await apiJson<any>('/api/billing', { headers: { 'X-Account-ID': userId } });
      if (billingUserRef.current !== userId) return;
      setSubscription(billingSubscription(state.subscription, false));
      triggerAlert(tr("ปิดการต่ออายุแล้ว"), tr("สิทธิ์ Pro ยังใช้ได้ถึงวันหมดอายุของรอบที่ชำระแล้ว"));
    } catch (error: any) { if (billingUserRef.current === userId) triggerAlert(tr("ยังปิดการต่ออายุไม่สำเร็จ"), formatError(error)); }
    finally { if (billingUserRef.current === userId) setBillingBusy(false); }
  };

  const handleUpgrade = async (requestedMethod?: unknown, period: ProPeriod = 'month', options: Pick<CardOptions, 'autoRenew' | 'saveCard'> = { autoRenew: true, saveCard: true }, quietError = false) => {
    const paymentMethod = requestedMethod === 'promptpay' ? 'promptpay' : 'card';
    const currentUser = session?.user;
    if (session?.isGuest) {
      void handleSignOut();
      return;
    }
    if (!currentUser) {
      triggerAlert(tr("ต้องสมัครสมาชิกก่อนครับ"), tr("กรุณาสมัครบัญชีจริงด้วยอีเมล (ไม่ใช่โหมดทดลองใช้งานฟรี) ก่อนอัปเกรดเป็นสมาชิกรายเดือนครับ"));
      return;
    }

    if (subscription?.plan === 'admin_grant') {
      triggerAlert(tr("บัญชีนี้เป็น Pro อยู่แล้ว"), tr("คุณได้รับสิทธิ์ Pro จากผู้ดูแล จึงยังไม่ต้องสมัครผ่าน Stripe"));
      return;
    }
    if (billingBusy) return;
    setBillingBusy(true);
    if (paymentMethod === 'card' && !hasOpenStripeSubscription) {
      if (!embeddedPayment) setPreparingCard(period);
      void import('@stripe/stripe-js').catch(() => { /* The form retries a failed SDK load. */ });
    }
    const attempt = ++qrAttempt.current;
    if (paymentMethod === 'promptpay' && !hasOpenStripeSubscription) setQrPayment({ period, checkout: null, status: 'loading' });
    try {
      const userId = currentUser.id;
      const result = await apiJson<EmbeddedPayment & DirectQrPayment & { url?: string; destination: 'qr' | 'embedded' | 'paid_pending' | 'portal' }>('/api/billing', {
        method: 'POST',
        headers: { 'X-Account-ID': userId },
        // Delinquent/nonterminal subscribers must be able to reach Portal even
        // when app entitlement or Checkout catalog validation is unavailable.
        body: JSON.stringify({ action: hasOpenStripeSubscription
          ? 'portal'
          : paymentMethod === 'promptpay' ? 'promptpay_checkout' : 'checkout', ...(hasOpenStripeSubscription ? {} : { period, ...(paymentMethod === 'card' ? { ...options, consentVersion: CARD_CONSENT_VERSION } : {}) }) }),
      });
      if (billingUserRef.current !== userId) return;
      if (qrAttempt.current !== attempt) { setBillingBusy(false); return false; }
      setPreparingCard(null);
      if (result.destination === 'qr') {
        const expected = PRO_PRICING[period];
        const image = new URL(result.qrImage);
        if (result.period !== period || result.amount !== expected.total * 100 || result.months !== expected.months
          || !result.orderId || image.protocol !== 'https:' || !image.hostname.endsWith('.stripe.com')) throw new Error(tr("ข้อมูล QR ไม่ตรงกับแพ็กเกจที่เลือก"));
        markCheckoutPending(userId); setBillingPollVersion(version => version + 1);
        if (qrAttempt.current === attempt) setQrPayment({ period, checkout: result, status: 'pending' });
        setBillingBusy(false); return;
      }
      if (result.destination === 'paid_pending') {
        if (qrAttempt.current === attempt) setQrPayment(null);
        markCheckoutPending(userId);
        setBillingPollVersion(version => version + 1);
        setBillingBusy(false);
        return;
      }
      if (result.destination === 'embedded') {
        if (qrAttempt.current === attempt) setQrPayment(null);
        if (!result.clientSecret || !result.publishableKey || !result.expiresAt || !result.amount)
          throw new Error(tr("ข้อมูลการชำระเงินไม่ครบถ้วน"));
        markCheckoutPending(userId);
        setBillingPollVersion(version => version + 1);
        setEmbeddedPayment(result);
        setBillingBusy(false);
        return true;
      }
      const target = new URL(result.url || '');
      if (result.destination !== 'portal' || target.protocol !== 'https:' || !target.hostname.endsWith('.stripe.com'))
        throw new Error(tr("ปลายทางจัดการสมาชิกไม่ถูกต้อง"));
      window.location.assign(target.toString());
    } catch (error: any) {
      if (billingUserRef.current !== currentUser.id) return;
      if (qrAttempt.current === attempt) setPreparingCard(null);
      setBillingBusy(false);
      if (paymentMethod === 'promptpay') {
        if (qrAttempt.current === attempt) setQrPayment({ period, checkout: null, status: 'loading', error: formatError(error) });
      } else if (!quietError && qrAttempt.current === attempt) triggerAlert(tr("เปิดหน้าชำระเงินไม่สำเร็จ"), formatError(error));
      return false;
    }
  };

  // The QR dialog never grants Pro. It polls this owner's canonical payment and
  // the existing subscription poller waits for the server's verified entitlement.
  const qrOrderId = qrPayment?.checkout?.orderId;
  useEffect(() => {
    if (!qrOrderId || !billingUserId) return;
    let canceled = false; let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await apiJson<{paymentStatus: 'pending' | 'paid' | 'expired'}>(`/api/billing?order_id=${encodeURIComponent(qrOrderId)}`, { headers: { 'X-Account-ID': billingUserId } });
        if (canceled) return;
        setQrPayment(previous => previous?.checkout?.orderId === qrOrderId ? { ...previous, status: result.paymentStatus } : previous);
        if (result.paymentStatus === 'paid') { setBillingPollVersion(v => v + 1); return; }
        if (result.paymentStatus === 'expired') return;
      } catch { /* Temporary connection failures must not imply a successful payment. */ }
      if (!canceled) timer = window.setTimeout(poll, 5000);
    };
    void poll();
    return () => { canceled = true; window.clearTimeout(timer); };
  }, [qrOrderId, billingUserId]);

  const handleEmbeddedComplete = React.useCallback(() => {
    const userId = billingUserRef.current;
    if (!userId) return;
    markCheckoutPending(userId);
    setBillingPollVersion(version => version + 1);
  }, []);

  // Handle redirect back from Stripe Checkout
  useEffect(() => {
    const userId = billingUserId;
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    const updateCheckoutQuery = (removeResult: boolean) => {
      const url = new URL(window.location.href);
      url.searchParams.delete('session_id');
      if (removeResult) url.searchParams.delete('checkout');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };

    if (checkoutResult === 'cancel' || checkoutResult === 'promptpay-cancel') {
      clearCheckoutPending();
      updateCheckoutQuery(true);
      return;
    }
    if (checkoutResult && !['success', 'promptpay-success'].includes(checkoutResult)) {
      updateCheckoutQuery(true);
      return;
    }

    let pendingOwner = checkoutPendingOwner();
    if (checkoutResult === 'success' || checkoutResult === 'promptpay-success') {
      // Keep the harmless success marker until webhook-backed state is confirmed. The Stripe
      // session id itself is unnecessary in browser history after the redirect.
      updateCheckoutQuery(false);
      if (!pendingOwner) {
        // Backward-compatible fallback for a Checkout opened before this marker shipped.
        markCheckoutPending(userId);
        pendingOwner = userId;
      }
    }
    if (pendingOwner !== userId) return;

    setBillingBusy(false);
    const controller = new AbortController();
    let cancelled = false;
    let timeout: number | undefined;
    let finishWait: (() => void) | null = null;
    const wait = (delay: number) => new Promise<void>(resolve => {
      finishWait = resolve;
      timeout = window.setTimeout(() => {
        timeout = undefined;
        finishWait = null;
        resolve();
      }, delay);
    });

    void (async () => {
      let attempt = 0;
      let pendingAlertShown = false;
      while (!cancelled && billingUserRef.current === userId) {
        const request = ++billingRequestRef.current;
        try {
          const result = await apiJson<any>('/api/billing', {
            signal: controller.signal,
            headers: { 'X-Account-ID': userId },
          });
          if (cancelled || billingUserRef.current !== userId) return;
          if (request === billingRequestRef.current) {
            const nextSubscription = billingSubscription(result.subscription, true);
            setSubscription(nextSubscription);
            if (isConfirmedCheckoutSubscription(nextSubscription)) {
              clearCheckoutPending(userId);
              setEmbeddedPayment(null);
              setQrPayment(null); qrAttempt.current++;
              updateCheckoutQuery(true);
              birthAfterPayRef.current = true;
              triggerAlert(tr("สมัครสมาชิกสำเร็จ!"), tr("เปิดสิทธิ์ Pro ให้บัญชีนี้แล้ว ขอบคุณที่สนับสนุนกระรอกตุนเงินนะครับ!"));
              return;
            }
          }
        } catch (error: any) {
          if (cancelled || error?.name === 'AbortError' || billingUserRef.current !== userId) return;
          // Stripe retries failed webhook deliveries; keep polling at the bounded cadence below.
        }

        if (!pendingAlertShown && ['success', 'promptpay-success'].includes(checkoutResult || '')
          && attempt >= 5 && billingUserRef.current === userId) {
          pendingAlertShown = true;
          triggerAlert(tr("รับข้อมูลการชำระเงินแล้ว"), tr("กำลังตรวจสอบยอดชำระ ระบบจะเปิด Pro ให้อัตโนมัติเมื่อยืนยันสำเร็จ"));
        }
        const delay = attempt < 9 ? 1000 : attempt < 19 ? 5000 : 15000;
        attempt += 1;
        await wait(delay);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
      finishWait?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingUserId, billingPollVersion]);

  // Domain state stays in the UI; persistence is handled by the cloud service.
  const cloudReadyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const loadCloudData = async (_email: string) => {
    const user = sessionRef.current?.user;
    if (!user || sessionRef.current?.isGuest) return false;
    const owner=financeOwnerRef.current;
    const request=++loadRequestRef.current;
    const billingRequest=++billingRequestRef.current;
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
      setStatuses(data.statuses ? cleanStatuses(data.statuses) : [{id:'done',label:'จ่ายเงินครบแล้ว',behavior:'done'},{id:'partial',label:'มัดจำแล้ว',behavior:'partial'},{id:'installment',label:'แบ่งชำระเป็นงวด',behavior:'partial'},{id:'pending',label:'ยังไม่จ่าย',behavior:'pending'}]);
      setJobTypes(data.job_types ? cleanJobTypes(data.job_types) : DEFAULT_JOB_TYPES);
      setNotifSettings({ enabled: true, alertEmail: user.email || '', serviceType: 'mailto', emailjsServiceId: '', emailjsTemplateId: '', emailjsPublicKey: '', pendingQueue: [], ...data.notif_settings });
      if(!financeGroupId)setUserAvatar(data.avatar_data_url || '');
      if (billingUserRef.current === user.id && billingRequest === billingRequestRef.current) {
        setSubscription(billingSubscription(result.subscription, true));
      }
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
    const pendingImport = importSaveRef.current;
    const settleImport = (outcome: SaveOutcome) => {
      if (!pendingImport || importSaveRef.current !== pendingImport || !carriesBatch(payload, pendingImport.batchId)) return;
      importSaveRef.current = null;
      pendingImport.resolve(outcome);
    };
    if (!user || sessionRef.current?.isGuest || user.email !== email || financeOwnerRef.current!==owner || cloudReadyRef.current !== owner) {
      settleImport(sessionRef.current?.isGuest ? { state: 'local' } : { state: 'failed', error: tr("ยังบันทึกขึ้นระบบไม่ได้ กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง") });
      return;
    }
    try {
      await saveAppCloud(owner, payload);
      settleImport({ state: 'saved' });
      if (sessionRef.current?.user?.id === user.id && financeOwnerRef.current===owner) { setLastCloudError(null); setCloudSyncStatus('synced'); }
    } catch (error: any) {
      settleImport({ state: 'failed', error: formatError(error) });
      if (sessionRef.current?.user?.id !== user.id || financeOwnerRef.current!==owner) return;
      if (error.status === 409) {cloudReadyRef.current = null;financeConflictRef.current=true;}
      setLastCloudError(formatError(error)); setCloudSyncStatus('failed');
      fireMascot({ mood: 'alert', tone: 'error', title: tr("บันทึกข้อมูลไม่สำเร็จ"), message: tr("{0} ข้อมูลยังอยู่ในหน้านี้ กรุณาสำรองข้อมูลก่อนโหลดหน้าใหม่หรือปิดหน้าเว็บ", formatError(error)), duration: 9000 });
    }
  };

  const switchFinance = async (groupId?:string,name?:string,updateUrl = true) => {
    if (groupId && !fullFeatureAccess) return;
    if(switchingFinanceRef.current || groupId===financeGroupId || !session?.user?.id)return;
    switchingFinanceRef.current=true;
    setSwitchingFinance(true);
    try {
      if(cloudReadyRef.current===financeOwner) {
        await flushCloud(financeOwner);
        await saveAppCloud(financeOwner,{jobs,expenses,goals,settings,statuses,jobTypes,notifSettings});
      } else if(financeConflictRef.current) {
        throw new Error(tr("กรุณาสำรองข้อมูลและโหลดข้อมูลล่าสุดก่อนเปลี่ยนบัญชี"));
      }
      assertFinanceWorkspace(financeOwner);
      cloudReadyRef.current=null;
      clearCloud();privateCache.clear();
      const next=financeKey(session.user.id,groupId);
      financeOwnerRef.current=next;setFinanceWorkspace(next);
      setFinanceSelection({account:session.user.id,groupId,name});
      const currentRouteContext = routeContext;
      if (updateUrl && currentRouteContext && currentRouteContext.userId === session.user.id) {
        const personalSlug = personalWorkspaceSlug(currentRouteContext.profile);
        let selectedGroup = groupId ? currentRouteContext.groups.find(group => group.id === groupId) : undefined;
        let routeGroups = currentRouteContext.groups;
        if (groupId && !selectedGroup && name) {
          selectedGroup = { id: groupId, name, description: '', createdAt: '', myRole: 'member', memberCount: 1, leaderCount: 0 };
          routeGroups = [...currentRouteContext.groups, selectedGroup];
          setRouteContext({ ...currentRouteContext, groups: routeGroups });
        }
        const nextSlug = selectedGroup
          ? groupWorkspaceSlug(selectedGroup, routeGroups, personalSlug)
          : personalSlug;
        navigatePath(workspaceRoutePath(activeTab, nextSlug));
      }
      setIsLoadedForUser(null);setCloudSyncStatus('pending');
      setLoadedFinanceOwner('');financeConflictRef.current=false;
      setJobs([]);setExpenses([]);setGoals([]);
      setSettings({...defaultSettings,profileSetupCompleted:!!groupId});
      setIsAddJobOpen(false);setInitialSelectedGoalId(null);setScrollToJobId(null);setScrollToExpenseId(null);setAutoOpenAddExpense(false);
    } catch(error:any) {triggerAlert(tr("เปลี่ยนบัญชีการเงินไม่สำเร็จ"),error.message);}
    finally {switchingFinanceRef.current=false;setSwitchingFinance(false);}
  };

  useEffect(() => {
    if (!loadingSession && !session && pathname === '/app') navigatePath('/login', true, true);
  }, [loadingSession, session, pathname]);

  // The root segment names the active personal or group workspace. Resolving it here makes
  // pasted links and browser back/forward restore the same finance workspace after a refresh.
  useEffect(() => {
    if (!session?.user?.id) return;
    // LINE's document inbox is a focused personal-account screen, outside the app navigation.
    if (pathname === '/line-documents') {
      if (!fullFeatureAccess) {
        if (session.isGuest) navigatePath(workspaceRoutePath('dashboard', 'demo'), true);
        else if (routeContext && routeContext.userId === session.user.id) navigatePath(workspaceRoutePath('dashboard', personalWorkspaceSlug(routeContext.profile)), true);
        return;
      }
      if (!session.isGuest && financeGroupId && routeContext?.userId === session.user.id) void switchFinance(undefined, undefined, false);
      return;
    }
    if (session.isGuest) {
      const requestedRoute = parseWorkspaceRoute(pathname);
      const safeTab = resolvePhaseOneTab(requestedRoute.tab, false);
      if (requestedActiveTab !== safeTab) setActiveTab(safeTab);
      const demoPath = workspaceRoutePath(safeTab, 'demo');
      if (pathname !== demoPath) navigatePath(demoPath, true, safeTab === requestedRoute.tab);
      return;
    }
    if (!routeContext || routeContext.userId !== session.user.id) return;

    const personalSlug = personalWorkspaceSlug(routeContext.profile);
    const requestedRoute = parseWorkspaceRoute(pathname);
    const isWorkspaceRoot = pathname === '/' || pathname === '/app' || pathname === '/login';
    const rawRequestedTab = isWorkspaceRoot ? requestedActiveTab : requestedRoute.tab;
    const requestedTab = resolvePhaseOneTab(rawRequestedTab, fullFeatureAccess);
    const requestedSlug = requestedRoute.workspaceSlug;
    if (requestedActiveTab !== requestedTab) setActiveTab(requestedTab);
    const defaultRoute = isWorkspaceRoot || !requestedSlug;

    if (!fullFeatureAccess || defaultRoute || requestedSlug === personalSlug) {
      if (financeGroupId) void switchFinance(undefined, undefined, false);
      const personalPath = workspaceRoutePath(requestedTab, personalSlug);
      if (pathname !== personalPath) navigatePath(personalPath, true, requestedTab === rawRequestedTab);
      return;
    }

    const group = routeContext.groups.find(candidate => groupWorkspaceSlug(candidate, routeContext.groups, personalSlug) === requestedSlug);
    if (group) {
      if (financeGroupId !== group.id) void switchFinance(group.id, group.name, false);
      const groupPath = workspaceRoutePath(requestedTab, groupWorkspaceSlug(group, routeContext.groups, personalSlug));
      if (pathname !== groupPath) navigatePath(groupPath, true, true);
      return;
    }

    const selectedGroup = financeGroupId ? routeContext.groups.find(candidate => candidate.id === financeGroupId) : undefined;
    if (selectedGroup) {
      const selectedPath = workspaceRoutePath(requestedTab, groupWorkspaceSlug(selectedGroup, routeContext.groups, personalSlug));
      if (pathname !== selectedPath) navigatePath(selectedPath, true, true);
      return;
    }

    // If membership lookup failed, keep an unrecognized deep link intact so a transient API
    // error does not silently change the URL. Once the group list is available, typos fall back
    // to the user's own workspace.
    if (routeContext.groupsLoaded) {
      if (financeGroupId) void switchFinance(undefined, undefined, false);
      navigatePath(workspaceRoutePath(requestedTab, personalSlug), true, true);
    }
  }, [pathname, session?.user?.id, session?.isGuest, routeContext, financeGroupId, activeTab, requestedActiveTab, fullFeatureAccess]);

  // Load user data whenever session changes
  useLayoutEffect(() => {
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

  // The automatic Pro promo popups (once a day, and once every 7 days, for non-Pro accounts) were
  // removed on 2026-10-23 (owner: "เอาป้ายโฆษณาคนที่ยังไม่เติมออก"). The same dialog still opens when a
  // feature needs Pro, e.g. the 11th free document of the month (openProPromo).

  // Safety net regardless of the above: if isPro ever flips true while the promo is open (this
  // race condition or any other), close it immediately rather than leaving a Pro user stuck
  // looking at an upgrade prompt for a plan they already have.
  useEffect(() => {
    if ((!fullFeatureAccess || isPro) && isProPromoOpen) setIsProPromoOpen(false);
  }, [isPro, isProPromoOpen, fullFeatureAccess]);

  // Modal Control States
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
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
  const [editJobRequest, setEditJobRequest] = useState<string | null>(null);
  const [scrollToExpenseId, setScrollToExpenseId] = useState<string | null>(null);
  const [autoOpenAddExpense, setAutoOpenAddExpense] = useState(false);

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

    if (jobId) setScrollToJobId(jobId);
    if (expenseId) setScrollToExpenseId(expenseId);
    if (openAddJob) setIsAddJobOpen(true);
    if (openAddExpense) setAutoOpenAddExpense(true);
    // Expenses are managed on the การเงิน page; jobs on the Jobs page.
    navigateTab(expenseId || openAddExpense ? 'incomeExpense' : 'jobs');

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
  // The payment's "สมัครสมาชิกสำเร็จ!" message has been closed: the squirrel arrives (once the corner squirrel can show).
  useEffect(() => {
    if (!birthAfterPayRef.current || dialog.isOpen || !showBuddy || birthOpen) return;
    birthAfterPayRef.current = false;
    setBirthOpen(true);
  }, [dialog.isOpen, showBuddy, birthOpen]);

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
    if (!notificationsAccess) return;
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
              client: j.client || tr("ไม่ระบุ"),
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
              tr("ตรวจพบดีลค้างชำระเลยกำหนด!"),
              tr("ระบบตรวจพบดีลงานเลยกำหนดเครดิตเทอมใหม่วันนี้ (จำนวน {0} รายการ)\n\nต้องการไปที่หน้าเงินรอรับ เพื่อตั้งเตือนหรือบันทึกรับเงินเลยไหมครับ?", newCount),
              () => {
                navigateTab('receivables');
              }
            );
          }, 1500);
        }
      }
    }
  }, [session, isLoadedForUser, jobs, statuses, notifSettings.enabled, notificationsAccess]);

  // Self-reminders set from the receivables "เตือนฉัน" button: nudge once per day when opened.
  const dueReminderJobs = useMemo(() => jobs.filter(j => isReminderDue(j)), [jobs]);
  useEffect(() => {
    if (!notificationsAccess || !(session?.user?.email && isLoadedForUser === session.user.email) || dueReminderJobs.length === 0) return;
    const shownKey = `cs_reminders_shown_${session.user.email}_${toLocalDateKey()}`;
    try {
      if (localStorage.getItem(shownKey)) return;
      localStorage.setItem(shownKey, '1');
    } catch {
      // Without storage the nudge may repeat on reload; the badge and card still show it.
    }
    const [first, ...rest] = dueReminderJobs;
    fireMascot({
      mood: 'alert',
      tone: 'warning',
      title: tr("ถึงกำหนดติดตามการชำระเงิน"),
      message: tr("{0} {1}{2} ตรวจสอบได้ที่หน้าเงินรอรับ", first.client || first.name, formatCurrency(first.pending), rest.length ? tr(" และอีก {0} รายการ", rest.length) : ''),
      duration: 9000,
    });
  }, [session, isLoadedForUser, dueReminderJobs, notificationsAccess]);

  // Web edits acknowledge locally. LINE receipts are sent only by the LINE chat/LIFF flows.
  // Core functions
  /** Returns the new job's id so the Jobs list can light up the row just saved. */
  const handleAddJob = (newJob: Omit<Job, 'id'>): string => {
    const jobWithId: Job = {
      ...newJob,
      id: crypto.randomUUID(),
      lastActivityAt: new Date().toISOString(),
    };
    setJobs(prev => [jobWithId, ...prev]);
    fireMascot({
      mood: 'happy',
      title: tr("เพิ่มงานแล้ว"),
      message: newJob.name,
    });
    // Trigger a celebratory green leaves shower!
    leafBus.trigger({ count: 16, type: 'green', durationMs: 3500 });
    return jobWithId.id;
  };

  // Jumps to the Jobs tab and scrolls straight to one job's card, briefly highlighted --
  // shared by every clickable job reference outside the Jobs tab itself (Dashboard's hero
  // card breakdown, the credit-term board) so they all land on the same quick-action row.
  // Job types are plain labels on each job, so renaming a type relabels the jobs that use it.
  // One state update (not an onEditJob per job) so no per-job toasts or notifications fire.
  const handleRenameJobType = (from: string, to: string) => {
    setJobs(prev => prev.map(j => (j.type === from ? { ...j, type: to } : j)));
  };

  // Day picked in the dashboard's mini calendar; CalendarTab opens on it, then clears it.
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null);
  // The retired /timeline page is now the calendar's Timeline view: an old link opens it there.
  const [calendarLinkView] = useState<'timeline' | null>(() =>
    window.location.pathname.split('/').filter(Boolean)[0] === 'timeline' ? 'timeline' : null);

  const clearEditJobRequest = React.useCallback(() => setEditJobRequest(null), []);
  const handleViewJob = (id: string) => {
    setScrollToJobId(id);
    navigateTab('jobs');
  };

  /** `notice` replaces the generic "saved" toast when the caller knows better what happened
   * (e.g. a reminder was set), so one toast says it instead of a toast plus a dialog. */
  const handleEditJob = (id: string, updated: Partial<Job>, notice?: { title: string; message: string }) => {
    // Use the latest state for local save feedback and preserve the existing payment transitions.
    let oldJob: Job | undefined;
    const stamped = { ...updated, lastActivityAt: new Date().toISOString() };
    setJobs(prev => {
      oldJob = prev.find(j => j.id === id);
      return prev.map(j => j.id === id ? { ...j, ...stamped } : j);
    });

    const wasCompleted = (updated.status === 'done' && oldJob?.status !== 'done') ||
                         (updated.paymentStatus === 'paid' && oldJob?.paymentStatus !== 'paid') ||
                         (updated.pending === 0 && (oldJob?.pending ?? 0) > 0);

    // Keep in-app feedback distinct for delivery, deposits and full payment.
    const wasDelivered = !wasCompleted && updated.isPosted === true && oldJob?.isPosted === false;

    const wasPartialPayment = !wasCompleted && !wasDelivered && updated.status === 'partial'
      && (oldJob?.status !== 'partial' || (updated.received ?? 0) > (oldJob?.received ?? 0));

    if (wasCompleted) {
      fireMascot({
        mood: 'celebrate',
        title: tr("บันทึกการรับเงินแล้ว"),
        message: (updated.isPosted ?? oldJob?.isPosted) === false
          ? tr("ได้รับเงินครบถ้วนแล้ว งานยังอยู่ในสถานะกำลังทำ")
          : tr("ได้รับเงินครบถ้วน งานนี้ปิดเรียบร้อยแล้ว"),
        amount: oldJob?.pending || undefined
      });
      leafBus.trigger({ count: 28, type: 'mixed', durationMs: 5000 });
      // A job with withholding tax: offer to attach its 50 ทวิ right away (the vault decides
      // whether the workspace can keep files).
      if (oldJob) window.dispatchEvent(new CustomEvent('cash-squirrel:wht-paid', { detail: { ...oldJob, ...updated } }));
    } else if (wasDelivered) {
      fireMascot({
        mood: 'happy',
        title: tr("บันทึกการส่งงานแล้ว"),
        message: tr("งานอยู่ในสถานะรอรับเงิน"),
      });
    } else if (wasPartialPayment) {
      fireMascot({
        mood: 'happy',
        title: tr("บันทึกเงินมัดจำแล้ว"),
        message: tr("ยอดคงเหลือยังอยู่ในรายการเงินรอรับ"),
      });
      leafBus.trigger({ count: 14, type: 'mixed', durationMs: 3000 });
    } else {
      fireMascot({
        mood: 'happy',
        title: notice?.title ?? tr("บันทึกการแก้ไขแล้ว"),
        message: notice?.message ?? tr("ข้อมูลงานได้รับการปรับปรุงเรียบร้อย"),
        duration: notice ? 6000 : undefined,
      });

    }
  };

  const handleDeleteJob = (id: string) => {
    triggerConfirm(
      tr("ยืนยันการลบงาน"),
      tr("ต้องการลบงานนี้ใช่หรือไม่ ข้อมูลรายรับที่เกี่ยวข้องจะถูกลบไปด้วย"),
      () => {
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
          mood: 'happy',
          tone: 'info',
          title: tr("ลบงานแล้ว"),
          message: tr("รายการงานถูกนำออกจากระบบเรียบร้อย"),
        });
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
  };

  const handleDeleteGoal = (id: string) => {
    if (hasLinkedGoalTransactions(goals, id)) {
      triggerAlert(
        tr("ยังลบเป้าหมายไม่ได้"),
        tr("เป้าหมายนี้ยังมีประวัติการโอนเชื่อมกับเป้าหมายอื่น กรุณาลบรายการโอนแบบทั้งสองขาก่อน เพื่อไม่ให้บัญชีเงินออมเหลือรายการข้างเดียว"),
      );
      return false;
    }
    setGoals(prev => prev.filter(g => g.id !== id));
    return true;
  };

  const handleUpdateGoalProgress = (id: string, amount: number, reason?: string, date?: string, deductFromCash?: boolean) => {
    const g = goals.find(x => x.id === id);
    if (!g) return false;

    const todayStr = date || new Date().toISOString().split('T')[0];
    const defaultReason = amount >= 0 ? 'โอนเงินเข้าฝากออมเพิ่ม' : 'ดึงเงินออก / หักค่าใช้จ่าย';
    // Never cap at g.target -- a deposit that overshoots the goal is still real money that
    // landed in it (the UI already shows that as >100% progress, e.g. "1014.0% สำเร็จแล้ว").
    // Capping here silently discarded the excess, and then made handleDeleteGoalTransaction's
    // revert math wrong too: reverting a capped deposit subtracted the FULL original amount from
    // the capped current, which could wipe out money that was already in the goal before it.
    const requestedTx: GoalTransaction = {
      id: crypto.randomUUID(),
      type: (amount >= 0 ? 'deposit' : 'withdraw') as 'deposit' | 'withdraw',
      amount: Math.abs(amount),
      date: todayStr,
      reason: reason?.trim() || defaultReason,
      createdAt: new Date().toISOString(),
      // A savings transfer is not an Expense -- it must never land in the `expenses` array,
      // since tax reports, monthly summaries, and CSV exports all sum that array and would
      // wrongly treat money moved into savings as a deductible business expense. Cash-on-hand
      // totals read this flag directly off the goal's own history instead.
      ...(amount > 0 && deductFromCash ? { deductedFromCash: true } : {}),
    };
    // SplitTab rejects an overdraw before it gets here. Keep the state transition defensive too:
    // stale UI or another caller is clamped to the actual balance and the history stores exactly
    // that applied amount, so deleting the entry can never add money that was not withdrawn.
    const result = applyGoalTransaction(goals, id, requestedTx);
    if (!result.ok) return false;
    const nextVal = result.goalAfter.current;

    // Ticking "หักออกจากยอดรายรับ" (deductedFromCash, set on the transaction above) is what makes this
    // deposit count toward SplitTab's "กำไรสุทธิคงเหลือเพื่อจัดสรร" -- that figure derives live
    // from deductedFromCash deposit history, so setting the flag on the transaction is all that's needed;
    // no separate settings bookkeeping here, and nothing to reverse on delete either.

    if (nextVal >= g.target && g.current < g.target) {
      // Goal completed! Massive leaf party!
      fireMascot({
        mood: 'celebrate',
        title: tr("บรรลุเป้าหมายการออม"),
        message: tr("เป้าหมาย \"{0}\" ครบ 100% แล้ว", g.name),
      });
      leafBus.trigger({ count: 32, type: 'mixed', durationMs: 6500 });
    } else if (amount > 0) {
      // Saving money, drop some green leaves!
      leafBus.trigger({ count: 10, type: 'green', durationMs: 2500 });
    }

    setGoals(result.goals);
    return true;
  };

  const handleDeleteGoalTransaction = (goalId: string, txId: string, revertBalance: boolean = true) => {
    const g = goals.find(x => x.id === goalId);
    if (!g || !g.history) return;
    const targetTx = g.history.find(t => t.id === txId);
    if (!targetTx) return;

    const result = undoGoalTransaction(goals, goalId, txId, revertBalance);
    if (!result.ok) {
      const isTransfer = Boolean(targetTx.relatedGoalId || targetTx.transferId);
      const message = result.reason === 'history-only-not-allowed'
        ? tr("รายการนี้มีผลกับยอดเงินจริง จึงลบเฉพาะประวัติไม่ได้ กรุณาใช้ \"ลบรายการและคืนยอด\" เพื่อให้ยอดเงินและประวัติตรงกัน")
        : result.reason === 'ambiguous-legacy-withdrawal'
        ? tr("รายการถอนจากระบบรุ่นเก่าไม่มียอดที่ถูกตัดจริง ระบบจึงไม่คืนเงินอัตโนมัติ หากยอดปัจจุบันถูกต้องแล้ว ให้เลือก \"ลบเฉพาะประวัติ\"")
        : result.reason === 'insufficient-balance'
          ? isTransfer
            ? tr("เป้าหมายปลายทางมียอดคงเหลือไม่พอสำหรับย้อนรายการโอน กรุณาคืนเงินเข้าเป้าหมายนั้นก่อน")
            : tr("ยอดคงเหลือปัจจุบันน้อยกว่ายอดฝากที่จะย้อน จึงยังไม่ได้เปลี่ยนยอดเงิน")
          : tr("ไม่พบรายการโอนอีกขาที่ตรงกัน จึงยังไม่ได้เปลี่ยนยอดเงิน หากยอดปัจจุบันถูกต้องแล้ว ให้เลือก \"ลบเฉพาะประวัติ\"");
      triggerAlert(tr("ยังย้อนรายการไม่ได้"), message);
      return;
    }
    setGoals(result.goals);

    // No settings bookkeeping needed here -- SplitTab's "กำไรสุทธิคงเหลือเพื่อจัดสรร" derives
    // live from deductedFromCash deposits still present in goal history, so removing the
    // transaction above (when revertBalance is true) already un-counts it automatically.
  };

  const handleTransferBetweenGoals = (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => {
    if (fromGoalId === toGoalId || amount <= 0) return false;
    const todayStr = date || new Date().toISOString().split('T')[0];
    const createdAt = new Date().toISOString();
    const finalReason = reason?.trim();
    const result = applyGoalTransfer(goals, {
      fromGoalId,
      toGoalId,
      amount,
      date: todayStr,
      createdAt,
      transferId: crypto.randomUUID(),
      withdrawTransactionId: crypto.randomUUID(),
      depositTransactionId: crypto.randomUUID(),
      reason: finalReason,
    });
    if (!result.ok) return false;
    setGoals(result.goals);

    leafBus.trigger({ count: 14, type: 'mixed', durationMs: 3000 });
    triggerAlert(
      tr("โอนย้ายเงินสำเร็จ!"),
      tr("โอนย้ายเงินจำนวน {0} ฿ จากเป้าหมาย \"{1}\" ไปยัง \"{2}\" เรียบร้อยแล้ว", result.amount.toLocaleString(), result.fromGoal.name, result.toGoal.name)
    );
    return true;
  };

  const handleUpdateGoal = (id: string, updatedFields: Partial<Goal>) => {
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        return { ...g, ...updatedFields };
      }
      return g;
    }));
  };

  // Goal pictures saved before uploads were resized can weigh a megabyte each, and the account downloads
  // them on every visit (owner, 2026-10-21, approved shrinking them). Once the person's own data has
  // loaded, any picture over 100 kB is re-encoded to 256px (shown at 60px at most, so it looks the same)
  // and saved through the normal sync. Group workspaces are left alone.
  const shrunkGoalImages = useRef(new Set<string>());
  useEffect(() => {
    if (!session?.user?.id || session.isGuest || financeGroupId || loadedFinanceOwner !== financeOwner) return;
    for (const goal of goals) {
      const picture = goal.imageUrl;
      if (!picture || picture.length <= 100 * 1024 || shrunkGoalImages.current.has(`${financeOwner}:${goal.id}`)) continue;
      shrunkGoalImages.current.add(`${financeOwner}:${goal.id}`);
      void shrinkImageDataUrl(picture, 256).then(smaller => {
        if (!smaller || financeOwnerRef.current !== financeOwner) return;
        setGoals(prev => prev.map(g => (g.id === goal.id && g.imageUrl === picture ? { ...g, imageUrl: smaller } : g)));
      }).catch(() => { /* Keep the original picture if it cannot be read. */ });
    }
  }, [goals, session?.user?.id, session?.isGuest, financeGroupId, loadedFinanceOwner, financeOwner]);

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
        tr("ฝากเงินสำเร็จ!"),
        tr("โอนเงิน {0} ฿ เข้าสู่เป้าหมาย \"{1}\" เรียบร้อยแล้ว", amount.toLocaleString(), goalName)
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
    setExpenses(prev => [expWithId, ...prev]);
  };

  const handleEditExpense = (id: string, updated: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updated } : e));
  };

  const handleDeleteExpense = (id: string) => {
    deletedExpenseIdsRef.current.add(id);
    if (session?.user?.email) {
      markRecentlyDeleted(`cashflow_deleted_expense_ids_${session.user.email}`, id);
    }
    let freshExpenses: Expense[] = expenses;
    setExpenses(prev => {
      freshExpenses = prev.filter(e => e.id !== id);
      return freshExpenses;
    });
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
    // Older snapshots may carry accumulatedRemainder, but that value mirrors money already
    // included in the live net-profit calculation. Retire it on the next ordinary settings write
    // so it can never become a second spendable balance again.
    setSettings({ ...newSettings, accumulatedRemainder: 0 });
  };


  // Backup and Restore Management
  const handleExportData = async () => {
    let cloud: any = { invoices: JSON.parse(privateCache.getItem('cashflow_invoices_guest') || '[]'), issuer_profile: JSON.parse(privateCache.getItem('cashflow_issuer_guest') || 'null') };
    try { if (session?.user?.id && !session.isGuest) cloud = await exportCloud(financeOwner); }
    catch (error: any) { triggerAlert(tr("ส่งออกข้อมูลไม่สำเร็จ"), error.message); return; }
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
      workspace: {kind:financeGroupId?'group':'personal',groupId:financeGroupId || null,name:financeSelection.name || tr("ส่วนตัว")}
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
      title: tr("ส่งออกข้อมูลแล้ว"),
      message: tr("ดาวน์โหลดไฟล์สำรองเรียบร้อย กรุณาเก็บรักษาไฟล์นี้ไว้"),
    });
  };

  // Import from Excel (owner, 2026-10-22, free for every account). Each new row carries the batch it
  // came in with and where in the file it came from; a row the import updated keeps what it was before.
  // So the whole import can be undone for 7 days (Settings > สำรอง & นำเข้าข้อมูล).
  const handleImportRows = (commit: ImportCommit): ImportResult => {
    const batchId = crypto.randomUUID();
    const importedAt = new Date().toISOString();
    const jobRows = commit.jobs.map(job => ({ ...job, id: crypto.randomUUID(), lastActivityAt: importedAt, importBatchId: batchId, importedAt }) as Job);
    const expenseRows = commit.expenses.map(expense => ({ ...expense, id: crypto.randomUUID(), importBatchId: batchId, importedAt }) as Expense);
    const updatesFor = (table: 'jobs' | 'expenses') => new Map(commit.updates.filter(update => update.table === table).map(update => [update.id, update]));
    const jobUpdates = updatesFor('jobs'), expenseUpdates = updatesFor('expenses');
    const applyUpdate = <T extends { id: string }>(row: T, updates: Map<string, ImportCommit['updates'][number]>): T => {
      const update = updates.get(row.id);
      return update ? { ...applyFields(row, update.after), importUpdate: { batchId, at: importedAt, before: update.before } } : row;
    };
    const saved = new Promise<SaveOutcome>(resolve => {
      if (!sessionRef.current?.user || sessionRef.current.isGuest) { resolve({ state: 'local' }); return; }
      importSaveRef.current = { batchId, resolve };
    });
    if (jobRows.length || jobUpdates.size) setJobs(prev => [...jobRows, ...prev.map(job => applyUpdate(job, jobUpdates))]);
    if (expenseRows.length || expenseUpdates.size) setExpenses(prev => [...expenseRows, ...prev.map(expense => applyUpdate(expense, expenseUpdates))]);
    if (commit.newJobTypes.length) setJobTypes(prev => [...prev, ...commit.newJobTypes.filter(type => !prev.includes(type))]);
    return { batchId, jobs: jobRows.length, expenses: expenseRows.length, updates: jobUpdates.size + expenseUpdates.size, saved };
  };

  // Tries the save again after it failed; the import window waits on it the same way.
  const retryImportSave = (batchId: string) => new Promise<SaveOutcome>(resolve => {
    const email = sessionRef.current?.user?.email;
    if (!email) { resolve({ state: 'failed', error: tr("กรุณาเข้าสู่ระบบอีกครั้ง") }); return; }
    importSaveRef.current = { batchId, resolve };
    void saveCloudData(email, { jobs, goals, statuses, jobTypes, settings, notifSettings, expenses });
  });

  const handleUndoImport = (batchId: string) => {
    const inBatch = (row: object) => (row as { importBatchId?: string }).importBatchId === batchId;
    const email = session?.user?.email;
    // Like a delete: remembered so a reload before the save lands does not bring the rows back.
    setJobs(prev => {
      for (const job of prev.filter(inBatch)) { deletedJobIdsRef.current.add(job.id); if (email) markRecentlyDeleted(`cashflow_deleted_job_ids_${email}`, job.id); }
      return prev.filter(job => !inBatch(job)).map(job => undoUpdate(job, batchId));
    });
    setExpenses(prev => {
      for (const expense of prev.filter(inBatch)) { deletedExpenseIdsRef.current.add(expense.id); if (email) markRecentlyDeleted(`cashflow_deleted_expense_ids_${email}`, expense.id); }
      return prev.filter(expense => !inBatch(expense)).map(expense => undoUpdate(expense, batchId));
    });
    fireMascot({ mood: 'happy', tone: 'info', title: tr("ยกเลิกการนำเข้าแล้ว"), message: tr("รายการจากไฟล์นี้ถูกนำออกจากแอปแล้ว") });
  };

  const handleImportData = async (jsonData: string) => {
    try {
      if (jsonData.length > 8 * 1024 * 1024) throw new Error(tr("ไฟล์มีขนาดใหญ่เกินไป"));
      const parsed = JSON.parse(jsonData);
      const validations: any[] = [];
      for (const field of ['jobs','expenses','goals','invoices']) if (parsed[field]) {
        if (!Array.isArray(parsed[field])) throw new Error(tr("รูปแบบไฟล์ไม่ถูกต้อง"));
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
        title: tr("นำเข้าข้อมูลแล้ว"),
        message: tr("ข้อมูลจากไฟล์สำรองถูกกู้คืนเรียบร้อย"),
      });
    } catch (err) {
      fireMascot({
        mood: 'alert',
        tone: 'error',
        title: tr("นำเข้าข้อมูลไม่สำเร็จ"),
        message: tr("ไฟล์อาจเสียหายหรือมีรูปแบบไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง"),
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

  // Phones: the opening logo (boot-skeleton.js) hands over once the page under it is ready: the session
  // is known and a signed-in account's data has loaded, failed, or is not needed for the page.
  const pageReady = !loadingSession && (!session?.user?.id || session.isGuest || session.user.accountPaused
    || loadedFinanceOwner === financeOwner || cloudSyncStatus === 'failed' || pathname === '/recover'
    || ['groups', 'plans', 'adminDashboard', 'feedback'].includes(activeTab));
  React.useEffect(() => { if (pageReady) hideSplash(); }, [pageReady]);

  if (MotionStudy && pathname === '/motion-study') return <Suspense fallback={null}><MotionStudy /></Suspense>;
  if (loadingSession) {
    // A refresh by someone who was signed in: lay out the app's skeleton straight away (the page
    // they are on, with the sidebar) instead of a blank screen. First visits keep the loader.
    if (hadSessionBefore()) return <AppShellSkeleton page={activeTab === 'feedback' || activeTab === 'assistant' ? 'settings' : activeTab} />;
    return showSessionLoader ? <FullPageLoader /> : null;
  }

  // Let legacy one-hour recovery links reach Login so it can immediately
  // remove their secret query parameter, even when a session already exists.
  const legacyRecoveryParams = pathname === '/login' ? new URLSearchParams(window.location.search) : null;
  if (pathname === '/recover' || legacyRecoveryParams?.has('r') || legacyRecoveryParams?.has('recover')) {
    return <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin} />;
  }

  if (session?.user?.accountPaused) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-brand-border bg-brand-white p-8 text-center shadow-xl">
          <Mascot mood="wave" size={72} />
          <h1 className="mt-4 font-display text-2xl font-black text-brand-text">{session.user.accountClosureKind === 'deletion' ? tr("บัญชีอยู่ระหว่างรอลบ") : tr("บัญชีพักใช้งานอยู่")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-brand-muted">
            {session.user.accountClosureKind === 'deletion' ? tr("บัญชีใช้งานไม่ได้แล้ว ข้อมูลยังอยู่ 30 วัน หากต้องการกู้คืน โปรดขอลิงก์และรหัสจากผู้ดูแลระบบ แล้วใช้อีเมลสำรองที่ยืนยันไว้ก่อนครบกำหนด หลังจากนั้นข้อมูลจะถูกลบถาวร") : tr("ข้อมูลของคุณยังอยู่ครบ หากไม่เปิดใช้งานภายใน 30 วัน บัญชีและข้อมูลส่วนตัวจะถูกลบถาวรในรอบประมวลผลถัดไป เราจะส่งอีเมลเตือนวันละครั้งใน 3 วันสุดท้าย")}
            {session.user.accountDeleteAfter && tr(" เหลือ {0} วัน (ครบกำหนด {1} น.)", Math.max(0, Math.ceil((new Date(session.user.accountDeleteAfter).getTime() - Date.now()) / 86_400_000)), new Date(session.user.accountDeleteAfter).toLocaleString(dateLocale(), { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }))}
          </p>
          {session.user.accountClosureKind !== 'deletion' && (!session.user.accountDeleteAfter || new Date(session.user.accountDeleteAfter).getTime() > Date.now()) && (
            <button type="button" onClick={async () => {
              const result = await authClient.auth.reactivateAccount();
              if (result.error) triggerAlert(tr("เปิดใช้บัญชีไม่สำเร็จ"), result.error.message);
            }} className="mt-6 w-full rounded-xl bg-[#E65F2B] px-4 py-3 font-bold text-white hover:bg-[#D8551F]">{tr("เปิดใช้บัญชีอีกครั้ง")}</button>
          )}
          <button type="button" onClick={() => void handleSignOut()} className="mt-3 w-full rounded-xl border border-brand-border px-4 py-3 font-bold text-brand-text hover:bg-brand-faint">{tr("ออกจากระบบ")}</button>
        </div>
        <CustomDialog dialog={dialog} onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))} />
      </main>
    );
  }

  if (switchingFinance && session) {
    return showFinanceSwitchLoader ? <FullPageLoader title={tr("กำลังย้ายไปพื้นที่ทำงานใหม่…")} messages={[tr("กำลังโหลดข้อมูลของพื้นที่ใหม่")]} /> : null;
  }

  if (!session) {
    const rootSegments = pathname.split('/').filter(Boolean);
    if (rootSegments.length === 0) {
      return <LandingPage onNavigate={(path) => navigatePath(path)} />;
    }
    return (
      <>
        <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin} />
      </>
    );
  }

  if (addingAccount && !session.isGuest) {
    return <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin}
      addAccount={{ email: addingAccount.email, onCancel: () => setAddingAccount(null) }} />;
  }

  if (pathname === '/line-documents') {
    if (!fullFeatureAccess) return <ContentLoadingSkeleton page="dashboard" />;
    if (session.isGuest) return <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin} />;
    if (financeOwner !== session.user.id || loadedFinanceOwner !== financeOwner) {
      return cloudSyncStatus === 'failed'
        ? <main className="flex h-dvh items-center justify-center bg-brand-bg p-6 text-brand-text"><div className="text-center"><p>{tr("เปิดเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง")}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#E65F2B] px-5 py-3 font-semibold text-white">{tr("ลองอีกครั้ง")}</button></div></main>
        : <FullPageLoader title={tr("กำลังเปิดเอกสารของคุณ…")} />;
    }
    return <VaultProvider key={financeOwner} financeKey={financeOwner} available isPro={isInFreeTrial || isPaidActive}
      jobs={jobs} expenses={expenses} onUpgrade={() => navigatePath('/plans')} triggerConfirm={triggerConfirm} triggerAlert={triggerAlert}>
      <Suspense fallback={<FullPageLoader title={tr("กำลังเปิดเอกสารของคุณ…")} />}><LineDocumentsPage financeKey={financeOwner} jobs={jobs} expenses={expenses} /></Suspense>
      <CustomDialog dialog={dialog} onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))} />
    </VaultProvider>;
  }

  return (
    <div className="app-shell h-screen bg-brand-bg flex lg:flex-row flex-col overflow-hidden">
      <button type="button" onClick={() => { const main = document.getElementById('main-content'); main?.focus(); main?.scrollIntoView({ behavior: 'smooth' }); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-xl focus:bg-white focus:p-3 focus:text-stone-900">{tr("ข้ามไปเนื้อหา")}</button>

      {/* 💻 iPad / MacBook / PC Desktop Sidebar (Hidden on mobile devices) -- own scroll region so
          it stays put while the main content (e.g. a 100-job list) scrolls independently */}
      <aside className={`app-sidebar lg-glass hidden lg:flex flex-col w-60 shrink-0 select-none my-3 ml-3 rounded-[28px] px-3 pt-5 pb-3 relative overflow-y-auto no-scrollbar${chatFocus ? ' is-folded' : ''}`} aria-hidden={chatFocus || undefined} inert={chatFocus || undefined}>
        <button
          type="button"
          onClick={() => navigateTab('dashboard')}
          className="flex items-center gap-2.5 mb-7 px-2 cursor-pointer text-left hover:opacity-80 transition-opacity"
          title={t("nav.backToDashboard")}
        >
          <BrandLockup size={34} />
        </button>

        {/* Desktop Sidebar Navigation List */}
        <nav className="space-y-1 flex-1">
          {renderNavGroup('core', false)}

          {renderNavGroup('more', false)}

        </nav>

        <div className="mt-3 border-t border-black/[0.08] pt-3 dark:border-white/10">
          <nav className="space-y-1" aria-label={tr("อัปเกรดและตั้งค่า")}>
            {navItems.filter(item => item.group === 'bottom').map(item => renderNavButton(item, false))}
          </nav>
          {isDesktop && (
            // One account card: which finance account is open, then who is signed in.
            <div className="mt-3 rounded-[18px] border border-white/90 bg-white/70 p-1 dark:border-white/10 dark:bg-white/[0.05]">
              {fullFeatureAccess && !session.isGuest && (<>
                <FinanceWorkspacePicker variant="row" account={session.user.id} groupId={financeGroupId} busy={switchingFinance} onChange={switchFinance}/>
                <div className="mx-2 my-1 border-t border-brand-border" />
              </>)}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(open => !open)}
                  aria-label={tr("เปิดเมนูโปรไฟล์")}
                  aria-expanded={isProfileMenuOpen}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-brand-faint cursor-pointer"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-faint text-brand-muted">
                    {userAvatar ? <img src={userAvatar} className="h-full w-full object-cover" alt="" /> : <User className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-brand-text">
                      {routeContext?.profile.displayName || session.user.email?.split('@')[0] || tr("บัญชีของฉัน")}
                    </span>
                  </span>
                  <MoreHorizontal className="h-4 w-4 shrink-0 text-brand-muted" />
                </button>
                {renderProfileMenu('bottom-full inset-x-0 mb-2')}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Tablets: the slide-out drawer, as before. Phones use the mobile design's tools screen instead. */}
      <AnimatePresence>
        {isMobileMenuOpen && !isPhone && (
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
                    <BrandLockup size={32} />
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
                  {renderNavGroup('core', true)}

                  {renderNavGroup('more', true)}

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

                  {session && (
                    <button
                      type="button"
                      onClick={() => { navigateTab('plans'); setIsMobileMenuOpen(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 bg-brand-bg border border-brand-border/40 hover:border-brand-border transition-colors cursor-pointer"
                    >
                      {isGuestProPreview ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <span className="font-display font-black text-indigo-600 dark:text-indigo-400">{t('plans.guestPreviewBadge')}</span>
                        </>
                      ) : isPaidActive ? (
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
                        tr("ออกจากระบบ"),
                        tr("คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?"),
                        async () => {
                          await handleSignOut();
                        }
                      );
                    }}
                    className="w-full py-1.5 px-3 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/10 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>{tr("ออกจากระบบ")}</span>
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 📱 / 💻 Main Section: Handles responsive paddings & maximum constraints */}
      <div className={`asx-panel-host flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden bg-brand-bg ${isPhone ? 'h-[100dvh]' : chatFocus ? 'h-screen pb-3' : 'h-screen pb-6 lg:pb-6'}${showBuddy && buddyPanelOpen && isDesktop && isWideForPanel ? ' asx-has-panel' : ''}`}>
        
        {/* Floating menu + account controls for screens without the sidebar. */}
        {!isDesktop && !isPhone && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 flex select-none items-start justify-between p-3 ${isProfileMenuOpen ? 'z-[110]' : 'z-40'}`}>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-brand-border/60 bg-brand-white/90 text-brand-muted shadow-sm backdrop-blur-md transition-all hover:text-brand-text lg:hidden"
            title={t('header.openMenu')}
          >
            <Menu className="h-4.5 w-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
          </button>

          <div className="group pointer-events-auto flex items-center justify-end gap-2">
            {fullFeatureAccess && !session.isGuest && (
              <div className={`overflow-hidden transition-all duration-300 ease-out ${isProfileMenuOpen ? 'max-w-[220px] translate-x-0 opacity-100' : 'max-w-0 translate-x-3 opacity-0 group-hover:max-w-[220px] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:max-w-[220px] group-focus-within:translate-x-0 group-focus-within:opacity-100'}`}>
                <FinanceWorkspacePicker account={session.user.id} groupId={financeGroupId} busy={switchingFinance} onChange={switchFinance}/>
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen(open => !open)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[#E65F2B]/15 bg-[#E65F2B] text-white shadow-sm transition-all hover:shadow-md active:scale-95"
                aria-label={tr("เปิดเมนูโปรไฟล์")}
                aria-expanded={isProfileMenuOpen}
              >
                {userAvatar ? <img src={userAvatar} className="h-full w-full object-cover" alt="User Avatar" /> : <User className="h-4.5 w-4.5" />}
              </button>
              {renderProfileMenu('right-0 top-12 w-64')}
            </div>
          </div>
        </div>
        )}

        {/* Phones: the top bar from the mobile design. Account and workspace controls live on the tools screen. */}
        {isPhone && (
          <MobileHeader
            alertsAccess={notificationsAccess}
            dark={darkMode}
            onToggleTheme={() => setDarkMode(!darkMode)}
            alerts={dueReminderJobs.length}
            onOpenAlerts={() => { setIsMobileMenuOpen(false); navigateTab('receivables'); }}
            onHome={() => { setIsMobileMenuOpen(false); navigateTab('dashboard'); }}
            // On the overview the bar joins the hero below it: greeting and avatar instead of the logo.
            greeting={activeTab === 'dashboard' && !isMobileMenuOpen ? {
              name: routeContext?.profile.displayName || session?.user?.email?.split('@')[0] || tr("บัญชีของฉัน"),
              avatarUrl: userAvatar || undefined,
              onOpen: () => (navItems.some(item => item.key === 'settings') ? navigateTab('settings') : setIsMobileMenuOpen(true)),
            } : undefined}
            // Every phone page has a terracotta header under the bar, like the overview (owner, 2026-10-20: one mood).
            hero
          />
        )}

        {/* Scrollable Container with responsive max widths */}
        <div id="main-content" tabIndex={-1} role="main" inert={switchingFinance} className={`app-content-panel min-h-0 min-w-0 flex-1 overflow-y-auto ${chatFocus ? 'px-3 pt-3 pb-0' : `px-4 sm:px-6 lg:px-8 xl:px-10 ${isPhone ? 'pt-[10px]' : 'pt-16'} pb-6 lg:pb-8`} no-scrollbar bg-brand-bg text-brand-text w-full max-w-none ${chatFocus ? '' : activeTab === 'dashboard' ? 'lg:pt-6' : 'lg:pt-8'}${isPhone ? ' ksm-home-scroller' : ''}${showBuddy && !isPhone ? ' has-buddy' : ''}`}>
          {/* Document vault for the open finance workspace, shared by Documents, Jobs and Tax */}
          <VaultProvider
            key={financeOwner}
            financeKey={financeOwner}
            available={fullFeatureAccess && !session.isGuest && Boolean(financeOwner)}
            isPro={isInFreeTrial || isPaidActive}
            jobs={jobs}
            expenses={expenses}
            onUpgrade={() => navigateTab('plans')}
            triggerConfirm={triggerConfirm}
            triggerAlert={triggerAlert}
          >
          {!session.isGuest && loadedFinanceOwner !== financeOwner && cloudSyncStatus !== 'failed' && activeTab !== 'feedback' && activeTab !== 'assistant'
            ? <ContentLoadingSkeleton page={activeTab} />
            : <Suspense fallback={<ContentLoadingSkeleton page={activeTab === 'feedback' || activeTab === 'assistant' ? 'settings' : activeTab} />}>
          {/* Phones keep the terracotta header solid between pages (mobile.css fades only the content under it). */}
          <div key={`${financeOwner}:${activeTab}`} className={activeTab === 'invoice' || isPhone ? undefined : 'app-tab-enter'}>
          {/* Phones: tool pages open from the menu, so they lead back to it, on the same terracotta header as
              every other page (owner, 2026-10-20). Pages with a summary draw that header themselves
              (PHONE_OWN_HEADER); บอกเรา draws its own header with a back button. */}
          {isPhone && !['dashboard', 'jobs', 'calendar', ...PHONE_OWN_HEADER].includes(activeTab) && !(activeTab === 'feedback' && !session.isGuest) && activeTab !== 'assistant' && (
            <MobilePageHero title={PHONE_PAGE_TITLES[activeTab] ? tr(PHONE_PAGE_TITLES[activeTab]!) : t(`nav.${activeTab}`)} onBack={openPhoneMenu} />
          )}
          {/* On phones the overview draws its own heading and month row (the mobile design). */}
          {activeTab === 'dashboard' && !isPhone && (
            <PageHeader page="dashboard" id="dashboard-title" className="mb-4">
              <div className="contents sm:flex sm:items-center sm:justify-end sm:gap-2">
                {/* Phones: its own full-width row under the title; wider screens: before the bell. */}
                <div className="order-last w-full sm:order-none sm:w-auto">
                  <DashboardPeriodPicker monthKey={dashboardMonthKey} onChange={setDashboardMonthKey} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {notificationsAccess && <button
                    type="button"
                    onClick={() => navigateTab('receivables')}
                    className="lg-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-muted transition-colors hover:text-brand-text cursor-pointer"
                    aria-label={dueReminderJobs.length ? tr("การแจ้งเตือน: ถึงเวลาตามเงิน {0} รายการ", dueReminderJobs.length) : tr("การแจ้งเตือน")}
                    title={dueReminderJobs.length ? tr("ถึงเวลาตามเงิน {0} รายการ", dueReminderJobs.length) : tr("ดูเงินที่ต้องติดตาม")}
                  >
                    <Bell className="h-4 w-4" />
                    {dueReminderJobs.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E65F2B] px-1 text-[9px] font-semibold text-white">
                        {dueReminderJobs.length}
                      </span>
                    )}
                  </button>}
                  <button
                    type="button"
                    onClick={() => setDarkMode(!darkMode)}
                    className="lg-glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-muted transition-colors hover:text-brand-text cursor-pointer"
                    title={darkMode ? tr("เปลี่ยนเป็นโหมดสว่าง") : tr("เปลี่ยนเป็นโหมดมืด")}
                    aria-label={darkMode ? tr("เปลี่ยนเป็นโหมดสว่าง") : tr("เปลี่ยนเป็นโหมดมืด")}
                  >
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </PageHeader>
          )}

          {/* While the account's data loads (a refresh included) every page shows its own skeleton;
              the text box below is only for a load that failed. */}
          {!session.isGuest && loadedFinanceOwner!==financeOwner && cloudSyncStatus!=='failed' && !['groups','plans','adminDashboard','feedback','assistant'].includes(activeTab) ? (
            <ContentLoadingSkeleton page={activeTab === 'feedback' || activeTab === 'assistant' ? 'settings' : activeTab} includeHeader={activeTab !== 'dashboard'} />
          ) : !session.isGuest && loadedFinanceOwner!==financeOwner && !['groups','plans','adminDashboard','feedback','assistant'].includes(activeTab) ? (
            <div role="alert" className="rounded-3xl border border-brand-border bg-brand-white p-8 text-center">
              <p className="font-bold text-brand-text">{tr("โหลดบัญชีการเงินไม่สำเร็จ")}</p>
              {lastCloudError && <p role="alert" className="mt-3 text-sm text-red-600">{lastCloudError}</p>}
              {cloudSyncStatus==='failed' && <button className="mt-4 rounded-xl bg-brand-green-acc px-4 py-2 font-bold" onClick={()=>void loadCloudData(session.user.email)}>{tr("ลองโหลดอีกครั้ง")}</button>}
            </div>
          ) : <div>
              {activeTab === 'dashboard' && (
                <DashboardTab
                  fullFeatureAccess={fullFeatureAccess}
                  receivablesAccess={receivablesAccess}
                  quotationAccess={quotationAccess}
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  expenses={expenses}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  statuses={statuses}
                  selectedMonthKey={dashboardMonthKey}
                  onEditJob={handleEditJob}
                  onViewJob={handleViewJob}
                  onOpenCalendar={(dateKey?: string) => { setCalendarFocusDate(dateKey ?? null); navigateTab('calendar'); }}
                  userEmail={session?.user?.email || 'user@example.com'}
                  notifSettings={notifSettings}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  onQuickRecord={(mode) => {
                    if (mode === 'income') {
                      setIsAddJobOpen(true);
                      navigateTab('jobs');
                    } else {
                      setAutoOpenAddExpense(true);
                      navigateTab('incomeExpense');
                    }
                  }}
                  mobile={isPhone}
                  monthPicker={<DashboardPeriodPicker monthKey={dashboardMonthKey} onChange={setDashboardMonthKey} compact labelOnly />}
                  onOpenTools={() => setIsMobileMenuOpen(true)}
                />
              )}

              {activeTab === 'feedback' && <FeedbackPage userId={session.user.id} isGuest={!!session.isGuest} onSignIn={() => void handleSignOut()} mobile={isPhone} onBack={() => setIsMobileMenuOpen(true)} />}
              {activeTab === 'assistant' && <AssistantChat mobile={isPhone} isPro={isPro} onBack={() => setIsMobileMenuOpen(true)}
                onExit={() => navigateTab(chatReturnTab.current)} focus={chatFocus} previewTools={fullFeatureAccess}
                onPreviewBirth={fullFeatureAccess && isPro ? () => { navigateTab('dashboard'); window.setTimeout(() => setBirthOpen(true), 500); } : undefined}
                onOpenNotifications={() => { setSettingsEntry(entry => ({ view: 'notif', n: entry.n + 1 })); navigateTab('settings'); }}
                onUpgrade={() => navigateTab('plans')} onNavigate={path => navigatePath(path)} />}

              {activeTab === 'jobs' && (
                    <JobsTab
                      fullFeatureAccess={fullFeatureAccess}
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
                      onRenameJobType={handleRenameJobType}
                      triggerAlert={triggerAlert}
                      triggerConfirm={triggerConfirm}
                      triggerPrompt={triggerPrompt}
                      scrollToJobId={scrollToJobId}
                      onScrollToJobHandled={() => setScrollToJobId(null)}
                      editJobId={editJobRequest}
                      onEditJobHandled={clearEditJobRequest}
                      onOpenImport={() => setIsImportOpen(true)}
                    />
              )}

              {activeTab === 'split' && (
                <SplitTab
                  onMobileBack={openPhoneMenu}
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
                    introEligible={subscription?.introEligible === true}
                    manageSubscription={hasOpenStripeSubscription}
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {/* Free accounts issue up to 10 new documents a month (counted and enforced by the API)
                  with a credit line on the page; Pro and trial accounts have neither. */}
              {activeTab === 'invoice' && (
                <InvoiceTab
                  fullFeatureAccess={fullFeatureAccess}
                  key={financeOwner || 'guest'}
                  ownerId={session?.isGuest ? undefined : financeOwner}
                  jobs={jobs}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  freePlan={!isPro}
                  onUpgradePrompt={openProPromo}
                />
              )}

              {/* วิเคราะห์รายได้ now lives inside รายงาน; old /insight links open that view. */}
              {(activeTab === 'report' || activeTab === 'insight') && (
                <ReportOverviewTab
                  jobs={jobs}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  initialView={activeTab === 'insight' ? 'clients' : undefined}
                  isPro={isPro}
                  onUpgrade={handleUpgrade}
                  triggerAlert={triggerAlert}
                />
              )}

              {activeTab === 'groups' && (
                <GroupsTab
                  key={session.user.id}
                  userId={session.user.id}
                  isGuest={!!session.isGuest}
                  triggerConfirm={triggerConfirm}
                  // Team launches later for small businesses; until then only system admins use the real thing.
                  preview={teamIsPreview}
                  me={{
                    displayName: routeContext?.profile.displayName || session.user.email?.split('@')[0] || tr("คุณ"),
                    publicId: routeContext?.profile.publicId,
                    avatarUrl: userAvatar || undefined,
                    email: session.user.email || undefined,
                  }}
                  onEditProfile={() => navigateTab('settings')}
                />
              )}
              {activeTab === 'adminDashboard' && (
                !session.isGuest && (!routeContext || routeContext.userId !== session.user.id)
                  ? <ContentLoadingSkeleton page="adminDashboard" />
                  : canViewAdminAnalytics
                    ? <AdminDashboardTab
                        key={session.user.id}
                        userId={session.user.id}
                        triggerConfirm={triggerConfirm}
                        mobile={isPhone}
                        onMobileBack={openPhoneMenu}
                      />
                    : <div role="alert" className="rounded-2xl border border-brand-border bg-brand-white p-6 text-sm text-brand-muted">{t('admin.noAccess')}</div>
              )}
              {activeTab === 'vault' && <VaultPage jobs={jobs} expenses={expenses} onOpenWht50={() => navigateTab('wht50')} />}
              {activeTab === 'wht50' && (
                <Wht50Page
                  onMobileBack={openPhoneMenu}
                  jobs={jobs}
                  triggerAlert={triggerAlert}
                  onOpenDocuments={() => navigateTab('invoice')}
                  onOpenVault={() => navigateTab('vault')}
                />
              )}
              {activeTab === 'receivables' && (
                <ReceivablesTab
                  onMobileBack={openPhoneMenu}
                  jobs={jobs}
                  onEditJob={handleEditJob}
                  onViewJob={handleViewJob}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                />
              )}
              {activeTab === 'incomeExpense' && (
                <IncomeExpenseTab
                  onMobileBack={openPhoneMenu}
                  fullFeatureAccess={fullFeatureAccess}
                  jobs={jobs}
                  expenses={expenses}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onAddExpense={handleAddExpense}
                  onEditExpense={handleEditExpense}
                  onDeleteExpense={handleDeleteExpense}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onExportData={handleExportData}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  autoOpenAdd={autoOpenAddExpense}
                  onAutoOpenAddHandled={() => setAutoOpenAddExpense(false)}
                  scrollToExpenseId={scrollToExpenseId}
                  onScrollToExpenseHandled={() => setScrollToExpenseId(null)}
                />
              )}
              {activeTab === 'calendar' && (
                <CalendarTab
                  fullFeatureAccess={fullFeatureAccess}
                  receivablesAccess={receivablesAccess}
                  jobs={jobs}
                  expenses={expenses}
                  settings={settings}
                  onViewJob={handleViewJob}
                  onEditJob={(id: string) => { setEditJobRequest(id); navigateTab('jobs'); }}
                  onDeleteJob={handleDeleteJob}
                  onAddJob={() => { setIsAddJobOpen(true); navigateTab('jobs'); }}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  initialDateKey={calendarFocusDate}
                  linkedView={calendarLinkView}
                  onInitialDateHandled={() => setCalendarFocusDate(null)}
                />
              )}
              {activeTab === 'plans' && (
                <PlansTab
                  fullFeatureAccess={fullFeatureAccess}
                  isPro={isPro}
                  isGuestPreview={isGuestProPreview}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  subscription={subscription}
                  onUpgrade={handleUpgrade}
                  onPromptPay={() => void handleUpgrade('promptpay')}
                  onStopAutoRenewal={() => void handleStopRenewal()}
                  onSubscribePeriod={(period, method) => void handleUpgrade(method, period)}
                  checkoutReady={checkoutReady}
                  billingBusy={billingBusy}
                  freeDocumentsAvailable
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  onMobileBack={openPhoneMenu}
                  onOpenImport={() => setIsImportOpen(true)}
                  recentImports={recentImports(jobs, expenses)}
                  onUndoImport={batchId => triggerConfirm(tr("ยกเลิกการนำเข้านี้"), tr("งานและรายจ่ายที่นำเข้าจากไฟล์นี้จะถูกนำออก และรายการที่ไฟล์นี้อัปเดตจะกลับเป็นค่าเดิม ข้อมูลอื่นไม่เปลี่ยน"), () => handleUndoImport(batchId))}
                  fullFeatureAccess={fullFeatureAccess}
                  key={`${financeOwner}:${settingsEntry.n}`}
                  initialView={settingsEntry.view}
                  isGroupFinance={!!financeGroupId}
                  businessProfileOwnerId={session?.isGuest ? undefined : financeOwner}
                  settings={settings}
                  onSwitchTab={(id: string) => { if (NAV_ITEMS.some(item => item.key === id)) navigateTab(id as TabKey); }}
                  onUpdateSettings={handleUpdateSettings}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
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
                  subscription={subscription}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  notifSettings={notifSettings}
                  onUpdateNotifSettings={setNotifSettings}
                  isPro={isPro}
                  darkMode={darkMode}
                  onSetDarkMode={setDarkMode}
                />
              )}
            </div>}
          </div>
          </Suspense>}
          </VaultProvider>
        </div>

        {isPhone && isMobileMenuOpen && renderMobileMenu()}
        {isPhone && (
          <MobileBottomNav
            calendarAccess={navItems.some(item => item.key === 'calendar')}
            current={isMobileMenuOpen ? 'menu' : activeTab === 'dashboard' || activeTab === 'jobs' || activeTab === 'calendar' || activeTab === 'incomeExpense' ? activeTab : 'menu'}
            onSelect={tab => {
              if (tab === 'menu') { setIsMobileMenuOpen(true); return; }
              // The bar's ปฏิทิน always opens the calendar view; ไทม์ไลน์ is one tap away on the page and in the menu.
              if (tab === 'calendar') { try { localStorage.setItem('cashsquirrel_calendar_view', 'calendar'); } catch { /* the calendar falls back to its default view */ } }
              setIsMobileMenuOpen(false);
              navigateTab(tab);
            }}
            onAddJob={() => { setIsMobileMenuOpen(false); setIsAddJobOpen(true); navigateTab('jobs'); }}
          />
        )}
        {showBuddy && (
          <Suspense fallback={null}>
            <AssistantBuddy mobile={isPhone} docked={isDesktop && !isPhone} push={isDesktop && !isPhone && isWideForPanel} page={activeTab} pageName={t(NAV_ITEMS.find(item => item.key === activeTab)?.labelKey ?? 'nav.dashboard')}
              userName={routeContext?.profile.displayName || undefined} hidden={birthOpen} arrival={buddyArrival} onPanelChange={setBuddyPanelOpen}
              onOpenChat={() => navigateTab('assistant')} onNavigate={path => navigatePath(path)} />
          </Suspense>
        )}
        {birthOpen && (
          <Suspense fallback={null}>
            <AssistantBirth name={routeContext?.profile.displayName || undefined} onDone={finishBirth}
              target={() => document.querySelector('.asx-buddy-btn')?.getBoundingClientRect() ?? null} />
          </Suspense>
        )}

        {/* Custom Dialog overlay */}
        <CustomDialog
          dialog={dialog}
          onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
        />
        {session && !session.isGuest && (
          <AccountSwitcher open={accountSwitcherOpen} onClose={() => setAccountSwitcherOpen(false)} currentAvatar={userAvatar || undefined}
            onAddAccount={email => { setAccountSwitcherOpen(false); setAddingAccount({ email, from: session.user.id }); }}
            title={isPhone ? tr("บัญชีของฉัน") : undefined}
            extra={isPhone ? (
              // Phones: profile and sign out live with the accounts, iOS grouped-list style.
              <div className="mt-3 overflow-hidden rounded-2xl border border-brand-border">
                {navItems.some(item => item.key === 'settings') && (
                  <button type="button" onClick={() => { setAccountSwitcherOpen(false); setIsMobileMenuOpen(false); setSettingsEntry(entry => ({ view: 'profile', n: entry.n + 1 })); navigateTab('settings'); }}
                    className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[15px] text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
                    <User className="h-[18px] w-[18px] shrink-0 text-brand-muted" /><span className="flex-1">{tr("โปรไฟล์")}</span><ChevronRight className="h-4 w-4 shrink-0 text-brand-muted" />
                  </button>
                )}
                <button type="button" onClick={() => { setAccountSwitcherOpen(false); setIsMobileMenuOpen(false); triggerConfirm(tr("ออกจากระบบ"), tr("คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?"), async () => { await handleSignOut(); }); }}
                  className="flex min-h-[52px] w-full items-center gap-3 border-t border-brand-border px-4 text-left text-[15px] font-medium text-[#C43A3A] transition-colors hover:bg-[#C43A3A]/[0.06] dark:text-[#F19A9A] cursor-pointer first:border-t-0">
                  <LogOut className="h-[18px] w-[18px] shrink-0" /><span className="flex-1">{tr("ออกจากระบบ")}</span>
                </button>
              </div>
            ) : undefined} />
        )}
        {qrPayment && <DirectQrModal period={qrPayment.period} checkout={qrPayment.checkout}
          status={qrPayment.status} error={qrPayment.error}
          onClose={() => { qrAttempt.current++; setQrPayment(null); }}
          onRetry={() => { void handleUpgrade('promptpay', qrPayment.period); }} />}
        {preparingCard && !embeddedPayment && <PreparingCardModal amount={PRO_PRICING[preparingCard].total} months={PRO_PRICING[preparingCard].months}
          onClose={() => { qrAttempt.current++; setPreparingCard(null); }}/>}
        {embeddedPayment?.customCard && <CardPaymentModal checkout={embeddedPayment} busy={billingBusy}
          onOptions={options => handleUpgrade('card', embeddedPayment.period, options, true)}
          onClose={() => { qrAttempt.current++; setEmbeddedPayment(null); }} onComplete={handleEmbeddedComplete}/>}
        {embeddedPayment && !embeddedPayment.customCard && <EmbeddedPaymentModal
          checkout={embeddedPayment}
          onClose={() => setEmbeddedPayment(null)}
          onComplete={handleEmbeddedComplete}
          onRetry={() => {
            const previous = embeddedPayment;
            setEmbeddedPayment(null);
            void handleUpgrade(previous.method, previous.period);
          }}
        />}

        {/* Import from Excel: computers and iPads open it from Settings and the Jobs page. */}
        {isImportOpen && (
          <Suspense fallback={null}>
            <ImportWizard
              open={isImportOpen}
              onClose={() => setIsImportOpen(false)}
              jobs={jobs}
              expenses={expenses}
              statuses={statuses}
              jobTypes={jobTypes}
              onImport={handleImportRows}
              onRetrySave={retryImportSave}
              onRestoreBackup={text => triggerConfirm(tr("นำเข้าข้อมูลจากไฟล์สำรอง"), tr("ข้อมูลในไฟล์จะแทนที่ข้อมูลปัจจุบันของหมวดเดียวกัน (งาน รายจ่าย เป้าหมาย การตั้งค่า และเอกสาร) ต้องการนำเข้าหรือไม่?"), () => handleImportData(text))}
              onUndo={handleUndoImport}
              onViewJobs={() => navigateTab('jobs')}
            />
          </Suspense>
        )}

        {/* 🎉 Pro plan promo, shown once/day to non-Pro users */}
        <AnimatePresence>
          {fullFeatureAccess && isProPromoOpen && (
            <Suspense fallback={null}><ProPromoModal
              introEligible={subscription?.introEligible === true}
              manageSubscription={hasOpenStripeSubscription}
              notice={proPromoNotice ?? undefined}
              onUpgrade={() => {
                setIsProPromoOpen(false);
                setProPromoNotice(null);
                handleUpgrade();
              }}
              onViewPlans={() => { setIsProPromoOpen(false); setProPromoNotice(null); navigateTab('plans'); }}
              onClose={() => { setIsProPromoOpen(false); setProPromoNotice(null); }}
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
                        {tr("เปิดใช้งานระบบคลาวด์ซิงค์ (Cloud Sync)")}</h3>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wide">
                        {tr("ซิงค์ข้อมูลระหว่างคอมและมือถืออัตโนมัติ")}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCloudModalOpen(false)}
                    className="p-1 px-2.5 rounded-lg bg-brand-faint hover:bg-brand-border/40 text-brand-muted text-xs font-bold cursor-pointer"
                  >
                    {tr("ปิด")}</button>
                </div>

                <div className="space-y-4 text-xs leading-relaxed text-brand-muted dark:text-neutral-300 mt-4">
                  {lastCloudError && (
                    <div className="p-3.5 bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl flex flex-col gap-1.5 text-[11px] leading-relaxed select-text">
                      <div className="flex gap-1.5 items-center font-extrabold text-red-800 dark:text-red-300">
                        <span>Found Sync Error:</span>
                        <span>{tr("มีปัญหาในการซิงค์ข้อมูล")}</span>
                      </div>
                      <p className="font-mono bg-black/5 dark:bg-black/25 p-2 rounded-xl mt-0.5 text-[10px] break-all border border-red-500/10">
                        {lastCloudError}
                      </p>
                    </div>
                  )}

                  <p>
                    {tr("ยินดีต้อนรับสู่ระบบ")}{' '}<strong className="text-brand-text">{tr("กระรอกตุนเงิน Cloud Sync")}</strong>{tr("! ข้อมูลทั้งหมดของคุณจะถูกบันทึกและซิงค์อย่างปลอดภัยโดยอัตโนมัติบนระบบคลาวด์แบบ Realtime เพื่อให้คุณสามารถใช้งานแอปพลิเคชันจากหลายอุปกรณ์พร้อมกันได้ทันทีอย่างไร้รอยต่อ")}</p>

                  <div className="bg-brand-faint p-4 rounded-2xl border border-brand-border/30 space-y-3">
                    <h4 className="font-extrabold text-brand-text flex items-center gap-1.5">
                      {tr("ความปลอดภัยและการเก็บข้อมูล:")}</h4>
                    <ul className="list-disc list-inside space-y-1.5 pl-1 font-medium text-brand-muted dark:text-neutral-300">
                      <li><strong>{tr("แยกพื้นที่ข้อมูลส่วนบุคคล:")}</strong> {tr("มีระบบรักษาความปลอดภัยที่แข็งแกร่ง ป้องกันไม่ให้ผู้อื่นเข้าถึงข้อมูลของคุณได้อย่างเด็ดขาด")}</li>
                      <li><strong>{tr("ซิงค์อัตโนมัติในเบื้องหลัง:")}</strong> {tr("เมื่อมีการแก้ไขข้อมูลใดๆ ระบบจะทำการบันทึกลงสู่เซิร์ฟเวอร์แบบดีเลย์ (Debounced Save) ทันทีเพื่อประหยัดพลังงานอินเทอร์เน็ต")}</li>
                      <li><strong>{tr("รองรับโหมดออฟไลน์:")}</strong> {tr("ทำงานได้ดีแม้สัญญานอินเทอร์เน็ตขาดหาย และจะซิงค์ข้อมูลล่าสุดเมื่อกลับมาเชื่อมต่ออีกครั้ง")}</li>
                    </ul>
                  </div>

                </div>

                <div className="mt-5 pt-3 border-t border-brand-border/40 flex justify-end">
                  <button
                    onClick={() => setIsCloudModalOpen(false)}
                    className="py-2.5 px-6 bg-brand-primary text-brand-secondary rounded-2xl text-xs font-extrabold tracking-wide shadow-md hover:shadow-lg transition-all cursor-pointer border border-brand-secondary"
                  >
                    {tr("รับทราบและปิดหน้านี้")}</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* The new-member questionnaire (นักเรียน / ฟรีแลนซ์ …) was removed on 2026-10-23 (owner: "เราจะรื้อแล้วเราจะทำใหม่").
            features/onboarding/ProfileSetupWizard.tsx is no longer rendered; it stays only as a reference for the redo. */}

        <MascotToast />
      </div>
    </div>
  );
}

import { uiSurface } from '../../components/ui/uiStyles';
import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React, { useState, useEffect } from 'react';
import { isPhaseOneFeatureAvailable } from '../../../../shared/featureAvailability';
import { AppSettings, FixedExpenseItem, NotifSettings, Invoice, InvoiceProfile } from '../../../../shared/types';
import { formatCurrency, sumFixedExpenseItems, dateLocale } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { apiFetch, apiJson } from '../../services/api';
import { authClient } from '../../services/auth';
import { saveNotificationPatch, readInvoices, saveCloud } from '../../services/cloud';
import { privateCache } from '../../services/privateCache';
import { useLanguage } from '../../i18n/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { importedLabel, type ImportBatch } from '../import/importBatches';
import {
  ArrowLeft, Bell, Building2, FileSpreadsheet, CalendarClock, Clock3, Copy, Database, Download, ExternalLink, FileJson, FileText,
  Globe, Link2, LogOut, Mail, Monitor, Moon, PenLine, PiggyBank, Plus, RefreshCw, ShieldCheck, Sun, Target, Trash2,
  Upload, User, UserRound,
} from 'lucide-react';
import { Drawer } from '../../components/ui/Drawer';
import { LineLogo } from '../../components/ui/LineLogo';
import { Choice, DetailHeader, Field, NavRow, Note, Panel, ProBadge, RowIcon, RowText, Section, SettingsHeadContext, Switch, rowShell, type SettingsHead } from './SettingsParts';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { MobilePageHero } from '../mobile/MobilePageHero';
import { IconClose, IconCheck } from '../../components/ui/icons';
import type { PublicProfile } from '../../../../shared/groups';
import { BrandImageField } from '../invoices/InvoiceTab';
import { DocumentPreview, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT } from '../invoices/DocumentA4';
import { findThaiBank } from '../invoices/thaiBanks';
import { BankPicker } from './BankPicker';

import { tr, trServer } from '../../i18n/tr';
const MAX_AVATAR_DATA_URL_LENGTH = 450_000;

async function prepareAvatarDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error(tr("รองรับเฉพาะรูป PNG, JPG หรือ WEBP"));
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    let longestEdge = Math.min(512, Math.max(image.naturalWidth, image.naturalHeight));
    let quality = 0.82;
    while (longestEdge >= 96) {
      const scale = longestEdge / Math.max(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error(tr("เบราว์เซอร์ไม่รองรับการเตรียมรูปภาพ"));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL('image/jpeg', quality);
      if (value.length <= MAX_AVATAR_DATA_URL_LENGTH) return value;
      longestEdge = Math.floor(longestEdge * 0.8);
      quality = Math.max(0.55, quality - 0.08);
    }
    throw new Error(tr("รูปภาพยังมีขนาดใหญ่เกินไป กรุณาเลือกภาพอื่น"));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export type SettingsView = 'home' | 'profile' | 'security' | 'business' | 'fixed' | 'notif' | 'line' | 'backup';

interface SettingsTabProps {
  fullFeatureAccess?: boolean;
  /** Excel import (computer and iPad): open it, and the imports that can still be undone. */
  onOpenImport?: () => void;
  recentImports?: ImportBatch[];
  onUndoImport?: (batchId: string) => void;
  /** The page to open on, for the phone menu's direct entries (profile, notifications, LINE). */
  initialView?: SettingsView;
  /** Phones: back to the menu, drawn in this page's own terracotta header. */
  onMobileBack?: () => void;
  isGroupFinance?: boolean;
  // Same value passed to InvoiceTab's `ownerId` -- the business profile (logo, name, tax ID,
  // bank account) lives in the same `issuer_profile` cloud field InvoiceTab already reads when
  // creating documents, so both must resolve to the same owner.
  businessProfileOwnerId?: string;
  settings: AppSettings;
  onSwitchTab: (tabId: string) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onImportData: (data: string) => void;
  onExportData: () => void;
  onClearAllData: () => void;
  cloudSyncStatus: 'synced' | 'pending' | 'failed' | 'not_setup';
  loadCloudData: (email: string) => void;
  onOpenCloudModal: () => void;
  session: any;
  onSignOut: () => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  triggerPrompt: (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void
  ) => void;
  userAvatar: string;
  onUpdateUserAvatar: (newAvatar: string) => void;
  subscription?: {
    status: 'free' | 'incomplete' | 'incomplete_expired' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
    plan: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeStatus: 'incomplete' | 'incomplete_expired' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused' | null;
    hasSubscription: boolean;
    introEligible: boolean;
    managed: boolean;
  } | null;
  isPaidActive?: boolean;
  isInFreeTrial?: boolean;
  trialEndsAt?: Date | null;
  notifSettings: NotifSettings;
  onUpdateNotifSettings: (notifSettings: NotifSettings) => void;
  isPro?: boolean;
  darkMode: boolean;
  onSetDarkMode: (dark: boolean) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  fullFeatureAccess = false,
  onOpenImport,
  recentImports = [],
  onUndoImport,
  initialView = 'home',
  onMobileBack,
  businessProfileOwnerId,
  settings,
  onSwitchTab,
  onUpdateSettings,
  onImportData,
  onExportData,
  onClearAllData,
  cloudSyncStatus,
  loadCloudData,
  onOpenCloudModal,
  session,
  onSignOut,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  userAvatar,
  onUpdateUserAvatar,
  subscription,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  notifSettings,
  onUpdateNotifSettings,
  isPro,
  isGroupFinance = false,
  darkMode,
  onSetDarkMode
}) => {
  const { t, language, toggleLanguage } = useLanguage();
  const [accountBusy, setAccountBusy] = useState(false);
  const [reminderTestBusy, setReminderTestBusy] = useState(false);
  const [reminderTestSent, setReminderTestSent] = useState(false);
  async function handleTestReminder() {
    if (reminderTestBusy) return;
    setReminderTestBusy(true);
    setReminderTestSent(false);
    try {
      await apiJson('/api/notify', { method: 'POST', body: JSON.stringify({ event: 'reminder-test' }) });
      setReminderTestSent(true);
    } catch (error) {
      triggerAlert(tr("ส่งแจ้งเตือนทดสอบไม่สำเร็จ"), error instanceof Error ? error.message : tr("กรุณาลองใหม่"));
    } finally { setReminderTestBusy(false); }
  }
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [deletionCode, setDeletionCode] = useState('');
  const [backupEmail, setBackupEmail] = useState<string | null>(null);
  const [backupInput, setBackupInput] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [backupPending, setBackupPending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [newFixedExpenseName, setNewFixedExpenseName] = useState('');
  const [newFixedExpenseAmount, setNewFixedExpenseAmount] = useState('');
  const [profile,setProfile]=useState<PublicProfile|null>(null);
  const [displayName,setDisplayName]=useState('');
  const [profileBusy,setProfileBusy]=useState(false);
  const managedSubscriptionBlocksClosure = Boolean(
    subscription?.hasSubscription
    && !['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );

  const showSubscriptionClosureGuard = () => triggerAlert(
    tr("จัดการการสมัครสมาชิกก่อน"),
    subscription?.cancelAtPeriodEnd
      ? tr("Stripe บันทึกการยกเลิกเมื่อสิ้นรอบแล้ว แต่บัญชียังต้องเปิดไว้เพื่อให้เข้าหน้าจัดการสมาชิกได้ กรุณารอจนสิ้นรอบที่ชำระและสถานะเปลี่ยนเป็นยกเลิกแล้ว จึงค่อยพักหรือปิดบัญชี")
      : tr("บัญชีนี้ยังมีการสมัครสมาชิก Stripe ที่อาจต่ออายุ กรุณาไปที่แพ็กเกจของคุณ เปิดหน้าจัดการสมาชิก และยกเลิกก่อน จากนั้นรอจนสิ้นรอบที่ชำระและสถานะเปลี่ยนเป็นยกเลิกแล้ว จึงค่อยพักหรือปิดบัญชี"),
    () => onSwitchTab('plans'),
  );

  // Settings opens on an overview of grouped rows; a row opens its detail page (or a small sheet).
  // LINE and the notification settings follow the launch policy (shared/featureAvailability.ts), not the admin-only switch.
  const lineAccess = isPhaseOneFeatureAvailable('line', fullFeatureAccess);
  const notificationsAccess = isPhaseOneFeatureAvailable('notifications', fullFeatureAccess);
  const [requestedView, setView] = useState<SettingsView>(initialView);
  const mobile = useMobileLayout();
  const [head, setHead] = useState<SettingsHead | null>(null);
  const view = !lineAccess && requestedView === 'line' ? 'home' : requestedView;
  const hasExistingNotifications = !session?.isGuest && !isGroupFinance && Boolean(
    notifSettings.lineUserId || notifSettings.monthlyReportEnabled || notifSettings.dailyDigestEnabled || notifSettings.wht50ReminderEnabled,
  );
  const [sheet, setSheet] = useState<null | 'language' | 'display' | 'target'>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');

  // Business profile (logo, name, tax ID, bank account) -- this is the same `issuer_profile`
  // cloud field InvoiceTab reads when creating a new document. Editing moved here (Settings is
  // where the mockup puts it); InvoiceTab now only reads it. Loaded independently the same way
  // InvoiceTab already loads it, since Settings mounts before Invoice ever has, so there's no
  // shared in-memory state to reuse.
  const businessIssuerKey = `cashflow_issuer_${businessProfileOwnerId || 'guest'}`;
  const [issuerProfile, setIssuerProfile] = useState<InvoiceProfile>({
    name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '', logoUrl: ''
  });
  const [businessProfileSaving, setBusinessProfileSaving] = useState(false);
  const [bankOtherMode, setBankOtherMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (businessProfileOwnerId) {
      readInvoices(businessProfileOwnerId).then(data => {
        if (cancelled) return;
        if (data.issuer_profile) { setIssuerProfile(data.issuer_profile); privateCache.setItem(businessIssuerKey, JSON.stringify(data.issuer_profile)); }
      }).catch(() => {});
      return () => { cancelled = true; };
    }
    const saved = privateCache.getItem(businessIssuerKey);
    if (saved) { try { setIssuerProfile(JSON.parse(saved)); } catch { /* ignore corrupt cache */ } }
  }, [businessProfileOwnerId]);

  const saveBusinessProfile = async () => {
    privateCache.setItem(businessIssuerKey, JSON.stringify(issuerProfile));
    if (!businessProfileOwnerId) { triggerAlert(tr("บันทึกสำเร็จ"), tr("บันทึกโปรไฟล์ธุรกิจไว้ในเครื่องนี้แล้ว")); return; }
    setBusinessProfileSaving(true);
    try {
      await saveCloud(businessProfileOwnerId, { issuer_profile: issuerProfile });
      triggerAlert(tr("บันทึกสำเร็จ"), tr("บันทึกโปรไฟล์ธุรกิจแล้ว ข้อมูลนี้จะถูกนำไปใช้เป็นค่าเริ่มต้นในเอกสารใบถัดไป"));
    } catch (error) {
      triggerAlert(tr("บันทึกไม่สำเร็จ"), (error as Error).message);
    } finally {
      setBusinessProfileSaving(false);
    }
  };

  const businessPreviewInvoice: Invoice = {
    id: 'settings-preview',
    documentType: 'invoice',
    documentNo: 'INV-2026-001',
    createdDate: new Date().toISOString().split('T')[0],
    issuer: issuerProfile,
    client: { name: tr("ชื่อลูกค้าตัวอย่าง"), address: tr("ที่อยู่ลูกค้าตัวอย่าง"), phone: '', email: '', taxId: '' },
    items: [{ id: 'p1', description: tr("รายการตัวอย่าง"), quantity: 1, price: 1000 }],
    vatRate: 0,
    whtRate: 0
  };

  const pauseAccount = () => {
    if (managedSubscriptionBlocksClosure) { showSubscriptionClosureGuard(); return; }
    triggerConfirm(
    tr("ยืนยันพักบัญชี 30 วัน"),
    tr("กดตกลงเพื่อพักบัญชีและออกจากระบบทุกอุปกรณ์ คุณเปิดใช้บัญชีอีกครั้งได้ภายใน 30 วัน ระบบจะส่งอีเมลเตือนวันละหนึ่งฉบับใน 3 วันสุดท้ายก่อนครบกำหนด หากไม่กลับมา บัญชีและข้อมูลของคุณจะถูกลบถาวรในการประมวลผลรายวันและกู้คืนไม่ได้ การสมัครสมาชิก Stripe ต้องสิ้นสุดแล้วก่อนพักบัญชี ต้องมีหัวหน้ากลุ่มและ admin คนอื่นที่ยังใช้งานได้ก่อนพักบัญชี หากภายหลังเกิดเงื่อนไขที่ทำให้ลบไม่ได้ ระบบจะเลื่อนการลบและลองใหม่ในวันถัดไป"),
    async () => {
      setAccountBusy(true);
      const result = await authClient.auth.pauseAccount();
      setAccountBusy(false);
      if (result.error) triggerAlert(tr("พักบัญชีไม่สำเร็จ"), result.error.message);
    }
    );
  };

  const requestDeletion = () => {
    if (managedSubscriptionBlocksClosure) { showSubscriptionClosureGuard(); return; }
    triggerConfirm(
    tr("ยืนยันคำขอลบบัญชี"),
    tr("บัญชีจะปิดใช้งานทันที แต่ข้อมูลยังอยู่ 30 วัน การสมัครสมาชิก Stripe ต้องสิ้นสุดแล้วก่อนปิดบัญชี ระบบจะไม่ส่งแจ้งเตือนการลบให้แอดมินโดยอัตโนมัติ หากต้องการกู้คืนก่อนครบกำหนด ให้ติดต่อแอดมินเพื่อขอลิงก์ แล้วรับรหัส 6 หลักทางอีเมลสำรองที่ยืนยันไว้ หลังครบ 30 วันข้อมูลจะถูกลบถาวร ขั้นต่อไปต้องกรอกรหัสจากอีเมลหลัก"),
    async () => {
      setAccountBusy(true);
      const result = await authClient.auth.requestAccountDeletion();
      setAccountBusy(false);
      if (result.error) triggerAlert(tr("ส่งรหัสไม่สำเร็จ"), result.error.message);
      else { setDeletionCode(''); setDeletionRequested(true); triggerAlert(tr("ส่งรหัสแล้ว"), tr("กรอกรหัส 6 หลักจากอีเมลภายใน 5 นาทีเพื่อยืนยันการลบบัญชี")); }
    }
    );
  };

  const deleteAccount = async () => {
    if (managedSubscriptionBlocksClosure) { showSubscriptionClosureGuard(); return; }
    if (!/^\d{6}$/.test(deletionCode)) { triggerAlert(tr("รหัสไม่ครบ"), tr("กรุณากรอกรหัสยืนยัน 6 หลัก")); return; }
    setAccountBusy(true);
    const result = await authClient.auth.deleteAccount(deletionCode);
    setAccountBusy(false);
    if (result.error) triggerAlert(tr("ปิดบัญชีไม่สำเร็จ"), result.error.message);
    else { setDeletionCode(''); setDeletionRequested(false); }
  };

  useEffect(()=>{
    if(!session?.user?.id || session?.isGuest || isGroupFinance)return;
    const controller=new AbortController();
    apiJson<PublicProfile>('/api/profile',{signal:controller.signal,headers:{'X-Account-ID':session.user.id}})
      .then(value=>{setProfile(value);setDisplayName(value.displayName);})
      .catch(error=>{if(!controller.signal.aborted)triggerAlert(tr("โหลดโปรไฟล์ไม่สำเร็จ"),error.message);});
    return()=>controller.abort();
  },[session?.user?.id,session?.isGuest,isGroupFinance]);

  useEffect(() => {
    if (!session?.user?.id || session?.isGuest || isGroupFinance) return;
    const controller = new AbortController();
    apiJson<{ backupEmail: string | null }>('/api/account', { signal: controller.signal, headers: { 'X-Account-ID': session.user.id } })
      .then(value => setBackupEmail(value.backupEmail)).catch(() => {});
    return () => controller.abort();
  }, [session?.user?.id, session?.isGuest, isGroupFinance]);

  const requestBackupEmail = async () => {
    setAccountBusy(true);
    try {
      await apiJson('/api/account', { method: 'POST', headers: { 'X-Account-ID': session.user.id }, body: JSON.stringify({ action: 'backup-request', email: backupInput.trim() }) });
      setBackupPending(true);
      triggerAlert(tr("ส่งรหัสแล้ว"), tr("ตรวจอีเมลสำรองและกรอกรหัส 6 หลักภายใน 5 นาที"));
    } catch (error) { triggerAlert(tr("ส่งรหัสไม่สำเร็จ"), (error as Error).message); }
    finally { setAccountBusy(false); }
  };

  const confirmBackupEmail = async () => {
    setAccountBusy(true);
    try {
      const value = await apiJson<{ backupEmail: string }>('/api/account', { method: 'POST', headers: { 'X-Account-ID': session.user.id }, body: JSON.stringify({ action: 'backup-confirm', code: backupCode }) });
      setBackupEmail(value.backupEmail); setBackupPending(false); setBackupCode('');
      triggerAlert(tr("ยืนยันสำเร็จ"), tr("อีเมลนี้ใช้รับรหัสกู้คืนได้ หลังแอดมินสร้างลิงก์ให้ ซึ่งลิงก์มีอายุ 1 ชั่วโมงและต้องใช้ก่อนครบ 30 วัน"));
    } catch (error) { triggerAlert(tr("ยืนยันไม่สำเร็จ"), (error as Error).message); }
    finally { setAccountBusy(false); }
  };

  const saveProfile=async()=>{
    if(!session?.user?.id || displayName.trim().length<2)return;
    setProfileBusy(true);
    try { const value=await apiJson<PublicProfile>('/api/profile',{method:'POST',headers:{'X-Account-ID':session.user.id},body:JSON.stringify({displayName:displayName.trim()})});setProfile(value);setDisplayName(value.displayName);window.dispatchEvent(new CustomEvent('cash-squirrel:profile-updated',{detail:value}));triggerAlert(tr("บันทึกชื่อแล้ว"),tr("ชื่อใหม่จะแสดงในกลุ่มและผลการค้นหา")); }
    catch(error){triggerAlert(tr("บันทึกชื่อไม่สำเร็จ"),(error as Error).message);} finally{setProfileBusy(false);}
  };

  const [lineLinkCode, setLineLinkCode] = useState<string | null>(null);
  const [lineLinkCodeExpiresAt, setLineLinkCodeExpiresAt] = useState<number | null>(null);
  const [lineLinkSecondsLeft, setLineLinkSecondsLeft] = useState(0);
  const [isGeneratingLineCode, setIsGeneratingLineCode] = useState(false);
  const [lineLinkCopied, setLineLinkCopied] = useState(false);

  const handleGenerateLineCode = async () => {
    if (!lineAccess) return;
    setIsGeneratingLineCode(true);
    try {

      const res = await apiFetch('/api/line-link-code', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'X-Account-ID': session.user.id },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ? trServer(json.error) : tr("สร้างรหัสเชื่อมต่อไม่สำเร็จ"));
      setLineLinkCode(json.code);
      setLineLinkCodeExpiresAt(new Date(json.expiresAt).getTime());
      setLineLinkSecondsLeft(Math.max(0, Math.ceil((new Date(json.expiresAt).getTime() - Date.now()) / 1000)));
      setLineLinkCopied(false);
    } catch (err: any) {
      triggerAlert(tr("สร้างรหัสเชื่อมต่อไม่สำเร็จ"), err.message || tr("ลองใหม่อีกครั้งครับ"));
    } finally {
      setIsGeneratingLineCode(false);
    }
  };

  const handleCopyLineCode = () => {
    if (!lineLinkCode || lineLinkSecondsLeft <= 0) return;
    navigator.clipboard.writeText(lineLinkCode).then(() => {
      setLineLinkCopied(true);
      setTimeout(() => setLineLinkCopied(false), 2000);
    });
  };

  useEffect(() => {
    if (!lineLinkCode || !lineLinkCodeExpiresAt || notifSettings.lineUserId) return;
    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((lineLinkCodeExpiresAt - Date.now()) / 1000));
      setLineLinkSecondsLeft(seconds);
      if (seconds === 0) setLineLinkCopied(false);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [lineLinkCode, lineLinkCodeExpiresAt, notifSettings.lineUserId]);

  // Reminder toggles below write straight to merge_notif_settings the moment they're
  // clicked, the same way handleDisconnectLine does for lineUserId, instead of only relying on
  // the generic 1.5s-debounced autosave. That debounce has an acknowledged data-loss window (see
  // saveCloudData in App.tsx) -- a reload/backgrounded tab shortly after toggling can lose the
  // pending write entirely, and the next load then reads the stale (still-enabled) value back
  // from the cloud, making the toggle look like it silently turned itself back on.
  const persistNotifPatch = (patch: Partial<NotifSettings>) => {
    const userId = session?.user?.id;
    if (!userId) return;
    saveNotificationPatch(userId, patch).catch(error => triggerAlert(tr("บันทึกการแจ้งเตือนไม่สำเร็จ"), error.message));
  };

  const handleToggleMonthlyReport = () => {
    const monthlyReportEnabled = !notifSettings.monthlyReportEnabled;
    onUpdateNotifSettings({ ...notifSettings, monthlyReportEnabled });
    persistNotifPatch({ monthlyReportEnabled });
  };

  const handleToggleDailyDigest = () => {
    const dailyDigestEnabled = !notifSettings.dailyDigestEnabled;
    onUpdateNotifSettings({ ...notifSettings, dailyDigestEnabled });
    persistNotifPatch({ dailyDigestEnabled });
  };

  const handleToggleWht50Reminder = () => {
    const wht50ReminderEnabled = !notifSettings.wht50ReminderEnabled;
    onUpdateNotifSettings({ ...notifSettings, wht50ReminderEnabled });
    persistNotifPatch({ wht50ReminderEnabled });
  };

  const handleDisconnectLine = () => {
    triggerConfirm(
      tr("ยกเลิกการเชื่อมต่อ LINE"),
      tr("คุณต้องการยกเลิกการรับแจ้งเตือนผ่าน LINE ใช่หรือไม่? ยังรับแจ้งเตือนทางอีเมลได้ตามปกติ"),
      async () => {
        try {
          await apiJson('/api/line-link-code', { method: 'POST', headers: { 'X-Account-ID': session.user.id }, body: JSON.stringify({ action: 'disconnect' }) });
          onUpdateNotifSettings({ ...notifSettings, lineUserId: null });
          setLineLinkCode(null);
          setLineLinkCodeExpiresAt(null);
          setLineLinkSecondsLeft(0);
        } catch (error: any) { triggerAlert(tr("ยกเลิกการเชื่อมต่อไม่สำเร็จ"), error.message); }

      }
    );
  };

  // While a link code is showing, poll for the webhook having linked the account (it happens
  // from an entirely separate LINE-app session, so there's no other signal this tab would get).
  // Without this, the UI keeps showing "not connected" until a manual reload even though the
  // link already succeeded server-side.
  useEffect(() => {
    if (!lineAccess || !lineLinkCode || notifSettings.lineUserId) return;
    const userId = session?.user?.id;
    if (!userId) return;
    const interval = setInterval(async () => {
      let data: any;
      try { const result = await apiJson<any>('/api/data', { headers: { 'X-Account-ID': userId } }); data = result.snapshot; }
      catch { return; }
      if (!data?.notif_settings?.lineUserId) return;
      setLineLinkCode(null);
      setLineLinkCodeExpiresAt(null);
      setLineLinkSecondsLeft(0);
      onUpdateNotifSettings({ ...notifSettings, lineUserId: data.notif_settings.lineUserId });
    }, 3000);
    return () => clearInterval(interval);
  }, [lineLinkCode, notifSettings.lineUserId, session?.user?.id, lineAccess]);

  const fixedExpenseItems = settings.fixedExpenseItems || [];

  const handleAddFixedExpenseItem = () => {
    const amount = parseFloat(newFixedExpenseAmount);
    if (!newFixedExpenseName.trim() || isNaN(amount) || amount < 0) return;

    // First item ever added: carry the existing lump-sum value forward so nothing is lost
    let baseItems = fixedExpenseItems;
    if (baseItems.length === 0 && settings.monthlyExpense > 0) {
      baseItems = [{ id: crypto.randomUUID(), name: tr("ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)"), amount: settings.monthlyExpense }];
    }

    const newItem: FixedExpenseItem = { id: crypto.randomUUID(), name: newFixedExpenseName.trim(), amount };
    const updatedItems = [...baseItems, newItem];

    onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
    setNewFixedExpenseName('');
    setNewFixedExpenseAmount('');
  };

  const handleRemoveFixedExpenseItem = (id: string) => {
    const updatedItems = fixedExpenseItems.filter(item => item.id !== id);
    onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
  };

  const handleAvatarFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      triggerAlert(tr("ไฟล์ใหญ่เกินไป"), tr("กรุณาเลือกรูปภาพที่มีขนาดไม่เกิน 5MB"));
      return;
    }
    try {
      onUpdateUserAvatar(await prepareAvatarDataUrl(file));
    } catch (error) {
      triggerAlert(tr("ใช้รูปภาพนี้ไม่ได้"), error instanceof Error ? error.message : tr("กรุณาลองเลือกรูปอื่น"));
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/json" || file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          try {
            JSON.parse(text); // validation check
            confirmImport(text);
          } catch (err) {
            triggerAlert(tr("ไฟล์ไม่ถูกต้อง"), tr("ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง"));
          }
        };
        reader.readAsText(file);
      } else {
        triggerAlert(tr("ประเภทไฟล์ไม่ถูกต้อง"), tr("โปรดอัปโหลดไฟล์สำรองที่มีนามสกุล .json เท่านั้น"));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        JSON.parse(text); // validation check
        confirmImport(text);
      } catch (err) {
        triggerAlert(tr("ไฟล์ไม่ถูกต้อง"), tr("ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง"));
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = () => {
    const correctCode = Math.floor(1000 + Math.random() * 9000).toString();
    triggerConfirm(
      tr("ยืนยันต้องการล้างข้อมูลทั้งหมดใช่ไหม?"),
      tr("คำเตือนสูงสุด: ข้อมูลดีลงาน รายรับ รายจ่ายผันแปร และข้อมูลเป้าหมายออมเงินสะสมทั้งหมดจะถูกลบถาวร!\n\nโปรดตรวจสอบรหัสความปลอดภัยสำหรับการยืนยันลบในขั้นถัดไป: [ {0} ]", correctCode),
      () => {
        setTimeout(() => {
          triggerPrompt(
            tr("ป้อนรหัสเพื่อล้างข้อมูลแอป"),
            tr("กรุณากรอกรหัสรักษาความปลอดภัย 4 หลัก [ {0} ] เพื่อเริ่มล้างระบบข้อมูลถาวร:", correctCode),
            '',
            tr("พิมพ์รหัส 4 หลักที่แสดงอยู่บนจอ"),
            'text',
            (enteredVal) => {
              if (enteredVal.trim() === correctCode) {
                onClearAllData();
                triggerAlert(tr("ล้างข้อมูลสำเร็จ"), tr("ข้อมูลและรายละเอียดทางการเงินทั้งหมดถูกรีเซ็ตออกจากแอปอย่างปลอดภัยแล้ว"));
              } else {
                triggerAlert(tr("รหัสไม่ถูกต้อง"), tr("รหัสความปลอดภัยที่คุณกรอกไม่ถูกต้อง ระบบได้ล็อคการเข้าถึงและยกเลิกกระบวนการลบทันที"));
              }
            }
          );
        }, 350);
      }
    );
  };

  // ---------- layout pieces (display only; every change still goes through the handlers above) ----------
  const isAccount = Boolean(session && !session.isGuest && !isGroupFinance);

  const openView = (next: SettingsView) => {
    setView(!lineAccess && next === 'line' ? 'home' : next);
    document.getElementById('main-content')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  const copyPublicId = () => {
    if (!profile?.publicId) return;
    void navigator.clipboard.writeText(profile.publicId).then(() => { setIdCopied(true); window.setTimeout(() => setIdCopied(false), 1600); });
  };

  const avatarImg = (size: number) => (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F3EEE8] text-[#8A5A3A] dark:bg-[#2A2B2F] dark:text-[#E8C9B3]" style={{ width: size, height: size }}>
      {userAvatar ? <img src={userAvatar} alt="" className="h-full w-full object-cover" /> : <User className="h-1/2 w-1/2" />}
    </span>
  );

  const lineConnected = Boolean(notifSettings.lineUserId);
  const lineStatus = lineConnected
    ? <span className="text-[13px] font-medium text-[#0A8F3F] dark:text-[#4ADE80]">{tr("เชื่อมต่อแล้ว")}</span>
    : <span className="text-[13px] font-medium text-[#C24A16] dark:text-[#FF9A6B]">{tr("ยังไม่ได้เชื่อมต่อ")}</span>;
  const startLineConnect = () => {
    if (!lineAccess) return;
    if (!isPro) { onSwitchTab('plans'); return; }
    triggerConfirm(
      tr("ก่อนเชื่อมต่อ LINE"),
      tr("เมื่อเชื่อมต่อแล้ว ข้อมูลที่คุณบันทึก (ชื่องาน ชื่อลูกค้า ยอดเงิน) อาจถูกส่งเป็นข้อความแจ้งเตือนเข้าแชท LINE ของคุณ หากใช้ผู้ช่วยสนทนา ข้อความและข้อมูลบัญชีที่เกี่ยวข้องจะถูกส่งให้ Anthropic ประมวลผลคำตอบด้วย กรุณาตรวจสอบว่าไม่มีคนอื่นเข้าถึงแชท LINE นี้ได้ ต้องการเชื่อมต่อต่อหรือไม่?"),
      () => handleGenerateLineCode()
    );
  };

  // Restoring replaces the data in the file's sections, so it always asks first.
  const confirmImport = (text: string) => triggerConfirm(
    tr("นำเข้าข้อมูลจากไฟล์สำรอง"),
    tr("ข้อมูลในไฟล์จะแทนที่ข้อมูลปัจจุบันของหมวดเดียวกัน (งาน รายจ่าย เป้าหมาย การตั้งค่า และเอกสาร) ต้องการนำเข้าหรือไม่?"),
    () => onImportData(text)
  );

  const goalsOn = settings.goalsFeatureEnabled !== false;
  const sheetTitle = sheet === 'language' ? 'ภาษา' : sheet === 'display' ? 'การแสดงผล' : 'เป้ารายรับต่อเดือน';
  const detail = (() => {
    switch (view) {
      case 'profile': return (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("ข้อมูลส่วนตัว")} subtitle={tr("แก้ไขข้อมูลบัญชีของคุณ")} />
          <Panel>
            <Field label={tr("รูปโปรไฟล์")}>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                {avatarImg(72)}
                <div className="flex flex-wrap gap-2">
                  <label className={`${uiSecondaryButton} cursor-pointer px-3.5 text-[13px]`}>
                    <Upload className="h-4 w-4" />{tr("เปลี่ยนรูปโปรไฟล์")}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void handleAvatarFile(event)} />
                  </label>
                  {userAvatar && <button type="button" onClick={() => onUpdateUserAvatar('')} className={`${uiSecondaryButton} px-3.5 text-[13px] text-[#C43A3A] dark:text-[#F19A9A]`}>{tr("ลบรูป")}</button>}
                </div>
              </div>
            </Field>
            {isAccount ? (<>
              <div className="border-t border-brand-border" />
              <Field label={tr("ชื่อที่แสดง")} hint={tr("ชื่อที่แสดงในแอป ในทีม และผลการค้นหา")} htmlFor="settings-display-name">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="settings-display-name" className={uiInput} value={displayName} onChange={e => setDisplayName(e.target.value)} minLength={2} maxLength={60} />
                  <button type="button" onClick={() => void saveProfile()}
                    disabled={profileBusy || displayName.trim().length < 2 || displayName.trim() === profile?.displayName}
                    className={`${uiPrimaryButton} shrink-0 px-5 text-[13px]`}>{profileBusy ? tr("กำลังบันทึก…") : tr("บันทึกชื่อ")}</button>
                </div>
              </Field>
              <Field label={tr("อีเมล")} hint={tr("ใช้สำหรับเข้าสู่ระบบและรับแจ้งเตือน แก้ไขไม่ได้")}>
                <p className="rounded-[10px] border border-brand-border bg-brand-faint px-3.5 py-2.5 text-[14px] text-brand-text">{session?.user?.email || '—'}</p>
              </Field>
              <Field label="User ID" hint={tr("ใช้สำหรับค้นหาคุณและเชิญเข้ากลุ่ม แก้ไขไม่ได้")}>
                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-brand-border bg-brand-faint px-3.5 py-2.5">
                  <code className="text-[14px] font-medium text-brand-text">{profile?.publicId || tr("กำลังโหลด…")}</code>
                  {profile?.publicId && (
                    <button type="button" onClick={copyPublicId} aria-label={tr("คัดลอก User ID")} className="inline-flex items-center gap-1 text-xs text-brand-muted transition-colors hover:text-brand-text cursor-pointer">
                      {idCopied ? <><IconCheck className="h-3.5 w-3.5 text-[#0A8F3F]" />{tr("คัดลอกแล้ว")}</> : <><Copy className="h-3.5 w-3.5" />{tr("คัดลอก")}</>}
                    </button>
                  )}
                </div>
              </Field>
            </>) : (
              <p className="border-t border-brand-border pt-4 text-[13px] text-brand-muted">
                {session?.isGuest ? tr("โหมดทดลองใช้งาน (Guest) ไม่มีบัญชีถาวรให้ตั้งชื่อหรือ User ID") : tr("ตอนนี้กำลังดูบัญชีการเงินของกลุ่ม ข้อมูลส่วนตัวแก้ได้เมื่อสลับกลับเป็นบัญชีส่วนตัว")}
              </p>
            )}
          </Panel>
        </div>
      );

      case 'security': return (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("บัญชี & ความปลอดภัย")} subtitle={tr("อีเมลสำรอง การเข้าสู่ระบบ และการจัดการบัญชี")} />
          {isAccount && (
            <Panel title={tr("อีเมลสำรอง")} desc={backupEmail ? <>{tr("ยืนยันแล้ว:")}{' '}<span className="font-medium text-brand-text">{backupEmail}</span></> : tr("เพิ่มและยืนยันอีเมลสำรองก่อนสั่งลบบัญชี ใช้รับรหัสกู้คืนบัญชี")}>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="email" autoComplete="email" value={backupInput} onChange={event => setBackupInput(event.target.value)}
                  placeholder={backupEmail ? tr("เปลี่ยนเป็นอีเมลใหม่") : tr("อีเมลสำรอง")} aria-label={tr("อีเมลสำรอง")} className={uiInput} />
                <button type="button" disabled={accountBusy || !backupInput.includes('@')} onClick={() => void requestBackupEmail()} className={`${uiSecondaryButton} shrink-0 px-4 text-[13px]`}>{tr("ส่งรหัสยืนยัน")}</button>
              </div>
              {backupPending && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={backupCode}
                    onChange={event => setBackupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={tr("รหัส 6 หลัก")} aria-label={tr("รหัสยืนยันอีเมลสำรอง")} className={uiInput} />
                  <button type="button" disabled={accountBusy || backupCode.length !== 6} onClick={() => void confirmBackupEmail()} className={`${uiPrimaryButton} shrink-0 px-4 text-[13px]`}>{tr("ยืนยันอีเมลสำรอง")}</button>
                </div>
              )}
            </Panel>
          )}
          <Panel title={tr("การเข้าสู่ระบบ")} desc={session?.isGuest ? tr("กำลังใช้โหมดทดลองใช้งาน") : <>{tr("เข้าสู่ระบบด้วย")}{' '}<span className="font-medium text-brand-text">{session?.user?.email}</span></>}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => triggerConfirm(tr("ออกจากระบบ"), tr("คุณต้องการออกจากระบบใช่หรือไม่?"), onSignOut)} className={`${uiSecondaryButton} px-4 text-[13px]`}>
                <LogOut className="h-4 w-4" />{tr("ออกจากระบบ")}</button>
            </div>
          </Panel>
          <Panel tone="danger" title={tr("โซนอันตราย")} desc={tr("การกระทำในส่วนนี้มีผลกับบัญชีและข้อมูลทั้งหมด โปรดอ่านรายละเอียดก่อนยืนยันทุกครั้ง")}>
            {isAccount && (<>
              <p className="text-xs leading-relaxed text-brand-muted">{tr("พักบัญชีหรือสั่งลบบัญชีได้ โดยข้อมูลจะถูกลบจริงหลัง 30 วัน ระบบไม่แจ้งแอดมินอัตโนมัติ หากมีการสมัครสมาชิก Stripe ต้องยกเลิกผ่านหน้าจัดการสมาชิกและรอให้สิ้นรอบที่ชำระก่อน เพื่อไม่ให้บัญชีถูกปิดขณะที่ยังอาจต่ออายุ หากสั่งลบถาวรและต้องการกู้คืน ให้ติดต่อแอดมินเพื่อขอลิงก์อายุ 1 ชั่วโมง แล้วรับรหัส 6 หลักทางอีเมลสำรองที่ยืนยันไว้")}</p>
              {managedSubscriptionBlocksClosure && (
                <button type="button" onClick={showSubscriptionClosureGuard}
                  className={`${uiSecondaryButton} w-full justify-center px-4 text-[13px]`}>
                  {tr("จัดการการสมัครสมาชิกก่อนพักหรือปิดบัญชี")}</button>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={accountBusy} onClick={pauseAccount}
                  className="rounded-xl border border-[#E8C27A] px-3 py-2.5 text-[13px] font-medium text-[#8A5A00] transition-colors hover:bg-[#FFF6E0] disabled:opacity-50 cursor-pointer dark:border-[#E8B84A]/40 dark:text-[#F3D28A] dark:hover:bg-[#E8B84A]/10">
                  {tr("พักบัญชีชั่วคราว 30 วัน")}</button>
                <button type="button" disabled={accountBusy || !backupEmail} onClick={requestDeletion}
                  className="rounded-xl border border-[#F0B8B8] px-3 py-2.5 text-[13px] font-medium text-[#B83434] transition-colors hover:bg-[#FDEEEE] disabled:opacity-50 cursor-pointer dark:border-[#F19A9A]/40 dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10">
                  {tr("ปิดบัญชีและลบข้อมูลหลัง 30 วัน")}</button>
              </div>
              {!backupEmail && <p className="text-xs text-brand-muted">{tr("ต้องยืนยันอีเมลสำรองก่อนจึงจะลบบัญชีได้")}</p>}
              {deletionRequested && (
                <div className="space-y-2 rounded-xl border border-[#F0B8B8] p-3 dark:border-[#F19A9A]/40">
                  <label htmlFor="account-deletion-code" className="block text-[13px] font-medium text-brand-text">{tr("รหัสยืนยันจากอีเมล")}</label>
                  <input id="account-deletion-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    value={deletionCode} onChange={event => setDeletionCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={uiInput} placeholder={tr("รหัส 6 หลัก")} />
                  <button type="button" disabled={accountBusy || deletionCode.length !== 6} onClick={() => triggerConfirm(
                    tr("ยืนยันปิดบัญชี"),
                    tr("กดตกลงเพื่อปิดการใช้งานบัญชีทันที ข้อมูลจะเก็บไว้ 30 วัน การสมัครสมาชิก Stripe ต้องสิ้นสุดแล้วก่อนดำเนินการ หากต้องการกู้คืนต้องขอลิงก์จากแอดมินภายในกำหนด ลิงก์มีอายุ 1 ชั่วโมงและต้องใช้อีเมลสำรองที่ยืนยันไว้ หลังครบกำหนดจะถูกลบถาวร"),
                    () => { void deleteAccount(); }
                  )}
                    className="w-full rounded-xl bg-[#C43A3A] px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 cursor-pointer">{tr("ยืนยันปิดบัญชี")}</button>
                </div>
              )}
              <div className="border-t border-brand-border" />
            </>)}
            <button type="button" onClick={clearAllData}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#F0B8B8] px-3 py-2.5 text-[13px] font-medium text-[#B83434] transition-colors hover:bg-[#FDEEEE] cursor-pointer dark:border-[#F19A9A]/40 dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10">
              <Trash2 className="h-4 w-4" />{tr("ล้างข้อมูลและรีเซ็ตแอปพลิเคชันทั้งหมด")}</button>
          </Panel>
        </div>
      );

      case 'business': return (
        <div className="max-w-3xl space-y-6 pb-20">
          <DetailHeader onBack={() => openView('home')} title={tr("โปรไฟล์ธุรกิจ")} subtitle={tr("ข้อมูลที่ใช้แสดงบนเอกสาร ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ")} />
          <section className={`${uiSurface} overflow-hidden`}>
            <p className="border-b border-brand-border px-5 py-3 text-[13px] font-medium text-brand-muted">{tr("ตัวอย่างส่วนหัวเอกสาร · เปลี่ยนตามที่คุณแก้ทันที")}</p>
            <div className="bg-[#EDE9E4] p-3 sm:p-4 dark:bg-[#141518]">
              <div className="mx-auto max-w-[640px] overflow-hidden rounded-lg shadow-sm">
                <DocumentPreview invoice={businessPreviewInvoice} crop={400} maxScale={0.8} />
              </div>
            </div>
          </section>
          <Panel title={tr("แบรนด์บนเอกสาร")} desc={tr("โลโก้และลายเซ็นที่แสดงบนเอกสารทุกประเภท")}>
            <div className="divide-y divide-brand-border">
              <div className="pb-5">
                <BrandImageField
                  title={tr("โลโก้ธุรกิจ")}
                  hint={tr("แสดงที่ส่วนหัวของเอกสารทุกประเภท และใช้เป็นตราประทับผู้ขาย")}
                  emptyLabel={tr("ไม่มีโลโก้")}
                  uploadLabel={tr("อัปโหลดโลโก้")}
                  removeLabel={tr("ลบโลโก้")}
                  value={issuerProfile.logoUrl}
                  onChange={(logoUrl) => setIssuerProfile(prev => ({ ...prev, logoUrl }))}
                  onError={triggerAlert}
                  size={{
                    label: tr("ขนาดโลโก้บนเอกสาร"),
                    value: issuerProfile.logoHeight || DEFAULT_LOGO_HEIGHT,
                    min: MIN_LOGO_HEIGHT,
                    max: MAX_LOGO_HEIGHT,
                    onChange: (logoHeight) => setIssuerProfile(prev => ({ ...prev, logoHeight }))
                  }}
                  extra={(
                    <div className="space-y-2.5 text-xs text-brand-muted">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="w-24 shrink-0">{tr("ตำแหน่งโลโก้")}</span>
                        <div className="flex gap-1.5" role="group" aria-label={tr("ตำแหน่งโลโก้")}>
                          {([['left', tr("ซ้าย")], ['center', tr("กลาง")], ['right', tr("ขวา")]] as const).map(([key, label]) => (
                            <button key={key} type="button" aria-pressed={(issuerProfile.logoPosition || 'left') === key}
                              onClick={() => setIssuerProfile(prev => ({ ...prev, logoPosition: key }))}
                              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${(issuerProfile.logoPosition || 'left') === key ? 'bg-[#E65F2B] text-white' : 'border border-brand-border text-brand-muted hover:bg-brand-faint'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-3">
                        <span className="w-24 shrink-0">{tr("เลื่อนซ้าย–ขวา")}</span>
                        <input type="range" min={0} max={100} step={1}
                          value={issuerProfile.logoPosition === 'custom' ? issuerProfile.logoOffset ?? 50 : issuerProfile.logoPosition === 'center' ? 50 : issuerProfile.logoPosition === 'right' ? 100 : 0}
                          onChange={(e) => setIssuerProfile(prev => ({ ...prev, logoPosition: 'custom', logoOffset: Number(e.target.value) }))}
                          aria-label={tr("เลื่อนโลโก้ซ้าย-ขวา")} className="w-full max-w-xs accent-[#E65F2B] cursor-pointer" />
                        <span className="w-12 text-right font-mono">{issuerProfile.logoPosition === 'custom' ? issuerProfile.logoOffset ?? 50 : issuerProfile.logoPosition === 'center' ? 50 : issuerProfile.logoPosition === 'right' ? 100 : 0}%</span>
                      </label>
                    </div>
                  )}
                />
              </div>
              <div className="pt-5">
                <BrandImageField
                  title={tr("ลายเซ็นผู้ออกเอกสาร")}
                  hint={tr("แสดงเหนือเส้นลายเซ็นในช่อง “ผู้ออกเอกสาร” แนะนำไฟล์ PNG พื้นหลังโปร่งใส")}
                  emptyLabel={tr("ไม่มีลายเซ็น")}
                  uploadLabel={tr("อัปโหลดลายเซ็น")}
                  removeLabel={tr("ลบลายเซ็น")}
                  value={issuerProfile.signatureUrl}
                  onChange={(signatureUrl) => setIssuerProfile(prev => ({ ...prev, signatureUrl }))}
                  onError={triggerAlert}
                />
              </div>
            </div>
          </Panel>
          <Panel title={tr("ข้อมูลธุรกิจ")} desc={tr("ชื่อและที่อยู่ผู้ออกเอกสาร")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("ชื่อธุรกิจ")} hint={tr("ใช้เป็นชื่อผู้ออกเอกสาร")} htmlFor="biz-name">
                <input id="biz-name" type="text" value={issuerProfile.name} onChange={(e) => setIssuerProfile({ ...issuerProfile, name: e.target.value })} placeholder={tr("เช่น นายออมสิน ดีแท้ หรือ บริษัท สัญญารัก จำกัด")} className={uiInput} />
              </Field>
              <Field label={tr("เลขผู้เสียภาษี")} hint={tr("แสดงบนใบกำกับภาษีเต็มรูป")} htmlFor="biz-tax">
                <input id="biz-tax" type="text" value={issuerProfile.taxId} onChange={(e) => setIssuerProfile({ ...issuerProfile, taxId: e.target.value })} placeholder={tr("เลขผู้เสียภาษี 13 หลัก")} className={`${uiInput} font-mono`} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={tr("ที่อยู่ออกใบเสร็จ / ที่อยู่จดทะเบียน")} htmlFor="biz-address">
                  <textarea id="biz-address" value={issuerProfile.address} onChange={(e) => setIssuerProfile({ ...issuerProfile, address: e.target.value })} placeholder={tr("เช่น 456 ถนนสุขุมวิท 21 แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110")} rows={3} className={uiInput} />
                </Field>
              </div>
              <Field label={tr("เบอร์โทรศัพท์ติดต่อ")} htmlFor="biz-phone">
                <input id="biz-phone" type="text" value={issuerProfile.phone} onChange={(e) => setIssuerProfile({ ...issuerProfile, phone: e.target.value })} placeholder={tr("เช่น 089-999-9999")} className={uiInput} />
              </Field>
              <Field label={tr("อีเมล")} htmlFor="biz-email">
                <input id="biz-email" type="email" value={issuerProfile.email} onChange={(e) => setIssuerProfile({ ...issuerProfile, email: e.target.value })} placeholder={tr("เช่น myemail@gmail.com")} className={uiInput} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={tr("เว็บไซต์ (ไม่บังคับ)")} htmlFor="biz-web">
                  <input id="biz-web" type="text" value={issuerProfile.website || ''} onChange={(e) => setIssuerProfile({ ...issuerProfile, website: e.target.value })} placeholder={tr("เช่น https://www.example.com")} className={uiInput} />
                </Field>
              </div>
            </div>
          </Panel>
          <Panel title={tr("ช่องทางรับเงิน")} desc={tr("บัญชีที่ลูกค้าใช้โอนเงิน แสดงท้ายเอกสาร")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={tr("ชื่อธนาคาร")}>
                <BankPicker
                  value={issuerProfile.bankName}
                  otherMode={bankOtherMode}
                  onPick={(choice) => {
                    if (choice === 'other') {
                      setBankOtherMode(true);
                      if (findThaiBank(issuerProfile.bankName)) setIssuerProfile({ ...issuerProfile, bankName: '' });
                    } else {
                      setBankOtherMode(false);
                      setIssuerProfile({ ...issuerProfile, bankName: choice.bankName });
                    }
                  }}
                />
                {!findThaiBank(issuerProfile.bankName) && (issuerProfile.bankName || bankOtherMode) && (
                  <input type="text" value={issuerProfile.bankName} onChange={(e) => setIssuerProfile({ ...issuerProfile, bankName: e.target.value })}
                    placeholder={tr("พิมพ์ชื่อธนาคาร / ช่องทางรับเงิน เช่น พร้อมเพย์")} aria-label={tr("ชื่อธนาคารอื่น ๆ")} className={`${uiInput} mt-2`} />
                )}
              </Field>
              <Field label={tr("เลขที่บัญชี")} htmlFor="biz-account">
                <input id="biz-account" type="text" value={issuerProfile.bankAccount} onChange={(e) => setIssuerProfile({ ...issuerProfile, bankAccount: e.target.value })} placeholder={tr("เช่น 123-4-56789-0")} className={`${uiInput} font-mono`} />
              </Field>
              <Field label={tr("ชื่อบัญชีโอนรับเงิน")} htmlFor="biz-account-name">
                <input id="biz-account-name" type="text" value={issuerProfile.bankAccountName} onChange={(e) => setIssuerProfile({ ...issuerProfile, bankAccountName: e.target.value })} placeholder={tr("เช่น นายออมสิน ดีแท้")} className={uiInput} />
              </Field>
            </div>
          </Panel>
          <div className="sticky bottom-4 z-10 flex justify-end">
            <button type="button" onClick={() => void saveBusinessProfile()} disabled={businessProfileSaving}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#E65F2B] px-6 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(230,95,43,0.3)] transition-colors hover:bg-[#D35221] disabled:opacity-50 cursor-pointer">
              {businessProfileSaving ? tr("กำลังบันทึก…") : tr("บันทึกโปรไฟล์ธุรกิจ")}
            </button>
          </div>
        </div>
      );

      case 'fixed': return (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("รายจ่ายประจำ")} subtitle={isGroupFinance ? tr("ค่าใช้จ่ายของกลุ่มที่เกิดขึ้นทุกเดือน ระบบรวมยอดให้อัตโนมัติ") : tr("ค่าใช้จ่ายที่เกิดขึ้นทุกเดือน เช่น ค่าเน็ต ค่าห้อง ค่าซอฟต์แวร์ ระบบรวมยอดให้อัตโนมัติ")} />
          <Panel>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-brand-muted">{isGroupFinance ? tr("ค่าใช้จ่ายกลุ่มรายเดือนคงที่") : tr("รวมต่อเดือน")}</p>
              <p className="font-mono text-[20px] font-semibold text-brand-text">{formatCurrency(settings.monthlyExpense)}</p>
            </div>
            {fixedExpenseItems.length > 0 ? (
              <ul className="divide-y divide-brand-border rounded-xl border border-brand-border">
                {fixedExpenseItems.map(item => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="truncate text-[14px] text-brand-text">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[14px] font-medium text-brand-text">{formatCurrency(item.amount)}</span>
                      <button type="button" onClick={() => handleRemoveFixedExpenseItem(item.id)} aria-label={tr("ลบ {0}", item.name)} title={tr("ลบรายการนี้")}
                        className="rounded-md p-1 text-brand-muted transition-colors hover:bg-[#FDEEEE] hover:text-[#C43A3A] cursor-pointer dark:hover:bg-[#F19A9A]/10 dark:hover:text-[#F19A9A]">
                        <IconClose className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-brand-border px-4 py-5 text-center text-[13px] text-brand-muted">{tr("ยังไม่มีรายการ เพิ่มรายการแรกด้านล่าง")}</p>
            )}
            <div className="flex items-center gap-2">
              <input type="text" value={newFixedExpenseName} onChange={(e) => setNewFixedExpenseName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                placeholder={tr("เช่น ค่าห้อง, ค่ารถ, ค่าเน็ต")} aria-label={tr("ชื่อรายการ")} className={`${uiInput} flex-1`} />
              <NumberInput value={newFixedExpenseAmount} onChange={setNewFixedExpenseAmount}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                placeholder={tr("บาท")} className={`${uiInput} w-28 shrink-0 font-mono`} />
              <button type="button" onClick={handleAddFixedExpenseItem} title={tr("เพิ่มรายการ")} aria-label={tr("เพิ่มรายการ")}
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-[#E65F2B] text-white transition-colors hover:bg-[#D35221] cursor-pointer">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </Panel>
        </div>
      );

      case 'notif': return !notificationsAccess ? (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("จัดการการแจ้งเตือนเดิม")} subtitle={tr("ปิดการแจ้งเตือนหรือยกเลิกช่องทางที่เคยเปิดใช้งาน")} />
          {hasExistingNotifications ? (
            <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`}>
              {([
                [tr("สรุปการเงินรายเดือน"), !!notifSettings.monthlyReportEnabled, handleToggleMonthlyReport],
                [tr("แจ้งเตือนเครดิตเทอม"), !!notifSettings.dailyDigestEnabled, handleToggleDailyDigest],
                [tr("แจ้งเตือนใบ 50 ทวิ"), !!notifSettings.wht50ReminderEnabled, handleToggleWht50Reminder],
              ] as const).filter(([, enabled]) => enabled).map(([title, , turnOff]) => (
                <div key={title} className={rowShell}>
                  <RowIcon icon={Bell} />
                  <RowText title={title} desc={tr("เปิดใช้งานไว้ก่อนหน้านี้")} />
                  <button type="button" onClick={turnOff} className={`${uiSecondaryButton} shrink-0 px-3 text-xs`} aria-label={tr("ปิด{0}", title)}>{tr("ปิดการแจ้งเตือน")}</button>
                </div>
              ))}
              {lineConnected && <div className={rowShell}>
                <RowIcon icon={Link2} />
                <RowText title={tr("LINE ที่เชื่อมต่อไว้")} desc={tr("ยกเลิกการเชื่อมต่อบัญชีเดิมได้ที่นี่")} />
                <button type="button" onClick={handleDisconnectLine} className={`${uiSecondaryButton} shrink-0 px-3 text-xs`}>{tr("ยกเลิกการเชื่อมต่อ")}</button>
              </div>}
            </div>
          ) : <Note>{tr("ไม่มีการแจ้งเตือนเดิมหรือช่องทางที่เชื่อมต่อไว้")}</Note>}
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("การแจ้งเตือน")} subtitle={tr("เลือกช่องทางและเรื่องที่อยากให้แจ้งเตือน")} />
          {isGroupFinance ? <Note>{tr("รายงานและไฟล์สำรองใช้ข้อมูลของกลุ่มที่เลือก การเชื่อม LINE และรายงานอัตโนมัติเป็นของบัญชีส่วนตัว")}</Note>
            : session?.isGuest ? <Note>{t('plans.guestPreviewSettingsNote')}</Note> : (<>
            <div className={`${uiSurface} divide-y divide-brand-border overflow-hidden`}>
              {([
                [tr("สรุปการเงินรายเดือน"), tr("ส่งทุกวันที่ 1 ของเดือน ทางอีเมลของบัญชีนี้ (และ LINE ถ้าเชื่อมต่อไว้)"), !!notifSettings.monthlyReportEnabled, handleToggleMonthlyReport],
                [tr("แจ้งเตือนเครดิตเทอม"), tr("เตือนก่อนครบกำหนดรับเงิน 1–2 วัน วันนี้ และเลยกำหนด ทุกวันประมาณ 08:00 น. (เวลาไทย) ทางอีเมลและ LINE ที่เชื่อมไว้"), !!notifSettings.dailyDigestEnabled, handleToggleDailyDigest],
                // 50 ทวิ is not launched yet (owner, 2026-10-21: it comes back here when they launch it). Accounts
                // that see the 50 ทวิ page, or that already turned the reminder on, keep the switch.
                ...(isPhaseOneFeatureAvailable('wht50', fullFeatureAccess) || notifSettings.wht50ReminderEnabled
                  ? [[tr("ติดตามใบ 50 ทวิ"), tr("รวมงานที่รับเงินแล้วอย่างน้อย 7 วันและยังไม่มีใบ 50 ทวิแนบ ส่งเข้า LINE ที่เชื่อมไว้วันที่ 1 ของเดือนประมาณ 08:00 น. (เวลาไทย) เมื่อมีรายการค้างเท่านั้น"), !!notifSettings.wht50ReminderEnabled, handleToggleWht50Reminder] as const]
                  : []),
              ] as const).map(([title, desc, on, toggle]) => (
                <div key={title} className={rowShell}>
                  <RowIcon icon={title === tr("สรุปการเงินรายเดือน") ? Mail : Bell} />
                  <RowText title={<>{title}{!isPro && <ProBadge />}</>} desc={isPro ? desc : tr("ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน")} />
                  {isPro ? <Switch on={on} onClick={toggle} label={title} />
                    : <button type="button" onClick={() => onSwitchTab('plans')} className={`${uiSecondaryButton} shrink-0 px-3 text-xs`}>{tr("อัปเกรด")}</button>}
                </div>
              ))}
              <NavRow lead={<LineLogo size={30} />} title="LINE" desc={tr("เชื่อมต่อเพื่อรับสรุปและติดตามเอกสารในแชท LINE")} value={lineStatus} onClick={() => openView('line')} />
            </div>
            {lineConnected && isPro && <Panel title={tr("ลองรับแจ้งเตือนทาง LINE")} desc={tr("ส่งการ์ดตัวอย่างใกล้ครบกำหนด วันนี้ และเลยกำหนด เข้าบัญชี LINE ที่คุณเชื่อมไว้เท่านั้น ไม่มีผลกับงานหรือยอดเงินจริง")}>
              <button type="button" onClick={handleTestReminder} disabled={reminderTestBusy} className={`${uiSecondaryButton} min-h-11 px-4 text-[13px] disabled:opacity-50`}>
                <Bell className="h-4 w-4" />{reminderTestBusy ? tr("กำลังส่ง…") : tr("ทดสอบแจ้งเตือนเข้า LINE")}
              </button>
              {reminderTestSent && <p role="status" className="text-[13px] text-brand-green-acc">{tr("LINE รับคำขอส่งแล้ว ลองเปิดแชทกระรอกตุนเงินเพื่อตรวจการ์ดทดสอบ")}</p>}
            </Panel>}
          </>)}
        </div>
      );

      case 'line': return (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title="LINE" subtitle={tr("รับแจ้งเตือนผ่าน LINE หลังเชื่อมต่อบัญชี")} />
          {isGroupFinance ? <Note>{tr("การเชื่อม LINE เป็นของบัญชีส่วนตัว สลับกลับเป็นบัญชีส่วนตัวเพื่อตั้งค่า")}</Note>
            : session?.isGuest ? <Note>{t('plans.guestPreviewSettingsNote')}</Note> : (
            <Panel>
              <div className="flex items-center gap-4">
                <LineLogo size={56} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[16px] font-semibold text-brand-text">LINE {!isPro && !lineConnected && <ProBadge />}</p>
                  <p className="mt-0.5 flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${lineConnected ? 'bg-[#06C755]' : 'bg-[#B8B2AB]'}`} />{lineStatus}
                  </p>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed text-brand-muted">
                {lineConnected
                  ? tr("แจ้งเตือนจะส่งเข้า LINE และผู้ช่วยสนทนาอาจส่งข้อมูลที่เกี่ยวข้องให้ Anthropic ประมวลผล")
                  : isPro
                    ? tr("เชื่อมบัญชี LINE เพื่อรับแจ้งเตือนเดียวกับอีเมล เผื่อพลาดดูอีเมล (ข้อมูลงานและยอดเงินจะปรากฏในแชท LINE)")
                    : tr("ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน")}
              </p>
              {lineConnected ? (
                <button type="button" onClick={handleDisconnectLine}
                  className="inline-flex h-10 items-center rounded-xl border border-[#F0B8B8] px-4 text-[13px] font-medium text-[#B83434] transition-colors hover:bg-[#FDEEEE] cursor-pointer dark:border-[#F19A9A]/40 dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10">
                  {tr("ยกเลิกการเชื่อมต่อ")}</button>
              ) : !lineLinkCode && (
                <button type="button" onClick={startLineConnect} disabled={isGeneratingLineCode}
                  className="inline-flex h-10 items-center rounded-xl bg-[#06C755] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#05B34C] disabled:opacity-50 cursor-pointer">
                  {isGeneratingLineCode ? tr("กำลังสร้างรหัส…") : isPro ? tr("เชื่อมต่อ LINE") : tr("อัปเกรดเป็น Pro")}
                </button>
              )}
              {lineLinkCode && !lineConnected && (
                <div className="space-y-3 border-t border-brand-border pt-4">
                  <div className="flex items-start gap-2 rounded-xl border border-[#06C755]/25 bg-[#06C755]/5 p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0A8F3F] dark:text-[#4ADE80]" />
                    <p className="text-xs leading-relaxed text-brand-muted"><span className="font-medium text-brand-text">{tr("ยืนยันบัญชี LINE อย่างปลอดภัย")}</span> {tr("รหัสนี้ใช้ได้ครั้งเดียวและผูกได้กับบัญชีที่กำลังเข้าใช้อยู่เท่านั้น ห้ามส่งต่อให้ผู้อื่น")}</p>
                  </div>
                  <ol className="space-y-1 text-[13px] leading-relaxed text-brand-muted">
                    <li>{tr("1. แอดเพื่อน LINE Official Account")}{' '}<span className="font-medium text-brand-text">@859mlugf</span>{' '}
                      <a href="https://line.me/R/ti/p/@859mlugf" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-[#0A8F3F] hover:underline dark:text-[#4ADE80]">{tr("เปิดลิงก์แอดเพื่อน")}{' '}<ExternalLink className="h-3 w-3" /></a>
                    </li>
                    <li>{tr("2. ส่งรหัสด้านล่างเข้าแชทภายใน 5 นาที เพื่อยืนยันว่า LINE นี้เป็นของคุณ")}</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <div className={`flex-1 rounded-xl border px-3 py-2.5 text-center font-mono text-lg font-semibold tracking-[0.18em] ${lineLinkSecondsLeft > 0 ? 'border-brand-border bg-brand-faint text-brand-text' : 'border-[#F0B8B8] text-[#C43A3A] dark:text-[#F19A9A]'}`}>{lineLinkCode}</div>
                    <button type="button" onClick={handleCopyLineCode} disabled={lineLinkSecondsLeft <= 0} title={tr("คัดลอกรหัส")} aria-label={tr("คัดลอกรหัส")}
                      className="shrink-0 rounded-xl border border-brand-border p-3 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text disabled:opacity-40 cursor-pointer">
                      {lineLinkCopied ? <IconCheck className="h-4 w-4 text-[#0A8F3F]" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`inline-flex items-center gap-1.5 text-xs font-medium ${lineLinkSecondsLeft > 0 ? 'text-brand-muted' : 'text-[#C43A3A] dark:text-[#F19A9A]'}`}>
                      <Clock3 className="h-3.5 w-3.5" />
                      {lineLinkSecondsLeft > 0 ? tr("หมดอายุใน {0}:{1} นาที", String(Math.floor(lineLinkSecondsLeft / 60)).padStart(2, '0'), String(lineLinkSecondsLeft % 60).padStart(2, '0')) : tr("รหัสหมดอายุแล้ว")}
                    </p>
                    {lineLinkSecondsLeft <= 0 && (
                      <button type="button" onClick={handleGenerateLineCode} disabled={isGeneratingLineCode} className="inline-flex items-center gap-1.5 rounded-lg bg-[#06C755] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#05B34C] disabled:opacity-50 cursor-pointer">
                        <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingLineCode ? 'animate-spin' : ''}`} />{tr("สร้างรหัสใหม่")}</button>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          )}
        </div>
      );

      case 'backup': return (
        <div className="max-w-2xl space-y-6">
          <DetailHeader onBack={() => openView('home')} title={tr("สำรอง & นำเข้าข้อมูล")} subtitle={tr("ดาวน์โหลดข้อมูลสำรอง หรือนำข้อมูลกลับเข้าสู่ระบบ")} />
          <Panel title={tr("สำรองข้อมูล")} desc={tr("ดาวน์โหลดงาน รายรับ รายจ่าย เอกสาร และการตั้งค่าทั้งหมดเป็นไฟล์ .json")}>
            <button type="button" onClick={onExportData} className={`${uiSecondaryButton} px-4 text-[13px]`}><Download className="h-4 w-4" />{tr("ดาวน์โหลด .json")}</button>
          </Panel>
          {/* Computers and iPads: one import for Excel, CSV and the app's own .json backup (owner,
              2026-10-23: two import cards read as the same thing). The phone keeps its .json card. */}
          {!mobile && onOpenImport ? (
            <Panel title={tr("นำเข้าข้อมูล")} desc={tr("นำเข้างานและรายจ่ายจาก Excel หรือ CSV หรือกู้คืนจากไฟล์สำรอง .json ที่เคยดาวน์โหลดไว้")}>
              <button type="button" onClick={onOpenImport} className={`${uiSecondaryButton} px-4 text-[13px]`} data-testid="settings-import-button"><FileSpreadsheet className="h-4 w-4" />{tr("เลือกไฟล์นำเข้า")}</button>
              {recentImports.length > 0 && (
                <ul className="mt-4 divide-y divide-brand-border rounded-xl border border-brand-border" aria-label={tr("การนำเข้าล่าสุด")}>
                  {recentImports.map(batch => (
                    <li key={batch.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                      <span className="text-brand-text">{tr("นำเข้าเมื่อ {0} · {1} งาน · {2} รายจ่าย", importedLabel(batch.at), batch.jobs, batch.expenses)}{batch.updates ? tr(" · อัปเดต {0} รายการ", batch.updates) : ''}</span>
                      {onUndoImport && <button type="button" onClick={() => onUndoImport(batch.id)} className="shrink-0 text-[13px] font-medium text-[#C24A16] hover:underline cursor-pointer dark:text-[#FF9A6B]">{tr("ยกเลิกการนำเข้านี้")}</button>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : (
          <Panel title={tr("นำเข้าข้อมูล")} desc={tr("ใช้ไฟล์สำรอง .json ที่เคยดาวน์โหลดไว้ ระบบจะถามยืนยันก่อนแทนที่ข้อมูล")}>
            <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed transition-colors ${dragActive ? 'border-[#E65F2B] bg-[#FFF5EE] dark:bg-[#E65F2B]/10' : 'border-brand-border bg-brand-faint/50 hover:border-[#F3B08C]'}`}>
              <input type="file" id="json-settings-uploader" accept=".json" className="hidden" onChange={handleFileChange} />
              <label htmlFor="json-settings-uploader" className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-1.5 p-6 text-center">
                <Upload className="h-6 w-6 text-brand-muted" />
                <span className="text-[14px] font-medium text-brand-text">{tr("ลากไฟล์ .json มาวางที่นี่")}</span>
                <span className="text-[13px] text-[#C24A16] dark:text-[#FF9A6B]">{tr("หรือเลือกไฟล์")}</span>
              </label>
            </div>
          </Panel>
          )}
        </div>
      );
      default: return null;
    }
  })();

  return (
    <SettingsHeadContext.Provider value={mobile ? setHead : null}>
    <div className="page-content space-y-6 pb-12">
      {/* Phones: the terracotta header, with a detail page's own title (DetailHeader hands it up). */}
      {mobile && <MobilePageHero title={head?.title ?? tr("ตั้งค่า")} sub={head?.subtitle} onBack={head ? head.onBack : onMobileBack} backLabel={head ? tr("ตั้งค่า") : tr("เมนู")} />}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} initial={{ opacity: 0, x: view === 'home' ? -10 : 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
          {view !== 'home' ? detail : (
            <div className="space-y-6">
              <PageHeader page="settings" />
              <div className="grid max-w-[1180px] items-start gap-7 lg:grid-cols-2">
                <div className="space-y-7">
                  {/* Profile summary */}
                  <div className={`${uiSurface} flex flex-wrap items-center gap-4 p-5`}>
                    {avatarImg(68)}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-semibold text-brand-text">{profile?.displayName || (session?.isGuest ? tr("โหมดทดลองใช้งาน") : session?.user?.email?.split('@')[0] || '—')}</p>
                      {session?.user?.email && <p className="truncate text-[13px] text-brand-muted">{session.user.email}</p>}
                      {profile?.publicId && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-brand-muted">
                          <span className="whitespace-nowrap font-mono">{profile.publicId}</span>
                          <button type="button" onClick={copyPublicId} aria-label={tr("คัดลอก User ID")} title={tr("คัดลอก User ID")} className="rounded p-0.5 transition-colors hover:text-brand-text cursor-pointer">
                            {idCopied ? <IconCheck className="h-3.5 w-3.5 text-[#0A8F3F]" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {idCopied && <span className="text-xs text-[#0A8F3F] dark:text-[#4ADE80]">{tr("คัดลอกแล้ว")}</span>}
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={() => openView('profile')} className={`${uiSecondaryButton} w-full shrink-0 px-4 text-[13px] sm:w-auto`}><PenLine className="h-4 w-4" />{tr("แก้ไขโปรไฟล์")}</button>
                  </div>

                  <Section icon={UserRound} title={tr("บัญชี")} id="settings-account">
                    <NavRow icon={User} title={tr("ข้อมูลส่วนตัว")} desc={tr("ชื่อที่แสดง อีเมล และ User ID")} onClick={() => openView('profile')} />
                    <NavRow icon={ShieldCheck} title={tr("บัญชี & ความปลอดภัย")} desc={tr("อีเมลสำรอง การเข้าสู่ระบบ และการจัดการบัญชี")} onClick={() => openView('security')} />
                  </Section>

                  <Section icon={Monitor} title={tr("การใช้งาน")} id="settings-usage">
                    <NavRow icon={Globe} title={tr("ภาษา")} desc={tr("เลือกภาษาที่ใช้ในแอป")} value={language === 'th' ? 'ไทย' : 'English'} onClick={() => setSheet('language')} />
                    <NavRow icon={darkMode ? Moon : Sun} title={tr("การแสดงผล")} desc={tr("ธีมและการแสดงผลของแอป")} value={darkMode ? tr("มืด") : tr("สว่าง")} onClick={() => setSheet('display')} />
                  </Section>
                </div>

                <div className="space-y-7">
                  <Section icon={FileText} title={tr("การเงินและเอกสาร")} id="settings-finance">
                    <NavRow icon={Building2} title={tr("โปรไฟล์ธุรกิจ")} desc={tr("โลโก้ ลายเซ็น ข้อมูลผู้ขาย และข้อมูลในเอกสาร")} onClick={() => openView('business')} />
                    <NavRow icon={CalendarClock} title={tr("รายจ่ายประจำ")} desc={tr("จัดการค่าใช้จ่ายที่เกิดขึ้นเป็นประจำ")} value={<span className="font-mono">{formatCurrency(settings.monthlyExpense)}</span>} onClick={() => openView('fixed')} />
                    {fullFeatureAccess && <NavRow icon={Target} title={tr("เป้ารายรับต่อเดือน")} desc={tr("ตั้งเป้ารายรับในแต่ละเดือน")} value={<span className="font-mono">{settings.monthlyRevenueGoal ? formatCurrency(settings.monthlyRevenueGoal) : tr("ยังไม่ได้ตั้ง")}</span>}
                      onClick={() => { setTargetDraft(settings.monthlyRevenueGoal ? String(settings.monthlyRevenueGoal) : ''); setSheet('target'); }} />}
                    {fullFeatureAccess && <div className={rowShell}>
                      <RowIcon icon={PiggyBank} />
                      <RowText title={tr("เป้าหมายการเงิน & การจัดสรร")} desc={tr("เปิดใช้งานเป้าหมายการเงินและการจัดสรรกำไร")} />
                      <Switch on={goalsOn} label={tr("เป้าหมายการเงิน & การจัดสรร")} onClick={() => onUpdateSettings({ ...settings, goalsFeatureEnabled: !goalsOn })} />
                    </div>}
                  </Section>

                  {/* LINE and the reminders are Pro (the reminder jobs only send to Pro, the trial and admin grants),
                      so they share one section (owner, 2026-10-21), as in the phone menu's LINE AI Pro. */}
                  {(lineAccess || notificationsAccess || hasExistingNotifications) && <Section icon={Link2} title={tr("LINE AI Pro · การแจ้งเตือน")} id="settings-connect">
                    {lineAccess && <NavRow lead={<LineLogo size={30} />} title="LINE" desc={tr("เชื่อมต่อ LINE เพื่อรับแจ้งเตือน")} value={lineStatus} onClick={() => openView('line')} />}
                    {(notificationsAccess || hasExistingNotifications) && <NavRow icon={Bell} title={notificationsAccess ? tr("การแจ้งเตือน") : tr("จัดการการแจ้งเตือนเดิม")} desc={notificationsAccess ? tr("เลือกช่องทางและเรื่องที่อยากให้แจ้งเตือน") : tr("ปิดการแจ้งเตือนหรือยกเลิกช่องทางที่เชื่อมต่อไว้")} value={notificationsAccess && !isPro ? <ProBadge /> : undefined} onClick={() => openView('notif')} />}
                  </Section>}

                  <Section icon={Database} title={tr("ข้อมูล")} id="settings-data">
                    <NavRow icon={FileJson} title={tr("สำรอง & นำเข้าข้อมูล")} desc={tr("ดาวน์โหลดข้อมูลสำรอง หรือนำข้อมูลกลับเข้าสู่ระบบ")} onClick={() => openView('backup')} />
                  </Section>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Small choices open in a compact side sheet instead of a full page */}
      <Drawer open={sheet !== null && (sheet !== 'target' || fullFeatureAccess)} title={sheetTitle} onClose={() => setSheet(null)} width={420}
        footer={sheet === 'target' ? (
          <button type="button" onClick={() => { onUpdateSettings({ ...settings, monthlyRevenueGoal: parseFloat(targetDraft) || 0 }); setSheet(null); }} className={`${uiPrimaryButton} w-full text-[14px]`}>{tr("บันทึก")}</button>
        ) : undefined}>
        {sheet === 'language' && (
          <div role="radiogroup" aria-label={tr("ภาษา")} className="space-y-2">
            <Choice selected={language === 'th'} label={tr("ไทย")} onClick={() => { language !== 'th' && toggleLanguage(); }} />
            <Choice selected={language === 'en'} label="English" onClick={() => { language !== 'en' && toggleLanguage(); }} />
            <p className="pt-2 text-xs leading-relaxed text-brand-muted">{t('settings.languageDescription')}</p>
          </div>
        )}
        {sheet === 'display' && (
          <div role="radiogroup" aria-label={tr("การแสดงผล")} className="space-y-2">
            <Choice selected={!darkMode} label={tr("สว่าง")} onClick={() => { onSetDarkMode(false); }} />
            <Choice selected={darkMode} label={tr("มืด")} onClick={() => { onSetDarkMode(true); }} />
            <p className="pt-2 text-xs leading-relaxed text-brand-muted">{tr("แอปจะสลับเป็นโหมดมืดตอน 18:00 และกลับเป็นโหมดสว่างตอน 06:00 อัตโนมัติ เลือกเองได้ทุกเมื่อ")}</p>
          </div>
        )}
        {sheet === 'target' && (
          <Field label={tr("ยอดเป้าหมาย (บาท)")} hint={tr("ใช้แสดงความคืบหน้าในหน้าภาพรวม")} htmlFor="settings-target">
            <NumberInput id="settings-target" value={targetDraft} onChange={setTargetDraft} className={`${uiInput} font-mono text-[16px]`} placeholder={tr("เช่น 50000")} />
          </Field>
        )}
      </Drawer>
    </div>
    </SettingsHeadContext.Provider>
  );
};

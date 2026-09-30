import React, { useState, useEffect } from 'react';
import { AppSettings, FixedExpenseItem, NotifSettings, Invoice, InvoiceProfile } from '../../../../shared/types';
import { formatCurrency, sumFixedExpenseItems, dateLocale } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { apiFetch, apiJson } from '../../services/api';
import { authClient } from '../../services/auth';
import { saveNotificationPatch, readInvoices, saveCloud } from '../../services/cloud';
import { privateCache } from '../../services/privateCache';
import { useLanguage } from '../../i18n/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  Upload,
  User,
  LogOut,
  Trash2,
  AlertCircle,
  ShieldAlert,
  FileJson,
  Lock,
  Database,
  Plus,
  ArrowRight,
  Bell,
  Mail,
  MessageCircle,
  ExternalLink,
  Copy,
  Languages,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Building2,
  Wallet,
  Sparkles,
  ShieldQuestion,
  KeyRound
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { IconCrown, IconClose, IconCheck } from '../../components/ui/icons';
import type { PublicProfile } from '../../../../shared/groups';
import { BrandImageField } from '../invoices/InvoiceTab';
import { DocumentPreview, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT } from '../invoices/DocumentA4';
import { THAI_BANKS, findThaiBank } from '../invoices/thaiBanks';

const MAX_AVATAR_DATA_URL_LENGTH = 450_000;

async function prepareAvatarDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('รองรับเฉพาะรูป PNG, JPG หรือ WEBP');
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
      if (!context) throw new Error('เบราว์เซอร์ไม่รองรับการเตรียมรูปภาพ');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL('image/jpeg', quality);
      if (value.length <= MAX_AVATAR_DATA_URL_LENGTH) return value;
      longestEdge = Math.floor(longestEdge * 0.8);
      quality = Math.max(0.55, quality - 0.08);
    }
    throw new Error('รูปภาพยังมีขนาดใหญ่เกินไป กรุณาเลือกภาพอื่น');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

type SettingsSection = 'account' | 'business' | 'finance' | 'features' | 'notif' | 'lang' | 'security' | 'backup';

const SUBNAV: { key: SettingsSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'account', label: 'บัญชีของฉัน', Icon: User },
  { key: 'business', label: 'โปรไฟล์ธุรกิจ', Icon: Building2 },
  { key: 'finance', label: 'การเงิน', Icon: Wallet },
  { key: 'features', label: 'ฟีเจอร์เสริม', Icon: Sparkles },
  { key: 'notif', label: 'การแจ้งเตือน', Icon: Bell },
  { key: 'lang', label: 'ภาษาและการแสดงผล', Icon: Languages },
  { key: 'security', label: 'ความปลอดภัย', Icon: ShieldQuestion },
  { key: 'backup', label: 'สำรองและนำเข้าข้อมูล', Icon: FileJson },
];

interface SettingsTabProps {
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
  onReplaySetupWizard?: () => void;
  subscription?: {
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null;
  isPaidActive?: boolean;
  isInFreeTrial?: boolean;
  trialEndsAt?: Date | null;
  notifSettings: NotifSettings;
  onUpdateNotifSettings: (notifSettings: NotifSettings) => void;
  isPro?: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
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
  onReplaySetupWizard,
  subscription,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  notifSettings,
  onUpdateNotifSettings,
  isPro,
  isGroupFinance = false
}) => {
  const { t, language, toggleLanguage } = useLanguage();
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
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

  // Which of the 8 category tabs the sub-nav is showing -- mirrors the mockup's Settings.dc.html
  // sidebar-within-a-sidebar layout, replacing the old single long scroll.
  const [section, setSection] = useState<SettingsSection>('account');

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
    if (!businessProfileOwnerId) { triggerAlert('บันทึกสำเร็จ', 'บันทึกโปรไฟล์ธุรกิจไว้ในเครื่องนี้แล้ว'); return; }
    setBusinessProfileSaving(true);
    try {
      await saveCloud(businessProfileOwnerId, { issuer_profile: issuerProfile });
      triggerAlert('บันทึกสำเร็จ', 'บันทึกโปรไฟล์ธุรกิจแล้ว ข้อมูลนี้จะถูกนำไปใช้เป็นค่าเริ่มต้นในเอกสารใบถัดไป');
    } catch (error) {
      triggerAlert('บันทึกไม่สำเร็จ', (error as Error).message);
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
    client: { name: 'ชื่อลูกค้าตัวอย่าง', address: 'ที่อยู่ลูกค้าตัวอย่าง', phone: '', email: '', taxId: '' },
    items: [{ id: 'p1', description: 'รายการตัวอย่าง', quantity: 1, price: 1000 }],
    vatRate: 0,
    whtRate: 0
  };

  const pauseAccount = () => triggerConfirm(
    'ยืนยันพักบัญชี 30 วัน',
    'กดตกลงเพื่อพักบัญชีและออกจากระบบทุกอุปกรณ์ คุณเปิดใช้บัญชีอีกครั้งได้ภายใน 30 วัน ระบบจะส่งอีเมลเตือนวันละหนึ่งฉบับใน 3 วันสุดท้ายก่อนครบกำหนด หากไม่กลับมา บัญชีและข้อมูลของคุณจะถูกลบถาวรในการประมวลผลรายวันและกู้คืนไม่ได้ ต้องมีหัวหน้ากลุ่มและ admin คนอื่นที่ยังใช้งานได้ก่อนพักบัญชี หากภายหลังเกิดเงื่อนไขที่ทำให้ลบไม่ได้ ระบบจะเลื่อนการลบและลองใหม่ในวันถัดไป',
    async () => {
      setAccountBusy(true);
      const result = await authClient.auth.pauseAccount();
      setAccountBusy(false);
      if (result.error) triggerAlert('พักบัญชีไม่สำเร็จ', result.error.message);
    }
  );

  const requestDeletion = () => triggerConfirm(
    'ยืนยันคำขอลบบัญชี',
    'บัญชีจะปิดใช้งานทันที แต่ข้อมูลยังอยู่ 30 วัน ระหว่างนี้กู้คืนได้ด้วยอีเมลสำรองที่ยืนยันไว้ หลังครบ 30 วันข้อมูลจะถูกลบถาวร ขั้นต่อไปต้องกรอกรหัสจากอีเมลหลัก',
    async () => {
      setAccountBusy(true);
      const result = await authClient.auth.requestAccountDeletion();
      setAccountBusy(false);
      if (result.error) triggerAlert('ส่งรหัสไม่สำเร็จ', result.error.message);
      else { setDeletionCode(''); setDeletionRequested(true); triggerAlert('ส่งรหัสแล้ว', 'กรอกรหัส 6 หลักจากอีเมลภายใน 5 นาทีเพื่อยืนยันการลบบัญชี'); }
    }
  );

  const deleteAccount = async () => {
    if (!/^\d{6}$/.test(deletionCode)) { triggerAlert('รหัสไม่ครบ', 'กรุณากรอกรหัสยืนยัน 6 หลัก'); return; }
    setAccountBusy(true);
    const result = await authClient.auth.deleteAccount(deletionCode);
    setAccountBusy(false);
    if (result.error) triggerAlert('ปิดบัญชีไม่สำเร็จ', result.error.message);
    else { setDeletionCode(''); setDeletionRequested(false); }
  };

  useEffect(()=>{
    if(!session?.user?.id || session?.isGuest || isGroupFinance)return;
    const controller=new AbortController();
    apiJson<PublicProfile>('/api/profile',{signal:controller.signal,headers:{'X-Account-ID':session.user.id}})
      .then(value=>{setProfile(value);setDisplayName(value.displayName);})
      .catch(error=>{if(!controller.signal.aborted)triggerAlert('โหลดโปรไฟล์ไม่สำเร็จ',error.message);});
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
      triggerAlert('ส่งรหัสแล้ว', 'ตรวจอีเมลสำรองและกรอกรหัส 6 หลักภายใน 5 นาที');
    } catch (error) { triggerAlert('ส่งรหัสไม่สำเร็จ', (error as Error).message); }
    finally { setAccountBusy(false); }
  };

  const confirmBackupEmail = async () => {
    setAccountBusy(true);
    try {
      const value = await apiJson<{ backupEmail: string }>('/api/account', { method: 'POST', headers: { 'X-Account-ID': session.user.id }, body: JSON.stringify({ action: 'backup-confirm', code: backupCode }) });
      setBackupEmail(value.backupEmail); setBackupPending(false); setBackupCode('');
      triggerAlert('ยืนยันสำเร็จ', 'ใช้อีเมลสำรองนี้กู้คืนบัญชีระหว่าง 30 วันหลังปิดบัญชีได้');
    } catch (error) { triggerAlert('ยืนยันไม่สำเร็จ', (error as Error).message); }
    finally { setAccountBusy(false); }
  };

  const saveProfile=async()=>{
    if(!session?.user?.id || displayName.trim().length<2)return;
    setProfileBusy(true);
    try { const value=await apiJson<PublicProfile>('/api/profile',{method:'POST',headers:{'X-Account-ID':session.user.id},body:JSON.stringify({displayName:displayName.trim()})});setProfile(value);setDisplayName(value.displayName);window.dispatchEvent(new CustomEvent('cash-squirrel:profile-updated',{detail:value}));triggerAlert('บันทึกชื่อแล้ว','ชื่อใหม่จะแสดงในกลุ่มและผลการค้นหา'); }
    catch(error){triggerAlert('บันทึกชื่อไม่สำเร็จ',(error as Error).message);} finally{setProfileBusy(false);}
  };

  const [lineLinkCode, setLineLinkCode] = useState<string | null>(null);
  const [lineLinkCodeExpiresAt, setLineLinkCodeExpiresAt] = useState<number | null>(null);
  const [lineLinkSecondsLeft, setLineLinkSecondsLeft] = useState(0);
  const [isGeneratingLineCode, setIsGeneratingLineCode] = useState(false);
  const [lineLinkCopied, setLineLinkCopied] = useState(false);

  const handleGenerateLineCode = async () => {
    setIsGeneratingLineCode(true);
    try {

      const res = await apiFetch('/api/line-link-code', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'X-Account-ID': session.user.id },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'สร้างรหัสเชื่อมต่อไม่สำเร็จ');
      setLineLinkCode(json.code);
      setLineLinkCodeExpiresAt(new Date(json.expiresAt).getTime());
      setLineLinkSecondsLeft(Math.max(0, Math.ceil((new Date(json.expiresAt).getTime() - Date.now()) / 1000)));
      setLineLinkCopied(false);
    } catch (err: any) {
      triggerAlert('สร้างรหัสเชื่อมต่อไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้งครับ');
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

  // Both digest toggles below write straight to merge_notif_settings the moment they're
  // clicked, the same way handleDisconnectLine does for lineUserId, instead of only relying on
  // the generic 1.5s-debounced autosave. That debounce has an acknowledged data-loss window (see
  // saveCloudData in App.tsx) -- a reload/backgrounded tab shortly after toggling can lose the
  // pending write entirely, and the next load then reads the stale (still-enabled) value back
  // from the cloud, making the toggle look like it silently turned itself back on.
  const persistNotifPatch = (patch: Partial<NotifSettings>) => {
    const userId = session?.user?.id;
    if (!userId) return;
    saveNotificationPatch(userId, patch).catch(error => triggerAlert('บันทึกการแจ้งเตือนไม่สำเร็จ', error.message));
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

  const handleDisconnectLine = () => {
    triggerConfirm(
      'ยกเลิกการเชื่อมต่อ LINE',
      'คุณต้องการยกเลิกการรับแจ้งเตือนผ่าน LINE ใช่หรือไม่? ยังรับแจ้งเตือนทางอีเมลได้ตามปกติ',
      async () => {
        try {
          await apiJson('/api/line-link-code', { method: 'POST', headers: { 'X-Account-ID': session.user.id }, body: JSON.stringify({ action: 'disconnect' }) });
          onUpdateNotifSettings({ ...notifSettings, lineUserId: null });
          setLineLinkCode(null);
          setLineLinkCodeExpiresAt(null);
          setLineLinkSecondsLeft(0);
        } catch (error: any) { triggerAlert('ยกเลิกการเชื่อมต่อไม่สำเร็จ', error.message); }

      }
    );
  };

  // While a link code is showing, poll for the webhook having linked the account (it happens
  // from an entirely separate LINE-app session, so there's no other signal this tab would get).
  // Without this, the UI keeps showing "not connected" until a manual reload even though the
  // link already succeeded server-side.
  useEffect(() => {
    if (!lineLinkCode || notifSettings.lineUserId) return;
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
  }, [lineLinkCode, notifSettings.lineUserId, session?.user?.id]);

  const fixedExpenseItems = settings.fixedExpenseItems || [];

  const handleAddFixedExpenseItem = () => {
    const amount = parseFloat(newFixedExpenseAmount);
    if (!newFixedExpenseName.trim() || isNaN(amount) || amount < 0) return;

    // First item ever added: carry the existing lump-sum value forward so nothing is lost
    let baseItems = fixedExpenseItems;
    if (baseItems.length === 0 && settings.monthlyExpense > 0) {
      baseItems = [{ id: crypto.randomUUID(), name: 'ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)', amount: settings.monthlyExpense }];
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
      triggerAlert('ไฟล์ใหญ่เกินไป', 'กรุณาเลือกรูปภาพที่มีขนาดไม่เกิน 5MB');
      return;
    }
    try {
      onUpdateUserAvatar(await prepareAvatarDataUrl(file));
    } catch (error) {
      triggerAlert('ใช้รูปภาพนี้ไม่ได้', error instanceof Error ? error.message : 'กรุณาลองเลือกรูปอื่น');
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
            onImportData(text);
          } catch (err) {
            triggerAlert('ไฟล์ไม่ถูกต้อง', 'ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง');
          }
        };
        reader.readAsText(file);
      } else {
        triggerAlert('ประเภทไฟล์ไม่ถูกต้อง', 'โปรดอัปโหลดไฟล์สำรองที่มีนามสกุล .json เท่านั้น');
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
        onImportData(text);
      } catch (err) {
        triggerAlert('ไฟล์ไม่ถูกต้อง', 'ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="page-content">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Desktop: vertical sub-nav sidebar, matching the mockup's second sidebar column */}
        <nav className="hidden w-[200px] shrink-0 flex-col gap-0.5 lg:flex">
          <div className="mb-2 px-2 text-[15px] font-semibold text-brand-text">ตั้งค่า</div>
          {SUBNAV.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                section === s.key ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'
              }`}
            >
              <s.Icon className="h-4 w-4 shrink-0" />
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        {/* Mobile/tablet: horizontal scrollable pills instead of a sidebar */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {SUBNAV.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs transition-colors cursor-pointer ${
                section === s.key ? 'bg-[#FFF1E8] font-medium text-[#C24A16]' : 'bg-brand-faint text-brand-muted hover:text-brand-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 space-y-6 pb-12 lg:max-w-2xl">
        {section === 'account' && (<>
          {!isGroupFinance && session && !session.isGuest && <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3"><User className="w-4.5 h-4.5 text-emerald-600"/><h3 className="text-xs font-black uppercase tracking-wider">โปรไฟล์ผู้ใช้</h3></div>
            <label className="block text-xs font-bold">ชื่อที่แสดง
              <input className="mt-2 w-full bg-brand-faint dark:bg-stone-950 border border-brand-border rounded-xl px-3 py-2.5 text-sm" value={displayName} onChange={e=>setDisplayName(e.target.value)} minLength={2} maxLength={60}/>
            </label>
            <div><p className="text-xs font-bold">User ID</p><div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-brand-faint dark:bg-stone-950 border border-brand-border px-3 py-2.5"><code className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{profile?.publicId || 'กำลังโหลด…'}</code>{profile?.publicId&&<button type="button" className="text-xs font-bold" onClick={()=>navigator.clipboard.writeText(profile.publicId)}><Copy className="w-3.5 h-3.5"/></button>}</div><p className="text-[10px] text-brand-muted mt-1">รหัสนี้สร้างถาวรและไม่สามารถแก้ไขได้ ใช้ให้ผู้อื่นค้นหาเพื่อเชิญเข้ากลุ่ม</p></div>
            <button type="button" onClick={()=>void saveProfile()} disabled={profileBusy||displayName.trim().length<2||displayName.trim()===profile?.displayName} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">{profileBusy?'กำลังบันทึก…':'บันทึกชื่อ'}</button>
          </div>}
          {(isGroupFinance || !session || session.isGuest) && (
            <div className="rounded-2xl border border-brand-border bg-brand-white p-4 text-sm text-brand-muted">
              {session?.isGuest ? 'โหมดทดลองใช้งาน (Guest) ไม่มีบัญชีถาวรให้ตั้งค่าตรงนี้' : 'บัญชีนี้ใช้ข้อมูลของกลุ่มที่เลือก'}
            </div>
          )}
        </>)}
        {section === 'lang' && (<>
          {/* Language */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Languages className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                {t('settings.language')}
              </h3>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-brand-muted dark:text-neutral-400 max-w-xs">
                {t('settings.languageDescription')}
              </p>
              <div className="flex items-center bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-2xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => language !== 'th' && toggleLanguage()}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    language === 'th' ? 'bg-emerald-600 text-white shadow-sm' : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  ไทย
                </button>
                <button
                  type="button"
                  onClick={() => language !== 'en' && toggleLanguage()}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    language === 'en' ? 'bg-emerald-600 text-white shadow-sm' : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
          </div>
        </>)}
        {section === 'finance' && (<>
          {/* Card 1: Proportions & Financial Targets */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Database className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                สัดส่วน & เป้าหมายการเงินคงที่
              </h3>
            </div>

            <div className="space-y-4">
              {/* Base Expense - itemized breakdown */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-brand-text dark:text-neutral-200">
                    {isGroupFinance ? 'ค่าใช้จ่ายกลุ่มรายเดือนคงที่ (฿)' : 'ค่าใช้จ่ายส่วนตัวรายเดือนคงที่ (฿)'}
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    รวม {formatCurrency(settings.monthlyExpense)}
                  </span>
                </div>

                {fixedExpenseItems.length > 0 && (
                  <div className="space-y-1.5">
                    {fixedExpenseItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2">
                        <span className="text-xs font-bold text-brand-text dark:text-neutral-200 truncate">{item.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono font-black text-brand-text dark:text-white">{formatCurrency(item.amount)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFixedExpenseItem(item.id)}
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
                    value={newFixedExpenseName}
                    onChange={(e) => setNewFixedExpenseName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                    placeholder="เช่น ค่าห้อง, ค่ารถ, ค่าเน็ต"
                    className="flex-1 min-w-0 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-emerald-500"
                  />
                  <NumberInput
                    value={newFixedExpenseAmount}
                    onChange={setNewFixedExpenseAmount}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                    placeholder="บาท"
                    className="w-24 shrink-0 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddFixedExpenseItem}
                    className="shrink-0 p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all cursor-pointer"
                    title="เพิ่มรายการ"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[9px] text-brand-muted leading-relaxed">
                  เงินขั้นต่ำที่ต้องจ่ายออกทุกเดือนสำหรับค่ากิน ค่าห้อง ค่าน้ำ ค่าไฟคงที่ — แตกเป็นรายการย่อยได้เอง ระบบรวมยอดให้อัตโนมัติ
                </p>
              </div>

              {/* Target Revenue */}
              <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/20 dark:border-neutral-800/40">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-brand-text dark:text-neutral-200">
                    เป้ารายรับพึงประสงค์รายเดือน (฿)
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    {formatCurrency(settings.monthlyRevenueGoal)}
                  </span>
                </div>
                <NumberInput
                  value={settings.monthlyRevenueGoal}
                  onChange={(raw) => onUpdateSettings({ ...settings, monthlyRevenueGoal: parseFloat(raw) || 0 })}
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-emerald-500 w-full"
                  placeholder="เช่น 50000"
                />
                <p className="text-[9px] text-brand-muted leading-relaxed">
                  เป้าหมายรายได้รวมสูงสุดที่คุณตั้งเป้าจะกวาดให้ถึงในรอบเดือนเก็บเกี่ยวนี้
                </p>
              </div>
            </div>
          </div>
        </>)}
        {section === 'notif' && (<>
          {/* Card 1.5: Notifications -- LINE linking + email report/digest opt-ins. Moved here
              from the "รายงานรายเดือน" tab since these are account-level connections, not
              report content, and were easy to miss buried among charts and tables there. */}
          {!isGroupFinance && <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Bell className="w-4.5 h-4.5 text-pink-acc" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                การแจ้งเตือน
              </h3>
            </div>

            <div className="space-y-3">
              {/* Monthly report email opt-in (Pro) */}
              <button
                type="button"
                disabled={!isPro}
                onClick={() => {
                  if (!isPro) {
                    onSwitchTab('plans');
                    return;
                  }
                  handleToggleMonthlyReport();
                }}
                className={`w-full flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  notifSettings.monthlyReportEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800 hover:border-brand-border'
                }`}
              >
                <Mail className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                    สรุปงบการเงินรายเดือนอัตโนมัติ                  </span>
                  <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                    {isPro
                      ? 'ระบบส่งสรุปรายรับ-รายจ่ายของเดือนที่ผ่านมาให้อัตโนมัติทุกวันที่ 1 ทางอีเมลของบัญชีนี้โดยไม่ต้องตั้งค่าอะไรเพิ่ม (และ LINE ด้วยถ้าเชื่อมต่อไว้)'
                      : 'ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน'}
                  </p>
                </div>
                <div
                  className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                    notifSettings.monthlyReportEnabled ? 'bg-emerald-600' : 'bg-brand-border dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      notifSettings.monthlyReportEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>

              {/* Daily overdue-digest opt-in (Pro) */}
              <button
                type="button"
                disabled={!isPro}
                onClick={() => {
                  if (!isPro) {
                    onSwitchTab('plans');
                    return;
                  }
                  handleToggleDailyDigest();
                }}
                className={`w-full flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  notifSettings.dailyDigestEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800 hover:border-brand-border'
                }`}
              >
                <Mail className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                    แจ้งเตือนงานค้างชำระรายวัน                  </span>
                  <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                    {isPro
                      ? 'ส่งสรุปดีลที่เลยกำหนดชำระให้ทุกเช้า ทางอีเมลของบัญชีนี้โดยไม่ต้องตั้งค่าอะไรเพิ่ม (และ LINE ด้วยถ้าเชื่อมต่อไว้) ไม่ต้องเปิดแอปเอง'
                      : 'ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน'}
                  </p>
                </div>
                <div
                  className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                    notifSettings.dailyDigestEnabled ? 'bg-emerald-600' : 'bg-brand-border dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      notifSettings.dailyDigestEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>

              {/* LINE notification linking -- reuses the same Pro gate as the email digests above,
                  since it's the same underlying notification feature. */}
              <div className={`p-3 rounded-2xl border ${
                notifSettings.lineUserId
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800'
              }`}>
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-[#06C755] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                      รับแจ้งเตือนผ่าน LINE
                    </span>
                    <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                      {notifSettings.lineUserId
                        ? 'เชื่อมต่อแล้ว -- แจ้งเตือนเดียวกับอีเมลจะส่งเข้า LINE ด้วย'
                        : isPro
                        ? 'เชื่อมบัญชี LINE เพื่อรับแจ้งเตือนเดียวกับอีเมล เผื่อพลาดดูอีเมล (ข้อมูลงาน/ยอดเงินจะปรากฏในแชท LINE)'
                        : 'ฟีเจอร์สำหรับสมาชิก Pro -- สมัครเพื่อเปิดใช้งาน'}
                    </p>
                  </div>
                  {notifSettings.lineUserId ? (
                    <button
                      type="button"
                      onClick={handleDisconnectLine}
                      className="shrink-0 text-[10px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPro) {
                          onSwitchTab('plans');
                          return;
                        }
                        triggerConfirm(
                          'ก่อนเชื่อมต่อ LINE',
                          'เมื่อเชื่อมต่อแล้ว ข้อมูลที่คุณบันทึก (ชื่องาน ชื่อลูกค้า ยอดเงิน) จะถูกส่งเป็นข้อความแจ้งเตือนเข้าไปในแชท LINE ของคุณด้วย กรุณาตรวจสอบว่าไม่มีคนอื่นเข้าถึงแชท LINE นี้ได้ ต้องการเชื่อมต่อต่อหรือไม่?',
                          () => handleGenerateLineCode()
                        );
                      }}
                      disabled={isGeneratingLineCode}
                      className="shrink-0 text-[10px] font-bold text-white bg-[#06C755] hover:bg-[#05B34C] px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isGeneratingLineCode ? 'กำลังสร้างรหัส...' : 'เชื่อมต่อ LINE'}
                    </button>
                  )}
                </div>

                {lineLinkCode && !notifSettings.lineUserId && (
                  <div className="mt-3 pt-3 border-t border-brand-border/30 space-y-3">
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-[10px] font-black text-brand-text dark:text-white">ยืนยันบัญชี LINE อย่างปลอดภัย</p>
                        <p className="mt-0.5 text-[9px] leading-relaxed text-brand-muted">รหัสนี้ใช้ได้ครั้งเดียวและผูกได้กับบัญชีที่กำลังเข้าใช้อยู่เท่านั้น ห้ามส่งต่อให้ผู้อื่น</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-brand-muted leading-relaxed">
                      1. แอดเพื่อน LINE Official Account <span className="font-bold text-brand-text dark:text-white">@859mlugf</span>{' '}
                      <a
                        href="https://line.me/R/ti/p/@859mlugf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#06C755] font-bold inline-flex items-center gap-0.5 hover:underline"
                      >
                        (เปิดลิงก์แอดเพื่อน <ExternalLink className="w-2.5 h-2.5" />)
                      </a>
                      <br />
                      2. ส่งรหัสด้านล่างเข้าแชทภายใน 5 นาที เพื่อยืนยันว่า LINE นี้เป็นของคุณ
                    </p>
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 rounded-xl border px-3 py-2.5 text-center font-mono text-base font-black tracking-[0.18em] ${lineLinkSecondsLeft > 0 ? 'border-brand-border/50 bg-brand-faint text-brand-text dark:bg-stone-850 dark:text-white' : 'border-rose-500/30 bg-rose-500/5 text-rose-500'}`}>
                        {lineLinkCode}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLineCode}
                        disabled={lineLinkSecondsLeft <= 0}
                        className="shrink-0 p-2.5 rounded-xl border border-brand-border/60 text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-stone-850 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        title="คัดลอกรหัส"
                      >
                        {lineLinkCopied ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${lineLinkSecondsLeft > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        <Clock3 className="h-3.5 w-3.5" />
                        {lineLinkSecondsLeft > 0
                          ? `หมดอายุใน ${String(Math.floor(lineLinkSecondsLeft / 60)).padStart(2, '0')}:${String(lineLinkSecondsLeft % 60).padStart(2, '0')} นาที`
                          : 'รหัสหมดอายุแล้ว'}
                      </p>
                      {lineLinkSecondsLeft <= 0 && (
                        <button type="button" onClick={handleGenerateLineCode} disabled={isGeneratingLineCode} className="inline-flex items-center gap-1.5 rounded-lg bg-[#06C755] px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-[#05B34C] disabled:opacity-50">
                          <RefreshCw className={`h-3 w-3 ${isGeneratingLineCode ? 'animate-spin' : ''}`} />
                          สร้างรหัสใหม่
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>}
          {isGroupFinance && <p className="rounded-2xl border border-brand-border bg-brand-white p-4 text-sm text-brand-muted">รายงานและไฟล์สำรองใช้ข้อมูลของกลุ่มที่เลือก การเชื่อม LINE และรายงานอัตโนมัติเป็นของบัญชีส่วนตัว</p>}
        </>)}
        {section === 'backup' && (<>
          {/* Card 2: Offline Backup / Restore */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <FileJson className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                สำรอง & นำเข้าข้อมูลออฟไลน์
              </h3>
            </div>

            <div className="space-y-4">
              {/* Seamless Drag-and-Drop Area */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${
                  dragActive 
                    ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-500/5 ring-4 ring-indigo-500/10' 
                    : 'border-brand-border hover:border-brand-border/80 dark:border-neutral-800 dark:hover:border-neutral-700 bg-brand-faint/30 dark:bg-neutral-800/20'
                }`}
              >
                <input 
                  type="file" 
                  id="json-settings-uploader" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                <label htmlFor="json-settings-uploader" className="cursor-pointer block space-y-2.5 w-full">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-full inline-block">
                    <Upload className="w-5.5 h-5.5 text-indigo-600 dark:text-indigo-400 animate-bounce" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-brand-text dark:text-white">
                      ลากไฟล์สำรอง .json มาวางที่นี่
                    </p>
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold mt-1">
                      หรือคลิกเพื่อค้นหาและเลือกไฟล์กู้คืน
                    </p>
                  </div>
                </label>
              </div>

              {/* Keep backup and restore together after retiring the duplicate summary page. */}
              <button
                type="button"
                onClick={onExportData}
                className="w-full py-2.5 bg-brand-faint dark:bg-neutral-800/50 hover:bg-brand-border/30 dark:hover:bg-neutral-800 text-brand-text dark:text-neutral-200 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-brand-border/40 dark:border-neutral-700"
              >
                <Download className="w-3.5 h-3.5" /> สำรองข้อมูลทั้งหมด (.json)
              </button>
            </div>
          </div>
        </>)}
        {section === 'security' && (<>
          {/* Card 3: Account Controls & Danger Zone */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <User className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                บัญชีความปลอดภัย & การควบคุมพิเศษ
              </h3>
            </div>

            <div className="space-y-4">
              {/* Profile card row */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 rounded-3xl w-full">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold overflow-hidden border border-brand-border/30">
                    {userAvatar ? (
                      <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
                    ) : (
                      <User className="w-7 h-7" />
                    )}
                  </div>
                  <label className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer transition-all border border-white dark:border-neutral-900 flex items-center justify-center">
                    <Upload className="w-3 h-3" />
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden" 
                      onChange={event => void handleAvatarFile(event)}
                    />
                  </label>
                </div>
                
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-[9px] text-brand-muted font-extrabold uppercase tracking-wider">บัญชีผู้ใช้งานปัจจุบัน</p>
                  <p className="text-xs text-brand-text dark:text-neutral-200 font-black truncate max-w-[200px]" title={profile?.displayName}>
                    {profile?.displayName || (session?.isGuest ? 'Guest User (ใช้งานแบบออฟไลน์)' : 'กำลังโหลดโปรไฟล์…')}
                  </p>
                  {profile?.publicId && <p className="text-[10px] text-brand-muted font-mono">{profile.publicId}</p>}
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1">
                    <label className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer">
                      เปลี่ยนรูปภาพ
                      <input 
                        type="file" 
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden" 
                        onChange={event => void handleAvatarFile(event)}
                      />
                    </label>
                    {userAvatar && (
                      <>
                        <span className="text-brand-border dark:text-neutral-750 text-[10px]">•</span>
                        <button 
                          type="button" 
                          onClick={() => onUpdateUserAvatar('')}
                          className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                        >
                          ลบรูป
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    triggerConfirm(
                      'ออกจากระบบ',
                      'คุณต้องการออกจากระบบจากคลังกระรอกตุนเสบียงใช่หรือไม่?',
                      onSignOut
                    );
                  }}
                  className="sm:ml-auto w-full sm:w-auto px-3 py-2 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/15 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  title="ออกจากบัญชีนี้"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>

              {session && !session.isGuest && (
                <div className="p-4 bg-gradient-to-br from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand-text dark:text-white inline-flex items-center gap-1">แพ็กเกจโปร <IconCrown className="w-3 h-3" /></span>
                    {isPaidActive && (
                      <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase">Active</span>
                    )}
                    {!isPaidActive && isInFreeTrial && (
                      <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase">{t('plans.freeTrialBadge')}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-brand-muted leading-relaxed">
                    {isPaidActive && subscription?.currentPeriodEnd
                      ? t('plans.statusActive', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
                      : isInFreeTrial && trialEndsAt
                      ? t('plans.statusTrial', { date: trialEndsAt.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
                      : t('plans.payByCardPromptpay')}
                  </p>

                  <button
                    type="button"
                    onClick={() => onSwitchTab('plans')}
                    className="w-full py-2 bg-[#E65F2B] hover:bg-[#D8551F] text-white text-[10px] font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    ดูรายละเอียดแพ็กเกจทั้งหมด <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {onReplaySetupWizard && (
                <button
                  type="button"
                  onClick={onReplaySetupWizard}
                  className="w-full py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-300 border border-neutral-200/55 dark:border-neutral-800 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Mascot mood="wave" size={24} className="mr-0.5" />
                  <span>ดูหน้าตั้งค่าบัญชีเริ่มต้นอีกครั้ง</span>
                </button>
              )}

              {session && !session.isGuest && !isGroupFinance && (
                <div className="rounded-2xl border border-brand-border bg-brand-white p-4 space-y-2.5">
                  <h5 className="text-sm font-black text-brand-text">อีเมลสำรองสำหรับกู้คืนบัญชี</h5>
                  <p className="text-xs text-brand-muted">{backupEmail ? `ยืนยันแล้ว: ${backupEmail}` : 'เพิ่มและยืนยันอีเมลสำรองก่อนสั่งลบบัญชี'}</p>
                  <input type="email" autoComplete="email" value={backupInput} onChange={event => setBackupInput(event.target.value)}
                    placeholder="อีเมลสำรอง" aria-label="อีเมลสำรอง" className="w-full rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text" />
                  <button type="button" disabled={accountBusy || !backupInput.includes('@')} onClick={() => void requestBackupEmail()}
                    className="w-full rounded-xl border border-brand-border px-3 py-2 text-xs font-bold text-brand-text disabled:opacity-50">ส่งรหัสยืนยันไปยังอีเมลสำรอง</button>
                  {backupPending && <div className="space-y-2">
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={backupCode}
                      onChange={event => setBackupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="รหัส 6 หลัก" aria-label="รหัสยืนยันอีเมลสำรอง" className="w-full rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text" />
                    <button type="button" disabled={accountBusy || backupCode.length !== 6} onClick={() => void confirmBackupEmail()}
                      className="w-full rounded-xl bg-[#E65F2B] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">ยืนยันอีเมลสำรอง</button>
                  </div>}
                </div>
              )}

              {/* Safety switch to toggle Danger Zone */}
              <button
                type="button"
                onClick={() => setShowDangerZone(!showDangerZone)}
                className={`w-full py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                  showDangerZone 
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' 
                    : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-300 border-neutral-200/55 dark:border-neutral-800'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{showDangerZone ? 'ปิดพื้นที่ควบคุมพิเศษ' : 'เปิดโซนความปลอดภัยสูง'}</span>
              </button>

              {/* Collapse Danger Zone */}
              <AnimatePresence>
                {showDangerZone && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-rose-500/5 dark:bg-rose-950/15 border border-rose-500/20 rounded-2xl p-4 mt-1 space-y-3 overflow-hidden"
                  >
                    <div className="flex items-start gap-2 text-rose-800 dark:text-rose-400">
                      <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-[11px] font-bold">โซนความเสี่ยงสูง (Danger Zone)</h5>
                        <p className="text-[10px] text-brand-muted dark:text-rose-300/85 mt-0.5 leading-relaxed">
                          เลือกพักบัญชี ลบบัญชีถาวร หรือรีเซ็ตข้อมูลการเงินของคุณ โปรดตรวจสอบผลของแต่ละรายการก่อนยืนยัน
                        </p>
                      </div>
                    </div>

                    {session && !session.isGuest && !isGroupFinance && (
                      <div className="space-y-3 border-t border-rose-500/20 pt-3">
                        <div>
                          <h5 className="text-[11px] font-black text-brand-text">จัดการบัญชีของฉัน</h5>
                          <p className="mt-1 text-[10px] leading-relaxed text-brand-muted">พักบัญชีหรือสั่งลบบัญชีได้ โดยข้อมูลจะถูกลบจริงหลัง 30 วัน หากสั่งลบต้องยืนยันอีเมลสำรองก่อนเพื่อใช้กู้คืน</p>
                        </div>
                        <button type="button" disabled={accountBusy} onClick={pauseAccount}
                          className="w-full rounded-xl border border-amber-500/40 px-3 py-2.5 text-[11px] font-bold text-amber-800 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-300">
                          พักบัญชีชั่วคราว 30 วัน
                        </button>
                        <button type="button" disabled={accountBusy || !backupEmail} onClick={requestDeletion}
                          className="w-full rounded-xl border border-rose-500/40 px-3 py-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300">
                          ปิดบัญชีและลบข้อมูลหลัง 30 วัน
                        </button>
                        {deletionRequested && (
                          <div className="space-y-2 rounded-xl border border-rose-500/30 p-3">
                            <label htmlFor="account-deletion-code" className="block text-[11px] font-bold text-brand-text">รหัสยืนยันจากอีเมล</label>
                            <input id="account-deletion-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                              value={deletionCode} onChange={event => setDeletionCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                              className="w-full rounded-lg border border-brand-border bg-brand-white px-3 py-2 text-brand-text" placeholder="รหัส 6 หลัก" />
                            <button type="button" disabled={accountBusy || deletionCode.length !== 6} onClick={() => triggerConfirm(
                              'ยืนยันปิดบัญชี',
                              'กดตกลงเพื่อปิดการใช้งานบัญชีทันที ข้อมูลจะเก็บไว้ 30 วันและกู้คืนผ่านอีเมลสำรองได้ หลังครบกำหนดจะถูกลบถาวร',
                              () => { void deleteAccount(); }
                            )}
                              className="w-full rounded-lg bg-rose-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">ยืนยันปิดบัญชี</button>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        const correctCode = Math.floor(1000 + Math.random() * 9000).toString();
                        triggerConfirm(
                          'ยืนยันต้องการล้างข้อมูลทั้งหมดใช่ไหม?',
                          `คำเตือนสูงสุด: ข้อมูลดีลงาน รายรับ รายจ่ายผันแปร และข้อมูลเป้าหมายออมเงินสะสมทั้งหมดจะถูกลบถาวร!\n\nโปรดตรวจสอบรหัสความปลอดภัยสำหรับการยืนยันลบในขั้นถัดไป: [ ${correctCode} ]`,
                          () => {
                            setTimeout(() => {
                              triggerPrompt(
                                'ป้อนรหัสเพื่อล้างข้อมูลแอป',
                                `กรุณากรอกรหัสรักษาความปลอดภัย 4 หลัก [ ${correctCode} ] เพื่อเริ่มล้างระบบข้อมูลถาวร:`,
                                '',
                                'พิมพ์รหัส 4 หลักที่แสดงอยู่บนจอ',
                                'text',
                                (enteredVal) => {
                                  if (enteredVal.trim() === correctCode) {
                                    onClearAllData();
                                    triggerAlert('ล้างข้อมูลสำเร็จ', 'ข้อมูลและรายละเอียดทางการเงินทั้งหมดถูกรีเซ็ตออกจากแอปอย่างปลอดภัยแล้ว');
                                    setShowDangerZone(false);
                                  } else {
                                    triggerAlert('รหัสไม่ถูกต้อง', 'รหัสความปลอดภัยที่คุณกรอกไม่ถูกต้อง ระบบได้ล็อคการเข้าถึงและยกเลิกกระบวนการลบทันที');
                                  }
                                }
                              );
                            }, 350);
                          }
                        );
                      }}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-600/10 border border-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> ล้างข้อมูลและรีเซ็ตแอปพลิเคชันทั้งหมด
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </>)}
        {section === 'business' && (<>
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Building2 className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
              <div>
                <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">โปรไฟล์ธุรกิจ</h3>
                <p className="mt-0.5 text-[10px] text-brand-muted">ข้อมูลที่แสดงบนเอกสาร ใบเสนอราคา ใบแจ้งหนี้ -- ใช้เป็นค่าเริ่มต้นทุกครั้งที่ออกเอกสารใหม่</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E65F2B]/30 bg-brand-white dark:bg-stone-900 p-3 shadow-sm">
              <p className="mb-2 text-[10px] font-black text-[#E65F2B]">ตัวอย่างส่วนหัวเอกสาร (เปลี่ยนตามที่คุณปรับทันที)</p>
              <div className="overflow-hidden rounded-xl border border-brand-border/60 bg-stone-200">
                <DocumentPreview invoice={businessPreviewInvoice} crop={400} maxScale={0.8} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <BrandImageField
                title="โลโก้ธุรกิจ (Company Logo)"
                hint="โลโก้นี้จะปรากฏที่มุมบนซ้ายของเอกสารทุกประเภท และเป็นตราประทับผู้ขาย"
                emptyLabel="ไม่มีโลโก้"
                uploadLabel="อัปโหลดใหม่"
                removeLabel="ลบโลโก้"
                value={issuerProfile.logoUrl}
                onChange={(logoUrl) => setIssuerProfile(prev => ({ ...prev, logoUrl }))}
                onError={triggerAlert}
                size={{
                  label: 'ขนาดโลโก้บนเอกสาร',
                  value: issuerProfile.logoHeight || DEFAULT_LOGO_HEIGHT,
                  min: MIN_LOGO_HEIGHT,
                  max: MAX_LOGO_HEIGHT,
                  onChange: (logoHeight) => setIssuerProfile(prev => ({ ...prev, logoHeight }))
                }}
                extra={(
                  <div className="space-y-2 text-[10px] font-black text-brand-muted">
                    <div className="flex items-center gap-3">
                      <span className="shrink-0">ตำแหน่งโลโก้</span>
                      <div className="flex gap-1.5" role="group" aria-label="ตำแหน่งโลโก้">
                        {([['left', 'ซ้าย'], ['center', 'กลาง'], ['right', 'ขวา']] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={(issuerProfile.logoPosition || 'left') === key}
                            onClick={() => setIssuerProfile(prev => ({ ...prev, logoPosition: key }))}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black cursor-pointer transition-all ${(issuerProfile.logoPosition || 'left') === key ? 'bg-[#E65F2B] text-white' : 'bg-brand-white dark:bg-stone-900 border border-brand-border/60 text-brand-muted'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-3">
                      <span className="shrink-0">เลื่อนซ้าย–ขวา</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={issuerProfile.logoPosition === 'custom' ? issuerProfile.logoOffset ?? 50 : issuerProfile.logoPosition === 'center' ? 50 : issuerProfile.logoPosition === 'right' ? 100 : 0}
                        onChange={(e) => setIssuerProfile(prev => ({ ...prev, logoPosition: 'custom', logoOffset: Number(e.target.value) }))}
                        aria-label="เลื่อนโลโก้ซ้าย-ขวา"
                        className="w-full max-w-xs accent-[#E65F2B] cursor-pointer"
                      />
                      <span className="font-mono w-14 text-right">{issuerProfile.logoPosition === 'custom' ? issuerProfile.logoOffset ?? 50 : issuerProfile.logoPosition === 'center' ? 50 : issuerProfile.logoPosition === 'right' ? 100 : 0}%</span>
                    </label>
                  </div>
                )}
              />
              <BrandImageField
                title="ลายเซ็นผู้ออกเอกสาร (Signature)"
                hint="ลายเซ็นจะแสดงเหนือเส้นลายเซ็นในช่อง “ผู้ออกเอกสาร” แนะนำไฟล์ PNG พื้นหลังโปร่งใส"
                emptyLabel="ไม่มีลายเซ็น"
                uploadLabel="อัปโหลดลายเซ็น"
                removeLabel="ลบลายเซ็น"
                value={issuerProfile.signatureUrl}
                onChange={(signatureUrl) => setIssuerProfile(prev => ({ ...prev, signatureUrl }))}
                onError={triggerAlert}
              />

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">ชื่อธุรกิจ</label>
                <input
                  type="text"
                  value={issuerProfile.name}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, name: e.target.value })}
                  placeholder="เช่น นายออมสิน ดีแท้ หรือ บริษัท สัญญารัก จำกัด"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
                <p className="text-[9px] text-brand-muted">ใช้เป็นชื่อผู้ออกเอกสาร</p>
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">เลขผู้เสียภาษี</label>
                <input
                  type="text"
                  value={issuerProfile.taxId}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, taxId: e.target.value })}
                  placeholder="เลขผู้เสียภาษี 13 หลัก"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
                <p className="text-[9px] text-brand-muted">แสดงบนใบกำกับภาษีเต็มรูป</p>
              </div>

              <div className="md:col-span-12 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">ที่อยู่ออกใบเสร็จ / ที่อยู่จดทะเบียน</label>
                <textarea
                  value={issuerProfile.address}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, address: e.target.value })}
                  placeholder="เช่น 456 ถนนสุขุมวิท 21 แขวงคลองเตยเหนือ เขตวัฒนา กรุงเทพมหานคร 10110"
                  rows={3}
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">เบอร์โทรศัพท์ติดต่อ</label>
                <input
                  type="text"
                  value={issuerProfile.phone}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, phone: e.target.value })}
                  placeholder="เช่น 089-999-9999"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">อีเมล</label>
                <input
                  type="email"
                  value={issuerProfile.email}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, email: e.target.value })}
                  placeholder="เช่น myemail@gmail.com"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-12 border-t border-brand-border/40 my-2 pt-2">
                <h4 className="text-[11px] font-black text-brand-text dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span>ช่องทางรับโอนเงินของฉัน</span>
                </h4>
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">ชื่อธนาคาร</label>
                <select
                  value={findThaiBank(issuerProfile.bankName) ? issuerProfile.bankName : issuerProfile.bankName || bankOtherMode ? '__other' : ''}
                  onChange={(e) => {
                    if (e.target.value === '__other') {
                      setBankOtherMode(true);
                      if (findThaiBank(issuerProfile.bankName)) setIssuerProfile({ ...issuerProfile, bankName: '' });
                    } else {
                      setBankOtherMode(false);
                      setIssuerProfile({ ...issuerProfile, bankName: e.target.value });
                    }
                  }}
                  aria-label="ธนาคาร"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                >
                  <option value="">— เลือกธนาคาร —</option>
                  {THAI_BANKS.map(bank => (
                    <option key={bank.code} value={bank.name}>{bank.name} ({bank.code})</option>
                  ))}
                  <option value="__other">อื่น ๆ (พิมพ์ชื่อเอง)</option>
                </select>
                {!findThaiBank(issuerProfile.bankName) && (issuerProfile.bankName || bankOtherMode) && (
                  <input
                    type="text"
                    value={issuerProfile.bankName}
                    onChange={(e) => setIssuerProfile({ ...issuerProfile, bankName: e.target.value })}
                    placeholder="พิมพ์ชื่อธนาคาร / ช่องทางรับเงิน เช่น พร้อมเพย์"
                    aria-label="ชื่อธนาคารอื่น ๆ"
                    className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                  />
                )}
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">เลขที่บัญชี</label>
                <input
                  type="text"
                  value={issuerProfile.bankAccount}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, bankAccount: e.target.value })}
                  placeholder="เช่น 123-4-56789-0"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">ชื่อบัญชีโอนรับเงิน</label>
                <input
                  type="text"
                  value={issuerProfile.bankAccountName}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, bankAccountName: e.target.value })}
                  placeholder="เช่น นายออมสิน ดีแท้"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-12 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">เว็บไซต์ (ไม่บังคับ)</label>
                <input
                  type="text"
                  value={issuerProfile.website || ''}
                  onChange={(e) => setIssuerProfile({ ...issuerProfile, website: e.target.value })}
                  placeholder="เช่น https://www.example.com"
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-brand-border/40">
              <button
                type="button"
                onClick={() => void saveBusinessProfile()}
                disabled={businessProfileSaving}
                className="px-6 py-2.5 bg-[#E65F2B] hover:bg-[#A63F1B] text-white rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50"
              >
                {businessProfileSaving ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์ธุรกิจ'}
              </button>
            </div>
          </div>
        </>)}
        {section === 'features' && (<>
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Sparkles className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
              <div>
                <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">ฟีเจอร์เสริม</h3>
                <p className="mt-0.5 text-[10px] text-brand-muted">เปิดใช้งานได้ตามต้องการ ไม่กระทบฟีเจอร์หลักของแอป</p>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-brand-border/40 p-4">
              <div>
                <p className="text-xs font-bold text-brand-text dark:text-white">เป้าหมายการเงิน & การจัดสรรกำไร</p>
                <p className="mt-1 text-[10px] leading-relaxed text-brand-muted">
                  แบ่งกำไรไปยังเป้าหมาย เช่น กองทุนฉุกเฉิน ซื้ออุปกรณ์ หรือลงทุน — เงินที่จัดสรรยังเป็นของคุณ ไม่นับเป็นรายจ่าย กำไรสุทธิจึงไม่ลดลง
                </p>
                <p className={`mt-2 text-[11px] font-medium ${settings.goalsFeatureEnabled === false ? 'text-brand-muted' : 'text-[#C24A16]'}`}>
                  {settings.goalsFeatureEnabled === false
                    ? 'ปิดอยู่ — ไม่แสดงในเมนูและหน้าภาพรวม'
                    : 'เปิดอยู่ — เมนู "เป้าหมายการเงิน" แสดงในไซด์บาร์ และมีวิดเจ็ตในหน้าภาพรวม'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.goalsFeatureEnabled !== false}
                onClick={() => onUpdateSettings({ ...settings, goalsFeatureEnabled: settings.goalsFeatureEnabled === false ? true : false })}
                className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors cursor-pointer ${
                  settings.goalsFeatureEnabled === false ? 'bg-brand-border dark:bg-neutral-700' : 'bg-[#F36A2D]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                    settings.goalsFeatureEnabled === false ? 'left-0.5' : 'left-[18px]'
                  }`}
                />
              </button>
            </div>
          </div>
        </>)}
        </div>
      </div>
    </div>
  );
};

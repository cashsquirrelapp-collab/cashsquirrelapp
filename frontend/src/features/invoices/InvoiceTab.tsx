import PageHeader from '../../components/ui/PageHeader';
import { ContentLoadingSkeleton } from '../../components/ui/AppLoadingSkeleton';
import { uiPrimaryButton, uiSurface } from '../../components/ui/uiStyles';
import { privateCache } from '../../services/privateCache';
import { imageFileToDataUrl } from '../../services/images';
import { readInvoices, saveCloud, type DocumentQuota } from '../../services/cloud';
import { validateChanges } from '../../../../shared/validation';
import { useLanguage } from '../../i18n/LanguageContext';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Job, Invoice, InvoiceItem, InvoiceProfile, DocumentType } from '../../../../shared/types';
import { DocumentPreview, DOCUMENT_TYPES, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT, calculateDocumentTotals, getDocumentMeta, printDocument } from './DocumentA4';
import { dateLocale, formatCurrency } from '../../utils';
import { NewDocumentButton, PreviewCanvas, RowMenu, ShareButton } from './DocumentWorkspaceParts';
import { DocumentFullView } from './DocumentFullView';
import { downloadBlob, usePdfFile } from './documentPdf';
import { DOCUMENT_WORKSPACE_TABS, getWorkspaceTab, isWorkspaceTab, isDocumentTypeAvailable, resolveDocumentWorkspaceTab, resolveDocumentSelection, mergeImportedDocuments, type DocumentWorkspaceTab } from './documentAvailability';
import { ChevronRight, Eye, Link2, Search } from 'lucide-react';
import { clientHasMoreDetails, documentChain, draftFromSource, findSavedClient, savedClients } from './documentLinks';
import NumberInput from '../../components/ui/NumberInput';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Settings, 
  ArrowLeft, 
  Copy, 
  User, 
  Building, 
  Calendar,
  Briefcase,
  AlertCircle,
  Download,
  Upload,
  Send,
  ChevronDown,
  RotateCcw,
  PenLine
} from 'lucide-react';

import { tr } from '../../i18n/tr';
import { currentLanguage } from '../../i18n/currentLanguage';
// Editor form styles: one surface, sections split by a hairline, same-size fields everywhere.
const formSection = 'space-y-4 border-b border-brand-border px-5 py-6 last-of-type:border-b-0 sm:px-6';
const formHeading = 'text-[15px] font-semibold text-brand-text';
const formLabel = 'mb-1.5 block text-[13px] font-medium text-brand-text';
const formMiniLabel = 'mb-1 block text-xs text-brand-muted';
const formHint = 'text-xs text-brand-muted';
const formInput = 'h-11 w-full min-w-0 rounded-[10px] border border-brand-border bg-brand-white px-3.5 text-[14px] text-brand-text outline-none transition-colors placeholder:text-brand-muted/70 focus:border-[#E65F2B] dark:bg-[#141518]';

// The open tab lives in ?type= so a refresh (or a shared link) lands on the same tab.
const TAB_PARAM = 'type';
const readTabFromUrl = (): string | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(TAB_PARAM) ?? params.get('tab');
    return isWorkspaceTab(value) || value === 'receiptTaxInvoice' ? value : null;
  } catch { return null; }
};
const writeTabToUrl = (tab: DocumentWorkspaceTab) => {
  try {
    const url = new URL(window.location.href);
    const alias = url.searchParams.get('tab');
    if (isWorkspaceTab(alias) || alias === 'receiptTaxInvoice') url.searchParams.set('tab', tab);
    url.searchParams.set(TAB_PARAM, tab);
    if (url.href === window.location.href) return;
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch { /* the tab still works without the URL */ }
};

// Upload box for the logo / signature images kept on the issuer profile. Exported so the
// business-profile editor on the Settings page (the only place that edits this profile now)
// can reuse it without duplicating the upload/crop/position UI.
export const BrandImageField: React.FC<{
  title: string;
  hint: string;
  emptyLabel: string;
  uploadLabel: string;
  removeLabel: string;
  value?: string;
  onChange: (value: string) => void;
  onError: (title: string, message: string) => void;
  size?: { label: string; value: number; min: number; max: number; onChange: (value: number) => void };
  extra?: React.ReactNode;
}> = ({ title, hint, emptyLabel, uploadLabel, removeLabel, value, onChange, onError, size, extra }) => (
  <div className="space-y-3">
    <div>
      <h4 className="text-[14px] font-medium text-brand-text">{title}</h4>
      <p className="mt-0.5 text-xs text-brand-muted">{hint}</p>
    </div>

    <div className="flex flex-col sm:flex-row gap-5 items-center">
      <div className="w-24 h-24 border border-dashed border-brand-border rounded-xl bg-white dark:bg-[#141518] flex items-center justify-center overflow-hidden shrink-0">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
        ) : (
          <div className="text-center p-2 flex flex-col items-center gap-1">
            <Upload className="w-5 h-5 text-brand-muted" />
            <span className="text-[11px] text-brand-muted">{emptyLabel}</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2 w-full">
        <div className="flex flex-wrap gap-2">
          <label className="px-3.5 py-2 bg-[#E65F2B] hover:bg-[#D35221] text-white text-[13px] font-medium rounded-xl cursor-pointer transition-colors flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            <span>{uploadLabel}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                input.value = ''; // picking the same file again must still fire onChange
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                  onError(tr("ไฟล์มีขนาดใหญ่เกินไป"), tr("กรุณาอัปโหลดภาพที่มีขนาดไม่เกิน 2MB เพื่อประสิทธิภาพที่รวดเร็ว"));
                  return;
                }
                imageFileToDataUrl(file).then(onChange).catch(error => onError(tr("อัปโหลดภาพไม่สำเร็จ"), error.message));
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3.5 py-2 border border-brand-border text-brand-text hover:bg-[#FDEEEE] hover:text-[#C43A3A] dark:hover:bg-[#F19A9A]/10 dark:hover:text-[#F19A9A] text-[13px] rounded-xl transition-colors cursor-pointer"
            >
              {removeLabel}
            </button>
          )}
        </div>
        {size && value ? (
          <label className="flex items-center gap-3 text-xs text-brand-muted">
            <span className="w-24 shrink-0">{tr("ขนาดบนเอกสาร")}</span>
            <input
              type="range"
              min={size.min}
              max={size.max}
              step={4}
              value={size.value}
              onChange={(e) => size.onChange(Number(e.target.value))}
              aria-label={size.label}
              className="w-full max-w-xs accent-[#E65F2B] cursor-pointer"
            />
            <span className="font-mono w-14 text-right">{size.value}px</span>
          </label>
        ) : null}
        {value ? extra : null}
        <p className="text-[11px] text-brand-muted leading-relaxed">
          {tr("* รองรับ PNG, JPEG และ WebP ไม่เกิน 2MB ระบบย่อภาพก่อนบันทึก")}</p>
      </div>
    </div>
  </div>
);


interface InvoiceTabProps {
  jobs: Job[];
  ownerId?: string;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  /** Free plan: 10 new documents a month (counted by the server) and a credit line on every page. */
  freePlan?: boolean;
  /** Opens the upgrade dialog, with the reason shown in it. */
  onUpgradePrompt?: (notice: string) => void;
  /** Resolved from the current account's trusted system role by App. */
  fullFeatureAccess?: boolean;
}

export const InvoiceTab: React.FC<InvoiceTabProps> = ({
  jobs,
  ownerId,
  triggerAlert,
  triggerConfirm,
  freePlan = false,
  onUpgradePrompt,
  fullFeatureAccess = false,
}) => {
  const { t } = useLanguage();
  const fullFeatureAccessRef = React.useRef(fullFeatureAccess);
  fullFeatureAccessRef.current = fullFeatureAccess;
  const [quota, setQuota] = useState<DocumentQuota | null>(null);
  const quotaLeft = freePlan && quota ? Math.max(0, quota.limit - quota.used) : Infinity;
  // New documents (create, duplicate, import) stop here on a Free plan once the month's quota is
  // used; the server refuses them too, so this only spares the user a form they cannot save.
  const allowNewDocuments = (count = 1) => {
    if (count <= quotaLeft) return true;
    onUpgradePrompt?.(quotaLeft === 0
      ? tr("ใช้โควตาออกเอกสารฟรีของเดือนนี้ครบ {0} ฉบับแล้ว อัปเกรดเป็น Pro เพื่อออกเอกสารได้ไม่จำกัด", quota!.limit)
      : tr("โควตาออกเอกสารฟรีของเดือนนี้เหลือ {0} ฉบับ แต่รายการนี้ต้องใช้ {1} ฉบับ อัปเกรดเป็น Pro เพื่อออกเอกสารได้ไม่จำกัด", quotaLeft, count));
    return false;
  };
  const [storageReady, setStorageReady] = useState(!ownerId);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const invoiceKey = `cashflow_invoices_${ownerId || 'guest'}`;
  const issuerKey = `cashflow_issuer_${ownerId || 'guest'}`;
  // Local states
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'create'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const tabFromUrl = React.useRef(readTabFromUrl());
  const requestedDocument = React.useRef(new URLSearchParams(window.location.search).get('document'));
  const [documentLinkMissing, setDocumentLinkMissing] = useState(false);
  const [focusLinkedDocument, setFocusLinkedDocument] = useState(requestedDocument.current !== null);
  const [requestedDocTypeFilter, setDocTypeFilter] = useState<DocumentWorkspaceTab>(() => resolveDocumentWorkspaceTab(tabFromUrl.current, fullFeatureAccess));
  const docTypeFilter = resolveDocumentWorkspaceTab(requestedDocTypeFilter, fullFeatureAccess);
  const [listQuery, setListQuery] = useState('');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  // Optional payment/delivery terms and reference: hidden behind a toggle unless already filled in.
  const [docTermsOpen, setDocTermsOpen] = useState(false);
  useEffect(() => { writeTabToUrl(docTypeFilter); }, [docTypeFilter]);
  // Switching between the list and the form starts at the top, not wherever the long form was scrolled.
  const pageTopRef = React.useRef<HTMLDivElement>(null);
  const firstSubTabRender = React.useRef(true);
  useEffect(() => {
    if (firstSubTabRender.current) { firstSubTabRender.current = false; return; }
    pageTopRef.current?.scrollIntoView({ block: 'start' });
  }, [activeSubTab]);

  // Default Issuer Profile
  const [issuerProfile, setIssuerProfile] = useState<InvoiceProfile>({
    name: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    bankName: '',
    bankAccount: '',
    bankAccountName: '',
    logoUrl: ''
  });

  // Editor states
  const [docType, setDocType] = useState<DocumentType>('invoice');
  const [docNo, setDocNo] = useState('');
  const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [responseDate, setResponseDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientTaxId, setClientTaxId] = useState('');
  const [clientContactName, setClientContactName] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [clientBranch, setClientBranch] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paidAmount, setPaidAmount] = useState<number | ''>('');
  
  const [paymentTerm, setPaymentTerm] = useState('');
  const [deliveryTerm, setDeliveryTerm] = useState('');
  const [refNo, setRefNo] = useState('');
  // Linked documents: the document this draft was issued from ("ออกต่อเป็น…") and whether it stays linked.
  const [linkSource, setLinkSource] = useState<Invoice | null>(null);
  const [linkedFromId, setLinkedFromId] = useState<string | undefined>(undefined);
  const hasDocTerms = Boolean(paymentTerm || deliveryTerm || refNo);
  const docTermsVisible = docTermsOpen || hasDocTerms;
  
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { id: '1', description: tr("บริการให้คำปรึกษา / บริการงานผลิตสร้างสรรค์"), quantity: 1, price: 5000 }
  ]);
  const [vatRate, setVatRate] = useState<number>(0); // 0 or 7
  const [whtRate, setWhtRate] = useState<number>(0); // 0, 1, 3, 5
  const [docNote, setDocNote] = useState(tr("ขอบคุณที่ใช้บริการ / กรุณาชำระเงินภายในกำหนดเวลา"));

  // Copy-state feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const canAccessDraft = isDocumentTypeAvailable(docType, fullFeatureAccess)
    && (!editingInvoiceId || invoices.some(inv => inv.id === editingInvoiceId && isDocumentTypeAvailable(inv.documentType, fullFeatureAccess)));

  // Load from local storage on mount
  useEffect(() => {
    let cancelled = false;
    setLoadedOwner(null);
    setSelectedInvoice(null);
    setDocumentLinkMissing(false);
    initialSelectionDone.current = false;
    if (ownerId) {
      setStorageReady(false);
      readInvoices(ownerId).then(data => {
        if (cancelled) return;
        setInvoices(data.invoices || []);
        setQuota(data.documentQuota);
        privateCache.setItem(invoiceKey,JSON.stringify(data.invoices || []));
        if (data.issuer_profile) {setIssuerProfile(data.issuer_profile);privateCache.setItem(issuerKey,JSON.stringify(data.issuer_profile));}
        setStorageReady(true);
        setLoadedOwner(ownerId);
      }).catch(error => { if (!cancelled) setStorageError(error.message); });
      return () => { cancelled = true; };
    }
    const savedInvoices = privateCache.getItem(invoiceKey);
    if (savedInvoices) {
      try {
        setInvoices(JSON.parse(savedInvoices));
      } catch (e) {
        console.error('Error parsing saved invoices:', e);
      }
    } else {
      // Seed with sample invoice if empty
      const sample: Invoice = {
        id: 'sample-1',
        documentType: 'invoice',
        documentNo: 'INV-2026-001',
        createdDate: new Date().toISOString().split('T')[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        issuer: {
          name: tr("นายสมชาย ดีมีสุข (อาชีพอิสระ)"),
          address: tr("123/45 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพมหานคร 10500"),
          phone: '081-234-5678',
          email: 'somchai.freelance@gmail.com',
          taxId: '1234567890123',
          bankName: tr("ธนาคารกสิกรไทย"),
          bankAccount: '012-3-45678-9',
          bankAccountName: tr("นายสมชาย ดีมีสุข")
        },
        client: {
          name: tr("บริษัท ครีเอทีฟ มาร์เก็ตติ้ง จำกัด (สำนักงานใหญ่)"),
          address: tr("999/88 อาคารเพลินจิตเซ็นเตอร์ ชั้น 12 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110"),
          phone: '02-111-2222',
          email: 'finance@creativemarketing.co.th',
          taxId: '0105560123456'
        },
        items: [
          { id: 'i1', description: tr("ออกแบบกราฟิกแบนเนอร์โฆษณาแคมเปญครบรอบ 5 ปี"), quantity: 5, price: 2500 },
          { id: 'i2', description: tr("ตัดต่อวิดีโอสั้นลงโซเชียลมีเดีย จำนวน 3 ตอน"), quantity: 3, price: 4000 }
        ],
        vatRate: 0,
        whtRate: 3,
        note: tr("กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ")
      };
      setInvoices([sample]);
      privateCache.setItem(invoiceKey, JSON.stringify([sample]));
    }

    const savedIssuer = privateCache.getItem(issuerKey);
    if (savedIssuer) {
      try {
        setIssuerProfile(JSON.parse(savedIssuer));
      } catch (e) {
        console.error('Error parsing issuer profile:', e);
      }
    }
    setLoadedOwner('guest');
  }, [ownerId]);

  // Save invoices to local storage
  const saveInvoicesToStorage = (updatedList: Invoice[]) => {
    const previousList = invoices;
    setInvoices(updatedList);
    privateCache.setItem(invoiceKey, JSON.stringify(updatedList));
    if (ownerId && storageReady) {
      setSaving(true);
      saveCloud(ownerId, { invoices: updatedList }).then(reply => {
        setStorageError(null);
        if (reply?.document_quota) setQuota(reply.document_quota);
      }).catch(error => {
        if (error?.code === 'document_quota_exceeded') {
          // The server refused the new documents (the quota was used up elsewhere): take them off again.
          setInvoices(previousList);
          privateCache.setItem(invoiceKey, JSON.stringify(previousList));
          setSelectedInvoice(current => current && previousList.some(inv => inv.id === current.id) ? current : null);
          setQuota(current => current && { ...current, used: current.limit });
          onUpgradePrompt?.(error.message);
          return;
        }
        setStorageError(error.message); triggerAlert(tr("บันทึกเอกสารไม่สำเร็จ"), error.message);
      }).finally(() => setSaving(false));
    }
  };

  // Pre-fill fields from Job selection
  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    setClientName(job.client || '');
    const known = findSavedClient(clients, job.client || '');
    if (known) applySavedClient(known);
    setInvoiceItems([
      {
        id: 'job-item',
        description: tr("ค่าบริการงาน: {0} ({1})", job.name, job.type),
        quantity: 1,
        price: job.value || 0
      }
    ]);
    setDueDate(job.payDate || '');
    setWhtRate(job.whtRate || 0);
    
    // Automatically generate temporary Doc Number if empty
    if (!docNo) {
      const year = new Date().getFullYear() + 543; // Thai year for local style or standard
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      setDocNo(`INV-${year}-${randomSuffix}`);
    }
  };

  // Manage items table
  const handleAddItemRow = () => {
    const newId = Date.now().toString();
    setInvoiceItems([...invoiceItems, { id: newId, description: '', quantity: 1, price: 0, discount: 0 }]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (invoiceItems.length <= 1) {
      triggerAlert(tr("ไม่สามารถลบได้"), tr("อย่างน้อยต้องมีรายการสินค้าหรือบริการอย่างน้อย 1 รายการ"));
      return;
    }
    setInvoiceItems(invoiceItems.filter(item => item.id !== id));
  };

  const handleItemFieldChange = (id: string, field: 'description' | 'quantity' | 'price' | 'discount' | 'unit' | 'detail', value: any) => {
    setInvoiceItems(invoiceItems.map(item => {
      if (item.id === id) {
        if (field === 'quantity') {
          return { ...item, quantity: Math.max(1, parseInt(value) || 1) };
        }
        if (field === 'price') {
          return { ...item, price: Math.max(0, parseFloat(value) || 0) };
        }
        if (field === 'discount') {
          return { ...item, discount: Math.max(0, parseFloat(value) || 0) };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // Calculate Subtotal, VAT, WHT, Grand total (subtotal is net of each line's own discount)
  const calculateTotals = (itemsList: InvoiceItem[], vat: number, wht: number) => {
    const t = calculateDocumentTotals(itemsList, vat, wht);
    return { subtotal: t.subtotal, vatAmount: t.vatAmount, whtAmount: t.whtAmount, grandTotal: t.payable };
  };

  const { subtotal, vatAmount, whtAmount, grandTotal } = calculateTotals(invoiceItems, vatRate, whtRate);

  // The document as the form currently describes it -- saved on submit, and drawn live next to
  // the form while editing.
  const buildDraftInvoice = (): Invoice => ({
    id: editingInvoiceId || 'draft',
    documentType: docType,
    documentNo: docNo,
    createdDate: createdDate,
    dueDate: dueDate || undefined,
    responseDate: responseDate || undefined,
    issuer: issuerProfile,
    client: {
      name: clientName,
      address: clientAddress,
      phone: clientPhone,
      email: clientEmail,
      taxId: clientTaxId,
      contactName: clientContactName || undefined,
      code: clientCode || undefined,
      branch: clientBranch || undefined
    },
    items: invoiceItems,
    vatRate: vatRate,
    whtRate: whtRate,
    note: docNote,
    paymentTerm: paymentTerm || undefined,
    deliveryTerm: deliveryTerm || undefined,
    refNo: refNo || undefined,
    linkedFromId: linkedFromId || undefined,
    paidDate: paidDate || undefined,
    paymentMethod: paymentMethod || undefined,
    paidAmount: paidAmount === '' ? undefined : paidAmount
  });

  // Create or Update Invoice
  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAccessDraft) return;

    if (!docNo.trim()) {
      triggerAlert(tr("ป้อนข้อมูลไม่ครบ"), tr("กรุณาระบุเลขที่เอกสาร"));
      return;
    }

    if (!clientName.trim()) {
      triggerAlert(tr("ป้อนข้อมูลไม่ครบ"), tr("กรุณาระบุชื่อลูกค้าหรือบริษัทผู้รับบริการ"));
      return;
    }
    if (!editingInvoiceId && !allowNewDocuments()) return;

    const newInvoice: Invoice = { ...buildDraftInvoice(), id: editingInvoiceId || crypto.randomUUID() };

    let updatedList;
    if (editingInvoiceId) {
      updatedList = invoices.map(inv => inv.id === editingInvoiceId ? newInvoice : inv);
      triggerAlert(tr("อัปเดตสำเร็จ"), tr("บันทึกการแก้ไขบิลเรียบร้อยแล้ว"));
    } else {
      updatedList = [newInvoice, ...invoices];
      triggerAlert(tr("ออกบิลสำเร็จ"), tr("สร้างเอกสารใหม่เรียบร้อยแล้ว"));
    }

    saveInvoicesToStorage(updatedList);
    setSelectedInvoice(newInvoice);
    setDocTypeFilter(getWorkspaceTab(newInvoice.documentType));
    setEditingInvoiceId(null);
    setActiveSubTab('list');
  };

  // Delete invoice
  const handleDeleteInvoice = (id: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const target = invoices.find(inv => inv.id === id);
    if (!target || !isDocumentTypeAvailable(target.documentType, fullFeatureAccess)) return;
    const issuedFromThis = invoices.filter(inv => inv.linkedFromId === id).length;
    triggerConfirm(
      tr("ยืนยันการลบบิล"),
      tr("คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารใบนี้? ข้อมูลการออกบิลของใบนี้จะหายไปอย่างถาวร{0}", issuedFromThis ? tr(" เอกสาร {0} ใบที่ออกต่อจากใบนี้จะยังอยู่ แต่ไม่ลิงก์กับใบนี้แล้ว", issuedFromThis) : ''),
      () => {
        if (!isDocumentTypeAvailable(target.documentType, fullFeatureAccessRef.current)) return;
        const updated = invoices.filter(inv => inv.id !== id);
        saveInvoicesToStorage(updated);
        if (selectedInvoice && selectedInvoice.id === id) {
          // stay on the same tab: select the next document of this type, if any
          setSelectedInvoice(updated.find(inv => getWorkspaceTab(inv.documentType) === docTypeFilter) || null);
        }
      }
    );
  };

  // Open editor with empty form for creating new invoice
  const handleOpenCreateForm = (type: DocumentType = docTypeFilter): boolean => {
    if (!isDocumentTypeAvailable(type, fullFeatureAccess)) return false;
    if (!allowNewDocuments()) return false;
    setEditingInvoiceId(null);
    setLinkSource(null);
    setLinkedFromId(undefined);
    setSelectedJobId('');
    setDocType(type);
    
    // Auto increment document no based on current count
    const thaiYear = new Date().getFullYear() + 543;
    const serial = String(invoices.length + 1).padStart(3, '0');
    setDocNo(`${getDocumentMeta(type).prefix}-${thaiYear}-${serial}`);
    
    setCreatedDate(new Date().toISOString().split('T')[0]);
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setResponseDate('');
    setClientName('');
    setClientAddress('');
    setClientPhone('');
    setClientEmail('');
    setClientTaxId('');
    setClientContactName('');
    setClientCode('');
    setClientBranch('');
    setPaidDate('');
    setPaymentMethod('');
    setPaidAmount('');
    setInvoiceItems([{ id: '1', description: '', quantity: 1, price: 0, discount: 0 }]);
    setVatRate(0);
    setWhtRate(0);
    setDocNote(tr("กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ"));
    setPaymentTerm(tr("โอนเงินผ่านบัญชีธนาคาร"));
    setDeliveryTerm(tr("ทันทีหลังได้รับเงินมัดจำ / ชำระเงิน"));
    setRefNo('');
    if (getDocumentMeta(type).isTax) setVatRate(7); // tax invoices carry VAT by definition
    setActiveSubTab('create');
    return true;
  };

  // "ออกต่อเป็น…": a new document of another type, filled from `source`, linked to it unless the user unticks.
  const handleIssueFrom = (source: Invoice, type: DocumentType) => {
    if (!isDocumentTypeAvailable(source.documentType, fullFeatureAccess)) return;
    if (!handleOpenCreateForm(type)) return;
    const draft = draftFromSource(source, type, new Date().toISOString().split('T')[0]);
    applySavedClient(draft.client);
    setClientName(draft.client.name);
    setInvoiceItems(draft.items);
    setVatRate(getDocumentMeta(type).isTax && draft.vatRate === 0 ? 7 : draft.vatRate);
    setWhtRate(draft.whtRate);
    if (draft.note) setDocNote(draft.note);
    setPaymentTerm(draft.paymentTerm);
    setDeliveryTerm(draft.deliveryTerm);
    setRefNo(draft.refNo);
    setLinkSource(source);
    setLinkedFromId(draft.linkedFromId);
  };
  const setKeepLinked = (keep: boolean) => {
    if (!linkSource) return;
    setLinkedFromId(keep ? linkSource.id : undefined);
    if (keep && !refNo) setRefNo(linkSource.documentNo);
    if (!keep && refNo === linkSource.documentNo) setRefNo('');
  };

  // Clear form fields to start fresh
  const handleClearForm = () => {
    triggerConfirm(
      tr("ยืนยันการล้างข้อมูลฟอร์ม"),
      tr("คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลที่กรอกไว้ทั้งหมดเพื่อเริ่มต้นใหม่?"),
      () => {
        setClientName('');
        setClientAddress('');
        setClientPhone('');
        setClientEmail('');
        setClientTaxId('');
        setClientContactName('');
        setClientCode('');
        setClientBranch('');
        setPaidDate('');
        setPaymentMethod('');
        setPaidAmount('');
        setInvoiceItems([{ id: '1', description: '', quantity: 1, price: 0, discount: 0 }]);
        setVatRate(0);
        setWhtRate(0);
        setDocNote(tr("กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ"));
        setPaymentTerm('');
        setDeliveryTerm('');
        setRefNo('');
        setResponseDate('');
        setSelectedJobId('');
        
        // Reset doc selection and generate new number if in create mode
        if (!editingInvoiceId) {
          const thaiYear = new Date().getFullYear() + 543;
          const serial = String(invoices.length + 1).padStart(3, '0');
          setDocNo(`${getDocumentMeta(docType).prefix}-${thaiYear}-${serial}`);
          setCreatedDate(new Date().toISOString().split('T')[0]);
          setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        }
      }
    );
  };

  // Edit existing invoice
  const handleStartEditInvoice = (inv: Invoice, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!isDocumentTypeAvailable(inv.documentType, fullFeatureAccess)) return;
    setEditingInvoiceId(inv.id);
    setSelectedJobId('');
    setDocType(inv.documentType);
    setDocNo(inv.documentNo);
    setCreatedDate(inv.createdDate);
    setDueDate(inv.dueDate || '');
    setResponseDate(inv.responseDate || '');
    setClientName(inv.client.name);
    setClientAddress(inv.client.address || '');
    setClientPhone(inv.client.phone || '');
    setClientEmail(inv.client.email || '');
    setClientTaxId(inv.client.taxId || '');
    setClientContactName(inv.client.contactName || '');
    setClientCode(inv.client.code || '');
    setClientBranch(inv.client.branch || '');
    setPaidDate(inv.paidDate || '');
    setPaymentMethod(inv.paymentMethod || '');
    setPaidAmount(inv.paidAmount ?? '');
    setInvoiceItems(inv.items);
    setVatRate(inv.vatRate);
    setWhtRate(inv.whtRate);
    setDocNote(inv.note || '');
    setPaymentTerm(inv.paymentTerm || '');
    setDeliveryTerm(inv.deliveryTerm || '');
    setRefNo(inv.refNo || '');
    setLinkSource(null);
    setLinkedFromId(inv.linkedFromId);
    setActiveSubTab('create');
  };

  // Clients from earlier documents, to fill a new one without typing the details again.
  const clients = React.useMemo(() => savedClients(invoices), [invoices]);
  const currentClient = { name: clientName, address: clientAddress, phone: clientPhone, email: clientEmail, taxId: clientTaxId, contactName: clientContactName, code: clientCode, branch: clientBranch };
  const matchedClient = findSavedClient(clients, clientName);
  function applySavedClient(client: Invoice['client']) {
    setClientAddress(client.address || '');
    setClientPhone(client.phone || '');
    setClientEmail(client.email || '');
    setClientTaxId(client.taxId || '');
    setClientContactName(client.contactName || '');
    setClientCode(client.code || '');
    setClientBranch(client.branch || '');
  }
  const issueTypes = (source: Invoice) => creatableTypes.filter(type => type !== source.documentType);
  const issueMenuItems = (source: Invoice) => issueTypes(source).map(type => ({ label: tr("ออกต่อเป็น{0}", tr(getDocumentMeta(type).th)), run: () => handleIssueFrom(source, type) }));
  const openDocument = (doc: Invoice) => { setSelectedInvoice(doc); setDocTypeFilter(getWorkspaceTab(doc.documentType)); };

  // Documents keep the issuer details they were created with, but the logo and signature come
  // from the current profile so uploading them also updates documents created earlier.
  const withCurrentBranding = (inv: Invoice): Invoice => ({
    ...inv,
    issuer: {
      ...inv.issuer,
      logoUrl: issuerProfile.logoUrl || inv.issuer.logoUrl,
      logoHeight: issuerProfile.logoUrl ? issuerProfile.logoHeight : inv.issuer.logoHeight,
      logoPosition: issuerProfile.logoUrl ? issuerProfile.logoPosition : inv.issuer.logoPosition,
      logoOffset: issuerProfile.logoUrl ? issuerProfile.logoOffset : inv.issuer.logoOffset,
      signatureUrl: issuerProfile.signatureUrl || inv.issuer.signatureUrl,
      // documents made before any bank details were saved pick up the current ones
      ...(inv.issuer.bankAccount ? {} : { bankName: issuerProfile.bankName, bankAccount: issuerProfile.bankAccount, bankAccountName: issuerProfile.bankAccountName })
    }
  });

  // Copy details of an invoice to make a new one
  const handleDuplicateInvoice = (inv: Invoice, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!isDocumentTypeAvailable(inv.documentType, fullFeatureAccess)) return;
    if (!allowNewDocuments()) return;
    const thaiYear = new Date().getFullYear() + 543;
    const serial = String(invoices.length + 1).padStart(3, '0');
    const duplicated: Invoice = {
      ...inv,
      id: crypto.randomUUID(),
      documentNo: `${getDocumentMeta(inv.documentType).prefix}-${thaiYear}-${serial}`,
      paidDate: undefined,
      createdDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
    saveInvoicesToStorage([duplicated, ...invoices]);
    setSelectedInvoice(duplicated);
    setDocTypeFilter(getWorkspaceTab(duplicated.documentType));
    triggerAlert(tr("คัดลอกบิลสำเร็จ"), tr("สร้างเอกสารใบใหม่โดยคัดลอกโครงร่างจากใบ {0} เรียบร้อยแล้ว", inv.documentNo));
  };

  const handlePrintDocument = () => {
    if (!selectedInvoice || !isDocumentTypeAvailable(selectedInvoice.documentType, fullFeatureAccess)) return;
    if (!printDocument(withCurrentBranding(selectedInvoice), freePlan)) {
      triggerAlert(
        tr("ป็อปอัปถูกบล็อก"),
        tr("เบราว์เซอร์ของคุณบล็อกป็อปอัป กรุณาอนุญาตการแสดงป็อปอัปสำหรับเว็บไซต์นี้เพื่อให้สามารถพิมพ์หรือบันทึก PDF ในหน้าต่างใหม่ได้")
      );
    }
  };

  // A real PDF file of the open document, prepared in the background for sharing and download.
  const shownInvoice = selectedInvoice && isDocumentTypeAvailable(selectedInvoice.documentType, fullFeatureAccess) && getWorkspaceTab(selectedInvoice.documentType) === docTypeFilter ? withCurrentBranding(selectedInvoice) : null;
  const pdf = usePdfFile(shownInvoice, freePlan);
  const [pdfBusy, setPdfBusy] = useState(false);
  const handleDownloadPdf = async () => {
    if (!shownInvoice) return;
    setPdfBusy(true);
    try {
      const file = pdf.file ?? await pdf.ensure();
      downloadBlob(file, file.name);
    } catch {
      triggerAlert(tr("สร้างไฟล์ PDF ไม่สำเร็จ"), tr("จะเปิดหน้าพิมพ์แทน เลือก “บันทึกเป็น PDF” เพื่อเก็บไฟล์"));
      handlePrintDocument();
    } finally {
      setPdfBusy(false);
    }
  };

  // Pick a document once, when the list first arrives. This used to run every time nothing was
  // selected -- which is exactly the state after opening a tab with no documents -- and it then
  // jumped back to the first document's tab, so ใบแจ้งหนี้ / ใบเสร็จ / ใบกำกับภาษี looked dead
  // whenever an account only had quotations. A tab from the URL wins over the first document.
  const initialSelectionDone = React.useRef(false);
  useEffect(() => {
    initialSelectionDone.current = false;
    if (!canAccessDraft) {
      setEditingInvoiceId(null);
      setActiveSubTab('list');
      setDocType('invoice');
    }
  }, [fullFeatureAccess]);
  useEffect(() => {
    if (initialSelectionDone.current || loadedOwner !== (ownerId || 'guest')) return;
    initialSelectionDone.current = true;
    // A LINE document link must never silently substitute a different document, even if
    // the requested document was deleted or belongs to another signed-in account.
    const selection = resolveDocumentSelection(invoices, tabFromUrl.current, requestedDocument.current, fullFeatureAccess);
    setSelectedInvoice(selection.document);
    setDocumentLinkMissing(selection.missing);
    setDocTypeFilter(selection.tab);
  }, [invoices, loadedOwner, ownerId, fullFeatureAccess]);

  if (ownerId && !storageReady) return storageError
    ? <div className="rounded-2xl border border-brand-border bg-brand-white p-8 text-center" role="alert">{storageError}</div>
    : <ContentLoadingSkeleton page="invoice" />;
  const importLegacy = () => triggerConfirm(tr("นำเข้าเอกสารเดิมจากเครื่อง"), tr("เอกสารรุ่นเดิมไม่ได้ระบุเจ้าของบัญชี กรุณายืนยันว่าเอกสารทั้งหมดนี้เป็นของคุณ ก่อนนำเข้าบัญชีปัจจุบัน"), async () => {
    try {
      const list: Invoice[] = JSON.parse(localStorage.getItem('remix_invoices') || '[]');
      const profile = JSON.parse(localStorage.getItem('remix_issuer_profile') || 'null');
      validateChanges(list.map((row: Invoice) => ({table:'cashflow_invoices',id:row.id,op:'set',version:null,data:row})));
      const merged = mergeImportedDocuments(invoices, list);
      if (!allowNewDocuments(merged.length - invoices.length)) return;
      await saveCloud(ownerId!, {invoices:merged, ...(profile ? {issuer_profile:profile} : {})});
      setInvoices(merged);
      privateCache.setItem(invoiceKey, JSON.stringify(merged));
      if (profile) setIssuerProfile(profile);
      localStorage.removeItem('remix_invoices'); localStorage.removeItem('remix_issuer_profile');
    } catch (error: any) { triggerAlert(tr("นำเข้าเอกสารไม่สำเร็จ"), error.message); }
  });

  const query = listQuery.trim().toLowerCase();
  const tabInvoices = invoices.filter(inv => isDocumentTypeAvailable(inv.documentType, fullFeatureAccess) && getWorkspaceTab(inv.documentType) === docTypeFilter);
  const filteredInvoices = tabInvoices.filter(inv => !query
    || inv.documentNo.toLowerCase().includes(query) || (inv.client.name || '').toLowerCase().includes(query));
  const activeTabLabel = tr(DOCUMENT_WORKSPACE_TABS.find(tab => tab.key === docTypeFilter)?.label ?? '');
  const creatableTypes = DOCUMENT_TYPES.filter(type => isDocumentTypeAvailable(type, fullFeatureAccess));
  // Documents that are linked to another one (issued from it, or issued onward), and the open one's chain.
  const linkedIds = new Set(invoices.flatMap(inv => (inv.linkedFromId && invoices.some(source => source.id === inv.linkedFromId) ? [inv.id, inv.linkedFromId] : [])));
  const selectedChain = selectedInvoice ? documentChain(invoices, selectedInvoice.id).filter(doc => isDocumentTypeAvailable(doc.documentType, fullFeatureAccess)) : [];
  const workspaceTabs = DOCUMENT_WORKSPACE_TABS.filter(tab => isDocumentTypeAvailable(tab.key, fullFeatureAccess));

  const handleWorkspaceTabChange = (tab: DocumentWorkspaceTab) => {
    if (!isDocumentTypeAvailable(tab, fullFeatureAccess)) return;
    setDocTypeFilter(tab);
    setListQuery('');
    const firstDocument = invoices.find(inv => getWorkspaceTab(inv.documentType) === tab);
    setSelectedInvoice(firstDocument || null);
    setActiveSubTab('list');
  };

  const showAllDocuments = () => {
    requestedDocument.current = null;
    setFocusLinkedDocument(false);
    setDocumentLinkMissing(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('document');
    url.searchParams.delete('from');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  };

  if (documentLinkMissing) return (
    <div className="mx-auto max-w-lg rounded-2xl border border-brand-border bg-brand-white p-8 text-center" role="alert">
      <FileText className="mx-auto mb-4 h-10 w-10 text-brand-muted" />
      <h2 className="text-lg font-semibold text-brand-text">{tr("ไม่พบเอกสารนี้ในบัญชีที่เข้าสู่ระบบ")}</h2>
      <p className="mt-2 text-sm text-brand-muted">{tr("เอกสารอาจถูกลบแล้ว หรือคุณกำลังใช้คนละบัญชีกับที่เชื่อม LINE ไว้")}</p>
      <button type="button" onClick={showAllDocuments} className="mt-5 rounded-xl bg-[#E65F2B] px-5 py-3 text-sm font-semibold text-white">{tr("ดูเอกสารในบัญชีนี้")}</button>
    </div>
  );

  return (
    <div ref={pageTopRef} className="page-content app-tab-enter space-y-6 pb-16">
      {(storageError || saving || (ownerId && localStorage.getItem('remix_invoices'))) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 text-xs no-print" role="status">
          {(storageError || saving) && <span className={storageError ? 'text-red-600' : 'text-brand-muted'}>{storageError || tr("กำลังบันทึกเอกสาร…")}</span>}
          {ownerId && localStorage.getItem('remix_invoices') && <button type="button" onClick={importLegacy} className="font-bold text-[#E65F2B]">{tr("นำเข้าเอกสารเดิมจากเครื่อง")}</button>}
        </div>
      )}
      
      <PageHeader page="invoice" description={isDocumentTypeAvailable('quotation', fullFeatureAccess) ? undefined : t('page.invoicePhaseOneDescription')} className="no-print">
        <NewDocumentButton types={creatableTypes} onPick={handleOpenCreateForm} />
      </PageHeader>

      {freePlan && quota && (
        <div data-testid="document-quota" role="status"
          className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl px-4 py-2.5 text-[13px] no-print ${quotaLeft === 0 ? 'bg-[#FFF1E8] text-[#9A3A12] dark:bg-[#E65F2B]/15 dark:text-[#FFB08A]' : 'bg-brand-faint text-brand-text'}`}>
          <span>
            {tr("โควตาออกเอกสารฟรีเดือนนี้:")}{' '}<b className="font-semibold tabular-nums">{Math.min(quota.used, quota.limit)}/{quota.limit}</b> {tr("ฉบับ")}<span className="text-brand-muted">{quotaLeft === 0 ? tr(" · ครบแล้ว") : tr(" · เหลือ {0} ฉบับ", quotaLeft)}</span>
          </span>
          {quotaLeft === 0 && (
            <button type="button" onClick={() => allowNewDocuments()} className="font-semibold text-[#C24A16] dark:text-[#FF9A6B] cursor-pointer">{tr("อัปเกรดเป็น Pro")}</button>
          )}
        </div>
      )}

      {focusLinkedDocument && activeSubTab === 'list' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FFF5EC] px-4 py-3 text-xs text-[#7A5C43] no-print">
          <span>{tr("เอกสารที่ขอจาก LINE · ดาวน์โหลด PDF หรือแชร์ให้ลูกค้าได้ด้านล่าง")}</span>
          <button type="button" onClick={showAllDocuments} className="font-semibold text-[#C24A16]">{tr("ดูรายการเอกสารทั้งหมด")}</button>
        </div>
      )}


      {activeSubTab === 'list' && !focusLinkedDocument && (
        <div className="ios-seg no-scrollbar flex w-fit max-w-full overflow-x-auto no-print" role="tablist" aria-label={tr("ประเภทเอกสาร")}>
          {workspaceTabs.map(tab => {
            const count = invoices.filter(inv => getWorkspaceTab(inv.documentType) === tab.key).length;
            const isActive = docTypeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-pressed={isActive}
                onClick={() => handleWorkspaceTabChange(tab.key)}
                className="ios-seg-item h-9 shrink-0 px-4 text-[13px]"
              >
                {tr(tab.label)}
                {count > 0 && <span className="text-xs text-brand-muted">{count}</span>}
                <span className="sr-only"> {tr("{0} รายการ", count)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* SUB-TAB 1: DOCUMENTS LIST & LIVE PREVIEW GRID */}
      {activeSubTab === 'list' && (
        <div className={`app-subtab-enter grid grid-cols-1 gap-4 ${focusLinkedDocument ? '' : 'lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]'}`}>
          <section className={`${focusLinkedDocument ? 'hidden' : 'flex'} min-h-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-white no-print lg:h-[calc(100vh-232px)] lg:min-h-[560px]`} aria-label={tr("รายการเอกสาร")}>
            <div className="border-b border-brand-border px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-brand-text">{activeTabLabel}</h2>
                <p className="text-xs text-brand-muted">{tr("{0} รายการ", tabInvoices.length)}</p>
              </div>
              {tabInvoices.length > 0 && (
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                  <input type="search" value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder={tr("ค้นหาเลขที่ หรือชื่อลูกค้า")} aria-label={tr("ค้นหาเอกสาร")}
                    className="ios-search h-10 w-full rounded-xl border pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B] focus:bg-brand-white" />
                </div>
              )}
            </div>

            {tabInvoices.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
                <FileText className="mb-3 h-9 w-9 text-brand-border" />
                <p className="text-[13px] font-medium text-brand-text">{tr("ยังไม่มี{0}", activeTabLabel)}</p>
                <button type="button" onClick={() => handleOpenCreateForm(docTypeFilter)} className="mt-4 inline-flex h-9 items-center gap-1 rounded-xl border border-brand-border px-3.5 text-[13px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">
                  <Plus className="h-4 w-4" /> {tr("ออก{0}", activeTabLabel)}</button>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-brand-muted">{tr("ไม่พบเอกสารที่ตรงกับ “{0}”", listQuery)}</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id;
                  const totals = calculateTotals(inv.items, inv.vatRate, inv.whtRate);
                  return (
                    <li key={inv.id} className={`flex items-center gap-1 border-b border-brand-border pr-2 transition-colors last:border-b-0 ${isSelected ? 'bg-[#FFF1E8] dark:bg-[#E65F2B]/12' : 'hover:bg-brand-faint/60'}`}>
                      <button type="button" onClick={() => setSelectedInvoice(inv)} aria-current={isSelected ? 'true' : undefined} className="min-w-0 flex-1 px-4 py-3.5 text-left cursor-pointer">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 truncate text-[13px] font-semibold text-brand-text">{inv.documentNo}{linkedIds.has(inv.id) && <Link2 className="h-3.5 w-3.5 shrink-0 text-[#C24A16]" aria-label={tr("ลิงก์กับเอกสารอื่น")} />}</span>
                          <span className="shrink-0 font-mono text-[13px] text-brand-text">{formatCurrency(totals.grandTotal)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-brand-muted">{inv.client.name || tr("ไม่ระบุลูกค้า")} · {new Date(inv.createdDate).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                      </button>
                      <RowMenu label={tr("ตัวเลือกของ {0}", inv.documentNo)} items={[
                        { label: tr("แก้ไข"), run: () => handleStartEditInvoice(inv) },
                        { label: tr("ทำสำเนา"), run: () => handleDuplicateInvoice(inv) },
                        ...issueMenuItems(inv),
                        { label: tr("ลบเอกสาร"), danger: true, run: () => handleDeleteInvoice(inv.id) },
                      ]} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="min-w-0" aria-label={tr("ตัวอย่างเอกสาร")}>
            {selectedInvoice && shownInvoice ? (
              <div className="flex min-w-0 flex-col gap-4 lg:h-[calc(100vh-232px)] lg:min-h-[560px]">
                {/* The document is the hero: a title, a few actions, then the paper itself */}
                <div className="flex flex-wrap items-start justify-between gap-3 no-print" aria-label={tr("คำสั่งเอกสาร")}>
                  <div className="min-w-0">
                    <h2 className="truncate text-[22px] font-semibold leading-tight text-brand-text sm:text-[26px]">{selectedInvoice.documentNo}</h2>
                    <p className="mt-1 truncate text-[13px] text-brand-muted">
                      {selectedInvoice.client.name || tr("ไม่ระบุลูกค้า")} · {tr(getDocumentMeta(selectedInvoice.documentType).th)} · {formatCurrency(calculateTotals(selectedInvoice.items, selectedInvoice.vatRate, selectedInvoice.whtRate).grandTotal)}
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button type="button" onClick={() => handleStartEditInvoice(selectedInvoice)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
                      <PenLine className="h-4 w-4" /> {tr("แก้ไข")}</button>
                    {issueTypes(selectedInvoice).length > 0 && (
                      <div className="hidden sm:block">
                        <NewDocumentButton secondary types={issueTypes(selectedInvoice)} onPick={type => handleIssueFrom(selectedInvoice, type)}
                          label={tr("ออกต่อเป็น…")} menuTitle={tr("ออกต่อจาก {0}", selectedInvoice.documentNo)} itemLabel={type => tr(getDocumentMeta(type).th)} />
                      </div>
                    )}
                    <button type="button" onClick={handleDownloadPdf} disabled={pdfBusy} aria-label={tr("ดาวน์โหลด PDF")} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-60 cursor-pointer">
                      <Download className="h-4 w-4" /> <span className="hidden sm:inline">{pdfBusy ? tr("กำลังสร้าง PDF…") : tr("ดาวน์โหลด PDF")}</span><span className="sm:hidden">PDF</span>
                    </button>
                    <div className="min-w-0 flex-1 sm:flex-none">
                      <ShareButton invoice={withCurrentBranding(selectedInvoice)} pdf={pdf} onDownload={handleDownloadPdf} onPrint={handlePrintDocument} notify={triggerAlert} />
                    </div>
                    <RowMenu label={tr("ตัวเลือกเพิ่มเติมของ {0}", selectedInvoice.documentNo)} items={[
                      { label: tr("ทำสำเนา"), run: () => handleDuplicateInvoice(selectedInvoice) },
                      ...issueMenuItems(selectedInvoice),
                      { label: tr("ลบเอกสาร"), danger: true, run: () => handleDeleteInvoice(selectedInvoice.id) },
                    ]} />
                  </div>
                </div>
                {selectedChain.length > 0 && (
                  <nav aria-label={tr("เอกสารที่ลิงก์กัน")} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-faint px-3 py-2 text-[12px] no-print">
                    <span className="inline-flex items-center gap-1 pr-1 text-brand-muted"><Link2 className="h-3.5 w-3.5" /> {tr("เอกสารที่ลิงก์กัน")}</span>
                    {selectedChain.map((doc, index) => (
                      <React.Fragment key={doc.id}>
                        {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />}
                        <button type="button" onClick={() => openDocument(doc)} aria-current={doc.id === selectedInvoice.id ? 'page' : undefined}
                          className={`rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer ${doc.id === selectedInvoice.id ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-text hover:bg-brand-white dark:hover:bg-white/5'}`}>
                          {tr(getDocumentMeta(doc.documentType).th)} {doc.documentNo}
                        </button>
                      </React.Fragment>
                    ))}
                  </nav>
                )}
                <DocumentFullView invoice={withCurrentBranding(selectedInvoice)} watermark={freePlan} className="h-[72vh] min-h-[440px] lg:h-auto lg:flex-1" />
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center p-12 text-center lg:h-[calc(100vh-232px)]">
                <FileText className="mb-4 h-12 w-12 text-brand-border" />
                <p className="text-[13px] font-medium text-brand-text">{tabInvoices.length ? tr("เลือกเอกสารด้านซ้ายเพื่อดูตัวอย่าง") : tr("ยังไม่มี{0}", activeTabLabel)}</p>
                <p className="mt-1 text-xs text-brand-muted">{tabInvoices.length ? tr("เห็นทั้งหน้า A4 แล้วแชร์ให้ลูกค้าได้ทันที") : tr("กด “ออกเอกสารใหม่” เพื่อเริ่ม")}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: DOCUMENT EDITOR (CREATE / EDIT) */}
      {activeSubTab === 'create' && canAccessDraft && (
        <div className="app-subtab-enter space-y-4 no-print">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => setActiveSubTab('list')} className="mb-2 inline-flex items-center gap-1 text-[13px] text-brand-muted hover:text-brand-text cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> {tr("ย้อนกลับรายการ")}</button>
            <h2 className="text-xl font-semibold text-brand-text">{editingInvoiceId ? tr("แก้ไข{0}", tr(getDocumentMeta(docType).th)) : tr("สร้าง{0}", tr(getDocumentMeta(docType).th))}</h2>
            <p className="mt-0.5 text-[13px] text-brand-muted">{tr("กรอกข้อมูลเอกสาร และดูตัวอย่างแบบเรียลไทม์")}</p>
          </div>
        </div>
        {linkSource && !editingInvoiceId && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-[#FFF5EC] px-4 py-3 text-[13px] text-brand-text dark:bg-[#E65F2B]/12" role="status">
            <span className="inline-flex items-center gap-1.5"><Link2 className="h-4 w-4 text-[#C24A16]" />{tr("ออกต่อจาก{0}", tr(getDocumentMeta(linkSource.documentType).th))}{' '}<b className="font-semibold">{linkSource.documentNo}</b> {tr("· ดึงลูกค้า รายการ และภาษีมาให้แล้ว")}</span>
            <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
              <input type="checkbox" checked={Boolean(linkedFromId)} onChange={(e) => setKeepLinked(e.target.checked)} className="h-4 w-4 accent-[#E65F2B]" />
              {tr("ลิงก์กับใบเดิม (อ้างอิงเลขที่ {0})", linkSource.documentNo)}</label>
          </div>
        )}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
        <form onSubmit={handleSaveInvoice} className={`${uiSurface} relative pb-0`}>

          {/* Quick pre-fill from a job */}
          {jobs.length > 0 && !editingInvoiceId && (
            <section className={formSection}>
              <label className={formLabel} htmlFor="doc-from-job">
                <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-brand-muted" /> {tr("ดึงข้อมูลจากงาน")}</span>
              </label>
              <select id="doc-from-job" value={selectedJobId} onChange={(e) => handleSelectJob(e.target.value)} className={`${formInput} cursor-pointer`}>
                <option value="" disabled>{tr("เลือกงาน แล้วระบบกรอกลูกค้า รายการ ยอด และภาษีให้")}</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{tr("{0} (ลูกค้า: {1} | ยอด: {2})", job.name, job.client, formatCurrency(job.value))}</option>
                ))}
              </select>
              {selectedJobId && <p className={formHint}>{tr("ดึงข้อมูลจาก")}{' '}<span className="font-medium text-brand-text">{jobs.find(j => j.id === selectedJobId)?.name}</span></p>}
            </section>
          )}

          {/* 1. Document */}
          <section className={formSection}>
            <h3 className={formHeading}>{tr("ข้อมูลเอกสาร")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel} htmlFor="doc-type">{tr("ประเภทเอกสาร")}</label>
                <select
                  id="doc-type"
                  value={docType}
                  onChange={(e) => {
                    const val = e.target.value as DocumentType;
                    if (!isDocumentTypeAvailable(val, fullFeatureAccess)) return;
                    setDocType(val);
                    // Update prefix if current document number matches the default structure
                    const thaiYear = new Date().getFullYear() + 543;
                    const serial = String(invoices.length + 1).padStart(3, '0');
                    setDocNo(`${getDocumentMeta(val).prefix}-${thaiYear}-${serial}`);
                    // Tax invoices carry VAT by definition
                    if (getDocumentMeta(val).isTax && vatRate === 0) setVatRate(7);
                  }}
                  className={`${formInput} cursor-pointer`}
                >
                  {(docType === 'receiptTaxInvoice' ? [...creatableTypes, docType] : creatableTypes).map(type => (
                    <option key={type} value={type}>{currentLanguage === 'en' ? tr(getDocumentMeta(type).th) : `${tr(getDocumentMeta(type).th)} (${getDocumentMeta(type).en})`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-no">{tr("เลขที่เอกสาร")}</label>
                <input id="doc-no" type="text" value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder={tr("เช่น INV-2026-001")} className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-created">{tr("วันที่ออกเอกสาร")}</label>
                <input id="doc-created" type="date" value={createdDate} onChange={(e) => setCreatedDate(e.target.value)} className={`${formInput} cursor-pointer`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-due">
                  {docType === 'quotation' ? tr("ยืนราคาถึงวันที่") : getDocumentMeta(docType).isReceipt ? tr("วันที่รับเงิน (ถ้าต่างจากวันชำระ)") : tr("วันที่กำหนดชำระเงิน")}
                </label>
                <input id="doc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${formInput} cursor-pointer`} />
              </div>
              {docType === 'quotation' && (
                <div>
                  <label className={formLabel} htmlFor="doc-response">{tr("วันที่ตอบรับ")}</label>
                  <input id="doc-response" type="date" value={responseDate} onChange={(e) => setResponseDate(e.target.value)} className={`${formInput} cursor-pointer`} />
                </div>
              )}
            </div>

            {/* Optional terms: tucked away until needed (opens by itself when something is filled in) */}
            {/* Optional terms stay tucked away until needed; once something is filled in they stay visible */}
            {!hasDocTerms && (
              <button type="button" onClick={() => setDocTermsOpen(v => !v)} aria-expanded={docTermsVisible}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#C24A16] cursor-pointer dark:text-[#FF9A6B]">
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${docTermsVisible ? 'rotate-180' : ''}`} />
                {tr("เงื่อนไขและเลขอ้างอิง (ไม่บังคับ)")}</button>
            )}
            {docTermsVisible && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={formLabel} htmlFor="doc-payment-term">{tr("เงื่อนไขการชำระเงิน")}</label>
                  <input id="doc-payment-term" type="text" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} placeholder={tr("เช่น เงินสด, เครดิต 30 วัน, โอนเงิน 100%")} className={formInput} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-delivery-term">{tr("ระยะเวลาการส่งมอบสินค้า / บริการ")}</label>
                  <input id="doc-delivery-term" type="text" value={deliveryTerm} onChange={(e) => setDeliveryTerm(e.target.value)} placeholder={tr("เช่น ภายใน 7 วันทำการ, ทันทีหลังรับมัดจำ")} className={formInput} />
                </div>
                <div className="sm:col-span-2">
                  <label className={formLabel} htmlFor="doc-ref">{tr("อ้างอิงเลขที่เอกสาร / ใบสั่งซื้อ (PO/QT Ref)")}</label>
                  <input id="doc-ref" type="text" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder={tr("เช่น QT-2569-003, PO-9988")} className={`${formInput} font-mono`} />
                </div>
              </div>
            )}
          </section>

          {/* Receipt-only: how and when the money was received */}
          {getDocumentMeta(docType).isReceipt && (
            <section className={formSection}>
              <h3 className={formHeading}>{tr("การรับชำระเงิน")}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={formLabel} htmlFor="doc-paid-date">{tr("วันที่รับชำระเงิน")}</label>
                  <input id="doc-paid-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={`${formInput} cursor-pointer`} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-paid-method">{tr("วิธีชำระเงิน")}</label>
                  <input id="doc-paid-method" type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder={tr("เช่น โอนเงิน, เงินสด, พร้อมเพย์")} className={formInput} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-paid-amount">{tr("จำนวนเงินที่ได้รับ")}</label>
                  <NumberInput id="doc-paid-amount" value={paidAmount} onChange={(raw) => setPaidAmount(raw === '' ? '' : Math.max(0, parseFloat(raw) || 0))} placeholder={tr("เว้นว่าง = ยอดสุทธิ")} className={`${formInput} font-mono`} />
                </div>
              </div>
            </section>
          )}

          {/* 2. Customer */}
          <section className={formSection}>
            <h3 className={formHeading}>{tr("ลูกค้า / ผู้จ่ายเงิน")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="client-name">{tr("ชื่อลูกค้า หรือ ชื่อบริษัท")}</label>
                <input id="client-name" type="text" list="saved-client-names" autoComplete="off" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={tr("เช่น บริษัท อะคอร์น มีเดีย จำกัด (สำนักงานใหญ่)")} className={formInput} />
                <datalist id="saved-client-names">{clients.map(client => <option key={client.name} value={client.name} />)}</datalist>
                {matchedClient && clientHasMoreDetails(matchedClient, currentClient) && (
                  <button type="button" onClick={() => applySavedClient(matchedClient)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#C24A16] cursor-pointer dark:text-[#FF9A6B]">
                    <User className="h-4 w-4" /> {tr("ใช้ข้อมูลลูกค้าเดิม (ที่อยู่ เลขภาษี เบอร์ อีเมล)")}</button>
                )}
                {clients.length > 0 && !clientName && <p className={formHint}>{tr("พิมพ์ชื่อเพื่อเลือกลูกค้าที่เคยออกเอกสารให้")}</p>}
              </div>
              <div>
                <label className={formLabel} htmlFor="client-tax">{tr("เลขประจำตัวผู้เสียภาษี")}</label>
                <input id="client-tax" type="text" value={clientTaxId} onChange={(e) => setClientTaxId(e.target.value)} placeholder={tr("13 หลัก")} className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-branch">{tr("สาขา")}</label>
                <input id="client-branch" type="text" value={clientBranch} onChange={(e) => setClientBranch(e.target.value)} placeholder={tr("เช่น สำนักงานใหญ่ หรือ 00001")} className={formInput} />
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="client-address">{tr("ที่อยู่ผู้เสียภาษี")}</label>
                <textarea id="client-address" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder={tr("เช่น 12/3 อาคารไอคอนิค ชั้น 5 แขวงคลองต้น เขตวัฒนา กรุงเทพฯ 10110")} rows={2} className={`${formInput} h-auto py-2.5`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-contact">{tr("ชื่อผู้ติดต่อ (เรียน)")}</label>
                <input id="client-contact" type="text" value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} placeholder={tr("เช่น คุณเอก ใจดี")} className={formInput} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-code">{tr("รหัสลูกค้า (ถ้ามี)")}</label>
                <input id="client-code" type="text" value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder={tr("เช่น C-0012")} className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-phone">{tr("เบอร์โทรศัพท์")}</label>
                <input id="client-phone" type="text" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder={tr("เช่น 02-555-5555")} className={formInput} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-email">{tr("อีเมล")}</label>
                <input id="client-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder={tr("เช่น finance@client.co.th")} className={formInput} />
              </div>
            </div>
          </section>

          {/* 3. Items: description on its own line, numbers underneath, so nothing gets squeezed */}
          <section className={formSection}>
            <h3 className={formHeading}>{tr("รายการ")}</h3>
            <ol className="divide-y divide-brand-border">
              {invoiceItems.map((item, idx) => (
                <li key={item.id} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-2.5 w-5 shrink-0 text-center font-mono text-[13px] text-brand-muted">{idx + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input type="text" value={item.description} onChange={(e) => handleItemFieldChange(item.id, 'description', e.target.value)}
                        placeholder={tr("ชื่อรายการ เช่น ออกแบบเว็บไซต์, ค่าจัดทำวิดีโอ")} aria-label={tr("ชื่อรายการที่ {0}", idx + 1)} className={`${formInput} font-medium`} />
                      <input type="text" value={item.detail || ''} onChange={(e) => handleItemFieldChange(item.id, 'detail', e.target.value)}
                        placeholder={tr("รายละเอียดเพิ่มเติม (ไม่บังคับ)")} aria-label={tr("รายละเอียดรายการที่ {0}", idx + 1)} className={`${formInput} h-10 text-[13px] text-brand-muted`} />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="block">
                          <span className={formMiniLabel}>{tr("จำนวน")}</span>
                          <input type="number" value={item.quantity} onChange={(e) => handleItemFieldChange(item.id, 'quantity', e.target.value)} placeholder={tr("จำนวน")} className={`${formInput} text-center font-mono`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>{tr("หน่วย")}</span>
                          <input type="text" value={item.unit || ''} onChange={(e) => handleItemFieldChange(item.id, 'unit', e.target.value)} placeholder={tr("หน่วย")} className={`${formInput} text-center`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>{tr("ราคาต่อหน่วย")}</span>
                          <NumberInput value={item.price} onChange={(raw) => handleItemFieldChange(item.id, 'price', raw)} placeholder="0" className={`${formInput} text-right font-mono`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>{tr("ส่วนลด (บาท)")}</span>
                          <NumberInput value={item.discount || 0} onChange={(raw) => handleItemFieldChange(item.id, 'discount', raw)} placeholder="0" className={`${formInput} text-right font-mono`} />
                        </label>
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <button type="button" onClick={() => handleRemoveItemRow(item.id)} title={tr("ลบแถวนี้")} aria-label={tr("ลบรายการที่ {0}", idx + 1)}
                          className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-brand-muted transition-colors hover:bg-[#FDEEEE] hover:text-[#C43A3A] cursor-pointer dark:hover:bg-[#F19A9A]/10 dark:hover:text-[#F19A9A]">
                          <Trash2 className="h-3.5 w-3.5" /> {tr("ลบรายการ")}</button>
                        <p className="text-[13px] text-brand-muted">{tr("รวม")}{' '}<span className="ml-1 font-mono text-[15px] font-semibold text-brand-text">{formatCurrency(item.quantity * item.price - (item.discount || 0))}</span></p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={handleAddItemRow}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-border text-[13px] font-medium text-[#C24A16] transition-colors hover:border-[#F3B08C] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">
              <Plus className="h-4 w-4" /> {tr("เพิ่มแถวรายการ")}</button>
          </section>

          {/* 4. Tax + note */}
          <section className={formSection}>
            <h3 className={formHeading}>{tr("ภาษีและหมายเหตุ")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel} htmlFor="doc-vat">{tr("ภาษีมูลค่าเพิ่ม (VAT)")}</label>
                <select id="doc-vat" value={vatRate} onChange={(e) => setVatRate(parseInt(e.target.value) || 0)} className={`${formInput} cursor-pointer`}>
                  <option value={0}>{tr("ไม่มีภาษีมูลค่าเพิ่ม (0%)")}</option>
                  <option value={7}>{tr("ภาษีมูลค่าเพิ่ม 7%")}</option>
                </select>
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-wht">{tr("หัก ณ ที่จ่าย")}</label>
                <select id="doc-wht" value={whtRate} onChange={(e) => setWhtRate(parseFloat(e.target.value) || 0)} className={`${formInput} cursor-pointer`}>
                  <option value={0}>{tr("ไม่มีการหัก ณ ที่จ่าย")}</option>
                  <option value={1}>{tr("ค่าขนส่ง 1%")}</option>
                  <option value={3}>{tr("ฟรีแลนซ์ / บริการ 3%")}</option>
                  <option value={5}>{tr("ค่าเช่า / โฆษณา 5%")}</option>
                  {/* A job with a custom rate (e.g. 1.5%) carries it into the document. */}
                  {![0, 1, 3, 5].includes(whtRate) && <option value={whtRate}>{tr("อัตรากำหนดเอง {0}%", whtRate)}</option>}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="doc-note">{tr("หมายเหตุ และเงื่อนไขท้ายเอกสาร")}</label>
                <textarea id="doc-note" value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder={tr("เช่น กรุณาโอนภายใน 30 วัน, หากชำระล่าช้าจะคิดดอกเบี้ยตามกฎหมาย")} rows={3} className={`${formInput} h-auto py-2.5`} />
              </div>
            </div>
          </section>

          {/* 5. Totals */}
          <section className={`${formSection} pb-6`} aria-label={tr("สรุปยอด")}>
            <h3 className={formHeading}>{tr("สรุปยอด")}</h3>
            <dl className="space-y-2 text-[14px]">
              <div className="flex justify-between gap-4"><dt className="text-brand-muted">{tr("ยอดรวมก่อนภาษี")}</dt><dd className="font-mono text-brand-text">{formatCurrency(subtotal)}</dd></div>
              {vatRate > 0 && <div className="flex justify-between gap-4"><dt className="text-brand-muted">{tr("ภาษีมูลค่าเพิ่ม {0}%", vatRate)}</dt><dd className="font-mono text-brand-text">+{formatCurrency(vatAmount)}</dd></div>}
              {whtRate > 0 && <div className="flex justify-between gap-4"><dt className="text-brand-muted">{tr("หัก ณ ที่จ่าย {0}%", whtRate)}</dt><dd className="font-mono text-[#C43A3A] dark:text-[#F19A9A]">-{formatCurrency(whtAmount)}</dd></div>}
              <div className="flex items-baseline justify-between gap-4 border-t border-brand-border pt-3">
                <dt className="text-[15px] font-semibold text-brand-text">{tr("ยอดรับสุทธิ")}</dt>
                <dd className="font-mono text-[26px] font-semibold leading-none text-brand-text">{formatCurrency(grandTotal)}</dd>
              </div>
            </dl>
          </section>

          {/* Actions stay in reach while scrolling a long form */}
          <div className="sticky bottom-3 z-10 mx-3 mb-3 flex flex-nowrap items-center gap-1 rounded-xl border border-brand-border bg-brand-white/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(20,18,16,0.12)] backdrop-blur sm:mx-4 sm:mb-4 dark:bg-[#232428]/95 dark:shadow-[0_8px_28px_rgba(0,0,0,0.4)]">
            <button type="button" onClick={() => setActiveSubTab('list')} className="hidden h-11 rounded-xl px-4 text-[13px] font-medium sm:inline-flex sm:items-center text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">{tr("ยกเลิก")}</button>
            <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer xl:hidden"><Eye className="h-4 w-4" />{tr("ดูตัวอย่าง")}</button>
            <button type="button" onClick={handleClearForm} title={tr("ล้างข้อมูลทั้งหมด")} aria-label={tr("ล้างข้อมูล")} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer sm:px-4"><RotateCcw className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">{tr("ล้างข้อมูล")}</span></button>
            <button type="submit" className="ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#E65F2B] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">{tr("บันทึก")}</span>
              <span className="hidden sm:inline">{editingInvoiceId ? tr("บันทึกการแก้ไข") : tr("บันทึกและสร้างเอกสาร")}</span>
            </button>
          </div>
        </form>

        {/* Live preview: beside the form on wide screens, a full-screen sheet on phones */}
        <aside className="hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)]" aria-label={tr("ตัวอย่างเอกสาร")}>
          <PreviewCanvas invoice={withCurrentBranding(buildDraftInvoice())} watermark={freePlan} className="h-full" />
        </aside>
        </div>
        {/* Portalled: the page wrapper animates with a transform, which would trap a fixed overlay inside it. */}
        {mobilePreviewOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-brand-white xl:hidden" role="dialog" aria-modal="true" aria-label={tr("ตัวอย่างเอกสาร")}>
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
              <p className="text-[15px] font-semibold text-brand-text">{tr("ตัวอย่าง{0}", tr(getDocumentMeta(docType).th))}</p>
              <button type="button" onClick={() => setMobilePreviewOpen(false)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#C24A16] hover:bg-brand-faint cursor-pointer">{tr("กลับไปแก้ไข")}</button>
            </div>
            <PreviewCanvas invoice={withCurrentBranding(buildDraftInvoice())} watermark={freePlan} className="m-3 flex-1 rounded-xl" />
          </div>,
          document.body,
        )}
        </div>
      )}

    </div>
  );
};

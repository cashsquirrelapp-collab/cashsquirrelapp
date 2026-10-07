import PageHeader from '../../components/ui/PageHeader';
import { uiPrimaryButton, uiSurface } from '../../components/ui/uiStyles';
import { privateCache } from '../../services/privateCache';
import { imageFileToDataUrl } from '../../services/images';
import { readInvoices, saveCloud } from '../../services/cloud';
import { validateChanges } from '../../../../shared/validation';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Job, Invoice, InvoiceItem, InvoiceProfile, DocumentType } from '../../../../shared/types';
import { DocumentPreview, DOCUMENT_TYPES, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT, calculateDocumentTotals, getDocumentMeta, printDocument } from './DocumentA4';
import { formatCurrency } from '../../utils';
import { NewDocumentButton, PreviewCanvas, RowMenu, ShareButton } from './DocumentWorkspaceParts';
import { DocumentReveal } from './DocumentReveal';
import { downloadBlob, usePdfFile } from './documentPdf';
import { Eye, Search } from 'lucide-react';
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

// Editor form styles: one surface, sections split by a hairline, same-size fields everywhere.
const formSection = 'space-y-4 border-b border-brand-border px-5 py-6 last-of-type:border-b-0 sm:px-6';
const formHeading = 'text-[15px] font-semibold text-brand-text';
const formLabel = 'mb-1.5 block text-[13px] font-medium text-brand-text';
const formMiniLabel = 'mb-1 block text-xs text-brand-muted';
const formHint = 'text-xs text-brand-muted';
const formInput = 'h-11 w-full min-w-0 rounded-[10px] border border-brand-border bg-brand-white px-3.5 text-[14px] text-brand-text outline-none transition-colors placeholder:text-brand-muted/70 focus:border-[#E65F2B] dark:bg-[#141518]';

type DocumentWorkspaceTab = Exclude<DocumentType, 'receiptTaxInvoice'>;

const DOCUMENT_WORKSPACE_TABS: Array<{ key: DocumentWorkspaceTab; label: string }> = [
  { key: 'quotation', label: 'ใบเสนอราคา' },
  { key: 'invoice', label: 'ใบแจ้งหนี้' },
  { key: 'receipt', label: 'ใบเสร็จ' },
  { key: 'taxInvoice', label: 'ใบกำกับภาษี' }
];

const getWorkspaceTab = (type: DocumentType): DocumentWorkspaceTab =>
  type === 'receiptTaxInvoice' ? 'taxInvoice' : type;

// The open tab lives in ?type= so a refresh (or a shared link) lands on the same tab.
const TAB_PARAM = 'type';
const isWorkspaceTab = (v: string | null): v is DocumentWorkspaceTab => DOCUMENT_WORKSPACE_TABS.some(t => t.key === v);
const readTabFromUrl = (): DocumentWorkspaceTab | null => {
  try { const v = new URLSearchParams(window.location.search).get(TAB_PARAM); return isWorkspaceTab(v) ? v : null; } catch { return null; }
};
const writeTabToUrl = (tab: DocumentWorkspaceTab) => {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(TAB_PARAM) === tab) return;
    url.searchParams.set(TAB_PARAM, tab);
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
                  onError('ไฟล์มีขนาดใหญ่เกินไป', 'กรุณาอัปโหลดภาพที่มีขนาดไม่เกิน 2MB เพื่อประสิทธิภาพที่รวดเร็ว');
                  return;
                }
                imageFileToDataUrl(file).then(onChange).catch(error => onError('อัปโหลดภาพไม่สำเร็จ', error.message));
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
            <span className="w-24 shrink-0">ขนาดบนเอกสาร</span>
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
          * รองรับ PNG, JPEG และ WebP ไม่เกิน 2MB ระบบย่อภาพก่อนบันทึก
        </p>
      </div>
    </div>
  </div>
);


interface InvoiceTabProps {
  jobs: Job[];
  ownerId?: string;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

export const InvoiceTab: React.FC<InvoiceTabProps> = ({
  jobs,
  ownerId,
  triggerAlert,
  triggerConfirm
}) => {
  const [storageReady, setStorageReady] = useState(!ownerId);
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
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentWorkspaceTab>(tabFromUrl.current ?? 'quotation');
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
  const hasDocTerms = Boolean(paymentTerm || deliveryTerm || refNo);
  const docTermsVisible = docTermsOpen || hasDocTerms;
  
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { id: '1', description: 'บริการให้คำปรึกษา / บริการงานผลิตสร้างสรรค์', quantity: 1, price: 5000 }
  ]);
  const [vatRate, setVatRate] = useState<number>(0); // 0 or 7
  const [whtRate, setWhtRate] = useState<number>(0); // 0, 1, 3, 5
  const [docNote, setDocNote] = useState('ขอบคุณที่ใช้บริการ / กรุณาชำระเงินภายในกำหนดเวลา');

  // Copy-state feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  // Load from local storage on mount
  useEffect(() => {
    let cancelled = false;
    if (ownerId) {
      readInvoices(ownerId).then(data => {
        if (cancelled) return;
        setInvoices(data.invoices || []);
        privateCache.setItem(invoiceKey,JSON.stringify(data.invoices || []));
        if (data.issuer_profile) {setIssuerProfile(data.issuer_profile);privateCache.setItem(issuerKey,JSON.stringify(data.issuer_profile));}
        setStorageReady(true);
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
          name: 'นายสมชาย ดีมีสุข (อาชีพอิสระ)',
          address: '123/45 ถนนสีลม แขวงสุริยวงศ์ เขตบางรัก กรุงเทพมหานคร 10500',
          phone: '081-234-5678',
          email: 'somchai.freelance@gmail.com',
          taxId: '1234567890123',
          bankName: 'ธนาคารกสิกรไทย',
          bankAccount: '012-3-45678-9',
          bankAccountName: 'นายสมชาย ดีมีสุข'
        },
        client: {
          name: 'บริษัท ครีเอทีฟ มาร์เก็ตติ้ง จำกัด (สำนักงานใหญ่)',
          address: '999/88 อาคารเพลินจิตเซ็นเตอร์ ชั้น 12 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
          phone: '02-111-2222',
          email: 'finance@creativemarketing.co.th',
          taxId: '0105560123456'
        },
        items: [
          { id: 'i1', description: 'ออกแบบกราฟิกแบนเนอร์โฆษณาแคมเปญครบรอบ 5 ปี', quantity: 5, price: 2500 },
          { id: 'i2', description: 'ตัดต่อวิดีโอสั้นลงโซเชียลมีเดีย จำนวน 3 ตอน', quantity: 3, price: 4000 }
        ],
        vatRate: 0,
        whtRate: 3,
        note: 'กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ'
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
  }, [ownerId]);

  // Save invoices to local storage
  const saveInvoicesToStorage = (updatedList: Invoice[]) => {
    setInvoices(updatedList);
    privateCache.setItem(invoiceKey, JSON.stringify(updatedList));
    if (ownerId && storageReady) {
      setSaving(true);
      saveCloud(ownerId, { invoices: updatedList }).then(() => setStorageError(null)).catch(error => {
        setStorageError(error.message); triggerAlert('บันทึกเอกสารไม่สำเร็จ', error.message);
      }).finally(() => setSaving(false));
    }
  };

  // Pre-fill fields from Job selection
  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    setClientName(job.client || '');
    setInvoiceItems([
      {
        id: 'job-item',
        description: `ค่าบริการงาน: ${job.name} (${job.type})`,
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
      triggerAlert('ไม่สามารถลบได้', 'อย่างน้อยต้องมีรายการสินค้าหรือบริการอย่างน้อย 1 รายการ');
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
    paidDate: paidDate || undefined,
    paymentMethod: paymentMethod || undefined,
    paidAmount: paidAmount === '' ? undefined : paidAmount
  });

  // Create or Update Invoice
  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();

    if (!docNo.trim()) {
      triggerAlert('ป้อนข้อมูลไม่ครบ', 'กรุณาระบุเลขที่เอกสาร');
      return;
    }

    if (!clientName.trim()) {
      triggerAlert('ป้อนข้อมูลไม่ครบ', 'กรุณาระบุชื่อลูกค้าหรือบริษัทผู้รับบริการ');
      return;
    }

    const newInvoice: Invoice = { ...buildDraftInvoice(), id: editingInvoiceId || crypto.randomUUID() };

    let updatedList;
    if (editingInvoiceId) {
      updatedList = invoices.map(inv => inv.id === editingInvoiceId ? newInvoice : inv);
      triggerAlert('อัปเดตสำเร็จ', 'บันทึกการแก้ไขบิลเรียบร้อยแล้ว');
    } else {
      updatedList = [newInvoice, ...invoices];
      triggerAlert('ออกบิลสำเร็จ', 'สร้างเอกสารใหม่เรียบร้อยแล้ว');
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
    triggerConfirm(
      'ยืนยันการลบบิล',
      'คุณแน่ใจหรือไม่ว่าต้องการลบเอกสารใบนี้? ข้อมูลการออกบิลของใบนี้จะหายไปอย่างถาวร',
      () => {
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
  const handleOpenCreateForm = (type: DocumentType = docTypeFilter) => {
    setEditingInvoiceId(null);
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
    setDocNote('กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ');
    setPaymentTerm('โอนเงินผ่านบัญชีธนาคาร');
    setDeliveryTerm('ทันทีหลังได้รับเงินมัดจำ / ชำระเงิน');
    setRefNo('');
    if (getDocumentMeta(type).isTax) setVatRate(7); // tax invoices carry VAT by definition
    setActiveSubTab('create');
  };

  // Clear form fields to start fresh
  const handleClearForm = () => {
    triggerConfirm(
      'ยืนยันการล้างข้อมูลฟอร์ม',
      'คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลที่กรอกไว้ทั้งหมดเพื่อเริ่มต้นใหม่?',
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
        setDocNote('กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ');
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
    setActiveSubTab('create');
  };

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
    triggerAlert('คัดลอกบิลสำเร็จ', `สร้างเอกสารใบใหม่โดยคัดลอกโครงร่างจากใบ ${inv.documentNo} เรียบร้อยแล้ว`);
  };

  const handlePrintDocument = () => {
    if (!selectedInvoice) return;
    if (!printDocument(withCurrentBranding(selectedInvoice))) {
      triggerAlert(
        'ป็อปอัปถูกบล็อก',
        'เบราว์เซอร์ของคุณบล็อกป็อปอัป กรุณาอนุญาตการแสดงป็อปอัปสำหรับเว็บไซต์นี้เพื่อให้สามารถพิมพ์หรือบันทึก PDF ในหน้าต่างใหม่ได้'
      );
    }
  };

  // A real PDF file of the open document, prepared in the background for sharing and download.
  const shownInvoice = selectedInvoice && getWorkspaceTab(selectedInvoice.documentType) === docTypeFilter ? withCurrentBranding(selectedInvoice) : null;
  const pdf = usePdfFile(shownInvoice);
  const [pdfBusy, setPdfBusy] = useState(false);
  const handleDownloadPdf = async () => {
    if (!shownInvoice) return;
    setPdfBusy(true);
    try {
      const file = pdf.file ?? await pdf.ensure();
      downloadBlob(file, file.name);
    } catch {
      triggerAlert('สร้างไฟล์ PDF ไม่สำเร็จ', 'จะเปิดหน้าพิมพ์แทน เลือก “บันทึกเป็น PDF” เพื่อเก็บไฟล์');
      handlePrintDocument();
    } finally {
      setPdfBusy(false);
    }
  };

  const handleSendToCustomer = () => {
    if (!selectedInvoice) return;
    if (!selectedInvoice.client.email) {
      triggerAlert('ยังไม่มีอีเมลลูกค้า', 'กรุณากดแก้ไขและเพิ่มอีเมลลูกค้าก่อนส่งเอกสาร');
      return;
    }
    const meta = getDocumentMeta(selectedInvoice.documentType);
    const subject = `${meta.th} เลขที่ ${selectedInvoice.documentNo}`;
    const body = `เรียน ${selectedInvoice.client.name}\n\nกรุณาตรวจสอบ${meta.th} เลขที่ ${selectedInvoice.documentNo} ที่แนบมาพร้อมอีเมลนี้\n\nขอบคุณครับ`;
    window.location.href = `mailto:${encodeURIComponent(selectedInvoice.client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Pick a document once, when the list first arrives. This used to run every time nothing was
  // selected -- which is exactly the state after opening a tab with no documents -- and it then
  // jumped back to the first document's tab, so ใบแจ้งหนี้ / ใบเสร็จ / ใบกำกับภาษี looked dead
  // whenever an account only had quotations. A tab from the URL wins over the first document.
  const initialSelectionDone = React.useRef(false);
  useEffect(() => {
    if (initialSelectionDone.current || invoices.length === 0) return;
    initialSelectionDone.current = true;
    if (selectedInvoice) return;
    const wanted = tabFromUrl.current;
    const first = wanted ? invoices.find(inv => getWorkspaceTab(inv.documentType) === wanted) : invoices[0];
    if (first) setSelectedInvoice(first);
    if (!wanted && first) setDocTypeFilter(getWorkspaceTab(first.documentType));
  }, [invoices, selectedInvoice]);

  if (ownerId && !storageReady) return <div className="rounded-2xl border border-brand-border bg-brand-white p-8 text-center" role="status">{storageError || 'กำลังโหลดเอกสารของบัญชีนี้…'}</div>;
  const importLegacy = () => triggerConfirm('นำเข้าเอกสารเดิมจากเครื่อง', 'เอกสารรุ่นเดิมไม่ได้ระบุเจ้าของบัญชี กรุณายืนยันว่าเอกสารทั้งหมดนี้เป็นของคุณ ก่อนนำเข้าบัญชีปัจจุบัน', async () => {
    try {
      const list = JSON.parse(localStorage.getItem('remix_invoices') || '[]');
      const profile = JSON.parse(localStorage.getItem('remix_issuer_profile') || 'null');
      validateChanges(list.map((row: Invoice) => ({table:'cashflow_invoices',id:row.id,op:'set',version:null,data:row})));
      await saveCloud(ownerId!, {invoices:list, ...(profile ? {issuer_profile:profile} : {})});
      setInvoices(list); if (profile) setIssuerProfile(profile);
      localStorage.removeItem('remix_invoices'); localStorage.removeItem('remix_issuer_profile');
    } catch (error: any) { triggerAlert('นำเข้าเอกสารไม่สำเร็จ', error.message); }
  });

  const query = listQuery.trim().toLowerCase();
  const tabInvoices = invoices.filter(inv => getWorkspaceTab(inv.documentType) === docTypeFilter);
  const filteredInvoices = tabInvoices.filter(inv => !query
    || inv.documentNo.toLowerCase().includes(query) || (inv.client.name || '').toLowerCase().includes(query));
  const activeTabLabel = DOCUMENT_WORKSPACE_TABS.find(tab => tab.key === docTypeFilter)?.label ?? '';
  const creatableTypes = DOCUMENT_TYPES;

  const handleWorkspaceTabChange = (tab: DocumentWorkspaceTab) => {
    setDocTypeFilter(tab);
    setListQuery('');
    const firstDocument = invoices.find(inv => getWorkspaceTab(inv.documentType) === tab);
    setSelectedInvoice(firstDocument || null);
    setActiveSubTab('list');
  };

  return (
    <div ref={pageTopRef} className="page-content app-tab-enter space-y-6 pb-16">
      {(storageError || saving || (ownerId && localStorage.getItem('remix_invoices'))) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 text-xs no-print" role="status">
          {(storageError || saving) && <span className={storageError ? 'text-red-600' : 'text-brand-muted'}>{storageError || 'กำลังบันทึกเอกสาร…'}</span>}
          {ownerId && localStorage.getItem('remix_invoices') && <button type="button" onClick={importLegacy} className="font-bold text-[#E65F2B]">นำเข้าเอกสารเดิมจากเครื่อง</button>}
        </div>
      )}
      
      <PageHeader page="invoice" className="no-print">
        <NewDocumentButton types={creatableTypes} onPick={handleOpenCreateForm} />
      </PageHeader>


      {activeSubTab === 'list' && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-print sm:mx-0 sm:px-0" role="tablist" aria-label="ประเภทเอกสาร">
          {DOCUMENT_WORKSPACE_TABS.map(tab => {
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
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]'
                    : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'
                }`}
              >
                {tab.label}
                {count > 0 && <span className={`text-xs ${isActive ? 'text-[#C24A16]/70 dark:text-[#FF9A6B]/70' : 'text-brand-muted/80'}`}>{count}</span>}
                <span className="sr-only"> {count} รายการ</span>
              </button>
            );
          })}
        </div>
      )}

      {/* SUB-TAB 1: DOCUMENTS LIST & LIVE PREVIEW GRID */}
      {activeSubTab === 'list' && (
        <div className="app-subtab-enter grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-brand-white no-print lg:h-[calc(100vh-232px)] lg:min-h-[560px]" aria-label="รายการเอกสาร">
            <div className="border-b border-brand-border px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold text-brand-text">{activeTabLabel}</h2>
                <p className="text-xs text-brand-muted">{tabInvoices.length} รายการ</p>
              </div>
              {tabInvoices.length > 0 && (
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
                  <input type="search" value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="ค้นหาเลขที่ หรือชื่อลูกค้า" aria-label="ค้นหาเอกสาร"
                    className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B]" />
                </div>
              )}
            </div>

            {tabInvoices.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
                <FileText className="mb-3 h-9 w-9 text-brand-border" />
                <p className="text-[13px] font-medium text-brand-text">ยังไม่มี{activeTabLabel}</p>
                <button type="button" onClick={() => handleOpenCreateForm(docTypeFilter)} className="mt-4 inline-flex h-9 items-center gap-1 rounded-xl border border-brand-border px-3.5 text-[13px] font-medium text-brand-text hover:bg-brand-faint cursor-pointer">
                  <Plus className="h-4 w-4" /> ออก{activeTabLabel}
                </button>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <p className="px-6 py-10 text-center text-[13px] text-brand-muted">ไม่พบเอกสารที่ตรงกับ “{listQuery}”</p>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id;
                  const totals = calculateTotals(inv.items, inv.vatRate, inv.whtRate);
                  return (
                    <li key={inv.id} className={`flex items-center gap-1 border-b border-brand-border pr-2 transition-colors last:border-b-0 ${isSelected ? 'bg-[#FFF1E8] dark:bg-[#E65F2B]/12' : 'hover:bg-brand-faint/60'}`}>
                      <button type="button" onClick={() => setSelectedInvoice(inv)} aria-current={isSelected ? 'true' : undefined} className="min-w-0 flex-1 px-4 py-3.5 text-left cursor-pointer">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13px] font-semibold text-brand-text">{inv.documentNo}</span>
                          <span className="shrink-0 font-mono text-[13px] text-brand-text">{formatCurrency(totals.grandTotal)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-brand-muted">{inv.client.name || 'ไม่ระบุลูกค้า'} · {new Date(inv.createdDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                      </button>
                      <RowMenu label={`ตัวเลือกของ ${inv.documentNo}`} items={[
                        { label: 'แก้ไข', run: () => handleStartEditInvoice(inv) },
                        { label: 'ทำสำเนา', run: () => handleDuplicateInvoice(inv) },
                        { label: 'ลบเอกสาร', danger: true, run: () => handleDeleteInvoice(inv.id) },
                      ]} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="min-w-0" aria-label="ตัวอย่างเอกสาร">
            {selectedInvoice && getWorkspaceTab(selectedInvoice.documentType) === docTypeFilter ? (
              <div className="flex min-w-0 flex-col gap-4 lg:h-[calc(100vh-232px)] lg:min-h-[560px]">
                {/* The document is the hero: a title, a few actions, then the paper itself */}
                <div className="flex flex-wrap items-start justify-between gap-3 no-print" aria-label="คำสั่งเอกสาร">
                  <div className="min-w-0">
                    <h2 className="truncate text-[22px] font-semibold leading-tight text-brand-text sm:text-[26px]">{selectedInvoice.documentNo}</h2>
                    <p className="mt-1 truncate text-[13px] text-brand-muted">
                      {selectedInvoice.client.name || 'ไม่ระบุลูกค้า'} · {getDocumentMeta(selectedInvoice.documentType).th} · {formatCurrency(calculateTotals(selectedInvoice.items, selectedInvoice.vatRate, selectedInvoice.whtRate).grandTotal)}
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button type="button" onClick={() => handleStartEditInvoice(selectedInvoice)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
                      <PenLine className="h-4 w-4" /> แก้ไข
                    </button>
                    <button type="button" onClick={handleDownloadPdf} disabled={pdfBusy} aria-label="ดาวน์โหลด PDF" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-3.5 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-60 cursor-pointer">
                      <Download className="h-4 w-4" /> <span className="hidden sm:inline">{pdfBusy ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF'}</span><span className="sm:hidden">PDF</span>
                    </button>
                    <div className="min-w-0 flex-1 sm:flex-none">
                      <ShareButton invoice={withCurrentBranding(selectedInvoice)} pdf={pdf} onDownload={handleDownloadPdf} onPrint={handlePrintDocument} onEmail={handleSendToCustomer} notify={triggerAlert} />
                    </div>
                    <RowMenu label={`ตัวเลือกเพิ่มเติมของ ${selectedInvoice.documentNo}`} items={[
                      { label: 'ทำสำเนา', run: () => handleDuplicateInvoice(selectedInvoice) },
                      { label: 'ลบเอกสาร', danger: true, run: () => handleDeleteInvoice(selectedInvoice.id) },
                    ]} />
                  </div>
                </div>
                <DocumentReveal invoice={withCurrentBranding(selectedInvoice)} className="h-[72vh] min-h-[440px] lg:h-auto lg:flex-1" />
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center p-12 text-center lg:h-[calc(100vh-232px)]">
                <FileText className="mb-4 h-12 w-12 text-brand-border" />
                <p className="text-[13px] font-medium text-brand-text">{tabInvoices.length ? 'เลือกเอกสารด้านซ้ายเพื่อดูตัวอย่าง' : `ยังไม่มี${activeTabLabel}`}</p>
                <p className="mt-1 text-xs text-brand-muted">{tabInvoices.length ? 'เห็นทั้งหน้า A4 แล้วแชร์ให้ลูกค้าได้ทันที' : 'กด “ออกเอกสารใหม่” เพื่อเริ่ม'}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: DOCUMENT EDITOR (CREATE / EDIT) */}
      {activeSubTab === 'create' && (
        <div className="app-subtab-enter space-y-4 no-print">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={() => setActiveSubTab('list')} className="mb-2 inline-flex items-center gap-1 text-[13px] text-brand-muted hover:text-brand-text cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> ย้อนกลับรายการ
            </button>
            <h2 className="text-xl font-semibold text-brand-text">{editingInvoiceId ? 'แก้ไข' : 'สร้าง'}{getDocumentMeta(docType).th}</h2>
            <p className="mt-0.5 text-[13px] text-brand-muted">กรอกข้อมูลเอกสาร และดูตัวอย่างแบบเรียลไทม์</p>
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
        <form onSubmit={handleSaveInvoice} className={`${uiSurface} relative pb-0`}>

          {/* Quick pre-fill from a job */}
          {jobs.length > 0 && !editingInvoiceId && (
            <section className={formSection}>
              <label className={formLabel} htmlFor="doc-from-job">
                <span className="inline-flex items-center gap-1.5"><Briefcase className="h-4 w-4 text-brand-muted" /> ดึงข้อมูลจากงาน</span>
              </label>
              <select id="doc-from-job" value={selectedJobId} onChange={(e) => handleSelectJob(e.target.value)} className={`${formInput} cursor-pointer`}>
                <option value="" disabled>เลือกงาน แล้วระบบกรอกลูกค้า รายการ ยอด และภาษีให้</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{job.name} (ลูกค้า: {job.client} | ยอด: {formatCurrency(job.value)})</option>
                ))}
              </select>
              {selectedJobId && <p className={formHint}>ดึงข้อมูลจาก <span className="font-medium text-brand-text">{jobs.find(j => j.id === selectedJobId)?.name}</span></p>}
            </section>
          )}

          {/* 1. Document */}
          <section className={formSection}>
            <h3 className={formHeading}>ข้อมูลเอกสาร</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel} htmlFor="doc-type">ประเภทเอกสาร</label>
                <select
                  id="doc-type"
                  value={docType}
                  onChange={(e) => {
                    const val = e.target.value as DocumentType;
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
                  {(docType === 'receiptTaxInvoice' ? [...DOCUMENT_TYPES, docType] : DOCUMENT_TYPES).map(type => (
                    <option key={type} value={type}>{getDocumentMeta(type).th} ({getDocumentMeta(type).en})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-no">เลขที่เอกสาร</label>
                <input id="doc-no" type="text" value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="เช่น INV-2026-001" className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-created">วันที่ออกเอกสาร</label>
                <input id="doc-created" type="date" value={createdDate} onChange={(e) => setCreatedDate(e.target.value)} className={`${formInput} cursor-pointer`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-due">
                  {docType === 'quotation' ? 'ยืนราคาถึงวันที่' : getDocumentMeta(docType).isReceipt ? 'วันที่รับเงิน (ถ้าต่างจากวันชำระ)' : 'วันที่กำหนดชำระเงิน'}
                </label>
                <input id="doc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${formInput} cursor-pointer`} />
              </div>
              {docType === 'quotation' && (
                <div>
                  <label className={formLabel} htmlFor="doc-response">วันที่ตอบรับ</label>
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
                เงื่อนไขและเลขอ้างอิง (ไม่บังคับ)
              </button>
            )}
            {docTermsVisible && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={formLabel} htmlFor="doc-payment-term">เงื่อนไขการชำระเงิน</label>
                  <input id="doc-payment-term" type="text" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} placeholder="เช่น เงินสด, เครดิต 30 วัน, โอนเงิน 100%" className={formInput} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-delivery-term">ระยะเวลาการส่งมอบสินค้า / บริการ</label>
                  <input id="doc-delivery-term" type="text" value={deliveryTerm} onChange={(e) => setDeliveryTerm(e.target.value)} placeholder="เช่น ภายใน 7 วันทำการ, ทันทีหลังรับมัดจำ" className={formInput} />
                </div>
                <div className="sm:col-span-2">
                  <label className={formLabel} htmlFor="doc-ref">อ้างอิงเลขที่เอกสาร / ใบสั่งซื้อ (PO/QT Ref)</label>
                  <input id="doc-ref" type="text" value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="เช่น QT-2569-003, PO-9988" className={`${formInput} font-mono`} />
                </div>
              </div>
            )}
          </section>

          {/* Receipt-only: how and when the money was received */}
          {getDocumentMeta(docType).isReceipt && (
            <section className={formSection}>
              <h3 className={formHeading}>การรับชำระเงิน</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className={formLabel} htmlFor="doc-paid-date">วันที่รับชำระเงิน</label>
                  <input id="doc-paid-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={`${formInput} cursor-pointer`} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-paid-method">วิธีชำระเงิน</label>
                  <input id="doc-paid-method" type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="เช่น โอนเงิน, เงินสด, พร้อมเพย์" className={formInput} />
                </div>
                <div>
                  <label className={formLabel} htmlFor="doc-paid-amount">จำนวนเงินที่ได้รับ</label>
                  <NumberInput id="doc-paid-amount" value={paidAmount} onChange={(raw) => setPaidAmount(raw === '' ? '' : Math.max(0, parseFloat(raw) || 0))} placeholder="เว้นว่าง = ยอดสุทธิ" className={`${formInput} font-mono`} />
                </div>
              </div>
            </section>
          )}

          {/* 2. Customer */}
          <section className={formSection}>
            <h3 className={formHeading}>ลูกค้า / ผู้จ่ายเงิน</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="client-name">ชื่อลูกค้า หรือ ชื่อบริษัท</label>
                <input id="client-name" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="เช่น บริษัท อะคอร์น มีเดีย จำกัด (สำนักงานใหญ่)" className={formInput} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-tax">เลขประจำตัวผู้เสียภาษี</label>
                <input id="client-tax" type="text" value={clientTaxId} onChange={(e) => setClientTaxId(e.target.value)} placeholder="13 หลัก" className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-branch">สาขา</label>
                <input id="client-branch" type="text" value={clientBranch} onChange={(e) => setClientBranch(e.target.value)} placeholder="เช่น สำนักงานใหญ่ หรือ 00001" className={formInput} />
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="client-address">ที่อยู่ผู้เสียภาษี</label>
                <textarea id="client-address" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="เช่น 12/3 อาคารไอคอนิค ชั้น 5 แขวงคลองต้น เขตวัฒนา กรุงเทพฯ 10110" rows={2} className={`${formInput} h-auto py-2.5`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-contact">ชื่อผู้ติดต่อ (เรียน)</label>
                <input id="client-contact" type="text" value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} placeholder="เช่น คุณเอก ใจดี" className={formInput} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-code">รหัสลูกค้า (ถ้ามี)</label>
                <input id="client-code" type="text" value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder="เช่น C-0012" className={`${formInput} font-mono`} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-phone">เบอร์โทรศัพท์</label>
                <input id="client-phone" type="text" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="เช่น 02-555-5555" className={formInput} />
              </div>
              <div>
                <label className={formLabel} htmlFor="client-email">อีเมล</label>
                <input id="client-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="เช่น finance@client.co.th" className={formInput} />
              </div>
            </div>
          </section>

          {/* 3. Items: description on its own line, numbers underneath, so nothing gets squeezed */}
          <section className={formSection}>
            <h3 className={formHeading}>รายการ</h3>
            <ol className="divide-y divide-brand-border">
              {invoiceItems.map((item, idx) => (
                <li key={item.id} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-2.5 w-5 shrink-0 text-center font-mono text-[13px] text-brand-muted">{idx + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <input type="text" value={item.description} onChange={(e) => handleItemFieldChange(item.id, 'description', e.target.value)}
                        placeholder="ชื่อรายการ เช่น ออกแบบเว็บไซต์, ค่าจัดทำวิดีโอ" aria-label={`ชื่อรายการที่ ${idx + 1}`} className={`${formInput} font-medium`} />
                      <input type="text" value={item.detail || ''} onChange={(e) => handleItemFieldChange(item.id, 'detail', e.target.value)}
                        placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)" aria-label={`รายละเอียดรายการที่ ${idx + 1}`} className={`${formInput} h-10 text-[13px] text-brand-muted`} />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="block">
                          <span className={formMiniLabel}>จำนวน</span>
                          <input type="number" value={item.quantity} onChange={(e) => handleItemFieldChange(item.id, 'quantity', e.target.value)} placeholder="จำนวน" className={`${formInput} text-center font-mono`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>หน่วย</span>
                          <input type="text" value={item.unit || ''} onChange={(e) => handleItemFieldChange(item.id, 'unit', e.target.value)} placeholder="หน่วย" className={`${formInput} text-center`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>ราคาต่อหน่วย</span>
                          <NumberInput value={item.price} onChange={(raw) => handleItemFieldChange(item.id, 'price', raw)} placeholder="0" className={`${formInput} text-right font-mono`} />
                        </label>
                        <label className="block">
                          <span className={formMiniLabel}>ส่วนลด (บาท)</span>
                          <NumberInput value={item.discount || 0} onChange={(raw) => handleItemFieldChange(item.id, 'discount', raw)} placeholder="0" className={`${formInput} text-right font-mono`} />
                        </label>
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <button type="button" onClick={() => handleRemoveItemRow(item.id)} title="ลบแถวนี้" aria-label={`ลบรายการที่ ${idx + 1}`}
                          className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-brand-muted transition-colors hover:bg-[#FDEEEE] hover:text-[#C43A3A] cursor-pointer dark:hover:bg-[#F19A9A]/10 dark:hover:text-[#F19A9A]">
                          <Trash2 className="h-3.5 w-3.5" /> ลบรายการ
                        </button>
                        <p className="text-[13px] text-brand-muted">รวม <span className="ml-1 font-mono text-[15px] font-semibold text-brand-text">{formatCurrency(item.quantity * item.price - (item.discount || 0))}</span></p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button type="button" onClick={handleAddItemRow}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-border text-[13px] font-medium text-[#C24A16] transition-colors hover:border-[#F3B08C] hover:bg-[#FFF5EE] cursor-pointer dark:text-[#FF9A6B] dark:hover:bg-[#E65F2B]/10">
              <Plus className="h-4 w-4" /> เพิ่มแถวรายการ
            </button>
          </section>

          {/* 4. Tax + note */}
          <section className={formSection}>
            <h3 className={formHeading}>ภาษีและหมายเหตุ</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabel} htmlFor="doc-vat">ภาษีมูลค่าเพิ่ม (VAT)</label>
                <select id="doc-vat" value={vatRate} onChange={(e) => setVatRate(parseInt(e.target.value) || 0)} className={`${formInput} cursor-pointer`}>
                  <option value={0}>ไม่มีภาษีมูลค่าเพิ่ม (0%)</option>
                  <option value={7}>ภาษีมูลค่าเพิ่ม 7%</option>
                </select>
              </div>
              <div>
                <label className={formLabel} htmlFor="doc-wht">หัก ณ ที่จ่าย</label>
                <select id="doc-wht" value={whtRate} onChange={(e) => setWhtRate(parseFloat(e.target.value) || 0)} className={`${formInput} cursor-pointer`}>
                  <option value={0}>ไม่มีการหัก ณ ที่จ่าย</option>
                  <option value={1}>ค่าขนส่ง 1%</option>
                  <option value={3}>ฟรีแลนซ์ / บริการ 3%</option>
                  <option value={5}>ค่าเช่า / โฆษณา 5%</option>
                  {/* A job with a custom rate (e.g. 1.5%) carries it into the document. */}
                  {![0, 1, 3, 5].includes(whtRate) && <option value={whtRate}>อัตรากำหนดเอง {whtRate}%</option>}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={formLabel} htmlFor="doc-note">หมายเหตุ และเงื่อนไขท้ายเอกสาร</label>
                <textarea id="doc-note" value={docNote} onChange={(e) => setDocNote(e.target.value)} placeholder="เช่น กรุณาโอนภายใน 30 วัน, หากชำระล่าช้าจะคิดดอกเบี้ยตามกฎหมาย" rows={3} className={`${formInput} h-auto py-2.5`} />
              </div>
            </div>
          </section>

          {/* 5. Totals */}
          <section className={`${formSection} pb-6`} aria-label="สรุปยอด">
            <h3 className={formHeading}>สรุปยอด</h3>
            <dl className="space-y-2 text-[14px]">
              <div className="flex justify-between gap-4"><dt className="text-brand-muted">ยอดรวมก่อนภาษี</dt><dd className="font-mono text-brand-text">{formatCurrency(subtotal)}</dd></div>
              {vatRate > 0 && <div className="flex justify-between gap-4"><dt className="text-brand-muted">ภาษีมูลค่าเพิ่ม {vatRate}%</dt><dd className="font-mono text-brand-text">+{formatCurrency(vatAmount)}</dd></div>}
              {whtRate > 0 && <div className="flex justify-between gap-4"><dt className="text-brand-muted">หัก ณ ที่จ่าย {whtRate}%</dt><dd className="font-mono text-[#C43A3A] dark:text-[#F19A9A]">-{formatCurrency(whtAmount)}</dd></div>}
              <div className="flex items-baseline justify-between gap-4 border-t border-brand-border pt-3">
                <dt className="text-[15px] font-semibold text-brand-text">ยอดรับสุทธิ</dt>
                <dd className="font-mono text-[26px] font-semibold leading-none text-brand-text">{formatCurrency(grandTotal)}</dd>
              </div>
            </dl>
          </section>

          {/* Actions stay in reach while scrolling a long form */}
          <div className="sticky bottom-3 z-10 mx-3 mb-3 flex flex-nowrap items-center gap-1 rounded-xl border border-brand-border bg-brand-white/95 px-3 py-2.5 shadow-[0_8px_28px_rgba(20,18,16,0.12)] backdrop-blur sm:mx-4 sm:mb-4 dark:bg-[#232428]/95 dark:shadow-[0_8px_28px_rgba(0,0,0,0.4)]">
            <button type="button" onClick={() => setActiveSubTab('list')} className="hidden h-11 rounded-xl px-4 text-[13px] font-medium sm:inline-flex sm:items-center text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">ยกเลิก</button>
            <button type="button" onClick={() => setMobilePreviewOpen(true)} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer xl:hidden"><Eye className="h-4 w-4" />ดูตัวอย่าง</button>
            <button type="button" onClick={handleClearForm} title="ล้างข้อมูลทั้งหมด" aria-label="ล้างข้อมูล" className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer sm:px-4"><RotateCcw className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">ล้างข้อมูล</span></button>
            <button type="submit" className="ml-auto inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#E65F2B] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
              <FileText className="h-4 w-4" />
              <span className="sm:hidden">บันทึก</span>
              <span className="hidden sm:inline">{editingInvoiceId ? 'บันทึกการแก้ไข' : 'บันทึกและสร้างเอกสาร'}</span>
            </button>
          </div>
        </form>

        {/* Live preview: beside the form on wide screens, a full-screen sheet on phones */}
        <aside className="hidden xl:sticky xl:top-4 xl:block xl:h-[calc(100vh-2rem)]" aria-label="ตัวอย่างเอกสาร">
          <PreviewCanvas invoice={withCurrentBranding(buildDraftInvoice())} className="h-full" />
        </aside>
        </div>
        {/* Portalled: the page wrapper animates with a transform, which would trap a fixed overlay inside it. */}
        {mobilePreviewOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex flex-col bg-brand-white xl:hidden" role="dialog" aria-modal="true" aria-label="ตัวอย่างเอกสาร">
            <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
              <p className="text-[15px] font-semibold text-brand-text">ตัวอย่าง{getDocumentMeta(docType).th}</p>
              <button type="button" onClick={() => setMobilePreviewOpen(false)} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#C24A16] hover:bg-brand-faint cursor-pointer">กลับไปแก้ไข</button>
            </div>
            <PreviewCanvas invoice={withCurrentBranding(buildDraftInvoice())} className="m-3 flex-1 rounded-xl" />
          </div>,
          document.body,
        )}
        </div>
      )}

    </div>
  );
};

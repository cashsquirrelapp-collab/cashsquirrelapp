import PageHeader from '../../components/ui/PageHeader';
import { uiPrimaryButton } from '../../components/ui/uiStyles';
import { privateCache } from '../../services/privateCache';
import { imageFileToDataUrl } from '../../services/images';
import { readInvoices, saveCloud } from '../../services/cloud';
import { validateChanges } from '../../../../shared/validation';
import React, { useState, useEffect } from 'react';
import { Job, Invoice, InvoiceItem, InvoiceProfile, DocumentType } from '../../../../shared/types';
import { DocumentPreview, DOCUMENT_TYPES, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT, calculateDocumentTotals, getDocumentMeta, printDocument } from './DocumentA4';
import { formatCurrency } from '../../utils';
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
  Send
} from 'lucide-react';

type DocumentWorkspaceTab = Exclude<DocumentType, 'receiptTaxInvoice'>;

const DOCUMENT_WORKSPACE_TABS: Array<{ key: DocumentWorkspaceTab; label: string }> = [
  { key: 'quotation', label: 'ใบเสนอราคา' },
  { key: 'invoice', label: 'ใบแจ้งหนี้' },
  { key: 'receipt', label: 'ใบเสร็จ' },
  { key: 'taxInvoice', label: 'ใบกำกับภาษี' }
];

const getWorkspaceTab = (type: DocumentType): DocumentWorkspaceTab =>
  type === 'receiptTaxInvoice' ? 'taxInvoice' : type;

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
  <div className="md:col-span-12 bg-stone-50 dark:bg-stone-950/40 p-5 rounded-2xl border border-brand-border/40 space-y-3.5">
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-[#E65F2B]/10 rounded-lg text-[#E65F2B]">
        <Settings className="w-4 h-4" />
      </div>
      <div>
        <h4 className="text-xs font-black text-brand-text dark:text-white uppercase">{title}</h4>
        <p className="text-[9px] text-brand-muted">{hint}</p>
      </div>
    </div>

    <div className="flex flex-col sm:flex-row gap-5 items-center">
      <div className="w-24 h-24 border border-brand-border/60 rounded-2xl bg-white dark:bg-stone-900 flex items-center justify-center overflow-hidden shrink-0 shadow-inner border-dashed">
        {value ? (
          <img src={value} alt="" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
        ) : (
          <div className="text-center p-2 flex flex-col items-center gap-1">
            <Upload className="w-5 h-5 text-brand-muted" />
            <span className="text-[8px] text-brand-muted font-bold">{emptyLabel}</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2 w-full">
        <div className="flex flex-wrap gap-2">
          <label className="px-4 py-2 bg-[#E65F2B] hover:bg-[#E65F2B]/90 text-white text-[10px] font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-xs">
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
              className="px-3.5 py-2 bg-stone-100 hover:bg-red-50 dark:bg-stone-800 dark:hover:bg-red-950/20 text-stone-600 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 text-[10px] font-black rounded-xl transition-all cursor-pointer"
            >
              {removeLabel}
            </button>
          )}
        </div>
        {size && value ? (
          <label className="flex items-center gap-3 text-[10px] font-black text-brand-muted">
            <span className="shrink-0">ขนาดบนเอกสาร</span>
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
        <p className="text-[9px] text-brand-muted leading-relaxed">
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
  const [docTypeFilter, setDocTypeFilter] = useState<DocumentWorkspaceTab>('quotation');

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
          { id: 'i2', description: 'ตัดต่อวิดีโอสั้นลง TikTok และ Reels จำนวน 3 ตอน', quantity: 3, price: 4000 }
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

    const newInvoice: Invoice = {
      id: editingInvoiceId || crypto.randomUUID(),
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
    };

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
          setSelectedInvoice(updated[0] || null);
        }
      }
    );
  };

  // Open editor with empty form for creating new invoice
  const handleOpenCreateForm = () => {
    setEditingInvoiceId(null);
    setSelectedJobId('');
    setDocType('invoice');
    
    // Auto increment document no based on current count
    const thaiYear = new Date().getFullYear() + 543;
    const serial = String(invoices.length + 1).padStart(3, '0');
    setDocNo(`INV-${thaiYear}-${serial}`);
    
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

  // Sync selected invoice on load if none selected
  useEffect(() => {
    if (invoices.length > 0 && !selectedInvoice) {
      setSelectedInvoice(invoices[0]);
      setDocTypeFilter(getWorkspaceTab(invoices[0].documentType));
    }
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

  const filteredInvoices = invoices.filter(inv => getWorkspaceTab(inv.documentType) === docTypeFilter);

  const handleWorkspaceTabChange = (tab: DocumentWorkspaceTab) => {
    setDocTypeFilter(tab);
    const firstDocument = invoices.find(inv => getWorkspaceTab(inv.documentType) === tab);
    setSelectedInvoice(firstDocument || null);
    setActiveSubTab('list');
  };

  return (
    <div className="page-content app-tab-enter space-y-6 pb-16">
      {(storageError || saving || (ownerId && localStorage.getItem('remix_invoices'))) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 text-xs no-print" role="status">
          {(storageError || saving) && <span className={storageError ? 'text-red-600' : 'text-brand-muted'}>{storageError || 'กำลังบันทึกเอกสาร…'}</span>}
          {ownerId && localStorage.getItem('remix_invoices') && <button type="button" onClick={importLegacy} className="font-bold text-[#E65F2B]">นำเข้าเอกสารเดิมจากเครื่อง</button>}
        </div>
      )}
      
      <PageHeader page="invoice" className="no-print">
        <button
          type="button"
          onClick={handleOpenCreateForm}
          className={uiPrimaryButton}
        >
          <Plus className="h-4 w-4" />
          <span>ออกเอกสารใหม่</span>
        </button>
      </PageHeader>

      {activeSubTab === 'list' && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-print" aria-label="ประเภทเอกสาร">
          {DOCUMENT_WORKSPACE_TABS.map(tab => {
            const count = invoices.filter(inv => getWorkspaceTab(inv.documentType) === tab.key).length;
            const isActive = docTypeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleWorkspaceTabChange(tab.key)}
                aria-pressed={isActive}
                className={`shrink-0 rounded-xl px-5 py-3 text-xs font-black transition ${
                  isActive
                    ? 'bg-[#FFF0E7] text-[#D85324] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]'
                    : 'bg-[#F5F6F8] text-brand-muted hover:bg-[#EEEFF2] hover:text-brand-text dark:bg-stone-900 dark:hover:bg-stone-800'
                }`}
              >
                {tab.label}
                <span className="sr-only"> {count} รายการ</span>
              </button>
            );
          })}
        </div>
      )}

      {/* SUB-TAB 1: DOCUMENTS LIST & LIVE PREVIEW GRID */}
      {activeSubTab === 'list' && (
        <div className="app-subtab-enter grid min-h-[680px] grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-brand-border/70 bg-brand-white dark:bg-stone-900 no-print" aria-label="รายการเอกสาร">
            <div className="flex items-center justify-between border-b border-brand-border/60 px-5 py-4">
              <div>
                <h2 className="text-sm font-black text-brand-text dark:text-white">{DOCUMENT_WORKSPACE_TABS.find(tab => tab.key === docTypeFilter)?.label}</h2>
                <p className="mt-0.5 text-[10px] font-bold text-brand-muted">{filteredInvoices.length} รายการ</p>
              </div>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-8 text-center text-brand-muted">
                <FileText className="mb-3 h-9 w-9 text-brand-border" />
                <p className="text-xs font-black">ยังไม่มีเอกสารประเภทนี้</p>
                <button type="button" onClick={handleOpenCreateForm} className="mt-4 text-xs font-black text-[#E65F2B] hover:underline">
                  + สร้างเอกสารใหม่
                </button>
              </div>
            ) : (
              <div className="max-h-[760px] overflow-y-auto">
                {filteredInvoices.map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id;
                  const totals = calculateTotals(inv.items, inv.vatRate, inv.whtRate);
                  
                  return (
                    <div
                      key={inv.id}
                      className={`group flex w-full items-center border-b border-brand-border/50 transition last:border-b-0 ${
                        isSelected
                          ? 'bg-[#FFF0E7] dark:bg-[#E65F2B]/15'
                          : 'bg-brand-white hover:bg-brand-faint/60 dark:bg-stone-900 dark:hover:bg-stone-800/70'
                      }`}
                    >
                      <button type="button" onClick={() => setSelectedInvoice(inv)} className="min-w-0 flex-1 px-5 py-5 text-left">
                        <span className="block truncate text-sm font-black text-brand-text dark:text-white">{inv.documentNo}</span>
                        <span className="mt-1 block truncate text-xs font-bold text-brand-muted">
                          {inv.client.name} · {formatCurrency(totals.grandTotal)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleDeleteInvoice(inv.id, event)}
                        aria-label={`ลบเอกสาร ${inv.documentNo}`}
                        className="mr-3 rounded-lg p-2 text-brand-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="min-w-0">
            {selectedInvoice ? (
              <div className="flex h-full min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 no-print" aria-label="คำสั่งเอกสาร">
                  <button type="button" onClick={() => handleStartEditInvoice(selectedInvoice)} className="rounded-xl bg-[#F5F6F8] px-4 py-3 text-xs font-black text-brand-text transition hover:bg-[#EAEBEE] dark:bg-stone-900 dark:text-white dark:hover:bg-stone-800">
                    แก้ไข
                  </button>
                  <button type="button" onClick={() => handleDuplicateInvoice(selectedInvoice)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F6F8] px-4 py-3 text-xs font-black text-brand-text transition hover:bg-[#EAEBEE] dark:bg-stone-900 dark:text-white dark:hover:bg-stone-800">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <button type="button" onClick={handlePrintDocument} aria-label="พิมพ์ / บันทึกเป็น PDF" className="inline-flex items-center gap-1.5 rounded-xl bg-[#F5F6F8] px-4 py-3 text-xs font-black text-brand-text transition hover:bg-[#EAEBEE] dark:bg-stone-900 dark:text-white dark:hover:bg-stone-800">
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </button>
                  <button type="button" onClick={handleSendToCustomer} className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF5A16] px-4 py-3 text-xs font-black text-white shadow-sm transition hover:bg-[#E94B0A]">
                    <Send className="h-3.5 w-3.5" /> ส่งให้ลูกค้า
                  </button>
                </div>
                <div data-testid="document-preview-canvas" className="flex min-h-[620px] flex-1 items-start justify-center overflow-auto rounded-2xl bg-[#F2F3F5] p-4 sm:p-7 lg:p-10 dark:bg-stone-950">
                  <div className="w-full max-w-[794px] min-w-[680px] shadow-sm">
                    <DocumentPreview invoice={withCurrentBranding(selectedInvoice)} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[680px] flex-col items-center justify-center rounded-2xl bg-[#F2F3F5] p-12 text-center text-brand-muted dark:bg-stone-950">
                <FileText className="mb-4 h-12 w-12 text-brand-border" />
                <p className="text-xs font-black">เลือกเอกสารด้านซ้ายเพื่อดูตัวอย่าง</p>
                <p className="mt-1 text-[10px]">หรือสร้างเอกสารใหม่เพื่อเริ่มใช้งาน</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: DOCUMENT EDITOR (CREATE / EDIT) */}
      {activeSubTab === 'create' && (
        <form onSubmit={handleSaveInvoice} className="app-subtab-enter bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-3xl p-6 shadow-sm space-y-6 no-print">
          
          <div className="flex items-center justify-between border-b border-brand-border pb-3.5">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-[#E65F2B]/10 rounded-xl text-[#E65F2B]">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                {editingInvoiceId ? 'แก้ไขข้อมูลบิลดั้งเดิม' : 'สร้างเอกสารใบแจ้งหนี้ / ใบเสร็จใหม่'}
              </h3>
            </div>
            
            <button
              type="button"
              onClick={() => setActiveSubTab('list')}
              className="px-3.5 py-1.5 bg-brand-faint hover:bg-brand-border/40 text-brand-text text-[10px] font-black rounded-xl transition-all cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>ย้อนกลับรายการ</span>
            </button>
          </div>

          {/* Quick Pre-fill from Job/Deal */}
          {jobs.length > 0 && !editingInvoiceId && (
            <div className="p-4 bg-[#E65F2B]/5 rounded-2xl border border-[#E65F2B]/10 space-y-2">
              <label className="text-[10px] font-extrabold text-[#E65F2B] uppercase tracking-wide flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5" /> ซิงค์ดึงข้อมูลโดยตรงจากดีลงานสะสมของคุณ
              </label>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                <select
                  value={selectedJobId}
                  onChange={(e) => handleSelectJob(e.target.value)}
                  className="bg-brand-white dark:bg-stone-800 text-xs font-bold text-brand-text dark:text-white border border-brand-border/50 rounded-xl px-3 py-2 outline-none focus:border-[#E65F2B] flex-1 cursor-pointer"
                >
                  <option value="" disabled>--- เลือกงานดีลเพื่อดึงข้อมูลอัตโนมัติ ---</option>
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.name} (ลูกค้า: {job.client} | ยอด: {formatCurrency(job.value)})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleClearForm}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 text-[10px] font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-stone-200 dark:border-stone-700 shrink-0"
                  title="ล้างข้อมูลทั้งหมด"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ล้างข้อมูลที่เลือก</span>
                </button>

                <p className="text-[9px] text-brand-muted leading-relaxed max-w-xs flex items-center">
                  * เลือกร้านค้าเพื่อดึงข้อมูลลูกค้า, ชื่อบริการ, ยอดเงิน, และอัตราหัก ณ ที่จ่าย ของดีลนั้นลงแบบฟอร์มทันทีไม่ต้องพิมเอง
                </p>
              </div>
            </div>
          )}

          {/* Document Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Doc Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">ประเภทเอกสาร</label>
              <select
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
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
              >
                {(docType === 'receiptTaxInvoice' ? [...DOCUMENT_TYPES, docType] : DOCUMENT_TYPES).map(type => (
                  <option key={type} value={type}>{getDocumentMeta(type).th} ({getDocumentMeta(type).en})</option>
                ))}
              </select>
            </div>

            {/* Doc No */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">เลขที่เอกสาร</label>
              <input
                type="text"
                value={docNo}
                onChange={(e) => setDocNo(e.target.value)}
                placeholder="เช่น INV-2026-001"
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>

            {/* Created Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">วันที่ออกเอกสาร</label>
              <input
                type="date"
                value={createdDate}
                onChange={(e) => setCreatedDate(e.target.value)}
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
              />
            </div>

            {/* Due Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">
                {docType === 'quotation' ? 'ยืนราคาถึงวันที่' : getDocumentMeta(docType).isReceipt ? 'วันที่รับเงิน (ถ้าต่างจากวันชำระ)' : 'วันที่กำหนดชำระเงิน'}
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
              />
            </div>

            {/* Response Date (quotation only) */}
            {docType === 'quotation' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">วันที่ตอบรับ</label>
                <input
                  type="date"
                  value={responseDate}
                  onChange={(e) => setResponseDate(e.target.value)}
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                />
              </div>
            )}

          </div>

          {/* Document Optional Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-brand-faint/35 dark:bg-stone-950/10 border border-brand-border/40 rounded-2xl">
            {/* Payment Term */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">
                เงื่อนไขการชำระเงิน (เช่น เงินสด, เครดิต 30 วัน)
              </label>
              <input
                type="text"
                value={paymentTerm}
                onChange={(e) => setPaymentTerm(e.target.value)}
                placeholder="เช่น เงินสด, เครดิต 30 วัน, โอนเงิน 100%"
                className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>

            {/* Delivery Term */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">
                ระยะเวลาการส่งมอบสินค้า / บริการ
              </label>
              <input
                type="text"
                value={deliveryTerm}
                onChange={(e) => setDeliveryTerm(e.target.value)}
                placeholder="เช่น ภายใน 7 วันทำการ, ทันทีหลังรับมัดจำ"
                className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>

            {/* Ref No */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">
                อ้างอิงเลขที่เอกสาร / ใบสั่งซื้อ (PO/QT Ref)
              </label>
              <input
                type="text"
                value={refNo}
                onChange={(e) => setRefNo(e.target.value)}
                placeholder="เช่น QT-2569-003, PO-9988"
                className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>
          </div>

          {/* Receipt-only: how and when the money was received */}
          {getDocumentMeta(docType).isReceipt && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#E65F2B]/5 border border-[#E65F2B]/15 rounded-2xl">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">วันที่รับชำระเงิน</label>
                <input
                  type="date"
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">วิธีชำระเงิน</label>
                <input
                  type="text"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="เช่น โอนเงิน, เงินสด, พร้อมเพย์"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">จำนวนเงินที่ได้รับ (เว้นว่าง = ยอดสุทธิ)</label>
                <NumberInput
                  value={paidAmount}
                  onChange={(raw) => setPaidAmount(raw === '' ? '' : Math.max(0, parseFloat(raw) || 0))}
                  placeholder="บาท"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-black font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>
            </div>
          )}

          {/* Customer / Client Details Card */}
          <div className="p-4 bg-brand-faint/45 dark:bg-stone-950/20 border border-brand-border/60 rounded-2xl space-y-4">
            <h4 className="text-[11px] font-black text-brand-text dark:text-white uppercase tracking-wider flex items-center gap-1.5">
              <Building className="w-4 h-4 text-[#E65F2B]" />
              <span>ข้อมูลลูกค้า / ผู้จ่ายเงิน (Bill To)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">ชื่อลูกค้า หรือ ชื่อบริษัท</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="เช่น บริษัท อะคอร์น มีเดีย จำกัด (สำนักงานใหญ่)"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">เลขประจำตัวผู้เสียภาษีลูกค้า</label>
                <input
                  type="text"
                  value={clientTaxId}
                  onChange={(e) => setClientTaxId(e.target.value)}
                  placeholder="เช่น 0105561000222 (13 หลัก)"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">รหัสลูกค้า (ถ้ามี)</label>
                <input
                  type="text"
                  value={clientCode}
                  onChange={(e) => setClientCode(e.target.value)}
                  placeholder="เช่น C-0012"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">สาขา</label>
                <input
                  type="text"
                  value={clientBranch}
                  onChange={(e) => setClientBranch(e.target.value)}
                  placeholder="เช่น สำนักงานใหญ่ หรือ สาขา 00001"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-12 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">ที่อยู่ผู้เสียภาษีลูกค้า</label>
                <textarea
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="เช่น 12/3 อาคารไอคอนิค ชั้น 5 แขวงคลองต้น เขตวัฒนา กรุงเทพฯ 10110"
                  rows={2}
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-semibold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">ชื่อผู้ติดต่อ (เรียน)</label>
                <input
                  type="text"
                  value={clientContactName}
                  onChange={(e) => setClientContactName(e.target.value)}
                  placeholder="เช่น คุณเอก ใจดี"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">เบอร์โทรศัพท์ติดต่อ</label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="เช่น 02-555-5555"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-4 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">อีเมลลูกค้า</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="เช่น finance@client.co.th"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Table: Invoice Items */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
              <label className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                รายการค่าบริการและคำนวณเงินสด
              </label>
              
              <button
                type="button"
                onClick={handleAddItemRow}
                className="px-3 py-1.5 bg-[#E65F2B]/10 hover:bg-[#E65F2B]/20 text-[#E65F2B] dark:text-[#FFA473] text-[10px] font-black rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มแถวรายการ</span>
              </button>
            </div>

            <div className="space-y-2">
              {invoiceItems.map((item, idx) => (
                <div key={item.id} className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center bg-brand-faint/30 dark:bg-stone-950/10 p-3 rounded-2xl border border-brand-border/50">
                  <span className="text-[10px] font-black font-mono text-brand-muted shrink-0 w-6 text-center">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemFieldChange(item.id, 'description', e.target.value)}
                      placeholder="เช่น ออกแบบเว็บไซต์, เขียนโค้ดระบบ, ค่าจัดหาวิดีโอ"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                    />
                    <input
                      type="text"
                      value={item.detail || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'detail', e.target.value)}
                      placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                      className="w-full mt-1.5 bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-xl px-3 py-1.5 text-[11px] font-medium text-brand-muted dark:text-stone-300 outline-none focus:border-[#E65F2B]"
                    />
                  </div>

                  <div className="w-full sm:w-24 shrink-0 flex gap-2 sm:block">
                    <span className="sm:hidden text-[9px] font-bold text-brand-muted self-center">จำนวน:</span>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemFieldChange(item.id, 'quantity', e.target.value)}
                      placeholder="จำนวน"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-black font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] text-center"
                    />
                  </div>

                  <div className="w-full sm:w-20 shrink-0 flex gap-2 sm:block">
                    <span className="sm:hidden text-[9px] font-bold text-brand-muted self-center">หน่วย:</span>
                    <input
                      type="text"
                      value={item.unit || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'unit', e.target.value)}
                      placeholder="หน่วย"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] text-center"
                    />
                  </div>

                  <div className="w-full sm:w-36 shrink-0 flex gap-2 sm:block">
                    <span className="sm:hidden text-[9px] font-bold text-brand-muted self-center">ราคาต่อหน่วย:</span>
                    <NumberInput
                      value={item.price}
                      onChange={(raw) => handleItemFieldChange(item.id, 'price', raw)}
                      placeholder="ราคา (บาท)"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-black font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] text-right"
                    />
                  </div>

                  <div className="w-full sm:w-28 shrink-0 flex gap-2 sm:block">
                    <span className="sm:hidden text-[9px] font-bold text-brand-muted self-center">ส่วนลด:</span>
                    <NumberInput
                      value={item.discount || 0}
                      onChange={(raw) => handleItemFieldChange(item.id, 'discount', raw)}
                      placeholder="ส่วนลด (บาท)"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-black font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] text-right"
                    />
                  </div>

                  <div className="w-full sm:w-32 text-right self-center font-mono font-bold text-xs text-brand-text dark:text-white hidden sm:block">
                    {formatCurrency(item.quantity * item.price - (item.discount || 0))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItemRow(item.id)}
                    className="p-2 bg-pink-bg text-pink-acc rounded-xl hover:bg-[#351C15]/50 transition-all cursor-pointer flex items-center justify-center border border-pink-acc/10 self-end sm:self-auto"
                    title="ลบแถวนี้"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Tax Setting Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            
            {/* Left: VAT & WHT configuration */}
            <div className="bg-brand-faint/30 dark:bg-stone-950/10 p-5 border border-brand-border/60 rounded-3xl space-y-4">
              <h4 className="text-[10px] font-black text-brand-muted uppercase tracking-wider">
                ตั้งค่าภาษีมูลค่าเพิ่ม & หัก ณ ที่จ่าย
              </h4>

              <div className="flex flex-col sm:flex-row gap-4">
                
                {/* VAT option */}
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-brand-muted uppercase">อัตราภาษีมูลค่าเพิ่ม (VAT)</label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(parseInt(e.target.value) || 0)}
                    className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                  >
                    <option value={0}>ไม่มีภาษีมูลค่าเพิ่ม (0%)</option>
                    <option value={7}>ภาษีมูลค่าเพิ่มคงที่ (7%)</option>
                  </select>
                </div>

                {/* WHT option */}
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-brand-muted uppercase">ภาษีหัก ณ ที่จ่าย (Withholding Tax)</label>
                  <select
                    value={whtRate}
                    onChange={(e) => setWhtRate(parseFloat(e.target.value) || 0)}
                    className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                  >
                    <option value={0}>ไม่มีการหัก ณ ที่จ่าย</option>
                    <option value={1}>หัก ณ ที่จ่ายค่าขนส่ง (1%)</option>
                    <option value={3}>หัก ณ ที่จ่ายฟรีแลนซ์/บริการ (3%)</option>
                    <option value={5}>หัก ณ ที่จ่ายค่าเช่า/โฆษณา (5%)</option>
                    {/* A job with a custom rate (e.g. 1.5%) carries it into the document. */}
                    {![0, 1, 3, 5].includes(whtRate) && <option value={whtRate}>หัก ณ ที่จ่ายอัตรากำหนดเอง ({whtRate}%)</option>}
                  </select>
                </div>

              </div>

              {/* Note / Terms */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">หมายเหตุ และ เงื่อนไขท้ายบิล</label>
                <textarea
                  value={docNote}
                  onChange={(e) => setDocNote(e.target.value)}
                  placeholder="เช่น กรุณาโอนภายใน 30 วัน, หากชำระล่าช้าจะคิดดอกเบี้ยตามกฎหมาย"
                  rows={2}
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2.5 text-xs font-semibold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

            </div>

            {/* Right: Summary values */}
            <div className="bg-brand-faint/30 dark:bg-stone-950/10 p-5 border border-brand-border/60 rounded-3xl flex flex-col justify-between">
              <h4 className="text-[10px] font-black text-brand-muted uppercase tracking-wider border-b border-brand-border/30 pb-2">
                ยอดรวมเอกสารจำลอง
              </h4>

              <div className="space-y-2.5 py-4 text-xs font-semibold text-brand-muted">
                <div className="flex justify-between">
                  <span>ยอดรวมก่อนหักภาษี (Subtotal):</span>
                  <span className="font-mono font-bold text-brand-text dark:text-white">{formatCurrency(subtotal)}</span>
                </div>
                {vatRate > 0 && (
                  <div className="flex justify-between">
                    <span>ภาษีมูลค่าเพิ่ม VAT ({vatRate}%):</span>
                    <span className="font-mono text-brand-text dark:text-white">+{formatCurrency(vatAmount)}</span>
                  </div>
                )}
                {whtRate > 0 && (
                  <div className="flex justify-between text-[#A63F1B]">
                    <span>หัก ณ ที่จ่าย ({whtRate}%):</span>
                    <span className="font-mono font-bold">-{formatCurrency(whtAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between border-t border-brand-border/40 pt-2.5 text-sm font-black text-brand-text dark:text-white">
                  <span>ยอดโอนรับสุทธิ (Grand Total):</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base">{formatCurrency(grandTotal)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#E65F2B] hover:bg-[#A63F1B] text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-brand-text/5 text-center flex items-center justify-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>{editingInvoiceId ? 'บันทึกการอัปเดตบิล' : 'บันทึกและสร้างเอกสารบิล'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  ล้างข้อมูล
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('list')}
                  className="py-3 px-4 bg-brand-white hover:bg-brand-faint border border-brand-border/60 text-brand-text dark:bg-stone-900 dark:hover:bg-stone-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>

            </div>

          </div>

        </form>
      )}

    </div>
  );
};

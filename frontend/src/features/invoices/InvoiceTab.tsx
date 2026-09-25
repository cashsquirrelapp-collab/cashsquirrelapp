import { privateCache } from '../../services/privateCache';
import { imageFileToDataUrl } from '../../services/images';
import { readInvoices, saveCloud } from '../../services/cloud';
import { validateChanges } from '../../../../shared/validation';
import React, { useState, useEffect } from 'react';
import { Job, Invoice, InvoiceItem, InvoiceProfile, DocumentType } from '../../../../shared/types';
import { THAI_BANKS, findThaiBank } from './thaiBanks';
import { DocumentPreview, DOCUMENT_TYPES, DEFAULT_LOGO_HEIGHT, MIN_LOGO_HEIGHT, MAX_LOGO_HEIGHT, DEFAULT_BANNER_HEIGHT, MIN_BANNER_HEIGHT, MAX_BANNER_HEIGHT, calculateDocumentTotals, getDocumentMeta, printDocument } from './DocumentA4';
import { formatCurrency } from '../../utils';
import NumberInput from '../../components/ui/NumberInput';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Plus, 
  Trash2, 
  Printer, 
  Settings, 
  ChevronRight, 
  ArrowLeft, 
  Copy, 
  Check, 
  User, 
  Building, 
  Calendar, 
  DollarSign,
  Briefcase,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Upload,
  Phone,
  Mail
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';

// Upload box for the logo / signature images kept on the issuer profile
const BrandImageField: React.FC<{
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
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'create' | 'issuer_profile'>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | DocumentType>('all');

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
  const [bankOtherMode, setBankOtherMode] = useState(false);

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

  // Save issuer profile
  const handleSaveIssuerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    privateCache.setItem(issuerKey, JSON.stringify(issuerProfile));
    try { if (ownerId) await saveCloud(ownerId, { issuer_profile: issuerProfile }); }
    catch (error: any) { triggerAlert('บันทึกข้อมูลไม่สำเร็จ', error.message); return; }
    triggerAlert('บันทึกสำเร็จ', 'บันทึกข้อมูลผู้ถือบิล/ผู้ออกบิลเรียบร้อยแล้ว ข้อมูลนี้จะถูกนำไปใช้เป็นค่าเริ่มต้นในบิลใบถัดไป');
    setActiveSubTab('list');
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
    setEditingInvoiceId(null);
    setActiveSubTab('list');
  };

  // Delete invoice
  const handleDeleteInvoice = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
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
  const handleStartEditInvoice = (inv: Invoice, event: React.MouseEvent) => {
    event.stopPropagation();
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

  // Sample document for the live header preview in the profile tab (uses the unsaved profile)
  const livePreviewInvoice: Invoice = {
    id: 'live-preview',
    documentType: 'invoice',
    documentNo: 'INV-2026-001',
    createdDate: new Date().toISOString().split('T')[0],
    issuer: issuerProfile,
    client: { name: 'ชื่อลูกค้าตัวอย่าง', address: 'ที่อยู่ลูกค้าตัวอย่าง', phone: '', email: '', taxId: '' },
    items: [{ id: 'p1', description: 'รายการตัวอย่าง', quantity: 1, price: 1000 }],
    vatRate: 0,
    whtRate: 0
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
      headerImageUrl: issuerProfile.headerImageUrl || inv.issuer.headerImageUrl,
      headerImageHeight: issuerProfile.headerImageUrl ? issuerProfile.headerImageHeight : inv.issuer.headerImageHeight,
      signatureUrl: issuerProfile.signatureUrl || inv.issuer.signatureUrl,
      // documents made before any bank details were saved pick up the current ones
      ...(inv.issuer.bankAccount ? {} : { bankName: issuerProfile.bankName, bankAccount: issuerProfile.bankAccount, bankAccountName: issuerProfile.bankAccountName })
    }
  });

  // Copy details of an invoice to make a new one
  const handleDuplicateInvoice = (inv: Invoice, event: React.MouseEvent) => {
    event.stopPropagation();
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

  // Sync selected invoice on load if none selected
  useEffect(() => {
    if (invoices.length > 0 && !selectedInvoice) {
      setSelectedInvoice(invoices[0]);
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

  return (
    <div className="page-content app-tab-enter space-y-6 pb-16">
      {(storageError || saving || (ownerId && localStorage.getItem('remix_invoices'))) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 text-xs no-print" role="status">
          {(storageError || saving) && <span className={storageError ? 'text-red-600' : 'text-brand-muted'}>{storageError || 'กำลังบันทึกเอกสาร…'}</span>}
          {ownerId && localStorage.getItem('remix_invoices') && <button type="button" onClick={importLegacy} className="font-bold text-[#E65F2B]">นำเข้าเอกสารเดิมจากเครื่อง</button>}
        </div>
      )}
      
      {/* Navigation Sub-Tabs Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-brand-border pb-4 no-print">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('list')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              activeSubTab === 'list'
                ? 'bg-[#E65F2B] text-white'
                : 'bg-brand-white dark:bg-stone-900 text-brand-muted hover:text-brand-text border border-brand-border/60'
            }`}
          >
            รายการเอกสารทั้งหมด ({invoices.length})
          </button>
          <button
            onClick={handleOpenCreateForm}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'create'
                ? 'bg-[#E65F2B] text-white'
                : 'bg-brand-white dark:bg-stone-900 text-brand-muted hover:text-brand-text border border-brand-border/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ออกเอกสารใหม่</span>
          </button>
          <button
            onClick={() => setActiveSubTab('issuer_profile')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'issuer_profile'
                ? 'bg-[#E65F2B] text-white'
                : 'bg-brand-white dark:bg-stone-900 text-brand-muted hover:text-brand-text border border-brand-border/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>ข้อมูลโปรไฟล์ของฉัน</span>
          </button>
        </div>

        {activeSubTab === 'list' && selectedInvoice && (
          <button
            onClick={handlePrintDocument}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-102 active:scale-98"
          >
            <Printer className="w-4 h-4 animate-pulse" />
            <span>พิมพ์ / บันทึกเป็น PDF</span>
          </button>
        )}
      </div>

      {/* Cute Squirrel Guide Box */}
      <div className="bg-orange-50/50 dark:bg-orange-950/10 border border-orange-100/60 dark:border-orange-500/10 p-4 rounded-3xl flex items-center gap-4 no-print shadow-xs">
        <Mascot mood="wave" size={72} className="shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-black text-orange-900 dark:text-orange-300">คู่มือออกเอกสารจากคุณกระรอก</h4>
          <p className="text-[10px] text-orange-800/80 dark:text-orange-400/80 leading-relaxed">
            ยินดีต้อนรับสู่ระบบออกบิลแสนสะดวกครับ! คุณสามารถเลือกดึงข้อมูลจากดีลงานได้ทันทีโดยไม่ต้องเสียเวลากรอกเอง และแนะนำให้ใส่ข้อมูลบัญชีโอนเงินที่แท็บ <span className="font-extrabold text-[#E65F2B]">"ข้อมูลโปรไฟล์ของฉัน"</span> เพื่อเป็นค่าเริ่มต้นสำหรับเอกสารทุกใบครับ! เมื่อออกเอกสารเสร็จแล้ว สามารถกดพิมพ์หรือเลือกปลายทางเป็น Save as PDF เพื่อนำส่งลูกค้าได้ทันที
          </p>
        </div>
      </div>

      {/* SUB-TAB 1: DOCUMENTS LIST & LIVE PREVIEW GRID */}
      {activeSubTab === 'list' && (
        <div className="app-subtab-enter grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: List of saved documents (5 cols) */}
          <div className="lg:col-span-5 space-y-4 no-print">
            <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
              ประวัติและเอกสารออกบิลของคุณ
            </h3>

            {/* Document type filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all', label: 'ทั้งหมด' },
                { key: 'quotation', label: 'ใบเสนอราคา' },
                { key: 'invoice', label: 'ใบแจ้งหนี้' },
                { key: 'receipt', label: 'ใบเสร็จรับเงิน' },
                { key: 'taxInvoice', label: 'ใบกำกับภาษี' },
                { key: 'receiptTaxInvoice', label: 'ใบเสร็จ/ใบกำกับภาษี' },
              ] as const).map(f => {
                const count = f.key === 'all' ? invoices.length : invoices.filter(inv => inv.documentType === f.key).length;
                const isActive = docTypeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setDocTypeFilter(f.key)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#E65F2B] text-white'
                        : 'bg-brand-white dark:bg-stone-900 text-brand-muted hover:text-brand-text border border-brand-border/60'
                    }`}
                  >
                    {f.label} ({count})
                  </button>
                );
              })}
            </div>

            {invoices.length === 0 ? (
              <div className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-3xl p-8 text-center text-brand-muted flex flex-col items-center">
                <Mascot mood="sleepy" size={100} className="mx-auto mb-3" />
                <p className="text-xs font-bold">ยังไม่มีการออกเอกสารบิล</p>
                <p className="text-[10px] mt-1">คลิกปุ่ม "ออกเอกสารใหม่" ด้านบนเพื่อเริ่มทำใบแจ้งหนี้หรือใบเสร็จรับเงินใบแรกของคุณ</p>
              </div>
            ) : invoices.filter(inv => docTypeFilter === 'all' || inv.documentType === docTypeFilter).length === 0 ? (
              <div className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-3xl p-8 text-center text-brand-muted flex flex-col items-center">
                <Mascot mood="sleepy" size={80} className="mx-auto mb-3" />
                <p className="text-xs font-bold">ยังไม่มีเอกสารประเภทนี้</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[700px] overflow-y-auto no-scrollbar">
                {invoices.filter(inv => docTypeFilter === 'all' || inv.documentType === docTypeFilter).map((inv) => {
                  const isSelected = selectedInvoice?.id === inv.id;
                  const totals = calculateTotals(inv.items, inv.vatRate, inv.whtRate);
                  
                  return (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center ${
                        isSelected
                          ? 'bg-blue-acc/10 border-[#E65F2B] dark:border-[#FFA473] shadow-xs'
                          : 'bg-brand-white hover:bg-brand-faint/45 dark:bg-stone-900 border-brand-border/60'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                            inv.documentType === 'invoice'
                              ? 'bg-[#E65F2B]/15 text-[#E65F2B] dark:text-[#FFA473]'
                              : getDocumentMeta(inv.documentType).isReceipt
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                          }`}>
                            {getDocumentMeta(inv.documentType).th}
                          </span>
                          <span className="text-xs font-black text-brand-text dark:text-white truncate font-mono">
                            #{inv.documentNo}
                          </span>
                        </div>
                        <p className="text-[11px] font-bold text-brand-muted dark:text-stone-300 truncate">
                          {inv.client.name}
                        </p>
                        <p className="text-[10px] text-brand-muted/70 flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3" /> {inv.createdDate}
                        </p>
                      </div>

                      <div className="text-right flex flex-col items-end shrink-0 gap-1.5">
                        <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(totals.grandTotal)}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleStartEditInvoice(inv, e)}
                            title="แก้ไขข้อมูลบิลใบนี้"
                            className="p-1.5 rounded-lg hover:bg-brand-border/30 dark:hover:bg-stone-800 text-brand-muted hover:text-[#E65F2B] transition-all cursor-pointer border border-brand-border/10"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDuplicateInvoice(inv, e)}
                            title="คัดลอกโคลนข้อมูลบิลนี้"
                            className="p-1.5 rounded-lg hover:bg-brand-border/30 dark:hover:bg-stone-800 text-brand-muted hover:text-indigo-500 transition-all cursor-pointer border border-brand-border/10"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteInvoice(inv.id, e)}
                            title="ลบเอกสารใบนี้ถาวร"
                            className="p-1.5 rounded-lg hover:bg-pink-bg/85 dark:hover:bg-[#351C15] text-pink-acc hover:text-[#FFA473] transition-all cursor-pointer border border-pink-acc/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Full beautiful printed-sheet preview (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider no-print">
              พรีวิวบิลใบแจ้งหนี้ / ใบเสร็จจริง
            </h3>

            {selectedInvoice ? (
              <div className="space-y-3">
                <div className="p-1 bg-brand-white/40 dark:bg-stone-900/40 rounded-xl flex items-center justify-between px-3 text-[10px] text-brand-muted font-black border border-brand-border/30 no-print">
                  <span>แนะนำวิธีเซฟ PDF: คลิกปุ่มพิมพ์ขวาบน แล้วเลือกปลายทางเป็น "บันทึกเป็น PDF (Save as PDF)"</span>
                </div>

                <DocumentPreview invoice={withCurrentBranding(selectedInvoice)} />
              </div>
            ) : (
              <div className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-3xl p-12 text-center text-brand-muted flex flex-col items-center justify-center min-h-[400px]">
                <Mascot mood="happy" size={100} className="mx-auto mb-4" />
                <p className="text-xs font-bold">เลือกบิลในตารางด้านซ้ายเพื่อพรีวิวและเซฟเป็น PDF</p>
                <p className="text-[10px] mt-1 max-w-sm">หรือหากยังไม่มีเอกสาร ให้กดปุ่ม "ออกเอกสารใหม่" ด้านซ้ายเพื่อกรอกข้อมูลให้เสร็จสรรพ</p>
              </div>
            )}
          </div>

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
                {DOCUMENT_TYPES.map(type => (
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
                    onChange={(e) => setWhtRate(parseInt(e.target.value) || 0)}
                    className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
                  >
                    <option value={0}>ไม่มีการหัก ณ ที่จ่าย</option>
                    <option value={1}>หัก ณ ที่จ่ายค่าขนส่ง (1%)</option>
                    <option value={3}>หัก ณ ที่จ่ายฟรีแลนซ์/บริการ (3%)</option>
                    <option value={5}>หัก ณ ที่จ่ายค่าเช่า/โฆษณา (5%)</option>
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

      {/* SUB-TAB 3: DEFAULT ISSUER PROFILE SETTING */}
      {activeSubTab === 'issuer_profile' && (
        <form onSubmit={handleSaveIssuerProfile} className="app-subtab-enter bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-3xl p-6 shadow-sm space-y-5 no-print">
          
          <div className="flex items-center gap-2 border-b border-brand-border pb-3.5">
            <div className="p-2 bg-indigo-50 dark:bg-stone-950 rounded-xl text-indigo-600 dark:text-indigo-400">
              <User className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                ข้อมูลส่วนตัวผู้ถือรับเงิน / ผู้ออกบิลใบเสร็จ (Default Issuer)
              </h3>
              <p className="text-[9px] text-brand-muted mt-0.5">
                กรอกข้อมูลส่วนตัวหรือห้างหุ้นส่วนของคุณ เพียงครั้งเดียว เพื่อนำไปใช้เป็นค่าเริ่มต้นเมื่อกดออกบิลใหม่
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            {/* Live header preview -- redraws on every change, before anything is saved */}
            <div className="md:col-span-12 sticky top-2 z-20 rounded-2xl border border-[#E65F2B]/30 bg-brand-white dark:bg-stone-900 p-3 shadow-md" data-testid="header-live-preview">
              <p className="mb-2 text-[10px] font-black text-[#E65F2B]">ตัวอย่างส่วนหัวเอกสาร (เปลี่ยนตามที่คุณปรับทันที)</p>
              <div className="overflow-hidden rounded-xl border border-brand-border/60 bg-stone-200">
                <DocumentPreview invoice={livePreviewInvoice} crop={400} maxScale={0.8} />
              </div>
            </div>

            {/* Company logo + signature (printed on every document) */}
            <BrandImageField
              title="โลโก้บริษัท / แบรนด์ของคุณ (Company Logo)"
              hint="โลโก้นี้จะปรากฏที่มุมบนซ้ายของเอกสารทุกประเภท และเป็นตราประทับผู้ขาย"
              emptyLabel="ไม่มีโลโก้"
              uploadLabel="อัปโหลดภาพโลโก้"
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
              title="แบนเนอร์หัวเอกสาร (ออกแบบส่วนหัวเอง)"
              hint="อัปโหลดภาพส่วนหัวที่คุณออกแบบเอง (โลโก้ ชื่อร้าน ข้อมูลติดต่อ ฯลฯ) ภาพจะแสดงเต็มความกว้างด้านบนของเอกสาร และใช้แทนตำแหน่งโลโก้ ควรเป็นภาพแนวนอน"
              emptyLabel="ไม่มีแบนเนอร์"
              uploadLabel="อัปโหลดแบนเนอร์"
              removeLabel="ลบแบนเนอร์"
              value={issuerProfile.headerImageUrl}
              onChange={(headerImageUrl) => setIssuerProfile(prev => ({ ...prev, headerImageUrl }))}
              onError={triggerAlert}
              size={{
                label: 'ความสูงแบนเนอร์บนเอกสาร',
                value: issuerProfile.headerImageHeight || DEFAULT_BANNER_HEIGHT,
                min: MIN_BANNER_HEIGHT,
                max: MAX_BANNER_HEIGHT,
                onChange: (headerImageHeight) => setIssuerProfile(prev => ({ ...prev, headerImageHeight }))
              }}
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
            <p className="md:col-span-12 text-[10px] font-bold text-[#E65F2B]">* หลังอัปโหลดรูป อย่าลืมกดปุ่มบันทึกด้านล่างสุดของหน้านี้ รูปจึงจะถูกเก็บและแสดงบนเอกสาร</p>

            {/* Issuer Name */}
            <div className="md:col-span-6 flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">ชื่อ-นามสกุล ของคุณ หรือ บริษัท</label>
              <input
                type="text"
                value={issuerProfile.name}
                onChange={(e) => setIssuerProfile({ ...issuerProfile, name: e.target.value })}
                placeholder="เช่น นายออมสิน ดีแท้ หรือ บริษัท สัญญารัก จำกัด"
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>

            {/* Issuer Tax ID */}
            <div className="md:col-span-6 flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">เลขผู้เสียภาษี (บุคคลธรรมดา หรือ นิติบุคคล)</label>
              <input
                type="text"
                value={issuerProfile.taxId}
                onChange={(e) => setIssuerProfile({ ...issuerProfile, taxId: e.target.value })}
                placeholder="เลขผู้เสียภาษี 13 หลัก"
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
            </div>

            {/* Issuer Address */}
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

            {/* Phone */}
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

            {/* Email */}
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

            {/* Divider */}
            <div className="md:col-span-12 border-t border-brand-border/40 my-2 pt-2">
              <h4 className="text-[11px] font-black text-brand-text dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>ช่องทางรับโอนเงินของฉัน</span>
              </h4>
            </div>

            {/* Bank Name */}
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

            {/* Bank Account */}
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

            {/* Bank Account Name */}
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


            {/* Website (printed under the contact details) */}
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

          <div className="pt-3 flex gap-3 border-t border-brand-border/40">
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#E65F2B] hover:bg-[#A63F1B] text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>บันทึกตั้งค่าโปรไฟล์</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('list')}
              className="px-5 py-2.5 bg-brand-faint hover:bg-brand-border/40 text-brand-text dark:bg-stone-950 dark:hover:bg-stone-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              ยกเลิก
            </button>
          </div>

        </form>
      )}

    </div>
  );
};

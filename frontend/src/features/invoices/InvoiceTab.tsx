import { privateCache } from '../../services/privateCache';
import { imageFileToDataUrl } from '../../services/images';
import { readInvoices, saveCloud } from '../../services/cloud';
import { validateChanges } from '../../../../shared/validation';
import React, { useState, useEffect } from 'react';
import { Job, Invoice, InvoiceItem, InvoiceProfile } from '../../../../shared/types';
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
  Upload
} from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';

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
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'quotation' | 'invoice' | 'receipt'>('all');

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
  const [docType, setDocType] = useState<'invoice' | 'receipt' | 'quotation'>('invoice');
  const [docNo, setDocNo] = useState('');
  const [createdDate, setCreatedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientTaxId, setClientTaxId] = useState('');
  
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
    setInvoiceItems([...invoiceItems, { id: newId, description: '', quantity: 1, price: 0 }]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (invoiceItems.length <= 1) {
      triggerAlert('ไม่สามารถลบได้', 'อย่างน้อยต้องมีรายการสินค้าหรือบริการอย่างน้อย 1 รายการ');
      return;
    }
    setInvoiceItems(invoiceItems.filter(item => item.id !== id));
  };

  const handleItemFieldChange = (id: string, field: 'description' | 'quantity' | 'price', value: any) => {
    setInvoiceItems(invoiceItems.map(item => {
      if (item.id === id) {
        if (field === 'quantity') {
          return { ...item, quantity: Math.max(1, parseInt(value) || 1) };
        }
        if (field === 'price') {
          return { ...item, price: Math.max(0, parseFloat(value) || 0) };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // Calculate Subtotal, VAT, WHT, Grand total
  const calculateTotals = (itemsList: InvoiceItem[], vat: number, wht: number) => {
    const subtotal = itemsList.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const vatAmount = vat > 0 ? subtotal * (vat / 100) : 0;
    const whtAmount = wht > 0 ? subtotal * (wht / 100) : 0;
    const grandTotal = subtotal + vatAmount - whtAmount;
    return { subtotal, vatAmount, whtAmount, grandTotal };
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
      issuer: issuerProfile,
      client: {
        name: clientName,
        address: clientAddress,
        phone: clientPhone,
        email: clientEmail,
        taxId: clientTaxId
      },
      items: invoiceItems,
      vatRate: vatRate,
      whtRate: whtRate,
      note: docNote,
      paymentTerm: paymentTerm || undefined,
      deliveryTerm: deliveryTerm || undefined,
      refNo: refNo || undefined
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
    setClientName('');
    setClientAddress('');
    setClientPhone('');
    setClientEmail('');
    setClientTaxId('');
    setInvoiceItems([{ id: '1', description: '', quantity: 1, price: 0 }]);
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
        setInvoiceItems([{ id: '1', description: '', quantity: 1, price: 0 }]);
        setVatRate(0);
        setWhtRate(0);
        setDocNote('กรุณาโอนเงินเข้าบัญชีตามที่ระบุ และส่งหลักฐานมาทางอีเมล ขอบคุณครับ');
        setPaymentTerm('');
        setDeliveryTerm('');
        setRefNo('');
        setSelectedJobId('');
        
        // Reset doc selection and generate new number if in create mode
        if (!editingInvoiceId) {
          const thaiYear = new Date().getFullYear() + 543;
          const serial = String(invoices.length + 1).padStart(3, '0');
          if (docType === 'invoice') {
            setDocNo(`INV-${thaiYear}-${serial}`);
          } else if (docType === 'receipt') {
            setDocNo(`REC-${thaiYear}-${serial}`);
          } else if (docType === 'quotation') {
            setDocNo(`QT-${thaiYear}-${serial}`);
          }
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
    setClientName(inv.client.name);
    setClientAddress(inv.client.address || '');
    setClientPhone(inv.client.phone || '');
    setClientEmail(inv.client.email || '');
    setClientTaxId(inv.client.taxId || '');
    setInvoiceItems(inv.items);
    setVatRate(inv.vatRate);
    setWhtRate(inv.whtRate);
    setDocNote(inv.note || '');
    setPaymentTerm(inv.paymentTerm || '');
    setDeliveryTerm(inv.deliveryTerm || '');
    setRefNo(inv.refNo || '');
    setActiveSubTab('create');
  };

  // Copy details of an invoice to make a new one
  const handleDuplicateInvoice = (inv: Invoice, event: React.MouseEvent) => {
    event.stopPropagation();
    const thaiYear = new Date().getFullYear() + 543;
    const serial = String(invoices.length + 1).padStart(3, '0');
    const duplicated: Invoice = {
      ...inv,
      id: crypto.randomUUID(),
      documentNo: `INV-${thaiYear}-${serial}`,
      createdDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };
    saveInvoicesToStorage([duplicated, ...invoices]);
    setSelectedInvoice(duplicated);
    triggerAlert('คัดลอกบิลสำเร็จ', `สร้างเอกสารใบใหม่โดยคัดลอกโครงร่างจากใบ ${inv.documentNo} เรียบร้อยแล้ว`);
  };

  // handlePrintDocument builds a full HTML document via string interpolation and writes it into
  // a same-origin window with document.write -- every user-editable field going in (client/issuer
  // name/address/contact info, bank details, item descriptions, notes, document numbers) has to
  // go through this first, or a client/issuer name like `<script>...</script>` would execute in
  // that window with access to this app's own origin (including whatever the Supabase session is
  // stored in), not just render as inert text.
  const escapeHtml = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  };

  // Native Vector PDF export (Opens in a new window to bypass iframe print sandbox limitations, ensuring perfect Thai fonts)
  const handlePrintDocument = () => {
    if (!selectedInvoice) return;

    // Build the clean printed HTML with beautiful layout and Google Font (Sarabun)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      triggerAlert(
        'ป็อปอัปถูกบล็อก',
        'เบราว์เซอร์ของคุณบล็อกป็อปอัป กรุณาอนุญาตการแสดงป็อปอัปสำหรับเว็บไซต์นี้เพื่อให้สามารถพิมพ์หรือบันทึก PDF ในหน้าต่างใหม่ได้'
      );
      return;
    }

    const docTypeLabel = selectedInvoice.documentType === 'invoice' 
      ? 'ใบแจ้งหนี้' 
      : selectedInvoice.documentType === 'receipt' 
      ? 'ใบเสร็จรับเงิน' 
      : 'ใบเสนอราคา';

    const docTypeEng = selectedInvoice.documentType === 'invoice' 
      ? 'INVOICE' 
      : selectedInvoice.documentType === 'receipt' 
      ? 'RECEIPT' 
      : 'QUOTATION';

    const docTitle = `${docTypeLabel}_${escapeHtml(selectedInvoice.documentNo)}`;
    
    const sTotals = calculateTotals(selectedInvoice.items, selectedInvoice.vatRate, selectedInvoice.whtRate);
    
    // One row per actual item -- no filler rows padded on for a document with only a
    // handful of items. A short items list should just look short, not stretched out.
    let itemRows = '';

    selectedInvoice.items.forEach((item, i) => {
      itemRows += `
        <tr style="border-bottom: 1px solid #e5e7eb; font-size: 10.5px;">
          <td style="padding: 7px 10px; text-align: center; color: #6b7280; font-family: monospace; border-right: 1px solid #f3f4f6;">${i + 1}</td>
          <td style="padding: 7px 10px; font-weight: 600; color: #111827; line-height: 1.35; border-right: 1px solid #f3f4f6;">${escapeHtml(item.description) || '-'}</td>
          <td style="padding: 7px 10px; text-align: right; font-weight: bold; font-family: monospace; border-right: 1px solid #f3f4f6;">${item.quantity}</td>
          <td style="padding: 7px 10px; text-align: right; font-family: monospace; border-right: 1px solid #f3f4f6;">${formatCurrency(item.price).replace('฿', '')}</td>
          <td style="padding: 7px 10px; text-align: right; font-weight: bold; font-family: monospace; color: #111827;">${formatCurrency(item.quantity * item.price).replace('฿', '')}</td>
        </tr>
      `;
    });

    const bankSection = selectedInvoice.documentType !== 'quotation' ? `
      <div style="margin-top: 0;">
        <p style="font-size: 8px; font-weight: bold; color: #9ca3af; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.05em;">ช่องทางการชำระเงิน / PAYMENT CHANNELS</p>
        <div style="display: flex; gap: 15px; font-size: 10px; font-weight: bold; color: #374151; margin-bottom: 6px;">
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" ${!selectedInvoice.issuer.bankAccount ? 'checked' : ''} disabled style="margin: 0; transform: scale(0.95);" />
            <span>เงินสด (Cash)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" disabled style="margin: 0; transform: scale(0.95);" />
            <span>บัตรเครดิต (Credit Card)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" ${selectedInvoice.issuer.bankAccount ? 'checked' : ''} disabled style="margin: 0; transform: scale(0.95);" />
            <span>โอนเงินผ่านบัญชีธนาคาร (Bank Transfer)</span>
          </label>
        </div>
        ${selectedInvoice.issuer.bankAccount ? `
          <div style="padding: 8px 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 10px; margin-top: 4px; display: inline-block;">
            <div style="font-weight: bold; color: #111827;">ธนาคาร: ${escapeHtml(selectedInvoice.issuer.bankName)}</div>
            <div style="color: #4b5563; margin-top: 2px;">
              เลขที่บัญชี: <span style="font-family: monospace; font-weight: bold; color: #000; font-size: 12px;">${escapeHtml(selectedInvoice.issuer.bankAccount)}</span>
            </div>
            <div style="color: #6b7280; font-weight: 500; margin-top: 2px;">
              ชื่อบัญชี: ${escapeHtml(selectedInvoice.issuer.bankAccountName || selectedInvoice.issuer.name)}
            </div>
          </div>
        ` : ''}
      </div>
    ` : '';

    const noteSection = selectedInvoice.note ? `
      <div style="font-size: 10.5px; margin-top: 8px;">
        <p style="font-size: 8px; font-weight: bold; color: #9ca3af; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.05em;">หมายเหตุ / REMARK</p>
        <p style="color: #4b5563; font-style: italic; margin: 0; white-space: pre-line; line-height: 1.35;">${escapeHtml(selectedInvoice.note)}</p>
      </div>
    ` : '';

    const vatRowHtml = selectedInvoice.vatRate > 0 ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #4b5563;">
        <span>ภาษีมูลค่าเพิ่ม VAT ${selectedInvoice.vatRate}%:</span>
        <span style="font-family: monospace;">${formatCurrency(sTotals.vatAmount).replace('฿', '')}</span>
      </div>
    ` : '';

    const whtRowHtml = selectedInvoice.whtRate > 0 ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; color: #ef4444;">
        <span style="font-weight: 600;">หัก ณ ที่จ่าย ${selectedInvoice.whtRate}%:</span>
        <span style="font-family: monospace;">-${formatCurrency(sTotals.whtAmount).replace('฿', '')}</span>
      </div>
    ` : '';

    const dueDateLabel = selectedInvoice.documentType === 'invoice'
      ? 'ครบกำหนดชำระ:'
      : selectedInvoice.documentType === 'receipt'
      ? 'วันที่รับเงิน:'
      : 'ยืนยันราคาถึง:';

    const dueDateColor = selectedInvoice.documentType === 'invoice' ? '#ef4444' : '#111827';

    let leftSignatureLabel = 'ผู้อนุมัติเสนอราคา / Authorized Signature';
    let rightSignatureLabel = 'ผู้รับใบเสนอราคา / Accepted By';
    
    if (selectedInvoice.documentType === 'invoice') {
      leftSignatureLabel = 'ผู้ออกใบแจ้งหนี้ / Issued By';
      rightSignatureLabel = 'ผู้รับใบแจ้งหนี้ / Received By';
    } else if (selectedInvoice.documentType === 'receipt') {
      leftSignatureLabel = 'ผู้รับเงิน / Receiver Signature';
      rightSignatureLabel = 'ผู้จ่ายเงิน / Paid By';
    }

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${docTitle}</title>
          <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @media print {
              @page {
                size: A4;
                margin: 12mm;
              }
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            body {
              font-family: 'Sarabun', 'Inter', sans-serif;
              color: #1f2937;
              background-color: #ffffff;
              margin: 0;
              padding: 8px;
              line-height: 1.35;
            }
            .page-container {
              max-width: 800px;
              margin: 0 auto;
              position: relative;
              transform-origin: top center;
            }
            .header-bar {
              height: 4px;
              background-color: #e65f2b;
              width: 100%;
              margin-bottom: 12px;
              border-radius: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
            }
            th {
              background-color: #f9fafb;
              color: #4b5563;
              font-weight: bold;
              border-bottom: 1px solid #e5e7eb;
              border-right: 1px solid #e5e7eb;
              padding: 7px 10px;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.02em;
            }
            th:last-child {
              border-right: none;
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <div class="header-bar"></div>
            
            <!-- 1. Header Row (Title on Left, Logo on Right) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e65f2b; padding-bottom: 10px; gap: 20px;">
              <div>
                <h1 style="font-size: 21px; font-weight: 800; color: #111827; margin: 0; letter-spacing: 0.01em; font-family: 'Sarabun', sans-serif;">
                  ${docTypeLabel}
                </h1>
                <p style="color: #e65f2b; font-weight: 800; font-size: 10px; margin: 2px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em;">
                  ${docTypeEng}
                </p>
              </div>
              <div style="text-align: right;">
                ${selectedInvoice.issuer.logoUrl ? `
                  <img src="${escapeHtml(selectedInvoice.issuer.logoUrl)}" style="max-height: 48px; max-width: 180px; object-fit: contain;" alt="Logo" />
                ` : `
                  <div style="font-size: 16px; font-weight: 800; color: #e65f2b; letter-spacing: 0.05em; max-width: 220px; word-wrap: break-word;">
                    ${escapeHtml(selectedInvoice.issuer.name) || '-'}
                  </div>
                `}
              </div>
            </div>

            <!-- 2. Issuer & Document Info side-by-side with high-quality spacing -->
            <div style="display: flex; justify-content: space-between; gap: 24px; margin-top: 12px; font-size: 10.5px; line-height: 1.4;">
              
              <!-- Left: ISSUER -->
              <div style="flex: 1.3;">
                <p style="color: #9ca3af; font-weight: bold; font-size: 8px; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.05em;">ผู้ให้บริการ / ผู้ออกเอกสาร (ISSUER)</p>
                <div style="font-weight: 800; font-size: 13px; color: #111827;">${escapeHtml(selectedInvoice.issuer.name) || '-'}</div>
                ${selectedInvoice.issuer.address ? `<div style="font-size: 11px; color: #4b5563; margin-top: 4px; white-space: pre-line; line-height: 1.4;">${escapeHtml(selectedInvoice.issuer.address)}</div>` : ''}
                <div style="font-size: 11px; color: #4b5563; margin-top: 6px;">
                  ${selectedInvoice.issuer.taxId ? `<div>เลขประจำตัวผู้เสียภาษี: <span style="font-family: monospace; font-weight: bold; color: #111827;">${escapeHtml(selectedInvoice.issuer.taxId)}</span></div>` : ''}
                  ${selectedInvoice.issuer.phone || selectedInvoice.issuer.email ? `
                    <div style="margin-top: 2px;">
                      ${selectedInvoice.issuer.phone ? `เบอร์โทร: ${escapeHtml(selectedInvoice.issuer.phone)}` : ''}
                      ${selectedInvoice.issuer.phone && selectedInvoice.issuer.email ? ' | ' : ''}
                      ${selectedInvoice.issuer.email ? `อีเมล: ${escapeHtml(selectedInvoice.issuer.email)}` : ''}
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Right: DOCUMENT METADATA CARD -->
              <div style="flex: 1; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background-color: #fafafa; min-width: 240px;">
                <p style="color: #9ca3af; font-weight: bold; font-size: 8px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 0.05em;">ข้อมูลเอกสาร / DOCUMENT INFO</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 0; font-size: 10.5px;">
                  <tr>
                    <td style="padding: 2px 0; font-weight: bold; color: #4b5563; width: 100px;">เลขที่เอกสาร:</td>
                    <td style="padding: 2px 0; font-family: monospace; font-weight: 800; color: #111827; text-align: right;">${escapeHtml(selectedInvoice.documentNo)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 2px 0; font-weight: bold; color: #4b5563;">วันที่ออก:</td>
                    <td style="padding: 2px 0; font-family: monospace; font-weight: 800; color: #111827; text-align: right;">${escapeHtml(selectedInvoice.createdDate)}</td>
                  </tr>
                  ${selectedInvoice.dueDate ? `
                    <tr>
                      <td style="padding: 2px 0; font-weight: bold; color: #4b5563;">${dueDateLabel}</td>
                      <td style="padding: 2px 0; font-family: monospace; font-weight: 800; color: ${dueDateColor}; text-align: right;">${escapeHtml(selectedInvoice.dueDate)}</td>
                    </tr>
                  ` : ''}
                  ${selectedInvoice.paymentTerm ? `
                    <tr>
                      <td style="padding: 2px 0; font-weight: bold; color: #4b5563;">เงื่อนไขการชำระ:</td>
                      <td style="padding: 2px 0; font-weight: bold; color: #111827; text-align: right;">${escapeHtml(selectedInvoice.paymentTerm)}</td>
                    </tr>
                  ` : ''}
                  ${selectedInvoice.documentType === 'quotation' && selectedInvoice.deliveryTerm ? `
                    <tr>
                      <td style="padding: 2px 0; font-weight: bold; color: #4b5563;">ระยะเวลาส่งมอบ:</td>
                      <td style="padding: 2px 0; font-weight: bold; color: #111827; text-align: right;">${escapeHtml(selectedInvoice.deliveryTerm)}</td>
                    </tr>
                  ` : ''}
                  ${selectedInvoice.documentType !== 'quotation' && selectedInvoice.refNo ? `
                    <tr>
                      <td style="padding: 2px 0; font-weight: bold; color: #4b5563;">อ้างอิงเลขที่:</td>
                      <td style="padding: 2px 0; font-family: monospace; font-weight: bold; color: #111827; text-align: right;">${escapeHtml(selectedInvoice.refNo)}</td>
                    </tr>
                  ` : ''}
                </table>
              </div>

            </div>

            <!-- 3. Customer Info (BILL TO) - Wide Panel, clean padding -->
            <div style="margin-top: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background-color: #fcfcfc;">
              <p style="color: #9ca3af; font-weight: bold; font-size: 8px; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 0.05em;">ลูกค้าผู้จ่ายเงิน / BILL TO</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 0; font-size: 11px;">
                <tr>
                  <td style="padding: 2px 0; font-weight: bold; color: #4b5563; width: 100px; vertical-align: top;">ชื่อลูกค้า/บริษัท:</td>
                  <td style="padding: 2px 0; font-weight: 800; color: #111827; vertical-align: top;">${escapeHtml(selectedInvoice.client.name)}</td>
                </tr>
                ${selectedInvoice.client.address ? `
                  <tr>
                    <td style="padding: 2px 0; font-weight: bold; color: #4b5563; vertical-align: top;">ที่อยู่:</td>
                    <td style="padding: 2px 0; color: #374151; white-space: pre-line; line-height: 1.4; vertical-align: top;">${escapeHtml(selectedInvoice.client.address)}</td>
                  </tr>
                ` : ''}
                <tr>
                  <td style="padding: 2px 0; font-weight: bold; color: #4b5563; vertical-align: top;">ข้อมูลติดต่อ:</td>
                  <td style="padding: 2px 0; color: #4b5563; vertical-align: top;">
                    ${selectedInvoice.client.phone ? `โทร: ${escapeHtml(selectedInvoice.client.phone)}` : ''}
                    ${selectedInvoice.client.phone && selectedInvoice.client.email ? ' | ' : ''}
                    ${selectedInvoice.client.email ? `อีเมล: ${escapeHtml(selectedInvoice.client.email)}` : ''}
                    ${selectedInvoice.client.taxId ? ` ${selectedInvoice.client.phone || selectedInvoice.client.email ? ' | ' : ''}เลขประจำตัวผู้เสียภาษี: <span style="font-family: monospace; font-weight: bold; color: #111827;">${escapeHtml(selectedInvoice.client.taxId)}</span>` : ''}
                  </td>
                </tr>
              </table>
            </div>

            <!-- 4. Items Table -->
            <div style="margin: 12px 0; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
              <table>
                <thead>
                  <tr>
                    <th style="width: 45px; text-align: center;">ลำดับ</th>
                    <th style="text-align: left;">รายละเอียดสินค้า / บริการ</th>
                    <th style="width: 60px; text-align: right;">จำนวน</th>
                    <th style="width: 100px; text-align: right;">ราคาต่อหน่วย</th>
                    <th style="width: 130px; text-align: right;">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </div>

            <!-- 5. Bottom Calculation & Details -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 12px 0; gap: 30px;">
              <div style="flex: 1.3;">
                ${bankSection}
                ${noteSection}
              </div>

              <div style="flex: 0.9; font-size: 10.5px; color: #4b5563;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span>ราคารวม (Subtotal):</span>
                  <span style="font-family: monospace; font-weight: bold; color: #111827;">${formatCurrency(sTotals.subtotal).replace('฿', '')}</span>
                </div>
                ${vatRowHtml}
                ${whtRowHtml}

                <div style="border-top: 1px solid #d1d5db; padding-top: 6px; margin-top: 6px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; background: #FDF3EC; border: 1px solid rgba(230,95,43,0.25); border-radius: 10px; padding: 8px 12px;">
                    <span style="font-size: 12px; font-weight: bold; color: #292524;">จำนวนเงินรวมทั้งสิ้น:</span>
                    <span style="font-family: monospace; font-size: 15px; font-weight: 900; color: #E65F2B;">
                      ${formatCurrency(sTotals.grandTotal).replace('฿', '')}
                    </span>
                  </div>
                </div>
                <div style="text-align: right; font-size: 9.5px; font-weight: bold; color: #6b7280; margin-top: 5px;">
                  (${thaiBahtText(sTotals.grandTotal)})
                </div>
              </div>
            </div>

            <!-- 6. Signature block -->
            <div style="display: flex; justify-content: space-between; margin-top: 26px; gap: 40px; text-align: center; font-size: 10px;">
              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <p style="color: #9ca3af; font-weight: bold; text-transform: uppercase; font-size: 8px; margin-bottom: 24px;">${leftSignatureLabel}</p>
                <div style="border-bottom: 1px dashed #9ca3af; width: 170px; margin-bottom: 4px;"></div>
                <p style="font-weight: bold; color: #111827; margin: 0;">${escapeHtml(selectedInvoice.issuer.name) || '..........................................................'}</p>
                <p style="color: #9ca3af; font-size: 9px; margin-top: 3px;">วันที่ ........ / ........ / ................</p>
              </div>

              <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                <p style="color: #9ca3af; font-weight: bold; text-transform: uppercase; font-size: 8px; margin-bottom: 24px;">${rightSignatureLabel}</p>
                <div style="border-bottom: 1px dashed #9ca3af; width: 170px; margin-bottom: 4px;"></div>
                <p style="font-weight: bold; color: #111827; margin: 0;">${escapeHtml(selectedInvoice.client.name) || '..........................................................'}</p>
                <p style="color: #9ca3af; font-size: 9px; margin-top: 3px;">วันที่ ........ / ........ / ................</p>
              </div>
            </div>

          </div>

        </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();
    const printNow = () => {
      const container = printWindow.document.querySelector<HTMLElement>('.page-container');
      if (container) {
        const maximumHeight = (297 - 24) * (96 / 25.4) - 16;
        const height = container.scrollHeight;
        if (height > maximumHeight) { const scale = maximumHeight / height; container.style.transform = `scale(${scale})`; container.style.marginBottom = `${-(height * (1-scale))}px`; }
      }
      printWindow.setTimeout(() => printWindow.print(), 150);
    };
    printWindow.onload = () => { void printWindow.document.fonts.ready.then(printNow); };
  };

  // Convert Thai Baht values to Thai Text (for standard formal invoicing)
  const thaiBahtText = (num: number): string => {
    try {
      if (num === 0) return 'ศูนย์บาทถ้วน';
      
      const numbers = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
      const positions = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
      
      const parts = num.toFixed(2).split('.');
      const integerPart = parts[0];
      const decimalPart = parts[1];
      
      let bahtStr = '';
      
      // Read integer digits
      const len = integerPart.length;
      for (let i = 0; i < len; i++) {
        const digit = parseInt(integerPart.charAt(i));
        const pos = len - i - 1;
        
        if (digit !== 0) {
          if (pos % 6 === 0 && pos > 0) {
            bahtStr += 'ล้าน';
          }
          
          let digitName = numbers[digit];
          let posName = positions[pos % 6];
          
          // Special cases for tens place
          if (pos % 6 === 1) {
            if (digit === 1) digitName = '';
            else if (digit === 2) digitName = 'ยี่';
          }
          // Special case for ones place
          if (pos % 6 === 0 && i > 0 && digit === 1 && integerPart.charAt(i - 1) !== '0') {
            digitName = 'เอ็ด';
          }
          
          bahtStr += digitName + posName;
        }
      }
      
      if (bahtStr !== '') bahtStr += 'บาท';
      
      // Read decimal parts
      if (parseInt(decimalPart) === 0) {
        bahtStr += 'ถ้วน';
      } else {
        const d1 = parseInt(decimalPart.charAt(0));
        const d2 = parseInt(decimalPart.charAt(1));
        let stangStr = '';
        
        if (d1 !== 0) {
          let name = numbers[d1];
          if (d1 === 1) name = '';
          else if (d1 === 2) name = 'ยี่';
          stangStr += name + 'สิบ';
        }
        
        if (d2 !== 0) {
          let name = numbers[d2];
          if (d2 === 1 && d1 !== 0) name = 'เอ็ด';
          stangStr += name;
        }
        bahtStr += stangStr + 'สตางค์';
      }
      
      return bahtStr;
    } catch (e) {
      return '';
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
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 text-xs no-print" role="status">
        <span className={storageError ? 'text-red-600' : 'text-brand-muted'}>{storageError || (saving ? 'กำลังบันทึกเอกสาร…' : ownerId ? 'เอกสารของบัญชีนี้ · บันทึกบนคลาวด์' : 'โหมดทดลอง · ข้อมูลชั่วคราวในเครื่อง')}</span>
        {ownerId && localStorage.getItem('remix_invoices') && <button type="button" onClick={importLegacy} className="font-bold text-[#E65F2B]">นำเข้าเอกสารเดิมจากเครื่อง</button>}
      </div>
      
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
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
                              : inv.documentType === 'receipt'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                          }`}>
                            {inv.documentType === 'invoice' ? 'ใบแจ้งหนี้' : inv.documentType === 'receipt' ? 'ใบเสร็จรับเงิน' : 'ใบเสนอราคา'}
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

                {/* Print Sheet Paper (Formed to A4 style ratio) */}
                <div className="bg-white text-black p-8 sm:p-12 border border-stone-200 shadow-xl rounded-3xl min-h-[850px] font-sans print-area relative overflow-hidden select-text text-[11px] leading-normal">
                  
                  {/* Watermark branding header -- kept dark/neutral to read as an official
                      document rather than a branded marketing piece */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-stone-900" />

                  {/* 1. Document Header Row (Title on Left, Logo on Right) */}
                  <div className="flex justify-between items-start border-b-2 border-stone-900 pb-4.5 gap-6">
                    <div className="space-y-1 min-w-0">
                      <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-wide uppercase">
                        {selectedInvoice.documentType === 'invoice'
                          ? 'ใบแจ้งหนี้'
                          : selectedInvoice.documentType === 'receipt'
                          ? 'ใบเสร็จรับเงิน'
                          : 'ใบเสนอราคา'}
                      </h1>
                      <p className="text-stone-500 font-bold tracking-wider text-[9px] uppercase">
                        {selectedInvoice.documentType === 'invoice'
                          ? 'INVOICE'
                          : selectedInvoice.documentType === 'receipt'
                          ? 'RECEIPT'
                          : 'QUOTATION'}
                      </p>
                    </div>
                    {selectedInvoice.issuer.logoUrl ? (
                      <div className="shrink-0">
                        <img
                          src={selectedInvoice.issuer.logoUrl}
                          alt="Company Logo"
                          className="max-h-14 max-w-[150px] object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="text-sm font-black text-stone-900 tracking-wider text-right shrink-0 max-w-[220px] break-words">
                        {selectedInvoice.issuer.name || '-'}
                      </div>
                    )}
                  </div>

                  {/* 2. Issuer & Document Info side-by-side with high-quality spacing */}
                  <div className="flex flex-col sm:flex-row justify-between gap-6 mt-6 text-[11px] leading-relaxed">
                    
                    {/* Left Column: ISSUER */}
                    <div className="flex-1.3 space-y-1.5">
                      <p className="text-stone-400 font-bold tracking-wider text-[8px] uppercase">ผู้ให้บริการ / ผู้ออกเอกสาร (ISSUER)</p>
                      <div className="font-extrabold text-stone-900 text-[12px]">{selectedInvoice.issuer.name || '-'}</div>
                      {selectedInvoice.issuer.address && (
                        <div className="text-[10px] text-stone-600 mt-1 whitespace-pre-line leading-relaxed">{selectedInvoice.issuer.address}</div>
                      )}
                      <div className="text-[10px] text-stone-500 space-y-0.5 pt-1">
                        {selectedInvoice.issuer.taxId && (
                          <p>เลขประจำตัวผู้เสียภาษี: <span className="font-mono font-bold text-stone-900">{selectedInvoice.issuer.taxId}</span></p>
                        )}
                        {(selectedInvoice.issuer.phone || selectedInvoice.issuer.email) && (
                          <p>
                            {selectedInvoice.issuer.phone && `เบอร์โทร: ${selectedInvoice.issuer.phone}`}
                            {selectedInvoice.issuer.phone && selectedInvoice.issuer.email && ' | '}
                            {selectedInvoice.issuer.email && `อีเมล: ${selectedInvoice.issuer.email}`}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right Column: DOCUMENT METADATA CARD */}
                    <div className="flex-1 p-4 bg-stone-50 border border-stone-200/80 rounded-xl min-w-[230px] space-y-2">
                      <p className="text-stone-400 font-bold tracking-wider text-[8px] uppercase">ข้อมูลเอกสาร / DOCUMENT INFO</p>
                      <table className="w-full border-collapse text-[11px]">
                        <tbody>
                          <tr>
                            <td className="p-0 py-0.5 font-bold text-stone-500 w-24">เลขที่เอกสาร:</td>
                            <td className="p-0 py-0.5 font-mono font-bold text-stone-900 text-right">{selectedInvoice.documentNo}</td>
                          </tr>
                          <tr>
                            <td className="p-0 py-0.5 font-bold text-stone-500">วันที่ออก:</td>
                            <td className="p-0 py-0.5 font-mono font-bold text-stone-900 text-right">{selectedInvoice.createdDate}</td>
                          </tr>
                          {selectedInvoice.dueDate && (
                            <tr>
                              <td className="p-0 py-0.5 font-bold text-stone-500">
                                {selectedInvoice.documentType === 'invoice' 
                                  ? 'ครบกำหนดชำระ:' 
                                  : selectedInvoice.documentType === 'receipt'
                                  ? 'วันที่รับเงิน:'
                                  : 'ยืนยันราคาถึง:'}
                              </td>
                              <td className={`p-0 py-0.5 font-mono font-black text-right ${selectedInvoice.documentType === 'invoice' ? 'text-red-600' : 'text-stone-900'}`}>
                                {selectedInvoice.dueDate}
                              </td>
                            </tr>
                          )}
                          {selectedInvoice.paymentTerm && (
                            <tr>
                              <td className="p-0 py-0.5 font-bold text-stone-500">เงื่อนไขการชำระ:</td>
                              <td className="p-0 py-0.5 font-bold text-stone-900 text-right">{selectedInvoice.paymentTerm}</td>
                            </tr>
                          )}
                          {selectedInvoice.documentType === 'quotation' && selectedInvoice.deliveryTerm && (
                            <tr>
                              <td className="p-0 py-0.5 font-bold text-stone-500">ระยะเวลาส่งมอบ:</td>
                              <td className="p-0 py-0.5 font-bold text-stone-900 text-right">{selectedInvoice.deliveryTerm}</td>
                            </tr>
                          )}
                          {selectedInvoice.documentType !== 'quotation' && selectedInvoice.refNo && (
                            <tr>
                              <td className="p-0 py-0.5 font-bold text-stone-500">อ้างอิงเลขที่:</td>
                              <td className="p-0 py-0.5 font-mono font-bold text-stone-900 text-right">{selectedInvoice.refNo}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                  </div>

                  {/* 3. Customer Info (BILL TO) - Full Width Panel, beautifully clean */}
                  <div className="mt-6 p-4.5 bg-[#fbfbfb] border border-stone-200/80 rounded-xl space-y-1.5">
                    <p className="text-stone-400 font-bold tracking-wider text-[8px] uppercase">ลูกค้าผู้จ่ายเงิน / BILL TO</p>
                    <table className="w-full border-collapse text-[11px]">
                      <tbody>
                        <tr>
                          <td className="p-0 py-0.5 font-bold text-stone-500 w-24 align-top">ชื่อลูกค้า/บริษัท:</td>
                          <td className="p-0 py-0.5 font-black text-stone-900 align-top">{selectedInvoice.client.name}</td>
                        </tr>
                        {selectedInvoice.client.address && (
                          <tr>
                            <td className="p-0 py-0.5 font-bold text-stone-500 align-top">ที่อยู่:</td>
                            <td className="p-0 py-0.5 text-stone-700 whitespace-pre-line leading-relaxed align-top">{selectedInvoice.client.address}</td>
                          </tr>
                        )}
                        <tr>
                          <td className="p-0 py-0.5 font-bold text-stone-500 align-top">ข้อมูลติดต่อ:</td>
                          <td className="p-0 py-0.5 text-stone-600 align-top">
                            {selectedInvoice.client.phone && `โทร: ${selectedInvoice.client.phone}`}
                            {selectedInvoice.client.phone && selectedInvoice.client.email && ' | '}
                            {selectedInvoice.client.email && `อีเมล: ${selectedInvoice.client.email}`}
                            {selectedInvoice.client.taxId && ` ${selectedInvoice.client.phone || selectedInvoice.client.email ? ' | ' : ''}เลขประจำตัวผู้เสียภาษี: `}
                            {selectedInvoice.client.taxId && <span className="font-mono font-bold text-stone-900">{selectedInvoice.client.taxId}</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 4. Items List Table - one row per actual item, no filler rows padded on */}
                  <div className="my-6 overflow-x-auto border border-stone-200 rounded-xl">
                    <table className="w-full min-w-[520px] border-collapse text-[10px] sm:text-[11px]">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-200">
                          <th className="py-2.5 px-3 text-center w-12 border-r border-stone-200">ลำดับ</th>
                          <th className="py-2.5 px-3 text-left border-r border-stone-200">รายละเอียดสินค้า / บริการ</th>
                          <th className="py-2.5 px-3 text-right w-16 border-r border-stone-200">จำนวน</th>
                          <th className="py-2.5 px-3 text-right w-24 border-r border-stone-200">ราคาต่อหน่วย</th>
                          <th className="py-2.5 px-3 text-right w-28">จำนวนเงิน (บาท)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.items.map((item, i) => (
                          <tr key={item.id} className="border-b border-stone-100 last:border-b-0 text-stone-800 font-medium">
                            <td className="py-3 px-3 text-center font-mono text-stone-400 border-r border-stone-100 w-12">{i + 1}</td>
                            <td className="py-3 px-3 text-left font-semibold text-stone-950 leading-relaxed border-r border-stone-100">{item.description || '(ไม่มีรายละเอียด)'}</td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-stone-900 border-r border-stone-100 w-16">{item.quantity}</td>
                            <td className="py-3 px-3 text-right font-mono text-stone-700 border-r border-stone-100 w-24">{formatCurrency(item.price).replace('฿', '')}</td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-stone-950 w-28">
                              {formatCurrency(item.quantity * item.price).replace('฿', '')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 5. Bottom Calculation & Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start my-4">
                    {/* Notes & Checkbox Payment Methods on Left */}
                    <div className="md:col-span-7 space-y-4">
                      {selectedInvoice.documentType !== 'quotation' ? (
                        <div className="space-y-2">
                          <p className="text-[8px] font-bold tracking-wider text-stone-400 uppercase">ช่องทางการชำระเงิน / PAYMENT CHANNELS</p>
                          <div className="flex flex-wrap gap-4 text-[10px] font-bold text-stone-700">
                            <label className="flex items-center gap-1.5 cursor-not-allowed">
                              <input 
                                type="checkbox" 
                                checked={!selectedInvoice.issuer.bankAccount} 
                                disabled 
                                className="w-3.5 h-3.5 rounded accent-stone-900"
                              />
                              <span>เงินสด (Cash)</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-not-allowed">
                              <input 
                                type="checkbox" 
                                checked={false} 
                                disabled 
                                className="w-3.5 h-3.5 rounded accent-stone-900"
                              />
                              <span>บัตรเครดิต (Credit Card)</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-not-allowed">
                              <input 
                                type="checkbox" 
                                checked={!!selectedInvoice.issuer.bankAccount} 
                                disabled 
                                className="w-3.5 h-3.5 rounded accent-stone-900"
                              />
                              <span>โอนผ่านบัญชี (Bank Transfer)</span>
                            </label>
                          </div>

                          {selectedInvoice.issuer.bankAccount && (
                            <div className="pl-3.5 border-l border-dashed border-stone-300 text-[10px] space-y-0.5 text-stone-600">
                              <p className="font-bold text-stone-900">{selectedInvoice.issuer.bankName}</p>
                              <p>เลขบัญชี: <span className="font-mono font-bold text-stone-950 text-[11px]">{selectedInvoice.issuer.bankAccount}</span></p>
                              <p className="text-stone-500 font-medium">ชื่อบัญชี: {selectedInvoice.issuer.bankAccountName || selectedInvoice.issuer.name}</p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {selectedInvoice.note && (
                        <div className="space-y-1 pt-1 border-t border-dashed border-stone-100">
                          <p className="text-stone-400 font-bold tracking-wider text-[8px] uppercase">หมายเหตุ / REMARK</p>
                          <p className="text-stone-600 font-medium italic leading-relaxed whitespace-pre-line">{selectedInvoice.note}</p>
                        </div>
                      )}
                    </div>

                    {/* Calculations on Right */}
                    <div className="md:col-span-5 space-y-1.5 text-stone-700 font-medium text-[11px]">
                      {(() => {
                        const sTotals = calculateTotals(selectedInvoice.items, selectedInvoice.vatRate, selectedInvoice.whtRate);
                        return (
                          <>
                            <div className="flex justify-between">
                              <span>ราคารวม (Subtotal):</span>
                              <span className="font-mono font-bold">{formatCurrency(sTotals.subtotal).replace('฿', '')}</span>
                            </div>

                            {selectedInvoice.vatRate > 0 && (
                              <div className="flex justify-between text-stone-600">
                                  <span>ภาษีมูลค่าเพิ่ม VAT {selectedInvoice.vatRate}%:</span>
                                  <span className="font-mono">{formatCurrency(sTotals.vatAmount).replace('฿', '')}</span>
                              </div>
                            )}

                            {selectedInvoice.whtRate > 0 && (
                              <div className="flex justify-between text-red-700">
                                <span>หัก ณ ที่จ่าย {selectedInvoice.whtRate}%:</span>
                                <span className="font-mono">-{formatCurrency(sTotals.whtAmount).replace('฿', '')}</span>
                              </div>
                            )}

                            {/* Classic ledger-style double rule instead of a colored badge --
                                weight and size carry the emphasis, not color, to read as an
                                official document rather than a marketing highlight */}
                            <div className="border-t-2 border-stone-900 pt-2.5 mt-2.5">
                              <div className="flex justify-between items-center border-b-2 border-stone-900 pb-2.5">
                                <span className="text-[12px] font-bold text-stone-900">จำนวนเงินรวมทั้งสิ้น:</span>
                                <span className="font-mono text-base font-black text-stone-900">
                                  {formatCurrency(sTotals.grandTotal).replace('฿', '')}
                                </span>
                              </div>
                            </div>

                            {/* Thai text translation */}
                            <div className="text-right text-[10px] font-bold text-stone-500 pt-1">
                              ({thaiBahtText(sTotals.grandTotal)})
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 6. Signature Section - Dynamic signature labels based on document type */}
                  <div className="grid grid-cols-2 gap-8 pt-12 border-t border-stone-100 mt-12 text-center text-[10px]">
                    <div className="space-y-1.5">
                      <p className="text-stone-400 font-bold uppercase tracking-wider text-[8px]">
                        {selectedInvoice.documentType === 'invoice' 
                          ? 'ผู้ออกใบแจ้งหนี้ / Issued By' 
                          : selectedInvoice.documentType === 'receipt' 
                          ? 'ผู้รับเงิน / Receiver Signature' 
                          : 'ผู้อนุมัติเสนอราคา / Authorized Signature'}
                      </p>
                      <div className="h-8 border-b border-dashed border-stone-300 max-w-[160px] mx-auto" />
                      <p className="font-bold text-stone-800">{selectedInvoice.issuer.name || '..........................................................'}</p>
                      <p className="text-stone-400 text-[9px]">วันที่ ........ / ........ / ................</p>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-stone-400 font-bold uppercase tracking-wider text-[8px]">
                        {selectedInvoice.documentType === 'invoice' 
                          ? 'ผู้รับใบแจ้งหนี้ / Received By' 
                          : selectedInvoice.documentType === 'receipt' 
                          ? 'ผู้จ่ายเงิน / Paid By' 
                          : 'ผู้รับใบเสนอราคา / Accepted By'}
                      </p>
                      <div className="h-8 border-b border-dashed border-stone-300 max-w-[160px] mx-auto" />
                      <p className="font-bold text-stone-800">{selectedInvoice.client.name || '..........................................................'}</p>
                      <p className="text-stone-400 text-[9px]">วันที่ ........ / ........ / ................</p>
                    </div>
                  </div>

                </div>
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
        <form onSubmit={handleSaveInvoice} className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-3xl p-6 shadow-sm space-y-6 no-print">
          
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
                  const val = e.target.value as 'invoice' | 'receipt' | 'quotation';
                  setDocType(val);
                  // Update prefix if current document number matches the default structure
                  const thaiYear = new Date().getFullYear() + 543;
                  const serial = String(invoices.length + 1).padStart(3, '0');
                  if (val === 'invoice') {
                    setDocNo(`INV-${thaiYear}-${serial}`);
                  } else if (val === 'receipt') {
                    setDocNo(`REC-${thaiYear}-${serial}`);
                  } else if (val === 'quotation') {
                    setDocNo(`QT-${thaiYear}-${serial}`);
                  }
                }}
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
              >
                <option value="invoice">ใบแจ้งหนี้ (Invoice)</option>
                <option value="receipt">ใบเสร็จรับเงิน (Receipt)</option>
                <option value="quotation">ใบเสนอราคา (Quotation)</option>
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
              <label className="text-[10px] font-black text-brand-muted dark:text-stone-300 uppercase">วันที่กำหนดชำระเงิน</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
              />
            </div>

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

              <div className="md:col-span-6 flex flex-col gap-1.5">
                <label className="text-[9px] font-bold text-brand-muted uppercase">เบอร์โทรศัพท์ติดต่อ</label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="เช่น 02-555-5555"
                  className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3.5 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
                />
              </div>

              <div className="md:col-span-6 flex flex-col gap-1.5">
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

                  <div className="w-full sm:w-36 shrink-0 flex gap-2 sm:block">
                    <span className="sm:hidden text-[9px] font-bold text-brand-muted self-center">ราคาต่อหน่วย:</span>
                    <NumberInput
                      value={item.price}
                      onChange={(raw) => handleItemFieldChange(item.id, 'price', raw)}
                      placeholder="ราคา (บาท)"
                      className="w-full bg-brand-white dark:bg-stone-900 border border-brand-border rounded-xl px-3 py-2 text-xs font-black font-mono text-brand-text dark:text-white outline-none focus:border-[#E65F2B] text-right"
                    />
                  </div>

                  <div className="w-full sm:w-32 text-right self-center font-mono font-bold text-xs text-brand-text dark:text-white hidden sm:block">
                    {formatCurrency(item.quantity * item.price)}
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
        <form onSubmit={handleSaveIssuerProfile} className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-3xl p-6 shadow-sm space-y-5 no-print">
          
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
            
            {/* Company Logo Upload / Selection */}
            <div className="md:col-span-12 bg-stone-50 dark:bg-stone-950/40 p-5 rounded-2xl border border-brand-border/40 space-y-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#E65F2B]/10 rounded-lg text-[#E65F2B]">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-brand-text dark:text-white uppercase">โลโก้บริษัท / แบรนด์ของคุณ (Company Logo)</h4>
                  <p className="text-[9px] text-brand-muted">โลโก้นี้จะปรากฏที่มุมบนซ้ายของใบแจ้งหนี้, ใบเสร็จรับเงิน และใบเสนอราคาของคุณเพื่อเพิ่มความน่าเชื่อถือ</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-5 items-center">
                {/* Logo Preview box */}
                <div className="w-24 h-24 border border-brand-border/60 rounded-2xl bg-white dark:bg-stone-900 flex items-center justify-center overflow-hidden shrink-0 shadow-inner relative group border-dashed">
                  {issuerProfile.logoUrl ? (
                    <>
                      <img 
                        src={issuerProfile.logoUrl} 
                        alt="Logo Preview" 
                        className="w-full h-full object-contain p-2"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIssuerProfile({ ...issuerProfile, logoUrl: '' })}
                          className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer"
                        >
                          ลบรูป
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center p-2 flex flex-col items-center gap-1">
                      <Upload className="w-5 h-5 text-brand-muted animate-bounce" />
                      <span className="text-[8px] text-brand-muted font-bold">ไม่มีโลโก้</span>
                    </div>
                  )}
                </div>

                {/* Upload & Controls */}
                <div className="flex-1 space-y-2 w-full">
                  <div className="flex flex-wrap gap-2">
                    <label className="px-4 py-2 bg-[#E65F2B] hover:bg-[#E65F2B]/90 text-white text-[10px] font-black rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-xs">
                      <Upload className="w-3.5 h-3.5" />
                      <span>อัปโหลดภาพโลโก้</span>
                      <input 
                        type="file" 
                        accept="image/png,image/jpeg,image/webp" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              triggerAlert('ไฟล์มีขนาดใหญ่เกินไป', 'กรุณาอัปโหลดภาพที่มีขนาดไม่เกิน 2MB เพื่อประสิทธิภาพที่รวดเร็ว');
                              return;
                            }
                            imageFileToDataUrl(file).then(logoUrl=>setIssuerProfile(prev=>({...prev,logoUrl}))).catch(error=>triggerAlert('อัปโหลดภาพไม่สำเร็จ',error.message));
                          }
                        }}
                      />
                    </label>

                    {issuerProfile.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setIssuerProfile({ ...issuerProfile, logoUrl: '' })}
                        className="px-3.5 py-2 bg-stone-100 hover:bg-red-50 dark:bg-stone-800 dark:hover:bg-red-950/20 text-stone-600 dark:text-stone-300 hover:text-red-600 dark:hover:text-red-400 text-[10px] font-black rounded-xl transition-all cursor-pointer"
                      >
                        ลบโลโก้
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-brand-muted leading-relaxed">
                    * รองรับ PNG, JPEG และ WebP ไม่เกิน 2MB ระบบย่อภาพก่อนบันทึก แนะนำภาพจัตุรัสหรือแนวนอน
                  </p>
                </div>
              </div>
            </div>

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
              <input
                type="text"
                value={issuerProfile.bankName}
                onChange={(e) => setIssuerProfile({ ...issuerProfile, bankName: e.target.value })}
                placeholder="เช่น ธนาคารกสิกรไทย (KBank)"
                className="bg-brand-faint dark:bg-stone-950 border border-brand-border/60 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B]"
              />
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

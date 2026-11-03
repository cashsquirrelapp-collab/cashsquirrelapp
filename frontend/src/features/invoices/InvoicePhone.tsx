import React from 'react';
import { createPortal } from 'react-dom';
import {
  Briefcase, Building2, Check, ChevronDown, ChevronRight, Copy, Download, FileCheck2, FileText, Link2, Loader2,
  Maximize2, Minus, MoreHorizontal, PenLine, Plus, Printer, ReceiptText, Share2, Trash2, X,
} from 'lucide-react';
import type { DocumentType, Invoice, InvoiceItem, InvoiceProfile, Job } from '../../../../shared/types';
import { A4_WIDTH_PX, DEFAULT_LOGO_HEIGHT, DocumentPreview, MAX_LOGO_HEIGHT, MIN_LOGO_HEIGHT, getDocumentMeta, paginateItems } from './DocumentA4';
import { getWorkspaceTab, type DocumentWorkspaceTab } from './documentAvailability';
import { canNativeShare, canShareFile } from './DocumentWorkspaceParts';
import { documentPdfName, type PdfFileState } from './documentPdf';
import { BrandImageField } from './BrandImageField';
import { THAI_BANKS, findThaiBank } from './thaiBanks';
import { BankLogo } from './BankLogo';
import { MobilePageHero } from '../mobile/MobilePageHero';
import { MobileSheet } from '../mobile/MobileHome';
import { KsIcon } from '../mobile/icons';
import NumberInput from '../../components/ui/NumberInput';
import { dateLocale, formatCurrency } from '../../utils';
import { tr, T } from '../../i18n/tr';
import { useLanguage } from '../../i18n/LanguageContext';
import './docPhone.css';

// เอกสาร on phones (owner, 2026-11-03: "มันแอบเหมือนคอม ... ใช้ยาก"; the preview canvas 1AELuDw5eab1Kk1hPNrwUm, "โอเค
// ทำจริงทั้งชุดเลย"). The same documents, rules and saving as the computer page (InvoiceTab owns all of that and hands it
// over as `m`); only the screens differ:
// - the list: the issuer row, a four-part type switch, search, documents grouped by month; the tab bar's middle button
//   becomes ออกเอกสาร here and opens a sheet of document types ("ปุ่มออกเอกสารใหม่อยู่ลึกไป ... เอามาแทนปุ่มเพิ่มงาน");
// - a document opens on its own page: the amount, the linked documents, the A4 page (full screen on a tap) and one bar
//   of actions at the bottom; the form is three steps (ลูกค้า → รายการและภาษี → ตรวจแล้วบันทึก);
// - ข้อมูลผู้ออกเอกสาร (the business profile, also in ตั้งค่า) is edited here too ("ควรไปอยู่ในส่วนของเอกสาร").
// Pages opened from the list cover the tab bar and the corner squirrel (html[data-dp-task]) and take the phone's back
// gesture (one history entry each).

import { NEW_DOCUMENT_EVENT } from './documentEvents';

type Client = Invoice['client'];
type ClientField = keyof Client;
type Totals = { subtotal: number; vatAmount: number; whtAmount: number; grandTotal: number };
type ItemField = 'description' | 'quantity' | 'price' | 'discount' | 'unit' | 'detail';

export interface DocDraft {
  editingId: string | null;
  docType: DocumentType;
  changeType: (type: DocumentType) => void;
  docNo: string; setDocNo: (value: string) => void;
  createdDate: string; setCreatedDate: (value: string) => void;
  dueDate: string; setDueDate: (value: string) => void;
  responseDate: string; setResponseDate: (value: string) => void;
  client: Client;
  setClientField: (field: ClientField, value: string) => void;
  applyClient: (client: Client) => void;
  paidDate: string; setPaidDate: (value: string) => void;
  paymentMethod: string; setPaymentMethod: (value: string) => void;
  paidAmount: number | ''; setPaidAmount: (value: number | '') => void;
  paymentTerm: string; setPaymentTerm: (value: string) => void;
  deliveryTerm: string; setDeliveryTerm: (value: string) => void;
  refNo: string; setRefNo: (value: string) => void;
  items: InvoiceItem[];
  addItem: () => void;
  removeItem: (id: string) => void;
  setItemField: (id: string, field: ItemField, value: string | number) => void;
  vatRate: number; setVatRate: (value: number) => void;
  whtRate: number; setWhtRate: (value: number) => void;
  note: string; setNote: (value: string) => void;
  totals: Totals;
  linkSource: Invoice | null;
  keepLinked: boolean;
  setKeepLinked: (keep: boolean) => void;
  selectedJobId: string;
  selectJob: (id: string) => void;
  /** The document as the form describes it, with the current logo and signature. */
  preview: () => Invoice;
  /** True when it was saved (the form then closes and the saved document is the selected one). */
  save: () => boolean;
  clear: () => void;
  close: () => void;
}

export interface InvoicePhoneModel {
  invoices: Invoice[];
  tab: DocumentWorkspaceTab;
  tabs: { key: DocumentWorkspaceTab; label: string }[];
  setTab: (tab: DocumentWorkspaceTab) => void;
  query: string;
  setQuery: (value: string) => void;
  tabInvoices: Invoice[];
  shown: Invoice[];
  selected: Invoice | null;
  open: (invoice: Invoice) => void;
  chain: Invoice[];
  branded: (invoice: Invoice) => Invoice;
  totals: (invoice: Invoice) => Totals;
  creatable: DocumentType[];
  create: (type: DocumentType) => boolean;
  issueTypes: (invoice: Invoice) => DocumentType[];
  issueFrom: (invoice: Invoice, type: DocumentType) => boolean;
  edit: (invoice: Invoice) => void;
  duplicate: (invoice: Invoice) => void;
  remove: (id: string, after: () => void) => void;
  pdf: PdfFileState;
  pdfBusy: boolean;
  downloadPdf: () => void;
  print: () => void;
  notify: (title: string, message: string) => void;
  freePlan: boolean;
  quota: { used: number; limit: number } | null;
  quotaLeft: number;
  upgradeQuota: () => void;
  storageError: string | null;
  saving: boolean;
  legacy: boolean;
  importLegacy: () => void;
  linkedFocus: boolean;
  linkFrom: string | null;
  spotlight: boolean;
  showAll: () => void;
  jobs: Job[];
  clients: Client[];
  issuer: InvoiceProfile;
  saveIssuer: (profile: InvoiceProfile) => Promise<boolean>;
  formOpen: boolean;
  draft: DocDraft;
  onMobileBack?: () => void;
}

type Screen = 'list' | 'document' | 'form' | 'issuer';

const TAB_SHORT: Record<DocumentWorkspaceTab, string> = { quotation: T("เสนอราคา"), invoice: T("แจ้งหนี้"), receipt: T("ใบเสร็จ"), taxInvoice: T("กำกับภาษี") };
const TYPE_LINE: Record<DocumentWorkspaceTab, string> = {
  quotation: T("เสนอราคาให้ลูกค้าก่อนเริ่มงาน"),
  invoice: T("แจ้งยอดที่ลูกค้าต้องชำระ และวันครบกำหนด"),
  receipt: T("ยืนยันว่าได้รับเงินจากลูกค้าแล้ว"),
  taxInvoice: T("สำหรับผู้จดทะเบียนภาษีมูลค่าเพิ่ม"),
};
const WHT_RATES = [0, 1, 3, 5];

function TypeIcon({ type, size = 19 }: { type: DocumentType; size?: number }) {
  const tab = getWorkspaceTab(type);
  const Icon = tab === 'invoice' ? ReceiptText : tab === 'receipt' ? FileCheck2 : FileText;
  return <span className={`dp-tile is-${tab}`} aria-hidden="true"><Icon size={size} strokeWidth={2} /></span>;
}

const shortDate = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: '2-digit' });
};
const monthTitle = (key: string) => {
  const date = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? tr("ไม่ระบุวันที่") : date.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
};

/** One row of a grouped form: the label on the left, the field on the right (iOS Settings style). */
function Field({ label, htmlFor, children, top = false }: { label: string; htmlFor?: string; children: React.ReactNode; top?: boolean }) {
  return (
    <div className={`dp-field${top ? ' is-top' : ''}`}>
      <label className="dp-field-label" htmlFor={htmlFor}>{label}</label>
      <div className="dp-field-input">{children}</div>
    </div>
  );
}

/** A label above its field, for long labels and dates. */
function Stacked({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="dp-stack">
      <label className="dp-stack-label" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** The bar at the bottom of a page opened from the list (the tab bar is hidden there). */
function BottomBar({ children }: { children: React.ReactNode }) {
  return createPortal(<div className="ksm dp-bar" data-krarok-avoid="actions">{children}</div>, document.body);
}

/** The document over the whole screen; a tap on the page zooms in and out. */
function Viewer({ invoice, watermark, onClose, actions }: { invoice: Invoice; watermark: boolean; onClose: () => void; actions?: React.ReactNode }) {
  const [width, setWidth] = React.useState(() => window.innerWidth);
  const [zoomed, setZoomed] = React.useState(false);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const onResize = () => setWidth(window.innerWidth);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [onClose]);
  const fit = Math.max(0.3, (Math.min(width, 720) - 24) / A4_WIDTH_PX);
  const pages = paginateItems(invoice).length;
  return createPortal(
    <div className="ksm dp-viewer" role="dialog" aria-modal="true" aria-label={tr("ดูเอกสาร {0} เต็มจอ", invoice.documentNo)} data-testid="document-fullscreen">
      <div className="dp-viewer-top">
        <button type="button" className="dp-viewer-close" onClick={onClose} aria-label={tr("ปิดเต็มจอ")} autoFocus><X size={18} strokeWidth={2.4} /></button>
        <div className="dp-viewer-title"><b>{invoice.documentNo || tr(getDocumentMeta(invoice.documentType).th)}</b><span>{pages > 1 ? tr("{0} หน้า", pages) : tr("1 หน้า")}</span></div>
        <span className="dp-viewer-spacer" aria-hidden="true" />
      </div>
      <div className={`dp-viewer-scroll${zoomed ? ' is-zoomed' : ''}`}>
        <button type="button" className="dp-viewer-page" onClick={() => setZoomed(value => !value)} aria-label={zoomed ? tr("ย่อให้พอดีจอ") : tr("ขยายเอกสาร")}>
          <DocumentPreview invoice={invoice} scale={zoomed ? fit * 2 : fit} watermark={watermark} />
        </button>
      </div>
      <p className="dp-viewer-hint">{zoomed ? tr("แตะที่เอกสารอีกครั้งเพื่อย่อให้พอดีจอ") : tr("แตะที่เอกสารเพื่อขยาย")}</p>
      {actions && <div className="dp-viewer-actions">{actions}</div>}
    </div>,
    document.body,
  );
}

/** "แชร์ให้ลูกค้า" on a phone: the PDF straight into the phone's share sheet when it can take files, else a sheet. */
function useShare(m: InvoicePhoneModel, invoice: Invoice | null) {
  const [open, setOpen] = React.useState(false);
  const pdf = m.pdf;
  const title = invoice ? `${tr(getDocumentMeta(invoice.documentType).th)} ${invoice.documentNo}` : '';
  const shareFile = async () => {
    if (!pdf.file) return;
    setOpen(false);
    try { await navigator.share({ files: [pdf.file], title }); }
    catch (error) { if ((error as Error)?.name !== 'AbortError') m.notify(tr("แชร์ไม่สำเร็จ"), tr("ลองดาวน์โหลด PDF แล้วส่งเองแทน")); }
  };
  const start = () => {
    if (canShareFile(pdf.file)) { void shareFile(); return; }
    if (!pdf.file) pdf.ensure().catch(() => undefined);
    setOpen(true);
  };
  const sheet = open && invoice && (
    <MobileSheet title={tr("แชร์เอกสาร")} onClose={() => setOpen(false)}>
      <div className="dp-card dp-sheet-list">
        {canNativeShare() && typeof navigator.canShare === 'function' && (
          <button type="button" className="dp-row" onClick={() => void shareFile()} disabled={!canShareFile(pdf.file)}>
            <span className="dp-tile is-neutral" aria-hidden="true">{pdf.file || pdf.failed ? <Share2 size={18} /> : <Loader2 size={18} className="animate-spin" />}</span>
            <span className="dp-row-text"><b>{tr("แชร์ไฟล์ PDF ผ่านแอป")}</b><span>{pdf.failed ? tr("สร้างไฟล์ไม่สำเร็จ ลองดาวน์โหลดแทน") : pdf.file && !canShareFile(pdf.file) ? tr("อุปกรณ์นี้แนบไฟล์ผ่านเมนูแชร์ไม่ได้") : pdf.file ? tr("{0} · เลือก LINE หรือแอปที่ใช้คุยกับลูกค้า", pdf.file.name) : tr("กำลังเตรียมไฟล์ PDF…")}</span></span>
          </button>
        )}
        <button type="button" className="dp-row" onClick={() => { setOpen(false); m.downloadPdf(); }}>
          <span className="dp-tile is-neutral" aria-hidden="true"><Download size={18} /></span>
          <span className="dp-row-text"><b>{tr("ดาวน์โหลด PDF")}</b><span>{tr("บันทึกไฟล์ {0} แล้วส่งเอง", documentPdfName(invoice))}</span></span>
        </button>
        <button type="button" className="dp-row" onClick={() => { setOpen(false); m.print(); }}>
          <span className="dp-tile is-neutral" aria-hidden="true"><Printer size={18} /></span>
          <span className="dp-row-text"><b>{tr("พิมพ์")}</b><span>{tr("เปิดหน้าพิมพ์ของเบราว์เซอร์")}</span></span>
        </button>
      </div>
      {!canNativeShare() && <p className="dp-note">{tr("เบราว์เซอร์นี้ไม่มีเมนูแชร์ของเครื่อง ดาวน์โหลด PDF แล้วแนบในแชตกับลูกค้าได้เลย")}</p>}
    </MobileSheet>
  );
  return { start, sheet };
}

export function InvoicePhone({ m }: { m: InvoicePhoneModel }) {
  const { t } = useLanguage();
  const [docOpen, setDocOpen] = React.useState(m.linkedFocus);
  const [issuerFrom, setIssuerFrom] = React.useState<'list' | 'form' | null>(null);
  const screen: Screen = issuerFrom ? 'issuer' : m.formOpen ? 'form' : docOpen && m.selected ? 'document' : 'list';

  // One history entry per page opened from the list, so the phone's back gesture closes it.
  const pushed = React.useRef<Screen[]>([]);
  const closeScreen = React.useCallback((which: Screen) => {
    if (which === 'issuer') setIssuerFrom(null);
    else if (which === 'form') m.draft.close();
    else if (which === 'document') { setDocOpen(false); if (m.linkedFocus) m.showAll(); }
  }, [m]);
  const closeRef = React.useRef(closeScreen);
  closeRef.current = closeScreen;
  const push = (which: Screen) => {
    try { window.history.pushState({ ...(window.history.state || {}), dp: which }, ''); pushed.current.push(which); } catch { /* the page still opens */ }
  };
  React.useEffect(() => {
    const onPop = () => { const top = pushed.current.pop(); if (top) closeRef.current(top); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const back = () => {
    if (pushed.current[pushed.current.length - 1] === screen) { window.history.back(); return; }
    closeScreen(screen);
  };

  // Pages opened from the list cover the tab bar and the corner squirrel, and start at the top.
  React.useEffect(() => {
    const root = document.documentElement;
    if (screen === 'list') delete root.dataset.dpTask; else root.dataset.dpTask = screen;
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [screen]);
  React.useEffect(() => () => { delete document.documentElement.dataset.dpTask; }, []);

  const [newOpen, setNewOpen] = React.useState(false);
  const [newMode, setNewMode] = React.useState<'types' | 'source'>('types');
  React.useEffect(() => {
    const open = () => { setNewMode('types'); setNewOpen(true); };
    window.addEventListener(NEW_DOCUMENT_EVENT, open);
    return () => window.removeEventListener(NEW_DOCUMENT_EVENT, open);
  }, []);
  const [jobPicker, setJobPicker] = React.useState(false);
  // The form's step survives a trip to ข้อมูลผู้ออกเอกสาร and back; a newly opened form starts at step 1.
  const [formStep, setFormStep] = React.useState(0);
  const formWasOpen = React.useRef(false);
  React.useEffect(() => { if (m.formOpen && !formWasOpen.current) setFormStep(0); formWasOpen.current = m.formOpen; }, [m.formOpen]);
  const startNew = (type: DocumentType, withJob = false) => {
    setNewOpen(false);
    if (!m.create(type)) return;
    push('form');
    if (withJob) setJobPicker(true);
  };
  const openDoc = (invoice: Invoice) => {
    m.open(invoice);
    if (screen === 'document') return;
    setDocOpen(true);
    push('document');
  };
  const openIssuer = (from: 'list' | 'form') => { setIssuerFrom(from); push('issuer'); };

  return (
    <div className="page-content ksm ksm-screen dp" data-screen={screen}>
      {screen === 'list' && <ListScreen m={m} title={t('nav.invoice')} onOpen={openDoc} onIssuer={() => openIssuer('list')}
        onNew={() => { setNewMode('types'); setNewOpen(true); }} />}
      {screen === 'document' && m.selected && <DocumentScreen m={m} invoice={m.selected} onBack={back} onOpen={openDoc}
        onEdit={() => { m.edit(m.selected!); push('form'); }}
        onIssue={type => { if (m.issueFrom(m.selected!, type)) push('form'); }}
        onRemoved={() => { closeScreen('document'); if (pushed.current[pushed.current.length - 1] === 'document') { pushed.current.pop(); window.history.back(); } }} />}
      {screen === 'form' && <FormScreen m={m} step={formStep} setStep={setFormStep} onBack={back} onIssuer={() => openIssuer('form')} onPickJob={() => setJobPicker(true)}
        onSaved={() => {
          // The saved document opens on its own page, ready to share.
          const stack = pushed.current;
          if (stack[stack.length - 1] === 'form') {
            // Opened from a document's page: step back to that entry (popstate closes the form, which is closed already).
            if (stack[stack.length - 2] === 'document') window.history.back();
            else { stack[stack.length - 1] = 'document'; try { window.history.replaceState({ ...(window.history.state || {}), dp: 'document' }, ''); } catch { /* fine */ } }
          }
          setDocOpen(true);
        }} />}
      {screen === 'issuer' && <IssuerScreen m={m} backLabel={issuerFrom === 'form' ? T("ใบที่กำลังทำ") : T("เอกสาร")} onBack={back} />}

      {newOpen && (
        <MobileSheet title={newMode === 'source' ? tr("ออกต่อจากเอกสารใบไหน") : tr("ออกเอกสารใหม่")} onClose={() => setNewOpen(false)}>
          {newMode === 'types' ? (
            <>
              <div className="dp-card dp-sheet-list" role="list">
                {m.creatable.map(type => (
                  <button key={type} type="button" role="listitem" className="dp-row" onClick={() => startNew(type)}>
                    <TypeIcon type={type} />
                    <span className="dp-row-text"><b>{tr(getDocumentMeta(type).th)}</b><span>{tr(TYPE_LINE[getWorkspaceTab(type)])}</span></span>
                    <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
                  </button>
                ))}
              </div>
              {(m.jobs.length > 0 || m.invoices.length > 0) && <p className="dp-label">{tr("หรือเริ่มจากข้อมูลที่มีอยู่")}</p>}
              <div className="dp-card dp-sheet-list">
                {m.jobs.length > 0 && (
                  <button type="button" className="dp-row" onClick={() => startNew(m.creatable.includes(m.tab) ? m.tab : m.creatable[0], true)}>
                    <span className="dp-tile is-neutral" aria-hidden="true"><Briefcase size={18} /></span>
                    <span className="dp-row-text"><b>{tr("จากงานที่บันทึกไว้")}</b><span>{tr("ใส่ลูกค้า รายการ และยอดเงินจากงานให้")}</span></span>
                    <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
                  </button>
                )}
                {m.invoices.length > 0 && (
                  <button type="button" className="dp-row" onClick={() => setNewMode('source')}>
                    <span className="dp-tile is-neutral" aria-hidden="true"><Link2 size={18} /></span>
                    <span className="dp-row-text"><b>{tr("ออกต่อจากเอกสารเดิม")}</b><span>{tr("เช่น ใบเสนอราคา เป็นใบแจ้งหนี้")}</span></span>
                    <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="dp-card dp-sheet-list">
              {m.invoices.slice(0, 30).map(invoice => (
                <button key={invoice.id} type="button" className="dp-row" onClick={() => { setNewOpen(false); openDoc(invoice); }}>
                  <TypeIcon type={invoice.documentType} />
                  <span className="dp-row-text"><b>{invoice.documentNo}</b><span>{invoice.client.name || tr("ไม่ระบุลูกค้า")} · {shortDate(invoice.createdDate)}</span></span>
                  <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </MobileSheet>
      )}

      {jobPicker && (
        <MobileSheet title={tr("เลือกงาน")} onClose={() => setJobPicker(false)}>
          <p className="dp-note">{tr("ระบบกรอกลูกค้า รายการ ยอด และภาษีจากงานให้")}</p>
          <div className="dp-card dp-sheet-list">
            {m.jobs.map(job => (
              <button key={job.id} type="button" className="dp-row" aria-pressed={m.draft.selectedJobId === job.id} onClick={() => { m.draft.selectJob(job.id); setJobPicker(false); }}>
                <span className="dp-row-text"><b>{job.name}</b><span>{[job.client, formatCurrency(job.value || 0)].filter(Boolean).join(' · ')}</span></span>
                {m.draft.selectedJobId === job.id && <Check size={18} className="dp-accent" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </MobileSheet>
      )}
    </div>
  );
}

function ListScreen({ m, title, onOpen, onIssuer, onNew }: { m: InvoicePhoneModel; title: string; onOpen: (invoice: Invoice) => void; onIssuer: () => void; onNew: () => void }) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = m.invoices.filter(invoice => invoice.createdDate?.startsWith(monthKey)).length;
  const groups = React.useMemo(() => {
    const byMonth = new Map<string, Invoice[]>();
    for (const invoice of m.shown) {
      const key = (invoice.createdDate || '').slice(0, 7) || 'unknown';
      byMonth.set(key, [...(byMonth.get(key) || []), invoice]);
    }
    return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [m.shown]);
  const tabLabel = tr(m.tabs.find(tab => tab.key === m.tab)?.label ?? '');
  const linkLine = (invoice: Invoice) => {
    const onward = m.invoices.find(other => other.linkedFromId === invoice.id);
    if (onward) return tr("ออก{0}ต่อแล้ว", tr(getDocumentMeta(onward.documentType).th));
    const source = invoice.linkedFromId ? m.invoices.find(other => other.id === invoice.linkedFromId) : undefined;
    return source ? tr("ต่อจาก {0}", source.documentNo) : null;
  };
  const issuerReady = Boolean(m.issuer.name?.trim());
  const bank = [m.issuer.bankName ? tr(findThaiBank(m.issuer.bankName)?.name ?? m.issuer.bankName) : '', m.issuer.bankAccount].filter(Boolean).join(' ');

  return (
    <>
      <MobilePageHero title={title} sub={m.invoices.length ? tr("{0} ฉบับ · เดือนนี้ออกไป {1} ฉบับ", m.invoices.length, thisMonth) : tr("ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี")} onBack={m.onMobileBack} />
      {(m.storageError || m.saving || m.legacy) && (
        <div className="dp-status" role="status">
          {(m.storageError || m.saving) && <span className={m.storageError ? 'is-error' : ''}>{m.storageError || tr("กำลังบันทึกเอกสาร…")}</span>}
          {m.legacy && <button type="button" onClick={m.importLegacy}>{tr("นำเข้าเอกสารเดิมจากเครื่อง")}</button>}
        </div>
      )}
      {m.freePlan && m.quota && (
        <div data-testid="document-quota" role="status" className={`dp-quota${m.quotaLeft === 0 ? ' is-full' : ''}`}>
          <span>{tr("โควตาออกเอกสารฟรีเดือนนี้:")}{' '}<b>{Math.min(m.quota.used, m.quota.limit)}/{m.quota.limit}</b> {tr("ฉบับ")}{m.quotaLeft === 0 ? tr(" · ครบแล้ว") : tr(" · เหลือ {0} ฉบับ", m.quotaLeft)}</span>
          {m.quotaLeft === 0 && <button type="button" onClick={m.upgradeQuota}>{tr("อัปเกรดเป็น Pro")}</button>}
        </div>
      )}

      <button type="button" className="dp-card dp-row dp-issuer-row" onClick={onIssuer} data-testid="issuer-row">
        <span className="dp-tile is-neutral" aria-hidden="true"><Building2 size={19} /></span>
        <span className="dp-row-text">
          <b>{tr("ข้อมูลผู้ออกเอกสาร")}</b>
          {issuerReady
            ? <span>{[m.issuer.name, bank].filter(Boolean).join(' · ')}</span>
            : <span className="is-warning">{tr("ยังไม่ได้ตั้ง ชื่อ ที่อยู่ เลขผู้เสียภาษี และบัญชีรับเงิน")}</span>}
        </span>
        <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
      </button>

      <div className="dp-seg" role="tablist" aria-label={tr("ประเภทเอกสาร")} style={{ gridTemplateColumns: `repeat(${m.tabs.length}, minmax(0, 1fr))` }}>
        {m.tabs.map(tab => {
          const count = m.invoices.filter(invoice => getWorkspaceTab(invoice.documentType) === tab.key).length;
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={m.tab === tab.key} onClick={() => m.setTab(tab.key)}>
              {tr(TAB_SHORT[tab.key])}{count > 0 && <span className="dp-count">{count}</span>}
              <span className="ksm-sr-only"> {tr(tab.label)} {tr("{0} รายการ", count)}</span>
            </button>
          );
        })}
      </div>

      {m.tabInvoices.length > 0 && (
        <div className="ksm-search dp-search">
          <KsIcon name="search" />
          <input type="search" value={m.query} onChange={event => m.setQuery(event.target.value)} placeholder={tr("ค้นหาเลขที่ หรือชื่อลูกค้า")} aria-label={tr("ค้นหาเอกสาร")} enterKeyHint="search" />
        </div>
      )}

      {m.tabInvoices.length === 0 ? (
        <div className="dp-empty">
          <FileText size={34} aria-hidden="true" />
          <h3>{tr("ยังไม่มี{0}", tabLabel)}</h3>
          <p>{tr("กดปุ่ม ออกเอกสาร ที่แถบด้านล่างเพื่อเริ่ม")}</p>
          <button type="button" className="dp-btn" onClick={onNew}><Plus size={17} aria-hidden="true" />{tr("ออก{0}", tabLabel)}</button>
        </div>
      ) : m.shown.length === 0 ? (
        <p className="dp-empty-line">{tr("ไม่พบเอกสารที่ตรงกับ “{0}”", m.query)}</p>
      ) : groups.map(([key, list]) => (
        <section key={key} className="dp-group" aria-label={key === 'unknown' ? tr("ไม่ระบุวันที่") : monthTitle(key)}>
          <div className="dp-group-head"><span>{key === 'unknown' ? tr("ไม่ระบุวันที่") : monthTitle(key)}</span><span>{tr("{0} ฉบับ", list.length)}</span></div>
          <ul className="dp-card" aria-label={tr("รายการเอกสาร")}>
            {list.map(invoice => {
              const link = linkLine(invoice);
              return (
                <li key={invoice.id}>
                  <button type="button" className="dp-row dp-docrow" onClick={() => onOpen(invoice)} aria-label={tr("เปิด {0} {1}", invoice.documentNo, invoice.client.name || '')}>
                    <TypeIcon type={invoice.documentType} size={20} />
                    <span className="dp-row-text">
                      <span className="dp-docrow-top"><b>{invoice.documentNo}</b><b className="dp-money">{formatCurrency(m.totals(invoice).grandTotal)}</b></span>
                      <span className="dp-docrow-sub"><span>{invoice.client.name || tr("ไม่ระบุลูกค้า")}</span><span>{shortDate(invoice.createdDate)}</span></span>
                      {link && <span className="dp-chip"><Link2 size={12} strokeWidth={2.4} aria-hidden="true" />{link}</span>}
                    </span>
                    <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

function DocumentScreen({ m, invoice, onBack, onOpen, onEdit, onIssue, onRemoved }: {
  m: InvoicePhoneModel; invoice: Invoice; onBack: () => void; onOpen: (invoice: Invoice) => void; onEdit: () => void;
  onIssue: (type: DocumentType) => void; onRemoved: () => void;
}) {
  const meta = getDocumentMeta(invoice.documentType);
  const totals = m.totals(invoice);
  const shown = m.branded(invoice);
  const [viewer, setViewer] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [issue, setIssue] = React.useState(false);
  const share = useShare(m, shown);
  const issueTypes = m.issueTypes(invoice);
  const dueLabel = meta.isQuotation ? tr("ยืนราคาถึง") : meta.isReceipt ? tr("รับเงิน") : tr("ครบกำหนด");
  const dueDate = meta.isReceipt ? invoice.paidDate || invoice.dueDate : invoice.dueDate;
  // The page drawn small: the full A4 width scaled into the card, cut off at the card's height.
  const [cardWidth, setCardWidth] = React.useState(() => Math.min(window.innerWidth, 720) - 32);
  React.useEffect(() => { const onResize = () => setCardWidth(Math.min(window.innerWidth, 720) - 32); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }, []);
  const thumbScale = Math.max(0.2, (cardWidth - 72) / A4_WIDTH_PX);

  return (
    <>
      <MobilePageHero title={invoice.documentNo || tr(meta.th)} sub={`${tr(meta.th)} · ${invoice.client.name || tr("ไม่ระบุลูกค้า")}`} onBack={onBack} backLabel={T("เอกสาร")}
        actions={<button type="button" className="ksm-toolbtn" onClick={() => setMenu(true)} aria-label={tr("ตัวเลือกเพิ่มเติมของ {0}", invoice.documentNo)}><MoreHorizontal size={19} /></button>} />
      {m.linkedFocus && (
        <p className="dp-note is-banner" data-krarok-avoid="banner">{m.linkFrom === 'assistant' ? tr("เอกสารที่เลขาทำให้ · ดาวน์โหลด PDF หรือแชร์ให้ลูกค้าได้ด้านล่าง") : tr("เอกสารที่ขอจาก LINE · ดาวน์โหลด PDF หรือแชร์ให้ลูกค้าได้ด้านล่าง")}</p>
      )}

      <section className={`dp-card dp-summary${m.spotlight ? ' doc-spotlight' : ''}`} aria-label={tr("สรุปยอด")}>
        <div className="dp-summary-top">
          <div>
            <p className="dp-muted">{tr("ยอดรับสุทธิ")}</p>
            <p className="dp-big dp-money">{formatCurrency(totals.grandTotal)}</p>
          </div>
          <p className="dp-summary-dates">{tr("ออก {0}", shortDate(invoice.createdDate))}{dueDate && <><br />{dueLabel} {shortDate(dueDate)}</>}</p>
        </div>
        <dl className="dp-breakdown">
          <div><dt>{tr("ยอดก่อนภาษี ({0} รายการ)", invoice.items.length)}</dt><dd className="dp-money">{formatCurrency(totals.subtotal)}</dd></div>
          {invoice.vatRate > 0 && <div><dt>{tr("ภาษีมูลค่าเพิ่ม {0}%", invoice.vatRate)}</dt><dd className="dp-money">{formatCurrency(totals.vatAmount)}</dd></div>}
          {invoice.whtRate > 0 && <div><dt>{tr("หัก ณ ที่จ่าย {0}%", invoice.whtRate)}</dt><dd className="dp-money">−{formatCurrency(totals.whtAmount)}</dd></div>}
        </dl>
      </section>

      {m.chain.length > 1 && (
        <section className="dp-card" aria-label={tr("เอกสารที่ลิงก์กัน")}>
          <p className="dp-card-label">{tr("เอกสารที่ลิงก์กัน")}</p>
          {m.chain.map(doc => doc.id === invoice.id ? (
            <div key={doc.id} className="dp-row dp-chainrow" aria-current="page">
              <span className="dp-dot is-on" aria-hidden="true" />
              <span className="dp-row-text"><b>{tr(getDocumentMeta(doc.documentType).th)} {doc.documentNo}</b></span>
              <span className="dp-muted">{tr("ฉบับนี้")}</span>
            </div>
          ) : (
            <button key={doc.id} type="button" className="dp-row dp-chainrow" onClick={() => onOpen(doc)}>
              <span className="dp-dot" aria-hidden="true" />
              <span className="dp-row-text"><b>{tr(getDocumentMeta(doc.documentType).th)} {doc.documentNo}</b><span>{shortDate(doc.createdDate)}</span></span>
              <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
            </button>
          ))}
        </section>
      )}

      <button type="button" className="dp-thumb" onClick={() => setViewer(true)} aria-label={tr("ดูหน้าเอกสารเต็มจอ")} data-testid="document-view">
        <span className="dp-thumb-paper dp-paper" aria-hidden="true"><DocumentPreview invoice={shown} scale={thumbScale} watermark={m.freePlan} /></span>
        <span className="dp-thumb-pill"><Maximize2 size={14} aria-hidden="true" />{tr("แตะเพื่อดูเต็มจอ")}</span>
      </button>
      <div className="dp-bar-space" aria-hidden="true" />

      <BottomBar>
        <button type="button" className="dp-tool" onClick={onEdit}><PenLine size={18} aria-hidden="true" />{tr("แก้ไข")}</button>
        <button type="button" className="dp-tool" onClick={m.downloadPdf} disabled={m.pdfBusy}><Download size={18} aria-hidden="true" />{m.pdfBusy ? tr("กำลังสร้าง…") : 'PDF'}</button>
        {issueTypes.length > 0 && <button type="button" className="dp-tool" onClick={() => setIssue(true)}><Link2 size={18} aria-hidden="true" />{tr("ออกต่อ")}</button>}
        <button type="button" className="dp-primary" onClick={share.start}><Share2 size={18} aria-hidden="true" />{tr("แชร์ให้ลูกค้า")}</button>
      </BottomBar>

      {viewer && <Viewer invoice={shown} watermark={m.freePlan} onClose={() => setViewer(false)} actions={<>
        <button type="button" className="dp-viewer-btn" onClick={m.downloadPdf} disabled={m.pdfBusy}><Download size={18} aria-hidden="true" />{tr("ดาวน์โหลด PDF")}</button>
        <button type="button" className="dp-primary" onClick={share.start}><Share2 size={18} aria-hidden="true" />{tr("แชร์ให้ลูกค้า")}</button>
      </>} />}
      {share.sheet}
      {menu && (
        <MobileSheet title={invoice.documentNo} onClose={() => setMenu(false)}>
          <div className="dp-card dp-sheet-list">
            <button type="button" className="dp-row" onClick={() => { setMenu(false); m.duplicate(invoice); }}><span className="dp-tile is-neutral" aria-hidden="true"><Copy size={18} /></span><span className="dp-row-text"><b>{tr("ทำสำเนา")}</b><span>{tr("สร้างใบใหม่จากใบนี้ เลขที่ใหม่ วันที่วันนี้")}</span></span></button>
            <button type="button" className="dp-row" onClick={() => { setMenu(false); m.print(); }}><span className="dp-tile is-neutral" aria-hidden="true"><Printer size={18} /></span><span className="dp-row-text"><b>{tr("พิมพ์")}</b><span>{tr("เปิดหน้าพิมพ์ของเบราว์เซอร์")}</span></span></button>
            <button type="button" className="dp-row is-danger" onClick={() => { setMenu(false); m.remove(invoice.id, onRemoved); }}><span className="dp-tile is-danger" aria-hidden="true"><Trash2 size={18} /></span><span className="dp-row-text"><b>{tr("ลบเอกสาร")}</b><span>{tr("ลบใบนี้ออกจากบัญชี")}</span></span></button>
          </div>
        </MobileSheet>
      )}
      {issue && (
        <MobileSheet title={tr("ออกต่อจาก {0}", invoice.documentNo)} onClose={() => setIssue(false)}>
          <p className="dp-note">{tr("ดึงลูกค้า รายการ และภาษีจากใบนี้ให้ แล้วลิงก์ไว้กับใบเดิม")}</p>
          <div className="dp-card dp-sheet-list">
            {issueTypes.map(type => (
              <button key={type} type="button" className="dp-row" onClick={() => { setIssue(false); onIssue(type); }}>
                <TypeIcon type={type} />
                <span className="dp-row-text"><b>{tr("ออกต่อเป็น{0}", tr(getDocumentMeta(type).th))}</b></span>
                <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
              </button>
            ))}
          </div>
        </MobileSheet>
      )}
    </>
  );
}

const STEPS = [T("ลูกค้า"), T("รายการและภาษี"), T("ตรวจแล้วบันทึก")] as const;

function FormScreen({ m, step, setStep, onBack, onIssuer, onPickJob, onSaved }: {
  m: InvoicePhoneModel; step: number; setStep: (step: number) => void; onBack: () => void; onIssuer: () => void; onPickJob: () => void; onSaved: () => void;
}) {
  const d = m.draft;
  const meta = getDocumentMeta(d.docType);
  const [nameError, setNameError] = React.useState(false);
  const [moreClient, setMoreClient] = React.useState(() => Boolean(d.client.branch || d.client.contactName || d.client.code || d.client.phone || d.client.email));
  const [terms, setTerms] = React.useState(() => Boolean(d.paymentTerm || d.deliveryTerm || d.refNo));
  const [openItems, setOpenItems] = React.useState<Record<string, boolean>>({});
  const [viewer, setViewer] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { document.getElementById('main-content')?.scrollTo({ top: 0 }); }, [step]);
  const title = d.editingId ? tr("แก้ไข{0}", tr(meta.th)) : tr("{0}ใหม่", tr(meta.th));
  const goBack = () => (step === 0 ? onBack() : setStep(step - 1));
  const next = () => {
    if (step === 0 && !d.client.name.trim()) { setNameError(true); nameRef.current?.focus(); return; }
    setStep(step + 1);
  };
  const job = d.selectedJobId ? m.jobs.find(item => item.id === d.selectedJobId) : undefined;
  const recentClients = m.clients.slice(0, 6);
  const draftPreview = viewer ? d.preview() : null;

  return (
    <>
      <MobilePageHero title={title} onBack={goBack} backLabel={step === 0 ? T("ยกเลิก") : STEPS[step - 1]}
        actions={<button type="button" className="ksm-toolbtn dp-textbtn" onClick={d.clear}>{tr("ล้างข้อมูล")}</button>}>
        <div className="dp-steps" role="group" aria-label={tr("ขั้นตอน")}>
          <div className="dp-steps-bars">
            {STEPS.map((label, index) => (
              <button key={label} type="button" aria-label={tr("ขั้นที่ {0}: {1}", index + 1, tr(label))} aria-current={index === step ? 'step' : undefined}
                className={index <= step ? 'is-done' : ''} onClick={() => { if (index <= step || d.client.name.trim()) setStep(index); else { setNameError(true); } }} />
            ))}
          </div>
          <p>{tr("ขั้นที่ {0} จาก 3 · {1}", step + 1, tr(STEPS[step]))}</p>
        </div>
      </MobilePageHero>

      {d.linkSource && !d.editingId && (
        <label className="dp-note is-banner dp-linkbox">
          <span><Link2 size={14} aria-hidden="true" /> {tr("ออกต่อจาก{0}", tr(getDocumentMeta(d.linkSource.documentType).th))} <b>{d.linkSource.documentNo}</b></span>
          <span className="dp-check"><input type="checkbox" checked={d.keepLinked} onChange={event => d.setKeepLinked(event.target.checked)} />{tr("ลิงก์กับใบเดิม")}</span>
        </label>
      )}

      {step === 0 && (
        <>
          {!d.editingId && m.jobs.length > 0 && (
            <button type="button" className="dp-card dp-row" onClick={onPickJob}>
              <span className="dp-tile is-neutral" aria-hidden="true"><Briefcase size={18} /></span>
              <span className="dp-row-text"><b>{job ? job.name : tr("เริ่มจากงานที่บันทึกไว้")}</b><span>{job ? tr("ดึงข้อมูลจากงานนี้แล้ว · แตะเพื่อเปลี่ยน") : tr("ใส่ลูกค้า รายการ และยอดเงินจากงานให้")}</span></span>
              <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
            </button>
          )}
          {recentClients.length > 0 && (
            <>
              <p className="dp-label">{tr("ออกให้ใคร")}</p>
              <div className="dp-card" role="radiogroup" aria-label={tr("ลูกค้าที่เคยออกเอกสารให้")}>
                {recentClients.map(client => {
                  const on = client.name === d.client.name;
                  return (
                    <button key={client.name} type="button" role="radio" aria-checked={on} className={`dp-row${on ? ' is-selected' : ''}`}
                      onClick={() => { d.setClientField('name', client.name); d.applyClient(client); setNameError(false); }}>
                      <span className="dp-row-text"><b>{client.name}</b><span>{client.taxId ? tr("เลขผู้เสียภาษี {0}", client.taxId) : client.address || tr("ลูกค้าที่เคยออกเอกสารให้")}</span></span>
                      <span className={`dp-radio${on ? ' is-on' : ''}`} aria-hidden="true">{on && <Check size={14} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
                <button type="button" className="dp-row dp-addrow" onClick={() => { d.applyClient({ name: '', address: '', phone: '', email: '', taxId: '' }); d.setClientField('name', ''); requestAnimationFrame(() => nameRef.current?.focus()); }}>
                  <Plus size={18} aria-hidden="true" />{tr("ลูกค้าใหม่")}
                </button>
              </div>
            </>
          )}
          <p className="dp-label">{tr("ข้อมูลลูกค้าบนเอกสาร")}</p>
          <div className="dp-card dp-form">
            <Field label={tr("ชื่อลูกค้า")} htmlFor="dp-client-name">
              <input ref={nameRef} id="dp-client-name" type="text" value={d.client.name} onChange={event => { d.setClientField('name', event.target.value); if (event.target.value.trim()) setNameError(false); }}
                placeholder={tr("ชื่อบุคคล หรือ ชื่อบริษัท")} aria-invalid={nameError || undefined} aria-describedby={nameError ? 'dp-client-error' : undefined} />
            </Field>
            {nameError && <p id="dp-client-error" className="dp-error" role="alert">{tr("กรุณาระบุชื่อลูกค้าก่อนไปขั้นถัดไป")}</p>}
            <Field label={tr("เลขผู้เสียภาษี")} htmlFor="dp-client-tax">
              <input id="dp-client-tax" type="text" inputMode="numeric" value={d.client.taxId} onChange={event => d.setClientField('taxId', event.target.value)} placeholder={tr("13 หลัก")} />
            </Field>
            <Field label={tr("ที่อยู่")} htmlFor="dp-client-address" top>
              <textarea id="dp-client-address" rows={2} value={d.client.address} onChange={event => d.setClientField('address', event.target.value)} placeholder={tr("ที่อยู่ตามใบกำกับภาษี")} />
            </Field>
            <button type="button" className="dp-more" aria-expanded={moreClient} onClick={() => setMoreClient(value => !value)}>
              <span>{tr("สาขา ผู้ติดต่อ เบอร์ และอีเมล")}</span><ChevronDown size={17} className={moreClient ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {moreClient && (
              <>
                <Field label={tr("สาขา")} htmlFor="dp-client-branch"><input id="dp-client-branch" type="text" value={d.client.branch || ''} onChange={event => d.setClientField('branch', event.target.value)} placeholder={tr("เช่น สำนักงานใหญ่")} /></Field>
                <Field label={tr("ผู้ติดต่อ")} htmlFor="dp-client-contact"><input id="dp-client-contact" type="text" value={d.client.contactName || ''} onChange={event => d.setClientField('contactName', event.target.value)} placeholder={tr("เช่น คุณเอก ใจดี")} /></Field>
                <Field label={tr("รหัสลูกค้า")} htmlFor="dp-client-code"><input id="dp-client-code" type="text" value={d.client.code || ''} onChange={event => d.setClientField('code', event.target.value)} placeholder={tr("ถ้ามี")} /></Field>
                <Field label={tr("เบอร์โทร")} htmlFor="dp-client-phone"><input id="dp-client-phone" type="tel" value={d.client.phone} onChange={event => d.setClientField('phone', event.target.value)} placeholder={tr("เช่น 02-555-5555")} /></Field>
                <Field label={tr("อีเมล")} htmlFor="dp-client-email"><input id="dp-client-email" type="email" value={d.client.email} onChange={event => d.setClientField('email', event.target.value)} placeholder={tr("เช่น finance@client.co.th")} /></Field>
              </>
            )}
          </div>
          <div className="dp-bar-space" aria-hidden="true" />
          <BottomBar><button type="button" className="dp-primary is-wide" onClick={next}>{tr("ถัดไป: รายการ")}<ChevronRight size={18} aria-hidden="true" /></button></BottomBar>
        </>
      )}

      {step === 1 && (
        <>
          <ol className="dp-items">
            {d.items.map((item, index) => {
              const open = openItems[item.id] || Boolean(item.discount || item.unit || item.detail);
              return (
                <li key={item.id} className="dp-card dp-item">
                  <div className="dp-item-head">
                    <label htmlFor={`dp-item-${item.id}`}>{tr("รายการที่ {0}", index + 1)}</label>
                    {d.items.length > 1 && <button type="button" className="dp-iconbtn" onClick={() => d.removeItem(item.id)} aria-label={tr("ลบรายการที่ {0}", index + 1)}><Trash2 size={16} /></button>}
                  </div>
                  <input id={`dp-item-${item.id}`} className="dp-input" type="text" value={item.description} onChange={event => d.setItemField(item.id, 'description', event.target.value)} placeholder={tr("เช่น ถ่ายรีวิวสินค้า 1 คลิป")} />
                  <div className="dp-item-math">
                    <div className="dp-stepper" role="group" aria-label={tr("จำนวนของรายการที่ {0}", index + 1)}>
                      <button type="button" onClick={() => d.setItemField(item.id, 'quantity', Math.max(1, item.quantity - 1))} aria-label={tr("ลดจำนวน")} disabled={item.quantity <= 1}><Minus size={16} /></button>
                      <input type="number" inputMode="numeric" min={1} value={item.quantity} onChange={event => d.setItemField(item.id, 'quantity', event.target.value)} aria-label={tr("จำนวน")} />
                      <button type="button" onClick={() => d.setItemField(item.id, 'quantity', item.quantity + 1)} aria-label={tr("เพิ่มจำนวน")}><Plus size={16} /></button>
                    </div>
                    <span className="dp-muted" aria-hidden="true">×</span>
                    <NumberInput value={item.price} onChange={raw => d.setItemField(item.id, 'price', raw)} placeholder="0" aria-label={tr("ราคาต่อหน่วยของรายการที่ {0}", index + 1)} className="dp-input dp-price" />
                  </div>
                  {open && (
                    <div className="dp-item-more">
                      <label><span>{tr("หน่วย")}</span><input className="dp-input" type="text" value={item.unit || ''} onChange={event => d.setItemField(item.id, 'unit', event.target.value)} placeholder={tr("เช่น ชิ้น งาน")} /></label>
                      <label><span>{tr("ส่วนลด (บาท)")}</span><NumberInput value={item.discount || 0} onChange={raw => d.setItemField(item.id, 'discount', raw)} placeholder="0" className="dp-input dp-price" /></label>
                      <label className="is-wide"><span>{tr("รายละเอียดเพิ่มเติม")}</span><input className="dp-input" type="text" value={item.detail || ''} onChange={event => d.setItemField(item.id, 'detail', event.target.value)} placeholder={tr("ไม่บังคับ")} /></label>
                    </div>
                  )}
                  <div className="dp-item-foot">
                    {!open ? <button type="button" className="dp-link" onClick={() => setOpenItems(value => ({ ...value, [item.id]: true }))}>{tr("หน่วย ส่วนลด และรายละเอียด")}</button> : <span />}
                    <b className="dp-money">{formatCurrency(item.quantity * item.price - (item.discount || 0))}</b>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className="dp-additem" onClick={d.addItem}><Plus size={17} aria-hidden="true" />{tr("เพิ่มรายการ")}</button>

          <div className="dp-card dp-taxes">
            <div className="dp-taxrow">
              <span id="dp-vat-label">{tr("ภาษีมูลค่าเพิ่ม")}</span>
              <div className="dp-seg is-small" role="radiogroup" aria-labelledby="dp-vat-label" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <button type="button" role="radio" aria-checked={d.vatRate === 0} aria-selected={d.vatRate === 0} onClick={() => d.setVatRate(0)}>{tr("ไม่มี")}</button>
                <button type="button" role="radio" aria-checked={d.vatRate === 7} aria-selected={d.vatRate === 7} onClick={() => d.setVatRate(7)}>7%</button>
              </div>
            </div>
            <div className="dp-taxcol">
              <span id="dp-wht-label">{tr("หัก ณ ที่จ่าย")}</span>
              <div className="dp-chips" role="radiogroup" aria-labelledby="dp-wht-label">
                {[...WHT_RATES, ...(WHT_RATES.includes(d.whtRate) ? [] : [d.whtRate])].map(rate => (
                  <button key={rate} type="button" role="radio" aria-checked={d.whtRate === rate} onClick={() => d.setWhtRate(rate)}>{rate === 0 ? tr("ไม่มี") : `${rate}%`}</button>
                ))}
              </div>
              <p className="dp-hint">{tr("1% ค่าขนส่ง · 3% ฟรีแลนซ์และบริการ · 5% ค่าเช่าและโฆษณา")}</p>
            </div>
          </div>
          <div className="dp-bar-space" aria-hidden="true" />
          <BottomBar>
            <div className="dp-bar-total">
              <span>{tr("ยอดรับสุทธิ")}</span>
              <b className="dp-money">{formatCurrency(d.totals.grandTotal)}</b>
              <small className="dp-money">{[formatCurrency(d.totals.subtotal), d.vatRate ? tr("VAT {0}", formatCurrency(d.totals.vatAmount)) : '', d.whtRate ? tr("หัก {0}", formatCurrency(d.totals.whtAmount)) : ''].filter(Boolean).join(' · ')}</small>
            </div>
            <button type="button" className="dp-primary" onClick={next}>{tr("ถัดไป")}<ChevronRight size={18} aria-hidden="true" /></button>
          </BottomBar>
        </>
      )}

      {step === 2 && (
        <>
          <button type="button" className="dp-card dp-review" onClick={() => setViewer(true)}>
            <span className="dp-review-paper dp-paper" aria-hidden="true"><DocumentPreview invoice={d.preview()} scale={58 / A4_WIDTH_PX} watermark={m.freePlan} /></span>
            <span className="dp-row-text">
              <span>{[d.client.name, tr("{0} รายการ", d.items.length)].filter(Boolean).join(' · ')}</span>
              <b className="dp-big dp-money">{formatCurrency(d.totals.grandTotal)}</b>
              <span className="dp-accent-text">{tr("ดูหน้า A4 ก่อนบันทึก")}<ChevronRight size={15} aria-hidden="true" /></span>
            </span>
          </button>

          <p className="dp-label">{tr("รายละเอียดเอกสาร")}</p>
          <div className="dp-card dp-form">
            <Stacked label={tr("ประเภทเอกสาร")} htmlFor="dp-doc-type">
              <span className="dp-select">
                <select id="dp-doc-type" value={d.docType} onChange={event => d.changeType(event.target.value as DocumentType)}>
                  {(d.docType === 'receiptTaxInvoice' ? [...m.creatable, d.docType] : m.creatable).map(type => <option key={type} value={type}>{tr(getDocumentMeta(type).th)}</option>)}
                </select>
                <ChevronDown size={17} aria-hidden="true" />
              </span>
            </Stacked>
            <Stacked label={tr("เลขที่เอกสาร")} htmlFor="dp-doc-no"><input id="dp-doc-no" type="text" value={d.docNo} onChange={event => d.setDocNo(event.target.value)} placeholder={tr("เช่น INV-2026-001")} /></Stacked>
            <div className="dp-pair">
              <Stacked label={tr("วันที่ออก")} htmlFor="dp-doc-created"><input id="dp-doc-created" type="date" value={d.createdDate} onChange={event => d.setCreatedDate(event.target.value)} /></Stacked>
              <Stacked label={meta.isQuotation ? tr("ยืนราคาถึง") : meta.isReceipt ? tr("วันที่รับเงิน") : tr("ครบกำหนดชำระ")} htmlFor="dp-doc-due"><input id="dp-doc-due" type="date" value={d.dueDate} onChange={event => d.setDueDate(event.target.value)} /></Stacked>
            </div>
            {meta.isQuotation && <Stacked label={tr("วันที่ตอบรับ")} htmlFor="dp-doc-response"><input id="dp-doc-response" type="date" value={d.responseDate} onChange={event => d.setResponseDate(event.target.value)} /></Stacked>}
            {meta.isReceipt && (
              <>
                <div className="dp-pair">
                  <Stacked label={tr("วันที่รับชำระเงิน")} htmlFor="dp-paid-date"><input id="dp-paid-date" type="date" value={d.paidDate} onChange={event => d.setPaidDate(event.target.value)} /></Stacked>
                  <Stacked label={tr("วิธีชำระเงิน")} htmlFor="dp-paid-method"><input id="dp-paid-method" type="text" value={d.paymentMethod} onChange={event => d.setPaymentMethod(event.target.value)} placeholder={tr("เช่น โอนเงิน")} /></Stacked>
                </div>
                <Stacked label={tr("จำนวนเงินที่ได้รับ")} htmlFor="dp-paid-amount"><NumberInput id="dp-paid-amount" value={d.paidAmount} onChange={raw => d.setPaidAmount(raw === '' ? '' : Math.max(0, parseFloat(raw) || 0))} placeholder={tr("เว้นว่าง = ยอดสุทธิ")} /></Stacked>
              </>
            )}
            <button type="button" className="dp-more" aria-expanded={terms} onClick={() => setTerms(value => !value)}>
              <span>{tr("เงื่อนไขและเลขอ้างอิง (ไม่บังคับ)")}</span><ChevronDown size={17} className={terms ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {terms && (
              <>
                <Stacked label={tr("เงื่อนไขการชำระเงิน")} htmlFor="dp-payment-term"><input id="dp-payment-term" type="text" value={d.paymentTerm} onChange={event => d.setPaymentTerm(event.target.value)} placeholder={tr("เช่น เครดิต 30 วัน")} /></Stacked>
                <Stacked label={tr("ระยะเวลาส่งมอบ")} htmlFor="dp-delivery-term"><input id="dp-delivery-term" type="text" value={d.deliveryTerm} onChange={event => d.setDeliveryTerm(event.target.value)} placeholder={tr("เช่น ภายใน 7 วันทำการ")} /></Stacked>
                <Stacked label={tr("อ้างอิงเลขที่ (PO/QT)")} htmlFor="dp-ref"><input id="dp-ref" type="text" value={d.refNo} onChange={event => d.setRefNo(event.target.value)} placeholder={tr("เช่น PO-9988")} /></Stacked>
              </>
            )}
            <Stacked label={tr("หมายเหตุท้ายเอกสาร")} htmlFor="dp-note"><textarea id="dp-note" rows={3} value={d.note} onChange={event => d.setNote(event.target.value)} placeholder={tr("เช่น กรุณาโอนภายใน 30 วัน")} /></Stacked>
          </div>
          <button type="button" className="dp-card dp-row" onClick={onIssuer}>
            <span className="dp-row-text"><b>{tr("ผู้ออกเอกสาร")}</b><span>{m.issuer.name?.trim() ? m.issuer.name : tr("ยังไม่ได้ตั้งข้อมูลผู้ออกเอกสาร")}</span></span>
            <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
          </button>
          <div className="dp-bar-space" aria-hidden="true" />
          <BottomBar>
            <button type="button" className="dp-primary is-wide" onClick={() => { if (d.save()) onSaved(); }}><Check size={18} strokeWidth={2.6} aria-hidden="true" />{d.editingId ? tr("บันทึกการแก้ไข") : tr("บันทึก{0}", tr(meta.th))}</button>
          </BottomBar>
          {draftPreview && <Viewer invoice={draftPreview} watermark={m.freePlan} onClose={() => setViewer(false)} actions={<button type="button" className="dp-viewer-btn is-wide" onClick={() => setViewer(false)}>{tr("กลับไปแก้ไข")}</button>} />}
        </>
      )}
    </>
  );
}

function IssuerScreen({ m, backLabel, onBack }: { m: InvoicePhoneModel; backLabel: string; onBack: () => void }) {
  const [profile, setProfile] = React.useState<InvoiceProfile>(() => ({ ...m.issuer }));
  const [bankOther, setBankOther] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [brand, setBrand] = React.useState<'logo' | 'signature' | null>(null);
  const [viewer, setViewer] = React.useState(false);
  // The bank as a sheet from the bottom with the whole list to scroll (owner, 2026-11-03: the drop-down was cut off by its
  // card, "อยากให้มันเลื่อนเห็นชัดๆ").
  const [bankSheet, setBankSheet] = React.useState(false);
  const [bankQuery, setBankQuery] = React.useState('');
  const set = (field: keyof InvoiceProfile, value: string) => setProfile(current => ({ ...current, [field]: value }));
  const sample: Invoice = {
    id: 'issuer-preview', documentType: 'invoice', documentNo: 'INV-2026-001', createdDate: new Date().toISOString().slice(0, 10), issuer: profile,
    client: { name: tr("ชื่อลูกค้าตัวอย่าง"), address: tr("ที่อยู่ลูกค้าตัวอย่าง"), phone: '', email: '', taxId: '' },
    items: [{ id: 'p1', description: tr("รายการตัวอย่าง"), quantity: 1, price: 1000 }], vatRate: 0, whtRate: 0,
  };
  const save = async () => {
    setSaving(true);
    const ok = await m.saveIssuer(profile);
    setSaving(false);
    if (ok) onBack();
  };
  const knownBank = findThaiBank(profile.bankName);
  const position = profile.logoPosition || 'left';

  return (
    <>
      <MobilePageHero title={tr("ข้อมูลผู้ออกเอกสาร")} sub={tr("พิมพ์บนใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จทุกใบ")} onBack={onBack} backLabel={backLabel} />
      <p className="dp-label">{tr("ธุรกิจ")}</p>
      <div className="dp-card dp-form">
        <Field label={tr("ชื่อธุรกิจ")} htmlFor="dp-biz-name"><input id="dp-biz-name" type="text" value={profile.name} onChange={event => set('name', event.target.value)} placeholder={tr("ชื่อบุคคล หรือ ชื่อบริษัท")} /></Field>
        <Field label={tr("เลขผู้เสียภาษี")} htmlFor="dp-biz-tax"><input id="dp-biz-tax" type="text" inputMode="numeric" value={profile.taxId} onChange={event => set('taxId', event.target.value)} placeholder={tr("13 หลัก")} /></Field>
        <Field label={tr("ที่อยู่")} htmlFor="dp-biz-address" top><textarea id="dp-biz-address" rows={2} value={profile.address} onChange={event => set('address', event.target.value)} placeholder={tr("ที่อยู่ออกใบเสร็จ / ที่อยู่จดทะเบียน")} /></Field>
        <Field label={tr("เบอร์โทร")} htmlFor="dp-biz-phone"><input id="dp-biz-phone" type="tel" value={profile.phone} onChange={event => set('phone', event.target.value)} placeholder={tr("เช่น 089-999-9999")} /></Field>
        <Field label={tr("อีเมล")} htmlFor="dp-biz-email"><input id="dp-biz-email" type="email" value={profile.email} onChange={event => set('email', event.target.value)} placeholder={tr("เช่น myemail@gmail.com")} /></Field>
        <Field label={tr("เว็บไซต์")} htmlFor="dp-biz-web"><input id="dp-biz-web" type="url" value={profile.website || ''} onChange={event => set('website', event.target.value)} placeholder={tr("ไม่บังคับ")} /></Field>
      </div>

      <p className="dp-label">{tr("บัญชีรับเงิน (แสดงท้ายเอกสาร)")}</p>
      <div className="dp-card dp-form">
        <button type="button" className="dp-row dp-bankrow" onClick={() => { setBankQuery(''); setBankSheet(true); }} aria-haspopup="dialog" aria-label={tr("ธนาคาร: {0}", knownBank ? tr(knownBank.name) : profile.bankName || tr("เลือกธนาคาร"))}>
          <span className="dp-field-label">{tr("ธนาคาร")}</span>
          {knownBank ? <BankLogo bank={knownBank} size={26} /> : null}
          <span className={`dp-bankname${knownBank || profile.bankName ? '' : ' is-empty'}`}>{knownBank ? tr(knownBank.name) : profile.bankName ? profile.bankName : bankOther ? tr("อื่น ๆ (พิมพ์ชื่อเอง)") : tr("เลือกธนาคาร")}</span>
          <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
        </button>
        {!knownBank && (profile.bankName || bankOther) && (
          <Field label={tr("ชื่อช่องทาง")} htmlFor="dp-biz-bank-other">
            <input id="dp-biz-bank-other" type="text" value={profile.bankName} onChange={event => set('bankName', event.target.value)} placeholder={tr("เช่น พร้อมเพย์")} />
          </Field>
        )}
        <Field label={tr("เลขที่บัญชี")} htmlFor="dp-biz-account"><input id="dp-biz-account" type="text" inputMode="numeric" value={profile.bankAccount} onChange={event => set('bankAccount', event.target.value)} placeholder={tr("เช่น 123-4-56789-0")} /></Field>
        <Field label={tr("ชื่อบัญชี")} htmlFor="dp-biz-account-name"><input id="dp-biz-account-name" type="text" value={profile.bankAccountName} onChange={event => set('bankAccountName', event.target.value)} placeholder={tr("ชื่อบัญชีโอนรับเงิน")} /></Field>
      </div>

      <p className="dp-label">{tr("โลโก้และลายเซ็น")}</p>
      <div className="dp-card">
        {(['logo', 'signature'] as const).map(kind => {
          const value = kind === 'logo' ? profile.logoUrl : profile.signatureUrl;
          return (
            <button key={kind} type="button" className="dp-row" onClick={() => setBrand(kind)}>
              <span className="dp-brandthumb" aria-hidden="true">{value ? <img src={value} alt="" /> : null}</span>
              <span className="dp-row-text"><b>{kind === 'logo' ? tr("โลโก้ธุรกิจ") : tr("ลายเซ็นผู้ออกเอกสาร")}</b></span>
              <span className="dp-muted">{value ? tr("เปลี่ยน") : tr("เพิ่มรูป")}</span>
              <ChevronRight size={17} className="dp-chevron" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="dp-bar-space" aria-hidden="true" />
      <BottomBar>
        <button type="button" className="dp-tool is-text" onClick={() => setViewer(true)}>{tr("ดูบนเอกสาร")}</button>
        <button type="button" className="dp-primary" onClick={() => void save()} disabled={saving}>{saving ? tr("กำลังบันทึก…") : tr("บันทึก")}</button>
      </BottomBar>

      {bankSheet && (
        <MobileSheet title={tr("เลือกธนาคาร")} onClose={() => setBankSheet(false)}>
          <div className="ksm-search dp-search dp-banksearch">
            <KsIcon name="search" />
            <input type="search" value={bankQuery} onChange={event => setBankQuery(event.target.value)} placeholder={tr("ค้นหาธนาคาร")} aria-label={tr("ค้นหาธนาคาร")} enterKeyHint="search" />
          </div>
          {(() => {
            const q = bankQuery.trim().toLowerCase();
            const banks = THAI_BANKS.filter(bank => !q || bank.name.toLowerCase().includes(q) || tr(bank.name).toLowerCase().includes(q) || bank.code.toLowerCase().includes(q));
            return (
              <div className="dp-card dp-sheet-list" role="listbox" aria-label={tr("ธนาคาร")}>
                {banks.map(bank => {
                  const on = knownBank?.code === bank.code;
                  return (
                    <button key={bank.code} type="button" role="option" aria-selected={on} className={`dp-row${on ? ' is-selected' : ''}`}
                      onClick={() => { setBankOther(false); set('bankName', bank.name); setBankSheet(false); }}>
                      <BankLogo bank={bank} size={34} />
                      <span className="dp-row-text"><b>{tr(bank.name)}</b><span>{bank.code}</span></span>
                      {on && <Check size={18} className="dp-accent" aria-hidden="true" />}
                    </button>
                  );
                })}
                {banks.length === 0 && <p className="dp-note" style={{ padding: '4px 14px 12px' }}>{tr("ไม่พบธนาคารนี้ ลองเลือก “อื่น ๆ” แล้วพิมพ์ชื่อเอง")}</p>}
                <button type="button" role="option" aria-selected={!knownBank && Boolean(profile.bankName || bankOther)} className="dp-row"
                  onClick={() => { setBankOther(true); if (knownBank) set('bankName', ''); setBankSheet(false); }}>
                  <span className="dp-tile is-neutral" aria-hidden="true"><PenLine size={17} /></span>
                  <span className="dp-row-text"><b>{tr("อื่น ๆ (พิมพ์ชื่อเอง)")}</b><span>{tr("เช่น พร้อมเพย์")}</span></span>
                </button>
              </div>
            );
          })()}
        </MobileSheet>
      )}
      {brand && (
        <MobileSheet title={brand === 'logo' ? tr("โลโก้ธุรกิจ") : tr("ลายเซ็นผู้ออกเอกสาร")} onClose={() => setBrand(null)}>
          <div className="dp-brandsheet">
            {brand === 'logo' ? (
              <BrandImageField title={tr("โลโก้ธุรกิจ")} hint={tr("แสดงที่ส่วนหัวของเอกสารทุกประเภท และใช้เป็นตราประทับผู้ขาย")} emptyLabel={tr("ไม่มีโลโก้")} uploadLabel={tr("อัปโหลดโลโก้")} removeLabel={tr("ลบโลโก้")}
                value={profile.logoUrl} onChange={logoUrl => setProfile(current => ({ ...current, logoUrl }))} onError={m.notify}
                size={{ label: tr("ขนาดโลโก้บนเอกสาร"), value: profile.logoHeight || DEFAULT_LOGO_HEIGHT, min: MIN_LOGO_HEIGHT, max: MAX_LOGO_HEIGHT, onChange: logoHeight => setProfile(current => ({ ...current, logoHeight })) }}
                extra={(
                  <div className="dp-chips" role="group" aria-label={tr("ตำแหน่งโลโก้")}>
                    {([['left', tr("ซ้าย")], ['center', tr("กลาง")], ['right', tr("ขวา")]] as const).map(([key, label]) => (
                      <button key={key} type="button" aria-pressed={position === key} aria-checked={position === key} role="radio" onClick={() => setProfile(current => ({ ...current, logoPosition: key }))}>{label}</button>
                    ))}
                  </div>
                )} />
            ) : (
              <BrandImageField title={tr("ลายเซ็นผู้ออกเอกสาร")} hint={tr("แสดงเหนือเส้นลายเซ็นในช่อง “ผู้ออกเอกสาร” แนะนำไฟล์ PNG พื้นหลังโปร่งใส")} emptyLabel={tr("ไม่มีลายเซ็น")} uploadLabel={tr("อัปโหลดลายเซ็น")} removeLabel={tr("ลบลายเซ็น")}
                value={profile.signatureUrl} onChange={signatureUrl => setProfile(current => ({ ...current, signatureUrl }))} onError={m.notify} />
            )}
            <button type="button" className="dp-primary is-wide" onClick={() => setBrand(null)}>{tr("เสร็จ")}</button>
            <p className="dp-note">{tr("กด บันทึก ด้านล่างของหน้าเพื่อเก็บรูปนี้")}</p>
          </div>
        </MobileSheet>
      )}
      {viewer && <Viewer invoice={sample} watermark={false} onClose={() => setViewer(false)} actions={<button type="button" className="dp-viewer-btn is-wide" onClick={() => setViewer(false)}>{tr("กลับไปแก้ไข")}</button>} />}
    </>
  );
}

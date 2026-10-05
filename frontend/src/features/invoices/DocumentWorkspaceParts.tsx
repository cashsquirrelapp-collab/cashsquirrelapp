import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Copy, Download, Mail, Maximize2, Minus, MoreHorizontal, Plus, Share2, X } from 'lucide-react';
import type { DocumentType, Invoice } from '../../../../shared/types';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { A4_HEIGHT_PX, A4_WIDTH_PX, DocumentPreview, calculateDocumentTotals, getDocumentMeta, paginateItems } from './DocumentA4';

// Workspace pieces for the เอกสาร page: the fit-to-page preview canvas, the share menu, and the
// small menus. The A4 templates themselves (DocumentA4) are untouched.

const ZOOM_STEPS = [0.5, 0.65, 0.75, 0.9, 1, 1.25, 1.5];
const PAGE_GAP = 16; // .da4-sheet gap between pages

/**
 * The A4 preview, sized to show the whole page by default ("พอดีหน้า"). Zooming past that
 * scrolls inside the canvas, never the whole app page.
 */
export function PreviewCanvas({ invoice, className = '' }: { invoice: Invoice; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [zoom, setZoom] = React.useState<number | null>(null); // null = fit page
  const [page, setPage] = React.useState(1);
  const pages = React.useMemo(() => paginateItems(invoice).length, [invoice]);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => { setPage(1); ref.current?.scrollTo({ top: 0 }); }, [invoice.id]);

  const pad = box.w < 640 ? 16 : 40;
  const fit = box.w && box.h ? Math.max(0.25, Math.min((box.w - pad * 2) / A4_WIDTH_PX, (box.h - pad * 2) / A4_HEIGHT_PX, 1.25)) : 0.6;
  const scale = zoom ?? fit;
  const pageStride = (A4_HEIGHT_PX + PAGE_GAP) * scale;

  const step = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find(z => z > scale + 0.001) : [...ZOOM_STEPS].reverse().find(z => z < scale - 0.001);
    if (next) setZoom(next);
  };
  const goPage = (n: number) => {
    const target = Math.min(pages, Math.max(1, n));
    setPage(target);
    ref.current?.scrollTo({ top: (target - 1) * pageStride, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el || pages < 2) return;
    setPage(Math.min(pages, Math.floor((el.scrollTop + pageStride / 3) / pageStride) + 1));
  };

  const ctrl = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-35 cursor-pointer disabled:cursor-default';
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-brand-border bg-[#F1EFEC] dark:bg-[#141518] ${className}`}>
      <div ref={ref} onScroll={onScroll} data-testid="document-preview-canvas" className="min-h-0 flex-1 overflow-auto" style={{ padding: pad }}>
        <div className="mx-auto w-max">
          <DocumentPreview invoice={invoice} scale={scale} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-brand-border bg-brand-white px-2 py-1.5 dark:bg-[#1B1C20]">
        <div className="flex items-center gap-0.5" aria-label="หน้าเอกสาร">
          {pages > 1 ? (
            <>
              <button type="button" onClick={() => goPage(page - 1)} disabled={page <= 1} aria-label="หน้าก่อนหน้า" className={ctrl}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 text-xs tabular-nums text-brand-muted">{page} / {pages}</span>
              <button type="button" onClick={() => goPage(page + 1)} disabled={page >= pages} aria-label="หน้าถัดไป" className={ctrl}><ChevronRight className="h-4 w-4" /></button>
            </>
          ) : <span className="px-2 text-xs text-brand-muted">1 / 1</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => step(-1)} disabled={scale <= ZOOM_STEPS[0] + 0.001} aria-label="ย่อ" className={ctrl}><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-11 text-center text-xs tabular-nums text-brand-text" aria-live="polite">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => step(1)} disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1] - 0.001} aria-label="ขยาย" className={ctrl}><Plus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom(null)} aria-pressed={zoom === null}
            className={`${ctrl} ml-1 gap-1 border ${zoom === null ? 'border-[#F3B08C] bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'border-brand-border'}`}>
            <Maximize2 className="h-3.5 w-3.5" /> พอดีหน้า
          </button>
        </div>
      </div>
    </div>
  );
}

/** The message a user pastes to their client, from the document's real values only. */
export function shareMessage(inv: Invoice): string {
  const meta = getDocumentMeta(inv.documentType);
  const amount = formatCurrency(calculateDocumentTotals(inv.items, inv.vatRate, inv.whtRate).payable);
  const lines = ['สวัสดีครับ', `ส่ง${meta.th} ${inv.documentNo}`];
  if (inv.documentType === 'quotation') {
    lines.push(`ยอดรวม ${amount}`);
    if (inv.dueDate) lines.push(`ยืนราคาถึง ${safeFormatThaiDate(inv.dueDate)}`);
  } else {
    lines.push(`ยอด ${amount}`);
    if ((inv.documentType === 'invoice' || inv.documentType === 'taxInvoice') && inv.dueDate) lines.push(`กำหนดชำระ ${safeFormatThaiDate(inv.dueDate)}`);
  }
  lines[lines.length - 1] += ' ครับ';
  return lines.join('\n');
}

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close, root]);
}

/**
 * "แชร์ให้ลูกค้า": the device's own share sheet (LINE, Messenger, AirDrop... appear there when
 * installed), copy a ready message, email, or save the PDF. There is no public document link and
 * no direct LINE send, so neither is offered. On phones with a share sheet it opens directly.
 */
export function ShareButton({ invoice, onDownload, onEmail, notify, className = '' }: {
  invoice: Invoice; onDownload: () => void; onEmail: () => void; notify: (title: string, message: string) => void; className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef);
  const meta = getDocumentMeta(invoice.documentType);
  const text = shareMessage(invoice);

  const nativeShare = async () => {
    setOpen(false);
    try { await navigator.share({ title: `${meta.th} ${invoice.documentNo}`, text }); }
    catch (e) { if ((e as Error)?.name !== 'AbortError') notify('แชร์ไม่สำเร็จ', 'ลองคัดลอกข้อความ หรือดาวน์โหลด PDF แทน'); }
  };
  const copy = async () => {
    setOpen(false);
    try { await navigator.clipboard.writeText(text); notify('คัดลอกข้อความแล้ว', 'วางในแชตกับลูกค้า แล้วแนบไฟล์ PDF ได้เลย'); }
    catch { notify('คัดลอกไม่สำเร็จ', text); }
  };
  const onClick = () => {
    if (canNativeShare() && window.matchMedia('(max-width: 639px)').matches) { void nativeShare(); return; }
    setOpen(v => !v);
  };

  const item = 'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-faint cursor-pointer';
  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button type="button" onClick={onClick} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
        <Share2 className="h-4 w-4" /> แชร์ให้ลูกค้า
      </button>
      {open && (
        <div role="menu" aria-label="แชร์เอกสาร" className="absolute right-0 top-[calc(100%+6px)] z-40 w-[300px] rounded-2xl border border-brand-border bg-brand-white p-2 shadow-xl dark:bg-[#1F2024]">
          <div className="flex items-center justify-between px-3 pb-1 pt-1.5">
            <p className="text-[13px] font-semibold text-brand-text">แชร์เอกสาร</p>
            <button type="button" onClick={close} aria-label="ปิด" className="rounded-lg p-1 text-brand-muted hover:bg-brand-faint cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          {canNativeShare() && (
            <button type="button" role="menuitem" onClick={nativeShare} className={item}>
              <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-[#C24A16]" />
              <span><span className="block text-[13px] font-medium text-brand-text">แชร์ผ่านแอป</span><span className="block text-xs text-brand-muted">เปิดเมนูแชร์ของเครื่อง เลือก LINE หรือแอปที่ใช้คุยกับลูกค้า</span></span>
            </button>
          )}
          <button type="button" role="menuitem" onClick={copy} className={item}>
            <Copy className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
            <span><span className="block text-[13px] font-medium text-brand-text">คัดลอกข้อความ</span><span className="block text-xs text-brand-muted">ข้อความพร้อมเลขที่และยอด สำหรับส่งให้ลูกค้า</span></span>
          </button>
          {invoice.client.email && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onEmail(); }} className={item}>
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
              <span><span className="block text-[13px] font-medium text-brand-text">ส่งทางอีเมล</span><span className="block truncate text-xs text-brand-muted">{invoice.client.email}</span></span>
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onDownload(); }} className={item}>
            <Download className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />
            <span><span className="block text-[13px] font-medium text-brand-text">ดาวน์โหลด PDF</span><span className="block text-xs text-brand-muted">บันทึกไฟล์ก่อนแล้วส่งเอง</span></span>
          </button>
          {!canNativeShare() && <p className="px-3 pb-1.5 pt-1 text-[11px] leading-relaxed text-brand-muted">เบราว์เซอร์นี้ไม่มีเมนูแชร์ของเครื่อง ใช้คัดลอกข้อความคู่กับไฟล์ PDF แทนได้</p>}
        </div>
      )}
    </div>
  );
}

/** ⋯ menu for one document row, drawn above everything so the list never clips it. */
export function RowMenu({ label, items }: { label: string; items: { label: string; run: () => void; danger?: boolean }[] }) {
  const [pos, setPos] = React.useState<{ top: number; left: number; up: boolean } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setPos(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    const onScroll = () => setPos(null);
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [pos]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const up = r.bottom + 140 > window.innerHeight;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.right - 180, window.innerWidth - 188)), up });
  };
  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(pos)}
        className="shrink-0 rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><MoreHorizontal className="h-4 w-4" /></button>
      {pos && createPortal(
        <div ref={menuRef} role="menu" className="fixed z-[150] w-[180px] rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-[#1F2024]"
          style={{ top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : undefined }}>
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setPos(null); it.run(); }}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${it.danger ? 'text-[#C43A3A] hover:bg-[#FDEEEE] dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10' : 'text-brand-text hover:bg-brand-faint'}`}>
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** "+ ออกเอกสารใหม่": pick the type first, so the form opens on the right document. */
export function NewDocumentButton({ types, onPick, label = 'ออกเอกสารใหม่' }: { types: DocumentType[]; onPick: (type: DocumentType) => void; label?: string }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef);
  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
        <Plus className="h-4 w-4" /> {label}
      </button>
      {open && (
        <div role="menu" aria-label="สร้างเอกสารใหม่" className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-[#1F2024]">
          <p className="px-3 pb-1 pt-1.5 text-xs text-brand-muted">สร้างเอกสารใหม่</p>
          {types.map(type => (
            <button key={type} type="button" role="menuitem" onClick={() => { setOpen(false); onPick(type); }}
              className="flex w-full rounded-lg px-3 py-2 text-left text-[13px] text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
              {getDocumentMeta(type).th}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

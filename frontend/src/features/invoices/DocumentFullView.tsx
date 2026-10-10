import React from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';
import type { Invoice } from '../../../../shared/types';
import { A4_WIDTH_PX, DocumentPreview } from './DocumentA4';

// The selected document fills the available width so its text stays readable. The preview keeps
// its own vertical scroll for the rest of the A4 page (and any following pages), so a short browser
// window no longer shrinks a wide preview down to a thumbnail. Clicking the paper or the
// ขยายเต็มจอ button above it opens the same document full screen. Nothing is drawn over the paper.

const PAD = 20;
const BAR = 40; // the row above the paper with ขยายเต็มจอ

export function DocumentFullView({ invoice, className = '' }: { invoice: Invoice; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => { ref.current?.scrollTo({ top: 0 }); }, [invoice.id]);

  const fitW = box.w ? (box.w - PAD * 2) / A4_WIDTH_PX : 0.6;
  const scale = Math.max(0.3, Math.min(fitW, 1.1));
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div ref={ref} tabIndex={0} role="region" aria-label={`เอกสาร ${invoice.documentNo}`} data-testid="document-view"
      className={`relative min-h-0 overflow-y-auto overscroll-contain rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E65F2B]/40 ${className}`}>
      <div className="flex justify-end px-5 pt-2" style={{ height: BAR }}>
        <button type="button" onClick={() => setExpanded(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand-border bg-brand-white px-3 text-xs font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
          <Maximize2 className="h-3.5 w-3.5" />ขยายเต็มจอ
        </button>
      </div>
      <div key={invoice.id} className="doc-view-enter flex justify-center" style={{ padding: PAD, paddingTop: 4 }}>
        <button type="button" onClick={() => setExpanded(true)} aria-label="ขยายเอกสารเต็มจอ" title="กดเพื่อดูเต็มจอ" tabIndex={-1}
          className="relative block cursor-zoom-in rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#E65F2B]">
          <DocumentPreview invoice={invoice} scale={scale} />
        </button>
      </div>
      {expanded && <FullScreenDocument invoice={invoice} onClose={() => setExpanded(false)} />}
      <style>{`
        @keyframes docViewEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .doc-view-enter { animation: docViewEnter 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) { .doc-view-enter { animation: none; } }
      `}</style>
    </div>
  );
}

/** The document over the whole screen, as wide as reads comfortably; scroll for the rest. */
function FullScreenDocument({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const [w, setW] = React.useState(() => window.innerWidth);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onResize = () => setW(window.innerWidth);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); document.body.style.overflow = overflow; };
  }, [onClose]);
  const scale = Math.min(1.25, (Math.min(w, 1000) - (w < 640 ? 24 : 96)) / A4_WIDTH_PX);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`ดูเอกสาร ${invoice.documentNo} เต็มจอ`} data-testid="document-fullscreen"
      className="doc-full-enter fixed inset-0 z-[220] overflow-y-auto bg-[rgba(20,18,16,0.82)] backdrop-blur-sm" onClick={onClose}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 text-white sm:px-6">
        <p className="truncate text-sm font-semibold">{invoice.documentNo}<span className="ml-2 font-normal text-white/60">{invoice.client?.name}</span></p>
        <button type="button" onClick={onClose} aria-label="ปิดเต็มจอ" autoFocus
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 cursor-pointer"><X className="h-5 w-5" /></button>
      </div>
      <div className="flex justify-center px-3 pb-10 sm:px-12" onClick={e => e.stopPropagation()}>
        <DocumentPreview invoice={invoice} scale={scale} />
      </div>
      <style>{`
        @keyframes docFullEnter { from { opacity: 0; } to { opacity: 1; } }
        .doc-full-enter { animation: docFullEnter 180ms ease-out both; }
        @media (prefers-reduced-motion: reduce) { .doc-full-enter { animation: none; } }
      `}</style>
    </div>,
    document.body,
  );
}

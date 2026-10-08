import React from 'react';
import type { Invoice } from '../../../../shared/types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, DocumentPreview } from './DocumentA4';

// The selected document, a whole A4 page at once: scaled to fit the space it has (width and
// height), centred. A document with more pages scrolls down to the next ones.

const PAD = 20;

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
  const fitH = box.h ? (box.h - PAD * 2) / A4_HEIGHT_PX : 0.6;
  const scale = Math.max(0.3, Math.min(fitW, fitH, 1.1));

  return (
    <div ref={ref} tabIndex={0} role="region" aria-label={`เอกสาร ${invoice.documentNo}`} data-testid="document-view"
      className={`relative min-h-0 overflow-y-auto overscroll-contain rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E65F2B]/40 ${className}`}>
      <div key={invoice.id} className="doc-view-enter flex justify-center" style={{ padding: PAD }}>
        <DocumentPreview invoice={invoice} scale={scale} />
      </div>
      <style>{`
        @keyframes docViewEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .doc-view-enter { animation: docViewEnter 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) { .doc-view-enter { animation: none; } }
      `}</style>
    </div>
  );
}

import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/** ⋯ menu for a list row, drawn above everything (portal) so scrolling lists never clip it. */
export function RowMenu({ label, items }: { label: string; items: { label: string; run: () => void; danger?: boolean }[] }) {
  const [pos, setPos] = React.useState<{ top: number; left: number; up: boolean } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setPos(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    // Follow the button while the page or a list scrolls, rather than vanishing mid-click.
    const onScroll = () => {
      const btn = btnRef.current;
      if (!btn) { setPos(null); return; }
      const r = btn.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { setPos(null); return; }
      setPos(p => p && { ...p, top: p.up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.right - 180, window.innerWidth - 188)) });
    };
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


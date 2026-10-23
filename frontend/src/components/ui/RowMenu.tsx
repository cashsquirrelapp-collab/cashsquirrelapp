import React from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, MoreVertical, type LucideIcon } from 'lucide-react';

/** ⋯ menu for a list row, drawn above everything (portal) so scrolling lists never clip it.
 * iOS look (owner, 2026-10-23): a grey round ⋯ button and a frosted menu, label left and icon right. */
export interface RowMenuItem { label: string; run: () => void; danger?: boolean; icon?: LucideIcon }

export function RowMenu({ label, items, vertical = false, width = 180 }: { label: string; items: RowMenuItem[]; vertical?: boolean; width?: number }) {
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
      setPos(p => p && { ...p, top: p.up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) });
    };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true); };
  }, [pos]);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const up = r.bottom + 140 > window.innerHeight;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), up });
  };
  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(pos)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(118,118,128,0.12)] text-brand-text/75 transition-colors hover:bg-[rgba(118,118,128,0.2)] hover:text-brand-text aria-expanded:bg-[var(--glass-active)] aria-expanded:text-[#C24A16] dark:aria-expanded:text-[#FFA473] cursor-pointer">{vertical ? <MoreVertical className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}</button>
      {pos && createPortal(
        <div ref={menuRef} role="menu" className="lg-glass is-menu fixed z-[250] rounded-[20px] p-1.5"
          style={{ top: pos.top, left: pos.left, width, transform: pos.up ? 'translateY(-100%)' : undefined }}>
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setPos(null); it.run(); }}
              className={`flex w-full items-center gap-2.5 rounded-[14px] px-3 py-2 text-left text-[13px] leading-5 transition-colors cursor-pointer ${it.danger ? 'text-[#C43A3A] hover:bg-[#C43A3A]/[0.08] dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10' : 'text-brand-text hover:bg-black/[0.05] dark:hover:bg-white/[0.07]'}`}>
              <span className="min-w-0 flex-1">{it.label}</span>{it.icon && <it.icon className="h-4 w-4 shrink-0" strokeWidth={1.7} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, X } from 'lucide-react';

/**
 * Right-side drawer (full-screen sheet on phones). The page keeps a single one: changing
 * `viewKey` swaps its content in place (with `onBack` for a back arrow) rather than opening a
 * second panel on top.
 */
export function Drawer({ open, title, onClose, onBack, children, footer, width = 520, z = 200, viewKey }: {
  open: boolean; title: string; onClose: () => void; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; z?: number; viewKey?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: z }}>
          <motion.div className="absolute inset-0 bg-[rgba(20,18,16,0.38)]" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-white shadow-[0_0_40px_rgba(20,18,16,0.2)] dark:bg-[#1B1C20]"
            style={{ maxWidth: width }}>
            <div className="flex items-center justify-between gap-3 border-b border-brand-border px-5 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-1.5">
                {onBack && <button type="button" onClick={onBack} aria-label="กลับ" className="-ml-1.5 rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><ArrowLeft className="h-5 w-5" /></button>}
                <h2 className="truncate text-base font-semibold text-brand-text">{title}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1.5 text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"><X className="h-5 w-5" /></button>
            </div>
            <motion.div key={viewKey} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
              {footer && <div className="border-t border-brand-border px-5 py-4 sm:px-6">{footer}</div>}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}


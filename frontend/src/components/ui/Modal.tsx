import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';

import { tr } from '../../i18n/tr';
/** Centered dialog (bottom sheet on phones) with a close button; Escape and the backdrop close it. */
export function Modal({ open, onClose, label, children, width = 460 }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode; width?: number }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[215] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-brand-border bg-brand-white shadow-xl dark:bg-[#1B1C20] sm:rounded-2xl"
            style={{ maxWidth: width }}>
            {/* iOS-style close: a grey round button (owner, 2026-10-23). */}
            <button type="button" onClick={onClose} aria-label={tr("ปิด")} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(118,118,128,0.12)] text-brand-text/70 transition-colors hover:bg-[rgba(118,118,128,0.2)] hover:text-brand-text cursor-pointer"><X className="h-4 w-4" strokeWidth={2.2} /></button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

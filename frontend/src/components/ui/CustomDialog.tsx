import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CustomDialogState } from '../../../../shared/types';
import { AlertCircle, HelpCircle, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface CustomDialogProps {
  dialog: CustomDialogState;
  onClose: () => void;
}

export default function CustomDialog({ dialog, onClose }: CustomDialogProps) {
  const { t } = useLanguage();
  const [inputValue, setInputValue] = useState(dialog.defaultValue || '');

  useEffect(() => {
    setInputValue(dialog.defaultValue || '');
  }, [dialog.defaultValue, dialog.isOpen]);

  if (!dialog.isOpen) return null;

  const handleConfirm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    dialog.onConfirm(inputValue);
    onClose();
  };

  const handleCancel = () => {
    if (dialog.onCancel) dialog.onCancel();
    onClose();
  };

  // Titles like "ดาวน์โหลดสำเร็จ" / "Saved!" are good news, not a caution — show a checkmark
  // instead of the exclamation-mark icon so success actually reads as success. Bilingual since
  // dialog.title comes from t() and can be Thai or English depending on the app's language;
  // "ไม่สำเร็จ" / "Unsuccessful" (failed) stay on the regular alert icon.
  const isSuccessAlert = /สำเร็จ|success|saved|allocated|updated|confirmed|deposited|created|uploaded|ready/i.test(dialog.title)
    && !/ไม่สำเร็จ|unsuccessful|failed|error/i.test(dialog.title);

  const getIcon = () => {
    switch (dialog.type) {
      case 'alert':
        return isSuccessAlert
          ? <CheckCircle className="w-8 h-8 text-emerald-500 shrink-0" />
          : <AlertCircle className="w-8 h-8 text-amber-500 shrink-0" />;
      case 'prompt':
        return <HelpCircle className="w-8 h-8 text-indigo-500 shrink-0" />;
      default:
        return <AlertCircle className="w-8 h-8 text-rose-500 shrink-0" />;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 overflow-y-auto" role="presentation">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleCancel}
          className="fixed inset-0 bg-[#302018]/25 backdrop-blur-[2px] cursor-pointer"
        />

        {/* Dialog Box */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title}
          className="relative bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-[22px] p-6 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-brand-faint dark:bg-neutral-800 rounded-2xl">
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-brand-text dark:text-white tracking-tight">
                {dialog.title}
              </h3>
              <p className="text-xs text-brand-muted dark:text-neutral-400 mt-1.5 leading-relaxed whitespace-pre-line">
                {dialog.message}
              </p>
            </div>
          </div>

          <form onSubmit={handleConfirm} className="space-y-4">
            {dialog.type === 'prompt' && (
              <input
                autoFocus
                type={dialog.inputType || 'text'}
                placeholder={dialog.placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full bg-brand-faint dark:bg-neutral-800/50 text-brand-text dark:text-white border border-brand-border dark:border-neutral-800 rounded-xl px-4 py-3 text-xs font-semibold outline-none focus:border-brand-green-acc focus:ring-4 focus:ring-brand-green-acc/10"
              />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {dialog.type !== 'alert' && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2.5 bg-brand-faint dark:bg-neutral-800 text-brand-text dark:text-neutral-300 rounded-xl text-xs font-bold hover:bg-brand-border/40 transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 bg-brand-green-acc hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-4 focus:ring-brand-green-acc/20"
              >
                {t('common.ok')}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

import { uiInput, uiPrimaryButton, uiSecondaryButton } from './uiStyles';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CustomDialogState } from '../../../../shared/types';
import { useLanguage } from '../../i18n/LanguageContext';
import { Mascot, type MascotAction, type MascotMood } from '../mascot/Mascot';
import { useMobileLayout } from '../../features/mobile/useMobileLayout';

interface CustomDialogProps {
  dialog: CustomDialogState;
  onClose: () => void;
}

export default function CustomDialog({ dialog, onClose }: CustomDialogProps) {
  const { t } = useLanguage();
  const phone = useMobileLayout();
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


  // Phones (owner, 2026-10-21): a centred card, the official mascot in a square tile instead of an icon
  // (only its mood and what it holds change): a red "no" sign for a deletion, a celebration for good news.
  const isDestructive = dialog.type === 'confirm' && /ลบ|ปิดบัญชี|ล้างข้อมูล|ยกเลิกการสมัคร|delete|remove|close account/i.test(dialog.title);
  const mascotPose: { mood: MascotMood; action: MascotAction } = isDestructive ? { mood: 'thinking', action: 'hold-cross' }
    : dialog.type === 'alert' ? (isSuccessAlert ? { mood: 'happy', action: 'celebrate' } : { mood: 'checking', action: 'idle' })
    : dialog.type === 'prompt' ? { mood: 'thinking', action: 'hold-document' }
    : { mood: 'thinking', action: 'idle' };
  if (phone) {
    return createPortal(
      <AnimatePresence>
        <div className="ksm ksm-modal ksm-confirm fixed inset-0 z-[999] flex items-center justify-center p-5" role="presentation">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCancel}
            className="fixed inset-0 bg-[#302018]/35 backdrop-blur-[3px] cursor-pointer" />
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog" aria-modal="true" aria-label={dialog.title} className="ksm-confirm-card">
            <span className={`ksm-confirm-mascot${isDestructive ? ' is-destructive' : ''}`} aria-hidden="true">
              <Mascot mood={mascotPose.mood} action={mascotPose.action} animated={false} size={108} />
            </span>
            <h3 className="ksm-confirm-title">{dialog.title}</h3>
            <p className="ksm-confirm-message">{dialog.message}</p>
            <form onSubmit={handleConfirm} className="ksm-confirm-form">
              {dialog.type === 'prompt' && (
                <input autoFocus type={dialog.inputType || 'text'} placeholder={dialog.placeholder} value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)} className={uiInput} />
              )}
              <div className={`ksm-confirm-actions${dialog.type === 'alert' ? ' is-single' : ''}`}>
                {dialog.type !== 'alert' && <button type="button" onClick={handleCancel} className={uiSecondaryButton}>{t('common.cancel')}</button>}
                <button type="submit" className={`${uiPrimaryButton}${isDestructive ? ' is-destructive' : ''}`}>{t(dialog.type === 'alert' ? 'common.ok' : 'common.confirm')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatePresence>,
      document.body
    );
  }

  // Portaled straight to <body>, not rendered inline in the app tree -- DashboardTab/JobsTab/
  // JobDetailModal's own modals already portal there too, and any of them can trigger this dialog
  // (e.g. the Dashboard quick-pay list's "ได้เงินครบแล้ว" confirm). An inline z-[999] here still
  // loses to a later document.body portal once *any* ancestor between this component and <body>
  // picks up a transform/filter/backdrop-filter (each opens its own stacking context, which traps
  // "fixed" positioning and makes the z-index only compare within that ancestor) -- the dialog was
  // still in the DOM and technically clickable at its coordinates, just painted underneath instead
  // of on top, so confirming from inside another modal silently did nothing the user could see.
  return createPortal(
    <AnimatePresence>
      <div className="ksm-modal fixed inset-0 z-[999] flex items-center justify-center p-4 overflow-y-auto" role="presentation">
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
          {/* Computers and iPads (owner, 2026-10-21): the official mascot beside the message instead of an icon,
              in the same pose the phone card uses; the layout stays a desktop dialog (text left, actions right). */}
          <div className="flex items-center gap-4">
            <span className="shrink-0" aria-hidden="true">
              <Mascot mood={mascotPose.mood} action={mascotPose.action} animated={false} size={76} />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-[16px] font-semibold leading-snug text-brand-text dark:text-white">
                {dialog.title}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-brand-muted dark:text-neutral-400 whitespace-pre-line">
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
                className={uiInput}
              />
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              {dialog.type !== 'alert' && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className={uiSecondaryButton}
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                type="submit"
                className={uiPrimaryButton}
              >
                {t(dialog.type === 'alert' ? 'common.ok' : 'common.confirm')}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

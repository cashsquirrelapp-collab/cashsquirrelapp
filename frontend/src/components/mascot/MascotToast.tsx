import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { mascotBus, type MascotToastEvent, type ToastTone } from '../../mascotBus';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { formatCurrency } from '../../utils';

// The notifications at the top right (top of the screen on phones): what was just saved, changed,
// removed or could not be done. One calm layout for all of them: a status icon, a short heading,
// one supporting line, and a thin line that runs out as the notification is about to leave.
// Frosted glass (owner, 2026-10-23), with the strong fill so the page behind never reads through.
const TONES: Record<ToastTone, { icon: typeof Info; chip: string; line: string }> = {
  success: { icon: CheckCircle2, chip: 'bg-[#E9F8F1] text-[#18A66A] dark:bg-[#18A66A]/15 dark:text-[#4ADE80]', line: 'bg-[#18A66A] dark:bg-[#4ADE80]' },
  info: { icon: Info, chip: 'bg-brand-faint text-brand-muted', line: 'bg-brand-muted' },
  warning: { icon: AlertTriangle, chip: 'bg-[#FDF6EC] text-[#C17817] dark:bg-[#F2B76B]/15 dark:text-[#F2B76B]', line: 'bg-[#C17817] dark:bg-[#F2B76B]' },
  error: { icon: AlertCircle, chip: 'bg-[#FDEEEE] text-[#C43A3A] dark:bg-[#FA7E52]/15 dark:text-[#FA7E52]', line: 'bg-[#C43A3A] dark:bg-[#FA7E52]' },
};

const toneOf = (toast: MascotToastEvent): ToastTone =>
  toast.tone ?? (toast.mood === 'alert' ? 'warning' : toast.mood === 'sleepy' ? 'info' : 'success');

export function MascotToast() {
  const { t } = useLanguage();
  const [toasts, setToasts] = useState<MascotToastEvent[]>([]);

  useEffect(() => {
    const unsubscribe = mascotBus.subscribe((newToast) => {
      setToasts((prev) => [...prev, newToast].slice(-3)); // Limit to last 3 active toasts

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, newToast.duration || 4500);

      return () => clearTimeout(timer);
    });

    return unsubscribe;
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    // From 744px (46.5rem, in rem so it sorts after sm:) the toast sits just below the page header so it never covers its buttons
    // (เพิ่มงาน, ส่งออก): they end at 93px on desktop and 122px under the tablet top bar.
    <div aria-live="polite" className="fixed top-4 inset-x-4 sm:top-20 min-[46.5rem]:top-[132px] lg:top-[104px] sm:right-6 sm:left-auto z-[9999] flex flex-col gap-2.5 max-w-[calc(100vw-2rem)] sm:max-w-[380px] w-auto sm:w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const tone = toneOf(toast);
          const { icon: Icon, chip, line } = TONES[tone];
          return (
            <motion.div
              key={toast.id}
              layout
              role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
              data-tone={tone}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="app-toast lg-glass is-menu pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[20px] py-3 pl-3.5 pr-10 text-brand-text"
            >
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${chip}`} aria-hidden="true">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 select-text">
                <p className="text-sm font-semibold leading-5 text-brand-text">{toast.title || t(`toast.${tone}`)}</p>
                {toast.message && <p className="mt-0.5 break-words text-[13px] leading-5 text-brand-muted">{toast.message}</p>}
                {toast.amount !== undefined && (
                  <p className="mt-1 font-mono text-sm font-semibold text-[#18A66A] dark:text-[#4ADE80]">+{formatCurrency(toast.amount)}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label={t('toast.close')}
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
              <span
                aria-hidden="true"
                className={`app-toast-timer absolute inset-x-0 bottom-0 h-0.5 origin-left ${line}`}
                style={{ animationDuration: `${toast.duration || 4500}ms` }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

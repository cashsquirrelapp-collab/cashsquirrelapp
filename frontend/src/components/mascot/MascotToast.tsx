import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot } from './Mascot';
import { mascotBus, MascotToastEvent } from '../../mascotBus';
import { X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

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
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-[340px] md:max-w-sm w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -1 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="pointer-events-auto bg-white/95 dark:bg-brand-white/95 border border-brand-border/40 backdrop-blur-md rounded-2xl p-4 shadow-xl flex items-center gap-3 text-brand-text relative overflow-hidden"
          >
            {/* Top tiny colored highlight strip */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${
              toast.mood === 'celebrate' ? 'bg-amber-500' :
              toast.mood === 'alert' ? 'bg-red-500' :
              toast.mood === 'sleepy' ? 'bg-neutral-400' : 'bg-indigo-600 dark:bg-indigo-400'
            }`} />

            {/* Mascot Container */}
            <div className="flex-shrink-0 bg-brand-faint dark:bg-neutral-800/40 p-1.5 rounded-2xl border border-brand-border/20 self-start mt-0.5">
              <Mascot mood={toast.mood} size={50} animated={true} />
            </div>

            {/* Content speech bubble */}
            <div className="flex-grow text-xs font-semibold leading-relaxed pr-5 select-text">
              <p className="text-brand-text dark:text-neutral-100 font-display text-[13px] font-extrabold flex items-center gap-1">
                {toast.mood === 'happy' && t('toast.happy')}
                {toast.mood === 'celebrate' && t('toast.celebrate')}
                {toast.mood === 'alert' && t('toast.alert')}
                {toast.mood === 'sleepy' && t('toast.sleepy')}
              </p>
              <p className="text-brand-muted dark:text-neutral-300 mt-1 font-medium">{toast.message}</p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => removeToast(toast.id)}
              className="absolute top-2 right-2 text-brand-muted hover:text-brand-text p-1 rounded-full hover:bg-brand-faint/50 dark:hover:bg-neutral-800 transition-colors cursor-pointer pointer-events-auto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

import React from 'react';
import { motion } from 'motion/react';
import { X, FileText, MessageCircle, CreditCard, ArrowRight } from 'lucide-react';
import { IconCrown } from '../../components/ui/icons';
import { useLanguage } from '../../i18n/LanguageContext';

interface ProPromoModalProps {
  onUpgrade: () => void;
  onClose: () => void;
}

export const ProPromoModal: React.FC<ProPromoModalProps> = ({ onUpgrade, onClose }) => {
  const { t } = useLanguage();

  const FEATURES = [
    {
      icon: <IconCrown className="w-4 h-4 text-[#E65F2B]" />,
      bg: 'bg-[#E65F2B]/15',
      title: t('promo.feature1Title'),
      desc: t('promo.feature1Desc'),
    },
    {
      icon: <FileText className="w-4 h-4 text-white" />,
      bg: 'bg-[#E65F2B]',
      title: t('promo.feature2Title'),
      desc: t('promo.feature2Desc'),
    },
    {
      icon: <MessageCircle className="w-4 h-4 text-white" />,
      bg: 'bg-[#06C755]',
      title: t('promo.feature3Title'),
      desc: t('promo.feature3Desc'),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 rounded-3xl max-w-md w-full shadow-xl overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-white/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          aria-label={t('promo.close')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero: tagline + title + price on the left, illustration on the right (stacks on narrow screens) */}
        <div className="flex flex-col sm:flex-row items-center gap-3 px-6 pt-6 pb-4 bg-gradient-to-b from-[#FBF2E4] to-brand-white dark:from-neutral-800 dark:to-neutral-900 text-center sm:text-left">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-brand-muted -rotate-1">{t('promo.tagline')}</p>
            <h3 className="font-display font-black text-xl sm:text-2xl text-brand-text dark:text-white flex items-center justify-center sm:justify-start gap-1.5 mt-1">
              {t('login.brandName')} Pro <IconCrown className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473]" />
            </h3>
            <p className="inline-flex items-baseline gap-1 bg-[#E65F2B]/10 rounded-2xl px-3.5 py-1.5 mt-2.5">
              <span className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473]">฿149</span>
              <span className="text-xs text-brand-muted font-sans font-bold">{t('promo.perMonth')}</span>
            </p>
          </div>
          <img src="/pro-promo-hero.png" alt="" className="w-32 sm:w-36 shrink-0" />
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-2.5 px-5 py-5 border-t border-brand-border/60 dark:border-neutral-800">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center gap-1.5">
              <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${f.bg}`}>
                {f.icon}
              </span>
              <p className="text-[10px] font-black text-brand-text dark:text-white leading-tight">{f.title}</p>
              <p className="text-[9px] text-brand-muted leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full py-3.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-2xl text-sm font-black cursor-pointer flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            {t('plans.subscribeCta')}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-2 text-brand-muted hover:text-brand-text text-[11px] font-bold transition-colors cursor-pointer"
          >
            {t('promo.later')}
          </button>
          <p className="flex items-center justify-center gap-2.5 text-[10px] text-brand-muted mt-1">
            <span className="h-px w-7 bg-brand-border dark:bg-neutral-700" />
            {t('promo.footerTagline')}
            <span className="h-px w-7 bg-brand-border dark:bg-neutral-700" />
          </p>
        </div>
      </motion.div>
    </div>
  );
};

import React from 'react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';

interface PremiumUpsellProps {
  feature: string;
  description: string;
  onUpgrade: () => void;
}

export const PremiumUpsell: React.FC<PremiumUpsellProps> = ({ feature, description, onUpgrade }) => {
  const { t } = useLanguage();
  return (
    <div className="bg-brand-white dark:bg-stone-900 border border-brand-border rounded-3xl p-10 text-center flex flex-col items-center max-w-lg mx-auto">
      <Mascot mood="proud" size={100} className="mb-4" />
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#E65F2B] bg-[#E65F2B]/10 px-2.5 py-0.5 rounded-full mb-3">
        {t('premium.memberBadge')}
      </span>
      <h3 className="font-display font-black text-lg text-brand-text dark:text-white tracking-tight">
        {feature}
      </h3>
      <p className="text-xs text-brand-muted leading-relaxed mt-2 max-w-sm">
        {description}
      </p>
      <button
        onClick={onUpgrade}
        className="mt-6 px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-xl text-xs font-black cursor-pointer"
      >
        {t('premium.tryFree14')}
      </button>
    </div>
  );
};

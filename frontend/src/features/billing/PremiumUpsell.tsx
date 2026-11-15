import React from 'react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import { tr } from '../../i18n/tr';
import { formatBaht, proPriceDetails } from '../../../../shared/proPricing';

interface PremiumUpsellProps {
  feature: string;
  description: string;
  /** Kept for the caller; the long-ended ฿199 introduction is no longer shown. */
  introEligible: boolean;
  manageSubscription: boolean;
  onUpgrade: () => void;
}

export const PremiumUpsell: React.FC<PremiumUpsellProps> = ({ feature, description, manageSubscription, onUpgrade }) => {
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
        className={`mt-6 px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-xl text-xs font-black cursor-pointer`}
      >
        {manageSubscription ? t('plans.renewCta') : tr('สมัคร Pro')}
      </button>
      {/* Today's price, as the plans page and the card dialog charge it (2026-11-16: the ฿199-then-฿249 offer it showed has
          long ended). */}
      {!manageSubscription && <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-brand-muted">
        {tr('{0} ต่อเดือน รวมค่าธรรมเนียมชำระเงิน ปิดการต่ออายุได้ทุกเมื่อ', formatBaht(proPriceDetails('month').total))}
      </p>}
    </div>
  );
};

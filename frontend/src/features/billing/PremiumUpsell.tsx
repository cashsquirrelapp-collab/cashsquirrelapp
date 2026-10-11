import React from 'react';
import { Mascot } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';

interface PremiumUpsellProps {
  feature: string;
  description: string;
  introEligible: boolean;
  manageSubscription: boolean;
  onUpgrade: () => void;
}

export const PremiumUpsell: React.FC<PremiumUpsellProps> = ({ feature, description, introEligible, manageSubscription, onUpgrade }) => {
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
      {introEligible && !manageSubscription && (
        <span className="mt-4 inline-flex items-center rounded-full bg-[#FDE8DD] px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]">
          {t('plans.introBadge')}
        </span>
      )}
      <button
        onClick={onUpgrade}
        className={`${introEligible && !manageSubscription ? 'mt-3' : 'mt-6'} px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-xl text-xs font-black cursor-pointer`}
      >
        {t(manageSubscription ? 'plans.renewCta' : introEligible ? 'premium.subscribeIntro' : 'premium.subscribeStandard')}
      </button>
      <p className="mt-2 max-w-sm text-[10px] leading-relaxed text-brand-muted">
        {t(introEligible ? 'plans.paymentNote' : 'plans.standardPaymentNote')}
      </p>
    </div>
  );
};

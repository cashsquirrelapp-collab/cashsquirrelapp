import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';

interface PlansTabProps {
  isPro: boolean;
  isPaidActive: boolean;
  isInFreeTrial: boolean;
  trialEndsAt: Date | null;
  subscription: {
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null;
  onUpgrade: () => void;
}

const FREE_FEATURE_KEYS = ['plans.free1', 'plans.free2', 'plans.free3', 'plans.free4', 'plans.free5'];
const PRO_FEATURE_KEYS = ['plans.pro1', 'plans.pro2', 'plans.pro3', 'plans.pro4', 'plans.pro5'];

export const PlansTab: React.FC<PlansTabProps> = ({
  isPro,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  subscription,
  onUpgrade
}) => {
  const { t } = useLanguage();
  return (
    <div className="draft10-plans page-content space-y-7 max-w-3xl mx-auto pb-12">
      <div className="text-center space-y-1.5">
        <h1 className="font-display font-bold text-2xl text-brand-text dark:text-white">แพ็กเกจ</h1>
        <p className="text-xs text-brand-muted">{t('plans.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free card */}
        <div className="draft10-plan-card bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white">Free</h3>
            <p className="text-2xl font-black font-mono text-brand-text dark:text-white mt-1">฿0</p>
          </div>
          <ul className="space-y-2 border-t border-brand-border pt-4">
            {FREE_FEATURE_KEYS.slice(0,3).map((key) => <li key={key} className="text-[11px] text-brand-muted leading-relaxed">{t(key)}</li>)}
          </ul>
          <button type="button" disabled className="w-full rounded-lg bg-brand-faint py-3 text-xs font-bold text-brand-muted">{!isPro ? t('plans.currentPlan') : 'แพ็กเกจ Free'}</button>
        </div>

        {/* Pro card */}
        <div
          className="draft10-plan-card relative bg-brand-white dark:bg-stone-900 rounded-2xl p-6 space-y-5 border-2 border-[#E65F2B]"
        >
          <span className="absolute -top-3 left-6 rounded-md bg-[#E65F2B] px-3 py-1 text-[10px] font-bold text-white">แนะนำ</span>
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white flex items-center gap-1.5">
              Pro
            </h3>
            <p className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473] mt-1">
              ฿149<span className="text-xs text-brand-muted font-sans font-bold">{t('plans.perMonth')}</span>
            </p>
          </div>
          <ul className="space-y-2 border-t border-brand-border pt-4">
            {PRO_FEATURE_KEYS.slice(0,4).map((key) => <li key={key} className="text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">{t(key)}</li>)}
          </ul>
          <button type="button" onClick={onUpgrade} className="w-full rounded-lg bg-[#E65F2B] py-3 text-xs font-bold text-white">{isPaidActive ? t('plans.renewCta') : 'อัปเกรดเป็น Pro'}</button>
        </div>
      </div>
    </div>
  );
};

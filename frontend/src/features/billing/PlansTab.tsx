import React from 'react';
import { Check } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { dateLocale } from '../../utils';
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
  const statusText = isPaidActive && subscription?.currentPeriodEnd
    ? t('plans.statusActive', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : isInFreeTrial && trialEndsAt
    ? t('plans.statusTrial', { date: trialEndsAt.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : t('plans.statusNone');

  return (
    <div className="page-content space-y-6 max-w-4xl mx-auto pb-12">
      <div className="text-center space-y-1.5">
        <Mascot mood="proud" size={72} className="mx-auto mb-2" />
        <h2 className="font-display font-black text-xl text-brand-text dark:text-white">{t('plans.title')}</h2>
        <p className="text-xs text-brand-muted">{t('plans.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free card */}
        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 space-y-4">
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white">Free</h3>
            <p className="text-2xl font-black font-mono text-brand-text dark:text-white mt-1">฿0</p>
          </div>
          <ul className="space-y-2">
            {FREE_FEATURE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-1.5 text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">
                <Check className="w-3.5 h-3.5 text-brand-muted shrink-0 mt-0.5" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          {!isPro && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-brand-muted bg-brand-faint dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
              {t('plans.currentPlan')}
            </span>
          )}
        </div>

        {/* Pro card */}
        <div
          className={`relative bg-brand-white dark:bg-stone-900 rounded-3xl p-6 space-y-4 border-2 ${
            isPro ? 'border-[#E65F2B] shadow-[0_8px_30px_-10px_rgba(230,95,43,0.35)]' : 'border-brand-border dark:border-neutral-800'
          }`}
        >
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white flex items-center gap-1.5">
              Pro
            </h3>
            <p className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473] mt-1">
              ฿149<span className="text-xs text-brand-muted font-sans font-bold">{t('plans.perMonth')}</span>
            </p>
          </div>
          <ul className="space-y-2">
            {PRO_FEATURE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-1.5 text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          {isPaidActive ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              {t('plans.currentPlan')}
            </span>
          ) : isInFreeTrial ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
              {t('plans.freeTrialBadge')}
            </span>
          ) : null}
        </div>
      </div>

      {/* Status / CTA panel */}
      <div className="bg-gradient-to-br from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-3xl p-6 text-center space-y-3">
        <p className="text-xs text-brand-text dark:text-neutral-200 leading-relaxed max-w-md mx-auto">{statusText}</p>
        <button
          type="button"
          onClick={onUpgrade}
          className="px-8 py-3 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-2xl text-xs font-black cursor-pointer"
        >
          {isPaidActive ? t('plans.renewCta') : t('plans.subscribeCta')}
        </button>
        <p className="text-[10px] text-brand-muted">{t('plans.paymentNote')}</p>
      </div>
    </div>
  );
};

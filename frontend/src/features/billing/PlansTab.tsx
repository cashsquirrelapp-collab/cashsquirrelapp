import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { CreditCard, QrCode } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { PlanMascot } from './PlanMascot';
import './plans.css';
import { dateLocale } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';

interface PlansTabProps {
  freeDocumentsAvailable?: boolean;
  isPro: boolean;
  isGuestPreview: boolean;
  isPaidActive: boolean;
  isInFreeTrial: boolean;
  trialEndsAt: Date | null;
  subscription: {
    status: 'free' | 'incomplete' | 'incomplete_expired' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
    plan: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeStatus: 'incomplete' | 'incomplete_expired' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused' | null;
    hasSubscription: boolean;
    introEligible: boolean;
    managed: boolean;
  } | null;
  onUpgrade: () => void;
  onPromptPay: () => void;
  billingBusy: boolean;
}

const FREE_FEATURE_KEYS = ['plans.free1', 'plans.free2', 'plans.free3', 'plans.free4'];
// 6-month and yearly Pro are priced (owner, 2026-10-15) but checkout only sells monthly so far,
// so they are shown as coming soon and cannot be bought.
const LONG_PERIODS = ['halfYear', 'year'] as const;
const PRO_FEATURE_KEYS = ['plans.pro1', 'plans.pro2', 'plans.pro3', 'plans.pro4', 'plans.pro5'];

export const PlansTab: React.FC<PlansTabProps> = ({
  isPro,
  isGuestPreview,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  subscription,
  onUpgrade,
  onPromptPay,
  billingBusy,
  freeDocumentsAvailable = false,
}) => {
  const { t } = useLanguage();
  const isAdminGrant = subscription?.plan === 'admin_grant';
  const hasOpenManagedSubscription = Boolean(
    subscription?.hasSubscription
    && !['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );
  const hasTerminalManagedSubscription = Boolean(
    subscription?.hasSubscription
    && ['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );
  const hasPreservedPaidAccess = Boolean(
    isPaidActive && !hasOpenManagedSubscription && !isAdminGrant,
  );
  const introEligible = isGuestPreview || subscription?.introEligible === true;
  const statusText = isGuestPreview
    ? t('plans.guestPreviewStatus')
    : isAdminGrant
    ? t('plans.statusAdminGrant')
    : isPaidActive && hasTerminalManagedSubscription && subscription?.currentPeriodEnd
    ? t('plans.statusCanceledPaidThrough', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : isPaidActive && hasOpenManagedSubscription && subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd
    ? t('plans.statusCancelAt', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : isPaidActive && hasOpenManagedSubscription && subscription?.currentPeriodEnd
    ? t('plans.statusActive', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : isPaidActive && subscription?.currentPeriodEnd
    ? t('plans.statusLegacy', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : hasOpenManagedSubscription
    ? t('plans.statusManageRequired')
    : isInFreeTrial && trialEndsAt
    ? t('plans.statusTrial', { date: trialEndsAt.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) })
    : t('plans.statusNone');

  return (
    <div className="page-content mx-auto max-w-5xl pb-16">
      <PageHeader page="plans">
        <Mascot mood="happy" size={52} />
      </PageHeader>

      <section className="plan-comparison mt-7" aria-label={t('plans.compareLabel')}>
        <article className="plan-card rounded-[28px] border-2 border-brand-border bg-brand-white p-6 dark:bg-[#202126] sm:p-8">
          <div className="text-center">
            <p className="text-xs text-brand-muted">{t('plans.freeEyebrow')}</p>
            <h2 className="mt-1 text-3xl font-semibold">Free</h2>
          </div>
          <PlanMascot />
          <div className="plan-price border-b border-brand-border pb-6">
            {/* Side by side, ฿0 lines up with Pro's price under its "รายเดือน" row: an empty copy of that row. */}
            <div aria-hidden="true" className="invisible hidden items-center justify-center gap-2 lg:flex">
              <span className="text-xs font-semibold">&nbsp;</span>
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold">&nbsp;</span>
            </div>
            <div className="flex items-end justify-center gap-2 lg:mt-2"><span className="font-mono text-5xl font-semibold">฿0</span></div>
            <p className="mt-3 text-xs text-brand-muted">{t('plans.forever')}</p>
          </div>
          <ul className="plan-features" role="list">
            {FREE_FEATURE_KEYS.map(key => <li key={key}>{t(key)}</li>)}
            <li>{t(freeDocumentsAvailable ? 'plans.freeDocumentsAvailable' : 'plans.freeDocumentsForthcoming')}</li>
          </ul>
          <div className="pt-6">
            {!isPro && <p className="mb-3 text-xs font-semibold text-brand-muted">{t('plans.currentPlan')}</p>}
            <p className="text-xs leading-relaxed text-brand-muted">{t('plans.freeSummary')}</p>
          </div>
        </article>
        <article className="plan-card relative overflow-hidden rounded-[28px] border-2 border-[#E65F2B] bg-brand-white p-6 dark:bg-[#202126] sm:p-8">
          <div className="text-center">
            <p className="text-xs text-[#C24A16] dark:text-[#FFA473]">{t(introEligible ? 'plans.introBadge' : 'plans.proEyebrow')}</p>
            <h2 className="mt-1 text-3xl font-semibold">Pro</h2>
          </div>
          <PlanMascot featured />
          <div className="plan-price border-b border-brand-border pb-6" data-testid="pro-periods">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-semibold text-brand-text">{t('plans.monthlyLabel')}</span>
              {introEligible && <span className="rounded-full bg-[#FDE8DD] px-2.5 py-0.5 text-[11px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]">{t('plans.monthlyDiscountBadge')}</span>}
            </div>
            <div className="mt-2 flex items-end justify-center gap-2">
              {introEligible && <s className="pb-1.5 font-mono text-xl text-brand-muted decoration-[1.5px]"><span className="sr-only">{t('plans.regularPrice')} </span>฿249</s>}
              <span className="font-mono text-5xl font-semibold text-[#D95724] dark:text-[#FFA473]">{introEligible ? '฿199' : '฿249'}</span>
              <span className="pb-1 text-xs text-brand-muted">{t('plans.perMonth')}</span>
            </div>
            {introEligible ? <div className="mt-3">
              <p className="text-xs font-semibold text-[#A84319] dark:text-[#FFA473]">{t('plans.introPriceNote')}</p>
              <p className="mt-1 text-xs text-brand-muted">{t('plans.standardPrice')}</p>
            </div> : <p className="mt-3 text-xs text-brand-muted">{t('plans.standardOnlyNote')}</p>}
            <ul aria-label={t('plans.longPeriodsLabel')} className="mt-5 divide-y divide-brand-border rounded-2xl border border-brand-border text-left">
              {LONG_PERIODS.map(period => (
                <li key={period} className="flex items-center justify-between gap-3 px-4 py-3" data-period={period}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-brand-text">
                      {t(`plans.${period}Label`)}
                      <span className="rounded-full bg-[#FDE8DD] px-2 py-0.5 text-[10.5px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]">{t(`plans.${period}Badge`)}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-brand-muted">{t(`plans.${period}Average`)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[15px] font-semibold text-brand-text">{t(`plans.${period}Price`)}<span className="font-sans text-[11px] font-normal text-brand-muted">{t(`plans.${period}Per`)}</span></p>
                    <span className="mt-1 inline-block rounded-full bg-brand-faint px-2 py-0.5 text-[10.5px] font-semibold text-brand-muted dark:bg-neutral-800">{t('plans.periodComingSoon')}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <ul className="plan-features" role="list">
            {PRO_FEATURE_KEYS.map(key => <li key={key}>{t(key)}</li>)}
          </ul>

          <div className="mt-auto border-t border-brand-border pt-6">
            <div className="flex flex-wrap items-center gap-2">
              {isGuestPreview ? (
                <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{t('plans.guestPreviewBadge')}</span>
              ) : isPaidActive ? (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{t('plans.currentPlan')}</span>
              ) : isInFreeTrial ? (
                <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">{t('plans.freeTrialBadge')}</span>
              ) : null}
              <p className="text-[11px] leading-relaxed text-brand-muted">{statusText}</p>
            </div>

            {!isAdminGrant && !hasPreservedPaidAccess && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={onUpgrade} disabled={billingBusy} className={`${uiPrimaryButton} w-full`}>
                  {billingBusy ? t('plans.loadingCta') : isGuestPreview ? t('plans.guestCreateAccountCta') : hasOpenManagedSubscription ? t('plans.renewCta') : t(introEligible ? 'plans.subscribeCta' : 'plans.subscribeStandardCta')}
                </button>
                {!isGuestPreview && !hasOpenManagedSubscription && (
                  <button
                    type="button"
                    onClick={onPromptPay}
                    disabled={billingBusy}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E65F2B] px-4 py-2.5 text-xs font-semibold text-[#A84319] transition-colors hover:bg-[#FFF1E8] disabled:opacity-50 dark:text-[#FFA473] dark:hover:bg-[#E65F2B]/10"
                  >
                    {billingBusy ? t('plans.loadingCta') : t(introEligible ? 'plans.promptPayCta' : 'plans.promptPayStandardCta')}
                  </button>
                )}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="mt-6 border-y border-brand-border py-6" aria-labelledby="payment-methods-title">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="lg:w-48 lg:shrink-0">
            <h2 id="payment-methods-title" className="font-display text-base font-semibold text-brand-text dark:text-white">{t('plans.paymentMethodsTitle')}</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{t('plans.paymentMethodsSubtitle')}</p>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-0">
            <div className="flex gap-3 sm:pr-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-faint text-brand-text dark:bg-neutral-800 dark:text-white" aria-hidden>
                <CreditCard className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-brand-text dark:text-white">{t('plans.cardMethodTitle')}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{t(introEligible ? 'plans.cardMethodIntro' : 'plans.cardMethodStandard')}</p>
              </div>
            </div>
            <div className="flex gap-3 border-brand-border sm:border-l sm:pl-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/10 dark:text-[#FFA473]" aria-hidden>
                <QrCode className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[13px] font-semibold text-brand-text dark:text-white">{t('plans.qrMethodTitle')}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">{t(introEligible ? 'plans.qrMethodIntro' : 'plans.qrMethodStandard')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-brand-border p-5 text-xs leading-6" aria-label={t('plans.packageDetails')}>
        <h2 className="font-semibold">{t('plans.packageDetails')}</h2>
        <p>{t(freeDocumentsAvailable ? 'plans.localQuotasAvailable' : 'plans.localQuotasForthcoming')}</p>
        <p className="text-brand-muted">{t('plans.mediaForthcoming')}</p>
      </section>
      <aside className="mt-5 flex items-start gap-3 px-1 text-[11px] leading-relaxed text-brand-muted" aria-label={t('plans.roadmapLabel')}>
        <span className="mt-0.5 rounded-full bg-brand-faint px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-brand-muted dark:bg-neutral-800">{t('plans.roadmapLabel')}</span>
        <p className="pt-0.5">{t('plans.roadmapCopy')}</p>
      </aside>
    </div>
  );
};

import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { BarChart3, Calculator, Check, CheckCircle2, CreditCard, FileText, MessageCircle, QrCode } from 'lucide-react';
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
const PRO_FEATURES = [
  { key: 'plans.pro1', icon: CheckCircle2 },
  { key: 'plans.pro2', icon: Calculator },
  { key: 'plans.pro3', icon: FileText },
  { key: 'plans.pro4', icon: BarChart3 },
  { key: 'plans.pro5', icon: MessageCircle },
];

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

  const canBuy = !isAdminGrant && !hasPreservedPaidAccess;
  const currentPlanChip = isGuestPreview ? t('plans.guestPreviewBadge') : isPaidActive ? 'Pro' : isInFreeTrial ? t('plans.freeTrialBadge') : 'Free';
  const badge = 'rounded-full bg-[#FDE8DD] px-2.5 py-0.5 text-[11.5px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]';
  const accent = 'text-[13px] font-semibold text-[#C24A16] dark:text-[#FFA473]';
  const priceFigure = 'font-mono text-5xl font-semibold tracking-[-0.02em] text-brand-text';
  const comingSoon = (
    <button type="button" disabled aria-disabled="true" className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-xl border border-dashed border-brand-muted/50 px-4 py-2.5 text-xs font-semibold text-brand-muted">
      {t('plans.periodComingSoon')}
    </button>
  );

  return (
    <div className="page-content mx-auto max-w-5xl pb-16">
      <PageHeader page="plans">
        <Mascot mood="happy" size={52} />
      </PageHeader>

      {/* Where the account stands now: one line above the plans. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-brand-border bg-brand-white px-4 py-3 dark:bg-[#202126]" data-testid="plan-status">
        <span className="text-[12px] text-brand-muted">{t('plans.currentPlan')}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isPaidActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : isInFreeTrial || isGuestPreview ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300' : 'bg-brand-faint text-brand-text dark:bg-neutral-800'}`}>{currentPlanChip}</span>
        <p className="text-[12px] leading-relaxed text-brand-muted">{statusText}</p>
      </div>

      {/* Pro by billing period, three cards. Only monthly can be bought today; 6-month and yearly
          are priced (owner, 2026-10-15) and wait for checkout support, so their button is disabled. */}
      <section className="mt-9" aria-labelledby="pro-plans-title">
        <div className="text-center">
          <h2 id="pro-plans-title" className="text-3xl font-semibold">Pro</h2>
          <p className="mt-1 text-sm text-brand-muted">{t('plans.periodsSubtitle')}</p>
        </div>
        <div className="plan-periods mt-7" data-testid="pro-periods">
          <article data-period="month" className="period-card rounded-[28px] border border-brand-border bg-brand-white p-6 dark:bg-[#202126] sm:p-7">
            <div className="flex min-h-[26px] flex-wrap items-center gap-2">
              {introEligible && <span className={badge}>{t('plans.monthlyDiscountBadge')}</span>}
            </div>
            <div className="pt-3">
              <h3 className="text-2xl font-semibold">{t('plans.monthlyLabel')}</h3>
              <p className="mt-1 text-[13px] text-brand-muted">{t(introEligible ? 'plans.introBadge' : 'plans.monthlySubtitle')}</p>
            </div>
            <PlanMascot featured label="ทักทายน้องกระรอก Pro" size={132} />
            <div className="pb-1">
              <div className="flex items-end gap-2">
                {introEligible && <s className="pb-1.5 font-mono text-xl text-brand-muted decoration-[1.5px]"><span className="sr-only">{t('plans.regularPrice')} </span>฿249</s>}
                <span className={priceFigure}>{introEligible ? '฿199' : '฿249'}</span>
              </div>
              <p className="mt-1.5 text-[13px] text-brand-muted">{t('plans.monthPer')}</p>
              {introEligible ? <>
                <p className={`mt-2 ${accent}`}>{t('plans.introPriceNote')}</p>
                <p className="mt-0.5 text-xs text-brand-muted">{t('plans.standardPrice')}</p>
              </> : <p className="mt-2 text-xs text-brand-muted">{t('plans.standardOnlyNote')}</p>}
            </div>
            <div className="grid content-end gap-2 pt-6">
              {canBuy ? <>
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
              </> : (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{t('plans.currentPlan')}</span>
              )}
            </div>
          </article>

          <article data-period="halfYear" className="period-card rounded-[28px] border border-brand-border bg-brand-white p-6 dark:bg-[#202126] sm:p-7">
            <div className="flex min-h-[26px] flex-wrap items-center gap-2"><span className={badge}>{t('plans.halfYearBadge')}</span></div>
            <div className="pt-3">
              <h3 className="text-2xl font-semibold">{t('plans.halfYearLabel')}</h3>
              <p className="mt-1 text-[13px] text-brand-muted">{t('plans.halfYearSubtitle')}</p>
            </div>
            <PlanMascot label="ทักทายน้องกระรอก ราย 6 เดือน" action="hold-calendar" size={132} />
            <div className="pb-1">
              <div className="flex items-end gap-2"><span className={priceFigure}>{t('plans.halfYearPrice')}</span></div>
              <p className="mt-1.5 text-[13px] text-brand-muted">{t('plans.halfYearPer')}</p>
              <p className={`mt-2 ${accent}`}>{t('plans.halfYearAverage')}</p>
            </div>
            <div className="grid content-end gap-2 pt-6">{comingSoon}</div>
          </article>

          <article data-period="year" data-recommended="true" className="period-card relative rounded-[28px] border-2 border-[#E65F2B] bg-brand-white p-6 shadow-[0_18px_40px_-28px_rgba(230,95,43,0.55)] dark:bg-[#202126] sm:p-7">
            <div className="flex min-h-[26px] flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#E65F2B] px-2.5 py-0.5 text-[11.5px] font-semibold text-white">{t('plans.recommendedBadge')}</span>
              <span className={badge}>{t('plans.yearBadge')}</span>
            </div>
            <div className="pt-3">
              <h3 className="text-2xl font-semibold">{t('plans.yearLabel')}</h3>
              <p className="mt-1 text-[13px] text-brand-muted">{t('plans.yearSubtitle')}</p>
            </div>
            <PlanMascot label="ทักทายน้องกระรอก รายปี" mood="wave" action="wave" size={132} />
            <div className="pb-1">
              <div className="flex items-end gap-2"><span className={priceFigure}>{t('plans.yearPrice')}</span></div>
              <p className="mt-1.5 text-[13px] text-brand-muted">{t('plans.yearPer')}</p>
              <p className={`mt-2 ${accent}`}>{t('plans.yearAverage')}</p>
            </div>
            <div className="grid content-end gap-2 pt-6">{comingSoon}</div>
          </article>
        </div>
      </section>

      {/* The same Pro features whichever period is chosen, listed once. */}
      <section className="mt-6 rounded-[24px] border border-brand-border bg-brand-white p-6 dark:bg-[#202126] sm:p-7" aria-labelledby="pro-features-title">
        <h2 id="pro-features-title" className="text-[15px] font-semibold">{t('plans.proFeaturesTitle')}</h2>
        <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2" role="list">
          {PRO_FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-3 text-[13.5px] leading-6 text-brand-text">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]" aria-hidden><Icon className="h-3.5 w-3.5" /></span>
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      {/* Free, the plan everyone starts on. */}
      <section className="mt-5 flex flex-col gap-4 rounded-[24px] border border-brand-border p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7" aria-labelledby="free-plan-title">
        <PlanMascot label="ทักทายน้องกระรอก Free" size={88} stageClassName="h-[104px] shrink-0 self-center" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="free-plan-title" className="text-xl font-semibold">Free</h2>
            <span className="font-mono text-2xl font-semibold text-brand-text">฿0</span>
            <span className="text-xs text-brand-muted">{t('plans.forever')}</span>
            {!isPro && <span className="rounded-full bg-brand-faint px-2.5 py-0.5 text-[11px] font-semibold text-brand-text dark:bg-neutral-800">{t('plans.currentPlan')}</span>}
          </div>
          <p className="mt-1 text-xs text-brand-muted">{t('plans.freeSummary')}</p>
          <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] leading-6 text-brand-text sm:grid-cols-2" role="list">
            {[...FREE_FEATURE_KEYS, freeDocumentsAvailable ? 'plans.freeDocumentsAvailable' : 'plans.freeDocumentsForthcoming'].map(key => (
              <li key={key} className="flex items-start gap-2"><Check className="mt-[5px] h-3.5 w-3.5 shrink-0 text-brand-muted" aria-hidden />{t(key)}</li>
            ))}
          </ul>
        </div>
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

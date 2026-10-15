import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, CreditCard, QrCode } from 'lucide-react';
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
  /** Checkout for the 6-month and yearly periods. Not wired yet (owner, 2026-10-15): while it is
   * absent their buttons stay disabled, because the monthly checkout would charge the wrong amount. */
  onSubscribePeriod?: (period: LongPeriod, method: 'card' | 'promptpay') => void;
}

type BillingPeriod = 'month' | 'halfYear' | 'year';
type LongPeriod = Exclude<BillingPeriod, 'month'>;
const BILLING_PERIODS: BillingPeriod[] = ['month', 'halfYear', 'year'];

const FREE_FEATURE_KEYS = ['plans.free1', 'plans.free2', 'plans.free3', 'plans.free4'];
// The Pro card's list. `soon` marks what is not live yet (the owner's rule: never sell beyond
// what works): AI quick entry has no API key on production and no monthly count yet.
/** Feature lines mark their key words as **bold** in the translation text. */
function withBold(text: string): React.ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part);
}

const PRO_CARD_FEATURES: { key: string; soon?: boolean }[] = [
  { key: 'plans.pro1' },
  { key: 'plans.cardFeatureDocuments' },
  { key: 'plans.cardFeatureAiEntry', soon: true },
  { key: 'plans.cardFeatureLine' },
  { key: 'plans.cardFeatureTax' },
  { key: 'plans.cardFeatureReports' },
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
  onSubscribePeriod,
}) => {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [period, setPeriod] = React.useState<BillingPeriod>('month');
  const periodButtons = React.useRef<Record<BillingPeriod, HTMLButtonElement | null>>({ month: null, halfYear: null, year: null });
  // Arrow keys move between the three periods, as in any radio group.
  const onPeriodKey = (event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = BILLING_PERIODS[(BILLING_PERIODS.indexOf(period) + step + BILLING_PERIODS.length) % BILLING_PERIODS.length];
    setPeriod(next);
    periodButtons.current[next]?.focus();
  };
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
  const qrButton = 'inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E65F2B] bg-brand-white px-4 py-2.5 text-xs font-semibold text-[#A84319] transition-colors hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent dark:text-[#FFA473] dark:hover:bg-[#E65F2B]/10';

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

      {/* Pro, one card. The switch above it picks the billing period; price, lines and buttons
          follow. Only monthly can be paid today; the others wait for onSubscribePeriod. */}
      <section className="mt-9" aria-labelledby="pro-plans-title">
        <div className="text-center">
          <h2 id="pro-plans-title" className="text-3xl font-semibold">Pro</h2>
          <p className="mt-1 text-sm text-brand-muted">{t('plans.periodsSubtitle')}</p>
        </div>

        <div className="mt-6 flex justify-center">
          <div role="radiogroup" aria-label={t('plans.periodSwitchLabel')} onKeyDown={onPeriodKey} data-testid="period-switch"
            className="relative grid w-full max-w-[460px] grid-cols-3 gap-1 rounded-full border border-brand-border bg-brand-faint p-1 dark:bg-neutral-800/70">
            {BILLING_PERIODS.map(option => {
              const active = option === period;
              return (
                <button key={option} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1}
                  ref={node => { periodButtons.current[option] = node; }}
                  onClick={() => setPeriod(option)} data-period-option={option}
                  className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] ${active ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}>
                  {active && (
                    <motion.span layoutId={reduceMotion ? undefined : 'period-pill'} aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-brand-white shadow-[0_2px_8px_rgba(33,29,26,0.10)] dark:bg-[#2C2D32]"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                  )}
                  <span className="relative">{t(`plans.${option}SwitchLabel`)}</span>
                  {option === 'year' && <span className="relative rounded-full bg-[#E65F2B] px-1.5 py-px text-[10px] font-semibold text-white">{t('plans.yearSwitchChip')}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Free beside Pro so the two can be compared; the switch only changes Pro. On a
            phone Pro comes first. */}
        <div className="plan-compare mt-6">
        <article data-testid="free-card" className="compare-card order-2 rounded-3xl border border-brand-border bg-brand-white p-6 dark:bg-[#202126] sm:p-8 lg:order-1">
          <div>
            <div className="flex min-h-[26px] justify-center">
              {!isPro && <span className="rounded-full bg-brand-faint px-2.5 py-0.5 text-[11.5px] font-semibold text-brand-text dark:bg-neutral-800">{t('plans.currentPlan')}</span>}
            </div>
            <PlanMascot label="ทักทายน้องกระรอก Free" size={140} />
            <div className="text-center">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="mt-1 flex items-end justify-center gap-2.5">
                <span className={priceFigure}>฿0</span>
                <span className="pb-1.5 text-sm text-brand-muted">{t('plans.forever')}</span>
              </div>
              <p className="mt-3 text-xs text-brand-muted">{t('plans.freeSummary')}</p>
            </div>
          </div>
          <ul className="mt-7 grid content-start gap-3 border-t border-brand-border pt-6" role="list" aria-label={t('plans.freeFeaturesTitle')}>
            {[...FREE_FEATURE_KEYS, freeDocumentsAvailable ? 'plans.freeDocumentsAvailable' : 'plans.freeDocumentsForthcoming'].map(key => (
              <li key={key} className="flex items-start gap-3 text-[14px] leading-6 text-brand-text">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand-muted dark:bg-neutral-800" aria-hidden><Check className="h-3.5 w-3.5" strokeWidth={2.6} /></span>
                <span className="min-w-0">{t(key)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article data-testid="pro-card" data-period={period}
          className="compare-card relative order-1 rounded-3xl border-2 border-[#E65F2B] bg-brand-white p-6 shadow-[0_22px_48px_-34px_rgba(230,95,43,0.6)] dark:bg-[#202126] sm:p-8 lg:order-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={period}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}>
              <div className="flex min-h-[26px] justify-center">
                {(period !== 'month' || introEligible) && <span className={badge}>{t(`plans.${period}CardBadge`)}</span>}
              </div>
              {period === 'month'
                ? <PlanMascot featured label="ทักทายน้องกระรอก Pro" size={140} />
                : period === 'halfYear'
                  ? <PlanMascot label="ทักทายน้องกระรอก ราย 6 เดือน" action="hold-calendar" size={140} />
                  : <PlanMascot label="ทักทายน้องกระรอก รายปี" mood="wave" action="wave" size={140} />}
              <div className="text-center" data-testid="pro-price">
                <div className="flex items-end justify-center gap-2.5">
                  {(period !== 'month' || introEligible) && (
                    <s className="pb-1.5 font-mono text-xl text-brand-muted decoration-[1.5px]"><span className="sr-only">{t('plans.regularPrice')} </span>{t(`plans.${period}RegularPrice`)}</s>
                  )}
                  <span className={priceFigure}>{period === 'month' ? (introEligible ? '฿199' : '฿249') : t(`plans.${period}Price`)}</span>
                  <span className="pb-1.5 text-sm text-brand-muted">{t(`plans.${period}PerShort`)}</span>
                </div>
                {period === 'month' ? (introEligible ? <>
                  <p className={`mt-3 ${accent}`}>{t('plans.introPriceNote')}</p>
                  <p className="mt-0.5 text-xs text-brand-muted">{t('plans.standardPrice')}</p>
                </> : <p className="mt-3 text-xs text-brand-muted">{t('plans.standardOnlyNote')}</p>)
                  : <p className={`mt-3 ${accent}`}>{t(`plans.${period}Saving`)}</p>}
              </div>

              <div className="mt-6 grid gap-2">
                {!canBuy ? (
                  <span className="rounded-full bg-emerald-500/10 px-3 py-2 text-center text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">{t('plans.currentPlan')}</span>
                ) : period === 'month' ? <>
                  <button type="button" onClick={onUpgrade} disabled={billingBusy} className={`${uiPrimaryButton} w-full`}>
                    {billingBusy ? t('plans.loadingCta') : isGuestPreview ? t('plans.guestCreateAccountCta') : hasOpenManagedSubscription ? t('plans.renewCta') : t(introEligible ? 'plans.subscribeCta' : 'plans.subscribeStandardCta')}
                  </button>
                  {!isGuestPreview && !hasOpenManagedSubscription && (
                    <button type="button" onClick={onPromptPay} disabled={billingBusy} className={qrButton}>
                      {billingBusy ? t('plans.loadingCta') : t(introEligible ? 'plans.promptPayCta' : 'plans.promptPayStandardCta')}
                    </button>
                  )}
                </> : <>
                  <button type="button" disabled={!onSubscribePeriod || billingBusy} onClick={() => onSubscribePeriod?.(period, 'card')} className={`${uiPrimaryButton} w-full`}>
                    {t(`plans.${period}SubscribeCta`)}
                  </button>
                  <button type="button" disabled={!onSubscribePeriod || billingBusy} onClick={() => onSubscribePeriod?.(period, 'promptpay')} className={qrButton}>
                    {t(`plans.${period}PromptPayCta`)}
                  </button>
                  {!onSubscribePeriod && <p className="text-center text-[12px] text-brand-muted" data-testid="period-not-open">{t('plans.periodNotOpen')}</p>}
                </>}
              </div>
            </motion.div>
          </AnimatePresence>

          <ul className="mt-7 grid content-start gap-3 border-t border-brand-border pt-6" role="list" aria-label={t('plans.proFeaturesTitle')}>
            {PRO_CARD_FEATURES.map(({ key, soon }) => (
              <li key={key} className="flex items-start gap-3 text-[14px] leading-6 text-brand-text">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]" aria-hidden><Check className="h-3.5 w-3.5" strokeWidth={2.6} /></span>
                <span className="min-w-0">{withBold(t(key))}{soon && <span className="ml-2 inline-block rounded-full bg-brand-faint px-2 py-px align-[2px] text-[11px] font-semibold text-brand-muted dark:bg-neutral-800">{t('plans.periodComingSoon')}</span>}</span>
              </li>
            ))}
          </ul>
        </article>
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

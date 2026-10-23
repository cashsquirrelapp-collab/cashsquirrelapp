import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BarChart3, BellRing, Check, Clock3, CreditCard, FileText, MessageCircle, QrCode, type LucideIcon } from 'lucide-react';
import { PlanMascot } from './PlanMascot';
import './plans.css';
import { dateLocale } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { PRO_CHECKOUT_OPEN, PRO_PERIODS, formatBaht, proPriceDetails, type ProPeriod } from '../../../../shared/proPricing';

import { tr } from '../../i18n/tr';
// The membership page (owner's briefs, 2026-10-20): Pro only, one card, three billing periods at the
// owner's prices (shared/proPricing.ts). The Free card and the Free-versus-Pro comparison are gone
// from this page only; Free accounts and what they may do are unchanged everywhere else.

interface PlansTabProps {
  /** Kept for the caller; the page no longer shows a Free card or Free-only details. */
  fullFeatureAccess?: boolean;
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
    customCardSubscription?: boolean;
    introEligible: boolean;
    managed: boolean;
  } | null;
  onUpgrade: () => void;
  onPromptPay: () => void;
  onStopAutoRenewal?: () => void;
  billingBusy: boolean;
  checkoutReady?: boolean;
  /** Checkout for 6 months and 1 year, once it exists. A period can be paid only when this is wired
   * and PRO_CHECKOUT_OPEN says checkout charges the price shown. */
  onSubscribePeriod?: (period: LongPeriod, method: 'card' | 'promptpay') => void;
}

type BillingPeriod = ProPeriod;
type LongPeriod = Exclude<BillingPeriod, 'month'>;
const BILLING_PERIODS = PRO_PERIODS;

// What Pro adds that works today; checked on 2026-10-20 against production: the LINE chat records
// jobs and its menu shows money owed, work in progress and the month's summary (Pro or trial, with a
// linked LINE account); the daily 08:00 digest of money due goes by email and LINE; documents are
// unlimited for Pro. The AI chat has no API key on production yet, so it is marked "เร็ว ๆ นี้".
const PRO_BENEFITS: { key: string; icon: LucideIcon; soon?: string }[] = [
  { key: 'Line', icon: MessageCircle, soon: 'plans.benefitLineSoon' },
  { key: 'Alerts', icon: BellRing },
  { key: 'Documents', icon: FileText },
  { key: 'Summary', icon: BarChart3 },
];

export const PlansTab: React.FC<PlansTabProps> = ({
  isGuestPreview,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  subscription,
  onUpgrade,
  onPromptPay,
  onStopAutoRenewal,
  billingBusy,
  checkoutReady = false,
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

  const isProBanned = subscription?.plan === 'admin_revoked';
  const isAdminGrant = subscription?.plan === 'admin_grant';
  const hasOpenManagedSubscription = Boolean(
    subscription?.hasSubscription
    && !['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );
  const hasTerminalManagedSubscription = Boolean(
    subscription?.hasSubscription
    && ['canceled', 'incomplete_expired'].includes(subscription.stripeStatus ?? ''),
  );
  const hasPreservedPaidAccess = Boolean(isPaidActive && !hasOpenManagedSubscription && !isAdminGrant);
  const day = (value: string | Date) => new Date(value).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  // The account's membership, when it has one; a Free account with nothing running shows none.
  const statusText = isGuestPreview
    ? t('plans.guestPreviewStatus')
    : isAdminGrant
    ? t('plans.statusAdminGrant')
    : isPaidActive && hasTerminalManagedSubscription && subscription?.currentPeriodEnd
    ? t('plans.statusCanceledPaidThrough', { date: day(subscription.currentPeriodEnd) })
    : isPaidActive && hasOpenManagedSubscription && subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd
    ? t('plans.statusCancelAt', { date: day(subscription.currentPeriodEnd) })
    : isPaidActive && hasOpenManagedSubscription && subscription?.currentPeriodEnd
    ? t('plans.statusActive', { date: day(subscription.currentPeriodEnd) })
    : isPaidActive && subscription?.currentPeriodEnd
    ? t('plans.statusLegacy', { date: day(subscription.currentPeriodEnd) })
    : hasOpenManagedSubscription
    ? t('plans.statusManageRequired')
    : isInFreeTrial && trialEndsAt
    ? t('plans.statusTrial', { date: day(trialEndsAt) })
    : null;
  const statusChip = isGuestPreview ? t('plans.guestPreviewBadge') : isPaidActive ? 'Pro' : isInFreeTrial ? t('plans.freeTrialBadge') : t('plans.currentPlan');
  const canBuy = !isAdminGrant && !hasPreservedPaidAccess;

  const qrButton = 'plan-press inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E65F2B] bg-brand-white px-4 py-2.5 text-[13px] font-semibold text-[#A84319] transition-colors hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent dark:text-[#FFA473] dark:hover:bg-[#E65F2B]/10';
  const primary = `${uiPrimaryButton} plan-press w-full`;

  // The promotion price is the largest figure on the card, with the regular price (฿249 a month, times
  // the months) struck beside it. Under it: the saving, and for 6 months and a year the monthly average,
  // so a long period never reads as a monthly charge.
  const priceOf = (option: BillingPeriod) => {
    const price = proPriceDetails(option);
    return (
      <div className="text-center">
        <p className="plan-price-row">
          <s className="plan-was"><span className="sr-only">{t('plans.regularPrice')} </span>{formatBaht(price.regular)}</s>
          <span className="plan-figure font-mono"><span className="plan-currency">{tr("฿")}</span>{price.total.toLocaleString('en-US')}</span>
          <span className="plan-per">{t(`plans.${option}PerShort`)}</span>
        </p>
        <p className="plan-sub">
          {option === 'month'
            ? <><span className="plan-promo">{t('plans.promoLabel')}</span><span aria-hidden="true"> · </span>{t('plans.savingPerMonth', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>
            : <><span className="plan-promo">{t('plans.averagePerMonthShort', { price: formatBaht(price.average, 2) })}</span><span aria-hidden="true"> · </span>{t('plans.savingText', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>}
        </p>
      </div>
    );
  };

  const actionsOf = (option: BillingPeriod) => {
    if (isProBanned) return <p role="status" className="rounded-xl border border-red-300/30 p-3 text-sm text-red-600 dark:text-red-300">{t('plans.proBanned')}</p>;
    if (!canBuy) return <span className="rounded-full bg-emerald-500/10 px-3 py-2.5 text-center text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{t('plans.currentPlan')}</span>;
    // These never charge anything: an existing subscription opens the Stripe portal, a guest signs up.
    if (hasOpenManagedSubscription) return <div className="space-y-3">
      <button type="button" onClick={onUpgrade} disabled={billingBusy} className={primary}>{billingBusy ? t('plans.loadingCta') : t('plans.renewCta')}</button>
      {subscription?.customCardSubscription && !subscription.cancelAtPeriodEnd && onStopAutoRenewal && <button type="button" onClick={onStopAutoRenewal} disabled={billingBusy} className="w-full rounded-xl border border-brand-border p-3 text-sm text-brand-muted">{tr("ปิดการต่ออายุอัตโนมัติ")}</button>}
      {subscription?.customCardSubscription && subscription.cancelAtPeriodEnd && <p className="text-sm text-brand-muted">{tr("ปิดการต่ออายุแล้ว จะไม่ตัดเงินรอบถัดไป")}</p>}
    </div>;
    if (isGuestPreview) return <button type="button" onClick={onUpgrade} disabled={billingBusy} className={primary}>{t('plans.guestCreateAccountCta')}</button>;
    const price = formatBaht(proPriceDetails(option).total);
    const open = checkoutReady && PRO_CHECKOUT_OPEN[option] && (option === 'month' || Boolean(onSubscribePeriod));
    // Never a payment button that would charge an amount other than the one shown.
    if (!open) return <>
      <button type="button" disabled className="plan-cta-closed"><Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('plans.periodOpensSoon')}</button>
      <p className="text-center text-[12px] leading-relaxed text-brand-muted" data-testid="checkout-not-open">{t('plans.checkoutNotOpen')}</p>
    </>;
    const pay = (method: 'card' | 'promptpay') => option === 'month' ? (method === 'card' ? onUpgrade() : onPromptPay()) : onSubscribePeriod?.(option, method);
    return <>
      <p className="text-center text-xs text-brand-muted">{t('plans.prepaidSummary', { price, months: String(proPriceDetails(option).months) })}</p>
      <button type="button" disabled={billingBusy} onClick={() => pay('card')} className={primary}>{billingBusy ? t('plans.loadingCta') : t('plans.periodSubscribeCta', { length: t(`plans.${option}SwitchLabel`), price })}</button>
      <button type="button" disabled={billingBusy} onClick={() => pay('promptpay')} className={qrButton}>{billingBusy ? t('plans.loadingCta') : t('plans.periodPromptPayCta', { price })}</button>
    </>;
  };

  return (
    <div className="page-content mx-auto max-w-5xl pb-16">
      <PageHeader page="plans" />

      <section className="plan-page mx-auto mt-6 max-w-[820px] lg:mt-4" aria-labelledby="pro-plan-title">
        <div className="flex justify-center">
          <div role="radiogroup" aria-label={t('plans.periodSwitchLabel')} onKeyDown={onPeriodKey} data-testid="period-switch"
            className="plan-switch relative grid w-full max-w-[400px] grid-cols-3 gap-1 rounded-full p-1">
            {BILLING_PERIODS.map(option => {
              const active = option === period;
              return (
                <button key={option} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1}
                  ref={node => { periodButtons.current[option] = node; }}
                  onClick={() => setPeriod(option)} data-period-option={option}
                  className={`relative flex min-h-10 items-center justify-center rounded-full px-2 text-[13.5px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] ${active ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}>
                  {active && (
                    <motion.span layoutId={reduceMotion ? undefined : 'period-pill'} aria-hidden="true"
                      className="plan-switch-pill absolute inset-0 rounded-full"
                      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} />
                  )}
                  <span className="relative">{t(`plans.${option}SwitchLabel`)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seen in this order: the squirrel, the price, what Pro does, the button. On a phone the three
            parts stack; on a computer or iPad the benefits sit beside the price and the button, so the
            whole card fits on one screen (owner, 2026-10-20). */}
        <article data-testid="pro-card" data-period={period} className="plan-card mt-5 lg:mt-4">
          <div className="plan-layout">
            <div className="plan-hero">
              <PlanMascot label={tr("ทักทายน้องกระรอก Pro")} className="plan-mascot" figureClassName="plan-mascot-figure"
                action={period === 'halfYear' ? 'hold-calendar' : period === 'year' ? 'wave' : 'hold-baht'} mood={period === 'year' ? 'wave' : 'happy'} />
              <h2 id="pro-plan-title" className="plan-name mt-1 text-center font-bold leading-tight tracking-[-0.01em]">Pro</h2>
              <p className="plan-tagline mt-0.5 text-center text-brand-muted">{t('plans.proTagline')}</p>
              {/* "คุ้มที่สุด", the one badge on the page (1 year only): above the price on a phone, in the
                  card's corner beside the benefits. */}
              {proPriceDetails(period).bestValue && <span key={period} className="plan-badge is-strong plan-best">{t('plans.bestValueBadge')}</span>}

              {/* The price area eases to its new height instead of jumping; the figures crossfade. */}
              <AutoHeight className="plan-price" testId="pro-price" reduceMotion={Boolean(reduceMotion)}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div key={period}
                    initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.24, ease: 'easeOut' }}>
                    {priceOf(period)}
                  </motion.div>
                </AnimatePresence>
              </AutoHeight>
            </div>

            <div className="plan-benefits-wrap">
              <ul className="plan-benefits" role="list" aria-label={t('plans.proFeaturesTitle')}>
                {PRO_BENEFITS.map(({ key, icon: Icon, soon }) => (
                  <li key={key} className="flex items-start gap-3.5">
                    <span className="plan-benefit-icon flex shrink-0 items-center justify-center rounded-full" aria-hidden><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                    <span className="min-w-0">
                      <span className="plan-benefit-title block font-semibold text-brand-text">{t(`plans.benefit${key}Title`)}</span>
                      <span className="plan-benefit-desc mt-0.5 block leading-relaxed text-brand-muted">{t(`plans.benefit${key}Desc`)}</span>
                      {soon && <span className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[13px] text-brand-muted"><span className="rounded-full bg-brand-faint px-2 py-px text-[11.5px] font-semibold dark:bg-neutral-800">{t('plans.periodComingSoon')}</span>{t(soon)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="plan-line-note flex items-center gap-2 text-[12.5px] text-brand-muted"><Check className="h-3.5 w-3.5 shrink-0 text-[#C24A16] dark:text-[#FFA473]" aria-hidden />{t('plans.lineNeedsLink')}</p>
            </div>

            {statusText && (
              <p className="plan-status flex items-start gap-2.5 rounded-2xl bg-brand-faint px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-brand-muted dark:bg-neutral-800/70" data-testid="plan-status">
                <span className={`mt-px shrink-0 rounded-full px-2 py-px text-[11px] font-semibold ${isPaidActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'}`}>{statusChip}</span>
                <span className="min-w-0">{statusText}</span>
              </p>
            )}

            <div className="plan-actions">
              <div className="mx-auto grid max-w-[420px] gap-2" data-testid="pro-actions">{actionsOf(period)}</div>
            </div>
          </div>
        </article>

        <section className="plan-pay mx-auto mt-4 grid max-w-[820px] gap-4 sm:grid-cols-2 sm:gap-6" aria-labelledby="payment-methods-title">
          <h2 id="payment-methods-title" className="sr-only">{t('plans.paymentMethodsTitle')}</h2>
          <div className="flex gap-3">
            <span className="plan-pay-icon" aria-hidden><CreditCard className="h-4 w-4" strokeWidth={1.75} /></span>
            <div>
              <h3 className="text-[13px] font-semibold text-brand-text dark:text-white">{t('plans.cardMethodTitle')}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-brand-muted">{t('plans.cardPaymentDescription')}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="plan-pay-icon" aria-hidden><QrCode className="h-4 w-4" strokeWidth={1.75} /></span>
            <div>
              <h3 className="text-[13px] font-semibold text-brand-text dark:text-white">{t('plans.qrMethodTitle')}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-brand-muted">{t('plans.prepaidMethodDescription')}</p>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};

/** Animates to the height of what it holds, so content below moves smoothly rather than jumping. */
function AutoHeight({ children, className = '', testId, reduceMotion }: { children: React.ReactNode; className?: string; testId?: string; reduceMotion: boolean }) {
  const inner = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | 'auto'>('auto');
  React.useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div className={`relative overflow-hidden ${className}`} data-testid={testId} initial={false} animate={{ height }}
      transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}>
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

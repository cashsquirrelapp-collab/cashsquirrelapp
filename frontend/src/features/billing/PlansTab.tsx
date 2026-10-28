import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Clock3, Coffee, QrCode } from 'lucide-react';
import './plans.css';
import { dateLocale } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { PRO_CHECKOUT_OPEN, PRO_PERIODS_ON_SALE, formatBaht, proPriceDetails, type ProPeriod } from '../../../../shared/proPricing';
import { proTokensOnSale } from '../../../../shared/proTokens';
import { PromoCountdownChips, useMonthPromoRunning } from './promoNotice';
import { ProFeatureTiles } from './ProFeatureTiles';

import { tr } from '../../i18n/tr';
// The membership page (owner's briefs, 2026-10-20): Pro only, one card, three billing periods at the
// owner's prices (shared/proPricing.ts). The Free card and the Free-versus-Pro comparison are gone
// from this page only; Free accounts and what they may do are unchanged everywhere else.

interface PlansTabProps {
  /** Phones: the same design F, laid out for a phone (stacked feature rows, the app's own header). */
  phone?: boolean;
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
// Only the periods on sale (owner, 2026-10-25: monthly only for now); with one, there is no switch.
const BILLING_PERIODS = PRO_PERIODS_ON_SALE;

export const PlansTab: React.FC<PlansTabProps> = ({
  phone = false,
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
  const promoRunning = useMonthPromoRunning();
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
    // Design F (owner, 2026-10-29): "สมัคร Pro" alone, no price on the button and no amount line above it; the card and QR
    // dialogs still show the fee and the amount to pay before anything is charged.
    if (option === 'month') return <>
      <button type="button" disabled={billingBusy} onClick={() => pay('card')} className="pf-cta plan-press"><span aria-hidden="true" className="pf-cta-shine" /><span className="relative">{billingBusy ? t('plans.loadingCta') : tr('สมัคร Pro')}</span></button>
      <button type="button" disabled={billingBusy} onClick={() => pay('promptpay')} className="pf-qr plan-press"><QrCode className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />{billingBusy ? t('plans.loadingCta') : tr('จ่ายครั้งเดียวด้วยพร้อมเพย์ QR')}</button>
    </>;
    return <>
      <p className="text-center text-xs text-brand-muted">{t('plans.prepaidSummary', { price, months: String(proPriceDetails(option).months) })}</p>
      <button type="button" disabled={billingBusy} onClick={() => pay('card')} className={primary}>{billingBusy ? t('plans.loadingCta') : t('plans.periodSubscribeCta', { length: t(`plans.${option}SwitchLabel`), price })}</button>
      <button type="button" disabled={billingBusy} onClick={() => pay('promptpay')} className={qrButton}>{billingBusy ? t('plans.loadingCta') : t('plans.periodPromptPayCta', { price })}</button>
    </>;
  };

  const periodSwitch = BILLING_PERIODS.length > 1 && <div className="flex justify-center">
    <div role="radiogroup" aria-label={t('plans.periodSwitchLabel')} onKeyDown={onPeriodKey} data-testid="period-switch"
      className="plan-switch relative grid w-full max-w-[400px] grid-cols-3 gap-1 rounded-full p-1">
      {BILLING_PERIODS.map(option => {
        const active = option === period;
        return (
          <button key={option} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1}
            ref={node => { periodButtons.current[option] = node; }}
            onClick={() => setPeriod(option)} data-period-option={option}
            className={`relative flex min-h-10 items-center justify-center rounded-full px-2 text-[13.5px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] ${active ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}>
            {active && <motion.span layoutId={reduceMotion ? undefined : 'period-pill'} aria-hidden="true" className="plan-switch-pill absolute inset-0 rounded-full" transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative">{t(`plans.${option}SwitchLabel`)}</span>
          </button>
        );
      })}
    </div>
  </div>;

  // Design F (owner, 2026-10-28/29; phones too since 2026-10-29: "ทำบนมือถือด้วยเลย"): the hero line, then the price card
  // in the middle of the page as the one thing the eye lands on (price, a small ticking countdown, สมัคร Pro and
  // PromptPay), then three small cards of what Pro gives (side by side on wider screens, stacked rows on phones). CI
  // colours only; this page may use gradients and glow (DESIGN.md exception). The fixed copy "วันละไม่ถึง 6 บาท" is the
  // owner's own (฿177 / 30 days); they change it themselves from December.
  const price = proPriceDetails(period);
  const open = checkoutReady && PRO_CHECKOUT_OPEN[period] && (period === 'month' || Boolean(onSubscribePeriod));
  return (
    <div className={`page-content pf-page mx-auto max-w-5xl ${phone ? 'is-phone pb-16' : 'pb-12'}`}>
      {/* Phones name the page on the app's terracotta header (this one stays hidden there); wider screens read it here. */}
      {phone ? <PageHeader page="plans" title={isPaidActive ? t('nav.plansMember') : undefined} />
        : <h1 className="sr-only">{isPaidActive ? t('nav.plansMember') : t('nav.plans')}</h1>}
      <section className="pf-hero" aria-labelledby="pf-title">
        <span aria-hidden="true" className="pf-deco is-1" />
        <span aria-hidden="true" className="pf-deco is-2" />
        <span aria-hidden="true" className="pf-deco is-3" />
        <h2 id="pf-title" className="pf-title">{tr('เรื่องบัญชี')}<br /><span className="pf-title-grad">{tr('ไม่จำเป็นต้องเป็นเรื่องยากอีกต่อไป')}</span></h2>
        <p className="pf-sub"><b>{tr('วันละไม่ถึง 6 บาท')}</b><span className="pf-coffee"><Coffee className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />{tr('ถูกกว่ากาแฟแก้วเดียว')}</span><span>{tr('ก็มีผู้ช่วยดูแลเรื่องเงินให้คุณ')}</span></p>
        {periodSwitch && <div className="mt-5 w-full">{periodSwitch}</div>}
        <div className="pf-card-wrap">
          <span aria-hidden="true" className="pf-halo" />
          <article data-testid="pro-card" data-period={period} className="pf-card" aria-labelledby="pro-plan-title">
            <h3 id="pro-plan-title" className="pf-pill">{tr('Pro {0}', t(`plans.${period}SwitchLabel`))}</h3>
            {price.bestValue && <span key={period} className="plan-badge is-strong pf-best">{t('plans.bestValueBadge')}</span>}
            <div className="pf-price" data-testid="pro-price">
              <p className="pf-price-row">
                {price.saving > 0 && <s className="plan-was"><span className="sr-only">{t('plans.regularPrice')} </span>{formatBaht(price.regular)}</s>}
                <span className="plan-figure pf-figure"><span className="pf-currency">{tr('฿')}</span>{price.price.toLocaleString('en-US')}</span>
                <span className="plan-per">{t(`plans.${period}PerShort`)}</span>
              </p>
              {price.saving > 0 && <p className="pf-save">{period === 'month'
                ? tr('ประหยัด {0} ทุกเดือน', formatBaht(price.saving))
                : <>{t('plans.averagePerMonthShort', { price: formatBaht(price.average, 2) })} · {t('plans.savingText', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>}</p>}
              {period === 'month' && promoRunning && canBuy && !isProBanned && !hasOpenManagedSubscription && <PromoCountdownChips className="mt-3.5" />}
            </div>
            {statusText && (
              <p className="plan-status pf-status" data-testid="plan-status">
                <span className={`pf-status-chip ${isPaidActive ? 'is-pro' : ''}`}>{statusChip}</span>
                <span className="min-w-0">{statusText}</span>
              </p>
            )}
            <div className="pf-actions" data-testid="pro-actions">{actionsOf(period)}</div>
            {canBuy && !isProBanned && !isGuestPreview && !hasOpenManagedSubscription && open && <p className="pf-terms">{tr('บัตร ต่ออายุอัตโนมัติเมื่อติ๊กยินยอม ปิดได้ทุกเมื่อ')}<br />{tr('พร้อมเพย์ จ่ายครั้งเดียว ไม่ต่ออายุเอง')}</p>}
          </article>
        </div>
      </section>
      <section className="pf-features" aria-labelledby="pf-features-title">
        <div className="pf-features-head">
          <h2 id="pf-features-title">{tr('สิ่งที่ได้ใน Pro')}</h2>
          <p>{tr('กดการ์ดเพื่อดูรายละเอียด')}</p>
        </div>
        <ProFeatureTiles tokens={proTokensOnSale(period)} stacked={phone} />
      </section>
    </div>
  );
};

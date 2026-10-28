import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BarChart3, BellRing, Check, Clock3, Coffee, CreditCard, FileText, MessageCircle, QrCode, type LucideIcon } from 'lucide-react';
import { PlanMascot } from './PlanMascot';
import './plans.css';
import { dateLocale } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { PRO_CHECKOUT_OPEN, PRO_PERIODS_ON_SALE, formatBaht, proPriceDetails, type ProPeriod } from '../../../../shared/proPricing';
import { proTokensOnSale } from '../../../../shared/proTokens';
import { MonthPromoNotice, PromoCountdownChips, useMonthPromoRunning } from './promoNotice';
import { ProFeatureTiles } from './ProFeatureTiles';

import { tr } from '../../i18n/tr';
// The membership page (owner's briefs, 2026-10-20): Pro only, one card, three billing periods at the
// owner's prices (shared/proPricing.ts). The Free card and the Free-versus-Pro comparison are gone
// from this page only; Free accounts and what they may do are unchanged everywhere else.

interface PlansTabProps {
  /** Phones keep their own layout (owner rule); computers and iPads get design F (owner, 2026-10-29). */
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

// What Pro adds that works today; checked on 2026-10-20 against production: the LINE chat records
// jobs and its menu shows money owed, work in progress and the month's summary (Pro or trial, with a
// linked LINE account); the daily 08:00 digest of money due goes by email and LINE; documents are
// unlimited for Pro. The AI chat has no API key on production yet, so it is marked "เร็ว ๆ นี้".
// The AI row shows the selected plan's tokens a month (shared/proTokens.ts, owner 2026-10-25), before any payment button.
const PRO_BENEFITS: { key: string; icon: LucideIcon; soon?: string; tokens?: boolean }[] = [
  { key: 'Line', icon: MessageCircle, tokens: true },
  { key: 'Alerts', icon: BellRing },
  { key: 'Documents', icon: FileText },
  { key: 'Summary', icon: BarChart3 },
];

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

  // The promotion price is the largest figure on the card, with the regular price (฿249 a month, times
  // the months) struck beside it. Under it: the saving, and for 6 months and a year the monthly average,
  // so a long period never reads as a monthly charge; then the payment fee and the amount to pay, before any
  // payment button (owner, 2026-10-25: "ราคาตั้ง 159 แต่จ่ายจริงแค่บอกค่าธรรมเนียม แจ้งรายละเอียดก่อนจ่าย").
  const priceOf = (option: BillingPeriod) => {
    const price = proPriceDetails(option);
    return (
      <div className="text-center">
        <p className="plan-price-row">
          {price.saving > 0 && <s className="plan-was"><span className="sr-only">{t('plans.regularPrice')} </span>{formatBaht(price.regular)}</s>}
          <span className="plan-figure font-mono"><span className="plan-currency">{tr("฿")}</span>{price.price.toLocaleString('en-US')}</span>
          <span className="plan-per">{t(`plans.${option}PerShort`)}</span>
        </p>
        {/* From 1 Dec 2569 a month is the regular price: no promotion line, no struck price. */}
        {price.saving > 0 && <p className="plan-sub">
          {option === 'month'
            ? <><span className="plan-promo">{t('plans.promoLabel')}</span><span aria-hidden="true"> · </span>{t('plans.savingPerMonth', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>
            : <><span className="plan-promo">{t('plans.averagePerMonthShort', { price: formatBaht(price.average, 2) })}</span><span aria-hidden="true"> · </span>{t('plans.savingText', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>}
        </p>}
        <p className="plan-sub plan-fee" data-testid="plan-fee">{t('plans.feeAdded', { fee: formatBaht(price.fee) })}{' '}<span aria-hidden="true">·</span>{' '}<span className="plan-fee-total">{t('plans.payTotal', { total: formatBaht(price.total) })}</span></p>
        {option === 'month' && promoRunning && <MonthPromoNotice className="plan-sub plan-ends" testId="plan-promo-ends" />}
      </div>
    );
  };

  const actionsOf = (option: BillingPeriod, desktop = false) => {
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
    if (desktop && option === 'month') return <>
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

  // Computers and iPads, design F (owner, 2026-10-28/29): the hero line, then the price card in the middle of the page as
  // the one thing the eye lands on (price, a small ticking countdown, สมัคร Pro and PromptPay), then three small cards of
  // what Pro gives. CI colours only; this page may use gradients and glow (DESIGN.md exception). The fixed copy
  // "วันละไม่ถึง 6 บาท" is the owner's own (฿177 / 30 days); they change it themselves from December.
  if (!phone) {
    const price = proPriceDetails(period);
    const open = checkoutReady && PRO_CHECKOUT_OPEN[period] && (period === 'month' || Boolean(onSubscribePeriod));
    return (
      <div className="page-content pf-page mx-auto max-w-5xl pb-12">
        <h1 className="sr-only">{isPaidActive ? t('nav.plansMember') : t('nav.plans')}</h1>
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
              <div className="pf-actions" data-testid="pro-actions">{actionsOf(period, true)}</div>
              {canBuy && !isProBanned && !isGuestPreview && !hasOpenManagedSubscription && open && <p className="pf-terms">{tr('บัตร ต่ออายุอัตโนมัติเมื่อติ๊กยินยอม ปิดได้ทุกเมื่อ')}<br />{tr('พร้อมเพย์ จ่ายครั้งเดียว ไม่ต่ออายุเอง')}</p>}
            </article>
          </div>
        </section>
        <section className="pf-features" aria-labelledby="pf-features-title">
          <div className="pf-features-head">
            <h2 id="pf-features-title">{tr('สิ่งที่ได้ใน Pro')}</h2>
            <p>{tr('กดการ์ดเพื่อดูรายละเอียด')}</p>
          </div>
          <ProFeatureTiles tokens={proTokensOnSale(period)} />
        </section>
      </div>
    );
  }

  return (
    <div className="page-content mx-auto max-w-5xl pb-16">
      <PageHeader page="plans" title={isPaidActive ? t('nav.plansMember') : undefined} />

      <section className="plan-page mx-auto mt-6 max-w-[820px] lg:mt-4" aria-labelledby="pro-plan-title">
        {BILLING_PERIODS.length > 1 && <div className="flex justify-center">
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
        </div>}

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
                {PRO_BENEFITS.map(({ key, icon: Icon, soon, tokens }) => (
                  <li key={key} className="flex items-start gap-3.5">
                    <span className="plan-benefit-icon flex shrink-0 items-center justify-center rounded-full" aria-hidden><Icon className="h-[18px] w-[18px]" strokeWidth={1.75} /></span>
                    <span className="min-w-0">
                      <span className="plan-benefit-title block font-semibold text-brand-text">{t(`plans.benefit${key}Title`)}</span>
                      <span className="plan-benefit-desc mt-0.5 block leading-relaxed text-brand-muted">{t(`plans.benefit${key}Desc`)}</span>
                      {soon && <span className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-[13px] text-brand-muted"><span className="rounded-full bg-brand-faint px-2 py-px text-[11.5px] font-semibold dark:bg-neutral-800">{t('plans.periodComingSoon')}</span>{t(soon)}</span>}
                      {tokens && <span className="plan-benefit-desc mt-1 block leading-relaxed text-brand-muted" data-testid="plan-ai-tokens"><b className="font-semibold text-brand-text">{t('plans.aiTokensChip', { tokens: proTokensOnSale(period).toLocaleString('en-US') })}</b>{' '}{t('plans.aiTokensNote')}</span>}
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

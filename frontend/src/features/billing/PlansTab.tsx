import { uiPrimaryButton } from '../../components/ui/uiStyles';
import PageHeader from '../../components/ui/PageHeader';
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, Clock3, Coffee, Minus, QrCode } from 'lucide-react';
import './plans.css';
import { dateLocale } from '../../utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { PLUS_PRICE, PRO_CHECKOUT_OPEN, PRO_PERIODS_ON_SALE, formatBaht, proPriceDetails, type ProPeriod } from '../../../../shared/proPricing';
import { PLAN_LIMITS, paidTierOfPlan, type PaidTier } from '../../../../shared/plans';
import { proTokensOnSale } from '../../../../shared/proTokens';
import { PromoCountdownChips, useMonthPromoRunning } from './promoNotice';
import { ProFeatureTiles } from './ProFeatureTiles';

import { tr } from '../../i18n/tr';
// The membership page (owner's briefs, 2026-10-20): one price card at the owner's prices (shared/proPricing.ts).
// Since 2026-11-15 (owner: Free / Plus / Pro) the card switches between Plus and Pro, and a table under it compares the
// three plans, read from shared/plans.ts so the page always says what the server allows.

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
  /** Plus by card or PromptPay (monthly only). Without it, or while Plus is off on the server, Plus is not sold. */
  onSubscribePlus?: (method: 'card' | 'promptpay') => void;
  plusOnSale?: boolean;
  /** เลขา's free monthly allowance for Free accounts (FREE_MONTHLY_TOKENS; 0 = off). */
  freeMonthlyTokens?: number;
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
  onSubscribePlus,
  plusOnSale = false,
  freeMonthlyTokens = 0,
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
  // The paid plan this account has now (an owner's grant is Pro); null without one.
  const memberTier: PaidTier | null = isPaidActive ? (isAdminGrant ? 'pro' : paidTierOfPlan(subscription?.plan)) : null;
  const plusSold = plusOnSale && Boolean(onSubscribePlus);
  // The card shows the member's own plan first, else Pro (the page's lead since design F).
  const [choice, setChoice] = React.useState<PaidTier>(memberTier === 'plus' && plusSold ? 'plus' : 'pro');
  // From LINE's Plus / Pro card (?tier=plus|pro, owner 2026-11-16): the plan pressed shows first, once Plus is known on sale.
  const askedTier = React.useRef<string | null>((() => { try { return new URLSearchParams(window.location.search).get('tier'); } catch { return null; } })());
  React.useEffect(() => {
    const asked = askedTier.current;
    if (!asked || memberTier) return;
    if (asked === 'plus' && !plusSold) return;
    askedTier.current = null;
    setChoice(asked === 'plus' ? 'plus' : 'pro');
  }, [plusSold, memberTier]);
  const tierButtons = React.useRef<Record<PaidTier, HTMLButtonElement | null>>({ plus: null, pro: null });
  const onTierKey = (event: React.KeyboardEvent) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const next: PaidTier = choice === 'plus' ? 'pro' : 'plus';
    setChoice(next);
    tierButtons.current[next]?.focus();
  };
  const day = (value: string | Date) => new Date(value).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  // The account's membership, when it has one; a Free account with nothing running shows none. The paid lines name Pro;
  // a Plus member reads the same lines with its own plan's name.
  const named = (text: string | null) => (text && memberTier === 'plus' ? text.replace(/\bPro\b/g, 'Plus') : text);
  const statusText = named(isGuestPreview
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
    : null);
  const statusChip = isGuestPreview ? t('plans.guestPreviewBadge') : memberTier === 'plus' ? 'Plus' : isPaidActive ? 'Pro' : isInFreeTrial ? t('plans.freeTrialBadge') : t('plans.currentPlan');
  const canBuy = !isAdminGrant && !hasPreservedPaidAccess;

  const qrButton = 'plan-press inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#E65F2B] bg-brand-white px-4 py-2.5 text-[13px] font-semibold text-[#A84319] transition-colors hover:bg-[#FFF1E8] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent dark:text-[#FFA473] dark:hover:bg-[#E65F2B]/10';
  const primary = `${uiPrimaryButton} plan-press w-full`;

  const actionsOf = (option: BillingPeriod, tier: PaidTier) => {
    if (isProBanned) return <p role="status" className="rounded-xl border border-red-300/30 p-3 text-sm text-red-600 dark:text-red-300">{t('plans.proBanned')}</p>;
    // A member looking at the other plan: Pro already has all of Plus; Plus moves to Pro once its paid month ends (the
    // database refuses a second plan while one is running).
    if (memberTier && memberTier !== tier) return <p role="status" className="pf-other-plan" data-testid="other-plan-note">{memberTier === 'pro'
      ? tr('แพ็กเกจ Pro ของคุณมีทุกอย่างใน Plus แล้ว')
      : tr('ตอนนี้ใช้ Plus อยู่ เปลี่ยนเป็น Pro ได้เมื่อรอบที่ชำระแล้วสิ้นสุด')}</p>;
    if (!canBuy) return <span className="rounded-full bg-emerald-500/10 px-3 py-2.5 text-center text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">{t('plans.currentPlan')}</span>;
    // These never charge anything: an existing subscription opens the Stripe portal, a guest signs up.
    if (hasOpenManagedSubscription) return <div className="space-y-3">
      <button type="button" onClick={onUpgrade} disabled={billingBusy} className={primary}>{billingBusy ? t('plans.loadingCta') : t('plans.renewCta')}</button>
      {subscription?.customCardSubscription && !subscription.cancelAtPeriodEnd && onStopAutoRenewal && <button type="button" onClick={onStopAutoRenewal} disabled={billingBusy} className="w-full rounded-xl border border-brand-border p-3 text-sm text-brand-muted">{tr("ปิดการต่ออายุอัตโนมัติ")}</button>}
      {subscription?.customCardSubscription && subscription.cancelAtPeriodEnd && <p className="text-sm text-brand-muted">{tr("ปิดการต่ออายุแล้ว จะไม่ตัดเงินรอบถัดไป")}</p>}
    </div>;
    if (isGuestPreview) return <button type="button" onClick={onUpgrade} disabled={billingBusy} className={primary}>{t('plans.guestCreateAccountCta')}</button>;
    if (tier === 'plus') {
      if (!checkoutReady || !plusSold) return <>
        <button type="button" disabled className="plan-cta-closed"><Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden />{t('plans.periodOpensSoon')}</button>
        <p className="text-center text-[12px] leading-relaxed text-brand-muted" data-testid="checkout-not-open">{t('plans.checkoutNotOpen')}</p>
      </>;
      return <>
        <button type="button" disabled={billingBusy} onClick={() => onSubscribePlus?.('card')} className="pf-cta plan-press"><span aria-hidden="true" className="pf-cta-shine" /><span className="relative">{billingBusy ? t('plans.loadingCta') : tr('สมัคร Plus')}</span></button>
        <button type="button" disabled={billingBusy} onClick={() => onSubscribePlus?.('promptpay')} className="pf-qr plan-press"><QrCode className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />{billingBusy ? t('plans.loadingCta') : tr('จ่ายครั้งเดียวด้วยพร้อมเพย์ QR')}</button>
      </>;
    }
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
  // in the middle of the page as the one thing the eye lands on (price, a small ticking countdown, the buy buttons), then
  // what each plan gives. CI colours only; this page may use gradients and glow (DESIGN.md exception). Since 2026-11-15 a
  // Plus / Pro switch sits above the card, and the hero line counts from Plus (฿115 charged / 30 days = ฿3.83 a day).
  const showPlus = plusSold || memberTier === 'plus';
  const tier: PaidTier = showPlus ? choice : 'pro';
  const shownPeriod: BillingPeriod = tier === 'plus' ? 'month' : period;
  const price = proPriceDetails(shownPeriod);
  const tierSwitch = showPlus && <div className="flex justify-center">
    <div role="radiogroup" aria-label={tr('เลือกแพ็กเกจ')} onKeyDown={onTierKey} data-testid="tier-switch"
      className="plan-switch relative grid w-full max-w-[320px] grid-cols-2 gap-1 rounded-full p-1">
      {(['plus', 'pro'] as const).map(option => {
        const active = option === tier;
        const figure = option === 'plus' ? PLUS_PRICE.price : proPriceDetails('month').price;
        return (
          <button key={option} type="button" role="radio" aria-checked={active} tabIndex={active ? 0 : -1}
            ref={node => { tierButtons.current[option] = node; }}
            onClick={() => setChoice(option)} data-tier-option={option}
            className={`relative flex min-h-10 items-center justify-center rounded-full px-2 text-[13.5px] font-semibold tracking-[0.01em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] ${active ? 'text-brand-text' : 'text-brand-muted hover:text-brand-text'}`}>
            {active && <motion.span layoutId={reduceMotion ? undefined : 'tier-pill'} aria-hidden="true" className="plan-switch-pill absolute inset-0 rounded-full" transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} />}
            <span className="relative">{option === 'plus' ? 'Plus' : 'Pro'} <span className="font-medium opacity-80">{formatBaht(figure)}</span></span>
          </button>
        );
      })}
    </div>
  </div>;
  const open = tier === 'plus' ? checkoutReady && plusSold : checkoutReady && PRO_CHECKOUT_OPEN[period] && (period === 'month' || Boolean(onSubscribePeriod));
  const proTokens = proTokensOnSale(shownPeriod);
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
        <p className="pf-sub"><b>{showPlus ? tr('เริ่มต้นวันละไม่ถึง 4 บาท') : tr('วันละไม่ถึง 6 บาท')}</b><span className="pf-coffee"><Coffee className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />{tr('ถูกกว่ากาแฟแก้วเดียว')}</span><span>{tr('ก็มีผู้ช่วยดูแลเรื่องเงินให้คุณ')}</span></p>
        {tierSwitch && <div className="mt-5 w-full">{tierSwitch}</div>}
        {tier === 'pro' && periodSwitch && <div className="mt-3 w-full">{periodSwitch}</div>}
        <div className="pf-card-wrap">
          <span aria-hidden="true" className="pf-halo" />
          <article data-testid={tier === 'plus' ? 'plus-card' : 'pro-card'} data-period={shownPeriod} data-tier={tier} className="pf-card" aria-labelledby="pro-plan-title">
            <h3 id="pro-plan-title" className="pf-pill">{tier === 'plus' ? tr('Plus {0}', t('plans.monthSwitchLabel')) : tr('Pro {0}', t(`plans.${period}SwitchLabel`))}</h3>
            {tier === 'pro' && price.bestValue && <span key={period} className="plan-badge is-strong pf-best">{t('plans.bestValueBadge')}</span>}
            <div className="pf-price" data-testid={tier === 'plus' ? 'plus-price' : 'pro-price'}>
              <p className="pf-price-row">
                {tier === 'pro' && price.saving > 0 && <s className="plan-was"><span className="sr-only">{t('plans.regularPrice')} </span>{formatBaht(price.regular)}</s>}
                <span className="plan-figure pf-figure"><span className="pf-currency">{tr('฿')}</span>{(tier === 'plus' ? PLUS_PRICE.price : price.price).toLocaleString('en-US')}</span>
                <span className="plan-per">{t(`plans.${shownPeriod}PerShort`)}</span>
              </p>
              {tier === 'plus'
                ? <p className="pf-save">{tr('{0} โทเคน · เอกสาร {1} ฉบับ · ไฟล์ {2} ไฟล์', PLAN_LIMITS.plus.tokens!.toLocaleString('en-US'), PLAN_LIMITS.plus.documentsPerMonth!, PLAN_LIMITS.plus.vaultFiles)}</p>
                : price.saving > 0 && <p className="pf-save">{period === 'month'
                ? tr('ประหยัด {0} ทุกเดือน', formatBaht(price.saving))
                : <>{t('plans.averagePerMonthShort', { price: formatBaht(price.average, 2) })} · {t('plans.savingText', { amount: formatBaht(price.saving), pct: String(price.savingPct) })}</>}</p>}
              {tier === 'pro' && period === 'month' && promoRunning && canBuy && !memberTier && !isProBanned && !hasOpenManagedSubscription && <PromoCountdownChips className="mt-3.5" />}
            </div>
            {statusText && (!memberTier || memberTier === tier) && (
              <p className="plan-status pf-status" data-testid="plan-status">
                <span className={`pf-status-chip ${isPaidActive ? 'is-pro' : ''}`}>{statusChip}</span>
                <span className="min-w-0">{statusText}</span>
              </p>
            )}
            <div className="pf-actions" data-testid={tier === 'plus' ? 'plus-actions' : 'pro-actions'}>{actionsOf(shownPeriod, tier)}</div>
            {canBuy && !memberTier && !isProBanned && !isGuestPreview && !hasOpenManagedSubscription && open && <p className="pf-terms">{tr('บัตร ต่ออายุอัตโนมัติเมื่อติ๊กยินยอม ปิดได้ทุกเมื่อ')}<br />{tr('พร้อมเพย์ จ่ายครั้งเดียว ไม่ต่ออายุเอง')}</p>}
          </article>
        </div>
      </section>
      <section className="pf-features" aria-labelledby="pf-features-title">
        <div className="pf-features-head">
          <h2 id="pf-features-title">{tr('สิ่งที่ได้ใน Pro')}</h2>
          <p>{tr('กดการ์ดเพื่อดูรายละเอียด')}</p>
        </div>
        <ProFeatureTiles tokens={proTokens} freeTokens={freeMonthlyTokens} stacked={phone} />
      </section>
      {/* The comparison closes the page (owner, 2026-11-16: "เทียบแพ็กเกจ ... เอาไว้ข้างล่างสุด"). */}
      {showPlus && <PlanCompare phone={phone} current={memberTier ?? (isInFreeTrial || isGuestPreview ? null : 'free')} chosen={tier}
        freeTokens={freeMonthlyTokens} proTokens={proTokens} proPrice={proPriceDetails('month').price} />}
    </div>
  );
};

type CompareCell = string | boolean;
/**
 * Free, Plus and Pro side by side (owner, 2026-11-15), every figure from shared/plans.ts. Computers and iPads read one
 * table with a column per plan; phones read the same rows with the three values under each line, so nothing is squeezed.
 */
function PlanCompare({ phone, current, chosen, freeTokens, proTokens, proPrice }: {
  phone: boolean; current: 'free' | PaidTier | null; chosen: PaidTier; freeTokens: number; proTokens: number; proPrice: number;
}) {
  const unlimited = tr('ไม่จำกัด');
  const rows: { label: string; cells: [CompareCell, CompareCell, CompareCell] }[] = [
    { label: tr('เลขากระรอก (โทเคนต่อเดือน)'), cells: [freeTokens > 0 ? freeTokens.toLocaleString('en-US') : false, PLAN_LIMITS.plus.tokens!.toLocaleString('en-US'), proTokens.toLocaleString('en-US')] },
    { label: tr('แชตและจดงานผ่าน LINE'), cells: [freeTokens > 0, true, true] },
    { label: tr('ออกเอกสารใหม่ต่อเดือน'), cells: [tr('{0} ฉบับ', PLAN_LIMITS.free.documentsPerMonth!), tr('{0} ฉบับ', PLAN_LIMITS.plus.documentsPerMonth!), unlimited] },
    { label: tr('เก็บไฟล์ในคลังเอกสาร'), cells: [tr('{0} ไฟล์', PLAN_LIMITS.free.vaultFiles), tr('{0} ไฟล์', PLAN_LIMITS.plus.vaultFiles), unlimited] },
    { label: tr('เตือนวันส่งงานและวันรับเงิน 08:00'), cells: [false, true, true] },
    { label: tr('เอกสารไม่มีข้อความเครดิตของแอป'), cells: [false, true, true] },
    { label: tr('สรุปรายเดือน ตามใบ 50 ทวิ และเตือนช่วงยื่นภาษี'), cells: [false, false, true] },
    { label: tr('รายงานและหน้าภาษี'), cells: [false, false, true] },
  ];
  const plans = [
    { id: 'free' as const, name: 'Free', price: formatBaht(0) },
    { id: 'plus' as const, name: 'Plus', price: formatBaht(PLUS_PRICE.price) },
    { id: 'pro' as const, name: 'Pro', price: formatBaht(proPrice) },
  ];
  const cell = (value: CompareCell, plan: string) => value === true
    ? <><Check className="pf-cmp-yes" size={16} strokeWidth={2.6} aria-hidden /><span className="sr-only">{tr('มีใน {0}', plan)}</span></>
    : value === false
    ? <><Minus className="pf-cmp-no" size={15} strokeWidth={2.2} aria-hidden /><span className="sr-only">{tr('ไม่มีใน {0}', plan)}</span></>
    : <span className="pf-cmp-val">{value}</span>;
  const mark = (id: 'free' | PaidTier) => `${id === chosen ? ' is-chosen' : ''}${id === current ? ' is-current' : ''}`;
  return (
    <section className="pf-compare" aria-labelledby="pf-compare-title" data-testid="plan-compare">
      <div className="pf-features-head">
        <h2 id="pf-compare-title">{tr('เทียบแพ็กเกจ')}</h2>
        <p>{tr('ราคาต่อเดือน ยังไม่รวมค่าธรรมเนียมชำระเงิน')}</p>
      </div>
      {phone ? (
        <ul className="pf-cmp-list">
          <li className="pf-cmp-heads" aria-hidden="true">{plans.map(plan => <span key={plan.id} className={`pf-cmp-plan${mark(plan.id)}`}><b>{plan.name}</b><small>{plan.price}</small></span>)}</li>
          {rows.map(row => (
            <li key={row.label} className="pf-cmp-item">
              <p className="pf-cmp-label">{row.label}</p>
              <div className="pf-cmp-values">{row.cells.map((value, index) => <span key={plans[index].id} className={`pf-cmp-cell${mark(plans[index].id)}`}>{cell(value, plans[index].name)}</span>)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="pf-cmp-wrap">
          <table className="pf-cmp-table">
            <thead>
              <tr>
                <th scope="col" className="pf-cmp-corner"><span className="sr-only">{tr('สิ่งที่ได้')}</span></th>
                {plans.map(plan => <th key={plan.id} scope="col" className={`pf-cmp-plan${mark(plan.id)}`}>
                  <b>{plan.name}</b><small>{tr('{0} / เดือน', plan.price)}</small>
                  {plan.id === current && <i className="pf-cmp-now">{tr('แพ็กเกจปัจจุบัน')}</i>}
                </th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {row.cells.map((value, index) => <td key={plans[index].id} className={`pf-cmp-cell${mark(plans[index].id)}`}>{cell(value, plans[index].name)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

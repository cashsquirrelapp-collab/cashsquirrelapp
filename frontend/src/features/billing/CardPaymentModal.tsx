import React from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { StripeCheckoutLoadActionsSuccess, StripePaymentElement, StripeCheckoutExpressCheckoutElement, StripeExpressCheckoutElementConfirmEvent } from '@stripe/stripe-js';
import { CreditCard, LockKeyhole } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { CARD_SAVE_DISCLOSURE, renewalConsentText, type CardOptions } from '../../../../shared/cardConsent';
import type { EmbeddedPayment } from './EmbeddedPaymentModal';

import { tr } from '../../i18n/tr';
/** Show the selected package immediately while the server validates/prepares it. */
export function PreparingCardModal({ amount, months, onClose }: { amount: number; months: number; onClose: () => void }) {
  return <Modal open onClose={onClose} label={tr("ชำระด้วยบัตร")} width={520}>
    <div className="p-6 pt-9 font-sans sm:p-7 sm:pt-10">
      <CardHeader duration={months === 12 ? tr("1 ปี") : tr("{0} เดือน", months)} />
      <AmountSummary amount={amount.toLocaleString('th-TH')} />
      <p role="status" className="mt-6 text-[13px] text-brand-muted">{tr("กำลังเตรียมช่องกรอกบัตร…")}</p>
      <div aria-hidden="true" className="mt-3 h-28 animate-pulse rounded-2xl bg-brand-faint motion-reduce:animate-none"/>
      <SecureNote />
    </div>
  </Modal>;
}

// One type scale for the whole dialog (owner, 2026-10-21: the text looked untidy and oddly bold):
// a 18px title, 13px body and labels, 12px notes, and weight only on the amount and the button.
function CardHeader({ duration }: { duration: string }) {
  return <div className="flex items-center gap-3.5">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]"><CreditCard size={21} strokeWidth={1.8}/></span>
    <div className="min-w-0"><h2 className="text-[18px] font-semibold leading-snug text-brand-text dark:text-white">{tr("ชำระด้วยบัตร")}</h2>
      <p className="mt-0.5 text-[13px] text-brand-muted">{tr("กระรอกตุนเงิน · Pro {0}", duration)}</p></div>
  </div>;
}
function AmountSummary({ amount, note }: { amount: string; note?: React.ReactNode }) {
  return <div className="mt-5 rounded-2xl border border-brand-border bg-brand-faint/60 px-4 py-3.5 dark:bg-white/[0.04]">
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-brand-muted">{tr("ยอดชำระวันนี้")}</span>
      <strong className="text-[26px] font-semibold leading-none tracking-[-0.02em] text-brand-text tabular-nums dark:text-white">{tr("฿{0}", amount)}</strong>
    </div>
    {note && <p className="mt-2 text-[12px] leading-relaxed text-brand-muted">{note}</p>}
  </div>;
}
const SecureNote = () => <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-brand-muted"><LockKeyhole size={13}/> {tr("ชำระอย่างปลอดภัยผ่าน Stripe")}</p>;

export function CardPaymentModal({ checkout, busy, onOptions, onClose, onComplete }: {
  checkout: EmbeddedPayment; busy: boolean;
  onOptions: (options: Pick<CardOptions, 'autoRenew' | 'saveCard'>) => Promise<boolean | undefined>;
  onClose: () => void; onComplete: () => void;
}) {
  const mount = React.useRef<HTMLDivElement>(null);
  const walletMount = React.useRef<HTMLDivElement>(null);
  const [walletStatus, setWalletStatus] = React.useState<'loading' | 'available' | 'unavailable'>('loading');
  const confirmationLock = React.useRef(false);
  const walletConfirm = React.useRef<(event: StripeExpressCheckoutElementConfirmEvent, secret: string) => void>(() => {});
  const actions = React.useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const [readySecret, setReadySecret] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [error, setError] = React.useState('');
  // Card payment is the auto-renewing subscription; a one-time purchase is PromptPay QR (owner,
  // 2026-10-21). The session is prepared as a renewal from the start, and the checkbox is the explicit
  // consent that unlocks payment, unticked by default. Ticking it no longer swaps the Stripe session,
  // so nothing typed in the card fields is lost.
  const autoRenew = true;
  const [consented, setConsented] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [syncError, setSyncError] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const syncLock = React.useRef(false);
  const needsReconcile = React.useRef(false);
  const mounted = React.useRef(false);
  const optionsCallback = React.useRef(onOptions);
  optionsCallback.current = onOptions;
  const ready = readySecret === checkout.clientSecret;
  const optionsPending = syncing || busy || autoRenew !== (checkout.autoRenew === true) || needsReconcile.current;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    if (syncLock.current || busy || syncError || completed
      || (autoRenew === (checkout.autoRenew === true) && !needsReconcile.current)) return;
    // Respond locally on every click. Coalesce quick changes and serialize server writes:
    // an older response can never reset the customer's latest selection.
    const timer = window.setTimeout(() => {
      syncLock.current = true; setSyncing(true);
      void optionsCallback.current({ autoRenew, saveCard: true }).then(ok => {
        if (!mounted.current) return;
        needsReconcile.current = ok !== true;
        if (!ok) setSyncError(tr("ยังเตรียมรายการไม่สำเร็จ ตัวเลือกของคุณยังอยู่ กรุณาลองอีกครั้ง"));
      }).catch(() => {
        if (!mounted.current) return;
        needsReconcile.current = true;
        setSyncError(tr("การเชื่อมต่อขัดข้อง ตัวเลือกของคุณยังอยู่ กรุณาลองอีกครั้ง"));
      }).finally(() => {
        syncLock.current = false;
        if (mounted.current) setSyncing(false);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [autoRenew, checkout.autoRenew, checkout.clientSecret, busy, syncing, syncError, retry, completed]);
  const amount = (checkout.amount / 100).toLocaleString('th-TH');
  const duration = checkout.months === 12 ? tr("1 ปี") : tr("{0} เดือน", checkout.months);
  React.useEffect(() => {
    let canceled = false;
    let payment: StripePaymentElement | undefined;
    let wallet: StripeCheckoutExpressCheckoutElement | undefined;
    actions.current = null;
    setReadySecret(null); setError(''); setWalletStatus('loading');
    void (async () => {
      const stripe = await loadStripe(checkout.publishableKey, { locale: 'th' });
      if (canceled) return;
      if (!stripe) throw new Error(tr("โหลดช่องกรอกบัตรไม่สำเร็จ"));
      const dark = document.documentElement.classList.contains('dark');
      const styles = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
      const sdk = stripe.initCheckoutElementsSdk({
        clientSecret: checkout.clientSecret,
        elementsOptions: {
          // Stripe fields live in an iframe: the site's CSS fonts must be loaded there too.
          fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap' }],
          savedPaymentMethod: { enableSave: 'never', enableRedisplay: 'auto' },
          appearance: {
            theme: dark ? 'night' : 'stripe',
            variables: { colorPrimary: token('--blue-acc', '#E65F2B'), colorBackground: token('--white', '#ffffff'),
              colorText: token('--text', '#1C1917'), colorTextSecondary: token('--muted', '#7D7772'), colorDanger: '#ef4444',
              borderRadius: '12px', fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", sans-serif',
              fontSizeBase: '16px', fontWeightNormal: '400', fontWeightMedium: '500', fontWeightBold: '600', spacingUnit: '4px' },
            rules: { '.Input': { boxShadow: 'none', borderColor: token('--border', '#E5E3DF'), fontSize: '15px', padding: '12px 14px' },
              '.Input:focus': { borderColor: token('--blue-acc', '#E65F2B'), boxShadow: '0 0 0 3px rgba(230, 95, 43, 0.14)' },
              '.Label': { fontWeight: '400', fontSize: '13px', color: token('--muted', '#7D7772'), marginBottom: '6px' }, '.Tab': { boxShadow: 'none' } },
          },
        },
      });
      let fieldsReady = false;
      const markReady = () => { if (!canceled && fieldsReady && actions.current) setReadySecret(checkout.clientSecret); };
      const loadingActions = sdk.loadActions();
      // Wallets need their native confirmation event, separately from card-form submission.
      payment = sdk.createPaymentElement({ layout: 'tabs', wallets: { googlePay: 'never', applePay: 'never' } });
      payment.on('ready', () => { fieldsReady = true; markReady(); });
      payment.on('loaderror', () => { if (!canceled) setError(tr("โหลดช่องกรอกบัตรไม่สำเร็จ กรุณาเปิดหน้านี้อีกครั้ง")); });
      if (mount.current) payment.mount(mount.current);
      // A wallet failure must not prevent the standard card form from loading.
      try {
        wallet = sdk.createExpressCheckoutElement();
        wallet.on('ready', event => {
          if (!canceled) setWalletStatus(event.availablePaymentMethods && Object.values(event.availablePaymentMethods).some(Boolean) ? 'available' : 'unavailable');
        });
        wallet.on('loaderror', () => { if (!canceled) setWalletStatus('unavailable'); });
        wallet.on('confirm', event => {
          if (canceled) { event.paymentFailed({ reason: 'fail' }); return; }
          walletConfirm.current(event, checkout.clientSecret);
        });
        if (walletMount.current) wallet.mount(walletMount.current);
      } catch { if (!canceled) setWalletStatus('unavailable'); }
      const loaded = await loadingActions;
      if (canceled) return;
      if (loaded.type !== 'success') throw new Error(tr("โหลดหน้าชำระไม่สำเร็จ กรุณาลองใหม่"));
      actions.current = loaded.actions;
      markReady();
    })().catch(e => { if (!canceled) setError(e.message || tr("โหลดหน้าชำระไม่สำเร็จ")); });
    return () => { canceled = true; actions.current = null; payment?.destroy(); wallet?.destroy(); };
  }, [checkout.clientSecret, checkout.publishableKey]);
  const confirm = async (walletEvent?: StripeExpressCheckoutElementConfirmEvent, secret = checkout.clientSecret) => {
    if (!actions.current || !ready || !consented || optionsPending || syncError || confirmationLock.current || completed || secret !== checkout.clientSecret) {
      walletEvent?.paymentFailed({ reason: 'fail' }); return;
    }
    if (Date.parse(checkout.expiresAt) <= Date.now()) { setError(tr("รายการหมดเวลาแล้ว กรุณาปิดและเปิดชำระใหม่")); walletEvent?.paymentFailed({ reason: 'fail' }); return; }
    confirmationLock.current = true; setPaying(true); setError('');
    try {
      const result = await actions.current.confirm({
        redirect: 'if_required', savePaymentMethod: checkout.saveCard === true,
        ...(walletEvent ? { expressCheckoutConfirmEvent: walletEvent } : {}),
        returnUrl: `${window.location.origin}/app?checkout=success`,
      });
      if (result.type === 'error') { walletEvent?.paymentFailed({ reason: 'fail' }); setError(result.error.message || tr("ชำระไม่สำเร็จ กรุณาตรวจข้อมูลบัตร")); return; }
      setCompleted(true);
      onComplete(); // The server, never this callback, grants Pro.
    } catch (cause) {
      walletEvent?.paymentFailed({ reason: 'fail' });
      // Never log provider payloads, card details, or Checkout secrets.
      const category = cause instanceof Error && cause.name === 'IntegrationError' ? 'integration' : 'confirmation';
      console.warn('checkout_confirmation_failed', { method: walletEvent ? 'wallet' : 'card', category });
      setError(walletEvent ? tr("ยืนยันผ่านกระเป๋าเงินไม่สำเร็จ กรุณาลองอีกครั้ง หรือเลือกชำระด้วยบัตร") : tr("ยืนยันการชำระไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง"));
    }
    finally { confirmationLock.current = false; setPaying(false); }
  };
  walletConfirm.current = (event, secret) => { void confirm(event, secret); };
  const nextRound = checkout.months === 12 ? tr("รอบถัดไป ฿{0} ทุกปี · ปิดการต่ออายุได้", amount)
    : checkout.months === 1 ? tr("รอบถัดไป ฿{0} ทุกเดือน · ปิดการต่ออายุได้", amount)
    : tr("รอบถัดไป ฿{0} ทุก 6 เดือน · ปิดการต่ออายุได้", amount);
  return <Modal open onClose={paying ? () => {} : onClose} label={tr("ชำระด้วยบัตร")} width={520}>
    <div className="overflow-y-auto p-6 pt-9 font-sans sm:p-7 sm:pt-10">
      <CardHeader duration={duration} />
      <AmountSummary amount={amount} note={completed ? undefined : nextRound} />
      {completed ? <p role="status" className="py-8 text-center text-[14px] text-brand-text dark:text-white">{tr("กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ")}</p> : <>
        <div className="mt-6" />
        {!ready && !error && <p role="status" className="mb-3 text-[13px] text-brand-muted">{tr("กำลังเตรียมช่องกรอกบัตร…")}</p>}
        <div ref={mount} data-testid="custom-card-fields" inert={optionsPending || !!syncError || paying} className={optionsPending ? 'opacity-40' : ''}/>
        <fieldset disabled={paying} className="mt-5 disabled:opacity-50">
          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-[13px] leading-relaxed text-brand-text transition-colors dark:text-white ${consented ? 'border-[#F3B08C] bg-[#FFF8F3] dark:border-[#E65F2B]/50 dark:bg-[#E65F2B]/10' : 'border-brand-border hover:bg-brand-faint/60'}`}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#E65F2B]" checked={consented}
              onChange={e => setConsented(e.target.checked)}/>
            <span>{renewalConsentText(checkout.period)}</span>
          </label>
        </fieldset>
        {!consented && !optionsPending && !syncError && <p className="mt-2 text-[12px] text-brand-muted">{tr("ติ๊กยินยอมการต่ออายุก่อน จึงจะกดชำระได้")}</p>}
        {optionsPending && !syncError && <p role="status" className="mt-2 text-[12px] text-brand-muted">{tr("กำลังเตรียมรายการตามตัวเลือกของคุณ…")}</p>}
        {syncError && <div className="mt-3 text-[13px]"><p role="alert" className="text-red-500">{syncError}</p>
          <button type="button" onClick={() => { setSyncError(''); setRetry(n => n + 1); }} className="mt-1.5 text-[#C24A16] underline dark:text-[#FFA473]">{tr("ลองเตรียมรายการอีกครั้ง")}</button></div>}
        {error && <p role="alert" className="mt-3 text-[13px] text-red-500">{error}</p>}
        <section className="mt-5" aria-label={tr("ชำระผ่านกระเป๋าเงิน")}>
          {walletStatus !== 'unavailable' && <div className="mb-3 flex items-center gap-3 text-[12px] text-brand-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-brand-border"/>{tr("หรือชำระผ่านกระเป๋าเงิน")}<span className="h-px flex-1 bg-brand-border"/></div>}
          <div ref={walletMount} data-testid="wallet-buttons" hidden={walletStatus === 'unavailable'}
            inert={!ready || !consented || optionsPending || !!syncError || paying}
            className={!ready || !consented || optionsPending || paying ? 'opacity-40' : ''}/>
          {walletStatus === 'available' && <p className="mt-2 text-center text-[12px] text-brand-muted">{tr("เลือกบัตรในหน้าต่างที่เปิดขึ้น")}</p>}
          {walletStatus === 'unavailable' && <p className="text-[12px] text-brand-muted">{tr("Google Pay / Apple Pay ยังไม่พร้อมในเบราว์เซอร์นี้ ใช้ช่องกรอกบัตรด้านบนได้")}</p>}
        </section>
        {checkout.saveCard && <p id="card-save-disclosure" className="mt-5 text-[12px] leading-relaxed text-brand-muted">{CARD_SAVE_DISCLOSURE}</p>}
        <button type="button" disabled={!ready || !consented || optionsPending || !!syncError || paying} onClick={() => void confirm()}
          aria-describedby={checkout.saveCard ? 'card-save-disclosure' : undefined}
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#E8672F] to-[#CF5420] px-4 text-[15px] font-semibold text-white shadow-[0_10px_20px_-12px_rgba(194,74,22,0.8)] transition-opacity hover:from-[#DE5D27] hover:to-[#C24A16] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
          {optionsPending && !syncError ? tr("กำลังเตรียมรายการ…") : paying ? tr("กำลังยืนยันการชำระ…") : tr("ยืนยันชำระ ฿{0}{1}", amount, checkout.saveCard ? tr(" และบันทึกบัตร") : '')}
        </button>
      </>}
      <SecureNote />
    </div>
  </Modal>;
}

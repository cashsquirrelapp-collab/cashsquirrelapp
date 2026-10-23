import React from 'react';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { StripeEmbeddedCheckout } from '@stripe/stripe-js';
import type { ProPeriod } from '../../../../shared/proPricing';
import { Modal } from '../../components/ui/Modal';
import { uiPrimaryButton } from '../../components/ui/uiStyles';

import { tr } from '../../i18n/tr';
export type EmbeddedPayment = {
  clientSecret: string; publishableKey: string; orderId: string;
  amount: number; months: number; period: ProPeriod; method: 'card' | 'promptpay'; expiresAt: string;
  customCard?: boolean; autoRenew?: boolean; saveCard?: boolean;
};
// Stripe permits one embedded instance at a time. Serialize initialization so a
// closed dialog/StrictMode cleanup cannot leave a late iframe in the next dialog.
let initialization = Promise.resolve();
export function EmbeddedPaymentModal({ checkout, onClose, onComplete, onRetry }: {
  checkout: EmbeddedPayment; onClose: () => void; onComplete: () => void; onRetry: () => void;
}) {
  const mount = React.useRef<HTMLDivElement>(null);
  const completeRef = React.useRef(onComplete);
  completeRef.current = onComplete;
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [expired, setExpired] = React.useState(Date.parse(checkout.expiresAt) <= Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setExpired(Date.parse(checkout.expiresAt) <= Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [checkout.expiresAt]);
  React.useEffect(() => {
    if (expired) return;
    let canceled = false;
    let embedded: StripeEmbeddedCheckout | undefined;
    setReady(false); setError(false);
    initialization = initialization.catch(() => {}).then(async () => {
      const stripe = await loadStripe(checkout.publishableKey, { locale: 'th' });
      if (canceled) return;
      if (!stripe) throw new Error('Stripe unavailable');
      embedded = await stripe.createEmbeddedCheckoutPage({
        clientSecret: checkout.clientSecret,
        onComplete: () => {
          if (canceled) return;
          setCompleted(true);
          completeRef.current(); // Poll authoritative state; never grant access in the browser.
        },
      });
      if (canceled) { embedded.destroy(); return; }
      if (mount.current) embedded.mount(mount.current);
      setReady(true);
    }).catch(() => { if (!canceled) setError(true); });
    return () => { canceled = true; embedded?.destroy(); };
  }, [checkout.clientSecret, checkout.publishableKey, expired]);
  return <Modal open onClose={onClose} label={checkout.method === 'card' ? tr("ชำระด้วยบัตร") : tr("ชำระด้วย QR พร้อมเพย์")} width={760}>
    <div className="overflow-y-auto p-4 pt-10 sm:p-6 sm:pt-10">
      <h2 className="text-xl font-bold text-brand-text dark:text-white">{checkout.method === 'card' ? tr("ชำระด้วยบัตร") : tr("ชำระด้วย QR พร้อมเพย์")}</h2>
      <p className="mb-4 mt-1 text-sm text-brand-muted">Pro {checkout.months === 12 ? tr("1 ปี") : tr("{0} เดือน", checkout.months)}{' '}{tr("· ฿{0} จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ", (checkout.amount / 100).toLocaleString('th-TH'))}</p>
      {completed ? <p role="status" className="py-8 text-center text-brand-muted">{tr("กำลังยืนยันยอดชำระ สิทธิ์ Pro จะเปิดให้อัตโนมัติ")}</p>
        : expired || error ? <div className="space-y-4 py-8 text-center">
          <p role="alert" className="text-brand-muted">{expired ? tr("หน้าชำระนี้หมดเวลาแล้ว กดเปิดใหม่เพื่อชำระต่อได้เลย") : tr("โหลดหน้าชำระไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>
          <button type="button" onClick={onRetry} className={uiPrimaryButton}>{tr("เปิดหน้าชำระใหม่")}</button>
        </div> : !ready && <p role="status" className="py-8 text-center text-brand-muted">{tr("กำลังเปิดหน้าชำระ…")}</p>}
      <div ref={mount} data-testid="embedded-payment" className={completed || expired || error ? 'hidden' : 'overflow-hidden rounded-xl bg-white'} />
      <p className="mt-4 text-center text-xs text-brand-muted">{tr("ชำระเงินอย่างปลอดภัยผ่าน Stripe · ข้อมูลบัตรส่งตรงถึง Stripe")}</p>
    </div>
  </Modal>;
}

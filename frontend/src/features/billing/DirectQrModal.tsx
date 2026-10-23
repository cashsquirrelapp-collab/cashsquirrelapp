import React from 'react';
import { LoaderCircle, ShieldCheck, QrCode } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { uiPrimaryButton } from '../../components/ui/uiStyles';
import { PRO_PRICING, type ProPeriod } from '../../../../shared/proPricing';
import { tr } from '../../i18n/tr';
export type DirectQrPayment = {
  orderId: string; qrImage: string; amount: number; months: number; period: ProPeriod; expiresAt: string;
};
export function DirectQrModal({ period, checkout, status, error, onClose, onRetry }: {
  period: ProPeriod; checkout: DirectQrPayment | null; status: 'loading' | 'pending' | 'paid' | 'expired';
  error?: string; onClose: () => void; onRetry: () => void;
}) {
  const plan = PRO_PRICING[period];
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [checkout?.qrImage]);
  return <Modal open onClose={onClose} label={tr("สแกนเพื่อชำระเงิน")} width={440}>
    <div className="overflow-y-auto px-5 pb-4 pt-10 sm:px-7 sm:pb-5">
      <h2 className="text-xl font-bold text-brand-text dark:text-white">{tr("สแกนเพื่อชำระเงิน")}</h2>
      <p className="mt-1 text-sm text-brand-muted">{tr("แพ็กเกจ Pro ·")}{' '}{plan.months === 12 ? tr("1 ปี") : tr("{0} เดือน", plan.months)}</p>
      <div className="my-4 flex min-h-60 items-center justify-center rounded-2xl border border-brand-border p-4 dark:border-white/10">
        {error || imageFailed || status === 'expired' ? <div className="space-y-4 py-7 text-center">
          <QrCode className="mx-auto text-brand-muted" size={40} />
          <p role="alert" className="text-sm text-brand-muted">{error || (imageFailed ? tr("โหลด QR ไม่สำเร็จ กรุณาลองอีกครั้ง") : tr("กดสร้าง QR ใหม่เพื่อชำระต่อได้เลย"))}</p>
          <button type="button" className={uiPrimaryButton} onClick={onRetry}>{tr("สร้าง QR ใหม่")}</button>
        </div> : status === 'paid' ? <p role="status" className="text-center text-brand-muted">{tr("รับชำระแล้ว กำลังเปิดสิทธิ์ Pro…")}</p>
          : checkout ? <img src={checkout.qrImage} alt={tr("QR พร้อมเพย์สำหรับชำระแพ็กเกจ Pro")} onError={() => setImageFailed(true)} referrerPolicy="no-referrer" className="aspect-square w-full max-w-64 bg-white p-2" />
          : <div role="status" className="space-y-3 text-center text-brand-muted"><LoaderCircle className="mx-auto animate-spin" size={32} /><p>{tr("กำลังสร้าง QR พร้อมสแกน…")}</p></div>}
      </div>
      <div className="space-y-2 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/5">
        <div className="flex justify-between gap-3"><span className="text-brand-muted">{tr("สิทธิ์ Pro")}</span><span>{plan.months === 12 ? tr("1 ปี") : tr("{0} เดือน", plan.months)}</span></div>
        <div className="flex justify-between gap-3"><span className="text-brand-muted">{tr("ชำระครั้งเดียว")}</span><strong className="text-lg text-brand-primary">{tr("฿{0}", plan.total.toLocaleString('th-TH'))}</strong></div>
      </div>
      {!error && status === 'pending' && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-xs text-brand-muted"><LoaderCircle size={15} className="shrink-0 animate-spin" />{tr("รอรับชำระ · เปิดแอปธนาคารแล้วสแกน QR")}</p>}
      <p className="mt-3 text-center text-xs text-brand-muted">{tr("ชำระสำเร็จแล้ว Pro เปิดอัตโนมัติ · ไม่ต่ออายุอัตโนมัติ")}</p>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-brand-border px-4 py-3 text-sm dark:border-white/10">{tr("ปิดหน้าต่าง")}</button>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-brand-muted"><ShieldCheck size={14} />{tr("รับชำระเงินอย่างปลอดภัยผ่าน Stripe")}</p>
    </div>
  </Modal>;
}

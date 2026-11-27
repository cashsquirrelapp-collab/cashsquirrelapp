import type { PaidTier } from '../../../../shared/plans';
import React from 'react';
import { Check, ImageDown, LoaderCircle, ShieldCheck, QrCode } from 'lucide-react';
import { apiFetch } from '../../services/api';
import { Modal } from '../../components/ui/Modal';
import { uiPrimaryButton } from '../../components/ui/uiStyles';
import { plusPriceParts, proPriceParts, proPricePartsForCharge, proPricing, type ProPeriod } from '../../../../shared/proPricing';
import { tr } from '../../i18n/tr';
export type DirectQrPayment = {
  orderId: string; qrImage: string; amount: number; months: number; period: ProPeriod; expiresAt: string;
  /** Which plan the QR pays for (Plus since 2026-11-15); none = Pro. */
  tier?: PaidTier;
};
/** The saved picture: the QR on white with what it pays and the amount, so it still makes sense in the photo album. */
async function qrPicture(qr: Blob, lines: { title: string; plan: string; amount: string; until: string }): Promise<Blob> {
  const image = await createImageBitmap(qr);
  const W = 1080, H = 1400, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  await document.fonts?.ready;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#E65F2B'; g.fillRect(0, 0, W, 16);
  g.textAlign = 'center'; g.fillStyle = '#1C1917';
  g.font = '600 52px "IBM Plex Sans Thai", sans-serif'; g.fillText(lines.title, W / 2, 130);
  g.fillStyle = '#78716C'; g.font = '400 36px "IBM Plex Sans Thai", sans-serif'; g.fillText(lines.plan, W / 2, 190);
  const size = 760; g.imageSmoothingEnabled = false; g.drawImage(image, (W - size) / 2, 250, size, size);
  g.fillStyle = '#E65F2B'; g.font = '600 88px "IBM Plex Sans", "IBM Plex Sans Thai", sans-serif'; g.fillText(lines.amount, W / 2, 1150);
  g.fillStyle = '#78716C'; g.font = '400 34px "IBM Plex Sans Thai", sans-serif'; g.fillText(lines.until, W / 2, 1220);
  g.fillText('krarok.com', W / 2, 1330);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png'));
}

export function DirectQrModal({ period, tier = 'pro', checkout, status, error, onClose, onRetry, accountId }: {
  period: ProPeriod; tier?: PaidTier; checkout: DirectQrPayment | null; status: 'loading' | 'pending' | 'paid' | 'expired';
  error?: string; onClose: () => void; onRetry: () => void;
  /** The signed-in account, for the QR picture request. */
  accountId?: string | null;
}) {
  const plus = tier === 'plus';
  const plan = plus ? { months: 1 } : proPricing()[period];
  // What the amount is made of, shown before paying (owner, 2026-10-25): the QR's own amount, so a QR made just before
  // 1 Dec 2569 keeps showing the amount it charges.
  const parts = (checkout ? proPricePartsForCharge(checkout.months, checkout.amount / 100, tier) : undefined) ?? (plus ? plusPriceParts() : proPriceParts(period));
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [checkout?.qrImage]);
  // บันทึกรูป QR (owner, 2026-11-28, from a tester): save the QR into the photo album and pay from the bank app without a
  // screenshot. Phones get the share sheet (บันทึกรูปภาพ); computers download the picture.
  const [saving, setSaving] = React.useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const saveQr = async () => {
    if (!checkout) return;
    setSaving('busy');
    try {
      const reply = await apiFetch(`/api/billing?qr_image=${encodeURIComponent(checkout.orderId)}`, { headers: accountId ? { 'X-Account-ID': accountId } : {} });
      if (!reply.ok) throw new Error(String(reply.status));
      const until = new Date(checkout.expiresAt);
      const raw = await reply.blob();
      // If the picture can't be drawn on this device, the plain QR from the bank is still worth saving.
      const picture = await qrPicture(raw, {
        title: tr("สแกนจ่ายด้วยแอปธนาคาร"),
        plan: `${plus ? tr("กระรอกตุนเงิน · แพ็กเกจ Plus") : tr("กระรอกตุนเงิน · แพ็กเกจ Pro")} ${plan.months === 12 ? tr("1 ปี") : tr("{0} เดือน", plan.months)}`,
        amount: tr("฿{0}", parts.total.toLocaleString('th-TH')),
        until: Number.isNaN(until.getTime()) ? '' : tr("ใช้ได้ถึง {0} น.", until.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })),
      }).catch(() => raw);
      const file = new File([picture], 'krarok-promptpay-qr.png', { type: 'image/png' });
      const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); setSaving('done'); return; }
        catch (shareError) { if ((shareError as Error).name === 'AbortError') { setSaving('idle'); return; } }
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setSaving('done');
    } catch { setSaving('failed'); }
  };
  return <Modal open onClose={onClose} label={tr("สแกนเพื่อชำระเงิน")} width={440}>
    <div className="overflow-y-auto px-5 pb-4 pt-10 sm:px-7 sm:pb-5">
      <h2 className="text-xl font-bold text-brand-text dark:text-white">{tr("สแกนเพื่อชำระเงิน")}</h2>
      <p className="mt-1 text-sm text-brand-muted">{plus ? tr("แพ็กเกจ Plus ·") : tr("แพ็กเกจ Pro ·")}{' '}{plan.months === 12 ? tr("1 ปี") : tr("{0} เดือน", plan.months)}</p>
      <div className="my-4 flex min-h-60 items-center justify-center rounded-2xl border border-brand-border p-4 dark:border-white/10">
        {error || imageFailed || status === 'expired' ? <div className="space-y-4 py-7 text-center">
          <QrCode className="mx-auto text-brand-muted" size={40} />
          <p role="alert" className="text-sm text-brand-muted">{error || (imageFailed ? tr("โหลด QR ไม่สำเร็จ กรุณาลองอีกครั้ง") : tr("กดสร้าง QR ใหม่เพื่อชำระต่อได้เลย"))}</p>
          <button type="button" className={uiPrimaryButton} onClick={onRetry}>{tr("สร้าง QR ใหม่")}</button>
        </div> : status === 'paid' ? <p role="status" className="text-center text-brand-muted">{plus ? tr("รับชำระแล้ว กำลังเปิดสิทธิ์ Plus…") : tr("รับชำระแล้ว กำลังเปิดสิทธิ์ Pro…")}</p>
          : checkout ? <div className="flex w-full flex-col items-center">
            <img src={checkout.qrImage} alt={plus ? tr("QR พร้อมเพย์สำหรับชำระแพ็กเกจ Plus") : tr("QR พร้อมเพย์สำหรับชำระแพ็กเกจ Pro")} onError={() => setImageFailed(true)} referrerPolicy="no-referrer" className="aspect-square w-full max-w-64 bg-white p-2" />
            {/* บันทึกรูป QR sits under the QR it saves: one flat CI pill, no gradient (owner, 2026-11-28 "ไม่สวย"). */}
            {status === 'pending' && <>
              <button type="button" onClick={() => void saveQr()} disabled={saving === 'busy'} data-testid="qr-save"
                className={`mt-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[13px] font-semibold leading-none transition-colors disabled:cursor-wait ${saving === 'done'
                  ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-orange-500/15 dark:text-orange-200'
                  : 'bg-[#E65F2B] text-white hover:bg-[#D35221]'}`}>
                {saving === 'busy' ? <LoaderCircle size={16} className="animate-spin" /> : saving === 'done' ? <Check size={16} strokeWidth={2.4} /> : <ImageDown size={16} />}
                {saving === 'busy' ? tr("กำลังเตรียมรูป…") : saving === 'done' ? tr("บันทึกรูปแล้ว") : tr("บันทึกรูป QR")}
              </button>
              {saving === 'done' && <p role="status" className="mt-2 text-center text-xs leading-[1.5] text-brand-muted">{tr("เปิดแอปธนาคาร แล้วเลือกสแกนจากรูปในอัลบั้ม")}</p>}
              {saving === 'failed' && <p role="alert" className="mt-2 text-center text-xs leading-[1.5] text-brand-muted">{tr("บันทึกรูปไม่สำเร็จ กดค้างที่ QR แล้วเลือกบันทึกรูปภาพแทนได้")}</p>}
            </>}
          </div>
          : <div role="status" className="space-y-3 text-center text-brand-muted"><LoaderCircle className="mx-auto animate-spin" size={32} /><p>{tr("กำลังสร้าง QR พร้อมสแกน…")}</p></div>}
      </div>
      <div className="space-y-2 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/5">
        <div className="flex justify-between gap-3"><span className="text-brand-muted">{plus ? tr("สิทธิ์ Plus") : tr("สิทธิ์ Pro")}</span><span>{plan.months === 12 ? tr("1 ปี") : tr("{0} เดือน", plan.months)}</span></div>
        <div className="flex justify-between gap-3" data-testid="qr-price"><span className="text-brand-muted">{tr("ค่าสมาชิก")}</span><span className="tabular-nums">{tr("฿{0}", parts.price.toLocaleString('th-TH'))}</span></div>
        <div className="flex justify-between gap-3" data-testid="qr-fee"><span className="text-brand-muted">{tr("ค่าธรรมเนียมชำระเงิน")}</span><span className="tabular-nums">{tr("฿{0}", parts.fee.toLocaleString('th-TH'))}</span></div>
        <div className="flex justify-between gap-3 border-t border-brand-border pt-2 dark:border-white/10"><span className="text-brand-muted">{tr("ชำระครั้งเดียว")}</span><strong className="text-lg text-brand-primary">{tr("฿{0}", parts.total.toLocaleString('th-TH'))}</strong></div>
      </div>
      {!error && status === 'pending' && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-xs text-brand-muted"><LoaderCircle size={15} className="shrink-0 animate-spin" />{tr("รอรับชำระ · เปิดแอปธนาคารแล้วสแกน QR")}</p>}
      <p className="mt-3 text-center text-xs text-brand-muted">{plus ? tr("ชำระสำเร็จแล้ว Plus เปิดอัตโนมัติ · ไม่ต่ออายุอัตโนมัติ") : tr("ชำระสำเร็จแล้ว Pro เปิดอัตโนมัติ · ไม่ต่ออายุอัตโนมัติ")}</p>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl border border-brand-border px-4 py-3 text-sm dark:border-white/10">{tr("ปิดหน้าต่าง")}</button>
      <p className="mt-4 flex items-center justify-center gap-1 text-xs text-brand-muted"><ShieldCheck size={14} />{tr("รับชำระเงินอย่างปลอดภัยผ่าน Stripe")}</p>
    </div>
  </Modal>;
}

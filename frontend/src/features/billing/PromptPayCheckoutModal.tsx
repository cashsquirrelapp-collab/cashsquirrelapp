import React from 'react';
import type { ProPeriod } from '../../../../shared/proPricing';
import { ExternalLink, QrCode, RefreshCw } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';

export type PromptPayCheckout = {
  url: string;
  expiresAt: string;
  amount: number;
  months?: number;
  period?: ProPeriod;
  status?: 'open' | 'expired' | 'pending';
};

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
}

export function PromptPayCheckoutModal({
  checkout,
  busy,
  onClose,
  onRegenerate,
}: {
  checkout: PromptPayCheckout | null;
  busy: boolean;
  onClose: () => void;
  onRegenerate: () => void;
}) {
  const [remaining, setRemaining] = React.useState(() => checkout ? remainingSeconds(checkout.expiresAt) : 0);

  React.useEffect(() => {
    if (!checkout) return;
    const update = () => setRemaining(remainingSeconds(checkout.expiresAt));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [checkout]);

  if (!checkout) return null;
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  const pending = checkout.status === 'pending';
  const expired = checkout.status === 'expired' || remaining === 0;

  return (
    <Modal open onClose={onClose} label="ชำระด้วย QR พร้อมเพย์" width={480}>
      <div className="space-y-5 overflow-y-auto p-6 pt-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDE8DD] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]">
          <QrCode className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold text-brand-text dark:text-white">QR พร้อมเพย์ ฿{(checkout.amount / 100).toLocaleString('th-TH')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-brand-muted">
            ชำระครั้งเดียวสำหรับสิทธิ์ Pro {checkout.months ?? 1} เดือนปฏิทิน ไม่ตัดเงินอัตโนมัติ และต้องต่ออายุเองเมื่อสิทธิ์หมด
          </p>
        </div>

        {pending ? (
          <div className="rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Stripe รับรายการแล้ว ระบบกำลังรอการยืนยันผ่าน webhook กรุณาอย่าสร้าง QR ใหม่
          </div>
        ) : expired ? (
          <div className="rounded-xl bg-neutral-100 p-4 text-xs leading-relaxed text-brand-muted dark:bg-neutral-800">
            QR นี้หมดอายุแล้ว ระบบจะยกเลิก session เดิมก่อนสร้าง QR ใหม่ เพื่อป้องกันการจ่ายซ้ำ
          </div>
        ) : (
          <div aria-live="polite" className="rounded-xl border border-brand-border p-4 dark:border-neutral-700">
            <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted">เวลาที่เหลือตาม Stripe</p>
            <p className="mt-1 font-mono text-3xl font-black tabular-nums text-[#E65F2B] dark:text-[#FFA473]">{minutes}:{seconds}</p>
          </div>
        )}

        <div className="space-y-2 text-left text-[11px] leading-relaxed text-brand-muted">
          <p>1. เปิดหน้า Stripe แล้วสแกน QR ด้วยแอปธนาคาร หรือบันทึกภาพ QR ไว้ใช้บนมือถือเครื่องเดียวกัน</p>
          <p>2. ชำระเพียงครั้งเดียว ภายในเวลาที่แสดง และอย่าสแกนภาพเดิมซ้ำหลังจ่ายสำเร็จ</p>
          <p>3. สิทธิ์จะเปิดหลัง Stripe ยืนยันยอด ไม่ใช่ทันทีที่เปิดหน้า QR</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          {expired ? (
            <button type="button" className={`${uiPrimaryButton} flex-1`} disabled={busy} onClick={onRegenerate}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {busy ? 'กำลังสร้าง…' : 'สร้าง QR ใหม่'}
            </button>
          ) : (
            <a className={`${uiPrimaryButton} flex-1`} href={checkout.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> เปิด QR ใน Stripe
            </a>
          )}
          <button type="button" className={`${uiSecondaryButton} flex-1`} onClick={onClose}>ปิดไว้ก่อน</button>
        </div>
      </div>
    </Modal>
  );
}

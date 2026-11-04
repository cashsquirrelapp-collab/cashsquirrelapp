import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { tr } from '../i18n/tr';
import { giveConsent } from '../services/consent';

/**
 * The terms, once per account and version, before the app (owner, 2026-11-05: "อะไรที่มันเป็นข้อมูลที่เซนซิทีฟทุกจุด ...
 * ให้เขายืนยันหรือยินยอมเราก่อน"). Two ticks: the terms and the privacy policy, and that the client details the person
 * records are theirs to use for that work. Nothing behind it opens until both are ticked; the other way out is signing
 * out. The server keeps the time and the version (shared/consents.ts). A centred card on computers and iPads, a sheet
 * from the bottom on phones; it never closes by itself.
 */
export function TermsGate({ account, phone, onSignOut }: { account: string; phone: boolean; onSignOut: () => void }) {
  const [terms, setTerms] = React.useState(false);
  const [clients, setClients] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState('');
  const first = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  const accept = async () => {
    if (!terms || !clients || busy) return;
    setBusy(true); setProblem('');
    try { await giveConsent(account, 'terms', { keepIfOffline: true }); }
    catch (error) { setProblem((error as Error).message || tr("บันทึกไม่สำเร็จ กรุณาลองใหม่")); setBusy(false); }
  };
  const link = 'whitespace-nowrap font-medium text-[#C24A16] underline underline-offset-2 dark:text-[#FFA473]';
  const row = 'flex cursor-pointer items-start gap-3 px-4 py-3.5';
  const box = 'mt-[3px] h-5 w-5 shrink-0 cursor-pointer accent-[#E65F2B]';
  return (
    <div className={`fixed inset-0 z-[90] flex bg-[rgba(28,25,23,0.46)] backdrop-blur-[6px] dark:bg-[rgba(0,0,0,0.62)] ${phone ? 'items-end' : 'items-center justify-center p-4'}`} data-testid="terms-gate">
      <section role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" aria-describedby="terms-gate-lead"
        className={`flex max-h-full w-full flex-col overflow-y-auto bg-brand-white text-brand-text shadow-[0_24px_64px_rgba(28,25,23,0.24)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.6)] ${phone
          ? 'rounded-t-[20px] px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-5'
          : 'max-w-[520px] rounded-[20px] border border-brand-border p-7'}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]" aria-hidden="true">
          <ShieldCheck className="h-[22px] w-[22px]" />
        </span>
        <h2 id="terms-gate-title" className={`mt-3.5 font-semibold leading-[1.45] ${phone ? 'text-[19px]' : 'text-[21px]'}`}>{tr("ข้อตกลงก่อนใช้งาน")}</h2>
        <p id="terms-gate-lead" className="mt-1.5 text-[14px] leading-[1.65] text-brand-muted">
          {tr("กระรอกตุนเงินเก็บข้อมูลงาน ลูกค้า และการเงินที่คุณบันทึก เพื่อคุ้มครองข้อมูลของคุณและลูกค้าของคุณ กรุณาอ่านและยืนยันทั้ง 2 ข้อก่อนใช้งานต่อ")}
        </p>
        <div className="mt-4 divide-y divide-brand-border overflow-hidden rounded-[14px] bg-brand-faint">
          <label className={row}>
            <input ref={first} type="checkbox" className={box} checked={terms} onChange={event => setTerms(event.target.checked)} data-testid="terms-gate-terms" />
            <span className="text-[14px] leading-[1.6]">
              {tr("ฉันได้อ่านและยอมรับ")}{' '}
              <a href="/terms" target="_blank" rel="noopener" className={link}>{tr("ข้อกำหนดการใช้งาน")}</a>{tr(" และ ")}
              <a href="/privacy" target="_blank" rel="noopener" className={link}>{tr("นโยบายความเป็นส่วนตัว")}</a>
            </span>
          </label>
          <label className={row}>
            <input type="checkbox" className={box} checked={clients} onChange={event => setClients(event.target.checked)} data-testid="terms-gate-clients" />
            <span className="text-[14px] leading-[1.6]">
              {tr("ข้อมูลลูกค้าที่ฉันบันทึก เช่น ชื่อ ที่อยู่ เลขผู้เสียภาษี เบอร์โทร และอีเมล ฉันได้รับมาโดยชอบ และใช้เพื่อทำงานและออกเอกสารให้ลูกค้ารายนั้นเท่านั้น")}
            </span>
          </label>
        </div>
        <p className="mt-3 text-[12.5px] leading-[1.6] text-brand-muted">
          {tr("ระบบบันทึกวันและเวลาที่คุณยืนยัน การใช้เลขากระรอกและการเชื่อมต่อ LINE จะขอความยินยอมแยกอีกครั้งเมื่อเริ่มใช้")}
        </p>
        {problem && <p className="mt-2 text-[13px] leading-[1.6] text-[#C43A3A] dark:text-[#F19A9A]" role="alert">{problem}</p>}
        <div className={`mt-5 grid gap-2 ${phone ? '' : 'grid-cols-[auto_1fr]'}`}>
          <button type="button" onClick={onSignOut} disabled={busy}
            className="min-h-11 rounded-[10px] border border-brand-border px-4 text-[14px] font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-50 cursor-pointer">
            {tr("ไม่ยอมรับ ออกจากระบบ")}
          </button>
          <button type="button" onClick={() => { void accept(); }} disabled={!terms || !clients || busy} data-testid="terms-gate-accept"
            className="min-h-11 rounded-[10px] bg-[#E65F2B] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] disabled:cursor-not-allowed disabled:bg-[#E65F2B]/40 cursor-pointer">
            {busy ? tr("กำลังบันทึก…") : tr("ยอมรับและใช้งานต่อ")}
          </button>
        </div>
      </section>
    </div>
  );
}

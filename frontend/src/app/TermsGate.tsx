import React from 'react';
import { Check, EyeOff, Lock, MegaphoneOff, ShieldCheck } from 'lucide-react';
import { BrandLockup } from '../components/brand/BrandLogo';
import { tr } from '../i18n/tr';
import { giveConsent } from '../services/consent';

/**
 * The terms, once per account and version, before the app (owner, 2026-11-05: "อะไรที่มันเป็นข้อมูลที่เซนซิทีฟทุกจุด ...
 * ให้เขายืนยันหรือยินยอมเราก่อน"). Two ticks: the terms and the privacy policy, and that the client details the person
 * records are theirs to use for that work. Nothing behind it opens until both are ticked; the other way out is signing
 * out. The server keeps the time and the version (shared/consents.ts). A centred card on computers and iPads, a sheet
 * from the bottom on phones; it never closes by itself.
 *
 * Computers and iPads (owner, 2026-11-05: "ปรับเปลี่ยน UI หน่อยไม่ค่อยสวยเลย", then design B "เอาแบบนี้"): one card in two
 * halves. The cream side says, in short, how the data is looked after (from the privacy policy) with the brand; the white
 * side holds the two choices as cards that turn orange when ticked, and the two buttons side by side. Phones keep their
 * sheet as it was.
 */
const PROMISES = [
  { icon: Lock, text: "ข้อมูลงาน ลูกค้า และการเงิน เก็บไว้ในบัญชีของคุณ" },
  { icon: EyeOff, text: "เราไม่ขายข้อมูลส่วนบุคคล" },
  { icon: MegaphoneOff, text: "ไม่ใช้ข้อมูลการเงินของคุณเพื่อโฆษณา" },
];

/** One of the two choices on computers and iPads: a card with a round tick, orange once ticked. */
function Choice({ checked, onChange, title, testId, inputRef, children }: {
  checked: boolean; onChange: (checked: boolean) => void; title: string; testId: string; inputRef?: React.Ref<HTMLInputElement>; children: React.ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3.5 rounded-[14px] border p-4 transition-colors ${checked
      ? 'border-[#E65F2B] bg-[#FFFAF6] shadow-[inset_0_0_0_1px_#E65F2B] dark:border-[#F07440] dark:bg-[#E65F2B]/[0.08] dark:shadow-[inset_0_0_0_1px_#F07440]'
      : 'border-brand-border hover:bg-brand-faint'}`}>
      <span className="relative mt-px h-6 w-6 shrink-0">
        <input ref={inputRef} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} data-testid={testId}
          className="peer h-6 w-6 cursor-pointer appearance-none rounded-full border-[1.5px] border-[#CFCAC4] bg-white transition-colors checked:border-[#E65F2B] checked:bg-[#E65F2B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E65F2B] dark:border-white/25 dark:bg-transparent dark:checked:border-[#F07440] dark:checked:bg-[#F07440]" />
        <Check className="pointer-events-none absolute left-[5px] top-[5px] h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="min-w-0 text-[14px] leading-[1.6] text-pretty">
        <span className="mb-0.5 block text-[14.5px] font-semibold leading-[1.5]">{title}</span>
        {children}
      </span>
    </label>
  );
}

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
  const termsWords = <>
    {tr("ฉันได้อ่านและยอมรับ")}{' '}
    <a href="/terms" target="_blank" rel="noopener" className={link}>{tr("ข้อกำหนดการใช้งาน")}</a>{tr(" และ ")}
    <a href="/privacy" target="_blank" rel="noopener" className={link}>{tr("นโยบายความเป็นส่วนตัว")}</a>
  </>;
  const clientWords = tr("ข้อมูลลูกค้าที่ฉันบันทึก เช่น ชื่อ ที่อยู่ เลขผู้เสียภาษี เบอร์โทร และอีเมล เป็นข้อมูลที่ลูกค้าให้มา และใช้เพื่อทำงานและออกเอกสารให้ลูกค้ารายนั้นเท่านั้น");
  const note = tr("ถามครั้งเดียว ระบบเก็บวันเวลาที่คุณยืนยันไว้เป็นหลักฐาน ส่วนเลขากระรอกและ LINE จะถามแยกเมื่อคุณเริ่มใช้");
  const problemLine = problem && <p className="mt-2 text-[13px] leading-[1.6] text-[#C43A3A] dark:text-[#F19A9A]" role="alert">{problem}</p>;
  const signOutButton = (
    <button type="button" onClick={onSignOut} disabled={busy}
      className="min-h-11 rounded-[10px] border border-brand-border px-4 text-[14px] font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-50 cursor-pointer">
      {tr("ไม่ยอมรับ ออกจากระบบ")}
    </button>
  );
  const acceptButton = (
    <button type="button" onClick={() => { void accept(); }} disabled={!terms || !clients || busy} data-testid="terms-gate-accept"
      className="min-h-11 rounded-[10px] bg-[#E65F2B] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] disabled:cursor-not-allowed disabled:bg-[#E65F2B]/40 cursor-pointer">
      {busy ? tr("กำลังบันทึก…") : tr("ยอมรับและใช้งานต่อ")}
    </button>
  );
  if (!phone) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(28,25,23,0.46)] p-4 backdrop-blur-[6px] dark:bg-[rgba(0,0,0,0.62)]" data-testid="terms-gate">
        <section role="dialog" aria-modal="true" aria-labelledby="terms-gate-title" aria-describedby="terms-gate-lead"
          className="grid max-h-full w-full max-w-[900px] grid-cols-[288px_minmax(0,1fr)] overflow-y-auto rounded-[20px] border border-brand-border bg-brand-white text-brand-text shadow-[0_24px_64px_rgba(28,25,23,0.24)] dark:shadow-[0_24px_64px_rgba(0,0,0,0.6)] lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="flex flex-col bg-[#FFF1E8] px-7 py-8 dark:bg-[#E65F2B]/[0.12] lg:px-[30px]">
            <BrandLockup size={30} />
            <h3 className="mt-7 text-[21px] font-semibold leading-[1.45]">{tr("เราดูแลข้อมูลของคุณ")}</h3>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-[#7A5A48] dark:text-brand-muted">{tr("สรุปสั้น ๆ จากนโยบายความเป็นส่วนตัว")}</p>
            <ul className="mt-6 grid gap-4">
              {PROMISES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[14.5px] font-medium leading-[1.5] text-pretty">
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white text-[#C24A16] shadow-[0_1px_2px_rgba(166,63,27,0.08)] dark:bg-white/10 dark:text-[#FFA473]" aria-hidden="true">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span>{tr(text)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-6 text-[12.5px] leading-[1.6] text-pretty text-[#7A5A48] dark:text-brand-muted">{note}</p>
          </aside>
          <div className="flex min-w-0 flex-col px-8 pb-7 pt-8">
            <h2 id="terms-gate-title" className="text-[22px] font-semibold leading-[1.45]">{tr("ข้อตกลงก่อนใช้งาน")}</h2>
            <p id="terms-gate-lead" className="mt-1 text-[14px] leading-[1.6] text-brand-muted">{tr("กรุณายืนยัน 2 ข้อ ก่อนเริ่มใช้งาน")}</p>
            <div className="mt-5 grid gap-3">
              <Choice checked={terms} onChange={setTerms} title={tr("ข้อกำหนดและนโยบาย")} testId="terms-gate-terms" inputRef={first}>{termsWords}</Choice>
              <Choice checked={clients} onChange={setClients} title={tr("ข้อมูลลูกค้า")} testId="terms-gate-clients">{clientWords}</Choice>
            </div>
            {problemLine}
            <div className="mt-auto grid grid-cols-2 gap-2.5 pt-6">{signOutButton}{acceptButton}</div>
          </div>
        </section>
      </div>
    );
  }
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
          {tr("ข้อมูลงาน ลูกค้า และการเงินที่คุณบันทึก เก็บไว้ในบัญชีของคุณ เราไม่ขายข้อมูลส่วนบุคคล และไม่ใช้ข้อมูลการเงินของคุณเพื่อโฆษณา กรุณาอ่านและยืนยัน 2 ข้อด้านล่างก่อนใช้งานต่อ")}
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
              {tr("ข้อมูลลูกค้าที่ฉันบันทึก เช่น ชื่อ ที่อยู่ เลขผู้เสียภาษี เบอร์โทร และอีเมล เป็นข้อมูลที่ลูกค้าให้มา และใช้เพื่อทำงานและออกเอกสารให้ลูกค้ารายนั้นเท่านั้น")}
            </span>
          </label>
        </div>
        <p className="mt-3 text-[12.5px] leading-[1.6] text-brand-muted">
          {tr("ถามครั้งเดียว ระบบเก็บวันเวลาที่คุณยืนยันไว้เป็นหลักฐาน ส่วนเลขากระรอกและ LINE จะถามแยกเมื่อคุณเริ่มใช้")}
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

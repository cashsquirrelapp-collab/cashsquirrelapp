import React from 'react';
import { Check, Mail } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { apiJson } from '../../services/api';
import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { isValidPassword, passwordRequirements } from '../../../../shared/passwordPolicy';

// เพิ่มอีเมลและรหัสผ่าน (owner, 2026-11-14: "เข้าทางไหนก็ได้ ... ใช้ในเว็บไซต์ได้เหมือนกัน"): an account made in LINE has no
// email or password of its own, so on a computer it could not sign in. Here it adds both; the address is checked by a link
// sent to it (/api/account-email) and becomes the account's sign-in email once that link is opened. LINE keeps working.

const RULES = [
  { key: 'length', text: "8–128 ตัวอักษร" },
  { key: 'letter', text: "มีตัวอักษรอย่างน้อย 1 ตัว" },
  { key: 'number', text: "มีตัวเลขอย่างน้อย 1 ตัว" },
] as const;

export function LoginEmailForm({ accountId }: { accountId: string }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const met = passwordRequirements(password);
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && isValidPassword(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      await apiJson('/api/account-email', { method: 'POST', headers: { 'X-Account-ID': accountId }, body: JSON.stringify({ email: email.trim(), password }) });
      setSentTo(email.trim().toLowerCase()); setPassword('');
    } catch (caught) { setError((caught as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setBusy(false); }
  };

  if (sentTo) {
    return (
      <p role="status" className="mt-2 flex items-start gap-2 rounded-[10px] border border-[#BFE3CB] bg-[#EEF8F1] px-3.5 py-2.5 text-[13px] leading-[1.6] text-[#0A6B31] dark:border-[#1F5A35] dark:bg-[#12291B] dark:text-[#86E0A6]">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{tr("ส่งลิงก์ยืนยันไปที่ {0} แล้ว กดลิงก์ในอีเมลภายใน 24 ชั่วโมง แล้วเข้าสู่ระบบบนเว็บด้วยอีเมลนี้และรหัสผ่านที่ตั้งไว้ได้", sentTo)}</span>
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${uiSecondaryButton} mt-2 px-3.5 text-[13px]`} data-testid="login-email-open">
        <Mail className="h-4 w-4" />{tr("เพิ่มอีเมลและรหัสผ่าน")}
      </button>
    );
  }
  return (
    <form onSubmit={event => void submit(event)} className="mt-3 grid gap-3 rounded-[12px] border border-brand-border p-3.5" data-testid="login-email-form">
      <p className="text-[13px] leading-[1.6] text-brand-muted">{tr("เพิ่มไว้แล้วเข้าสู่ระบบบนเว็บด้วยอีเมลนี้ได้ บัญชียังใช้ผ่าน LINE ได้เหมือนเดิม")}</p>
      <label className="grid gap-1.5 text-[13px] font-medium leading-[1.5] text-brand-text">
        {tr("อีเมล")}
        <input type="email" className={uiInput} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
      </label>
      <label className="grid gap-1.5 text-[13px] font-medium leading-[1.5] text-brand-text">
        {tr("รหัสผ่าน")}
        <input type="password" className={uiInput} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" maxLength={128} required />
      </label>
      <ul className="grid gap-1.5 sm:grid-cols-3" aria-label={tr("เงื่อนไขรหัสผ่าน")}>
        {RULES.map(rule => (
          <li key={rule.key} className={`flex items-start gap-2 text-[12px] leading-[1.6] ${met[rule.key] ? 'text-[#0A8F3F] dark:text-[#4ADE80]' : 'text-brand-muted'}`}>
            <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${met[rule.key] ? 'border-[#0A8F3F] bg-[#0A8F3F] text-white' : 'border-brand-border'}`}>
              {met[rule.key] && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span>{tr(rule.text)}</span>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-[13px] leading-[1.6] text-[#C43A3A] dark:text-[#F19A9A]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!ready || busy} className={`${uiPrimaryButton} px-5 text-[13px]`} data-testid="login-email-send">{busy ? tr("กำลังส่ง…") : tr("ส่งลิงก์ยืนยัน")}</button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className={`${uiSecondaryButton} px-4 text-[13px]`}>{tr("ยกเลิก")}</button>
      </div>
    </form>
  );
}

/** What the link in the email came back with (/settings?loginEmail=…), shown once on the profile page. */
export const LOGIN_EMAIL_RESULTS: Record<string, { ok: boolean; text: string }> = {
  added: { ok: true, text: "เพิ่มอีเมลแล้ว เข้าสู่ระบบบนเว็บด้วยอีเมลนี้และรหัสผ่านที่ตั้งไว้ได้เลย" },
  taken: { ok: false, text: "อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว กรุณาใช้อีเมลอื่น" },
  expired: { ok: false, text: "ลิงก์ยืนยันหมดอายุหรือใช้ไม่ได้แล้ว กรุณาขอลิงก์ใหม่" },
};

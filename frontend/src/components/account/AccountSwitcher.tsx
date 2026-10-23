import React from 'react';
import { Check, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { deviceAccounts, type DeviceAccount } from '../../services/auth';

import { tr } from '../../i18n/tr';
// Switch between accounts signed in on this browser, like Google or Facebook (owner, 2026-10-21).
// Opened from the account menu on computers and iPads, and on phones by tapping the profile box on the
// เมนู screen (owner, 2026-10-23: logging out or switching was hard to find there), where it also
// carries the profile and sign-out rows. A ready account switches at once and the page reloads into
// it; one whose session ended asks for its password again with the email filled in.

function Initial({ account, avatarUrl }: { account: DeviceAccount; avatarUrl?: string }) {
  const letter = (account.name || account.email || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF1E8] text-[15px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]" aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : letter}
    </span>
  );
}

export function AccountSwitcher({ open, onClose, currentAvatar, onAddAccount, title, extra }: {
  open: boolean;
  /** Heading; defaults to สลับบัญชี. */
  title?: string;
  /** More rows under the add button (phones: profile and sign out). */
  extra?: React.ReactNode;
  onClose: () => void;
  currentAvatar?: string;
  /** Sign in to another account (or again to one whose session ended) while this one stays signed in. */
  onAddAccount: (email?: string) => void;
}) {
  const [accounts, setAccounts] = React.useState<DeviceAccount[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!open) return;
    setAccounts(null); setError(''); setBusy(null);
    deviceAccounts.list().then(setAccounts).catch(() => { setAccounts([]); setError(tr("โหลดรายชื่อบัญชีไม่สำเร็จ กรุณาลองใหม่")); });
  }, [open]);

  const choose = async (account: DeviceAccount) => {
    if (account.current || busy) return;
    if (!account.ready) { onAddAccount(account.email); return; }
    setBusy(account.id); setError('');
    try {
      await deviceAccounts.switchTo(account.id);
      window.location.assign('/');
    } catch (cause) {
      setBusy(null);
      const failure = cause as { code?: string; message?: string };
      if (failure.code === 'account_signin_required') {
        setAccounts(list => list?.map(item => (item.id === account.id ? { ...item, ready: false } : item)) ?? null);
        setError(tr("{0} ต้องเข้าสู่ระบบอีกครั้ง", account.email));
      } else setError(failure.message || tr("สลับบัญชีไม่สำเร็จ กรุณาลองใหม่"));
    }
  };
  const forget = async (account: DeviceAccount) => {
    if (busy) return;
    setBusy(account.id); setError('');
    try {
      await deviceAccounts.forget(account.id);
      setAccounts(list => list?.filter(item => item.id !== account.id) ?? null);
    } catch { setError(tr("นำบัญชีออกไม่สำเร็จ กรุณาลองใหม่")); }
    finally { setBusy(null); }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} label={title || tr("สลับบัญชี")} width={440}>
      <div className="p-6 pt-8 font-sans">
        <h2 className="pr-10 text-[18px] font-semibold leading-snug text-brand-text">{title || tr("สลับบัญชี")}</h2>
        <p className="mt-1 text-[13px] text-brand-muted">{tr("บัญชีที่เข้าสู่ระบบไว้ในเบราว์เซอร์นี้")}</p>

        {accounts === null ? (
          <p role="status" className="mt-5 flex items-center gap-2 text-[13px] text-brand-muted"><Loader2 className="h-4 w-4 animate-spin" /> {tr("กำลังโหลดบัญชี…")}</p>
        ) : (
          <ul className="mt-4 space-y-1" aria-label={tr("บัญชีในเบราว์เซอร์นี้")}>
            {accounts.map(account => (
              <li key={account.id} className="group flex items-center gap-1">
                <button type="button" onClick={() => void choose(account)} disabled={account.current || Boolean(busy)}
                  aria-current={account.current ? 'true' : undefined}
                  aria-label={account.current ? tr("{0} บัญชีที่ใช้อยู่", account.name || account.email) : tr("สลับไปใช้ {0}", account.name || account.email)}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${account.current ? 'bg-brand-faint/70 cursor-default dark:bg-white/[0.04]' : 'hover:bg-brand-faint cursor-pointer disabled:cursor-wait'}`}>
                  <Initial account={account} avatarUrl={account.current ? currentAvatar : undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-brand-text">{account.name || account.email.split('@')[0]}</span>
                    <span className="block truncate text-[12.5px] text-brand-muted">{account.email}</span>
                  </span>
                  {account.current ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF1E8] px-2 py-0.5 text-[11.5px] font-semibold text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]"><Check className="h-3.5 w-3.5" />{tr("ใช้อยู่")}</span>
                  ) : busy === account.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-muted" />
                  ) : account.ready ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-brand-muted" />
                  ) : (
                    <span className="shrink-0 text-[12px] font-medium text-[#C24A16] dark:text-[#FFA473]">{tr("เข้าสู่ระบบอีกครั้ง")}</span>
                  )}
                </button>
                {!account.current && (
                  <button type="button" onClick={() => void forget(account)} disabled={Boolean(busy)}
                    aria-label={tr("นำ {0} ออกจากเบราว์เซอร์นี้", account.email)} title={tr("นำออกจากเบราว์เซอร์นี้")}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-brand-muted opacity-60 transition hover:bg-brand-faint hover:text-brand-text hover:opacity-100 focus-visible:opacity-100 cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="mt-3 text-[13px] text-[#C43A3A] dark:text-[#F19A9A]">{error}</p>}

        <button type="button" onClick={() => onAddAccount()} disabled={Boolean(busy)}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-brand-border text-[14px] font-semibold text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
          <Plus className="h-4 w-4" /> {tr("เพิ่มบัญชีอื่น")}</button>
        {extra}
        <p className="mt-3 text-center text-[12px] leading-relaxed text-brand-muted">{tr("เพิ่มได้สูงสุด 4 บัญชี · ออกจากระบบจะออกจากทุกบัญชีในเบราว์เซอร์นี้")}</p>
      </div>
    </Modal>
  );
}

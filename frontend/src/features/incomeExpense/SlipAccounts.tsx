import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { uiInput, uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { tr } from '../../i18n/tr';
import { BankLogo } from '../invoices/BankLogo';
import { THAI_BANKS } from '../invoices/thaiBanks';
import { accountKey, accountLabel, type SlipAccount } from '../../../../shared/slipAccounts';

// Slips by account (owner, 2026-11-14, item 3: "แยกสลิปไว้แบบเป็นระเบียบ ... เพื่อแบบว่ามันเป็นของคนละบัญชี"): an
// expense read from a slip keeps the person's own account it left from (bank + last four digits). With two accounts or
// more, each row shows it as "KBank •1234" with the bank's logo, the list filters by it, and each account can be given
// a name ("บัญชีธุรกิจ"). With one account nothing of this shows.

const bankOf = (account: SlipAccount) => THAI_BANKS.find(bank => bank.code === account.bank);

/** The account an expense came from: the bank's logo and "KBank •1234" (or the name given to it). */
export function AccountTag({ account, names, className = '' }: { account: SlipAccount; names?: Record<string, string>; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 align-middle text-[11px] font-medium leading-[1.5] text-brand-muted ${className}`} data-testid="account-tag">
      <BankLogo bank={bankOf(account)} size={14} />
      <span className="truncate">{accountLabel(account, names)}</span>
    </span>
  );
}

/** ตั้งชื่อบัญชี: a name for each account the slips came from; an empty name goes back to "KBank •1234". */
export function AccountNamesDialog({ open, onClose, accounts, names, onSave }: {
  open: boolean; onClose: () => void; accounts: SlipAccount[]; names?: Record<string, string>;
  onSave: (names: Record<string, string>) => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  React.useEffect(() => { if (open) setDraft(Object.fromEntries(accounts.map(account => [accountKey(account), names?.[accountKey(account)] ?? '']))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    const next: Record<string, string> = { ...(names ?? {}) };
    for (const account of accounts) {
      const key = accountKey(account);
      const value = (draft[key] ?? '').trim().slice(0, 40);
      if (value) next[key] = value; else delete next[key];
    }
    onSave(next);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} label={tr("ตั้งชื่อบัญชี")} width={480}>
      <div className="grid gap-4 p-6" data-testid="account-names">
        <div>
          <h2 className="pr-10 text-[17px] font-semibold leading-[1.5] text-brand-text">{tr("ตั้งชื่อบัญชี")}</h2>
          <p className="mt-1 text-[13px] leading-[1.6] text-brand-muted">{tr("บัญชีที่อ่านได้จากสลิป แสดงแค่ธนาคารกับเลข 4 ตัวท้าย ตั้งชื่อให้จำง่ายได้ เช่น บัญชีธุรกิจ")}</p>
        </div>
        <ul className="grid gap-3">
          {accounts.map(account => {
            const key = accountKey(account);
            return (
              <li key={key} className="flex items-center gap-3">
                <BankLogo bank={bankOf(account)} size={32} />
                <label className="grid min-w-0 flex-1 gap-1 text-[12px] leading-[1.5] text-brand-muted">
                  {accountLabel(account)}
                  <input className={uiInput} value={draft[key] ?? ''} maxLength={40} placeholder={tr("เช่น บัญชีธุรกิจ")} aria-label={tr("ชื่อของ {0}", accountLabel(account))}
                    onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} />
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`${uiSecondaryButton} px-4 text-[13px]`}>{tr("ยกเลิก")}</button>
          <button type="button" onClick={save} className={`${uiPrimaryButton} px-5 text-[13px]`} data-testid="account-names-save">{tr("บันทึกชื่อ")}</button>
        </div>
      </div>
    </Modal>
  );
}

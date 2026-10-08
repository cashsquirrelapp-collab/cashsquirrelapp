import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Pencil, Wallet } from 'lucide-react';
import type { AppSettings, Expense, Job } from '../../../../shared/types';
import { cashOnHand, makeCashAnchor } from '../../../../shared/cashBalance';
import { formatCurrency, safeFormatThaiDate, toLocalDateKey } from '../../utils';
import { uiSurface } from '../../components/ui/uiStyles';
import { Modal } from '../../components/ui/Modal';
import NumberInput from '../../components/ui/NumberInput';

// "เงินที่มีตอนนี้" on the dashboard: the money the user actually holds right now, from the
// balance they last set plus what was received and minus what was spent since (see
// shared/cashBalance). Until they set it, the card invites them to.

export function CashOnHandCard({ jobs, expenses, settings, onUpdateSettings }: {
  jobs: Job[];
  expenses: Expense[];
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const anchor = settings.cashAnchor;
  const now = anchor ? cashOnHand(anchor, jobs, expenses) : null;
  const canEdit = Boolean(onUpdateSettings);

  return (
    <section aria-label="เงินที่มีตอนนี้" className={`${uiSurface} flex flex-col gap-4 p-[18px] sm:flex-row sm:items-center sm:gap-6`}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]"><Wallet className="h-6 w-6" /></span>
        <div className="min-w-0">
          <p className="text-xs text-brand-muted">เงินที่มีตอนนี้</p>
          {now ? (
            <>
              <p className={`font-mono text-[28px] font-semibold leading-tight ${now.balance < 0 ? 'text-rose-600' : 'text-brand-text'}`}>{formatCurrency(now.balance)}</p>
              <p className="text-[11px] text-brand-muted">ตั้งไว้ {formatCurrency(anchor!.amount)} เมื่อ {safeFormatThaiDate(toLocalDateKey(new Date(anchor!.at)), { day: 'numeric', month: 'short' })}</p>
            </>
          ) : (
            <p className="mt-0.5 text-[13px] text-brand-muted">บอกยอดเงินที่มีอยู่จริงครั้งเดียว แล้วแอปจะบวกเงินที่รับและหักรายจ่ายที่บันทึกให้อัตโนมัติ</p>
          )}
        </div>
      </div>
      {now && (
        <dl className="flex gap-5 border-t border-brand-border pt-3 text-xs sm:border-t-0 sm:pt-0">
          <div><dt className="flex items-center gap-1 text-brand-muted"><ArrowDownLeft className="h-3.5 w-3.5 text-[#18A66A]" />รับเพิ่มตั้งแต่ตั้งยอด</dt><dd className="mt-0.5 font-mono text-[13px] font-semibold text-[#12804F] dark:text-[#6FD3A3]">+{formatCurrency(now.receivedSince)}</dd></div>
          <div><dt className="flex items-center gap-1 text-brand-muted"><ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />จ่ายไปตั้งแต่ตั้งยอด</dt><dd className="mt-0.5 font-mono text-[13px] font-semibold text-rose-600 dark:text-rose-300">−{formatCurrency(now.spentSince)}</dd></div>
        </dl>
      )}
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold transition-colors cursor-pointer ${now ? 'border border-brand-border text-brand-text hover:bg-brand-faint' : 'bg-[#E65F2B] text-white hover:bg-[#D35221]'}`}>
          {now ? <><Pencil className="h-4 w-4" />ปรับยอด</> : 'ตั้งยอดเงินที่มีตอนนี้'}
        </button>
      )}
      {editing && onUpdateSettings && (
        <CashAnchorDialog
          current={now?.balance ?? null}
          onSave={amount => { onUpdateSettings({ ...settings, cashAnchor: makeCashAnchor(amount, jobs, expenses) }); setEditing(false); }}
          onClear={anchor ? () => { const { cashAnchor: _drop, ...rest } = settings; onUpdateSettings(rest); setEditing(false); } : undefined}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function CashAnchorDialog({ current, onSave, onClear, onClose }: { current: number | null; onSave: (amount: number) => void; onClear?: () => void; onClose: () => void }) {
  const [value, setValue] = React.useState(current !== null ? String(current) : '');
  const amount = parseFloat(value);
  const valid = value.trim() !== '' && Number.isFinite(amount);
  return (
    <Modal open onClose={onClose} label="ตั้งยอดเงินที่มีตอนนี้" width={420}>
      <form className="p-6" onSubmit={e => { e.preventDefault(); if (valid) onSave(amount); }}>
        <p className="pr-8 text-[16px] font-semibold text-brand-text">ตอนนี้มีเงินอยู่เท่าไหร่?</p>
        <p className="mt-1 text-[13px] leading-relaxed text-brand-muted">ใส่ยอดรวมที่ถืออยู่จริงตอนนี้ (บัญชีธนาคาร + เงินสด) หลังจากนี้แอปจะบวกเงินที่บันทึกว่ารับ และหักรายจ่ายที่บันทึกให้เอง ปรับให้ตรงได้ทุกเมื่อ</p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-brand-text">ยอดเงินตอนนี้ (บาท)</span>
          <NumberInput value={value} onChange={setValue} autoFocus placeholder="เช่น 5,000" aria-label="ยอดเงินตอนนี้"
            className="h-12 w-full rounded-xl border border-brand-border bg-brand-white px-3 font-mono text-[18px] text-brand-text outline-none focus:border-[#E65F2B] dark:bg-[#141518]" />
        </label>
        <button type="submit" disabled={!valid} className="mt-5 h-11 w-full rounded-xl bg-[#E65F2B] text-[14px] font-semibold text-white hover:bg-[#D35221] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">บันทึกยอด</button>
        {onClear && <button type="button" onClick={onClear} className="mt-2 h-10 w-full rounded-xl text-[13px] text-brand-muted hover:bg-brand-faint hover:text-brand-text cursor-pointer">เลิกใช้ยอดเงินที่มีตอนนี้</button>}
      </form>
    </Modal>
  );
}

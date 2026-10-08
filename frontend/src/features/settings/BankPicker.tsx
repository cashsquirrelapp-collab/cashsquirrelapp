import React from 'react';
import { Check, ChevronDown, PenLine, Search } from 'lucide-react';
import { THAI_BANKS, findThaiBank } from '../invoices/thaiBanks';
import { BankLogo } from '../invoices/BankLogo';

// Bank picker for the business profile: each bank with its own logo, searchable by Thai name or
// code. "อื่น ๆ" lets the user type any name (e.g. พร้อมเพย์). Values are the same bank names the
// old <select> stored, so saved profiles and documents are unchanged.

export function BankPicker({ value, otherMode, onPick }: {
  value: string;
  otherMode: boolean;
  onPick: (choice: { bankName: string } | 'other') => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const selected = findThaiBank(value);
  const q = query.trim().toLowerCase();
  const shown = THAI_BANKS.filter(b => !q || b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q));

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => searchRef.current?.focus());
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (choice: { bankName: string } | 'other') => { onPick(choice); setOpen(false); };
  const isOther = !selected && (Boolean(value) || otherMode);
  const option = 'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] text-brand-text transition-colors hover:bg-brand-faint focus:bg-brand-faint focus:outline-none cursor-pointer';

  return (
    <div ref={rootRef} className="relative">
      <button type="button" aria-label="ธนาคาร" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}
        className="flex h-11 w-full items-center gap-2.5 rounded-[10px] border border-brand-border bg-brand-white px-3 text-left text-[14px] text-brand-text outline-none transition-colors hover:border-[#F3B08C] focus-visible:border-[#E65F2B] cursor-pointer dark:bg-[#141518]">
        {selected ? <BankLogo bank={selected} size={24} /> : isOther ? <PenLine className="h-4 w-4 shrink-0 text-brand-muted" /> : null}
        <span className={`min-w-0 flex-1 truncate ${selected || isOther ? '' : 'text-brand-muted'}`}>
          {selected ? selected.name : isOther ? 'อื่น ๆ (พิมพ์ชื่อเอง)' : 'เลือกธนาคาร'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-brand-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-full min-w-[300px] max-w-[calc(100vw-2rem)] rounded-2xl border border-brand-border bg-brand-white p-2 shadow-xl dark:bg-[#1F2024]">
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาธนาคาร" aria-label="ค้นหาธนาคาร"
              className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-9 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B] dark:bg-[#141518]" />
          </div>
          <ul role="listbox" aria-label="ธนาคาร" className="max-h-72 overflow-y-auto">
            {shown.map(bank => (
              <li key={bank.code}>
                <button type="button" role="option" aria-selected={selected?.code === bank.code} onClick={() => pick({ bankName: bank.name })} className={option}>
                  <BankLogo bank={bank} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{bank.name}</span>
                    <span className="block text-[11px] text-brand-muted">{bank.code}</span>
                  </span>
                  {selected?.code === bank.code && <Check className="h-4 w-4 shrink-0 text-[#E65F2B]" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-xs text-brand-muted">ไม่พบธนาคารนี้ ลองเลือก “อื่น ๆ” แล้วพิมพ์ชื่อเอง</li>}
            <li className="mt-1 border-t border-brand-border pt-1">
              <button type="button" role="option" aria-selected={isOther} onClick={() => pick('other')} className={option}>
                <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand-faint"><PenLine className="h-4 w-4 text-brand-muted" /></span>
                <span className="flex-1 font-medium">อื่น ๆ (พิมพ์ชื่อเอง)</span>
                {isOther && <Check className="h-4 w-4 shrink-0 text-[#E65F2B]" />}
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { InvoiceProfile } from '../../../../shared/types';
import { BrandImageField } from './BrandImageField';
import { DocColorPicker } from './DocColorPicker';
import { DEFAULT_LOGO_HEIGHT, MAX_LOGO_HEIGHT, MIN_LOGO_HEIGHT } from './DocumentA4';
import { THAI_BANKS } from './thaiBanks';
import { tr } from '../../i18n/tr';

// ข้อมูลผู้ออกเอกสาร edited on the documents page itself on computers and iPads (owner, 2026-11-22: "ไม่ต้องไปโหมดตั้งค่า
// แต่อยู่ในโหมดเอกสารเลย ... กดบันทึกหรือกดออกก็จะอยู่ในหน้าเอกสารต่อ"). The same business profile Settings edits.

const label = 'mb-1.5 block text-[13px] font-medium leading-[1.5] text-brand-text';
const input = 'h-11 w-full min-w-0 rounded-[10px] border border-brand-border bg-brand-white px-3.5 text-[14px] text-brand-text outline-none transition-colors placeholder:text-brand-muted/70 focus:border-[#E65F2B] dark:bg-[#141518]';
const heading = 'text-[15px] font-semibold leading-[1.45] text-brand-text';

export function IssuerDialog({ profile, onSave, onClose, onError }: {
  profile: InvoiceProfile;
  onSave: (profile: InvoiceProfile) => Promise<boolean>;
  onClose: () => void;
  onError: (title: string, message: string) => void;
}) {
  const [draft, setDraft] = React.useState<InvoiceProfile>(profile);
  const [saving, setSaving] = React.useState(false);
  const set = (field: keyof InvoiceProfile, value: string) => setDraft(current => ({ ...current, [field]: value }));
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const save = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) onClose();
  };
  const field = (id: string, name: string, key: keyof InvoiceProfile, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className={label} htmlFor={id}>{name}</label>
      <input id={id} type="text" value={(draft[key] as string | undefined) ?? ''} onChange={event => set(key, event.target.value)} className={input} {...extra} />
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <div className="fixed inset-0 bg-[#302018]/25 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="issuer-dialog-title" data-testid="issuer-dialog"
        className="relative flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-[22px] border border-brand-border bg-brand-white shadow-2xl dark:bg-neutral-900">
        <header className="flex items-start justify-between gap-3 border-b border-brand-border px-6 py-4">
          <div>
            <h2 id="issuer-dialog-title" className="text-[18px] font-semibold leading-[1.45] text-brand-text">{tr("ข้อมูลผู้ออกเอกสาร")}</h2>
            <p className="mt-0.5 text-[13px] leading-[1.5] text-brand-muted">{tr("พิมพ์บนใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จทุกใบ")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("ปิด")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-muted transition-colors hover:bg-brand-faint cursor-pointer"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <h3 className={heading}>{tr("ข้อมูลธุรกิจ")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('issuer-dialog-name', tr("ชื่อธุรกิจ"), 'name', { placeholder: tr("ชื่อบุคคล หรือ ชื่อบริษัท") })}
              {field('issuer-dialog-tax', tr("เลขผู้เสียภาษี"), 'taxId', { inputMode: 'numeric', placeholder: tr("13 หลัก") })}
              <div className="sm:col-span-2">{field('issuer-dialog-address', tr("ที่อยู่"), 'address', { placeholder: tr("ที่อยู่ออกใบเสร็จ / ที่อยู่จดทะเบียน") })}</div>
              {field('issuer-dialog-phone', tr("เบอร์โทร"), 'phone', { type: 'tel' })}
              {field('issuer-dialog-email', tr("อีเมล"), 'email', { type: 'email' })}
              <div className="sm:col-span-2">{field('issuer-dialog-web', tr("เว็บไซต์"), 'website', { type: 'url', placeholder: tr("ไม่บังคับ") })}</div>
            </div>
          </section>
          <section className="space-y-4">
            <h3 className={heading}>{tr("บัญชีรับเงิน (แสดงท้ายเอกสาร)")}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('issuer-dialog-bank', tr("ธนาคาร"), 'bankName', { list: 'issuer-dialog-banks', placeholder: tr("เลือกธนาคาร") })}
              <datalist id="issuer-dialog-banks">{THAI_BANKS.map(bank => <option key={bank.code} value={bank.name} />)}</datalist>
              {field('issuer-dialog-account', tr("เลขที่บัญชี"), 'bankAccount', { inputMode: 'numeric' })}
              <div className="sm:col-span-2">{field('issuer-dialog-account-name', tr("ชื่อบัญชี"), 'bankAccountName')}</div>
            </div>
          </section>
          <section className="space-y-5">
            <h3 className={heading}>{tr("แบรนด์บนเอกสาร")}</h3>
            <BrandImageField title={tr("โลโก้ธุรกิจ")} hint={tr("แสดงที่ส่วนหัวของเอกสารทุกประเภท และใช้เป็นตราประทับผู้ขาย")} emptyLabel={tr("ไม่มีโลโก้")} uploadLabel={tr("อัปโหลดโลโก้")} removeLabel={tr("ลบโลโก้")}
              value={draft.logoUrl} onChange={logoUrl => setDraft(current => ({ ...current, logoUrl }))} onError={onError}
              size={{ label: tr("ขนาดโลโก้บนเอกสาร"), value: draft.logoHeight || DEFAULT_LOGO_HEIGHT, min: MIN_LOGO_HEIGHT, max: MAX_LOGO_HEIGHT, onChange: logoHeight => setDraft(current => ({ ...current, logoHeight })) }} />
            <div className="space-y-3">
              <div>
                <h4 className="text-[14px] font-medium text-brand-text">{tr("สีเอกสาร")}</h4>
                <p className="mt-0.5 text-xs text-brand-muted">{tr("สีหัวเรื่อง เส้น และกรอบยอดรวมบนเอกสารทุกประเภท")}</p>
              </div>
              <DocColorPicker value={draft.docColor} logoUrl={draft.logoUrl} onChange={docColor => setDraft(current => ({ ...current, docColor }))} />
            </div>
            <BrandImageField title={tr("ลายเซ็นผู้ออกเอกสาร")} hint={tr("แสดงเหนือเส้นลายเซ็นในช่อง “ผู้ออกเอกสาร” แนะนำไฟล์ PNG พื้นหลังโปร่งใส")} emptyLabel={tr("ไม่มีลายเซ็น")} uploadLabel={tr("อัปโหลดลายเซ็น")} removeLabel={tr("ลบลายเซ็น")}
              value={draft.signatureUrl} onChange={signatureUrl => setDraft(current => ({ ...current, signatureUrl }))} onError={onError} />
          </section>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-brand-border px-6 py-3.5">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-medium text-brand-muted transition-colors hover:bg-brand-faint hover:text-brand-text cursor-pointer">{tr("ยกเลิก")}</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex h-11 items-center rounded-xl bg-[#E65F2B] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] disabled:opacity-60 cursor-pointer">{saving ? tr("กำลังบันทึก…") : tr("บันทึก")}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

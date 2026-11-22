import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { InvoiceProfile } from '../../../../shared/types';
import { BrandImageField } from './BrandImageField';
import { BankPicker } from '../settings/BankPicker';
import { findThaiBank } from './thaiBanks';
import { DEFAULT_LOGO_HEIGHT, DocumentPreview, MAX_LOGO_HEIGHT, MIN_LOGO_HEIGHT } from './DocumentA4';
import type { Invoice } from '../../../../shared/types';
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
  const [bankOther, setBankOther] = React.useState(false);
  const set = (field: keyof InvoiceProfile, value: string) => setDraft(current => ({ ...current, [field]: value }));
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const position = draft.logoPosition || 'left';
  const preview: Invoice = {
    id: 'issuer-dialog-preview', documentType: 'invoice', documentNo: 'INV-2026-001', createdDate: new Date().toISOString().slice(0, 10), issuer: draft,
    client: { name: tr("ชื่อลูกค้าตัวอย่าง"), address: tr("ที่อยู่ลูกค้าตัวอย่าง"), phone: '', email: '', taxId: '' },
    items: [{ id: 'p1', description: tr("รายการตัวอย่าง"), quantity: 1, price: 1000 }], vatRate: 0, whtRate: 0,
  };
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* The document's header as it will print, following every change (owner, 2026-11-22: "ให้มันมีพรีวิวทุกอย่าง
              เหมือนโปรไฟล์ธุรกิจในตั้งค่า"); it stays in view while the fields below scroll. */}
          <div className="sticky top-0 z-10 border-b border-brand-border bg-[#EDE9E4] px-6 py-3 dark:bg-[#141518]" data-testid="issuer-dialog-preview">
            <p className="mb-2 text-[12px] font-medium leading-[1.5] text-brand-muted">{tr("ตัวอย่างส่วนหัวเอกสาร · เปลี่ยนตามที่คุณแก้ทันที")}</p>
            <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg shadow-sm">
              <DocumentPreview invoice={preview} crop={330} maxScale={0.8} />
            </div>
          </div>
          <div className="space-y-6 px-6 py-5">
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
              {/* The same bank list with logos as Settings (owner, 2026-11-22: "ให้มันเหมือนกันเด๊ะ"). */}
              {/* Opening the list scrolls the dialog so the whole list shows above the save bar. */}
              <div className="scroll-mt-3" onClickCapture={event => { const box = event.currentTarget; window.setTimeout(() => box.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30); }}>
                <span className={label}>{tr("ชื่อธนาคาร")}</span>
                <BankPicker value={draft.bankName} otherMode={bankOther}
                  onPick={choice => {
                    if (choice === 'other') { setBankOther(true); if (findThaiBank(draft.bankName)) set('bankName', ''); }
                    else { setBankOther(false); set('bankName', choice.bankName); }
                  }} />
                {!findThaiBank(draft.bankName) && (draft.bankName || bankOther) && (
                  <input type="text" value={draft.bankName} onChange={event => set('bankName', event.target.value)}
                    placeholder={tr("พิมพ์ชื่อธนาคาร / ช่องทางรับเงิน เช่น พร้อมเพย์")} aria-label={tr("ชื่อธนาคารอื่น ๆ")} className={`${input} mt-2`} />
                )}
              </div>
              {field('issuer-dialog-account', tr("เลขที่บัญชี"), 'bankAccount', { inputMode: 'numeric', placeholder: tr("เช่น 123-4-56789-0") })}
              <div className="sm:col-span-2">{field('issuer-dialog-account-name', tr("ชื่อบัญชีโอนรับเงิน"), 'bankAccountName', { placeholder: tr("เช่น นายออมสิน ดีแท้") })}</div>
            </div>
          </section>
          <section className="space-y-5">
            <h3 className={heading}>{tr("โลโก้และลายเซ็น")}</h3>
            <BrandImageField title={tr("โลโก้ธุรกิจ")} hint={tr("แสดงที่ส่วนหัวของเอกสารทุกประเภท และใช้เป็นตราประทับผู้ขาย")} emptyLabel={tr("ไม่มีโลโก้")} uploadLabel={tr("อัปโหลดโลโก้")} removeLabel={tr("ลบโลโก้")}
              value={draft.logoUrl} onChange={logoUrl => setDraft(current => ({ ...current, logoUrl }))} onError={onError}
              size={{ label: tr("ขนาดโลโก้บนเอกสาร"), value: draft.logoHeight || DEFAULT_LOGO_HEIGHT, min: MIN_LOGO_HEIGHT, max: MAX_LOGO_HEIGHT, onChange: logoHeight => setDraft(current => ({ ...current, logoHeight })) }}
              extra={(
                <div className="space-y-2.5 text-xs text-brand-muted">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-24 shrink-0">{tr("ตำแหน่งโลโก้")}</span>
                    <div className="flex gap-1.5" role="group" aria-label={tr("ตำแหน่งโลโก้")}>
                      {([['left', tr("ซ้าย")], ['center', tr("กลาง")], ['right', tr("ขวา")]] as const).map(([key, name]) => (
                        <button key={key} type="button" aria-pressed={position === key} onClick={() => setDraft(current => ({ ...current, logoPosition: key }))}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${position === key ? 'bg-[#E65F2B] text-white' : 'border border-brand-border text-brand-muted hover:bg-brand-faint'}`}>{name}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-3">
                    <span className="w-24 shrink-0">{tr("เลื่อนซ้าย–ขวา")}</span>
                    <input type="range" min={0} max={100} step={1} aria-label={tr("เลื่อนโลโก้ซ้าย-ขวา")} className="w-full max-w-xs accent-[#E65F2B] cursor-pointer"
                      value={position === 'custom' ? draft.logoOffset ?? 50 : position === 'center' ? 50 : position === 'right' ? 100 : 0}
                      onChange={event => setDraft(current => ({ ...current, logoPosition: 'custom', logoOffset: Number(event.target.value) }))} />
                  </label>
                </div>
              )} />
            <BrandImageField wide title={tr("ลายเซ็นผู้ออกเอกสาร")} hint={tr("แสดงเหนือเส้นลายเซ็นในช่อง “ผู้ออกเอกสาร” แนะนำไฟล์ PNG พื้นหลังโปร่งใส")} emptyLabel={tr("ไม่มีลายเซ็น")} uploadLabel={tr("อัปโหลดลายเซ็น")} removeLabel={tr("ลบลายเซ็น")}
              value={draft.signatureUrl} onChange={signatureUrl => setDraft(current => ({ ...current, signatureUrl }))} onError={onError} />
          </section>
        </div>
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

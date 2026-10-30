import React from 'react';
import { Moon } from 'lucide-react';
import { tr } from '../i18n/tr';

export type ThemeTipChoice = 'auto' | 'custom' | 'light';

/**
 * The one-time evening tip for new accounts (owner, 2026-10-30: "6 โมงเย็นเป็นต้นไปจะมีเตือนนิดหน่อยว่า ... ปรับโหมดสว่าง
 * หรือกำหนดค่าเองได้ว่าจะให้สว่างหรือมืดช่วงไหน ถามแค่ครั้งเดียวตลอดแอคเคาท์"). Any of the three answers is kept in the
 * account and the tip never comes back. It floats over the page (at the top on phones), never over a dialog.
 */
export function ThemeTip({ phone, onChoose }: { phone: boolean; onChoose: (choice: ThemeTipChoice) => void }) {
  return (
    <section
      role="dialog" aria-modal="false" aria-labelledby="theme-tip-title" aria-describedby="theme-tip-text"
      className="theme-tip fixed z-[45] w-[min(420px,calc(100vw-32px))] rounded-2xl border border-brand-border bg-brand-white p-4 text-brand-text shadow-[0_18px_44px_rgba(28,25,23,0.18)] dark:shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
      style={phone
        // Phones: at the top like a system notice, clear of the bottom bar and the standing squirrel above it.
        ? { left: '50%', transform: 'translateX(-50%)', top: 'calc(12px + env(safe-area-inset-top, 0px))' }
        : { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FFA473]" aria-hidden="true">
          <Moon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 id="theme-tip-title" className="text-[15px] font-semibold leading-[1.5]">{tr("ตั้งเวลาโหมดมืดได้")}</h2>
          <p id="theme-tip-text" className="mt-0.5 text-[13px] leading-[1.6] text-brand-muted">
            {tr("ให้แอปสลับเป็นโหมดมืดตอน 18:00 และกลับเป็นโหมดสว่างตอน 06:00 หรือกำหนดเวลาเอง เปลี่ยนภายหลังได้ที่ ตั้งค่า › การแสดงผล")}
          </p>
        </div>
      </div>
      <div className="mt-3.5 grid gap-2">
        <button type="button" onClick={() => onChoose('auto')}
          className="min-h-11 rounded-xl bg-[#E65F2B] px-4 text-[14px] font-semibold text-white transition-colors hover:bg-[#D35221] cursor-pointer">
          {tr("ใช้โหมดมืดตอนกลางคืน")}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onChoose('custom')}
            className="min-h-11 rounded-xl border border-brand-border px-3 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
            {tr("ตั้งเวลาเอง")}
          </button>
          <button type="button" onClick={() => onChoose('light')}
            className="min-h-11 rounded-xl border border-brand-border px-3 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint cursor-pointer">
            {tr("ใช้โหมดสว่างต่อ")}
          </button>
        </div>
      </div>
    </section>
  );
}

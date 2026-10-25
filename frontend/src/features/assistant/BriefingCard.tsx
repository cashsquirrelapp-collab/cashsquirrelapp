import React from 'react';
import { AlertCircle, Clock, FileText, Receipt, Wallet } from 'lucide-react';
import type { Briefing, BriefingItem, BriefingPage } from '../../../../shared/briefing';
import { tr } from '../../i18n/tr';
import { dateLocale } from '../../utils';

// "สรุปวันนี้" (pkg77, owner approved the mockup 2026-10-25): the first card in เลขา's panel on computers and iPads.
// It only shows what shared/briefing.ts worked out from the saved data; the buttons only open a page.

/** The page each button opens: the same paths เลขา's own navigation cards use. */
export const BRIEFING_PATHS: Record<BriefingPage, string> = {
  receivables: '/receivables', incomeExpense: '/incomeExpense', quotation: '/invoice?type=quotation', dashboard: '/dashboard',
};
const money = (value: number) => `${value < 0 ? '−' : ''}฿${Math.abs(Math.round(value * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** The line's words in the current language, from its figures. */
export function briefingText(item: BriefingItem): { title: string; detail: string; action: string } {
  const p = item.parts;
  const amount = money(item.amount ?? 0);
  const action = item.action.page === 'receivables' ? tr("ดูรายการรอรับเงิน") : item.action.page === 'dashboard' ? tr("ดูภาพรวม")
    : item.action.page === 'incomeExpense' ? tr("เปิดรายรับรายจ่าย") : tr("เปิดใบเสนอราคา");
  switch (item.kind) {
    case 'overdue': return { title: tr("เลยกำหนดรับเงิน {0} รายการ", item.count), detail: tr("รวม {0} · นานสุด {1} วัน ({2})", amount, p.days ?? 0, p.name ?? ''), action };
    case 'due_today': return { title: tr("ครบกำหนดรับเงินวันนี้ {0} รายการ", item.count), detail: tr("รวม {0} ({1})", amount, p.name ?? ''), action };
    case 'due_soon': return { title: tr("ใกล้ครบกำหนดรับเงิน {0} รายการ", item.count), detail: tr("ภายใน 2 วัน · รวม {0}", amount), action };
    case 'cash_short':
    case 'cash_watch': return {
      title: item.kind === 'cash_short' ? tr("เงินอาจไม่พอใน 30 วันข้างหน้า") : tr("รายจ่ายประจำ 30 วันข้างหน้าต้องใช้เงินที่รอรับ"),
      detail: tr("เงินในแอป {0} + รอรับ {1} − รายจ่ายประจำ {2} = {3}", money(p.cashNow ?? 0), money(p.expected ?? 0), money(p.costs ?? 0), money(p.projected ?? 0)), action };
    case 'fixed_unrecorded': return { title: tr("รายจ่ายประจำเดือนนี้ยังไม่บันทึก {0} รายการ", item.count), detail: tr("รวม {0} · บันทึกเมื่อจ่ายแล้วเพื่อให้กำไรของเดือนถูกต้อง", amount), action };
    default: return { title: tr("ใบเสนอราคารอลูกค้าตอบ {0} ฉบับ", item.count), detail: tr("ฉบับที่รอนานสุด {0} วัน", p.days ?? 0), action };
  }
}

const ICONS: Record<BriefingItem['kind'], typeof Clock> = {
  overdue: AlertCircle, due_today: Clock, due_soon: Clock, cash_short: Wallet, cash_watch: Wallet, fixed_unrecorded: Receipt, quote_waiting: FileText,
};

export function BriefingCard({ briefing, onOpen }: { briefing: Briefing; onOpen: (path: string) => void }) {
  if (!briefing.items.length) return null;
  const day = new Date(`${briefing.day}T00:00:00+07:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  return (
    <section className="asx-brief" aria-label={tr("สรุปวันนี้")}>
      <header className="asx-brief-head"><b>{tr("สรุปวันนี้")}</b><span>{tr("{0} · จากข้อมูลในแอป", day)}</span></header>
      <ul>
        {briefing.items.map(item => {
          const text = briefingText(item);
          const Icon = ICONS[item.kind];
          return (
            <li key={item.key} className={`asx-brief-item is-${item.tone}`}>
              <span className="asx-brief-chip" aria-hidden="true"><Icon size={17} /></span>
              <div className="asx-brief-text">
                <b>{text.title}</b>
                {item.forecast && <span className="asx-brief-tag">{tr("คาดการณ์")}</span>}
                <span>{text.detail}</span>
              </div>
              <button type="button" className="asx-brief-btn" onClick={() => onOpen(BRIEFING_PATHS[item.action.page])}>{text.action}</button>
            </li>
          );
        })}
      </ul>
      <p className="asx-brief-foot">{tr("คำนวณจากข้อมูลที่บันทึกในแอป ไม่ใช่ยอดบัญชีธนาคาร")}</p>
    </section>
  );
}

import React from 'react';
import { Building2, Check } from 'lucide-react';
import { dateLocale, formatCurrency } from '../../../utils';
import { tr, trc } from '../../../i18n/tr';
import type { RadarItem, RadarStatus } from './radarData';

// One job on the Credit Radar: who, what, how much, its status and the credit-term line (sent, due, today or paid, in the
// order they happened). The whole card is a button that opens the job.

const COMPANY = /บริษัท|จำกัด|หจก|ห้าง|ร้าน|สตูดิโอ|สำนักงาน|studio|\bco\b|co\.|ltd|inc|company|shop|store|agency|market|tech/i;
const initialOf = (name: string) => (name.replace(/^[เแโใไ\s]+/, '').trim()[0] || '?').toUpperCase();
const shortDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) : '–');

export function statusLabel(status: RadarStatus): string {
  if (status === 'overdue') return tr("เกินกำหนด");
  if (status === 'soon') return tr("ใกล้ครบกำหนด");
  if (status === 'received') return tr("รับเงินแล้ว");
  return tr("ยังไม่ถึงกำหนด");
}

export function daysLabel(item: RadarItem): string {
  if (item.status === 'overdue') return tr("เลย {0} วัน", item.days);
  if (item.status === 'received') return item.days === 0 ? tr("รับวันนี้") : tr("รับเมื่อ {0} วันก่อน", item.days);
  if (!Number.isFinite(item.days)) return tr("ยังไม่ระบุวัน");
  return item.days === 0 ? tr("ครบกำหนดวันนี้") : tr("อีก {0} วัน", item.days);
}

/** The credit-term line: the three days in the order they happened. */
function timeline(item: RadarItem, today: string) {
  const points = [
    { key: 'sent', label: tr("ส่งงาน"), on: item.sentOn },
    { key: 'due', label: tr("ครบกำหนด"), on: item.dueOn },
    item.status === 'received' ? { key: 'paid', label: trc("radar", "รับเงิน"), on: item.paidOn } : { key: 'today', label: tr("วันนี้"), on: today },
  ];
  return points.sort((a, b) => (a.on && b.on ? a.on.localeCompare(b.on) : 0));
}

export const CreditCard = React.forwardRef<HTMLButtonElement, {
  item: RadarItem; today: string; dimmed: boolean; onHover: (id: string | null) => void; onOpen: (id: string) => void;
}>(function CreditCard({ item, today, dimmed, onHover, onOpen }, ref) {
  const points = timeline(item, today);
  return (
    <button ref={ref} type="button" data-testid="radar-card" data-status={item.status}
      className={`crc is-${item.status}${dimmed ? ' is-dim' : ''}`}
      onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(item.id)} onBlur={() => onHover(null)}
      onClick={() => onOpen(item.id)}
      aria-label={tr("{0} · {1} · {2} · {3}", item.client || item.name, item.name, formatCurrency(item.amount), statusLabel(item.status))}>
      <span className="crc-top">
        <span className="crc-avatar" aria-hidden="true">{COMPANY.test(item.client) ? <Building2 className="h-4 w-4" strokeWidth={2} /> : initialOf(item.client || item.name)}</span>
        <span className="crc-who">
          <span className="crc-client">{item.client || item.name}</span>
          <span className="crc-job">{item.name}</span>
        </span>
        <span className={`crc-badge is-${item.status}`}>{item.status === 'received' && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}{statusLabel(item.status)}</span>
      </span>
      <span className="crc-money">
        <span className="crc-amount">{formatCurrency(item.amount)}</span>
        <span className="crc-days">{daysLabel(item)}</span>
      </span>
      <span className="crc-tl" aria-hidden="true">
        <span className="crc-tl-track"><i /><i /><i /></span>
        <span className="crc-tl-labels">
          {points.map(point => (
            <span key={point.key} className={point.key === 'today' || point.key === 'paid' ? 'is-now' : ''}>
              <small>{point.label}</small>{shortDate(point.on)}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
});

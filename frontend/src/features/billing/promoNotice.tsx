import { useSyncExternalStore } from 'react';
import { PRO_MONTH_REGULAR_FROM, PRO_MONTH_PROMO_LAST_DAY, PRO_MONTH_PROMO_NEXT_DAY, PRO_REGULAR_MONTHLY, formatBaht, proMonthPromoRunning } from '../../../../shared/proPricing';
import { tr, trc } from '../../i18n/tr';
import { dateLocale } from '../../utils';

/** A promotion date in the app's language, such as "30 พ.ย. 2569" or "Nov 30, 2026". */
export const promoDay = (key: string) => new Date(`${key}T12:00:00+07:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

/** ["ราคาพิเศษถึง 30 พ.ย. 2569", "ตั้งแต่ 1 ธ.ค. 2569 รายเดือน ฿249"] while the monthly promotion runs, else null. */
export function monthPromoNotice(now = new Date()): [string, string] | null {
  if (!proMonthPromoRunning(now)) return null;
  return [tr('ราคาพิเศษถึง {0}', promoDay(PRO_MONTH_PROMO_LAST_DAY)), tr('ตั้งแต่ {0} รายเดือน {1}', promoDay(PRO_MONTH_PROMO_NEXT_DAY), formatBaht(PRO_REGULAR_MONTHLY))];
}

/** Read the fixed promotion deadline every time; background tabs and reloads cannot reset it. */
export function monthPromoCountdown(now = Date.now()) {
  const totalSeconds = Math.max(0, Math.ceil((PRO_MONTH_REGULAR_FROM - now) / 1000));
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

function subscribeToPromoClock(onChange: () => void) {
  const tick = () => {
    onChange();
    if (!proMonthPromoRunning()) window.clearInterval(interval);
  };
  const interval = proMonthPromoRunning() ? window.setInterval(tick, 1000) : undefined;
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pageshow', tick);
  window.addEventListener('focus', tick);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('pageshow', tick);
    window.removeEventListener('focus', tick);
  };
}

/** Only the expiry boundary re-renders the surrounding prices; the digits update separately. */
export function useMonthPromoRunning() {
  return useSyncExternalStore(subscribeToPromoClock, proMonthPromoRunning, proMonthPromoRunning);
}
const secondsLeft = () => monthPromoCountdown().totalSeconds;

/** The date and countdown share the exact boundary used by checkout pricing. */
export function MonthPromoNotice({ className, testId }: { className: string; testId?: string }) {
  const remaining = useSyncExternalStore(subscribeToPromoClock, secondsLeft, secondsLeft);
  const parts = monthPromoNotice();
  if (!remaining || !parts) return null;
  const { days, hours, minutes, seconds } = monthPromoCountdown(PRO_MONTH_REGULAR_FROM - remaining * 1000);
  const units = [
    { key: 'days', value: days, label: trc('countdown', 'วัน') },
    { key: 'hours', value: hours, label: trc('countdown', 'ชั่วโมง') },
    { key: 'minutes', value: minutes, label: trc('countdown', 'นาที') },
    { key: 'seconds', value: seconds, label: trc('countdown', 'วินาที') },
  ];
  return <p className={className} data-testid={testId}>
    <span className="inline-block">{parts[0]}</span><span aria-hidden="true"> · </span><span className="inline-block">{parts[1]}</span>
    <span className="mx-auto mt-3 block w-full max-w-[244px] rounded-xl border border-[#E65F2B]/20 bg-[#E65F2B]/5 px-3 py-2.5 text-center dark:bg-[#E65F2B]/10">
      <span className="mb-1.5 block text-[12px] font-semibold leading-relaxed text-[#9A3A12] dark:text-[#FFB08A]">{tr('โปรโมชันสิ้นสุดใน')}</span>
      <span role="timer" aria-live="off" aria-label={tr('เวลาที่เหลือ {0} วัน {1} ชั่วโมง {2} นาที {3} วินาที', days, hours, minutes, seconds)} data-testid="promo-countdown" data-seconds-left={remaining} className="grid grid-cols-4 gap-1">
        {units.map(unit => <span key={unit.key} aria-hidden="true" className="min-w-0">
          <span data-testid={`promo-countdown-${unit.key}`} className="block font-mono text-[20px] font-bold tabular-nums leading-normal text-[#9A3A12] dark:text-[#FFB08A]">{String(unit.value).padStart(2, '0')}</span>
          <span className="block text-[11px] leading-relaxed text-brand-muted">{unit.label}</span>
        </span>)}
      </span>
    </span>
  </p>;
}

/** The computer and iPad plans page's countdown (owner, 2026-10-29, design F): one small row in the price card, the seconds
 *  ticking in orange. Same clock and boundary as MonthPromoNotice, so it ends exactly when checkout prices change. */
export function PromoCountdownChips({ className = '' }: { className?: string }) {
  const remaining = useSyncExternalStore(subscribeToPromoClock, secondsLeft, secondsLeft);
  if (!remaining || !proMonthPromoRunning()) return null;
  const { days, hours, minutes, seconds } = monthPromoCountdown(PRO_MONTH_REGULAR_FROM - remaining * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return <div className={`pf-count ${className}`}>
    <span className="pf-count-label"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M10 2h4" /></svg>{tr('ดีลพิเศษหมดใน')}</span>
    <span role="timer" aria-live="off" aria-label={tr('เวลาที่เหลือ {0} วัน {1} ชั่วโมง {2} นาที {3} วินาที', days, hours, minutes, seconds)}
      data-testid="promo-countdown" data-seconds-left={remaining} className="pf-count-digits">
      <span aria-hidden="true" className="pf-count-chip"><b data-testid="promo-countdown-days">{pad(days)}</b><small>{trc('countdown', 'วัน')}</small></span>
      <span aria-hidden="true" className="pf-count-chip"><b data-testid="promo-countdown-hours">{pad(hours)}</b></span>
      <span aria-hidden="true" className="pf-count-colon">:</span>
      <span aria-hidden="true" className="pf-count-chip"><b data-testid="promo-countdown-minutes">{pad(minutes)}</b></span>
      <span aria-hidden="true" className="pf-count-colon">:</span>
      <span key={seconds} aria-hidden="true" className="pf-count-chip is-seconds"><b data-testid="promo-countdown-seconds">{pad(seconds)}</b></span>
    </span>
  </div>;
}

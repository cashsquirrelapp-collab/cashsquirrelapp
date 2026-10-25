import { PRO_MONTH_PROMO_LAST_DAY, PRO_MONTH_PROMO_NEXT_DAY, PRO_REGULAR_MONTHLY, formatBaht, proMonthPromoRunning } from '../../../../shared/proPricing';
import { tr } from '../../i18n/tr';
import { dateLocale } from '../../utils';

/** A promotion date in the app's language, such as "30 พ.ย. 2569" or "Nov 30, 2026". */
export const promoDay = (key: string) => new Date(`${key}T12:00:00+07:00`).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

/** ["ราคาพิเศษถึง 30 พ.ย. 2569", "ตั้งแต่ 1 ธ.ค. 2569 รายเดือน ฿249"] while the monthly promotion runs, else null. */
export function monthPromoNotice(now = new Date()): [string, string] | null {
  if (!proMonthPromoRunning(now)) return null;
  return [tr('ราคาพิเศษถึง {0}', promoDay(PRO_MONTH_PROMO_LAST_DAY)), tr('ตั้งแต่ {0} รายเดือน {1}', promoDay(PRO_MONTH_PROMO_NEXT_DAY), formatBaht(PRO_REGULAR_MONTHLY))];
}

/** The two halves wrap as whole pieces, so a narrow card breaks the line at the dot, never before "฿249". */
export function MonthPromoNotice({ className, testId }: { className: string; testId?: string }) {
  const parts = monthPromoNotice();
  if (!parts) return null;
  return <p className={className} data-testid={testId}><span className="inline-block">{parts[0]}</span><span aria-hidden="true"> · </span><span className="inline-block">{parts[1]}</span></p>;
}

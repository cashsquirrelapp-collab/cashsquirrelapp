// Pro prices in one place (owner, 2026-10-20). Every screen that shows a Pro price reads it from here:
// the plans page, the Pro promo dialog and the landing page. Amounts are in baht as the customer pays.
// Prices depend on the date (the monthly promotion ends on 30 Nov 2569): every caller asks for the price at a time,
// so a server or a page left open across midnight never keeps the old price.

export type ProPeriod = 'month' | 'halfYear' | 'year';
export const PRO_PERIODS: readonly ProPeriod[] = ['month', 'halfYear', 'year'];

/** The regular monthly price (owner, 2026-10-20: "ราคาจริงคือ 249"); every period's promotion is shown
 * against it, struck through: ฿249 a month, ฿1,494 for 6 months, ฿2,988 for a year. */
export const PRO_REGULAR_MONTHLY = 249;

/**
 * Stripe Thailand's standard fee for a domestic card (stripe.com/en-th/pricing, checked 2026-10-25): 3.65% + ฿10 per
 * payment, with VAT on the fee (Stripe's Thailand tax page; 7%, the reduced rate). PromptPay costs less (1.65%), so it
 * nets more; foreign cards (4.75% + ฿10) net up to about ฿2 less on a month.
 */
export const STRIPE_TH_CARD_FEE = { percent: 3.65, fixedBaht: 10, vatPercent: 7 } as const;
/** What the owner keeps from a payment of `total` baht by a domestic card. */
export function netAfterCardFee(total: number, fee: { percent: number; fixedBaht: number; vatPercent: number } = STRIPE_TH_CARD_FEE): number {
  return total - (total * fee.percent / 100 + fee.fixedBaht) * (1 + fee.vatPercent / 100);
}

/** Owner, 2026-10-24: the monthly promotion runs through 30 Nov 2569; from 1 Dec 2569 a month costs the regular ฿249.
 * Six months and a year keep their prices. Every price screen states the end date while it runs. */
export const PRO_MONTH_PROMO_LAST_DAY = '2026-11-30';
export const PRO_MONTH_PROMO_NEXT_DAY = '2026-12-01';
/** 1 Dec 2569 00:00 Bangkok: from this instant a month is sold at the regular price, everywhere at once. */
export const PRO_MONTH_REGULAR_FROM = Date.parse('2026-11-30T17:00:00Z');

/**
 * The prices, by date (owner, 2026-10-25): the price shown is what the owner nets after Stripe's fee ("กูต้องได้ยอดสุทธิ
 * ตามราคาที่กูตั้งเป๊ะๆ"); the customer pays it plus the fee, shown before paying ("ราคาตั้ง 159 แต่จ่ายจริงแค่บอก
 * ค่าธรรมเนียม"). The charged amount is the lowest whole baht that still nets the shown price after a domestic card's fee
 * (tests/pro-pricing.test.ts checks it). Stripe's catalog holds exactly the charged amounts, with a lookup key per date.
 *   until 30 Nov 2569: ฿159 + ฿18 = ฿177 a month
 *   from 1 Dec 2569:   ฿249 + ฿22 = ฿271 a month (owner: "บวกค่าธรรมเนียมตามปกติ ... แสดงผล 249 ... จ่ายจริง 271")
 *   always:            ฿849 + ฿46 = ฿895 for 6 months, ฿1,490 + ฿72 = ฿1,562 for a year
 */
const PROMO_PRICES = { net: { month: 159, halfYear: 849, year: 1490 }, total: { month: 177, halfYear: 895, year: 1562 } } as const;
const REGULAR_PRICES = { net: { month: PRO_REGULAR_MONTHLY, halfYear: 849, year: 1490 }, total: { month: 271, halfYear: 895, year: 1562 } } as const;
export const PRO_PRICE_SCHEDULES = { promo: PROMO_PRICES, regular: REGULAR_PRICES } as const;
const PERIOD_MONTHS: Record<ProPeriod, number> = { month: 1, halfYear: 6, year: 12 };
const instant = (now: Date | number) => (typeof now === 'number' ? now : now.getTime());
const scheduleAt = (now: Date | number = Date.now()) => (instant(now) < PRO_MONTH_REGULAR_FROM ? PROMO_PRICES : REGULAR_PRICES);

/** What the owner receives for each period after Stripe's fee, at that time. */
export function proNetTarget(now: Date | number = Date.now()): Record<ProPeriod, number> {
  return { ...scheduleAt(now).net };
}
/** What the customer pays for each period at that time (Stripe's catalog holds these). */
export function proPricing(now: Date | number = Date.now()): Record<ProPeriod, { months: number; total: number; bestValue?: boolean }> {
  const totals = scheduleAt(now).total;
  return { month: { months: 1, total: totals.month }, halfYear: { months: 6, total: totals.halfYear }, year: { months: 12, total: totals.year, bestValue: true } };
}

/**
 * Every amount a Pro period has been sold at, in baht. An order and its auto-renewal keep the amount the customer bought
 * and agreed to: ฿159 / ฿849 / ฿1,490 before 25 Oct 2026, then the prices with the payment fee (package 69), and ฿271 a
 * month from 1 Dec 2569. The database's rule on orders lists the same amounts
 * (supabase/migrations/20261025210000_pro_month_regular_price.sql).
 */
export const PRO_SOLD_AT: Record<ProPeriod, readonly number[]> = {
  month: [159, PROMO_PRICES.total.month, REGULAR_PRICES.total.month],
  halfYear: [849, PROMO_PRICES.total.halfYear],
  year: [1490, PROMO_PRICES.total.year],
};

/**
 * A monthly auto-renewal agreed to during the promotion renews at the regular charge from 1 Dec 2569 (owner, 2026-10-25:
 * "ขึ้นเป็น ฿271 เองตั้งแต่ ธ.ค."; consent v4 says so). The app moves the Stripe subscription to the regular price before
 * its first renewal on or after that day (handlers/advance-card-renewals.ts).
 */
export const PRO_MONTH_RENEWAL_STEP = {
  fromDay: PRO_MONTH_PROMO_NEXT_DAY, from: PRO_MONTH_REGULAR_FROM, fromTotal: PROMO_PRICES.total.month,
  price: REGULAR_PRICES.net.month, fee: REGULAR_PRICES.total.month - REGULAR_PRICES.net.month, total: REGULAR_PRICES.total.month,
} as const;

/** "30 พ.ย. 2569" from "2026-11-30", the same on every runtime (no Intl). */
export function thaiShortDate(key: string): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${Number(key.slice(8, 10))} ${months[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543}`;
}
export function proMonthPromoRunning(now: Date | number = Date.now()): boolean {
  return instant(now) < PRO_MONTH_REGULAR_FROM;
}

/** Periods on sale. Owner, 2026-10-25: monthly only in the first phase ("เอาให้เติมแค่รายเดือนก่อน เอาแผงรายปีกับราย
 * 6 เดือนออก ... กลัวคนเติมรายปีไปแล้วมันชิบหาย"). The billing API refuses a closed period (services/prepaidBilling.ts)
 * and every page shows only the open ones; members who bought 6 months or a year keep them until they end. The billing
 * API additionally requires KRAROK_PREPAID_ENABLED and validates the Stripe catalog; the UI waits for checkout_ready. */
export const PRO_CHECKOUT_OPEN: Record<ProPeriod, boolean> = { month: true, halfYear: false, year: false };
export const PRO_PERIODS_ON_SALE: readonly ProPeriod[] = PRO_PERIODS.filter(period => PRO_CHECKOUT_OPEN[period]);

/**
 * The price shown on screen and the payment fee added at checkout (owner, 2026-10-25, with the plans page: "ราคาตั้ง
 * 159 แต่จ่ายจริงแค่บอกค่าธรรมเนียม แจ้งรายละเอียดก่อนจ่าย"): the fee is shown with the price and in every payment step
 * before the customer pays.
 */
export function proPriceParts(period: ProPeriod, now: Date | number = Date.now()): { price: number; fee: number; total: number } {
  const schedule = scheduleAt(now);
  return { price: schedule.net[period], fee: schedule.total[period] - schedule.net[period], total: schedule.total[period] };
}
/**
 * The parts of an amount charged for a number of months, when it is a Pro price of either date (an order made just
 * before 1 Dec keeps its amount after it), else undefined.
 */
export function proPricePartsForCharge(months: number, totalBaht: number) {
  const period = PRO_PERIODS.find(item => PERIOD_MONTHS[item] === months);
  if (!period) return undefined;
  for (const schedule of [PROMO_PRICES, REGULAR_PRICES]) {
    if (schedule.total[period] === totalBaht) return { price: schedule.net[period], fee: schedule.total[period] - schedule.net[period], total: totalBaht };
  }
  return undefined;
}

export interface ProPriceDetails {
  months: number;
  /** The price shown (before the payment fee). */
  price: number;
  /** The payment fee added at checkout. */
  fee: number;
  /** What the customer pays: price + fee (Stripe's catalog holds this). */
  total: number;
  /** The regular monthly price times the months. */
  regular: number;
  /** Regular minus the shown price. */
  saving: number;
  /** Against the regular price, rounded to a whole percent. */
  savingPct: number;
  average: number;
  bestValue: boolean;
}

export function proPriceDetails(period: ProPeriod, now: Date | number = Date.now()): ProPriceDetails {
  const { months, bestValue = false } = proPricing(now)[period];
  const { price, fee, total } = proPriceParts(period, now);
  const regular = PRO_REGULAR_MONTHLY * months;
  const saving = Math.max(0, regular - price);
  return { months, price, fee, total, regular, saving, savingPct: regular ? Math.round((saving / regular) * 100) : 0, average: price / months, bestValue };
}

/** "฿1,490"; an average keeps two decimals: "฿141.50". */
export function formatBaht(value: number, decimals = 0): string {
  return `฿${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

// Pro prices in one place (owner, 2026-10-20). Every screen that shows a Pro price reads it from here:
// the plans page, the Pro promo dialog and the landing page. Amounts are in baht as the customer pays.

export type ProPeriod = 'month' | 'halfYear' | 'year';
export const PRO_PERIODS: readonly ProPeriod[] = ['month', 'halfYear', 'year'];

/** The regular monthly price (owner, 2026-10-20: "ราคาจริงคือ 249"); every period's promotion is shown
 * against it, struck through: ฿249 a month, ฿1,494 for 6 months, ฿2,988 for a year. */
export const PRO_REGULAR_MONTHLY = 249;

/** The promotion prices the customer pays. */
export const PRO_PRICING: Record<ProPeriod, { months: number; total: number; bestValue?: boolean }> = {
  month: { months: 1, total: 159 },
  halfYear: { months: 6, total: 849 },
  year: { months: 12, total: 1490, bestValue: true },
};

/** Implemented periods. The billing API additionally requires KRAROK_PREPAID_ENABLED and
 * validates the Stripe catalog; the UI waits for checkout_ready before accepting payment. */
export const PRO_CHECKOUT_OPEN: Record<ProPeriod, boolean> = { month: true, halfYear: true, year: true };

export interface ProPriceDetails {
  months: number;
  total: number;
  /** The regular monthly price times the months. */
  regular: number;
  saving: number;
  /** Against the regular price, rounded to a whole percent. */
  savingPct: number;
  average: number;
  bestValue: boolean;
}

export function proPriceDetails(period: ProPeriod): ProPriceDetails {
  const { months, total, bestValue = false } = PRO_PRICING[period];
  const regular = PRO_REGULAR_MONTHLY * months;
  const saving = Math.max(0, regular - total);
  return { months, total, regular, saving, savingPct: regular ? Math.round((saving / regular) * 100) : 0, average: total / months, bestValue };
}

/** "฿1,490"; an average keeps two decimals: "฿141.50". */
export function formatBaht(value: number, decimals = 0): string {
  return `฿${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

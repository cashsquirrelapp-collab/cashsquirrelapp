import { PRO_MONTH_PROMO_LAST_DAY, PRO_MONTH_RENEWAL_STEP, proMonthPromoRunning, proPriceParts, proPricing, thaiShortDate, type ProPeriod } from './proPricing';

// v2 (owner, 2026-10-21): the consent sentence below. v3 (owner, 2026-10-24, "แก้ข้อยินยอม"): a monthly subscription
// made while the monthly promotion runs also agrees to ฿249 a month from 1 Dec 2569. The amounts come from
// PRO_PRICING (with the card fee since 2026-10-25: ฿177, ฿895, ฿1,562) and each checkout stores its exact text. New checkouts record v3 and its
// exact text; subscriptions that agreed to v1 or v2 keep renewing, so renewal checks accept all three. Those agreed
// to ฿159 a month: moving them to ฿249 needs a notice to them first.
// v4 (owner, 2026-10-25: shown ฿249, ฿271 charged with the payment fee from 1 Dec): the text names the amount charged and
// the price and fee in it; a monthly renewal made during the promotion agrees to ฿271 from 1 Dec 2569, recorded on its
// order (renewal_step_*) so the app moves it to the regular price then. v1–v3 keep renewing at the amount they agreed.
export const CARD_CONSENT_VERSION = 'krarok-card-20261025-v4';
export const ACCEPTED_CARD_CONSENT_VERSIONS: readonly string[] = ['krarok-card-20261021-v1', 'krarok-card-20261021-v2', 'krarok-card-20261024-v3', CARD_CONSENT_VERSION];
export const CARD_SAVE_DISCLOSURE_VERSION = 'krarok-card-save-20261021-v2';
export const CARD_SAVE_DISCLOSURE = 'เมื่อกดยืนยันชำระ คุณยินยอมให้ Stripe บันทึกบัตรเพื่อใช้ชำระครั้งถัดไป การบันทึกบัตรไม่ใช่การยินยอมให้ตัดเงินอัตโนมัติ';
// The sentence beside the checkbox (owner, 2026-10-27: "ใช้ประโยคนี้แทน"): the amounts are shown just above it (the
// amount due now, its price and fee, and the next round). Still v4: renewals and the database checks depend on the
// version, not the wording, and the record kept with each checkout (renewalConsentText) still names the amounts.
export function renewalConsentLabel(period: ProPeriod, now: Date | number = Date.now()): string {
  const months = proPricing(now)[period].months;
  const every = months === 12 ? 'ทุกปี' : months === 1 ? 'ทุกเดือน' : 'ทุก 6 เดือน';
  return `ยินยอมให้ต่ออายุ Pro และตัดเงินอัตโนมัติ${every}ตามราคาที่กำหนด จนกว่าจะยกเลิก`;
}
/** What each checkout keeps as its consent: the sentence the person ticked, and the amounts shown with it. */
export function renewalConsentText(period: ProPeriod, now: Date | number = Date.now()): string {
  const plan = proPricing(now)[period];
  const cadence = plan.months === 12 ? 'ปี' : plan.months === 1 ? 'เดือน' : '6 เดือน';
  const baht = (value: number) => `฿${value.toLocaleString('th-TH')}`;
  const parts = proPriceParts(period, now);
  const charged = (total: number, price: number, fee: number) => `${baht(total)}/${cadence} (ราคา ${baht(price)} + ค่าธรรมเนียมชำระเงิน ${baht(fee)})`;
  const step = PRO_MONTH_RENEWAL_STEP;
  const steps = period === 'month' && proMonthPromoRunning(now)
    ? `${charged(parts.total, parts.price, parts.fee)} ถึงวันที่ ${thaiShortDate(PRO_MONTH_PROMO_LAST_DAY)} จากนั้น ${charged(step.total, step.price, step.fee)}`
    : charged(parts.total, parts.price, parts.fee);
  return `${renewalConsentLabel(period, now)} (ราคาที่แสดง: ${steps} · ยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก)`;
}
export type CardOptions = { autoRenew: boolean; saveCard: boolean; consentVersion: string };

import { PLUS_PRICE, PRO_MONTH_PROMO_LAST_DAY, PRO_MONTH_RENEWAL_STEP, plusPriceParts, proMonthPromoRunning, proPriceParts, proPricing, thaiShortDate, type ProPeriod } from './proPricing';
import type { PaidTier } from './plans';

// v2 (owner, 2026-10-21): the consent sentence below. v3 (owner, 2026-10-24, "แก้ข้อยินยอม"): a monthly subscription
// made while the monthly promotion runs also agrees to ฿249 a month from 1 Dec 2569. The amounts come from
// PRO_PRICING (with the card fee since 2026-10-25: ฿177, ฿895, ฿1,562) and each checkout stores its exact text. New checkouts record v3 and its
// exact text; subscriptions that agreed to v1 or v2 keep renewing, so renewal checks accept all three. Those agreed
// to ฿159 a month: moving them to ฿249 needs a notice to them first.
// v4 (owner, 2026-10-25: shown ฿249, ฿271 charged with the payment fee from 1 Dec): the text names the amount charged and
// the price and fee in it; a monthly renewal made during the promotion agrees to ฿271 from 1 Dec 2569, recorded on its
// order (renewal_step_*) so the app moves it to the regular price then. v1–v3 keep renewing at the amount they agreed.
// v5 (owner, 2026-11-15: Free / Plus / Pro): Pro renews at ฿188 (฿169 + ฿19) from 1 Dec 2569 instead of ฿271, and Plus
// renews at ฿115 (฿99 + ฿16) a month; the sentence names the plan. v1–v4 keep renewing (a v4 promotion month steps to ฿188,
// less than the ฿271 it agreed to). The database accepts each version (the tiers SQL the owner ran on 2026-11-16).
export const CARD_CONSENT_VERSION = 'krarok-card-20261116-v5';
export const ACCEPTED_CARD_CONSENT_VERSIONS: readonly string[] = ['krarok-card-20261021-v1', 'krarok-card-20261021-v2', 'krarok-card-20261024-v3', 'krarok-card-20261025-v4', CARD_CONSENT_VERSION];
export const CARD_SAVE_DISCLOSURE_VERSION = 'krarok-card-save-20261021-v2';
export const CARD_SAVE_DISCLOSURE = 'เมื่อกดยืนยันชำระ คุณยินยอมให้ Stripe บันทึกบัตรเพื่อใช้ชำระครั้งถัดไป การบันทึกบัตรไม่ใช่การยินยอมให้ตัดเงินอัตโนมัติ';
// The sentence beside the checkbox (owner, 2026-10-27: "ใช้ประโยคนี้แทน"): the amounts are shown just above it (the
// amount due now, its price and fee, and the next round). Still v4: renewals and the database checks depend on the
// version, not the wording, and the record kept with each checkout (renewalConsentText) still names the amounts.
export function renewalConsentLabel(period: ProPeriod, now: Date | number = Date.now(), tier: PaidTier = 'pro'): string {
  const months = tier === 'plus' ? PLUS_PRICE.months : proPricing(now)[period].months;
  const every = months === 12 ? 'ทุกปี' : months === 1 ? 'ทุกเดือน' : 'ทุก 6 เดือน';
  return `ยินยอมให้ต่ออายุ ${tier === 'plus' ? 'Plus' : 'Pro'} และตัดเงินอัตโนมัติ${every}ตามราคาที่กำหนด จนกว่าจะยกเลิก`;
}
/** What each checkout keeps as its consent: the sentence the person ticked, and the amounts shown with it. */
export function renewalConsentText(period: ProPeriod, now: Date | number = Date.now(), tier: PaidTier = 'pro'): string {
  const baht = (value: number) => `฿${value.toLocaleString('th-TH')}`;
  if (tier === 'plus') {
    const parts = plusPriceParts();
    return `${renewalConsentLabel('month', now, 'plus')} (ราคาที่แสดง: ${baht(parts.total)}/เดือน (ราคา ${baht(parts.price)} + ค่าธรรมเนียมชำระเงิน ${baht(parts.fee)}) · ยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก)`;
  }
  const plan = proPricing(now)[period];
  const cadence = plan.months === 12 ? 'ปี' : plan.months === 1 ? 'เดือน' : '6 เดือน';
  const parts = proPriceParts(period, now);
  const charged = (total: number, price: number, fee: number) => `${baht(total)}/${cadence} (ราคา ${baht(price)} + ค่าธรรมเนียมชำระเงิน ${baht(fee)})`;
  const step = PRO_MONTH_RENEWAL_STEP;
  const steps = period === 'month' && proMonthPromoRunning(now)
    ? `${charged(parts.total, parts.price, parts.fee)} ถึงวันที่ ${thaiShortDate(PRO_MONTH_PROMO_LAST_DAY)} จากนั้น ${charged(step.total, step.price, step.fee)}`
    : charged(parts.total, parts.price, parts.fee);
  return `${renewalConsentLabel(period, now)} (ราคาที่แสดง: ${steps} · ยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก)`;
}
export type CardOptions = { autoRenew: boolean; saveCard: boolean; consentVersion: string };

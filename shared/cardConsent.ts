import { PRO_PRICING, type ProPeriod } from './proPricing';

// v2 (owner, 2026-10-21): the consent sentence below. New checkouts record v2 and its exact text;
// subscriptions that agreed to v1's wording keep renewing, so renewal checks accept both.
export const CARD_CONSENT_VERSION = 'krarok-card-20261021-v2';
export const ACCEPTED_CARD_CONSENT_VERSIONS: readonly string[] = ['krarok-card-20261021-v1', CARD_CONSENT_VERSION];
export const CARD_SAVE_DISCLOSURE_VERSION = 'krarok-card-save-20261021-v2';
export const CARD_SAVE_DISCLOSURE = 'เมื่อกดยืนยันชำระ คุณยินยอมให้ Stripe บันทึกบัตรเพื่อใช้ชำระครั้งถัดไป การบันทึกบัตรไม่ใช่การยินยอมให้ตัดเงินอัตโนมัติ';
export function renewalConsentText(period: ProPeriod): string {
  const plan = PRO_PRICING[period];
  const cadence = plan.months === 12 ? 'ปี' : plan.months === 1 ? 'เดือน' : '6 เดือน';
  return `ยินยอมต่ออายุ Pro อัตโนมัติ ฿${plan.total.toLocaleString('th-TH')}/${cadence} จนกว่าจะยกเลิก โดยสามารถยกเลิกได้ก่อนรอบบิลถัดไปที่หน้าสมาชิก`;
}
export type CardOptions = { autoRenew: boolean; saveCard: boolean; consentVersion: string };

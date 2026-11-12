import { z } from 'zod';

// The six business questions (owner, 2026-11-12, plan phase 1; research report "เทมเพลตบัญชีตามประเภทธุรกิจ 2568"): asked
// once and kept in the account's settings document (settings.business) with stable IDs, like settings.onboarding. They
// pick the bookkeeping template (bookTemplates.ts) and the filing calendar (filingCalendar.ts). The questions follow the
// lines the law draws, not job titles: two teachers can need different books. While phase 1 is in ฟีเจอร์ทดลอง they are
// asked on the filing calendar and template screens; when it opens to everyone they join the sign-up questions.

export const BUSINESS_VERSION = 'biz-v1';

export const ENTITIES = [
  { id: 'individual', label: 'ตัวเอง (บุคคลธรรมดา)' },
  { id: 'partnership', label: 'ห้างหุ้นส่วนจำกัด' },
  { id: 'company', label: 'บริษัทจำกัด' },
  { id: 'accounting_office', label: 'สำนักงานบัญชี หรือผู้รับทำบัญชีที่ดูแลหลายกิจการ' },
] as const;
export const VAT_ANSWERS = [
  { id: 'no', label: 'ยังไม่จด' },
  { id: 'yes', label: 'จดแล้ว' },
  { id: 'unsure', label: 'ไม่แน่ใจ' },
] as const;
export const WORKS = [
  { id: 'coach', label: 'โค้ช / วิทยากร' },
  { id: 'teacher', label: 'ครู / ติวเตอร์' },
  { id: 'student', label: 'นักเรียน นักศึกษารับงาน' },
  { id: 'creator', label: 'ครีเอเตอร์ / อินฟลูเอนเซอร์' },
  { id: 'design', label: 'ออกแบบ ตัดต่อ ถ่ายภาพ' },
  { id: 'licensed', label: 'วิชาชีพที่มีใบอนุญาต' },
  { id: 'agency', label: 'เอเจนซี่การตลาด / ครีเอทีฟ' },
  { id: 'production', label: 'โปรดักชันวิดีโอ / ภาพนิ่ง' },
  { id: 'other', label: 'อื่น ๆ' },
] as const;
export const INCOME_KINDS = [
  { id: 'per_job', label: 'รับงานเป็นครั้งจากผู้ว่าจ้าง', hint: 'เงินได้ 40(2) ค่าจ้างทำของ ค่าบริการเป็นครั้ง' },
  { id: 'own_business', label: 'เปิดกิจการเอง ลงทุนเอง', hint: 'เงินได้ 40(8) มีที่ทำงาน มีลูกน้อง หรือซื้อของมาขาย' },
  { id: 'profession', label: 'วิชาชีพอิสระ', hint: 'เงินได้ 40(6) เช่น แพทย์ ทนาย สถาปนิก ผู้สอบบัญชี' },
  { id: 'both', label: 'มีทั้งสองแบบ', hint: '' },
  { id: 'unsure', label: 'ไม่แน่ใจ', hint: 'ดูช่อง “ประเภทเงินได้” ในหนังสือรับรอง 50 ทวิ ที่ได้รับ' },
] as const;
export const PAYMENTS = [
  { id: 'freelancers', label: 'จ่ายฟรีแลนซ์ ทีมงาน หรือนักแสดง' },
  { id: 'rent', label: 'จ่ายค่าเช่า' },
  { id: 'employees', label: 'มีลูกจ้างประจำ' },
] as const;
export const REVENUES = [
  { id: 'under_1m', label: 'ไม่ถึง 1 ล้านบาท' },
  { id: '1m_to_1_8m', label: '1–1.8 ล้านบาท' },
  { id: 'over_1_8m', label: 'เกิน 1.8 ล้านบาท' },
] as const;

export type EntityId = (typeof ENTITIES)[number]['id'];
export type VatId = (typeof VAT_ANSWERS)[number]['id'];
export type WorkId = (typeof WORKS)[number]['id'];
export type IncomeKindId = (typeof INCOME_KINDS)[number]['id'];
export type PaymentId = (typeof PAYMENTS)[number]['id'];
export type RevenueId = (typeof REVENUES)[number]['id'];

const ids = <T extends readonly { id: string }[]>(list: T) => list.map(item => item.id) as [T[number]['id'], ...T[number]['id'][]];

export const businessProfileSchema = z.object({
  version: z.literal(BUSINESS_VERSION),
  entity: z.enum(ids(ENTITIES)),
  vat: z.enum(ids(VAT_ANSWERS)),
  work: z.enum(ids(WORKS)),
  income: z.enum(ids(INCOME_KINDS)),
  /** Empty: pays no one. */
  pays: z.array(z.enum(ids(PAYMENTS))).max(PAYMENTS.length),
  revenue: z.enum(ids(REVENUES)),
  updated_at: z.string().max(40),
}).strict().refine(profile => new Set(profile.pays).size === profile.pays.length, 'no repeats');
export type BusinessProfile = z.infer<typeof businessProfileSchema>;

/** A stored profile, or null when there is none or it cannot be read (the screens then ask the questions again). */
export function readBusinessProfile(value: unknown): BusinessProfile | null {
  const parsed = businessProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What the six questions screen works with before every question has an answer. */
export interface BusinessAnswers {
  entity: EntityId | null;
  vat: VatId | null;
  work: WorkId | null;
  income: IncomeKindId | null;
  pays: PaymentId[];
  /** "ไม่จ่ายใคร" was picked (an empty list alone could mean not answered yet). */
  paysNone: boolean;
  revenue: RevenueId | null;
}
export const EMPTY_BUSINESS: BusinessAnswers = { entity: null, vat: null, work: null, income: null, pays: [], paysNone: false, revenue: null };

export function answersFromProfile(profile: BusinessProfile | null): BusinessAnswers {
  if (!profile) return EMPTY_BUSINESS;
  return { entity: profile.entity, vat: profile.vat, work: profile.work, income: profile.income, pays: [...profile.pays], paysNone: profile.pays.length === 0, revenue: profile.revenue };
}

/** Juristic persons do not have the 40(x) income question: their books follow the Accounting Act. */
export const isJuristic = (entity: EntityId | null) => entity === 'partnership' || entity === 'company';
export const asksIncomeKind = (entity: EntityId | null) => entity === 'individual';

export function answersComplete(answers: BusinessAnswers): boolean {
  return Boolean(answers.entity && answers.vat && answers.work && answers.revenue
    && (answers.pays.length > 0 || answers.paysNone)
    && (!asksIncomeKind(answers.entity) || answers.income));
}

/** The record to save. Juristic persons and offices count as "own business" for the income question they are not asked. */
export function profileFromAnswers(answers: BusinessAnswers, now = new Date()): BusinessProfile | null {
  if (!answersComplete(answers)) return null;
  return {
    version: BUSINESS_VERSION,
    entity: answers.entity!,
    vat: answers.vat!,
    work: answers.work!,
    income: asksIncomeKind(answers.entity) ? answers.income! : 'own_business',
    pays: answers.paysNone ? [] : [...answers.pays],
    revenue: answers.revenue!,
    updated_at: now.toISOString(),
  };
}

export type TemplateId = 'freelance' | 'freelance_vat' | 'agency' | 'production' | 'office';

/** The report's table: who they are → which of the five templates. "ไม่แน่ใจ" about VAT keeps the simpler one, with a
 *  warning on the screen when the revenue is over 1.8 million. */
export function templateFor(profile: Pick<BusinessProfile, 'entity' | 'vat' | 'work'>): TemplateId {
  if (profile.entity === 'accounting_office') return 'office';
  if (profile.entity === 'individual') return profile.vat === 'yes' ? 'freelance_vat' : 'freelance';
  return profile.work === 'production' ? 'production' : 'agency';
}

/** Individuals with 40(5)–(8) income (not VAT registered) must keep the cash receipts and payments report and file
 *  ภ.ง.ด.94; "ไม่แน่ใจ" takes the safe side. */
export function hasSection40_5to8(profile: Pick<BusinessProfile, 'entity' | 'income'>): boolean {
  return profile.entity === 'individual' && profile.income !== 'per_job';
}

/** Over 1.8 million a year without VAT registration: register within 30 days of passing it. */
export const shouldRegisterVat = (profile: Pick<BusinessProfile, 'vat' | 'revenue'>) => profile.revenue === 'over_1_8m' && profile.vat !== 'yes';

const label = <T extends readonly { id: string; label: string }[]>(list: T, id: string) => list.find(item => item.id === id)?.label ?? '';

/** One line that says who this account is, for the screens' summary ("บุคคลธรรมดา · ยังไม่จด VAT · ..."). */
export function profileSummary(profile: BusinessProfile): string[] {
  return [
    label(ENTITIES, profile.entity).replace(/^ตัวเอง \((.+)\)$/, '$1'),
    profile.vat === 'yes' ? 'จด VAT แล้ว' : profile.vat === 'no' ? 'ยังไม่จด VAT' : 'ไม่แน่ใจเรื่อง VAT',
    label(WORKS, profile.work),
    ...(profile.pays.length ? profile.pays.map(id => label(PAYMENTS, id)) : ['ไม่จ่ายเงินให้ใคร']),
  ];
}

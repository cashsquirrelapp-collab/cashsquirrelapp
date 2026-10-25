// What เลขา can ask with a tap-to-answer card (ask_user), shared by the server, the app's card and LINE.
// Owner, 2026-10-25:
// - when the client pays: "ชำระวันไหน" with a calendar and "มีเครดิตเทอมไหม", ไม่มี / มี, then the app's days. The
//   word เครดิตเทอม alone confuses people.
// - the client's details are asked; the account's own issuer details only when none are saved yet.
export type AskKind = 'choice' | 'date' | 'payment' | 'party';
export type PartyRole = 'client' | 'issuer';
export interface PartyValues { name?: string; address?: string; taxId?: string; phone?: string }
export interface AskQuestion {
  id: string; text: string; options: string[]; allowText: boolean; placeholder?: string;
  /** choice (the default), a calendar date, when the client pays (date + credit term), or a party's details. */
  kind?: AskKind;
  /** payment: the app's credit terms in days (shared/creditTerms.ts). */
  terms?: number[];
  /** party: whose details, and what is already known (editable). */
  role?: PartyRole; prefill?: PartyValues;
}

export const PARTY_FIELDS: readonly { key: keyof PartyValues; label: string; required?: boolean }[] = [
  { key: 'name', label: 'ชื่อ', required: true },
  { key: 'address', label: 'ที่อยู่' },
  { key: 'taxId', label: 'เลขประจำตัวผู้เสียภาษี' },
  { key: 'phone', label: 'โทรศัพท์' },
];

/** A date key as the app shows it, with the key itself for เลขา: "15 พ.ย. 2569 (2026-11-15)". */
export function thaiDateAnswer(key: string): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return `${Number(key.slice(8, 10))} ${months[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543} (${key})`;
}

/** The payment answer as one line: "ชำระวันไหน: … · เครดิตเทอม: ไม่มี" (no date and no credit term = on delivery). */
export function paymentAnswer(date: string, credit: 'none' | number): string {
  const when = date ? thaiDateAnswer(date) : 'ไม่ระบุวัน';
  const term = credit === 'none' ? (date ? 'ไม่มี' : 'ไม่มี (ชำระเมื่อส่งงาน)') : `${credit} วัน`;
  return `ชำระวันไหน: ${when} · เครดิตเทอม: ${term}`;
}

/** A party's details as one line: "ชื่อ …; ที่อยู่ …; เลขประจำตัวผู้เสียภาษี ไม่ระบุ; โทรศัพท์ ไม่ระบุ". */
export function partyAnswer(values: PartyValues): string {
  return PARTY_FIELDS.map(field => `${field.label} ${values[field.key]?.trim() || 'ไม่ระบุ'}`).join('; ');
}

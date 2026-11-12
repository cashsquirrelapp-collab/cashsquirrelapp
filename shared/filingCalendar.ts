import { isThaiPublicHoliday } from './calendar.js';
import { hasSection40_5to8, isJuristic, shouldRegisterVat, type BusinessProfile } from './businessProfile.js';

// ปฏิทินยื่นภาษี (owner, 2026-11-12, plan phase 1). Which returns this business files and when, from the six business
// questions (businessProfile.ts). Kept as rules, not dates (research report "เทมเพลตบัญชีตามประเภทธุรกิจ 2568"), so a
// change in the law is one line here:
// - a starting point (end of the month, half year or year), a period, and whether the online extension applies;
// - the online extension: 8 more days for returns filed on the internet, for returns whose paper due date falls between
//   1 Feb 2567 and 31 Jan 2570 (Ministry of Finance announcements no. 7–9,
//   https://www.rd.go.th/fileadmin/user_upload/kormor/newlaw/mofexpandfornet7A.pdf). After that, unless it is extended,
//   only the paper date is shown, with a note;
// - a date on a weekend or public holiday moves to the next working day (as the Revenue Department's own calendar does:
//   ภ.ง.ด.50 for 2568 is due Sat 30 May 2569 → Tue 2 Jun on paper, Sun 7 Jun → Mon 8 Jun online).
// The fiscal year is taken as January–December (most small businesses); the screen says so.
// The calendar says when and what to prepare. It never files anything and is not tax advice.

export type FormId = 'pnd1' | 'pnd3' | 'pnd53' | 'pp30' | 'sso' | 'pnd94' | 'pnd51' | 'pnd90' | 'pnd1k' | 'pnd50' | 'agm' | 'fs';
export type Cadence = 'monthly' | 'half' | 'yearly';

export interface FilingItem {
  /** Stable for "ยื่นแล้ว" marks and reminder claims: form and the period it covers, e.g. pnd3:2026-10 or pnd90:2025. */
  key: string;
  form: FormId;
  title: string;
  what: string;
  /** The period the return covers, in words: "งวด ต.ค. 2569", "ครึ่งปีแรก 2569", "ปีภาษี 2568". */
  period: string;
  cadence: Cadence;
  /** YYYY-MM-DD, already moved off weekends and public holidays. */
  paper: string;
  /** The online due date, or null when there is no online extension for it (yet). */
  online: string | null;
  /** What the online date is called when it is not the Revenue Department's e-filing. */
  onlineLabel?: string;
  /** Only when something happened that month, e.g. tax was withheld. */
  when?: string;
  /** Extra words under the dates (an expired extension, a figure to check). */
  note?: string;
  prepare: string[];
  /** An accounting office sees its clients' returns. */
  forClients?: boolean;
}

export interface FilingNotice { id: 'register_vat' | 'vat_unsure' | 'income_unsure' | 'fiscal_year' | 'clients'; text: string }

/** Returns due on paper up to this date get the online extension (announcement no. 9). */
export const ONLINE_EXTENSION = { days: 8, paperDueThrough: '2027-01-31' } as const;
const SSO_ONLINE_WORKDAYS = 7;

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const thaiMonthYear = (year: number, month: number) => `${THAI_MONTHS[month - 1]} ${year + 543}`;

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
/** Calendar arithmetic on YYYY-MM-DD in UTC, so it is the same in the browser and on the server. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = parts(key);
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return dateKey(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from); const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}
const lastOfMonth = (year: number, month: number) => dateKey(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

export function isWorkingDay(key: string): boolean {
  const [y, m, d] = parts(key);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isThaiPublicHoliday(new Date(y, m - 1, d));
}
/** The next working day on or after the date. */
export function shiftToWorkingDay(key: string): string {
  let at = key;
  for (let i = 0; i < 14 && !isWorkingDay(at); i += 1) at = addDays(at, 1);
  return at;
}
function addWorkingDays(key: string, days: number): string {
  let at = key; let left = days;
  while (left > 0) { at = addDays(at, 1); if (isWorkingDay(at)) left -= 1; }
  return at;
}

/** Paper and online dates from the statutory paper due date. */
function dates(statutoryPaper: string): { paper: string; online: string | null } {
  const online = statutoryPaper <= ONLINE_EXTENSION.paperDueThrough ? shiftToWorkingDay(addDays(statutoryPaper, ONLINE_EXTENSION.days)) : null;
  return { paper: shiftToWorkingDay(statutoryPaper), online };
}
const NO_EXTENSION_NOTE = 'ยังไม่มีประกาศขยายเวลายื่นออนไลน์สำหรับงวดนี้ ถ้ามีประกาศ ระบบจะแก้วันให้';

const PREPARE: Record<FormId, string[]> = {
  pnd1: ['เงินเดือนและภาษีที่หักไว้ของลูกจ้างแต่ละคน'],
  pnd3: ['ชื่อ เลขประจำตัวผู้เสียภาษี และยอดที่หักไว้ของผู้รับเงินที่เป็นบุคคลธรรมดา', 'สำเนาหนังสือรับรอง 50 ทวิ ที่ออกให้แต่ละคน'],
  pnd53: ['ชื่อ เลขประจำตัวผู้เสียภาษี และยอดที่หักไว้ของนิติบุคคลที่จ่ายเงินให้', 'สำเนาหนังสือรับรอง 50 ทวิ ที่ออกให้'],
  pp30: ['รายงานภาษีขายและรายงานภาษีซื้อของเดือน', 'ใบกำกับภาษีซื้อ (ใช้ได้ภายใน 6 เดือนนับจากเดือนถัดจากเดือนที่ออก)'],
  sso: ['ค่าจ้างของลูกจ้างแต่ละคน (แบบ สปส.1-10)', 'เงินสมทบฝ่ายลูกจ้างและฝ่ายนายจ้าง'],
  pnd94: ['รายได้ ม.ค.–มิ.ย. แยกตามประเภทเงินได้', 'หนังสือรับรอง 50 ทวิ ที่ได้รับ', 'รายงานเงินสดรับ-จ่าย ถ้าหักค่าใช้จ่ายตามจริง'],
  pnd51: ['ประมาณการกำไรทั้งปี หรืองบการเงินครึ่งปี', 'ภาษีที่ถูกหัก ณ ที่จ่ายในครึ่งปีแรก'],
  pnd90: ['รายได้ทั้งปีแยกตามประเภทเงินได้', 'หนังสือรับรอง 50 ทวิ ทุกใบ', 'หลักฐานค่าลดหย่อน เช่น ประกัน กองทุน เงินบริจาค', 'ภาษีที่ชำระไว้แล้วใน ภ.ง.ด.94'],
  pnd1k: ['สรุปเงินเดือนและภาษีที่หักไว้ของลูกจ้างทั้งปี'],
  pnd50: ['งบการเงินที่ผู้สอบบัญชีรับรองแล้ว', 'ภาษีที่ชำระใน ภ.ง.ด.51 และภาษีที่ถูกหัก ณ ที่จ่ายทั้งปี'],
  agm: ['งบการเงินที่ผู้สอบบัญชีรับรองแล้ว', 'หนังสือเชิญประชุมส่งถึงผู้ถือหุ้นล่วงหน้า'],
  fs: ['งบการเงินที่ผ่านการอนุมัติแล้ว', 'ยื่นผ่านระบบ DBD e-Filing'],
};

/** What this business files, for one covered month (monthly returns are due the next month). */
function monthly(profile: BusinessProfile, year: number, month: number, office: boolean): FilingItem[] {
  const period = `งวด ${thaiMonthYear(year, month)}`;
  const ym = `${year}-${pad(month)}`;
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const items: FilingItem[] = [];
  const employees = office || profile.pays.includes('employees');
  const paysOthers = office || profile.pays.includes('freelancers') || profile.pays.includes('rent');
  const juristic = office || isJuristic(profile.entity);
  const withheld = 'ยื่นเฉพาะเดือนที่หักภาษี ณ ที่จ่ายไว้';
  const extra = (statutory: string) => ({ ...dates(statutory), ...(dates(statutory).online ? {} : { note: NO_EXTENSION_NOTE }) });
  if (employees) items.push({ key: `pnd1:${ym}`, form: 'pnd1', title: 'ภ.ง.ด.1', what: 'ภาษีที่หักจากเงินเดือนลูกจ้าง', period, cadence: 'monthly', ...extra(dateKey(next.y, next.m, 7)), when: withheld, prepare: PREPARE.pnd1 });
  if (paysOthers) items.push({ key: `pnd3:${ym}`, form: 'pnd3', title: 'ภ.ง.ด.3', what: 'ภาษีที่หักเมื่อจ่ายเงินให้บุคคลธรรมดา เช่น ฟรีแลนซ์ ทีมงาน เจ้าของที่เช่า', period, cadence: 'monthly', ...extra(dateKey(next.y, next.m, 7)), when: withheld, prepare: PREPARE.pnd3 });
  if (juristic) items.push({ key: `pnd53:${ym}`, form: 'pnd53', title: 'ภ.ง.ด.53', what: 'ภาษีที่หักเมื่อจ่ายเงินให้นิติบุคคล เช่น ค่าบริการ ค่าเช่าที่จ่ายให้บริษัท', period, cadence: 'monthly', ...extra(dateKey(next.y, next.m, 7)), when: withheld, prepare: PREPARE.pnd53 });
  if (office || profile.vat === 'yes') items.push({ key: `pp30:${ym}`, form: 'pp30', title: 'ภ.พ.30', what: 'ภาษีมูลค่าเพิ่ม ต้องยื่นทุกเดือน แม้ไม่มียอดขาย', period, cadence: 'monthly', ...extra(dateKey(next.y, next.m, 15)), prepare: PREPARE.pp30 });
  if (employees) {
    const paper = shiftToWorkingDay(dateKey(next.y, next.m, 15));
    items.push({ key: `sso:${ym}`, form: 'sso', title: 'ประกันสังคม', what: 'ส่งเงินสมทบและแบบ สปส.1-10', period, cadence: 'monthly', paper,
      online: addWorkingDays(paper, SSO_ONLINE_WORKDAYS), onlineLabel: 'e-Service + e-Payment', note: 'ช่องทางออนไลน์ได้เพิ่ม 7 วันทำการ ตรวจกับสำนักงานประกันสังคมอีกครั้ง', prepare: PREPARE.sso });
  }
  return office ? items.map(item => ({ ...item, forClients: true })) : items;
}

/** Half-year and yearly returns that fall in a calendar year. */
function yearly(profile: BusinessProfile, year: number, office: boolean): FilingItem[] {
  const items: FilingItem[] = [];
  const add = (item: Omit<FilingItem, 'paper' | 'online'>, statutory: string) => {
    const due = dates(statutory);
    items.push({ ...item, ...due, ...(due.online ? {} : { note: NO_EXTENSION_NOTE }) });
  };
  const employees = office || profile.pays.includes('employees');
  const juristic = office || isJuristic(profile.entity);
  if (!office && profile.entity === 'individual') {
    add({ key: `pnd90:${year - 1}`, form: 'pnd90', title: 'ภ.ง.ด.90', what: 'ภาษีเงินได้บุคคลธรรมดาทั้งปี', period: `ปีภาษี ${year - 1 + 543}`, cadence: 'yearly', prepare: PREPARE.pnd90 }, dateKey(year, 3, 31));
    if (hasSection40_5to8(profile)) add({ key: `pnd94:${year}`, form: 'pnd94', title: 'ภ.ง.ด.94', what: 'ภาษีครึ่งปีของเงินได้ 40(5)–(8)', period: `ม.ค.–มิ.ย. ${year + 543}`, cadence: 'half', prepare: PREPARE.pnd94 }, dateKey(year, 9, 30));
  }
  if (employees) add({ key: `pnd1k:${year - 1}`, form: 'pnd1k', title: 'ภ.ง.ด.1ก', what: 'สรุปภาษีที่หักจากเงินเดือนลูกจ้างทั้งปี', period: `ปี ${year - 1 + 543}`, cadence: 'yearly', prepare: PREPARE.pnd1k }, lastOfMonth(year, 2));
  if (juristic) {
    add({ key: `pnd51:${year}`, form: 'pnd51', title: 'ภ.ง.ด.51', what: 'ภาษีเงินได้นิติบุคคลครึ่งปี', period: `ครึ่งปีแรก ${year + 543}`, cadence: 'half', prepare: PREPARE.pnd51 }, dateKey(year, 8, 31));
    add({ key: `pnd50:${year - 1}`, form: 'pnd50', title: 'ภ.ง.ด.50', what: 'ภาษีเงินได้นิติบุคคลทั้งปี', period: `รอบบัญชี ${year - 1 + 543}`, cadence: 'yearly', prepare: PREPARE.pnd50 }, addDays(dateKey(year - 1, 12, 31), 150));
    const company = office || profile.entity === 'company';
    if (company) {
      // Not Revenue Department returns: no online extension; still moved off holidays (DBD accepted 2 Jun 2569 for 2568).
      items.push({ key: `agm:${year - 1}`, form: 'agm', title: 'ประชุมผู้ถือหุ้นประจำปี', what: 'อนุมัติงบการเงิน ภายใน 4 เดือนหลังปิดบัญชี', period: `รอบบัญชี ${year - 1 + 543}`, cadence: 'yearly', paper: shiftToWorkingDay(dateKey(year, 4, 30)), online: null, prepare: PREPARE.agm });
      items.push({ key: `fs:${year - 1}`, form: 'fs', title: 'ส่งงบการเงิน', what: 'ส่งกรมพัฒนาธุรกิจการค้า ภายใน 1 เดือนหลังประชุมผู้ถือหุ้น', period: `รอบบัญชี ${year - 1 + 543}`, cadence: 'yearly', paper: shiftToWorkingDay(dateKey(year, 5, 30)), online: null, prepare: PREPARE.fs });
    } else {
      items.push({ key: `fs:${year - 1}`, form: 'fs', title: 'ส่งงบการเงิน', what: 'ส่งกรมพัฒนาธุรกิจการค้า ภายใน 5 เดือนหลังปิดบัญชี', period: `รอบบัญชี ${year - 1 + 543}`, cadence: 'yearly', paper: shiftToWorkingDay(dateKey(year, 5, 31)), online: null, prepare: PREPARE.fs });
    }
  }
  return office ? items.map(item => ({ ...item, forClients: true })) : items;
}

/** The last day the return can still be filed (online when there is an online date). */
export const lastDay = (item: FilingItem) => item.online ?? item.paper;

/** Every return with a due date between the two dates (inclusive), soonest first. */
export function filingsBetween(profile: BusinessProfile, from: string, to: string): FilingItem[] {
  const office = profile.entity === 'accounting_office';
  const [fy, fm] = parts(from); const [ty] = parts(to);
  const items: FilingItem[] = [];
  // Monthly returns are due the month after the month they cover: start one month before `from`.
  let y = fm === 1 ? fy - 1 : fy; let m = fm === 1 ? 12 : fm - 1;
  for (let i = 0; i < 40 && dateKey(y, m, 1) <= to; i += 1) {
    items.push(...monthly(profile, y, m, office));
    m += 1; if (m === 13) { m = 1; y += 1; }
  }
  for (let year = fy; year <= ty + 1; year += 1) items.push(...yearly(profile, year, office));
  const seen = new Set<string>();
  return items
    .filter(item => (item.paper >= from && item.paper <= to) || (item.online !== null && item.online >= from && item.online <= to) || (item.paper < from && lastDay(item) >= from && item.paper <= to))
    .filter(item => (seen.has(item.key) ? false : (seen.add(item.key), true)))
    .sort((a, b) => a.paper.localeCompare(b.paper) || a.title.localeCompare(b.title));
}

/** The returns of one calendar month: due on paper or online within it. */
export function filingsForMonth(profile: BusinessProfile, year: number, month: number): FilingItem[] {
  return filingsBetween(profile, dateKey(year, month, 1), lastOfMonth(year, month));
}

/** Things the screen says above the list. */
export function filingNotices(profile: BusinessProfile): FilingNotice[] {
  const notices: FilingNotice[] = [];
  if (shouldRegisterVat(profile)) notices.push({ id: 'register_vat', text: 'รายรับเกิน 1.8 ล้านบาทต่อปี ต้องจดทะเบียนภาษีมูลค่าเพิ่มภายใน 30 วันนับจากวันที่เกิน' });
  if (profile.vat === 'unsure') notices.push({ id: 'vat_unsure', text: 'ถ้าไม่แน่ใจว่าจด VAT แล้วหรือยัง ดูว่ามีใบทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20) หรือไม่ ถ้าจดแล้ว ต้องยื่น ภ.พ.30 ทุกเดือน' });
  if (profile.entity === 'individual' && profile.income === 'unsure') notices.push({ id: 'income_unsure', text: 'ยังไม่แน่ใจประเภทเงินได้ ระบบแสดง ภ.ง.ด.94 ไว้ก่อน ดูช่อง “ประเภทเงินได้” ในหนังสือรับรอง 50 ทวิ ที่ได้รับ' });
  if (isJuristic(profile.entity)) notices.push({ id: 'fiscal_year', text: 'วันยื่นรายปีคำนวณจากรอบบัญชี ม.ค.–ธ.ค. ถ้ารอบบัญชีของคุณต่างจากนี้ วันจะเลื่อนตาม' });
  if (profile.entity === 'accounting_office') notices.push({ id: 'clients', text: 'แสดงแบบที่ลูกค้าส่วนใหญ่ต้องยื่น ลูกค้าแต่ละรายอาจไม่ต้องยื่นครบทุกแบบ' });
  return notices;
}

export type ReminderKind = 'soon' | 'today';
export const REMIND_DAYS_BEFORE = 3;
/** What to remind about today: 3 days before the paper date, and on the last day. Returns marked ยื่นแล้ว are skipped. */
export function filingReminders(profile: BusinessProfile, today: string, filed: Record<string, unknown> = {}): { item: FilingItem; kind: ReminderKind }[] {
  return filingsBetween(profile, today, addDays(today, REMIND_DAYS_BEFORE + 1))
    .filter(item => !filed[item.key])
    .flatMap((item): { item: FilingItem; kind: ReminderKind }[] => {
      if (lastDay(item) === today) return [{ item, kind: 'today' }];
      if (daysBetween(today, item.paper) === REMIND_DAYS_BEFORE) return [{ item, kind: 'soon' }];
      return [];
    });
}

/** "ยื่นแล้ว" marks kept in settings.filed: key → when it was marked. Bounded so the settings document stays small. */
export const FILED_MAX = 400;
export function readFiled(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, at] of Object.entries(value as Record<string, unknown>)) {
    if (/^[a-z0-9]+:\d{4}(-\d{2})?$/.test(key) && typeof at === 'string' && at.length <= 40) out[key] = at;
  }
  return out;
}
export function toggleFiled(filed: Record<string, string>, key: string, on: boolean, now = new Date()): Record<string, string> {
  const next = { ...filed };
  if (on) next[key] = now.toISOString(); else delete next[key];
  const keys = Object.keys(next);
  if (keys.length > FILED_MAX) for (const old of keys.sort((a, b) => next[a].localeCompare(next[b])).slice(0, keys.length - FILED_MAX)) delete next[old];
  return next;
}

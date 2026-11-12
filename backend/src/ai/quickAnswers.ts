import { buildDataSnapshot, type UserRow } from '../services/lineAssistant.js';
import type { ChatTurn } from './types.js';
import { weekPlan, weekPlanText } from './weekPlan.js';
import { readBusinessProfile } from '../../../shared/businessProfile.js';
import { addDays, filingsBetween, lastDay, readFiled, type FilingItem } from '../../../shared/filingCalendar.js';

// The short questions the เลขา window offers as buttons, answered from the account's own jobs without a model call
// (owner, 2026-10-27: "กำลังดำเนินการ" means "which jobs are in progress", and if there are none, say so; the AI had
// read the bare word as a status and answered "มีอะไรให้ผมช่วยต่อไหมครับ"). The same rules as LINE's quick replies
// (buildDataSnapshot): in progress = not delivered yet; waiting for money = something still to receive.

export type QuickKind = 'wip' | 'unpaid' | 'week' | 'next_week' | 'filing';
const MAX_LISTED = 10;

const baht = (amount: number) => `฿${Number(amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
const ENDINGS = /(ครับผม|ครับ|คับ|ค่ะ|คะ|นะ|จ้า|จ้ะ|หน่อย|ให้หน่อย|ให้ดู|ดู)$/;
function plain(text: string): string {
  let said = text.trim().toLowerCase().replace(/[\s?？!.。,]+/g, '');
  for (let i = 0; i < 3; i += 1) said = said.replace(ENDINGS, '');
  return said;
}
const WIP = /^(มี)?(งาน)?(ไหน|อะไร)?(ที่)?(ยัง)?(กำลัง(ทำ|ดำเนินการ|ดำเนินงาน)|ระหว่างดำเนินการ)(อยู่)?(บ้าง|มีอะไรบ้าง|มีไหม|ไหม|กี่งาน)?$/;
const WIP_EN = /^(which|what)jobsare(still)?(inprogress|ongoing)(now)?$|^(jobs)?inprogress$/;
const UNPAID = /^(มี)?(งาน)?(ไหน|อะไร)?(ที่)?(ยัง)?(รอรับเงิน|ค้างรับเงิน|ค้างจ่าย|ยังไม่(ได้)?รับเงิน)(อยู่)?(บ้าง|มีอะไรบ้าง|มีไหม|ไหม|กี่งาน)?$/;
const UNPAID_EN = /^(which|what)jobsare(still)?(waitingforpayment|unpaid)(now)?$|^(waitingforpayment|unpaid)$/;
// "สัปดาห์นี้มีอะไรต้องทำ", "อาทิตย์นี้มีงานอะไรบ้าง", "แผนสัปดาห์หน้า" (owner, 2026-11-02: plan the week).
const WEEK = /^(ช่วย)?(สรุป|วาง)?(แผน)?(งาน)?(ของ)?(สัปดาห์|อาทิตย์|วีค)(นี้|หน้า)(มี)?(อะไร|งานอะไร|เรื่องอะไร)?(ที่)?(ต้อง|ควร)?(ทำ|ตาม|ส่ง|เคลียร์)?(อะไร)?(บ้าง|ไหม)?$/;
// "เดือนนี้ต้องยื่นอะไรบ้าง", "ต้องยื่นภาษีอะไรบ้าง", "ใกล้ถึงกำหนดยื่นแบบอะไร" (ฟีเจอร์ทดลอง ปฏิทินยื่นภาษี, 2026-11-12): answered from
// the filing calendar, only for accounts with that lab on (service.ts checks); everyone else gets the AI as before.
const FILING = /^(เดือนนี้|เดือนหน้า|ช่วงนี้|อาทิตย์นี้|สัปดาห์นี้)?(ต้อง|มี|ใกล้)?(ยื่น|ถึงกำหนดยื่น|กำหนดยื่น)(ภาษี|แบบ|ภงด|ภ\.ง\.ด\.?|ภพ30|ภ\.พ\.30)?(อะไร|แบบไหน)(บ้าง)?(ไหม)?$|^(ปฏิทินยื่นภาษี|วันยื่นภาษี|กำหนดยื่นภาษี)(เดือนนี้)?$/;
const WEEK_EN = /^(what('?s|is)?|plan)(do i have|to do|on)?(this|next)week(plan|todo)?$|^(this|next)weekplan$/;

/** Which quick question this is, or null. Not when เลขา has just asked about a job's stage or payment: "กำลังทำ" is then an answer. */
export function quickKind(text: string, history: ChatTurn[] = []): QuickKind | null {
  const said = plain(text);
  const week = WEEK.test(said) || WEEK_EN.test(said);
  const kind: QuickKind | null = WIP.test(said) || WIP_EN.test(said) ? 'wip' : UNPAID.test(said) || UNPAID_EN.test(said) ? 'unpaid'
    : FILING.test(said) ? 'filing'
    : week ? (/หน้า|next/.test(said) ? 'next_week' : 'week') : null;
  if (!kind) return null;
  const last = [...history].reverse().find(turn => turn.role === 'assistant')?.text ?? '';
  const asked = /[?？]|ไหม|หรือยัง|หรือเปล่า|หรือไม่/.test(last) && /ส่งงาน|สถานะ|กำลังทำ|ดำเนินการ|รับเงิน|จ่าย/.test(last);
  return asked ? null : kind;
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const thaiDate = (key: string) => { const [, m, d] = key.split('-').map(Number); return `${d} ${THAI_MONTHS[m - 1]}`; };

/** The next 30 days of the filing calendar, from the six business answers. */
export function filingAnswer(user: UserRow, now = new Date()): string {
  const profile = readBusinessProfile((user.settings as { business?: unknown } | undefined)?.business);
  if (!profile) return 'ยังไม่มีคำตอบเรื่องธุรกิจของคุณครับ ตอบ 6 ข้อที่ [ปฏิทิน › ยื่นภาษี](/calendar?view=tax) แล้วเลขาจะบอกได้ว่าต้องยื่นแบบอะไร วันไหน';
  const today = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const filed = readFiled((user.settings as { filed?: unknown } | undefined)?.filed);
  const items: FilingItem[] = filingsBetween(profile, today, addDays(today, 30)).filter(item => !filed[item.key] && lastDay(item) >= today);
  if (!items.length) return 'ใน 30 วันข้างหน้าไม่มีแบบที่ต้องยื่นครับ ดูเดือนอื่นได้ที่ [ปฏิทิน › ยื่นภาษี](/calendar?view=tax)';
  const lines = items.slice(0, MAX_LISTED).map((item, index) => `${index + 1}. **${item.title}** ${item.period} — กระดาษ ${thaiDate(item.paper)}${item.online ? ` · ออนไลน์ ${thaiDate(item.online)}` : ''}`);
  return [
    `ใน 30 วันข้างหน้ามีแบบที่ต้องยื่น **${items.length} แบบ** ครับ`, '',
    ...lines,
    ...(items.some(item => item.when) ? ['', 'ภ.ง.ด.1, 3, 53 ยื่นเฉพาะเดือนที่หักภาษี ณ ที่จ่ายไว้'] : []), '',
    'ดูสิ่งที่ต้องเตรียมและกด ยื่นแล้ว ได้ที่ [ปฏิทิน › ยื่นภาษี](/calendar?view=tax) (เลขาบอกวัน ไม่ได้ยื่นแทนนะครับ)',
  ].join('\n');
}

/** The answer, from this account's jobs: the list, or plainly that there is none. */
export function quickAnswer(kind: QuickKind, user: UserRow, now = new Date()): string {
  if (kind === 'filing') return filingAnswer(user, now);
  if (kind === 'week' || kind === 'next_week') return weekPlanText(weekPlan(user, { next: kind === 'next_week', now }));
  const snapshot = buildDataSnapshot(user);
  if (kind === 'wip') {
    const jobs = snapshot.wip;
    if (!jobs.length) return 'ตอนนี้ยังไม่มีงานที่กำลังดำเนินการครับ';
    const total = jobs.reduce((sum, job) => sum + (job.value || 0), 0);
    const lines = jobs.slice(0, MAX_LISTED).map((job, index) => `${index + 1}. **${job.name}**${job.client ? ` · ${job.client}` : ''} — ${baht(job.value)}`);
    return [
      `ตอนนี้มีงานที่กำลังดำเนินการ **${jobs.length} งาน** มูลค่ารวม **${baht(total)}** ครับ`, '',
      ...lines,
      ...(jobs.length > MAX_LISTED ? ['', `และอีก ${jobs.length - MAX_LISTED} งาน`] : []), '',
      'ดูทั้งหมดได้ที่ [หน้างาน](/jobs)',
    ].join('\n');
  }
  const jobs = [...snapshot.unpaid].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  if (!jobs.length) return 'ตอนนี้ไม่มีงานที่รอรับเงินครับ';
  const total = jobs.reduce((sum, job) => sum + (job.pending || 0), 0);
  const lines = jobs.slice(0, MAX_LISTED).map((job, index) => `${index + 1}. **${job.name}**${job.client ? ` · ${job.client}` : ''} — ${baht(job.pending)} · ${job.dueDate ? `กำหนดรับ ${job.dueText}` : 'ยังไม่ระบุวันรับเงิน'}`);
  return [
    `ตอนนี้มีงานที่รอรับเงิน **${jobs.length} งาน** รวม **${baht(total)}** ครับ`, '',
    ...lines,
    ...(jobs.length > MAX_LISTED ? ['', `และอีก ${jobs.length - MAX_LISTED} งาน`] : []), '',
    'ดูทั้งหมดได้ที่ [หน้างาน](/jobs) แท็บ รอรับเงิน',
  ].join('\n');
}

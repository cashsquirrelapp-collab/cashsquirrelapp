import { buildDataSnapshot, type UserRow } from '../services/lineAssistant.js';
import type { ChatTurn } from './types.js';

// The short questions the เลขา window offers as buttons, answered from the account's own jobs without a model call
// (owner, 2026-10-27: "กำลังดำเนินการ" means "which jobs are in progress", and if there are none, say so; the AI had
// read the bare word as a status and answered "มีอะไรให้ผมช่วยต่อไหมครับ"). The same rules as LINE's quick replies
// (buildDataSnapshot): in progress = not delivered yet; waiting for money = something still to receive.

export type QuickKind = 'wip' | 'unpaid';
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

/** Which quick question this is, or null. Not when เลขา has just asked about a job's stage or payment: "กำลังทำ" is then an answer. */
export function quickKind(text: string, history: ChatTurn[] = []): QuickKind | null {
  const said = plain(text);
  const kind: QuickKind | null = WIP.test(said) || WIP_EN.test(said) ? 'wip' : UNPAID.test(said) || UNPAID_EN.test(said) ? 'unpaid' : null;
  if (!kind) return null;
  const last = [...history].reverse().find(turn => turn.role === 'assistant')?.text ?? '';
  const asked = /[?？]|ไหม|หรือยัง|หรือเปล่า|หรือไม่/.test(last) && /ส่งงาน|สถานะ|กำลังทำ|ดำเนินการ|รับเงิน|จ่าย/.test(last);
  return asked ? null : kind;
}

/** The answer, from this account's jobs: the list, or plainly that there is none. */
export function quickAnswer(kind: QuickKind, user: UserRow): string {
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

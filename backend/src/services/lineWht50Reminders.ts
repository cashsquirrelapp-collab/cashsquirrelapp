import type { Job } from '../../../shared/types.js';
import type { VaultFile } from '../../../shared/vault.js';
import { wht50StatusOf, wht50WaitingDays } from '../../../shared/vaultStatus.js';
import { LINE_CARD_COLORS, lineCard, lineJobItem, lineAppLink } from './lineCards.js';
import { todayInBangkok } from './lineReminders.js';
import type { LineMessage } from './line.js';
import { duePaymentDependencies, type DuePaymentDependencies } from './lineDuePayments.js';

export interface WaitingWht50Job { job: Job; days: number | null }

/** One digest per Bangkok calendar month, leaving LINE's scarce push quota for urgent work. */
export function wht50ReminderMonth(now = new Date()): string { return todayInBangkok(now).slice(0, 7); }

/** The 1st, with the 2nd and 3rd to retry what did not go out (each account is reminded once a month: its delivery claim). */
export function isWht50ReminderDay(now = new Date()): boolean {
  return Number(todayInBangkok(now).slice(8, 10)) <= 3;
}

/** Use the same certificate status as the vault UI; no AI, financial writes, or date guesses. */
export function findWaitingWht50Jobs(jobs: Job[], files: VaultFile[], now = new Date()): WaitingWht50Job[] {
  const today = todayInBangkok(now);
  return jobs.filter(job => wht50StatusOf(job, files) === 'waiting')
    .map(job => ({ job, days: wht50WaitingDays(job, today) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || a.job.id.localeCompare(b.job.id));
}

// ไม่ต้องตามใบนี้ / กลับมาติดตาม from the chat (owner, 2026-11-04: "ทำปุ่มไม่ต้องตามใบนี้ในการ์ด LINE ด้วย"): a postback
// with the job's id, answered without the model after the same account and Pro checks as every message.
const ID = '[A-Za-z0-9_.-]{1,128}';
const WHT50_ACTION = new RegExp(`^wht50:(skip|track):(${ID})$`);
export type Wht50Action = { kind: 'skip' | 'track'; jobId: string };
export function encodeWht50Action(kind: Wht50Action['kind'], jobId: string): string | null {
  const data = `wht50:${kind}:${jobId}`;
  return WHT50_ACTION.test(data) && data.length <= 300 ? data : null;
}
export function decodeWht50Action(data: string): Wht50Action | null {
  const match = WHT50_ACTION.exec(data.trim());
  return match ? { kind: match[1] as Wht50Action['kind'], jobId: match[2] } : null;
}

/** A rounded button inside the card: orange for the one to press, grey for the other (DESIGN.md, LINE cards). */
function pill(label: string, action: Record<string, unknown>, primary: boolean) {
  return {
    type: 'box', layout: 'vertical', flex: 1, cornerRadius: '10px', paddingTop: '10px', paddingBottom: '10px',
    backgroundColor: primary ? LINE_CARD_COLORS.accent : LINE_CARD_COLORS.subtle, borderWidth: '1px',
    borderColor: primary ? LINE_CARD_COLORS.accent : LINE_CARD_COLORS.subtle,
    action,
    contents: [{ type: 'text', text: label, size: 'xs', weight: 'bold', color: primary ? LINE_CARD_COLORS.white : LINE_CARD_COLORS.text, align: 'center' }],
  };
}

/** The buttons under a job (owner, 2026-11-04): แนบใบ 50 ทวิ opens that job on the LINE documents page, ready to take a
 *  photo or pick the file ("ตรงปุ่มรอเอกสาร ... กดแล้วก็แนบเอกสารได้เลยในไลน์"); ไม่ต้องตามใบนี้ stops chasing it, right in
 *  the chat. One orange button per job, like ได้รับแล้ว on the 08:00 card; the card's own link below turns grey. */
function jobButtons(job: Job) {
  const link = lineAppLink(`/line-documents?view=missing&attach=${encodeURIComponent(job.id)}`, 'แนบใบ 50 ทวิ');
  const skip = encodeWht50Action('skip', job.id);
  const buttons = [
    ...(link ? [pill('แนบใบ 50 ทวิ', { type: 'uri', label: link.label, uri: link.uri }, true)] : []),
    ...(skip ? [pill('ไม่ต้องตามใบนี้', { type: 'postback', label: 'ไม่ต้องตามใบนี้', data: skip, displayText: `ไม่ต้องตามใบ 50 ทวิ · ${(job.name || 'งานนี้').slice(0, 120)}` }, false)] : []),
  ];
  return buttons.length ? { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: buttons } : null;
}

export function buildWht50ReminderMessage(waiting: WaitingWht50Job[]): LineMessage {
  const visible = waiting.slice(0, 3);
  let hasButtons = false;
  const card = lineCard({
    compact: true, character: 'document', title: 'เอกสารที่รอติดตาม', subtitle: 'สรุปใบ 50 ทวิประจำเดือน',
    altText: `ติดตามใบ 50 ทวิ: ยังไม่มีไฟล์แนบ ${waiting.length} งาน`,
    metric: { label: 'รับเงินแล้ว · ยังไม่มีใบ 50 ทวิแนบ', value: `${waiting.length} งาน`, note: 'รวมงานทุกปีในบัญชีส่วนตัว' },
    body: visible.map(({ job, days }) => {
      const row = lineJobItem({
        name: job.name, client: job.client, amount: 'รอเอกสาร',
        meta: days === null ? 'ไม่พบวันที่รับเงินจริง' : `รับเงินมาแล้ว ${days} วัน`,
      });
      const buttons = jobButtons(job);
      if (!buttons) return row;
      hasButtons = true;
      return { type: 'box', layout: 'vertical', margin: 'lg', contents: [{ ...row, margin: 'none' }, buttons] };
    }),
    // On unless turned off since 2026-11-03, so the card says where to turn it off.
    note: `${waiting.length > visible.length ? `แสดง ${visible.length} จาก ${waiting.length} งาน\n` : ''}${hasButtons
      ? 'กด แนบใบ 50 ทวิ ใต้งาน แล้วถ่ายรูปหรือเลือกไฟล์ได้เลย · งานไหนไม่ต้องใช้ใบ กด ไม่ต้องตามใบนี้'
      : 'เปิด “งานรอเอกสาร” แล้วแนบให้ตรงงาน · แนบครบแล้วรายการนั้นจะหยุดเตือน'}\nไม่ต้องการการเตือนนี้ ปิด “ติดตามใบ 50 ทวิ” ได้ที่ ตั้งค่า › การแจ้งเตือน`,
    footer: lineAppLink('/line-documents?view=missing', 'ดูงานรอเอกสาร'),
    footerStyle: hasButtons ? 'secondary' : 'primary',
  });
  return card;
}

/** The chat's answer to ไม่ต้องตามใบนี้ / กลับมาติดตาม: saved on the job (as on the 50 ทวิ page), with the way back. */
export async function handleWht50Action(user: { user_id: string }, action: Wht50Action, deps: DuePaymentDependencies = duePaymentDependencies): Promise<LineMessage> {
  if (action.jobId.startsWith('demo-')) return { type: 'text', text: 'นี่คือการ์ดตัวอย่างครับ ในการ์ดจริง ปุ่มนี้จะหยุดตามใบ 50 ทวิของงานนั้นให้ทันที' };
  const notNeeded = action.kind === 'skip';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const row = await deps.loadJob(user.user_id, action.jobId);
    if (!row) return { type: 'text', text: 'ไม่พบงานนี้แล้วครับ อาจถูกลบหรือย้ายไปแล้ว ดูรายการล่าสุดในแอปได้ครับ' };
    const name = (row.data.name || 'งานนี้').slice(0, 120);
    if (Boolean(row.data.wht50NotNeeded) === notNeeded || await deps.saveJob(user.user_id, action.jobId, row.version, { ...row.data, wht50NotNeeded: notNeeded })) {
      return notNeeded ? skippedMessage(name, action.jobId) : { type: 'text', text: `กลับมาติดตามใบ 50 ทวิของ “${name}” แล้วครับ งานนี้จะอยู่ในการ์ดเตือนวันที่ 1 อีกครั้ง` };
    }
  }
  return { type: 'text', text: 'งานนี้เพิ่งถูกแก้จากอีกเครื่องครับ กรุณากดอีกครั้ง หรือทำในหน้าติดตามใบ 50 ทวิ' };
}

function skippedMessage(name: string, jobId: string): LineMessage {
  const track = encodeWht50Action('track', jobId);
  const text = `ไม่ต้องตามใบ 50 ทวิของ “${name}” แล้วครับ งานนี้จะไม่ถูกเตือนอีก ภาษีที่ถูกหักยังนับในยอดรวม`;
  if (!track) return { type: 'text', text };
  return {
    type: 'flex', altText: text,
    contents: { type: 'bubble', size: 'kilo', body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px', contents: [
      { type: 'text', text, size: 'sm', color: LINE_CARD_COLORS.text, wrap: true },
      pill('กลับมาติดตาม', { type: 'postback', label: 'กลับมาติดตาม', data: track, displayText: `กลับมาติดตามใบ 50 ทวิ · ${name}` }, false),
    ] } },
  } as LineMessage;
}

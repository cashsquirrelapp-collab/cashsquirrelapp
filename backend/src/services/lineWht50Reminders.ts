import type { Job } from '../../../shared/types.js';
import type { VaultFile } from '../../../shared/vault.js';
import { wht50StatusOf, wht50WaitingDays } from '../../../shared/vaultStatus.js';
import { LINE_CARD_COLORS, lineCard, lineJobItem, lineAppLink } from './lineCards.js';
import { todayInBangkok } from './lineReminders.js';
import type { LineMessage } from './line.js';

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

/** The button under a job (owner, 2026-11-04: "ตรงปุ่มรอเอกสาร ... กดแล้วก็แนบเอกสารได้เลยในไลน์"): it opens that job on
 *  the LINE documents page, ready to take a photo or pick the file. One orange button per job, like ได้รับแล้ว on the
 *  08:00 card; the card's own link below turns grey. */
function attachPill(jobId: string) {
  const link = lineAppLink(`/line-documents?view=missing&attach=${encodeURIComponent(jobId)}`, 'แนบใบ 50 ทวิ');
  if (!link) return null;
  return {
    type: 'box', layout: 'vertical', margin: 'md', cornerRadius: '10px', paddingTop: '10px', paddingBottom: '10px',
    backgroundColor: LINE_CARD_COLORS.accent, borderWidth: '1px', borderColor: LINE_CARD_COLORS.accent,
    action: { type: 'uri', label: link.label, uri: link.uri },
    contents: [{ type: 'text', text: 'แนบใบ 50 ทวิ', size: 'xs', weight: 'bold', color: LINE_CARD_COLORS.white, align: 'center' }],
  };
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
      const pill = attachPill(job.id);
      if (!pill) return row;
      hasButtons = true;
      return { type: 'box', layout: 'vertical', margin: 'lg', contents: [{ ...row, margin: 'none' }, pill] };
    }),
    // On unless turned off since 2026-11-03, so the card says where to turn it off.
    note: `${waiting.length > visible.length ? `แสดง ${visible.length} จาก ${waiting.length} งาน\n` : ''}${hasButtons
      ? 'กด แนบใบ 50 ทวิ ใต้งาน แล้วถ่ายรูปหรือเลือกไฟล์ได้เลย · แนบแล้วงานนั้นจะหยุดเตือน'
      : 'เปิด “งานรอเอกสาร” แล้วแนบให้ตรงงาน · แนบครบแล้วรายการนั้นจะหยุดเตือน'}\nไม่ต้องการการเตือนนี้ ปิด “ติดตามใบ 50 ทวิ” ได้ที่ ตั้งค่า › การแจ้งเตือน`,
    footer: lineAppLink('/line-documents?view=missing', 'ดูงานรอเอกสาร'),
    footerStyle: hasButtons ? 'secondary' : 'primary',
  });
  return card;
}

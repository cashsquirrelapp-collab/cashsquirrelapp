import type { Job } from '../../../shared/types.js';
import type { VaultFile } from '../../../shared/vault.js';
import { wht50StatusOf, wht50WaitingDays } from '../../../shared/vaultStatus.js';
import { lineCard, lineJobItem, lineAppLink } from './lineCards.js';
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

export function buildWht50ReminderMessage(waiting: WaitingWht50Job[]): LineMessage {
  const visible = waiting.slice(0, 3);
  const card = lineCard({
    compact: true, character: 'document', title: 'เอกสารที่รอติดตาม', subtitle: 'สรุปใบ 50 ทวิประจำเดือน',
    altText: `ติดตามใบ 50 ทวิ: ยังไม่มีไฟล์แนบ ${waiting.length} งาน`,
    metric: { label: 'รับเงินแล้ว · ยังไม่มีใบ 50 ทวิแนบ', value: `${waiting.length} งาน`, note: 'รวมงานทุกปีในบัญชีส่วนตัว' },
    body: visible.map(({ job, days }) => lineJobItem({
      name: job.name, client: job.client, amount: 'รอเอกสาร',
      meta: days === null ? 'ไม่พบวันที่รับเงินจริง' : `รับเงินมาแล้ว ${days} วัน`,
    })),
    // On unless turned off since 2026-11-03, so the card says where to turn it off.
    note: `${waiting.length > visible.length ? `แสดง ${visible.length} จาก ${waiting.length} งาน\n` : ''}เปิด “งานรอเอกสาร” แล้วแนบให้ตรงงาน · แนบครบแล้วรายการนั้นจะหยุดเตือน\nไม่ต้องการการเตือนนี้ ปิด “ติดตามใบ 50 ทวิ” ได้ที่ ตั้งค่า › การแจ้งเตือน`,
    footer: lineAppLink('/line-documents?view=missing', 'ดูงานรอเอกสาร'),
  });
  return card;
}

import { collectionDraft } from '../ai/collections.js';
import type { LineMessage } from './line.js';
import type { UserRow } from './lineAssistant.js';
import { todayInBangkok } from '../../../shared/dueJobs.js';
import { SAMPLE_DRAFT_JOBS, dueShortRef, parseDraftRequest } from './lineDuePayments.js';

// Payment reminders from LINE, step 1 (owner, 2026-11-27: "ร่างข้อความทวงแล้วถามเราก่อนว่าให้ส่งให้ลูกค้าไหม"). After "ยังไม่ได้"
// on the 08:00 card, เลขา offers a reminder; the quick reply asks for it in the person's ending. The words are the fixed,
// natural template of ai/collections.ts with the saved amount and date, sent back as their own message so the person can
// long-press it and forward it to the client from their own LINE. The app never messages the client (LINE does not let
// an app send from a personal account, and the client has not added the official account).

export function handleDueDraftText(user: UserRow, message: string): LineMessage[] | null {
  if (message.trim() === 'ไม่ต้องร่างข้อความ') return [{ type: 'text', text: 'ได้ครับ ไม่ร่างให้ ถ้ายังไม่ได้รับ พรุ่งนี้ 08:00 ผมจะเตือนอีกครั้ง' }];
  const asked = parseDraftRequest(message);
  if (!asked) return null;
  const job = (user.jobs || []).find(row => (row.pending || 0) > 0 && dueShortRef({ jobId: String(row.id) }) === asked.shortRef);
  // The test reminder's samples (ทดสอบแจ้งเตือนเข้า LINE): the same words from the same sample jobs, said to be a sample.
  const sample = !job ? SAMPLE_DRAFT_JOBS.find(id => dueShortRef({ jobId: id }) === asked.shortRef) : undefined;
  if (sample) {
    const today = Date.parse(`${todayInBangkok()}T00:00:00Z`);
    const day = (offset: number) => new Date(today + offset * 86_400_000).toISOString().slice(0, 10);
    const jobs = [{ id: 'demo-overdue', name: 'ออกแบบแพ็กเกจ', client: 'ลูกค้าตัวอย่าง A', status: 'pending', pending: 4500, payDate: day(-3) },
      { id: 'demo-today', name: 'ถ่ายภาพสินค้า', client: 'ลูกค้าตัวอย่าง B', status: 'pending', pending: 3000, payDate: day(0) }];
    const words = collectionDraft({ user_id: 'sample', jobs, statuses: [] } as unknown as UserRow, { jobId: sample, particle: asked.particle });
    if (words) return [
      { type: 'text', text: `ตัวอย่างข้อความทวง${words.client}ครับ ข้อความจริงจะใช้ยอด วันที่ และชื่อลูกค้าจากงานของคุณ กดค้างที่ข้อความถัดไป แล้วเลือก "ส่งต่อ" ไปที่แชตลูกค้าได้` },
      { type: 'text', text: words.text },
    ];
  }
  const draft = job ? collectionDraft(user, { jobId: String(job.id), particle: asked.particle }) : null;
  if (!draft) return [{ type: 'text', text: 'ไม่พบงานที่ยังรอรับเงินของรหัสนี้แล้วครับ อาจรับเงินครบหรือถูกแก้ในแอปไปแล้ว' }];
  return [
    { type: 'text', text: `ร่างข้อความทวง${draft.client}ไว้ให้แล้วครับ กดค้างที่ข้อความถัดไป แล้วเลือก "ส่งต่อ" ไปที่แชตลูกค้าได้เลย อยากแก้คำก็คัดลอกไปแก้ก่อนส่งได้` },
    { type: 'text', text: draft.text },
  ];
}

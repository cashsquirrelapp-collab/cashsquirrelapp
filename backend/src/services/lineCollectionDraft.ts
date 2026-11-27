import { collectionDraft } from '../ai/collections.js';
import type { LineMessage } from './line.js';
import type { UserRow } from './lineAssistant.js';
import { dueShortRef, parseDraftRequest } from './lineDuePayments.js';

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
  const draft = job ? collectionDraft(user, { jobId: String(job.id), particle: asked.particle }) : null;
  if (!draft) return [{ type: 'text', text: 'ไม่พบงานที่ยังรอรับเงินของรหัสนี้แล้วครับ อาจรับเงินครบหรือถูกแก้ในแอปไปแล้ว' }];
  return [
    { type: 'text', text: `ร่างข้อความทวง${draft.client}ไว้ให้แล้วครับ กดค้างที่ข้อความถัดไป แล้วเลือก "ส่งต่อ" ไปที่แชตลูกค้าได้เลย อยากแก้คำก็คัดลอกไปแก้ก่อนส่งได้` },
    { type: 'text', text: draft.text },
  ];
}

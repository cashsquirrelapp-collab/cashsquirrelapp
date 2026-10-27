import type { ProposalKind } from './proposals.js';
import type { AssistantCard, ChatTurn } from './types.js';

// Saving at once when the user says so (owner, 2026-10-28: "ถ้ากูพิมพ์ว่ามึงบันทึกให้หน่อยมันก็จะทำการบันทึกเลย ...
// บางคนเขาบันทึก 4-5 โปรเจกต์ ต้องมาไล่กดทีละโปรเจกต์", then "อะไรที่มันจะเยอะสามารถบอกน้องให้น้องจัดการได้ทั้งหมด").
// The cards are prepared exactly as before, with every check the app runs; when the user's own words ask to save,
// what is being recorded (new jobs, money received, expenses) is then saved without a tap on each card. Edits,
// documents and deletes keep their card (one go-ahead in the chat, or one tap, applies them). App chat only: LINE
// keeps its buttons.

/** Recording, saved at once when the user says so; everything else waits for one go-ahead. */
export const AUTO_SAVE_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>(['add_job', 'record_payment', 'add_expense']);

// "บันทึกให้หน่อย", "บันทึกเลย", "บันทึกทั้ง 5 โปรเจกต์เลย", "เซฟให้ด้วย", "ลงให้เลย", "เพิ่มงานให้หน่อย", "ไม่ต้องรอยืนยัน".
const SAVE_WORD = /(?:บันทึก|เซฟ|\bsave\b)[^\n]{0,24}?(?:ให้|เลย|หน่อย|ด้วย|ทั้งหมด|ทั้ง\s*\d+|ทีนึง|now)/i;
const ADD_WORD = /(?:ลง|เพิ่ม)(?:งาน|โปรเจกต์|โปรเจ็กต์|โปรเจค|ทั้งหมด)?\s*(?:ให้)?\s*(?:เลย|หน่อย|ได้เลย|ด้วย)/;
const SKIP_CHECK = /ไม่ต้อง(?:รอ|ถาม|ยืนยัน|กด)/;
// "ยังไม่ต้องบันทึก", "อย่าเพิ่งบันทึก", "ขอดูก่อน": the cards wait.
const HOLD = /(?:ยังไม่|อย่าเพิ่ง|ไม่ต้อง|ห้าม|ไม่)\s*(?:บันทึก|เซฟ|ลง|เพิ่ม|save)|(?:ขอ|ให้|จะ)?(?:ดู|ตรวจ|เช็ก|เช็ค)ก่อน|don'?t\s+save/i;

/** The user's own words ask to save now (and do not ask to hold). */
export function asksToSave(text: string): boolean {
  const said = text.normalize('NFC');
  if (HOLD.test(said)) return false;
  return SAVE_WORD.test(said) || ADD_WORD.test(said) || SKIP_CHECK.test(said);
}

const ASKED = /\?|ไหม|มั้ย|หรือเปล่า|อะไร|เท่าไร|เท่าไหร่|เมื่อไร|เมื่อไหร่|ยังไง|อย่างไร|ไหน|กี่/;

/**
 * Save now for this message: the message says so, or it answers เลขา's question right after a message that said so
 * ("บันทึกให้หน่อย" → "ลูกค้าชื่ออะไรครับ?" → "บริษัท เอ"). Only the turn just before counts.
 */
export function wantsSaveNow(text: string, history: ChatTurn[] = []): boolean {
  if (HOLD.test(text.normalize('NFC'))) return false;
  if (asksToSave(text)) return true;
  const lastBot = [...history].reverse().find(turn => turn.role === 'assistant');
  const lastUser = [...history].reverse().find(turn => turn.role === 'user');
  const order = history.lastIndexOf(lastBot as ChatTurn) > history.lastIndexOf(lastUser as ChatTurn);
  return Boolean(lastBot && lastUser && order && ASKED.test(lastBot.text) && asksToSave(lastUser.text));
}

export type AutoSaveOutcome = { saved: number; failed: number; waiting: number };

/** What เลขา says after saving at once; the cards show what was saved and open each record. */
export function autoSaveText({ saved, failed, waiting }: AutoSaveOutcome): string {
  const parts = [`บันทึกให้แล้ว ${saved} รายการครับ กดปุ่มบนการ์ดเพื่อเปิดดูหรือแก้ไขรายละเอียดได้เลย`];
  if (failed) parts.push(`อีก ${failed} รายการยังบันทึกไม่ได้ ตรวจรายละเอียดบนการ์ดแล้วกดยืนยันได้เลยครับ`);
  if (waiting) parts.push(`ส่วนรายการอื่นยังรอให้กดยืนยันบนการ์ดครับ`);
  return parts.join(' ');
}

/** The confirm cards of this reply that may be saved at once, by the kind each proposal was prepared as. */
export function autoSaveCards(cards: AssistantCard[] | undefined, kinds: Map<string, ProposalKind>) {
  const confirm = (cards ?? []).filter((card): card is Extract<AssistantCard, { kind: 'confirm' }> => card.kind === 'confirm');
  const save = confirm.filter(card => AUTO_SAVE_KINDS.has(kinds.get(card.id) as ProposalKind));
  return { save, others: confirm.length - save.length };
}

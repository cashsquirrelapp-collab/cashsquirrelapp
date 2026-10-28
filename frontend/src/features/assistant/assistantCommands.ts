import type { ChatMessage, ConfirmCard } from './assistantMock';

/**
 * A typed command for the cards waiting in this conversation. Owner, 2026-10-28: "ถ้ากูพิมพ์ว่ายืนยันทั้งหมดแทนการกด
 * มึงก็ควร...ให้อัตโนมัติ ไม่ใช่มาถามกูอีกรอบ" — a typed confirm applies every card still waiting here (`cards`), the same
 * as pressing ยืนยันทั้งหมด. A plain ยกเลิก with several waiting still asks which one; ยกเลิกทั้งหมด cancels them all.
 */
export type ConfirmationCommand = { action: 'confirm' | 'cancel'; card?: ConfirmCard; cards: ConfirmCard[]; ambiguous: boolean };

const CONFIRM_WORDS = new Set(['ยืนยัน', 'ยืนยันบันทึก', 'ยืนยันทั้งหมด', 'ยืนยันทุกรายการ', 'ยืนยันหมด', 'confirm', 'confirm all']);
const CANCEL_ALL = new Set(['ยกเลิกทั้งหมด', 'ยกเลิกทุกรายการ', 'cancel all']);
const CANCEL_ONE = new Set(['ยกเลิก', 'cancel']);
/** Polite endings and spacing do not change the command: "ยืนยันทั้งหมดเลยครับ" is ยืนยันทั้งหมด. */
const plain = (text: string) => text.trim().toLowerCase().replace(/(?:\s|ครับ|ค่ะ|คะ|นะ|จ้า|เลย|ด้วย|!|\.)+$/u, '').replace(/\s+/g, ' ').trim();

/** Only an exact user command may act on the pending confirmations in the current conversation. */
export function confirmationCommand(text: string, messages: ChatMessage[], states: Record<string, string>): ConfirmationCommand | null {
  const word = plain(text);
  const compact = word.replace(/ (?=ทั้งหมด|ทุกรายการ)/u, '');
  const action = CONFIRM_WORDS.has(compact) ? 'confirm' : CANCEL_ALL.has(compact) ? 'cancel' : CANCEL_ONE.has(compact) ? 'cancel' : null;
  if (!action) return null;
  const pending = new Map<string, ConfirmCard>();
  for (const message of messages) {
    if (message.from !== 'bot') continue;
    for (const card of message.cards ?? []) {
      if (card.kind === 'confirm' && (!card.status || card.status === 'pending') && (!states[card.id] || states[card.id] === 'pending')) pending.set(card.id, card);
    }
  }
  if (!pending.size) return null;
  const cards = [...pending.values()];
  if (cards.length === 1) return { action, card: cards[0], cards, ambiguous: false };
  // Several waiting: a confirm or a cancel-all acts on all of them; a plain cancel asks which.
  if (action === 'cancel' && CANCEL_ONE.has(compact)) return { action, cards: [], ambiguous: true };
  return { action, cards, ambiguous: false };
}

import type { ChatMessage, ConfirmCard } from './assistantMock';

export type ConfirmationCommand = { action: 'confirm' | 'cancel'; card?: ConfirmCard; ambiguous: boolean };
/** Only an exact user command may confirm the sole pending card in this conversation. */
export function confirmationCommand(text: string, messages: ChatMessage[], states: Record<string, string>): ConfirmationCommand | null {
  const word = text.trim().toLowerCase();
  const action = ['ยืนยัน', 'ยืนยันบันทึก', 'confirm'].includes(word) ? 'confirm'
    : ['ยกเลิก', 'cancel'].includes(word) ? 'cancel' : null;
  if (!action) return null;
  const pending = new Map<string, ConfirmCard>();
  for (const message of messages) {
    if (message.from !== 'bot') continue;
    for (const card of message.cards ?? []) {
      if (card.kind === 'confirm' && (!states[card.id] || states[card.id] === 'pending')) pending.set(card.id, card);
    }
  }
  if (!pending.size) return null;
  return pending.size === 1 ? { action, card: [...pending.values()][0], ambiguous: false } : { action, ambiguous: true };
}

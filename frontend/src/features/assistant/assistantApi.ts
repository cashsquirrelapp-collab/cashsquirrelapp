import { tr } from '../../i18n/tr';
import { LOW_TOKENS, PAGE_HELP, SAMPLE_TOKENS, estimateTokens, pageHelpReply, sampleConversations, sampleReply, type ChatCard, type ChatMessage, type ConfirmCard, type Conversation, type TokenBalance } from './assistantMock';

// WHERE THE AI CONNECTS (next phase, done separately by the owner's team). The chat screen talks only to
// an AssistantTransport. Today it is createSampleTransport below, which never leaves the browser. To go
// live, write a transport that calls the backend (which holds the AI key) and pass it to AssistantChat:
//   send            -> stream the answer: call onDelta with each piece of text, resolve with the whole
//                      message, its cards and the tokens it used; reject (or throw) on a failed request
//                      so the chat shows its retry state.
//   conversations   -> the sidebar's history.
//   balance         -> the Pro token indicator (remaining / total / refill date).
//   confirm         -> carry out an action the user confirmed on a card (e.g. add a project).
//   remove          -> delete conversations from the history (called once the undo window has passed).
//   update          -> rename, pin or archive a conversation.
// Nothing here touches billing, stored data or LINE.

/** `context`: where the person is in the app (the floating squirrel sends the page it was opened on). */
export type SendInput = { conversationId: string; text: string; history: ChatMessage[]; context?: { page: string; pageName: string } };
export type SendResult = { text: string; cards?: ChatCard[]; tokensUsed: number };

export interface AssistantTransport {
  send(input: SendInput, onDelta: (textSoFar: string) => void, signal: AbortSignal): Promise<SendResult>;
  conversations(): Promise<Conversation[]>;
  balance(): Promise<TokenBalance>;
  confirm(card: ConfirmCard, signal: AbortSignal): Promise<{ ok: boolean }>;
  /** Optional: delete conversations for good. The screen calls it only after its undo window. */
  remove?(conversationIds: string[]): Promise<void>;
  /** Optional: rename, pin or archive a conversation. */
  update?(conversationId: string, change: { title?: string; pinned?: boolean; archived?: boolean }): Promise<void>;
}

export class AssistantRequestError extends Error {}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
  const timer = window.setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
});

const graphemes = (text: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), part => part.segment) : Array.from(text);
};

/** The sample transport for the screen preview: labelled sample answers, streamed like a real AI. */
export function createSampleTransport(options: { failSends: () => boolean; failActions: () => boolean; tokens: () => TokenBalance; instant: boolean }): AssistantTransport {
  return {
    async send(input, onDelta, signal) {
      await wait(options.instant ? 150 : 1300, signal);
      if (options.failSends()) throw new AssistantRequestError('offline');
      const answer = input.context && input.text.trim() === tr(PAGE_HELP) ? { text: pageHelpReply(input.context.page, input.context.pageName), cards: undefined } : sampleReply(input.text, `${input.conversationId}-${input.history.length}`);
      const parts = graphemes(answer.text);
      for (let shown = 0; shown < parts.length;) {
        shown = options.instant ? parts.length : Math.min(parts.length, shown + 3);
        onDelta(parts.slice(0, shown).join(''));
        if (shown < parts.length) await wait(24, signal);
      }
      return { text: answer.text, cards: answer.cards, tokensUsed: Math.min(options.tokens().remaining, estimateTokens(answer.text) + estimateTokens(input.text)) };
    },
    async conversations() { return sampleConversations(Date.now()); },
    async balance() { return { ...SAMPLE_TOKENS }; },
    async confirm(_card, signal) {
      await wait(options.instant ? 100 : 900, signal);
      return { ok: !options.failActions() };
    },
    // The sample history lives in the browser only, so there is nothing to delete elsewhere.
    async remove() {},
    async update() {},
  };
}

export const tokenLevel = (balance: TokenBalance): 'ok' | 'low' | 'empty' =>
  balance.remaining <= 0 ? 'empty' : balance.remaining <= LOW_TOKENS ? 'low' : 'ok';

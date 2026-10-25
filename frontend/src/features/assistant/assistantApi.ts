import { tr } from '../../i18n/tr';
import { apiJson, getCurrentAccount } from '../../services/api';
import { LINE_THREAD_ID, LOW_TOKENS, PAGE_HELP, SAMPLE_TOKENS, estimateTokens, pageHelpReply, sampleConversations, sampleReply, type ChatCard, type ChatGroup, type ChatMessage, type ConfirmCard, type Conversation, type TokenBalance } from './assistantMock';

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
/** `attachment`: a picture or PDF prepared by voice.ts prepareFile (live transport only). */
export type SendInput = { conversationId: string; text: string; history: ChatMessage[]; context?: { page: string; pageName: string }; attachment?: { name: string; mimeType: string; data: string } };
export type SendResult = { text: string; cards?: ChatCard[]; tokensUsed: number; memo?: string };
export type VoiceAudio = { mimeType: 'audio/wav'; data: string };
export type TranscriptionResult = { text: string; tokens: number; tokensLeft: number | null; trialLeft: number | null };

export interface AssistantTransport {
  /** True for the real เลขากระรอก (createLiveTransport): the screen drops its "sample" labels. */
  live?: boolean;
  /** One completed recording, transcribed into an editable draft. Never sends a chat message. */
  transcribe?(audio: VoiceAudio, language: 'th-TH' | 'en-US', signal: AbortSignal): Promise<TranscriptionResult>;
  send(input: SendInput, onDelta: (textSoFar: string) => void, signal: AbortSignal, onCards?: (cards: ChatCard[]) => void): Promise<SendResult>;
  conversations(): Promise<Conversation[]>;
  balance(): Promise<TokenBalance>;
  confirm(card: ConfirmCard, signal: AbortSignal): Promise<{ ok: boolean; path?: string; documentId?: string }>;
  /** Optional: delete conversations for good. The screen calls it only after its undo window. */
  remove?(conversationIds: string[]): Promise<void>;
  /** Optional: rename, pin or archive a conversation. */
  update?(conversationId: string, change: { title?: string; pinned?: boolean; archived?: boolean }): Promise<void>;
  /** Optional: the user pressed ยกเลิก on a confirmation card. */
  cancel?(card: ConfirmCard): Promise<void>;
  /** Optional: fields changed on a confirmation card; resolves to the card prepared again (it replaces the old one). */
  revise?(card: ConfirmCard, edits: Record<string, string>): Promise<ConfirmCard>;
  /** Optional: a stored conversation's messages, fetched when it is opened. */
  loadMessages?(conversationId: string): Promise<ChatMessage[]>;
}

/** Today, yesterday, the last 7 days or earlier, in Bangkok time. */
export function groupOf(at: number, now = Date.now()): ChatGroup {
  const day = (time: number) => Math.floor((time + 7 * 3600_000) / 86400_000);
  const gap = day(now) - day(at);
  return gap <= 0 ? 'today' : gap === 1 ? 'yesterday' : gap < 7 ? 'week' : 'earlier';
}
type MemoCard = { kind: 'memo'; text: string };
type StoredMessage = { id: string; role: 'user' | 'assistant'; text: string; at: string; cards?: (ChatCard | MemoCard)[]; attachment?: { name: string; kind: 'image' | 'pdf' } };
/** A stored answer's cards, with the hidden note of a file (kept as a `memo` card) taken out. */
export function splitMemo(cards: unknown[] | undefined): { cards?: ChatCard[]; memo?: string } {
  const list = (cards ?? []) as (ChatCard | MemoCard)[];
  const memo = list.find((card): card is MemoCard => card.kind === 'memo')?.text;
  const shown = list.filter((card): card is ChatCard => card.kind !== 'memo');
  return { ...(shown.length ? { cards: shown } : {}), ...(memo ? { memo } : {}) };
}
/** One earlier message as เลขา reads it: a file by its name, and what was read from it before the answer. */
export function historyText(message: ChatMessage): string {
  const asked = (message.cards ?? []).flatMap(card => (card.kind === 'questions' ? card.questions.map(question => `\n- ${question.text}`) : [])).join('');
  const file = message.from === 'me' && message.attachment ? ` [แนบไฟล์: ${message.attachment.name}]` : '';
  const memo = message.from === 'bot' && message.memo ? `[อ่านจากไฟล์ที่แนบ: ${message.memo}]\n` : '';
  return `${memo}${message.text}${file}${asked}`.slice(0, 2000);
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

/** GET /api/assistant: whether เลขากระรอก is switched on for this account, and what is left. */
export type AssistantStatus = {
  enabled: boolean; plan: 'pro' | 'trial' | 'admin' | 'none';
  tokensLeft: number | null; trialLeft: number | null; resetsAt: string | null; tokenLimit: number | null; requestLimit: number | null;
};
export const readAssistantStatus = (account: string, signal?: AbortSignal) =>
  apiJson<AssistantStatus>('/api/assistant', { headers: { 'X-Account-ID': account }, signal });

type LiveReply = { text: string; cards?: ChatCard[]; tokens: number; tokensLeft: number | null; trialLeft: number | null; memo?: string };

/** What the token indicator shows: Pro's or the trial's tokens (the trial never refills), or (admins, no cap) a full ring. */
function balanceOf(status: AssistantStatus): TokenBalance {
  if (status.requestLimit !== null && status.tokenLimit === null) return { remaining: status.trialLeft ?? 0, total: status.requestLimit, refillsOn: '' };
  if (status.tokenLimit === null) return { remaining: SAMPLE_TOKENS.total, total: SAMPLE_TOKENS.total, refillsOn: status.resetsAt ?? '' };
  return { remaining: status.tokensLeft ?? 0, total: status.tokenLimit, refillsOn: status.resetsAt ?? '' };
}

/**
 * The real เลขากระรอก: the backend (/api/assistant) runs the AI with the key it holds, charges Krarok Tokens and
 * returns cards; a confirmation card is saved only when the user presses ยืนยัน. The answer arrives whole and is
 * typed out like the sample. Chats are kept in the account (2026-10-24); the notifications thread's too.
 */
export function createLiveTransport(options: { account: string; status: AssistantStatus; instant: boolean; onApplied?: () => void }): AssistantTransport {
  const headers = { 'X-Account-ID': options.account };
  let balance = balanceOf(options.status);
  const post = <T,>(body: unknown, signal?: AbortSignal) => apiJson<T>('/api/assistant', { method: 'POST', headers, body: JSON.stringify(body), signal });
  const active = (signal: AbortSignal) => {
    if (signal.aborted || getCurrentAccount() !== options.account) throw new DOMException('Account or request changed', 'AbortError');
  };
  return {
    live: true,
    async transcribe(audio, language, signal) {
      try {
        const reply = await post<TranscriptionResult>({ action: 'transcribe', audio, language }, signal);
        balance = { ...balance, remaining: reply.tokensLeft ?? reply.trialLeft ?? balance.remaining };
        return reply;
      } catch (error) {
        // A timeout or unusable transcript may still incur provider cost. Reconcile the held/settled
        // allowance, including after cancellation, rather than presenting the old cached balance.
        if (getCurrentAccount() === options.account) {
          try {
            const status = await readAssistantStatus(options.account, AbortSignal.timeout(5000));
            if (getCurrentAccount() === options.account) balance = balanceOf(status);
          } catch { /* offline: keep the last known allowance */ }
        }
        throw error;
      }
    },
    // The account's stored chats (2026-10-24), after the notifications thread; their messages load when opened.
    async loadMessages(conversationId) {
      const reply = await apiJson<{ messages: StoredMessage[] }>(`/api/assistant?view=conversation&id=${encodeURIComponent(conversationId)}`, { headers });
      return reply.messages.map(message => ({ id: message.id, from: message.role === 'user' ? 'me' as const : 'bot' as const, text: message.text, at: Date.parse(message.at),
        ...splitMemo(message.cards), ...(message.attachment ? { attachment: message.attachment } : {}) }));
    },
    async send(input, onDelta, signal, onCards) {
      active(signal);
      // A questions card is part of what เลขา said, so the next answer is read against it; a file sent earlier comes
      // back as what was read from it (the file itself is never sent again).
      const earlier = input.history.slice(0, -1).filter(message => !message.failed && (message.text.trim() || message.memo || message.attachment))
        .slice(-12).map(message => ({ role: message.from === 'me' ? 'user' as const : 'assistant' as const, text: historyText(message) }))
        .filter(turn => turn.text.trim());
      let reply: LiveReply;
      try {
        reply = await post<LiveReply>({ action: 'message', text: input.text.slice(0, 6000), history: earlier, ...(input.conversationId === LINE_THREAD_ID ? { thread: 'line' } : /^c_[0-9a-f-]{36}$/.test(input.conversationId) ? { conversationId: input.conversationId } : {}), ...(input.context ? { pageName: input.context.pageName.slice(0, 40) } : {}), ...(input.attachment ? { attachment: input.attachment } : {}) }, signal);
      } catch (error) {
        active(signal);
        const status = (error as { status?: number }).status;
        const code = (error as { code?: string }).code;
        // Plan, token and pause answers are messages for the person, not connection failures.
        if (status === 402 || status === 403 || (status === 503 && code !== 'ai_provider') || code?.startsWith('ai_file')) {
          const used = code === 'ai_tokens_used' || code === 'ai_trial_used' ? balance.remaining : 0;
          balance = { ...balance, remaining: balance.remaining - used };
          return { text: (error as Error).message, tokensUsed: used };
        }
        throw new AssistantRequestError((error as Error).message || 'offline');
      }
      active(signal);
      if (Array.isArray(reply.cards)) onCards?.(reply.cards);
      const parts = graphemes(reply.text);
      for (let shown = 0; shown < parts.length;) {
        active(signal);
        shown = options.instant ? parts.length : Math.min(parts.length, shown + 3);
        onDelta(parts.slice(0, shown).join(''));
        if (shown < parts.length) await wait(18, signal);
      }
      const remaining = reply.tokensLeft ?? reply.trialLeft ?? balance.remaining;
      const used = Math.max(0, balance.remaining - remaining);
      balance = { ...balance, remaining };
      return { text: reply.text, cards: reply.cards, tokensUsed: used, ...(reply.memo ? { memo: reply.memo.slice(0, 1500) } : {}) };
    },
    // Only the automatic-notifications thread (still a labelled sample); new chats start empty.
    async conversations() {
      const line = sampleConversations(Date.now()).filter(conversation => conversation.kind === 'line');
      try {
        const reply = await apiJson<{ conversations: { id: string; title: string; pinned: boolean; archived: boolean; updatedAt: string }[] }>('/api/assistant?view=conversations', { headers });
        const stored = reply.conversations.map(row => ({ id: row.id, title: row.title || tr('แชตใหม่'), group: groupOf(Date.parse(row.updatedAt)), sample: false,
          messages: [], pinned: row.pinned, archived: row.archived, loaded: false } satisfies Conversation));
        return [...line, ...stored];
      } catch { return line; }
    },
    async balance() { return { ...balance }; },
    async confirm(card, signal) {
      try {
        active(signal);
        const reply = await post<{ status: string; path?: string; documentId?: string }>({ action: 'confirm', proposalId: card.id }, signal);
        active(signal);
        options.onApplied?.();
        return { ok: true, ...(typeof reply.path === 'string' ? { path: reply.path } : {}), ...(typeof reply.documentId === 'string' ? { documentId: reply.documentId } : {}) };
      } catch { return { ok: false }; }
    },
    async cancel(card) {
      if (getCurrentAccount() !== options.account) return;
      await post({ action: 'cancel', proposalId: card.id }).catch(() => undefined);
    },
    async revise(card, edits) {
      if (getCurrentAccount() !== options.account) throw new AssistantRequestError(tr('บัญชีที่ใช้อยู่เปลี่ยนไปแล้ว'));
      const reply = await post<{ card: ConfirmCard }>({ action: 'revise', proposalId: card.id, edits });
      if (reply?.card?.kind !== 'confirm') throw new AssistantRequestError(tr('แก้รายการนี้ไม่สำเร็จ'));
      return reply.card;
    },
    async remove(conversationIds) {
      const ids = conversationIds.filter(id => /^c_[0-9a-f-]{36}$/.test(id));
      if (ids.length) await post({ action: 'conversations-delete', ids });
    },
    async update(conversationId, change) {
      if (/^c_[0-9a-f-]{36}$/.test(conversationId)) await post({ action: 'conversation-update', id: conversationId, ...change });
    },
  };
}

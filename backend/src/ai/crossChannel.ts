import type { ChatTurn } from './types.js';

// Package E of the learning plan (owner, 2026-10-25: "ทำเลย"): a task left unfinished in one channel continues in the
// other. When the account's most recent exchange was in the other channel (the app's chat or LINE) within the last two
// hours, and เลขา's last answer there asked something or left a card that is still waiting, those turns join this
// message's history, marked with where they were said. Nothing new is stored: the app's turns come from the account's
// chat history, LINE's from its short history. Only this account's own messages, read with the signed-in user id.

export const CONTINUE_WINDOW_MS = 2 * 3600_000;
const MAX_TURNS = 4;
const MAX_TURN_CHARS = 600;

/** One turn as either channel keeps it: the app's chat rows (cards, attachment) or LINE's history (text only). */
export interface ChannelTurn {
  role: 'user' | 'assistant';
  text: string;
  cards?: { kind: string; id?: string; title?: string; text?: string; questions?: { text: string }[] }[];
  attachment?: { name: string } | null;
}

// Words that ask the user something (the routing policy's signals, without its "- question" lines).
const ASK_WORDS = /(\?|ไหม|มั้ย|หรือเปล่า|หรือไม่|รบกวน|ขอ(?:ข้อมูล|ชื่อ|วันที่|รายละเอียด)|ระบุ|แจ้ง)/;
// Polite closers that ask nothing about the task: "มีอะไรให้ช่วยเพิ่มเติมไหมครับ", "หากต้องการแก้ไขแจ้งได้เลยครับ".
const CLOSERS = [
  /(?:มีอะไร|ต้องการ|อยาก)[^\n?]{0,20}?ช่วย[^\n?]{0,12}?(?:ไหม|มั้ย)[^\n]{0,8}/g,
  /หาก(?:ต้องการ|มี)[^\n]{0,40}?(?:แจ้ง|บอก|สอบถาม|พิมพ์)[^\n]{0,24}/g,
];
// A questions card, as the app writes it into history: "- question" lines after the text.
const QUESTION_LINE = /\n- \S/;
/** A confirmation card in a text-only history (LINE keeps it this way, see lineHistoryText). */
const CARD_MARK = /\[การ์ดรอยืนยัน:/;

const withoutClosers = (text: string) => CLOSERS.reduce((rest, closer) => rest.replace(closer, ''), text);

/** The turn as the browser writes it into history (assistantApi historyText): file note, text, file mark, questions. */
export function turnText(turn: ChannelTurn): string {
  const memo = turn.role === 'assistant' ? (turn.cards ?? []).find(card => card.kind === 'memo' && card.text)?.text : undefined;
  const asked = (turn.cards ?? []).flatMap(card => (card.kind === 'questions' ? (card.questions ?? []).map(question => `\n- ${question.text}`) : [])).join('');
  const cards = turn.role === 'assistant' ? (turn.cards ?? []).filter(card => card.kind === 'confirm').map(card => `\n[การ์ดรอยืนยัน: ${card.title ?? 'รายการ'}]`).join('') : '';
  const file = turn.role === 'user' && turn.attachment?.name ? ` [แนบไฟล์: ${turn.attachment.name}]` : '';
  return `${memo ? `[อ่านจากไฟล์ที่แนบ: ${memo}]\n` : ''}${turn.text}${file}${asked}${cards}`;
}

/** What LINE keeps of an answer in its short history: the text, its questions and any card waiting there. */
export function lineHistoryText(text: string, cards: ChannelTurn['cards'] = []): string {
  return turnText({ role: 'assistant', text, cards: cards.filter(card => card.kind === 'questions' || card.kind === 'confirm') });
}

/** The turn shows a confirmation card (as a card, or as LINE's mark of one). */
export function mentionsCard(turn: ChannelTurn | undefined): boolean {
  return Boolean(turn && turn.role === 'assistant' && ((turn.cards ?? []).some(card => card.kind === 'confirm') || CARD_MARK.test(turn.text)));
}

/** เลขา asked the user something in this turn: a questions card, its lines, or asking words (closers aside). */
export function asksQuestion(turn: ChannelTurn | undefined): boolean {
  if (!turn || turn.role !== 'assistant') return false;
  if ((turn.cards ?? []).some(card => card.kind === 'questions') || QUESTION_LINE.test(turn.text)) return true;
  return ASK_WORDS.test(withoutClosers(turn.text.replace(/^\[อ่านจากไฟล์ที่แนบ:[\s\S]*?\]\n/, '').replace(/\n\[การ์ดรอยืนยัน:[^\]]*\]/g, '')));
}

/**
 * เลขา's last word there asked the user something, or left a card still waiting. `waitingIds` is this account's
 * cards still pending; without it, a card counts as waiting. A card's own text is not read as a question.
 */
export function leftUnfinished(turns: ChannelTurn[], waitingIds?: Set<string>): boolean {
  const last = turns.at(-1);
  if (!last || last.role !== 'assistant') return false;
  if ((last.cards ?? []).some(card => card.kind === 'questions') || QUESTION_LINE.test(last.text)) return true;
  if (mentionsCard(last)) {
    if (!waitingIds) return true;
    const ids = (last.cards ?? []).filter(card => card.kind === 'confirm' && card.id).map(card => card.id!);
    // LINE's mark has no id: any card still waiting for this account counts.
    return ids.length ? ids.some(id => waitingIds.has(id)) : waitingIds.size > 0;
  }
  return asksQuestion(last);
}

/**
 * A typed go-ahead ("ยืนยัน", "ได้เลย") may show the waiting cards only when เลขา's last word was not a question: a
 * "ใช่" that answers "หัก ณ ที่จ่าย 3% ไหมครับ" goes to เลขา as an answer.
 */
export function goAheadFits(lastAssistant: ChannelTurn | undefined): boolean {
  if (!lastAssistant) return true;
  if ((lastAssistant.cards ?? []).some(card => card.kind === 'questions') || QUESTION_LINE.test(lastAssistant.text)) return false;
  return mentionsCard(lastAssistant) || !asksQuestion(lastAssistant);
}

const minutesAgo = (at: number, now: number) => Math.max(1, Math.round((now - at) / 60_000));
const where = (channel: 'app' | 'line') => (channel === 'app' ? 'ในแอป' : 'ใน LINE');

/**
 * The other channel's unfinished exchange to carry into this message, or undefined. `appAt` and `lineAt` are when each
 * channel last spoke (ms); the carried turns must be newer than this channel's own, inside the window.
 */
export function continuationTurns(input: {
  channel: 'app' | 'line'; appTurns: ChannelTurn[]; appAt: number | null; lineTurns: ChannelTurn[]; lineAt: number | null; now: number;
  waitingIds?: Set<string>;
}): { from: 'app' | 'line'; turns: ChatTurn[]; last: ChannelTurn } | undefined {
  const from = input.channel === 'line' ? 'app' as const : 'line' as const;
  const turns = from === 'app' ? input.appTurns : input.lineTurns;
  const at = from === 'app' ? input.appAt : input.lineAt;
  const own = from === 'app' ? input.lineAt : input.appAt;
  if (!turns.length || at === null || input.now - at > CONTINUE_WINDOW_MS || (own !== null && own >= at) || !leftUnfinished(turns, input.waitingIds)) return undefined;
  const recent = turns.slice(-MAX_TURNS);
  return {
    from,
    last: turns.at(-1)!,
    turns: recent.map((turn, index) => {
      const text = turnText(turn).slice(0, MAX_TURN_CHARS);
      // A file note stays first, as the gateway reads it; the channel mark follows it.
      const note = /^\[อ่านจากไฟล์ที่แนบ:[\s\S]*?\]\n/.exec(text)?.[0] ?? '';
      const label = index === 0 ? `(ต่อจากที่คุย${where(from)} เมื่อ ${minutesAgo(at, input.now)} นาทีก่อน) ` : `(${where(from)}) `;
      return { role: turn.role, text: `${note}${label}${text.slice(note.length)}` };
    }),
  };
}

/** "ยืนยัน", "ตกลง", "โอเค": a short go-ahead, answered by showing the cards still waiting (no model call). */
export const GO_AHEAD = /^(?:ยืนยัน(?:รายการ)?(?:\s*ทั้งหมด)?|ตกลง|โอเค|ok|okay|ใช่|ได้เลย|เอาเลย|confirm(?:\s+all)?|(?:บันทึก|ลบ)\s*ทั้งหมด(?:เลย)?)(?:\s|ครับ|ค่ะ|คะ|นะ|เลย|จ้า|ด้วย|!|\.)*$/i;
/** Cards waiting at most this old are shown again (a proposal expires unconfirmed after 30 minutes). */
export const PENDING_WINDOW_MS = 30 * 60_000;

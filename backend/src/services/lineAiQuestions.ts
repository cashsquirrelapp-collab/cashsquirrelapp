import type { AskQuestion } from '../../../shared/askQuestions.js';
import { thaiDateAnswer } from '../../../shared/askQuestions.js';
import type { LineMessage } from './line.js';
import { parseThaiDate, QUESTION_DATE_DATA } from './lineJobQuestions.js';

// When เลขากระรอก itself needs to ask in LINE, its questions come one at a time, each a short line with taps, the way the
// chat asks about a record (owner, 2026-11-14: "กูไม่ชอบลักษณะการถามเลย" about a numbered list with "(ไม่ระบุ)"). The
// answers are kept in the account's private state until the last one, then all of them go to เลขา together as one message:
// the questions in between cost no tokens.

export interface PendingAiQuestions {
  at: string;
  questions: Array<Pick<AskQuestion, 'text' | 'options' | 'kind' | 'terms'> & { known?: string }>;
  answers: string[];
}
const LIFETIME_MS = 30 * 60_000;
type Tap = { type: 'action'; action: Record<string, unknown> };
const clip = (text: string, size: number) => ([...text].length > size ? `${[...text].slice(0, size - 1).join('')}…` : text);
const say = (label: string, text = label): Tap => ({ type: 'action', action: { type: 'message', label: clip(label, 20), text: text.slice(0, 300) } });
// An option that only says "not said" is the skip tap, never a choice of its own.
const NOT_SAID = /^(?:ไม่ระบุ|ไม่มี|ข้าม|-)$/u;

/** What to keep of เลขา's questions card. */
export function pendingAiQuestions(questions: AskQuestion[], now = new Date()): PendingAiQuestions {
  return { at: now.toISOString(), answers: [],
    questions: questions.slice(0, 6).map(question => ({ text: question.text.slice(0, 300), options: question.options.slice(0, 10), kind: question.kind, terms: question.terms?.slice(0, 6),
      ...(question.prefill?.name ? { known: question.prefill.name.slice(0, 120) } : {}) })) };
}

export function activeAiQuestions(state: unknown, now = Date.now()): PendingAiQuestions | null {
  const value = state as PendingAiQuestions | undefined;
  if (!value || !Array.isArray(value.questions) || !Array.isArray(value.answers) || value.answers.length >= value.questions.length) return null;
  const at = Date.parse(value.at);
  return Number.isFinite(at) && now - at >= 0 && now - at < LIFETIME_MS ? value : null;
}

/** One of เลขา's questions as a short line with taps; the first says how many there are. */
export function aiQuestionMessage(state: Pick<PendingAiQuestions, 'questions' | 'answers'>, today: string): LineMessage {
  const index = state.answers.length;
  const question = state.questions[index];
  const count = state.questions.length > 1 ? ` (${index + 1}/${state.questions.length})` : '';
  const text = question.text.trim() + count;
  const choices = question.options.filter(option => !NOT_SAID.test(option.trim()));
  const pick: Tap = { type: 'action', action: { type: 'datetimepicker', label: 'เลือกวันที่', data: QUESTION_DATE_DATA, mode: 'date', initial: today } };
  const taps: Tap[] = question.kind === 'date' ? [say('วันนี้'), say('พรุ่งนี้'), pick]
    : question.kind === 'payment' ? [say('ไม่มีเครดิตเทอม'), ...(question.terms ?? []).map(term => say(`เครดิตเทอม ${term} วัน`)), pick]
    : choices.map(option => say(option));
  const hint = question.kind === 'party' ? `\nพิมพ์ชื่อ ที่อยู่ เลขผู้เสียภาษี และโทรศัพท์มาในข้อความเดียว ไม่มีก็เว้นได้${question.known ? `\nที่มีแล้ว: ${question.known}` : ''}` : '';
  return { type: 'text', text: `${text}${hint}`, quickReply: { items: [...taps, say('ข้าม')].slice(0, 13) } } as LineMessage;
}

/** The answer to the question waiting. With more to ask: the next question; after the last: the answers for เลขา.
 *  Null when the message is not an answer (long, or a question of its own): the waiting questions are dropped. */
export function answerAiQuestion(state: PendingAiQuestions, input: string, today: string):
  | { state: PendingAiQuestions; next: LineMessage }
  | { composed: string }
  | null {
  const text = input.trim();
  if (!text || text.length > 400 || /[\r\n]/.test(text)) return null;
  const question = state.questions[state.answers.length];
  const skipped = /^(?:ข้าม|ไม่ระบุ|ไม่มี|ไม่รู้|ยังไม่รู้|-)$/u.test(text);
  const day = question.kind === 'date' || question.kind === 'payment' ? parseThaiDate(text, today) : null;
  const answer = skipped ? 'ไม่ระบุ' : day ? (question.kind === 'payment' ? `ชำระวันไหน: ${thaiDateAnswer(day)}` : thaiDateAnswer(day)) : text;
  const answers = [...state.answers, answer];
  if (answers.length < state.questions.length) {
    const next = { ...state, answers };
    return { state: next, next: aiQuestionMessage(next, today) };
  }
  return { composed: ['ตอบคำถาม:', ...state.questions.map((item, index) => `- ${item.text.replace(/\s*[?？]\s*$/u, '')}: ${answers[index]}`)].join('\n') };
}


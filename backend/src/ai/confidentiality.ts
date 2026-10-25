import { confidentialAnswer, techQuestion } from './founderKnowledge.js';

// Part 3 of the owner's Master Product Backlog (2026-10-25): what เลขา says is checked on the server before anyone sees
// it, in the app and in LINE, for every account. A prompt rule alone is not enough. The check removes:
// - names of AI providers and models (the processors stay listed in the privacy policy, as the law requires; เลขา
//   points there instead);
// - the system's internals (instruction versions, routing, table names);
// - anything shaped like a key or token, which is masked.
// A name that is the user's own data (a client called "Claude", a job called "Gemini") is left alone.

const MODEL = /(?:\bchat\s?gpt\b|\bgpt[\s-]?\d[\w.-]*|\bopenai\b|\bgemini\b(?:[\s-](?:\d[\w.]*|pro|flash|ultra|nano))*(?:[\s-]lite)?|\bclaude\b(?:[\s-](?:\d[\w.]*|sonnet|opus|haiku))*|\banthropic\b|\bsonnet\b(?:[\s-]\d[\w.]*)?|\bflash[\s-]lite\b|\bdeepmind\b|\bllama\s?\d*\b|\bmistral\b|\bgrok\b|\bdeepseek\b|เจมิไน|เจมินี่|คล็อด|แอนโทรปิก|โอเพนเอไอ|ซอนเน็ต)/gi;
const INTERNAL = /(?:system\s?prompt|ซิสเต็ม\s?พร(?:อ|้อ)มต์|\bsecretary-v\d+\b|\brouting[-_ ]?(?:v\d|policy)\b|\bPROMPT_VERSION\b|\bAI_[A-Z_]{4,}\b|\bcashflow_[a-z_]{3,}\b|\bfounder-\d{4}-\d{2}-\d{2}\.\d+\b|\bkb-\d{4}-\d{2}-\d{2}\.\d+\b)/gi;
const SECRET = /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|[sr]k_(?:live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,})\b/g;
const MASK = '[ซ่อนไว้]';
const MODEL_ONE = new RegExp(MODEL.source, 'i');
const INTERNAL_ONE = new RegExp(INTERNAL.source, 'i');

export type GuardHit = 'model' | 'internal' | 'secret';
export interface GuardResult { text: string; hits: GuardHit[] }

/** A part of the answer: a line, or a sentence of a longer line. */
function pieces(text: string): string[] {
  return text.split(/(\n+)/).flatMap(part => (/^\n+$/.test(part) ? [part] : part.split(/(?<=[.!?。])\s+(?=\S)/)));
}

/**
 * Checks one answer. `userData` gives the account's own names (lower case) when a name matches, so the user's own
 * client or job names are never removed; it is only read when something matched. `userText` is the message being
 * answered: when it asks about the technology, the owner's line is added in place of what was removed.
 */
export function guardReply(text: string, options: { userText?: string; userData?: () => string } = {}): GuardResult {
  if (!text) return { text, hits: [] };
  const hits = new Set<GuardHit>();
  let out = text.replace(SECRET, () => { hits.add('secret'); return MASK; });

  let data: string | undefined;
  const own = (word: string) => {
    data ??= (options.userData?.() ?? '').toLowerCase();
    return data.includes(word.toLowerCase().trim());
  };
  const flagged = (piece: string) => {
    let found = false;
    for (const match of piece.matchAll(MODEL)) if (!own(match[0])) { hits.add('model'); found = true; }
    if (INTERNAL_ONE.test(piece)) { hits.add('internal'); found = true; }
    return found;
  };

  const parts = pieces(out);
  const kept: string[] = [];
  for (const part of parts) {
    if (/^\n+$/.test(part)) kept.push(part);
    // A whole line taken out takes its line break with it.
    else if (flagged(part)) { if (/^\n+$/.test(kept.at(-1) ?? '')) kept.pop(); }
    else kept.push(part);
  }
  if (hits.has('model') || hits.has('internal')) {
    const rest = kept.join(' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    const lengthLeft = rest.replace(/\s+/g, '').length;
    const asked = options.userText ? techQuestion(options.userText) ?? (MODEL_ONE.test(options.userText) ? 'technology' : undefined) : undefined;
    const line = confidentialAnswer(asked ?? (hits.has('internal') && !hits.has('model') ? 'internals' : 'technology'), options.userText || text);
    // Little left (the answer was about itself): the owner's line alone. Otherwise the rest, plus the line when
    // the user asked about the technology.
    out = lengthLeft < Math.max(24, text.replace(/\s+/g, '').length * 0.35) ? line : asked ? `${rest}\n\n${line}` : rest;
  }
  return { text: out, hits: [...hits] };
}

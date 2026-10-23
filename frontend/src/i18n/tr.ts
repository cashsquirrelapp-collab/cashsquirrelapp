import { currentLanguage } from './currentLanguage';
import { EN } from './en';

// Translate by the Thai sentence itself (owner, 2026-10-22: English and Thai complete in every
// feature). In Thai the Thai text is returned unchanged, so Thai screens stay exactly as they were;
// in English the sentence is looked up in i18n/en. It is a plain function, not a hook: the whole app
// re-renders when the language changes (App reads the language context), so every tr() call is
// evaluated again. A Thai value from data, such as a default status name, can be passed at display
// time: tr(status.name) translates the known defaults and leaves anything the user typed as it is.
//
// Placeholders: tr('ค้างรับ {0} งาน', count) or tr('สวัสดี {name}', { name }).
export function tr(th: string, ...args: unknown[]): string {
  return currentLanguage === 'en' ? singular(fill(EN[th] ?? th, args)) : fill(th, args);
}

/**
 * Like tr, for the rare Thai word that needs different English in one place: the English is looked
 * up as "context|ไทย" first (trc('nav', 'ราคา') -> "Pricing" where tr('ราคา') -> "Price").
 */
export function trc(context: string, th: string, ...args: unknown[]): string {
  return currentLanguage === 'en' ? singular(fill(EN[`${context}|${th}`] ?? EN[th] ?? th, args)) : fill(th, args);
}

// English counts: "1 jobs" -> "1 job". Thai has no plural, so the entries are written in the plural
// and a lone 1 takes the singular here.
const PLURALS: Record<string, string> = {
  items: 'item', jobs: 'job', days: 'day', files: 'file', documents: 'document', clients: 'client', months: 'month',
  entries: 'entry', tools: 'tool', users: 'user', installments: 'installment', slips: 'slip', people: 'person',
  minutes: 'minute', weeks: 'week', years: 'year', goals: 'goal', receipts: 'receipt', payments: 'payment',
  'business days': 'business day',
};
const PLURAL_AFTER_ONE = new RegExp(`(^|[^\\d.,])1 (${Object.keys(PLURALS).sort((a, b) => b.length - a.length).join('|')})\\b`, 'g');
function singular(text: string): string {
  return text.includes('1 ') ? text.replace(PLURAL_AFTER_ONE, (_whole, before: string, word: string) => `${before}1 ${PLURALS[word]}`) : text;
}

function fill(text: string, args: unknown[]): string {
  if (!args.length) return text;
  // Named values ({name}) come as one plain object; numbered ones ({0}) as separate arguments.
  const named = args.length === 1 && !/\{\d+\}/.test(text) && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] as Record<string, unknown> : null;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => {
    // Positional values print exactly as a template literal would (undefined included), so Thai
    // output is unchanged from the code these calls replaced.
    if (!named && /^\d+$/.test(key)) return Number(key) < args.length ? String(args[Number(key)]) : whole;
    return named && key in named ? String(named[key]) : whole;
  });
}

/**
 * A message from the server, which always answers in Thai. Exact matches come from i18n/en; a message
 * with numbers in it ("…ในอีก 5 นาที") matches its entry with {0}, {1} in their place; a message that
 * starts with a known prefix ("… (รหัสอ้างอิง: " + code + ")") keeps the rest as it is. Anything else
 * is shown unchanged.
 */
export function trServer(message: string): string {
  if (currentLanguage !== 'en' || !message) return message;
  if (EN[message]) return EN[message];
  const numbers: string[] = [];
  const template = message.replace(/\d[\d,.]*/g, found => `{${numbers.push(found) - 1}}`);
  if (numbers.length && EN[template]) return fill(EN[template], numbers);
  for (const prefix of SERVER_PREFIXES) if (message.startsWith(prefix) && EN[prefix]) return EN[prefix] + message.slice(prefix.length);
  return message;
}
const SERVER_PREFIXES = ['สมัครสมาชิกไม่สำเร็จ กรุณาติดต่อผู้ดูแล (รหัสอ้างอิง: '];

/**
 * Marks a Thai string as translatable without translating it yet: for constants defined when a
 * module loads, which are translated where they are shown with tr(value). Returns the text as is.
 */
export function T(th: string): string {
  return th;
}

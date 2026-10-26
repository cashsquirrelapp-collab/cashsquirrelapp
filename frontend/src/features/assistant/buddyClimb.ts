import type { MascotMood } from '../../components/mascot/Mascot';
import { T, tr } from '../../i18n/tr';
import type { AssistantMode, ChatCard } from './assistantMock';

// When the corner squirrel climbs out of its ring on the "ถามเลขากระรอก ⌘K" pill, and what it says above its head
// (owner, 2026-10-26: "มุดออกมาจากวงกลมแล้วก็เกาะอยู่ ... จะมีคำโผล่มาบนหัวน้อง"). Only real events count: a send
// in progress, an answer that arrived while the chat was closed, a card waiting for a yes, a save the server
// confirmed, or something that failed. An answer is said in the squirrel's own words (owner, 2026-10-26: "น้องพิมพ์
// ออกมาเลยเป็นประโยค"): the start of the reply itself, typed out above its head. The other lines are fixed and formal.

/** Something that happened while the chat was closed, kept until the user opens it (or, for a save, a moment). */
export type BuddyNews = 'answered' | 'done' | 'failed' | null;

export type Climb = {
  /** Which line it is, for tests and for replaying the words when they change. */
  kind: 'thinking' | 'working' | 'failed' | 'awaiting' | 'done' | 'answered' | 'hello';
  mood: MascotMood;
  /** Thai, shown through tr(); or, when `said`, the reply's own words, shown as they are. */
  words: string;
  /** A row of dots after the words (still thinking). */
  dots?: boolean;
  /** The words are the squirrel's answer (from the reply), not a fixed line. */
  said?: boolean;
};

/** Thai letters carry vowel and tone marks; counting by grapheme keeps each letter whole. */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' | 'word' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg('th', { granularity: 'grapheme' }).segment(text), part => part.segment) : Array.from(text);
}

/** The start of a reply as one plain sentence for the speech bubble: no Markdown, tables, pictures or link targets,
 *  cut at a word (Thai has no spaces, so words come from Intl.Segmenter) with "…" when it goes on. */
export function speechPreview(markdown: string, max = 84): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n').filter(line => !/^\s*\|/.test(line)).join('\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+•]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\s+/g, ' ')
    // An amount stays in one piece: "฿ 18,450" (as LINE cards write it) becomes "฿18,450", and "-฿" never splits.
    .replace(/฿ (?=[\d-])/g, '฿')
    .replace(/-฿/g, '-\u2060฿')
    .trim();
  if (graphemes(plain).length <= max) return plain;
  const Seg = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: 'word' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  let cut = '';
  if (Seg) {
    for (const { segment } of new Seg('th', { granularity: 'word' }).segment(plain)) {
      if (graphemes(cut + segment).length > max) break;
      cut += segment;
    }
  }
  if (!cut.trim()) cut = graphemes(plain).slice(0, max).join('');
  return `${cut.trimEnd()}…`;
}

/** An answer that is only a card (a LINE summary, a document, a draft to confirm) is said from the card: LINE's own
 *  one-line banner text, or the card's main facts. */
export function cardSpeech(cards?: ChatCard[]): string {
  const card = cards?.find(item => item.kind !== 'navigation') ?? cards?.[0];
  if (!card) return '';
  switch (card.kind) {
    case 'line': return card.card.alt || card.card.title;
    case 'summary': return tr("{0} รายรับ {1} รายจ่าย {2} คงเหลือ {3}", card.period, card.income, card.expense, card.balance);
    case 'money_chart': return card.title;
    case 'document': return [card.docType, card.number, card.client].filter(Boolean).join(' · ');
    case 'project': return [card.name, card.client].filter(Boolean).join(' · ');
    case 'confirm': return card.title;
    case 'questions': return card.questions[0]?.text ?? '';
    case 'navigation': return card.label;
    case 'official_link': return card.title;
    default: return '';
  }
}

/** Most important first, as the brief orders them: what is happening now, then failures, then a card waiting for a
 *  yes, then a save, then an unread answer, and a hello only while the pointer rests on the pill. */
export function climbFor({ mode, pending, news, hover, reply = '' }: { mode: AssistantMode; pending: boolean; news: BuddyNews; hover: boolean; reply?: string }): Climb | null {
  const said = reply.trim();
  if (mode === 'thinking') return { kind: 'thinking', mood: 'thinking', words: T("กำลังคิด"), dots: true };
  if (mode === 'working') return said ? { kind: 'working', mood: 'happy', words: said, said: true } : { kind: 'working', mood: 'happy', words: T("กำลังพิมพ์คำตอบ") };
  if (news === 'failed') return { kind: 'failed', mood: 'worried', words: T("ยังไม่สำเร็จ ดูรายละเอียดในแชต") };
  if (pending) return said ? { kind: 'awaiting', mood: 'checking', words: said, said: true } : { kind: 'awaiting', mood: 'checking', words: T("ร่างเสร็จแล้ว กรุณาตรวจก่อนยืนยัน") };
  if (news === 'done') return { kind: 'done', mood: 'proud', words: T("บันทึกเรียบร้อยแล้ว") };
  if (news === 'answered') return said ? { kind: 'answered', mood: 'happy', words: said, said: true } : { kind: 'answered', mood: 'happy', words: T("คำตอบพร้อมแล้ว") };
  if (hover) return { kind: 'hello', mood: 'happy', words: T("มีอะไรให้ช่วยไหมครับ") };
  return null;
}

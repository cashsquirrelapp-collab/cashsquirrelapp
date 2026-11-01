import { WHATS_NEW, type WhatsNewEntry } from '../../../shared/whatsNew.js';
import { UI_MAP } from './generated/uiMap.js';
import { KNOWLEDGE_BASE, launched } from './knowledgeBase.js';

// เลขากระรอก learns the app by itself (owner, 2026-11-01: "เวลามีฟีเจอร์อะไรอัปเดตเข้าไป น้องค่อนข้างจะไม่รู้ ... อยากให้
// น้องอัปเดตได้เอง"). Two sources that change with every release, no one rewriting the knowledge base by hand:
// - the words each page shows (generated/uiMap.ts, read from the screens' own code by scripts/build-ui-map.mjs), so a
//   new button or setting is found by its label the day it ships;
// - shared/whatsNew.ts, the customer-facing release notes.
// Both answer only for pages open to everyone (launched()).

export interface UiHit { area: string; name: string; route: string; texts: string[] }

/** The page name and address of each navigation key, from the knowledge base (its first entry for that page). */
const PAGES: ReadonlyMap<string, { name: string; route: string }> = (() => {
  const map = new Map<string, { name: string; route: string }>();
  for (const feature of KNOWLEDGE_BASE.features) if (!map.has(feature.navigation)) map.set(feature.navigation, { name: feature.name_th, route: feature.route });
  return map;
})();

// Words that say nothing about a screen: question words, particles, and the app itself.
const STOP = new Set(['ได้', 'ไหม', 'มั้ย', 'ยังไง', 'อย่างไร', 'ตรงไหน', 'ที่ไหน', 'อยู่', 'ใน', 'ของ', 'และ', 'หรือ', 'ให้', 'ที่', 'มี', 'ไม่', 'การ',
  'ครับ', 'ค่ะ', 'คะ', 'นะ', 'หน่อย', 'จะ', 'เป็น', 'ว่า', 'แล้ว', 'กับ', 'ก็', 'อยาก', 'ต้อง', 'ทำ', 'ไง', 'ไหน', 'บ้าง', 'อะไร', 'เมนู', 'หน้า',
  'ปุ่ม', 'แอป', 'เว็บ', 'ตรง', 'วิธี', 'ช่วย', 'บอก', 'หา', 'เจอ', 'เข้า', 'ไป', 'มา', 'เรา', 'ผม', 'ฉัน', 'กู', 'หนู', 'นี้', 'นั้น', 'คือ',
  'เลขา', 'กระรอก', 'ตุนเงิน', 'krarok', 'app', 'how', 'where', 'the', 'can', 'what']);

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new (Intl as unknown as { Segmenter: new (locale: string, options: { granularity: 'word' }) => { segment: (text: string) => Iterable<{ segment: string; isWordLike?: boolean }> } }).Segmenter('th', { granularity: 'word' })
  : null;

/** The meaningful words of a question (Thai has no spaces between words). */
export function questionWords(text: string): string[] {
  const lower = text.toLowerCase();
  const parts = segmenter
    ? Array.from(segmenter.segment(lower), part => (part.isWordLike === false ? '' : part.segment))
    : lower.split(/[^a-z0-9฀-๿]+/);
  return [...new Set(parts.map(part => part.trim()).filter(part => part.length >= 2 && !STOP.has(part) && !/^[\d.,]+$/.test(part)))];
}

const ALL_TEXTS: readonly string[] = Object.values(UI_MAP).flat().map(text => text.toLowerCase());

/**
 * The open pages whose own labels match the question best, with those labels. A word used on many screens ("งาน")
 * counts little; a rare one ("โหมดมืด") counts a lot. Nothing is returned for a question no label is about.
 */
export function uiLookup(question: string, limit = 2): UiHit[] {
  const words = questionWords(question);
  if (!words.length) return [];
  const total = ALL_TEXTS.length || 1;
  const weight = new Map(words.map(word => {
    const seen = ALL_TEXTS.reduce((count, text) => count + (text.includes(word) ? 1 : 0), 0);
    return [word, seen ? Math.log(total / seen) : 0] as const;
  }));
  // At least one word as rare as a feature's own name (on 40 labels or fewer of the whole app).
  const rare = Math.log(total / 40);
  if (![...weight.values()].some(value => value >= rare)) return [];
  const hits: (UiHit & { score: number })[] = [];
  for (const [area, texts] of Object.entries(UI_MAP)) {
    if (!launched(area)) continue;
    const scored = texts.map(text => {
      const lower = text.toLowerCase();
      return { text, score: words.reduce((sum, word) => sum + (lower.includes(word) ? weight.get(word)! : 0), 0) };
    }).filter(row => row.score >= rare).sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    if (!scored.length) continue;
    const page = PAGES.get(area) ?? { name: area, route: `/${area}/{workspace}` };
    hits.push({ area, name: page.name, route: page.route, texts: scored.slice(0, 6).map(row => row.text), score: scored.slice(0, 3).reduce((sum, row) => sum + row.score, 0) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, limit)).map(({ score: _score, ...hit }) => hit);
}

const NEWS = /(อะไรใหม่|มีอะไรใหม่|ใหม่ล่าสุด|อัปเดต|อัพเดท|อัพเดต|อัปเดท|ฟีเจอร์ใหม่|เพิ่มอะไร|เปลี่ยนอะไร|what'?s new|\bupdates?\b|changelog)/i;

/** The release notes for open pages: all recent ones when the user asks what is new, else those of the pages asked about. */
export function whatsNew(question: string, areas: readonly string[] = [], now = Date.now()): WhatsNewEntry[] {
  const open = WHATS_NEW.filter(entry => launched(entry.area));
  if (NEWS.test(question)) return open.slice(0, 8);
  const recent = now - 21 * 86_400_000;
  return open.filter(entry => areas.includes(entry.area) && Date.parse(`${entry.date}T00:00:00+07:00`) >= recent).slice(0, 2);
}

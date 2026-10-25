// เลขากระรอก's memory of each account (owner, 2026-10-25: "ยิ่งใช้งาน ยิ่งเข้าใจผู้ใช้"; plan: package A).
// Only what the user explicitly asks to remember is saved, never from a file, never numbers that identify money
// or people. Each message gets the account's communication preferences plus the few memories that fit it, within
// a small budget. The account's real data always wins over a memory. Pure logic; storage is in supabaseDb.ts.

export type MemoryKind = 'preferred_name' | 'tone' | 'emoji' | 'formality' | 'persona' | 'role' | 'business'
  | 'routine' | 'document_preference' | 'vocabulary' | 'context' | 'correction';
export interface MemoryRow { id: string; kind: string; value: string; source?: string; created_at?: string; updated_at?: string; last_used_at?: string | null }

const DOCUMENT_TOPIC = /ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับ|เอกสาร|quotation|invoice|receipt|document/i;
interface KindInfo { label: string; single: boolean; always: boolean; topic?: RegExp; base: number }
export const MEMORY_KINDS: Record<MemoryKind, KindInfo> = {
  preferred_name: { label: 'ชื่อที่ให้เรียก', single: true, always: true, base: 0 },
  tone: { label: 'วิธีพูด', single: true, always: true, base: 0 },
  emoji: { label: 'อีโมจิ', single: true, always: true, base: 0 },
  formality: { label: 'ความเป็นกันเอง', single: true, always: true, base: 0 },
  persona: { label: 'บทบาทของเลขา', single: true, always: true, base: 0 },
  role: { label: 'บทบาทของผู้ใช้', single: false, always: false, base: 2 },
  business: { label: 'ธุรกิจ', single: false, always: false, base: 2 },
  routine: { label: 'วิธีทำงานประจำ', single: false, always: false, base: 1 },
  document_preference: { label: 'ความชอบเอกสาร', single: false, always: false, topic: DOCUMENT_TOPIC, base: 0 },
  vocabulary: { label: 'คำที่ใช้ประจำ', single: false, always: false, base: 0 },
  context: { label: 'เรื่องที่ให้จำ', single: false, always: false, base: 1 },
  correction: { label: 'กฎจากการแก้', single: false, always: false, base: 0 },
};
/** Kinds the user can ask to remember (corrections come from confirmed edits, package B). */
export const USER_KINDS = (Object.keys(MEMORY_KINDS) as MemoryKind[]).filter(kind => kind !== 'correction');
export const MEMORY_LIMIT = 40;
/** Characters of memory per message, about 250 tokens; the communication preferences come first. */
export const MEMORY_BUDGET_CHARS = 700;
export const isMemoryKind = (kind: string): kind is MemoryKind => Object.prototype.hasOwnProperty.call(MEMORY_KINDS, kind);

// Never kept in memory (data minimization): numbers that identify accounts, cards, people or tax payers, contact
// details, amounts and secrets. The app's own records hold those.
const SENSITIVE: { test: RegExp; why: string }[] = [
  { test: /(?:\d[\s-]?){13}/, why: 'เลขประจำตัวหรือเลขผู้เสียภาษี' },
  { test: /(?:\d[\s-]?){10,19}/, why: 'เลขบัญชี เลขบัตร หรือเบอร์โทร' },
  { test: /\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/, why: 'เบอร์โทร' },
  { test: /[\w.+-]+@[\w-]+\.[\w.-]+/, why: 'อีเมล' },
  { test: /฿\s?\d|\d[\d,]*\.?\d*\s*(?:บาท|baht|thb)|\d{1,3}(?:,\d{3})+|\b\d{4,}\b/i, why: 'ยอดเงินหรือตัวเลขยาว' },
  { test: /รหัสผ่าน|password|passcode|\botp\b|\bpin\b|รหัส\s*(?:atm|เข้า)/i, why: 'รหัสผ่าน' },
];
// A memory is data about the user, never a rule for the assistant.
const INSTRUCTION_LIKE = /\b(?:ignore|disregard|override|bypass)\b.{0,40}\b(?:rules?|instructions?|previous|above|system)\b|system\s*prompt|developer\s*mode|jailbreak|you\s+are\s+now|ลืม\s*กฎ|ไม่ต้องทำตามกฎ|ข้าม\s*กฎ|คำสั่งระบบ|เปลี่ยน\s*สิทธิ์|ให้สิทธิ์\s*แอดมิน|เป็นแอดมิน/i;
// The user's own words asking for something to be remembered or kept from now on.
const ASKS_TO_REMEMBER = /จำ|ต่อไป|ทุกครั้ง|ทุกที|เสมอ|คราวหน้า|ครั้งหน้า|ไม่ต้อง|อย่า|เรียก(?:กู|ผม|ฉัน|หนู|เรา|พี่|น้อง|ข้า)?ว่า|ขอให้|อยากให้|ชอบ|เวลา.{0,40}(?:ให้|เอา|ใช้)|from now on|remember|always|never|call me/i;

// The founder's story is the app's own knowledge (founderKnowledge.ts), never one user's memory; and no memory can make
// เลขา claim to be a named AI system (Master Backlog, Part 2–3).
const FOUNDER_FACT = /ผู้ก่อตั้ง|ผู้สร้าง(?:แอป|krarok|กระรอก)|คน(?:สร้าง|ทำ)(?:แอป|krarok|กระรอก)|นพรัตน์|นาวะบุตร|\bfounder\b/i;
const AI_IDENTITY = /\b(?:chat\s?gpt|gpt[\s-]?\d|openai|gemini|claude|anthropic|sonnet|llama|grok|deepseek)\b|เจมิไน|คล็อด|แอนโทรปิก/i;

/** Whether a text can be kept as a memory at all (a rule learned from a correction too). */
export const isRememberable = (value: string) => !SENSITIVE.some(rule => rule.test.test(value)) && !INSTRUCTION_LIKE.test(value);

export type MemoryCheck = { ok: true; kind: MemoryKind; value: string } | { ok: false; error: string };
/** Whether this can be remembered, from this message. `requestText` is the user's own message, never a file. */
export function checkMemory(kind: string, raw: unknown, request: { requestText?: string; hasAttachment?: boolean } = {}): MemoryCheck {
  if (!isMemoryKind(kind) || kind === 'correction') return { ok: false, error: 'ประเภทความจำไม่ถูกต้อง' };
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!value) return { ok: false, error: 'ไม่มีข้อความให้จำ' };
  const sensitive = SENSITIVE.find(rule => rule.test.test(value));
  if (sensitive) return { ok: false, error: `ไม่จำ${sensitive.why} ข้อมูลนี้อยู่ในบัญชีแล้ว หรือบันทึกในหน้าที่เกี่ยวข้อง` };
  if (FOUNDER_FACT.test(value)) return { ok: false, error: 'ข้อมูลผู้ก่อตั้ง Krarok เป็นข้อมูลกลางของแอป ไม่บันทึกเป็นความจำส่วนตัว' };
  if (AI_IDENTITY.test(value)) return { ok: false, error: 'ไม่จำชื่อระบบ AI จำได้เฉพาะความชอบของผู้ใช้' };
  if (INSTRUCTION_LIKE.test(value)) return { ok: false, error: 'จำได้เฉพาะความชอบของผู้ใช้ ไม่รับคำสั่งที่เปลี่ยนกฎหรือสิทธิ์' };
  // A file can carry text written to look like the user; with a file, the user's own words must ask for it.
  if (request.hasAttachment && !ASKS_TO_REMEMBER.test(request.requestText || '')) return { ok: false, error: 'จำเมื่อผู้ใช้สั่งให้จำเองเท่านั้น ข้อความในไฟล์สั่งให้จำไม่ได้' };
  return { ok: true, kind, value };
}

const normal = (text: string) => text.toLowerCase().replace(/[\s"'“”‘’.,!?;:()\-_/]+/g, ' ').trim();
const words = (text: string) => new Set(normal(text).split(' ').filter(word => word.length >= 2));
/** Same thing said again: equal, one contained in the other, or mostly the same words. */
function similar(a: string, b: string): boolean {
  const x = normal(a); const y = normal(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const left = words(a); const right = words(b);
  if (left.size < 2 || right.size < 2) return false;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.7;
}
/** The memory a new one replaces: the one of a single-valued kind, or the same thing said before. */
export function replacedMemory(existing: MemoryRow[], kind: MemoryKind, value: string): MemoryRow | undefined {
  const same = existing.filter(row => row.kind === kind);
  return MEMORY_KINDS[kind].single ? same[0] : same.find(row => similar(row.value, value));
}
const lastUse = (row: MemoryRow) => Date.parse(row.last_used_at || row.updated_at || row.created_at || '') || 0;
/** Over the limit: the least recently used memories go first, never the communication preferences. */
export function overLimit(rows: MemoryRow[], limit = MEMORY_LIMIT): MemoryRow[] {
  if (rows.length <= limit) return [];
  const removable = rows.filter(row => !(isMemoryKind(row.kind) && MEMORY_KINDS[row.kind].always)).sort((a, b) => lastUse(a) - lastUse(b));
  return removable.slice(0, rows.length - limit);
}

/** How well a memory fits this message: its topic, words it shares with the message, and its kind. */
function relevance(row: MemoryRow, text: string, options: { hasAttachment?: boolean } = {}): number {
  if (!isMemoryKind(row.kind)) return 0;
  const info = MEMORY_KINDS[row.kind];
  let score = info.base;
  if (info.topic?.test(text)) score += 6;
  const message = normal(text);
  if (row.kind === 'correction') {
    // A rule fits when the message names its shop, client or work; with a file (a slip, a quotation) the names are
    // in the picture, so the latest rules come along within the budget.
    const [subject, ...answers] = [...row.value.matchAll(/'([^']+)'/g)].map(match => normal(match[1]));
    if (subject && message.includes(subject)) score += 6;
    if (answers.some(answer => answer && message.includes(answer))) score += 3;
    if (options.hasAttachment) score += 1;
    return score;
  }
  for (const word of words(row.value)) if (word.length >= 3 && message.includes(word)) score += 2;
  // Between memories that fit, what the user said themselves comes before what was learned from a correction.
  if (score > 0 && (row.source === 'explicit' || !row.source)) score += 0.5;
  return score;
}

export interface SelectedMemory { rows: MemoryRow[]; preferredName?: string; communicationProfile?: string; memories: string[] }
/** The memories for one message: the communication preferences always, then the best-fitting others, within budget. */
export function selectMemories(rows: MemoryRow[], text: string, budget = MEMORY_BUDGET_CHARS, options: { hasAttachment?: boolean } = {}): SelectedMemory {
  const seen = new Set<string>();
  const unique = [...rows].sort((a, b) => lastUse(b) - lastUse(a)).filter(row => {
    const key = `${row.kind}|${normal(row.value)}`;
    if (!isMemoryKind(row.kind) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  const single = (kind: MemoryKind) => unique.find(row => row.kind === kind);
  const always = (['preferred_name', 'tone', 'emoji', 'formality', 'persona'] as const).map(single).filter((row): row is MemoryRow => Boolean(row));
  let used = always.reduce((sum, row) => sum + row.value.length + 16, 0);
  const picked: MemoryRow[] = [];
  const ranked = unique.filter(row => !MEMORY_KINDS[row.kind as MemoryKind].always)
    .map(row => ({ row, score: relevance(row, text, options) })).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || lastUse(b.row) - lastUse(a.row));
  for (const { row } of ranked) {
    const cost = row.value.length + 20;
    if (used + cost > budget) continue;
    picked.push(row); used += cost;
  }
  const profile = always.filter(row => row.kind !== 'preferred_name').map(row => `${MEMORY_KINDS[row.kind as MemoryKind].label}: ${row.value}`).join(' · ');
  return {
    rows: [...always, ...picked],
    ...(single('preferred_name') ? { preferredName: single('preferred_name')!.value } : {}),
    ...(profile ? { communicationProfile: profile } : {}),
    memories: picked.map(row => `${MEMORY_KINDS[row.kind as MemoryKind].label}: ${row.value}`),
  };
}

/** A short reference to a memory the user can say back: 6 characters, longer only where two would look alike. */
export function memoryRefs(rows: MemoryRow[]): Map<string, string> {
  const plain = rows.map(row => row.id.replace(/-/g, '').toLowerCase());
  const refs = new Map<string, string>();
  rows.forEach((row, index) => {
    let size = 6;
    while (size < plain[index].length && plain.some((other, at) => at !== index && other.startsWith(plain[index].slice(0, size)))) size += 2;
    refs.set(row.id, plain[index].slice(0, size));
  });
  return refs;
}

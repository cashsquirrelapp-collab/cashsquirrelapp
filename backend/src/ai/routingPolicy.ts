import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { renameRequest } from './rename.js';
import { ACTIONS, ANALYSIS, DEPENDS, MONEY_GOAL, RANKING, TARGET, VERY_LONG, needsSmartModel } from './difficulty.js';
import { founderTopic, techQuestion } from './founderKnowledge.js';
import { KNOWLEDGE_BASE } from './knowledgeBase.js';
import { FEATURES as PAGES } from './navigation.js';
import { routeMessage } from './router.js';
import type { ChatTurn, Route } from './types.js';

// Model routing version 2 (owner's brief "INTELLIGENT MODEL ROUTING V2", 2026-10-25). Each message is read on four
// axes with plain rules, no model call: what the user wants (intent), how hard it is, what it would change (risk) and
// how much it carries (context). From those come the model (Gemini for everyday work, Claude Sonnet for documents,
// deletes, important edits, complex additions, files, long texts and analysis), the tool set (talk or change data)
// and whether the light model may take over when Sonnet fails. Choosing Sonnet never lets it change data on its own:
// every change is still a card the user confirms. Some exact questions are answered without a model: where a page is,
// what to call the user / no emoji, who made Krarok and why (founderKnowledge.ts), and what AI is behind เลขา (the
// owner's line; Master Backlog Part 3). Version 1 (difficulty.ts + router.ts) stays for rollback: AI_ROUTING_POLICY=v1.

export const ROUTING_VERSIONS = { v1: 'routing-v1', v2: 'routing-v2' } as const;
export type RoutingPolicy = keyof typeof ROUTING_VERSIONS;

export type Intent = 'chat' | 'feature_help' | 'memory' | 'read' | 'analysis' | 'create' | 'payment' | 'update' | 'delete'
  | 'document' | 'import' | 'external' | 'file';
export type Complexity = 'low' | 'medium' | 'high';
export type Risk = 'read' | 'create' | 'update' | 'delete' | 'external';
export type ContextSize = 'short' | 'standard' | 'long' | 'file';
export type Tier = 'light' | 'smart';
export type Direct = 'knowledge' | 'memory' | 'founder' | 'confidential' | 'rename';

export interface Assessment { intent: Intent; complexity: Complexity; risk: Risk; context: ContextSize; asking: boolean }
export interface RoutingDecision extends Assessment {
  version: string;
  tier: Tier;
  tools: Route;
  /** A change the light model must not take over when Sonnet fails at run time (brief, phase 5). */
  smartRequired: boolean;
  /** Short code saved with the request: why this model. */
  reason: string;
  direct?: Direct;
}
export interface RouteInput { text: string; history?: ChatTurn[]; hasAttachment?: boolean; pendingConfirmation?: boolean }

const WRITES: ReadonlySet<Intent> = new Set(['create', 'payment', 'update', 'delete', 'document']);

// ---------- the four axes ----------
// How / where / can-it questions. "ช่วยเพิ่มงาน 5000 ให้หน่อยได้ไหม" is a polite request, not a question.
const ASKING = /(ตรงไหน|ที่ไหน|อยู่ไหน|หน้าไหน|เมนูไหน|ยังไง|อย่างไร|ทำไง|วิธี|ได้ไหม|ได้มั้ย|ได้ป่าว|ได้ปะ|ได้หรือเปล่า|มีไหม|มีมั้ย|คืออะไร|ได้กี่|หรือยัง|รึยัง|หรือเปล่า|รึเปล่า|(?:ไหม|มั้ย)\s*[?？]?\s*$|[?？]\s*$|\bhow\b|\bwhere\b|\bcan i\b|\bis there\b)/i;
const POLITE_REQUEST = /(ช่วย|รบกวน|ให้หน่อย|ให้ที|ให้ด้วย)/;
const POLITE_END = /(?:ได้ไหม|ได้มั้ย|ได้ป่าว|ได้ปะ)\s*(?:ครับ|คะ|ค่ะ|จ้า|นะ)?\s*[?？]?\s*$/;
const REAL_QUESTION = /(ตรงไหน|ที่ไหน|อยู่ไหน|ยังไง|อย่างไร|ทำไง|วิธี)/;
const CAN_IT = /(ได้ไหม|ได้มั้ย|มีไหม|มีมั้ย|ได้กี่)/;
const ABOUT_APP = /(แอป|เว็บ|เมนู|ฟีเจอร์|หน้า|ปุ่ม|ตั้งค่า|ฟังก์ชัน|ระบบ|ใช้งาน|\bapp\b|menu|feature|button|setting)/i;

const MEMORY = /(จำไว้|ช่วยจำ|จำว่า|จำด้วย|จำอะไร|ความจำ|ลืมเรื่อง|ลืมข้อ|ลืมที่|ลืมไป|ลืมทั้งหมด|เรียก(?:กู|ผม|ฉัน|เรา|หนู|ข้า|ดิฉัน|พี่|น้อง)ว่า|อีโมจิ|อิโมจิ|\bemoji\b|\bremember\b|\bforget\b)/i;
const DELETE = /(ลบ|เอาออก|ยกเลิก|\bremove\b|\bdelete\b)/i;
const DELETE_TARGET = /(งาน|โปรเจ[กค]|เอกสาร|ใบ|รายการ|รายจ่าย|ค่าใช้จ่าย|รายรับ|ลูกค้า|อันนี้|อันนั้น|ทั้งหมด|ล่าสุด|\bjob|\bproject|\bdocument|\bexpense)/i;
// เอกสาร alone is not one: "งานแปลเอกสาร" is a job. It counts as "ออก/สร้าง/ทำเอกสาร" or "เอกสารใหม่".
const DOC_WORD = /(ใบเสนอราคา|ใบแจ้งหนี้|ใบวางบิล|ใบเสร็จ|ใบกำกับ|ใบส่งของ|ใบลดหนี้|(?:ออก|สร้าง|ทำ)เอกสาร|เอกสาร(?:ใหม่|ฉบับ|เลขที่)|ออกต่อเป็น|\bquotation\b|\binvoice\b|\breceipt\b|\b(?:QT|INV|REC)-?\d)/i;
const DOC_MAKE = /(ออก|สร้าง|ทำ|ร่าง|ต่อเป็น|แปลงเป็น|\bissue\b|\bcreate\b|\bmake\b)/i;
const DOC_WANT = /(ขอ|อยากได้|เปิดใบ)/;
const DOC_LOOK = /(หา|ค้น|ดู|เช็ค|เช็ก|ตรวจ|\bfind\b|\bshow\b|\bsearch\b)/i;
const DOC_COUNT = /(กี่ใบ|มีกี่|เท่าไหร่|เท่าไร|ยอดรวม|สถานะ)/;
const DOC_ASK_FOR = /(ให้|หน่อย|ที|ด้วย|เลย|please)/i;
const EDIT = /(แก้|เปลี่ยน|ย้าย|เลื่อน|ปรับ(?!ปรุง)|\bedit\b|\bupdate\b|\bchange\b)/i;
// Money, tax, client and terms are the important parts of a job (brief: "แก้ไขข้อมูลโปรเจกต์สำคัญ → Sonnet").
const IMPORTANT_FIELD = /(ยอด|ราคา|มูลค่า|จำนวนเงิน|บาท|฿|\d{3,}|หัก|ภาษี|\bvat\b|แวต|มัดจำ|งวด|ลูกค้า|เครดิต)/i;
const PAYMENT = /(รับเงิน|ได้เงิน|ได้รับเงิน|โอนมา|โอนแล้ว|จ่ายแล้ว|จ่ายมาแล้ว|ชำระแล้ว|ชำระมา|จ่ายครบ|รับครบ|ส่งงานแล้ว|ปิดงาน|มัดจำมา|\bpaid\b)/i;
const CREATE = /(เพิ่ม(?!ขึ้น)|บันทึก|ลง(?:งาน|รายจ่าย|รายรับ|บัญชี)|สร้างงาน|เปิดงาน|รับงาน|จด(?:งาน|รายจ่าย|ค่า)|จ่าย(?:ค่า|ร้าน|ให้|เงินค่า)|ซื้อ|\badd\b|\bcreate\b|\bnew job\b)/i;
const IMPORT = /(นำเข้า|อิมพอร์ต|\bimport\b)/i;
const EXTERNAL = /(ส่ง(?:อีเมล|เมล|ไลน์|ข้อความ|ลิงก์|ไฟล์|ใบ\S*|เอกสาร)?\s*(?:ให้|ไปให้|ถึง)\s*ลูกค้า|ส่งอีเมล|\bemail (?:it )?to\b|\bsend (?:it )?to\b)/i;
// Conditions that make one addition complex (brief: "เพิ่มโปรเจกต์หลายเงื่อนไข → Sonnet").
const CONDITIONS: RegExp[] = [
  /หัก\s*(?:ณ\s*ที่จ่าย\s*)?\d/, /\bvat\b|แวต|ภาษีมูลค่าเพิ่ม/i, /งวด|ผ่อน/, /มัดจำ/, /เครดิต\s*\d|เครดิตเทอม/,
  /(?:รับ|จ่าย|โอน)(?:มา)?(?:แล้ว)?\s*\d|บางส่วน/, /(?:ส่ง(?:งาน)?|กำหนดส่ง)\s*(?:วันที่|ภายใน)\s*\d/,
];

// Analysis is about the user's work, money or the app (owner's brief, 2026-10-25, phase 8: everyday talk stays on the
// economical model). "แนะนำหนังหน่อย", "ทำไมฟ้าสีฟ้า" or "ควรเริ่มวาดอะไรก่อนดี" are everyday questions, not analysis.
const ANALYSIS_TOPIC = /(งาน(?!อดิเรก|แต่ง|บวช|ศพ|วัด|เลี้ยง|ปาร์ตี้|วันเกิด)|ลูกค้า|เงิน|รายได้|รายรับ|รายจ่าย|ใช้จ่าย|กำไร|ขาดทุน|ต้นทุน|ยอด|ภาษี|หัก|เครดิต|ค้าง|จ่าย|โอน|บิล|ใบเสนอ|ใบแจ้ง|ใบเสร็จ|เอกสาร|ราคา|ขาย|ธุรกิจ|แบรนด์|สปอนเซอร์|เดือนนี้|เดือนที่แล้ว|เดือนก่อน|รายเดือน|ไตรมาส|ในแอป|แอปนี้|krarok|กระรอกตุนเงิน|ฟีเจอร์|บัญชี|\d[\d,]{2,}|฿|%|client|income|expense|revenue|profit|tax|invoice|price|business|money)/i;
function analysisTopic(text: string, history: ChatTurn[] = []): boolean {
  if (ANALYSIS_TOPIC.test(text)) return true;
  // A short follow-up ("แล้วทำไมล่ะ") carries on the user's last message.
  const last = [...history].reverse().find(turn => turn.role === 'user');
  return text.length < 40 && Boolean(last && ANALYSIS_TOPIC.test(last.text));
}

function contextSize(text: string, history: ChatTurn[] = [], hasAttachment = false): ContextSize {
  if (hasAttachment) return 'file';
  if (text.trim().length >= VERY_LONG) return 'long';
  return text.length >= 200 || history.length >= 6 ? 'standard' : 'short';
}

// "เดือนนี้ได้เงินเท่าไหร่แล้ว" asks for a figure; it is not "ได้เงินแล้ว" news to record (owner, 2026-10-28: such questions
// went to the heavier action route). A message that states an amount ("ได้เงิน 5,000 เหลือเท่าไหร่") still records it.
const AMOUNT_QUESTION = /(เท่าไหร่|เท่าไร|เท่าใด|กี่บาท|กี่งาน|กี่ราย|กี่ครั้ง|\bhow much\b|\bhow many\b)/i;
const STATED_AMOUNT = /\d[\d,.]{2,}|\d\s*(?:บาท|พัน|หมื่น|แสน|ล้าน|k\b)/i;

function isAsking(text: string): boolean {
  if (AMOUNT_QUESTION.test(text) && !STATED_AMOUNT.test(text)) return true;
  if (!ASKING.test(text)) return false;
  return !(POLITE_REQUEST.test(text) && POLITE_END.test(text) && !REAL_QUESTION.test(text));
}

/** The four axes of one message (brief, phase 3). Short does not mean safe: "ลบงานล่าสุด" is a delete. */
export function assessMessage(input: RouteInput): Assessment {
  const text = input.text.trim();
  const context = contextSize(text, input.history, input.hasAttachment);
  const asking = isAsking(text);
  const conditions = CONDITIONS.filter(rule => rule.test(text)).length;
  const kinds = ACTIONS.filter(kind => kind.test(text)).length;
  const result = (intent: Intent, risk: Risk, complexity: Complexity): Assessment => ({ intent, complexity, risk, context, asking });

  if (input.hasAttachment) return result('file', (CREATE.test(text) || EDIT.test(text) || DOC_MAKE.test(text) || PAYMENT.test(text)) ? 'create' : 'read', 'medium');
  if (MEMORY.test(text)) return result('memory', /ลบ|ลืม|forget/i.test(text) ? 'delete' : 'create', 'low');
  if (!asking && DELETE.test(text) && DELETE_TARGET.test(text)) {
    return DOC_WORD.test(text) ? result('document', 'delete', 'medium') : result('delete', 'delete', 'medium');
  }
  if (!asking && DOC_WORD.test(text)) {
    // "ส่งใบแจ้งหนี้ให้ลูกค้า" sends an existing document (no tool does that); it is not a new one.
    if (EXTERNAL.test(text) && !DOC_MAKE.test(text)) return result('external', 'external', 'low');
    const make = DOC_MAKE.test(text) || (DOC_WANT.test(text) && !DOC_LOOK.test(text));
    if (EDIT.test(text) && !make) return result('document', 'update', 'medium');
    if (!DOC_COUNT.test(text) && (make || (!DOC_LOOK.test(text) && DOC_ASK_FOR.test(text)))) {
      return result('document', 'create', DEPENDS.test(text) || kinds >= 2 ? 'high' : 'medium');
    }
  }
  if (((ANALYSIS.test(text) || RANKING.test(text)) && analysisTopic(text, input.history))
    || (MONEY_GOAL.test(text) && TARGET.test(text) && !/หัก\s*(?:ณ\s*ที่จ่าย\s*)?\d+\s*%/.test(text))) {
    return result('analysis', 'read', 'high');
  }
  if (asking) return result(ABOUT_APP.test(text) || REAL_QUESTION.test(text) || DOC_WORD.test(text) || CAN_IT.test(text) ? 'feature_help' : 'read', 'read', 'low');
  if (IMPORT.test(text)) return result('import', 'create', 'low');
  if (EXTERNAL.test(text)) return result('external', 'external', 'low');
  if (EDIT.test(text)) return result('update', 'update', IMPORTANT_FIELD.test(text) || DEPENDS.test(text) ? 'medium' : 'low');
  if (PAYMENT.test(text)) return result('payment', 'update', conditions >= 3 || (DEPENDS.test(text) && kinds >= 2) ? 'high' : conditions ? 'medium' : 'low');
  if (CREATE.test(text)) {
    const complex = conditions >= 3 || (/งวด|ผ่อน/.test(text) && conditions >= 2) || (DEPENDS.test(text) && kinds >= 2);
    return result('create', 'create', complex ? 'high' : conditions ? 'medium' : 'low');
  }
  if (/(รายรับ|รายได้|รายจ่าย|ค่าใช้จ่าย|กำไร|ขาดทุน|ยอด|สรุป|เงิน|ลูกค้า|งาน|ค้าง|กราฟ|สถิติ|สัดส่วน|เอกสาร|ใบ)/.test(text)) return result('read', 'read', 'low');
  return result('chat', 'read', 'low');
}

// ---------- answers without a model ----------
const TRAILING = /(?:\s|[?？!.]|ครับผม|ครับ|คับ|ค่ะ|คะ|ค่า|นะ|จ้า|จ้ะ|ฮะ|หรอ|เหรอ|อะ|อ่ะ|หน่อย|เอ่ย)+$/;
type PageKey = keyof typeof PAGES;
const PAGE_ALIASES: Map<string, PageKey> = (() => {
  const map = new Map<string, PageKey>();
  const add = (alias: string, key: string) => { if (key in PAGES) map.set(alias.toLowerCase().replace(/\s+/g, ''), key as PageKey); };
  for (const [key, [label]] of Object.entries(PAGES)) add(label, key);
  // Page names only: a keyword like รายจ่ายประจำ needs the steps, so the model answers it.
  for (const feature of KNOWLEDGE_BASE.features) if (feature.id !== 'import') add(feature.name_th, feature.navigation);
  for (const [alias, key] of Object.entries({ บอกเรา: 'feedback', หน้าแรก: 'dashboard', ใบแจ้งหนี้: 'invoice', ใบเสร็จ: 'invoice', ใบเสร็จรับเงิน: 'invoice',
    ใบกำกับภาษี: 'invoice', เงินค้างรับ: 'receivables', แจ้งเตือน: 'notifications', ไลน์: 'line', line: 'line', สมาชิก: 'plans',
    แพ็กเกจ: 'plans', แพคเกจ: 'plans', อัปเกรด: 'plans' })) add(alias, key);
  return map;
})();

/** "ใบเสนอราคาอยู่ตรงไหน": the page asked for, when the whole message is only that question. */
export function wherePage(text: string): PageKey | undefined {
  const plain = text.trim().toLowerCase().replace(TRAILING, '');
  if (plain.length > 40 || /\n/.test(plain)) return;
  const match = /^(?:เมนู|หน้า|ปุ่ม)?\s*(.+?)\s*(?:อยู่)?\s*(?:ตรงไหน|ที่ไหน|หน้าไหน|เมนูไหน|ไหน)(?:\s*(?:ของแอป|ในแอป|ในเว็บ|ของเว็บ))?$/.exec(plain);
  const key = match ? PAGE_ALIASES.get(match[1].replace(/\s+/g, '')) : undefined;
  // A page not open to everyone yet is answered by the model ("not available yet"), never with a button.
  return key && isPhaseOneFeatureAvailable(key === 'expenses' ? 'incomeExpense' : key, false) ? key : undefined;
}

const CLEAR_END = /(?:\s|นะ|ด้วย|ละกัน|แล้วกัน|ครับ|ค่ะ|คะ|จ้า|จ้ะ|ฮะ|เลย|อีก|[!.])*$/;
const NAME_COMMAND = new RegExp(`^(?:จำไว้(?:นะ|ด้วย)?|ช่วยจำ(?:ไว้)?(?:ด้วย)?|ต่อไป(?:นี้)?|จากนี้(?:ไป)?|\\s)*(?:ให้)?(?:ช่วย)?เรียก(?:กู|ผม|ฉัน|เรา|หนู|ข้า|ดิฉัน|พี่|น้อง)ว่า\\s*["“']?([^\\s"”'.,!?ๆ]{1,24}?)["”']?${CLEAR_END.source}`);
const NO_EMOJI = new RegExp(`^(?:จำไว้(?:นะ|ด้วย)?|ต่อไป(?:นี้)?|จากนี้(?:ไป)?|\\s)*(?:ไม่ต้อง(?:ใช้|ใส่|มี)|ไม่เอา|เลิกใช้|ห้ามใช้|อย่าใช้|ไม่ใช้)\\s*(?:อีโมจิ|อิโมจิ|emoji)${CLEAR_END.source}`, 'i');

/** A memory said so plainly that the memory tool can save it directly (brief: "Memory Tool เมื่อคำสั่งชัดเจน"). */
export function clearMemoryCommand(text: string): { kind: 'preferred_name' | 'emoji'; value: string } | undefined {
  const value = text.trim();
  const name = NAME_COMMAND.exec(value);
  // "เรียกผมว่าอะไรนะ" asks what the name is; it is not a name.
  if (name && !/(อะไร|ไร$|ยังไง|ไหน|ใคร)/.test(name[1]) && !/[?？]/.test(value)) return { kind: 'preferred_name', value: name[1] };
  if (NO_EMOJI.test(value)) return { kind: 'emoji', value: 'ไม่ใช้อีโมจิ' };
  return undefined;
}

// ---------- continuing earlier work ----------
// A questions card reaches the history as "- question" lines after เลขา's text (assistantApi).
const ASKS = /(\?|ไหม|มั้ย|หรือเปล่า|หรือไม่|รบกวน|ขอ(?:ข้อมูล|ชื่อ|วันที่|รายละเอียด)|ระบุ|แจ้ง|\n- )/;
/** A file was sent earlier in the chat (assistantApi marks it, and puts what was read from it before เลขา's answer). */
export const FILE_MARK = /\[(?:แนบไฟล์|อ่านจากไฟล์ที่แนบ)/;
const MAX_LOOKBACK = 12;

/**
 * This message answers questions that came out of earlier work: walking back while เลขา's turns are questions, the
 * user turn that started it. Owner, 2026-10-24: a quotation started with a picture went back to the light model on
 * the second answer and asked again for the client the picture showed.
 */
function startedWork(history: ChatTurn[] = [], smartFor: (text: string) => boolean): { smart: boolean; write: boolean; required: boolean } | undefined {
  let asked = false;
  for (let index = history.length - 1; index >= Math.max(0, history.length - MAX_LOOKBACK); index--) {
    const turn = history[index];
    if (turn.role === 'assistant') {
      if (!ASKS.test(turn.text.replace(/^\[อ่านจากไฟล์ที่แนบ:[\s\S]*?\]\n/, ''))) return undefined;
      if (FILE_MARK.test(turn.text)) return { smart: true, write: true, required: false };
      asked = true;
    } else if (asked) {
      if (FILE_MARK.test(turn.text)) return { smart: true, write: true, required: false };
      if (smartFor(turn.text)) {
        const earlier = decide({ text: turn.text }, 'v2');
        return { smart: true, write: WRITES.has(earlier.intent), required: earlier.smartRequired };
      }
    }
  }
  return undefined;
}

/** Version 1 (2026-10-24): kept so AI_ROUTING_POLICY=v1 brings back exactly the earlier choice. */
export function continuesSmartWorkV1(history: ChatTurn[] = []): boolean {
  return Boolean(startedWork(history, text => needsSmartModel(text)));
}

// ---------- the decision ----------
function decide(input: RouteInput, policy: RoutingPolicy, withHistory = false): RoutingDecision {
  const assessed = assessMessage(input);
  const base = { ...assessed, version: ROUTING_VERSIONS[policy] };
  const router = routeMessage({ text: input.text, hasAttachment: input.hasAttachment, pendingConfirmation: input.pendingConfirmation });
  if (policy === 'v1') {
    const smart = needsSmartModel(input.text, { hasAttachment: input.hasAttachment }) || (withHistory && continuesSmartWorkV1(input.history));
    return { ...base, tier: smart ? 'smart' : 'light', tools: router, smartRequired: false, reason: 'v1_rules' };
  }
  const write = WRITES.has(assessed.intent) && !assessed.asking;
  const tools: Route = input.hasAttachment || input.pendingConfirmation || write ? 'action'
    : assessed.intent === 'analysis' || assessed.intent === 'memory' ? router : 'chat';
  const make = (tier: Tier, reason: string, smartRequired = false, extra: Partial<RoutingDecision> = {}): RoutingDecision =>
    ({ ...base, tier, tools, smartRequired: tier === 'smart' && smartRequired, reason, ...extra });

  if (!input.hasAttachment && !input.pendingConfirmation) {
    // Never for a message that asks for a change or a memory: those go on as usual (the reply is still checked).
    // ("Krarok ตั้งใจแก้ปัญหาอะไร" reads as an edit to the rules; an edit of a job never matches a founder question.)
    const plain = !WRITES.has(assessed.intent) && assessed.intent !== 'memory' && assessed.intent !== 'import' && assessed.intent !== 'external';
    if (plain && techQuestion(input.text)) return make('light', 'direct_confidential', false, { direct: 'confidential' });
    if ((plain || assessed.intent === 'update') && founderTopic(input.text)) return make('light', 'direct_founder', false, { direct: 'founder' });
    if (assessed.intent === 'feature_help' && wherePage(input.text)) return make('light', 'direct_where', false, { direct: 'knowledge' });
    if (assessed.intent === 'memory' && clearMemoryCommand(input.text)) return make('light', 'direct_memory', false, { direct: 'memory' });
    if (renameRequest(input.text)) return make('light', 'direct_rename', false, { direct: 'rename' });
  }
  if (assessed.context === 'file') return make('smart', 'file', assessed.risk !== 'read');
  if (assessed.intent === 'document') return make('smart', 'document', true);
  if (assessed.intent === 'delete') return make('smart', 'delete', true);
  if (assessed.intent === 'update' && assessed.complexity !== 'low') return make('smart', 'important_edit', true);
  if ((assessed.intent === 'create' || assessed.intent === 'payment') && assessed.complexity === 'high') return make('smart', 'complex_change', true);
  if (assessed.intent === 'analysis') return make('smart', 'analysis');
  if (assessed.context === 'long') return make('smart', 'long_context', write);
  if (withHistory) {
    const earlier = startedWork(input.history, text => decide({ text }, 'v2').tier === 'smart');
    if (earlier?.smart) {
      return { ...base, tier: 'smart', tools: earlier.write ? 'action' : tools, smartRequired: earlier.required, reason: 'continues_smart_work' };
    }
  }
  return make('light', write ? 'plain_change' : 'everyday');
}

/** Which model and tools one message gets, and why (saved with the request). */
export function decideRoute(input: RouteInput, policy: RoutingPolicy = 'v2'): RoutingDecision {
  return decide(input, policy, true);
}

// ---------- what is saved with the request ----------
export interface RoutingCall { provider: string; model: string; route: Route; usd: number; billable_usd: number; input: number; cached: number; write: number; write_1h: number; output: number; thinking: number; steps: number; failed?: boolean }
export type RoutingOutcome = 'answer' | 'card' | 'questions' | 'direct' | 'blocked' | 'max_steps' | 'budget' | 'interrupted' | 'empty' | 'error';
/** One request's money (cost brief, phase 3): real spend, what the user paid, and the app's own share of it. */
export interface RoutingCost { actual_usd: number; billable_usd: number; cache_overhead_usd: number; failed_attempt_usd: number; quota_overrun_usd: number; cache_saved_usd: number }
/**
 * One request's routing for the owner's report (cashflow_ai_usage.routing). Never the user's words, figures or names:
 * only codes, model names, counts, tool names and card ids.
 */
export interface RoutingRecord {
  v: string; intent: Intent; complexity: Complexity; risk: Risk; context: ContextSize; tier: Tier | 'direct'; reason: string;
  tools_first: Route; handed_off: boolean; escalations: string[]; fallback: 'light' | 'blocked' | null; provider_retries: number;
  calls: RoutingCall[]; tool_calls: string[]; latency_ms: number; outcome: RoutingOutcome; proposal_ids: string[];
  channel?: 'app' | 'line'; error?: string;
  cost?: RoutingCost;
  /** soft: past the soft share of the daily cap, so no optional Sonnet use for this request. */
  budget?: 'soft';
  /** The cache the shared rules had on Claude for this request. */
  claude_cache?: '1h' | '5m' | 'auto' | 'off';
  /** Package E: the turns of an unfinished task in this channel came from the other one. */
  continued_from?: 'app' | 'line';
  /** A provider answered with a billing problem during this request (billing.ts): out of credit, billing, over quota. */
  billing?: ('anthropic_credit' | 'gemini_billing' | 'gemini_quota')[];
  /** What the confidentiality check took out of the answer (confidentiality.ts); never the words themselves. */
  guard?: ('model' | 'internal' | 'secret')[];
}

export function routingRecord(decision: RoutingDecision, extra: Partial<RoutingRecord> = {}): RoutingRecord {
  return {
    v: decision.version, intent: decision.intent, complexity: decision.complexity, risk: decision.risk, context: decision.context,
    tier: decision.direct ? 'direct' : decision.tier, reason: decision.reason, tools_first: decision.tools, handed_off: false,
    escalations: [], fallback: null, provider_retries: 0, calls: [], tool_calls: [], latency_ms: 0, outcome: 'answer', proposal_ids: [],
    ...extra,
  };
}

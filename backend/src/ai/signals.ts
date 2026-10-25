import { lookupKnowledge } from './knowledge.js';
import type { ChatTurn } from './types.js';

// What เลขา's feature knowledge misses (owner-approved plan, package D, 2026-10-25): a feature people could not find,
// one that is not available yet, one they ask for, and a menu answer the user says was wrong. Rules only, no model
// call; the question is kept without numbers or contact details, for 6 months (cashflow_ai_learning_sweep). The
// knowledge base itself is never changed from these: they feed the owner's report, and a person decides.

export type SignalKind = 'not_found' | 'not_available' | 'wrong_answer' | 'feature_request';
export interface KnowledgeSignal { kind: SignalKind; feature_id: string | null; question: string | null }

const ABOUT_APP = /แอป|เว็บ|เมนู|ฟีเจอร์|หน้า|ปุ่ม|ตั้งค่า|ฟังก์ชัน|ระบบ|ใช้งาน|app|menu|feature|button|setting/i;
const HOW_TO = /ยังไง|อย่างไร|ตรงไหน|ที่ไหน|อยู่ไหน|หาไม่เจอ|ทำได้ไหม|ได้ไหม|ได้มั้ย|มีไหม|มีมั้ย|มีฟีเจอร์|วิธี|\bhow\b|\bwhere\b|\bcan i\b/i;
const REQUEST = /อยากให้มี|อยากได้ฟีเจอร์|ขอฟีเจอร์|ขอให้เพิ่ม|ช่วยเพิ่มฟีเจอร์|เพิ่มฟีเจอร์|น่าจะมี|ทำไมไม่มี|มีแผนจะทำ|please add|feature request/i;
const WRONG = /^\s*(?:ผิด|ไม่ใช่|ไม่ถูก|มั่ว|ตอบผิด)|ไม่มีเมนู|ไม่เห็นมี|ไม่มีปุ่ม|หาไม่เจอ|ไม่ตรงกับที่เห็น|that'?s wrong|not there/i;

/** A question as it is kept: no e-mail, no long numbers (accounts, phones, IDs, amounts), at most 200 characters. */
export function redactQuestion(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[อีเมล]').replace(/\d[\d,.\s-]{2,}\d|\d{3,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** The signals one message gives, from the message and the answer before it. At most two. */
export function detectSignals(text: string, history: ChatTurn[] = []): KnowledgeSignal[] {
  const out: KnowledgeSignal[] = [];
  const hit = lookupKnowledge(text, 3);
  const feature = hit.features[0]?.id ?? null;
  if (REQUEST.test(text)) out.push({ kind: 'feature_request', feature_id: feature, question: redactQuestion(text) });
  else if (hit.missing.length) out.push({ kind: 'not_available', feature_id: hit.missing[0].ask.slice(0, 60), question: redactQuestion(text) });
  else if (HOW_TO.test(text) && ABOUT_APP.test(text) && !hit.features.length && !hit.catalog) out.push({ kind: 'not_found', feature_id: null, question: redactQuestion(text) });
  // "ผิด ไม่มีเมนูนี้" right after เลขา answered an app question: that answer was wrong.
  const lastBot = [...history].reverse().find(turn => turn.role === 'assistant');
  const lastUser = [...history].reverse().find(turn => turn.role === 'user');
  if (WRONG.test(text) && lastBot && lastUser && history.lastIndexOf(lastBot) > history.lastIndexOf(lastUser)) {
    const asked = lookupKnowledge(lastUser.text, 3);
    // Only after a how-to question about the app: "ไม่ใช่ ร้านกาแฟ" while adding a job is a correction, not a menu answer.
    if (HOW_TO.test(lastUser.text) && (asked.features.length || asked.missing.length || ABOUT_APP.test(lastUser.text))) {
      out.push({ kind: 'wrong_answer', feature_id: asked.features[0]?.id ?? null, question: redactQuestion(lastUser.text) });
    }
  }
  return out.slice(0, 2);
}

/** feature_lookup found nothing for what the model searched: the user's words had no match in the knowledge. */
export function lookupSignal(query: string): KnowledgeSignal | null {
  const hit = lookupKnowledge(query, 3);
  return hit.features.length || hit.missing.length || hit.catalog || query.trim().length < 2 ? null : { kind: 'not_found', feature_id: null, question: redactQuestion(query) };
}

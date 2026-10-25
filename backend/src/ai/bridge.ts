import type { ChatTurn } from './types.js';

// When เลขา may offer help with the app in this turn (owner's brief "EXTROVERT PERSONALITY & NATURAL FINANCIAL
// ENGAGEMENT", 2026-10-25, phases 4–5): at most one short line, only when the message touches the user's work or money,
// never twice in a row, never after the user turned it down or asked for no more, never while they share something
// personal or hard. Decided here by plain rules on the chat itself: no model call, nothing read from the account.

export type OfferState = 'allowed' | 'unrelated' | 'recent' | 'declined' | 'sensitive' | 'off';

// Work and money in the user's message: jobs, clients, getting paid, buying things for work, documents, a busy or
// tiring day at work. Food, rest, films and hobbies are not.
const WORK_OR_MONEY = /(งาน(?!อดิเรก|แต่ง|บวช|ศพ|วัด|เลี้ยง|ปาร์ตี้|วันเกิด)|ลูกค้า|เงิน|โอน|จ่าย|ซื้อ|ค่า(?:ใช้จ่าย|จ้าง|ตัว|ของ)|บาท|฿|\d{3,}|รายได้|รายรับ|รายจ่าย|บิล|ใบเสนอ|ใบแจ้ง|ใบเสร็จ|เอกสาร|เครดิต|ค้างรับ|ทวง|มัดจำ|สปอนเซอร์|แบรนด์|จ้าง|ส่งงาน|เดดไลน์|deadline|เหนื่อย|ยุ่ง|วุ่น|client|invoice|quotation|paid|payment|money|\bjobs?\b|\bwork\b)/i;
// What an offer from เลขา reads like: offering words together with a task in the app ("ถ้าอยากทำง่าย ๆ ลองไข่เจียว" is
// not one; "ถ้าอยากให้ช่วยลงงานไว้ก่อนก็บอก" is).
const OFFER_WORDS = /(ถ้า(?:อยาก|จะ|มี)|บอก(?:ได้|มา)?เลย|เดี๋ยว(?:ช่วย|จัด|ลง|บันทึก|สรุป)|ให้ช่วย|ส่ง(?:รายละเอียด)?มา(?:ได้)?|ไหม|มั้ย|want me to|shall i|i can)/i;
const APP_TASK = /(ลงงาน|ลงระบบ|ลงไว้|ลงให้|บันทึก|รายจ่าย|รับเงินแล้ว|สรุป|งานค้าง|ค้างรับ|ใบเสนอราคา|ใบแจ้งหนี้|เอกสาร|เครดิตเทอม|\brecord|\blog\b|add (?:it|a job|the job)|invoice|quotation)/i;
const isOffer = (text: string) => OFFER_WORDS.test(text) && APP_TASK.test(text);
// The user turning an offer down.
const DECLINE = /(ไม่ต้อง|ไม่เอา|ไม่ใช่ตอนนี้|ไว้ก่อน|ไว้ทีหลัง|ช่างมัน|ไม่สน|พอแล้ว|no thanks|not now|\bnope\b)/i;
// The user asking for no more offers ("ไม่ต้องชวนบันทึกงานอีก").
const NO_MORE = /((?:ไม่ต้อง|อย่า|เลิก|หยุด)\s*(?:มา)?\s*(?:ชวน|เสนอ)|stop (?:offering|suggesting))/i;
// Something personal or hard: listen, no app offers.
const SENSITIVE = /(เครียด|เศร้า|เสียใจ|ร้องไห้|ท้อ|หมดไฟ|ซึมเศร้า|เหงา|ป่วย|ไม่สบาย|โรงพยาบาล|เสียชีวิต|อยากตาย|เลิกกับ|ทะเลาะ|อกหัก|กังวล|นอนไม่หลับ|ฆ่าตัว|ไม่อยากอยู่|depress|anxious|grief|lonely)/i;
const LOOKBACK = 12;

export function offerState(text: string, history: ChatTurn[] = []): OfferState {
  const recent = history.slice(-LOOKBACK);
  if ([text, ...recent.filter(turn => turn.role === 'user').map(turn => turn.text)].some(said => NO_MORE.test(said))) return 'off';
  if (SENSITIVE.test(text)) return 'sensitive';
  const assistant = recent.filter(turn => turn.role === 'assistant');
  const last = assistant.at(-1);
  if (last && isOffer(last.text) && DECLINE.test(text)) return 'declined';
  // One offer in the last three answers is enough for now.
  if (assistant.slice(-3).some(turn => isOffer(turn.text))) return 'recent';
  return WORK_OR_MONEY.test(text) ? 'allowed' : 'unrelated';
}

/** The line for the prompt's per-user part (never the cached shared part). */
export function offerLine(state: OfferState): string {
  const none = 'OFFER THIS TURN: none.';
  switch (state) {
    case 'allowed': return 'OFFER THIS TURN: allowed. At most one short line, only if it really fits what the user just said; most messages need none.';
    case 'unrelated': return `${none} This message is not about the user's work or money: just talk.`;
    case 'recent': return `${none} You offered help a moment ago: just talk.`;
    case 'declined': return `${none} The user turned down your last offer: do not offer it again in this chat.`;
    case 'sensitive': return `${none} The user is sharing something personal or hard: listen and support, no app offers.`;
    case 'off': return `${none} The user asked you to stop offering: suggest app tasks only when they ask.`;
  }
}

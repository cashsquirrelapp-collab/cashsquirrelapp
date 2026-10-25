import type { Route } from './types.js';

// Picks one model per message (owner's brief, 2026-10-24): the light model talks and answers, the action model
// changes data, builds documents, imports files and does detailed analysis. Plain rules, no model call; anything
// unclear starts on the light model, which can hand over with route_to_action.

const WRITE = /(เพิ่ม|บันทึก|ลบ|ลบทิ้ง|แก้|แก้ไข|เปลี่ยน|ฝาก|ถอน|ย้าย|ยกเลิก|ปิดงาน|ส่งงานแล้ว|รับเงิน(?:ครบ|แล้ว|บางส่วน)|ได้เงิน(?:ครบ|แล้ว)|ได้รับเงิน|จ่ายแล้ว|ออก(?:ใบ|เอกสาร|บิล)|สร้าง(?:ใบ|เอกสาร|งาน|บิล)|ทำ(?:ใบ|บิล)|นำเข้า|อิมพอร์ต|\bimport\b|\badd\b|\bdelete\b|\bremove\b|\bedit\b|\bupdate\b|\bcreate\b|\bissue\b|\bdeposit\b|\bwithdraw\b)/i;
const DOCUMENT = /(ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับ|ใบวางบิล|quotation|invoice|receipt)/i;
// How / where / can-it questions are about the app, not a request to act.
const QUESTION = /(ตรงไหน|ที่ไหน|อยู่ไหน|ยังไง|อย่างไร|ทำไง|ได้ไหม|ได้มั้ย|ได้ป่าว|ได้ปะ|มีไหม|มีมั้ย|คืออะไร|วิธี|ได้กี่|กี่(?:ใบ|ครั้ง|ฉบับ|บาท|วัน|งาน)|หรือเปล่า|รึเปล่า|(?:ไหม|มั้ย)\s*[?？]?\s*$|how\b|where\b|what is|can i\b|is there)/i;
const ANALYSIS = /(เทียบ|เปรียบเทียบ|วิเคราะห์|แนวโน้ม|ย้อนหลัง\s*\d|ราย(?:ลูกค้า|เดือน)\s*ย้อนหลัง|forecast|trend|compare|analy[sz]e)/i;

export interface RouteInput { text: string; hasAttachment?: boolean; pendingConfirmation?: boolean }

export function routeMessage({ text, hasAttachment, pendingConfirmation }: RouteInput): Route {
  if (hasAttachment || pendingConfirmation) return 'action';
  const asking = QUESTION.test(text);
  if (!asking && (WRITE.test(text) || (DOCUMENT.test(text) && /(ให้|หน่อย|ที|เลย|please)/i.test(text)))) return 'action';
  if (ANALYSIS.test(text) && !asking) return 'action';
  return 'chat';
}

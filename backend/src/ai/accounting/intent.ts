import type { AccountingTopic } from './knowledge.js';

// Which accounting or tax topics a message is about (brief section 6: "Accounting Intent Classification"), by rules
// only: no model call and no tokens. Ordinary app work ("เพิ่มงาน 5,000 หัก 3%", "ออกใบเสนอราคารวม VAT") is not an
// accounting question and keeps the existing path; the same words inside a question ("หัก 3% คืออะไร") are.

const TOPIC_RULES: readonly [AccountingTopic, RegExp][] = [
  ['concepts', /สินทรัพย์|หนี้สิน|ส่วนของเจ้าของ|สมการบัญชี|เดบิต|เครดิต(?!\s*เทอม)|บัญชีแยกประเภท|ลงบัญชี|บัญชีคู่|เกณฑ์เงินสด|เกณฑ์คงค้าง|รายได้รับล่วงหน้า|กระทบยอด|\bdebit\b|accrual|ledger|double.?entry|reconcil/i],
  ['freelance', /ฟรีแลนซ์|freelanc|อาชีพอิสระ|กันเงิน(?:ไว้)?(?:เสีย|จ่าย)?ภาษี|เก็บเงิน(?:ไว้)?(?:เสีย|จ่าย)ภาษี|เงินส่วนตัว.*(?:ธุรกิจ|งาน)|แยกบัญชี|ประเภทเงินได้|มาตรา\s*40|40\s*\(\s*[1-8]\s*\)|มัดจำ.*(?:ภาษี|บัญชี|นับ|รายได้)/i],
  ['receivables', /อายุลูกหนี้|\baging\b|ทวงเงิน|ทวงหนี้|ติดตาม(?:ทวง)?เงิน|ลูกค้า(?:ไม่|ยังไม่|ชอบ)จ่าย|จ่ายช้า|เลยกำหนด.*(?:ทำไง|ยังไง|อย่างไร|ดี)|ความเสี่ยง.*(?:ค้าง|ลูกค้า|ลูกหนี้)|หนี้สูญ/i],
  ['pricing', /ตั้งราคา|คิดราคา|ราคาขั้นต่ำ|ควรเสนอราคา|ควรคิด(?:ค่า)?(?:งาน|ราคา)?เท่า|จุดคุ้มทุน|คุ้มทุน|break.?even|margin|มาร์จิ้น|markup|มาร์คอัพ|กำไรขั้นต้น|ต้นทุนคงที่|ต้นทุนผันแปร|ต้นทุนต่อหน่วย|ส่วนลด.*(?:กำไร|คุ้ม)|ลดราคา.*(?:คุ้ม|กำไร)|unit economics|pricing/i],
  ['cashflow', /กระแสเงินสด|cash.?flow|สภาพคล่อง|เงินไม่เหลือ|เงิน(?:หาย|หมด)ไปไหน|ไม่เหลือเงิน|กำไร.*(?:แต่|ทำไม).*เงิน|เงิน.*ไม่(?:เพิ่ม|เหลือ|พอ)|เงินขาดมือ|runway|อยู่ได้กี่เดือน|เงินสำรอง|เงินฉุกเฉิน|คาดการณ์เงิน|forecast|เงิน(?:จะ)?เข้า.*(?:สัปดาห์|อาทิตย์|เดือน)หน้า|(?:สัปดาห์|อาทิตย์|เดือน)หน้า.*เงิน(?:จะ)?เข้า|จะมีเงินเข้า|เงินที่คาดว่าจะ|will (?:come in|i get) next/i],
  ['statements', /งบการเงิน|งบกำไรขาดทุน|งบดุล|งบแสดงฐานะ|งบกระแสเงินสด|ค่าเสื่อม|depreciation|income statement|balance sheet|financial statement|อัตราส่วนทางการเงิน/i],
  ['pit', /ภาษีเงินได้|ภาษีบุคคล|เสียภาษี|ภาษี.*(?:เท่าไหร่|เท่าไร|กี่บาท|ยังไง)|คำนวณภาษี|ลดหย่อน|หักค่าใช้จ่าย|หักเหมา|ภ\.?\s*ง\.?\s*ด\.?\s*9[014]|ภงด\s*9[014]|อัตราภาษี|ภาษีขั้นต่ำ|เงินได้สุทธิ|personal income tax|\bincome tax\b|tax (?:deduction|allowance|bracket)/i],
  ['wht', /หัก\s*ณ\s*ที่จ่าย|ภาษี(?:ที่)?ถูกหัก|50\s*ทวิ|ห้าสิบทวิ|withholding|e-?wht\b|e-?withholding/i],
  ['vat', /\bvat\b|แวต|ภาษีมูลค่าเพิ่ม|ภ\.?\s*พ\.?\s*(?:01|20|30)|ภาษีซื้อ|ภาษีขาย/i],
  ['documents', /(?:ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับภาษี|ใบลดหนี้|ใบเพิ่มหนี้|ใบวางบิล).*(?:ต่างกัน|คืออะไร|ต้องมี|องค์ประกอบ|ใช้ตอนไหน|ออกเมื่อไหร่|ออกตอนไหน|จำเป็นไหม|ต่างจาก)|ใบกำกับภาษีเต็มรูป|\btax invoice\b/i],
  ['contracts', /สัญญา(?:จ้าง|รับงาน)|ข้อตกลง(?:รับงาน|จ้าง)|ขอบเขตงาน|ยกเลิกงาน|คืนมัดจำ|ค่าปรับ|ผิดนัด|ลิขสิทธิ์(?:ผลงาน|งาน)|สิทธิ์(?:การ)?ใช้งาน|scope of work|\bcontract\b/i],
  ['audit', /ตรวจ(?:สอบ)?(?:บัญชี|ข้อมูล|ยอด|ความถูกต้อง)|รายการ(?:ที่)?ซ้ำ|ยอดไม่ตรง|ข้อมูล(?:ผิดปกติ|แปลก)|ตกหล่น|นับซ้ำ|duplicate|\baudit\b/i],
  ['standards', /มาตรฐาน(?:การ)?บัญชี|\btfrs\b|npaes?\b|ผู้ทำบัญชี|ผู้สอบบัญชี|ต้องทำบัญชี|ต้องมีนักบัญชี|จรรยาบรรณ/i],
  ['filing', /ยื่นภาษี|ยื่นแบบ|e-?filing|efiling|เว็บ(?:ไซต์)?สรรพากร|กรมสรรพากร|rd\.go\.th|สอนยื่น|วิธียื่น|ต้องยื่น/i],
  ['refund', /คืนภาษี|ขอคืน(?:ภาษี|เงิน)|ภาษีคืน|ได้(?:เงิน)?คืน.*ภาษี|tax refund|\brefund\b/i],
  ['checklist', /เอกสาร.*(?:ยื่นภาษี|ภาษี|ลดหย่อน)|เตรียม(?:ตัว)?(?:ยื่น|ภาษี|เอกสาร)|ต้องใช้เอกสาร|เช็กลิสต์|checklist/i],
];

/** A request to do something in the app, not a question about it. */
const ACTION_START = /^(?:ช่วย\s*|รบกวน\s*)?(?:เพิ่ม|บันทึก|ลง(?:งาน|รายจ่าย|รายรับ)|แก้(?:ไข)?|ลบ|ออกใบ|ทำใบ|สร้าง(?:ใบ|งาน)|เปิดงาน)|^(?:please\s+)?(?:add|record|edit|delete|create|issue)\b/i;
const QUESTION = /ไหม|มั้ย|ป่ะ|เปล่า|อะไร|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|ทำไม|คือ|ต่าง|ควร|ดีกว่า|ได้กี่|กี่(?:บาท|%|เปอร์)|[?？]|\b(?:how|what|why|should|which|when|do i|can i)\b/i;

export function accountingTopics(text: string): AccountingTopic[] {
  const message = (text || '').normalize('NFC').trim();
  if (!message) return [];
  if (ACTION_START.test(message) && !QUESTION.test(message)) return [];
  return TOPIC_RULES.filter(([, rule]) => rule.test(message)).map(([topic]) => topic);
}

/** Topics for this turn: its own, or, for a short follow-up ("แล้วถ้าโสดล่ะ"), those of the previous user message. */
export function turnTopics(text: string, history: { role: string; text: string }[] = []): AccountingTopic[] {
  const own = accountingTopics(text);
  if (own.length) return own;
  if ((text || '').trim().length > 40) return [];
  const previous = [...history].reverse().find(turn => turn.role === 'user')?.text;
  return previous ? accountingTopics(previous) : [];
}

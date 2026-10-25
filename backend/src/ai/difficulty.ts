// Routing version 1 (kept for rollback: AI_ROUTING_POLICY=v1; version 2 is routingPolicy.ts). Which messages go to
// the smart model. Owner, 2026-10-24: Claude Sonnet 5.5 only for work that needs thinking, so
// everyday messages stay on the light model and a Pro month holds about 300–430 messages. Plain rules, no model call.
//
// Smart: analysis, advice, ranking, money targets, charts and statistics, writing (a polite reminder, an email), a
// picture or PDF to read, a very long pasted text, and changes that depend on each other ("add the job, then issue
// the invoice from it"). Light: lookups, how-tos and plain changes, also several at once ("both jobs are paid", one
// job's withholding plus its payment). Gemini 3.5 Flash-Lite prepared those cards correctly in the 2026-10-24 tests.

export const ANALYSIS = /(วิเคราะห์|เปรียบเทียบ|เทียบ|แนวโน้ม|คาดการณ์|ประเมิน|ทำไม|เพราะอะไร|สาเหตุ|แนะนำ|ควร(?:ทำ|จะ|เริ่ม|ตาม)|วางแผน|แผนการ|ภาพรวม|เชิงลึก|ปรับปรุง|เพิ่มกำไร|ลดรายจ่าย|ลดต้นทุน|ร่าง|เขียน(?:ข้อความ|อีเมล|จดหมาย|คำ)|แต่ง(?:ข้อความ|คำ)|insight|forecast|trend|compare|analy[sz]e|why\b|advice|recommend|strategy|plan\b|draft|write)/i;
// Ranking, payment habits and money targets are analysis too ("ลูกค้าไหนสำคัญที่สุด", "อยากได้กำไรเพิ่ม 20%").
export const RANKING = /(สำคัญที่สุด|มากที่สุด|น้อยที่สุด|เยอะที่สุด|ดีที่สุด|แย่ที่สุด|จ่ายช้า|ค้างนาน|เบี้ยว|ประจำทุกเดือน)/;
export const CHART = /(กราฟ|แผนภูมิ|สถิติ|สัดส่วน|chart|graph)/i;
export const MONEY_GOAL = /(กำไร|รายได้|รายรับ|ยอดขาย|รายจ่าย|ค่าใช้จ่าย|เงินเก็บ)/;
export const TARGET = /(อยาก(?:ได้|มี|ให้)|เป้า|ต้องทำ(?:ยังไง|อย่างไร)|ควรทำ(?:ยังไง|อย่างไร)|\d+\s*%)/;
// Kinds of change, not words: "บันทึกรับเงินครบ" is one payment, "แก้ … หัก 3% … แล้วจ่ายแล้ว" is three.
export const ACTIONS: RegExp[] = [
  /(เพิ่ม|สร้าง|นำเข้า)/, // add
  /(แก้|เปลี่ยน|ย้าย|เลื่อน)/, // edit
  /(ลบ|ยกเลิก)/, // delete
  /(รับเงิน|ได้เงิน|(?<!ที่|ค้าง)จ่าย|โอน|มัดจำ)/, // money in (หัก ณ ที่จ่าย and ค้างจ่าย are not a payment)
  /หัก/, // withholding tax
  /(ส่งงาน|ปิดงาน)/, // delivery
];
export const DOCUMENT = /(ออกใบ|ออกเอกสาร|ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ)/;
// A later step that uses the result of an earlier one.
export const DEPENDS = /(จากนั้น|หลังจากนั้น|แล้วค่อย|ต่อด้วย|เสร็จแล้ว(?:ค่อย|ก็)|แล้ว(?:ก็)?ออก(?:ใบ|เอกสาร)|จากงาน(?:นี้|นั้น)|ของงาน(?:ใหม่|ที่เพิ่ง))/;
export const VERY_LONG = 600;

export function needsSmartModel(text: string, options: { hasAttachment?: boolean } = {}): boolean {
  if (options.hasAttachment) return true;
  const value = text.trim();
  if (value.length >= VERY_LONG) return true;
  if (ANALYSIS.test(value) || RANKING.test(value) || CHART.test(value)) return true;
  if (MONEY_GOAL.test(value) && TARGET.test(value) && !/หัก\s*(?:ณ\s*ที่จ่าย\s*)?\d+\s*%/.test(value)) return true;
  // Steps that build on each other: a document from a job being changed or added, or an explicit "then".
  const kinds = ACTIONS.filter(kind => kind.test(value)).length;
  return (DOCUMENT.test(value) && kinds >= 1) || (DEPENDS.test(value) && kinds + (DOCUMENT.test(value) ? 1 : 0) >= 2);
}

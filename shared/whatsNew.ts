// What changed for customers, newest first (owner, 2026-11-01: เลขากระรอก should know new features without anyone
// telling it). เลขา reads this when asked what is new, and with the page a question is about (backend/src/ai/knowledge.ts).
// Every release that changes what customers see adds a line here (CLAUDE.md). Only pages open to everyone are told
// (shared/featureAvailability.ts); a line for a page that is not open yet stays silent until it opens.
// area: the page's navigation key. th: one plain sentence a customer would understand; no prices, no vendor names.

export interface WhatsNewEntry { date: string; area: string; th: string }

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  { date: '2026-11-01', area: 'assistant', th: 'เลขากระรอกค้นข้อมูลเรื่องภาษีและการเงินจากเว็บไซต์ภายนอกได้ และแนบลิงก์แหล่งอ้างอิงไว้ท้ายคำตอบ (Pro)' },
  { date: '2026-11-01', area: 'jobs', th: 'นำเข้าข้อมูลจาก Excel แบบคุยกับเลขาง่ายขึ้น: บันทึกรายการที่ชัดเจน ถามก่อนเมื่อไม่แน่ใจ และบอกเมื่อข้อมูลดูผิด' },
  { date: '2026-11-01', area: 'notifications', th: 'อีเมลสรุปการเงินประจำเดือนแสดงตัวเลขตรงกับการ์ดสรุปใน LINE' },
  { date: '2026-10-31', area: 'vault', th: 'คลังเอกสารเปิดให้ทุกบัญชี: แพ็กเกจฟรีเก็บได้ 5 ไฟล์ Pro ไม่จำกัด และแนบไฟล์จากแชทเลขาเข้าคลังได้' },
  { date: '2026-10-31', area: 'wht50', th: 'หน้าติดตามใบ 50 ทวิ เปิดให้ทุกบัญชี: เห็นว่างานไหนยังรอใบ ภาษีถูกหักไปเท่าไร และมีหลักฐานแล้วเท่าไร' },
  { date: '2026-10-31', area: 'assistant', th: 'ส่งรูปหรือไฟล์ PDF ให้เลขาอ่านได้ครั้งละไม่เกิน 5 ไฟล์' },
  { date: '2026-10-31', area: 'jobs', th: 'นำเข้าจาก Excel คุยกับเลขาได้ทุกอุปกรณ์' },
  { date: '2026-10-31', area: 'incomeExpense', th: 'บัญชีใหม่เริ่มต้นโดยไม่มีรายจ่ายประจำตั้งต้น กรอกเฉพาะรายจ่ายประจำที่มีจริง' },
  { date: '2026-10-30', area: 'settings', th: 'ตั้งธีมสว่างหรือมืดเองได้ หรือให้สลับตามเวลาอัตโนมัติ ที่หน้า ตั้งค่า' },
  { date: '2026-10-30', area: 'calendar', th: 'ปฏิทินดูได้ 2 แบบ คือแบบปฏิทินรายเดือนและแบบไทม์ไลน์' },
  { date: '2026-10-30', area: 'line', th: 'ขอใบเสนอราคาหรือใบแจ้งหนี้ผ่าน LINE ได้ เลขาเตรียมร่างให้ตรวจก่อนบันทึก (Pro)' },
  { date: '2026-10-28', area: 'feedback', th: 'เมนู บอกเรา เปลี่ยนชื่อเป็น แจ้งปัญหา ใช้แจ้งปัญหาและเสนอไอเดียได้เหมือนเดิม' },
];

import { SOURCES } from './sources.js';

// Official websites เลขากระรอก may show as a link card (brief section 4C, "Website Link Cards"). Only these, chosen by
// id: a model never supplies a URL. The chat opens them in a new tab; nothing is embedded, and no password, OTP or
// ID-card number is ever asked for in the chat: the user types those only on the official site.

export interface OfficialLink {
  id: string;
  org: string;
  title: string;
  description: string;
  /** What to do on that site, in one line. */
  todo: string;
  url: string;
}

export const OFFICIAL_LINKS: Readonly<Record<string, OfficialLink>> = {
  rd: { id: 'rd', org: 'กรมสรรพากร', title: 'เว็บไซต์กรมสรรพากร', url: 'https://www.rd.go.th/',
    description: 'ข่าว ประกาศ คู่มือภาษี และ My Tax Account', todo: 'ดูข้อมูลภาษีของตัวเองที่เมนู My Tax Account' },
  efiling: { id: 'efiling', org: 'กรมสรรพากร', title: 'ยื่นแบบออนไลน์ (e-Filing)', url: 'https://efiling.rd.go.th/rd-cms/',
    description: 'ยื่น ภ.ง.ด.90 / 91 / 94 และชำระภาษีออนไลน์', todo: 'กด "ยื่นแบบออนไลน์" แล้วเข้าสู่ระบบด้วยบัญชีของกรมสรรพากร' },
  refund_status: { id: 'refund_status', org: 'กรมสรรพากร', title: 'ตรวจสอบการขอคืนภาษี', url: 'https://efiling.rd.go.th/rd-cms/',
    description: 'ติดตามสถานะคืนภาษีและส่งเอกสารเพิ่มเติม', todo: 'เลือกเมนู "ตรวจสอบขอคืน/นำส่งเอกสาร"' },
  pnd90_guide: { id: 'pnd90_guide', org: 'กรมสรรพากร', title: 'คู่มือกรอก ภ.ง.ด.90 ปีภาษี 2568', url: SOURCES.pnd90_2568.url,
    description: 'เกณฑ์ผู้ต้องยื่น การหักค่าใช้จ่าย ค่าลดหย่อน และกำหนดยื่น', todo: 'อ่านหัวข้อที่ตรงกับเงินได้และค่าลดหย่อนของตัวเอง' },
  pnd91_guide: { id: 'pnd91_guide', org: 'กรมสรรพากร', title: 'คู่มือกรอก ภ.ง.ด.91 ปีภาษี 2568', url: SOURCES.pnd91_2568.url,
    description: 'สำหรับผู้มีเงินเดือนค่าจ้างประเภทเดียว', todo: 'อ่านเกณฑ์ผู้ต้องยื่นและค่าลดหย่อน' },
  wht_rates: { id: 'wht_rates', org: 'กรมสรรพากร', title: 'คำสั่ง ท.ป.4/2528 อัตราหัก ณ ที่จ่าย', url: SOURCES.wht_order.url,
    description: 'อัตราภาษีหัก ณ ที่จ่ายตามประเภทเงินได้', todo: 'หาข้อที่ตรงกับประเภทเงินได้ที่ได้รับ' },
  vat_register: { id: 'vat_register', org: 'กรมสรรพากร', title: 'การจดทะเบียนภาษีมูลค่าเพิ่ม', url: SOURCES.vat_register.url,
    description: 'ใครต้องจด VAT และต้องจดภายในเมื่อไร', todo: 'ตรวจว่ารายรับต่อปีถึงเกณฑ์หรือไม่' },
  tax_invoice_guide: { id: 'tax_invoice_guide', org: 'กรมสรรพากร', title: 'คู่มือใบกำกับภาษี', url: SOURCES.tax_invoice.url,
    description: 'รายการที่ใบกำกับภาษีต้องมี และการเก็บรักษา', todo: 'ใช้ตรวจใบกำกับภาษีก่อนออกหรือรับ' },
  dbd: { id: 'dbd', org: 'กรมพัฒนาธุรกิจการค้า', title: 'กรมพัฒนาธุรกิจการค้า', url: 'https://www.dbd.go.th/',
    description: 'จดทะเบียนพาณิชย์ ห้างหุ้นส่วน และบริษัท', todo: 'ดูขั้นตอนจดทะเบียนตามรูปแบบธุรกิจ' },
  tfac: { id: 'tfac', org: 'สภาวิชาชีพบัญชี', title: 'สภาวิชาชีพบัญชี', url: 'https://tfac.or.th/',
    description: 'มาตรฐานการบัญชีและข้อมูลผู้ประกอบวิชาชีพบัญชี', todo: 'ค้นหามาตรฐานหรือตรวจรายชื่อผู้สอบบัญชี' },
};

export const OFFICIAL_LINK_IDS = Object.keys(OFFICIAL_LINKS);
export const OFFICIAL_HOSTS = ['www.rd.go.th', 'rd.go.th', 'efiling.rd.go.th', 'www.dbd.go.th', 'dbd.go.th', 'tfac.or.th', 'www.tfac.or.th'];

export function isOfficialUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && OFFICIAL_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

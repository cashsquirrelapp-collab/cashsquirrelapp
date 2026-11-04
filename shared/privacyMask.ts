// Personal data never leaves for an outside AI service (owner, 2026-11-04, after a customer's report: "ส่วนของอัปโหลดไฟล์
// ที่บอกว่าปิด email กับเบอร์โทร ไม่ได้ปิดจริง ... ถ้าอัปข้อมูลลูกค้าของ freelance เข้าไปแล้วมันรั่วไป third-party อาจจะโดน
// PDPA ... มึงควรปิดให้หมดอย่าให้มี"). Every file's text is masked on the person's device before it is sent (import column
// samples, the import chat, a spreadsheet or document in the เลขากระรอก chat), and again on the server.
//
// Masked: emails; phone, ID, tax, bank and card numbers (any run of 9 or more digits, whatever separates them); links;
// LINE / IG style handles; addresses; and names written with a title (นาย นาง นางสาว คุณ Mr Ms ...). In a table, a column
// whose header says it holds contact or identity data (อีเมล, เบอร์โทร, ที่อยู่, เลขประจำตัว ...) is masked whole.
// Amounts, dates, statuses and business names stay, so the file can still be read as bookkeeping.

export const MASK = {
  email: '[อีเมล]', number: '[เบอร์/เลขบัญชี]', link: '[ลิงก์]', handle: '[ไอดี]', address: '[ที่อยู่]', person: '[ชื่อบุคคล]', column: '[ข้อมูลส่วนตัว]',
} as const;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s,"'<>]+/gi;
const HANDLE = /(^|[\s(:：,"'“])@[A-Za-z0-9._-]{2,}/g;
// A run of digits with the separators people put in phone, ID and account numbers. Money keeps its commas and dates their
// slashes, so neither forms one run.
const DIGIT_RUN = /\+?\(?\d[\d\s().-]{5,}\d\)?/g;
const DECIMAL_AMOUNT = /^\d{1,12}\.\d{1,2}$/;

// A title, then the name (one or two words). Words that start the same way but are not names stay.
const THAI_TITLE = /(^|[\s,(:"'“/])(?:นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|ดร\.|นาย(?!แบบ|จ้าง|หน้า|ทุน|กรัฐ|กเทศ|กสมาคม|ช่าง|ประกัน|ตรวจ|อำเภอ|ร้อย|พล|พัน|สิบ|ห้าง)|นาง(?!แบบ|พยาบาล|ฟ้า|งาม|เอก|รำ)|คุณ(?!ภาพ|ค่า|สมบัติ|ลักษณะ|ประโยชน์|ธรรม|วุฒิ|ูปการ|านุ|ความ|ครู))\s*[ก-๙]{2,}(?:\s+[ก-๙]{2,})?/g;
const ENGLISH_TITLE = /(^|[\s,(:"'“/])(?:Mr|Mrs|Ms|Miss|Dr)(?:\.\s*|\s+)[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?/g;

// Words of a Thai address. Two of them in one cell or line make it an address.
const ADDRESS_MARKS = [
  /บ้านเลขที่/, /เลขที่\s*\d/, /หมู่ที่/, /หมู่บ้าน/, /(?<![ก-๙])ม\.\s?\d/, /ซอย/, /(?<![ก-๙])ซ\.\s?[ก-๙\d]/, /ถนน/, /(?<![ก-๙])ถ\.\s?[ก-๙]{2}/,
  /ตำบล/, /(?<![ก-๙])ต\.\s?[ก-๙]{2}/, /แขวง/, /อำเภอ/, /(?<![ก-๙])อ\.\s?[ก-๙]{2}/, /เขต[ก-๙]/, /จังหวัด/, /(?<![ก-๙])จ\.\s?[ก-๙]{2}/,
  /รหัสไปรษณีย์/, /กรุงเทพ|กทม\.?(?![ก-๙])/, /(?<![\d/])\d{1,4}\/\d{1,3}(?![\d/])/, /\b(?:road|rd\.|soi|district|province|subdistrict)\b/i,
];
const looksLikeAddress = (text: string) => ADDRESS_MARKS.filter(mark => mark.test(text)).length >= 2;

/** Columns of the people a freelancer works for: a cell that reads as a person's name (not a business) is masked. */
const PEOPLE_HEADER = /(ลูกค้า|client|customer|ชื่อ\s*-?\s*(?:นาม)?สกุล|full\s*name|ผู้ว่าจ้าง|ผู้ซื้อ|buyer|ผู้รับ|payer|ผู้จ่าย)/i;
const BUSINESS_WORD = /(บริษัท|จำกัด|หจก|ห้าง|ร้าน|สตูดิโอ|แบรนด์|มหาวิทยาลัย|โรงเรียน|โรงแรม|คลินิก|สมาคม|มูลนิธิ|กรม|กระทรวง|สำนักงาน|ดีไซน์|มีเดีย|เอเจนซี|ฟาร์ม|คาเฟ่|\b(?:co|ltd|inc|llc|plc|corp|company|studio|digital|media|group|labs?|agency|design|commerce|brand|store|shop|marketing|creative|productions?|works|tech|solutions?|partners|consulting|cafe|official|thailand|global)\b)/i;
const THAI_PERSON = /^[ก-๙]{2,20}(?:\s+[ก-๙]{2,20}){1,2}$/;
const ENGLISH_PERSON = /^[A-Z][a-z'-]{1,20}(?:\s+[A-Z][a-z'-]{1,20}){1,2}$/;
/** A cell of a client or name column that reads as a person, not a company. */
export const looksLikePerson = (text: string) => {
  const value = text.trim();
  return !BUSINESS_WORD.test(value) && (THAI_PERSON.test(value) || ENGLISH_PERSON.test(value));
};
export const isPeopleHeader = (header: string) => PEOPLE_HEADER.test(header);

/** Headers of columns that hold contact or identity data: every cell under them is masked. */
export const PERSONAL_HEADER = /(e-?mail|อีเมล|โทร(?!ทัศน์)|phone|\btel\b|mobile|มือถือ|เบอร์|ที่อยู่|address|เลขประจำตัว|บัตรประชาชน|id\s*card|citizen|tax\s*id|เลขผู้เสียภาษี|เลขภาษี|เลขบัญชี|account\s*(?:no|number)|bank\s*acc|ไลน์|line\s*id|facebook|instagram|\big\b|วันเกิด|birth|passport|พาสปอร์ต|ผู้ติดต่อ|contact)/i;
export const isPersonalHeader = (header: string) => PERSONAL_HEADER.test(header);

/** One cell, line or short text with its personal data masked. */
export function maskPersonalText(text: string): string {
  if (!text) return text;
  let out = text
    .replace(EMAIL, MASK.email)
    .replace(LINK, MASK.link)
    .replace(HANDLE, (_, before: string) => `${before}${MASK.handle}`)
    .replace(DIGIT_RUN, run => {
      const digits = run.replace(/\D/g, '');
      if (digits.length < 9 || DECIMAL_AMOUNT.test(run.trim())) return run;
      return MASK.number;
    })
    .replace(THAI_TITLE, (_, before: string) => `${before}${MASK.person}`)
    .replace(ENGLISH_TITLE, (_, before: string) => `${before}${MASK.person}`);
  // An address is judged one cell at a time: a line of a CSV or a table keeps its other cells.
  return out.split(/(\s*[|,\t]\s*)/).map(part => (/^\s*[|,\t]\s*$/.test(part) || !looksLikeAddress(part) ? part : MASK.address)).join('');
}

/** A longer text (a document, a slide, a pasted list) masked line by line. */
export const maskPersonalLines = (text: string) => text.split('\n').map(maskPersonalText).join('\n');

/** A table masked: its header row found, personal columns masked whole, every other cell masked as text. */
export function maskTable(rows: string[][]): string[][] {
  const head = rows.findIndex(row => row.filter(cell => cell.trim()).length >= 2);
  const personal = new Set<number>();
  const people = new Set<number>();
  if (head >= 0) rows[head].forEach((cell, index) => { if (isPersonalHeader(cell)) personal.add(index); else if (isPeopleHeader(cell)) people.add(index); });
  return rows.map((row, r) => row.map((cell, c) => {
    if (r <= head || !cell.trim()) return maskPersonalText(cell);
    if (personal.has(c)) return MASK.column;
    if (people.has(c) && looksLikePerson(cell)) return MASK.person;
    return maskPersonalText(cell);
  }));
}

/** A column's samples as they may leave the device: none for a personal column, the rest masked. */
export const maskSamples = (header: string, samples: string[]) => (isPersonalHeader(header) ? []
  : samples.map(sample => (isPeopleHeader(header) && looksLikePerson(sample) ? MASK.person : maskPersonalText(sample))).filter(Boolean));

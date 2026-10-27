// Changing the name เลขา calls the user by (owner, 2026-10-27: "อิงชื่อตามชื่อ account ... ถ้าบอกว่าอยากเปลี่ยนชื่อ ก็ให้มันเอา
// การ์ดมาแล้วให้กรอกชื่อใหม่ มันก็จะเปลี่ยนชื่อ account ใหม่"). เลขา only shows the card; the user saves the name through the
// profile API, as in Settings. A remembered nickname is never used any more.

const END = String.raw`(?:\s|นะ|ด้วย|ละกัน|แล้วกัน|ครับ|ค่ะ|คะ|จ้า|จ้ะ|ฮะ|เลย|อีก|[!.])*$`;
// "อยากเปลี่ยนชื่อ", "เปลี่ยนชื่อบัญชีเป็น ปาร์ค", "change my name": the user's own name, never a client's, a job's or a file's.
const RENAME = new RegExp(`^(?:อยาก|ขอ|ช่วย|จะ|ต้องการ|\\s)*(?:เปลี่ยน|แก้)(?:ไข)?ชื่อ(?:บัญชี|ที่แสดง|ผม|ฉัน|กู|เรา|หนู|ข้า|ดิฉัน|ตัวเอง|ของ(?:ผม|ฉัน|กู|เรา|หนู|ตัวเอง)|ที่(?:ให้)?เรียก(?:ผม|ฉัน|กู|เรา|หนู)?)?(?:หน่อย)?(?:\\s*(?:เป็น|ว่า)\\s*["“']?([^\\s"”'.,!?ๆ]{1,24}?)["”']?)?${END}`);
const RENAME_EN = /^(?:i\s+(?:want|would like)\s+to\s+|please\s+)?change\s+my\s+(?:account\s+)?name(?:\s+to\s+["“']?([^\s"”'.,!?]{1,24})["”']?)?[.!\s]*$/i;
/** A request to change the user's own name, with the new name when it was said. */
export function renameRequest(text: string): { name?: string } | undefined {
  const value = text.trim();
  const match = RENAME.exec(value) ?? RENAME_EN.exec(value);
  if (!match) return undefined;
  return match[1] && !/(อะไร|ไร$|ยังไง|ไหน|ใคร)/.test(match[1]) ? { name: match[1] } : {};
}
/** The rename card (in the app), or where to change the name (LINE has no form). */
export function renameReply(name: string, current: string | undefined, channel?: 'app' | 'line'): { text: string; card?: { kind: 'rename'; current: string; suggested: string } } {
  const suggested = name.trim().slice(0, 60);
  if (channel === 'line') return { text: suggested ? `เปลี่ยนชื่อบัญชีเป็น “${suggested}” ได้ในแอปครับ ที่ ตั้งค่า > ข้อมูลส่วนตัว > ชื่อที่แสดง แล้วผมจะเรียกตามชื่อนั้น` : 'เปลี่ยนชื่อบัญชีได้ในแอปครับ ที่ ตั้งค่า > ข้อมูลส่วนตัว > ชื่อที่แสดง แล้วผมจะเรียกตามชื่อนั้น' };
  return { text: suggested ? `เปลี่ยนชื่อบัญชีเป็น “${suggested}” ใช่ไหมครับ ตรวจชื่อแล้วกดบันทึกได้เลย ต่อไปผมจะเรียกตามชื่อบัญชี` : 'พิมพ์ชื่อใหม่ที่ต้องการแล้วกดบันทึกได้เลยครับ ต่อไปผมจะเรียกตามชื่อบัญชี',
    card: { kind: 'rename', current: current ?? '', suggested } };
}


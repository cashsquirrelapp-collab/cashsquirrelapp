// Which of the app's expense categories an everyday name belongs to (owner, 2026-11-15: "จ่ายกะเพรา 50 บาท มันก็มีคำถาม
// มาว่ากะเพราอยู่หมวดไหน ... มันเป็นความรู้พื้นฐานไหมที่มึงต้องรู้ว่าอะไรคืออาหาร อะไรคืออุปกรณ์"). Words in the name, not the
// whole name: "กะเพรา", "ค่าข้าวมันไก่", "ชาไข่มุก" are food; "ค่าเช่ากล้อง" is equipment. Rules only, no AI and no tokens; a
// name none of them knows gives null and LINE still asks, as before. The order settles names that touch two groups:
// "ค่าน้ำมัน" is travel, not the water bill; "สายชาร์จ" is equipment, not tea; "ปลาหมึก" is food, "หมึกพิมพ์" is not.

/** The app's expense categories, as the expense form and LINE's questions name them. */
export const EXPENSE_CATEGORY = {
  equipment: 'ค่าอุปกรณ์/ซอฟต์แวร์',
  ads: 'ค่าโฆษณา/ยิงแอด',
  travel: 'ค่าเดินทาง/น้ำมัน',
  food: 'อาหาร/รับรองลูกค้า',
  outsource: 'จ้างงานต่อ (Outsource)',
  tax: 'ภาษี/ธรรมเนียม',
  service: 'ค่าบริการ/สาธารณูปโภค',
} as const;

const RULES: [RegExp, string][] = [
  [/ภาษี|ธรรมเนียม|อากร|ค่าปรับ|ประกันสังคม|ค่าโอนเงิน/, EXPENSE_CATEGORY.tax],
  [/โฆษณา|ยิงแอด|แอดเฟซ|แอดเฟส|บูสต์|บูส|โปรโมท|\bads?\b|boost|promote/i, EXPENSE_CATEGORY.ads],
  [/จ้าง|outsource|ฟรีแลนซ์|freelance|ค่าตัว|ทีมงาน|ช่างภาพ|ตากล้อง|ช่างแต่งหน้า|นักแสดง|นายแบบ|นางแบบ|ผู้ช่วยกอง/i, EXPENSE_CATEGORY.outsource],
  [/อุปกรณ์|ซอฟต์แวร์|ซอฟแวร์|โปรแกรม|กล้อง|เลนส์|ขาตั้ง|ไมค์|หูฟัง|เมาส์|คีย์บอร์ด|คีบอร์ด|จอภาพ|จอคอม|มอนิเตอร์|คอมพิวเตอร์|โน้ตบุ๊|โน๊ตบุ๊|แมคบุ๊|ไอแพด|แท็บเล็ต|ฮาร์ดดิสก์|ฮาร์ดดิส|เมมโมรี่|การ์ดเมม|แฟลชไดรฟ์|สายชาร์จ|ที่ชาร์จ|อะแดปเตอร์|แบตเตอรี่|ไฟสตูดิโอ|ไฟถ่าย|ไฟ\s?led|หมึกพิมพ์|ตลับหมึก|เครื่องพิมพ์|ปริ้นเตอร์|เครื่องเขียน|กระดาษ|โดเมน|โฮสติ้ง|software|laptop|notebook|macbook|ipad|tablet|monitor|keyboard|mouse|\bssd\b|sd\s?card|adobe|photoshop|premiere|lightroom|canva|figma|capcut|chatgpt|icloud|google\s?one|domain|hosting|printer/i, EXPENSE_CATEGORY.equipment],
  [/เดินทาง|ค่ารถ|แท็กซี่|แท๊กซี่|มอไซค์|มอเตอร์ไซค์|วินมอ|ค่าวิน|รถไฟฟ้า|รถเมล์|รถตู้|รถทัวร์|รถไฟ|ทางด่วน|จอดรถ|ที่จอด|น้ำมัน|เครื่องบิน|ตั๋ว(?!หนัง|คอนเสิร์ต)|ค่าเรือ|เรือข้าม|โรงแรม|ที่พัก|เช่ารถ|taxi|grab(?!\s?food)|bolt|\bbts\b|\bmrt\b|airasia|air\s?asia|nok\s?air|hotel|agoda|booking/i, EXPENSE_CATEGORY.travel],
  [/ค่าไฟ|ไฟฟ้า|ค่าน้ำ(?!มัน)|ประปา|ค่าเน็ต|เน็ตบ้าน|อินเทอร์เน็ต|อินเตอร์เน็ต|ไวไฟ|ค่าโทร|โทรศัพท์|ค่ามือถือ|เติมเงิน|ค่าเช่า|ส่วนกลาง|ไปรษณีย์|ค่าส่ง|ส่งของ|ส่งพัสดุ|ขนส่ง|ค่าบริการ|ซักรีด|ทำความสะอาด|internet|wi-?fi|\bais\b|\btrue\b|dtac|kerry|flash\s?express|\bems\b|j&t|netflix|youtube\s?premium|spotify/i, EXPENSE_CATEGORY.service],
  [/อาหาร|ข้าว|กาแฟ|ชาไข่มุก|ชานม|ชาเขียว|ชาไทย|ชามะนาว|โกโก้|นม|ขนม|เค้ก|ไอศกรีม|ไอติม|กะเพรา|กระเพรา|กะเพา|ก๋วยเตี๋ยว|ก๊วยเตี๋ยว|เตี๋ยว|ส้มตำ|ไก่|หมู|เนื้อ(?!หา)|ปลา|กุ้ง|หมึก|ไข่|ผัด|แกง|ต้มยำ|ต้มข่า|ราดหน้า|สุกี้|ชาบู|บุฟเฟ่ต์|บุฟเฟต์|พิซซ่า|เบอร์เกอร์|แซนวิช|แซนด์วิช|โจ๊ก|บะหมี่|มาม่า|ขนมปัง|ผลไม้|น้ำดื่ม|น้ำเปล่า|น้ำแข็ง|น้ำปั่น|น้ำผลไม้|น้ำอัดลม|โค้ก|เบียร์|เครื่องดื่ม|มื้อ|เลี้ยง|รับรองลูกค้า|ร้านอาหาร|คาเฟ่|สตาร์บัค|ไลน์แมน|แกร็บฟู้ด|coffee|cafe|latte|pizza|burger|kfc|mcdonald|starbucks|amazon\s?cafe|grab\s?food|lineman|line\s?man|foodpanda|robinhood|shabu|sushi|ซูชิ|ราเมง|ramen/i, EXPENSE_CATEGORY.food],
];

/** The category an expense's name points to, or null when the name says nothing a rule knows. */
export function guessExpenseCategory(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const text = name.normalize('NFC').trim();
  if (!text || text.length > 200) return null;
  return RULES.find(([rule]) => rule.test(text))?.[1] ?? null;
}

/** The app's categories in the order the expense form lists them, "อื่นๆ" last. */
export const APP_EXPENSE_CATEGORIES = [...Object.values(EXPENSE_CATEGORY), 'อื่นๆ'] as const;
export const MAX_OWN_CATEGORIES = 100;
const tidyName = (name: string) => name.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 60);

/** The account's own categories, cleaned: no blanks, no repeats, none that is already the app's. */
export function ownCategories(settings?: unknown): string[] {
  const kept = (settings as { expenseCategories?: unknown } | null | undefined)?.expenseCategories;
  const list: unknown[] = Array.isArray(kept) ? kept : [];
  const app = new Set<string>(APP_EXPENSE_CATEGORIES);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const name = tidyName(raw);
    if (!name || app.has(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, MAX_OWN_CATEGORIES);
}

/** Every category the account can pick: the app's, then its own, "อื่นๆ" last. */
export function allExpenseCategories(settings?: unknown): string[] {
  return [...APP_EXPENSE_CATEGORIES.slice(0, -1), ...ownCategories(settings), 'อื่นๆ'];
}

/** The list with one more category, or the same list when the name is empty, the app's own or already there. */
export function withCategory(settings: unknown, name: string): string[] {
  const own = ownCategories(settings);
  const next = tidyName(name);
  if (!next || (APP_EXPENSE_CATEGORIES as readonly string[]).includes(next) || own.some(item => item.toLowerCase() === next.toLowerCase())) return own;
  return [...own, next].slice(0, MAX_OWN_CATEGORIES);
}

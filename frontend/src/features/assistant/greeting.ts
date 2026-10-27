import { T } from '../../i18n/tr';

// How เลขา greets (owner, 2026-10-27: "สวัสดีแตงโม ... สวัสดีที่อะไรหลายรอบจัง", it should be "สวัสดีตอนบ่าย สวัสดีตอนเช้า"
// or a sentence about what the person does often, "วันนี้มาอัปเดตงานอะไรไหม", "วันนี้มีเรื่องภาษีมาให้คำนวณอีกหรือเปล่า",
// so it reads as if เลขา cares). A greeting for the time of day, then one question about the person's habit, worked
// out on this device from the pages they open and what they ask (habits below). Nothing is sent anywhere.

export type Habit = 'jobs' | 'tax' | 'documents' | 'expenses' | 'receivables' | 'calendar';
export const HABITS: Habit[] = ['jobs', 'tax', 'documents', 'expenses', 'receivables', 'calendar'];

/** The time of day on the person's own clock. */
export function timeGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return T("สวัสดีตอนเช้าครับ");
  if (hour >= 12 && hour < 17) return T("สวัสดีตอนบ่ายครับ");
  if (hour >= 17 && hour < 21) return T("สวัสดีตอนเย็นครับ");
  if (hour >= 21) return T("สวัสดีตอนค่ำครับ");
  return T("ทำงานดึกเลยนะครับ");
}

const QUESTIONS: Record<Habit | 'none', string[]> = {
  jobs: [T("วันนี้มีงานไหนอยากอัปเดตไหมครับ"), T("วันนี้มีงานใหม่ให้ช่วยบันทึกไหมครับ")],
  tax: [T("วันนี้มีเรื่องภาษีให้ช่วยคำนวณอีกไหมครับ"), T("วันนี้อยากเช็กภาษีหรือหัก ณ ที่จ่ายเรื่องไหนครับ")],
  documents: [T("วันนี้จะออกใบเสนอราคาหรือใบแจ้งหนี้ให้ลูกค้าไหมครับ"), T("วันนี้มีเอกสารให้ช่วยเตรียมไหมครับ")],
  expenses: [T("วันนี้มีรายจ่ายให้ช่วยจดไหมครับ"), T("วันนี้มีบิลหรือค่าใช้จ่ายใหม่ให้บันทึกไหมครับ")],
  receivables: [T("วันนี้อยากเช็กเงินที่ยังไม่ได้รับไหมครับ"), T("วันนี้มีงานไหนต้องตามเงินไหมครับ")],
  calendar: [T("วันนี้อยากดูกำหนดส่งงานหรือวันรับเงินไหมครับ")],
  none: [T("วันนี้อยากให้เลขากระรอกช่วยอะไรครับ")],
};

/** The page a habit belongs to (the sidebar's pages; the overview, settings and the chat itself are no habit). */
export function habitOfPage(page: string): Habit | null {
  switch (page) {
    case 'jobs': return 'jobs';
    case 'tax': case 'wht50': return 'tax';
    case 'invoice': case 'vault': return 'documents';
    case 'incomeExpense': return 'expenses';
    case 'receivables': return 'receivables';
    case 'calendar': return 'calendar';
    default: return null;
  }
}

/** What a question to เลขา is about, by its words (Thai and English). */
export function habitOfText(text: string): Habit | null {
  const t = text.toLowerCase();
  if (/ภาษี|หัก\s*ณ\s*ที่จ่าย|50\s*ทวิ|ภ\.?ง\.?ด|ลดหย่อน|vat|tax|withholding/.test(t)) return 'tax';
  if (/ใบเสนอราคา|ใบแจ้งหนี้|ใบเสร็จ|ใบกำกับ|เอกสาร|quote|quotation|invoice|receipt/.test(t)) return 'documents';
  if (/ค้างรับ|ยังไม่ได้รับ|รอรับเงิน|ตามเงิน|เลยกำหนด|overdue|unpaid/.test(t)) return 'receivables';
  if (/รายจ่าย|ค่าใช้จ่าย|บิล|จ่ายค่า|expense|bill/.test(t)) return 'expenses';
  if (/ปฏิทิน|กำหนดส่ง|นัด|calendar|deadline/.test(t)) return 'calendar';
  if (/งาน|โปรเจกต์|ลูกค้า|ค่าจ้าง|job|project|client/.test(t)) return 'jobs';
  return null;
}

/** Counts per day and habit: a page opened counts 1, a question asked 2 (asking says more than looking). */
export type HabitLog = Record<string, Partial<Record<Habit, number>>>;
const KEEP_DAYS = 30;

/** The person's habit over the last 30 days: the one counted most, once it has been counted a few times. */
export function topHabit(log: HabitLog, today: string): Habit | null {
  const from = shiftDay(today, -(KEEP_DAYS - 1));
  const totals: Partial<Record<Habit, number>> = {};
  for (const [day, counts] of Object.entries(log)) {
    if (day < from || day > today) continue;
    for (const habit of HABITS) totals[habit] = (totals[habit] ?? 0) + (counts[habit] ?? 0);
  }
  let best: Habit | null = null;
  for (const habit of HABITS) if ((totals[habit] ?? 0) >= 3 && (!best || (totals[habit] ?? 0) > (totals[best] ?? 0))) best = habit;
  return best;
}

/** The log with one more count, days older than 30 dropped. */
export function counted(log: HabitLog, today: string, habit: Habit, by = 1): HabitLog {
  const from = shiftDay(today, -(KEEP_DAYS - 1));
  const next: HabitLog = {};
  for (const [day, counts] of Object.entries(log)) if (day >= from && day <= today) next[day] = { ...counts };
  next[today] = { ...next[today], [habit]: (next[today]?.[habit] ?? 0) + by };
  return next;
}

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** The greeting: the time of day, then a question about the habit (or, without one yet, about the page the person is
 *  on). `seed` picks one of a habit's ways of asking, so it does not say the same words every time. */
export function greetingFor({ hour, habit, page, seed }: { hour: number; habit: Habit | null; page?: Habit | null; seed: number }): { title: string; line: string } {
  const questions = QUESTIONS[habit ?? page ?? 'none'];
  return { title: timeGreeting(hour), line: questions[Math.abs(seed) % questions.length] };
}

// The log lives on this device, per account (a convenience: losing it only means a plainer greeting).
const storeKey = (accountId?: string) => `krarok.habits.${accountId || 'guest'}`;
const localDay = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
function readLog(accountId?: string): HabitLog {
  try { const value = JSON.parse(window.localStorage.getItem(storeKey(accountId)) || '{}'); return value && typeof value === 'object' ? value as HabitLog : {}; } catch { return {}; }
}
function note(accountId: string | undefined, habit: Habit | null, by: number) {
  if (!habit || !accountId) return;
  try { window.localStorage.setItem(storeKey(accountId), JSON.stringify(counted(readLog(accountId), localDay(), habit, by))); } catch { /* private mode */ }
}
export const notePage = (accountId: string | undefined, page: string) => note(accountId, habitOfPage(page), 1);
export const noteQuestion = (accountId: string | undefined, text: string) => note(accountId, habitOfText(text), 2);

/** Today's greeting for this account, on the person's clock. */
export function greetingNow(accountId: string | undefined, page?: string): { title: string; line: string } {
  const now = new Date();
  const day = localDay(now);
  const seed = Number(day.replace(/-/g, '')) + now.getHours();
  return greetingFor({ hour: now.getHours(), habit: topHabit(readLog(accountId), day), page: page ? habitOfPage(page) : null, seed });
}

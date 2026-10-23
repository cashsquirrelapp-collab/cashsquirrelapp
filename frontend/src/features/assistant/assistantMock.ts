import type { MascotAction, MascotMood } from '../../components/mascot/Mascot';
import { tr, T } from '../../i18n/tr';
import { lineReplyFor, sampleLineNotices, type LineCardData } from './lineMock';

// เลขากระรอก chat (owner's brief "KRAROK — AI SECRETARY CHAT UI BRIEF", 2026-10-23): the screen only.
// Every conversation, card and token figure here is labelled sample data. A real AI replaces this file
// through the AssistantTransport in assistantApi.ts; the screen stays the same.

/** What the squirrel is doing (official mascot, existing moods and actions only). */
export type AssistantMode = 'greeting' | 'awake' | 'sleeping' | 'listening' | 'thinking' | 'working' | 'done';

export type ProjectCard = { kind: 'project'; name: string; client: string; amount: string; status: string };
export type DocumentCard = { kind: 'document'; docType: string; number: string; client: string; amount: string; path: string };
export type SummaryCard = { kind: 'summary'; period: string; income: string; expense: string; balance: string };
export type ConfirmCard = { kind: 'confirm'; id: string; title: string; changes: { label: string; value: string }[] };
/** A LINE notification card (LineCard.tsx), the same template the app sends to LINE. */
export type LineChatCard = { kind: 'line'; card: LineCardData };
export type ChatCard = ProjectCard | DocumentCard | SummaryCard | ConfirmCard | LineChatCard;

/** `failed` + `question`: a send that did not go through, kept so it can be retried. */
export type ChatMessage = { id: string; from: 'me' | 'bot'; text: string; cards?: ChatCard[]; at: number; failed?: boolean; question?: string; note?: string };
export type ChatGroup = 'today' | 'yesterday' | 'week';
/** `kind: 'line'`: the pinned automatic-notifications thread, drawn like a LINE chat. */
export type Conversation = { id: string; title: string; group: ChatGroup; sample: boolean; messages: ChatMessage[]; kind?: 'line'; unread?: number; pinned?: boolean; archived?: boolean };
export const LINE_THREAD_ID = 'line-notices';
export type TokenBalance = { remaining: number; total: number; refillsOn: string };

/** UI states the team can preview from the chat menu (brief §11). */
export type PreviewState = 'normal' | 'tokensLow' | 'tokensEmpty' | 'trialExpired' | 'proRequired' | 'offline' | 'actionFails';
export const PREVIEW_STATES: { id: PreviewState; label: string }[] = [
  { id: 'normal', label: T("ปกติ") },
  { id: 'tokensLow', label: T("โทเค็นใกล้หมด") },
  { id: 'tokensEmpty', label: T("โทเค็นหมด") },
  { id: 'trialExpired', label: T("ช่วงทดลองใช้หมดอายุ") },
  { id: 'proRequired', label: T("ต้องใช้ Pro") },
  { id: 'offline', label: T("การเชื่อมต่อล้มเหลว") },
  { id: 'actionFails', label: T("ทำรายการไม่สำเร็จ") },
];

/** Sample only (the brief's example): no billing or token deduction is connected. */
export const SAMPLE_TOKENS: TokenBalance = { remaining: 730, total: 1000, refillsOn: '2026-11-01' };
export const LOW_TOKENS = 100;
/** How long with nothing happening before the squirrel naps. */
export const NAP_AFTER_MS = 30_000;

export function poseFor(mode: AssistantMode): { mood: MascotMood; action: MascotAction } {
  switch (mode) {
    case 'greeting': return { mood: 'wave', action: 'wave' };
    case 'sleeping': return { mood: 'sleepy', action: 'sleep' };
    case 'listening': return { mood: 'checking', action: 'idle' };
    case 'thinking': return { mood: 'thinking', action: 'idle' };
    case 'working': return { mood: 'happy', action: 'typing' };
    case 'done': return { mood: 'proud', action: 'idle' };
    default: return { mood: 'happy', action: 'idle' };
  }
}

export function statusFor(mode: AssistantMode): string {
  switch (mode) {
    case 'greeting': return tr("สวัสดีครับ");
    case 'sleeping': return tr("งีบอยู่");
    case 'listening': return tr("กำลังฟังอยู่");
    case 'thinking': return tr("กำลังคิด");
    case 'working': return tr("กำลังพิมพ์คำตอบ");
    case 'done': return tr("ตอบแล้ว");
    default: return tr("พร้อมช่วยแล้ว");
  }
}

/** Welcome cards (2 × 2): a short label on the card; tapping it asks the full question. */
export type SuggestionIcon = 'today' | 'quote' | 'howto' | 'unpaid';
export const SUGGESTIONS: { label: string; ask: string; icon: SuggestionIcon }[] = [
  { label: T("สรุปงานของวันนี้"), ask: T("สรุปงานของวันนี้"), icon: 'today' },
  { label: T("ใบเสนอราคาอยู่ตรงไหน"), ask: T("ใบเสนอราคาอยู่ตรงไหน"), icon: 'quote' },
  { label: T("วิธีเพิ่มโปรเจกต์"), ask: T("ช่วยอธิบายวิธีเพิ่มโปรเจกต์"), icon: 'howto' },
  { label: T("งานที่ยังไม่ได้รับเงิน"), ask: T("ตรวจงานที่ยังไม่ได้รับเงิน"), icon: 'unpaid' },
];

type Intent = 'today' | 'quote' | 'howto' | 'add' | 'unpaid' | 'other';
export function intentOf(text: string): Intent {
  const q = text.toLowerCase();
  if (/วิธี|อธิบาย|how/.test(q)) return 'howto';
  if (/ยังไม่ได้รับ|รอรับ|ค้าง|ทวง|unpaid|owed/.test(q)) return 'unpaid';
  if (/ใบเสนอราคา|เอกสาร|ใบแจ้งหนี้|ใบเสร็จ|quot|invoice|document/.test(q)) return 'quote';
  if (/เพิ่มงาน|เพิ่มโปรเจกต์|add/.test(q)) return 'add';
  if (/สรุป|วันนี้|summary|today/.test(q)) return 'today';
  return 'other';
}

const cards = {
  summary: (): SummaryCard => ({ kind: 'summary', period: tr("ตุลาคม 2569"), income: '฿11,640', expense: '-฿1,990', balance: '฿9,650' }),
  quote: (): DocumentCard => ({ kind: 'document', docType: tr("ใบเสนอราคา"), number: 'QT-2569-008', client: tr("บริษัท ตัวอย่าง จำกัด"), amount: '฿12,000', path: '/invoice' }),
  project: (): ProjectCard => ({ kind: 'project', name: tr("ถ่ายภาพแคมเปญ"), client: tr("บริษัท ตัวอย่าง จำกัด"), amount: '฿8,000', status: tr("รอยืนยัน") }),
  confirm: (id: string): ConfirmCard => ({ kind: 'confirm', id, title: tr("เพิ่มงานใหม่ 1 งาน"), changes: [
    { label: tr("งาน"), value: tr("ถ่ายภาพแคมเปญ") }, { label: tr("ลูกค้า"), value: tr("บริษัท ตัวอย่าง จำกัด") },
    { label: tr("ค่าจ้าง"), value: '฿8,000' }, { label: tr("ครบกำหนดรับเงิน"), value: tr("30 วันหลังส่งงาน") },
  ] }),
};

/** The sample answer for a question. A real AI replaces this; the shape (markdown text + cards) stays. */
export function sampleReply(text: string, confirmId: string): { text: string; cards?: ChatCard[] } {
  // Quick reply messages get the card LINE itself answers with.
  const line = lineReplyFor(text, Date.now());
  if (line) return { text: '', cards: [{ kind: 'line', card: line }] };
  switch (intentOf(text)) {
    case 'today': return { text: tr("วันนี้มี **3 งาน** ที่ต้องติดตามครับ\n\n| งาน | ลูกค้า | สถานะ |\n|---|---|---|\n| ถ่ายภาพแคมเปญ | บริษัท ตัวอย่าง จำกัด | ครบกำหนดพรุ่งนี้ |\n| ตัดต่อวิดีโอโปรโมต | สตูดิโอตัวอย่าง | เลยกำหนด 3 วัน |\n| ออกแบบโลโก้ | ร้านตัวอย่าง | กำลังทำ |\n\nดูทั้งหมดได้ที่ [หน้างาน](/jobs)"), cards: [cards.summary()] };
    case 'quote': return { text: tr("เจอแล้วครับ ใบเสนอราคาล่าสุดของ **บริษัท ตัวอย่าง จำกัด** อยู่ในหน้าเอกสาร"), cards: [cards.quote()] };
    case 'howto': return { text: tr("เพิ่มโปรเจกต์ได้ใน 3 ขั้นตอนครับ\n\n1. ไปที่ [หน้างาน](/jobs) แล้วกด **เพิ่มงาน**\n2. ใส่ชื่องาน ลูกค้า และค่าจ้าง\n3. ตั้งวันครบกำหนดรับเงิน แล้วกด **บันทึก**\n\nถ้าบอกรายละเอียดมา ผมจะเตรียมรายการให้กดยืนยันในแชตได้เลย") };
    case 'add': return { text: tr("นี่คือรายละเอียดที่จะบันทึกครับ ตรวจสอบก่อนกดยืนยันได้เลย"), cards: [cards.project(), cards.confirm(confirmId)] };
    case 'unpaid': return { text: tr("มี **2 งาน** ที่ยังไม่ได้รับเงิน รวม **฿23,000**\n\n1. **ตัดต่อวิดีโอโปรโมต** — ฿15,000 · เลยกำหนด 3 วัน\n2. **ถ่ายภาพแคมเปญ** — ฿8,000 · ครบกำหนดพรุ่งนี้\n\nแนะนำให้ส่งข้อความถึงลูกค้างานแรกวันนี้ครับ ดูรายละเอียดได้ที่ [เงินรอรับ](/receivables)") };
    default: return { text: tr("ตอนนี้เป็นหน้าจอตัวอย่างครับ เมื่อเชื่อมต่อ AI แล้ว เลขากระรอกจะตอบจากข้อมูลงาน เอกสาร และการเงินของคุณ") };
  }
}

/** The sidebar's sample history: each one says it is a sample. */
export function sampleConversations(now: number): Conversation[] {
  const min = 60_000;
  const turn = (id: string, ask: string, ago: number): ChatMessage[] => {
    const reply = sampleReply(ask, `${id}-confirm`);
    return [
      { id: `${id}-q`, from: 'me', text: ask, at: now - ago },
      { id: `${id}-a`, from: 'bot', text: reply.text, cards: reply.cards, at: now - ago + min },
    ];
  };
  const notices: Conversation = {
    id: LINE_THREAD_ID, title: tr("แจ้งเตือนอัตโนมัติ"), group: 'today', sample: true, kind: 'line', unread: 1,
    messages: sampleLineNotices(now).map(notice => ({ id: notice.id, from: notice.from, text: notice.text, at: notice.at, ...(notice.line ? { cards: [{ kind: 'line' as const, card: notice.line }] } : {}) })),
  };
  return [
    notices,
    { id: 'today-summary', title: tr("สรุปงานของวันนี้"), group: 'today', sample: true, messages: turn('today-summary', tr("สรุปงานของวันนี้ให้หน่อย"), 40 * min) },
    { id: 'quote', title: tr("ใบเสนอราคาของบริษัท ตัวอย่าง"), group: 'today', sample: true, messages: turn('quote', tr("ใบเสนอราคาของบริษัท ตัวอย่าง อยู่ตรงไหน"), 95 * min) },
    { id: 'add-project', title: tr("เพิ่มงานถ่ายภาพแคมเปญ"), group: 'yesterday', sample: true, messages: turn('add-project', tr("เพิ่มงานถ่ายภาพแคมเปญให้บริษัท ตัวอย่าง ค่าจ้าง 8,000 บาท"), 26 * 60 * min) },
    { id: 'unpaid', title: tr("งานที่ยังไม่ได้รับเงิน"), group: 'week', sample: true, messages: turn('unpaid', tr("ตรวจงานที่ยังไม่ได้รับเงิน"), 4 * 24 * 60 * min) },
  ];
}

/** Rough count for the sample token figures. */
export const estimateTokens = (text: string): number => Math.max(8, Math.ceil(text.trim().length / 6));

/** เลขากระรอกติดตัว (AssistantBuddy.tsx, owner 2026-10-23): what each page is for, in the app's own words (the
 *  phone เมนู's descriptions), so "หน้านี้ใช้ทำอะไร" answers truthfully wherever the squirrel is. */
export const PAGE_ABOUT: Record<string, string> = {
  dashboard: T("ภาพรวมรายรับ รายจ่าย และงานที่ต้องติดตามของเดือนนี้"),
  jobs: T("งานทั้งหมด สถานะ และการรับเงินของแต่ละงาน"),
  calendar: T("วันรับเงินและรายการที่ต้องติดตาม"),
  receivables: T("ยอดตามวันครบกำหนด ยอดค้างจากเดือนก่อน และเตือนตามเงิน"),
  incomeExpense: T("บันทึกและดูรายการรายจ่าย"),
  invoice: T("ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ใบกำกับภาษี"),
  vault: T("สัญญา สลิป และหลักฐานแนบงาน"),
  wht50: T("ใบรับรองหัก ณ ที่จ่ายของแต่ละงาน"),
  report: T("รายรับ ลูกค้า ประเภท และจังหวะรับเงิน"),
  tax: T("รายได้ ค่าใช้จ่าย ลดหย่อน และสรุป"),
  split: T("เป้าหมาย การแบ่งเงิน ฝาก ถอน โอน"),
  groups: T("กลุ่ม คำเชิญ และบทบาท"),
  settings: T("ผู้ออกเอกสาร สำรองข้อมูล และอื่น ๆ"),
  feedback: T("แจ้งปัญหา เสนอไอเดีย หรือคุยกับทีม"),
  plans: T("ราคาและสถานะแพ็กเกจ Pro"),
};
export const PAGE_HELP = T("หน้านี้ใช้ทำอะไร");
/** Three questions that fit the page you are on. */
export function buddyPrompts(page: string): string[] {
  switch (page) {
    case 'dashboard': return [PAGE_HELP, T("สรุปเดือนนี้"), T("ตรวจงานที่ยังไม่ได้รับเงิน")];
    case 'jobs': return [T("ช่วยเพิ่มงานใหม่ให้หน่อย"), T("ตรวจงานที่ยังไม่ได้รับเงิน"), PAGE_HELP];
    case 'calendar': return [T("สรุปงานของวันนี้"), T("รอรับเงิน"), PAGE_HELP];
    case 'receivables': return [T("รอรับเงิน"), T("ตรวจงานที่ยังไม่ได้รับเงิน"), PAGE_HELP];
    case 'incomeExpense': return [T("สรุปเดือนนี้"), PAGE_HELP, T("สรุปงานของวันนี้")];
    case 'invoice': case 'vault': case 'wht50': return [T("ใบเสนอราคาอยู่ตรงไหน"), PAGE_HELP, T("สรุปงานของวันนี้")];
    default: return [PAGE_HELP, T("สรุปงานของวันนี้"), T("ตรวจงานที่ยังไม่ได้รับเงิน")];
  }
}
/** The sample answer to "หน้านี้ใช้ทำอะไร" on a page. */
export function pageHelpReply(page: string, pageName: string): string {
  const about = PAGE_ABOUT[page];
  return about
    ? tr("หน้า**{0}**ใช้ดู{1}ครับ ติดตรงไหนถามได้เลย หรือพิมพ์ให้ผมช่วยทำแทนก็ได้", pageName, tr(about))
    : tr("ตอนนี้คุณอยู่หน้า**{0}**ครับ ติดตรงไหนถามได้เลย", pageName);
}

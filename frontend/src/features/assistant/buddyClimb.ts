import type { MascotMood } from '../../components/mascot/Mascot';
import { T } from '../../i18n/tr';
import type { AssistantMode } from './assistantMock';

// When the corner squirrel climbs out of its ring on the "ถามเลขากระรอก ⌘K" pill, and what it says above its head
// (owner, 2026-10-26: "มุดออกมาจากวงกลมแล้วก็เกาะอยู่ ... จะมีคำโผล่มาบนหัวน้อง"). Only real events count: a send
// in progress, an answer that arrived while the chat was closed, a card waiting for a yes, a save the server
// confirmed, or something that failed. The words are fixed (no AI writes them) and formal.

/** Something that happened while the chat was closed, kept until the user opens it (or, for a save, a moment). */
export type BuddyNews = 'answered' | 'done' | 'failed' | null;

export type Climb = {
  /** Which line it is, for tests and for replaying the words when they change. */
  kind: 'thinking' | 'working' | 'failed' | 'awaiting' | 'done' | 'answered' | 'hello';
  mood: MascotMood;
  /** Thai, shown through tr(). */
  words: string;
  /** A row of dots after the words (still thinking). */
  dots?: boolean;
};

/** Most important first, as the brief orders them: what is happening now, then failures, then a card waiting for a
 *  yes, then a save, then an unread answer, and a hello only while the pointer rests on the pill. */
export function climbFor({ mode, pending, news, hover }: { mode: AssistantMode; pending: boolean; news: BuddyNews; hover: boolean }): Climb | null {
  if (mode === 'thinking') return { kind: 'thinking', mood: 'thinking', words: T("กำลังคิด"), dots: true };
  if (mode === 'working') return { kind: 'working', mood: 'happy', words: T("กำลังพิมพ์คำตอบ") };
  if (news === 'failed') return { kind: 'failed', mood: 'worried', words: T("ยังไม่สำเร็จ ดูรายละเอียดในแชต") };
  if (pending) return { kind: 'awaiting', mood: 'checking', words: T("ร่างเสร็จแล้ว กรุณาตรวจก่อนยืนยัน") };
  if (news === 'done') return { kind: 'done', mood: 'proud', words: T("บันทึกเรียบร้อยแล้ว") };
  if (news === 'answered') return { kind: 'answered', mood: 'happy', words: T("คำตอบพร้อมแล้ว") };
  if (hover) return { kind: 'hello', mood: 'happy', words: T("มีอะไรให้ช่วยไหมครับ") };
  return null;
}

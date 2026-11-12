import type { SheetMap } from '../../../shared/googleSheets.js';
import { chooseTab } from '../../../shared/sheetRow.js';
import { labState } from '../../../shared/labs.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { loadLabs } from '../repositories/labs.js';
import { isOwnerUserId } from '../repositories/roles.js';
import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineCard, lineValueRow } from './lineCards.js';

// เชื่อมชีตจาก LINE (owner, 2026-11-13): the card that starts it, and the one that says it is done. The first opens the LINE
// page (?connect=sheets), which hands the person to their phone's own browser, where Google's sign-in works.

function step(title: string, detail: string) {
  return { type: 'box', layout: 'vertical', spacing: 'xs', margin: 'lg', contents: [
    { type: 'text', text: title, size: 'sm', weight: 'bold', color: C.text, wrap: true },
    { type: 'text', text: detail, size: 'xs', color: C.muted, wrap: true },
  ] };
}

export function buildLineConnectSheet(liffId: string | undefined): LineMessage {
  return lineCard({
    title: 'เชื่อมชีตของคุณ', subtitle: 'ให้เลขาลงรายการในไฟล์ที่คุณใช้อยู่', character: 'document',
    altText: 'เชื่อมชีตของคุณ ให้เลขากระรอกลงรายการใน Google Sheets ที่คุณใช้อยู่',
    body: [
      step('1. เปิดในเบราว์เซอร์ของมือถือ', 'Google ให้ล็อกอินนอกแอป LINE เท่านั้น ระบบพาเข้าบัญชีให้เอง'),
      step('2. ล็อกอิน Google แล้วเลือกไฟล์', 'เลขาเห็นเฉพาะไฟล์ที่คุณเลือก'),
      step('3. ตรวจว่าเลขาอ่านคอลัมน์ถูก แล้วกดบันทึก', 'จากนั้นกลับมาบันทึกในแชทนี้ได้เลย'),
    ],
    note: 'เลขาเพิ่มแถวเมื่อคุณกดยืนยันในการ์ดเท่านั้น และย้อนกลับได้ภายใน 30 นาที',
    ...(liffId ? { footer: { label: 'เชื่อมชีต', uri: `https://liff.line.me/${liffId}?connect=sheets` } } : {}),
  });
}

export function buildLineSheetConnected(file: { name: string; url?: string }, map: SheetMap): LineMessage {
  const expenses = chooseTab(map, 'expense');
  const jobs = chooseTab(map, 'job');
  return lineCard({
    title: 'เชื่อมชีตแล้ว', subtitle: file.name, character: 'document',
    altText: `เชื่อมชีต ${file.name} แล้ว รายการที่บันทึกผ่านแชทจะลงชีตนี้`,
    body: [
      lineValueRow('ไฟล์', file.name, { bold: false }),
      lineValueRow('รายจ่ายลงแท็บ', expenses?.name ?? 'ยังไม่มีแท็บรายจ่าย', { bold: false }),
      lineValueRow('งาน / รายรับลงแท็บ', jobs?.name ?? 'ยังไม่มีแท็บรายรับ', { bold: false }),
    ],
    note: 'พิมพ์บอกเลขาได้เลย เช่น “ค่ากาแฟ 60” แล้วกดยืนยัน เลขาจะเพิ่มแถวให้',
    ...(file.url ? { footer: { label: 'เปิดชีต', uri: file.url } } : {}),
  });
}

/** Whether the Sheets test feature is open to this account (customers never see unreleased features). */
export async function sheetsOpenFor(userId: string): Promise<boolean> {
  const [record, owner] = await Promise.all([loadLabs(userId), isOwnerUserId(userId)]);
  return labState(record, owner).on.includes('sheets');
}

/** The card for "เชื่อมชีต" typed in LINE: only for a linked account the feature is open to. */
export async function connectSheetCardFor(lineUserId: string): Promise<LineMessage | null> {
  const link = await getSupabaseAdmin().from('cashflow_line_links').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (link.error) throw link.error;
  const userId = (link.data as { user_id?: string } | null)?.user_id;
  if (!userId || !(await sheetsOpenFor(userId))) return null;
  return buildLineConnectSheet(process.env.LIFF_ID);
}

/** After the first map of a file is saved: the done card in the account's LINE chat, if it has one. Best effort. */
export async function tellLineSheetConnected(userId: string, file: { name: string; url?: string }, map: SheetMap): Promise<boolean> {
  const link = await getSupabaseAdmin().from('cashflow_line_links').select('line_user_id').eq('user_id', userId).maybeSingle();
  const lineUserId = (link.data as { line_user_id?: string } | null)?.line_user_id;
  if (link.error || !lineUserId) return false;
  const { sendLineMessagePayload } = await import('./line.js');
  return sendLineMessagePayload(lineUserId, buildLineSheetConnected(file, map));
}

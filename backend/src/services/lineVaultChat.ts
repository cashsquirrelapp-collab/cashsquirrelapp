import type { LineMessage } from './line.js';
import { lineAppLink, lineCard, LINE_CARD_COLORS } from './lineCards.js';
import { findUserByLineId, isProUser, recentChatHistory, saveChatHistory, type UserRow } from './lineAssistant.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { listVaultFiles, storeVaultFile, updateVaultFile } from './vault.js';
import { VAULT_FREE_FILES, VAULT_KIND_LABEL, VAULT_MAX_BYTES, VAULT_MAX_FILES, sniffVaultMime, type VaultKind } from '../../../shared/vault.js';
import { freeMonthlyTokens } from './lineFirst.js';
import { ATTACHMENT_MAX_BYTES, MAX_FILES, checkAttachment, checkAttachments } from '../ai/attachment.js';
import type { ChatFile } from '../ai/types.js';
import type { LineAnswer } from '../ai/lineBridge.js';
import { dropImageParts, groupIdFor, linkCardsToFiles, noteImagePart, rememberFileLinks, rememberFileProposals, saveCardGroup, type ImagePart } from './lineFileLinks.js';
import { cardGroupMessage, lineAssistantReply } from '../ai/lineFormat.js';
import { rateLimit } from '../security/rateLimit.js';
import { lineAreaOpen } from './lineLaunch.js';
import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';
import { SheetFileError, sheetFileKind, spreadsheetText } from '../../../shared/sheetFileText.js';
import { DocumentFileError, documentFileKind, documentText } from '../../../shared/documentFileText.js';

type AttachKind = 'wht50' | 'contract' | 'expense' | 'other';
export type VaultAction = { step: 'choose'; kind: AttachKind; fileId: string }
  | { step: 'attach'; kind: Exclude<AttachKind, 'other'>; fileId: string; targetId: string };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const actionPattern = new RegExp(`^vault:(choose|attach):(wht50|contract|expense|other):(${uuid})(?::([A-Za-z0-9_-]{1,120}))?$`, 'i');

export function decodeVaultAction(data: string): VaultAction | null {
  const match = actionPattern.exec(data);
  if (!match) return null;
  const [, step, kind, fileId, targetId] = match;
  if (step === 'choose' && !targetId) return { step, kind: kind as AttachKind, fileId };
  if (step === 'attach' && kind !== 'other' && targetId) return { step, kind: kind as Exclude<AttachKind, 'other'>, fileId, targetId };
  return null;
}

export interface LineFileEvent { id?: string; type: string; fileName?: string; fileSize?: number; imageSet?: { id?: string; index?: number; total?: number } }

async function owner(lineUserId: string): Promise<{ user: UserRow; auth: NonNullable<Awaited<ReturnType<ReturnType<typeof getSupabaseAdmin>['auth']['admin']['getUserById']>>['data']['user']>; maxFiles?: number } | LineMessage> {
  const user = await findUserByLineId(lineUserId);
  if (!user) return { type: 'text', text: isPhaseOneFeatureAvailable('vault', false) ? 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน จึงจะเก็บไฟล์เข้าคลังส่วนตัวได้ครับ' : 'ตอนนี้ LINE ยังรับไฟล์และรูปภาพไม่ได้ครับ' };
  const access = await checkLinkedAccountWriteAccess(user.user_id);
  if (!access.allowed) return { type: 'text', text: access.error };
  // The document vault is not on the website for ordinary accounts yet, so LINE does not keep files for them either.
  if (!await lineAreaOpen('vault', user.user_id)) return { type: 'text', text: 'ตอนนี้ LINE ยังรับไฟล์และรูปภาพไม่ได้ครับ' };
  const account = await getSupabaseAdmin().auth.admin.getUserById(user.user_id);
  // Files follow the LINE chat (owner, 2026-11-13: "ปลดให้หมด"): every account while the free allowance is on, with the
  // free vault's file count as on the website (vault-upload.ts); Pro only while it is off, as production is today.
  const pro = account.error || !account.data.user ? false : await isProUser(user.user_id);
  if (account.error || !account.data.user || (!pro && !freeMonthlyTokens())) {
    return { type: 'text', text: 'การแนบไฟล์ผ่าน LINE ใช้ได้ในช่วงทดลองหรือแพ็กเกจ Pro ครับ' };
  }
  return { user, auth: account.data.user, maxFiles: pro ? VAULT_MAX_FILES : VAULT_FREE_FILES };
}

/** Limit the bytes while streaming; LINE may omit or misstate the Content-Length. */
export async function readLineFile(id: string, token: string, fetcher: typeof fetch = fetch): Promise<Buffer> {
  if (!/^\d{1,40}$/.test(id)) throw new Error('Invalid LINE message ID');
  const response = await fetcher(`https://api-data.line.me/v2/bot/message/${id}/content`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw new Error('LINE content unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > VAULT_MAX_BYTES) throw new Error('LINE file exceeds vault limit');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return Buffer.concat(chunks, size);
}

const choice = (label: string, kind: AttachKind, fileId: string) => ({
  type: 'button', style: 'secondary', color: LINE_CARD_COLORS.subtle, height: 'sm', margin: 'sm',
  action: { type: 'postback', label, data: `vault:choose:${kind}:${fileId}` },
});

export function fileSavedCard(fileId: string, fileName: string): LineMessage {
  return lineCard({
    compact: true, title: 'เก็บไฟล์ไว้แล้ว', subtitle: 'อยู่ในคลังเอกสารส่วนตัวของคุณ', character: 'document',
    altText: `เก็บ ${fileName} แล้ว · เลือกประเภทและงานที่เกี่ยวข้อง`,
    body: [
      { type: 'text', text: fileName.slice(0, 100), size: 'sm', weight: 'bold', color: LINE_CARD_COLORS.text, wrap: true },
      { type: 'text', text: 'เลือกประเภทเพื่อผูกไฟล์กับงานหรือรายจ่าย', size: 'xs', color: LINE_CARD_COLORS.muted, wrap: true, margin: 'md' },
      choice('ใบ 50 ทวิ', 'wht50', fileId), choice('สัญญา / PO', 'contract', fileId),
      choice('บิล / สลิป', 'expense', fileId), choice('เก็บเป็นไฟล์อื่น', 'other', fileId),
    ],
    note: 'ถ้ายังไม่เลือก ไฟล์จะอยู่ในหมวดอื่น ๆ และยังไม่ปิดรายการที่รอเอกสาร',
  });
}

/** What a person sending a picture or PDF in LINE asks of เลขา, in their words. */
export const LINE_FILE_REQUEST = 'ช่วยอ่านไฟล์นี้ แล้วเตรียมบันทึกรายรับหรือรายจ่ายให้หน่อย';
/** A spreadsheet in LINE: เลขา prepares a card for each record row (at most LINE_SHEET_ROWS of them). */
export const LINE_SHEET_REQUEST = 'ช่วยอ่านตารางในไฟล์นี้ แล้วเตรียมบันทึกรายรับหรือรายจ่ายให้ทุกแถวที่เป็นรายการ แถวหัวตารางและแถวรวมไม่ต้องบันทึก';
/** More rows than this go to the app's import (one go, columns matched there) instead of a card per row in the chat. */
export const LINE_SHEET_ROWS = 20;

/** A long spreadsheet: the app's นำเข้าจาก Excel takes the whole file at once. */
export function sheetImportCard(fileName: string, rows: number, tabs: number): LineMessage {
  return lineCard({
    title: `ไฟล์นี้มี ${rows.toLocaleString('en-US')} แถว`, subtitle: fileName, character: 'document', compact: true,
    altText: `ไฟล์ ${fileName} มี ${rows} แถว นำเข้าทีเดียวได้ที่ เมนู งาน › นำเข้าจาก Excel`,
    body: [
      { type: 'text', text: `ในแชท เลขาเตรียมให้ครั้งละไม่เกิน ${LINE_SHEET_ROWS} แถว ไฟล์ยาวแบบนี้${tabs > 1 ? ` (${tabs} แท็บ)` : ''} นำเข้าทีเดียวได้ที่ เมนู งาน › นำเข้าจาก Excel ระบบจับคอลัมน์ให้ และให้ตรวจก่อนบันทึก`, size: 'sm', color: LINE_CARD_COLORS.muted, wrap: true },
    ],
    ...(lineAppLink('/jobs', 'เปิดหน้างาน') ? { footer: lineAppLink('/jobs', 'เปิดหน้างาน')! } : {}),
  });
}

const SHEET_ERRORS: Record<SheetFileError['code'], string> = {
  type: 'เปิดไฟล์นี้ไม่ได้ครับ ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกเป็น .xlsx หรือ .csv แล้วส่งใหม่',
  empty: 'ไม่พบข้อมูลในไฟล์นี้ครับ',
  big: 'ไฟล์ตารางนี้ใหญ่เกินไปครับ นำเข้าได้ที่ เมนู งาน › นำเข้าจาก Excel ในแอป',
};

/**
 * A spreadsheet sent in LINE (owner, 2026-11-13: "รับไฟล์ Excel ทางแชท"): read on the server into the text the app's chat
 * makes (shared/sheetFileText.ts, personal data masked), then เลขา prepares its confirmation cards, as for a PDF. A long
 * file goes to the app's import instead (no tokens spent); an .xls / .ods / Numbers file is asked to be saved as .xlsx.
 * The document vault keeps pictures and PDFs only, so the spreadsheet itself is not kept.
 */
async function handleLineSheetFile(user: UserRow, event: LineFileEvent, token: string, deps: LineFileDeps): Promise<LineMessage[]> {
  const name = (event.fileName || 'ตาราง.xlsx').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
  if (sheetFileKind(name) === 'old') {
    return [{ type: 'text', text: 'ตอนนี้ในแชท LINE เลขาอ่านไฟล์ .xlsx และ .csv ได้ครับ ไฟล์นี้ให้เปิดใน Excel หรือ Google Sheets แล้วบันทึกเป็น .xlsx ก่อนส่ง หรือส่งในแชทเลขาบนเว็บ' }];
  }
  let bytes: Buffer;
  try { bytes = await (deps.read ?? readLineFile)(event.id!, token); }
  catch { return [{ type: 'text', text: 'ยังรับไฟล์ไม่สำเร็จครับ กรุณาส่งใหม่อีกครั้ง' }]; }
  let read: ReturnType<typeof spreadsheetText>;
  try { read = spreadsheetText(name, new Uint8Array(bytes)); }
  catch (error) { return [{ type: 'text', text: SHEET_ERRORS[error instanceof SheetFileError ? error.code : 'type'] }]; }
  if (read.dataRows > LINE_SHEET_ROWS) return [sheetImportCard(name, read.dataRows, read.tabs)];
  return askAboutText(user, name, read.text, LINE_SHEET_REQUEST, deps, {
    none: 'อ่านตารางได้แล้ว แต่ตอนนี้เลขายังเตรียมรายการให้ไม่ได้ครับ ลองส่งใหม่อีกครั้ง หรือนำเข้าที่ เมนู งาน › นำเข้าจาก Excel',
    failed: 'เลขาอ่านตารางนี้ไม่สำเร็จครับ ลองส่งใหม่อีกครั้ง', log: 'line-sheet',
  });
}

/**
 * A file read into text on the server (a spreadsheet or a document), given to เลขา like a file in the app's chat: its
 * answer and confirmation cards come back, the chat history keeps "[ส่งไฟล์] name". The same file allowance as pictures.
 */
async function askAboutText(user: UserRow, name: string, text: string, request: string, deps: LineFileDeps, words: { none: string; failed: string; log: string }): Promise<LineMessage[]> {
  try {
    await (deps.rateLimit ?? rateLimit)('assistant-file', user.user_id, 25, 600);
    const file = checkAttachment({ name, mimeType: 'text/plain', data: Buffer.from(text, 'utf8').toString('base64') });
    const answer = deps.answer ?? (async (account, said, history, files) => (await import('../ai/lineBridge.js')).lineAssistantAnswer(account, said, history, {}, files));
    const answered = await answer(user, request, recentChatHistory(user), [file]);
    if (!answered) return [{ type: 'text', text: words.none }];
    try { await (deps.saveHistory ?? saveChatHistory)(user, `[ส่งไฟล์] ${name}`.slice(0, 200), answered.text.slice(0, 1000)); }
    catch { console.error(`${words.log}: chat history not saved`); }
    return answered.messages.slice(0, 5);
  } catch (error) {
    const failure = error as { status?: number; message?: string } | null;
    console.error(`${words.log}: reading the file failed`, { status: failure?.status ?? null });
    return [{ type: 'text', text: failure?.status && failure.status < 500 && failure.message ? failure.message : words.failed }];
  }
}

/** A Word or PowerPoint file: เลขา prepares a card for any money it holds, or says in a line what the file is about. */
export const LINE_DOC_REQUEST = 'ช่วยอ่านเอกสารนี้ ถ้ามีรายรับหรือรายจ่าย เช่น ใบเสนอราคา ใบแจ้งหนี้ หรือใบเสร็จ ให้เตรียมบันทึกให้ ถ้าไม่มีรายการเงิน ให้บอกสั้น ๆ ว่าเอกสารนี้เกี่ยวกับอะไร';
const DOC_ERRORS: Record<DocumentFileError['code'], string> = {
  type: 'เปิดไฟล์นี้ไม่ได้ครับ ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกเป็น PDF แล้วส่งใหม่',
  empty: 'ไม่พบข้อความในไฟล์นี้ครับ ถ้าเป็นรูปสแกน ให้ส่งเป็นรูปหรือ PDF แทน',
  big: 'ไฟล์นี้ใหญ่เกินไปครับ ลองบันทึกเป็น PDF แล้วส่งใหม่',
};

/**
 * A Word or PowerPoint file sent in LINE (owner, 2026-11-13: "ส่งไฟล์ Word / PowerPoint ใน LINE"): its words read on the
 * server as the app's chat reads them (shared/documentFileText.ts, personal data masked), then เลขา prepares its cards,
 * as for a spreadsheet. A .doc / .ppt / Pages / Keynote file is asked to be saved as .docx / .pptx or PDF. The document
 * vault keeps pictures and PDFs only, so the file itself is not kept.
 */
async function handleLineDocFile(user: UserRow, event: LineFileEvent, token: string, deps: LineFileDeps): Promise<LineMessage[]> {
  const name = (event.fileName || 'เอกสาร.docx').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
  if (documentFileKind(name) === 'old') {
    return [{ type: 'text', text: 'ตอนนี้ในแชท LINE เลขาอ่านไฟล์ Word แบบ .docx และ PowerPoint แบบ .pptx ได้ครับ ไฟล์นี้ให้เปิดแล้วบันทึกเป็น .docx / .pptx หรือ PDF ก่อนส่ง' }];
  }
  let bytes: Buffer;
  try { bytes = await (deps.read ?? readLineFile)(event.id!, token); }
  catch { return [{ type: 'text', text: 'ยังรับไฟล์ไม่สำเร็จครับ กรุณาส่งใหม่อีกครั้ง' }]; }
  let read: ReturnType<typeof documentText>;
  try { read = documentText(name, new Uint8Array(bytes)); }
  catch (error) { return [{ type: 'text', text: DOC_ERRORS[error instanceof DocumentFileError ? error.code : 'type'] }]; }
  return askAboutText(user, name, read.text, LINE_DOC_REQUEST, deps, {
    none: 'อ่านเอกสารได้แล้ว แต่ตอนนี้เลขายังเตรียมรายการให้ไม่ได้ครับ ลองส่งใหม่อีกครั้ง', failed: 'เลขาอ่านเอกสารนี้ไม่สำเร็จครับ ลองส่งใหม่อีกครั้ง', log: 'line-doc',
  });
}

/** Replaceable parts, for tests. */
export interface LineFileDeps {
  owner?: typeof owner;
  read?: typeof readLineFile;
  store?: typeof storeVaultFile;
  answer?: (user: UserRow, text: string, history: { role: 'user' | 'assistant'; text: string }[], files: ChatFile[]) => Promise<LineAnswer | null>;
  remember?: typeof rememberFileProposals;
  saveHistory?: typeof saveChatHistory;
  rateLimit?: typeof rateLimit;
}

/**
 * A picture or PDF sent in LINE (owner, 2026-11-06: "อ่านไฟล์ PDF อ่านรูปภาพ ... แกะออกมาเพื่อบันทึกรายจ่ายหรือรายรับ ...
 * เหมือนแบบในเลขากระรอกเลยในแอป", then "อ่านทันที แล้วเสนอการ์ดบันทึก"). The file goes into คลังเอกสาร first, as before;
 * then เลขา reads it like a file in the app's chat and answers with its confirmation cards, which remember the file so
 * the one confirmed gets it attached (lineFileLinks.ts). When nothing is prepared from it (a contract, a ใบ 50 ทวิ),
 * when เลขา is not on for the account, or when it cannot be read, the earlier card asks what the file is.
 */
export async function handleLineFileMessage(lineUserId: string, event: LineFileEvent, token: string, deps: LineFileDeps = {}): Promise<LineMessage[]> {
  if (event.type !== 'image' && event.type !== 'file') throw new Error('Not a file event');
  if (!event.id || !/^\d{1,40}$/.test(event.id)) return [{ type: 'text', text: 'อ่านรหัสไฟล์จาก LINE ไม่ได้ กรุณาส่งใหม่ครับ' }];
  if (event.fileSize && event.fileSize > VAULT_MAX_BYTES) return [{ type: 'text', text: 'ไฟล์ใหญ่เกิน 10 MB กรุณาลดขนาดแล้วส่งใหม่ครับ' }];
  const access = await (deps.owner ?? owner)(lineUserId);
  if ('type' in access) return [access];
  // A spreadsheet is read into text for เลขา (the vault keeps pictures and PDFs only).
  if (event.type === 'file' && sheetFileKind(event.fileName || '')) return handleLineSheetFile(access.user, event, token, deps);
  // So is a Word or PowerPoint file.
  if (event.type === 'file' && documentFileKind(event.fileName || '')) return handleLineDocFile(access.user, event, token, deps);
  let bytes: Buffer;
  let saved: { id: string; fileName: string };
  try {
    bytes = await (deps.read ?? readLineFile)(event.id, token);
    saved = await (deps.store ?? storeVaultFile)({ kind: 'user', id: access.user.user_id }, access.auth, bytes, {
      kind: 'other', fileName: event.fileName || (event.type === 'image' ? 'รูปจาก LINE' : 'ไฟล์จาก LINE'),
    }, access.maxFiles);
  } catch (error) {
    // A free vault at its file count says so, as the website does.
    if ((error as { code?: string } | null)?.code === 'vault_free_full') return [{ type: 'text', text: (error as Error).message }];
    console.error('line-vault: upload failed', { type: error instanceof Error ? error.message : 'unknown' });
    return [{ type: 'text', text: 'ยังเก็บไฟล์ไม่สำเร็จครับ รองรับ PDF, JPG, PNG, WEBP ไม่เกิน 10 MB กรุณาลองส่งใหม่ หรือเปิดคลังเอกสารในเว็บ' }];
  }
  const keep = fileSavedCard(saved.id, saved.fileName);
  const mime = sniffVaultMime(bytes.subarray(0, 16));
  if (!mime) return [keep];
  if (bytes.length > ATTACHMENT_MAX_BYTES) return [{ type: 'text', text: 'ไฟล์ใหญ่เกิน 4 MB เลขาอ่านให้ไม่ได้ เก็บไว้ในคลังเอกสารแล้วครับ' }, keep];
  try {
    await (deps.rateLimit ?? rateLimit)('assistant-file', access.user.user_id, 25, 600);
    const file = checkAttachment({ name: saved.fileName, mimeType: mime, data: bytes.toString('base64') });
    const answer = deps.answer ?? (async (user, text, history, files) => (await import('../ai/lineBridge.js')).lineAssistantAnswer(user, text, history, {}, files));
    const answered = await answer(access.user, LINE_FILE_REQUEST, recentChatHistory(access.user), [file]);
    if (!answered) return [keep];
    try { await (deps.saveHistory ?? saveChatHistory)(access.user, `[ส่งไฟล์] ${saved.fileName}`.slice(0, 200), answered.text.slice(0, 1000)); }
    catch { console.error('line-vault: chat history not saved'); }
    if (!answered.proposalIds?.length) return [...answered.messages.slice(0, 4), keep];
    try { await (deps.remember ?? rememberFileProposals)(access.user.user_id, saved.id, answered.proposalIds); }
    catch { console.error('line-vault: file not linked to its cards'); }
    const note = { type: 'text' as const, text: 'เก็บไฟล์ไว้ในคลังเอกสารแล้ว กดยืนยันแล้วผมแนบไฟล์กับรายการให้ครับ' };
    return answered.messages.length < 5 ? [...answered.messages, note] : answered.messages;
  } catch (error) {
    const failure = error as { status?: number; message?: string } | null;
    console.error('line-vault: reading the file failed', { status: failure?.status ?? null });
    // A limit or a file the checks refuse is said as it is; anything else plainly. The file is kept either way.
    const said = failure?.status && failure.status < 500 && failure.message ? failure.message : 'เลขาอ่านไฟล์นี้ไม่สำเร็จ';
    return [{ type: 'text', text: `${said} เก็บไฟล์ไว้ในคลังเอกสารแล้วครับ` }, keep];
  }
}

/** What a person sending several pictures at once asks of เลขา: each picture is kept with its own record. */
export const lineFilesRequest = (count: number) => `ช่วยอ่านรูปทั้ง ${count} รูปนี้ แล้วเตรียมบันทึกรายรับหรือรายจ่ายให้ครบทุกใบ และแนบแต่ละรูปกับรายการของรูปนั้น`;

/** Replaceable parts of a picture set, for tests. */
export interface LineImageSetDeps extends LineFileDeps {
  note?: typeof noteImagePart;
  drop?: typeof dropImageParts;
  claim?: (key: string) => Promise<boolean>;
  finish?: (key: string) => Promise<void>;
  saveGroup?: typeof saveCardGroup;
  link?: typeof rememberFileLinks;
}

/** One event of all the pictures of a set reads them: the one that wins this claim (an event id, once), marked done after
 *  so the claim's 90-second lease never lets a late picture read the set again. */
async function claimOnce(key: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc('cashflow_claim_webhook', { p_key: key });
  if (error) throw error;
  return data === 'claimed';
}
async function finishClaim(key: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from('cashflow_webhook_events').update({ status: 'done' }).eq('key', key);
  if (error) throw error;
}

/**
 * One picture of several sent at once (owner, 2026-11-06: "ส่งหลายรูปพร้อมกันให้รวมเป็นการ์ดเดียว", then "การ์ดเดียว +
 * บันทึกทั้งหมด"). Each picture is kept in คลังเอกสาร as it arrives and noted with its set; nothing is said until the set
 * is complete, then the event that completes it reads up to five of them in one message to เลขา and answers once: two
 * or more cards become one card with บันทึกทั้งหมด (lineFormat.ts cardGroupMessage); one card or none, เลขา's answer.
 * Not a set: the single-picture path (handleLineFileMessage).
 */
export async function handleLineImageSetPart(lineUserId: string, event: LineFileEvent, token: string, deps: LineImageSetDeps = {}): Promise<LineMessage[]> {
  const groupId = groupIdFor(event.imageSet?.id);
  const index = Number(event.imageSet?.index);
  const total = Number(event.imageSet?.total);
  if (!groupId || !Number.isInteger(index) || !Number.isInteger(total) || total < 2 || total > 20 || index < 1 || index > total) {
    return handleLineFileMessage(lineUserId, event, token, deps);
  }
  if (!event.id || !/^\d{1,40}$/.test(event.id)) return index === 1 ? [{ type: 'text', text: 'อ่านรหัสไฟล์จาก LINE ไม่ได้ กรุณาส่งใหม่ครับ' }] : [];
  const access = await (deps.owner ?? owner)(lineUserId);
  // Said once for the whole set, not once a picture.
  if ('type' in access) return index === 1 ? [access] : [];
  const user = access.user;
  const read = deps.read ?? readLineFile;
  const part: ImagePart = { messageId: event.id, at: new Date().toISOString() };
  let bytes: Buffer | null = null;
  try {
    if (event.fileSize && event.fileSize > VAULT_MAX_BYTES) throw new Error('too large');
    bytes = await read(event.id, token);
    const saved = await (deps.store ?? storeVaultFile)({ kind: 'user', id: user.user_id }, access.auth, bytes, { kind: 'other', fileName: event.fileName || `รูปจาก LINE ${index}` }, access.maxFiles);
    part.fileId = saved.id;
    part.fileName = saved.fileName;
  } catch (error) {
    console.error('line-vault: a picture of a set was not kept', { type: error instanceof Error ? error.message : 'unknown' });
    part.failed = true;
  }
  const parts = await (deps.note ?? noteImagePart)(user.user_id, groupId, index, part);
  if (parts.size < total) return [];
  const claimKey = `imageset:${groupId}`;
  if (!(await (deps.claim ?? claimOnce)(claimKey))) return [];
  try { return await readImageSet(user, groupId, index, bytes, parts, token, deps); }
  finally { await (deps.finish ?? finishClaim)(claimKey).catch(() => console.error('line-vault: a picture set claim was not finished')); }
}

async function readImageSet(user: UserRow, groupId: string, index: number, bytes: Buffer | null, parts: Map<number, ImagePart>, token: string, deps: LineImageSetDeps): Promise<LineMessage[]> {
  const read = deps.read ?? readLineFile;
  const ordered = [...parts.entries()].sort((a, b) => a[0] - b[0]);
  await (deps.drop ?? dropImageParts)(user.user_id, groupId, ordered.map(([at]) => at)).catch(() => undefined);
  const kept = ordered.filter(([, item]) => !item.failed && item.fileId);
  // How many pictures will be attached by themselves when their records are confirmed (0 until เลขา has read them).
  const notesWith = (linked: number) => [
    `เก็บรูปไว้ในคลังเอกสารแล้ว ${kept.length} รูปครับ`,
    ...(linked ? [linked >= kept.length ? 'กดบันทึกแล้วผมแนบรูปกับรายการให้ครบทุกรูปครับ' : `กดบันทึกแล้วผมแนบรูปกับรายการให้ ${linked} รูป ที่เหลือแนบเองได้ในคลังเอกสารครับ`] : []),
    ...(kept.length > MAX_FILES ? [`เลขาอ่านได้ครั้งละ ${MAX_FILES} รูป อีก ${kept.length - MAX_FILES} รูปส่งมาใหม่ได้เลย`] : []),
    ...(ordered.length > kept.length ? [`${ordered.length - kept.length} รูปเก็บไม่สำเร็จ กรุณาส่งรูปนั้นใหม่`] : []),
  ].join('\n');
  const notes = notesWith(0);
  const files: ChatFile[] = [];
  const fileIds: string[] = [];
  for (const [at, item] of kept.slice(0, MAX_FILES)) {
    try {
      const content = at === index && bytes ? bytes : await read(item.messageId, token);
      const mime = sniffVaultMime(content.subarray(0, 16));
      if (mime && content.length <= ATTACHMENT_MAX_BYTES) {
        files.push({ name: item.fileName || `รูป ${at}`, mimeType: mime, data: content.toString('base64') });
        fileIds.push(item.fileId as string);
      }
    } catch { console.error('line-vault: a picture of a set could not be read again'); }
  }
  if (!files.length) return [{ type: 'text', text: `${notes}\nแต่เลขาอ่านรูปเหล่านี้ให้ไม่ได้` }];
  try {
    for (let at = 0; at < files.length; at += 1) await (deps.rateLimit ?? rateLimit)('assistant-file', user.user_id, 25, 600);
    const checked = checkAttachments(files);
    const answer = deps.answer ?? (async (who, text, history, list) => (await import('../ai/lineBridge.js')).lineAssistantAnswer(who, text, history, {}, list));
    const answered = await answer(user, lineFilesRequest(checked.length), recentChatHistory(user), checked);
    if (!answered) return [{ type: 'text', text: notes }];
    try { await (deps.saveHistory ?? saveChatHistory)(user, `[ส่งรูป ${checked.length} รูป]`, answered.text.slice(0, 1000)); }
    catch { console.error('line-vault: chat history not saved'); }
    const cards = answered.reply?.cards ?? [];
    // Each picture with the card เลขา said it belongs to (owner, 2026-11-06: "ทำให้ส่งหลายรูปแล้วผูกบิลอัตโนมัติด้วย"):
    // attached when that card is confirmed, by บันทึกทั้งหมด or on its own (lineBridge.ts).
    const pairs = linkCardsToFiles(cards, checked.map((file, at) => ({ name: file.name, fileId: fileIds[at] })));
    let linked = 0;
    if (pairs.length) {
      try { await (deps.link ?? rememberFileLinks)(user.user_id, pairs); linked = pairs.length; }
      catch { console.error('line-vault: pictures not linked to their cards'); }
    }
    const said = { type: 'text' as const, text: notesWith(linked) };
    const confirms = cards.filter(card => card.kind === 'confirm');
    if (confirms.length >= 2) {
      await (deps.saveGroup ?? saveCardGroup)(user.user_id, groupId, { cards: confirms, files: checked.length });
      // Attach cards are not shown in LINE: their pictures are linked above.
      const others = cards.filter(card => card.kind !== 'confirm' && card.kind !== 'attach');
      const words = answered.reply?.text.trim() || others.length ? lineAssistantReply(answered.reply?.text ?? '', others) : [];
      return [...words.slice(0, 2), cardGroupMessage(groupId, confirms, checked.length), said];
    }
    return [...answered.messages.slice(0, 4), said];
  } catch (error) {
    const failure = error as { status?: number; message?: string } | null;
    console.error('line-vault: reading a picture set failed', { status: failure?.status ?? null });
    const said = failure?.status && failure.status < 500 && failure.message ? failure.message : 'เลขาอ่านรูปชุดนี้ไม่สำเร็จ';
    return [{ type: 'text', text: `${said}\n${notes}` }];
  }
}

export async function handleLineVaultAction(lineUserId: string, action: VaultAction): Promise<LineMessage> {
  const access = await owner(lineUserId);
  if ('type' in access) return access;
  const scope = { kind: 'user' as const, id: access.user.user_id };
  const file = (await listVaultFiles(scope)).find(item => item.id === action.fileId);
  if (!file) return { type: 'text', text: 'ไม่พบไฟล์นี้ในบัญชีของคุณครับ' };
  if (action.step === 'choose' && action.kind === 'other') {
    await updateVaultFile(scope, { action: 'update', id: file.id, kind: 'other', jobId: null, jobName: null, client: null });
    return { type: 'text', text: 'เก็บไว้ใน “เอกสารอื่น ๆ” แล้วครับ เปิดคลังเอกสารในเว็บเพื่อจัดการภายหลังได้' };
  }
  const kind = action.kind;
  const targets = (kind === 'expense' ? access.user.expenses || [] : access.user.jobs || []) as Array<{ id?: string; name?: string; client?: string }>;
  if (action.step === 'attach') {
    const target = targets.find(item => item.id === action.targetId);
    if (!target?.id) return { type: 'text', text: 'ไม่พบงานหรือรายจ่ายนี้ในบัญชีของคุณครับ' };
    const label = 'name' in target && typeof target.name === 'string' ? target.name : 'รายการ';
    const client = 'client' in target && typeof target.client === 'string' ? target.client : null;
    await updateVaultFile(scope, { action: 'update', id: file.id, kind, jobId: target.id, jobName: label, client });
    return lineCard({ compact: true, title: 'แนบเอกสารเรียบร้อย', character: 'document',
      altText: `แนบ ${file.fileName} กับ ${label} แล้ว`,
      body: [{ type: 'text', text: `${VAULT_KIND_LABEL[kind]} · ${label}`, size: 'sm', color: LINE_CARD_COLORS.text, wrap: true }],
      note: 'ตรวจประเภทและความถูกต้องของเอกสารได้ในคลังเอกสาร',
    });
  }
  const candidates = targets.filter(target => target.id && /^[A-Za-z0-9_-]{1,120}$/.test(target.id)).reverse().slice(0, 5);
  if (!candidates.length) return lineCard({ compact: true, title: 'ยังไม่มีรายการให้แนบ', character: 'document',
    altText: 'เก็บไฟล์แล้ว แต่ยังไม่มีงานหรือรายจ่ายให้แนบ', body: [],
    footer: lineAppLink(`/line-documents?file=${file.id}&kind=${kind}`, 'แนบไฟล์กับรายการ'),
  });
  return lineCard({ compact: true, title: `เลือก${kind === 'expense' ? 'รายจ่าย' : 'งาน'}ที่เกี่ยวข้อง`, character: 'document',
    altText: `เลือกงานเพื่อแนบ ${file.fileName}`, body: candidates.map(target => ({
      type: 'button', style: 'secondary', color: LINE_CARD_COLORS.subtle, height: 'sm', margin: 'sm',
      action: { type: 'postback', label: String(target.name || 'รายการ').slice(0, 20),
        data: `vault:attach:${kind}:${file.id}:${target.id}` },
    })),
    footer: lineAppLink(`/line-documents?file=${file.id}&kind=${kind}`, 'เลือกงานจากทั้งหมด'),
    note: 'รายการอื่นเลือกได้ในคลังเอกสาร',
  });
}

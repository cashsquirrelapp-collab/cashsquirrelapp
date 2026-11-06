import type { LineMessage } from './line.js';
import { lineAppLink, lineCard, LINE_CARD_COLORS } from './lineCards.js';
import { findUserByLineId, isProUser, recentChatHistory, saveChatHistory, type UserRow } from './lineAssistant.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { listVaultFiles, storeVaultFile, updateVaultFile } from './vault.js';
import { VAULT_KIND_LABEL, VAULT_MAX_BYTES, sniffVaultMime, type VaultKind } from '../../../shared/vault.js';
import { ATTACHMENT_MAX_BYTES, MAX_FILES, checkAttachment, checkAttachments } from '../ai/attachment.js';
import type { ChatFile } from '../ai/types.js';
import type { LineAnswer } from '../ai/lineBridge.js';
import { dropImageParts, groupIdFor, noteImagePart, rememberFileProposals, saveCardGroup, type ImagePart } from './lineFileLinks.js';
import { cardGroupMessage, lineAssistantReply } from '../ai/lineFormat.js';
import { rateLimit } from '../security/rateLimit.js';
import { lineAreaOpen } from './lineLaunch.js';
import { isPhaseOneFeatureAvailable } from '../../../shared/featureAvailability.js';

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

async function owner(lineUserId: string): Promise<{ user: UserRow; auth: NonNullable<Awaited<ReturnType<ReturnType<typeof getSupabaseAdmin>['auth']['admin']['getUserById']>>['data']['user']> } | LineMessage> {
  const user = await findUserByLineId(lineUserId);
  if (!user) return { type: 'text', text: isPhaseOneFeatureAvailable('vault', false) ? 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน จึงจะเก็บไฟล์เข้าคลังส่วนตัวได้ครับ' : 'ตอนนี้ LINE ยังรับไฟล์และรูปภาพไม่ได้ครับ' };
  const access = await checkLinkedAccountWriteAccess(user.user_id);
  if (!access.allowed) return { type: 'text', text: access.error };
  // The document vault is not on the website for ordinary accounts yet, so LINE does not keep files for them either.
  if (!await lineAreaOpen('vault', user.user_id)) return { type: 'text', text: 'ตอนนี้ LINE ยังรับไฟล์และรูปภาพไม่ได้ครับ' };
  const account = await getSupabaseAdmin().auth.admin.getUserById(user.user_id);
  if (account.error || !account.data.user || !await isProUser(user.user_id)) {
    return { type: 'text', text: 'การแนบไฟล์ผ่าน LINE ใช้ได้ในช่วงทดลองหรือแพ็กเกจ Pro ครับ' };
  }
  return { user, auth: account.data.user };
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
  let bytes: Buffer;
  let saved: { id: string; fileName: string };
  try {
    bytes = await (deps.read ?? readLineFile)(event.id, token);
    saved = await (deps.store ?? storeVaultFile)({ kind: 'user', id: access.user.user_id }, access.auth, bytes, {
      kind: 'other', fileName: event.fileName || (event.type === 'image' ? 'รูปจาก LINE' : 'ไฟล์จาก LINE'),
    });
  } catch (error) {
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

/** What a person sending several pictures at once asks of เลขา. */
export const lineFilesRequest = (count: number) => `ช่วยอ่านรูปทั้ง ${count} รูปนี้ แล้วเตรียมบันทึกรายรับหรือรายจ่ายให้ครบทุกใบ`;

/** Replaceable parts of a picture set, for tests. */
export interface LineImageSetDeps extends LineFileDeps {
  note?: typeof noteImagePart;
  drop?: typeof dropImageParts;
  claim?: (key: string) => Promise<boolean>;
  finish?: (key: string) => Promise<void>;
  saveGroup?: typeof saveCardGroup;
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
    const saved = await (deps.store ?? storeVaultFile)({ kind: 'user', id: user.user_id }, access.auth, bytes, { kind: 'other', fileName: event.fileName || `รูปจาก LINE ${index}` });
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
  const notes = [
    `เก็บรูปไว้ในคลังเอกสารแล้ว ${kept.length} รูปครับ`,
    ...(kept.length > MAX_FILES ? [`เลขาอ่านได้ครั้งละ ${MAX_FILES} รูป อีก ${kept.length - MAX_FILES} รูปส่งมาใหม่ได้เลย`] : []),
    ...(ordered.length > kept.length ? [`${ordered.length - kept.length} รูปเก็บไม่สำเร็จ กรุณาส่งรูปนั้นใหม่`] : []),
  ].join('\n');
  const files: ChatFile[] = [];
  for (const [at, item] of kept.slice(0, MAX_FILES)) {
    try {
      const content = at === index && bytes ? bytes : await read(item.messageId, token);
      const mime = sniffVaultMime(content.subarray(0, 16));
      if (mime && content.length <= ATTACHMENT_MAX_BYTES) files.push({ name: item.fileName || `รูป ${at}`, mimeType: mime, data: content.toString('base64') });
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
    const confirms = (answered.reply?.cards ?? []).filter(card => card.kind === 'confirm');
    if (confirms.length >= 2) {
      await (deps.saveGroup ?? saveCardGroup)(user.user_id, groupId, { cards: confirms, files: checked.length });
      const others = (answered.reply?.cards ?? []).filter(card => card.kind !== 'confirm');
      const words = answered.reply?.text.trim() || others.length ? lineAssistantReply(answered.reply?.text ?? '', others) : [];
      return [...words.slice(0, 2), cardGroupMessage(groupId, confirms, checked.length), { type: 'text' as const, text: notes }];
    }
    return [...answered.messages.slice(0, 4), { type: 'text', text: notes }];
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

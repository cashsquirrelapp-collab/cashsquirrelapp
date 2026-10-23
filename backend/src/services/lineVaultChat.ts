import type { LineMessage } from './line.js';
import { lineAppLink, lineCard, LINE_CARD_COLORS } from './lineCards.js';
import { findUserByLineId, isProUser, type UserRow } from './lineAssistant.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { listVaultFiles, storeVaultFile, updateVaultFile } from './vault.js';
import { VAULT_KIND_LABEL, VAULT_MAX_BYTES, type VaultKind } from '../../../shared/vault.js';

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

export interface LineFileEvent { id?: string; type: string; fileName?: string; fileSize?: number }

async function owner(lineUserId: string): Promise<{ user: UserRow; auth: NonNullable<Awaited<ReturnType<ReturnType<typeof getSupabaseAdmin>['auth']['admin']['getUserById']>>['data']['user']> } | LineMessage> {
  const user = await findUserByLineId(lineUserId);
  if (!user) return { type: 'text', text: 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน จึงจะเก็บไฟล์เข้าคลังส่วนตัวได้ครับ' };
  const access = await checkLinkedAccountWriteAccess(user.user_id);
  if (!access.allowed) return { type: 'text', text: access.error };
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

export async function handleLineFile(lineUserId: string, event: LineFileEvent, token: string): Promise<LineMessage> {
  if (event.type !== 'image' && event.type !== 'file') throw new Error('Not a file event');
  if (!event.id || !/^\d{1,40}$/.test(event.id)) return { type: 'text', text: 'อ่านรหัสไฟล์จาก LINE ไม่ได้ กรุณาส่งใหม่ครับ' };
  if (event.fileSize && event.fileSize > VAULT_MAX_BYTES) return { type: 'text', text: 'ไฟล์ใหญ่เกิน 10 MB กรุณาลดขนาดแล้วส่งใหม่ครับ' };
  const access = await owner(lineUserId);
  if ('type' in access) return access;
  try {
    const bytes = await readLineFile(event.id, token);
    const saved = await storeVaultFile({ kind: 'user', id: access.user.user_id }, access.auth, bytes, {
      kind: 'other', fileName: event.fileName || (event.type === 'image' ? 'รูปจาก LINE' : 'ไฟล์จาก LINE'),
    });
    return fileSavedCard(saved.id, saved.fileName);
  } catch (error) {
    console.error('line-vault: upload failed', { type: error instanceof Error ? error.message : 'unknown' });
    return { type: 'text', text: 'ยังเก็บไฟล์ไม่สำเร็จครับ รองรับ PDF, JPG, PNG, WEBP ไม่เกิน 10 MB กรุณาลองส่งใหม่ หรือเปิดคลังเอกสารในเว็บ' };
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

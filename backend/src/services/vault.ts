import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError } from '../http/guard.js';
import type { VercelRequest } from '../http/types.js';
import { VAULT_EXT, VAULT_MAX_BYTES, VAULT_MAX_FILES, cleanVaultFileName, sniffVaultMime, type VaultFile, type VaultKind } from '../../../shared/vault.js';

// Document vault storage. Files sit in a private bucket under the owning workspace's folder
// (user/<id>/… or group/<id>/…); every read and write goes through the API, which checks the
// signed-in user and their membership of the workspace first. Nothing in the bucket is public.

export const VAULT_BUCKET = 'document-vault';
const FREE_TRIAL_DAYS = 14;

export interface VaultScope { kind: 'user' | 'group'; id: string }

let bucketReady: Promise<void> | null = null;
export function ensureVaultBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const storage = getSupabaseAdmin().storage;
    const options = { public: false, fileSizeLimit: VAULT_MAX_BYTES, allowedMimeTypes: Object.keys(VAULT_EXT) };
    const found = await storage.getBucket(VAULT_BUCKET);
    if (found.error) {
      if (String(found.error.statusCode) !== '404' && !/not found/i.test(found.error.message)) throw found.error;
      const created = await storage.createBucket(VAULT_BUCKET, options);
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
    }
    const updated = await storage.updateBucket(VAULT_BUCKET, options);
    if (updated.error) throw updated.error;
  })().catch(error => { bucketReady = null; throw error; });
  return bucketReady;
}

/** Same rule as the app: within the 14-day trial, or an unexpired paid period. Fails closed. */
export async function hasProAccess(user: User): Promise<boolean> {
  const trial = !!user.created_at && new Date(user.created_at).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now();
  if (trial) return true;
  const { data, error } = await getSupabaseAdmin().from('subscriptions').select('status, current_period_end').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data?.status === 'active' && !!data.current_period_end && new Date(data.current_period_end).getTime() > Date.now();
}

async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_group_members').select('user_id').eq('group_id', groupId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** The workspace a request works in: the caller's own account, or a group they belong to. */
export async function resolveVaultScope(req: VercelRequest, user: User): Promise<VaultScope> {
  const groupId = req.headers['x-finance-group'];
  if (groupId === undefined) return { kind: 'user', id: user.id };
  if (typeof groupId !== 'string' || !z.uuid().safeParse(groupId).success) throw new HttpError(400, 'กลุ่มไม่ถูกต้อง');
  if (!(await isGroupMember(user.id, groupId))) throw new HttpError(403, 'คุณไม่ได้อยู่ในกลุ่มนี้');
  return { kind: 'group', id: groupId };
}

type Row = { id: string; user_id: string | null; group_id: string | null; kind: VaultKind; job_id: string | null; job_name: string | null; client: string | null; file_name: string; mime_type: VaultFile['mimeType']; size_bytes: number; storage_path: string; created_at: string };
const COLUMNS = 'id,user_id,group_id,kind,job_id,job_name,client,file_name,mime_type,size_bytes,storage_path,created_at';
const toFile = (row: Row): VaultFile => ({
  id: row.id, kind: row.kind, jobId: row.job_id, jobName: row.job_name, client: row.client,
  fileName: row.file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at,
});
const scopeColumn = (scope: VaultScope) => (scope.kind === 'user' ? 'user_id' : 'group_id');

export async function listVaultFiles(scope: VaultScope): Promise<VaultFile[]> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_vault_files').select(COLUMNS)
    .eq(scopeColumn(scope), scope.id).order('created_at', { ascending: false }).limit(VAULT_MAX_FILES);
  if (error) throw error;
  return (data as Row[]).map(toFile);
}

export const vaultMetaSchema = z.object({
  kind: z.enum(['wht50', 'contract', 'other']),
  jobId: z.string().trim().min(1).max(120).nullable().optional(),
  jobName: z.string().trim().max(200).nullable().optional(),
  client: z.string().trim().max(200).nullable().optional(),
  fileName: z.string().max(400),
}).strict();

export async function storeVaultFile(scope: VaultScope, user: User, body: Buffer, meta: z.infer<typeof vaultMetaSchema>): Promise<VaultFile> {
  if (!body.length) throw new HttpError(400, 'ไฟล์ว่างเปล่า');
  if (body.length > VAULT_MAX_BYTES) throw new HttpError(413, 'ไฟล์ใหญ่เกิน 10 MB');
  // Trust the bytes, not the name or the browser's type.
  const mime = sniffVaultMime(body.subarray(0, 16));
  if (!mime) throw new HttpError(415, 'รองรับเฉพาะ PDF, JPG, PNG และ WEBP');
  const admin = getSupabaseAdmin();
  const counted = await admin.from('cashflow_vault_files').select('id', { count: 'exact', head: true }).eq(scopeColumn(scope), scope.id);
  if (counted.error) throw counted.error;
  if ((counted.count || 0) >= VAULT_MAX_FILES) throw new HttpError(409, 'คลังเอกสารเต็มแล้ว กรุณาลบไฟล์ที่ไม่ใช้ก่อน');
  await ensureVaultBucket();
  const id = randomUUID();
  const path = `${scope.kind}/${scope.id}/${id}.${VAULT_EXT[mime]}`;
  const uploaded = await admin.storage.from(VAULT_BUCKET).upload(path, body, { contentType: mime, upsert: false });
  if (uploaded.error) throw uploaded.error;
  const row = {
    id, user_id: scope.kind === 'user' ? scope.id : null, group_id: scope.kind === 'group' ? scope.id : null, uploaded_by: user.id,
    kind: meta.kind, job_id: meta.jobId || null, job_name: meta.jobName || null, client: meta.client || null,
    file_name: cleanVaultFileName(meta.fileName, mime), mime_type: mime, size_bytes: body.length, storage_path: path,
  };
  const inserted = await admin.from('cashflow_vault_files').insert(row).select(COLUMNS).single();
  if (inserted.error) {
    await admin.storage.from(VAULT_BUCKET).remove([path]);
    throw inserted.error;
  }
  return toFile(inserted.data as Row);
}

async function findInScope(scope: VaultScope, id: string): Promise<Row> {
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, 'รหัสไฟล์ไม่ถูกต้อง');
  const { data, error } = await getSupabaseAdmin().from('cashflow_vault_files').select(COLUMNS).eq('id', id).eq(scopeColumn(scope), scope.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'ไม่พบไฟล์');
  return data as Row;
}

export const vaultUpdateSchema = z.object({
  action: z.literal('update'),
  id: z.uuid(),
  kind: z.enum(['wht50', 'contract', 'other']).optional(),
  jobId: z.string().trim().min(1).max(120).nullable().optional(),
  jobName: z.string().trim().max(200).nullable().optional(),
  client: z.string().trim().max(200).nullable().optional(),
}).strict();

export async function updateVaultFile(scope: VaultScope, input: z.infer<typeof vaultUpdateSchema>): Promise<VaultFile> {
  await findInScope(scope, input.id);
  const patch: Record<string, unknown> = {};
  if (input.kind) patch.kind = input.kind;
  if (input.jobId !== undefined) patch.job_id = input.jobId || null;
  if (input.jobName !== undefined) patch.job_name = input.jobName || null;
  if (input.client !== undefined) patch.client = input.client || null;
  const { data, error } = await getSupabaseAdmin().from('cashflow_vault_files').update(patch).eq('id', input.id).eq(scopeColumn(scope), scope.id).select(COLUMNS).single();
  if (error) throw error;
  return toFile(data as Row);
}

export async function deleteVaultFile(scope: VaultScope, id: string): Promise<void> {
  const row = await findInScope(scope, id);
  const admin = getSupabaseAdmin();
  const removed = await admin.storage.from(VAULT_BUCKET).remove([row.storage_path]);
  if (removed.error && String(removed.error.statusCode) !== '404') throw removed.error;
  const { error } = await admin.from('cashflow_vault_files').delete().eq('id', id).eq(scopeColumn(scope), scope.id);
  if (error) throw error;
}

/** A file the signed-in user may open: theirs, or their group's. */
export async function readableVaultFile(user: User, id: string): Promise<{ row: Row; body: Buffer }> {
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, 'รหัสไฟล์ไม่ถูกต้อง');
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('cashflow_vault_files').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  const row = data as Row | null;
  const allowed = row && (row.user_id === user.id || (row.group_id && await isGroupMember(user.id, row.group_id)));
  if (!row || !allowed) throw new HttpError(404, 'ไม่พบไฟล์');
  const downloaded = await admin.storage.from(VAULT_BUCKET).download(row.storage_path);
  if (downloaded.error || !downloaded.data) throw new HttpError(404, 'ไม่พบไฟล์');
  const body = Buffer.from(await downloaded.data.arrayBuffer());
  if (body.length > VAULT_MAX_BYTES) throw new HttpError(502, 'File too large');
  return { row, body };
}

/** Remove every stored file under a workspace folder (account or group deletion). */
export async function removeVaultFolder(kind: 'user' | 'group', id: string): Promise<void> {
  const storage = getSupabaseAdmin().storage.from(VAULT_BUCKET);
  const folder = `${kind}/${id}`;
  while (true) {
    const listed = await storage.list(folder, { limit: 100 });
    if (listed.error) {
      if (String(listed.error.statusCode) === '404' || /not found/i.test(listed.error.message)) return;
      throw listed.error;
    }
    const paths = (listed.data || []).filter(item => item.name && !item.name.startsWith('.')).map(item => `${folder}/${item.name}`);
    if (!paths.length) return;
    const removed = await storage.remove(paths);
    if (removed.error) throw removed.error;
    if (paths.length < 100) return;
  }
}

import { apiFetch, apiJson } from './api';
import { financeHeaders } from './financeWorkspace';
import type { VaultFile, VaultKind } from '../../../shared/vault';

// Document vault API. Every call names the finance workspace (personal account or group) the
// file belongs to; the server checks the signed-in user may use it.

export interface VaultMeta {
  kind: VaultKind;
  jobId?: string | null;
  jobName?: string | null;
  client?: string | null;
}

export async function listVault(financeKey: string): Promise<VaultFile[]> {
  const result = await apiJson<{ files: VaultFile[] }>('/api/vault', { headers: financeHeaders(financeKey) });
  return result.files;
}

export async function uploadVault(financeKey: string, file: File, meta: VaultMeta): Promise<VaultFile> {
  const response = await apiFetch('/api/vault-upload', {
    method: 'POST',
    body: file,
    headers: {
      ...financeHeaders(financeKey),
      'Content-Type': 'application/octet-stream',
      'X-Vault-Meta': encodeURIComponent(JSON.stringify({ ...meta, fileName: file.name })),
    },
  });
  let result: { file?: VaultFile; error?: string; code?: string } = {};
  try { result = await response.json(); } catch { /* handled below */ }
  if (!response.ok || !result.file) {
    throw Object.assign(new Error(result.error || (response.status === 413 ? 'ไฟล์ใหญ่เกิน 10 MB' : 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่')), { status: response.status, code: result.code });
  }
  return result.file;
}

export async function updateVault(financeKey: string, id: string, patch: Partial<VaultMeta>): Promise<VaultFile> {
  const result = await apiJson<{ file: VaultFile }>('/api/vault', {
    method: 'POST', headers: financeHeaders(financeKey), body: JSON.stringify({ action: 'update', id, ...patch }),
  });
  return result.file;
}

export async function deleteVault(financeKey: string, id: string): Promise<void> {
  await apiJson('/api/vault', { method: 'POST', headers: financeHeaders(financeKey), body: JSON.stringify({ action: 'delete', id }) });
}

/** Same-origin link that opens (or downloads) the file after the server checks access. */
export const vaultFileUrl = (id: string, download = false) =>
  `/api/vault-file?id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`;

// Document vault: shared types and rules for files kept with jobs (50 ทวิ, contracts / POs, other).

export type VaultKind = 'wht50' | 'contract' | 'other';
export type VaultMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export interface VaultFile {
  id: string;
  kind: VaultKind;
  jobId: string | null;
  jobName: string | null;
  client: string | null;
  fileName: string;
  mimeType: VaultMime;
  sizeBytes: number;
  createdAt: string;
}

export const VAULT_MAX_BYTES = 10 * 1024 * 1024;
export const VAULT_MAX_FILES = 1000; // per personal account or group workspace
export const VAULT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export const VAULT_KIND_LABEL: Record<VaultKind, string> = {
  wht50: 'ใบ 50 ทวิ',
  contract: 'สัญญา / PO',
  other: 'อื่น ๆ',
};

export const VAULT_EXT: Record<VaultMime, 'pdf' | 'jpg' | 'png' | 'webp'> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** The real type of a file from its first bytes; null for anything that isn't a supported PDF or image. */
export function sniffVaultMime(head: Uint8Array): VaultMime | null {
  const at = (i: number) => head[i];
  if (head.length >= 5 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46 && at(4) === 0x2d) return 'application/pdf'; // %PDF-
  if (head.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (head.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png';
  if (head.length >= 12 && at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'image/webp'; // RIFF....WEBP
  return null;
}

/** A display-safe file name: no paths, control characters or characters that break headers. */
export function cleanVaultFileName(name: string, mime: VaultMime): string {
  const base = name.split(/[\\/]/).pop() || '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const ext = VAULT_EXT[mime];
  const stem = cleaned.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'document';
  return `${stem}.${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

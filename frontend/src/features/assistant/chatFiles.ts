import type { PreparedFile } from './voice';

// Files sent to เลขา in this tab, kept in memory so an "แนบเข้าคลังเอกสาร" card can hand the same file to the document
// vault (owner, 2026-10-31: "ส่งสลิปเข้าแชท แล้วน้องแนบเข้าโปรเจกต์นั้นได้เลย"). Nothing is stored: after a reload the card
// asks for the file again.

const KEEP = 8;
const files: PreparedFile[] = [];

export function rememberChatFile(file: PreparedFile): void {
  files.push(file);
  if (files.length > KEEP) files.shift();
}

/** The latest file with this name, else the latest file. */
export function chatFileFor(name?: string): PreparedFile | null {
  for (let at = files.length - 1; at >= 0; at -= 1) if (!name || files[at].name === name) return files[at];
  return files.at(-1) ?? null;
}

/** The prepared file as a browser File, ready for the vault's upload window. */
export function asFile(prepared: PreparedFile): File {
  const binary = atob(prepared.data);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return new File([bytes], prepared.name, { type: prepared.mimeType });
}

/** Asks the vault to open its upload window with this file (VaultProvider listens). */
export interface VaultAttachRequest {
  requestId: string;
  kind: 'wht50' | 'contract' | 'expense' | 'other';
  file: File;
  jobId?: string; jobName?: string; expenseId?: string; expenseName?: string;
}
export const VAULT_ATTACH_EVENT = 'cash-squirrel:vault-attach';
export const VAULT_ATTACHED_EVENT = 'cash-squirrel:vault-attached';

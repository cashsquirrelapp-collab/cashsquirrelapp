import type { PreparedFile } from './voice';

// Files sent to เลขา in this tab, kept in memory so an "แนบเข้าคลังเอกสาร" card can hand the same file to the document
// vault (owner, 2026-10-31: "ส่งสลิปเข้าแชท แล้วน้องแนบเข้าโปรเจกต์นั้นได้เลย"). Nothing is stored: after a reload the card
// asks for the file again.

const KEEP = 15;
const files: PreparedFile[] = [];

export function rememberChatFile(file: PreparedFile): void {
  files.push(file);
  if (files.length > KEEP) files.shift();
}

/** The latest picture or PDF with this name, else the latest one: the vault keeps pictures and PDFs, never the text
 *  read from a spreadsheet or document. */
export function chatFileFor(name?: string): PreparedFile | null {
  const kept = files.filter(file => file.kind !== 'text');
  for (let at = kept.length - 1; at >= 0; at -= 1) if (!name || kept[at].name === name) return kept[at];
  return kept.at(-1) ?? null;
}

/** The text files (spreadsheets, documents) of one sent message, by name, to go with the next messages of the chat so
 *  เลขา can keep working from them (owner, 2026-11-04: "คำนวณได้"). Only what this tab still holds. */
export function chatTextFiles(names: string[]): PreparedFile[] {
  return names.map(name => { for (let at = files.length - 1; at >= 0; at -= 1) if (files[at].name === name && files[at].kind === 'text') return files[at]; return null; })
    .filter((file): file is PreparedFile => Boolean(file));
}

/** A picture sent in this tab, by its exact name, for a message whose stored copy has only the name (a chat reopened
 *  from history keeps names, never pictures). Owner, 2026-11-04: "กดดูภาพได้ด้วย". */
export function chatImagePreview(name: string): string | undefined {
  for (let at = files.length - 1; at >= 0; at -= 1) {
    const file = files[at];
    if (file.name === name && file.kind === 'image') return `data:${file.mimeType};base64,${file.data}`;
  }
  return undefined;
}

/** A file sent in this tab, by its exact name (picture or PDF), to open again from the chat. */
export function chatSentFile(name: string): PreparedFile | null {
  for (let at = files.length - 1; at >= 0; at -= 1) if (files[at].name === name) return files[at];
  return null;
}

/** A PDF opens in a new tab in the browser's own viewer: the site's policy keeps PDFs out of the page itself. A
 *  spreadsheet or document opens as the text เลขา reads, so the person can check what was sent.
 *  Owner, 2026-11-04: "ไฟล์ที่ทำการส่งไปแล้วไม่ว่าจะเป็น PDF หรือรูปภาพสามารถกดดูพรีวิวได้หมด". */
export function openPreparedFile(prepared: PreparedFile): void {
  const url = URL.createObjectURL(asFile(prepared));
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The prepared file as a browser File, ready for the vault's upload window. */
export function asFile(prepared: PreparedFile): File {
  const binary = atob(prepared.data);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return new File([bytes], prepared.name, { type: prepared.kind === 'text' ? 'text/plain;charset=utf-8' : prepared.mimeType });
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

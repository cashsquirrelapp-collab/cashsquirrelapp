import type { GoogleStatus, LiveTab, SheetMap } from '../../../shared/googleSheets';
import { apiJson } from './api';

/** The row a waiting chat card will write into the sheet (backend sheetWrite.ts previewOf). */
export interface SheetRowPreview {
  file: string; url: string; tab: string; row: number;
  columns: { index: number; letter: string; header: string; formula: boolean }[];
  before: { row: number; cells: string[] }[];
  /** The new row's cells as shown; null where the sheet's formula fills it. */
  cells: (string | null)[];
  /** What the sheet's formulas will show there, read by the app's formula reader; null where it cannot tell. */
  computed?: (string | null)[];
  /** Formula columns that will come out different from the app's own figure. */
  differs?: { header: string; sheet: string; app: string }[];
}
/** What became of the sheet write of a confirmed card. */
export type SheetRowWrite =
  | { status: 'written' | 'undone'; file: string; url: string; tab: string; row: number; canUndo: boolean; values?: { header: string; text: string }[] }
  | { status: 'failed'; error: string };

// ฟีเจอร์ทดลอง, phase 2: the account's Google connection (backend/src/handlers/google.ts). The browser never holds the
// kept Google permission; it gets an hour's access token only to show Google's own file picker.

type Reply = { google: GoogleStatus };
const post = <T extends object = Reply>(account: string, body: Record<string, unknown>) =>
  apiJson<T & Reply>('/api/google', { method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify(body) });

export const googleApi = {
  status: (account: string) => apiJson<Reply>('/api/google', { headers: { 'X-Account-ID': account } }).then(reply => reply.google),
  /** Google's sign-in address; the page goes there and comes back to /settings?google=… */
  start: (account: string, back?: 'connect' | 'connect_new') => post<{ url: string }>(account, back ? { action: 'start', back } : { action: 'start' }).then(reply => reply.url),
  token: (account: string) => apiJson<{ token: string; expiresIn: number; apiKey: string; appId: string }>('/api/google', {
    method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'token' }),
  }),
  pick: (account: string, fileId: string) => post(account, { action: 'pick', fileId }).then(reply => reply.google),
  read: (account: string) => post<{ tabs: LiveTab[]; readAt: string }>(account, { action: 'read' }),
  saveMap: (account: string, map: SheetMap) => post(account, { action: 'saveMap', map }).then(reply => reply.google),
  createTemplate: (account: string, name: string, xlsx: string) => post<{ created: boolean }>(account, { action: 'createTemplate', name, xlsx }).then(reply => reply.google),
  preview: (account: string, proposalId: string) => apiJson<{ preview: SheetRowPreview | null; reason?: string }>('/api/google', {
    method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'preview', proposalId }),
  }),
  written: (account: string, proposalId: string) => apiJson<{ write: SheetRowWrite | null }>('/api/google', {
    method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'written', proposalId }),
  }).then(reply => reply.write),
  undo: (account: string, proposalId: string) => apiJson<{ undone: boolean; write: SheetRowWrite | null }>('/api/google', {
    method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'undo', proposalId }),
  }),
  forget: (account: string) => post(account, { action: 'forget' }).then(reply => reply.google),
  disconnect: (account: string) => post(account, { action: 'disconnect' }).then(reply => reply.google),
};

/** Bytes as base64, in chunks so a large workbook does not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

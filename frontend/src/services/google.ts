import type { GoogleStatus, LiveTab, SheetMap } from '../../../shared/googleSheets';
import { apiJson } from './api';

// ฟีเจอร์ทดลอง, phase 2: the account's Google connection (backend/src/handlers/google.ts). The browser never holds the
// kept Google permission; it gets an hour's access token only to show Google's own file picker.

type Reply = { google: GoogleStatus };
const post = <T extends object = Reply>(account: string, body: Record<string, unknown>) =>
  apiJson<T & Reply>('/api/google', { method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify(body) });

export const googleApi = {
  status: (account: string) => apiJson<Reply>('/api/google', { headers: { 'X-Account-ID': account } }).then(reply => reply.google),
  /** Google's sign-in address; the page goes there and comes back to /settings?google=… */
  start: (account: string) => post<{ url: string }>(account, { action: 'start' }).then(reply => reply.url),
  token: (account: string) => apiJson<{ token: string; expiresIn: number; apiKey: string; appId: string }>('/api/google', {
    method: 'POST', headers: { 'X-Account-ID': account }, body: JSON.stringify({ action: 'token' }),
  }),
  pick: (account: string, fileId: string) => post(account, { action: 'pick', fileId }).then(reply => reply.google),
  read: (account: string) => post<{ tabs: LiveTab[]; readAt: string }>(account, { action: 'read' }),
  saveMap: (account: string, map: SheetMap) => post(account, { action: 'saveMap', map }).then(reply => reply.google),
  createTemplate: (account: string, name: string, xlsx: string) => post<{ created: boolean }>(account, { action: 'createTemplate', name, xlsx }).then(reply => reply.google),
  forget: (account: string) => post(account, { action: 'forget' }).then(reply => reply.google),
  disconnect: (account: string) => post(account, { action: 'disconnect' }).then(reply => reply.google),
};

/** Bytes as base64, in chunks so a large workbook does not overflow the call stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

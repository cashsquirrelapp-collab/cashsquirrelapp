import { apiJson } from '../../services/api';
import type { ChatAction, IssueGroup } from './importChatModel';
import { chatContext } from './importChatModel';
import type { SheetState } from './importShared';

// A typed message in the import chat (owner, 2026-10-31: free for every account, 10 a file, 3 files a day). The server
// masks the samples, asks เลขา, checks the answer and returns a short reply with actions from a fixed list.

export interface ImportChatAnswer { reply: string; actions: ChatAction[]; available: boolean }

export async function askImportChat(accountId: string, text: string, fingerprint: string, today: string, sheets: SheetState[], groups: IssueGroup[]): Promise<ImportChatAnswer> {
  return apiJson<ImportChatAnswer>('/api/assistant', {
    method: 'POST', headers: { 'X-Account-ID': accountId },
    body: JSON.stringify({ action: 'import-chat', text: text.slice(0, 400), fingerprint: /^[0-9a-f]{64}$/.test(fingerprint) ? fingerprint : '', today, ...chatContext(sheets, groups) }),
  });
}

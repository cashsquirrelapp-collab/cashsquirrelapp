import { apiJson } from '../../services/api';
import type { LineInbox, LineInboxReply, LineQuickKind } from '../../../../shared/lineInbox';
import type { LineDueAction } from './lineMock';

// The real "แจ้งเตือนอัตโนมัติ" thread (owner, 2026-10-24: not a mock-up, this account's own data). The server
// builds it with LINE's rules; the payment buttons record money exactly as LINE's 08:00 buttons do.
export type LineInboxApi = {
  load(signal?: AbortSignal): Promise<LineInbox>;
  /** `shown` is the button's line in the thread, kept in the account with the answer. */
  due(action: LineDueAction, itemId: string, shown?: string): Promise<LineInboxReply>;
  partial(text: string): Promise<LineInboxReply>;
  /** A quick reply the thread already answered: the server makes the card again and keeps the exchange. */
  keepQuick(kind: LineQuickKind, text: string): Promise<void>;
};

export function createLineInbox(options: { account: string; onChanged?: () => void }): LineInboxApi {
  const headers = { 'X-Account-ID': options.account };
  const post = (body: unknown) => apiJson<LineInboxReply>('/api/assistant', { method: 'POST', headers, body: JSON.stringify(body) });
  const changed = (reply: LineInboxReply) => { if (reply.card) options.onChanged?.(); return reply; };
  return {
    load: signal => apiJson<LineInbox>('/api/assistant?view=line', { headers, signal }),
    due: async (action, itemId, shown) => changed(await post({ action: 'line-due', kind: action, id: itemId, ...(shown ? { shown: shown.slice(0, 200) } : {}) })),
    partial: async text => changed(await post({ action: 'line-partial', text })),
    keepQuick: async (kind, text) => { await post({ action: 'line-quick', kind, text: text.slice(0, 60) }); },
  };
}

/** "รับเงินบางส่วน #3F2A9C ยอด 5000": the amount typed after ได้ไม่ครบ. */
export const isPartialAmountText = (text: string) => /^รับเงิน(?:บางส่วน|ไม่ครบ)\s*#[0-9A-F]{6}/i.test(text.trim());

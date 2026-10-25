import type { AiCreditSnapshot, CreditProvider } from '../../../shared/aiCredit';
import { apiJson } from './api';

/** Only a complete answer is used; anything else is treated as not readable (the page then shows nothing about credit). */
const checked = (result: AiCreditSnapshot) => {
  if (!result || !Array.isArray(result.providers) || !result.ceiling) throw new Error('unreadable');
  return result;
};
export const adminAiCreditApi = {
  get(account: string, signal?: AbortSignal) {
    return apiJson<AiCreditSnapshot>('/api/admin-ai-credit', { signal, headers: { 'X-Account-ID': account } }).then(checked);
  },
  save(account: string, body: { provider: CreditProvider; balanceUsd: number; note?: string }) {
    return apiJson<AiCreditSnapshot>('/api/admin-ai-credit', { method: 'POST', body: JSON.stringify(body), headers: { 'X-Account-ID': account } }).then(checked);
  },
};

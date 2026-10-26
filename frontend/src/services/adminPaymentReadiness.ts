import type { PaymentReadiness } from '../../../shared/paymentReadiness';
import { apiJson } from './api';

/** The admin page's payment check (owner only): read it, or create the missing Pro prices in Stripe. */
export const adminPaymentReadinessApi = {
  read(account: string, signal?: AbortSignal) {
    return apiJson<PaymentReadiness>('/api/admin-payment-readiness', { signal, headers: { 'X-Account-ID': account } });
  },
  createPrices(account: string) {
    return apiJson<PaymentReadiness & { created: number }>('/api/admin-payment-readiness', {
      method: 'POST', body: JSON.stringify({ action: 'create_prices' }), headers: { 'X-Account-ID': account },
    });
  },
};

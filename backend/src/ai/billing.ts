import { ProviderError } from './types.js';

// A provider's answer that means money, not a passing fault (owner, 2026-10-25: warn before users are left wondering why
// เลขา stopped). Anthropic: "Your credit balance is too low ...". Gemini: "You exceeded your current quota, please check
// your plan and billing details", or billing not enabled. A short burst of rate limiting is not one of these.

export type BillingIssue = 'anthropic_credit' | 'gemini_billing' | 'gemini_quota';
export function billingIssueOf(error: unknown): BillingIssue | undefined {
  if (!(error instanceof ProviderError)) return undefined;
  const text = error.message || '';
  if (error.provider === 'anthropic') return error.status === 402 || /credit balance|purchase credits|insufficient (?:credit|funds|balance)/i.test(text) ? 'anthropic_credit' : undefined;
  if (error.provider === 'gemini') {
    if (/current quota|plan and billing|billing details|free[ -]?tier|per day|daily limit/i.test(text)) return 'gemini_quota';
    if (error.status !== 429 && /billing|prepa(?:y|id)|payment|credits? (?:are |is )?(?:exhausted|depleted)/i.test(text)) return 'gemini_billing';
  }
  return undefined;
}

import type { Invoice, InvoiceProfile } from './types.js';

/** Editing an assistant draft preserves the explicitly supplied issuer instead of replacing it with profile defaults. */
export function issuerForDocumentEdit(invoice: Invoice | undefined, profile: InvoiceProfile): InvoiceProfile {
  return invoice?.assistantDraft ? { ...invoice.issuer, signatureUrl: undefined } : profile;
}

/** Current branding can refresh an ordinary document, but cannot silently sign an assistant draft. */
export function applyDocumentBranding(invoice: Invoice, profile: InvoiceProfile): Invoice {
  return { ...invoice, issuer: {
    ...invoice.issuer,
    logoUrl: profile.logoUrl || invoice.issuer.logoUrl,
    logoHeight: profile.logoUrl ? profile.logoHeight : invoice.issuer.logoHeight,
    logoPosition: profile.logoUrl ? profile.logoPosition : invoice.issuer.logoPosition,
    logoOffset: profile.logoUrl ? profile.logoOffset : invoice.issuer.logoOffset,
    signatureUrl: invoice.assistantDraft ? undefined : profile.signatureUrl || invoice.issuer.signatureUrl,
    ...(invoice.issuer.bankAccount ? {} : { bankName: profile.bankName, bankAccount: profile.bankAccount, bankAccountName: profile.bankAccountName }),
  } };
}

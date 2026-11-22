import type { Invoice, InvoiceProfile } from './types.js';

/** Editing an assistant draft preserves the explicitly supplied issuer instead of replacing it with profile defaults. */
export function issuerForDocumentEdit(invoice: Invoice | undefined, profile: InvoiceProfile): InvoiceProfile {
  return invoice?.assistantDraft ? { ...invoice.issuer, signatureUrl: undefined } : profile;
}

/** Current branding can refresh an ordinary document, but cannot silently sign an assistant draft. A document whose
 * issuer was filled in for that document alone keeps exactly what it was saved with. */
export function applyDocumentBranding(invoice: Invoice, profile: InvoiceProfile): Invoice {
  // The colour is the account's look, picked above the preview, so it follows the profile on these too.
  if (invoice.issuerCustom) return profile.docColor && profile.docColor !== invoice.issuer.docColor ? { ...invoice, issuer: { ...invoice.issuer, docColor: profile.docColor } } : invoice;
  return { ...invoice, issuer: {
    ...invoice.issuer,
    logoUrl: profile.logoUrl || invoice.issuer.logoUrl,
    logoHeight: profile.logoUrl ? profile.logoHeight : invoice.issuer.logoHeight,
    logoPosition: profile.logoUrl ? profile.logoPosition : invoice.issuer.logoPosition,
    logoOffset: profile.logoUrl ? profile.logoOffset : invoice.issuer.logoOffset,
    docColor: profile.docColor || invoice.issuer.docColor,
    signatureUrl: invoice.assistantDraft ? undefined : profile.signatureUrl || invoice.issuer.signatureUrl,
    ...(invoice.issuer.bankAccount ? {} : { bankName: profile.bankName, bankAccount: profile.bankAccount, bankAccountName: profile.bankAccountName }),
  } };
}

/** The details a person types for one document's issuer (owner, 2026-11-22: "อยากกรอกเป็นคนอื่น ไม่ใช่กูเอง"). */
export const ISSUER_TEXT_FIELDS = ['name', 'taxId', 'address', 'phone', 'email', 'website', 'bankName', 'bankAccount', 'bankAccountName'] as const;
export type IssuerUse = { logo: boolean; signature: boolean };

/** One document's own issuer: the typed details, plus the saved logo, signature and colour only where asked for. */
export function documentIssuerFor(custom: InvoiceProfile, profile: InvoiceProfile, use: IssuerUse): InvoiceProfile {
  const issuer: InvoiceProfile = { name: '', address: '', phone: '', email: '', taxId: '', bankName: '', bankAccount: '', bankAccountName: '' };
  for (const field of ISSUER_TEXT_FIELDS) if (typeof custom[field] === 'string') issuer[field] = custom[field] as string;
  if (use.logo && profile.logoUrl) Object.assign(issuer, { logoUrl: profile.logoUrl, logoHeight: profile.logoHeight, logoPosition: profile.logoPosition, logoOffset: profile.logoOffset });
  if (use.signature && profile.signatureUrl) issuer.signatureUrl = profile.signatureUrl;
  if (profile.docColor) issuer.docColor = profile.docColor;
  return issuer;
}

/** The saved profile with one document's typed details made the default ("ตั้งเป็นค่าเริ่มต้นด้วย"). */
export function profileWithIssuerDetails(profile: InvoiceProfile, custom: InvoiceProfile): InvoiceProfile {
  const next = { ...profile };
  for (const field of ISSUER_TEXT_FIELDS) if (typeof custom[field] === 'string') next[field] = custom[field] as string;
  return next;
}

import type { DocumentType, Invoice } from '../../../../shared/types';
import { isPhaseOneFeatureAvailable } from '../../../../shared/featureAvailability';

import { T } from '../../i18n/tr';
export type DocumentWorkspaceTab = Exclude<DocumentType, 'receiptTaxInvoice'>;

export const DOCUMENT_WORKSPACE_TABS: Array<{ key: DocumentWorkspaceTab; label: string }> = [
  { key: 'quotation', label: T("ใบเสนอราคา") },
  { key: 'invoice', label: T("ใบแจ้งหนี้") },
  { key: 'receipt', label: T("ใบเสร็จ") },
  { key: 'taxInvoice', label: T("ใบกำกับภาษี") },
];

export const getWorkspaceTab = (type: DocumentType): DocumentWorkspaceTab =>
  type === 'receiptTaxInvoice' ? 'taxInvoice' : type;

export const isWorkspaceTab = (value: string | null): value is DocumentWorkspaceTab =>
  DOCUMENT_WORKSPACE_TABS.some(tab => tab.key === value);

export const isDocumentTypeAvailable = (type: DocumentType, fullFeatureAccess = false): boolean =>
  type !== 'quotation' || isPhaseOneFeatureAvailable('quotation', fullFeatureAccess);

export function resolveDocumentWorkspaceTab(value: string | null, fullFeatureAccess = false): DocumentWorkspaceTab {
  if (value === 'receiptTaxInvoice') return 'taxInvoice';
  if (isWorkspaceTab(value) && isDocumentTypeAvailable(value, fullFeatureAccess)) return value;
  return value === null && fullFeatureAccess ? 'quotation' : 'invoice';
}

/** Visibility affects selection only; callers retain every saved document for persistence. */
export function resolveDocumentSelection<T extends Pick<Invoice, 'id' | 'documentType'>>(
  documents: readonly T[],
  requestedTab: string | null,
  requestedId: string | null,
  fullFeatureAccess = false,
): { tab: DocumentWorkspaceTab; document: T | null; missing: boolean } {
  const tab = resolveDocumentWorkspaceTab(requestedTab, fullFeatureAccess);
  const visible = documents.filter(document => isDocumentTypeAvailable(document.documentType, fullFeatureAccess));
  if (requestedId !== null) {
    const document = visible.find(document => document.id === requestedId) ?? null;
    return { tab: document ? getWorkspaceTab(document.documentType) : tab, document, missing: document === null };
  }
  const document = fullFeatureAccess && requestedTab === null
    ? visible[0] ?? null
    : visible.find(document => getWorkspaceTab(document.documentType) === tab) ?? null;
  return { tab: document ? getWorkspaceTab(document.documentType) : tab, document, missing: false };
}

/** Import is additive: retain saved records, including hidden types and matching IDs. */
export function mergeImportedDocuments<T extends { id: string }>(saved: readonly T[], imported: readonly T[]): T[] {
  const knownIds = new Set(saved.map(document => document.id));
  const additions = imported.filter(document => {
    if (knownIds.has(document.id)) return false;
    knownIds.add(document.id);
    return true;
  });
  return [...additions, ...saved];
}

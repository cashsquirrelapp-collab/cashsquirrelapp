import assert from 'node:assert/strict';
import test from 'node:test';
import type { DocumentType } from '../shared/types';
import {
  DOCUMENT_WORKSPACE_TABS,
  getWorkspaceTab,
  isDocumentTypeAvailable,
  mergeImportedDocuments,
  resolveDocumentSelection,
  resolveDocumentWorkspaceTab,
} from '../frontend/src/features/invoices/documentAvailability';

const quotation = Object.freeze({ id: 'quote-1', documentType: 'quotation' as const });
const invoice = Object.freeze({ id: 'invoice-1', documentType: 'invoice' as const });
const receipt = Object.freeze({ id: 'receipt-1', documentType: 'receipt' as const });
const legacyTax = Object.freeze({ id: 'legacy-tax-1', documentType: 'receiptTaxInvoice' as const });
const documents = Object.freeze([quotation, receipt, invoice, legacyTax]);

// Quotations were released to every account on 2026-10-20 (shared/featureAvailability.ts).
test('every account sees quotation, invoice, receipt, and tax-invoice workspace tabs', () => {
  assert.deepEqual(DOCUMENT_WORKSPACE_TABS.filter(tab => isDocumentTypeAvailable(tab.key)).map(tab => tab.key), [
    'quotation', 'invoice', 'receipt', 'taxInvoice',
  ]);
  assert.equal(isDocumentTypeAvailable('quotation', true), true);
});

test('ordinary accounts open the invoice tab even when saved quotations come first', () => {
  assert.deepEqual(resolveDocumentSelection(documents, null, null), { tab: 'invoice', document: invoice, missing: false });
  assert.deepEqual(resolveDocumentSelection([quotation], null, null), { tab: 'invoice', document: null, missing: false });
});

test('ordinary accounts open a requested quotation tab and quotation link', () => {
  assert.equal(resolveDocumentWorkspaceTab('quotation'), 'quotation');
  assert.deepEqual(resolveDocumentSelection(documents, 'quotation', null), { tab: 'quotation', document: quotation, missing: false });
  assert.deepEqual(resolveDocumentSelection(documents, 'quotation', quotation.id), { tab: 'quotation', document: quotation, missing: false });
  assert.deepEqual(resolveDocumentSelection(documents, 'receipt', 'missing'), { tab: 'receipt', document: null, missing: true });
});

test('visible document links select the exact document and its matching tab', () => {
  assert.deepEqual(resolveDocumentSelection(documents, 'invoice', receipt.id), { tab: 'receipt', document: receipt, missing: false });
});

test('legacy combined receipts remain available under tax invoices with their stored type intact', () => {
  assert.equal(getWorkspaceTab(legacyTax.documentType), 'taxInvoice');
  assert.equal(resolveDocumentWorkspaceTab('receiptTaxInvoice'), 'taxInvoice');
  assert.deepEqual(resolveDocumentSelection(documents, 'taxInvoice', null), { tab: 'taxInvoice', document: legacyTax, missing: false });
  assert.deepEqual(resolveDocumentSelection(documents, null, legacyTax.id), { tab: 'taxInvoice', document: legacyTax, missing: false });
  assert.equal(legacyTax.documentType, 'receiptTaxInvoice');
});

test('administrators retain quotation tabs, default selection, and direct document links', () => {
  assert.equal(resolveDocumentWorkspaceTab('quotation', true), 'quotation');
  assert.deepEqual(resolveDocumentSelection(documents, null, null, true), { tab: 'quotation', document: quotation, missing: false });
  assert.deepEqual(resolveDocumentSelection(documents, 'quotation', quotation.id, true), { tab: 'quotation', document: quotation, missing: false });
});

test('visibility never mutates or removes saved quotations from source documents', () => {
  resolveDocumentSelection(documents, null, null);
  resolveDocumentSelection(documents, 'quotation', quotation.id);
  assert.deepEqual(documents, [quotation, receipt, invoice, legacyTax]);
  assert.equal(documents[0], quotation);
});

test('legacy imports preserve saved hidden quotations and current records with matching IDs', () => {
  const added = Object.freeze({ id: 'invoice-new', documentType: 'invoice' as const });
  const imported = Object.freeze([added, { ...quotation, documentType: 'invoice' as const }, added]);
  const merged = mergeImportedDocuments<{ id: string; documentType: DocumentType }>(documents, imported);
  assert.deepEqual(merged, [added, ...documents]);
  assert.equal(merged.find(document => document.id === quotation.id), quotation);
  assert.deepEqual(documents, [quotation, receipt, invoice, legacyTax]);
});

const DOCUMENT_TABS = new Set(['quotation', 'invoice', 'receipt', 'taxInvoice']);

/** Only saved-document and certificate-tracking destinations survive OAuth; never an open redirect. */
export function safeDocumentReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1500 || !/^\/(?:invoice\?|wht50(?:\?|$))/.test(value)
    || /[\\\r\n\u0000]/.test(value)) return undefined;
  let url: URL;
  try { url = new URL(value, 'https://document-return.invalid'); } catch { return undefined; }
  if (url.origin !== 'https://document-return.invalid' || url.hash) return undefined;
  if (url.pathname === '/wht50') return url.searchParams.get('from') === 'line' ? '/wht50?from=line' : '/wht50';
  if (url.pathname !== '/invoice') return undefined;
  const type = url.searchParams.get('type');
  const documentId = url.searchParams.get('document');
  if (!type || !DOCUMENT_TABS.has(type)) return undefined;
  if (documentId !== null && (!documentId || documentId.length > 128
    || /[\p{Cc}\p{Cf}]/u.test(documentId)
    || ['__proto__', 'prototype', 'constructor'].includes(documentId))) return undefined;
  const params = new URLSearchParams({ type });
  if (documentId !== null) params.set('document', documentId);
  if (url.searchParams.get('from') === 'line') params.set('from', 'line');
  return `/invoice?${params}`;
}

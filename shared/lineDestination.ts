const APP_PATHS = new Set(['/', '/app', '/jobs', '/report', '/receivables', '/incomeExpense', '/vault', '/line-documents', '/wht50', '/calendar', '/invoice']);
const DOCUMENT_TYPES = new Set(['quotation', 'invoice', 'receipt', 'taxInvoice']);

/** A destination is navigation only; it never grants access to the named document. */
export function safeLineDestination(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1500 || !value.startsWith('/') || value.startsWith('//') || /[\\\p{Cc}\p{Cf}]/u.test(value)) return undefined;
  let url: URL;
  try { url = new URL(value, 'https://line-return.invalid'); } catch { return undefined; }
  if (url.origin !== 'https://line-return.invalid' || url.hash || !APP_PATHS.has(url.pathname)) return undefined;
  const query = new URLSearchParams();
  if (url.pathname === '/jobs' && url.searchParams.get('openAddJob') === '1') query.set('openAddJob', '1');
  if (url.pathname === '/line-documents') {
    const view = url.searchParams.get('view');
    const file = url.searchParams.get('file');
    const kind = url.searchParams.get('kind');
    if (view === 'filed' || view === 'missing') query.set('view', view);
    if (file && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(file)) {
      query.set('file', file);
      if (kind && ['wht50', 'contract', 'expense', 'other'].includes(kind)) query.set('kind', kind);
    }
  }
  if (url.pathname === '/invoice') {
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('document');
    if (type !== null && !DOCUMENT_TYPES.has(type)) return undefined;
    if (id !== null && (!type || !id || id.length > 128 || /[\p{Cc}\p{Cf}]/u.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id))) return undefined;
    if (type) query.set('type', type);
    if (id) query.set('document', id);
  }
  query.set('from', 'line');
  return `${url.pathname}?${query}`;
}

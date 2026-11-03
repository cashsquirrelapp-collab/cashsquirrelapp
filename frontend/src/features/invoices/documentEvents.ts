/** The tab bar's ออกเอกสาร button (phones, App) asks the documents page to open its sheet of document types. */
export const NEW_DOCUMENT_EVENT = 'krarok:new-document';

// A tap while the documents are still loading is kept until the page is there to open its sheet (2026-11-03: the first
// tap on a freshly opened page used to be lost).
// It lapses after 10 seconds, so leaving before the page loads never opens the sheet on a later visit.
let pendingAt = 0;
export function requestNewDocument() {
  pendingAt = Date.now();
  window.dispatchEvent(new Event(NEW_DOCUMENT_EVENT));
}
/** True once for a recent tap not yet answered. */
export function takeNewDocumentRequest(): boolean {
  const recent = pendingAt > 0 && Date.now() - pendingAt < 10_000;
  pendingAt = 0;
  return recent;
}

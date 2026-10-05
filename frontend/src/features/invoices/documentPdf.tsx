import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Invoice } from '../../../../shared/types';
import { DOCUMENT_CSS, DOCUMENT_FONT_URL, DocumentA4, A4_WIDTH_PX } from './DocumentA4';

// A real PDF file of a document, made in the browser so it can be attached when sharing (or
// downloaded straight away). It draws the same <DocumentA4/> the preview and print window use,
// page by page, into an A4 PDF. The libraries are loaded only when someone asks for a file.

const PDF_SCALE = 2; // render at 2x so text stays crisp when zoomed or printed

const ensureDocumentFont = () => {
  const id = 'da4-font';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = DOCUMENT_FONT_URL;
  document.head.appendChild(link);
};

const imagesReady = (root: HTMLElement) => Promise.all(
  Array.from(root.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : img.decode().catch(() => undefined)),
);

/** File name for a document's PDF, e.g. "QT-2569-002.pdf". */
export const documentPdfName = (invoice: Invoice) =>
  `${(invoice.documentNo || 'document').replace(/[<>&"'/\\:*?|]/g, '').trim() || 'document'}.pdf`;

export async function renderDocumentPdf(invoice: Invoice): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  ensureDocumentFont();

  // Off screen but laid out at real A4 size, so the capture matches the printed page exactly.
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;pointer-events:none;z-index:-1;background:#fff`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<><style>{DOCUMENT_CSS}</style><DocumentA4 invoice={invoice} print /></>));
    await document.fonts.ready;
    await imagesReady(host);

    const pages = Array.from(host.querySelectorAll<HTMLElement>('.da4-page'));
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (const [i, page] of pages.entries()) {
      const canvas = await html2canvas(page, { scale: PDF_SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false });
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
    pdf.setProperties({ title: invoice.documentNo });
    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Save a generated PDF with the document's own file name. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface PdfFileState {
  /** The ready PDF for the current content of the document, if it has been made. */
  file?: File;
  failed: boolean;
  /** Make (or reuse) the PDF for the current content. */
  ensure: () => Promise<File>;
}

/**
 * Keeps a PDF of the open document ready in the background. Sharing a file has to happen right
 * after a tap, so the file must already exist when the share button is pressed.
 */
export function usePdfFile(invoice: Invoice | null): PdfFileState {
  const key = invoice ? JSON.stringify(invoice) : '';
  const [state, setState] = React.useState<{ key: string; file?: File; failed?: boolean }>({ key: '' });
  const pending = React.useRef<{ key: string; promise: Promise<File> } | null>(null);
  const latest = React.useRef(invoice);
  latest.current = invoice;

  const ensure = React.useCallback((): Promise<File> => {
    const doc = latest.current;
    if (!doc) return Promise.reject(new Error('no document'));
    if (pending.current?.key === key) return pending.current.promise;
    const promise = renderDocumentPdf(doc)
      .then(blob => new File([blob], documentPdfName(doc), { type: 'application/pdf' }))
      .then(file => { setState({ key, file }); return file; }) // ignored once the content changes (key check below)
      .catch(error => { setState({ key, failed: true }); if (pending.current?.key === key) pending.current = null; throw error; });
    pending.current = { key, promise };
    return promise;
  }, [key]);

  React.useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => { ensure().catch(() => undefined); }, 400);
    return () => window.clearTimeout(t);
  }, [key, ensure]);

  return { file: state.key === key ? state.file : undefined, failed: state.key === key && Boolean(state.failed), ensure };
}

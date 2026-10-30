import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Invoice } from '../../../shared/types';
import { A4_WIDTH_PX, DOCUMENT_CSS, DOCUMENT_FONT_URL, DocumentA4 } from '../features/invoices/DocumentA4';

// The picture of a new document for the LINE chat (owner, 2026-10-30: "ส่งรูป PDF เข้าแชทเหมือน Paypers"). The LINE form
// (liff-document.js) loads this only after a document is created: it draws the app's own <DocumentA4/>, the same sheet
// as the preview and the PDF, and returns its first page as a JPEG for the server to send into the chat.

const SCALE = 1.25; // about 990 × 1400: sharp on a phone, well under LINE's 1 MB preview limit
const QUALITY = 0.86;

function ensureFont() {
  if (document.getElementById('da4-font')) return;
  const link = document.createElement('link');
  link.id = 'da4-font'; link.rel = 'stylesheet'; link.href = DOCUMENT_FONT_URL;
  document.head.appendChild(link);
}

async function render(invoice: Invoice): Promise<string> {
  const { default: html2canvas } = await import('html2canvas-pro');
  ensureFont();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;pointer-events:none;z-index:-1;background:#fff`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<><style>{DOCUMENT_CSS}</style><DocumentA4 invoice={invoice} print /></>));
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll('img')).map(img => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
    const page = host.querySelector<HTMLElement>('.da4-page') ?? host;
    const canvas = await html2canvas(page, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false });
    return canvas.toDataURL('image/jpeg', QUALITY).replace(/^data:image\/jpeg;base64,/, '');
  } finally {
    root.unmount();
    host.remove();
  }
}

(window as unknown as { KrarokDocumentImage: { render: typeof render } }).KrarokDocumentImage = { render };

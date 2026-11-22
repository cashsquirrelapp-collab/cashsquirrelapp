import { z } from 'zod';
import type { Invoice } from './types.js';

// ลิงก์ให้ลูกค้ายืนยันใบเสนอราคา (owner, 2026-11-22, from a production client: about 20 clients a month each sign a
// quotation that works as the contract). The client opens a link, sees the quotation, types their name, signs and
// confirms; the quotation records who, when and which version. Editing the quotation afterwards makes the old link
// stop working, so a client can never confirm a version they were not shown.

/** What the client confirmed, kept on the quotation itself. */
export interface QuoteApproval {
  status: 'accepted';
  name: string;
  /** The signature drawn on the page, a PNG data URL. */
  signatureUrl: string;
  at: string;
  /** quoteRevision() of the version confirmed. */
  revision: string;
}

/** A short fingerprint of everything the client agrees to; any change to these makes a new one. */
export function quoteRevision(invoice: Pick<Invoice, 'documentNo' | 'createdDate' | 'dueDate' | 'client' | 'items' | 'vatRate' | 'whtRate' | 'note' | 'paymentTerm' | 'deliveryTerm' | 'issuer'>): string {
  const text = JSON.stringify([
    invoice.documentNo, invoice.createdDate, invoice.dueDate ?? '', invoice.client?.name ?? '', invoice.client?.taxId ?? '',
    (invoice.items || []).map(item => [item.description, item.detail ?? '', item.quantity, item.price, item.discount ?? 0, item.unit ?? '']),
    invoice.vatRate, invoice.whtRate, invoice.note ?? '', invoice.paymentTerm ?? '', invoice.deliveryTerm ?? '',
    invoice.issuer?.name ?? '', invoice.issuer?.taxId ?? '',
  ]);
  // FNV-1a, twice with different seeds, for 16 hex characters: enough to tell versions of one quotation apart.
  const hash = (seed: number) => {
    let value = seed >>> 0;
    for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 0x01000193) >>> 0; }
    return value.toString(16).padStart(8, '0');
  };
  return hash(0x811c9dc5) + hash(0x01000193);
}

export const QUOTE_SIGNATURE_MAX = 200_000;
export const quoteAcceptSchema = z.object({
  action: z.literal('accept'),
  token: z.string().min(20).max(400),
  name: z.string().trim().min(2).max(120),
  signature: z.string().max(QUOTE_SIGNATURE_MAX).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
  agree: z.literal(true),
});
export type QuoteAcceptInput = z.infer<typeof quoteAcceptSchema>;

/** What the public page receives: the quotation as printed, and whether it is confirmed already. */
export interface QuoteView {
  invoice: Invoice;
  approval: QuoteApproval | null;
}

/** Days a link stays usable. */
export const QUOTE_LINK_DAYS = 60;

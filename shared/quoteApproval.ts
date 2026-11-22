import { z } from 'zod';
import type { Invoice } from './types.js';

// ลิงก์ให้ลูกค้ายืนยันใบเสนอราคา (owner, 2026-11-22, from a production client: about 20 clients a month each sign a
// quotation that works as the contract). The client opens a link, sees the quotation, types their name, signs and
// confirms; the quotation records who, when and which version. Editing the quotation afterwards makes the old link
// stop working, so a client can never confirm a version they were not shown.

/**
 * What a link lets the client do with each kind of document (owner, 2026-11-22: links for every document, and a download):
 * a quotation is signed to confirm it, an invoice is acknowledged as received (a signature is optional), a receipt or a
 * tax invoice is only looked at and kept.
 */
export type DocumentLinkKind = 'sign' | 'acknowledge' | 'view';
export function documentLinkKind(type: string): DocumentLinkKind {
  return type === 'quotation' ? 'sign' : type === 'invoice' ? 'acknowledge' : 'view';
}

/** The short link of a quotation (owner, 2026-11-22: the signed link looked long enough to pass for a scam): a random
 * code made on the owner's device and kept on the quotation, krarok.com/q/<code>. */
export interface QuoteLinkRecord { code: string; revision: string; expires: string }
export const QUOTE_CODE = /^[A-Za-z0-9]{12}$/;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** Twelve letters and digits from the device's random source (about 70 bits; never guessed). */
export function newQuoteCode(random: (bytes: Uint8Array) => Uint8Array = bytes => crypto.getRandomValues(bytes)): string {
  const bytes = random(new Uint8Array(12));
  return Array.from(bytes, byte => CODE_LETTERS[byte % CODE_LETTERS.length]).join('');
}

/** A signer's name as it prints: one line of plain text, and no pile of Thai marks stacked on one letter (2026-11-22). */
export function cleanSignerName(name: string): string {
  return name.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, '')
    .replace(/^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/, '')
    .replace(/([\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]{2})[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+/g, '$1')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** What the client confirmed, kept on the quotation itself. */
export interface QuoteApproval {
  status: 'accepted';
  name: string;
  /** The signature drawn on the page, a PNG data URL; an invoice may be acknowledged without one. */
  signatureUrl?: string;
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
  /** The short code (krarok.com/q/<code>), or the long signed link sent before 2026-11-22's short links. */
  token: z.string().min(12).max(400),
  name: z.string().max(200).transform(cleanSignerName).pipe(z.string().min(2)),
  /** Required to confirm a quotation; optional when acknowledging an invoice. */
  signature: z.string().max(QUOTE_SIGNATURE_MAX).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).optional(),
  agree: z.literal(true),
});
export type QuoteAcceptInput = z.infer<typeof quoteAcceptSchema>;

/** What the public page receives: the quotation as printed, and whether it is confirmed already. */
export interface QuoteView {
  invoice: Invoice;
  approval: QuoteApproval | null;
  /** A Free account's documents carry the small credit line, on the client's copy too. */
  watermark?: boolean;
}

/** Days a link stays usable. */
export const QUOTE_LINK_DAYS = 60;

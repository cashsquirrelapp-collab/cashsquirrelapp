import { getSupabaseAdmin } from '../config/supabase.js';
import type { LineMessage } from './line.js';

// The picture of a new document for the LINE chat (owner, 2026-10-30: "ส่งรูป PDF เข้าแชทเหมือน Paypers"). The LINE form
// draws the app's own A4 sheet (frontend/src/liff/documentImage.tsx) and sends it here; it is kept in a private bucket,
// made the same way as the monthly reports (no SQL), and LINE gets a long-lived signed link to show it in the chat.

export const DOCUMENT_IMAGES_BUCKET = 'line-document-images';
/** LINE's preview limit is 1 MB; a drawn A4 page is about 150–300 KB. */
export const MAX_DOCUMENT_IMAGE_BYTES = 1_000_000;
const LINK_SECONDS = 365 * 24 * 3600;

export async function ensureDocumentImageBucket(): Promise<void> {
  const storage = getSupabaseAdmin().storage;
  const options = { public: false, fileSizeLimit: MAX_DOCUMENT_IMAGE_BYTES, allowedMimeTypes: ['image/jpeg'] };
  const found = await storage.getBucket(DOCUMENT_IMAGES_BUCKET);
  if (found.error) {
    if (String((found.error as { statusCode?: unknown }).statusCode) !== '404' && !/not found/i.test(found.error.message)) throw found.error;
    const created = await storage.createBucket(DOCUMENT_IMAGES_BUCKET, options);
    if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
  }
}

/** A JPEG as base64, checked: the real JPEG start bytes and LINE's size limit. Null when it is not one. */
export function decodeDocumentImage(base64: unknown): Uint8Array | null {
  if (typeof base64 !== 'string' || base64.length < 100 || base64.length > Math.ceil(MAX_DOCUMENT_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+=*$/.test(base64)) return null;
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
  return bytes.length <= MAX_DOCUMENT_IMAGE_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? bytes : null;
}

/** Keeps the picture under the owner's folder and returns a link LINE can open. */
export async function storeDocumentImage(userId: string, documentId: string, bytes: Uint8Array): Promise<string> {
  await ensureDocumentImageBucket();
  const storage = getSupabaseAdmin().storage.from(DOCUMENT_IMAGES_BUCKET);
  const path = `${userId}/${documentId}.jpg`;
  const uploaded = await storage.upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (uploaded.error) throw uploaded.error;
  const signed = await storage.createSignedUrl(path, LINK_SECONDS);
  if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error('signed link missing');
  return signed.data.signedUrl;
}

/** The document as the account owns it (id and number), or null when it is not this account's. */
export async function ownDocumentSummary(userId: string, documentId: string): Promise<{ documentNo: string } | null> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_invoices').select('documentNo:data->>documentNo').eq('user_id', userId).eq('id', documentId).maybeSingle();
  if (error) throw error;
  return data && typeof (data as { documentNo?: unknown }).documentNo === 'string' ? { documentNo: (data as { documentNo: string }).documentNo } : null;
}

export function documentImageMessage(url: string): LineMessage {
  return { type: 'image', originalContentUrl: url, previewImageUrl: url };
}

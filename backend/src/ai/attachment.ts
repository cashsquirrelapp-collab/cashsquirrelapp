import { HttpError } from '../http/guard.js';

// A file the user attaches to a เลขากระรอก message: a picture (a transfer slip, a receipt, a photo of a quotation)
// or a PDF. It goes to the model with that one message and is never stored. Checked by its real first bytes,
// not only by the type the browser claims.

export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
export interface Attachment { name: string; mimeType: AttachmentType; data: string }

/** 4 MB of file; base64 is a third larger, so the request body allows about 5.4 MB of text for it. */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_MAX_BASE64 = Math.ceil(ATTACHMENT_MAX_BYTES / 3) * 4;

const startsWith = (bytes: Uint8Array, ...values: number[]) => values.every((value, index) => bytes[index] === value);
function sniff(bytes: Uint8Array): AttachmentType | null {
  if (startsWith(bytes, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (startsWith(bytes, 0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

/** The attachment as the model gets it, or a 400/413 the person can act on. */
export function checkAttachment(input: { name: string; mimeType: string; data: string }): Attachment {
  if (input.data.length > ATTACHMENT_MAX_BASE64) throw new HttpError(413, 'ไฟล์ใหญ่เกิน 4 MB กรุณาเลือกไฟล์ที่เล็กลง', 'ai_file_too_large');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data) || input.data.length % 4 !== 0) throw new HttpError(400, 'ไฟล์แนบไม่ถูกต้อง', 'ai_file_invalid');
  const bytes = Buffer.from(input.data, 'base64');
  if (!bytes.length || bytes.length > ATTACHMENT_MAX_BYTES) throw new HttpError(413, 'ไฟล์ใหญ่เกิน 4 MB กรุณาเลือกไฟล์ที่เล็กลง', 'ai_file_too_large');
  const real = sniff(bytes);
  if (!real || real !== input.mimeType) throw new HttpError(400, 'แนบได้เฉพาะรูป (JPG, PNG, WEBP) หรือไฟล์ PDF', 'ai_file_type');
  const name = input.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) || 'ไฟล์แนบ';
  return { name, mimeType: real, data: input.data };
}

// Several files in one message (owner, 2026-10-31: "เอาเลยไม่เกิน 5 ภาพ ละไฟล์ล่ะ"): pictures and PDFs, at most 5, each
// within 4 MB and 8 MB together, so the request and the model call stay well inside the server's memory.
export const MAX_FILES = 5;
export const ATTACHMENTS_MAX_BYTES = 8 * 1024 * 1024;
const ATTACHMENTS_MAX_BASE64 = Math.ceil(ATTACHMENTS_MAX_BYTES / 3) * 4;

/** Every file of one message checked, or a 413 the person can act on when they are too many or too large together. */
export function checkAttachments(list: { name: string; mimeType: string; data: string }[]): Attachment[] {
  if (list.length > MAX_FILES) throw new HttpError(413, `แนบได้ครั้งละไม่เกิน ${MAX_FILES} ไฟล์`, 'ai_too_many_files');
  if (list.reduce((sum, file) => sum + file.data.length, 0) > ATTACHMENTS_MAX_BASE64) throw new HttpError(413, 'ไฟล์รวมกันใหญ่เกิน 8 MB กรุณาส่งทีละน้อยลง', 'ai_files_too_large');
  // Two files with one name (a phone pastes every picture as image.jpg) are told apart, so a card can say which.
  const seen = new Map<string, number>();
  return list.map(file => {
    const checked = checkAttachment(file);
    const count = (seen.get(checked.name) ?? 0) + 1;
    seen.set(checked.name, count);
    return count > 1 ? { ...checked, name: checked.name.replace(/(\.[A-Za-z0-9]+)?$/, ext => ` (${count})${ext}`) } : checked;
  });
}

/** What the chat history keeps of a message's files: names and kinds only (the column holds at most 500 characters). */
export function storedAttachment(files: Attachment[]): { name: string; kind: 'image' | 'pdf'; files?: { name: string; kind: 'image' | 'pdf' }[] } | undefined {
  if (!files.length) return undefined;
  const kind = (file: Attachment) => (file.mimeType === 'application/pdf' ? 'pdf' as const : 'image' as const);
  if (files.length === 1) return { name: files[0].name.slice(0, 120), kind: kind(files[0]) };
  return { name: files[0].name.slice(0, 60), kind: kind(files[0]), files: files.map(file => ({ name: file.name.slice(0, 48), kind: kind(file) })) };
}


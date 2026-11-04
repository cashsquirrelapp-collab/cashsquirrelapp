// Files sent to เลขา. Dictation lives in useDictation.ts: record locally, then transcribe once after stopping, with the
// server's normal token accounting. Reading answers aloud was removed (owner, 2026-10-27).

import { readableFile } from '../../utils/heic';
import { tr } from '../../i18n/tr';
import { readFileText, textFileType, type FileText } from './fileText';
import { checkForAssistant, checkSpreadsheet, checkTables, type FileCheck } from './fileCheck';

/** kind 'text': a spreadsheet, Word, PowerPoint or text file read into text on this device (fileText.ts); `data` is that
 *  text (UTF-8, base64) and `summary` says what it held, e.g. "Excel · 2 แท็บ · 120 แถว". */
export type PreparedFile = {
  name: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'text/plain'; data: string;
  kind: 'image' | 'pdf' | 'text'; bytes: number; summary?: string;
  /** A spreadsheet (or a Word table) read as the import reads it: the chat's "ตรวจไฟล์" card (fileCheck.ts). */
  check?: FileCheck;
};
export const FILE_MAX_BYTES = 4 * 1024 * 1024;

const toBase64 = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

function textSummary(read: FileText): string {
  const parts = [read.label];
  if (read.sheets && read.sheets > 1) parts.push(tr("{0} แท็บ", read.sheets));
  if (read.rows !== undefined) parts.push(tr("{0} แถว", read.rows.toLocaleString('en-US')));
  else if (read.slides !== undefined) parts.push(tr("{0} สไลด์", read.slides));
  else parts.push(tr("{0} ตัวอักษร", read.chars.toLocaleString('en-US')));
  if (read.truncated) parts.push(tr("ส่งเฉพาะส่วนแรก"));
  return parts.join(' · ');
}

/**
 * Ready a picked file for เลขา: pictures are redrawn at most 1600px wide as JPEG (smaller to send, and the
 * photo's hidden location data is dropped); a PDF goes as it is; a spreadsheet, Word, PowerPoint or text file goes as
 * its text (owner, 2026-11-04). Throws 'type', 'size', 'old', 'big' or 'empty' for the screen to explain.
 */
export async function prepareFile(picked: File): Promise<PreparedFile> {
  const asText = textFileType(picked.name, picked.type);
  if (asText === 'old') throw new Error('old');
  if (asText) {
    const data = await picked.arrayBuffer();
    const read = await readFileText(() => import('xlsx'), picked.name || 'file', data, picked.type);
    // A list of jobs or expenses is also read by the import's rules (owner, 2026-11-04: "ตรวจเช็คว่ามันถูกต้องไหม"); its
    // figures go to เลขา first, so its answer uses the same numbers the import would save.
    const check = asText.kind === 'sheet' ? checkSpreadsheet(await import('xlsx'), data, picked)
      : read.tables?.length ? checkTables(read.tables, picked.name) : undefined;
    // With the check, its own line about "บันทึกทั้งหมด" takes the place of the general one about the import page.
    const text = check ? read.text.replace(/\nไฟล์นี้มี \d+ แถว ถ้าผู้ใช้อยากบันทึกทุกแถว[^\n]*/, '').replace(/\n/, `\n${checkForAssistant(check)}\n`) : read.text;
    const bytes = new TextEncoder().encode(text);
    return { name: picked.name.slice(0, 120) || 'file', mimeType: 'text/plain', data: toBase64(bytes), kind: 'text', bytes: bytes.byteLength,
      // With the check, the rows counted are its rows of data (headings and blank rows left out), as its card says.
      summary: textSummary(check && read.rows !== undefined ? { ...read, rows: check.rows } : read), ...(check ? { check } : {}) };
  }
  // An iPhone photo (HEIC) becomes a JPEG first: Chrome cannot read HEIC (frontend/src/utils/heic.ts).
  const file = await readableFile(picked).catch(() => { throw new Error('type'); });
  const name = file.name.slice(0, 120) || 'file';
  if (file.type === 'application/pdf') {
    if (file.size > FILE_MAX_BYTES) throw new Error('size');
    const buffer = await file.arrayBuffer();
    return { name, mimeType: 'application/pdf', data: toBase64(buffer), kind: 'pdf', bytes: buffer.byteLength };
  }
  if (!file.type.startsWith('image/')) throw new Error('type');
  if (file.size > 25 * 1024 * 1024) throw new Error('size');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('type'); });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('type');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('type');
  if (blob.size > FILE_MAX_BYTES) throw new Error('size');
  const buffer = await blob.arrayBuffer();
  return { name: name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', mimeType: 'image/jpeg', data: toBase64(buffer), kind: 'image', bytes: buffer.byteLength };
}

import { T } from '../../i18n/tr';
import { prepareFile, type PreparedFile } from './voice';

// Several files in one message to เลขากระรอก (owner, 2026-10-31: "เอาเลยไม่เกิน 5 ภาพ ละไฟล์ล่ะ"): pictures and PDFs, at most
// 5, each within 4 MB (pictures are made smaller on the device first) and 8 MB together, as the server checks too
// (backend/src/ai/attachment.ts). Used by the full chat and the floating window. Since 2026-11-04 also spreadsheets,
// Word, PowerPoint and text files, sent as their text (fileText.ts), at most 192 KB of text in one message.

export const MAX_CHAT_FILES = 5;
export const MAX_CHAT_BYTES = 8 * 1024 * 1024;
/** The text of spreadsheets and documents together in one message (the server allows 256 KB): each costs tokens to read. */
export const MAX_CHAT_TEXT_BYTES = 192 * 1024;
export type FileProblem = 'type' | 'size' | 'count' | 'total' | 'old' | 'big' | 'empty' | 'long';
const PROBLEMS: FileProblem[] = ['type', 'size', 'old', 'big', 'empty'];

/** A second file with the same name (a phone pastes every picture as image.jpg) gets "(2)", so a card can say which. */
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 2; ; n += 1) { const next = `${stem} (${n})${ext}`; if (!taken.has(next)) return next; }
}

/** The files picked, dropped or pasted, added to those already waiting: prepared one by one, stopping at the limits. */
export async function addChatFiles(current: PreparedFile[], picked: File[]): Promise<{ files: PreparedFile[]; problem: FileProblem | null }> {
  const files = [...current];
  let problem: FileProblem | null = null;
  for (const file of picked) {
    if (files.length >= MAX_CHAT_FILES) { problem = 'count'; break; }
    try {
      const prepared = await prepareFile(file);
      if (files.reduce((sum, item) => sum + item.bytes, 0) + prepared.bytes > MAX_CHAT_BYTES) { problem = 'total'; break; }
      const text = (list: PreparedFile[]) => list.filter(item => item.kind === 'text').reduce((sum, item) => sum + item.bytes, 0);
      if (prepared.kind === 'text' && text(files) + prepared.bytes > MAX_CHAT_TEXT_BYTES) { problem = 'long'; continue; }
      files.push({ ...prepared, name: uniqueName(prepared.name, new Set(files.map(item => item.name))) });
    } catch (error) {
      const reason = (error as Error).message as FileProblem;
      problem = PROBLEMS.includes(reason) ? reason : 'type';
    }
  }
  return { files, problem };
}

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  size: T("ไฟล์ใหญ่เกิน 4 MB กรุณาเลือกไฟล์ที่เล็กลง"),
  type: T("ไฟล์แบบนี้ยังอ่านไม่ได้ แนบได้: รูป, PDF, Excel, CSV, Word, PowerPoint และไฟล์ข้อความ"),
  count: T("แนบได้ครั้งละไม่เกิน 5 ไฟล์"),
  total: T("ไฟล์รวมกันใหญ่เกิน 8 MB กรุณาส่งทีละน้อยลง"),
  old: T("ไฟล์ Word หรือ PowerPoint แบบเก่า (.doc, .ppt) และไฟล์ Pages หรือ Keynote กรุณาบันทึกเป็น .docx, .pptx หรือ PDF ก่อน"),
  big: T("ไฟล์ใหญ่เกิน 15 MB กรุณาเลือกไฟล์ที่เล็กลง"),
  empty: T("ไม่พบข้อความหรือตัวเลขในไฟล์นี้"),
  long: T("ไฟล์ตารางหรือเอกสารรวมกันยาวเกินไป กรุณาส่งทีละไฟล์"),
};

/** What the file picker offers: pictures, PDF, spreadsheets, documents, slides and text (owner, 2026-11-04). */
export const CHAT_FILE_ACCEPT = [
  'image/*', '.heic', '.heif', 'application/pdf', '.xlsx', '.xlsm', '.xlsb', '.xls', '.ods', '.numbers', '.csv', '.tsv',
  '.docx', '.odt', '.rtf', '.pptx', '.odp', '.txt', '.md', '.json', '.html', '.htm', '.xml',
].join(',');

/** What a sent message shows of its files: names and kinds, and a small picture of each image. */
export const shownFiles = (files: PreparedFile[]) => files.map(file => ({ name: file.name, kind: file.kind, ...(file.kind === 'image' ? { preview: `data:${file.mimeType};base64,${file.data}` } : {}), ...(file.summary ? { summary: file.summary } : {}), ...(file.check ? { check: file.check } : {}) }));
export const sentFiles = (files: PreparedFile[]) => files.map(file => ({ name: file.name, mimeType: file.mimeType, data: file.data }));
export const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

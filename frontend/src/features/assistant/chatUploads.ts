import { T } from '../../i18n/tr';
import { prepareFile, type PreparedFile } from './voice';

// Several files in one message to เลขากระรอก (owner, 2026-10-31: "เอาเลยไม่เกิน 5 ภาพ ละไฟล์ล่ะ"): pictures and PDFs, at most
// 5, each within 4 MB (pictures are made smaller on the device first) and 8 MB together, as the server checks too
// (backend/src/ai/attachment.ts). Used by the full chat and the floating window.

export const MAX_CHAT_FILES = 5;
export const MAX_CHAT_BYTES = 8 * 1024 * 1024;
export type FileProblem = 'type' | 'size' | 'count' | 'total';

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
      files.push({ ...prepared, name: uniqueName(prepared.name, new Set(files.map(item => item.name))) });
    } catch (error) {
      problem = (error as Error).message === 'size' ? 'size' : 'type';
    }
  }
  return { files, problem };
}

export const FILE_PROBLEM_TEXT: Record<FileProblem, string> = {
  size: T("ไฟล์ใหญ่เกิน 4 MB กรุณาเลือกไฟล์ที่เล็กลง"),
  type: T("แนบได้เฉพาะรูป (JPG, PNG, WEBP, HEIC) หรือไฟล์ PDF"),
  count: T("แนบได้ครั้งละไม่เกิน 5 ไฟล์"),
  total: T("ไฟล์รวมกันใหญ่เกิน 8 MB กรุณาส่งทีละน้อยลง"),
};

/** What a sent message shows of its files: names and kinds, and a small picture of each image. */
export const shownFiles = (files: PreparedFile[]) => files.map(file => ({ name: file.name, kind: file.kind, ...(file.kind === 'image' ? { preview: `data:${file.mimeType};base64,${file.data}` } : {}) }));
export const sentFiles = (files: PreparedFile[]) => files.map(file => ({ name: file.name, mimeType: file.mimeType, data: file.data }));
export const sizeText = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

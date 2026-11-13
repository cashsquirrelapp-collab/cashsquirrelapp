import { strFromU8, unzipSync } from 'fflate';
import { openDocumentXmlText, slideXmlText, wordXmlText } from './officeText.js';
import { maskPersonalLines } from './privacyMask.js';

// A Word or PowerPoint file sent in the LINE chat (owner, 2026-11-13: "ส่งไฟล์ Word / PowerPoint ใน LINE"), read on the
// server into the same text the app's chat makes on the person's device (frontend/src/features/assistant/fileText.ts):
// the words of the document or of each slide, personal data masked line by line, at most 30,000 characters. Only the
// zip-based formats (.docx, .pptx and their OpenDocument cousins .odt / .odp); the zip is opened with fflate (already in
// the Worker), only the parts that hold words are read, nothing in the file is run (no macros, no links followed).

export const DOCUMENT_TEXT_MAX_CHARS = 30_000;
const UNZIPPED_MAX_BYTES = 40 * 1024 * 1024;

export type DocumentFileKind = 'word' | 'slides' | 'odt' | 'odp' | 'old';
/** What a file name says it is: a document or slides we read, an older binary one we ask to save again, or neither. */
export function documentFileKind(name: string): DocumentFileKind | null {
  if (/\.(docx|docm|dotx)$/i.test(name)) return 'word';
  if (/\.(pptx|pptm|ppsx)$/i.test(name)) return 'slides';
  if (/\.odt$/i.test(name)) return 'odt';
  if (/\.odp$/i.test(name)) return 'odp';
  if (/\.(doc|dot|ppt|pps|pages|key|rtf)$/i.test(name)) return 'old';
  return null;
}

export class DocumentFileError extends Error {
  constructor(public code: 'type' | 'empty' | 'big') { super(code); }
}

export interface DocumentFileText { text: string; label: string; slides?: number; chars: number; truncated: boolean }

function openParts(bytes: Uint8Array, wanted: RegExp): Record<string, Uint8Array> {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new DocumentFileError('type');
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: file => {
      const want = wanted.test(file.name);
      if (want) total += file.originalSize;
      return want && total <= UNZIPPED_MAX_BYTES;
    } });
  } catch { throw new DocumentFileError('type'); }
  if (total > UNZIPPED_MAX_BYTES) throw new DocumentFileError('big');
  return files;
}

/** The file's words as เลขา gets them, framed with its name; throws DocumentFileError ('type', 'empty', 'big'). */
export function documentText(name: string, bytes: Uint8Array): DocumentFileText {
  const kind = documentFileKind(name);
  if (!kind || kind === 'old') throw new DocumentFileError('type');
  let body = '';
  let slides: number | undefined;
  let label = 'Word';
  if (kind === 'word') {
    const files = openParts(bytes, /^word\/document\.xml$/);
    if (!files['word/document.xml']) throw new DocumentFileError('type');
    body = wordXmlText(strFromU8(files['word/document.xml']));
  } else if (kind === 'slides') {
    label = 'PowerPoint';
    const files = openParts(bytes, /^ppt\/slides\/slide\d+\.xml$/);
    const pages = Object.keys(files).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]))
      .map(path => slideXmlText(strFromU8(files[path])));
    if (!pages.length) throw new DocumentFileError('type');
    slides = pages.length;
    body = pages.map((page, index) => `สไลด์ ${index + 1}\n${page}`).join('\n\n');
  } else {
    label = 'OpenDocument';
    const files = openParts(bytes, /^content\.xml$/);
    const xml = files['content.xml'] ? strFromU8(files['content.xml']) : '';
    if (!xml) throw new DocumentFileError('type');
    if (kind === 'odp') {
      const pages = xml.split(/<draw:page\b/).slice(1).map(page => openDocumentXmlText(`<draw:page${page}`));
      slides = pages.length;
      body = pages.map((page, index) => `สไลด์ ${index + 1}\n${page}`).join('\n\n');
    } else body = openDocumentXmlText(xml);
  }
  if (!body.replace(/[\s|,]/g, '').replace(/สไลด์ \d+/g, '')) throw new DocumentFileError('empty');
  // Personal data masked line by line before it goes to เลขา (shared/privacyMask.ts), as the app's chat does.
  body = maskPersonalLines(body);
  const chars = body.length;
  const truncated = chars > DOCUMENT_TEXT_MAX_CHARS;
  if (truncated) body = `${body.slice(0, DOCUMENT_TEXT_MAX_CHARS)}\n…(ตัดเหลือ ${DOCUMENT_TEXT_MAX_CHARS.toLocaleString('en-US')} ตัวอักษรแรก จากทั้งหมด ${chars.toLocaleString('en-US')} ตัวอักษร)`;
  return { text: `ไฟล์ "${name}" (${label} ที่ส่งมาในแชท LINE อ่านออกมาเป็นข้อความ)\n${body}`, label, ...(slides ? { slides } : {}), chars, truncated };
}

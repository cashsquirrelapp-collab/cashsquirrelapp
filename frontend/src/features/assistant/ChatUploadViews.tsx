import React from 'react';
import { FileSpreadsheet, FileText, Presentation, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import type { PreparedFile } from './voice';
import { MAX_CHAT_FILES, sizeText } from './chatUploads';
import { chatImagePreview, chatSentFile, openPreparedFile } from './chatFiles';
import { textFileType } from './fileText';

/** A spreadsheet, a document or slides: its icon. */
function FileIcon({ name, kind }: { name: string; kind: 'image' | 'pdf' | 'text' }) {
  const type = kind === 'text' ? textFileType(name) : null;
  const Icon = type && type !== 'old' ? (type.kind === 'sheet' ? FileSpreadsheet : type.kind === 'slides' ? Presentation : FileText) : FileText;
  return <span className="asx-file-icon" aria-hidden="true"><Icon size={18} /></span>;
}
/** What a file is, under its name: "PDF", "รูป", or "Excel" and the like for a file read as text. */
function kindLabel(name: string, kind: 'image' | 'pdf' | 'text'): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return tr("รูป");
  const type = textFileType(name);
  return type && type !== 'old' ? type.label : tr("ไฟล์");
}

// The files of a message to เลขากระรอก, up to 5 (owner, 2026-10-31): the tray above the box before sending, and what the
// sent message shows. Shared by the full chat and the floating window; one file looks as it did before.

/** The files waiting to be sent, each with a way to take it out, and a tap to check it large before sending (owner,
 *  2026-11-04: "กดเข้าไปตรงรูปภาพที่เป็นย่อแล้วให้มันขยายใหญ่ ... เอาไว้เช็คความมั่นใจ"): a picture opens in the viewer, a
 *  PDF in the browser's own viewer. */
export function UploadTray({ files, onRemove, onView, className = '' }: { files: PreparedFile[]; onRemove: (index: number) => void; onView?: (preview: string) => void; className?: string }) {
  if (!files.length) return null;
  return (
    <div className={`asx-attach-row ${className}`} role="group" aria-label={files.length > 1 ? tr("ไฟล์ที่จะส่ง {0} จาก {1}", files.length, MAX_CHAT_FILES) : tr("ไฟล์ที่จะส่ง")} data-testid="chat-upload-tray">
      {files.map((file, index) => (file.kind === 'image' ? (
        <div key={`${file.name}-${index}`} className="asx-attach-tile">
          {onView
            ? <button type="button" className="asx-attach-view" onClick={() => onView(`data:${file.mimeType};base64,${file.data}`)} aria-label={tr("ดูรูปก่อนส่ง")} title={tr("ดูรูปก่อนส่ง")}><img src={`data:${file.mimeType};base64,${file.data}`} alt={tr("รูปที่จะส่ง")} /></button>
            : <img src={`data:${file.mimeType};base64,${file.data}`} alt={tr("รูปที่จะส่ง")} />}
          <button type="button" className="asx-attach-remove" onClick={() => onRemove(index)} aria-label={tr("เอารูปออก")} title={tr("เอารูปออก")}><X size={14} /></button>
        </div>
      ) : (
        <div key={`${file.name}-${index}`} className="asx-attach-file">
          {/* A spreadsheet or document opens as the text เลขา will read, so it can be checked before sending. */}
          <button type="button" className="asx-attach-open" onClick={() => openPreparedFile(file)} aria-label={tr("เปิดดู {0}", file.name)}
            title={file.kind === 'text' ? tr("ดูข้อความที่เลขาจะอ่าน") : tr("เปิดดูไฟล์")}>
            <FileIcon name={file.name} kind={file.kind} />
            <span className="asx-file-text"><b>{file.name}</b><small>{file.kind === 'text' ? file.summary ?? kindLabel(file.name, file.kind) : `PDF · ${sizeText(file.bytes)}`}</small></span>
          </button>
          <button type="button" className="asx-attach-remove" onClick={() => onRemove(index)} aria-label={tr("เอาไฟล์ออก")} title={tr("เอาไฟล์ออก")}><X size={14} /></button>
        </div>
      )))}
      {files.length > 1 && <span className="asx-attach-count" aria-hidden="true">{files.length}/{MAX_CHAT_FILES}</span>}
    </div>
  );
}

type Shown = { name: string; kind: 'image' | 'pdf' | 'text'; preview?: string; summary?: string };
/** A PDF, spreadsheet or document this tab sent, to open again (a picture opens in the viewer instead). */
const sentPdf = (file: Shown) => { if (file.kind === 'image') return null; const kept = chatSentFile(file.name); return kept && kept.kind === file.kind ? kept : null; };

/** A sent message's files: one as before (a large picture or a file row), several as a small grid. */
export function SentFiles({ files: given, onView }: { files: Shown[]; onView?: (preview: string) => void }) {
  if (!given.length) return null;
  // A picture whose message came back from history without it: this tab may still hold the one it sent.
  const files = given.map(file => (file.preview || file.kind !== 'image' ? file : { ...file, preview: chatImagePreview(file.name) }));
  const one = (file: Shown, key: React.Key) => (file.preview ? (onView
    ? <button key={key} type="button" className="asx-sent-image" onClick={() => onView(file.preview!)} aria-label={tr("ดูรูปที่แนบ")}><img src={file.preview} alt={tr("รูปที่แนบ")} /></button>
    : <span key={key} className="asx-sent-image is-still"><img src={file.preview} alt={tr("รูปที่แนบ")} /></span>)
    : sentPdf(file)
      // A PDF this tab sent opens in the browser's own viewer; after a reload only its name is left.
      ? <button key={key} type="button" className="asx-sent-file is-open" onClick={() => openPreparedFile(sentPdf(file)!)} aria-label={tr("เปิดดู {0}", file.name)}><FileIcon name={file.name} kind={file.kind} />
        <span className="asx-file-text"><b>{file.name}</b><small>{file.kind === 'pdf' ? tr("PDF · แตะเพื่อเปิดดู") : tr("{0} · แตะเพื่อดูข้อความที่ส่ง", file.summary ?? kindLabel(file.name, file.kind))}</small></span></button>
      : <div key={key} className="asx-sent-file"><FileIcon name={file.name} kind={file.kind} />
        <span className="asx-file-text"><b>{file.name}</b><small>{file.summary ?? kindLabel(file.name, file.kind)}</small></span></div>);
  if (files.length === 1) return one(files[0], 0);
  return <div className="asx-sent-grid" data-testid="chat-sent-files">{files.map((file, index) => one(file, `${file.name}-${index}`))}</div>;
}

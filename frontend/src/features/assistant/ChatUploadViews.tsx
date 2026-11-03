import React from 'react';
import { FileText, X } from 'lucide-react';
import { tr } from '../../i18n/tr';
import type { PreparedFile } from './voice';
import { MAX_CHAT_FILES, sizeText } from './chatUploads';
import { chatImagePreview } from './chatFiles';

// The files of a message to เลขากระรอก, up to 5 (owner, 2026-10-31): the tray above the box before sending, and what the
// sent message shows. Shared by the full chat and the floating window; one file looks as it did before.

/** The files waiting to be sent, each with a way to take it out. */
export function UploadTray({ files, onRemove, className = '' }: { files: PreparedFile[]; onRemove: (index: number) => void; className?: string }) {
  if (!files.length) return null;
  return (
    <div className={`asx-attach-row ${className}`} role="group" aria-label={files.length > 1 ? tr("ไฟล์ที่จะส่ง {0} จาก {1}", files.length, MAX_CHAT_FILES) : tr("ไฟล์ที่จะส่ง")} data-testid="chat-upload-tray">
      {files.map((file, index) => (file.kind === 'image' ? (
        <div key={`${file.name}-${index}`} className="asx-attach-tile">
          <img src={`data:${file.mimeType};base64,${file.data}`} alt={tr("รูปที่จะส่ง")} />
          <button type="button" className="asx-attach-remove" onClick={() => onRemove(index)} aria-label={tr("เอารูปออก")} title={tr("เอารูปออก")}><X size={14} /></button>
        </div>
      ) : (
        <div key={`${file.name}-${index}`} className="asx-attach-file">
          <span className="asx-file-icon" aria-hidden="true"><FileText size={18} /></span>
          <span className="asx-file-text"><b>{file.name}</b><small>PDF · {sizeText(file.bytes)}</small></span>
          <button type="button" className="asx-attach-remove" onClick={() => onRemove(index)} aria-label={tr("เอาไฟล์ออก")} title={tr("เอาไฟล์ออก")}><X size={14} /></button>
        </div>
      )))}
      {files.length > 1 && <span className="asx-attach-count" aria-hidden="true">{files.length}/{MAX_CHAT_FILES}</span>}
    </div>
  );
}

type Shown = { name: string; kind: 'image' | 'pdf'; preview?: string };

/** A sent message's files: one as before (a large picture or a file row), several as a small grid. */
export function SentFiles({ files: given, onView }: { files: Shown[]; onView?: (preview: string) => void }) {
  if (!given.length) return null;
  // A picture whose message came back from history without it: this tab may still hold the one it sent.
  const files = given.map(file => (file.preview || file.kind !== 'image' ? file : { ...file, preview: chatImagePreview(file.name) }));
  const one = (file: Shown, key: React.Key) => (file.preview ? (onView
    ? <button key={key} type="button" className="asx-sent-image" onClick={() => onView(file.preview!)} aria-label={tr("ดูรูปที่แนบ")}><img src={file.preview} alt={tr("รูปที่แนบ")} /></button>
    : <span key={key} className="asx-sent-image is-still"><img src={file.preview} alt={tr("รูปที่แนบ")} /></span>)
    : <div key={key} className="asx-sent-file"><span className="asx-file-icon" aria-hidden="true"><FileText size={18} /></span>
      <span className="asx-file-text"><b>{file.name}</b><small>{file.kind === 'pdf' ? 'PDF' : tr("รูป")}</small></span></div>);
  if (files.length === 1) return one(files[0], 0);
  return <div className="asx-sent-grid" data-testid="chat-sent-files">{files.map((file, index) => one(file, `${file.name}-${index}`))}</div>;
}

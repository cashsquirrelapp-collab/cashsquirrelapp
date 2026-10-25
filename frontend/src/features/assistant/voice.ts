import React from 'react';

// Reading aloud uses the device's own voices. Dictation now lives in useDictation.ts:
// record locally, then transcribe once after stopping, with the server's normal token accounting.
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Plain words for reading aloud: no Markdown marks, links read as their text. */
export const speakable = (markdown: string) => markdown
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>|~]+/g, ' ')
  .replace(/^\s*[-•]\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Read one answer aloud (or stop if it is the one being read). Returns false when the device cannot speak. */
export function useReadAloud(lang: string) {
  const [speakingId, setSpeakingId] = React.useState<string | null>(null);
  React.useEffect(() => () => { if (canSpeak()) window.speechSynthesis.cancel(); }, []);
  const stop = React.useCallback(() => { if (canSpeak()) window.speechSynthesis.cancel(); setSpeakingId(null); }, []);
  const toggle = React.useCallback((id: string, text: string) => {
    if (!canSpeak()) return false;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speakingId === id) { setSpeakingId(null); return true; }
    const utterance = new SpeechSynthesisUtterance(speakable(text));
    utterance.lang = lang;
    const voice = synth.getVoices().find(item => item.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeakingId(current => (current === id ? null : current));
    utterance.onerror = () => setSpeakingId(current => (current === id ? null : current));
    setSpeakingId(id);
    synth.speak(utterance);
    return true;
  }, [lang, speakingId]);
  return { supported: canSpeak(), speakingId, toggle, stop };
}

export type PreparedFile = { name: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; data: string; kind: 'image' | 'pdf'; bytes: number };
export const FILE_MAX_BYTES = 4 * 1024 * 1024;

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/**
 * Ready a picked file for เลขา: pictures are redrawn at most 1600px wide as JPEG (smaller to send, and the
 * photo's hidden location data is dropped); a PDF goes as it is. Throws 'type' or 'size' for the screen to explain.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
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

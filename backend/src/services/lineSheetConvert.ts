import type { LineMessage } from './line.js';
import { LINE_CARD_COLORS as C, lineAppLink, lineCard, lineValueRow } from './lineCards.js';
import { buildLineConnectSheet, sheetsBadge, sheetsOpenFor } from './lineSheetCards.js';
import { findUserByLineId } from './lineAssistant.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { accessToken, createGoogleFile, decryptToken, DOC_MIME, GoogleError, SHEET_MIME, SLIDES_MIME } from './googleSheets.js';
import { loadGoogle, removeGoogle } from '../repositories/google.js';
import { rateLimit } from '../security/rateLimit.js';
import { decodeSheetText } from '../../../shared/sheetFileText.js';

// A file sent in the LINE chat, opened in Google's own editor in the person's Drive (owner, 2026-11-13: "ส่ง Excel ใน
// LINE แล้วแปลงเป็น Google Sheet ให้เลย", then Word and PowerPoint too): an Excel / CSV file as a Google Sheet, a Word file
// as a Google Doc, a PowerPoint file as Google Slides. Under เลขา's answer to the file, a tap "เปิดใน Google …" (only
// where the Sheets test feature, which holds the Google connection, is open to the account: customers never see
// unreleased features). The tap brings the file back from LINE by its message (LINE keeps sent files for a while) and
// uploads it to Drive, where Google converts it (googleSheets.ts createGoogleFile). The account's connected sheet and its
// column map are left as they are. Without Google connected yet, the connect card comes first.

export type GoogleKind = 'sheet' | 'doc' | 'slides';
const KINDS: Record<GoogleKind, { letter: string; app: string; type: string }> = {
  sheet: { letter: 's', app: 'Google Sheets', type: SHEET_MIME },
  doc: { letter: 'd', app: 'Google Docs', type: DOC_MIME },
  slides: { letter: 'p', app: 'Google Slides', type: SLIDES_MIME },
};
const NAME_CHARS = 40;
export interface SheetConvert { messageId: string; name: string; kind: GoogleKind }

/** What a file name opens as in Google, or null for a file Google is not asked to open. */
export function googleKindOf(name: string): GoogleKind | null {
  if (/\.(xlsx|xlsm|xltx|xltm|csv|tsv)$/i.test(name)) return 'sheet';
  if (/\.(docx|docm|dotx|odt)$/i.test(name)) return 'doc';
  if (/\.(pptx|pptm|ppsx|odp)$/i.test(name)) return 'slides';
  return null;
}

/** The tap's data: what it opens as, the LINE message of the file and its name (cut to 40 characters, base64url),
 *  within LINE's 300 characters. */
export function sheetConvertData(messageId: string, name: string, kind: GoogleKind = googleKindOf(name) ?? 'sheet'): string {
  return `google:open:${KINDS[kind].letter}:${messageId}:${Buffer.from([...name].slice(0, NAME_CHARS).join(''), 'utf8').toString('base64url')}`;
}

export function decodeSheetConvert(data: string): SheetConvert | null {
  // sheet:convert:<id>:<name> is the first form (spreadsheets only), still on taps sent before Word and PowerPoint.
  const first = /^sheet:convert:(\d{1,40}):([A-Za-z0-9_-]{0,240})$/.exec(data);
  const match = first ? [first[0], 's', first[1], first[2]] : /^google:open:([sdp]):(\d{1,40}):([A-Za-z0-9_-]{0,240})$/.exec(data);
  if (!match) return null;
  const kind = (Object.keys(KINDS) as GoogleKind[]).find(key => KINDS[key].letter === match[1])!;
  const name = Buffer.from(match[3], 'base64url').toString('utf8').replace(/[\u0000-\u001f\u007f�]/g, '').trim();
  return { messageId: match[2], name: name || 'ไฟล์จาก LINE', kind };
}

/** The quick reply under เลขา's answer to the file (LINE allows a 20-character label). */
export function sheetConvertTap(messageId: string, name: string, kind: GoogleKind = googleKindOf(name) ?? 'sheet') {
  const app = KINDS[kind].app;
  return { type: 'action', action: { type: 'postback', label: `เปิดใน ${app}`, data: sheetConvertData(messageId, name, kind), displayText: `เปิดไฟล์นี้ใน ${app}` } };
}

/** Google Sheets' own icon for a sheet; the Google Drive icon (as Google publishes it) for a doc or slides. */
function googleBadge(kind: GoogleKind) {
  if (kind === 'sheet') return sheetsBadge();
  const logo = lineAppLink('/brand/partners/google-drive.png')?.uri;
  return { type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center', cornerRadius: '12px', backgroundColor: C.subtle, paddingAll: '10px',
    contents: [
      ...(logo ? [{ type: 'image', url: logo, size: '28px', aspectRatio: '1:1', aspectMode: 'fit', flex: 0 }] : []),
      { type: 'text', text: KINDS[kind].app, size: 'sm', weight: 'bold', color: C.text, flex: 1, wrap: false },
    ] };
}

export function buildSheetConverted(file: { name: string; url: string }, kind: GoogleKind = 'sheet'): LineMessage {
  const app = KINDS[kind].app;
  return lineCard({
    title: `เปิดใน ${app} แล้ว`, subtitle: file.name, character: 'document', compact: true,
    altText: `ไฟล์ ${file.name} อยู่ใน ${app} ใน Google Drive ของคุณแล้ว`,
    body: [googleBadge(kind), lineValueRow('ไฟล์', file.name, { bold: false })],
    note: kind === 'sheet'
      ? 'ไฟล์อยู่ใน Google Drive ของคุณ เปิดแก้ไขได้เลย ถ้าอยากให้เลขาลงรายการในชีตนี้ พิมพ์ “เชื่อมชีต” แล้วเลือกไฟล์นี้'
      : 'ไฟล์อยู่ใน Google Drive ของคุณ เปิดแก้ไขหรือแชร์ต่อได้เลย',
    footer: { label: kind === 'sheet' ? 'เปิดชีต' : 'เปิดไฟล์', uri: file.url },
  });
}

export interface SheetConvertDeps {
  findUser?: typeof findUserByLineId;
  writeAccess?: typeof checkLinkedAccountWriteAccess;
  sheetsOpen?: typeof sheetsOpenFor;
  loadGoogle?: typeof loadGoogle;
  removeGoogle?: typeof removeGoogle;
  decrypt?: typeof decryptToken;
  token?: typeof accessToken;
  create?: typeof createGoogleFile;
  read?: (id: string, token: string) => Promise<Buffer>;
  rateLimit?: typeof rateLimit;
}

const connectFirst = (app: string): LineMessage[] => [
  { type: 'text', text: `เปิดใน ${app} ได้หลังเชื่อมบัญชี Google ครั้งแรกครับ กด “เชื่อมชีต” ด้านล่าง ล็อกอิน Google แล้วกลับมากดเปิดใน ${app} อีกครั้ง` },
  buildLineConnectSheet(process.env.LIFF_ID),
];

/** What the uploaded bytes are, for Google to convert them. */
function mediaTypeOf(name: string, kind: GoogleKind, zipped: boolean): string {
  if (kind === 'sheet') return zipped ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
  if (kind === 'doc') return /\.odt$/i.test(name) ? 'application/vnd.oasis.opendocument.text' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return /\.odp$/i.test(name) ? 'application/vnd.oasis.opendocument.presentation' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}

export async function convertLineSheet(lineUserId: string, convert: SheetConvert, lineToken: string, deps: SheetConvertDeps = {}): Promise<LineMessage[]> {
  const kind = convert.kind ?? 'sheet';
  const app = KINDS[kind].app;
  const user = await (deps.findUser ?? findUserByLineId)(lineUserId);
  if (!user) return [{ type: 'text', text: `เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน จึงจะเปิดไฟล์ใน ${app} ได้ครับ` }];
  const access = await (deps.writeAccess ?? checkLinkedAccountWriteAccess)(user.user_id);
  if (!access.allowed) return [{ type: 'text', text: access.error }];
  if (!await (deps.sheetsOpen ?? sheetsOpenFor)(user.user_id)) return [{ type: 'text', text: `ตอนนี้ยังเปิดไฟล์ใน ${app} จากแชทไม่ได้ครับ` }];
  const record = await (deps.loadGoogle ?? loadGoogle)(user.user_id);
  const refresh = record ? (deps.decrypt ?? decryptToken)(record.enc) : null;
  if (!refresh) return connectFirst(app);
  let bytes: Buffer;
  // lineVaultChat.ts reads LINE's file (loaded here, as it imports this file for the tap).
  try { bytes = await (deps.read ?? (await import('./lineVaultChat.js')).readLineFile)(convert.messageId, lineToken); }
  catch { return [{ type: 'text', text: `ไฟล์นี้หมดอายุในแชทแล้วครับ กรุณาส่งไฟล์อีกครั้ง แล้วกดเปิดใน ${app}` }]; }
  const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (kind !== 'sheet' && !zipped) return [{ type: 'text', text: `เปิดไฟล์นี้ใน ${app} ไม่ได้ครับ ไฟล์อาจเสียหายหรือมีรหัสผ่าน` }];
  // A CSV saved by an older Thai program is turned into UTF-8 first, so Google reads its Thai.
  const upload = kind === 'sheet' && !zipped ? Buffer.from(decodeSheetText(new Uint8Array(bytes)), 'utf8') : bytes;
  const name = convert.name.replace(/\.(xlsx|xlsm|xltx|xltm|csv|tsv|docx|docm|dotx|odt|pptx|pptm|ppsx|odp)$/i, '').slice(0, 150) || 'ไฟล์จาก LINE';
  try {
    await (deps.rateLimit ?? rateLimit)('google-create', user.user_id, 6, 600);
    const { token } = await (deps.token ?? accessToken)(refresh);
    const file = await (deps.create ?? createGoogleFile)(token, name, new Uint8Array(upload), mediaTypeOf(convert.name, kind, zipped), KINDS[kind].type);
    return [buildSheetConverted({ name: file.name, url: file.url || `https://drive.google.com/file/d/${file.id}/view` }, kind)];
  } catch (error) {
    if (error instanceof GoogleError && (error.code === 'reconnect' || error.code === 'scope')) {
      if (error.code === 'reconnect') await (deps.removeGoogle ?? removeGoogle)(user.user_id).catch(() => undefined);
      return connectFirst(app);
    }
    const failure = error as { status?: number; message?: string } | null;
    console.error('line-google-open: not made', { kind, type: error instanceof GoogleError ? error.code : failure?.status ?? 'unknown' });
    // A limit is said as it is; anything else plainly.
    return [{ type: 'text', text: failure?.status === 429 && failure.message ? failure.message : `Google ยังสร้างไฟล์ไม่สำเร็จครับ กรุณาลองกดอีกครั้ง` }];
  }
}

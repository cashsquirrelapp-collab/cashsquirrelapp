import type { LineMessage } from './line.js';
import { lineCard, lineValueRow } from './lineCards.js';
import { buildLineConnectSheet, sheetsBadge, sheetsOpenFor } from './lineSheetCards.js';
import { findUserByLineId } from './lineAssistant.js';
import { checkLinkedAccountWriteAccess } from './linkedAccountAccess.js';
import { accessToken, createSpreadsheet, decryptToken, GoogleError } from './googleSheets.js';
import { loadGoogle, removeGoogle } from '../repositories/google.js';
import { rateLimit } from '../security/rateLimit.js';
import { decodeSheetText } from '../../../shared/sheetFileText.js';

// An Excel or CSV file sent in the LINE chat, opened as a Google Sheet in the person's own Drive (owner, 2026-11-13:
// "ส่ง Excel ใน LINE แล้วแปลงเป็น Google Sheet ให้เลย"). Under เลขา's answer to the file, a tap "เปิดใน Google Sheets"
// (only where the Sheets test feature is open to the account: customers never see unreleased features). The tap brings
// the file back from LINE by its message (LINE keeps sent files for a while) and uploads it to Drive, where Google turns
// it into a Google Sheet, the same way the templates are made (googleSheets.ts createSpreadsheet). The account's
// connected sheet and its column map are left as they are. Without Google connected yet, the connect card comes first.

const PREFIX = 'sheet:convert:';
const NAME_CHARS = 40;
export interface SheetConvert { messageId: string; name: string }

/** The tap's data: the LINE message of the file, and its name (cut to 40 characters, base64url, within LINE's 300). */
export function sheetConvertData(messageId: string, name: string): string {
  return `${PREFIX}${messageId}:${Buffer.from([...name].slice(0, NAME_CHARS).join(''), 'utf8').toString('base64url')}`;
}

export function decodeSheetConvert(data: string): SheetConvert | null {
  const match = /^sheet:convert:(\d{1,40}):([A-Za-z0-9_-]{0,240})$/.exec(data);
  if (!match) return null;
  const name = Buffer.from(match[2], 'base64url').toString('utf8').replace(/[\u0000-\u001f\u007f�]/g, '').trim();
  return { messageId: match[1], name: name || 'ไฟล์จาก LINE' };
}

/** The quick reply under เลขา's answer to a spreadsheet (LINE allows a 20-character label). */
export function sheetConvertTap(messageId: string, name: string) {
  return { type: 'action', action: { type: 'postback', label: 'เปิดใน Google Sheets', data: sheetConvertData(messageId, name), displayText: 'เปิดไฟล์นี้ใน Google Sheets' } };
}

export function buildSheetConverted(file: { name: string; url: string }): LineMessage {
  return lineCard({
    title: 'เปิดใน Google Sheets แล้ว', subtitle: file.name, character: 'document', compact: true,
    altText: `ไฟล์ ${file.name} เป็น Google Sheet ใน Google Drive ของคุณแล้ว`,
    body: [sheetsBadge(), lineValueRow('ไฟล์', file.name, { bold: false })],
    note: 'ไฟล์อยู่ใน Google Drive ของคุณ เปิดแก้ไขได้เลย ถ้าอยากให้เลขาลงรายการในชีตนี้ พิมพ์ “เชื่อมชีต” แล้วเลือกไฟล์นี้',
    footer: { label: 'เปิดชีต', uri: file.url },
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
  create?: typeof createSpreadsheet;
  read?: (id: string, token: string) => Promise<Buffer>;
  rateLimit?: typeof rateLimit;
}

const connectFirst = (): LineMessage[] => [
  { type: 'text', text: 'เปิดใน Google Sheets ได้หลังเชื่อมบัญชี Google ครั้งแรกครับ กด “เชื่อมชีต” ด้านล่าง ล็อกอิน Google แล้วกลับมากดเปิดใน Google Sheets อีกครั้ง' },
  buildLineConnectSheet(process.env.LIFF_ID),
];

export async function convertLineSheet(lineUserId: string, convert: SheetConvert, lineToken: string, deps: SheetConvertDeps = {}): Promise<LineMessage[]> {
  const user = await (deps.findUser ?? findUserByLineId)(lineUserId);
  if (!user) return [{ type: 'text', text: 'เชื่อมบัญชีกระรอกตุนเงินกับ LINE ก่อน จึงจะเปิดไฟล์ใน Google Sheets ได้ครับ' }];
  const access = await (deps.writeAccess ?? checkLinkedAccountWriteAccess)(user.user_id);
  if (!access.allowed) return [{ type: 'text', text: access.error }];
  if (!await (deps.sheetsOpen ?? sheetsOpenFor)(user.user_id)) return [{ type: 'text', text: 'ตอนนี้ยังเปิดไฟล์ใน Google Sheets จากแชทไม่ได้ครับ' }];
  const record = await (deps.loadGoogle ?? loadGoogle)(user.user_id);
  const refresh = record ? (deps.decrypt ?? decryptToken)(record.enc) : null;
  if (!refresh) return connectFirst();
  let bytes: Buffer;
  // lineVaultChat.ts reads LINE's file (loaded here, as it imports this file for the tap).
  try { bytes = await (deps.read ?? (await import('./lineVaultChat.js')).readLineFile)(convert.messageId, lineToken); }
  catch { return [{ type: 'text', text: 'ไฟล์นี้หมดอายุในแชทแล้วครับ กรุณาส่งไฟล์อีกครั้ง แล้วกดเปิดใน Google Sheets' }]; }
  const csv = /\.(csv|tsv)$/i.test(convert.name) || !(bytes[0] === 0x50 && bytes[1] === 0x4b);
  // A CSV saved by an older Thai program is turned into UTF-8 first, so Google reads its Thai.
  const upload = csv ? Buffer.from(decodeSheetText(new Uint8Array(bytes)), 'utf8') : bytes;
  const name = convert.name.replace(/\.(xlsx|xlsm|xltx|xltm|csv|tsv)$/i, '').slice(0, 150) || 'ไฟล์จาก LINE';
  try {
    await (deps.rateLimit ?? rateLimit)('google-create', user.user_id, 6, 600);
    const { token } = await (deps.token ?? accessToken)(refresh);
    const file = await (deps.create ?? createSpreadsheet)(token, name, new Uint8Array(upload), csv ? 'text/csv' : undefined);
    return [buildSheetConverted({ name: file.name, url: file.url || `https://docs.google.com/spreadsheets/d/${file.id}/edit` })];
  } catch (error) {
    if (error instanceof GoogleError && (error.code === 'reconnect' || error.code === 'scope')) {
      if (error.code === 'reconnect') await (deps.removeGoogle ?? removeGoogle)(user.user_id).catch(() => undefined);
      return connectFirst();
    }
    const failure = error as { status?: number; message?: string } | null;
    console.error('line-sheet-convert: not made', { type: error instanceof GoogleError ? error.code : failure?.status ?? 'unknown' });
    // A limit is said as it is; anything else plainly.
    return [{ type: 'text', text: failure?.status === 429 && failure.message ? failure.message : 'Google ยังสร้างชีตไม่สำเร็จครับ กรุณาลองกดอีกครั้ง' }];
  }
}

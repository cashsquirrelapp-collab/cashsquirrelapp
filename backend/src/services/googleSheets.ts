import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appOrigin, required } from '../config/env.js';
import { LIVE_READ, serialToDate, type GoogleFile, type LiveCell, type LiveTab } from '../../../shared/googleSheets.js';
import { MONTH_LAYOUT } from '../../../shared/monthTabs.js';
import { MONTH_TAB_NAMES } from '../../../shared/paymentColumn.js';

// ฟีเจอร์ทดลอง, phase 2: the person's own Google account (shared/googleSheets.ts). Google's sign-in code flow with the
// drive.file permission only: the app reaches the files the person picks in Google's own file picker, or the files it
// makes for them, nothing else in their Drive. The refresh token is kept encrypted (AES-256-GCM) with GOOGLE_TOKEN_KEY,
// a server secret; access tokens live for an hour and are never stored. Secrets: GOOGLE_CLIENT_SECRET,
// GOOGLE_TOKEN_KEY (32 random bytes, base64) and GOOGLE_PICKER_API_KEY (a browser key Google limits to the Picker and
// to this site's addresses). The client ID and the Picker's app ID are public and sit in the wrangler vars.

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SCOPES = ['openid', 'email', DRIVE_FILE_SCOPE];
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
/** Google's own document and slides types: an uploaded Word or PowerPoint file is turned into one of these. */
export const DOC_MIME = 'application/vnd.google-apps.document';
export const SLIDES_MIME = 'application/vnd.google-apps.presentation';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const TIMEOUT_MS = 20_000;

/** reconnect: Google no longer accepts the kept permission (taken back in the Google account, or expired).
 *  scope: the person unticked the Drive permission on Google's screen. notFound / denied: the file is gone, or was not
 *  opened with the app. failed: Google did not answer properly. */
export type GoogleErrorCode = 'reconnect' | 'scope' | 'notFound' | 'denied' | 'notSheet' | 'failed';
export class GoogleError extends Error {
  constructor(public code: GoogleErrorCode, message: string = code) { super(message); this.name = 'GoogleError'; }
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_TOKEN_KEY?.trim());
}

function tokenKey(): Buffer {
  const key = Buffer.from(required('GOOGLE_TOKEN_KEY'), 'base64');
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_KEY must be 32 bytes in base64');
  return key;
}
/** A separate key per use, made from the one secret. */
const keyFor = (purpose: string) => createHmac('sha256', tokenKey()).update(`krarok-google:${purpose}`).digest();

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor('refresh-token'), iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function decryptToken(value: string): string | null {
  try {
    const buffer = Buffer.from(value, 'base64url');
    if (buffer.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFor('refresh-token'), buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return null; }
}

/** The address Google sends the person back to: always the main address, as registered with Google. */
export const redirectUri = () => `${appOrigin()}/api/google/callback`;

const STATE_MS = 10 * 60_000;
/** Signed, for this account, ten minutes: Google's answer is taken only for the account that asked. */
/** Where Google's sign-in comes back to: Settings, or the page opened from LINE (/connect-sheets; connect_new when it
 *  was opened to make a new sheet, สร้างชีตใหม่ให้). */
export type GoogleBack = 'connect' | 'connect_new';
export function makeState(userId: string, now = Date.now(), back?: GoogleBack): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: now + STATE_MS, n: randomBytes(9).toString('base64url'), ...(back ? { b: back } : {}) })).toString('base64url');
  return `${body}.${createHmac('sha256', keyFor('oauth-state')).update(body).digest('base64url')}`;
}
/** The account a state was made for, or null when it is forged, changed or old. */
export function readState(state: string, now = Date.now()): string | null {
  const [body, signature, extra] = state.split('.');
  if (!body || !signature || extra !== undefined || state.length > 600) return null;
  const expected = createHmac('sha256', keyFor('oauth-state')).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown };
    return typeof value.u === 'string' && typeof value.e === 'number' && value.e > now ? value.u : null;
  } catch { return null; }
}

/** The page a checked state asks to come back to (call after readState accepted it). */
export function stateBack(state: string): GoogleBack | null {
  try {
    const value = JSON.parse(Buffer.from(state.split('.')[0] ?? '', 'base64url').toString('utf8')) as { b?: unknown };
    return value.b === 'connect' || value.b === 'connect_new' ? value.b : null;
  } catch { return null; }
}

export function authUrl(userId: string, back?: GoogleBack): string {
  const params = new URLSearchParams({
    client_id: required('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: makeState(userId, Date.now(), back),
  });
  return `${AUTH_URL}?${params}`;
}

async function call(url: string, init: RequestInit = {}): Promise<Response> {
  try { return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch { throw new GoogleError('failed', 'Google did not answer'); }
}
async function json<T>(response: Response): Promise<T> {
  try { return await response.json() as T; } catch { throw new GoogleError('failed', 'Unreadable answer from Google'); }
}
/** Google's error, by its status, without its text (which can name the file). */
function failure(response: Response): GoogleError {
  if (response.status === 401) return new GoogleError('reconnect', 'Google token refused');
  if (response.status === 404) return new GoogleError('notFound', 'File not found');
  if (response.status === 403) return new GoogleError('denied', 'File not allowed');
  return new GoogleError('failed', `Google answered ${response.status}`);
}

/** The e-mail in Google's id_token. It came straight from Google over TLS, so its signature is not checked again. */
function emailOf(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] || '', 'base64url').toString('utf8')) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email.slice(0, 320) : '';
  } catch { return ''; }
}

export interface Exchanged { refreshToken: string; accessToken: string; email: string }
/** Google's code (from the callback) for the tokens. Without the Drive permission nothing is kept. */
export async function exchangeCode(code: string): Promise<Exchanged> {
  const response = await call(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new GoogleError('failed', `Token exchange answered ${response.status}`);
  const body = await json<{ refresh_token?: string; access_token?: string; scope?: string; id_token?: string }>(response);
  const scopes = (body.scope || '').split(/\s+/);
  if (!scopes.includes(DRIVE_FILE_SCOPE)) {
    if (body.access_token) await revokeToken(body.access_token);
    throw new GoogleError('scope', 'Drive permission not given');
  }
  if (!body.refresh_token || !body.access_token) throw new GoogleError('failed', 'Google gave no refresh token');
  return { refreshToken: body.refresh_token, accessToken: body.access_token, email: emailOf(body.id_token) };
}

/** A fresh access token (an hour) from the kept refresh token. */
export async function accessToken(refreshToken: string): Promise<{ token: string; expiresIn: number }> {
  const response = await call(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: required('GOOGLE_CLIENT_ID'), client_secret: required('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token' }),
  });
  if (response.status === 400 || response.status === 401) throw new GoogleError('reconnect', 'Refresh token refused');
  if (!response.ok) throw new GoogleError('failed', `Token refresh answered ${response.status}`);
  const body = await json<{ access_token?: string; expires_in?: number }>(response);
  if (!body.access_token) throw new GoogleError('failed', 'No access token');
  return { token: body.access_token, expiresIn: Math.max(60, Math.min(3600, Number(body.expires_in) || 3600)) };
}

/** Takes the permission back at Google. Best effort: the kept record is removed either way. */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await call(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) });
    return response.ok;
  } catch { return false; }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The picked file, checked: it exists, is a Google Sheet, and the app may open it. */
export async function driveFile(token: string, fileId: string): Promise<GoogleFile> {
  const response = await call(`${DRIVE}/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,trashed&supportsAllDrives=true`, { headers: auth(token) });
  if (!response.ok) throw failure(response);
  const file = await json<{ id?: string; name?: string; mimeType?: string; webViewLink?: string; trashed?: boolean }>(response);
  if (!file.id || file.trashed) throw new GoogleError('notFound', 'File not found');
  if (file.mimeType !== SHEET_MIME) throw new GoogleError('notSheet', 'Not a Google Sheet');
  return { id: file.id, name: (file.name || 'Google Sheet').slice(0, 300), url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit` };
}

interface ApiCell {
  formattedValue?: string;
  effectiveValue?: { numberValue?: number; stringValue?: string; boolValue?: boolean; errorValue?: unknown };
  userEnteredValue?: { formulaValue?: string };
  effectiveFormat?: { numberFormat?: { type?: string } };
}
interface ApiSheet { properties?: { title?: string; hidden?: boolean; sheetType?: string; sheetId?: number }; data?: { rowData?: { values?: ApiCell[] }[] }[] }

export function liveCell(cell: ApiCell | undefined): LiveCell {
  if (!cell) return { raw: null, text: '' };
  const value = cell.effectiveValue || {};
  const raw = typeof value.numberValue === 'number' ? value.numberValue : typeof value.stringValue === 'string' ? value.stringValue : typeof value.boolValue === 'boolean' ? value.boolValue : null;
  const out: LiveCell = { raw, text: (cell.formattedValue ?? (raw === null ? '' : String(raw))).slice(0, 500) };
  const type = cell.effectiveFormat?.numberFormat?.type;
  if (typeof value.numberValue === 'number' && (type === 'DATE' || type === 'DATE_TIME')) {
    const date = serialToDate(value.numberValue);
    if (date) out.date = date;
  }
  if (cell.userEnteredValue?.formulaValue) out.formula = true;
  return out;
}

/** A tab's rows, without the empty ones at the end. */
export function liveRows(sheet: ApiSheet): LiveCell[][] {
  const rows = (sheet.data?.[0]?.rowData || []).map(row => (row.values || []).slice(0, LIVE_READ.columns).map(liveCell));
  for (const row of rows) while (row.length && row[row.length - 1].text === '' && !row[row.length - 1].formula) row.pop();
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** The visible tabs of a Google Sheet: up to LIVE_READ rows and columns each, values as shown plus dates and formulas. */
export async function readSpreadsheet(token: string, fileId: string): Promise<LiveTab[]> {
  const id = encodeURIComponent(fileId);
  const outline = await call(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title,hidden,sheetType,gridProperties.rowCount)`, { headers: auth(token) });
  if (!outline.ok) throw failure(outline);
  const all = ((await json<{ sheets?: (ApiSheet & { properties?: { gridProperties?: { rowCount?: number } } })[] }>(outline)).sheets || [])
    .filter(sheet => sheet.properties?.title && !sheet.properties.hidden && (sheet.properties.sheetType ?? 'GRID') === 'GRID');
  // Our workbooks' month tabs (shared/monthTabs.ts) only show what รายรับ and รายจ่าย hold: never read as records.
  const ours = all.some(sheet => sheet.properties?.title === 'ตั้งค่า');
  const sheets = all.filter(sheet => !(ours && (MONTH_TAB_NAMES as readonly string[]).includes(sheet.properties!.title!))).slice(0, LIVE_READ.tabs);
  if (!sheets.length) return [];
  const lastColumn = 'AN'; // column 40
  const params = new URLSearchParams({ fields: 'sheets(properties.title,data.rowData.values(formattedValue,effectiveValue,userEnteredValue.formulaValue,effectiveFormat.numberFormat.type))' });
  for (const sheet of sheets) params.append('ranges', `${quoteTab(sheet.properties!.title!)}!A1:${lastColumn}${LIVE_READ.rows}`);
  const response = await call(`${SHEETS}/${id}?${params}`, { headers: auth(token) });
  if (!response.ok) throw failure(response);
  const read = (await json<{ sheets?: ApiSheet[] }>(response)).sheets || [];
  return read.map((sheet, index) => ({
    name: sheet.properties?.title || sheets[index]?.properties?.title || `Sheet${index + 1}`,
    rows: liveRows(sheet),
    ...(typeof sheets[index]?.properties?.sheetId === 'number' ? { gid: sheets[index].properties!.sheetId } : {}),
    truncated: Number((sheets[index] as { properties?: { gridProperties?: { rowCount?: number } } })?.properties?.gridProperties?.rowCount) > LIVE_READ.rows
      && (sheet.data?.[0]?.rowData?.length ?? 0) >= LIVE_READ.rows,
  }));
}

/** Uploads an Excel workbook into the person's Drive as a new Google Sheet (Google converts it, formulas and all).
 *  mediaType: what the uploaded bytes are (an Excel workbook unless said; a CSV converts the same way). */
export async function createSpreadsheet(token: string, name: string, xlsx: Uint8Array, mediaType: string = XLSX_MIME): Promise<GoogleFile> {
  return createGoogleFile(token, name, xlsx, mediaType, SHEET_MIME);
}

/**
 * Uploads a file into the person's Drive as one of Google's own types (googleType: a Sheet, a Doc or Slides), which Google
 * converts it into: an Excel / CSV file to a Sheet, a Word file to a Doc, a PowerPoint file to Slides. The drive.file
 * permission covers files the app makes. The returned url opens it in the matching Google editor.
 */
export async function createGoogleFile(token: string, name: string, bytes: Uint8Array, mediaType: string, googleType: string): Promise<GoogleFile> {
  const boundary = `krarok${randomBytes(12).toString('hex')}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: googleType })}\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`, 'utf8')]);
  const response = await call(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw failure(response);
  const file = await json<{ id?: string; name?: string; webViewLink?: string }>(response);
  if (!file.id) throw new GoogleError('failed', 'Google made no file');
  const editor = googleType === DOC_MIME ? 'document' : googleType === SLIDES_MIME ? 'presentation' : 'spreadsheets';
  return { id: file.id, name: (file.name || name).slice(0, 300), url: file.webViewLink || `https://docs.google.com/${editor}/d/${file.id}/edit` };
}

/** The few operations writing one row needs, for one spreadsheet (sheetWrite.ts uses them; Excel in OneDrive will give
 *  the same set). Rows are numbered as the sheet shows them (1 = first row); columns from 0. */
export interface SheetOps {
  /** The last row with anything in these columns (0 when they are empty). */
  lastRow(tab: string, columns: number[]): Promise<number>;
  /** Rows from..to as the sheet shows them, columns A..lastColumn. */
  readRows(tab: string, from: number, to: number, lastColumn: number): Promise<string[][]>;
  /** Which of these columns hold a formula in this row. */
  formulaColumns(tab: string, row: number, columns: number[]): Promise<Set<number>>;
  /** Types the values into one row (as a person would: numbers, dates, text). Returns the cells written. */
  write(tab: string, row: number, cells: { index: number; value: string | number }[]): Promise<string[]>;
  /** Copies the formulas of these columns from one row to another (only formulas, no values). */
  copyFormulas(tab: string, fromRow: number, toRow: number, columns: number[]): Promise<string[]>;
  /** Empties these cells (undo). */
  clear(tab: string, cells: string[]): Promise<void>;
  /** Google's id of the tab (#gid=), for a link that opens it. */
  tabId(tab: string): Promise<number>;
  /** The formulas of these columns in one row, as written ("=D6-E6"); columns without one are left out. */
  formulaTexts(tab: string, row: number, columns: number[]): Promise<Record<number, string>>;
  /** Deletes these whole rows of the tab (a record deleted in the app); the rows below move up. */
  deleteRows(tab: string, rows: number[]): Promise<void>;
  /** Types many cells of many rows in one request (copying older records, an Excel import). Returns the cells written. */
  writeMany(tab: string, cells: { row: number; index: number; value: string | number }[]): Promise<string[]>;
  /** Copies the formulas of these columns from one row down over rows first..last, in one request. */
  copyFormulasDown(tab: string, fromRow: number, firstRow: number, lastRow: number, columns: number[]): Promise<void>;
  /**
   * Makes `column` a drop-down of these choices, each in its own colours, from the row under the header down to `lastRow`;
   * its header takes the look of the header beside it, and the tab grows a column when it has none there (การชำระ). Colours
   * only when `tones` is given.
   */
  choiceColumn?(tab: string, column: number, headerRow: number, lastRow: number, choices: readonly string[], tones?: Record<string, { fill: string; ink: string }>): Promise<void>;
  /** New columns (headerRow is 1-based): each takes the look of another column (header and body) and its header text;
   *  a formula column gets its formula in every row down to lastRow. */
  addColumns?(tab: string, headerRow: number, lastRow: number, columns: { index: number; header: string; formatFrom: number; formula?: (row: number) => string }[]): Promise<void>;
  /** The month tabs (shared/monthTabs.ts) after the tab named `after`, laid out and filled; a tab already there is left as
   *  it is. Returns how many were added. */
  addMonthTabs?(after: string, tabs: { title: string; rows: string[][] }[]): Promise<number>;
}

const columnName = (index: number): string => { let s = '', n = index + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export function googleOps(token: string, fileId: string): SheetOps {
  const id = encodeURIComponent(fileId);
  const headers = { ...auth(token), 'Content-Type': 'application/json' };
  const range = (tab: string, a1: string) => `${quoteTab(tab)}!${a1}`;
  const get = async <T>(url: string): Promise<T> => { const response = await call(url, { headers: auth(token) }); if (!response.ok) throw failure(response); return json<T>(response); };
  const post = async <T>(url: string, body: unknown): Promise<T> => { const response = await call(url, { method: 'POST', headers, body: JSON.stringify(body) }); if (!response.ok) throw failure(response); return json<T>(response); };
  let sheetIds: Map<string, number> | null = null;
  const sheetId = async (tab: string) => {
    sheetIds ??= new Map(((await get<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`)).sheets || [])
      .map(sheet => [sheet.properties?.title ?? '', sheet.properties?.sheetId ?? 0] as [string, number]));
    const found = sheetIds.get(tab);
    if (found === undefined) throw new GoogleError('notFound', 'Tab not found');
    return found;
  };
  return {
    async lastRow(tab, columns) {
      if (!columns.length) return 0;
      const params = new URLSearchParams({ majorDimension: 'COLUMNS', valueRenderOption: 'FORMATTED_VALUE' });
      for (const column of columns) params.append('ranges', range(tab, `${columnName(column)}:${columnName(column)}`));
      const reply = await get<{ valueRanges?: { values?: unknown[][] }[] }>(`${SHEETS}/${id}/values:batchGet?${params}`);
      return Math.max(0, ...(reply.valueRanges || []).map(item => {
        const values = item.values?.[0] || [];
        let last = values.length;
        while (last > 0 && String(values[last - 1] ?? '').trim() === '') last -= 1;
        return last;
      }));
    },
    async readRows(tab, from, to, lastColumn) {
      if (to < from) return [];
      const reply = await get<{ values?: unknown[][] }>(`${SHEETS}/${id}/values/${encodeURIComponent(range(tab, `A${from}:${columnName(lastColumn)}${to}`))}?valueRenderOption=FORMATTED_VALUE`);
      return Array.from({ length: to - from + 1 }, (_, index) => (reply.values?.[index] || []).map(value => String(value ?? '')));
    },
    async formulaColumns(tab, row, columns) {
      if (!columns.length) return new Set();
      const last = Math.max(...columns);
      const reply = await get<{ values?: unknown[][] }>(`${SHEETS}/${id}/values/${encodeURIComponent(range(tab, `A${row}:${columnName(last)}${row}`))}?valueRenderOption=FORMULA`);
      const cells = reply.values?.[0] || [];
      return new Set(columns.filter(column => String(cells[column] ?? '').startsWith('=')));
    },
    async formulaTexts(tab, row, columns) {
      if (!columns.length || row < 1) return {};
      const last = Math.max(...columns);
      const reply = await get<{ values?: unknown[][] }>(`${SHEETS}/${id}/values/${encodeURIComponent(range(tab, `A${row}:${columnName(last)}${row}`))}?valueRenderOption=FORMULA`);
      const cells = reply.values?.[0] || [];
      return Object.fromEntries(columns.filter(column => String(cells[column] ?? '').startsWith('=')).map(column => [column, String(cells[column]).slice(0, 500)]));
    },
    async write(tab, row, cells) {
      if (!cells.length) return [];
      const data = cells.map(cell => ({ range: range(tab, `${columnName(cell.index)}${row}`), values: [[cell.value]] }));
      await post(`${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data });
      return data.map(item => item.range);
    },
    async copyFormulas(tab, fromRow, toRow, columns) {
      if (!columns.length || fromRow < 1) return [];
      const sheet = await sheetId(tab);
      const box = (row: number, column: number) => ({ sheetId: sheet, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: column, endColumnIndex: column + 1 });
      await post(`${SHEETS}/${id}:batchUpdate`, { requests: columns.map(column => ({ copyPaste: { source: box(fromRow, column), destination: box(toRow, column), pasteType: 'PASTE_FORMULA' } })) });
      return columns.map(column => range(tab, `${columnName(column)}${toRow}`));
    },
    async clear(_tab, cells) {
      if (cells.length) await post(`${SHEETS}/${id}/values:batchClear`, { ranges: cells });
    },
    async writeMany(tab, cells) {
      if (!cells.length) return [];
      const data = cells.map(cell => ({ range: range(tab, `${columnName(cell.index)}${cell.row}`), values: [[cell.value]] }));
      await post(`${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data });
      return data.map(item => item.range);
    },
    async copyFormulasDown(tab, fromRow, firstRow, lastRow, columns) {
      if (!columns.length || fromRow < 1 || lastRow < firstRow) return;
      const sheet = await sheetId(tab);
      // A one-cell source pasted over a taller range repeats down it, each row's references moved to its own row.
      await post(`${SHEETS}/${id}:batchUpdate`, { requests: columns.map(column => ({ copyPaste: {
        source: { sheetId: sheet, startRowIndex: fromRow - 1, endRowIndex: fromRow, startColumnIndex: column, endColumnIndex: column + 1 },
        destination: { sheetId: sheet, startRowIndex: firstRow - 1, endRowIndex: lastRow, startColumnIndex: column, endColumnIndex: column + 1 },
        pasteType: 'PASTE_FORMULA' } })) });
    },
    async deleteRows(tab, rows) {
      const unique = [...new Set(rows)].filter(row => Number.isInteger(row) && row >= 1);
      if (!unique.length) return;
      const sheet = await sheetId(tab);
      // Bottom first, so each row number still points at the same row while the others go.
      await post(`${SHEETS}/${id}:batchUpdate`, { requests: unique.sort((a, b) => b - a)
        .map(row => ({ deleteDimension: { range: { sheetId: sheet, dimension: 'ROWS', startIndex: row - 1, endIndex: row } } })) });
    },
    tabId: sheetId,
    async choiceColumn(tab, column, headerRow, lastRow, choices, tones) {
      const reply = await get<{ sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
      const props = (reply.sheets || []).map(item => item.properties).find(item => item?.title === tab);
      if (!props) throw new GoogleError('notFound', 'Tab not found');
      const sheet = props.sheetId ?? 0;
      const rgb = (hex: string) => ({ red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 });
      const box = (top: number, bottom: number, left: number) => ({ sheetId: sheet, startRowIndex: top, endRowIndex: bottom, startColumnIndex: left, endColumnIndex: left + 1 });
      const below = box(headerRow, Math.max(lastRow, headerRow + 1), column);
      const requests: unknown[] = [];
      if ((props.gridProperties?.columnCount ?? 26) <= column) requests.push({ appendDimension: { sheetId: sheet, dimension: 'COLUMNS', length: column + 1 - (props.gridProperties?.columnCount ?? 26) } });
      if (column > 0) {
        requests.push({ copyPaste: { source: box(headerRow - 1, headerRow, column - 1), destination: box(headerRow - 1, headerRow, column), pasteType: 'PASTE_FORMAT' } });
        requests.push({ copyPaste: { source: box(headerRow, Math.max(lastRow, headerRow + 1), column - 1), destination: below, pasteType: 'PASTE_FORMAT' } });
      }
      requests.push({ updateDimensionProperties: { range: { sheetId: sheet, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } });
      requests.push({ setDataValidation: { range: below, rule: { condition: { type: 'ONE_OF_LIST', values: choices.map(value => ({ userEnteredValue: value })) }, showCustomUi: true, strict: false } } });
      // Colours only when asked: การชำระ goes without (owner, 2026-11-24: rounded chips, set once in the sheet; a coloured
      // cell would sit behind them).
      choices.forEach((choice, index) => {
        const tone = tones?.[choice];
        if (tone) requests.push({ addConditionalFormatRule: { index, rule: { ranges: [below], booleanRule: { condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: choice }] }, format: { backgroundColor: rgb(tone.fill), textFormat: { foregroundColor: rgb(tone.ink), bold: true } } } } } });
      });
      await post(`${SHEETS}/${id}:batchUpdate`, { requests });
    },
    async addMonthTabs(after, tabs) {
      const reply = await get<{ sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title,index)`);
      const props = (reply.sheets || []).map(item => item.properties ?? {});
      const titles = new Set(props.map(item => item.title));
      const wanted = tabs.filter(tab => !titles.has(tab.title));
      if (!wanted.length) return 0;
      const base = (props.find(item => item.title === after)?.index ?? props.length - 1) + 1;
      const used = new Set(props.map(item => item.sheetId));
      let nextId = 7_250_000;
      const L = MONTH_LAYOUT;
      const rgb = (hex: string) => ({ red: parseInt(hex.slice(0, 2), 16) / 255, green: parseInt(hex.slice(2, 4), 16) / 255, blue: parseInt(hex.slice(4, 6), 16) / 255 });
      const requests: unknown[] = [];
      wanted.forEach((tab, i) => {
        while (used.has(nextId)) nextId += 1;
        const sheet = nextId; used.add(sheet);
        const box = (top: number, bottom: number, left: number, right: number) => ({ sheetId: sheet, startRowIndex: top, endRowIndex: bottom, startColumnIndex: left, endColumnIndex: right });
        const paint = (range: ReturnType<typeof box>, format: Record<string, unknown>, fields: string) => requests.push({ repeatCell: { range, cell: { userEnteredFormat: format }, fields: `userEnteredFormat(${fields})` } });
        requests.push({ addSheet: { properties: { sheetId: sheet, title: tab.title, index: base + i, tabColor: rgb('D2734B'), gridProperties: { frozenRowCount: L.firstRow, rowCount: 1000, columnCount: L.widths.length } } } });
        L.widths.forEach((pixelSize, column) => requests.push({ updateDimensionProperties: { range: { sheetId: sheet, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 }, properties: { pixelSize }, fields: 'pixelSize' } }));
        paint(box(L.titleRow, L.titleRow + 1, 0, 1), { textFormat: { bold: true, fontSize: 16, foregroundColor: rgb('1C1917') } }, 'textFormat');
        paint(box(L.noteRow, L.noteRow + 1, 0, 1), { textFormat: { fontSize: 10, foregroundColor: rgb('6B6560') } }, 'textFormat');
        paint(box(L.labelRow, L.labelRow + 1, 0, 4), { backgroundColor: rgb('F5F2EF'), textFormat: { fontSize: 10, foregroundColor: rgb('6B6560') }, horizontalAlignment: 'RIGHT' }, 'backgroundColor,textFormat,horizontalAlignment');
        paint(box(L.totalRow, L.totalRow + 1, 0, 4), { backgroundColor: rgb('F5F2EF'), textFormat: { bold: true, fontSize: 13, foregroundColor: rgb('1C1917') }, numberFormat: { type: 'NUMBER', pattern: '#,##0.00' }, horizontalAlignment: 'RIGHT' }, 'backgroundColor,textFormat,numberFormat,horizontalAlignment');
        for (const column of [0, L.expenseFrom]) paint(box(L.sectionRow, L.sectionRow + 1, column, column + 1), { textFormat: { bold: true, fontSize: 12, foregroundColor: rgb('C24A16') } }, 'textFormat');
        for (const [from, count] of [[0, L.incomeColumns], [L.expenseFrom, L.expenseColumns]] as const) {
          paint(box(L.headerRow, L.headerRow + 1, from, from + count), { backgroundColor: rgb('C24A16'), textFormat: { bold: true, foregroundColor: rgb('FFFFFF') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment');
        }
        for (const column of L.money) paint(box(L.firstRow, 1000, column, column + 1), { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } }, 'numberFormat');
        for (const column of L.dates) paint(box(L.firstRow, 1000, column, column + 1), { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } }, 'numberFormat');
        requests.push({ updateDimensionProperties: { range: { sheetId: sheet, dimension: 'ROWS', startIndex: L.headerRow, endIndex: L.headerRow + 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } });
      });
      await post(`${SHEETS}/${id}:batchUpdate`, { requests });
      const data = wanted.map(tab => ({ range: range(tab.title, 'A1'), values: tab.rows }));
      await post(`${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data });
      return wanted.length;
    },
    async addColumns(tab, headerRow, lastRow, columns) {
      if (!columns.length) return;
      const reply = await get<{ sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[] }>(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
      const props = (reply.sheets || []).map(item => item.properties).find(item => item?.title === tab);
      if (!props) throw new GoogleError('notFound', 'Tab not found');
      const sheet = props.sheetId ?? 0;
      const box = (top: number, bottom: number, left: number) => ({ sheetId: sheet, startRowIndex: top, endRowIndex: bottom, startColumnIndex: left, endColumnIndex: left + 1 });
      const bottom = Math.max(lastRow, headerRow + 1);
      const requests: unknown[] = [];
      const need = Math.max(...columns.map(column => column.index)) + 1 - (props.gridProperties?.columnCount ?? 26);
      if (need > 0) requests.push({ appendDimension: { sheetId: sheet, dimension: 'COLUMNS', length: need } });
      for (const column of columns) {
        requests.push({ copyPaste: { source: box(headerRow - 1, bottom, column.formatFrom), destination: box(headerRow - 1, bottom, column.index), pasteType: 'PASTE_FORMAT' } });
        requests.push({ updateDimensionProperties: { range: { sheetId: sheet, dimension: 'COLUMNS', startIndex: column.index, endIndex: column.index + 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } });
      }
      await post(`${SHEETS}/${id}:batchUpdate`, { requests });
      const data = columns.flatMap(column => {
        const name = columnName(column.index);
        const values: string[][] = [[column.header]];
        if (column.formula) for (let row = headerRow + 1; row <= bottom; row += 1) values.push([`=${column.formula(row)}`]);
        return [{ range: range(tab, `${name}${headerRow}:${name}${headerRow + values.length - 1}`), values }];
      });
      await post(`${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data });
    },
  };
}

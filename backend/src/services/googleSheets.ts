import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { appOrigin, required } from '../config/env.js';
import { LIVE_READ, serialToDate, type GoogleFile, type LiveCell, type LiveTab } from '../../../shared/googleSheets.js';

// ฟีเจอร์ทดลอง, phase 2: the person's own Google account (shared/googleSheets.ts). Google's sign-in code flow with the
// drive.file permission only: the app reaches the files the person picks in Google's own file picker, or the files it
// makes for them, nothing else in their Drive. The refresh token is kept encrypted (AES-256-GCM) with GOOGLE_TOKEN_KEY,
// a server secret; access tokens live for an hour and are never stored. Secrets: GOOGLE_CLIENT_SECRET,
// GOOGLE_TOKEN_KEY (32 random bytes, base64) and GOOGLE_PICKER_API_KEY (a browser key Google limits to the Picker and
// to this site's addresses). The client ID and the Picker's app ID are public and sit in the wrangler vars.

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_SCOPES = ['openid', 'email', DRIVE_FILE_SCOPE];
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
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
export function makeState(userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: now + STATE_MS, n: randomBytes(9).toString('base64url') })).toString('base64url');
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

export function authUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: required('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: makeState(userId),
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
interface ApiSheet { properties?: { title?: string; hidden?: boolean; sheetType?: string }; data?: { rowData?: { values?: ApiCell[] }[] }[] }

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
  const outline = await call(`${SHEETS}/${id}?fields=sheets.properties(title,hidden,sheetType,gridProperties.rowCount)`, { headers: auth(token) });
  if (!outline.ok) throw failure(outline);
  const sheets = ((await json<{ sheets?: (ApiSheet & { properties?: { gridProperties?: { rowCount?: number } } })[] }>(outline)).sheets || [])
    .filter(sheet => sheet.properties?.title && !sheet.properties.hidden && (sheet.properties.sheetType ?? 'GRID') === 'GRID')
    .slice(0, LIVE_READ.tabs);
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
    truncated: Number((sheets[index] as { properties?: { gridProperties?: { rowCount?: number } } })?.properties?.gridProperties?.rowCount) > LIVE_READ.rows
      && (sheet.data?.[0]?.rowData?.length ?? 0) >= LIVE_READ.rows,
  }));
}

/** Uploads an Excel workbook into the person's Drive as a new Google Sheet (Google converts it, formulas and all). */
export async function createSpreadsheet(token: string, name: string, xlsx: Uint8Array): Promise<GoogleFile> {
  const boundary = `krarok${randomBytes(12).toString('hex')}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: SHEET_MIME })}\r\n--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(head, 'utf8'), Buffer.from(xlsx), Buffer.from(`\r\n--${boundary}--`, 'utf8')]);
  const response = await call(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!response.ok) throw failure(response);
  const file = await json<{ id?: string; name?: string; webViewLink?: string }>(response);
  if (!file.id) throw new GoogleError('failed', 'Google made no file');
  return { id: file.id, name: (file.name || name).slice(0, 300), url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit` };
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
  };
}

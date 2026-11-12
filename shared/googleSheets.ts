import { z } from 'zod';

// ฟีเจอร์ทดลอง, phase 2 (owner, 2026-11-12: "เราไปหาเขา"): an account connects its own Google account and picks one of its
// own Google Sheets. The app only ever reaches files the person picked or the app made for them (Google's drive.file
// permission), reads them to draw a sheet map (which column is what) and an overview, and writes nothing into them yet
// (writing is phase 3, always after a confirm card). What is kept per account, under `google` in its
// cashflow_private_state row (server-only table, no SQL): the Google e-mail, the refresh token encrypted with the
// server's key, the picked file and the confirmed map.

/** A file the person picked or the app made in their Drive. */
export interface GoogleFile { id: string; name: string; url: string }

/** One column of a tab as the person confirmed it. `target` is one of the importer's fields (sheetImport.ts), or keep or
 *  ignore. `formula`: the column is worked out by the sheet's own formulas, so the app never writes into it. */
export interface SheetMapColumn { index: number; header: string; target: string; formula?: boolean }
export interface SheetMapTab {
  name: string;
  /** Zero-based row of the headers, or null for a tab without one. */
  headerRow: number | null;
  kind: 'jobs' | 'expenses' | 'mixed';
  /** Counted in the overview (a data tab), or left out (a summary, a list of codes, a read-me). */
  use: boolean;
  columns: SheetMapColumn[];
}
export interface SheetMap { fileId: string; at: string; tabs: SheetMapTab[] }

/** What the app gets from GET /api/google. */
export interface GoogleStatus {
  /** The server has its Google keys (false on a server not set up yet: the panel says so instead of a broken button). */
  configured: boolean;
  connected: boolean;
  email?: string;
  file?: GoogleFile | null;
  map?: SheetMap | null;
}

/** One cell as read from the sheet, in the importer's shape (SheetCell) plus whether a formula makes it. */
export interface LiveCell { raw: string | number | boolean | null; text: string; date?: string; formula?: true }
export interface LiveTab { name: string; rows: LiveCell[][]; /** More rows than were read. */ truncated: boolean }

/** Reading limits: enough for a year of one person's records, small enough for one request. */
export const LIVE_READ = { tabs: 12, rows: 400, columns: 40 } as const;

const target = z.string().regex(/^[A-Za-z]{2,24}$/);
export const sheetMapColumnSchema = z.object({
  index: z.number().int().min(0).max(LIVE_READ.columns),
  header: z.string().max(200),
  target,
  formula: z.boolean().optional(),
}).strict();
export const sheetMapTabSchema = z.object({
  name: z.string().min(1).max(120),
  headerRow: z.number().int().min(0).max(LIVE_READ.rows).nullable(),
  kind: z.enum(['jobs', 'expenses', 'mixed']),
  use: z.boolean(),
  columns: z.array(sheetMapColumnSchema).max(LIVE_READ.columns + 1),
}).strict();
export const sheetMapSchema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  at: z.string().max(40),
  tabs: z.array(sheetMapTabSchema).max(LIVE_READ.tabs),
}).strict();
export const googleFileSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  name: z.string().max(300),
  url: z.string().url().max(500),
}).strict();

/** The last row เลขา wrote into the sheet (phase 3): shown on the chat card after ยืนยัน, and undone within 30 minutes.
 *  `cells` are the cells written or given a formula, so undo empties exactly those. */
export interface SheetWrite {
  proposalId: string;
  at: string;
  ok: boolean;
  fileId?: string;
  tab?: string;
  row?: number;
  cells?: string[];
  error?: string;
  undone?: boolean;
}
export const UNDO_MS = 30 * 60_000;
const sheetWriteSchema = z.object({
  proposalId: z.string().max(80),
  at: z.string().max(40),
  ok: z.boolean(),
  fileId: z.string().max(200).optional(),
  tab: z.string().max(120).optional(),
  row: z.number().int().min(1).max(10_000_000).optional(),
  cells: z.array(z.string().max(200)).max(LIVE_READ.columns * 2).optional(),
  error: z.string().max(300).optional(),
  undone: z.boolean().optional(),
});

/** The kept record (server only). */
export interface GoogleRecord { email: string; enc: string; at: string; file?: GoogleFile | null; map?: SheetMap | null; lastWrite?: SheetWrite | null }
const recordSchema = z.object({
  email: z.string().max(320),
  enc: z.string().min(20).max(4000),
  at: z.string().max(40),
  file: googleFileSchema.nullable().optional(),
  map: sheetMapSchema.nullable().optional(),
  lastWrite: sheetWriteSchema.nullable().optional(),
});

/** A stored record; anything unreadable counts as not connected. */
export function readGoogleRecord(value: unknown): GoogleRecord | null {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data as GoogleRecord : null;
}

/** The record as the app sees it: never the token, and the map only while it belongs to the picked file. */
export function googleStatus(record: GoogleRecord | null, configured: boolean): GoogleStatus {
  if (!record) return { configured, connected: false, file: null, map: null };
  const file = record.file ?? null;
  return { configured, connected: true, email: record.email, file, map: file && record.map?.fileId === file.id ? record.map : null };
}

/** Google's spreadsheet serial day (1899-12-30 is day 0) as YYYY-MM-DD. */
export function serialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

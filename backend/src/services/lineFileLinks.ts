import { getSupabaseAdmin } from '../config/supabase.js';
import { patchPrivate } from '../repositories/accounts.js';
import { updateVaultFile } from './vault.js';

// A picture or PDF sent in LINE that เลขากระรอก read (owner, 2026-11-06: "ในไลน์สามารถทำให้อ่านไฟล์ PDF อ่านรูปภาพได้ไหม
// แล้วก็แกะออกมาเพื่อบันทึกรายจ่ายหรือรายรับ ... เหมือนแบบในเลขากระรอกเลยในแอป"). The file is kept in คลังเอกสาร at once; the
// cards เลขา prepared from it remember it, and the first one confirmed gets the file attached to its record. Kept under
// lineFileProposals in cashflow_private_state (a table only server code reads), for a day at most, 20 cards at most.

type Links = Record<string, { fileId: string; at: string }>;
const KEY = 'lineFileProposals';
const DAY_MS = 86_400_000;
const PROPOSAL_ID = /^p_[0-9a-f-]{36}$/;
const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readLinks(userId: string): Promise<Links> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('links:data->lineFileProposals').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const raw = (data as { links?: unknown } | null)?.links;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Links : {};
}

/** Only well-formed links younger than a day. */
function fresh(links: Links, now: number): Links {
  return Object.fromEntries(Object.entries(links).filter(([id, link]) => PROPOSAL_ID.test(id) && link && typeof link.fileId === 'string'
    && FILE_ID.test(link.fileId) && typeof link.at === 'string' && now - Date.parse(link.at) < DAY_MS));
}

/** The cards เลขา prepared from this file remember it. */
export async function rememberFileProposals(userId: string, fileId: string, proposalIds: string[], now = new Date()): Promise<void> {
  const ids = proposalIds.filter(id => PROPOSAL_ID.test(id));
  if (!ids.length || !FILE_ID.test(fileId)) return;
  const links = fresh(await readLinks(userId), now.getTime());
  for (const id of ids) links[id] = { fileId, at: now.toISOString() };
  const kept = Object.fromEntries(Object.entries(links).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, 20));
  await patchPrivate(userId, { [KEY]: kept });
}

/** The file a confirmed card came from, taken off every card of that file so it is attached once. */
export async function takeFileForProposal(userId: string, proposalId: string, now = new Date()): Promise<string | null> {
  if (!PROPOSAL_ID.test(proposalId)) return null;
  const links = fresh(await readLinks(userId), now.getTime());
  const fileId = links[proposalId]?.fileId;
  if (!fileId) return null;
  await patchPrivate(userId, { [KEY]: Object.fromEntries(Object.entries(links).filter(([, link]) => link.fileId !== fileId)) });
  return fileId;
}

const EXPENSE_KINDS = new Set(['add_expense', 'edit_expense']);
const JOB_KINDS = new Set(['add_job', 'edit_job', 'record_payment']);

/** Attaches the file to the record the confirmed card saved (a bill or slip to its expense, anything else to its job).
 *  Returns the record's name, or null when this kind of card has no record to attach to. */
export async function attachFileToRecord(userId: string, fileId: string, done: { kind: string; jobId?: string; recordId?: string }): Promise<string | null> {
  const expense = EXPENSE_KINDS.has(done.kind);
  const id = expense ? done.recordId : JOB_KINDS.has(done.kind) ? done.jobId : undefined;
  if (!id || !FILE_ID.test(fileId)) return null;
  const { data } = await getSupabaseAdmin().from(expense ? 'cashflow_expenses' : 'cashflow_jobs').select('data').eq('user_id', userId).eq('id', id).maybeSingle();
  const record = (data as { data?: { name?: unknown; client?: unknown } } | null)?.data;
  const name = typeof record?.name === 'string' && record.name.trim() ? record.name.trim().slice(0, 200) : null;
  const client = typeof record?.client === 'string' && record.client.trim() ? record.client.trim().slice(0, 200) : null;
  await updateVaultFile({ kind: 'user', id: userId }, { action: 'update', id: fileId, kind: expense ? 'expense' : 'other', jobId: id, jobName: name, client });
  return name ?? 'รายการนี้';
}

// Several pictures sent at once (owner, 2026-11-06: "ส่งหลายรูปพร้อมกันให้รวมเป็นการ์ดเดียวได้ไหม", then "การ์ดเดียว +
// บันทึกทั้งหมด"). LINE marks them as one imageSet; each arrives as its own event, so each picture is noted under its own
// key (two at once never overwrite each other) and the event that finds the set complete reads them together. The cards
// เลขา prepared from them are kept as one group for บันทึกทั้งหมด, ดูทีละใบ and ยกเลิกทั้งหมด. Ten minutes for a set, a day
// for a group.

export type ImagePart = { messageId: string; fileId?: string; fileName?: string; failed?: boolean; at: string };
const PART_PREFIX = 'lineImagePart:';
const GROUP_PREFIX = 'lineCardGroup:';
const PART_TTL_MS = 10 * 60_000;
export const GROUP_ID = /^g[A-Za-z0-9]{6,40}$/;

/** The group id for a LINE imageSet id, or null when it is not one. */
export const groupIdFor = (imageSetId: unknown) => {
  const id = typeof imageSetId === 'string' ? `g${imageSetId.replace(/[^A-Za-z0-9]/g, '').slice(0, 40)}` : '';
  return GROUP_ID.test(id) ? id : null;
};

async function privateData(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await getSupabaseAdmin().from('cashflow_private_state').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const value = (data as { data?: unknown } | null)?.data;
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Notes one picture of a set; returns every picture of the set noted so far (by its index), and drops stale ones. */
export async function noteImagePart(userId: string, groupId: string, index: number, part: ImagePart, now = new Date()): Promise<Map<number, ImagePart>> {
  await patchPrivate(userId, { [`${PART_PREFIX}${groupId}:${index}`]: part });
  const data = await privateData(userId);
  const parts = new Map<number, ImagePart>();
  const stale: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PART_PREFIX)) continue;
    const entry = value as ImagePart | null;
    const fresh = entry && typeof entry.at === 'string' && now.getTime() - Date.parse(entry.at) < PART_TTL_MS;
    if (!fresh) { stale.push(key); continue; }
    const [, set, at] = key.slice(PART_PREFIX.length).match(/^([^:]+):(\d{1,2})$/) ?? [];
    if (set === groupId) parts.set(Number(at), entry);
  }
  if (stale.length) await patchPrivate(userId, {}, stale);
  return parts;
}

/** Forgets the pictures of a set once it has been read. */
export async function dropImageParts(userId: string, groupId: string, indexes: number[]): Promise<void> {
  await patchPrivate(userId, {}, indexes.map(index => `${PART_PREFIX}${groupId}:${index}`));
}

export type CardGroup = { cards: unknown[]; files: number; at: string };

export async function saveCardGroup(userId: string, groupId: string, group: Omit<CardGroup, 'at'>, now = new Date()): Promise<void> {
  if (!GROUP_ID.test(groupId)) return;
  await patchPrivate(userId, { [`${GROUP_PREFIX}${groupId}`]: { ...group, at: now.toISOString() } });
}

/** A group still in time, from the account's notif_settings (the private state comes with it). */
export function cardGroupOf(notifSettings: unknown, groupId: string, now = new Date()): CardGroup | null {
  if (!GROUP_ID.test(groupId)) return null;
  const group = (notifSettings as Record<string, unknown> | undefined)?.[`${GROUP_PREFIX}${groupId}`] as CardGroup | undefined;
  if (!group || !Array.isArray(group.cards) || typeof group.at !== 'string' || now.getTime() - Date.parse(group.at) >= DAY_MS) return null;
  return group;
}

export async function dropCardGroup(userId: string, groupId: string): Promise<void> {
  if (GROUP_ID.test(groupId)) await patchPrivate(userId, {}, [`${GROUP_PREFIX}${groupId}`]);
}

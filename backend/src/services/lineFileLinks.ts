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

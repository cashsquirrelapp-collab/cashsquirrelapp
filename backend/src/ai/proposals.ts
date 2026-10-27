import { randomUUID } from 'node:crypto';
import { validateChanges, type Change } from '../../../shared/validation.js';
import type { ToolContext } from './tools.js';
import type { ToolOutcome } from './types.js';

// Only trusted code chooses a table, operation and record key. Models cannot supply a table or owner.
export const PROPOSAL_TARGETS = {
  add_job: { table: 'cashflow_jobs', op: 'set', insert: true },
  edit_job: { table: 'cashflow_jobs', op: 'set', insert: false },
  record_payment: { table: 'cashflow_jobs', op: 'set', insert: false },
  delete_job: { table: 'cashflow_jobs', op: 'delete', insert: false },
  add_document: { table: 'cashflow_invoices', op: 'set', insert: true },
  edit_document: { table: 'cashflow_invoices', op: 'set', insert: false },
  delete_document: { table: 'cashflow_invoices', op: 'delete', insert: false },
  add_expense: { table: 'cashflow_expenses', op: 'set', insert: true },
  edit_expense: { table: 'cashflow_expenses', op: 'set', insert: false },
  delete_expense: { table: 'cashflow_expenses', op: 'delete', insert: false },
  add_goal: { table: 'cashflow_goals', op: 'set', insert: true },
  edit_goal: { table: 'cashflow_goals', op: 'set', insert: false },
  delete_goal: { table: 'cashflow_goals', op: 'delete', insert: false },
  goal_deposit: { table: 'cashflow_goals', op: 'set', insert: false },
  goal_withdraw: { table: 'cashflow_goals', op: 'set', insert: false },
  edit_settings: { table: 'cashflow_documents', op: 'set', insert: false, fixedId: 'settings', allowCreate: true },
  edit_issuer_profile: { table: 'cashflow_documents', op: 'set', insert: false, fixedId: 'issuer_profile', allowCreate: true },
  edit_notifications: { table: 'cashflow_documents', op: 'set', insert: false, fixedId: 'notif_settings', allowCreate: true },
} as const;
export type ProposalKind = keyof typeof PROPOSAL_TARGETS;
export interface Proposal {
  id: string; userId: string; kind: ProposalKind;
  /** Legacy storage column: the target record key, including non-job proposal kinds. */
  jobId: string;
  record: Record<string, unknown> | null;
  title: string; changes: { label: string; value: string }[]; createdAt: number;
  /** The tool call that prepared it, so the card can be edited and prepared again without a model call (2026-10-24). */
  tool?: string; args?: Record<string, unknown>;
}
export function proposalTarget(kind: ProposalKind) {
  if (!Object.prototype.hasOwnProperty.call(PROPOSAL_TARGETS, kind)) throw new Error('Unknown proposal kind');
  return PROPOSAL_TARGETS[kind];
}
export function proposalVersionKey(kind: ProposalKind, id: string): string {
  const target = proposalTarget(kind);
  return target.table === 'cashflow_jobs' ? id : `${target.table}:${id}`;
}
/** An absent singleton is distinguished from missing version metadata by the authenticated snapshot adapter. */
export function proposalBaseVersion(proposal: Proposal, versions: Record<string, number>, absentRecords: string[] = []): number | null {
  const target = proposalTarget(proposal.kind);
  if (target.insert || isDeleteAll(proposal)) return null;
  const key = proposalVersionKey(proposal.kind, proposal.jobId);
  const version = versions[key];
  if (Number.isInteger(version) && version > 0) return version;
  if ('allowCreate' in target && target.allowCreate && proposal.jobId === target.fixedId && absentRecords.includes(key)) return null;
  throw new Error('Missing proposal version');
}
export function proposalChanges(proposal: Pick<Proposal, 'kind' | 'jobId' | 'record'>, baseVersion: number | null): Change[] {
  const target = proposalTarget(proposal.kind);
  if (isDeleteAll(proposal)) throw new Error('A delete-all proposal needs bulkDeleteChanges');
  if ('fixedId' in target && proposal.jobId !== target.fixedId) throw new Error('Invalid proposal record');
  // An absent edit version must never turn into an insert or overwrite another record.
  if (!target.insert && baseVersion === null && !('allowCreate' in target && target.allowCreate)) throw new Error('Missing proposal version');
  return validateChanges([{ table: target.table, id: proposal.jobId, op: target.op,
    version: target.insert ? null : baseVersion, ...(target.op === 'set' ? { data: proposal.record } : {}) }]);
}
/**
 * Deleting every job at once (owner, 2026-10-28) is stored as a delete_job proposal for ALL_JOBS whose record lists
 * the job ids the card counted (the database's list of proposal kinds stays as it is). Only server code prepares
 * proposals, so the marker cannot come from a model or the browser; one go-ahead applies it (no password: owner,
 * "ไม่จำเป็นต้องใส่รหัสแล้ว แค่อนุญาตในแชท"), and jobs added after the card are never deleted.
 */
export const ALL_JOBS = '__all_jobs__';
export function isDeleteAll(proposal: Pick<Proposal, 'kind' | 'jobId' | 'record'>): boolean {
  return proposal.kind === 'delete_job' && proposal.jobId === ALL_JOBS && proposal.record?.allJobs === true;
}

/** The job ids a delete-all card counted (at most 10,000, the app's own limit for one save). */
export function bulkIds(record: Record<string, unknown> | null): string[] {
  const ids = Array.isArray(record?.ids) ? record!.ids : [];
  // The same id rule as every save (shared/validation.ts): any 1-128 character string.
  if (!ids.length || ids.length > 10000 || !ids.every(id => typeof id === 'string' && id.length >= 1 && id.length <= 128)) throw new Error('Invalid bulk proposal');
  return ids as string[];
}

/**
 * The deletes for a delete-all card, each with the version the account has now (the user asked for every job to go,
 * so a job edited since is still deleted). Jobs already gone are skipped; jobs added after the card are not in it.
 */
export function bulkDeleteChanges(proposal: Pick<Proposal, 'kind' | 'jobId' | 'record'>, versions: Record<string, number>): Change[] {
  const target = proposalTarget(proposal.kind);
  if (!isDeleteAll(proposal)) throw new Error('Not a delete-all proposal');
  const changes = bulkIds(proposal.record).flatMap(id => {
    const version = versions[id];
    return Number.isInteger(version) && version > 0 ? [{ table: target.table, id, op: 'delete' as const, version }] : [];
  });
  return changes.length ? validateChanges(changes) : [];
}

export async function prepareProposal(context: ToolContext, input: {
  kind: ProposalKind; id: string; record: Record<string, unknown> | null;
  title: string; changes: Proposal['changes'];
}): Promise<ToolOutcome> {
  const proposal: Proposal = { id: `p_${randomUUID()}`, userId: context.user.user_id, kind: input.kind,
    jobId: input.id, record: input.record, title: input.title.slice(0, 200), changes: input.changes,
    createdAt: context.now?.getTime() ?? Date.now() };
  try { if (isDeleteAll(proposal)) bulkIds(input.record); else proposalChanges(proposal, proposalTarget(input.kind).insert ? null : 1); }
  catch { return { result: { ok: false, error: 'ข้อมูลไม่ผ่านการตรวจของแอป กรุณาตรวจรายละเอียดที่ระบุ' } }; }
  await context.proposals.save(proposal);
  return { result: { ok: true, proposal_id: proposal.id, saved: false, note: 'Prepared for review. Saved only after the user confirms the card.' },
    card: { kind: 'confirm', id: proposal.id, title: proposal.title, changes: proposal.changes } };
}

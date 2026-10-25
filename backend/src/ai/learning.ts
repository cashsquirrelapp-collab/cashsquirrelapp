import { isRememberable, MEMORY_LIMIT, overLimit, type MemoryRow } from './memory.js';
import type { UserRow } from '../services/lineAssistant.js';

// เลขา learns from the user's corrections (owner-approved plan, package B, 2026-10-25). Only a confirmed card teaches
// anything: a field the user changed on a card เลขา prepared, or an edit card that changes an expense's category or a
// job's client or withholding. Each lesson is a rule for this account only ("ค่าใช้จ่าย 'ร้านสมาน' → หมวด ค่าอุปกรณ์"),
// kept as a memory the user can see and forget, with the correction in the account's correction history. Nothing
// here changes how any other account is answered.

export type CorrectionDomain = 'expense_category' | 'expense_name' | 'job_name' | 'job_client' | 'job_wht' | 'document_client' | 'document_item';
/** One lesson: in this domain, for this subject, the user wants `after` (it was `before`). `field` is the card field. */
export interface LearnPair { domain: CorrectionDomain; subject: string; before: string | null; after: string; field?: string }

const clean = (value: unknown, size = 60) => String(value ?? '').replace(/\s+/g, ' ').replace(/'/g, '’').trim().slice(0, size);

/** What changing one field on a card เลขา prepared teaches, given the card's final arguments. */
export function pairFromCardEdit(tool: string, field: string, before: unknown, after: unknown, args: Record<string, unknown>): LearnPair | null {
  const was = clean(before); const now = clean(after);
  if (!now || was === now) return null;
  const base = { before: was || null, after: now, field };
  if (tool === 'propose_add_expense') {
    if (field === 'category') return clean(args.name) ? { domain: 'expense_category', subject: clean(args.name), ...base } : null;
    if (field === 'name' && was) return { domain: 'expense_name', subject: was, ...base };
  }
  if (tool === 'propose_add_job') {
    if (field === 'client' && was) return { domain: 'job_client', subject: was, ...base };
    if (field === 'name' && was) return { domain: 'job_name', subject: was, ...base };
    if (field === 'wht_rate' && clean(args.client)) return { domain: 'job_wht', subject: clean(args.client), ...base, before: was ? `${was}%` : null, after: `${now}%` };
  }
  if (tool === 'propose_add_document') {
    if (field === 'client_name' && was) return { domain: 'document_client', subject: was, ...base };
    if (/^item_\d_description$/.test(field) && was) return { domain: 'document_item', subject: was, ...base };
  }
  return null;
}

/** What an edit card teaches, from the record as it is now: an expense's category, a job's client or withholding. */
export function pairsFromEdit(tool: string, args: Record<string, unknown>, user: UserRow): LearnPair[] {
  if (tool === 'propose_edit_expense') {
    const before = ((user.expenses ?? []) as { id?: string; name?: string; category?: string }[]).find(row => row.id === args.expense_id);
    if (!before || args.category === undefined) return [];
    const pair = pairFromCardEdit('propose_add_expense', 'category', before.category, args.category, { name: args.name ?? before.name });
    return pair ? [pair] : [];
  }
  if (tool === 'propose_edit_job') {
    const before = ((user.jobs ?? []) as { id?: string; client?: string; whtRate?: number }[]).find(row => row.id === args.job_id);
    if (!before) return [];
    const client = args.client ?? before.client;
    return [
      args.client !== undefined ? pairFromCardEdit('propose_add_job', 'client', before.client, args.client, {}) : null,
      args.wht_rate !== undefined ? pairFromCardEdit('propose_add_job', 'wht_rate', before.whtRate ?? 0, args.wht_rate, { client }) : null,
    ].filter((pair): pair is LearnPair => Boolean(pair));
  }
  return [];
}

/** Later edits of the same field keep what เลขา first wrote as `before`. */
export function mergePairs(earlier: LearnPair[], next: LearnPair[]): LearnPair[] {
  const out = [...earlier];
  for (const pair of next) {
    const at = out.findIndex(item => (pair.field && item.field === pair.field) || (item.domain === pair.domain && item.subject === pair.subject));
    if (at < 0) { out.push(pair); continue; }
    const merged = { ...pair, before: out[at].before, subject: ['expense_category', 'job_wht'].includes(pair.domain) ? pair.subject : out[at].subject };
    out[at] = merged;
  }
  return out.filter(pair => pair.before !== pair.after).slice(0, 12);
}

/** A rule's fixed start: a new lesson about the same subject replaces the rule that starts this way. */
export function ruleKey(pair: Pick<LearnPair, 'domain' | 'subject'>): string {
  switch (pair.domain) {
    case 'expense_category': return `ค่าใช้จ่าย '${pair.subject}'`;
    case 'expense_name': return `ชื่อค่าใช้จ่าย '${pair.subject}'`;
    case 'job_client': case 'document_client': return `ลูกค้า '${pair.subject}'`;
    case 'job_name': return `ชื่องาน '${pair.subject}'`;
    case 'job_wht': return `หัก ณ ที่จ่ายของลูกค้า '${pair.subject}'`;
    case 'document_item': return `รายการเอกสาร '${pair.subject}'`;
  }
}
export function ruleText(pair: LearnPair): string {
  const key = ruleKey(pair);
  switch (pair.domain) {
    case 'expense_category': return `${key} → หมวด ${pair.after}`;
    case 'job_client': case 'document_client': return `${key} คือ '${pair.after}'`;
    case 'job_wht': return `${key} = ${pair.after}`;
    case 'document_item': return `${key} → เขียนว่า '${pair.after}'`;
    default: return `${key} → ใช้ '${pair.after}'`;
  }
}
const FLIP = ' (เปลี่ยนบ่อย ถามผู้ใช้ก่อน)';
/** The same subject corrected three times in 60 days with different answers: the rule says to ask first. */
export function flipFlops(recentAfters: string[], after: string): boolean {
  const lastThree = [after, ...recentAfters].slice(0, 3);
  return lastThree.length >= 3 && new Set(lastThree).size >= 2;
}

/** The lessons saved with a card's call (only the server puts them there; a model's own arguments never do). */
export const learnedPairs = (args: Record<string, unknown> | undefined): LearnPair[] =>
  (Array.isArray(args?.__learn) ? (args!.__learn as LearnPair[]) : []).filter(pair => pair && typeof pair.subject === 'string' && typeof pair.after === 'string');

export interface LearningDb {
  memories(userId: string): Promise<MemoryRow[]>;
  saveMemory?(userId: string, input: { kind: string; value: string; source: 'explicit' | 'correction'; channel: 'app' | 'line'; replace?: MemoryRow & { version?: number }; evict?: MemoryRow[] }): Promise<string | null>;
  saveCorrection?(userId: string, input: LearnPair & { proposalId: string; memoryId: string | null }): Promise<void>;
  recentCorrections?(userId: string, domain: CorrectionDomain, subject: string): Promise<string[]>;
}
/** After a card is applied: each lesson becomes (or replaces) this account's rule, and goes in its history. */
export async function learnFromConfirmed(db: LearningDb, userId: string, proposal: { id: string; args?: Record<string, unknown> }, channel: 'app' | 'line'): Promise<number> {
  const pairs = learnedPairs(proposal.args);
  if (!pairs.length || !db.saveMemory) return 0;
  let rows = await db.memories(userId);
  let learned = 0;
  for (const pair of pairs) {
    const base = ruleText(pair);
    // Rules are data like any memory: nothing that identifies money or people, nothing that reads as an instruction.
    if (!isRememberable(base)) continue;
    const recent = (await db.recentCorrections?.(userId, pair.domain, pair.subject).catch(() => [])) ?? [];
    const value = (flipFlops(recent, pair.after) ? `${base}${FLIP}` : base).slice(0, 200);
    const replace = rows.find(row => row.kind === 'correction' && row.value.startsWith(ruleKey(pair)));
    const next = replace ? rows.map(row => (row === replace ? { ...row, value } : row)) : [{ id: 'new', kind: 'correction', value }, ...rows];
    const evict = overLimit(next, MEMORY_LIMIT).filter(row => row.id !== 'new');
    const memoryId = await db.saveMemory(userId, { kind: 'correction', value, source: 'correction', channel, ...(replace ? { replace } : {}), ...(evict.length ? { evict } : {}) });
    rows = next.filter(row => !evict.includes(row)).map(row => (row.id === 'new' ? { ...row, id: memoryId ?? 'new' } : row));
    await db.saveCorrection?.(userId, { ...pair, proposalId: proposal.id, memoryId }).catch(() => undefined);
    learned += 1;
  }
  return learned;
}

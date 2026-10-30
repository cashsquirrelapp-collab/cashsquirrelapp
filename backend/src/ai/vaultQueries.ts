import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { VAULT_KINDS, VAULT_MAX_FILES, type VaultFile } from '../../../shared/vault.js';
import { paidYearOf, receivedPaymentDateOf, wht50StatusOf, wht50WaitingDays } from '../../../shared/vaultStatus.js';
import { jobWhtAmount } from '../../../shared/wht.js';
import type { UserRow } from '../services/lineAssistant.js';
import type { AssistantCard, ToolOutcome, ToolSpec } from './types.js';

/** The service binds this loader to the authenticated user; the model never chooses its scope. */
export type VaultLoader = () => Promise<VaultFile[]>;
const paging = { offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(25).default(10) };
const query = z.string().trim().max(200).default('');
const filesSchema = z.object({ query, kind: z.enum(['all', ...VAULT_KINDS]).default('all'), job_id: z.string().max(120).optional(), ...paging }).strict();
const trackingSchema = z.object({ query, status: z.enum(['all', 'none', 'notYet', 'waiting', 'eWht', 'have']).default('all'), year: z.number().int().optional(), ...paging }).strict();
const pageProps = { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 25 } };
export const VAULT_TOOLS: ToolSpec[] = [
  { name: 'search_vault', description: 'Search this account’s saved file metadata by filename, client, job or kind. Does NOT read file contents. Returns count and pagination; no download URLs or storage credentials.', parameters: { type: 'object', properties: {
    query: { type: 'string' }, kind: { type: 'string', enum: ['all', ...VAULT_KINDS] }, job_id: { type: 'string', description: 'Own job or expense ID from another tool' }, ...pageProps,
  } } },
  { name: 'wht_tracking', description: 'Check which own jobs have or are waiting for withholding certificates (50 ทวิ), using the app’s saved-file status rules. Optional year uses the latest actual receipt date, NOT a full tax-year income allocation. File metadata only.', parameters: { type: 'object', properties: {
    query: { type: 'string' }, status: { type: 'string', enum: ['all', 'none', 'notYet', 'waiting', 'eWht', 'have'] }, year: { type: 'integer', description: 'Calendar year CE or BE; jobs with unknown receipt dates are reported separately' }, ...pageProps,
  } } },
];
/**
 * Keep the file sent in this chat in the vault (owner, 2026-10-31): a slip, receipt, 50 ทวิ or contract goes with one
 * of the user's own jobs or expenses. Only offered when a file is in the chat (gateway.ts). It shows a card; the app
 * saves the file only when the user presses its button and saves in the vault's window.
 */
export const ATTACH_TOOL: ToolSpec = { name: 'attach_file', description: 'Offer to keep the file the user sent in this chat in the document vault (คลังเอกสาร), with one of their own jobs (ใบ 50 ทวิ, สัญญา / PO, a slip of a payment received) or expenses (a slip or receipt). Shows a card with a button; the file is saved only after the user presses it. Use the exact job_id or expense_id from another tool; for a job or expense you are preparing in this answer, give its name instead.', parameters: { type: 'object', properties: {
  kind: { type: 'string', enum: [...VAULT_KINDS], description: 'wht50 = ใบ 50 ทวิ, contract = สัญญา / PO, expense = slip or receipt of an expense, other = anything else (a slip of money received from a client goes with its job as other)' },
  job_id: { type: 'string', description: 'Own job ID from another tool' },
  expense_id: { type: 'string', description: 'Own expense ID from another tool' },
  record_name: { type: 'string', description: 'Name of a job or expense being prepared in this answer (not saved yet)' },
}, required: ['kind'] } };
const attachSchema = z.object({ kind: z.enum(VAULT_KINDS), job_id: z.string().trim().max(120).optional(), expense_id: z.string().trim().max(120).optional(),
  record_name: z.string().trim().max(200).optional() }).strict();

export const isVaultTool = (name: string) => name === ATTACH_TOOL.name || VAULT_TOOLS.some(tool => tool.name === name);
const fail = (error: string): ToolOutcome => ({ result: { ok: false, error } });
const paginate = <T,>(rows: T[], offset: number, limit: number) => ({ total: rows.length, offset, shown: rows.slice(offset, offset + limit).length, next_offset: offset + limit < rows.length ? offset + limit : null, rows: rows.slice(offset, offset + limit) });
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
const metadata = (file: VaultFile) => ({ file_id: file.id, kind: file.kind, file_name: text(file.fileName), job_id: file.jobId, job_name: text(file.jobName), client: text(file.client), mime_type: file.mimeType, size_bytes: file.sizeBytes, created_at: file.createdAt });

export async function executeVaultTool(name: string, args: Record<string, unknown>, user: UserRow, load: VaultLoader | undefined, now = new Date(), fileName = ''): Promise<ToolOutcome> {
  if (!isVaultTool(name)) return fail('ไม่รู้จักเครื่องมือคลังเอกสาร');
  if (name === ATTACH_TOOL.name) return attachCard(args, user, fileName);
  const parsed = name === 'search_vault' ? filesSchema.safeParse(args) : trackingSchema.safeParse(args);
  if (!parsed.success) return fail('ตัวกรองคลังเอกสารไม่ถูกต้อง ใช้เฉพาะตัวกรองที่เครื่องมือรองรับ');
  if (!load) return fail('ยังอ่านคลังเอกสารไม่ได้ในคำขอนี้ จึงยังยืนยันไม่ได้ว่ามีไฟล์หรือไม่');
  let files: VaultFile[];
  try { files = await load(); } catch { return fail('อ่านคลังเอกสารไม่สำเร็จ จึงยังยืนยันไม่ได้ว่ามีไฟล์หรือไม่'); }
  const common = { ok: true, source: 'saved_account_vault_metadata', checked_at: now.toISOString(), contents_read: false, source_limit: VAULT_MAX_FILES, source_limit_reached: files.length >= VAULT_MAX_FILES };
  if (name === 'search_vault') {
    const input = filesSchema.parse(args);
    const needle = input.query.toLocaleLowerCase();
    const matches = files.filter(file => (input.kind === 'all' || file.kind === input.kind) && (!input.job_id || file.jobId === input.job_id)
      && (!needle || `${file.fileName} ${file.jobName || ''} ${file.client || ''}`.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return { result: { ...common, ...paginate(matches.map(metadata), input.offset, input.limit), note: 'รายการนี้เป็นชื่อและสถานะไฟล์ ยังไม่ได้อ่านข้อความในไฟล์' } };
  }
  const input = trackingSchema.parse(args);
  const year = input.year === undefined ? undefined : input.year >= 2400 ? input.year - 543 : input.year;
  if (year !== undefined && (year < 1900 || year > 2200)) return fail('ปีไม่ถูกต้อง กรุณาระบุปี ค.ศ. หรือ พ.ศ.');
  const needle = input.query.toLocaleLowerCase();
  const today = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  const jobs = (user.jobs || []).filter(job => !needle || `${job.name} ${job.client || ''}`.toLocaleLowerCase().includes(needle));
  const matches = jobs.filter(job => (input.status === 'all' || wht50StatusOf(job, files) === input.status) && (year === undefined || paidYearOf(job) === year));
  const counts: Record<string, number> = {};
  for (const job of matches) { const status = wht50StatusOf(job, files); counts[status] = (counts[status] || 0) + 1; }
  return { result: { ...common, ...(year === undefined ? {} : { year, year_basis: 'latest_actual_receipt_date', unknown_receipt_year_count: jobs.filter(job => jobWhtAmount(job) > 0 && paidYearOf(job) === null).length }), status_counts: counts,
    ...paginate(matches.map(job => ({ job_id: job.id, name: text(job.name), client: text(job.client), status: wht50StatusOf(job, files), contract_wht: jobWhtAmount(job), latest_received_date: receivedPaymentDateOf(job), waiting_days: wht50WaitingDays(job, today), file_count: files.filter(file => file.kind === 'wht50' && file.jobId === job.id).length })), input.offset, input.limit),
    note: 'สถานะตามกติกาของแอป ไม่ใช่ผลตรวจเอกสารหรือยอดเครดิตภาษีรายปี ใช้ tax_year_summary สำหรับยอดรายปี',
  } };
}

function attachCard(args: Record<string, unknown>, user: UserRow, fileName: string): ToolOutcome {
  const parsed = attachSchema.safeParse(args);
  if (!parsed.success) return fail('ข้อมูลการแนบไฟล์ไม่ถูกต้อง');
  const { kind, job_id: jobId, expense_id: expenseId, record_name: recordName } = parsed.data;
  const job = jobId ? (user.jobs || []).find(row => row.id === jobId) : undefined;
  if (jobId && !job) return fail('ไม่พบงานนี้ในบัญชี ค้นหางานก่อนแล้วใช้ job_id ที่ได้');
  // Saved expenses carry their id (the shared summary type leaves it out).
  const expense = expenseId ? ((user.expenses || []) as { id?: string; name?: string }[]).find(row => row.id === expenseId) : undefined;
  if (expenseId && !expense) return fail('ไม่พบรายจ่ายนี้ในบัญชี ค้นหารายจ่ายก่อนแล้วใช้ expense_id ที่ได้');
  const forExpense = kind === 'expense';
  const name = recordName ? text(recordName, 200) : undefined;
  const card: AssistantCard = {
    kind: 'attach', id: `at_${randomUUID()}`, fileKind: kind, fileName: text(fileName, 160),
    ...(forExpense
      ? { ...(expense ? { expenseId: expense.id as string, expenseName: text(expense.name, 200) } : name ? { expenseName: name } : {}) }
      : { ...(job ? { jobId: job.id, jobName: text(job.name, 200), ...(job.client ? { client: text(job.client, 200) } : {}) } : name ? { jobName: name } : {}) }),
  };
  return { result: { ok: true, card_shown: 'attach_file', note: 'A card with an แนบเข้าคลังเอกสาร button is under your answer. The file is NOT saved yet: say in one short line that the user can press the button to keep it with the job or expense. Never say it was attached.' }, card };
}

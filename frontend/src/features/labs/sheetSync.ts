import type { Job, StatusOption } from '../../../../shared/types';
import type { LiveTab, SheetLink, SheetMap } from '../../../../shared/googleSheets';
import { roundMoney } from '../../../../shared/wht';
import { buildImportPlan, type ImportedJob } from '../import/sheetImport';
import { readTabs } from './sheetMap';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs; owner, 2026-11-14: "ฐานข้อมูลใน Google Sheet เป็นอันนั้นแทน" and the approved mock:
// the Jobs page as it is, one line "ข้อมูลจากชีต … · อัปเดต 09:12 · เปิดชีต"). The customer's sheet is the master and the
// app keeps a copy (decision 2026-11-12): each row of the sheet's job tabs is read the way the Excel import reads it
// (sheetImport.ts, by the confirmed sheet map) and becomes a job in the app, linked to its row (`sheetLink`).
//
// Rows move (a row inserted above, a sort), so a row is matched to a job in this order: the job linked to that very row
// when it is still the same job (same name, or same amount and client); a job linked to another row of the same tab with
// the same name (the row moved); a job made in the app (เลขา's chat, the form) with the same name, amount and client, not
// yet linked (it is now linked, never added twice); otherwise a new job. Only what the sheet says is taken from it: a sheet
// without a payment column leaves the job's payment as the app has it, one without a due date leaves the due date.
// Nothing is deleted on the app's side: a linked job whose row is gone is marked `missing` and stays.

export interface SheetSyncChanges {
  add: Omit<Job, 'id'>[];
  update: { id: string; fields: Partial<Job> }[];
  /** Rows of the sheet read as jobs. */
  rows: number;
  /** Linked jobs whose row was not found. */
  missing: number;
}

const norm = (text: unknown) => String(text ?? '').toLowerCase().replace(/\s+/g, '');
const sameMoney = (a: unknown, b: unknown) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

/** Which of a job's fields each kind of column decides. */
function ownedFields(targets: Set<string>): (keyof Job)[] {
  const fields = new Set<keyof Job>();
  const has = (...names: string[]) => names.some(name => targets.has(name));
  if (has('name', 'project')) fields.add('name');
  if (has('client')) fields.add('client');
  if (has('type')) fields.add('type');
  if (has('value', 'amount', 'income')) fields.add('value');
  if (has('whtRate', 'whtAmount')) { fields.add('whtRate'); fields.add('whtAmount'); }
  if (has('received', 'pending', 'status', 'paidDate', 'installment', 'installmentStatus')) {
    for (const field of ['received', 'pending', 'status', 'paymentStatus', 'depositDate', 'depositAmount', 'installments'] as (keyof Job)[]) fields.add(field);
  }
  if (has('dueDate')) { fields.add('payDate'); fields.add('dueDate'); }
  if (has('postDate', 'date')) { fields.add('postDate'); fields.add('isPosted'); }
  if (has('creditTerm')) fields.add('creditTerm');
  if (has('note', 'keep')) fields.add('note');
  return [...fields];
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sameLink = (a: SheetLink | undefined, b: SheetLink) => Boolean(a) && a!.fileId === b.fileId && a!.tab === b.tab && a!.row === b.row && a!.gid === b.gid && !a!.missing;

/** The job a sheet row is, and what the sheet changes in it. */
export function planSheetSync(input: {
  jobs: Job[]; tabs: LiveTab[]; map: SheetMap; fileId: string; statuses: StatusOption[]; jobTypes: string[]; today: string;
}): SheetSyncChanges {
  const { jobs, map, fileId } = input;
  const readings = readTabs(input.tabs, map).filter(reading => reading.use && reading.analysis.role === 'data' && reading.analysis.kind !== 'expenses');
  const plan = buildImportPlan(readings.map(({ grid, analysis }) => ({ grid, analysis })), { amountsAreNet: false, today: input.today },
    { statuses: input.statuses, jobTypes: input.jobTypes, existingJobs: [], existingExpenses: [] }, readings.map(reading => reading.grid));
  const gidOf = new Map(readings.map(reading => [reading.analysis.name, reading.gid]));
  const targetsOf = new Map(readings.map(reading => [reading.analysis.name, new Set(reading.analysis.columns.map(column => String(column.target)))]));
  const readTabNames = new Set(readings.map(reading => reading.analysis.name));

  const linked = (job: Job): SheetLink | undefined => job.sheetLink;
  const claimed = new Set<string>();
  const add: Omit<Job, 'id'>[] = [];
  const update: { id: string; fields: Partial<Job> }[] = [];
  let rows = 0;

  for (const row of plan.rows) {
    if (!row.job || row.state === 'skip' || row.kind !== 'job') continue;
    rows += 1;
    const sheetJob = row.job as ImportedJob;
    const link: SheetLink = { fileId, tab: row.sheet, row: row.rowNumber, ...(typeof gidOf.get(row.sheet) === 'number' ? { gid: gidOf.get(row.sheet)! } : {}) };
    const open = (job: Job) => !claimed.has(job.id);
    const inTab = (job: Job) => linked(job)?.fileId === fileId && linked(job)?.tab === row.sheet;
    const similar = (job: Job) => norm(job.name) === norm(sheetJob.name) || (sameMoney(job.value, sheetJob.value) && norm(job.client) !== '' && norm(job.client) === norm(sheetJob.client));
    const match = jobs.find(job => open(job) && inTab(job) && linked(job)!.row === row.rowNumber && similar(job))
      ?? jobs.find(job => open(job) && inTab(job) && norm(job.name) === norm(sheetJob.name) && sameMoney(job.value, sheetJob.value))
      ?? jobs.find(job => open(job) && inTab(job) && norm(job.name) === norm(sheetJob.name))
      ?? jobs.find(job => open(job) && !linked(job) && norm(job.name) === norm(sheetJob.name) && sameMoney(job.value, sheetJob.value)
        && (!norm(job.client) || !norm(sheetJob.client) || norm(job.client) === norm(sheetJob.client)));
    if (!match) { add.push({ ...sheetJob, sheetLink: link }); continue; }
    claimed.add(match.id);
    const fields: Partial<Job> = {};
    const targets = targetsOf.get(row.sheet) ?? new Set<string>();
    const owned = ownedFields(targets);
    // A paid-date column decides the date only once the row is paid; until then the app's own due date stands (the
    // importer would otherwise put a guess there).
    if (!owned.includes('payDate') && targets.has('paidDate') && (sheetJob.paymentStatus === 'paid' || sheetJob.status === 'done')) owned.push('payDate', 'dueDate');
    for (const field of owned) {
      const value = (sheetJob as Partial<Job>)[field];
      if (value === undefined) continue;
      if (!sameValue(match[field], value)) (fields as Record<string, unknown>)[field] = value;
    }
    // The amount or the withholding changed but the sheet says nothing of payment: what is still owed follows.
    if (!owned.includes('pending') && ('value' in fields || 'whtAmount' in fields)) {
      const value = Number(fields.value ?? match.value) || 0, wht = Number(fields.whtAmount ?? match.whtAmount) || 0;
      const pending = Math.max(0, roundMoney(value - wht - (Number(match.received) || 0)));
      if (!sameMoney(pending, match.pending)) fields.pending = pending;
    }
    if (!sameLink(linked(match), link)) fields.sheetLink = link;
    if (Object.keys(fields).length) update.push({ id: match.id, fields });
  }

  let missing = 0;
  for (const job of jobs) {
    const link = linked(job);
    if (!link || claimed.has(job.id) || link.fileId !== fileId || !readTabNames.has(link.tab)) continue;
    missing += 1;
    if (!link.missing) update.push({ id: job.id, fields: { sheetLink: { ...link, missing: true } } });
  }
  return { add, update, rows, missing };
}

import type { Expense, Job, SheetSeen, StatusOption } from '../../../../shared/types';
import type { LiveCell, LiveTab, SheetLink, SheetMap } from '../../../../shared/googleSheets';
import { roundMoney } from '../../../../shared/wht';
import { buildImportPlan, type ImportedExpense, type ImportedJob } from '../import/sheetImport';
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
// A row deleted from the sheet deletes its job in the app (owner, 2026-11-18: "ถ้ากูลบใน Google Sheet ออก ยอดในโปรแกรมก็
// ต้องออก"), unless many go at once (see goneOrHeld): those are marked `missing` and wait for the person's one tap.

export interface SheetSyncChanges {
  fileId: string;
  add: Omit<Job, 'id'>[];
  update: { id: string; fields: Partial<Job> }[];
  /** Jobs taken from the template's example rows before: removed. */
  remove: string[];
  /** Rows of the sheet read as jobs. */
  rows: number;
  /** Linked jobs whose row was not found. */
  missing: number;
  /** Jobs removed because their row was deleted from the sheet (in `remove` too). */
  gone: number;
  /** Jobs whose rows went from the sheet all at once, too many to remove without asking: kept, marked missing. */
  held: string[];
  /** The person pressed ลบออกจากแอป for held records (not a reading of the sheet). */
  asked?: true;
  /** Rows left out because their job was deleted in the app. */
  skipped: number;
  /** The new counts of rows taken (settings.sheetSeen.jobs), or null when they did not change. */
  seen: Record<string, number> | null;
}

const norm = (text: unknown) => String(text ?? '').toLowerCase().replace(/\s+/g, '');
const sameMoney = (a: unknown, b: unknown) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

// What the app already took from the sheet (owner, 2026-11-17: "ทำไมยอดเงินกูมันขึ้นมาเหมือนเดิมอีกแล้ว ... กูไม่ได้กรอกแล้ว
// มันดันขึ้นมาเอง"): a job deleted in the app left its row in the sheet, and the next reading added it back as a new job, so
// the totals came back. Each reading now counts its rows by tab and what they say (name, amount, client) and keeps the counts
// in the account's settings (`sheetSeen`, the same on every device). A row with no job in the app is added only when there
// are more such rows than the app took before: one it took and no longer has was deleted in the app, and stays out. A row
// that changes in the sheet, or a new row, is still taken. The template's example rows (marked "(ตัวอย่าง)",
// shared/bookTemplates.ts) are never taken, and a job or an expense taken from one before is removed.
// The template ends every invented name with it ("บริษัท ตัวอย่างมีเดีย จำกัด (ตัวอย่าง)"); a note that merely mentions a
// sample ("ส่ง (ตัวอย่าง) ให้ลูกค้า") is not an example row.
const EXAMPLE = /\(ตัวอย่าง\)\s*$/;
const hashOf = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(36);
};
const seenKey = (tab: string, ...parts: unknown[]) => `${hashOf(tab)}:${hashOf(parts.map(part => (typeof part === 'number' ? String(roundMoney(part)) : norm(part))).join('|'))}`;
const exampleText = (...texts: unknown[]) => texts.some(text => EXAMPLE.test(String(text ?? '')));
const exampleRow = (rows: LiveCell[][] | undefined, rowNumber: number) => (rows?.[rowNumber - 1] ?? []).some(cell => exampleText(cell?.text, cell?.raw));

/**
 * Rows gone from the sheet: their records go from the app too. A sheet that suddenly reads with most of its rows gone (a
 * tab emptied by mistake, a filter, a read that went wrong) must not empty the app, so more than GONE_AT_ONCE records that
 * are also more than half of those taken from the read tabs wait for the person to confirm (the line over the list asks).
 * Rows beyond what was read of a long tab are never counted as gone.
 */
const GONE_AT_ONCE = 5;
function goneOrHeld(candidates: string[], linkedInRead: number): { gone: string[]; held: string[] } {
  return candidates.length <= GONE_AT_ONCE || candidates.length * 2 <= linkedInRead ? { gone: candidates, held: [] } : { gone: [], held: candidates };
}
const readLimits = (tabs: LiveTab[]) => new Map(tabs.filter(tab => tab.truncated).map(tab => [tab.name, tab.rows.length]));

/** The rows with nothing in the app to match: those the app took before and no longer has were deleted in it, and stay out. */
function leaveDeletedOut<T>(pending: { key: string; item: T }[], total: Map<string, number>, matched: Map<string, number>,
  before: Record<string, number> | undefined, tabsRead: Set<string>) {
  const left = new Map([...total.keys()].map(key => [key, Math.max(0, (before?.[key] ?? 0) - (matched.get(key) ?? 0))]));
  const add: T[] = [];
  let skipped = 0;
  for (const { key, item } of pending) {
    const n = left.get(key) ?? 0;
    if (n > 0) { left.set(key, n - 1); skipped += 1; } else add.push(item);
  }
  // A tab not read this time keeps what was counted for it.
  const read = new Set([...tabsRead].map(hashOf));
  const seen: Record<string, number> = {};
  for (const [key, n] of Object.entries(before ?? {})) if (!read.has(key.split(':')[0])) seen[key] = n;
  for (const [key, n] of total) seen[key] = n;
  const sorted = (counts: Record<string, number>) => JSON.stringify(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { add, skipped, seen: sorted(seen) === sorted(before ?? {}) ? null : seen };
}

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
  /** settings.sheetSeen: what the app already took from the sheet. */
  seen?: SheetSeen | null;
  /** Rows the app itself wrote in the last minutes (the reading says which): linked when their record is here, never added. */
  recentRows?: { tab: string; row: number }[];
}): SheetSyncChanges {
  const { jobs, map, fileId } = input;
  const before = input.seen?.fileId === fileId ? input.seen.jobs : undefined;
  const recent = new Set((input.recentRows ?? []).map(item => `${item.tab}\u0001${item.row}`));
  const readings = readTabs(input.tabs, map).filter(reading => reading.use && reading.analysis.role === 'data' && reading.analysis.kind !== 'expenses');
  const plan = buildImportPlan(readings.map(({ grid, analysis }) => ({ grid, analysis })), { amountsAreNet: false, today: input.today },
    { statuses: input.statuses, jobTypes: input.jobTypes, existingJobs: [], existingExpenses: [] }, readings.map(reading => reading.grid));
  const gidOf = new Map(readings.map(reading => [reading.analysis.name, reading.gid]));
  const targetsOf = new Map(readings.map(reading => [reading.analysis.name, new Set(reading.analysis.columns.map(column => String(column.target)))]));
  const readTabNames = new Set(readings.map(reading => reading.analysis.name));
  const cellsOf = new Map(readings.map(reading => [reading.analysis.name, reading.grid.rows as unknown as LiveCell[][]]));

  const linked = (job: Job): SheetLink | undefined => job.sheetLink;
  const claimed = new Set<string>();
  const pending: { key: string; item: Omit<Job, 'id'> }[] = [];
  const update: { id: string; fields: Partial<Job> }[] = [];
  const remove: string[] = [];
  const total = new Map<string, number>();
  const matchedCount = new Map<string, number>();
  let rows = 0;

  for (const row of plan.rows) {
    if (!row.job || row.state === 'skip' || row.kind !== 'job') continue;
    const sheetJob = row.job as ImportedJob;
    const link: SheetLink = { fileId, tab: row.sheet, row: row.rowNumber, ...(typeof gidOf.get(row.sheet) === 'number' ? { gid: gidOf.get(row.sheet)! } : {}) };
    const open = (job: Job) => !claimed.has(job.id);
    const inTab = (job: Job) => linked(job)?.fileId === fileId && linked(job)?.tab === row.sheet;
    if (exampleRow(cellsOf.get(row.sheet), row.rowNumber)) {
      for (const job of jobs) {
        if (open(job) && inTab(job) && norm(job.name) === norm(sheetJob.name) && (linked(job)!.row === row.rowNumber || exampleText(job.name, job.client, job.note))) { claimed.add(job.id); remove.push(job.id); }
      }
      continue;
    }
    rows += 1;
    const key = seenKey(row.sheet, sheetJob.name, Number(sheetJob.value) || 0, sheetJob.client);
    total.set(key, (total.get(key) ?? 0) + 1);
    const similar = (job: Job) => norm(job.name) === norm(sheetJob.name) || (sameMoney(job.value, sheetJob.value) && norm(job.client) !== '' && norm(job.client) === norm(sheetJob.client));
    const match = jobs.find(job => open(job) && inTab(job) && linked(job)!.row === row.rowNumber && similar(job))
      ?? jobs.find(job => open(job) && inTab(job) && norm(job.name) === norm(sheetJob.name) && sameMoney(job.value, sheetJob.value))
      ?? jobs.find(job => open(job) && inTab(job) && norm(job.name) === norm(sheetJob.name))
      ?? jobs.find(job => open(job) && !linked(job) && norm(job.name) === norm(sheetJob.name) && sameMoney(job.value, sheetJob.value)
        && (!norm(job.client) || !norm(sheetJob.client) || norm(job.client) === norm(sheetJob.client)));
    if (!match) {
      // Written by the app a moment ago for a record that has not reached this screen yet: left for it, not added.
      if (recent.has(`${row.sheet}\u0001${row.rowNumber}`)) { total.set(key, total.get(key)! - 1); continue; }
      pending.push({ key, item: { ...sheetJob, sheetLink: link } }); continue;
    }
    claimed.add(match.id);
    matchedCount.set(key, (matchedCount.get(key) ?? 0) + 1);
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
  let linkedInRead = 0;
  const limits = readLimits(input.tabs);
  const candidates: Job[] = [];
  for (const job of jobs) {
    const link = linked(job);
    if (!link || link.fileId !== fileId || !readTabNames.has(link.tab)) continue;
    if (limits.has(link.tab) && link.row > limits.get(link.tab)!) continue;
    linkedInRead += 1;
    if (claimed.has(job.id)) continue;
    if (exampleText(job.name, job.client)) { remove.push(job.id); continue; }
    candidates.push(job);
  }
  const { gone, held } = goneOrHeld(candidates.map(job => job.id), linkedInRead);
  remove.push(...gone);
  for (const job of candidates.filter(job => held.includes(job.id))) {
    missing += 1;
    if (!job.sheetLink!.missing) update.push({ id: job.id, fields: { sheetLink: { ...job.sheetLink!, missing: true } } });
  }
  const kept = leaveDeletedOut(pending, total, matchedCount, before, readTabNames);
  return { fileId, add: kept.add, update, remove, rows, missing, gone: gone.length, held, skipped: kept.skipped, seen: kept.seen };
}

// รายจ่ายจากชีต (owner, 2026-11-14: "ทำดึงรายจ่ายจากชีตต่อเลย"), the same way as the jobs: each expense row of the sheet's
// expense tabs and ledgers is read the way the Excel import reads it and becomes an expense in the app, linked to its row.
// A row the import leaves out stays out (a transfer to the person's own savings, the same expense in two tabs, no amount),
// and so does a row the sheet marks personal. A row is matched to an expense in this order: the expense linked to that very
// row when it is still the same (same name, or same amount and date); one linked to another row of the same tab with the
// same name and amount (the row moved); one made in the app (เลขา's chat, the form) with the same name and amount and the
// same date or none, not yet linked (now linked, never added twice); otherwise a new expense. Only what the tab has a
// column for is taken (no category column leaves the app's category; no date column leaves the app's date). A row deleted
// from the sheet deletes its expense in the app, as with the jobs (goneOrHeld).

export interface SheetExpenseChanges {
  fileId: string;
  add: Omit<Expense, 'id'>[];
  update: { id: string; fields: Partial<Expense> }[];
  /** Expenses taken from the template's example rows before: removed. */
  remove: string[];
  rows: number;
  missing: number;
  /** Expenses removed because their row was deleted from the sheet (in `remove` too). */
  gone: number;
  /** Expenses whose rows went from the sheet all at once, too many to remove without asking: kept, marked missing. */
  held: string[];
  /** The person pressed ลบออกจากแอป for held records (not a reading of the sheet). */
  asked?: true;
  /** Rows left out because their expense was deleted in the app. */
  skipped: number;
  /** The new counts of rows taken (settings.sheetSeen.expenses), or null when they did not change. */
  seen: Record<string, number> | null;
}

/** Which of an expense's fields each kind of column decides. */
function ownedExpenseFields(targets: Set<string>): (keyof Expense)[] {
  const fields: (keyof Expense)[] = ['name', 'amount'];
  const has = (...names: string[]) => names.some(name => targets.has(name));
  if (has('category', 'type')) fields.push('category');
  if (has('date', 'paidDate', 'postDate')) fields.push('date');
  if (has('note', 'project', 'keep')) fields.push('note');
  return fields;
}

/** The expense a sheet row is, and what the sheet changes in it. */
export function planSheetExpenseSync(input: { expenses: Expense[]; tabs: LiveTab[]; map: SheetMap; fileId: string; today: string; seen?: SheetSeen | null; recentRows?: { tab: string; row: number }[] }): SheetExpenseChanges {
  const { expenses, map, fileId } = input;
  const before = input.seen?.fileId === fileId ? input.seen.expenses : undefined;
  const recent = new Set((input.recentRows ?? []).map(item => `${item.tab}\u0001${item.row}`));
  const readings = readTabs(input.tabs, map).filter(reading => reading.use && reading.analysis.role === 'data' && reading.analysis.kind !== 'jobs');
  const plan = buildImportPlan(readings.map(({ grid, analysis }) => ({ grid, analysis })), { amountsAreNet: false, today: input.today },
    { statuses: [], jobTypes: [], existingJobs: [], existingExpenses: [] }, readings.map(reading => reading.grid));
  const gidOf = new Map(readings.map(reading => [reading.analysis.name, reading.gid]));
  const targetsOf = new Map(readings.map(reading => [reading.analysis.name, new Set(reading.analysis.columns.map(column => String(column.target)))]));
  const readTabNames = new Set(readings.map(reading => reading.analysis.name));
  // The business / personal column only decides which rows are taken: "ธุรกิจ/ส่วนตัว: ธุรกิจ" is not kept in the note.
  const useLabels = new Map(readings.map(reading => [reading.analysis.name,
    reading.analysis.columns.filter(column => String(column.target) === 'use').map(column => `${column.header || 'use'}: `)]));
  const noteOf = (sheet: string, note = '') => {
    const labels = useLabels.get(sheet) ?? [];
    return labels.length ? note.split(' · ').filter(part => !labels.some(label => part.startsWith(label))).join(' · ') : note;
  };

  const cellsOf = new Map(readings.map(reading => [reading.analysis.name, reading.grid.rows as unknown as LiveCell[][]]));
  const claimed = new Set<string>();
  const pending: { key: string; item: Omit<Expense, 'id'> }[] = [];
  const update: { id: string; fields: Partial<Expense> }[] = [];
  const remove: string[] = [];
  const total = new Map<string, number>();
  const matchedCount = new Map<string, number>();
  let rows = 0;

  for (const row of plan.rows) {
    if (!row.expense || row.state === 'skip' || row.kind !== 'expense' || row.use === 'personal') continue;
    const sheetExpense: ImportedExpense = { ...row.expense, note: noteOf(row.sheet, row.expense.note) };
    const link: SheetLink = { fileId, tab: row.sheet, row: row.rowNumber, ...(typeof gidOf.get(row.sheet) === 'number' ? { gid: gidOf.get(row.sheet)! } : {}) };
    const open = (expense: Expense) => !claimed.has(expense.id);
    const inTab = (expense: Expense) => expense.sheetLink?.fileId === fileId && expense.sheetLink?.tab === row.sheet;
    if (exampleRow(cellsOf.get(row.sheet), row.rowNumber)) {
      for (const expense of expenses) {
        if (open(expense) && inTab(expense) && norm(expense.name) === norm(sheetExpense.name) && (expense.sheetLink!.row === row.rowNumber || exampleText(expense.name, expense.note))) { claimed.add(expense.id); remove.push(expense.id); }
      }
      continue;
    }
    rows += 1;
    const key = seenKey(row.sheet, sheetExpense.name, Number(sheetExpense.amount) || 0);
    total.set(key, (total.get(key) ?? 0) + 1);
    const sameName = (expense: Expense) => norm(expense.name) === norm(sheetExpense.name);
    const sameAmount = (expense: Expense) => sameMoney(expense.amount, sheetExpense.amount);
    const similar = (expense: Expense) => sameName(expense) || (sameAmount(expense) && Boolean(sheetExpense.date) && expense.date === sheetExpense.date);
    const match = expenses.find(expense => open(expense) && inTab(expense) && expense.sheetLink!.row === row.rowNumber && similar(expense))
      ?? expenses.find(expense => open(expense) && inTab(expense) && sameName(expense) && sameAmount(expense))
      ?? expenses.find(expense => open(expense) && !expense.sheetLink && sameName(expense) && sameAmount(expense)
        && (!expense.date || !sheetExpense.date || expense.date === sheetExpense.date));
    if (!match) {
      if (recent.has(`${row.sheet}\u0001${row.rowNumber}`)) { total.set(key, total.get(key)! - 1); continue; }
      pending.push({ key, item: { ...sheetExpense, sheetLink: link } }); continue;
    }
    claimed.add(match.id);
    matchedCount.set(key, (matchedCount.get(key) ?? 0) + 1);
    const fields: Partial<Expense> = {};
    for (const field of ownedExpenseFields(targetsOf.get(row.sheet) ?? new Set<string>())) {
      const value = (sheetExpense as Partial<Expense>)[field];
      if (value === undefined || (field === 'date' && !value)) continue;
      if (!sameValue(match[field], value)) (fields as Record<string, unknown>)[field] = value;
    }
    if (!sameLink(match.sheetLink, link)) fields.sheetLink = link;
    if (Object.keys(fields).length) update.push({ id: match.id, fields });
  }

  let missing = 0;
  let linkedInRead = 0;
  const limits = readLimits(input.tabs);
  const candidates: Expense[] = [];
  for (const expense of expenses) {
    const link = expense.sheetLink;
    if (!link || link.fileId !== fileId || !readTabNames.has(link.tab)) continue;
    if (limits.has(link.tab) && link.row > limits.get(link.tab)!) continue;
    linkedInRead += 1;
    if (claimed.has(expense.id)) continue;
    if (exampleText(expense.name, expense.note)) { remove.push(expense.id); continue; }
    candidates.push(expense);
  }
  const { gone, held } = goneOrHeld(candidates.map(expense => expense.id), linkedInRead);
  remove.push(...gone);
  for (const expense of candidates.filter(expense => held.includes(expense.id))) {
    missing += 1;
    if (!expense.sheetLink!.missing) update.push({ id: expense.id, fields: { sheetLink: { ...expense.sheetLink!, missing: true } } });
  }
  const kept = leaveDeletedOut(pending, total, matchedCount, before, readTabNames);
  return { fileId, add: kept.add, update, remove, rows, missing, gone: gone.length, held, skipped: kept.skipped, seen: kept.seen };
}

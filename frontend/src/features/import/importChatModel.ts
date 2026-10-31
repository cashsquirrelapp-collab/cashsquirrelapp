import { CONFIRM_ISSUES, needsConfirmation, type ColumnGuess, type ColumnTarget, type DataKind, type ImportRow, type IssueCode } from './sheetImport';
import { QUIET_ISSUES, type RowEdit, type SheetState } from './importShared';

// The import as a chat with เลขากระรอก (owner, 2026-10-31: "ทำให้มันเป็นแบบแชท ... ดึงข้อมูลให้อัตโนมัติ ตรงไหนที่ไม่สามารถ
// ดึงได้มันก็ทำการแจ้งเขาเลย เพราะว่ามันอาจจะไม่ถูกคอลัมน์หรือแบบยังไม่มีฟีเจอร์ที่รองรับ"). The file is read by the import's
// own rules (sheetImport.ts) as before; this file turns what they found into what the chat says: the columns that
// matched, the ones to confirm, the ones the app has no place for, and the rows that need a decision, each group with
// its fixes. A fix, tapped or asked for in words, is applied here by rules; เลขา only names which fix (importChat.ts).

export type DateFix = 'today' | 'monthStart' | 'monthEnd' | 'date';
export type ChatAction =
  | { type: 'setColumn'; sheet: string; column: number; field: ColumnTarget }
  | { type: 'setKind'; sheet: string; kind: DataKind }
  | { type: 'includeSheet'; sheet: string; include: boolean }
  | { type: 'fillDate'; issue: IssueCode; mode: DateFix; date?: string }
  | { type: 'skipIssue'; issue: IssueCode }
  | { type: 'confirmIssue'; issue: IssueCode }
  | { type: 'amountsNet'; value: boolean };

/** Everything a fix can change; kept as a whole so เปลี่ยนกลับ restores it. */
export interface ChatState { sheets: SheetState[]; edits: Record<string, RowEdit>; included: Record<string, boolean>; amountsAreNet: boolean }

// ── columns ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ColumnLine { sheetIndex: number; index: number; header: string; target: ColumnTarget; reason: ColumnGuess['reason']; samples: string[] }
export interface SheetReport {
  index: number; name: string; include: boolean; rows: number; kind: DataKind;
  /** Why a tab is not imported: a summary laid out by month, a dashboard or read-me, a list that names codes, empty. */
  notImported: 'monthsAcross' | 'summary' | 'lookup' | 'empty' | null;
  matched: ColumnLine[];
  /** Guessed from the values or suggested by เลขา, where money or dates come from: the person says ใช่ first. */
  toConfirm: ColumnLine[];
  /** Columns the app has no field for: kept in each row's note (or left out when the person says so). */
  kept: ColumnLine[];
  ignored: ColumnLine[];
  missingName: boolean;
  missingAmount: boolean;
}

const line = (sheetIndex: number, column: ColumnGuess): ColumnLine => ({ sheetIndex, index: column.index, header: column.header, target: column.target, reason: column.reason, samples: column.samples });
const NAME_TARGETS: ColumnTarget[] = ['name', 'client', 'category'];
const MONEY_TARGETS: ColumnTarget[] = ['value', 'amount', 'received', 'pending', 'income', 'expense'];

export function sheetReports(sheets: SheetState[]): SheetReport[] {
  return sheets.map((sheet, index) => {
    const { analysis } = sheet;
    const notImported = analysis.monthsAcross ? 'monthsAcross' as const : !analysis.dataRows.length ? 'empty' as const
      : analysis.role === 'lookup' ? 'lookup' as const : analysis.role === 'summary' && !sheet.include ? 'summary' as const : null;
    const columns = analysis.columns;
    return {
      index, name: sheet.grid.name, include: sheet.include, rows: analysis.dataRows.length, kind: analysis.kind, notImported,
      matched: columns.filter(c => c.target !== 'keep' && c.target !== 'ignore' && !needsConfirmation(c)).map(c => line(index, c)),
      toConfirm: columns.filter(needsConfirmation).map(c => line(index, c)),
      kept: columns.filter(c => c.target === 'keep' && (c.header.trim() || c.samples.some(Boolean))).map(c => line(index, c)),
      ignored: columns.filter(c => c.target === 'ignore').map(c => line(index, c)),
      missingName: sheet.include && !columns.some(c => NAME_TARGETS.includes(c.target)),
      missingAmount: sheet.include && !columns.some(c => MONEY_TARGETS.includes(c.target)),
    };
  });
}

/** Columns still waiting for ใช่ in the tabs being imported: the import button waits for them. */
export const columnsWaiting = (sheets: SheetState[]) => sheetReports(sheets).filter(report => report.include).flatMap(report => report.toConfirm);

/** A column's target, as the person chose it (a field used by another column moves that one to the note). */
export function withTarget(sheet: SheetState, column: number, target: ColumnTarget): SheetState {
  return {
    ...sheet,
    analysis: { ...sheet.analysis, columns: sheet.analysis.columns.map(c => (c.index === column ? { ...c, target, confidence: 1, reason: 'person' as const }
      : target !== 'keep' && target !== 'ignore' && target !== 'note' && c.target === target ? { ...c, target: 'keep' as const, reason: 'none' as const } : c)) },
  };
}
export const withConfirmed = (sheet: SheetState, column: number): SheetState => ({
  ...sheet, analysis: { ...sheet.analysis, columns: sheet.analysis.columns.map(c => (c.index === column ? { ...c, confidence: 1, reason: 'person' as const } : c)) },
});

// ── rows that need a decision ───────────────────────────────────────────────────────────────────────────────────────

/** One issue per row decides its group, the most important first, so a row is counted once. */
export const GROUP_ORDER: IssueCode[] = [
  'changedInFile', 'editedInApp', 'foreignCurrency', 'amountUnreadable', 'noAmount', 'dateUnreadable', 'noDate', 'monthOnly', 'dateFromSheet',
  'statusConflict', 'partialNoAmount', 'paidDateFromDate', 'negative', 'duplicateInFile', 'sameNameOtherSheet', 'noName', 'paidWithoutDate', 'valueFromParts',
];
const DATE_ISSUES: IssueCode[] = ['noDate', 'dateUnreadable', 'monthOnly', 'dateFromSheet'];

export type GroupFix = DateFix | 'confirm' | 'skip' | 'include' | 'update' | 'noUpdate' | 'review';
export interface IssueGroup {
  issue: IssueCode;
  rows: ImportRow[];
  /** Waits for the person: left out until confirmed (confirm), left out unless included (skip), or imported with a note (check). */
  state: 'confirm' | 'skip' | 'check';
  fixes: GroupFix[];
  /** Every row in it has the person's decision. */
  decided: boolean;
}

export const primaryIssue = (row: ImportRow): IssueCode | null => GROUP_ORDER.find(issue => row.issues.includes(issue)) ?? null;

/** The groups to show, from the rows as they are now (edits applied), in GROUP_ORDER. */
export function issueGroups(rows: ImportRow[], included: Record<string, boolean>): IssueGroup[] {
  const byIssue = new Map<IssueCode, ImportRow[]>();
  for (const row of rows) {
    const issue = primaryIssue(row);
    if (!issue || (row.kind === 'skip' && issue !== 'noAmount')) continue;
    (byIssue.get(issue) ?? byIssue.set(issue, []).get(issue)!).push(row);
  }
  return GROUP_ORDER.filter(issue => byIssue.has(issue)).map(issue => {
    const list = byIssue.get(issue)!;
    const state = issue === 'noAmount' ? 'skip' as const : CONFIRM_ISSUES.includes(issue) ? 'confirm' as const : 'check' as const;
    const fixes: GroupFix[] = issue === 'changedInFile' || issue === 'editedInApp' ? ['update', 'noUpdate', 'review']
      : DATE_ISSUES.includes(issue) ? [...(issue === 'monthOnly' || issue === 'dateFromSheet' ? ['confirm' as const] : []), 'today', 'monthEnd', 'skip', 'review']
        : issue === 'noAmount' ? ['review']
          : state === 'confirm' ? ['confirm', 'skip', 'review'] : ['skip', 'review'];
    return { issue, rows: list, state, fixes, decided: list.every(row => included[row.key] !== undefined) };
  });
}

/** Rows the rules left out by themselves, by why: totals, blanks, repeated headers, duplicates, transfers, merged rows. */
export function quietCounts(rows: ImportRow[]): { issue: IssueCode; count: number }[] {
  const counts = new Map<IssueCode, number>();
  for (const row of rows) {
    if (primaryIssue(row)) continue;
    const issue = row.issues.find(code => QUIET_ISSUES.includes(code));
    if (issue) counts.set(issue, (counts.get(issue) ?? 0) + 1);
  }
  return [...counts.entries()].map(([issue, count]) => ({ issue, count }));
}

// ── applying a fix ──────────────────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
/** The date a date fix puts on a row: today, or the first or last day of the tab's month (this month when it has none). */
export function fixDate(mode: DateFix, today: string, sheetMonth: string | null, date?: string): string | null {
  if (mode === 'date') return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : null;
  if (mode === 'today') return today;
  const [year, month] = (sheetMonth ?? today.slice(0, 7)).split('-').map(Number);
  return mode === 'monthStart' ? `${year}-${pad(month)}-01` : `${year}-${pad(month)}-${pad(lastDay(year, month))}`;
}

const groupRows = (rows: ImportRow[], issue: IssueCode) => rows.filter(row => primaryIssue(row) === issue && (row.kind !== 'skip' || issue === 'noAmount'));

/** A group fix applied to the rows now in that group. Returns the state unchanged when nothing matched. */
export function applyGroupFix(state: ChatState, rows: ImportRow[], issue: IssueCode, fix: GroupFix, today: string, date?: string): ChatState {
  const list = groupRows(rows, issue);
  if (!list.length || fix === 'review') return state;
  if (fix === 'today' || fix === 'monthStart' || fix === 'monthEnd' || fix === 'date') {
    const monthOf = (row: ImportRow) => state.sheets.find(sheet => sheet.grid.name === row.sheet)?.analysis.sheetMonth ?? null;
    const edits = { ...state.edits };
    const included = { ...state.included };
    for (const row of list) {
      const value = fixDate(fix, today, monthOf(row), date);
      if (!value) return state;
      edits[row.key] = { ...edits[row.key], date: value };
      delete included[row.key];
    }
    return { ...state, edits, included };
  }
  const value = fix === 'skip' || fix === 'noUpdate' ? false : true;
  return { ...state, included: { ...state.included, ...Object.fromEntries(list.map(row => [row.key, value])) } };
}

/** เลขา's answer (already checked by the server and again here) applied by the same rules as a tap. */
export function applyActions(state: ChatState, rows: ImportRow[], actions: ChatAction[], today: string): { state: ChatState; applied: number } {
  let next = state, applied = 0;
  for (const action of actions) {
    const before = next;
    const sheetAt = 'sheet' in action ? next.sheets.findIndex(sheet => sheet.grid.name === action.sheet) : -1;
    if (action.type === 'setColumn' && sheetAt >= 0 && next.sheets[sheetAt].analysis.columns.some(c => c.index === action.column)) {
      next = { ...next, sheets: next.sheets.map((sheet, i) => (i === sheetAt ? withTarget(sheet, action.column, action.field) : sheet)) };
    } else if (action.type === 'setKind' && sheetAt >= 0) {
      next = { ...next, sheets: next.sheets.map((sheet, i) => (i === sheetAt ? { ...sheet, analysis: { ...sheet.analysis, kind: action.kind } } : sheet)) };
    } else if (action.type === 'includeSheet' && sheetAt >= 0 && !next.sheets[sheetAt].analysis.monthsAcross && next.sheets[sheetAt].analysis.dataRows.length) {
      next = { ...next, sheets: next.sheets.map((sheet, i) => (i === sheetAt ? { ...sheet, include: action.include } : sheet)) };
    } else if (action.type === 'fillDate') {
      next = applyGroupFix(next, rows, action.issue, action.mode, today, action.date);
    } else if (action.type === 'skipIssue') {
      next = applyGroupFix(next, rows, action.issue, 'skip', today);
    } else if (action.type === 'confirmIssue') {
      next = applyGroupFix(next, rows, action.issue, action.issue === 'changedInFile' || action.issue === 'editedInApp' ? 'update' : action.issue === 'noAmount' ? 'include' : 'confirm', today);
    } else if (action.type === 'amountsNet') {
      next = { ...next, amountsAreNet: action.value };
    }
    if (next !== before) applied += 1;
  }
  return { state: next, applied };
}

// ── what goes to เลขา when the person types ─────────────────────────────────────────────────────────────────────────

export const CHAT_LIMIT_PER_FILE = 10;

/** The file as เลขา sees it: tab names, columns with their current field and 3 short samples, and the groups' counts. */
export function chatContext(sheets: SheetState[], groups: IssueGroup[]) {
  return {
    sheets: sheets.slice(0, 8).map(sheet => ({
      name: sheet.grid.name.slice(0, 80), kind: sheet.analysis.kind, include: sheet.include, rows: sheet.analysis.dataRows.length,
      columns: sheet.analysis.columns.slice(0, 40).map(c => ({ index: c.index, header: c.header.slice(0, 80), target: c.target, samples: c.samples.slice(0, 3).map(s => s.slice(0, 60)) })),
    })),
    issues: groups.slice(0, 24).map(group => ({ code: group.issue, count: group.rows.length })),
  };
}

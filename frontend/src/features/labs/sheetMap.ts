import type { Job, StatusOption } from '../../../../shared/types';
import type { LiveTab, SheetMap, SheetMapTab } from '../../../../shared/googleSheets';
import { incomeRowsForYear } from '../../../../shared/incomeExport';
import { roundMoney } from '../../../../shared/wht';
import { analyzeSheet, buildImportPlan, defaultIncluded, planTotals, type ColumnTarget, type DataKind, type SheetAnalysis, type SheetGrid } from '../import/sheetImport';

// แผนที่ชีต (ฟีเจอร์ทดลอง, phase 2): the person's own Google Sheet read the same way the Excel import reads a file
// (sheetImport.ts): which row holds the headers, what each column is, which tabs are data and which are summaries. The
// person corrects it and saves it; formula columns are marked so phase 3 never writes into them. The overview totals
// come from the same reading (buildImportPlan) with the confirmed map, so they match what an import would count.

export interface TabReading {
  grid: SheetGrid;
  analysis: SheetAnalysis;
  /** Counted in the overview. */
  use: boolean;
  /** Columns the sheet's formulas fill (by column index). */
  formulas: Set<number>;
  truncated: boolean;
}

const STATUSES: StatusOption[] = [
  { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
  { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
  { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
];

/** Columns where a formula fills at least one data row (the header row itself does not count). */
export function formulaColumns(tab: LiveTab, analysis: SheetAnalysis): Set<number> {
  const out = new Set<number>();
  const rows = analysis.dataRows.length ? analysis.dataRows : tab.rows.map((_, index) => index).filter(index => index !== analysis.headerRow);
  for (const index of rows) tab.rows[index]?.forEach((cell, column) => { if (cell.formula) out.add(column); });
  return out;
}

/** Reads every tab, then lays a saved map over it: the person's header row, kind, tabs counted and column choices win
 *  wherever the sheet still has the same column header. */
export function readTabs(tabs: LiveTab[], saved?: SheetMap | null): TabReading[] {
  return tabs.map(tab => {
    const grid: SheetGrid = { name: tab.name, rows: tab.rows };
    const kept = saved?.tabs.find(item => item.name === tab.name);
    let analysis = analyzeSheet(grid, kept ? { headerRow: kept.headerRow } : {});
    if (kept) {
      analysis = {
        ...analysis,
        kind: kept.kind,
        columns: analysis.columns.map(column => {
          const choice = kept.columns.find(item => item.index === column.index && item.header === column.header);
          return choice ? { ...column, target: choice.target as ColumnTarget, reason: 'person' as const } : column;
        }),
      };
    }
    return { grid, analysis, use: kept ? kept.use : defaultIncluded(analysis), formulas: formulaColumns(tab, analysis), truncated: tab.truncated };
  });
}

/** A sheet made from one of our templates (สร้างชีตใหม่ให้): only the tabs the template names are written into and counted,
 *  as jobs and as expenses; budgets, reports and the cover are left alone. */
export function forTemplate(readings: TabReading[], writes: { job?: string; expense?: string }): TabReading[] {
  return readings.map(reading => {
    const kind: DataKind | null = reading.analysis.name === writes.job ? 'jobs' : reading.analysis.name === writes.expense ? 'expenses' : null;
    return kind ? { ...reading, use: true, analysis: { ...reading.analysis, kind } } : { ...reading, use: false };
  });
}

export function setTarget(reading: TabReading, index: number, target: ColumnTarget): TabReading {
  return { ...reading, analysis: { ...reading.analysis, columns: reading.analysis.columns.map(column => (column.index === index ? { ...column, target, reason: 'person' } : column)) } };
}
export const setKind = (reading: TabReading, kind: DataKind): TabReading => ({ ...reading, analysis: { ...reading.analysis, kind } });
export const setUse = (reading: TabReading, use: boolean): TabReading => ({ ...reading, use });

/** What is saved: per tab, the header row, kind, counted or not, and each column's field and formula mark. */
export function mapOf(fileId: string, readings: TabReading[]): SheetMap {
  const tabs: SheetMapTab[] = readings.map(({ analysis, use, formulas }) => ({
    name: analysis.name,
    headerRow: analysis.headerRow,
    kind: analysis.kind,
    use,
    columns: analysis.columns.map(column => ({ index: column.index, header: column.header.slice(0, 200), target: column.target, ...(formulas.has(column.index) ? { formula: true } : {}) })),
  }));
  return { fileId, at: new Date().toISOString(), tabs };
}

export interface SheetOverview {
  jobs: number;
  expenses: number;
  value: number;
  received: number;
  pending: number;
  expenseAmount: number;
  /** Twelve months of the year: money received (after withholding) and spent. */
  months: { month: number; received: number; spent: number }[];
  /** Years that have dated rows, newest first. */
  years: number[];
}

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Totals from the counted tabs, as the import would read them, and the chosen year month by month. */
export function overviewOf(readings: TabReading[], year: number): SheetOverview {
  const counted = readings.filter(reading => reading.use && reading.analysis.role === 'data');
  const plan = buildImportPlan(counted.map(({ grid, analysis }) => ({ grid, analysis })), { amountsAreNet: false, today: todayKey() },
    { statuses: STATUSES, jobTypes: [], existingJobs: [], existingExpenses: [] }, readings.map(reading => reading.grid));
  const included = (row: { state: string }) => row.state !== 'skip';
  const totals = planTotals(plan.rows, included);
  const rows = plan.rows.filter(included);
  const jobs = rows.filter(row => row.job).map((row, index) => ({ ...row.job!, id: `sheet-${index}` }) as Job);
  const expenses = rows.filter(row => row.expense).map(row => row.expense!);
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, received: 0, spent: 0 }));
  for (const income of incomeRowsForYear(jobs, year)) {
    const month = Number(income.date.slice(5, 7));
    months[month - 1].received = roundMoney(months[month - 1].received + income.received);
  }
  const years = new Set<number>();
  for (const expense of expenses) {
    const y = Number(expense.date?.slice(0, 4));
    if (y) years.add(y);
    if (y !== year) continue;
    const month = Number(expense.date.slice(5, 7));
    if (month >= 1 && month <= 12) months[month - 1].spent = roundMoney(months[month - 1].spent + (Number(expense.amount) || 0));
  }
  for (const job of jobs) for (const date of [job.payDate, job.postDate, job.depositDate]) { const y = Number(date?.slice(0, 4)); if (y) years.add(y); }
  return {
    jobs: totals.jobs, expenses: totals.expenses, value: totals.value, received: totals.received, pending: totals.pending, expenseAmount: totals.expenseAmount,
    months, years: [...years].filter(y => y > 1900 && y < 2200).sort((a, b) => b - a),
  };
}

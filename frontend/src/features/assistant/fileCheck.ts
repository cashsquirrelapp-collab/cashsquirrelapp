import type * as XLSXModule from 'xlsx';
import { readWorkbook } from '../import/readWorkbook';
import { analyzeSheet, buildImportPlan, defaultIncluded, planTotals, splitSideBySide, type ImportRow, type SheetGrid } from '../import/sheetImport';

// The check a spreadsheet gets in the เลขากระรอก chat (owner, 2026-11-04: "ถ้าเขาส่งมาแบบเป็นคอลัมน์เยอะๆ ... ตรวจเช็คว่ามันถูกต้อง
// ไหม ... ขึ้นหน้าแบบว่าเหมือนกำลังเช็คงาน ... แม่นยำ 100%"). It runs the import's own rules (sheetImport.ts) on the device:
// the same reading "ย้ายข้อมูลเข้าแอป" saves from, including each tab's own รวม rows checked against the rows read. Nothing is
// saved here; "บันทึกทั้งหมด" opens the import window with the file, where every row is shown before นำเข้า.

type XLSX = typeof XLSXModule;

export interface FileCheck {
  tabs: number; rows: number; columns: number;
  jobs: number; value: number; received: number; pending: number;
  paid: number; notDue: number; overdue: number;
  expenses: number; expenseTotal: number;
  /** Rows the import leaves out until the person looks at them (a guess, a possible double count). */
  toLook: number;
  /** Each tab's own total row compared with the rows read: how many were compared, how many agree. */
  totals: { compared: number; agree: number };
  /** What "บันทึกทั้งหมด" gives the import window: the file itself, or a CSV of a Word file's table. */
  importFile?: File;
}

/** Files the import window opens as they are. */
const IMPORT_OPENS = /\.(xlsx|xlsm|xls|csv|ods|numbers|txt)$/i;

/** The import's reading of these grids: what would be saved, as figures. Null when no row reads as a job or expense. */
export function checkGrids(grids: SheetGrid[], today: string): Omit<FileCheck, 'importFile'> | null {
  const prepared = grids.filter(grid => grid.rows.some(row => row.some(cell => cell.text))).flatMap(splitSideBySide);
  const sheets = prepared.map(grid => { const analysis = analyzeSheet(grid); return { grid, analysis, include: defaultIncluded(analysis) }; });
  const included = sheets.filter(sheet => sheet.include);
  if (!included.length) return null;
  const plan = buildImportPlan(included, { amountsAreNet: false, today }, { statuses: [], jobTypes: [], existingJobs: [], existingExpenses: [] }, prepared);
  // As the import window starts: ready and to-check rows go in; guesses and personal spending wait for a tick.
  const isIn = (row: ImportRow) => row.kind !== 'skip' && (row.state === 'ready' || row.state === 'check') && row.use !== 'personal';
  const totals = planTotals(plan.rows, isIn);
  if (!totals.jobs && !totals.expenses) return null;
  let paid = 0, notDue = 0, overdue = 0;
  for (const row of plan.rows) {
    if (!isIn(row) || row.update || !row.job) continue;
    if (!(row.job.pending > 0)) paid += 1;
    else if (row.job.payDate && row.job.payDate < today) overdue += 1;
    else notDue += 1;
  }
  return {
    tabs: included.length,
    rows: included.reduce((sum, sheet) => sum + sheet.analysis.dataRows.length, 0),
    columns: included.reduce((sum, sheet) => sum + sheet.analysis.columns.filter(column => column.target !== 'ignore').length, 0),
    jobs: totals.jobs, value: totals.value, received: totals.received, pending: totals.pending, paid, notDue, overdue,
    expenses: totals.expenses, expenseTotal: totals.expenseAmount,
    toLook: plan.rows.filter(row => row.kind !== 'skip' && row.state === 'confirm').length,
    totals: { compared: plan.checks.length, agree: plan.checks.filter(check => check.ok).length },
  };
}

const quote = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
/** A table as a CSV file the import window can open (UTF-8 with its mark, as Excel saves it). */
export function tableCsv(rows: string[][], name: string): File {
  return new File([`﻿${rows.map(row => row.map(quote).join(',')).join('\r\n')}`], name, { type: 'text/csv' });
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** A spreadsheet the chat was given: read as the import reads it. Undefined when it is not a list of jobs or expenses. */
export function checkSpreadsheet(xlsx: XLSX, data: ArrayBuffer, file: File, now = today()): FileCheck | undefined {
  try {
    const grids = readWorkbook(xlsx, data, file.name);
    const found = checkGrids(grids, now);
    if (!found) return undefined;
    // A tab the import window cannot open as it is (.xlsb, .tsv) goes to it as a CSV when there is one table.
    const single = grids.filter(grid => grid.rows.some(row => row.some(cell => cell.text)));
    const importFile = IMPORT_OPENS.test(file.name) ? file
      : single.length === 1 ? tableCsv(single[0].rows.map(row => row.map(cell => cell.text)), `${file.name.replace(/\.[^.]+$/, '')}.csv`) : undefined;
    return { ...found, ...(importFile ? { importFile } : {}) };
  } catch { return undefined; }
}

/** The tables of a Word file: the largest one that reads as jobs or expenses, checked, with a CSV of it to import. */
export function checkTables(tables: string[][][], fileName: string, now = today()): FileCheck | undefined {
  const ranked = tables.filter(table => table.length >= 2).sort((a, b) => b.length - a.length);
  for (const table of ranked) {
    const grid: SheetGrid = { name: 'ตาราง', rows: table.map(row => row.map(text => ({ raw: text, text }))) };
    const found = checkGrids([grid], now);
    if (found) return { ...found, importFile: tableCsv(table, `${fileName.replace(/\.[^.]+$/, '')} (ตาราง).csv`) };
  }
  return undefined;
}

const baht = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
/** The check in words for เลขา, at the top of the file's text: these figures, and the button under the file. */
export function checkForAssistant(check: FileCheck): string {
  const jobs = check.jobs
    ? `งาน ${check.jobs} รายการ มูลค่ารวม ${baht(check.value)} บาท รับแล้ว ${baht(check.received)} ค้างรับ ${baht(check.pending)} (รับครบ ${check.paid} · ยังไม่ถึงกำหนด ${check.notDue} · เกินกำหนด ${check.overdue})`
    : '';
  const expenses = check.expenses ? `รายจ่าย ${check.expenses} รายการ รวม ${baht(check.expenseTotal)} บาท` : '';
  const look = check.toLook ? ` · มี ${check.toLook} แถวที่ต้องให้ผู้ใช้เลือกก่อนนำเข้า` : '';
  const totals = check.totals.compared ? ` · ยอดตรงกับแถวรวมในไฟล์ ${check.totals.agree}/${check.totals.compared}` : '';
  const button = check.importFile
    ? ' ใต้ไฟล์ในแชตมีปุ่ม "บันทึกทั้งหมด" ที่เปิดหน้าย้ายข้อมูลเข้าแอปพร้อมไฟล์นี้ ตรวจทีละแถวแล้วนำเข้าได้ครบในครั้งเดียว ย้อนกลับได้ ให้ใช้ตัวเลขชุดนี้ และแนะนำปุ่มนั้นแทนการเตรียมการ์ดทีละแถว เว้นแต่ผู้ใช้ขอเฉพาะบางรายการ'
    : '';
  return `แอปตรวจไฟล์นี้ด้วยระบบนำเข้าแล้ว: ${[jobs, expenses].filter(Boolean).join(' · ')}${look}${totals}.${button}`;
}

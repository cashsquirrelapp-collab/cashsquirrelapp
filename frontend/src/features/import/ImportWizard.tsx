import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import type { Expense, Job, StatusOption } from '../../../../shared/types';
import { roundMoney, whtAmountFor } from '../../../../shared/wht';
import { calculatePayDate } from '../../../../shared/calendar';
import { Modal } from '../../components/ui/Modal';
import { Mascot } from '../../components/mascot/Mascot';
import { uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { formatCurrency } from '../../utils';
import { tr, T } from '../../i18n/tr';
import { categoryText } from '../incomeExpense/ExpenseDrawer';
import {
  CONFIRM_ISSUES, analyzeSheet, buildImportPlan, codeNamesOf, compareMetrics, defaultIncluded, needsConfirmation, planDetails, planTotals, splitSideBySide, stateOf,
  MAX_IMPORT_ROWS, normalizeHeader, parseDateText,
  type ColumnGuess, type ColumnTarget, type DataKind, type ImportedExpense, type ImportedJob, type ImportRow, type ImportSource, type IssueCode,
  type MetricField, type SheetAnalysis, type SheetGrid,
} from './sheetImport';
import { fileFingerprint, fileKind, readWorkbook } from './readWorkbook';
import { downloadImportTemplate } from './importTemplate';
import { importedLabel } from './importBatches';

// "นำเข้าจาก Excel" (owner, 2026-10-22, free for every account): pick a file, check how its columns
// match ours, review every row against the file's own totals, then import. Rows where the app had to
// guess wait for the person to tick them. Computers and iPads only; the phone layout is unchanged.

export type SaveOutcome = { state: 'saved' | 'local' } | { state: 'failed'; error: string };
export interface ImportCommit {
  jobs: (ImportedJob & { importSource?: ImportSource })[];
  expenses: (ImportedExpense & { importSource?: ImportSource })[];
  newJobTypes: string[];
  /** Rows already in the app that the file changes: the fields before and after. */
  updates: { table: 'jobs' | 'expenses'; id: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
}
export interface ImportResult { batchId: string; jobs: number; expenses: number; updates: number; saved: Promise<SaveOutcome> }

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: Job[];
  expenses: Expense[];
  statuses: StatusOption[];
  jobTypes: string[];
  /** Adds and updates the rows; the result says when the save reached the server. */
  onImport: (commit: ImportCommit) => ImportResult;
  onRetrySave: (batchId: string) => Promise<SaveOutcome>;
  /** Restores the app's own .json backup (asks before replacing data). */
  onRestoreBackup?: (text: string) => void;
  onUndo: (batchId: string) => void;
  onViewJobs: () => void;
}

type Step = 'file' | 'map' | 'review' | 'done';
interface SheetState { grid: SheetGrid; analysis: SheetAnalysis; include: boolean }
interface RowEdit { name?: string; amount?: string; date?: string }
type Filter = 'all' | 'confirm' | 'check' | 'update' | 'skip';

const FIELD_LABELS: Record<ColumnTarget, string> = {
  name: T("ชื่องาน / รายการ"), client: T("ลูกค้า"), type: T("ประเภทงาน"), category: T("หมวดหมู่"),
  value: T("มูลค่างาน"), amount: T("ยอดเงิน"), received: T("ยอดที่รับแล้ว"), pending: T("ยอดค้างรับ"),
  income: T("รายรับ"), expense: T("รายจ่าย"), whtRate: T("หัก ณ ที่จ่าย (%)"), whtAmount: T("หัก ณ ที่จ่าย (บาท)"),
  status: T("สถานะ"), kind: T("ประเภทรายการ (รับ/จ่าย)"), date: T("วันที่"), postDate: T("วันส่งงาน"),
  dueDate: T("วันครบกำหนดรับเงิน"), paidDate: T("วันที่รับเงิน"), creditTerm: T("เครดิต (วัน)"), note: T("หมายเหตุ"),
  project: T("โปรเจกต์ที่เกี่ยวข้อง"), installment: T("งวด"), installmentStatus: T("สถานะงวด"), use: T("ธุรกิจ / ส่วนตัว"),
  keep: T("เก็บไว้ในหมายเหตุ"), ignore: T("ไม่ใช้"),
};
const FIELDS_FOR: Record<DataKind, ColumnTarget[]> = {
  jobs: ['name', 'client', 'project', 'type', 'value', 'amount', 'received', 'pending', 'whtRate', 'whtAmount', 'status', 'installment', 'installmentStatus', 'date', 'postDate', 'dueDate', 'paidDate', 'creditTerm', 'note', 'keep', 'ignore'],
  expenses: ['name', 'category', 'project', 'amount', 'date', 'use', 'note', 'keep', 'ignore'],
  mixed: ['kind', 'name', 'project', 'client', 'category', 'income', 'expense', 'amount', 'date', 'use', 'note', 'keep', 'ignore'],
};
const KIND_LABELS: Record<DataKind, string> = { jobs: T("งาน / รายรับ"), expenses: T("รายจ่าย"), mixed: T("รายรับและรายจ่ายปนกัน") };
const ISSUE_LABELS: Record<IssueCode, string> = {
  noName: T("ไม่มีชื่องาน"), noAmount: T("ไม่มียอดเงิน"), negative: T("ยอดติดลบ ใช้เป็นยอดบวก"), noDate: T("ไม่มีวันที่"),
  dateFromSheet: T("ใช้เดือนจากชื่อแท็บ"), dateUnreadable: T("อ่านวันที่ไม่ได้"), amountUnreadable: T("อ่านยอดเงินไม่ได้"),
  valueFromParts: T("มูลค่า = รับแล้ว + ค้างรับ"), paidWithoutDate: T("รับเงินแล้วแต่ไม่มีวันที่รับ"),
  statusConflict: T("สถานะไม่ตรงกับยอดเงิน"), partialNoAmount: T("มัดจำแต่ไม่มียอดที่รับ"), duplicate: T("มีอยู่ในแอปแล้ว"),
  duplicateInFile: T("ซ้ำกับแถวก่อนหน้าในไฟล์"), monthOnly: T("มีแค่เดือน ใช้วันที่ 1"), paidDateFromDate: T("ใช้วันที่ในไฟล์เป็นวันรับเงิน"), total: T("แถวรวมยอด"), repeatedHeader: T("หัวตารางซ้ำ"), blank: T("แถวว่าง"),
  transfer: T("โอนระหว่างบัญชีตัวเอง ไม่ใช่รายรับหรือรายจ่าย"), merged: T("รวมเข้ากับงานในแท็บอื่นแล้ว"), sameNameOtherSheet: T("ชื่อเดียวกับงานในแท็บอื่น ตรวจว่าไม่ซ้ำ"),
  foreignCurrency: T("ยอดเงินไม่ใช่บาท ตรวจสกุลเงินก่อน"), alreadyImported: T("เคยนำเข้าแล้ว"), changedInFile: T("ไฟล์มีข้อมูลใหม่กว่า จะอัปเดตรายการเดิม"), editedInApp: T("รายการนี้สร้างหรือแก้ไขในแอป ตรวจก่อนอัปเดต"),
};
const QUIET_ISSUES: IssueCode[] = ['duplicate', 'alreadyImported', 'total', 'blank', 'repeatedHeader', 'merged', 'transfer'];
const REASON_LABELS: Record<NonNullable<ColumnGuess['reason']>, string> = {
  header: T("หัวตารางตรงกับช่องนี้"), headerPartial: T("หัวตารางใกล้เคียง"), code: T("รหัส แปลงเป็นชื่อจากแท็บอื่น"),
  valuesStrong: T("ข้อมูลในคอลัมน์บอกชัด"), values: T("เดาจากข้อมูล คุณยืนยันแล้ว"), person: T("คุณเลือกเอง"),
  remembered: T("ตามที่เลือกไว้ครั้งก่อน"), none: T("เก็บไว้ในหมายเหตุ"),
};
const METRIC_LABELS: Record<MetricField, string> = {
  received: T("รับแล้ว"), pending: T("ค้างรับ"), value: T("มูลค่างาน"), expense: T("รายจ่าย"), expenseBusiness: T("รายจ่ายธุรกิจ"),
  expensePersonal: T("รายจ่ายส่วนตัว"), transfers: T("เงินโอนเข้าบัญชีตัวเอง (ไม่นับ)"), jobs: T("จำนวนงาน"),
};
const UPDATE_LABELS: Record<string, string> = {
  value: T("มูลค่างาน"), whtRate: T("หัก ณ ที่จ่าย (%)"), whtAmount: T("หัก ณ ที่จ่าย (บาท)"), received: T("ยอดที่รับแล้ว"), pending: T("ยอดค้างรับ"),
  payDate: T("วันรับเงิน / ครบกำหนด"), depositDate: T("วันที่รับมัดจำ"), depositAmount: T("ยอดมัดจำ"), creditTerm: T("เครดิต (วัน)"),
  installments: T("งวด"), status: T("สถานะ"), paymentStatus: T("การรับเงิน"), name: T("ชื่อ"), amount: T("ยอดเงิน"), date: T("วันที่"), category: T("หมวดหมู่"),
};
const MONEY_UPDATE_FIELDS = new Set(['value', 'whtAmount', 'received', 'pending', 'depositAmount', 'amount']);
const MAPPINGS_KEY = 'cashflow_import_mappings';
const PAGE = 100;

const sheetSignature = (analysis: SheetAnalysis) => analysis.columns.map(c => normalizeHeader(c.header)).join('|');
function readMappings(): Record<string, { kind: DataKind; targets: Record<string, ColumnTarget> }> {
  try { return JSON.parse(localStorage.getItem(MAPPINGS_KEY) || '{}'); } catch { return {}; }
}
function rememberMapping(analysis: SheetAnalysis) {
  try {
    const all = readMappings();
    all[sheetSignature(analysis)] = { kind: analysis.kind, targets: Object.fromEntries(analysis.columns.map(c => [normalizeHeader(c.header) || `#${c.index}`, c.target])) };
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 20))) delete all[key];
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
  } catch { /* remembering is a convenience */ }
}
function applyRemembered(analysis: SheetAnalysis): SheetAnalysis {
  const saved = readMappings()[sheetSignature(analysis)];
  if (!saved || analysis.headerRow === null) return analysis;
  return {
    ...analysis, kind: saved.kind,
    columns: analysis.columns.map(c => {
      const target = saved.targets[normalizeHeader(c.header) || `#${c.index}`];
      return target === undefined ? c : { ...c, target, confidence: 1, reason: 'remembered' as const };
    }),
  };
}

const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const columnLetter = (index: number) => { let s = '', n = index + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sourceLink = (row: ImportRow): ImportSource | undefined => {
  if (!row.source) return undefined;
  const { cells: _cells, ...link } = row.source;
  return link;
};

/** A row with the person's edits applied, money and due date recomputed like the job form does. */
function editedRow(row: ImportRow, edit: RowEdit | undefined): ImportRow {
  if (!edit || row.update) return row;
  const issues = row.issues.filter(issue => !((issue === 'noName' && edit.name) || ((issue === 'noAmount' || issue === 'amountUnreadable') && edit.amount) || ((issue === 'noDate' || issue === 'dateUnreadable' || issue === 'dateFromSheet' || issue === 'monthOnly') && edit.date)));
  const next = { ...row, ...(row.kind === 'skip' ? { issues } : stateOf(issues)) };
  const amount = edit.amount !== undefined ? Math.max(0, Number(edit.amount.replace(/,/g, '')) || 0) : undefined;
  const date = edit.date ? parseDateText(edit.date) || edit.date : undefined;
  if (row.expense) {
    return { ...next, expense: { ...row.expense, ...(edit.name ? { name: edit.name.slice(0, 500) } : {}), ...(amount !== undefined ? { amount: roundMoney(amount) } : {}), ...(date ? { date } : {}) } };
  }
  if (!row.job) return next;
  const job = { ...row.job, ...(edit.name ? { name: edit.name.slice(0, 500) } : {}) };
  if (amount !== undefined) {
    const rate = job.whtRate || 0;
    job.value = roundMoney(amount);
    job.whtAmount = whtAmountFor(job.value, rate);
    const net = roundMoney(job.value - job.whtAmount);
    if (job.status === 'done' || job.paymentStatus === 'paid') job.received = net;
    job.received = Math.min(job.received, net);
    job.pending = Math.max(0, roundMoney(net - job.received));
  }
  if (date) {
    job.postDate = date;
    if (job.paymentStatus !== 'paid') job.payDate = calculatePayDate(date, job.creditTerm, false);
  }
  return { ...next, job };
}

/** A value as the detail panel shows it. */
function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'installments' && Array.isArray(value)) return tr("{0} งวด", value.length);
  if (MONEY_UPDATE_FIELDS.has(field) && typeof value === 'number') return formatCurrency(value);
  if (field === 'status' || field === 'paymentStatus') return value === 'done' || value === 'paid' ? tr("รับครบแล้ว") : value === 'partial' || value === 'installment' ? tr("รับบางส่วน") : tr("ยังไม่จ่าย");
  if (field === 'category') return categoryText(String(value));
  return String(value);
}

export function ImportWizard({ open, onClose, jobs, expenses, statuses, jobTypes, onImport, onRetrySave, onRestoreBackup, onUndo, onViewJobs }: Props) {
  const [step, setStep] = React.useState<Step>('file');
  const [fileName, setFileName] = React.useState('');
  const [fingerprint, setFingerprint] = React.useState('');
  const [sheets, setSheets] = React.useState<SheetState[]>([]);
  const [active, setActive] = React.useState(0);
  const [amountsAreNet, setAmountsAreNet] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [included, setIncluded] = React.useState<Record<string, boolean>>({});
  const [includePersonal, setIncludePersonal] = React.useState(true);
  const [edits, setEdits] = React.useState<Record<string, RowEdit>>({});
  const [filter, setFilter] = React.useState<Filter>('all');
  const [shownRows, setShownRows] = React.useState(PAGE);
  const [openRow, setOpenRow] = React.useState<string | null>(null);
  const [showChecks, setShowChecks] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [saveState, setSaveState] = React.useState<'saving' | SaveOutcome>('saving');
  const [undone, setUndone] = React.useState(false);

  const reset = () => {
    setStep('file'); setFileName(''); setFingerprint(''); setSheets([]); setActive(0); setAmountsAreNet(false); setError(''); setIncluded({}); setEdits({});
    setIncludePersonal(true); setFilter('all'); setShownRows(PAGE); setOpenRow(null); setShowChecks(false); setResult(null); setSaveState('saving'); setUndone(false);
  };
  const close = () => { reset(); onClose(); };

  const readFile = async (file: File) => {
    setError('');
    // The app's own backup: restored as a whole, after the same confirmation as before.
    if (onRestoreBackup && /\.json$/i.test(file.name)) {
      if (file.size > 8 * 1024 * 1024) { setError(tr("ไฟล์มีขนาดใหญ่เกินไป")); return; }
      const text = await file.text();
      try { JSON.parse(text); } catch { setError(tr("ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง")); return; }
      close();
      onRestoreBackup(text);
      return;
    }
    if (!/\.(xlsx|xlsm|xls|csv|ods|txt|numbers)$/i.test(file.name)) { setError(onRestoreBackup ? tr("รองรับไฟล์ Excel (.xlsx .xls) CSV .ods และไฟล์สำรอง .json") : tr("รองรับไฟล์ Excel (.xlsx .xls) CSV และ .ods")); return; }
    if (file.size > 15 * 1024 * 1024) { setError(tr("ไฟล์ใหญ่เกิน 15 MB กรุณาแบ่งเป็นหลายไฟล์")); return; }
    setReading(true);
    try {
      const data = await file.arrayBuffer();
      // The file's own bytes must say spreadsheet or text, whatever its name says.
      if (!fileKind(data, file.name)) { setError(tr("ไฟล์นี้ไม่ใช่ไฟล์ Excel หรือ CSV ที่อ่านได้ กรุณาเลือกไฟล์ที่บันทึกจาก Excel, Google Sheets หรือ Numbers")); return; }
      const XLSX = await import('xlsx');
      const grids = readWorkbook(XLSX, data, file.name).filter(grid => grid.rows.some(row => row.some(cell => cell.text))).flatMap(splitSideBySide);
      if (!grids.length) { setError(tr("ไม่พบข้อมูลในไฟล์นี้")); return; }
      const next = grids.map(grid => {
        const analysis = applyRemembered(analyzeSheet(grid));
        return { grid, analysis, include: defaultIncluded(analysis) };
      });
      setFingerprint(await fileFingerprint(data).catch(() => ''));
      setSheets(next);
      setActive(Math.max(0, next.findIndex(s => s.include)));
      setFileName(file.name);
      setStep('map');
    } catch {
      setError(tr("เปิดไฟล์นี้ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกเป็น .xlsx หรือ .csv แล้วเลือกใหม่"));
    } finally {
      setReading(false);
    }
  };

  const updateSheet = (index: number, change: (sheet: SheetState) => SheetState) => setSheets(list => list.map((sheet, i) => (i === index ? change(sheet) : sheet)));
  const setTarget = (col: number, target: ColumnTarget) => updateSheet(active, sheet => ({
    ...sheet,
    analysis: { ...sheet.analysis, columns: sheet.analysis.columns.map(c => (c.index === col ? { ...c, target, confidence: 1, reason: 'person' as const } : target !== 'keep' && target !== 'ignore' && target !== 'note' && c.target === target ? { ...c, target: 'keep', reason: 'none' as const } : c)) },
  }));
  const confirmColumn = (col: number) => updateSheet(active, sheet => ({
    ...sheet, analysis: { ...sheet.analysis, columns: sheet.analysis.columns.map(c => (c.index === col ? { ...c, confidence: 1, reason: 'person' as const } : c)) },
  }));

  // The same file came in before: its rows are recognised and not imported twice.
  const earlier = React.useMemo(() => {
    if (!fingerprint) return null;
    const row = [...jobs, ...expenses].find(item => (item as { importSource?: ImportSource }).importSource?.fingerprint === fingerprint) as { importedAt?: string } | undefined;
    return row ? row.importedAt || '' : null;
  }, [fingerprint, jobs, expenses]);

  const plan = React.useMemo(() => (step === 'review' || step === 'done'
    ? buildImportPlan(sheets.filter(s => s.include), { amountsAreNet, today: todayKey(), ...(fingerprint ? { source: { fileName, fingerprint } } : {}) },
      { statuses, jobTypes, existingJobs: jobs, existingExpenses: expenses }, sheets.map(s => s.grid))
    : null), [step === 'review' || step === 'done' ? sheets : null, amountsAreNet, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = React.useMemo(() => (plan ? plan.rows.map(row => editedRow(row, edits[row.key])) : []), [plan, edits]);
  const isIncluded = React.useCallback((row: ImportRow) => row.kind !== 'skip'
    && (included[row.key] ?? ((row.state === 'ready' || row.state === 'check') && (includePersonal || row.use !== 'personal'))), [included, includePersonal]);
  const totals = React.useMemo(() => planTotals(rows, isIncluded), [rows, isIncluded]);
  const details = React.useMemo(() => planDetails(rows, isIncluded), [rows, isIncluded]);
  const totalRows = sheets.filter(s => s.include).reduce((sum, s) => sum + s.analysis.dataRows.length, 0);

  // Every figure the file states (its total rows, its dashboard) against what is about to be imported.
  const reconciliation = React.useMemo(() => {
    if (!plan) return [];
    const byTotalRow = plan.checks.map(check => ({ key: `t:${check.sheet}:${check.field}`, label: tr("แถวรวม แท็บ {0} · {1}", check.sheet, tr(FIELD_LABELS[check.field])), file: check.fileTotal, imported: check.rowsTotal, ok: check.ok, count: false }));
    const byMetric = compareMetrics(plan.metrics, totals, details, plan.transfersTotal).map(check => ({ key: `m:${check.sheet}:${check.label}`, label: tr("แท็บ {0} · {1} ({2})", check.sheet, check.label, tr(METRIC_LABELS[check.field])), file: check.fileValue, imported: check.importValue, ok: check.ok, count: check.field === 'jobs' }));
    return [...byTotalRow, ...byMetric];
  }, [plan, totals, details]);
  const unreconciled = roundMoney(reconciliation.filter(check => !check.ok && !check.count).reduce((sum, check) => sum + Math.abs(check.file - check.imported), 0));

  const startReview = () => {
    for (const sheet of sheets) if (sheet.include) rememberMapping(sheet.analysis);
    setIncluded({}); setEdits({}); setFilter('all'); setShownRows(PAGE); setOpenRow(null); setStep('review');
  };

  const commit = () => {
    const chosen = rows.filter(isIncluded);
    const fresh = chosen.filter(r => !r.update);
    const importJobs = fresh.filter(r => r.job).map(r => ({ ...r.job!, ...(sourceLink(r) ? { importSource: sourceLink(r) } : {}) }));
    const importExpenses = fresh.filter(r => r.expense && r.expense.date).map(r => ({ ...r.expense!, ...(sourceLink(r) ? { importSource: sourceLink(r) } : {}) }));
    const updates = chosen.filter(r => r.update).map(r => {
      const existing = [...jobs, ...expenses].find(item => item.id === r.update!.id) as { importSource?: ImportSource } | undefined;
      return {
        table: r.job ? 'jobs' as const : 'expenses' as const, id: r.update!.id,
        before: { ...r.update!.before, importSource: existing?.importSource ?? null },
        after: { ...r.update!.after, ...(sourceLink(r) ? { importSource: sourceLink(r) } : {}) },
      };
    });
    const usedTypes = new Set(importJobs.map(j => j.type));
    const next = onImport({ jobs: importJobs, expenses: importExpenses, newJobTypes: (plan?.newJobTypes || []).filter(type => usedTypes.has(type)), updates });
    setResult(next);
    setSaveState('saving');
    void next.saved.then(setSaveState);
    setStep('done');
  };
  const retrySave = () => {
    if (!result) return;
    setSaveState('saving');
    void onRetrySave(result.batchId).then(setSaveState);
  };

  const sheet = sheets[active];
  const fieldsForSheet = sheet ? FIELDS_FOR[sheet.analysis.kind] : [];
  const missingName = sheet && sheet.include && !sheet.analysis.columns.some(c => ['name', 'client', 'category'].includes(c.target));
  const missingAmount = sheet && sheet.include && !sheet.analysis.columns.some(c => ['value', 'amount', 'received', 'pending', 'income', 'expense'].includes(c.target));
  const hasWht = sheets.some(s => s.include && s.analysis.columns.some(c => c.target === 'whtRate' || c.target === 'whtAmount'));
  // Columns read from their values alone, where money or dates come from: confirmed before the review.
  const toConfirm = sheets.flatMap(s => (s.include ? s.analysis.columns.filter(needsConfirmation).map(c => `${s.grid.name}: ${c.header || columnLetter(c.index)}`) : []));

  const isUpdate = (row: ImportRow) => Boolean(row.update);
  const counts = {
    read: rows.length,
    create: rows.filter(row => isIncluded(row) && !row.update && !(row.expense && !row.expense.date)).length,
    update: rows.filter(row => isIncluded(row) && row.update).length,
    duplicate: rows.filter(row => row.issues.some(issue => issue === 'duplicate' || issue === 'alreadyImported' || issue === 'duplicateInFile')).length,
    confirm: rows.filter(row => row.state === 'confirm' && included[row.key] === undefined).length,
    check: rows.filter(row => isIncluded(row) && !row.update && row.issues.length > 0).length,
    skip: rows.filter(row => !isIncluded(row)).length,
  };
  const visibleRows = rows.filter(row => filter === 'all' ? true : filter === 'skip' ? !isIncluded(row) : filter === 'confirm' ? row.state === 'confirm'
    : filter === 'update' ? isUpdate(row) : isIncluded(row) && !row.update && row.issues.length > 0);
  const missingExpenseDates = rows.filter(row => isIncluded(row) && row.expense && !row.update && !row.expense.date).length;
  const personalRows = rows.filter(row => row.expense && row.use === 'personal' && row.state !== 'skip');
  const personalTotal = roundMoney(personalRows.reduce((sum, row) => sum + row.expense!.amount, 0));
  const newExpenses = Math.max(0, totals.expenses - missingExpenseDates);
  // Rows waiting for the person, grouped by why, so a long sheet can be confirmed a group at a time.
  const confirmGroups = (() => {
    const groups = new Map<IssueCode, ImportRow[]>();
    for (const row of rows) {
      if (row.state !== 'confirm' || included[row.key] !== undefined) continue;
      const issue = row.issues.find(code => CONFIRM_ISSUES.includes(code));
      if (issue) (groups.get(issue) ?? groups.set(issue, []).get(issue)!).push(row);
    }
    return [...groups.entries()];
  })();

  const header = (title: string, sub: string) => (
    <div className="border-b border-brand-border px-6 pb-4 pt-5 pr-12">
      <p className="text-[12px] font-medium text-[#C24A16] dark:text-[#FF9A6B]">{tr("นำเข้าจาก Excel")}</p>
      <h2 className="mt-0.5 text-[20px] font-semibold text-brand-text">{title}</h2>
      <p className="mt-1 text-[13px] text-brand-muted">{sub}</p>
    </div>
  );
  const stepper = (
    <ol className="flex items-center gap-2 px-6 pt-3 text-[12px]" aria-label={tr("ขั้นตอน")}>
      {([['file', T("เลือกไฟล์")], ['map', T("จับคู่คอลัมน์")], ['review', T("ตรวจทาน")], ['done', T("เสร็จ")]] as const).map(([key, label], i, all) => {
        const index = all.findIndex(([k]) => k === step);
        return (
          <li key={key} className="flex items-center gap-2" aria-current={key === step ? 'step' : undefined}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${i <= index ? 'bg-[#E65F2B] text-white' : 'bg-brand-faint text-brand-muted'}`}>{i + 1}</span>
            <span className={i === index ? 'font-medium text-brand-text' : 'text-brand-muted'}>{tr(label)}</span>
            {i < all.length - 1 && <span className="mx-1 h-px w-6 bg-brand-border" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
  const chip = 'rounded-md px-1.5 py-0.5 text-[11px]';
  const amber = 'bg-[#FAEEDA] text-[#8A5A0B]';
  const green = 'bg-[#E9F7F0] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]';

  /** Where a row came from and what it becomes: the file's cells, the fields they went to, and why. */
  const rowDetail = (row: ImportRow) => {
    const job = row.job, expense = row.expense;
    const saved: [string, string][] = job ? [
      [T("ชื่อ"), job.name], [T("ลูกค้า"), job.client || '—'], [T("ประเภทงาน"), tr(job.type)], [T("มูลค่างาน"), formatCurrency(job.value)],
      [T("หัก ณ ที่จ่าย"), job.whtRate ? `${job.whtRate}% · ${formatCurrency(job.whtAmount || 0)}` : '—'], [T("ยอดที่รับแล้ว"), formatCurrency(job.received)],
      [T("ยอดค้างรับ"), formatCurrency(job.pending)], [T("วันส่งงาน"), job.postDate || '—'], [job.paymentStatus === 'paid' ? T("วันที่รับเงิน") : T("วันครบกำหนดรับเงิน"), job.payDate || '—'],
      ...(job.depositAmount ? [[T("มัดจำ"), `${formatCurrency(job.depositAmount)} · ${job.depositDate || '—'}`] as [string, string]] : []),
      ...(job.installments?.length ? [[T("งวด"), job.installments.map(i => `${formatCurrency(i.amount)} ${i.status === 'paid' ? tr("รับแล้ว {0}", i.paidAt || '') : tr("ครบกำหนด {0}", i.dueDate || '—')}`).join(' · ')] as [string, string]] : []),
      [T("หมายเหตุ"), job.note || '—'],
    ] : expense ? [
      [T("ชื่อ"), expense.name], [T("หมวดหมู่"), categoryText(expense.category)], [T("ยอดเงิน"), formatCurrency(expense.amount)], [T("วันที่"), expense.date || '—'],
      ...(row.use ? [[T("ธุรกิจ / ส่วนตัว"), row.use === 'personal' ? tr("ส่วนตัว") : tr("ธุรกิจ")] as [string, string]] : []),
      [T("หมายเหตุ"), expense.note || '—'],
    ] : [];
    return (
      <div className="grid gap-4 bg-brand-faint/40 px-4 py-4 lg:grid-cols-2" data-testid="import-row-detail">
        <div>
          <p className="mb-2 text-[12px] font-medium text-brand-muted">{tr("ในไฟล์ · แท็บ {0} แถว {1}", row.sheet, row.rowNumber)}{row.source?.ref ? ` · ${row.source.ref}` : ''}</p>
          {row.source?.cells.length ? (
            <table className="w-full table-fixed text-left text-[12px]">
              <tbody>
                {row.source.cells.map((cell, i) => (
                  <tr key={i} className="border-t border-brand-border first:border-t-0">
                    <td className="w-[28%] truncate py-1.5 pr-2 text-brand-muted" title={cell.header}>{cell.header}</td>
                    <td className="truncate py-1.5 pr-2 text-brand-text" title={cell.text}>{cell.text}</td>
                    <td className="w-[34%] py-1.5 text-brand-muted">{tr(FIELD_LABELS[cell.target])}{cell.target !== 'keep' && cell.target !== 'ignore' && <span className="block text-[11px]">{tr(REASON_LABELS[cell.reason])}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[12px] text-brand-muted">—</p>}
        </div>
        <div>
          <p className="mb-2 text-[12px] font-medium text-brand-muted">{row.update ? tr("เปลี่ยนรายการที่มีอยู่ในแอป") : tr("จะบันทึกเป็น")}</p>
          {row.update ? (
            <table className="w-full table-fixed text-left text-[12px]">
              <thead className="text-brand-muted"><tr><th className="w-[34%] pb-1 font-medium" /><th className="pb-1 font-medium">{tr("ตอนนี้ในแอป")}</th><th className="pb-1 font-medium">{tr("ตามไฟล์")}</th></tr></thead>
              <tbody>
                {Object.keys(row.update.after).map(field => (
                  <tr key={field} className="border-t border-brand-border">
                    <td className="py-1.5 pr-2 text-brand-muted">{tr(UPDATE_LABELS[field] || field)}</td>
                    <td className="py-1.5 pr-2 text-brand-muted line-through decoration-brand-border">{shown(field, row.update!.before[field])}</td>
                    <td className="py-1.5 font-medium text-brand-text">{shown(field, row.update!.after[field])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <dl className="grid grid-cols-[34%_1fr] gap-x-2 gap-y-1 text-[12px]">
              {saved.map(([label, value]) => (<React.Fragment key={label}><dt className="text-brand-muted">{tr(label)}</dt><dd className="break-words text-brand-text">{value}</dd></React.Fragment>))}
            </dl>
          )}
          {row.mergedFrom?.length ? <p className="mt-2 text-[12px] text-brand-muted">{tr("รวมข้อมูลจาก {0} จึงนับครั้งเดียว", row.mergedFrom.join(', '))}</p> : null}
          {row.mergedInto ? <p className="mt-2 text-[12px] text-brand-muted">{tr("แถวนี้รวมอยู่ใน {0} แล้ว จึงไม่นับซ้ำ", row.mergedInto)}</p> : null}
        </div>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={close} label={tr("นำเข้าจาก Excel")} width={1080}>
      <div className="flex max-h-[86vh] flex-col" data-testid="import-wizard">
        {step === 'file' && (<>
          {header(tr("นำข้อมูลเดิมเข้าแอป"), tr("งานและรายจ่ายที่เคยจดไว้ใน Excel หรือ Google Sheets นำเข้าได้ในครั้งเดียว ไม่ต้องกรอกใหม่"))}
          {stepper}
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files?.[0]; if (file) void readFile(file); }}
              className={`rounded-2xl border-2 border-dashed transition-colors ${dragging ? 'border-[#E65F2B] bg-[#FFF5EE] dark:bg-[#E65F2B]/10' : 'border-brand-border bg-brand-faint/50 hover:border-[#F3B08C]'}`}>
              <input type="file" id="import-sheet-file" accept={`.xlsx,.xlsm,.xls,.csv,.ods,.txt${onRestoreBackup ? ',.json' : ''}`} className="hidden" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void readFile(file); }} />
              <label htmlFor="import-sheet-file" className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-2 p-6 text-center">
                <FileSpreadsheet className="h-8 w-8 text-[#E65F2B]" />
                <span className="text-[15px] font-medium text-brand-text">{reading ? tr("กำลังอ่านไฟล์…") : tr("ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์")}</span>
                <span className="text-[12px] text-brand-muted">{tr("Excel (.xlsx .xls) · CSV · .ods · Google Sheets: ดาวน์โหลดเป็น .xlsx ก่อน")}</span>
                {onRestoreBackup && <span className="text-[12px] text-brand-muted">{tr("ไฟล์สำรอง .json ของแอป: ระบบจะถามยืนยันก่อนแทนที่ข้อมูล")}</span>}
              </label>
            </div>
            {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#FFF0F0] px-3 py-2.5 text-[13px] text-[#C43A3A] dark:bg-rose-500/10 dark:text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                [T("อ่านในเครื่องของคุณ"), T("ไฟล์ยังไม่ถูกส่งขึ้นระบบจนกว่าคุณจะกดนำเข้า ระบบอ่านเฉพาะค่าในเซลล์ ไม่รันสูตรหรือมาโคร")],
                [T("ตรวจได้ทุกแถวก่อนบันทึก"), T("ระบบจับคู่คอลัมน์และเทียบยอดกับไฟล์ให้ แถวที่ต้องเดาจะรอให้คุณยืนยันก่อน")],
                [T("ยกเลิกได้ทั้งชุด"), T("ถ้านำเข้าแล้วไม่ถูกต้อง ยกเลิกทั้งชุดได้ภายใน 7 วัน")],
              ].map(([title, text]) => (
                <div key={title} className="rounded-xl border border-brand-border px-4 py-3">
                  <p className="text-[13px] font-medium text-brand-text">{tr(title)}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-brand-muted">{tr(text)}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-faint/60 px-4 py-3">
              <p className="text-[13px] text-brand-muted">{tr("ยังไม่มีไฟล์ หรืออยากให้ตรงที่สุด ใช้ไฟล์ตัวอย่างของเรากรอกได้เลย")}</p>
              <button type="button" onClick={() => void downloadImportTemplate()} className={`${uiSecondaryButton} px-4 text-[13px]`}><Download className="h-4 w-4" />{tr("ดาวน์โหลดไฟล์ตัวอย่าง")}</button>
            </div>
          </div>
        </>)}

        {step === 'map' && sheet && (<>
          {header(tr("จับคู่คอลัมน์"), tr("ระบบเดาให้แล้วจากหัวตารางและข้อมูลในแต่ละคอลัมน์ ตรวจว่าแต่ละคอลัมน์ตรงกับช่องไหน เปลี่ยนได้ถ้าไม่ถูก"))}
          {stepper}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <p className="mb-3 text-[12px] text-brand-muted">{tr("ไฟล์: {0}", fileName)}</p>
            {earlier !== null && (
              <p className="mb-4 flex items-start gap-2 rounded-xl bg-brand-faint px-4 py-3 text-[13px] text-brand-text" data-testid="import-seen-before">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-brand-muted" />{earlier ? tr("ไฟล์นี้เคยนำเข้าแล้วเมื่อ {0} แถวที่นำเข้าไปแล้วจะไม่ถูกนำเข้าซ้ำ", importedLabel(earlier)) : tr("ไฟล์นี้เคยนำเข้าแล้ว แถวที่นำเข้าไปแล้วจะไม่ถูกนำเข้าซ้ำ")}
              </p>
            )}
            {sheets.length > 1 && (
              <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={tr("แท็บในไฟล์")}>
                {sheets.map((s, i) => (
                  <div key={s.grid.name + i} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] ${i === active ? 'border-[#F3B08C] bg-[#FFF1E8] dark:bg-[#E65F2B]/10' : 'border-brand-border'}`}>
                    <input type="checkbox" checked={s.include} disabled={s.analysis.monthsAcross || !s.analysis.dataRows.length} aria-label={tr("นำเข้าแท็บ {0}", s.grid.name)}
                      onChange={e => updateSheet(i, x => ({ ...x, include: e.target.checked }))} className="accent-[#E65F2B]" />
                    <button type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)} className="cursor-pointer text-brand-text">{s.grid.name}</button>
                    <span className="text-[11px] text-brand-muted">{tr("{0} แถว", s.analysis.dataRows.length)}</span>
                  </div>
                ))}
              </div>
            )}
            {sheet.analysis.role === 'lookup' && (() => {
              const [example] = codeNamesOf(sheet.grid);
              return <p className="mb-4 rounded-xl bg-brand-faint px-4 py-3 text-[13px] text-brand-text">{tr("แท็บนี้เป็นรายชื่อสำหรับแปลงรหัส เช่น {0} คือ {1} แอปใช้แปลงรหัสในแท็บอื่นเป็นชื่อให้แล้ว จึงไม่ได้เลือกแท็บนี้ไว้", example?.[0] ?? '', example?.[1] ?? '')}</p>;
            })()}
            {sheet.analysis.role === 'summary' && !sheet.analysis.monthsAcross && (
              <p className="mb-4 rounded-xl bg-brand-faint px-4 py-3 text-[13px] text-brand-text">{tr("แท็บนี้ดูเป็นหน้าสรุปหรือคำอธิบาย ไม่ได้มีรายการทีละงาน จึงไม่ได้เลือกไว้ ถ้าต้องการนำเข้า ติ๊กที่ชื่อแท็บด้านบน")}</p>
            )}
            {sheet.analysis.monthsAcross ? (
              <p className="rounded-xl bg-brand-faint px-4 py-3 text-[13px] text-brand-text">{tr("แท็บนี้เป็นตารางสรุปที่เรียงเดือนเป็นคอลัมน์ มีแต่ยอดรวม ไม่มีรายการทีละงาน จึงนำเข้าเป็นรายการไม่ได้ ใช้แท็บที่จดทีละงานแทน")}</p>
            ) : (<>
              <div className="mb-4 flex flex-wrap items-end gap-4">
                <label className="text-[13px] text-brand-text">
                  <span className="mb-1 block text-[12px] text-brand-muted">{tr("ข้อมูลในแท็บนี้คือ")}</span>
                  <select value={sheet.analysis.kind} onChange={e => updateSheet(active, x => ({ ...x, analysis: { ...x.analysis, kind: e.target.value as DataKind } }))}
                    className="h-10 rounded-[10px] border border-brand-border bg-brand-white px-3 text-[13px] dark:bg-neutral-950">
                    {(['jobs', 'expenses', 'mixed'] as DataKind[]).map(kind => <option key={kind} value={kind}>{tr(KIND_LABELS[kind])}</option>)}
                  </select>
                </label>
                <label className="text-[13px] text-brand-text">
                  <span className="mb-1 block text-[12px] text-brand-muted">{tr("หัวตารางอยู่แถวที่")}</span>
                  <select value={sheet.analysis.headerRow ?? -1} onChange={e => {
                    const value = Number(e.target.value);
                    updateSheet(active, x => ({ ...x, analysis: analyzeSheet(x.grid, { headerRow: value < 0 ? null : value }) }));
                  }} className="h-10 rounded-[10px] border border-brand-border bg-brand-white px-3 text-[13px] dark:bg-neutral-950">
                    <option value={-1}>{tr("ไม่มีหัวตาราง")}</option>
                    {sheet.grid.rows.slice(0, 15).map((_, r) => <option key={r} value={r}>{tr("แถว {0}", r + 1)}</option>)}
                  </select>
                </label>
              </div>
              <div className="overflow-hidden rounded-xl border border-brand-border">
                <table className="w-full table-fixed text-left text-[13px]">
                  <thead className="bg-brand-faint/70 text-[12px] text-brand-muted">
                    <tr><th className="w-[24%] px-4 py-2.5 font-medium">{tr("คอลัมน์ในไฟล์")}</th><th className="px-4 py-2.5 font-medium">{tr("ตัวอย่างข้อมูล")}</th><th className="w-[34%] px-4 py-2.5 font-medium">{tr("ใช้เป็น")}</th></tr>
                  </thead>
                  <tbody>
                    {sheet.analysis.columns.map(column => {
                      const guessed = sheet.include && needsConfirmation(column);
                      const unsure = !guessed && column.target !== 'keep' && column.target !== 'ignore' && column.confidence < 0.7;
                      return (
                        <tr key={column.index} className="border-t border-brand-border">
                          <td className="px-4 py-2.5 align-top"><span className="font-medium text-brand-text">{column.header || tr("คอลัมน์ {0}", columnLetter(column.index))}</span><span className="ml-1.5 text-[11px] text-brand-muted">{columnLetter(column.index)}</span></td>
                          <td className="truncate px-4 py-2.5 align-top text-brand-muted" title={column.samples.join(' · ')}>{column.samples.join(' · ') || '—'}</td>
                          <td className="px-4 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <select aria-label={tr("ใช้คอลัมน์ {0} เป็น", column.header || columnLetter(column.index))} value={column.target} onChange={e => setTarget(column.index, e.target.value as ColumnTarget)}
                                className={`h-9 min-w-0 flex-1 rounded-[10px] border bg-brand-white px-2.5 text-[13px] dark:bg-neutral-950 ${guessed || unsure ? 'border-[#F2A93B]' : 'border-brand-border'}`}>
                                {[...new Set([...fieldsForSheet, column.target])].map(target => <option key={target} value={target}>{tr(FIELD_LABELS[target])}</option>)}
                              </select>
                              {guessed && <button type="button" onClick={() => confirmColumn(column.index)} className={`${chip} ${amber} shrink-0 cursor-pointer font-medium hover:brightness-95`} aria-label={tr("ยืนยันว่าคอลัมน์ {0} คือ {1}", column.header || columnLetter(column.index), tr(FIELD_LABELS[column.target]))}>{tr("เดาจากข้อมูล · ยืนยัน")}</button>}
                              {unsure && <span className={`${chip} ${amber} shrink-0`}>{tr("ควรตรวจ")}</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(missingName || missingAmount) && (
                <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-[#FAEEDA] px-3 py-2.5 text-[13px] text-[#8A5A0B]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {missingName ? tr("ยังไม่มีคอลัมน์ที่เป็นชื่องานหรือรายการ เลือกให้อย่างน้อยหนึ่งคอลัมน์") : tr("ยังไม่มีคอลัมน์ที่เป็นยอดเงิน เลือกให้อย่างน้อยหนึ่งคอลัมน์")}</p>
              )}
            </>)}
            {hasWht && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-border px-4 py-3">
                <input type="checkbox" checked={amountsAreNet} onChange={e => setAmountsAreNet(e.target.checked)} className="mt-0.5 accent-[#E65F2B]" />
                <span><span className="block text-[13px] font-medium text-brand-text">{tr("ยอดเงินในไฟล์เป็นยอดหลังหัก ณ ที่จ่ายแล้ว")}</span>
                  <span className="block text-[12px] text-brand-muted">{tr("เช่น งาน 10,000 บาท หัก 3% แล้วกรอกไว้ 9,700 ระบบจะคำนวณมูลค่างานก่อนหักให้")}</span></span>
              </label>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-brand-border px-6 py-4">
            <button type="button" onClick={reset} className={`${uiSecondaryButton} px-4 text-[13px]`}><ChevronLeft className="h-4 w-4" />{tr("เลือกไฟล์อื่น")}</button>
            <div className="flex items-center gap-3">
              {toConfirm.length > 0 && <span className="max-w-[420px] text-right text-[12px] text-[#8A5A0B]" data-testid="import-columns-to-confirm">{tr("ยืนยันคอลัมน์ที่ระบบเดาจากข้อมูลก่อน: {0}", toConfirm.join(', '))}</span>}
              {totalRows > MAX_IMPORT_ROWS && <span className="text-[12px] text-[#C43A3A]">{tr("นำเข้าได้ครั้งละไม่เกิน {0} แถว แถวที่เกินจะยังไม่นำเข้า", MAX_IMPORT_ROWS.toLocaleString('en-US'))}</span>}
              <button type="button" onClick={startReview} disabled={!sheets.some(s => s.include) || toConfirm.length > 0} className={`${uiPrimaryButton} px-5 text-[13px] disabled:opacity-50`}>{tr("ตรวจทานข้อมูล")}</button>
            </div>
          </div>
        </>)}

        {step === 'review' && plan && (<>
          {header(tr("ตรวจทานก่อนนำเข้า"), tr("ดูทุกแถวว่าถูกต้อง แก้ชื่อ ยอดเงิน หรือวันที่ได้ในตาราง แถวที่ไม่ติ๊กจะไม่ถูกนำเข้า"))}
          {stepper}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-brand-border px-4 py-3">
                <p className="text-[12px] text-brand-muted">{tr("งานที่จะนำเข้า")}</p>
                <p className="mt-0.5 text-[18px] font-semibold text-brand-text" data-testid="import-job-count">{tr("{0} งาน", totals.jobs)}</p>
                <p className="text-[12px] text-brand-muted">{tr("มูลค่า {0} · รับแล้ว {1} · ค้างรับ {2}", formatCurrency(totals.value), formatCurrency(totals.received), formatCurrency(totals.pending))}</p>
              </div>
              <div className="rounded-xl border border-brand-border px-4 py-3">
                <p className="text-[12px] text-brand-muted">{tr("รายจ่ายที่จะนำเข้า")}</p>
                <p className="mt-0.5 text-[18px] font-semibold text-brand-text" data-testid="import-expense-count">{tr("{0} รายการ", totals.expenses)}</p>
                <p className="text-[12px] text-brand-muted">{tr("รวม {0}", formatCurrency(totals.expenseAmount))}{personalRows.length || details.expensePersonal ? tr(" · ธุรกิจ {0} · ส่วนตัว {1}", formatCurrency(details.expenseBusiness), formatCurrency(details.expensePersonal)) : ''}</p>
              </div>
              <div className="rounded-xl border border-brand-border px-4 py-3">
                <p className="text-[12px] text-brand-muted">{tr("เทียบกับยอดในไฟล์")}</p>
                {!reconciliation.length ? <p className="mt-0.5 text-[13px] text-brand-muted">{tr("ไฟล์ไม่มีแถวรวมหรือตัวเลขสรุปให้เทียบ")}</p>
                  : reconciliation.every(check => check.ok)
                    ? <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-medium text-[#12804F] dark:text-[#6FD3A3]" data-testid="import-total-check"><CheckCircle2 className="h-4 w-4" />{reconciliation.length === 1 ? tr("ตรงกัน {0}", reconciliation[0].count ? String(reconciliation[0].file) : formatCurrency(reconciliation[0].file)) : tr("ตรงกับยอดในไฟล์ทุกตัว ({0} ยอด)", reconciliation.length)}</p>
                    : <p className="mt-0.5 text-[13px] font-medium text-[#8A5A0B]" data-testid="import-total-check">{tr("ไม่ตรง {0} จาก {1} ยอด", reconciliation.filter(check => !check.ok).length, reconciliation.length)}{unreconciled ? tr(" · ส่วนต่าง {0}", formatCurrency(unreconciled)) : ''}</p>}
                {reconciliation.length > 0 && <button type="button" onClick={() => setShowChecks(v => !v)} aria-expanded={showChecks} className="mt-1 cursor-pointer text-[12px] font-medium text-[#C24A16] hover:underline dark:text-[#FF9A6B]">{showChecks ? tr("ซ่อนรายละเอียด") : tr("ดูทุกยอดที่เทียบ")}</button>}
              </div>
            </div>
            {(showChecks || reconciliation.some(check => !check.ok)) && reconciliation.length > 0 && (
              <div className="mb-3 overflow-hidden rounded-xl border border-brand-border" data-testid="import-reconciliation">
                <table className="w-full table-fixed text-left text-[12px]">
                  <thead className="bg-brand-faint/70 text-brand-muted"><tr><th className="px-4 py-2 font-medium">{tr("ยอดในไฟล์")}</th><th className="w-[18%] px-3 py-2 text-right font-medium">{tr("ไฟล์บอก")}</th><th className="w-[18%] px-3 py-2 text-right font-medium">{tr("นำเข้าได้")}</th><th className="w-[16%] px-3 py-2 font-medium">{tr("ผล")}</th></tr></thead>
                  <tbody>
                    {reconciliation.map(check => (
                      <tr key={check.key} className="border-t border-brand-border">
                        <td className="truncate px-4 py-2 text-brand-text" title={check.label}>{check.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-brand-text">{check.count ? check.file : formatCurrency(check.file)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-brand-text">{check.count ? check.imported : formatCurrency(check.imported)}</td>
                        <td className="px-3 py-2">{check.ok ? <span className="text-[#12804F] dark:text-[#6FD3A3]">{tr("ตรงกัน")}</span> : <span className="text-[#8A5A0B]">{check.count ? tr("ต่าง {0}", Math.abs(check.file - check.imported)) : tr("ต่าง {0}", formatCurrency(Math.abs(check.file - check.imported)))}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <dl className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-brand-muted" data-testid="import-counts">
              {([[T("อ่านได้"), counts.read], [T("สร้างใหม่"), counts.create], [T("อัปเดต"), counts.update], [T("ซ้ำหรือเคยนำเข้า"), counts.duplicate], [T("รอยืนยัน"), counts.confirm], [T("ควรตรวจ"), counts.check], [T("ไม่นำเข้า"), counts.skip]] as const).map(([label, count]) => (
                <div key={label} className="flex items-baseline gap-1"><dt>{tr(label)}</dt><dd className="font-semibold tabular-nums text-brand-text">{count}</dd></div>
              ))}
            </dl>
            {personalRows.length > 0 && (
              <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-border px-4 py-3">
                <input type="checkbox" checked={includePersonal} onChange={e => { setIncludePersonal(e.target.checked); setIncluded(all => Object.fromEntries(Object.entries(all).filter(([key]) => !personalRows.some(row => row.key === key)))); }} className="mt-0.5 accent-[#E65F2B]" />
                <span><span className="block text-[13px] font-medium text-brand-text">{tr("นำเข้ารายจ่ายส่วนตัวด้วย ({0} รายการ {1})", personalRows.length, formatCurrency(personalTotal))}</span>
                  <span className="block text-[12px] text-brand-muted">{tr("ไฟล์แยกรายจ่ายธุรกิจกับส่วนตัวไว้ ถ้าไม่ติ๊ก จะนำเข้าเฉพาะรายจ่ายธุรกิจ")}</span></span>
              </label>
            )}
            {confirmGroups.length > 0 && (
              <div className="mb-3 rounded-xl border border-[#F2D3A0] bg-[#FFFBF3] px-4 py-3 dark:border-[#F2A93B]/30 dark:bg-[#F2A93B]/5" data-testid="import-confirm-groups">
                <p className="text-[13px] font-medium text-brand-text">{tr("แถวที่รอคุณยืนยัน")}</p>
                <p className="mt-0.5 text-[12px] text-brand-muted">{tr("ระบบต้องเดาบางอย่างในแถวเหล่านี้ หรืออาจนับเงินซ้ำ จึงยังไม่นำเข้า ตรวจแล้วติ๊กทีละแถว หรือยืนยันทั้งกลุ่ม")}</p>
                <ul className="mt-2 space-y-1.5">
                  {confirmGroups.map(([issue, list]) => (
                    <li key={issue} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <span className="text-brand-text">{tr(ISSUE_LABELS[issue])} · {tr("{0} แถว", list.length)}</span>
                      <span className="flex gap-3">
                        <button type="button" onClick={() => { setFilter('confirm'); setShownRows(PAGE); }} className="cursor-pointer text-[12px] font-medium text-brand-muted hover:underline">{tr("ดูแถว")}</button>
                        <button type="button" onClick={() => setIncluded(all => ({ ...all, ...Object.fromEntries(list.map(row => [row.key, true])) }))} className="cursor-pointer text-[12px] font-medium text-[#C24A16] hover:underline dark:text-[#FF9A6B]">{tr("ยืนยันทั้ง {0} แถว", list.length)}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label={tr("แสดงแถว")}>
              {([['all', T("ทั้งหมด"), rows.length], ['confirm', T("รอยืนยัน"), rows.filter(row => row.state === 'confirm').length], ['check', T("ควรตรวจ"), counts.check], ['update', T("อัปเดต"), rows.filter(isUpdate).length], ['skip', T("ไม่นำเข้า"), counts.skip]] as const)
                .filter(([key, , count]) => key === 'all' || key === 'check' || key === 'skip' || count > 0).map(([key, label, count]) => (
                <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => { setFilter(key); setShownRows(PAGE); }}
                  className={`h-8 rounded-full border px-3 text-[12px] cursor-pointer ${filter === key ? 'border-[#F3B08C] bg-[#FFF1E8] font-medium text-[#C24A16] dark:bg-[#E65F2B]/10 dark:text-[#FF9A6B]' : 'border-brand-border text-brand-text'}`}>{tr(label)} {count}</button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-brand-border">
              {/* Fixed column widths so the name keeps its room; narrow screens scroll the table sideways. */}
              <table className="w-full min-w-[1040px] table-fixed text-left text-[13px]">
                <colgroup>
                  <col style={{ width: 40 }} /><col style={{ width: 92 }} /><col style={{ width: 64 }} /><col />
                  <col style={{ width: 140 }} /><col style={{ width: 104 }} /><col style={{ width: 144 }} /><col style={{ width: 92 }} /><col style={{ width: 150 }} /><col style={{ width: 40 }} />
                </colgroup>
                <thead className="bg-brand-faint/70 text-[12px] text-brand-muted">
                  <tr>
                    <th className="px-3 py-2.5"><span className="sr-only">{tr("นำเข้า")}</span></th>
                    <th className="px-2 py-2.5 font-medium">{tr("แถว")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("ประเภท")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("ชื่อ")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("ลูกค้า / หมวด")}</th>
                    <th className="px-2 py-2.5 text-right font-medium">{tr("ยอดเงิน")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("วันที่")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("รับเงิน")}</th>
                    <th className="px-2 py-2.5 font-medium">{tr("ข้อสังเกต")}</th>
                    <th className="px-2 py-2.5"><span className="sr-only">{tr("ที่มา")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.slice(0, shownRows).map(row => {
                    const on = isIncluded(row);
                    const edit = edits[row.key] || {};
                    const setEdit = (patch: RowEdit) => setEdits(all => ({ ...all, [row.key]: { ...all[row.key], ...patch } }));
                    const name = row.job?.name ?? row.expense?.name ?? '';
                    const amount = row.job?.value ?? row.expense?.amount ?? 0;
                    const date = row.job ? row.job.postDate || row.job.payDate || '' : row.expense?.date || '';
                    const input = 'h-8 w-full rounded-lg border border-transparent bg-transparent px-2 text-[13px] text-brand-text hover:border-brand-border focus:border-[#E65F2B] focus:bg-brand-white focus:outline-none dark:focus:bg-neutral-950';
                    const editable = row.kind !== 'skip' && !row.update;
                    const expanded = openRow === row.key;
                    return (
                      <React.Fragment key={row.key}>
                        <tr className={`border-t border-brand-border ${on ? '' : 'opacity-55'} ${row.state === 'confirm' && !on ? 'bg-[#FFFBF3] dark:bg-[#F2A93B]/5' : ''}`}>
                          <td className="px-3 py-1.5"><input type="checkbox" checked={on} disabled={row.kind === 'skip'} aria-label={row.state === 'confirm' ? tr("ยืนยันและนำเข้าแถว {0}", row.rowNumber) : tr("นำเข้าแถว {0}", row.rowNumber)} className="accent-[#E65F2B]"
                            onChange={e => setIncluded(all => ({ ...all, [row.key]: e.target.checked }))} /></td>
                          <td className="truncate px-2 py-1.5 text-[12px] text-brand-muted" title={`${row.sheet} · ${row.rowNumber}`}>{sheets.filter(s => s.include).length > 1 ? `${row.sheet} · ` : ''}{row.rowNumber}</td>
                          <td className="px-2 py-1.5 text-[12px]">{row.job ? tr("งาน") : row.expense ? <span className="text-[#C43A3A] dark:text-[#F19A9A]">{tr("รายจ่าย")}</span> : '—'}</td>
                          <td className="px-1 py-1.5">{editable ? <input aria-label={tr("ชื่อแถว {0}", row.rowNumber)} className={input} value={edit.name ?? name} onChange={e => setEdit({ name: e.target.value })} /> : <span className="block truncate px-2 text-brand-muted" title={name}>{name || '—'}</span>}</td>
                          <td className="truncate px-2 py-1.5 text-brand-muted">{row.job ? row.job.client || '—' : row.expense ? `${categoryText(row.expense.category)}${row.use === 'personal' ? ` · ${tr("ส่วนตัว")}` : ''}` : ''}</td>
                          <td className="px-1 py-1.5">{editable ? <input aria-label={tr("ยอดเงินแถว {0}", row.rowNumber)} inputMode="decimal" className={`${input} text-right tabular-nums`} value={edit.amount ?? amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} onChange={e => setEdit({ amount: e.target.value })} /> : row.kind === 'skip' ? null : <span className="block px-2 text-right tabular-nums text-brand-muted">{amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>}</td>
                          <td className="px-1 py-1.5">{editable ? <input aria-label={tr("วันที่แถว {0}", row.rowNumber)} type="date" className={input} value={edit.date ?? date} onChange={e => setEdit({ date: e.target.value })} /> : row.kind === 'skip' ? null : <span className="block px-2 text-brand-muted">{date || '—'}</span>}</td>
                          <td className="px-2 py-1.5 text-[12px]">{row.job ? (row.job.paymentStatus === 'paid' ? <span className="text-[#12804F] dark:text-[#6FD3A3]">{tr("รับครบแล้ว")}</span> : row.job.paymentStatus === 'partial' ? tr("รับบางส่วน") : <span className="text-[#C24A16] dark:text-[#FF9A6B]">{tr("ยังไม่จ่าย")}</span>) : ''}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {row.state === 'confirm' && <span className={`${chip} font-medium ${on ? green : amber}`}>{on ? tr("ยืนยันแล้ว") : tr("รอยืนยัน")}</span>}
                              {row.issues.map(issue => <span key={issue} className={`${chip} ${QUIET_ISSUES.includes(issue) ? 'bg-brand-faint text-brand-muted' : amber}`}>{issue === 'merged' && row.mergedInto ? tr("รวมเข้ากับ {0}", row.mergedInto) : tr(ISSUE_LABELS[issue])}</span>)}
                              {row.mergedCount ? <span className={`${chip} ${green}`}>{tr("รวมข้อมูลจากแท็บอื่น {0} แถว", row.mergedCount)}</span> : null}
                              {!row.issues.length && !row.mergedCount && <span className="text-[11px] text-[#12804F] dark:text-[#6FD3A3]">{tr("พร้อม")}</span>}
                            </div>
                          </td>
                          <td className="px-1 py-1.5">{(row.job || row.expense) && (
                            <button type="button" onClick={() => setOpenRow(expanded ? null : row.key)} aria-expanded={expanded} aria-label={tr("ดูที่มาของแถว {0}", row.rowNumber)}
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-brand-muted hover:bg-brand-faint hover:text-brand-text"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>
                          )}</td>
                        </tr>
                        {expanded && <tr className="border-t border-brand-border"><td colSpan={10} className="p-0">{rowDetail(row)}</td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!visibleRows.length && <p className="px-4 py-8 text-center text-[13px] text-brand-muted">{tr("ไม่มีแถวในหมวดนี้")}</p>}
            </div>
            {visibleRows.length > shownRows && <button type="button" onClick={() => setShownRows(n => n + PAGE)} className={`${uiSecondaryButton} mt-3 px-4 text-[13px]`}>{tr("แสดงเพิ่มอีก {0} แถว", Math.min(PAGE, visibleRows.length - shownRows))}</button>}
            {missingExpenseDates > 0 && <p className="mt-3 text-[12px] text-[#8A5A0B]">{tr("รายจ่าย {0} รายการยังไม่มีวันที่ ใส่วันที่ในตารางก่อน ไม่อย่างนั้นจะยังไม่นำเข้า", missingExpenseDates)}</p>}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-brand-border px-6 py-4">
            <button type="button" onClick={() => setStep('map')} className={`${uiSecondaryButton} px-4 text-[13px]`}><ChevronLeft className="h-4 w-4" />{tr("กลับไปจับคู่คอลัมน์")}</button>
            <div className="flex items-center gap-3">
              {counts.confirm > 0 && <span className="text-[12px] text-[#8A5A0B]" data-testid="import-confirm-count">{tr("อีก {0} แถวรอคุณยืนยัน ยังไม่นำเข้า", counts.confirm)}</span>}
              <button type="button" onClick={commit} disabled={!totals.jobs && !newExpenses && !details.updates} className={`${uiPrimaryButton} px-5 text-[13px] disabled:opacity-50`} data-testid="import-commit">
                <Upload className="h-4 w-4" />{tr("นำเข้า {0} งาน และ {1} รายจ่าย", totals.jobs, newExpenses)}{details.updates ? tr(" · อัปเดต {0}", details.updates) : ''}
              </button>
            </div>
          </div>
        </>)}

        {step === 'done' && result && (
          <div className="flex flex-col items-center px-8 py-10 text-center" data-testid="import-save-state" data-state={undone ? 'undone' : saveState === 'saving' ? 'saving' : saveState.state}>
            <Mascot mood={undone ? 'happy' : saveState === 'saving' ? 'waiting' : saveState.state === 'failed' ? 'worried' : 'celebrate'} size={104} />
            <h2 className="mt-3 text-[20px] font-semibold text-brand-text">{undone ? tr("ยกเลิกการนำเข้าแล้ว") : saveState === 'saving' ? tr("กำลังบันทึกขึ้นระบบ…") : saveState.state === 'failed' ? tr("บันทึกขึ้นระบบไม่สำเร็จ") : tr("นำเข้าเรียบร้อย")}</h2>
            <p className="mt-1 max-w-md text-[13px] text-brand-muted [text-wrap:balance]">{undone
              ? tr("รายการจากไฟล์นี้ถูกนำออก และรายการที่ไฟล์นี้อัปเดตกลับเป็นค่าเดิมแล้ว")
              : saveState === 'saving' ? tr("เพิ่ม {0} งาน และ {1} รายจ่าย อย่าเพิ่งปิดหน้านี้", result.jobs, result.expenses)
                : saveState.state === 'failed' ? tr("{0} รายการยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง หรือยกเลิกการนำเข้านี้", saveState.error)
                  : `${tr("เพิ่ม {0} งาน และ {1} รายจ่าย จาก {2} ถ้าไม่ถูกต้อง ยกเลิกการนำเข้านี้ได้ที่นี่ หรือที่ ตั้งค่า > สำรอง & นำเข้าข้อมูล ภายใน 7 วัน", result.jobs, result.expenses, fileName)}${result.updates ? tr(" อัปเดตรายการเดิม {0} รายการ", result.updates) : ''}${saveState.state === 'local' ? tr(" บันทึกไว้ในเครื่องนี้ (โหมดทดลอง)") : ''}`}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {!undone && saveState !== 'saving' && saveState.state === 'failed' && <button type="button" onClick={retrySave} className={`${uiPrimaryButton} px-5 text-[13px]`}><RefreshCw className="h-4 w-4" />{tr("ลองบันทึกอีกครั้ง")}</button>}
              {!undone && saveState !== 'saving' && saveState.state !== 'failed' && <button type="button" onClick={() => { close(); onViewJobs(); }} className={`${uiPrimaryButton} px-5 text-[13px]`}>{tr("ดูงานที่นำเข้า")}</button>}
              {!undone && <button type="button" onClick={() => { onUndo(result.batchId); setUndone(true); }} className={`${uiSecondaryButton} px-4 text-[13px]`}>{tr("ยกเลิกการนำเข้านี้")}</button>}
              <button type="button" onClick={close} className={`${uiSecondaryButton} px-4 text-[13px]`}>{tr("ปิด")}</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

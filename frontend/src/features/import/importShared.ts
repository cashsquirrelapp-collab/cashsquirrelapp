import type { ColumnGuess, ColumnTarget, DataKind, ImportedExpense, ImportedJob, ImportRow, ImportSource, IssueCode, MetricField, SheetAnalysis, SheetGrid } from './sheetImport';
import { normalizeHeader, parseDateText, stateOf } from './sheetImport';
import { roundMoney, whtAmountFor } from '../../../../shared/wht';
import { calculatePayDate } from '../../../../shared/calendar';
import { formatCurrency } from '../../utils';
import { tr, T } from '../../i18n/tr';
import { categoryText } from '../incomeExpense/ExpenseDrawer';

// What the import chat (ImportChat.tsx) and its review table share: the words for fields, issues and reasons, the
// layouts remembered per file shape, and a row with the person's edits applied. Moved from the 4-step ImportWizard
// (2026-10-22) when the import became a chat with เลขากระรอก (owner, 2026-10-31).

export type SaveOutcome = { state: 'saved' | 'local' } | { state: 'failed'; error: string };
export interface ImportCommit {
  jobs: (ImportedJob & { importSource?: ImportSource })[];
  expenses: (ImportedExpense & { importSource?: ImportSource })[];
  newJobTypes: string[];
  /** Rows already in the app that the file changes: the fields before and after. */
  updates: { table: 'jobs' | 'expenses'; id: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
}
export interface ImportResult { batchId: string; jobs: number; expenses: number; updates: number; saved: Promise<SaveOutcome> }

export interface SheetState { grid: SheetGrid; analysis: SheetAnalysis; include: boolean }
export interface RowEdit { name?: string; amount?: string; date?: string }

export const FIELD_LABELS: Record<ColumnTarget, string> = {
  name: T("ชื่องาน / รายการ"), client: T("ลูกค้า"), type: T("ประเภทงาน"), category: T("หมวดหมู่"),
  value: T("มูลค่างาน"), amount: T("ยอดเงิน"), received: T("ยอดที่รับแล้ว"), pending: T("ยอดค้างรับ"),
  income: T("รายรับ"), expense: T("รายจ่าย"), whtRate: T("หัก ณ ที่จ่าย (%)"), whtAmount: T("หัก ณ ที่จ่าย (บาท)"),
  status: T("สถานะ"), kind: T("ประเภทรายการ (รับ/จ่าย)"), date: T("วันที่"), postDate: T("วันส่งงาน"),
  dueDate: T("วันครบกำหนดรับเงิน"), paidDate: T("วันที่รับเงิน"), creditTerm: T("เครดิต (วัน)"), note: T("หมายเหตุ"),
  project: T("โปรเจกต์ที่เกี่ยวข้อง"), installment: T("งวด"), installmentStatus: T("สถานะงวด"), use: T("ธุรกิจ / ส่วนตัว"),
  keep: T("เก็บไว้ในหมายเหตุ"), ignore: T("ไม่ใช้"),
};
export const FIELDS_FOR: Record<DataKind, ColumnTarget[]> = {
  jobs: ['name', 'client', 'project', 'type', 'value', 'amount', 'received', 'pending', 'whtRate', 'whtAmount', 'status', 'installment', 'installmentStatus', 'date', 'postDate', 'dueDate', 'paidDate', 'creditTerm', 'note', 'keep', 'ignore'],
  expenses: ['name', 'category', 'project', 'amount', 'date', 'use', 'note', 'keep', 'ignore'],
  mixed: ['kind', 'name', 'project', 'client', 'category', 'income', 'expense', 'amount', 'date', 'use', 'note', 'keep', 'ignore'],
};
export const KIND_LABELS: Record<DataKind, string> = { jobs: T("งาน / รายรับ"), expenses: T("รายจ่าย"), mixed: T("รายรับและรายจ่ายปนกัน") };
export const ISSUE_LABELS: Record<IssueCode, string> = {
  noName: T("ไม่มีชื่องาน"), noAmount: T("ไม่มียอดเงิน"), negative: T("ยอดติดลบ ใช้เป็นยอดบวก"), noDate: T("ไม่มีวันที่"),
  dateFromSheet: T("ใช้เดือนจากชื่อแท็บ"), dateUnreadable: T("อ่านวันที่ไม่ได้"), amountUnreadable: T("อ่านยอดเงินไม่ได้"),
  valueFromParts: T("มูลค่า = รับแล้ว + ค้างรับ"), paidWithoutDate: T("รับเงินแล้วแต่ไม่มีวันที่รับ"),
  statusConflict: T("สถานะไม่ตรงกับยอดเงิน"), partialNoAmount: T("มัดจำแต่ไม่มียอดที่รับ"), duplicate: T("มีอยู่ในแอปแล้ว"),
  duplicateInFile: T("ซ้ำกับแถวก่อนหน้าในไฟล์"), monthOnly: T("มีแค่เดือน ใช้วันที่ 1"), paidDateFromDate: T("ใช้วันที่ในไฟล์เป็นวันรับเงิน"), total: T("แถวรวมยอด"), repeatedHeader: T("หัวตารางซ้ำ"), blank: T("แถวว่าง"),
  transfer: T("โอนระหว่างบัญชีตัวเอง ไม่ใช่รายรับหรือรายจ่าย"), merged: T("รวมเข้ากับงานในแท็บอื่นแล้ว"), sameNameOtherSheet: T("ชื่อเดียวกับงานในแท็บอื่น ตรวจว่าไม่ซ้ำ"),
  foreignCurrency: T("ยอดเงินไม่ใช่บาท ตรวจสกุลเงินก่อน"), alreadyImported: T("เคยนำเข้าแล้ว"), changedInFile: T("ไฟล์มีข้อมูลใหม่กว่า จะอัปเดตรายการเดิม"), editedInApp: T("รายการนี้สร้างหรือแก้ไขในแอป ตรวจก่อนอัปเดต"),
};
export const QUIET_ISSUES: IssueCode[] = ['duplicate', 'alreadyImported', 'total', 'blank', 'repeatedHeader', 'merged', 'transfer'];
export const REASON_LABELS: Record<NonNullable<ColumnGuess['reason']>, string> = {
  header: T("หัวตารางตรงกับช่องนี้"), headerPartial: T("หัวตารางใกล้เคียง"), code: T("รหัส แปลงเป็นชื่อจากแท็บอื่น"),
  valuesStrong: T("ข้อมูลในคอลัมน์บอกชัด"), values: T("เดาจากข้อมูล คุณยืนยันแล้ว"), person: T("คุณเลือกเอง"),
  remembered: T("ตามที่เลือกไว้ครั้งก่อน"), ai: T("เลขากระรอกแนะนำ"), none: T("เก็บไว้ในหมายเหตุ"),
};
export const METRIC_LABELS: Record<MetricField, string> = {
  received: T("รับแล้ว"), pending: T("ค้างรับ"), value: T("มูลค่างาน"), expense: T("รายจ่าย"), expenseBusiness: T("รายจ่ายธุรกิจ"),
  expensePersonal: T("รายจ่ายส่วนตัว"), transfers: T("เงินโอนเข้าบัญชีตัวเอง (ไม่นับ)"), jobs: T("จำนวนงาน"),
};
export const UPDATE_LABELS: Record<string, string> = {
  value: T("มูลค่างาน"), whtRate: T("หัก ณ ที่จ่าย (%)"), whtAmount: T("หัก ณ ที่จ่าย (บาท)"), received: T("ยอดที่รับแล้ว"), pending: T("ยอดค้างรับ"),
  payDate: T("วันรับเงิน / ครบกำหนด"), depositDate: T("วันที่รับมัดจำ"), depositAmount: T("ยอดมัดจำ"), creditTerm: T("เครดิต (วัน)"),
  installments: T("งวด"), status: T("สถานะ"), paymentStatus: T("การรับเงิน"), name: T("ชื่อ"), amount: T("ยอดเงิน"), date: T("วันที่"), category: T("หมวดหมู่"),
};
export const MONEY_UPDATE_FIELDS = new Set(['value', 'whtAmount', 'received', 'pending', 'depositAmount', 'amount']);
const MAPPINGS_KEY = 'cashflow_import_mappings';
export const PAGE = 100;

const sheetSignature = (analysis: SheetAnalysis) => analysis.columns.map(c => normalizeHeader(c.header)).join('|');
export function readMappings(): Record<string, { kind: DataKind; targets: Record<string, ColumnTarget> }> {
  try { return JSON.parse(localStorage.getItem(MAPPINGS_KEY) || '{}'); } catch { return {}; }
}
export function rememberMapping(analysis: SheetAnalysis) {
  try {
    const all = readMappings();
    all[sheetSignature(analysis)] = { kind: analysis.kind, targets: Object.fromEntries(analysis.columns.map(c => [normalizeHeader(c.header) || `#${c.index}`, c.target])) };
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - 20))) delete all[key];
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
  } catch { /* remembering is a convenience */ }
}
export function applyRemembered(analysis: SheetAnalysis): SheetAnalysis {
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

export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const columnLetter = (index: number) => { let s = '', n = index + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const sourceLink = (row: ImportRow): ImportSource | undefined => {
  if (!row.source) return undefined;
  const { cells: _cells, ...link } = row.source;
  return link;
};

/** A row with the person's edits applied, money and due date recomputed like the job form does. */
export function editedRow(row: ImportRow, edit: RowEdit | undefined): ImportRow {
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
export function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'installments' && Array.isArray(value)) return tr("{0} งวด", value.length);
  if (MONEY_UPDATE_FIELDS.has(field) && typeof value === 'number') return formatCurrency(value);
  if (field === 'status' || field === 'paymentStatus') return value === 'done' || value === 'paid' ? tr("รับครบแล้ว") : value === 'partial' || value === 'installment' ? tr("รับบางส่วน") : tr("ยังไม่จ่าย");
  if (field === 'category') return categoryText(String(value));
  return String(value);
}

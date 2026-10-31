import React from 'react';
import { AlertTriangle, ArrowUp, Check, CheckCircle2, ChevronDown, Download, FileSpreadsheet, Loader2, Paperclip, RefreshCw, Undo2, Upload } from 'lucide-react';
import type { Expense, Job, StatusOption } from '../../../../shared/types';
import { roundMoney } from '../../../../shared/wht';
import { Modal } from '../../components/ui/Modal';
import { Mascot } from '../../components/mascot/Mascot';
import { formatCurrency } from '../../utils';
import { tr, T } from '../../i18n/tr';
import { useMobileLayout } from '../mobile/useMobileLayout';
import { applySuggestions, askColumns, columnsToAsk } from './aiColumns';
import {
  analyzeSheet, buildImportPlan, compareMetrics, defaultIncluded, planDetails, planTotals, splitSideBySide, MAX_IMPORT_ROWS,
  type ColumnTarget, type DataKind, type ImportRow, type ImportSource, type IssueCode,
} from './sheetImport';
import { fileFingerprint, fileKind, readWorkbook } from './readWorkbook';
import { downloadImportTemplate } from './importTemplate';
import { importedLabel } from './importBatches';
import {
  FIELD_LABELS, FIELDS_FOR, ISSUE_LABELS, KIND_LABELS, METRIC_LABELS, applyRemembered, columnLetter, editedRow, rememberMapping, sourceLink, todayKey,
  type ImportCommit, type ImportResult, type RowEdit, type SaveOutcome, type SheetState,
} from './importShared';
import {
  CHAT_LIMIT_PER_FILE, applyActions, applyGroupFix, columnsWaiting, issueGroups, quietCounts, sheetReports, withConfirmed, withTarget,
  type ChatState, type GroupFix, type IssueGroup, type SheetReport,
} from './importChatModel';
import { askImportChat } from './importChatApi';
import { ImportReview, type ReviewFilter } from './ImportReview';
import './importChat.css';

// "ย้ายข้อมูลเข้าแอป" as a chat with เลขากระรอก (owner, 2026-10-31: "ทำให้มันเป็นแบบแชทที่ทุกคนสามารถเอาข้อมูลมาใส่ตรงนี้ได้
// แล้วก็เราก็จะทำการดึงข้อมูลให้อัตโนมัติ ตรงไหนที่ไม่สามารถดึงได้มันก็ทำการแจ้งเขาเลย"; the mockup of 2026-10-30). A file
// dropped in the chat is read in the browser by the import's rules; เลขา says which columns matched, which it guessed,
// which the app has no place for, and which rows need a decision, each with fixes to tap. Typing to เลขา is free for
// every account, 10 messages a file and 3 files a day (owner's answer, 2026-10-31); its answer is applied by the same
// rules and can be taken back. Nothing is saved until นำเข้า, and the whole import can be undone for 7 days.
// Computers and iPads see a centred window; phones a sheet from the bottom (owner: "ทำมือถือด้วยเลย").

export type { ImportCommit, ImportResult, SaveOutcome } from './importShared';

interface Props {
  open: boolean;
  onClose: () => void;
  jobs: Job[];
  expenses: Expense[];
  statuses: StatusOption[];
  jobTypes: string[];
  onImport: (commit: ImportCommit) => ImportResult;
  onRetrySave: (batchId: string) => Promise<SaveOutcome>;
  onRestoreBackup?: (text: string) => void;
  onUndo: (batchId: string) => void;
  onViewJobs: () => void;
  /** The signed-in account (none for a guest): เลขา's column suggestions and typed messages need it. */
  accountId?: string;
}

interface Talk { id: number; who: 'me' | 'bot'; text: string; applied?: number; mark?: number; failed?: boolean }
interface Resolved { issue: IssueCode; count: number; label: string; mark: number }

const FIX_LABELS: Record<GroupFix, string> = {
  confirm: T("นำเข้าตามที่อ่านได้"), today: T("ใช้วันนี้"), monthStart: T("ใช้วันแรกของเดือน"), monthEnd: T("ใช้วันสิ้นเดือน"), date: T("ใช้วันที่ที่เลือก"),
  skip: T("ข้ามแถวเหล่านี้"), include: T("นำเข้าด้วย"), update: T("อัปเดตรายการเดิม"), noUpdate: T("ไม่อัปเดต"), review: T("ดูแถว"),
};
const GUESSED_DATE: IssueCode[] = ['monthOnly', 'dateFromSheet'];
const STATE_WORDS: Record<IssueGroup['state'], string> = { confirm: T("รอยืนยัน"), skip: T("ยังไม่นำเข้า"), check: T("นำเข้าพร้อมหมายเหตุ") };
const NOT_IMPORTED: Record<NonNullable<SheetReport['notImported']>, string> = {
  monthsAcross: T("แท็บ “{0}” เป็นตารางสรุปรายเดือน มีแต่ยอดรวม จึงนำเข้าเป็นรายการไม่ได้"),
  summary: T("แท็บ “{0}” ดูเป็นหน้าสรุปหรือคำอธิบาย จึงยังไม่ได้นำเข้า"),
  lookup: T("แท็บ “{0}” เป็นรายชื่อสำหรับแปลงรหัส เลขาใช้แปลงรหัสในแท็บอื่นเป็นชื่อให้แล้ว"),
  empty: T("แท็บ “{0}” ไม่มีข้อมูล"),
};
const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const rowList = (rows: ImportRow[], multiSheet: boolean) => {
  const shown = rows.slice(0, 6).map(row => (multiSheet ? `${row.sheet} ${row.rowNumber}` : String(row.rowNumber))).join(', ');
  return rows.length > 6 ? tr("แถว {0} และอีก {1} แถว", shown, rows.length - 6) : tr("แถว {0}", shown);
};

function Bot({ children, face = true, mood = 'happy', testId }: { children: React.ReactNode; face?: boolean; mood?: 'happy' | 'thinking' | 'worried' | 'celebrate' | 'waiting'; testId?: string }) {
  const phone = useMobileLayout();
  return (
    <div className="ic-row" data-testid={testId}>
      {face ? <span className="ic-face" aria-hidden="true"><Mascot gear={phone ? 'pro' : 'none'} mood={mood} animated={false} size={30} viewBox="12 8 76 76" /></span> : <span className="ic-face is-blank" aria-hidden="true" />}
      <div className="ic-body">{children}</div>
    </div>
  );
}
const Me = ({ children }: { children: React.ReactNode }) => <div className="ic-row is-me"><div className="ic-bubble">{children}</div></div>;

export function ImportChat({ open, onClose, jobs, expenses, statuses, jobTypes, onImport, onRetrySave, onRestoreBackup, onUndo, onViewJobs, accountId }: Props) {
  const phone = useMobileLayout();
  const [fileName, setFileName] = React.useState('');
  const [fileSize, setFileSize] = React.useState(0);
  const [fingerprint, setFingerprint] = React.useState('');
  const [sheets, setSheets] = React.useState<SheetState[]>([]);
  const [amountsAreNet, setAmountsAreNet] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [included, setIncluded] = React.useState<Record<string, boolean>>({});
  const [includePersonal, setIncludePersonal] = React.useState(true);
  const [edits, setEdits] = React.useState<Record<string, RowEdit>>({});
  const [history, setHistory] = React.useState<ChatState[]>([]);
  const [resolved, setResolved] = React.useState<Resolved[]>([]);
  const [talk, setTalk] = React.useState<Talk[]>([]);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [used, setUsed] = React.useState(0);
  const [columnsOpen, setColumnsOpen] = React.useState<Record<number, boolean>>({});
  const [changing, setChanging] = React.useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [reviewFilter, setReviewFilter] = React.useState<ReviewFilter>('all');
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [saveState, setSaveState] = React.useState<'saving' | SaveOutcome>('saving');
  const [undone, setUndone] = React.useState(false);
  const [aiAsking, setAiAsking] = React.useState(false);
  const aiRun = React.useRef(0);
  const talkId = React.useRef(0);
  const scroller = React.useRef<HTMLDivElement>(null);
  const reviewRef = React.useRef<HTMLDivElement>(null);

  // ── reading the file ──────────────────────────────────────────────────────────────────────────────────────────────
  const suggestColumns = async (list: SheetState[], account: string) => {
    const run = ++aiRun.current;
    const targets = list.map((sheet, index) => ({ sheet, index })).filter(({ sheet }) => sheet.include && columnsToAsk(sheet.analysis).length).slice(0, 4);
    if (!targets.length) return;
    setAiAsking(true);
    await Promise.all(targets.map(async ({ sheet, index }) => {
      try {
        const answer = await askColumns(account, sheet.grid.name, sheet.analysis);
        if (run !== aiRun.current || !answer.columns.length) return;
        setSheets(current => current.map((item, i) => (i === index && item.grid === sheet.grid ? { ...item, analysis: applySuggestions(item.analysis, answer.columns).analysis } : item)));
      } catch { /* the import goes on with its own guesses */ }
    }));
    if (run === aiRun.current) setAiAsking(false);
  };

  const reset = () => {
    aiRun.current += 1; setAiAsking(false);
    setFileName(''); setFileSize(0); setFingerprint(''); setSheets([]); setAmountsAreNet(false); setError(''); setIncluded({}); setEdits({}); setIncludePersonal(true);
    setHistory([]); setResolved([]); setTalk([]); setDraft(''); setUsed(0); setColumnsOpen({}); setChanging(null); setReviewOpen(false); setReviewFilter('all');
    setResult(null); setSaveState('saving'); setUndone(false);
  };
  const close = () => { reset(); onClose(); };

  const readFile = async (file: File) => {
    setError('');
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
    reset();
    setFileName(file.name); setFileSize(file.size);
    setReading(true);
    try {
      const data = await file.arrayBuffer();
      if (!fileKind(data, file.name)) { setError(tr("ไฟล์นี้ไม่ใช่ไฟล์ Excel หรือ CSV ที่อ่านได้ กรุณาเลือกไฟล์ที่บันทึกจาก Excel, Google Sheets หรือ Numbers")); setFileName(''); return; }
      const XLSX = await import('xlsx');
      const grids = readWorkbook(XLSX, data, file.name).filter(grid => grid.rows.some(row => row.some(cell => cell.text))).flatMap(splitSideBySide);
      if (!grids.length) { setError(tr("ไม่พบข้อมูลในไฟล์นี้")); setFileName(''); return; }
      const next = grids.map(grid => {
        const analysis = applyRemembered(analyzeSheet(grid));
        return { grid, analysis, include: defaultIncluded(analysis) };
      });
      setFingerprint(await fileFingerprint(data).catch(() => ''));
      setSheets(next);
      if (accountId) void suggestColumns(next, accountId);
    } catch {
      setError(tr("เปิดไฟล์นี้ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกเป็น .xlsx หรือ .csv แล้วเลือกใหม่"));
      setFileName('');
    } finally {
      setReading(false);
    }
  };
  const pickFile = (list: FileList | null | undefined) => { const file = list?.[0]; if (file) void readFile(file); };

  // ── what the rules found ──────────────────────────────────────────────────────────────────────────────────────────
  const earlier = React.useMemo(() => {
    if (!fingerprint) return null;
    const row = [...jobs, ...expenses].find(item => (item as { importSource?: ImportSource }).importSource?.fingerprint === fingerprint) as { importedAt?: string } | undefined;
    return row ? row.importedAt || '' : null;
  }, [fingerprint, jobs, expenses]);
  const plan = React.useMemo(() => (sheets.length
    ? buildImportPlan(sheets.filter(s => s.include), { amountsAreNet, today: todayKey(), ...(fingerprint ? { source: { fileName, fingerprint } } : {}) },
      { statuses, jobTypes, existingJobs: jobs, existingExpenses: expenses }, sheets.map(s => s.grid))
    : null), [sheets, amountsAreNet, fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = React.useMemo(() => (plan ? plan.rows.map(row => editedRow(row, edits[row.key])) : []), [plan, edits]);
  const isIncluded = React.useCallback((row: ImportRow) => row.kind !== 'skip'
    && (included[row.key] ?? ((row.state === 'ready' || row.state === 'check') && (includePersonal || row.use !== 'personal'))), [included, includePersonal]);
  const totals = React.useMemo(() => planTotals(rows, isIncluded), [rows, isIncluded]);
  const details = React.useMemo(() => planDetails(rows, isIncluded), [rows, isIncluded]);
  const groups = React.useMemo(() => issueGroups(rows, included), [rows, included]);
  const quiet = React.useMemo(() => quietCounts(rows), [rows]);
  const reports = React.useMemo(() => sheetReports(sheets), [sheets]);
  const waiting = columnsWaiting(sheets);
  const multiSheet = sheets.filter(s => s.include).length > 1;
  const totalRows = sheets.filter(s => s.include).reduce((sum, s) => sum + s.analysis.dataRows.length, 0);
  const hasWht = sheets.some(s => s.include && s.analysis.columns.some(c => c.target === 'whtRate' || c.target === 'whtAmount'));
  const reconciliation = React.useMemo(() => {
    if (!plan) return [];
    const byTotalRow = plan.checks.map(check => ({ key: `t:${check.sheet}:${check.field}`, label: tr("แถวรวม แท็บ {0} · {1}", check.sheet, tr(FIELD_LABELS[check.field])), file: check.fileTotal, imported: check.rowsTotal, ok: check.ok, count: false }));
    const byMetric = compareMetrics(plan.metrics, totals, details, plan.transfersTotal).map(check => ({ key: `m:${check.sheet}:${check.label}`, label: tr("แท็บ {0} · {1} ({2})", check.sheet, check.label, tr(METRIC_LABELS[check.field])), file: check.fileValue, imported: check.importValue, ok: check.ok, count: check.field === 'jobs' }));
    return [...byTotalRow, ...byMetric];
  }, [plan, totals, details]);
  const missingExpenseDates = rows.filter(row => isIncluded(row) && row.expense && !row.update && !row.expense.date).length;
  const personalRows = rows.filter(row => row.expense && row.use === 'personal' && row.state !== 'skip');
  const personalTotal = roundMoney(personalRows.reduce((sum, row) => sum + row.expense!.amount, 0));
  const newExpenses = Math.max(0, totals.expenses - missingExpenseDates);
  const notImportedRows = rows.filter(row => !isIncluded(row)).length;
  const blocked = waiting.length > 0 || reports.some(report => report.include && (report.missingName || report.missingAmount));

  // ── fixes (each kept so เปลี่ยนกลับ can restore what was there) ────────────────────────────────────────────────────────
  const snapshot = (): ChatState => ({ sheets, edits, included, amountsAreNet });
  const restore = (state: ChatState) => { setSheets(state.sheets); setEdits(state.edits); setIncluded(state.included); setAmountsAreNet(state.amountsAreNet); };
  const change = (next: ChatState) => { setHistory(list => [...list.slice(-29), snapshot()]); restore(next); return history.length + 1; };
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory(list => list.slice(0, -1));
    setResolved(list => list.filter(item => item.mark < history.length));
    restore(last);
  };
  const updateSheet = (index: number, update: (sheet: SheetState) => SheetState) => change({ ...snapshot(), sheets: sheets.map((sheet, i) => (i === index ? update(sheet) : sheet)) });
  const fixGroup = (group: IssueGroup, fix: GroupFix) => {
    if (fix === 'review') {
      setReviewFilter(`issue:${group.issue}`); setReviewOpen(true);
      requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    const before = snapshot();
    const next = applyGroupFix(before, rows, group.issue, fix, todayKey());
    if (next === before) return;
    const mark = change(next);
    setResolved(list => [...list.filter(item => item.issue !== group.issue), { issue: group.issue, count: group.rows.length, label: FIX_LABELS[fix], mark }]);
  };

  // ── typing to เลขา ────────────────────────────────────────────────────────────────────────────────────────────────
  const say = (item: Omit<Talk, 'id'>) => setTalk(list => [...list, { ...item, id: ++talkId.current }]);
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !accountId || !sheets.length || used >= CHAT_LIMIT_PER_FILE) return;
    setDraft('');
    say({ who: 'me', text });
    setSending(true);
    try {
      const answer = await askImportChat(accountId, text, fingerprint, todayKey(), sheets, groups);
      setUsed(n => n + 1);
      if (!answer.available) { say({ who: 'bot', text: tr("ตอนนี้เลขายังตอบข้อความไม่ได้ แตะปุ่มด้านบนเพื่อแก้ได้เลยครับ") }); return; }
      const { state: next, applied } = applyActions(snapshot(), rows, answer.actions, todayKey());
      const mark = applied ? change(next) : undefined;
      say({ who: 'bot', text: answer.reply || (applied ? tr("แก้ให้แล้วครับ") : tr("เลขายังทำตามข้อความนี้ไม่ได้ ลองแตะปุ่มแก้ด้านบน หรือแก้แถวนั้นในตารางได้ครับ")), applied, mark });
    } catch (failure) {
      const limited = (failure as { status?: number } | null)?.status === 429;
      if (limited) setUsed(CHAT_LIMIT_PER_FILE);
      say({ who: 'bot', failed: !limited, text: limited ? tr("คุยเรื่องไฟล์นี้ครบแล้วสำหรับวันนี้ แตะปุ่มแก้ด้านบน หรือแก้ในตารางต่อได้เลยครับ") : tr("ส่งข้อความไม่สำเร็จ ลองใหม่อีกครั้งครับ") });
    } finally {
      setSending(false);
    }
  };

  // ── importing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const commit = () => {
    for (const sheet of sheets) if (sheet.include) rememberMapping(sheet.analysis);
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
  };
  const retrySave = () => {
    if (!result) return;
    setSaveState('saving');
    void onRetrySave(result.batchId).then(setSaveState);
  };

  // Each new message, and the file once read, scroll into view.
  React.useEffect(() => {
    const el = scroller.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  }, [talk.length, sheets.length > 0, result !== null, reading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pieces ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const columnName = (header: string, index: number) => header || tr("คอลัมน์ {0}", columnLetter(index));
  const fieldSelect = (report: SheetReport, column: number, target: ColumnTarget, onPick: (target: ColumnTarget) => void) => (
    <select aria-label={tr("ใช้คอลัมน์ {0} เป็น", columnName(sheets[report.index].analysis.columns.find(c => c.index === column)?.header ?? '', column))} value={target}
      onChange={e => onPick(e.target.value as ColumnTarget)} className="ic-select">
      {[...new Set([...FIELDS_FOR[report.kind], target])].map(option => <option key={option} value={option}>{tr(FIELD_LABELS[option])}</option>)}
    </select>
  );

  const columnsCard = (report: SheetReport) => {
    const sheet = sheets[report.index];
    const all = !!columnsOpen[report.index];
    return (
      <section className="ic-card" key={`cols-${report.index}`} aria-label={tr("คอลัมน์ของแท็บ {0}", report.name)} data-testid="import-columns">
        <header className="ic-card-head">
          <span className="ic-card-title">{multiSheet || sheets.length > 1 ? tr("แท็บ “{0}” · คอลัมน์ในไฟล์ → ช่องในแอป", report.name) : tr("คอลัมน์ในไฟล์ → ช่องในแอป")}</span>
          <span className={`ic-card-state ${report.toConfirm.length ? 'is-wait' : 'is-ok'}`}>{tr("ตรงแล้ว {0}", report.matched.length)}{report.toConfirm.length ? ` · ${tr("รอยืนยัน {0}", report.toConfirm.length)}` : ''}</span>
        </header>
        {report.matched.length > 0 && (
          <ul className="ic-matched">
            {report.matched.map(column => <li key={column.index}><Check className="h-3.5 w-3.5 shrink-0 text-[#12804F] dark:text-[#6FD3A3]" aria-hidden="true" /><span className="truncate">{columnName(column.header, column.index)}</span><span className="shrink-0 text-brand-muted">→ {tr(FIELD_LABELS[column.target])}</span></li>)}
          </ul>
        )}
        {report.toConfirm.map(column => {
          const key = `${report.index}:${column.index}`;
          return (
            <div className="ic-ask" key={key} data-testid="import-column-ask">
              <p><b>{columnName(column.header, column.index)}</b>{column.samples.length > 0 && <span className="text-brand-muted"> {tr("เช่น {0}", column.samples.slice(0, 2).map(sample => `“${sample}”`).join(', '))}</span>} → <b className="text-[#C24A16] dark:text-[#FFA473]">{tr(FIELD_LABELS[column.target])}</b> {tr("ใช่ไหม")}
                {column.reason === 'ai' && <span className="ic-tag">{tr("เลขาแนะนำ")}</span>}</p>
              {changing === key ? fieldSelect(report, column.index, column.target, target => { updateSheet(report.index, s => withTarget(s, column.index, target)); setChanging(null); }) : (
                <div className="ic-chips">
                  <button type="button" className="ic-chip is-main" onClick={() => updateSheet(report.index, s => withConfirmed(s, column.index))} aria-label={tr("ยืนยันว่าคอลัมน์ {0} คือ {1}", columnName(column.header, column.index), tr(FIELD_LABELS[column.target]))}>{tr("ใช่")}</button>
                  <button type="button" className="ic-chip" onClick={() => setChanging(key)}>{tr("เปลี่ยน")}</button>
                </div>
              )}
            </div>
          );
        })}
        {report.kept.length > 0 && (
          <div className="ic-note-row" data-testid="import-columns-kept">
            <p>{tr("ยังไม่มีช่องในแอปสำหรับ {0} เลขาเก็บไว้ในหมายเหตุของแต่ละรายการให้", report.kept.map(c => `“${columnName(c.header, c.index)}”`).join(', '))}</p>
            <button type="button" className="ic-link" onClick={() => updateSheet(report.index, s => report.kept.reduce((next, c) => withTarget(next, c.index, 'ignore'), s))}>{tr("ไม่ต้องเก็บ")}</button>
          </div>
        )}
        {(report.missingName || report.missingAmount) && (
          <p role="alert" className="ic-alert"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{report.missingName ? tr("ยังไม่มีคอลัมน์ที่เป็นชื่องานหรือรายการ เลือกให้อย่างน้อยหนึ่งคอลัมน์ใน ดูทุกคอลัมน์") : tr("ยังไม่มีคอลัมน์ที่เป็นยอดเงิน เลือกให้อย่างน้อยหนึ่งคอลัมน์ใน ดูทุกคอลัมน์")}</p>
        )}
        <button type="button" className="ic-more" aria-expanded={all} onClick={() => setColumnsOpen(state => ({ ...state, [report.index]: !all }))}>
          {all ? tr("ซ่อนรายละเอียดคอลัมน์") : tr("ดูทุกคอลัมน์และตั้งค่าแท็บ")}<ChevronDown className={`h-4 w-4 transition-transform ${all ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {all && (
          <div className="ic-all" data-testid="import-columns-all">
            <div className="ic-settings">
              <label><span>{tr("ข้อมูลในแท็บนี้คือ")}</span>
                <select className="ic-select" value={sheet.analysis.kind} onChange={e => updateSheet(report.index, s => ({ ...s, analysis: { ...s.analysis, kind: e.target.value as DataKind } }))}>
                  {(['jobs', 'expenses', 'mixed'] as DataKind[]).map(kind => <option key={kind} value={kind}>{tr(KIND_LABELS[kind])}</option>)}
                </select></label>
              <label><span>{tr("หัวตารางอยู่แถวที่")}</span>
                <select className="ic-select" value={sheet.analysis.headerRow ?? -1} onChange={e => { const value = Number(e.target.value); updateSheet(report.index, s => ({ ...s, analysis: analyzeSheet(s.grid, { headerRow: value < 0 ? null : value }) })); }}>
                  <option value={-1}>{tr("ไม่มีหัวตาราง")}</option>
                  {sheet.grid.rows.slice(0, 15).map((_, r) => <option key={r} value={r}>{tr("แถว {0}", r + 1)}</option>)}
                </select></label>
            </div>
            <ul className="ic-columns">
              {sheet.analysis.columns.map(column => (
                <li key={column.index}>
                  <span className="min-w-0"><b className="block truncate">{columnName(column.header, column.index)}</b><span className="block truncate text-[12px] text-brand-muted" title={column.samples.join(' · ')}>{column.samples.join(' · ') || '—'}</span></span>
                  {fieldSelect(report, column.index, column.target, target => updateSheet(report.index, s => withTarget(s, column.index, target)))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  };

  const groupRow = (group: IssueGroup) => {
    const label = group.issue === 'noDate' ? tr("{0} แถวไม่มีวันที่", group.rows.length) : tr("{0} · {1} แถว", tr(ISSUE_LABELS[group.issue]), group.rows.length);
    const done = resolved.find(item => item.issue === group.issue);
    return (
      <div className="ic-issue" key={group.issue} data-testid="import-issue" data-issue={group.issue}>
        <div className="ic-issue-head">
          <p className="ic-issue-title">{label}</p>
          <span className={`ic-pill ${group.decided ? 'is-ok' : group.state === 'check' ? '' : 'is-wait'}`}>{group.decided && done ? tr(done.label) : tr(STATE_WORDS[group.state])}</span>
        </div>
        <p className="ic-issue-rows">{rowList(group.rows, multiSheet)}</p>
        <div className="ic-chips">
          {group.fixes.map((fix, at) => (
            <button key={fix} type="button" className={`ic-chip ${at === 0 && fix !== 'review' ? 'is-soft' : ''}`} onClick={() => fixGroup(group, fix)}>
              {fix === 'confirm' && GUESSED_DATE.includes(group.issue) ? tr("ใช้วันที่ที่ระบบเดา") : fix === 'skip' ? tr("ข้าม {0} แถวนี้", group.rows.length) : tr(FIX_LABELS[fix])}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const fixedRows = resolved.filter(item => !groups.some(group => group.issue === item.issue));
  const tabsRead = reports.filter(report => report.include);
  const tabsLeft = reports.filter(report => !report.include && report.notImported);
  const left = Math.max(0, CHAT_LIMIT_PER_FILE - used);
  const importCount = totals.jobs + newExpenses + details.updates;
  const allMatch = reconciliation.length > 0 && reconciliation.every(check => check.ok);

  return (
    <Modal open={open} onClose={close} label={tr("ย้ายข้อมูลเข้าแอป")} width={860}>
      <div className={`ic ${phone ? 'is-phone' : ''}`} data-testid="import-wizard"
        onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()}
        onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files); }}>
        <header className="ic-head">
          <div className="min-w-0">
            <h2>{tr("ย้ายข้อมูลเข้าแอป")}</h2>
            <p>{tr("คุยกับเลขากระรอก · ยังไม่มีอะไรบันทึกจนกว่าจะกดนำเข้า")}</p>
          </div>
          {sheets.length > 0 && !result && accountId && <span className="ic-count" data-testid="import-chat-left">{tr("คุยเรื่องไฟล์นี้ได้อีก {0} ข้อความ", left)}</span>}
        </header>

        <div className="ic-scroll" ref={scroller}>
          <div className="ic-thread">
            <Bot>
              <p className="ic-text">{tr("สวัสดีครับ ย้ายข้อมูลจากแอปอื่นหรือไฟล์ Excel มาได้เลย ลากไฟล์มาวางในแชทนี้ เลขาจะดึงข้อมูลให้อัตโนมัติ และบอกว่าตรงไหนใช้ได้ทันที ตรงไหนต้องเลือกเพิ่มนิดหน่อย")}</p>
              {!fileName && (<>
                <input type="file" id="import-sheet-file" accept={`.xlsx,.xlsm,.xls,.csv,.ods,.txt${onRestoreBackup ? ',.json' : ''}`} className="sr-only" tabIndex={-1}
                  onChange={e => { const list = e.target.files; pickFile(list); e.target.value = ''; }} />
                <label htmlFor="import-sheet-file" className={`ic-drop ${dragging ? 'is-over' : ''}`} data-testid="import-drop">
                  <span className="ic-drop-icon" aria-hidden="true"><Upload className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-medium text-brand-text">{phone ? tr("แตะเพื่อเลือกไฟล์") : tr("ลากไฟล์มาวางตรงนี้ หรือกดเพื่อเลือกไฟล์")}</span>
                    <span className="block text-[12.5px] text-brand-muted">{tr("Excel (.xlsx .xls) · CSV · .ods · Google Sheets: ดาวน์โหลดเป็น .xlsx ก่อน")}</span>
                    {onRestoreBackup && <span className="block text-[12.5px] text-brand-muted">{tr("ไฟล์สำรอง .json ของแอป: ระบบจะถามยืนยันก่อนแทนที่ข้อมูล")}</span>}
                  </span>
                  <span className="ic-drop-button">{tr("เลือกไฟล์")}</span>
                </label>
                <p className="ic-meta">{tr("ยังไม่มีไฟล์ หรืออยากให้ตรงที่สุด")} <button type="button" className="ic-link" onClick={() => void downloadImportTemplate()}><Download className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" /> {tr("ดาวน์โหลดไฟล์ตัวอย่าง")}</button></p>
              </>)}
              {error && <p role="alert" className="ic-alert is-error"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
            </Bot>

            {fileName && (
              <Me>
                <span className="ic-file"><span className="ic-file-icon" aria-hidden="true"><FileSpreadsheet className="h-[18px] w-[18px]" /></span>
                  <span className="min-w-0"><span className="block truncate font-medium">{fileName}</span>
                    <span className="block text-[12.5px] text-[#8A6A55] dark:text-brand-muted">{sheets.length ? `${tr("{0} แท็บ", sheets.length)} · ${tr("{0} แถว", sheets.reduce((sum, s) => sum + s.analysis.dataRows.length, 0))} · ` : ''}{sizeLabel(fileSize)}</span></span></span>
              </Me>
            )}

            {reading && <Bot mood="thinking"><p className="ic-text ic-typing" role="status"><Loader2 className="h-4 w-4 animate-spin text-[#E65F2B]" aria-hidden="true" />{tr("กำลังอ่านไฟล์…")}</p></Bot>}

            {sheets.length > 0 && plan && (<>
              <Bot testId="import-read">
                <p className="ic-text">{tr("อ่านไฟล์แล้วครับ")} {tabsRead.length ? tabsRead.map(report => tr("แท็บ “{0}” มี {1} แถว", report.name, report.rows)).join(' · ') : tr("ยังไม่มีแท็บที่นำเข้าได้")}{waiting.length ? ` ${tr("มี {0} คอลัมน์ที่เลขาเดาให้ ช่วยดูหน่อยว่าใช่ไหม", waiting.length)}` : ''}</p>
                {earlier !== null && <p className="ic-note" data-testid="import-seen-before"><RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />{earlier ? tr("ไฟล์นี้เคยนำเข้าแล้วเมื่อ {0} แถวที่นำเข้าไปแล้วจะไม่ถูกนำเข้าซ้ำ", importedLabel(earlier)) : tr("ไฟล์นี้เคยนำเข้าแล้ว แถวที่นำเข้าไปแล้วจะไม่ถูกนำเข้าซ้ำ")}</p>}
                {tabsLeft.map(report => (
                  <div className="ic-note-row" key={`left-${report.index}`} data-testid="import-tab-left">
                    <p>{tr(NOT_IMPORTED[report.notImported!], report.name)}</p>
                    {report.notImported === 'summary' && <button type="button" className="ic-link" onClick={() => updateSheet(report.index, s => ({ ...s, include: true }))}>{tr("นำเข้าแท็บนี้ด้วย")}</button>}
                  </div>
                ))}
                {aiAsking && <p className="ic-note" role="status"><Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#E65F2B]" aria-hidden="true" />{tr("เลขากระรอกกำลังช่วยดูคอลัมน์ที่ระบบยังไม่รู้จัก")}</p>}
                {tabsRead.map(columnsCard)}
                {totalRows > MAX_IMPORT_ROWS && <p className="ic-alert"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{tr("นำเข้าได้ครั้งละไม่เกิน {0} แถว แถวที่เกินจะยังไม่นำเข้า", MAX_IMPORT_ROWS.toLocaleString('en-US'))}</p>}
              </Bot>

              {hasWht && (
                <Bot face={false}>
                  <p className="ic-text">{tr("ยอดเงินในไฟล์เป็นยอดก่อนหรือหลังหัก ณ ที่จ่ายครับ")}</p>
                  <div className="ic-segment" role="radiogroup" aria-label={tr("ยอดเงินในไฟล์")}>
                    <button type="button" role="radio" aria-checked={!amountsAreNet} onClick={() => amountsAreNet && change({ ...snapshot(), amountsAreNet: false })}>{tr("ยอดเต็มก่อนหัก")}</button>
                    <button type="button" role="radio" aria-checked={amountsAreNet} onClick={() => !amountsAreNet && change({ ...snapshot(), amountsAreNet: true })}>{tr("หลังหักแล้ว")}</button>
                  </div>
                  <p className="ic-meta">{tr("เช่น งาน 10,000 บาท หัก 3% แล้วกรอกไว้ 9,700 ให้เลือก หลังหักแล้ว ระบบจะคำนวณมูลค่างานก่อนหักให้")}</p>
                </Bot>
              )}

              <Bot face={false} testId="import-issues">
                <p className="ic-text">{groups.length ? tr("ข้อมูลอีก {0} จุดยังไม่ตรงกับแอป เลือกวิธีแก้ได้เลย หรือพิมพ์บอกเลขาเองก็ได้ครับ", groups.length) : tr("ไม่มีจุดที่ต้องแก้ครับ ข้อมูลพร้อมนำเข้า")}</p>
                {(groups.length > 0 || fixedRows.length > 0) && (
                  <section className="ic-card" aria-label={tr("ข้อมูลที่ยังไม่ตรง")}>
                    {groups.map(groupRow)}
                    {fixedRows.map(item => (
                      <div className="ic-issue is-done" key={`done-${item.issue}`}>
                        <div className="ic-issue-head"><p className="ic-issue-title">{tr("{0} · {1} แถว", tr(ISSUE_LABELS[item.issue]), item.count)}</p><span className="ic-pill is-ok"><Check className="h-3 w-3" aria-hidden="true" />{tr(item.label)}</span></div>
                      </div>
                    ))}
                  </section>
                )}
                {quiet.length > 0 && <p className="ic-meta" data-testid="import-quiet">{tr("ข้ามให้อัตโนมัติ: {0}", quiet.map(item => `${tr(ISSUE_LABELS[item.issue])} ${item.count}`).join(' · '))}</p>}
                {history.length > 0 && <button type="button" className="ic-link" onClick={undo}><Undo2 className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden="true" /> {tr("เปลี่ยนกลับการแก้ล่าสุด")}</button>}
              </Bot>

              {talk.map(item => (item.who === 'me' ? <Me key={item.id}>{item.text}</Me> : (
                <Bot key={item.id} mood={item.failed ? 'worried' : 'happy'}>
                  <p className="ic-text" data-testid="import-chat-reply">{item.text}</p>
                  {item.applied ? <p className="ic-meta">{tr("แก้แล้ว {0} อย่าง", item.applied)}{item.mark === history.length && <> · <button type="button" className="ic-link" onClick={undo}>{tr("เปลี่ยนกลับ")}</button></>}</p> : null}
                </Bot>
              )))}
              {sending && <Bot mood="thinking"><p className="ic-text ic-typing" role="status"><span className="ic-dots" aria-hidden="true"><i /><i /><i /></span>{tr("เลขากำลังดูให้…")}</p></Bot>}

              {!result && (
                <Bot face={false} testId="import-summary">
                  <section className="ic-card ic-summary" aria-label={tr("สรุปก่อนนำเข้า")}>
                    <p className="ic-card-title">{blocked ? tr("พร้อมนำเข้าเมื่อแก้ครบแล้ว") : tr("สรุปก่อนนำเข้า")}</p>
                    <div className="ic-tiles">
                      <div><span>{tr("งาน")}</span><b data-testid="import-job-count">{tr("{0} งาน", totals.jobs)}</b><em>{formatCurrency(totals.value)}</em></div>
                      <div><span>{tr("รายจ่าย")}</span><b data-testid="import-expense-count">{tr("{0} รายการ", newExpenses)}</b><em>{formatCurrency(totals.expenseAmount)}</em></div>
                      <div><span>{tr("ไม่นำเข้า")}</span><b>{tr("{0} แถว", notImportedRows)}</b><em>{details.updates ? tr("อัปเดต {0} รายการ", details.updates) : tr("ข้ามหรือรอยืนยัน")}</em></div>
                    </div>
                    {reconciliation.length > 0 && (
                      <p className={`ic-check ${allMatch ? 'is-ok' : 'is-wait'}`} data-testid="import-total-check">
                        {allMatch ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{reconciliation.length === 1 ? tr("ตรงกับยอดในไฟล์ {0}", reconciliation[0].count ? String(reconciliation[0].file) : formatCurrency(reconciliation[0].file)) : tr("ตรงกับยอดในไฟล์ทุกตัว ({0} ยอด)", reconciliation.length)}</>
                          : <><AlertTriangle className="h-4 w-4" aria-hidden="true" />{tr("ไม่ตรง {0} จาก {1} ยอด", reconciliation.filter(check => !check.ok).length, reconciliation.length)} · {reconciliation.filter(check => !check.ok).map(check => check.label).slice(0, 2).join(', ')}</>}
                      </p>
                    )}
                    {personalRows.length > 0 && (
                      <label className="ic-tick">
                        <input type="checkbox" checked={includePersonal} onChange={e => { setIncludePersonal(e.target.checked); setIncluded(all => Object.fromEntries(Object.entries(all).filter(([key]) => !personalRows.some(row => row.key === key)))); }} className="accent-[#E65F2B]" />
                        <span>{tr("นำเข้ารายจ่ายส่วนตัวด้วย ({0} รายการ {1})", personalRows.length, formatCurrency(personalTotal))}</span>
                      </label>
                    )}
                    {missingExpenseDates > 0 && <p className="ic-meta is-warn">{tr("รายจ่าย {0} รายการยังไม่มีวันที่ ใส่วันที่ก่อน ไม่อย่างนั้นจะยังไม่นำเข้า", missingExpenseDates)}</p>}
                    {waiting.length > 0 && <p className="ic-meta is-warn" data-testid="import-columns-to-confirm">{tr("ยืนยันคอลัมน์ที่เลขาเดาให้ก่อน: {0}", waiting.map(c => columnName(c.header, c.index)).join(', '))}</p>}
                    <p className="ic-meta">{tr("ยังไม่ได้บันทึกจนกว่าจะกดนำเข้า · ยกเลิกทั้งชุดได้ภายใน 7 วัน")}</p>
                    <div className="ic-actions">
                      <button type="button" className="ic-button" aria-expanded={reviewOpen} onClick={() => { setReviewFilter('all'); setReviewOpen(shown => !shown); }}>{reviewOpen ? tr("ซ่อนตาราง") : tr("ดูทุกแถวก่อน")}</button>
                      <button type="button" className="ic-button is-primary" onClick={commit} disabled={blocked || !importCount} data-testid="import-commit">
                        <Upload className="h-4 w-4" aria-hidden="true" />{tr("นำเข้า {0} รายการ", importCount)}
                      </button>
                    </div>
                  </section>
                  {reviewOpen && (
                    <div ref={reviewRef} className="ic-review">
                      <ImportReview rows={rows} isIncluded={isIncluded} included={included} setIncluded={change2 => setIncluded(change2)} edits={edits} setEdits={change2 => setEdits(change2)}
                        multiSheet={multiSheet} filter={reviewFilter} setFilter={setReviewFilter} phone={phone} />
                    </div>
                  )}
                </Bot>
              )}

              {result && (
                <Bot mood={undone ? 'happy' : saveState === 'saving' ? 'waiting' : saveState.state === 'failed' ? 'worried' : 'celebrate'}>
                  <div data-testid="import-save-state" data-state={undone ? 'undone' : saveState === 'saving' ? 'saving' : saveState.state}>
                    <p className="ic-text font-medium">{undone ? tr("ยกเลิกการนำเข้าแล้ว") : saveState === 'saving' ? tr("กำลังบันทึกขึ้นระบบ…") : saveState.state === 'failed' ? tr("บันทึกขึ้นระบบไม่สำเร็จ") : tr("นำเข้าเรียบร้อยครับ")}</p>
                    <p className="ic-text">{undone
                      ? tr("รายการจากไฟล์นี้ถูกนำออก และรายการที่ไฟล์นี้อัปเดตกลับเป็นค่าเดิมแล้ว")
                      : saveState === 'saving' ? tr("เพิ่ม {0} งาน และ {1} รายจ่าย อย่าเพิ่งปิดหน้านี้", result.jobs, result.expenses)
                        : saveState.state === 'failed' ? tr("{0} รายการยังอยู่ในหน้านี้ ลองบันทึกอีกครั้ง หรือยกเลิกการนำเข้านี้", saveState.error)
                          : `${tr("เพิ่ม {0} งาน และ {1} รายจ่าย จาก {2} ถ้าไม่ถูกต้อง ยกเลิกการนำเข้านี้ได้ที่นี่ หรือที่ ตั้งค่า > สำรอง & นำเข้าข้อมูล ภายใน 7 วัน", result.jobs, result.expenses, fileName)}${result.updates ? tr(" อัปเดตรายการเดิม {0} รายการ", result.updates) : ''}${saveState.state === 'local' ? tr(" บันทึกไว้ในเครื่องนี้ (โหมดทดลอง)") : ''}`}</p>
                    <div className="ic-actions is-start">
                      {!undone && saveState !== 'saving' && saveState.state === 'failed' && <button type="button" onClick={retrySave} className="ic-button is-primary"><RefreshCw className="h-4 w-4" aria-hidden="true" />{tr("ลองบันทึกอีกครั้ง")}</button>}
                      {!undone && saveState !== 'saving' && saveState.state !== 'failed' && <button type="button" onClick={() => { close(); onViewJobs(); }} className="ic-button is-primary">{tr("ดูงานที่นำเข้า")}</button>}
                      {!undone && <button type="button" onClick={() => { onUndo(result.batchId); setUndone(true); }} className="ic-button">{tr("ยกเลิกการนำเข้านี้")}</button>}
                      <button type="button" onClick={close} className="ic-button">{tr("ปิด")}</button>
                    </div>
                  </div>
                </Bot>
              )}
            </>)}
          </div>
        </div>

        {!result && (
          <footer className="ic-composer">
            <form className="ic-input" onSubmit={send}>
              <input type="file" id="import-sheet-file-again" accept={`.xlsx,.xlsm,.xls,.csv,.ods,.txt${onRestoreBackup ? ',.json' : ''}`} className="sr-only" tabIndex={-1}
                onChange={e => { const list = e.target.files; pickFile(list); e.target.value = ''; }} />
              <label htmlFor={fileName ? 'import-sheet-file-again' : 'import-sheet-file'} className="ic-attach" aria-label={fileName ? tr("เลือกไฟล์อื่น") : tr("แนบไฟล์")}><Paperclip className="h-5 w-5" aria-hidden="true" /></label>
              <label htmlFor="import-chat-input" className="sr-only">{tr("ข้อความถึงเลขากระรอก")}</label>
              <input id="import-chat-input" value={draft} onChange={e => setDraft(e.target.value.slice(0, 400))} maxLength={400} autoComplete="off"
                disabled={!sheets.length || !accountId || left === 0 || sending}
                placeholder={!sheets.length ? tr("วางไฟล์ก่อน แล้วพิมพ์บอกเลขาได้") : !accountId ? tr("เข้าสู่ระบบเพื่อพิมพ์บอกเลขา") : left === 0 ? tr("คุยเรื่องไฟล์นี้ครบแล้ว แตะปุ่มแก้ด้านบนได้") : phone ? tr("พิมพ์บอกเลขา") : tr("พิมพ์บอกเลขา เช่น คอลัมน์ C คือชื่อลูกค้า")} />
              <button type="submit" className="ic-send" aria-label={tr("ส่งข้อความ")} disabled={!draft.trim() || !sheets.length || !accountId || left === 0 || sending}><ArrowUp className="h-[18px] w-[18px]" aria-hidden="true" /></button>
            </form>
            <p className="ic-foot">{tr("เลขาเห็นเฉพาะชื่อคอลัมน์และตัวอย่างสั้น ๆ (ปิดอีเมลและเบอร์โทรไว้) · ตัวเลขทุกช่องระบบอ่านเองตามกฎ")}</p>
          </footer>
        )}
      </div>
    </Modal>
  );
}

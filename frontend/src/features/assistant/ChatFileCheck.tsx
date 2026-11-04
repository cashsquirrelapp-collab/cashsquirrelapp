import React from 'react';
import { useReducedMotion } from 'motion/react';
import { AlertTriangle, ArrowUpRight, Check, ClipboardCheck, Info, Loader2, Undo2 } from 'lucide-react';
import { tr, T } from '../../i18n/tr';
import { formatCurrency, safeFormatThaiDate } from '../../utils';
import { Money } from './ChatCards';
import type { FileCheck } from './fileCheck';
import { useImportActions } from '../import/importActions';
import { buildCommit, startsIncluded } from '../import/importCommit';
import { analyzeSheet, buildImportPlan, defaultIncluded, planDetails, planTotals, splitSideBySide, type ImportRow, type IssueCode } from '../import/sheetImport';
import { applyRemembered, editedRow, FIELD_LABELS, ISSUE_LABELS, rememberMapping, todayKey, type ImportResult, type SaveOutcome } from '../import/importShared';
import { applyGroupFix, columnsWaiting, issueGroups, quietCounts, sheetReports, withConfirmed, withTarget, type ChatState, type GroupFix, type IssueGroup, type SheetReport } from '../import/importChatModel';

// The file review in the เลขากระรอก chat (owner, 2026-11-04: "ถ้าเขาอยากทำในนี้ก็ให้เขาทำในนี้ แล้วก็ขึ้นพรีวิวโดยง่าย ... ทวนให้
// เขาดูก่อนแล้วก็ค่อยกดบันทึก ... ครบไหม หรือพบจุดบกพร่องอันไหนที่แชทไม่สามารถบันทึกได้ ... ก็แจ้งเขา หรือจะเสนอวิธีการปรับ").
// The import's own rules read the file against the account's own rows (importActions.ts), so nothing is saved twice and the
// figures are what is saved. The card ticks its checks, then shows the totals, every row to be saved, what cannot be saved
// and why (columns the app has no field for, tabs left out, rows missing something) with a fix where there is one, and
// บันทึก saves here, the whole batch undoable. Shown on เลขา's side of the chat as its report (owner, 2026-11-04).

const FIX_WORDS: Partial<Record<GroupFix, string>> = {
  confirm: T("นำเข้าตามที่อ่านได้"), today: T("ใช้วันนี้"), monthStart: T("ใช้วันแรกของเดือน"), monthEnd: T("ใช้วันสิ้นเดือน"),
  skip: T("ข้ามแถวเหล่านี้"), include: T("นำเข้าด้วย"), update: T("อัปเดตรายการเดิม"), noUpdate: T("ไม่อัปเดต"),
};
const NOT_IMPORTED: Record<NonNullable<SheetReport['notImported']>, string> = {
  monthsAcross: T("แท็บ “{0}” เป็นตารางสรุปรายเดือน มีแต่ยอดรวม จึงนำเข้าเป็นรายการไม่ได้"),
  summary: T("แท็บ “{0}” ดูเป็นหน้าสรุปหรือคำอธิบาย จึงยังไม่ได้นำเข้า"),
  lookup: T("แท็บ “{0}” เป็นรายชื่อสำหรับแปลงรหัส เลขาใช้แปลงรหัสในแท็บอื่นเป็นชื่อให้แล้ว"),
  empty: T("แท็บ “{0}” ไม่มีข้อมูล"),
};
const SHOWN = 4;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const shortDate = (date?: string | null) => (date ? safeFormatThaiDate(date, { day: 'numeric', month: 'short', year: '2-digit' }) : '');

type Saved = { result: ImportResult; state: 'saving' | SaveOutcome; undone: boolean };
type Finding = { key: string; tone: 'ok' | 'warn' | 'info'; text: string; actions?: { label: string; pressed?: boolean; run: () => void }[] };

function JobStatus({ row, today }: { row: ImportRow; today: string }) {
  const job = row.job!;
  if (!(job.pending > 0)) return <span className="asx-review-chip is-in">{tr("รับครบ")}</span>;
  if (job.payDate && job.payDate < today) return <span className="asx-review-chip is-out">{tr("เกินกำหนด")}</span>;
  return <span className="asx-review-chip">{job.received > 0 ? tr("รับบางส่วน") : tr("ค้างรับ")}</span>;
}

/** One list of rows to be saved: a few shown, the rest behind ดูทั้งหมด. */
function RowList({ title, rows, render, testId }: { title: string; rows: ImportRow[]; render: (row: ImportRow) => React.ReactNode; testId: string }) {
  const [all, setAll] = React.useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <section className="asx-review-list" aria-label={title} data-testid={testId}>
      <p className="asx-review-title">{title}</p>
      <ul className={all && rows.length > 8 ? 'is-scroll' : undefined}>{shown.map(row => <li key={row.key}>{render(row)}</li>)}</ul>
      {rows.length > SHOWN && (
        <button type="button" className="asx-review-more" onClick={() => setAll(value => !value)} aria-expanded={all}>
          {all ? tr("ย่อรายการ") : tr("ดูทั้งหมด {0} รายการ", rows.length)}
        </button>
      )}
    </section>
  );
}

export function FileCheckCard({ name, check }: { name: string; check: FileCheck }) {
  const reduce = useReducedMotion() ?? false;
  const actions = useImportActions();
  const today = React.useMemo(() => todayKey(), []);
  const source = check.source;
  // The file as the import window would start it: tabs analysed (with layouts chosen before), nothing edited yet.
  const [state, setState] = React.useState<ChatState | null>(() => {
    if (!source) return null;
    const prepared = source.grids.filter(grid => grid.rows.some(row => row.some(cell => cell.text))).flatMap(splitSideBySide);
    return { sheets: prepared.map(grid => { const analysis = applyRemembered(analyzeSheet(grid)); return { grid, analysis, include: defaultIncluded(analysis) }; }), edits: {}, included: {}, amountsAreNet: false };
  });
  const [saved, setSaved] = React.useState<Saved | null>(null);
  // Planned against the account's own rows; once saved, frozen (the new rows would read as duplicates of themselves).
  const jobs = saved ? null : actions?.jobs;
  const expenses = saved ? null : actions?.expenses;
  const plan = React.useMemo(() => (state && actions ? buildImportPlan(state.sheets.filter(sheet => sheet.include),
    { amountsAreNet: state.amountsAreNet, today, ...(source?.fingerprint ? { source: { fileName: source.fileName, fingerprint: source.fingerprint } } : {}) },
    { statuses: actions.statuses, jobTypes: actions.jobTypes, existingJobs: actions.jobs, existingExpenses: actions.expenses }, state.sheets.map(sheet => sheet.grid))
    : null), [state, actions?.statuses, actions?.jobTypes, jobs, expenses]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = React.useMemo(() => (plan && state ? plan.rows.map(row => editedRow(row, state.edits[row.key])) : []), [plan, state]);
  const isIncluded = React.useCallback((row: ImportRow) => row.kind !== 'skip' && (state?.included[row.key] ?? startsIncluded(row)), [state]);
  const totals = planTotals(rows, isIncluded);
  const details = planDetails(rows, isIncluded);
  const chosen = rows.filter(isIncluded);
  const jobRows = chosen.filter(row => row.job && !row.update);
  const expenseRows = chosen.filter(row => row.expense && !row.update && row.expense.date);
  const reports = state ? sheetReports(state.sheets) : [];
  const waiting = state ? columnsWaiting(state.sheets) : [];
  const blocked = waiting.length > 0 || reports.some(report => report.include && (report.missingName || report.missingAmount));
  const saveCount = jobRows.length + expenseRows.length + details.updates;
  const paid = jobRows.filter(row => !(row.job!.pending > 0)).length;
  const overdue = jobRows.filter(row => row.job!.pending > 0 && row.job!.payDate && row.job!.payDate < today).length;
  const expenseTotal = expenseRows.reduce((sum, row) => sum + row.expense!.amount, 0);

  const tabs = reports.filter(report => report.include);
  const steps = [
    tr("อ่าน {0} แท็บ · {1} แถว", tabs.length, tabs.reduce((sum, report) => sum + report.rows, 0).toLocaleString('en-US')),
    tr("จับคอลัมน์ได้ {0} คอลัมน์", tabs.reduce((sum, report) => sum + report.matched.length + report.toConfirm.length, 0)),
    tr("เทียบกับรายการที่มีในแอปแล้ว"),
    tr("พร้อมบันทึก {0} รายการ", saveCount),
  ];
  // The checks tick one by one as the card opens (they already ran on the device).
  const [shown, setShown] = React.useState(reduce ? steps.length : 0);
  React.useEffect(() => {
    if (shown >= steps.length) return;
    const timer = window.setTimeout(() => setShown(value => value + 1), 260);
    return () => window.clearTimeout(timer);
  }, [shown, steps.length]);
  const checking = shown < steps.length;

  const update = (next: ChatState) => setState(next);

  // What to know before saving: questions with their answers first, then what is left out and why.
  const findings: Finding[] = [];
  if (state) {
    for (const column of waiting) {
      const sheet = state.sheets[column.sheetIndex];
      const setSheet = (next: typeof sheet) => update({ ...state, sheets: state.sheets.map((item, index) => (index === column.sheetIndex ? next : item)) });
      findings.push({ key: `col-${column.sheetIndex}-${column.index}`, tone: 'warn',
        text: tr("คอลัมน์ “{0}” น่าจะเป็น {1} ใช่ไหม", column.header || tr("ไม่มีหัว"), tr(FIELD_LABELS[column.target])),
        actions: [{ label: tr("ใช่"), run: () => setSheet(withConfirmed(sheet, column.index)) }, { label: tr("ไม่ใช่ เก็บไว้ในหมายเหตุ"), run: () => setSheet(withTarget(sheet, column.index, 'keep')) }] });
    }
    for (const report of tabs) {
      if (!report.missingName && !report.missingAmount) continue;
      findings.push({ key: `miss-${report.index}`, tone: 'warn',
        text: report.missingAmount ? tr("แท็บ “{0}” ไม่พบคอลัมน์ยอดเงิน จึงบันทึกไม่ได้", report.name) : tr("แท็บ “{0}” ไม่พบคอลัมน์ชื่องานหรือรายการ จึงบันทึกไม่ได้", report.name),
        actions: [{ label: tr("ไม่นำเข้าแท็บนี้"), run: () => update({ ...state, sheets: state.sheets.map((item, index) => (index === report.index ? { ...item, include: false } : item)) }) }] });
    }
    for (const group of issueGroups(rows, state.included)) {
      const label = tr(ISSUE_LABELS[group.issue]);
      const left = group.rows.filter(row => !isIncluded(row)).length;
      findings.push({ key: `issue-${group.issue}`, tone: group.state === 'check' ? 'info' : 'warn',
        text: group.state === 'skip' ? tr("{0} แถว: {1} จึงบันทึกไม่ได้", group.rows.length, label)
          : group.state === 'check' ? tr("{0} แถว: {1} (บันทึกได้ ตรวจทีหลังได้)", group.rows.length, label)
            : left ? tr("{0} แถว: {1} ยังไม่บันทึกจนกว่าจะเลือก", group.rows.length, label) : tr("{0} แถว: {1} จะบันทึกด้วย", group.rows.length, label),
        actions: group.fixes.filter(choice => FIX_WORDS[choice]).map(choice => ({
          label: choice === 'skip' ? tr("ข้าม {0} แถวนี้", group.rows.length) : tr(FIX_WORDS[choice]!),
          pressed: choice === 'skip' ? group.decided && left === group.rows.length : choice === 'confirm' || choice === 'include' ? group.decided && left === 0 : undefined,
          run: () => update(applyGroupFix(state, rows, group.issue, choice, today)) })) });
    }
    const kept = [...new Set(tabs.flatMap(report => report.kept.map(column => column.header).filter(Boolean)))];
    if (kept.length) findings.push({ key: 'kept', tone: 'info', text: tr("คอลัมน์ {0} ไม่มีช่องในแอป จะเก็บไว้ในหมายเหตุของแต่ละรายการ", kept.map(header => `“${header}”`).join(', ')) });
    for (const report of reports) if (!report.include && report.notImported) findings.push({ key: `tab-${report.index}`, tone: 'info', text: tr(NOT_IMPORTED[report.notImported], report.name) });
    for (const { issue, count } of quietCounts(rows)) findings.push({ key: `quiet-${issue}`, tone: 'info', text: tr("{0} แถว: {1} จึงไม่นับซ้ำ", count, tr(ISSUE_LABELS[issue as IssueCode])) });
    for (const total of plan?.checks ?? []) {
      const field = tr(FIELD_LABELS[total.field as keyof typeof FIELD_LABELS] ?? '');
      findings.push({ key: `total-${total.sheet}-${total.field}`, tone: total.ok ? 'ok' : 'warn',
        text: total.ok ? tr("{0} แท็บ “{1}” ตรงกับแถวรวมในไฟล์", field, total.sheet)
          : tr("{0} แท็บ “{1}” ในไฟล์ {2} แต่อ่านได้ {3}", field, total.sheet, formatCurrency(total.fileTotal), formatCurrency(total.rowsTotal)) });
    }
    if (state.sheets.some(sheet => sheet.include && sheet.analysis.columns.some(column => column.target === 'whtRate' || column.target === 'whtAmount'))) {
      findings.push({ key: 'wht', tone: 'info', text: tr("ยอดเงินในไฟล์เป็นยอดก่อนหรือหลังหัก ณ ที่จ่าย"), actions: [
        { label: tr("ก่อนหัก"), pressed: !state.amountsAreNet, run: () => update({ ...state, amountsAreNet: false }) },
        { label: tr("หลังหัก"), pressed: state.amountsAreNet, run: () => update({ ...state, amountsAreNet: true }) },
      ] });
    }
  }

  const save = () => {
    if (!actions || !state || !plan || blocked || !saveCount) return;
    for (const sheet of state.sheets) if (sheet.include) rememberMapping(sheet.analysis);
    const result = actions.onImport(buildCommit(chosen, plan.newJobTypes, [...actions.jobs, ...actions.expenses]));
    setSaved({ result, state: 'saving', undone: false });
    void result.saved.then(outcome => setSaved(current => (current && current.result === result ? { ...current, state: outcome } : current)));
  };
  const retry = () => {
    if (!actions || !saved) return;
    setSaved({ ...saved, state: 'saving' });
    void actions.onRetrySave(saved.result.batchId).then(outcome => setSaved(current => (current ? { ...current, state: outcome } : current)));
  };
  const undo = () => { if (actions && saved) { actions.onUndo(saved.result.batchId); setSaved({ ...saved, undone: true }); } };

  const failed = Boolean(saved && saved.state !== 'saving' && saved.state.state === 'failed');
  const head = saved ? (saved.undone ? { tone: 'muted', text: tr("ยกเลิกแล้ว") } : saved.state === 'saving' ? { tone: 'busy', text: tr("กำลังบันทึก") } : failed ? { tone: 'failed', text: tr("ไม่สำเร็จ") } : { tone: 'done', text: tr("บันทึกแล้ว") })
    : checking ? { tone: 'busy', text: tr("กำลังตรวจ") } : { tone: 'done', text: tr("ตรวจแล้ว") };

  return (
    <div className="asx-rcard is-file-check" data-testid="chat-file-check" aria-busy={checking}>
      <div className="asx-rcard-head">
        <span className="asx-rcard-icon"><ClipboardCheck size={16} strokeWidth={1.9} /></span><b>{tr("ตรวจไฟล์ {0}", name)}</b>
        <span className={`asx-card-state is-${head.tone}`}>{head.tone === 'busy' && saved ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <i aria-hidden="true" />}{head.text}</span>
      </div>

      {saved ? (
        <div className="asx-check-result" data-testid="chat-file-saved">
          <dl className="asx-rcard-rows">
            {saved.result.jobs > 0 && <div><dt>{tr("งานที่บันทึก")}</dt><dd>{tr("{0} งาน", saved.result.jobs)}</dd></div>}
            {saved.result.expenses > 0 && <div><dt>{tr("รายจ่ายที่บันทึก")}</dt><dd>{tr("{0} รายการ", saved.result.expenses)}</dd></div>}
            {saved.result.updates > 0 && <div><dt>{tr("อัปเดตรายการเดิม")}</dt><dd>{tr("{0} รายการ", saved.result.updates)}</dd></div>}
          </dl>
          {saved.undone ? <p className="asx-card-context">{tr("นำรายการจากไฟล์นี้ออกจากแอปแล้ว")}</p> : (
            <>
              <div className="asx-rcard-actions">
                {failed ? <button type="button" className="asx-pill-btn is-primary" onClick={retry}>{tr("ลองบันทึกอีกครั้ง")}</button>
                  : <button type="button" className="asx-pill-btn is-primary" onClick={() => actions?.onViewJobs()}>{tr("ดูงานที่บันทึก")}<ArrowUpRight size={15} aria-hidden="true" /></button>}
                <div className="asx-rcard-secondary">
                  <button type="button" className="asx-pill-btn" onClick={undo}><Undo2 size={14} aria-hidden="true" />{tr("ยกเลิกการบันทึกนี้")}</button>
                </div>
              </div>
              <p className="asx-card-context">{failed ? (saved.state as { error: string }).error : tr("ยกเลิกทั้งชุดได้ภายใน 7 วันที่ ตั้งค่า › สำรอง & นำเข้าข้อมูล")}</p>
            </>
          )}
        </div>
      ) : (
        <>
          <ol className="asx-check-steps">
            {steps.map((step, index) => (
              <li key={step} className={index < shown ? 'is-done' : 'is-waiting'}>
                <span className="asx-check-mark" aria-hidden="true">{index < shown && <Check size={12} strokeWidth={3} />}</span><span>{step}</span>
              </li>
            ))}
          </ol>
          {!checking && (
            <div className="asx-check-result">
              {jobRows.length > 0 && (
                <>
                  <div className="asx-card-preview">
                    <p className="asx-card-eyebrow">{tr("งาน {0} รายการ · มูลค่ารวม", jobRows.length)}</p>
                    <strong className="asx-card-amount"><Money value={formatCurrency(totals.value)} /></strong>
                  </div>
                  {totals.received + totals.pending > 0 && (() => {
                    const received = pct(totals.received, totals.received + totals.pending);
                    const owed = Math.round((100 - received) * 10) / 10;
                    return (
                      <div className="asx-check-bar" role="img" aria-label={tr("รับแล้ว {0}% ค้างรับ {1}%", received, owed)}>
                        <span className="asx-check-track"><i style={{ width: `${received}%` }} /></span>
                        <span className="asx-check-legend"><b className="is-in">{tr("รับแล้ว {0}%", received)} · <Money value={formatCurrency(totals.received)} /></b>
                          <b>{tr("ค้างรับ {0}%", owed)} · <Money value={formatCurrency(totals.pending)} /></b></span>
                      </div>
                    );
                  })()}
                  <dl className="asx-check-tiles">
                    <div><dt>{tr("รับครบ")}</dt><dd className="is-in">{paid}</dd></div>
                    <div><dt>{tr("ยังไม่ถึงกำหนด")}</dt><dd>{jobRows.length - paid - overdue}</dd></div>
                    <div><dt>{tr("เกินกำหนด")}</dt><dd className={overdue ? 'is-out' : undefined}>{overdue}</dd></div>
                  </dl>
                </>
              )}
              {expenseRows.length > 0 && (
                <dl className="asx-rcard-rows"><div><dt>{tr("รายจ่าย {0} รายการ", expenseRows.length)}</dt><dd className="is-expense"><Money value={formatCurrency(expenseTotal)} /></dd></div></dl>
              )}

              <RowList testId="chat-file-jobs" title={tr("งานที่จะบันทึก {0} รายการ", jobRows.length)} rows={jobRows} render={row => (
                <>
                  <span className="asx-review-main"><b>{row.job!.name}</b><small>{[row.job!.client, shortDate(row.job!.payDate || row.job!.postDate)].filter(Boolean).join(' · ')}</small></span>
                  <span className="asx-review-side"><span className="asx-review-amount"><Money value={formatCurrency(row.job!.value)} /></span><JobStatus row={row} today={today} /></span>
                </>
              )} />
              <RowList testId="chat-file-expenses" title={tr("รายจ่ายที่จะบันทึก {0} รายการ", expenseRows.length)} rows={expenseRows} render={row => (
                <>
                  <span className="asx-review-main"><b>{row.expense!.name}</b><small>{[row.expense!.category, shortDate(row.expense!.date)].filter(Boolean).join(' · ')}</small></span>
                  <span className="asx-review-side is-out"><span className="asx-review-amount"><Money value={formatCurrency(row.expense!.amount)} /></span></span>
                </>
              )} />

              {findings.length > 0 && (
                <section className="asx-review-findings" aria-label={tr("ตรวจความครบถ้วน")} data-testid="chat-file-findings">
                  <p className="asx-review-title">{tr("ตรวจความครบถ้วน")}</p>
                  <ul>
                    {findings.map(item => (
                      <li key={item.key} className={`is-${item.tone}`}>
                        <span className="asx-review-icon" aria-hidden="true">{item.tone === 'ok' ? <Check size={13} strokeWidth={3} /> : item.tone === 'warn' ? <AlertTriangle size={13} strokeWidth={2.4} /> : <Info size={13} strokeWidth={2.4} />}</span>
                        <span className="asx-review-text"><span>{item.text}</span>
                          {item.actions && <span className="asx-review-fixes">{item.actions.map(action => (
                            <button key={action.label} type="button" className={`asx-review-fix${action.pressed ? ' is-on' : ''}`} aria-pressed={action.pressed} onClick={action.run}>{action.label}</button>
                          ))}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Saved here only (owner, 2026-11-04: "ไม่ต้องไปโยงเข้าไปในไฟล์ export ไอ้นั้นไม่เอา"): no link to the import window. */}
              <div className="asx-rcard-actions">
                <button type="button" className="asx-pill-btn is-primary" onClick={save} disabled={!actions || blocked || !saveCount}>{tr("บันทึก {0} รายการ", saveCount)}</button>
              </div>
              <p className="asx-card-context">{blocked ? tr("ตอบคำถามในส่วนตรวจความครบถ้วนก่อน แล้วจึงบันทึกได้") : tr("บันทึกในแชตนี้ได้เลย ยกเลิกทั้งชุดได้ภายใน 7 วัน")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The check cards of a sent message's files. */
export function FileChecks({ files }: { files: { name: string; check?: FileCheck }[] }) {
  const checked = files.filter((file): file is { name: string; check: FileCheck } => Boolean(file.check));
  if (!checked.length) return null;
  return <>{checked.map(file => <FileCheckCard key={file.name} name={file.name} check={file.check} />)}</>;
}

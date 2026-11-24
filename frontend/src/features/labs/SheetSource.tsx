import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { Expense, Job, SheetSeen, StatusOption } from '../../../../shared/types';
import { labOn } from '../../../../shared/labs';
import { sheetRowUrl, type GoogleStatus, type SheetLink, type SheetMap } from '../../../../shared/googleSheets';
import { exampleRowsOf, isIncomeTypeColumn } from '../../../../shared/sheetRow';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi } from '../../services/google';
import { useLabs } from '../../services/labs';
import { planSheetExpenseSync, planSheetSync, type SheetExpenseChanges, type SheetSyncChanges } from './sheetSync';
import './labs.css';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs, and since 2026-11-14 the expenses page too), as the owner approved it on 2026-11-14 ("โอเคนะ" to the mocks): the Jobs page
// stays as it is with one line on top, "ข้อมูลจากชีต <file> · อัปเดต 09:12" and เปิดชีต; a job from the sheet says in its
// details "อยู่ในชีต <file> · แท็บ … · แถว 6" with ดูในชีต, which opens the sheet at that row. The page reads the sheet when
// it opens and again when the person comes back to it (from editing the sheet in another tab), at most every 20 seconds.
// Kept in a labs file: เลขา's page words never name a test feature.

let statusCache: { account: string; at: number; status: GoogleStatus } | null = null;
const listeners = new Set<() => void>();
const STATUS_TTL = 60_000;

/** A connection just changed elsewhere (the sheet map saved from เลขา's chat): the Jobs page reads it at once. */
export function rememberGoogleStatus(account: string, status: GoogleStatus): void {
  statusCache = { account, at: Date.now(), status };
  listeners.forEach(fn => fn());
}

/** The connected sheet's file id when it is ready to write into (connected, a file picked, its map saved), else null.
 *  Shares the minute-long cache, so saving records does not ask Google's status each time. */
export async function sheetReadyFor(account: string): Promise<string | null> {
  let status = statusCache?.account === account && Date.now() - statusCache.at < STATUS_TTL ? statusCache.status : null;
  if (!status) {
    status = await googleApi.status(account).catch(() => null);
    if (status) rememberGoogleStatus(account, status);
  }
  return status?.connected && status.file && status.map?.fileId === status.file.id ? status.file.id : null;
}

/** The account's Google connection, read once a minute and shared by the page and the job details. */
function useGoogleStatus(account: string | null, on: boolean): GoogleStatus | null {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => { listeners.add(force); return () => { listeners.delete(force); }; }, []);
  React.useEffect(() => {
    if (!on || !account || (statusCache?.account === account && Date.now() - statusCache.at < STATUS_TTL)) return;
    googleApi.status(account).then(status => { statusCache = { account, at: Date.now(), status }; listeners.forEach(fn => fn()); }).catch(() => undefined);
  }, [on, account]);
  return on && account && statusCache?.account === account ? statusCache.status : null;
}

const jobTabOf = (map: SheetMap | null | undefined) => map?.tabs.find(tab => tab.use && tab.kind !== 'expenses') ?? null;
/** รายจ่ายจากชีต: the expense tab, or a ledger with money in and out. */
const expenseTabOf = (map: SheetMap | null | undefined) => map?.tabs.find(tab => tab.use && tab.kind === 'expenses') ?? map?.tabs.find(tab => tab.use && tab.kind === 'mixed') ?? null;
const lastColumnOf = (map: SheetMap | null | undefined, tab: string) => Math.max(0, ...(map?.tabs.find(item => item.name === tab)?.columns.map(column => column.index) ?? [0]));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const timeOf = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const SYNC_GAP = 20_000;
/** While the app is open and on screen, the sheet is read again this often wherever the person is in the app. */
const SYNC_EVERY = 60_000;

type Confirm = (title: string, message: string, onYes: () => void, onNo?: () => void) => void;

// One reading for the whole app (owner, 2026-11-18: "ในส่วนรายจ่ายของชีตอ่ะกูยังไม่เห็นมันอัปเดตเลย ... อัปเดตให้หมด"): the
// jobs were kept in step only while the jobs page was open, and the expenses only on the expenses page, so a sheet edited
// while the person was elsewhere waited, and the app's own changes reached the sheet only from those pages. App now runs
// useSheetEngine: one reading of the sheet, both kinds planned from it, when the app opens, when it comes back on screen
// (at most every 20 seconds) and every minute while it is on screen. The lines over the two lists show what it found.
interface EngineView {
  fileId: string | null; readAt: Date | null; reading: boolean; problem: boolean;
  held: { jobs: string[]; expenses: string[] }; examples: number; examplesProblem: string; deletingExamples: boolean;
}
let view: EngineView = { fileId: null, readAt: null, reading: false, problem: false, held: { jobs: [], expenses: [] }, examples: 0, examplesProblem: '', deletingExamples: false };
const viewListeners = new Set<() => void>();
const setView = (patch: Partial<EngineView>) => { view = { ...view, ...patch }; viewListeners.forEach(fn => fn()); };
let runSync: ((force?: boolean) => Promise<void>) | null = null;
function useView(): EngineView {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => { viewListeners.add(force); return () => { viewListeners.delete(force); }; }, []);
  return view;
}

/** The app's one reading of the connected sheet: plans the jobs and the expenses from it and hands both to App. */
export function useSheetEngine(input: {
  enabled: boolean; jobs: Job[]; expenses: Expense[]; statuses: StatusOption[]; jobTypes: string[]; seen?: SheetSeen | null;
  onJobs: (changes: SheetSyncChanges) => void; onExpenses: (changes: SheetExpenseChanges) => void;
  /** Records in the app not in the sheet: sent there by App (sendRecordsToSheet), without asking (owner, 2026-11-18). */
  onSendJobs?: (jobs: Job[]) => void; onSendExpenses?: (expenses: Expense[]) => void;
  /** False while App is writing to the sheet or has given up sending for this session. */
  canSend?: () => boolean;
  /** A record on its way to the sheet right now. */
  busy?: (id: string) => boolean;
  /**
   * True when this device has the server's latest records (App.tsx sheetFresh). A reading is planned only then: a sheet
   * row changed by another device is in the server already (that device writes the row after its own save lands), so a
   * reading on an older copy would save over that device's save and its next save would fail with บันทึกไม่สำเร็จ.
   */
  fresh?: () => Promise<boolean>;
}): void {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = input.enabled && Boolean(account) && labOn(labs, 'sheetJobs');
  const status = useGoogleStatus(account, on);
  const file = status?.connected ? status.file ?? null : null;
  const map = file && status?.map?.fileId === file.id ? status.map : null;
  const ready = Boolean(on && account && file && map && (jobTabOf(map) || expenseTabOf(map)));
  const latest = React.useRef(input);
  latest.current = input;
  const lastRun = React.useRef(0);
  const inFlight = React.useRef(false);
  const staleTries = React.useRef(0);
  const examplesTried = React.useRef(new Set<string>());
  const typesTried = React.useRef(new Set<string>());
  // The connection as it stands, kept apart from the object identities a status refresh renews: a new reading starts when
  // the account, the file or its saved map changes, not when the same status is fetched again.
  const where = React.useRef({ account, file, map });
  where.current = { account, file, map };
  const readyKey = ready && account && file && map ? `${account}|${file.id}|${map.at}` : '';

  const sync = React.useCallback(async (force = false) => {
    const { account, file, map } = where.current;
    if (!readyKey || !account || !file || !map) return;
    // One reading at a time: two at once would both plan from the same records and add the same rows twice.
    if (inFlight.current) return;
    if (!force && Date.now() - lastRun.current < SYNC_GAP) return;
    let again = false;
    inFlight.current = true;
    lastRun.current = Date.now();
    setView({ reading: true });
    try {
      const reply = await googleApi.read(account);
      // Not up to date with the server (or this device's own edit not saved yet): this reading is left; the app catches up
      // and the sheet is read again in a few seconds (three tries, then the next round).
      if (latest.current.fresh && !(await latest.current.fresh())) {
        if (staleTries.current < 3) { staleTries.current += 1; window.setTimeout(() => { void sync(true); }, 3_000); }
        return;
      }
      staleTries.current = 0;
      const now = latest.current;
      const recentRows = reply.recentRows ?? [];
      const held = { jobs: [] as string[], expenses: [] as string[] };
      const examples = reply.tabs.reduce((sum, item) => sum + exampleRowsOf(item.rows).length, 0);
      // Records the reading just linked to a row are in the sheet already, though the app's state has not caught up yet.
      const justLinked = new Set<string>();
      const sendable = examples === 0 && (now.canSend?.() ?? true);
      if (jobTabOf(map)) {
        const changes = planSheetSync({ jobs: now.jobs, tabs: reply.tabs, map, fileId: file.id, statuses: now.statuses, jobTypes: now.jobTypes, today: todayKey(), seen: now.seen, recentRows });
        if (changes.add.length || changes.update.length || changes.remove.length || changes.seen || changes.push.length) now.onJobs(changes);
        held.jobs = changes.held;
        for (const update of changes.update) if (update.fields.sheetLink) justLinked.add(update.id);
        const missing = now.jobs.filter(job => !job.sheetLink && !justLinked.has(job.id) && !now.busy?.(job.id));
        if (sendable && missing.length) now.onSendJobs?.(missing);
      }
      if (expenseTabOf(map)) {
        const changes = planSheetExpenseSync({ expenses: now.expenses, tabs: reply.tabs, map, fileId: file.id, today: todayKey(), seen: now.seen, recentRows });
        if (changes.add.length || changes.update.length || changes.remove.length || changes.seen || changes.push.length) now.onExpenses(changes);
        held.expenses = changes.held;
        for (const update of changes.update) if (update.fields.sheetLink) justLinked.add(update.id);
        const missing = now.expenses.filter(expense => !expense.sheetLink && !justLinked.has(expense.id) && !now.busy?.(expense.id));
        if (sendable && missing.length) now.onSendExpenses?.(missing);
      }
      setView({ fileId: file.id, readAt: new Date(), problem: false, held, examples });
      // The template's example rows (owner: "เอาตัวอย่างออกด้วยดิ"): taken out of the sheet by themselves, once a session per
      // file, before anything is sent (the rows below them move up); the reading after that sends what is missing.
      // Job rows with no ประเภทเงินได้ (written before 2026-11-18): the sheet's reports counted no income; filled once a session.
      const jobTab = jobTabOf(map);
      const typeColumn = jobTab?.columns.find(isIncomeTypeColumn);
      const jobRows = jobTab ? reply.tabs.find(item => item.name === jobTab.name)?.rows ?? [] : [];
      const firstData = jobTab ? (jobTab.headerRow ?? -1) + 1 : 0;
      const untyped = typeColumn ? jobRows.slice(firstData).some(cells => !String(cells[typeColumn.index]?.text ?? '').trim()
        && jobTab!.columns.some(column => column.target === 'name' && String(cells[column.index]?.text ?? '').trim())) : false;
      if (untyped && examples === 0 && !typesTried.current.has(file.id) && (now.canSend?.() ?? true)) {
        typesTried.current.add(file.id);
        await googleApi.fillIncomeTypes(account).catch(() => null);
      }
      if (examples > 0 && !examplesTried.current.has(file.id) && (now.canSend?.() ?? true)) {
        examplesTried.current.add(file.id);
        const result = await googleApi.deleteExamples(account).catch(() => null);
        if (result && !result.error && result.deleted > 0) again = true;
      }
    } catch { setView({ problem: true }); }
    finally { inFlight.current = false; setView({ reading: false }); if (again) void sync(true); }
  }, [readyKey]);

  React.useEffect(() => {
    runSync = readyKey ? sync : null;
    if (!readyKey) setView({ fileId: null, held: { jobs: [], expenses: [] }, examples: 0 });
    return () => { if (runSync === sync) runSync = null; };
  }, [readyKey, sync]);
  React.useEffect(() => { void sync(true); }, [sync]);
  React.useEffect(() => {
    if (!readyKey) return;
    const back = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void sync(); }, SYNC_EVERY);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); };
  }, [readyKey, sync]);
}

/**
 * The line over a list kept from the sheet: when it was last read, and what waits for the person (rows gone all at once,
 * the template's example rows, records not in the sheet yet). The reading itself is the app's (useSheetEngine).
 */
function SheetSourceLine({ testId, kind, tabOf, onRemoveHeld, unsynced, confirm, mobile }: {
  testId: string; kind: 'jobs' | 'expenses'; tabOf: (map: SheetMap | null | undefined) => SheetMap['tabs'][number] | null;
  onRemoveHeld: (ids: string[], fileId: string) => void;
  /** Records in the app that are not in the sheet yet, and sending them there (owner, 2026-11-18). */
  unsynced?: { count: number; send: () => void };
  /** The page's own confirm dialog (deleting the template's example rows asks first). */
  confirm?: Confirm;
  mobile: boolean;
}) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = Boolean(account) && labOn(labs, 'sheetJobs');
  const status = useGoogleStatus(account, on);
  const file = status?.connected ? status.file ?? null : null;
  const map = file && status?.map?.fileId === file.id ? status.map : null;
  const tab = tabOf(map);
  const engine = useView();
  const fresh = engine.fileId === file?.id;
  const held = fresh ? engine.held[kind] : [];
  const examples = fresh ? engine.examples : 0;
  // Opening the page later asks for a reading too (at most every 20 seconds); the app's own first reading covers the start.
  React.useEffect(() => { if (on && file && map && tab && view.readAt) void runSync?.(); }, [on, file, map, tab]);

  // ไม่ต้อง hides the offer on this device until more records are missing from the sheet than when it was hidden.
  const hideKey = account && file ? `krarok.sheetCopy.${account}.${file.id}.${testId}` : '';
  const [hiddenAt, setHiddenAt] = React.useState<number>(() => { try { return Number(localStorage.getItem(hideKey) || 0); } catch { return 0; } });
  React.useEffect(() => { try { setHiddenAt(Number(localStorage.getItem(hideKey) || 0)); } catch { setHiddenAt(0); } }, [hideKey]);
  const hide = (count: number) => { setHiddenAt(count); try { localStorage.setItem(hideKey, String(count)); } catch { /* this device only */ } };

  const deleteExamples = () => {
    if (!account || engine.deletingExamples) return;
    const go = async () => {
      setView({ deletingExamples: true, examplesProblem: '' });
      try {
        const result = await googleApi.deleteExamples(account);
        if (result?.error) setView({ examplesProblem: result.error });
        else { setView({ examples: 0 }); await runSync?.(true); }
      } catch { setView({ examplesProblem: tr("ลบแถวตัวอย่างไม่สำเร็จ กรุณาลองอีกครั้ง") }); }
      finally { setView({ deletingExamples: false }); }
    };
    const message = tr("แถวตัวอย่าง {0} แถวที่แอปใส่ไว้ตอนสร้างชีต (ชื่อลงท้ายว่า ตัวอย่าง) จะถูกลบออกจากชีต แถวอื่นไม่ถูกแตะ ต้องการดำเนินการต่อหรือไม่", examples);
    if (confirm) confirm(tr("ลบแถวตัวอย่างในชีต"), message, () => void go());
    else void go();
  };

  if (!on || !file || !map || !tab) return null;
  const when = engine.problem ? tr("อ่านชีตไม่ได้ จะลองใหม่เมื่อกลับมาที่หน้านี้") : fresh && engine.readAt ? tr("อัปเดต {0}", timeOf(engine.readAt)) : engine.reading ? tr("กำลังอ่านชีต…") : '';
  return (
    <>
      <div className={`lab lab-sheetline${mobile ? ' is-phone' : ''}`} data-testid={testId}>
        <img src="/brand/partners/google-sheets.png" alt="" width={20} height={20} />
        <p>
          <b>{tr("ข้อมูลจากชีต {0}", file.name)}</b>
          {when && <span className={engine.problem ? 'is-red' : undefined}>{mobile ? '' : ' · '}{when}</span>}
        </p>
        <a className="lab-sheetline-btn" href={sheetRowUrl(file.id, tab.gid)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{tr("เปิดชีต")}</a>
      </div>
      {/* Many rows went from the sheet at one reading: the records stay until the person says so (sheetSync.ts goneOrHeld). */}
      {held.length > 0 && (
        <div className={`lab lab-sheetline is-held${mobile ? ' is-phone' : ''}`} data-testid={`${testId}-held`} role="status">
          <p>
            <b>{tr("ชีตไม่มี {0} รายการนี้แล้ว", held.length)}</b>
            <span>{mobile ? '' : ' · '}{tr("ลบออกจากแอปด้วยหรือไม่")}</span>
          </p>
          <button type="button" className="lab-sheetline-btn is-primary" onClick={() => { onRemoveHeld(held, file.id); setView({ held: { ...engine.held, [kind]: [] } }); }}>{tr("ลบออกจากแอป")}</button>
        </div>
      )}
      {/* The template's example rows (owner, 2026-11-18: "ใน Google Sheet อ่ะเอามาทำไม"): one tap deletes them from the sheet. */}
      {examples > 0 && held.length === 0 && (
        <div className={`lab lab-sheetline is-held${mobile ? ' is-phone' : ''}`} data-testid={`${testId}-examples`} role="status">
          <p>
            <b>{tr("ชีตนี้ยังมีแถวตัวอย่าง {0} แถว", examples)}</b>
            <span className={engine.examplesProblem ? 'is-red' : undefined}>{mobile ? '' : ' · '}{engine.examplesProblem || tr("แอปใส่ไว้ตอนสร้างชีต ไม่ใช่รายการของคุณ")}</span>
          </p>
          <button type="button" className="lab-sheetline-btn is-primary" disabled={engine.deletingExamples} onClick={deleteExamples}>{engine.deletingExamples ? tr("กำลังลบ…") : tr("ลบแถวตัวอย่าง")}</button>
        </div>
      )}
      {/* Records made in the app before the sheet was connected (or from elsewhere): one tap copies them under the last row. */}
      {unsynced && unsynced.count > hiddenAt && held.length === 0 && examples === 0 && (
        <div className={`lab lab-sheetline is-held${mobile ? ' is-phone' : ''}`} data-testid={`${testId}-copy`} role="status">
          <p>
            <b>{tr("ในแอปมี {0} รายการที่ยังไม่อยู่ในชีต", unsynced.count)}</b>
            <span>{mobile ? '' : ' · '}{tr("ส่งลงชีตเพื่อให้ตรงกัน")}</span>
          </p>
          <button type="button" className="lab-sheetline-btn" onClick={() => hide(unsynced.count)}>{tr("ไม่ต้อง")}</button>
          <button type="button" className="lab-sheetline-btn is-primary" onClick={unsynced.send}>{tr("ส่งลงชีต")}</button>
        </div>
      )}
    </>
  );
}

const asked = (fileId: string, ids: string[]) => ({ fileId, add: [], update: [], remove: ids, rows: 0, missing: 0, gone: ids.length, held: [], skipped: 0, seen: null, asked: true as const, push: [] });

/** The line over the jobs list. */
export function SheetJobsLine({ jobs, onSync, onSendUnsynced, busy, confirm, mobile = false }: {
  jobs: Job[]; onSync: (changes: SheetSyncChanges) => void;
  onSendUnsynced?: (jobs: Job[]) => void; busy?: (id: string) => boolean; confirm?: Confirm; mobile?: boolean;
}) {
  const notInSheet = jobs.filter(job => !job.sheetLink && !busy?.(job.id));
  return <SheetSourceLine testId="sheet-jobs-line" kind="jobs" tabOf={jobTabOf} onRemoveHeld={(ids, fileId) => onSync(asked(fileId, ids))} confirm={confirm} mobile={mobile}
    unsynced={onSendUnsynced && notInSheet.length ? { count: notInSheet.length, send: () => onSendUnsynced(notInSheet) } : undefined} />;
}

/** รายจ่ายจากชีต (owner, 2026-11-14): the same line over the expenses list. */
export function SheetExpensesLine({ expenses, onSync, onSendUnsynced, busy, confirm, mobile = false }: {
  expenses: Expense[]; onSync: (changes: SheetExpenseChanges) => void;
  onSendUnsynced?: (expenses: Expense[]) => void; busy?: (id: string) => boolean; confirm?: Confirm; mobile?: boolean;
}) {
  const notInSheet = expenses.filter(expense => !expense.sheetLink && !busy?.(expense.id));
  return <SheetSourceLine testId="sheet-expenses-line" kind="expenses" tabOf={expenseTabOf} onRemoveHeld={(ids, fileId) => onSync(asked(fileId, ids))} confirm={confirm} mobile={mobile}
    unsynced={onSendUnsynced && notInSheet.length ? { count: notInSheet.length, send: () => onSendUnsynced(notInSheet) } : undefined} />;
}

/** In a job's or an expense's details: where it sits in the sheet, and ดูในชีต to open that row. */
export function SheetRowLine({ job, expense, mobile = false }: { job?: Job; expense?: Expense; mobile?: boolean }) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const link: SheetLink | undefined = (job ?? expense)?.sheetLink;
  const on = Boolean(account && link) && labOn(labs, 'sheetJobs');
  const status = useGoogleStatus(account, on);
  const file = status?.connected ? status.file ?? null : null;
  if (!on || !link || !file || file.id !== link.fileId) return null;
  const map = status?.map?.fileId === file.id ? status.map : null;
  const gid = link.gid ?? map?.tabs.find(tab => tab.name === link.tab)?.gid;
  return (
    <div className={`lab lab-sheetline is-row${mobile ? ' is-phone' : ''}`} data-testid="sheet-row-line">
      <img src="/brand/partners/google-sheets.png" alt="" width={20} height={20} />
      <p>
        <b>{tr("อยู่ในชีต {0}", file.name)}</b>
        <span>{mobile ? '' : ' '}{link.missing ? (expense ? tr("ไม่พบรายจ่ายนี้ในชีตแล้ว") : tr("ไม่พบงานนี้ในชีตแล้ว")) : tr("แท็บ {0} · แถว {1}", link.tab, link.row)}</span>
      </p>
      <a className="lab-sheetline-btn is-primary" href={link.missing ? sheetRowUrl(file.id, gid) : sheetRowUrl(file.id, gid, link.row, lastColumnOf(map, link.tab))} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} aria-hidden="true" />{link.missing ? tr("เปิดชีต") : tr("ดูในชีต")}
      </a>
    </div>
  );
}

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { Expense, Job, StatusOption } from '../../../../shared/types';
import { labOn } from '../../../../shared/labs';
import { sheetRowUrl, type GoogleStatus, type LiveTab, type SheetLink, type SheetMap } from '../../../../shared/googleSheets';
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

/**
 * The line over a list kept from the sheet, and the reading that keeps the page in step with it: `read` plans what the
 * sheet changes from its tabs and applies it (jobs or expenses).
 */
function SheetSourceLine({ testId, tabOf, read, mobile }: {
  testId: string; tabOf: (map: SheetMap | null | undefined) => SheetMap['tabs'][number] | null;
  read: (tabs: LiveTab[], map: SheetMap, fileId: string) => void; mobile: boolean;
}) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = Boolean(account) && labOn(labs, 'sheetJobs');
  const status = useGoogleStatus(account, on);
  const file = status?.connected ? status.file ?? null : null;
  const map = file && status?.map?.fileId === file.id ? status.map : null;
  const tab = tabOf(map);
  const [readAt, setReadAt] = React.useState<Date | null>(null);
  const [reading, setReading] = React.useState(false);
  const [problem, setProblem] = React.useState(false);
  const latest = React.useRef(read);
  latest.current = read;
  const lastRun = React.useRef(0);
  const ready = Boolean(on && account && file && map && tab);

  const sync = React.useCallback(async (force = false) => {
    if (!ready || !account || !file || !map) return;
    if (!force && Date.now() - lastRun.current < SYNC_GAP) return;
    lastRun.current = Date.now();
    setReading(true);
    try {
      const reply = await googleApi.read(account);
      latest.current(reply.tabs, map, file.id);
      setReadAt(new Date()); setProblem(false);
    } catch { setProblem(true); }
    finally { setReading(false); }
  }, [ready, account, file, map]);

  React.useEffect(() => { void sync(true); }, [sync]);
  React.useEffect(() => {
    if (!ready) return;
    const back = () => { if (document.visibilityState === 'visible') void sync(); };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => { window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back); };
  }, [ready, sync]);

  if (!ready || !file || !tab) return null;
  const when = problem ? tr("อ่านชีตไม่ได้ จะลองใหม่เมื่อกลับมาที่หน้านี้") : readAt ? tr("อัปเดต {0}", timeOf(readAt)) : reading ? tr("กำลังอ่านชีต…") : '';
  return (
    <div className={`lab lab-sheetline${mobile ? ' is-phone' : ''}`} data-testid={testId}>
      <img src="/brand/partners/google-sheets.png" alt="" width={20} height={20} />
      <p>
        <b>{tr("ข้อมูลจากชีต {0}", file.name)}</b>
        {when && <span className={problem ? 'is-red' : undefined}>{mobile ? '' : ' · '}{when}</span>}
      </p>
      <a className="lab-sheetline-btn" href={sheetRowUrl(file.id, tab.gid)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{tr("เปิดชีต")}</a>
    </div>
  );
}

/** The line over the jobs list, and the reading that keeps the page in step with the sheet. */
export function SheetJobsLine({ jobs, statuses, jobTypes, onSync, mobile = false }: {
  jobs: Job[]; statuses: StatusOption[]; jobTypes: string[]; onSync: (changes: SheetSyncChanges) => void; mobile?: boolean;
}) {
  const read = (tabs: LiveTab[], map: SheetMap, fileId: string) => {
    const changes = planSheetSync({ jobs, tabs, map, fileId, statuses, jobTypes, today: todayKey() });
    if (changes.add.length || changes.update.length) onSync(changes);
  };
  return <SheetSourceLine testId="sheet-jobs-line" tabOf={jobTabOf} read={read} mobile={mobile} />;
}

/** รายจ่ายจากชีต (owner, 2026-11-14): the same line over the expenses list, reading the sheet's expense rows. */
export function SheetExpensesLine({ expenses, onSync, mobile = false }: { expenses: Expense[]; onSync: (changes: SheetExpenseChanges) => void; mobile?: boolean }) {
  const read = (tabs: LiveTab[], map: SheetMap, fileId: string) => {
    const changes = planSheetExpenseSync({ expenses, tabs, map, fileId, today: todayKey() });
    if (changes.add.length || changes.update.length) onSync(changes);
  };
  return <SheetSourceLine testId="sheet-expenses-line" tabOf={expenseTabOf} read={read} mobile={mobile} />;
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

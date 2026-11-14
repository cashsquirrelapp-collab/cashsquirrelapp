import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { Job, StatusOption } from '../../../../shared/types';
import { labOn } from '../../../../shared/labs';
import { sheetRowUrl, type GoogleStatus, type SheetMap } from '../../../../shared/googleSheets';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi } from '../../services/google';
import { useLabs } from '../../services/labs';
import { planSheetSync, type SheetSyncChanges } from './sheetSync';
import './labs.css';

// หน้างานจากชีต (ฟีเจอร์ทดลอง sheetJobs), as the owner approved it on 2026-11-14 ("โอเคนะ" to the mocks): the Jobs page
// stays as it is with one line on top, "ข้อมูลจากชีต <file> · อัปเดต 09:12" and เปิดชีต; a job from the sheet says in its
// details "อยู่ในชีต <file> · แท็บ … · แถว 6" with ดูในชีต, which opens the sheet at that row. The page reads the sheet when
// it opens and again when the person comes back to it (from editing the sheet in another tab), at most every 20 seconds.
// Kept in a labs file: เลขา's page words never name a test feature.

let statusCache: { account: string; at: number; status: GoogleStatus } | null = null;
const listeners = new Set<() => void>();
const STATUS_TTL = 60_000;

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
const lastColumnOf = (map: SheetMap | null | undefined, tab: string) => Math.max(0, ...(map?.tabs.find(item => item.name === tab)?.columns.map(column => column.index) ?? [0]));
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const timeOf = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
const SYNC_GAP = 20_000;

/** The line over the jobs list, and the reading that keeps the page in step with the sheet. */
export function SheetJobsLine({ jobs, statuses, jobTypes, onSync, mobile = false }: {
  jobs: Job[]; statuses: StatusOption[]; jobTypes: string[]; onSync: (changes: SheetSyncChanges) => void; mobile?: boolean;
}) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = Boolean(account) && labOn(labs, 'sheetJobs');
  const status = useGoogleStatus(account, on);
  const file = status?.connected ? status.file ?? null : null;
  const map = file && status?.map?.fileId === file.id ? status.map : null;
  const tab = jobTabOf(map);
  const [readAt, setReadAt] = React.useState<Date | null>(null);
  const [reading, setReading] = React.useState(false);
  const [problem, setProblem] = React.useState(false);
  const latest = React.useRef({ jobs, statuses, jobTypes, onSync });
  latest.current = { jobs, statuses, jobTypes, onSync };
  const lastRun = React.useRef(0);
  const ready = Boolean(on && account && file && map && tab);

  const sync = React.useCallback(async (force = false) => {
    if (!ready || !account || !file || !map) return;
    if (!force && Date.now() - lastRun.current < SYNC_GAP) return;
    lastRun.current = Date.now();
    setReading(true);
    try {
      const reply = await googleApi.read(account);
      const { jobs: now, statuses: list, jobTypes: types, onSync: apply } = latest.current;
      const changes = planSheetSync({ jobs: now, tabs: reply.tabs, map, fileId: file.id, statuses: list, jobTypes: types, today: todayKey() });
      if (changes.add.length || changes.update.length) apply(changes);
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
    <div className={`lab lab-sheetline${mobile ? ' is-phone' : ''}`} data-testid="sheet-jobs-line">
      <img src="/brand/partners/google-sheets.png" alt="" width={20} height={20} />
      <p>
        <b>{tr("ข้อมูลจากชีต {0}", file.name)}</b>
        {when && <span className={problem ? 'is-red' : undefined}>{mobile ? '' : ' · '}{when}</span>}
      </p>
      <a className="lab-sheetline-btn" href={sheetRowUrl(file.id, tab.gid)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{tr("เปิดชีต")}</a>
    </div>
  );
}

/** In a job's details: where it sits in the sheet, and ดูในชีต to open that row. */
export function SheetRowLine({ job, mobile = false }: { job: Job; mobile?: boolean }) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const link = job.sheetLink;
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
        <span>{mobile ? '' : ' '}{link.missing ? tr("ไม่พบงานนี้ในชีตแล้ว") : tr("แท็บ {0} · แถว {1}", link.tab, link.row)}</span>
      </p>
      <a className="lab-sheetline-btn is-primary" href={link.missing ? sheetRowUrl(file.id, gid) : sheetRowUrl(file.id, gid, link.row, lastColumnOf(map, link.tab))} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={14} aria-hidden="true" />{link.missing ? tr("เปิดชีต") : tr("ดูในชีต")}
      </a>
    </div>
  );
}

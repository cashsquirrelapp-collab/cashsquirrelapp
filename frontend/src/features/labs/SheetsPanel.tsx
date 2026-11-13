import React from 'react';
import { BookmarkCheck, Check, ExternalLink, FileSpreadsheet, Lock, RefreshCw, ShieldCheck, Unplug, Upload } from 'lucide-react';
import type { GoogleStatus, LiveTab } from '../../../../shared/googleSheets';
import type { LabState } from '../../../../shared/labs';
import { labOn } from '../../../../shared/labs';
import { Modal } from '../../components/ui/Modal';
import { tr, T } from '../../i18n/tr';
import { currentLanguage } from '../../i18n/currentLanguage';
import { googleApi } from '../../services/google';
import { FIELD_LABELS, FIELDS_FOR, KIND_LABELS, columnLetter } from '../import/importShared';
import type { ColumnTarget, DataKind } from '../import/sheetImport';
import { EXCEL_ACCEPT, ExcelReadError, excelMapFor, keepExcelMap, readExcelFile } from './excelSource';
import { pickSheet } from './googlePicker';
import { mapOf, overviewOf, readTabs, setKind, setTarget, setUse, templateReadings, type TabReading } from './sheetMap';
import { PartnerLogo } from '../../components/brand/PartnerLogo';
import './labs.css';

// ชีตบัญชีของคุณ (ฟีเจอร์ทดลอง; owner, 2026-11-12: "เราไปหาเขา"). Two ways in, each its own switch in ฟีเจอร์ทดลอง:
// - เชื่อม Google Sheets (plan phase 2): the person connects their Google account and picks one of their own Google Sheets
//   in Google's picker (or makes a new one from the bookkeeping templates).
// - เชื่อมไฟล์ Excel (plan phase 4, step 1): the person picks an Excel file on their device; it is read there and never
//   sent anywhere (excelSource.ts).
// Either way they see how เลขากระรอก reads it: the real table with what each column is, formula columns marked "never
// written into" (แผนที่ชีต), then an overview of the money in it. Nothing is written into the sheet or the file yet.

const MONTHS = [T("ม.ค."), T("ก.พ."), T("มี.ค."), T("เม.ย."), T("พ.ค."), T("มิ.ย."), T("ก.ค."), T("ส.ค."), T("ก.ย."), T("ต.ค."), T("พ.ย."), T("ธ.ค.")];
const RESULTS: Record<string, { tone: Tone; text: string }> = {
  connected: { tone: 'green', text: T("เชื่อม Google แล้ว เลือกไฟล์ชีตที่ต้องการได้เลย") },
  cancelled: { tone: 'plain', text: T("ยกเลิกการเชื่อม Google แล้ว ยังไม่มีการเปลี่ยนแปลง") },
  scope: { tone: 'red', text: T("ยังไม่ได้อนุญาตให้เข้าถึงไฟล์ใน Google Drive กรุณาเชื่อมใหม่และติ๊กช่องอนุญาต") },
  signin: { tone: 'red', text: T("กรุณาเข้าสู่ระบบแล้วเชื่อม Google อีกครั้ง") },
  failed: { tone: 'red', text: T("เชื่อม Google ไม่สำเร็จ กรุณาลองอีกครั้ง") },
};
const EXCEL_ERRORS: Record<ExcelReadError['code'], string> = {
  type: T("รองรับไฟล์ Excel (.xlsx .xls) CSV และ .ods"),
  size: T("ไฟล์ใหญ่เกิน 15 MB กรุณาแบ่งเป็นหลายไฟล์"),
  empty: T("ไม่พบข้อมูลในไฟล์นี้"),
  unreadable: T("เปิดไฟล์นี้ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน ลองบันทึกเป็น .xlsx หรือ .csv แล้วเลือกใหม่"),
};
const baht = (value: number) => value.toLocaleString(currentLanguage === 'en' ? 'en-US' : 'th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const clock = (iso: string) => new Date(iso).toLocaleTimeString(currentLanguage === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit' });
const ROLE_LABELS = { data: T("ข้อมูล"), summary: T("สรุป"), lookup: T("รายการรหัส") } as const;
const PREVIEW_ROWS = 5;
/** Excel files read on the device have no file id; their maps are kept by file name (excelSource.ts). */
const EXCEL_FILE_ID = 'excel-local-file';

type View = 'map' | 'overview';
type Tone = 'green' | 'red' | 'plain';
type Source = 'google' | 'excel';
type Notice = { tone: Tone; text: string } | null;

export function SheetsPanel({ open, onClose, account, labs, result, onCreateTemplate, initialSource, googleBack, onMapSaved }: {
  open: boolean;
  onClose: () => void;
  account: string;
  labs: LabState;
  /** The answer Google's sign-in came back with (/settings?google=…), shown once. */
  result?: string | null;
  /** Opens สร้างชีตตามประเภทธุรกิจ (download, or straight into Google Drive when connected). */
  onCreateTemplate?: () => void;
  /** Which way in to show first (the เปิด button pressed in ฟีเจอร์ทดลอง). */
  initialSource?: Source;
  /** Opened from LINE (/connect-sheets): Google's sign-in comes back there, not to Settings. */
  googleBack?: 'connect';
  /** After the sheet map is saved (the LINE page shows its done screen). */
  onMapSaved?: () => void;
}) {
  const googleOn = labOn(labs, 'sheets');
  const excelOn = labOn(labs, 'excel');
  const mapOn = labOn(labs, 'sheetMap');
  // บันทึกลงชีตของคุณ on: the promise says rows are written on ยืนยัน, not "read only".
  const writeOn = labOn(labs, 'sheetWrite');
  const fallback: Source = googleOn ? 'google' : 'excel';
  const [source, setSource] = React.useState<Source>(initialSource ?? fallback);
  const [wide, setWide] = React.useState<Record<Source, boolean>>({ google: false, excel: false });
  const googleWide = React.useCallback((value: boolean) => setWide(current => ({ ...current, google: value })), []);
  const excelWide = React.useCallback((value: boolean) => setWide(current => ({ ...current, excel: value })), []);
  React.useEffect(() => { if (open) setSource(result ? 'google' : initialSource ?? fallback); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown: Source = source === 'google' && !googleOn ? 'excel' : source === 'excel' && !excelOn ? 'google' : source;
  const switcher = googleOn && excelOn ? (
    <div className="lab-seg lab-gs-source" role="tablist" aria-label={tr("แหล่งข้อมูล")}>
      <button type="button" role="tab" aria-selected={shown === 'google'} onClick={() => setSource('google')}><PartnerLogo kind="sheets" size={16} />Google Sheets</button>
      <button type="button" role="tab" aria-selected={shown === 'excel'} onClick={() => setSource('excel')}><PartnerLogo kind="excel" size={16} />{tr("ไฟล์ Excel")}</button>
    </div>
  ) : null;
  return (
    <Modal open={open} onClose={onClose} label={tr("ชีตบัญชีของคุณ")} width={wide[shown] ? 960 : 600}>
      <div className="lab lab-gs" data-testid="sheets-panel">
        {/* Both stay mounted while the window is open, so switching keeps a file already read. */}
        {googleOn && <div className="lab-gs-pane" hidden={shown !== 'google'}><GoogleSource open={open} account={account} mapOn={mapOn} writeOn={writeOn} result={result} onCreateTemplate={onCreateTemplate} googleBack={googleBack} onMapSaved={onMapSaved} switcher={switcher} onWide={googleWide} /></div>}
        {excelOn && <div className="lab-gs-pane" hidden={shown !== 'excel'}><ExcelSource open={open} mapOn={mapOn} onCreateTemplate={onCreateTemplate} switcher={switcher} onWide={excelWide} /></div>}
      </div>
    </Modal>
  );
}

function PanelHead({ subtitle, switcher, logo }: { subtitle?: React.ReactNode; switcher: React.ReactNode; logo?: 'sheets' | 'excel' }) {
  return (
    <>
      <div className="lab-gs-head">
        <span className={`lab-gs-icon${logo ? ' is-logo' : ''}`} aria-hidden="true">{logo ? <PartnerLogo kind={logo} size={26} /> : <FileSpreadsheet className="h-5 w-5" />}</span>
        <div style={{ minWidth: 0 }}>
          <h2>{tr("ชีตบัญชีของคุณ")}</h2>
          {subtitle && <p className="lab-small lab-muted lab-gs-email">{subtitle}</p>}
        </div>
      </div>
      {switcher}
    </>
  );
}

function Messages({ notice, error }: { notice: Notice; error: string | null }) {
  return (
    <>
      {notice && <p role="status" className={`lab-note lab-gs-notice is-${notice.tone}`}>{notice.tone === 'green' && <Check className="h-4 w-4" aria-hidden="true" />}{notice.text}</p>}
      {error && <p role="alert" className="lab-note lab-gs-notice is-red">{error}</p>}
    </>
  );
}

/** The map and overview state of one read file, the same for a Google Sheet and an Excel file. */
function useWorkspace(mapOn: boolean) {
  const [readings, setReadings] = React.useState<TabReading[]>([]);
  const [active, setActive] = React.useState(0);
  const [view, setView] = React.useState<View>('map');
  const [dirty, setDirty] = React.useState(false);
  const [year, setYear] = React.useState(new Date().getFullYear());
  const load = React.useCallback((next: TabReading[]) => {
    setReadings(next);
    setActive(index => Math.min(index, Math.max(0, next.length - 1)));
    setDirty(false);
    if (!mapOn) setView('overview');
  }, [mapOn]);
  const update = (next: TabReading) => { setReadings(list => list.map((item, index) => (index === active ? next : item))); setDirty(true); };
  const overview = React.useMemo(() => (readings.length ? overviewOf(readings, year) : null), [readings, year]);
  return { readings, active, setActive, view, setView, dirty, setDirty, year, setYear, load, update, overview };
}
type Workspace = ReturnType<typeof useWorkspace>;

function WorkspaceView({ ws, mapOn, saved, onEdit }: { ws: Workspace; mapOn: boolean; saved: boolean; onEdit: () => void }) {
  const reading = ws.readings[ws.active];
  if (!ws.readings.length) return null;
  return (
    <>
      {mapOn && (
        <div className="lab-seg" role="tablist" aria-label={tr("มุมมอง")}>
          <button type="button" role="tab" aria-selected={ws.view === 'map'} onClick={() => ws.setView('map')}>{tr("แผนที่ชีต")}</button>
          <button type="button" role="tab" aria-selected={ws.view === 'overview'} onClick={() => ws.setView('overview')}>{tr("ภาพรวม")}</button>
        </div>
      )}
      {ws.view === 'map' && mapOn && reading ? (
        <MapView readings={ws.readings} active={ws.active} setActive={ws.setActive} reading={reading} update={next => { ws.update(next); onEdit(); }} saved={saved} />
      ) : ws.overview && (
        <OverviewView overview={ws.overview} year={ws.year} setYear={ws.setYear} confirmed={saved} mapOn={mapOn} />
      )}
    </>
  );
}

function SaveMapButton({ ws, saved, busy, onSave }: { ws: Workspace; saved: boolean; busy: boolean; onSave: () => void }) {
  return (
    <button type="button" className="lab-btn is-primary" disabled={busy || (!ws.dirty && saved)} onClick={onSave} data-testid="sheets-save-map">
      {busy ? tr("กำลังบันทึก…") : saved && !ws.dirty ? tr("บันทึกแล้ว") : tr("บันทึกแผนที่")}
    </button>
  );
}

function GoogleSource({ open, account, mapOn, writeOn = false, result, onCreateTemplate, switcher, onWide, googleBack, onMapSaved }: {
  open: boolean; account: string; mapOn: boolean; writeOn?: boolean; result?: string | null; onCreateTemplate?: () => void; switcher: React.ReactNode; onWide: (wide: boolean) => void;
  googleBack?: 'connect'; onMapSaved?: () => void;
}) {
  const ws = useWorkspace(mapOn);
  const [status, setStatus] = React.useState<GoogleStatus | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [tabs, setTabs] = React.useState<LiveTab[] | null>(null);
  const [readAt, setReadAt] = React.useState<string | null>(null);

  const fail = (caught: unknown) => setError((caught as Error)?.message || tr("กรุณาลองใหม่อีกครั้ง"));
  const refreshStatus = React.useCallback(async () => {
    try { setStatus(await googleApi.status(account)); } catch (caught) { fail(caught); }
  }, [account]);
  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await work(); } catch (caught) { fail(caught); if ((caught as { status?: number }).status === 409) void refreshStatus(); } finally { setBusy(null); }
  };

  React.useEffect(() => {
    if (!open) return;
    setNotice(result && RESULTS[result] ? { ...RESULTS[result], text: tr(RESULTS[result].text) } : null);
    void refreshStatus();
  }, [open, result, refreshStatus]);

  const fileId = status?.file?.id ?? null;
  React.useEffect(() => { onWide(Boolean(fileId)); }, [fileId, onWide]);
  const load = React.useCallback(async () => {
    const reply = await googleApi.read(account);
    setStatus(reply.google);
    setTabs(reply.tabs);
    setReadAt(reply.readAt);
    // A sheet made from one of our templates, not mapped yet: read the way the template means it (the person still checks).
    const readings = readTabs(reply.tabs, reply.google.map);
    ws.load(reply.google.map ? readings : templateReadings(readings) ?? readings);
  }, [account, ws.load]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!open || !fileId) { setTabs(null); ws.load([]); return; }
    void run('read', load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileId]);

  const connect = () => run('connect', async () => { window.location.assign(await googleApi.start(account, googleBack)); });
  const choose = () => run('pick', async () => {
    const picker = await googleApi.token(account);
    let picked: { id: string } | null;
    try { picked = await pickSheet({ ...picker, locale: currentLanguage === 'en' ? 'en' : 'th', title: tr("เลือกไฟล์ Google Sheets") }); }
    catch { throw new Error(tr("เปิดหน้าต่างเลือกไฟล์ของ Google ไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    if (!picked) return;
    setStatus(await googleApi.pick(account, picked.id));
    setNotice(null);
  });
  const forget = () => run('forget', async () => { setStatus(await googleApi.forget(account)); setNotice(null); });
  const disconnect = () => run('disconnect', async () => {
    setStatus(await googleApi.disconnect(account));
    setNotice({ tone: 'plain', text: tr("ยกเลิกการเชื่อม Google แล้ว กระรอกตุนเงินเข้าถึงไฟล์ของคุณไม่ได้อีก") });
  });
  const save = () => run('save', async () => {
    if (!fileId) return;
    setStatus(await googleApi.saveMap(account, mapOf(fileId, ws.readings)));
    ws.setDirty(false);
    setNotice({ tone: 'green', text: tr("บันทึกแผนที่ชีตแล้ว") });
    onMapSaved?.();
  });

  let body: React.ReactNode;
  if (!status) {
    body = <p className="lab-muted lab-small" role="status">{tr("กำลังโหลด…")}</p>;
  } else if (!status.configured && !status.connected) {
    body = <p className="lab-note">{tr("ระบบเชื่อม Google ยังไม่พร้อม กรุณาลองใหม่ภายหลัง")}</p>;
  } else if (!status.connected) {
    body = (
      <div className="lab-gs-connect">
        <p className="lab-gs-lead">{tr("เลือกไฟล์บัญชีใน Google Drive ของคุณ ให้เลขากระรอกอ่าน บอกว่าแต่ละคอลัมน์คืออะไร และสรุปตัวเลขให้")}</p>
        <ul className="lab-gs-promises">
          <li><ShieldCheck className="h-4 w-4" aria-hidden="true" /><span>{tr("เข้าถึงเฉพาะไฟล์ที่คุณเลือกเอง หรือไฟล์ที่ให้กระรอกตุนเงินสร้างให้เท่านั้น")}</span></li>
          <li><Lock className="h-4 w-4" aria-hidden="true" /><span>{writeOn
            ? tr("เขียนเฉพาะแถวที่คุณกดยืนยันในการ์ด และย้อนกลับได้ภายใน 30 นาที")
            : tr("ตอนนี้อ่านอย่างเดียว ยังไม่เขียนอะไรลงชีตของคุณ")}</span></li>
          <li><Unplug className="h-4 w-4" aria-hidden="true" /><span>{tr("ยกเลิกการเชื่อมได้ทุกเมื่อ ที่หน้านี้หรือในบัญชี Google ของคุณ")}</span></li>
        </ul>
        <button type="button" className="lab-btn is-primary lab-gs-wide" disabled={busy !== null} onClick={connect}>{busy === 'connect' ? tr("กำลังไปที่ Google…") : tr("เชื่อมบัญชี Google")}</button>
      </div>
    );
  } else if (!status.file) {
    body = (
      <div className="lab-gs-choose">
        <button type="button" className="lab-gs-option" disabled={busy !== null} onClick={choose} data-testid="sheets-pick">
          <PartnerLogo kind="drive" size={22} />
          <span><b>{tr("เลือกไฟล์ที่มีอยู่")}</b><small>{tr("ชีตบัญชีที่คุณใช้อยู่ใน Google Drive")}</small></span>
        </button>
        {onCreateTemplate && (
          <button type="button" className="lab-gs-option" disabled={busy !== null} onClick={onCreateTemplate}>
            <PartnerLogo kind="sheets" size={22} />
            <span><b>{tr("สร้างชีตใหม่")}</b><small>{tr("ตอบ 6 ข้อ แล้วได้ชีตบัญชีตามประเภทธุรกิจใน Google Drive ของคุณ")}</small></span>
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <div className="lab-gs-file">
          <div style={{ minWidth: 0 }}>
            <p className="lab-gs-file-name">{status.file.name}</p>
            <p className="lab-small lab-muted">{readAt ? tr("อ่านล่าสุด {0}", clock(readAt)) : tr("กำลังอ่านชีต…")}</p>
          </div>
          <div className="lab-gs-file-actions">
            <a className="lab-btn" href={status.file.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("เปิดในชีต")}</a>
            <button type="button" className="lab-btn" disabled={busy !== null} onClick={() => void run('read', load)} aria-label={tr("อ่านชีตใหม่")}><RefreshCw className={`h-4 w-4${busy === 'read' ? ' lab-spin' : ''}`} /></button>
          </div>
        </div>
        {tabs && !ws.readings.length && <p className="lab-note">{tr("ไฟล์นี้ไม่มีแท็บที่อ่านได้")}</p>}
        <WorkspaceView ws={ws} mapOn={mapOn} saved={Boolean(status.map)} onEdit={() => setNotice(null)} />
      </>
    );
  }

  return (
    <>
      <div className="lab-gs-body">
        <PanelHead logo="sheets" switcher={switcher} subtitle={status?.connected ? tr("เชื่อมกับ {0}", status.email || tr("บัญชี Google")) : undefined} />
        <Messages notice={notice} error={error} />
        {body}
      </div>
      {status?.connected && (
        <div className="lab-gs-foot">
          {status.file && ws.view === 'map' && mapOn && ws.readings.length > 0 && <SaveMapButton ws={ws} saved={Boolean(status.map)} busy={busy !== null} onSave={save} />}
          {status.file && <button type="button" className="lab-btn" disabled={busy !== null} onClick={forget}>{tr("เปลี่ยนไฟล์")}</button>}
          <button type="button" className="lab-btn is-link lab-gs-disconnect" disabled={busy !== null} onClick={disconnect}>{tr("ยกเลิกการเชื่อม Google")}</button>
        </div>
      )}
    </>
  );
}

function ExcelSource({ open, mapOn, onCreateTemplate, switcher, onWide }: {
  open: boolean; mapOn: boolean; onCreateTemplate?: () => void; switcher: React.ReactNode; onWide: (wide: boolean) => void;
}) {
  const ws = useWorkspace(mapOn);
  const [file, setFile] = React.useState<{ name: string; readAt: string } | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<Notice>(null);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { onWide(Boolean(file)); }, [file, onWide]);
  React.useEffect(() => { if (!open) { setError(null); setNotice(null); } }, [open]);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setReading(true); setError(null); setNotice(null);
    try {
      const tabs = await readExcelFile(picked);
      const map = excelMapFor(picked.name, tabs);
      const readings = readTabs(tabs, map);
      ws.load(map ? readings : templateReadings(readings) ?? readings);
      setSaved(Boolean(map));
      setFile({ name: picked.name, readAt: new Date().toISOString() });
    } catch (caught) {
      setError(tr(caught instanceof ExcelReadError ? EXCEL_ERRORS[caught.code] : EXCEL_ERRORS.unreadable));
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };
  const pickAgain = () => input.current?.click();
  const save = () => {
    if (!file) return;
    if (!keepExcelMap(file.name, mapOf(EXCEL_FILE_ID, ws.readings))) { setError(tr("บันทึกแผนที่ในเครื่องนี้ไม่ได้ กรุณาลองอีกครั้ง")); return; }
    setSaved(true);
    ws.setDirty(false);
    setNotice({ tone: 'green', text: tr("บันทึกแผนที่ไว้ในเครื่องนี้แล้ว ครั้งหน้าเลือกไฟล์นี้อีกจะอ่านแบบเดิม") });
  };
  const fileInput = (
    <input ref={input} type="file" accept={EXCEL_ACCEPT} hidden data-testid="excel-input" onChange={event => void choose(event.target.files?.[0])} />
  );

  const body = !file ? (
    <div className="lab-gs-connect">
      <p className="lab-gs-lead">{tr("เลือกไฟล์ Excel ที่คุณใช้จดบัญชี ให้เลขากระรอกอ่าน บอกว่าแต่ละคอลัมน์คืออะไร และสรุปตัวเลขให้")}</p>
      <ul className="lab-gs-promises">
        <li><ShieldCheck className="h-4 w-4" aria-hidden="true" /><span>{tr("อ่านในเครื่องของคุณ ไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์")}</span></li>
        <li><Lock className="h-4 w-4" aria-hidden="true" /><span>{tr("ตอนนี้อ่านอย่างเดียว ไม่แก้ไฟล์ของคุณ")}</span></li>
        <li><BookmarkCheck className="h-4 w-4" aria-hidden="true" /><span>{tr("จำแผนที่ชีตไว้ในเครื่องนี้ ครั้งหน้าเลือกไฟล์เดิมก็อ่านแบบเดิม")}</span></li>
      </ul>
      <button type="button" className={`lab-gs-drop${dragging ? ' is-dragging' : ''}`} disabled={reading} onClick={pickAgain}
        onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files?.[0]); }}>
        <Upload className="h-5 w-5" aria-hidden="true" />
        <b>{reading ? tr("กำลังอ่านไฟล์…") : tr("เลือกไฟล์ Excel")}</b>
        <small><span className="lab-gs-drop-hint">{tr("หรือลากไฟล์มาวางที่นี่")} · </span>{tr(".xlsx .xls .csv .ods ไม่เกิน 15 MB")}</small>
      </button>
      {onCreateTemplate && <button type="button" className="lab-btn is-link lab-gs-template-link" onClick={onCreateTemplate}>{tr("ยังไม่มีไฟล์? สร้างชีตบัญชีตามประเภทธุรกิจ")}</button>}
    </div>
  ) : (
    <>
      <div className="lab-gs-file">
        <div style={{ minWidth: 0 }}>
          <p className="lab-gs-file-name">{file.name}</p>
          <p className="lab-small lab-muted">{tr("อ่านเมื่อ {0} · อ่านในเครื่องของคุณ", clock(file.readAt))}</p>
        </div>
        <div className="lab-gs-file-actions">
          <button type="button" className="lab-btn" disabled={reading} onClick={pickAgain}><RefreshCw className={`h-4 w-4${reading ? ' lab-spin' : ''}`} />{tr("อ่านไฟล์ใหม่")}</button>
        </div>
      </div>
      <WorkspaceView ws={ws} mapOn={mapOn} saved={saved} onEdit={() => setNotice(null)} />
    </>
  );

  return (
    <>
      <div className="lab-gs-body">
        <PanelHead logo="excel" switcher={switcher} subtitle={tr("ไฟล์ Excel ในเครื่องของคุณ")} />
        <Messages notice={notice} error={error} />
        {fileInput}
        {body}
      </div>
      {file && (
        <div className="lab-gs-foot">
          {ws.view === 'map' && mapOn && ws.readings.length > 0 && <SaveMapButton ws={ws} saved={saved} busy={reading} onSave={save} />}
          <button type="button" className="lab-btn" disabled={reading} onClick={pickAgain}>{tr("เลือกไฟล์อื่น")}</button>
          <button type="button" className="lab-btn is-link lab-gs-disconnect" disabled={reading} onClick={() => { setFile(null); ws.load([]); setNotice(null); }}>{tr("ปิดไฟล์")}</button>
        </div>
      )}
    </>
  );
}

function MapView({ readings, active, setActive, reading, update, saved }: {
  readings: TabReading[]; active: number; setActive: (index: number) => void; reading: TabReading; update: (next: TabReading) => void; saved: boolean;
}) {
  const { analysis, grid, formulas } = reading;
  const options = (target: ColumnTarget) => [...new Set([...FIELDS_FOR[analysis.kind], target])];
  const header = analysis.headerRow;
  const preview = analysis.dataRows.slice(0, PREVIEW_ROWS);
  const columns = analysis.columns;
  return (
    <div className="lab-gs-map">
      <p className="lab-small lab-muted">{saved ? tr("แผนที่ที่บันทึกไว้ เลขากระรอกใช้อ่านชีตนี้ แก้ได้ทุกเมื่อ") : tr("เลขากระรอกอ่านชีตนี้แบบนี้ ตรวจให้ตรงแล้วกดบันทึกแผนที่")}</p>
      <div className="lab-gs-tabs" role="tablist" aria-label={tr("แท็บในชีต")}>
        {readings.map((item, index) => (
          <button key={item.analysis.name} type="button" role="tab" aria-selected={index === active} onClick={() => setActive(index)} className="lab-gs-tab">
            <span className="lab-gs-tab-name">{item.analysis.name}</span>
            <small>{item.use ? tr("{0} แถว", item.analysis.dataRows.length) : tr("ไม่นับ")}</small>
          </button>
        ))}
      </div>
      <div className="lab-gs-tabbar">
        <span className="lab-chip">{tr(ROLE_LABELS[analysis.role])}</span>
        <label className="lab-gs-inline">
          <span>{tr("รายการในแท็บ")}</span>
          <select className="ui-input lab-gs-select" value={analysis.kind} onChange={event => update(setKind(reading, event.target.value as DataKind))}>
            {(['jobs', 'expenses', 'mixed'] as DataKind[]).map(kind => <option key={kind} value={kind}>{tr(KIND_LABELS[kind])}</option>)}
          </select>
        </label>
        <label className="lab-check lab-gs-use">
          <input type="checkbox" checked={reading.use} onChange={event => update(setUse(reading, event.target.checked))} />
          <span>{tr("นับในภาพรวม")}</span>
        </label>
      </div>
      {reading.truncated && <p className="lab-note">{tr("แท็บนี้ยาวมาก อ่านเฉพาะ 400 แถวแรก")}</p>}
      {!columns.length ? <p className="lab-note">{tr("แท็บนี้ว่าง")}</p> : (
        <>
          {/* Computer and iPad: the real table, a row of choices above the sheet's own header and first rows. */}
          <div className="lab-gs-table-wrap" data-testid="sheet-map-table">
            <table className="lab-gs-table">
              <thead>
                <tr><th className="lab-gs-rownum" aria-label={tr("แถว")} />{columns.map(column => <th key={column.index} className="lab-gs-letter">{columnLetter(column.index)}</th>)}</tr>
                <tr className="lab-gs-choice">
                  <th className="lab-gs-rownum">{tr("อ่านว่า")}</th>
                  {columns.map(column => (
                    <th key={column.index}>
                      <select className="ui-input lab-gs-select" aria-label={tr("คอลัมน์ {0} คือ", columnLetter(column.index))} value={column.target}
                        onChange={event => update(setTarget(reading, column.index, event.target.value as ColumnTarget))}>
                        {options(column.target).map(option => <option key={option} value={option}>{tr(FIELD_LABELS[option])}</option>)}
                      </select>
                      {formulas.has(column.index) && <span className="lab-chip is-brick lab-gs-formula"><Lock className="h-3 w-3" aria-hidden="true" />{tr("สูตร ห้ามเขียนทับ")}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {header !== null && (
                  <tr className="lab-gs-header-row"><td className="lab-gs-rownum">{header + 1}</td>{columns.map(column => <td key={column.index}>{grid.rows[header]?.[column.index]?.text ?? ''}</td>)}</tr>
                )}
                {preview.map(row => (
                  <tr key={row}><td className="lab-gs-rownum">{row + 1}</td>{columns.map(column => <td key={column.index} className={formulas.has(column.index) ? 'is-formula' : undefined}>{grid.rows[row]?.[column.index]?.text ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: one card per column, its letter, header and first values, the choice under it. */}
          <ul className="lab-gs-cols" data-testid="sheet-map-list">
            {columns.map(column => (
              <li key={column.index} className="lab-card">
                <div className="lab-gs-col-head">
                  <span className="lab-gs-letter-chip">{columnLetter(column.index)}</span>
                  <b>{column.header || tr("ไม่มีหัวคอลัมน์")}</b>
                  {formulas.has(column.index) && <span className="lab-chip is-brick"><Lock className="h-3 w-3" aria-hidden="true" />{tr("สูตร ห้ามเขียนทับ")}</span>}
                </div>
                {column.samples.length > 0 && <p className="lab-small lab-muted lab-gs-samples">{column.samples.slice(0, 3).join(' · ')}</p>}
                <select className="ui-input lab-gs-select" aria-label={tr("คอลัมน์ {0} คือ", columnLetter(column.index))} value={column.target}
                  onChange={event => update(setTarget(reading, column.index, event.target.value as ColumnTarget))}>
                  {options(column.target).map(option => <option key={option} value={option}>{tr(FIELD_LABELS[option])}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function OverviewView({ overview, year, setYear, confirmed, mapOn }: {
  overview: ReturnType<typeof overviewOf>; year: number; setYear: (year: number) => void; confirmed: boolean; mapOn: boolean;
}) {
  const years = [...new Set([new Date().getFullYear(), ...overview.years])].sort((a, b) => b - a).slice(0, 6);
  const tiles = [
    { label: tr("รับเงินแล้ว"), value: overview.received, tone: 'green' },
    { label: tr("ค้างรับ"), value: overview.pending, tone: 'brick' },
    { label: tr("รายจ่าย"), value: overview.expenseAmount, tone: 'red' },
    { label: tr("รับแล้ว หัก รายจ่าย"), value: overview.received - overview.expenseAmount, tone: 'plain' },
  ];
  const yearTotal = overview.months.reduce((sum, month) => ({ received: sum.received + month.received, spent: sum.spent + month.spent }), { received: 0, spent: 0 });
  return (
    <div className="lab-gs-overview" data-testid="sheet-overview">
      {!confirmed && <p className="lab-note is-brick">{mapOn ? tr("ตัวเลขนี้อ่านจากชีตโดยยังไม่ได้ตรวจแผนที่ ตรวจที่แผนที่ชีตก่อนเพื่อให้ตรงที่สุด") : tr("ตัวเลขนี้อ่านจากชีตโดยอัตโนมัติ")}</p>}
      <div className="lab-gs-tiles">
        {tiles.map(tile => (
          <div key={tile.label} className={`lab-card lab-gs-tile is-${tile.tone}`}>
            <p className="lab-small lab-muted">{tile.label}</p>
            <p className="lab-gs-amount">{baht(tile.value)}</p>
          </div>
        ))}
      </div>
      <p className="lab-small lab-muted">{tr("งาน {0} รายการ · รายจ่าย {1} รายการ · มูลค่างานรวม {2} บาท", overview.jobs, overview.expenses, baht(overview.value))}</p>
      <div className="lab-card lab-gs-months">
        <div className="lab-gs-months-head">
          <h3>{tr("รายเดือน")}</h3>
          <select className="ui-input lab-gs-select" aria-label={tr("ปี")} value={year} onChange={event => setYear(Number(event.target.value))}>
            {years.map(value => <option key={value} value={value}>{tr("ปี {0}", value + 543)}</option>)}
          </select>
        </div>
        <table className="lab-gs-month-table">
          <thead><tr><th>{tr("เดือน")}</th><th>{tr("รับเงิน")}</th><th>{tr("รายจ่าย")}</th><th>{tr("คงเหลือ")}</th></tr></thead>
          <tbody>
            {overview.months.map(month => (
              <tr key={month.month} className={!month.received && !month.spent ? 'is-empty' : undefined}>
                <td>{tr(MONTHS[month.month - 1])}</td>
                <td>{month.received ? baht(month.received) : '–'}</td>
                <td>{month.spent ? baht(month.spent) : '–'}</td>
                <td className={month.received - month.spent < 0 ? 'is-negative' : undefined}>{month.received || month.spent ? baht(month.received - month.spent) : '–'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>{tr("รวม")}</td><td>{baht(yearTotal.received)}</td><td>{baht(yearTotal.spent)}</td><td>{baht(yearTotal.received - yearTotal.spent)}</td></tr></tfoot>
        </table>
      </div>
      <p className="lab-small lab-muted">{tr("ตัวเลขจากชีตของคุณเท่านั้น ไม่ได้รวมกับรายการในแอป")}</p>
    </div>
  );
}

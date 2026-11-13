import React from 'react';
import { Download, ExternalLink } from 'lucide-react';
import type { AppSettings, Expense, Job } from '../../../../shared/types';
import { readBusinessProfile, templateFor, type BusinessProfile } from '../../../../shared/businessProfile';
import { TEMPLATE_INFO, buildBookTemplate, type TemplateData } from '../../../../shared/bookTemplates';
import { buildXlsx } from '../../../../shared/xlsxWriter';
import { incomeRowsForYear } from '../../../../shared/incomeExport';
import { Modal } from '../../components/ui/Modal';
import { tr } from '../../i18n/tr';
import { googleApi, toBase64 } from '../../services/google';
import type { GoogleFile } from '../../../../shared/googleSheets';
import { BusinessQuestions } from './BusinessQuestions';
import { PartnerLogo } from '../../components/brand/PartnerLogo';
import './labs.css';

// สร้างชีตตามประเภทธุรกิจ (ฟีเจอร์ทดลอง, plan phase 1): the six answers pick one of the five workbooks
// (shared/bookTemplates.ts), shown with its tabs before the download. The app's own records for the year can go in instead
// of the examples. The file is made in the browser. With Google connected (phase 2) the same workbook can go straight into
// the person's Google Drive as a new Google Sheet, which then becomes the sheet เลขากระรอก reads.

/** The year's money received and spent, in the template's rows. */
export function templateData(jobs: Job[], expenses: Expense[], year: number): TemplateData {
  return {
    income: incomeRowsForYear(jobs, year).map(row => ({
      date: row.date, payer: row.client, item: row.label && row.label !== 'รับเงิน' ? `${row.jobName} (${row.label})` : row.jobName,
      gross: row.gross, whtRate: (row.whtRate || 0) / 100, received: true,
    })),
    expenses: expenses.filter(expense => expense.date?.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date))
      .map(expense => ({ date: expense.date, vendor: '', item: expense.name, category: expense.category, amount: Number(expense.amount) || 0 })),
  };
}

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = fileName; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function TemplateDialog({ open, onClose, settings, onSaveProfile, jobs, expenses, drive }: {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveProfile: (profile: BusinessProfile) => void;
  jobs?: Job[];
  expenses?: Expense[];
  /** เชื่อม Google Sheets is on: offer สร้างใน Google Drive (or the way to connect first). */
  drive?: { account: string; onOpenSheets: () => void };
}) {
  const profile = readBusinessProfile(settings.business);
  const [editing, setEditing] = React.useState(false);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState(thisYear);
  const [withData, setWithData] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [created, setCreated] = React.useState<GoogleFile | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [driveError, setDriveError] = React.useState<string | null>(null);
  React.useEffect(() => { if (!open) { setEditing(false); setDone(null); setCreated(null); setDriveError(null); } }, [open]);
  React.useEffect(() => {
    if (!open || !drive) return;
    let live = true;
    googleApi.status(drive.account).then(status => { if (live) setConnected(status.connected && status.configured); }).catch(() => { if (live) setConnected(false); });
    return () => { live = false; };
  }, [open, drive?.account]);
  const id = profile ? templateFor(profile) : null;
  const data = React.useMemo(() => (jobs && expenses ? templateData(jobs, expenses, year) : null), [jobs, expenses, year]);
  const canFill = Boolean(data && id !== 'office' && (data.income.length || data.expenses.length));
  // Tahoma for the Excel download (on every Windows and Mac); Sarabun for the Google Sheet (a Google font for formal Thai).
  const build = (font: 'Tahoma' | 'Sarabun') => {
    const built = buildBookTemplate(profile!, { year, data: withData && canFill ? data : null });
    return { built, bytes: buildXlsx(built.sheets, { title: TEMPLATE_INFO[built.id].title, font }) };
  };
  const make = () => {
    if (!profile) return;
    const { built, bytes } = build('Tahoma');
    download(bytes, built.fileName);
    setDone(built.fileName);
  };
  const makeInDrive = async () => {
    if (!profile || !drive) return;
    setCreating(true); setDriveError(null);
    try {
      const { built, bytes } = build('Sarabun');
      const status = await googleApi.createTemplate(drive.account, built.fileName.replace(/\.xlsx$/i, ''), toBase64(bytes));
      setCreated(status.file ?? null);
    } catch (error) { setDriveError((error as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setCreating(false); }
  };
  const asking = !profile || editing;
  return (
    <Modal open={open} onClose={onClose} label={tr("สร้างชีตตามประเภทธุรกิจ")} width={asking ? 640 : 520}>
      {asking ? (
        <BusinessQuestions profile={profile} title={profile ? undefined : tr("ตอบ 6 ข้อ แล้วได้ชีตบัญชีของคุณ")}
          onSave={next => { onSaveProfile(next); setEditing(false); }} />
      ) : (
        <div className="lab lab-tpl" data-testid="template-dialog">
          <h2>{tr("ชีตบัญชีสำหรับธุรกิจของคุณ")}</h2>
          <div className="lab-tpl-card">
            <span className="lab-chip is-ink">{tr("เทมเพลต")}</span>
            <h3 style={{ marginTop: 8 }}>{tr(TEMPLATE_INFO[id!].title)}</h3>
            <p className="lab-small lab-muted" style={{ marginTop: 2 }}>{tr(TEMPLATE_INFO[id!].who)}</p>
            <div className="lab-tpl-tabs" aria-label={tr("แท็บในไฟล์")}>{TEMPLATE_INFO[id!].tabs.map(tab => <span key={tab} className="lab-chip">{tr(tab)}</span>)}</div>
          </div>
          <label className="lab-field">
            <span>{tr("ปี")}</span>
            <select className="ui-input" style={{ width: 'auto', minHeight: 40 }} value={year} onChange={event => setYear(Number(event.target.value))}>
              {[thisYear, thisYear - 1].map(value => <option key={value} value={value}>{tr("ปี {0}", value + 543)}</option>)}
            </select>
          </label>
          {canFill && (
            <label className="lab-check">
              <input type="checkbox" checked={withData} onChange={event => setWithData(event.target.checked)} />
              <span>{tr("ใส่รายการเดิมในแอปลงไฟล์แทนแถวตัวอย่าง")}<br />
                <small className="lab-muted">{tr("รับเงิน {0} รายการ · รายจ่าย {1} รายการ ของปี {2}", data!.income.length, data!.expenses.length, year + 543)}</small></span>
            </label>
          )}
          <div className="lab-tpl-foot">
            {drive && connected && (
              <button type="button" className="lab-btn is-primary" disabled={creating} onClick={() => void makeInDrive()} data-testid="template-drive">
                <span className="lab-logo-chip" aria-hidden="true"><PartnerLogo kind="drive" size={14} /></span>{creating ? tr("กำลังสร้างใน Google Drive…") : tr("สร้างใน Google Drive")}
              </button>
            )}
            <button type="button" className={`lab-btn${drive && connected ? '' : ' is-primary'}`} onClick={make}><Download className="h-4 w-4" />{tr("ดาวน์โหลดไฟล์ Excel")}</button>
            <button type="button" className="lab-btn" onClick={() => setEditing(true)}>{tr("แก้คำตอบ")}</button>
          </div>
          {drive && connected === false && (
            <p className="lab-small lab-muted" style={{ marginTop: 10 }}>{tr("เชื่อม Google ไว้ จะสร้างไฟล์นี้ลง Google Drive ของคุณได้โดยตรง")}{' '}
              <button type="button" className="lab-btn is-link" onClick={drive.onOpenSheets}>{tr("เชื่อม Google")}</button></p>
          )}
          {created && (
            <div role="status" className="lab-note is-brick lab-tpl-created">
              <span className="lab-tpl-created-name"><PartnerLogo kind="drive" size={18} />{tr("สร้างใน Google Drive แล้ว: {0}", created.name)}</span>
              <span className="lab-tpl-created-actions">
                <a className="lab-btn" href={created.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("เปิดในชีต")}</a>
                {drive && <button type="button" className="lab-btn" onClick={drive.onOpenSheets}>{tr("ดูแผนที่ชีต")}</button>}
              </span>
            </div>
          )}
          {driveError && <p role="alert" className="lab-note lab-gs-notice is-red" style={{ marginTop: 12 }}>{driveError}</p>}
          {done && <p role="status" className="lab-note is-brick" style={{ marginTop: 12 }}>{tr("ดาวน์โหลดแล้ว: {0}", done)}</p>}
          <p className="lab-small lab-muted" style={{ marginTop: 12 }}>{tr("เปิดใน Google Sheets ได้: ไฟล์ › นำเข้า › อัปโหลด ชีตนี้ช่วยจดและสรุปตัวเลข ไม่ได้ยื่นแบบแทนคุณ")}</p>
        </div>
      )}
    </Modal>
  );
}

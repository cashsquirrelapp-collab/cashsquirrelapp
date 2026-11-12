import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import type { AppSettings, Expense, Job } from '../../../../shared/types';
import { profileSummary, readBusinessProfile, type BusinessProfile } from '../../../../shared/businessProfile';
import { daysBetween, filingNotices, filingsForMonth, lastDay, readFiled, thaiMonthYear, toggleFiled, type FilingItem } from '../../../../shared/filingCalendar';
import { Mascot } from '../../components/mascot/Mascot';
import { Modal } from '../../components/ui/Modal';
import { tr, T } from '../../i18n/tr';
import { BusinessQuestions } from './BusinessQuestions';
import { TemplateDialog } from './TemplateDialog';
import './labs.css';

// ปฏิทิน › ยื่นภาษี (ฟีเจอร์ทดลอง, owner, 2026-11-12, plan phase 1). The returns this business files in a month, from the six
// answers (shared/filingCalendar.ts): paper and online dates moved off holidays, days left, what to prepare, and a
// ยื่นแล้ว mark kept in settings.filed. LINE reminds three days before the paper date and on the last day
// (backend send-filing-reminder). It says when and what; it files nothing. The template card opens สร้างชีตตามประเภทธุรกิจ.

/** The calendar's third view, its label kept here so the words of a lab never reach เลขา's page map. */
export const TAX_VIEW_LABEL = T("ยื่นภาษี");

const WEEKDAYS = [T("อา."), T("จ."), T("อ."), T("พ."), T("พฤ."), T("ศ."), T("ส.")];
const MONTHS = [T("ม.ค."), T("ก.พ."), T("มี.ค."), T("เม.ย."), T("พ.ค."), T("มิ.ย."), T("ก.ค."), T("ส.ค."), T("ก.ย."), T("ต.ค."), T("พ.ย."), T("ธ.ค.")];
const localKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekday = (key: string) => { const [y, m, d] = key.split('-').map(Number); return tr(WEEKDAYS[new Date(y, m - 1, d).getDay()]); };
const shortDate = (key: string) => { const [, m, d] = key.split('-').map(Number); return `${weekday(key)} ${d} ${tr(MONTHS[m - 1])}`; };

function status(item: FilingItem, today: string, done: boolean): { tone: 'green' | 'red' | 'brick' | 'plain'; text: string } {
  if (done) return { tone: 'green', text: tr("ยื่นแล้ว") };
  const left = daysBetween(today, lastDay(item));
  if (left < 0) return { tone: 'red', text: tr("เลยกำหนด") };
  if (left === 0) return { tone: 'brick', text: tr("วันสุดท้าย") };
  return { tone: left <= 3 ? 'brick' : 'plain', text: tr("อีก {0} วัน", left) };
}

export function TaxFilingView({ settings, onUpdateSettings, templatesOn, jobs, expenses, phone }: {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  templatesOn: boolean;
  jobs: Job[];
  expenses: Expense[];
  phone?: boolean;
}) {
  const profile = readBusinessProfile(settings.business);
  const filed = readFiled(settings.filed);
  const today = localKey();
  const [month, setMonth] = React.useState(() => ({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 }));
  const [asking, setAsking] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [openPrep, setOpenPrep] = React.useState<string | null>(null);
  const saveProfile = (next: BusinessProfile) => { onUpdateSettings({ ...settings, business: next }); setAsking(false); };
  const items = profile ? filingsForMonth(profile, month.y, month.m) : [];
  const notices = profile ? filingNotices(profile) : [];
  const shift = (by: number) => setMonth(({ y, m }) => { const at = new Date(y, m - 1 + by, 1); return { y: at.getFullYear(), m: at.getMonth() + 1 }; });
  const isThisMonth = month.y === new Date().getFullYear() && month.m === new Date().getMonth() + 1;

  const side = (
    <aside className="lab-tax-side">
      {templatesOn && (
        <div className="lab-card lab-side-card">
          <p className="lab-side-title">{tr("ชีตบัญชีสำหรับธุรกิจของคุณ")}</p>
          <p className="lab-side-text">{tr("ไฟล์ Excel ที่มีแท็บตามที่กฎหมายกำหนด สูตรคำนวณภาษีหัก ณ ที่จ่าย และสรุปรายเดือน เปิดใน Google Sheets ได้")}</p>
          <button type="button" className="lab-btn is-primary" onClick={() => setTemplateOpen(true)}><FileSpreadsheet className="h-4 w-4" />{tr("สร้างชีตบัญชี")}</button>
        </div>
      )}
      <div className="lab-card">
        <p className="lab-side-title">{tr("เตือนใน LINE")}</p>
        <p className="lab-side-text">{tr("ถ้าเชื่อม LINE ไว้ จะเตือน 3 วันก่อนกำหนดยื่นแบบกระดาษ และในวันสุดท้าย แบบที่กดยื่นแล้วจะไม่เตือน")}</p>
      </div>
      <p className="lab-small lab-muted">{tr("ปฏิทินนี้บอกวันและเอกสารที่ต้องเตรียม ไม่ได้ยื่นแบบแทนคุณ วันที่ตรงเสาร์-อาทิตย์หรือวันหยุดราชการเลื่อนเป็นวันทำการถัดไปแล้ว")}</p>
    </aside>
  );

  return (
    <div className="lab" data-testid="tax-filing">
      {!profile ? (
        <div className="lab-card lab-intro">
          <Mascot mood="happy" action="hold-calendar" animated={false} size={phone ? 96 : 120} />
          <div>
            <h3>{tr("วันยื่นภาษีของธุรกิจคุณ")}</h3>
            <p>{tr("ตอบ 6 ข้อเรื่องธุรกิจของคุณ แล้วดูได้ว่าแต่ละเดือนต้องยื่นแบบอะไร วันไหน และต้องเตรียมเอกสารอะไร")}</p>
            <button type="button" className="lab-btn is-primary" onClick={() => setAsking(true)}>{tr("เริ่มตอบ 6 ข้อ")}</button>
          </div>
        </div>
      ) : (
        <div className="lab-tax">
          <div className="lab-tax-main">
            <div className="lab-card lab-who" aria-label={tr("ธุรกิจของคุณ")}>
              {profileSummary(profile).map(text => <span key={text} className="lab-chip">{tr(text)}</span>)}
              <button type="button" className="lab-btn is-link" onClick={() => setAsking(true)}>{tr("แก้คำตอบ")}</button>
            </div>
            {notices.map(notice => <p key={notice.id} className="lab-note is-brick">{tr(notice.text)}</p>)}
            <div className="lab-month">
              <button type="button" className="lab-arrow" aria-label={tr("เดือนก่อน")} onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></button>
              <h3 aria-live="polite">{tr("ต้องยื่นใน {0}", thaiMonthYear(month.y, month.m))}</h3>
              <button type="button" className="lab-arrow" aria-label={tr("เดือนถัดไป")} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></button>
              {!isThisMonth && <button type="button" className="lab-btn" onClick={() => setMonth({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 })}>{tr("เดือนนี้")}</button>}
            </div>
            {items.length ? (
              <ul className="lab-list" aria-label={tr("แบบที่ต้องยื่น")} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map(item => {
                  const done = Boolean(filed[item.key]);
                  const state = status(item, today, done);
                  const [, , day] = item.paper.split('-').map(Number);
                  return (
                    <li key={item.key} className={`lab-card lab-item${done ? ' is-done' : state.tone === 'red' ? ' is-late' : state.tone === 'brick' ? ' is-soon' : ''}`} data-testid={`filing-${item.key}`}>
                      <div className="lab-date" aria-hidden="true"><b>{day}</b><small>{weekday(item.paper)}</small></div>
                      <div style={{ minWidth: 0 }}>
                        <div className="lab-item-head">
                          <h4>{tr(item.title)}</h4>
                          <span className="lab-chip">{tr(item.period)}</span>
                          {item.forClients && <span className="lab-chip">{tr("ของลูกค้า")}</span>}
                          <span className={`lab-chip${state.tone === 'plain' ? '' : ` is-${state.tone}`}`}>{state.text}</span>
                        </div>
                        <p className="lab-item-what">{tr(item.what)}</p>
                        <div className="lab-dates">
                          <span>{tr("กระดาษ")}: <b>{shortDate(item.paper)}</b></span>
                          {item.online && <span>{item.onlineLabel ? tr(item.onlineLabel) : tr("ออนไลน์")}: <b>{shortDate(item.online)}</b></span>}
                        </div>
                        {item.when && <p className="lab-when">{tr(item.when)}</p>}
                        {item.note && <p className="lab-when">{tr(item.note)}</p>}
                        <div className="lab-prep">
                          <button type="button" className="lab-prep-toggle" aria-expanded={openPrep === item.key} onClick={() => setOpenPrep(key => (key === item.key ? null : item.key))}>
                            {tr("ต้องเตรียมอะไร")}<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {openPrep === item.key && <ul>{item.prepare.map(line => <li key={line}>{tr(line)}</li>)}</ul>}
                        </div>
                      </div>
                      <button type="button" className="lab-done" aria-pressed={done}
                        onClick={() => onUpdateSettings({ ...settings, filed: toggleFiled(filed, item.key, !done) })}>
                        <i aria-hidden="true">{done ? '✓' : ''}</i>{tr("ยื่นแล้ว")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="lab-card lab-empty"><h4>{tr("เดือนนี้ไม่มีแบบที่ต้องยื่น")}</h4><p>{tr("ลองดูเดือนถัดไป")}</p></div>
            )}
          </div>
          {side}
        </div>
      )}
      <Modal open={asking} onClose={() => setAsking(false)} label={tr("คำถามเรื่องธุรกิจ")} width={640}>
        <BusinessQuestions profile={profile} onSave={saveProfile} />
      </Modal>
      {templatesOn && <TemplateDialog open={templateOpen} onClose={() => setTemplateOpen(false)} settings={settings} onSaveProfile={saveProfile} jobs={jobs} expenses={expenses} />}
    </div>
  );
}

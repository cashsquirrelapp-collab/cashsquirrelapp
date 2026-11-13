import React from 'react';
import { CheckCircle2, ExternalLink, MessageCircle } from 'lucide-react';
import { labOn } from '../../../../shared/labs';
import type { AppSettings, Expense, Job } from '../../../../shared/types';
import type { GoogleFile } from '../../../../shared/googleSheets';
import { profileFromWelcome, readBusinessProfile } from '../../../../shared/businessProfile';
import { TEMPLATE_INFO, buildBookTemplate } from '../../../../shared/bookTemplates';
import type { TemplateId } from '../../../../shared/businessProfile';
import { buildXlsx } from '../../../../shared/xlsxWriter';
import { tr } from '../../i18n/tr';
import { apiJson } from '../../services/api';
import { googleApi, toBase64 } from '../../services/google';
import { useLabs, useLabsLoaded } from '../../services/labs';
import { PartnerLogo } from '../../components/brand/PartnerLogo';
import { SheetsPanel } from './SheetsPanel';
import { templateData } from './TemplateDialog';
import { forTemplate, mapOf, readTabs, templateReadings } from './sheetMap';
import './labs.css';

// /connect-sheets — เชื่อมชีตจาก LINE (owner, 2026-11-13). Opened in the phone's own browser by the one-use link from the
// LINE page (/api/line-handoff), already signed in; Google's sign-in comes back here (?google=…). The page is the Sheets
// panel the website has, then a done screen that sends the person back to LINE, where the done card waits.

const LINE_CHATS = 'https://line.me/R/nv/chat';

function Screen({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }) {
  return (
    <main className="lab lab-connect" data-testid="connect-sheets">
      <div className="lab-connect-card">
        <span className="lab-connect-icon" aria-hidden="true">{icon}</span>
        <h1>{title}</h1>
        <p>{text}</p>
        {action}
      </div>
    </main>
  );
}

const backToLine = <a className="lab-btn is-primary lab-connect-go" href={LINE_CHATS}><MessageCircle className="h-4 w-4" aria-hidden="true" />{tr("กลับไปที่ LINE")}</a>;

const GOOGLE_RESULTS: Record<string, string> = {
  cancelled: 'ยกเลิกการเชื่อม Google แล้ว ยังไม่มีการเปลี่ยนแปลง',
  scope: 'ยังไม่ได้อนุญาตให้เข้าถึงไฟล์ใน Google Drive กรุณาเชื่อมใหม่และติ๊กช่องอนุญาต',
  signin: 'กรุณาเข้าสู่ระบบแล้วเชื่อม Google อีกครั้ง',
  failed: 'เชื่อม Google ไม่สำเร็จ กรุณาลองอีกครั้ง',
};

interface Plan { id: TemplateId; build: () => { name: string; bytes: Uint8Array }; records: number }

/**
 * สร้างชีตใหม่ให้ (the sheet offer card in LINE, owner 2026-11-13: "ถ้าไม่มี…สร้างให้เขาอัตโนมัติ"): the workbook for the
 * person's kind of work, with this year's records already in, made in their own Google Drive. Its columns are mapped at
 * once (the sheet is ours, so nothing to check), which sends the done card to the LINE chat. Data stays in Krarok too.
 */
function NewSheet({ account, result, onPick }: { account: string; result: string | null; onPick: () => void }) {
  const [phase, setPhase] = React.useState<'loading' | 'signin' | 'ready' | 'making' | 'done'>('loading');
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [file, setFile] = React.useState<GoogleFile | null>(null);
  const [error, setError] = React.useState<string | null>(result && GOOGLE_RESULTS[result] ? tr(GOOGLE_RESULTS[result]) : null);
  const started = React.useRef(false);

  const make = React.useCallback(async (chosen: Plan) => {
    setPhase('making'); setError(null);
    try {
      const { name, bytes } = chosen.build();
      const created = (await googleApi.createTemplate(account, name, toBase64(bytes))).file;
      if (!created) throw new Error(tr("สร้างชีตไม่สำเร็จ กรุณาลองอีกครั้ง"));
      // Mapped straight away: เลขา knows this workbook's columns, and saving the map sends the LINE done card.
      const { tabs } = await googleApi.read(account);
      const readings = readTabs(tabs, null);
      await googleApi.saveMap(account, mapOf(created.id, templateReadings(readings) ?? forTemplate(readings, TEMPLATE_INFO[chosen.id].writes)));
      setFile(created); setPhase('done');
    } catch (failure) {
      setError((failure as Error).message || tr("สร้างชีตไม่สำเร็จ กรุณาลองอีกครั้ง")); setPhase('ready');
    }
  }, [account]);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const [status, data] = await Promise.all([
          googleApi.status(account),
          apiJson<{ snapshot: { jobs?: Job[]; expenses?: Expense[]; settings?: AppSettings } }>('/api/data?includeInvoices=0', { headers: { 'X-Account-ID': account } }),
        ]);
        const settings = data.snapshot.settings;
        const profile = readBusinessProfile(settings?.business) ?? profileFromWelcome(settings?.onboarding as never);
        const year = new Date().getFullYear();
        const rows = templateData(data.snapshot.jobs ?? [], data.snapshot.expenses ?? [], year);
        const built = buildBookTemplate(profile, { year });
        const next: Plan = {
          id: built.id, records: built.id === 'office' ? 0 : rows.income.length + rows.expenses.length,
          build: () => {
            const book = buildBookTemplate(profile, { year, data: rows });
            return { name: book.fileName.replace(/\.xlsx$/i, ''), bytes: buildXlsx(book.sheets, { title: TEMPLATE_INFO[book.id].title, font: 'Sarabun' }) };
          },
        };
        setPlan(next);
        if (!status.configured) { setError(tr("ระบบเชื่อม Google ยังไม่พร้อม กรุณาลองใหม่ภายหลัง")); setPhase('ready'); return; }
        if (!status.connected) { setPhase('signin'); return; }
        // Back from Google's sign-in, which was for this: made at once, no second tap.
        if (result === 'connected') { await make(next); return; }
        setPhase('ready');
      } catch (failure) {
        setError((failure as Error).message || tr("เปิดไม่สำเร็จ กรุณาลองอีกครั้ง")); setPhase('ready');
      }
    })();
  }, [account, result, make]);

  const signIn = async () => {
    setError(null);
    try { window.location.assign(await googleApi.start(account, 'connect_new')); }
    catch (failure) { setError((failure as Error).message || tr("เชื่อม Google ไม่สำเร็จ กรุณาลองอีกครั้ง")); }
  };

  if (phase === 'done' && file) {
    return <Screen icon={<CheckCircle2 className="h-7 w-7" />} title={tr("สร้างชีตแล้ว")}
      text={tr("ไฟล์ {0} อยู่ใน Google Drive ของคุณแล้ว ต่อไปบันทึกผ่านแชทแล้วกดยืนยัน เลขาจะเพิ่มแถวในชีตนี้ให้", file.name)}
      action={<div className="lab-connect-row">
        <a className="lab-btn lab-connect-go" href={file.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" />{tr("เปิดชีต")}</a>
        {backToLine}
      </div>} />;
  }
  const info = plan ? TEMPLATE_INFO[plan.id] : null;
  return (
    <main className="lab lab-connect" data-testid="connect-sheets-new">
      <div className="lab-connect-card">
        <span className="lab-connect-icon" aria-hidden="true"><PartnerLogo kind="drive" size={34} /></span>
        <h1>{phase === 'making' ? tr("กำลังสร้างชีต…") : tr("สร้างชีตใหม่ใน Google Drive")}</h1>
        {info ? (
          <>
            <p className="lab-connect-sub">{plan!.records ? tr("{0} พร้อมรายการที่จดไว้ {1} รายการ", tr(info.title), plan!.records) : tr(info.title)}</p>
            <div className="lab-tpl-tabs lab-connect-tabs" aria-label={tr("แท็บในไฟล์")}>{info.tabs.map(tab => <span key={tab} className="lab-chip">{tr(tab)}</span>)}</div>
          </>
        ) : <p>{tr("รอสักครู่ครับ")}</p>}
        {error && <p role="alert" className="lab-note lab-gs-notice is-red lab-connect-error">{error}</p>}
        <div className="lab-connect-row">
          {phase === 'signin' && <button type="button" className="lab-btn is-primary lab-connect-go" onClick={() => void signIn()}>{tr("เชื่อม Google แล้วสร้างชีต")}</button>}
          {(phase === 'ready' || phase === 'making') && plan && (
            <button type="button" className="lab-btn is-primary lab-connect-go" disabled={phase === 'making'} onClick={() => void make(plan)} data-testid="connect-new-make">
              {phase === 'making' ? tr("กำลังสร้าง…") : tr("สร้างชีต")}
            </button>
          )}
        </div>
        {phase !== 'making' && <button type="button" className="lab-btn is-link lab-connect-alt" onClick={onPick}>{tr("มีชีตอยู่แล้ว? เลือกไฟล์ของคุณแทน")}</button>}
      </div>
    </main>
  );
}

export default function ConnectSheetsPage({ account }: { account: string | null }) {
  const labs = useLabs(account);
  const loaded = useLabsLoaded(account);
  const [params] = React.useState(() => new URLSearchParams(window.location.search));
  const result = params.get('google');
  const handoff = params.get('handoff');
  const [done, setDone] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const [makeNew, setMakeNew] = React.useState(() => params.get('new') === '1');

  // The answers in the address are shown once; a refresh does not repeat them.
  React.useEffect(() => {
    if (params.size) window.history.replaceState(window.history.state, '', '/connect-sheets');
  }, [params]);

  if (!account || handoff) {
    return <Screen icon={<PartnerLogo kind="sheets" size={34} />} title={tr("ลิงก์นี้ใช้ไม่ได้แล้ว")}
      text={tr("ลิงก์เชื่อมชีตใช้ได้ครั้งเดียวภายใน 5 นาที กลับไปที่ LINE แล้วกด เชื่อมชีต ในการ์ดอีกครั้ง")} action={backToLine} />;
  }
  if (!loaded) {
    return <Screen icon={<PartnerLogo kind="sheets" size={34} />} title={tr("กำลังเปิด…")} text={tr("รอสักครู่ครับ")} />;
  }
  if (!labOn(labs, 'sheets')) {
    return <Screen icon={<PartnerLogo kind="sheets" size={34} />} title={tr("การเชื่อมชีตยังไม่เปิดให้บัญชีนี้")}
      text={tr("กลับไปบันทึกผ่านแชท LINE ได้ตามปกติครับ")} action={backToLine} />;
  }
  // สร้างชีตใหม่ให้ needs the bookkeeping templates open to the account too; otherwise the usual pick-a-file panel.
  if (makeNew && labOn(labs, 'templates')) return <NewSheet account={account} result={result} onPick={() => setMakeNew(false)} />;
  if (done) {
    return <Screen icon={<CheckCircle2 className="h-7 w-7" />} title={tr("เชื่อมชีตแล้ว")}
      text={tr("เลขาส่งการ์ดยืนยันไว้ในแชท LINE แล้ว ต่อไปบันทึกผ่านแชทแล้วกดยืนยัน เลขาจะเพิ่มแถวในชีตให้")} action={backToLine} />;
  }
  if (closed) {
    return <Screen icon={<PartnerLogo kind="sheets" size={34} />} title={tr("ยังไม่ได้บันทึกแผนที่ชีต")}
      text={tr("เชื่อมต่อได้ทุกเมื่อ พิมพ์ เชื่อมชีต ในแชท LINE แล้วกดปุ่มในการ์ด")}
      action={<div className="lab-connect-row"><button type="button" className="lab-btn" onClick={() => setClosed(false)}>{tr("ทำต่อ")}</button>{backToLine}</div>} />;
  }
  return (
    <main className="lab lab-connect is-panel" data-testid="connect-sheets">
      <SheetsPanel open account={account} labs={labs} result={result} initialSource="google" googleBack="connect"
        onClose={() => setClosed(true)} onMapSaved={() => setDone(true)} />
    </main>
  );
}

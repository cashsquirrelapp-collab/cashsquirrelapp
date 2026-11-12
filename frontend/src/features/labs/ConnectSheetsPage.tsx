import React from 'react';
import { CheckCircle2, FileSpreadsheet, MessageCircle } from 'lucide-react';
import { labOn } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { useLabs, useLabsLoaded } from '../../services/labs';
import { SheetsPanel } from './SheetsPanel';
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

export default function ConnectSheetsPage({ account }: { account: string | null }) {
  const labs = useLabs(account);
  const loaded = useLabsLoaded(account);
  const [params] = React.useState(() => new URLSearchParams(window.location.search));
  const result = params.get('google');
  const handoff = params.get('handoff');
  const [done, setDone] = React.useState(false);
  const [closed, setClosed] = React.useState(false);

  // The answers in the address are shown once; a refresh does not repeat them.
  React.useEffect(() => {
    if (params.size) window.history.replaceState(window.history.state, '', '/connect-sheets');
  }, [params]);

  if (!account || handoff) {
    return <Screen icon={<FileSpreadsheet className="h-7 w-7" />} title={tr("ลิงก์นี้ใช้ไม่ได้แล้ว")}
      text={tr("ลิงก์เชื่อมชีตใช้ได้ครั้งเดียวภายใน 5 นาที กลับไปที่ LINE แล้วกด เชื่อมชีต ในการ์ดอีกครั้ง")} action={backToLine} />;
  }
  if (!loaded) {
    return <Screen icon={<FileSpreadsheet className="h-7 w-7" />} title={tr("กำลังเปิด…")} text={tr("รอสักครู่ครับ")} />;
  }
  if (!labOn(labs, 'sheets')) {
    return <Screen icon={<FileSpreadsheet className="h-7 w-7" />} title={tr("การเชื่อมชีตยังไม่เปิดให้บัญชีนี้")}
      text={tr("กลับไปบันทึกผ่านแชท LINE ได้ตามปกติครับ")} action={backToLine} />;
  }
  if (done) {
    return <Screen icon={<CheckCircle2 className="h-7 w-7" />} title={tr("เชื่อมชีตแล้ว")}
      text={tr("เลขาส่งการ์ดยืนยันไว้ในแชท LINE แล้ว ต่อไปบันทึกผ่านแชทแล้วกดยืนยัน เลขาจะเพิ่มแถวในชีตให้")} action={backToLine} />;
  }
  if (closed) {
    return <Screen icon={<FileSpreadsheet className="h-7 w-7" />} title={tr("ยังไม่ได้บันทึกแผนที่ชีต")}
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

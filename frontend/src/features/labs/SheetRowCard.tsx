import React from 'react';
import { Check, ExternalLink, FileSpreadsheet, Lock, Pencil, Undo2 } from 'lucide-react';
import { labOn } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi, type SheetRowPreview, type SheetRowWrite } from '../../services/google';
import { useLabs } from '../../services/labs';
import './labs.css';

// บันทึกลงชีตของคุณ on เลขา's confirmation card (ฟีเจอร์ทดลอง sheetWrite, plan phase 3; the owner's favourite card from the
// prototype): before ยืนยัน, the customer's own sheet as it is (header, the last rows) with the new row tinted under them,
// "จะกรอกตรงนี้", and formula cells marked as the sheet's own. After ยืนยัน, where it went, เปิดชีต and ย้อนกลับ for 30
// minutes. Only for accounts with the feature on and a sheet ready; everyone else sees the card exactly as before.

type Phase = 'pending' | 'working' | 'done' | 'other';

export function SheetRowCard({ proposalId, phase }: { proposalId: string; phase: Phase }) {
  const account = getCurrentAccount() ?? null;
  const labs = useLabs(account);
  const on = Boolean(account) && labOn(labs, 'sheetWrite');
  const [preview, setPreview] = React.useState<SheetRowPreview | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [write, setWrite] = React.useState<SheetRowWrite | null>(null);
  const [undoing, setUndoing] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!on || !account || phase !== 'pending') return;
    let live = true;
    googleApi.preview(account, proposalId).then(reply => {
      if (!live) return;
      setPreview(reply.preview);
      setHint(reply.preview ? null : reply.reason === 'noMap' ? tr("บันทึกแผนที่ชีตก่อน แล้วเลขาจะลงชีตให้ด้วย") : reply.reason === 'noTab' ? tr("แผนที่ชีตยังไม่มีแท็บสำหรับรายการนี้") : null);
    }).catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [on, account, proposalId, phase]);

  React.useEffect(() => {
    if (!on || !account || phase !== 'done') return;
    let live = true;
    googleApi.written(account, proposalId).then(next => { if (live) setWrite(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [on, account, proposalId, phase]);

  if (!on) return null;
  const undo = async () => {
    if (!account) return;
    setUndoing(true); setProblem(null);
    try { const reply = await googleApi.undo(account, proposalId); setWrite(reply.write); if (!reply.undone) setProblem(tr("ย้อนกลับไม่ได้แล้ว เกิน 30 นาทีหรือไฟล์เปลี่ยนไป")); }
    catch (error) { setProblem((error as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setUndoing(false); }
  };

  if (phase === 'done') {
    if (!write) return null;
    if (write.status === 'failed') return <p className="lab lab-sr-note is-red" role="status">{tr("บันทึกในแอปแล้ว แต่ยังไม่ได้ลงชีต: {0}", tr(write.error))}</p>;
    return (
      <div className="lab lab-sr-done" role="status" data-testid="sheet-row-done">
        <p>{write.status === 'undone'
          ? tr("ย้อนกลับแล้ว แถว {0} ในชีตว่างแล้ว รายการในแอปยังอยู่", write.row)
          : <><Check className="h-4 w-4" aria-hidden="true" />{tr("ลงชีต {0} › {1} แถว {2} แล้ว", write.file, write.tab, write.row)}</>}</p>
        <div className="lab-sr-actions">
          {write.url && <a className="lab-btn" href={write.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("เปิดชีต")}</a>}
          {write.status === 'written' && write.canUndo && <button type="button" className="lab-btn" disabled={undoing} onClick={() => void undo()}><Undo2 className="h-4 w-4" />{undoing ? tr("กำลังย้อนกลับ…") : tr("ย้อนกลับ")}</button>}
        </div>
        {problem && <p className="lab-sr-note is-red">{problem}</p>}
      </div>
    );
  }
  if (phase !== 'pending' && phase !== 'working') return null;
  if (!preview) return hint ? <p className="lab lab-sr-note">{hint}</p> : null;
  return (
    <div className="lab lab-sr" data-testid="sheet-row-preview">
      <p className="lab-sr-head"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" /><span>{tr("จะบันทึกลงชีต {0} › {1} ด้วย", preview.file, preview.tab)}</span></p>
      <div className="lab-sr-wrap">
        <table className="lab-sr-table">
          <thead>
            <tr><th className="lab-sr-num" aria-label={tr("แถว")} />{preview.columns.map(column => <th key={column.index} className="lab-sr-letter">{column.letter}</th>)}</tr>
            <tr className="lab-sr-header"><th className="lab-sr-num" />{preview.columns.map(column => <th key={column.index}>{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {preview.before.map(item => (
              <tr key={item.row} className="lab-sr-old"><td className="lab-sr-num">{item.row}</td>{item.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
            ))}
            <tr className="lab-sr-new">
              <td className="lab-sr-num"><Pencil className="h-3 w-3" aria-hidden="true" />{preview.row}</td>
              {preview.cells.map((cell, index) => (
                <td key={index}>{cell === null ? <span className="lab-sr-formula"><Lock className="h-3 w-3" aria-hidden="true" />{tr("คำนวณเอง")}</span> : cell}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <span className="lab-sr-pill">{tr("จะกรอกตรงนี้ · แถว {0}", preview.row)}</span>
    </div>
  );
}

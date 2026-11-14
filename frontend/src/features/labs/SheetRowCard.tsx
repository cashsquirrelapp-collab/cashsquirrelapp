import React from 'react';
import { Check, ExternalLink, Info, Loader2, Undo2 } from 'lucide-react';
import { labOn } from '../../../../shared/labs';
import { tr } from '../../i18n/tr';
import { getCurrentAccount } from '../../services/api';
import { googleApi, type SheetRowPreview, type SheetRowWrite } from '../../services/google';
import { useLabs } from '../../services/labs';
import './labs.css';

// บันทึกลงชีตของคุณ on เลขา's confirmation card (ฟีเจอร์ทดลอง sheetWrite, plan phase 3), laid out as the prototype's ask
// screen (owner, 2026-11-14, with a photo of it: the first version was "ช่องเล็กเกิน ... ไม่สมจริง ... อันนี้เลย"): the card
// takes the chat's full width; its head names the file and tab with "ยังไม่ได้เขียน"; the customer's sheet as it is, the
// column letters with their headers, the last rows faded and the new row tinted green; formula cells "คำนวณเอง"; a note on
// the formula columns; then ✓ ยืนยันเขียนลงชีต · แก้ไข · ยกเลิก. After ยืนยัน the same table says เขียนแล้ว, with เปิดชีต and
// ย้อนกลับ for 30 minutes. Only for accounts with the feature on and a sheet ready; everyone else sees the card as before.

export type SheetPhase = 'pending' | 'working' | 'done' | 'other';

export interface SheetRow {
  on: boolean;
  preview: SheetRowPreview | null;
  hint: string | null;
  write: SheetRowWrite | null;
  undoing: boolean;
  problem: string | null;
  undo: () => Promise<void>;
}

/** The preview before ยืนยัน and the write after, for one confirmation card. */
export function useSheetRow(proposalId: string, phase: SheetPhase): SheetRow {
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

  const undo = async () => {
    if (!account) return;
    setUndoing(true); setProblem(null);
    try { const reply = await googleApi.undo(account, proposalId); setWrite(reply.write); if (!reply.undone) setProblem(tr("ย้อนกลับไม่ได้แล้ว เกิน 30 นาทีหรือไฟล์เปลี่ยนไป")); }
    catch (error) { setProblem((error as Error).message || tr("กรุณาลองใหม่อีกครั้ง")); }
    finally { setUndoing(false); }
  };
  return { on, preview, hint, write, undoing, problem, undo };
}

const isMoney = (text: string | null) => !!text && /^-?[฿]?\s?[\d,]+(?:\.\d+)?$|^-$/.test(text.trim());

/** The head and the sheet with the new row: the card's body in its sheet layout, as the prototype's ask screen. */
export function SheetPreviewBlock({ preview, phase, write }: { preview: SheetRowPreview; phase: SheetPhase; write: SheetRowWrite | null }) {
  const written = phase === 'done' && write?.status === 'written';
  const undone = phase === 'done' && write?.status === 'undone';
  const formulas = preview.columns.filter(column => column.formula).map(column => column.letter);
  const chip = written ? <span className="lab-sp-chip is-done"><Check size={12} aria-hidden="true" />{tr("เขียนแล้ว")}</span>
    : undone ? <span className="lab-sp-chip">{tr("ย้อนกลับแล้ว")}</span>
    : phase === 'working' ? <span className="lab-sp-chip is-waiting">{tr("กำลังเขียน…")}</span>
    : <span className="lab-sp-chip is-waiting">{tr("ยังไม่ได้เขียน")}</span>;
  return (
    <div className="lab lab-sp" data-testid="sheet-row-preview">
      <div className="lab-sp-head">
        <img src="/brand/partners/google-sheets.png" alt="" width={20} height={20} />
        <b>{tr("เพิ่ม 1 แถว · {0} › {1}", preview.file, preview.tab)}</b>
        {chip}
      </div>
      <div className="lab-sp-sheet">
        <table className="lab-sp-table">
          <thead>
            <tr><th aria-label={tr("แถว")} />{preview.columns.map(column => (
              <th key={column.index}>{column.letter} {column.header}{column.formula ? ` (${tr("สูตร")})` : ''}</th>
            ))}</tr>
          </thead>
          <tbody>
            {preview.before.map(item => (
              <tr key={item.row} className="is-old"><th>{item.row}</th>{item.cells.map((cell, index) => <td key={index} className={isMoney(cell) ? 'is-num' : undefined}>{cell}</td>)}</tr>
            ))}
            <tr className={`is-new${undone ? ' is-undone' : ''}`}>
              <th>{preview.row}</th>
              {preview.cells.map((cell, index) => {
                // A formula cell: what the customer's own formula will make of it, when the app can read the formula.
                const computed = cell === null ? preview.computed?.[index] ?? null : null;
                return (
                  <td key={index} className={cell === null ? `is-num is-auto${computed ? ' is-computed' : ''}` : isMoney(cell) ? 'is-num' : undefined}>
                    {cell !== null ? cell : computed ? <>{computed}<small>{tr("ตามสูตร")}</small></> : tr("คำนวณเอง")}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      {!written && !undone && Boolean(preview.differs?.length) && (
        <div className="lab-sp-differs" role="note">
          <Info size={15} aria-hidden="true" />
          <div>
            <b>{tr("สูตรในชีตคิดต่างจากแอป")}</b>
            {preview.differs!.map(item => <p key={item.header}>{tr("{0}: ชีตจะได้ {1} ส่วนในแอปเป็น {2}", item.header, item.sheet, item.app)}</p>)}
            <p className="is-muted">{tr("ตัวเลขในชีตเป็นไปตามสูตรของคุณ เลขาไม่แก้สูตรให้")}</p>
          </div>
        </div>
      )}
      {!written && !undone && <p className="lab-sp-note">{formulas.length
        ? tr("คอลัมน์ {0} เป็นสูตร น้องเลขาจะไม่เขียนทับ · บันทึกในแอปด้วย", formulas.join(', '))
        : tr("แถวอื่นในชีตไม่ถูกแก้ · บันทึกในแอปด้วย")}</p>}
    </div>
  );
}

/** Where the row went, เปิดชีต and ย้อนกลับ; or why it was not written. */
export function SheetDoneBlock({ sheet, extra }: { sheet: SheetRow; extra?: React.ReactNode }) {
  const write = sheet.write;
  if (!write) return extra ? <div className="asx-rcard-result is-done" role="status">{extra}</div> : null;
  if (write.status === 'failed') return <p className="lab lab-sr-note is-red" role="status">{tr("บันทึกในแอปแล้ว แต่ยังไม่ได้ลงชีต: {0}", tr(write.error))}</p>;
  return (
    <div className="lab lab-sp-done" role="status" data-testid="sheet-row-done">
      <p>{write.status === 'undone'
        ? tr("ย้อนกลับแล้ว แถว {0} ในชีตว่างแล้ว รายการในแอปยังอยู่", write.row)
        : <><Check className="h-4 w-4" aria-hidden="true" />{tr("ลงชีต {0} › {1} แถว {2} แล้ว", write.file, write.tab, write.row)}</>}</p>
      {write.status === 'written' && Boolean(write.values?.length) && <span className="lab-sp-undo-note">{tr("ชีตคิดได้ {0}", write.values!.map(item => `${item.header} ${item.text}`).join(' · '))}</span>}
      {write.status === 'written' && write.canUndo && <span className="lab-sp-undo-note">{tr("ย้อนกลับได้ภายใน 30 นาที แถวในชีตจะว่างเหมือนเดิม")}</span>}
      <div className="lab-sr-actions">
        {write.url && <a className="lab-btn is-primary" href={write.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{write.status === 'written' ? tr("ดูในชีต") : tr("เปิดชีต")}</a>}
        {write.status === 'written' && write.canUndo && <button type="button" className="lab-btn" disabled={sheet.undoing} onClick={() => void sheet.undo()}><Undo2 className="h-4 w-4" />{sheet.undoing ? tr("กำลังย้อนกลับ…") : tr("ย้อนกลับ")}</button>}
        {extra}
      </div>
      {sheet.problem && <p className="lab-sr-note is-red">{sheet.problem}</p>}
    </div>
  );
}

/** ✓ ยืนยันเขียนลงชีต · แก้ไข · ยกเลิก under the sheet (kept here, so เลขา's page words never name the test feature). */
export function SheetActions({ working, onConfirm, onEdit, onCancel }: { working: boolean; onConfirm: () => void; onEdit?: () => void; onCancel?: () => void }) {
  return (
    <div className="lab lab-sp-actions">
      <button type="button" className="is-primary" onClick={onConfirm} disabled={working}>
        {working ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{working ? tr("กำลังเขียน…") : tr("ยืนยันเขียนลงชีต")}
      </button>
      {onEdit && <button type="button" onClick={onEdit}>{tr("แก้ไข")}</button>}
      {onCancel && <button type="button" onClick={onCancel}>{tr("ยกเลิก")}</button>}
    </div>
  );
}

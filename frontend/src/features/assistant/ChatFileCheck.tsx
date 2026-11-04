import React from 'react';
import { useReducedMotion } from 'motion/react';
import { Check, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { formatCurrency } from '../../utils';
import { Money } from './ChatCards';
import type { FileCheck } from './fileCheck';
import { IMPORT_FILE_EVENT } from './importFileEvent';

// The "ตรวจไฟล์" card under a spreadsheet sent to เลขากระรอก (owner, 2026-11-04: "ขึ้นหน้าแบบว่าเหมือนกำลังเช็คงาน ... แม่นยำ
// 100%"). The figures come from the import's own reading (fileCheck.ts), never from the model. Its steps tick one after
// another as it opens, then the result: jobs and their money, received against still owed, paid / not yet due / overdue,
// expenses, and the file's own รวม rows compared. "บันทึกทั้งหมด" opens ย้ายข้อมูลเข้าแอป with this file, where every row is
// shown before นำเข้า and the whole import can be undone. Chat card anatomy A (DESIGN.md §4).


const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export function FileCheckCard({ name, check }: { name: string; check: FileCheck }) {
  const reduce = useReducedMotion() ?? false;
  const steps = [
    tr("อ่าน {0} แท็บ · {1} แถว", check.tabs, check.rows.toLocaleString('en-US')),
    tr("จับคอลัมน์ได้ {0} คอลัมน์", check.columns),
    check.toLook ? tr("พร้อมนำเข้า {0} รายการ · ต้องเลือกเพิ่ม {1} แถว", check.jobs + check.expenses, check.toLook) : tr("พร้อมนำเข้า {0} รายการ", check.jobs + check.expenses),
    ...(check.totals.compared ? [check.totals.agree === check.totals.compared
      ? tr("ยอดตรงกับแถวรวมในไฟล์ {0}/{1}", check.totals.agree, check.totals.compared)
      : tr("ยอดไม่ตรงกับแถวรวมในไฟล์ {0} จาก {1}", check.totals.compared - check.totals.agree, check.totals.compared)] : []),
  ];
  // The steps tick one by one as the card opens (the check itself already ran on the device).
  const [shown, setShown] = React.useState(reduce ? steps.length : 0);
  React.useEffect(() => {
    if (shown >= steps.length) return;
    const timer = window.setTimeout(() => setShown(value => value + 1), 280);
    return () => window.clearTimeout(timer);
  }, [shown, steps.length]);
  const done = shown >= steps.length;
  const owed = check.received + check.pending;
  const received = pct(check.received, owed);
  const mismatch = check.totals.compared > check.totals.agree;
  const open = () => { if (check.importFile) window.dispatchEvent(new CustomEvent(IMPORT_FILE_EVENT, { detail: { file: check.importFile } })); };

  return (
    <div className="asx-rcard is-file-check" data-testid="chat-file-check" aria-busy={!done}>
      <div className="asx-rcard-head">
        <span className="asx-rcard-icon"><ClipboardCheck size={16} strokeWidth={1.9} /></span><b>{tr("ตรวจไฟล์ {0}", name)}</b>
        <span className={`asx-card-state ${done ? 'is-done' : 'is-busy'}`}><i aria-hidden="true" />{done ? tr("ตรวจแล้ว") : tr("กำลังตรวจ")}</span>
      </div>
      <ol className="asx-check-steps">
        {steps.map((step, index) => (
          <li key={step} className={index < shown ? 'is-done' : 'is-waiting'}>
            <span className={`asx-check-mark${mismatch && index === 3 ? ' is-warn' : ''}`} aria-hidden="true">{index < shown && (mismatch && index === 3 ? <AlertTriangle size={12} strokeWidth={2.4} /> : <Check size={12} strokeWidth={3} />)}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {done && (
        <div className="asx-check-result">
          {check.jobs > 0 && (
            <>
              <div className="asx-card-preview">
                <p className="asx-card-eyebrow">{tr("งาน {0} รายการ · มูลค่ารวม", check.jobs)}</p>
                <strong className="asx-card-amount"><Money value={formatCurrency(check.value)} /></strong>
              </div>
              {owed > 0 && (
                <div className="asx-check-bar" role="img" aria-label={tr("รับแล้ว {0}% ค้างรับ {1}%", received, Math.round((100 - received) * 10) / 10)}>
                  <span className="asx-check-track"><i style={{ width: `${received}%` }} /></span>
                  <span className="asx-check-legend"><b className="is-in">{tr("รับแล้ว {0}%", received)} · <Money value={formatCurrency(check.received)} /></b>
                    <b>{tr("ค้างรับ {0}%", Math.round((100 - received) * 10) / 10)} · <Money value={formatCurrency(check.pending)} /></b></span>
                </div>
              )}
              <dl className="asx-check-tiles">
                <div><dt>{tr("รับครบ")}</dt><dd className="is-in">{check.paid}</dd></div>
                <div><dt>{tr("ยังไม่ถึงกำหนด")}</dt><dd>{check.notDue}</dd></div>
                <div><dt>{tr("เกินกำหนด")}</dt><dd className={check.overdue ? 'is-out' : undefined}>{check.overdue}</dd></div>
              </dl>
            </>
          )}
          {check.expenses > 0 && (
            <dl className="asx-rcard-rows"><div><dt>{tr("รายจ่าย {0} รายการ", check.expenses)}</dt><dd className="is-expense"><Money value={formatCurrency(check.expenseTotal)} /></dd></div></dl>
          )}
          {check.importFile ? (
            <>
              <div className="asx-rcard-actions">
                <button type="button" className="asx-pill-btn is-primary" onClick={open}>{tr("บันทึกทั้งหมด {0} รายการ", check.jobs + check.expenses)}</button>
              </div>
              <p className="asx-card-context">{tr("เปิดหน้าย้ายข้อมูลเข้าแอปพร้อมไฟล์นี้ ตรวจทีละแถวก่อนกดนำเข้า และย้อนกลับได้ภายใน 7 วัน")}</p>
            </>
          ) : <p className="asx-card-context">{tr("บันทึกไฟล์เป็น .xlsx หรือ .csv แล้วใช้ ย้ายข้อมูลเข้าแอป ที่หน้างาน เพื่อนำเข้าทุกแถว")}</p>}
        </div>
      )}
    </div>
  );
}

/** The check cards of a sent message's files. */
export function FileChecks({ files }: { files: { name: string; check?: FileCheck }[] }) {
  const checked = files.filter((file): file is { name: string; check: FileCheck } => Boolean(file.check));
  if (!checked.length) return null;
  return <>{checked.map(file => <FileCheckCard key={file.name} name={file.name} check={file.check} />)}</>;
}

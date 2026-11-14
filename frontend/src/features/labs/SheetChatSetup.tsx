import React from 'react';
import { ListChecks } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';
import { FIELD_LABELS } from '../import/importShared';
import type { ColumnTarget } from '../import/sheetImport';
import type { TabReading } from './sheetMap';
import { OTHER_TARGETS, answerColumn, sheetSetupOf } from './sheetQuestions';

// เลขาถามเรื่องชีต, as the owner approved it on 2026-11-14 (the simple mock, after "ดูยาก" about the column table): right
// after a sheet is picked, เลขา says it has read the file, which tabs are what, which columns the sheet works out by itself
// ("ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้"), then asks only what it is not sure of, one question at a time, ใช่ / ไม่ใช่. After the
// last answer the sheet map is saved; with nothing to ask, one tap (ใช้ตามนี้) saves it. The full table stays one tap away
// (ดูทั้งตาราง). Shown where a sheet is connected: Settings › ฟีเจอร์ทดลอง and the page LINE opens.

/** The translated text with the argument in bold (a file or column name). */
function Bold({ text, arg }: { text: string; arg: string }) {
  const at = text.indexOf(arg);
  if (at < 0 || !arg) return <>{text}</>;
  return <>{text.slice(0, at)}<b>{arg}</b>{text.slice(at + arg.length)}</>;
}

export function SheetChatSetup({ fileName, readings, saved, busy, onSave, onShowTable }: {
  fileName: string; readings: TabReading[]; saved: boolean; busy: boolean;
  onSave: (readings: TabReading[]) => void; onShowTable: (readings: TabReading[]) => void;
}) {
  const [setup] = React.useState(() => sheetSetupOf(readings));
  const [current, setCurrent] = React.useState(readings);
  const [step, setStep] = React.useState(0);
  const [choosing, setChoosing] = React.useState(false);
  const [answers, setAnswers] = React.useState<string[]>([]);
  const asked = setup.questions.length;
  const finished = step >= asked;
  const question = setup.questions[step];

  const answer = (target: ColumnTarget, label: string) => {
    const next = answerColumn(current, question, target);
    setCurrent(next); setAnswers(list => [...list, label]); setChoosing(false); setStep(step + 1);
    // The last answer is the go-ahead: the map is saved with every answer in it.
    if (step + 1 >= asked) onSave(next);
  };

  const label = (target: ColumnTarget) => tr(FIELD_LABELS[target]);
  const names = (kind: 'jobs' | 'expenses' | 'mixed') => setup.tabs.filter(tab => tab.kind === kind).map(tab => tab.name).join(', ');
  const formulaText = setup.formulas.length === 1
    ? tr("ช่อง {0} ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้", setup.formulas[0])
    : tr("ช่อง {0} กับ {1} ชีตคิดให้เองอยู่แล้ว ผมจะไม่ไปแก้", setup.formulas.slice(0, -1).join(', '), setup.formulas[setup.formulas.length - 1]);

  return (
    <div className="lab lab-ask" data-testid="sheet-chat-setup">
      <div className="lab-ask-bot">
        <span className="lab-ask-avatar" aria-hidden="true"><Mascot mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
        <div className="lab-ask-lines">
          <p><Bold text={asked ? tr("อ่านชีต {0} แล้วครับ เข้าใจเกือบหมด", fileName) : tr("อ่านชีต {0} แล้วครับ เข้าใจทั้งหมด", fileName)} arg={fileName} /></p>
          {names('jobs') && <p>{tr("แท็บ {0} เป็นงานและรายรับ", names('jobs'))}</p>}
          {names('expenses') && <p>{tr("แท็บ {0} เป็นรายจ่าย", names('expenses'))}</p>}
          {names('mixed') && <p>{tr("แท็บ {0} มีทั้งรายรับและรายจ่าย", names('mixed'))}</p>}
          {setup.formulas.length > 0 && <p>{formulaText}</p>}
          {!setup.tabs.length && <p>{tr("ยังไม่เจอแท็บที่เป็นรายการงานหรือรายจ่าย กดดูทั้งตารางเพื่อเลือกเองได้ครับ")}</p>}
          {setup.tabs.length > 0 && <p>{asked === 0 ? tr("ถ้าถูกต้อง กดใช้ตามนี้ได้เลยครับ") : asked === 1 ? tr("ขอถามข้อเดียวครับ") : tr("ขอถาม {0} ข้อครับ", asked)}</p>}
        </div>
      </div>

      {answers.map((said, index) => (
        <React.Fragment key={index}>
          <p className="lab-ask-past">{tr('ช่อง "{0}"', setup.questions[index].header)}</p>
          <p className="lab-ask-me">{said}</p>
        </React.Fragment>
      ))}

      {!finished && question && (
        <div className="lab-ask-card" role="group" aria-label={tr("ขอข้อมูลเพิ่ม")}>
          <span className="lab-ask-head"><ListChecks size={15} aria-hidden="true" />{tr("ขอข้อมูลเพิ่ม")}{asked > 1 ? ` (${step + 1}/${asked})` : ''}</span>
          {choosing ? (
            <>
              <p className="lab-ask-q">{tr('แล้วช่อง "{0}" คืออะไรครับ', question.header)}</p>
              <div className="lab-ask-chips">
                {OTHER_TARGETS[question.kind].filter(target => target !== question.target).map(target => (
                  <button key={target} type="button" onClick={() => answer(target, label(target))}>{label(target)}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="lab-ask-q">{tr('ช่อง "{0}" คือ{1} ใช่ไหมครับ', question.header, label(question.target))}</p>
              <div className="lab-ask-options">
                <button type="button" onClick={() => answer(question.target, tr("ใช่"))}>{tr("ใช่")}</button>
                <button type="button" onClick={() => setChoosing(true)}>{tr("ไม่ใช่")}</button>
              </div>
            </>
          )}
        </div>
      )}

      {finished && setup.tabs.length > 0 && (saved ? (
        <div className="lab-ask-bot">
          <span className="lab-ask-avatar" aria-hidden="true"><Mascot mood="happy" animated={false} size={30} viewBox="12 8 76 76" /></span>
          <div className="lab-ask-lines" role="status"><p>{tr("บันทึกแล้วครับ เลขาจะอ่านชีตนี้ตามนี้")}</p></div>
        </div>
      ) : (
        // With nothing to ask, one tap saves; after the answers it saves by itself (the button stays for a retry).
        <button type="button" className="lab-btn is-primary lab-ask-go" disabled={busy} onClick={() => onSave(current)} data-testid="sheet-setup-save">
          {busy ? tr("กำลังบันทึก…") : tr("ใช้ตามนี้")}
        </button>
      ))}

      <button type="button" className="lab-ask-table" onClick={() => onShowTable(current)}>{tr("ดูทั้งตาราง")}</button>
    </div>
  );
}

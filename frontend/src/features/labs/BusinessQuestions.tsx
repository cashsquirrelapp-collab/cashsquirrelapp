import React from 'react';
import {
  ENTITIES, INCOME_KINDS, PAYMENTS, REVENUES, VAT_ANSWERS, WORKS, answersComplete, answersFromProfile, asksIncomeKind, profileFromAnswers,
  type BusinessAnswers, type BusinessProfile, type PaymentId,
} from '../../../../shared/businessProfile';
import { tr } from '../../i18n/tr';
import './labs.css';

// The six business questions (shared/businessProfile.ts; owner, 2026-11-12, plan phase 1), shown in the app's Modal: a
// centred dialog on computers and iPads, a bottom sheet on phones. One scrolling page, numbered like the plan, the save
// button kept in view. The income question only appears for individuals (companies follow the Accounting Act).

export function BusinessQuestions({ profile, onSave, saving = false, title }: {
  profile: BusinessProfile | null;
  onSave: (profile: BusinessProfile) => void;
  saving?: boolean;
  title?: string;
}) {
  const [answers, setAnswers] = React.useState<BusinessAnswers>(() => answersFromProfile(profile));
  const set = (patch: Partial<BusinessAnswers>) => setAnswers(value => ({ ...value, ...patch }));
  const togglePay = (id: PaymentId) => setAnswers(value => {
    const pays = value.pays.includes(id) ? value.pays.filter(pay => pay !== id) : [...value.pays, id];
    return { ...value, pays, paysNone: false };
  });
  const complete = answersComplete(answers);
  const single = <T extends string>(name: string, list: readonly { id: T; label: string; hint?: string }[], value: T | null, pick: (id: T) => void, three = false) => (
    <div className={`lab-q-options${three ? ' is-three' : ''}`} role="radiogroup" aria-label={name}>
      {list.map(item => (
        <button key={item.id} type="button" role="radio" aria-checked={value === item.id} className="lab-opt" onClick={() => pick(item.id)}>
          <span>{tr(item.label)}</span>
          {item.hint ? <small>{tr(item.hint)}</small> : null}
        </button>
      ))}
    </div>
  );
  let n = 0;
  const step = (heading: string, body: React.ReactNode, hint?: string) => {
    n += 1;
    return (
      <section className="lab-q-step">
        <h3><b aria-hidden="true">{n}</b>{heading}</h3>
        {hint ? <p>{hint}</p> : null}
        {body}
      </section>
    );
  };
  return (
    <div className="lab lab-q" data-testid="business-questions">
      <h2>{title ?? tr("บอกเราเรื่องธุรกิจของคุณ 6 ข้อ")}</h2>
      <p className="lab-lead">{tr("ใช้เลือกชีตบัญชีและวันยื่นภาษีที่ตรงกับคุณ แก้คำตอบได้ทุกเมื่อ")}</p>
      {step(tr("คุณรับเงินในนามอะไร"), single(tr("คุณรับเงินในนามอะไร"), ENTITIES, answers.entity, id => set({ entity: id })))}
      {step(tr("จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) แล้วหรือยัง"), single(tr("จดทะเบียนภาษีมูลค่าเพิ่ม (VAT) แล้วหรือยัง"), VAT_ANSWERS, answers.vat, id => set({ vat: id }), true))}
      {step(tr("งานของคุณใกล้แบบไหนที่สุด"), single(tr("งานของคุณใกล้แบบไหนที่สุด"), WORKS, answers.work, id => set({ work: id }), true))}
      {asksIncomeKind(answers.entity) && step(tr("รับงานเป็นครั้ง หรือเปิดกิจการเอง"),
        single(tr("รับงานเป็นครั้ง หรือเปิดกิจการเอง"), INCOME_KINDS, answers.income, id => set({ income: id })),
        tr("ถ้ามีหนังสือรับรอง 50 ทวิ ดูช่อง “ประเภทเงินได้” ได้"))}
      {step(tr("คุณจ่ายเงินให้คนอื่นไหม"), (
        <div className="lab-q-options" role="group" aria-label={tr("คุณจ่ายเงินให้คนอื่นไหม")}>
          {PAYMENTS.map(item => (
            <button key={item.id} type="button" aria-pressed={answers.pays.includes(item.id)} className="lab-opt" onClick={() => togglePay(item.id)}>{tr(item.label)}</button>
          ))}
          <button type="button" aria-pressed={answers.paysNone} className="lab-opt" onClick={() => set({ pays: [], paysNone: !answers.paysNone })}>{tr("ไม่จ่ายใคร")}</button>
        </div>
      ), tr("เลือกได้มากกว่าหนึ่งข้อ"))}
      {step(tr("รายรับทั้งปีประมาณเท่าไร"), single(tr("รายรับทั้งปีประมาณเท่าไร"), REVENUES, answers.revenue, id => set({ revenue: id }), true))}
      <div className="lab-q-foot">
        <p>{complete ? tr("ครบทุกข้อแล้ว") : tr("ตอบให้ครบทุกข้อเพื่อบันทึก")}</p>
        <button type="button" className="lab-btn is-primary" disabled={!complete || saving}
          onClick={() => { const next = profileFromAnswers(answers); if (next) onSave(next); }}>
          {saving ? tr("กำลังบันทึก…") : tr("บันทึกคำตอบ")}
        </button>
      </div>
    </div>
  );
}

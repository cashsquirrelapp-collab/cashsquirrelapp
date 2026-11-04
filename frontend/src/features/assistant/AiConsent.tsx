import React from 'react';
import { CheckCircle2, EyeOff, Info, Lock, Settings2, ShieldCheck } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { giveConsent, useConsents } from '../../services/consent';
import './aiConsent.css';

// เลขากระรอก asks once, before the first message, voice or file goes to the AI service (owner, 2026-11-05: "ข้อมูลของ AI
// เองอาจจะมีข้อผิดพลาดในการตอบ ... เขียนแจ้งเตือนหรือให้เขากดยินยอมด้วยนิดนึง"). The card takes the place of the message
// box in the full chat, the floating window and the phone sheet; the server refuses เลขา without the record (428), and
// LINE asks the person to agree here. The words follow the privacy policy: the AI service by kind, never by name.

/** Whether this account still has to agree before เลขา can be used (false while the answer is not known yet). */
export function useAiConsentNeeded(accountId?: string, live = true): boolean {
  const consents = useConsents(live ? accountId : undefined);
  return Boolean(live && accountId) && consents.given('ai') === false;
}

// Owner, 2026-11-05, on the first wording: "อ่านรู้สึกว่ามันอันตราย ... ข้อมูลส่วนตัวคุณอาจจะไปอยู่ที่ต่างประเทศ ... สรุปมัน
// ปลอดภัยจริงไหม". So each point says first how the data is looked after, in plain words, and stays true: the AI services
// are paid business plans, which do not train on what is sent; the masking covers file text (privacyMask.ts), and a
// picture or PDF gets its own notice (ChatUploadViews.tsx). Where the processing happens is in the privacy policy.
const POINTS: { icon: typeof Lock; text: string }[] = [
  { icon: Lock, text: "เลขาอ่านข้อความ เสียง ไฟล์ และข้อมูลในบัญชีเท่าที่ต้องใช้ตอบ ผ่านบริการ AI แบบธุรกิจที่เราเลือกใช้ ข้อมูลใช้เพื่อตอบคุณเท่านั้น และไม่ถูกนำไปฝึก AI" },
  { icon: EyeOff, text: "ไฟล์ Excel, Word และไฟล์ข้อความ ระบบปิดอีเมล เบอร์โทร เลขบัตร เลขบัญชี ที่อยู่ และชื่อบุคคลให้อัตโนมัติก่อนส่ง ส่วนรูปและ PDF แอปจะแจ้งให้ทราบก่อนส่ง" },
  { icon: CheckCircle2, text: "งาน รายจ่าย และเอกสาร เลขาไม่บันทึกเอง จะแสดงการ์ดให้คุณตรวจและกดยืนยันก่อนบันทึก แก้ไข หรือลบทุกครั้ง" },
  { icon: Info, text: "เลขาตอบผิดได้บ้าง โปรดตรวจตัวเลขสำคัญก่อนใช้ คำตอบเป็นข้อมูลประกอบ ไม่ใช่คำปรึกษาทางภาษี บัญชี หรือกฎหมาย" },
  { icon: Settings2, text: "ใช้ได้ทั้งในแอปและ LINE เปลี่ยนใจได้ทุกเมื่อที่ ตั้งค่า › ความยินยอม" },
];

export function AiConsentCard({ accountId, compact = false }: { accountId: string; compact?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState('');
  const agree = async () => {
    if (busy) return;
    setBusy(true); setProblem('');
    try { await giveConsent(accountId, 'ai'); }
    catch (error) { setProblem((error as Error).message || tr("บันทึกไม่สำเร็จ กรุณาลองใหม่")); }
    finally { setBusy(false); }
  };
  return (
    <section className={`asx-consent${compact ? ' is-compact' : ''}`} role="region" aria-labelledby="asx-consent-title" data-testid="ai-consent">
      <header className="asx-consent-head"><ShieldCheck size={15} aria-hidden="true" /><span>{tr("ความเป็นส่วนตัว")}</span></header>
      <h3 id="asx-consent-title">{tr("ก่อนเริ่มใช้เลขากระรอก")}</h3>
      <p className="asx-consent-lead">{tr("เลขากระรอกใช้ AI ช่วยตอบคำถาม บันทึกรายการ และเตรียมเอกสาร นี่คือวิธีที่เราดูแลข้อมูลของคุณ กดยินยอมครั้งเดียวก็เริ่มใช้ได้เลย")}</p>
      <ul className="asx-consent-group">
        {POINTS.map(({ icon: Icon, text }) => <li key={text}><Icon size={16} aria-hidden="true" /><span>{tr(text)}</span></li>)}
      </ul>
      {problem && <p className="asx-consent-problem" role="alert">{problem}</p>}
      <button type="button" className="asx-consent-ok" onClick={() => { void agree(); }} disabled={busy} data-testid="ai-consent-ok">
        {busy ? tr("กำลังบันทึก…") : tr("ยินยอมและเริ่มใช้งาน")}
      </button>
      <p className="asx-consent-note"><a href="/privacy" target="_blank" rel="noopener">{tr("อ่านรายละเอียดในนโยบายความเป็นส่วนตัว")}</a></p>
    </section>
  );
}

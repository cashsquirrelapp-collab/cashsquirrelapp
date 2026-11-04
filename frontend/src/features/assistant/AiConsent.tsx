import React from 'react';
import { AlertTriangle, CheckCircle2, EyeOff, Send, Settings2, ShieldCheck } from 'lucide-react';
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

const POINTS: { icon: typeof Send; text: string }[] = [
  { icon: Send, text: "ข้อความ เสียง และไฟล์ที่คุณส่ง พร้อมข้อมูลในบัญชีที่จำเป็นต่อคำตอบ ส่งให้ผู้ให้บริการ AI ภายนอกประมวลผล ซึ่งอาจอยู่นอกประเทศไทย" },
  { icon: EyeOff, text: "ไฟล์ตาราง เอกสาร และข้อความ ระบบปิดอีเมล เบอร์โทร เลขบัตร เลขบัญชี ที่อยู่ และชื่อบุคคลก่อนส่ง ส่วนรูปและ PDF ส่งทั้งไฟล์" },
  { icon: AlertTriangle, text: "เลขาอาจตอบผิดพลาด โปรดตรวจตัวเลขและข้อมูลสำคัญก่อนใช้ คำตอบไม่ใช่คำปรึกษาทางภาษี บัญชี หรือกฎหมาย" },
  { icon: CheckCircle2, text: "งาน รายจ่าย และเอกสาร เลขาจะแสดงการ์ดให้คุณตรวจและกดยืนยันก่อนบันทึก แก้ไข หรือลบทุกครั้ง" },
  { icon: Settings2, text: "ใช้ทั้งในแอปและ LINE ถอนความยินยอมได้ทุกเมื่อที่ ตั้งค่า › ความยินยอม" },
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
      <header className="asx-consent-head"><ShieldCheck size={15} aria-hidden="true" /><span>{tr("ความยินยอม")}</span></header>
      <h3 id="asx-consent-title">{tr("ก่อนเริ่มใช้เลขากระรอก")}</h3>
      <p className="asx-consent-lead">{tr("เลขากระรอกตอบคำถาม บันทึก และเตรียมเอกสารด้วยระบบ AI กรุณาอ่านแล้วกดยินยอมก่อนเริ่มใช้ (ครั้งเดียว)")}</p>
      <ul className="asx-consent-group">
        {POINTS.map(({ icon: Icon, text }) => <li key={text}><Icon size={16} aria-hidden="true" /><span>{tr(text)}</span></li>)}
      </ul>
      {problem && <p className="asx-consent-problem" role="alert">{problem}</p>}
      <button type="button" className="asx-consent-ok" onClick={() => { void agree(); }} disabled={busy} data-testid="ai-consent-ok">
        {busy ? tr("กำลังบันทึก…") : tr("ยินยอมและเริ่มใช้งาน")}
      </button>
      <p className="asx-consent-note"><a href="/privacy" target="_blank" rel="noopener">{tr("อ่านนโยบายความเป็นส่วนตัว")}</a></p>
    </section>
  );
}

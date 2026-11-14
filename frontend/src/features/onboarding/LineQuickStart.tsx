import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { tr } from '../../i18n/tr';
import { Mascot } from '../../components/mascot/Mascot';
import { OnboardingBackdrop } from './OnboardingBackdrop';
import './onboarding.css';

// Signing up in LINE in one tap (owner, 2026-11-13: "ใช้ง่าย เข้าใจได้รวดเร็ว สะดวก", and unlike the competitor's forms):
// the website's welcome look on one screen — the LINE name already in, ใช้แบบไหน, and one button that agrees and starts.
// A record tried in the chat before is shown and kept as the first one. The rest of the welcome questions come later,
// one at a time in the chat.

export type QuickUse = 'personal' | 'business' | 'company';
const USES: { id: QuickUse; label: string }[] = [
  { id: 'personal', label: 'ใช้ส่วนตัว' }, { id: 'business', label: 'ฟรีแลนซ์ / ร้านค้า' }, { id: 'company', label: 'บริษัท / สำนักงาน' },
];
export interface QuickKeep { kind: 'expense' | 'income'; name: string; amount: number }

/** The tried record from the sign-up link (made by the server, services/lineTry.ts), for showing only. */
export function readKeep(value: string | null | undefined): QuickKeep | null {
  if (!value || value.length > 600) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), char => char.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as { k?: unknown; n?: unknown; a?: unknown };
    if ((raw.k !== 'e' && raw.k !== 'i') || typeof raw.n !== 'string' || typeof raw.a !== 'number' || !(raw.a > 0)) return null;
    return { kind: raw.k === 'i' ? 'income' : 'expense', name: raw.n.slice(0, 60), amount: raw.a };
  } catch { return null; }
}

const baht = (amount: number) => `฿${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;

export default function LineQuickStart({ mobile, initialName, initialUse, keep, onStart, onHaveAccount }: {
  mobile: boolean; initialName: string; initialUse: QuickUse | null; keep: QuickKeep | null;
  /** มีบัญชีอยู่แล้ว: link an account made on the website instead (LineLinkExisting.tsx). */
  onHaveAccount?: () => void;
  /** Signs up; throws with the server's own words when it cannot. */
  onStart: (input: { name: string; use: QuickUse | null }) => Promise<void>;
}) {
  const reduce = useReducedMotion() ?? false;
  const [name, setName] = React.useState(initialName);
  const [use, setUse] = React.useState<QuickUse | null>(initialUse);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState('');
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const titleId = React.useId();

  const start = async () => {
    if (busy) return;
    if (trimmed.length < 2) { setError(tr("กรุณาใส่ชื่ออย่างน้อย 2 ตัวอักษร")); return; }
    setBusy(true); setError(''); setDone(true);
    await new Promise(resolve => window.setTimeout(resolve, reduce ? 500 : 1300));
    try { await onStart({ name: trimmed, use }); }
    catch (failure) { setDone(false); setError(failure instanceof Error && failure.message ? failure.message : tr("เริ่มใช้งานไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(false); }
  };

  return (
    <motion.div className={`wob-stage is-name-step lq${mobile ? ' is-phone' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} data-testid="line-quick-start">
      {/* Phones: the form needs the whole screen, so the floating cards step back (clean, nothing behind the words). */}
      <OnboardingBackdrop phone={mobile} still={reduce} quiet={mobile} name={trimmed} lit={new Set()} />
      <div className="wob-layer">
        <div className="wob-name">
          <div className="wob-name-center lq-center">
            <div className="wob-hello" aria-hidden="true">
              <p className="wob-hello-line lq-hello"><span className="wob-hello-words">{tr("สวัสดีครับ")}</span>
                <span className="wob-mascot"><Mascot mood="happy" gear="headset" animated={false} size={mobile ? 52 : 80} viewBox="10 14 82 82" /></span></p>
            </div>
            <form className="wob-name-form lq-form" noValidate onSubmit={event => { event.preventDefault(); void start(); }}>
              <h2 id={titleId} className="wob-ask">{tr("เริ่มใช้งานในแตะเดียว")}</h2>
              <label className="lq-label" htmlFor="lq-name">{tr("ให้เลขาเรียกคุณว่า")}</label>
              <input id="lq-name" className="wob-field lq-name" value={name} maxLength={60} autoComplete="nickname" placeholder={tr("เช่น ปาร์ค, มายด์, บอส")}
                onChange={event => { setName(event.target.value); setError(''); }} />
              <div className="lq-uses" role="radiogroup" aria-label={tr("ใช้แบบไหน")}>
                {USES.map(item => (
                  <button key={item.id} type="button" role="radio" aria-checked={use === item.id} className={`lq-use${use === item.id ? ' is-on' : ''}`}
                    onClick={() => setUse(current => (current === item.id ? null : item.id))}>{tr(item.label)}</button>
                ))}
              </div>
              {keep && (
                <div className="lq-keep" data-testid="line-quick-keep">
                  <span>{tr("จะเก็บเป็นรายการแรก")}</span>
                  <b>{keep.name} <em className={keep.kind === 'income' ? 'is-in' : 'is-out'}>{keep.kind === 'income' ? '+' : '−'}{baht(keep.amount)}</em></b>
                </div>
              )}
              <button type="submit" className="wob-next lq-go" disabled={busy}>{busy ? tr("กำลังเตรียมบัญชี…") : tr("ยอมรับและเริ่มใช้งาน")}</button>
              <p className="lq-consent">
                {tr("กดปุ่มนี้คือยอมรับ")} <a href="/terms.html" target="_blank" rel="noopener noreferrer">{tr("เงื่อนไขการใช้งาน")}</a>{' '}{tr("และ")}{' '}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr("นโยบายความเป็นส่วนตัว")}</a>{' '}
                {tr("ข้อมูลใช้เพื่อตอบคุณเท่านั้น ไม่ถูกนำไปฝึก AI เลขาบันทึกเมื่อคุณกดยืนยันเท่านั้น ไม่ต้องใช้อีเมล")}
              </p>
              {error && <p className="wob-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{error}</p>}
              {onHaveAccount && <button type="button" className="wob-have-account" onClick={onHaveAccount} disabled={busy} data-testid="line-have-account">{tr("เคยใช้บนเว็บแล้ว? เชื่อมบัญชีเดิม")}</button>}
            </form>
          </div>
        </div>
      </div>
      {done && (
        <motion.div className="wob-done" role="status" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <span className="wob-done-mascot" aria-hidden="true"><Mascot mood="celebrate" action="celebrate" gear="headset" animated={!reduce} size={mobile ? 110 : 140} viewBox="10 14 82 82" /></span>
          <p className="wob-done-title">{tr("พร้อมแล้วครับ")}</p>
          <p className="wob-done-sub">{tr("กลับไปที่แชทแล้วพิมพ์บอกเลขาได้เลย")}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Mascot } from '../../components/mascot/Mascot';
import { tr } from '../../i18n/tr';
import { OnboardingBackdrop } from './OnboardingBackdrop';

// มีบัญชีอยู่แล้ว (owner, 2026-11-14: "เข้าทางไหนก็ได้"; one account however you come in): someone signing up inside LINE who
// already uses the website signs in here with that account's email and password, and this LINE chat is linked to it
// (/api/line-signup action 'link'). No second account is made. Google sign-in does not run inside LINE, so those
// accounts are told to link from the website.

export default function LineLinkExisting({ mobile, onLink, onBack }: {
  mobile: boolean;
  /** Links; throws with the server's own words when it cannot. */
  onLink: (input: { email: string; password: string }) => Promise<void>;
  onBack: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState('');
  const titleId = React.useId();

  const link = async () => {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(tr("กรุณาใส่อีเมลให้ถูกต้อง")); return; }
    if (!password) { setError(tr("กรุณาใส่รหัสผ่าน")); return; }
    setBusy(true); setError('');
    try { await onLink({ email: email.trim(), password }); setDone(true); }
    catch (failure) { setError(failure instanceof Error && failure.message ? failure.message : tr("เชื่อมบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง")); }
    finally { setBusy(false); }
  };

  return (
    <motion.div className={`wob-stage is-name-step lq${mobile ? ' is-phone' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} data-testid="line-link-existing">
      <OnboardingBackdrop phone={mobile} still={reduce} quiet={mobile} name="" lit={new Set()} />
      <div className="wob-layer">
        <div className="wob-name">
          <div className="wob-name-center lq-center">
            <form className="wob-name-form lq-form" noValidate onSubmit={event => { event.preventDefault(); void link(); }}>
              <button type="button" className="lq-back" onClick={onBack} disabled={busy}><ArrowLeft size={16} aria-hidden="true" />{tr("ยังไม่มีบัญชี สมัครใหม่")}</button>
              <h2 id={titleId} className="wob-ask">{tr("เชื่อมกับบัญชีเดิม")}</h2>
              <p className="lq-lead">{tr("เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ใช้บนเว็บ แล้ว LINE นี้จะใช้บัญชีเดิมของคุณ ข้อมูลเดิมอยู่ครบ")}</p>
              <label className="lq-label" htmlFor="lq-email">{tr("อีเมล")}</label>
              <input id="lq-email" type="email" className="wob-field lq-name" value={email} maxLength={254} autoComplete="email" inputMode="email"
                onChange={event => { setEmail(event.target.value); setError(''); }} />
              <label className="lq-label" htmlFor="lq-password">{tr("รหัสผ่าน")}</label>
              <input id="lq-password" type="password" className="wob-field lq-name" value={password} maxLength={128} autoComplete="current-password"
                onChange={event => { setPassword(event.target.value); setError(''); }} />
              <button type="submit" className="wob-next lq-go" disabled={busy} data-testid="line-link-existing-go">{busy ? tr("กำลังเชื่อมบัญชี…") : tr("เชื่อมบัญชี")}</button>
              <p className="lq-consent">
                {tr("กดปุ่มนี้คือยินยอมให้เชื่อม LINE นี้กับบัญชีของคุณ เพื่อบันทึกรายการและรับแจ้งเตือนทาง LINE ตาม")}{' '}
                <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{tr("นโยบายความเป็นส่วนตัว")}</a>{' '}
                {tr("ยกเลิกการเชื่อมต่อได้ทุกเมื่อที่หน้าตั้งค่า")}
              </p>
              {error && <p className="wob-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{error}</p>}
              <p className="lq-consent">{tr("สมัครด้วย Google ไว้? เปิดเว็บกระรอกตุนเงินแล้วเข้าสู่ระบบ ไปที่ ตั้งค่า › เชื่อมต่อ LINE เพื่อเชื่อมบัญชีแทน")}</p>
            </form>
          </div>
        </div>
      </div>
      {done && (
        <motion.div className="wob-done" role="status" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <span className="wob-done-mascot" aria-hidden="true"><Mascot mood="celebrate" action="celebrate" gear="headset" animated={!reduce} size={mobile ? 110 : 140} viewBox="10 14 82 82" /></span>
          <p className="wob-done-title">{tr("เชื่อมบัญชีแล้วครับ")}</p>
          <p className="wob-done-sub">{tr("กลับไปที่แชทแล้วพิมพ์บอกเลขาได้เลย")}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

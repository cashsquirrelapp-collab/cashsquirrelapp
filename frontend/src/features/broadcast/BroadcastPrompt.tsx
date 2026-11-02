import React from 'react';
import { Check, Star } from 'lucide-react';
import { BROADCAST_REPLY_MAX, type BroadcastNotice } from '../../../../shared/broadcast';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Modal } from '../../components/ui/Modal';
import { tr } from '../../i18n/tr';
import { useLanguage } from '../../i18n/LanguageContext';
import { broadcastApi } from '../../services/broadcast';
import { COOKIE_CHOICE_EVENT, readCookieConsent } from '../../services/cookieConsent';
import './broadcast.css';

// The team's message to everyone (shared/broadcast.ts; owner, 2026-11-03). Shown once, when the app has settled and
// nothing else is open: a centred window on computers and iPads, the Modal's sheet on phones. The account can score the
// app from 1 to 5 and write a few words; ✕ or ปิด closes it for good.

const scoreWord = (score: number) => [tr("ต้องปรับปรุงมาก"), tr("ต้องปรับปรุง"), tr("พอใช้"), tr("ดี"), tr("ดีมาก")][score - 1];

export default function BroadcastPrompt({ accountId, ready }: {
  accountId: string;
  /** The app has loaded and no other window or guide is open. */
  ready: boolean;
}) {
  const { language } = useLanguage();
  const [notice, setNotice] = React.useState<BroadcastNotice | null>(null);
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);
  // The cookie banner sits at the bottom on first visits: the message waits until a choice is made.
  const [cookieChosen, setCookieChosen] = React.useState(() => readCookieConsent() !== null);
  React.useEffect(() => {
    const update = () => setCookieChosen(readCookieConsent() !== null);
    window.addEventListener(COOKIE_CHOICE_EVENT, update);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, update);
  }, []);

  // Asked once per app start and account.
  const askedRef = React.useRef('');
  React.useEffect(() => {
    if (!ready || !cookieChosen || askedRef.current === accountId) return;
    askedRef.current = accountId;
    const controller = new AbortController();
    broadcastApi.current(accountId, controller.signal)
      .then(result => { if (!controller.signal.aborted && result?.broadcast?.id) setNotice(result.broadcast); })
      .catch(() => { /* no message this time */ });
    return () => controller.abort();
  }, [ready, cookieChosen, accountId]);

  // Opens a moment after the page settles, and only while nothing else is open.
  const shownRef = React.useRef('');
  React.useEffect(() => {
    if (!notice || !ready || open || shownRef.current === notice.id) return;
    const timer = window.setTimeout(() => {
      shownRef.current = notice.id;
      setOpen(true);
      void broadcastApi.seen(accountId, notice.id).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [notice, ready, open, accountId]);

  if (!notice) return null;
  const close = () => {
    setOpen(false);
    if (!done) void broadcastApi.dismiss(accountId, notice.id).catch(() => {});
  };
  const canSend = !sending && (reply.trim().length > 0 || (notice.askRating && rating > 0));
  const send = async () => {
    if (!canSend) return;
    setSending(true); setError('');
    try {
      await broadcastApi.answer(accountId, notice.id, reply.trim(), notice.askRating && rating ? rating : undefined);
      setDone(true);
    } catch (cause) {
      setError((cause as Error).message || tr("ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่"));
    } finally {
      setSending(false);
    }
  };
  const sentOn = new Date(notice.createdAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <Modal open={open} onClose={close} label={tr("ข้อความจากทีมกระรอก")} width={460}>
      <div className="bcp">
        <header className="bcp-head">
          <span className="bcp-avatar" aria-hidden="true"><BrandLogo size={22} /></span>
          <span className="bcp-from"><b>{tr("ข้อความจากทีมกระรอก")}</b><small>{sentOn}</small></span>
        </header>
        {done ? (
          <div className="bcp-done" role="status">
            <span className="bcp-done-icon" aria-hidden="true"><Check size={22} strokeWidth={2.6} /></span>
            <h2>{tr("ขอบคุณสำหรับคำตอบ")}</h2>
            <p>{reply.trim() ? tr("ทีมงานได้รับข้อความแล้ว หากทีมงานตอบกลับ จะแสดงที่เมนู แจ้งปัญหา") : tr("ทีมงานได้รับคะแนนของคุณแล้ว")}</p>
            <button type="button" className="ui-button ui-button-primary bcp-wide" onClick={close}>{tr("ปิด")}</button>
          </div>
        ) : (
          <>
            <p className="bcp-body">{notice.body}</p>
            {notice.askRating && (
              <fieldset className="bcp-score">
                <legend>{tr("ให้คะแนนแอปของเรา")}</legend>
                <div className="bcp-stars" role="radiogroup" aria-label={tr("ให้คะแนนแอปของเรา")}>
                  {[1, 2, 3, 4, 5].map(score => (
                    <button key={score} type="button" role="radio" aria-checked={rating === score} aria-label={tr("{0} คะแนนจาก 5", score)}
                      className={`bcp-star${score <= rating ? ' is-on' : ''}`} onClick={() => setRating(score)}>
                      <Star size={28} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <p className="bcp-score-word" aria-live="polite">{rating ? scoreWord(rating) : tr("แตะดาวเพื่อให้คะแนน")}</p>
              </fieldset>
            )}
            <label className="bcp-reply">
              <span>{notice.askRating ? tr("ตอบทีมงาน (ไม่บังคับ)") : tr("ตอบทีมงาน")}</span>
              <textarea className="ui-input" rows={3} maxLength={BROADCAST_REPLY_MAX} value={reply} onChange={event => setReply(event.target.value)}
                placeholder={tr("เล่าให้เราฟังได้เลย เช่น สิ่งที่ชอบ หรือสิ่งที่อยากให้ปรับ")} />
              {reply.length > BROADCAST_REPLY_MAX - 200 && <small className="bcp-count">{reply.length.toLocaleString()}/{BROADCAST_REPLY_MAX.toLocaleString()}</small>}
            </label>
            {error && <p className="bcp-error" role="alert">{error}</p>}
            <div className="bcp-actions">
              <button type="button" className="ui-button ui-button-primary bcp-wide" disabled={!canSend} onClick={() => void send()}>{sending ? tr("กำลังส่ง…") : tr("ส่งคำตอบ")}</button>
              <button type="button" className="ui-button ui-button-secondary bcp-wide" onClick={close}>{tr("ปิด")}</button>
            </div>
            <p className="bcp-note">{tr("คำตอบส่งถึงทีมงาน และคุยต่อได้ที่เมนู แจ้งปัญหา")}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

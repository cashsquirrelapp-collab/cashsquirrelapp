import React from 'react';
import { Check, Star } from 'lucide-react';
import { BROADCAST_REPLY_MAX, type BroadcastNotice } from '../../../../shared/broadcast';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Modal } from '../../components/ui/Modal';
import { tr } from '../../i18n/tr';
import { useLanguage } from '../../i18n/LanguageContext';
import { broadcastApi } from '../../services/broadcast';
import './broadcast.css';

// The team's message to everyone (shared/broadcast.ts; owner, 2026-11-03). Shown once, when the app has settled and
// nothing else is open: a centred window on computers and iPads, the Modal's sheet on phones. The account can score the
// app from 1 to 5 and write a few words; ✕ or ปิด closes it for good.
// Round 2 (owner, 2026-11-03: "พิมพ์ส่งไปแล้วไม่เห็นว่ามันขึ้นสำหรับผู้ใช้เลย"): it no longer waits for the cookie choice
// (people who never tap the banner never saw it; the banner now steps aside while the window is open), it asks again when
// the app comes back on screen, and the admin page opens the same window as a preview.

/** How often an app left open asks again, when it comes back on screen. */
const RECHECK_MS = 10 * 60_000;
const scoreWord = (score: number) => [tr("ต้องปรับปรุงมาก"), tr("ต้องปรับปรุง"), tr("พอใช้"), tr("ดี"), tr("ดีมาก")][score - 1];

/** The window itself: the account's prompt, and the admin page's preview (nothing is sent from a preview). */
export function BroadcastWindow({ notice, open, onClose, onAnswer }: {
  notice: BroadcastNotice;
  open: boolean;
  /** `answered`: closed from the thank-you, not dismissed. */
  onClose: (answered: boolean) => void;
  onAnswer: (reply: string, rating?: number) => Promise<void>;
}) {
  const { language } = useLanguage();
  const [rating, setRating] = React.useState(0);
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState(false);
  // The cookie banner steps aside while this is open (cookieConsent.css), and comes back after.
  React.useEffect(() => {
    if (!open) return;
    document.body.dataset.broadcastOpen = '1';
    return () => { delete document.body.dataset.broadcastOpen; };
  }, [open]);

  const close = () => onClose(done);
  const canSend = !sending && (reply.trim().length > 0 || (notice.askRating && rating > 0));
  const send = async () => {
    if (!canSend) return;
    setSending(true); setError('');
    try {
      await onAnswer(reply.trim(), notice.askRating && rating ? rating : undefined);
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

export default function BroadcastPrompt({ accountId, ready }: {
  accountId: string;
  /** The app has loaded and no other window or guide is open. */
  ready: boolean;
}) {
  const [notice, setNotice] = React.useState<BroadcastNotice | null>(null);
  const [open, setOpen] = React.useState(false);

  // Asked when the app starts, and again when it comes back on screen after a while (an app left open, a phone's
  // home-screen app resumed without reloading).
  const checkedAtRef = React.useRef(0);
  const [visibleTick, setVisibleTick] = React.useState(0);
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - checkedAtRef.current > RECHECK_MS) setVisibleTick(tick => tick + 1); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  React.useEffect(() => {
    if (!ready || notice || (checkedAtRef.current && Date.now() - checkedAtRef.current <= RECHECK_MS)) return;
    checkedAtRef.current = Date.now();
    const controller = new AbortController();
    broadcastApi.current(accountId, controller.signal)
      .then(result => { if (!controller.signal.aborted && result?.broadcast?.id) setNotice(result.broadcast); })
      .catch(() => { checkedAtRef.current = 0; /* asked again next time it can be */ });
    return () => controller.abort();
  }, [ready, notice, accountId, visibleTick]);

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
  return (
    <BroadcastWindow notice={notice} open={open}
      onClose={answered => { setOpen(false); if (!answered) void broadcastApi.dismiss(accountId, notice.id).catch(() => {}); }}
      onAnswer={async (reply, rating) => { await broadcastApi.answer(accountId, notice.id, reply, rating); }} />
  );
}

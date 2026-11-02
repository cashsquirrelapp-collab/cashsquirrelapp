import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send, Star } from 'lucide-react';
import { BROADCAST_DAYS, BROADCAST_MAX, type BroadcastResult } from '../../../../shared/broadcast';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { SkeletonBlock } from '../../components/ui/AppLoadingSkeleton';
import { uiSurface } from '../../components/ui/uiStyles';
import { broadcastApi } from '../../services/broadcast';
import type { Confirm } from './groupUi';
import './adminBroadcast.css';

// ส่งข้อความถึงผู้ใช้ (owner, 2026-11-03: "พิมพ์ไปหา user ทุกคนได้ ... ขึ้นหน้าจอในเว็บเขา ... ให้เขาตอบกลับเราได้ด้วย"). The owner
// writes one message; every account that existed when it was sent sees it once, the next time it opens the app, and can
// score the app and answer. The answers and the scores come back here; a written answer is also a conversation in
// ข้อความจากผู้ใช้, where the team can answer it.

type Copy = (th: string, en: string) => string;

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return <span className="abc-stars" aria-hidden="true">{[1, 2, 3, 4, 5].map(score => <Star key={score} size={size} className={score <= value ? 'is-on' : ''} />)}</span>;
}

function Result({ result, copy, locale, onEnd, onOpenFeedback, mobile, past = false }: {
  result: BroadcastResult; copy: Copy; locale: string; onEnd?: () => void; onOpenFeedback?: () => void; mobile: boolean; past?: boolean;
}) {
  const when = (at: string) => new Date(at).toLocaleString(locale, { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const scored = result.ratings.reduce((sum, count) => sum + count, 0);
  const maxScore = Math.max(1, ...result.ratings);
  const tiles: [string, string, number | string][] = [
    ['ส่งถึง', 'Sent to', result.audience], ['เห็นแล้ว', 'Seen', result.seen], ['ตอบแล้ว', 'Answered', result.answered], ['ปิดไป', 'Closed', result.dismissed],
  ];
  return (
    <div className={`abc-result${mobile ? ' is-mobile' : ''}`}>
      <div className="abc-result-head">
        <span className={`abc-state${result.endedAt ? '' : ' is-live'}`}>{result.endedAt ? copy('หยุดแสดงแล้ว', 'Stopped') : copy('กำลังแสดง', 'Showing')}</span>
        <small>{copy(`ส่งเมื่อ ${when(result.createdAt)}`, `Sent ${when(result.createdAt)}`)}{result.endedAt ? ` · ${copy(`หยุดเมื่อ ${when(result.endedAt)}`, `stopped ${when(result.endedAt)}`)}` : ''}</small>
      </div>
      <p className="abc-body">{result.body}</p>
      <div className="abc-tiles">
        {tiles.map(([th, en, value]) => <div key={th}><small>{copy(th, en)}</small><b>{Number(value).toLocaleString(locale)}</b></div>)}
        <div><small>{copy('คะแนนเฉลี่ย', 'Average score')}</small><b>{result.average === null ? '—' : result.average.toLocaleString(locale, { minimumFractionDigits: 1 })}</b>{scored > 0 && <em>{copy(`จาก ${scored} คน`, `${scored} scores`)}</em>}</div>
      </div>
      {result.askRating && scored > 0 && (
        <div className="abc-dist" role="img" aria-label={copy('จำนวนคนที่ให้แต่ละคะแนน', 'How many gave each score')}>
          {[5, 4, 3, 2, 1].map(score => (
            <div key={score} className="abc-dist-row"><span>{score}</span><Star size={12} className="is-on" aria-hidden="true" /><i><b style={{ width: `${(result.ratings[score - 1] / maxScore) * 100}%` }} /></i><em>{result.ratings[score - 1]}</em></div>
          ))}
        </div>
      )}
      {!past && !result.endedAt && onEnd && (
        <div className="abc-result-actions"><button type="button" className="ui-button ui-button-secondary" onClick={onEnd}>{copy('หยุดแสดงข้อความนี้', 'Stop showing this message')}</button></div>
      )}
      <h3 className="abc-subhead">{copy(`คำตอบ ${result.replies.length.toLocaleString(locale)} รายการ`, `${result.replies.length} answers`)}</h3>
      {result.replies.length ? (
        <ul className="abc-replies">
          {result.replies.map(reply => (
            <li key={reply.userId}>
              <div className="abc-reply-head"><b>{reply.name}</b><small>{reply.publicId} · {when(reply.at)}</small></div>
              {reply.rating && <div className="abc-reply-score"><Stars value={reply.rating} /><span>{copy(`${reply.rating} จาก 5`, `${reply.rating} of 5`)}</span></div>}
              {reply.reply && <p>{reply.reply}</p>}
              {reply.threadId && onOpenFeedback && <button type="button" className="abc-link" onClick={onOpenFeedback}><MessageSquare size={14} aria-hidden="true" />{copy('ตอบกลับในข้อความจากผู้ใช้', 'Reply in User feedback')}</button>}
            </li>
          ))}
        </ul>
      ) : <p className="abc-empty">{copy('ยังไม่มีคำตอบ คำตอบจะขึ้นที่นี่เมื่อผู้ใช้เปิดแอปและตอบกลับ', 'No answers yet. They appear here once people open the app and answer.')}</p>}
    </div>
  );
}

export default function AdminBroadcast({ userId, triggerConfirm, language, onOpenFeedback, mobile = false }: {
  userId: string; triggerConfirm: Confirm; language: 'th' | 'en'; onOpenFeedback?: () => void; mobile?: boolean;
}) {
  const copy: Copy = (th, en) => (language === 'th' ? th : en);
  const locale = language === 'th' ? 'th-TH' : 'en-GB';
  const [results, setResults] = useState<BroadcastResult[] | null>(null);
  const [error, setError] = useState('');
  const [body, setBody] = useState('');
  const [askRating, setAskRating] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback((signal?: AbortSignal) => {
    setError('');
    return broadcastApi.results(userId, signal)
      .then(result => { if (!signal?.aborted) setResults(result.results); })
      .catch(cause => { if (!signal?.aborted) setError((cause as Error).message); });
  }, [userId]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const active = results?.find(result => !result.endedAt) ?? null;
  const past = (results ?? []).filter(result => result !== active);
  const text = body.trim();
  const send = () => {
    if (!text || busy) return;
    triggerConfirm(copy('ส่งข้อความถึงผู้ใช้ทุกคน', 'Send to everyone'),
      copy(`ข้อความนี้จะขึ้นบนหน้าจอของทุกบัญชีครั้งถัดไปที่เปิดแอป${active ? ' และข้อความที่แสดงอยู่ตอนนี้จะหยุดแสดง' : ''}`, `This shows on every account's screen the next time it opens the app${active ? ', and the message showing now stops' : ''}.`),
      async () => {
        setBusy(true); setNotice('');
        try { await broadcastApi.send(userId, text, askRating); setBody(''); setNotice(copy('ส่งข้อความแล้ว ผู้ใช้จะเห็นเมื่อเปิดแอปครั้งถัดไป', 'Sent. People see it the next time they open the app.')); await load(); }
        catch (cause) { setError((cause as Error).message); }
        finally { setBusy(false); }
      });
  };
  const end = (id: string) => triggerConfirm(copy('หยุดแสดงข้อความนี้', 'Stop showing this message'), copy('คนที่ยังไม่เห็นจะไม่เห็นข้อความนี้แล้ว คำตอบที่ได้รับยังอยู่ครบ', 'People who have not seen it will not see it. The answers you have stay.'), async () => {
    setBusy(true);
    try { await broadcastApi.end(userId, id); await load(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  });

  const composer = (
    <div className={`abc-compose${mobile ? ' is-mobile' : ''}`}>
      <div className="abc-compose-form">
        <label className="abc-field">
          <span>{copy('ข้อความ', 'Message')}</span>
          <textarea className="ui-input" rows={mobile ? 4 : 5} maxLength={BROADCAST_MAX} value={body} onChange={event => setBody(event.target.value)}
            placeholder={copy('เช่น สวัสดีครับ ช่วงนี้ใช้แอปเป็นอย่างไรบ้างครับ มีอะไรอยากให้เราปรับไหมครับ', 'e.g. Hello! How is the app working for you? Anything you would like us to improve?')} />
          <small className="abc-count">{body.length.toLocaleString(locale)}/{BROADCAST_MAX.toLocaleString(locale)}</small>
        </label>
        <label className="abc-check"><input type="checkbox" checked={askRating} onChange={event => setAskRating(event.target.checked)} /><span>{copy('ขอให้ให้คะแนนแอป 1–5 ดาวด้วย', 'Also ask for a 1–5 star score')}</span></label>
        <button type="button" className="ui-button ui-button-primary abc-send" disabled={!text || busy} onClick={send}><Send size={16} aria-hidden="true" />{copy('ส่งถึงทุกคน', 'Send to everyone')}</button>
        <p className="abc-hint">{copy(`ขึ้นบนหน้าจอของบัญชีที่สมัครก่อนเวลาส่ง ครั้งถัดไปที่เปิดแอป บัญชีละครั้ง นาน ${BROADCAST_DAYS} วันหรือจนกว่าจะหยุดแสดง ส่งใหม่เมื่อใด ข้อความเดิมจะหยุดแสดง`, `Shows once to each account that existed when it was sent, the next time it opens the app, for ${BROADCAST_DAYS} days or until you stop it. A new message replaces the one showing.`)}</p>
        {notice && <p className="abc-notice" role="status">{notice}</p>}
      </div>
      <div className="abc-preview" aria-label={copy('ตัวอย่างที่ผู้ใช้เห็น', 'What people see')}>
        <small className="abc-preview-label">{copy('ตัวอย่างที่ผู้ใช้เห็น', 'What people see')}</small>
        <div className="abc-preview-card">
          <div className="abc-preview-head"><span aria-hidden="true"><BrandLogo size={18} /></span><b>{copy('ข้อความจากทีมกระรอก', 'A message from the Krarok team')}</b></div>
          <p className={text ? '' : 'is-placeholder'}>{text || copy('ข้อความของคุณจะแสดงตรงนี้', 'Your message shows here')}</p>
          {askRating && <div className="abc-preview-stars"><Stars value={0} size={20} /></div>}
          <div className="abc-preview-input">{copy('ตอบทีมงาน', 'Answer the team')}</div>
          <div className="abc-preview-button">{copy('ส่งคำตอบ', 'Send answer')}</div>
        </div>
      </div>
    </div>
  );

  const failed = error && <div role="alert" className={mobile ? 'ksm-empty ksm-admin-error' : 'rounded-2xl border border-red-300/60 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300'}>{mobile ? <><h3>{copy('โหลดข้อความไม่สำเร็จ', 'Could not load messages')}</h3><p>{error}</p></> : error}</div>;
  const loading = !results && !error && <SkeletonBlock className="h-40 w-full rounded-2xl" />;

  if (mobile) {
    return (
      <div className="abc is-mobile">
        <div className="ksm-group-title"><h3>{copy('เขียนข้อความใหม่', 'New message')}</h3></div>
        <div className="ksm-panel abc-panel">{composer}</div>
        {failed}{loading}
        {active && <><div className="ksm-group-title"><h3>{copy('ข้อความที่แสดงอยู่', 'Showing now')}</h3></div><div className="ksm-panel abc-panel"><Result result={active} copy={copy} locale={locale} onEnd={() => end(active.id)} onOpenFeedback={onOpenFeedback} mobile /></div></>}
        {past.length > 0 && <><div className="ksm-group-title"><h3>{copy('ข้อความก่อนหน้า', 'Earlier messages')}</h3></div>{past.map(result => <div key={result.id} className="ksm-panel abc-panel"><Result result={result} copy={copy} locale={locale} onOpenFeedback={onOpenFeedback} mobile past /></div>)}</>}
      </div>
    );
  }

  return (
    <div className="abc space-y-4">
      <section className={`${uiSurface} p-5 sm:p-6`}>
        <h2 className="text-[15px] font-semibold">{copy('ส่งข้อความถึงผู้ใช้ทุกคน', 'Message everyone')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy('ข้อความขึ้นบนหน้าจอเมื่อผู้ใช้เปิดแอป เขาให้คะแนนและตอบกลับได้ คำตอบที่เป็นข้อความจะเข้า ข้อความจากผู้ใช้ ด้วย เพื่อให้ตอบกลับได้', 'The message shows when people open the app. They can score the app and answer; written answers also arrive in User feedback, where you can reply.')}</p>
        {composer}
      </section>
      {failed}{loading}
      {active && <section className={`${uiSurface} p-5 sm:p-6`}><h2 className="mb-3 text-[15px] font-semibold">{copy('ข้อความที่แสดงอยู่', 'Showing now')}</h2><Result result={active} copy={copy} locale={locale} onEnd={() => end(active.id)} onOpenFeedback={onOpenFeedback} mobile={false} /></section>}
      {past.length > 0 && (
        <section className={`${uiSurface} p-5 sm:p-6`}>
          <h2 className="mb-3 text-[15px] font-semibold">{copy('ข้อความก่อนหน้า', 'Earlier messages')}</h2>
          <div className="space-y-3">{past.map(result => (
            <details key={result.id} className="abc-past"><summary><span className="truncate">{result.body}</span><small>{copy(`ตอบ ${result.answered} · คะแนน ${result.average ?? '—'}`, `${result.answered} answers · score ${result.average ?? '—'}`)}</small></summary>
              <Result result={result} copy={copy} locale={locale} onOpenFeedback={onOpenFeedback} mobile={false} past /></details>
          ))}</div>
        </section>
      )}
    </div>
  );
}

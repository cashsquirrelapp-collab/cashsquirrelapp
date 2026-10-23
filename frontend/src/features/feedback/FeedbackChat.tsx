import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowUp, Check, LoaderCircle, RotateCcw } from 'lucide-react';
import { FEEDBACK_MAX_BODY_LENGTH, FEEDBACK_MESSAGE_PAGE_SIZE, type FeedbackCategory, type FeedbackMessage, type FeedbackThread } from '../../../../shared/feedback';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Mascot, type MascotAction, type MascotMood } from '../../components/mascot/Mascot';
import { useLanguage } from '../../i18n/LanguageContext';
import { feedbackApi } from '../../services/feedback';
import { feedbackError } from './feedbackUi';
import './feedbackChat.css';

// "บอกเรา" (owner's brief, 2026-10-20): the feedback page as one conversation. It is drawn from the
// existing threads and messages (database/feedback_phase_one.sql); nothing new is stored.
// - Every thread of the account is one stretch of the timeline, oldest first, with a small divider
//   carrying its type and current status. Team replies are the admins' real messages.
// - A message continues the latest thread while it is open and recent; otherwise, or when the user
//   picks a different type, it starts a new thread.
// - The thank-you bubble ("ตอบรับอัตโนมัติ") only follows a new thread the server saved, in this visit;
//   it is not stored, so it never comes back on a refresh and is never presented as a person.

type Loaded = { thread: FeedbackThread; messages: FeedbackMessage[] };
type Pending = { localId: string; body: string; category: FeedbackCategory | null; threadId: string | null; status: 'sending' | 'failed'; startedAt: number };
type Ack = { threadId: string; category: FeedbackCategory | null };
type Choice = FeedbackCategory | null;

const CONTINUE_WINDOW_MS = 2 * 60 * 60 * 1000;
const THREADS_PER_STEP = 10;
const POLL_MS = 45_000;
const COUNTER_FROM = 3600;

const CHIPS: { value: Choice; th: string; en: string }[] = [
  { value: null, th: 'ทั่วไป', en: 'General' },
  { value: 'bug', th: 'แจ้งปัญหา', en: 'Problem' },
  { value: 'idea', th: 'เสนอไอเดีย', en: 'Idea' },
];
const STATUS_TEXT: Record<FeedbackThread['status'], [string, string]> = {
  open: ['รับเรื่องแล้ว', 'Received'],
  in_progress: ['กำลังดำเนินการ', 'In progress'],
  resolved: ['ดำเนินการแล้ว', 'Done'],
};
const ACK: Record<'bug' | 'idea' | 'general', { title?: [string, string]; text: [string, string]; mood: MascotMood; action: MascotAction }> = {
  idea: { title: ['รับไอเดียแล้วครับ! 🧡', 'Idea received! 🧡'], text: ['ขอบคุณที่ช่วยให้กระรอกตุนเงินดีขึ้นนะครับ เราได้รับข้อเสนอแนะของคุณแล้ว', 'Thank you for helping make Kraroktunngern better. We have your suggestion.'], mood: 'celebrate', action: 'celebrate' },
  bug: { title: ['รับแจ้งปัญหาแล้วครับ! 🛠️', 'Problem received! 🛠️'], text: ['ขอบคุณที่แจ้งเข้ามานะครับ ทีมจะตรวจสอบรายละเอียดให้นะครับ', 'Thank you for letting us know. The team will look into the details.'], mood: 'checking', action: 'hold-document' },
  general: { text: ['ขอบคุณที่แวะมาบอกเรานะครับ ทุกความคิดเห็นมีความหมายกับทีมมากเลย 🧡', 'Thank you for telling us. Every message matters to the team. 🧡'], mood: 'happy', action: 'wave' },
};

const time = (iso: string, lang: 'th' | 'en') => new Date(iso).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
const day = (iso: string, lang: 'th' | 'en') => new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
const byStart = (a: Loaded, b: Loaded) => a.thread.createdAt.localeCompare(b.thread.createdAt) || a.thread.id.localeCompare(b.thread.id);

/** The latest page of a thread's messages (where new replies land). */
async function loadThread(userId: string, thread: FeedbackThread, signal?: AbortSignal): Promise<Loaded> {
  const last = Math.max(0, Math.ceil(thread.messageCount / FEEDBACK_MESSAGE_PAGE_SIZE) - 1);
  const detail = await feedbackApi.detail(userId, thread.id, last, signal);
  return { thread: detail.thread, messages: detail.messages };
}

/** On phones the chat is a panel between the top bar and the bottom bar, or the keyboard when it is open. */
function usePanelBox(mobile: boolean, ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<React.CSSProperties>({});
  const [keyboard, setKeyboard] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current; if (!el) return;
      if (mobile) {
        const header = document.querySelector('.ksm-header')?.getBoundingClientRect().bottom ?? 0;
        const nav = document.querySelector('.ksm-nav')?.getBoundingClientRect().top ?? window.innerHeight;
        const vv = window.visualViewport;
        const keyboardTop = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const bottomEdge = Math.min(nav, keyboardTop);
        setKeyboard(keyboardTop < nav);
        setBox({ position: 'fixed', left: 0, right: 0, top: header, height: Math.max(220, bottomEdge - header) });
      } else {
        // The page itself does not scroll: the chat fills the window below its own top edge.
        const scroller = el.closest('#main-content');
        const top = el.getBoundingClientRect().top + (scroller?.scrollTop ?? 0);
        setBox({ height: Math.max(420, window.innerHeight - top - 24) });
      }
    };
    measure();
    const vv = window.visualViewport;
    window.addEventListener('resize', measure);
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    const frame = window.setTimeout(measure, 300);
    return () => { window.removeEventListener('resize', measure); vv?.removeEventListener('resize', measure); vv?.removeEventListener('scroll', measure); window.clearTimeout(frame); };
  }, [mobile, ref]);
  return { box, keyboard };
}

function TeamAvatar({ mood = 'happy', action = 'idle', pop = false }: { mood?: MascotMood; action?: MascotAction; pop?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.span className="fbc-avatar" aria-hidden="true" initial={pop && !reduce ? { scale: 0.94, y: 10, opacity: 0 } : false} animate={{ scale: 1, y: 0, opacity: 1 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
      <Mascot mood={mood} action={action} animated={false} size={30} />
      {pop && <><motion.i className="fbc-avatar-check" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2, delay: 0.18 }}><Check size={10} strokeWidth={3} /></motion.i>{!reduce && <><i className="fbc-spark is-a" /><i className="fbc-spark is-b" /><i className="fbc-spark is-c" /></>}</>}
    </motion.span>
  );
}

export default function FeedbackChat({ userId, mobile = false, onBack }: { userId: string; mobile?: boolean; onBack?: () => void }) {
  const { language } = useLanguage();
  const lang: 'th' | 'en' = language === 'th' ? 'th' : 'en';
  const copy = (th: string, en: string) => (lang === 'th' ? th : en);
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const { box, keyboard } = usePanelBox(mobile, rootRef);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const [threads, setThreads] = useState<Loaded[]>([]);
  const [known, setKnown] = useState<FeedbackThread[]>([]); // every thread listed so far, newest first
  const [listHasMore, setListHasMore] = useState(false);
  const [listPage, setListPage] = useState(0);
  const [shown, setShown] = useState(THREADS_PER_STEP);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [choice, setChoice] = useState<Choice>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const stickToBottom = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  // Load the newest threads, then fetch the messages of any thread that changed since the last look.
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const reply = await feedbackApi.list(userId, { page: 0 }, signal);
    if (!mounted.current || signal?.aborted) return;
    const first = { threads: Array.isArray(reply?.threads) ? reply.threads : [], hasMore: Boolean(reply?.hasMore) };
    setKnown(current => {
      const merged = new Map(current.map(t => [t.id, t]));
      first.threads.forEach(t => merged.set(t.id, t));
      return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    if (listPage === 0) setListHasMore(first.hasMore);
    const wanted = first.threads.slice(0, shown);
    const current = new Map(threadsRef.current.map(item => [item.thread.id, item]));
    const changed = wanted.filter(t => { const had = current.get(t.id); return !had || had.thread.messageCount !== t.messageCount || had.thread.status !== t.status || had.thread.lastMessageAt !== t.lastMessageAt; });
    const loaded = await Promise.all(changed.map(t => loadThread(userId, t, signal)));
    if (!mounted.current || signal?.aborted) return;
    setThreads(prev => {
      const next = new Map(prev.map(item => [item.thread.id, item]));
      loaded.forEach(item => next.set(item.thread.id, item));
      return [...next.values()].sort(byStart);
    });
  }, [userId, shown, listPage]);
  const threadsRef = useRef<Loaded[]>([]);
  threadsRef.current = threads;

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    refreshRef.current(controller.signal).catch(cause => { if (!controller.signal.aborted && mounted.current) setLoadError(feedbackError(cause, lang)); })
      .finally(() => { if (!controller.signal.aborted && mounted.current) setLoading(false); });
    return () => controller.abort();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team replies arrive by looking again now and then, and when the page comes back into view.
  useEffect(() => {
    const look = () => { if (document.visibilityState === 'visible' && !sending.current) refreshRef.current().catch(() => {}); };
    const timer = window.setInterval(look, POLL_MS);
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', look);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', look); document.removeEventListener('visibilitychange', look); };
  }, []);

  // Stay at the newest message unless the user scrolled up to read.
  const onScroll = () => { const el = listRef.current; if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [threads, pending, acks, loading, box]);

  // Older threads: show more of what is listed, and list the next page when that runs out.
  const loadOlder = async () => {
    const nextShown = shown + THREADS_PER_STEP;
    stickToBottom.current = false;
    const el = listRef.current; const before = el ? el.scrollHeight - el.scrollTop : 0;
    if (known.length < nextShown && listHasMore) {
      const page = listPage + 1;
      const more = await feedbackApi.list(userId, { page });
      setListPage(page); setListHasMore(more.hasMore);
      setKnown(current => [...current, ...more.threads.filter(t => !current.some(c => c.id === t.id))]);
      const loaded = await Promise.all(more.threads.slice(0, THREADS_PER_STEP).map(t => loadThread(userId, t)));
      setThreads(prev => [...prev, ...loaded.filter(l => !prev.some(p => p.thread.id === l.thread.id))].sort(byStart));
    } else {
      const extra = known.slice(shown, nextShown).filter(t => !threads.some(l => l.thread.id === t.id));
      const loaded = await Promise.all(extra.map(t => loadThread(userId, t)));
      setThreads(prev => [...prev, ...loaded].sort(byStart));
    }
    setShown(nextShown);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
  };
  const hasOlder = known.length > threads.length || listHasMore;

  // The thread a new message continues, if any.
  const latest = threads.at(-1)?.thread ?? null;
  const continues = (category: Choice) => latest && latest.status !== 'resolved' && latest.messageCount < 1000
    && Date.now() - new Date(latest.lastMessageAt).getTime() < CONTINUE_WINDOW_MS
    && (category === null || category === latest.category) ? latest : null;

  const deliver = async (item: Pending) => {
    sending.current = true; setBusy(true);
    setPending(list => list.map(p => (p.localId === item.localId ? { ...p, status: 'sending' } : p)));
    try {
      let threadId = item.threadId;
      let created = false;
      // A retry first checks whether the earlier attempt reached the server, so nothing is sent twice.
      const sentEarlier = (m: FeedbackMessage) => m.senderRole === 'user' && m.body === item.body && new Date(m.createdAt).getTime() >= item.startedAt - 5000;
      if (threadId) {
        let already = false;
        if (item.status === 'failed') {
          const head = await feedbackApi.detail(userId, threadId);
          already = (await loadThread(userId, head.thread)).messages.some(sentEarlier);
        }
        if (!already) await feedbackApi.reply(userId, threadId, item.body);
      } else {
        const earlier = item.status === 'failed' ? (await feedbackApi.list(userId, { page: 0 })).threads
          .find(t => t.preview === item.body.slice(0, 180) && new Date(t.createdAt).getTime() >= item.startedAt - 5000) : undefined;
        threadId = earlier ? earlier.id : (await feedbackApi.create(userId, item.body, item.category ?? undefined)).threadId;
        created = true;
      }
      const detail = await feedbackApi.detail(userId, threadId!);
      const loaded = await loadThread(userId, detail.thread);
      if (!mounted.current) return;
      const mine = [...loaded.messages].reverse().find(m => m.senderRole === 'user' && m.body === item.body);
      stickToBottom.current = true;
      setThreads(prev => [...prev.filter(p => p.thread.id !== loaded.thread.id), loaded].sort(byStart));
      setKnown(current => [loaded.thread, ...current.filter(t => t.id !== loaded.thread.id)]);
      setPending(list => list.filter(p => p.localId !== item.localId));
      if (mine) setConfirmed(set => new Set(set).add(mine.id));
      if (created) setAcks(list => [...list, { threadId: loaded.thread.id, category: item.category }]);
      setAnnounce(copy('ส่งข้อความแล้ว', 'Message sent'));
    } catch (cause) {
      if (!mounted.current) return;
      setPending(list => list.map(p => (p.localId === item.localId ? { ...p, status: 'failed' } : p)));
      setAnnounce(`${copy('ส่งไม่สำเร็จ', 'Not sent')}: ${feedbackError(cause, lang)}`);
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const tooLong = draft.trim().length > FEEDBACK_MAX_BODY_LENGTH;
  const send = () => {
    const body = draft.trim();
    if (sending.current || !body || tooLong) return;
    const target = continues(choice);
    const item: Pending = { localId: `local-${Date.now()}`, body, category: target ? target.category : choice, threadId: target?.id ?? null, status: 'sending', startedAt: Date.now() };
    stickToBottom.current = true;
    setPending(list => [...list, item]);
    setDraft('');
    setChoice(null);
    void deliver(item);
    inputRef.current?.focus();
  };

  // Grow the box with the text, up to a few lines; longer text scrolls inside it.
  useLayoutEffect(() => {
    const el = inputRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, mobile ? 132 : 168)}px`;
  }, [draft, mobile]);

  const ackFor = (threadId: string) => acks.find(a => a.threadId === threadId);
  const freshAck = acks.at(-1)?.threadId;
  const empty = !loading && !loadError && threads.length === 0 && pending.length === 0;
  // "ส่งแล้ว" sits under the newest message the user sent, not under every one.
  const lastMineId = pending.length ? null : threads.flatMap(t => t.messages).filter(m => m.senderRole === 'user').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)?.id ?? null;

  return (
    <section ref={rootRef} className={`fbc${mobile ? ' is-mobile' : ''}${keyboard ? ' is-keyboard' : ''}`} style={box} aria-labelledby="fbc-title">
      {mobile ? (
        <header className="fbc-mhead">
          {onBack && <button type="button" className="fbc-back" onClick={onBack} aria-label={copy('กลับไปเมนู', 'Back to menu')}><ArrowLeft size={20} /></button>}
          <span className="fbc-mhead-logo" aria-hidden="true"><BrandLogo size={30} /></span>
          <span className="fbc-mhead-text"><h1 id="fbc-title">{copy('บอกเรา', 'Tell us')}</h1><small>{copy('ทีมกระรอกตุนเงิน', 'The Kraroktunngern team')}</small></span>
        </header>
      ) : (
        <header className="fbc-head">
          <h1 id="fbc-title">{copy('บอกเรา', 'Tell us')}</h1>
          <p>{copy('มีอะไรอยากบอกเราไหม? แจ้งปัญหา เสนอไอเดีย หรือพูดคุยกับทีมได้เลย', 'Anything to tell us? Report a problem, share an idea, or just talk to the team.')}</p>
        </header>
      )}

      <div ref={listRef} className="fbc-scroll" onScroll={onScroll}>
        <ol className="fbc-list" aria-label={copy('บทสนทนากับทีมกระรอกตุนเงิน', 'Conversation with the team')}>
          {hasOlder && !loading && <li className="fbc-older"><button type="button" onClick={() => void loadOlder()}>{copy('ดูข้อความก่อนหน้า', 'Earlier messages')}</button></li>}
          {loading && <li className="fbc-state" role="status"><LoaderCircle size={18} className="animate-spin" />{copy('กำลังโหลดข้อความ…', 'Loading messages…')}</li>}
          {loadError && <li className="fbc-state is-error" role="alert">{loadError}<button type="button" onClick={() => { setLoading(true); setLoadError(''); refresh().catch(cause => setLoadError(feedbackError(cause, lang))).finally(() => setLoading(false)); }}>{copy('ลองอีกครั้ง', 'Try again')}</button></li>}
          {empty && (
            <li className="fbc-row is-team">
              <TeamAvatar mood="wave" action="wave" />
              <div className="fbc-stack"><span className="fbc-name">{copy('ทีมกระรอกตุนเงิน', 'Kraroktunngern team')}</span>
                <p className="fbc-bubble">{copy('สวัสดีครับ 👋 มีอะไรอยากบอกเราไหม? แจ้งปัญหาหรือเสนอไอเดียได้เลยนะครับ', 'Hi 👋 Anything you would like to tell us? Report a problem or share an idea.')}</p></div>
            </li>
          )}
          {threads.map(({ thread, messages }) => {
            const ack = ackFor(thread.id);
            const category = CHIPS.find(c => c.value === (thread.category === 'other' ? null : thread.category)) ?? CHIPS[0];
            return (
              <React.Fragment key={thread.id}>
                <li className="fbc-divider"><span>{day(thread.createdAt, lang)} · {copy(category.th, category.en)} · <b className={`is-${thread.status}`}>{STATUS_TEXT[thread.status][lang === 'th' ? 0 : 1]}</b></span></li>
                {messages.map((message, index) => {
                  const team = message.senderRole === 'admin';
                  const firstOfRun = index === 0 || messages[index - 1].senderRole !== message.senderRole;
                  const isLastMine = !team && message.id === lastMineId;
                  const justSent = confirmed.has(message.id);
                  const item = (
                    <motion.li key={message.id} className={`fbc-row ${team ? 'is-team' : 'is-me'}`} initial={justSent && !reduce ? { opacity: 0.6, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {team && (firstOfRun ? <TeamAvatar /> : <span className="fbc-avatar is-spacer" aria-hidden="true" />)}
                      <div className="fbc-stack">
                        {team && firstOfRun && <span className="fbc-name">{copy('ทีมกระรอกตุนเงิน', 'Kraroktunngern team')}</span>}
                        <p className="fbc-bubble">{message.body}</p>
                        <span className="fbc-meta"><time dateTime={message.createdAt}>{time(message.createdAt, lang)}</time>
                          {!team && isLastMine && <span className="fbc-sent">{justSent ? <motion.i initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }}><Check size={12} strokeWidth={3} /></motion.i> : <Check size={12} strokeWidth={3} />}{copy('ส่งแล้ว', 'Sent')}</span>}
                        </span>
                      </div>
                    </motion.li>
                  );
                  if (index !== 0 || !ack) return item;
                  const kind = ACK[thread.category === 'bug' ? 'bug' : thread.category === 'idea' ? 'idea' : 'general'];
                  const fresh = freshAck === thread.id;
                  return (
                    <React.Fragment key={message.id}>
                      {item}
                      <motion.li className="fbc-row is-team is-ack" initial={fresh && !reduce ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, delay: fresh ? 0.28 : 0, ease: [0.22, 1, 0.36, 1] }}>
                        <TeamAvatar mood={kind.mood} action={kind.action} pop={fresh} />
                        <div className="fbc-stack">
                          <span className="fbc-name">{copy('ทีมกระรอกตุนเงิน', 'Kraroktunngern team')} <em>{copy('ตอบรับอัตโนมัติ', 'Automatic reply')}</em></span>
                          <p className="fbc-bubble">{kind.title && <b>{kind.title[lang === 'th' ? 0 : 1]}</b>}{kind.text[lang === 'th' ? 0 : 1]}</p>
                        </div>
                      </motion.li>
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
          {pending.map(item => (
            <li key={item.localId} className={`fbc-row is-me${item.status === 'failed' ? ' is-failed' : ''}`}>
              <div className="fbc-stack">
                <p className="fbc-bubble">{item.body}</p>
                <span className="fbc-meta">{item.status === 'sending'
                  ? <><LoaderCircle size={12} className="animate-spin" />{copy('กำลังส่ง…', 'Sending…')}</>
                  : <><span>{copy('ส่งไม่สำเร็จ', 'Not sent')}</span><button type="button" className="fbc-retry" disabled={busy} onClick={() => void deliver(item)}><RotateCcw size={12} />{copy('ลองใหม่', 'Retry')}</button></>}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <form className="fbc-composer" onSubmit={event => { event.preventDefault(); send(); }}>
        <div className="fbc-chips" role="radiogroup" aria-label={copy('เรื่องที่อยากบอก', 'What is this about')}>
          {CHIPS.map(chip => (
            <button key={chip.th} type="button" role="radio" aria-checked={choice === chip.value} className="fbc-chip" onClick={() => setChoice(chip.value)}>{copy(chip.th, chip.en)}</button>
          ))}
        </div>
        <div className={`fbc-input${tooLong ? ' is-invalid' : ''}`}>
          <label htmlFor="fbc-message" className="fbc-sr">{copy('ข้อความถึงทีม', 'Message to the team')}</label>
          <textarea id="fbc-message" ref={inputRef} rows={1} value={draft} onChange={event => setDraft(event.target.value)} placeholder={copy('พิมพ์สิ่งที่อยากบอกเรา...', 'Type what you want to tell us...')}
            aria-describedby="fbc-hint" enterKeyHint={mobile ? 'enter' : 'send'}
            onKeyDown={event => {
              // Enter sends on a computer (Shift+Enter is a new line); never while a Thai or other IME is composing.
              if (!mobile && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); }
            }} />
          <button type="submit" className="fbc-send" disabled={busy || !draft.trim() || tooLong} aria-label={busy ? copy('กำลังส่ง', 'Sending') : copy('ส่งข้อความ', 'Send message')}>
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.4} />}
          </button>
        </div>
        <p id="fbc-hint" className={`fbc-hint${tooLong ? ' is-error' : ''}`} aria-live="polite">
          {tooLong ? copy(`ข้อความยาวเกิน ${FEEDBACK_MAX_BODY_LENGTH.toLocaleString()} ตัวอักษร`, `Longer than ${FEEDBACK_MAX_BODY_LENGTH.toLocaleString()} characters`)
            : draft.length >= COUNTER_FROM ? `${draft.trim().length.toLocaleString()} / ${FEEDBACK_MAX_BODY_LENGTH.toLocaleString()}` : ''}
        </p>
      </form>
      <p className="fbc-sr" role="status" aria-live="polite">{announce}</p>
    </section>
  );
}

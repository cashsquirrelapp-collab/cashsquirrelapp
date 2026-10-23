import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { ArrowLeft, ChevronRight, LoaderCircle, MessageSquare, RefreshCw, Send } from 'lucide-react';
import {
  FEEDBACK_MAX_BODY_LENGTH,
  type FeedbackAdminThread, type FeedbackBox, type FeedbackKind, type FeedbackMessage,
  type FeedbackOwnerPlan, type FeedbackStatus, type FeedbackThread,
} from '../../../../shared/feedback';
import { useLanguage } from '../../i18n/LanguageContext';
import { feedbackApi } from '../../services/feedback';
import { feedbackError, statusLabels, type FeedbackLanguage } from './feedbackUi';
import './adminInbox.css';

import { tr, T } from '../../i18n/tr';
// Admin inbox (owner, 2026-10-20): when many messages arrive the admin sees who is waiting for the
// team and for how long. Boxes and counts come from cashflow_feedback_admin_list
// (database/feedback_admin_inbox.sql); the conversation and replies use the existing detail/reply/status.

type Copy = (th: string, en: string) => string;
type Meta = { counts: Record<FeedbackBox, number>; kinds: Record<FeedbackKind, number>; hasMore: boolean };

const BOXES: Array<{ key: FeedbackBox; label: [string, string]; note: [string, string] }> = [
  { key: 'waiting', label: ['รอตอบ', 'Waiting'], note: ['ผู้ใช้ส่งข้อความล่าสุด เรียงจากรอนานที่สุด', 'The user wrote last. Longest wait first.'] },
  { key: 'replied', label: ['กำลังทำ', 'In progress'], note: ['ทีมงานตอบแล้วแต่ยังไม่ปิดเรื่อง เรียงจากเก่าที่สุด', 'The team replied and the conversation is still open. Oldest first.'] },
  { key: 'resolved', label: ['ปิดแล้ว', 'Closed'], note: ['เรื่องที่ปิดแล้ว เรียงจากล่าสุด', 'Closed conversations. Newest first.'] },
];
const KINDS: Array<{ key: FeedbackKind; label: [string, string] }> = [
  { key: 'bug', label: ['แจ้งปัญหา', 'Problems'] },
  { key: 'idea', label: ['ไอเดีย', 'Ideas'] },
  { key: 'general', label: ['ทั่วไป', 'General'] },
];
const PLAN_LABELS: Record<FeedbackOwnerPlan, [string, string]> = {
  admin: ['Pro (แอดมินให้สิทธิ์)', 'Pro (granted)'],
  paid: ['Pro', 'Pro'],
  trial: ['ทดลองใช้', 'Trial'],
  revoked: ['Free (ยกเลิกสิทธิ์)', 'Free (revoked)'],
  none: ['Free', 'Free'],
};
// Formal Thai. A chip only fills the box; the admin reads and edits before sending. The text is a
// message to the user, so it stays Thai in every app language; only the chip label is translated.
const QUICK_REPLIES: Array<{ label: string; text: string }> = [
  { label: T("รับเรื่อง"), text: "ขอบคุณที่แจ้งเข้ามา ทีมงานได้รับเรื่องแล้วและกำลังตรวจสอบ จะแจ้งความคืบหน้าในแชตนี้" },
  { label: T("ขอข้อมูลเพิ่ม"), text: "รบกวนแจ้งรายละเอียดเพิ่มเติม เช่น หน้าที่ใช้งาน อุปกรณ์ที่ใช้ และขั้นตอนก่อนเกิดปัญหา เพื่อให้ทีมงานตรวจสอบได้เร็วขึ้น" },
  { label: T("แก้ไขแล้ว"), text: "ทีมงานแก้ไขเรียบร้อยแล้ว รบกวนลองใช้งานอีกครั้ง หากยังพบปัญหาสามารถตอบกลับในแชตนี้ได้" },
  { label: T("ขอบคุณไอเดีย"), text: "ขอบคุณสำหรับไอเดีย ทีมงานบันทึกไว้เพื่อพิจารณาในการพัฒนาครั้งถัดไป" },
];
const POLL_MS = 60_000;
const WIDE = '(min-width: 1024px)';
const seenKey = (userId: string) => `cashflow_admin_feedback_seen:${userId}`;

const kindOf = (thread: FeedbackThread): FeedbackKind => thread.category === 'bug' || thread.category === 'idea' ? thread.category : 'general';
const isWide = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches;

/** "40 นาที", "9 ชม.", "2 วัน"; null under a minute. */
function span(ms: number, copy: Copy) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return null;
  if (minutes < 60) return copy(`${minutes} นาที`, `${minutes} min`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy(`${hours} ชม.`, `${hours} h`);
  const days = Math.floor(hours / 24);
  return copy(`${days} วัน`, `${days} d`);
}

function ageOf(thread: FeedbackAdminThread, box: FeedbackBox, now: number, copy: Copy) {
  if (box === 'waiting') {
    const waited = now - new Date(thread.waitingSince || thread.lastMessageAt).getTime();
    const tone = waited >= 86_400_000 ? 'is-overdue' : waited >= 6 * 3_600_000 ? 'is-late' : '';
    const length = span(waited, copy);
    return { text: length ? copy(`รอ ${length}`, `waiting ${length}`) : copy('เพิ่งส่ง', 'just sent'), tone };
  }
  const length = span(now - new Date(thread.lastMessageAt).getTime(), copy);
  return { text: length ? copy(`${length}ที่แล้ว`, `${length} ago`) : copy('เมื่อสักครู่', 'just now'), tone: '' };
}

const dayKey = (value: string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const dayLabel = (value: string, lang: FeedbackLanguage) => new Date(value).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
const timeLabel = (value: string, lang: FeedbackLanguage) => new Date(value).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

function inboxError(cause: unknown, lang: FeedbackLanguage) {
  // 503 here means the database update for this inbox has not been run yet; the server says so.
  if ((cause as { status?: number })?.status === 503 && cause instanceof Error && cause.message) return cause.message;
  return feedbackError(cause, lang);
}

function readSeen(userId: string): number | null {
  try { const value = Number(localStorage.getItem(seenKey(userId))); return Number.isFinite(value) && value > 0 ? value : null; } catch { return null; }
}

function mergeMessages(current: FeedbackMessage[], incoming: FeedbackMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Desktop: the inbox fills the window below its top edge, so each pane scrolls on its own. */
function useFitHeight(ref: RefObject<HTMLElement | null>) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(560, Math.round(window.innerHeight - Math.min(top, 260) - 24)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [ref]);
  return height;
}

export default function AdminFeedbackInbox({ userId }: { userId: string }) {
  const { language } = useLanguage();
  const lang: FeedbackLanguage = language === 'th' ? 'th' : 'en';
  const copy: Copy = useCallback((th, en) => lang === 'th' ? th : en, [lang]);
  const [box, setBox] = useState<FeedbackBox>('waiting');
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [threads, setThreads] = useState<FeedbackAdminThread[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FeedbackAdminThread | null>(null);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  // "New" means newer than the admin's previous visit on this device (a convenience, not read receipts).
  const [seenBefore] = useState(() => readSeen(userId));
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const height = useFitHeight(root);
  const ticket = useRef(0);
  const busy = useRef(false);
  const pageRef = useRef(0);
  const drafts = useRef(new Map<string, string>());

  useEffect(() => {
    try { localStorage.setItem(seenKey(userId), String(Date.now())); } catch { /* private window: no "new" marks next time */ }
  }, [userId]);

  const open = useCallback((thread: FeedbackAdminThread) => {
    setSelected(thread);
    setOpened(current => current.has(thread.id) ? current : new Set(current).add(thread.id));
  }, []);

  // replace: show the spinner; quiet: replace the list after our own change; poll: merge in the background.
  const load = useCallback(async (mode: 'replace' | 'quiet' | 'poll', signal?: AbortSignal) => {
    if (mode !== 'replace' && busy.current) return;
    const mine = ++ticket.current;
    if (mode === 'replace') { busy.current = true; setLoading(true); setError(''); }
    try {
      const result = await feedbackApi.adminList(userId, { box, category: kind, page: 0 }, signal);
      if (mine !== ticket.current) return;
      setNow(Date.now());
      setError('');
      if (mode === 'poll' && pageRef.current > 0) {
        // The admin has paged further down: refresh what is shown, keep the place.
        const fresh = new Map(result.threads.map(thread => [thread.id, thread]));
        setThreads(current => current.map(thread => fresh.get(thread.id) ?? thread));
        setMeta(current => ({ counts: result.counts, kinds: result.kinds, hasMore: current?.hasMore ?? result.hasMore }));
      } else {
        setThreads(result.threads);
        setMeta({ counts: result.counts, kinds: result.kinds, hasMore: result.hasMore });
        setPage(0);
        pageRef.current = 0;
      }
      setSelected(current => {
        if (current) return result.threads.find(thread => thread.id === current.id) ?? current;
        // On a wide screen the first (longest waiting) conversation opens by itself.
        if (mode === 'replace' && result.threads[0] && isWide()) {
          const first = result.threads[0];
          setOpened(seen => seen.has(first.id) ? seen : new Set(seen).add(first.id));
          return first;
        }
        return current;
      });
    } catch (cause) {
      if (signal?.aborted || mine !== ticket.current) return;
      if (mode === 'replace') setError(inboxError(cause, lang));
    } finally {
      if (mode === 'replace' && mine === ticket.current) { busy.current = false; setLoading(false); }
    }
  }, [userId, box, kind, lang]);

  useEffect(() => {
    const controller = new AbortController();
    void load('replace', controller.signal);
    return () => { controller.abort(); busy.current = false; };
  }, [load, revision]);

  useEffect(() => {
    const poll = () => { setNow(Date.now()); if (document.visibilityState === 'visible') void load('poll'); };
    const timer = window.setInterval(poll, POLL_MS);
    window.addEventListener('focus', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [load]);

  async function loadMore() {
    if (busy.current || !meta?.hasMore) return;
    busy.current = true;
    setLoadingMore(true);
    const mine = ticket.current;
    try {
      const next = page + 1;
      const result = await feedbackApi.adminList(userId, { box, category: kind, page: next });
      if (mine !== ticket.current) return;
      setThreads(current => [...current, ...result.threads.filter(thread => !current.some(item => item.id === thread.id))]);
      setMeta({ counts: result.counts, kinds: result.kinds, hasMore: result.hasMore });
      setPage(next);
      pageRef.current = next;
    } catch (cause) {
      if (mine === ticket.current) setError(inboxError(cause, lang));
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }

  function chooseBox(next: FeedbackBox) {
    if (next === box) return;
    setBox(next); setKind(null); setSelected(null); setThreads([]); setMeta(current => current && { ...current, hasMore: false });
  }
  function chooseKind(next: FeedbackKind | null) {
    if (next === kind) return;
    setKind(next); setSelected(null); setThreads([]);
  }

  const nextThread = useMemo(() => {
    if (!selected) return null;
    const index = threads.findIndex(thread => thread.id === selected.id);
    // When the open conversation has left this box (answered or closed), the next in line is first.
    return index >= 0 ? threads[index + 1] ?? null : threads[0] ?? null;
  }, [threads, selected]);

  const boxInfo = BOXES.find(item => item.key === box)!;
  const kindTotal = meta ? meta.kinds.bug + meta.kinds.idea + meta.kinds.general : 0;

  return (
    <div ref={root} className="fai" data-open={selected ? 'true' : 'false'} style={height ? { height } : undefined}>
      <section className="fai-side" aria-labelledby="admin-feedback-heading">
        <div className="fai-side-head">
          <div className="fai-title">
            <h2 ref={heading} tabIndex={-1} id="admin-feedback-heading">{copy('กล่องข้อความจากผู้ใช้', 'User feedback inbox')}</h2>
            <button type="button" className="fai-icon-btn" onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label={copy('อัปเดต', 'Refresh')} title={copy('อัปเดต', 'Refresh')}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </div>
          <div className="fai-boxes" role="group" aria-label={copy('แท็บกล่องข้อความ', 'Inbox boxes')}>
            {BOXES.map(item => {
              const count = meta?.counts[item.key];
              return <button key={item.key} type="button" className={`fai-box is-${item.key}`} aria-pressed={box === item.key} onClick={() => chooseBox(item.key)}>
                {item.label[lang === 'th' ? 0 : 1]}{' '}
                {count !== undefined && <b className={count ? 'has-items' : ''}>{count.toLocaleString()}</b>}
              </button>;
            })}
          </div>
          <p className="fai-box-note">{boxInfo.note[lang === 'th' ? 0 : 1]}</p>
          <div className="fai-kinds" role="radiogroup" aria-label={copy('ประเภทข้อความ', 'Message type')}>
            <button type="button" role="radio" className="fai-kind" aria-checked={kind === null} onClick={() => chooseKind(null)}>{copy('ทั้งหมด', 'All')}{meta ? ` ${kindTotal.toLocaleString()}` : ''}</button>
            {KINDS.map(item => <button key={item.key} type="button" role="radio" className="fai-kind" aria-checked={kind === item.key} onClick={() => chooseKind(item.key)}>{item.label[lang === 'th' ? 0 : 1]}{meta ? ` ${meta.kinds[item.key].toLocaleString()}` : ''}</button>)}
          </div>
        </div>

        {loading && !threads.length ? (
          <div className="fai-state" role="status"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />{copy('กำลังโหลดข้อความ…', 'Loading messages…')}</div>
        ) : error && !threads.length ? (
          <div className="fai-state is-error"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>{copy('ลองอีกครั้ง', 'Try again')}</button></div>
        ) : !threads.length ? (
          <div className="fai-state">
            <MessageSquare size={22} aria-hidden="true" />
            <strong>{kind ? copy('ไม่มีเรื่องประเภทนี้ในแท็บนี้', 'Nothing of this type here') : box === 'waiting' ? copy('ตอบครบทุกเรื่องแล้ว', 'Every conversation has a reply') : box === 'replied' ? copy('ไม่มีเรื่องที่ค้างอยู่', 'Nothing in progress') : copy('ยังไม่มีเรื่องที่ปิด', 'No closed conversations yet')}</strong>
            {box === 'waiting' && !kind && <span>{copy('ข้อความใหม่จากผู้ใช้จะขึ้นที่นี่', 'New messages from users appear here.')}</span>}
          </div>
        ) : (
          <ul className="fai-list" aria-label={copy('รายการเรื่อง', 'Conversations')}>
            {threads.map(thread => {
              const age = ageOf(thread, box, now, copy);
              const fresh = !opened.has(thread.id) && thread.lastSenderRole === 'user' && seenBefore !== null && new Date(thread.lastMessageAt).getTime() > seenBefore;
              const name = thread.ownerName || thread.ownerPublicId || copy('ผู้ใช้', 'User');
              const type = kindOf(thread);
              return <li key={thread.id}>
                <button type="button" className="fai-row" aria-current={selected?.id === thread.id ? 'true' : undefined} onClick={() => open(thread)}
                  aria-label={`${copy('เปิดบทสนทนา', 'Open conversation')}: ${name} · ${thread.preview}`}>
                  <span className="fai-row-top">
                    {fresh && <span className="fai-new" title={copy('ใหม่ตั้งแต่เข้าดูครั้งก่อน', 'New since your last visit')}><span className="fai-sr">{copy('ใหม่', 'New')}</span></span>}
                    <span className="fai-name">{name}</span>
                    <span className={`fai-age ${age.tone}`}>{age.text}</span>
                  </span>
                  <span className="fai-row-meta">
                    <span className={`fai-tag is-${type}`}>{KINDS.find(item => item.key === type)!.label[lang === 'th' ? 0 : 1]}</span>
                    {thread.ownerPlan && <span>{PLAN_LABELS[thread.ownerPlan][lang === 'th' ? 0 : 1]}</span>}
                    <span>· {thread.messageCount.toLocaleString()} {copy('ข้อความ', 'messages')}</span>
                  </span>
                  <span className="fai-preview">{thread.lastSenderRole === 'admin' && <b>{copy('ทีมงาน: ', 'Team: ')}</b>}{thread.preview}</span>
                </button>
              </li>;
            })}
            <li className="fai-more">
              {meta?.hasMore
                ? <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? copy('กำลังโหลด…', 'Loading…') : copy('ดูเพิ่ม', 'Show more')}</button>
                : <p>{copy(`แสดงครบ ${threads.length.toLocaleString()} เรื่อง`, `All ${threads.length.toLocaleString()} shown`)}</p>}
              {error && <p role="alert" className="fai-notice is-error">{error}</p>}
            </li>
          </ul>
        )}
      </section>

      <section className="fai-conv" aria-label={copy('บทสนทนา', 'Conversation')}>
        {selected ? (
          <InboxConversation
            key={selected.id}
            userId={userId}
            thread={selected}
            lang={lang}
            copy={copy}
            draft={drafts.current.get(selected.id) || ''}
            onDraft={value => { if (value) drafts.current.set(selected.id, value); else drafts.current.delete(selected.id); }}
            onChanged={() => void load('quiet')}
            onBack={() => { setSelected(null); requestAnimationFrame(() => heading.current?.focus()); }}
            next={nextThread}
            onNext={() => nextThread && open(nextThread)}
          />
        ) : (
          <div className="fai-state" style={{ flex: 1 }}>
            <MessageSquare size={22} aria-hidden="true" />
            <strong>{copy('เลือกเรื่องทางซ้ายเพื่ออ่านและตอบ', 'Pick a conversation to read and reply')}</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function InboxConversation({ userId, thread, lang, copy, draft, onDraft, onChanged, onBack, next, onNext }: {
  userId: string;
  thread: FeedbackAdminThread;
  lang: FeedbackLanguage;
  copy: Copy;
  draft: string;
  onDraft: (value: string) => void;
  onChanged: () => void;
  onBack: () => void;
  next: FeedbackAdminThread | null;
  onNext: () => void;
}) {
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [status, setStatus] = useState<FeedbackStatus>(thread.status);
  const [firstPage, setFirstPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [body, setBody] = useState(draft);
  const [closeAfter, setCloseAfter] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const loaded = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const scroller = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const pinBottom = useRef(true);
  const keepOffset = useRef<number | null>(null);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  useEffect(() => {
    mounted.current = true;
    if (!isWide()) { title.current?.focus({ preventScroll: true }); title.current?.closest('.fai')?.scrollIntoView({ block: 'start' }); }
    return () => { mounted.current = false; };
  }, []);

  // The newest messages are on the last page. A new message from the user (the list refreshes every
  // minute) reloads that page and merges it in; earlier pages already shown stay.
  useEffect(() => {
    const controller = new AbortController();
    const first = !loaded.current;
    (async () => {
      let page = Math.max(0, Math.ceil(thread.messageCount / 50) - 1);
      let result = await feedbackApi.detail(userId, thread.id, page, controller.signal);
      const last = Math.max(0, Math.ceil(result.thread.messageCount / result.pageSize) - 1);
      if (last !== page) { page = last; result = await feedbackApi.detail(userId, thread.id, page, controller.signal); }
      if (controller.signal.aborted) return;
      const box = scroller.current;
      pinBottom.current = first || !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      setMessages(current => first ? result.messages : mergeMessages(current, result.messages));
      setStatus(result.thread.status);
      if (first) setFirstPage(page);
      loaded.current = true;
      setLoadError('');
    })().catch(cause => {
      if (!controller.signal.aborted && first) setLoadError(feedbackError(cause, lang));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, thread.id, thread.messageCount, thread.lastMessageAt, reload, lang]);

  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box) return;
    if (keepOffset.current !== null) { box.scrollTop = box.scrollHeight - keepOffset.current; keepOffset.current = null; return; }
    if (pinBottom.current && isWide()) box.scrollTop = box.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const element = editor.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [body]);

  async function loadEarlier() {
    if (loadingEarlier || firstPage === 0) return;
    setLoadingEarlier(true);
    try {
      const result = await feedbackApi.detail(userId, thread.id, firstPage - 1);
      if (!mounted.current) return;
      const box = scroller.current;
      keepOffset.current = box ? box.scrollHeight - box.scrollTop : null;
      pinBottom.current = false;
      setMessages(current => mergeMessages(result.messages, current));
      setFirstPage(firstPage - 1);
    } catch (cause) {
      if (mounted.current) setNotice({ text: feedbackError(cause, lang), error: true });
    } finally {
      if (mounted.current) setLoadingEarlier(false);
    }
  }

  function edit(value: string) {
    setBody(value);
    onDraft(value);
    if (notice?.error) setNotice(null);
  }

  function quick(text: string) {
    const value = body.trim() ? `${body.trimEnd()}\n${text}` : text;
    edit(value);
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(value.length, value.length); });
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = body.trim();
    if (locked.current) return;
    if (!message) { setNotice({ text: copy('พิมพ์ข้อความก่อนส่ง', 'Write a reply first.'), error: true }); editor.current?.focus(); return; }
    if (message.length > FEEDBACK_MAX_BODY_LENGTH) { setNotice({ text: copy('ข้อความยาวเกิน 4,000 ตัวอักษร', 'The reply is over 4,000 characters.'), error: true }); return; }
    locked.current = true;
    setSending(true);
    setNotice(null);
    try {
      await feedbackApi.reply(userId, thread.id, message);
      if (!mounted.current) return;
      edit('');
      let text = copy('ส่งแล้ว', 'Sent.');
      let failed = false;
      if (closeAfter) {
        try {
          await feedbackApi.status(userId, thread.id, 'resolved');
          text = copy('ส่งแล้วและปิดเรื่องแล้ว', 'Sent and closed.');
        } catch (cause) {
          failed = true;
          text = `${copy('ส่งข้อความแล้ว แต่ปิดเรื่องไม่สำเร็จ', 'Sent, but the conversation was not closed.')} ${feedbackError(cause, lang)}`;
        }
      }
      if (!mounted.current) return;
      setCloseAfter(false);
      setNotice({ text, error: failed });
      pinBottom.current = true;
      setReload(value => value + 1);
      onChanged();
    } catch (cause) {
      if (mounted.current) setNotice({ text: feedbackError(cause, lang), error: true });
    } finally {
      locked.current = false;
      if (mounted.current) { setSending(false); editor.current?.focus(); }
    }
  }

  async function changeStatus(value: FeedbackStatus) {
    if (savingStatus || value === status) return;
    const previous = status;
    setStatus(value);
    setSavingStatus(true);
    setNotice(null);
    try {
      await feedbackApi.status(userId, thread.id, value);
      if (!mounted.current) return;
      setNotice({ text: copy('บันทึกสถานะแล้ว', 'Status saved.'), error: false });
      onChanged();
    } catch (cause) {
      if (!mounted.current) return;
      setStatus(previous);
      setNotice({ text: feedbackError(cause, lang), error: true });
    } finally {
      if (mounted.current) setSavingStatus(false);
    }
  }

  const name = thread.ownerName || thread.ownerPublicId || copy('ผู้ใช้', 'User');
  const type = kindOf(thread);
  const facts = [
    KINDS.find(item => item.key === type)!.label[lang === 'th' ? 0 : 1],
    thread.ownerName && thread.ownerPublicId ? thread.ownerPublicId : '',
    thread.ownerPlan ? PLAN_LABELS[thread.ownerPlan][lang === 'th' ? 0 : 1] : '',
    copy(`แจ้งมาทั้งหมด ${thread.ownerThreadCount.toLocaleString()} เรื่อง`, `${thread.ownerThreadCount.toLocaleString()} conversations in total`),
    `${copy('เริ่ม', 'Started')} ${dayLabel(thread.createdAt, lang)}`,
  ].filter(Boolean);
  const over = body.trim().length > FEEDBACK_MAX_BODY_LENGTH;

  return <>
    <header className="fai-conv-head">
      <button type="button" className="fai-icon-btn fai-back" onClick={onBack} aria-label={copy('กลับไปรายการ', 'Back to the list')}><ArrowLeft size={18} aria-hidden="true" /></button>
      <div className="fai-who">
        <h3 ref={title} tabIndex={-1}>{name}</h3>
        <p>{facts.join(' · ')}</p>
      </div>
      <div className="fai-head-actions">
        <label className="fai-sr" htmlFor="fai-status">{copy('สถานะเรื่องนี้', 'Conversation status')}</label>
        <select id="fai-status" className="fai-status" value={status} disabled={savingStatus || loading} onChange={event => void changeStatus(event.target.value as FeedbackStatus)}>
          {(Object.keys(statusLabels) as FeedbackStatus[]).map(value => <option key={value} value={value}>{statusLabels[value][lang === 'th' ? 0 : 1]}</option>)}
        </select>
        {next && <button type="button" className="fai-next" onClick={onNext}>{copy('เรื่องถัดไป', 'Next')}<ChevronRight size={15} aria-hidden="true" /></button>}
      </div>
    </header>

    <div ref={scroller} className="fai-scroll">
      {loading ? (
        <div className="fai-state" role="status"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />{copy('กำลังโหลดข้อความ…', 'Loading messages…')}</div>
      ) : loadError ? (
        <div className="fai-state is-error"><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoading(true); setReload(value => value + 1); }}>{copy('ลองอีกครั้ง', 'Try again')}</button></div>
      ) : (
        <ol className="fai-msgs" aria-label={copy('ข้อความในบทสนทนา', 'Conversation messages')}>
          {firstPage > 0 && <li className="fai-earlier"><button type="button" onClick={() => void loadEarlier()} disabled={loadingEarlier}>{loadingEarlier ? copy('กำลังโหลด…', 'Loading…') : copy('ดูข้อความก่อนหน้า', 'Show earlier messages')}</button></li>}
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const following = messages[index + 1];
            const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
            const team = message.senderRole === 'admin';
            // One time stamp per run of messages from the same side within five minutes.
            const endsRun = !following || following.senderRole !== message.senderRole
              || dayKey(following.createdAt) !== dayKey(message.createdAt)
              || new Date(following.createdAt).getTime() - new Date(message.createdAt).getTime() > 5 * 60_000;
            return <Fragment key={message.id}>
              {newDay && <li className="fai-day"><span>{dayLabel(message.createdAt, lang)}</span></li>}
              <li className={`fai-msg${team ? ' is-team' : ''}`}>
                <div className="fai-bubble">{message.body}</div>
                {endsRun && <span className="fai-meta">{team ? `${copy('ทีมงาน', 'Team')} · ` : ''}<time dateTime={message.createdAt}>{timeLabel(message.createdAt, lang)}</time></span>}
              </li>
            </Fragment>;
          })}
        </ol>
      )}
    </div>

    <form className="fai-compose" onSubmit={send} noValidate>
      {notice && <p role={notice.error ? 'alert' : 'status'} className={`fai-notice${notice.error ? ' is-error' : ''}`}>{notice.text}</p>}
      <div className="fai-quick" role="group" aria-label={copy('คำตอบสำเร็จรูป', 'Quick replies')}>
        {QUICK_REPLIES.map(item => <button key={item.label} type="button" onClick={() => quick(item.text)} title={item.text}>{tr(item.label)}</button>)}
      </div>
      <div className="fai-input">
        <label className="fai-sr" htmlFor="fai-reply">{copy('ตอบกลับ', 'Reply')}</label>
        <textarea
          ref={editor}
          id="fai-reply"
          rows={1}
          value={body}
          disabled={sending}
          aria-invalid={over || undefined}
          placeholder={copy('พิมพ์คำตอบถึงผู้ใช้', 'Write a reply to the user')}
          onChange={event => edit(event.target.value)}
          onKeyDown={event => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
          }}
        />
        <button type="submit" className="fai-send" disabled={sending}>
          {sending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          {sending ? copy('กำลังส่ง', 'Sending') : copy('ส่ง', 'Send')}
        </button>
      </div>
      <div className="fai-compose-foot">
        <label><input type="checkbox" checked={closeAfter} disabled={sending} onChange={event => setCloseAfter(event.target.checked)} />{copy('ส่งแล้วปิดเรื่อง', 'Close after sending')}</label>
        <span className={over ? 'is-over' : ''}>
          {status === 'resolved' && !closeAfter ? copy('ถ้าตอบ เรื่องนี้จะกลับไปที่ "กำลังทำ" · ', 'Replying reopens it · ') : ''}
          {body.length > 3500 ? `${body.trim().length.toLocaleString()} / ${FEEDBACK_MAX_BODY_LENGTH.toLocaleString()}` : `${mac ? '⌘' : 'Ctrl'} + Enter ${copy('เพื่อส่ง', 'to send')}`}
        </span>
      </div>
    </form>
  </>;
}

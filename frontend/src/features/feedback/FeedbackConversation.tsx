import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { FEEDBACK_MAX_BODY_LENGTH, FEEDBACK_MESSAGE_PAGE_SIZE, type FeedbackDetailResponse, type FeedbackStatus, type FeedbackThread } from '../../../../shared/feedback';
import { Modal } from '../../components/ui/Modal';
import { uiPrimaryButton, uiSecondaryButton } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { feedbackApi } from '../../services/feedback';
import { categoryLabels, feedbackDate, feedbackError, feedbackErrorClass, feedbackSuccessClass, FeedbackLoading, FeedbackStatusBadge, statusLabels } from './feedbackUi';

export default function FeedbackConversation({ userId, thread, admin, onClose, onChanged }: {
  userId: string;
  thread: FeedbackThread;
  admin: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  const [detail, setDetail] = useState<FeedbackDetailResponse | null>(null);
  const [page, setPage] = useState(Math.max(0, Math.ceil(thread.messageCount / FEEDBACK_MESSAGE_PAGE_SIZE) - 1));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<FeedbackStatus>(thread.status);
  const [saving, setSaving] = useState<'reply' | 'status' | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const requestLatest = useRef(true);
  const currentThread = detail?.thread || thread;

  useEffect(() => {
    mounted.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = content.current?.closest('[role="dialog"]');
    heading.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'))
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); heading.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      mounted.current = false;
      document.removeEventListener('keydown', trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    feedbackApi.detail(userId, thread.id, page, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(0, Math.ceil(result.thread.messageCount / result.pageSize) - 1);
      if (requestLatest.current && page !== lastPage) {
        setPage(lastPage);
        return;
      }
      requestLatest.current = false;
      setDetail(result);
      setStatus(result.thread.status);
    }).catch(cause => {
      if (!controller.signal.aborted) setLoadError(feedbackError(cause, language));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, thread.id, page, revision, language]);

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();
    if (locked.current || loading || !detail || !message || message.length > FEEDBACK_MAX_BODY_LENGTH) return;
    locked.current = true;
    setSaving('reply');
    setMutationError('');
    setNotice('');
    try {
      await feedbackApi.reply(userId, thread.id, message);
      if (!mounted.current) return;
      setBody('');
      setNotice(copy('ส่งข้อความตอบกลับแล้ว', 'Reply sent.'));
      requestLatest.current = true;
      setRevision(value => value + 1);
      onChanged();
    } catch (cause) {
      if (mounted.current) setMutationError(feedbackError(cause, language));
    } finally {
      locked.current = false;
      if (mounted.current) { setSaving(null); textarea.current?.focus(); }
    }
  }

  async function changeStatus() {
    if (locked.current || loading || !detail || status === detail.thread.status) return;
    locked.current = true;
    setSaving('status');
    setMutationError('');
    setNotice('');
    try {
      await feedbackApi.status(userId, thread.id, status);
      if (!mounted.current) return;
      setNotice(copy('บันทึกสถานะแล้ว', 'Status updated.'));
      setRevision(value => value + 1);
      onChanged();
    } catch (cause) {
      if (mounted.current) setMutationError(feedbackError(cause, language));
    } finally {
      locked.current = false;
      if (mounted.current) setSaving(null);
    }
  }

  return (
    <Modal open onClose={() => { if (!locked.current) onClose(); }} label={copy('บทสนทนากับทีมงาน', 'Conversation with the team')} width={720}>
      <div ref={content} className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
        <header className="pr-9">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-brand-text outline-none">{admin ? copy('ข้อความจากผู้ใช้', 'User conversation') : copy('บทสนทนากับทีมงาน', 'Conversation with the team')}</h2>
          {admin && <p className="mt-1 break-words text-sm text-brand-muted">{currentThread.ownerName || currentThread.ownerPublicId || copy('ผู้ใช้', 'User')}{currentThread.ownerPublicId && currentThread.ownerName ? ` · ${currentThread.ownerPublicId}` : ''}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2"><FeedbackStatusBadge status={currentThread.status} language={language} />{currentThread.category && <span className="text-xs text-brand-muted">{categoryLabels[currentThread.category][language === 'th' ? 0 : 1]}</span>}</div>
          <p className="mt-2 text-xs text-brand-muted">{copy('เริ่มเมื่อ', 'Started')} {feedbackDate(currentThread.createdAt, language)}</p>
        </header>

        {notice && <div role="status" className={`mt-4 ${feedbackSuccessClass}`}>{notice}</div>}
        {mutationError && <div role="alert" className={`mt-4 ${feedbackErrorClass}`}>{mutationError}</div>}
        {loadError ? <div className="mt-4 space-y-3"><p role="alert" className={feedbackErrorClass}>{loadError}</p><button type="button" className={uiSecondaryButton} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />{copy('ลองอีกครั้ง', 'Try again')}</button></div> : loading ? <FeedbackLoading language={language} /> : detail && (
          <>
            {(page > 0 || detail.hasMore) && <nav aria-label={copy('หน้าข้อความในบทสนทนา', 'Conversation pages')} className="mt-5 flex items-center justify-between gap-2">
              <button type="button" className={uiSecondaryButton} disabled={page === 0 || !!saving} onClick={() => setPage(value => value - 1)} aria-label={copy('ข้อความก่อนหน้า', 'Earlier messages')}><ArrowLeft size={15} /><span className="hidden sm:inline">{copy('ก่อนหน้า', 'Earlier')}</span></button>
              <p className="text-xs text-brand-muted">{copy('หน้า', 'Page')} {page + 1} / {Math.max(1, Math.ceil(detail.thread.messageCount / detail.pageSize))}</p>
              <button type="button" className={uiSecondaryButton} disabled={!detail.hasMore || !!saving} onClick={() => setPage(value => value + 1)} aria-label={copy('ข้อความถัดไป', 'Later messages')}><span className="hidden sm:inline">{copy('ถัดไป', 'Later')}</span><ArrowRight size={15} /></button>
            </nav>}
            <ol aria-label={copy('ข้อความในบทสนทนา', 'Conversation messages')} className="mt-5 space-y-3">
              {detail.messages.map(message => {
                const fromTeam = message.senderRole === 'admin';
                return <li key={message.id} className={`rounded-2xl border p-4 ${fromTeam ? 'border-brand-blue-acc/15 bg-brand-blue-bg/50' : 'border-brand-border bg-brand-bg/60'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className={`font-semibold ${fromTeam ? 'text-brand-blue-acc' : 'text-brand-text'}`}>{fromTeam ? copy('ทีมงาน', 'Team') : admin ? (currentThread.ownerName || copy('ผู้ใช้', 'User')) : copy('คุณ', 'You')}</span><time dateTime={message.createdAt} className="text-brand-muted">{feedbackDate(message.createdAt, language)}</time></div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand-text [overflow-wrap:anywhere]">{message.body}</p>
                </li>;
              })}
            </ol>

            {admin && <div className="mt-5 rounded-xl border border-brand-border p-4"><label htmlFor="feedback-status" className="text-sm font-medium">{copy('สถานะเรื่องนี้', 'Conversation status')}</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><select id="feedback-status" className="ui-input min-w-0 flex-1" value={status} disabled={!!saving} onChange={event => setStatus(event.target.value as FeedbackStatus)}>{Object.entries(statusLabels).map(([value, labels]) => <option key={value} value={value}>{labels[language === 'th' ? 0 : 1]}</option>)}</select><button type="button" className={uiSecondaryButton} disabled={!!saving || status === detail.thread.status} onClick={() => void changeStatus()}>{saving === 'status' && <LoaderCircle size={15} className="animate-spin" />}{copy('บันทึกสถานะ', 'Save status')}</button></div></div>}

            <form onSubmit={reply} className="mt-5 border-t border-brand-border pt-5">
              <label htmlFor="feedback-reply" className="text-sm font-semibold">{copy('ตอบกลับ', 'Reply')}</label>
              {detail.thread.status === 'resolved' && <p className="mt-1 text-xs leading-relaxed text-brand-muted">{copy('ส่งข้อความเพิ่มเพื่อเปิดการสนทนาอีกครั้ง', 'Send another message to reopen this conversation.')}</p>}
              <textarea ref={textarea} id="feedback-reply" value={body} onChange={event => setBody(event.target.value)} maxLength={FEEDBACK_MAX_BODY_LENGTH} required rows={4} disabled={!!saving} aria-describedby="feedback-reply-count" className="ui-input mt-2 min-h-28 resize-y" placeholder={copy('พิมพ์ข้อความตอบกลับ…', 'Write a reply…')} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p id="feedback-reply-count" className="text-xs tabular-nums text-brand-muted">{body.length.toLocaleString()} / {FEEDBACK_MAX_BODY_LENGTH.toLocaleString()} {copy('ตัวอักษร', 'characters')}</p><button type="submit" className={uiPrimaryButton} disabled={!!saving || !body.trim()}>{saving === 'reply' ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}{saving === 'reply' ? copy('กำลังส่ง…', 'Sending…') : copy('ส่งข้อความ', 'Send reply')}</button></div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}

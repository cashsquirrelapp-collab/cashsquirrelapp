import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, MessageSquare, RefreshCw } from 'lucide-react';
import type { FeedbackListResponse, FeedbackStatus, FeedbackThread } from '../../../../shared/feedback';
import { uiSecondaryButton, uiSurface } from '../../components/ui/uiStyles';
import { useLanguage } from '../../i18n/LanguageContext';
import { feedbackApi } from '../../services/feedback';
import FeedbackConversation from './FeedbackConversation';
import { categoryLabels, feedbackDate, feedbackError, feedbackErrorClass, feedbackFocusClass, FeedbackLoading, FeedbackReplyIndicator, FeedbackStatusBadge, statusLabels } from './feedbackUi';

export default function FeedbackInbox({ userId, admin = false, refreshKey = 0 }: {
  userId: string;
  admin?: boolean;
  refreshKey?: number;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  const [result, setResult] = useState<FeedbackListResponse | null>(null);
  const [status, setStatus] = useState<FeedbackStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<FeedbackThread | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setPage(0); }, [refreshKey]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    feedbackApi.list(userId, { admin, status: status === 'all' ? undefined : status, page }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        // A status change can empty the last page while its conversation is open.
        if (!data.threads.length && page > 0) { setPage(value => value - 1); return; }
        setResult(data);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(feedbackError(cause, language)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, admin, status, page, revision, refreshKey, language]);

  return (
    <section className={`${uiSurface} overflow-hidden`} aria-labelledby={admin ? 'admin-feedback-heading' : 'my-feedback-heading'}>
      <header className="border-b border-brand-border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 ref={heading} tabIndex={-1} id={admin ? 'admin-feedback-heading' : 'my-feedback-heading'} className="text-base font-semibold outline-none">{admin ? copy('กล่องข้อความจากผู้ใช้', 'User feedback inbox') : copy('ข้อความของคุณ', 'Your conversations')}</h2><p className="mt-1 text-sm leading-relaxed text-brand-muted">{admin ? copy('ดูเรื่องที่ผู้ใช้ส่งมา ตอบกลับ และติดตามสถานะได้ในที่เดียว', 'Read user messages, reply, and manage their status in one place.') : copy('เปิดเรื่องเดิมเพื่ออ่านคำตอบหรือส่งรายละเอียดเพิ่มเติม', 'Open a conversation to read replies or add more details.')}</p></div><button type="button" className={uiSecondaryButton} disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />{copy('อัปเดต', 'Refresh')}</button></div>
        {admin && <div className="mt-4 max-w-xs"><label htmlFor="feedback-status-filter" className="mb-1.5 block text-xs font-medium text-brand-muted">{copy('กรองตามสถานะ', 'Filter by status')}</label><select id="feedback-status-filter" value={status} className="ui-input" onChange={event => { setStatus(event.target.value as FeedbackStatus | 'all'); setPage(0); }}><option value="all">{copy('ทุกสถานะ', 'All statuses')}</option>{Object.entries(statusLabels).map(([value, labels]) => <option key={value} value={value}>{labels[language === 'th' ? 0 : 1]}</option>)}</select></div>}
      </header>

      {loading ? <FeedbackLoading language={language} /> : error ? <div className="space-y-3 p-5"><p role="alert" className={feedbackErrorClass}>{error}</p><button type="button" className={uiSecondaryButton} onClick={() => setRevision(value => value + 1)}>{copy('ลองอีกครั้ง', 'Try again')}</button></div> : result && !result.threads.length ? (
        <div className="px-5 py-12 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-faint text-brand-muted"><MessageSquare size={23} aria-hidden="true" /></span><p className="mt-4 font-medium">{admin ? (status === 'all' ? copy('ยังไม่มีข้อความจากผู้ใช้', 'No user feedback yet') : copy('ไม่มีเรื่องในสถานะนี้', 'No conversations with this status')) : copy('ยังไม่มีข้อความที่ส่ง', 'No conversations yet')}</p><p className="mt-2 text-sm leading-relaxed text-brand-muted">{admin ? copy('ข้อความใหม่จากผู้ใช้จะปรากฏที่นี่', 'New feedback from users will appear here.') : copy('ส่งปัญหาหรือไอเดียด้านบน แล้วติดตามคำตอบได้ที่นี่', 'Send a problem or an idea above, then follow the reply here.')}</p></div>
      ) : result && <>
        <ul className="divide-y divide-brand-border/70">
          {result.threads.map(thread => <li key={thread.id}><button type="button" className={`w-full px-5 py-5 text-left transition-colors hover:bg-brand-bg/60 sm:px-6 ${feedbackFocusClass}`} onClick={() => setSelected(thread)} aria-label={`${copy('เปิดบทสนทนา', 'Open conversation')}: ${thread.preview}`}>
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><FeedbackStatusBadge status={thread.status} language={language} />{thread.category && <span className="text-xs text-brand-muted">{categoryLabels[thread.category][language === 'th' ? 0 : 1]}</span>}</div>
              {admin && <p className="mt-2 break-words text-xs font-medium text-brand-muted">{thread.ownerName || thread.ownerPublicId || copy('ผู้ใช้', 'User')}{thread.ownerName && thread.ownerPublicId ? ` · ${thread.ownerPublicId}` : ''}</p>}
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm font-medium leading-relaxed text-brand-text [overflow-wrap:anywhere]">{thread.preview}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2"><FeedbackReplyIndicator thread={thread} language={language} /><span className="text-xs tabular-nums text-brand-muted">{thread.messageCount} {copy('ข้อความ', 'messages')}</span><time dateTime={thread.lastMessageAt} className="text-xs text-brand-muted">{feedbackDate(thread.lastMessageAt, language)}</time></div>
            </div><ChevronRight size={18} className="mt-1 shrink-0 text-brand-muted" aria-hidden="true" /></div>
          </button></li>)}
        </ul>
        {(page > 0 || result.hasMore) && <nav aria-label={copy('หน้ารายการข้อความ', 'Feedback list pages')} className="flex items-center justify-between gap-3 border-t border-brand-border px-5 py-4 sm:px-6"><button type="button" className={uiSecondaryButton} disabled={page === 0} onClick={() => setPage(value => value - 1)} aria-label={copy('หน้าก่อนหน้า', 'Previous page')}><ArrowLeft size={16} /><span className="hidden sm:inline">{copy('ก่อนหน้า', 'Previous')}</span></button><p className="text-xs text-brand-muted">{copy('หน้า', 'Page')} {page + 1}</p><button type="button" className={uiSecondaryButton} disabled={!result.hasMore} onClick={() => setPage(value => value + 1)} aria-label={copy('หน้าถัดไป', 'Next page')}><span className="hidden sm:inline">{copy('ถัดไป', 'Next')}</span><ArrowRight size={16} /></button></nav>}
      </>}

      {selected && <FeedbackConversation key={selected.id} userId={userId} thread={selected} admin={admin} onClose={() => { setSelected(null); heading.current?.focus(); }} onChanged={() => setRevision(value => value + 1)} />}
    </section>
  );
}

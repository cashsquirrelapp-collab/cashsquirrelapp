import { LoaderCircle } from 'lucide-react';
import type { FeedbackCategory, FeedbackStatus, FeedbackThread } from '../../../../shared/feedback';

export type FeedbackLanguage = 'th' | 'en';
export const statusLabels: Record<FeedbackStatus, [string, string]> = {
  open: ['ใหม่', 'New'],
  in_progress: ['กำลังดำเนินการ', 'In progress'],
  resolved: ['ปิดเรื่องแล้ว', 'Resolved'],
};
export const categoryLabels: Record<FeedbackCategory, [string, string]> = {
  bug: ['แจ้งปัญหา', 'Report a problem'],
  idea: ['เสนอไอเดีย', 'Suggest an idea'],
  other: ['เรื่องอื่น ๆ', 'Other'],
};
export const feedbackErrorClass = 'rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-950/20 dark:text-red-300';
export const feedbackSuccessClass = 'rounded-xl bg-brand-green-bg p-3 text-sm text-brand-green-acc';
export const feedbackFocusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-acc focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg';

export function feedbackDate(value: string, language: FeedbackLanguage) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(language === 'th' ? 'th-TH' : 'en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function feedbackError(cause: unknown, language: FeedbackLanguage) {
  const status = (cause as { status?: number })?.status;
  const copy = (th: string, en: string) => language === 'th' ? th : en;
  if (status === 429) return copy('ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่', 'You are sending messages too quickly. Please wait and try again.');
  if (status === 403) return copy('บัญชีนี้ไม่มีสิทธิ์เข้าถึงข้อความนี้', 'This account cannot access this conversation.');
  if (status === 404) return copy('ไม่พบข้อความนี้ กรุณากลับไปอัปเดตรายการ', 'This conversation was not found. Please refresh the list.');
  if (status === 401) return copy('กรุณาเข้าสู่ระบบอีกครั้ง', 'Please sign in again.');
  if (language === 'th' && cause instanceof Error && status && status >= 400 && status < 500) return cause.message;
  return copy('โหลดหรือบันทึกข้อความไม่สำเร็จ กรุณาลองอีกครั้ง', 'Unable to load or save messages. Please try again.');
}

export function FeedbackStatusBadge({ status, language }: { status: FeedbackStatus; language: FeedbackLanguage }) {
  const color = status === 'resolved' ? 'bg-brand-green-bg text-brand-green-acc' : status === 'in_progress' ? 'bg-brand-blue-bg text-brand-blue-acc' : 'bg-brand-faint text-brand-muted';
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}>{statusLabels[status][language === 'th' ? 0 : 1]}</span>;
}

export function FeedbackReplyIndicator({ thread, language }: { thread: FeedbackThread; language: FeedbackLanguage }) {
  if (thread.status === 'resolved') return null;
  const replied = thread.lastSenderRole === 'admin';
  return <span className={`inline-flex items-center gap-1.5 text-xs ${replied ? 'text-brand-green-acc' : 'text-brand-muted'}`}><span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${replied ? 'bg-brand-green-acc' : 'bg-brand-muted'}`} />{replied ? (language === 'th' ? 'ทีมงานตอบแล้ว' : 'Team replied') : (language === 'th' ? 'รอทีมงานตอบ' : 'Waiting for the team')}</span>;
}

export function FeedbackLoading({ language }: { language: FeedbackLanguage }) {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm text-brand-muted"><LoaderCircle size={18} className="animate-spin" aria-hidden="true" />{language === 'th' ? 'กำลังโหลดข้อความ…' : 'Loading messages…'}</div>;
}

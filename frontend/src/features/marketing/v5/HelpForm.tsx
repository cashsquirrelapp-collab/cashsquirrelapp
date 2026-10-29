import React from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import {
  PUBLIC_FEEDBACK_IMAGE_MAX_BYTES, PUBLIC_FEEDBACK_IMAGE_TYPES, PUBLIC_FEEDBACK_LIMITS, type PublicFeedbackKind,
} from '../../../../../shared/feedbackPublic';
import { apiJson } from '../../../services/api';
import { tr, T } from '../../../i18n/tr';
import { BRAND_LINKS } from './brandLinks';

// The landing's report form (owner, 2026-10-29): problems and bugs, ideas and feature requests, general feedback, for
// people who have not signed in. It sends to /api/feedback-public, which files the report in the existing แจ้งปัญหา
// system. Every way in (the menu's ช่วยเหลือ, the buttons under the price, the footer) opens this one form with the
// matching kind. A failed send says so and keeps what was typed (here and in this browser) to send again.

export const KINDS: { kind: PublicFeedbackKind; label: string }[] = [
  { kind: 'bug', label: T('แจ้งปัญหา / บั๊ก') },
  { kind: 'idea', label: T('เสนอไอเดีย / ขอฟีเจอร์') },
  { kind: 'general', label: T('ความคิดเห็นทั่วไป') },
];

type Draft = { kind: PublicFeedbackKind; subject: string; details: string; page: string; steps: string; happened: string; email: string };
const EMPTY: Omit<Draft, 'kind'> = { subject: '', details: '', page: '', steps: '', happened: '', email: '' };
const DRAFT_KEY = 'krarok-landing-feedback-draft';
type Picture = { name: string; type: (typeof PUBLIC_FEEDBACK_IMAGE_TYPES)[number]; data: string };

function readDraft(): Partial<Draft> {
  try { return JSON.parse(window.localStorage.getItem(DRAFT_KEY) || '{}') as Partial<Draft>; } catch { return {}; }
}
function keepDraft(draft: Draft | null) {
  try { if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); else window.localStorage.removeItem(DRAFT_KEY); } catch { /* private mode: kept for this visit only */ }
}
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export function HelpForm({ kind, onClose }: { kind: PublicFeedbackKind; onClose: () => void }) {
  const [draft, setDraft] = React.useState<Draft>(() => ({ ...EMPTY, ...readDraft(), kind }));
  const [picture, setPicture] = React.useState<Picture | null>(null);
  const [pictureError, setPictureError] = React.useState('');
  const [state, setState] = React.useState<'editing' | 'sending' | 'sent' | 'failed'>('editing');
  const [error, setError] = React.useState('');
  const [pictureLost, setPictureLost] = React.useState(false);
  const [website, setWebsite] = React.useState('');
  const first = React.useRef<HTMLInputElement>(null);

  // The page stays where it is underneath; Escape closes; the subject is where typing starts.
  React.useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    root.style.overflow = 'hidden';
    first.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    // Back to whatever opened it once it closes.
    return () => { root.style.overflow = before; window.removeEventListener('keydown', key); opener?.focus?.(); };
  }, [onClose]);
  React.useEffect(() => { if (state !== 'sent') keepDraft(draft); }, [draft, state]);

  const set = (field: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(value => ({ ...value, [field]: event.target.value }));
  const bug = draft.kind === 'bug';

  const choosePicture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setPictureError('');
    if (!file) return;
    if (!(PUBLIC_FEEDBACK_IMAGE_TYPES as readonly string[]).includes(file.type)) { setPictureError(tr('เลือกภาพ PNG, JPG หรือ WebP')); return; }
    if (file.size > PUBLIC_FEEDBACK_IMAGE_MAX_BYTES) { setPictureError(tr('ภาพใหญ่เกิน 2 MB กรุณาเลือกภาพที่เล็กลง')); return; }
    try { setPicture({ name: file.name.slice(0, 120), type: file.type as Picture['type'], data: await readFile(file) }); }
    catch { setPictureError(tr('อ่านไฟล์ภาพไม่ได้ ลองเลือกใหม่อีกครั้ง')); }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state === 'sending') return;
    setState('sending'); setError('');
    try {
      const answer = await apiJson<{ ok: boolean; imageDelivered?: boolean }>('/api/feedback-public', {
        method: 'POST',
        body: JSON.stringify({
          kind: draft.kind, subject: draft.subject, details: draft.details,
          ...(bug ? { page: draft.page, steps: draft.steps, happened: draft.happened } : {}),
          email: draft.email.trim(), ...(picture ? { image: picture } : {}), ...(website ? { website } : {}),
        }),
      });
      setPictureLost(Boolean(picture) && answer.imageDelivered === false);
      keepDraft(null);
      setState('sent');
    } catch (failure) {
      setError((failure as Error).message || tr('บริการไม่พร้อมใช้งาน กรุณาลองใหม่'));
      setState('failed');
    }
  };

  return (
    <div className="cl-help-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cl-help-dialog cl-glass" role="dialog" aria-modal="true" aria-labelledby="cl-help-title">
        <div className="cl-help-top">
          <h2 id="cl-help-title">{tr('ส่งเรื่องถึงทีมกระรอก')}</h2>
          <button type="button" className="cl-help-close" onClick={onClose} aria-label={tr('ปิด')}><X size={18} /></button>
        </div>
        {state === 'sent' ? (
          <div className="cl-help-done" role="status">
            <span className="cl-help-done-icon" aria-hidden="true"><Check size={22} strokeWidth={3} /></span>
            <p className="cl-help-done-title">{tr('ได้รับเรื่องแล้ว ขอบคุณที่ช่วยให้กระรอกดีขึ้น')}</p>
            {pictureLost && <p className="cl-help-note">{tr('แต่ภาพประกอบส่งไม่สำเร็จ ส่งภาพมาทางอีเมลได้ที่ {0}', BRAND_LINKS.email)}</p>}
            <button type="button" className="cl-help-send" onClick={onClose}>{tr('ปิด')}</button>
          </div>
        ) : (
          <form className="cl-help-form" onSubmit={send} noValidate={false}>
            <fieldset className="cl-help-kinds">
              <legend>{tr('ประเภทเรื่อง')}</legend>
              {KINDS.map(item => (
                <label key={item.kind} className={`cl-help-kind${draft.kind === item.kind ? ' is-on' : ''}`}>
                  <input type="radio" name="kind" value={item.kind} checked={draft.kind === item.kind} onChange={() => setDraft(value => ({ ...value, kind: item.kind }))} />
                  {tr(item.label)}
                </label>
              ))}
            </fieldset>
            <label className="cl-help-field">
              <span>{tr('หัวข้อเรื่อง')}</span>
              <input ref={first} required minLength={3} maxLength={PUBLIC_FEEDBACK_LIMITS.subject} value={draft.subject} onChange={set('subject')} />
            </label>
            <label className="cl-help-field">
              <span>{bug ? tr('รายละเอียดปัญหา') : tr('รายละเอียด')}</span>
              <textarea required minLength={5} maxLength={PUBLIC_FEEDBACK_LIMITS.details} rows={4} value={draft.details} onChange={set('details')} />
            </label>
            {bug && (
              <>
                <label className="cl-help-field">
                  <span>{tr('หน้าที่พบปัญหา')}</span>
                  <input required minLength={2} maxLength={PUBLIC_FEEDBACK_LIMITS.page} placeholder={tr('เช่น หน้างาน หรือ หน้าออกเอกสาร')} value={draft.page} onChange={set('page')} />
                </label>
                <label className="cl-help-field">
                  <span>{tr('สิ่งที่ทำก่อนพบปัญหา')}</span>
                  <textarea required minLength={2} maxLength={PUBLIC_FEEDBACK_LIMITS.steps} rows={3} value={draft.steps} onChange={set('steps')} />
                </label>
                <label className="cl-help-field">
                  <span>{tr('สิ่งที่เกิดขึ้น')}</span>
                  <textarea required minLength={2} maxLength={PUBLIC_FEEDBACK_LIMITS.happened} rows={3} value={draft.happened} onChange={set('happened')} />
                </label>
              </>
            )}
            <div className="cl-help-field">
              <span>{tr('ภาพประกอบ (ไม่บังคับ)')}</span>
              {picture ? (
                <span className="cl-help-file"><ImagePlus size={16} aria-hidden="true" /><b>{picture.name}</b>
                  <button type="button" onClick={() => setPicture(null)}>{tr('เอาออก')}</button></span>
              ) : (
                <label className="cl-help-pick"><ImagePlus size={16} aria-hidden="true" />{tr('เลือกภาพ (PNG, JPG, WebP ไม่เกิน 2 MB)')}
                  <input type="file" accept={PUBLIC_FEEDBACK_IMAGE_TYPES.join(',')} onChange={choosePicture} /></label>
              )}
              {pictureError && <small className="cl-help-error" role="alert">{pictureError}</small>}
            </div>
            <label className="cl-help-field">
              <span>{tr('อีเมลสำหรับติดต่อกลับ (ไม่บังคับ)')}</span>
              <input type="email" maxLength={254} autoComplete="email" value={draft.email} onChange={set('email')} />
              <small>{tr('ใช้ติดต่อกลับเรื่องนี้เท่านั้น')}</small>
            </label>
            {/* Only bots fill this in; people never see it. */}
            <input className="cl-help-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={website} onChange={event => setWebsite(event.target.value)} />
            {state === 'failed' && (
              <p className="cl-help-failed" role="alert">
                <b>{tr('ส่งไม่สำเร็จ')}</b> {error} {tr('ข้อความที่กรอกยังอยู่ ลองส่งอีกครั้งได้')}{' '}
                {tr('หรืออีเมลหาเราที่')} <a href={`mailto:${BRAND_LINKS.email}`}>{BRAND_LINKS.email}</a>
              </p>
            )}
            <div className="cl-help-actions">
              <button type="button" className="cl-help-cancel" onClick={onClose}>{tr('ยกเลิก')}</button>
              <button type="submit" className="cl-help-send" disabled={state === 'sending'}>{state === 'sending' ? tr('กำลังส่ง…') : tr('ส่งเรื่อง')}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

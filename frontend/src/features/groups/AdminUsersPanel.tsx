import React, { useEffect, useRef, useState } from 'react';
import type { AdminAccounts, SystemRole } from '../../../../shared/groups';
import { groupApi } from '../../services/groups';
import { getCurrentAccount } from '../../services/api';
import { authClient } from '../../services/auth';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  panel,
  input,
  primary,
  secondary,
  Pagination,
  type Confirm,
} from './groupUi';

export default function AdminUsersPanel({
  userId,
  triggerConfirm,
  onRoleChanged,
}: {
  userId: string;
  triggerConfirm: Confirm;
  onRoleChanged: () => Promise<void>;
}) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const [result, setResult] = useState<AdminAccounts | null>(null),
    [draft, setDraft] = useState(''),
    [search, setSearch] = useState('');
  const [deletionRequests, setDeletionRequests] = useState<{ userId: string; email: string; requestedAt: string; expiresAt: string }[] | null>(null);
  const [recoveryLinks, setRecoveryLinks] = useState<{ url: string; expiresAt: string }[]>([]);
  const [creatingRecoveryLink, setCreatingRecoveryLink] = useState(false);
  const [copiedRecoveryLink, setCopiedRecoveryLink] = useState('');
  const [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true),
    writing = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setResult(null);
    groupApi
      .accounts(userId, search, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [userId, search, page, revision]);
  useEffect(() => {
    const controller = new AbortController();
    groupApi.accountDeletionRequests(userId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setDeletionRequests(data.requests); })
      .catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [userId, revision]);
  const setRole = async (target: string, role: SystemRole) => {
    if (!mounted.current || writing.current || getCurrentAccount() !== userId)
      return;
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      await groupApi.setRole(userId, target, role);
      if (!mounted.current || getCurrentAccount() !== userId) return;
      await authClient.auth.getSession();
      setRevision((v) => v + 1);
      await onRoleChanged();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const createRecoveryLink = async () => {
    if (!mounted.current || writing.current || getCurrentAccount() !== userId) return;
    writing.current = true;
    setCreatingRecoveryLink(true);
    setBusy(true);
    setError('');
    setCopiedRecoveryLink('');
    try {
      const result = await groupApi.createAccountRecoveryLink(userId);
      if (!mounted.current || getCurrentAccount() !== userId) return;
      setRecoveryLinks(current => [result, ...current]);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      writing.current = false;
      if (mounted.current) {
        setCreatingRecoveryLink(false);
        setBusy(false);
      }
    }
  };
  const copyRecoveryLink = async (link: { url: string; expiresAt: string }) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedRecoveryLink(link.url);
    } catch {
      setError(copy('คัดลอกไม่ได้ กรุณาเลือกและคัดลอกลิงก์จากช่องข้อความ', 'Copy failed. Select and copy the link from the text field.'));
    }
  };
  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-lg">
            {copy('สิทธิ์ผู้ใช้ทั้งระบบ', 'System user roles')}
          </h2>
          <p className="text-xs text-brand-muted mt-1">
            {copy(
              'Admin ดูแลทุกกลุ่มและเปลี่ยน role ผู้ใช้ได้',
              'Admins can moderate all groups and change user roles.',
            )}
          </p>
        </div>
        <span className="text-xs text-brand-muted">
          {result?.total || 0} {copy('บัญชี', 'accounts')}
        </span>
      </div>
      <form
        className="flex gap-2 mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          setPage(0);
          setRevision((v) => v + 1);
        }}
      >
        <label className="sr-only" htmlFor="admin-user-search">
          {copy('ค้นหาชื่อหรือ User ID', 'Search name or User ID')}
        </label>
        <input
          id="admin-user-search"
          className={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={copy('ชื่อ หรือ SQ-XXXXXXXXXX', 'Name or SQ-XXXXXXXXXX')}
          maxLength={60}
        />
        <button className={`${primary} shrink-0`} disabled={busy}>
          {copy('ค้นหา', 'Search')}
        </button>
      </form>
      {error && (
        <p role="alert" className="p-3 text-sm text-red-600 break-words">
          {error}
        </p>
      )}
      <section className="mb-6 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-4 dark:border-orange-300/15 dark:bg-orange-300/5">
        <div className="mb-3">
          <h3 className="font-bold text-sm">{copy('คำขอลบบัญชีถาวร', 'Permanent deletion requests')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-brand-muted">
            {copy('ลิงก์นี้ไม่ผูกกับบัญชีใดบัญชีหนึ่ง ผู้ใช้กรอกอีเมลสำรองที่ยืนยันแล้วเพื่อค้นหาบัญชีที่รอลบ ลิงก์แต่ละอันมีอายุ 1 ชั่วโมง และลิงก์ที่ยังไม่หมดอายุใช้ได้ทุกอัน', 'These links are not tied to a specific account. Users enter their verified backup email to find the account awaiting deletion. Each link lasts 1 hour, and every unexpired link remains usable.')}
          </p>
        </div>
        <button
          type="button"
          className={secondary}
          disabled={busy || !deletionRequests?.length}
          onClick={() => triggerConfirm(
            copy('สร้างลิงก์กู้คืนกลาง', 'Create a general recovery link'),
            copy('ลิงก์นี้ใช้ได้กับบัญชีที่สั่งลบถาวรและยังอยู่ในช่วงกู้คืน ผู้ใช้ต้องกรอกอีเมลสำรองที่ยืนยันไว้ ลิงก์มีอายุ 1 ชั่วโมง และการสร้างลิงก์เพิ่มจะไม่ยกเลิกลิงก์ที่ยังไม่หมดอายุ', 'This link can be used for any permanently deleted account still within its recovery period. The user must enter their verified backup email. It lasts 1 hour, and generating another link will not invalidate unexpired links.'),
            () => { void createRecoveryLink(); },
          )}
        >
          {creatingRecoveryLink ? copy('กำลังสร้าง…', 'Creating…') : copy('สร้างลิงก์กู้คืน', 'Generate recovery link')}
        </button>
        {recoveryLinks.length > 0 && (
          <div className="mt-3 space-y-2">
            {recoveryLinks.map(link => (
              <div key={link.url} className="rounded-xl border border-brand-border/40 bg-brand-white p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input aria-label={copy('ลิงก์กู้คืนบัญชี', 'Account recovery link')} className={input} value={link.url} readOnly onFocus={event => event.currentTarget.select()} />
                  <button type="button" className={secondary} onClick={() => { void copyRecoveryLink(link); }}>
                    {copiedRecoveryLink === link.url ? copy('คัดลอกแล้ว', 'Copied') : copy('คัดลอกลิงก์', 'Copy link')}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-brand-muted">{copy('ลิงก์หมดอายุ', 'Link expires')} {new Date(link.expiresAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
            ))}
          </div>
        )}
        {deletionRequests === null ? (
          <p className="text-xs text-brand-muted">{copy('กำลังโหลดคำขอ…', 'Loading requests…')}</p>
        ) : deletionRequests.length === 0 ? (
          <p className="rounded-xl bg-brand-white/70 px-3 py-3 text-xs text-brand-muted">{copy('ไม่มีคำขอลบบัญชีที่รออยู่', 'No pending account deletion requests.')}</p>
        ) : (
          <div className="space-y-3">
            {deletionRequests.map(request => {
              return (
                <div key={request.userId} className="rounded-xl border border-brand-border/40 bg-brand-white p-3.5">
                  <p className="break-all text-sm font-semibold">{request.email}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-brand-muted">
                    {copy('ขอเมื่อ', 'Requested')} {new Date(request.requestedAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}{copy('กู้คืนได้ถึง', 'Recover by')} {new Date(request.expiresAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {!result && !error && (
        <p className="text-sm text-brand-muted">
          {copy('กำลังโหลดผู้ใช้…', 'Loading accounts…')}
        </p>
      )}
      <div className="divide-y divide-brand-border/40">
        {result?.users.map((user) => (
          <div
            key={user.userId}
            className="flex flex-wrap justify-between items-center gap-3 py-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-sm break-all">
                {user.displayName}
                {user.userId === userId ? copy(' (คุณ)', ' (you)') : ''}
              </p>
              <p className="text-xs text-brand-muted mt-1 font-mono">{user.publicId} · {user.role}</p>
            </div>
            <button
              className={secondary}
              disabled={busy}
              onClick={() => {
                const role = user.role === 'admin' ? 'user' : 'admin';
                triggerConfirm(
                  copy('เปลี่ยน role ระบบ', 'Change system role'),
                  copy(
                    `${user.displayName} (${user.publicId}) → ${role} การให้ admin จะให้สิทธิ์ดูแลทุกกลุ่มและจัดการ role ผู้ใช้`,
                    `${user.displayName} (${user.publicId}) → ${role}. Admin grants access to all groups and user role management.`,
                  ),
                  () => {
                    void setRole(user.userId, role);
                  },
                );
              }}
            >
              {user.role === 'admin'
                ? copy('เปลี่ยนเป็น user', 'Make user')
                : copy('ให้สิทธิ์ admin', 'Make admin')}
            </button>
          </div>
        ))}
      </div>
      {result && !result.users.length && (
        <p className="text-sm text-brand-muted py-5">
          {copy('ไม่พบผู้ใช้', 'No accounts found')}
        </p>
      )}
      <Pagination
        page={page}
        total={result?.total || 0}
        size={25}
        onChange={setPage}
        disabled={busy}
      />
    </div>
  );
}

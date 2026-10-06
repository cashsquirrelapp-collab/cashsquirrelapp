import React, { useEffect, useRef, useState } from 'react';
import type { AdminAccounts, SystemRole } from '../../../../shared/groups';
import { groupApi, type AdminRecoveryLink } from '../../services/groups';
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
  const [recoveryLinks, setRecoveryLinks] = useState<AdminRecoveryLink[]>([]);
  const [recoveryLinksLoaded, setRecoveryLinksLoaded] = useState(false);
  const [creatingRecoveryLink, setCreatingRecoveryLink] = useState(false);
  const [copiedRecoveryLink, setCopiedRecoveryLink] = useState('');
  const [copiedRecoveryCode, setCopiedRecoveryCode] = useState('');
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
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    let includeUrls = true;
    setRecoveryLinksLoaded(false);
    const refreshRecoveryLinks = async () => {
      if (inFlight || controller.signal.aborted || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const result = await groupApi.accountRecoveryLinks(userId, includeUrls, controller.signal);
        includeUrls = false;
        if (!controller.signal.aborted && getCurrentAccount() === userId) {
          setRecoveryLinks(current => result.links
            .filter(link => new Date(link.expiresAt).getTime() > Date.now())
            .map(link => {
              const previous = current.find(existing => existing.id === link.id);
              const active = !link.consumedAt && !link.revokedAt;
              return {
                ...link,
                url: active ? link.url || previous?.url || null : null,
                recoveryCode: active ? link.recoveryCode || previous?.recoveryCode || null : null,
              };
            }));
          setRecoveryLinksLoaded(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    };
    void refreshRecoveryLinks();
    const interval = window.setInterval(() => { void refreshRecoveryLinks(); }, 15_000);
    document.addEventListener('visibilitychange', refreshRecoveryLinks);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshRecoveryLinks);
    };
  }, [userId, revision]);
  useEffect(() => {
    const removeExpiredLinks = () => setRecoveryLinks(current => {
      const active = current.filter(link => new Date(link.expiresAt).getTime() > Date.now());
      return active.length === current.length ? current : active;
    });
    const interval = window.setInterval(removeExpiredLinks, 5_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const refreshPresence = () => {
      if (inFlight || document.visibilityState !== 'visible' || getCurrentAccount() !== userId) return;
      inFlight = true;
      void groupApi.accounts(userId, search, page, controller.signal)
        .then(data => {
          if (!controller.signal.aborted && getCurrentAccount() === userId) setResult(data);
        })
        .catch(() => {})
        .finally(() => { inFlight = false; });
    };
    const interval = window.setInterval(refreshPresence, 10_000);
    document.addEventListener('visibilitychange', refreshPresence);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshPresence);
    };
  }, [userId, search, page]);
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
  const setProAccess = async (target: string, enabled: boolean) => {
    if (!mounted.current || writing.current || getCurrentAccount() !== userId) return;
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      await groupApi.setProAccess(userId, target, enabled);
      if (!mounted.current || getCurrentAccount() !== userId) return;
      setRevision(value => value + 1);
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
    setCopiedRecoveryCode('');
    try {
      const result = await groupApi.createAccountRecoveryLink(userId);
      if (!mounted.current || getCurrentAccount() !== userId) return;
      setRecoveryLinks(current => [result, ...current.filter(link => link.id !== result.id)]);
      setRecoveryLinksLoaded(true);
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
  const copyRecoveryLink = async (link: AdminRecoveryLink) => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedRecoveryLink(link.id);
    } catch {
      setError(copy('คัดลอกไม่ได้ กรุณาเลือกและคัดลอกลิงก์จากช่องข้อความ', 'Copy failed. Select and copy the link from the text field.'));
    }
  };
  const copyRecoveryCode = async (link: AdminRecoveryLink) => {
    if (!link.recoveryCode) return;
    try {
      await navigator.clipboard.writeText(link.recoveryCode);
      setCopiedRecoveryCode(link.id);
    } catch {
      setError(copy('คัดลอกไม่ได้ กรุณาเลือกและคัดลอกรหัสจากช่องข้อความ', 'Copy failed. Select and copy the code from the text field.'));
    }
  };
  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-bold text-lg">
            {copy('บัญชีผู้ใช้', 'User accounts')}
          </h2>
          <p className="text-xs text-brand-muted mt-1">
            {copy(
              'ค้นหาบัญชี จัดการ Pro และถอดสิทธิ์ Admin ที่มีอยู่ได้',
              'Search accounts, manage Pro access, and remove existing admin access.',
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
          <h3 className="font-bold text-sm">{copy('กู้คืนบัญชี', 'Account recovery')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-brand-muted">
            {copy('สร้างลิงก์และรหัสกู้คืนแยกกัน ส่งให้ผู้ใช้คนละช่องทาง ผู้ใช้ต้องใช้อีเมลสำรองที่ยืนยันไว้ แต่ละรหัสมีอายุ 1 ชั่วโมง', 'Create a recovery link and a separate code. Send them through separate channels. The user must use a verified backup email. Each code lasts 1 hour.')}
          </p>
        </div>
        <button
          type="button"
          className={secondary}
          disabled={busy}
          onClick={() => triggerConfirm(
            copy('สร้างรหัสกู้คืนกลาง', 'Create a general recovery code'),
            copy('ลิงก์เปิดหน้ากู้คืน ส่วนรหัสใช้ยืนยันสิทธิ์และมีอายุ 1 ชั่วโมง ส่งลิงก์กับรหัสแยกช่องทาง รหัสใหม่จะไม่ยกเลิกรหัสที่ยังไม่หมดอายุ', 'The link opens the recovery page. The code authorizes recovery for 1 hour. Send the link and code through separate channels. New codes do not invalidate active codes.'),
            () => { void createRecoveryLink(); },
          )}
        >
          {creatingRecoveryLink ? copy('กำลังสร้าง…', 'Creating…') : copy('สร้างรหัสกู้คืน', 'Generate recovery code')}
        </button>
        {!recoveryLinksLoaded ? (
          <p className="mt-3 rounded-xl bg-brand-white/70 px-3 py-3 text-xs text-brand-muted">{copy('กำลังโหลดลิงก์กู้คืน…', 'Loading recovery links…')}</p>
        ) : recoveryLinks.length === 0 ? (
          <p className="mt-3 rounded-xl bg-brand-white/70 px-3 py-3 text-xs text-brand-muted">{copy('ไม่มีลิงก์กู้คืนที่ยังไม่หมดอายุ', 'There are no unexpired recovery links.')}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {recoveryLinks.map(link => {
              const dateOptions: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' };
              const recoveredAccount = [link.recoveredDisplayName, link.recoveredPublicId].filter(Boolean).join(' · ') || link.recoveredUserId || copy('ไม่พบข้อมูลบัญชี', 'Account unavailable');
              return (
                <div key={link.id} className="rounded-xl border border-brand-border/40 bg-brand-white p-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {link.url ? (
                      <input aria-label={copy('ลิงก์กู้คืนบัญชี', 'Account recovery link')} className={`${input} min-w-0`} value={link.url} readOnly onFocus={event => event.currentTarget.select()} />
                    ) : (
                      <p className="min-w-0 flex-1 rounded-xl border border-brand-border/40 bg-brand-bg/40 px-3 py-2.5 text-xs leading-relaxed text-brand-muted">
                        {link.consumedAt || link.revokedAt
                          ? copy('รหัสนี้ใช้แล้วหรือถูกยกเลิก', 'This code was used or revoked.')
                          : copy('รหัสนี้สร้างก่อนเปิดใช้รายการลิงก์ และไม่สามารถเรียกกลับมาได้', 'This code predates link history and cannot be restored.')}
                      </p>
                    )}
                    <button type="button" className={secondary} disabled={!link.url} onClick={() => { void copyRecoveryLink(link); }}>
                      {copiedRecoveryLink === link.id ? copy('คัดลอกแล้ว', 'Copied') : copy('คัดลอกลิงก์', 'Copy link')}
                    </button>
                  </div>
                  {!link.consumedAt && !link.revokedAt && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      {link.recoveryCode ? (
                        <input aria-label={copy('รหัสกู้คืนสำหรับส่งแยก', 'Recovery code to send separately')} type="password" className={`${input} min-w-0 font-mono`} value={link.recoveryCode} readOnly onFocus={event => event.currentTarget.select()} />
                      ) : (
                        <p className="min-w-0 flex-1 rounded-xl border border-brand-border/40 bg-brand-bg/40 px-3 py-2.5 text-xs text-brand-muted">{copy('ไม่สามารถเรียกรหัสกู้คืนเดิมกลับมาได้', 'This recovery code cannot be retrieved.')}</p>
                      )}
                      <button type="button" className={secondary} disabled={!link.recoveryCode} onClick={() => { void copyRecoveryCode(link); }}>
                        {copiedRecoveryCode === link.id ? copy('คัดลอกแล้ว', 'Copied') : copy('คัดลอกรหัส', 'Copy code')}
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-brand-muted">
                    <span className={`rounded-full px-2 py-1 font-semibold ${link.consumedAt ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : link.revokedAt ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-brand-faint text-brand-muted'}`}>
                      {link.consumedAt ? copy('ใช้กู้คืนแล้ว', 'Used') : link.revokedAt ? copy('ยกเลิกแล้ว', 'Revoked') : copy('ยังไม่ถูกใช้', 'Not used')}
                    </span>
                    <span>{copy('สร้างเมื่อ', 'Created')} {new Date(link.createdAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', dateOptions)}</span>
                    <span>{copy('หมดอายุ', 'Expires')} {new Date(link.expiresAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', dateOptions)}</span>
                  </div>
                  {link.consumedAt && (
                    <div className="mt-2 rounded-lg bg-brand-bg/50 px-3 py-2 text-xs leading-relaxed text-brand-text">
                      <p><span className="font-semibold">{copy('บัญชีที่กู้คืน:', 'Account recovered:')}</span> {recoveredAccount}</p>
                      {link.recoveredEmail && <p className="mt-0.5 break-all text-brand-muted">{copy('อีเมลสำรอง:', 'Backup email:')} {link.recoveredEmail}</p>}
                      <p className="mt-0.5 text-[11px] text-brand-muted">{copy('กู้คืนเมื่อ', 'Recovered')} {new Date(link.consumedAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', dateOptions)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {deletionRequests === null ? (
          <p className="text-xs text-brand-muted">{copy('กำลังโหลดคำขอ…', 'Loading requests…')}</p>
        ) : deletionRequests.length === 0 ? (
          <p className="rounded-xl bg-brand-white/70 px-3 py-3 text-xs text-brand-muted">{copy('ไม่มีบัญชีรอลบ สามารถสร้างลิงก์กู้คืนไว้ได้', 'No accounts await deletion. You can still generate a recovery link.')}</p>
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
              <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs">
                <span className={`size-2 rounded-full ${user.isOnline ? 'bg-emerald-500' : 'bg-stone-400'}`} aria-hidden="true" />
                <span className={user.isOnline ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-brand-muted'}>
                  {user.isOnline ? copy('ออนไลน์', 'Online') : copy('ออฟไลน์', 'Offline')}
                </span>
                {user.lastSeenAt && (
                  <span className="text-brand-muted">
                    · {copy('ใช้งานล่าสุด', 'Last seen')} {new Date(user.lastSeenAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', {
                      timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
                    })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${user.proStatus === 'admin' || user.proStatus === 'paid' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : user.proStatus === 'trial' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : user.proStatus === 'revoked' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-brand-faint text-brand-muted'}`}>
                {user.proStatus === 'admin'
                  ? copy('Pro · แอดมินให้', 'Pro · Admin grant')
                  : user.proStatus === 'paid'
                    ? copy('Pro · ชำระแล้ว', 'Pro · Paid')
                    : user.proStatus === 'trial'
                      ? copy('Pro · ทดลองใช้', 'Pro · Trial')
                      : user.proStatus === 'revoked'
                        ? copy('ปิด Pro โดยแอดมิน', 'Pro disabled by admin')
                        : copy('Free', 'Free')}
              </span>
              <button
                type="button"
                className={user.proStatus === 'admin' || user.proStatus === 'paid' || user.proStatus === 'trial' ? secondary : primary}
                disabled={busy}
                onClick={() => {
                  const enable = !['admin', 'paid', 'trial'].includes(user.proStatus || 'none');
                  triggerConfirm(
                    enable ? copy('ให้สิทธิ์ Pro', 'Grant Pro access') : copy('ยกเลิก Pro', 'Cancel Pro access'),
                    enable
                      ? copy(`ให้ ${user.displayName} ใช้ Pro ได้จนกว่าแอดมินจะยกเลิก`, `Grant Pro to ${user.displayName} until an admin cancels it.`)
                      : copy(`ยกเลิกสิทธิ์ Pro ของ ${user.displayName} ทันที`, `Revoke Pro access for ${user.displayName} immediately.`),
                    () => { void setProAccess(user.userId, enable); },
                  );
                }}
              >
                {['admin', 'paid', 'trial'].includes(user.proStatus || 'none')
                  ? copy('ยกเลิก Pro', 'Cancel Pro')
                  : copy('ให้ Pro', 'Grant Pro')}
              </button>
              {user.role === 'admin' && (
                <button
                  type="button"
                  className={secondary}
                  disabled={busy}
                  onClick={() => triggerConfirm(
                    copy('ถอดสิทธิ์ Admin', 'Remove admin access'),
                    copy(
                      `ยืนยันเปลี่ยน ${user.displayName} (${user.publicId}) ให้เป็นผู้ใช้ทั่วไป`,
                      `Confirm changing ${user.displayName} (${user.publicId}) to a regular user.`,
                    ),
                    () => { void setRole(user.userId, 'user'); },
                  )}
                >
                  {copy('ถอดสิทธิ์ Admin', 'Remove admin')}
                </button>
              )}
            </div>
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

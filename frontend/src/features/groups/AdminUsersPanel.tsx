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

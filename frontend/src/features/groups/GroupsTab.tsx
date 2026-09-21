import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Crown,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  GroupAction,
  GroupDetail,
  GroupRole,
  GroupSnapshot,
  PublicProfile,
} from '../../../../shared/groups';
import { groupApi } from '../../services/groups';
import { getCurrentAccount } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';

import AdminUsersPanel from './AdminUsersPanel';
import GroupMembersPanel from './GroupMembersPanel';
import {
  panel,
  input,
  primary,
  secondary,
  Pagination,
  type Confirm,
} from './groupUi';
interface Props {
  userId: string;
  isGuest: boolean;
  triggerConfirm: Confirm;
}
export default function GroupsTab({ userId, isGuest, triggerConfirm }: Props) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const roleLabel = (role: GroupRole | null) =>
    role === 'leader'
      ? copy('หัวหน้า', 'Leader')
      : role === 'member'
        ? copy('ลูกน้อง', 'Member')
        : copy('ดูแลโดย admin', 'Admin access');
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'groups' | 'users'>('groups');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<PublicProfile[]>([]);
  const mounted = useRef(true),
    writing = useRef(false);
  const newGroupId = useRef('');
  const request = useRef<AbortController | null>(null);
  const active = () => mounted.current && getCurrentAccount() === userId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const reload = useCallback(async () => {
    if (isGuest || getCurrentAccount() !== userId) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const next = await groupApi.snapshot(
        userId,
        scope,
        page,
        controller.signal,
      );
      if (controller.signal.aborted || !mounted.current) return;
      setSnapshot(next);
      if (next.systemRole !== 'admin') {
        setView('groups');
        if (scope === 'all') setScope('mine');
      }
      if (selected) {
        try {
          const group = await groupApi.detail(
            userId,
            selected,
            controller.signal,
          );
          if (!controller.signal.aborted && mounted.current) setDetail(group);
        } catch (e) {
          if (
            (e as { status?: number }).status === 404 ||
            (e as { status?: number }).status === 403
          ) {
            if (!controller.signal.aborted && mounted.current) {
              setSelected(null);
              setDetail(null);
            }
          } else throw e;
        }
      } else setDetail(null);
    } catch (e) {
      if (!controller.signal.aborted && mounted.current) {
        setError((e as Error).message);
        setDetail(null);
        setSnapshot(null);
        if ((e as { status?: number }).status === 403) {
          setScope('mine');
          setView('groups');
          setSelected(null);
        }
      }
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, [userId, isGuest, scope, page, selected]);
  useEffect(() => {
    setError('');
    void reload();
  }, [reload]);
  useEffect(() => {
    const focus = () => {
      if (!writing.current) void reload();
    };
    window.addEventListener('focus', focus);
    const timer = window.setInterval(() => {
      if (!document.hidden) focus();
    }, 60000);
    return () => {
      window.removeEventListener('focus', focus);
      window.clearInterval(timer);
    };
  }, [reload]);
  const mutate = async (action: GroupAction) => {
    if (!active() || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    request.current?.abort();
    try {
      const result = await groupApi.mutate(userId, action);
      if (!active()) return;
      setNotice(copy('บันทึกเรียบร้อยแล้ว', 'Changes saved'));
      setCreating(false);
      setEditing(false);
      setMemberQuery('');
      setMemberResults([]);
      if (action.action === 'create' || action.action === 'accept') {
        await reload();
        setSelected(result.groupId);
        setScope('mine');
        setPage(0);
      } else if (action.action === 'leave' || action.action === 'delete') {
        setSelected(null);
        setDetail(null);
      } else await reload();
    } catch (e) {
      if (active()) {
        await reload();
        setError((e as Error).message);
      }
    } finally {
      writing.current = false;
      if (active()) setBusy(false);
    }
  };
  const confirm = (title: string, message: string, action: GroupAction) =>
    triggerConfirm(title, message, () => {
      void mutate(action);
    });
  const canManage =
    detail && (detail.myRole === 'leader' || snapshot?.systemRole === 'admin');
  const openCreate = () => {
    newGroupId.current = crypto.randomUUID();
    setName('');
    setDescription('');
    setCreating(true);
    setEditing(false);
    setNotice('');
  };
  const activityLabels: Record<string, string> = {
    create: copy('สร้างกลุ่ม', 'Created group'),
    invite: copy('เชิญสมาชิก', 'Invited member'),
    accept: copy('เข้าร่วมกลุ่ม', 'Joined group'),
    decline: copy('ปฏิเสธคำเชิญ', 'Declined invitation'),
    'revoke-invite': copy('ยกเลิกคำเชิญ', 'Revoked invitation'),
    'member-role:leader': copy('เพิ่มสิทธิ์หัวหน้า', 'Promoted leader'),
    'member-role:member': copy('เปลี่ยนเป็นลูกน้อง', 'Demoted to member'),
    transfer: copy('โอนตำแหน่งหัวหน้า', 'Transferred leadership'),
    'remove-member': copy('นำสมาชิกออก', 'Removed member'),
    leave: copy('ออกจากกลุ่ม', 'Left group'),
    rename: copy('แก้ไขกลุ่ม', 'Updated group'),
  };
  return (
    <section
      className="page-content space-y-6 text-brand-text min-w-0"
      aria-label={copy('จัดการกลุ่ม', 'Group management')}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-brand-blue-acc">
            WORK TOGETHER
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-display font-extrabold">
            {copy('กลุ่มของเรา', 'Your teams')}
          </h1>
          <p className="mt-2 text-sm text-brand-muted">
            {copy(
              'สร้างทีม ชวนสมาชิก และจัดการสิทธิ์ในที่เดียว',
              'Create teams, invite people, and manage access in one place.',
            )}
          </p>
        </div>
        {!isGuest && (
          <div className="flex gap-2">
            <button
              className={secondary}
              disabled={busy || loading}
              onClick={() => {
                setError('');
                void reload();
              }}
              aria-label={copy('รีเฟรชกลุ่ม', 'Refresh groups')}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className={primary} disabled={busy} onClick={openCreate}>
              <Plus size={16} />
              {copy('สร้างกลุ่ม', 'Create group')}
            </button>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: Users,
            title: copy('User', 'User'),
            text: copy(
              'สร้างกลุ่มและรับคำเชิญเข้าร่วมได้',
              'Create groups and accept invitations.',
            ),
          },
          {
            icon: Crown,
            title: copy('หัวหน้ากลุ่ม', 'Group leader'),
            text: copy(
              'เชิญสมาชิก เปลี่ยนสิทธิ์ และโอนตำแหน่ง',
              'Invite people, change roles, and transfer leadership.',
            ),
          },
          {
            icon: ShieldCheck,
            title: 'Admin',
            text: copy(
              'ดูแลทุกกลุ่มและสิทธิ์ผู้ใช้ทั้งระบบ',
              'Moderate all groups and manage system roles.',
            ),
          },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="rounded-2xl border border-brand-border/40 bg-brand-faint/40 p-4 flex gap-3"
          >
            <Icon size={20} className="text-brand-blue-acc shrink-0 mt-1" />
            <div>
              <p className="font-bold text-sm">{title}</p>
              <p className="mt-1 text-xs text-brand-muted leading-relaxed">
                {text}
              </p>
            </div>
          </div>
        ))}
      </div>
      {isGuest ? (
        <div className={`${panel} text-center py-12`}>
          <Users className="mx-auto text-brand-blue-acc mb-4" size={40} />
          <h2 className="font-bold text-xl">
            {copy(
              'พร้อมสร้างทีมของคุณแล้วหรือยัง?',
              'Ready to create your team?',
            )}
          </h2>
          <p className="mt-3 text-sm text-brand-muted">
            {copy(
              'ฟีเจอร์กลุ่มใช้กับบัญชีจริง กรุณาออกจากโหมดทดลองแล้วเข้าสู่ระบบหรือสมัครสมาชิก',
              'Groups require an account. Leave guest mode to sign in or register.',
            )}
          </p>
        </div>
      ) : (
        <>
          {snapshot && (
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={copy('เลือกมุมมอง', 'Choose view')}
            >
              <button
                className={
                  view === 'groups' && scope === 'mine' ? primary : secondary
                }
                onClick={() => {
                  setView('groups');
                  setScope('mine');
                  setPage(0);
                }}
              >
                {copy('กลุ่มของฉัน', 'My groups')} · {snapshot.systemRole}
              </button>
              {snapshot.systemRole === 'admin' && (
                <>
                  <button
                    className={
                      view === 'groups' && scope === 'all' ? primary : secondary
                    }
                    onClick={() => {
                      setView('groups');
                      setScope('all');
                      setPage(0);
                    }}
                  >
                    {copy('ทุกกลุ่ม', 'All groups')}
                  </button>
                  <button
                    className={view === 'users' ? primary : secondary}
                    onClick={() => setView('users')}
                  >
                    {copy('จัดการผู้ใช้', 'Manage users')}
                  </button>
                </>
              )}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm break-words"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-2xl bg-emerald-50 text-emerald-700 p-3 text-sm"
            >
              <Check size={16} />
              {notice}
            </div>
          )}
          {creating && (
            <form
              className={panel}
              onSubmit={(e) => {
                e.preventDefault();
                void mutate({
                  action: 'create',
                  groupId: newGroupId.current,
                  name: name.trim(),
                  description: description.trim(),
                });
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">
                  {copy('สร้างกลุ่มใหม่', 'Create a new group')}
                </h2>
                <button
                  type="button"
                  className={secondary}
                  disabled={busy}
                  onClick={() => setCreating(false)}
                  aria-label={copy('ปิดฟอร์ม', 'Close form')}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">
                  {copy('ชื่อกลุ่ม', 'Group name')}
                  <input
                    className={`${input} mt-2`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                    autoFocus
                  />
                </label>
                <label className="text-sm font-semibold">
                  {copy('รายละเอียด', 'Description')}
                  <input
                    className={`${input} mt-2`}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                  />
                </label>
              </div>
              <p className="text-xs text-brand-muted mt-4 mb-4">
                {copy(
                  'คุณจะเป็นหัวหน้าอัตโนมัติ และเพิ่มหัวหน้าคนอื่นได้ภายหลัง',
                  'You become the leader automatically and can add more leaders later.',
                )}
              </p>
              <button
                className={primary}
                type="submit"
                disabled={busy || !name.trim()}
              >
                {busy
                  ? copy('กำลังบันทึก…', 'Saving…')
                  : copy('ยืนยันสร้างกลุ่ม', 'Create this group')}
              </button>
            </form>
          )}
          {view === 'users' && snapshot?.systemRole === 'admin' ? (
            <AdminUsersPanel
              userId={userId}
              triggerConfirm={triggerConfirm}
              onRoleChanged={reload}
            />
          ) : (
            <>
              {!!snapshot?.invitations.length && (
                <div className={panel}>
                  <h2 className="font-bold mb-4">
                    {copy('คำเชิญของคุณ', 'Your invitations')}
                  </h2>
                  <div className="space-y-3">
                    {snapshot.invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border/30 pt-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold break-words">
                            {inv.groupName}
                          </p>
                          <p className="text-xs text-brand-muted mt-1">
                            {copy('หมดอายุ', 'Expires')}{' '}
                            {new Date(inv.expiresAt).toLocaleDateString(
                              language === 'th' ? 'th-TH' : 'en-GB',
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            className={secondary}
                            disabled={busy}
                            onClick={() =>
                              confirm(
                                copy('ปฏิเสธคำเชิญ', 'Decline invitation'),
                                inv.groupName,
                                { action: 'decline', invitationId: inv.id },
                              )
                            }
                          >
                            {copy('ปฏิเสธ', 'Decline')}
                          </button>
                          <button
                            className={primary}
                            disabled={busy}
                            onClick={() => {
                              void mutate({
                                action: 'accept',
                                invitationId: inv.id,
                              });
                            }}
                          >
                            {copy('เข้าร่วม', 'Join')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-6 xl:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
                <div className={`${panel} min-w-0 self-start`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold">
                      {scope === 'all'
                        ? copy('ทุกกลุ่ม', 'All groups')
                        : copy('กลุ่มของฉัน', 'My groups')}
                    </h2>
                    <span className="text-xs text-brand-muted">
                      {snapshot?.total || 0}
                    </span>
                  </div>
                  {!snapshot && loading ? (
                    <p className="mt-5 text-sm text-brand-muted">
                      {copy('กำลังโหลดกลุ่ม…', 'Loading groups…')}
                    </p>
                  ) : (
                    <div className="space-y-3 mt-4">
                      {snapshot?.groups.map((group) => (
                        <button
                          key={group.id}
                          disabled={busy}
                          className={`w-full text-left rounded-2xl border p-4 transition ${selected === group.id ? 'border-brand-blue-acc bg-brand-faint' : 'border-brand-border/50 hover:bg-brand-faint/50'}`}
                          onClick={() => {
                            setDetail(null);
                            setSelected(group.id);
                            setEditing(false);
                            setMemberQuery('');
                            setMemberResults([]);
                          }}
                        >
                          <p className="font-bold break-words">{group.name}</p>
                          <p className="text-xs text-brand-muted mt-2">
                            {group.memberCount} {copy('สมาชิก', 'members')} ·{' '}
                            {roleLabel(group.myRole)}
                          </p>
                        </button>
                      ))}
                      {!snapshot?.groups.length && (
                        <div className="py-8 text-center text-brand-muted">
                          <Users
                            size={28}
                            className="mx-auto mb-3 opacity-50"
                          />
                          <p className="text-sm">
                            {copy(
                              'ยังไม่มีกลุ่ม เริ่มสร้างทีมแรกได้เลย',
                              'No groups yet. Create your first team.',
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <Pagination
                    page={page}
                    total={snapshot?.total || 0}
                    size={20}
                    onChange={setPage}
                    disabled={busy || loading}
                  />
                </div>
                {detail ? (
                  <div className="space-y-4 min-w-0">
                    <div className={panel}>
                      <div className="flex flex-wrap justify-between items-start gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-brand-blue-acc mb-2">
                            {roleLabel(detail.myRole)} · {detail.leaderCount}{' '}
                            {copy('หัวหน้า', 'leaders')}
                          </p>
                          <h2 className="text-xl font-bold break-words">
                            {detail.name}
                          </h2>
                          <p className="text-sm text-brand-muted mt-2 whitespace-pre-wrap break-words">
                            {detail.description}
                          </p>
                        </div>
                        {canManage && (
                          <button
                            className={secondary}
                            disabled={busy}
                            onClick={() => {
                              setEditing(!editing);
                              setName(detail.name);
                              setDescription(detail.description);
                              setCreating(false);
                            }}
                          >
                            {copy('แก้ไขกลุ่ม', 'Edit group')}
                          </button>
                        )}
                      </div>
                      {editing && canManage && (
                        <form
                          className="mt-5 space-y-3"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void mutate({
                              action: 'rename',
                              groupId: detail.id,
                              name: name.trim(),
                              description: description.trim(),
                            });
                          }}
                        >
                          <label className="block text-sm font-semibold">
                            {copy('ชื่อกลุ่ม', 'Group name')}
                            <input
                              className={`${input} mt-2`}
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              required
                              maxLength={80}
                            />
                          </label>
                          <label className="block text-sm font-semibold">
                            {copy('รายละเอียด', 'Description')}
                            <textarea
                              className={`${input} mt-2`}
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              maxLength={500}
                            />
                          </label>
                          <button
                            className={primary}
                            disabled={busy || !name.trim()}
                          >
                            {copy('บันทึกกลุ่ม', 'Save group')}
                          </button>
                        </form>
                      )}
                      {canManage && (
                        <form
                          className="mt-5 border-t border-brand-border/40 pt-5"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if(memberQuery.trim().length<2)return;
                            setBusy(true);setError('');
                            try { const found=await groupApi.searchUsers(userId,detail.id,memberQuery.trim());setMemberResults(found.users); }
                            catch(e){setError((e as Error).message);} finally{setBusy(false);}
                          }}
                        >
                          <label
                            className="text-sm font-semibold block mb-2"
                            htmlFor="group-member-search"
                          >
                            {copy('ค้นหาสมาชิกด้วยชื่อหรือ User ID', 'Find by name or User ID')}
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              id="group-member-search"
                              type="search"
                              required
                              minLength={2}
                              maxLength={60}
                              placeholder={copy('ชื่อ หรือ SQ-XXXXXXXXXX','Name or SQ-XXXXXXXXXX')}
                              className={input}
                              value={memberQuery}
                              onChange={(e) => setMemberQuery(e.target.value)}
                            />
                            <button
                              className={`${primary} shrink-0`}
                              disabled={busy || memberQuery.trim().length<2}
                            >
                              <UserPlus size={16} />
                              {copy('ค้นหา', 'Search')}
                            </button>
                          </div>
                          <p className="mt-2 text-xs text-brand-muted">
                            {copy(
                              'เลือกบัญชีจากผลค้นหา คำเชิญจะอยู่ในบัญชีผู้รับ 7 วันและผู้รับต้องกดเข้าร่วมเอง',
                              'Choose an account below. The invitation remains available for 7 days and requires acceptance.',
                            )}
                          </p>
                          <div className="mt-3 divide-y divide-brand-border/30">
                            {memberResults.map(user=><div key={user.userId} className="py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0"><p className="font-semibold text-sm truncate">{user.displayName}</p><p className="text-xs text-brand-muted font-mono">{user.publicId}</p></div>
                              <button type="button" className={secondary} disabled={busy} onClick={()=>void mutate({action:'invite',groupId:detail.id,userId:user.userId})}><UserPlus size={14}/>{copy('เชิญ','Invite')}</button>
                            </div>)}
                            {!!memberQuery.trim() && !memberResults.length && <p className="text-xs text-brand-muted py-3">{copy('ค้นหาเพื่อแสดงบัญชีที่ตรงกัน','Search to show matching accounts')}</p>}
                          </div>
                        </form>
                      )}
                    </div>
                    <GroupMembersPanel
                      detail={detail}
                      userId={userId}
                      canManage={!!canManage}
                      busy={busy}
                      loading={loading}
                      confirm={confirm}
                    />
                    {canManage && !!detail.invitations.length && (
                      <div className={panel}>
                        <h3 className="font-bold mb-3">
                          {copy('คำเชิญที่รออยู่', 'Pending invitations')}
                        </h3>
                        {detail.invitations.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex flex-wrap justify-between items-center gap-2 border-t border-brand-border/30 py-3"
                          >
                            <span className="text-sm break-all">
                              <span><strong>{inv.displayName || copy('ผู้ใช้เดิม','Legacy user')}</strong><br/><span className="text-xs text-brand-muted font-mono">{inv.publicId || '—'}</span></span>
                            </span>
                            <button
                              className={secondary}
                              disabled={busy}
                              onClick={() =>
                                confirm(
                                  copy('ยกเลิกคำเชิญ', 'Revoke invitation'),
                                  `${inv.displayName || ''} ${inv.publicId || ''}`,
                                  {
                                    action: 'revoke-invite',
                                    groupId: detail.id,
                                    invitationId: inv.id,
                                  },
                                )
                              }
                            >
                              {copy('ยกเลิกคำเชิญ', 'Revoke')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && (
                      <div className={panel}>
                        <h3 className="font-bold mb-4">
                          {copy('กิจกรรมล่าสุด', 'Recent activity')}
                        </h3>
                        <div className="space-y-3">
                          {detail.activity.map((event) => (
                            <div
                              key={event.id}
                              className="text-xs border-l-2 border-brand-blue-acc/40 pl-3"
                            >
                              <p className="font-semibold">
                                {activityLabels[event.action] || event.action}
                              </p>
                              <p className="text-brand-muted mt-1 break-all">
                                {event.actorDisplayName || '—'} {event.actorPublicId ? `(${event.actorPublicId})` : ''}
                                {event.targetDisplayName
                                  ? ` → ${event.targetDisplayName} (${event.targetPublicId || '—'})`
                                  : ''}{' '}
                                ·{' '}
                                {new Date(event.createdAt).toLocaleString(
                                  language === 'th' ? 'th-TH' : 'en-GB',
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-brand-border/40 mt-5 pt-4">
                          <button
                            className={`${secondary} text-red-600`}
                            disabled={busy || loading}
                            onClick={() =>
                              confirm(
                                copy('ลบกลุ่มถาวร', 'Delete group permanently'),
                                copy(
                                  `ลบ ${detail.name} พร้อมข้อมูลการเงิน สมาชิก และคำเชิญทั้งหมด?`,
                                  `Delete ${detail.name}, all financial data, memberships and invitations?`,
                                ),
                                { action: 'delete', groupId: detail.id },
                              )
                            }
                          >
                            <Trash2 size={14} />
                            {copy('ลบกลุ่ม', 'Delete group')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={`${panel} flex flex-col items-center justify-center min-h-64 text-center text-brand-muted`}
                  >
                    <Users size={36} className="opacity-40 mb-4" />
                    <p className="text-sm">
                      {selected && loading
                        ? copy('กำลังโหลดกลุ่ม…', 'Loading group…')
                        : copy(
                            'เลือกกลุ่มเพื่อดูสมาชิกและสิทธิ์',
                            'Select a group to see members and permissions.',
                          )}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
          <p className="text-xs text-brand-muted leading-relaxed">
            {copy(
              'สิทธิ์ในกลุ่มแยกจาก role ของระบบ ข้อมูลรายรับ รายจ่าย และเอกสารส่วนตัวของแต่ละบัญชียังคงเป็นส่วนตัว',
              'Group roles are separate from system roles. Each account’s income, expenses, and personal documents remain private.',
            )}
          </p>
        </>
      )}
    </section>
  );
}

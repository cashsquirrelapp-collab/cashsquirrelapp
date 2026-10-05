import PageHeader from '../../components/ui/PageHeader';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, Building2, Check, ChevronDown, ChevronRight, Crown, History, Mail, PenLine, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, UserCog, UserPlus, UserRound, Users } from 'lucide-react';
import { uiSurface } from '../../components/ui/uiStyles';
import { Drawer } from '../../components/ui/Drawer';
import { RowMenu, type RowMenuItem } from '../../components/ui/RowMenu';
import type {
  GroupAction,
  GroupDetail,
  GroupMember,
  GroupRole,
  GroupSnapshot,
  PublicProfile,
} from '../../../../shared/groups';
import { groupApi } from '../../services/groups';
import { getCurrentAccount } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';

import AdminUsersPanel from './AdminUsersPanel';
import { panel, Pagination, type Confirm } from './groupUi';
import { PREVIEW_SEARCH_RESULTS, buildPreviewTeam } from './teamPreview';

// Presence comes from the app's 20-second heartbeat (online = seen in the last minute, decided
// on the server). The page refreshes it every 20 seconds while visible; if that refresh stops
// working for this long, nobody is shown as online rather than guessing.
const PRESENCE_POLL_MS = 20_000;
const PRESENCE_STALE_MS = 90_000;
interface Props {
  userId: string;
  isGuest: boolean;
  triggerConfirm: Confirm;
  initialScope?: 'mine' | 'all';
  embedded?: boolean;
  /** Team is not launched yet: show a sample team, never call the groups API. */
  preview?: boolean;
  /** The signed-in user's own profile, used for their row (photo, name). */
  me?: { displayName: string; publicId?: string; avatarUrl?: string; email?: string };
  /** Open the user's own profile settings. */
  onEditProfile?: () => void;
}
export default function GroupsTab({ userId, isGuest, triggerConfirm, initialScope = 'mine', embedded = false, preview = false, me, onEditProfile }: Props) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const roleLabel = (role: GroupRole | null) =>
    role === 'leader'
      ? copy('หัวหน้ากลุ่ม', 'Team lead')
      : role === 'member'
        ? copy('สมาชิก', 'Member')
        : copy('ดูแลโดย admin', 'Admin access');
  const [teamTab, setTeamTab] = useState<'members' | 'invites'>('members');
  const [memberFilter, setMemberFilter] = useState('');
  const [focusMemberId, setFocusMemberId] = useState<string | null>(null);
  const [memberSheetOpen, setMemberSheetOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [memberView, setMemberView] = useState<'all' | 'online' | 'leaders'>('all');
  const [memberViewOpen, setMemberViewOpen] = useState(false);
  const memberViewRef = useRef<HTMLDivElement>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [presenceAt, setPresenceAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<GroupSnapshot | null>(null);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>(initialScope);
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
    if (preview) {
      const sample = buildPreviewTeam({ userId, displayName: me?.displayName || 'คุณ', publicId: me?.publicId, avatarUrl: me?.avatarUrl, email: me?.email });
      setSnapshot(sample.snapshot);
      setDetail(sample.detail);
      setSelected(sample.detail.id);
      setPresenceAt(Date.now());
      setNow(Date.now());
      return;
    }
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
          if (!controller.signal.aborted && mounted.current) { setDetail(group); setPresenceAt(Date.now()); setNow(Date.now()); }
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
  }, [userId, isGuest, scope, page, selected, preview, me?.displayName, me?.publicId, me?.avatarUrl, me?.email]);
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
  const previewNotice = () => {
    setInviteOpen(false); setSettingsOpen(false); setCreating(false); setMemberSheetOpen(false);
    setNotice(copy('นี่คือหน้าตัวอย่าง ฟีเจอร์ทีมยังไม่เปิดใช้งาน จึงยังไม่มีอะไรถูกบันทึก', 'This is a preview. Team is not available yet, so nothing was saved.'));
  };
  const mutate = async (action: GroupAction) => {
    if (preview) { previewNotice(); return; }
    if (!active() || writing.current) return;
    writing.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    request.current?.abort();
    try {
      const result = await groupApi.mutate(userId, action);
      if (!active()) return;
      window.dispatchEvent(new Event('cash-squirrel:groups-changed'));
      if (action.action === 'rename') {
        window.dispatchEvent(new CustomEvent('cash-squirrel:group-renamed', { detail: { groupId: result.groupId, name: action.name } }));
      }
      setNotice(copy('บันทึกเรียบร้อยแล้ว', 'Changes saved'));
      if (action.action === 'invite') { setInviteOpen(false); setTeamTab('invites'); }
      if (action.action === 'rename' || action.action === 'leave' || action.action === 'delete') setSettingsOpen(false);
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
    preview ? previewNotice() : triggerConfirm(title, message, () => {
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
  // Open the first team straight away instead of asking the user to pick one.
  useEffect(() => {
    if (view === 'groups' && !selected && snapshot?.groups.length) setSelected(snapshot.groups[0].id);
  }, [snapshot, selected, view]);
  // Presence refresh: one request per open team (not per member), only while the page is visible.
  useEffect(() => {
    if (isGuest || preview || !selected) return;
    const tick = async () => {
      setNow(Date.now());
      if (document.hidden || writing.current || !active()) return;
      try {
        const group = await groupApi.detail(userId, selected);
        if (!active()) return;
        setDetail(prev => (prev && prev.id === group.id ? group : prev));
        setPresenceAt(Date.now());
        setNow(Date.now());
      } catch { /* keep the last known state; it turns stale instead of lying */ }
    };
    const timer = window.setInterval(() => { void tick(); }, PRESENCE_POLL_MS);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, userId, isGuest, preview]);
  useEffect(() => {
    if (!switcherOpen) return;
    const onDown = (e: MouseEvent) => { if (!switcherRef.current?.contains(e.target as Node)) setSwitcherOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSwitcherOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [switcherOpen]);
  useEffect(() => {
    if (!memberViewOpen) return;
    const onDown = (e: MouseEvent) => { if (!memberViewRef.current?.contains(e.target as Node)) setMemberViewOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMemberViewOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [memberViewOpen]);
  useEffect(() => { if (focusMemberId && detail && !detail.members.some(m => m.userId === focusMemberId)) { setFocusMemberId(null); setMemberSheetOpen(false); } }, [detail, focusMemberId]);
  useEffect(() => { if (!canManage && teamTab === 'invites') setTeamTab('members'); }, [canManage, teamTab]);
  // The side panel starts on the signed-in user's own profile.
  useEffect(() => { if (detail && !focusMemberId && detail.members.some(m => m.userId === userId)) setFocusMemberId(userId); }, [detail, focusMemberId, userId]);

  const activityLabels: Record<string, string> = {
    create: copy('สร้างทีม', 'Created group'),
    invite: copy('เชิญสมาชิก', 'Invited member'),
    accept: copy('เข้าร่วมทีม', 'Joined group'),
    decline: copy('ปฏิเสธคำเชิญ', 'Declined invitation'),
    'revoke-invite': copy('ยกเลิกคำเชิญ', 'Revoked invitation'),
    'member-role:leader': copy('เพิ่มเป็นหัวหน้ากลุ่ม', 'Made team lead'),
    'member-role:member': copy('เปลี่ยนเป็นสมาชิก', 'Demoted to member'),
    transfer: copy('โอนหัวหน้ากลุ่ม', 'Transferred team lead'),
    'remove-member': copy('นำสมาชิกออก', 'Removed member'),
    leave: copy('ออกจากทีม', 'Left group'),
    rename: copy('แก้ไขทีม', 'Updated group'),
  };
  // ---------- view helpers (display only; every change still goes through mutate/confirm) ----------
  const presenceFresh = presenceAt > 0 && now - presenceAt < PRESENCE_STALE_MS;
  const isOnline = (m: GroupMember) => presenceFresh && Boolean(m.isOnline);
  const lastSeenText = (m: GroupMember) => {
    if (isOnline(m)) return copy('ออนไลน์', 'Online');
    if (!m.lastSeenAt) return copy('ยังไม่มีข้อมูลการใช้งาน', 'No activity yet');
    const diff = Math.max(0, now - new Date(m.lastSeenAt).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) return copy('ใช้งานล่าสุดเมื่อสักครู่', 'Active just now');
    if (min < 60) return copy(`ใช้งานล่าสุด ${min} นาทีที่แล้ว`, `Active ${min} min ago`);
    const hours = Math.floor(min / 60);
    if (hours < 24) return copy(`ใช้งานล่าสุด ${hours} ชั่วโมงที่แล้ว`, `Active ${hours} h ago`);
    if (hours < 48) return copy('ใช้งานล่าสุดเมื่อวาน', 'Active yesterday');
    return copy(`ใช้งานล่าสุด ${new Date(m.lastSeenAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}`, `Active ${new Date(m.lastSeenAt).toLocaleDateString('en-GB')}`);
  };
  const dateText = (iso: string) => new Date(iso).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const daysLeft = (iso: string) => Math.ceil((new Date(iso).getTime() - now) / 86400000);
  const isMe = (m: GroupMember) => m.userId === userId;
  const members = detail ? [...detail.members].sort((a, b) =>
    Number(isMe(b)) - Number(isMe(a)) || Number(isOnline(b)) - Number(isOnline(a)) || (a.role === b.role ? 0 : a.role === 'leader' ? -1 : 1) || a.displayName.localeCompare(b.displayName, 'th')) : [];
  const q = memberFilter.trim().toLowerCase();
  const shownMembers = members.filter(m =>
    (memberView === 'all' || (memberView === 'online' ? isOnline(m) : m.role === 'leader')) &&
    (!q || m.displayName.toLowerCase().includes(q) || m.publicId.toLowerCase().includes(q) || Boolean(m.email?.toLowerCase().includes(q))));
  const focusMember = detail?.members.find(m => m.userId === focusMemberId) ?? null;
  const lastLeader = (m: GroupMember) => m.role === 'leader' && (detail?.leaderCount ?? 0) <= 1;
  const memberActions = (m: GroupMember) => {
    if (!detail || !canManage) return [];
    const items: RowMenuItem[] = [];
    if (!lastLeader(m)) items.push({
      label: copy('เปลี่ยนสิทธิ์', 'Change role'), icon: UserCog,
      run: () => confirm(copy('เปลี่ยนสิทธิ์สมาชิก', 'Change member role'),
        `${m.displayName} (${m.publicId}) → ${roleLabel(m.role === 'leader' ? 'member' : 'leader')}`,
        { action: 'member-role', groupId: detail.id, userId: m.userId, role: m.role === 'leader' ? 'member' : 'leader' }),
    });
    if (!isMe(m) && detail.myRole === 'leader') items.push({
      label: copy('โอนหัวหน้ากลุ่ม', 'Transfer team lead'), icon: Crown,
      run: () => confirm(copy('โอนหัวหน้ากลุ่ม', 'Transfer team lead'),
        copy(`โอนให้ ${m.displayName} (${m.publicId}) คุณจะกลับเป็นสมาชิกและเสียสิทธิ์จัดการทีม`,
          `Transfer to ${m.displayName} (${m.publicId}). You will become a member and lose group management access.`),
        { action: 'transfer', groupId: detail.id, userId: m.userId }),
    });
    if (!isMe(m) && !lastLeader(m)) items.push({
      label: copy('นำออกจากทีม', 'Remove from team'), danger: true, icon: Trash2,
      run: () => confirm(copy('นำสมาชิกออกจากทีม', 'Remove member'), `${m.displayName} (${m.publicId})`,
        { action: 'remove-member', groupId: detail.id, userId: m.userId }),
    });
    return items;
  };
  const pickGroup = (id: string) => {
    setSwitcherOpen(false);
    if (id === selected) return;
    setDetail(null);
    setSelected(id);
    setEditing(false);
    setFocusMemberId(null);
    setMemberFilter('');
    setMemberView('all');
    setTeamTab('members');
  };
  const memberActivity = (m: GroupMember) => (detail?.activity || [])
    .filter(e => e.actorPublicId === m.publicId || e.targetPublicId === m.publicId)
    .slice(0, 4);
  const tabCls = (on: boolean) => `inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium transition-colors cursor-pointer ${on ? 'bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`;
  const btnPrimary = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#E65F2B] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#D35221] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
  const btnSecondary = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-border bg-brand-white px-4 text-[13px] font-medium text-brand-text transition-colors hover:bg-brand-faint disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
  const fieldCls = 'h-11 w-full rounded-xl border border-brand-border bg-brand-white px-3.5 text-sm text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B]';

  const avatar = (m: Pick<GroupMember, 'displayName'> & Partial<GroupMember>, size = 48, presence = true) => {
    const online = presence && m.userId ? isOnline(m as GroupMember) : false;
    return (
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {(m.avatarUrl || (m.userId === userId && me?.avatarUrl))
          ? <img src={m.avatarUrl || me?.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          : <span className="flex h-full w-full items-center justify-center rounded-full bg-[#F3EEE8] text-[15px] font-semibold text-[#8A5A3A] dark:bg-[#2A2B2F] dark:text-[#E8C9B3]" aria-hidden>
              {(m.displayName || '?').trim().slice(0, 1).toUpperCase()}
            </span>}
        {presence && m.userId && (
          <span aria-hidden className={`absolute bottom-0 right-0 rounded-full border-2 border-brand-white transition-colors duration-500 ${online ? 'bg-[#18A66A]' : 'bg-[#B8B2AB]'}`}
            style={{ width: Math.max(10, size * 0.22), height: Math.max(10, size * 0.22) }} />
        )}
      </span>
    );
  };

  const timeText = (iso: string) => new Date(iso).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const sentText = (iso: string) => {
    const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
    return days < 1 ? copy('ส่งเมื่อวันนี้', 'Sent today') : days < 2 ? copy('ส่งเมื่อ 1 วันที่แล้ว', 'Sent 1 day ago') : copy(`ส่งเมื่อ ${days} วันที่แล้ว`, `Sent ${days} days ago`);
  };

  const invitationRows = detail && (
    <ul className="space-y-1">
      {detail.invitations.map(inv => (
        <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3.5 hover:bg-brand-faint/60">
          <span className="flex min-w-0 items-center gap-4">
            {avatar({ displayName: inv.displayName || '?' }, 48, false)}
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-brand-text">{inv.displayName || copy('ผู้ใช้เดิม', 'Legacy user')}</span>
              <span className={`block truncate text-[13px] text-brand-muted ${inv.email ? '' : 'font-mono text-xs'}`}>{inv.email || inv.publicId || '—'}</span>
              <span className="block text-xs text-brand-muted">
                {inv.sentAt ? sentText(inv.sentAt) : copy('รอตอบรับ', 'Waiting')} · {daysLeft(inv.expiresAt) > 0 ? copy(`หมดอายุอีก ${daysLeft(inv.expiresAt)} วัน`, `expires in ${daysLeft(inv.expiresAt)} days`) : copy('หมดอายุวันนี้', 'expires today')}
              </span>
            </span>
          </span>
          <button type="button" disabled={busy}
            className="inline-flex h-9 items-center rounded-xl border border-[#F0B8B8] px-4 text-[13px] font-medium text-[#C43A3A] transition-colors hover:bg-[#FDEEEE] disabled:opacity-40 cursor-pointer dark:border-[#F19A9A]/40 dark:text-[#F19A9A] dark:hover:bg-[#F19A9A]/10"
            onClick={() => confirm(copy('ยกเลิกคำเชิญ', 'Revoke invitation'), `${inv.displayName || ''} ${inv.publicId || ''}`, { action: 'revoke-invite', groupId: detail.id, invitationId: inv.id })}>
            {copy('ยกเลิก', 'Revoke')}
          </button>
        </li>
      ))}
    </ul>
  );

  const detailRow = (key: string, Icon: typeof Users, label: string, value: React.ReactNode, body?: React.ReactNode) => {
    const open = openSection === key && Boolean(body);
    return (
      <li>
        <button type="button" disabled={!body} aria-expanded={body ? open : undefined} onClick={() => setOpenSection(open ? null : key)}
          className="flex w-full items-center gap-3 px-1 py-3.5 text-left text-[14px] cursor-pointer disabled:cursor-default">
          <Icon size={18} strokeWidth={1.7} className="shrink-0 text-brand-muted" />
          <span className="flex-1 text-brand-text">{label}</span>
          {value != null && <span className="text-[13px] text-brand-muted">{value}</span>}
          {body && <ChevronRight size={16} className={`shrink-0 text-brand-muted transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />}
        </button>
        {open && <div className="pb-3 pl-8 pr-1">{body}</div>}
      </li>
    );
  };

  const memberDetail = (m: GroupMember) => (
    <div className="space-y-5">
      <div className="flex flex-col items-center pt-2 text-center">
        {avatar(m, 104)}
        <p className="mt-3 max-w-full truncate text-xl font-semibold text-brand-text">{m.displayName}</p>
        <p className={`max-w-full truncate text-[13px] text-brand-muted ${m.email ? '' : 'font-mono'}`}>{m.email || m.publicId}</p>
        {isMe(m) && onEditProfile && (
          <button type="button" className={`${btnSecondary} mt-3 h-9`} onClick={onEditProfile}><PenLine size={14} />{copy('แก้ไขโปรไฟล์', 'Edit profile')}</button>
        )}
        <p className={`mt-3 flex items-center gap-1.5 text-[13px] ${isOnline(m) ? 'text-[#12804F] dark:text-[#6FD3A3]' : 'text-brand-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${isOnline(m) ? 'bg-[#18A66A]' : 'bg-[#B8B2AB]'}`} />{lastSeenText(m)}
        </p>
      </div>
      <ul className="divide-y divide-brand-border border-y border-brand-border">
        {detailRow('info', UserRound, copy('ข้อมูลส่วนตัว', 'Profile'), null, (
          <dl className="space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-3"><dt className="text-brand-muted">User ID</dt><dd className="font-mono text-brand-text">{m.publicId}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-brand-muted">{copy('เข้าร่วมเมื่อ', 'Joined')}</dt><dd className="text-brand-text">{dateText(m.joinedAt)}</dd></div>
          </dl>
        ))}
        {detailRow('role', ShieldCheck, copy('สิทธิ์ในทีม', 'Team role'), roleLabel(m.role))}
        {m.assignedJobs != null && detailRow('jobs', Briefcase, copy('งานที่ได้รับมอบหมาย', 'Assigned jobs'), copy(`${m.assignedJobs} งาน`, `${m.assignedJobs} jobs`))}
        {canManage && detailRow('activity', History, copy('กิจกรรมล่าสุด', 'Recent activity'), null, memberActivity(m).length ? (
          <ul className="space-y-1.5">
            {memberActivity(m).map(e => <li key={e.id} className="text-xs text-brand-muted"><span className="text-brand-text">{activityLabels[e.action] || e.action}</span> · {timeText(e.createdAt)}</li>)}
          </ul>
        ) : <p className="text-xs text-brand-muted">{copy('ยังไม่มีกิจกรรม', 'No activity yet')}</p>)}
      </ul>
      <div className="flex gap-3 rounded-2xl bg-[#FFF5EC] p-4 dark:bg-[#E65F2B]/10">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFE4CF] text-[#C24A16] dark:bg-[#E65F2B]/20 dark:text-[#FF9A6B]">{m.role === 'leader' ? <Crown size={17} /> : <Users size={17} />}</span>
        <div>
          <p className="text-[14px] font-semibold text-[#9A3D12] dark:text-[#FFB48C]">{m.role === 'leader' ? copy('หัวหน้ากลุ่ม (Owner)', 'Team lead (Owner)') : copy('สมาชิก (Member)', 'Member')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#7A4A2E] dark:text-[#F3C9AE]">
            {m.role === 'leader'
              ? copy('มีสิทธิ์จัดการทีม เชิญสมาชิก เปลี่ยนสิทธิ์ และแก้ไขหรือลบทีมได้', 'Can manage the team, invite people, change roles and edit or delete the team.')
              : copy('เห็นทีมและ Workspace ร่วมกัน แต่จัดการสมาชิกหรือสิทธิ์ไม่ได้', 'Shares the team workspace but cannot manage members or roles.')}
          </p>
        </div>
      </div>
      {memberActions(m).length > 0 && (
        <div className="space-y-1">
          {memberActions(m).map(a => {
            const Icon = a.icon;
            return (
              <button key={a.label} type="button" disabled={busy || loading} onClick={a.run}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-brand-faint disabled:opacity-40 cursor-pointer ${a.danger ? 'text-[#C43A3A] dark:text-[#F19A9A]' : 'text-brand-text'}`}>
                {Icon && <Icon size={16} />}<span className="flex-1">{a.label}</span><ChevronRight size={16} className="text-brand-muted" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const openMember = (m: GroupMember) => {
    setFocusMemberId(m.userId);
    setOpenSection(null);
    if (window.matchMedia('(max-width: 1279px)').matches) setMemberSheetOpen(true);
  };

  return (
    <section
      className={`${embedded ? 'space-y-4' : 'page-content space-y-5'} text-brand-text min-w-0`}
      aria-label={copy('จัดการทีม', 'Group management')}
    >
      {!embedded && <PageHeader page="groups">
        {(!isGuest || preview) && view === 'groups' && (
          canManage
            ? <button className={btnPrimary} disabled={busy} onClick={() => { setInviteOpen(true); setMemberQuery(''); setMemberResults([]); }}><UserPlus size={16} />{copy('เชิญสมาชิก', 'Invite member')}</button>
            : !snapshot?.groups.length && <button className={btnPrimary} disabled={busy} onClick={openCreate}><Plus size={16} />{copy('สร้างทีม', 'Create group')}</button>
        )}
      </PageHeader>}

      {preview && !embedded && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#F3D2BE] bg-[#FFF7F1] px-4 py-3.5 dark:border-[#E65F2B]/25 dark:bg-[#E65F2B]/10" role="note">
          <span className="mt-0.5 shrink-0 rounded-full bg-[#E65F2B] px-2 py-0.5 text-[11px] font-semibold text-white">{copy('เร็วๆ นี้', 'Coming soon')}</span>
          <p className="text-[13px] leading-relaxed text-[#7A4A2E] dark:text-[#F3C9AE]">
            {copy('ฟีเจอร์ทีมสำหรับธุรกิจขนาดเล็กกำลังจะมา หน้านี้เป็นตัวอย่างหน้าตา สมาชิกคนอื่นเป็นข้อมูลจำลอง และยังกดใช้งานจริงไม่ได้', 'Team for small businesses is coming. This is a preview: other members are sample data and nothing can be changed yet.')}
          </p>
        </div>
      )}
      {isGuest && !preview ? (
        <div className={`${panel} py-12 text-center`}>
          <Users className="mx-auto mb-4 text-brand-muted" size={36} />
          <h2 className="text-lg font-semibold">{copy('พร้อมสร้างทีมของคุณแล้วหรือยัง?', 'Ready to create your team?')}</h2>
          <p className="mt-2 text-[13px] text-brand-muted">{copy('ฟีเจอร์ทีมใช้กับบัญชีจริง กรุณาออกจากโหมดทดลองแล้วเข้าสู่ระบบหรือสมัครสมาชิก', 'Groups require an account. Leave guest mode to sign in or register.')}</p>
        </div>
      ) : (
        <>
          {snapshot?.systemRole === 'admin' && !embedded && (
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={copy('มุมมองผู้ดูแลระบบ', 'Admin views')}>
              <span className="mr-1 inline-flex items-center gap-1 text-xs text-brand-muted"><ShieldCheck size={14} />{copy('ผู้ดูแลระบบ', 'System admin')}</span>
              <button role="tab" aria-selected={view === 'groups' && scope === 'mine'} className={tabCls(view === 'groups' && scope === 'mine')} onClick={() => { setView('groups'); setScope('mine'); setPage(0); setCreating(false); setSelected(null); setDetail(null); }}>{copy('ทีมของฉัน', 'My groups')}</button>
              <button role="tab" aria-selected={view === 'groups' && scope === 'all'} className={tabCls(view === 'groups' && scope === 'all')} onClick={() => { setView('groups'); setScope('all'); setPage(0); setCreating(false); setSelected(null); setDetail(null); }}>{copy('ทุกทีม', 'All groups')}</button>
              <button role="tab" aria-selected={view === 'users'} className={tabCls(view === 'users')} onClick={() => { setView('users'); setCreating(false); }}>{copy('จัดการผู้ใช้', 'Manage users')}</button>
            </div>
          )}
          {error && <div role="alert" className="rounded-xl border border-[#F3C9C9] bg-[#FDEEEE] p-3.5 text-[13px] text-[#B83434] break-words dark:border-[#F19A9A]/20 dark:bg-[#F19A9A]/10 dark:text-[#F19A9A]">{error}</div>}
          {notice && <div role="status" className="flex items-center gap-2 rounded-xl bg-[#E9F7F0] p-3 text-[13px] text-[#12804F] dark:bg-[#6FD3A3]/10 dark:text-[#6FD3A3]"><Check size={16} />{notice}</div>}

          {view === 'users' && snapshot?.systemRole === 'admin' ? (
            <AdminUsersPanel userId={userId} triggerConfirm={triggerConfirm} onRoleChanged={reload} />
          ) : (
            <>
              {!!snapshot?.invitations.length && (
                <div className={`${uiSurface} divide-y divide-brand-border`}>
                  <p className="px-4 py-3 text-[13px] font-semibold text-brand-text">{copy('คำเชิญเข้าร่วมทีม', 'Invitations for you')}</p>
                  {snapshot.invitations.map(inv => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-brand-text">{inv.groupName}</p>
                        <p className="text-xs text-brand-muted">{copy('หมดอายุ', 'Expires')} {dateText(inv.expiresAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className={btnSecondary} disabled={busy} onClick={() => confirm(copy('ปฏิเสธคำเชิญ', 'Decline invitation'), inv.groupName, { action: 'decline', invitationId: inv.id })}>{copy('ปฏิเสธ', 'Decline')}</button>
                        <button className={btnPrimary} disabled={busy} onClick={() => { void mutate({ action: 'accept', invitationId: inv.id }); }}>{copy('เข้าร่วม', 'Join')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!snapshot && loading ? (
                <div className={`${uiSurface} p-5`} aria-busy="true">
                  {[0, 1, 2].map(i => <div key={i} className="flex items-center gap-4 py-3"><span className="h-12 w-12 animate-pulse rounded-full bg-brand-faint" /><span className="flex-1 space-y-2"><span className="block h-3 w-40 animate-pulse rounded bg-brand-faint" /><span className="block h-2.5 w-24 animate-pulse rounded bg-brand-faint" /></span></div>)}
                </div>
              ) : !snapshot?.groups.length ? (
                <div className={`${uiSurface} flex flex-col items-center px-6 py-14 text-center`}>
                  <Users size={32} className="mb-3 text-brand-muted" />
                  <p className="text-[15px] font-medium text-brand-text">{scope === 'all' ? copy('ยังไม่มีทีมในระบบ', 'No groups yet') : copy('ยังไม่มีทีม', 'No team yet')}</p>
                  <p className="mt-1 text-[13px] text-brand-muted">{copy('สร้างทีมแล้วเชิญคนที่ทำงานด้วยเข้ามาใช้ Workspace ร่วมกัน', 'Create a team and invite the people you work with.')}</p>
                  {scope === 'mine' && <button className={`${btnPrimary} mt-4`} disabled={busy} onClick={openCreate}><Plus size={16} />{copy('สร้างทีม', 'Create group')}</button>}
                </div>
              ) : (
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="min-w-0 space-y-4">
                  <div className={`${uiSurface} min-w-0`}>
                    {/* Workspace header + switcher */}
                    <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand-muted"><Building2 size={22} strokeWidth={1.6} /></span>
                        <div className="relative min-w-0 flex-1" ref={switcherRef}>
                          <button type="button" onClick={() => setSwitcherOpen(v => !v)} aria-haspopup="menu" aria-expanded={switcherOpen}
                            className="group -ml-2 flex max-w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-lg px-2 py-0.5 text-left hover:bg-brand-faint cursor-pointer">
                            <span className="truncate text-xl font-semibold text-brand-text">{detail?.name ?? snapshot.groups.find(g => g.id === selected)?.name ?? copy('เลือกทีม', 'Choose a team')}</span>
                            <ChevronDown size={16} className="shrink-0 text-brand-muted opacity-60 group-hover:opacity-100" />
                          </button>
                          <p className="text-[13px] text-brand-muted">
                            {detail ? <>{detail.memberCount} {copy('สมาชิก', 'members')}{presenceFresh && <> · <span className="text-[#12804F] dark:text-[#6FD3A3]">{detail.members.filter(isOnline).length} {copy('ออนไลน์', 'online')}</span></>}</> : copy('กำลังโหลดทีม…', 'Loading team…')}
                          </p>
                          {switcherOpen && (
                            <div role="menu" aria-label={copy('เลือกทีม', 'Choose a team')} className="absolute left-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-[#1F2024]">
                              {snapshot.groups.map(g => (
                                <button key={g.id} type="button" role="menuitem" onClick={() => pickGroup(g.id)}
                                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-brand-faint cursor-pointer">
                                  <span className="min-w-0"><span className="block truncate text-brand-text">{g.name}</span><span className="block text-xs text-brand-muted">{g.memberCount} {copy('สมาชิก', 'members')} · {roleLabel(g.myRole)}</span></span>
                                  {g.id === selected && <Check size={16} className="shrink-0 text-[#C24A16]" />}
                                </button>
                              ))}
                              <Pagination page={page} total={snapshot.total || 0} size={20} onChange={setPage} disabled={busy || loading} />
                              {scope === 'mine' && (
                                <>
                                  <div className="my-1 border-t border-brand-border" />
                                  <button type="button" role="menuitem" onClick={() => { setSwitcherOpen(false); openCreate(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer"><Plus size={15} />{copy('สร้างทีมใหม่', 'Create a new team')}</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      {detail && <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => { setSettingsOpen(true); setName(detail.name); setDescription(detail.description); }}><Settings size={15} /><span className="hidden sm:inline">{copy('ตั้งค่าทีม', 'Team settings')}</span></button>}
                    </div>

                    {detail ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-1 sm:px-5">
                          <div className="flex gap-1.5" role="tablist" aria-label={copy('ข้อมูลทีม', 'Team')}>
                            <button role="tab" aria-selected={teamTab === 'members'} className={tabCls(teamTab === 'members')} onClick={() => setTeamTab('members')}>{copy('สมาชิก', 'Members')} ({detail.memberCount})</button>
                            {canManage && <button role="tab" aria-selected={teamTab === 'invites'} className={tabCls(teamTab === 'invites')} onClick={() => setTeamTab('invites')}>{copy('คำเชิญ', 'Invitations')} ({detail.invitations.length})</button>}
                          </div>
                          {teamTab === 'members' && (
                            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
                              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
                                <input type="search" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} placeholder={copy('ค้นหาสมาชิก…', 'Search members…')} aria-label={copy('ค้นหาสมาชิก', 'Search members')}
                                  className="h-10 w-full rounded-xl border border-brand-border bg-brand-white pl-8 pr-3 text-[13px] text-brand-text outline-none placeholder:text-brand-muted focus:border-[#E65F2B]" />
                              </div>
                              <div className="relative" ref={memberViewRef}>
                                <button type="button" onClick={() => setMemberViewOpen(v => !v)} aria-haspopup="menu" aria-expanded={memberViewOpen} aria-label={copy('กรองสมาชิก', 'Filter members')}
                                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors cursor-pointer ${memberView !== 'all' ? 'border-[#F3B08C] bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]' : 'border-brand-border text-brand-muted hover:bg-brand-faint hover:text-brand-text'}`}>
                                  <SlidersHorizontal size={16} />
                                </button>
                                {memberViewOpen && (
                                  <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-brand-border bg-brand-white p-1.5 shadow-lg dark:bg-[#1F2024]">
                                    {([['all', copy('ทั้งหมด', 'Everyone')], ['online', copy('ออนไลน์อยู่', 'Online now')], ['leaders', roleLabel('leader')]] as const).map(([key, text]) => (
                                      <button key={key} type="button" role="menuitemradio" aria-checked={memberView === key} onClick={() => { setMemberView(key); setMemberViewOpen(false); }}
                                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] text-brand-text hover:bg-brand-faint cursor-pointer">
                                        {text}{memberView === key && <Check size={15} className="text-[#C24A16]" />}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {teamTab === 'members' ? (
                          <>
                            <h3 className="sr-only">{copy('สมาชิกในทีม', 'Group members')} ({detail.memberCount})</h3>
                            <ul className="space-y-1 px-2 pb-2 sm:px-3">
                              {shownMembers.map(m => {
                                const actions = memberActions(m);
                                const selectedRow = focusMemberId === m.userId;
                                return (
                                  <li key={m.userId} className={`flex items-center gap-2 rounded-xl pr-2 transition-colors duration-200 ${selectedRow ? 'bg-[#FFF3EA] dark:bg-[#E65F2B]/12' : 'hover:bg-brand-faint/60'}`}>
                                    <button type="button" onClick={() => openMember(m)} aria-label={`${m.displayName} ${lastSeenText(m)}`}
                                      className="flex min-w-0 flex-1 items-center gap-4 px-3 py-3.5 text-left cursor-pointer">
                                      {avatar(m, 56)}
                                      <span className="min-w-0">
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                          <span className="truncate text-[15px] font-semibold text-brand-text">{m.displayName}</span>
                                          {m.role === 'leader' && <span className="rounded-md bg-[#FFE7D8] px-1.5 py-0.5 text-[11px] font-medium text-[#C24A16] dark:bg-[#E65F2B]/20 dark:text-[#FF9A6B]">{roleLabel('leader')}</span>}
                                          {isMe(m) && <span className="text-xs text-brand-muted">{copy('(คุณ)', '(you)')}</span>}
                                        </span>
                                        <span className={`block truncate text-[13px] text-brand-muted ${m.email ? '' : 'font-mono text-xs'}`}>{m.email || m.publicId}</span>
                                        <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${isOnline(m) ? 'text-[#12804F] dark:text-[#6FD3A3]' : 'text-brand-muted'}`}>
                                          <span className={`h-1.5 w-1.5 rounded-full ${isOnline(m) ? 'bg-[#18A66A]' : 'bg-[#B8B2AB]'}`} />{lastSeenText(m)}
                                        </span>
                                      </span>
                                    </button>
                                    {actions.length > 0 && <RowMenu vertical width={200} label={copy(`ตัวเลือกของ ${m.displayName}`, `Options for ${m.displayName}`)} items={actions} />}
                                  </li>
                                );
                              })}
                              {shownMembers.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-brand-muted">{copy('ไม่พบสมาชิกที่ตรงกับตัวกรอง', 'No matching members')}</li>}
                            </ul>
                            {detail.memberCount === 1 && canManage && (
                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-border px-5 py-4">
                                <p className="text-[13px] text-brand-muted">{copy('ตอนนี้มีคุณอยู่ในทีมคนเดียว', 'You are the only member so far')}</p>
                                <button className={btnSecondary} onClick={() => { setInviteOpen(true); setMemberQuery(''); setMemberResults([]); }}><UserPlus size={15} />{copy('เชิญสมาชิก', 'Invite member')}</button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="px-2 pb-2 sm:px-3">
                            {detail.invitations.length === 0 ? (
                              <p className="px-5 py-8 text-center text-[13px] text-brand-muted">{copy('ไม่มีคำเชิญที่รอตอบรับ', 'No pending invitations')}</p>
                            ) : invitationRows}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-5" aria-busy="true">
                        {[0, 1, 2].map(i => <div key={i} className="flex items-center gap-4 py-3"><span className="h-14 w-14 animate-pulse rounded-full bg-brand-faint" /><span className="flex-1 space-y-2"><span className="block h-3 w-40 animate-pulse rounded bg-brand-faint" /><span className="block h-2.5 w-24 animate-pulse rounded bg-brand-faint" /></span></div>)}
                      </div>
                    )}
                  </div>

                  {/* Pending invitations under the member list */}
                  {detail && canManage && teamTab === 'members' && detail.invitations.length > 0 && (
                    <section className={`${uiSurface} px-2 pb-2 sm:px-3`} aria-labelledby="team-pending-invites">
                      <div className="flex items-center gap-3 px-3 pb-2 pt-4">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1E8] text-[#C24A16] dark:bg-[#E65F2B]/15 dark:text-[#FF9A6B]"><Mail size={17} /></span>
                        <h3 id="team-pending-invites" className="text-[15px] font-semibold text-brand-text">{copy('คำเชิญรอการตอบรับ', 'Waiting for a reply')} ({detail.invitations.length})</h3>
                      </div>
                      {invitationRows}
                    </section>
                  )}
                  </div>

                  {/* Member detail: side panel on wide screens */}
                  <aside className={`${uiSurface} hidden p-5 xl:block`} aria-label={copy('ข้อมูลสมาชิก', 'Member details')}>
                    {detail && focusMember ? memberDetail(focusMember) : (
                      <div className="py-10 text-center">
                        <Users size={28} className="mx-auto mb-3 text-brand-muted" />
                        <p className="text-[13px] text-brand-muted">{copy('เลือกสมาชิกเพื่อดูสิทธิ์และสถานะ', 'Select a member to see their role and status')}</p>
                      </div>
                    )}
                  </aside>
                </div>
              )}
            </>
          )}
          <p className="text-xs leading-relaxed text-brand-muted">
            {copy('สิทธิ์ในทีมแยกจาก role ของระบบ ข้อมูลรายรับ รายจ่าย และเอกสารส่วนตัวของแต่ละบัญชียังคงเป็นส่วนตัว', 'Group roles are separate from system roles. Each account’s income, expenses, and personal documents remain private.')}
          </p>
        </>
      )}

      {/* Member detail on phones / tablets */}
      <Drawer open={memberSheetOpen && Boolean(focusMember)} title={copy('ข้อมูลสมาชิก', 'Member details')} onClose={() => setMemberSheetOpen(false)} width={480}>
        {focusMember && memberDetail(focusMember)}
      </Drawer>

      {/* Invite */}
      <Drawer open={inviteOpen && Boolean(detail && canManage)} title={copy('เชิญสมาชิก', 'Invite member')} onClose={() => setInviteOpen(false)} width={480}>
        {detail && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (memberQuery.trim().length < 2) return;
              if (preview) { setMemberResults(PREVIEW_SEARCH_RESULTS); return; }
              setBusy(true); setError('');
              try { const found = await groupApi.searchUsers(userId, detail.id, memberQuery.trim()); setMemberResults(found.users); }
              catch (err) { setError((err as Error).message); } finally { setBusy(false); }
            }}
          >
            <label className="mb-1.5 block text-[13px] font-medium text-brand-text" htmlFor="group-member-search">{copy('ค้นหาด้วยชื่อหรือ User ID', 'Find by name or User ID')}</label>
            <div className="flex gap-2">
              <input id="group-member-search" type="search" required minLength={2} maxLength={60} placeholder={copy('ชื่อ หรือ SQ-XXXXXXXXXX', 'Name or SQ-XXXXXXXXXX')} className={fieldCls} value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} autoFocus />
              <button className={`${btnPrimary} h-11 shrink-0`} disabled={busy || memberQuery.trim().length < 2}><Search size={16} />{copy('ค้นหา', 'Search')}</button>
            </div>
            <p className="mt-2 text-xs text-brand-muted">{copy('คำเชิญจะอยู่ในบัญชีผู้รับ 7 วัน และผู้รับต้องกดเข้าร่วมเอง', 'The invitation stays in their account for 7 days and they must accept it.')}</p>
            <ul className="mt-4 divide-y divide-brand-border">
              {memberResults.map(u => (
                <li key={u.userId} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    {avatar({ displayName: u.displayName }, 40, false)}
                    <span className="min-w-0"><span className="block truncate text-[14px] font-medium text-brand-text">{u.displayName}</span><span className="block font-mono text-xs text-brand-muted">{u.publicId}</span></span>
                  </span>
                  <button type="button" className={btnSecondary} disabled={busy} onClick={() => void mutate({ action: 'invite', groupId: detail.id, userId: u.userId })}><UserPlus size={14} />{copy('เชิญ', 'Invite')}</button>
                </li>
              ))}
              {!!memberQuery.trim() && !memberResults.length && <li className="py-4 text-xs text-brand-muted">{copy('กดค้นหาเพื่อแสดงบัญชีที่ตรงกัน', 'Search to show matching accounts')}</li>}
            </ul>
          </form>
        )}
      </Drawer>

      {/* Team settings: rename, leave, delete */}
      <Drawer open={settingsOpen && Boolean(detail)} title={copy('ตั้งค่าทีม', 'Team settings')} onClose={() => setSettingsOpen(false)} width={480}>
        {detail && (
          <div className="space-y-6">
            {canManage ? (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void mutate({ action: 'rename', groupId: detail.id, name: name.trim(), description: description.trim() }); }}>
                <label className="block text-[13px] font-medium text-brand-text">{copy('ชื่อทีม', 'Group name')}
                  <input className={`${fieldCls} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
                </label>
                <label className="block text-[13px] font-medium text-brand-text">{copy('รายละเอียด', 'Description')}
                  <textarea className={`${fieldCls} mt-1.5 h-24 py-2.5`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
                </label>
                <button className={btnPrimary} disabled={busy || !name.trim()}>{copy('บันทึกทีม', 'Save group')}</button>
              </form>
            ) : (
              <div>
                <p className="text-[15px] font-semibold text-brand-text">{detail.name}</p>
                {detail.description && <p className="mt-1 whitespace-pre-wrap text-[13px] text-brand-muted">{detail.description}</p>}
              </div>
            )}
            {canManage && !!detail.activity.length && (
              <div className="border-t border-brand-border pt-5">
                <p className="mb-2 text-[13px] font-medium text-brand-text">{copy('กิจกรรมล่าสุด', 'Recent activity')}</p>
                <ul className="space-y-2">
                  {detail.activity.slice(0, 8).map(e => (
                    <li key={e.id} className="text-xs text-brand-muted"><span className="text-brand-text">{activityLabels[e.action] || e.action}</span> · {e.actorDisplayName || '—'}{e.targetDisplayName ? ` → ${e.targetDisplayName}` : ''} · {new Date(e.createdAt).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-3 border-t border-brand-border pt-5">
              {detail.myRole && (
                <div>
                  <button type="button" className={`${btnSecondary} w-full`} disabled={busy || loading || (detail.myRole === 'leader' && detail.leaderCount === 1)}
                    onClick={() => confirm(copy('ออกจากทีม', 'Leave group'), detail.name, { action: 'leave', groupId: detail.id })}>
                    {copy('ออกจากทีม', 'Leave group')}
                  </button>
                  {detail.myRole === 'leader' && detail.leaderCount === 1 && <p className="mt-2 text-xs text-brand-muted">{copy('เพิ่มหรือโอนหัวหน้ากลุ่มให้สมาชิกคนอื่นก่อนออกจากทีม', 'Promote or transfer leadership to another member before leaving.')}</p>}
                </div>
              )}
              {canManage && (
                <button type="button" className={`${btnSecondary} w-full text-[#C43A3A] dark:text-[#F19A9A]`} disabled={busy || loading}
                  onClick={() => confirm(copy('ลบทีมถาวร', 'Delete group permanently'), copy(`ลบ ${detail.name} พร้อมข้อมูลการเงิน สมาชิก และคำเชิญทั้งหมด?`, `Delete ${detail.name}, all financial data, memberships and invitations?`), { action: 'delete', groupId: detail.id })}>
                  <Trash2 size={15} />{copy('ลบทีม', 'Delete group')}
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Create team */}
      <Drawer open={creating && view === 'groups'} title={copy('สร้างทีมใหม่', 'Create a new group')} onClose={() => setCreating(false)} width={480}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void mutate({ action: 'create', groupId: newGroupId.current, name: name.trim(), description: description.trim() }); }}>
          <label className="block text-[13px] font-medium text-brand-text">{copy('ชื่อทีม', 'Group name')}
            <input className={`${fieldCls} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
          </label>
          <label className="block text-[13px] font-medium text-brand-text">{copy('รายละเอียด', 'Description')}
            <input className={`${fieldCls} mt-1.5`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </label>
          <p className="text-xs text-brand-muted">{copy('คุณจะเป็นหัวหน้ากลุ่มอัตโนมัติ และเพิ่มหัวหน้ากลุ่มคนอื่นได้ภายหลัง', 'You become the leader automatically and can add more leaders later.')}</p>
          <button className={btnPrimary} type="submit" disabled={busy || !name.trim()}>{busy ? copy('กำลังบันทึก…', 'Saving…') : copy('ยืนยันสร้างทีม', 'Create this group')}</button>
        </form>
      </Drawer>
    </section>
  );
}

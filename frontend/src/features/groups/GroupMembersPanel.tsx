import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type {
  GroupAction,
  GroupDetail,
  GroupRole,
} from '../../../../shared/groups';
import { useLanguage } from '../../i18n/LanguageContext';
import { panel, secondary } from './groupUi';

interface Props {
  detail: GroupDetail;
  userId: string;
  canManage: boolean;
  busy: boolean;
  loading: boolean;
  confirm: (title: string, message: string, action: GroupAction) => void;
}
export default function GroupMembersPanel({
  detail,
  userId,
  canManage,
  busy,
  loading,
  confirm,
}: Props) {
  const { language } = useLanguage();
  const copy = (th: string, en: string) => (language === 'th' ? th : en);
  const roleLabel = (role: GroupRole | null) =>
    role === 'leader'
      ? copy('ผู้ดูแลทีม', 'Leader')
      : role === 'member'
        ? copy('สมาชิก', 'Member')
        : copy('ดูแลโดย admin', 'Admin access');
  return (
    <div className={panel}>
      <h3 className="font-bold mb-4">
        {copy('สมาชิกในทีม', 'Group members')} ({detail.memberCount})
      </h3>
      <div className="divide-y divide-brand-border/40">
        {detail.members.map((member) => (
          <div
            key={member.userId}
            className="py-4 first:pt-0 flex flex-wrap justify-between items-center gap-3"
          >
            <div className="flex gap-3 min-w-0">
              <span className="flex items-center justify-center rounded-full bg-brand-faint text-brand-blue-acc w-10 h-10 shrink-0 font-bold">
                {(member.displayName || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm break-words">
                  {member.displayName}
                  {member.userId === userId ? copy(' (คุณ)', ' (you)') : ''}
                </p>
                <p className="text-xs text-brand-muted font-mono break-all">{member.publicId}</p>
                <span
                  className={`inline-block mt-1 text-xs font-bold ${member.role === 'leader' ? 'text-brand-blue-acc' : 'text-brand-muted'}`}
                >
                  {roleLabel(member.role)}
                </span>
              </div>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondary}
                  disabled={
                    busy ||
                    loading ||
                    (member.role === 'leader' && detail.leaderCount === 1)
                  }
                  onClick={() =>
                    confirm(
                      copy('เปลี่ยนสิทธิ์สมาชิก', 'Change member role'),
                      `${member.displayName} (${member.publicId}) → ${roleLabel(member.role === 'leader' ? 'member' : 'leader')}`,
                      {
                        action: 'member-role',
                        groupId: detail.id,
                        userId: member.userId,
                        role: member.role === 'leader' ? 'member' : 'leader',
                      },
                    )
                  }
                >
                  {member.role === 'leader'
                    ? copy('ลดเป็นสมาชิก', 'Make member')
                    : copy('เพิ่มเป็นผู้ดูแลทีม', 'Make leader')}
                </button>
                {member.userId !== userId && (
                  <>
                    {detail.myRole === 'leader' && (
                      <button
                        className={secondary}
                        disabled={busy || loading}
                        onClick={() =>
                          confirm(
                            copy('โอนตำแหน่งผู้ดูแลทีม', 'Transfer leadership'),
                            copy(
                              `โอนให้ ${member.displayName} (${member.publicId}) คุณจะกลับเป็นสมาชิกและเสียสิทธิ์จัดการทีม`,
                              `Transfer to ${member.displayName} (${member.publicId}). You will become a member and lose group management access.`,
                            ),
                            {
                              action: 'transfer',
                              groupId: detail.id,
                              userId: member.userId,
                            },
                          )
                        }
                      >
                        <ArrowRightLeft size={14} />
                        {copy('โอนผู้ดูแลทีม', 'Transfer')}
                      </button>
                    )}
                    <button
                      className={`${secondary} text-red-600`}
                      disabled={
                        busy ||
                        loading ||
                        (member.role === 'leader' && detail.leaderCount === 1)
                      }
                      onClick={() =>
                        confirm(
                          copy('นำสมาชิกออกจากทีม', 'Remove member'),
                          `${member.displayName} (${member.publicId})`,
                          {
                            action: 'remove-member',
                            groupId: detail.id,
                            userId: member.userId,
                          },
                        )
                      }
                    >
                      {copy('นำออก', 'Remove')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {detail.myRole && (
        <div className="pt-4 border-t border-brand-border/40">
          <button
            className={`${secondary} text-red-600`}
            disabled={
              busy ||
              loading ||
              (detail.myRole === 'leader' && detail.leaderCount === 1)
            }
            onClick={() =>
              confirm(copy('ออกจากทีม', 'Leave group'), detail.name, {
                action: 'leave',
                groupId: detail.id,
              })
            }
          >
            {copy('ออกจากทีม', 'Leave group')}
          </button>
          {detail.myRole === 'leader' && detail.leaderCount === 1 && (
            <p className="text-xs text-brand-muted mt-2">
              {copy(
                'เพิ่มหรือโอนผู้ดูแลทีมให้สมาชิกคนอื่นก่อนออกจากทีม',
                'Promote or transfer leadership to another member before leaving.',
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

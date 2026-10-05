import type { GroupDetail, GroupSnapshot, PublicProfile } from '../../../../shared/groups';

// Team is a future feature for small businesses. Until it launches, everyone except system admins
// sees this sample team so the page can be designed and tried without touching real groups: the
// signed-in user appears with their real name and photo, everyone else is made up, and nothing on
// the page is sent anywhere.

/** A neutral illustrated profile picture (silhouette on a soft colour), not a photo of anyone. */
export function sampleAvatar(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 86%)"/><stop offset="1" stop-color="hsl(${hue} 55% 72%)"/></linearGradient></defs>
<rect width="64" height="64" fill="url(#g)"/>
<circle cx="32" cy="25" r="11" fill="hsl(${hue} 35% 38%)" opacity=".85"/>
<path d="M12 60c2-12 10-18 20-18s18 6 20 18z" fill="hsl(${hue} 35% 38%)" opacity=".85"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const PREVIEW_GROUP_ID = 'preview-team';

export function buildPreviewTeam(me: { userId: string; displayName: string; publicId?: string; avatarUrl?: string }): { snapshot: GroupSnapshot; detail: GroupDetail } {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const detail: GroupDetail = {
    id: PREVIEW_GROUP_ID,
    name: 'ตัวอย่าง: สตูดิโอเล็กๆ ของคุณ',
    description: 'ทีมตัวอย่างสำหรับดูหน้าตาฟีเจอร์ทีม',
    createdAt: daysAgo(30),
    myRole: 'leader',
    memberCount: 4,
    leaderCount: 1,
    presenceAt: new Date().toISOString(),
    members: [
      { userId: me.userId, publicId: me.publicId || 'SQ-XXXXXXXXXX', displayName: me.displayName, role: 'leader', joinedAt: daysAgo(30), isOnline: true, lastSeenAt: minutesAgo(0), avatarUrl: me.avatarUrl || undefined },
      { userId: 'preview-may', publicId: 'SQ-0000000001', displayName: 'เมย์ (ตัวอย่าง)', role: 'member', joinedAt: daysAgo(21), isOnline: true, lastSeenAt: minutesAgo(0), avatarUrl: sampleAvatar(18) },
      { userId: 'preview-bank', publicId: 'SQ-0000000002', displayName: 'แบงก์ (ตัวอย่าง)', role: 'member', joinedAt: daysAgo(12), isOnline: false, lastSeenAt: minutesAgo(18), avatarUrl: sampleAvatar(205) },
      { userId: 'preview-ploy', publicId: 'SQ-0000000003', displayName: 'พลอย (ตัวอย่าง)', role: 'member', joinedAt: daysAgo(5), isOnline: false, lastSeenAt: minutesAgo(26 * 60), avatarUrl: sampleAvatar(140) },
    ],
    invitations: [
      { id: 'preview-invite', groupId: PREVIEW_GROUP_ID, groupName: 'ตัวอย่าง: สตูดิโอเล็กๆ ของคุณ', publicId: 'SQ-0000000004', displayName: 'ติ๊ก (ตัวอย่าง)', expiresAt: new Date(Date.now() + 6.4 * 86_400_000).toISOString() },
    ],
    activity: [
      { id: 'preview-a1', action: 'accept', actorPublicId: 'SQ-0000000003', actorDisplayName: 'พลอย (ตัวอย่าง)', targetPublicId: null, targetDisplayName: null, createdAt: daysAgo(5) },
      { id: 'preview-a2', action: 'invite', actorPublicId: me.publicId || null, actorDisplayName: me.displayName, targetPublicId: 'SQ-0000000003', targetDisplayName: 'พลอย (ตัวอย่าง)', createdAt: daysAgo(6) },
      { id: 'preview-a3', action: 'accept', actorPublicId: 'SQ-0000000002', actorDisplayName: 'แบงก์ (ตัวอย่าง)', targetPublicId: null, targetDisplayName: null, createdAt: daysAgo(12) },
    ],
  };
  const snapshot: GroupSnapshot = {
    systemRole: 'user',
    groups: [{ id: detail.id, name: detail.name, description: detail.description, createdAt: detail.createdAt, myRole: 'leader', memberCount: detail.memberCount, leaderCount: 1 }],
    invitations: [],
    total: 1,
    page: 0,
  };
  return { snapshot, detail };
}

export const PREVIEW_SEARCH_RESULTS: PublicProfile[] = [
  { userId: 'preview-search-1', publicId: 'SQ-0000000005', displayName: 'นัท (ตัวอย่าง)' },
];

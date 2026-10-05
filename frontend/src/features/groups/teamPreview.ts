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

export function buildPreviewTeam(me: { userId: string; displayName: string; publicId?: string; avatarUrl?: string; email?: string }): { snapshot: GroupSnapshot; detail: GroupDetail } {
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const name = 'บริษัท ปาร์ค จำกัด';
  // Sample people use example.com addresses and illustrated pictures, never real ones.
  const detail: GroupDetail = {
    id: PREVIEW_GROUP_ID,
    name,
    description: 'ทีมตัวอย่างสำหรับดูหน้าตาฟีเจอร์ทีม',
    createdAt: daysAgo(30),
    myRole: 'leader',
    memberCount: 3,
    leaderCount: 1,
    presenceAt: new Date().toISOString(),
    members: [
      { userId: me.userId, publicId: me.publicId || 'SQ-XXXXXXXXXX', displayName: me.displayName, role: 'leader', joinedAt: daysAgo(30), isOnline: true, lastSeenAt: minutesAgo(0), avatarUrl: me.avatarUrl || undefined, email: me.email, assignedJobs: 12 },
      { userId: 'preview-may', publicId: 'SQ-0000000001', displayName: 'May', role: 'member', joinedAt: daysAgo(21), isOnline: true, lastSeenAt: minutesAgo(0), avatarUrl: sampleAvatar(18), email: 'may.creator@example.com', assignedJobs: 7 },
      { userId: 'preview-bank', publicId: 'SQ-0000000002', displayName: 'Bank', role: 'member', joinedAt: daysAgo(12), isOnline: false, lastSeenAt: minutesAgo(18), avatarUrl: sampleAvatar(205), email: 'bank.dev@example.com', assignedJobs: 4 },
    ],
    invitations: [
      { id: 'preview-invite', groupId: PREVIEW_GROUP_ID, groupName: name, publicId: 'SQ-0000000004', displayName: 'Tik', email: 'tik.freelance@example.com', sentAt: daysAgo(1), expiresAt: new Date(Date.now() + 6.4 * 86_400_000).toISOString() },
    ],
    activity: [
      { id: 'preview-a1', action: 'accept', actorPublicId: 'SQ-0000000002', actorDisplayName: 'Bank', targetPublicId: null, targetDisplayName: null, createdAt: daysAgo(12) },
      { id: 'preview-a2', action: 'invite', actorPublicId: me.publicId || null, actorDisplayName: me.displayName, targetPublicId: 'SQ-0000000002', targetDisplayName: 'Bank', createdAt: daysAgo(13) },
      { id: 'preview-a3', action: 'accept', actorPublicId: 'SQ-0000000001', actorDisplayName: 'May', targetPublicId: null, targetDisplayName: null, createdAt: daysAgo(21) },
      { id: 'preview-a4', action: 'create', actorPublicId: me.publicId || null, actorDisplayName: me.displayName, targetPublicId: null, targetDisplayName: null, createdAt: daysAgo(30) },
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
  { userId: 'preview-search-1', publicId: 'SQ-0000000005', displayName: 'Nat' },
];

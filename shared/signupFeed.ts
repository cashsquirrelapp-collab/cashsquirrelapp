// The admin page's live sign-ups card (owner, 2026-11-28). Built by backend/src/services/signupFeed.ts.
export type SignupVia = 'google' | 'line' | 'email' | 'other';
export interface SignupFeedItem {
  userId: string; publicId: string | null; displayName: string | null; createdAt: string; via: SignupVia; confirmed: boolean;
  /** The Google profile picture the account signed in with (https, Google's picture host only). */
  avatarUrl?: string | null;
  /** The sign-in address: for the owner only, never for team admins; none for accounts opened through LINE. */
  email?: string | null;
}
export interface SignupFeed { total: number; today: number; latest: SignupFeedItem[]; at: string }

/** A picture address the page may show: https on Google's or LINE's picture hosts (the page's img-src allows these). */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname.endsWith('.googleusercontent.com') || url.hostname === 'profile.line-scdn.net') ? url.toString() : null;
  } catch { return null; }
}

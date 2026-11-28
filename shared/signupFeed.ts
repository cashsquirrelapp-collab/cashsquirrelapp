// The admin page's live sign-ups card (owner, 2026-11-28). Built by backend/src/services/signupFeed.ts.
export type SignupVia = 'google' | 'line' | 'email' | 'other';
export interface SignupFeedItem { userId: string; publicId: string | null; displayName: string | null; createdAt: string; via: SignupVia; confirmed: boolean }
export interface SignupFeed { total: number; today: number; latest: SignupFeedItem[]; at: string }

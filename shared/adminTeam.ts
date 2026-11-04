import type { SystemRole } from './groups.js';
import type { TokenGrant } from './tokenGrants.js';

/** One account found by its UID on the owner's ทีมงานและโทเคน page. */
export interface AdminLookup {
  userId: string;
  publicId: string;
  displayName: string;
  createdAt: string;
  role: SystemRole;
  /** The owner's own account: its role never changes. */
  isOwner: boolean;
  /** Every token ever given to it. */
  granted: number;
  /** The latest grants, newest first. */
  grants: TokenGrant[];
  /** เลขา now: its plan and tokens left in the running cycle (null when unreadable). */
  tokens: { plan: 'pro' | 'trial' | 'admin' | 'lapsed' | 'none'; left: number | null; limit: number | null; resetsAt: string | null } | null;
}

/** A grant in the owner's log, with the account it went to. */
export interface AdminTokenGrantLog extends TokenGrant {
  userId: string;
  publicId: string;
  displayName: string;
}

import { getSupabaseAdmin } from '../config/supabase.js';

type AuthAccount = {
  app_metadata?: Record<string, unknown>;
};

type DurableClosure = {
  closure_kind?: string | null;
  state?: string | null;
};

export interface LinkedAccountAccessDependencies {
  readAuthAccount: (userId: string) => Promise<{ user: AuthAccount | null; error: unknown | null }>;
  readDurableClosure: (userId: string) => Promise<{ closure: DurableClosure | null; error: unknown | null }>;
}

export type LinkedAccountWriteAccess =
  | { allowed: true }
  | { allowed: false; status: 403 | 503; error: string };

const unavailable = (): LinkedAccountWriteAccess => ({
  allowed: false,
  status: 503,
  error: 'ไม่สามารถตรวจสอบสถานะบัญชีได้ กรุณาลองใหม่อีกครั้ง',
});

const blocked = (kind: string | null | undefined): LinkedAccountWriteAccess => ({
  allowed: false,
  status: 403,
  error: kind === 'deletion'
    ? 'บัญชีนี้อยู่ระหว่างรอลบ กรุณากู้คืนบัญชีในเว็บไซต์ก่อน'
    : 'บัญชีนี้พักใช้งานอยู่ กรุณาเปิดใช้งานอีกครั้งในเว็บไซต์',
});

const defaultDependencies: LinkedAccountAccessDependencies = {
  async readAuthAccount(userId) {
    const result = await getSupabaseAdmin().auth.admin.getUserById(userId);
    return { user: result.data.user, error: result.error };
  },
  async readDurableClosure(userId) {
    const result = await getSupabaseAdmin().from('cashflow_account_pauses')
      .select('closure_kind,state').eq('user_id', userId).maybeSingle();
    return { closure: result.data, error: result.error };
  },
};

/**
 * LINE-linked writes do not have an app cookie, so they cannot use requireUser. Check the same
 * lifecycle state through Auth plus the durable closure row and fail closed if either source is
 * unavailable. A paused or deletion-worker-claimed durable row remains blocking even after its
 * deadline so a temporary Auth/database drift can never reopen a write path.
 */
export async function checkLinkedAccountWriteAccess(
  userId: string,
  dependencies: LinkedAccountAccessDependencies = defaultDependencies,
): Promise<LinkedAccountWriteAccess> {
  const [auth, durable] = await Promise.all([
    dependencies.readAuthAccount(userId),
    dependencies.readDurableClosure(userId),
  ]);

  if (auth.error || !auth.user || durable.error) {
    console.error('Linked account lifecycle lookup failed', {
      auth: auth.error ? 'error' : auth.user ? 'ok' : 'missing',
      durable: durable.error ? 'error' : 'ok',
    });
    return unavailable();
  }

  const metadata = auth.user.app_metadata || {};
  if (metadata.account_paused === true) {
    return blocked(metadata.account_closure_kind === 'deletion' ? 'deletion' : 'pause');
  }

  const closure = durable.closure;
  // A durable row is the recovery source when Auth metadata and the database momentarily drift.
  // Do not reopen writes merely because its deadline has passed: `paused` still means the
  // account is closed, while `deleting` means the cleanup worker has already claimed it.
  if (closure?.state === 'paused' || closure?.state === 'deleting') {
    return blocked(closure.closure_kind);
  }

  return { allowed: true };
}

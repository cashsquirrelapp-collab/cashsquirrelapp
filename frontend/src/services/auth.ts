import { setCurrentAccount, onSessionExpired } from './api';
import { privateCache, clearLegacyFinancialCache } from './privateCache';
import { clearCloud } from './cloud';
// Compatibility facade for the existing auth UI. Tokens never enter browser JavaScript.
import { apiJson } from './api';
import type { SystemRole } from '../../../shared/groups';
import { safeDocumentReturnPath } from '../../../shared/documentReturnPath';
import { tr } from '../i18n/tr';
type PublicSession = { user: { id: string; email: string; role: SystemRole; canViewAdminAnalytics?: boolean; accountPaused?: boolean; accountClosureKind?: 'pause' | 'deletion'; accountDeleteAfter?: string | null; created_at: string; user_metadata: Record<string, string> } };
let current: PublicSession | null = null;
let revision=0;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cashflow-auth');
const listeners = new Set<(event: string, session: PublicSession | null) => void>();
type SessionCheck = { data: { session: PublicSession | null }; error: Error | null };
let sessionRequest: Promise<SessionCheck> | null = null;
let sessionRequestRevision = -1;
function emit(event: string, broadcast = true) { if(broadcast)channel?.postMessage('changed'); setCurrentAccount(current?.user.id); listeners.forEach(fn=>fn(event,current)); }
function updateSession(next: PublicSession | null) {
  if(current?.user.id!==next?.user.id || current?.user.accountPaused!==next?.user.accountPaused) {
    privateCache.clear();
    clearCloud();
    clearLegacyFinancialCache();
  }
  current=next; setCurrentAccount(current?.user.id);
}
onSessionExpired(()=>{if(current){revision++;updateSession(null);emit('SIGNED_OUT');}});
async function action(action: string, values: Record<string, unknown> = {}) {
  const version=++revision;
  try { const result = await apiJson<any>('/api/auth', { method: 'POST', body: JSON.stringify({ action, ...values }) });
    if(version!==revision)throw new Error(tr("บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่"));
    revision++;
    if ('session' in result) { updateSession(result.session); emit(current ? 'SIGNED_IN' : 'SIGNED_OUT'); }
    if (result.url) window.location.assign(result.url);
    return { data: result, error: null };
  } catch (error) { return { data: { session: null, user: null }, error: error as Error }; }
}
async function accountAction(action: 'pause' | 'reactivate' | 'request-delete' | 'delete', values: Record<string, unknown> = {}) {
  const version = revision;
  try {
    const result = await apiJson<any>('/api/account', { method: 'POST', body: JSON.stringify({ action, ...values }) });
    if (version !== revision) throw new Error(tr("บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่"));
    if ('session' in result) { revision++; updateSession(result.session); emit(current ? 'USER_UPDATED' : 'SIGNED_OUT'); }
    return { data: result, error: null };
  } catch (error) { return { data: null, error: error as Error }; }
}
// A slow moment at Supabase answers 5xx, or the connection drops: ask twice more before treating the
// person as signed out, so a refresh keeps its skeleton instead of landing on the login page.
async function readSession(): Promise<{ session: PublicSession | null }> {
  for (let attempt = 0; ; attempt++) {
    try { return await apiJson<{ session: PublicSession | null }>('/api/auth'); }
    catch (error) {
      const status = (error as { status?: number }).status;
      if (attempt >= 2 || (typeof status === 'number' && status < 500)) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt ? 1500 : 500));
    }
  }
}
async function getSession(): Promise<SessionCheck> {
  const version = revision;
  if (sessionRequest && sessionRequestRevision === version) return sessionRequest;
  const request: Promise<SessionCheck> = (async () => {
    try {
      const result = await readSession();
      if (version !== revision) return { data: { session: current }, error: null };
      const previous = current?.user.id;
      const previousRole = current?.user.role;
      const previousPaused = current?.user.accountPaused;
      const previousAnalyticsAccess = current?.user.canViewAdminAnalytics;
      updateSession(result.session);
      if (previous !== current?.user.id) { revision++; emit(current ? 'SIGNED_IN' : 'SIGNED_OUT', false); }
      else if (previousRole !== current?.user.role || previousPaused !== current?.user.accountPaused || previousAnalyticsAccess !== current?.user.canViewAdminAnalytics) { revision++; emit('USER_UPDATED', false); }
      return { data: result, error: null };
    } catch (error) {
      return { data: { session: current }, error: error as Error };
    }
  })();
  sessionRequest = request;
  sessionRequestRevision = version;
  try { return await request; }
  finally { if (sessionRequest === request) sessionRequest = null; }
}
// Other accounts signed in on this browser, for the account switcher (owner, 2026-10-21). The server
// keeps their sessions in sealed cookies; the browser only ever sees who they are.
export type DeviceAccount = { id: string; email: string; name?: string; current: boolean; ready: boolean };
export const deviceAccounts = {
  async list(): Promise<DeviceAccount[]> {
    const result = await apiJson<{ accounts?: DeviceAccount[] }>('/api/auth?accounts=1');
    return Array.isArray(result.accounts) ? result.accounts : [];
  },
  /** Make another account active; the page then reloads into it. */
  async switchTo(accountId: string): Promise<void> {
    await apiJson('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'switch-account', accountId }) });
  },
  async forget(accountId: string): Promise<void> {
    await apiJson('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'forget-account', accountId }) });
  },
};
export const authClient = { auth: {
  getSession,
  signInWithPassword: (values: { email: string; password: string })=>action('signin', values),
  requestLoginUnlock: (values: { email: string; password: string })=>action('unlock-request', values),
  signInWithUnlockCode: (values: { email: string; password: string; code: string })=>action('unlock-verify', values),
  signUp: (values: { email: string; password: string; displayName?: string; options?: unknown })=>action('signup', values),
  signInWithOAuth: (values: { provider?: 'google' | 'facebook' } = {})=>action('oauth', {
    provider: values.provider ?? 'google',
    returnTo: safeDocumentReturnPath(`${window.location.pathname}${window.location.search}`),
  }),
  signOut: ()=>action('logout'),
  pauseAccount: ()=>accountAction('pause'),
  reactivateAccount: ()=>accountAction('reactivate'),
  requestAccountDeletion: ()=>accountAction('request-delete'),
  deleteAccount: (code: string)=>accountAction('delete', { code }),
  onAuthStateChange(fn: (event: string, session: PublicSession | null)=>void) { listeners.add(fn); return { data: { subscription: { unsubscribe: ()=>{listeners.delete(fn);} } } }; }
} };

if(channel)channel.onmessage=async()=>{const result=await authClient.auth.getSession();if(!result.error)emit(current?'SIGNED_IN':'SIGNED_OUT',false);};

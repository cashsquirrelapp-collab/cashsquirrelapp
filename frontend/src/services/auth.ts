import { setCurrentAccount, onSessionExpired } from './api';
import { privateCache, clearLegacyFinancialCache } from './privateCache';
import { clearCloud } from './cloud';
// Compatibility facade for the existing auth UI. Tokens never enter browser JavaScript.
import { apiJson } from './api';
import type { SystemRole } from '../../../shared/groups';
type PublicSession = { user: { id: string; email: string; role: SystemRole; accountPaused?: boolean; accountDeleteAfter?: string | null; created_at: string; user_metadata: Record<string, string> } };
let current: PublicSession | null = null;
let revision=0;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cashflow-auth');
const listeners = new Set<(event: string, session: PublicSession | null) => void>();
type SessionCheck = { data: { session: PublicSession | null }; error: Error | null };
let sessionRequest: Promise<SessionCheck> | null = null;
let sessionRequestRevision = -1;
function emit(event: string, broadcast = true) { if(broadcast)channel?.postMessage('changed'); setCurrentAccount(current?.user.id); listeners.forEach(fn=>fn(event,current)); }
function updateSession(next: PublicSession | null) {
  if(current?.user.id!==next?.user.id || current?.user.accountPaused!==next?.user.accountPaused) { privateCache.clear(); clearCloud(); clearLegacyFinancialCache(); }
  current=next; setCurrentAccount(current?.user.id);
}
onSessionExpired(()=>{if(current){revision++;updateSession(null);emit('SIGNED_OUT');}});
async function action(action: string, values: Record<string, unknown> = {}) {
  const version=++revision;
  try { const result = await apiJson<any>('/api/auth', { method: 'POST', body: JSON.stringify({ action, ...values }) });
    if(version!==revision)throw new Error('บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
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
    if (version !== revision) throw new Error('บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
    if ('session' in result) { revision++; updateSession(result.session); emit(current ? 'USER_UPDATED' : 'SIGNED_OUT'); }
    return { data: result, error: null };
  } catch (error) { return { data: null, error: error as Error }; }
}
async function getSession(): Promise<SessionCheck> {
  const version = revision;
  if (sessionRequest && sessionRequestRevision === version) return sessionRequest;
  const request: Promise<SessionCheck> = (async () => {
    try {
      const result = await apiJson<{ session: PublicSession | null }>('/api/auth');
      if (version !== revision) return { data: { session: current }, error: null };
      const previous = current?.user.id;
      const previousRole = current?.user.role;
      const previousPaused = current?.user.accountPaused;
      updateSession(result.session);
      if (previous !== current?.user.id) { revision++; emit(current ? 'SIGNED_IN' : 'SIGNED_OUT', false); }
      else if (previousRole !== current?.user.role || previousPaused !== current?.user.accountPaused) { revision++; emit('USER_UPDATED', false); }
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
export const authClient = { auth: {
  getSession,
  signInWithPassword: (values: { email: string; password: string })=>action('signin', values),
  signUp: (values: { email: string; password: string; displayName?: string; options?: unknown })=>action('signup', values),
  signInWithOAuth: (_values: unknown)=>action('oauth'),
  signOut: ()=>action('logout'),
  pauseAccount: ()=>accountAction('pause'),
  reactivateAccount: ()=>accountAction('reactivate'),
  requestAccountDeletion: ()=>accountAction('request-delete'),
  deleteAccount: (code: string)=>accountAction('delete', { code }),
  onAuthStateChange(fn: (event: string, session: PublicSession | null)=>void) { listeners.add(fn); return { data: { subscription: { unsubscribe: ()=>{listeners.delete(fn);} } } }; }
} };

if(channel)channel.onmessage=async()=>{const result=await authClient.auth.getSession();if(!result.error)emit(current?'SIGNED_IN':'SIGNED_OUT',false);};

import { setCurrentAccount, onSessionExpired } from './api';
import { privateCache, clearLegacyFinancialCache } from './privateCache';
import { clearCloud } from './cloud';
// Compatibility facade for the existing auth UI. Tokens never enter browser JavaScript.
import { apiJson } from './api';
import type { SystemRole } from '../../../shared/groups';
type PublicSession = { user: { id: string; email: string; role: SystemRole; created_at: string; user_metadata: Record<string, string> } };
let current: PublicSession | null = null;
let revision=0;
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('cashflow-auth');
const listeners = new Set<(event: string, session: PublicSession | null) => void>();
function emit(event: string, broadcast = true) { if(broadcast)channel?.postMessage('changed'); setCurrentAccount(current?.user.id); listeners.forEach(fn=>fn(event,current)); }
function updateSession(next: PublicSession | null) {
  if(current?.user.id!==next?.user.id) { privateCache.clear(); clearCloud(); clearLegacyFinancialCache(); }
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
export const authClient = { auth: {
  async getSession() { const version=revision;try { const result = await apiJson<{ session: PublicSession | null }>('/api/auth');if(version!==revision)return {data:{session:current},error:null};const previous=current?.user.id,previousRole=current?.user.role; updateSession(result.session);if(previous!==current?.user.id){revision++;emit(current?'SIGNED_IN':'SIGNED_OUT',false);}else if(previousRole!==current?.user.role){revision++;emit('USER_UPDATED',false);}return { data: result, error:null }; } catch (error) { return { data: { session:current }, error:error as Error }; } },
  signInWithPassword: (values: { email: string; password: string })=>action('signin', values),
  signUp: (values: { email: string; password: string; options?: unknown })=>action('signup', values),
  signInWithOAuth: (_values: unknown)=>action('oauth'),
  signOut: ()=>action('logout'),
  onAuthStateChange(fn: (event: string, session: PublicSession | null)=>void) { listeners.add(fn); return { data: { subscription: { unsubscribe: ()=>{listeners.delete(fn);} } } }; }
} };

if(channel)channel.onmessage=async()=>{const result=await authClient.auth.getSession();if(!result.error)emit(current?'SIGNED_IN':'SIGNED_OUT',false);};

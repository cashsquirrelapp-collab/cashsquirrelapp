import { isStaging, stagingGoogleAllowed, stagingEmailAllowed, stagingProviderReady } from '../security/staging.js';
import { createClient, type Session, type User } from '@supabase/supabase-js';
import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { appOrigin, required, supabaseUrl } from '../config/env.js';
import { readCookie, writeCookie, seal } from '../security/cookies.js';
import { publicUser, storeSession, requireUser, revokeSession, type PrivateSession } from '../security/session.js';
import { challengeHash, rateLimit } from '../security/rateLimit.js';
import { clientIp } from '../security/ingress.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { supabaseFetch } from '../config/supabaseFetch.js';
import { forgetDeviceAccount, keepCurrentAside, listDeviceAccounts, rememberAccount, signOutDeviceAccounts, switchToAccount } from '../security/deviceAccounts.js';
import { sendGmailEmail, sendSignupConfirmationEmail, sendSignupWelcomeEmail } from '../services/gmail.js';
import { markSignupWelcomePending, sendPendingSignupWelcome } from '../services/signupWelcome.js';
import { isValidPassword } from '../../../shared/passwordPolicy.js';
import { safeDocumentReturnPath } from '../../../shared/documentReturnPath.js';
const credentials = z.object({ email: z.email().max(254).transform(v=>v.toLowerCase()), password: z.string().min(1).max(128), displayName: z.string().trim().min(2).max(60).regex(/^[^\p{Cc}\p{Cf}]+$/u).optional() });
const unlockCode = z.string().regex(/^\d{6}$/);
const unlockRequestMessage = { ok: true, message: 'หากข้อมูลถูกต้อง ระบบจะส่งรหัสยืนยันไปยังอีเมลของบัญชี' };
// Free social sign-in providers. Each one only works once it is switched on (with its keys) in Supabase Auth;
// the login page asks /api/auth?providers=1 which ones are on and labels the others "เร็ว ๆ นี้".
const OAUTH_PROVIDERS = ['google', 'facebook'] as const;
type OAuthProvider = typeof OAUTH_PROVIDERS[number];
const isOAuthProvider = (value: unknown): value is OAuthProvider => OAUTH_PROVIDERS.includes(value as OAuthProvider);
let providerCache: { at: number; value: Record<OAuthProvider, boolean> } | null = null;
async function enabledProviders(): Promise<Record<OAuthProvider, boolean>> {
  if (providerCache && Date.now() - providerCache.at < 5 * 60 * 1000) return providerCache.value;
  const fallback = { google: true, facebook: false };
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/settings`, {
      headers: { apikey: required('SUPABASE_PUBLISHABLE_KEY') }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return fallback;
    const external = ((await response.json()) as { external?: Record<string, unknown> }).external || {};
    const value = { google: external.google === true, facebook: external.facebook === true };
    providerCache = { at: Date.now(), value };
    return value;
  } catch { return fallback; }
}

async function sendConfirmation(userId:string,email:string,displayName?:string):Promise<boolean>{
  const token=seal({purpose:'confirm-email',userId,email,expires:Date.now()+86400000});
  return sendSignupConfirmationEmail(email,displayName,`${appOrigin()}/api/confirm-email?token=${encodeURIComponent(token)}`);
}
/** A new sign-in becomes the active account; the one already signed in here waits for the switcher. */
async function adoptSession(req: VercelRequest, res: VercelResponse, session: Session, user: User) {
  await keepCurrentAside(req, res, user.id);
  storeSession(res, session);
  const meta = user.user_metadata || {};
  const name = [meta.full_name, meta.name, meta.display_name].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  rememberAccount(req, res, { id: user.id, email: user.email, ...(name ? { name: name.trim().slice(0, 80) } : {}) });
}
function loginEmailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
async function sendLoginSecurityAlert(email: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const found = await admin.from('cashflow_account_snapshot').select('user_id').eq('email', email).maybeSingle();
  if (found.error || !found.data?.user_id) return;
  const account = await admin.auth.admin.getUserById(found.data.user_id);
  const confirmedEmail = account.data.user?.email_confirmed_at ? account.data.user.email : null;
  if (!confirmedEmail || confirmedEmail.toLowerCase() !== email) return;
  const occurredAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
  const sent = await sendGmailEmail(confirmedEmail, 'แจ้งเตือนความปลอดภัยในการเข้าสู่ระบบ | Krarok Tunngern',
    `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#34251d"><h2>มีการพยายามเข้าสู่ระบบบัญชีของคุณ</h2><p>มีการกรอกรหัสผ่านไม่ถูกต้องครบ 6 ครั้ง การเข้าสู่ระบบด้วยรหัสผ่านจึงถูกพัก 5 นาที</p><p>เวลา: ${occurredAt} (เวลาไทย)</p><p>หากเป็นคุณ สามารถรอ 5 นาที หรือใช้รหัสผ่านที่ถูกต้องพร้อมรหัสยืนยันทางอีเมลเพื่อเข้าใช้ได้ทันที หากไม่ใช่คุณ แนะนำให้เปลี่ยนรหัสผ่านและตรวจสอบความปลอดภัยของอีเมล</p></div>`);
  if (!sent) console.error('Login security email delivery failed');
}
export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === 'GET' && req.query.providers === '1') { res.json({ providers: await enabledProviders() }); return; }
  // The switcher's list: who is signed in on this browser (from sealed cookies only, no provider call).
  if (req.method === 'GET' && req.query.accounts === '1') { res.json({ accounts: listDeviceAccounts(req) }); return; }
  if(req.method==='GET' && req.query.code===undefined && !readCookie<PrivateSession>(req)) { res.json({session:null});return; }
  const verifier = readCookie<{ storage: Record<string,string>; expires: number; returnTo?: string }>(req,'oauth');
  const storage = verifier && verifier.expires > Date.now() ? { ...verifier.storage } : {} as Record<string,string>;
  const auth = createClient(supabaseUrl(), required('SUPABASE_PUBLISHABLE_KEY'), { auth: {
    flowType:'pkce', autoRefreshToken:false, persistSession:true, detectSessionInUrl:false,
    storage: { getItem: key=>storage[key] ?? null, setItem:(key,value)=>{storage[key]=value;}, removeItem:key=>{delete storage[key];} }
  }, global: { fetch: supabaseFetch } });
  if (req.method === 'GET') {
    if (typeof req.query.code === 'string') {
      if (!verifier || verifier.expires < Date.now()) {
        writeCookie(res,null,'oauth');
        res.status(302); res.setHeader('Location',`${appOrigin()}/login?authLinkError=1`); res.end(); return;
      }
      const { data,error } = await auth.auth.exchangeCodeForSession(req.query.code);
      writeCookie(res,null,'oauth');
      if (error || !data.session) {
        res.status(302); res.setHeader('Location',`${appOrigin()}/login?authLinkError=1`); res.end(); return;
      }
      const callbackAllowed = data.user?.app_metadata?.provider === 'email'
        ? stagingEmailAllowed(data.user?.email) : stagingGoogleAllowed(data.user?.email);
      if (!callbackAllowed || (isStaging() && !data.user?.email_confirmed_at)) {
        await auth.auth.signOut({ scope: 'local' });
        res.status(302); res.setHeader('Location', `${appOrigin()}/login?stagingAccountDenied=1`); res.end(); return;
      }
      if (data.user?.app_metadata?.account_closure_kind === 'deletion') {
        await auth.auth.signOut();
        res.status(302); res.setHeader('Location',`${appOrigin()}/login?accountDeletionPending=1`); res.end(); return;
      }
      // First sign-up through a social provider (Google or Facebook): the same welcome email as before.
      const signupProvider = data.user?.app_metadata?.provider;
      const socialIdentity = isOAuthProvider(signupProvider)
        ? data.user?.identities?.find(identity => identity.provider === signupProvider) : undefined;
      const accountCreatedAt = data.user ? Date.parse(data.user.created_at) : Number.NaN;
      const socialIdentityCreatedAt = socialIdentity?.created_at ? Date.parse(socialIdentity.created_at) : Number.NaN;
      const accountAgeMs = Date.now() - accountCreatedAt;
      const firstSocialSignup = Boolean(socialIdentity)
        && Number.isFinite(accountCreatedAt)
        && Number.isFinite(socialIdentityCreatedAt)
        && accountAgeMs >= 0
        && accountAgeMs <= 10 * 60 * 1000
        && Math.abs(accountCreatedAt - socialIdentityCreatedAt) <= 5 * 60 * 1000;
      if (firstSocialSignup && data.user?.email) {
        const displayName = typeof data.user.user_metadata?.full_name === 'string'
          ? data.user.user_metadata.full_name
          : typeof data.user.user_metadata?.name === 'string' ? data.user.user_metadata.name : undefined;
        const welcomeEmailSent = await sendSignupWelcomeEmail(data.user.email, displayName);
        if (!welcomeEmailSent) console.error('Social signup welcome email delivery failed', { provider: signupProvider });
      }
      if (data.user?.app_metadata?.provider === 'email') await sendPendingSignupWelcome(data.user);
      const returnTo = safeDocumentReturnPath(verifier.returnTo) || '/';
      await adoptSession(req,res,data.session,data.user); res.status(302); res.setHeader('Location',`${appOrigin()}${returnTo}`); res.end(); return;
    }
    try { const user=await requireUser(req,res,false,true); res.json({ session:{user:await publicUser(user)} }); }
    catch (error) { if (!(error instanceof HttpError) || error.status!==401) throw error; res.json({session:null}); }
    return;
  }
  if (req.method !== 'POST') throw new HttpError(405,'Method not allowed');
  const action = req.body?.action;
  if (action === 'logout') {
    const session=readCookie<PrivateSession>(req);
    if (session?.access_token) await revokeSession(session, typeof req.headers['x-account-id'] === 'string' ? req.headers['x-account-id'] : undefined);
    await signOutDeviceAccounts(req, res);
    writeCookie(res,null); writeCookie(res,null,'oauth'); res.json({session:null}); return;
  }
  if (action === 'switch-account' || action === 'forget-account') {
    const accountId = typeof req.body?.accountId === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.accountId) ? req.body.accountId : '';
    if (!accountId) throw new HttpError(400, 'Invalid account');
    if (action === 'switch-account') await switchToAccount(req, res, accountId);
    else await forgetDeviceAccount(req, res, accountId);
    res.json({ ok: true, accounts: action === 'forget-account' ? listDeviceAccounts(req).filter(item => item.id !== accountId) : undefined }); return;
  }
  if (action === 'oauth') {
    const provider = req.body?.provider ?? 'google';
    if (!isOAuthProvider(provider)) throw new HttpError(400, 'วิธีเข้าสู่ระบบนี้ยังไม่รองรับ');
    if (isStaging() && (provider !== 'google' || !stagingProviderReady('google'))) throw new HttpError(503, 'Social sign-in staging is not configured');
    if (provider !== 'google' && !(await enabledProviders())[provider]) throw new HttpError(503, 'วิธีเข้าสู่ระบบนี้ยังไม่เปิดใช้งาน');
    const {data,error}=await auth.auth.signInWithOAuth({provider,options:{redirectTo:`${appOrigin()}/api/auth`,skipBrowserRedirect:true}});
    if (error) throw new HttpError(400,'เริ่มการเข้าสู่ระบบไม่สำเร็จ');
    const returnTo = safeDocumentReturnPath(req.body?.returnTo);
    writeCookie(res,{storage:Object.fromEntries(Object.entries(storage).filter(([key])=>key.endsWith('-code-verifier'))),expires:Date.now()+600000,...(returnTo ? {returnTo} : {})},'oauth',600); res.json({url:data.url}); return;
  }
  if (!['signin', 'signup', 'unlock-request', 'unlock-verify'].includes(action)) throw new HttpError(400,'Invalid action');
  const parsed=credentials.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400,'กรุณาตรวจสอบอีเมลและรหัสผ่าน');
  if (action !== 'signin' && !stagingEmailAllowed(parsed.data.email)) throw new HttpError(403, 'Only the approved staging mailbox is allowed');
  if (action === 'signup') await rateLimit('auth-signup', parsed.data.email, 20, 600);
  else await rateLimit(`auth-${action}-source`, `${clientIp(req)}:${parsed.data.email}`, action === 'unlock-request' ? 6 : 20, 600);
  if (action === 'unlock-request' || action === 'unlock-verify') {
    const emailKey = loginEmailKey(parsed.data.email);
    const admin = getSupabaseAdmin();
    const startedAt = Date.now();
    const respondGenerically = async () => {
      const remaining = 1500 - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
      res.json(unlockRequestMessage);
    };
    const clearTemporaryAuth = async () => {
      try {
        const signedOut = await auth.auth.signOut({ scope: 'local' });
        if (signedOut.error) console.error('Could not clear temporary login session', { type: signedOut.error.name });
      } catch (cause) {
        console.error('Could not clear temporary login session', { type: cause instanceof Error ? cause.name : 'UnknownError' });
      }
    };
    const code = action === 'unlock-verify' ? unlockCode.safeParse(req.body?.code) : null;
    if (action === 'unlock-verify' && !code?.success) throw new HttpError(400, 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    const locked = await admin.rpc('cashflow_login_lock_status', { p_email_key: emailKey });
    if (locked.error) throw locked.error;
    if (action === 'unlock-request' && Number(locked.data) <= 0) { await respondGenerically(); return; }
    const { data, error } = await auth.auth.signInWithPassword(parsed.data);
    if (error || !data.session || !data.user || !data.user.email_confirmed_at ||
        data.user.email?.toLowerCase() !== parsed.data.email ||
        data.user.app_metadata?.account_closure_kind === 'deletion') {
      if (action === 'unlock-request') { await respondGenerically(); return; }
      throw new HttpError(401, 'อีเมล รหัสผ่าน หรือรหัสยืนยันไม่ถูกต้อง');
    }
    if (action === 'unlock-request') {
      try {
        // Only a verified password can reach this per-account email quota.
        try { await rateLimit('login-unlock-email', data.user.id, 3, 900); }
        catch (cause) {
          if (!(cause instanceof HttpError) || cause.status !== 429) throw cause;
          await respondGenerically(); return;
        }
        const otp = String(randomInt(100000, 1000000));
        const saved = await admin.from('cashflow_challenges').upsert({
          user_id: data.user.id, purpose: 'login-unlock',
          code_hash: challengeHash(`${data.user.id}:${parsed.data.email}:${otp}`),
          expires_at: new Date(Date.now() + 300_000).toISOString(), attempts: 0,
        });
        if (saved.error) throw saved.error;
        const sent = await sendGmailEmail(parsed.data.email, 'รหัสยืนยันการเข้าสู่ระบบ | Krarok Tunngern',
          `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto"><h2>ยืนยันการเข้าสู่ระบบ</h2><p>รหัสยืนยันของคุณคือ <strong style="font-size:28px">${otp}</strong></p><p>รหัสใช้ได้ 5 นาที หากไม่ได้ขอรหัสนี้ กรุณาเปลี่ยนรหัสผ่านและตรวจสอบอีเมลของคุณ</p></div>`);
        if (!sent) {
          await admin.from('cashflow_challenges').delete()
            .eq('user_id', data.user.id).eq('purpose', 'login-unlock')
            .eq('code_hash', challengeHash(`${data.user.id}:${parsed.data.email}:${otp}`));
          console.error('Login unlock email delivery failed');
        }
      } catch (cause) {
        console.error('Could not prepare login unlock challenge', { type: cause instanceof Error ? cause.name : 'UnknownError' });
      } finally {
        await clearTemporaryAuth();
      }
      await respondGenerically(); return;
    }
    if (!code?.success) throw new HttpError(400, 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    const consumed = await admin.rpc('cashflow_consume_challenge', {
      p_user_id: data.user.id, p_purpose: 'login-unlock',
      p_hash: challengeHash(`${data.user.id}:${parsed.data.email}:${code.data}`),
    });
    if (consumed.error) throw consumed.error;
    if (!consumed.data) {
      await clearTemporaryAuth();
      throw new HttpError(401, 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    }
    const resetAttempts = await admin.rpc('cashflow_reset_login_failures', { p_email_key: emailKey });
    if (resetAttempts.error) throw resetAttempts.error;
    await sendPendingSignupWelcome(data.user);
    const user = await publicUser(data.user);
    await adoptSession(req, res, data.session, data.user);
    res.json({ session: { user }, user });
    return;
  }
  if (action==='signin') {
    const emailKey = loginEmailKey(parsed.data.email);
    const lockStatus = await getSupabaseAdmin().rpc('cashflow_login_lock_status', { p_email_key: emailKey });
    if (lockStatus.error) throw lockStatus.error;
    if (Number(lockStatus.data) > 0) {
      res.setHeader('Retry-After', String(lockStatus.data));
      throw new HttpError(429, `กรอกรหัสผ่านผิดเกินจำนวนครั้งที่กำหนด โปรดลองเข้าสู่ระบบในอีก ${Math.ceil(Number(lockStatus.data) / 60)} นาที`, 'login_locked');
    }
    const {data,error}=await auth.auth.signInWithPassword(parsed.data);
    if (error?.code==='email_not_confirmed') {
      const admin=getSupabaseAdmin();
      const found=await admin.from('cashflow_account_snapshot').select('user_id').eq('email',parsed.data.email).maybeSingle();
      if(found.data?.user_id)await sendConfirmation(found.data.user_id,parsed.data.email);
      throw new HttpError(403,'บัญชียังไม่ได้ยืนยันอีเมล ระบบส่งลิงก์ยืนยันฉบับใหม่ให้แล้ว กรุณาตรวจสอบกล่องจดหมายและสแปม');
    }
    if (error || !data.session) {
      if (error && (error.code === 'invalid_credentials' || error.code === 'user_not_found' || error.status === 400)) {
        const failed = await getSupabaseAdmin().rpc('cashflow_record_login_failure', { p_email_key: emailKey });
        if (failed.error) throw failed.error;
        const result = Array.isArray(failed.data) ? failed.data[0] : failed.data;
        if (Number(result?.locked_for_seconds) > 0) {
          if (result?.notify_user) await sendLoginSecurityAlert(parsed.data.email);
          res.setHeader('Retry-After', String(result.locked_for_seconds));
          throw new HttpError(429, 'กรอกรหัสผ่านผิดเกินจำนวนครั้งที่กำหนด โปรดลองเข้าสู่ระบบในอีก 5 นาที หากอีเมลนี้ยืนยันบัญชีแล้ว ระบบได้ส่งอีเมลแจ้งเตือน', 'login_locked');
        }
      }
      throw new HttpError(401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    const resetAttempts = await getSupabaseAdmin().rpc('cashflow_reset_login_failures', { p_email_key: emailKey });
    if (resetAttempts.error) throw resetAttempts.error;
    if (data.user.app_metadata?.account_closure_kind === 'deletion') {
      await auth.auth.signOut();
      throw new HttpError(403, 'บัญชีนี้อยู่ระหว่างรอลบ หากต้องการกู้คืน โปรดขอลิงก์และรหัสกู้คืนจากผู้ดูแลระบบ แล้วใช้อีเมลสำรองที่ยืนยันไว้ภายใน 30 วัน');
    }
    await sendPendingSignupWelcome(data.user);
    const user=await publicUser(data.user); await adoptSession(req,res,data.session,data.user); res.json({session:{user},user}); return;
  }
  if (action==='signup') {
    const signupStartedAt=Date.now();
    const finishGenericSignup=async()=>{
      await new Promise(resolve=>setTimeout(resolve,Math.max(0,2500-(Date.now()-signupStartedAt))));
      res.json({session:null,user:null,confirmationEmailSent:true,signupEmailSent:true});
    };
    if (!isValidPassword(parsed.data.password)) throw new HttpError(400,'รหัสผ่านต้องยาว 8–128 ตัวอักษร และมีตัวอักษรกับตัวเลขอย่างน้อยอย่างละ 1 ตัว');
    const {email,password,displayName}=parsed.data;
    const {data,error}=await auth.auth.signUp({email,password,options:{emailRedirectTo:`${appOrigin()}/api/auth`,data:{full_name:displayName}}});
    if (error) {
      const code=typeof error.code==='string' && /^[a-z_]{1,80}$/.test(error.code) ? error.code : 'unknown';
      console.warn('Signup provider rejected',{code,status:error.status});
      if(code==='email_address_not_authorized')throw new HttpError(503,'ระบบส่งอีเมลยังไม่รองรับอีเมลนี้ กรุณาติดต่อผู้ดูแลเพื่อตั้งค่าการส่งอีเมลยืนยัน');
      if(code==='over_email_send_rate_limit')throw new HttpError(429,'ส่งอีเมลยืนยันครบจำนวนที่อนุญาตแล้ว กรุณารอสักพักก่อนสมัครอีกครั้ง');
      if(code==='over_request_rate_limit' || error.status===429)throw new HttpError(429,'มีคำขอสมัครมากเกินไป กรุณารอสักพักแล้วลองใหม่');
      if(code==='weak_password')throw new HttpError(400,'รหัสผ่านไม่ผ่านข้อกำหนดความปลอดภัย กรุณาใช้รหัสผ่านที่ยาวและเดายากกว่าเดิม');
      if(code==='signup_disabled' || code==='email_provider_disabled')throw new HttpError(503,'ระบบยังไม่เปิดรับสมัครด้วยอีเมล กรุณาติดต่อผู้ดูแล');
      if(code==='captcha_failed')throw new HttpError(400,'ยืนยัน CAPTCHA ไม่สำเร็จ กรุณาติดต่อผู้ดูแลหากไม่มีช่องยืนยันบนหน้าเว็บ');
      throw new HttpError(400,'สมัครสมาชิกไม่สำเร็จ กรุณาติดต่อผู้ดูแล (รหัสอ้างอิง: '+code+')');
    }
    // Supabase may return an obfuscated user for an existing address. Keep the
    // public response identical to a signup awaiting email confirmation.
    if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
      await finishGenericSignup(); return;
    }
    writeCookie(res,{storage:Object.fromEntries(Object.entries(storage).filter(([key])=>key.endsWith('-code-verifier'))),expires:Date.now()+86400000},'oauth',86400);
    if (data.session && data.user) await adoptSession(req,res,data.session,data.user);
    const user=data.session&&data.user ? await publicUser(data.user) : null;
    let confirmationEmailSent=true;
    let signupEmailSent=true;
    if(data.user&&!data.session&&Array.isArray(data.user.identities)&&data.user.identities.length>0){
      await markSignupWelcomePending(data.user);
      confirmationEmailSent=await sendConfirmation(data.user.id,email,displayName);
      if(!confirmationEmailSent)console.error('Signup confirmation email delivery failed');
    }
    if(data.user&&data.session&&Array.isArray(data.user.identities)&&data.user.identities.length>0){
      signupEmailSent=await sendSignupWelcomeEmail(email,displayName);
    }
    if(!data.session){await finishGenericSignup();return;}
    res.json({session:{user},user,confirmationEmailSent,signupEmailSent}); return;
  }
  throw new HttpError(400,'Invalid action');
},{csrf:true});

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '../http/types.js';
import { withGuard, HttpError } from '../http/guard.js';
import { appOrigin, required, supabaseUrl } from '../config/env.js';
import { readCookie, writeCookie, seal } from '../security/cookies.js';
import { publicUser, storeSession, requireUser, revokeSession, type PrivateSession } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { sendSignupConfirmationEmail } from '../services/gmail.js';
const credentials = z.object({ email: z.email().max(254).transform(v=>v.toLowerCase()), password: z.string().min(1).max(128), displayName: z.string().trim().min(2).max(60).regex(/^[^\p{Cc}\p{Cf}]+$/u).optional() });

async function sendConfirmation(userId:string,email:string,displayName?:string):Promise<boolean>{
  const token=seal({purpose:'confirm-email',userId,email,expires:Date.now()+86400000});
  return sendSignupConfirmationEmail(email,displayName,`${appOrigin()}/api/confirm-email?token=${encodeURIComponent(token)}`);
}
export default withGuard(async (req: VercelRequest, res: VercelResponse) => {
  if(req.method==='GET' && req.query.code===undefined && !readCookie<PrivateSession>(req)) { res.json({session:null});return; }
  const verifier = readCookie<{ storage: Record<string,string>; expires: number }>(req,'oauth');
  const storage = verifier && verifier.expires > Date.now() ? { ...verifier.storage } : {} as Record<string,string>;
  const auth = createClient(supabaseUrl(), required('SUPABASE_PUBLISHABLE_KEY'), { auth: {
    flowType:'pkce', autoRefreshToken:false, persistSession:true, detectSessionInUrl:false,
    storage: { getItem: key=>storage[key] ?? null, setItem:(key,value)=>{storage[key]=value;}, removeItem:key=>{delete storage[key];} }
  } });
  if (req.method === 'GET') {
    if (typeof req.query.code === 'string') {
      if (!verifier || verifier.expires < Date.now()) throw new HttpError(400,'การเข้าสู่ระบบหมดเวลา กรุณาลองอีกครั้ง');
      const { data,error } = await auth.auth.exchangeCodeForSession(req.query.code);
      writeCookie(res,null,'oauth');
      if (error || !data.session) throw new HttpError(400,'เข้าสู่ระบบไม่สำเร็จ');
      storeSession(res,data.session); res.status(302); res.setHeader('Location',`${appOrigin()}/app`); res.end(); return;
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
    writeCookie(res,null); writeCookie(res,null,'oauth'); res.json({session:null}); return;
  }
  if (action === 'oauth') {
    const {data,error}=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${appOrigin()}/api/auth`,skipBrowserRedirect:true}});
    if (error) throw new HttpError(400,'เริ่มการเข้าสู่ระบบไม่สำเร็จ');
    writeCookie(res,{storage:Object.fromEntries(Object.entries(storage).filter(([key])=>key.endsWith('-code-verifier'))),expires:Date.now()+600000},'oauth',600); res.json({url:data.url}); return;
  }
  if (!['signin', 'signup'].includes(action)) throw new HttpError(400,'Invalid action');
  const parsed=credentials.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400,'ใช้อีเมลที่ถูกต้อง และรหัสผ่าน 8–128 ตัวอักษร');
  await rateLimit(`auth-${action}`,parsed.data.email,20,600);
  if (action==='signin') {
    const {data,error}=await auth.auth.signInWithPassword(parsed.data);
    if (error?.code==='email_not_confirmed') {
      const admin=getSupabaseAdmin();
      const found=await admin.from('cashflow_account_snapshot').select('user_id').eq('email',parsed.data.email).maybeSingle();
      if(found.data?.user_id)await sendConfirmation(found.data.user_id,parsed.data.email);
      throw new HttpError(403,'บัญชียังไม่ได้ยืนยันอีเมล ระบบส่งลิงก์ยืนยันฉบับใหม่ให้แล้ว กรุณาตรวจสอบกล่องจดหมายและสแปม');
    }
    if (error || !data.session) throw new HttpError(401,'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    const user=await publicUser(data.user); storeSession(res,data.session); res.json({session:{user},user}); return;
  }
  if (action==='signup') {
    if (parsed.data.password.length < 8) throw new HttpError(400,'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
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
    // Supabase deliberately returns an obfuscated user with no identities when an email is
    // already registered. Treating that response as a new signup misleads the user into trying
    // the newly entered password even though the existing password was never changed.
    if(data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
      throw new HttpError(409,'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบหรือใช้เมนูลืมรหัสผ่าน');
    }
    writeCookie(res,{storage:Object.fromEntries(Object.entries(storage).filter(([key])=>key.endsWith('-code-verifier'))),expires:Date.now()+86400000},'oauth',86400);
    if (data.session) storeSession(res,data.session);
    const user=data.user ? await publicUser(data.user) : null;
    let confirmationEmailSent=true;
    if(data.user&&!data.session&&Array.isArray(data.user.identities)&&data.user.identities.length>0){
      confirmationEmailSent=await sendConfirmation(data.user.id,email,displayName);
    }
    res.json({session:data.session ? {user} : null,user,confirmationEmailSent}); return;
  }
  throw new HttpError(400,'Invalid action');
},{csrf:true});

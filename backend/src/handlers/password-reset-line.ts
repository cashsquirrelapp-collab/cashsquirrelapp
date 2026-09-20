import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { withGuard,HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { rateLimit,challengeHash } from '../security/rateLimit.js';
import { sendLineMessagePayload } from '../services/line.js';
export default withGuard(async(req,res)=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const input=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),step:z.enum(['request','verify']).default('request'),code:z.string().regex(/^\d{6}$/).optional(),newPassword:z.string().min(8).max(128).optional()}).safeParse(req.body);
 if(!input.success)throw new HttpError(400,'กรุณาตรวจสอบอีเมล รหัสยืนยัน และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
 const {email,step,code,newPassword}=input.data;
 await rateLimit(`reset-${step}`,email,step==='request'?3:10,900);
 const admin=getSupabaseAdmin();
 const result=await admin.from('cashflow_account_snapshot').select('user_id,notif_settings').eq('email',email).maybeSingle();
 if(result.error)throw result.error; const row=result.data;
 if(step==='request') {
  if(row?.notif_settings?.lineUserId) {
   const otp=String(randomInt(100000,1000000));
   const saved=await admin.from('cashflow_challenges').upsert({user_id:row.user_id,purpose:'reset',code_hash:challengeHash(otp),expires_at:new Date(Date.now()+900000).toISOString(),attempts:0});
   if(saved.error)throw saved.error;
   await sendLineMessagePayload(row.notif_settings.lineUserId,{type:'text',text:`🔐 รหัสตั้งรหัสผ่านใหม่: ${otp}\nหมดอายุใน 15 นาที ใช้ได้ครั้งเดียว หากไม่ได้ขอเอง ให้ละเว้นข้อความนี้`});
  }
  // Identical response for missing accounts, unlinked accounts, and failed delivery.
  res.json({ok:true});return;
 }
 if(!row||!code||!newPassword)throw new HttpError(400,'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
 const consumed=await admin.rpc('cashflow_consume_challenge',{p_user_id:row.user_id,p_purpose:'reset',p_hash:challengeHash(code)});
 if(consumed.error)throw consumed.error; if(!consumed.data)throw new HttpError(400,'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
 // Consume before changing the password: retries cannot reuse the same challenge.
 const revoked=await admin.rpc('cashflow_revoke_user_sessions',{p_user_id:row.user_id});if(revoked.error)throw revoked.error;
 const changed=await admin.auth.admin.updateUserById(row.user_id,{password:newPassword});
 if(changed.error)throw new HttpError(503,'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาขอรหัสยืนยันใหม่');
 // Every existing BFF session was revoked before the password update.
 res.json({ok:true});
},{csrf:true});

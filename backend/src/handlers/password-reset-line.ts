import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { withGuard,HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { rateLimit,challengeHash } from '../security/rateLimit.js';
import { sendGmailEmail } from '../services/gmail.js';
export default withGuard(async(req,res)=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const input=z.object({email:z.email().max(254).transform(v=>v.toLowerCase()),step:z.enum(['request','verify']).default('request'),code:z.string().regex(/^\d{6}$/).optional(),newPassword:z.string().min(8).max(128).optional()}).safeParse(req.body);
 if(!input.success)throw new HttpError(400,'กรุณาตรวจสอบอีเมล รหัสยืนยัน และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
 const {email,step,code,newPassword}=input.data;
 await rateLimit(`reset-${step}`,email,step==='request'?3:10,900);
 const admin=getSupabaseAdmin();
 const result=await admin.from('cashflow_account_snapshot').select('user_id').eq('email',email).maybeSingle();
 if(result.error)throw result.error; const row=result.data;
 if(step==='request') {
  if(row) {
   const otp=String(randomInt(100000,1000000));
   const saved=await admin.from('cashflow_challenges').upsert({user_id:row.user_id,purpose:'reset',code_hash:challengeHash(otp),expires_at:new Date(Date.now()+300000).toISOString(),attempts:0});
   if(saved.error)throw saved.error;
   const delivered=await sendGmailEmail(email,'รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่',`
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#2d2118">
      <div style="font-size:14px;font-weight:700;color:#e65f2b">กระรอกตุนเงิน</div>
      <h1 style="font-size:24px;margin:16px 0 8px">ตั้งรหัสผ่านใหม่</h1>
      <p style="font-size:15px;line-height:1.7;color:#6f6258">ใช้รหัสยืนยันด้านล่างเพื่อดำเนินการต่อ รหัสนี้ใช้ได้ครั้งเดียวและจะหมดอายุใน 5 นาที</p>
      <div style="margin:24px 0;padding:18px;border-radius:14px;background:#fff4e8;text-align:center;font-size:34px;font-weight:700;letter-spacing:10px;color:#9a441f">${otp}</div>
      <p style="font-size:13px;line-height:1.6;color:#897b70">หากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องดำเนินการใด ๆ และอย่าส่งต่อรหัสนี้ให้ผู้อื่น</p>
    </div>`);
   if(!delivered)await admin.from('cashflow_challenges').delete().eq('user_id',row.user_id).eq('purpose','reset');
  }
  // Keep one response for missing accounts and delivery failures to prevent account discovery.
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

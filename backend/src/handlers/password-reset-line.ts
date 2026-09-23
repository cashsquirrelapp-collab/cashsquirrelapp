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
   const delivered=await sendGmailEmail(email,'รหัสยืนยันการตั้งรหัสผ่านใหม่ | Krarok Tunngern',`
    <!doctype html>
    <html lang="th">
      <body style="margin:0;padding:0;background:#f5f3ef;font-family:Arial,'Noto Sans Thai',sans-serif;color:#29231f">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">รหัสยืนยันของคุณมีอายุ 5 นาที กรุณาอย่าเปิดเผยรหัสนี้แก่ผู้อื่น</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef;padding:32px 12px">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e8e1d8;border-radius:18px;overflow:hidden">
              <tr>
                <td style="padding:22px 30px;background:#2d2118">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.2px">Krarok Tunngern</td>
                      <td align="right" style="color:#f6b977;font-size:12px;font-weight:700;letter-spacing:1px">SECURE ACCESS</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 30px 18px">
                  <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;color:#a65328;text-transform:uppercase">ยืนยันตัวตน</div>
                  <h1 style="margin:10px 0 12px;font-size:25px;line-height:1.35;color:#29231f">ตั้งรหัสผ่านใหม่</h1>
                  <p style="margin:0;font-size:15px;line-height:1.75;color:#655b53">เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ กรุณาใช้รหัสยืนยัน 6 หลักด้านล่างเพื่อดำเนินการต่อ</p>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 30px 20px">
                  <div style="border:1px solid #efd7c1;border-radius:14px;background:#fff8f1;padding:24px 16px;text-align:center">
                    <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#806f61;text-transform:uppercase">Verification code</div>
                    <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:36px;line-height:1.2;font-weight:700;letter-spacing:12px;color:#9a441f">${otp}</div>
                    <div style="margin-top:12px;font-size:12px;color:#806f61">รหัสจะหมดอายุภายใน 5 นาที และใช้ได้เพียงครั้งเดียว</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:4px 30px 34px">
                  <div style="border-left:3px solid #d97745;padding:2px 0 2px 14px">
                    <div style="font-size:13px;font-weight:700;color:#403731">เพื่อความปลอดภัย</div>
                    <div style="margin-top:5px;font-size:13px;line-height:1.65;color:#74685f">เจ้าหน้าที่ของ Krarok Tunngern จะไม่ขอรหัสนี้จากคุณ หากคุณไม่ได้เป็นผู้ส่งคำขอ สามารถละเว้นอีเมลฉบับนี้ได้ทันที</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 30px;background:#faf8f5;border-top:1px solid #eee8e1;text-align:center;color:#8b8078;font-size:11px;line-height:1.6">
                  อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br>
                  © Krarok Tunngern · ระบบจัดการกระแสเงินสดสำหรับบุคคลและองค์กร
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>`);
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

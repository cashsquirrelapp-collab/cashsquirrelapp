import { withGuard,HttpError } from '../http/guard.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { appOrigin } from '../config/env.js';
import { unseal } from '../security/cookies.js';

type Confirmation = { purpose: 'confirm-email'; userId: string; email: string; expires: number };

export default withGuard(async(req,res)=>{
  if(req.method!=='GET')throw new HttpError(405,'Method not allowed');
  const token=typeof req.query.token==='string'?req.query.token:'';
  const confirmation=unseal<Confirmation>(token);
  if(!confirmation||confirmation.purpose!=='confirm-email'||confirmation.expires<Date.now())throw new HttpError(400,'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ');
  const admin=getSupabaseAdmin();
  const current=await admin.auth.admin.getUserById(confirmation.userId);
  if(current.error||current.data.user.email?.toLowerCase()!==confirmation.email.toLowerCase())throw new HttpError(400,'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ');
  if(!current.data.user.email_confirmed_at){
    const updated=await admin.auth.admin.updateUserById(confirmation.userId,{email_confirm:true});
    if(updated.error)throw new HttpError(503,'ยืนยันอีเมลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  res.status(302);res.setHeader('Location',`${appOrigin()}/?emailConfirmed=1`);res.end();
});

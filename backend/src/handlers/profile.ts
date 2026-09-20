import { z } from 'zod';
import { getSupabaseAdmin } from '../config/supabase.js';
import { HttpError, withGuard } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';

export default withGuard(async (req,res) => {
  if (!['GET','POST'].includes(req.method || '')) throw new HttpError(405,'Method not allowed');
  const user=await requireUser(req,res);
  if (req.headers['x-account-id']!==user.id) throw new HttpError(401,'บัญชีเปลี่ยน กรุณาโหลดหน้าใหม่');
  await rateLimit('profile',user.id,30,60);
  const db=getSupabaseAdmin();
  if (req.method==='GET') {
    const result=await db.rpc('cashflow_profile_get',{p_actor:user.id});
    if (result.error || !result.data) throw result.error || new HttpError(404,'ไม่พบโปรไฟล์');
    res.json(result.data); return;
  }
  const input=z.object({displayName:z.string().trim().min(2).max(60)}).strict().safeParse(req.body);
  if (!input.success) throw new HttpError(400,'ชื่อต้องมี 2–60 ตัวอักษร');
  const result=await db.rpc('cashflow_profile_update',{p_actor:user.id,p_display_name:input.data.displayName});
  if (result.error) throw new HttpError(400,'บันทึกชื่อไม่สำเร็จ');
  res.json(result.data);
},{csrf:true});

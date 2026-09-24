import { withGuard,HttpError } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { rateLimit } from '../security/rateLimit.js';
import { supabaseAdmin } from '../config/supabase.js';
import { sendLineMessageToEmail } from '../services/line.js';
import { buildDigestFlexMessage,findJobsNeedingAttention,sendDigestEmail } from './send-overdue-digest.js';

export default withGuard(async(req,res)=>{
  if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
  const user=await requireUser(req,res);
  await rateLimit('credit-alert',user.id,5,600);
  const result=await supabaseAdmin.from('cashflow_account_snapshot').select('email,jobs,notif_settings').eq('user_id',user.id).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)throw new HttpError(404,'ไม่พบข้อมูลบัญชี');
  const jobs=findJobsNeedingAttention(result.data.jobs||[]);
  if(jobs.length===0)throw new HttpError(400,'ยังไม่มีรายการเครดิตเทอมที่เลยกำหนด ครบกำหนดวันนี้ หรือครบภายใน 2 วัน');
  const settings=result.data.notif_settings||{};
  const email=result.data.email as string;
  const recipient=(settings.alertEmail as string|undefined)||email;
  const [emailOk,lineOk]=await Promise.all([
    sendDigestEmail(recipient,jobs),
    sendLineMessageToEmail(email,buildDigestFlexMessage(jobs),settings.lineUserId as string|undefined).catch(()=>false),
  ]);
  if(!emailOk&&!lineOk)throw new HttpError(503,'ส่งการแจ้งเตือนไม่สำเร็จ กรุณาตรวจสอบอีเมลและการเชื่อมต่อ LINE');
  res.json({ok:true,emailSent:emailOk,lineSent:lineOk,count:jobs.length});
},{csrf:true});

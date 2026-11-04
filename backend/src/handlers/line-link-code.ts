import { randomBytes } from 'node:crypto';
import { withGuard,HttpError } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { rateLimit,challengeHash } from '../security/rateLimit.js';
import { sendLineMessagePayload } from '../services/line.js';
import { buildLineDisconnected } from '../services/lineLinkCards.js';
import { resetLineMenu } from '../services/lineRichMenus.js';
import { hasConsent, saveConsent } from '../repositories/consents.js';
export default withGuard(async(req,res)=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const user=await requireUser(req,res);
 if(req.headers['x-account-id']!==user.id)throw new HttpError(401,'Account mismatch'); const admin=getSupabaseAdmin();
 if(req.body?.action==='disconnect') {
  // Read which LINE chat was linked before removing it, so that chat can be told it is no longer
  // connected (owner, 2026-10-22). The removal never waits on LINE and never fails because of it.
  const link=await admin.from('cashflow_line_links').select('line_user_id').eq('user_id',user.id).maybeSingle();if(link.error)throw link.error;
  const result=await admin.from('cashflow_line_links').delete().eq('user_id',user.id);if(result.error)throw result.error;
  const challenge=await admin.from('cashflow_challenges').delete().eq('user_id',user.id).eq('purpose','link');if(challenge.error)throw challenge.error;
  let lineNotified=false;
  const lineUserId=link.data?.line_user_id;
  if(typeof lineUserId==='string'&&lineUserId){
   try{lineNotified=await sendLineMessagePayload(lineUserId,buildLineDisconnected());}
   catch{console.error('line-link-code: disconnect notice was not sent');}
   // The disconnected chat goes back to LINE's default menu (an admin's menu has แนบเอกสาร).
   await resetLineMenu(lineUserId);
  }
  // Disconnecting is withdrawing the LINE consent (shared/consents.ts); the link is already gone if this fails.
  try{await saveConsent(user.id,'line',false);}catch{console.error('line-link-code: consent withdrawal was not recorded');}
  res.json({ok:true,lineNotified});return;
 }
 // A code only after the account agreed to connecting LINE (owner, 2026-11-05): the app asks just before.
 if(!(await hasConsent(user.id,'line')))throw new HttpError(428,'กรุณาอ่านและกดยินยอมการเชื่อมต่อ LINE ก่อน','line_consent_required');
 await rateLimit('line-link',user.id,5,900);
 // A link code is a short-lived proof that the signed-in web account controls the
 // LINE chat that sends it back. Creating a new code replaces the previous hash,
 // and the database claim consumes it atomically, so it can only be used once.
 const code=randomBytes(8).toString('hex').toUpperCase(); const expiresAt=new Date(Date.now()+300000).toISOString();
 const saved=await admin.from('cashflow_challenges').upsert({user_id:user.id,purpose:'link',code_hash:challengeHash(code),expires_at:expiresAt,attempts:0});
 if(saved.error)throw saved.error;res.json({code,expiresAt});
},{csrf:true});

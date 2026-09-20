import { randomBytes } from 'node:crypto';
import { withGuard,HttpError } from '../http/guard.js';
import { requireUser } from '../security/session.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { rateLimit,challengeHash } from '../security/rateLimit.js';
export default withGuard(async(req,res)=>{
 if(req.method!=='POST')throw new HttpError(405,'Method not allowed');
 const user=await requireUser(req,res);
 if(req.headers['x-account-id']!==user.id)throw new HttpError(401,'Account mismatch'); const admin=getSupabaseAdmin();
 if(req.body?.action==='disconnect') {
  const result=await admin.from('cashflow_line_links').delete().eq('user_id',user.id);if(result.error)throw result.error;
  const challenge=await admin.from('cashflow_challenges').delete().eq('user_id',user.id).eq('purpose','link');if(challenge.error)throw challenge.error;
  res.json({ok:true});return;
 }
 await rateLimit('line-link',user.id,5,900);
 const code=randomBytes(8).toString('hex').toUpperCase(); const expiresAt=new Date(Date.now()+900000).toISOString();
 const saved=await admin.from('cashflow_challenges').upsert({user_id:user.id,purpose:'link',code_hash:challengeHash(code),expires_at:expiresAt,attempts:0});
 if(saved.error)throw saved.error;res.json({code,expiresAt});
},{csrf:true});

import { getSupabaseAdmin } from '../config/supabase.js';
import { notificationPreferences } from '../../../shared/validation.js';
export async function accountSnapshot(userId:string) {
 const {data,error}=await getSupabaseAdmin().from('cashflow_account_snapshot').select('*').eq('user_id',userId).single();
 if(error) throw error; return data;
}
export async function publicSnapshot(userId:string) {
 const snapshot=await accountSnapshot(userId);
 const versions=snapshot.versions; delete snapshot.versions;
 snapshot.notif_settings={...notificationPreferences.parse(snapshot.notif_settings),lineUserId:snapshot.notif_settings.lineUserId||null};
 delete snapshot.email; delete snapshot.user_id;
 return {snapshot,versions};
}
export async function patchPrivate(userId:string,patch:Record<string,unknown>,remove:string[]=[]) {
 const {error}=await getSupabaseAdmin().rpc('cashflow_patch_private',{p_user_id:userId,p_patch:patch,p_remove:remove}); if(error) throw error;
}
export async function insertRecord(table:'cashflow_jobs'|'cashflow_expenses',userId:string,record:{id:string},idempotent=false) {
 const query=getSupabaseAdmin().from(table);
 const row={user_id:userId,id:record.id,data:record};
 const result=idempotent ? await query.upsert(row,{onConflict:'user_id,id',ignoreDuplicates:true}) : await query.insert(row);
 if(result.error)throw result.error;
}

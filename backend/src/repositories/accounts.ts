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
export async function insertRecord<T extends {id:string}>(table:'cashflow_jobs'|'cashflow_expenses',userId:string,record:T,idempotent=false):Promise<{record:T;inserted:boolean}> {
 const query=getSupabaseAdmin().from(table);
 const row={user_id:userId,id:record.id,data:record};
 if(!idempotent){
  const result=await query.insert(row); if(result.error)throw result.error;
  return {record,inserted:true};
 }
 // A card and its editor may confirm concurrently with different field values.
 // Keep one row and return the actual winner, never a receipt for the losing draft.
 const result=await query.upsert(row,{onConflict:'user_id,id',ignoreDuplicates:true}).select('data').maybeSingle();
 if(result.error)throw result.error;
 if(result.data?.data)return {record:result.data.data as T,inserted:true};
 const existing=await getSupabaseAdmin().from(table).select('data').eq('user_id',userId).eq('id',record.id).maybeSingle();
 if(existing.error)throw existing.error;
 if(!existing.data?.data || existing.data.data.id!==record.id)throw new Error('Confirmed record unavailable');
 return {record:existing.data.data as T,inserted:false};
}

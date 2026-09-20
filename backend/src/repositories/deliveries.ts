import { getSupabaseAdmin } from '../config/supabase.js';
export async function claimDelivery(key:string):Promise<boolean> {
 const result=await getSupabaseAdmin().from('cashflow_delivery_claims').insert({key});
 if(result.error?.code==='23505')return false;if(result.error)throw result.error;return true;
}
export async function releaseDelivery(key:string) {
 const result=await getSupabaseAdmin().from('cashflow_delivery_claims').delete().eq('key',key);if(result.error)throw result.error;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
/** Signed-in is not enough: paid providers and service-role work require the investigator role. */
export async function requireInvestigator(db:SupabaseClient<Database>,userId:string){
  const r=await db.rpc('has_role',{_user_id:userId,_role:'investigator'});
  if(r.error||r.data!==true)throw new Error('هذا الحساب غير مصرّح له');
}

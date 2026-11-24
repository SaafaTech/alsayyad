import type { Db } from './engine.server';
import { clusterCampaigns } from './campaigns';
/** Recompute campaigns with service privileges; replace_campaigns runs in one transaction. */
export async function rebuildCampaignsNow(){
  const { supabaseAdmin:admin } = await import('@/integrations/supabase/client.server');
  const [links,analyses,entities,hunts]=await Promise.all([admin.from('links').select('id,url,domain,platform,parent_link_id,maps_phone,first_seen_at,hunt_id'),admin.from('analyses').select('link_id,level,phones_found,hosting,page_title,impersonated_entity_id,created_at'),admin.from('entities').select('id,name_ar,official_phones,official_domains'),admin.from('hunts').select('id').eq('source','expert_sample')]);
  if(links.error||analyses.error||entities.error||hunts.error)throw new Error('تعذر قراءة بيانات التجميع');
  const drafts=clusterCampaigns({links:links.data,analyses:analyses.data,entities:entities.data,excludedHuntIds:new Set(hunts.data.map(h=>h.id))});
  const r=await admin.rpc('replace_campaigns',{_campaigns:drafts as never});if(r.error)throw new Error('تعذر حفظ الحملات');
  return drafts.length;
}
/** Debounced: skips when a rebuild started less than 30 seconds ago. Never throws. */
export async function maybeRebuildCampaigns(db:Db){
  try{
    const now=Date.now();const {data}=await db.from('engine_cache').select('expires_at').eq('key','campaigns-rebuilt').maybeSingle();
    if(data&&Date.parse(data.expires_at)>now)return;
    await db.from('engine_cache').upsert({key:'campaigns-rebuilt',value:{at:new Date(now).toISOString()},expires_at:new Date(now+30000).toISOString()},{onConflict:'key'});
    await rebuildCampaignsNow();
  }catch(e){console.warn('Campaign rebuild skipped:',e instanceof Error?e.message:'unknown');}
}

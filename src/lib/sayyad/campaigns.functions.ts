import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requireData } from './engine.server';
import { rebuildCampaignsNow } from './campaigns.server';
export const listCampaigns=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const db=context.supabase;const [c,l]=await Promise.all([db.from('campaigns').select('*').order('link_count',{ascending:false}),db.from('campaign_links').select('*')]);
  return {campaigns:requireData(c),links:requireData(l)};
});
export const rebuildCampaigns=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async()=>({count:await rebuildCampaignsNow()}));

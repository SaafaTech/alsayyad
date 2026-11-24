import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requireData, must, addLink, entities } from './engine.server';
import { sampleUrl } from './expert';
/** Queue chosen expert rows (caller's own rows only, by RLS) as one expert_sample hunt. */
export const scanExpertSample=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({ids:z.array(z.string().uuid()).min(1).max(1000)})).handler(async({data,context})=>{
  const db=context.supabase;
  const rows=requireData(await db.from('expert_links').select('id,url,excluded_reason,link_id').in('id',data.ids).eq('created_by',context.userId)).filter(r=>!r.excluded_reason&&!r.link_id);
  if(!rows.length)return {queued:0};
  const hunt=requireData(await db.from('hunts').insert({phrase:'عينة المختص',source:'expert_sample',results_count:rows.length,created_by:context.userId}).select('id').single());
  const es=await entities(db);let queued=0;
  for(const r of rows){let link=null;try{link=await addLink(db,{url:sampleUrl(r.url),hunt_id:hunt.id},es);}catch{link=null;}
    if(link){must(await db.from('expert_links').update({link_id:link.id}).eq('id',r.id));queued++;}}
  return {queued};
});

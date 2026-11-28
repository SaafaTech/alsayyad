import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { requireInvestigator } from './role.server';
import { must, requireData } from './engine.server';
import { recheckSummary, requeueRecheck } from './auto.server';
async function requireOwner(db:Parameters<typeof requireInvestigator>[0],userId:string){
  await requireInvestigator(db,userId);
  const s=must(await db.from('auto_hunt_settings').select('owner_user_id').eq('id',true).maybeSingle());
  if(s?.owner_user_id!==userId)throw new Error('الإعداد متاح لصاحب الحساب المالك فقط');
}
/** Owner only: how many old unscannable links can still be re-checked through Zyte. */
export const getRecheckState=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  await requireOwner(context.supabase,context.userId);return {remaining:await recheckSummary()};
});
/** Owner only: re-queue at most 15 eligible links for a one-time Zyte (AE) re-check by the worker. */
export const startRecheck=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  await requireOwner(context.supabase,context.userId);return {queued:await requeueRecheck()};
});
export const getAutoState=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const db=context.supabase;await requireInvestigator(db,context.userId);
  const since=new Date(Date.now()-86400000).toISOString();
  const [s,today,runs,day,camps,zyte]=await Promise.all([db.from('auto_hunt_settings').select('*').eq('id',true).maybeSingle(),db.rpc('auto_links_today'),db.from('auto_runs').select('*').order('started_at',{ascending:false}).limit(10),db.from('auto_runs').select('kind,new_links,scanned,red,yellow,started_at,finished_at').gte('started_at',since),db.from('campaigns').select('id').gte('first_seen_at',since),db.rpc('zyte_today')]);
  const settings=must(s);const d=requireData(day);
  return {settings,isOwner:settings?.owner_user_id===context.userId,today:must(today) ?? 0,zyteToday:must(zyte) ?? 0,runs:requireData(runs),
    day:{new_links:d.reduce((a,r)=>a+r.new_links,0),scanned:d.reduce((a,r)=>a+r.scanned,0),red:d.reduce((a,r)=>a+r.red,0),yellow:d.reduce((a,r)=>a+r.yellow,0),campaigns:requireData(camps).length,last:d.map(r=>r.finished_at ?? r.started_at).sort().at(-1) ?? null}};
});
export const setAutoSettings=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({enabled:z.boolean(),daily_cap:z.number().int().min(10).max(500),zyte_daily_cap:z.number().int().min(0).max(500)})).handler(async({data,context})=>{
  await requireInvestigator(context.supabase,context.userId);
  const r=requireData(await context.supabase.from('auto_hunt_settings').update(data).eq('id',true).eq('owner_user_id',context.userId).select('id'));
  if(!r.length)throw new Error('الإعداد متاح لصاحب الحساب المالك فقط');return true;
});

import { search, ctWatch, must, requireData, type Db } from './engine.server';
import { scanLinkCore, pollScanCore } from './scan.server';
import { createEvidenceCore } from './evidence.server';
import { maybeRebuildCampaigns } from './campaigns.server';
import { autoAllowed, autoGate, seenFrom, ctAutoKeywords, withoutExpertRows } from './auto';
import { canCreateEvidence } from './evidence';
import type { Json } from '@/integrations/supabase/types';
type Kind='search'|'ct'|'worker';
const CURSOR={search:'auto-search-cursor',ct:'auto-ct-cursor'} as const;
const CHUNK=2;
async function admin():Promise<Db>{return (await import('@/integrations/supabase/client.server')).supabaseAdmin as unknown as Db;}
const msg=(e:unknown)=>e instanceof Error?e.message.slice(0,200):'unknown';
async function settings(db:Db){return must(await db.from('auto_hunt_settings').select('enabled,daily_cap,owner_user_id').eq('id',true).maybeSingle());}
async function expertHuntIds(db:Db){return new Set(requireData(await db.from('hunts').select('id').eq('source','expert_sample')).map(h=>h.id));}
/** Gate built from already-analysed links (expert samples excluded) and today's automatic count. */
async function gate(db:Db,cap:number){
  const expert=await expertHuntIds(db);
  const rows=requireData(await db.from('links').select('url,domain,final_url,hunt_id,analyses!inner(link_id)'));
  const today=must(await db.rpc('auto_links_today')) ?? 0;
  return autoGate(seenFrom(withoutExpertRows(rows,expert)),today,cap);
}
async function startRun(db:Db,kind:Kind){return requireData(await db.from('auto_runs').insert({kind}).select('id').single()).id;}
async function finishRun(db:Db,id:string,patch:{new_links?:number;scanned?:number;red?:number;yellow?:number;errors?:string[];status:string;done?:boolean}){
  const {done=true,errors,...rest}=patch;
  must(await db.from('auto_runs').update({...rest,...(errors?{errors:errors as unknown as Json}:{}),...(done?{finished_at:new Date().toISOString()}:{})}).eq('id',id));
}
/** One chunk of a search/CT sweep. The cursor lives in engine_cache (service only) so later worker runs continue it. */
async function step(db:Db,kind:'search'|'ct',owner:string,cap:number){
  const row=must(await db.from('engine_cache').select('value').eq('key',CURSOR[kind]).maybeSingle());
  if(!row)return false;
  const cur=row.value as {i:number;run_id:string};
  const items=kind==='search'
    ?requireData(await db.from('search_phrases').select('phrase').eq('active',true).order('created_at')).map(p=>p.phrase)
    :ctAutoKeywords(requireData(await db.from('entities').select('brand_keywords')));
  const g=await gate(db,cap);const run=requireData(await db.from('auto_runs').select('new_links,errors').eq('id',cur.run_id).single());
  let added=0;const errors=Array.isArray(run.errors)?[...run.errors as string[]]:[];
  const key=process.env['SERPER_API_KEY'];
  for(const item of items.slice(cur.i,cur.i+CHUNK)){
    if(g.full)break;
    try{
      if(kind==='search'){if(!key)throw new Error('SERPER_API_KEY missing');for(const src of ['google','maps'] as const)added+=(await search(db,owner,item,src,key,{trigger:'auto',allow:u=>g.allow(u)})).results_count;}
      else added+=(await ctWatch(db,owner,item,{trigger:'auto',allow:u=>g.allow(u)})).found;
    }catch(e){errors.push(`${item}: ${msg(e)}`);}
  }
  const next=cur.i+CHUNK,over=g.full||next>=items.length;
  await finishRun(db,cur.run_id,{new_links:run.new_links+added,errors,status:over?(g.full?'cap_reached':'done'):'running',done:over});
  if(over)must(await db.from('engine_cache').delete().eq('key',CURSOR[kind]));
  else must(await db.from('engine_cache').update({value:{i:next,run_id:cur.run_id}}).eq('key',CURSOR[kind]));
  return true;
}
/** Starts a search or CT sweep and runs its first chunk. */
export async function startSweep(kind:'search'|'ct'){
  const db=await admin();const s=await settings(db);if(!autoAllowed(s))return {skipped:'disabled'};
  const run_id=await startRun(db,kind);
  must(await db.from('engine_cache').upsert({key:CURSOR[kind],value:{i:0,run_id},expires_at:new Date(Date.now()+20*3600000).toISOString()},{onConflict:'key'}));
  await step(db,kind,s.owner_user_id,s.daily_cap);
  return {run_id};
}
/** Continues sweeps, polls running auto scans, starts up to 3 new ones and files evidence for yellow/red. */
export async function runWorker(budgetMs=50000){
  const t0=Date.now(),left=()=>budgetMs-(Date.now()-t0);
  const db=await admin();const s=await settings(db);if(!autoAllowed(s))return {skipped:'disabled'};
  const cursors=requireData(await db.from('engine_cache').select('key').in('key',[CURSOR.search,CURSOR.ct]));
  const autoHunts=requireData(await db.from('hunts').select('id').eq('trigger','auto').neq('source','expert_sample')).map(h=>h.id);
  const queue=autoHunts.length?requireData(await db.from('links').select('id,status,first_seen_at').in('hunt_id',autoHunts).in('status',['pending','scanning']).order('first_seen_at')):[];
  if(!cursors.length&&!queue.length)return {skipped:'empty'};
  const run=await startRun(db,'worker');const errors:string[]=[];let scanned=0,red=0,yellow=0;
  for(const c of cursors)try{await step(db,c.key===CURSOR.search?'search':'ct',s.owner_user_id,s.daily_cap);}catch(e){errors.push(msg(e));}
  const finished:string[]=[];
  for(const l of queue.filter(l=>l.status==='scanning')){if(left()<15000)break;try{const r=await pollScanCore({link_id:l.id},{supabase:db});if(r.status!=='scanning')finished.push(l.id);}catch(e){errors.push(msg(e));}}
  let started=0;
  for(const l of queue.filter(l=>l.status==='pending')){if(started>=3||left()<10000)break;try{const r=await scanLinkCore(db,l.id);if(r.status==='waiting')break;if(r.started)started++;else if(r.status!=='scanning')finished.push(l.id);}catch(e){errors.push(msg(e));}}
  for(const id of finished){
    const a=must(await db.from('analyses').select('level').eq('link_id',id).maybeSingle());if(!a)continue;scanned++;
    if(a.level==='red')red++;else if(a.level==='yellow')yellow++;
    if(canCreateEvidence(a.level)&&left()>5000)try{await createEvidenceCore(db,s.owner_user_id,id,{actor:s.owner_user_id,detail:'auto'});}catch(e){errors.push(msg(e));}
  }
  if(finished.length)await maybeRebuildCampaigns(db);
  await finishRun(db,run,{scanned,red,yellow,errors,status:errors.length?'partial':'done'});
  return {run_id:run,scanned,started};
}

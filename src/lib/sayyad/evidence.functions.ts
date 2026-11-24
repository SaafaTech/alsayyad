import { requireInvestigator } from './role.server';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Database, Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkIdSchema } from './rules';
import { must, requireData, cfBase, cfGetHeaders, providerFetch } from './engine.server';
import { asksFromReasons, canCreateEvidence, isUrgent, noScreenshotNote, urgentReason, type ChainNode, type EvidenceSnapshot } from './evidence';
const idSchema=z.object({evidence_id:z.string().uuid()});
async function sha256(bytes:Uint8Array){const d=await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const listEvidence=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>
  requireData(await context.supabase.from('evidence').select('id,case_no,link_id,created_at,urgent,review_status,case_status,snapshot,screenshot_path,screenshot_sha256,captured_at').order('created_at',{ascending:false})));
export const getEvidence=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async({data,context})=>{
  const db=context.supabase;
  const ev=requireData(await db.from('evidence').select('*').eq('id',data.evidence_id).single());
  const log=requireData(await db.from('custody_log').select('*').eq('evidence_id',ev.id).order('at'));
  return {evidence:ev,custody:log.map(l=>({...l,by_system:l.actor===null}))};
});
// Creation runs with service privileges only after the caller's own session proves the link qualifies.
export const createEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);
  const db=context.supabase;
  const existing=must(await db.from('evidence').select('id').eq('link_id',data.link_id).maybeSingle());if(existing)return {id:existing.id,created:false};
  const link=requireData(await db.from('links').select('*').eq('id',data.link_id).single());
  const a=must(await db.from('analyses').select('*').eq('link_id',link.id).maybeSingle());
  if(!a||!canCreateEvidence(a.level))throw new Error('يُسمح بملف الأدلة للروابط المصنّفة مشبوه أو خطر فقط');
  const entity=a.impersonated_entity_id?must(await db.from('entities').select('*').eq('id',a.impersonated_entity_id).maybeSingle()):null;
  const hunt=link.hunt_id?must(await db.from('hunts').select('phrase,source').eq('id',link.hunt_id).maybeSingle()):null;
  const node=async(l:{id:string;url:string;domain:string;status:string}):Promise<ChainNode>=>{const x=must(await db.from('analyses').select('score,level').eq('link_id',l.id).maybeSingle());return {url:l.url,domain:l.domain,status:l.status,score:x?.score ?? null,level:x?.level ?? null};};
  const parentLink=link.parent_link_id?must(await db.from('links').select('id,url,domain,status').eq('id',link.parent_link_id).maybeSingle()):null;
  const childLinks=requireData(await db.from('links').select('id,url,domain,status').eq('parent_link_id',link.id));
  const hosting=(a.hosting && typeof a.hosting==='object' && !Array.isArray(a.hosting)?a.hosting:null) as EvidenceSnapshot['hosting'];
  const pageStatus=hosting?.status ?? null;
  const urgent=isUrgent(a.level,pageStatus);
  // Screenshot: only from Cloudflare's report, original bytes stored unchanged.
  let bytes:Uint8Array<ArrayBuffer>|null=null;
  const account=process.env['CLOUDFLARE_ACCOUNT_ID'],token=process.env['CLOUDFLARE_API_TOKEN'];
  if(link.scan_uuid&&account&&token)try{const r=await providerFetch(`${cfBase(account)}/screenshots/${link.scan_uuid}.png`,{headers:cfGetHeaders(token)});if(r.ok&&r.headers.get('content-type')?.includes('image/png')){const b=new Uint8Array(await r.arrayBuffer());if(b.length>0&&b.length<=10000000)bytes=b;}}catch{bytes=null;}
  const snapshot:EvidenceSnapshot={
    link:{url:link.url,final_url:link.final_url,domain:link.domain,platform:link.platform,rank:link.rank,is_ad:link.is_ad,title:link.title,snippet:link.snippet,maps_phone:link.maps_phone,status:link.status,scan_error:link.scan_error,first_seen_at:link.first_seen_at,scan_started_at:link.scan_started_at},
    analysis:{score:a.score,level:a.level,reasons_ar:a.reasons_ar,ai_summary_ar:a.ai_summary_ar,domain_age_days:a.domain_age_days,age_source:a.age_source,phones_found:a.phones_found,outgoing_domains:a.outgoing_domains,page_title:a.page_title,created_at:a.created_at,...asksFromReasons(a.reasons_ar,(a.signals ?? {}) as Record<string,unknown>)},
    hosting,whois:(a.whois && typeof a.whois==='object' && !Array.isArray(a.whois)?a.whois:null) as import('./early').Whois|null,entity:entity?{name_ar:entity.name_ar,name_en:entity.name_en,official_domains:entity.official_domains,official_phones:entity.official_phones}:null,
    source:{phrase:hunt?.phrase ?? null,source:hunt?.source ?? null,rank:link.rank,is_ad:link.is_ad},
    chain:{parent:parentLink?await node(parentLink):null,children:await Promise.all(childLinks.map(node))},
    page_status:pageStatus,urgent_reason:urgent?urgentReason:null,screenshot_note:bytes?null:noScreenshotNote,
  };
  const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
  let path:string|null=null,hash:string|null=null;
  if(bytes){path=`${link.id}/${Date.now()}.png`;hash=await sha256(bytes);const up=await supabaseAdmin.storage.from('evidence').upload(path,bytes,{contentType:'image/png',upsert:false});if(up.error){path=null;hash=null;snapshot.screenshot_note=noScreenshotNote;}}
  const ins=await supabaseAdmin.from('evidence').insert({link_id:link.id,created_by:context.userId,screenshot_path:path,screenshot_sha256:hash,captured_at:bytes&&path?new Date().toISOString():null,snapshot:snapshot as unknown as Json,urgent}).select('id').single();
  if(ins.error){const again=must(await db.from('evidence').select('id').eq('link_id',link.id).maybeSingle());if(path)await supabaseAdmin.storage.from('evidence').remove([path]);if(again)return {id:again.id,created:false};throw new Error('تعذر إنشاء ملف الأدلة');}
  must(await supabaseAdmin.from('custody_log').insert({evidence_id:ins.data.id,action:'collected',actor:null,detail:'النظام'}));
  return {id:ins.data.id,created:true};
});
const logAction=async(db:SupabaseClient<Database>,evidence_id:string,action:'viewed'|'exported_pdf'|'downloaded_original'|'reviewed'|'status_changed'|'notes_updated',detail:string|null,userId:string)=>must(await db.from('custody_log').insert({evidence_id,action,actor:userId,detail}));
export const logEvidenceAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),action:z.enum(['viewed','exported_pdf'])})).handler(async({data,context})=>{await logAction(context.supabase,data.evidence_id,data.action,null,context.userId);return true;});
export const screenshotUrl=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),download:z.boolean()})).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);
  const ev=requireData(await context.supabase.from('evidence').select('id,case_no,screenshot_path').eq('id',data.evidence_id).single());
  if(!ev.screenshot_path)return null;
  const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
  const r=await supabaseAdmin.storage.from('evidence').createSignedUrl(ev.screenshot_path,300,data.download?{download:`${ev.case_no}.png`}:undefined);
  if(r.error)return null;
  if(data.download)await logAction(context.supabase,ev.id,'downloaded_original',null,context.userId);
  return r.data.signedUrl;
});
export const reviewEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),decision:z.enum(['confirmed_suspicious','dismissed'])})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({review_status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString()}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'reviewed',data.decision==='confirmed_suspicious'?'مشبوه — يحتاج تحقق':'استبعاد (سليم)',context.userId);return true;
});
export const setCaseStatus=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),status:z.enum(['detected','referred','in_progress','closed'])})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({case_status:data.status}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'status_changed',data.status,context.userId);return true;
});
const notesSchema=z.object({victims:z.string().max(200),losses:z.string().max(500),accounts:z.string().max(1000),reporter:z.string().max(1000),notes:z.string().max(4000)});
export const saveNotes=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),notes:notesSchema})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({investigator_notes:data.notes}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'notes_updated',null,context.userId);return true;
});

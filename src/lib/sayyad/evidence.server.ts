import { asIndicators } from './indicators';
import type { Json } from '@/integrations/supabase/types';
import { must, requireData, cfBase, cfGetHeaders, providerFetch, type Db } from './engine.server';
import { zyteProvenance } from './zyte';
import { asksFromReasons, canCreateEvidence, isUrgent, noScreenshotNote, urgentReason, type ChainNode, type EvidenceSnapshot } from './evidence';
export async function sha256(bytes:Uint8Array){const d=await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** Shared evidence creation (UI and automatic worker). Callers must prove access first. */
export async function createEvidenceCore(db:Db,userId:string,linkId:string,custody:{actor:string|null;detail:string}={actor:null,detail:'النظام'}){
  const existing=must(await db.from('evidence').select('id').eq('link_id',linkId).maybeSingle());if(existing)return {id:existing.id,created:false};
  const link=requireData(await db.from('links').select('*').eq('id',linkId).single());
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
  let ext='png';
  // No Cloudflare screenshot: freeze the stored Zyte (AE) capture after verifying its SHA-256.
  if(!bytes&&a.screenshot_path&&a.screenshot_sha256)try{const { supabaseAdmin:adm }=await import('@/integrations/supabase/client.server');const f=await adm.storage.from('evidence').download(a.screenshot_path);if(f.data){const b=new Uint8Array(await f.data.arrayBuffer());if(b.length>0&&await sha256(b)===a.screenshot_sha256){bytes=b;ext='jpg';}}}catch{bytes=null;}
  const snapshot:EvidenceSnapshot={
    link:{url:link.url,final_url:link.final_url,domain:link.domain,platform:link.platform,rank:link.rank,is_ad:link.is_ad,title:link.title,snippet:link.snippet,maps_phone:link.maps_phone,status:link.status,scan_error:link.scan_error,first_seen_at:link.first_seen_at,scan_started_at:link.scan_started_at},
    analysis:{score:a.score,level:a.level,reasons_ar:a.reasons_ar,ai_summary_ar:a.ai_summary_ar,domain_age_days:a.domain_age_days,age_source:a.age_source,phones_found:a.phones_found,outgoing_domains:a.outgoing_domains,page_title:a.page_title,created_at:a.created_at,scanner:a.scanner,captured_at:a.captured_at,...asksFromReasons(a.reasons_ar,(a.signals ?? {}) as Record<string,unknown>)},
    hosting,indicators:asIndicators(a.indicators),whois:(a.whois && typeof a.whois==='object' && !Array.isArray(a.whois)?a.whois:null) as import('./early').Whois|null,entity:entity?{name_ar:entity.name_ar,name_en:entity.name_en,official_domains:entity.official_domains,official_phones:entity.official_phones}:null,
    source:{phrase:hunt?.phrase ?? null,source:hunt?.source ?? null,rank:link.rank,is_ad:link.is_ad},
    chain:{parent:parentLink?await node(parentLink):null,children:await Promise.all(childLinks.map(node))},
    page_status:pageStatus,urgent_reason:urgent?urgentReason:null,screenshot_note:bytes?null:noScreenshotNote,
  };
  const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
  let path:string|null=null,hash:string|null=null;
  if(bytes){path=`${link.id}/${Date.now()}.${ext}`;hash=await sha256(bytes);const up=await supabaseAdmin.storage.from('evidence').upload(path,bytes,{contentType:ext==='jpg'?'image/jpeg':'image/png',upsert:false});if(up.error){path=null;hash=null;snapshot.screenshot_note=noScreenshotNote;}}
  const ins=await supabaseAdmin.from('evidence').insert({link_id:link.id,created_by:userId,screenshot_path:path,screenshot_sha256:hash,captured_at:bytes&&path?new Date().toISOString():null,snapshot:snapshot as unknown as Json,urgent}).select('id').single();
  if(ins.error){const again=must(await db.from('evidence').select('id').eq('link_id',link.id).maybeSingle());if(path)await supabaseAdmin.storage.from('evidence').remove([path]);if(again)return {id:again.id,created:false};throw new Error('تعذر إنشاء ملف الأدلة');}
  if(a.scanner==='zyte_ae')must(await supabaseAdmin.from('custody_log').insert({evidence_id:ins.data.id,action:'captured',actor:custody.actor,detail:`${zyteProvenance} — ${a.captured_at ?? ''}${a.screenshot_sha256?` — SHA-256 ${a.screenshot_sha256}`:''}`}));
  must(await supabaseAdmin.from('custody_log').insert({evidence_id:ins.data.id,action:'collected',actor:custody.actor,detail:custody.detail}));
  return {id:ins.data.id,created:true};
}

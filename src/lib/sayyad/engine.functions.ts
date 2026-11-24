import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { linkIdSchema, phraseSchema, cleanUrl, scanSubmissionSchema, officialDestination, hostname } from './rules';
import { must, requireData, search, addLink, entities, cfBase, cfHeaders, cfGetHeaders, providerFetch, parseReport, logReportOnce, reportState, searchEvidenceAnalysis, finalize, officialAnalysis, scanSubmissionUrl, scanRefusalReason, scanRefusalMessage } from './engine.server';
export const getWorkspace=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const db=context.supabase;
  const [es,phrases,links,analyses,hunts]=await Promise.all([db.from('entities').select('*').order('name_ar'),db.from('search_phrases').select('*').eq('active',true),db.from('links').select('*').order('first_seen_at',{ascending:false}),db.from('analyses').select('*'),db.from('hunts').select('*').order('created_at',{ascending:false})]);
  return {entities:requireData(es),phrases:requireData(phrases),links:requireData(links),analyses:requireData(analyses),hunts:requireData(hunts)};
});
export const searchGoogle=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(phraseSchema).handler(async({data,context})=>{const key=process.env['SERPER_API_KEY'];if(!key)throw new Error('أضف SERPER_API_KEY في إعدادات الأسرار');return search(context.supabase,context.userId,data.phrase,'google',key);});
export const searchMaps=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(phraseSchema).handler(async({data,context})=>{const key=process.env['SERPER_API_KEY'];if(!key)throw new Error('أضف SERPER_API_KEY في إعدادات الأسرار');return search(context.supabase,context.userId,data.phrase,'maps',key);});
export const addManualLink=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({url:z.string().min(1).max(2048)})).handler(async({data,context})=>{
  const url=cleanUrl(data.url);const db=context.supabase;
  const existing=must(await db.from('links').select('*').eq('url',url).maybeSingle());if(existing)return existing;
  const hunt=requireData(await db.from('hunts').insert({phrase:'تحقق من رابط',source:'manual',results_count:1,created_by:context.userId}).select('*').single());
  const link=await addLink(db,{url,hunt_id:hunt.id},await entities(db));if(!link)throw new Error('الرابط غير صالح');return link;
});
// Start once, poll from the browser: no 90-second server sleep loop.
export const scanLink=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{
  const account=process.env['CLOUDFLARE_ACCOUNT_ID'],token=process.env['CLOUDFLARE_API_TOKEN'];if(!account||!token)throw new Error('إعدادات Cloudflare غير مكتملة');
  const db=context.supabase;const link=requireData(await db.from('links').select('*').eq('id',data.link_id).single());
  if(link.status!=='pending')return {started:false,status:link.status};
  const official=officialDestination(hostname(link.url),await entities(db));if(official){await officialAnalysis(db,link.id,official.reason,official.entity?.id ?? null,null,[]);return {started:false,status:'official'};}
  const claimed=must(await db.rpc('claim_scan',{_link_id:link.id}));if(!claimed)return {started:false,status:'waiting'};
  try {
    const hunt=link.hunt_id?requireData(await db.from('hunts').select('source').eq('id',link.hunt_id).single()):null;
    const r=await providerFetch(`${cfBase(account)}/scan`,{method:'POST',headers:cfHeaders(token),body:JSON.stringify({url:scanSubmissionUrl(link.url,hunt?.source ?? 'manual'),visibility:'Public'})});
    if(r.status===429) {
      must(await db.from('links').update({status:'pending',scan_started_at:null,scan_error:null}).eq('id',link.id));
      // Persist the diagnostic claim so separate server invocations log at most once per link.
      const logged=requireData(await db.from('engine_cache').upsert({key:`scan-429:${link.id}`,value:{http_status:429},expires_at:new Date(Date.now()+86400000).toISOString()},{onConflict:'key',ignoreDuplicates:true}).select('key'));
      if(logged.length)console.warn('Cloudflare scan HTTP 429');
      return {started:false,status:'waiting'};
    }
    if(!r.ok) {
      const message=scanRefusalMessage(await r.text(),token);
      const logged=requireData(await db.from('engine_cache').upsert({key:`scan-refusal:${link.id}`,value:{http_status:r.status},expires_at:new Date(Date.now()+86400000).toISOString()},{onConflict:'key',ignoreDuplicates:true}).select('key'));
      if(logged.length)console.warn(`Cloudflare scan HTTP ${r.status}: ${message}`);
      must(await db.from('links').update({scan_error:scanRefusalReason}).eq('id',link.id));
      const result=await searchEvidenceAnalysis(db,{...link,status:'scanning',scan_error:scanRefusalReason});
      return {started:false,status:result.status};
    }
    const json:unknown=await r.json();const env=scanSubmissionSchema.safeParse(json);if(!env.success)throw new Error('لم يصل معرّف فحص صالح من Cloudflare');const uuid=env.data.uuid;
    must(await db.from('links').update({scan_uuid:uuid}).eq('id',link.id));return {started:true,status:'scanning'};
  }catch(e){must(await db.from('links').update({status:'error',scan_error:e instanceof Error?e.message:'تعذر بدء الفحص'}).eq('id',link.id));throw e;}
});
export const pollScan=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{
  const account=process.env['CLOUDFLARE_ACCOUNT_ID'],token=process.env['CLOUDFLARE_API_TOKEN'];if(!account||!token)throw new Error('إعدادات Cloudflare غير مكتملة');
  const db=context.supabase;const link=requireData(await db.from('links').select('*').eq('id',data.link_id).single());
  if(link.status!=='scanning')return {status:link.status};
  if(!link.scan_uuid){if(reportState(parseReport({}),link.scan_started_at)==='unscannable')return searchEvidenceAnalysis(db,link);return {status:'scanning'};}
  if(link.processing_started_at){if(Date.now()-Date.parse(link.processing_started_at)>180000){must(await db.from('links').update({status:'error',scan_error:'لم يكتمل التحليل؛ لن يُعاد طلب الذكاء الاصطناعي تلقائياً'}).eq('id',link.id));return {status:'error'};}return {status:'scanning'};}
  const r=await providerFetch(`${cfBase(account)}/result/${link.scan_uuid}`,{headers:cfGetHeaders(token)});
  if(r.status===404){if(reportState(parseReport({}),link.scan_started_at)==='scanning')return {status:'scanning'};return searchEvidenceAnalysis(db,link);}
  try{if(!r.ok)throw new Error('تعذر قراءة تقرير Cloudflare');const raw:unknown=await r.json();logReportOnce(link.id,raw);const report=parseReport(raw);const state=reportState(report,link.scan_started_at);console.info(`Cloudflare task ${report.task?.status ?? 'unspecified'}; report ${state}`);if(state==='scanning')return {status:'scanning'};if(state==='unscannable')return searchEvidenceAnalysis(db,link);return await finalize(db,link,report,cfBase(account),cfGetHeaders(token));}
  catch(e){must(await db.from('links').update({status:'error',scan_error:e instanceof Error?e.message:'تعذر إكمال التحليل'}).eq('id',link.id));throw new Error('تعذر إكمال التحليل؛ لم يُصنّف الرابط على أنه آمن');}
});
export const screenshotProxy=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{
  const account=process.env['CLOUDFLARE_ACCOUNT_ID'],token=process.env['CLOUDFLARE_API_TOKEN'];if(!account||!token)throw new Error('إعدادات Cloudflare غير مكتملة');
  const link=requireData(await context.supabase.from('links').select('scan_uuid,status').eq('id',data.link_id).single());if(!link.scan_uuid||!['done','official'].includes(link.status))return null;
  const r=await providerFetch(`${cfBase(account)}/screenshots/${link.scan_uuid}.png`,{headers:cfGetHeaders(token)});if(!r.ok)return null;
  if(!r.headers.get('content-type')?.includes('image/png'))return null;
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5000000)return null;let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return `data:image/png;base64,${btoa(s)}`;
});

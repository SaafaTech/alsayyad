import { requireInvestigator } from './role.server';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { isMapsListing, mapsListingFinding, linkIdSchema, phraseSchema, cleanUrl, scanSubmissionSchema, officialDestination, hostname } from './rules';
import { must, requireData, search, addLink, entities, cfBase, cfHeaders, cfGetHeaders, providerFetch, parseReport, logReportOnce, reportState, searchEvidenceAnalysis, finalize, officialAnalysis, scanSubmissionUrl, scanRefusalReason, scanRefusalMessage, ctWatch as ctWatchCore, storeMapsListing } from './engine.server';
import type { Db } from './engine.server';
import { maybeRebuildCampaigns } from './campaigns.server';
import { scanLinkCore, pollScanCore } from './scan.server';
export const getWorkspace=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const db=context.supabase;
  const [es,phrases,links,analyses,hunts]=await Promise.all([db.from('entities').select('*').order('name_ar'),db.from('search_phrases').select('*').order('created_at'),db.from('links').select('*').order('first_seen_at',{ascending:false}),db.from('analyses').select('*'),db.from('hunts').select('*').order('created_at',{ascending:false})]);
  return {entities:requireData(es),phrases:requireData(phrases),links:requireData(links),analyses:requireData(analyses),hunts:requireData(hunts)};
});
export const searchGoogle=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(phraseSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);const key=process.env['SERPER_API_KEY'];if(!key)throw new Error('أضف SERPER_API_KEY في إعدادات الأسرار');return search(context.supabase,context.userId,data.phrase,'google',key);});
export const searchMaps=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(phraseSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);const key=process.env['SERPER_API_KEY'];if(!key)throw new Error('أضف SERPER_API_KEY في إعدادات الأسرار');return search(context.supabase,context.userId,data.phrase,'maps',key);});
export const ctWatch=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({keyword:z.string().trim().regex(/^[a-z0-9]{4,40}$/)})).handler(async({data,context})=>(await requireInvestigator(context.supabase,context.userId),ctWatchCore(context.supabase,context.userId,data.keyword)));
export const addManualLink=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({url:z.string().min(1).max(2048)})).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);
  const url=cleanUrl(data.url);const db=context.supabase;
  const existing=must(await db.from('links').select('*').eq('url',url).maybeSingle());if(existing)return existing;
  const hunt=requireData(await db.from('hunts').insert({phrase:'تحقق من رابط',source:'manual',results_count:1,created_by:context.userId}).select('*').single());
  const link=await addLink(db,{url,hunt_id:hunt.id},await entities(db));if(!link)throw new Error('الرابط غير صالح');return link;
});
// Start once, poll from the browser: no 90-second server sleep loop.
export const scanLink=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);return scanLinkCore(context.supabase,data.link_id);});
export const pollScan=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);const result=await pollScanCore(data,context);if(result.status==='done')await maybeRebuildCampaigns(context.supabase);return result;});
// Archive the latest analysis, return the link and its direct children to the normal queue.
export const rescanLink=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>({count:must(await context.supabase.rpc('rescan_link',{_link_id:data.link_id}))}));
export const screenshotProxy=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);
  // Stored Zyte (AE) capture: served from the private evidence bucket under the same investigator check.
  const stored=must(await context.supabase.from('analyses').select('screenshot_path').eq('link_id',data.link_id).maybeSingle());
  if(stored?.screenshot_path){const { supabaseAdmin }=await import('@/integrations/supabase/client.server');const f=await supabaseAdmin.storage.from('evidence').download(stored.screenshot_path);if(!f.data)return null;const b=new Uint8Array(await f.data.arrayBuffer());if(b.length>5000000)return null;let x='';for(let i=0;i<b.length;i+=8192)x+=String.fromCharCode(...b.subarray(i,i+8192));return `data:image/jpeg;base64,${btoa(x)}`;}
  const account=process.env['CLOUDFLARE_ACCOUNT_ID'],token=process.env['CLOUDFLARE_API_TOKEN'];if(!account||!token)throw new Error('إعدادات Cloudflare غير مكتملة');
  const link=requireData(await context.supabase.from('links').select('scan_uuid,status').eq('id',data.link_id).single());if(!link.scan_uuid||!['done','official'].includes(link.status))return null;
  const r=await providerFetch(`${cfBase(account)}/screenshots/${link.scan_uuid}.png`,{headers:cfGetHeaders(token)});if(!r.ok)return null;
  if(!r.headers.get('content-type')?.includes('image/png'))return null;
  const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5000000)return null;let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return `data:image/png;base64,${btoa(s)}`;
});

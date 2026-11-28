import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';
import { must, requireData, entities, providerFetch, searchEvidenceAnalysis, scanSubmissionUrl, pageGate, scorePage, type Db } from './engine.server';
import { cleanUrl, hostname, isShortener } from './rules';
import { zyteDecision, claimOutcome, failureKind, afterFailure, keepScreenshot, htmlText, htmlTitle, htmlHrefs, emptyCapture, zyteSuccessReason, isSocialForZyte, inRecheck, fallbackEnd, recheckClearsMark, ZYTE_TIMEOUT_MS, type FallbackCtx } from './zyte';
import { sha256 } from './evidence.server';
const zyteSchema=z.object({url:z.string().optional(),statusCode:z.number().optional(),browserHtml:z.string().optional(),screenshot:z.string().optional()});
type Extract={ok:true;data:z.infer<typeof zyteSchema>}|{ok:false;status:number|null};
/** Zyte opens the page in its own isolated browser in the UAE: capture only (no actions, clicks or typing). */
async function zyteExtract(key:string,url:string):Promise<Extract>{
  let r:Response;
  try{r=await providerFetch('https://api.zyte.com/v1/extract',{method:'POST',headers:{'Authorization':`Basic ${btoa(`${key}:`)}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(ZYTE_TIMEOUT_MS),
    body:JSON.stringify({url,browserHtml:true,screenshot:true,screenshotOptions:{format:'jpeg',fullPage:false},geolocation:'AE',viewport:{width:390,height:844}})});}
  catch{console.warn('Zyte request failed or timed out');return {ok:false,status:null};}
  if(!r.ok){let type='';try{type=z.object({type:z.string().optional()}).parse(await r.json()).type ?? '';}catch{/* no body */}console.warn(`Zyte HTTP ${r.status} ${type.slice(0,60)}`);return {ok:false,status:r.status};}
  const parsed=zyteSchema.safeParse(await r.json().catch(()=>null));
  return parsed.success?{ok:true,data:parsed.data}:{ok:false,status:500};
}
function fromBase64(b64:string){try{const bin=atob(b64);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}catch{return null;}}
/** Called wherever a Cloudflare scan ends unscannable or refused. Falls back to today's search-evidence verdict (never green). */
export async function scanFallback(db:Db,link:Tables<'links'>,ctx:FallbackCtx={mode:'manual'}):Promise<{status:string}>{
  const key=process.env['ZYTE_API_KEY'];
  const recheck=inRecheck(link);
  // Re-check failures restore the link with its previous analysis; first scans get the search-evidence verdict.
  const end=async(l:Tables<'links'>)=>fallbackEnd(recheck)==='restore'?restoreRecheck(db,l.id):searchEvidenceAnalysis(db,l);
  // Shorteners and social/UGC platforms never go to Zyte (no claim, no cap use, never queued).
  if(isShortener(hostname(link.url))||isSocialForZyte(link.platform,hostname(link.url)))return recheck?restoreRecheck(db,link.id):searchEvidenceAnalysis(db,link);
  const now=Date.now();
  const d=zyteDecision({configured:!!key,attempts:link.fallback_attempts,queuedAt:link.fallback_queued_at,now,mode:ctx.mode,left:ctx.left?ctx.left():Infinity,usedThisRun:ctx.used?.n ?? 0});
  if(d==='final'||!key)return end(link);
  if(d==='defer'){if(!link.fallback_queued_at)must(await db.from('links').update({fallback_queued_at:new Date(now).toISOString()}).eq('id',link.id));return {status:'scanning'};}
  const rawClaim=must(await db.rpc('claim_zyte',{_link_id:link.id})) ?? 'denied';
  if(recheckClearsMark(recheck,rawClaim)){const r=await restoreRecheck(db,link.id);must(await db.from('links').update({zyte_recheck_at:null}).eq('id',link.id));return r;}
  const claim=claimOutcome(rawClaim);
  if(claim==='wait')return {status:'scanning'};
  if(claim==='final')return end(link);
  if(ctx.used)ctx.used.n++;
  const attempts=link.fallback_attempts+1,queuedAt=link.fallback_queued_at ?? new Date(now).toISOString();
  const hunt=link.hunt_id?must(await db.from('hunts').select('source').eq('id',link.hunt_id).maybeSingle()):null;
  const submitted=scanSubmissionUrl(link.url,hunt?.source ?? 'manual');
  const res=await zyteExtract(key,submitted);
  const html=res.ok?(res.data.browserHtml ?? '').slice(0,500000):'';
  const bytes=res.ok&&res.data.screenshot?fromBase64(res.data.screenshot):null;
  if(!res.ok||emptyCapture(html,!!bytes?.length)){
    must(await db.from('links').update({zyte_started_at:null}).eq('id',link.id));
    const next=afterFailure({kind:res.ok?'permanent':failureKind(res.status),mode:ctx.mode,attempts,queuedAt,now:Date.now()});
    return next==='defer'?{status:'scanning'}:end({...link,fallback_attempts:attempts});
  }
  // Successful re-check capture: archive the old analysis (kept in analysis_history) so the new one is written as usual.
  if(recheck){must(await db.rpc('zyte_recheck_archive',{_link_id:link.id}));must(await db.from('links').update({fallback_queued_at:null}).eq('id',link.id));}
  try{return await analyseCapture(db,link,res.data,submitted,html,bytes,recheck);}
  catch(e){if(recheck){await db.rpc('zyte_recheck_unarchive',{_link_id:link.id});await restoreRecheck(db,link.id);return {status:'done'};}throw e;}
}
/** Ends a re-check without a new result: status back to done, old analysis and level untouched. */
async function restoreRecheck(db:Db,id:string):Promise<{status:string}>{
  must(await db.from('links').update({status:'done',fallback_queued_at:null,zyte_started_at:null,processing_started_at:null}).eq('id',id));
  return {status:'done'};
}
async function analyseCapture(db:Db,link:Tables<'links'>,data:z.infer<typeof zyteSchema>,submitted:string,html:string,bytes:Uint8Array|null,recheck:boolean):Promise<{status:string}>{
  const res={data};
  const fresh=requireData(await db.from('links').select('*').eq('id',link.id).single());
  const es=await entities(db);const capturedAt=new Date().toISOString();
  let finalUrl:string;try{finalUrl=cleanUrl(res.data.url ?? submitted);}catch{finalUrl=cleanUrl(submitted);}
  const status=typeof res.data.statusCode==='number'?res.data.statusCode:null;
  const title=htmlTitle(html),text=htmlText(html);
  const hosting={ip:null,asn:null,asnname:null,country:null,server:null,tls_issuer:null,status};
  const g=await pageGate(db,fresh,es,{finalUrl,title,status,hosting,scanner:'zyte_ae',capturedAt,onUnscannable:async()=>{if(recheck){must(await db.rpc('zyte_recheck_unarchive',{_link_id:link.id}));return restoreRecheck(db,link.id);}return searchEvidenceAnalysis(db,fresh);}});
  if('result' in g)return g.result;
  const screenshot=text.length<200&&bytes&&bytes.length<=4*1024*1024&&res.data.screenshot?`data:image/jpeg;base64,${res.data.screenshot}`:undefined;
  return scorePage(db,fresh,es,{finalUrl,title,hosting,text,domOk:true,reportText:'',hrefs:htmlHrefs(html),linkDomains:[],chain:[],...(screenshot?{screenshot}:{}),domReasons:screenshot?['التحليل مبني على لقطة الشاشة والعنوان']:[],redirect:g.redirect,scanner:'zyte_ae',capturedAt,extraReasons:[zyteSuccessReason],authHeader:`Bearer ${process.env['CLOUDFLARE_API_TOKEN'] ?? ''}`,
    keepShot:async level=>{
      // Zyte returns the screenshot once: keep the original bytes only for yellow/red, discard for green.
      if(!keepScreenshot(level)||!bytes?.length||bytes.length>10000000)return null;
      const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
      const path=`analysis/${link.id}/${Date.now()}.jpg`;const sha=await sha256(bytes);
      const up=await supabaseAdmin.storage.from('evidence').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
      return up.error?null:{path,sha};
    }});
}

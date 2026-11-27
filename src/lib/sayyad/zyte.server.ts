import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';
import { must, requireData, entities, providerFetch, searchEvidenceAnalysis, scanSubmissionUrl, pageGate, scorePage, type Db } from './engine.server';
import { cleanUrl, hostname, isShortener } from './rules';
import { zyteDecision, claimOutcome, failureKind, afterFailure, keepScreenshot, htmlText, htmlTitle, htmlHrefs, emptyCapture, zyteSuccessReason, ZYTE_TIMEOUT_MS, type FallbackCtx } from './zyte';
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
  if(isShortener(hostname(link.url)))return searchEvidenceAnalysis(db,link);
  const now=Date.now();
  const d=zyteDecision({configured:!!key,attempts:link.fallback_attempts,queuedAt:link.fallback_queued_at,now,mode:ctx.mode,left:ctx.left?ctx.left():Infinity,usedThisRun:ctx.used?.n ?? 0});
  if(d==='final'||!key)return searchEvidenceAnalysis(db,link);
  if(d==='defer'){if(!link.fallback_queued_at)must(await db.from('links').update({fallback_queued_at:new Date(now).toISOString()}).eq('id',link.id));return {status:'scanning'};}
  const claim=claimOutcome(must(await db.rpc('claim_zyte',{_link_id:link.id})) ?? 'denied');
  if(claim==='wait')return {status:'scanning'};
  if(claim==='final')return searchEvidenceAnalysis(db,link);
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
    return next==='defer'?{status:'scanning'}:searchEvidenceAnalysis(db,{...link,fallback_attempts:attempts});
  }
  const fresh=requireData(await db.from('links').select('*').eq('id',link.id).single());
  const es=await entities(db);const capturedAt=new Date().toISOString();
  let finalUrl:string;try{finalUrl=cleanUrl(res.data.url ?? submitted);}catch{finalUrl=cleanUrl(submitted);}
  const status=typeof res.data.statusCode==='number'?res.data.statusCode:null;
  const title=htmlTitle(html),text=htmlText(html);
  const hosting={ip:null,asn:null,asnname:null,country:null,server:null,tls_issuer:null,status};
  const g=await pageGate(db,fresh,es,{finalUrl,title,status,hosting,scanner:'zyte_ae',capturedAt,onUnscannable:()=>searchEvidenceAnalysis(db,fresh)});
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

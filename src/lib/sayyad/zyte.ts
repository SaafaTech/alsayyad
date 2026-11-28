/** Pure rules for the in-country (Zyte, AE) fallback scanner. No I/O here. */
export const ZYTE_MAX_ATTEMPTS=3;
export const ZYTE_MAX_WAIT_MS=6*3600000;
export const ZYTE_MIN_BUDGET_MS=45000;
export const ZYTE_TIMEOUT_MS=35000;
export const zyteProvenance='تم الفحص من داخل الإمارات عبر Zyte (متصفح معزول لدى المزوّد)';
/** Human label for an analysis' scanner, used in screens and exports. */
export const scannerLabel=(scanner:string|null|undefined)=>scanner==='zyte_ae'?zyteProvenance:scanner==='cloudflare'?'Cloudflare URL Scanner':'';
export const zyteSuccessReason='تعذر الفحص عبر Cloudflare، ونجح الفحص من داخل الإمارات';
export type FallbackMode='manual'|'auto';
/** Context passed by callers: the automatic worker supplies its budget and a per-run counter. */
export type FallbackCtx={mode:FallbackMode;left?:()=>number;used?:{n:number}};
export type Decision='try'|'defer'|'final';
/** Whether to try Zyte now, keep the link queued for a later worker run, or finalise as unscannable. */
export function zyteDecision(i:{configured:boolean;attempts:number;queuedAt:string|null;now:number;mode:FallbackMode;left:number;usedThisRun:number}):Decision{
  if(!i.configured)return 'final';
  if(i.attempts>=ZYTE_MAX_ATTEMPTS)return 'final';
  const q=Date.parse(i.queuedAt ?? '');if(Number.isFinite(q)&&i.now-q>ZYTE_MAX_WAIT_MS)return 'final';
  if(i.mode==='auto'&&(i.usedThisRun>=1||i.left<ZYTE_MIN_BUDGET_MS))return 'defer';
  return 'try';
}
/** Server-side claim result (daily cap enforced in the database per Asia/Dubai day). */
export function claimOutcome(claim:string):'try'|'wait'|'final'{return claim==='ok'?'try':claim==='busy'?'wait':'final';}
/** Rate limits, bans, service errors and timeouts may succeed later; invalid/forbidden requests never will. */
export function failureKind(status:number|null):'transient'|'permanent'{return status===null||[429,500,503,520].includes(status)?'transient':'permanent';}
/** After a failed attempt: the worker retries transient failures within the limits; everything else finalises now. */
export function afterFailure(i:{kind:'transient'|'permanent';mode:FallbackMode;attempts:number;queuedAt:string|null;now:number}):'defer'|'final'{
  if(i.mode!=='auto'||i.kind==='permanent'||i.attempts>=ZYTE_MAX_ATTEMPTS)return 'final';
  const q=Date.parse(i.queuedAt ?? '');return Number.isFinite(q)&&i.now-q>ZYTE_MAX_WAIT_MS?'final':'defer';
}
/** The one-time Zyte screenshot is stored only for results an investigator must review. */
export const keepScreenshot=(level:string)=>level==='yellow'||level==='red';
export function htmlText(html:string){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim().slice(0,6000);}
export function htmlTitle(html:string){const m=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);return (m?.[1] ?? '').replace(/\s+/g,' ').trim().slice(0,300);}
/** href values of anchors in untrusted HTML (never followed; used only as evidence). */
export function htmlHrefs(html:string){const out:string[]=[];const re=/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;let m:RegExpExecArray|null;while((m=re.exec(html))&&out.length<500){const v=(m[1] ?? m[2] ?? m[3] ?? '').trim();if(v)out.push(v.replace(/&amp;/g,'&'));}return out;}
/** A capture with no readable text and no screenshot cannot be analysed. */
export const emptyCapture=(html:string,hasShot:boolean)=>!html.trim()||(htmlText(html).length<20&&!htmlTitle(html)&&!hasShot);
/** Automatic yellow/red links analysed in the last 48 h with no evidence file yet, oldest first, at most `limit`. */
export function missingEvidence<T extends {link_id:string;level:string;created_at:string;trigger:string|null;source:string|null}>(rows:T[],withEvidence:Set<string>,now:number,limit=3):T[]{
  return rows.filter(r=>r.trigger==='auto'&&r.source!=='expert_sample'&&(r.level==='yellow'||r.level==='red')&&!withEvidence.has(r.link_id)&&Date.parse(r.created_at)>=now-48*3600000)
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(0,limit);
}
const SOCIAL_PLATFORMS=new Set(['facebook','instagram','x','tiktok']);
const SOCIAL_HOSTS=['facebook.com','fb.com','instagram.com','x.com','twitter.com','tiktok.com','quora.com','youtube.com','youtu.be','linkedin.com','reddit.com','snapchat.com','threads.net','t.me','telegram.me','wa.me','whatsapp.com'];
/** Social/UGC platforms never go to Zyte: they need logins, cost a billed call and rarely give a usable capture. */
export function isSocialForZyte(platform:string|null|undefined,host:string|null|undefined){
  if(platform&&SOCIAL_PLATFORMS.has(platform))return true;
  const h=(host ?? '').toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
  return !!h&&SOCIAL_HOSTS.some(d=>h===d||h.endsWith('.'+d));
}
/** After a Zyte call the worker starts no new Cloudflare scans and no search/CT step, so the run stays under 60 s. */
export const continueAfterZyte=(used:{n:number}|undefined)=>(used?.n ?? 0)<1;
/** A link is in a re-check while its queue time is the re-check time (both set together by zyte_recheck_requeue). */
export function inRecheck(l:{zyte_recheck_at:string|null;fallback_queued_at:string|null}){
  if(!l.zyte_recheck_at||!l.fallback_queued_at)return false;
  return Date.parse(l.zyte_recheck_at)===Date.parse(l.fallback_queued_at);
}
/** When Zyte cannot give a result: a re-check restores the link with its old analysis; a first scan gets the search-evidence verdict. */
export const fallbackEnd=(recheck:boolean):'restore'|'search_evidence'=>recheck?'restore':'search_evidence';
export const RECHECK_BATCH=15;
export type RecheckCandidate={id:string;status:string;scan_error:string|null;zyte_recheck_at:string|null;platform:string;url:string;domain:string;first_seen_at:string;source:string|null;level:string|null;scanner:string|null;shortener:boolean};
const LEVEL_RANK:Record<string,number>={red:0,yellow:1};
const PLATFORM_RANK:Record<string,number>={other:0,vercel:1,pages_dev:2};
export function recheckEligible(c:RecheckCandidate){
  return c.status==='done'&&!!c.scan_error&&!c.zyte_recheck_at&&c.level!==null&&c.scanner!=='zyte_ae'&&!c.shortener&&c.source!=='expert_sample'&&!isSocialForZyte(c.platform,c.domain);
}
/** Eligible old unscannable links, red then yellow, then own domains, vercel, pages.dev, others; oldest first. */
export function recheckBatch<T extends RecheckCandidate>(rows:T[],limit=RECHECK_BATCH):T[]{
  return rows.filter(recheckEligible).sort((a,b)=>(LEVEL_RANK[a.level ?? '']??2)-(LEVEL_RANK[b.level ?? '']??2)||(PLATFORM_RANK[a.platform]??3)-(PLATFORM_RANK[b.platform]??3)||a.first_seen_at.localeCompare(b.first_seen_at)).slice(0,limit);
}
/** Scanning queue: new links before re-check links, no duplicates. */
export function scanQueue<T extends {id:string}>(fresh:T[],rechecks:T[]):T[]{const seen=new Set(fresh.map(l=>l.id));return [...fresh,...rechecks.filter(l=>!seen.has(l.id))];}

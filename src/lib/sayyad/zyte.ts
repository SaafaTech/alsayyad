/** Pure rules for the in-country (Zyte, AE) fallback scanner. No I/O here. */
export const ZYTE_MAX_ATTEMPTS=3;
export const ZYTE_MAX_WAIT_MS=6*3600000;
export const ZYTE_MIN_BUDGET_MS=40000;
export const ZYTE_TIMEOUT_MS=45000;
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

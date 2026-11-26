import { cleanUrl, hostname, platformFor, freePlatform, isShortener } from './rules';
/** Pure rules for the automatic hunt: switch, daily cap and dedupe. */
export type AutoSettings={enabled:boolean;daily_cap:number;owner_user_id:string|null};
/** The automatic hunt runs only when switched on and an owner exists. */
export const autoAllowed=(s:AutoSettings|null|undefined):s is AutoSettings&{owner_user_id:string}=>!!s&&s.enabled&&!!s.owner_user_id;
/** Free/shared platforms and shorteners host many unrelated pages on one domain. */
export const sharedDomain=(domain:string)=>freePlatform(platformFor(domain))||isShortener(domain)||['facebook','instagram','tiktok','telegram','whatsapp','x','snapchat','youtube'].includes(platformFor(domain));
export function normalizeUrl(url:string):string|null{try{const u=new URL(cleanUrl(url));u.hash='';return u.href.replace(/\/$/,'').toLowerCase();}catch{return null;}}
export type Seen={urls:Set<string>;domains:Set<string>};
/** Builds the set of already-analysed URLs and (non-shared) domains. */
export function seenFrom(analysed:{url:string;domain:string;final_url?:string|null}[]):Seen{
  const urls=new Set<string>(),domains=new Set<string>();
  for(const l of analysed){for(const u of [l.url,l.final_url]){if(!u)continue;const n=normalizeUrl(u);if(n)urls.add(n);}if(!sharedDomain(l.domain))domains.add(l.domain.toLowerCase());}
  return {urls,domains};
}
/** Skip a URL already analysed; on normal domains also skip a domain already analysed. */
export function alreadyAnalysed(url:string,seen:Seen):boolean{
  const n=normalizeUrl(url);if(!n)return true;if(seen.urls.has(n))return true;
  let d:string;try{d=hostname(cleanUrl(url)).toLowerCase();}catch{return true;}
  return !sharedDomain(d)&&seen.domains.has(d);
}
/** Gate for new auto links: stops at the daily cap and records accepted URLs so a run never takes the same one twice. */
export function autoGate(seen:Seen,todayCount:number,cap:number){
  let count=todayCount;
  return {allow(url:string){if(count>=cap||alreadyAnalysed(url,seen))return false;const n=normalizeUrl(url);if(n)seen.urls.add(n);count++;return true;},get count(){return count;},get full(){return count>=cap;}};
}
/** Brand keywords valid for the CT watch. */
export const ctAutoKeywords=(es:{brand_keywords:string[]}[])=>[...new Set(es.flatMap(e=>e.brand_keywords).map(k=>k.trim().toLowerCase()).filter(k=>/^[a-z0-9]{4,40}$/.test(k)))];
/** Expert-sample links never count as already analysed for the automatic hunt. */
export const withoutExpertRows=<T extends {hunt_id:string|null}>(rows:T[],expert:Set<string>)=>rows.filter(r=>!r.hunt_id||!expert.has(r.hunt_id));

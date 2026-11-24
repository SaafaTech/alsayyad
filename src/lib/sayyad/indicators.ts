// Pure, passive extraction of scammer indicators from evidence already collected (no fetching).
import { platformAssets, platformFor, normalizePhone, hostname, within } from './rules';
export type Indicators={phones:string[];whatsapp:string[];ibans:string[];accounts:{number:string;bank:string|null}[];socials:{platform:string;url:string}[];links:string[]};
export type AiBankAccount={iban:string|null;account:string|null;bank:string|null};
export const emptyIndicators=():Indicators=>({phones:[],whatsapp:[],ibans:[],accounts:[],socials:[],links:[]});
const uniq=<T,>(a:T[])=>[...new Set(a)];
/** ISO 13616 mod-97 checksum. */
export function validIban(raw:string){
  const s=raw.replace(/\s+/g,'').toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s))return false;
  if(s.startsWith('AE')&&s.length!==23)return false;
  const r=s.slice(4)+s.slice(0,4);let m=0;
  for(const ch of r){const v=/\d/.test(ch)?ch:String(ch.charCodeAt(0)-55);for(const d of v)m=(m*10+Number(d))%97;}
  return m===1;
}
export function extractIbans(texts:(string|null|undefined)[]){
  const out:string[]=[];
  for(const t of texts){if(!t)continue;const up=t.toUpperCase();
    for(const re of [/AE\d{2}\s?\d{3}\s?\d{16}/g,/\b[A-Z]{2}\d{2}(?:[A-Z0-9] ?){11,30}/g])for(const m of up.match(re) ?? []){
      // Generic matches may run into following words; try shrinking to a valid prefix.
      const s=m.replace(/\s+/g,'');for(let n=s.length;n>=15;n--){if(validIban(s.slice(0,n))){out.push(s.slice(0,n));break;}}
    }}
  return uniq(out);
}
export function whatsappNumber(href:string):string|null{
  try{const u=new URL(href);const h=u.hostname.toLowerCase().replace(/^www\./,'');
    let n:string|null=null;
    if(u.protocol==='whatsapp:')n=u.searchParams.get('phone');
    else if(h==='wa.me')n=u.pathname.split('/')[1] ?? null;
    else if(h==='api.whatsapp.com'||h==='web.whatsapp.com')n=u.searchParams.get('phone');
    const p=n?normalizePhone(n):'';return p.length>=7?p:null;}catch{return null;}
}
const generic=new Set(['share','sharer','sharer.php','intent','login','p','reel','reels','explore','home','watch','tv','stories','hashtag','search','privacy','legal','about','help','policies','accounts','i','tr','dialog','plugins','add','channel','c','user']);
const socialHosts:[string,string][]=[['instagram.com','instagram'],['tiktok.com','tiktok'],['snapchat.com','snapchat'],['t.me','telegram'],['x.com','x'],['twitter.com','x'],['facebook.com','facebook'],['youtube.com','youtube']];
export function canonicalSocial(href:string,officialDomains:string[]=[]):{platform:string;url:string}|null{
  let u:URL;try{u=new URL(href);}catch{return null;}
  if(!/^https?:$/.test(u.protocol))return null;
  if(officialDomains.some(d=>d&&href.toLowerCase().includes(d.toLowerCase())))return null;
  const h=u.hostname.toLowerCase().replace(/^(www|m|mobile)\./,'');const hit=socialHosts.find(([d])=>h===d);if(!hit)return null;
  const [domain,platform]=hit;const seg=u.pathname.split('/').filter(Boolean);
  if(platform==='tiktok'||platform==='youtube'){const s=seg[0];if(!s?.startsWith('@')||s.length<2)return null;return {platform,url:`https://${domain}/${s}`};}
  if(platform==='snapchat'){if(seg[0]!=='add'||!seg[1])return null;return {platform,url:`https://snapchat.com/add/${seg[1]}`};}
  const s=seg[0];if(!s||generic.has(s.toLowerCase())||s.includes('.php'))return null;
  if(!/^[A-Za-z0-9_.\-]{2,60}$/.test(s))return null;
  return {platform,url:`https://${domain}/${s}`};
}
/** Absolute http(s) outgoing links, deduped, max 50, excluding own domain and platform asset domains. */
export function outgoingLinks(hrefs:(string|undefined)[],pageUrl:string){
  let page='';try{page=hostname(pageUrl);}catch{}
  const assets=platformAssets[platformFor(page)] ?? [];const out:string[]=[];
  for(const h of hrefs){if(!h)continue;try{const u=new URL(h,pageUrl);if(!/^https?:$/.test(u.protocol))continue;const d=u.hostname.toLowerCase().replace(/\.$/,'');
    if(d===page||within(d,page.replace(/^www\./,''))||assets.some(a=>within(d,a)))continue;u.hash='';out.push(u.href);}catch{}}
  return uniq(out).slice(0,50);
}
export function buildIndicators(input:{hrefs:(string|undefined)[];pageUrl:string;texts:(string|null|undefined)[];aiPhones:string[];aiAccounts?:AiBankAccount[];mapsPhone:string|null;officialDomains?:string[]}):Indicators{
  const abs=input.hrefs.flatMap(h=>{if(!h)return [];try{return [new URL(h,input.pageUrl).href];}catch{return [];}});
  const whatsapp=uniq(abs.map(whatsappNumber).filter((x):x is string=>!!x));
  const tel=abs.filter(h=>/^tel:/i.test(h)).map(h=>normalizePhone(decodeURIComponent(h.slice(4))));
  const phones=uniq([...input.aiPhones,...tel,...whatsapp,...(input.mapsPhone?[input.mapsPhone]:[])].map(normalizePhone).filter(p=>p.length>=3));
  const ai=input.aiAccounts ?? [];
  const ibans=uniq([...extractIbans(input.texts),...ai.map(a=>a.iban?.replace(/\s+/g,'').toUpperCase() ?? '').filter(validIban)]);
  const accounts:Indicators['accounts']=[];
  for(const a of ai){const n=(a.account ?? '').replace(/\D/g,'');if(n.length<8||n.length>20)continue;
    if(phones.some(p=>p===n||p.endsWith(n)||n.endsWith(p)))continue;if(ibans.some(i=>i.includes(n)))continue;
    if(!accounts.some(x=>x.number===n))accounts.push({number:n,bank:a.bank?.trim()||null});}
  const links=outgoingLinks(input.hrefs,input.pageUrl);
  const socials:Indicators['socials']=[];for(const l of abs){const s=canonicalSocial(l,input.officialDomains);if(s&&!socials.some(x=>x.url===s.url))socials.push(s);}
  return {phones,whatsapp,ibans,accounts:accounts.slice(0,10),socials,links};
}
export function asIndicators(v:unknown):Indicators|null{
  if(!v||typeof v!=='object'||Array.isArray(v))return null;const o=v as Record<string,unknown>;const arr=(k:string)=>Array.isArray(o[k])?o[k] as never[]:[];
  return {phones:arr('phones'),whatsapp:arr('whatsapp'),ibans:arr('ibans'),accounts:arr('accounts'),socials:arr('socials'),links:arr('links')};
}
export type LinkGroup={key:string;host:string;path:string;urls:string[]};
/** Group links by host+path ignoring query and hash (display only). */
export function groupLinks(links:string[]):LinkGroup[]{
  const m=new Map<string,LinkGroup>();
  for(const l of links){let host=l,path='';try{const u=new URL(l);host=u.hostname.toLowerCase();path=u.pathname==='/'?'':u.pathname;}catch{}
    const key=host+path;const g=m.get(key);if(g)g.urls.push(l);else m.set(key,{key,host,path,urls:[l]});}
  return [...m.values()];
}
export const safeDecode=(s:string)=>{try{return decodeURIComponent(s);}catch{return s;}};

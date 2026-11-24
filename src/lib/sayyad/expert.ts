import { getPublicSuffix } from 'tldts';
import { platformFor, freePlatform } from './rules';
import { namePattern } from './campaigns';
/** Minimal RFC4180-style CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
export function parseCsv(text:string):string[][]{
  const s=text.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],f='',q=false;
  for(let i=0;i<s.length;i++){const c=s[i]!;
    if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(f);f='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f='';}
    else f+=c;}
  if(f||row.length){row.push(f);rows.push(row);}
  return rows.filter(r=>r.some(x=>x.trim()));
}
export function refang(raw:string){let u=raw.trim().replace(/^hxxps/i,'https').replace(/^hxxp/i,'http').replace(/\[\.\]|\(\.\)/g,'.').replace(/\[:\]/g,':');if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(u))u=`https://${u}`;return u;}
export type ExpertRow={url_raw:string;url:string;domain:string;platform:string;impersonated_entity:string|null;note:string|null;excluded_reason:string|null;expected?:'fraud'|'legit'|null};
/** Expected answer column: fraud/legit, or Arabic احتيال / سليم / رسمي. */
export function parseExpected(v?:string|null):'fraud'|'legit'|null{const x=(v ?? '').trim().toLowerCase();if(x==='fraud'||x==='احتيال')return 'fraud';if(x==='legit'||x==='سليم'||x==='رسمي')return 'legit';return null;}
const social=['facebook.com','instagram.com','tiktok.com','x.com','t.me'];
const within=(h:string,d:string)=>h===d||h.endsWith(`.${d}`);
export function normalizeExpert(raw:string,entity?:string|null,note?:string|null):ExpertRow{
  const base={url_raw:raw,impersonated_entity:entity?.trim()||null,note:note?.trim()||null};
  let u:URL;try{u=new URL(refang(raw));}catch{return {...base,url:raw.trim(),domain:'',platform:'other',excluded_reason:'رابط ناقص'};}
  u.hostname=u.hostname.toLowerCase();const h=u.hostname.replace(/^www\./,'');
  const row={...base,url:u.href,domain:u.hostname,platform:platformFor(u.hostname)};
  if(!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,}|xn--[a-z0-9-]+)$/.test(u.hostname)&&!/^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname)||!['http:','https:'].includes(u.protocol))return {...row,excluded_reason:'رابط ناقص'};
  if(/(^|\.)google\.[a-z.]+$/.test(h)&&u.pathname.startsWith('/search')){const q=u.searchParams.get('q');return {...row,note:row.note ?? q ?? null,excluded_reason:'رابط بحث وليس موقعاً'};}
  if(social.some(d=>within(h,d)))return {...row,excluded_reason:'منصة تواصل تحتاج تسجيل دخول'};
  return {...row,excluded_reason:null};
}
export function importCsv(text:string):ExpertRow[]{
  const rows=parseCsv(text);const head=(rows[0] ?? []).map(h=>h.trim().toLowerCase());
  const ui=head.indexOf('url');if(ui<0)throw new Error('يجب أن يحتوي الملف على عمود url');
  const ei=head.indexOf('impersonated_entity'),ni=head.indexOf('note'),xi=head.indexOf('expected');const seen=new Set<string>(),out:ExpertRow[]=[];
  for(const r of rows.slice(1)){const raw=r[ui]?.trim();if(!raw)continue;const x={...normalizeExpert(raw,ei>=0?r[ei]:null,ni>=0?r[ni]:null),expected:xi>=0?parseExpected(r[xi]):null};if(seen.has(x.url))continue;seen.add(x.url);out.push(x);}
  return out;
}
/** Query/fragment stripped, like manual scans. */
export const sampleUrl=(url:string)=>{const u=new URL(url);return `${u.protocol}//${u.username?`${u.username}@`:''}${u.host}${u.pathname}`;};
export function sample<T>(items:T[],n:number,rand=Math.random):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a.slice(0,Math.max(0,n));}
const tally=(keys:string[])=>[...keys.reduce((m,k)=>m.set(k,(m.get(k) ?? 0)+1),new Map<string,number>())].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
const GENERIC_TOKENS=new Set(['www','com','net','org','ae','gov','app','site','online','netlify','vercel','wix','google','sites','html','index','pages']);
/** Repeated name tokens worth turning into hunt phrases: drop official domains, generic/short tokens and gang-pattern labels (and prefixed variants). */
export function usefulTokens(rows:{domain:string}[],gangKeys:string[],isOfficial:(domain:string)=>boolean=()=>false){
  const gang=gangKeys.map(k=>k.toLowerCase()).filter(k=>k.length>=4);
  const toks=rows.filter(r=>!isOfficial(r.domain)).flatMap(r=>{const suf=getPublicSuffix(r.domain) ?? '';return r.domain.toLowerCase().slice(0,r.domain.length-suf.length).split(/[.\-_\d]+/);})
    .filter(t=>/^\p{L}+$/u.test(t)&&t.length>=4&&!GENERIC_TOKENS.has(t)&&!gang.some(g=>t===g||t.endsWith(g)||t.includes(g)));
  return tally(toks);
}
export function patternStats(rows:Pick<ExpertRow,'url_raw'|'url'|'domain'|'platform'|'excluded_reason'>[],keywords:string[],isOfficial:(domain:string)=>boolean=()=>false){
  const ok=rows.filter(r=>!r.excluded_reason);const pct=(n:number)=>ok.length?Math.round(n*100/ok.length):0;
  const kws=keywords.map(k=>k.toLowerCase()).filter(k=>k.length>=3);
  const groups=new Map<string,string[]>();for(const r of ok){const k=namePattern(r.url,r.domain,r.platform);if(k)groups.set(k,[...(groups.get(k) ?? []),r.domain]);}
  const base={total:rows.length,excluded:rows.length-ok.length,scannable:ok.length,
    byPlatform:tally(ok.map(r=>r.platform)),byTld:tally(ok.map(r=>getPublicSuffix(r.domain) ?? '—')),
    freePct:pct(ok.filter(r=>freePlatform(r.platform)).length),
    brandPct:pct(ok.filter(r=>kws.some(k=>r.domain.includes(k))).length),
    adPct:pct(ok.filter(r=>/[?&](gad_source|gclid|gbraid)=/i.test(r.url_raw)).length),
    nameGroups:[...groups].filter(([,d])=>new Set(d).size>=2).map(([key,d])=>({key:key.split('|')[1] ?? key,domains:[...new Set(d)]})).sort((a,b)=>b.domains.length-a.domains.length)};
  return {...base,topTokens:usefulTokens(ok,base.nameGroups.map(g=>g.key),isOfficial)};
}
/** Classify one expert row: unverified fallbacks and error/unscannable links are 'failed', taken-down pages 'removed'. */
export function expertLevel(a:{level:string;signals:unknown}|undefined,status:string|undefined){
  const sig=(a?.signals && typeof a.signals==='object' ? a.signals : {}) as Record<string,unknown>;
  if(sig['removed']===true||status==='removed')return 'removed';
  if(a&&sig['unverified']===true)return 'failed';
  if(a)return a.level;
  return status&&['error','unscannable'].includes(status)?'failed':null;
}
export function accuracy(rows:{link_id:string|null;url:string}[],level:(linkId:string)=>string|null){
  const c={red:0,yellow:0,green:0,failed:0,removed:0};const greens:string[]=[];
  for(const r of rows){if(!r.link_id)continue;const l=level(r.link_id);if(l==='red'||l==='yellow'||l==='green'||l==='failed'||l==='removed'){c[l]++;if(l==='green')greens.push(r.url);}}
  const judged=c.red+c.yellow+c.green,scanned=judged+c.failed+c.removed;
  return {...c,scanned,judged,detection:judged?(c.red+c.yellow)/judged:0,strict:judged?c.red/judged:0,greens};
}
/** 2x2 against the expert's expected answer; only judged rows (red/yellow/green) count. */
export function expectedMatrix(rows:{link_id:string|null;url:string;expected:string|null}[],level:(linkId:string)=>string|null){
  const m={caught:0,missed:0,legitOk:0,falseAlarm:0};const missedUrls:string[]=[],falseUrls:string[]=[];
  for(const r of rows){if(!r.link_id||!r.expected)continue;const l=level(r.link_id);if(l!=='red'&&l!=='yellow'&&l!=='green')continue;const flagged=l!=='green';
    if(r.expected==='fraud'){if(flagged)m.caught++;else{m.missed++;missedUrls.push(r.url);}}
    else if(r.expected==='legit'){if(flagged){m.falseAlarm++;falseUrls.push(r.url);}else m.legitOk++;}}
  return {...m,detection:m.caught+m.missed?m.caught/(m.caught+m.missed):null,falseRate:m.falseAlarm+m.legitOk?m.falseAlarm/(m.falseAlarm+m.legitOk):null,missedUrls,falseUrls};
}

/** Pasted list: one URL per line (defanged accepted), optional ",fraud|legit" label; max 500 unique URLs. */
export function parsePasted(text:string,max=500):ExpertRow[]{
  const seen=new Set<string>(),out:ExpertRow[]=[];
  for(const line of text.split(/\r?\n/)){const t=line.trim();if(!t)continue;const c=t.lastIndexOf(',');const label=c>0?parseExpected(t.slice(c+1)):null;const raw=(label||(c>0&&!t.slice(c+1).trim())?t.slice(0,c):t).trim();if(!raw)continue;
    const x={...normalizeExpert(raw),expected:label};if(seen.has(x.url))continue;seen.add(x.url);out.push(x);if(out.length>=max)break;}
  return out;
}
const csvCell=(v:string|number|null|undefined)=>{const s=v===null||v===undefined?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function resultsCsv(rows:{url:string;level:string|null;score:number|null;top_reason:string|null;final_url:string|null}[]){
  return ['url,level,score,top_reason,final_url',...rows.map(r=>[r.url,r.level,r.score,r.top_reason,r.final_url].map(csvCell).join(','))].join('\n');
}

import { scannerLabel } from './zyte';
// Pure rules for early detection (Certificate Transparency), WHOIS/RDAP parsing, takedown texts and exports.
import type { Tables } from '@/integrations/supabase/types';
import { officialDestination, isGenericGeo, type Entity } from './rules';
import { defangUrl } from './campaigns';
export const ctWindowDays=14,ctMaxPerKeyword=40;
export const ctTitle='نطاق جديد ظهر في سجلات الشهادات';
/** CT keywords: ASCII brand keywords of length ≥4, excluding generic place words; deduplicated. */
export function ctKeywords(entities:Entity[]){
  return [...new Set(entities.flatMap(e=>e.brand_keywords).map(k=>k.trim().toLowerCase()).filter(k=>/^[a-z0-9]+$/.test(k)&&k.length>=4&&!isGenericGeo(k)))];
}
const parseUtc=(s:string)=>Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s:`${s}Z`);
/** crt.sh records → new domains first seen within the window (oldest cert date kept), no official/neutral sites. */
export function ctDomains(records:{name_value?:string|undefined;not_before?:string|undefined}[],entities:Entity[],now:number,max=ctMaxPerKeyword){
  const since=now-ctWindowDays*86400000;const seen=new Map<string,number>();
  for(const r of records){const t=parseUtc(r.not_before ?? '');if(!Number.isFinite(t)||t<since||t>now+86400000)continue;
    for(const raw of (r.name_value ?? '').split(/\n+/)){const d=raw.trim().toLowerCase().replace(/^\*\./,'').replace(/\.$/,'');
      if(!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)||officialDestination(d,entities))continue;
      const prev=seen.get(d);if(prev===undefined||t<prev)seen.set(d,t);}}
  return [...seen].sort((a,b)=>b[1]-a[1]).slice(0,max).map(([domain,t])=>({domain,first_seen:new Date(t).toISOString()}));
}
export const ctDays=(iso:string|null|undefined,now=Date.now())=>iso?Math.max(0,Math.floor((now-Date.parse(iso))/86400000)):null;
export const ctReason=(days:number)=>`نطاق جديد ظهر في سجلات الشهادات قبل ${days} يوم`;

export type Whois={registrar:string|null;created:string|null;expires:string|null;changed:string|null;nameservers:string[];status:string[];abuse_email:string|null;abuse_phone:string|null};
type Rec=Record<string,unknown>;const rec=(v:unknown):Rec=>v&&typeof v==='object'&&!Array.isArray(v)?v as Rec:{};const arr=(v:unknown)=>Array.isArray(v)?v as unknown[]:[];const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
function vcard(entity:Rec,field:string){for(const p of arr(arr(entity['vcardArray'])[1])){const a=arr(p);if(a[0]===field){const v=a[3];return str(Array.isArray(v)?v.join(' '):v)?.replace(/^(mailto:|tel:)/i,'') ?? null;}}return null;}
/** Registration details from one RDAP response (no extra calls). Abuse contact from the registrar's "abuse" entity. */
export function parseWhois(json:unknown):Whois|null{
  const j=rec(json);if(!Object.keys(j).length)return null;
  const ev=(a:string)=>str(arr(j['events']).map(rec).find(e=>e['eventAction']===a)?.['eventDate']);
  const ents=arr(j['entities']).map(rec);const registrar=ents.find(e=>arr(e['roles']).includes('registrar'));
  const abuse=[...arr(registrar?.['entities']).map(rec),...ents].find(e=>arr(e['roles']).includes('abuse'));
  return {registrar:registrar?vcard(registrar,'fn'):null,created:ev('registration'),expires:ev('expiration'),changed:ev('last changed'),
    nameservers:arr(j['nameservers']).map(n=>str(rec(n)['ldhName'])?.toLowerCase()).filter((x):x is string=>!!x),
    status:arr(j['status']).map(str).filter((x):x is string=>!!x),abuse_email:abuse?vcard(abuse,'email'):null,abuse_phone:abuse?vcard(abuse,'tel'):null};
}

const platformNames:Record<string,string>={wix:'Wix',netlify:'Netlify',linktree:'Linktree',google_sites:'Google Sites',vercel:'Vercel',pages_dev:'Cloudflare Pages (pages.dev)'};
export type TakedownInput={case_no:string|null;url:string;final_url:string|null;platform:string;first_seen_at:string;entity:{name_ar:string;name_en:string;official_domains:string[]}|null;reasons:string[];sha256:string|null;captured_at:string|null;hosting:{ip?:string|null;asn?:string|null;asnname?:string|null;country?:string|null}|null;whois:Whois|null;socials?:string[];links?:string[]};
const gst=(iso:string|null)=>iso?`${new Date(Date.parse(iso)+4*3600000).toISOString().slice(0,16).replace('T',' ')} (UTC+4)`:'—';
export const takedownFooter='أُعد آلياً بواسطة الصيّاد للمساعدة — القرار والإرسال للجهة المختصة';
/** Method notes ("التحليل مبني على…", "الحكم مبني على تحليل الرابط فقط") explain the analysis, they are not evidence: they stay out of the request. */
export const isBasisNote=(r:string)=>r.includes('التحليل مبني على')||r.includes('الحكم مبني على تحليل الرابط فقط');
/** In-country blocking path: TDRA has no verified public address here, so the request goes through the competent authority. */
const blockAr=['للحجب داخل الدولة (بالتوازي مع الإزالة من المصدر):','- يُرفع طلب حجب إلى هيئة تنظيم الاتصالات والحكومة الرقمية (TDRA) عبر الجهة المختصة، لتوجيه مزودي الإنترنت المرخصين (e& و du) بحجب الرابط داخل الإمارات.'];
const blockEn=['In-country blocking (in parallel with removal at the source):','- A blocking request is submitted to the UAE Telecommunications and Digital Government Regulatory Authority (TDRA) through the competent authority, so licensed ISPs (e& and du) block the URL inside the UAE.'];
/** Recipients without invented addresses: registrar abuse email, hosting ASN, free-platform abuse team. */
export function takedownRecipients(t:TakedownInput){
  const ar:string[]=[],en:string[]=[];
  if(t.whois?.abuse_email){ar.push(`فريق الإساءة لدى المسجّل ${t.whois.registrar ?? ''}: ${t.whois.abuse_email}`.replace('  ',' '));en.push(`Registrar abuse${t.whois.registrar?` (${t.whois.registrar})`:''}: ${t.whois.abuse_email}`);}
  if(t.hosting?.asnname){ar.push(`مزوّد الاستضافة: ${t.hosting.asnname}${t.hosting.asn?` (AS${t.hosting.asn})`:''}`);en.push(`Hosting provider: ${t.hosting.asnname}${t.hosting.asn?` (AS${t.hosting.asn})`:''}`);}
  const p=platformNames[t.platform];if(p){ar.push(`فريق الإبلاغ في ${p}`);en.push(`${p} abuse / trust & safety team`);}
  return {ar:ar.length?ar:['الجهة المختصة'],en:en.length?en:['Competent authority']};
}
export function takedownTexts(t:TakedownInput){
  const r=takedownRecipients(t),url=defangUrl(t.url),fin=t.final_url&&t.final_url!==t.url?defangUrl(t.final_url):null;
  const ent=t.entity?`${t.entity.name_ar} (${t.entity.official_domains[0] ?? '—'})`:'—',entEn=t.entity?`${t.entity.name_en} (${t.entity.official_domains[0] ?? '—'})`:'—';
  const host=[t.hosting?.ip,t.hosting?.asnname,t.hosting?.country].filter(Boolean).join(' / ')||'—';
  const rs=t.reasons.filter(x=>!isBasisNote(x));
  // Bank accounts are never included; only scam-page social profiles and outgoing links, defanged.
  const soc=(t.socials ?? []).map(defangUrl),out=(t.links ?? []).slice(0,10).map(defangUrl);
  const ar=[`إلى: ${r.ar.join('، ')}`,`الموضوع: طلب إيقاف صفحة مشبوهة${t.case_no?` — ${t.case_no}`:''}`,'',
    'السلام عليكم،','نرجو التكرم بمراجعة الرابط التالي وإيقاف النطاق أو الصفحة، لأنه يظهر مؤشرات انتحال لجهة رسمية.','',
    ...(t.case_no?[`رقم القضية: ${t.case_no}`]:[]),`الرابط (معطّل): ${url}`,...(fin?[`الوجهة النهائية: ${fin}`]:[]),`أول رصد: ${gst(t.first_seen_at)}`,`الجهة المنتحَلة: ${ent}`,
    'أسباب الاشتباه:',...rs.map(x=>`- ${x}`),...(soc.length?['حسابات التواصل المرتبطة:',...soc.map(x=>`- ${x}`)]:[]),...(out.length?['روابط خارجية في الصفحة:',...out.map(x=>`- ${x}`)]:[]),`بصمة لقطة الشاشة SHA-256: ${t.sha256 ?? '—'}`,`وقت الالتقاط: ${gst(t.captured_at)}`,`الاستضافة / IP: ${host}`,`المسجّل: ${t.whois?.registrar ?? 'غير متاح من السجل'}`,'',
    ...blockAr,'',
    'شاكرين تعاونكم.','',takedownFooter].join('\n');
  const en=[`To: ${r.en.join('; ')}`,`Subject: Request to suspend a suspected impersonation page${t.case_no?` — ${t.case_no}`:''}`,'',
    'Hello,','We kindly ask you to review the URL below and suspend the domain or page, as it shows indicators of impersonating an official entity.','',
    ...(t.case_no?[`Case number: ${t.case_no}`]:[]),`URL (defanged): ${url}`,...(fin?[`Final URL: ${fin}`]:[]),`First detected: ${gst(t.first_seen_at)}`,`Impersonated entity: ${entEn}`,
    `Indicators (Arabic, from the automated analysis):`,...rs.map(x=>`- ${x}`),...(soc.length?['Linked social profiles:',...soc.map(x=>`- ${x}`)]:[]),...(out.length?['Outgoing links on the page:',...out.map(x=>`- ${x}`)]:[]),`Screenshot SHA-256: ${t.sha256 ?? '—'}`,`Captured at: ${gst(t.captured_at)}`,`Hosting / IP: ${host}`,`Registrar: ${t.whois?.registrar ?? 'not available from the registry'}`,'',
    ...blockEn,'',
    'Thank you for your cooperation.','',`${takedownFooter}`,'Prepared automatically by Sayyad to assist — the decision and submission rest with the competent authority.'].join('\n');
  return {ar,en};
}

/** Follow-up: links now removed that were red/yellow before (from analysis_history) and mean hours to takedown. */
export function takedownStats(links:Pick<Tables<'links'>,'id'|'status'|'first_seen_at'>[],analyses:Pick<Tables<'analyses'>,'link_id'|'created_at'|'signals'>[],history:{link_id:string;analysis:unknown}[]){
  const flaggedBefore=new Set(history.filter(h=>{const l=rec(h.analysis)['level'];return l==='red'||l==='yellow';}).map(h=>h.link_id));
  const byLink=new Map(analyses.map(a=>[a.link_id,a]));const hours:number[]=[];let count=0;
  for(const l of links){const a=byLink.get(l.id);const removed=l.status==='removed'||rec(a?.signals)['removed']===true;if(!removed||!flaggedBefore.has(l.id))continue;count++;
    if(a){const h=(Date.parse(a.created_at)-Date.parse(l.first_seen_at))/3600000;if(Number.isFinite(h)&&h>=0)hours.push(h);}}
  return {stopped:count,avgHours:hours.length?Math.round(hours.reduce((x,y)=>x+y,0)/hours.length*10)/10:null};
}
/** Red/yellow links whose first source is the CT watch (found before they show up in search). */
export function ctEarlyCount(links:Pick<Tables<'links'>,'id'|'hunt_id'|'status'>[],analyses:Pick<Tables<'analyses'>,'link_id'|'level'|'signals'>[],hunts:Pick<Tables<'hunts'>,'id'|'source'>[]){
  const ct=new Set(hunts.filter(h=>h.source==='ct').map(h=>h.id));const byLink=new Map(analyses.map(a=>[a.link_id,a]));
  return links.filter(l=>{const a=byLink.get(l.id);return l.hunt_id&&ct.has(l.hunt_id)&&l.status!=='removed'&&a&&rec(a.signals)['removed']!==true&&(a.level==='red'||a.level==='yellow');}).length;
}

export type CaseRow={case_no:string;url:string;final_url:string|null;entity:string|null;level:string;score:number;top_reasons:string[];first_seen:string|null;captured_at:string|null;sha256:string|null;case_status:string;removed:boolean;urgent:'yes'|'no'|'unknown';scanner?:string|null;indicators?:import('./indicators').Indicators|null};
const cell=(v:unknown)=>{const s=v===null||v===undefined?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function casesCsv(rows:CaseRow[]){
  const cols=['case_no','url','final_url','entity','level','score','top_reasons','first_seen','captured_at','sha256','case_status','removed','urgent','scanner','phones','whatsapp','ibans','socials'] as const;
  return [cols.join(','),...rows.map(r=>cols.map(c=>c==='url'?cell(defangUrl(r.url)):c==='final_url'?cell(r.final_url?defangUrl(r.final_url):''):c==='top_reasons'?cell(r.top_reasons.join(' | ')):c==='removed'?(r.removed?'yes':'no'):c==='scanner'?cell(scannerLabel(r.scanner)):c==='phones'||c==='whatsapp'||c==='ibans'?cell((r.indicators?.[c] ?? []).join(' | ')):c==='socials'?cell((r.indicators?.socials ?? []).map(x=>x.url).join(' | ')):cell(r[c])).join(','))].join('\n');
}
export const casesJson=(rows:CaseRow[])=>JSON.stringify(rows.map(r=>({...r,url:defangUrl(r.url),final_url:r.final_url?defangUrl(r.final_url):null,removed:r.removed?'yes':'no',scanner:scannerLabel(r.scanner)||null})),null,2);

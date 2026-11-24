import { getPublicSuffix } from 'tldts';
import type { Tables } from '@/integrations/supabase/types';
import { normalizePhone, registrationDomain, freePlatform } from './rules';
type Link=Pick<Tables<'links'>,'id'|'url'|'domain'|'platform'|'parent_link_id'|'maps_phone'|'first_seen_at'|'hunt_id'>;
type Analysis=Pick<Tables<'analyses'>,'link_id'|'level'|'phones_found'|'hosting'|'page_title'|'impersonated_entity_id'|'created_at'>;
type Entity=Pick<Tables<'entities'>,'id'|'name_ar'|'official_phones'|'official_domains'>;
export const R={chain:'مرتبطة بسلسلة تحويل',host:'نفس الاستضافة',title:'نفس قالب الصفحة',name:'نفس نمط الاسم'} as const;
export const phoneReason=(p:string)=>`نفس رقم الهاتف: ****${p.slice(-4)}`;
/** UAE numbers to one canonical 971… form. */
export function uaeCanonical(p:string){const d=normalizePhone(p);if(/^0[2-9]\d{7,8}$/.test(d))return `971${d.slice(1)}`;return d;}
export const normTitle=(t:string)=>t.toLowerCase().replace(/[\p{P}\p{S}\p{N}\s]/gu,'');
const prefixes=['www','secure','legal','infor','info','pay'];
/** Rule (e): platform-or-suffix key + label without digits/hyphens/common prefixes; null when < 5 chars. */
export function namePattern(url:string,domain:string,platform:string):string|null{
  let label:string;
  if(platform==='linktree'){try{label=new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';}catch{label='';}}
  else if(platform!=='other'){label=domain.split('.').find(l=>l!=='www') ?? '';}
  else{label=registrationDomain(domain).split('.')[0] ?? '';}
  let core=label.toLowerCase().replace(/[\d\-_.]/g,'');
  for(let changed=true;changed;){changed=false;for(const p of prefixes)if(core.startsWith(p)&&core.length-p.length>=5){core=core.slice(p.length);changed=true;}}
  if(core.length<5)return null;
  return `${platform!=='other'?platform:`tld:${getPublicSuffix(domain) ?? ''}`}|${core}`;
}
export const defangUrl=(u:string)=>u.replace(/^http/i,'hxxp').replace(/\./g,'[.]');
export const defangDomain=(d:string)=>d.replace(/\./g,'[.]');
export function withoutExpert<T extends {hunts:Tables<'hunts'>[];links:Tables<'links'>[];analyses:Tables<'analyses'>[]}>(d:T):T{
  const hidden=new Set(d.hunts.filter(h=>h.source==='expert_sample').map(h=>h.id));
  if(!hidden.size)return d;
  const links=d.links.filter(l=>!l.hunt_id||!hidden.has(l.hunt_id));const ids=new Set(links.map(l=>l.id));
  return {...d,hunts:d.hunts.filter(h=>!hidden.has(h.id)),links,analyses:d.analyses.filter(a=>ids.has(a.link_id))};
}
export type CampaignDraft={entity_id:string|null;name_ar:string;first_seen_at:string;last_seen_at:string;link_count:number;signals:{reasons_ar:string[];platforms:string[]};links:{link_id:string;reasons_ar:string[]}[]};
/** Deterministic red-only clustering (union-find). */
export function clusterCampaigns(input:{links:Link[];analyses:Analysis[];entities:Entity[];excludedHuntIds?:Set<string>}):CampaignDraft[]{
  const byId=new Map(input.links.map(l=>[l.id,l]));
  const latest=new Map<string,Analysis>();for(const a of input.analyses){const p=latest.get(a.link_id);if(!p||p.created_at<a.created_at)latest.set(a.link_id,a);}
  const red=input.links.filter(l=>latest.get(l.id)?.level==='red'&&!(l.hunt_id&&input.excludedHuntIds?.has(l.hunt_id)));
  const official=new Set(input.entities.flatMap(e=>e.official_phones.map(uaeCanonical)));
  const root=(l:Link)=>{let c=l;const seen=new Set<string>();while(c.parent_link_id&&!seen.has(c.id)){seen.add(c.id);const p=byId.get(c.parent_link_id);if(!p)return c.parent_link_id;c=p;}return c.id;};
  const facts=red.map(l=>{const a=latest.get(l.id)!;const h=(a.hosting ?? {}) as {ip?:string|null;asn?:string|null};
    const phones=new Set([...a.phones_found,...(l.maps_phone?[l.maps_phone]:[])].map(uaeCanonical).filter(p=>p.length>=7&&!official.has(p)));
    const t=normTitle(a.page_title ?? '');
    return {l,a,root:root(l),phones,ip:h.ip ?? null,asn:h.asn ?? null,title:t.length>=8?t:null,name:namePattern(l.url,l.domain,l.platform)};});
  const parent=red.map((_,i)=>i);const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]!));
  const reasons=red.map(()=>new Set<string>());
  const join=(i:number,j:number,r:string)=>{parent[find(i)]=find(j);reasons[i]!.add(r);reasons[j]!.add(r);};
  for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){const x=facts[i]!,y=facts[j]!;
    if(x.l.parent_link_id===y.l.id||y.l.parent_link_id===x.l.id||x.root===y.root)join(i,j,R.chain);
    for(const p of x.phones)if(y.phones.has(p))join(i,j,phoneReason(p));
    const sameEntity=!!x.a.impersonated_entity_id&&x.a.impersonated_entity_id===y.a.impersonated_entity_id;
    const shared=freePlatform(x.l.platform)||freePlatform(y.l.platform);
    if(shared?(sameEntity&&((x.ip&&x.ip===y.ip)||(x.asn&&x.asn===y.asn))):((x.ip&&x.ip===y.ip)||(x.asn&&x.asn===y.asn&&sameEntity)))join(i,j,R.host);
    if(x.title&&x.title===y.title&&sameEntity)join(i,j,R.title);
    if(x.name&&x.name===y.name)join(i,j,R.name);
  }
  const groups=new Map<number,number[]>();facts.forEach((_,i)=>{const r=find(i);groups.set(r,[...(groups.get(r) ?? []),i]);});
  const out:CampaignDraft[]=[];
  for(const idx of groups.values()){if(idx.length<2)continue;
    const m=idx.map(i=>facts[i]!).sort((a,b)=>a.l.first_seen_at.localeCompare(b.l.first_seen_at));
    const tally=new Map<string,number>();for(const f of m)if(f.a.impersonated_entity_id)tally.set(f.a.impersonated_entity_id,(tally.get(f.a.impersonated_entity_id) ?? 0)+1);
    const entityId=[...tally].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null;const entity=input.entities.find(e=>e.id===entityId);
    const platforms=[...new Set(m.map(f=>f.l.platform))];
    const dates=m.flatMap(f=>[f.l.first_seen_at,f.a.created_at]).sort();
    out.push({entity_id:entityId,name_ar:`${entity?`حملة انتحال ${entity.name_ar}`:'حملة غير مصنفة'} — ${platforms[0]}`,first_seen_at:dates[0]!,last_seen_at:dates[dates.length-1]!,link_count:m.length,
      signals:{reasons_ar:[...new Set(idx.flatMap(i=>[...reasons[i]!]))],platforms},links:idx.map(i=>({link_id:facts[i]!.l.id,reasons_ar:[...reasons[i]!]}))});
  }
  return out.sort((a,b)=>b.link_count-a.link_count);
}
export function awarenessMessage(entity:Entity|null|undefined,domains:string[]){
  const parts=[`تحذير: رصدنا مواقع احتيالية تنتحل ${entity?.name_ar ?? 'جهات رسمية'}. لا تدخل بيانات بطاقتك أو حسابك فيها: ${domains.slice(0,5).map(defangDomain).join('، ')}.`];
  if(entity?.official_domains[0])parts.push(`الموقع الرسمي الوحيد: ${entity.official_domains[0]}.`);
  if(entity?.official_phones[0])parts.push(`للتواصل الرسمي: ${entity.official_phones[0]}.`);
  parts.push('للإبلاغ: خدمة أمان من شرطة أبوظبي على 8002626 أو رسالة نصية إلى 2828.');
  return parts.join(' ');
}

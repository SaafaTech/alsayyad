import { getDomain } from 'tldts';
import { distance } from 'fastest-levenshtein';
import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';
export type Entity = Tables<'entities'>;
export const aiSchema = z.object({
  impersonated_entity: z.string().nullable(), impersonation_confidence: z.number().min(0).max(1),
  asks_payment_or_card: z.boolean(), asks_sensitive_data: z.boolean(),
  phones_found: z.array(z.string().regex(/^\d+$/)).max(30), summary_ar: z.string().max(1000),
});
export type AiFinding = z.infer<typeof aiSchema>;
export const linkIdSchema = z.object({ link_id: z.string().uuid() });
export const phraseSchema = z.object({ phrase: z.string().trim().min(1).max(300) });
export function cleanUrl(raw: string): string {
  let u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  for (let i=0; i<3; i++) {
    if ((u.hostname === 'google.com' || u.hostname.endsWith('.google.com')) && ['/url','/goto'].includes(u.pathname)) {
      const target = u.searchParams.get('q') || u.searchParams.get('url') || u.searchParams.get('target') || u.searchParams.get('u');
      if (!target) break;
      u = new URL(target);
    } else break;
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('رابط غير صالح');
  const h=u.hostname.toLowerCase();
  if (!h.includes('.') || h==='localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':') || ['local','internal','localhost'].some(t=>h.endsWith(`.${t}`))) throw new Error('يُسمح بالنطاقات العامة فقط');
  u.hash=''; return u.href;
}
export const hostname = (url: string) => new URL(url).hostname.toLowerCase().replace(/\.$/,'');
export const within = (domain: string, official: string) => domain===official || domain.endsWith(`.${official}`);
const neutral=['wikipedia.org','youtube.com','gulfnews.com','khaleejtimes.com','thenationalnews.com','emaratalyoum.com','alkhaleej.ae','wam.ae','u.ae','gov.ae'];
export function officialMatch(domain: string, entities: Entity[]) {
  const entity=entities.find(e=>e.official_domains.some(d=>within(domain,d)));
  if(entity) return {entity, reason:'نطاق رسمي مسجل'};
  if(neutral.some(d=>within(domain,d))) return {entity:null, reason:'موقع معروف'};
  return null;
}
export function platformFor(domain: string) {
  const platforms: [string,string][]=[['linktr.ee','linktree'],['wixsite.com','wix'],['wix.com','wix'],['sites.google.com','google_sites'],['pages.dev','pages_dev'],['netlify.app','netlify'],['vercel.app','vercel'],['instagram.com','instagram']];
  return platforms.find(([d])=>within(domain,d))?.[1] ?? 'other';
}
export const freePlatform = (platform: string)=>['linktree','wix','google_sites','pages_dev','netlify','vercel'].includes(platform);
export const registrationDomain = (domain: string)=>getDomain(domain,{allowPrivateDomains:false}) ?? domain;
export function normalizePhone(p: string) {
  const digits=p.replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g,'');
  return digits.startsWith('00971') ? digits.slice(2) : digits;
}
const canonicalPhone = (p:string) => {const n=normalizePhone(p);return n.startsWith('971') ? n.slice(3) : n.startsWith('0') ? n.slice(1) : n;};
export function uaePhone(p:string) {return /^(971[234679]\d{7}|9715[024568]\d{7}|0[234679]\d{7}|05[024568]\d{7}|800\d{3,9}|600\d{6}|\d{3,4})$/.test(normalizePhone(p));}
export function similarityEntity(url: string, entities: Entity[]) {
  const h=hostname(url), path=decodeURIComponent(new URL(url).pathname).toLowerCase(), target=`${h}${path}`;
  return entities.find(e=>!e.official_domains.some(d=>within(h,d)) && (
    e.brand_keywords.some(k=>{const s=k.toLowerCase().replace(/\s+/g,'');return s.length>2 ? target.replace(/\s+/g,'').includes(s) : target.split(/[.\/\-_]/).some(part=>part===s || part.startsWith(`${s}service`));}) ||
    e.official_domains.some(d=>target.includes(d) || distance(registrationDomain(h),d)<=2 || (d.split('.')[0]?.length ?? 0)>=3 && h.split('.').some(p=>p.includes(d.split('.')[0] ?? '\0')))
  )) ?? null;
}
export function riskLevel(score:number): 'green'|'yellow'|'red' {return score<30?'green':score<60?'yellow':'red';}
export function scoreFinding(input:{url:string;entities:Entity[];ai:AiFinding;age:number|null;mapsPhone:string|null;platform:string}) {
  const domain=hostname(input.url);
  const named=input.entities.find(e=>e.name_en===input.ai.impersonated_entity) ?? null;
  const similar=similarityEntity(input.url,input.entities);
  const entity=named ?? similar;
  const reasons:string[]=[];const signals:Record<string,number|boolean|string|null>={};let score=0;
  const add=(key:string,points:number,reason:string)=>{signals[key]=points;score+=points;reasons.push(reason);};
  if(named && input.ai.impersonation_confidence>=0.6 && !named.official_domains.some(d=>within(domain,d))) add('impersonation',35,`ينتحل هوية ${named.name_ar} بثقة ${Math.round(input.ai.impersonation_confidence*100)}٪ على نطاق غير رسمي`);
  if(similar) add('similarity',30,`يحمل اسم ${similar.name_ar} على نطاق غير رسمي: ${domain}`);
  if(input.ai.asks_payment_or_card || input.ai.asks_sensitive_data) add('sensitive_request',20,input.ai.asks_sensitive_data?'يطلب بيانات حساسة مثل كلمة المرور أو رمز التحقق أو الهوية أو الحساب البنكي':'يطلب الدفع أو بيانات البطاقة المصرفية');
  if(input.age!==null && input.age<90) add('new_domain',15,`النطاق عمره ${input.age} يوم فقط`);
  const phones=[...new Set([...input.ai.phones_found,...(input.mapsPhone?[input.mapsPhone]:[])].map(normalizePhone))];
  const mismatch=entity ? phones.find(p=>uaePhone(p) && !entity.official_phones.some(o=>canonicalPhone(o)===canonicalPhone(p))) : null;
  if(mismatch && entity) add('phone_mismatch',10,`رقم الهاتف ${mismatch} لا يطابق الأرقام الرسمية لـ${entity.name_ar}: ${entity.official_phones.join('، ') || 'لا توجد أرقام مسجلة'}`);
  if(freePlatform(input.platform)) add('free_platform',10,`الموقع مستضاف على منصة مجانية: ${input.platform}`);
  score=Math.min(100,score);signals['confidence']=input.ai.impersonation_confidence;
  return {score,level:riskLevel(score),reasons_ar:reasons.length?reasons:['لا توجد علامات انتحال في الأدلة المتاحة'],signals,entity,phones};
}
export function chainDestinations(urls:string[],entities:Entity[],depth:number) {
  if(depth>=2)return [];
  const domains=new Set<string>();const destinations:string[]=[];
  for(const raw of urls) {try {const url=cleanUrl(raw),domain=hostname(url);if(officialMatch(domain,entities) || domains.has(domain))continue;domains.add(domain);destinations.push(url);if(destinations.length===5)break;}catch{continue;}}
  return destinations;
}

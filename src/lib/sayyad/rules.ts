import { getDomain, getPublicSuffix } from 'tldts';
import { distance } from 'fastest-levenshtein';
import { z } from 'zod';
import type { Tables } from '@/integrations/supabase/types';
export type Entity = Tables<'entities'>;
export const aiSchema = z.object({
  impersonated_entity: z.string().nullable(), impersonation_confidence: z.number().min(0).max(1),
  asks_payment_or_card: z.boolean(), asks_sensitive_data: z.boolean(),
  phones_found: z.array(z.string().regex(/^\d+$/)).max(30), summary_ar: z.string().max(1000),
  scam_type: z.enum(['none','unlicensed_domestic_workers','fund_recovery','fake_insurance','fake_shop_payment','fake_job','fake_investment','fake_real_estate','too_good_price']).optional(),
  scam_confidence: z.number().min(0).max(1).optional(),
});
export const scamTypes=['none','unlicensed_domestic_workers','fund_recovery','fake_insurance','fake_shop_payment','fake_job','fake_investment','fake_real_estate','too_good_price'] as const;
const scamPrefix='مؤشرات احتيال محتملة: ';
export const scamReasons:Record<string,string>={unlicensed_domestic_workers:scamPrefix+'عرض عمالة منزلية بدون ترخيص واضح',fund_recovery:scamPrefix+'وعد باسترجاع أموال مسروقة',fake_insurance:scamPrefix+'عرض تأمين غير موثق',fake_shop_payment:scamPrefix+'متجر أو رابط دفع غير موثق',fake_job:scamPrefix+'عرض وظيفة غير موثق',fake_investment:scamPrefix+'عرض استثمار غير موثق',fake_real_estate:scamPrefix+'عرض عقاري غير موثق',too_good_price:scamPrefix+'أسعار غير واقعية'};
export const scamThreshold=0.75;
/** Generic place/country words never identify an entity on their own (housecleaningabudhabi is not TAMM). */
export const genericGeoWords=['abudhabi','abu-dhabi','dubai','sharjah','ajman','uae','emirates','emirati','alain','rak','fujairah','ummalquwain','gulf','arab'];
const geoKey=(k:string)=>k.toLowerCase().replace(/[\s\-_]+/g,'');
export const isGenericGeo=(k:string)=>genericGeoWords.map(geoKey).includes(geoKey(k));
const riskyTlds=['live','site','online','xyz','shop','top','icu','buzz','click','store','cfd','sbs'];
const removedHosts=['accounts.google.com','www.wix.com','wix.com','app.netlify.com','www.netlify.com','login.microsoftonline.com'];
const removedTitles=['page not found','site not found','not found','404',"this site isn't available",'deploy not found','الصفحة غير موجودة'];
/** A taken-down page: 404/410, a redirect to a platform login/landing host, or a not-found title. */
export function isRemovedPage(input:{status:number|null;finalUrl:string;redirected:boolean;title?:string|null}) {
  if(input.status===404||input.status===410)return true;
  const u=new URL(input.finalUrl),h=u.hostname.toLowerCase();
  if(input.redirected&&(removedHosts.includes(h)||(h==='linktr.ee'&&u.pathname==='/')))return true;
  const t=(input.title ?? '').trim().toLowerCase().replace(/[’`]/g,"'");
  return !!t&&removedTitles.some(x=>t.includes(x));
}
export const unverifiedReason='تعذر فحص الصفحة؛ لا يمكن الحكم بأنها آمنة — تحتاج مراجعة يدوية';
/** Fallback scoring can never call a page safe: green becomes yellow (score kept) and is flagged unverified. */
export function unverifiedFallback<T extends {score:number;level:'green'|'yellow'|'red';reasons_ar:string[];signals:Record<string,number|boolean|string|null>}>(scored:T):T {
  if(scored.level!=='green')return {...scored,signals:{...scored.signals,unverified:false}};
  return {...scored,level:'yellow',reasons_ar:[...scored.reasons_ar,unverifiedReason],signals:{...scored.signals,unverified:true}};
}
export type AiFinding = z.infer<typeof aiSchema>;
export const linkIdSchema = z.object({ link_id: z.string().uuid() });
export const phraseSchema = z.object({ phrase: z.string().trim().min(1).max(300) });
export const scanSubmissionSchema = z.object({uuid:z.string().uuid()});
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
const publicServices=['dubai.ae','rak.ae','sharjah.ae','shj.ae','ajman.ae','sedd.ae','ajmanded.ae','parkin.ae','evg.ae'];
/** The single official test used on arrival, before scanning, after redirects, in chains and destinations. */
export function officialDestination(domain: string, entities: Entity[]) {
  const d=domain.toLowerCase().replace(/\.$/,'');
  const entity=entities.find(e=>e.official_domains.some(o=>within(d,o)));
  if(entity) return {entity, reason:'نطاق رسمي مسجل'};
  if(neutral.some(n=>within(d,n))) return {entity:null, reason:'موقع معروف'};
  if(publicServices.some(n=>within(d,n))) return {entity:null, reason:'موقع حكومي أو خدمة عامة معروفة'};
  if(d.endsWith('.gov.ae')||d.endsWith('.abudhabi')||d==='apps.apple.com'||d==='play.google.com') return {entity:null, reason:'وجهة رسمية معروفة'};
  return null;
}
export const officialMatch=officialDestination;
const serviceWords=['serv','pay','online','fine','portal','login','update','verify','renew','card','topup','recharge','gov','uae','ae'];
export const shortTokenServiceMatch=(host:string,token:string)=>token.length>0&&token.length<=3&&host.split('.').some(label=>label.startsWith(token)&&serviceWords.some(w=>label.slice(token.length).replace(/[-_]/g,'').startsWith(w)));
const paymentWords=['دفع','سداد','تسديد','مخالفات','غرامة','رسوم','تعبئة رصيد','شحن رصيد','pay','payment','fine','top up','recharge'];
export function mentionsPayment(texts:(string|null|undefined)[]) {
  const t=texts.filter(Boolean).join(' ').toLowerCase().replace(/\s+/g,' ');
  return paymentWords.some(w=>/^[a-z ]+$/.test(w)?new RegExp(`(^|[^a-z])${w}`).test(t):t.includes(w));
}
export function platformFor(domain: string) {
  const platforms: [string,string][]=[['linktr.ee','linktree'],['wixsite.com','wix'],['wixstudio.com','wix'],['wix.com','wix'],['sites.google.com','google_sites'],['pages.dev','pages_dev'],['netlify.app','netlify'],['vercel.app','vercel'],['instagram.com','instagram']];
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
const tld=(d:string)=>getPublicSuffix(d,{allowPrivateDomains:false}) ?? d.split('.').pop() ?? '';
/** Long official labels tolerate two edits; short ones only one edit on the same TLD (rak.ae is not rta.ae). */
export function nearSpelling(candidate:string,official:string) {
  const label=official.split('.')[0] ?? '';
  return label.length>=6 ? distance(candidate,official)<=2 : distance(candidate,official)<=1 && tld(candidate)===tld(official);
}
/** Name similarity from the URL. A path counts only on free platforms (the path is the page identity there); on own domains a path mention needs AI confirmation (see scoreFinding). */
export function similarityEntity(url: string, entities: Entity[], opts:{path?:boolean}={}) {
  const h=hostname(url), path=decodeURIComponent(new URL(url).pathname).toLowerCase();
  const usePath=opts.path ?? freePlatform(platformFor(h));
  const target=usePath?`${h}${path}`:h;
  return entities.find(e=>!e.official_domains.some(d=>within(h,d)) && (
    e.brand_keywords.filter(k=>!isGenericGeo(k)).some(k=>{const s=k.toLowerCase().replace(/\s+/g,'');return s.length>=4 ? target.replace(/\s+/g,'').includes(s) : target.split(/[.\/\-_]/).some(part=>part===s || part.startsWith(`${s}service`)) || shortTokenServiceMatch(h,s);}) ||
    e.official_domains.some(d=>{const label=d.split('.')[0] ?? '';return !isGenericGeo(label)&&shortTokenServiceMatch(h,label);}) ||
    e.official_domains.some(d=>{const label=d.split('.')[0] ?? '';return target.includes(d) || nearSpelling(registrationDomain(h),d) || (!isGenericGeo(label)&&label.length>=4 && h.split('.').some(p=>p.includes(label)));})
  )) ?? null;
}
export function riskLevel(score:number): 'green'|'yellow'|'red' {return score<30?'green':score<60?'yellow':'red';}
export type ParentSuspicion={entity:Entity;domain:string}|null;
export function scoreFinding(input:{url:string;entities:Entity[];ai:AiFinding;age:number|null;mapsPhone:string|null;platform:string;parent?:ParentSuspicion;evidenceText?:(string|null|undefined)[]}) {
  const domain=hostname(input.url);
  const named=input.entities.find(e=>e.name_en===input.ai.impersonated_entity) ?? null;
  const pathOnly=similarityEntity(input.url,input.entities,{path:true});
  const hostSimilar=similarityEntity(input.url,input.entities);
  // Mentions outside the domain count only when the AI confirms impersonation of that same entity.
  const similar=hostSimilar ?? (pathOnly&&named?.id===pathOnly.id&&input.ai.impersonation_confidence>=0.6?pathOnly:null);
  const parent=input.parent && !officialDestination(domain,input.entities) ? input.parent : null;
  const entity=named ?? similar ?? parent?.entity ?? null;
  const asksPayment=input.ai.asks_payment_or_card || mentionsPayment(input.evidenceText ?? []);
  const reasons:string[]=[];const signals:Record<string,number|boolean|string|null>={};let score=0;
  const add=(key:string,points:number,reason:string)=>{signals[key]=points;score+=points;reasons.push(reason);};
  if(named && input.ai.impersonation_confidence>=0.6 && !named.official_domains.some(d=>within(domain,d))) add('impersonation',35,`ينتحل هوية ${named.name_ar} بثقة ${Math.round(input.ai.impersonation_confidence*100)}٪ على نطاق غير رسمي`);
  if(similar) add('similarity',30,`يحمل اسم ${similar.name_ar} على نطاق غير رسمي: ${domain}`);
  if(parent) add('inherited_suspicion',30,`مرتبط بصفحة تنتحل ${parent.entity.name_ar}: ${parent.domain}`);
  if(asksPayment || input.ai.asks_sensitive_data) add('sensitive_request',20,input.ai.asks_sensitive_data?'يطلب بيانات حساسة مثل كلمة المرور أو رمز التحقق أو الهوية أو الحساب البنكي':'يطلب الدفع أو بيانات البطاقة المصرفية');
  if(input.age!==null && input.age<90) add('new_domain',15,`النطاق عمره ${input.age} يوم فقط`);
  const phones=[...new Set([...input.ai.phones_found,...(input.mapsPhone?[input.mapsPhone]:[])].map(normalizePhone))];
  const mismatch=entity ? phones.find(p=>uaePhone(p) && !entity.official_phones.some(o=>canonicalPhone(o)===canonicalPhone(p))) : null;
  if(mismatch && entity) add('phone_mismatch',10,`رقم الهاتف ${mismatch} لا يطابق الأرقام الرسمية لـ${entity.name_ar}: ${entity.official_phones.join('، ') || 'لا توجد أرقام مسجلة'}`);
  const scam=input.ai.scam_type ?? 'none',scamConf=input.ai.scam_confidence ?? 0;
  if(scam!=='none'&&scamConf>=scamThreshold) add('scam_pattern',30,scamReasons[scam] ?? 'نمط احتيال معروف');
  const suffix=getPublicSuffix(domain,{allowPrivateDomains:false}) ?? '';
  if(!freePlatform(input.platform)&&riskyTlds.includes(suffix)) add('risky_tld',10,`امتداد نطاق شائع في الاحتيال (.${suffix})`);
  if(freePlatform(input.platform)) add('free_platform',10,`الموقع مستضاف على منصة مجانية: ${input.platform}`);
  score=Math.min(100,score);signals['confidence']=input.ai.impersonation_confidence;signals['scam_type']=scam;signals['scam_confidence']=scamConf;
  return {score,level:riskLevel(score),reasons_ar:reasons.length?reasons:['لا توجد علامات انتحال في الأدلة المتاحة'],signals,entity,phones};
}
export function chainDestinations(urls:string[],entities:Entity[],depth:number) {
  if(depth>=2)return [];
  const domains=new Set<string>();const destinations:string[]=[];
  for(const raw of urls) {try {const url=cleanUrl(raw),domain=hostname(url);if(officialDestination(domain,entities) || domains.has(domain))continue;domains.add(domain);destinations.push(url);if(destinations.length===5)break;}catch{continue;}}
  return destinations;
}
const platformAssets:Record<string,string[]>={linktree:['linktr.ee','linktree.com'],wix:['wix.com','wixstatic.com','wixsite.com','wixstudio.com','parastorage.com'],google_sites:['sites.google.com','googleusercontent.com','gstatic.com'],pages_dev:['pages.dev'],netlify:['netlify.app'],vercel:['vercel.app']};
const socialProfiles=['instagram.com','x.com','twitter.com','facebook.com','youtube.com','tiktok.com','snapchat.com'];
const contactChannels=['wa.me','api.whatsapp.com','t.me'];
export function classifyDestinations(domains:string[],pageDomain:string,entities:Entity[]) {
  const assets=platformAssets[platformFor(pageDomain)] ?? [];
  const out={official:[] as string[],ignored:[] as string[],unofficial:[] as string[]};
  for(const raw of new Set(domains.map(d=>d.toLowerCase().replace(/\.$/,'')))) {
    if(!raw||raw===pageDomain)continue;
    if(contactChannels.some(c=>within(raw,c)))out.unofficial.push(raw);
    else if(officialDestination(raw,entities))out.official.push(raw);
    else if(assets.some(a=>within(raw,a))||socialProfiles.some(sp=>within(raw,sp)))out.ignored.push(raw);
    else out.unofficial.push(raw);
  }
  return out;
}
export function applyOfficialDestinations<T extends {score:number;level:'green'|'yellow'|'red';reasons_ar:string[];signals:Record<string,number|boolean|string|null>}>(scored:T,destinations:ReturnType<typeof classifyDestinations>,platform:string,ai:AiFinding):T {
  if(!freePlatform(platform)||destinations.official.length<1||destinations.unofficial.length>0||ai.asks_sensitive_data||scored.signals['scam_pattern'])return scored;
  return {...scored,score:0,level:'green',reasons_ar:[`صفحة وسيطة كل روابطها تودي لمواقع رسمية: ${destinations.official.slice(0,4).join('، ')}`],signals:{...scored.signals,official_destinations:true}};
}

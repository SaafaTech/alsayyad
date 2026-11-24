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
  visual_brand_match: z.boolean().optional(), visual_brand_entity: z.string().nullable().optional(),
  bank_accounts: z.array(z.object({iban:z.string().nullable(),account:z.string().nullable(),bank:z.string().nullable()})).max(10).optional(),
});
/** Neutral AI finding used when no page or search evidence exists (lexical-only verdicts). */
export const neutralAi={impersonated_entity:null,impersonation_confidence:0,asks_payment_or_card:false,asks_sensitive_data:false,phones_found:[],summary_ar:'',scam_type:'none' as const,scam_confidence:0,visual_brand_match:false,visual_brand_entity:null};
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
export const lexicalOnlyReason='الحكم مبني على تحليل الرابط فقط (الصفحة لم تُفحص)';
export const unverifiedReason='تعذر فحص الصفحة؛ لا يمكن الحكم بأنها آمنة — تحتاج مراجعة يدوية';
/** Fallback scoring can never call a page safe: green becomes yellow (score kept) and is flagged unverified. */
export function unverifiedFallback<T extends {score:number;level:'green'|'yellow'|'red';reasons_ar:string[];signals:Record<string,number|boolean|string|null>}>(scored:T):T {
  if(scored.level==='red'&&Number(scored.signals['lexical'] ?? 0)>0)return {...scored,reasons_ar:[...scored.reasons_ar,lexicalOnlyReason],signals:{...scored.signals,unverified:false}};
  if(scored.level!=='green')return {...scored,signals:{...scored.signals,unverified:false}};
  return {...scored,level:'yellow',reasons_ar:[...scored.reasons_ar,unverifiedReason],signals:{...scored.signals,unverified:true}};
}
export const newUnscannableReason='نطاق عمره أيام وتعذر فحص صفحته — أولوية مراجعة';
/** A brand-new own domain whose page could not be scanned rises in the review queue: +25, never red from this rule alone. */
export function applyNewUnscannable<T extends {score:number;level:'green'|'yellow'|'red';reasons_ar:string[];signals:Record<string,number|boolean|string|null>}>(scored:T,opts:{platform:string;ageDays:number|null;ctFirstSeen:string|null;now?:Date}):T {
  if(scored.signals['new_unscannable'])return scored;
  if(freePlatform(opts.platform))return scored;
  const now=opts.now ?? new Date();
  const fresh=opts.ageDays!==null?opts.ageDays<=7:(opts.ctFirstSeen?now.getTime()-new Date(opts.ctFirstSeen).getTime()<=7*24*60*60*1000:false);
  if(!fresh)return scored;
  const score=Math.min(100,scored.score+25);
  return {...scored,score,level:riskLevel(score),reasons_ar:[...scored.reasons_ar,newUnscannableReason],signals:{...scored.signals,new_unscannable:25}};
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
  // A username alone is kept as evidence of the "@" trick (http://salik.ae@evil.example); passwords are refused.
  if (!['http:', 'https:'].includes(u.protocol) || u.password) throw new Error('رابط غير صالح');
  const h=u.hostname.toLowerCase();
  if (!h.includes('.') || h==='localhost' || (isIpv4(h)&&!publicIpv4(h)) || h.includes(':') || ['local','internal','localhost'].some(t=>h.endsWith(`.${t}`))) throw new Error('يُسمح بالنطاقات العامة فقط');
  u.hash=''; return u.href;
}
export const isIpv4=(h:string)=>/^(\d{1,3}\.){3}\d{1,3}$/.test(h)&&h.split('.').every(x=>Number(x)<=255);
/** Only public IPv4 hosts are accepted (no private, loopback, link-local, CGNAT or multicast ranges). */
export function publicIpv4(h:string){const [a=0,b=0]=h.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127));}
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
  const platforms: [string,string][]=[['linktr.ee','linktree'],['wixsite.com','wix'],['wixstudio.com','wix'],['wix.com','wix'],['sites.google.com','google_sites'],['pages.dev','pages_dev'],['netlify.app','netlify'],['vercel.app','vercel'],['instagram.com','instagram'],['facebook.com','facebook'],['tiktok.com','tiktok'],['t.me','telegram'],['telegram.me','telegram'],['wa.me','whatsapp'],['api.whatsapp.com','whatsapp'],['x.com','x'],['twitter.com','x'],['snapchat.com','snapchat']];

  return platforms.find(([d])=>within(domain,d))?.[1] ?? 'other';
}
export const platformList=['linktree','wix','google_sites','pages_dev','netlify','vercel','instagram','facebook','tiktok','telegram','whatsapp','x','snapchat','other'];
/** Display name for a stored platform key; 'other' means the site has its own domain. */
export const platformLabel=(p:string)=>p==='other'?'نطاق خاص':p;
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
export function scoreFinding(input:{url:string;entities:Entity[];ai:AiFinding;age:number|null;mapsPhone:string|null;platform:string;parent?:ParentSuspicion;evidenceText?:(string|null|undefined)[];originUrl?:string;ctFirstSeen?:string|null;now?:number}) {
  const domain=hostname(input.url);
  const named=input.entities.find(e=>e.name_en===input.ai.impersonated_entity) ?? null;
  const lexical=urlLexicalSignals(input.url,input.entities,input.originUrl);
  const visual=input.ai.visual_brand_match?input.entities.find(e=>e.name_en===input.ai.visual_brand_entity && !e.official_domains.some(d=>within(domain,d))) ?? null:null;
  const pathOnly=similarityEntity(input.url,input.entities,{path:true});
  const hostSimilar=similarityEntity(input.url,input.entities);
  // Mentions outside the domain count only when the AI confirms impersonation of that same entity.
  const similar=hostSimilar ?? (pathOnly&&named?.id===pathOnly.id&&input.ai.impersonation_confidence>=0.6?pathOnly:null);
  const parent=input.parent && !officialDestination(domain,input.entities) ? input.parent : null;
  const entity=named ?? visual ?? similar ?? parent?.entity ?? lexical.find(l=>l.entity)?.entity ?? null;
  const asksPayment=input.ai.asks_payment_or_card || mentionsPayment(input.evidenceText ?? []);
  const reasons:string[]=[];const signals:Record<string,number|boolean|string|null>={};let score=0;
  const add=(key:string,points:number,reason:string)=>{signals[key]=points;score+=points;reasons.push(reason);};
  if(named && input.ai.impersonation_confidence>=0.6 && !named.official_domains.some(d=>within(domain,d))) add('impersonation',35,`ينتحل هوية ${named.name_ar} بثقة ${Math.round(input.ai.impersonation_confidence*100)}٪ على نطاق غير رسمي`);
  // Visual imitation counts inside the impersonation signal (no new weight).
  if(visual){const r=`الصفحة تقلّد شكل ${visual.name_ar} (الشعار/الألوان)`;if(signals['impersonation']===undefined)add('impersonation',35,r);else reasons.push(r);}
  const embedded=lexical.find(l=>l.key==='similarity'&&l.embedded);
  if(similar) add('similarity',30,embedded?`${embedded.reason}: ${domain}`:`يحمل اسم ${similar.name_ar} على نطاق غير رسمي: ${domain}`);
  // URL-only signals never double count a key already scored above.
  let lexPoints=0;
  for(const l of lexical)if(signals[l.key]===undefined){add(l.key,l.points,l.reason);lexPoints+=l.points;}
  if(parent) add('inherited_suspicion',30,`مرتبط بصفحة تنتحل ${parent.entity.name_ar}: ${parent.domain}`);
  if(asksPayment || input.ai.asks_sensitive_data) add('sensitive_request',20,input.ai.asks_sensitive_data?'يطلب بيانات حساسة مثل كلمة المرور أو رمز التحقق أو الهوية أو الحساب البنكي':'يطلب الدفع أو بيانات البطاقة المصرفية');
  if(input.age!==null && input.age<90) add('new_domain',15,`النطاق عمره ${input.age} يوم فقط`);
  // A certificate first seen in CT logs counts as the same new-domain signal, only when the age is unknown (never double counted).
  if(input.ctFirstSeen&&input.age===null&&signals['new_domain']===undefined){const t=Date.parse(input.ctFirstSeen);if(Number.isFinite(t)){const days=Math.max(0,Math.floor(((input.now ?? Date.now())-t)/86400000));if(days<90)add('new_domain',15,`نطاق جديد ظهر في سجلات الشهادات قبل ${days} يوم`);}}
  const phones=[...new Set([...input.ai.phones_found,...(input.mapsPhone?[input.mapsPhone]:[])].map(normalizePhone))];
  const mismatch=entity ? phones.find(p=>uaePhone(p) && !entity.official_phones.some(o=>canonicalPhone(o)===canonicalPhone(p))) : null;
  if(mismatch && entity) add('phone_mismatch',10,`رقم الهاتف ${mismatch} لا يطابق الأرقام الرسمية لـ${entity.name_ar}: ${entity.official_phones.join('، ') || 'لا توجد أرقام مسجلة'}`);
  const scam=input.ai.scam_type ?? 'none',scamConf=input.ai.scam_confidence ?? 0;
  if(scam!=='none'&&scamConf>=scamThreshold) add('scam_pattern',30,scamReasons[scam] ?? 'نمط احتيال معروف');
  const suffix=getPublicSuffix(domain,{allowPrivateDomains:false}) ?? '';
  if(!freePlatform(input.platform)&&riskyTlds.includes(suffix)) add('risky_tld',10,`امتداد نطاق شائع في الاحتيال (.${suffix})`);
  if(freePlatform(input.platform)) add('free_platform',10,`الموقع مستضاف على منصة مجانية: ${input.platform}`);
  score=Math.min(100,score);signals['confidence']=input.ai.impersonation_confidence;signals['scam_type']=scam;signals['scam_confidence']=scamConf;signals['lexical']=lexPoints;if(input.ai.visual_brand_match!==undefined){signals['visual_brand_match']=input.ai.visual_brand_match;signals['visual_brand_entity']=input.ai.visual_brand_entity ?? null;}
  return {score,level:riskLevel(score),reasons_ar:reasons.length?reasons:['لا توجد علامات انتحال في الأدلة المتاحة'],signals,entity,phones};
}
export function chainDestinations(urls:string[],entities:Entity[],depth:number) {
  if(depth>=2)return [];
  const domains=new Set<string>();const destinations:string[]=[];
  for(const raw of urls) {try {const url=cleanUrl(raw),domain=hostname(url);if(officialDestination(domain,entities) || domains.has(domain))continue;domains.add(domain);destinations.push(url);if(destinations.length===5)break;}catch{continue;}}
  return destinations;
}
export const platformAssets:Record<string,string[]>={linktree:['linktr.ee','linktree.com'],wix:['wix.com','wixstatic.com','wixsite.com','wixstudio.com','parastorage.com'],google_sites:['sites.google.com','googleusercontent.com','gstatic.com'],pages_dev:['pages.dev'],netlify:['netlify.app'],vercel:['vercel.app']};
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

// ---------- URL-only (lexical) analysis: computed from the URL string alone, never from the network ----------
export const shortenerHosts=['bit.ly','tinyurl.com','t.co','cutt.ly','rb.gy','is.gd','s.id','shorturl.at','rebrand.ly','ow.ly','tiny.cc','lnkd.in','goo.su','qrco.de'];
/** URL shorteners hide the destination; linktr.ee is a page, not a shortener. */
export const isShortener=(host:string)=>shortenerHosts.some(s=>within(host.toLowerCase(),s));
export const shortenerReason='رابط مختصر يخفي الوجهة الحقيقية';
export const shortenerUnresolvedReason='رابط مختصر لم تُكشف وجهته — يحتاج مراجعة';
const baitWords=['pay','payment','fine','fines','renew','update','verify','login','secure','refund','tasdeed','sadad','مخالفات','دفع'];
const confusableMap:Record<string,string>={'а':'a','е':'e','о':'o','р':'p','с':'c','у':'y','х':'x','і':'i','ј':'j','ѕ':'s','ԁ':'d','һ':'h','ӏ':'l','ɡ':'g','ı':'i','κ':'k','ο':'o','α':'a','ε':'e','ι':'i','ν':'v','ρ':'p','τ':'t','υ':'u','χ':'x','ϲ':'c','ѵ':'v','ԝ':'w','ⅼ':'l'};
/** Folds look-alike characters to Latin: Cyrillic/Greek look-alikes, 0→o, 1→l, rn→m, vv→w. */
export function confusableFold(s:string){return [...s.toLowerCase()].map(c=>confusableMap[c] ?? c).join('').replace(/0/g,'o').replace(/1/g,'l').replace(/rn/g,'m').replace(/vv/g,'w');}
/** RFC 3492 punycode decoder for one xn-- label (no network, no Node built-ins). */
export function punycodeDecode(label:string){
  const input=label.replace(/^xn--/i,'');const base=36,tMin=1,tMax=26;let n=128,i=0,bias=72;const out:number[]=[];
  const b=input.lastIndexOf('-');if(b>0)for(let j=0;j<b;j++)out.push(input.charCodeAt(j));
  const adapt=(delta:number,num:number,first:boolean)=>{delta=first?Math.floor(delta/700):delta>>1;delta+=Math.floor(delta/num);let k=0;while(delta>455){delta=Math.floor(delta/35);k+=base;}return k+Math.floor(36*delta/(delta+38));};
  for(let idx=b>0?b+1:0;idx<input.length;){
    const old=i;let w=1;
    for(let k=base;;k+=base){if(idx>=input.length)throw new Error('bad punycode');const c=input.charCodeAt(idx++);const d=c>=48&&c<58?c-22:c>=65&&c<91?c-65:c>=97&&c<123?c-97:base;if(d>=base)throw new Error('bad punycode');i+=d*w;const t=k<=bias?tMin:k>=bias+tMax?tMax:k-bias;if(d<t)break;w*=base-t;}
    bias=adapt(i-old,out.length+1,old===0);n+=Math.floor(i/(out.length+1));i%=out.length+1;out.splice(i++,0,n);
  }
  return String.fromCodePoint(...out);
}
const unicodeHost=(h:string)=>h.split('.').map(l=>{if(!l.startsWith('xn--'))return l;try{return punycodeDecode(l);}catch{return l;}}).join('.');
const scriptOf=(c:string)=>/[a-z]/i.test(c)?'latin':/[\u0400-\u04ff]/.test(c)?'cyrillic':/[\u0370-\u03ff]/.test(c)?'greek':/[\u0600-\u06ff]/.test(c)?'arabic':/[\u00c0-\u024f]/.test(c)?'latin-ext':null;
const brandTokens=(e:Entity)=>[...e.brand_keywords.filter(k=>/^[a-z0-9 \-]+$/i.test(k)).map(k=>k.toLowerCase().replace(/[\s\-]+/g,'')),...e.official_domains.map(d=>d.split('.')[0] ?? '')].filter(k=>k.length>=3&&!isGenericGeo(k));
export type LexicalSignal={key:string;points:number;reason:string;entity:Entity|null;embedded?:boolean};
/** Signals from the URL string only. Runs for every link, even when no page or search evidence exists. */
export function lexicalSignals(url:string,entities:Entity[]):LexicalSignal[] {
  let u:URL;try{u=new URL(url);}catch{return [];}
  const h=u.hostname.toLowerCase().replace(/\.$/,'');
  if(officialDestination(h,entities))return [];
  const out:LexicalSignal[]=[];const push=(s:LexicalSignal)=>{if(!out.some(o=>o.key===s.key))out.push(s);};
  if(u.username)push({key:'at_trick',points:15,reason:'الرابط يخفي النطاق الحقيقي بعلامة @',entity:null});
  if(isIpv4(h)||h.startsWith('[')){push({key:'ip_host',points:15,reason:'الرابط يستخدم عنوان IP بدل اسم نطاق',entity:null});return out;}
  const reg=registrationDomain(h),suffix=getPublicSuffix(h,{allowPrivateDomains:false}) ?? '';
  const regLabel=reg.slice(0,Math.max(0,reg.length-suffix.length-1));
  const sub=h.length>reg.length?h.slice(0,h.length-reg.length-1).split('.').filter(Boolean):[];
  const labels=[...sub,...regLabel.split('.')].filter(Boolean);
  const tokens=labels.flatMap(l=>l.split(/[-_]/)).filter(Boolean);
  // Official domain or brand placed inside another domain (salik.ae.pay-online.example, rta-ae.secure-fines.example).
  if(!freePlatform(platformFor(h)))for(const e of entities){
    const toks=brandTokens(e);
    const hit=e.official_domains.some(d=>h.includes(`${d}.`)||h.includes(`${d.replace(/\./g,'-')}`))||toks.some(t=>t.length>=4?labels.some(l=>l.replace(/[-_]/g,'').includes(t)):tokens.includes(t)&&tokens.some(x=>x!==t&&(serviceWords.includes(x)||baitWords.includes(x))));
    if(hit){push({key:'similarity',points:30,reason:`اسم الجهة الرسمية مدسوس داخل نطاق آخر (${e.name_ar})`,entity:e,embedded:true});break;}
  }
  // Punycode / mixed scripts / look-alike characters.
  const uni=unicodeHost(h),hasPuny=h.split('.').some(l=>l.startsWith('xn--'));
  const uniLabels=uni.split('.');const mixed=uniLabels.some(l=>new Set([...l].map(scriptOf).filter(Boolean)).size>1);
  const latinLike=[...uni].some(c=>confusableMap[c]!==undefined||scriptOf(c)==='latin-ext');
  const folded=uniLabels.slice(0,Math.max(1,uniLabels.length-(suffix.split('.').length))).map(confusableFold);
  const rawLabels=uniLabels.slice(0,folded.length);
  const lookAlike=entities.find(e=>brandTokens(e).filter(t=>t.length>=4).some(t=>folded.some((f,i)=>{const cleanF=f.replace(/[-_]/g,'');return cleanF!==rawLabels[i]!.replace(/[-_]/g,'')&&(cleanF===t||distance(cleanF,t)<=1);})));
  if(lookAlike||(hasPuny&&(mixed||latinLike))||mixed){const e=lookAlike ?? null;push({key:'homoglyph',points:30,reason:`النطاق يستخدم حروفاً مشابهة لتقليد ${e?.name_ar ?? 'جهة أو علامة معروفة'}`,entity:e});}
  // Brand + bait words in the path on a non-official domain.
  let path='';try{path=decodeURIComponent(u.pathname+u.search).toLowerCase();}catch{path=(u.pathname+u.search).toLowerCase();}
  const pathTokens=path.split(/[^a-z0-9\u0600-\u06ff]+/).filter(Boolean);
  const bait=baitWords.some(w=>/^[a-z]+$/.test(w)?[...tokens,...pathTokens].some(t=>t===w||t.startsWith(w)):path.includes(w)||uni.includes(w));
  if(bait)for(const e of entities){
    const named=brandTokens(e).filter(t=>t.length>=4).some(t=>path.replace(/[\s\-_]+/g,'').includes(t))||e.brand_keywords.filter(k=>/[\u0600-\u06ff]/.test(k)&&!isGenericGeo(k)).some(k=>path.includes(k));
    if(named){push({key:'similarity',points:30,reason:`اسم ${e.name_ar} مع كلمات دفع أو تحقق في رابط غير رسمي`,entity:e});break;}
  }
  // Excessive subdomains or long random labels.
  const randomLabel=labels.some(l=>l.length>=25&&(l.replace(/[^0-9-]/g,'').length/l.length)>=0.3);
  if(sub.filter(l=>l!=='www').length>=4||randomLabel)push({key:'odd_structure',points:10,reason:'بنية رابط مشبوهة (نطاقات فرعية طويلة أو عشوائية)',entity:null});
  return out;
}
/** Lexical signals of the final URL plus the original URL (unless it is a shortener, which is never judged itself). */
export function urlLexicalSignals(url:string,entities:Entity[],originUrl?:string):LexicalSignal[] {
  const out=lexicalSignals(url,entities);
  if(originUrl&&originUrl!==url){
    let oh='';try{oh=new URL(originUrl).hostname.toLowerCase();}catch{/* unparsable origin adds nothing */}
    if(oh&&isShortener(oh))out.push({key:'shortener',points:10,reason:shortenerReason,entity:null});
    else if(oh)for(const l of lexicalSignals(originUrl,entities))if(!out.some(o=>o.key===l.key))out.push(l);
  }
  return out;
}

/** Serper language: "en" when the phrase is mostly Latin letters, otherwise "ar" (gl stays "ae"). */
export function searchLanguage(phrase:string):'ar'|'en'{const latin=(phrase.match(/[a-z]/gi) ?? []).length,arabic=(phrase.match(/[\u0600-\u06FF]/g) ?? []).length;return latin>arabic?'en':'ar';}

/** Marker URL for a Google Maps place without a website. Never fetched or scanned. */
export const MAPS_MARKER='https://www.google.com/maps/search/?api=1&query=';
export const isMapsListing=(url:string)=>url.startsWith(MAPS_MARKER);
/** A Maps place without a website is stored only when its title names an entity and its phone is not an official one. */
export function mapsListingFinding(place:{title?:string|null|undefined;phoneNumber?:string|null|undefined},es:Entity[]) {
  const title=(place.title ?? '').trim(),phone=normalizePhone(place.phoneNumber ?? '');
  if(!title||!phone)return null;
  const t=title.toLowerCase(),words=t.split(/[^\p{L}\p{N}]+/u);
  const e=es.find(x=>[x.name_ar,x.name_en,...x.brand_keywords].filter(k=>k&&!isGenericGeo(k)).some(k=>{const w=k.toLowerCase().trim();return w.length>=4?t.includes(w):words.includes(w);}));
  if(!e||e.official_phones.some(o=>canonicalPhone(o)===canonicalPhone(phone)))return null;
  return {entity:e,phone,title,url:MAPS_MARKER+encodeURIComponent(title),analysis:{level:'yellow' as const,score:10,impersonated_entity_id:e.id,signals:{maps_listing:true,phone_mismatch:10,unverified:true},
    reasons_ar:[`مكان في خرائط Google يحمل اسم ${e.name_ar} برقم غير رسمي: ${phone}`,`الرقم الرسمي: ${e.official_phones.join('، ')||'—'}`,'قائمة خرائط بدون موقع — لم يُفحص أي موقع']}};
}

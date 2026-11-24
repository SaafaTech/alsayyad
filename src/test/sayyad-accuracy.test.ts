import {describe,it,expect} from 'vitest';
import {scoreFinding,isRemovedPage,unverifiedFallback,applyOfficialDestinations,classifyDestinations,unverifiedReason,type AiFinding} from '@/lib/sayyad/rules';
import {accuracy,expertLevel} from '@/lib/sayyad/expert';
const ai:AiFinding={impersonated_entity:null,impersonation_confidence:0,asks_payment_or_card:false,asks_sensitive_data:false,phones_found:[],summary_ar:''};
const score=(o:Partial<Parameters<typeof scoreFinding>[0]>={})=>scoreFinding({url:'https://shop.example.com',entities:[],ai,age:null,mapsPhone:null,platform:'other',...o});
describe('engine accuracy rules',()=>{
 it('fallback green becomes yellow, keeps score, flags unverified',()=>{const r=unverifiedFallback(score({age:20}));expect(r.level).toBe('yellow');expect(r.score).toBe(15);expect(r.reasons_ar).toContain(unverifiedReason);expect(r.signals['unverified']).toBe(true);});
 it('fallback with real risk keeps level and unverified=false',()=>{const r=unverifiedFallback(score({ai:{...ai,scam_type:'fund_recovery',scam_confidence:.9},age:20}));expect(r.level).toBe('yellow');expect(r.signals['unverified']).toBe(false);});
 it('removed: 404/410',()=>{expect(isRemovedPage({status:404,finalUrl:'https://a.example.com/',redirected:false})).toBe(true);expect(isRemovedPage({status:410,finalUrl:'https://a.example.com/',redirected:false})).toBe(true);});
 it('removed: redirect to platform login or linktr.ee root only',()=>{expect(isRemovedPage({status:200,finalUrl:'https://accounts.google.com/signin',redirected:true})).toBe(true);expect(isRemovedPage({status:200,finalUrl:'https://linktr.ee/',redirected:true})).toBe(true);expect(isRemovedPage({status:200,finalUrl:'https://linktr.ee/someone',redirected:true})).toBe(false);});
 it('removed: not-found titles',()=>{expect(isRemovedPage({status:200,finalUrl:'https://a.example.com/',redirected:false,title:'Deploy Not Found'})).toBe(true);expect(isRemovedPage({status:200,finalUrl:'https://a.example.com/',redirected:false,title:'الصفحة غير موجودة'})).toBe(true);expect(isRemovedPage({status:200,finalUrl:'https://a.example.com/',redirected:false,title:'Car insurance'})).toBe(false);});
 it('scam pattern at 0.8 adds 30 with softer typed reason',()=>{const r=score({ai:{...ai,scam_type:'unlicensed_domestic_workers',scam_confidence:.8}});expect(r.score).toBe(30);expect(r.reasons_ar[0]).toBe('مؤشرات احتيال محتملة: عرض عمالة منزلية بدون ترخيص واضح');expect(r.signals['scam_type']).toBe('unlicensed_domestic_workers');});
 it('scam pattern at 0.7 adds nothing',()=>expect(score({ai:{...ai,scam_type:'fake_job',scam_confidence:.7}}).score).toBe(0));
 it('official destinations do not clear a scam pattern',()=>{const s=score({platform:'linktree',url:'https://linktr.ee/x',ai:{...ai,scam_type:'fake_insurance',scam_confidence:.8}});const r=applyOfficialDestinations(s,classifyDestinations(['tamm.abudhabi'],'linktr.ee',[]),'linktree',ai);expect(r.score).toBe(40);expect(r.signals['scam_pattern']).toBe(30);});
 it('risky TLD adds 10, not on free platforms',()=>{const r=score({url:'https://cheap.example.xyz'});expect(r.score).toBe(10);expect(r.reasons_ar[0]).toBe('امتداد نطاق شائع في الاحتيال (.xyz)');expect(score({url:'https://cheap.example.com'}).score).toBe(0);expect(score({url:'https://cheap.example.shop',platform:'netlify'}).signals['risky_tld']).toBeUndefined();});
 it('expert accuracy excludes unverified and removed from the denominator',()=>{
  const lv=(id:string)=>({a:expertLevel({level:'red',signals:{}},'done'),b:expertLevel({level:'yellow',signals:{unverified:true}},'done'),c:expertLevel({level:'yellow',signals:{removed:true}},'removed'),d:expertLevel({level:'green',signals:{}},'done'),e:expertLevel(undefined,'error')})[id] ?? null;
  const r=accuracy(['a','b','c','d','e'].map(id=>({link_id:id,url:`https://${id}.example.com`})),lv);
  expect(r.failed).toBe(2);expect(r.removed).toBe(1);expect(r.judged).toBe(2);expect(r.detection).toBe(0.5);});
});
import {dashboardStats} from '@/lib/sayyad/dashboard';
describe('dashboard and removed pages',()=>{
 it('a removed page is counted as تعذر, not مشبوه',()=>{
  const link={id:'l1',status:'removed',hunt_id:null,platform:'other',domain:'gone.example.com'} as never;
  const analysis={link_id:'l1',level:'yellow',score:0,signals:{removed:true},impersonated_entity_id:null,created_at:'2026-11-24T05:00:00Z',reasons_ar:[]} as never;
  const s=dashboardStats({links:[link],analyses:[analysis],hunts:[],entities:[]},0,new Date('2026-11-24T06:00:00Z'));
  expect(s.yellow).toBe(0);expect(s.distribution.find(d=>d.key==='error')?.value).toBe(1);});
});
import {similarityEntity} from '@/lib/sayyad/rules';
const tamm={id:'00000000-0000-4000-8000-0000000000a1',name_ar:'تم',name_en:'TAMM',category:'government',official_domains:['tamm.abudhabi'],official_phones:[],brand_keywords:['tamm','abudhabi','abu dhabi'],created_at:'2026-11-24T00:00:00Z'} as never;
const salik={id:'00000000-0000-4000-8000-0000000000a2',name_ar:'سالك',name_en:'Salik',category:'transport',official_domains:['salik.ae'],official_phones:[],brand_keywords:['سالك','salik'],created_at:'2026-11-24T00:00:00Z'} as never;
describe('name-similarity false positives',()=>{
 it('generic geo domain gives no name signal',()=>{expect(similarityEntity('https://housecleaningabudhabi.example.com',[tamm])).toBeNull();expect(score({url:'https://housecleaningabudhabi.example.com',entities:[tamm]}).signals['similarity']).toBeUndefined();expect(similarityEntity('https://abudhabi.example.com/x',[tamm])).toBeNull();});
 it('blog path/title mentioning an entity with AI confidence 0 gives no name signal',()=>expect(score({url:'https://blog.example.com/how-to-recharge-salik',entities:[salik],evidenceText:['How to recharge Salik']}).signals['similarity']).toBeUndefined());
 it('path mention counts when AI confirms the same entity at 0.6',()=>expect(score({url:'https://blog.example.com/salik-topup',entities:[salik],ai:{...ai,impersonated_entity:'Salik',impersonation_confidence:.6}}).signals['similarity']).toBe(30));
 it('real lookalike domain keeps the name signal',()=>expect(score({url:'https://salik-pay.example',entities:[salik]}).signals['similarity']).toBe(30));
});

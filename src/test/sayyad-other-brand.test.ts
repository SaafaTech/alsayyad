import {describe,it,expect} from 'vitest';
import {scoreFinding,neutralAi,type AiFinding} from '@/lib/sayyad/rules';
const netflix={...neutralAi,asks_sensitive_data:true,other_brand:'Netflix',other_brand_official_domain:'netflix.com',other_brand_confidence:0.8};
const run=(url:string,ai:AiFinding=netflix,platform='other')=>scoreFinding({url,entities:[],ai,age:null,mapsPhone:null,platform});
describe('generic brand phishing',()=>{
 it('Netflix look-alike on example.github.io gets +35 and is red',()=>{const r=scoreFinding({url:'https://example.github.io/login',entities:[],ai:netflix,age:10,mapsPhone:null,platform:'other'});expect(r.signals['impersonation']).toBe(35);expect(r.level).toBe('red');expect(r.reasons_ar).toContain('ينتحل علامة معروفة: Netflix على نطاق غير رسمي');});
 it('same output on netflix.com or www.netflix.com adds no impersonation',()=>{for(const u of ['https://netflix.com/login','https://www.netflix.com/login'])expect(run(u).signals['impersonation']).toBeUndefined();});
 it('password request on unknown domain with score 20 is floored to yellow 30',()=>{const r=run('https://unknown-site.example.com/',{...neutralAi,asks_sensitive_data:true});expect(r.score).toBe(30);expect(r.level).toBe('yellow');expect(r.reasons_ar).toContain('يطلب بيانات دخول أو دفع على نطاق غير رسمي — يحتاج مراجعة');});
 it('knownLegit domain is not floored',()=>{const r=run('https://www.noon.com/checkout',{...neutralAi,asks_payment_or_card:true});expect(r.score).toBe(20);expect(r.signals['sensitive_floor']).toBeUndefined();});
});

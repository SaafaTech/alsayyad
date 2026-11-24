import {describe,it,expect} from 'vitest';
import {isUrgent,canCreateEvidence,reasonAttachment,asksFromReasons} from '@/lib/sayyad/evidence';
import {dashboardStats} from '@/lib/sayyad/dashboard';
describe('Evidence rules',()=>{
 it('allows evidence files only for yellow or red',()=>{expect(canCreateEvidence('yellow')).toBe(true);expect(canCreateEvidence('red')).toBe(true);expect(canCreateEvidence('green')).toBe(false);expect(canCreateEvidence(null)).toBe(false);});
 it('is urgent only when red and the page answered below 400',()=>{expect(isUrgent('red',200)).toBe(true);expect(isUrgent('red',404)).toBe(false);expect(isUrgent('red',null)).toBe(false);expect(isUrgent('yellow',200)).toBe(false);});
 it('tags domain age reasons with the domain data attachment',()=>expect(reasonAttachment('النطاق عمره 58 يوم فقط',true)).toBe(3));
 it('tags impersonation with the screenshot only when one exists',()=>{expect(reasonAttachment('ينتحل هوية سالك',true)).toBe(1);expect(reasonAttachment('ينتحل هوية سالك',false)).toBe(2);});
 it('reads payment request from stored reasons when no AI flag exists',()=>expect(asksFromReasons(['يطلب الدفع أو بيانات البطاقة المصرفية'],{}).asks_payment).toBe(true));
});
describe('Dashboard counts',()=>{
 const link=(id:string,status:string,platform='other')=>({id,status,platform,domain:`${id}.example`,url:`https://${id}.example`} as never);
 const an=(link_id:string,level:string,entity:string|null=null)=>({link_id,level,score:level==='red'?90:40,impersonated_entity_id:entity,reasons_ar:['x'],created_at:'2026-11-24T05:10:00Z'} as never);
 const s=dashboardStats({links:[link('a','done','linktree'),link('b','done'),link('c','official'),link('d','error'),link('e','pending')],analyses:[an('a','red','E1'),an('b','yellow','E1'),an('c','green')],hunts:[{source:'google'},{source:'manual'}] as never,entities:[{id:'E1',name_ar:'سالك'}] as never},2,new Date('2026-11-24T06:30:00Z'));
 it('counts searches without manual checks',()=>expect(s.searches).toBe(1));
 it('counts finished links as checked',()=>expect(s.checked).toBe(4));
 it('counts yellow, red and distinct impersonated entities',()=>{expect(s.yellow).toBe(1);expect(s.red).toBe(1);expect(s.entities).toBe(1);});
 it('puts flagged links in the 09:00 GMT+4 hour',()=>expect(s.timeline.find(t=>t.name==='09:00')?.value).toBe(2));
});

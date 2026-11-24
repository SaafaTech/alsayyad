import {describe,it,expect} from 'vitest';
import {scoreFinding,neutralAi,officialDestination,type Entity} from '@/lib/sayyad/rules';
const koala:Entity={id:'00000000-0000-4000-8000-000000000001',name_ar:'كوالا',name_en:'Koala',category:'transport',official_domains:['koala.example.com'],official_phones:[],brand_keywords:['koala'],created_at:'2026-11-24T00:00:00Z'};
const eand:Entity={...koala,id:'00000000-0000-4000-8000-000000000002',name_en:'e& (Etisalat)',official_domains:['etisalat.ae','eandmoney.com','eand.com.eg'],brand_keywords:[]};
const darb:Entity={...koala,id:'00000000-0000-4000-8000-000000000003',name_en:'Darb',official_domains:['darb.ae','qmobility.ae'],brand_keywords:[]};
const run=(c:number)=>scoreFinding({url:'https://koala-pay.example.org/',entities:[koala],ai:{...neutralAi,visual_brand_match:true,visual_brand_entity:'Koala',impersonation_confidence:c},age:null,mapsPhone:null,platform:'other',evidenceText:['Top up your card']});
describe('visual match needs confidence 0.5',()=>{
 it('low confidence adds no points',()=>{const r=run(0.05);expect(r.signals['impersonation']).toBeUndefined();expect(r.score).toBe(50);expect(r.level).toBe('yellow');expect(r.reasons_ar).toContain('الصفحة تشبه شكل كوالا — لم يؤكد التحليل الانتحال');});
 it('high confidence keeps 35',()=>expect(run(0.9).signals['impersonation']).toBe(35));
 it('new official domains',()=>{expect(officialDestination('www.eandmoney.com',[eand,darb])?.entity?.id).toBe(eand.id);expect(officialDestination('www.eand.com.eg',[eand,darb])?.entity?.id).toBe(eand.id);expect(officialDestination('darb.qmobility.ae',[eand,darb])?.entity?.id).toBe(darb.id);});
});

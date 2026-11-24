import {describe,it,expect} from 'vitest';
import {scoreFinding,neutralAi,type Entity} from '@/lib/sayyad/rules';

const entity:Entity={id:'00000000-0000-4000-8000-000000000001',name_ar:'كوالا',name_en:'Koala',category:'transport',official_domains:['koala.example.com'],official_phones:[],brand_keywords:['koala'],created_at:'2026-11-24T00:00:00Z'};
const soft='الصفحة تشبه شكل كوالا — لم يؤكد التحليل الانتحال';
const ai={...neutralAi,impersonated_entity:'Koala',impersonation_confidence:0.3,visual_brand_match:true,visual_brand_entity:'Koala'};
type Input=Parameters<typeof scoreFinding>[0];
const score=(overrides:Partial<Input>={})=>scoreFinding({url:'https://koala-distributor.example.com/',entities:[entity],ai,age:329,mapsPhone:null,platform:'other',...overrides});

describe('Established brand-only false-positive guard',()=>{
  it('low-confidence visual match adds no points, only the softer reason',()=>{
    const result=score();
    expect(result.score).toBe(30);
    expect(result.level).toBe('yellow');
    expect(result.signals['impersonation']).toBeUndefined();
    expect(result.reasons_ar).toContain(soft);
  });
  it.each([
    ['high confidence',{ai:{...ai,impersonation_confidence:0.98}},65],
    ['confidence boundary',{ai:{...ai,impersonation_confidence:0.5}},65],
  ] satisfies [string,Partial<Input>,number][])('counts visual match with %s',(_n,overrides,expected)=>{
    const result=score(overrides);
    expect(result.level).toBe('red');
    expect(result.score).toBe(expected);
    expect(result.signals['impersonation']).toBe(35);
  });
});

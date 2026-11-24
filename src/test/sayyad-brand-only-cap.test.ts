import {describe,it,expect} from 'vitest';
import {scoreFinding,neutralAi,type Entity} from '@/lib/sayyad/rules';

const entity:Entity={id:'00000000-0000-4000-8000-000000000001',name_ar:'كوالا',name_en:'Koala',category:'transport',official_domains:['koala.example.com'],official_phones:[],brand_keywords:['koala'],created_at:'2026-11-24T00:00:00Z'};
const reason='يحمل اسم وشكل الجهة بدون طلب دفع أو بيانات — قد يكون وكيلاً أو فرعاً رسمياً، يحتاج تحقق';
const ai={...neutralAi,impersonated_entity:'Koala',impersonation_confidence:0.3,visual_brand_match:true,visual_brand_entity:'Koala'};
type Input=Parameters<typeof scoreFinding>[0];
const score=(overrides:Partial<Input>={})=>scoreFinding({url:'https://koala-distributor.example.com/',entities:[entity],ai,age:329,mapsPhone:null,platform:'other',...overrides});

describe('Established brand-only false-positive guard',()=>{
  it('caps visual match plus similarity at yellow 55, preserving weights and adding the reason',()=>{
    const result=score();
    expect(result.score).toBe(55);
    expect(result.level).toBe('yellow');
    expect(result.signals['impersonation']).toBe(35);
    expect(result.signals['similarity']).toBe(30);
    expect(result.signals['brand_only_cap']).toBe(true);
    expect(result.reasons_ar).toContain(reason);
  });
  it.each([
    ['high confidence',{ai:{...ai,impersonation_confidence:0.98}},65],
    ['payment request',{ai:{...ai,asks_payment_or_card:true}},85],
    ['young domain',{age:10},80],
    ['unknown age',{age:null},65],
    ['confidence boundary',{ai:{...ai,impersonation_confidence:0.5}},65],
    ['sensitive data',{ai:{...ai,asks_sensitive_data:true}},85],
    ['payment evidence',{evidenceText:['Payment required']},85],
    ['phone mismatch',{mapsPhone:'0501234567'},75],
    ['scam pattern',{ai:{...ai,scam_type:'fake_shop_payment' as const,scam_confidence:0.9}},95],
  ] satisfies [string,Partial<Input>,number][])('does not cap with %s',(_name,overrides,expected)=>{
    const result=score(overrides);
    expect(result.level).toBe('red');
    expect(result.score).toBe(expected);
    expect(result.signals['brand_only_cap']).toBeUndefined();
    expect(result.reasons_ar).not.toContain(reason);
  });
  it('includes the established-domain boundary of 90 days',()=>{
    expect(score({age:90}).score).toBe(55);
    expect(score({age:89}).score).toBe(80);
  });
  it('allows free-platform points but excludes an additional lexical signal',()=>{
    expect(score({platform:'wix'}).score).toBe(55);
    const result=score({url:'http://koala.example.com@koala-distributor.example.com/'});
    expect(result.signals['at_trick']).toBe(15);
    expect(result.level).toBe('red');
    expect(result.signals['brand_only_cap']).toBeUndefined();
  });
});
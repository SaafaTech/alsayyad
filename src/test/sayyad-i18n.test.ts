import {describe,it,expect} from 'vitest';
import {translate} from '@/lib/i18n';
import {searchLanguage} from '@/lib/sayyad/rules';
import {costPerLink,COST_SERPER_PER_SEARCH,COST_AI_PER_ANALYSIS} from '@/lib/sayyad/cost';
const names=new Map([['سالك','Salik']]);
describe('bilingual dictionary',()=>{
  it('Arabic stays unchanged',()=>expect(translate('خطر','ar')).toBe('خطر'));
  it('translates badges',()=>{expect(translate('خطر','en')).toBe('High risk');expect(translate('محذوفة','en')).toBe('Removed');expect(translate('تحتاج مراجعة','en')).toBe('Needs review');});
  it('translates the splash tagline',()=>expect(translate('عينٌ على الاحتيال. حمايةٌ للمجتمع.','en')).toBe('An eye on fraud. Protection for the community.'));
  it('maps reason templates and keeps values, entity name in English',()=>{expect(translate('يحمل اسم سالك على نطاق غير رسمي: salik-pay.example.com','en',undefined,names)).toBe('Carries the name of Salik on an unofficial domain: salik-pay.example.com');expect(translate('النطاق عمره 12 يوم فقط','en')).toBe('Domain is only 12 days old');});
  it('translates progress stages',()=>expect(translate('يفحص 3 من 10 ويحلل بالذكاء الاصطناعي (كل فحص ~30 ثانية)','en')).toBe('Scanning 3 of 10 and analysing with AI (~30 s per scan)'));
  it('unknown text falls back to Arabic',()=>expect(translate('نص غير معروف','en')).toBe('نص غير معروف'));
});
describe('Serper language',()=>{
  it('mostly Latin → en',()=>expect(searchLanguage('pay salik fine')).toBe('en'));
  it('Arabic → ar',()=>expect(searchLanguage('تعبئة رصيد سالك')).toBe('ar'));
});
describe('cost per link',()=>{
  it('search + AI divided by analysed links, official links excluded',()=>{
    const c=costPerLink({hunts:[{source:'google'},{source:'ct'}],analyses:[{link_id:'a'},{link_id:'b'},{link_id:'o'}],links:[{id:'a',status:'done',scan_uuid:'x'},{id:'b',status:'done',scan_uuid:null},{id:'o',status:'official',scan_uuid:null}]});
    expect(c).toBeCloseTo((COST_SERPER_PER_SEARCH+2*COST_AI_PER_ANALYSIS)/2);});
  it('no analyses → null',()=>expect(costPerLink({hunts:[],analyses:[],links:[]})).toBeNull());
});

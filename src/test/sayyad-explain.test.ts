import {describe,it,expect} from 'vitest';
import {reasonPoints,scoreSum} from '@/lib/sayyad/explain';
const sig={impersonation:35,similarity:30,free_platform:10,confidence:0.9};
describe('reason points',()=>{
  it('maps reasons to stored signal points',()=>{expect(reasonPoints('ينتحل هوية سالك بثقة 90٪ على نطاق غير رسمي',sig)).toBe(35);expect(reasonPoints('الموقع مستضاف على منصة مجانية: wix',sig)).toBe(10);});
  it('neutral lines have no points',()=>{expect(reasonPoints('التحليل مبني على لقطة الشاشة والعنوان',sig)).toBeNull();expect(reasonPoints('النطاق عمره 10 يوم فقط',sig)).toBeNull();});
  it('sums like 35 + 30 + 10 = 75 → red',()=>{expect(scoreSum(['ينتحل هوية x','يحمل اسم y','الموقع مستضاف على منصة مجانية: wix'],sig,75,'red')).toBe('35 + 30 + 10 = 75 → red');});
});

import {describe,it,expect} from 'vitest';
import {reviewStats,type Review} from '@/lib/sayyad/reviews';
import {parseExpected,importCsv,expectedMatrix} from '@/lib/sayyad/expert';
const link=(id:string,hunt_id:string)=>({id,hunt_id}) as never;
const d={hunts:[{id:'h1',source:'google'},{id:'h2',source:'expert_sample'}] as never[],links:[link('a','h1'),link('b','h1'),link('c','h2')],analyses:[]};
const rv=(link_id:string,verdict:'correct'|'wrong',wrong_reason:string|null=null):Review=>({link_id,verdict,wrong_reason,reviewer:'u',created_at:'2026-11-24T00:00:00Z'});
describe('investigator reviews',()=>{
 it('accuracy = correct/(correct+wrong), expert links excluded',()=>{const s=reviewStats([rv('a','correct'),rv('a','correct'),rv('b','wrong','real_site'),rv('c','wrong','missed_fraud')],d);expect(s.total).toBe(3);expect(s.pct).toBe(67);expect(s.falseAlarms).toEqual(['b']);expect(s.missed).toEqual([]);});
 it('no reviews gives no percentage',()=>expect(reviewStats([],d).pct).toBeNull());
});
describe('expected answers',()=>{
 it('parses english and arabic values',()=>{expect(parseExpected('fraud')).toBe('fraud');expect(parseExpected('احتيال')).toBe('fraud');expect(parseExpected('سليم')).toBe('legit');expect(parseExpected('رسمي')).toBe('legit');expect(parseExpected('x')).toBeNull();});
 it('csv expected column is read',()=>expect(importCsv('url,expected\nhttps://a.example.com,احتيال\nhttps://b.example.com,')[0]?.expected).toBe('fraud'));
 it('2x2 matrix excludes failed/removed and computes rates',()=>{const lv:Record<string,string>={1:'red',2:'green',3:'green',4:'yellow',5:'failed',6:'removed'};
  const m=expectedMatrix([{link_id:'1',url:'u1',expected:'fraud'},{link_id:'2',url:'u2',expected:'fraud'},{link_id:'3',url:'u3',expected:'legit'},{link_id:'4',url:'u4',expected:'legit'},{link_id:'5',url:'u5',expected:'fraud'},{link_id:'6',url:'u6',expected:'legit'}],id=>lv[id] ?? null);
  expect([m.caught,m.missed,m.legitOk,m.falseAlarm]).toEqual([1,1,1,1]);expect(m.detection).toBe(.5);expect(m.falseRate).toBe(.5);expect(m.missedUrls).toEqual(['u2']);expect(m.falseUrls).toEqual(['u4']);});
});

import { describe, it, expect } from 'vitest';
import { autoAllowed, autoGate, seenFrom, alreadyAnalysed, withoutExpertRows, ctAutoKeywords, fetchAllPages } from '@/lib/sayyad/auto';
const none=()=>seenFrom([]);
describe('automatic hunt rules', () => {
  it('stops adding links at the daily cap', () => {
    const g=autoGate(none(),98,100);
    expect(g.allow('https://a.example.com/')).toBe(true);
    expect(g.allow('https://b.example.com/')).toBe(true);
    expect(g.allow('https://c.example.com/')).toBe(false);
    expect(g.full).toBe(true);
  });
  it('skips a URL that was already analysed', () => {
    const seen=seenFrom([{url:'https://example.com/pay',domain:'example.com'}]);
    expect(alreadyAnalysed('https://example.com/pay/',seen)).toBe(true);
    expect(autoGate(seen,0,100).allow('https://example.com/pay')).toBe(false);
  });
  it('skips a normal domain that was already analysed', () => {
    const seen=seenFrom([{url:'https://example.com/a',domain:'example.com'}]);
    expect(alreadyAnalysed('https://example.com/other',seen)).toBe(true);
  });
  it('keeps two different paths on the same free platform', () => {
    const seen=seenFrom([{url:'https://linktr.ee/old_page',domain:'linktr.ee'}]);
    const g=autoGate(seen,0,100);
    expect(g.allow('https://linktr.ee/scam_one')).toBe(true);
    expect(g.allow('https://linktr.ee/scam_two')).toBe(true);
    expect(g.allow('https://linktr.ee/old_page')).toBe(false);
  });
  it('dedupes shorteners by full URL only', () => {
    const seen=seenFrom([{url:'https://bit.ly/abc',domain:'bit.ly'}]);
    expect(alreadyAnalysed('https://bit.ly/xyz',seen)).toBe(false);
  });
  it('does nothing when the switch is off', () => {
    expect(autoAllowed({enabled:false,daily_cap:100,owner_user_id:'u'})).toBe(false);
    expect(autoAllowed({enabled:true,daily_cap:100,owner_user_id:null})).toBe(false);
    expect(autoAllowed(null)).toBe(false);
    expect(autoAllowed({enabled:true,daily_cap:100,owner_user_id:'u'})).toBe(true);
  });
  it('excludes expert_sample links from dedupe', () => {
    const rows=withoutExpertRows([{url:'https://example.com/x',domain:'example.com',hunt_id:'expert'},{url:'https://example.org/y',domain:'example.org',hunt_id:'h1'}],new Set(['expert']));
    const seen=seenFrom(rows);
    expect(alreadyAnalysed('https://example.com/x',seen)).toBe(false);
    expect(alreadyAnalysed('https://example.org/y',seen)).toBe(true);
  });
  it('uses only valid brand keywords for CT', () => {
    expect(ctAutoKeywords([{brand_keywords:['salik','ab','Salik','with space']}])).toEqual(['salik']);
  });
  it('keeps fetching pages until a short page', async () => {
    const data=Array.from({length:7},(_,i)=>i);const calls:[number,number][]=[];
    const rows=await fetchAllPages(async(f,t)=>{calls.push([f,t]);return data.slice(f,t+1);},3);
    expect(rows).toEqual(data);
    expect(calls).toEqual([[0,2],[3,5],[6,8]]);
  });
});

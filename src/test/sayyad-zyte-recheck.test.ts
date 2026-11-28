import { describe, it, expect } from 'vitest';
import { isSocialForZyte, zyteDecision, continueAfterZyte, recheckBatch, recheckEligible, fallbackEnd, inRecheck, scanQueue, ZYTE_TIMEOUT_MS, ZYTE_MIN_BUDGET_MS, type RecheckCandidate } from '@/lib/sayyad/zyte';
const now=Date.parse('2026-11-28T10:00:00Z');
describe('social platforms never go to Zyte',()=>{
  it('matches platform keys',()=>{for(const p of ['facebook','instagram','x','tiktok'])expect(isSocialForZyte(p,'example.ae')).toBe(true);});
  it('matches hosts and subdomains',()=>{
    for(const h of ['m.facebook.com','fb.com','www.youtube.com','youtu.be','t.me','wa.me','threads.net','quora.com','ar.linkedin.com'])expect(isSocialForZyte('other',h)).toBe(true);
  });
  it('does not match look-alikes or normal sites',()=>{
    expect(isSocialForZyte('other','facebook.com.ae-pay.site')).toBe(false);
    expect(isSocialForZyte('other','notx.com')).toBe(false);
    expect(isSocialForZyte('vercel','app.vercel.app')).toBe(false);
  });
});
describe('Zyte timing',()=>{
  it('uses a 35 s timeout and needs 45 s left',()=>{expect(ZYTE_TIMEOUT_MS).toBe(35000);expect(ZYTE_MIN_BUDGET_MS).toBe(45000);});
  const b={configured:true,attempts:0,queuedAt:null,now,mode:'auto' as const,usedThisRun:0};
  it('worker tries with 45 s, defers with 44.9 s',()=>{expect(zyteDecision({...b,left:45000})).toBe('try');expect(zyteDecision({...b,left:44900})).toBe('defer');});
  it('no new scans or search/CT step after a Zyte call',()=>{expect(continueAfterZyte({n:0})).toBe(true);expect(continueAfterZyte({n:1})).toBe(false);expect(continueAfterZyte(undefined)).toBe(true);});
});
const c=(o:Partial<RecheckCandidate>):RecheckCandidate=>({id:'a',status:'done',scan_error:'x',zyte_recheck_at:null,platform:'other',url:'https://a.example/',domain:'a.example',first_seen_at:'2026-11-01T00:00:00Z',source:'google',level:'yellow',scanner:'cloudflare',shortener:false,...o});
describe('re-check eligibility',()=>{
  it('accepts an old unscannable link',()=>expect(recheckEligible(c({}))).toBe(true));
  it('rejects each excluded case',()=>{
    for(const o of [{status:'scanning'},{scan_error:null},{scanner:'zyte_ae'},{platform:'instagram'},{domain:'x.com'},{shortener:true},{source:'expert_sample'},{zyte_recheck_at:'2026-11-27T00:00:00Z'}] as Partial<RecheckCandidate>[])expect(recheckEligible(c(o))).toBe(false);
  });
});
describe('re-check ordering',()=>{
  it('red before yellow, then other, vercel, pages_dev, then oldest; at most 15',()=>{
    const rows=[c({id:'y-other',level:'yellow'}),c({id:'r-pages',level:'red',platform:'pages_dev'}),c({id:'r-vercel',level:'red',platform:'vercel'}),c({id:'r-other-new',level:'red',first_seen_at:'2026-11-10T00:00:00Z'}),c({id:'r-other-old',level:'red',first_seen_at:'2026-10-01T00:00:00Z'})];
    expect(recheckBatch(rows).map(r=>r.id)).toEqual(['r-other-old','r-other-new','r-vercel','r-pages','y-other']);
    expect(recheckBatch(Array.from({length:20},(_,i)=>c({id:String(i)}))).length).toBe(15);
  });
  it('new links come before re-check links in the scanning queue',()=>expect(scanQueue([{id:'n'}],[{id:'r'},{id:'n'}]).map(l=>l.id)).toEqual(['n','r']));
});
describe('re-check failure',()=>{
  it('restores the link instead of a new search-evidence analysis',()=>{expect(fallbackEnd(true)).toBe('restore');expect(fallbackEnd(false)).toBe('search_evidence');});
  it('is a re-check only while queue time equals re-check time',()=>{
    expect(inRecheck({zyte_recheck_at:'2026-11-28T10:00:00+00:00',fallback_queued_at:'2026-11-28T10:00:00.000Z'})).toBe(true);
    expect(inRecheck({zyte_recheck_at:'2026-11-28T10:00:00Z',fallback_queued_at:null})).toBe(false);
  });
});

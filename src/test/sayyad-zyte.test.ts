import { describe, it, expect } from 'vitest';
import { zyteDecision, claimOutcome, afterFailure, failureKind, keepScreenshot, missingEvidence, htmlHrefs, emptyCapture, ZYTE_MAX_ATTEMPTS } from '@/lib/sayyad/zyte';
const now=Date.parse('2026-11-28T10:00:00Z');
const base={configured:true,attempts:0,queuedAt:null,now,mode:'manual' as const,left:Infinity,usedThisRun:0};
describe('Zyte fallback decision',()=>{
  it('tries Zyte for a manual scan when configured',()=>expect(zyteDecision(base)).toBe('try'));
  it('finalises as today when Zyte is not configured',()=>expect(zyteDecision({...base,configured:false})).toBe('final'));
  it('worker tries only with 45 s left and once per run',()=>{
    expect(zyteDecision({...base,mode:'auto',left:45000})).toBe('try');
    expect(zyteDecision({...base,mode:'auto',left:44000})).toBe('defer');
    expect(zyteDecision({...base,mode:'auto',left:50000,usedThisRun:1})).toBe('defer');
  });
});
describe('Zyte daily cap',()=>{
  it('a cap-reached or denied claim falls back to the search-evidence verdict',()=>{
    expect(claimOutcome('cap')).toBe('final');expect(claimOutcome('denied')).toBe('final');
    expect(claimOutcome('ok')).toBe('try');expect(claimOutcome('busy')).toBe('wait');
  });
});
describe('Zyte retry limit',()=>{
  it('finalises after 3 attempts or 6 hours',()=>{
    expect(zyteDecision({...base,mode:'auto',left:50000,attempts:ZYTE_MAX_ATTEMPTS})).toBe('final');
    expect(zyteDecision({...base,mode:'auto',left:10000,queuedAt:new Date(now-6*3600000-1000).toISOString()})).toBe('final');
    expect(zyteDecision({...base,mode:'auto',left:10000,queuedAt:new Date(now-5*3600000).toISOString()})).toBe('defer');
  });
  it('worker retries transient failures only until the limit',()=>{
    const f={kind:'transient' as const,mode:'auto' as const,queuedAt:new Date(now).toISOString(),now};
    expect(afterFailure({...f,attempts:1})).toBe('defer');
    expect(afterFailure({...f,attempts:3})).toBe('final');
    expect(afterFailure({...f,attempts:1,kind:'permanent'})).toBe('final');
    expect(afterFailure({...f,attempts:1,mode:'manual'})).toBe('final');
    expect(failureKind(520)).toBe('transient');expect(failureKind(null)).toBe('transient');expect(failureKind(451)).toBe('permanent');
  });
});
describe('Zyte screenshot and capture',()=>{
  it('keeps the screenshot only for yellow or red',()=>{expect(keepScreenshot('red')).toBe(true);expect(keepScreenshot('yellow')).toBe(true);expect(keepScreenshot('green')).toBe(false);});
  it('treats an empty page as a failed capture',()=>{expect(emptyCapture('',true)).toBe(true);expect(emptyCapture('<html><body></body></html>',false)).toBe(true);expect(emptyCapture('<title>Pay fine</title>',false)).toBe(false);});
  it('reads anchors as evidence only',()=>expect(htmlHrefs('<a href="https://wa.me/971500000000">x</a><a class=y href=\'/pay?a=1&amp;b=2\'>')).toEqual(['https://wa.me/971500000000','/pay?a=1&b=2']));
});
describe('evidence back-fill',()=>{
  const r=(id:string,level:string,hoursAgo:number,extra:Partial<{trigger:string;source:string}>={})=>({link_id:id,level,created_at:new Date(now-hoursAgo*3600000).toISOString(),trigger:extra.trigger ?? 'auto',source:extra.source ?? 'google'});
  it('picks at most 3 recent automatic yellow/red links without evidence',()=>{
    const rows=[r('a',"yellow",1),r('b','red',2),r('c','yellow',3),r('d','red',4),r('e','green',1),r('f','red',50),r('g','red',1,{trigger:'manual'}),r('h','red',1,{source:'expert_sample'}),r('i','red',1)];
    const got=missingEvidence(rows,new Set(['i']),now).map(x=>x.link_id);
    expect(got).toEqual(['d','c','b']);
  });
});

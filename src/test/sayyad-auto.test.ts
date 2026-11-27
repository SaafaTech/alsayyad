import { describe, it, expect } from 'vitest';
import { autoAllowed, autoGate, seenFrom, alreadyAnalysed, withoutExpertRows, ctAutoKeywords, fetchAllPages, checkpointItems, staleAutoRuns } from '@/lib/sayyad/auto';
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
  it('saves each successful or failed item before running the next', async () => {
    const events:string[]=[];const errors:string[]=[];
    const next=await checkpointItems({items:['one','two','three'],start:0,limit:2,left:()=>50000,full:()=>false,
      execute:async item=>{events.push(item);if(item==='two')throw new Error('failure');},
      onError:item=>{errors.push(item);},save:async i=>{events.push(`save ${i}`);}});
    expect(events).toEqual(['one','save 1','two','save 2']);expect(errors).toEqual(['two']);expect(next).toBe(2);
  });
  it('leaves the cursor at the completed item when less than 20 seconds remain', async () => {
    let remaining=20000;const saved:number[]=[];
    const next=await checkpointItems({items:['one','two'],start:0,limit:2,left:()=>remaining,full:()=>false,
      execute:async()=>{remaining=19999;},onError:()=>{},save:async i=>{saved.push(i);}});
    expect(next).toBe(1);expect(saved).toEqual([1]);
  });
  it('does not repeat a checkpointed item after interruption', async () => {
    let cursor=0;const executed:string[]=[];
    const options={items:['one','two'],limit:2,left:()=>50000,full:()=>false,execute:async(item:string)=>{executed.push(item);},onError:()=>{}};
    await expect(checkpointItems({...options,start:cursor,save:async i=>{cursor=i;throw new Error('interrupted');}})).rejects.toThrow('interrupted');
    await checkpointItems({...options,start:cursor,save:async i=>{cursor=i;}});
    expect(executed).toEqual(['one','two']);expect(cursor).toBe(2);
  });
  it('marks only running workers older than ten minutes as stale', () => {
    const now=Date.parse('2026-11-27T02:31:00Z');
    const runs=[{id:'old',kind:'worker',status:'running',started_at:'2026-11-27T02:20:59Z'},
      {id:'boundary',kind:'worker',status:'running',started_at:'2026-11-27T02:21:00Z'},
      {id:'finished',kind:'worker',status:'done',started_at:'2026-11-27T01:00:00Z'}];
    expect(staleAutoRuns(runs,[],now).map(r=>r.id)).toEqual(['old']);
  });
  it('marks orphaned search and CT runs stale, retaining the cursor owner', () => {
    const runs=['search','ct'].flatMap(kind=>['old','current'].map(suffix=>({id:`${kind}-${suffix}`,kind,status:'running',started_at:'2026-11-27T00:00:00Z'})));
    const cursors=[{key:'auto-search-cursor',value:{i:2,run_id:'search-current'}}];
    expect(staleAutoRuns(runs,cursors,Date.now()).map(r=>r.id)).toEqual(['search-old','ct-old','ct-current']);
  });
});

import {describe,it,expect} from 'vitest';
import {lexicalSignals,scoreFinding,unverifiedFallback,neutralAi,cleanUrl,isShortener,confusableFold,punycodeDecode,lexicalOnlyReason,type Entity} from '@/lib/sayyad/rules';
import {parsePasted,resultsCsv,sampleUrl} from '@/lib/sayyad/expert';
import {reasonPoints} from '@/lib/sayyad/explain';
const ex:Entity={id:'00000000-0000-4000-8000-0000000000e1',name_ar:'إكزامبل',name_en:'Koala',category:'transport',official_domains:['koala.ae'],official_phones:[],brand_keywords:['koala'],created_at:'2026-11-24T00:00:00Z'};
const ex3:Entity={...ex,id:'00000000-0000-4000-8000-0000000000e2',name_ar:'إكس',name_en:'Exa',official_domains:['exa.ae'],brand_keywords:['exa']};
const keys=(u:string)=>lexicalSignals(u,[ex,ex3]).map(s=>s.key);
const score=(url:string,o:Partial<Parameters<typeof scoreFinding>[0]>={})=>scoreFinding({url,entities:[ex,ex3],ai:neutralAi,age:null,mapsPhone:null,platform:'other',...o});
describe('lexical URL analysis',()=>{
  it('flags an official domain inside another domain',()=>{const s=lexicalSignals('https://koala.ae.pay-online.example/',[ex]);expect(s[0]?.key).toBe('similarity');expect(s[0]?.points).toBe(30);expect(s[0]?.reason).toContain('مدسوس');});
  it('flags a short official label next to a service word',()=>expect(keys('https://exa-ae.secure-fines.net/')).toContain('similarity'));
  it('flags look-alike digits (0→o, 1→l)',()=>{expect(confusableFold('k0a1a')).toBe('koala');expect(keys('https://k0ala.example/')).toContain('homoglyph');});
  it('flags Cyrillic look-alikes in punycode',()=>{const host=new URL('https://kоala.com/').hostname;expect(host.startsWith('xn--')).toBe(true);expect(punycodeDecode(host.split('.')[0]!)).toBe('kоala');expect(keys(`https://${host}/`)).toContain('homoglyph');});
  it('gives 15 for an IP address host',()=>{expect(score('http://8.8.4.4/pay').signals['ip_host']).toBe(15);});
  it('gives 15 for the @ trick',()=>{const u=cleanUrl('http://koala.ae@evil.example/');expect(score(u).signals['at_trick']).toBe(15);});
  it('still rejects private IPs and passwords',()=>{expect(()=>cleanUrl('http://10.0.0.1/')).toThrow();expect(()=>cleanUrl('http://a:b@evil.example/')).toThrow();});
  it('gives 10 for excessive subdomains',()=>expect(score('https://a.b.c.d.e.example.net/').signals['odd_structure']).toBe(10));
  it('brand plus bait word in the path counts as name similarity',()=>expect(score('https://news.example.net/koala/pay').signals['similarity']).toBe(30));
  it('does not double count similarity',()=>expect(score('https://koala-pay.example.net/koala/pay').score).toBe(30));
  it('never flags the official domain',()=>expect(keys('https://www.koala.ae/pay')).toEqual([]));
  it('a plain unrelated URL gets no lexical signal',()=>expect(keys('https://merchant.example.net/')).toEqual([]));
  it('lexical-only red stays red with the URL-only reason',()=>{const r=unverifiedFallback(score('http://koala.ae@k0ala.example/koala/pay'));expect(r.level).toBe('red');expect(r.reasons_ar).toContain(lexicalOnlyReason);});
  it('lexical-only green still becomes yellow unverified',()=>{const r=unverifiedFallback(score('https://merchant.example.net/'));expect(r.level).toBe('yellow');expect(r.signals['unverified']).toBe(true);});
  it('reason lines map to their points',()=>{const r=score('http://8.8.4.4/');expect(reasonPoints(r.reasons_ar[0]!,r.signals)).toBe(15);});
});
describe('shorteners and visual impersonation',()=>{
  it('detects shorteners but not linktr.ee',()=>{expect(isShortener('bit.ly')).toBe(true);expect(isShortener('linktr.ee')).toBe(false);});
  it('adds +10 when the original was a shortener and judges the final URL',()=>{const r=score('https://koala-pay.example.net/',{originUrl:'https://bit.ly/abc'});expect(r.signals['shortener']).toBe(10);expect(r.score).toBe(40);});
  it('visual brand match counts inside impersonation, not as new weight',()=>{const r=score('https://merchant.example.net/',{ai:{...neutralAi,impersonation_confidence:.5,visual_brand_match:true,visual_brand_entity:'Koala'}});expect(r.signals['impersonation']).toBe(35);expect(r.score).toBe(35);
    const both=score('https://merchant.example.net/',{ai:{...neutralAi,impersonated_entity:'Koala',impersonation_confidence:.9,visual_brand_match:true,visual_brand_entity:'Koala'}});expect(both.score).toBe(35);expect(both.reasons_ar.some(x=>x.includes('تقلّد شكل'))).toBe(true);});
  it('visual match on the official domain adds nothing',()=>expect(score('https://koala.ae/',{ai:{...neutralAi,visual_brand_match:true,visual_brand_entity:'Koala'}}).score).toBe(0));
});
describe('pasted list',()=>{
  it('parses defanged URLs with optional labels',()=>{const r=parsePasted('hxxps://example[.]net/pay,fraud\nhttps://example.org,legit\n\nhttps://example.com/a');expect(r.map(x=>x.expected)).toEqual(['fraud','legit',null]);expect(r[0]?.url).toBe('https://example.net/pay');});
  it('caps at 500 unique URLs',()=>expect(parsePasted(Array.from({length:600},(_,i)=>`https://s${i}.example.com`).join('\n'))).toHaveLength(500));
  it('keeps the @ trick when queueing',()=>expect(sampleUrl('http://koala.ae@evil.example/x?y=1')).toBe('http://koala.ae@evil.example/x'));
  it('exports CSV with escaped reasons',()=>expect(resultsCsv([{url:'https://a.example',level:'red',score:70,top_reason:'a, "b"',final_url:null}])).toBe('url,level,score,top_reason,final_url\nhttps://a.example,red,70,"a, ""b""",'));
});

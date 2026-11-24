import {describe,it,expect} from 'vitest';
import {ctKeywords,ctDomains,parseWhois,takedownTexts,takedownRecipients,takedownStats,ctEarlyCount,casesCsv,takedownFooter,isBasisNote} from '@/lib/sayyad/early';
import {scoreFinding,neutralAi,type Entity} from '@/lib/sayyad/rules';
const koala:Entity={id:'00000000-0000-4000-8000-0000000000k1',name_ar:'كوالا',name_en:'Koala',category:'transport',official_domains:['koala.ae'],official_phones:[],brand_keywords:['koala','كوالا','dubai','abc','KoalaPay'],created_at:'2026-11-24T00:00:00Z'};
const now=Date.parse('2026-11-24T12:00:00Z');
describe('certificate transparency',()=>{
  it('keywords are ASCII, ≥4 chars, no generic place words',()=>expect(ctKeywords([koala])).toEqual(['koala','koalapay']));
  it('keeps only certs from the last 14 days, strips *., dedupes, drops official',()=>{
    const r=ctDomains([{name_value:'*.koala-pay.example.com\nkoala-pay.example.com\nwww.koala.ae',not_before:'2026-11-20T10:00:00'},{name_value:'old-koala.example.com',not_before:'2026-10-01T00:00:00'},{name_value:'koala-pay.example.com',not_before:'2026-11-18T00:00:00'}],[koala],now);
    expect(r).toEqual([{domain:'koala-pay.example.com',first_seen:'2026-11-18T00:00:00.000Z'}]);});
  it('caps at 40 domains per keyword',()=>expect(ctDomains(Array.from({length:60},(_,i)=>({name_value:`k${i}.example.com`,not_before:'2026-11-23T00:00:00'})),[koala],now)).toHaveLength(40));
  it('CT first-seen counts as the new-domain signal only when age is unknown',()=>{
    const base={url:'https://merchant.example.com/',entities:[koala],ai:neutralAi,mapsPhone:null,platform:'other',ctFirstSeen:'2026-11-21T12:00:00Z',now};
    const a=scoreFinding({...base,age:null});expect(a.signals['new_domain']).toBe(15);expect(a.reasons_ar[0]).toBe('نطاق جديد ظهر في سجلات الشهادات قبل 3 يوم');
    expect(scoreFinding({...base,age:10}).score).toBe(15);expect(scoreFinding({...base,age:400}).score).toBe(0);});
});
const rdap={events:[{eventAction:'registration',eventDate:'2026-11-01T00:00:00Z'},{eventAction:'expiration',eventDate:'2027-11-01T00:00:00Z'},{eventAction:'last changed',eventDate:'2026-11-02T00:00:00Z'}],status:['client transfer prohibited'],nameservers:[{ldhName:'NS1.EXAMPLE.NET'}],
  entities:[{roles:['registrar'],vcardArray:['vcard',[['version',{},'text','4.0'],['fn',{},'text','Example Registrar LLC']]],entities:[{roles:['abuse'],vcardArray:['vcard',[['email',{},'text','abuse@example.net'],['tel',{type:'voice'},'uri','tel:+1.5555550100']]]}]}]};
describe('WHOIS from RDAP',()=>{
  it('parses registrar, dates, nameservers, status and abuse contact',()=>expect(parseWhois(rdap)).toEqual({registrar:'Example Registrar LLC',created:'2026-11-01T00:00:00Z',expires:'2027-11-01T00:00:00Z',changed:'2026-11-02T00:00:00Z',nameservers:['ns1.example.net'],status:['client transfer prohibited'],abuse_email:'abuse@example.net',abuse_phone:'+1.5555550100'}));
  it('returns null for an empty response',()=>expect(parseWhois(null)).toBeNull());
});
describe('takedown request',()=>{
  const input={case_no:'SAY-2026-0001',url:'https://koala-pay.example.com/x',final_url:null,platform:'netlify',first_seen_at:'2026-11-24T08:00:00Z',entity:koala,reasons:['سبب'],sha256:'ab12',captured_at:'2026-11-24T08:05:00Z',hosting:{ip:'192.0.2.1',asn:'64500',asnname:'Example Hosting',country:'US'},whois:parseWhois(rdap)};
  it('addresses registrar abuse, hosting ASN and the platform team without inventing URLs',()=>{const r=takedownRecipients(input);expect(r.ar).toEqual(['فريق الإساءة لدى المسجّل Example Registrar LLC: abuse@example.net','مزوّد الاستضافة: Example Hosting (AS64500)','فريق الإبلاغ في Netlify']);});
  it('defangs the URL, shows UTC+4 time and the footer',()=>{const t=takedownTexts(input);expect(t.ar).toContain('hxxps://koala-pay[.]example[.]com/x');expect(t.ar).not.toContain('https://koala-pay');expect(t.ar).toContain('2026-11-24 12:00 (UTC+4)');expect(t.ar).toContain('SAY-2026-0001');expect(t.ar.endsWith(takedownFooter)).toBe(true);expect(t.en).toContain('Screenshot SHA-256: ab12');});
  it('adds the TDRA in-country blocking section after the evidence, before the thanks',()=>{
    const t=takedownTexts(input);const ar=t.ar.split('\n'),en=t.en.split('\n');
    expect(ar).toContain('للحجب داخل الدولة (بالتوازي مع الإزالة من المصدر):');
    expect(ar.join('\n')).toContain('مزودي الإنترنت المرخصين (e& و du)');
    expect(en).toContain('In-country blocking (in parallel with removal at the source):');
    expect(en.join('\n')).toContain('licensed ISPs (e& and du) block the URL inside the UAE');
    const bi=ar.findIndex(l=>l.startsWith('للحجب داخل الدولة'));
    expect(bi).toBeGreaterThan(ar.findIndex(l=>l.startsWith('المسجّل:')));
    expect(ar[bi-1]).toBe('');expect(ar[bi+2]).toBe('');expect(ar[bi+3]).toBe('شاكرين تعاونكم.');
    const be=en.findIndex(l=>l.startsWith('In-country blocking'));
    expect(be).toBeGreaterThan(en.findIndex(l=>l.startsWith('Registrar:')));
    expect(en[be-1]).toBe('');expect(en[be+2]).toBe('');expect(en[be+3]).toBe('Thank you for your cooperation.');
  });
  it('never lists TDRA as a recipient',()=>{
    const t=takedownTexts(input);
    expect(t.ar.split('\n')[0]).toMatch(/^إلى: /);expect(t.ar.split('\n')[0]).not.toContain('TDRA');
    expect(t.en.split('\n')[0]).toMatch(/^To: /);expect(t.en.split('\n')[0]).not.toContain('TDRA');
    expect(t.ar).not.toMatch(/tdra@|\.tdra|tdra\.ae|https?:\/\/[^\s]*tdra/i);
    expect(t.en).not.toMatch(/tdra@|\.tdra|tdra\.ae|https?:\/\/[^\s]*tdra/i);
    expect(takedownRecipients(input).ar.join(' ')).not.toContain('TDRA');
  });
  it('drops method notes from the reasons list in both texts',()=>{
    const t=takedownTexts({...input,reasons:['نطاق جديد ظهر في سجلات الشهادات قبل 3 يوم','التحليل مبني على لقطة الشاشة والعنوان','الحكم مبني على تحليل الرابط فقط (الصفحة لم تُفحص)','تعذر قراءة نص الصفحة من تقرير Cloudflare؛ التحليل مبني على العنوان والروابط فقط']});
    expect(t.ar).toContain('- نطاق جديد ظهر في سجلات الشهادات قبل 3 يوم');
    expect(t.ar).not.toContain('التحليل مبني على');expect(t.ar).not.toContain('الحكم مبني على تحليل الرابط فقط');
    expect(t.en).not.toContain('التحليل مبني على');expect(t.en).not.toContain('الحكم مبني على تحليل الرابط فقط');
    expect(t.ar).toContain('أسباب الاشتباه:');
  });
  it('isBasisNote matches only method notes',()=>{
    expect(isBasisNote('التحليل مبني على لقطة الشاشة والعنوان')).toBe(true);
    expect(isBasisNote('الحكم مبني على تحليل الرابط فقط (الصفحة لم تُفحص)')).toBe(true);
    expect(isBasisNote('نطاق جديد ظهر في سجلات الشهادات قبل 3 يوم')).toBe(false);
  });
});
describe('follow-up stats and export',()=>{
  const links=[{id:'a',status:'removed',first_seen_at:'2026-11-24T00:00:00Z',hunt_id:'h1'},{id:'b',status:'removed',first_seen_at:'2026-11-24T00:00:00Z',hunt_id:'h2'},{id:'c',status:'done',first_seen_at:'2026-11-24T00:00:00Z',hunt_id:'h1'}];
  const analyses=[{link_id:'a',created_at:'2026-11-24T06:00:00Z',signals:{removed:true},level:'yellow'},{link_id:'b',created_at:'2026-11-24T02:00:00Z',signals:{removed:true},level:'yellow'},{link_id:'c',created_at:'2026-11-24T01:00:00Z',signals:{},level:'red'}];
  it('counts removed links that were red/yellow before and averages hours',()=>expect(takedownStats(links,analyses,[{link_id:'a',analysis:{level:'red'}},{link_id:'b',analysis:{level:'green'}}])).toEqual({stopped:1,avgHours:6}));
  it('counts red/yellow links first found by CT, not removed ones',()=>expect(ctEarlyCount(links,analyses,[{id:'h1',source:'ct'},{id:'h2',source:'google'}])).toBe(1));
  it('exports cases with defanged URLs, yes/no removed and urgent value',()=>{
    expect(casesCsv([{case_no:'SAY-2026-0001',url:'https://a.example.com',final_url:null,entity:'Koala',level:'red',score:80,top_reasons:['x','y'],first_seen:null,captured_at:null,sha256:'ab',case_status:'detected',removed:true,urgent:'yes'}]).split('\n')[1]).toBe('SAY-2026-0001,hxxps://a[.]example[.]com,,Koala,red,80,x | y,,,ab,detected,yes,yes');
    expect(casesCsv([{case_no:'SAY-2026-0002',url:'https://b.example.com',final_url:null,entity:null,level:'yellow',score:40,top_reasons:[],first_seen:null,captured_at:null,sha256:null,case_status:'detected',removed:false,urgent:'unknown'}]).split('\n')[1]).toBe('SAY-2026-0002,hxxps://b[.]example[.]com,,,yellow,40,,,,,detected,no,unknown');
  });
});

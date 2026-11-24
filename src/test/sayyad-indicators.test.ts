import { describe,it,expect } from 'vitest';
import { validIban,extractIbans,whatsappNumber,canonicalSocial,outgoingLinks,buildIndicators } from '@/lib/sayyad/indicators';
describe('indicators',()=>{
  it('accepts a valid AE IBAN and rejects an invalid one',()=>{expect(validIban('AE070331234567890123456')).toBe(true);expect(validIban('AE070331234567890123457')).toBe(false);});
  it('normalizes a spaced IBAN',()=>{expect(extractIbans(['حوّل إلى AE07 033 1234567890123456 الآن'])).toEqual(['AE070331234567890123456']);});
  it('extracts wa.me numbers as phones',()=>{expect(whatsappNumber('https://wa.me/971501234567')).toBe('971501234567');const i=buildIndicators({hrefs:['https://wa.me/00971501234567'],pageUrl:'https://example.com/',texts:[],aiPhones:[],mapsPhone:null});expect(i.whatsapp).toEqual(['971501234567']);expect(i.phones).toContain('971501234567');});
  it('keeps instagram profiles and drops posts',()=>{expect(canonicalSocial('https://www.instagram.com/scam.shop/?hl=en')).toEqual({platform:'instagram',url:'https://instagram.com/scam.shop'});expect(canonicalSocial('https://instagram.com/p/xxx')).toBeNull();});
  it('dedupes links and excludes own domain',()=>{expect(outgoingLinks(['https://example.com/a','/b','https://other.example.org/x','https://other.example.org/x#f'],'https://example.com/')).toEqual(['https://other.example.org/x']);});
});

import {describe,it,expect} from 'vitest';
import {mapsListingFinding,isMapsListing} from '@/lib/sayyad/rules';
import type {Entity} from '@/lib/sayyad/rules';
const salik={id:'e1',name_ar:'سالك',name_en:'Salik',category:'transport',official_domains:['salik.ae'],official_phones:['800 72545'],brand_keywords:['salik','سالك'],created_at:''} as Entity;
describe('maps places without a website',()=>{
  it('Salik in title + non-official phone → yellow listing',()=>{const f=mapsListingFinding({title:'Salik Recharge Center',phoneNumber:'+971 50 123 4567'},[salik]);
    expect(f?.analysis.level).toBe('yellow');expect(f?.analysis.score).toBe(10);expect(f?.entity.id).toBe('e1');expect(f&&isMapsListing(f.url)).toBe(true);expect(f?.analysis.signals.maps_listing).toBe(true);});
  it('official phone → not stored',()=>expect(mapsListingFinding({title:'Salik Recharge Center',phoneNumber:'80072545'},[salik])).toBeNull());
  it('unrelated title → not stored',()=>expect(mapsListingFinding({title:'Pizza Corner',phoneNumber:'+971 50 123 4567'},[salik])).toBeNull());
});

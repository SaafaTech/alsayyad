import {describe,it,expect} from 'vitest';
import {knownLegit,officialDestination} from '@/lib/sayyad/rules';
import {expertNetworks} from '@/lib/sayyad/campaigns';
describe('knownLegit',()=>{
  it('each listed domain and www. subdomain is legit',()=>{for(const d of knownLegit){expect(officialDestination(d,[])).not.toBeNull();expect(officialDestination(`www.${d}`,[])).not.toBeNull();}});
  it('look-alikes and social/free platforms are not',()=>{for(const d of ['bankfab-pay.com','emiratesnbd.co','noon-uae.shop','adcb.com.secure-login.xyz','facebook.com','linktr.ee'])expect(officialDestination(d,[])).toBeNull();});
});
describe('expertNetworks',()=>{
  const mk=(hunt:string)=>{const links=[1,2,3,4].map(i=>({id:`${hunt}${i}`,url:`https://s${i}.ex${i}.example.com/`,domain:`s${i}.ex${i}.example.com`,platform:'other',parent_link_id:null,maps_phone:null,first_seen_at:'2026-11-24T00:00:00Z',hunt_id:hunt}));
    const analyses=links.map(l=>({link_id:l.id,level:'red',phones_found:[],hosting:{ip:'1.2.3.4'} as never,page_title:'',impersonated_entity_id:'e1',created_at:'2026-11-24T01:00:00Z'}));return {links,analyses};};
  const ent=[{id:'e1',name_ar:'سالك',official_phones:[],official_domains:['salik.ae']}];
  it('four same-IP same-entity expert links form one network; normal hunt links are excluded',()=>{const e=mk('hx'),n=mk('hn');
    const r=expertNetworks({hunts:[{id:'hx',source:'expert_sample'},{id:'hn',source:'google'}],links:[...e.links,...n.links],analyses:[...e.analyses,...n.analyses],entities:ent});
    expect(r).toHaveLength(1);expect(r[0]!.link_count).toBe(4);expect(r[0]!.links.every(l=>l.link_id.startsWith('hx'))).toBe(true);});
});

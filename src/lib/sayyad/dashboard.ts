import type { Tables } from '@/integrations/supabase/types';
import { uaeTime } from './evidence';
import { withoutExpert } from './campaigns';
type W={links:Tables<'links'>[];analyses:Tables<'analyses'>[];hunts:Tables<'hunts'>[];entities:Tables<'entities'>[]};
export const timelineStart=Date.parse('2026-11-24T04:00:00Z'); // 08:00 GMT+4
// Pure dashboard counting rules, shared by the screen and its tests.
export function dashboardStats(input:W,evidenceCount:number,now:Date,campaignCount=0){
  const d=withoutExpert(input);
  const byLink=new Map(d.analyses.map(a=>[a.link_id,a]));
  // Removed pages carry a placeholder yellow row; they are never a suspicious verdict.
  const removed=(l:Tables<'links'>)=>l.status==='removed'||(byLink.get(l.id)?.signals as Record<string,unknown>|null)?.['removed']===true;
  const flagged=d.links.map(l=>({l,a:byLink.get(l.id)})).filter(x=>x.l.status!=='official'&&!removed(x.l)&&x.a&&(x.a.level==='yellow'||x.a.level==='red'));
  const bucket=(l:Tables<'links'>)=>{if(l.status==='official')return 'official';if(removed(l))return 'error';const a=byLink.get(l.id);if(a)return a.level;if(l.status==='error'||l.status==='unscannable')return 'error';return null;};
  const counts={green:0,yellow:0,red:0,official:0,error:0} as Record<string,number>;
  for(const l of d.links){const b=bucket(l);if(b&&b in counts)counts[b]=(counts[b] ?? 0)+1;}
  const name=(id:string|null)=>d.entities.find(e=>e.id===id)?.name_ar ?? null;
  const tally=(keys:string[])=>{const m=new Map<string,number>();for(const k of keys)m.set(k,(m.get(k) ?? 0)+1);return [...m].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);};
  const hours=Math.max(0,Math.floor((now.getTime()-timelineStart)/3600000))+1;
  const timeline=Array.from({length:Math.min(hours,72)},(_,i)=>{const t=timelineStart+i*3600000;return {name:`${String((new Date(t).getUTCHours()+4)%24).padStart(2,'0')}:00`,value:flagged.filter(x=>{const c=Date.parse(x.a!.created_at);return c>=t&&c<t+3600000;}).length};});
  return {
    searches:d.hunts.filter(h=>h.source!=='manual').length,
    checked:d.links.filter(l=>!['pending','scanning'].includes(l.status)).length,
    yellow:flagged.filter(x=>x.a!.level==='yellow').length,red:flagged.filter(x=>x.a!.level==='red').length,
    entities:new Set(flagged.map(x=>x.a!.impersonated_entity_id).filter(Boolean)).size,evidence:evidenceCount,campaigns:campaignCount,
    distribution:[['green','آمن'],['yellow','مشبوه'],['red','خطر'],['official','رسمي'],['error','تعذر']].map(([key,n])=>({key:key!,name:n!,value:counts[key!] ?? 0})),
    topEntities:tally(flagged.map(x=>name(x.a!.impersonated_entity_id)).filter((n):n is string=>!!n)).slice(0,8),
    platforms:tally(flagged.map(x=>x.l.platform)),
    timeline,
    latestRed:flagged.filter(x=>x.a!.level==='red').sort((a,b)=>Date.parse(b.a!.created_at)-Date.parse(a.a!.created_at)).slice(0,10).map(x=>({id:x.l.id,domain:x.l.domain,entity:name(x.a!.impersonated_entity_id) ?? '—',score:x.a!.score,reason:x.a!.reasons_ar[0] ?? '',time:uaeTime(x.a!.created_at)})),
  };
}

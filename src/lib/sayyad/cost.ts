// Estimated per-unit costs (USD). Adjust here only.
export const COST_SERPER_PER_SEARCH=0.001;
export const COST_CLOUDFLARE_PER_SCAN=0;
export const COST_AI_PER_ANALYSIS=0.002;
/** Estimated cost per analysed link: Serper searches (Google/Maps hunts) + AI analyses + Cloudflare scans, divided by analysed links. */
export function costPerLink(input:{hunts:{source:string}[];analyses:{link_id:string}[];links:{id:string;status:string;scan_uuid:string|null}[]}){
  const searches=input.hunts.filter(h=>h.source==='google'||h.source==='maps').length;
  const official=new Set(input.links.filter(l=>l.status==='official').map(l=>l.id));
  const analysed=input.analyses.filter(a=>!official.has(a.link_id)).length;
  const scans=input.links.filter(l=>l.scan_uuid).length;
  if(!analysed)return null;
  return (searches*COST_SERPER_PER_SEARCH+analysed*COST_AI_PER_ANALYSIS+scans*COST_CLOUDFLARE_PER_SCAN)/analysed;
}
export const formatCost=(x:number)=>x<0.01?x.toFixed(4):x.toFixed(3);

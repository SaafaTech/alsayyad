import { tr } from '@/lib/i18n';
import { Link,useNavigate } from '@tanstack/react-router';
import { Megaphone,Copy,FileText,FilePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { defangDomain } from '@/lib/sayyad/campaigns';
import { platformLabel } from '@/lib/sayyad/rules';
import type { Tables } from '@/integrations/supabase/types';

export type CampaignSig={reasons_ar?:string[];platforms?:string[];members?:Record<string,{removed:boolean;old_score:number|null;score:number|null}>;edges?:{a:string;b:string;reasons_ar:string[]}[]};
export type CampaignNode={id:string;domain:string;removed:boolean;score:number|null;oldScore:number|null;caseNo:string|null};
type Edge={a:string;b:string;reasons_ar:string[]};
// Right, left, top, bottom, then the diagonals.
const angles=[0,180,270,90,315,135,225,45,340,160,200,20];
const pos=(i:number,n:number)=>{const deg=i<angles.length?angles[i]!:(360/n)*i,r=deg*Math.PI/180;return {x:50+33*Math.cos(r),y:50+34*Math.sin(r)};};
// Control point for the gold join arc; opposite members bow upward so the arc clears the centre.
const bend=(a:{x:number;y:number},b:{x:number;y:number})=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;if(Math.abs(mx-50)<6&&Math.abs(my-50)<6)return {cx:mx,cy:my-44,lx:mx,ly:my-23};return {cx:mx+(mx-50)*0.6,cy:my+(my-50)*0.6,lx:mx+(mx-50)*0.3,ly:my+(my-50)*0.3};};

/** When every edge carries the same reason set, return those reasons (map draws a ring instead). */
export function uniformReasons(edges:Edge[]):string[]|null{
  if(!edges.length)return null;const key=(e:Edge)=>[...new Set(e.reasons_ar)].sort().join('|');const k=key(edges[0]!);
  return edges.every(e=>key(e)===k)?[...new Set(edges[0]!.reasons_ar)].sort():null;
}
export function ringEdges(ids:string[],reasons:string[]):Edge[]{
  if(ids.length<2)return [];if(ids.length===2)return [{a:ids[0]!,b:ids[1]!,reasons_ar:reasons}];
  return ids.map((id,i)=>({a:id,b:ids[(i+1)%ids.length]!,reasons_ar:reasons}));
}
export function CampaignMap({center,nodes,edges:raw,showPlaceholder=true}:{center:{name:string;domain:string|null}|null;nodes:CampaignNode[];edges:Edge[];showPlaceholder?:boolean}){
  const navigate=useNavigate();const p=new Map(nodes.map((n,i)=>[n.id,pos(i,nodes.length)]));
  const same=uniformReasons(raw);const edges=same?ringEdges(nodes.map(n=>n.id),same):raw;
  return <>{same&&<p className="text-xs text-primary mb-2" dir="rtl">{tr("كل المواقع مرتبطة:")} {same.map(r=>tr(r)).join(tr("، "))}</p>}<div className="cmap" dir="ltr">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {nodes.map(n=>{const q=p.get(n.id)!;return <line key={n.id} x1={q.x} y1={q.y} x2={50} y2={50} stroke="currentColor" className="text-muted-foreground" strokeDasharray="4 4" strokeWidth={1.2} vectorEffect="non-scaling-stroke"/>;})}
      {edges.map(e=>{const a=p.get(e.a),b=p.get(e.b);if(!a||!b)return null;const {cx,cy}=bend(a,b);return <path key={`${e.a}-${e.b}`} d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`} fill="none" stroke="var(--accent-gold)" strokeWidth={2} vectorEffect="non-scaling-stroke"/>;})}
    </svg>
    {nodes.map(n=>{const q=p.get(n.id)!;return <span key={`imp-${n.id}`} className="absolute text-[10px] text-muted-foreground bg-card px-1 rounded" style={{left:`${(q.x+50)/2}%`,top:`${(q.y+50)/2}%`,transform:'translate(-50%,-50%)'}}>{tr("ينتحل")}</span>;})}
    {!same&&edges.map(e=>{const a=p.get(e.a),b=p.get(e.b);if(!a||!b)return null;const {lx,ly}=bend(a,b);return <span key={`l-${e.a}-${e.b}`} dir="rtl" className="absolute text-[10px] text-primary bg-card px-1.5 rounded border border-border max-w-[160px] text-center" style={{left:`${lx}%`,top:`${ly}%`,transform:'translate(-50%,-50%)'}}>{e.reasons_ar.map(r=>tr(r)).join(tr("، "))}</span>;})}
    <div className={`c-center ${center?'':'none'}`} style={{left:'50%',top:'50%'}} dir="rtl">{center?<><b>{center.name}</b><span className="mono">{center.domain ?? '—'}</span><small>{tr("الموقع الرسمي")}</small></>:<b>{tr("جهة غير محددة")}</b>}</div>
    {nodes.map(n=>{const q=p.get(n.id)!;return <button key={n.id} type="button" dir="rtl" className={`c-node ${n.removed?'gone':''}`} style={{left:`${q.x}%`,top:`${q.y}%`}} onClick={()=>void navigate({to:'/analysis',search:{id:n.id}})}>
      <div className="flex items-center justify-between gap-2">{n.removed?<><span>{tr("انحذف بعد رصده")}</span><span className="chip grey">{tr("كان")} {n.oldScore ?? '—'}</span></>:<><span className="font-semibold" style={{color:'var(--r-red)'}}>{tr("خطر مرتفع (نشط)")}</span><span className="chip solid-red">{n.score ?? '—'}</span></>}</div>
      <span className="domain-label">{defangDomain(n.domain)}</span><small className="text-muted-foreground">{n.caseNo ?? tr("بدون ملف أدلة")}</small></button>;})}
    {showPlaceholder&&<div className="c-placeholder" dir="rtl">{tr("أي موقع جديد يُرصد ويرتبط بالحملة يظهر هنا تلقائياً")}</div>}
  </div></>;
}

type Entity=Pick<Tables<'entities'>,'name_ar'|'official_domains'>;
export function CampaignCard({title,badge,subline,entity,nodes,sig,linkCount,ip,files,onAwareness,showPlaceholder=true}:{title:string;badge?:string;subline?:React.ReactNode;entity:Entity|null|undefined;nodes:CampaignNode[];sig:CampaignSig;linkCount:number;ip?:string|null;files:{id:string;case_no:string}[];onAwareness:()=>void;showPlaceholder?:boolean}){
  const live=nodes.find(n=>!n.removed);
  return <section className="campaign-card"><div><div className="flex flex-wrap items-center gap-2 mb-1"><h2>{title}</h2>{badge&&<span className="platform-tag">{badge}</span>}</div>{subline}<CampaignMap center={entity?{name:entity.name_ar,domain:entity.official_domains[0] ?? null}:null} nodes={nodes} edges={sig.edges ?? []} showPlaceholder={showPlaceholder}/>
    <div className="legend"><span><span className="dot green"/>{tr("الجهة الرسمية")}</span><span><span className="dot red"/>{tr("خطر مرتفع (نشط)")}</span><span><span className="dot grey"/>{tr("انحذف بعد رصده")}</span></div></div>
    <aside className="c-summary analysis-section"><dl><div><dt>{tr("الجهة المنتحلة")}</dt><dd>{tr(entity?.name_ar) ?? tr("جهة غير محددة")}</dd></div><div><dt>{tr("عدد المواقع")}</dt><dd>{linkCount} ({nodes.filter(n=>!n.removed).length} {tr("حي،")} {nodes.filter(n=>n.removed).length} {tr("محذوف)")}</dd></div><div><dt>{tr("المنصات")}</dt><dd dir="ltr" className="text-start">{(sig.platforms ?? []).map(p=>tr(platformLabel(p))).join(', ')}</dd></div><div><dt>{tr("سبب الربط")}</dt><dd className="flex flex-wrap gap-1">{(sig.reasons_ar ?? []).map(r=><span key={r} className="platform-tag">{tr(r)}</span>)}</dd></div>{ip&&<div><dt>{tr("IP مشترك")}</dt><dd dir="ltr" className="text-start mono">{ip}</dd></div>}<div><dt>{tr("ملفات الأدلة")}</dt><dd>{files.length?files.map(f=><Link key={f.id} to="/evidence" search={{id:f.id}} className="text-primary me-2">{f.case_no}</Link>):tr("لا توجد")}</dd></div></dl>
      <div className="flex flex-col gap-2 mt-5"><Button className="gold-btn" onClick={onAwareness}><Megaphone/>{tr("رسالة توعية جاهزة")}</Button>{files[0]?<Button variant="outline" asChild><Link to="/evidence" search={{id:files[0].id}}><FileText/>{tr("فتح ملفات الأدلة")}</Link></Button>:live?<Button variant="outline" asChild><Link to="/analysis" search={{id:live.id}}><FilePlus/>{tr("إنشاء ملف أدلة")}</Link></Button>:<Button variant="outline" disabled><FileText/>{tr("لا توجد ملفات أدلة")}</Button>}</div></aside>
  </section>;
}

export function AwarenessDialog({msg,onClose}:{msg:string|null;onClose:()=>void}){
  return <Dialog open={!!msg} onOpenChange={o=>{if(!o)onClose();}}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{tr("رسالة توعية")}</DialogTitle></DialogHeader><p className="text-sm leading-7 whitespace-pre-wrap">{msg}</p><Button onClick={()=>{void navigator.clipboard.writeText(msg ?? '');toast.success(tr("تم النسخ"));}}><Copy/>{tr("نسخ")}</Button></DialogContent></Dialog>;
}

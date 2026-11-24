import { tr, tf } from '@/lib/i18n';
import { createFileRoute,Link,useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Network,RefreshCw,Megaphone,Copy,FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { meta, ProgressCard, removedSignal } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { listCampaigns,rebuildCampaigns } from '@/lib/sayyad/campaigns.functions';
import { listEvidence } from '@/lib/sayyad/evidence.functions';
import { awarenessMessage,defangDomain } from '@/lib/sayyad/campaigns';
import { uaeTime } from '@/lib/sayyad/evidence';
import { platformLabel } from '@/lib/sayyad/rules';
export const Route=createFileRoute('/_authenticated/campaigns')({head:()=>meta(tr("الحملات"),tr("تجميع الروابط الخطرة المترابطة في حملات انتحال مع أسباب الربط ورسائل التوعية.")),component:Campaigns});
type Sig={reasons_ar?:string[];platforms?:string[];members?:Record<string,{removed:boolean;old_score:number|null;score:number|null}>;edges?:{a:string;b:string;reasons_ar:string[]}[]};
// Right, left, top, bottom, then the diagonals.
const angles=[0,180,270,90,315,135,225,45,340,160,200,20];
const pos=(i:number,n:number)=>{const deg=i<angles.length?angles[i]!:(360/n)*i,r=deg*Math.PI/180;return {x:50+33*Math.cos(r),y:50+34*Math.sin(r)};};
// Control point for the gold join arc; opposite members bow upward so the arc clears the centre.
const bend=(a:{x:number;y:number},b:{x:number;y:number})=>{const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;if(Math.abs(mx-50)<6&&Math.abs(my-50)<6)return {cx:mx,cy:my-44,lx:mx,ly:my-23};return {cx:mx+(mx-50)*0.6,cy:my+(my-50)*0.6,lx:mx+(mx-50)*0.3,ly:my+(my-50)*0.3};};
type Node={id:string;domain:string;removed:boolean;score:number|null;oldScore:number|null;caseNo:string|null};
function CampaignMap({center,nodes,edges}:{center:{name:string;domain:string|null}|null;nodes:Node[];edges:{a:string;b:string;reasons_ar:string[]}[]}){
  const navigate=useNavigate();const p=new Map(nodes.map((n,i)=>[n.id,pos(i,nodes.length)]));
  return <div className="cmap" dir="ltr">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {nodes.map(n=>{const q=p.get(n.id)!;return <line key={n.id} x1={q.x} y1={q.y} x2={50} y2={50} stroke="currentColor" className="text-muted-foreground" strokeDasharray="4 4" strokeWidth={1.2} vectorEffect="non-scaling-stroke"/>;})}
      {edges.map(e=>{const a=p.get(e.a),b=p.get(e.b);if(!a||!b)return null;const {cx,cy}=bend(a,b);return <path key={`${e.a}-${e.b}`} d={`M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`} fill="none" stroke="var(--accent-gold)" strokeWidth={2} vectorEffect="non-scaling-stroke"/>;})}
    </svg>
    {nodes.map(n=>{const q=p.get(n.id)!;return <span key={`imp-${n.id}`} className="absolute text-[10px] text-muted-foreground bg-card px-1 rounded" style={{left:`${(q.x+50)/2}%`,top:`${(q.y+50)/2}%`,transform:'translate(-50%,-50%)'}}>{tr("ينتحل")}</span>;})}
    {edges.map(e=>{const a=p.get(e.a),b=p.get(e.b);if(!a||!b)return null;const {lx,ly}=bend(a,b);return <span key={`l-${e.a}-${e.b}`} dir="rtl" className="absolute text-[10px] text-primary bg-card px-1.5 rounded border border-border max-w-[160px] text-center" style={{left:`${lx}%`,top:`${ly}%`,transform:'translate(-50%,-50%)'}}>{e.reasons_ar.join(tr("، "))}</span>;})}
    <div className={`c-center ${center?'':'none'}`} style={{left:'50%',top:'50%'}} dir="rtl">{center?<><b>{center.name}</b><span className="mono">{center.domain ?? '—'}</span><small>{tr("الموقع الرسمي")}</small></>:<b>{tr("جهة غير محددة")}</b>}</div>
    {nodes.map(n=>{const q=p.get(n.id)!;return <button key={n.id} type="button" dir="rtl" className={`c-node ${n.removed?'gone':''}`} style={{left:`${q.x}%`,top:`${q.y}%`}} onClick={()=>void navigate({to:'/analysis',search:{id:n.id}})}>
      <div className="flex items-center justify-between gap-2">{n.removed?<><span>{tr("انحذف بعد رصده")}</span><span className="chip grey">{tr("كان")} {n.oldScore ?? '—'}</span></>:<><span className="font-semibold" style={{color:'var(--r-red)'}}>{tr("خطر مرتفع (نشط)")}</span><span className="chip solid-red">{n.score ?? '—'}</span></>}</div>
      <span className="domain-label">{defangDomain(n.domain)}</span><small className="text-muted-foreground">{n.caseNo ?? tr("بدون ملف أدلة")}</small></button>;})}
    <div className="c-placeholder" dir="rtl">{tr("أي موقع جديد يُرصد ويرتبط بالحملة يظهر هنا تلقائياً")}</div>
  </div>;
}
function Campaigns(){
  const engine=useEngine(),qc=useQueryClient(),list=useServerFn(listCampaigns),rebuild=useServerFn(rebuildCampaigns),ev=useServerFn(listEvidence);
  const q=useQuery({queryKey:['campaigns'],queryFn:()=>list(),refetchInterval:15000}),evidence=useQuery({queryKey:['evidence'],queryFn:()=>ev()});
  const [busy,setBusy]=useState(false),[msg,setMsg]=useState<string|null>(null);
  async function regroup(){setBusy(true);try{const r=await rebuild();toast.success(tf("تم التجميع: {0} حملة",r.count));await qc.invalidateQueries({queryKey:['campaigns']});}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر التجميع"));}finally{setBusy(false);}}
  const links=new Map((engine.data?.links ?? []).map(l=>[l.id,l])),analyses=new Map((engine.data?.analyses ?? []).map(a=>[a.link_id,a]));
  return <div><div className="page-heading"><div><div className="eyebrow"><Network size={14}/> {tr("ربط الأدلة")}</div><h1>{tr("الحملات")}</h1><p>{tr("روابط خطرة مترابطة بقواعد ثابتة (سلسلة، هاتف، استضافة، قالب، نمط اسم) — بدون ذكاء اصطناعي.")}</p></div><Button variant="outline" disabled={busy} onClick={()=>void regroup()}><RefreshCw/>{tr("إعادة التجميع")}</Button></div>{busy&&<div className="mb-6"><ProgressCard job={{stage:tr("يعيد تجميع الحملات من الروابط الخطرة…")}} running/></div>}
    {q.isPending?<div className="empty-state">{tr("جارٍ تحميل الحملات…")}</div>:!q.data?.campaigns.length?<div className="empty-state">{tr("لا توجد حملات بعد — تحتاج رابطين خطرين مترابطين على الأقل")}</div>:
    q.data.campaigns.map(c=>{
      const sig=c.signals as Sig;const members=q.data.links.filter(m=>m.campaign_id===c.id).map(m=>links.get(m.link_id)).filter(l=>!!l);
      const entity=engine.data?.entities.find(e=>e.id===c.entity_id);
      const nodes:Node[]=members.map(l=>{const a=analyses.get(l.id),m=sig.members?.[l.id],removed=!!m?.removed||l.status==='removed'||removedSignal(a?.signals);return {id:l.id,domain:l.domain,removed,score:a?.score ?? m?.score ?? null,oldScore:m?.old_score ?? null,caseNo:evidence.data?.find(e=>e.link_id===l.id)?.case_no ?? null};});
      const files=(evidence.data ?? []).filter(e=>members.some(l=>l.id===e.link_id));
      return <section key={c.id} className="campaign-card"><div><h2 className="mb-1">{tr(c.name_ar)}</h2><p className="text-xs text-muted-foreground mb-3">{tr("أول رصد:")} {uaeTime(c.first_seen_at)} {tr("— آخر رصد:")} {uaeTime(c.last_seen_at)}</p><CampaignMap center={entity?{name:entity.name_ar,domain:entity.official_domains[0] ?? null}:null} nodes={nodes} edges={sig.edges ?? []}/>
        <div className="legend"><span><span className="dot green"/>{tr("الجهة الرسمية")}</span><span><span className="dot red"/>{tr("خطر مرتفع (نشط)")}</span><span><span className="dot grey"/>{tr("انحذف بعد رصده")}</span></div></div>
        <aside className="c-summary analysis-section"><dl><div><dt>{tr("الجهة المنتحلة")}</dt><dd>{tr(entity?.name_ar) ?? tr("جهة غير محددة")}</dd></div><div><dt>{tr("عدد المواقع")}</dt><dd>{c.link_count} ({nodes.filter(n=>!n.removed).length} {tr("حي،")} {nodes.filter(n=>n.removed).length} {tr("محذوف)")}</dd></div><div><dt>{tr("المنصات")}</dt><dd dir="ltr" className="text-start">{(sig.platforms ?? []).map(p=>tr(platformLabel(p))).join(', ')}</dd></div><div><dt>{tr("سبب الربط")}</dt><dd className="flex flex-wrap gap-1">{(sig.reasons_ar ?? []).map(r=><span key={r} className="platform-tag">{tr(r)}</span>)}</dd></div><div><dt>{tr("ملفات الأدلة")}</dt><dd>{files.length?files.map(f=><Link key={f.id} to="/evidence" search={{id:f.id}} className="text-primary me-2">{f.case_no}</Link>):tr("لا توجد")}</dd></div></dl>
          <div className="flex flex-col gap-2 mt-5"><Button className="gold-btn" onClick={()=>setMsg(awarenessMessage(entity,members.map(l=>l.domain)))}><Megaphone/>{tr("رسالة توعية جاهزة")}</Button><Button variant="outline" asChild><Link to="/evidence" {...(files[0]?{search:{id:files[0].id}}:{})}><FileText/>{tr("فتح ملفات الأدلة")}</Link></Button></div></aside>
      </section>;})}
    <Dialog open={!!msg} onOpenChange={o=>{if(!o)setMsg(null);}}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{tr("رسالة توعية")}</DialogTitle></DialogHeader><p className="text-sm leading-7 whitespace-pre-wrap">{msg}</p><Button onClick={()=>{void navigator.clipboard.writeText(msg ?? '');toast.success(tr("تم النسخ"));}}><Copy/>{tr("نسخ")}</Button></DialogContent></Dialog>
  </div>;
}

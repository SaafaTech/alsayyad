import { tr, tf } from '@/lib/i18n';
import { createFileRoute,Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Area,AreaChart,CartesianGrid,XAxis,YAxis,Cell,Pie,PieChart,ResponsiveContainer,Tooltip } from 'recharts';
import { LayoutDashboard } from 'lucide-react';
import { meta } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { listEvidence } from '@/lib/sayyad/evidence.functions';
import { dashboardStats } from '@/lib/sayyad/dashboard';
import { reviewStats } from '@/lib/sayyad/reviews';
import { useReviews } from '@/components/sayyad/reviews';
import { supabase } from '@/integrations/supabase/client';
import { takedownStats,ctEarlyCount } from '@/lib/sayyad/early';
import { withoutExpert } from '@/lib/sayyad/campaigns';
import { costPerLink, formatCost } from '@/lib/sayyad/cost';
import { listCampaigns } from '@/lib/sayyad/campaigns.functions';
export const Route=createFileRoute('/_authenticated/dashboard')({head:()=>meta(tr("لوحة التحكم"),tr("مؤشرات الرصد الحية: الروابط المفحوصة والمشبوهة والجهات المنتحلة وملفات الأدلة.")),component:Dashboard});
const riskColor:Record<string,string>={green:'var(--success)',official:'var(--chart-official)',yellow:'var(--warning)',red:'var(--destructive)',error:'var(--muted-foreground)'};
const riskLabel:Record<string,string>={green:'آمن',official:'رسمي',yellow:'تحتاج مراجعة',red:'خطر',error:'تعذر/محذوف'};
function Empty(){return <p className="dash-none">{tr("لا توجد بيانات بعد")}</p>;}
type D={name:string;value:number;key?:string};
function TipCard({active,payload,label}:{active?:boolean;payload?:{value:number;name?:string;payload?:D}[];label?:string}){
  const p=payload?.[0];if(!active||!p)return null;
  return <div className="chart-tip"><b>{p.value}</b><span>{label ?? (p.payload?.key?tr(riskLabel[p.payload.key] ?? p.payload.name):p.payload?.name)}</span></div>;
}
const noMotion=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
function Donut({data}:{data:D[]}){
  const order=['green','official','yellow','red','error'];const rows=order.map(k=>data.find(d=>d.key===k)).filter((d):d is D=>!!d);
  const total=rows.reduce((a,d)=>a+d.value,0);if(!total)return <Empty/>;
  const shown=rows.filter(r=>r.value>0);
  return <div className="donut-wrap"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={shown} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="100%" paddingAngle={shown.length>1?2:0} cornerRadius={6} stroke="none" isAnimationActive={!noMotion()}>{shown.map(d=><Cell key={d.key} fill={riskColor[d.key ?? '']}/>)}</Pie><Tooltip content={<TipCard/>}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{total}</strong><span>{tr("رابط")}</span></div></div>
    <ul className="donut-legend">{rows.map(d=><li key={d.key}><i style={{background:riskColor[d.key ?? '']}}/><span>{tr(riskLabel[d.key ?? ''] ?? d.name)}</span><b>{d.value}</b><small>{Math.round(d.value*100/total)}%</small></li>)}</ul></div>;
}
function BarList({data,tone}:{data:D[];tone:'gold'|'amber'}){
  const sorted=[...data].filter(d=>d.value>0).sort((a,b)=>b.value-a.value);if(!sorted.length)return <Empty/>;
  const other=sorted.filter(d=>d.name==='other'||d.name==='أخرى'),main=sorted.filter(d=>!other.includes(d));
  let rows:D[]=main.slice(0,6);if(other.length||main.length>6){const keep=main.slice(0,5);rows=[...keep,{name:'أخرى',value:sorted.filter(d=>!keep.includes(d)).reduce((x,d)=>x+d.value,0)}];}
  const max=Math.max(...rows.map(r=>r.value));
  return <ul className={`bar-list ${tone}`}>{rows.map(r=><li key={r.name} title={`${tr(r.name)}: ${r.value}`}><span className="bl-name">{tr(r.name)}</span><span className="bl-track"><span className="bl-fill" style={{width:`${Math.max(4,r.value*100/max)}%`}}/></span><b>{r.value}</b></li>)}</ul>;
}
function Timeline({data}:{data:D[]}){
  if(!data.some(d=>d.value>0))return <Empty/>;
  const tick={fill:'var(--muted-foreground)',fontSize:11};const step=Math.max(0,Math.ceil(data.length/8)-1);
  return <div className="timeline-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{top:10,right:8,left:8,bottom:0}}><CartesianGrid vertical={false} strokeOpacity={0.12}/><XAxis dataKey="name" tick={tick} interval={step} reversed tickLine={false} axisLine={false} tickMargin={8} minTickGap={12}/><YAxis allowDecimals={false} orientation="right" width={32} tick={tick} tickLine={false} axisLine={false} tickMargin={6}/><Tooltip content={<TipCard/>} cursor={{stroke:'var(--border)'}}/><Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.15} dot={{r:3,fill:'var(--primary)',strokeWidth:0}} activeDot={{r:5}} isAnimationActive={!noMotion()} label={data.length<=24?{position:'top',fill:'var(--foreground)',fontSize:11,formatter:(v:unknown)=>Number(v)>0?String(v):''}:false}/></AreaChart></ResponsiveContainer></div>;
}
function Dashboard(){
  const engine=useEngine(),list=useServerFn(listEvidence),ev=useQuery({queryKey:['evidence'],queryFn:()=>list(),refetchInterval:10000}),camps=useServerFn(listCampaigns),cq=useQuery({queryKey:['campaigns'],queryFn:()=>camps(),refetchInterval:15000}),rq=useReviews(),hq=useQuery({queryKey:['analysis-history'],queryFn:async()=>{const r=await supabase.from('analysis_history').select('link_id,analysis');if(r.error)throw r.error;return r.data;},refetchInterval:30000});
  if(engine.loading)return <div className="empty-state">{tr("جارٍ تحميل المؤشرات…")}</div>;
  const d=engine.data;if(!d)return <div className="empty-state">{tr("لا توجد بيانات بعد")}</div>;
  const s=dashboardStats(d,ev.data?.length ?? 0,new Date(),cq.data?.campaigns.length ?? 0);
  const dx=withoutExpert(d),tk=takedownStats(dx.links,dx.analyses,hq.data ?? []),early=ctEarlyCount(dx.links,dx.analyses,dx.hunts);
  const rv=reviewStats(rq.data ?? [],d),dom=(id:string)=>d.links.find(l=>l.id===id)?.domain ?? id;
  const counters:[string,number,string][]= [[tr("عمليات البحث"),s.searches,''],[tr("الروابط المفحوصة"),s.checked,''],[tr("تحتاج مراجعة"),s.yellow,'yellow'],[tr("خطر (أحمر)"),s.red,'red'],[tr("جهات منتحلة"),s.entities,''],[tr("ملفات أدلة"),s.evidence,''],[tr("الحملات"),s.campaigns,''],[tr("رُصد قبل ظهوره في البحث"),early,'yellow'],[tr("مواقع توقفت بعد الرصد"),tk.stopped,'']];
  return <div><div className="page-heading"><div><div className="eyebrow"><LayoutDashboard size={14}/> {tr("غرفة العمليات")}</div><h1>{tr("لوحة التحكم")}</h1><p>{tr("مؤشرات حية من نتائج الرصد المحفوظة.")}</p></div></div>
    <div className="dash-counters">{counters.map(([l,v,c])=>l===tr('الحملات')?<Link key={l} to="/campaigns" className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></Link>:<div key={l} className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></div>)}<div className="counter dash-counter"><span>{tr("التكلفة التقريبية لكل رابط")}</span><strong dir="ltr">{(()=>{const c=costPerLink(d);return c===null?"—":`$${formatCost(c)}`;})()}</strong><small title={tr("تقديري: البحث + الذكاء الاصطناعي (Cloudflare ضمن الخطة)")}>{tr("تقديري: البحث + الذكاء الاصطناعي (Cloudflare ضمن الخطة)")}</small></div><div className="counter dash-counter"><span>{tr("متوسط الوقت حتى التوقف")}</span><strong>{tk.avgHours===null?'—':tf("{0} ساعة",tk.avgHours)}</strong></div><div className="counter dash-counter"><span>{tr("دقة المراجعة")}</span><strong>{rv.pct===null?'—':`${rv.pct}%`}</strong><small>{rv.total?<>{tr("من")} {rv.total} {tr("مراجعة")}</>:tr("لا توجد مراجعات بعد — استخدم زر «الحكم صحيح؟» في التحليل")}</small></div></div>
    <div className="dash-grid mb-6">{([[tr("آخر الإنذارات الكاذبة"),rv.falseAlarms],[tr("احتيال فات"),rv.missed]] as const).map(([t,ids])=><section key={t} className="analysis-section dash-card"><h2>{t}</h2>{ids.length?<ul className="text-sm space-y-1">{ids.map(id=><li key={id}><Link to="/analysis" search={{id}} className="text-primary mono" dir="ltr">{dom(id)}</Link></li>)}</ul>:<p className="dash-none">{tr("لا توجد")}</p>}</section>)}</div>
    <div className="dash-grid">
      <section className="analysis-section dash-card"><h2>{tr("توزيع الخطورة")}</h2><Donut data={s.distribution}/></section>
      <section className="analysis-section dash-card"><h2>{tr("أكثر الجهات انتحالاً")}</h2><BarList data={s.topEntities} tone="gold"/></section>
      <section className="analysis-section dash-card"><h2>{tr("منصات الروابط المشبوهة والخطرة")}</h2><BarList data={s.platforms} tone="amber"/></section>
      <section className="analysis-section dash-card"><h2>{tr("زمن الرصد (أصفر + أحمر بالساعة، GMT+4)")}</h2><Timeline data={s.timeline}/></section>
    </div>
    <section className="analysis-section mt-6"><h2>{tr("أحدث الروابط الخطرة")}</h2>{!s.latestRed.length?<Empty/>:<div className="evidence-table-wrap"><table className="evidence-table"><thead><tr><th>{tr("النطاق")}</th><th>{tr("الجهة")}</th><th>{tr("الدرجة")}</th><th>{tr("السبب الأول")}</th><th>{tr("الوقت")}</th></tr></thead><tbody>{s.latestRed.map(r=><tr key={r.id}><td><Link to="/analysis" search={{id:r.id}} className="text-primary" dir="ltr">{r.domain}</Link></td><td>{r.entity}</td><td><span className="risk red"><b>{r.score}</b></span></td><td>{r.reason}</td><td className="text-xs">{r.time}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}

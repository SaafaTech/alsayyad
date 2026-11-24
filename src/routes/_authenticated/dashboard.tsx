import { tr, tf } from '@/lib/i18n';
import { createFileRoute,Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bar,BarChart,CartesianGrid,XAxis,YAxis,Cell } from 'recharts';
import { LayoutDashboard } from 'lucide-react';
import { ChartContainer,ChartTooltip,ChartTooltipContent,type ChartConfig } from '@/components/ui/chart';
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
const cfg:ChartConfig={value:{label:tr("العدد"),color:'var(--primary)'}};
const riskColor:Record<string,string>={green:'var(--success)',yellow:'var(--warning)',red:'var(--destructive)',official:'var(--primary)',error:'var(--muted-foreground)'};
function Empty(){return <div className="empty-state chart-empty">{tr("لا توجد بيانات بعد")}</div>;}
function Bars({data,colors,vertical}:{data:{name:string;value:number;key?:string}[];colors?:Record<string,string>;vertical?:boolean}){
  if(!data.some(d=>d.value>0))return <Empty/>;
  const tick={fill:'var(--muted-foreground)',fontSize:11};
  return <ChartContainer config={cfg} className="h-64 w-full"><BarChart data={data} layout={vertical?'vertical':'horizontal'} margin={{left:8,right:8,top:8}}><CartesianGrid vertical={!!vertical} horizontal={!vertical} strokeOpacity={0.15}/>{vertical?<XAxis type="number" allowDecimals={false} tick={tick} reversed/>:<XAxis dataKey="name" tick={tick} interval={0} reversed/>}{vertical?<YAxis type="category" dataKey="name" width={150} orientation="right" tick={tick} interval={0}/>:<YAxis allowDecimals={false} orientation="right" width={30} tick={tick}/>}<ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="value" name={tr("العدد")} radius={4} fill="var(--color-value)" label={{position:vertical?'left':'top',fill:'var(--foreground)',fontSize:12}}>{colors&&data.map(d=><Cell key={d.name} fill={colors[d.key ?? '']}/>)}</Bar></BarChart></ChartContainer>;
}
function Dashboard(){
  const engine=useEngine(),list=useServerFn(listEvidence),ev=useQuery({queryKey:['evidence'],queryFn:()=>list(),refetchInterval:10000}),camps=useServerFn(listCampaigns),cq=useQuery({queryKey:['campaigns'],queryFn:()=>camps(),refetchInterval:15000}),rq=useReviews(),hq=useQuery({queryKey:['analysis-history'],queryFn:async()=>{const r=await supabase.from('analysis_history').select('link_id,analysis');if(r.error)throw r.error;return r.data;},refetchInterval:30000});
  if(engine.loading)return <div className="empty-state">{tr("جارٍ تحميل المؤشرات…")}</div>;
  const d=engine.data;if(!d)return <div className="empty-state">{tr("لا توجد بيانات بعد")}</div>;
  const s=dashboardStats(d,ev.data?.length ?? 0,new Date(),cq.data?.campaigns.length ?? 0);
  const dx=withoutExpert(d),tk=takedownStats(dx.links,dx.analyses,hq.data ?? []),early=ctEarlyCount(dx.links,dx.analyses,dx.hunts);
  const rv=reviewStats(rq.data ?? [],d),dom=(id:string)=>d.links.find(l=>l.id===id)?.domain ?? id;
  const counters:[string,number,string][]= [[tr("عمليات البحث"),s.searches,''],[tr("الروابط المفحوصة"),s.checked,''],[tr("مشبوه (أصفر)"),s.yellow,'yellow'],[tr("خطر (أحمر)"),s.red,'red'],[tr("جهات منتحلة"),s.entities,''],[tr("ملفات أدلة"),s.evidence,''],[tr("الحملات"),s.campaigns,''],[tr("رُصد قبل ظهوره في البحث"),early,'yellow'],[tr("مواقع توقفت بعد الرصد"),tk.stopped,'']];
  return <div><div className="page-heading"><div><div className="eyebrow"><LayoutDashboard size={14}/> {tr("غرفة العمليات")}</div><h1>{tr("لوحة التحكم")}</h1><p>{tr("مؤشرات حية من نتائج الرصد المحفوظة.")}</p></div></div>
    <div className="dash-counters">{counters.map(([l,v,c])=>l===tr('الحملات')?<Link key={l} to="/campaigns" className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></Link>:<div key={l} className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></div>)}<div className="counter dash-counter"><span>{tr("التكلفة التقريبية لكل رابط")}</span><strong dir="ltr">{(()=>{const c=costPerLink(d);return c===null?"—":`≈ $${formatCost(c)} ${tr("لكل رابط")}`;})()}</strong><small className="text-xs text-muted-foreground">{tr("تقديري: البحث + الذكاء الاصطناعي؛ فحص Cloudflare ضمن الخطة")}</small></div><div className="counter dash-counter"><span>{tr("متوسط الوقت حتى التوقف")}</span><strong>{tk.avgHours===null?'—':tf("{0} ساعة",tk.avgHours)}</strong></div><div className="counter dash-counter"><span>{tr("دقة المراجعة")}</span><strong>{rv.pct===null?'—':`${rv.pct}%`}</strong><small className="text-xs text-muted-foreground">{tr("من")} {rv.total} {tr("مراجعة")}</small></div></div>
    <div className="dash-grid mb-6">{([[tr("آخر الإنذارات الكاذبة"),rv.falseAlarms],[tr("احتيال فات"),rv.missed]] as const).map(([t,ids])=><section key={t} className="analysis-section"><h2>{t}</h2>{ids.length?<ul className="text-sm space-y-1">{ids.map(id=><li key={id}><Link to="/analysis" search={{id}} className="text-primary mono" dir="ltr">{dom(id)}</Link></li>)}</ul>:<p className="text-xs text-muted-foreground">{tr("لا توجد")}</p>}</section>)}</div>
    <div className="dash-grid">
      <section className="analysis-section"><h2>{tr("توزيع الخطورة")}</h2><Bars data={s.distribution} colors={riskColor}/></section>
      <section className="analysis-section"><h2>{tr("أكثر الجهات انتحالاً")}</h2><Bars data={s.topEntities} vertical/></section>
      <section className="analysis-section"><h2>{tr("منصات الروابط المشبوهة والخطرة")}</h2><Bars data={s.platforms}/></section>
      <section className="analysis-section"><h2>{tr("زمن الرصد (أصفر + أحمر بالساعة، GMT+4)")}</h2><Bars data={s.timeline}/></section>
    </div>
    <section className="analysis-section mt-6"><h2>{tr("أحدث الروابط الخطرة")}</h2>{!s.latestRed.length?<Empty/>:<div className="evidence-table-wrap"><table className="evidence-table"><thead><tr><th>{tr("النطاق")}</th><th>{tr("الجهة")}</th><th>{tr("الدرجة")}</th><th>{tr("السبب الأول")}</th><th>{tr("الوقت")}</th></tr></thead><tbody>{s.latestRed.map(r=><tr key={r.id}><td><Link to="/analysis" search={{id:r.id}} className="text-primary" dir="ltr">{r.domain}</Link></td><td>{r.entity}</td><td><span className="risk red"><b>{r.score}</b></span></td><td>{r.reason}</td><td className="text-xs">{r.time}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}

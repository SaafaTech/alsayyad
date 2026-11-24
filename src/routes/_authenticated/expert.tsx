import { createFileRoute } from '@tanstack/react-router';
import { useMemo,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { FlaskConical,Upload,ScanLine,LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { meta } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { supabase } from '@/integrations/supabase/client';
import { importCsv,patternStats,accuracy,sample,expertLevel } from '@/lib/sayyad/expert';
import { defangUrl,defangDomain } from '@/lib/sayyad/campaigns';
import { scanExpertSample } from '@/lib/sayyad/expert.functions';
import { rescanLink } from '@/lib/sayyad/engine.functions';
export const Route=createFileRoute('/_authenticated/expert')({head:()=>meta('بيانات المختص','مجموعة تحقق خاصة لقياس دقة الرصد من قائمة روابط المختص.'),component:Expert});
const pct=(x:number)=>`${Math.round(x*100)}%`;
function List({title,items}:{title:string;items:{name:string;value:number}[]}){return <div><h3 className="text-sm text-primary mb-2">{title}</h3>{items.length?<ul className="text-xs space-y-1">{items.map(i=><li key={i.name} className="flex justify-between gap-2"><span dir="ltr">{i.name}</span><b>{i.value}</b></li>)}</ul>:<p className="text-xs text-muted-foreground">—</p>}</div>;}
function Expert(){
  const engine=useEngine(),qc=useQueryClient(),queue=useServerFn(scanExpertSample),rescan=useServerFn(rescanLink);
  const rows=useQuery({queryKey:['expert-links'],queryFn:async()=>{const r=await supabase.from('expert_links').select('*').order('created_at');if(r.error)throw r.error;return r.data;}});
  const [n,setN]=useState(100),[busy,setBusy]=useState(false);
  const data=rows.data ?? [];
  const stats=useMemo(()=>patternStats(data,(engine.data?.entities ?? []).flatMap(e=>e.brand_keywords)),[data,engine.data?.entities]);
  const pending=data.filter(r=>!r.excluded_reason&&!r.link_id);
  const level=(id:string)=>expertLevel(engine.data?.analyses.find(x=>x.link_id===id),engine.data?.links.find(x=>x.id===id)?.status);
  const scannedRows=data.filter(r=>r.link_id);
  const acc=accuracy(data,level);
  async function upload(file:File){
    try{const parsed=importCsv(await file.text());const {data:u}=await supabase.auth.getUser();if(!u.user)return;
      const batch=`${file.name} ${new Date().toISOString()}`;
      for(let i=0;i<parsed.length;i+=500){const r=await supabase.from('expert_links').upsert(parsed.slice(i,i+500).map(p=>({...p,batch,created_by:u.user.id})),{onConflict:'created_by,url',ignoreDuplicates:true});if(r.error)throw r.error;}
      toast.success(`تم استيراد ${parsed.length} رابط`);await qc.invalidateQueries({queryKey:['expert-links']});
    }catch(e){toast.error(e instanceof Error?e.message:'تعذر قراءة الملف');}
  }
  async function scan(){setBusy(true);try{const pick=sample(pending,Math.min(n,pending.length));const r=await queue({data:{ids:pick.map(p=>p.id)}});toast.success(`أضيف ${r.queued} رابط لقائمة الفحص`);await qc.invalidateQueries({queryKey:['expert-links']});void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:'تعذر بدء الفحص');}finally{setBusy(false);}}
  async function rescanAll(){setBusy(true);try{let n=0;for(const r of scannedRows){try{n+=(await rescan({data:{link_id:r.link_id!}})).count ?? 0;}catch{/* scanning or official: skipped */}}toast.success(`أعيد ${n} رابط لقائمة الفحص`);void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:'تعذر إعادة الفحص');}finally{setBusy(false);}}
  return <div><div className="page-heading"><div><div className="eyebrow"><LockKeyhole size={14}/> خاص</div><h1>بيانات المختص</h1><p>القائمة خاصة بحسابك فقط، ولا تظهر في لوحة التحكم أو الحملات.</p></div>
    <label className="inline-flex"><input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/><Button asChild><span><Upload/>رفع CSV</span></Button></label></div>
    <p className="text-xs text-muted-foreground mb-4">الأعمدة: url، impersonated_entity (اختياري)، note (اختياري).</p>
    {rows.isPending?<div className="empty-state">جارٍ التحميل…</div>:!data.length?<div className="empty-state"><FlaskConical size={32}/>لم تُرفع روابط بعد</div>:<>
    <section className="analysis-section"><h2>تحليل الأنماط</h2>
      <div className="dash-counters">{[['الإجمالي',stats.total],['مستبعد',stats.excluded],['قابل للفحص',stats.scannable],['منصات مجانية',`${stats.freePct}%`],['يحتوي كلمة علامة',`${stats.brandPct}%`],['معلمات إعلان',`${stats.adPct}%`]].map(([l,v])=><div key={String(l)} className="counter dash-counter"><span>{l}</span><strong>{v}</strong></div>)}</div>
      <div className="grid gap-6 md:grid-cols-3"><List title="حسب المنصة" items={stats.byPlatform}/><List title="حسب النطاق العلوي" items={stats.byTld}/><List title="أكثر الكلمات تكراراً" items={stats.topTokens}/></div>
      <h3 className="text-sm text-primary mt-6 mb-2">مجموعات نمط الاسم</h3>{stats.nameGroups.length?<ul className="text-xs space-y-1">{stats.nameGroups.slice(0,20).map(g=><li key={g.key} dir="ltr" className="text-start"><b>{g.key}</b>: {g.domains.map(defangDomain).join(', ')}</li>)}</ul>:<p className="text-xs text-muted-foreground">لا توجد مجموعات</p>}
    </section>
    <section className="analysis-section mt-6"><h2>فحص عينة</h2><div className="flex items-center gap-3"><Input type="number" min={1} max={pending.length||1} value={n} onChange={e=>setN(Math.max(1,Math.min(Number(e.target.value)||1,pending.length||1)))} className="w-32"/><Button disabled={busy||engine.running||!pending.length} onClick={()=>void scan()}><ScanLine/>فحص عينة</Button><Button variant="outline" disabled={busy||engine.running||!scannedRows.length} onClick={()=>void rescanAll()}><ScanLine/>إعادة فحص المفحوصة</Button><span className="text-xs text-muted-foreground">{pending.length} رابط لم يُفحص بعد • {engine.running?engine.progress:''}</span></div></section>
    <section className="analysis-section mt-6"><h2>قياس الدقة</h2>
      <div className="dash-counters">{[['خطر',acc.red,'red'],['مشبوه',acc.yellow,'yellow'],['آمن',acc.green,'green'],['تعذر الفحص',acc.failed,''],['محذوفة',acc.removed,''],['نسبة الرصد',pct(acc.detection),''],['النسبة الصارمة',pct(acc.strict),'']].map(([l,v,c])=><div key={String(l)} className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></div>)}</div>
      <p className="text-xs text-muted-foreground">نسبة الرصد من {acc.judged} رابط قابل للحكم</p><p className="text-xs text-muted-foreground">الروابط من مختص؛ بعضها قد يكون متوقفاً وقت الفحص</p>
      {acc.greens.length>0&&<><h3 className="text-sm text-primary mt-4 mb-2">روابط صُنفت آمنة (للمراجعة)</h3><ul className="text-xs space-y-1" dir="ltr">{acc.greens.map(u=><li key={u} className="text-start break-all">{defangUrl(u)}</li>)}</ul></>}
    </section>
    <section className="analysis-section mt-6"><h2>المستبعدة</h2><ul className="text-xs space-y-1">{data.filter(r=>r.excluded_reason).slice(0,100).map(r=><li key={r.id} className="flex justify-between gap-3"><span dir="ltr" className="break-all">{defangUrl(r.url)}</span><span className="text-muted-foreground whitespace-nowrap">{r.excluded_reason}</span></li>)}</ul></section>
    </>}
  </div>;
}

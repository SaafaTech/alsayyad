import { createFileRoute } from '@tanstack/react-router';
import { useMemo,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { FlaskConical,Upload,ScanLine,LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RiskBadge } from '@/components/sayyad/common';
import { meta, ProgressCard } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { supabase } from '@/integrations/supabase/client';
import { parsePasted,resultsCsv,importCsv,patternStats,accuracy,sample,expertLevel,expectedMatrix } from '@/lib/sayyad/expert';
import { defangUrl,defangDomain } from '@/lib/sayyad/campaigns';
import { scanExpertSample } from '@/lib/sayyad/expert.functions';
import { rescanLink } from '@/lib/sayyad/engine.functions';
export const Route=createFileRoute('/_authenticated/expert')({head:()=>meta('قياس الدقة','مجموعة تحقق خاصة لقياس دقة الرصد من قائمة روابط المختص.'),component:Expert});
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
  const acc=accuracy(data,level),mx=expectedMatrix(data,level),opct=(x:number|null)=>x===null?'—':pct(x);
  async function upload(file:File){
    try{const parsed=importCsv(await file.text());const {data:u}=await supabase.auth.getUser();if(!u.user)return;
      const batch=`${file.name} ${new Date().toISOString()}`;
      for(let i=0;i<parsed.length;i+=500){const r=await supabase.from('expert_links').upsert(parsed.slice(i,i+500).map(p=>({...p,batch,created_by:u.user.id})),{onConflict:'created_by,url',ignoreDuplicates:true});if(r.error)throw r.error;}
      toast.success(`تم استيراد ${parsed.length} رابط`);await qc.invalidateQueries({queryKey:['expert-links']});
    }catch(e){toast.error(e instanceof Error?e.message:'تعذر قراءة الملف');}
  }
  async function scan(){setBusy(true);try{const pick=sample(pending,Math.min(n,pending.length));const r=await queue({data:{ids:pick.map(p=>p.id)}});toast.success(`أضيف ${r.queued} رابط لقائمة الفحص`);await qc.invalidateQueries({queryKey:['expert-links']});void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:'تعذر بدء الفحص');}finally{setBusy(false);}}
  async function rescanAll(){setBusy(true);try{let n=0;for(const r of scannedRows){try{n+=(await rescan({data:{link_id:r.link_id!}})).count ?? 0;}catch{/* scanning or official: skipped */}}toast.success(`أعيد ${n} رابط لقائمة الفحص`);void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:'تعذر إعادة الفحص');}finally{setBusy(false);}}
  return <div><div className="page-heading"><div><div className="eyebrow"><LockKeyhole size={14}/> خاص</div><h1>قياس الدقة</h1><p>القائمة خاصة بحسابك فقط، ولا تظهر في لوحة التحكم أو الحملات.</p></div>
    <label className="inline-flex"><input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/><Button asChild><span><Upload/>رفع CSV</span></Button></label></div>
    <p className="text-xs text-muted-foreground mb-4">الأعمدة: url، impersonated_entity (اختياري)، note (اختياري)، expected (اختياري: fraud/legit أو احتيال/سليم/رسمي).</p>
    <PasteBatch rows={data} level={level}/>
    {rows.isPending?<div className="empty-state">جارٍ التحميل…</div>:!data.length?<div className="empty-state"><FlaskConical size={32}/>لم تُرفع روابط بعد</div>:<>
    <section className="analysis-section"><h2>تحليل الأنماط</h2>
      <div className="dash-counters">{[['الإجمالي',stats.total],['مستبعد',stats.excluded],['قابل للفحص',stats.scannable],['منصات مجانية',`${stats.freePct}%`],['يحتوي كلمة علامة',`${stats.brandPct}%`],['معلمات إعلان',`${stats.adPct}%`]].map(([l,v])=><div key={String(l)} className="counter dash-counter"><span>{l}</span><strong>{v}</strong></div>)}</div>
      <div className="grid gap-6 md:grid-cols-3"><List title="حسب المنصة" items={stats.byPlatform}/><List title="حسب النطاق العلوي" items={stats.byTld}/><List title="أكثر الكلمات تكراراً" items={stats.topTokens}/></div>
      <h3 className="text-sm text-primary mt-6 mb-2">مجموعات نمط الاسم</h3>{stats.nameGroups.length?<ul className="text-xs space-y-1">{stats.nameGroups.slice(0,20).map(g=><li key={g.key} dir="ltr" className="text-start"><b>{g.key}</b>: {g.domains.map(defangDomain).join(', ')}</li>)}</ul>:<p className="text-xs text-muted-foreground">لا توجد مجموعات</p>}
    </section>
    <section className="analysis-section mt-6"><h2>فحص عينة</h2><div className="flex items-center gap-3"><Input type="number" min={1} max={pending.length||1} value={n} onChange={e=>setN(Math.max(1,Math.min(Number(e.target.value)||1,pending.length||1)))} className="w-32"/><Button disabled={busy||engine.running||!pending.length} onClick={()=>void scan()}><ScanLine/>فحص عينة</Button><Button variant="outline" disabled={busy||engine.running||!scannedRows.length} onClick={()=>void rescanAll()}><ScanLine/>إعادة فحص المفحوصة</Button><span className="text-xs text-muted-foreground">{pending.length} رابط لم يُفحص بعد</span></div><div className="mt-4"><ProgressCard job={busy&&!engine.running?{stage:'يجهز الروابط لقائمة الفحص…'}:engine.job} running={busy||engine.running} onStop={engine.stop}/></div></section>
    <section className="analysis-section mt-6"><h2>قياس الدقة</h2>
      <div className="dash-counters">{[['خطر',acc.red,'red'],['مشبوه',acc.yellow,'yellow'],['آمن',acc.green,'green'],['تعذر الفحص',acc.failed,''],['محذوفة',acc.removed,''],['نسبة الرصد',pct(acc.detection),''],['النسبة الصارمة',pct(acc.strict),'']].map(([l,v,c])=><div key={String(l)} className={`counter dash-counter ${c}`}><span>{l}</span><strong>{v}</strong></div>)}</div>
      <p className="text-xs text-muted-foreground">نسبة الرصد من {acc.judged} رابط قابل للحكم</p><p className="text-xs text-muted-foreground">الروابط من مختص؛ بعضها قد يكون متوقفاً وقت الفحص</p>
      {acc.greens.length>0&&<><h3 className="text-sm text-primary mt-4 mb-2">روابط صُنفت آمنة (للمراجعة)</h3><ul className="text-xs space-y-1" dir="ltr">{acc.greens.map(u=><li key={u} className="text-start break-all">{defangUrl(u)}</li>)}</ul></>}
      <h3 className="text-sm text-primary mt-6 mb-2">مقارنة بالإجابة المتوقعة</h3>{mx.caught+mx.missed+mx.legitOk+mx.falseAlarm===0?<p className="text-xs text-muted-foreground">لا توجد روابط بإجابة متوقعة ونتيجة قابلة للحكم</p>:<>
      <div className="matrix"><div><span>كُشف ✅</span><strong style={{color:'var(--success)'}}>{mx.caught}</strong><small className="text-xs text-muted-foreground">احتيال صُنف خطر/مشبوه</small></div><div><span>فات ❌</span><strong style={{color:'var(--destructive)'}}>{mx.missed}</strong><small className="text-xs text-muted-foreground">احتيال صُنف آمن</small></div><div><span>سليم ✅</span><strong style={{color:'var(--success)'}}>{mx.legitOk}</strong><small className="text-xs text-muted-foreground">سليم صُنف آمن</small></div><div><span>إنذار كاذب ⚠️</span><strong style={{color:'var(--warning)'}}>{mx.falseAlarm}</strong><small className="text-xs text-muted-foreground">سليم صُنف خطر/مشبوه</small></div></div>
      <div className="dash-counters mt-3"><div className="counter dash-counter"><span>نسبة الكشف</span><strong>{opct(mx.detection)}</strong></div><div className="counter dash-counter"><span>نسبة الإنذار الكاذب</span><strong>{opct(mx.falseRate)}</strong></div></div>
      {([['فات (للمراجعة)',mx.missedUrls],['إنذار كاذب (للمراجعة)',mx.falseUrls]] as const).map(([t,us])=>us.length>0&&<div key={t}><h3 className="text-sm text-primary mt-4 mb-2">{t}</h3><ul className="text-xs space-y-1" dir="ltr">{us.map(u=><li key={u} className="text-start break-all">{defangUrl(u)}</li>)}</ul></div>)}</>}
    </section>
    <section className="analysis-section mt-6"><h2>المستبعدة</h2><ul className="text-xs space-y-1">{data.filter(r=>r.excluded_reason).slice(0,100).map(r=><li key={r.id} className="flex justify-between gap-3"><span dir="ltr" className="break-all">{defangUrl(r.url)}</span><span className="text-muted-foreground whitespace-nowrap">{r.excluded_reason}</span></li>)}</ul></section>
    </>}
  </div>;
}

type Row={id:string;url:string;batch:string|null;link_id:string|null;excluded_reason:string|null;created_at:string};
/** Paste up to 500 URLs (hidden test set), import like the CSV, queue them, and show live verdicts with CSV export. */
function PasteBatch({rows,level}:{rows:Row[];level:(id:string)=>string|null}){
  const engine=useEngine(),qc=useQueryClient(),queue=useServerFn(scanExpertSample);
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[batch,setBatch]=useState<string|null>(null);
  const latest=batch ?? [...rows].reverse().find(r=>r.batch?.startsWith('قائمة ملصوقة'))?.batch ?? null;
  const mine=rows.filter(r=>latest&&r.batch===latest);
  const result=mine.map(r=>{const a=r.link_id?engine.data?.analyses.find(x=>x.link_id===r.link_id):undefined,l=r.link_id?engine.data?.links.find(x=>x.id===r.link_id):undefined;const lv=r.excluded_reason?'excluded':r.link_id?level(r.link_id):null;
    return {id:r.id,url:r.url,level:lv,score:a?.score ?? null,top_reason:r.excluded_reason ?? a?.reasons_ar[0] ?? l?.scan_error ?? null,final_url:l?.final_url ?? null,status:l?.status ?? null};});
  const done=result.filter(r=>r.level&&r.level!=='excluded').length,total=result.filter(r=>r.level!=='excluded').length;
  const lines=text.split(/\r?\n/).filter(l=>l.trim()).length;
  async function submit(){setBusy(true);try{
    const parsed=parsePasted(text);if(!parsed.length){toast.error('لا توجد روابط');return;}
    const {data:u}=await supabase.auth.getUser();if(!u.user)return;
    const name=`قائمة ملصوقة ${new Date().toLocaleString('ar-AE')}`;
    const up=await supabase.from('expert_links').upsert(parsed.map(p=>({...p,batch:name,created_by:u.user.id})),{onConflict:'created_by,url'}).select('id,excluded_reason,link_id');if(up.error)throw up.error;
    const ids=(up.data ?? []).filter(r=>!r.excluded_reason&&!r.link_id).map(r=>r.id);
    let queued=0;if(ids.length)queued=(await queue({data:{ids}})).queued;
    setBatch(name);setText('');toast.success(`استُورد ${parsed.length} رابط، وأضيف ${queued} لقائمة الفحص`);
    await qc.invalidateQueries({queryKey:['expert-links']});void engine.resume();
  }catch(e){toast.error(e instanceof Error?e.message:'تعذر استيراد القائمة');}finally{setBusy(false);}}
  function exportCsv(){const blob=new Blob(['\uFEFF'+resultsCsv(result)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sayyad-results.csv';a.click();URL.revokeObjectURL(a.href);}
  const word=(l:string|null)=>l==='red'?'خطر':l==='yellow'?'مشبوه':l==='green'?'آمن':l==='removed'?'محذوفة':l==='failed'?'تعذر الفحص':l==='excluded'?'مستبعد':'بالانتظار';
  return <section className="analysis-section mb-6"><h2>فحص قائمة روابط</h2>
    <p className="text-xs text-muted-foreground mb-2">رابط في كل سطر (يُقبل الشكل المعطّل مثل hxxps://site[.]com)، ويمكن إضافة فاصلة ثم fraud أو legit. الحد 500 رابط.</p>
    <Textarea dir="ltr" rows={6} className="mono text-start" value={text} onChange={e=>setText(e.target.value)} placeholder={'hxxps://example[.]com/pay,fraud\nhttps://example.org,legit'}/>
    <div className="flex items-center gap-3 mt-3"><Button disabled={busy||!lines||lines>500} onClick={()=>void submit()}><ScanLine/>{busy?'جارٍ الاستيراد…':'استيراد وفحص'}</Button><span className={`text-xs ${lines>500?'text-destructive':'text-muted-foreground'}`}>{lines} / 500</span></div>
    {latest&&<div className="mt-4"><div className="flex items-center justify-between gap-3 mb-2"><span className="text-sm">{latest} — اكتمل {done} من {total}</span><Button variant="outline" size="sm" disabled={!result.length} onClick={exportCsv}><Upload/>تصدير CSV</Button></div>
      <div className="h-2 rounded bg-muted overflow-hidden mb-3"><div className="h-full bg-primary transition-all" style={{width:`${total?Math.round(done*100/total):0}%`}}/></div>
      <ProgressCard job={engine.job} running={engine.running} onStop={engine.stop}/>
      <div className="overflow-x-auto mt-3"><table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start p-1">الرابط</th><th className="text-start p-1">الحكم</th><th className="text-start p-1">السبب الرئيسي</th><th className="text-start p-1">الوجهة النهائية</th></tr></thead>
      <tbody>{result.map(r=><tr key={r.id} className="border-t border-border"><td dir="ltr" className="p-1 text-start break-all mono">{defangUrl(r.url)}</td><td className="p-1 whitespace-nowrap">{r.level==='red'||r.level==='yellow'||r.level==='green'?<RiskBadge level={r.level} score={r.score ?? 0}/>:word(r.level)}</td><td className="p-1">{r.top_reason ?? '—'}</td><td dir="ltr" className="p-1 text-start break-all mono">{r.final_url&&r.final_url!==r.url?defangUrl(r.final_url):'—'}</td></tr>)}</tbody></table></div></div>}
  </section>;
}

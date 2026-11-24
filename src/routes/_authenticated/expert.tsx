import { tr, tf } from '@/lib/i18n';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { FlaskConical,Upload,ScanLine,Lock,ListFilter,Info,ArrowDownUp,Flame,Eye,Trash2,ShieldCheck,Clock,Fingerprint,Megaphone,Cloud,Tag,Plus,Target,Download,ChevronDown,SlidersHorizontal,Shuffle,RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RiskBadge, needsReview } from '@/components/sayyad/common';
import { meta, ProgressCard } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { supabase } from '@/integrations/supabase/client';
import { parsePasted,resultsCsv,importCsv,patternStats,accuracy,sample,expertLevel,expectedMatrix } from '@/lib/sayyad/expert';
import { defangUrl,defangDomain } from '@/lib/sayyad/campaigns';
import { scanExpertSample } from '@/lib/sayyad/expert.functions';
import { rescanLink } from '@/lib/sayyad/engine.functions';
import { addPhrase } from '@/lib/sayyad/phrases.functions';
import { phraseKey } from '@/lib/sayyad/phrases';
import { platformLabel } from '@/lib/sayyad/rules';
import { BarList } from '@/components/sayyad/bar-list';
export const Route=createFileRoute('/_authenticated/expert')({head:()=>meta(tr("تدقيق خاص"),tr("فرز البلاغات وتحليل الأنماط وقياس دقة الرصد — خاص بحسابك.")),component:Expert});
const pct=(x:number)=>`${Math.round(x*100)}%`;
function Card({n,icon,title,action,children}:{n:string;icon:React.ReactNode;title:string;action?:React.ReactNode;children:React.ReactNode}){
  return <section className="analysis-section x-card"><div className="x-head"><h2><span className="x-ic">{icon}</span>{n}. {title}</h2>{action}</div>{children}</section>;
}
function Tile({tone,icon,label,value,sub}:{tone:'red'|'amber'|'grey'|'green';icon:React.ReactNode;label:string;value:React.ReactNode;sub?:string}){
  return <div className={`x-tile t-${tone}`}><span className="x-badge">{icon}</span><span className="x-label">{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>;
}
function Expert(){
  const engine=useEngine(),qc=useQueryClient(),queue=useServerFn(scanExpertSample),rescan=useServerFn(rescanLink),add=useServerFn(addPhrase);
  const rows=useQuery({queryKey:['expert-links'],queryFn:async()=>{const r=await supabase.from('expert_links').select('*').order('created_at');if(r.error)throw r.error;return r.data;}});
  const [n,setN]=useState(100),[busy,setBusy]=useState(false),[openGroup,setOpenGroup]=useState<string|null>(null),[added,setAdded]=useState<Set<string>>(new Set());
  const data=rows.data ?? [];
  const stats=useMemo(()=>patternStats(data,(engine.data?.entities ?? []).flatMap(e=>e.brand_keywords)),[data,engine.data?.entities]);
  const pending=data.filter(r=>!r.excluded_reason&&!r.link_id);
  const level=(id:string)=>expertLevel(engine.data?.analyses.find(x=>x.link_id===id),engine.data?.links.find(x=>x.id===id)?.status);
  const scannedRows=data.filter(r=>r.link_id);
  const acc=accuracy(data,level),mx=expectedMatrix(data,level),opct=(x:number|null)=>x===null?'—':pct(x);
  const paste=usePasteBatch(data,level);
  const phraseKeys=new Set((engine.data?.phrases ?? []).map(p=>phraseKey(p.phrase)));
  async function upload(file:File){
    try{const parsed=importCsv(await file.text());const {data:u}=await supabase.auth.getUser();if(!u.user)return;
      const batch=`${file.name} ${new Date().toISOString()}`;
      for(let i=0;i<parsed.length;i+=500){const r=await supabase.from('expert_links').upsert(parsed.slice(i,i+500).map(p=>({...p,batch,created_by:u.user.id})),{onConflict:'created_by,url',ignoreDuplicates:true});if(r.error)throw r.error;}
      toast.success(tf("تم استيراد {0} رابط",parsed.length));await qc.invalidateQueries({queryKey:['expert-links']});
    }catch(e){toast.error(e instanceof Error?e.message:tr("تعذر قراءة الملف"));}
  }
  const [adv,setAdv]=useState(false);
  async function scan(){setBusy(true);try{const pick=sample(pending,Math.min(n,pending.length));const r=await queue({data:{ids:pick.map(p=>p.id)}});toast.success(tf("أضيف {0} رابط لقائمة الفحص",r.queued));await qc.invalidateQueries({queryKey:['expert-links']});void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر بدء الفحص"));}finally{setBusy(false);}}
  async function rescanAll(){setBusy(true);try{let n=0;for(const r of scannedRows){try{n+=(await rescan({data:{link_id:r.link_id!}})).count ?? 0;}catch{/* scanning or official: skipped */}}toast.success(tf("أعيد {0} رابط لقائمة الفحص",n));void engine.resume();}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر إعادة الفحص"));}finally{setBusy(false);}}
  async function addWord(w:string){try{await add({data:{phrase:w,entity_id:null}});setAdded(s=>new Set(s).add(phraseKey(w)));toast.success(tr("أُضيفت كعبارة صيد"));void qc.invalidateQueries({queryKey:['workspace']});}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر الحفظ"));}}
  const dead=acc.removed+acc.failed,deadPct=acc.scanned?Math.round(dead*100/acc.scanned):0;
  const noExpected=mx.caught+mx.missed+mx.legitOk+mx.falseAlarm===0;
  const fileInput=<label className="inline-flex"><input type="file" accept=".csv,text/csv" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/><Button asChild variant="outline"><span><Upload/>{tr("رفع CSV")}</span></Button></label>;
  return <div className="expert-page"><div className="page-heading"><div><div className="eyebrow"><Lock size={14}/> {tr("خاص بحسابك")}</div><h1>{tr("تدقيق خاص")}</h1><p>{tr("فرز البلاغات • تحليل الأنماط • قياس الدقة")}</p></div></div>
    <Card n={tr("١")} icon={<ListFilter size={16}/>} title={tr("الصق روابط البلاغات")}>
      {paste.input(<>{fileInput}<Button variant="outline" className="ms-auto border-primary text-primary hover:text-primary" aria-expanded={adv} onClick={()=>setAdv(v=>!v)}><SlidersHorizontal/>{tr("خيارات متقدمة: فحص عينة")}<ChevronDown className={adv?"rotate-180 transition-transform":"transition-transform"}/></Button></>)}
      <p className="x-hint">{tr("رابط في كل سطر، ويمكن إضافة ,fraud أو ,legit بعده")}<span className="x-info" tabIndex={0} title={tr("الأعمدة: url، impersonated_entity (اختياري)، note (اختياري)، expected (اختياري: fraud/legit أو احتيال/سليم/رسمي).")+' — '+tr("يُقبل الشكل المعطّل مثل hxxps://site[.]com. الحد 500 رابط.")} aria-label={tr("تفاصيل الأعمدة")}><Info size={14}/></span></p>
      {adv&&<div className="x-adv-panel mt-3 rounded-lg border p-4 space-y-4">
        <div><label htmlFor="x-sample-n" className="block text-sm font-medium mb-1">{tr("عدد الروابط في العينة")}</label><Input id="x-sample-n" type="number" min={1} max={pending.length||1} value={n} onChange={e=>setN(Math.max(1,Math.min(Number(e.target.value)||1,pending.length||1)))} className="w-[120px]"/><p className="text-xs text-muted-foreground mt-1">{tf("يختار الصيّاد هذا العدد عشوائياً من الروابط التي لم تُفحص بعد ({0} رابط). الاختيار العشوائي يعطي صورة عادلة عن القائمة كاملة بدل أول الروابط فقط.",pending.length)}</p></div>
        <div><Button className="gold-btn" disabled={busy||engine.running||!pending.length} onClick={()=>void scan()}><Shuffle/>{tr("افحص عينة عشوائية")}</Button></div>
        <div><Button variant="outline" disabled={busy||engine.running||!scannedRows.length} onClick={()=>void rescanAll()}><RotateCcw/>{tf("أعد فحص الروابط السابقة ({0})",scannedRows.length)}</Button><p className="text-xs text-muted-foreground mt-1">{tr("يفحص مرة ثانية الروابط التي سبق فحصها — مفيد إذا تغيّرت حالة المواقع.")}</p></div>
        <ProgressCard job={busy&&!engine.running?{stage:tr("يجهز الروابط لقائمة الفحص…")}:engine.job} running={busy||engine.running} onStop={engine.stop}/></div>}
    </Card>
    {rows.isPending?<div className="empty-state">{tr("جارٍ التحميل…")}</div>:!data.length?<div className="empty-state"><FlaskConical size={32}/>{tr("لم تُرفع روابط بعد")}</div>:<>
    <Card n={tr("٢")} icon={<ArrowDownUp size={16}/>} title={tf("نتيجة الفرز ({0} رابط)",acc.scanned)} action={paste.hasResult?<Button variant="outline" size="sm" onClick={paste.exportCsv}><Download/>{tr("تصدير CSV")}</Button>:undefined}>
      <div className="x-tiles">
        <Tile tone="red" icon={<Flame size={16}/>} label={tr("حي وخطر — ابدأ هنا")} value={acc.red}/>
        <Tile tone="amber" icon={<Eye size={16}/>} label={tr("تحتاج مراجعة")} value={acc.yellow}/>
        <Tile tone="grey" icon={<Trash2 size={16}/>} label={tr("محذوف أو ميت")} value={dead}/>
        <Tile tone="green" icon={<ShieldCheck size={16}/>} label={tr("سليم أو رسمي")} value={acc.green}/>
      </div>
      <p className="x-summary"><Clock size={14}/>{tf("{0}% من المواقع انحذفت أو توقفت قبل الوصول إليها",deadPct)}</p>
      {paste.results}
    </Card>
    <Card n={tr("٣")} icon={<Fingerprint size={16}/>} title={tr("خيوط للتحقيق")}>
      <p className="x-hint mb-4">{tr("الإجمالي")} {stats.total} • {tr("مستبعد")} {stats.excluded} • {tr("قابل للفحص")} {stats.scannable}</p>
      <div className="x-tiles x-tiles-3">
        <Tile tone="amber" icon={<Megaphone size={16}/>} label={tr("إعلانات قوقل مدفوعة")} value={`${stats.adPct}%`}/>
        <Tile tone="grey" icon={<Cloud size={16}/>} label={tr("منصات مجانية")} value={`${stats.freePct}%`}/>
        <Tile tone="red" icon={<Tag size={16}/>} label={tr("يحتوي اسم جهة")} value={`${stats.brandPct}%`}/>
      </div>
      <div className="x-two">
        <div><h3 className="x-sub">{tr("نفس العصابة (نمط الاسم)")}</h3>{stats.nameGroups.length?<><div className="x-chips">{stats.nameGroups.slice(0,20).map(g=><button type="button" key={g.key} dir="ltr" className={`x-chip red${openGroup===g.key?' on':''}`} aria-expanded={openGroup===g.key} onClick={()=>setOpenGroup(o=>o===g.key?null:g.key)}>{g.key} ×{g.domains.length}</button>)}</div>
          {openGroup&&<ul className="x-domains" dir="ltr">{stats.nameGroups.find(g=>g.key===openGroup)?.domains.map(d=><li key={d}>{defangDomain(d)}</li>)}</ul>}</>:<p className="dash-none">{tr("لا توجد مجموعات")}</p>}</div>
        <div><h3 className="x-sub">{tr("المنصات")}</h3><BarList data={stats.byPlatform.map(p=>({name:platformLabel(p.name),value:p.value}))} tone="amber"/></div>
      </div>
      <h3 className="x-sub mt-5">{tr("كلمات متكررة")}</h3>{stats.topTokens.length?<div className="x-chips">{stats.topTokens.map(t=>{const has=phraseKeys.has(phraseKey(t.name))||added.has(phraseKey(t.name));return <span key={t.name} className="x-chip" dir="ltr">{t.name} ×{t.value}{!has&&t.name.trim().length>=3&&<button type="button" className="x-plus" title={tr("أضف كعبارة صيد")} aria-label={tr("أضف كعبارة صيد")} onClick={()=>void addWord(t.name)}><Plus size={12}/></button>}</span>;})}</div>:<p className="dash-none">—</p>}
    </Card>
    <Card n={tr("٤")} icon={<Target size={16}/>} title={tr("قياس الدقة")}>
      <div className="x-tiles">
        <Tile tone="green" icon={<ShieldCheck size={16}/>} label={tr("احتيال كُشف ✓")} value={noExpected?'—':mx.caught}/>
        <Tile tone="red" icon={<Flame size={16}/>} label={tr("احتيال فات ✗")} value={noExpected?'—':mx.missed}/>
        <Tile tone="green" icon={<ShieldCheck size={16}/>} label={tr("سليم صح ✓")} value={noExpected?'—':mx.legitOk}/>
        <Tile tone="amber" icon={<Eye size={16}/>} label={tr("إنذار كاذب ⚠")} value={noExpected?'—':mx.falseAlarm}/>
      </div>
      {noExpected?<p className="x-hint mt-3">{tr("يتعبّى لما تضيف fraud أو legit بعد كل رابط")}</p>:<p className="x-summary"><span>{tr("نسبة الكشف")}: <b>{opct(mx.detection)}</b></span><span>{tr("نسبة الإنذار الكاذب")}: <b>{opct(mx.falseRate)}</b></span></p>}
      <p className="x-hint mt-2">{tr("نسبة الرصد")} {pct(acc.detection)} • {tr("النسبة الصارمة")} {pct(acc.strict)} — {tr("نسبة الرصد من")} {acc.judged} {tr("رابط قابل للحكم")}</p>
      {([[tr("روابط صُنفت آمنة (للمراجعة)"),acc.greens],[tr("فات (للمراجعة)"),mx.missedUrls],[tr("إنذار كاذب (للمراجعة)"),mx.falseUrls]] as const).map(([t,us])=>us.length>0&&<details key={t} className="x-adv"><summary><ChevronDown size={14}/>{t} ({us.length})</summary><ul className="x-domains" dir="ltr">{us.map(u=><li key={u}>{defangUrl(u)}</li>)}</ul></details>)}
      {data.some(r=>r.excluded_reason)&&<details className="x-adv"><summary><ChevronDown size={14}/>{tr("المستبعدة")}</summary><ul className="text-xs space-y-1 mt-2">{data.filter(r=>r.excluded_reason).slice(0,100).map(r=><li key={r.id} className="flex justify-between gap-3"><span dir="ltr" className="break-all">{defangUrl(r.url)}</span><span className="text-muted-foreground whitespace-nowrap">{r.excluded_reason}</span></li>)}</ul></details>}
    </Card>
    </>}
  </div>;
}

type Row={id:string;url:string;batch:string|null;link_id:string|null;excluded_reason:string|null;created_at:string};
/** Paste up to 500 URLs (hidden test set), import like the CSV, queue them, and show live verdicts with CSV export. */
function usePasteBatch(rows:Row[],level:(id:string)=>string|null){
  const engine=useEngine(),qc=useQueryClient(),queue=useServerFn(scanExpertSample);
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[batch,setBatch]=useState<string|null>(null);
  const latest=batch ?? [...rows].reverse().find(r=>r.batch?.startsWith('قائمة ملصوقة'))?.batch ?? null;
  const mine=rows.filter(r=>latest&&r.batch===latest);
  const result=mine.map(r=>{const a=r.link_id?engine.data?.analyses.find(x=>x.link_id===r.link_id):undefined,l=r.link_id?engine.data?.links.find(x=>x.id===r.link_id):undefined;const lv=r.excluded_reason?'excluded':r.link_id?level(r.link_id):null;
    return {id:r.id,url:r.url,level:lv,score:a?.score ?? null,signals:a?.signals,top_reason:r.excluded_reason ?? tr(a?.reasons_ar[0]) ?? l?.scan_error ?? null,final_url:l?.final_url ?? null,status:l?.status ?? null};});
  const done=result.filter(r=>r.level&&r.level!=='excluded').length,total=result.filter(r=>r.level!=='excluded').length;
  const lines=text.split(/\r?\n/).filter(l=>l.trim()).length;
  async function submit(){setBusy(true);try{
    const parsed=parsePasted(text);if(!parsed.length){toast.error(tr("لا توجد روابط"));return;}
    const {data:u}=await supabase.auth.getUser();if(!u.user)return;
    const name=tf("قائمة ملصوقة {0}",new Date().toLocaleString('ar-AE'));
    const up=await supabase.from('expert_links').upsert(parsed.map(p=>({...p,batch:name,created_by:u.user.id})),{onConflict:'created_by,url'}).select('id,excluded_reason,link_id');if(up.error)throw up.error;
    const ids=(up.data ?? []).filter(r=>!r.excluded_reason&&!r.link_id).map(r=>r.id);
    let queued=0;if(ids.length)queued=(await queue({data:{ids}})).queued;
    setBatch(name);setText('');toast.success(tf("استُورد {0} رابط، وأضيف {1} لقائمة الفحص",parsed.length,queued));
    await qc.invalidateQueries({queryKey:['expert-links']});void engine.resume();
  }catch(e){toast.error(e instanceof Error?e.message:tr("تعذر استيراد القائمة"));}finally{setBusy(false);}}
  function exportCsv(){const blob=new Blob(['\uFEFF'+resultsCsv(result)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sayyad-results.csv';a.click();URL.revokeObjectURL(a.href);}
  const word=(l:string|null,score:number|null=null,signals?:unknown)=>l==='red'?tr("خطر"):l==='yellow'?(needsReview({level:'yellow',score:score ?? 0,signals})?tr("تحتاج مراجعة"):tr("مشبوه")):l==='green'?tr("آمن"):l==='removed'?tr("محذوفة"):l==='failed'?tr("تعذر الفحص"):l==='excluded'?tr("مستبعد"):tr("بالانتظار");
  const input=(extra:React.ReactNode)=><>
    <Textarea dir="ltr" rows={6} className="mono text-start" spellCheck={false} value={text} onChange={e=>setText(e.target.value)} placeholder={'hxxps://example[.]com/pay,fraud\nhttps://example.org,legit'}/>
    <div className="flex flex-wrap items-center gap-3 mt-3"><Button className="gold-btn" disabled={busy||!lines||lines>500} onClick={()=>void submit()}><ScanLine/>{busy?tr("جارٍ الاستيراد…"):tr("فحص القائمة")}</Button>{extra}<span className={`text-xs ${lines>500?'text-destructive':'text-muted-foreground'}`}>{lines} / 500</span></div></>;
  const results=latest?<div className="mt-4"><div className="text-sm mb-2">{latest} {tr("— اكتمل")} {done} {tr("من")} {total}</div>
      <div className="h-2 rounded bg-muted overflow-hidden mb-3"><div className="h-full bg-primary transition-all" style={{width:`${total?Math.round(done*100/total):0}%`}}/></div>
      <ProgressCard job={engine.job} running={engine.running} onStop={engine.stop}/>
      <div className="overflow-x-auto mt-3"><table className="w-full text-xs"><thead><tr className="text-muted-foreground"><th className="text-start p-1">{tr("الرابط")}</th><th className="text-start p-1">{tr("الحكم")}</th><th className="text-start p-1">{tr("السبب الرئيسي")}</th><th className="text-start p-1">{tr("الوجهة النهائية")}</th></tr></thead>
      <tbody>{result.map(r=><tr key={r.id} className="border-t border-border"><td dir="ltr" className="p-1 text-start break-all mono">{defangUrl(r.url)}</td><td className="p-1 whitespace-nowrap">{r.level==='red'||r.level==='yellow'||r.level==='green'?<RiskBadge level={r.level} score={r.score ?? 0} signals={r.signals}/>:word(r.level,r.score,r.signals)}</td><td className="p-1">{r.top_reason ?? '—'}</td><td dir="ltr" className="p-1 text-start break-all mono">{r.final_url&&r.final_url!==r.url?defangUrl(r.final_url):'—'}</td></tr>)}</tbody></table></div></div>:null;
  return {input,results,exportCsv,hasResult:result.length>0};
}

import { tr, tf } from '@/lib/i18n';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Moon, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getAutoState, setAutoSettings, getRecheckState, startRecheck } from '@/lib/sayyad/auto.functions';
const when=(s:string|null)=>s?new Date(s).toLocaleString('ar-AE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
function useAuto(){const f=useServerFn(getAutoState);return useQuery({queryKey:['auto-state'],queryFn:()=>f(),refetchInterval:30000});}
const kindLabel:Record<string,string>={search:'بحث',ct:'سجلات الشهادات',worker:'فحص'};
const statusLabel:Record<string,string>={running:'يعمل',done:'اكتمل',partial:'اكتمل مع أخطاء',cap_reached:'بلغ الحد اليومي'};
/** Dashboard: last 24 hours of automatic runs. */
export function NightCard(){const q=useAuto();const d=q.data?.day;
  return <section className="analysis-section dash-card mb-6"><h2 className="flex items-center gap-2"><Moon size={16}/>{tr("صيد الليلة")}</h2>
    {!d?<p className="dash-none">{q.isError?tr("تعذر التحميل"):tr("جارٍ التحميل…")}</p>:<><div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">{([[tr("روابط جديدة"),d.new_links],[tr("فُحص"),d.scanned],[tr("خطر"),d.red],[tr("تحتاج مراجعة"),d.yellow],[tr("حملات جديدة"),d.campaigns]] as const).map(([l,v])=><div key={l}><div className="text-muted-foreground">{l}</div><b className="text-lg">{v}</b></div>)}</div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>{tr("آخر تشغيل")}: {when(d.last)}</span><Link to="/hunt" search={{auto:true}} className="text-primary">{tr("عرض الخطر والمشبوه من الصيد التلقائي ←")}</Link></div></>}
  </section>;
}
/** Hunt page: owner-only switch, cap and recent runs. */
export function AutoPanel(){const q=useAuto(),qc=useQueryClient(),save=useServerFn(setAutoSettings);const s=q.data?.settings;
  const[cap,setCap]=useState(''),[zcap,setZcap]=useState('');useEffect(()=>{if(s)setCap(String(s.daily_cap));},[s?.daily_cap]);useEffect(()=>{if(s)setZcap(String(s.zyte_daily_cap));},[s?.zyte_daily_cap]);
  if(!q.data?.isOwner||!s)return null;
  async function put(enabled:boolean,daily_cap:number,zyte_daily_cap=s?.zyte_daily_cap ?? 30){try{await save({data:{enabled,daily_cap,zyte_daily_cap}});await qc.invalidateQueries({queryKey:['auto-state']});}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر الحفظ"));}}
  const capN=Number(cap),capOk=Number.isInteger(capN)&&capN>=10&&capN<=500,zN=Number(zcap),zOk=zcap!==''&&Number.isInteger(zN)&&zN>=0&&zN<=500;
  return <section className="analysis-section mt-4"><h2 className="flex items-center gap-2"><Bot size={16}/>{tr("الصيد التلقائي")}</h2>
    <div className="flex flex-wrap items-center gap-4 text-sm"><label className="flex items-center gap-2"><Switch checked={s.enabled} onCheckedChange={v=>void put(v,s.daily_cap)} aria-label={tr("تشغيل الصيد التلقائي")}/>{s.enabled?tr("يعمل"):tr("متوقف")}</label>
      <label className="flex items-center gap-2">{tr("الحد اليومي")}<Input type="number" min={10} max={500} className="w-24" dir="ltr" value={cap} onChange={e=>setCap(e.target.value)}/></label>
      <Button size="sm" variant="outline" className="text-foreground" disabled={!capOk||capN===s.daily_cap} onClick={()=>void put(s.enabled,capN)}>{tr("حفظ")}</Button>
      <span className="text-muted-foreground">{tf("اليوم: {0} من {1}",q.data.today,s.daily_cap)}</span></div>
    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm"><span>{tf("فحوصات Zyte اليوم {0} / {1}",q.data.zyteToday,s.zyte_daily_cap)}</span>
      <label className="flex items-center gap-2">{tr("حد Zyte اليومي")}<Input type="number" min={0} max={500} className="w-24" dir="ltr" value={zcap} onChange={e=>setZcap(e.target.value)}/></label>
      <Button size="sm" variant="outline" className="text-foreground" disabled={!zOk||zN===s.zyte_daily_cap} onClick={()=>void put(s.enabled,s.daily_cap,zN)}>{tr("حفظ")}</Button></div>
    <RecheckRow used={q.data.zyteToday} cap={s.zyte_daily_cap}/>
    {q.data.runs.length?<ul className="mt-3 space-y-1 text-sm">{q.data.runs.map(r=><li key={r.id} className="flex flex-wrap gap-2 text-muted-foreground"><span>{when(r.started_at)}</span><b className="text-foreground">{tr(kindLabel[r.kind] ?? r.kind)}</b><span>{tr(statusLabel[r.status] ?? r.status)}</span><span>{tf("{0} جديد • {1} فُحص • {2} خطر • {3} مراجعة",r.new_links,r.scanned,r.red,r.yellow)}</span></li>)}</ul>:<p className="mt-3 text-sm text-muted-foreground">{tr("لا توجد تشغيلات بعد")}</p>}
  </section>;
}
/** Owner-only: one-time re-check of old Cloudflare-unscannable links through Zyte (AE). */
function RecheckRow({used,cap}:{used:number;cap:number}){const get=useServerFn(getRecheckState),run=useServerFn(startRecheck),qc=useQueryClient();
  const q=useQuery({queryKey:['zyte-recheck'],queryFn:()=>get(),refetchInterval:60000});const[busy,setBusy]=useState(false);
  async function go(){setBusy(true);try{const r=await run();toast.success(tf("أُعيد إدراج {0} رابط لإعادة الفحص",r.queued));await qc.invalidateQueries({queryKey:['zyte-recheck']});await qc.invalidateQueries({queryKey:['auto-state']});}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر الحفظ"));}finally{setBusy(false);}}
  const remaining=q.data?.remaining;
  return <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
    <Button size="sm" variant="outline" className="text-foreground" disabled={busy||!remaining||used>=cap} onClick={()=>void go()}>{tr("إعادة فحص المقفول من داخل الإمارات (15 رابط)")}</Button>
    <span className="text-muted-foreground">{remaining===undefined?tr("جارٍ التحميل…"):tf("المتبقي المؤهل: {0}",remaining)}</span>
    <span className="text-muted-foreground">{tf("فحوصات Zyte اليوم {0} / {1}",used,cap)}</span>
    {used>=cap&&<span className="text-muted-foreground">{tr("وصلنا حد Zyte اليومي؛ أعد المحاولة غداً أو ارفع الحد")}</span>}</div>;
}

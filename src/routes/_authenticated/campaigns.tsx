import { createFileRoute,Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Network,RefreshCw,Megaphone,Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { meta, ProgressCard } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { listCampaigns,rebuildCampaigns } from '@/lib/sayyad/campaigns.functions';
import { listEvidence } from '@/lib/sayyad/evidence.functions';
import { awarenessMessage,defangDomain } from '@/lib/sayyad/campaigns';
import { uaeTime } from '@/lib/sayyad/evidence';
export const Route=createFileRoute('/_authenticated/campaigns')({head:()=>meta('الحملات','تجميع الروابط الخطرة المترابطة في حملات انتحال مع أسباب الربط ورسائل التوعية.'),component:Campaigns});
function Campaigns(){
  const engine=useEngine(),qc=useQueryClient(),list=useServerFn(listCampaigns),rebuild=useServerFn(rebuildCampaigns),ev=useServerFn(listEvidence);
  const q=useQuery({queryKey:['campaigns'],queryFn:()=>list(),refetchInterval:15000}),evidence=useQuery({queryKey:['evidence'],queryFn:()=>ev()});
  const [busy,setBusy]=useState(false),[msg,setMsg]=useState<string|null>(null);
  async function regroup(){setBusy(true);try{const r=await rebuild();toast.success(`تم التجميع: ${r.count} حملة`);await qc.invalidateQueries({queryKey:['campaigns']});}catch(e){toast.error(e instanceof Error?e.message:'تعذر التجميع');}finally{setBusy(false);}}
  const links=new Map((engine.data?.links ?? []).map(l=>[l.id,l]));
  return <div><div className="page-heading"><div><div className="eyebrow"><Network size={14}/> ربط الأدلة</div><h1>الحملات</h1><p>روابط خطرة مترابطة بقواعد ثابتة (سلسلة، هاتف، استضافة، قالب، نمط اسم) — بدون ذكاء اصطناعي.</p></div><Button variant="outline" disabled={busy} onClick={()=>void regroup()}><RefreshCw/>إعادة التجميع</Button></div>{busy&&<div className="mb-6"><ProgressCard job={{stage:'يعيد تجميع الحملات من الروابط الخطرة…'}} running/></div>}
    {q.isPending?<div className="empty-state">جارٍ تحميل الحملات…</div>:!q.data?.campaigns.length?<div className="empty-state">لا توجد حملات بعد — تحتاج رابطين خطرين مترابطين على الأقل</div>:
    <div className="grid gap-4 lg:grid-cols-2">{q.data.campaigns.map(c=>{
      const members=q.data.links.filter(m=>m.campaign_id===c.id).map(m=>links.get(m.link_id)).filter(l=>!!l);
      const entity=engine.data?.entities.find(e=>e.id===c.entity_id);const sig=c.signals as {reasons_ar?:string[];platforms?:string[]};
      return <section key={c.id} className="analysis-section"><div className="flex justify-between items-start gap-3"><div><h2>{c.name_ar}</h2><p className="text-xs text-muted-foreground mt-1">{entity?.name_ar ?? 'جهة غير محددة'} • {c.link_count} روابط • <span dir="ltr">{(sig.platforms ?? []).join(', ')}</span></p><p className="text-xs text-muted-foreground mt-1">أول رصد: {uaeTime(c.first_seen_at)} — آخر رصد: {uaeTime(c.last_seen_at)}</p></div><Button size="sm" onClick={()=>setMsg(awarenessMessage(entity,members.map(l=>l.domain)))}><Megaphone/>رسالة توعية</Button></div>
        <div className="flex flex-wrap gap-2 my-3">{(sig.reasons_ar ?? []).map(r=><span key={r} className="platform-tag">{r}</span>)}</div>
        <ul className="space-y-1">{members.map(l=>{const file=evidence.data?.find(e=>e.link_id===l.id);return <li key={l.id} className="flex justify-between gap-2 text-sm">{file?<Link to="/evidence" search={{id:file.id}} className="text-primary domain-label" dir="ltr">{defangDomain(l.domain)}</Link>:<Link to="/analysis" search={{id:l.id}} className="text-primary domain-label" dir="ltr">{defangDomain(l.domain)}</Link>}{file&&<span className="text-xs text-muted-foreground">{file.case_no}</span>}</li>;})}</ul>
      </section>;})}</div>}
    <Dialog open={!!msg} onOpenChange={o=>{if(!o)setMsg(null);}}><DialogContent dir="rtl"><DialogHeader><DialogTitle>رسالة توعية</DialogTitle></DialogHeader><p className="text-sm leading-7 whitespace-pre-wrap">{msg}</p><Button onClick={()=>{void navigator.clipboard.writeText(msg ?? '');toast.success('تم النسخ');}}><Copy/>نسخ</Button></DialogContent></Dialog>
  </div>;
}

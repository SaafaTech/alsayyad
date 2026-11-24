import { tr, tf } from '@/lib/i18n';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Network,RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { meta, ProgressCard, removedSignal } from '@/components/sayyad/common';
import { useEngine } from '@/components/sayyad/engine-context';
import { listCampaigns,rebuildCampaigns } from '@/lib/sayyad/campaigns.functions';
import { listEvidence } from '@/lib/sayyad/evidence.functions';
import { awarenessMessage } from '@/lib/sayyad/campaigns';
import { uaeTime } from '@/lib/sayyad/evidence';
export const Route=createFileRoute('/_authenticated/campaigns')({head:()=>meta(tr("الحملات"),tr("تجميع الروابط الخطرة المترابطة في حملات انتحال مع أسباب الربط ورسائل التوعية.")),component:Campaigns});
import { CampaignCard,AwarenessDialog,type CampaignNode,type CampaignSig } from '@/components/sayyad/campaign-view';
function Campaigns(){
  const engine=useEngine(),qc=useQueryClient(),list=useServerFn(listCampaigns),rebuild=useServerFn(rebuildCampaigns),ev=useServerFn(listEvidence);
  const q=useQuery({queryKey:['campaigns'],queryFn:()=>list(),refetchInterval:15000}),evidence=useQuery({queryKey:['evidence'],queryFn:()=>ev()});
  const [busy,setBusy]=useState(false),[msg,setMsg]=useState<string|null>(null);
  async function regroup(){setBusy(true);try{const r=await rebuild();toast.success(tf("تم التجميع: {0} حملة",r.count));await qc.invalidateQueries({queryKey:['campaigns']});}catch(e){toast.error(e instanceof Error?e.message:tr("تعذر التجميع"));}finally{setBusy(false);}}
  const links=new Map((engine.data?.links ?? []).map(l=>[l.id,l])),analyses=new Map((engine.data?.analyses ?? []).map(a=>[a.link_id,a]));
  return <div><div className="page-heading"><div><div className="eyebrow"><Network size={14}/> {tr("ربط الأدلة")}</div><h1>{tr("الحملات")}</h1><p>{tr("روابط خطرة مترابطة بقواعد ثابتة (سلسلة، هاتف، استضافة، قالب، نمط اسم) — بدون ذكاء اصطناعي.")}</p></div><Button variant="outline" disabled={busy} onClick={()=>void regroup()}><RefreshCw/>{tr("إعادة التجميع")}</Button></div>{busy&&<div className="mb-6"><ProgressCard job={{stage:tr("يعيد تجميع الحملات من الروابط الخطرة…")}} running/></div>}
    {q.isPending?<div className="empty-state">{tr("جارٍ تحميل الحملات…")}</div>:!q.data?.campaigns.length?<div className="empty-state">{tr("لا توجد حملات بعد — تحتاج رابطين خطرين مترابطين على الأقل")}</div>:
    q.data.campaigns.map(c=>{
      const sig=c.signals as CampaignSig;const members=q.data.links.filter(m=>m.campaign_id===c.id).map(m=>links.get(m.link_id)).filter(l=>!!l);
      const entity=engine.data?.entities.find(e=>e.id===c.entity_id);
      const nodes:CampaignNode[]=members.map(l=>{const a=analyses.get(l.id),m=sig.members?.[l.id],removed=!!m?.removed||l.status==='removed'||removedSignal(a?.signals);return {id:l.id,domain:l.domain,removed,score:a?.score ?? m?.score ?? null,oldScore:m?.old_score ?? null,caseNo:evidence.data?.find(e=>e.link_id===l.id)?.case_no ?? null};});
      const files=(evidence.data ?? []).filter(e=>members.some(l=>l.id===e.link_id));
      return <CampaignCard key={c.id} title={tr(c.name_ar)} subline={<p className="text-xs text-muted-foreground mb-3">{tr("أول رصد:")} {uaeTime(c.first_seen_at)} {tr("— آخر رصد:")} {uaeTime(c.last_seen_at)}</p>} entity={entity} nodes={nodes} sig={sig} linkCount={c.link_count} files={files} onAwareness={()=>setMsg(awarenessMessage(entity,members.map(l=>l.domain)))}/>;})}
    <AwarenessDialog msg={msg} onClose={()=>setMsg(null)}/>
  </div>;
}

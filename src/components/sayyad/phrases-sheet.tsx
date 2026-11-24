import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tr } from '@/lib/i18n';
import type { Tables } from '@/integrations/supabase/types';
import { addPhrase, setPhraseActive } from '@/lib/sayyad/phrases.functions';
import { newPhraseSchema } from '@/lib/sayyad/phrases';
type P=Tables<'search_phrases'>;type E=Tables<'entities'>;
export function PhrasesSheet({open,onOpenChange,phrases,entities,draft,setDraft}:{open:boolean;onOpenChange:(o:boolean)=>void;phrases:P[];entities:E[];draft:string;setDraft:(s:string)=>void}){
  const add=useServerFn(addPhrase),toggle=useServerFn(setPhraseActive),qc=useQueryClient();
  const[entity,setEntity]=useState('none'),[q,setQ]=useState(''),[busy,setBusy]=useState(false);
  const refresh=()=>qc.invalidateQueries({queryKey:['workspace']});
  async function submit(){const v=newPhraseSchema.safeParse({phrase:draft,entity_id:entity==='none'?null:entity});if(!v.success){toast.error(tr(v.error.issues[0]?.message ?? 'العبارة غير صالحة'));return;}
    setBusy(true);try{await add({data:v.data});toast.success(tr("أُضيفت العبارة — ستدخل في الصيد الشامل القادم"));setDraft('');await refresh();}catch(e){toast.error(tr(e instanceof Error?e.message:'تعذر إضافة العبارة'));}finally{setBusy(false);}}
  async function flip(p:P,active:boolean){try{await toggle({data:{id:p.id,active}});await refresh();}catch(e){toast.error(tr(e instanceof Error?e.message:'تعذر تحديث العبارة'));}}
  const groups=useMemo(()=>{const f=phrases.filter(p=>!q.trim()||p.phrase.toLowerCase().includes(q.trim().toLowerCase()));const gs=entities.map(e=>({key:e.id,title:tr(e.name_ar),items:f.filter(p=>p.entity_id===e.id)})).filter(g=>g.items.length);const gen=f.filter(p=>!p.entity_id||!entities.some(e=>e.id===p.entity_id));if(gen.length)gs.push({key:'general',title:tr("عام (بدون جهة)"),items:gen});return gs;},[phrases,entities,q]);
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="left" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md" dir="rtl">
    <SheetHeader className="text-start"><SheetTitle>{tr("عبارات الصيد")}</SheetTitle><SheetDescription>{tr("العبارات النشطة تدخل في الصيد الشامل.")}</SheetDescription></SheetHeader>
    <form className="phrase-form" onSubmit={e=>{e.preventDefault();void submit();}}>
      <Input aria-label={tr("عبارة جديدة")} placeholder={tr("اكتب عبارة كما يكتبها الضحية في قوقل، مثال: تجديد ملكية سيارة أونلاين")} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={120}/>
      <div className="flex gap-2"><Select value={entity} onValueChange={setEntity}><SelectTrigger aria-label={tr("الجهة")} className="flex-1"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{tr("عام (بدون جهة)")}</SelectItem>{entities.map(e=><SelectItem key={e.id} value={e.id}>{tr(e.name_ar)}</SelectItem>)}</SelectContent></Select><Button type="submit" className="gold-btn" disabled={busy||!draft.trim()}>{tr("إضافة")}</Button></div>
    </form>
    <div className="relative"><Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground"/><Input className="ps-8" aria-label={tr("بحث في العبارات")} placeholder={tr("بحث في العبارات")} value={q} onChange={e=>setQ(e.target.value)}/></div>
    <div className="flex-1 space-y-4">{groups.length?groups.map(g=><div key={g.key}><h4 className="mb-2 text-xs font-semibold text-muted-foreground">{g.title} ({g.items.length})</h4><ul className="phrase-list">{g.items.map(p=><li key={p.id} className={p.active?'':'is-off'}><span className="flex-1">{p.phrase}{p.created_by&&<span className="ad-tag ms-2">{tr("أضيفت يدوياً")}</span>}</span><Switch checked={p.active} onCheckedChange={v=>void flip(p,v)} aria-label={p.phrase}/></li>)}</ul></div>):<p className="text-sm text-muted-foreground">{tr("لا توجد عبارات مطابقة")}</p>}</div>
    <p className="border-t pt-3 text-xs text-muted-foreground">{tr("لا يمكن حذف العبارات؛ أوقفها بدل الحذف للحفاظ على السجل.")}</p>
  </SheetContent></Sheet>;
}

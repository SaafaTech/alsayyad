import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { wrongReasons } from '@/lib/sayyad/reviews';
export function useReviews(){return useQuery({queryKey:['reviews'],queryFn:async()=>{const r=await supabase.from('investigator_reviews').select('*').order('created_at',{ascending:false});if(r.error)throw r.error;return r.data;},refetchInterval:20000});}
/** Investigator feedback on the automatic verdict; stores the level/score seen at review time. */
export function ReviewCard({linkId,level,score}:{linkId:string;level:string|null;score:number|null}){
  const q=useReviews(),qc=useQueryClient(),me0=useQuery({queryKey:['me'],queryFn:async()=>(await supabase.auth.getUser()).data.user?.id ?? null,staleTime:Infinity});
  const all=(q.data ?? []).filter(r=>r.link_id===linkId);
  const me=all.find(r=>r.reviewer===me0.data);
  const [wrong,setWrong]=useState(false),[reason,setReason]=useState<string|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
  async function save(verdict:'correct'|'wrong'){setBusy(true);try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;
    const r=await supabase.from('investigator_reviews').upsert({link_id:linkId,reviewer:u.user.id,verdict,wrong_reason:verdict==='wrong'?reason ?? 'other':null,note:verdict==='wrong'&&note.trim()?note.trim():null,analysis_level:level,analysis_score:score},{onConflict:'link_id,reviewer'});
    if(r.error)throw r.error;toast.success('تم حفظ المراجعة');setWrong(false);await qc.invalidateQueries({queryKey:['reviews']});}catch(e){toast.error(e instanceof Error?e.message:'تعذر حفظ المراجعة');}finally{setBusy(false);}}
  const correct=all.filter(r=>r.verdict==='correct').length;
  return <section className="analysis-section mt-6"><h2>مراجعة المحقق</h2>
    <p className="text-sm text-muted-foreground mb-3">الحكم صحيح؟ {all.length?`${all.length} مراجعة (${correct} صحيح، ${all.length-correct} خطأ)`:'لا توجد مراجعات بعد'}{me&&<> • اختيارك: <b>{me.verdict==='correct'?'✅ صحيح':`❌ خطأ — ${wrongReasons.find(w=>w[0]===me.wrong_reason)?.[1] ?? ''}`}</b></>}</p>
    <div className="flex flex-wrap gap-2"><Button variant={me?.verdict==='correct'?'default':'outline'} disabled={busy} onClick={()=>void save('correct')}>✅ الحكم صحيح</Button><Button variant={me?.verdict==='wrong'||wrong?'destructive':'outline'} disabled={busy} onClick={()=>{setWrong(true);setReason(me?.wrong_reason ?? null);setNote(me?.note ?? '');}}>❌ الحكم خطأ</Button></div>
    {wrong&&<div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{wrongReasons.map(([k,l])=><button key={k} type="button" className={`review-chip ${reason===k?'on':''}`} onClick={()=>setReason(k)}>{l}</button>)}</div>
      <Textarea placeholder="ملاحظة (اختياري) — بدون بيانات شخصية" value={note} maxLength={500} onChange={e=>setNote(e.target.value)}/><Button disabled={busy||!reason} onClick={()=>void save('wrong')}>حفظ</Button></div>}
  </section>;}

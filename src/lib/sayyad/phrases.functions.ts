import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { requireInvestigator } from './role.server';
import { newPhraseSchema } from './phrases';
export const addPhrase=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(newPhraseSchema).handler(async({data,context})=>{
  const db=context.supabase;await requireInvestigator(db,context.userId);
  if(data.entity_id){const e=await db.from('entities').select('id').eq('id',data.entity_id).maybeSingle();if(e.error||!e.data)throw new Error('الجهة غير موجودة');}
  const r=await db.from('search_phrases').insert({phrase:data.phrase,entity_id:data.entity_id ?? null,created_by:context.userId,active:true}).select('id').single();
  if(r.error){if(r.error.code==='23505')throw new Error('العبارة موجودة مسبقاً');throw new Error('تعذر إضافة العبارة');}
  return {id:r.data.id};
});
export const setPhraseActive=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({id:z.string().uuid(),active:z.boolean()})).handler(async({data,context})=>{
  const db=context.supabase;await requireInvestigator(db,context.userId);
  const r=await db.from('search_phrases').update({active:data.active}).eq('id',data.id).select('id').single();
  if(r.error)throw new Error('تعذر تحديث العبارة');return {ok:true};
});

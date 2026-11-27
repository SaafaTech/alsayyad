import { createEvidenceCore } from './evidence.server';
import { requireInvestigator } from './role.server';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Database, Json } from '@/integrations/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { linkIdSchema } from './rules';
import { must, requireData, cfBase, cfGetHeaders, providerFetch } from './engine.server';
import { asksFromReasons, canCreateEvidence, isUrgent, noScreenshotNote, urgentReason, type ChainNode, type EvidenceSnapshot } from './evidence';
const idSchema=z.object({evidence_id:z.string().uuid()});
async function sha256(bytes:Uint8Array){const d=await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export const listEvidence=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>
  requireData(await context.supabase.from('evidence').select('id,case_no,link_id,created_at,urgent,review_status,case_status,snapshot,screenshot_path,screenshot_sha256,captured_at').order('created_at',{ascending:false})));
export const getEvidence=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).inputValidator(idSchema).handler(async({data,context})=>{
  const db=context.supabase;
  const ev=requireData(await db.from('evidence').select('*').eq('id',data.evidence_id).single());
  const log=requireData(await db.from('custody_log').select('*').eq('evidence_id',ev.id).order('at'));
  return {evidence:ev,custody:log.map(l=>({...l,by_system:l.actor===null}))};
});
// Creation runs with service privileges only after the caller's own session proves the link qualifies.
export const createEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(linkIdSchema).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);return createEvidenceCore(context.supabase,context.userId,data.link_id);});
const logAction=async(db:SupabaseClient<Database>,evidence_id:string,action:'viewed'|'exported_pdf'|'downloaded_original'|'reviewed'|'status_changed'|'notes_updated',detail:string|null,userId:string)=>must(await db.from('custody_log').insert({evidence_id,action,actor:userId,detail}));
export const logEvidenceAction=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),action:z.enum(['viewed','exported_pdf'])})).handler(async({data,context})=>{await logAction(context.supabase,data.evidence_id,data.action,null,context.userId);return true;});
export const screenshotUrl=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),download:z.boolean()})).handler(async({data,context})=>{await requireInvestigator(context.supabase,context.userId);
  const ev=requireData(await context.supabase.from('evidence').select('id,case_no,screenshot_path').eq('id',data.evidence_id).single());
  if(!ev.screenshot_path)return null;
  const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
  const r=await supabaseAdmin.storage.from('evidence').createSignedUrl(ev.screenshot_path,300,data.download?{download:`${ev.case_no}.${ev.screenshot_path.endsWith('.jpg')?'jpg':'png'}`}:undefined);
  if(r.error)return null;
  if(data.download)await logAction(context.supabase,ev.id,'downloaded_original',null,context.userId);
  return r.data.signedUrl;
});
export const reviewEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),decision:z.enum(['confirmed_suspicious','dismissed'])})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({review_status:data.decision,reviewed_by:context.userId,reviewed_at:new Date().toISOString()}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'reviewed',data.decision==='confirmed_suspicious'?'مشبوه — يحتاج تحقق':'استبعاد (سليم)',context.userId);return true;
});
export const setCaseStatus=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),status:z.enum(['detected','referred','in_progress','closed'])})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({case_status:data.status}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'status_changed',data.status,context.userId);return true;
});
const notesSchema=z.object({victims:z.string().max(200),losses:z.string().max(500),accounts:z.string().max(1000),reporter:z.string().max(1000),notes:z.string().max(4000)});
export const saveNotes=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({evidence_id:z.string().uuid(),notes:notesSchema})).handler(async({data,context})=>{
  must(await context.supabase.from('evidence').update({investigator_notes:data.notes}).eq('id',data.evidence_id));
  await logAction(context.supabase,data.evidence_id,'notes_updated',null,context.userId);return true;
});

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getWorkspace,searchGoogle,searchMaps,scanLink,pollScan,addManualLink,ctWatch } from '@/lib/sayyad/engine.functions';
import { toast } from 'sonner';
import { ctKeywords } from '@/lib/sayyad/early';
type Workspace=Awaited<ReturnType<typeof getWorkspace>>;
export type Job={stage:string;done:number;total:number;active:number;finished:boolean};
/** Rough remaining seconds: Cloudflare allows one start per ~10 s and each scan takes ~30 s. */
export const etaSeconds=(remaining:number)=>remaining<=0?0:Math.round(remaining*10+30);
type Engine={data:Workspace|undefined;loading:boolean;error:string|null;running:boolean;progress:string;job:Job|null;recent:Set<string>;runIds:string[];autoResume:()=>void;runSearch:(phrase:string,source:'google'|'maps')=>Promise<void>;startHunt:()=>Promise<void>;runCtWatch:()=>Promise<void>;checkLink:(url:string)=>Promise<string|null>;stop:()=>void;resume:()=>Promise<void>};
type QueueLink={id:string;status:string;parent_link_id:string|null};
/** Ids in scope for a run: everything, or one link plus every link it queued (and their children). */
export function scopeIds(links:QueueLink[],onlyId?:string) {
  if(!onlyId)return null;
  const scope=new Set([onlyId]);let grew=true;
  while(grew){grew=false;for(const l of links)if(l.parent_link_id&&scope.has(l.parent_link_id)&&!scope.has(l.id)){scope.add(l.id);grew=true;}}
  return scope;
}
/** Next link for a worker; 'wait' while other workers may still queue linked pages. */
export function pickNext<T extends QueueLink>(links:T[],taken:Set<string>,onlyId?:string):T|'wait'|null {
  const scope=scopeIds(links,onlyId);
  const link=links.find(l=>(!scope||scope.has(l.id))&&!taken.has(l.id)&&['pending','scanning'].includes(l.status));
  return link ?? (taken.size>0?'wait':null);
}
const Context=createContext<Engine|null>(null);
export function useEngine(){const c=useContext(Context);if(!c)throw new Error('Missing investigation context');return c;}
export function EngineProvider({children}:{children:ReactNode}) {
  const fetch=useServerFn(getWorkspace),google=useServerFn(searchGoogle),maps=useServerFn(searchMaps),scan=useServerFn(scanLink),poll=useServerFn(pollScan),manual=useServerFn(addManualLink),ct=useServerFn(ctWatch);
  const query=useQuery({queryKey:['workspace'],queryFn:()=>fetch(),refetchInterval:5000});
  const [running,setRunning]=useState(false),[progress,setProgressText]=useState('جاهز للصيد'),[job,setJob]=useState<Job|null>(null),[recent,setRecent]=useState<Set<string>>(new Set()),[runIds,setRunIds]=useState<string[]>([]);
  const lastTargets=useRef<Set<string>>(new Set()),clearJob=useRef<ReturnType<typeof setTimeout>|null>(null);
  const setProgress=(stage:string,counts?:Partial<Job>)=>{setProgressText(stage);setJob(j=>({stage,done:counts?.done ?? 0,total:counts?.total ?? 0,active:counts?.active ?? 0,finished:counts?.finished ?? false,...(counts?.total===undefined&&j&&!j.finished?{done:j.done,total:j.total,active:j.active}:{})}));};
  const active=useRef(false),cancel=useRef(false);
  useEffect(()=>()=>{cancel.current=true;},[]);
  const wait=async(ms:number,finishCurrent=false)=>{const until=Date.now()+ms;while(Date.now()<until){if(cancel.current&&!finishCurrent)return false;await new Promise(r=>setTimeout(r,Math.min(200,until-Date.now())));}return true;};
  const refresh=async()=>{const r=await query.refetch();if(r.error)throw r.error;return r.data;};
  async function drain(onlyId?:string) {
    const taken=new Set<string>(),submitted=new Set<string>(),targets=new Set<string>(),completed=new Set<string>();
    const initial=await refresh();
    const track=(data:Workspace|undefined)=>{
      const scope=scopeIds(data?.links ?? [],onlyId);
      for(const link of data?.links ?? []) {
        if(scope&&!scope.has(link.id))continue;
        if(['pending','scanning'].includes(link.status))targets.add(link.id);
        if(targets.has(link.id)&&!['pending','scanning'].includes(link.status))completed.add(link.id);
      }
      lastTargets.current=targets;setRunIds(ids=>ids.length===targets.size?ids:[...targets]);
      scanProgress();
    };
    const scanProgress=()=>setProgress(targets.size?`يفحص ${completed.size+submitted.size} من ${targets.size} ويحلل بالذكاء الاصطناعي (كل فحص ~30 ثانية)`:'لا توجد روابط جديدة للفحص',{done:completed.size,total:targets.size,active:submitted.size});
    track(initial);
    const errors:unknown[]=[];
    async function worker() {
      while(!cancel.current) {
        const data=await refresh();track(data);
        // Reservation is synchronous after the refresh: no two workers can take one ID.
        // Workers stay alive while others run, so linked pages queued by a finishing scan start automatically.
        const link=pickNext(data?.links ?? [],taken,onlyId);
        if(link==='wait'){await wait(1500);continue;}
        if(!link)return;
        taken.add(link.id);
        let waiting=false;
        try {
          if(cancel.current)return;
          if(link.status==='pending') {
            const result=await scan({data:{link_id:link.id}});
            if(result.status==='waiting'){waiting=true;continue;}
            if(!result.started&&result.status!=='scanning'){track(await refresh());continue;}
          }
          submitted.add(link.id);track(data);
          // Stop blocks new submissions, but lets every already-submitted scan finish.
          const until=Date.now()+95000;
          while(Date.now()<until) {
            await wait(3000,true);
            const result=await poll({data:{link_id:link.id}});
            track(await refresh());
            if(result.status!=='scanning')break;
          }
        } catch(error) {
          errors.push(error);
          track(await refresh());
        } finally {
          submitted.delete(link.id);taken.delete(link.id);
          scanProgress();
          if(waiting)await wait(1500);
        }
      }
    }
    const workers=await Promise.allSettled(Array.from({length:5},()=>worker()));
    for(const result of workers)if(result.status==='rejected')errors.push(result.reason);
    if(errors.length)throw errors[0];
  }
  async function run(task:()=>Promise<void>) {if(active.current)return;active.current=true;cancel.current=false;lastTargets.current=new Set();setRunIds([]);if(clearJob.current)clearTimeout(clearJob.current);setRunning(true);setProgress('يبدأ…');
    try{await task();const data=await refresh();const ids=lastTargets.current;const as=(data?.analyses ?? []).filter(a=>ids.has(a.link_id));const red=as.filter(a=>a.level==='red').length,yellow=as.filter(a=>a.level==='yellow').length;
      setProgress(cancel.current?'تم إيقاف الصيد بأمان':`اكتمل: ${red} خطر، ${yellow} مشبوه`,{done:ids.size,total:ids.size,finished:true});setRecent(new Set(ids));setTimeout(()=>setRecent(new Set()),12000);}
    catch(e){const msg=e instanceof Error?e.message:'تعذر إكمال العملية';setProgress('توقفت العملية؛ تحقق من الإعدادات',{finished:true});toast.error(msg);}
    finally{active.current=false;setRunning(false);clearJob.current=setTimeout(()=>{setJob(null);setRunIds([]);},10000);await query.refetch();}}
  const hasQueue=(d:Workspace|undefined)=>!!d?.links.some(l=>l.status==='pending'||l.status==='scanning');
  const autoResume=()=>{if(!active.current&&hasQueue(query.data))void run(()=>drain());};
  // Pending links left from an earlier session start draining automatically once data loads.
  const autoStarted=useRef(false);
  useEffect(()=>{if(autoStarted.current||!query.data)return;autoStarted.current=true;autoResume();},[query.data]);
  const found=(before:Workspace|undefined,after:Workspace|undefined)=>Math.max(0,(after?.links.length ?? 0)-(before?.links.length ?? 0));
  const value:Engine={data:query.data,loading:query.isPending,error:query.error?'تعذر تحميل بيانات التحقيق':null,running,progress,job,recent,runIds,autoResume,
    runSearch:async(phrase,source)=>{if(!phrase.trim())return;await run(async()=>{setProgress(source==='google'?'يبحث في Google…':'يبحث في الخرائط…');const before=query.data;await (source==='google'?google:maps)({data:{phrase}});const after=await refresh();setProgress(`وجد ${found(before,after)} روابط جديدة`);await new Promise(r=>setTimeout(r,800));await drain();});},
    startHunt:async()=>{await run(async()=>{const data=await refresh();const phrases=(data?.phrases ?? []).filter(p=>p.active);for(const [i,p] of phrases.entries()){if(cancel.current)break;setProgress(`يبحث في Google… العبارة ${i+1} من ${phrases.length}: ${p.phrase}`,{done:i,total:phrases.length});await google({data:{phrase:p.phrase}});await refresh();if(cancel.current)break;setProgress(`يبحث في الخرائط… العبارة ${i+1} من ${phrases.length}: ${p.phrase}`,{done:i,total:phrases.length});await maps({data:{phrase:p.phrase}});await refresh();}if(!cancel.current)await drain();});},
    runCtWatch:async()=>{await run(async()=>{const data=await refresh();const kws=ctKeywords(data?.entities ?? []);let total=0;const failed:string[]=[];
      for(const [i,k] of kws.entries()){if(cancel.current)break;setProgress(`يبحث في سجلات الشهادات عن ${k}… (${i+1} من ${kws.length}) وجد ${total} نطاق جديد`,{done:i,total:kws.length});try{total+=(await ct({data:{keyword:k}})).found;}catch{failed.push(k);}}
      if(failed.length)toast.warning(`تعذر الوصول لسجلات الشهادات لـ: ${failed.join('، ')}`);
      setProgress(`وجد ${total} نطاق جديد في سجلات الشهادات`);await refresh();await new Promise(r=>setTimeout(r,800));if(!cancel.current)await drain();});},
    checkLink:async(url)=>{if(active.current)return null;try{const link=await manual({data:{url}});await refresh();return link.id;}catch(e){toast.error(e instanceof Error?e.message:'رابط غير صالح');return null;}},
    stop:()=>{cancel.current=true;setProgress('إيقاف… ننتظر اكتمال الفحص الحالي');},resume:async()=>run(()=>drain()),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

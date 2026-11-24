import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getWorkspace,searchGoogle,searchMaps,scanLink,pollScan,addManualLink } from '@/lib/sayyad/engine.functions';
import { toast } from 'sonner';
type Workspace=Awaited<ReturnType<typeof getWorkspace>>;
type Engine={data:Workspace|undefined;loading:boolean;error:string|null;running:boolean;progress:string;runSearch:(phrase:string,source:'google'|'maps')=>Promise<void>;startHunt:()=>Promise<void>;checkLink:(url:string)=>Promise<string|null>;stop:()=>void;resume:()=>Promise<void>};
const Context=createContext<Engine|null>(null);
export function useEngine(){const c=useContext(Context);if(!c)throw new Error('Missing investigation context');return c;}
export function EngineProvider({children}:{children:ReactNode}) {
  const fetch=useServerFn(getWorkspace),google=useServerFn(searchGoogle),maps=useServerFn(searchMaps),scan=useServerFn(scanLink),poll=useServerFn(pollScan),manual=useServerFn(addManualLink);
  const query=useQuery({queryKey:['workspace'],queryFn:()=>fetch(),refetchInterval:5000});
  const [running,setRunning]=useState(false),[progress,setProgress]=useState('جاهز للصيد');
  const active=useRef(false),cancel=useRef(false);
  useEffect(()=>()=>{cancel.current=true;},[]);
  const wait=async(ms:number,finishCurrent=false)=>{const until=Date.now()+ms;while(Date.now()<until){if(cancel.current&&!finishCurrent)return false;await new Promise(r=>setTimeout(r,Math.min(200,until-Date.now())));}return true;};
  const refresh=async()=>{const r=await query.refetch();if(r.error)throw r.error;return r.data;};
  async function drain(onlyId?:string) {
    const taken=new Set<string>(),submitted=new Set<string>(),targets=new Set<string>(),completed=new Set<string>();
    const initial=await refresh();
    const track=(data:Workspace|undefined)=>{
      for(const link of data?.links ?? []) {
        if(onlyId&&link.id!==onlyId)continue;
        if(['pending','scanning'].includes(link.status))targets.add(link.id);
        if(targets.has(link.id)&&!['pending','scanning'].includes(link.status))completed.add(link.id);
      }
      setProgress(`يجري فحص ${submitted.size} روابط — اكتمل ${completed.size} من ${targets.size}`);
    };
    track(initial);
    const errors:unknown[]=[];
    async function worker() {
      while(!cancel.current) {
        const data=await refresh();track(data);
        // Reservation is synchronous after the refresh: no two workers can take one ID.
        const link=data?.links.find(l=>(!onlyId||l.id===onlyId)&&!taken.has(l.id)&&['pending','scanning'].includes(l.status));
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
          setProgress(`يجري فحص ${submitted.size} روابط — اكتمل ${completed.size} من ${targets.size}`);
          if(waiting)await wait(1500);
        }
      }
    }
    const workers=await Promise.allSettled(Array.from({length:onlyId?1:5},()=>worker()));
    for(const result of workers)if(result.status==='rejected')errors.push(result.reason);
    if(errors.length)throw errors[0];
  }
  async function run(task:()=>Promise<void>) {if(active.current)return;active.current=true;cancel.current=false;setRunning(true);try{await task();setProgress(cancel.current?'تم إيقاف الصيد بأمان':'اكتمل الصيد');}catch(e){const msg=e instanceof Error?e.message:'تعذر إكمال العملية';setProgress('توقفت العملية؛ تحقق من الإعدادات');toast.error(msg);}finally{active.current=false;setRunning(false);await query.refetch();}}
  const value:Engine={data:query.data,loading:query.isPending,error:query.error?'تعذر تحميل بيانات التحقيق':null,running,progress,
    runSearch:async(phrase,source)=>{if(!phrase.trim())return;await run(async()=>{setProgress(`بحث ${source==='google'?'Google':'الخرائط'}: ${phrase}`);await (source==='google'?google:maps)({data:{phrase}});await refresh();await drain();});},
    startHunt:async()=>{await run(async()=>{const data=await refresh();const phrases=data?.phrases ?? [];for(const [i,p] of phrases.entries()){if(cancel.current)break;setProgress(`العبارة ${i+1} من ${phrases.length}: ${p.phrase} — Google`);await google({data:{phrase:p.phrase}});await refresh();if(cancel.current)break;setProgress(`العبارة ${i+1} من ${phrases.length}: ${p.phrase} — الخرائط`);await maps({data:{phrase:p.phrase}});await refresh();}if(!cancel.current)await drain();});},
    checkLink:async(url)=>{if(active.current)return null;try{const link=await manual({data:{url}});await refresh();return link.id;}catch(e){toast.error(e instanceof Error?e.message:'رابط غير صالح');return null;}},
    stop:()=>{cancel.current=true;setProgress('إيقاف… ننتظر اكتمال الفحص الحالي');},resume:async()=>run(()=>drain()),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

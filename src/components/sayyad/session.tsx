import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
const SessionContext=createContext<{email:string|null;ready:boolean}>({email:null,ready:false});
export const useSession=()=>useContext(SessionContext);
export function SessionProvider({children}:{children:ReactNode}) {
  const router=useRouter(),qc=useQueryClient();const [email,setEmail]=useState<string|null>(null),[ready,setReady]=useState(false);
  useEffect(()=>{let live=true;const {data}=supabase.auth.onAuthStateChange((event,session)=>{
    if(event==='INITIAL_SESSION')return;
    if(!['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))return;
    setEmail(session?.user.email ?? null);setReady(true);void router.invalidate();if(event!=='SIGNED_OUT')void qc.invalidateQueries();
  });void supabase.auth.getUser().then(({data})=>{if(live){setEmail(data.user?.email ?? null);setReady(true);}});return()=>{live=false;data.subscription.unsubscribe();};},[router,qc]);
  return <SessionContext.Provider value={{email,ready}}>{children}</SessionContext.Provider>;
}

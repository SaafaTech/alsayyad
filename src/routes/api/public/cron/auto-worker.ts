import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/cron/auto-worker')({server:{handlers:{POST:async({request})=>{
  const authFailure=await authenticateCronRequest(request);if(authFailure)return authFailure;
  try{const { startSweep, runWorker }=await import('@/lib/sayyad/auto.server');void startSweep;void runWorker;return Response.json(await runWorker());}
  catch(e){console.warn('auto-worker failed:',e instanceof Error?e.message:'unknown');return Response.json({error:'failed'},{status:500});}
}}}});

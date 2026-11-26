import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/cron/auto-ct')({server:{handlers:{POST:async({request})=>{
  const authFailure=await authenticateCronRequest(request);if(authFailure)return authFailure;
  try{const { startSweep, runWorker }=await import('@/lib/sayyad/auto.server');void startSweep;void runWorker;return Response.json(await startSweep('ct'));}
  catch(e){console.warn('auto-ct failed:',e instanceof Error?e.message:'unknown');return Response.json({error:'failed'},{status:500});}
}}}});

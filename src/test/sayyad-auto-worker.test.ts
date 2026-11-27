import { beforeEach, describe, expect, it, vi } from 'vitest';

const state=vi.hoisted(()=>({events:[] as string[],enabled:true,cursor:{i:0,run_id:'sweep'},saved:[] as {i:number;new_links:number;errors:string[]}[],total:0,errors:[] as string[],db:{} as unknown}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:state.db}));
vi.mock('@/lib/sayyad/engine.server',()=>({
  must:(result:{data:unknown;error:unknown})=>{if(result.error)throw result.error;return result.data;},
  requireData:(result:{data:unknown;error:unknown})=>{if(result.error)throw result.error;return result.data;},
  search:vi.fn(),
  ctWatch:async(_db:unknown,_owner:string,keyword:string)=>{state.events.push(`ct ${keyword}`);if(keyword==='second')throw new Error('provider unavailable');return {found:3};},
}));
vi.mock('@/lib/sayyad/scan.server',()=>({
  pollScanCore:async()=>{state.events.push('poll');return {status:'done'};},
  scanLinkCore:async()=>{state.events.push('start');return {started:true,status:'scanning'};},
}));
vi.mock('@/lib/sayyad/evidence.server',()=>({createEvidenceCore:async()=>{state.events.push('evidence');}}));
vi.mock('@/lib/sayyad/campaigns.server',()=>({maybeRebuildCampaigns:async()=>{state.events.push('campaigns');}}));

import { runWorker, startSweep } from '@/lib/sayyad/auto.server';

function database(){
  return {rpc:async()=>({data:0,error:null}),from:(table:string)=>{
    let operation='select';let patch:Record<string,unknown>={};const filters:Record<string,unknown>={};let single=false;
    const builder={
      select:(_columns:string)=>builder,
      eq:(key:string,value:unknown)=>{filters[key]=value;return builder;},
      neq:()=>builder,in:()=>builder,order:()=>builder,range:()=>builder,limit:()=>builder,
      single:()=>{single=true;return builder;},maybeSingle:()=>{single=true;return builder;},
      insert:(value:Record<string,unknown>)=>{operation='insert';patch=value;return builder;},
      update:(value:Record<string,unknown>)=>{operation='update';patch=value;return builder;},
      upsert:(value:Record<string,unknown>)=>{operation='upsert';patch=value;return builder;},
      delete:()=>{operation='delete';return builder;},
      then:(resolve:(value:{data:unknown;error:null})=>unknown)=>{
        let data:unknown=[];
        if(table==='auto_hunt_settings')data={enabled:state.enabled,daily_cap:100,owner_user_id:'test-owner'};
        if(table==='engine_cache'){
          if(operation==='select')data=single?{value:state.cursor}:[{key:'auto-ct-cursor',value:state.cursor}];
          else if(operation==='update'){state.cursor=patch['value'] as typeof state.cursor;state.events.push(`cursor ${state.cursor.i}`);}
        }
        if(table==='auto_runs'){
          if(operation==='insert'){state.events.push(`run ${String(patch['kind'])}`);data={id:'worker'};}
          if(operation==='select'&&single)data={new_links:state.total,errors:state.errors};
          if(operation==='update'&&filters['id']==='sweep'){
            state.total=Number(patch['new_links']);state.errors=patch['errors'] as string[];
            if(patch['status']==='running')state.saved.push({i:state.cursor.i,new_links:state.total,errors:[...state.errors]});
          }
        }
        if(table==='links'&&filters['status']==='scanning')data=[{id:'scanning',status:'scanning'}];
        if(table==='links'&&filters['status']==='pending')data=[{id:'pending',status:'pending'}];
        if(table==='analyses')data={level:'red'};
        if(table==='entities')data=[{brand_keywords:['first','second']}];
        return Promise.resolve({data,error:null}).then(resolve);
      },
    };
    return builder;
  }};
}
beforeEach(()=>{state.events=[];state.enabled=true;state.cursor={i:0,run_id:'sweep'};state.saved=[];state.total=0;state.errors=[];state.db=database();});
describe('automatic worker orchestration',()=>{
  it('starts a sweep without running any provider or scans',async()=>{
    await startSweep('ct');
    expect(state.events).toEqual(['run ct']);
  });
  it('polls and starts scans, files evidence, then checkpoints each CT item and totals',async()=>{
    await runWorker();
    expect(state.events).toEqual(['run worker','poll','start','evidence','campaigns','ct first','cursor 1','ct second','cursor 2']);
    expect(state.saved).toEqual([{i:1,new_links:3,errors:[]},{i:2,new_links:3,errors:['second: provider unavailable']}]);
  });
  it('does not scan or create a run while the setting is off',async()=>{
    state.enabled=false;
    expect(await runWorker()).toEqual({skipped:'disabled'});
    expect(state.events).toEqual([]);
  });
});
import { describe,it,expect } from 'vitest';
import { uniformReasons,ringEdges } from '@/components/sayyad/campaign-view';
describe('campaign map edges',()=>{
  it('uniform reasons collapse to a ring',()=>{
    const e=[{a:'1',b:'2',reasons_ar:['x','y']},{a:'1',b:'3',reasons_ar:['y','x']},{a:'2',b:'3',reasons_ar:['x','y']}];
    expect(uniformReasons(e)).toEqual(['x','y']);expect(ringEdges(['1','2','3','4'],['x']).length).toBe(4);
  });
  it('mixed reasons keep edges',()=>{expect(uniformReasons([{a:'1',b:'2',reasons_ar:['x']},{a:'1',b:'3',reasons_ar:['y']}])).toBeNull();});
});

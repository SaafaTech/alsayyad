import {describe,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {signedBootstrap,verifiedBootstrap} from '@/lib/sayyad/registry-cache.server';
vi.stubGlobal('crypto',webcrypto);
describe('Trusted RDAP cache',()=>{
 it('accepts only authentic registry bootstrap data',async()=>{const bootstrap={services:[[['org'],['https://rdap.publicinterestregistry.org/']]] as [string[],string[]][]};const value=await signedBootstrap(bootstrap,'test-signing-material');expect(await verifiedBootstrap(value,'test-signing-material')).toEqual(bootstrap);});
 it('rejects authenticated database edits that inject an arbitrary outbound origin',async()=>{const bootstrap={services:[[['org'],['https://rdap.publicinterestregistry.org/']]] as [string[],string[]][]};const value=await signedBootstrap(bootstrap,'test-signing-material');value.bootstrap.services=[ [['org'],['https://attacker.example/']] ];expect(await verifiedBootstrap(value,'test-signing-material')).toBeNull();});
});

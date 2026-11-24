import {z} from 'zod';
export const bootstrapSchema=z.object({services:z.array(z.tuple([z.array(z.string()),z.array(z.string())]))});
const envelopeSchema=z.object({bootstrap:bootstrapSchema,signature:z.string()});
async function key(secret:string){return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signedBootstrap(bootstrap:z.infer<typeof bootstrapSchema>,secret:string){const signature=await crypto.subtle.sign('HMAC',await key(secret),new TextEncoder().encode(JSON.stringify(bootstrap)));return {bootstrap,signature:Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('')};}
export async function verifiedBootstrap(value:unknown,secret:string){const parsed=envelopeSchema.safeParse(value);if(!parsed.success || !/^[a-f0-9]{64}$/.test(parsed.data.signature))return null;const bytes=Uint8Array.from(parsed.data.signature.match(/.{2}/g) ?? [],s=>parseInt(s,16));const verified=await crypto.subtle.verify('HMAC',await key(secret),bytes,new TextEncoder().encode(JSON.stringify(parsed.data.bootstrap)));return verified?parsed.data.bootstrap:null;}

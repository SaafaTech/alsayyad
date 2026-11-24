// Minimal bilingual layer (no dependency): Arabic is the source text and the default; English comes from a dictionary.
import { useSyncExternalStore } from 'react';
import { en, patterns } from './i18n-dict';
export type Lang='ar'|'en';
let lang:Lang='ar';let loaded=false;const listeners=new Set<()=>void>();
const entityNames=new Map<string,string>();
/** Registers Arabic → English entity names so reasons and labels can show name_en in English mode. */
export function registerEntities(es:{name_ar:string;name_en:string}[]){for(const e of es)entityNames.set(e.name_ar,e.name_en);}
function apply(){if(typeof document==='undefined')return;document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';}
/** Reads the saved choice once on the client (call from an effect). */
export function initLang(){if(loaded||typeof window==='undefined')return;loaded=true;try{if(localStorage.getItem('sayyad-lang')==='en')lang='en';}catch{/* storage unavailable */}apply();listeners.forEach(l=>l());}
export function setLang(l:Lang){lang=l;loaded=true;try{localStorage.setItem('sayyad-lang',l);}catch{/* storage unavailable */}apply();listeners.forEach(f=>f());}
export const getLang=()=>lang;
export function useLang(){return useSyncExternalStore(f=>{listeners.add(f);return ()=>{listeners.delete(f);};},()=>lang,()=>'ar' as Lang);}
/** Pure translation: exact dictionary, entity names, then reason/stage templates; unknown text stays Arabic. */
export function translate(ar:string,to:Lang,dict:Record<string,string>=en,names:Map<string,string>=entityNames):string{
  if(to==='ar'||!ar)return ar;
  const exact=dict[ar];if(exact!==undefined)return exact;
  const name=names.get(ar);if(name)return name;
  for(const [re,fn] of patterns){const m=ar.match(re);if(m)return fn(m,(x:string)=>translate(x,to,dict,names));}
  return ar;
}
export function tr(ar:string):string;
export function tr(ar:string|null|undefined):string|undefined;
export function tr(ar:string|null|undefined){return ar===null||ar===undefined?undefined:translate(ar,lang);}
/** Template with {0},{1}… placeholders; arguments that are Arabic entity names or known words are translated too. */
export function tf(template:string,...args:unknown[]){
  const t=tr(template);
  return t.replace(/\{(\d+)\}/g,(_,i:string)=>{const v=args[Number(i)];const s=v===null||v===undefined?'':String(v);return lang==='en'?tr(s):s;});
}

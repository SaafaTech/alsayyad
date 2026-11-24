import { tr, tf } from '@/lib/i18n';
import { useState } from 'react';
import { Copy, Download, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { takedownTexts, type TakedownInput, type Whois } from '@/lib/sayyad/early';
const day=(iso:string|null|undefined)=>iso?new Date(iso).toLocaleDateString('ar-AE',{timeZone:'Asia/Dubai'}):'—';
export const asWhois=(v:unknown):Whois|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Whois:null;
/** Registration details from RDAP; null for .ae or when the registry did not answer. */
export function WhoisCard({whois,className='analysis-section'}:{whois:Whois|null;className?:string}){
  return <section className={className}><h2>{tr("بيانات التسجيل (WHOIS)")}</h2>{!whois?<p className="text-sm text-muted-foreground">{tr("غير متاح من السجل")}</p>:
    <dl className="facts-list">{([[tr("المسجّل"),whois.registrar ?? '—'],[tr("تاريخ الإنشاء"),day(whois.created)],[tr("تاريخ الانتهاء"),day(whois.expires)],[tr("آخر تعديل"),day(whois.changed)],[tr("خوادم الأسماء"),whois.nameservers.join(tr("، "))||'—'],[tr("الحالة"),whois.status.join(tr("، "))||'—'],[tr("جهة الإبلاغ عن الإساءة"),[whois.abuse_email,whois.abuse_phone].filter(Boolean).join(' • ')||'—']] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd dir={k==='المسجّل'||k.startsWith('تاريخ')||k==='آخر تعديل'?undefined:'ltr'} className="break-all">{v||'—'}</dd></div>)}</dl>}</section>;
}
type Hosting={ip?:string|null;asn?:string|null;asnname?:string|null;country?:string|null;server?:string|null;tls_issuer?:string|null}|null;
export function HostingCard({hosting,className='analysis-section'}:{hosting:Hosting;className?:string}){
  return <section className={className}><h2>{tr("الاستضافة")}</h2>{!hosting?<p className="text-sm text-muted-foreground">{tr("غير متاح (لم يُفحص عبر Cloudflare)")}</p>:
    <dl className="facts-list">{([['IP',hosting.ip],['ASN',hosting.asn?`AS${hosting.asn}`:null],[tr("اسم ASN"),hosting.asnname],[tr("الدولة"),hosting.country],[tr("الخادم"),hosting.server],[tr("مُصدر الشهادة TLS"),hosting.tls_issuer]] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd dir="ltr" className="break-all">{v||'—'}</dd></div>)}</dl>}</section>;
}
/** "طلب إزالة": template texts only (no AI), Arabic and English, copy and .txt download. */
export function TakedownButton({input}:{input:TakedownInput}){
  const [open,setOpen]=useState(false);const t=takedownTexts(input);
  const copy=async(s:string)=>{try{await navigator.clipboard.writeText(s);toast.success(tr("نُسخ النص"));}catch{toast.error(tr("تعذر النسخ"));}};
  const download=()=>{const blob=new Blob([`${t.ar}\n\n-----\n\n${t.en}\n`],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`takedown-${input.case_no ?? 'sayyad'}.txt`;a.click();URL.revokeObjectURL(a.href);};
  return <><Button variant="outline" onClick={()=>setOpen(true)}><Send/>{tr("طلب إزالة")}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{tr("طلب إزالة")}</DialogTitle></DialogHeader>
      {([[tr("العربية"),t.ar,'rtl'],['English',t.en,'ltr']] as const).map(([l,txt,dir])=><div key={l} className="mb-4"><div className="flex items-center justify-between mb-1"><b className="text-sm">{l}</b><Button size="sm" variant="ghost" onClick={()=>void copy(txt)}><Copy/>{tr("نسخ")}</Button></div><pre dir={dir} className="whitespace-pre-wrap text-xs bg-muted p-3 rounded-md text-start">{txt}</pre></div>)}
      <Button onClick={download}><Download/>{tr("تحميل .txt")}</Button></DialogContent></Dialog></>;
}

import { useState } from 'react';
import { toast } from 'sonner';
import { Phone,Landmark,AtSign,Link2,Copy,UserX } from 'lucide-react';
import { tr,tf } from '@/lib/i18n';
import { defangUrl } from '@/lib/sayyad/campaigns';
import type { Indicators } from '@/lib/sayyad/indicators';
function CopyBtn({v}:{v:string}){return <button type="button" className="no-print ms-2 text-muted-foreground hover:text-primary" title={tr("نسخ")} aria-label={tr("نسخ")} onClick={()=>{void navigator.clipboard.writeText(v);toast.success(tr("تم النسخ"));}}><Copy size={13}/></button>;}
const None=()=><p className="text-sm text-muted-foreground">{tr("لم يُرصد")}</p>;
function Sec({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}){return <div className="mb-4"><h3 className="flex items-center gap-2 text-sm font-semibold mb-2">{icon}{title}</h3>{children}</div>;}
export function IndicatorsCard({indicators,className='analysis-section',action}:{indicators:Indicators|null;className?:string;action?:React.ReactNode}){
  const [all,setAll]=useState(false);
  return <section className={className}><h2 className="flex items-center gap-2"><UserX size={18} className="text-primary"/>{tr("بيانات المحتال")}</h2>
    {!indicators?<div className="empty-state"><p>{tr("أعد الفحص لاستخراج بيانات المحتال")}</p>{action}</div>:<>
    <Sec icon={<Phone size={15}/>} title={tr("أرقام الهاتف والواتساب")}>{indicators.phones.length?<ul className="space-y-1">{indicators.phones.map(p=><li key={p} className="flex items-center gap-2"><span dir="ltr" className="mono">{p}</span>{indicators.whatsapp.includes(p)&&<span className="platform-tag">WhatsApp</span>}<CopyBtn v={p}/></li>)}</ul>:<None/>}</Sec>
    <Sec icon={<Landmark size={15}/>} title={tr("الحسابات البنكية")}>{indicators.ibans.length||indicators.accounts.length?<><ul className="space-y-1">{indicators.ibans.map(i=><li key={i} className="flex items-center gap-2"><span dir="ltr" className="mono">{i}</span><span className="platform-tag">IBAN</span><CopyBtn v={i}/></li>)}{indicators.accounts.map(a=><li key={a.number} className="flex items-center gap-2"><span dir="ltr" className="mono">{a.number}</span>{a.bank&&<span className="text-xs text-muted-foreground">{a.bank}</span>}<CopyBtn v={a.number}/></li>)}</ul><p className="text-xs text-muted-foreground mt-1">{tr("مستخرج آلياً — يحتاج تحقق")}</p></>:<None/>}</Sec>
    <Sec icon={<AtSign size={15}/>} title={tr("حسابات التواصل الاجتماعي")}>{indicators.socials.length?<ul className="space-y-1">{indicators.socials.map(s=><li key={s.url} className="flex items-center gap-2"><span className="platform-tag">{s.platform}</span><span dir="ltr" className="mono break-all">{s.url}</span><CopyBtn v={s.url}/></li>)}</ul>:<None/>}</Sec>
    <Sec icon={<Link2 size={15}/>} title={tr("الروابط الخارجية")}>{indicators.links.length?<><ul className="space-y-1">{(all?indicators.links:indicators.links.slice(0,5)).map(l=><li key={l} className="flex items-center gap-2"><span dir="ltr" className="mono break-all text-xs">{defangUrl(l)}</span><CopyBtn v={defangUrl(l)}/></li>)}</ul>{indicators.links.length>5&&<button type="button" className="more-btn no-print" onClick={()=>setAll(x=>!x)}>{all?tr("عرض أقل"):tf("عرض المزيد ({0})",indicators.links.length-5)}</button>}</>:<None/>}</Sec></>}
  </section>;
}

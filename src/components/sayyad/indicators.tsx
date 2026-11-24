import { useState } from 'react';
import { toast } from 'sonner';
import { Phone,Landmark,AtSign,Link2,Copy,UserX,ChevronDown } from 'lucide-react';
import { tr,tf } from '@/lib/i18n';
import { defangUrl } from '@/lib/sayyad/campaigns';
import { groupLinks,safeDecode,type Indicators } from '@/lib/sayyad/indicators';
function CopyBtn({v}:{v:string}){return <button type="button" className="no-print ind-copy" title={tr("نسخ")} aria-label={tr("نسخ")} onClick={e=>{e.stopPropagation();void navigator.clipboard.writeText(v);toast.success(tr("تم النسخ"));}}><Copy size={13}/></button>;}
function Mini({icon,title,count,tint,wide,children}:{icon:React.ReactNode;title:string;count:number;tint:'red'|'amber';wide?:boolean;children:React.ReactNode}){
  return <div className={`ind-card ${count?`tint-${tint}`:'tint-empty'}${wide?' ind-wide':''}`}>
    <div className="ind-head"><span className="ind-icon">{icon}</span><h3>{title}</h3><span className="ind-count">{count}</span></div>
    {count?children:<p className="ind-none">{tr("لم يُرصد")}</p>}</div>;
}
const defHost=(h:string)=>h.replace(/\./g,'[.]');
const trunc=(s:string,n=40)=>s.length>n?s.slice(0,n)+'…':s;
function LinkRow({g}:{g:ReturnType<typeof groupLinks>[number]}){
  const [open,setOpen]=useState(false);const first=defangUrl(g.urls[0] ?? '');
  return <li className="ind-link"><div className="ind-link-row" role="button" tabIndex={0} aria-expanded={open} onClick={()=>setOpen(o=>!o)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(o=>!o);}}}>
    <Link2 size={14} className="ind-link-icon"/><span dir="ltr" className="ind-link-text"><b>{defHost(g.host)}</b><span>{trunc(safeDecode(g.path))}</span></span>
    {g.urls.length>1&&<span className="ind-count">×{g.urls.length}</span>}<CopyBtn v={first}/>
    <ChevronDown size={15} className={`no-print ind-chev${open?' open':''}`}/></div>
    {open&&<ul className="ind-urls no-print" dir="ltr">{g.urls.map(u=><li key={u}>{safeDecode(defangUrl(u))}</li>)}</ul>}</li>;
}
export function IndicatorsCard({indicators,className='analysis-section',action}:{indicators:Indicators|null;className?:string;action?:React.ReactNode}){
  const [all,setAll]=useState(false);
  const groups=indicators?groupLinks(indicators.links):[];
  const banks=indicators?indicators.ibans.length+indicators.accounts.length:0;
  return <section className={className}><h2 className="flex items-center gap-2"><UserX size={18} className="text-primary"/>{tr("بيانات المحتال")}</h2>
    <p className="ind-sub">{tr("مستخرج من الصفحة فقط — بدون أي تفاعل مع الموقع")}</p>
    {!indicators?<div className="empty-state"><p>{tr("أعد الفحص لاستخراج بيانات المحتال")}</p>{action}</div>:<div className="ind-grid">
    <Mini icon={<Phone size={15}/>} title={tr("أرقام الهاتف والواتساب")} count={indicators.phones.length} tint="red"><ul className="ind-vals">{indicators.phones.map(p=><li key={p}><span dir="ltr" className="mono">{p}</span>{indicators.whatsapp.includes(p)&&<span className="ind-chip wa">WhatsApp</span>}<CopyBtn v={p}/></li>)}</ul></Mini>
    <Mini icon={<Landmark size={15}/>} title={tr("الحسابات البنكية")} count={banks} tint="red"><ul className="ind-vals">{indicators.ibans.map(i=><li key={i}><span dir="ltr" className="mono">{i}</span><span className="ind-chip">IBAN</span><CopyBtn v={i}/></li>)}{indicators.accounts.map(a=><li key={a.number}><span dir="ltr" className="mono">{a.number}</span>{a.bank&&<span className="text-xs text-muted-foreground">{a.bank}</span>}<CopyBtn v={a.number}/></li>)}</ul><p className="text-xs text-muted-foreground mt-1">{tr("مستخرج آلياً — يحتاج تحقق")}</p></Mini>
    <Mini icon={<AtSign size={15}/>} title={tr("حسابات التواصل الاجتماعي")} count={indicators.socials.length} tint="red"><ul className="ind-vals">{indicators.socials.map(s=><li key={s.url}><span className="ind-chip">{s.platform}</span><span dir="ltr" className="mono ind-ellip">{s.url}</span><CopyBtn v={s.url}/></li>)}</ul></Mini>
    <Mini icon={<Link2 size={15}/>} title={tr("الروابط الخارجية")} count={groups.length} tint="amber" wide><ul className="ind-links">{(all?groups:groups.slice(0,5)).map(g=><LinkRow key={g.key} g={g}/>)}</ul>{groups.length>5&&<button type="button" className="more-btn no-print" onClick={()=>setAll(x=>!x)}>{all?tr("عرض أقل"):tf("عرض المزيد ({0})",groups.length-5)}</button>}</Mini>
    </div>}
  </section>;
}

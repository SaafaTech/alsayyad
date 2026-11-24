import { ShieldCheck, ShieldAlert, AlertTriangle, Radar, Eye, FileText, LayoutDashboard, LogOut, ChevronLeft, LockKeyhole } from 'lucide-react';
import { Link, useNavigate, useLocation, Outlet } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from './session';
import { EngineProvider } from './engine-context';
export const meta=(title:string,description:string)=>({meta:[{title:`${title} | الصيّاد Sayyad`},{name:'description',content:description},{property:'og:title',content:`${title} | الصيّاد Sayyad`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]});
export function Brand(){return <div className="flex items-center gap-3 text-primary"><div className="brand-eye"><Eye size={25}/></div><span className="text-xl font-semibold whitespace-nowrap">الصيّاد <span className="text-primary/50">|</span> <span dir="ltr">Sayyad</span></span></div>;}
export function RiskBadge({score,level,status}:{score?:number;level?:string;status?:string}) {
  if(score===undefined&&(status==='unscannable'||status==='error'))return <span className="risk unknown"><AlertTriangle size={14}/>{status==='unscannable'?'غير قابل للفحص':'تعذر التحليل'} —</span>;
  if(score===undefined)return <span className="risk pending"><Radar size={14}/>{status==='scanning'?'جارٍ الفحص':'بانتظار الفحص'} —</span>;
  const Icon=level==='red'?ShieldAlert:level==='yellow'?AlertTriangle:ShieldCheck;
  return <span className={`risk ${level ?? 'green'}`}><Icon size={14}/><b>{score}</b><span>{level==='red'?'خطر':level==='yellow'?'مشبوه':'آمن'}</span></span>;
}
export function RadarVisual({running=false}:{running?:boolean}) {return <div className={`radar-visual ${running?'is-scanning':''}`} aria-hidden="true"><div className="radar-ring r1"/><div className="radar-ring r2"/><div className="radar-ring r3"/><div className="radar-cross h"/><div className="radar-cross v"/><div className="radar-sweep"/><Eye size={24} className="radar-eye"/></div>;}
export function AppShell(){const {email}=useSession(),qc=useQueryClient(),navigate=useNavigate(),location=useLocation();
  const items=[{to:'/hunt' as const,label:'الصيّاد',icon:Radar},{to:'/analysis' as const,label:'التحليل',icon:Eye},{to:'/evidence' as const,label:'ملف الأدلة',icon:FileText},{to:'/dashboard' as const,label:'لوحة التحكم',icon:LayoutDashboard}];
  async function logout(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',replace:true});}
  return <EngineProvider><div className="app-layout"><aside className="sidebar"><Link to="/"><Brand/></Link><div className="nav-caption">غرفة عمليات الرصد</div><nav className="space-y-2">{items.map(item=><Button key={item.to} asChild variant="ghost" className={`nav-item ${location.pathname===item.to?'active':''}`}><Link to={item.to}><item.icon size={20}/><span>{item.label}</span>{location.pathname===item.to&&<ChevronLeft className="ms-auto"/>}</Link></Button>)}</nav><div className="sidebar-bottom"><ShieldCheck size={19}/><span>رصد آمن • فحص غير مباشر</span><div className="text-xs text-muted-foreground mt-2">Cybercrime Shield</div></div></aside><div className="workspace"><header className="topbar"><div className="mobile-brand"><Brand/></div><div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground"><span className="status-dot"/>بيئة التحقيق <span className="text-border mx-2">/</span> الإمارات العربية المتحدة</div><div className="flex items-center gap-3 min-w-0"><span className="account-email text-muted-foreground" dir="ltr">{email}</span><Button variant="ghost" size="icon" aria-label="تسجيل الخروج" title="تسجيل الخروج" onClick={()=>void logout()}><LogOut/></Button></div></header><main className="main-content"><Outlet/></main><footer className="app-footer"><span><LockKeyhole size={12}/> بيانات التحقيق محمية</span><span>الصيّاد — Cybercrime Shield</span></footer></div></div></EngineProvider>;
}
export function ComingSoon({title}:{title:string}) {return <div className="coming-soon"><FileText size={44} className="text-primary"/><h1>{title}</h1><span className="text-muted-foreground">قريباً</span></div>;}

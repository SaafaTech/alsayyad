import { tr, tf, initLang, setLang, useLang, registerEntities } from '@/lib/i18n';
import { useEngine } from './engine-context';
import { ShieldCheck, ShieldAlert, AlertTriangle, Radar, Eye, FileText, LayoutDashboard, LogOut, Network, FlaskConical, ChevronLeft, LockKeyhole, Sun, Moon, Loader2, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, Outlet } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useSession } from './session';
import { Wordmark } from './brand';
import { EngineProvider, etaSeconds, type Job } from './engine-context';
export const meta=(title:string,description:string)=>({meta:[{title:tf("{0} | الصيّاد Sayyad",title)},{name:'description',content:description},{property:'og:title',content:tf("{0} | الصيّاد Sayyad",title)},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]});
export function Brand(){return <div className="flex items-center gap-2 whitespace-nowrap"><Wordmark size="sm"/><span className="text-sm text-primary/70" dir="ltr">| Sayyad</span></div>;}
export const removedSignal=(signals:unknown)=>!!signals&&typeof signals==='object'&&(signals as Record<string,unknown>)['removed']===true;
/** A yellow verdict the engine could not fully verify (or a yellow with no evidence points) is "needs review", never a score. */
export const needsReview=(a:{level?:string|undefined;score?:number|undefined;signals?:unknown}|undefined)=>!!a&&!removedSignal(a.signals)&&a.level==='yellow'&&(!!a.signals&&typeof a.signals==='object'&&(a.signals as Record<string,unknown>)['unverified']===true||a.score===0);
export function RiskBadge({score,level,status,removed,signals}:{score?:number;level?:string;status?:string;removed?:boolean;signals?:unknown}) {
  if(removed||status==='removed')return <span className="risk unknown"><AlertTriangle size={14}/>{tr("محذوفة")}</span>;
  if(needsReview({score,level,signals}))return <span className="risk yellow"><AlertTriangle size={14}/><span>{tr("تحتاج مراجعة")}</span></span>;
  if(score===undefined&&(status==='unscannable'||status==='error'))return <span className="risk unknown"><AlertTriangle size={14}/>{status==='unscannable'?tr("غير قابل للفحص"):tr("تعذر التحليل")} —</span>;
  if(score===undefined)return <span className="risk pending"><Radar size={14}/>{status==='scanning'?tr("جارٍ الفحص"):tr("بانتظار الفحص")} —</span>;
  const Icon=level==='red'?ShieldAlert:level==='yellow'?AlertTriangle:ShieldCheck;
  return <span className={`risk ${level ?? 'green'}`}><Icon size={14}/><b>{score}</b><span>{level==='red'?tr("خطر"):level==='yellow'?tr("مشبوه"):tr("آمن")}</span></span>;
}
export function RadarVisual({running=false}:{running?:boolean}) {return <div className={`radar-visual ${running?'is-scanning':''}`} aria-hidden="true"><div className="radar-ring r1"/><div className="radar-ring r2"/><div className="radar-ring r3"/><div className="radar-cross h"/><div className="radar-cross v"/><div className="radar-sweep"/><Eye size={24} className="radar-eye"/></div>;}
export function AppShell(){const lang=useLang();useEffect(()=>{initLang();},[]);const {email}=useSession(),qc=useQueryClient(),navigate=useNavigate(),location=useLocation();
  const items=[{to:'/hunt' as const,label:tr("الصيّاد"),icon:Radar},{to:'/analysis' as const,label:tr("التحليل"),icon:Eye},{to:'/evidence' as const,label:tr("ملف الأدلة"),icon:FileText},{to:'/campaigns' as const,label:tr("الحملات"),icon:Network},{to:'/dashboard' as const,label:tr("لوحة التحكم"),icon:LayoutDashboard}];
  const navLink=(item:{to:'/hunt'|'/analysis'|'/evidence'|'/campaigns'|'/dashboard'|'/expert';label:string;icon:typeof Radar})=><Button key={item.to} asChild variant="ghost" className={`nav-item ${location.pathname===item.to?'active':''}`}><Link to={item.to}><item.icon size={20}/><span>{item.label}</span>{location.pathname===item.to&&<ChevronLeft className="ms-auto"/>}</Link></Button>;
  async function logout(){await qc.cancelQueries();qc.clear();await supabase.auth.signOut();await navigate({to:'/auth',replace:true});}
  return <EngineProvider><EntityNames/><div className="app-layout" key={lang}><aside className="sidebar"><Link to="/"><Brand/></Link><div className="nav-caption">{tr("غرفة عمليات الرصد")}</div><nav className="space-y-2">{items.map(navLink)}<div className="border-t border-border my-3"/><div className="nav-caption !my-1">{tr("خاص")}</div>{navLink({to:'/expert',label:tr("قياس الدقة"),icon:FlaskConical})}</nav><div className="sidebar-bottom"><ShieldCheck size={19}/><span>{tr("رصد آمن • فحص غير مباشر")}</span><div className="text-xs text-muted-foreground mt-2">Cybercrime Shield</div></div></aside><div className="workspace"><header className="topbar"><div className="mobile-brand"><Brand/></div><div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground"><span className="status-dot"/>{tr("بيئة التحقيق")} <span className="text-border mx-2">/</span> {tr("الإمارات العربية المتحدة")}</div><div className="flex items-center gap-3 min-w-0"><span className="account-email text-muted-foreground" dir="ltr">{email}</span><LangToggle/><ThemeToggle/><Button variant="ghost" size="icon" aria-label={tr("تسجيل الخروج")} title={tr("تسجيل الخروج")} onClick={()=>void logout()}><LogOut/></Button></div></header><main className="main-content"><Outlet/></main><footer className="app-footer"><span><LockKeyhole size={12}/> {tr("بيانات التحقيق محمية")}</span><span>{tr("الصيّاد — Cybercrime Shield")}</span></footer></div></div></EngineProvider>;
}
export function ComingSoon({title}:{title:string}) {return <div className="coming-soon"><FileText size={44} className="text-primary"/><h1>{title}</h1><span className="text-muted-foreground">{tr("قريباً")}</span></div>;}

const readTheme=()=>{try{return localStorage.getItem('sayyad-theme')==='dark'?'dark':'light';}catch{return 'light';}};
export function applyTheme(theme:'light'|'dark'){document.documentElement.classList.toggle('light',theme==='light');document.documentElement.classList.toggle('dark',theme==='dark');}
export function ThemeToggle(){const [theme,setTheme]=useState<'light'|'dark'>('light');
  useEffect(()=>{const t=readTheme();setTheme(t);applyTheme(t);},[]);
  const toggle=()=>{const t=theme==='light'?'dark':'light';setTheme(t);applyTheme(t);try{localStorage.setItem('sayyad-theme',t);}catch{/* storage unavailable */}};
  return <Button variant="ghost" size="icon" aria-label={theme==='light'?tr("الوضع الداكن"):tr("الوضع الفاتح")} title={theme==='light'?tr("الوضع الداكن"):tr("الوضع الفاتح")} onClick={toggle}>{theme==='light'?<Moon/>:<Sun/>}</Button>;}
const fmtEta=(s:number)=>s<60?tf("{0} ثانية",s):tf("{0} دقيقة",Math.ceil(s/60));
/** Shared live progress card: spinner, Arabic stage, bar with counts and estimated remaining time. */
export function ProgressCard({job,running,onStop}:{job:Job|null|{stage:string;done?:number;total?:number;finished?:boolean};running:boolean;onStop?:()=>void}){
  if(!job)return null;const done=job.done ?? 0,total=job.total ?? 0,finished=!!job.finished&&!running;
  const pct=total?Math.round(done/total*100):null,remaining=Math.max(0,total-done);
  return <div className={`progress-card ${finished?'is-done':''}`} role="status" aria-live="polite"><div className="progress-head">{finished?<CheckCircle2 className="text-success" size={20}/>:<Loader2 className="animate-spin text-primary" size={20}/>}<strong>{tr(job.stage)}</strong>{total>0&&<span className="progress-count">{done} / {total}</span>}{!finished&&total>0&&remaining>0&&<span className="text-muted-foreground text-xs">{tr("متبقٍ تقريباً")} {fmtEta(etaSeconds(remaining))}</span>}{onStop&&running&&<Button size="sm" variant="destructive" className="ms-auto" onClick={onStop}>{tr("إيقاف")}</Button>}</div>
    <div className="progress-track"><div className={`progress-fill ${pct===null&&!finished?'indeterminate':''}`} style={{width:finished?'100%':pct===null?'35%':`${Math.max(4,pct)}%`}}/></div></div>;}

/** Registers entity names so English mode shows name_en inside labels and reasons. */
function EntityNames(){const e=useEngine().data?.entities;useEffect(()=>{if(e)registerEntities(e);},[e]);return null;}
/** "عربي | English" toggle; Arabic is the default, choice saved in localStorage. */
export function LangToggle(){const lang=useLang();
  return <div className="lang-toggle" role="group" aria-label="Language / اللغة"><button type="button" aria-pressed={lang==='ar'} className={lang==='ar'?'active':''} onClick={()=>setLang('ar')}>عربي</button><span aria-hidden="true">|</span><button type="button" aria-pressed={lang==='en'} className={lang==='en'?'active':''} onClick={()=>setLang('en')}>English</button></div>;}

import { useEffect, useState } from 'react';
/** Eye-in-radar emblem (inline SVG). */
export function Emblem({size=38}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="emblem"><circle cx="32" cy="32" r="29" fill="none" stroke="#D4A72C" strokeWidth="2.5"/><circle cx="32" cy="32" r="20" fill="none" stroke="#D4A72C" strokeOpacity=".45" strokeWidth="1.2"/><path d="M32 3v8M32 53v8M3 32h8M53 32h8" stroke="#D4A72C" strokeOpacity=".6" strokeWidth="1.5"/><path d="M14 32c5-8 11-12 18-12s13 4 18 12c-5 8-11 12-18 12s-13-4-18-12z" fill="none" stroke="#E7C35A" strokeWidth="2.5" strokeLinejoin="round"/><circle cx="32" cy="32" r="6" fill="#E7C35A"/><circle cx="34" cy="30" r="1.8" fill="#0F1A33"/></svg>;}
const sizes={sm:{e:34,t:24},md:{e:48,t:34},lg:{e:72,t:58}};
/** Brand wordmark: emblem + "الصيّاد" in Reem Kufi with a tapered gold underline. */
export function Wordmark({size='md',emblem=true,className=''}:{size?:'sm'|'md'|'lg';emblem?:boolean;className?:string}){const s=sizes[size];
  return <span className={`wordmark wm-${size} ${className}`}>{emblem&&<Emblem size={s.e}/>}<span className="wm-text-wrap"><span className="wm-text" style={{fontSize:s.t}}>الصيّاد</span><span className="wm-line" aria-hidden="true"/></span></span>;}
// CSS ease-in-out = cubic-bezier(.42,0,.58,1); return the time fraction at which progress p is reached.
const bez=(t:number,a:number,b:number)=>3*a*t*(1-t)**2+3*b*t*t*(1-t)+t**3;
export function easeInOutInverse(p:number){let lo=0,hi=1;for(let i=0;i<30;i++){const m=(lo+hi)/2;if(bez(m,0,1)<p)lo=m;else hi=m;}const t=(lo+hi)/2;let lo2=0,hi2=1;for(let i=0;i<30;i++){const m=(lo2+hi2)/2;if(bez(m,.42,.58)<t)lo2=m;else hi2=m;}return (lo2+hi2)/2;}
const SWEEP_START=.4,SWEEP_DUR=3.2,R=175;
const targets:[number,string][]=[[50,'موقع بنك مزيف'],[140,'حساب انستغرام وهمي'],[230,'رابط دفع احتيالي'],[310,'إعلان عمالة وهمي']];
const KEY='sayyad-splash-seen';
export function Splash(){const [mode,setMode]=useState<'pending'|'off'|'full'|'static'>('pending'),[leaving,setLeaving]=useState(false);
  useEffect(()=>{let seen=false;try{seen=sessionStorage.getItem(KEY)==='1';sessionStorage.setItem(KEY,'1');}catch{/* storage unavailable */}
    if(seen){setMode('off');return;}const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;setMode(reduced?'static':'full');
    const t1=setTimeout(()=>setLeaving(true),reduced?800:6000),t2=setTimeout(()=>setMode('off'),reduced?1200:6400);return ()=>{clearTimeout(t1);clearTimeout(t2);};},[]);
  if(mode==='off')return null;
  // Server render: plain cover so the page never flashes before the splash; hidden by the head script for returning sessions.
  if(mode==='pending')return <div className="splash splash-pending" aria-hidden="true"/>;
  const skip=()=>{setLeaving(true);setTimeout(()=>setMode('off'),400);};
  return <div className={`splash ${leaving?'is-leaving':''} ${mode==='static'?'is-static':''}`} role="presentation">
    <button type="button" className="splash-skip" aria-label="تخطي الشاشة الافتتاحية" onClick={skip}>تخطي</button>
    {mode==='full'&&<div className="splash-radar" aria-hidden="true">{[170,300,440].map((d,i)=><span key={d} className="splash-ring" style={{width:d,height:d,animationDelay:`${i*.1}s`}}/>)}<span className="splash-sweep"/>
      {targets.map(([deg,label])=>{const delay=SWEEP_START+SWEEP_DUR*easeInOutInverse(deg/360),x=Math.sin(deg*Math.PI/180)*R,y=-Math.cos(deg*Math.PI/180)*R;
        return <span key={deg} className="splash-target" style={{transform:`translate(${x}px,${y}px)`}}><span className="t-dot" style={{animationDelay:`${delay}s`}}/><span className="t-ring" style={{animationDelay:`${delay}s`}}/><span className={`t-pill ${x<0?'left':'right'}`} style={{animationDelay:`${delay+.25}s`}}>{label}</span></span>;})}
      <span className="splash-eye"><Emblem size={64}/></span></div>}
    <div className="splash-brand"><Wordmark size="lg" emblem={mode==='static'}/><p className="splash-tag">عينٌ على الاحتيال. حمايةٌ للمجتمع.</p></div>
    <footer className="splash-foot">هاكاثون درع الجريمة الإلكترونية</footer></div>;}
export const splashSeenScript=`try{if(sessionStorage.getItem('${KEY}')==='1')document.documentElement.classList.add('splash-seen')}catch(e){}`;

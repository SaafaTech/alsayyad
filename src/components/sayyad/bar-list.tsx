import { tr } from '@/lib/i18n';
export type BarDatum={name:string;value:number;key?:string};
/** Slim horizontal bar list: name, rounded bar, value always visible; top 6, rest as "أخرى". */
export function BarList({data,tone}:{data:BarDatum[];tone:'gold'|'amber'}){
  const sorted=[...data].filter(d=>d.value>0).sort((a,b)=>b.value-a.value);if(!sorted.length)return <p className="dash-none">{tr("لا توجد بيانات بعد")}</p>;
  const other=sorted.filter(d=>d.name==='other'||d.name==='أخرى'),main=sorted.filter(d=>!other.includes(d));
  let rows:BarDatum[]=main.slice(0,6);if(other.length||main.length>6){const keep=main.slice(0,5);rows=[...keep,{name:'أخرى',value:sorted.filter(d=>!keep.includes(d)).reduce((x,d)=>x+d.value,0)}];}
  const max=Math.max(...rows.map(r=>r.value));
  return <ul className={`bar-list ${tone}`}>{rows.map(r=><li key={r.name} title={`${tr(r.name)}: ${r.value}`}><span className="bl-name">{tr(r.name)}</span><span className="bl-track"><span className="bl-fill" style={{width:`${Math.max(4,r.value*100/max)}%`}}/></span><b>{r.value}</b></li>)}</ul>;
}

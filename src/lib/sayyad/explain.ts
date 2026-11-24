/** Maps each stored Arabic reason to the scoring signal that produced it (jsonb does not keep key order). */
const prefixes:[string,string][]=[['ينتحل هوية','impersonation'],['يحمل اسم','similarity'],['مرتبط بصفحة تنتحل','inherited_suspicion'],['يطلب','sensitive_request'],['النطاق عمره','new_domain'],['رقم الهاتف','phone_mismatch'],['مؤشرات احتيال محتملة','scam_pattern'],['امتداد نطاق','risky_tld'],['الموقع مستضاف على منصة مجانية','free_platform'],['اسم الجهة الرسمية مدسوس','similarity'],['النطاق يستخدم حروفاً','homoglyph'],['الرابط يستخدم عنوان IP','ip_host'],['الرابط يخفي النطاق','at_trick'],['بنية رابط مشبوهة','odd_structure'],['رابط مختصر يخفي','shortener'],['اسم ','similarity']];
export const pointKeys=prefixes.map(p=>p[1]);
export function reasonPoints(reason:string,signals:unknown):number|null{
  const s=(signals && typeof signals==='object'?signals:{}) as Record<string,unknown>;
  const key=prefixes.find(([p])=>reason.startsWith(p))?.[1];const v=key?s[key]:undefined;
  return typeof v==='number'&&v>0?v:null;
}
/** "35 + 30 = 65 → red" from the stored point signals only. */
export function scoreSum(reasons:string[],signals:unknown,score:number,level:string){
  const pts=reasons.map(r=>reasonPoints(r,signals)).filter((p):p is number=>p!==null);
  if(!pts.length)return `${score} → ${level}`;
  const sum=pts.reduce((a,b)=>a+b,0);
  return `${pts.join(' + ')} = ${sum}${sum!==score?` (≤100 → ${score})`:''} → ${level}`;
}

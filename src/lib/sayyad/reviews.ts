import type { Tables } from '@/integrations/supabase/types';
import { withoutExpert } from './campaigns';
export type Review=Pick<Tables<'investigator_reviews'>,'link_id'|'verdict'|'wrong_reason'|'reviewer'|'created_at'>;
export const wrongReasons=[['real_site','موقع حقيقي (إنذار كاذب)'],['missed_fraud','احتيال فات (خطر أكبر)'],['wrong_entity','الجهة غلط'],['other','أخرى']] as const;
/** Review accuracy over non-expert links: correct/(correct+wrong), plus latest false alarms and missed frauds. */
export function reviewStats(reviews:Review[],d:{hunts:Tables<'hunts'>[];links:Tables<'links'>[];analyses:Tables<'analyses'>[]}){
  const ids=new Set(withoutExpert(d).links.map(l=>l.id));
  const rs=reviews.filter(r=>ids.has(r.link_id)).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
  const correct=rs.filter(r=>r.verdict==='correct').length,wrong=rs.filter(r=>r.verdict==='wrong').length,total=correct+wrong;
  const uniq=(xs:Review[])=>[...new Set(xs.map(r=>r.link_id))].slice(0,10);
  return {correct,wrong,total,pct:total?Math.round(correct*100/total):null,
    falseAlarms:uniq(rs.filter(r=>r.verdict==='wrong'&&r.wrong_reason==='real_site')),
    missed:uniq(rs.filter(r=>r.verdict==='wrong'&&r.wrong_reason==='missed_fraud'))};
}

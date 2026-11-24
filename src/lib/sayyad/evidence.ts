// Client-safe evidence helpers: frozen snapshot shape, wording and pure classification rules.
export type ChainNode={url:string;domain:string;level:string|null;score:number|null;status:string};
export type EvidenceSnapshot={
  link:{url:string;final_url:string|null;domain:string;platform:string;rank:number|null;is_ad:boolean;title:string;snippet:string;maps_phone:string|null;status:string;scan_error:string|null;first_seen_at:string;scan_started_at:string|null};
  analysis:{score:number;level:string;reasons_ar:string[];ai_summary_ar:string;domain_age_days:number|null;age_source:string;phones_found:string[];outgoing_domains:string[];page_title:string;created_at:string;asks_payment:boolean;asks_sensitive:boolean};
  hosting:{ip:string|null;asn:string|null;asnname:string|null;country:string|null;server:string|null;tls_issuer:string|null;status:number|null}|null;
  entity:{name_ar:string;name_en:string;official_domains:string[];official_phones:string[]}|null;
  source:{phrase:string|null;source:string|null;rank:number|null;is_ad:boolean};
  chain:{parent:ChainNode|null;children:ChainNode[]};
  page_status:number|null;urgent_reason:string|null;screenshot_note:string|null;
};
export const noScreenshotNote='لا تتوفر لقطة من Cloudflare لهذا الرابط';
export const urgentReason='خطر مرتفع والصفحة كانت تستجيب وقت الفحص';
export const custodyActions:Record<string,string>={collected:'جمع الأدلة',viewed:'عرض الملف',exported_pdf:'تصدير PDF',downloaded_original:'تحميل اللقطة الأصلية',reviewed:'اعتماد المختص',status_changed:'تغيير حالة القضية',notes_updated:'تحديث معلومات المحقق'};
export const reviewLabels:Record<string,string>={pending:'بانتظار المراجعة',confirmed_suspicious:'مشبوه — يحتاج تحقق (معتمد)',dismissed:'مستبعد (سليم)'};
export const caseSteps=[['detected','رُصد'],['referred','أُحيل'],['in_progress','قيد الإجراء'],['closed','أُغلق']] as const;
export const caseLabels:Record<string,string>=Object.fromEntries(caseSteps);
export function isUrgent(level:string,pageStatus:number|null){return level==='red'&&pageStatus!==null&&pageStatus<400;}
export const canCreateEvidence=(level:string|null|undefined)=>level==='yellow'||level==='red';
export function asksFromReasons(reasons:string[],signals:Record<string,unknown>) {
  return {
    asks_payment:signals['asks_payment_or_card']===true||reasons.some(r=>r.includes('يطلب الدفع')),
    asks_sensitive:signals['asks_sensitive_data']===true||reasons.some(r=>r.includes('يطلب بيانات حساسة')),
  };
}
// Which attachment a reason relies on: 1 screenshot, 2 scan report, 3 domain data.
export function reasonAttachment(reason:string,hasScreenshot:boolean):1|2|3 {
  if(/عمر|يحمل اسم|نطاق غير رسمي: /.test(reason)&&!reason.includes('ينتحل'))return 3;
  if(/ينتحل|يطلب|رقم الهاتف/.test(reason))return hasScreenshot?1:2;
  return 2;
}
export const attachmentLabels={1:'مرفق 1: اللقطة',2:'مرفق 2: تقرير الفحص',3:'مرفق 3: بيانات النطاق'} as const;
export const uaeTime=(iso:string|null|undefined)=>iso?`${new Intl.DateTimeFormat('ar-AE',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso))} (GMT+4)`:'—';
export const ageSourceLabel=(s:string)=>s==='rdap'?'RDAP':s==='crtsh'?'crt.sh':'غير متاح';

import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon,meta } from '@/components/sayyad/common';
export const Route=createFileRoute('/_authenticated/evidence')({head:()=>meta('ملف الأدلة','ملفات أدلة التحقيق في منصة الصيّاد — قريباً.'),component:()=> <ComingSoon title="ملف الأدلة"/>});

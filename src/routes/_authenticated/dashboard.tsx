import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon,meta } from '@/components/sayyad/common';
export const Route=createFileRoute('/_authenticated/dashboard')({head:()=>meta('لوحة التحكم','لوحة تحكم الصيّاد — قريباً.'),component:()=> <ComingSoon title="لوحة التحكم"/>});

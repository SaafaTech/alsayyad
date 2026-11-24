import { createFileRoute,Navigate } from '@tanstack/react-router';
import { useSession } from '@/components/sayyad/session';
import { Brand,meta } from '@/components/sayyad/common';
export const Route=createFileRoute('/')({head:()=>meta('الصيّاد','منصة الرصد الاستباقي للروابط الاحتيالية وانتحال الجهات الإماراتية.'),component:Index});
function Index(){const {email,ready}=useSession();if(!ready)return <div className="min-h-screen flex items-center justify-center"><Brand/></div>;return <Navigate to={email?'/hunt':'/auth'} replace/>;}

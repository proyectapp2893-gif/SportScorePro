import { redirect } from 'next/navigation';
import { DEMO_SLUG } from '@/app/lib/demo/config';

export default function DemoAdminPage() {
  redirect(`/${DEMO_SLUG}/admin`);
}

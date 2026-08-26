import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DEMO_SLUG } from '@/app/lib/demo/config';

export const metadata: Metadata = {
  title: 'Demo privada | SportScore Pro',
  description: 'Experiencia interactiva privada de SportScore Pro.',
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivateDemoPage() {
  redirect(`/${DEMO_SLUG}/admin`);
}

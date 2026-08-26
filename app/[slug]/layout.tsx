import type { Metadata } from 'next';
import DemoNavigation from '@/app/lib/demo/DemoNavigation';
import { DEMO_SLUG } from '@/app/lib/demo/config';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug === DEMO_SLUG ? 'Demo privada | SportScore Pro' : 'CSJB Championship | by SportScore Pro',
    description: slug === DEMO_SLUG ? 'Experiencia funcional privada de SportScore Pro.' : 'Plataforma Oficial Multideporte del Colegio San José',
    manifest: '/manifest.json',
    robots: slug === DEMO_SLUG ? { index: false, follow: false, nocache: true } : undefined,
  };
}

export default function SlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <DemoNavigation />
      {children}
    </div>
  );
}

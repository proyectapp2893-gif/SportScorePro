import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CSJB Championship | by SportScore Pro',
  description: 'Plataforma Oficial Multideporte del Colegio San José',
  manifest: '/manifest.json', // Si hiciste el paso del manifiesto PWA
}

export default function SlugLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#020617] text-white">
      {children}
    </div>
  );
}
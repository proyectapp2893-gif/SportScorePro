import type { Metadata } from 'next';
import DemoExperience from './DemoExperience';

export const metadata: Metadata = {
  title: 'Demo privada | SportScore Pro',
  description: 'Experiencia interactiva privada de SportScore Pro.',
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivateDemoPage() {
  return <DemoExperience />;
}

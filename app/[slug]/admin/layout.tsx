import BunkerLogin from './BunkerLogin';
import { hasAdminSession } from '@/app/lib/auth';
import { DEMO_SLUG } from '@/app/lib/demo/config';
import AdminTournamentContext from './AdminTournamentContext';

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === DEMO_SLUG) return <><AdminTournamentContext />{children}</>;
  const isAuthenticated = await hasAdminSession(slug);

  if (!isAuthenticated) {
    return <BunkerLogin />;
  }

  return <><AdminTournamentContext />{children}</>;
}

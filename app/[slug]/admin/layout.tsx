import BunkerLogin from './BunkerLogin';
import { hasAdminSession } from '@/app/lib/auth';

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const isAuthenticated = await hasAdminSession(slug);

  if (!isAuthenticated) {
    return <BunkerLogin />;
  }

  return <>{children}</>;
}

import MasterLogin from './MasterLogin';
import { hasMasterSession } from '@/app/lib/auth';

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const isMasterAuthenticated = await hasMasterSession();

  if (!isMasterAuthenticated) {
    return <MasterLogin />;
  }

  return <>{children}</>;
}

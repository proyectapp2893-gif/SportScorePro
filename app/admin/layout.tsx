import { cookies } from 'next/headers';
import BunkerLogin from './BunkerLogin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // El servidor espera (await) y revisa si existe la galleta de seguridad en la petición
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get('csjb_bunker_key')?.value === 'acceso_concedido';

  // Si no está autenticado, no le envía NADA del sistema admin, solo la pantalla de bloqueo
  if (!isAuthenticated) {
    return <BunkerLogin />;
  }

  // Si tiene la llave, renderiza las páginas (Mesa, Fixture, etc.)
  return <>{children}</>;
}
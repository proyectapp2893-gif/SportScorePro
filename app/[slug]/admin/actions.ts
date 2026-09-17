'use server';

import { clearClientSession, hasAdminSession, isMasterCredential, setClientSession, setMasterSession } from '@/app/lib/auth';
import { authenticateClientCredential } from '@/app/lib/client-auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

export async function getAdminTournaments(slug: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Cliente no encontrado.' };
  const db = createServerSupabaseAdminClient();
  const [{ data: tournaments, error: tournamentError }, { data: categories, error: categoryError }] = await Promise.all([
    db.from('tournaments').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    db.from('categories').select('id, name, tournament_id, sports(name), tournaments!inner(client_id)').eq('tournaments.client_id', clientId),
  ]);
  if (tournamentError || categoryError) return { success: false as const, error: 'No se pudo cargar la lista de torneos.' };
  return { success: true as const, tournaments: tournaments || [], categories: categories || [] };
}

export async function authorizeClientAccess(username: string, password: string, slug: string) {
  const safeUsername = username.toLowerCase().trim();

  if (isMasterCredential(safeUsername, password)) {
    await setMasterSession();
    return { success: true, isMaster: true };
  }

  const result = await authenticateClientCredential({ username: safeUsername, password, slug });
  if (!result.success) {
    return { success: false, error: 'Código incorrecto o institución no registrada.' };
  }

  const { client } = result;

  await setClientSession(slug, client.id);
  
  return { success: true, isMaster: false, client };
}

export async function logoutClientAccess(slug: string) {
  await clearClientSession(slug);
}

'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

export async function createTournamentCategory(slug: string, tournamentId: string, input: { sportId: string; name: string; gender: string; matchDuration: string }) {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente no encontrado.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: tournament } = await supabase.from('tournaments').select('id').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  if (!tournament) return { success: false, error: 'El torneo no pertenece a este cliente.' };

  const { data, error } = await supabase.from('categories').insert({
    tournament_id: tournamentId,
    sport_id: input.sportId,
    name: input.name.trim().toUpperCase(),
    gender: input.gender,
    match_duration: input.matchDuration,
  }).select('id').single();

  if (error || !data) return { success: false, error: 'Ocurrió un error al crear la categoría.' };

  await logAuditEvent({ action: 'admin.category.create', actorType: 'client', clientId, targetType: 'category', targetId: data.id, metadata: { slug, tournamentId } });
  return { success: true };
}

export async function deleteTournamentCategory(slug: string, tournamentId: string, categoryId: string) {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente no encontrado.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: category } = await supabase
    .from('categories')
    .select('id, tournaments!inner(client_id)')
    .eq('id', categoryId)
    .eq('tournament_id', tournamentId)
    .eq('tournaments.client_id', clientId)
    .maybeSingle();
  if (!category) return { success: false, error: 'La categoría no pertenece a este cliente.' };

  const { error } = await supabase.from('categories').delete().eq('id', categoryId);
  if (error) return { success: false, error: 'No se pudo eliminar. Verifica dependencias.' };

  await logAuditEvent({ action: 'admin.category.delete', actorType: 'client', clientId, targetType: 'category', targetId: categoryId, metadata: { slug, tournamentId } });
  return { success: true };
}

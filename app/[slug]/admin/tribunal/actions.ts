'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { logAuditEvent } from '@/app/lib/audit';

export async function updateDisciplinaryRecord(slug: string, eventId: string, comment: string, suspensionMatches: number | null) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const safeSuspension = suspensionMatches == null ? null : Math.max(1, Math.min(20, Math.trunc(suspensionMatches)));
  const supabase = createPrivilegedSupabaseClient();
  const { data: event } = await supabase.from('match_events').select('id, event_type, player_id, match_id, matches!inner(matchdays!inner(categories!inner(tournaments!inner(id, client_id))))').eq('id', eventId).eq('matches.matchdays.categories.tournaments.client_id', clientId).maybeSingle();
  if (!event) return { success: false as const, error: 'Registro disciplinario no encontrado.' };
  if (safeSuspension !== null && event.event_type !== 'RED') return { success: false as const, error: 'La suspensión solo aplica a tarjetas rojas.' };
  const { error } = await supabase.from('match_events').update({ disciplinary_comment: comment.trim() || null, suspension_matches: safeSuspension }).eq('id', eventId);
  if (error) return { success: false as const, error: 'No se pudo guardar la resolución disciplinaria.' };
  await logAuditEvent({ action: 'admin.disciplinary_record.update', actorType: 'client', actorId: clientId, clientId, targetType: 'match_event', targetId: eventId, metadata: { slug, comment: comment.trim() || null, suspensionMatches: safeSuspension, playerId: event.player_id } });
  return { success: true as const };
}

export async function getFinePaymentProofs(slug: string, tournamentId: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.from('fine_payment_proofs').select('id, player_id, match_event_id, storage_path, original_filename, status, submitted_at, players!inner(name, shirt_number), match_events!inner(matches!inner(matchdays!inner(categories!inner(tournaments!inner(id, client_id)))))').eq('match_events.matches.matchdays.categories.tournaments.client_id', clientId).eq('match_events.matches.matchdays.categories.tournaments.id', tournamentId).eq('status', 'PENDING').order('submitted_at', { ascending: false });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data || [] };
}

export async function approveFinePaymentProof(slug: string, proofId: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data: proof } = await supabase.from('fine_payment_proofs').select('id, team_id, match_event_id, match_events!inner(team_id, matches!inner(matchdays!inner(categories!inner(tournaments!inner(id, client_id)))))').eq('id', proofId).eq('match_events.matches.matchdays.categories.tournaments.client_id', clientId).maybeSingle();
  if (!proof) return { success: false as const, error: 'Comprobante no encontrado.' };
  const teamId = proof.team_id || (proof.match_events as any)?.team_id;
  const tournamentId = (proof.match_events as any)?.matches?.matchdays?.categories?.tournaments?.id;
  if (!teamId || !tournamentId) return { success: false as const, error: 'No se pudo identificar el equipo del comprobante.' };
  const { data: tournamentMatches, error: matchesError } = await supabase.from('matches').select('id, matchdays!inner(categories!inner(tournament_id))').eq('matchdays.categories.tournament_id', tournamentId);
  if (matchesError) return { success: false as const, error: 'Comprobante aprobado, pero no se pudo identificar el torneo.' };
  const { error } = await supabase.from('fine_payment_proofs').update({ status: 'APPROVED', reviewed_at: new Date().toISOString() }).eq('id', proofId).eq('status', 'PENDING');
  if (error) return { success: false as const, error: 'No se pudo validar el comprobante.' };
  const matchIds = (tournamentMatches || []).map((match: any) => match.id);
  const eventUpdate = matchIds.length
    ? await supabase.from('match_events').update({ fine_status: 'PAID' }).eq('team_id', teamId).in('match_id', matchIds).in('event_type', ['YELLOW', 'RED']).eq('fine_status', 'UNPAID')
    : { error: null };
  if (eventUpdate.error) return { success: false as const, error: 'Comprobante aprobado, pero las multas del equipo no pudieron actualizarse.' };
  return { success: true as const };
}

export async function getFinePaymentProofUrl(slug: string, storagePath: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return { success: false as const, error: 'No se pudo abrir el comprobante.' };
  return { success: true as const, data: { url: data.signedUrl } };
}

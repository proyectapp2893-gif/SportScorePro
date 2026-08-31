'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';

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
  const { data: proof } = await supabase.from('fine_payment_proofs').select('id, match_event_id, match_events!inner(matches!inner(matchdays!inner(categories!inner(tournaments!inner(client_id)))))').eq('id', proofId).eq('match_events.matches.matchdays.categories.tournaments.client_id', clientId).maybeSingle();
  if (!proof) return { success: false as const, error: 'Comprobante no encontrado.' };
  const { error } = await supabase.from('fine_payment_proofs').update({ status: 'APPROVED', reviewed_at: new Date().toISOString() }).eq('id', proofId).eq('status', 'PENDING');
  if (error) return { success: false as const, error: 'No se pudo validar el comprobante.' };
  const eventUpdate = await supabase.from('match_events').update({ fine_status: 'PAID' }).eq('id', proof.match_event_id);
  if (eventUpdate.error) return { success: false as const, error: 'Comprobante aprobado, pero la multa no pudo actualizarse.' };
  return { success: true as const };
}

export async function getFinePaymentProofUrl(slug: string, storagePath: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(storagePath, 300);
  if (error || !data?.signedUrl) return { success: false as const, error: 'No se pudo abrir el comprobante.' };
  return { success: true as const, data: { url: data.signedUrl } };
}

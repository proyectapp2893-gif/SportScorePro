'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { logAuditEvent } from '@/app/lib/audit';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

const MAX_PAYMENT_PROOF_SIZE_BYTES = 5 * 1024 * 1024;
const PAYMENT_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

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
  let { data, error } = await supabase.from('fine_payment_proofs')
    .select('id, player_id, team_id, match_event_id, tournament_id, proof_scope, payment_source, storage_path, original_filename, mime_type, status, submitted_at, approved_amount, coverage_type, players(name, shirt_number), teams!inner(name, categories!inner(tournament_id, tournaments!inner(client_id)))')
    .eq('tournament_id', tournamentId)
    .eq('teams.categories.tournaments.client_id', clientId)
    .eq('status', 'PENDING')
    .order('submitted_at', { ascending: false });
  if (error) {
    const fallback = await supabase.from('fine_payment_proofs')
      .select('id, player_id, team_id, match_event_id, tournament_id, proof_scope, payment_source, storage_path, original_filename, mime_type, status, submitted_at, players(name, shirt_number), teams!inner(name, categories!inner(tournament_id, tournaments!inner(client_id)))')
      .eq('tournament_id', tournamentId)
      .eq('teams.categories.tournaments.client_id', clientId)
      .eq('status', 'PENDING')
      .order('submitted_at', { ascending: false });
    data = (fallback.data || []).map((proof: any) => ({ ...proof, approved_amount: null, coverage_type: null }));
    error = fallback.error;
  }
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data || [] };
}

export async function getApprovedFinePaymentProofs(slug: string, tournamentId: string, page = 0) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  if (!Number.isSafeInteger(page) || page < 0) return { success: false as const, error: 'Página inválida.' };
  const supabase = createPrivilegedSupabaseClient();
  let { data, error } = await supabase.from('fine_payment_proofs')
    .select('id, original_filename, mime_type, submitted_at, reviewed_at, proof_scope, payment_source, approved_amount, coverage_type, submitted_by_delegate_id, reviewed_by, players(name,shirt_number), teams!inner(name, categories!inner(tournament_id, tournaments!inner(client_id))), fine_payment_proof_allocations(match_event_id, amount_applied)')
    .eq('tournament_id', tournamentId)
    .eq('teams.categories.tournaments.client_id', clientId)
    .eq('status', 'APPROVED')
    .order('reviewed_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
    .range(page * 20, page * 20 + 20);
  if (error) {
    const fallback = await supabase.from('fine_payment_proofs')
      .select('id, original_filename, mime_type, submitted_at, reviewed_at, proof_scope, payment_source, submitted_by_delegate_id, reviewed_by, players(name,shirt_number), teams!inner(name, categories!inner(tournament_id, tournaments!inner(client_id)))')
      .eq('tournament_id', tournamentId)
      .eq('teams.categories.tournaments.client_id', clientId)
      .eq('status', 'APPROVED')
      .order('reviewed_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
      .range(page * 20, page * 20 + 20);
    data = (fallback.data || []).map((proof: any) => ({ ...proof, approved_amount: null, coverage_type: null, fine_payment_proof_allocations: [] }));
    error = fallback.error;
  }
  if (error) return { success: false as const, error: 'No se pudo cargar el historial de comprobantes.' };
  const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;
  const rows = (data || []).slice(0, 20);
  const delegateIds = rows.map((proof: any) => proof.submitted_by_delegate_id).filter(Boolean);
  const adminIds = rows.map((proof: any) => proof.reviewed_by).filter((id: string | null, index: number, values: Array<string | null>) => id && values.indexOf(id) === index);
  const [delegatesResult, adminsResult] = await Promise.all([
    delegateIds.length ? supabase.from('delegate_users').select('id, name, username').in('id', delegateIds) : Promise.resolve({ data: [] as any[] }),
    adminIds.length ? supabase.from('clients').select('id, name').in('id', adminIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const delegatesById = new Map((delegatesResult.data || []).map((delegate: any) => [delegate.id, delegate]));
  const adminsById = new Map((adminsResult.data || []).map((admin: any) => [admin.id, admin]));
  return {
    success: true as const,
    data: rows.map((proof: any) => {
      const delegate = proof.submitted_by_delegate_id ? delegatesById.get(proof.submitted_by_delegate_id) : null;
      const admin = proof.reviewed_by ? adminsById.get(proof.reviewed_by) : null;
      const isExternal = proof.payment_source === 'EXTERNAL';
      return {
        ...proof,
        teams: one(proof.teams),
        players: one(proof.players),
        sender_name: isExternal ? (admin?.name || 'Administración') : (delegate?.name || delegate?.username || 'Delegado'),
        sender_role: isExternal ? 'Tribunal / administración' : 'Delegado',
      };
    }),
    hasMore: (data || []).length > 20,
  };
}

export async function approveFinePaymentProof(slug: string, proofId: string, selectedEventIds: string[] = [], approvedAmount?: number | null) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data: proof } = await supabase.from('fine_payment_proofs')
    .select('id, team_id, tournament_id, player_id, proof_scope, status, teams!inner(categories!inner(tournament_id, tournaments!inner(client_id)))')
    .eq('id', proofId)
    .eq('teams.categories.tournaments.client_id', clientId)
    .maybeSingle();
  if (!proof) return { success: false as const, error: 'Comprobante no encontrado.' };
  if (proof.status !== 'PENDING') return { success: false as const, error: 'Este comprobante ya fue revisado.' };
  const teamId = proof.team_id;
  const tournamentId = proof.tournament_id || (proof.teams as any)?.categories?.tournament_id;
  if (!teamId || !tournamentId) return { success: false as const, error: 'No se pudo identificar el equipo del comprobante.' };

  let eventIds = [...new Set(selectedEventIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (proof.proof_scope === 'PLAYER') {
    if (!proof.player_id) return { success: false as const, error: 'El comprobante individual no tiene jugador asociado.' };
    const { data: playerEvents, error: playerEventsError } = await supabase
      .from('match_events')
      .select('id, matches!inner(matchdays!inner(categories!inner(tournament_id)))')
      .eq('team_id', teamId)
      .eq('player_id', proof.player_id)
      .eq('matches.matchdays.categories.tournament_id', tournamentId)
      .in('event_type', ['YELLOW', 'RED'])
      .eq('fine_status', 'UNPAID');
    if (playerEventsError) return { success: false as const, error: 'No se pudieron consultar las sanciones del jugador.' };
    eventIds = (playerEvents || []).map((event: any) => event.id);
  } else if (!eventIds.length) {
    return { success: false as const, error: 'Selecciona las sanciones que cubre el comprobante.' };
  }
  const safeAmount = approvedAmount == null || approvedAmount === 0 ? null : Number(approvedAmount);
  if (safeAmount !== null && (!Number.isFinite(safeAmount) || safeAmount < 0)) return { success: false as const, error: 'El valor aprobado no es válido.' };
  const { data: approval, error: approvalError } = await supabase.rpc('sportscore_approve_fine_payment_proof', {
    p_proof_id: proofId,
    p_event_ids: eventIds,
    p_approved_amount: safeAmount,
    p_reviewer: clientId,
  });
  if (approvalError) return { success: false as const, error: approvalError.message || 'No se pudo validar el comprobante.' };
  const approvalRow = Array.isArray(approval) ? approval[0] : approval;
  if (!approvalRow) return { success: false as const, error: 'No se pudo validar el comprobante.' };
  await logAuditEvent({ action: 'admin.fine_payment_proof.approve', actorType: 'client', actorId: clientId, clientId, targetType: proof.proof_scope === 'PLAYER' ? 'player' : 'team', targetId: proof.proof_scope === 'PLAYER' ? proof.player_id : teamId, metadata: { slug, proofId, tournamentId, scope: proof.proof_scope, updatedEvents: approvalRow.updated_events, appliedAmount: approvalRow.applied_amount, coverageType: approvalRow.coverage_type } });
  revalidatePath(`/${slug}/delegado`);
  revalidatePath(`/${slug}/admin/boletines`);
  revalidatePath(`/${slug}/admin/tribunal`);
  return { success: true as const, data: { updated: approvalRow.updated_events, appliedAmount: approvalRow.applied_amount, coverageType: approvalRow.coverage_type } };
}

export async function rejectFinePaymentProof(slug: string, proofId: string, reason: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const safeReason = reason.trim();
  if (safeReason.length < 5) return { success: false as const, error: 'Indica el motivo del rechazo.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data: proof } = await supabase.from('fine_payment_proofs')
    .select('id, team_id, storage_path, teams!inner(categories!inner(tournaments!inner(client_id)))')
    .eq('id', proofId)
    .eq('teams.categories.tournaments.client_id', clientId)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (!proof) return { success: false as const, error: 'Comprobante pendiente no encontrado.' };
  const { data: deleted, error } = await supabase.from('fine_payment_proofs')
    .delete()
    .eq('id', proofId)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  if (error || !deleted) return { success: false as const, error: 'No se pudo rechazar el comprobante.' };
  if (proof.storage_path) await supabase.storage.from('player-documents').remove([proof.storage_path]);
  await logAuditEvent({ action: 'admin.fine_payment_proof.reject', actorType: 'client', actorId: clientId, clientId, targetType: 'team', targetId: proof.team_id, metadata: { slug, proofId, reason: safeReason, deleted: true } });
  revalidatePath(`/${slug}/admin/tribunal`);
  revalidatePath(`/${slug}/delegado`);
  return { success: true as const };
}

export async function markTeamFinesPaidExternally(slug: string, tournamentId: string, teamId: string, note: string, file?: File) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const safeNote = note.trim();
  if (safeNote.length < 5) return { success: false as const, error: 'Indica el motivo o soporte del pago externo.' };
  if (!file || file.size <= 0 || file.size > MAX_PAYMENT_PROOF_SIZE_BYTES) return { success: false as const, error: 'Adjunta un comprobante de imagen o PDF de máximo 5 MB.' };
  if (!PAYMENT_PROOF_TYPES.includes(file.type)) return { success: false as const, error: 'El comprobante debe ser JPG, PNG, WebP o PDF.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data: team } = await supabase.from('teams').select('id,name,categories!inner(tournament_id,tournaments!inner(client_id))').eq('id', teamId).eq('categories.tournament_id', tournamentId).eq('categories.tournaments.client_id', clientId).maybeSingle();
  if (!team) return { success: false as const, error: 'El equipo no pertenece al torneo seleccionado.' };
  const { data: matches, error: matchesError } = await supabase.from('matches').select('id,matchdays!inner(categories!inner(tournament_id))').eq('matchdays.categories.tournament_id', tournamentId);
  if (matchesError) return { success: false as const, error: 'No se pudieron consultar los partidos del torneo.' };
  const matchIds = (matches || []).map((match: any) => match.id);
  if (!matchIds.length) return { success: false as const, error: 'El torneo no tiene partidos para actualizar.' };
  const { data: pending, error: pendingError } = await supabase.from('match_events').select('id').eq('team_id', teamId).in('match_id', matchIds).in('event_type', ['YELLOW', 'RED']).eq('fine_status', 'UNPAID');
  if (pendingError) return { success: false as const, error: 'No se pudieron consultar las multas pendientes.' };
  if (!pending?.length) return { success: false as const, error: 'El equipo no tiene multas pendientes.' };
  const { data: activeProofs, error: activeProofsError } = await supabase.from('fine_payment_proofs').select('id').eq('team_id', teamId).eq('tournament_id', tournamentId).eq('status', 'PENDING');
  if (activeProofsError) return { success: false as const, error: 'No se pudo verificar si existe un comprobante pendiente.' };
  if (activeProofs?.length) return { success: false as const, error: 'El equipo ya tiene un comprobante pendiente. Revísalo o recházalo antes de registrar otro pago.' };

  const extension = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1].replace('jpeg', 'jpg');
  const storagePath = `${clientId}/${teamId}/fine-proofs/external-${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from('player-documents').upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) return { success: false as const, error: 'No se pudo almacenar el comprobante externo.' };
  const { data: proof, error: proofError } = await supabase.from('fine_payment_proofs').insert({
    team_id: teamId,
    tournament_id: tournamentId,
    player_id: null,
    match_event_id: null,
    proof_scope: 'TEAM',
    payment_source: 'EXTERNAL',
    payment_note: safeNote,
    storage_path: storagePath,
    original_filename: file.name.slice(0, 180),
    mime_type: file.type,
    file_size: file.size,
    status: 'PENDING',
  }).select('id').single();
  if (proofError || !proof) {
    await supabase.storage.from('player-documents').remove([storagePath]);
    return { success: false as const, error: 'No se pudo registrar el comprobante externo.' };
  }
  const eventIds = (pending || []).map((event: any) => event.id);
  const { data: approval, error: approvalError } = await supabase.rpc('sportscore_approve_fine_payment_proof', {
    p_proof_id: proof.id,
    p_event_ids: eventIds,
    p_approved_amount: null,
    p_reviewer: clientId,
  });
  if (approvalError || !approval?.[0]) {
    await supabase.from('fine_payment_proofs').delete().eq('id', proof.id);
    await supabase.storage.from('player-documents').remove([storagePath]);
    return { success: false as const, error: approvalError?.message || 'No se pudieron actualizar las multas.' };
  }
  await logAuditEvent({ action: 'admin.fines.external_payment', actorType: 'client', actorId: clientId, clientId, targetType: 'team', targetId: teamId, metadata: { slug, tournamentId, teamName: (team as any).name, proofId: proof.id, updatedEvents: approval[0].updated_events || 0, appliedAmount: approval[0].applied_amount, note: safeNote, paymentSource: 'EXTERNAL' } });
  revalidatePath(`/${slug}/admin/tribunal`);
  revalidatePath(`/${slug}/delegado`);
  return { success: true as const, data: { updated: approval[0].updated_events || 0, proofId: proof.id, appliedAmount: approval[0].applied_amount } };
}

export async function getFinePaymentProofUrl(slug: string, proofId: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'Institución no encontrada.' };
  const supabase = createPrivilegedSupabaseClient();
  const { data: proof, error: proofError } = await supabase.from('fine_payment_proofs')
    .select('storage_path, teams!inner(categories!inner(tournaments!inner(client_id)))')
    .eq('id', proofId)
    .eq('teams.categories.tournaments.client_id', clientId)
    .maybeSingle();
  if (proofError || !proof) return { success: false as const, error: 'Comprobante no encontrado.' };
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(proof.storage_path, 300);
  if (error || !data?.signedUrl) return { success: false as const, error: 'No se pudo abrir el comprobante.' };
  return { success: true as const, data: { url: data.signedUrl } };
}

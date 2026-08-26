'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { categoryBelongsToClientSlug, getClientIdBySlug, teamBelongsToClientSlug } from '@/app/lib/tenant';

type RosterActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

type PlayerInput = {
  name: string;
  identityNumber?: string | null;
  shirtNumber?: number | null;
  birthYear?: number | null;
  birthDate?: string | null;
  vinculo?: string | null;
  relationshipDetail?: string | null;
  strictRegistration?: boolean;
};

export async function getOrCreateRosterTeam(
  slug: string,
  categoryId: string,
  schoolId: string,
  schoolName: string,
): Promise<RosterActionResult<{ id: string; name: string; school_id: string; category_id: string }>> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  if (!(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false, error: 'La categoría no pertenece a este cliente.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { data: existingTeam } = await supabase
    .from('teams')
    .select('id, name, school_id, category_id')
    .eq('school_id', schoolId)
    .eq('category_id', categoryId)
    .maybeSingle();

  if (existingTeam) return { success: true, data: existingTeam };

  const clientId = await getClientIdBySlug(slug);
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id')
    .eq('id', schoolId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (schoolError || !school) {
    return { success: false, error: 'La institución no pertenece a este cliente.' };
  }

  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert({
      school_id: schoolId,
      category_id: categoryId,
      name: schoolName.trim().toUpperCase(),
    })
    .select('id, name, school_id, category_id')
    .single();

  if (error || !newTeam) {
    return { success: false, error: 'Error en la sincronización de delegación.' };
  }

  await logAuditEvent({
    action: 'admin.roster.team_create',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: newTeam.id,
    metadata: { slug, categoryId, schoolId },
  });

  return { success: true, data: newTeam };
}

export async function updateRosterTeamName(slug: string, teamId: string, name: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const safeName = name.trim().toUpperCase();
  if (!safeName) return { success: false, error: 'Nombre inválido.' };

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from('teams').update({ name: safeName }).eq('id', teamId);
  if (error) return { success: false, error: 'No se pudo renombrar la delegación.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.team_rename',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug, name: safeName },
  });

  return { success: true, data: undefined };
}

export async function deleteRosterTeam(slug: string, teamId: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const supabase = createServerSupabaseAdminClient();
  await supabase.from('players').delete().eq('team_id', teamId);
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) return { success: false, error: 'Error al remover delegación.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.team_delete',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug },
  });

  return { success: true, data: undefined };
}

export async function deleteRosterPlayer(slug: string, playerId: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('id', playerId)
    .maybeSingle();

  if (fetchError || !player || !(await teamBelongsToClientSlug(player.team_id, slug))) {
    return { success: false, error: 'El jugador no pertenece a este cliente.' };
  }

  const { error } = await supabase.from('players').delete().eq('id', playerId);
  if (error) return { success: false, error: 'Error al procesar la baja.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.player_delete',
    actorType: 'client',
    clientId,
    targetType: 'player',
    targetId: playerId,
    metadata: { slug, teamId: player.team_id },
  });

  return { success: true, data: undefined };
}

export async function loadRosterPlayerDocuments(slug: string, teamId: string): Promise<RosterActionResult<any[]>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase.from('player_documents').select('id, player_id, document_type, status, rejection_reason, original_filename, updated_at, players!inner(team_id)').eq('players.team_id', teamId).order('updated_at', { ascending: false });
  if (error) return { success: false, error: 'No se pudieron cargar los documentos.' };
  return { success: true, data: data || [] };
}

export async function openRosterPlayerDocument(slug: string, documentId: string): Promise<RosterActionResult<{ url: string }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: document } = await supabase.from('player_documents').select('id, player_id, storage_path, players!inner(team_id)').eq('id', documentId).maybeSingle();
  const teamId = (document as any)?.players?.team_id;
  if (!document || !teamId || !(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'Documento inválido.' };
  const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(document.storage_path, 60);
  if (error || !data) return { success: false, error: 'No se pudo abrir el documento.' };
  await logAuditEvent({ action: 'admin.player_document.view', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'player', targetId: document.player_id, metadata: { slug, documentId } });
  return { success: true, data: { url: data.signedUrl } };
}

export async function reviewRosterPlayerDocument(slug: string, documentId: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string): Promise<RosterActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: document } = await supabase.from('player_documents').select('id, player_id, players!inner(team_id)').eq('id', documentId).maybeSingle();
  const teamId = (document as any)?.players?.team_id;
  if (!document || !teamId || !(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'Documento inválido.' };
  const reason = rejectionReason?.trim() || null;
  if (status === 'REJECTED' && !reason) return { success: false, error: 'Indica el motivo del rechazo.' };
  const { error } = await supabase.from('player_documents').update({ status, rejection_reason: status === 'REJECTED' ? reason : null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', documentId);
  if (error) return { success: false, error: 'No se pudo actualizar la revisión.' };
  await logAuditEvent({ action: 'admin.player_document.review', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'player', targetId: document.player_id, metadata: { slug, documentId, status, rejectionReason: reason } });
  return { success: true, data: undefined };
}

export async function addRosterPlayers(
  slug: string,
  teamId: string,
  players: PlayerInput[],
): Promise<RosterActionResult<{ inserted: number }>> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await teamBelongsToClientSlug(teamId, slug))) return { success: false, error: 'El equipo no pertenece a este cliente.' };

  const formattedPlayers = players
    .map((player) => ({
      team_id: teamId,
      name: player.name.trim().toUpperCase(),
      identity_number: player.identityNumber?.trim().replace(/\D/g, '') || null,
      shirt_number: player.shirtNumber ?? null,
      birth_year: player.birthYear ?? null,
      birth_date: player.birthDate || null,
      vinculo: player.vinculo?.trim().toUpperCase() || null,
      relationship_detail: player.relationshipDetail?.trim().toUpperCase() || null,
      strict_registration: Boolean(player.strictRegistration),
    }))
    .filter((player) => player.name);

  const strictPlayers = formattedPlayers.filter((player) => player.strict_registration);
  if (strictPlayers.some((player) => !player.identity_number || player.identity_number.length < 5 || player.identity_number.length > 30)) return { success: false, error: 'Todos los jugadores deben tener una identificación válida.' };
  if (new Set(strictPlayers.map((player) => player.identity_number)).size !== strictPlayers.length) return { success: false, error: 'Hay números de identidad repetidos en la carga.' };
  if (strictPlayers.some((player) => !Number.isInteger(player.shirt_number) || Number(player.shirt_number) < 1 || Number(player.shirt_number) > 999)) return { success: false, error: 'Todos los dorsales deben ser enteros entre 1 y 999.' };
  if (new Set(strictPlayers.map((player) => player.shirt_number)).size !== strictPlayers.length) return { success: false, error: 'Hay dorsales repetidos en la carga.' };
  if (strictPlayers.some((player) => !player.birth_date || Number.isNaN(Date.parse(player.birth_date)))) return { success: false, error: 'Todos los jugadores deben tener una fecha de nacimiento completa.' };
  if (strictPlayers.some((player) => !['PADRE DE FAMILIA', 'EX-ALUMNO', 'COLABORADOR'].includes(player.vinculo || ''))) return { success: false, error: 'El vínculo debe ser PADRE DE FAMILIA, EX-ALUMNO o COLABORADOR.' };
  if (strictPlayers.some((player) => player.vinculo === 'EX-ALUMNO' && !/^\d{4}$/.test(player.relationship_detail || ''))) return { success: false, error: 'Los ex-alumnos deben indicar el año de promoción.' };
  if (strictPlayers.some((player) => player.vinculo === 'PADRE DE FAMILIA' && (player.relationship_detail || '').length < 5)) return { success: false, error: 'Los padres de familia deben indicar el nombre completo del estudiante.' };

  const { data: teamCategory } = await createServerSupabaseAdminClient()
    .from('teams')
    .select('categories(tournament_id, tournaments(tournament_format, schedule_dates))')
    .eq('id', teamId)
    .maybeSingle();
  if ((teamCategory as any)?.categories?.tournaments?.tournament_format === 'THREE_STAGE_35') {
    const tournamentDate = String((teamCategory as any)?.categories?.tournaments?.schedule_dates?.[0] || `${new Date().getFullYear()}-12-31`);
    const cutoff = new Date(`${tournamentDate}T12:00:00`); cutoff.setFullYear(cutoff.getFullYear() - 35);
    if (formattedPlayers.some((player) => player.birth_date ? new Date(`${player.birth_date}T12:00:00`) > cutoff : !player.birth_year || Number(player.birth_year) > cutoff.getFullYear())) {
      return { success: false, error: `Todos los participantes deben tener 35 años cumplidos al iniciar el torneo (${tournamentDate}).` };
    }
  }

  if (formattedPlayers.length === 0) return { success: false, error: 'No hay jugadores válidos.' };

  const supabase = createServerSupabaseAdminClient();
  if (strictPlayers.length) {
    const identities = strictPlayers.map((player) => player.identity_number as string);
    const { data: existing } = await supabase.from('players').select('identity_number, teams!inner(categories!inner(tournament_id))').in('identity_number', identities).eq('teams.categories.tournament_id', (teamCategory as any)?.categories?.tournament_id).limit(1);
    if (existing?.length) return { success: false, error: `La identidad ${existing[0].identity_number} ya está inscrita en este torneo.` };
  }
  const rowsToInsert = formattedPlayers.map(({ strict_registration: _strictRegistration, ...player }) => player);
  const { error } = await supabase.from('players').insert(rowsToInsert);
  if (error) return { success: false, error: 'Error al registrar jugadores.' };

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.roster.players_create',
    actorType: 'client',
    clientId,
    targetType: 'team',
    targetId: teamId,
    metadata: { slug, inserted: formattedPlayers.length },
  });

  return { success: true, data: { inserted: formattedPlayers.length } };
}

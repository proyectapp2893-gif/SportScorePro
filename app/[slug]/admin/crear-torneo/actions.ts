'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { randomUUID } from 'crypto';

const MAX_TOURNAMENT_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

type SaveTournamentInput = {
  editingTournamentId?: string | null;
  tournament: Record<string, unknown>;
  sportId: string;
  categories: Array<{ id: string; name: string; gender: string; duration: string; isExisting?: boolean }>;
  deletedCategoryIds?: string[];
  teamsMap: Record<string, string[]>;
};

type SaveTournamentResult =
  | { success: true; tournamentId: string }
  | { success: false; error: string };

export async function saveTournamentWizard(slug: string, input: SaveTournamentInput): Promise<SaveTournamentResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente no encontrado.' };

  const rawScheduleSlots = Array.isArray(input.tournament.schedule_time_slots) ? input.tournament.schedule_time_slots : [];
  const scheduleTimeSlots = Array.from(new Set(rawScheduleSlots.map((value) => String(value).trim()).filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)))).sort();
  if (scheduleTimeSlots.length === 0) return { success: false, error: 'Configura al menos un horario válido para el torneo.' };
  const rawScheduleDates = Array.isArray(input.tournament.schedule_dates) ? input.tournament.schedule_dates : [];
  const scheduleDates = rawScheduleDates.map((value) => String(value).trim()).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  if (scheduleDates.length === 0) return { success: false, error: 'Configura el primer sábado del torneo.' };
  if (new Date(`${scheduleDates[0]}T00:00:00Z`).getUTCDay() !== 6) return { success: false, error: 'La fecha inicial debe corresponder a un sábado.' };
  const allowedVenues = new Set(['Cancha 1', 'Cancha 2']);
  const availableVenues = Array.from(new Set((Array.isArray(input.tournament.available_venues) ? input.tournament.available_venues : []).map(String).filter((venue) => allowedVenues.has(venue))));
  if (availableVenues.length === 0) return { success: false, error: 'Selecciona al menos una cancha disponible.' };
  const safeTournament: Record<string, unknown> = { ...input.tournament, schedule_time_slots: scheduleTimeSlots, schedule_dates: [scheduleDates[0]], available_venues: availableVenues, fixture_visible_to_delegates: Boolean(input.tournament.fixture_visible_to_delegates), fixture_visible_to_public: Boolean(input.tournament.fixture_visible_to_public) };

  const supabase = createServerSupabaseAdminClient();
  if (safeTournament.tournament_format === 'THREE_STAGE_35') {
    const invalidCategory = input.categories.find((category) => (input.teamsMap[category.id] || []).length !== 8);
    if (invalidCategory) return { success: false, error: `El formato Máster 35+ requiere exactamente 8 equipos en ${invalidCategory.name}.` };
  }
  let tournamentId = input.editingTournamentId || null;
  const legacyTournamentPayload = { ...safeTournament };
  delete legacyTournamentPayload.sport_modality;
  const isMissingSportModalityColumn = (error: { code?: string; message?: string } | null | undefined) => Boolean(error && error.code === '42703' && /sport_modality/i.test(error.message || ''));

  if (tournamentId) {
    const { data: existingTournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('id', tournamentId)
      .eq('client_id', clientId)
      .maybeSingle();
    if (!existingTournament) return { success: false, error: 'El torneo no pertenece a este cliente.' };

    let { error } = await supabase.from('tournaments').update(safeTournament).eq('id', tournamentId);
    // Compatibilidad temporal con proyectos cuyo schema aún no tiene la columna nueva.
    // El reintento conserva todos los campos históricos y nunca elimina datos.
    if (isMissingSportModalityColumn(error)) {
      ({ error } = await supabase.from('tournaments').update(legacyTournamentPayload).eq('id', tournamentId));
    }
    if (error) return { success: false, error: 'No se pudo actualizar el torneo. Los datos existentes no fueron modificados.' };
  } else {
    let { data: newTournament, error } = await supabase
      .from('tournaments')
      .insert([{ ...safeTournament, client_id: clientId }])
      .select('id')
      .single();
    if (isMissingSportModalityColumn(error)) {
      ({ data: newTournament, error } = await supabase
        .from('tournaments')
        .insert([{ ...legacyTournamentPayload, client_id: clientId }])
        .select('id')
        .single());
    }
    if (error || !newTournament) return { success: false, error: 'No se pudo crear el torneo.' };
    tournamentId = newTournament.id;
  }

  if (!tournamentId) return { success: false, error: 'No se pudo resolver el torneo.' };
  const resolvedTournamentId = tournamentId;
  const deletedCategoryIds = Array.from(new Set(input.deletedCategoryIds || []));

  if (input.editingTournamentId && deletedCategoryIds.length > 0) {
    const { data: categoriesToDelete } = await supabase
      .from('categories')
      .select('id, name')
      .eq('tournament_id', resolvedTournamentId)
      .in('id', deletedCategoryIds);

    const validDeleteIds = (categoriesToDelete || []).map((category) => category.id);
    if (validDeleteIds.length > 0) {
      const { data: matchdays } = await supabase
        .from('matchdays')
        .select('id, category_id')
        .in('category_id', validDeleteIds)
        .limit(1);

      if (matchdays && matchdays.length > 0) {
        return { success: false, error: 'No se pueden eliminar categorías con fixture creado. Primero elimina o regenera el fixture.' };
      }

      const { data: categoryTeams } = await supabase
        .from('teams')
        .select('id')
        .in('category_id', validDeleteIds);
      const teamIds = (categoryTeams || []).map((team) => team.id);

      if (teamIds.length > 0) {
        await supabase.from('players').delete().in('team_id', teamIds);
        const { error: teamDeleteError } = await supabase.from('teams').delete().in('id', teamIds);
        if (teamDeleteError) return { success: false, error: 'No se pudieron eliminar equipos de categorías removidas.' };
      }

      const { error: categoryDeleteError } = await supabase.from('categories').delete().in('id', validDeleteIds);
      if (categoryDeleteError) return { success: false, error: 'No se pudieron eliminar categorías removidas.' };
    }
  }

  for (const cat of input.categories) {
    let categoryId = cat.id;
    const safeCategoryName = cat.name.trim().toUpperCase();
    if (!safeCategoryName) return { success: false, error: 'Todas las categorías deben tener nombre.' };
    const safeDuration = cat.duration?.trim() || 'Sin definir';

    if (!cat.isExisting) {
      const { data: savedCat, error } = await supabase
        .from('categories')
        .insert([{
          tournament_id: resolvedTournamentId,
          sport_id: input.sportId,
          name: safeCategoryName,
          gender: cat.gender,
          match_duration: safeDuration,
        }])
        .select('id')
        .single();
      if (error || !savedCat) return { success: false, error: `No se pudo crear la categoría ${cat.name}.` };
      categoryId = savedCat.id;
    } else {
      const { data: existingCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('id', categoryId)
        .eq('tournament_id', resolvedTournamentId)
        .maybeSingle();
      if (!existingCategory) return { success: false, error: 'Una categoría no pertenece a este torneo.' };

      const { error: categoryUpdateError } = await supabase
        .from('categories')
        .update({
          sport_id: input.sportId,
          name: safeCategoryName,
          gender: cat.gender,
          match_duration: safeDuration,
        })
        .eq('id', categoryId)
        .eq('tournament_id', resolvedTournamentId);
      if (categoryUpdateError) return { success: false, error: `No se pudo actualizar la categoría ${cat.name}.` };
    }

    const selectedSchoolIds = input.teamsMap[cat.id] || [];
    const { data: schools } = selectedSchoolIds.length > 0
      ? await supabase
        .from('schools')
        .select('id, name')
        .eq('client_id', clientId)
        .in('id', selectedSchoolIds)
      : { data: [] as Array<{ id: string; name: string }> };

    const validSchools = schools || [];
    const { data: existingTeams } = await supabase.from('teams').select('id, school_id').eq('category_id', categoryId);
    const existingSchoolIds = new Set((existingTeams || []).map((team) => team.school_id));

    const teamsToInsert = validSchools
      .filter((school) => !existingSchoolIds.has(school.id))
      .map((school) => ({ school_id: school.id, category_id: categoryId, name: school.name, group_name: 'A' }));

    if (teamsToInsert.length > 0) {
      const { error } = await supabase.from('teams').insert(teamsToInsert);
      if (error) return { success: false, error: `No se pudieron crear equipos para ${cat.name}.` };
    }

    if (cat.isExisting) {
      const selectedSet = new Set(selectedSchoolIds);
      const teamsToRemove = (existingTeams || []).filter((team) => !selectedSet.has(team.school_id));
      if (teamsToRemove.length > 0) {
        const teamIdsToRemove = teamsToRemove.map((team) => team.id);
        const { data: linkedMatches } = await supabase
          .from('matches')
          .select('id')
          .or(`home_team_id.in.(${teamIdsToRemove.join(',')}),away_team_id.in.(${teamIdsToRemove.join(',')})`)
          .limit(1);

        if (linkedMatches && linkedMatches.length > 0) {
          return { success: false, error: `No se pueden quitar equipos de ${cat.name} porque ya existen partidos. Regenera o elimina el fixture primero.` };
        }

        await supabase.from('players').delete().in('team_id', teamIdsToRemove);
        const { error: removeTeamsError } = await supabase.from('teams').delete().in('id', teamIdsToRemove);
        if (removeTeamsError) return { success: false, error: `No se pudieron quitar equipos de ${cat.name}.` };
      }
    }
  }

  await logAuditEvent({
    action: input.editingTournamentId ? 'admin.tournament.update' : 'admin.tournament.create',
    actorType: 'client',
    clientId,
    targetType: 'tournament',
    targetId: resolvedTournamentId,
    metadata: { slug, categories: input.categories.length },
  });

  return { success: true, tournamentId: resolvedTournamentId };
}

export async function uploadTournamentLogo(slug: string, file: File): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente no encontrado.' };
  if (!file.type.startsWith('image/')) return { success: false, error: 'El archivo debe ser una imagen.' };
  if (file.size <= 0 || file.size > MAX_TOURNAMENT_LOGO_SIZE_BYTES) return { success: false, error: 'El logo debe pesar máximo 5 MB.' };

  const supabase = createServerSupabaseAdminClient();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${clientId}/tournaments/tournament-${randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from('logos').upload(filePath, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return { success: false, error: 'Fallo en la carga del logo.' };

  const { data: publicUrlData } = supabase.storage.from('logos').getPublicUrl(filePath);
  return { success: true, publicUrl: publicUrlData.publicUrl };
}

export async function deleteTournament(slug: string, tournamentId: string) {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Cliente no encontrado.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, logo_url')
    .eq('id', tournamentId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (tournamentError || !tournament) return { success: false, error: 'El torneo no existe o no pertenece a este cliente.' };

  const { data: tournamentTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id, categories!inner(tournament_id)')
    .eq('categories.tournament_id', tournamentId);

  if (teamsError) return { success: false, error: 'No se pudo identificar la información asociada al torneo.' };

  const teamIds = (tournamentTeams || []).map((team) => team.id);
  let delegateIds: string[] = [];
  let playerDocumentPaths: string[] = [];

  if (teamIds.length > 0) {
    const { data: tournamentPlayers } = await supabase.from('players').select('id').in('team_id', teamIds);
    const playerIds = (tournamentPlayers || []).map((player) => player.id);
    if (playerIds.length > 0) {
      const { data: documents } = await supabase.from('player_documents').select('storage_path').in('player_id', playerIds);
      playerDocumentPaths = (documents || []).map((document) => document.storage_path);
    }
    const { data: delegateAccess, error: delegateAccessError } = await supabase
      .from('delegate_team_access')
      .select('delegate_user_id')
      .in('team_id', teamIds);

    if (delegateAccessError) return { success: false, error: 'No se pudieron validar los accesos de delegados del torneo.' };
    delegateIds = Array.from(new Set((delegateAccess || []).map((access) => access.delegate_user_id)));
  }

  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId).eq('client_id', clientId);
  if (error) return { success: false, error: 'Error. Verifica si hay datos asociados.' };

  if (playerDocumentPaths.length > 0) await supabase.storage.from('player-documents').remove(playerDocumentPaths);

  let deletedDelegates = 0;
  for (const delegateId of delegateIds) {
    const { count, error: remainingAccessError } = await supabase
      .from('delegate_team_access')
      .select('id', { count: 'exact', head: true })
      .eq('delegate_user_id', delegateId);

    if (!remainingAccessError && count === 0) {
      const { error: deleteDelegateError } = await supabase
        .from('delegate_users')
        .delete()
        .eq('id', delegateId)
        .eq('client_id', clientId);
      if (!deleteDelegateError) deletedDelegates += 1;
    }
  }

  await logAuditEvent({ action: 'admin.tournament.delete', actorType: 'client', clientId, targetType: 'tournament', targetId: tournamentId, metadata: { slug, deletedDelegates } });
  return { success: true };
}

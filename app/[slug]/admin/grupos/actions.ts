'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { categoryBelongsToClientSlug, getClientIdBySlug, teamBelongsToClientSlug } from '@/app/lib/tenant';
import { selectLoyolaQualifiers } from '@/app/lib/tournaments/loyola-qualification';

type FixtureActionResult =
  | { success: true }
  | { success: false; error: string };

type FixtureMatchInput = {
  homeTeamId: string;
  awayTeamId?: string | null;
  scheduledTime?: string | null;
  venue?: string | null;
  status?: string | null;
};

type FixtureRoundInput = {
  roundNumber: number;
  scheduledDate?: string | null;
  matches: FixtureMatchInput[];
};

type FixtureCreateResult =
  | { success: true; insertedMatches: number }
  | { success: false; error: string };

type FixtureMatchUpdateInput = {
  matchId: string;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  venue?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: string;
};

type RandomizeGroupsResult =
  | { success: true; assignments: Array<{ teamId: string; groupName: string }> }
  | { success: false; error: string };

type ReorganizeFixtureResult =
  | { success: true; updatedMatches: number }
  | { success: false; error: string };

export async function getAdminFixtureCategories(slug: string) {
  if (!(await hasAdminSession(slug))) return { success: false as const, error: 'Sesión de administrador no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false as const, error: 'No se encontró el cliente.' };
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase.from('categories')
    .select('*, tournaments!inner(id, client_id, fixture_visible_to_delegates, fixture_visible_to_public, tournament_format, fair_play_enabled, fp_starting_points), sports(name)')
    .eq('tournaments.client_id', clientId).order('name');
  if (error) return { success: false as const, error: 'No se pudieron cargar las categorías.' };
  return { success: true as const, clientId, categories: data || [] };
}

export async function getAdminCategoryFixture(slug: string, categoryId: string) {
  if (!(await hasAdminSession(slug)) || !(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false as const, error: 'Acceso no autorizado.' };
  }
  const supabase = createServerSupabaseAdminClient();
  const [{ data: teams, error: teamsError }, { data: matches, error: matchesError }] = await Promise.all([
    supabase.from('teams').select('*').eq('category_id', categoryId).order('name'),
    supabase.from('matches').select(`
      id, status, home_score, away_score, home_sets, away_sets, scheduled_time, venue, home_team_id, away_team_id,
      home_team:teams!home_team_id(id, name, schools(logo_url)),
      away_team:teams!away_team_id(id, name, schools(logo_url)),
      matchdays!inner(id, category_id, round_number, scheduled_date)
    `).eq('matchdays.category_id', categoryId).order('scheduled_time', { ascending: true }),
  ]);
  if (teamsError || matchesError) return { success: false as const, error: 'No se pudo cargar el fixture de administración.' };
  return { success: true as const, teams: teams || [], matches: matches || [] };
}

export async function updateTournamentFixtureVisibility(slug: string, categoryId: string, visible: boolean): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false, error: 'La categoría no pertenece a este cliente.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: category } = await supabase.from('categories').select('tournament_id').eq('id', categoryId).maybeSingle();
  if (!category?.tournament_id) return { success: false, error: 'No se encontró el torneo.' };
  const { error } = await supabase.from('tournaments').update({ fixture_visible_to_delegates: visible }).eq('id', category.tournament_id);
  if (error) return { success: false, error: 'No se pudo actualizar la visibilidad del fixture.' };
  await logAuditEvent({ action: visible ? 'admin.fixture.publish' : 'admin.fixture.hide', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'tournament', targetId: category.tournament_id, metadata: { slug, categoryId } });
  return { success: true };
}

export async function updateTournamentPublicFixtureVisibility(slug: string, categoryId: string, visible: boolean): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false, error: 'La categoría no pertenece a este cliente.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: category } = await supabase.from('categories').select('tournament_id').eq('id', categoryId).maybeSingle();
  if (!category?.tournament_id) return { success: false, error: 'No se encontró el torneo.' };
  const { error } = await supabase.from('tournaments').update({ fixture_visible_to_public: visible }).eq('id', category.tournament_id);
  if (error) return { success: false, error: 'No se pudo actualizar la publicación pública.' };
  await logAuditEvent({ action: visible ? 'admin.fixture.public_publish' : 'admin.fixture.public_hide', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'tournament', targetId: category.tournament_id, metadata: { slug, categoryId } });
  return { success: true };
}

export async function reorganizeCategoryFixtureTimes(slug: string, categoryId: string): Promise<ReorganizeFixtureResult> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión de administrador no válida.' };
  if (!(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false, error: 'La categoría no pertenece a este cliente.' };

  const supabase = createServerSupabaseAdminClient();
  let { data: category, error: categoryError } = await supabase
    .from('categories')
    .select('id, tournaments!inner(id, schedule_time_slots, schedule_dates, schedule_weekdays, available_venues)')
    .eq('id', categoryId)
    .maybeSingle();
  if (categoryError && /schedule_weekdays|column .* does not exist/i.test(categoryError.message || '')) {
    ({ data: category, error: categoryError } = await supabase.from('categories').select('id, tournaments!inner(id, schedule_time_slots, schedule_dates, available_venues)').eq('id', categoryId).maybeSingle());
  }
  if (categoryError || !category) return { success: false, error: 'No se pudo cargar la configuración del torneo.' };
  const tournament = Array.isArray(category?.tournaments) ? category.tournaments[0] : category?.tournaments;
  const slots = Array.from(new Set((Array.isArray(tournament?.schedule_time_slots) ? tournament.schedule_time_slots : [])
    .map((value: unknown) => String(value).trim())
    .filter((value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)))) as string[];
  if (slots.length === 0) return { success: false, error: 'Configura primero los horarios disponibles del torneo.' };
  const venues = (Array.isArray(tournament?.available_venues) ? tournament.available_venues : [])
    .map((value: unknown) => String(value))
    .filter((value: string) => value === 'Cancha 1' || value === 'Cancha 2');
  if (venues.length === 0) return { success: false, error: 'Configura primero Cancha 1 y/o Cancha 2 en el torneo.' };
  const dates = (Array.isArray(tournament?.schedule_dates) ? tournament.schedule_dates : [])
    .map((value: unknown) => String(value).trim())
    .filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)) as string[];
  if (dates.length === 0) return { success: false, error: 'Configura primero los días disponibles del torneo.' };
  const firstDate = new Date(`${dates[0]}T00:00:00Z`);
  const weekdays = Array.from(new Set((Array.isArray(tournament?.schedule_weekdays) ? tournament.schedule_weekdays : [6]).map(Number).filter((day: number) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b);
  if (weekdays.length === 0) return { success: false, error: 'Configura al menos un día de competencia.' };

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, status, scheduled_time, venue, matchdays!inner(id, round_number, category_id, scheduled_date)')
    .eq('matchdays.category_id', categoryId);
  if (error) return { success: false, error: 'No se pudo cargar el fixture.' };
  const validMatches = (matches || []).filter((match: any) => match.home_team_id && match.away_team_id);
  const schedulable = validMatches.filter((match: any) => match.status === 'SCHEDULED')
    .sort((a: any, b: any) => Number(a.matchdays?.round_number || 0) - Number(b.matchdays?.round_number || 0) || a.id.localeCompare(b.id));
  if (schedulable.length === 0) return { success: false, error: 'No hay partidos programados que puedan reorganizarse.' };

  const lockedMatchdayIds = new Set(validMatches.filter((match: any) => match.status !== 'SCHEDULED').map((match: any) => match.matchdays?.id));
  const allMatchdays = Array.from(new Map(validMatches.map((match: any) => [match.matchdays?.id, match.matchdays])).values())
    .filter((matchday: any) => matchday?.id)
    .sort((a: any, b: any) => Number(a.round_number || 0) - Number(b.round_number || 0));
  const pendingMatchdays = allMatchdays.filter((matchday: any) => !lockedMatchdayIds.has(matchday.id));
  const calculatedDates = pendingMatchdays.map((matchday: any) => {
    const scheduleIndex = allMatchdays.findIndex((item: any) => item.id === matchday.id);
    const date = new Date(firstDate);
    if (scheduleIndex === 0) return date.toISOString().slice(0, 10);
    let remaining = scheduleIndex;
    while (remaining > 0) { date.setUTCDate(date.getUTCDate() + 1); if (weekdays.includes(date.getUTCDay())) remaining -= 1; }
    return date.toISOString().slice(0, 10);
  });

  const teamSlotCounts: Record<string, number[]> = {};
  const teamVenueCounts: Record<string, number[]> = {};
  const roundOccupancy: Record<string, Set<string>> = {};
  const assignments: Array<{ id: string; time: string; venue: string }> = [];
  for (const match of validMatches as any[]) {
    for (const teamId of [match.home_team_id, match.away_team_id]) {
      if (!teamSlotCounts[teamId]) teamSlotCounts[teamId] = slots.map(() => 0);
      if (!teamVenueCounts[teamId]) teamVenueCounts[teamId] = venues.map(() => 0);
    }
    if (match.status === 'SCHEDULED') continue;
    const currentTime = String(match.scheduled_time || '').slice(0, 5);
    const slotIndex = slots.indexOf(currentTime);
    if (slotIndex >= 0) {
      teamSlotCounts[match.home_team_id][slotIndex] += 1;
      teamSlotCounts[match.away_team_id][slotIndex] += 1;
    }
    const venueIndex = venues.findIndex((venue) => venue === String(match.venue || ''));
    if (venueIndex >= 0) {
      teamVenueCounts[match.home_team_id][venueIndex] += 1;
      teamVenueCounts[match.away_team_id][venueIndex] += 1;
    }
  }
  for (const match of schedulable as any[]) {
    const round = String(match.matchdays?.round_number || 0);
    if (!roundOccupancy[round]) roundOccupancy[round] = new Set();
    const candidates = slots.flatMap((time, slotIndex) => venues.map((venue, venueIndex) => ({ time, slotIndex, venue, venueIndex })))
      .filter((candidate) => !roundOccupancy[round].has(`${candidate.slotIndex}:${candidate.venueIndex}`))
      .map((candidate) => ({
        ...candidate,
        cost: (teamSlotCounts[match.home_team_id][candidate.slotIndex] + teamSlotCounts[match.away_team_id][candidate.slotIndex])
          + (teamVenueCounts[match.home_team_id][candidate.venueIndex] + teamVenueCounts[match.away_team_id][candidate.venueIndex])
          + (candidate.slotIndex * 0.001) + (candidate.venueIndex * 0.0001),
      })).sort((a, b) => a.cost - b.cost);
    const chosen = candidates[0];
    if (!chosen) return { success: false, error: `No hay suficientes horarios en las canchas configuradas para completar la jornada ${round}.` };
    assignments.push({ id: match.id, time: `${chosen.time}:00`, venue: chosen.venue });
    teamSlotCounts[match.home_team_id][chosen.slotIndex] += 1;
    teamSlotCounts[match.away_team_id][chosen.slotIndex] += 1;
    teamVenueCounts[match.home_team_id][chosen.venueIndex] += 1;
    teamVenueCounts[match.away_team_id][chosen.venueIndex] += 1;
    roundOccupancy[round].add(`${chosen.slotIndex}:${chosen.venueIndex}`);
  }

  for (const assignment of assignments) {
    const { error: updateError } = await supabase.from('matches').update({ scheduled_time: assignment.time, venue: assignment.venue }).eq('id', assignment.id).eq('status', 'SCHEDULED');
    if (updateError) return { success: false, error: 'La reorganización quedó incompleta. Intenta nuevamente.' };
  }
  for (let index = 0; index < pendingMatchdays.length; index += 1) {
    const matchday: any = pendingMatchdays[index];
    const { error: dateError } = await supabase.from('matchdays').update({ scheduled_date: calculatedDates[index] }).eq('id', matchday.id);
    if (dateError) return { success: false, error: 'Los horarios se actualizaron, pero no se pudieron completar todas las fechas.' };
  }
  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({ action: 'admin.fixture.times_reorganized', actorType: 'client', clientId, targetType: 'category', targetId: categoryId, metadata: { slug, slots, venues, dates: calculatedDates, updatedMatches: assignments.length } });
  return { success: true, updatedMatches: assignments.length };
}

function shuffleTeams<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

async function getLoyolaQualifiers(supabase: ReturnType<typeof createServerSupabaseAdminClient>, categoryId: string) {
  const { data: category, error: categoryError } = await supabase.from('categories')
    .select('sports(name), tournaments(tournament_format, fair_play_enabled, fp_starting_points)')
    .eq('id', categoryId).maybeSingle();
  if (categoryError || !category) throw new Error('No se pudo consultar el formato del torneo.');
  const tournament = Array.isArray(category.tournaments) ? category.tournaments[0] : category.tournaments;
  if (tournament?.tournament_format !== 'LOYOLA') return null;

  const { data: teams, error: teamsError } = await supabase.from('teams')
    .select('id, fair_play_points').eq('category_id', categoryId);
  if (teamsError || !teams) throw new Error('No se pudieron cargar los equipos.');

  const { data: matchdays, error: daysError } = await supabase.from('matchdays')
    .select('id').eq('category_id', categoryId).lt('round_number', 100);
  if (daysError || !matchdays?.length) throw new Error('La fase regular aún no tiene jornadas.');
  const { data: matches, error: matchesError } = await supabase.from('matches')
    .select('home_team_id, away_team_id, home_score, away_score, home_sets, away_sets, status')
    .in('matchday_id', matchdays.map((day) => day.id));
  if (matchesError || !matches) throw new Error('No se pudieron cargar los partidos de la fase regular.');
  const sport = Array.isArray(category.sports) ? category.sports[0] : category.sports;
  return selectLoyolaQualifiers(teams, matches, sport?.name, Boolean(tournament.fair_play_enabled), Number(tournament.fp_starting_points || 0));
}

async function hasLoyolaPlayoffs(supabase: ReturnType<typeof createServerSupabaseAdminClient>, categoryId: string) {
  const { count, error } = await supabase.from('matchdays').select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId).gte('round_number', 100);
  if (error) throw new Error('No se pudo verificar si ya existen cruces finales.');
  return Boolean(count);
}

async function recordLoyolaDraw(supabase: ReturnType<typeof createServerSupabaseAdminClient>, slug: string, categoryId: string, action: string, metadata: Record<string, unknown>) {
  const { error } = await supabase.from('audit_logs').insert({
    action, actor_type: 'client', client_id: await getClientIdBySlug(slug),
    target_type: 'category', target_id: categoryId, metadata: { slug, categoryId, ...metadata },
  });
  if (error) throw new Error('No se pudo registrar el movimiento en el acta del sorteo.');
}

export async function getCategoryGroupEligibility(slug: string, categoryId: string) {
  if (!(await hasAdminSession(slug)) || !(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false as const, error: 'Acceso no autorizado.' };
  try {
    const supabase = createServerSupabaseAdminClient();
    if (await hasLoyolaPlayoffs(supabase, categoryId)) {
      const { data: category } = await supabase.from('categories').select('tournaments(tournament_format)').eq('id', categoryId).maybeSingle();
      const tournament = Array.isArray(category?.tournaments) ? category.tournaments[0] : category?.tournaments;
      if (tournament?.tournament_format === 'LOYOLA') {
        const { data: teams, error } = await supabase.from('teams').select('id, group_name').eq('category_id', categoryId);
        if (error || !teams) throw new Error('No se pudieron cargar los grupos sorteados.');
        const qualifiedIds = teams.filter((team) => team.group_name === 'A' || team.group_name === 'B').map((team) => team.id);
        if (qualifiedIds.length !== 8) throw new Error('Los grupos sorteados no contienen ocho clasificados.');
        return { success: true as const, data: { qualifiedIds, eliminatedIds: teams.filter((team) => !qualifiedIds.includes(team.id)).map((team) => team.id) } };
      }
    }
    const result = await getLoyolaQualifiers(supabase, categoryId);
    return { success: true as const, data: result };
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : 'No se pudo calcular la clasificación.' };
  }
}

export async function prepareLoyolaGroupDraw(slug: string, categoryId: string): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug)) || !(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false, error: 'Acceso no autorizado.' };
  const supabase = createServerSupabaseAdminClient();
  try {
    if (await hasLoyolaPlayoffs(supabase, categoryId)) return { success: false, error: 'Ya existen cruces finales; no se puede reiniciar el sorteo.' };
    const eligibility = await getLoyolaQualifiers(supabase, categoryId);
    if (!eligibility) return { success: false, error: 'La categoría no usa el formato Loyola.' };
    const { data: before, error: beforeError } = await supabase.from('teams').select('id, group_name').eq('category_id', categoryId);
    if (beforeError || !before) return { success: false, error: 'No se pudieron consultar las asignaciones actuales.' };
    const { error } = await supabase.from('teams').update({ group_name: null })
      .eq('category_id', categoryId).in('id', [...eligibility.qualifiedIds, ...eligibility.eliminatedIds]);
    if (error) return { success: false, error: 'No se pudieron preparar los equipos para el sorteo.' };
    try {
      await recordLoyolaDraw(supabase, slug, categoryId, 'admin.loyola.draw_prepared', { qualifiedIds: eligibility.qualifiedIds, eliminatedIds: eligibility.eliminatedIds });
    } catch (auditError) {
      await Promise.all(before.map((team) => supabase.from('teams').update({ group_name: team.group_name }).eq('id', team.id)));
      throw auditError;
    }
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo preparar el sorteo.' }; }
}

export async function getLoyolaDrawHistory(slug: string, categoryId: string) {
  if (!(await hasAdminSession(slug)) || !(await categoryBelongsToClientSlug(categoryId, slug))) return { success: false as const, error: 'Acceso no autorizado.' };
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase.from('audit_logs').select('id, created_at, action, metadata')
    .eq('client_id', await getClientIdBySlug(slug)).eq('target_type', 'category').eq('target_id', categoryId)
    .in('action', ['admin.loyola.draw_prepared', 'admin.loyola.draw_assignment'])
    .order('created_at', { ascending: false }).limit(200);
  if (error) return { success: false as const, error: 'No se pudo cargar el acta del sorteo.' };
  const chronological = [...(data || [])].reverse();
  const latestStart = chronological.findLastIndex((event) => event.action === 'admin.loyola.draw_prepared');
  return { success: true as const, events: latestStart < 0 ? [] : chronological.slice(latestStart) };
}

export async function updateTeamGroup(slug: string, teamId: string, groupName: string): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  const safeGroupName = groupName.trim().toUpperCase().slice(0, 12);

  if (!(await teamBelongsToClientSlug(teamId, slug))) {
    return { success: false, error: 'El equipo no pertenece a este cliente.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { data: team, error: teamError } = await supabase.from('teams').select('category_id, group_name, categories(tournaments(tournament_format))').eq('id', teamId).maybeSingle();
  if (teamError || !team) return { success: false, error: 'No se pudo verificar el formato del torneo.' };
  const format = (team as any)?.categories?.tournaments?.tournament_format;
  if (!safeGroupName && format !== 'LOYOLA') return { success: false, error: 'Grupo inválido.' };
  if (format === 'ROUND_ROBIN_2LEG_SEMIFINALS' || format === 'THREE_STAGE_35') {
    return { success: false, error: 'Los clasificados y cruces de este formato se definen desde el panel de fases.' };
  }
  if (format === 'LOYOLA') {
    if (safeGroupName && !['A', 'B'].includes(safeGroupName)) return { success: false, error: 'Loyola utiliza solo los grupos A y B.' };
    try {
      if (await hasLoyolaPlayoffs(supabase, team.category_id)) return { success: false, error: 'Los cruces finales ya fueron creados. No se pueden cambiar los grupos.' };
      const { count: preparedCount, error: preparedError } = await supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        .eq('client_id', await getClientIdBySlug(slug)).eq('target_type', 'category').eq('target_id', team.category_id)
        .eq('action', 'admin.loyola.draw_prepared');
      if (preparedError || !preparedCount) return { success: false, error: 'Prepara primero el sorteo manual.' };
      const eligibility = await getLoyolaQualifiers(supabase, team.category_id);
      if (!eligibility?.qualifiedIds.includes(teamId)) return { success: false, error: 'El equipo no clasificó a la fase de grupos.' };
      if (eligibility.eliminatedIds.length) {
        const { data: eliminated, error: eliminatedError } = await supabase.from('teams').select('id, group_name').in('id', eligibility.eliminatedIds);
        if (eliminatedError || eliminated?.some((entry) => entry.group_name)) return { success: false, error: 'Prepara primero el sorteo manual para retirar al eliminado.' };
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo verificar la clasificación.' }; }
    if (safeGroupName && team.group_name !== safeGroupName) {
      const { count, error: countError } = await supabase.from('teams').select('id', { count: 'exact', head: true })
        .eq('category_id', team.category_id).eq('group_name', safeGroupName);
      if (countError) return { success: false, error: 'No se pudo validar el tamaño del grupo.' };
      if ((count || 0) >= 4) return { success: false, error: `El grupo ${safeGroupName} ya tiene cuatro equipos.` };
    }
  }
  const { error } = await supabase
    .from('teams')
    .update({ group_name: safeGroupName || null })
    .eq('id', teamId);

  if (error) {
    return { success: false, error: 'No se pudo actualizar el grupo.' };
  }

  const { data: namedTeam } = format === 'LOYOLA' ? await supabase.from('teams').select('name').eq('id', teamId).maybeSingle() : { data: null };
  if (format === 'LOYOLA') {
    try {
      await recordLoyolaDraw(supabase, slug, team.category_id, 'admin.loyola.draw_assignment', { teamId, teamName: namedTeam?.name, fromGroup: team.group_name, groupName: safeGroupName || null });
    } catch (auditError) {
      await supabase.from('teams').update({ group_name: team.group_name }).eq('id', teamId);
      return { success: false, error: auditError instanceof Error ? auditError.message : 'No se pudo registrar la asignación.' };
    }
  } else {
    await logAuditEvent({ action: 'admin.fixture.team_group_update', actorType: 'client', clientId: await getClientIdBySlug(slug), targetType: 'team', targetId: teamId, metadata: { slug, groupName: safeGroupName } });
  }

  return { success: true };
}

export async function randomizeCategoryGroups(
  slug: string,
  categoryId: string,
  groupCount: number,
): Promise<RandomizeGroupsResult> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  if (!(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false, error: 'La categoría no pertenece a este cliente.' };
  }

  const safeGroupCount = Math.max(2, Math.min(4, Math.floor(groupCount || 2)));
  const groupNames = ['A', 'B', 'C', 'D'].slice(0, safeGroupCount);

  const supabase = createServerSupabaseAdminClient();
  const { data: category, error: categoryError } = await supabase.from('categories').select('tournaments(tournament_format)').eq('id', categoryId).maybeSingle();
  if (categoryError || !category) return { success: false, error: 'No se pudo verificar el formato del torneo.' };
  const format = (category as any)?.tournaments?.tournament_format;
  if (format === 'ROUND_ROBIN_2LEG_SEMIFINALS' || format === 'THREE_STAGE_35') {
    return { success: false, error: 'Los clasificados y cruces de este formato se definen desde el panel de fases.' };
  }
  if (format === 'LOYOLA') return { success: false, error: 'El sorteo Loyola se realiza manualmente, equipo por equipo.' };
  const { data: categoryTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('category_id', categoryId)
    .order('name');

  if (teamsError) {
    return { success: false, error: 'No se pudieron cargar los equipos.' };
  }

  if (!categoryTeams || categoryTeams.length < safeGroupCount) {
    return { success: false, error: `Se necesitan al menos ${safeGroupCount} equipos para repartir en ${safeGroupCount} grupos.` };
  }

  const assignments = shuffleTeams(categoryTeams).map((team, index) => ({
    teamId: team.id,
    groupName: groupNames[index % safeGroupCount],
  }));

  for (const assignment of assignments) {
    const { error } = await supabase
      .from('teams')
      .update({ group_name: assignment.groupName })
      .eq('id', assignment.teamId)
      .eq('category_id', categoryId);

    if (error) {
      return { success: false, error: 'No se pudo completar la distribución de grupos.' };
    }
  }

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.fixture.groups_randomized',
    actorType: 'client',
    clientId,
    targetType: 'category',
    targetId: categoryId,
    metadata: {
      slug,
      groupCount: safeGroupCount,
      teams: assignments.length,
    },
  });

  return { success: true, assignments };
}

export async function deleteCategoryFixture(slug: string, categoryId: string): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  if (!(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false, error: 'La categoría no pertenece a este cliente.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase
    .from('matchdays')
    .delete()
    .eq('category_id', categoryId);

  if (error) {
    return { success: false, error: 'No se pudo eliminar el fixture.' };
  }

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.fixture.delete',
    actorType: 'client',
    clientId,
    targetType: 'category',
    targetId: categoryId,
    metadata: { slug },
  });

  return { success: true };
}

export async function createCategoryFixture(
  slug: string,
  categoryId: string,
  rounds: FixtureRoundInput[],
): Promise<FixtureCreateResult> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  if (!(await categoryBelongsToClientSlug(categoryId, slug))) {
    return { success: false, error: 'La categoría no pertenece a este cliente.' };
  }

  const cleanRounds = rounds
    .map((round) => ({
      roundNumber: Number(round.roundNumber),
      scheduledDate: round.scheduledDate || null,
      matches: round.matches.filter((match) => match.homeTeamId),
    }))
    .filter((round) => Number.isFinite(round.roundNumber) && round.matches.length > 0);

  if (cleanRounds.length === 0) {
    return { success: false, error: 'No hay partidos válidos para guardar.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { data: categoryTeams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('category_id', categoryId);

  if (teamsError) {
    return { success: false, error: 'No se pudieron validar los equipos.' };
  }

  const validTeamIds = new Set((categoryTeams || []).map((team) => team.id));
  for (const round of cleanRounds) {
    for (const match of round.matches) {
      if (!validTeamIds.has(match.homeTeamId) || (match.awayTeamId && !validTeamIds.has(match.awayTeamId))) {
        return { success: false, error: 'Uno o más equipos no pertenecen a esta categoría.' };
      }
    }
  }

  if (cleanRounds.some((round) => round.roundNumber >= 100)) {
    try {
      const eligibility = await getLoyolaQualifiers(supabase, categoryId);
      if (eligibility) {
        const qualified = new Set(eligibility.qualifiedIds);
        if (cleanRounds.some((round) => round.roundNumber >= 100 && round.matches.some((match) =>
          !qualified.has(match.homeTeamId) || (match.awayTeamId && !qualified.has(match.awayTeamId))))) {
          return { success: false, error: 'Un equipo eliminado no puede participar en los cruces finales.' };
        }
        const semifinals = cleanRounds.filter((round) => round.roundNumber === 100).flatMap((round) => round.matches);
        if (semifinals.length) {
          const { count: preparedCount, error: preparedError } = await supabase.from('audit_logs').select('id', { count: 'exact', head: true })
            .eq('client_id', await getClientIdBySlug(slug)).eq('target_type', 'category').eq('target_id', categoryId)
            .eq('action', 'admin.loyola.draw_prepared');
          if (preparedError || !preparedCount) return { success: false, error: 'Prepara y registra primero el sorteo manual de los grupos.' };
          const { data: assigned, error: assignedError } = await supabase.from('teams').select('id, group_name').eq('category_id', categoryId);
          if (assignedError || !assigned) return { success: false, error: 'No se pudieron validar los grupos sorteados.' };
          const byId = new Map(assigned.map((team) => [team.id, team.group_name]));
          const groupA = eligibility.qualifiedIds.filter((id) => byId.get(id) === 'A');
          const groupB = eligibility.qualifiedIds.filter((id) => byId.get(id) === 'B');
          if (groupA.length !== 4 || groupB.length !== 4 || semifinals.length !== 2) {
            return { success: false, error: 'Se requieren dos grupos de cuatro para crear las semifinales.' };
          }
          const pair = (first: string, second: string) => [first, second].sort().join(':');
          const expected = new Set([pair(groupA[0], groupB[1]), pair(groupB[0], groupA[1])]);
          if (semifinals.some((match) => !match.awayTeamId || !expected.delete(pair(match.homeTeamId, match.awayTeamId))) || expected.size) {
            return { success: false, error: 'Los cruces deben ser 1.º A contra 2.º B y 1.º B contra 2.º A.' };
          }
        }
      }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo verificar la clasificación.' }; }
  }

  let insertedMatches = 0;

  for (const round of cleanRounds) {
    const { data: matchday, error: matchdayError } = await supabase
      .from('matchdays')
      .insert({
        category_id: categoryId,
        round_number: round.roundNumber,
        scheduled_date: round.scheduledDate,
        is_open: true,
      })
      .select('id')
      .single();

    if (matchdayError || !matchday) {
      return { success: false, error: `No se pudo crear la jornada ${round.roundNumber}.` };
    }

    const matchesPayload = round.matches.map((match) => ({
      matchday_id: matchday.id,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId || null,
      scheduled_time: match.scheduledTime || null,
      venue: match.venue || null,
      status: match.status || 'SCHEDULED',
    }));

    const { error: matchesError } = await supabase
      .from('matches')
      .insert(matchesPayload);

    if (matchesError) {
      return { success: false, error: `No se pudieron crear los partidos de la jornada ${round.roundNumber}.` };
    }

    insertedMatches += matchesPayload.length;
  }

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: 'admin.fixture.create',
    actorType: 'client',
    clientId,
    targetType: 'category',
    targetId: categoryId,
    metadata: {
      slug,
      rounds: cleanRounds.length,
      insertedMatches,
      roundNumbers: cleanRounds.map((round) => round.roundNumber),
    },
  });

  return { success: true, insertedMatches };
}

export async function updateFixtureMatch(
  slug: string,
  input: FixtureMatchUpdateInput,
): Promise<FixtureActionResult> {
  if (!(await hasAdminSession(slug))) {
    return { success: false, error: 'Sesión de administrador no válida.' };
  }

  const supabase = createServerSupabaseAdminClient();
  const { data: match, error: matchFetchError } = await supabase
    .from('matches')
    .select(`
      id, status, home_score, away_score, home_sets, away_sets, home_team_id, away_team_id,
      matchdays!inner(
        id, scheduled_date, category_id,
        categories!inner(
          sports(name),
          tournaments!inner(client_id, clients!inner(slug))
        )
      )
    `)
    .eq('id', input.matchId)
    .eq('matchdays.categories.tournaments.clients.slug', slug)
    .maybeSingle();

  if (matchFetchError || !match) {
    return { success: false, error: 'El partido no pertenece a este cliente.' };
  }

  const matchday = Array.isArray(match.matchdays) ? match.matchdays[0] : match.matchdays;
  const category = Array.isArray(matchday?.categories) ? matchday.categories[0] : matchday?.categories;
  const sport = Array.isArray(category?.sports) ? category.sports[0] : category?.sports;
  const sportName = String(sport?.name || '').toUpperCase();
  const isResettingToScheduled = match.status !== 'SCHEDULED' && input.status === 'SCHEDULED';

  let finalHomeScore = input.homeScore ?? null;
  let finalAwayScore = input.awayScore ?? null;

  if (isResettingToScheduled && match.status === 'FINISHED' && match.home_team_id && match.away_team_id) {
    const oldHomeScore = match.home_score || 0;
    const oldAwayScore = match.away_score || 0;
    const oldHomeSets = match.home_sets || 0;
    const oldAwaySets = match.away_sets || 0;

    const isBasketball = sportName.includes('BALONCESTO') || sportName.includes('BASKET');
    const isVolleyball = sportName.includes('VOLEIBOL') || sportName.includes('VOLEY');
    const isFootball = sportName.includes('FUTBOL') || sportName.includes('FÚTBOL');

    let homePtsToRemove = 0;
    let awayPtsToRemove = 0;
    let hWToRemove = 0;
    let hDToRemove = 0;
    let hLToRemove = 0;
    let aWToRemove = 0;
    let aDToRemove = 0;
    let aLToRemove = 0;

    if (isFootball) {
      if (oldHomeSets > 0 || oldAwaySets > 0) {
        if (oldHomeSets > oldAwaySets) {
          hWToRemove = 1; aLToRemove = 1; homePtsToRemove = 2; awayPtsToRemove = 1;
        } else if (oldAwaySets > oldHomeSets) {
          aWToRemove = 1; hLToRemove = 1; awayPtsToRemove = 2; homePtsToRemove = 1;
        }
      } else if (oldHomeScore > oldAwayScore) {
        hWToRemove = 1; aLToRemove = 1; homePtsToRemove = 3; awayPtsToRemove = 0;
      } else if (oldAwayScore > oldHomeScore) {
        aWToRemove = 1; hLToRemove = 1; awayPtsToRemove = 3; homePtsToRemove = 0;
      } else {
        hDToRemove = 1; aDToRemove = 1; homePtsToRemove = 1; awayPtsToRemove = 1;
      }
    } else if (oldHomeScore > oldAwayScore) {
      hWToRemove = 1; aLToRemove = 1;
      if (isBasketball || isVolleyball) { homePtsToRemove = 2; awayPtsToRemove = 1; }
      else { homePtsToRemove = 3; awayPtsToRemove = 0; }
    } else if (oldAwayScore > oldHomeScore) {
      aWToRemove = 1; hLToRemove = 1;
      if (isBasketball || isVolleyball) { awayPtsToRemove = 2; homePtsToRemove = 1; }
      else { awayPtsToRemove = 3; homePtsToRemove = 0; }
    } else {
      hDToRemove = 1; aDToRemove = 1; homePtsToRemove = 1; awayPtsToRemove = 1;
    }

    const { data: homeTeamStats } = await supabase.from('teams').select('*').eq('id', match.home_team_id).single();
    const { data: awayTeamStats } = await supabase.from('teams').select('*').eq('id', match.away_team_id).single();

    if (homeTeamStats) {
      await supabase.from('teams').update({
        played: Math.max(0, (homeTeamStats.played || 0) - 1),
        won: Math.max(0, (homeTeamStats.won || 0) - hWToRemove),
        drawn: Math.max(0, (homeTeamStats.drawn || 0) - hDToRemove),
        lost: Math.max(0, (homeTeamStats.lost || 0) - hLToRemove),
        goals_for: Math.max(0, (homeTeamStats.goals_for || 0) - oldHomeScore),
        goals_against: Math.max(0, (homeTeamStats.goals_against || 0) - oldAwayScore),
        points: Math.max(0, (homeTeamStats.points || 0) - homePtsToRemove),
      }).eq('id', match.home_team_id);
    }

    if (awayTeamStats) {
      await supabase.from('teams').update({
        played: Math.max(0, (awayTeamStats.played || 0) - 1),
        won: Math.max(0, (awayTeamStats.won || 0) - aWToRemove),
        drawn: Math.max(0, (awayTeamStats.drawn || 0) - aDToRemove),
        lost: Math.max(0, (awayTeamStats.lost || 0) - aLToRemove),
        goals_for: Math.max(0, (awayTeamStats.goals_for || 0) - oldAwayScore),
        goals_against: Math.max(0, (awayTeamStats.goals_against || 0) - oldHomeScore),
        points: Math.max(0, (awayTeamStats.points || 0) - awayPtsToRemove),
      }).eq('id', match.away_team_id);
    }

    const { error: resetEventsError } = await supabase.from('match_events').delete().eq('match_id', match.id);
    if (resetEventsError) return { success: false, error: 'No se pudo restablecer el partido porque sus eventos no fueron eliminados.' };
    finalHomeScore = null;
    finalAwayScore = null;
  }

  const updatePayload: Record<string, string | number | boolean | null> = {
    scheduled_time: input.scheduledTime || null,
    venue: input.venue || null,
    home_score: finalHomeScore,
    away_score: finalAwayScore,
    status: input.status,
  };

  if (isResettingToScheduled) {
    updatePayload.current_period = '1T';
    updatePayload.home_sets = null;
    updatePayload.away_sets = null;
    updatePayload.is_timer_running = false;
    updatePayload.timer_start_time = null;
    updatePayload.timer_accumulated_seconds = 0;
    updatePayload.match_phase = 'REGULAR';
  }

  const { error: updateMatchError } = await supabase
    .from('matches')
    .update(updatePayload)
    .eq('id', match.id);

  if (updateMatchError) {
    return { success: false, error: 'No se pudo actualizar el partido.' };
  }

  if (matchday?.id && (input.scheduledDate || null) !== (matchday.scheduled_date || null)) {
    await supabase
      .from('matchdays')
      .update({ scheduled_date: input.scheduledDate || null })
      .eq('id', matchday.id);
  }

  const clientId = await getClientIdBySlug(slug);
  await logAuditEvent({
    action: isResettingToScheduled ? 'admin.fixture.match_reset' : 'admin.fixture.match_update',
    actorType: 'client',
    clientId,
    targetType: 'match',
    targetId: match.id,
    metadata: {
      slug,
      categoryId: matchday?.category_id,
      status: input.status,
      resetToScheduled: isResettingToScheduled,
    },
  });

  return { success: true };
}

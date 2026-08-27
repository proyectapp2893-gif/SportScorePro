'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { calculateTournamentReadiness } from './readiness';
import type { OperationsAlert, OperationsMatch, ReadinessCheck, TournamentOperationsData } from './types';

type Result = { success: true; data: TournamentOperationsData } | { success: false; error: string };
type MatchRow = { id: string; status: string; scheduled_time: string | null; venue: string | null; home_score: number | null; away_score: number | null; matchdays: { round_number: number | null; category_id: string; categories: { name: string } | null } | null; home_team: { name: string } | null; away_team: { name: string } | null };

const countOf = (result: { count?: number | null }) => result.count ?? 0;

export async function getTournamentOperations(slug: string, tournamentId: string, localDate: string): Promise<Result> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Institución no encontrada.' };

  const supabase = createServerSupabaseAdminClient();
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, name, is_active, fixture_visible_to_delegates, schedule_dates, schedule_time_slots, available_venues')
    .eq('id', tournamentId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (tournamentError || !tournament) return { success: false, error: 'El torneo no pertenece a esta institución.' };

  const { data: categories, error: categoriesError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('tournament_id', tournamentId);
  if (categoriesError) return { success: false, error: 'No fue posible consultar las categorías.' };
  const categoryIds = (categories || []).map((category) => category.id);

  if (!categoryIds.length) {
    const checks: ReadinessCheck[] = [
      { id: 'configured', label: 'Torneo configurado', detail: 'Faltan categorías operativas.', status: 'warning', weight: 15, href: `/${slug}/admin/torneo/${tournamentId}` },
      { id: 'teams', label: 'Equipos registrados', detail: 'Aún no hay categorías ni equipos.', status: 'incomplete', weight: 15, href: `/${slug}/admin/inscripcion?tournament=${tournamentId}` },
      { id: 'players', label: 'Jugadores inscritos', detail: 'Aún no hay jugadores.', status: 'incomplete', weight: 15, href: `/${slug}/admin/inscripcion?tournament=${tournamentId}` },
      { id: 'delegates', label: 'Delegados configurados', detail: 'No hay equipos para asignar.', status: 'incomplete', weight: 10, href: `/${slug}/admin/delegados?tournament=${tournamentId}` },
      { id: 'fixture', label: 'Fixture generado', detail: 'No existen partidos.', status: 'incomplete', weight: 20, href: `/${slug}/admin/grupos?tournament=${tournamentId}` },
      { id: 'published', label: 'Fixture publicado', detail: 'El fixture está oculto.', status: 'incomplete', weight: 10, href: `/${slug}/admin/grupos?tournament=${tournamentId}` },
      { id: 'schedule', label: 'Canchas y horarios', detail: 'Configuración incompleta.', status: 'incomplete', weight: 10, href: `/${slug}/admin/torneo/${tournamentId}` },
      { id: 'documents', label: 'Documentación validada', detail: 'No hay jugadores para validar.', status: 'incomplete', weight: 5, href: `/${slug}/admin/inscripcion?tournament=${tournamentId}` },
    ];
    return { success: true, data: { kpis: { teams: 0, players: 0, matches: 0, today: 0, live: 0, pending: 0, pendingDocuments: 0, activeSanctions: 0 }, checks, readiness: calculateTournamentReadiness(checks), alerts: [{ id: 'no-categories', title: 'Torneo sin categorías', description: 'Configura al menos una categoría para iniciar la operación.', priority: 'warning', href: `/${slug}/admin/torneo/${tournamentId}`, actionLabel: 'Configurar' }], todayMatches: [] } };
  }

  const baseMatchSelect = 'id, status, scheduled_time, venue, home_score, away_score, matchdays!inner(round_number, scheduled_date, category_id, categories!inner(name, tournament_id)), home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)';
  const [teams, players, matches, today, live, pending, pendingDocuments, rejectedDocuments, allDocuments, approvedDocuments, activeSanctions, delegateAssignments, todayRows] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).in('category_id', categoryIds),
    supabase.from('players').select('id, teams!inner(category_id)', { count: 'exact', head: true }).in('teams.category_id', categoryIds),
    supabase.from('matches').select('id, matchdays!inner(category_id)', { count: 'exact', head: true }).in('matchdays.category_id', categoryIds).neq('status', 'BYE'),
    supabase.from('matches').select('id, matchdays!inner(category_id, scheduled_date)', { count: 'exact', head: true }).in('matchdays.category_id', categoryIds).eq('matchdays.scheduled_date', localDate).neq('status', 'BYE'),
    supabase.from('matches').select('id, matchdays!inner(category_id)', { count: 'exact', head: true }).in('matchdays.category_id', categoryIds).eq('status', 'LIVE'),
    supabase.from('matches').select('id, matchdays!inner(category_id)', { count: 'exact', head: true }).in('matchdays.category_id', categoryIds).eq('status', 'SCHEDULED'),
    supabase.from('player_documents').select('id, players!inner(teams!inner(category_id))', { count: 'exact', head: true }).in('players.teams.category_id', categoryIds).eq('status', 'PENDING'),
    supabase.from('player_documents').select('id, players!inner(teams!inner(category_id))', { count: 'exact', head: true }).in('players.teams.category_id', categoryIds).eq('status', 'REJECTED'),
    supabase.from('player_documents').select('id, players!inner(teams!inner(category_id))', { count: 'exact', head: true }).in('players.teams.category_id', categoryIds),
    supabase.from('player_documents').select('id, players!inner(teams!inner(category_id))', { count: 'exact', head: true }).in('players.teams.category_id', categoryIds).eq('status', 'APPROVED'),
    supabase.from('match_events').select('id, matches!inner(matchdays!inner(category_id))', { count: 'exact', head: true }).in('matches.matchdays.category_id', categoryIds).eq('fine_status', 'UNPAID'),
    supabase.from('delegate_team_access').select('id, teams!inner(category_id)', { count: 'exact', head: true }).in('teams.category_id', categoryIds),
    supabase.from('matches').select(baseMatchSelect).in('matchdays.category_id', categoryIds).eq('matchdays.scheduled_date', localDate).neq('status', 'BYE').order('scheduled_time', { ascending: true }).limit(8),
  ]);

  const kpis = {
    teams: countOf(teams), players: countOf(players), matches: countOf(matches), today: countOf(today), live: countOf(live), pending: countOf(pending),
    pendingDocuments: countOf(pendingDocuments) + countOf(rejectedDocuments), activeSanctions: countOf(activeSanctions),
  };
  const fixturePublished = Boolean(tournament.fixture_visible_to_delegates);
  const hasSchedule = Array.isArray(tournament.schedule_dates) && tournament.schedule_dates.length > 0 && Array.isArray(tournament.schedule_time_slots) && tournament.schedule_time_slots.length > 0 && Array.isArray(tournament.available_venues) && tournament.available_venues.length > 0;
  const expectedRequiredDocuments = kpis.players * 2;
  const documentsComplete = kpis.players > 0 && countOf(approvedDocuments) >= expectedRequiredDocuments && kpis.pendingDocuments === 0;

  const withTournament = (path: string) => `${path}${path.includes('?') ? '&' : '?'}tournament=${tournamentId}`;
  const primaryCategory = categoryIds[0];
  const categoryPath = (path: string) => withTournament(`/${slug}/admin/${path}?cat=${primaryCategory}`);
  const checks: ReadinessCheck[] = [
    { id: 'configured', label: 'Torneo configurado', detail: `${categoryIds.length} categoría${categoryIds.length === 1 ? '' : 's'} configurada${categoryIds.length === 1 ? '' : 's'}.`, status: 'complete', weight: 15, href: `/${slug}/admin/torneo/${tournamentId}` },
    { id: 'teams', label: 'Equipos registrados', detail: kpis.teams ? `${kpis.teams} equipos listos.` : 'No hay equipos registrados.', status: kpis.teams ? 'complete' : 'incomplete', weight: 15, href: categoryPath('inscripcion') },
    { id: 'players', label: 'Jugadores inscritos', detail: kpis.players ? `${kpis.players} jugadores inscritos.` : 'No hay jugadores inscritos.', status: kpis.players ? 'complete' : 'incomplete', weight: 15, href: categoryPath('inscripcion') },
    { id: 'delegates', label: 'Delegados configurados', detail: countOf(delegateAssignments) ? `${countOf(delegateAssignments)} asignaciones de equipo.` : 'No hay delegados asignados a equipos.', status: countOf(delegateAssignments) ? 'complete' : 'incomplete', weight: 10, href: withTournament(`/${slug}/admin/delegados`) },
    { id: 'fixture', label: 'Fixture generado', detail: kpis.matches ? `${kpis.matches} partidos creados.` : 'No existen partidos.', status: kpis.matches ? 'complete' : 'incomplete', weight: 20, href: categoryPath('grupos') },
    { id: 'published', label: 'Fixture publicado', detail: fixturePublished ? 'Visible para delegados.' : 'Oculto para delegados.', status: fixturePublished ? 'complete' : kpis.matches ? 'warning' : 'incomplete', weight: 10, href: categoryPath('grupos') },
    { id: 'schedule', label: 'Canchas y horarios', detail: hasSchedule ? 'Fechas, horarios y canchas configurados.' : 'Configuración de programación incompleta.', status: hasSchedule ? 'complete' : 'incomplete', weight: 10, href: `/${slug}/admin/torneo/${tournamentId}` },
    { id: 'documents', label: 'Documentación validada', detail: documentsComplete ? 'Documentación obligatoria aprobada.' : countOf(allDocuments) ? `${kpis.pendingDocuments} documentos requieren atención.` : 'No hay documentos cargados.', status: documentsComplete ? 'complete' : countOf(allDocuments) ? 'warning' : 'incomplete', weight: 5, href: categoryPath('inscripcion') },
  ];

  const alerts: OperationsAlert[] = [];
  if (countOf(rejectedDocuments)) alerts.push({ id: 'rejected-docs', title: 'Documentos rechazados', description: 'Los delegados deben corregir archivos rechazados.', count: countOf(rejectedDocuments), priority: 'critical', href: categoryPath('inscripcion'), actionLabel: 'Revisar' });
  if (countOf(pendingDocuments)) alerts.push({ id: 'pending-docs', title: 'Documentos por revisar', description: 'Hay documentos cargados pendientes de validación.', count: countOf(pendingDocuments), priority: 'warning', href: categoryPath('inscripcion'), actionLabel: 'Validar' });
  if (kpis.activeSanctions) alerts.push({ id: 'sanctions', title: 'Sanciones activas', description: 'Existen multas disciplinarias pendientes de pago.', count: kpis.activeSanctions, priority: 'warning', href: withTournament(`/${slug}/admin/tribunal`), actionLabel: 'Abrir tribunal' });
  if (kpis.matches && !fixturePublished) alerts.push({ id: 'fixture-hidden', title: 'Fixture pendiente de publicación', description: 'Los partidos permanecen ocultos para los delegados.', priority: 'info', href: categoryPath('grupos'), actionLabel: 'Gestionar fixture' });
  if (!alerts.length) alerts.push({ id: 'all-clear', title: 'Operación al día', description: 'No se detectaron pendientes con las reglas actuales.', priority: 'success', href: `/${slug}/admin?tournament=${tournamentId}`, actionLabel: 'Ver resumen' });

  const todayMatches: OperationsMatch[] = ((todayRows.data || []) as unknown as MatchRow[]).map((match) => ({
    id: match.id, status: match.status, scheduledTime: match.scheduled_time, venue: match.venue, roundNumber: match.matchdays?.round_number ?? null,
    categoryId: match.matchdays?.category_id || primaryCategory, categoryName: match.matchdays?.categories?.name || '', homeTeam: match.home_team?.name || 'Por definir', awayTeam: match.away_team?.name || 'Por definir', homeScore: match.home_score, awayScore: match.away_score, href: `/${slug}/admin/mesa?cat=${match.matchdays?.category_id || primaryCategory}&tournament=${tournamentId}`,
  }));
  return { success: true, data: { kpis, checks, readiness: calculateTournamentReadiness(checks), alerts, todayMatches } };
}

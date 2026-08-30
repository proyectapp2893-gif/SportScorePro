'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { combineMetrics, metricFromCount, metricValue } from './query-results';
import { calculateTournamentReadiness } from './readiness';
import { adminCategoryModulePath, adminDashboardPath, adminTournamentModulePath } from './routes';
import { getFixturePublicationState } from '@/app/lib/tournaments/publication';
import type { OperationsAlert, OperationsMatch, ReadinessCheck, TournamentOperationsData } from './types';

type Result = { success: true; data: TournamentOperationsData } | { success: false; error: string };
type MatchRow = { id: string; status: string; scheduled_time: string | null; venue: string | null; home_score: number | null; away_score: number | null; matchdays: { round_number: number | null; category_id: string; categories: { name: string } | null } | null; home_team: { name: string } | null; away_team: { name: string } | null };

export async function getTournamentOperations(slug: string, tournamentId: string, localDate: string): Promise<Result> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Institución no encontrada.' };
  const supabase = createServerSupabaseAdminClient();
  // `fixture_visible_to_public` was added by a pending security migration. Keep
  // the dashboard readable against older schemas (including production before
  // that migration is approved) without weakening the tenant filter.
  const tournamentQuery = () => supabase.from('tournaments').select('id, name, is_active, fixture_visible_to_delegates, fixture_visible_to_public, schedule_dates, schedule_time_slots, available_venues').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  // Categories do not depend on the tournament row response, so start both
  // requests together and avoid an avoidable round trip on the dashboard's
  // critical path. The category query remains tenant-scoped by tournamentId.
  const [{ data: initialTournament, error: initialTournamentError }, categoriesResult] = await Promise.all([
    tournamentQuery(),
    supabase.from('categories').select('id, name').eq('tournament_id', tournamentId),
  ]);
  let tournament = initialTournament;
  let tournamentError = initialTournamentError;
  if (tournamentError && (tournamentError.code === 'PGRST204' || /fixture_visible_to_public|column .* does not exist/i.test(tournamentError.message || ''))) {
    const legacy = await supabase.from('tournaments').select('id, name, is_active, fixture_visible_to_delegates, schedule_dates, schedule_time_slots, available_venues').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
    tournament = legacy.data ? { ...legacy.data, fixture_visible_to_public: undefined } : null;
    tournamentError = legacy.error;
  }
  if (tournamentError) return { success: false, error: 'No fue posible cargar el torneo. Intenta nuevamente.' };
  if (!tournament) return { success: false, error: 'El torneo no pertenece a esta institución.' };
  const { data: categories, error: categoriesError } = categoriesResult;
  if (categoriesError) return { success: false, error: 'No fue posible consultar las categorías.' };
  const categoryIds = (categories || []).map((category) => category.id);
  const tournamentModule = (module: string) => adminTournamentModulePath(slug, module, tournamentId);

  if (!categoryIds.length) {
    const zero = { value: 0, error: null } as const;
    const checks: ReadinessCheck[] = [
      { id: 'configured', label: 'Torneo configurado', detail: 'Faltan categorías operativas.', status: 'warning', weight: 15, href: `/${slug}/admin/torneo/${tournamentId}` },
      { id: 'teams', label: 'Equipos registrados', detail: 'Aún no hay categorías ni equipos.', status: 'incomplete', weight: 15, href: tournamentModule('inscripcion') },
      { id: 'players', label: 'Jugadores inscritos', detail: 'Aún no hay jugadores.', status: 'incomplete', weight: 15, href: tournamentModule('inscripcion') },
      { id: 'delegates', label: 'Delegados configurados', detail: 'No hay equipos para asignar.', status: 'incomplete', weight: 10, href: tournamentModule('delegados') },
      { id: 'fixture', label: 'Fixture generado', detail: 'No existen partidos.', status: 'incomplete', weight: 20, href: tournamentModule('grupos') },
      { id: 'published', label: 'Fixture publicado', detail: 'El fixture está oculto.', status: 'incomplete', weight: 10, href: tournamentModule('grupos') },
      { id: 'schedule', label: 'Canchas y horarios', detail: 'Configuración incompleta.', status: 'incomplete', weight: 10, href: `/${slug}/admin/torneo/${tournamentId}` },
      { id: 'documents', label: 'Documentación validada', detail: 'No hay jugadores para validar.', status: 'incomplete', weight: 5, href: tournamentModule('inscripcion') },
    ];
    return { success: true, data: { kpis: { teams: zero, players: zero, matches: zero, today: zero, live: zero, pending: zero, pendingDocuments: zero, activeSanctions: zero }, checks, readiness: calculateTournamentReadiness(checks), alerts: [{ id: 'no-categories', title: 'Torneo sin categorías', description: 'Configura al menos una categoría para iniciar la operación.', priority: 'warning', href: `/${slug}/admin/torneo/${tournamentId}`, actionLabel: 'Configurar' }], todayMatches: [], agendaError: null, publication: { delegates: Boolean(tournament.fixture_visible_to_delegates), public: Boolean(tournament.fixture_visible_to_public), state: getFixturePublicationState(tournament.fixture_visible_to_delegates, tournament.fixture_visible_to_public) } } };
  }

  const baseMatchSelect = 'id, status, scheduled_time, venue, home_score, away_score, matchdays!inner(round_number, scheduled_date, category_id, categories!inner(name, tournament_id)), home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)';
  const results = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).in('category_id', categoryIds),
    supabase.from('players').select('id, teams!inner(category_id)', { count: 'exact', head: true }).in('teams.category_id', categoryIds),
    // Keep this query at team granularity so readiness measures roster
    // coverage (teams with at least one player), not merely total players.
    supabase.from('teams').select('id, players(id)').in('category_id', categoryIds),
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
  const [teamsResult, playersResult, teamRosterResult, matchesResult, todayResult, liveResult, pendingResult, pendingDocumentsResult, rejectedDocumentsResult, allDocumentsResult, approvedDocumentsResult, sanctionsResult, delegatesResult, agendaResult] = results;
  const pendingDocumentMetric = metricFromCount(pendingDocumentsResult, 'documentos pendientes');
  const rejectedDocumentMetric = metricFromCount(rejectedDocumentsResult, 'documentos rechazados');
  const kpis = {
    teams: metricFromCount(teamsResult, 'equipos'), players: metricFromCount(playersResult, 'jugadores'), matches: metricFromCount(matchesResult, 'partidos'), today: metricFromCount(todayResult, 'partidos de hoy'), live: metricFromCount(liveResult, 'partidos en vivo'), pending: metricFromCount(pendingResult, 'partidos pendientes'),
    pendingDocuments: combineMetrics([pendingDocumentMetric, rejectedDocumentMetric], 'documentos pendientes'), activeSanctions: metricFromCount(sanctionsResult, 'sanciones activas'),
  };
  const allDocuments = metricFromCount(allDocumentsResult, 'documentos');
  const approvedDocuments = metricFromCount(approvedDocumentsResult, 'documentos aprobados');
  const delegateAssignments = metricFromCount(delegatesResult, 'delegados configurados');
  const rosterTeams = teamRosterResult.error ? null : ((teamRosterResult.data || []) as Array<{ id: string; players?: Array<{ id: string }> | null }>);
  const teamsWithPlayers = rosterTeams === null ? null : rosterTeams.filter((team) => (team.players || []).length > 0).length;
  const values = { teams: metricValue(kpis.teams), players: metricValue(kpis.players), teamsWithPlayers, matches: metricValue(kpis.matches), pendingDocuments: metricValue(kpis.pendingDocuments), sanctions: metricValue(kpis.activeSanctions), allDocuments: metricValue(allDocuments), approvedDocuments: metricValue(approvedDocuments), delegates: metricValue(delegateAssignments) };
  const fixturePublished = Boolean(tournament.fixture_visible_to_delegates);
  const hasSchedule = Array.isArray(tournament.schedule_dates) && tournament.schedule_dates.length > 0 && Array.isArray(tournament.schedule_time_slots) && tournament.schedule_time_slots.length > 0 && Array.isArray(tournament.available_venues) && tournament.available_venues.length > 0;
  // Existing roster and Mesa rules require FACE_PHOTO + IDENTITY_FRONT: two required documents per player.
  const documentsComplete = values.players !== null && values.players > 0 && values.approvedDocuments !== null && values.approvedDocuments >= values.players * 2 && values.pendingDocuments === 0;
  const primaryCategory = categoryIds[0];
  const categoryModule = (module: string) => adminCategoryModulePath(slug, module, tournamentId, primaryCategory);
  const statusFromMetric = (value: number | null) => value === null ? 'warning' as const : value > 0 ? 'complete' as const : 'incomplete' as const;
  const detailFromMetric = (value: number | null, populated: string, empty: string) => value === null ? 'No fue posible verificar este criterio.' : value > 0 ? populated : empty;
  const checks: ReadinessCheck[] = [
    { id: 'configured', label: 'Torneo configurado', detail: `${categoryIds.length} categoría${categoryIds.length === 1 ? '' : 's'} configurada${categoryIds.length === 1 ? '' : 's'}.`, status: 'complete', weight: 15, href: `/${slug}/admin/torneo/${tournamentId}` },
    { id: 'teams', label: 'Equipos registrados', detail: detailFromMetric(values.teams, `${values.teams} equipos listos.`, 'No hay equipos registrados.'), status: statusFromMetric(values.teams), weight: 15, href: categoryModule('inscripcion') },
    { id: 'players', label: 'Jugadores inscritos', detail: values.players === null || values.teams === null || values.teamsWithPlayers === null ? 'No fue posible verificar la cobertura de rosters.' : values.players === 0 ? 'No hay jugadores inscritos.' : `${values.players} jugadores en ${values.teamsWithPlayers} de ${values.teams} equipos.`, status: values.players === null || values.teamsWithPlayers === null ? 'warning' : values.players > 0 && values.teams !== null && values.teamsWithPlayers >= values.teams ? 'complete' : 'warning', weight: 15, href: categoryModule('inscripcion') },
    { id: 'delegates', label: 'Delegados configurados', detail: detailFromMetric(values.delegates, `${values.delegates} asignaciones de equipo.`, 'No hay delegados asignados a equipos.'), status: statusFromMetric(values.delegates), weight: 10, href: tournamentModule('delegados') },
    { id: 'fixture', label: 'Fixture generado', detail: detailFromMetric(values.matches, `${values.matches} partidos creados.`, 'No existen partidos.'), status: statusFromMetric(values.matches), weight: 20, href: categoryModule('grupos') },
    { id: 'published', label: 'Fixture publicado', detail: fixturePublished ? 'Visible para delegados.' : 'Oculto para delegados.', status: fixturePublished ? 'complete' : values.matches ? 'warning' : 'incomplete', weight: 10, href: categoryModule('grupos') },
    { id: 'schedule', label: 'Canchas y horarios', detail: hasSchedule ? 'Fechas, horarios y canchas configurados.' : 'Configuración de programación incompleta.', status: hasSchedule ? 'complete' : 'incomplete', weight: 10, href: `/${slug}/admin/torneo/${tournamentId}` },
    { id: 'documents', label: 'Documentación validada', detail: documentsComplete ? 'Documentación obligatoria aprobada.' : values.allDocuments === null || values.pendingDocuments === null ? 'No fue posible verificar la documentación.' : values.allDocuments > 0 ? `${values.pendingDocuments} documentos requieren atención.` : 'No hay documentos cargados.', status: documentsComplete ? 'complete' : values.allDocuments === null || values.pendingDocuments === null ? 'warning' : values.allDocuments > 0 ? 'warning' : 'incomplete', weight: 5, href: categoryModule('inscripcion') },
  ];
  const alerts: OperationsAlert[] = [];
  const rejectedDocuments = metricValue(rejectedDocumentMetric);
  const pendingDocuments = metricValue(pendingDocumentMetric);
  if (rejectedDocuments) alerts.push({ id: 'rejected-docs', title: 'Documentos rechazados', description: 'Los delegados deben corregir archivos rechazados.', count: rejectedDocuments, priority: 'critical', href: categoryModule('inscripcion'), actionLabel: 'Revisar' });
  if (pendingDocuments) alerts.push({ id: 'pending-docs', title: 'Documentos por revisar', description: 'Hay documentos cargados pendientes de validación.', count: pendingDocuments, priority: 'warning', href: categoryModule('inscripcion'), actionLabel: 'Validar' });
  if (values.sanctions) alerts.push({ id: 'sanctions', title: 'Sanciones activas', description: 'Existen multas disciplinarias pendientes de pago.', count: values.sanctions, priority: 'warning', href: tournamentModule('tribunal'), actionLabel: 'Abrir tribunal' });
  if (values.matches && !fixturePublished) alerts.push({ id: 'fixture-hidden', title: 'Fixture pendiente de publicación', description: 'Los partidos permanecen ocultos para los delegados.', priority: 'info', href: categoryModule('grupos'), actionLabel: 'Gestionar fixture' });
  const hasUnknownAttention = [pendingDocuments, rejectedDocuments, values.sanctions].some((value) => value === null);
  if (!alerts.length && !hasUnknownAttention) alerts.push({ id: 'all-clear', title: 'Operación al día', description: 'No se detectaron pendientes con las reglas actuales.', priority: 'success', href: adminDashboardPath(slug, tournamentId), actionLabel: 'Ver resumen' });
  const agendaError = agendaResult.error ? 'No fue posible cargar la agenda de hoy.' : null;
  const todayMatches: OperationsMatch[] = agendaError ? [] : ((agendaResult.data || []) as unknown as MatchRow[]).map((match) => ({ id: match.id, status: match.status, scheduledTime: match.scheduled_time, venue: match.venue, roundNumber: match.matchdays?.round_number ?? null, categoryId: match.matchdays?.category_id || primaryCategory, categoryName: match.matchdays?.categories?.name || '', homeTeam: match.home_team?.name || 'Por definir', awayTeam: match.away_team?.name || 'Por definir', homeScore: match.home_score, awayScore: match.away_score, href: adminCategoryModulePath(slug, 'mesa', tournamentId, match.matchdays?.category_id || primaryCategory) }));
  return { success: true, data: { kpis, checks, readiness: calculateTournamentReadiness(checks), alerts, todayMatches, agendaError, publication: { delegates: Boolean(tournament.fixture_visible_to_delegates), public: Boolean(tournament.fixture_visible_to_public), state: getFixturePublicationState(tournament.fixture_visible_to_delegates, tournament.fixture_visible_to_public) } } };
}

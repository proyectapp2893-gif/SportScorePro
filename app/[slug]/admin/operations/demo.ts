'use client';

import { loadDemoDatabase } from '@/app/lib/demo/database';
import { calculateTournamentReadiness } from './readiness';
import { adminCategoryModulePath, adminDashboardPath } from './routes';
import { getFixturePublicationState } from '@/app/lib/tournaments/publication';
import type { OperationsAlert, ReadinessCheck, TournamentOperationsData } from './types';

export function getDemoTournamentOperations(tournamentId: string, localDate: string, slug: string): TournamentOperationsData {
  const db = loadDemoDatabase();
  const tournament = db.tournaments.find((row) => row.id === tournamentId) || db.tournaments[0];
  const categories = db.categories.filter((row) => row.tournament_id === tournament?.id);
  const categoryIds = categories.map((row) => row.id);
  const teams = db.teams.filter((row) => categoryIds.includes(row.category_id));
  const teamIds = teams.map((row) => row.id);
  const players = db.players.filter((row) => teamIds.includes(row.team_id));
  const teamsWithPlayers = teams.filter((team) => players.some((player) => player.team_id === team.id)).length;
  const playerIds = players.map((row) => row.id);
  const matchdays = db.matchdays.filter((row) => categoryIds.includes(row.category_id));
  const matchdayIds = matchdays.map((row) => row.id);
  const matches = db.matches.filter((row) => matchdayIds.includes(row.matchday_id) && row.status !== 'BYE');
  const documents = db.player_documents.filter((row) => playerIds.includes(row.player_id));
  const sanctions = db.match_events.filter((row) => matches.some((match) => match.id === row.match_id) && row.fine_status === 'UNPAID');
  const pendingDocuments = documents.filter((row) => row.status === 'PENDING').length;
  const rejectedDocuments = documents.filter((row) => row.status === 'REJECTED').length;
  const todayMatches = matches.filter((match) => match.matchdays?.scheduled_date === localDate).slice(0, 8).map((match) => ({
    id: match.id, status: match.status, scheduledTime: match.scheduled_time || null, venue: match.venue || null, roundNumber: match.matchdays?.round_number ?? null,
    categoryId: match.matchdays?.category_id || categories[0]?.id || '', categoryName: categories.find((row) => row.id === match.matchdays?.category_id)?.name || '', homeTeam: match.home_team?.name || 'Por definir', awayTeam: match.away_team?.name || 'Por definir', homeScore: match.home_score ?? null, awayScore: match.away_score ?? null, href: adminCategoryModulePath(slug, 'mesa', String(tournament?.id || tournamentId), String(match.matchdays?.category_id || categories[0]?.id || '')),
  }));
  const metric = (value: number) => ({ value, error: null } as const);
  const kpis = { teams: metric(teams.length), players: metric(players.length), matches: metric(matches.length), today: metric(todayMatches.length), live: metric(matches.filter((row) => row.status === 'LIVE').length), pending: metric(matches.filter((row) => row.status === 'SCHEDULED').length), pendingDocuments: metric(pendingDocuments + rejectedDocuments), activeSanctions: metric(sanctions.length) };
  const query = `?cat=${categories[0]?.id || ''}&tournament=${tournament?.id || tournamentId}`;
  const tournamentQuery = `?tournament=${tournament?.id || tournamentId}`;
  const published = Boolean(tournament?.fixture_visible_to_delegates);
  const hasSchedule = Boolean(tournament?.schedule_dates?.length && tournament?.schedule_time_slots?.length && tournament?.available_venues?.length);
  const delegateAssignments = db.delegate_team_access.filter((row) => teamIds.includes(row.team_id)).length;
  const documentsComplete = players.length > 0 && documents.filter((row) => row.status === 'APPROVED').length >= players.length * 2 && kpis.pendingDocuments.value === 0;
  const checks: ReadinessCheck[] = [
    { id: 'configured', label: 'Torneo configurado', detail: `${categories.length} categorías configuradas.`, status: categories.length ? 'complete' : 'incomplete', weight: 15, href: `/${slug}/admin/torneo/${tournament?.id}` },
    { id: 'teams', label: 'Equipos registrados', detail: `${teams.length} equipos registrados.`, status: teams.length ? 'complete' : 'incomplete', weight: 15, href: `/${slug}/admin/inscripcion${query}` },
    { id: 'players', label: 'Jugadores inscritos', detail: players.length ? `${players.length} jugadores en ${teamsWithPlayers} de ${teams.length} equipos.` : 'No hay jugadores inscritos.', status: players.length && teamsWithPlayers >= teams.length ? 'complete' : players.length ? 'warning' : 'incomplete', weight: 15, href: `/${slug}/admin/inscripcion${query}` },
    { id: 'delegates', label: 'Delegados configurados', detail: `${delegateAssignments} asignaciones de equipo.`, status: delegateAssignments ? 'complete' : 'incomplete', weight: 10, href: `/${slug}/admin/delegados${tournamentQuery}` },
    { id: 'fixture', label: 'Fixture generado', detail: `${matches.length} partidos creados.`, status: matches.length ? 'complete' : 'incomplete', weight: 20, href: `/${slug}/admin/grupos${query}` },
    { id: 'published', label: 'Fixture publicado', detail: published ? 'Visible para delegados.' : 'Oculto para delegados.', status: published ? 'complete' : matches.length ? 'warning' : 'incomplete', weight: 10, href: `/${slug}/admin/grupos${query}` },
    { id: 'schedule', label: 'Canchas y horarios', detail: hasSchedule ? 'Programación configurada.' : 'Configuración incompleta.', status: hasSchedule ? 'complete' : 'incomplete', weight: 10, href: `/${slug}/admin/torneo/${tournament?.id}` },
    { id: 'documents', label: 'Documentación validada', detail: documentsComplete ? 'Documentación aprobada.' : documents.length ? `${kpis.pendingDocuments.value} documentos requieren atención.` : 'No hay documentos cargados.', status: documentsComplete ? 'complete' : documents.length ? 'warning' : 'incomplete', weight: 5, href: `/${slug}/admin/inscripcion${query}` },
  ];
  const alerts: OperationsAlert[] = [];
  if (rejectedDocuments) alerts.push({ id: 'rejected-docs', title: 'Documentos rechazados', description: 'Los delegados deben corregir archivos rechazados.', count: rejectedDocuments, priority: 'critical', href: `/${slug}/admin/inscripcion${query}`, actionLabel: 'Revisar' });
  if (pendingDocuments) alerts.push({ id: 'pending-docs', title: 'Documentos por revisar', description: 'Hay documentos pendientes de validación.', count: pendingDocuments, priority: 'warning', href: `/${slug}/admin/inscripcion${query}`, actionLabel: 'Validar' });
  if (sanctions.length) alerts.push({ id: 'sanctions', title: 'Sanciones activas', description: 'Existen multas disciplinarias pendientes.', count: sanctions.length, priority: 'warning', href: `/${slug}/admin/tribunal${tournamentQuery}`, actionLabel: 'Abrir tribunal' });
  if (matches.length && !published) alerts.push({ id: 'fixture-hidden', title: 'Fixture pendiente de publicación', description: 'Los partidos están ocultos para delegados.', priority: 'info', href: `/${slug}/admin/grupos${query}`, actionLabel: 'Gestionar fixture' });
  if (!alerts.length && !categories.length) alerts.push({ id: 'no-categories', title: 'Torneo sin categorías', description: 'Configura al menos una categoría para iniciar la operación.', priority: 'warning', href: `/${slug}/admin/torneo/${tournament?.id || tournamentId}`, actionLabel: 'Configurar' });
  if (!alerts.length) alerts.push({ id: 'all-clear', title: 'Operación al día', description: 'No se detectaron pendientes con las reglas actuales.', priority: 'success', href: adminDashboardPath(slug, String(tournament?.id || tournamentId)), actionLabel: 'Ver resumen' });
  return { kpis, checks, readiness: calculateTournamentReadiness(checks), alerts, todayMatches, agendaError: null, publication: { delegates: Boolean(tournament?.fixture_visible_to_delegates), public: Boolean(tournament?.fixture_visible_to_public), state: getFixturePublicationState(tournament?.fixture_visible_to_delegates, tournament?.fixture_visible_to_public) } };
}

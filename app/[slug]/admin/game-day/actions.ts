'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { getClientIdBySlug } from '@/app/lib/tenant';
import { adminCategoryModulePath } from '../operations/routes';
import { getMatchReadiness, getOperationalMatchState, sortGameDayMatches, type GameDayMatch } from './types';
import { evaluatePlayerEligibility } from '@/app/lib/competition/player-eligibility';

type Result = { success: true; data: { tournament: { id: string; name: string }; date: string; matches: GameDayMatch[] } } | { success: false; error: string };

export async function getGameDay(slug: string, tournamentId: string, date: string): Promise<Result> {
  if (!(await hasAdminSession(slug))) return { success: false, error: 'Sesión administrativa no válida.' };
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) return { success: false, error: 'Institución no encontrada.' };
  const supabase = createServerSupabaseAdminClient();
  const { data: tournament, error: tournamentError } = await supabase.from('tournaments').select('id, name').eq('id', tournamentId).eq('client_id', clientId).maybeSingle();
  if (tournamentError || !tournament) return { success: false, error: 'El torneo no pertenece a esta institución.' };
  const { data: matches, error } = await supabase.from('matches').select('id,status,scheduled_time,venue,home_score,away_score,matchdays!inner(round_number,scheduled_date,category_id,categories!inner(name,tournament_id)),home_team:teams!home_team_id(id,name,schools(logo_url)),away_team:teams!away_team_id(id,name,schools(logo_url))').eq('matchdays.categories.tournament_id', tournamentId).eq('matchdays.scheduled_date', date).neq('status', 'BYE').order('scheduled_time', { ascending: true });
  if (error) return { success: false, error: 'No fue posible cargar la agenda de Game Day.' };
  const ids = (matches || []).map((match: any) => match.id);
  const { data: accesses } = ids.length ? await supabase.from('scorekeeper_match_access').select('match_id, scorekeeper_users(name, role)').in('match_id', ids) : { data: [] };
  const teamIds = (matches || []).flatMap((match: any) => [match.home_team?.id, match.away_team?.id]).filter(Boolean);
  const [{ data: players }, { data: events }] = teamIds.length ? await Promise.all([
    supabase.from('players').select('id, team_id, player_documents(document_type, status)').in('team_id', teamIds),
    supabase.from('match_events').select('player_id, event_type, fine_status').in('match_id', ids),
  ]) : [{ data: [] }, { data: [] }];
  const blockedPlayers = new Set((events || []).filter((event: any) => event.event_type === 'RED' || event.fine_status === 'UNPAID').map((event: any) => event.player_id).filter(Boolean));
  const integrityByTeam = new Map<string, { eligible: number; warnings: number; ineligible: number }>();
  (players || []).forEach((player: any) => {
    const eligibility = evaluatePlayerEligibility({ playerId: player.id, registered: true, teamId: player.team_id, documents: player.player_documents || [], suspended: blockedPlayers.has(player.id) });
    const current = integrityByTeam.get(player.team_id) || { eligible: 0, warnings: 0, ineligible: 0 };
    if (eligibility.status === 'ELIGIBLE') current.eligible += 1; else if (eligibility.status === 'INELIGIBLE') current.ineligible += 1; else current.warnings += 1;
    integrityByTeam.set(player.team_id, current);
  });
  const byMatch = new Map<string, string>();
  (accesses || []).forEach((access: any) => { if (access.scorekeeper_users?.name) byMatch.set(access.match_id, access.scorekeeper_users.name); });
  const mapped = (matches || []).map((match: any): GameDayMatch => {
    const state = getOperationalMatchState(match.status);
    const scorekeeper = byMatch.get(match.id) || null;
    const homeTeam = match.home_team?.name || null;
    const awayTeam = match.away_team?.name || null;
    const readiness = getMatchReadiness({ homeTeam, awayTeam, venue: match.venue, scheduledTime: match.scheduled_time, scorekeeper, state });
    const categoryId = match.matchdays?.category_id || '';
    const homeIntegrity = integrityByTeam.get(match.home_team?.id) || { eligible: 0, warnings: 0, ineligible: 0 };
    const awayIntegrity = integrityByTeam.get(match.away_team?.id) || { eligible: 0, warnings: 0, ineligible: 0 };
    const integrity = { eligible: homeIntegrity.eligible + awayIntegrity.eligible, warnings: homeIntegrity.warnings + awayIntegrity.warnings, ineligible: homeIntegrity.ineligible + awayIntegrity.ineligible };
    const integrityAlerts = integrity.ineligible ? [`${integrity.ineligible} jugador${integrity.ineligible === 1 ? '' : 'es'} no habilitado${integrity.ineligible === 1 ? '' : 's'}`] : integrity.warnings ? [`${integrity.warnings} jugador${integrity.warnings === 1 ? '' : 'es'} requieren revisión`] : [];
    return { id: match.id, status: match.status, state, readiness: readiness.readiness, alerts: [...readiness.alerts, ...integrityAlerts], scheduledTime: match.scheduled_time, venue: match.venue, categoryName: match.matchdays?.categories?.name || 'Categoría', roundNumber: match.matchdays?.round_number ?? null, homeTeam: homeTeam || 'Por definir', awayTeam: awayTeam || 'Por definir', homeLogo: match.home_team?.schools?.logo_url || null, awayLogo: match.away_team?.schools?.logo_url || null, homeScore: match.home_score, awayScore: match.away_score, scorekeeper, integrity, hrefs: { mesa: `${adminCategoryModulePath(slug, 'mesa', tournamentId, categoryId)}&from=game-day&date=${encodeURIComponent(date)}`, planilla: `/${slug}/admin/planillas?cat=${encodeURIComponent(categoryId)}&tournament=${encodeURIComponent(tournamentId)}`, resultado: `/${slug}/resultados?tournament=${encodeURIComponent(tournamentId)}`, tv: '/tv' } };
  });
  return { success: true, data: { tournament, date, matches: sortGameDayMatches(mapped) } };
}

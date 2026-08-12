'use server';

import { hasAdminSession } from '@/app/lib/auth';
import { logAuditEvent } from '@/app/lib/audit';
import { getMatchScoreForStandings, getResultPoints, getSportRules, compareTeamsForStandings } from '@/app/lib/sports/rules';
import { generateGroupStage, generatePlacementFinals, generateRoundRobin, seedTwoGroups, type GeneratedRound } from '@/app/lib/tournaments/three-stage';
import { createServerSupabaseAdminClient } from '@/app/lib/supabase/server';
import { categoryBelongsToClientSlug, getClientIdBySlug } from '@/app/lib/tenant';

type StageResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

async function authorize(slug: string, categoryId: string) {
  if (!(await hasAdminSession(slug))) return null;
  if (!(await categoryBelongsToClientSlug(categoryId, slug))) return null;
  return { supabase: createServerSupabaseAdminClient(), clientId: await getClientIdBySlug(slug) };
}

async function insertStageFixture(supabase: ReturnType<typeof createServerSupabaseAdminClient>, categoryId: string, stageId: string, rounds: GeneratedRound[], roundOffset: number) {
  for (const round of rounds) {
    const { data: matchday, error } = await supabase.from('matchdays').insert({
      category_id: categoryId,
      stage_id: stageId,
      round_number: roundOffset + round.roundNumber,
      scheduled_date: null,
      is_open: true,
    }).select('id').single();
    if (error || !matchday) throw new Error('No se pudo crear una jornada de la fase.');
    const { error: matchesError } = await supabase.from('matches').insert(round.matches.map((match) => ({
      matchday_id: matchday.id,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      status: 'SCHEDULED',
      venue: 'Por definir',
      match_type: match.matchType,
      group_name: match.groupName || null,
      leg: match.leg,
    })));
    if (matchesError) throw new Error('No se pudieron crear los partidos de la fase.');
  }
}

async function rankStage(supabase: ReturnType<typeof createServerSupabaseAdminClient>, stageId: string, groupName?: string) {
  const { data: entries } = await supabase.from('stage_team_entries').select('team_id, teams(id, name, fair_play_points)').eq('stage_id', stageId);
  const filteredEntries = groupName
    ? await supabase.from('stage_team_entries').select('team_id, teams(id, name, fair_play_points)').eq('stage_id', stageId).eq('group_name', groupName)
    : { data: entries };
  const { data: stage } = await supabase.from('competition_stages').select('categories(sports(name))').eq('id', stageId).single();
  const rules = getSportRules((stage as any)?.categories?.sports?.name);
  const stats = new Map<string, any>();
  for (const entry of filteredEntries.data || []) {
    const team = entry.teams as any;
    if (team) stats.set(entry.team_id, { ...team, played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0 });
  }
  const { data: matches } = await supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score, home_sets, away_sets, status, matchdays!inner(stage_id)').eq('matchdays.stage_id', stageId).eq('status', 'FINISHED');
  for (const match of matches || []) {
    const home = stats.get(match.home_team_id); const away = stats.get(match.away_team_id);
    if (!home || !away) continue;
    const score = getMatchScoreForStandings(match, rules); const points = getResultPoints(score.home, score.away, rules);
    home.played++; away.played++; home.points += points.home; away.points += points.away;
    if (score.countsForScoreColumns) { home.goals_for += score.home; home.goals_against += score.away; away.goals_for += score.away; away.goals_against += score.home; }
    if (score.home > score.away) { home.won++; away.lost++; } else if (score.away > score.home) { away.won++; home.lost++; } else { home.drawn++; away.drawn++; }
  }
  return [...stats.values()].sort((a, b) => compareTeamsForStandings(a, b, rules));
}

async function ensureStageComplete(supabase: ReturnType<typeof createServerSupabaseAdminClient>, stageId: string) {
  const { count } = await supabase.from('matches').select('id, matchdays!inner(stage_id)', { count: 'exact', head: true }).eq('matchdays.stage_id', stageId).neq('status', 'FINISHED');
  return count === 0;
}

export async function getThreeStageStatus(slug: string, categoryId: string): Promise<StageResult<any>> {
  const auth = await authorize(slug, categoryId); if (!auth) return { success: false, error: 'Acceso no autorizado.' };
  const { data: category } = await auth.supabase.from('categories').select('id, tournaments(tournament_format)').eq('id', categoryId).single();
  const { data: stages } = await auth.supabase.from('competition_stages').select('id, stage_number, name, stage_type, status, legs, completed_at, stage_team_entries(team_id, group_name, seed, final_position, teams(name))').eq('category_id', categoryId).order('stage_number');
  const active = (stages || []).find((stage) => stage.status === 'ACTIVE');
  const standings = active?.stage_type === 'GROUPS'
    ? { A: await rankStage(auth.supabase, active.id, 'A'), B: await rankStage(auth.supabase, active.id, 'B') }
    : active ? { GENERAL: await rankStage(auth.supabase, active.id) } : {};
  return { success: true, data: { enabled: (category as any)?.tournaments?.tournament_format === 'THREE_STAGE_35', stages: stages || [], standings } };
}

export async function startThreeStageTournament(slug: string, categoryId: string): Promise<StageResult> {
  const auth = await authorize(slug, categoryId); if (!auth) return { success: false, error: 'Acceso no autorizado.' };
  const { data: category } = await auth.supabase.from('categories').select('id, tournaments!inner(tournament_format)').eq('id', categoryId).single();
  if ((category as any)?.tournaments?.tournament_format !== 'THREE_STAGE_35') return { success: false, error: 'La categoría no usa el formato de tres fases.' };
  const { data: teams } = await auth.supabase.from('teams').select('id').eq('category_id', categoryId).order('name');
  if (teams?.length !== 8) return { success: false, error: 'La fase 1 requiere exactamente 8 equipos.' };
  const { count } = await auth.supabase.from('competition_stages').select('id', { count: 'exact', head: true }).eq('category_id', categoryId);
  if (count) return { success: false, error: 'Las fases ya fueron inicializadas.' };
  const { data: stage, error } = await auth.supabase.from('competition_stages').insert({ category_id: categoryId, stage_number: 1, name: 'Fase 1 · Todos vs todos', stage_type: 'LEAGUE', status: 'ACTIVE', legs: 1 }).select('id').single();
  if (error || !stage) return { success: false, error: 'No se pudo crear la fase 1.' };
  await auth.supabase.from('stage_team_entries').insert(teams.map((team) => ({ stage_id: stage.id, team_id: team.id })));
  try { await insertStageFixture(auth.supabase, categoryId, stage.id, generateRoundRobin(teams, 1), 0); } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo generar la fase 1.' }; }
  await logAuditEvent({ action: 'admin.stage.start', actorType: 'client', clientId: auth.clientId, targetType: 'category', targetId: categoryId, metadata: { slug, stage: 1 } });
  return { success: true, data: undefined };
}

export async function advanceThreeStageTournament(slug: string, categoryId: string): Promise<StageResult> {
  const auth = await authorize(slug, categoryId); if (!auth) return { success: false, error: 'Acceso no autorizado.' };
  const { data: active } = await auth.supabase.from('competition_stages').select('id, stage_number').eq('category_id', categoryId).eq('status', 'ACTIVE').maybeSingle();
  if (!active) return { success: false, error: 'No hay una fase activa.' };
  if (!(await ensureStageComplete(auth.supabase, active.id))) return { success: false, error: 'Todos los partidos de la fase deben estar finalizados.' };
  if (active.stage_number === 3) {
    const { data: finalMatches } = await auth.supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score, home_sets, away_sets, match_type, matchdays!inner(stage_id), home_team:teams!home_team_id(categories(sports(name)))').eq('matchdays.stage_id', active.id).eq('status', 'FINISHED');
    for (const match of finalMatches || []) {
      const rules = getSportRules((match as any)?.home_team?.categories?.sports?.name);
      const score = getMatchScoreForStandings(match, rules);
      if (score.home === score.away) return { success: false, error: 'Las finales deben tener un ganador definido antes de cerrar el torneo.' };
      const winnerId = score.home > score.away ? match.home_team_id : match.away_team_id;
      const loserId = score.home > score.away ? match.away_team_id : match.home_team_id;
      const winnerPosition = match.match_type === 'GOLD_FINAL' ? 1 : 3;
      await auth.supabase.from('stage_team_entries').update({ final_position: winnerPosition }).eq('stage_id', active.id).eq('team_id', winnerId);
      await auth.supabase.from('stage_team_entries').update({ final_position: winnerPosition + 1 }).eq('stage_id', active.id).eq('team_id', loserId);
    }
    await auth.supabase.from('competition_stages').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', active.id);
    await logAuditEvent({ action: 'admin.stage.complete', actorType: 'client', clientId: auth.clientId, targetType: 'category', targetId: categoryId, metadata: { slug, stage: 3 } });
    return { success: true, data: undefined };
  }
  if (active.stage_number === 1) {
    const ranked = await rankStage(auth.supabase, active.id);
    if (ranked.length !== 8) return { success: false, error: 'No fue posible resolver los ocho clasificados.' };
    const seeded = seedTwoGroups(ranked.map((team) => team.id));
    const { data: next } = await auth.supabase.from('competition_stages').insert({ category_id: categoryId, stage_number: 2, name: 'Fase 2 · Grupos ida y vuelta', stage_type: 'GROUPS', status: 'ACTIVE', legs: 2 }).select('id').single();
    if (!next) return { success: false, error: 'No se pudo crear la fase 2.' };
    await auth.supabase.from('stage_team_entries').insert(seeded.map((team) => ({ stage_id: next.id, team_id: team.id, group_name: team.groupName, seed: team.seed, qualified_from_position: team.seed })));
    await insertStageFixture(auth.supabase, categoryId, next.id, generateGroupStage(seeded), 100);
  } else {
    const groupA = await rankStage(auth.supabase, active.id, 'A'); const groupB = await rankStage(auth.supabase, active.id, 'B');
    const finalists = [groupA[0], groupA[1], groupB[0], groupB[1]];
    if (finalists.some((team) => !team)) return { success: false, error: 'No fue posible resolver los finalistas.' };
    const { data: next } = await auth.supabase.from('competition_stages').insert({ category_id: categoryId, stage_number: 3, name: 'Fase 3 · Finales Oro y Plata', stage_type: 'FINALS', status: 'ACTIVE', legs: 1 }).select('id').single();
    if (!next) return { success: false, error: 'No se pudo crear la fase final.' };
    await auth.supabase.from('stage_team_entries').insert(finalists.map((team, index) => ({ stage_id: next.id, team_id: team.id, group_name: index < 2 ? 'A' : 'B', seed: (index % 2) + 1 })));
    await insertStageFixture(auth.supabase, categoryId, next.id, generatePlacementFinals(groupA.map((team) => team.id), groupB.map((team) => team.id)), 200);
  }
  await auth.supabase.from('competition_stages').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', active.id);
  await logAuditEvent({ action: 'admin.stage.advance', actorType: 'client', clientId: auth.clientId, targetType: 'category', targetId: categoryId, metadata: { slug, fromStage: active.stage_number, toStage: active.stage_number + 1 } });
  return { success: true, data: undefined };
}

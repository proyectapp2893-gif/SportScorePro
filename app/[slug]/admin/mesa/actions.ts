'use server';

import { getScorekeeperSession, hasAdminSession } from '@/app/lib/auth';
import { createPrivilegedSupabaseClient } from '@/app/lib/supabase/server';
import { logAuditEvent, type AuditActorType } from '@/app/lib/audit';
import { getClientIdBySlug } from '@/app/lib/tenant';

type RecordFootballEventInput = {
  slug: string;
  matchId: string;
  teamId: string;
  playerId?: string | null;
  eventType: 'GOAL' | 'YELLOW' | 'RED' | 'SUB' | 'SCORE_ADJUST' | 'ASSIST' | 'MVP';
  period: string;
  matchSecond?: number | null;
  minuteRecord?: number | null;
  scoreDelta?: number;
  fairPlayDelta?: number;
  generatedRed?: boolean;
  subOutPlayerId?: string | null;
};

type FinishFootballMatchInput = {
  slug: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  currentPeriod: string;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
};

type ApplyFootballWalkoverInput = {
  slug: string;
  matchId: string;
  absentTeamId: string;
  noShowPenalty?: number;
};

type ResetCountdownClockInput = {
  slug: string;
  matchId: string;
  duration: number;
  period?: string | null;
};

type CountdownClockInput = {
  slug: string;
  matchId: string;
  duration?: number | null;
};

type ResetElapsedClockInput = {
  slug: string;
  matchId: string;
  period?: string | null;
};

type StartMatchInput = {
  slug: string;
  matchId: string;
  period: string;
  lineups?: Array<{ playerId: string; teamId: string; period?: string }>;
  resetScores?: boolean;
};

type RecordGenericEventInput = {
  slug: string;
  matchId: string;
  teamId: string;
  playerId?: string | null;
  eventType: string;
  period: string;
  minuteRecord?: number | null;
  matchSecond?: number | null;
  scoreDelta?: number;
  subOutPlayerId?: string | null;
};

type ChangePeriodInput = {
  slug: string;
  matchId: string;
  period: string;
};

type RevertScoringEventInput = {
  slug: string;
  matchId: string;
  teamId: string;
  period?: string | null;
  updateMatchScore?: boolean;
};

type CloseSetInput = {
  slug: string;
  matchId: string;
  homeSets: number;
  awaySets: number;
  setHistory: Array<{ period: string; home: number; away: number }>;
  nextPeriod: string;
};

type FinishCourtMatchInput = {
  slug: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  sport: 'basketball' | 'volleyball' | 'softball';
  setHistory?: Array<{ period: string; home: number; away: number }>;
};

async function requireMatchAccess(slug: string, matchId: string) {
  const clientId = await getClientIdBySlug(slug);
  if (!clientId) throw new Error('Cliente no encontrado.');

  const supabase = createPrivilegedSupabaseClient();

  const isAdmin = await hasAdminSession(slug);
  if (!isAdmin) {
    const scorekeeperId = await getScorekeeperSession(slug);
    if (!scorekeeperId) throw new Error('Sesión operativa inválida.');

    const { data: assignedMatch, error: accessError } = await supabase
      .from('scorekeeper_match_access')
      .select(`
        match_id,
        scorekeeper_users!inner(id, client_id, is_active)
      `)
      .eq('scorekeeper_user_id', scorekeeperId)
      .eq('match_id', matchId)
      .eq('scorekeeper_users.client_id', clientId)
      .eq('scorekeeper_users.is_active', true)
      .maybeSingle();

    if (accessError || !assignedMatch) {
      throw new Error('No tienes permiso para operar este partido.');
    }
  }

  const { data, error } = await supabase
    .from('matches')
    .select(`
      id, status, home_team_id, away_team_id, home_score, away_score,
      matchdays!inner(categories!inner(tournaments!inner(client_id)))
    `)
    .eq('id', matchId)
    .eq('matchdays.categories.tournaments.client_id', clientId)
    .maybeSingle();

  if (error || !data) throw new Error('El partido no pertenece a este cliente.');

  const actorType: AuditActorType = isAdmin ? 'client' : 'scorekeeper';

  return {
    clientId,
    actorType,
    match: data as {
      id: string;
      status: string | null;
      home_team_id: string;
      away_team_id: string;
      home_score: number | null;
      away_score: number | null;
    },
  };
}

function assertMatchTeam(teamId: string, match: { home_team_id: string; away_team_id: string }) {
  if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
    throw new Error('El equipo no pertenece al partido.');
  }
}

export async function getFootballMatchRoster(slug: string, matchId: string) {
  const { match } = await requireMatchAccess(slug, matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { data: players, error } = await supabase
    .from('players')
    .select('id, team_id, name, shirt_number, birth_year, birth_date, identity_number, vinculo, relationship_detail, player_documents(document_type)')
    .in('team_id', [match.home_team_id, match.away_team_id])
    .order('shirt_number', { ascending: true });
  if (error) throw new Error('No se pudo cargar la nómina inscrita para este partido.');

  const playerIds = (players || []).map((player) => player.id);
  const suspendedPlayers: Record<string, boolean> = {};
  if (playerIds.length > 0) {
    const { data: unpaidFines } = await supabase.from('match_events').select('player_id').in('player_id', playerIds).eq('fine_status', 'UNPAID');
    (unpaidFines || []).forEach((event) => { if (event.player_id) suspendedPlayers[event.player_id] = true; });
  }

  return {
    home: (players || []).filter((player) => player.team_id === match.home_team_id),
    away: (players || []).filter((player) => player.team_id === match.away_team_id),
    suspendedPlayers,
  };
}

export async function recordFootballMatchEvent(input: RecordFootballEventInput) {
  const { match } = await requireMatchAccess(input.slug, input.matchId);
  assertMatchTeam(input.teamId, match);

  const supabase = createPrivilegedSupabaseClient();
  if (input.eventType === 'MVP') {
    const { error: replaceMvpError } = await supabase
      .from('match_events')
      .delete()
      .eq('match_id', input.matchId)
      .eq('event_type', 'MVP');
    if (replaceMvpError) throw new Error('No se pudo actualizar el MVP del partido.');
  }
  const { data, error } = await supabase.rpc('sportscore_record_match_event', {
    p_match_id: input.matchId,
    p_team_id: input.teamId,
    p_player_id: input.playerId ?? null,
    p_event_type: input.eventType,
    p_period: input.period,
    p_match_second: input.matchSecond ?? null,
    p_minute_record: input.minuteRecord ?? null,
    p_score_delta: input.scoreDelta ?? 0,
    p_fair_play_delta: input.fairPlayDelta ?? 0,
    p_generated_red: input.generatedRed ?? false,
    p_sub_out_player_id: input.subOutPlayerId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { home_score?: number; away_score?: number; inserted_events?: number };
}

export async function finishFootballMatch(input: FinishFootballMatchInput) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_finish_football_match', {
    p_match_id: input.matchId,
    p_home_score: input.homeScore,
    p_away_score: input.awayScore,
    p_current_period: input.currentPeriod,
    p_home_penalty_score: input.homePenaltyScore ?? null,
    p_away_penalty_score: input.awayPenaltyScore ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { already_finished?: boolean; home_points?: number; away_points?: number };
}

export async function applyFootballWalkover(input: ApplyFootballWalkoverInput) {
  const { match } = await requireMatchAccess(input.slug, input.matchId);
  assertMatchTeam(input.absentTeamId, match);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_apply_football_walkover', {
    p_match_id: input.matchId,
    p_absent_team_id: input.absentTeamId,
    p_no_show_penalty: input.noShowPenalty ?? 500,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as { already_finished?: boolean; home_score?: number; away_score?: number };
}

export async function startCountdownClock(input: CountdownClockInput) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_start_countdown_clock', {
    p_match_id: input.matchId,
    p_duration: input.duration ?? null,
  });

  if (error) throw new Error(error.message);
  return data as CountdownClockResult;
}

export async function pauseCountdownClock(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_pause_countdown_clock', {
    p_match_id: input.matchId,
  });

  if (error) throw new Error(error.message);
  return data as CountdownClockResult;
}

export async function resetCountdownClock(input: ResetCountdownClockInput) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_reset_countdown_clock', {
    p_match_id: input.matchId,
    p_duration: input.duration,
    p_period: input.period ?? null,
  });

  if (error) throw new Error(error.message);
  return data as CountdownClockResult;
}

export async function startElapsedClock(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_start_elapsed_clock', {
    p_match_id: input.matchId,
  });

  if (error) throw new Error(error.message);
  return data as ElapsedClockResult;
}

export async function pauseElapsedClock(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_pause_elapsed_clock', {
    p_match_id: input.matchId,
  });

  if (error) throw new Error(error.message);
  return data as ElapsedClockResult;
}

export async function resetElapsedClock(input: ResetElapsedClockInput) {
  await requireMatchAccess(input.slug, input.matchId);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_reset_elapsed_clock', {
    p_match_id: input.matchId,
    p_period: input.period ?? null,
  });

  if (error) throw new Error(error.message);
  return data as ElapsedClockResult;
}

export async function startFootballTimer(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.rpc('start_match_timer', { p_match_id: input.matchId });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function pauseFootballTimer(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.rpc('pause_match_timer', { p_match_id: input.matchId });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function resetFootballTimer(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.rpc('reset_match_timer', { p_match_id: input.matchId });
  if (error) throw new Error(error.message);

  const { error: updateError } = await supabase
    .from('matches')
    .update({
      is_timer_running: false,
      timer_start_time: null,
      timer_accumulated_seconds: 0,
      match_phase: 'REGULAR',
    })
    .eq('id', input.matchId);
  if (updateError) throw new Error(updateError.message);

  return { success: true };
}

export async function endFootballTimer(input: Omit<CountdownClockInput, 'duration'>) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.rpc('end_match_timer', { p_match_id: input.matchId });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function autoStopFootballTimer(input: CountdownClockInput) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.rpc('auto_stop_regular_time', {
    p_match_id: input.matchId,
    p_duration: input.duration ?? 2400,
  });
  if (error) throw new Error(error.message);
  return { success: true };
}

export async function startLiveMatch(input: StartMatchInput) {
  const { clientId, match, actorType } = await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const lineupEvents = (input.lineups || []).map((lineup) => {
    assertMatchTeam(lineup.teamId, match);
    return {
      player_id: lineup.playerId,
      team_id: lineup.teamId,
      period: lineup.period || '0',
    };
  });

  const { error } = await supabase.rpc('sportscore_start_live_match', {
    p_match_id: input.matchId,
    p_period: input.period,
    p_reset_scores: input.resetScores ?? false,
    p_lineups: lineupEvents,
  });
  if (error) throw new Error(error.message);

  if (match.status !== 'LIVE') {
    const { error: clockResetError } = await supabase
      .from('matches')
      .update({
        is_timer_running: false,
        timer_start_time: null,
        timer_accumulated_seconds: 0,
        match_phase: 'REGULAR',
        current_period: input.period,
      })
      .eq('id', input.matchId);
    if (clockResetError) throw new Error(clockResetError.message);
  }

  await logAuditEvent({
    action: 'admin.match.start',
    actorType,
    clientId,
    targetType: 'match',
    targetId: input.matchId,
    metadata: { slug: input.slug, period: input.period, lineups: lineupEvents.length },
  });

  return { success: true };
}

export async function changeMatchPeriod(input: ChangePeriodInput) {
  const { clientId, actorType } = await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase.from('matches').update({ current_period: input.period }).eq('id', input.matchId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: 'admin.match.period_change',
    actorType,
    clientId,
    targetType: 'match',
    targetId: input.matchId,
    metadata: { slug: input.slug, period: input.period },
  });

  return { success: true };
}

export async function recordGenericMatchEvent(input: RecordGenericEventInput) {
  const { match } = await requireMatchAccess(input.slug, input.matchId);
  assertMatchTeam(input.teamId, match);

  const allowedEvents = new Set(['GOAL', 'BASKET_1', 'BASKET_2', 'BASKET_3', 'FOUL', 'TIMEOUT', 'YELLOW', 'RED', 'SUB', 'SCORE_ADJUST']);
  if (!allowedEvents.has(input.eventType)) throw new Error('Evento no permitido.');

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_record_match_event', {
    p_match_id: input.matchId,
    p_team_id: input.teamId,
    p_player_id: input.playerId ?? null,
    p_event_type: input.eventType,
    p_period: input.period,
    p_match_second: input.matchSecond ?? null,
    p_minute_record: input.minuteRecord ?? null,
    p_score_delta: input.scoreDelta ?? 0,
    p_fair_play_delta: 0,
    p_generated_red: false,
    p_sub_out_player_id: input.subOutPlayerId ?? null,
  });

  if (error) throw new Error(error.message);
  return data as { home_score?: number; away_score?: number; inserted_events?: number };
}

export async function revertLastScoringEvent(input: RevertScoringEventInput) {
  const { match } = await requireMatchAccess(input.slug, input.matchId);
  assertMatchTeam(input.teamId, match);

  const supabase = createPrivilegedSupabaseClient();
  const { data, error } = await supabase.rpc('sportscore_revert_last_scoring_event', {
    p_match_id: input.matchId,
    p_team_id: input.teamId,
    p_period: input.period ?? null,
    p_update_match_score: input.updateMatchScore ?? true,
  });

  if (error) throw new Error(error.message);
  return data as { success?: boolean; error?: string; home_score?: number; away_score?: number };
}

export async function closeVolleyballSet(input: CloseSetInput) {
  await requireMatchAccess(input.slug, input.matchId);
  const supabase = createPrivilegedSupabaseClient();
  const { error } = await supabase
    .from('matches')
    .update({
      home_score: input.homeSets,
      away_score: input.awaySets,
      away_sets: JSON.stringify(input.setHistory),
      current_period: input.nextPeriod,
    })
    .eq('id', input.matchId);

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function finishCourtMatch(input: FinishCourtMatchInput) {
  const { clientId, match, actorType } = await requireMatchAccess(input.slug, input.matchId);
  if (match.status === 'FINISHED') return { alreadyFinished: true };

  const supabase = createPrivilegedSupabaseClient();
  const homeScore = Math.max(0, input.homeScore || 0);
  const awayScore = Math.max(0, input.awayScore || 0);
  const { error } = await supabase.rpc('sportscore_finish_court_match', {
    p_match_id: input.matchId,
    p_home_score: homeScore,
    p_away_score: awayScore,
    p_sport: input.sport,
    p_set_history: input.setHistory || null,
  });

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: 'admin.match.finish',
    actorType,
    clientId,
    targetType: 'match',
    targetId: input.matchId,
    metadata: { slug: input.slug, sport: input.sport, homeScore, awayScore },
  });

  return { success: true };
}

type CountdownClockResult = {
  is_timer_running?: boolean;
  timer_accumulated_seconds?: number;
  match_duration_seconds?: number;
  remaining_seconds?: number;
};

type ElapsedClockResult = {
  is_timer_running?: boolean;
  timer_accumulated_seconds?: number;
  elapsed_seconds?: number;
};

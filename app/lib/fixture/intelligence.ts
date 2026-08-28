export type FixtureIssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

export type FixtureIssue = {
  severity: FixtureIssueSeverity;
  code: string;
  message: string;
  matchIds?: string[];
  teamId?: string;
  venue?: string | null;
  date?: string | null;
};

export type FixtureAnalysisMatch = {
  id: string;
  status?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  scheduled_time?: string | null;
  venue?: string | null;
  home_team?: { id?: string | null; name?: string | null } | null;
  away_team?: { id?: string | null; name?: string | null } | null;
  matchdays?: { round_number?: number | null; scheduled_date?: string | null } | null;
};

export type FixtureAnalysisTeam = { id: string; name: string };

export type TeamFixtureMetrics = {
  teamId: string;
  teamName: string;
  matches: number;
  byes: number;
  minimumRestMinutes: number | null;
  maximumRestMinutes: number | null;
  averageRestMinutes: number | null;
  venues: Record<string, number>;
  slots: Record<string, number>;
};

export type FixtureAnalysis = {
  status: 'READY' | 'WARNING' | 'ERROR';
  score: null;
  issues: FixtureIssue[];
  metrics: {
    matches: number;
    teams: number;
    matchdays: number;
    errors: number;
    warnings: number;
    byes: number;
    minimumRestMinutes: number | null;
  };
  teamMetrics: TeamFixtureMetrics[];
  venueMetrics: Record<string, number>;
};

const matchDateTime = (match: FixtureAnalysisMatch) => {
  const date = match.matchdays?.scheduled_date;
  const time = match.scheduled_time;
  if (!date || !time) return null;
  const value = new Date(`${date}T${String(time).slice(0, 8)}`).getTime();
  return Number.isNaN(value) ? null : value;
};

const teamName = (id: string, teams: FixtureAnalysisTeam[], match: FixtureAnalysisMatch) =>
  teams.find((team) => team.id === id)?.name ||
  (match.home_team?.id === id ? match.home_team.name : match.away_team?.name) || id;

/** Pure, non-mutating analysis of an already generated fixture. */
export function analyzeFixture(matches: FixtureAnalysisMatch[], teams: FixtureAnalysisTeam[], options?: { requiresVenue?: boolean; minimumRestMinutes?: number }) : FixtureAnalysis {
  const issues: FixtureIssue[] = [];
  const regularMatches = matches.filter((match) => match.status !== 'BYE');
  const byeMatches = matches.filter((match) => match.status === 'BYE');
  const teamSchedules = new Map<string, FixtureAnalysisMatch[]>();
  const venueUsage: Record<string, number> = {};
  const slotTeams = new Map<string, FixtureAnalysisMatch[]>();
  const slotVenues = new Map<string, FixtureAnalysisMatch[]>();

  for (const match of regularMatches) {
    const date = match.matchdays?.scheduled_date || null;
    const time = match.scheduled_time || null;
    const slot = date && time ? `${date}|${String(time).slice(0, 8)}` : null;
    const venue = match.venue?.trim() || null;
    const teamIds = [match.home_team_id || match.home_team?.id, match.away_team_id || match.away_team?.id].filter(Boolean) as string[];
    if (!teamIds[0] || !teamIds[1]) issues.push({ severity: 'ERROR', code: 'INCOMPLETE_TEAMS', message: `Partido ${match.id} no tiene local y visitante definidos.`, matchIds: [match.id], date });
    if (!time) issues.push({ severity: 'ERROR', code: 'MISSING_TIME', message: `Partido ${match.id} no tiene horario asignado.`, matchIds: [match.id], date });
    if (options?.requiresVenue !== false && !venue) issues.push({ severity: 'ERROR', code: 'MISSING_VENUE', message: `Partido ${match.id} no tiene cancha asignada.`, matchIds: [match.id], date });
    if (!date) issues.push({ severity: 'ERROR', code: 'MISSING_MATCHDAY', message: `Partido ${match.id} no tiene jornada o fecha asignada.`, matchIds: [match.id] });
    for (const teamId of teamIds) {
      const schedule = teamSchedules.get(teamId) || [];
      schedule.push(match);
      teamSchedules.set(teamId, schedule);
    }
    if (slot) {
      const slotList = slotTeams.get(slot) || [];
      slotList.push(match);
      slotTeams.set(slot, slotList);
      if (venue) {
        const venueKey = `${slot}|${venue}`;
        const venueList = slotVenues.get(venueKey) || [];
        venueList.push(match);
        slotVenues.set(venueKey, venueList);
        venueUsage[venue] = (venueUsage[venue] || 0) + 1;
      }
    }
  }

  for (const [, slotMatches] of slotTeams) {
    const seen = new Map<string, FixtureAnalysisMatch[]>();
    for (const match of slotMatches) {
      for (const teamId of [match.home_team_id || match.home_team?.id, match.away_team_id || match.away_team?.id].filter(Boolean) as string[]) {
        const list = seen.get(teamId) || [];
        list.push(match);
        seen.set(teamId, list);
      }
    }
    for (const [teamId, conflicts] of seen) if (conflicts.length > 1) issues.push({ severity: 'ERROR', code: 'TEAM_CONFLICT', message: `${teamName(teamId, teams, conflicts[0])} aparece en ${conflicts.length} partidos incompatibles en el mismo horario.`, matchIds: conflicts.map((match) => match.id), teamId, date: conflicts[0].matchdays?.scheduled_date });
  }
  for (const [, venueMatches] of slotVenues) if (venueMatches.length > 1) issues.push({ severity: 'ERROR', code: 'VENUE_CONFLICT', message: `La cancha ${venueMatches[0].venue} está asignada a ${venueMatches.length} partidos incompatibles.`, matchIds: venueMatches.map((match) => match.id), venue: venueMatches[0].venue, date: venueMatches[0].matchdays?.scheduled_date });

  const teamMetrics: TeamFixtureMetrics[] = teams.map((team) => {
    const schedule = (teamSchedules.get(team.id) || []).sort((a, b) => (matchDateTime(a) || 0) - (matchDateTime(b) || 0));
    const rests: number[] = [];
    for (let index = 1; index < schedule.length; index += 1) {
      const previous = matchDateTime(schedule[index - 1]);
      const current = matchDateTime(schedule[index]);
      if (previous !== null && current !== null) rests.push(Math.round((current - previous) / 60000));
    }
    const venues: Record<string, number> = {};
    const slots: Record<string, number> = {};
    for (const match of schedule) { const venue = match.venue?.trim() || 'SIN CANCHA'; venues[venue] = (venues[venue] || 0) + 1; const slot = match.scheduled_time?.slice(0, 5) || 'SIN HORA'; slots[slot] = (slots[slot] || 0) + 1; }
    const minimum = rests.length ? Math.min(...rests) : null;
    if (options?.minimumRestMinutes && minimum !== null && minimum < options.minimumRestMinutes) issues.push({ severity: 'WARNING', code: 'SHORT_REST', message: `${team.name} tiene un descanso de ${minimum} minutos entre partidos.`, teamId: team.id });
    return { teamId: team.id, teamName: team.name, matches: schedule.length, byes: byeMatches.filter((match) => (match.home_team_id || match.home_team?.id) === team.id).length, minimumRestMinutes: minimum, maximumRestMinutes: rests.length ? Math.max(...rests) : null, averageRestMinutes: rests.length ? Math.round(rests.reduce((sum, value) => sum + value, 0) / rests.length) : null, venues, slots };
  });
  const rounds = new Set(regularMatches.map((match) => match.matchdays?.round_number).filter((round): round is number => typeof round === 'number'));
  const errors = issues.filter((issue) => issue.severity === 'ERROR').length;
  const warnings = issues.filter((issue) => issue.severity === 'WARNING').length;
  return { status: errors ? 'ERROR' : warnings ? 'WARNING' : 'READY', score: null, issues, metrics: { matches: regularMatches.length, teams: teams.length, matchdays: rounds.size, errors, warnings, byes: byeMatches.length, minimumRestMinutes: teamMetrics.flatMap((team) => team.minimumRestMinutes === null ? [] : [team.minimumRestMinutes]).sort((a, b) => a - b)[0] ?? null }, teamMetrics, venueMetrics: venueUsage };
}

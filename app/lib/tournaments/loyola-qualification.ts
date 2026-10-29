import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../sports/rules';

type RegularTeam = { id: string; fair_play_points: number | null };
type RegularMatch = {
  home_team_id: string;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_sets: number | null;
  away_sets: number | null;
  status: string;
};

export function rankLoyolaTeams(
  teams: RegularTeam[],
  matches: RegularMatch[],
  sportName: string | null | undefined,
  fairPlayEnabled: boolean,
  fairPlayStartingPoints: number,
) {
  if (!matches.length || matches.some((match) => match.status !== 'FINISHED' && match.status !== 'BYE')) {
    throw new Error('Finaliza todos los partidos de la fase regular antes de sortear grupos.');
  }
  const rules = getSportRules(sportName);
  const stats = new Map(teams.map((team) => [team.id, { ...team, played: 0, won: 0, goals_for: 0, goals_against: 0, points: 0 }]));
  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const home = stats.get(match.home_team_id);
    const away = match.away_team_id ? stats.get(match.away_team_id) : null;
    if (!home || !away) throw new Error('La fase regular contiene un equipo fuera de la categoría.');
    const score = getMatchScoreForStandings(match, rules);
    const points = getResultPoints(score.home, score.away, rules);
    home.played++; away.played++;
    home.points += points.home; away.points += points.away;
    if (score.countsForScoreColumns) {
      home.goals_for += score.home; home.goals_against += score.away;
      away.goals_for += score.away; away.goals_against += score.home;
    }
    if (score.home > score.away) home.won++;
    if (score.away > score.home) away.won++;
  }
  if ([...stats.values()].some((team) => team.played === 0)) throw new Error('Todos los equipos deben haber jugado en la fase regular.');
  return [...stats.values()].sort((a, b) => compareTeamsForStandings(a, b, rules, fairPlayEnabled, fairPlayStartingPoints));
}

export function selectLoyolaQualifiers(
  teams: RegularTeam[],
  matches: RegularMatch[],
  sportName: string | null | undefined,
  fairPlayEnabled: boolean,
  fairPlayStartingPoints: number,
) {
  if (teams.length < 8) throw new Error('El sorteo Loyola requiere al menos ocho equipos.');
  const ranked = rankLoyolaTeams(teams, matches, sportName, fairPlayEnabled, fairPlayStartingPoints);
  return { qualifiedIds: ranked.slice(0, 8).map((team) => team.id), eliminatedIds: ranked.slice(8).map((team) => team.id) };
}

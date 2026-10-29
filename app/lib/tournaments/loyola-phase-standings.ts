import { compareTeamsForStandings, getMatchScoreForStandings, getResultPoints, getSportRules } from '../sports/rules';

export type LoyolaGroupTeam = { id: string; name: string; group_name: string | null; fair_play_points?: number | null };
export type LoyolaGroupMatch = {
  id: string;
  round_number: number;
  status: string;
  home_team_id: string;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_sets?: number | null;
  away_sets?: number | null;
};
export type LoyolaCardEvent = {
  match_id: string; team_id: string; event_type: string;
  player_id?: string | null; created_at?: string | null; period?: string | null;
  match_second?: number | null; minute_record?: number | string | null;
};

export function calculateLoyolaFairPlayDeductions(
  matches: LoyolaGroupMatch[], cards: LoyolaCardEvent[], yellowDeduction: number, redDeduction: number,
) {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const deductions = new Map<string, number>();
  for (const card of cards) {
    const match = matchById.get(card.match_id);
    if (!match || !['LIVE', 'FINISHED'].includes(match.status) ||
      (card.team_id !== match.home_team_id && card.team_id !== match.away_team_id)) continue;
    // Mesa registra la segunda amarilla y la roja derivada en la misma jugada,
    // pero descuenta solo la roja en ese registro. Conservamos la primera amarilla.
    if (card.event_type === 'YELLOW' && card.player_id && cards.some((red) =>
      red.event_type === 'RED' && red.match_id === card.match_id && red.team_id === card.team_id && red.player_id === card.player_id &&
      ((red.created_at && card.created_at && red.created_at === card.created_at) ||
        (red.period && red.period === card.period && red.match_second != null && red.match_second === card.match_second &&
          String(red.minute_record ?? '') === String(card.minute_record ?? ''))))) continue;
    const value = card.event_type === 'RED' ? redDeduction : card.event_type === 'YELLOW' ? yellowDeduction : 0;
    deductions.set(card.team_id, (deductions.get(card.team_id) || 0) + value);
  }
  return deductions;
}

export function calculateLoyolaGroupStandings(
  teams: LoyolaGroupTeam[],
  matches: LoyolaGroupMatch[],
  cards: LoyolaCardEvent[],
  sportName: string | null | undefined,
  settings: { fairPlayEnabled: boolean; startingPoints: number; yellowDeduction: number; redDeduction: number },
) {
  const rules = getSportRules(sportName);
  const groupMatches = matches.filter((match) => match.round_number >= 101 && match.round_number <= 106);
  const byId = new Map(teams.filter((team) => team.group_name === 'A' || team.group_name === 'B').map((team) => [team.id, {
    ...team, fair_play_points: settings.startingPoints,
    played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, points: 0,
  }]));

  for (const match of groupMatches) {
    if (match.status !== 'FINISHED') continue;
    const home = byId.get(match.home_team_id);
    const away = match.away_team_id ? byId.get(match.away_team_id) : null;
    if (!home || !away || home.group_name !== away.group_name) continue;
    const score = getMatchScoreForStandings(match, rules);
    const points = getResultPoints(score.home, score.away, rules);
    home.played++; away.played++;
    home.points += points.home; away.points += points.away;
    if (score.countsForScoreColumns) {
      home.goals_for += score.home; home.goals_against += score.away;
      away.goals_for += score.away; away.goals_against += score.home;
    }
    if (score.home > score.away) { home.won++; away.lost++; }
    else if (score.away > score.home) { away.won++; home.lost++; }
    else { home.drawn++; away.drawn++; }
  }

  if (settings.fairPlayEnabled) {
    const deductions = calculateLoyolaFairPlayDeductions(groupMatches, cards, settings.yellowDeduction, settings.redDeduction);
    for (const team of byId.values()) team.fair_play_points -= deductions.get(team.id) || 0;
  }

  const sortGroup = (group: 'A' | 'B') => [...byId.values()].filter((team) => team.group_name === group)
    .sort((a, b) => compareTeamsForStandings(a, b, rules, settings.fairPlayEnabled, settings.startingPoints) || a.name.localeCompare(b.name, 'es'));
  return { A: sortGroup('A'), B: sortGroup('B') };
}

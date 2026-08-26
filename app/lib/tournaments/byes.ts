type FixtureTeam = {
  id: string;
  name?: string | null;
  schools?: unknown;
};

type FixtureMatch = {
  id: string;
  status?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team?: FixtureTeam | null;
  away_team?: FixtureTeam | null;
  matchdays?: {
    id?: string;
    category_id?: string;
    round_number?: number;
    scheduled_date?: string | null;
  } | null;
};

export function inferMissingTeamByes<T>(matches: T[], teams: FixtureTeam[]) {
  const regularRounds = new Map<number, T[]>();

  for (const match of matches) {
    const fixtureMatch = match as FixtureMatch;
    const round = fixtureMatch.matchdays?.round_number;
    if (!round || round >= 100) continue;
    const roundMatches = regularRounds.get(round) || [];
    roundMatches.push(match);
    regularRounds.set(round, roundMatches);
  }

  const inferred = Array.from(regularRounds.entries()).flatMap(([round, roundMatches]) => {
    const participatingIds = new Set(roundMatches.flatMap((match) => {
      const fixtureMatch = match as FixtureMatch;
      return [fixtureMatch.home_team_id, fixtureMatch.away_team_id];
    }).filter(Boolean));
    const matchday = (roundMatches[0] as FixtureMatch | undefined)?.matchdays;

    return teams.filter((team) => !participatingIds.has(team.id)).map((team) => ({
      id: `inferred-bye-${matchday?.id || round}-${team.id}`,
      status: 'BYE',
      home_score: 0,
      away_score: 0,
      home_sets: null,
      away_sets: null,
      scheduled_time: null,
      venue: 'Descansa',
      home_team_id: team.id,
      away_team_id: null,
      home_team: team,
      away_team: null,
      matchdays: matchday,
      inferred: true,
    }));
  });

  if (regularRounds.size <= 1) return inferred;
  const inferredCountByTeam = new Map<string, number>();
  inferred.forEach((match) => inferredCountByTeam.set(match.home_team_id, (inferredCountByTeam.get(match.home_team_id) || 0) + 1));
  return inferred.filter((match) => inferredCountByTeam.get(match.home_team_id) !== regularRounds.size);
}

export function findTeamsMissingFromEveryRegularRound<T>(matches: T[], teams: FixtureTeam[]) {
  const regularMatches = matches.map((match) => match as FixtureMatch).filter((match) => {
    const round = match.matchdays?.round_number;
    return Boolean(round && round < 100);
  });
  const rounds = new Set(regularMatches.map((match) => match.matchdays?.round_number));
  if (rounds.size <= 1) return [];
  const participatingIds = new Set(regularMatches.flatMap((match) => [match.home_team_id, match.away_team_id]).filter(Boolean));
  return teams.filter((team) => !participatingIds.has(team.id));
}

export function generateBalancedRoundRobin<T extends { id: string }>(teams: T[], firstByeTeamId?: string) {
  const shuffled = [...teams];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (shuffled.length % 2 !== 0) {
    const preferredIndex = shuffled.findIndex((team) => team.id === firstByeTeamId);
    if (preferredIndex >= 0) [shuffled[0], shuffled[preferredIndex]] = [shuffled[preferredIndex], shuffled[0]];
  }

  const rotating: Array<T | null> = shuffled.length % 2 === 0 ? shuffled : [...shuffled, null];
  const rounds: Array<Array<{ home: T | null; away: T | null }>> = [];
  for (let round = 0; round < rotating.length - 1; round += 1) {
    const pairs: Array<{ home: T | null; away: T | null }> = [];
    for (let index = 0; index < rotating.length / 2; index += 1) {
      const first = rotating[index];
      const second = rotating[rotating.length - 1 - index];
      pairs.push(round % 2 === 1 && index === 0 ? { home: second, away: first } : { home: first, away: second });
    }
    rounds.push(pairs);
    rotating.splice(1, 0, rotating.pop() || null);
  }
  return rounds;
}

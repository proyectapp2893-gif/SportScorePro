export type SportKind =
  | 'soccer'
  | 'basketball'
  | 'volleyball'
  | 'baseball'
  | 'racket'
  | 'golf'
  | 'generic';

export type ClockMode = 'countup' | 'countdown' | 'none';

export type StandingsTiebreaker = 'points' | 'fair_play' | 'ratio' | 'win_pct' | 'goal_diff' | 'score_for';

export type SportRules = {
  kind: SportKind;
  canonicalName: string;
  aliases: string[];
  clockMode: ClockMode;
  defaultPeriod: string;
  periods: string[];
  defaultPeriodDurationSeconds: number | null;
  allowsDraw: boolean;
  usesSetsAsScore: boolean;
  usesPenaltySets: boolean;
  resultPoints: {
    win: number;
    draw: number;
    loss: number;
  };
  standingsTiebreakers: StandingsTiebreaker[];
  scoreLabels: {
    for: string;
    against: string;
    scorerSingular: string;
    scorerPlural: string;
  };
};

type MatchLike = {
  home_score?: number | null;
  away_score?: number | null;
  home_sets?: number | null;
  away_sets?: number | null;
};

type TeamStandingLike = {
  played?: number | null;
  won?: number | null;
  goals_for?: number | null;
  goals_against?: number | null;
  fair_play_points?: number | null;
  points?: number | null;
};

export const SPORT_RULES: Record<SportKind, SportRules> = {
  soccer: {
    kind: 'soccer',
    canonicalName: 'Futbol',
    aliases: ['FUTBOL', 'FUTBOL SALA', 'MICRO', 'MICROFUTBOL', 'SOCCER'],
    clockMode: 'countup',
    defaultPeriod: '1T',
    periods: ['1T', '2T', 'PEN'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: true,
    usesSetsAsScore: false,
    usesPenaltySets: true,
    resultPoints: { win: 3, draw: 1, loss: 0 },
    standingsTiebreakers: ['points', 'fair_play', 'goal_diff', 'score_for'],
    scoreLabels: { for: 'GF', against: 'GC', scorerSingular: 'Gol', scorerPlural: 'Goles' },
  },
  basketball: {
    kind: 'basketball',
    canonicalName: 'Baloncesto',
    aliases: ['BALONCESTO', 'BASKET', 'BASKETBALL'],
    clockMode: 'countdown',
    defaultPeriod: 'Q1',
    periods: ['Q1', 'Q2', 'Q3', 'Q4', 'TE'],
    defaultPeriodDurationSeconds: 600,
    allowsDraw: false,
    usesSetsAsScore: false,
    usesPenaltySets: false,
    resultPoints: { win: 2, draw: 1, loss: 1 },
    standingsTiebreakers: ['points', 'fair_play', 'ratio', 'score_for'],
    scoreLabels: { for: 'PF', against: 'PC', scorerSingular: 'Punto', scorerPlural: 'Puntos' },
  },
  volleyball: {
    kind: 'volleyball',
    canonicalName: 'Voleibol',
    aliases: ['VOLEIBOL', 'VOLEY', 'VOLLEY', 'VOLLEYBALL'],
    clockMode: 'none',
    defaultPeriod: 'S1',
    periods: ['S1', 'S2', 'S3', 'S4', 'S5'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: false,
    usesSetsAsScore: true,
    usesPenaltySets: false,
    resultPoints: { win: 2, draw: 1, loss: 1 },
    standingsTiebreakers: ['points', 'fair_play', 'ratio', 'score_for'],
    scoreLabels: { for: 'PF', against: 'PC', scorerSingular: 'Punto', scorerPlural: 'Puntos' },
  },
  baseball: {
    kind: 'baseball',
    canonicalName: 'Beisbol / Softbol',
    aliases: ['BEISBOL', 'BASEBALL', 'SOFTBOL', 'SOFTBALL'],
    clockMode: 'countup',
    defaultPeriod: 'INN 1',
    periods: ['INN 1', 'INN 2', 'INN 3', 'INN 4', 'INN 5', 'INN 6', 'INN 7', 'EXTRA'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: false,
    usesSetsAsScore: false,
    usesPenaltySets: false,
    resultPoints: { win: 3, draw: 1, loss: 0 },
    standingsTiebreakers: ['points', 'fair_play', 'win_pct', 'score_for'],
    scoreLabels: { for: 'CF', against: 'CC', scorerSingular: 'Carrera', scorerPlural: 'Carreras' },
  },
  racket: {
    kind: 'racket',
    canonicalName: 'Raqueta',
    aliases: ['TENIS', 'PADEL', 'TENIS DE MESA', 'PING PONG'],
    clockMode: 'none',
    defaultPeriod: 'S1',
    periods: ['S1', 'S2', 'S3', 'S4', 'S5'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: false,
    usesSetsAsScore: true,
    usesPenaltySets: false,
    resultPoints: { win: 2, draw: 1, loss: 1 },
    standingsTiebreakers: ['points', 'fair_play', 'ratio', 'score_for'],
    scoreLabels: { for: 'PF', against: 'PC', scorerSingular: 'Punto', scorerPlural: 'Puntos' },
  },
  golf: {
    kind: 'golf',
    canonicalName: 'Golf',
    aliases: ['GOLF'],
    clockMode: 'none',
    defaultPeriod: 'R1',
    periods: ['R1'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: true,
    usesSetsAsScore: false,
    usesPenaltySets: false,
    resultPoints: { win: 3, draw: 1, loss: 0 },
    standingsTiebreakers: ['points', 'fair_play', 'score_for'],
    scoreLabels: { for: 'PF', against: 'PC', scorerSingular: 'Punto', scorerPlural: 'Puntos' },
  },
  generic: {
    kind: 'generic',
    canonicalName: 'Generico',
    aliases: [],
    clockMode: 'none',
    defaultPeriod: '1',
    periods: ['1'],
    defaultPeriodDurationSeconds: null,
    allowsDraw: true,
    usesSetsAsScore: false,
    usesPenaltySets: false,
    resultPoints: { win: 3, draw: 1, loss: 0 },
    standingsTiebreakers: ['points', 'fair_play', 'goal_diff', 'score_for'],
    scoreLabels: { for: 'GF', against: 'GC', scorerSingular: 'Anotacion', scorerPlural: 'Anotaciones' },
  },
};

export function normalizeSportName(sportName?: string | null) {
  return (sportName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function getSportKind(sportName?: string | null): SportKind {
  const normalizedName = normalizeSportName(sportName);

  if (!normalizedName) return 'generic';

  const orderedKinds: SportKind[] = ['basketball', 'volleyball', 'baseball', 'racket', 'golf', 'soccer'];
  return orderedKinds.find((kind) => SPORT_RULES[kind].aliases.some((alias) => normalizedName.includes(alias))) || 'generic';
}

export function getSportRules(sportName?: string | null): SportRules {
  return SPORT_RULES[getSportKind(sportName)];
}

export const isSoccerSport = (sportName?: string | null) => getSportKind(sportName) === 'soccer';
export const isBasketballSport = (sportName?: string | null) => getSportKind(sportName) === 'basketball';
export const isVolleyballSport = (sportName?: string | null) => getSportKind(sportName) === 'volleyball';
export const isBaseballSport = (sportName?: string | null) => getSportKind(sportName) === 'baseball';
export const isRacketSport = (sportName?: string | null) => getSportKind(sportName) === 'racket';
export const isSetBasedSport = (sportName?: string | null) => getSportRules(sportName).usesSetsAsScore;

export function getMatchScoreForStandings(match: MatchLike, rules: SportRules) {
  if (rules.usesSetsAsScore) {
    return {
      home: match.home_sets || 0,
      away: match.away_sets || 0,
      isPenaltyScore: false,
      countsForScoreColumns: false,
    };
  }

  if (rules.usesPenaltySets && match.home_sets !== null && match.home_sets !== undefined && match.away_sets !== null && match.away_sets !== undefined) {
    return {
      home: match.home_sets || 0,
      away: match.away_sets || 0,
      isPenaltyScore: true,
      countsForScoreColumns: false,
    };
  }

  return {
    home: match.home_score || 0,
    away: match.away_score || 0,
    isPenaltyScore: false,
    countsForScoreColumns: true,
  };
}

export function getResultPoints(homeScore: number, awayScore: number, rules: SportRules) {
  if (homeScore > awayScore) {
    return { home: rules.resultPoints.win, away: rules.resultPoints.loss };
  }

  if (awayScore > homeScore) {
    return { home: rules.resultPoints.loss, away: rules.resultPoints.win };
  }

  return { home: rules.resultPoints.draw, away: rules.resultPoints.draw };
}

export function compareTeamsForStandings(
  a: TeamStandingLike,
  b: TeamStandingLike,
  rules: SportRules,
  fairPlayEnabled = false,
  fpStartingPoints = 0,
) {
  if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);

  if (fairPlayEnabled) {
    const fpA = a.fair_play_points ?? fpStartingPoints;
    const fpB = b.fair_play_points ?? fpStartingPoints;
    if (fpB !== fpA) return fpB - fpA;
  }

  const aFor = a.goals_for || 0;
  const aAgainst = a.goals_against || 0;
  const bFor = b.goals_for || 0;
  const bAgainst = b.goals_against || 0;

  if (rules.standingsTiebreakers.includes('ratio')) {
    const ratioA = aAgainst === 0 ? aFor : aFor / aAgainst;
    const ratioB = bAgainst === 0 ? bFor : bFor / bAgainst;
    if (ratioB !== ratioA) return ratioB - ratioA;
  }

  if (rules.standingsTiebreakers.includes('win_pct')) {
    const pctA = a.played ? (a.won || 0) / a.played : 0;
    const pctB = b.played ? (b.won || 0) / b.played : 0;
    if (pctB !== pctA) return pctB - pctA;
  }

  if (rules.standingsTiebreakers.includes('goal_diff')) {
    const diffB = bFor - bAgainst;
    const diffA = aFor - aAgainst;
    if (diffB !== diffA) return diffB - diffA;
  }

  return bFor - aFor;
}

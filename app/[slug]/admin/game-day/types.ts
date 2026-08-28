export type OperationalMatchState = 'LIVE' | 'UPCOMING' | 'FINISHED' | 'UNKNOWN';
export type MatchReadiness = 'READY' | 'WARNING' | 'BLOCKED';

export type GameDayMatch = {
  id: string;
  status: string;
  state: OperationalMatchState;
  readiness: MatchReadiness;
  alerts: string[];
  scheduledTime: string | null;
  venue: string | null;
  categoryName: string;
  roundNumber: number | null;
  homeTeam: string;
  awayTeam: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scorekeeper: string | null;
  hrefs: { mesa: string; planilla: string; resultado: string; tv: string };
  integrity?: { eligible: number; warnings: number; ineligible: number };
};

export function getOperationalMatchState(status: string | null | undefined): OperationalMatchState {
  if (status === 'LIVE') return 'LIVE';
  if (status === 'FINISHED') return 'FINISHED';
  if (status === 'SCHEDULED' || status === 'READY') return 'UPCOMING';
  return 'UNKNOWN';
}

export function getMatchReadiness(input: { homeTeam?: string | null; awayTeam?: string | null; venue?: string | null; scheduledTime?: string | null; scorekeeper?: string | null; state: OperationalMatchState }): { readiness: MatchReadiness; alerts: string[] } {
  const alerts: string[] = [];
  if (!input.homeTeam || !input.awayTeam) alerts.push('Faltan equipos definidos');
  if (!input.venue) alerts.push('Sin cancha asignada');
  if (!input.scheduledTime) alerts.push('Sin horario asignado');
  if (!input.scorekeeper) alerts.push('Sin planillero asignado');
  if (input.state === 'UNKNOWN') alerts.push('Estado de partido no reconocido');
  if (!input.homeTeam || !input.awayTeam || input.state === 'UNKNOWN') return { readiness: 'BLOCKED', alerts };
  return { readiness: alerts.length ? 'WARNING' : 'READY', alerts };
}

export function sortGameDayMatches(matches: GameDayMatch[]) {
  const rank: Record<OperationalMatchState, number> = { LIVE: 0, UPCOMING: 1, FINISHED: 2, UNKNOWN: 3 };
  return [...matches].sort((a, b) => rank[a.state] - rank[b.state] || ((a.scheduledTime || '').localeCompare(b.scheduledTime || '')) || (a.venue || '').localeCompare(b.venue || '') || a.id.localeCompare(b.id));
}
